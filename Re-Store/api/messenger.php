<?php
// api/messenger.php
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

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?? [];
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$userId = (int)$_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? $_POST['action'] ?? $data['action'] ?? 'conversations';

// ----------------------------------------------------
// 0. CONTADOR DE MENSAGENS NÃO LIDAS TOTAIS
// ----------------------------------------------------
if ($method === 'GET' && $action === 'unread_count') {
    $stmt = $db->prepare("SELECT COUNT(*) as unread FROM messages WHERE receiver_id = ? AND is_read = 0");
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    $unreadCount = $row ? (int)$row['unread'] : 0;

    echo json_encode(['success' => true, 'unread_count' => $unreadCount]);
    exit;
}

// ----------------------------------------------------
// 1. LISTAR CONVERSAS DO USUÁRIO
// ----------------------------------------------------
if ($method === 'GET' && ($action === 'conversations' || $action === 'list_conversations')) {
    $sql = "SELECT 
                CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_user_id,
                MAX(id) as last_msg_id
            FROM messages 
            WHERE sender_id = ? OR receiver_id = ? 
            GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
            ORDER BY last_msg_id DESC";
    
    $stmt = $db->prepare($sql);
    $stmt->execute([$userId, $userId, $userId, $userId]);
    $rawConvs = $stmt->fetchAll();

    $conversations = [];
    foreach ($rawConvs as $rc) {
        $otherId = (int)$rc['other_user_id'];

        // Dados públicos do interlocutor (NUNCA vazar senha, hash, cpf ou email)
        $uStmt = $db->prepare("SELECT id, name, avatar, is_verified_business, business_name FROM users WHERE id = ?");
        $uStmt->execute([$otherId]);
        $otherUser = $uStmt->fetch();

        // Última mensagem
        $mStmt = $db->prepare("SELECT m.id, m.sender_id, m.receiver_id, m.product_id, m.message, m.is_read, m.created_at, p.name as product_name 
                               FROM messages m 
                               LEFT JOIN products p ON m.product_id = p.id 
                               WHERE m.id = ?");
        $mStmt->execute([$rc['last_msg_id']]);
        $lastMsg = $mStmt->fetch();

        // Contagem de mensagens não lidas enviadas por este parceiro
        $unreadStmt = $db->prepare("SELECT COUNT(*) as unread FROM messages WHERE receiver_id = ? AND sender_id = ? AND is_read = 0");
        $unreadStmt->execute([$userId, $otherId]);
        $unreadCount = (int)$unreadStmt->fetch()['unread'];

        if ($otherUser) {
            $conversations[] = [
                'user' => $otherUser,
                'last_message' => $lastMsg,
                'unread_count' => $unreadCount
            ];
        }
    }

    echo json_encode(['success' => true, 'conversations' => $conversations]);
    exit;
}

// ----------------------------------------------------
// 2. BUSCAR MENSAGENS DE UMA CONVERSA (SUPORTE A POLLING DELTA)
// ----------------------------------------------------
if ($method === 'GET' && ($action === 'messages' || $action === 'get_messages')) {
    $withUserId = (int)($_GET['with_user_id'] ?? 0);
    $productId = isset($_GET['product_id']) && (int)$_GET['product_id'] > 0 ? (int)$_GET['product_id'] : null;
    $afterId = isset($_GET['after_id']) ? (int)$_GET['after_id'] : 0;

    if ($withUserId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Usuário destinatário inválido.']);
        exit;
    }

    // 2.1 Polling Delta Rápido (apenas mensagens novas com ID > after_id)
    if ($afterId > 0) {
        $sql = "SELECT m.id, m.sender_id, m.receiver_id, m.product_id, m.message, m.is_read, m.created_at,
                       s.name as sender_name, s.avatar as sender_avatar
                FROM messages m 
                JOIN users s ON m.sender_id = s.id 
                WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
                  AND m.id > ?
                ORDER BY m.id ASC";
        
        $stmt = $db->prepare($sql);
        $stmt->execute([$userId, $withUserId, $withUserId, $userId, $afterId]);
        $newMessages = $stmt->fetchAll();

        // Se houver novas mensagens onde eu sou o destinatário, marcar como lidas
        if (!empty($newMessages)) {
            $db->prepare("UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND id > ?")
               ->execute([$userId, $withUserId, $afterId]);
        }

        echo json_encode(['success' => true, 'messages' => $newMessages]);
        exit;
    }

    // 2.2 Carga Completa Inicial do Histórico
    $db->prepare("UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ?")
       ->execute([$userId, $withUserId]);

    $sql = "SELECT m.id, m.sender_id, m.receiver_id, m.product_id, m.message, m.is_read, m.created_at,
                   s.name as sender_name, s.avatar as sender_avatar
            FROM messages m 
            JOIN users s ON m.sender_id = s.id 
            WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?) 
            ORDER BY m.id ASC";
    
    $stmt = $db->prepare($sql);
    $stmt->execute([$userId, $withUserId, $withUserId, $userId]);
    $messages = $stmt->fetchAll();

    // Informações públicas do interlocutor
    $partnerStmt = $db->prepare("SELECT id, name, avatar, is_verified_business, business_name FROM users WHERE id = ?");
    $partnerStmt->execute([$withUserId]);
    $partner = $partnerStmt->fetch();

    if (!$partner) {
        echo json_encode(['success' => false, 'error' => 'Usuário interlocutor não encontrado.']);
        exit;
    }

    // Identificar produto associado (se fornecido via GET ou extraído da última mensagem que teve produto)
    $productData = null;
    $targetProductId = $productId;
    if (!$targetProductId && !empty($messages)) {
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            if (!empty($messages[$i]['product_id'])) {
                $targetProductId = (int)$messages[$i]['product_id'];
                break;
            }
        }
    }

    if ($targetProductId) {
        $pStmt = $db->prepare("SELECT p.id, p.name, p.price, p.seller_id,
                                      (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as image_url
                               FROM products p WHERE p.id = ?");
        $pStmt->execute([$targetProductId]);
        $productData = $pStmt->fetch();
    }

    echo json_encode([
        'success' => true,
        'partner' => $partner,
        'product' => $productData,
        'messages' => $messages
    ]);
    exit;
}

// ----------------------------------------------------
// 3. ENVIAR NOVA MENSAGEM
// ----------------------------------------------------
if ($method === 'POST' && ($action === 'send' || $action === 'send_message')) {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?? $_POST;

    $receiverId = (int)($data['receiver_id'] ?? 0);
    $productId = isset($data['product_id']) && (int)$data['product_id'] > 0 ? (int)$data['product_id'] : null;
    $messageText = trim($data['message'] ?? '');

    if ($receiverId <= 0 || empty($messageText)) {
        echo json_encode(['success' => false, 'error' => 'Informe o destinatário e o texto da mensagem.']);
        exit;
    }

    if ($receiverId === $userId) {
        echo json_encode(['success' => false, 'error' => 'Você não pode enviar mensagem para si mesmo.']);
        exit;
    }

    $chkStmt = $db->prepare("SELECT id FROM users WHERE id = ?");
    $chkStmt->execute([$receiverId]);
    if (!$chkStmt->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Destinatário não encontrado.']);
        exit;
    }

    $stmt = $db->prepare("INSERT INTO messages (sender_id, receiver_id, product_id, message, is_read, created_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)");
    $stmt->execute([$userId, $receiverId, $productId, $messageText]);
    $msgId = (int)$db->lastInsertId();

    $msgStmt = $db->prepare("SELECT m.id, m.sender_id, m.receiver_id, m.product_id, m.message, m.is_read, m.created_at,
                                    s.name as sender_name, s.avatar as sender_avatar
                             FROM messages m 
                             JOIN users s ON m.sender_id = s.id 
                             WHERE m.id = ?");
    $msgStmt->execute([$msgId]);
    $sentMsg = $msgStmt->fetch();

    echo json_encode(['success' => true, 'message' => $sentMsg]);
    exit;
}

// ----------------------------------------------------
// 4. APAGAR MENSAGEM ENVIADA
// ----------------------------------------------------
if ($method === 'POST' && ($action === 'delete' || $action === 'delete_message')) {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?? $_POST;
    $msgId = (int)($data['message_id'] ?? 0);

    $stmt = $db->prepare("SELECT * FROM messages WHERE id = ? AND sender_id = ?");
    $stmt->execute([$msgId, $userId]);
    $msg = $stmt->fetch();

    if ($msg) {
        $db->prepare("DELETE FROM messages WHERE id = ?")->execute([$msgId]);
        echo json_encode(['success' => true, 'message' => 'Mensagem apagada com sucesso.']);
        exit;
    } else {
        echo json_encode(['success' => false, 'error' => 'Mensagem não encontrada ou você não tem permissão para apagá-la.']);
        exit;
    }
}

echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
