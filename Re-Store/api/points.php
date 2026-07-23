<?php
// api/points.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'É necessário estar logado.']);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$userId = $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? 'history';

// ----------------------------------------------------
// 1. HISTÓRICO DE PONTOS DO USUÁRIO
// ----------------------------------------------------
if ($method === 'GET' && $action === 'history') {
    $stmt = $db->prepare("SELECT * FROM points_history WHERE user_id = ? ORDER BY id DESC");
    $stmt->execute([$userId]);
    $history = $stmt->fetchAll();

    $userStmt = $db->prepare("SELECT points, level FROM users WHERE id = ?");
    $userStmt->execute([$userId]);
    $user = $userStmt->fetch();

    echo json_encode([
        'success' => true,
        'points' => $user ? (int)$user['points'] : 0,
        'level' => $user ? (int)$user['level'] : 1,
        'history' => $history
    ]);
    exit;
}

// ----------------------------------------------------
// 2. LISTAR CUPONS RESGATADOS
// ----------------------------------------------------
if ($method === 'GET' && $action === 'discounts') {
    $stmt = $db->prepare("SELECT * FROM discounts WHERE user_id = ? ORDER BY id DESC");
    $stmt->execute([$userId]);
    $discounts = $stmt->fetchAll();

    echo json_encode(['success' => true, 'discounts' => $discounts]);
    exit;
}

// ----------------------------------------------------
// 3. RESGATAR CUPOM DE DESCONTO
// ----------------------------------------------------
if ($method === 'POST' && $action === 'redeem') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?? $_POST;

    $discountType = $data['discount_type'] ?? '5%';
    
    // Tabela de custos de cupons em pontos
    $couponCosts = [
        '5%' => 150,
        '10%' => 300,
        '15%' => 500,
        '20%' => 800,
        'free_shipping' => 250
    ];

    if (!isset($couponCosts[$discountType])) {
        echo json_encode(['success' => false, 'error' => 'Tipo de cupom inválido.']);
        exit;
    }

    $pointsCost = $couponCosts[$discountType];

    // Verificar saldo de pontos do usuário
    $uStmt = $db->prepare("SELECT points FROM users WHERE id = ?");
    $uStmt->execute([$userId]);
    $userPoints = (int)$uStmt->fetch()['points'];

    if ($userPoints < $pointsCost) {
        echo json_encode(['success' => false, 'error' => "Pontos insuficientes! Você precisa de {$pointsCost} pontos e tem {$userPoints}."]);
        exit;
    }

    $db->beginTransaction();

    try {
        // Deduzir pontos do usuário
        $db->prepare("UPDATE users SET points = points - ? WHERE id = ?")->execute([$pointsCost, $userId]);

        // Gerar código único de cupom
        $prefix = strtoupper(str_replace(['%', '_'], '', $discountType));
        $code = 'ECO' . $prefix . '-' . rand(1000, 9999);

        // Inserir cupom na tabela discounts
        $db->prepare("INSERT INTO discounts (user_id, discount_type, points_cost, code) VALUES (?, ?, ?, ?)")
           ->execute([$userId, $discountType, $pointsCost, $code]);

        // Registrar no histórico de pontos
        $db->prepare("INSERT INTO points_history (user_id, points, type, description) VALUES (?, ?, 'redemption', ?)")
           ->execute([$userId, -$pointsCost, "Resgate de cupom {$discountType} (#{$code})"]);

        $db->commit();

        echo json_encode([
            'success' => true,
            'message' => "Cupom de {$discountType} resgatado com sucesso! Código: {$code}",
            'code' => $code,
            'discount_type' => $discountType,
            'remaining_points' => $userPoints - $pointsCost
        ]);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao resgatar cupom: ' . $e->getMessage()]);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
