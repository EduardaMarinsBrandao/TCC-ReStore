<?php
// api/orders.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'É necessário estar logado para acessar pedidos.']);
    exit;
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$userId = $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? 'list_buyer';

// ----------------------------------------------------
// 1. SIMULAR CHECKOUT E CRIAR PEDIDO
// ----------------------------------------------------
if ($method === 'POST' && ($action === 'create' || $action === 'checkout')) {

    $items = $data['items'] ?? [];
    $paymentMethod = $data['payment_method'] ?? 'pix';
    $shippingAddress = trim($data['shipping_address'] ?? '');
    $shippingCity = trim($data['shipping_city'] ?? '');
    $shippingState = trim($data['shipping_state'] ?? '');
    $shippingZip = trim($data['shipping_zip'] ?? '');

    if (empty($items)) {
        echo json_encode(['success' => false, 'error' => 'O carrinho está vazio.']);
        exit;
    }

    if (empty($shippingAddress) || empty($shippingCity) || empty($shippingState)) {
        echo json_encode(['success' => false, 'error' => 'Preencha o endereço completo de entrega.']);
        exit;
    }

    $db->beginTransaction();

    try {
        $totalAmount = 0.0;
        $totalPointsEarned = 0;
        $orderItemsData = [];

        foreach ($items as $item) {
            $productId = (int)($item['product_id'] ?? 0);
            $qty = (int)($item['quantity'] ?? 1);

            // Buscar produto atualizado do banco
            $pStmt = $db->prepare("SELECT id, seller_id, price, stock, points, name FROM products WHERE id = ?");
            $pStmt->execute([$productId]);
            $product = $pStmt->fetch();

            if (!$product || $product['stock'] < $qty) {
                $db->rollBack();
                $pName = $product ? $product['name'] : 'Produto';
                echo json_encode(['success' => false, 'error' => "Estoque insuficiente para o produto: {$pName}"]);
                exit;
            }

            $itemPrice = (float)$product['price'];
            $itemPoints = (int)$product['points'] * $qty;
            $subtotal = $itemPrice * $qty;

            $totalAmount += $subtotal;
            $totalPointsEarned += $itemPoints;

            $orderItemsData[] = [
                'product_id' => $productId,
                'seller_id' => $product['seller_id'],
                'quantity' => $qty,
                'price' => $itemPrice,
                'points' => $itemPoints
            ];

            // Decrementar estoque no banco
            $db->prepare("UPDATE products SET stock = stock - ? WHERE id = ?")->execute([$qty, $productId]);
        }

        $couponCode = trim($data['coupon_code'] ?? '');
        $discountAmount = 0.0;
        $discountId = null;

        if (!empty($couponCode)) {
            $cStmt = $db->prepare("SELECT * FROM discounts WHERE code = ? AND user_id = ?");
            $cStmt->execute([$couponCode, $userId]);
            $coupon = $cStmt->fetch();

            if (!$coupon) {
                $db->rollBack();
                echo json_encode(['success' => false, 'error' => 'Cupom de desconto não encontrado.']);
                exit;
            }

            if ((int)$coupon['is_used'] === 1) {
                $db->rollBack();
                echo json_encode(['success' => false, 'error' => 'Este cupom já foi utilizado em outra compra.']);
                exit;
            }

            $discountId = $coupon['id'];
            $dType = $coupon['discount_type'];

            if ($dType === '5%') $discountAmount = $totalAmount * 0.05;
            else if ($dType === '10%') $discountAmount = $totalAmount * 0.10;
            else if ($dType === '15%') $discountAmount = $totalAmount * 0.15;
            else if ($dType === '20%') $discountAmount = $totalAmount * 0.20;
            else if ($dType === 'free_shipping') $discountAmount = 0.0; // Frete já é grátis
        }

        $finalTotal = max(0, $totalAmount - $discountAmount);

        // Gerar número de pedido único ex: RES-2026-98341
        $orderNumber = 'RES-' . date('Y') . '-' . strtoupper(substr(uniqid(), -5));
        $status = 'confirmed'; // Confirmação imediata no fluxo 100% simulado

        $orderStmt = $db->prepare("INSERT INTO orders 
            (buyer_id, order_number, total, points_earned, payment_method, shipping_address, shipping_city, shipping_state, shipping_zip, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $orderStmt->execute([
            $userId, $orderNumber, $finalTotal, $totalPointsEarned, 
            $paymentMethod, $shippingAddress, $shippingCity, $shippingState, $shippingZip, $status
        ]);
        $orderId = $db->lastInsertId();

        // Se usou cupom, marcar como utilizado no banco (USO ÚNICO)
        if ($discountId) {
            $db->prepare("UPDATE discounts SET is_used = 1 WHERE id = ?")->execute([$discountId]);
        }

        // Inserir itens do pedido
        $itemStmt = $db->prepare("INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, points) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($orderItemsData as $oi) {
            $itemStmt->execute([$orderId, $oi['product_id'], $oi['seller_id'], $oi['quantity'], $oi['price'], $oi['points']]);
        }

        // Creditar pontos ao comprador na tabela users
        $db->prepare("UPDATE users SET points = points + ? WHERE id = ?")->execute([$totalPointsEarned, $userId]);

        // Registrar no histórico de pontos
        $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'purchase', ?, ?)")
           ->execute([$userId, $totalPointsEarned, "Pontos ganhos no pedido #{$orderNumber}", $orderId]);

        // Atualizar nível do usuário baseado no saldo total de pontos
        $userStmt = $db->prepare("SELECT points FROM users WHERE id = ?");
        $userStmt->execute([$userId]);
        $currentPoints = (int)$userStmt->fetch()['points'];

        $newLevel = 1;
        if ($currentPoints >= 2500) $newLevel = 4;
        else if ($currentPoints >= 1000) $newLevel = 3;
        else if ($currentPoints >= 500) $newLevel = 2;

        $db->prepare("UPDATE users SET level = ? WHERE id = ?")->execute([$newLevel, $userId]);

        $db->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Compra realizada com sucesso!',
            'order_id' => $orderId,
            'order_number' => $orderNumber,
            'total' => $totalAmount,
            'points_earned' => $totalPointsEarned,
            'new_level' => $newLevel
        ]);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        echo json_encode(['success' => false, 'error' => 'Ocorreu um erro ao processar o pedido: ' . $e->getMessage()]);
        exit;
    }
}

