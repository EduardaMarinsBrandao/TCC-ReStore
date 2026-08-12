<?php
// index.php - Marketplace Sustentável Re-Store
session_start();
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/db_init.php';

// Inicializar banco de dados se necessário
initializeDatabase();
?>
<!DOCTYPE html>
<html lang="pt-BR" class="font-md">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Re-Store | Marketplace Sustentável & Gamificação</title>
  <meta name="description" content="Plataforma de compra, venda e troca de produtos sustentáveis com sistema de pontos e acessibilidade total.">
  
  <!-- Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            teal: {
              500: '#14B8A6',
              600: '#0D9488',
              700: '#0F766E'
            },
            emerald: {
              500: '#10B981',
              600: '#059669'
            }
          }
        }
      }
    }
  </script>
  
  <!-- Custom CSS & Accessibility -->
  <link rel="stylesheet" href="assets/css/style.css">
  <link rel="icon" type="image/png" href="assets/images/favicon.png">
</head>
<body class="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300 min-h-screen flex flex-col justify-between">

  <!-- HEADER NAVEGAÇÃO -->
  <header class="sticky top-0 z-40 header-glass transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-20">
        
        <!-- LOGO & BRAND -->
        <div class="flex items-center gap-0 cursor-pointer group py-2" onclick="App.navigateTo('home')">
          <img src="assets/images/favicon.png" class="h-14 md:h-18 w-auto object-contain transition-transform group-hover:scale-105 drop-shadow-sm" alt="Re-Store Icon">
          <img src="assets/images/logo-text.png" class="h-18 md:h-20 w-auto object-contain transition-transform group-hover:scale-105" alt="Re-Store Logo">
        </div>

        <!-- BUSCA RÁPIDA DESKTOP -->
        <div class="hidden md:flex flex-1 max-w-md mx-8">
          <form onsubmit="event.preventDefault(); App.navigateTo('search', { search: document.getElementById('header-search-input').value });" class="relative w-full">
            <input type="text" 
                   id="header-search-input"
                   placeholder="Buscar produtos reutilizáveis..." 
                   onkeyup="if(event.key==='Enter') App.navigateTo('search', { search: this.value })"
                   class="w-full pl-10 pr-10 py-2 rounded-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
            <button type="submit" title="Buscar" class="absolute left-3.5 top-2.5 text-gray-400 hover:text-teal-600 cursor-pointer border-none bg-transparent">
              🔍
            </button>
          </form>
        </div>

        <!-- AÇÕES & RECURSOS DE ACESSIBILIDADE DE TOPO -->
        <div class="flex items-center gap-3">
          
          <!-- BOTÃO TUTORIAL INTERATIVO -->
          <button type="button" 
                  onclick="App.showTutorialModal()" 
                  aria-label="Tutorial do Site"
                  title="Aprender a Usar o Re-Store (Tutorial Guiado)"
                  class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-teal-700 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 hover:bg-teal-100 transition cursor-pointer pointer-events-auto">
            <span class="pointer-events-none">🎓</span> <span class="pointer-events-none">Tutorial</span>
          </button>

          <!-- BOTÃO ACESSIBILIDADE RÁPIDA -->
          <button type="button" 
                  onclick="App.navigateTo('help')" 
                  aria-label="Opções de Acessibilidade"
                  title="Acessibilidade (Dark Mode, Fonte, Daltonismo)"
                  class="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer pointer-events-auto">
            <span class="pointer-events-none">♿</span>
          </button>

          <!-- FAVORITES BUTTON (TABA DEDICADA) -->
          <button type="button" 
                  onclick="App.navigateTo('favorites')" 
                  aria-label="Meus Favoritos"
                  title="Ver Produtos Favoritados"
                  class="relative p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer pointer-events-auto">
            <span class="pointer-events-none">❤️</span>
          </button>

          <!-- NOTIFICATION BELL BUTTON -->
          <button type="button" 
                  onclick="App.navigateTo('notifications')" 
                  aria-label="Central de Notificações"
                  title="Central de Notificações"
                  class="relative p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer pointer-events-auto">
            <span class="pointer-events-none">🔔</span>
            <span id="notif-badge" class="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center pointer-events-none">2</span>
          </button>

          <!-- CART BUTTON -->
          <button type="button" 
                  onclick="App.navigateTo('cart')" 
                  aria-label="Carrinho de Compras"
                  title="Carrinho de Compras"
                  class="relative p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer pointer-events-auto">
            <span class="pointer-events-none">🛒</span>
            <span class="cart-badge absolute -top-1 -right-1 bg-teal-500 text-white text-[10px] font-bold w-5 h-5 rounded-full items-center justify-center hidden pointer-events-none">0</span>
          </button>

          <!-- ÁREA DO USUÁRIO / AUTH -->
          <div id="user-nav-actions" class="flex items-center gap-3">
            <!-- Renderizado via app.js -->
          </div>

        </div>
      </div>
    </div>
  </header>

  <!-- ÁREA DE CONTEÚDO PRINCIPAL (RENDERIZADA VIA SPA) -->
  <main id="main-content" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-grow w-full">
    <div class="text-center py-16 text-gray-500">Carregando Re-Store...</div>
  </main>

  <!-- NAVEGAÇÃO INFERIOR FIXA (MOBILE) -->
  <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-t dark:border-gray-800 z-40 py-2">
    <div class="flex justify-around items-center">
      <button onclick="App.navigateTo('home')" class="flex flex-col items-center text-xs text-gray-600 dark:text-gray-400 hover:text-teal-600">
        <span class="text-lg">🏠</span>
        <span>Início</span>
      </button>
      <button onclick="App.navigateTo('search')" class="flex flex-col items-center text-xs text-gray-600 dark:text-gray-400 hover:text-teal-600">
        <span class="text-lg">🔍</span>
        <span>Buscar</span>
      </button>
      <button onclick="App.navigateTo('favorites')" class="flex flex-col items-center text-xs text-gray-600 dark:text-gray-400 hover:text-teal-600">
        <span class="text-lg">❤️</span>
        <span>Favoritos</span>
      </button>
      <button onclick="App.navigateTo('cart')" class="flex flex-col items-center text-xs text-gray-600 dark:text-gray-400 hover:text-teal-600 relative">
        <span class="text-lg">🛒</span>
        <span>Carrinho</span>
      </button>
      <button onclick="App.navigateTo('chat')" class="flex flex-col items-center text-xs text-gray-600 dark:text-gray-400 hover:text-teal-600">
        <span class="text-lg">💬</span>
        <span>Chat</span>
      </button>
    </div>
  </nav>

  <!-- FOOTER SUSTENTÁVEL -->
  <footer class="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-12 py-8 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center md:text-left">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div>
          <div class="flex items-center gap-0 mb-4 justify-center md:justify-start cursor-pointer" onclick="App.navigateTo('home')">
            <img src="assets/images/favicon.png" class="h-16 md:h-20 w-auto object-contain" alt="Re-Store Icon">
            <img src="assets/images/logo-text.png" class="h-18 md:h-24 w-auto object-contain" alt="Re-Store Logo">
          </div>
          <p class="text-xs text-gray-500 leading-relaxed">
            Plataforma de economia circular focada em reuso de produtos, redução de resíduos e gamificação com impacto socioambiental positivo.
          </p>
        </div>

        <div>
          <h4 class="font-bold text-sm mb-3">Navegação</h4>
          <ul class="space-y-2 text-xs text-gray-500">
            <li><button onclick="App.navigateTo('home')" class="hover:text-teal-600">Produtos Recentes</button></li>
            <li><button onclick="App.navigateTo('search')" class="hover:text-teal-600">Categorias Sustentáveis</button></li>
            <li><button onclick="App.navigateTo('points')" class="hover:text-teal-600">Sistema de Recompensas</button></li>
          </ul>
        </div>

        <div>
          <h4 class="font-bold text-sm mb-3">Área do Vendedor</h4>
          <ul class="space-y-2 text-xs text-gray-500">
            <li><button onclick="App.navigateTo('seller')" class="hover:text-teal-600">Painel do Vendedor</button></li>
            <li><button onclick="App.navigateTo('add-product')" class="hover:text-teal-600">Anunciar Produto</button></li>
          </ul>
        </div>

        <div>
          <h4 class="font-bold text-sm mb-3">Acessibilidade</h4>
          <ul class="space-y-2 text-xs text-gray-500">
            <li><button onclick="AccessibilityManager.toggleDarkMode()" class="hover:text-teal-600">Alternar Modo Escuro</button></li>
            <li><button onclick="App.navigateTo('help')" class="hover:text-teal-600">Ajuste de Fonte & Daltonismo</button></li>
          </ul>
        </div>
      </div>

      <div class="border-t border-gray-100 dark:border-gray-800 pt-6 text-center text-xs text-gray-400">
        © <?php echo date('Y'); ?> Re-Store Marketplace Sustentável. Todos os direitos reservados.
      </div>
    </div>
  </footer>

  <!-- SCRIPTS JS DA APLICAÇÃO -->
  <script src="assets/js/toast.js"></script>
  <script src="assets/js/accessibility.js"></script>
  <script src="assets/js/auth.js"></script>
  <script src="assets/js/cart.js"></script>
  <script src="assets/js/chat.js"></script>
  <script src="assets/js/seller.js"></script>
  <script src="assets/js/app.js"></script>
</body>
</html>
