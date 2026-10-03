<?php
// config/credentials.example.php
// Modelo de credenciais locais. Copie este arquivo para 'credentials.local.php' e preencha com seus dados reais.

define('DB_HOST', 'localhost');
define('DB_NAME', 'restore_db');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_DRIVER', 'auto'); // Opções: 'auto', 'mysql' ou 'sqlite'

define('GOOGLE_CLIENT_ID', '');
define('GOOGLE_CLIENT_SECRET', '');

// Configurações de Envio de E-mail (SMTP - Gmail com Senha de App ou Brevo)
define('SMTP_HOST', 'smtp.gmail.com');
define('SMTP_PORT', 587);
define('SMTP_USER', ''); // Seu e-mail (ex: seu-email@gmail.com)
define('SMTP_PASS', ''); // Senha de App de 16 caracteres gerada no Google
define('SMTP_FROM_EMAIL', '');
define('SMTP_FROM_NAME', 'Re-Store Marketplace');
