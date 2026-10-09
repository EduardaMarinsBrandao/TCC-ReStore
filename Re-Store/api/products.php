<?php
// api/products.php
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

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

// ----------------------------------------------------
// 1. LISTAR PRODUTOS (COM FILTROS)
// ----------------------------------------------------
if ($method === 'GET' && $action === 'list') {
    try {
        $search = trim($_GET['search'] ?? '');
        $category = trim($_GET['category'] ?? '');
        $condition = trim($_GET['condition'] ?? '');
        $minPrice = isset($_GET['min_price']) && $_GET['min_price'] !== '' ? (float)$_GET['min_price'] : null;
        $maxPrice = isset($_GET['max_price']) && $_GET['max_price'] !== '' ? (float)$_GET['max_price'] : null;
        $sellerId = isset($_GET['seller_id']) ? (int)$_GET['seller_id'] : null;
        $location = trim($_GET['location'] ?? '');
        $materials = trim($_GET['materials'] ?? $_GET['material'] ?? '');
        $sort = trim($_GET['sort'] ?? 'recent');

        $sql = "SELECT p.*, COALESCE(u.name, 'Vendedor Sustentável') as seller_name, u.avatar as seller_avatar, COALESCE(u.is_verified_business, 0) as is_verified_business, u.business_name 
                FROM products p 
                LEFT JOIN users u ON p.seller_id = u.id 
                WHERE p.status = 'active'";
        $params = [];

        if (!empty($location)) {
            $sql .= " AND (p.location LIKE ? OR u.city LIKE ? OR u.state LIKE ?)";
            $locTerm = "%{$location}%";
            $params[] = $locTerm;
            $params[] = $locTerm;
            $params[] = $locTerm;
        }

        if (!empty($search)) {
            $sql .= " AND (p.name LIKE ? OR p.description LIKE ? OR p.material LIKE ?)";
            $searchTerm = "%{$search}%";
            $params[] = $searchTerm;
            $params[] = $searchTerm;
            $params[] = $searchTerm;
        }

        if (!empty($category)) {
            $sql .= " AND p.category = ?";
            $params[] = $category;
        }

        if (!empty($condition)) {
            $sql .= " AND p.product_condition = ?";
            $params[] = $condition;
        }

        if (!empty($materials)) {
            $matList = array_filter(array_map('trim', explode(',', $materials)));
            if (!empty($matList)) {
                $matClauses = [];
                foreach ($matList as $mItem) {
                    $matClauses[] = "(p.material LIKE ? OR p.description LIKE ? OR p.name LIKE ?)";
                    $mTerm = "%{$mItem}%";
                    $params[] = $mTerm;
                    $params[] = $mTerm;
                    $params[] = $mTerm;
                }
                $sql .= " AND (" . implode(" OR ", $matClauses) . ")";
            }
        }

        if ($minPrice !== null) {
            $sql .= " AND p.price >= ?";
            $params[] = $minPrice;
        }

        if ($maxPrice !== null) {
            $sql .= " AND p.price <= ?";
            $params[] = $maxPrice;
        }

        if ($sellerId !== null) {
            $sql .= " AND p.seller_id = ?";
            $params[] = $sellerId;
        }

        if ($sort === 'price_asc') {
            $sql .= " ORDER BY p.price ASC, p.id DESC";
        } elseif ($sort === 'price_desc') {
            $sql .= " ORDER BY p.price DESC, p.id DESC";
        } elseif ($sort === 'rating') {
            $sql .= " ORDER BY p.rating DESC, p.id DESC";
        } elseif ($sort === 'popular') {
            $sql .= " ORDER BY p.views DESC, p.id DESC";
        } else {
            $sql .= " ORDER BY p.id DESC";
        }

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll();

        // Carregar imagem principal e sincronizar pontos (1 pt por R$ 1,00)
        foreach ($products as &$prod) {
            $imgStmt = $db->prepare("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1");
            $imgStmt->execute([$prod['id']]);
            $primaryImg = $imgStmt->fetch();
            $prod['primary_image'] = $primaryImg ? $primaryImg['image_url'] : 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600';
            $prod['points'] = max(1, (int)round((float)$prod['price'] * BUYER_POINTS_PER_REAL));
        }
        unset($prod);

        echo json_encode(['success' => true, 'products' => $products]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Erro ao carregar lista de produtos: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 2. DETALHES DO PRODUTO
// ----------------------------------------------------
if ($method === 'GET' && $action === 'detail') {
    try {
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(['success' => false, 'error' => 'ID do produto inválido.']);
            exit;
        }

        // Incrementa contagem de visualizações
        try {
            $db->prepare("UPDATE products SET views = views + 1 WHERE id = ?")->execute([$id]);
        } catch (Exception $e) {}

        $stmt = $db->prepare("SELECT p.*, COALESCE(u.name, 'Vendedor Sustentável') as seller_name, u.email as seller_email, u.avatar as seller_avatar, u.phone as seller_phone, u.city as seller_city, u.state as seller_state, COALESCE(u.is_verified_business, 0) as is_verified_business, u.business_name 
                              FROM products p 
                              LEFT JOIN users u ON p.seller_id = u.id 
                              WHERE p.id = ?");
        $stmt->execute([$id]);
        $product = $stmt->fetch();

        if (!$product || ($product['status'] ?? '') === 'deleted') {
            echo json_encode(['success' => false, 'error' => 'Este anúncio não está mais disponível ou foi removido da plataforma.']);
            exit;
        }

        // Buscar todas as imagens do produto
        $imgStmt = $db->prepare("SELECT id, image_url, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC");
        $imgStmt->execute([$id]);
        $images = $imgStmt->fetchAll();

        if (empty($images)) {
            $images = [['id' => 0, 'image_url' => 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600', 'is_primary' => 1]];
        }

        $currentUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;

        // Buscar avaliações do produto com fotos e status de voto (com fallback resiliente)
        $reviews = [];
        try {
            $revStmt = $db->prepare("SELECT r.*, COALESCE(u.name, 'Usuário') as user_name, u.avatar as user_avatar,
                                    EXISTS(SELECT 1 FROM review_votes rv WHERE rv.review_id = r.id AND rv.user_id = ?) as user_voted
                                    FROM reviews r 
                                    LEFT JOIN users u ON r.user_id = u.id 
                                    WHERE r.product_id = ? 
                                    ORDER BY r.id DESC");
            $revStmt->execute([$currentUserId, $id]);
            $reviews = $revStmt->fetchAll();

            foreach ($reviews as &$rev) {
                $rev['images'] = [];
                try {
                    $imgStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ? ORDER BY id ASC");
                    $imgStmt->execute([$rev['id']]);
                    $rev['images'] = $imgStmt->fetchAll();
                } catch (Exception $e) {}
                $rev['is_verified_purchase'] = !empty($rev['order_id']);
            }
            unset($rev);
        } catch (Exception $e) {
            // Fallback resiliente caso review_votes ainda não exista no banco conectado
            try {
                $revStmt = $db->prepare("SELECT r.*, COALESCE(u.name, 'Usuário') as user_name, u.avatar as user_avatar, 0 as user_voted
                                        FROM reviews r 
                                        LEFT JOIN users u ON r.user_id = u.id 
                                        WHERE r.product_id = ? 
                                        ORDER BY r.id DESC");
                $revStmt->execute([$id]);
                $reviews = $revStmt->fetchAll();
                foreach ($reviews as &$rev) {
                    $rev['images'] = [];
                    $rev['is_verified_purchase'] = !empty($rev['order_id']);
                }
                unset($rev);
            } catch (Exception $e2) {
                $reviews = [];
            }
        }

        // Verificar elegibilidade de avaliação do usuário logado
        $isSeller = ($currentUserId > 0 && $currentUserId === (int)$product['seller_id']);
        $purchased = false;
        $userOrderId = null;
        $userReview = null;

        if ($currentUserId > 0) {
            // Verificar se comprou o produto
            if (!$isSeller) {
                try {
                    $ordStmt = $db->prepare("
                        SELECT o.id 
                        FROM orders o 
                        JOIN order_items oi ON oi.order_id = o.id 
                        WHERE o.buyer_id = ? AND oi.product_id = ? AND o.status != 'cancelled'
                        ORDER BY o.id DESC 
                        LIMIT 1
                    ");
                    $ordStmt->execute([$currentUserId, $id]);
                    $orderRow = $ordStmt->fetch();
                    if ($orderRow) {
                        $purchased = true;
                        $userOrderId = (int)$orderRow['id'];
                    }
                } catch (Exception $e) {}
            }

            // Verificar se já possui avaliação neste produto
            try {
                $myRevStmt = $db->prepare("SELECT * FROM reviews WHERE product_id = ? AND user_id = ? LIMIT 1");
                $myRevStmt->execute([$id, $currentUserId]);
                $userReview = $myRevStmt->fetch();
                if ($userReview) {
                    $userReview['images'] = [];
                    try {
                        $myImgStmt = $db->prepare("SELECT id, image_url FROM review_images WHERE review_id = ? ORDER BY id ASC");
                        $myImgStmt->execute([$userReview['id']]);
                        $userReview['images'] = $myImgStmt->fetchAll();
                    } catch (Exception $e) {}
                    $userReview['is_verified_purchase'] = !empty($userReview['order_id']);
                }
            } catch (Exception $e) {}
        }

        // Sincronizar pontos com a regra 1 pt por R$ 1,00
        $product['points'] = max(1, (int)round((float)$product['price'] * BUYER_POINTS_PER_REAL));

        echo json_encode([
            'success' => true,
            'product' => $product,
            'images' => $images,
            'reviews' => $reviews,
            'user_can_review' => ($currentUserId > 0 && !$isSeller && $purchased && !$userReview),
            'user_has_purchased' => $purchased,
            'user_is_seller' => $isSeller,
            'user_is_admin' => isUserAdmin($db, $currentUserId),
            'user_review' => $userReview,
            'user_order_id' => $userOrderId
        ]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Erro ao carregar detalhes do produto: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 3. MEUS PRODUTOS (ÁREA DO VENDEDOR)
// ----------------------------------------------------
if ($method === 'GET' && $action === 'my_products') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
        exit;
    }

    try {
        $sellerId = $_SESSION['user_id'];
        $stmt = $db->prepare("SELECT p.*, (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as primary_image 
                              FROM products p 
                              WHERE p.seller_id = ? AND (p.status != 'deleted' OR p.status IS NULL)
                              ORDER BY p.id DESC");
        $stmt->execute([$sellerId]);
        $products = $stmt->fetchAll();

        foreach ($products as &$prod) {
            $prod['points'] = max(1, (int)round((float)$prod['price'] * BUYER_POINTS_PER_REAL));
        }
        unset($prod);

        echo json_encode(['success' => true, 'products' => $products]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Erro ao carregar produtos do vendedor: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 4. CRIAR NOVO PRODUTO (LOCAL UPLOAD DE FOTOS)
// ----------------------------------------------------
if ($method === 'POST' && ($action === 'create' || $action === 'add')) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'É necessário estar logado para cadastrar produtos.']);
        exit;
    }

    $sellerId = $_SESSION['user_id'];
    $name = trim($_POST['name'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $price = (float)($_POST['price'] ?? 0);
    $category = trim($_POST['category'] ?? '');
    $condition = trim($_POST['product_condition'] ?? $_POST['condition'] ?? 'used');
    $material = trim($_POST['material'] ?? '');
    $stock = (int)($_POST['stock'] ?? 1);
    $location = trim($_POST['location'] ?? '');
    if ($location === '') {
        $uStmt = $db->prepare("SELECT city, state FROM users WHERE id = ?");
        $uStmt->execute([$sellerId]);
        $u = $uStmt->fetch();
        $location = $u ? implode(', ', array_filter([$u['city'], $u['state']])) : '';
        if ($location === '') $location = 'São Paulo, SP';
    }

    if (empty($name) || empty($description) || $price <= 0 || empty($category)) {
        echo json_encode(['success' => false, 'error' => 'Preencha os campos obrigatórios (Nome, Descrição, Preço e Categoria).']);
        exit;
    }

    require_once __DIR__ . '/../config/locations.php';
    if (!isValidBrazilLocation($location)) {
        echo json_encode(['success' => false, 'error' => 'Por favor, selecione um município/UF válido da lista pré-determinada.']);
        exit;
    }

    // Cálculo automático de pontos verdes sustentáveis (1 ponto por cada R$ 1,00)
    $points = max(1, (int)round($price * BUYER_POINTS_PER_REAL));

    $stmt = $db->prepare("INSERT INTO products (seller_id, name, description, price, category, product_condition, material, stock, location, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$sellerId, $name, $description, $price, $category, $condition, $material, $stock, $location, $points]);
    $productId = $db->lastInsertId();

    // Processamento de Upload Local de Múltiplas Imagens (1 foto obrigatória, até 5 fotos)
    $uploadedImages = [];
    $uploadDir = __DIR__ . '/../uploads/products/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    $allowedExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (isset($_FILES['images']) && is_array($_FILES['images']['name'])) {
        $count = count($_FILES['images']['name']);
        $maxUploads = min($count, 5);

        for ($key = 0; $key < $maxUploads; $key++) {
            if ($_FILES['images']['error'][$key] === UPLOAD_ERR_OK) {
                $fileTmp = $_FILES['images']['tmp_name'][$key];
                $filename = $_FILES['images']['name'][$key];
                $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

                if (in_array($ext, $allowedExts)) {
                    $newFileName = 'prod_' . $productId . '_' . uniqid() . '_' . $key . '.' . $ext;
                    $targetPath = $uploadDir . $newFileName;

                    if (move_uploaded_file($fileTmp, $targetPath)) {
                        $relUrl = 'uploads/products/' . $newFileName;
                        $isPrimary = (count($uploadedImages) === 0) ? 1 : 0;
                        
                        $imgStmt = $db->prepare("INSERT INTO product_images (product_id, image_url, is_primary, image_order) VALUES (?, ?, ?, ?)");
                        $imgStmt->execute([$productId, $relUrl, $isPrimary, count($uploadedImages)]);
                        $uploadedImages[] = $relUrl;
                    }
                }
            }
        }
    } elseif (isset($_FILES['images']) && is_string($_FILES['images']['name']) && $_FILES['images']['error'] === UPLOAD_ERR_OK) {
        $fileTmp = $_FILES['images']['tmp_name'];
        $filename = $_FILES['images']['name'];
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if (in_array($ext, $allowedExts)) {
            $newFileName = 'prod_' . $productId . '_' . uniqid() . '_0.' . $ext;
            $targetPath = $uploadDir . $newFileName;
            if (move_uploaded_file($fileTmp, $targetPath)) {
                $relUrl = 'uploads/products/' . $newFileName;
                $imgStmt = $db->prepare("INSERT INTO product_images (product_id, image_url, is_primary, image_order) VALUES (?, ?, 1, 0)");
                $imgStmt->execute([$productId, $relUrl]);
                $uploadedImages[] = $relUrl;
            }
        }
    }

    // Se nenhuma imagem válida foi enviada, cancelar o cadastro e retornar erro (1 foto obrigatória)
    if (empty($uploadedImages)) {
        $db->prepare("DELETE FROM products WHERE id = ?")->execute([$productId]);
        echo json_encode(['success' => false, 'error' => 'É obrigatório enviar pelo menos 1 foto válida do produto (JPG, PNG ou WEBP).']);
        exit;
    }

    echo json_encode([
        'success' => true, 
        'message' => 'Produto cadastrado com sucesso!', 
        'product_id' => $productId,
        'images_count' => count($uploadedImages)
    ]);
    exit;
}

// ----------------------------------------------------
// 5. ATUALIZAR PRODUTO EXISTENTE (ÁREA DO VENDEDOR)
// ----------------------------------------------------
if ($method === 'POST' && ($action === 'update' || $action === 'edit')) {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
        exit;
    }

    $sellerId = $_SESSION['user_id'];
    $productId = (int)($_POST['id'] ?? $_POST['product_id'] ?? 0);

    if ($productId <= 0) {
        echo json_encode(['success' => false, 'error' => 'ID do produto inválido.']);
        exit;
    }

    // Verificar se o produto existe e pertence ao vendedor ou se o usuário é administrador
    $isAdmin = isUserAdmin($db, $sellerId);
    if ($isAdmin) {
        $checkStmt = $db->prepare("SELECT * FROM products WHERE id = ?");
        $checkStmt->execute([$productId]);
    } else {
        $checkStmt = $db->prepare("SELECT * FROM products WHERE id = ? AND seller_id = ?");
        $checkStmt->execute([$productId, $sellerId]);
    }
    $existingProduct = $checkStmt->fetch();

    if (!$existingProduct) {
        echo json_encode(['success' => false, 'error' => 'Produto não encontrado ou você não tem permissão para editá-lo.']);
        exit;
    }

    $name = trim($_POST['name'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $price = (float)($_POST['price'] ?? 0);
    $category = trim($_POST['category'] ?? '');
    $condition = trim($_POST['product_condition'] ?? $_POST['condition'] ?? 'used');
    $material = trim($_POST['material'] ?? '');
    $stock = (int)($_POST['stock'] ?? 0);

    if (empty($name) || empty($description) || $price <= 0 || empty($category)) {
        echo json_encode(['success' => false, 'error' => 'Preencha os campos obrigatórios (Nome, Descrição, Preço e Categoria).']);
        exit;
    }

    // Atualiza pontos verdes de acordo com o novo preço (1 ponto por cada R$ 1,00)
    $points = max(1, (int)round($price * BUYER_POINTS_PER_REAL));

    $location = trim($_POST['location'] ?? '');
    if ($location === '') $location = $existingProduct['location'] ?? 'São Paulo, SP';

    require_once __DIR__ . '/../config/locations.php';
    if (!isValidBrazilLocation($location)) {
        echo json_encode(['success' => false, 'error' => 'Por favor, selecione um município/UF válido da lista pré-determinada.']);
        exit;
    }

    if ($isAdmin) {
        $upStmt = $db->prepare("UPDATE products SET 
            name = ?, description = ?, price = ?, category = ?, product_condition = ?, material = ?, stock = ?, location = ?, points = ? 
            WHERE id = ?");
        $upStmt->execute([$name, $description, $price, $category, $condition, $material, $stock, $location, $points, $productId]);
    } else {
        $upStmt = $db->prepare("UPDATE products SET 
            name = ?, description = ?, price = ?, category = ?, product_condition = ?, material = ?, stock = ?, location = ?, points = ? 
            WHERE id = ? AND seller_id = ?");
        $upStmt->execute([$name, $description, $price, $category, $condition, $material, $stock, $location, $points, $productId, $sellerId]);
    }

    // 1. Processar exclusão de imagens removidas pelo usuário
    $removedImageIds = $_POST['removed_image_ids'] ?? [];
    if (!is_array($removedImageIds) && !empty($removedImageIds)) {
        $removedImageIds = explode(',', $removedImageIds);
    }
    if (!empty($removedImageIds)) {
        foreach ($removedImageIds as $remId) {
            $remId = (int)$remId;
            if ($remId > 0) {
                $imgRow = $db->prepare("SELECT image_url FROM product_images WHERE id = ? AND product_id = ?");
                $imgRow->execute([$remId, $productId]);
                $imgData = $imgRow->fetch();
                if ($imgData) {
                    $delStmt = $db->prepare("DELETE FROM product_images WHERE id = ? AND product_id = ?");
                    $delStmt->execute([$remId, $productId]);
                    // Se o arquivo for local, tentar remover do disco
                    $filePath = __DIR__ . '/../' . $imgData['image_url'];
                    if (file_exists($filePath) && strpos($imgData['image_url'], 'uploads/products/') === 0) {
                        @unlink($filePath);
                    }
                }
            }
        }
    }

    // 2. Contar quantas imagens o produto tem atualmente
    $curImgStmt = $db->prepare("SELECT COUNT(*) as total FROM product_images WHERE product_id = ?");
    $curImgStmt->execute([$productId]);
    $currentImageCount = (int)$curImgStmt->fetch()['total'];

    // 3. Processar upload de novas imagens (respeitando limite de 5 fotos no total)
    $uploadedImages = [];
    $uploadDir = __DIR__ . '/../uploads/products/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    $allowedExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (isset($_FILES['images']) && is_array($_FILES['images']['name'])) {
        $count = count($_FILES['images']['name']);
        $availableSlots = max(0, 5 - $currentImageCount);
        $maxUploads = min($count, $availableSlots);

        for ($key = 0; $key < $maxUploads; $key++) {
            if ($_FILES['images']['error'][$key] === UPLOAD_ERR_OK) {
                $fileTmp = $_FILES['images']['tmp_name'][$key];
                $filename = $_FILES['images']['name'][$key];
                $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

                if (in_array($ext, $allowedExts)) {
                    $newFileName = 'prod_' . $productId . '_' . uniqid() . '_' . $key . '.' . $ext;
                    $targetPath = $uploadDir . $newFileName;

                    if (move_uploaded_file($fileTmp, $targetPath)) {
                        $relUrl = 'uploads/products/' . $newFileName;
                        $imgStmt = $db->prepare("INSERT INTO product_images (product_id, image_url, is_primary, image_order) VALUES (?, ?, 0, ?)");
                        $imgStmt->execute([$productId, $relUrl, $currentImageCount + count($uploadedImages)]);
                        $uploadedImages[] = $relUrl;
                    }
                }
            }
        }
    }

    // 4. Garantir que o produto continue tendo pelo menos 1 imagem válida
    $finalImgStmt = $db->prepare("SELECT id, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC");
    $finalImgStmt->execute([$productId]);
    $finalImages = $finalImgStmt->fetchAll();

    if (empty($finalImages)) {
        echo json_encode(['success' => false, 'error' => 'O produto precisa ter pelo menos 1 foto. Não é possível remover todas as fotos.']);
        exit;
    }

    // Garantir que pelo menos uma imagem esteja marcada como is_primary = 1
    $hasPrimary = false;
    foreach ($finalImages as $fImg) {
        if ((int)$fImg['is_primary'] === 1) {
            $hasPrimary = true;
            break;
        }
    }
    if (!$hasPrimary) {
        $firstId = $finalImages[0]['id'];
        $db->prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?")->execute([$firstId]);
    }

    echo json_encode([
        'success' => true,
        'message' => 'Produto atualizado com sucesso!',
        'product_id' => $productId
    ]);
    exit;
}

// ----------------------------------------------------
// 6. DELETAR / INATIVAR PRODUTO
// ----------------------------------------------------
if ($method === 'POST' && $action === 'delete') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
        exit;
    }

    $productId = (int)($_POST['id'] ?? 0);
    $currentUserId = (int)$_SESSION['user_id'];
    $reason = trim($_POST['reason'] ?? '');

    // Buscar dados do produto antes de remover
    $pStmt = $db->prepare("SELECT id, seller_id, name FROM products WHERE id = ?");
    $pStmt->execute([$productId]);
    $product = $pStmt->fetch();

    if (!$product) {
        echo json_encode(['success' => false, 'error' => 'Produto não encontrado.']);
        exit;
    }

    $isOwner = ((int)$product['seller_id'] === $currentUserId);
    $isAdmin = isUserAdmin($db, $currentUserId);

    if (!$isOwner && !$isAdmin) {
        echo json_encode(['success' => false, 'error' => 'Você não tem permissão para excluir este anúncio.']);
        exit;
    }

    // Se for moderação pelo suporte / admin (excluindo produto de outro usuário)
    if ($isAdmin && !$isOwner) {
        if (empty($reason)) {
            $reason = 'Violação das diretrizes e políticas de qualidade da comunidade Re-Store.';
        }

        // 1. Notificação persistente oficial na tabela user_notifications
        try {
            $notifStmt = $db->prepare("INSERT INTO user_notifications (user_id, title, message, type, reason, product_name) VALUES (?, ?, ?, 'moderation', ?, ?)");
            $notifTitle = "Anúncio Removido pela Moderação";
            $notifMsg = "Seu anúncio '{$product['name']}' foi removido do marketplace pelo Suporte Re-Store. Motivo: {$reason}";
            $notifStmt->execute([$product['seller_id'], $notifTitle, $notifMsg, $reason, $product['name']]);
        } catch (Exception $e) {}

        // 2. Mensagem oficial no Chat de Suporte para o vendedor
        try {
            $msgStmt = $db->prepare("INSERT INTO messages (sender_id, receiver_id, message, is_read) VALUES (?, ?, ?, 0)");
            $chatMsg = "Olá! A moderação oficial do Re-Store removeu seu anúncio '{$product['name']}' do marketplace.\n\n📋 Motivo: {$reason}\n\nCaso queira esclarecer dúvidas ou adequar o produto para republicação, você pode responder diretamente por este chat com o suporte.";
            $msgStmt->execute([$currentUserId, $product['seller_id'], $chatMsg]);
        } catch (Exception $e) {}
    }

    // Remover imagens do disco (caso uploads locais)
    try {
        $imgsStmt = $db->prepare("SELECT image_url FROM product_images WHERE product_id = ?");
        $imgsStmt->execute([$productId]);
        foreach ($imgsStmt->fetchAll() as $img) {
            $imgUrl = $img['image_url'];
            if (strpos($imgUrl, 'uploads/products/') === 0) {
                $filePath = __DIR__ . '/../' . $imgUrl;
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
            }
        }
    } catch (Exception $e) {}

    // Remover dos favoritos
    try { $db->prepare("DELETE FROM favorites WHERE product_id = ?")->execute([$productId]); } catch (Exception $e) {}

    // Verificar se o produto já possui pedidos/vendas vinculados (order_items)
    try {
        $checkOrders = $db->prepare("SELECT COUNT(*) FROM order_items WHERE product_id = ?");
        $checkOrders->execute([$productId]);
        $hasOrders = ((int)$checkOrders->fetchColumn()) > 0;

        if ($hasOrders) {
            // Possui compras históricas: marca como 'deleted' e zera estoque para não quebrar integridade referencial dos pedidos
            $upd = $db->prepare("UPDATE products SET status = 'deleted', stock = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $upd->execute([$productId]);
            // Opcional: manter imagens para visualização nos comprovantes de compras passadas, ou remover
        } else {
            // Não possui compras anteriores: remoção completa de imagens e registro
            try { $db->prepare("DELETE FROM product_images WHERE product_id = ?")->execute([$productId]); } catch (Exception $e) {}
            $stmt = $db->prepare("DELETE FROM products WHERE id = ?");
            $stmt->execute([$productId]);
        }
    } catch (Exception $e) {
        // Fallback defensivo caso haja qualquer restrição de chave estrangeira
        try {
            $upd = $db->prepare("UPDATE products SET status = 'deleted', stock = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $upd->execute([$productId]);
        } catch (Exception $ex) {
            echo json_encode(['success' => false, 'error' => 'Erro ao processar exclusão do produto: ' . $ex->getMessage()]);
            exit;
        }
    }

    echo json_encode([
        'success' => true,
        'message' => ($isAdmin && !$isOwner)
            ? 'Anúncio removido pela moderação com sucesso e vendedor notificado!'
            : 'Produto removido com sucesso.'
    ]);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
