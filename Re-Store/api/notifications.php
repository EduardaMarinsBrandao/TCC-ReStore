<?php
// api/notifications.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => true, 'notifications' => []]);
    exit;
}

$userId = $_SESSION['user_id'];
$notifications = [];

// 1. Notificações de Pedidos Recentes como Comprador
$oStmt = $db->prepare("SELECT id, order_number, total, points_earned, status, created_at FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 3");
$oStmt->execute([$userId]);
$userOrders = $oStmt->fetchAll();

foreach ($userOrders as $o) {
    $notifications[] = [
        'id' => 'order_' . $o['id'],
        'title' => 'Pedido Confirmo!',
        'message' => "Seu pedido #{$o['order_number']} de R$ " . number_format($o['total'], 2, ',', '.') . " foi confirmado. You ganhou +{$o['points_earned']} Pontos Verdes!",
        'type' => 'success',
        'time' => $o['created_at']
    ];
}

// 2. Notificações de Vendas para o Vendedor
$sStmt = $db->prepare("SELECT oi.*, p.name as product_name, o.order_number, o.created_at 
                        FROM order_items oi 
                        JOIN products p ON oi.product_id = p.id 
                        JOIN orders o ON oi.order_id = o.id 
                        WHERE oi.seller_id = ? ORDER BY oi.id DESC LIMIT 3");
$sStmt->execute([$userId]);
$sales = $sStmt->fetchAll();

foreach ($sales as $s) {
    $notifications[] = [
        'id' => 'sale_' . $s['id'],
        'title' => 'Nova Venda Realizada! 🛒',
        'message' => "Você vendeu {$s['quantity']}x '{$s['product_name']}' no pedido #{$s['order_number']}.",
        'type' => 'info',
        'time' => $s['created_at']
    ];
}

// 3. Notificações de Mensagens Não Lidas
$mStmt = $db->prepare("SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.receiver_id = ? AND m.is_read = 0 ORDER BY m.id DESC LIMIT 3");
$mStmt->execute([$userId]);
$unreadMsgs = $mStmt->fetchAll();

foreach ($unreadMsgs as $m) {
    $notifications[] = [
        'id' => 'msg_' . $m['id'],
        'title' => "Nova mensagem de {$m['sender_name']} 💬",
        'message' => mb_strimwidth($m['message'], 0, 60, "..."),
        'type' => 'chat',
        'time' => $m['created_at']
    ];
}

echo json_encode(['success' => true, 'notifications' => $notifications]);
