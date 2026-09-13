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

function callApiIsolated($endpointRelPath, $params = [], $method = 'GET') {
    global $testDbFile;
    $endpointFull = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'Re-Store' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, ltrim($endpointRelPath, '/'));
    
    $queryStr = http_build_query($params);
    $script = 'putenv("DB_DRIVER=sqlite"); ' .
              'putenv("SQLITE_PATH=' . addslashes($testDbFile) . '"); ' .
              '$_SERVER["REQUEST_METHOD"] = "' . $method . '"; ' .
              'parse_str("' . addslashes($queryStr) . '", $_GET); ' .
              'parse_str("' . addslashes($queryStr) . '", $_POST); ' .
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
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'products.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'auth.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'orders.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'chat.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'dashboard.php',
        $baseDir . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'points.php',
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

    $requiredTables = ['users', 'products', 'product_images', 'orders', 'order_items', 'reviews', 'messages', 'favorites', 'points_history', 'discounts'];
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
