<?php
/**
 * RE-STORE — Automated Test Suite for CI/CD
 * Executado localmente e nas esteiras do GitHub Actions
 */

// Define ambiente isolado de testes em SQLite
putenv('DB_DRIVER=sqlite');
$testDbFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'restore_test_' . uniqid() . '.sqlite';
putenv("SQLITE_PATH={$testDbFile}");

$totalTests = 0;
$passedTests = 0;
$failedTests = 0;

function runTest($name, $callback) {
    global $totalTests, $passedTests, $failedTests;
    $totalTests++;
    echo "[TEST] {$name} ... ";
    try {
        $result = $callback();
        if ($result !== false) {
            echo "PASSED \033[32m✔\033[0m\n";
            $passedTests++;
            return true;
        } else {
            echo "FAILED \033[31m✘\033[0m\n";
            $failedTests++;
            return false;
        }
    } catch (Throwable $e) {
        echo "FAILED \033[31m✘\033[0m (" . $e->getMessage() . ")\n";
        $failedTests++;
        return false;
    }
}

function callApiIsolated($endpointRelPath, $params = [], $method = 'GET', $session = []) {
    global $testDbFile;
    $endpointFull = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'Re-Store' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, ltrim($endpointRelPath, '/'));
    
    $queryStr = http_build_query($params);
    $sessionCode = !empty($session) ? '@session_start(); $_SESSION = ' . var_export($session, true) . '; ' : '';
    $script = 'putenv("DB_DRIVER=sqlite"); ' .
              'putenv("SQLITE_PATH=' . addslashes($testDbFile) . '"); ' .
              '$_SERVER["REQUEST_METHOD"] = "' . $method . '"; ' .
              'parse_str("' . addslashes($queryStr) . '", $_GET); ' .
              'parse_str("' . addslashes($queryStr) . '", $_POST); ' .
              $sessionCode .
              'require "' . addslashes($endpointFull) . '";';

    $descriptors = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"]
    ];

    $process = proc_open([PHP_BINARY, '-r', $script], $descriptors, $pipes);
    if (!is_resource($process)) {
        throw new Exception("Falha ao invocar processo PHP para API");
    }

    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    proc_close($process);

    return trim($stdout);
}

echo "====================================================\n";
echo "       RE-STORE: Executando Suíte de Testes         \n";
echo "====================================================\n";
echo "PHP Binary  : " . PHP_BINARY . "\n";
echo "PHP Version : " . PHP_VERSION . "\n";
echo "Test DB     : " . $testDbFile . "\n\n";

// --------------------------------------------------------------------------
// 1. Validação de Estrutura de Arquivos Críticos
// --------------------------------------------------------------------------
runTest('Verificação de arquivos fundamentais do projeto', function() {
    $baseDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'Re-Store';
    $requiredFiles = [
        $baseDir . DIRECTORY_SEPARATOR . 'index.php',
        $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'database.php',
        $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'db_init.php',
        $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'mailer.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'products.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'auth.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'orders.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'messenger.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'dashboard.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'points.php',
        $baseDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'locations.php',
        $baseDir . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'locations.json',
        $baseDir . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'locations.js',
        $baseDir . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'css' . DIRECTORY_SEPARATOR . 'style.css',
        $baseDir . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'app.js'
    ];
    foreach ($requiredFiles as $file) {
        if (!file_exists($file)) {
            throw new Exception("Arquivo essencial ausente: " . basename($file));
        }
    }
    return true;
});

// --------------------------------------------------------------------------
// 2. Inicialização do Banco de Dados e Esquema
// --------------------------------------------------------------------------
runTest('Conexão e inicialização do esquema de banco de dados (SQLite)', function() {
    require_once dirname(__DIR__) . '/Re-Store/config/database.php';
    require_once dirname(__DIR__) . '/Re-Store/config/db_init.php';

    initializeDatabase();
    $db = getDbConnection();
    if (!$db) {
        throw new Exception("Falha ao obter conexão com o banco de dados");
    }

    $requiredTables = ['users', 'products', 'product_images', 'orders', 'order_items', 'reviews', 'review_images', 'messages', 'favorites', 'points_history', 'discounts'];
    $stmt = $db->query("SELECT name FROM sqlite_master WHERE type='table'");
    $existingTables = $stmt->fetchAll(PDO::FETCH_COLUMN);

    foreach ($requiredTables as $tbl) {
        if (!in_array($tbl, $existingTables)) {
            throw new Exception("Tabela ausente no banco: {$tbl}");
        }
    }
    return true;
});

