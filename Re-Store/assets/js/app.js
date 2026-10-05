/* assets/js/app.js - Controlador Principal Re-Store (TODAS AS TELAS E COMPONENTES IMPLEMENTADOS) */

const App = {
  currentScreen: 'home',
  selectedCategory: '',
  searchQuery: '',
  searchLocation: '',
  selectedProductId: null,
  productsCache: null,
  favoriteIds: [], // IDs dos produtos favoritados pelo usuário
  selectedRole: 'buyer', // 'buyer' ou 'seller'
  currentChatPartnerId: null,
  currentChatView: 'sidebar', // 'sidebar' ou 'chat'

  async init() {
    await AuthManager.checkAuth();
    await this.loadFavoriteIds();
    this.updateHeaderUI();
    this.renderCurrentScreen();
    this.setupEventListeners();
    this.setupGlobalShortcuts();
  },

  async loadFavoriteIds() {
    if (!AuthManager.currentUser) {
      this.favoriteIds = [];
      return;
    }
    try {
      const res = await fetch('api/favorites.php?action=list');
      const data = await res.json();
      if (data.success && Array.isArray(data.favorites)) {
        this.favoriteIds = data.favorites.map(f => f.id);
      }
    } catch (e) {
      console.error(e);
    }
  },

  updateHeaderUI() {
    const user = AuthManager.currentUser;
    const userNav = document.getElementById('user-nav-actions');
    const notifBadge = document.getElementById('notif-badge');

    if (notifBadge) {
      notifBadge.style.display = user ? 'flex' : 'none';
    }

    if (user && window.ChatManager) {
      ChatManager.getUnreadCount().then(count => {
        const headerBadge = document.getElementById('chat-header-badge');
        const mobileBadge = document.getElementById('chat-mobile-badge');
        if (headerBadge) {
          if (count > 0) {
            headerBadge.innerText = count > 99 ? '99+' : count;
            headerBadge.classList.remove('hidden');
            headerBadge.classList.add('flex');
          } else {
            headerBadge.classList.add('hidden');
            headerBadge.classList.remove('flex');
          }
        }
        if (mobileBadge) {
          if (count > 0) {
            mobileBadge.innerText = count > 99 ? '99+' : count;
            mobileBadge.classList.remove('hidden');
            mobileBadge.classList.add('flex');
          } else {
            mobileBadge.classList.add('hidden');
            mobileBadge.classList.remove('flex');
          }
        }
      }).catch(() => {});
    }

    if (!userNav) return;

    if (user) {
      userNav.innerHTML = `
    <button 
      type="button" 
      onclick="App.navigateTo('orders')" 
      title="Meus Pedidos" 
      class="text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-teal-600 cursor-pointer pointer-events-auto flex items-center gap-1"
    >
      <i data-lucide="package" class="w-4 h-4 pointer-events-none"></i>
      <span class="pointer-events-none">Pedidos</span>
    </button>

    <button 
      type="button" 
      onclick="App.navigateTo('points')" 
      title="Saldo e Nível" 
      class="badge-points px-3 py-1.5 rounded-full text-xs font-bold transition hover:opacity-90 cursor-pointer pointer-events-auto"
    >
      <i data-lucide="sprout" class="w-4 h-4 pointer-events-none"></i>
      <span class="pointer-events-none">${user.points} pts</span>

      <span class="bg-white/20 px-1.5 py-0.5 rounded text-[10px] pointer-events-none">
        Nível ${user.level}
      </span>
    </button>

    <button 
      type="button" 
      onclick="App.navigateTo('seller')" 
      class="text-sm font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 cursor-pointer pointer-events-auto"
    >
      Área Vendedor
    </button>

    <button 
      type="button" 
      onclick="App.navigateTo('profile')" 
      title="Meu Perfil" 
      class="flex items-center gap-2 text-sm font-semibold hover:opacity-80 cursor-pointer pointer-events-auto border border-teal-500/50 rounded-full px-2 py-1 bg-white/10"
    >
      <img 
        src="${user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" 
        class="w-7 h-7 rounded-full object-cover border border-teal-500 pointer-events-none" 
        alt="Avatar"
      >
      <span class="hidden md:inline pointer-events-none">
        ${user.name.split(' ')[0]}
      </span>
    </button>
  `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
    else {
      userNav.innerHTML = `
        <button type="button" onclick="App.showLoginModal()" class="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-teal-600 cursor-pointer pointer-events-auto px-2 py-1">
          Entrar
        </button>
        <button type="button" onclick="App.showRegisterModal()" class="btn-primary text-sm py-1.5 px-4 cursor-pointer pointer-events-auto">
          Criar Conta (+500 pts)
        </button>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  },

  googleClientId: '147889418852-7as919egt4ten74alk2mod9oecgbslqv.apps.googleusercontent.com',
  redirectAfterLogin: null,
  selectedProductImages: [],
  editExistingImages: [],
  editRemovedImageIds: [],
  editNewImages: [],

  navigateTo(screen, params = {}) {
    const protectedScreens = ['checkout', 'orders', 'notifications', 'profile', 'my-reviews', 'points', 'seller', 'add-product', 'edit-product', 'chat', 'favorites'];
    if (protectedScreens.includes(screen) && !AuthManager.currentUser) {
      this.redirectAfterLogin = { screen, params };
      ToastManager.show('Faça login para acessar esta funcionalidade.', 'info');
      this.showLoginModal();
      return;
    }

    this.currentScreen = screen;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (screen === 'chat') {
      this.chatParams = params || {};
    } else {
      this.chatParams = null;
      if (window.ChatManager) {
        ChatManager.stopPolling();
      }
    }

    if (params.category !== undefined) this.selectedCategory = params.category;
    if (params.search !== undefined) this.searchQuery = params.search;
    if (params.location !== undefined) this.searchLocation = params.location;
    if (params.productId) this.selectedProductId = params.productId;

    this.renderCurrentScreen().catch(err => console.error('Erro ao renderizar tela:', err));
  },

  async renderCurrentScreen() {
    const main = document.getElementById('main-content');
    if (!main) return;

    const protectedScreens = ['checkout', 'orders', 'notifications', 'profile', 'my-reviews', 'points', 'seller', 'add-product', 'edit-product', 'chat', 'favorites'];
    if (protectedScreens.includes(this.currentScreen) && !AuthManager.currentUser) {
      this.redirectAfterLogin = { screen: this.currentScreen, params: {} };
      this.currentScreen = 'home';
      this.showLoginModal();
      await this.renderHomeScreen(main);
      return;
    }

    switch (this.currentScreen) {
      case 'home':
        await this.renderHomeScreen(main);
        break;
      case 'search':
        await this.renderSearchScreen(main);
        break;
      case 'product-detail':
        await this.renderProductDetailScreen(main);
        break;
      case 'favorites':
        await this.renderFavoritesScreen(main);
        break;
      case 'cart':
        this.renderCartScreen(main);
        break;
      case 'checkout':
        this.renderCheckoutScreen(main);
        break;
      case 'orders':
        await this.renderOrdersScreen(main);
        break;
      case 'notifications':
        this.renderNotificationsScreen(main);
        break;
      case 'profile':
        await this.renderProfileScreen(main);
        break;
      case 'my-reviews':
        await this.renderMyReviewsScreen(main);
        break;
      case 'points':
        await this.renderPointsScreen(main);
        break;
      case 'seller':
        await this.renderSellerScreen(main);
        break;
      case 'add-product':
        this.renderAddProductScreen(main);
        break;
      case 'edit-product':
        await this.renderEditProductScreen(main);
        break;
      case 'chat':
        await this.renderChatScreen(main);
        break;
      case 'settings':
      case 'help':
        this.renderHelpScreen(main);
        break;
      default:
        await this.renderHomeScreen(main);
    }
  },

  getSkeletonCardsHTML(count = 4) {
    return Array(count).fill(0).map(() => `
      <div class="card-restore flex flex-col h-full p-4 space-y-3">
        <div class="skeleton-box aspect-square w-full"></div>
        <div class="skeleton-box h-4 w-1/3"></div>
        <div class="skeleton-box h-5 w-3/4"></div>
        <div class="skeleton-box h-4 w-1/2"></div>
        <div class="flex justify-between items-center pt-2">
          <div class="skeleton-box h-6 w-1/3"></div>
          <div class="skeleton-box h-8 w-1/3 rounded-full"></div>
        </div>
      </div>
    `).join('');
  },

  // ----------------------------------------------------
  // TELA 5: HOME
  // ----------------------------------------------------
  async renderHomeScreen(container) {
    container.innerHTML = `
     <!-- BANNER HERO -->
      <section class="relative bg-gradient-to-r from-teal-600 to-emerald-600 rounded-3xl p-6 md:p-10 text-white mb-8 overflow-hidden shadow-lg animate-fade-in flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="relative z-10 max-w-2xl">
          
          <span class="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
            <i data-lucide="recycle" class="w-4 h-4"></i>
            <span>Marketplace Reutilizável & Sustentável</span>
          </span>

          <h1 class="text-2xl md:text-4xl font-extrabold tracking-tight mb-3">
            Compre, Venda e Troque Produtos Sustentáveis com Recompensas
          </h1>

          <p class="text-teal-100 text-sm md:text-base mb-6 leading-relaxed">
            Acumule Pontos Verdes a cada compra sustentável e troque por cupons exclusivos no Re-Store.
          </p>

          <div class="flex flex-wrap gap-3">
            
            <button 
              type="button" 
              onclick="App.navigateTo('search')" 
              class="bg-white text-teal-700 font-bold px-5 py-2.5 rounded-full shadow hover:bg-teal-50 transition cursor-pointer flex items-center gap-2"
            >
              <i data-lucide="shopping-bag" class="w-4 h-4"></i>
              Explorar Produtos
            </button>

            <button 
              type="button" 
              onclick="App.showTutorialModal()" 
              class="bg-teal-700/60 border border-white/30 backdrop-blur-md text-white font-semibold px-5 py-2.5 rounded-full hover:bg-teal-700 transition cursor-pointer flex items-center gap-2"
            >
              <i data-lucide="graduation-cap" class="w-4 h-4"></i>
              Como Funciona
            </button>

          </div>
        </div>
      </section>


      <!-- ATALHOS RÁPIDOS DE ACESSO -->
      <section class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <button type="button" onclick="App.navigateTo('favorites')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <i data-lucide="heart" class="w-6 h-6 pointer-events-none"></i>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Meus Favoritos</div>
            <div class="text-[11px] text-gray-500">Itens salvos</div>
          </div>
        </button>
        <button type="button" onclick="App.navigateTo('orders')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <i data-lucide="shopping-bag" class="w-6 h-6 pointer-events-none"></i>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Meus Pedidos</div>
            <div class="text-[11px] text-gray-500">Acompanhar status</div>
          </div>
        </button>
        <button type="button" onclick="App.navigateTo('points')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <i data-lucide="sprout" class="w-6 h-6 pointer-events-none"></i>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Extrato de Pontos</div>
            <div class="text-[11px] text-gray-500">Saldo e cupons</div>
          </div>
        </button>
        <button type="button" onclick="App.navigateTo('chat')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <i data-lucide="message-circle" class="w-6 h-6 pointer-events-none"></i>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Chat Direto</div>
            <div class="text-[11px] text-gray-500">Conversar com vendedores</div>
          </div>
        </button>
      </section>

      <!-- BARRA DE CATEGORIAS -->
      <section class="mb-8">
        <h2 class="text-lg font-bold mb-4 flex items-center justify-between">
          <span>Categorias em Destaque</span>
          <button type="button" onclick="App.navigateTo('search')" class="text-xs text-teal-600 hover:underline cursor-pointer">Ver todas</button>
        </h2>
        <div class="flex gap-3 overflow-x-auto no-scrollbar pb-2">
         ${[
        { name: 'Todas', icon: 'leaf', cat: '' },
        { name: 'Utilidades', icon: 'milk', cat: 'Utilidades' },
        { name: 'Moda & Acessórios', icon: 'shirt', cat: 'Moda & Acessórios' },
        { name: 'Móveis & Decoração', icon: 'armchair', cat: 'Móveis & Decoração' },
        { name: 'Eletrônicos Eco', icon: 'plug', cat: 'Eletrônicos Eco' }
      ].map(c => `
          <button 
            type="button" 
            onclick="App.navigateTo('search', { category: '${c.cat}' })" 
            class="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition cursor-pointer ${this.selectedCategory === c.cat
          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-teal-500'
        }"
          >
            <i data-lucide="${c.icon}" class="w-5 h-5 pointer-events-none"></i>
            <span>${c.name}</span>
          </button>
        `).join('')}
        </div>
        </section>


      <!-- GRID DE PRODUTOS -->
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">Produtos Sustentáveis Recentes</h2>
          <span class="text-xs text-gray-400">Pressione <kbd class="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded font-mono text-[10px]">/</kbd> para buscar</span>
        </div>
        <div id="home-products-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          ${this.getSkeletonCardsHTML(4)}
        </div>
      </section>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    if (this.productsCache) {
      document.getElementById('home-products-grid').innerHTML = this.productsCache.map(p => this.renderProductCardHTML(p)).join('');
    }

    try {
      const res = await fetch('api/products.php?action=list');
      const data = await res.json();
      const grid = document.getElementById('home-products-grid');

      if (data.success && data.products.length > 0) {
        this.productsCache = data.products;
        if (grid) {
          grid.innerHTML = data.products.map(p => this.renderProductCardHTML(p)).join('');
        }
      } else if (grid && !this.productsCache) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">Nenhum produto cadastrado até o momento.</div>`;
      }
    } catch (e) {
      console.error(e);
    }
  },

  renderProductCardHTML(p) {
    const isFav = this.favoriteIds.includes(p.id);
    const heartIcon = isFav ? '❤️' : '🤍';

    const conditionBadge = p.product_condition === 'new'
      ? '<span class="badge-condition-new px-2 py-0.5 rounded text-[11px] font-semibold">Novo</span>'
      : (p.product_condition === 'restored'
        ? '<span class="badge-condition-restored px-2 py-0.5 rounded text-[11px] font-semibold">Restaurado</span>'
        : '<span class="badge-condition-used px-2 py-0.5 rounded text-[11px] font-semibold">Usado</span>');

    return `
      <div class="card-restore flex flex-col h-full group animate-fade-in">
        <div onclick="App.navigateTo('product-detail', { productId: ${p.id} })" class="relative overflow-hidden aspect-square bg-gray-100 dark:bg-gray-800 cursor-pointer">
          <img src="${p.primary_image}" alt="${p.name}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy">
          <div class="absolute top-2 left-2 flex flex-col gap-1 items-start">
            ${conditionBadge}
          </div>
          <button type="button" id="fav-btn-${p.id}" onclick="event.stopPropagation(); App.toggleFavorite(${p.id}, this)" title="${isFav ? 'Remover dos Favoritos' : 'Favoritar Produto'}" 
            class="absolute top-2 right-2 p-2 rounded-full transition shadow backdrop-blur cursor-pointer ${isFav ? 'bg-red-50 dark:bg-red-950/60 border border-red-200' : 'bg-white/80 dark:bg-gray-800/80 text-gray-400 hover:text-red-500'}">
            ${heartIcon}
          </button>
          <div class="absolute bottom-2 right-2">
            <span class="badge-points">+${p.points} pts</span>
          </div>
        </div>
        <div class="p-4 flex flex-col flex-grow justify-between">
          <div>
            <div class="flex items-center justify-between text-xs text-teal-600 font-semibold mb-1">
              <span>${p.category}</span>
              <span class="text-gray-400 font-normal">📍 ${p.location || 'São Paulo, SP'}</span>
            </div>
            <h3 onclick="App.navigateTo('product-detail', { productId: ${p.id} })" class="font-bold text-gray-900 dark:text-white text-base hover:text-teal-600 cursor-pointer line-clamp-1">
              ${p.name}
            </h3>
            <p class="text-xs text-gray-500 line-clamp-2 mt-1 mb-3">${p.description}</p>
          </div>
          <div>
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div>
                <span class="text-xs text-gray-400">Preço</span>
                <div class="text-lg font-extrabold text-gray-900 dark:text-white">
                  R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}
                </div>
              </div>
              <button type="button" onclick="App.addToCartDirect(${p.id}, this)" class="btn-primary text-xs py-1.5 px-3 cursor-pointer">
                <span>🛒</span> Adicionar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },


  // ----------------------------------------------------
  // TELA 7: DETALHES DO PRODUTO
  // ----------------------------------------------------
  async renderProductDetailScreen(container) {
    const user = AuthManager.currentUser;
    if (!this.selectedProductId) {
      container.innerHTML = `<div class="text-center py-12">Produto não selecionado.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="max-w-4xl mx-auto space-y-6">
        <div class="skeleton-box h-8 w-1/4 mb-4"></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div class="skeleton-box aspect-square w-full"></div>
          <div class="space-y-4">
            <div class="skeleton-box h-6 w-1/3"></div>
            <div class="skeleton-box h-10 w-3/4"></div>
            <div class="skeleton-box h-8 w-1/2"></div>
            <div class="skeleton-box h-24 w-full"></div>
            <div class="skeleton-box h-12 w-full"></div>
          </div>
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    try {
      const res = await fetch(`api/products.php?action=detail&id=${this.selectedProductId}`);
      const data = await res.json();

      if (!data.success) {
        container.innerHTML = `<div class="text-center py-12 text-red-500">${data.error}</div>`;
        return;
      }

      const p = data.product;
      const images = data.images;
      const reviews = data.reviews;

      container.innerHTML = `
        <div class="animate-fade-in max-w-4xl mx-auto">
          <div class="mb-4 flex items-center justify-between">
            <button type="button" onclick="App.navigateTo('home')" class="text-sm font-semibold text-teal-600 hover:underline flex items-center gap-1 cursor-pointer">
              ← Voltar para a loja
            </button>
            <span class="text-xs text-gray-400">Pressione <kbd class="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd> para voltar</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <!-- GALERIA DE IMAGENS -->
            <div>
              <div class="aspect-square bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden mb-4 border dark:border-gray-800 shadow-sm">
                <img id="main-product-img" src="${images[0].image_url}" class="w-full h-full object-cover" alt="${p.name}">
              </div>
              <div class="flex gap-3 overflow-x-auto no-scrollbar">
                ${images.map((img, idx) => `
                  <button type="button" onclick="document.getElementById('main-product-img').src='${img.image_url}'" class="w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-teal-500 transition cursor-pointer">
                    <img src="${img.image_url}" class="w-full h-full object-cover" alt="Thumb ${idx}">
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- DETALHES & AÇÕES -->
            <div class="flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs font-bold uppercase tracking-wider text-teal-600">${p.category}</span>
                  <span class="text-gray-300">•</span>
                  <span class="text-xs text-gray-500">${p.product_condition === 'new' ? 'Novo' : (p.product_condition === 'restored' ? 'Restaurado' : 'Usado')}</span>
                </div>
                <h1 class="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white mb-3">${p.name}</h1>

                <div class="flex items-center gap-3 mb-4">
                  <div class="text-2xl font-black text-teal-600 dark:text-teal-400">
                    R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}
                  </div>
                  <span class="badge-points text-xs inline-flex items-center gap-1">
                  <i data-lucide="sprout" class="w-4 h-4 pointer-events-none"></i> Recompensa +${p.points} Pontos</span>

                </div>

                <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl mb-4 border border-emerald-200 dark:border-emerald-900 flex items-center gap-3">
                  <span class="text-2xl">🌱</span>
                  <div>
                    <div class="font-bold text-xs text-emerald-800 dark:text-emerald-300">Impacto Ambiental Positivo</div>
                    <div class="text-[11px] text-emerald-700 dark:text-emerald-400">Ao optar por este item reutilizável, você evita aproximadamente 2,5 kg de resíduos e CO₂ na natureza.</div>
                  </div>
                </div>

                <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-6 border dark:border-gray-800">
                  <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descrição Ecológica</h3>
                  <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">${p.description}</p>
                  ${p.material ? `<div class="mt-3 text-xs text-gray-500"><strong>Material Sustentável:</strong> ${p.material}</div>` : ''}
                  <div class="mt-2 text-xs text-gray-500"><strong>📍 Local de venda:</strong> ${p.location || [p.seller_city, p.seller_state].filter(Boolean).join(', ') || 'Não informado'}</div>
                  <div class="mt-2 text-xs text-gray-500"><strong>Disponibilidade:</strong> ${p.stock > 0 ? p.stock + ' un. em estoque' : 'Esgotado'}</div>
                </div>

                <!-- CARD DO VENDEDOR -->
                <div class="flex items-center justify-between p-4 rounded-xl border dark:border-gray-800 mb-6 bg-white dark:bg-gray-800">
                  <div class="flex items-center gap-3">
                    <img src="${p.seller_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" class="w-10 h-10 rounded-full object-cover border border-teal-500">
                    <div>
                      <div class="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1">
                        ${p.seller_name}
                        ${p.is_verified_business ? '<span class="text-teal-500 text-xs" title="Empresa Verificada">✓</span>' : ''}
                      </div>
                      <div class="text-xs text-gray-500">Reputação: ★ 4.9 (Vendedor Confiável)</div>
                    </div>
                  </div>
                  ${user && parseInt(user.id, 10) === parseInt(p.seller_id, 10) ? '' : `
                    <button 
                      type="button" 
                      onclick="App.openChatWithUser(${p.seller_id}, ${p.id})" 
                      class="btn-outline text-xs py-1.5 px-3 cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <i data-lucide="message-circle" class="w-4 h-4 pointer-events-none"></i>
                      <span>Chat</span>
                    </button>
                  `}

                </div>

                ${user && parseInt(user.id) === parseInt(p.seller_id) ? `
                  <div class="mb-4 p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl flex items-center justify-between">
                    <span class="text-xs font-bold text-teal-800 dark:text-teal-300">Você é o anunciante deste produto</span>
                    <button 
                      type="button" 
                      onclick="App.navigateTo('edit-product', { productId: ${p.id} })" 
                      class="btn-primary text-xs py-1.5 px-3 cursor-pointer flex items-center gap-1"
                    >
                      <i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i>
                      Editar Anúncio
                    </button>

                  </div>
                ` : ''}
              </div>

              <!-- BOTOES DE COMPRA -->
              <div class="flex gap-4">
                <button type="button" onclick="App.addToCartAndCheckout(${p.id})" class="btn-secondary flex-1 py-3 text-base cursor-pointer">
                  ⚡ Comprar Agora
                </button>
                <button 
                  type="button" 
                  onclick="App.addToCartDirect(${p.id}, this)" 
                  class="btn-primary flex-1 py-3 text-base cursor-pointer flex items-center justify-center gap-2"
                >
                  <i data-lucide="shopping-cart" class="w-8 h-8 pointer-events-none"></i>
                  <span>Adicionar ao Carrinho</span>
                </button>


              </div>
            </div>
          </div>

          <!-- SEÇÃO DE AVALIAÇÕES DA COMUNIDADE -->
          <section class="border-t dark:border-gray-800 pt-8">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
              <span>Avaliações da Comunidade</span>
              <span class="text-sm font-normal text-gray-500">(${reviews.length})</span>
            </h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              ${reviews.length > 0 ? reviews.map(r => `
                <div class="p-4 rounded-xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex flex-col justify-between">
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <img src="${r.user_avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100'}" class="w-7 h-7 rounded-full object-cover">
                        <span class="font-semibold text-sm">${r.user_name}</span>
                      </div>
                      <div class="text-amber-400 text-sm">
                        ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
                      </div>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">${r.comment || 'Sem comentário.'}</p>
                  </div>
                  <div class="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                    <span class="text-[11px] text-gray-400">${r.created_at || 'Recente'}</span>
                    <button 
                      type="button" 
                      onclick="App.voteReviewHelpful(${r.id}, this)" 
                      class="text-xs text-gray-500 hover:text-teal-600 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <i data-lucide="thumbs-up" class="w-4 h-4 pointer-events-none"></i>
                      <span>Útil (${r.helpful_count || 0})</span>
                    </button>

                  </div>
                </div>
              `).join('') : '<div class="text-gray-500 text-sm">Seja o primeiro a avaliar este produto após a compra!</div>'}
            </div>
          </section>
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

    } catch (e) {
      console.error('Erro ao renderizar produto:', e);
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar o produto.</div>`;
    }
  },

  // ----------------------------------------------------
  // TELA 8 & 9: CARRINHO & CHECKOUT
  // ----------------------------------------------------
  renderCartScreen(container) {
    const cart = CartManager.getCart();
    const { total, totalPoints } = CartManager.getTotals();

    if (cart.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 animate-fade-in max-w-md mx-auto">
          <div class="text-6xl mb-4">🛒</div>
          <h2 class="text-2xl font-bold mb-2">Seu carrinho está vazio</h2>
          <p class="text-gray-500 mb-6">Explore nossos produtos sustentáveis e acumule pontos verdes.</p>
          <button type="button" onclick="App.navigateTo('search')" class="btn-primary w-full py-3 cursor-pointer">Explorar Produtos</button>
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      return;
    }

    container.innerHTML = `
      <div class="animate-fade-in">
        <h1 class="text-2xl font-extrabold mb-6">Carrinho de Compras</h1>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-4">
            ${cart.map(item => `
              <div class="flex items-center justify-between p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
                <div class="flex items-center gap-4">
                  <img src="${item.image}" onclick="App.navigateTo('product-detail', { productId: ${item.product_id} })" class="w-16 h-16 rounded-xl object-cover border dark:border-gray-700 cursor-pointer hover:opacity-80 transition" title="Ver Detalhes">
                  <div>
                    <h3 onclick="App.navigateTo('product-detail', { productId: ${item.product_id} })" class="font-bold text-gray-900 dark:text-white text-sm line-clamp-1 hover:text-teal-600 cursor-pointer" title="Ver Detalhes">${item.name}</h3>
                    <div class="text-xs text-gray-500">Vendedor: ${item.seller_name}</div>
                    <div class="text-sm font-extrabold text-teal-600 mt-1">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <div class="flex items-center border dark:border-gray-700 rounded-lg overflow-hidden">
                    <button type="button" onclick="App.updateCartQty(${item.product_id}, ${item.quantity - 1})" class="px-2.5 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">-</button>
                    <span class="px-3 py-1 text-sm font-semibold">${item.quantity}</span>
                    <button type="button" onclick="App.updateCartQty(${item.product_id}, ${item.quantity + 1})" class="px-2.5 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">+</button>
                  </div>
                  <button 
                    type="button" 
                    onclick="App.removeCartItem(${item.product_id})" 
                    title="Remover" 
                    aria-label="Remover produto"
                    class="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                  >
                    <i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i>
                  </button>

                </div>
              </div>
            `).join('')}
          </div>

          <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 h-fit shadow-sm">
            <h2 class="font-bold text-lg mb-4">Resumo do Pedido</h2>
            <div class="space-y-3 text-sm mb-6">
              <div class="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Subtotal</span>
                <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
              </div>
              <div class="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Frete Ecológico</span>
                <span class="text-teal-600 font-bold">Grátis</span>
              </div>
              <div class="flex justify-between text-emerald-600 font-bold border-t dark:border-gray-700 pt-3">
                <span>Pontos Verdes a Ganhar</span>
                <span>+${totalPoints} pts</span>
              </div>
              <div class="flex justify-between text-lg font-black text-gray-900 dark:text-white border-t dark:border-gray-700 pt-3">
                <span>Total</span>
                <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
            <button type="button" onclick="App.navigateTo('checkout')" class="btn-primary w-full py-3 text-base cursor-pointer">
              Ir para o Checkout Simulado
            </button>
          </div>
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  // ----------------------------------------------------
  // TELA 8 & 9: CHECKOUT (COM CUPOM DE USO ÚNICO E LIMITE DE ESTOQUE)
  // ----------------------------------------------------
  appliedCouponCode: '',

  async renderCheckoutScreen(container) {
    const user = AuthManager.currentUser;
    const { total, totalPoints } = CartManager.getTotals();

    if (!user) {
      this.showLoginModal();
      return;
    }

    // Buscar cupons disponíveis do usuário para facilitar o resgate
    let availableCoupons = [];
    try {
      const cRes = await fetch('api/points.php?action=discounts');
      const cData = await cRes.json();
      availableCoupons = (cData.discounts || []).filter(d => parseInt(d.is_used) === 0);
    } catch (e) { }

    let discountPercentage = 0;
    let appliedCoupon = null;
    if (this.appliedCouponCode) {
      appliedCoupon = availableCoupons.find(c => c.code.toUpperCase() === this.appliedCouponCode.toUpperCase());
      if (appliedCoupon) {
        if (appliedCoupon.discount_type === '5%') discountPercentage = 0.05;
        else if (appliedCoupon.discount_type === '10%') discountPercentage = 0.10;
        else if (appliedCoupon.discount_type === '15%') discountPercentage = 0.15;
        else if (appliedCoupon.discount_type === '20%') discountPercentage = 0.20;
        else if (appliedCoupon.discount_type === 'free_shipping') discountPercentage = 0.0;
      } else {
        this.appliedCouponCode = '';
      }
    }

    const discountValue = total * discountPercentage;
    const finalTotal = Math.max(0, total - discountValue);

    const pixCode = `00020126580014br.gov.bcb.pix0136restore-pix-${Date.now()}5204000053039865405${finalTotal.toFixed(2)}5802BR5908RESTORE6009SAOPAULO62070503***6304ABCD`;
    const boletoCode = `34191.79001 01043.510047 91020.150008 5 91230000007990`;

    container.innerHTML = `
      <div class="animate-fade-in max-w-4xl mx-auto">
        <h1 class="text-2xl font-extrabold mb-6">Finalizar Compra </h1>
        <form id="checkout-form" onsubmit="App.submitCheckout(event)" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
            <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <h2 class="font-bold text-base mb-4">1. Endereço de Entrega</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Rua e Número</label>
                  <input type="text" id="chk-address" required value="${user.address || ''}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Cidade</label>
                  <input type="text" id="chk-city" required value="${user.city || 'São Paulo'}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Estado (UF)</label>
                  <input type="text" id="chk-state" required value="${user.state || 'SP'}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">CEP</label>
                  <input type="text" id="chk-zip" required value="${user.zip_code || '01000-000'}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                </div>
              </div>
            </div>

            <!-- CAMPO DE CUPOM DE DESCONTO -->
            <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <h2 class="font-bold text-base mb-2">2. Cupom de Desconto de Uso Único </h2>
              <p class="text-xs text-gray-500 mb-4">Digite seu código de cupom ou selecione um dos cupons resgatados com seus Pontos Verdes.</p>
              
              ${this.appliedCouponCode && appliedCoupon ? `
                <div class="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">🎟️</span>
                    <div>
                      <div class="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                        Cupom Ativo: <span class="font-mono bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 font-extrabold">${appliedCoupon.code}</span> (${appliedCoupon.discount_type} OFF)
                      </div>
                      <div class="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Economia aplicada: <strong>- R$ ${discountValue.toFixed(2).replace('.', ',')}</strong>
                      </div>
                    </div>
                  </div>
                  <button type="button" onclick="App.removeCouponCheckout()" class="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 cursor-pointer">
                    Remover ✕
                  </button>
                </div>
              ` : `
                <div class="flex gap-2 mb-3">
                  <input type="text" id="chk-coupon-input" placeholder="Digite o código (ex: ECO10-1234)" value="" class="flex-1 px-4 py-2 border rounded-xl dark:bg-gray-700 font-mono text-sm uppercase">
                  <button type="button" onclick="App.applyCouponCheckout()" class="btn-primary text-xs py-2 px-5 cursor-pointer">
                    Aplicar Cupom
                  </button>
                </div>
              `}

              ${availableCoupons.length > 0 ? `
                <div class="mt-3">
                  <span class="text-[11px] font-bold text-gray-500">Seus Cupons Disponíveis:</span>
                  <div class="flex flex-wrap gap-2 mt-1.5">
                    ${availableCoupons.map(c => {
      const isSelected = this.appliedCouponCode.toUpperCase() === c.code.toUpperCase();
      return `
                        <button type="button" onclick="App.applyCouponDirect('${c.code}')" class="text-xs font-mono ${isSelected ? 'bg-teal-600 text-white font-bold shadow' : 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100'} px-3 py-1 rounded-full cursor-pointer transition">
                          🏷️ ${c.code} (${c.discount_type}) ${isSelected ? '✓' : ''}
                        </button>
                      `;


    }).join('')}
                  </div>
                </div>
              ` : '<div class="text-xs text-gray-400 mt-2">Você não tem cupons ativos. Troque seus pontos na aba "Extrato de Pontos" para obter cupons!</div>'}
            </div>

            <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <h2 class="font-bold text-base mb-4">3. Forma de Pagamento</h2>
              <div class="space-y-4">
                <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input type="radio" name="payment_method" value="pix" checked onchange="App.switchPaymentTab('pix')" class="text-teal-600">
                  <div>
                    <div class="font-bold text-sm">⚡ PIX Simulado (Confirmação Instantânea)</div>
                    <div class="text-xs text-gray-500">Sem taxas de transação. Pontos creditados na hora.</div>
                  </div>
                </label>

                <div id="pay-box-pix" class="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 text-center space-y-3">
                  <div class="font-bold text-xs text-emerald-800 dark:text-emerald-300">Escaneie o QR Code no app do seu banco:</div>
                  <div class="w-32 h-32 mx-auto bg-white p-2 rounded-xl shadow flex items-center justify-center border">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pixCode)}" class="w-full h-full object-contain" alt="QR Code PIX">
                  </div>
                  <div class="flex items-center gap-2 max-w-md mx-auto">
                    <input type="text" readonly value="${pixCode}" class="w-full px-3 py-1.5 border rounded-xl text-xs font-mono bg-white dark:bg-gray-800">
                    <button type="button" onclick="navigator.clipboard.writeText('${pixCode}'); ToastManager.show('Chave PIX copiada!', 'success')" class="btn-primary text-xs py-1.5 px-3 whitespace-nowrap cursor-pointer">
                      Copiar
                    </button>
                  </div>
                </div>

                <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input type="radio" name="payment_method" value="credit" onchange="App.switchPaymentTab('credit')" class="text-teal-600">
                  <div>
                    <div class="font-bold text-sm">💳 Cartão de Crédito</div>
                    <div class="text-xs text-gray-500">Preencha os dados do cartão fictício.</div>
                  </div>
                </label>

                <div id="pay-box-credit" class="hidden p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3">
                  <div>
                    <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome Impresso no Cartão</label>
                    <input type="text" placeholder="Nome Completo do Titular" value="${user.name}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-sm">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Número do Cartão</label>
                    <input type="text" placeholder="4532 •••• •••• 8892" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-sm font-mono">
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <div>
                      <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Validade</label>
                      <input type="text" placeholder="MM/AA" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-sm font-mono">
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">CVV</label>
                      <input type="text" placeholder="123" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-sm font-mono">
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Parcelas</label>
                      <select class="w-full px-2 py-2 border rounded-xl dark:bg-gray-800 text-xs">
                        <option>1x à vista</option>
                        <option>2x sem juros</option>
                        <option>3x sem juros</option>
                      </select>
                    </div>
                  </div>
                </div>

                <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input type="radio" name="payment_method" value="boleto" onchange="App.switchPaymentTab('boleto')" class="text-teal-600">
                  <div>
                    <div class="font-bold text-sm">📄 Boleto Ecológico Simulado</div>
                    <div class="text-xs text-gray-500">Gera código digital sem desperdício de papel.</div>
                  </div>
                </label>

                <div id="pay-box-boleto" class="hidden p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome do Titular do Boleto</label>
                      <input type="text" value="${user.name}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-sm">
                    </div>
                    <div>
                      <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">CPF do Titular</label>
                      <input type="text" value="${user.cpf || '123.456.789-00'}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-sm font-mono">
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Linha Digitável do Boleto</label>
                    <div class="flex gap-2">
                      <input type="text" readonly value="${boletoCode}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-800 text-xs font-mono">
                      <button type="button" onclick="navigator.clipboard.writeText('${boletoCode}'); ToastManager.show('Código do boleto copiado!', 'success')" class="btn-primary text-xs py-2 px-3 whitespace-nowrap cursor-pointer">
                        Copiar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 h-fit shadow-sm">
            <h2 class="font-bold text-lg mb-4">Finalizar Compra</h2>
            <div class="space-y-3 text-sm mb-6">
              <div class="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
              </div>
              ${discountValue > 0 ? `
                <div class="flex justify-between text-emerald-600 font-bold">
                  <span>Desconto (${this.appliedCouponCode})</span>
                  <span>- R$ ${discountValue.toFixed(2).replace('.', ',')}</span>
                </div>
              ` : ''}
              <div class="flex justify-between border-t dark:border-gray-700 pt-3">
                <span class="font-bold">Total a Pagar</span>
                <span class="font-black text-xl text-teal-600">R$ ${finalTotal.toFixed(2).replace('.', ',')}</span>
              </div>
              <div class="flex justify-between text-emerald-600 font-semibold text-xs border-t dark:border-gray-700 pt-2">
                <span>Pontos Verdes a Ganhar</span>
                <span>+${totalPoints} pts</span>
              </div>
            </div>
            <button type="submit" id="btn-submit-chk" class="btn-primary w-full py-3 text-base cursor-pointer">
              Confirmar Pedido Simulado
            </button>
          </div>
        </form>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  removeCouponCheckout() {
    this.appliedCouponCode = '';
    ToastManager.show('Cupom removido.', 'info');
    const main = document.getElementById('main-content');
    if (main && this.currentScreen === 'checkout') {
      this.renderCheckoutScreen(main);
    }
  },

  applyCouponDirect(code) {
    if (this.appliedCouponCode && this.appliedCouponCode.toUpperCase() === code.toUpperCase()) {
      ToastManager.show(`O cupom ${code} já está aplicado ao seu pedido!`, 'info');
      return;
    }
    const input = document.getElementById('chk-coupon-input');
    if (input) input.value = code;
    this.applyCouponCheckout(code);
  },

  async applyCouponCheckout(directCode = null) {
    if (this.isApplyingCoupon) return;
    const input = document.getElementById('chk-coupon-input');
    const code = (directCode || (input ? input.value : '')).trim().toUpperCase();

    if (!code) {
      ToastManager.show('Digite um código de cupom.', 'error');
      return;
    }

    if (this.appliedCouponCode && this.appliedCouponCode.toUpperCase() === code) {
      ToastManager.show(`O cupom ${code} já está aplicado ao seu pedido!`, 'info');
      return;
    }

    this.isApplyingCoupon = true;
    try {
      const res = await fetch('api/points.php?action=discounts');
      const data = await res.json();
      const discounts = data.discounts || [];
      const coupon = discounts.find(d => d.code.toUpperCase() === code);

      if (!coupon) {
        ToastManager.show('Cupom inválido ou não encontrado na sua conta.', 'error');
        return;
      }

      if (parseInt(coupon.is_used) === 1) {
        ToastManager.show('Este cupom já foi utilizado em outra compra!', 'error');
        return;
      }

      this.appliedCouponCode = coupon.code;
      ToastManager.show(`Cupom ${coupon.code} (${coupon.discount_type} OFF) aplicado com sucesso!`, 'success');
      this.renderCheckoutScreen(document.getElementById('main-content'));
    } catch (e) {
      ToastManager.show('Erro ao validar cupom.', 'error');
    } finally {
      this.isApplyingCoupon = false;
    }
  },

  async submitCheckout(e) {
    e.preventDefault();
    if (this.isSubmittingCheckout) return;

    const btn = document.getElementById('btn-submit-chk');
    this.isSubmittingCheckout = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳ Processando pedido...</span>`;
    }

    try {
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
      const shippingData = {
        address: document.getElementById('chk-address').value,
        city: document.getElementById('chk-city').value,
        state: document.getElementById('chk-state').value,
        zip: document.getElementById('chk-zip').value
      };

      const res = await CartManager.processCheckout(paymentMethod, shippingData, this.appliedCouponCode);
      if (res.success) {
        ToastManager.show(`Pedido #${res.order_number} confirmado com sucesso!`, 'success', 5000);
        this.appliedCouponCode = '';
        await AuthManager.checkAuth();
        this.updateHeaderUI();
        this.navigateTo('orders');
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `Confirmar Pedido Simulado`;
        }
        ToastManager.show(res.error || 'Erro ao concluir o checkout.', 'error');
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Confirmar Pedido Simulado`;
      }
      ToastManager.show('Erro ao processar pedido.', 'error');
    } finally {
      this.isSubmittingCheckout = false;
    }
  },

  // ----------------------------------------------------
  // TELA 10: MEUS PEDIDOS
  // ----------------------------------------------------
  async renderOrdersScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `<div class="max-w-4xl mx-auto space-y-4"><div class="skeleton-box h-24 w-full"></div><div class="skeleton-box h-48 w-full"></div></div>`;

    try {
      const res = await fetch('api/orders.php?action=my_orders');
      const data = await res.json();
      const orders = data.orders || [];

      container.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6 animate-fade-in">
          <div class="flex items-center justify-between">
            <h1 class="text-2xl font-extrabold">Meus Pedidos 📦</h1>
            <span class="text-xs text-gray-500">Histórico de compras sustentáveis</span>
          </div>

          ${orders.length > 0 ? orders.map(o => {
        const isCancelled = o.status === 'cancelled';
        const statusBadge = isCancelled
          ? `<span class="bg-red-100 text-red-800 text-xs px-2.5 py-0.5 rounded-full font-bold">Cancelado ${o.coupon_code ? '(Cupom Reativado ✓)' : ''}</span>`
          : '<span class="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">✓ Confirmado / Em Separação</span>';

        return `
              <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b dark:border-gray-700 pb-3">
                  <div>
                    <span class="font-bold text-sm text-teal-600">Pedido #${o.order_number}</span>
                    <span class="text-xs text-gray-400 ml-2">Data: ${o.created_at}</span>
                  </div>
                  <div>${statusBadge}</div>
                </div>

                <div class="space-y-3">
                  ${(o.items || []).map(i => `
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <img src="${i.product_image || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=100'}" class="w-12 h-12 rounded-xl object-cover border dark:border-gray-700">
                        <div>
                          <div class="font-bold text-sm text-gray-900 dark:text-white">${i.product_name}</div>
                          <div class="text-xs text-gray-500">Qtd: ${i.quantity} • Vendedor: ${i.seller_name}</div>
                          ${i.seller_id ? `
                            <button type="button" onclick="App.openChatWithUser(${i.seller_id}, ${i.product_id})" class="text-[11px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-semibold hover:underline inline-flex items-center gap-1 mt-1 cursor-pointer">
                              <i data-lucide="message-circle" class="w-3 h-3 pointer-events-none"></i>
                              <span>Conversar com vendedor</span>
                            </button>
                          ` : ''}
                        </div>
                      </div>
                      <div class="font-bold text-sm">R$ ${parseFloat(i.price).toFixed(2).replace('.', ',')}</div>
                    </div>
                  `).join('')}
                </div>

                <div class="flex flex-wrap items-center justify-between pt-3 border-t dark:border-gray-700 gap-2">
                  <div class="text-xs text-gray-500 space-y-1">
                    ${o.coupon_code ? `
                      <div class="text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1.5">
                        <span>🏷️ Cupom Aplicado:</span>
                        <span class="font-mono bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800 font-bold">${o.coupon_code}</span>
                        ${parseFloat(o.discount_amount) > 0 ? `<span class="text-emerald-600">(- R$ ${parseFloat(o.discount_amount).toFixed(2).replace('.', ',')})</span>` : ''}
                      </div>
                    ` : ''}
                    <div>
                      Total Pago: <strong class="text-gray-900 dark:text-white text-sm">R$ ${parseFloat(o.total).toFixed(2).replace('.', ',')}</strong> | Pontos Ganhos: <strong class="text-emerald-600">+${o.points_earned} pts</strong>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    ${!isCancelled ? `
                      <button type="button" onclick="App.cancelOrder(${o.id})" class="text-xs font-semibold text-red-500 hover:underline px-2 py-1 cursor-pointer">Cancelar Pedido</button>
                    ` : ''}
                    <button type="button" onclick="App.navigateTo('help')" class="btn-outline text-xs py-1 px-3 cursor-pointer">Suporte</button>
                  </div>
                </div>
              </div>
            `;
      }).join('') : `
            <div class="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-800">
              <div class="text-5xl mb-3">📦</div>
              <h2 class="text-lg font-bold mb-1">Você ainda não fez nenhum pedido</h2>
              <p class="text-xs text-gray-500 mb-4">Realize compras sustentáveis e acumule Pontos Verdes!</p>
              <button type="button" onclick="App.navigateTo('search')" class="btn-primary text-xs py-2 px-4 cursor-pointer">Explorar Loja</button>
            </div>
          `}
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar pedidos.</div>`;
    }
  },

  // ----------------------------------------------------
  // TELA 13: CENTRAL DE NOTIFICAÇÕES
  // ----------------------------------------------------
  renderNotificationsScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <h1 class="text-2xl font-extrabold mb-4">Central de Notificações 🔔</h1>

        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
          <h2 class="font-bold text-base mb-3">Últimos Alertas</h2>
          <div class="space-y-3">
            <div class="p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 rounded-2xl flex items-start gap-3">
              <span class="text-xl">🎁</span>
              <div>
                <div class="font-bold text-xs text-teal-800 dark:text-teal-300">Bônus de Boas-Vindas Re-Store</div>
                <div class="text-[11px] text-teal-700 dark:text-teal-400">Você ganhou +500 Pontos Verdes ao criar sua conta!</div>
              </div>
            </div>
            <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <span class="text-xl">📦</span>
              <div>
                <div class="font-bold text-xs text-emerald-800 dark:text-emerald-300">Atualização de Pedido</div>
                <div class="text-[11px] text-emerald-700 dark:text-emerald-400">Seu pedido foi confirmado e o vendedor já está preparando a entrega.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
          <h2 class="font-bold text-base mb-3">Preferências de Notificação</h2>
          <div class="space-y-3 text-xs">
            <label class="flex items-center justify-between p-2 border rounded-xl cursor-pointer">
              <span>Notificações de Atualização de Pedidos</span>
              <input type="checkbox" checked class="text-teal-600">
            </label>
            <label class="flex items-center justify-between p-2 border rounded-xl cursor-pointer">
              <span>Novas Mensagens no Chat</span>
              <input type="checkbox" checked class="text-teal-600">
            </label>
            <label class="flex items-center justify-between p-2 border rounded-xl cursor-pointer">
              <span>Promoções e Cupons de Pontos</span>
              <input type="checkbox" checked class="text-teal-600">
            </label>
          </div>
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  // ----------------------------------------------------
  // TELA 14: EXTRATO DE PONTOS RE-STORE
  // ----------------------------------------------------
  async renderPointsScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `<div class="max-w-4xl mx-auto space-y-4"><div class="skeleton-box h-32 w-full"></div><div class="skeleton-box h-48 w-full"></div></div>`;

    try {
      const resHistory = await fetch('api/points.php?action=history');
      const dataHistory = await resHistory.json();
      const resDiscounts = await fetch('api/points.php?action=discounts');
      const dataDiscounts = await resDiscounts.json();

      const points = dataHistory.points || 0;
      const discounts = dataDiscounts.discounts || [];

      let levelName = 'Iniciante 🌱';
      if (points >= 2500) levelName = 'Eco Master 👑';
      else if (points >= 1000) levelName = 'Eco Warrior ⚔️';
      else if (points >= 500) levelName = 'Sustentável 🌿';

      container.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
          <div class="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between shadow-xl gap-4">
            <div>
              <span class="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">Nível de Engajamento: ${levelName}</span>
              <div class="text-4xl font-extrabold mt-2">${points} Pontos Verdes 🌱</div>
              <div class="text-xs text-emerald-100 mt-1">Acumule pontos em compras sustentáveis e troque por cupons.</div>
            </div>
            <button type="button" onclick="App.navigateTo('search')" class="bg-white text-emerald-800 font-bold px-5 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition shadow cursor-pointer">
              Ganhar Mais Pontos
            </button>
          </div>

          <div>
            <h2 class="text-xl font-bold mb-4">Resgatar Cupons de Desconto</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              ${[
          { type: '5%', name: 'Desconto de 5%', cost: 150 },
          { type: '10%', name: 'Desconto de 10%', cost: 300 },
          { type: '15%', name: 'Desconto de 15%', cost: 500 },
          { type: 'free_shipping', name: 'Frete Grátis Ecológico', cost: 250 }
        ].map(c => `
                <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex flex-col justify-between shadow-sm">
                  <div>
                    <div class="text-2xl font-black text-teal-600 mb-1">${c.type === 'free_shipping' ? '🚚' : c.type}</div>
                    <div class="font-bold text-sm text-gray-900 dark:text-white">${c.name}</div>
                    <div class="text-xs text-gray-500 mt-1">Custo: ${c.cost} Pontos</div>
                  </div>
                  <button type="button" onclick="App.redeemCoupon('${c.type}', this)" ${points < c.cost ? 'disabled' : ''} 
                    class="mt-4 btn-primary text-xs py-2 w-full cursor-pointer ${points < c.cost ? 'opacity-50 cursor-not-allowed' : ''}">
                    ${points >= c.cost ? 'Resgatar Cupom' : 'Pontos Insuficientes'}
                  </button>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- SEÇÃO MEUS CUPONS RESGATADOS -->
          <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold">Meus Cupons Resgatados 🎟️</h2>
              <span class="text-xs text-gray-400">${discounts.length} cupom(ns) encontrado(s)</span>
            </div>

            ${discounts.length > 0 ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                ${discounts.map(d => {
          const isUsed = parseInt(d.is_used) === 1;
          return `
                    <div class="p-4 rounded-2xl border ${isUsed ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 opacity-60' : 'border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30'} flex flex-col justify-between">
                      <div>
                        <div class="flex items-center justify-between mb-2">
                          <span class="font-extrabold text-sm ${isUsed ? 'text-gray-500' : 'text-teal-600 dark:text-teal-400'}">${d.discount_type === 'free_shipping' ? '🚚 Frete Grátis' : `${d.discount_type} OFF`}</span>
                          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isUsed ? 'bg-gray-200 text-gray-600' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'}">
                            ${isUsed ? 'Utilizado' : 'Disponível ✓'}
                          </span>
                        </div>
                        <div class="bg-white dark:bg-gray-800 p-2 rounded-xl border dark:border-gray-700 text-center font-mono font-bold text-sm tracking-wider my-2 select-all text-gray-800 dark:text-gray-200">
                          ${d.code}
                        </div>
                        <div class="text-[11px] text-gray-400 text-center">Custo: ${d.points_cost} pontos</div>
                      </div>

                      ${!isUsed ? `
                        <div class="flex gap-2 mt-3">
                          <button type="button" onclick="navigator.clipboard.writeText('${d.code}'); ToastManager.show('Código ${d.code} copiado!', 'info');" class="btn-outline text-[11px] py-1.5 flex-1 cursor-pointer">
                            Copiar
                          </button>
                          <button type="button" onclick="App.appliedCouponCode = '${d.code}'; ToastManager.show('Cupom ${d.code} selecionado para o checkout!', 'success'); App.navigateTo('cart');" class="btn-primary text-[11px] py-1.5 flex-1 cursor-pointer">
                            Usar no Carrinho
                          </button>
                        </div>
                      ` : `
                        <div class="text-center text-[10px] text-gray-400 mt-3 italic">Já utilizado em compra anterior</div>
                      `}
                    </div>
                  `;
        }).join('')}
              </div>
            ` : `
              <div class="text-center py-8 text-gray-400 text-xs">
                Você ainda não resgatou nenhum cupom. Use seus pontos acumulados acima para resgatar descontos exclusivos!
              </div>
            `}
          </div>
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar sistema de pontos.</div>`;
    }
  },

  async redeemCoupon(discountType, btnElement = null) {
    if (this.isRedeemingCoupon) return;

    if (!AuthManager.currentUser) {
      this.showLoginModal();
      return;
    }

    this.isRedeemingCoupon = true;
    let originalText = '';
    if (btnElement) {
      originalText = btnElement.innerText;
      btnElement.disabled = true;
      btnElement.innerText = 'Resgatando... ⏳';
    }

    try {
      const res = await fetch('api/points.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', discount_type: discountType })
      });
      const data = await res.json();
      if (data.success) {
        ToastManager.show(data.message || `Cupom ${data.code} resgatado com sucesso!`, 'success', 5000);
        if (data.remaining_points !== undefined) {
          AuthManager.currentUser.points = data.remaining_points;
        }
        this.updateHeaderUI();
        const main = document.getElementById('main-content');
        if (main && this.currentScreen === 'points') {
          this.renderPointsScreen(main);
        }
      } else {
        ToastManager.show(data.error || 'Erro ao resgatar cupom.', 'error');
      }
    } catch (e) {
      ToastManager.show('Erro ao processar resgate de cupom.', 'error');
    } finally {
      this.isRedeemingCoupon = false;
      if (btnElement && btnElement.disabled) {
        btnElement.disabled = false;
        btnElement.innerText = originalText;
      }
    }
  },

  // ----------------------------------------------------
  // TELA 15 & 16: PERFIL DO USUÁRIO & EDIÇÃO
  // ----------------------------------------------------
  async renderProfileScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    const isPJ = parseInt(user.is_verified_business) === 1;

    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center justify-between shadow-sm">
          <div class="flex items-center gap-4">
            <img src="${user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'}" class="w-16 h-16 rounded-full object-cover border-2 border-teal-500">
            <div>
              <h1 class="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                ${user.name}
                ${isPJ ? '<span class="text-xs bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 px-2 py-0.5 rounded-full font-bold">CNPJ Verificado ✓</span>' : ''}
              </h1>
              <div class="text-xs text-gray-500">${user.email} • ${user.city || 'São Paulo'}, ${user.state || 'SP'}</div>
              <div class="mt-2 flex items-center gap-2">
                <span class="badge-points">🌱 ${user.points} Pontos Verdes</span>
                <span class="bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 text-xs px-2.5 py-0.5 rounded-full font-bold">Nível ${user.level}</span>
              </div>
            </div>
          </div>
          <button type="button" onclick="App.confirmLogout()" class="text-xs font-semibold text-red-500 hover:underline cursor-pointer">
            Sair da Conta
          </button>
        </div>

        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
          <h2 class="font-bold text-lg mb-4">Editar Perfil & Dados Empresariais (CNPJ)</h2>
          <form onsubmit="App.submitEditProfile(event)" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Nome Completo</label>
                <input type="text" id="prof-name" value="${user.name}" required class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Telefone / WhatsApp</label>
                <input type="text" id="prof-phone" value="${user.phone || ''}" placeholder="(11) 99999-9999" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Tipo de Conta / Empresa Verificada</label>
                <select id="prof-verified" onchange="const box = document.getElementById('cnpj-box'); if (this.value === '1') { box.style.display = 'block'; } else { box.style.display = 'none'; document.getElementById('prof-cnpj').value = ''; }" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                  <option value="0" ${!isPJ ? 'selected' : ''}>Pessoa Física (PF)</option>
                  <option value="1" ${isPJ ? 'selected' : ''}>Empresa Sustentável Verificada (PJ)</option>
                </select>
              </div>
              <div id="cnpj-box" style="display: ${isPJ ? 'block' : 'none'};">
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Número de CNPJ</label>
                <input type="text" id="prof-cnpj" value="${isPJ ? (user.cnpj || '') : ''}" placeholder="00.000.000/0001-00" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm font-mono">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Foto de Perfil (Upload Local)</label>
                <input type="file" id="prof-avatar" accept="image/*" class="w-full text-xs text-gray-500">
              </div>
            </div>
            <div class="flex justify-between items-center pt-2">
              <button type="submit" class="btn-primary text-sm py-2 px-6 cursor-pointer">Salvar Alterações</button>
              <button type="button" onclick="App.confirmDeleteAccount()" class="text-xs font-bold text-red-500 hover:underline cursor-pointer">Excluir Minha Conta Permanentemente</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  // ----------------------------------------------------
  // TELA 17: MINHAS AVALIAÇÕES
  // ----------------------------------------------------
  async renderMyReviewsScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `<div class="max-w-3xl mx-auto text-center py-12">Carregando avaliações...</div>`;

    try {
      const res = await fetch(`api/reviews.php?action=list&user_id=${user.id}`);
      const data = await res.json();
      const reviews = data.reviews || [];

      container.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-6 animate-fade-in">
          <h1 class="text-2xl font-extrabold mb-4">Minhas Avaliações ⭐</h1>
          ${reviews.length > 0 ? reviews.map(r => `
            <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm space-y-2">
              <div class="flex justify-between items-center">
                <span class="font-bold text-sm text-teal-600">${r.product_name}</span>
                <span class="text-amber-400 text-sm">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              <p class="text-xs text-gray-600 dark:text-gray-300">${r.comment}</p>
            </div>
          `).join('') : '<div class="text-center text-gray-500 text-sm py-8">Você ainda não avaliou nenhum produto.</div>'}
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar avaliações.</div>`;
    }
  },

  // ----------------------------------------------------
  // TELA 20: PAINEL DO VENDEDOR
  // ----------------------------------------------------
  async renderSellerScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `<div class="max-w-4xl mx-auto space-y-4"><div class="skeleton-box h-24 w-full"></div><div class="skeleton-box h-48 w-full"></div></div>`;

    try {
      const metricsData = await SellerManager.getDashboardMetrics();
      const productsData = await SellerManager.getMyProducts();

      const metrics = metricsData.metrics || { active_products: 0, low_stock_count: 0, total_sales: 0, total_revenue: 0 };
      const products = productsData.products || [];

      container.innerHTML = `
        <div class="space-y-8 animate-fade-in">
          <div class="flex items-center justify-between">
            <h1 class="text-2xl font-extrabold">Painel da Área do Vendedor</h1>
            <div class="flex items-center gap-2">
              <button type="button" onclick="App.navigateTo('chat')" class="btn-outline text-sm py-2 px-4 cursor-pointer flex items-center gap-1.5">
                <i data-lucide="message-circle" class="w-4 h-4"></i>
                <span>Mensagens</span>
              </button>
              <button type="button" onclick="App.navigateTo('add-product')" class="btn-primary text-sm py-2 px-4 cursor-pointer">
                + Cadastrar Novo Produto
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <div class="text-xs text-gray-500 font-semibold">Produtos Ativos</div>
              <div class="text-2xl font-bold text-teal-600 mt-1">${metrics.active_products}</div>
            </div>
            <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <div class="text-xs text-gray-500 font-semibold">Total de Vendas</div>
              <div class="text-2xl font-bold text-emerald-600 mt-1">${metrics.total_sales}</div>
            </div>
            <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <div class="text-xs text-gray-500 font-semibold">Faturamento Total</div>
              <div class="text-2xl font-bold text-gray-900 dark:text-white mt-1">R$ ${parseFloat(metrics.total_revenue).toFixed(2).replace('.', ',')}</div>
            </div>
            <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800">
              <div class="text-xs text-gray-500 font-semibold">Estoque Baixo (≤ 3)</div>
              <div class="text-2xl font-bold text-amber-500 mt-1">${metrics.low_stock_count}</div>
            </div>
          </div>

          <div>
            <h2 class="text-lg font-bold mb-4">Meus Anúncios</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              ${products.map(p => `
                <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center justify-between">
                  <div class="flex items-center gap-3 cursor-pointer" onclick="App.navigateTo('product-detail', { productId: ${p.id} })" title="Ver Detalhes do Produto">
                    <img src="${p.primary_image}" class="w-12 h-12 rounded-xl object-cover hover:opacity-80 transition">
                    <div>
                      <div class="font-bold text-sm text-gray-900 dark:text-white line-clamp-1 hover:text-teal-600 transition">${p.name}</div>
                      <div class="text-xs text-gray-500">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</div>
                      <div class="mt-1">
                        ${parseInt(p.stock) <= 0
                          ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Esgotado</span>'
                          : (parseInt(p.stock) <= 3
                            ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⚠ Estoque baixo: ${p.stock} un.</span>`
                            : `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Estoque: ${p.stock} un.</span>`)}
                      </div>
                      <div class="text-[11px] text-gray-400 mt-1">📍 ${p.location || 'Local não informado'}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button type="button" onclick="App.navigateTo('edit-product', { productId: ${p.id} })" title="Editar Anúncio" class="text-teal-600 hover:text-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 p-2 rounded-lg text-sm cursor-pointer transition">
                      ✏️
                    </button>
                    <button type="button" onclick="App.deleteProductSeller(${p.id})" title="Excluir Anúncio" class="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 p-2 rounded-lg text-sm cursor-pointer transition">
                      🗑️
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar área do vendedor.</div>`;
    }
  },

  // ----------------------------------------------------
  // TELA 21: ADICIONAR PRODUTO
  // ----------------------------------------------------
  renderAddProductScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    this.selectedProductImages = [];

    container.innerHTML = `
      <div class="max-w-2xl mx-auto animate-fade-in">
        <button type="button" onclick="App.navigateTo('seller')" class="text-sm text-teal-600 font-semibold hover:underline mb-4 block cursor-pointer">← Voltar para Área do Vendedor</button>
        <h1 class="text-2xl font-extrabold mb-6">Cadastrar Produto Sustentável</h1>

        <form onsubmit="App.submitAddProduct(event)" class="space-y-4 p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome do Produto *</label>
            <input type="text" id="prod-name" required placeholder="Ex: Garrafa Térmica Inox" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Preço (R$) *</label>
              <input type="number" step="0.01" id="prod-price" required placeholder="79.90" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Categoria *</label>
              <select id="prod-category" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                <option value="Utilidades">Utilidades</option>
                <option value="Moda & Acessórios">Moda & Acessórios</option>
                <option value="Móveis & Decoração">Móveis & Decoração</option>
                <option value="Eletrônicos Eco">Eletrônicos Eco</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Condição do Produto *</label>
              <select id="prod-condition" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                <option value="used">Usado (Reutilizável)</option>
                <option value="restored">Restaurado / Upcycled</option>
                <option value="new">Novo (Ecológico)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Estoque Disponível *</label>
              <input type="number" id="prod-stock" value="1" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Local de Venda (Cidade, UF) *</label>
            <input type="text" id="prod-location" required value="${((AuthManager.currentUser && AuthManager.currentUser.city) ? AuthManager.currentUser.city + (AuthManager.currentUser.state ? ', ' + AuthManager.currentUser.state : '') : '').replace(/"/g, '&quot;')}" placeholder="Ex: São Paulo, SP" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Material Sustentável / Atributos Ecológicos</label>
            <input type="text" id="prod-material" placeholder="Ex: Aço Inox / Algodão Orgânico / Upcycled" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Descrição Detalhada & Impacto Ecológico *</label>
            <textarea id="prod-desc" rows="4" required placeholder="Descreva o produto e seu impacto socioambiental positivo..." class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm"></textarea>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Fotos do Produto (1 foto obrigatória, até 5 fotos) *</label>
            <input type="file" id="prod-images" multiple accept="image/png,image/jpeg,image/jpg,image/webp" onchange="App.handleProductImageSelect(event)" class="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer">
            <p class="text-[11px] text-gray-400 mt-1">Selecione de 1 a 5 fotos. Você pode selecionar uma a uma ou várias juntas. A primeira foto será a capa principal.</p>
            <div id="prod-images-preview" class="hidden mt-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border dark:border-gray-700"></div>
          </div>

          <button type="submit" id="btn-add-prod" class="btn-primary w-full py-3 text-sm cursor-pointer">Publicar Anúncio no Marketplace</button>
        </form>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  handleProductImageSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      if (this.selectedProductImages.length >= 5) {
        ToastManager.show('Você pode anexar no máximo 5 fotos por produto!', 'warning');
        break;
      }
      if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
        ToastManager.show(`Formato não suportado: ${file.name}. Use JPG, PNG ou WEBP.`, 'error');
        continue;
      }
      this.selectedProductImages.push(file);
    }

    // Limpar o input de arquivo para permitir selecionar a mesma ou outra foto individualmente
    e.target.value = '';
    this.renderProductImagesPreview();
  },

  renderProductImagesPreview() {
    const previewContainer = document.getElementById('prod-images-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '';
    if (!this.selectedProductImages || this.selectedProductImages.length === 0) {
      previewContainer.classList.add('hidden');
      return;
    }

    previewContainer.classList.remove('hidden');

    const header = document.createElement('div');
    header.className = 'text-xs font-bold text-teal-700 dark:text-teal-300 mb-2 flex items-center justify-between';
    header.innerHTML = `
      <span>📸 ${this.selectedProductImages.length}/5 foto(s) selecionada(s)</span>
      <span class="text-[10px] text-gray-400 font-normal">A foto #1 será a capa</span>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    previewContainer.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-5 gap-3';

    this.selectedProductImages.forEach((file, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'relative aspect-square rounded-xl overflow-hidden border-2 ' + (i === 0 ? 'border-teal-500 ring-2 ring-teal-300' : 'border-gray-200 dark:border-gray-600') + ' shadow-sm bg-gray-100 dark:bg-gray-800';

      const img = document.createElement('img');
      img.className = 'w-full h-full object-cover';
      img.alt = `Foto ${i + 1}`;
      img.src = URL.createObjectURL(file);

      const badge = document.createElement('span');
      badge.className = `absolute bottom-0 inset-x-0 ${i === 0 ? 'bg-teal-600' : 'bg-black/60'} text-white text-[9px] font-bold text-center py-0.5 pointer-events-none`;
      badge.innerText = i === 0 ? 'Principal' : `#${i + 1}`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.title = 'Remover esta foto';
      removeBtn.className = 'absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black shadow cursor-pointer transition';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = (evt) => {
        evt.stopPropagation();
        App.removeSelectedProductImage(i);
      };

      thumb.appendChild(img);
      thumb.appendChild(badge);
      thumb.appendChild(removeBtn);
      grid.appendChild(thumb);
    });

    previewContainer.appendChild(grid);
  },

  removeSelectedProductImage(index) {
    if (index >= 0 && index < this.selectedProductImages.length) {
      this.selectedProductImages.splice(index, 1);
      this.renderProductImagesPreview();
    }
  },

  async submitAddProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-add-prod');

    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const category = document.getElementById('prod-category').value;
    const condition = document.getElementById('prod-condition').value;
    const stock = parseInt(document.getElementById('prod-stock').value) || 1;
    const material = document.getElementById('prod-material').value.trim();
    const location = document.getElementById('prod-location').value.trim();
    const description = document.getElementById('prod-desc').value.trim();

    if (!name || !description || isNaN(price) || price <= 0 || !category) {
      ToastManager.show('Por favor, preencha todos os campos obrigatórios do produto.', 'error');
      return;
    }

    if (!this.selectedProductImages || this.selectedProductImages.length === 0) {
      ToastManager.show('É obrigatório incluir pelo menos 1 foto do produto.', 'error');
      return;
    }

    if (this.selectedProductImages.length > 5) {
      ToastManager.show('Você pode anexar no máximo 5 fotos por produto.', 'error');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Publicando anúncio... ⏳';
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('price', price);
    formData.append('category', category);
    formData.append('product_condition', condition);
    formData.append('stock', stock);
    formData.append('material', material);
    formData.append('location', location);
    formData.append('description', description);

    for (let i = 0; i < this.selectedProductImages.length; i++) {
      formData.append('images[]', this.selectedProductImages[i]);
    }

    try {
      const res = await SellerManager.addProduct(formData);
      if (res.success) {
        this.selectedProductImages = [];
        ToastManager.show(res.message || 'Produto cadastrado com sucesso no marketplace!', 'success', 5000);
        this.productsCache = null;
        this.navigateTo('seller');
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Publicar Anúncio no Marketplace';
        }
        ToastManager.show(res.error || 'Erro ao cadastrar produto.', 'error');
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Publicar Anúncio no Marketplace';
      }
      ToastManager.show('Erro de conexão ao enviar produto.', 'error');
    }
  },

  // ----------------------------------------------------
  // TELA 22: EDITAR PRODUTO (ÁREA DO VENDEDOR)
  // ----------------------------------------------------
  async renderEditProductScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    if (!this.selectedProductId) {
      container.innerHTML = `
        <div class="text-center py-12">
          <p class="text-gray-500 mb-4">Nenhum produto selecionado para edição.</p>
          <button type="button" onclick="App.navigateTo('seller')" class="btn-primary text-xs py-2 px-4 cursor-pointer">Voltar para Área do Vendedor</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="max-w-2xl mx-auto py-12 text-center text-gray-500">Carregando dados do anúncio...</div>`;

    try {
      const res = await fetch(`api/products.php?action=detail&id=${this.selectedProductId}`);
      const data = await res.json();

      if (!data.success || !data.product) {
        container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar produto para edição.</div>`;
        return;
      }

      const p = data.product;
      if (parseInt(p.seller_id) !== parseInt(user.id)) {
        ToastManager.show('Você não tem permissão para editar este anúncio.', 'error');
        this.navigateTo('seller');
        return;
      }

      this.editExistingImages = (data.images || []).map(img => ({ ...img }));
      this.editRemovedImageIds = [];
      this.editNewImages = [];

      container.innerHTML = `
        <div class="max-w-2xl mx-auto animate-fade-in">
          <button type="button" onclick="App.navigateTo('seller')" class="text-sm text-teal-600 font-semibold hover:underline mb-4 block cursor-pointer">← Voltar para Área do Vendedor</button>
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl font-extrabold">Editar Produto Sustentável</h1>
            <span class="text-xs bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-mono px-2 py-1 rounded border border-teal-200 dark:border-teal-800">ID #${p.id}</span>
          </div>

          <form onsubmit="App.submitEditProduct(event, ${p.id})" class="space-y-4 p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome do Produto *</label>
              <input type="text" id="edit-prod-name" required value="${(p.name || '').replace(/"/g, '&quot;')}" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Preço (R$) *</label>
                <input type="number" step="0.01" id="edit-prod-price" required value="${parseFloat(p.price).toFixed(2)}" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Categoria *</label>
                <select id="edit-prod-category" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                  <option value="Utilidades" ${p.category === 'Utilidades' ? 'selected' : ''}>Utilidades</option>
                  <option value="Moda & Acessórios" ${p.category === 'Moda & Acessórios' ? 'selected' : ''}>Moda & Acessórios</option>
                  <option value="Móveis & Decoração" ${p.category === 'Móveis & Decoração' ? 'selected' : ''}>Móveis & Decoração</option>
                  <option value="Eletrônicos Eco" ${p.category === 'Eletrônicos Eco' ? 'selected' : ''}>Eletrônicos Eco</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Condição do Produto *</label>
                <select id="edit-prod-condition" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                  <option value="used" ${p.product_condition === 'used' ? 'selected' : ''}>Usado (Reutilizável)</option>
                  <option value="restored" ${p.product_condition === 'restored' ? 'selected' : ''}>Restaurado / Upcycled</option>
                  <option value="new" ${p.product_condition === 'new' ? 'selected' : ''}>Novo (Ecológico)</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Estoque Disponível *</label>
                <input type="number" id="edit-prod-stock" value="${p.stock}" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Local de Venda (Cidade, UF) *</label>
              <input type="text" id="edit-prod-location" required value="${(p.location || '').replace(/"/g, '&quot;')}" placeholder="Ex: São Paulo, SP" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Material Sustentável / Atributos Ecológicos</label>
              <input type="text" id="edit-prod-material" value="${(p.material || '').replace(/"/g, '&quot;')}" placeholder="Ex: Aço Inox / Algodão Orgânico" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Descrição Detalhada & Impacto Ecológico *</label>
              <textarea id="edit-prod-desc" rows="4" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">${p.description || ''}</textarea>
            </div>

            <!-- GESTÃO DE FOTOS -->
            <div class="border-t dark:border-gray-700 pt-4 space-y-4">
              <h3 class="font-bold text-sm">Fotos do Produto (1 a 5 fotos)</h3>
              
              <!-- FOTOS ATUAIS -->
              <div>
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Fotos Atuais no Anúncio</label>
                <div id="edit-existing-images" class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <!-- renderEditImagesPreview() -->
                </div>
              </div>

              <!-- ADICIONAR NOVAS FOTOS -->
              <div>
                <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Adicionar Mais Fotos</label>
                <input type="file" id="edit-prod-images-input" multiple accept="image/png,image/jpeg,image/jpg,image/webp" onchange="App.handleEditNewImageSelect(event)" class="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer">
                <p class="text-[11px] text-gray-400 mt-1">Selecione fotos adicionais. O anúncio pode ter até 5 fotos no total.</p>
                <div id="edit-new-images-preview" class="hidden mt-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-2xl border dark:border-gray-700"></div>
              </div>
            </div>

            <div class="flex gap-3 pt-4 border-t dark:border-gray-700">
              <button type="button" onclick="App.navigateTo('seller')" class="btn-outline flex-1 py-2.5 text-sm cursor-pointer">Cancelar</button>
              <button type="submit" id="btn-edit-prod-submit" class="btn-primary flex-1 py-2.5 text-sm cursor-pointer">Salvar Alterações</button>
            </div>
          </form>
        </div>
      `;

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      this.renderEditImagesPreview();

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro de comunicação com o servidor.</div>`;
    }
  },

  renderEditImagesPreview() {
    const existingContainer = document.getElementById('edit-existing-images');
    if (!existingContainer) return;

    const visibleExisting = this.editExistingImages.filter(img => !this.editRemovedImageIds.includes(img.id));

    if (visibleExisting.length === 0) {
      existingContainer.innerHTML = `<div class="col-span-full text-xs text-amber-500 font-semibold p-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200">Todas as fotos antigas foram marcadas para remoção. Adicione pelo menos 1 nova foto abaixo.</div>`;
    } else {
      existingContainer.innerHTML = visibleExisting.map((img, idx) => `
        <div class="relative aspect-square rounded-xl overflow-hidden border-2 ${idx === 0 && this.editNewImages.length === 0 ? 'border-teal-500 ring-2 ring-teal-300' : 'border-gray-200 dark:border-gray-700'} shadow-sm bg-gray-100 dark:bg-gray-800">
          <img src="${img.image_url}" class="w-full h-full object-cover">
          <span class="absolute bottom-0 inset-x-0 ${idx === 0 ? 'bg-teal-600' : 'bg-black/60'} text-white text-[9px] font-bold text-center py-0.5 pointer-events-none">
            ${idx === 0 ? 'Principal' : `#${idx + 1}`}
          </span>
          <button type="button" onclick="App.removeEditExistingImage(${img.id})" title="Remover esta foto" class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black shadow cursor-pointer transition">
            ✕
          </button>
        </div>
      `).join('');

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }

    this.renderEditNewImagesPreview();
  },

  removeEditExistingImage(id) {
    const totalRemaining = (this.editExistingImages.length - this.editRemovedImageIds.length - 1) + this.editNewImages.length;
    if (totalRemaining < 1) {
      ToastManager.show('O produto precisa ter pelo menos 1 foto. Adicione uma nova foto antes de remover esta.', 'warning');
      return;
    }
    this.editRemovedImageIds.push(id);
    this.renderEditImagesPreview();
  },

  handleEditNewImageSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      const activeTotal = (this.editExistingImages.length - this.editRemovedImageIds.length) + this.editNewImages.length;
      if (activeTotal >= 5) {
        ToastManager.show('O limite total é de 5 fotos por produto!', 'warning');
        break;
      }
      if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
        ToastManager.show(`Formato não suportado: ${file.name}. Use JPG, PNG ou WEBP.`, 'error');
        continue;
      }
      this.editNewImages.push(file);
    }

    e.target.value = '';
    this.renderEditNewImagesPreview();
  },

  renderEditNewImagesPreview() {
    const newContainer = document.getElementById('edit-new-images-preview');
    if (!newContainer) return;

    if (this.editNewImages.length === 0) {
      newContainer.classList.add('hidden');
      newContainer.innerHTML = '';
      return;
    }

    newContainer.classList.remove('hidden');
    newContainer.innerHTML = `
      <div class="text-xs font-bold text-teal-700 dark:text-teal-300 mb-2">
        Novas fotos selecionadas (${this.editNewImages.length}):
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3" id="edit-new-grid"></div>
    `;

    const grid = document.getElementById('edit-new-grid');
    this.editNewImages.forEach((file, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'relative aspect-square rounded-xl overflow-hidden border-2 border-emerald-400 shadow-sm bg-gray-100 dark:bg-gray-800';
      thumb.innerHTML = `
        <img src="${URL.createObjectURL(file)}" class="w-full h-full object-cover">
        <span class="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[9px] font-bold text-center py-0.5 pointer-events-none">Nova</span>
        <button type="button" onclick="App.removeEditNewImage(${i})" title="Remover nova foto" class="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-black shadow cursor-pointer transition">
          ✕
        </button>
      `;
      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      grid.appendChild(thumb);
    });
  },

  removeEditNewImage(idx) {
    this.editNewImages.splice(idx, 1);
    this.renderEditNewImagesPreview();
  },

  async submitEditProduct(e, productId) {
    e.preventDefault();
    const btn = document.getElementById('btn-edit-prod-submit');

    const totalRemaining = (this.editExistingImages.length - this.editRemovedImageIds.length) + this.editNewImages.length;
    if (totalRemaining < 1) {
      ToastManager.show('É obrigatório que o produto possua pelo menos 1 foto.', 'error');
      return;
    }

    const name = document.getElementById('edit-prod-name').value.trim();
    const price = parseFloat(document.getElementById('edit-prod-price').value);
    const category = document.getElementById('edit-prod-category').value;
    const condition = document.getElementById('edit-prod-condition').value;
    const stock = parseInt(document.getElementById('edit-prod-stock').value) || 0;
    const material = document.getElementById('edit-prod-material').value.trim();
    const location = document.getElementById('edit-prod-location').value.trim();
    const description = document.getElementById('edit-prod-desc').value.trim();

    if (!name || !description || isNaN(price) || price <= 0 || !category) {
      ToastManager.show('Preencha todos os campos obrigatórios do produto.', 'error');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Salvando alterações... ⏳';
    }

    const formData = new FormData();
    formData.append('id', productId);
    formData.append('name', name);
    formData.append('price', price);
    formData.append('category', category);
    formData.append('product_condition', condition);
    formData.append('stock', stock);
    formData.append('material', material);
    formData.append('location', location);
    formData.append('description', description);

    for (const remId of this.editRemovedImageIds) {
      formData.append('removed_image_ids[]', remId);
    }

    for (const file of this.editNewImages) {
      formData.append('images[]', file);
    }

    try {
      const res = await SellerManager.updateProduct(formData);
      if (res.success) {
        ToastManager.show(res.message || 'Produto atualizado com sucesso!', 'success', 4000);
        this.productsCache = null;
        this.navigateTo('seller');
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Salvar Alterações';
        }
        ToastManager.show(res.error || 'Erro ao atualizar produto.', 'error');
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Salvar Alterações';
      }
      ToastManager.show('Erro de comunicação ao salvar produto.', 'error');
    }
  },

  // ----------------------------------------------------
  // TELA 12: CHAT DE ATENDIMENTO E NEGOCIAÇÃO
  // ----------------------------------------------------
  async openChatWithUser(receiverId, productId = null) {
    if (!AuthManager.currentUser) {
      ToastManager.show('Faça login para conversar pelo chat.', 'info');
      this.showLoginModal();
      return;
    }
    receiverId = parseInt(receiverId, 10);
    if (parseInt(AuthManager.currentUser.id, 10) === receiverId) {
      ToastManager.show('Você não pode conversar consigo mesmo.', 'info');
      return;
    }
    this.navigateTo('chat', { withUserId: receiverId, productId: productId });
  },

  async openSupportChat() {
    if (!AuthManager.currentUser) {
      ToastManager.show('Faça login para conversar com o suporte.', 'info');
      this.showLoginModal();
      return;
    }

    const currentEmail = (AuthManager.currentUser.email || '').toLowerCase().trim();
    if (currentEmail === 'tccdssuporte@gmail.com') {
      ToastManager.show('Você está logado na conta de Suporte. Selecione uma conversa na lista para atender.', 'info');
      if (this.currentScreen !== 'chat') {
        this.navigateTo('chat');
      }
      return;
    }

    ToastManager.show('Conectando ao Suporte Re-Store...', 'info');

    try {
      const res = await ChatManager.getSupportUser();
      if (res && res.success && res.support_user && res.support_user.id) {
        const supportId = parseInt(res.support_user.id, 10);
        if (parseInt(AuthManager.currentUser.id, 10) === supportId) {
          ToastManager.show('Você é o operador da conta de suporte.', 'info');
          return;
        }
        this.chatParams = { withUserId: supportId };
        if (this.currentScreen !== 'chat') {
          this.navigateTo('chat', { withUserId: supportId });
        } else {
          await this.selectChatPartner(supportId);
        }
      } else {
        ToastManager.show((res && res.error) ? res.error : 'Não foi possível conectar ao suporte agora. Tente novamente em instantes.', 'error');
      }
    } catch (err) {
      console.error('Erro ao abrir chat de suporte:', err);
      ToastManager.show('Falha de conexão com a central de suporte.', 'error');
    }
  },

  formatChatTime(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  },

  async renderChatScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    const targetPartnerId = this.chatParams?.withUserId ? parseInt(this.chatParams.withUserId, 10) : null;
    const targetProductId = this.chatParams?.productId ? parseInt(this.chatParams.productId, 10) : null;

    this.currentChatPartnerId = targetPartnerId;
    this.currentChatView = targetPartnerId ? 'chat' : 'sidebar';

    container.innerHTML = `
      <div class="h-[78vh] min-h-[520px] rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 flex overflow-hidden shadow-xl animate-fade-in relative">
        <!-- BARRA LATERAL: LISTA DE CONVERSAS -->
        <div id="chat-sidebar" class="w-full md:w-80 lg:w-96 md:shrink-0 border-r border-gray-200 dark:border-gray-800 flex md:flex flex-col bg-gray-50/80 dark:bg-gray-900/50 overflow-hidden">
          <div class="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-800/80">
            <div class="flex items-center gap-2">
              <h2 class="font-extrabold text-base text-gray-900 dark:text-white">Mensagens</h2>
              <span id="chat-sidebar-badge" class="hidden bg-teal-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">0</span>
            </div>
            <button type="button" onclick="App.refreshConversationsList()" title="Atualizar conversas" class="text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition p-1.5 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/60">
              <i data-lucide="rotate-cw" class="w-4 h-4"></i>
            </button>
          </div>

          <!-- BOTÃO DESTACADO: SUPORTE OFICIAL RE-STORE (ALTO CONTRASTE E COMPATÍVEL COM MODO CLARO E ESCURO) -->
          <div class="p-3 pb-2.5 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-800/40">
            <button 
              type="button" 
              onclick="App.openSupportChat()" 
              class="w-full p-2.5 rounded-2xl btn-support-banner flex items-center justify-between transition-all duration-200 cursor-pointer group shadow-sm"
              title="Falar diretamente com a equipe de suporte"
            >
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform">
                  <i data-lucide="headphones" class="w-4 h-4 pointer-events-none"></i>
                </div>
                <div class="text-left">
                  <div class="font-bold text-xs flex items-center gap-1.5 text-white">
                    <span>Falar com o Suporte</span>
                    <span class="text-[9px] bg-white/25 px-1.5 py-0.5 rounded-full font-bold">Oficial</span>
                  </div>
                  <div class="text-[10px] text-teal-100 subtext">Atendimento e dúvidas do Re-Store</div>
                </div>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-white/80 group-hover:translate-x-0.5 transition-transform pointer-events-none"></i>
            </button>
          </div>

          <div id="chat-convs-list" class="flex-1 overflow-y-auto p-3 space-y-2">
            <div class="text-center py-8 text-xs text-gray-400 dark:text-gray-500">Carregando conversas...</div>
          </div>
        </div>

        <!-- JANELA PRINCIPAL DO CHAT -->
        <div id="chat-window" class="hidden md:flex flex-1 min-w-0 flex-col justify-between bg-white dark:bg-gray-900 relative h-full overflow-hidden">
          <div class="text-center my-auto p-6 space-y-3 text-gray-500 dark:text-gray-400">
            <div class="w-16 h-16 rounded-full bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center mx-auto text-teal-600 dark:text-teal-400 mb-1 border border-teal-100 dark:border-teal-900">
              <i data-lucide="messages-square" class="w-8 h-8"></i>
            </div>
            <div class="font-bold text-sm text-gray-800 dark:text-gray-100">Central de Mensagens Re-Store</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed">Selecione uma conversa ao lado para responder ou tire suas dúvidas diretamente com nossa equipe.</div>
            <div class="pt-2">
              <button 
                type="button" 
                onclick="App.openSupportChat()" 
                class="btn-primary text-xs py-2.5 px-4 rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <i data-lucide="headphones" class="w-4 h-4"></i>
                <span>Falar com o Suporte</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Configura layout garantindo que a barra lateral permaneça sempre visível no desktop
    this.updateChatLayout(this.currentChatView);

    // Carrega lista lateral de conversas
    await this.refreshConversationsList(targetPartnerId);

    // Se o usuário entrou direcionado para conversar com um vendedor/usuário específico
    if (targetPartnerId) {
      await this.selectChatPartner(targetPartnerId, targetProductId);
    }
  },

  updateChatLayout(view = 'chat') {
    const sidebar = document.getElementById('chat-sidebar');
    const win = document.getElementById('chat-window');
    if (!sidebar || !win) return;

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      if (view === 'sidebar') {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('flex');
        win.classList.remove('flex');
        win.classList.add('hidden');
      } else {
        sidebar.classList.remove('flex');
        sidebar.classList.add('hidden');
        win.classList.remove('hidden');
        win.classList.add('flex');
      }
    } else {
      // No desktop (>= 768px): AMBOS SEMPRE VISÍVEIS lado a lado para navegação imediata
      sidebar.classList.remove('hidden');
      sidebar.classList.add('flex');
      win.classList.remove('hidden');
      win.classList.add('flex');
    }
  },

  async selectChatPartner(partnerId, productId = null) {
    partnerId = parseInt(partnerId, 10);
    if (isNaN(partnerId) || partnerId <= 0) return;

    this.currentChatPartnerId = partnerId;
    this.currentChatView = 'chat';
    this.chatParams = { withUserId: partnerId, productId: productId };
    ChatManager.stopPolling();

    // Mantém a barra lateral e o chat no layout correto (mobile foca na conversa; desktop mantém ambos lado a lado)
    this.updateChatLayout('chat');

    // Atualiza imediatamente o destaque visual do item ativo na lista lateral
    const convItems = document.querySelectorAll('#chat-convs-list [data-partner-id]');
    if (convItems.length > 0) {
      convItems.forEach(el => {
        const id = parseInt(el.getAttribute('data-partner-id'), 10);
        if (id === partnerId) {
          el.className = 'p-3 rounded-2xl border transition cursor-pointer flex items-center gap-3 border-teal-500 bg-teal-50 dark:bg-teal-950/50 shadow-sm ring-1 ring-teal-500/30';
        } else {
          el.className = 'p-3 rounded-2xl border transition cursor-pointer flex items-center gap-3 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-gray-100/50 dark:hover:bg-gray-700/50';
        }
      });
    }

    const win = document.getElementById('chat-window');
    if (!win) return;

    win.innerHTML = `
      <div class="text-center my-auto p-8 text-gray-400 dark:text-gray-500 space-y-2">
        <div class="animate-spin inline-block w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full"></div>
        <div class="text-xs">Carregando mensagens...</div>
      </div>
    `;

    const res = await ChatManager.getMessages(partnerId, productId);
    if (!res || !res.success || !res.partner) {
      win.innerHTML = `
        <div class="p-6 text-center my-auto space-y-3">
          <div class="text-sm text-red-500">${res?.error || 'Não foi possível carregar a conversa.'}</div>
          <button type="button" onclick="App.toggleMobileChatList(true)" class="btn-outline text-xs py-1.5 px-3 cursor-pointer">Voltar às Conversas</button>
        </div>
      `;
      return;
    }

    const partner = res.partner;
    const msgs = res.messages || [];
    const product = res.product;
    const currentUserId = AuthManager.currentUser ? parseInt(AuthManager.currentUser.id, 10) : 0;
    const partnerAvatar = partner.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(partner.name)}&background=0d9488&color=fff&size=80`;

    win.innerHTML = `
      <!-- CABEÇALHO DO CHAT -->
      <div class="p-3.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-800 z-10 shadow-sm">
        <div class="flex items-center gap-3">
          <button type="button" onclick="App.toggleMobileChatList(true)" class="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer" title="Voltar para lista">
            <i data-lucide="arrow-left" class="w-5 h-5"></i>
          </button>
          <img src="${partnerAvatar}" class="w-10 h-10 rounded-full object-cover border border-teal-500/30" alt="${this.escapeHtml(partner.name)}">
          <div>
            <div class="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
              ${this.escapeHtml(partner.name)}
              ${partner.is_verified_business ? '<span class="text-teal-600 dark:text-teal-400 text-xs font-bold" title="Vendedor Verificado">✓</span>' : ''}
            </div>
            <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              ${partner.business_name ? this.escapeHtml(partner.business_name) : 'Disponível no Re-Store'}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button type="button" onclick="App.refreshActiveChat(${partnerId}, ${product && product.id ? product.id : (productId ? productId : 'null')})" title="Recarregar conversa" class="p-2 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition rounded-lg cursor-pointer">
            <i data-lucide="rotate-cw" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- CARD DO PRODUTO EM NEGOCIAÇÃO (SE HOUVER) -->
      ${product ? `
        <div class="p-2.5 mx-4 mt-3 bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 rounded-2xl flex items-center justify-between shadow-sm">
          <div class="flex items-center gap-2.5 min-w-0">
            <img src="${product.image_url || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=100'}" class="w-9 h-9 rounded-xl object-cover shrink-0 border border-teal-200 dark:border-teal-700">
            <div class="min-w-0">
              <div class="text-[10px] text-teal-800 dark:text-teal-300 font-bold uppercase tracking-wider">Negociando Produto</div>
              <div class="font-bold text-xs text-gray-900 dark:text-white truncate">${this.escapeHtml(product.name)}</div>
              <div class="text-xs font-extrabold text-teal-600 dark:text-teal-400">R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}</div>
            </div>
          </div>
          <button type="button" onclick="App.navigateTo('product-detail', { productId: ${product.id} })" class="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline px-2 py-1 shrink-0 cursor-pointer">
            Ver Anúncio →
          </button>
        </div>
      ` : ''}

      <!-- CORPO DE MENSAGENS COM CONTRASTE EQUILIBRADO NO MODO CLARO E ESCURO -->
      <div id="chat-msgs-body" class="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 min-h-0 w-full chat-body-bg bg-slate-50/70 dark:bg-gray-950/40">
        ${msgs.length === 0 ? `
          <div id="chat-empty-intro" class="text-center py-12 space-y-2 text-gray-400 dark:text-gray-500">
            <div class="text-3xl">💬</div>
            <div class="font-bold text-xs text-gray-700 dark:text-gray-300">Inicie uma conversa com ${this.escapeHtml(partner.name)}!</div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400 max-w-xs mx-auto">Tire dúvidas sobre o produto, combine formas de entrega ou faça sua proposta.</div>
          </div>
        ` : ''}

        ${msgs.map(m => this.renderMessageBubbleHTML(m, currentUserId, partnerId)).join('')}
      </div>

      <!-- SUGESTÕES RÁPIDAS -->
      <div class="px-4 py-2 border-t border-gray-200 dark:border-gray-800/80 bg-white dark:bg-gray-900 flex gap-2 overflow-x-auto no-scrollbar">
        ${(partner.name.toLowerCase().includes('suporte') || (partner.business_name && partner.business_name.toLowerCase().includes('suporte')) ? [
          'Como funciona o sistema de pontos e cupons?',
          'Preciso de ajuda com um pedido meu',
          'Como me tornar um vendedor verificado (PJ)?',
          'Gostaria de tirar uma dúvida geral'
        ] : [
          'Olá, o produto ainda está disponível?',
          'Qual o valor do frete?',
          'Aceita negociar o valor?',
          'Pode me enviar mais fotos/detalhes?'
        ]).map(q => `
          <button type="button" onclick="App.applyQuickQuestion('${this.escapeHtml(q)}')" class="text-[11px] font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-full whitespace-nowrap hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition text-gray-700 dark:text-gray-300 cursor-pointer shadow-sm">
            ${this.escapeHtml(q)}
          </button>
        `).join('')}
      </div>

      <!-- FORMULÁRIO DE ENVIO -->
      <form onsubmit="App.sendChatMessage(event, ${partnerId}, ${product && product.id ? product.id : (productId ? productId : 'null')})" class="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center gap-2">
        <input 
          type="text" 
          id="chat-input-text" 
          autocomplete="off" 
          required 
          placeholder="Digite sua mensagem aqui..." 
          class="flex-1 px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
        >
        <button type="submit" id="chat-send-btn" class="btn-primary text-xs py-2.5 px-5 rounded-2xl flex items-center gap-1.5 font-bold cursor-pointer shrink-0 shadow-sm">
          <span>Enviar</span>
          <i data-lucide="send" class="w-3.5 h-3.5"></i>
        </button>
      </form>
    `;

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    this.scrollChatToBottom();

    // Ativa polling delta inteligente a cada 2.5 segundos
    ChatManager.startPolling(newMessages => {
      this.appendIncomingChatMessages(newMessages, partnerId);
    });

    // Atualiza contadores visuais do cabeçalho
    this.updateHeaderUI();
  },

  renderMessageBubbleHTML(m, currentUserId, partnerId) {
    const isMe = parseInt(m.sender_id, 10) === currentUserId;
    const timeFormatted = this.formatChatTime(m.created_at);
    const bubbleId = `chat-msg-${m.id}`;

    return `
      <div id="${bubbleId}" class="flex w-full ${isMe ? 'justify-end' : 'justify-start'} group animate-fade-in">
        <div class="relative max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words overflow-hidden ${
          isMe 
            ? 'chat-bubble-me bg-teal-600 text-white rounded-br-sm' 
            : 'chat-bubble-other bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        }">
          <div class="break-words leading-relaxed whitespace-pre-wrap">${this.escapeHtml(m.message)}</div>
          <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] ${isMe ? 'text-teal-100' : 'text-gray-500 dark:text-gray-400'}">
            <span>${timeFormatted}</span>
            ${isMe ? `<span class="msg-status font-bold">${m.is_read ? '✓✓' : '✓'}</span>` : ''}
            ${isMe ? `
              <button 
                type="button" 
                onclick="App.deleteChatMessage(${m.id}, ${partnerId})" 
                title="Apagar mensagem" 
                class="msg-delete-btn opacity-0 group-hover:opacity-100 hover:text-red-300 ml-1 transition cursor-pointer text-xs"
              >
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  appendIncomingChatMessages(newMessages, partnerId) {
    if (!Array.isArray(newMessages) || newMessages.length === 0) return;
    const body = document.getElementById('chat-msgs-body');
    if (!body) return;

    const intro = document.getElementById('chat-empty-intro');
    if (intro) intro.remove();

    const currentUserId = AuthManager.currentUser ? parseInt(AuthManager.currentUser.id, 10) : 0;
    let appendedCount = 0;

    newMessages.forEach(m => {
      if (document.getElementById(`chat-msg-${m.id}`)) return;

      const tempHolder = document.createElement('div');
      tempHolder.innerHTML = this.renderMessageBubbleHTML(m, currentUserId, partnerId);
      if (tempHolder.firstElementChild) {
        body.appendChild(tempHolder.firstElementChild);
        appendedCount++;
      }
    });

    if (appendedCount > 0) {
      this.scrollChatToBottom();
      this.refreshConversationsList(partnerId);
    }
  },

  async sendChatMessage(e, partnerId, productId = null) {
    e.preventDefault();
    const input = document.getElementById('chat-input-text');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.focus();

    const intro = document.getElementById('chat-empty-intro');
    if (intro) intro.remove();

    const body = document.getElementById('chat-msgs-body');
    const tempId = 'temp_' + Date.now();
    const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Inserção otimista instantânea na tela
    if (body) {
      const tempHolder = document.createElement('div');
      tempHolder.innerHTML = `
        <div id="chat-msg-${tempId}" class="flex w-full justify-end group animate-fade-in">
          <div class="relative max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words overflow-hidden chat-bubble-me bg-teal-600 text-white rounded-br-sm">
            <div class="break-words leading-relaxed whitespace-pre-wrap">${this.escapeHtml(text)}</div>
            <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-teal-100">
              <span>${nowTime}</span>
              <span class="msg-status">Enviando...</span>
            </div>
          </div>
        </div>
      `;
      if (tempHolder.firstElementChild) {
        body.appendChild(tempHolder.firstElementChild);
        this.scrollChatToBottom();
      }
    }

    try {
      const res = await ChatManager.sendMessage(partnerId, text, productId);
      if (res.success && res.message) {
        const sent = res.message;
        if (parseInt(sent.id, 10) > ChatManager.lastMessageId) {
          ChatManager.lastMessageId = parseInt(sent.id, 10);
        }

        const tempEl = document.getElementById(`chat-msg-${tempId}`);
        if (tempEl) {
          tempEl.id = `chat-msg-${sent.id}`;
          const statusEl = tempEl.querySelector('.msg-status');
          if (statusEl) statusEl.innerHTML = '✓';

          const timeContainer = tempEl.querySelector('.text-\\[10px\\]');
          if (timeContainer) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.setAttribute('onclick', `App.deleteChatMessage(${sent.id}, ${partnerId})`);
            delBtn.title = 'Apagar mensagem';
            delBtn.className = 'msg-delete-btn opacity-0 group-hover:opacity-100 hover:text-red-300 ml-1 transition cursor-pointer text-xs';
            delBtn.innerText = '🗑️';
            timeContainer.appendChild(delBtn);
          }
        }

        this.refreshConversationsList(partnerId);
      } else {
        ToastManager.show(res.error || 'Não foi possível enviar a mensagem.', 'error');
        const tempEl = document.getElementById(`chat-msg-${tempId}`);
        if (tempEl) {
          const statusEl = tempEl.querySelector('.msg-status');
          if (statusEl) statusEl.innerHTML = '⚠️ Não enviada';
        }
      }
    } catch (err) {
      console.error(err);
      ToastManager.show('Erro de conexão ao enviar mensagem.', 'error');
    }
  },

  async deleteChatMessage(msgId, partnerId) {
    if (!confirm('Deseja apagar esta mensagem enviada?')) return;

    const res = await ChatManager.deleteMessage(msgId);
    if (res.success) {
      const el = document.getElementById(`chat-msg-${msgId}`);
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        el.style.transition = 'all 0.2s ease';
        setTimeout(() => el.remove(), 200);
      }
      ToastManager.show('Mensagem apagada com sucesso.', 'info');
      this.refreshConversationsList(partnerId);
    } else {
      ToastManager.show(res.error || 'Erro ao apagar mensagem.', 'error');
    }
  },

  async refreshConversationsList(activePartnerId = null) {
    if (!activePartnerId && this.currentChatPartnerId) {
      activePartnerId = this.currentChatPartnerId;
    }
    const convsList = document.getElementById('chat-convs-list');
    if (!convsList) return;

    const convsRes = await ChatManager.getConversations();
    if (!convsRes.success) {
      convsList.innerHTML = `<div class="text-xs text-red-400 p-2">Erro ao carregar conversas.</div>`;
      return;
    }

    const convs = convsRes.conversations || [];
    let totalUnread = 0;
    convs.forEach(c => totalUnread += (c.unread_count || 0));

    const sideBadge = document.getElementById('chat-sidebar-badge');
    if (sideBadge) {
      if (totalUnread > 0) {
        sideBadge.innerText = totalUnread;
        sideBadge.classList.remove('hidden');
      } else {
        sideBadge.classList.add('hidden');
      }
    }

    if (convs.length === 0) {
      convsList.innerHTML = `
        <div class="text-center py-10 px-3 text-gray-400 space-y-2">
          <i data-lucide="message-square-dashed" class="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600"></i>
          <div class="text-xs font-bold text-gray-600 dark:text-gray-300">Nenhuma conversa ainda</div>
          <div class="text-[11px] text-gray-400">Clique em "Chat" na página de qualquer anúncio para conversar com o vendedor.</div>
        </div>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      return;
    }

    convsList.innerHTML = convs.map(c => {
      const isActive = activePartnerId && parseInt(c.user.id, 10) === parseInt(activePartnerId, 10);
      const avatar = c.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.user.name)}&background=0d9488&color=fff&size=60`;
      const lastMsgText = c.last_message ? this.escapeHtml(c.last_message.message) : 'Iniciou a conversa';
      const time = c.last_message ? this.formatChatTime(c.last_message.created_at) : '';

      return `
        <div 
          data-partner-id="${c.user.id}"
          onclick="App.selectChatPartner(${c.user.id})" 
          class="p-3 rounded-2xl border transition cursor-pointer flex items-center gap-3 ${
            isActive 
              ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/50 shadow-sm ring-1 ring-teal-500/30' 
              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-gray-100/50 dark:hover:bg-gray-700/50'
          }"
        >
          <div class="relative shrink-0">
            <img src="${avatar}" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" alt="${this.escapeHtml(c.user.name)}">
            ${c.unread_count > 0 ? `
              <span class="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                ${c.unread_count}
              </span>
            ` : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-0.5">
              <div class="font-bold text-xs text-gray-900 dark:text-white truncate">
                ${this.escapeHtml(c.user.name)}
              </div>
              <span class="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">${time}</span>
            </div>
            <div class="text-[11px] text-gray-600 dark:text-gray-300 truncate ${c.unread_count > 0 ? 'font-bold text-gray-900 dark:text-white' : ''}">
              ${lastMsgText}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  toggleMobileChatList(showList) {
    if (showList) {
      ChatManager.stopPolling();
      this.currentChatView = 'sidebar';
      this.updateChatLayout('sidebar');
      this.refreshConversationsList(this.currentChatPartnerId || null);
    } else {
      this.currentChatView = 'chat';
      this.updateChatLayout('chat');
    }
  },

  scrollChatToBottom() {
    const body = document.getElementById('chat-msgs-body');
    if (body) {
      body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
    }
  },

  applyQuickQuestion(questionText) {
    const input = document.getElementById('chat-input-text');
    if (input) {
      input.value = questionText;
      input.focus();
    }
  },

  async refreshActiveChat(partnerId, productId = null) {
    ToastManager.show('Atualizando conversa...', 'info');
    await this.selectChatPartner(partnerId, productId);
  },

  // ----------------------------------------------------
  // TELA 18 & 19: CENTRAL DE AJUDA & ACESSIBILIDADE
  // ----------------------------------------------------
  renderHelpScreen(container) {
    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
          <h1 class="text-2xl font-extrabold mb-4">♿ Preferências de Acessibilidade</h1>
          <div class="space-y-6">
            <div class="flex items-center justify-between pb-4 border-b dark:border-gray-700">
              <div>
                <div class="font-bold text-sm">Modo Escuro (Dark Mode)</div>
                <div class="text-xs text-gray-500">Alternar tema de contraste escuro com persistência.</div>
              </div>
              <button type="button" onclick="AccessibilityManager.toggleDarkMode(); ToastManager.show('Modo Escuro alternado!', 'info')" class="btn-primary text-xs py-1.5 px-4 cursor-pointer">
                Alternar Dark Mode
              </button>
            </div>

            <div class="flex items-center justify-between pb-4 border-b dark:border-gray-700">
              <div>
                <div class="font-bold text-sm">Tamanho do Texto (3 Níveis)</div>
                <div class="text-xs text-gray-500">Escolha o tamanho confortável para leitura.</div>
              </div>
              <div class="flex gap-2">
                <button type="button" onclick="AccessibilityManager.setFontSize('sm'); ToastManager.show('Fonte Pequena', 'info')" class="px-3 py-1 border rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Pequeno</button>
                <button type="button" onclick="AccessibilityManager.setFontSize('md'); ToastManager.show('Fonte Média', 'info')" class="px-3 py-1 border rounded-lg text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Médio</button>
                <button type="button" onclick="AccessibilityManager.setFontSize('lg'); ToastManager.show('Fonte Grande', 'info')" class="px-3 py-1 border rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">Grande</button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <div>
                <div class="font-bold text-sm">Modo para Daltonismo</div>
                <div class="text-xs text-gray-500">Filtros de correção de cores por matriz SVG.</div>
              </div>
              <select onchange="AccessibilityManager.setColorblindMode(this.value); ToastManager.show('Filtro de daltonismo alterado', 'info')" class="px-3 py-1.5 border rounded-xl dark:bg-gray-700 text-xs font-semibold cursor-pointer">
                <option value="none">Padrão (Desativado)</option>
                <option value="protanopia">Protanopia (Red-blind)</option>
                <option value="deuteranopia">Deuteranopia (Green-blind)</option>
                <option value="tritanopia">Tritanopia (Blue-blind)</option>
              </select>
            </div>
          </div>
        </div>

        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
          <div class="flex items-center gap-3 mb-6">
            <span class="text-3xl">❓</span>
            <div>
              <h2 class="text-xl font-bold">Central de Dúvidas / FAQ</h2>
              <p class="text-xs text-gray-500">Tudo o que você precisa saber sobre o Re-Store e a economia circular</p>
            </div>
          </div>

          <div class="space-y-3">
            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>🌱 Como funcionam os Pontos Verdes e os Níveis?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                A cada produto sustentável comprado você ganha Pontos Verdes equivalentes ao valor (cerca de 2 pts por R$ 1,00). Você também ganha <strong>+500 pontos de boas-vindas</strong> ao se cadastrar e <strong>+50 pontos</strong> ao avaliar uma compra. Seus pontos acumulados aumentam seu nível de engajamento (Iniciante 🌱, Sustentável 🌿, Eco Warrior ⚔️ e Eco Master 👑) e podem ser trocados por cupons de desconto reais.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>🎟️ Como resgatar e aplicar meus cupons de desconto?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Acesse a aba <strong>"Extrato de Pontos"</strong> no topo da página. Na seção de cupons, escolha o desconto desejado (5%, 10%, 15% ou Frete Grátis) e clique em <em>"Resgatar Cupom"</em>. Seus cupons resgatados aparecerão na seção <strong>"Meus Cupons Resgatados"</strong>. Na hora de finalizar a compra no Checkout, você poderá aplicar o cupom com apenas 1 clique ou digitando o código correspondente.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>🏪 Como anunciar e vender produtos no Re-Store?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Clique em <strong>"Área Vendedor"</strong> no menu superior e selecione o botão <em>"Novo Anúncio"</em>. Preencha o nome do produto, categoria, preço, quantidade em estoque, condição (Novo, Usado ou Restaurado/Upcycled) e envie as fotos. Assim que publicado, o item fica imediatamente disponível para compra em todo o Brasil.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>📸 Quantas fotos posso colocar por produto?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                É obrigatório enviar pelo menos <strong>1 foto real</strong> do produto, sendo permitido anexar <strong>até 5 fotos</strong> por anúncio (formatos JPG, JPEG, PNG e WEBP). A primeira foto será a capa principal da vitrine, e as demais aparecerão em miniatura clicável na página de detalhes do produto.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>🏢 Qual a diferença entre Pessoa Física (PF) e Empresa Verificada (PJ)?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Qualquer pessoa pode se cadastrar como <strong>Pessoa Física (PF)</strong> para comprar e desapegar de itens. Já as lojas, cooperativas ou artesãos podem optar por <strong>Empresa Sustentável Verificada (PJ)</strong> informando um CNPJ válido de 14 dígitos. Ao ser validado, o perfil recebe o selo <em>"CNPJ Verificado ✓"</em>, gerando maior autoridade perante os clientes. É possível alternar entre PF e PJ quando quiser na tela de edição de perfil.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>💳 Quais são os métodos de pagamento disponíveis?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Você pode pagar via <strong>PIX instantâneo</strong> (com QR Code dinâmico e código copia-e-cola), <strong>Cartão de Crédito</strong> (com opção de parcelamento em até 3x sem juros) ou <strong>Boleto Ecológico Digital</strong> (sem impressão ou desperdício de papel).
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>💬 Como falar com o vendedor antes de comprar?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Na página de qualquer produto, há um botão <em>"💬 Chat"</em> junto ao perfil do anunciante. Clicando nele, abre-se uma conversa direta e privada em tempo real onde você pode tirar dúvidas sobre dimensões, estado de conservação, frete ou negociar propostas.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>📦 Como funciona a entrega e o frete dos produtos?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                O envio pode ser realizado via transportadora parceira com compensação de carbono (Frete Ecológico) ou combinado diretamente entre comprador e vendedor para retirada presencial caso ambos residam na mesma cidade/região.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>♻️ Quais produtos se encaixam na proposta da Economia Circular?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Priorizamos itens usados em bom estado de uso, produtos restaurados (upcycling), artesanatos com reaproveitamento de materiais recicláveis, móveis reformados, eletrônicos revisados e utilidades reutilizáveis (como ecobags e garrafas térmicas inox), diminuindo a geração de lixo nos aterros sanitários.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>🔒 Como meus dados e senhas são protegidos?</span>
                <span class="text-xs text-teal-600 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Todas as senhas são armazenadas com hash criptográfico irreversível (Bcrypt). Números de telefone e CNPJs são validados por algoritmos estritos de integridade de dados e as sessões são protegidas com autenticação segura contra acessos indevidos.
              </p>
            </details>
          </div>
        </div>

        <!-- CARD DE ATENDIMENTO DIRETO COM SUPORTE -->
        <div class="p-6 rounded-3xl border border-teal-200 dark:border-teal-900 bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <i data-lucide="headphones" class="w-6 h-6"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-sm text-gray-900 dark:text-white">Ainda precisa de ajuda?</h3>
              <p class="text-xs text-gray-600 dark:text-gray-300">Nossa equipe de atendimento oficial está disponível para tirar dúvidas pelo chat.</p>
            </div>
          </div>
          <button type="button" onclick="App.openSupportChat()" class="btn-primary text-xs py-2.5 px-5 rounded-2xl inline-flex items-center gap-2 cursor-pointer shadow-sm shrink-0 font-bold">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            <span>Falar com o Suporte</span>
          </button>
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  // ----------------------------------------------------
  // MODAIS E DIÁLOGOS
  // ----------------------------------------------------
  showTutorialModal(step = 1) {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in';
      document.body.appendChild(modal);
    }

    const stepsContent = [
      {
        icon: '♻️',
        title: 'Passo 1: Bem-vindo ao Re-Store!',
        desc: 'O Re-Store é o marketplace de economia circular onde você pode comprar, vender e trocar produtos sustentáveis, reutilizáveis e artesanais.'
      },
      {
        icon: '🌱',
        title: 'Passo 2: Ganhe & Troque Pontos Verdes',
        desc: 'A cada compra ou cadastro você acumula Pontos Verdes. Troque seus pontos na aba "Recompensas" por cupons de até 15% OFF ou Frete Grátis!'
      },
      {
        icon: '💳',
        title: 'Passo 3: Checkout Rápido & PIX',
        desc: 'Compre de forma segura via PIX Copia-e-Cola com QR Code instantâneo, Cartão de Crédito parcelado ou Boleto Ecológico.'
      },
      {
        icon: '🏪',
        title: 'Passo 4: Anuncie Seus Produtos & Chat',
        desc: 'Crie seu perfil de vendedor para publicar itens parados na sua casa. Negocie detalhes e tire dúvidas pelo Chat em tempo real.'
      }
    ];

    const currentStep = stepsContent[step - 1];

    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative text-center">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="flex items-center gap-2 justify-center mb-6">
          ${[1, 2, 3, 4].map(s => `
            <div class="w-8 h-2 rounded-full ${s === step ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-700'}"></div>
          `).join('')}
        </div>

        <div class="text-6xl mb-4 animate-bounce">${currentStep.icon}</div>
        <h2 class="text-xl font-extrabold mb-2 text-gray-900 dark:text-white">${currentStep.title}</h2>
        <p class="text-xs text-gray-600 dark:text-gray-300 mb-8 leading-relaxed max-w-xs mx-auto">${currentStep.desc}</p>

        <div class="flex gap-3">
          ${step > 1 ? `
            <button type="button" onclick="App.showTutorialModal(${step - 1})" class="btn-outline flex-1 py-2.5 text-xs cursor-pointer">Anterior</button>
          ` : ''}
          ${step < 4 ? `
            <button type="button" onclick="App.showTutorialModal(${step + 1})" class="btn-primary flex-1 py-2.5 text-xs cursor-pointer">Próximo Passo →</button>
          ` : `
            <button type="button" onclick="document.getElementById('auth-modal').remove(); ToastManager.show('Tutorial concluído! Bom proveito!', 'success');" class="btn-primary flex-1 py-2.5 text-xs cursor-pointer">Concluir Tutorial 🎉</button>
          `}
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  showLoginModal() {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl mb-4 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
          <span>🔒</span> <span>Proteção de dados com criptografia end-to-end.</span>
        </div>

        <h2 class="text-2xl font-bold mb-1 text-gray-900 dark:text-white">Entrar no Re-Store</h2>
        <p class="text-xs text-gray-500 mb-5">Acesse sua conta para continuar acumulando pontos.</p>

        <form onsubmit="App.submitLogin(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
            <input type="email" id="login-email" required placeholder="seu@email.com" class="w-full px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300">Senha</label>
              <button type="button" onclick="App.showForgotPasswordModal()" class="text-xs text-teal-600 font-semibold hover:underline cursor-pointer">Esqueceu a senha?</button>
            </div>
            <input type="password" id="login-password" required placeholder="••••••••" class="w-full px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>

          <div class="flex items-center justify-between text-xs">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="login-remember" class="text-teal-600">
              <span class="text-gray-600 dark:text-gray-300">Lembre de mim</span>
            </label>
          </div>

          <button type="submit" id="btn-login-submit" class="btn-primary w-full py-3 text-sm cursor-pointer">Entrar</button>
        </form>

        <div class="mt-4 pt-3 border-t dark:border-gray-700">
          <div class="relative flex py-2 items-center">
            <div class="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
            <span class="flex-shrink mx-3 text-gray-400 text-xs uppercase font-medium">Ou acesse com</span>
            <div class="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
          </div>
          <div id="google-login-btn-container" class="w-full flex justify-center mt-1 min-h-[44px]"></div>
        </div>

        <details class="mt-4 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
          <summary class="font-bold cursor-pointer text-teal-600">🌱 O que é o Sistema de Pontos Re-Store?</summary>
          <p class="mt-2 leading-relaxed">Ganhe pontos verdes a cada produto comprado, vendido ou avaliado. Troque por cupons de desconto exclusivos!</p>
        </details>

        <div class="mt-4 text-center text-xs text-gray-500">
          Não tem conta? <button type="button" onclick="App.showRegisterModal()" class="text-teal-600 font-bold hover:underline cursor-pointer">Cadastre-se e ganhe +500 pts</button>
        </div>
      </div>
    `;

    this.renderGoogleSignInButton('google-login-btn-container');

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  async submitLogin(e) {
    e.preventDefault();

    const btn = document.getElementById('btn-login-submit');
    if (btn) btn.innerHTML = 'Entrando...';

    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    const res = await AuthManager.login(email, pass);

    if (res.success) {
      ToastManager.show('Login realizado com sucesso!', 'success');

      document.getElementById('auth-modal').remove();

      this.updateHeaderUI();

      if (this.redirectAfterLogin) {
        const dest = this.redirectAfterLogin;
        this.redirectAfterLogin = null;

        this.navigateTo(dest.screen, dest.params);
      } else {
        this.renderCurrentScreen();
      }

      // IMPORTANTE: carregar os ícones depois de atualizar a interface
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

    } else {
      if (btn) btn.innerHTML = 'Entrar';

      ToastManager.show(res.error, 'error');
    }
  },

  renderGoogleSignInButton(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const initAndRender = () => {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        try {
          google.accounts.id.initialize({
            client_id: this.googleClientId,
            callback: (res) => this.handleGoogleCredentialResponse(res),
            auto_select: false,
            cancel_on_tap_outside: true
          });

          const isDark = document.documentElement.classList.contains('dark');

          google.accounts.id.renderButton(container, {
            theme: isDark ? 'filled_black' : 'outline',
            size: 'large',
            type: 'standard',
            shape: 'pill',
            text: 'continue_with',
            logo_alignment: 'left',
            width: 320
          });
        } catch (err) {
          console.warn('Erro ao renderizar botão do Google:', err);
          this.renderGoogleFallbackButton(container);
        }
      } else {
        this.renderGoogleFallbackButton(container);
      }
    };

    if (typeof google === 'undefined' || !google.accounts) {
      setTimeout(initAndRender, 350);
    } else {
      initAndRender();
    }
  },

  renderGoogleFallbackButton(container) {
    if (!container) return;
    container.innerHTML = `
      <button type="button" onclick="App.triggerGoogleLoginPrompt()" class="w-full py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-full text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer shadow-sm">
        <svg class="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Continuar com o Google</span>
      </button>
    `;
  },

  triggerGoogleLoginPrompt() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: this.googleClientId,
        callback: (res) => this.handleGoogleCredentialResponse(res)
      });
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          ToastManager.show('Abra o pop-up do Google ou clique novamente.', 'info');
        }
      });
    } else {
      ToastManager.show('Carregando biblioteca do Google. Aguarde um instante...', 'info');
    }
  },

  async handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
      ToastManager.show('Falha ao obter credencial do Google.', 'error');
      return;
    }

    ToastManager.show('Autenticando via Google...', 'info');

    try {
      const res = await AuthManager.loginWithGoogle(response.credential);

      if (res.success) {
        ToastManager.show(res.message || 'Login com Google realizado com sucesso!', 'success');

        const modal = document.getElementById('auth-modal');
        if (modal) modal.remove();

        this.updateHeaderUI();

        if (this.redirectAfterLogin) {
          const dest = this.redirectAfterLogin;
          this.redirectAfterLogin = null;
          this.navigateTo(dest.screen, dest.params);
        } else {
          this.renderCurrentScreen();
        }

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      } else {
        ToastManager.show(res.error || 'Erro na autenticação do Google.', 'error');
      }
    } catch (err) {
      console.error('Erro ao conectar com Google:', err);
      ToastManager.show('Erro de conexão ao processar login Google.', 'error');
    }
  },

  submitGoogleLoginSimulated() {
    this.triggerGoogleLoginPrompt();
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  showRegisterModal(preserveData = null) {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in';
      document.body.appendChild(modal);
    }

    const saved = preserveData || this.pendingRegistration || {};
    const nameVal = saved.name || '';
    const emailVal = saved.email || '';
    const phoneVal = saved.phone || '';
    const passVal = saved.pass || '';
    const roleVal = saved.selectedRole || this.selectedRole || 'buyer';
    const bizNameVal = saved.businessName || '';
    const cnpjVal = saved.cnpj || '';

    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <span class="inline-block bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-2">🎁 Bônus de 500 Pontos Verdes</span>
        <h2 class="text-2xl font-bold mb-1 text-gray-900 dark:text-white">Criar Nova Conta</h2>
        <p class="text-xs text-gray-500 mb-3">Preencha seus dados para validar seu e-mail e receber seus pontos.</p>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <button type="button" onclick="App.setRole('buyer')" id="role-btn-buyer" class="${roleVal === 'buyer' ? 'p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer' : 'p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer'}">
            <span class="text-2xl block pointer-events-none">🛍️</span>
            <div class="font-bold text-xs mt-1 pointer-events-none">Comprador</div>
            <div class="text-[10px] text-gray-500 pointer-events-none">Compre e ganhe pontos</div>
          </button>
          <button type="button" onclick="App.setRole('seller')" id="role-btn-seller" class="${roleVal === 'seller' ? 'p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer' : 'p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer'}">
            <span class="text-2xl block pointer-events-none">🏪</span>
            <div class="font-bold text-xs mt-1 pointer-events-none">Vendedor</div>
            <div class="text-[10px] text-gray-500 pointer-events-none">Anuncie produtos eco</div>
          </button>
        </div>

        <form onsubmit="App.submitRegister(event)" class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome Completo *</label>
            <input type="text" id="reg-name" required value="${this.escapeHtml(nameVal)}" placeholder="Seu Nome Completo" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300">E-mail *</label>
              <span id="reg-email-check" class="text-xs text-emerald-500 font-bold ${emailVal ? '' : 'hidden'}">✓ Formato Correto</span>
            </div>
            <input type="email" id="reg-email" oninput="App.validateEmailInput(this)" required value="${this.escapeHtml(emailVal)}" placeholder="seu@email.com" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
            <div class="text-[10px] text-teal-700 dark:text-teal-400 mt-1 flex items-center gap-1 font-medium">
              <span>📧</span> <span>Enviaremos um código de 6 dígitos para validar este e-mail.</span>
            </div>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Telefone / WhatsApp *</label>
            <input type="text" id="reg-phone" required value="${this.escapeHtml(phoneVal)}" placeholder="(11) 99999-9999" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>

          <div id="seller-extra-fields" class="${roleVal === 'seller' ? '' : 'hidden'} space-y-3 p-3 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-900">
            <div>
              <label class="block text-xs font-bold text-teal-800 dark:text-teal-300 mb-1">Nome da Loja *</label>
              <input type="text" id="reg-business-name" value="${this.escapeHtml(bizNameVal)}" placeholder="Ex: EcoStore Brasil" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-teal-800 dark:text-teal-300 mb-1">CNPJ da Empresa *</label>
              <input type="text" id="reg-cnpj" value="${this.escapeHtml(cnpjVal)}" placeholder="00.000.000/0001-00" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm font-mono">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Senha (mínimo 6 caracteres) *</label>
            <input type="password" id="reg-password" oninput="App.checkPasswordStrength(this.value)" required minlength="6" value="${this.escapeHtml(passVal)}" placeholder="••••••••" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
            <div class="mt-1 flex items-center gap-2">
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                <div id="pass-strength-bar" class="h-full w-0 transition-all duration-300 bg-red-500"></div>
              </div>
              <span id="pass-strength-text" class="text-[10px] font-semibold text-gray-400">---</span>
            </div>
          </div>
          <button type="submit" id="btn-reg-submit" class="btn-primary w-full py-2.5 text-sm mt-2 cursor-pointer flex items-center justify-center gap-2">
            <span>Continuar e Validar E-mail →</span>
          </button>
        </form>

        <div class="mt-4 pt-3 border-t dark:border-gray-700">
          <div class="relative flex py-1.5 items-center">
            <div class="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
            <span class="flex-shrink mx-3 text-gray-400 text-xs uppercase font-medium">Ou cadastre-se com</span>
            <div class="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
          </div>
          <div id="google-register-btn-container" class="w-full flex justify-center mt-1 min-h-[44px]"></div>
        </div>

        <div class="mt-3 text-center text-xs text-gray-500">
          Já tem conta? <button type="button" onclick="App.showLoginModal()" class="text-teal-600 font-bold hover:underline cursor-pointer">Fazer Login</button>
        </div>
      </div>
    `;

    this.selectedRole = roleVal;
    if (passVal) {
      this.checkPasswordStrength(passVal);
    }

    this.renderGoogleSignInButton('google-register-btn-container');

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  setRole(role) {
    this.selectedRole = role;
    const bBuyer = document.getElementById('role-btn-buyer');
    const bSeller = document.getElementById('role-btn-seller');
    const sellerFields = document.getElementById('seller-extra-fields');

    if (role === 'buyer') {
      bBuyer.className = 'p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer';
      bSeller.className = 'p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer';
      if (sellerFields) sellerFields.classList.add('hidden');
    } else {
      bSeller.className = 'p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer';
      bBuyer.className = 'p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer';
      if (sellerFields) sellerFields.classList.remove('hidden');
    }
  },

  validateEmailInput(el) {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value);
    const check = document.getElementById('reg-email-check');
    if (check) {
      if (valid) check.classList.remove('hidden');
      else check.classList.add('hidden');
    }
  },

  isValidPhone(phone) {
    if (!phone) return false;
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10 || clean.length > 11) return false;
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (ddd < 11 || ddd > 99) return false;
    if (clean.length === 11 && clean.charAt(2) !== '9') return false;
    return true;
  },

  isValidCNPJ(cnpj) {
    if (!cnpj) return false;
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(clean)) return false;

    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0), 10)) return false;

    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1), 10)) return false;

    return true;
  },

  checkPasswordStrength(val, barId = 'pass-strength-bar', textId = 'pass-strength-text') {
    const bar = document.getElementById(barId);
    const txt = document.getElementById(textId);
    if (!bar || !txt) return;

    if (val.length === 0) {
      bar.style.width = '0%';
      txt.innerText = '---';
    } else if (val.length < 6) {
      bar.style.width = '33%';
      bar.className = 'h-full transition-all duration-300 bg-red-500';
      txt.innerText = 'Fraca';
    } else if (val.length < 10) {
      bar.style.width = '66%';
      bar.className = 'h-full transition-all duration-300 bg-amber-500';
      txt.innerText = 'Média';
    } else {
      bar.style.width = '100%';
      bar.className = 'h-full transition-all duration-300 bg-emerald-500';
      txt.innerText = 'Forte';
    }
  },

  async submitRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-reg-submit');

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const pass = document.getElementById('reg-password').value;
    const isVerifiedBusiness = this.selectedRole === 'seller' ? 1 : 0;
    const businessName = document.getElementById('reg-business-name') ? document.getElementById('reg-business-name').value.trim() : '';
    const cnpj = document.getElementById('reg-cnpj') ? document.getElementById('reg-cnpj').value.trim() : '';

    if (!name || !email || !pass) {
      ToastManager.show('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ToastManager.show('Por favor, informe um endereço de e-mail válido.', 'error');
      return;
    }

    if (pass.length < 6) {
      ToastManager.show('A senha deve conter no mínimo 6 caracteres.', 'error');
      return;
    }

    if (!this.isValidPhone(phone)) {
      ToastManager.show('Por favor, informe um número de telefone válido (DDD + 8 ou 9 dígitos). Ex: (11) 99999-9999', 'error');
      return;
    }

    if ((isVerifiedBusiness || cnpj !== '') && !this.isValidCNPJ(cnpj)) {
      ToastManager.show('Por favor, informe um CNPJ válido com 14 dígitos. Ex: 00.000.000/0001-00', 'error');
      return;
    }

    // Armazena dados temporariamente para concluir após confirmação do e-mail
    this.pendingRegistration = {
      name,
      email,
      phone,
      pass,
      selectedRole: this.selectedRole,
      isVerifiedBusiness,
      businessName,
      cnpj
    };

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="inline-block animate-spin mr-2">⏳</span>
        <span>Enviando código de verificação...</span>
      `;
    }

    try {
      const res = await AuthManager.sendRegisterCode(name, email);
      if (res.success) {
        ToastManager.show(res.message, 'success', 5000);
        this.renderRegisterVerifyStep(document.getElementById('auth-modal'), email);
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Continuar e Validar E-mail →';
        }
        ToastManager.show(res.error || 'Erro ao enviar código de verificação.', 'error');
      }
    } catch (err) {
      console.error('Erro ao solicitar código de cadastro:', err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Continuar e Validar E-mail →';
      }
      ToastManager.show('Erro de conexão ao enviar código. Tente novamente.', 'error');
    }
  },

  renderRegisterVerifyStep(modal, email) {
    if (!modal) return;

    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-fade-in">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <!-- Barra de Progresso do Cadastro -->
        <div class="flex items-center gap-2 mb-6">
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
        </div>

        <div class="text-center mb-5">
          <div class="w-14 h-14 bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <i data-lucide="mail-check" class="w-7 h-7"></i>
          </div>
          <span class="inline-block bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1">
            🔒 Validação Obrigatória
          </span>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Confirme seu E-mail</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
            Para ativar sua conta e liberar <strong>+500 Pontos Verdes</strong>, digite o código de 6 dígitos enviado para:
          </p>
          <div class="mt-2 inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700/60 rounded-full font-mono text-xs font-semibold text-teal-700 dark:text-teal-300">
            ${this.escapeHtml(email)}
          </div>
        </div>

        <form onsubmit="App.submitRegisterVerification(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 text-center">
              Código de Verificação de 6 dígitos
            </label>
            <input 
              type="text" 
              id="reg-verify-code" 
              required 
              maxlength="6" 
              placeholder="000000" 
              autocomplete="one-time-code"
              class="w-full text-center font-mono tracking-[0.4em] text-2xl py-3 border-2 border-teal-200 dark:border-teal-800 rounded-2xl dark:bg-gray-700 dark:text-white focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20 transition"
            >
          </div>

          <button 
            type="submit" 
            id="btn-reg-verify-submit" 
            class="btn-primary w-full py-3 text-sm cursor-pointer shadow-lg shadow-teal-600/20"
          >
            Confirmar e Criar Conta 🎉
          </button>

          <div class="space-y-2 pt-2 text-center text-xs">
            <div>
              <button 
                type="button" 
                id="btn-reg-resend" 
                onclick="App.resendRegisterCode()" 
                class="text-teal-600 dark:text-teal-400 font-semibold hover:underline cursor-pointer"
              >
                Não recebeu o código? Reenviar
              </button>
            </div>
            <div>
              <button 
                type="button" 
                onclick="App.showRegisterModal()" 
                class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:underline cursor-pointer"
              >
                ← Corrigir dados ou alterar e-mail
              </button>
            </div>
          </div>
        </form>

        <div class="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <span>💡</span>
          <span>Dica: Caso não encontre em sua caixa de entrada, verifique também as pastas de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong>.</span>
        </div>
      </div>
    `;

    setTimeout(() => {
      const codeInput = document.getElementById('reg-verify-code');
      if (codeInput) codeInput.focus();
    }, 150);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  async submitRegisterVerification(e) {
    e.preventDefault();
    if (!this.pendingRegistration) {
      ToastManager.show('Sessão de cadastro expirada. Preencha seus dados novamente.', 'error');
      this.showRegisterModal();
      return;
    }

    const codeInput = document.getElementById('reg-verify-code');
    const code = codeInput ? codeInput.value.trim() : '';

    if (!code || code.length < 6) {
      ToastManager.show('Digite o código completo de 6 dígitos.', 'error');
      if (codeInput) codeInput.focus();
      return;
    }

    const btn = document.getElementById('btn-reg-verify-submit');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="inline-block animate-spin mr-2">⏳</span>
        <span>Validando e criando conta...</span>
      `;
    }

    const { name, email, pass, phone, isVerifiedBusiness, businessName, cnpj } = this.pendingRegistration;

    try {
      const res = await AuthManager.register(name, email, pass, phone, code, {
        is_verified_business: isVerifiedBusiness,
        business_name: businessName,
        cnpj: cnpj
      });

      if (res.success) {
        this.pendingRegistration = null;
        ToastManager.show(res.message, 'success', 5000);

        const modal = document.getElementById('auth-modal');
        if (modal) modal.remove();

        this.updateHeaderUI();

        if (this.redirectAfterLogin) {
          const dest = this.redirectAfterLogin;
          this.redirectAfterLogin = null;
          this.navigateTo(dest.screen, dest.params);
        } else {
          this.renderCurrentScreen();
        }

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      } else {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = 'Confirmar e Criar Conta 🎉';
        }
        ToastManager.show(res.error || 'Código incorreto ou expirado.', 'error');
        if (codeInput) {
          codeInput.select();
          codeInput.focus();
        }
      }
    } catch (err) {
      console.error('Erro na criação de conta:', err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Confirmar e Criar Conta 🎉';
      }
      ToastManager.show('Erro de conexão ao validar código. Tente novamente.', 'error');
    }
  },

  async resendRegisterCode() {
    if (!this.pendingRegistration || !this.pendingRegistration.email) {
      ToastManager.show('Dados não encontrados. Preencha o cadastro novamente.', 'error');
      this.showRegisterModal();
      return;
    }

    const btn = document.getElementById('btn-reg-resend');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Reenviando código...';
    }

    try {
      const res = await AuthManager.sendRegisterCode(
        this.pendingRegistration.name,
        this.pendingRegistration.email
      );

      if (res.success) {
        ToastManager.show('Novo código enviado! Verifique seu e-mail.', 'success');
      } else {
        ToastManager.show(res.error || 'Erro ao reenviar código.', 'error');
      }
    } catch (e) {
      ToastManager.show('Erro ao reenviar código de verificação.', 'error');
    } finally {
      if (btn) {
        setTimeout(() => {
          btn.disabled = false;
          btn.innerText = 'Não recebeu o código? Reenviar';
        }, 5000);
      }
    }
  },

  async submitEditProfile(e) {
    e.preventDefault();
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone') ? document.getElementById('prof-phone').value.trim() : '';
    const isVerifiedBusiness = document.getElementById('prof-verified') ? document.getElementById('prof-verified').value : '0';
    let cnpj = document.getElementById('prof-cnpj') ? document.getElementById('prof-cnpj').value.trim() : '';
    const avatarInput = document.getElementById('prof-avatar');

    if (phone && !this.isValidPhone(phone)) {
      ToastManager.show('Por favor, informe um número de telefone válido (DDD + 8 ou 9 dígitos).', 'error');
      return;
    }

    if (isVerifiedBusiness === '0') {
      cnpj = ''; // Limpar CNPJ para voltar a ser Pessoa Física
    } else {
      if (!this.isValidCNPJ(cnpj)) {
        ToastManager.show('Por favor, informe um número de CNPJ válido (14 dígitos).', 'error');
        return;
      }
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('phone', phone);
    formData.append('is_verified_business', isVerifiedBusiness);
    formData.append('cnpj', cnpj);

    if (avatarInput && avatarInput.files[0]) {
      formData.append('avatar', avatarInput.files[0]);
    }

    const res = await AuthManager.updateProfile(formData);
    if (res.success) {
      ToastManager.show(res.message || 'Perfil atualizado com sucesso!', 'success');
      this.updateHeaderUI();
      const main = document.getElementById('main-content');
      if (main && this.currentScreen === 'profile') {
        this.renderProfileScreen(main);
      }
    } else {
      ToastManager.show(res.error || 'Erro ao atualizar perfil.', 'error');
    }
  },

  showForgotPasswordModal() {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in';
      document.body.appendChild(modal);
    }
    this.renderForgotStep1(modal);
  },

  renderForgotStep1(modal) {
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="flex items-center gap-2 mb-6">
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
          <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
        </div>

        <h2 class="text-xl font-bold mb-1">Etapa 1: Recuperar Senha</h2>
        <p class="text-xs text-gray-500 mb-4">Informe seu e-mail cadastrado para receber o código de 6 dígitos.</p>

        <form onsubmit="App.submitForgotStep1(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
            <input type="email" id="forgot-email" required placeholder="seu@email.com" class="w-full px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>
          <button type="submit" class="btn-primary w-full py-3 text-sm cursor-pointer">Enviar Código de Verificação</button>
        </form>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  async submitForgotStep1(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'forgot_password', email: email })
    });
    const data = await res.json();
    if (data.success) {
      ToastManager.show(data.message, 'success', 5000);
      this.renderForgotStep2(document.getElementById('auth-modal'));
    } else {
      ToastManager.show(data.error, 'error');
    }
  },

  renderForgotStep2(modal) {
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="flex items-center gap-2 mb-6">
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
        </div>

        <h2 class="text-xl font-bold mb-1">Etapa 2: Digite o Código</h2>
        <p class="text-xs text-gray-500 mb-4">Insira o código de 6 dígitos enviado para a sua caixa de entrada.</p>

        <form onsubmit="App.submitForgotStep2(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Código de 6 dígitos</label>
            <input type="text" id="forgot-code" required maxlength="6" placeholder="000000" class="w-full text-center font-mono tracking-widest text-lg px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-teal-500">
          </div>
          <button type="submit" id="btn-verify-code-submit" class="btn-primary w-full py-3 text-sm cursor-pointer">Validar Código</button>

          <div class="text-center pt-1">
            <button type="button" onclick="App.showForgotPasswordModal()" class="text-xs text-teal-600 font-semibold hover:underline cursor-pointer">Não recebeu? Tentar reenviar ou alterar e-mail</button>
          </div>
        </form>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  async submitForgotStep2(e) {
    e.preventDefault();
    const code = document.getElementById('forgot-code').value;
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_code', code: code })
    });
    const data = await res.json();
    if (data.success) {
      ToastManager.show(data.message, 'success');
      this.renderForgotStep3(document.getElementById('auth-modal'));
    } else {
      ToastManager.show(data.error, 'error');
    }
  },

  renderForgotStep3(modal) {
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="flex items-center gap-2 mb-6">
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
        </div>

        <h2 class="text-xl font-bold mb-1">Etapa 3: Criar Nova Senha</h2>
        <p class="text-xs text-gray-500 mb-4">Escolha sua nova senha de acesso.</p>

        <form onsubmit="App.submitForgotStep3(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nova Senha (mínimo 6 caracteres) *</label>
            <input type="password" id="forgot-newpass" oninput="App.checkPasswordStrength(this.value, 'forgot-pass-bar', 'forgot-pass-txt')" required minlength="6" placeholder="••••••••" class="w-full px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
            <div class="mt-1 flex items-center gap-2">
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                <div id="forgot-pass-bar" class="h-full w-0 transition-all duration-300 bg-red-500"></div>
              </div>
              <span id="forgot-pass-txt" class="text-[10px] font-semibold text-gray-400">---</span>
            </div>
          </div>
          <button type="submit" class="btn-primary w-full py-3 text-sm cursor-pointer">Salvar Nova Senha</button>
        </form>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  async submitForgotStep3(e) {
    e.preventDefault();
    const newPass = document.getElementById('forgot-newpass').value;
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', new_password: newPass })
    });
    const data = await res.json();
    if (data.success) {
      ToastManager.show(data.message, 'success');
      this.showLoginModal();
    } else {
      ToastManager.show(data.error, 'error');
    }
  },

  // ----------------------------------------------------
  // TELA 11: ABA DEDICADA DE FAVORITOS
  // ----------------------------------------------------
  async renderFavoritesScreen(container) {
    if (!AuthManager.currentUser) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-7xl mx-auto">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-extrabold flex items-center gap-2">
              <span>Meus Produtos Favoritos</span> <span class="text-red-500">❤️</span>
            </h1>
            <p class="text-xs text-gray-500 mt-1">Produtos sustentáveis salvos para você comprar no seu ritmo.</p>
          </div>
          <button type="button" onclick="App.navigateTo('search')" class="btn-outline text-xs py-1.5 px-4 cursor-pointer">
            Explorar Mais Produtos
          </button>
        </div>

        <div id="favorites-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          ${this.getSkeletonCardsHTML(4)}
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    try {
      const res = await fetch('api/favorites.php?action=list');
      const data = await res.json();
      const grid = document.getElementById('favorites-grid');

      if (data.success && data.favorites.length > 0) {
        this.favoriteIds = data.favorites.map(f => f.id);
        grid.innerHTML = data.favorites.map(p => this.renderProductCardHTML(p)).join('');
      } else {
        grid.innerHTML = `
          <div class="col-span-full text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-800">
            <div class="text-6xl mb-3">🤍</div>
            <h2 class="text-xl font-bold mb-1">Sua lista de favoritos está vazia</h2>
            <p class="text-xs text-gray-500 mb-6 max-w-sm mx-auto">Clique no ícone de coração de qualquer produto para salvá-lo nesta lista especial.</p>
            <button type="button" onclick="App.navigateTo('search')" class="btn-primary text-xs py-2 px-6 cursor-pointer">Ver Vitrine de Produtos</button>
          </div>
        `;

        // IMPORTANTE: renderizar os ícones adicionados dinamicamente
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }
    } catch (e) {
      console.error(e);
    }
  },

  async toggleFavorite(productId, btnElement = null) {
    if (!AuthManager.currentUser) {
      this.showLoginModal();
      return;
    }

    const res = await fetch('api/favorites.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', product_id: productId })
    });
    const data = await res.json();

    if (data.success) {
      if (data.is_favorite) {
        if (!this.favoriteIds.includes(productId)) this.favoriteIds.push(productId);
        ToastManager.show('Produto adicionado aos Favoritos! ❤️', 'success');
      } else {
        this.favoriteIds = this.favoriteIds.filter(id => id !== productId);
        ToastManager.show('Produto removido dos Favoritos.', 'info');
      }

      if (btnElement) {
        btnElement.innerHTML = data.is_favorite ? '❤️' : '🤍';
        if (data.is_favorite) {
          btnElement.className = 'absolute top-2 right-2 p-2 rounded-full transition shadow backdrop-blur bg-red-50 dark:bg-red-950/60 border border-red-200 cursor-pointer';
        } else {
          btnElement.className = 'absolute top-2 right-2 p-2 rounded-full transition shadow backdrop-blur bg-white/80 dark:bg-gray-800/80 text-gray-400 hover:text-red-500 cursor-pointer';
        }
      }

      if (this.currentScreen === 'favorites') {
        this.renderFavoritesScreen(document.getElementById('main-content'));
      }
    }
  },

  // ----------------------------------------------------
  // TELA 6: BUSCA E FILTROS
  // ----------------------------------------------------
  async renderSearchScreen(container) {
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-7xl mx-auto">
        <div class="p-6 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-800 shadow-sm space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Palavra-chave</label>
              <input type="text" id="srch-query" placeholder="Buscar produto... (Pressione /)" value="${this.searchQuery}" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Categoria</label>
              <select id="srch-category" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                <option value="">Todas as Categorias</option>
                <option value="Utilidades" ${this.selectedCategory === 'Utilidades' ? 'selected' : ''}>Utilidades</option>
                <option value="Moda & Acessórios" ${this.selectedCategory === 'Moda & Acessórios' ? 'selected' : ''}>Moda & Acessórios</option>
                <option value="Móveis & Decoração" ${this.selectedCategory === 'Móveis & Decoração' ? 'selected' : ''}>Móveis & Decoração</option>
                <option value="Eletrônicos Eco" ${this.selectedCategory === 'Eletrônicos Eco' ? 'selected' : ''}>Eletrônicos Eco</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">📍 Localização / Geolocalização</label>
              <div class="flex gap-2">
                <input type="text" id="srch-location" placeholder="Cidade ou UF (ex: São Paulo)" value="${this.searchLocation}" class="flex-1 px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                <button type="button" onclick="App.simulateGeoLocation()" title="Detectar Minha Localização" class="px-3 py-2 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-xl text-xs font-bold hover:bg-teal-100 cursor-pointer">
                  📍 Detectar
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t dark:border-gray-700">
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="font-bold text-gray-500 py-1">Atributos Ecológicos:</span>
              <label class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full cursor-pointer hover:bg-teal-50">
                <input type="checkbox" class="mr-1"> ♻️ Reciclado
              </label>
              <label class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full cursor-pointer hover:bg-teal-50">
                <input type="checkbox" class="mr-1"> 🌱 Algodão Orgânico
              </label>
              <label class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full cursor-pointer hover:bg-teal-50">
                <input type="checkbox" class="mr-1"> 🎨 Upcycled
              </label>
            </div>
            <div class="flex gap-2">
              <button type="button" onclick="App.applySearchFilter()" class="btn-primary text-xs px-5 py-2 cursor-pointer">Filtrar Produtos</button>
              <button type="button" onclick="App.clearSearchFilter()" class="btn-outline text-xs px-4 py-2 cursor-pointer">Limpar</button>
            </div>
          </div>
        </div>

        <div id="search-grid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          ${this.getSkeletonCardsHTML(4)}
        </div>
      </div>
    `;

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    this.applySearchFilter();
  },

  simulateGeoLocation() {
    const locInput = document.getElementById('srch-location');
    if (locInput) {
      locInput.value = 'São Paulo, SP';
      this.searchLocation = 'São Paulo, SP';
      ToastManager.show('📍 Geolocalização detectada: São Paulo, SP', 'success');
      this.applySearchFilter();
    }
  },

  clearSearchFilter() {
    this.searchQuery = '';
    this.selectedCategory = '';
    this.searchLocation = '';
    const q = document.getElementById('srch-query');
    const cat = document.getElementById('srch-category');
    const loc = document.getElementById('srch-location');
    if (q) q.value = '';
    if (cat) cat.value = '';
    if (loc) loc.value = '';
    this.applySearchFilter();
  },

  async applySearchFilter() {
    const q = document.getElementById('srch-query') ? document.getElementById('srch-query').value : this.searchQuery;
    const cat = document.getElementById('srch-category') ? document.getElementById('srch-category').value : this.selectedCategory;
    const loc = document.getElementById('srch-location') ? document.getElementById('srch-location').value : this.searchLocation;

    let url = `api/products.php?action=list&search=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&location=${encodeURIComponent(loc)}`;
    const grid = document.getElementById('search-grid');

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.products.length > 0) {
        grid.innerHTML = data.products.map(p => this.renderProductCardHTML(p)).join('');
      } else {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">Nenhum produto encontrado para estes filtros de localização e categoria.</div>`;
      }
    } catch (e) {
      console.error(e);
    }
  },

  // UTILS
  addToCartDirect(productId, btnElement = null) {
    if (btnElement) {
      const originalHTML = btnElement.innerHTML;
      btnElement.innerHTML = `<span>✓</span> Adicionado!`;
      btnElement.classList.add('bg-emerald-600');
      setTimeout(() => {
        btnElement.innerHTML = originalHTML;
        btnElement.classList.remove('bg-emerald-600');
      }, 1500);
    }

    if (this.productsCache) {
      const p = this.productsCache.find(item => item.id === productId);
      if (p) {
        CartManager.addItem(p);
        ToastManager.show(`"${p.name}" adicionado ao carrinho!`, 'success');
        return;
      }
    }

    fetch(`api/products.php?action=detail&id=${productId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          CartManager.addItem(data.product);
          ToastManager.show(`"${data.product.name}" adicionado ao carrinho!`, 'success');
        }
      });
  },

  addToCartAndCheckout(productId) {
    this.addToCartDirect(productId);
    if (!AuthManager.currentUser) {
      this.redirectAfterLogin = { screen: 'checkout', params: {} };
      ToastManager.show('Faça login para prosseguir para a finalização da compra.', 'info');
      this.showLoginModal();
      return;
    }
    this.navigateTo('checkout');
  },

  updateCartQty(id, qty) {
    CartManager.updateQuantity(id, qty);
    this.renderCartScreen(document.getElementById('main-content'));
  },

  removeCartItem(id) {
    CartManager.removeItem(id);
    ToastManager.show('Item removido do carrinho', 'info');
    this.renderCartScreen(document.getElementById('main-content'));
  },

  async voteReviewHelpful(reviewId, btnElement) {
    if (!AuthManager.currentUser) {
      ToastManager.show('Faça login para avaliar feedbacks de produtos.', 'info');
      this.showLoginModal();
      return;
    }

    const res = await fetch('api/reviews.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vote_helpful', review_id: reviewId })
    });
    const data = await res.json();
    if (data.success) {
      ToastManager.show('Obrigado pelo seu feedback!', 'success');
      btnElement.disabled = true;
      btnElement.classList.add('text-teal-600');
    } else {
      ToastManager.show(data.error || 'Erro ao votar no feedback.', 'error');
    }
  },

  async cancelOrder(orderId) {
    if (confirm('Deseja realmente solicitar o cancelamento deste pedido? Se você utilizou um cupom de desconto, ele será reativado para a sua conta.')) {
      try {
        const res = await fetch('api/orders.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', order_id: orderId })
        });
        const data = await res.json();
        if (data.success) {
          ToastManager.show(data.message || 'Pedido cancelado com sucesso!', 'info', 6000);
          await AuthManager.checkAuth();
          this.updateHeaderUI();
          this.renderOrdersScreen(document.getElementById('main-content'));
        } else {
          ToastManager.show(data.error || 'Erro ao cancelar pedido.', 'error');
        }
      } catch (e) {
        ToastManager.show('Erro de conexão ao cancelar pedido.', 'error');
      }
    }
  },

  switchPaymentTab(tab) {
    document.getElementById('pay-box-pix').className = tab === 'pix' ? 'p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 text-center space-y-3' : 'hidden';
    document.getElementById('pay-box-credit').className = tab === 'credit' ? 'p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3' : 'hidden';
    document.getElementById('pay-box-boleto').className = tab === 'boleto' ? 'p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3' : 'hidden';
  },

  confirmLogout() {
    if (confirm('Deseja realmente encerrar sua sessão no Re-Store?')) {
      AuthManager.logout().then(() => {
        ToastManager.show('Sessão encerrada com sucesso.', 'info');
        this.updateHeaderUI();
        this.navigateTo('home');
      });
    }
  },

  confirmDeleteAccount() {
    if (confirm('ATENÇÃO: Deseja excluir permanentemente sua conta? Esta ação apagará todos os seus dados e não poderá ser desfeita.')) {
      fetch('api/auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_account' })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            ToastManager.show(data.message, 'info');
            AuthManager.currentUser = null;
            this.updateHeaderUI();
            this.navigateTo('home');
          } else {
            ToastManager.show(data.error, 'error');
          }
        });
    }
  },

  setupGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const headerInput = document.getElementById('header-search-input');
        const pageInput = document.getElementById('srch-query');
        if (pageInput) pageInput.focus();
        else if (headerInput) headerInput.focus();
      }

      if (e.key === 'Escape') {
        const modal = document.getElementById('auth-modal');
        if (modal) {
          modal.remove();
        } else if (this.currentScreen === 'product-detail') {
          this.navigateTo('home');
        }
      }
    });
  },

  setupEventListeners() {
    window.addEventListener('popstate', () => {
      this.renderCurrentScreen();
    });
    window.addEventListener('resize', () => {
      if (this.currentScreen === 'chat') {
        this.updateChatLayout(this.currentChatView || 'chat');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
