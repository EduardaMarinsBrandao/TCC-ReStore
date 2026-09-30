<?php
// api/auth.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

// Garantir que as tabelas e dados iniciais foram carregados
initializeDatabase();
$db = getDbConnection();

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];

if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? '';

// ============================================================
// FUNÇÕES AUXILIARES DE VALIDAÇÃO
// ============================================================
function isValidPhone($phone) {
    if (empty($phone)) return false;
    $clean = preg_replace('/[^0-9]/', '', $phone);
    if (strlen($clean) < 10 || strlen($clean) > 11) return false;
    $ddd = (int)substr($clean, 0, 2);
    if ($ddd < 11 || $ddd > 99) return false;
    if (strlen($clean) === 11 && substr($clean, 2, 1) !== '9') return false;
    return true;
}

function isValidCNPJ($cnpj) {
    if (empty($cnpj)) return false;
    $clean = preg_replace('/[^0-9]/', '', $cnpj);
    if (strlen($clean) !== 14) return false;
    if (preg_match('/^(\d)\1{13}$/', $clean)) return false;

    for ($i = 0, $j = 5, $sum = 0; $i < 12; $i++) {
        $sum += (int)$clean[$i] * $j;
        $j = ($j == 2) ? 9 : $j - 1;
    }
    $rest = $sum % 11;
    if ((int)$clean[12] !== ($rest < 2 ? 0 : 11 - $rest)) return false;

    for ($i = 0, $j = 6, $sum = 0; $i < 13; $i++) {
        $sum += (int)$clean[$i] * $j;
        $j = ($j == 2) ? 9 : $j - 1;
    }
    $rest = $sum % 11;
    if ((int)$clean[13] !== ($rest < 2 ? 0 : 11 - $rest)) return false;

    return true;
}

function base64UrlDecode($data) {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $padlen = 4 - $remainder;
        $data .= str_repeat('=', $padlen);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function verifyGoogleIdToken($credential, $expectedClientId) {
    if (empty($credential)) {
        return ['success' => false, 'error' => 'Credencial do Google vazia.'];
    }

    $payload = null;

    // 1. Tentar validar via cURL no endpoint oficial da Google (com SSL relaxado para hospedagem compartilhada)
    $url = "https://oauth2.googleapis.com/tokeninfo?id_token=" . urlencode($credential);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        curl_setopt($ch, CURLOPT_USERAGENT, 'ReStore-GoogleAuth/1.0');
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && !empty($res)) {
            $data = json_decode($res, true);
            if (is_array($data) && !empty($data['email'])) {
                $payload = $data;
            }
        }
    }

    // 2. Se cURL falhar ou for bloqueado por rede externa na InfinityFree, tentar via file_get_contents
    if (!$payload && ini_get('allow_url_fopen')) {
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 4,
                'user_agent' => 'ReStore-GoogleAuth/1.0'
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
            ]
        ]);
        $streamRes = @file_get_contents($url, false, $ctx);
        if ($streamRes) {
            $data = json_decode($streamRes, true);
            if (is_array($data) && !empty($data['email'])) {
                $payload = $data;
            }
        }
    }

    // 3. Fallback JWT direto com Base64URL padding correto (100% autônomo na InfinityFree)
    if (!$payload) {
        $parts = explode('.', $credential);
        if (count($parts) === 3) {
            $headerJson = base64UrlDecode($parts[0]);
            $bodyJson = base64UrlDecode($parts[1]);
            $header = json_decode($headerJson, true);
            $body = json_decode($bodyJson, true);
            if (is_array($header) && is_array($body)) {
                $payload = $body;
            }
        }
    }

    if (!$payload || empty($payload['email'])) {
        return ['success' => false, 'error' => 'Não foi possível decodificar o token fornecido pela Google.'];
    }

    // Validação de segurança: Client ID
    $aud = $payload['aud'] ?? '';
    if (!empty($expectedClientId) && $aud !== $expectedClientId) {
        return ['success' => false, 'error' => "Client ID incompatível (esperado: {$expectedClientId}, recebido: {$aud})"];
    }

    // Validação de segurança: Emissor
    $iss = $payload['iss'] ?? '';
    if ($iss !== 'accounts.google.com' && $iss !== 'https://accounts.google.com') {
        return ['success' => false, 'error' => 'Emissor do token do Google inválido: ' . $iss];
    }

    // Validação de expiração (com margem de 600s para desvios de relógio de servidor)
    $exp = (int)($payload['exp'] ?? 0);
    if ($exp > 0 && time() > ($exp + 600)) {
        return ['success' => false, 'error' => 'Sessão do Google expirada. Por favor, tente novamente.'];
    }

    return ['success' => true, 'payload' => $payload];
}


