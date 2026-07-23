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

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'me') {
    if (isset($_SESSION['user_id'])) {
        $stmt = $db->prepare("SELECT id, email, name, phone, cpf, avatar, address, city, state, zip_code, points, level, is_verified_business, business_name, cnpj, created_at FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        if ($user) {
            echo json_encode(['success' => true, 'logged_in' => true, 'user' => $user]);
            exit;
        }
    }
    echo json_encode(['success' => true, 'logged_in' => false]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'login') {
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if (empty($email) || empty($password)) {
            echo json_encode(['success' => false, 'error' => 'Por favor, informe e-mail e senha.']);
            exit;
        }

        $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user_name'] = $user['name'];
            unset($user['password_hash']);
            echo json_encode(['success' => true, 'message' => 'Login realizado com sucesso!', 'user' => $user]);
            exit;
        } else {
            echo json_encode(['success' => false, 'error' => 'E-mail ou senha incorretos.']);
            exit;
        }
    }

    if ($action === 'register') {
        $name = trim($data['name'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';
        $phone = trim($data['phone'] ?? '');

        if (empty($name) || empty($email) || empty($password)) {
            echo json_encode(['success' => false, 'error' => 'Preencha todos os campos obrigatórios.']);
            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            echo json_encode(['success' => false, 'error' => 'E-mail em formato inválido.']);
            exit;
        }

        if (strlen($password) < 6) {
            echo json_encode(['success' => false, 'error' => 'A senha deve conter pelo menos 6 caracteres.']);
            exit;
        }

        // Verifica e-mail duplicado
        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            echo json_encode(['success' => false, 'error' => 'Este e-mail já está cadastrado.']);
            exit;
        }

        $passHash = password_hash($password, PASSWORD_DEFAULT);
        $initialPoints = 500; // 500 Pontos de Boas-Vindas

        $insertStmt = $db->prepare("INSERT INTO users (email, name, password_hash, phone, points, level) VALUES (?, ?, ?, ?, ?, 1)");
        $insertStmt->execute([$email, $name, $passHash, $phone, $initialPoints]);
        $userId = $db->lastInsertId();

        // Registra histórico de pontos de boas-vindas
        $historyStmt = $db->prepare("INSERT INTO points_history (user_id, points, type, description) VALUES (?, ?, 'purchase', ?)");
        $historyStmt->execute([$userId, $initialPoints, 'Bônus de Boas-Vindas Re-Store']);

        $_SESSION['user_id'] = $userId;
        $_SESSION['user_name'] = $name;

        // Retorna os dados do usuário recém-criado
        $userStmt = $db->prepare("SELECT id, email, name, phone, points, level, created_at FROM users WHERE id = ?");
        $userStmt->execute([$userId]);
        $newUser = $userStmt->fetch();

        echo json_encode([
            'success' => true,
            'message' => 'Conta criada com sucesso! Você ganhou +500 Pontos Verdes de boas-vindas 🎉',
            'user' => $newUser
        ]);
        exit;
    }

    if ($action === 'logout') {
        session_destroy();
        echo json_encode(['success' => true, 'message' => 'Sessão encerrada com sucesso.']);
        exit;
    }

    if ($action === 'update_profile') {
        if (!isset($_SESSION['user_id'])) {
            echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
            exit;
        }

        $userId = $_SESSION['user_id'];
        $name = trim($_POST['name'] ?? $data['name'] ?? '');
        $phone = trim($_POST['phone'] ?? $data['phone'] ?? '');
        $address = trim($_POST['address'] ?? $data['address'] ?? '');
        $city = trim($_POST['city'] ?? $data['city'] ?? '');
        $state = trim($_POST['state'] ?? $data['state'] ?? '');
        $zipCode = trim($_POST['zip_code'] ?? $data['zip_code'] ?? '');
        $isVerifiedBusiness = isset($_POST['is_verified_business']) ? (int)$_POST['is_verified_business'] : (isset($data['is_verified_business']) ? (int)$data['is_verified_business'] : 0);
        $businessName = trim($_POST['business_name'] ?? $data['business_name'] ?? '');
        $cnpj = trim($_POST['cnpj'] ?? $data['cnpj'] ?? '');

        // Upload de avatar local
        $avatarUrl = null;
        if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
            $fileTmp = $_FILES['avatar']['tmp_name'];
            $fileName = $_FILES['avatar']['name'];
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

            $allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
            if (in_array($ext, $allowedExts)) {
                $newFileName = 'avatar_' . $userId . '_' . uniqid() . '.' . $ext;
                $targetPath = __DIR__ . '/../uploads/avatars/' . $newFileName;

                if (move_uploaded_file($fileTmp, $targetPath)) {
                    $avatarUrl = 'uploads/avatars/' . $newFileName;
                }
            }
        }

        if ($avatarUrl) {
            $stmt = $db->prepare("UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state = ?, zip_code = ?, is_verified_business = ?, business_name = ?, cnpj = ?, avatar = ? WHERE id = ?");
            $stmt->execute([$name, $phone, $address, $city, $state, $zipCode, $isVerifiedBusiness, $businessName, $cnpj, $avatarUrl, $userId]);
        } else {
            $stmt = $db->prepare("UPDATE users SET name = ?, phone = ?, address = ?, city = ?, state = ?, zip_code = ?, is_verified_business = ?, business_name = ?, cnpj = ? WHERE id = ?");
            $stmt->execute([$name, $phone, $address, $city, $state, $zipCode, $isVerifiedBusiness, $businessName, $cnpj, $userId]);
        }

        $userStmt = $db->prepare("SELECT id, email, name, phone, cpf, avatar, address, city, state, zip_code, points, level, is_verified_business, business_name, cnpj FROM users WHERE id = ?");
        $userStmt->execute([$userId]);
        $updatedUser = $userStmt->fetch();

        echo json_encode(['success' => true, 'message' => 'Perfil atualizado com sucesso!', 'user' => $updatedUser]);
        exit;
    }

    if ($action === 'forgot_password') {
        $email = trim($data['email'] ?? '');
        if (empty($email)) {
            echo json_encode(['success' => false, 'error' => 'Informe seu e-mail cadastrado.']);
            exit;
        }

        $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            echo json_encode(['success' => false, 'error' => 'E-mail não encontrado no sistema.']);
            exit;
        }

        // Gera código de verificação simulado de 6 dígitos
        $_SESSION['reset_code'] = '123456';
        $_SESSION['reset_email'] = $email;
        $_SESSION['reset_expires'] = time() + 600; // 10 minutos

        echo json_encode([
            'success' => true,
            'message' => 'Código de verificação enviado para ' . $email . '! (Código simulado para testes: 123456)'
        ]);
        exit;
    }

    if ($action === 'verify_code') {
        $code = trim($data['code'] ?? '');
        if ($code === ($_SESSION['reset_code'] ?? '123456') && (time() <= ($_SESSION['reset_expires'] ?? (time() + 600)))) {
            $_SESSION['reset_verified'] = true;
            echo json_encode(['success' => true, 'message' => 'Código verificado com sucesso!']);
            exit;
        } else {
            echo json_encode(['success' => false, 'error' => 'Código inválido ou expirado. Tente 123456.']);
            exit;
        }
    }

    if ($action === 'reset_password') {
        $newPass = $data['new_password'] ?? '';
        $email = $_SESSION['reset_email'] ?? trim($data['email'] ?? '');

        if (empty($newPass) || strlen($newPass) < 6) {
            echo json_encode(['success' => false, 'error' => 'A nova senha deve ter pelo menos 6 caracteres.']);
            exit;
        }

        if (empty($email)) {
            echo json_encode(['success' => false, 'error' => 'Sessão de redefinição expirada.']);
            exit;
        }

        $passHash = password_hash($newPass, PASSWORD_DEFAULT);
        $stmt = $db->prepare("UPDATE users SET password_hash = ? WHERE email = ?");
        $stmt->execute([$passHash, $email]);

        unset($_SESSION['reset_code'], $_SESSION['reset_email'], $_SESSION['reset_expires'], $_SESSION['reset_verified']);

        echo json_encode(['success' => true, 'message' => 'Senha redefinida com sucesso! Você já pode fazer login.']);
        exit;
    }

    if ($action === 'delete_account') {
        if (!isset($_SESSION['user_id'])) {
            echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
            exit;
        }
        $userId = $_SESSION['user_id'];
        $stmt = $db->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$userId]);

        session_destroy();
        echo json_encode(['success' => true, 'message' => 'Sua conta foi excluída permanentemente.']);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
