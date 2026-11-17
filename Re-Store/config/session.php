<?php
// config/session.php
// Inicialização centralizada e segura das sessões PHP do Re-Store.

// Padronização rigorosa de fuso horário em UTC para todo o ecossistema do Re-Store
if (function_exists('date_default_timezone_set')) {
    @date_default_timezone_set('UTC');
}

/**
 * Emite cabeçalhos de segurança HTTP padrão contra MIME sniffing, clickjacking e vazamento de referrer.
 */
function sendSecurityHeaders() {
    if (headers_sent()) {
        return;
    }
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), payment=(), usb=()');
    header('X-Permitted-Cross-Domain-Policies: none');
}

/**
 * Gera ou retorna o token CSRF único armazenado na sessão atual.
 */
function getCsrfToken() {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return '';
    }
    if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Valida proteção Same-Origin (Origin/Referer) e token CSRF em requisições mutáveis.
 */
function verifySameOriginAndCsrf() {
    static $alreadyChecked = false;
    if ($alreadyChecked) {
        return;
    }
    $alreadyChecked = true;

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if (!in_array($method, ['POST', 'PUT', 'DELETE', 'PATCH'], true)) {
        return;
    }

    $serverHostRaw = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost';
    $serverHost = strtolower((string)(parse_url('http://' . $serverHostRaw, PHP_URL_HOST) ?: explode(':', $serverHostRaw)[0]));

    $checkHeaderHost = function ($headerVal) use ($serverHost) {
        if (empty($headerVal)) {
            return true;
        }
        $parsedHost = parse_url((string)$headerVal, PHP_URL_HOST);
        if (!$parsedHost) {
            return false;
        }
        return hash_equals($serverHost, strtolower((string)$parsedHost));
    };

    if (!$checkHeaderHost($_SERVER['HTTP_ORIGIN'] ?? '') || !$checkHeaderHost($_SERVER['HTTP_REFERER'] ?? '')) {
        if (!headers_sent()) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false,
            'error' => 'Requisição bloqueada: origem cruzada (CSRF) não autorizada.'
        ]);
        exit;
    }

    $submittedToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf_token'] ?? null);
    $hasSessionToken = !empty($_SESSION['csrf_token']) && is_string($_SESSION['csrf_token']);

    if ($submittedToken !== null || (PHP_SAPI !== 'cli' && $hasSessionToken)) {
        if (!$hasSessionToken || !is_string($submittedToken) || !hash_equals($_SESSION['csrf_token'], $submittedToken)) {
            if (!headers_sent()) {
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode([
                'success' => false,
                'error' => 'Token de segurança (CSRF) inválido ou expirado. Recarregue a página.'
            ]);
            exit;
        }
    }
}

/**
 * Inicia a sessão com cookies endurecidos:
 *  - HttpOnly: o cookie não é acessível por JavaScript (mitiga roubo via XSS);
 *  - SameSite=Lax: reduz o risco de CSRF;
 *  - Secure: ativado automaticamente quando a requisição chega por HTTPS;
 *  - Modo estrito: recusa identificadores de sessão não gerados pelo servidor
 *    (mitiga fixação de sessão).
 */
function restoreStartSession() {
    sendSecurityHeaders();

    if (session_status() !== PHP_SESSION_NONE) {
        verifySameOriginAndCsrf();
        return;
    }

    if (function_exists('date_default_timezone_set')) {
        @date_default_timezone_set('UTC');
    }

    if (headers_sent()) {
        @session_start();
        verifySameOriginAndCsrf();
        return;
    }

    $forwardedProto = strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '');
    $isHttps = (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off')
        || strpos($forwardedProto, 'https') !== false
        || strtolower($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '') === 'on'
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;

    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.use_only_cookies', '1');
    @ini_set('session.cookie_httponly', '1');
    if ($isHttps) {
        @ini_set('session.cookie_secure', '1');
    }

    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    } else {
        session_set_cookie_params(0, '/; samesite=Lax', '', $isHttps, true);
    }

    @session_start();
    verifySameOriginAndCsrf();
}

/**
 * Regenera o identificador da sessão e rotaciona o token CSRF após uma
 * autenticação bem-sucedida, descartando o identificador anterior (previne fixação de sessão).
 */
function restoreRegenerateSession() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}

/**
 * Número máximo de tentativas incorretas de um código de verificação
 * antes de ele ser invalidado.
 */
if (!defined('VERIFICATION_MAX_ATTEMPTS')) {
    define('VERIFICATION_MAX_ATTEMPTS', 5);
}