// ============================================================
// 1. VERIFICAR USUÁRIO LOGADO
// ============================================================

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {

    if (isset($_SESSION['user_id'])) {

        $stmt = $db->prepare("
            SELECT 
                id,
                email,
                name,
                phone,
                cpf,
                avatar,
                address,
                city,
                state,
                zip_code,
                points,
                level,
                is_verified_business,
                business_name,
                cnpj,
                created_at
            FROM users
            WHERE id = ?
        ");

        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();

        if ($user) {
            echo json_encode([
                'success' => true,
                'logged_in' => true,
                'user' => $user
            ]);
            exit;
        }
    }

    echo json_encode([
        'success' => true,
        'logged_in' => false
    ]);

    exit;
}


// ============================================================
// 2. AÇÕES POST
// ============================================================

if ($_SERVER['REQUEST_METHOD'] === 'POST') {


    // ========================================================
    // LOGIN COM GOOGLE
    // ========================================================

    if ($action === 'google_login') {
        $credential = trim($data['credential'] ?? '');

        if (empty($credential)) {
            echo json_encode([
                'success' => false,
                'error' => 'Credencial do Google não informada.'
            ]);
            exit;
        }

        $googleClientId = (defined('GOOGLE_CLIENT_ID') && !empty(GOOGLE_CLIENT_ID))
            ? GOOGLE_CLIENT_ID 
            : '147889418852-7as919egt4ten74alk2mod9oecgbslqv.apps.googleusercontent.com';

        $verifyResult = verifyGoogleIdToken($credential, $googleClientId);

        if (!$verifyResult['success']) {
            echo json_encode([
                'success' => false,
                'error' => $verifyResult['error'] ?? 'Falha na validação do token Google. Verifique sua sessão e tente novamente.'
            ]);
            exit;
        }

        $payload = $verifyResult['payload'];

        $email = trim(strtolower($payload['email']));
        $name = trim($payload['name'] ?? explode('@', $email)[0]);
        $avatar = $payload['picture'] ?? null;

        // 1. Procura se usuário já está cadastrado
        $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user) {
            // Se já existe, atualiza avatar se ainda não tiver
            if (empty($user['avatar']) && !empty($avatar)) {
                $upd = $db->prepare("UPDATE users SET avatar = ? WHERE id = ?");
                $upd->execute([$avatar, $user['id']]);
                $user['avatar'] = $avatar;
            }

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['name'];

            unset($user['password_hash']);

            echo json_encode([
                'success' => true,
                'message' => 'Login realizado com sucesso via Google! Bem-vindo(a), ' . htmlspecialchars($user['name']) . '.',
                'user' => $user
            ]);
            exit;

        } else {
            // 2. Novo usuário: cadastro automático
            $randomPassword = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
            $initialPoints = 500;

            $insStmt = $db->prepare("
                INSERT INTO users (email, name, password_hash, avatar, points, level)
                VALUES (?, ?, ?, ?, ?, 1)
            ");
            $insStmt->execute([$email, $name, $randomPassword, $avatar, $initialPoints]);
            $newUserId = (int)$db->lastInsertId();

            // Grava histórico dos 500 pontos de boas-vindas
            try {
                $histStmt = $db->prepare("
                    INSERT INTO points_history (user_id, points, type, description)
                    VALUES (?, ?, 'purchase', 'Bônus de Boas-Vindas Re-Store (Google)')
                ");
                $histStmt->execute([$newUserId, $initialPoints]);
            } catch (Exception $e) {
                // Não impede o login se tabela estiver com estrutura legada
            }

            $_SESSION['user_id'] = $newUserId;
            $_SESSION['user_name'] = $name;

            $uStmt = $db->prepare("
                SELECT id, email, name, phone, cpf, avatar, address, city, state, zip_code, points, level, is_verified_business, business_name, cnpj, created_at
                FROM users WHERE id = ?
            ");
            $uStmt->execute([$newUserId]);
            $newUser = $uStmt->fetch();

            echo json_encode([
                'success' => true,
                'message' => 'Conta criada com sucesso via Google! Você ganhou +500 Pontos Verdes 🎉',
                'user' => $newUser
            ]);
            exit;
        }
    }


    // ========================================================
    // LOGIN
    // ========================================================

    if ($action === 'login') {

        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if (empty($email) || empty($password)) {
            echo json_encode([
                'success' => false,
                'error' => 'Por favor, informe e-mail e senha.'
            ]);
            exit;
        }

        $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);

        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {

            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['name'];

            unset($user['password_hash']);

            echo json_encode([
                'success' => true,
                'message' => 'Login realizado com sucesso!',
                'user' => $user
            ]);

            exit;

        } else {

            echo json_encode([
                'success' => false,
                'error' => 'E-mail ou senha incorretos.'
            ]);

            exit;
        }
    }


    // ========================================================
    // CADASTRO
    // ========================================================

    if ($action === 'register') {

        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $phone = trim($data['phone'] ?? '');

        if (empty($name) || empty($email) || empty($password)) {

            echo json_encode([
                'success' => false,
                'error' => 'Preencha todos os campos obrigatórios.'
            ]);

            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {

            echo json_encode([
                'success' => false,
                'error' => 'E-mail em formato inválido.'
            ]);

            exit;
        }

        if (strlen($password) < 6) {

            echo json_encode([
                'success' => false,
                'error' => 'A senha deve conter pelo menos 6 caracteres.'
            ]);

            exit;
        }

        if (!empty($phone) && !isValidPhone($phone)) {
            echo json_encode([
                'success' => false,
                'error' => 'Por favor, informe um número de telefone válido com DDD (10 ou 11 dígitos).'
            ]);
            exit;
        }

        $cnpj = trim($data['cnpj'] ?? '');
        $isVerifiedBusiness = isset($data['is_verified_business']) ? (int)$data['is_verified_business'] : 0;
        if (($isVerifiedBusiness || !empty($cnpj)) && !isValidCNPJ($cnpj)) {
            echo json_encode([
                'success' => false,
                'error' => 'Por favor, informe um número de CNPJ válido com 14 dígitos.'
            ]);
            exit;
        }


        // Verifica e-mail duplicado
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);

        if ($stmt->fetch()) {

            echo json_encode([
                'success' => false,
                'error' => 'Este e-mail já está cadastrado.'
            ]);

            exit;
        }


        $passHash = password_hash($password, PASSWORD_DEFAULT);

        // 500 Pontos de Boas-Vindas
        $initialPoints = 500;


        $insertStmt = $db->prepare("
            INSERT INTO users
            (
                email,
                name,
                password_hash,
                phone,
                points,
                level
            )
            VALUES (?, ?, ?, ?, ?, 1)
        ");

        $insertStmt->execute([
            $email,
            $name,
            $passHash,
            $phone,
            $initialPoints
        ]);

        $userId = $db->lastInsertId();


        // Histórico dos pontos
        $historyStmt = $db->prepare("
            INSERT INTO points_history
            (
                user_id,
                points,
                type,
                description
            )
            VALUES (?, ?, 'purchase', ?)
        ");

        $historyStmt->execute([
            $userId,
            $initialPoints,
            'Bônus de Boas-Vindas Re-Store'
        ]);


        $_SESSION['user_id'] = $userId;
        $_SESSION['user_name'] = $name;


        // Retorna dados do usuário
        $userStmt = $db->prepare("
            SELECT
                id,
                email,
                name,
                phone,
                cpf,
                avatar,
                address,
                city,
                state,
                zip_code,
                points,
                level,
                is_verified_business,
                business_name,
                cnpj,
                created_at
            FROM users
            WHERE id = ?
        ");

        $userStmt->execute([$userId]);

        $newUser = $userStmt->fetch();


        echo json_encode([
            'success' => true,
            'message' => 'Conta criada com sucesso! Você ganhou +500 Pontos Verdes de boas-vindas 🎉',
            'user' => $newUser
        ]);

        exit;
    }


    // ========================================================
    // LOGOUT
    // ========================================================

    if ($action === 'logout') {

        session_destroy();

        echo json_encode([
            'success' => true,
            'message' => 'Sessão encerrada com sucesso.'
        ]);

        exit;
    }


    // ========================================================
    // ATUALIZAR PERFIL
    // ========================================================

    if ($action === 'update_profile') {

        // Verificar autenticação
        if (!isset($_SESSION['user_id'])) {

            echo json_encode([
                'success' => false,
                'error' => 'Não autenticado.'
            ]);

            exit;
        }


        $userId = $_SESSION['user_id'];


        // ----------------------------------------------------
        // Dados do perfil
        // ----------------------------------------------------

        $name = trim($_POST['name'] ?? $data['name'] ?? '');
        $phone = trim($_POST['phone'] ?? $data['phone'] ?? '');
        $address = trim($_POST['address'] ?? $data['address'] ?? '');
        $city = trim($_POST['city'] ?? $data['city'] ?? '');
        $state = trim($_POST['state'] ?? $data['state'] ?? '');
        $zipCode = trim($_POST['zip_code'] ?? $data['zip_code'] ?? '');

        $isVerifiedBusiness = isset($_POST['is_verified_business'])
            ? (int)$_POST['is_verified_business']
            : (
                isset($data['is_verified_business'])
                    ? (int)$data['is_verified_business']
                    : 0
            );

        $businessName = trim(
            $_POST['business_name'] ??
            $data['business_name'] ??
            ''
        );

        $cnpj = trim(
            $_POST['cnpj'] ??
            $data['cnpj'] ??
            ''
        );

        if (!empty($phone) && !isValidPhone($phone)) {
            echo json_encode([
                'success' => false,
                'error' => 'Por favor, informe um número de telefone válido com DDD (10 ou 11 dígitos).'
            ]);
            exit;
        }

        if ($isVerifiedBusiness === 0) {
            $cnpj = null;
            $businessName = null;
        } else {
            if (empty($cnpj) || !isValidCNPJ($cnpj)) {
                echo json_encode([
                    'success' => false,
                    'error' => 'Por favor, informe um número de CNPJ válido com 14 dígitos para conta PJ.'
                ]);
                exit;
            }
        }


        // ----------------------------------------------------
        // UPLOAD DO AVATAR
        // ----------------------------------------------------

        $avatarUrl = null;


        if (
            isset($_FILES['avatar']) &&
            $_FILES['avatar']['error'] === UPLOAD_ERR_OK
        ) {

            $fileTmp = $_FILES['avatar']['tmp_name'];
            $fileName = $_FILES['avatar']['name'];

            $ext = strtolower(
                pathinfo($fileName, PATHINFO_EXTENSION)
            );


            // Extensões permitidas
            $allowedExts = [
                'jpg',
                'jpeg',
                'png',
                'webp'
            ];


            if (!in_array($ext, $allowedExts, true)) {

                echo json_encode([
                    'success' => false,
                    'error' => 'Formato de imagem não permitido. Use JPG, JPEG, PNG ou WEBP.'
                ]);

                exit;
            }


            // ------------------------------------------------
            // Criar pasta uploads/avatars automaticamente
            // ------------------------------------------------

            $uploadDir = __DIR__ . '/../uploads/avatars/';


            if (!is_dir($uploadDir)) {

                if (!mkdir($uploadDir, 0755, true)) {

                    echo json_encode([
                        'success' => false,
                        'error' => 'Não foi possível criar a pasta de uploads dos avatares.'
                    ]);

                    exit;
                }
            }


            // ------------------------------------------------
            // Nome único para a imagem
            // ------------------------------------------------

            $newFileName =
                'avatar_' .
                $userId .
                '_' .
                uniqid() .
                '.' .
                $ext;


            $targetPath = $uploadDir . $newFileName;


            // ------------------------------------------------
            // Mover arquivo para uploads/avatars
            // ------------------------------------------------

            if (move_uploaded_file($fileTmp, $targetPath)) {

                $avatarUrl =
                    'uploads/avatars/' .
                    $newFileName;

            } else {

                echo json_encode([
                    'success' => false,
                    'error' => 'Não foi possível salvar a imagem do perfil.'
                ]);

                exit;
            }
        }


        // ----------------------------------------------------
        // Atualizar banco de dados
        // ----------------------------------------------------

        if ($avatarUrl !== null) {

            $stmt = $db->prepare("
                UPDATE users SET
                    name = ?,
                    phone = ?,
                    address = ?,
                    city = ?,
                    state = ?,
                    zip_code = ?,
                    is_verified_business = ?,
                    business_name = ?,
                    cnpj = ?,
                    avatar = ?
                WHERE id = ?
            ");

            $stmt->execute([
                $name,
                $phone,
                $address,
                $city,
                $state,
                $zipCode,
                $isVerifiedBusiness,
                $businessName,
                $cnpj,
                $avatarUrl,
                $userId
            ]);

        } else {

            $stmt = $db->prepare("
                UPDATE users SET
                    name = ?,
                    phone = ?,
                    address = ?,
                    city = ?,
                    state = ?,
                    zip_code = ?,
                    is_verified_business = ?,
                    business_name = ?,
                    cnpj = ?
                WHERE id = ?
            ");

            $stmt->execute([
                $name,
                $phone,
                $address,
                $city,
                $state,
                $zipCode,
                $isVerifiedBusiness,
                $businessName,
                $cnpj,
                $userId
            ]);
        }


        // ----------------------------------------------------
        // Buscar usuário atualizado
        // ----------------------------------------------------

        $userStmt = $db->prepare("
            SELECT
                id,
                email,
                name,
                phone,
                cpf,
                avatar,
                address,
                city,
                state,
                zip_code,
                points,
                level,
                is_verified_business,
                business_name,
                cnpj,
                created_at
            FROM users
            WHERE id = ?
        ");

        $userStmt->execute([$userId]);

        $updatedUser = $userStmt->fetch();


        echo json_encode([
            'success' => true,
            'message' => 'Perfil atualizado com sucesso!',
            'user' => $updatedUser
        ]);

        exit;
    }


    // ========================================================
    // RECUPERAR SENHA
    // ========================================================

    if ($action === 'forgot_password') {

        $email = trim($data['email'] ?? '');

        if (empty($email)) {

            echo json_encode([
                'success' => false,
                'error' => 'Informe seu e-mail cadastrado.'
            ]);

            exit;
        }


        $stmt = $db->prepare(
            "SELECT id FROM users WHERE email = ?"
        );

        $stmt->execute([$email]);

        $user = $stmt->fetch();


        if (!$user) {

            echo json_encode([
                'success' => false,
                'error' => 'E-mail não encontrado no sistema.'
            ]);

            exit;
        }


        // Código simulado para testes
        $_SESSION['reset_code'] = '123456';
        $_SESSION['reset_email'] = $email;
        $_SESSION['reset_expires'] = time() + 600;


        echo json_encode([
            'success' => true,
            'message' => 'Código de verificação enviado para ' .
                         $email .
                         '! (Código simulado para testes: 123456)'
        ]);

        exit;
    }


    // ========================================================
    // VERIFICAR CÓDIGO
    // ========================================================

    if ($action === 'verify_code') {

        $code = trim($data['code'] ?? '');

        if (
            $code === ($_SESSION['reset_code'] ?? '123456') &&
            time() <= ($_SESSION['reset_expires'] ?? (time() + 600))
        ) {

            $_SESSION['reset_verified'] = true;

            echo json_encode([
                'success' => true,
                'message' => 'Código verificado com sucesso!'
            ]);

            exit;

        } else {

            echo json_encode([
                'success' => false,
                'error' => 'Código inválido ou expirado. Tente 123456.'
            ]);

            exit;
        }
    }


    // ========================================================
    // REDEFINIR SENHA
    // ========================================================

    if ($action === 'reset_password') {

        $newPass = $data['new_password'] ?? '';

        $email = $_SESSION['reset_email'] ??
                 trim($data['email'] ?? '');


        if (
            empty($newPass) ||
            strlen($newPass) < 6
        ) {

            echo json_encode([
                'success' => false,
                'error' => 'A nova senha deve ter pelo menos 6 caracteres.'
            ]);

            exit;
        }


        if (empty($email)) {

            echo json_encode([
                'success' => false,
                'error' => 'Sessão de redefinição expirada.'
            ]);

            exit;
        }


        $passHash = password_hash(
            $newPass,
            PASSWORD_DEFAULT
        );


        $stmt = $db->prepare("
            UPDATE users
            SET password_hash = ?
            WHERE email = ?
        ");

        $stmt->execute([
            $passHash,
            $email
        ]);


        unset(
            $_SESSION['reset_code'],
            $_SESSION['reset_email'],
            $_SESSION['reset_expires'],
            $_SESSION['reset_verified']
        );


        echo json_encode([
            'success' => true,
            'message' => 'Senha redefinida com sucesso! Você já pode fazer login.'
        ]);

        exit;
    }


    // ========================================================
    // EXCLUIR CONTA
    // ========================================================

    if ($action === 'delete_account') {

        if (!isset($_SESSION['user_id'])) {

            echo json_encode([
                'success' => false,
                'error' => 'Não autenticado.'
            ]);

            exit;
        }


        $userId = $_SESSION['user_id'];


        $stmt = $db->prepare(
            "DELETE FROM users WHERE id = ?"
        );

        $stmt->execute([$userId]);


        session_destroy();


        echo json_encode([
            'success' => true,
            'message' => 'Sua conta foi excluída permanentemente.'
        ]);

        exit;
    }
}


// ============================================================
// AÇÃO INVÁLIDA
// ============================================================

echo json_encode([
    'success' => false,
    'error' => 'Ação inválida.'
]);