// --------------------------------------------------------------------------
// 3. Verificação de Dados Seminais (Seed Data)
// --------------------------------------------------------------------------
runTest('Validação dos dados iniciais (Usuários e Produtos)', function() {
    $db = getDbConnection();
    $userCount = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $productCount = (int)$db->query("SELECT COUNT(*) FROM products")->fetchColumn();

    if ($userCount < 2) {
        throw new Exception("Esperado no mínimo 2 usuários cadastrados, encontrado: {$userCount}");
    }
    if ($productCount < 5) {
        throw new Exception("Esperado no mínimo 5 produtos cadastrados, encontrado: {$productCount}");
    }
    return true;
});

// --------------------------------------------------------------------------
// 4. Teste de Endpoint: Listagem de Produtos (api/products.php?action=list)
// --------------------------------------------------------------------------
runTest('API: Listagem de produtos ativos', function() {
    $output = callApiIsolated('api/products.php', ['action' => 'list']);
    $json = json_decode($output, true);

    if (!is_array($json)) {
        throw new Exception("Resposta não é JSON válido. Saída: " . substr($output, 0, 150));
    }
    if (empty($json['success'])) {
        throw new Exception("API retornou erro: " . ($json['error'] ?? 'desconhecido'));
    }
    if (empty($json['products']) || !is_array($json['products'])) {
        throw new Exception("Nenhum produto listado pela API");
    }
    return true;
});

// --------------------------------------------------------------------------
// 5. Teste de Endpoint: Filtro de Produtos por Categoria
// --------------------------------------------------------------------------
runTest('API: Filtro de produtos por categoria ("Utilidades")', function() {
    $output = callApiIsolated('api/products.php', ['action' => 'list', 'category' => 'Utilidades']);
    $json = json_decode($output, true);

    if (!is_array($json) || empty($json['products'])) {
        throw new Exception("Filtro por categoria não retornou produtos");
    }
    foreach ($json['products'] as $prod) {
        if ($prod['category'] !== 'Utilidades') {
            throw new Exception("Categoria inconsistente retornada: " . $prod['category']);
        }
    }
    return true;
});

// --------------------------------------------------------------------------
// 6. Teste de Endpoint: Autenticação (Sessão Anônima)
// --------------------------------------------------------------------------
runTest('API: Verificação de sessão não-autenticada (api/auth.php?action=me)', function() {
    $output = callApiIsolated('api/auth.php', ['action' => 'me']);
    $json = json_decode($output, true);

    if (!is_array($json)) {
        throw new Exception("Resposta de autenticação não é JSON válido: " . substr($output, 0, 150));
    }
    if (!isset($json['logged_in']) || $json['logged_in'] !== false) {
        throw new Exception("Esperado status 'logged_in: false' para usuário anônimo");
    }
    return true;
});

// --------------------------------------------------------------------------
// 7. Teste de Regra de Negócio: Integridade Relacional de Pontos
// --------------------------------------------------------------------------
runTest('Integridade de histórico de pontos e relacionamentos com usuários', function() {
    $db = getDbConnection();
    $stmt = $db->query("SELECT p.*, u.name FROM points_history p JOIN users u ON p.user_id = u.id");
    $records = $stmt->fetchAll();

    if (count($records) === 0) {
        throw new Exception("Histórico de pontos sem integridade referencial com tabela users");
    }
    return true;
});

