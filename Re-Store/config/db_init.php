<?php
// config/db_init.php
require_once __DIR__ . '/database.php';

function initializeDatabase() {
    static $alreadyRan = false;
    if ($alreadyRan) return;

    $flagFile = __DIR__ . '/.db_initialized';
    if (file_exists($flagFile)) {
        $alreadyRan = true;
        return;
    }

    $db = getDbConnection();
    $driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);

    if ($driver === 'sqlite') {
        // Esquema compatível com SQLite
        $queries = [
            "CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                phone TEXT,
                cpf TEXT,
                avatar TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                zip_code TEXT,
                location_latitude REAL,
                location_longitude REAL,
                points INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                is_verified_business INTEGER DEFAULT 0,
                business_name TEXT,
                cnpj TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            "CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seller_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price REAL NOT NULL,
                category TEXT NOT NULL,
                product_condition TEXT NOT NULL,
                material TEXT,
                stock INTEGER NOT NULL,
                location TEXT,
                points INTEGER DEFAULT 0,
                rating REAL DEFAULT 0.0,
                total_reviews INTEGER DEFAULT 0,
                views INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
            )",
            "CREATE TABLE IF NOT EXISTS product_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                image_url TEXT NOT NULL,
                is_primary INTEGER DEFAULT 0,
                image_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )",
            "CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                buyer_id INTEGER NOT NULL,
                order_number TEXT UNIQUE NOT NULL,
                total REAL NOT NULL,
                points_earned INTEGER NOT NULL,
                payment_method TEXT NOT NULL,
                shipping_address TEXT NOT NULL,
                shipping_city TEXT,
                shipping_state TEXT,
                shipping_zip TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
            )",
            "CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                seller_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                points INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (seller_id) REFERENCES users(id)
            )",
            "CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                order_id INTEGER NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT,
                helpful_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )",
            "CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id INTEGER NOT NULL,
                receiver_id INTEGER NOT NULL,
                product_id INTEGER NULL,
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
            )",
            "CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )",
            "CREATE TABLE IF NOT EXISTS points_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                points INTEGER NOT NULL,
                type TEXT NOT NULL,
                description TEXT,
                order_id INTEGER NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
            )",
            "CREATE TABLE IF NOT EXISTS discounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                discount_type TEXT NOT NULL,
                points_cost INTEGER NOT NULL,
                code TEXT UNIQUE NOT NULL,
                is_used INTEGER DEFAULT 0,
                expires_at DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )"
        ];
        foreach ($queries as $q) {
            $db->exec($q);
        }
    } else {
        // Esquema MySQL
        $sqlPath = __DIR__ . '/../database.sql';
        if (file_exists($sqlPath)) {
            $sqlContent = file_get_contents($sqlPath);
            $db->exec($sqlContent);
        }
    }

    // Inserção de dados iniciais de demonstração se a tabela users estiver vazia
    $stmt = $db->query("SELECT COUNT(*) as cnt FROM users");
    $userCount = $stmt->fetch()['cnt'];

    if ($userCount == 0) {
        $passHash = password_hash('123456', PASSWORD_DEFAULT);

        // Usuário 1: Vendedor principal (Empresa Verificada)
        $db->prepare("INSERT INTO users 
            (email, name, password_hash, phone, cpf, avatar, address, city, state, zip_code, points, level, is_verified_business, business_name, cnpj)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
           ->execute([
               'eco.vendedor@restore.com',
               'Lucas Silva - EcoStore',
               $passHash,
               '(11) 98765-4321',
               '123.456.789-00',
               'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300',
               'Rua das Palmeiras, 450',
               'São Paulo',
               'SP',
               '01310-100',
               1250,
               3,
               1,
               'EcoStore Brasil',
               '12.345.678/0001-90'
           ]);

        // Usuário 2: Comprador Padrão
        $db->prepare("INSERT INTO users 
            (email, name, password_hash, phone, cpf, avatar, address, city, state, zip_code, points, level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
           ->execute([
               'comprador@restore.com',
               'Mariana Costa',
               $passHash,
               '(21) 99887-7665',
               '987.654.321-11',
               'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300',
               'Av. Atlântica, 1200',
               'Rio de Janeiro',
               'RJ',
               '22070-000',
               750,
               2
           ]);

        // Inserir histórico de pontos iniciais
        $db->exec("INSERT INTO points_history (user_id, points, type, description) VALUES
            (1, 500, 'sale', 'Bônus de Boas-Vindas Re-Store'),
            (1, 750, 'sale', 'Venda realizada: Garrafa Térmica Reutilizável'),
            (2, 500, 'purchase', 'Bônus de Boas-Vindas Re-Store'),
            (2, 250, 'review', 'Avaliação de produto enviada')
        ");

        // Produtos de demonstração
        $demoProducts = [
            [
                'seller_id' => 1,
                'name' => 'Garrafa Térmica Inox Eco 750ml',
                'description' => 'Garrafa térmica reutilizável em aço inoxidável livre de BPA. Conserva bebidas quentes por 12h e frias por 24h. Ideal para substituir garrafas plásticas no dia a dia.',
                'price' => 79.90,
                'category' => 'Utilidades',
                'product_condition' => 'new',
                'material' => 'Aço Inox 304',
                'stock' => 15,
                'location' => 'São Paulo, SP',
                'points' => 150,
                'rating' => 4.9,
                'total_reviews' => 12,
                'img' => 'uploads/products/garrafa_termica_inox_eco.webp'
            ],
            [
                'seller_id' => 1,
                'name' => 'Bolsa Tote Bag Algodão Orgânico',
                'description' => 'Ecobag reforçada produzida com 100% algodão orgânico não tingido. Suporta até 15kg, lavável e biodegradável. Perfeita para feira e supermercado.',
                'price' => 39.90,
                'category' => 'Moda & Acessórios',
                'product_condition' => 'new',
                'material' => 'Algodão Orgânico 100%',
                'stock' => 25,
                'location' => 'São Paulo, SP',
                'points' => 80,
                'rating' => 4.8,
                'total_reviews' => 8,
                'img' => 'uploads/products/bolsa_tote_bag_algodao_organico.webp'
            ],
            [
                'seller_id' => 1,
                'name' => 'Cadeira de Balanço Restaurada em Madeira Demolição',
                'description' => 'Peça artesanal exclusiva inteiramente restaurada com verniz ecológico à base de água. Estrutura maciça em madeira de demolição rústica.',
                'price' => 420.00,
                'category' => 'Móveis & Decoração',
                'product_condition' => 'restored',
                'material' => 'Wood / Madeira Demolição',
                'stock' => 2,
                'location' => 'São Paulo, SP',
                'points' => 600,
                'rating' => 5.0,
                'total_reviews' => 4,
                'img' => 'uploads/products/cadeira_de_balanco_restaurada_em_madeira_demolicao.jpg'
            ],
            [
                'seller_id' => 2,
                'name' => 'Jaqueta Jeans Vintage Upcycled (Tamanho M)',
                'description' => 'Jaqueta clássica customizada à mão com retalhos de tecidos sustentáveis e pintura têxtil artesanal. Peça única sem uso prévio após personalização.',
                'price' => 149.00,
                'category' => 'Moda & Acessórios',
                'product_condition' => 'used',
                'material' => 'Denim Reciclado',
                'stock' => 1,
                'location' => 'Rio de Janeiro, RJ',
                'points' => 250,
                'rating' => 4.7,
                'total_reviews' => 6,
                'img' => 'uploads/products/jaqueta_jeans_vintage_upcycled.webp'
            ],
            [
                'seller_id' => 1,
                'name' => 'Kit Canudos de Inox Reutilizáveis com Escova',
                'description' => 'Conjunto com 4 canudos de aço inox (2 retos, 2 curvos) e 1 escova de higienização com saquinho de algodão cru para transporte.',
                'price' => 24.90,
                'category' => 'Utilidades',
                'product_condition' => 'new',
                'material' => 'Inox Alimentício',
                'stock' => 40,
                'location' => 'São Paulo, SP',
                'points' => 50,
                'rating' => 4.9,
                'total_reviews' => 19,
                'img' => 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=800'
            ],
            [
                'seller_id' => 2,
                'name' => 'Luminária Rústica Bambu e Corda Sisal',
                'description' => 'Luminária de mesa feita com tubos de bambu tratado e acabamento em fibra de sisal. Soquete E27 padrão com lâmpada LED filamento quente inclusa.',
                'price' => 110.00,
                'category' => 'Móveis & Decoração',
                'product_condition' => 'restored',
                'material' => 'Bambu e Sisal',
                'stock' => 3,
                'location' => 'Rio de Janeiro, RJ',
                'points' => 200,
                'rating' => 4.6,
                'total_reviews' => 3,
                'img' => 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800'
            ],
            [
                'seller_id' => 1,
                'name' => 'Carregador Solar Portátil Eco Power 10000mAh',
                'description' => 'Powerbank ecológico recarregável via painel solar integrado. Perfeito para acampamentos, caminhadas e uso diário em locais ao ar livre.',
                'price' => 189.90,
                'category' => 'Eletrônicos Eco',
                'product_condition' => 'new',
                'material' => 'Plástico Reciclado / Painel Solar',
                'stock' => 8,
                'location' => 'Curitiba, PR',
                'points' => 320,
                'rating' => 4.8,
                'total_reviews' => 7,
                'img' => 'uploads/products/carregador_solar_portatil_eco_power.webp'
            ],
            [
                'seller_id' => 2,
                'name' => 'Vaso de Planta Biodegradável em Fibra de Coco (Kit c/ 3)',
                'description' => 'Conjunto de 3 vasos artesanais moldados com fibra de coco natural e resina orgânica. Permitem o plantio direto no solo sem gerar resíduos.',
                'price' => 45.00,
                'category' => 'Móveis & Decoração',
                'product_condition' => 'new',
                'material' => 'Fibra de Coco Orgânica',
                'stock' => 20,
                'location' => 'Belo Horizonte, MG',
                'points' => 90,
                'rating' => 4.9,
                'total_reviews' => 11,
                'img' => 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=800'
            ],
            [
                'seller_id' => 1,
                'name' => 'Mochila de Pneu Reciclado & Lona de Caminhão',
                'description' => 'Mochila ultra resistente confeccionada a partir da reciclagem de câmaras de pneu e lona impermeável. Design urbano e exclusivo.',
                'price' => 230.00,
                'category' => 'Moda & Acessórios',
                'product_condition' => 'restored',
                'material' => 'Borracha de Pneu Reciclada',
                'stock' => 5,
                'location' => 'Porto Alegre, RS',
                'points' => 450,
                'rating' => 5.0,
                'total_reviews' => 15,
                'img' => 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800'
            ]
        ];

        $insertProdStmt = $db->prepare("INSERT INTO products 
            (seller_id, name, description, price, category, product_condition, material, stock, location, points, rating, total_reviews, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')");
        
        $insertImgStmt = $db->prepare("INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, 1)");

        foreach ($demoProducts as $p) {
            $insertProdStmt->execute([
                $p['seller_id'], $p['name'], $p['description'], $p['price'],
                $p['category'], $p['product_condition'], $p['material'], $p['stock'],
                $p['location'], $p['points'], $p['rating'], $p['total_reviews']
            ]);
            $prodId = $db->lastInsertId();
            $insertImgStmt->execute([$prodId, $p['img']]);
        }

        // Favorito de teste
        $db->exec("INSERT INTO favorites (user_id, product_id) VALUES (2, 1)");

        // Cupom de demonstração
        $db->exec("INSERT INTO discounts (user_id, discount_type, points_cost, code, is_used) VALUES 
            (2, '10%', 200, 'ECO10-8842', 0)
        ");

        // Mensagens de teste
        $db->exec("INSERT INTO messages (sender_id, receiver_id, product_id, message, is_read) VALUES
            (2, 1, 1, 'Olá Lucas! A garrafa inox pode ser lavada na lava-louças?', 1),
            (1, 2, 1, 'Olá Mariana! Sim, o aço inox 304 é resistente e seguro para lava-louças.', 1)
        ");
    }

    @file_put_contents(__DIR__ . '/.db_initialized', date('Y-m-d H:i:s'));
    $alreadyRan = true;
}
