<?php
// api/reviews.php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';
require_once __DIR__ . '/../config/gamification.php';

initializeDatabase();
$db = getDbConnection();

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? 'list';

// Diretório para upload de fotos das avaliações
$uploadDir = __DIR__ . '/../uploads/reviews/';
if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0755, true);
}
$allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
$maxPhotosPerReview = 3;

/**
 * Função auxiliar para processar uploads de fotos de avaliações
 */
function handleReviewPhotoUploads($reviewId, $uploadDir, $allowedExts, $maxAllowed) {
    global $db;
    $savedCount = 0;
    $files = [];

    $source = null;
    if (isset($_FILES['photos'])) {
        $source = $_FILES['photos'];
    } elseif (isset($_FILES['images'])) {
        $source = $_FILES['images'];
    }

    if (!$source) {
        return 0;
    }

    if (is_array($source['name'])) {
        $total = count($source['name']);
        for ($i = 0; $i < $total; $i++) {
            if ($savedCount >= $maxAllowed) break;
            if ($source['error'][$i] === UPLOAD_ERR_OK) {
                $files[] = [
                    'tmp' => $source['tmp_name'][$i],
                    'name' => $source['name'][$i],
                    'size' => $source['size'][$i]
                ];
            }
        }
    } elseif (is_string($source['name']) && $source['error'] === UPLOAD_ERR_OK) {
        $files[] = [
            'tmp' => $source['tmp_name'],
            'name' => $source['name'],
            'size' => $source['size']
        ];
    }

    foreach ($files as $f) {
        if ($savedCount >= $maxAllowed) break;
        $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowedExts)) {
            continue;
        }
        // Limite de 5MB por foto
        if ($f['size'] > 5 * 1024 * 1024) {
            continue;
        }

        $newFileName = 'rev_' . $reviewId . '_' . uniqid() . '_' . $savedCount . '.' . $ext;
        $targetPath = $uploadDir . $newFileName;

        if (move_uploaded_file($f['tmp'], $targetPath)) {
            $relUrl = 'uploads/reviews/' . $newFileName;
            $insStmt = $db->prepare("INSERT INTO review_images (review_id, image_url) VALUES (?, ?)");
            $insStmt->execute([$reviewId, $relUrl]);
            $savedCount++;
        }
    }

    return $savedCount;
}

