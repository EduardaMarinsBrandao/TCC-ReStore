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

    if (!userNav) return;

    if (user) {
      userNav.innerHTML = `
        <button type="button" onclick="App.navigateTo('orders')" title="Meus Pedidos" class="text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-teal-600 cursor-pointer pointer-events-auto flex items-center gap-1">
          <span class="pointer-events-none">📦</span> <span class="pointer-events-none">Pedidos</span>
        </button>
        <button type="button" onclick="App.navigateTo('points')" title="Saldo e Nível" class="badge-points px-3 py-1.5 rounded-full text-xs font-bold transition hover:opacity-90 cursor-pointer pointer-events-auto">
          <span class="pointer-events-none">🌱</span> <span class="pointer-events-none">${user.points} pts</span> <span class="bg-white/20 px-1.5 py-0.5 rounded text-[10px] pointer-events-none">Nível ${user.level}</span>
        </button>
        <button type="button" onclick="App.navigateTo('seller')" class="text-sm font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 cursor-pointer pointer-events-auto">
          Área Vendedor
        </button>
        <button type="button" onclick="App.navigateTo('profile')" title="Meu Perfil" class="flex items-center gap-2 text-sm font-semibold hover:opacity-80 cursor-pointer pointer-events-auto border border-teal-500/50 rounded-full px-2 py-1 bg-white/10">
          <img src="${user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}" class="w-7 h-7 rounded-full object-cover border border-teal-500 pointer-events-none" alt="Avatar">
          <span class="hidden md:inline pointer-events-none">${user.name.split(' ')[0]}</span>
        </button>
      `;
    } else {
      userNav.innerHTML = `
        <button type="button" onclick="App.showLoginModal()" class="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-teal-600 cursor-pointer pointer-events-auto px-2 py-1">
          Entrar
        </button>
        <button type="button" onclick="App.showRegisterModal()" class="btn-primary text-sm py-1.5 px-4 cursor-pointer pointer-events-auto">
          Criar Conta (+500 pts)
        </button>
      `;
    }
  },

  navigateTo(screen, params = {}) {
    this.currentScreen = screen;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (screen !== 'chat') {
      ChatManager.stopPolling();
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
          <span class="inline-block bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
            ♻️ Marketplace Reutilizável & Sustentável
          </span>
          <h1 class="text-2xl md:text-4xl font-extrabold tracking-tight mb-3">
            Compre, Venda e Troque Produtos Sustentáveis com Recompensas
          </h1>
          <p class="text-teal-100 text-sm md:text-base mb-6 leading-relaxed">
            Acumule Pontos Verdes a cada compra sustentável e troque por cupons exclusivos no Re-Store.
          </p>
          <div class="flex flex-wrap gap-3">
            <button type="button" onclick="App.navigateTo('search')" class="bg-white text-teal-700 font-bold px-5 py-2.5 rounded-full shadow hover:bg-teal-50 transition cursor-pointer">
              Explorar Produtos
            </button>
            <button type="button" onclick="App.showTutorialModal()" class="bg-teal-700/60 border border-white/30 backdrop-blur-md text-white font-semibold px-5 py-2.5 rounded-full hover:bg-teal-700 transition cursor-pointer">
              Como Funciona 🎓
            </button>
          </div>
        </div>
      </section>

      <!-- ATALHOS RÁPIDOS DE ACESSO -->
      <section class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <button type="button" onclick="App.navigateTo('favorites')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <span class="text-2xl pointer-events-none">❤️</span>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Meus Favoritos</div>
            <div class="text-[11px] text-gray-500">Itens salvos</div>
          </div>
        </button>
        <button type="button" onclick="App.navigateTo('orders')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <span class="text-2xl pointer-events-none">📦</span>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Meus Pedidos</div>
            <div class="text-[11px] text-gray-500">Acompanhar status</div>
          </div>
        </button>
        <button type="button" onclick="App.navigateTo('points')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <span class="text-2xl pointer-events-none">🌱</span>
          <div class="text-left pointer-events-none">
            <div class="font-bold text-xs text-gray-900 dark:text-white">Extrato de Pontos</div>
            <div class="text-[11px] text-gray-500">Saldo e cupons</div>
          </div>
        </button>
        <button type="button" onclick="App.navigateTo('chat')" class="p-4 rounded-2xl bg-white dark:bg-gray-800 border dark:border-gray-800 flex items-center gap-3 hover:border-teal-500 transition shadow-sm cursor-pointer">
          <span class="text-2xl pointer-events-none">💬</span>
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
            { name: 'Todas', icon: '🍃', cat: '' },
            { name: 'Utilidades', icon: '🥛', cat: 'Utilidades' },
            { name: 'Moda & Acessórios', icon: '👕', cat: 'Moda & Acessórios' },
            { name: 'Móveis & Decoração', icon: '🪑', cat: 'Móveis & Decoração' },
            { name: 'Eletrônicos Eco', icon: '🔌', cat: 'Eletrônicos Eco' }
          ].map(c => `
            <button type="button" onclick="App.navigateTo('search', { category: '${c.cat}' })" 
              class="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                this.selectedCategory === c.cat 
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm' 
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-teal-500'
              }">
              <span>${c.icon}</span> <span>${c.name}</span>
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
        <div class="relative overflow-hidden aspect-square bg-gray-100 dark:bg-gray-800">
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
                  <span class="badge-points text-xs">🌱 Recompensa +${p.points} Pontos</span>
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
                  <button type="button" onclick="App.openChatWithUser(${p.seller_id}, ${p.id})" class="btn-outline text-xs py-1.5 px-3 cursor-pointer">
                    💬 Chat
                  </button>
                </div>
              </div>

              <!-- BOTOES DE COMPRA -->
              <div class="flex gap-4">
                <button type="button" onclick="App.addToCartAndCheckout(${p.id})" class="btn-secondary flex-1 py-3 text-base cursor-pointer">
                  ⚡ Comprar Agora
                </button>
                <button type="button" onclick="App.addToCartDirect(${p.id}, this)" class="btn-primary flex-1 py-3 text-base cursor-pointer">
                  🛒 Adicionar ao Carrinho
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
                    <button type="button" onclick="App.voteReviewHelpful(${r.id}, this)" class="text-xs text-gray-500 hover:text-teal-600 flex items-center gap-1 font-semibold cursor-pointer">
                      👍 Útil (${r.helpful_count || 0})
                    </button>
                  </div>
                </div>
              `).join('') : '<div class="text-gray-500 text-sm">Seja o primeiro a avaliar este produto após a compra!</div>'}
            </div>
          </section>
        </div>
      `;

    } catch (e) {
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
                  <img src="${item.image}" class="w-16 h-16 rounded-xl object-cover border dark:border-gray-700">
                  <div>
                    <h3 class="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">${item.name}</h3>
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
                  <button type="button" onclick="App.removeCartItem(${item.product_id})" title="Remover" class="text-red-500 hover:text-red-700 p-1 cursor-pointer">🗑️</button>
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
    } catch (e) {}

    let discountPercentage = 0;
    if (this.appliedCouponCode) {
      if (this.appliedCouponCode.includes('5')) discountPercentage = 0.05;
      else if (this.appliedCouponCode.includes('10')) discountPercentage = 0.10;
      else if (this.appliedCouponCode.includes('15')) discountPercentage = 0.15;
      else if (this.appliedCouponCode.includes('20')) discountPercentage = 0.20;
    }

    const discountValue = total * discountPercentage;
    const finalTotal = Math.max(0, total - discountValue);

    const pixCode = `00020126580014br.gov.bcb.pix0136restore-pix-${Date.now()}5204000053039865405${finalTotal.toFixed(2)}5802BR5908RESTORE6009SAOPAULO62070503***6304ABCD`;
    const boletoCode = `34191.79001 01043.510047 91020.150008 5 91230000007990`;

    container.innerHTML = `
      <div class="animate-fade-in max-w-4xl mx-auto">
        <h1 class="text-2xl font-extrabold mb-6">Finalizar Compra 💳</h1>
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
              <h2 class="font-bold text-base mb-2">2. Cupom de Desconto de Uso Único 🏷️</h2>
              <p class="text-xs text-gray-500 mb-4">Digite seu código de cupom ou clique nos cupons que você resgatou com seus Pontos Verdes.</p>
              
              <div class="flex gap-2 mb-3">
                <input type="text" id="chk-coupon-input" placeholder="Digite o código (ex: ECO10-1234)" value="${this.appliedCouponCode}" class="flex-1 px-4 py-2 border rounded-xl dark:bg-gray-700 font-mono text-sm uppercase">
                <button type="button" onclick="App.applyCouponCheckout()" class="btn-primary text-xs py-2 px-5 cursor-pointer">
                  Aplicar Cupom
                </button>
              </div>

              ${availableCoupons.length > 0 ? `
                <div class="mt-3">
                  <span class="text-[11px] font-bold text-gray-500">Seus Cupons Disponíveis:</span>
                  <div class="flex flex-wrap gap-2 mt-1">
                    ${availableCoupons.map(c => `
                      <button type="button" onclick="document.getElementById('chk-coupon-input').value='${c.code}'; App.applyCouponCheckout();" class="text-xs font-mono bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 px-3 py-1 rounded-full hover:bg-teal-100 cursor-pointer">
                        🏷️ ${c.code} (${c.discount_type})
                      </button>
                    `).join('')}
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
  },

  async applyCouponCheckout() {
    const input = document.getElementById('chk-coupon-input');
    const code = input ? input.value.trim().toUpperCase() : '';

    if (!code) {
      ToastManager.show('Digite um código de cupom.', 'error');
      return;
    }

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
    }
  },

  async submitCheckout(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-chk');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳ Processando...</span>`;
    }

    const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
    const shippingData = {
      address: document.getElementById('chk-address').value,
      city: document.getElementById('chk-city').value,
      state: document.getElementById('chk-state').value,
      zip: document.getElementById('chk-zip').value
    };

    const res = await CartManager.processCheckout(paymentMethod, shippingData, this.appliedCouponCode);
    if (res.success) {
      ToastManager.show(`Pedido #${res.order_number} confirmado!`, 'success');
      this.appliedCouponCode = '';
      await AuthManager.checkAuth();
      this.updateHeaderUI();
      // Sumir do carrinho e ir para a aba de Pedidos
      this.navigateTo('orders');
    } else {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `Confirmar Pedido Simulado`;
      }
      ToastManager.show(res.error || 'Erro ao concluir o checkout.', 'error');
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
            const statusBadge = o.status === 'cancelled' 
              ? '<span class="bg-red-100 text-red-800 text-xs px-2.5 py-0.5 rounded-full font-bold">Cancelado</span>'
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
                        </div>
                      </div>
                      <div class="font-bold text-sm">R$ ${parseFloat(i.price).toFixed(2).replace('.', ',')}</div>
                    </div>
                  `).join('')}
                </div>

                <div class="flex flex-wrap items-center justify-between pt-3 border-t dark:border-gray-700 gap-2">
                  <div class="text-xs text-gray-500">
                    Total: <strong class="text-gray-900 dark:text-white">R$ ${parseFloat(o.total).toFixed(2).replace('.', ',')}</strong> | Pontos Ganhos: <strong class="text-emerald-600">+${o.points_earned} pts</strong>
                  </div>
                  <div class="flex gap-2">
                    ${o.status !== 'cancelled' ? `
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

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar pedidos.</div>`;
    }
  },

  // ----------------------------------------------------
  // TELA 13: CENTRAL DE NOTIFICAÇÕES
  // ----------------------------------------------------
  renderNotificationsScreen(container) {
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
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                  <button type="button" onclick="App.redeemCoupon('${c.type}')" ${points < c.cost ? 'disabled' : ''} 
                    class="mt-4 btn-primary text-xs py-2 w-full cursor-pointer ${points < c.cost ? 'opacity-50 cursor-not-allowed' : ''}">
                    ${points >= c.cost ? 'Resgatar Cupom' : 'Pontos Insuficientes'}
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar sistema de pontos.</div>`;
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

    container.innerHTML = `
      <div class="max-w-3xl mx-auto space-y-8 animate-fade-in">
        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex items-center justify-between shadow-sm">
          <div class="flex items-center gap-4">
            <img src="${user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'}" class="w-16 h-16 rounded-full object-cover border-2 border-teal-500">
            <div>
              <h1 class="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                ${user.name}
                ${user.is_verified_business ? '<span class="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-bold">CNPJ Verificado ✓</span>' : ''}
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
                <input type="text" id="prof-phone" value="${user.phone || ''}" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Empresa Verificada (CNPJ)?</label>
                <select id="prof-verified" onchange="document.getElementById('cnpj-box').style.display = this.value === '1' ? 'block' : 'none'" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                  <option value="0" ${!user.is_verified_business ? 'selected' : ''}>Pessoa Física</option>
                  <option value="1" ${user.is_verified_business ? 'selected' : ''}>Empresa Sustentável Verificada (PJ)</option>
                </select>
              </div>
              <div id="cnpj-box" style="display: ${user.is_verified_business ? 'block' : 'none'};">
                <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Número de CNPJ</label>
                <input type="text" id="prof-cnpj" value="${user.cnpj || ''}" placeholder="00.000.000/0001-00" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm font-mono">
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
            <button type="button" onclick="App.navigateTo('add-product')" class="btn-primary text-sm py-2 px-4 cursor-pointer">
              + Cadastrar Novo Produto
            </button>
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
                  <div class="flex items-center gap-3">
                    <img src="${p.primary_image}" class="w-12 h-12 rounded-xl object-cover">
                    <div>
                      <div class="font-bold text-sm text-gray-900 dark:text-white line-clamp-1">${p.name}</div>
                      <div class="text-xs text-gray-500">Estoque: ${p.stock} • R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</div>
                    </div>
                  </div>
                  <button type="button" onclick="App.deleteProductSeller(${p.id})" title="Excluir Anúncio" class="text-red-500 hover:text-red-700 p-2 text-sm cursor-pointer">
                    🗑️
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

    } catch (e) {
      container.innerHTML = `<div class="text-center py-12 text-red-500">Erro ao carregar área do vendedor.</div>`;
    }
  },

  // ----------------------------------------------------
  // TELA 21: ADICIONAR PRODUTO
  // ----------------------------------------------------
  renderAddProductScreen(container) {
    container.innerHTML = `
      <div class="max-w-2xl mx-auto animate-fade-in">
        <button type="button" onclick="App.navigateTo('seller')" class="text-sm text-teal-600 font-semibold hover:underline mb-4 block cursor-pointer">← Voltar para Área do Vendedor</button>
        <h1 class="text-2xl font-extrabold mb-6">Cadastrar Produto Sustentável</h1>

        <form onsubmit="App.submitAddProduct(event)" class="space-y-4 p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome do Produto</label>
            <input type="text" id="prod-name" required placeholder="Ex: Garrafa Térmica Inox" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Preço (R$)</label>
              <input type="number" step="0.01" id="prod-price" required placeholder="79.90" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Categoria</label>
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
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Condição do Produto</label>
              <select id="prod-condition" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                <option value="used">Usado (Reutilizável)</option>
                <option value="restored">Restaurado / Upcycled</option>
                <option value="new">Novo (Ecológico)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Estoque Disponível</label>
              <input type="number" id="prod-stock" value="1" required class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Material Sustentável / Atributos Ecológicos</label>
            <input type="text" id="prod-material" placeholder="Ex: Aço Inox / Algodão Orgânico / Upcycled" class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm">
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Descrição Detalhada & Impacto Ecológico</label>
            <textarea id="prod-desc" rows="4" required placeholder="Descreva o produto e seu impacto socioambiental positivo..." class="w-full px-4 py-2 border rounded-xl dark:bg-gray-700 text-sm"></textarea>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Fotos do Produto (Upload Local)</label>
            <input type="file" id="prod-images" multiple accept="image/*" class="w-full text-xs text-gray-500">
          </div>

          <button type="submit" id="btn-add-prod" class="btn-primary w-full py-3 text-sm cursor-pointer">Publicar Anúncio no Marketplace</button>
        </form>
      </div>
    `;
  },

  // ----------------------------------------------------
  // TELA 12: CHAT DE ATENDIMENTO
  // ----------------------------------------------------
  async openChatWithUser(receiverId, productId = null) {
    if (!AuthManager.currentUser) {
      this.showLoginModal();
      return;
    }
    this.navigateTo('chat', { withUserId: receiverId, productId: productId });
  },

  async renderChatScreen(container) {
    const user = AuthManager.currentUser;
    if (!user) {
      this.showLoginModal();
      return;
    }

    container.innerHTML = `
      <div class="h-[70vh] rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex overflow-hidden shadow-lg animate-fade-in">
        <div id="chat-sidebar" class="w-1/3 border-r dark:border-gray-800 p-4 space-y-3 overflow-y-auto">
          <h2 class="font-bold text-base mb-3">Mensagens</h2>
          <div id="chat-convs-list" class="space-y-2">Carregando conversas...</div>
        </div>
        <div id="chat-window" class="w-2/3 flex flex-col justify-between p-4 bg-gray-50/50 dark:bg-gray-900/50">
          <div class="text-center my-auto text-gray-400 text-sm">Selecione uma conversa para iniciar o bate-papo</div>
        </div>
      </div>
    `;

    const convsRes = await ChatManager.getConversations();
    const convsList = document.getElementById('chat-convs-list');

    if (convsRes.success && convsRes.conversations.length > 0) {
      convsList.innerHTML = convsRes.conversations.map(c => `
        <div onclick="App.selectChatPartner(${c.user.id})" class="p-3 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 cursor-pointer hover:border-teal-500 transition">
          <div class="font-bold text-xs text-gray-900 dark:text-white line-clamp-1">${c.user.name}</div>
          <div class="text-[11px] text-gray-500 line-clamp-1 mt-0.5">${c.last_message ? c.last_message.message : ''}</div>
        </div>
      `).join('');
    } else {
      convsList.innerHTML = `<div class="text-xs text-gray-400">Nenhuma conversa encontrada.</div>`;
    }
  },

  async selectChatPartner(partnerId) {
    const win = document.getElementById('chat-window');
    win.innerHTML = `<div class="text-center my-auto text-gray-400">Carregando mensagens...</div>`;

    const res = await ChatManager.getMessages(partnerId);
    if (!res.success) return;

    const partner = res.partner;
    const msgs = res.messages;

    win.innerHTML = `
      <div class="p-3 border-b dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl mb-3">
        <div class="flex items-center gap-2">
          <div class="font-bold text-sm">${partner.name}</div>
          <span class="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">🟢 Disponível agora</span>
        </div>
      </div>

      <div id="chat-msgs-body" class="flex-1 overflow-y-auto space-y-3 pr-2 mb-3">
        ${msgs.map(m => {
          const isMe = m.sender_id === AuthManager.currentUser.id;
          return `
            <div class="flex ${isMe ? 'justify-end' : 'justify-start'} group">
              <div class="relative max-w-xs px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-teal-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-800 border dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}">
                ${m.message}
                ${isMe ? `
                  <button type="button" onclick="App.deleteChatMessage(${m.id}, ${partnerId})" title="Apagar Mensagem" class="opacity-0 group-hover:opacity-100 absolute -left-6 top-2 text-gray-400 hover:text-red-500 text-xs cursor-pointer">
                    🗑️
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="flex gap-2 overflow-x-auto no-scrollbar mb-2 pb-1">
        ${[
          'O produto ainda está disponível?',
          'Qual o valor do frete?',
          'Aceita proposta de valor?'
        ].map(q => `
          <button type="button" onclick="document.getElementById('chat-input-text').value='${q}'" class="text-[11px] font-medium bg-white dark:bg-gray-800 border dark:border-gray-700 px-3 py-1 rounded-full whitespace-nowrap hover:border-teal-500 transition text-gray-600 dark:text-gray-300 cursor-pointer">
            ${q}
          </button>
        `).join('')}
      </div>

      <form onsubmit="App.sendChatMessage(event, ${partnerId})" class="flex gap-2">
        <input type="text" id="chat-input-text" required placeholder="Digite sua mensagem..." class="flex-1 px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
        <button type="submit" class="btn-primary text-xs py-2 px-4 cursor-pointer">Enviar</button>
      </form>
    `;

    const body = document.getElementById('chat-msgs-body');
    if (body) body.scrollTop = body.scrollHeight;
  },

  async sendChatMessage(e, partnerId) {
    e.preventDefault();
    const input = document.getElementById('chat-input-text');
    const text = input.value.trim();
    if (!text) {
      ToastManager.show('Digite uma mensagem válida antes de enviar.', 'error');
      return;
    }

    input.value = '';
    await ChatManager.sendMessage(partnerId, text);
    this.selectChatPartner(partnerId);
  },

  async deleteChatMessage(msgId, partnerId) {
    if (confirm('Deseja apagar esta mensagem enviada?')) {
      const res = await fetch('api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_message', message_id: msgId })
      });
      const data = await res.json();
      if (data.success) {
        ToastManager.show('Mensagem apagada', 'info');
        this.selectChatPartner(partnerId);
      }
    }
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
          <h2 class="text-xl font-bold mb-4">❓ Central de Dúvidas / FAQ</h2>
          <div class="space-y-4">
            <details class="p-4 rounded-xl border dark:border-gray-700 cursor-pointer">
              <summary class="font-bold text-sm">Como funcionam os Pontos Verdes?</summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">Cada produto comprado ou cadastrado recompensa você com Pontos Verdes. Ganhe +500 pontos ao se cadastrar e +50 pontos ao avaliar uma compra.</p>
            </details>
            <details class="p-4 rounded-xl border dark:border-gray-700 cursor-pointer">
              <summary class="font-bold text-sm">Como é feito o envio do produto?</summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">O vendedor e o comprador combinam a entrega diretamente pelo Chat ou através do frete ecológico cadastrado no sistema.</p>
            </details>
          </div>
        </div>
      </div>
    `;
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

        <div class="mt-4 pt-4 border-t dark:border-gray-700 text-center">
          <button type="button" onclick="ToastManager.show('Login com Google Simulado com sucesso!', 'success'); App.submitGoogleLoginSimulated();" class="w-full py-2.5 border dark:border-gray-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer">
            <span>🌐</span> Entrar com o Google (Simulado)
          </button>
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
      this.renderCurrentScreen();
    } else {
      if (btn) btn.innerHTML = 'Entrar';
      ToastManager.show(res.error, 'error');
    }
  },

  async submitGoogleLoginSimulated() {
    const res = await AuthManager.login('lucas@ecostore.com', '123456');
    if (res.success) {
      document.getElementById('auth-modal').remove();
      this.updateHeaderUI();
      this.renderCurrentScreen();
    }
  },

  showRegisterModal() {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button type="button" onclick="document.getElementById('auth-modal').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <span class="inline-block bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-2">🎁 Bônus de 500 Pontos Verdes</span>
        <h2 class="text-2xl font-bold mb-3 text-gray-900 dark:text-white">Criar Nova Conta</h2>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <button type="button" onclick="App.setRole('buyer')" id="role-btn-buyer" class="p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer">
            <span class="text-2xl block pointer-events-none">🛍️</span>
            <div class="font-bold text-xs mt-1 pointer-events-none">Comprador</div>
            <div class="text-[10px] text-gray-500 pointer-events-none">Compre e ganhe pontos</div>
          </button>
          <button type="button" onclick="App.setRole('seller')" id="role-btn-seller" class="p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer">
            <span class="text-2xl block pointer-events-none">🏪</span>
            <div class="font-bold text-xs mt-1 pointer-events-none">Vendedor</div>
            <div class="text-[10px] text-gray-500 pointer-events-none">Anuncie produtos eco</div>
          </button>
        </div>

        <form onsubmit="App.submitRegister(event)" class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nome Completo *</label>
            <input type="text" id="reg-name" required placeholder="Seu Nome Completo" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>
          <div>
            <div class="flex justify-between items-center mb-1">
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300">E-mail *</label>
              <span id="reg-email-check" class="text-xs text-emerald-500 font-bold hidden">✓ Formato Correto</span>
            </div>
            <input type="email" id="reg-email" oninput="App.validateEmailInput(this)" required placeholder="seu@email.com" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Telefone / WhatsApp *</label>
            <input type="text" id="reg-phone" required placeholder="(11) 99999-9999" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>

          <div id="seller-extra-fields" class="hidden space-y-3 p-3 bg-teal-50 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-900">
            <div>
              <label class="block text-xs font-bold text-teal-800 dark:text-teal-300 mb-1">Nome Fantasia da Loja *</label>
              <input type="text" id="reg-business-name" placeholder="Ex: EcoStore Brasil" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-teal-800 dark:text-teal-300 mb-1">CNPJ da Empresa *</label>
              <input type="text" id="reg-cnpj" placeholder="00.000.000/0001-00" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm font-mono">
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Senha (mínimo 6 caracteres) *</label>
            <input type="password" id="reg-password" oninput="App.checkPasswordStrength(this.value)" required minlength="6" placeholder="••••••••" class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
            <div class="mt-1 flex items-center gap-2">
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                <div id="pass-strength-bar" class="h-full w-0 transition-all duration-300 bg-red-500"></div>
              </div>
              <span id="pass-strength-text" class="text-[10px] font-semibold text-gray-400">---</span>
            </div>
          </div>
          <button type="submit" id="btn-reg-submit" class="btn-primary w-full py-2.5 text-sm mt-2 cursor-pointer">Criar Conta e Ganhar +500 pts</button>
        </form>
      </div>
    `;
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

  checkPasswordStrength(val) {
    const bar = document.getElementById('pass-strength-bar');
    const txt = document.getElementById('pass-strength-text');
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
    if (btn) btn.innerHTML = 'Criando conta...';

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const pass = document.getElementById('reg-password').value;

    const res = await AuthManager.register(name, email, pass, phone);
    if (res.success) {
      ToastManager.show(res.message, 'success', 4000);
      document.getElementById('auth-modal').remove();
      this.updateHeaderUI();
      this.renderCurrentScreen();
    } else {
      if (btn) btn.innerHTML = 'Criar Conta e Ganhar +500 pts';
      ToastManager.show(res.error, 'error');
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
        <p class="text-xs text-gray-500 mb-4">Insira o código de 6 dígitos (Use <strong>123456</strong> para testes).</p>

        <form onsubmit="App.submitForgotStep2(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Código de 6 dígitos</label>
            <input type="text" id="forgot-code" required maxlength="6" value="123456" class="w-full text-center font-mono tracking-widest text-lg px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600">
          </div>
          <button type="submit" class="btn-primary w-full py-3 text-sm cursor-pointer">Validar Código</button>
        </form>
      </div>
    `;
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
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nova Senha</label>
            <input type="password" id="forgot-newpass" required minlength="6" placeholder="••••••••" class="w-full px-4 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm">
          </div>
          <button type="submit" class="btn-primary w-full py-3 text-sm cursor-pointer">Salvar Nova Senha</button>
        </form>
      </div>
    `;
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
    this.navigateTo('cart');
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
    }
  },

  async cancelOrder(orderId) {
    if (confirm('Deseja realmente solicitar o cancelamento deste pedido?')) {
      const res = await fetch('api/orders.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', order_id: orderId })
      });
      const data = await res.json();
      if (data.success) {
        ToastManager.show('Pedido cancelado com sucesso!', 'info');
        this.renderOrdersScreen(document.getElementById('main-content'));
      } else {
        ToastManager.show(data.error, 'error');
      }
    }
  },

  switchPaymentTab(tab) {
    document.getElementById('pay-box-pix').className = tab === 'pix' ? 'p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 text-center space-y-3' : 'hidden';
    document.getElementById('pay-box-credit').className = tab === 'credit' ? 'p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3' : 'hidden';
    document.getElementById('pay-box-boleto').className = tab === 'boleto' ? 'p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3' : 'hidden';
  },

  async submitEditProfile(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', document.getElementById('prof-name').value);
    formData.append('phone', document.getElementById('prof-phone').value);
    formData.append('is_verified_business', document.getElementById('prof-verified').value);
    formData.append('cnpj', document.getElementById('prof-cnpj') ? document.getElementById('prof-cnpj').value : '');

    const avatarFile = document.getElementById('prof-avatar').files[0];
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }

    const res = await AuthManager.updateProfile(formData);
    if (res.success) {
      ToastManager.show(res.message, 'success');
      this.updateHeaderUI();
      this.renderProfileScreen(document.getElementById('main-content'));
    } else {
      ToastManager.show(res.error, 'error');
    }
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
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
