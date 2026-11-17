<?php
// api/orders.php
require_once __DIR__ . '/../config/session.php';
restoreStartSession();
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';
require_once __DIR__ . '/../config/gamification.php';
require_once __DIR__ . '/../config/audit.php';

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

    if (empty($items) || !is_array($items)) {
        echo json_encode(['success' => false, 'error' => 'O carrinho está vazio.']);
        exit;
    }

    // Validação no servidor: forma de pagamento padronizada dentre as opções aceitas pelo sistema
    $normalizedPayment = strtolower(trim((string)$paymentMethod));
    if (in_array($normalizedPayment, ['credit', 'credit_card', 'card', 'cartao', 'cartao_credito'], true)) {
        $paymentMethod = 'credit';
    } elseif (in_array($normalizedPayment, ['pix'], true)) {
        $paymentMethod = 'pix';
    } elseif (in_array($normalizedPayment, ['boleto', 'boleto_bancario'], true)) {
        $paymentMethod = 'boleto';
    } else {
        echo json_encode(['success' => false, 'error' => 'Forma de pagamento inválida. Selecione Pix, Cartão de Crédito ou Boleto.']);
        exit;
    }

    // Validação no servidor: cada item precisa de produto válido e quantidade inteira positiva
    $consolidatedItems = [];
    foreach ($items as $chkItem) {
        $chkProductId = is_array($chkItem) ? ($chkItem['product_id'] ?? $chkItem['id'] ?? null) : null;
        $chkQty = is_array($chkItem) ? ($chkItem['quantity'] ?? 1) : null;

        if (
            $chkProductId === null || filter_var($chkProductId, FILTER_VALIDATE_INT) === false || (int)$chkProductId <= 0 ||
            filter_var($chkQty, FILTER_VALIDATE_INT) === false || (int)$chkQty < 1 || (int)$chkQty > 1000
        ) {
            echo json_encode(['success' => false, 'error' => 'Item inválido no carrinho: a quantidade deve ser um número inteiro maior que zero.']);
            exit;
        }
        $pid = (int)$chkProductId;
        $q = (int)$chkQty;
        $consolidatedItems[$pid] = ($consolidatedItems[$pid] ?? 0) + $q;
        if ($consolidatedItems[$pid] > 1000) {
            echo json_encode(['success' => false, 'error' => 'Quantidade máxima por produto excedida.']);
            exit;
        }
    }

    $cleanZip = preg_replace('/\D/', '', $shippingZip);
    if (empty($shippingAddress) || empty($shippingCity) || empty($shippingState) || strlen($cleanZip) !== 8) {
        echo json_encode(['success' => false, 'error' => 'Preencha o endereço completo de entrega com um CEP válido de 8 dígitos.']);
        exit;
    }

    $db->beginTransaction();

    try {
        $totalAmount = 0.0;
        $orderItemsData = [];

        foreach ($consolidatedItems as $productId => $qty) {
            // Buscar produto atualizado e ativo do banco
            $pStmt = $db->prepare("SELECT id, seller_id, price, stock, points, name, status FROM products WHERE id = ?");
            $pStmt->execute([$productId]);
            $product = $pStmt->fetch();

            if (!$product || ($product['status'] ?? '') !== 'active' || (int)$product['stock'] < $qty) {
                $db->rollBack();
                $pName = $product ? $product['name'] : 'Produto';
                echo json_encode(['success' => false, 'error' => "Estoque insuficiente ou anúncio indisponível para o produto: {$pName}"]);
                exit;
            }

            // REGRA ESSENCIAL: Vendedor não pode comprar seus próprios produtos
            if ((int)$product['seller_id'] === (int)$userId) {
                $db->rollBack();
                $pName = $product ? $product['name'] : 'Produto';
                echo json_encode([
                    'success' => false, 
                    'error' => "Você não pode comprar produtos anunciados por você mesmo (\"{$pName}\")."
                ]);
                exit;
            }

            // Decrementar estoque no banco de forma atômica
            $updStock = $db->prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? AND status = 'active'");
            $updStock->execute([$qty, $productId, $qty]);
            if ($updStock->rowCount() <= 0) {
                $db->rollBack();
                $pName = $product ? $product['name'] : 'Produto';
                echo json_encode(['success' => false, 'error' => "Estoque insuficiente para o produto: {$pName}"]);
                exit;
            }

            $itemPrice = (float)$product['price'];
            $itemPoints = max(1, (int)round($itemPrice * BUYER_POINTS_PER_REAL)) * $qty;
            $subtotal = $itemPrice * $qty;

            $totalAmount += $subtotal;

            $orderItemsData[] = [
                'product_id' => $productId,
                'seller_id' => (int)$product['seller_id'],
                'quantity' => $qty,
                'price' => $itemPrice,
                'points' => $itemPoints
            ];
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
        // Pontos Verdes proporcionais ao valor efetivamente pago após desconto
        $totalPointsEarned = $finalTotal > 0 ? max(1, (int)round($finalTotal * BUYER_POINTS_PER_REAL)) : 0;

        // Gerar número de pedido único ex: RES-2026-98341
        $orderNumber = 'RES-' . date('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $status = 'confirmed'; // Confirmação imediata no fluxo 100% simulado
        $clientIp = getClientIp();
        $clientUa = getClientUserAgent();

        // Se usou cupom, consumir atomicamente antes de gravar o pedido (USO ÚNICO)
        if ($discountId) {
            $useCouponStmt = $db->prepare("UPDATE discounts SET is_used = 1 WHERE id = ? AND user_id = ? AND is_used = 0");
            $useCouponStmt->execute([$discountId, $userId]);
            if ($useCouponStmt->rowCount() <= 0) {
                $db->rollBack();
                echo json_encode(['success' => false, 'error' => 'Este cupom já foi utilizado em outra compra.']);
                exit;
            }
        }

        try {
            $orderStmt = $db->prepare("INSERT INTO orders 
                (buyer_id, order_number, total, points_earned, payment_method, shipping_address, shipping_city, shipping_state, shipping_zip, status, coupon_code, discount_amount, ip_address, user_agent) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $orderStmt->execute([
                $userId, $orderNumber, $finalTotal, $totalPointsEarned, 
                $paymentMethod, $shippingAddress, $shippingCity, $shippingState, $shippingZip, $status,
                (!empty($couponCode) && $discountId) ? $couponCode : null,
                $discountAmount,
                $clientIp,
                $clientUa
            ]);
        } catch (Exception $eOrder) {
            $orderStmt = $db->prepare("INSERT INTO orders 
                (buyer_id, order_number, total, points_earned, payment_method, shipping_address, shipping_city, shipping_state, shipping_zip, status, coupon_code, discount_amount) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $orderStmt->execute([
                $userId, $orderNumber, $finalTotal, $totalPointsEarned, 
                $paymentMethod, $shippingAddress, $shippingCity, $shippingState, $shippingZip, $status,
                (!empty($couponCode) && $discountId) ? $couponCode : null,
                $discountAmount
            ]);
        }
        $orderId = $db->lastInsertId();

        // Inserir itens do pedido
        $itemStmt = $db->prepare("INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, points) VALUES (?, ?, ?, ?, ?, ?)");
        foreach ($orderItemsData as $oi) {
            $itemStmt->execute([$orderId, $oi['product_id'], $oi['seller_id'], $oi['quantity'], $oi['price'], $oi['points']]);
        }

        // 1. Creditar pontos ao comprador na tabela users
        if ($totalPointsEarned > 0) {
            $db->prepare("UPDATE users SET points = points + ? WHERE id = ?")->execute([$totalPointsEarned, $userId]);
            // Registrar no histórico de pontos do comprador
            $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'purchase', ?, ?)")
               ->execute([$userId, $totalPointsEarned, "Pontos ganhos no pedido #{$orderNumber}", $orderId]);
        }

        // Atualizar endereço no cadastro do usuário para futuras compras
        $db->prepare("UPDATE users SET address = ?, city = ?, state = ?, zip_code = ? WHERE id = ?")
           ->execute([$shippingAddress, $shippingCity, $shippingState, $shippingZip, $userId]);

        // Atualizar nível de engajamento do comprador
        $newBuyerLevel = updateUserEngagementLevel($db, $userId);

        // 2. SISTEMA DE BÔNUS E INCENTIVOS DO VENDEDOR
        // Agrupar itens por vendedor para creditar incentivos escalonados
        $sellersGrouped = [];
        foreach ($orderItemsData as $oi) {
            $sId = (int)$oi['seller_id'];
            if ($sId <= 0) continue;
            if (!isset($sellersGrouped[$sId])) {
                $sellersGrouped[$sId] = [
                    'subtotal' => 0.0,
                    'count' => 0
                ];
            }
            $sellersGrouped[$sId]['subtotal'] += ($oi['price'] * $oi['quantity']);
            $sellersGrouped[$sId]['count'] += $oi['quantity'];
        }

        foreach ($sellersGrouped as $sId => $sInfo) {
            if ($sId <= 0) continue;
            try {
                // Verificar se o vendedor existe de verdade no banco antes de creditar
                $sellerCheck = $db->prepare("SELECT id FROM users WHERE id = ?");
                $sellerCheck->execute([$sId]);
                if (!$sellerCheck->fetch()) continue;

                $tierInfo = getSellerTierInfo($db, $sId);
                $tierName = $tierInfo['tier_name'];
                $sellerRate = $tierInfo['rate'];
                $subtotalVendido = $sInfo['subtotal'];

                // Bônus proporcional de venda (menor que o do comprador, escalonado com o nível de vendedor)
                $sellerBasePoints = max(1, (int)round($subtotalVendido * $sellerRate));
                $milestoneBonus = $tierInfo['milestone_bonus'];
                $totalSellerPoints = $sellerBasePoints + $milestoneBonus;

                // Creditar pontos ao vendedor
                $db->prepare("UPDATE users SET points = points + ? WHERE id = ?")->execute([$totalSellerPoints, $sId]);

                // Registrar no histórico de pontos do vendedor
                $desc = "Bônus de Venda ({$tierName}) no pedido #{$orderNumber} (+{$sellerBasePoints} pts)";
                if ($milestoneBonus > 0 && !empty($tierInfo['milestone_text'])) {
                    $desc .= " + Bônus Especial: {$tierInfo['milestone_text']} (+{$milestoneBonus} pts)";
                }

                $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'sale', ?, ?)")
                   ->execute([$sId, $totalSellerPoints, $desc, $orderId]);

                // Atualizar nível de engajamento geral do vendedor
                updateUserEngagementLevel($db, $sId);
            } catch (Exception $sellerEx) {
                // Falha secundária no bônus do vendedor nunca interrompe a compra do cliente
                error_log("Aviso: Falha ao conceder bônus de venda ao vendedor {$sId}: " . $sellerEx->getMessage());
            }
        }

        $db->commit();

        writeAuditLog($db, $userId, 'order_created', [
            'order_id' => $orderId,
            'order_number' => $orderNumber,
            'total' => $finalTotal,
            'points_earned' => $totalPointsEarned
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Compra realizada com sucesso!',
            'order_id' => $orderId,
            'order_number' => $orderNumber,
            'subtotal' => $totalAmount,
            'discount_amount' => $discountAmount,
            'coupon_code' => $couponCode,
            'total' => $finalTotal,
            'points_earned' => $totalPointsEarned,
            'new_level' => $newBuyerLevel
        ]);
        exit;

    } catch (Exception $e) {
        $db->rollBack();
        error_log('Erro em api/orders.php?action=checkout: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Ocorreu um erro interno ao processar o pedido. Tente novamente.']);
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
        unset($ord['ip_address'], $ord['user_agent']);
        $itemStmt = $db->prepare("SELECT oi.*, p.name as product_name, p.category, 
                                 (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image,
                                 u.name as seller_name,
                                 EXISTS(SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.user_id = ?) as user_reviewed
                                 FROM order_items oi 
                                 JOIN products p ON oi.product_id = p.id 
                                 JOIN users u ON oi.seller_id = u.id 
                                 WHERE oi.order_id = ?");
        $itemStmt->execute([$userId, $ord['id']]);
        $ord['items'] = $itemStmt->fetchAll();
    }
    unset($ord);

    echo json_encode(['success' => true, 'orders' => $orders]);
    exit;
}

// ----------------------------------------------------
// 3. LISTAR VENDAS DO VENDEDOR
// ----------------------------------------------------
if ($method === 'GET' && $action === 'list_seller') {
    $stmt = $db->prepare("SELECT DISTINCT o.id, o.order_number, o.status, o.shipping_city, o.shipping_state, o.created_at, o.updated_at, u.name as buyer_name 
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

        $sellerSubtotal = 0.0;
        foreach ($sale['items'] as $si) {
            $sellerSubtotal += ((float)$si['price'] * (int)$si['quantity']);
        }
        $sale['seller_subtotal'] = round($sellerSubtotal, 2);
    }
    unset($sale);

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

    $db->beginTransaction();
    try {
        $db->prepare("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$orderId]);

        // 1. Estornar pontos ganhos com a compra (comprador), revogando cupons não utilizados se o saldo atual não cobrir o estorno
        if ((int)$order['points_earned'] > 0) {
            $buyerPts = (int)$order['points_earned'];
            $ptsStmt = $db->prepare("SELECT points FROM users WHERE id = ?");
            $ptsStmt->execute([$userId]);
            $currentPoints = (int)($ptsStmt->fetchColumn() ?? 0);

            if ($currentPoints < $buyerPts) {
                $unusedStmt = $db->prepare("SELECT id, code, points_cost FROM discounts WHERE user_id = ? AND is_used = 0 ORDER BY id DESC");
                $unusedStmt->execute([$userId]);
                $unusedCoupons = $unusedStmt->fetchAll();

                foreach ($unusedCoupons as $uc) {
                    if ($currentPoints >= $buyerPts) {
                        break;
                    }
                    $delCouponStmt = $db->prepare("DELETE FROM discounts WHERE id = ? AND user_id = ? AND is_used = 0");
                    $delCouponStmt->execute([(int)$uc['id'], $userId]);
                    if ($delCouponStmt->rowCount() > 0) {
                        $refundCost = (int)$uc['points_cost'];
                        $currentPoints += $refundCost;
                        try {
                            $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'reversal', ?, ?)")
                               ->execute([$userId, $refundCost, "Cancelamento automático do cupom #{$uc['code']} para estorno do pedido #{$order['order_number']}", $orderId]);
                        } catch (Exception $eUc) {}
                    }
                }
            }

            if ($currentPoints < $buyerPts) {
                $db->rollBack();
                echo json_encode([
                    'success' => false,
                    'error' => 'Não é possível cancelar este pedido pois os Pontos Verdes gerados por ele já foram utilizados no resgate de cupons consumidos.'
                ]);
                exit;
            }

            $newBalance = $currentPoints - $buyerPts;
            $db->prepare("UPDATE users SET points = ? WHERE id = ?")->execute([$newBalance, $userId]);

            try {
                $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'reversal', ?, ?)")
                   ->execute([$userId, -$buyerPts, "Estorno de pontos pelo cancelamento do pedido #{$order['order_number']}", $orderId]);
            } catch (Exception $ePh) {
                try {
                    $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'purchase', ?, ?)")
                       ->execute([$userId, -$buyerPts, "Estorno de pontos pelo cancelamento do pedido #{$order['order_number']}", $orderId]);
                } catch (Exception $ePh2) {}
            }
            updateUserEngagementLevel($db, $userId);
        }

        // 2. Reativar o cupom de desconto usado nesta compra para ficar disponível novamente!
        $couponRestored = false;
        if (!empty($order['coupon_code'])) {
            $db->prepare("UPDATE discounts SET is_used = 0 WHERE code = ? AND user_id = ?")->execute([$order['coupon_code'], $userId]);
            $couponRestored = true;
        }

        // 3. Restaurar estoque dos produtos comprados
        $itemsStmt = $db->prepare("SELECT product_id, quantity FROM order_items WHERE order_id = ?");
        $itemsStmt->execute([$orderId]);
        $orderItems = $itemsStmt->fetchAll();
        foreach ($orderItems as $oi) {
            $db->prepare("UPDATE products SET stock = stock + ? WHERE id = ?")->execute([$oi['quantity'], $oi['product_id']]);
        }

        // 4. Estornar pontos de incentivo concedidos ao(s) vendedor(es) neste pedido
        $sellerPointsStmt = $db->prepare("SELECT user_id, points FROM points_history WHERE order_id = ? AND type = 'sale'");
        $sellerPointsStmt->execute([$orderId]);
        $sellerHistRows = $sellerPointsStmt->fetchAll();
        foreach ($sellerHistRows as $shr) {
            $sId = (int)$shr['user_id'];
            $sPts = (int)$shr['points'];
            if ($sPts > 0 && $sId > 0) {
                try {
                    $db->prepare("UPDATE users SET points = CASE WHEN points >= ? THEN points - ? ELSE 0 END WHERE id = ?")
                       ->execute([$sPts, $sPts, $sId]);
                    try {
                        $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'sale_reversal', ?, ?)")
                           ->execute([$sId, -$sPts, "Estorno de bônus de venda pelo cancelamento do pedido #{$order['order_number']}", $orderId]);
                    } catch (Exception $ePh) {
                        try {
                            $db->prepare("INSERT INTO points_history (user_id, points, type, description, order_id) VALUES (?, ?, 'sale', ?, ?)")
                               ->execute([$sId, -$sPts, "Estorno de bônus de venda pelo cancelamento do pedido #{$order['order_number']}", $orderId]);
                        } catch (Exception $ePh2) {}
                    }
                    updateUserEngagementLevel($db, $sId);
                } catch (Exception $eSellerRev) {
                    error_log("Aviso: Falha ao estornar bônus do vendedor {$sId}: " . $eSellerRev->getMessage());
                }
            }
        }

        $db->commit();

        writeAuditLog($db, $userId, 'order_cancelled', [
            'order_id' => $orderId,
            'order_number' => $order['order_number'] ?? null,
            'coupon_restored' => $couponRestored
        ]);

        $msg = 'Pedido cancelado com sucesso.';
        if ($couponRestored) {
            $msg .= " O cupom {$order['coupon_code']} foi reativado e já está disponível para uso novamente!";
        }

        echo json_encode([
            'success' => true, 
            'message' => $msg, 
            'coupon_restored' => $couponRestored,
            'coupon_code' => $order['coupon_code'] ?? null
        ]);
        exit;
    } catch (Exception $e) {
        $db->rollBack();
        error_log('Erro em api/orders.php?action=cancel: ' . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Erro interno ao cancelar pedido.']);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
