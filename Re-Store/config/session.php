<?php
// config/session.php
// Inicialização centralizada e segura das sessões PHP do Re-Store.

/**
 * Inicia a sessão com cookies endurecidos:
 *  - HttpOnly: o cookie não é acessível por JavaScript (mitiga roubo via XSS);
 *  - SameSite=Lax: reduz o risco de CSRF;
 *  - Secure: ativado automaticamente quando a requisição chega por HTTPS;
 *  - Modo estrito: recusa identificadores de sessão não gerados pelo servidor
 *    (mitiga fixação de sessão).
 */
function restoreStartSession() {
    if (session_status() !== PHP_SESSION_NONE) {
        return;
    }

    if (headers_sent()) {
        @session_start();
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
}

/**
 * Regenera o identificador da sessão após uma autenticação bem-sucedida,
 * descartando o identificador anterior (previne fixação de sessão).
 */
function restoreRegenerateSession() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}

/**
 * Número máximo de tentativas incorretas de um código de verificação
 * antes de ele ser invalidado.
 */
if (!defined('VERIFICATION_MAX_ATTEMPTS')) {
    define('VERIFICATION_MAX_ATTEMPTS', 5);
}