// ----------------------------------------------------
// 2. LISTAR PEDIDOS DO COMPRADOR
// ----------------------------------------------------
if ($method === 'GET' && ($action === 'list_buyer' || $action === 'my_orders')) {
    $stmt = $db->prepare("SELECT o.* FROM orders o WHERE o.buyer_id = ? ORDER BY o.id DESC");
    $stmt->execute([$userId]);
    $orders = $stmt->fetchAll();

    foreach ($orders as &$ord) {
        $itemStmt = $db->prepare("SELECT oi.*, p.name as product_name, p.category, 
                                 (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image,
                                 u.name as seller_name 
                                 FROM order_items oi 
                                 JOIN products p ON oi.product_id = p.id 
                                 JOIN users u ON oi.seller_id = u.id 
                                 WHERE oi.order_id = ?");
        $itemStmt->execute([$ord['id']]);
        $ord['items'] = $itemStmt->fetchAll();
    }

    echo json_encode(['success' => true, 'orders' => $orders]);
    exit;
}

// ----------------------------------------------------
// 3. LISTAR VENDAS DO VENDEDOR
// ----------------------------------------------------
if ($method === 'GET' && $action === 'list_seller') {
    $stmt = $db->prepare("SELECT DISTINCT o.*, u.name as buyer_name, u.email as buyer_email 
                          FROM orders o 
                          JOIN order_items oi ON o.id = oi.order_id 
                          JOIN users u ON o.buyer_id = u.id 
                          WHERE oi.seller_id = ? 
                          ORDER BY o.id DESC");
    $stmt->execute([$userId]);
    $sales = $stmt->fetchAll();

    foreach ($sales as &$sale) {
        $itemStmt = $db->prepare("SELECT oi.*, p.name as product_name, 
                                 (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image 
                                 FROM order_items oi 
                                 JOIN products p ON oi.product_id = p.id 
                                 WHERE oi.order_id = ? AND oi.seller_id = ?");
        $itemStmt->execute([$sale['id'], $userId]);
        $sale['items'] = $itemStmt->fetchAll();
    }

    echo json_encode(['success' => true, 'sales' => $sales]);
    exit;
}

// ----------------------------------------------------
// 4. CANCELAR PEDIDO
// ----------------------------------------------------
if ($method === 'POST' && $action === 'cancel') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?? $_POST;
    $orderId = (int)($data['order_id'] ?? 0);

    $stmt = $db->prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?");
    $stmt->execute([$orderId, $userId]);
    $order = $stmt->fetch();

    if (!$order) {
        echo json_encode(['success' => false, 'error' => 'Pedido não encontrado.']);
        exit;
    }

    if ($order['status'] === 'cancelled') {
        echo json_encode(['success' => false, 'error' => 'Este pedido já está cancelado.']);
        exit;
    }

    $db->prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?")->execute([$orderId]);
    echo json_encode(['success' => true, 'message' => 'Pedido cancelado com sucesso.']);
    exit;
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
