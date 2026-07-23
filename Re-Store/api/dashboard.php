<?php
// api/dashboard.php
header('Content-Type: application/json; charset=utf-8');
session_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';

initializeDatabase();
$db = getDbConnection();

if (!isset($_SESSION['user_id'])) {
    echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
    exit;
}

$sellerId = $_SESSION['user_id'];

// 1. Total de Produtos Ativos
$pStmt = $db->prepare("SELECT COUNT(*) as total FROM products WHERE seller_id = ? AND status = 'active'");
$pStmt->execute([$sellerId]);
$totalActiveProducts = (int)$pStmt->fetch()['total'];

// 2. Alerta de Estoque Baixo (estoque <= 3)
$lowStockStmt = $db->prepare("SELECT COUNT(*) as total FROM products WHERE seller_id = ? AND status = 'active' AND stock <= 3");
$lowStockStmt->execute([$sellerId]);
$lowStockCount = (int)$lowStockStmt->fetch()['total'];

// 3. Vendas Realizadas e Faturamento Total
$salesStmt = $db->prepare("SELECT COUNT(DISTINCT oi.order_id) as total_sales, SUM(oi.price * oi.quantity) as total_revenue 
                           FROM order_items oi 
                           JOIN orders o ON oi.order_id = o.id 
                           WHERE oi.seller_id = ? AND o.status != 'cancelled'");
$salesStmt->execute([$sellerId]);
$salesData = $salesStmt->fetch();

$totalSales = (int)($salesData['total_sales'] ?? 0);
$totalRevenue = (float)($salesData['total_revenue'] ?? 0.0);

// 4. Últimas Vendas
$recentSalesStmt = $db->prepare("SELECT oi.*, p.name as product_name, o.order_number, o.created_at as order_date, u.name as buyer_name 
                                 FROM order_items oi 
                                 JOIN products p ON oi.product_id = p.id 
                                 JOIN orders o ON oi.order_id = o.id 
                                 JOIN users u ON o.buyer_id = u.id 
                                 WHERE oi.seller_id = ? 
                                 ORDER BY oi.id DESC LIMIT 5");
$recentSalesStmt->execute([$sellerId]);
$recentSales = $recentSalesStmt->fetchAll();

echo json_encode([
    'success' => true,
    'metrics' => [
        'active_products' => $totalActiveProducts,
        'low_stock_count' => $lowStockCount,
        'total_sales' => $totalSales,
        'total_revenue' => $totalRevenue
    ],
    'recent_sales' => $recentSales
]);
