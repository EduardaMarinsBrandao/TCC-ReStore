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
        if (!isset($_SESSION['user_id'])) {
            echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
            exit;
        }
        $userId = (int)$_SESSION['user_id'];
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

// --- EDITAR AVALIAÇÃO ---
if ($method === 'POST' && $action === 'update') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Sessão expirada.']);
        exit;
    }

    $userId = $_SESSION['user_id'];
    $reviewId = (int)($data['review_id'] ?? 0);
    $rating = (int)($data['rating'] ?? 5);
    $comment = trim($data['comment'] ?? '');

    if ($reviewId <= 0 || $rating < 1 || $rating > 5) {
        echo json_encode(['success' => false, 'error' => 'Dados inválidos.']);
        exit;
    }

    // Verifica se a avaliação pertence ao usuário logado
    $stmt = $db->prepare("SELECT product_id FROM reviews WHERE id = ? AND user_id = ?");
    $stmt->execute([$reviewId, $userId]);
    $review = $stmt->fetch();

    if (!$review) {
        echo json_encode(['success' => false, 'error' => 'Avaliação não encontrada ou sem permissão.']);
        exit;
    }

    $productId = $review['product_id'];

    $db->beginTransaction();
    try {
        $db->prepare("UPDATE reviews SET rating = ?, comment = ? WHERE id = ? AND user_id = ?")
           ->execute([$rating, $comment, $reviewId, $userId]);

        // Recalcula a média do produto
        $calcStmt = $db->prepare("SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ?");
        $calcStmt->execute([$productId]);
        $avgRating = round((float)($calcStmt->fetch()['avg_rating'] ?? 0), 1);

        $db->prepare("UPDATE products SET rating = ? WHERE id = ?")->execute([$avgRating, $productId]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Avaliação atualizada com sucesso!']);
        exit;
    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao editar: ' . $e->getMessage()]);
        exit;
    }
}

// --- EXCLUIR AVALIAÇÃO ---
if ($method === 'POST' && $action === 'delete') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Sessão expirada.']);
        exit;
    }

    $userId = $_SESSION['user_id'];
    $reviewId = (int)($data['review_id'] ?? 0);

    $stmt = $db->prepare("SELECT product_id FROM reviews WHERE id = ? AND user_id = ?");
    $stmt->execute([$reviewId, $userId]);
    $review = $stmt->fetch();

    if (!$review) {
        echo json_encode(['success' => false, 'error' => 'Permissão negada ou registro inexistente.']);
        exit;
    }

    $productId = $review['product_id'];

    $db->beginTransaction();
    try {
        $db->prepare("DELETE FROM reviews WHERE id = ? AND user_id = ?")->execute([$reviewId, $userId]);

        // Recalcula média e total
        $calcStmt = $db->prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?");
        $calcStmt->execute([$productId]);
        $stat = $calcStmt->fetch();

        $avgRating = round((float)($stat['avg_rating'] ?? 0), 1);
        $totalReviews = (int)($stat['cnt'] ?? 0);

        $db->prepare("UPDATE products SET rating = ?, total_reviews = ? WHERE id = ?")->execute([$avgRating, $totalReviews, $productId]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Avaliação removida!']);
        exit;
    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao excluir: ' . $e->getMessage()]);
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
    
    // CORREÇÃO AQUI: Captura o order_id dos dados recebidos antes de validar
    $orderIdInput = (int)($data['order_id'] ?? 0);
    $orderId = $orderIdInput > 0 ? $orderIdInput : null;
    
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

        $avgRating = round((float)($stat['avg_rating'] ?? 0), 1);
        $totalReviews = (int)($stat['cnt'] ?? 0);

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
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'É necessário estar logado para avaliar feedback.']);
        exit;
    }

    $reviewId = (int)($data['review_id'] ?? 0);
    if ($reviewId > 0) {
        $db->prepare("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?")->execute([$reviewId]);
        echo json_encode(['success' => true, 'message' => 'Obrigado pelo seu feedback!']);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
