<?php
// config/gamification.php
// Sistema Centralizado e Justo de Pontos e Gamificação do Re-Store (Comprador & Vendedor)

if (!defined('RESTORE_GAMIFICATION')) {
    define('RESTORE_GAMIFICATION', true);

    // Configurações Globais de Pontos Justos
    define('POINTS_WELCOME_BONUS', 150);     // 150 Pontos de Boas-Vindas (permite resgatar 1º cupom de 5%)
    define('POINTS_REVIEW_BONUS', 30);       // 30 Pontos por avaliação de produto
    define('BUYER_POINTS_PER_REAL', 1.0);    // 1 Ponto Verde por cada R$ 1,00 gasto

    /**
     * Tabela Justa e Equilibrada de Custos de Cupons
     */
    function getCouponCostsTable() {
        return [
            '5%' => 150,
            'free_shipping' => 250,
            '10%' => 300,
            '15%' => 500,
            '20%' => 800
        ];
    }

    /**
     * Retorna informações de Nível, Taxa de Bônus e Próximo Marco do Vendedor
     * Baseado no histórico de vendas confirmadas e não canceladas
     */
    function getSellerTierInfo($db, $sellerId) {
        $sellerId = (int)$sellerId;

        $prevSalesStmt = $db->prepare("SELECT COUNT(DISTINCT oi.order_id) as cnt, 
                                              COALESCE(SUM(oi.price * oi.quantity), 0) as total_rev 
                                       FROM order_items oi 
                                       JOIN orders o ON oi.order_id = o.id 
                                       WHERE oi.seller_id = ? AND o.status != 'cancelled'");
        $prevSalesStmt->execute([$sellerId]);
        $row = $prevSalesStmt->fetch();
        $salesCount = (int)($row['cnt'] ?? 0);
        $totalRev = (float)($row['total_rev'] ?? 0.0);

        // Progressão de Vendedor Sustentável
        if ($salesCount < 5) {
            $tierName = 'Vendedor Semente';
            $tierLevel = 1;
            $rate = 0.30; // 30% do valor vendido em pontos verdes
            $nextThreshold = 5;
            $salesNeeded = 5 - $salesCount;
            $progressPercent = min(100, round(($salesCount / 5) * 100));
            $milestoneBonus = ($salesCount === 0) ? 50 : 0;
            $milestoneText = ($salesCount === 0) ? 'Primeira Venda Realizada!' : '';
            $nextTierBonus = 100;
            $nextTierName = 'Vendedor Broto';
            $badgeColor = 'emerald';
        } else if ($salesCount < 15) {
            $tierName = 'Vendedor Broto';
            $tierLevel = 2;
            $rate = 0.40; // 40%
            $nextThreshold = 15;
            $salesNeeded = 15 - $salesCount;
            $progressPercent = min(100, round((($salesCount - 5) / 10) * 100));
            $milestoneBonus = ($salesCount === 4) ? 100 : 0;
            $milestoneText = ($salesCount === 4) ? 'Marco de 5 Vendas Conquistado!' : '';
            $nextTierBonus = 150;
            $nextTierName = 'Vendedor Florescer';
            $badgeColor = 'teal';
        } else if ($salesCount < 30) {
            $tierName = 'Vendedor Florescer';
            $tierLevel = 3;
            $rate = 0.50; // 50%
            $nextThreshold = 30;
            $salesNeeded = 30 - $salesCount;
            $progressPercent = min(100, round((($salesCount - 15) / 15) * 100));
            $milestoneBonus = ($salesCount === 14) ? 150 : 0;
            $milestoneText = ($salesCount === 14) ? 'Marco de 15 Vendas Conquistado!' : '';
            $nextTierBonus = 300;
            $nextTierName = 'Eco Master Seller';
            $badgeColor = 'purple';
        } else {
            $tierName = 'Eco Master Seller';
            $tierLevel = 4;
            $rate = 0.60; // 60%
            $nextThreshold = null;
            $salesNeeded = 0;
            $progressPercent = 100;
            $milestoneBonus = ($salesCount === 29) ? 300 : 0;
            $milestoneText = ($salesCount === 29) ? 'Marco de 30 Vendas Conquistado!' : '';
            $nextTierBonus = 0;
            $nextTierName = null;
            $badgeColor = 'amber';
        }

        // Total de pontos já obtidos pelo vendedor com vendas na plataforma
        $ptsStmt = $db->prepare("SELECT COALESCE(SUM(points), 0) as pts FROM points_history WHERE user_id = ? AND type = 'sale'");
        $ptsStmt->execute([$sellerId]);
        $totalSellerPointsEarned = (int)($ptsStmt->fetch()['pts'] ?? 0);

        return [
            'tier_name' => $tierName,
            'tier_level' => $tierLevel,
            'rate' => $rate,
            'rate_formatted' => number_format($rate, 2, ',', '') . ' pts / R$',
            'rate_percent' => round($rate * 100) . '%',
            'sales_count' => $salesCount,
            'total_revenue' => $totalRev,
            'next_tier_threshold' => $nextThreshold,
            'sales_to_next_tier' => $salesNeeded,
            'progress_percent' => $progressPercent,
            'milestone_bonus' => $milestoneBonus,
            'milestone_text' => $milestoneText,
            'next_tier_bonus' => $nextTierBonus,
            'next_tier_name' => $nextTierName,
            'badge_color' => $badgeColor,
            'total_seller_points' => $totalSellerPointsEarned
        ];
    }

    /**
     * Atualiza o nível global do usuário (1 a 4) com base no saldo total de pontos acumulados
     */
    function updateUserEngagementLevel($db, $userId) {
        $userId = (int)$userId;
        $uStmt = $db->prepare("SELECT points FROM users WHERE id = ?");
        $uStmt->execute([$userId]);
        $user = $uStmt->fetch();
        if (!$user) return 1;

        $points = (int)$user['points'];
        $level = 1;
        if ($points >= 3000) $level = 4;
        else if ($points >= 1500) $level = 3;
        else if ($points >= 500) $level = 2;

        $db->prepare("UPDATE users SET level = ? WHERE id = ?")->execute([$level, $userId]);
        return $level;
    }

    /**
     * Calcula métricas reais e verdadeiras de sustentabilidade para um produto:
     * - Resíduos sólidos economizados (kg ou g)
     * - Emissões de CO2 equivalentes evitadas (kg CO2e)
     * - Mensagem contextualizada, transparente e fundamentada
     */
    function calculateProductSustainabilityImpact($product) {
        if (!is_array($product)) {
            $product = [];
        }

        $explicitWaste = isset($product['waste_saved_kg']) && is_numeric($product['waste_saved_kg']) ? (float)$product['waste_saved_kg'] : null;

        $category = trim((string)($product['category'] ?? ''));
        $condition = trim((string)($product['product_condition'] ?? $product['condition'] ?? 'used'));
        $material = trim((string)($product['material'] ?? ''));
        $name = trim((string)($product['name'] ?? ''));

        // Se o produto possui valor explicitamente cadastrado (> 0), respeitar o valor real do anunciante
        if ($explicitWaste !== null && $explicitWaste > 0) {
            $wasteKg = round($explicitWaste, 2);
        } else {
            // Estimativa baseada em Avaliação do Ciclo de Vida (ACV) por categoria e material
            $baseKg = 1.8;
            $catLower = mb_strtolower($category, 'UTF-8');
            $matLower = mb_strtolower($material, 'UTF-8');
            $nameLower = mb_strtolower($name, 'UTF-8');

            if (str_contains($catLower, 'móveis') || str_contains($catLower, 'moveis') || str_contains($catLower, 'decora')) {
                // Móveis & Decoração: descarte de biomassa, madeira e metais
                $baseKg = 12.5;
                if (str_contains($nameLower, 'mesa') || str_contains($nameLower, 'armário') || str_contains($nameLower, 'estante') || str_contains($nameLower, 'sofá')) {
                    $baseKg = 18.0;
                } else if (str_contains($nameLower, 'cadeira') || str_contains($nameLower, 'banco') || str_contains($nameLower, 'poltrona')) {
                    $baseKg = 8.5;
                } else if (str_contains($nameLower, 'vaso') || str_contains($nameLower, 'abajur') || str_contains($nameLower, 'quadro')) {
                    $baseKg = 2.4;
                }
            } else if (str_contains($catLower, 'eletr')) {
                // Eletrônicos & Eletrodomésticos: lixo eletrônico tóxico (e-waste)
                $baseKg = 2.8;
                if (str_contains($nameLower, 'notebook') || str_contains($nameLower, 'computador') || str_contains($nameLower, 'monitor') || str_contains($nameLower, 'tv')) {
                    $baseKg = 5.2;
                } else if (str_contains($nameLower, 'celular') || str_contains($nameLower, 'smartphone') || str_contains($nameLower, 'fone')) {
                    $baseKg = 0.65;
                }
            } else if (str_contains($catLower, 'moda') || str_contains($catLower, 'roupa') || str_contains($catLower, 'acessório') || str_contains($catLower, 'vest')) {
                // Moda & Vestuário: resíduo têxtil
                $baseKg = 0.75;
                if (str_contains($nameLower, 'jaqueta') || str_contains($nameLower, 'casaco') || str_contains($nameLower, 'mochila') || str_contains($nameLower, 'bolsa')) {
                    $baseKg = 1.4;
                } else if (str_contains($nameLower, 'tênis') || str_contains($nameLower, 'sapato')) {
                    $baseKg = 1.1;
                } else if (str_contains($nameLower, 'camisa') || str_contains($nameLower, 'camiseta') || str_contains($nameLower, 'vestido')) {
                    $baseKg = 0.55;
                }
            } else if (str_contains($catLower, 'utilidade') || str_contains($catLower, 'casa') || str_contains($catLower, 'cozinha')) {
                // Utilidades reutilizáveis (substituem plásticos de uso único)
                $baseKg = 1.9;
                if (str_contains($nameLower, 'garrafa') || str_contains($nameLower, 'copo') || str_contains($nameLower, 'canudo') || str_contains($nameLower, 'marmita')) {
                    $baseKg = 2.5;
                }
            }

            // Fator pela condição do item
            $condFactor = 1.0;
            if ($condition === 'restored') {
                $condFactor = 1.35;
            } else if ($condition === 'used') {
                $condFactor = 1.15;
            }

            // Bônus pelo material ecológico
            $matBonus = 0.0;
            if (str_contains($matLower, 'madeira') || str_contains($matLower, 'demolição')) {
                $matBonus = 2.0;
            } else if (str_contains($matLower, 'inox') || str_contains($matLower, 'aço') || str_contains($matLower, 'ferro') || str_contains($matLower, 'metal')) {
                $matBonus = 1.2;
            } else if (str_contains($matLower, 'vidro')) {
                $matBonus = 0.8;
            } else if (str_contains($matLower, 'reciclado') || str_contains($matLower, 'upcycled')) {
                $matBonus = 0.6;
            } else if (str_contains($matLower, 'bambu') || str_contains($matLower, 'orgânico') || str_contains($matLower, 'organico')) {
                $matBonus = 0.4;
            }

            $wasteKg = round(($baseKg * $condFactor) + $matBonus, 1);
        }

        // CO2 evitado (média 1,75 kg CO2e evitado por kg de resíduo reutilizado/poupado)
        $co2Kg = round($wasteKg * 1.75, 1);

        // Formatação legível em português
        $wasteFormatted = ($wasteKg < 1.0) 
            ? round($wasteKg * 1000) . ' g de resíduos' 
            : number_format($wasteKg, 1, ',', '.') . ' kg de resíduos';

        $co2Formatted = number_format($co2Kg, 1, ',', '.') . ' kg de CO₂';

        $conditionLabel = ($condition === 'restored') ? 'restaurado' : (($condition === 'used') ? 'reutilizável' : 'sustentável');
        $materialText = !empty($material) ? " em {$material}" : "";

        $explanation = "Ao optar por este item {$conditionLabel}{$materialText}, você evita o descarte de aproximadamente {$wasteFormatted} em aterros sanitários e poupa cerca de {$co2Formatted} na atmosfera.";

        return [
            'waste_saved_kg' => $wasteKg,
            'waste_saved_formatted' => $wasteFormatted,
            'co2_saved_kg' => $co2Kg,
            'co2_saved_formatted' => $co2Formatted,
            'explanation' => $explanation,
            'is_custom' => ($explicitWaste !== null && $explicitWaste > 0)
        ];
    }
}
