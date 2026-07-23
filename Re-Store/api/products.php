<?php
// api/products.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

// ----------------------------------------------------
// 1. LISTAR PRODUTOS (COM FILTROS)
// ----------------------------------------------------
if ($method === 'GET' && $action === 'list') {
    $search = trim($_GET['search'] ?? '');
    $category = trim($_GET['category'] ?? '');
    $condition = trim($_GET['condition'] ?? '');
    $minPrice = isset($_GET['min_price']) && $_GET['min_price'] !== '' ? (float)$_GET['min_price'] : null;
    $maxPrice = isset($_GET['max_price']) && $_GET['max_price'] !== '' ? (float)$_GET['max_price'] : null;
    $sellerId = isset($_GET['seller_id']) ? (int)$_GET['seller_id'] : null;
    $location = trim($_GET['location'] ?? '');

    $sql = "SELECT p.*, u.name as seller_name, u.avatar as seller_avatar, u.is_verified_business, u.business_name 
            FROM products p 
            JOIN users u ON p.seller_id = u.id 
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

    $sql .= " ORDER BY p.id DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $products = $stmt->fetchAll();

    // Carregar imagem principal para cada produto
    foreach ($products as &$prod) {
        $imgStmt = $db->prepare("SELECT image_url FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1");
        $imgStmt->execute([$prod['id']]);
        $primaryImg = $imgStmt->fetch();
        $prod['primary_image'] = $primaryImg ? $primaryImg['image_url'] : 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600';
    }

    echo json_encode(['success' => true, 'products' => $products]);
    exit;
}

// ----------------------------------------------------
// 2. DETALHES DO PRODUTO
// ----------------------------------------------------
if ($method === 'GET' && $action === 'detail') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) {
        echo json_encode(['success' => false, 'error' => 'ID do produto inválido.']);
        exit;
    }

    // Incrementa contagem de visualizações
    $db->prepare("UPDATE products SET views = views + 1 WHERE id = ?")->execute([$id]);

    $stmt = $db->prepare("SELECT p.*, u.name as seller_name, u.email as seller_email, u.avatar as seller_avatar, u.phone as seller_phone, u.city as seller_city, u.state as seller_state, u.is_verified_business, u.business_name 
                          FROM products p 
                          JOIN users u ON p.seller_id = u.id 
                          WHERE p.id = ?");
    $stmt->execute([$id]);
    $product = $stmt->fetch();

    if (!$product) {
        echo json_encode(['success' => false, 'error' => 'Produto não encontrado.']);
        exit;
    }

    // Buscar todas as imagens do produto
    $imgStmt = $db->prepare("SELECT id, image_url, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, id ASC");
    $imgStmt->execute([$id]);
    $images = $imgStmt->fetchAll();

    if (empty($images)) {
        $images = [['id' => 0, 'image_url' => 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600', 'is_primary' => 1]];
    }

    // Buscar avaliações do produto
    $revStmt = $db->prepare("SELECT r.*, u.name as user_name, u.avatar as user_avatar 
                            FROM reviews r 
                            JOIN users u ON r.user_id = u.id 
                            WHERE r.product_id = ? 
                            ORDER BY r.id DESC");
    $revStmt->execute([$id]);
    $reviews = $revStmt->fetchAll();

    echo json_encode([
        'success' => true,
        'product' => $product,
        'images' => $images,
        'reviews' => $reviews
    ]);
    exit;
}

// ----------------------------------------------------
// 3. MEUS PRODUTOS (ÁREA DO VENDEDOR)
// ----------------------------------------------------
if ($method === 'GET' && $action === 'my_products') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
        exit;
    }

    $sellerId = $_SESSION['user_id'];
    $stmt = $db->prepare("SELECT p.*, (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as primary_image 
                          FROM products p 
                          WHERE p.seller_id = ? 
                          ORDER BY p.id DESC");
    $stmt->execute([$sellerId]);
    $products = $stmt->fetchAll();

    echo json_encode(['success' => true, 'products' => $products]);
    exit;
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
    $location = trim($_POST['location'] ?? 'São Paulo, SP');

    if (empty($name) || empty($description) || $price <= 0 || empty($category)) {
        echo json_encode(['success' => false, 'error' => 'Preencha os campos obrigatórios (Nome, Descrição, Preço e Categoria).']);
        exit;
    }

    // Cálculo automático de pontos verdes sustentáveis (ex: 2 pontos por cada R$ 1,00)
    $points = (int)round($price * 2);

    $stmt = $db->prepare("INSERT INTO products (seller_id, name, description, price, category, product_condition, material, stock, location, points) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$sellerId, $name, $description, $price, $category, $condition, $material, $stock, $location, $points]);
    $productId = $db->lastInsertId();

    // Processamento de Upload Local de Múltiplas Imagens
    $uploadedImages = [];
    if (isset($_FILES['images']) && is_array($_FILES['images']['name'])) {
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
        $uploadDir = __DIR__ . '/../uploads/products/';

        foreach ($_FILES['images']['name'] as $key => $filename) {
            if ($_FILES['images']['error'][$key] === UPLOAD_ERR_OK) {
                $fileTmp = $_FILES['images']['tmp_name'][$key];
                $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

                if (in_array($ext, $allowedExts)) {
                    $newFileName = 'prod_' . $productId . '_' . uniqid() . '_' . $key . '.' . $ext;
                    $targetPath = $uploadDir . $newFileName;

                    if (move_uploaded_file($fileTmp, $targetPath)) {
                        $relUrl = 'uploads/products/' . $newFileName;
                        $isPrimary = ($key === 0) ? 1 : 0;
                        
                        $imgStmt = $db->prepare("INSERT INTO product_images (product_id, image_url, is_primary, image_order) VALUES (?, ?, ?, ?)");
                        $imgStmt->execute([$productId, $relUrl, $isPrimary, $key]);
                        $uploadedImages[] = $relUrl;
                    }
                }
            }
        }
    }

    // Se nenhuma imagem foi enviada via upload, usar uma imagem sustentável padrão de fallback
    if (empty($uploadedImages)) {
        $defaultImg = 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600';
        $db->prepare("INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, 1)")->execute([$productId, $defaultImg]);
    }

    echo json_encode(['success' => true, 'message' => 'Produto cadastrado com sucesso!', 'product_id' => $productId]);
    exit;
}

// ----------------------------------------------------
// 5. DELETAR / INATIVAR PRODUTO
// ----------------------------------------------------
if ($method === 'POST' && $action === 'delete') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
        exit;
    }

    $productId = (int)($_POST['id'] ?? 0);
    $sellerId = $_SESSION['user_id'];

    $stmt = $db->prepare("DELETE FROM products WHERE id = ? AND seller_id = ?");
    $stmt->execute([$productId, $sellerId]);

    echo json_encode(['success' => true, 'message' => 'Produto removido com sucesso.']);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
