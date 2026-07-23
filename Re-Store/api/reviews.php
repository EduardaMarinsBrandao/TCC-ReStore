<?php
// api/reviews.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? 'list';

if ($method === 'GET' && $action === 'list') {
    $productId = isset($_GET['product_id']) ? (int)$_GET['product_id'] : 0;
    $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;

    if ($productId > 0) {
        $stmt = $db->prepare("SELECT r.*, u.name as user_name, u.avatar as user_avatar 
                              FROM reviews r 
                              JOIN users u ON r.user_id = u.id 
                              WHERE r.product_id = ? 
                              ORDER BY r.id DESC");
        $stmt->execute([$productId]);
        $reviews = $stmt->fetchAll();
        echo json_encode(['success' => true, 'reviews' => $reviews]);
        exit;
    }

    if ($userId > 0) {
        $stmt = $db->prepare("SELECT r.*, p.name as product_name, 
                              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image 
                              FROM reviews r 
                              JOIN products p ON r.product_id = p.id 
                              WHERE r.user_id = ? 
                              ORDER BY r.id DESC");
        $stmt->execute([$userId]);
        $reviews = $stmt->fetchAll();
        echo json_encode(['success' => true, 'reviews' => $reviews]);
        exit;
    }
}

if ($method === 'POST' && $action === 'create') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'É necessário estar logado para enviar uma avaliação.']);
        exit;
    }

    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?? $_POST;

    $userId = $_SESSION['user_id'];
    $productId = (int)($data['product_id'] ?? 0);
    $orderId = (int)($data['order_id'] ?? 0);
    $rating = (int)($data['rating'] ?? 5);
    $comment = trim($data['comment'] ?? '');

    if ($productId <= 0 || $rating < 1 || $rating > 5) {
        echo json_encode(['success' => false, 'error' => 'Dados de avaliação inválidos.']);
        exit;
    }

    $db->beginTransaction();
    try {
        // Inserir avaliação
        $stmt = $db->prepare("INSERT INTO reviews (product_id, user_id, order_id, rating, comment) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$productId, $userId, $orderId, $rating, $comment]);

        // Recalcular nota média e número total de avaliações do produto
        $calcStmt = $db->prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?");
        $calcStmt->execute([$productId]);
        $stat = $calcStmt->fetch();

        $avgRating = round((float)$stat['avg_rating'], 1);
        $totalReviews = (int)$stat['cnt'];

        $db->prepare("UPDATE products SET rating = ?, total_reviews = ? WHERE id = ?")->execute([$avgRating, $totalReviews, $productId]);

        // Bônus de +50 Pontos Verdes por avaliar um produto
        $reviewBonusPoints = 50;
        $db->prepare("UPDATE users SET points = points + ? WHERE id = ?")->execute([$reviewBonusPoints, $userId]);
        $db->prepare("INSERT INTO points_history (user_id, points, type, description) VALUES (?, ?, 'review', ?)")
           ->execute([$userId, $reviewBonusPoints, 'Bônus por avaliar um produto']);

        $db->commit();

        echo json_encode(['success' => true, 'message' => 'Avaliação enviada com sucesso! Você ganhou +50 Pontos Verdes 🌱']);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao salvar avaliação: ' . $e->getMessage()]);
        exit;
    }
}

if ($method === 'POST' && $action === 'vote_helpful') {
    $reviewId = (int)($data['review_id'] ?? 0);
    if ($reviewId > 0) {
        $db->prepare("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?")->execute([$reviewId]);
        echo json_encode(['success' => true, 'message' => 'Obrigado pelo seu feedback!']);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
