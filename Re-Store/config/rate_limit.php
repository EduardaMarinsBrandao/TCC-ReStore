<?php
// config/rate_limit.php
// Proteção contra Denial of Service (D): Rate Limiting e limite de tamanho de payload

if (!function_exists('getRateLimitClientKey')) {
    /**
     * Monta uma chave única e segura para o bucket de rate limit.
     *
     * @param string $bucket
     * @param int|null $userId
     * @return string
     */
    function getRateLimitClientKey($bucket, $userId = null) {
        if (function_exists('getClientIp')) {
            $ip = getClientIp();
        } else {
            $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        }

        $identity = $userId !== null ? 'u_' . (int)$userId : 'ip_' . $ip;
        return hash('sha256', $bucket . '|' . $identity);
    }
}

if (!function_exists('enforceRateLimit')) {
    /**
     * Aplica limite de requisições por janela de tempo (sliding window simples por arquivo).
     * Retorna HTTP 429 Too Many Requests se o limite for excedido.
     *
     * @param string $bucket Identificador da rota/ação (ex: 'auth_login', 'api_read')
     * @param int $maxRequests Máximo de requisições permitidas na janela
     * @param int $windowSeconds Duração da janela em segundos
     * @param int|null $userId ID do usuário autenticado (opcional)
     * @return void
     */
    function enforceRateLimit($bucket, $maxRequests = 60, $windowSeconds = 60, $userId = null) {
        // Em testes CLI isolados, só aplica se explicitamente habilitado via env/header
        if (PHP_SAPI === 'cli' && getenv('RESTORE_TEST_RATE_LIMIT') !== '1' && !isset($_SERVER['HTTP_X_TEST_RATE_LIMIT'])) {
            return;
        }

        $dir = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'restore_ratelimit';
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }

        $key = getRateLimitClientKey($bucket, $userId);
        $filePath = $dir . DIRECTORY_SEPARATOR . $key . '.json';
        $now = time();
        $cutoff = $now - $windowSeconds;

        $fp = @fopen($filePath, 'c+');
        if ($fp === false) {
            // Falha ao abrir arquivo temporário não deve derrubar o site
            return;
        }

        if (@flock($fp, LOCK_EX)) {
            $raw = stream_get_contents($fp);
            $timestamps = [];
            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    foreach ($decoded as $ts) {
                        $tsInt = (int)$ts;
                        if ($tsInt > $cutoff) {
                            $timestamps[] = $tsInt;
                        }
                    }
                }
            }

            if (count($timestamps) >= $maxRequests) {
                $oldest = min($timestamps);
                $retryAfter = max(1, ($oldest + $windowSeconds) - $now);
                @flock($fp, LOCK_UN);
                @fclose($fp);

                if (!headers_sent()) {
                    http_response_code(429);
                    header('Content-Type: application/json; charset=utf-8');
                    header('Retry-After: ' . $retryAfter);
                }
                echo json_encode([
                    'success' => false,
                    'error' => 'Muitas requisições. Aguarde ' . $retryAfter . ' segundos e tente novamente.'
                ]);
                exit;
            }

            $timestamps[] = $now;
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode(array_values($timestamps)));
            fflush($fp);
            @flock($fp, LOCK_UN);
        }

        @fclose($fp);
    }
}

if (!function_exists('enforceMaxPayloadSize')) {
    /**
     * Impede payloads JSON/POST excessivamente grandes que possam causar exaustão de memória (DoS).
     * Não bloqueia multipart/form-data (que possui validação por arquivo de 5MB).
     *
     * @param int $maxBytes Tamanho máximo em bytes (padrão 1 MB)
     * @return void
     */
    function enforceMaxPayloadSize($maxBytes = 1048576) {
        $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
        if (strpos($contentType, 'multipart/form-data') !== false) {
            return;
        }

        $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
        if ($contentLength > $maxBytes) {
            if (!headers_sent()) {
                http_response_code(413);
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode([
                'success' => false,
                'error' => 'O tamanho da requisição excede o limite permitido.'
            ]);
            exit;
        }
    }
}
