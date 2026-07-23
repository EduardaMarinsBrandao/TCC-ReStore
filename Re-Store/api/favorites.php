<?php
// api/favorites.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'É necessário estar logado para gerenciar favoritos.', 'logged_in' => false]);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$userId = $_SESSION['user_id'];
$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? 'list';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'list') {
    $stmt = $db->prepare("SELECT p.*, f.created_at as favorited_at, 
                          (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as primary_image,
                          u.name as seller_name 
                          FROM favorites f 
                          JOIN products p ON f.product_id = p.id 
                          JOIN users u ON p.seller_id = u.id 
                          WHERE f.user_id = ? 
                          ORDER BY f.id DESC");
    $stmt->execute([$userId]);
    $favorites = $stmt->fetchAll();

    echo json_encode(['success' => true, 'favorites' => $favorites]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'toggle') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?? $_POST;
    $productId = (int)($data['product_id'] ?? 0);

    if ($productId <= 0) {
        echo json_encode(['success' => false, 'error' => 'ID de produto inválido.']);
        exit;
    }

    // Verificar se já está nos favoritos
    $checkStmt = $db->prepare("SELECT id FROM favorites WHERE user_id = ? AND product_id = ?");
    $checkStmt->execute([$userId, $productId]);
    $fav = $checkStmt->fetch();

    if ($fav) {
        // Remover dos favoritos
        $delStmt = $db->prepare("DELETE FROM favorites WHERE id = ?");
        $delStmt->execute([$fav['id']]);
        echo json_encode(['success' => true, 'is_favorite' => false, 'message' => 'Removido dos favoritos.']);
        exit;
    } else {
        // Adicionar aos favoritos
        $addStmt = $db->prepare("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)");
        $addStmt->execute([$userId, $productId]);
        echo json_encode(['success' => true, 'is_favorite' => true, 'message' => 'Adicionado aos favoritos!']);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