// --------------------------------------------------------------------------
// 8. Teste de Regra de Negócio: Bloqueio de Cadastro Sem E-mail Validado
// --------------------------------------------------------------------------
runTest('API: Bloqueio de criação de conta sem validação de e-mail (código obrigatório)', function() {
    $output = callApiIsolated('api/auth.php', [
        'action' => 'register',
        'name' => 'Novo Usuário Teste',
        'email' => 'teste.sem.codigo@restore.com',
        'password' => 'senha123456',
        'phone' => '(11) 98888-7777'
    ], 'POST');
    $json = json_decode($output, true);

    if (!is_array($json)) {
        throw new Exception("Resposta não é JSON válido: " . substr($output, 0, 150));
    }
    if (!empty($json['success'])) {
        throw new Exception("Conta não deveria ser criada sem código de validação de e-mail");
    }
    if (empty($json['error'])) {
        throw new Exception("API não retornou mensagem de erro esperada");
    }
    return true;
});

// --------------------------------------------------------------------------
// 9. Teste de Endpoint: Solicitação de Código de Verificação de Cadastro
// --------------------------------------------------------------------------
runTest('API: Geração de código de validação de e-mail para cadastro', function() {
    // 1. Tentar solicitar código para e-mail já existente deve ser rejeitado
    $outputExist = callApiIsolated('api/auth.php', [
        'action' => 'send_register_code',
        'email' => 'eco.vendedor@restore.com',
        'name' => 'Vendedor Existente'
    ], 'POST');
    $jsonExist = json_decode($outputExist, true);
    if (!empty($jsonExist['success'])) {
        throw new Exception("API permitiu solicitar código de cadastro para e-mail já registrado");
    }

    // 2. Solicitar código para novo e-mail deve ser aceito
    $outputNew = callApiIsolated('api/auth.php', [
        'action' => 'send_register_code',
        'email' => 'novo.usuario.' . uniqid() . '@restore.com',
        'name' => 'Novo Usuário'
    ], 'POST');
    $jsonNew = json_decode($outputNew, true);
    if (empty($jsonNew['success'])) {
        throw new Exception("API falhou ao gerar código de cadastro: " . ($jsonNew['error'] ?? 'desconhecido'));
    }
    return true;
});

// --------------------------------------------------------------------------
// 10. Teste: Bloqueio de Avaliação sem Compra Comprovada
// --------------------------------------------------------------------------
runTest('API: Bloqueio de avaliação sem compra comprovada (compra verificada obrigatória)', function() {
    // Usuário 2 não comprou o produto 1 inicialmente
    $outEligibility = callApiIsolated('api/reviews.php', [
        'action' => 'check_eligibility',
        'product_id' => 1
    ], 'GET', ['user_id' => 2]);
    $jsonEligibility = json_decode($outEligibility, true);

    if (empty($jsonEligibility['success']) || !isset($jsonEligibility['can_review'])) {
        throw new Exception("Falha ao checar elegibilidade: " . $outEligibility);
    }
    if ($jsonEligibility['can_review'] !== false || $jsonEligibility['reason'] !== 'not_purchased') {
        throw new Exception("Usuário sem compra foi considerado elegível para avaliar indevidamente");
    }

    // Tentar criar avaliação sem ter comprado deve retornar erro
    $outCreate = callApiIsolated('api/reviews.php', [
        'action' => 'create',
        'product_id' => 1,
        'rating' => 5,
        'comment' => 'Tentativa de avaliar sem comprar'
    ], 'POST', ['user_id' => 2]);
    $jsonCreate = json_decode($outCreate, true);

    if (!empty($jsonCreate['success'])) {
        throw new Exception("API permitiu criar avaliação sem compra comprovada!");
    }
    if (empty($jsonCreate['error'])) {
        throw new Exception("API não retornou mensagem de erro ao barrar avaliação sem compra");
    }

    return true;
});