// ----------------------------------------------------
// 1. LISTAR AVALIAÇÕES (POR PRODUTO OU POR USUÁRIO)
// ----------------------------------------------------
if ($method === 'GET' && ($action === 'list' || $action === 'my_reviews')) {
    $productId = (int)($_GET['product_id'] ?? 0);
    $userIdParam = (int)($_GET['user_id'] ?? 0);
    $currentUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;

    // Listar avaliações de um produto
    if ($productId > 0 && $action !== 'my_reviews') {
        $stmt = $db->prepare("SELECT r.*, u.name as user_name, u.avatar as user_avatar,
                              EXISTS(SELECT 1 FROM review_votes rv WHERE rv.review_id = r.id AND rv.user_id = ?) as user_voted 
                              FROM reviews r 
                              JOIN users u ON r.user_id = u.id 
                              WHERE r.product_id = ? 
                              ORDER BY r.id DESC");
        $stmt->execute([$currentUserId, $productId]);
        $reviews = $stmt->fetchAll();

        foreach ($reviews as &$rev) {
            $imgStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ? ORDER BY id ASC");
            $imgStmt->execute([$rev['id']]);
            $rev['images'] = $imgStmt->fetchAll();
            $rev['is_verified_purchase'] = !empty($rev['order_id']);
        }
        unset($rev);

        echo json_encode(['success' => true, 'reviews' => $reviews]);
        exit;
    }

    // Listar avaliações do usuário (Minhas Avaliações)
    $targetUserId = ($action === 'my_reviews' || $userIdParam > 0) ? ($userIdParam > 0 ? $userIdParam : $currentUserId) : 0;
    if ($targetUserId > 0) {
        $stmt = $db->prepare("SELECT r.*, p.name as product_name, p.id as product_id,
                              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image
                              FROM reviews r 
                              JOIN products p ON r.product_id = p.id 
                              WHERE r.user_id = ? 
                              ORDER BY r.id DESC");
        $stmt->execute([$targetUserId]);
        $reviews = $stmt->fetchAll();

        foreach ($reviews as &$rev) {
            $imgStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ? ORDER BY id ASC");
            $imgStmt->execute([$rev['id']]);
            $rev['images'] = $imgStmt->fetchAll();
            $rev['is_verified_purchase'] = !empty($rev['order_id']);
        }
        unset($rev);

        echo json_encode(['success' => true, 'reviews' => $reviews]);
        exit;
    }

    echo json_encode(['success' => false, 'error' => 'Parâmetros insuficientes para listagem.']);
    exit;
}

// ----------------------------------------------------
// 2. VERIFICAR ELEGIBILIDADE PARA AVALIAR (COMPRA VERIFICADA)
// ----------------------------------------------------
if ($method === 'GET' && ($action === 'check_eligibility' || $action === 'can_review')) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode([
            'success' => true,
            'can_review' => false,
            'reason' => 'login_required',
            'message' => 'Faça login para poder avaliar este produto.'
        ]);
        exit;
    }

    $userId = (int)$_SESSION['user_id'];
    $productId = (int)($_GET['product_id'] ?? 0);

    if ($productId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Produto inválido.']);
        exit;
    }

    // Checar se o usuário é o próprio vendedor do produto
    $prodStmt = $db->prepare("SELECT seller_id FROM products WHERE id = ?");
    $prodStmt->execute([$productId]);
    $prod = $prodStmt->fetch();
    if ($prod && (int)$prod['seller_id'] === $userId) {
        echo json_encode([
            'success' => true,
            'can_review' => false,
            'reason' => 'own_product',
            'message' => 'Você não pode avaliar seu próprio anúncio.'
        ]);
        exit;
    }

    // Checar se já avaliou este produto
    $existingStmt = $db->prepare("SELECT * FROM reviews WHERE product_id = ? AND user_id = ? LIMIT 1");
    $existingStmt->execute([$productId, $userId]);
    $existingReview = $existingStmt->fetch();

    if ($existingReview) {
        $imgStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ? ORDER BY id ASC");
        $imgStmt->execute([$existingReview['id']]);
        $existingReview['images'] = $imgStmt->fetchAll();

        echo json_encode([
            'success' => true,
            'can_review' => false,
            'already_reviewed' => true,
            'reason' => 'already_reviewed',
            'review' => $existingReview,
            'message' => 'Você já avaliou este produto. Você pode editar sua avaliação existente.'
        ]);
        exit;
    }

    // Checar se realizou compra confirmada deste produto
    $orderStmt = $db->prepare("SELECT o.id, o.status, o.created_at 
                              FROM orders o 
                              JOIN order_items oi ON oi.order_id = o.id 
                              WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status != 'cancelled' 
                              ORDER BY o.id DESC LIMIT 1");
    $orderStmt->execute([$userId, $productId]);
    $order = $orderStmt->fetch();

    if (!$order) {
        echo json_encode([
            'success' => true,
            'can_review' => false,
            'has_purchased' => false,
            'reason' => 'not_purchased',
            'message' => 'Apenas compradores verificados deste produto podem enviar uma avaliação.'
        ]);
        exit;
    }

    echo json_encode([
        'success' => true,
        'can_review' => true,
        'has_purchased' => true,
        'order_id' => (int)$order['id'],
        'order_date' => $order['created_at'],
        'message' => 'Compra verificada! Você pode avaliar este produto.'
    ]);
    exit;
}

// ----------------------------------------------------
// 3. EDITAR / ATUALIZAR AVALIAÇÃO (COM ATÉ 3 FOTOS)
// ----------------------------------------------------
if ($method === 'POST' && $action === 'update') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Usuário não autenticado.']);
        exit;
    }

    $userId = (int)$_SESSION['user_id'];
    $reviewId = (int)($data['review_id'] ?? 0);
    $rating = (int)($data['rating'] ?? 5);
    $comment = trim($data['comment'] ?? '');

    if ($reviewId <= 0) {
        echo json_encode(['success' => false, 'error' => 'ID de avaliação inválido.']);
        exit;
    }

    if ($rating < 1 || $rating > 5) {
        echo json_encode(['success' => false, 'error' => 'A nota deve ser entre 1 e 5 estrelas.']);
        exit;
    }

    // Localizar a avaliação e verificar se pertence ao usuário
    $stmt = $db->prepare("SELECT * FROM reviews WHERE id = ? AND user_id = ?");
    $stmt->execute([$reviewId, $userId]);
    $review = $stmt->fetch();

    if (!$review) {
        echo json_encode(['success' => false, 'error' => 'Avaliação não encontrada ou permissão negada.']);
        exit;
    }

    $productId = (int)$review['product_id'];

    $db->beginTransaction();
    try {
        // Atualiza nota, comentário e data de modificação
        $updateStmt = $db->prepare("UPDATE reviews SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?");
        $updateStmt->execute([$rating, $comment, $reviewId, $userId]);

        // Excluir imagens selecionadas pelo usuário para remoção
        $deleteImageIds = $data['delete_image_ids'] ?? [];
        if (!is_array($deleteImageIds) && is_string($deleteImageIds)) {
            $deleteImageIds = json_decode($deleteImageIds, true) ?? explode(',', $deleteImageIds);
        }

        if (!empty($deleteImageIds)) {
            foreach ($deleteImageIds as $delId) {
                $delId = (int)$delId;
                if ($delId <= 0) continue;
                $chkImg = $db->prepare("SELECT image_url FROM review_images WHERE id = ? AND review_id = ?");
                $chkImg->execute([$delId, $reviewId]);
                $imgRow = $chkImg->fetch();
                if ($imgRow) {
                    $filePath = __DIR__ . '/../' . $imgRow['image_url'];
                    if (file_exists($filePath)) {
                        @unlink($filePath);
                    }
                    $db->prepare("DELETE FROM review_images WHERE id = ?")->execute([$delId]);
                }
            }
        }

        // Verificar quantas imagens restam atualmente para esta avaliação
        $cntStmt = $db->prepare("SELECT COUNT(*) as cnt FROM review_images WHERE review_id = ?");
        $cntStmt->execute([$reviewId]);
        $currentImgCount = (int)($cntStmt->fetch()['cnt'] ?? 0);
        $slotsLeft = max(0, $maxPhotosPerReview - $currentImgCount);

        // Se houver novas fotos enviadas, salva respeitando o limite de 3
        if ($slotsLeft > 0 && (!empty($_FILES['photos']) || !empty($_FILES['images']))) {
            handleReviewPhotoUploads($reviewId, $uploadDir, $allowedExts, $slotsLeft);
        }

        // Recalcular média e total de avaliações do produto
        $calcStmt = $db->prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?");
        $calcStmt->execute([$productId]);
        $stat = $calcStmt->fetch();

        $avgRating = round((float)($stat['avg_rating'] ?? 0), 1);
        $totalReviews = (int)($stat['cnt'] ?? 0);

        $db->prepare("UPDATE products SET rating = ?, total_reviews = ? WHERE id = ?")->execute([$avgRating, $totalReviews, $productId]);

        $db->commit();

        // Buscar imagens atualizadas para resposta
        $imgListStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ? ORDER BY id ASC");
        $imgListStmt->execute([$reviewId]);
        $updatedImages = $imgListStmt->fetchAll();

        echo json_encode([
            'success' => true,
            'message' => 'Avaliação atualizada com sucesso!',
            'review' => [
                'id' => $reviewId,
                'rating' => $rating,
                'comment' => $comment,
                'images' => $updatedImages
            ]
        ]);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao atualizar avaliação: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 4. EXCLUIR AVALIAÇÃO (E SEUS ANEXOS)
// ----------------------------------------------------
if ($method === 'POST' && $action === 'delete') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Sessão expirada.']);
        exit;
    }

    $userId = (int)$_SESSION['user_id'];
    $reviewId = (int)($data['review_id'] ?? 0);

    $stmt = $db->prepare("SELECT product_id FROM reviews WHERE id = ? AND user_id = ?");
    $stmt->execute([$reviewId, $userId]);
    $review = $stmt->fetch();

    if (!$review) {
        echo json_encode(['success' => false, 'error' => 'Permissão negada ou avaliação inexistente.']);
        exit;
    }

    $productId = (int)$review['product_id'];

    $db->beginTransaction();
    try {
        // Remover arquivos de fotos do disco
        $imgStmt = $db->prepare("SELECT image_url FROM review_images WHERE review_id = ?");
        $imgStmt->execute([$reviewId]);
        $imgs = $imgStmt->fetchAll();
        foreach ($imgs as $im) {
            $filePath = __DIR__ . '/../' . $im['image_url'];
            if (file_exists($filePath)) {
                @unlink($filePath);
            }
        }

        // Excluir registros das tabelas relacionadas
        $db->prepare("DELETE FROM review_images WHERE review_id = ?")->execute([$reviewId]);
        $db->prepare("DELETE FROM review_votes WHERE review_id = ?")->execute([$reviewId]);
        $db->prepare("DELETE FROM reviews WHERE id = ? AND user_id = ?")->execute([$reviewId, $userId]);

        // Recalcular média e total de avaliações do produto
        $calcStmt = $db->prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?");
        $calcStmt->execute([$productId]);
        $stat = $calcStmt->fetch();

        $avgRating = round((float)($stat['avg_rating'] ?? 0), 1);
        $totalReviews = (int)($stat['cnt'] ?? 0);

        $db->prepare("UPDATE products SET rating = ?, total_reviews = ? WHERE id = ?")->execute([$avgRating, $totalReviews, $productId]);

        $db->commit();
        echo json_encode(['success' => true, 'message' => 'Avaliação removida com sucesso!']);
        exit;
    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao excluir: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 5. CRIAR NOVA AVALIAÇÃO (COM COMPRA VERIFICADA E ATÉ 3 FOTOS)
// ----------------------------------------------------
if ($method === 'POST' && $action === 'create') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'É necessário estar logado para enviar uma avaliação.']);
        exit;
    }

    $userId = (int)$_SESSION['user_id'];
    $productId = (int)($data['product_id'] ?? 0);
    $rating = (int)($data['rating'] ?? 5);
    $comment = trim($data['comment'] ?? '');

    if ($productId <= 0 || $rating < 1 || $rating > 5) {
        echo json_encode(['success' => false, 'error' => 'Dados de avaliação inválidos.']);
        exit;
    }

    // 1. Checar se o produto existe e se o usuário não é o vendedor
    $prodStmt = $db->prepare("SELECT seller_id FROM products WHERE id = ?");
    $prodStmt->execute([$productId]);
    $prod = $prodStmt->fetch();
    if (!$prod) {
        echo json_encode(['success' => false, 'error' => 'Produto não encontrado.']);
        exit;
    }
    if ((int)$prod['seller_id'] === $userId) {
        echo json_encode(['success' => false, 'error' => 'Você não pode avaliar seus próprios produtos anunciados.']);
        exit;
    }

    // 2. EXIGÊNCIA DE COMPRA: Verificar se o usuário realmente comprou o item
    $purchaseStmt = $db->prepare("
        SELECT o.id as order_id, o.status, o.created_at 
        FROM orders o 
        JOIN order_items oi ON oi.order_id = o.id 
        WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status != 'cancelled'
        ORDER BY o.id DESC 
        LIMIT 1
    ");
    $purchaseStmt->execute([$userId, $productId]);
    $purchase = $purchaseStmt->fetch();

    if (!$purchase) {
        echo json_encode([
            'success' => false, 
            'error' => 'Apenas compradores verificados deste produto podem enviar uma avaliação. Realize a compra do item para poder avaliá-lo!'
        ]);
        exit;
    }
    $orderId = (int)$purchase['order_id'];

    // 3. Checar se o usuário já avaliou este produto previamente
    $existingStmt = $db->prepare("SELECT id FROM reviews WHERE product_id = ? AND user_id = ?");
    $existingStmt->execute([$productId, $userId]);
    $existingReview = $existingStmt->fetch();
    if ($existingReview) {
        echo json_encode([
            'success' => false, 
            'already_reviewed' => true,
            'review_id' => $existingReview['id'],
            'error' => 'Você já avaliou este produto anteriormente. Utilize a opção de edição para alterar seu feedback!'
        ]);
        exit;
    }

    $db->beginTransaction();
    try {
        // Inserir avaliação com o order_id comprovado
        $stmt = $db->prepare("INSERT INTO reviews (product_id, user_id, order_id, rating, comment, helpful_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        $stmt->execute([$productId, $userId, $orderId, $rating, $comment]);
        $reviewId = (int)$db->lastInsertId();

        // Processar fotos anexadas (máximo 3 fotos)
        $photosSaved = 0;
        if (!empty($_FILES['photos']) || !empty($_FILES['images'])) {
            $photosSaved = handleReviewPhotoUploads($reviewId, $uploadDir, $allowedExts, $maxPhotosPerReview);
        }

        // Recalcular nota média e número total de avaliações do produto
        $calcStmt = $db->prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as cnt FROM reviews WHERE product_id = ?");
        $calcStmt->execute([$productId]);
        $stat = $calcStmt->fetch();

        $avgRating = round((float)($stat['avg_rating'] ?? 0), 1);
        $totalReviews = (int)($stat['cnt'] ?? 0);

        $db->prepare("UPDATE products SET rating = ?, total_reviews = ? WHERE id = ?")->execute([$avgRating, $totalReviews, $productId]);

        // Bônus de Pontos Verdes por avaliar um produto
        $reviewBonusPoints = POINTS_REVIEW_BONUS;
        $db->prepare("UPDATE users SET points = points + ? WHERE id = ?")->execute([$reviewBonusPoints, $userId]);
        $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'review', ?, ?)")
           ->execute([$userId, $reviewBonusPoints, 'Bônus por avaliar um produto comprado', $orderId]);

        updateUserEngagementLevel($db, $userId);

        $db->commit();

        $photoMsg = $photosSaved > 0 ? " com {$photosSaved} foto(s) anexada(s)" : "";
        echo json_encode([
            'success' => true, 
            'message' => "Avaliação publicada com sucesso{$photoMsg}! Você ganhou +{$reviewBonusPoints} Pontos Verdes 🌱",
            'review_id' => $reviewId
        ]);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao salvar avaliação: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 6. VOTO DE UTILIDADE (ÚTIL / NÃO ÚTIL)
// ----------------------------------------------------
if ($method === 'POST' && $action === 'vote_helpful') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'É necessário estar logado para interagir.']);
        exit;
    }

    $userId = (int)$_SESSION['user_id'];
    $reviewId = (int)($data['review_id'] ?? 0);

    if ($reviewId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Avaliação inválida.']);
        exit;
    }

    $db->beginTransaction();
    try {
        // Verifica se o usuário já votou nesta avaliação
        $stmt = $db->prepare("SELECT id FROM review_votes WHERE review_id = ? AND user_id = ?");
        $stmt->execute([$reviewId, $userId]);
        $existingVote = $stmt->fetch();

        if ($existingVote) {
            // Se já votou, remove o voto (Descurtir)
            $db->prepare("DELETE FROM review_votes WHERE id = ?")->execute([$existingVote['id']]);
            $db->prepare("UPDATE reviews SET helpful_count = GREATEST(0, helpful_count - 1) WHERE id = ?")->execute([$reviewId]);
            $voted = false;
        } else {
            // Se não votou, insere o voto (Curtir)
            $db->prepare("INSERT INTO review_votes (review_id, user_id) VALUES (?, ?)")->execute([$reviewId, $userId]);
            $db->prepare("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?")->execute([$reviewId]);
            $voted = true;
        }

        // Obtém o número atualizado de votos
        $countStmt = $db->prepare("SELECT helpful_count FROM reviews WHERE id = ?");
        $countStmt->execute([$reviewId]);
        $newCount = (int)($countStmt->fetch()['helpful_count'] ?? 0);

        $db->commit();

        echo json_encode([
            'success' => true, 
            'voted' => $voted, 
            'new_count' => $newCount
        ]);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Erro ao processar voto: ' . $e->getMessage()]);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
