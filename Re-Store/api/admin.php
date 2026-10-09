<?php
// api/admin.php - Central de Administração & Moderação Suporte Re-Store
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/db_init.php';
require_once __DIR__ . '/../config/gamification.php';

initializeDatabase();
$db = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? 'list_users';
$currentUserId = isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : 0;

// --------------------------------------------------------------------------
// 1. AÇÃO PÚBLICA / VENDEDOR: Notificações de Moderação do Próprio Usuário
// --------------------------------------------------------------------------
if ($action === 'my_moderation_notices') {
    if (!$currentUserId) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.', 'notices' => []]);
        exit;
    }

    try {
        $stmt = $db->prepare("SELECT * FROM user_notifications WHERE user_id = ? AND type = 'moderation' ORDER BY id DESC LIMIT 20");
        $stmt->execute([$currentUserId]);
        $notices = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'notices' => $notices
        ]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Erro ao buscar avisos: ' . $e->getMessage(), 'notices' => []]);
        exit;
    }
}

// --------------------------------------------------------------------------
// 2. AÇÃO PÚBLICA / VENDEDOR: Dispensar / Marcar Aviso como Lido
// --------------------------------------------------------------------------
if ($action === 'dismiss_notice') {
    if (!$currentUserId) {
        echo json_encode(['success' => false, 'error' => 'Não autenticado.']);
        exit;
    }

    $noticeId = (int)($_POST['notice_id'] ?? $_GET['notice_id'] ?? 0);
    if ($noticeId > 0) {
        try {
            $stmt = $db->prepare("UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
            $stmt->execute([$noticeId, $currentUserId]);
        } catch (Exception $e) {}
    }

    echo json_encode(['success' => true]);
    exit;
}

// ==========================================================================
// A PARTIR DAQUI: Ações estritamente protegidas para Administrador / Suporte
// ==========================================================================
if (!$currentUserId || !isUserAdmin($db, $currentUserId)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'Acesso negado. Apenas a conta de Suporte/Administrador tem acesso a esta funcionalidade.'
    ]);
    exit;
}

// --------------------------------------------------------------------------
// 3. LISTAR USUÁRIOS CADASTRADOS & RESUMO DE PRODUTOS
// --------------------------------------------------------------------------
if ($action === 'list_users') {
    try {
        $search = trim($_GET['search'] ?? '');
        $sql = "SELECT 
                    u.id, 
                    u.email, 
                    u.name, 
                    u.phone, 
                    u.city, 
                    u.state, 
                    u.avatar, 
                    u.points, 
                    u.level, 
                    u.is_verified_business, 
                    u.business_name, 
                    u.cnpj, 
                    u.is_admin, 
                    u.created_at,
                    COUNT(CASE WHEN p.id IS NOT NULL AND p.status NOT IN ('deleted', 'inactive') AND p.status != '' AND p.status IS NOT NULL THEN 1 END) as total_products,
                    SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_products
                FROM users u
                LEFT JOIN products p ON u.id = p.seller_id";
        
        $params = [];
        if (!empty($search)) {
            $sql .= " WHERE (u.name LIKE ? OR u.email LIKE ? OR u.city LIKE ? OR u.business_name LIKE ?)";
            $term = "%{$search}%";
            $params = [$term, $term, $term, $term];
        }

        $sql .= " GROUP BY u.id ORDER BY u.id ASC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $users = $stmt->fetchAll();

        // Normalizar flags e avatares
        foreach ($users as &$u) {
            $u['is_admin'] = isUserAdmin($db, $u['id']) ? 1 : 0;
            $u['total_products'] = (int)($u['total_products'] ?? 0);
            $u['active_products'] = (int)($u['active_products'] ?? 0);
            if (empty($u['avatar'])) {
                $u['avatar'] = 'https://ui-avatars.com/api/?name=' . urlencode($u['name']) . '&background=0d9488&color=fff&size=100';
            }
        }
        unset($u);

        // Estatísticas globais
        $totalUsers = count($users);
        $totalProductsCount = 0;
        $activeProductsCount = 0;
        foreach ($users as $u) {
            $totalProductsCount += $u['total_products'];
            $activeProductsCount += $u['active_products'];
        }

        echo json_encode([
            'success' => true,
            'users' => $users,
            'stats' => [
                'total_users' => $totalUsers,
                'total_products' => $totalProductsCount,
                'active_products' => $activeProductsCount
            ]
        ]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Erro ao carregar usuários: ' . $e->getMessage()]);
        exit;
    }
}

// --------------------------------------------------------------------------
// 4. VER PRODUTOS DE UM DETERMINADO USUÁRIO
// --------------------------------------------------------------------------
if ($action === 'user_products') {
    $targetUserId = (int)($_GET['user_id'] ?? 0);
    if ($targetUserId <= 0) {
        echo json_encode(['success' => false, 'error' => 'ID de usuário inválido.']);
        exit;
    }

    try {
        // Obter dados do usuário
        $uStmt = $db->prepare("SELECT id, name, email, avatar, phone, city, state, is_verified_business, business_name, is_admin FROM users WHERE id = ?");
        $uStmt->execute([$targetUserId]);
        $targetUser = $uStmt->fetch();

        if (!$targetUser) {
            echo json_encode(['success' => false, 'error' => 'Usuário não encontrado.']);
            exit;
        }

        $targetUser['is_admin'] = isUserAdmin($db, $targetUser['id']) ? 1 : 0;

        // Obter produtos do usuário
        $pStmt = $db->prepare("SELECT p.*, 
                                (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_image
                              FROM products p
                              WHERE p.seller_id = ? AND p.status NOT IN ('deleted', 'inactive') AND p.status != '' AND p.status IS NOT NULL
                              ORDER BY p.id DESC");
        $pStmt->execute([$targetUserId]);
        $products = $pStmt->fetchAll();

        foreach ($products as &$prod) {
            if (empty($prod['primary_image'])) {
                $prod['primary_image'] = 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600';
            }
            $prod['points'] = max(1, (int)round((float)$prod['price'] * BUYER_POINTS_PER_REAL));
        }
        unset($prod);

        echo json_encode([
            'success' => true,
            'user' => $targetUser,
            'products' => $products
        ]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Erro ao buscar produtos do usuário: ' . $e->getMessage()]);
        exit;
    }
}

// --------------------------------------------------------------------------
// 5. ESTATÍSTICAS GERAIS DO MARKETPLACE PARA O ADMIN
// --------------------------------------------------------------------------
if ($action === 'stats') {
    try {
        $uCount = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $pCount = (int)$db->query("SELECT COUNT(*) FROM products WHERE status NOT IN ('deleted', 'inactive') AND status != '' AND status IS NOT NULL")->fetchColumn();
        $activeCount = (int)$db->query("SELECT COUNT(*) FROM products WHERE status = 'active'")->fetchColumn();
        $ordersCount = (int)$db->query("SELECT COUNT(*) FROM orders")->fetchColumn();

        echo json_encode([
            'success' => true,
            'stats' => [
                'total_users' => $uCount,
                'total_products' => $pCount,
                'active_products' => $activeCount,
                'total_orders' => $ordersCount
            ]
        ]);
        exit;
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação de administração inválida.']);
