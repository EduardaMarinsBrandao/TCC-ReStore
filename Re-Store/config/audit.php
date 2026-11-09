<?php
// config/audit.php
// Central de Auditoria, Rastreabilidade e Não-Repúdio do Re-Store

if (!defined('RESTORE_AUDIT_INITIALIZED')) {
    define('RESTORE_AUDIT_INITIALIZED', true);

    // Padronização de timezone em UTC para logs e auditoria forense
    if (function_exists('date_default_timezone_set')) {
        @date_default_timezone_set('UTC');
    }
}

/**
 * Obtém o endereço IP real do cliente com tratamento para proxies e cabeçalhos de encaminhamento
 *
 * @return string
 */
function getClientIp() {
    $ipKeys = [
        'HTTP_CF_CONNECTING_IP', // Cloudflare
        'HTTP_X_FORWARDED_FOR',  // Proxies / Load Balancers
        'HTTP_X_FORWARDED',
        'HTTP_X_CLUSTER_CLIENT_IP',
        'HTTP_FORWARDED_FOR',
        'HTTP_FORWARDED',
        'HTTP_CLIENT_IP',
        'REMOTE_ADDR'
    ];

    foreach ($ipKeys as $key) {
        if (!empty($_SERVER[$key])) {
            $raw = (string)$_SERVER[$key];
            // Se houver múltiplos IPs (ex: "cliente, proxy1, proxy2"), pega o primeiro
            $parts = explode(',', $raw);
            foreach ($parts as $ip) {
                $ip = trim($ip);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
    }

    return '127.0.0.1';
}

/**
 * Obtém o User-Agent da requisição atual com corte seguro de tamanho
 *
 * @param int $maxLength
 * @return string
 */
function getClientUserAgent($maxLength = 255) {
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? trim((string)$_SERVER['HTTP_USER_AGENT']) : 'Unknown';
    if ($ua === '') {
        $ua = 'Unknown';
    }
    if (mb_strlen($ua, 'UTF-8') > $maxLength) {
        $ua = mb_substr($ua, 0, $maxLength, 'UTF-8');
    }
    return $ua;
}

/**
 * Registra um evento imutável na tabela de auditoria (audit_logs)
 *
 * @param PDO $db Conexão ativa com o banco de dados
 * @param int|null $userId ID do usuário responsável pela ação (ou null)
 * @param string $action Identificador da ação realizada (ex: 'login', 'create_product')
 * @param array|string|null $details Metadados adicionais do evento
 * @return bool
 */
function writeAuditLog($db, $userId, $action, $details = null) {
    if (!$db instanceof PDO) {
        return false;
    }

    try {
        $ip = getClientIp();
        $ua = getClientUserAgent();
        $action = trim((string)$action);

        $detailsStr = null;
        if (is_array($details) || is_object($details)) {
            $detailsStr = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } elseif ($details !== null) {
            $detailsStr = (string)$details;
        }

        $userIdVal = ($userId && (int)$userId > 0) ? (int)$userId : null;

        $stmt = $db->prepare("
            INSERT INTO audit_logs (user_id, action, details, ip_address, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");
        return $stmt->execute([$userIdVal, $action, $detailsStr, $ip, $ua]);
    } catch (Exception $e) {
        // Logging defensivo: falhas de log não devem interromper o fluxo da aplicação
        return false;
    }
}

/**
 * Preserva uma cópia forense indelével de uma avaliação antes de sua remoção/descarte,
 * garantindo o não-repúdio mesmo após a exclusão do catálogo público.
 *
 * @param PDO $db
 * @param int $reviewId
 * @param int $deletedByUserId
 * @return bool
 */
function archiveReviewForAudit($db, $reviewId, $deletedByUserId) {
    if (!$db instanceof PDO || (int)$reviewId <= 0) {
        return false;
    }

    try {
        // 1. Buscar a avaliação existente
        $rStmt = $db->prepare("SELECT * FROM reviews WHERE id = ?");
        $rStmt->execute([(int)$reviewId]);
        $review = $rStmt->fetch();
        if (!$review) {
            return false;
        }

        // 2. Buscar fotos anexadas à avaliação
        $imgs = [];
        try {
            $imgStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ?");
            $imgStmt->execute([(int)$reviewId]);
            $imgs = $imgStmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {}

        $imagesJson = !empty($imgs) ? json_encode($imgs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
        $ip = getClientIp();
        $ua = getClientUserAgent();

        // 3. Inserir na tabela de auditoria permanente audit_reviews
        $stmt = $db->prepare("
            INSERT INTO audit_reviews (
                original_review_id,
                product_id,
                user_id,
                order_id,
                rating,
                comment,
                images_json,
                deleted_by_user_id,
                ip_address,
                user_agent,
                deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ");

        $stmt->execute([
            (int)$review['id'],
            (int)$review['product_id'],
            (int)$review['user_id'],
            !empty($review['order_id']) ? (int)$review['order_id'] : null,
            (int)$review['rating'],
            (string)($review['comment'] ?? ''),
            $imagesJson,
            (int)$deletedByUserId,
            $ip,
            $ua
        ]);

        // 4. Registrar também em audit_logs
        writeAuditLog($db, $deletedByUserId, 'review_deleted', [
            'original_review_id' => (int)$review['id'],
            'product_id' => (int)$review['product_id'],
            'author_user_id' => (int)$review['user_id'],
            'rating' => (int)$review['rating']
        ]);

        return true;
    } catch (Exception $e) {
        return false;
    }
}
