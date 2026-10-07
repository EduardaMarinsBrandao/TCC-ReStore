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
}
