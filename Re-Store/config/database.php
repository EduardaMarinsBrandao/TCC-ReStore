<?php
// config/database.php

define('DB_HOST', getenv('DB_HOST') ?: 'sql204.infinityfree.com');
define('DB_NAME', getenv('DB_NAME') ?: 'if0_42831392_restore');
define('DB_USER', getenv('DB_USER') ?: 'if0_42831392');
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : 'CaEdEyFeLaLe');
define('DB_DRIVER', getenv('DB_DRIVER') ?: 'auto');

function getDbConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    if (DB_DRIVER === 'sqlite') {
        $sqlitePath = getenv('SQLITE_PATH') ?: (__DIR__ . '/../restore_db.sqlite');
        $pdo = new PDO("sqlite:" . $sqlitePath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec("PRAGMA foreign_keys = ON;");
        return $pdo;
    }

    try {
        // Tenta conectar ao servidor MySQL
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
            PDO::ATTR_TIMEOUT => 3
        ];
        
        // Conecta ao banco de dados restore_db
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, $options);
        return $pdo;

    } catch (PDOException $e) {
        // Fallback robusto para SQLite em arquivo local para permitir execução de 1-clique sem o serviço MySQL ativo
        try {
            $sqlitePath = getenv('SQLITE_PATH') ?: (__DIR__ . '/../restore_db.sqlite');
            $pdo = new PDO("sqlite:" . $sqlitePath);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $pdo->exec("PRAGMA foreign_keys = ON;");
            return $pdo;
        } catch (PDOException $ex) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Falha na conexão com o banco de dados: ' . $ex->getMessage()]);
            exit;
        }
    }
}
