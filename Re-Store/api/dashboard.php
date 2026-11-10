<?php
// api/dashboard.php
require_once __DIR__ . '/../config/session.php';
restoreStartSession();

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';
require_once __DIR__ . '/../config/gamification.php';

initializeDatabase();
$db = getDbConnection();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
    exit;
}

$sellerId = (int)$_SESSION['user_id'];

// 1. Total de Produtos Ativos
$pStmt = $db->prepare("SELECT COUNT(*) as total FROM products WHERE seller_id = ? AND status = 'active'");
$pStmt->execute([$sellerId]);
$totalActiveProducts = (int)$pStmt->fetch()['total'];

// 2. Alerta de Estoque Baixo (estoque <= 3)
$lowStockStmt = $db->prepare("SELECT COUNT(*) as total FROM products WHERE seller_id = ? AND status = 'active' AND stock <= 3");
$lowStockStmt->execute([$sellerId]);
$lowStockCount = (int)$lowStockStmt->fetch()['total'];

// 3. Vendas Realizadas, Produtos Vendidos e Faturamento Total (excluindo pedidos cancelados)
$salesStmt = $db->prepare("SELECT 
    COALESCE(SUM(CASE WHEN LOWER(o.status) != 'cancelled' THEN oi.quantity ELSE 0 END), 0) as total_products_sold,
    COUNT(DISTINCT CASE WHEN LOWER(o.status) != 'cancelled' THEN oi.order_id ELSE NULL END) as total_orders,
    COALESCE(SUM(CASE WHEN LOWER(o.status) != 'cancelled' THEN (oi.price * oi.quantity) ELSE 0 END), 0.0) as total_revenue,
    COALESCE(SUM(CASE WHEN LOWER(o.status) = 'cancelled' THEN oi.quantity ELSE 0 END), 0) as total_cancelled_products,
    COUNT(DISTINCT CASE WHEN LOWER(o.status) = 'cancelled' THEN oi.order_id ELSE NULL END) as total_cancelled_orders
FROM order_items oi 
JOIN orders o ON oi.order_id = o.id 
WHERE oi.seller_id = ?");
$salesStmt->execute([$sellerId]);
$salesData = $salesStmt->fetch();

$totalProductsSold = (int)($salesData['total_products_sold'] ?? 0);
$totalOrders = (int)($salesData['total_orders'] ?? 0);
$totalRevenue = (float)($salesData['total_revenue'] ?? 0.0);
$totalCancelledProducts = (int)($salesData['total_cancelled_products'] ?? 0);
$totalCancelledOrders = (int)($salesData['total_cancelled_orders'] ?? 0);

// 4. Últimas Vendas (incluindo status do pedido para detecção de cancelamentos)
$recentSalesStmt = $db->prepare("SELECT oi.*, p.name as product_name, o.order_number, o.status as order_status, o.created_at as order_date, u.name as buyer_name 
                                 FROM order_items oi 
                                 JOIN products p ON oi.product_id = p.id 
                                 JOIN orders o ON oi.order_id = o.id 
                                 JOIN users u ON o.buyer_id = u.id 
                                 WHERE oi.seller_id = ? 
                                 ORDER BY oi.id DESC LIMIT 10");
$recentSalesStmt->execute([$sellerId]);
$recentSales = $recentSalesStmt->fetchAll();

// 5. Nível e Bônus de Gamificação do Vendedor
$sellerTier = getSellerTierInfo($db, $sellerId);

echo json_encode([
    'success' => true,
    'metrics' => [
        'active_products' => $totalActiveProducts,
        'low_stock_count' => $lowStockCount,
        'total_sales' => $totalProductsSold,
        'total_products_sold' => $totalProductsSold,
        'total_orders' => $totalOrders,
        'total_revenue' => $totalRevenue,
        'total_cancelled_products' => $totalCancelledProducts,
        'total_cancelled_orders' => $totalCancelledOrders
    ],
    'seller_tier' => $sellerTier,
    'recent_sales' => $recentSales
]);
