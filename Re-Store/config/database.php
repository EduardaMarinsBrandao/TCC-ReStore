<?php
// config/database.php

define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'restore_db');
define('DB_USER', 'root');
define('DB_PASS', '');

function getDbConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    try {
        // Tenta conectar ao servidor MySQL sem especificar o banco de dados inicialmente
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
        ];
        
        $pdoServer = new PDO("mysql:host=" . DB_HOST . ";charset=utf8mb4", DB_USER, DB_PASS, $options);
        $pdoServer->exec("CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdoServer = null;

        // Conecta ao banco de dados restore_db
        $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, $options);
        return $pdo;

    } catch (PDOException $e) {
        // Fallback robusto para SQLite em arquivo local para permitir execução de 1-clique sem o serviço MySQL ativo
        try {
            $sqlitePath = __DIR__ . '/../restore_db.sqlite';
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