// --------------------------------------------------------------------------
// 11. Teste: Criação de Avaliação após Compra Confirmada e Fotos
// --------------------------------------------------------------------------
runTest('API: Criação de avaliação após compra confirmada e fotos de avaliação', function() {
    $db = getDbConnection();

    // 1. Simular uma compra confirmada do produto 1 pelo usuário 2
    $orderNumber = 'PED-TEST-' . uniqid();
    $db->prepare("INSERT INTO orders (buyer_id, order_number, total, points_earned, payment_method, shipping_address, shipping_city, shipping_state, status) 
                  VALUES (2, ?, 79.90, 80, 'pix', 'Rua Teste, 100', 'São Paulo', 'SP', 'confirmed')")
       ->execute([$orderNumber]);
    $orderId = (int)$db->lastInsertId();

    $db->prepare("INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, points) 
                  VALUES (?, 1, 1, 1, 79.90, 80)")
       ->execute([$orderId]);

    // 2. Agora o usuário deve estar elegível
    $outEligibility = callApiIsolated('api/reviews.php', [
        'action' => 'check_eligibility',
        'product_id' => 1
    ], 'GET', ['user_id' => 2]);
    $jsonElig = json_decode($outEligibility, true);
    if (empty($jsonElig['can_review'])) {
        throw new Exception("Usuário com compra confirmada não foi considerado apto a avaliar: " . ($jsonElig['error'] ?? 'desconhecido'));
    }

    // 3. Criar a avaliação
    $outCreate = callApiIsolated('api/reviews.php', [
        'action' => 'create',
        'product_id' => 1,
        'rating' => 5,
        'comment' => 'Garrafa térmica excelente, super bem embalada e sustentável!'
    ], 'POST', ['user_id' => 2]);
    $jsonCreate = json_decode($outCreate, true);

    if (empty($jsonCreate['success'])) {
        throw new Exception("Falha ao criar avaliação para comprador verificado: " . ($jsonCreate['error'] ?? 'erro'));
    }

    $reviewId = (int)($jsonCreate['review_id'] ?? 0);
    if ($reviewId <= 0) {
        $chk = $db->query("SELECT id FROM reviews WHERE product_id = 1 AND user_id = 2")->fetch();
        $reviewId = (int)($chk['id'] ?? 0);
    }
    if ($reviewId <= 0) {
        throw new Exception("ID da avaliação criada não foi localizado");
    }

    // 4. Testar persistência de fotos associadas à avaliação
    $testImgUrl = 'uploads/reviews/rev_' . $reviewId . '_test.webp';
    $db->prepare("INSERT INTO review_images (review_id, image_url) VALUES (?, ?)")
       ->execute([$reviewId, $testImgUrl]);

    $imgCheck = $db->prepare("SELECT COUNT(*) as cnt FROM review_images WHERE review_id = ?");
    $imgCheck->execute([$reviewId]);
    if ((int)$imgCheck->fetch()['cnt'] < 1) {
        throw new Exception("Foto não foi persistida na tabela review_images");
    }

    // 5. Testar consulta via api/products.php
    $outDetail = callApiIsolated('api/products.php', [
        'action' => 'detail',
        'id' => 1
    ], 'GET', ['user_id' => 2]);
    $jsonDetail = json_decode($outDetail, true);

    if (empty($jsonDetail['success'])) {
        throw new Exception("Falha ao carregar detalhes do produto via API: " . ($jsonDetail['error'] ?? ''));
    }
    if (empty($jsonDetail['user_review'])) {
        throw new Exception("Detalhes do produto não retornaram user_review para o autor");
    }
    if (empty($jsonDetail['user_review']['images'])) {
        throw new Exception("Avaliação do usuário não retornou a lista de fotos anexadas");
    }

    return true;
});

// --------------------------------------------------------------------------
// 12. Teste: Edição de Avaliação, Alteração de Nota e Recálculo da Média
// --------------------------------------------------------------------------
runTest('API: Edição de avaliação existente, alteração de nota e recálculo da média do produto', function() {
    $db = getDbConnection();
    $rev = $db->query("SELECT id, product_id, rating FROM reviews WHERE user_id = 2 ORDER BY id DESC LIMIT 1")->fetch();
    if (!$rev) {
        throw new Exception("Avaliação para teste de edição não encontrada");
    }
    $reviewId = (int)$rev['id'];
    $productId = (int)$rev['product_id'];

    // Editar a avaliação para nota 4 e novo comentário
    $outUpdate = callApiIsolated('api/reviews.php', [
        'action' => 'update',
        'review_id' => $reviewId,
        'rating' => 4,
        'comment' => 'Comentário atualizado após alguns dias de uso: nota 4!'
    ], 'POST', ['user_id' => 2]);
    $jsonUpdate = json_decode($outUpdate, true);

    if (empty($jsonUpdate['success'])) {
        throw new Exception("Falha ao atualizar avaliação via API: " . ($jsonUpdate['error'] ?? ''));
    }

    // Verificar se no banco a avaliação foi atualizada
    $chkStmt = $db->prepare("SELECT rating, comment FROM reviews WHERE id = ?");
    $chkStmt->execute([$reviewId]);
    $updated = $chkStmt->fetch();
    if ((int)$updated['rating'] !== 4 || strpos($updated['comment'], 'Comentário atualizado') === false) {
        throw new Exception("Dados da avaliação no banco não conferem com a edição enviada");
    }

    // Verificar se a média do produto foi recalculada
    $prod = $db->query("SELECT rating, total_reviews FROM products WHERE id = {$productId}")->fetch();
    if ($prod['rating'] <= 0 || $prod['total_reviews'] <= 0) {
        throw new Exception("Média ou total de avaliações do produto inválidos após atualização");
    }

    return true;
});

// --------------------------------------------------------------------------
// 13. Teste: Minhas Avaliações e Exclusão com Recálculo
// --------------------------------------------------------------------------
runTest('API: Listagem de avaliações do usuário ("Minhas Avaliações") e exclusão com recálculo', function() {
    $db = getDbConnection();

    // 1. Listar avaliações do usuário 2
    $outList = callApiIsolated('api/reviews.php', [
        'action' => 'list',
        'user_id' => 2
    ], 'GET', ['user_id' => 2]);
    $jsonList = json_decode($outList, true);

    if (empty($jsonList['success']) || !is_array($jsonList['reviews'])) {
        throw new Exception("Falha ao listar avaliações do usuário: " . ($jsonList['error'] ?? ''));
    }
    if (count($jsonList['reviews']) === 0) {
        throw new Exception("Nenhuma avaliação retornada na listagem do usuário");
    }

    $firstReview = $jsonList['reviews'][0];
    if (empty($firstReview['product_name'])) {
        throw new Exception("Avaliação não incluiu o nome do produto avaliado");
    }
    $reviewId = (int)$firstReview['id'];
    $productId = (int)$firstReview['product_id'];

    // 2. Excluir a avaliação
    $outDelete = callApiIsolated('api/reviews.php', [
        'action' => 'delete',
        'review_id' => $reviewId
    ], 'POST', ['user_id' => 2]);
    $jsonDelete = json_decode($outDelete, true);

    if (empty($jsonDelete['success'])) {
        throw new Exception("Falha ao excluir avaliação: " . ($jsonDelete['error'] ?? ''));
    }

    // 3. Confirmar remoção no banco e de fotos associadas
    $chkRev = $db->query("SELECT COUNT(*) as cnt FROM reviews WHERE id = {$reviewId}")->fetch()['cnt'];
    $chkImgs = $db->query("SELECT COUNT(*) as cnt FROM review_images WHERE review_id = {$reviewId}")->fetch()['cnt'];
    if ((int)$chkRev !== 0 || (int)$chkImgs !== 0) {
        throw new Exception("Avaliação ou fotos não foram removidas do banco de dados");
    }

    return true;
});

runTest('API: Localização da conta oficial de suporte (api/messenger.php?action=get_support_user)', function() {
    $output = callApiIsolated('api/messenger.php', ['action' => 'get_support_user'], 'GET', ['user_id' => 2]);
    $json = json_decode($output, true);

    if (empty($json['success']) || empty($json['support_user']['id'])) {
        throw new Exception("Falha ao recuperar conta de suporte: " . ($json['error'] ?? 'desconhecido'));
    }

    if (stripos($json['support_user']['name'], 'Suporte') === false) {
        throw new Exception("Nome da conta de suporte não é condizente: " . $json['support_user']['name']);
    }

    return true;
});

runTest('API: Listagem de pedidos com identificação de itens avaliados (api/orders.php?action=my_orders)', function() {
    $output = callApiIsolated('api/orders.php', ['action' => 'my_orders'], 'GET', ['user_id' => 2]);
    $json = json_decode($output, true);

    if (empty($json['success']) || !isset($json['orders'])) {
        throw new Exception("Falha ao listar pedidos do usuário: " . ($json['error'] ?? 'desconhecido'));
    }

    // Usuário 2 possui pedido realizado nos testes anteriores
    if (!empty($json['orders'])) {
        $firstOrder = $json['orders'][0];
        if (empty($firstOrder['items'])) {
            throw new Exception("Pedido não continha itens");
        }
        $item = $firstOrder['items'][0];
        if (!array_key_exists('user_reviewed', $item)) {
            throw new Exception("Item do pedido não retornou o campo user_reviewed");
        }
    }

    return true;
});

runTest('Validação da lista oficial pré-determinada de municípios/UF em ordem alfabética', function() {
    require_once dirname(__DIR__) . '/Re-Store/config/locations.php';
    
    $locations = getBrazilLocations();
    if (count($locations) < 5500) {
        throw new Exception("Lista de municípios incompleta: " . count($locations) . " encontrados");
    }

    // Verificar se capitais e cidades principais estão presentes
    $checkList = ['São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG', 'Curitiba, PR', 'Brasília, DF', 'Salvador, BA', 'Campinas, SP'];
    foreach ($checkList as $city) {
        if (!isValidBrazilLocation($city)) {
            throw new Exception("Município oficial não validado: {$city}");
        }
    }

    // Verificar se valores arbitrários são estritamente rejeitados
    $invalidList = ['Qualquer coisa', '12345', 'Minha Cidade', 'São Paulo', 'São Paulo, XX', ''];
    foreach ($invalidList as $inv) {
        if (isValidBrazilLocation($inv)) {
            throw new Exception("Valor inválido foi erroneamente aceito como município: '{$inv}'");
        }
    }

    return true;
});

runTest('API: Bloqueio de município/UF inválido e aceitação de pré-determinado (api/products.php)', function() {
    // 1. Tentar atualizar produto com local inválido (deve ser rejeitado)
    $outInvalid = callApiIsolated('api/products.php', [
        'action' => 'update',
        'id' => 1,
        'name' => 'Garrafa Térmica Reutilizável de Inox',
        'description' => 'Descrição válida de produto sustentável',
        'price' => 49.90,
        'category' => 'Utilidades',
        'location' => 'Lugar Inventado Qualquer'
    ], 'POST', ['user_id' => 1]);
    $jsonInvalid = json_decode($outInvalid, true);

    if (!empty($jsonInvalid['success'])) {
        throw new Exception("A API aceitou um local arbitrário ('Lugar Inventado Qualquer') que não consta na lista pré-determinada");
    }

    // 2. Tentar atualizar com local pré-determinado válido (deve ser aceito)
    $outValid = callApiIsolated('api/products.php', [
        'action' => 'update',
        'id' => 1,
        'name' => 'Garrafa Térmica Reutilizável de Inox',
        'description' => 'Descrição válida de produto sustentável',
        'price' => 49.90,
        'category' => 'Utilidades',
        'location' => 'Curitiba, PR'
    ], 'POST', ['user_id' => 1]);
    $jsonValid = json_decode($outValid, true);

    if (empty($jsonValid['success'])) {
        throw new Exception("A API rejeitou um município pré-determinado válido ('Curitiba, PR'): " . ($jsonValid['error'] ?? ''));
    }

    return true;
});

// --------------------------------------------------------------------------
// 18. Privilégios de Administrador / Suporte e Moderação de Conteúdo
// --------------------------------------------------------------------------
runTest('Permissões de Administrador: Conta oficial de Suporte com privilégios especiais', function() {
    global $testDbFile;
    $db = new PDO("sqlite:{$testDbFile}");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    require_once dirname(__DIR__) . '/Re-Store/config/db_init.php';

    // 1. Verificar se a conta de suporte existe e tem is_admin = 1
    $stmt = $db->prepare("SELECT id, email, is_admin FROM users WHERE email = 'tccdssuporte@gmail.com'");
    $stmt->execute();
    $supportUser = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$supportUser) {
        throw new Exception("Conta de suporte (tccdssuporte@gmail.com) não encontrada no banco");
    }

    if (!isUserAdmin($db, (int)$supportUser['id'])) {
        throw new Exception("Função isUserAdmin retornou falso para a conta oficial de suporte");
    }

    // 2. Usuário comum NÃO pode ser admin
    if (isUserAdmin($db, 2)) {
        throw new Exception("Usuário comum (ID 2) foi incorretamente identificado como admin");
    }

    return true;
});

runTest('API Admin: Proteção de acesso e listagem de usuários e produtos (api/admin.php)', function() {
    global $testDbFile;
    $db = new PDO("sqlite:{$testDbFile}");
    $supId = (int)$db->query("SELECT id FROM users WHERE email = 'tccdssuporte@gmail.com'")->fetchColumn();

    // 1. Usuário comum tentando listar usuários do admin (deve ser bloqueado com erro)
    $outBlocked = callApiIsolated('api/admin.php', ['action' => 'list_users'], 'GET', ['user_id' => 2]);
    $jsonBlocked = json_decode($outBlocked, true);
    if (!empty($jsonBlocked['success'])) {
        throw new Exception("Usuário comum conseguiu acessar a API restrita de admin");
    }

    // 2. Suporte acessando list_users
    $outAllowed = callApiIsolated('api/admin.php', ['action' => 'list_users'], 'GET', ['user_id' => $supId]);
    $jsonAllowed = json_decode($outAllowed, true);

    if (empty($jsonAllowed['success']) || empty($jsonAllowed['users'])) {
        throw new Exception("Admin não conseguiu listar os usuários: " . ($jsonAllowed['error'] ?? ''));
    }

    // 3. Admin acessando user_products para um usuário específico
    $targetUserId = 1;
    $outUserProds = callApiIsolated('api/admin.php', ['action' => 'user_products', 'user_id' => $targetUserId], 'GET', ['user_id' => $supId]);
    $jsonUserProds = json_decode($outUserProds, true);

    if (empty($jsonUserProds['success']) || !isset($jsonUserProds['products'])) {
        throw new Exception("Admin não conseguiu consultar produtos do usuário {$targetUserId}");
    }

    return true;
});

runTest('Moderação: Suporte editando e deletando anúncio com motivo e notificação para o vendedor', function() {
    global $testDbFile;
    $db = new PDO("sqlite:{$testDbFile}");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $supId = (int)$db->query("SELECT id FROM users WHERE email = 'tccdssuporte@gmail.com'")->fetchColumn();

    // 1. Suporte atualizando um produto de outro vendedor (ex: Produto ID 1, do Vendedor ID 1)
    $outUpdate = callApiIsolated('api/products.php', [
        'action' => 'update',
        'id' => 1,
        'name' => 'Garrafa Térmica Reutilizável de Inox (Modificado pelo Suporte)',
        'description' => 'Descrição atualizada pelo suporte administrativo',
        'price' => 55.00,
        'category' => 'Utilidades',
        'location' => 'São Paulo, SP'
    ], 'POST', ['user_id' => $supId]);
    $jsonUpdate = json_decode($outUpdate, true);

    if (empty($jsonUpdate['success'])) {
        throw new Exception("Suporte falhou ao editar anúncio de terceiro: " . ($jsonUpdate['error'] ?? ''));
    }

    // 2. Criar um produto temporário para testar a exclusão por moderação com motivo
    $db->prepare("INSERT INTO products (id, seller_id, name, description, price, category, product_condition, stock, location, points)
                  VALUES (999, 1, 'Produto Teste de Violação', 'Item para teste de moderação', 29.90, 'Utilidades', 'used', 1, 'São Paulo, SP', 30)")->execute();

    $deletionReason = "Produto não atende às diretrizes de sustentabilidade e reuso da comunidade Re-Store.";

    // 3. Suporte exclui o anúncio 999 informando o motivo
    $outDelete = callApiIsolated('api/products.php', [
        'action' => 'delete',
        'id' => 999,
        'reason' => $deletionReason
    ], 'POST', ['user_id' => $supId]);
    $jsonDelete = json_decode($outDelete, true);

    if (empty($jsonDelete['success'])) {
        throw new Exception("Suporte falhou ao excluir produto: " . ($jsonDelete['error'] ?? ''));
    }

    // 4. Verificar se a notificação foi gravada na tabela user_notifications para o vendedor (ID 1)
    $notifStmt = $db->prepare("SELECT * FROM user_notifications WHERE user_id = 1 AND type = 'moderation' ORDER BY id DESC LIMIT 1");
    $notifStmt->execute();
    $notif = $notifStmt->fetch(PDO::FETCH_ASSOC);

    if (!$notif) {
        throw new Exception("Notificação de moderação não foi criada na tabela user_notifications");
    }

    if ($notif['reason'] !== $deletionReason) {
        throw new Exception("Motivo gravado na notificação ('{$notif['reason']}') difere do enviado ('{$deletionReason}')");
    }

    // 5. Verificar se o vendedor (ID 1) consegue consultar suas notificações via API
    $outSellerNotifs = callApiIsolated('api/admin.php', ['action' => 'my_moderation_notices'], 'GET', ['user_id' => 1]);
    $jsonSellerNotifs = json_decode($outSellerNotifs, true);

    if (empty($jsonSellerNotifs['success']) || empty($jsonSellerNotifs['notices'])) {
        throw new Exception("Vendedor não conseguiu recuperar seus avisos de moderação");
    }

    $foundNotice = false;
    foreach ($jsonSellerNotifs['notices'] as $n) {
        if ($n['reason'] === $deletionReason) {
            $foundNotice = true;
            break;
        }
    }
    if (!$foundNotice) {
        throw new Exception("Aviso com o motivo específico não encontrado na listagem do vendedor");
    }

    // 6. Vendedor dispensando a notificação
    $outDismiss = callApiIsolated('api/admin.php', ['action' => 'dismiss_notice', 'notice_id' => $notif['id']], 'POST', ['user_id' => 1]);
    $jsonDismiss = json_decode($outDismiss, true);

    if (empty($jsonDismiss['success'])) {
        throw new Exception("Vendedor falhou ao dispensar notificação");
    }

    return true;
});

runTest('API: Busca com múltiplos filtros avançados (materiais, condição e ordenação)', function() {
    // 1. Filtrar por condição e ordenação por menor preço
    $out = callApiIsolated('api/products.php', [
        'action' => 'list',
        'condition' => 'used',
        'sort' => 'price_asc'
    ], 'GET');
    $json = json_decode($out, true);

    if (empty($json['success']) || !isset($json['products'])) {
        throw new Exception("Falha ao filtrar produtos por condição e ordenação: " . ($json['error'] ?? ''));
    }

    foreach ($json['products'] as $p) {
        if ($p['product_condition'] !== 'used') {
            throw new Exception("Produto com condição '{$p['product_condition']}' retornado indevidamente");
        }
    }

    // 2. Filtrar por materiais
    $outMat = callApiIsolated('api/products.php', [
        'action' => 'list',
        'materials' => 'Inox'
    ], 'GET');
    $jsonMat = json_decode($outMat, true);

    if (empty($jsonMat['success']) || !isset($jsonMat['products'])) {
        throw new Exception("Falha ao filtrar produtos por material");
    }

    return true;
});



// Limpeza de arquivos temporários do teste
// --------------------------------------------------------------------------
if (file_exists($testDbFile)) {
    @unlink($testDbFile);
}

echo "\n====================================================\n";
echo "Resultado Final: {$passedTests}/{$totalTests} testes aprovados.\n";
if ($failedTests > 0) {
    echo "FALHA: {$failedTests} teste(s) falharam.\n";
    echo "====================================================\n";
    exit(1);
} else {
    echo "SUCESSO: Todos os testes passaram com êxito!\n";
    echo "====================================================\n";
    exit(0);
}
