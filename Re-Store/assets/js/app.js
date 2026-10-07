/* assets/js/app.js - Controlador Principal Re-Store (TODAS AS TELAS E COMPONENTES IMPLEMENTADOS) */

/* =========================================================================
   DATE HELPER: SINCRONIZAÇÃO E ALINHAMENTO DE HORÁRIOS COM O USUÁRIO
   Converte datas/horas armazenadas em UTC no backend para o fuso horário
   local exato e formato nativo do dispositivo do usuário (Intl / pt-BR).
   ========================================================================= */
const DateHelper = {
  /**
   * Converte qualquer timestamp do backend (UTC no SQLite/MySQL ou ISO)
   * em um objeto Date do JavaScript devidamente sincronizado com o fuso local do usuário.
   */
  parseServerDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val !== 'string') return null;

    const s = val.trim();
    if (!s) return null;

    // Detecta padrão SQL "YYYY-MM-DD HH:mm:ss" ou "YYYY-MM-DDTHH:mm:ss" sem fuso.
    // O SQLite CURRENT_TIMESTAMP e MySQL gravam em UTC puro sem sufixo "Z".
    // Construímos a Date com Date.UTC para que o navegador aplique automaticamente o fuso horário local do usuário.
    const sqlMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
    if (sqlMatch) {
      const [, year, month, day, hours, minutes, seconds] = sqlMatch;
      return new Date(Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hours, 10),
        parseInt(minutes, 10),
        parseInt(seconds || '0', 10)
      ));
    }

    // Se já contiver 'Z' ou offset explícito (+03:00, -03:00, etc.)
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    return null;
  },

  /**
   * Retorna o identificador do fuso horário detectado no dispositivo do usuário (ex: "America/Sao_Paulo")
   */
  getUserTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    } catch {
      return 'America/Sao_Paulo';
    }
  },

  /**
   * Formata Data e Hora completas: "07/10/2026 às 11:22"
   */
  formatDateTime(val, fallback = '') {
    const d = this.parseServerDate(val);
    if (!d) return fallback || String(val || '');
    const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} às ${timeStr}`;
  },

  /**
   * Formata apenas a Data: "07/10/2026"
   */
  formatDate(val, fallback = '') {
    const d = this.parseServerDate(val);
    if (!d) return fallback || String(val || '');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  /**
   * Formata apenas o Horário: "11:22"
   */
  formatTime(val, fallback = '') {
    const d = this.parseServerDate(val);
    if (!d) return fallback || String(val || '');
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  /**
   * Horário local para balão de chat (HH:mm)
   */
  formatChatTime(val) {
    return this.formatTime(val, '');
  },

  /**
   * Horário inteligente para a lista de conversas da barra lateral:
   * - Hoje: "11:22"
   * - Ontem: "Ontem"
   * - Últimos 6 dias: "Seg", "Ter", etc.
   * - Ano atual: "05/10"
   * - Anos anteriores: "12/08/2025"
   */
  formatConversationTime(val) {
    const d = this.parseServerDate(val);
    if (!d) return '';

    const now = new Date();
    const isSameYear = d.getFullYear() === now.getFullYear();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return this.formatTime(d);
    }
    if (diffDays === 1) {
      return 'Ontem';
    }
    if (diffDays > 1 && diffDays < 7) {
      const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      return weekdays[d.getDay()];
    }
    if (isSameYear) {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  /**
   * Divisor de dia para o corpo do chat (ex: "Hoje", "Ontem", "5 de outubro")
   */
  formatChatDayHeader(val) {
    const d = this.parseServerDate(val);
    if (!d) return '';

    const now = new Date();
    const isSameYear = d.getFullYear() === now.getFullYear();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';

    if (isSameYear) {
      const day = d.getDate();
      const monthName = d.toLocaleDateString('pt-BR', { month: 'long' });
      return `${day} de ${monthName}`;
    }

    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  },

  /**
   * Tempo relativo amigável (para notificações, avisos e atividades recentes):
   * "Agora mesmo", "Há 5 min", "Hoje às 11:22", "Ontem às 19:40", "07/10/2026 às 11:22"
   */
  formatRelativeTime(val) {
    const d = this.parseServerDate(val);
    if (!d) return String(val || '');

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 45) {
      return 'Agora mesmo';
    }
    if (diffSec < 3600) {
      const mins = Math.max(1, Math.floor(diffSec / 60));
      return `Há ${mins} min`;
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));

    const timeStr = this.formatTime(d);
    if (diffDays === 0) {
      return `Hoje às ${timeStr}`;
    }
    if (diffDays === 1) {
      return `Ontem às ${timeStr}`;
    }
    if (diffDays > 1 && diffDays < 7) {
      return `Há ${diffDays} dias às ${timeStr}`;
    }

    return this.formatDateTime(d);
  }
};

window.DateHelper = DateHelper;

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
  DateHelper: DateHelper,

  formatDateTime(val, fallback = '') {
    return DateHelper.formatDateTime(val, fallback);
  },

  formatDate(val, fallback = '') {
    return DateHelper.formatDate(val, fallback);
  },

  formatTime(val, fallback = '') {
    return DateHelper.formatTime(val, fallback);
  },

  formatRelativeTime(val) {
    return DateHelper.formatRelativeTime(val);
  },

  formatConversationTime(val) {
    return DateHelper.formatConversationTime(val);
  },

  formatChatDayHeader(val) {
    return DateHelper.formatChatDayHeader(val);
  },

  confirm(options) {
    return ModalDialog.confirm(options);
  },

  alert(options) {
    return ModalDialog.alert(options);
  },

  submitReview: async function(productId, formElement) {
    const formData = new FormData(formElement);
    formData.append('product_id', productId);
    const comment = formData.get('comment');

    if (!comment || !comment.trim()) {
      ToastManager.show("Por favor, escreva um comentário antes de enviar.", "warning");
      return;
    }

    const submitBtn = formElement.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block mr-1">⏳</span> Enviando...';
    }

    try {
      const response = await fetch('api/reviews.php?action=create', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        ToastManager.show(data.message || "Avaliação enviada com sucesso!", "success");
        formElement.reset();
        await AuthManager.checkAuth();
        App.updateHeaderUI();
        App.renderCurrentScreen();
      } else {
        ToastManager.show(data.error || "Erro ao enviar avaliação.", "error");
      }
    } catch (error) {
      console.error("Erro no envio:", error);
      if (typeof ToastManager !== 'undefined') {
        ToastManager.show("Erro de conexão ao enviar avaliação.", "error");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="send" class="w-3.5 h-3.5 pointer-events-none"></i><span>Enviar Avaliação</span>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  },

  // Botão de Voto Útil (+1)
  voteReviewHelpful: async function(reviewId, btnElement) {
    if (typeof AuthManager !== 'undefined' && !AuthManager.currentUser) {
      if (typeof ToastManager !== 'undefined') {
        ToastManager.show('Faça login para interagir com as avaliações.', 'info');
      }
      App.showLoginModal();
      return;
    }

    try {
      const res = await fetch('api/reviews.php?action=vote_helpful', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId })
      });
      const data = await res.json();
      if (data.success) {
        const countSpan = btnElement.querySelector('.helpful-count');
        if (countSpan) {
          countSpan.innerText = data.new_count;
        }

        if (data.voted) {
          btnElement.classList.add('text-teal-600', 'font-bold');
          btnElement.classList.remove('text-gray-500');
          if (typeof ToastManager !== 'undefined') {
            ToastManager.show('Obrigado pelo seu feedback!', 'success');
          }
        } else {
          btnElement.classList.remove('text-teal-600', 'font-bold');
          btnElement.classList.add('text-gray-500');
        }
      } else {
        ToastManager.show(data.error || 'Erro ao votar.', 'error');
      }
    } catch (err) {
      console.error('Erro na requisição:', err);
    }
  },

  // Excluir Avaliação
  deleteReview: async function(reviewId) {
    const confirmed = await ModalDialog.confirm({
      title: 'Excluir Avaliação',
      message: 'Tem certeza que deseja excluir sua avaliação e as fotos anexadas? Esta ação não pode ser desfeita.',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      type: 'danger',
      icon: 'trash'
    });
    if (!confirmed) return;

    try {
      const res = await fetch('api/reviews.php?action=delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId })
      });
      const data = await res.json();
      if (data.success) {
        ToastManager.show(data.message || 'Avaliação removida com sucesso!', 'info');
        App.renderCurrentScreen();
      } else {
        ToastManager.show(data.error || 'Erro ao excluir.', 'error');
      }
    } catch (err) {
      console.error(err);
      ToastManager.show('Erro ao excluir avaliação.', 'error');
    }
  },

  // Alterna o formulário de edição de avaliação
  toggleEditReview: function(reviewId) {
    const card = document.getElementById(`review-card-${reviewId}`);
    if (!card) return;

    const displayBox = card.querySelector('.review-display');
    const editForm = card.querySelector('.review-edit-form');

    if (displayBox && editForm) {
      displayBox.classList.toggle('hidden');
      if (editForm.classList.contains('hidden')) {
        editForm.classList.remove('hidden');
        editForm.classList.add('flex', 'flex-col', 'w-full');
      } else {
        editForm.classList.add('hidden');
        editForm.classList.remove('flex', 'flex-col', 'w-full');
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  },

  // Pré-visualização de fotos para avaliação (limite de 3 fotos)
  previewReviewPhotos: function(input, previewContainerId, currentPhotoCount = 0) {
    const container = document.getElementById(previewContainerId);
    if (!container) return;
    container.innerHTML = '';

    const maxAllowed = Math.max(0, 3 - currentPhotoCount);
    const files = Array.from(input.files || []);

    if (files.length > maxAllowed) {
      ModalDialog.alert({
        title: 'Limite de Fotos',
        message: `Limite máximo de 3 fotos. Você pode adicionar no máximo ${maxAllowed} nova(s) foto(s).`,
        type: 'warning'
      });
      input.value = '';
      return;
    }

    files.forEach((file, index) => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 5 * 1024 * 1024) {
        if (typeof ToastManager !== 'undefined') {
          ToastManager.show(`A imagem "${file.name}" ultrapassa o limite de 5MB.`, 'warning');
        }
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const div = document.createElement('div');
        div.className = 'relative group w-16 h-16 rounded-xl overflow-hidden border border-teal-500 shadow-sm flex-shrink-0';
        div.innerHTML = `
          <img src="${e.target.result}" class="w-full h-full object-cover">
          <span class="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] text-center font-bold">Foto ${index + 1}</span>
        `;
        container.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  },

  // Marca uma foto existente para remoção ao editar a avaliação
  markReviewImageForDeletion: function(imgId, btnElement, editForm) {
    const parentThumb = btnElement.closest('.review-existing-thumb');
    if (parentThumb) {
      parentThumb.classList.add('opacity-30', 'grayscale', 'border-red-500');
      btnElement.remove();
    }
    if (editForm) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'delete_image_ids[]';
      hidden.value = imgId;
      editForm.appendChild(hidden);
    }
    if (typeof ToastManager !== 'undefined') {
      ToastManager.show('Foto marcada para exclusão. Salve a avaliação para confirmar.', 'info');
    }
  },

  // Modal para zoom/lightbox de fotos das avaliações
  openImageModal: function(imageUrl, title = 'Foto da Avaliação') {
    const existing = document.getElementById('review-photo-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'review-photo-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none';
    
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');

    const closeModal = () => {
      modal.remove();
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    };

    modal.onclick = (e) => {
      if (e.target === modal || e.target.closest('.close-modal-btn')) {
        closeModal();
      }
    };
    modal.innerHTML = `
      <div class="relative max-w-3xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col select-auto animate-modal-in" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-4 py-3 border-b dark:border-gray-800">
          <span class="text-sm font-bold text-gray-800 dark:text-gray-200">${title}</span>
          <button type="button" class="close-modal-btn text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded-lg cursor-pointer">
            ✕
          </button>
        </div>
        <div class="p-3 flex items-center justify-center bg-black/5 dark:bg-black/30 overflow-auto">
          <img src="${imageUrl}" class="max-h-[75vh] max-w-full object-contain rounded-xl shadow-lg" alt="Foto ampliada">
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // Enviar alterações da edição de avaliação (com suporte a fotos)
  submitReviewEdit: async function(reviewId, formElement) {
    const formData = new FormData(formElement);
    formData.append('review_id', reviewId);

    const submitBtn = formElement.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block mr-1">⏳</span> Salvando...';
    }

    try {
      const res = await fetch('api/reviews.php?action=update', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        ToastManager.show(data.message || 'Avaliação atualizada com sucesso!', 'success');
        App.renderCurrentScreen();
      } else {
        ToastManager.show(data.error || 'Erro ao atualizar avaliação.', 'error');
      }
    } catch (err) {
      console.error('Erro ao atualizar:', err);
      if (typeof ToastManager !== 'undefined') {
        ToastManager.show('Erro de comunicação ao salvar alterações.', 'error');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Salvar Alterações';
      }
    }
  },

  async init() {
    await AuthManager.checkAuth();
    await this.loadFavoriteIds();
    this.updateHeaderUI();
    this.renderCurrentScreen();
    this.setupEventListeners();
    this.setupGlobalShortcuts();
  },

  async refreshNotifBadge() {
    const badge = document.getElementById('notif-badge');
    const user = AuthManager.currentUser;
    if (!badge || !user) return;
    try {
      const res = await fetch('api/notifications.php');
      const data = await res.json();
      const list = (data.success && data.notifications) || [];
      const seen = localStorage.getItem('notif_seen_' + user.id) || '';
      const unseen = list.filter(n => String(n.time) > seen).length;
      if (unseen > 0) {
        badge.innerText = unseen > 9 ? '9+' : unseen;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    } catch (e) {
      console.error(e);
    }
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
      notifBadge.style.display = 'none';
      if (user) this.refreshNotifBadge();
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
          Criar Conta (+150 pts)
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
    const prodId = params.productId !== undefined && params.productId !== null ? params.productId : params.id;
    if (prodId !== undefined && prodId !== null) {
      this.selectedProductId = parseInt(prodId, 10);
    }
    if (params.scrollToReview) {
      this.shouldScrollToReview = true;
    }

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

      if (data.success && data.products && data.products.length > 0) {
        this.productsCache = data.products;
        if (grid) {
          grid.innerHTML = data.products.map(p => this.renderProductCardHTML(p)).join('');
        }
      } else if (grid && !this.productsCache) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">${data.error || 'Nenhum produto cadastrado até o momento.'}</div>`;
      }
    } catch (e) {
      console.error('Erro ao carregar produtos na home:', e);
      const grid = document.getElementById('home-products-grid');
      if (grid && !this.productsCache) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Erro ao carregar produtos do servidor.</div>`;
      }
    }
  },

  renderProductCardHTML(p) {
    const isFav = Array.isArray(this.favoriteIds) ? this.favoriteIds.includes(p.id) : false;
    const heartSvg = isFav 
      ? '<svg class="w-4 h-4 text-red-500 fill-red-500" viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>'
      : '<svg class="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
    const user = typeof AuthManager !== 'undefined' ? AuthManager.currentUser : null;
    const isOwner = user && parseInt(user.id) === parseInt(p.seller_id);

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
            ${heartSvg}
          </button>
          <div class="absolute bottom-2 right-2">
            <span class="badge-points">+${p.points} pts</span>
          </div>
        </div>
        <div class="p-4 flex flex-col flex-grow justify-between">
          <div>
            <div class="flex items-center justify-between text-xs text-teal-600 font-semibold mb-1">
              <span>${p.category}</span>
              <span class="text-gray-400 font-normal inline-flex items-center gap-1">
                <svg class="w-3 h-3 text-teal-600 inline-block flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-7-4.5-7-10a7 7 0 1 1 14 0c0 5.5-7 10-7 10z"/><circle cx="12" cy="10" r="2.5"/></svg>
                ${p.location || 'São Paulo, SP'}
              </span>
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
              ${isOwner ? `
                <button type="button" onclick="App.navigateTo('product-detail', { productId: ${p.id} })" class="btn-outline text-xs py-1.5 px-3 cursor-pointer text-teal-600 border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/40 inline-flex items-center gap-1.5" title="Você é o anunciante deste produto">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <span>Seu Anúncio</span>
                </button>
              ` : `
                <button type="button" onclick="App.addToCartDirect(${p.id}, this)" class="btn-primary text-xs py-1.5 px-3 cursor-pointer inline-flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                  <span>Adicionar</span>
                </button>
              `}
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
      const images = (data.images && data.images.length > 0) ? data.images : [{ id: 0, image_url: (p.primary_image || 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600'), is_primary: 1 }];
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];

      const user = (typeof AuthManager !== 'undefined' && AuthManager.currentUser) ? AuthManager.currentUser : null;
      const isSeller = Boolean(data.user_is_seller || (user && parseInt(user.id, 10) === parseInt(p.seller_id, 10)));
      const myReview = data.user_review || null;
      const hasPurchased = Boolean(data.user_has_purchased);

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
              <div class="aspect-square product-image-container rounded-2xl overflow-hidden mb-4 shadow-md relative group">
                <img id="main-product-img" src="${images[0].image_url}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] cursor-pointer" alt="${(p.name || '').replace(/"/g, '&quot;')}" onclick="App.openImageModal(this.src, '${(p.name || '').replace(/'/g, "\\'")}')" title="Clique para ampliar a foto do produto">
                <div class="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/60 text-white text-[11px] font-medium backdrop-blur flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                  <i data-lucide="zoom-in" class="w-3.5 h-3.5"></i>
                  <span>Ampliar</span>
                </div>
              </div>
              <div class="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                ${images.map((img, idx) => `
                  <button type="button" 
                    onclick="document.getElementById('main-product-img').src='${img.image_url}'; document.querySelectorAll('.product-thumb-item').forEach(b => b.classList.remove('active')); this.classList.add('active');" 
                    class="product-thumb-item w-16 h-16 rounded-xl overflow-hidden cursor-pointer flex-shrink-0 shadow-sm ${idx === 0 ? 'active' : ''}"
                    title="Foto ${idx + 1}"
                  >
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
                  <span class="badge-points text-xs inline-flex items-center gap-1.5">
                    <i data-lucide="sprout" class="w-4 h-4 pointer-events-none"></i>
                    <span>Recompensa +${p.points} Pontos</span>
                  </span>
                </div>

                <div class="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl mb-4 border border-emerald-200 dark:border-emerald-900 flex items-center gap-3.5">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                    <i data-lucide="leaf" class="w-5 h-5"></i>
                  </div>
                  <div>
                    <div class="font-bold text-xs text-emerald-800 dark:text-emerald-300">Impacto Ambiental Positivo</div>
                    <div class="text-[11px] text-emerald-700 dark:text-emerald-400">Ao optar por este item reutilizável, você evita aproximadamente 2,5 kg de resíduos e CO₂ na natureza.</div>
                  </div>
                </div>

                <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-6 border dark:border-gray-800">
                  <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descrição Ecológica</h3>
                  <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">${p.description}</p>
                  ${p.material ? `<div class="mt-3 text-xs text-gray-500"><strong>Material Sustentável:</strong> ${p.material}</div>` : ''}
                  <div class="mt-2 text-xs text-gray-500 flex items-center gap-1"><strong class="text-gray-700 dark:text-gray-300 inline-flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-teal-600"></i> Local de venda:</strong> ${p.location || [p.seller_city, p.seller_state].filter(Boolean).join(', ') || 'Não informado'}</div>
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
                      <div class="text-xs text-gray-500 flex items-center gap-1"><span>Reputação:</span> <span class="text-amber-500 font-bold inline-flex items-center gap-0.5"><i data-lucide="star" class="w-3 h-3 fill-amber-400 text-amber-400"></i> 4.9</span> <span>(Vendedor Confiável)</span></div>
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

              </div>

              <!-- BOTOES DE AÇÃO / COMPRA -->
              ${user && parseInt(user.id) === parseInt(p.seller_id) ? `
                <div class="p-4 bg-teal-50 dark:bg-teal-950/40 border-2 border-teal-300 dark:border-teal-800 rounded-2xl space-y-3">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center flex-shrink-0">
                      <i data-lucide="shield-alert" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <div class="font-bold text-sm text-teal-950 dark:text-teal-200">Você é o anunciante deste produto</div>
                      <div class="text-xs text-teal-700 dark:text-teal-400">Pela política do Re-Store, você não pode comprar seus próprios produtos.</div>
                    </div>
                  </div>
                  <div class="flex gap-3 pt-1">
                    <button type="button" onclick="App.navigateTo('edit-product', { productId: ${p.id} })" class="btn-primary flex-1 py-2.5 text-sm cursor-pointer flex items-center justify-center gap-1.5">
                      <i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i>
                      <span>Editar Anúncio</span>
                    </button>
                    <button type="button" onclick="App.navigateTo('seller')" class="btn-outline flex-1 py-2.5 text-sm cursor-pointer flex items-center justify-center gap-1.5">
                      <i data-lucide="layout-dashboard" class="w-4 h-4 pointer-events-none"></i>
                      <span>Área do Vendedor</span>
                    </button>
                  </div>
                </div>
              ` : `
                <div class="flex gap-4">
                  <button type="button" onclick="App.addToCartAndCheckout(${p.id})" class="btn-secondary flex-1 py-3 text-base cursor-pointer inline-flex items-center justify-center gap-2">
                    <i data-lucide="zap" class="w-5 h-5"></i>
                    <span>Comprar Agora</span>
                  </button>
                  <button 
                    type="button" 
                    onclick="App.addToCartDirect(${p.id}, this)" 
                    class="btn-primary flex-1 py-3 text-base cursor-pointer flex items-center justify-center gap-2"
                  >
                    <i data-lucide="shopping-cart" class="w-5 h-5 pointer-events-none"></i>
                    <span>Adicionar ao Carrinho</span>
                  </button>
                </div>
              `}
            </div>
          </div>

          <!-- SEÇÃO DE AVALIAÇÕES DA COMUNIDADE -->
          <section id="reviews-section" class="border-t dark:border-gray-800 pt-8">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
              <span>Avaliações da Comunidade</span>
              <span class="text-sm font-normal text-gray-500">(${reviews.length})</span>
            </h2>

            <!-- FORMULÁRIO / STATUS DE AVALIAÇÃO DO USUÁRIO -->
            ${!user ? `
              <div class="mb-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border dark:border-gray-800 text-xs text-gray-500 flex items-center justify-between">
                <span>Faça login para poder avaliar este produto.</span>
                <button type="button" onclick="App.navigateTo('login')" class="btn-primary text-xs py-1.5 px-3 cursor-pointer font-bold">
                  Entrar na Conta
                </button>
              </div>
            ` : isSeller ? `
              <div class="mb-8 p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
                  <i data-lucide="info" class="w-4 h-4"></i>
                </div>
                <span>Você é o anunciante deste produto. Vendedores não podem avaliar os próprios anúncios.</span>
              </div>
            ` : myReview ? `
              <!-- USUÁRIO JÁ AVALIOU: EXIBE SUA AVALIAÇÃO COM BOTÃO DE EDIÇÃO -->
              <div id="review-card-${myReview.id}" class="mb-8 p-5 bg-teal-50/60 dark:bg-teal-950/30 rounded-2xl border border-teal-200 dark:border-teal-800 shadow-sm space-y-3">
                <div class="review-display flex flex-col justify-between">
                  <div class="flex items-center justify-between border-b border-teal-100 dark:border-teal-900 pb-2">
                    <div class="flex items-center gap-2">
                      <span class="font-extrabold text-sm text-teal-800 dark:text-teal-200">Sua Avaliação</span>
                      <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                        ✓ Compra Verificada
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button type="button" onclick="App.toggleEditReview(${myReview.id})" class="text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-1">
                        <i data-lucide="pencil" class="w-3.5 h-3.5 pointer-events-none"></i>
                        <span>Editar Avaliação</span>
                      </button>
                      <button type="button" onclick="App.deleteReview(${myReview.id})" class="text-xs font-bold text-red-500 hover:text-red-700 hover:underline cursor-pointer flex items-center gap-1 ml-2">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                  <div class="pt-2">
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-amber-400 text-sm font-bold">${'★'.repeat(Math.max(1, Math.min(5, parseInt(myReview.rating || 5, 10))))}${'☆'.repeat(5 - Math.max(1, Math.min(5, parseInt(myReview.rating || 5, 10))))}</span>
                      <span class="text-[11px] text-gray-400" title="${DateHelper.formatDateTime(myReview.created_at)}">${DateHelper.formatDateTime(myReview.created_at) || 'Recente'}</span>
                    </div>
                    <p class="text-xs text-gray-700 dark:text-gray-300">${myReview.comment || 'Sem comentário por escrito.'}</p>
                    ${myReview.images && myReview.images.length > 0 ? `
                      <div class="flex flex-wrap gap-2 mt-3">
                        ${myReview.images.map(img => `
                          <div class="w-16 h-16 rounded-xl overflow-hidden border border-teal-200 dark:border-teal-700 cursor-pointer hover:opacity-90 hover:scale-105 transition shadow-sm" onclick="App.openImageModal('${img.image_url}', 'Foto da sua avaliação')">
                            <img src="${img.image_url}" class="w-full h-full object-cover" alt="Foto da avaliação">
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- FORMULÁRIO DE EDIÇÃO DA PRÓPRIA AVALIAÇÃO -->
                <form class="review-edit-form hidden flex-col gap-3 w-full pt-2" onsubmit="event.preventDefault(); App.submitReviewEdit(${myReview.id}, this);">
                  <div class="flex items-center justify-between border-b dark:border-gray-700 pb-2">
                    <span class="text-xs font-bold text-teal-800 dark:text-teal-200">Editar Minha Avaliação</span>
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-gray-500 font-semibold">Nota:</label>
                      <select name="rating" class="p-1 text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-amber-500 font-bold rounded-lg">
                        <option value="5" ${myReview.rating == 5 ? 'selected' : ''}>★★★★★ (5)</option>
                        <option value="4" ${myReview.rating == 4 ? 'selected' : ''}>★★★★☆ (4)</option>
                        <option value="3" ${myReview.rating == 3 ? 'selected' : ''}>★★★☆☆ (3)</option>
                        <option value="2" ${myReview.rating == 2 ? 'selected' : ''}>★★☆☆☆ (2)</option>
                        <option value="1" ${myReview.rating == 1 ? 'selected' : ''}>★☆☆☆☆ (1)</option>
                      </select>
                    </div>
                  </div>

                  <textarea 
                    name="comment" 
                    rows="3" 
                    class="w-full p-2.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Atualize seu comentário sobre o produto..."
                    required
                  >${myReview.comment || ''}</textarea>

                  <!-- Gestão de Fotos Existentes -->
                  ${myReview.images && myReview.images.length > 0 ? `
                    <div class="space-y-1">
                      <label class="text-[11px] font-semibold text-gray-600 dark:text-gray-400">Fotos atuais (clique no ✕ para remover):</label>
                      <div class="flex flex-wrap gap-2">
                        ${myReview.images.map(img => `
                          <div class="review-existing-thumb relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-300 dark:border-gray-700 shadow-sm flex-shrink-0">
                            <img src="${img.image_url}" class="w-full h-full object-cover">
                            <button type="button" onclick="App.markReviewImageForDeletion(${img.id}, this, this.closest('form'))" class="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white text-[11px] w-5 h-5 flex items-center justify-center rounded-bl-lg font-bold cursor-pointer transition" title="Excluir esta foto">✕</button>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}

                  <!-- Adicionar Mais Fotos (até 3 no total) -->
                  <div>
                    <label class="text-[11px] font-semibold text-gray-600 dark:text-gray-400 block mb-1 inline-flex items-center gap-1.5">
                      <i data-lucide="camera" class="w-3.5 h-3.5 text-teal-600"></i>
                      <span>Adicionar novas fotos (máx. 3 no total):</span>
                    </label>
                    <input 
                      type="file" 
                      name="photos[]" 
                      multiple 
                      accept="image/png,image/jpeg,image/webp" 
                      onchange="App.previewReviewPhotos(this, 'edit-review-photos-preview-${myReview.id}', ${(myReview.images || []).length})" 
                      class="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-100 file:text-teal-800 dark:file:bg-teal-900 dark:file:text-teal-200 cursor-pointer"
                    >
                    <div id="edit-review-photos-preview-${myReview.id}" class="flex gap-2 mt-2 overflow-x-auto"></div>
                  </div>

                  <div class="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
                    <button 
                      type="button" 
                      onclick="App.toggleEditReview(${myReview.id})" 
                      class="px-3 py-1.5 text-xs border rounded-lg text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      class="btn-primary text-xs py-1.5 px-4 font-bold cursor-pointer"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              </div>
            ` : hasPurchased ? `
              <!-- COMPRADOR VERIFICADO: FORMULÁRIO DE NOVA AVALIAÇÃO COM FOTOS -->
              <div class="mb-8 p-5 bg-white dark:bg-gray-800 rounded-2xl border border-teal-200 dark:border-teal-800 shadow-sm space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b dark:border-gray-700 pb-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 rounded-full">
                        ✓ Compra Verificada
                      </span>
                      <h3 class="text-sm font-bold text-gray-900 dark:text-white">Avaliar Produto Adquirido</h3>
                    </div>
                    <p class="text-[11px] text-gray-500 mt-0.5">Sua avaliação ajuda outros membros da comunidade a comprar de forma consciente.</p>
                  </div>
                  <span class="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    +20 Pontos Verdes
                  </span>
                </div>

                <form id="review-submit-form" onsubmit="event.preventDefault(); App.submitReview(${p.id}, this);" class="space-y-3">
                  <!-- Seleção de Estrelas -->
                  <div class="flex items-center gap-2">
                    <label class="text-xs text-gray-600 dark:text-gray-300 font-semibold">Sua Nota:</label>
                    <select name="rating" class="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-xs font-bold text-amber-500 focus:ring-2 focus:ring-teal-500 outline-none">
                      <option value="5">★★★★★ (5/5) Excelente</option>
                      <option value="4">★★★★☆ (4/5) Muito Bom</option>
                      <option value="3">★★★☆☆ (3/5) Bom / Regular</option>
                      <option value="2">★★☆☆☆ (2/5) Ruim</option>
                      <option value="1">★☆☆☆☆ (1/5) Péssimo</option>
                    </select>
                  </div>

                  <!-- Campo de Comentário -->
                  <div>
                    <textarea 
                      name="comment" 
                      rows="3" 
                      placeholder="Conte como foi sua experiência com este produto ecológico..." 
                      class="w-full p-3 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    ></textarea>
                  </div>

                  <!-- Anexo de Fotos (Até 3 fotos) -->
                  <div>
                    <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 inline-flex items-center gap-1.5">
                      <i data-lucide="camera" class="w-3.5 h-3.5 text-teal-600"></i>
                      <span>Fotos do produto recebido (opcional, máximo 3 fotos):</span>
                    </label>
                    <input 
                      type="file" 
                      name="photos[]" 
                      multiple 
                      accept="image/png,image/jpeg,image/webp" 
                      onchange="App.previewReviewPhotos(this, 'new-review-photos-preview', 0)" 
                      class="text-xs text-gray-600 dark:text-gray-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-900 dark:file:text-teal-200 hover:file:bg-teal-100 cursor-pointer"
                    >
                    <div id="new-review-photos-preview" class="flex gap-2 mt-2 overflow-x-auto"></div>
                  </div>

                  <div class="flex items-center justify-between pt-1">
                    <span class="text-[11px] text-gray-400">Formatos aceitos: JPG, PNG, WebP (máx. 5MB cada)</span>
                    <button 
                      type="submit" 
                      class="btn-primary text-xs py-2 px-5 cursor-pointer inline-flex items-center gap-1.5 font-bold"
                    >
                      <i data-lucide="send" class="w-3.5 h-3.5 pointer-events-none"></i>
                      <span>Publicar Avaliação</span>
                    </button>
                  </div>
                </form>
              </div>
            ` : `
              <!-- NÃO COMPROU O ITEM: AVISO EXCLUSIVO -->
              <div class="mb-8 p-5 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2">
                <div class="flex items-center gap-2.5 font-bold text-sm text-gray-800 dark:text-gray-200">
                  <div class="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center flex-shrink-0">
                    <i data-lucide="lock" class="w-4 h-4"></i>
                  </div>
                  <span>Avaliação Exclusiva para Compradores Verificados</span>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Para assegurar que todas as opiniões da comunidade Re-Store sejam 100% reais e confiáveis, apenas compradores que adquiriram este produto podem avaliá-lo.
                </p>
                <div class="pt-1">
                  <button type="button" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" class="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer">
                    <span>Comprar este item para testar e avaliar</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            `}

            <!-- LISTA DE AVALIAÇÕES DA COMUNIDADE -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              ${reviews.length > 0 ? reviews.map(r => {
                const isMyReview = (typeof AuthManager !== 'undefined' && AuthManager.currentUser) 
                  ? parseInt(AuthManager.currentUser.id) === parseInt(r.user_id) 
                  : false;

                return `
                  <div id="review-card-${r.id}" class="p-4 rounded-2xl border ${isMyReview ? 'border-teal-300 dark:border-teal-700 bg-teal-50/20' : 'border-gray-200 dark:border-gray-800'} bg-white dark:bg-gray-800 flex flex-col justify-between shadow-sm">
                    
                    <!-- MODO DE EXIBIÇÃO NORMAL -->
                    <div class="review-display flex flex-col justify-between h-full">
                      <div>
                        <div class="flex items-center justify-between mb-2">
                          <div class="flex items-center gap-2">
                            <img src="${r.user_avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100'}" class="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-700">
                            <div>
                              <div class="flex items-center gap-1.5">
                                <span class="font-bold text-xs text-gray-900 dark:text-white">${r.user_name}</span>
                                ${isMyReview ? '<span class="text-[10px] text-teal-600 font-bold bg-teal-100 dark:bg-teal-900 px-1.5 py-0.2 rounded">Você</span>' : ''}
                              </div>
                              ${r.is_verified_purchase ? `
                                <span class="inline-flex items-center text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                                  ✓ Compra Verificada
                                </span>
                              ` : ''}
                            </div>
                          </div>
                          <div class="text-amber-400 text-sm font-bold">
                            ${'★'.repeat(Math.max(1, Math.min(5, parseInt(r.rating || 5, 10))))}${'☆'.repeat(5 - Math.max(1, Math.min(5, parseInt(r.rating || 5, 10))))}
                          </div>
                        </div>

                        <p class="text-xs text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">${r.comment || 'Sem comentário por escrito.'}</p>

                        <!-- FOTOS ANEXADAS NA AVALIAÇÃO (ATÉ 3) -->
                        ${r.images && r.images.length > 0 ? `
                          <div class="flex flex-wrap gap-2 mb-3">
                            ${r.images.map(img => `
                              <div class="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 hover:scale-105 transition shadow-sm flex-shrink-0" onclick="App.openImageModal('${img.image_url}', 'Foto da avaliação de ${r.user_name}')">
                                <img src="${img.image_url}" class="w-full h-full object-cover" alt="Foto da avaliação">
                              </div>
                            `).join('')}
                          </div>
                        ` : ''}
                      </div>

                      <div class="flex items-center justify-between pt-2 border-t dark:border-gray-700">
                        <span class="text-[11px] text-gray-400" title="${DateHelper.formatDateTime(r.created_at)}">${DateHelper.formatDateTime(r.created_at) || 'Recente'}</span>
                        
                        <div class="flex items-center gap-3">
                          <!-- Botão Útil (+1) -->
                          <button 
                            type="button" 
                            onclick="App.voteReviewHelpful(${r.id}, this)" 
                            class="text-xs ${r.user_voted ? 'text-teal-600 font-bold' : 'text-gray-500'} hover:text-teal-600 flex items-center gap-1 font-semibold cursor-pointer transition"
                          >
                            <i data-lucide="thumbs-up" class="w-3.5 h-3.5 pointer-events-none"></i>
                            <span>Útil (<span class="helpful-count">${r.helpful_count || 0}</span>)</span>
                          </button>

                          <!-- Ações de Editar/Excluir (apenas para o autor) -->
                          ${isMyReview ? `
                            <button 
                              type="button" 
                              onclick="App.toggleEditReview(${r.id})" 
                              class="text-xs text-teal-600 hover:underline cursor-pointer font-bold"
                            >
                              Editar
                            </button>
                            <button 
                              type="button" 
                              onclick="App.deleteReview(${r.id})" 
                              class="text-xs text-red-500 hover:underline cursor-pointer font-medium"
                            >
                              Excluir
                            </button>
                          ` : ''}
                        </div>
                      </div>
                    </div>

                    <!-- MODO DE EDIÇÃO INLINE -->
                    ${isMyReview ? `
                      <form class="review-edit-form hidden flex-col gap-3 w-full p-1" onsubmit="event.preventDefault(); App.submitReviewEdit(${r.id}, this);">
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-bold text-gray-700 dark:text-gray-200">Editar Avaliação</span>
                          <select name="rating" class="p-1 text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-amber-500 font-bold rounded-lg">
                            <option value="5" ${r.rating == 5 ? 'selected' : ''}>★★★★★ (5)</option>
                            <option value="4" ${r.rating == 4 ? 'selected' : ''}>★★★★☆ (4)</option>
                            <option value="3" ${r.rating == 3 ? 'selected' : ''}>★★★☆☆ (3)</option>
                            <option value="2" ${r.rating == 2 ? 'selected' : ''}>★★☆☆☆ (2)</option>
                            <option value="1" ${r.rating == 1 ? 'selected' : ''}>★☆☆☆☆ (1)</option>
                          </select>
                        </div>
                        
                        <textarea 
                          name="comment" 
                          rows="3" 
                          class="w-full p-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >${r.comment || ''}</textarea>

                        <!-- Fotos atuais com botão de exclusão -->
                        ${r.images && r.images.length > 0 ? `
                          <div class="space-y-1">
                            <label class="text-[10px] text-gray-500 font-semibold">Fotos anexadas (clique no ✕ para remover):</label>
                            <div class="flex flex-wrap gap-2">
                              ${r.images.map(img => `
                                <div class="review-existing-thumb relative group w-14 h-14 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 flex-shrink-0">
                                  <img src="${img.image_url}" class="w-full h-full object-cover">
                                  <button type="button" onclick="App.markReviewImageForDeletion(${img.id}, this, this.closest('form'))" class="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl font-bold cursor-pointer" title="Remover foto">✕</button>
                                </div>
                              `).join('')}
                            </div>
                          </div>
                        ` : ''}

                        <!-- Adicionar mais fotos -->
                        <div>
                          <label class="text-[10px] text-gray-500 font-semibold block mb-0.5">Adicionar mais fotos:</label>
                          <input 
                            type="file" 
                            name="photos[]" 
                            multiple 
                            accept="image/*" 
                            onchange="App.previewReviewPhotos(this, 'edit-review-photos-preview-${r.id}', ${(r.images || []).length})" 
                            class="text-xs file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-900 dark:file:text-teal-200 cursor-pointer"
                          >
                          <div id="edit-review-photos-preview-${r.id}" class="flex gap-2 mt-1 overflow-x-auto"></div>
                        </div>
                        
                        <div class="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
                          <button 
                            type="button" 
                            onclick="App.toggleEditReview(${r.id})" 
                            class="px-3 py-1.5 text-xs border rounded-lg text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="submit" 
                            class="btn-primary px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer"
                          >
                            Salvar
                          </button>
                        </div>
                      </form>
                    ` : ''}

                  </div>
                `;
              }).join('') : '<div class="text-gray-500 text-xs col-span-2 py-6 text-center bg-gray-50 dark:bg-gray-800/40 rounded-2xl border dark:border-gray-800">Ainda não há avaliações para este produto. Compradores verificados podem avaliar acima!</div>'}
            </div>
          </section>
        </div>
      `;            

      // IMPORTANTE: renderizar os ícones adicionados dinamicamente
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      // Rolagem suave automática direto para o formulário de avaliação se solicitado
      if (this.shouldScrollToReview) {
        this.shouldScrollToReview = false;
        setTimeout(() => {
          const revSection = document.getElementById('reviews-section') || container.querySelector('section.border-t');
          if (revSection) {
            revSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const reviewInput = revSection.querySelector('textarea[name="comment"]');
            if (reviewInput) {
              reviewInput.focus();
            }
          }
        }, 120);
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
    const user = AuthManager.currentUser;
    const hasOwnItems = user && cart.some(item => parseInt(item.seller_id) === parseInt(user.id));

    if (cart.length === 0) {
      container.innerHTML = `
        <div class="text-center py-16 animate-fade-in max-w-md mx-auto">
          <div class="w-20 h-20 mx-auto mb-4 rounded-3xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-inner">
            <i data-lucide="shopping-bag" class="w-10 h-10"></i>
          </div>
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

        ${hasOwnItems ? `
          <div class="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <i data-lucide="alert-triangle" class="w-5 h-5"></i>
              </div>
              <div>
                <div class="font-bold text-sm text-amber-900 dark:text-amber-200">Atenção: Seu carrinho contém produtos anunciados por você</div>
                <div class="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Pelas diretrizes do Re-Store, não é permitido comprar seus próprios produtos. Remova-os para continuar.</div>
              </div>
            </div>
            <button type="button" onclick="App.removeOwnCartItems()" class="btn-outline text-xs py-2 px-3 border-amber-500 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 cursor-pointer whitespace-nowrap font-bold">
              Remover Meus Produtos
            </button>
          </div>
        ` : ''}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-4">
            ${cart.map(item => {
              const isItemOwner = user && parseInt(item.seller_id) === parseInt(user.id);
              return `
              <div class="flex items-center justify-between p-4 rounded-2xl border ${isItemOwner ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800' : 'dark:border-gray-800 bg-white dark:bg-gray-800'}">
                <div class="flex items-center gap-4">
                  <img src="${item.image}" onclick="App.navigateTo('product-detail', { productId: ${item.product_id} })" class="w-16 h-16 rounded-xl object-cover border dark:border-gray-700 cursor-pointer hover:opacity-80 transition" title="Ver Detalhes">
                  <div>
                    <h3 onclick="App.navigateTo('product-detail', { productId: ${item.product_id} })" class="font-bold text-gray-900 dark:text-white text-sm line-clamp-1 hover:text-teal-600 cursor-pointer" title="Ver Detalhes">${item.name}</h3>
                    <div class="text-xs text-gray-500">Vendedor: ${item.seller_name}</div>
                    ${isItemOwner ? `
                      <span class="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-700">
                        <i data-lucide="ban" class="w-3 h-3 inline"></i> Seu Próprio Anúncio (Remoção Obrigatória)
                      </span>
                    ` : ''}
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
            `;
            }).join('')}
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

            ${hasOwnItems ? `
              <div class="mb-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                Remova seus próprios produtos para liberar o botão de finalização de compra.
              </div>
              <button type="button" disabled class="btn-primary w-full py-3 text-base opacity-50 cursor-not-allowed inline-flex items-center justify-center gap-2">
                <i data-lucide="lock" class="w-4 h-4"></i>
                <span>Checkout Bloqueado</span>
              </button>
            ` : `
              <button type="button" onclick="App.navigateTo('checkout')" class="btn-primary w-full py-3 text-base cursor-pointer">
                Ir para o Checkout Simulado
              </button>
            `}
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
    const cart = CartManager.getCart();
    const { total, totalPoints } = CartManager.getTotals();

    if (!user) {
      this.showLoginModal();
      return;
    }

    if (cart.some(item => parseInt(item.seller_id) === parseInt(user.id))) {
      container.innerHTML = `
        <div class="animate-fade-in max-w-xl mx-auto text-center py-16">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <i data-lucide="alert-triangle" class="w-8 h-8"></i>
          </div>
          <h2 class="text-2xl font-bold mb-2">Produtos Próprios no Carrinho</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Você não pode finalizar uma compra contendo itens anunciados por você mesmo. Por favor, retorne ao carrinho e remova os seus produtos.
          </p>
          <div class="flex gap-3 justify-center">
            <button type="button" onclick="App.removeOwnCartItems(); App.navigateTo('cart');" class="btn-primary py-2.5 px-4 text-sm cursor-pointer">
              Remover Meus Produtos e Voltar
            </button>
            <button type="button" onclick="App.navigateTo('cart')" class="btn-outline py-2.5 px-4 text-sm cursor-pointer">
              Voltar ao Carrinho
            </button>
          </div>
        </div>
      `;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
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

    const draft = this.checkoutAddressDraft || {};
    const defaultZip = draft.zip !== undefined ? draft.zip : ((user.zip_code && user.zip_code !== '01000-000') ? user.zip_code : '');
    const defaultStreet = draft.street || '';
    const defaultNumber = draft.number || '';
    const defaultComplement = draft.complement || '';
    const defaultNeighborhood = draft.neighborhood || '';
    const defaultCity = draft.city !== undefined ? draft.city : ((user.city && user.city !== 'São Paulo') ? user.city : '');
    const defaultState = draft.state !== undefined ? draft.state : ((user.state && user.state !== 'SP') ? user.state : '');

    container.innerHTML = `
      <div class="animate-fade-in max-w-4xl mx-auto">
        <h1 class="text-2xl font-extrabold mb-6">Finalizar Compra </h1>
        <form id="checkout-form" onsubmit="App.submitCheckout(event)" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-6">
            <div class="p-6 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div>
                    <h2 class="font-bold text-base text-gray-900 dark:text-white leading-tight">Endereço de Entrega</h2>
                    <p class="text-[11px] text-gray-500">Informe seu CEP para buscar rua e bairro automaticamente.</p>
                  </div>
                </div>
                <button type="button" onclick="App.toggleManualAddressEdit()" id="btn-toggle-address-edit" class="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 font-semibold inline-flex items-center gap-1 cursor-pointer hover:underline">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                  <span>Editar campos</span>
                </button>
              </div>

              <div class="space-y-4">
                <!-- CEP com busca automática e status -->
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <label for="chk-zip" class="block text-xs font-bold text-gray-700 dark:text-gray-300">
                      CEP <span class="text-red-500">*</span>
                    </label>
                    <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer" class="text-[11px] text-teal-600 hover:text-teal-700 dark:text-teal-400 inline-flex items-center gap-1 hover:underline">
                      <span>Não sei meu CEP</span>
                      <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                  </div>

                  <div class="relative flex items-center">
                    <input 
                      type="text" 
                      id="chk-zip" 
                      maxlength="9" 
                      required 
                      placeholder="00000-000" 
                      value="${this.escapeHtml(defaultZip)}" 
                      oninput="App.handleCepInput(this)" 
                      onblur="App.handleCepBlur(this)"
                      class="w-full pl-3.5 pr-24 py-2.5 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm font-mono tracking-wider focus:ring-2 focus:ring-teal-500 transition"
                    >
                    <div id="chk-cep-status" class="absolute right-2 flex items-center gap-1">
                      <button type="button" onclick="App.searchCepManually()" class="px-2.5 py-1 text-xs bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/60 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-200 rounded-lg cursor-pointer transition font-semibold">
                        Buscar
                      </button>
                    </div>
                  </div>
                  <div id="chk-cep-msg" class="text-xs mt-1.5 min-h-[16px]"></div>
                </div>

                <!-- Rua e Número -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div class="md:col-span-2">
                    <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Rua / Avenida <span class="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="chk-street" 
                      placeholder="Preenchido automaticamente pelo CEP" 
                      required 
                      readonly 
                      value="${this.escapeHtml(defaultStreet)}"
                      class="w-full px-3 py-2 border rounded-xl bg-gray-50 dark:bg-gray-700/60 dark:border-gray-600 text-sm cursor-not-allowed transition"
                    >
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-teal-700 dark:text-teal-400 mb-1 flex items-center justify-between">
                      <span>Número <span class="text-red-500">*</span></span>
                      <span class="text-[10px] font-normal text-gray-400">(Sua casa)</span>
                    </label>
                    <input 
                      type="text" 
                      id="chk-number" 
                      placeholder="Ex: 123" 
                      required 
                      value="${this.escapeHtml(defaultNumber)}"
                      class="w-full px-3 py-2 border-2 border-teal-500/70 rounded-xl dark:bg-gray-700 text-sm font-semibold focus:ring-2 focus:ring-teal-500 transition"
                    >
                  </div>
                </div>

                <!-- Bairro e Complemento -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Bairro <span class="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="chk-neighborhood" 
                      placeholder="Preenchido automaticamente pelo CEP" 
                      required 
                      readonly 
                      value="${this.escapeHtml(defaultNeighborhood)}"
                      class="w-full px-3 py-2 border rounded-xl bg-gray-50 dark:bg-gray-700/60 dark:border-gray-600 text-sm cursor-not-allowed transition"
                    >
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Complemento <span class="text-[11px] font-normal text-gray-400">(Opcional)</span>
                    </label>
                    <input 
                      type="text" 
                      id="chk-complement" 
                      placeholder="Ex: Apto 42, Bloco B, Casa 2" 
                      value="${this.escapeHtml(defaultComplement)}"
                      class="w-full px-3 py-2 border rounded-xl dark:bg-gray-700 dark:border-gray-600 text-sm"
                    >
                  </div>
                </div>

                <!-- Cidade e Estado -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div class="md:col-span-2">
                    <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Cidade <span class="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="chk-city" 
                      placeholder="Cidade" 
                      required 
                      readonly 
                      value="${this.escapeHtml(defaultCity)}" 
                      class="w-full px-3 py-2 border rounded-xl bg-gray-50 dark:bg-gray-700/60 dark:border-gray-600 text-sm cursor-not-allowed transition"
                    >
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Estado (UF) <span class="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="chk-state" 
                      placeholder="UF" 
                      required 
                      readonly 
                      maxlength="2" 
                      value="${this.escapeHtml(defaultState)}" 
                      class="w-full px-3 py-2 border rounded-xl bg-gray-50 dark:bg-gray-700/60 dark:border-gray-600 text-sm uppercase text-center font-bold cursor-not-allowed transition"
                    >
                  </div>
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
                    <div class="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                      <i data-lucide="ticket" class="w-5 h-5"></i>
                    </div>
                    <div>
                      <div class="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                        Cupom Ativo: <span class="font-mono bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 font-extrabold">${appliedCoupon.code}</span> (${appliedCoupon.discount_type} OFF)
                      </div>
                      <div class="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Economia aplicada: <strong>- R$ ${discountValue.toFixed(2).replace('.', ',')}</strong>
                      </div>
                    </div>
                  </div>
                  <button type="button" onclick="App.removeCouponCheckout()" class="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 cursor-pointer inline-flex items-center gap-1">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                    <span>Remover</span>
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
                        <button type="button" onclick="App.applyCouponDirect('${c.code}')" class="text-xs font-mono ${isSelected ? 'bg-teal-600 text-white font-bold shadow' : 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100'} px-3 py-1 rounded-full cursor-pointer transition inline-flex items-center gap-1.5">
                          <i data-lucide="tag" class="w-3.5 h-3.5"></i>
                          <span>${c.code} (${c.discount_type}) ${isSelected ? '✓' : ''}</span>
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
                    <div class="font-bold text-sm flex items-center gap-1.5"><i data-lucide="zap" class="w-4 h-4 text-emerald-500"></i> PIX Simulado (Confirmação Instantânea)</div>
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
                    <div class="font-bold text-sm flex items-center gap-1.5"><i data-lucide="credit-card" class="w-4 h-4 text-teal-500"></i> Cartão de Crédito</div>
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
                    <div class="font-bold text-sm flex items-center gap-1.5"><i data-lucide="file-text" class="w-4 h-4 text-teal-500"></i> Boleto Ecológico Simulado</div>
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

    // Se o usuário já possui um CEP válido e a rua ainda está vazia, busca e preenche automaticamente
    const initCleanZip = defaultZip.replace(/\D/g, '');
    if (initCleanZip.length === 8 && !defaultStreet) {
      setTimeout(() => {
        this.fetchAddressByCep(initCleanZip, true);
      }, 120);
    }
  },

  saveCurrentCheckoutAddress() {
    const zip = document.getElementById('chk-zip')?.value || '';
    const street = document.getElementById('chk-street')?.value || '';
    const number = document.getElementById('chk-number')?.value || '';
    const complement = document.getElementById('chk-complement')?.value || '';
    const neighborhood = document.getElementById('chk-neighborhood')?.value || '';
    const city = document.getElementById('chk-city')?.value || '';
    const state = document.getElementById('chk-state')?.value || '';

    this.checkoutAddressDraft = {
      zip, street, number, complement, neighborhood, city, state
    };
  },

  toggleManualAddressEdit() {
    const street = document.getElementById('chk-street');
    const neighborhood = document.getElementById('chk-neighborhood');
    const city = document.getElementById('chk-city');
    const state = document.getElementById('chk-state');
    const btn = document.getElementById('btn-toggle-address-edit');

    if (!street) return;

    const isLocked = street.hasAttribute('readonly');
    if (isLocked) {
      street.removeAttribute('readonly');
      street.classList.remove('bg-gray-50', 'cursor-not-allowed');
      neighborhood?.removeAttribute('readonly');
      neighborhood?.classList.remove('bg-gray-50', 'cursor-not-allowed');
      city?.removeAttribute('readonly');
      city?.classList.remove('bg-gray-50', 'cursor-not-allowed');
      state?.removeAttribute('readonly');
      state?.classList.remove('bg-gray-50', 'cursor-not-allowed');

      if (btn) btn.innerHTML = `<i data-lucide="lock" class="w-3.5 h-3.5"></i><span>Travar campos</span>`;
      ToastManager.show('Campos liberados para edição manual.', 'info');
    } else {
      street.setAttribute('readonly', 'true');
      street.classList.add('bg-gray-50', 'cursor-not-allowed');
      neighborhood?.setAttribute('readonly', 'true');
      neighborhood?.classList.add('bg-gray-50', 'cursor-not-allowed');
      city?.setAttribute('readonly', 'true');
      city?.classList.add('bg-gray-50', 'cursor-not-allowed');
      state?.setAttribute('readonly', 'true');
      state?.classList.add('bg-gray-50', 'cursor-not-allowed');

      if (btn) btn.innerHTML = `<i data-lucide="edit-3" class="w-3.5 h-3.5"></i><span>Editar campos</span>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  handleCepInput(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.length > 8) val = val.substring(0, 8);

    if (val.length > 5) {
      input.value = `${val.substring(0, 5)}-${val.substring(5)}`;
    } else {
      input.value = val;
    }

    if (val.length === 8) {
      this.fetchAddressByCep(val);
    } else {
      const msg = document.getElementById('chk-cep-msg');
      if (msg) msg.innerHTML = '';
      const status = document.getElementById('chk-cep-status');
      if (status) {
        status.innerHTML = `
          <button type="button" onclick="App.searchCepManually()" class="px-2.5 py-1 text-xs bg-teal-50 hover:bg-teal-100 dark:bg-teal-900/60 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-200 rounded-lg cursor-pointer transition font-semibold">
            Buscar
          </button>
        `;
      }
    }
  },

  handleCepBlur(input) {
    const val = input.value.replace(/\D/g, '');
    if (val.length === 8 && (!this.lastFetchedCep || this.lastFetchedCep !== val)) {
      this.fetchAddressByCep(val);
    }
  },

  searchCepManually() {
    const input = document.getElementById('chk-zip');
    if (!input) return;
    const val = input.value.replace(/\D/g, '');
    if (val.length !== 8) {
      ToastManager.show('Digite um CEP válido com 8 números.', 'warning');
      input.focus();
      return;
    }
    this.fetchAddressByCep(val);
  },

  async fetchAddressByCep(cepClean, isAutoInit = false) {
    if (this.isFetchingCep) return;
    const statusBox = document.getElementById('chk-cep-status');
    const msgBox = document.getElementById('chk-cep-msg');
    const streetInput = document.getElementById('chk-street');
    const numberInput = document.getElementById('chk-number');
    const neighborhoodInput = document.getElementById('chk-neighborhood');
    const cityInput = document.getElementById('chk-city');
    const stateInput = document.getElementById('chk-state');

    this.isFetchingCep = true;
    if (statusBox) {
      statusBox.innerHTML = `
        <span class="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 text-xs animate-pulse font-medium">
          <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>
          <span>Buscando...</span>
        </span>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (msgBox) {
      msgBox.innerHTML = `<span class="text-xs text-gray-500 dark:text-gray-400">Consultando endereço na base dos Correios...</span>`;
    }

    try {
      let data = null;

      // 1ª Tentativa: ViaCEP (API pública brasileira, suporte nativo a CORS no navegador)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          if (!json.erro) {
            data = {
              street: json.logradouro || '',
              neighborhood: json.bairro || '',
              city: json.localidade || '',
              state: json.uf || ''
            };
          } else {
            data = { notFound: true };
          }
        }
      } catch (err) {
        console.warn('ViaCEP indisponível ou timeout, tentando BrasilAPI como fallback...', err);
      }

      // 2ª Tentativa (Fallback resiliente): BrasilAPI
      if (!data || data.notFound) {
        try {
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
          const res2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${cepClean}`, {
            signal: controller2.signal
          });
          clearTimeout(timeoutId2);

          if (res2.ok) {
            const json2 = await res2.json();
            data = {
              street: json2.street || '',
              neighborhood: json2.neighborhood || '',
              city: json2.city || '',
              state: json2.state || ''
            };
          }
        } catch (err2) {
          console.warn('BrasilAPI fallback falhou:', err2);
        }
      }

      if (data && !data.notFound && (data.city || data.street)) {
        this.lastFetchedCep = cepClean;

        if (streetInput) {
          streetInput.value = data.street;
          if (!data.street) {
            // Em cidades menores de CEP único, o logradouro não vem na API
            streetInput.removeAttribute('readonly');
            streetInput.classList.remove('bg-gray-50', 'cursor-not-allowed');
            streetInput.placeholder = 'Digite sua rua ou avenida';
          }
        }
        if (neighborhoodInput) {
          neighborhoodInput.value = data.neighborhood;
          if (!data.neighborhood) {
            neighborhoodInput.removeAttribute('readonly');
            neighborhoodInput.classList.remove('bg-gray-50', 'cursor-not-allowed');
            neighborhoodInput.placeholder = 'Digite seu bairro';
          }
        }
        if (cityInput) cityInput.value = data.city;
        if (stateInput) stateInput.value = data.state;

        if (statusBox) {
          statusBox.innerHTML = `
            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <i data-lucide="check-circle" class="w-3.5 h-3.5"></i>
              <span>Localizado</span>
            </span>
          `;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        if (msgBox) {
          msgBox.innerHTML = `
            <span class="text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1 font-medium">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
              <span>Endereço preenchido! Agora informe o <strong>número</strong> da residência.</span>
            </span>
          `;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        if (!isAutoInit) {
          ToastManager.show('Endereço localizado! Informe o número da residência.', 'success', 3000);
          if (numberInput) {
            setTimeout(() => numberInput.focus(), 150);
          }
        }
      } else {
        if (statusBox) {
          statusBox.innerHTML = `
            <button type="button" onclick="App.searchCepManually()" class="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded-lg cursor-pointer font-medium">
              Tentar novamente
            </button>
          `;
        }
        if (msgBox) {
          msgBox.innerHTML = `
            <span class="text-red-500 text-xs flex items-center gap-1">
              ⚠️ CEP não localizado. Verifique os números ou clique em "Editar campos" para digitar manualmente.
            </span>
          `;
        }
        if (!isAutoInit) {
          ToastManager.show('CEP não encontrado. Verifique o número digitado.', 'warning');
        }
      }
    } catch (e) {
      if (msgBox) {
        msgBox.innerHTML = `<span class="text-amber-500 text-xs">Não foi possível consultar o CEP automaticamente. Você pode preencher manualmente.</span>`;
      }
    } finally {
      this.isFetchingCep = false;
    }
  },

  removeCouponCheckout() {
    this.saveCurrentCheckoutAddress();
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

      this.saveCurrentCheckoutAddress();
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

    const cart = CartManager.getCart();
    const user = AuthManager.currentUser;
    const ownItem = user ? cart.find(item => parseInt(item.seller_id) === parseInt(user.id)) : null;
    if (ownItem) {
      ToastManager.show(`Você não pode comprar produtos anunciados por você mesmo ("${ownItem.name}"). Remova-os do carrinho para continuar.`, 'warning');
      this.navigateTo('cart');
      return;
    }

    const btn = document.getElementById('btn-submit-chk');
    this.isSubmittingCheckout = true;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳ Processando pedido...</span>`;
    }

    try {
      const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'pix';

      const zipInput = document.getElementById('chk-zip');
      const streetInput = document.getElementById('chk-street');
      const numberInput = document.getElementById('chk-number');
      const complementInput = document.getElementById('chk-complement');
      const neighborhoodInput = document.getElementById('chk-neighborhood');
      const cityInput = document.getElementById('chk-city');
      const stateInput = document.getElementById('chk-state');

      const zip = (zipInput?.value || '').trim();
      const street = (streetInput?.value || '').trim();
      const number = (numberInput?.value || '').trim();
      const complement = (complementInput?.value || '').trim();
      const neighborhood = (neighborhoodInput?.value || '').trim();
      const city = (cityInput?.value || '').trim();
      const state = (stateInput?.value || '').trim().toUpperCase();

      const cleanZip = zip.replace(/\D/g, '');
      if (cleanZip.length !== 8) {
        ToastManager.show('Por favor, informe um CEP válido com 8 dígitos para a entrega.', 'warning');
        zipInput?.focus();
        if (btn) { btn.disabled = false; btn.innerHTML = `Confirmar Pedido Simulado`; }
        this.isSubmittingCheckout = false;
        return;
      }

      if (!street) {
        ToastManager.show('Por favor, aguarde a busca do CEP ou informe a rua / logradouro.', 'warning');
        streetInput?.focus();
        if (btn) { btn.disabled = false; btn.innerHTML = `Confirmar Pedido Simulado`; }
        this.isSubmittingCheckout = false;
        return;
      }

      if (!number) {
        ToastManager.show('Por favor, digite o número da sua casa / residência.', 'warning');
        numberInput?.focus();
        if (btn) { btn.disabled = false; btn.innerHTML = `Confirmar Pedido Simulado`; }
        this.isSubmittingCheckout = false;
        return;
      }

      if (!neighborhood) {
        ToastManager.show('Por favor, informe o bairro para entrega.', 'warning');
        neighborhoodInput?.focus();
        if (btn) { btn.disabled = false; btn.innerHTML = `Confirmar Pedido Simulado`; }
        this.isSubmittingCheckout = false;
        return;
      }

      if (!city || !state) {
        ToastManager.show('Por favor, informe a cidade e o estado para entrega.', 'warning');
        if (btn) { btn.disabled = false; btn.innerHTML = `Confirmar Pedido Simulado`; }
        this.isSubmittingCheckout = false;
        return;
      }

      const fullAddress = `${street}, Nº ${number}${complement ? ' (' + complement + ')' : ''} - Bairro: ${neighborhood}`;

      const shippingData = {
        address: fullAddress,
        city: city,
        state: state,
        zip: zip
      };

      const res = await CartManager.processCheckout(paymentMethod, shippingData, this.appliedCouponCode);
      if (res.success) {
        ToastManager.show(`Pedido #${res.order_number} confirmado com sucesso!`, 'success', 5000);
        this.appliedCouponCode = '';
        this.checkoutAddressDraft = null;
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
            <h1 class="text-2xl font-extrabold">Meus Pedidos</h1>
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
                    <span class="text-xs text-gray-400 ml-2" title="${DateHelper.formatDateTime(o.created_at)}">Data: ${DateHelper.formatDateTime(o.created_at)}</span>
                  </div>
                  <div>${statusBadge}</div>
                </div>

                <div class="space-y-3">
                  ${(o.items || []).map(i => `
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <img src="${i.product_image || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=100'}" onclick="App.navigateTo('product-detail', { productId: ${i.product_id}, id: ${i.product_id} })" class="w-12 h-12 rounded-xl object-cover border dark:border-gray-700 cursor-pointer hover:opacity-85 transition" title="Ver detalhes do produto">
                        <div>
                          <div onclick="App.navigateTo('product-detail', { productId: ${i.product_id}, id: ${i.product_id} })" class="font-bold text-sm text-gray-900 dark:text-white hover:text-teal-600 cursor-pointer transition">${i.product_name}</div>
                          <div class="text-xs text-gray-500">Qtd: ${i.quantity} • Vendedor: ${i.seller_name}</div>
                          <div class="flex items-center gap-3 mt-1">
                            ${i.seller_id ? `
                              <button type="button" onclick="App.openChatWithUser(${i.seller_id}, ${i.product_id})" class="text-[11px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer">
                                <i data-lucide="message-circle" class="w-3 h-3 pointer-events-none"></i>
                                <span>Conversar</span>
                              </button>
                            ` : ''}
                            ${!isCancelled ? `
                              ${parseInt(i.user_reviewed, 10) === 1 ? `
                                <button type="button" onclick="App.navigateTo('product-detail', { productId: ${i.product_id}, id: ${i.product_id}, scrollToReview: true })" class="text-[11px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer" title="Ver ou editar sua avaliação">
                                  <i data-lucide="check-circle-2" class="w-3 h-3 pointer-events-none text-emerald-500"></i>
                                  <span>Avaliado ✓</span>
                                </button>
                              ` : `
                                <button type="button" onclick="App.navigateTo('product-detail', { productId: ${i.product_id}, id: ${i.product_id}, scrollToReview: true })" class="text-[11px] text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer" title="Avaliar produto e acumular Pontos Verdes">
                                  <i data-lucide="star" class="w-3 h-3 pointer-events-none"></i>
                                  <span>Avaliar Produto</span>
                                </button>
                              `}
                            ` : ''}
                          </div>
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
                        <span class="inline-flex items-center gap-1"><i data-lucide="tag" class="w-3.5 h-3.5"></i> Cupom Aplicado:</span>
                        <span class="font-mono bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800 font-bold">${o.coupon_code}</span>
                        ${parseFloat(o.discount_amount) > 0 ? `<span class="text-emerald-600">(- R$ ${parseFloat(o.discount_amount).toFixed(2).replace('.', ',')})</span>` : ''}
                      </div>
                    ` : ''}
                    <div>
                      Total Pago: <strong class="text-gray-900 dark:text-white text-sm">R$ ${parseFloat(o.total).toFixed(2).replace('.', ',')}</strong> | Pontos Ganhos: <strong class="text-emerald-600">+${o.points_earned} pts</strong>
                    </div>
                    ${o.shipping_address ? `
                      <div class="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-1">
                        <i data-lucide="map-pin" class="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0"></i>
                        <span>Entrega em: <strong>${this.escapeHtml(o.shipping_address)}</strong>, ${this.escapeHtml(o.shipping_city || '')}-${this.escapeHtml(o.shipping_state || '')} (CEP: ${this.escapeHtml(o.shipping_zip || '')})</span>
                      </div>
                    ` : ''}
                  </div>
                  <div class="flex gap-2">
                    ${!isCancelled ? `
                      <button type="button" onclick="App.cancelOrder(${o.id})" class="text-xs font-semibold text-red-500 hover:underline px-2 py-1 cursor-pointer">Cancelar Pedido</button>
                    ` : ''}
                    <button type="button" onclick="App.openSupportChat({ orderNumber: '${o.order_number}', orderId: ${o.id} })" class="btn-outline text-xs py-1.5 px-3 cursor-pointer inline-flex items-center gap-1.5 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition" title="Falar diretamente com o Suporte Re-Store sobre este pedido">
                      <i data-lucide="headphones" class="w-3.5 h-3.5 pointer-events-none"></i>
                      <span>Falar com o Suporte</span>
                    </button>
                  </div>
                </div>
              </div>
            `;
      }).join('') : `
            <div class="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border dark:border-gray-800">
              <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <i data-lucide="package" class="w-8 h-8"></i>
              </div>
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
        <h1 class="text-2xl font-extrabold mb-4">Central de Notificações</h1>

        <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
          <h2 class="font-bold text-base mb-3">Últimos Alertas</h2>
          <div id="notif-list" class="space-y-3">
            <div class="skeleton-box h-14 w-full"></div>
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

    this.loadNotificationsList();
  },

  async loadNotificationsList() {
    const list = document.getElementById('notif-list');
    const user = AuthManager.currentUser;
    if (!list || !user) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    try {
      const res = await fetch('api/notifications.php');
      const data = await res.json();
      const items = (data.success && data.notifications) || [];

      if (items.length === 0) {
        list.innerHTML = `<div class="text-center text-xs text-gray-500 py-6">Você não tem notificações no momento.</div>`;
        return;
      }

      const styles = {
        success: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-300',
        info: 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 text-teal-800 dark:text-teal-300',
        chat: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 text-blue-800 dark:text-blue-300'
      };
      list.innerHTML = items.map(n => `
        <div class="p-3 border rounded-2xl ${styles[n.type] || styles.info}">
          <div class="flex items-center justify-between gap-2">
            <div class="font-bold text-xs">${esc(n.title)}</div>
            <div class="text-[10px] opacity-70 shrink-0 font-medium" title="${DateHelper.formatDateTime(n.time)}">${DateHelper.formatRelativeTime(n.time)}</div>
          </div>
          <div class="text-[11px] opacity-90 mt-1">${esc(n.message)}</div>
        </div>
      `).join('');

      // Marca como vistas e zera o contador do sino
      const latest = items.reduce((m, n) => String(n.time) > m ? String(n.time) : m, '');
      localStorage.setItem('notif_seen_' + user.id, latest);
      const badge = document.getElementById('notif-badge');
      if (badge) badge.style.display = 'none';
    } catch (e) {
      list.innerHTML = `<div class="text-center text-xs text-red-500 py-6">Erro ao carregar notificações.</div>`;
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
      const history = dataHistory.history || [];
      const sTier = dataHistory.seller_tier || {
        tier_name: 'Vendedor Semente',
        rate_formatted: '0,30 pts / R$',
        sales_count: 0,
        progress_percent: 0,
        sales_to_next_tier: 5,
        next_tier_name: 'Vendedor Broto',
        next_tier_bonus: 100,
        total_seller_points: 0
      };

      let levelName = 'Iniciante';
      if (points >= 3000) levelName = 'Eco Master';
      else if (points >= 1500) levelName = 'Eco Warrior';
      else if (points >= 500) levelName = 'Sustentável';

      container.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
          <!-- BANNER PRINCIPAL DE PONTOS -->
          <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-teal-700 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between shadow-xl gap-6">
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="bg-white/20 px-3 py-1 rounded-full text-xs font-bold">Nível Geral: ${levelName}</span>
                <span class="bg-emerald-400/20 text-emerald-100 border border-emerald-300/30 px-3 py-1 rounded-full text-xs font-bold">Vendedor: ${sTier.tier_name}</span>
              </div>
              <div class="text-4xl sm:text-5xl font-extrabold flex items-center gap-2.5">
                <span>${points} Pontos Verdes</span>
                <i data-lucide="sprout" class="w-10 h-10 inline text-emerald-300 pointer-events-none"></i>
              </div>
              <div class="text-xs text-emerald-100 mt-2 max-w-lg leading-relaxed">
                Participe da economia circular! Ganhe pontos comprando, vendendo produtos sustentáveis e avaliando compras. Troque seus pontos por cupons reais de desconto.
              </div>
            </div>
            <div class="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto">
              <button type="button" onclick="App.navigateTo('search')" class="bg-white text-emerald-800 font-bold px-5 py-2.5 rounded-full text-sm hover:bg-emerald-50 transition shadow text-center cursor-pointer">
                Comprar & Ganhar Pontos
              </button>
              <button type="button" onclick="App.navigateTo('seller')" class="bg-emerald-800/80 hover:bg-emerald-900 text-white font-bold px-5 py-2.5 rounded-full text-sm transition shadow text-center border border-emerald-400/30 cursor-pointer">
                Painel do Vendedor
              </button>
            </div>
          </div>

          <!-- CARD DE INCENTIVOS DO VENDEDOR -->
          <div class="p-6 rounded-3xl border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/20 shadow-sm space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center flex-shrink-0">
                    <i data-lucide="store" class="w-5 h-5"></i>
                  </div>
                  <h3 class="font-bold text-base text-teal-950 dark:text-teal-200">Programa de Incentivo ao Vendedor Sustentável</h3>
                </div>
                <p class="text-xs text-teal-700 dark:text-teal-400 mt-1">
                  Vender no Re-Store também gera pontos! Conforme você realiza vendas na plataforma, sua taxa de bonificação aumenta e você conquista bônus exclusivos.
                </p>
              </div>
              <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border dark:border-gray-700 text-center sm:text-right shrink-0">
                <div class="text-[11px] text-gray-500 dark:text-gray-400">Pontos Ganhos com Vendas</div>
                <div class="text-xl font-extrabold text-emerald-600">+${sTier.total_seller_points} pts</div>
              </div>
            </div>

            <!-- GRADE DE STATUS DO VENDEDOR -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border dark:border-gray-700">
                <div class="text-[11px] text-gray-400">Nível de Vendedor</div>
                <div class="text-sm font-bold text-teal-700 dark:text-teal-300 mt-0.5">${sTier.tier_name}</div>
              </div>
              <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border dark:border-gray-700">
                <div class="text-[11px] text-gray-400">Taxa por Venda</div>
                <div class="text-sm font-bold text-emerald-600 mt-0.5">${sTier.rate_formatted}</div>
              </div>
              <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border dark:border-gray-700">
                <div class="text-[11px] text-gray-400">Vendas Confirmadas</div>
                <div class="text-sm font-bold text-gray-900 dark:text-white mt-0.5">${sTier.sales_count} pedido(s)</div>
              </div>
              <div class="bg-white dark:bg-gray-800 p-3 rounded-2xl border dark:border-gray-700">
                <div class="text-[11px] text-gray-400">Próximo Nível</div>
                <div class="text-sm font-bold text-purple-600 dark:text-purple-400 mt-0.5">${sTier.next_tier_name || 'Nível Máximo'}</div>
              </div>
            </div>

            <!-- BARRA DE PROGRESSO DO VENDEDOR -->
            <div class="bg-white dark:bg-gray-800 p-4 rounded-2xl border dark:border-gray-700 space-y-2">
              <div class="flex justify-between items-center text-xs font-semibold">
                <span class="text-gray-700 dark:text-gray-300">Progresso para o próximo Marco de Vendas</span>
                <span class="text-teal-600 font-bold">${sTier.sales_to_next_tier > 0 ? `Faltam ${sTier.sales_to_next_tier} venda(s)` : 'Meta Máxima Atingida'}</span>
              </div>
              <div class="w-full bg-gray-100 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                <div class="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-500" style="width: ${sTier.progress_percent}%"></div>
              </div>
              ${sTier.next_tier_bonus > 0 ? `
                <div class="text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
                  <span>Próximo nível: <strong>${sTier.next_tier_name}</strong></span>
                  <span class="text-emerald-600 font-bold">Bônus de Incentivo: +${sTier.next_tier_bonus} Pontos</span>
                </div>
              ` : `
                <div class="text-[11px] text-emerald-600 font-semibold">
                  Você atingiu o nível mais alto de vendedor sustentável! Obrigado pelo grande impacto positivo na comunidade Re-Store.
                </div>
              `}
            </div>
          </div>

          <!-- REGRAS DA ECONOMIA JUSTA DE PONTOS -->
          <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm space-y-4">
            <h2 class="text-lg font-bold flex items-center gap-2">
              <i data-lucide="scale" class="w-5 h-5 text-teal-600"></i>
              <span>Como Funciona o Sistema de Pontos Justo</span>
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mb-2">
                  <i data-lucide="shopping-bag" class="w-5 h-5"></i>
                </div>
                <div class="font-bold text-xs text-emerald-900 dark:text-emerald-200">Comprando</div>
                <div class="text-sm font-extrabold text-emerald-600 mt-1">1 pt / R$ 1,00</div>
                <p class="text-[11px] text-emerald-800/80 dark:text-emerald-400 mt-1">A cada R$ 1,00 gasto em compras ecológicas você ganha 1 Ponto Verde direto.</p>
              </div>

              <div class="p-4 rounded-2xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800">
                <div class="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-300 flex items-center justify-center mb-2">
                  <i data-lucide="store" class="w-5 h-5"></i>
                </div>
                <div class="font-bold text-xs text-teal-900 dark:text-teal-200">Vendendo</div>
                <div class="text-sm font-extrabold text-teal-600 mt-1">0,30 a 0,60 pts / R$</div>
                <p class="text-[11px] text-teal-800/80 dark:text-teal-400 mt-1">Bônus por venda escalonado por nível + bonificações de até +300 pts nos marcos.</p>
              </div>

              <div class="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-2">
                  <i data-lucide="star" class="w-5 h-5"></i>
                </div>
                <div class="font-bold text-xs text-blue-900 dark:text-blue-200">Avaliando</div>
                <div class="text-sm font-extrabold text-blue-600 mt-1">+30 Pontos Verdes</div>
                <p class="text-[11px] text-blue-800/80 dark:text-blue-400 mt-1">Deixe sua opinião sincera sobre itens recebidos para ajudar a comunidade.</p>
              </div>

              <div class="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
                <div class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center mb-2">
                  <i data-lucide="gift" class="w-5 h-5"></i>
                </div>
                <div class="font-bold text-xs text-purple-900 dark:text-purple-200">Boas-Vindas</div>
                <div class="text-sm font-extrabold text-purple-600 mt-1">+150 Pontos Verdes</div>
                <p class="text-[11px] text-purple-800/80 dark:text-purple-400 mt-1">Pontos iniciais liberados ao confirmar e validar sua conta de e-mail.</p>
              </div>
            </div>
          </div>

          <!-- RESGATE DE CUPONS DE DESCONTO -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-bold">Resgatar Cupons de Desconto</h2>
              <span class="text-xs text-gray-500">Seu saldo: <strong>${points} pts</strong></span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              ${[
                { type: '5%', name: '5% de Desconto', cost: 150, desc: 'Ideal para suas compras do dia a dia.' },
                { type: 'free_shipping', name: 'Frete Grátis Ecológico', cost: 250, desc: 'Entrega 100% gratuita no seu pedido.' },
                { type: '10%', name: '10% de Desconto', cost: 300, desc: 'Excelente economia em produtos circulares.' },
                { type: '15%', name: '15% de Desconto', cost: 500, desc: 'Desconto expressivo para pedidos maiores.' },
                { type: '20%', name: '20% de Desconto', cost: 800, desc: 'Super economia para membros engajados.' }
              ].map(c => `
                <div class="p-4 rounded-2xl border dark:border-gray-800 bg-white dark:bg-gray-800 flex flex-col justify-between shadow-sm">
                  <div>
                    <div class="text-2xl font-black text-teal-600 mb-1">${c.type === 'free_shipping' ? '<i data-lucide="truck" class="w-8 h-8 text-teal-600 inline"></i>' : c.type}</div>
                    <div class="font-bold text-sm text-gray-900 dark:text-white">${c.name}</div>
                    <div class="text-[11px] text-gray-400 mt-1 leading-snug">${c.desc}</div>
                    <div class="text-xs font-semibold text-teal-700 dark:text-teal-400 mt-2">Custo: ${c.cost} Pontos</div>
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
              <h2 class="text-xl font-bold">Meus Cupons Resgatados</h2>
              <span class="text-xs text-gray-400">${discounts.length} cupom(ns) resgatado(s)</span>
            </div>

            ${discounts.length > 0 ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                ${discounts.map(d => {
                  const isUsed = parseInt(d.is_used) === 1;
                  return `
                    <div class="p-4 rounded-2xl border ${isUsed ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 opacity-60' : 'border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30'} flex flex-col justify-between">
                      <div>
                        <div class="flex items-center justify-between mb-2">
                          <span class="font-extrabold text-sm ${isUsed ? 'text-gray-500' : 'text-teal-600 dark:text-teal-400'} inline-flex items-center gap-1">${d.discount_type === 'free_shipping' ? '<i data-lucide="truck" class="w-4 h-4 inline"></i> Frete Grátis' : `${d.discount_type} OFF`}</span>
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
                Você ainda não resgatou nenhum cupom. Use seus pontos acumulados para resgatar descontos exclusivos acima!
              </div>
            `}
          </div>

          <!-- SEÇÃO EXTRATO DE MOVIMENTAÇÕES DE PONTOS -->
          <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-xl font-bold flex items-center gap-2">
                  <i data-lucide="history" class="w-5 h-5 text-teal-600"></i>
                  <span>Extrato de Movimentações</span>
                </h2>
                <p class="text-xs text-gray-500 mt-0.5">Histórico completo de entradas e saídas de Pontos Verdes da sua conta.</p>
              </div>
              <span class="text-xs text-gray-400 font-semibold">${history.length} transação(ões)</span>
            </div>

            ${history.length > 0 ? `
              <div class="divide-y dark:divide-gray-800">
                ${history.map(h => {
                  const pts = parseInt(h.points);
                  const isPositive = pts > 0;
                  let typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">Outro</span>';
                  
                  if (h.type === 'purchase') {
                    typeBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><i data-lucide="shopping-bag" class="w-3 h-3"></i> Compra / Bônus</span>';
                  } else if (h.type === 'sale') {
                    typeBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"><i data-lucide="store" class="w-3 h-3"></i> Venda Realizada</span>';
                  } else if (h.type === 'review') {
                    typeBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"><i data-lucide="star" class="w-3 h-3"></i> Avaliação</span>';
                  } else if (h.type === 'redemption') {
                    typeBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"><i data-lucide="ticket" class="w-3 h-3"></i> Resgate Cupom</span>';
                  } else if (h.type === 'reversal' || h.type === 'sale_reversal') {
                    typeBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"><i data-lucide="rotate-ccw" class="w-3 h-3"></i> Estorno</span>';
                  }

                  const dateFormatted = DateHelper.formatDateTime(h.created_at);

                  return `
                    <div class="py-3.5 flex items-center justify-between gap-4">
                      <div class="space-y-1">
                        <div class="flex items-center gap-2">
                          ${typeBadge}
                          <span class="text-xs text-gray-400">${dateFormatted}</span>
                        </div>
                        <div class="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          ${this.escapeHtml(h.description || 'Movimentação de pontos')}
                        </div>
                      </div>
                      <div class="text-right shrink-0">
                        <span class="text-sm font-extrabold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">
                          ${isPositive ? `+${pts}` : pts} pts
                        </span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="text-center py-8 text-gray-400 text-xs">
                Nenhuma movimentação de pontos registrada ainda. Comece a comprar ou vender para movimentar seu extrato!
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

    const confirmed = await ModalDialog.confirm({
      title: 'Resgatar Recompensa',
      message: 'Deseja utilizar seus Pontos Verdes acumulados para resgatar este cupom de benefício?',
      confirmText: 'Confirmar Resgate',
      cancelText: 'Cancelar',
      type: 'success'
    });
    if (!confirmed) return;

    this.isRedeemingCoupon = true;
    let originalText = '';
    if (btnElement) {
      originalText = btnElement.innerText;
      btnElement.disabled = true;
      btnElement.innerText = 'Resgatando...';
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
              <div class="text-xs text-gray-500">${user.email} • ${user.city || 'São Paulo'}, ${user.state || 'SP'}${user.created_at ? ' • Membro desde ' + DateHelper.formatDate(user.created_at) : ''}</div>
              <div class="mt-2 flex items-center gap-2">
                <span class="badge-points inline-flex items-center gap-1.5"><i data-lucide="sprout" class="w-3.5 h-3.5"></i> ${user.points} Pontos Verdes</span>
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

    container.innerHTML = `<div class="max-w-4xl mx-auto text-center py-12"><div class="skeleton-box h-32 w-full rounded-2xl"></div></div>`;

    try {
      const res = await fetch(`api/reviews.php?action=list&user_id=${user.id}`);
      const data = await res.json();
      const reviews = data.reviews || [];

      container.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6 animate-fade-in">
          <div class="flex items-center justify-between border-b dark:border-gray-800 pb-4">
            <div>
              <h1 class="text-2xl font-extrabold flex items-center gap-2">
                <span>Minhas Avaliações</span>
                <span>⭐</span>
              </h1>
              <p class="text-xs text-gray-500 mt-1">Gerencie seus feedbacks, fotos enviadas e avaliações de produtos comprados.</p>
            </div>
            <span class="text-xs font-bold text-teal-600 bg-teal-50 dark:bg-teal-950 px-3 py-1.5 rounded-full border border-teal-200 dark:border-teal-800">
              ${reviews.length} avaliação(ões)
            </span>
          </div>

          ${reviews.length > 0 ? `
            <div class="space-y-4">
              ${reviews.map(r => `
                <div id="review-card-${r.id}" class="p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm space-y-3">
                  <!-- MODO DE EXIBIÇÃO -->
                  <div class="review-display space-y-3">
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b dark:border-gray-700 pb-3">
                      <div class="flex items-center gap-3">
                        <img src="${r.product_image || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=100'}" onclick="App.navigateTo('product-detail', { productId: ${r.product_id}, id: ${r.product_id} })" class="w-12 h-12 rounded-xl object-cover border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-85 transition" title="Ver detalhes do produto">
                        <div>
                          <button type="button" onclick="App.navigateTo('product-detail', { productId: ${r.product_id}, id: ${r.product_id} })" class="font-bold text-sm text-gray-900 dark:text-white hover:text-teal-600 text-left cursor-pointer transition">
                            ${r.product_name}
                          </button>
                          <div class="flex items-center gap-2 mt-0.5">
                            <span class="text-amber-400 text-xs font-bold">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                            <span class="text-[11px] text-gray-400" title="${DateHelper.formatDateTime(r.created_at)}">• ${DateHelper.formatDateTime(r.created_at) || 'Recente'}</span>
                            <span class="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.2 rounded-full font-bold">✓ Compra Verificada</span>
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-2">
                        <button type="button" onclick="App.toggleEditReview(${r.id})" class="btn-outline text-xs py-1.5 px-3 flex items-center gap-1 cursor-pointer font-semibold">
                          <i data-lucide="pencil" class="w-3.5 h-3.5 pointer-events-none"></i>
                          <span>Editar</span>
                        </button>
                        <button type="button" onclick="App.deleteReview(${r.id})" class="text-xs text-red-500 hover:text-red-700 hover:underline px-2 py-1.5 cursor-pointer font-semibold flex items-center gap-1">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i>
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>

                    <p class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">${r.comment || 'Sem comentário por escrito.'}</p>

                    <!-- FOTOS ANEXADAS -->
                    ${r.images && r.images.length > 0 ? `
                      <div class="flex flex-wrap gap-2 pt-1">
                        ${r.images.map(img => `
                          <div class="w-16 h-16 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 hover:scale-105 transition shadow-sm" onclick="App.openImageModal('${img.image_url}', 'Foto da sua avaliação: ${r.product_name}')">
                            <img src="${img.image_url}" class="w-full h-full object-cover" alt="Foto">
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>

                  <!-- FORMULÁRIO DE EDIÇÃO INLINE -->
                  <form class="review-edit-form hidden flex-col gap-3 w-full pt-1" onsubmit="event.preventDefault(); App.submitReviewEdit(${r.id}, this);">
                    <div class="flex items-center justify-between border-b dark:border-gray-700 pb-2">
                      <span class="text-xs font-bold text-teal-800 dark:text-teal-200">Editar Avaliação</span>
                      <div class="flex items-center gap-2">
                        <label class="text-xs text-gray-500 font-semibold">Nota:</label>
                        <select name="rating" class="p-1 text-xs border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-amber-500 font-bold rounded-lg">
                          <option value="5" ${r.rating == 5 ? 'selected' : ''}>★★★★★ (5)</option>
                          <option value="4" ${r.rating == 4 ? 'selected' : ''}>★★★★☆ (4)</option>
                          <option value="3" ${r.rating == 3 ? 'selected' : ''}>★★★☆☆ (3)</option>
                          <option value="2" ${r.rating == 2 ? 'selected' : ''}>★★☆☆☆ (2)</option>
                          <option value="1" ${r.rating == 1 ? 'selected' : ''}>★☆☆☆☆ (1)</option>
                        </select>
                      </div>
                    </div>

                    <textarea 
                      name="comment" 
                      rows="3" 
                      class="w-full p-2.5 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      required
                    >${r.comment || ''}</textarea>

                    <!-- Gestão de Fotos Existentes -->
                    ${r.images && r.images.length > 0 ? `
                      <div class="space-y-1">
                        <label class="text-[10px] text-gray-500 font-semibold">Fotos anexadas (clique no ✕ para remover):</label>
                        <div class="flex flex-wrap gap-2">
                          ${r.images.map(img => `
                            <div class="review-existing-thumb relative group w-14 h-14 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 flex-shrink-0">
                              <img src="${img.image_url}" class="w-full h-full object-cover">
                              <button type="button" onclick="App.markReviewImageForDeletion(${img.id}, this, this.closest('form'))" class="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl font-bold cursor-pointer" title="Remover foto">✕</button>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    ` : ''}

                    <!-- Adicionar Mais Fotos -->
                    <div>
                      <label class="text-[10px] text-gray-500 font-semibold block mb-0.5">Adicionar mais fotos (máx. 3 no total):</label>
                      <input 
                        type="file" 
                        name="photos[]" 
                        multiple 
                        accept="image/*" 
                        onchange="App.previewReviewPhotos(this, 'edit-review-my-photos-${r.id}', ${(r.images || []).length})" 
                        class="text-xs file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:bg-teal-50 file:text-teal-700 dark:file:bg-teal-900 dark:file:text-teal-200 cursor-pointer"
                      >
                      <div id="edit-review-my-photos-${r.id}" class="flex gap-2 mt-1 overflow-x-auto"></div>
                    </div>

                    <div class="flex justify-end gap-2 pt-2 border-t dark:border-gray-700">
                      <button 
                        type="button" 
                        onclick="App.toggleEditReview(${r.id})" 
                        class="px-3 py-1.5 text-xs border rounded-lg text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit" 
                        class="btn-primary px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  </form>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="text-center py-16 bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-3">
              <div class="text-5xl">⭐</div>
              <h2 class="text-base font-bold text-gray-900 dark:text-white">Você ainda não avaliou nenhum produto</h2>
              <p class="text-xs text-gray-500 max-w-sm mx-auto">Após receber produtos comprados no Re-Store, você pode avaliá-los para ajudar a comunidade ecológica e ganhar Pontos Verdes!</p>
              <div class="pt-2">
                <button type="button" onclick="App.navigateTo('orders')" class="btn-primary text-xs py-2 px-4 cursor-pointer font-bold">
                  Ver Meus Pedidos
                </button>
              </div>
            </div>
          `}
        </div>
      `;

      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } catch (e) {
      console.error(e);
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
      const recentSales = metricsData.recent_sales || [];
      const sTier = metricsData.seller_tier || {
        tier_name: 'Vendedor Semente',
        rate_formatted: '0,30 pts / R$',
        sales_count: 0,
        progress_percent: 0,
        sales_to_next_tier: 5,
        next_tier_name: 'Vendedor Broto',
        next_tier_bonus: 100,
        total_seller_points: 0
      };

      container.innerHTML = `
        <div class="space-y-8 animate-fade-in">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-extrabold">Painel da Área do Vendedor</h1>
              <p class="text-xs text-gray-500 mt-1">Gerencie seu catálogo sustentável, monitore vendas e acompanhe suas recompensas.</p>
            </div>
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

          <!-- CARD DE GAMIFICAÇÃO & NÍVEL DO VENDEDOR -->
          <div class="p-6 rounded-3xl bg-gradient-to-r from-teal-800 via-teal-900 to-emerald-900 text-white shadow-xl space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-2">
                  <span class="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Gamificação de Vendas
                  </span>
                  <span class="bg-emerald-400/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full border border-emerald-400/30">
                    ${sTier.tier_name}
                  </span>
                </div>
                <h2 class="text-2xl font-black mt-2">Bônus Atual: ${sTier.rate_formatted}</h2>
                <p class="text-xs text-teal-200 mt-1 max-w-lg leading-relaxed">
                  A cada produto vendido você ganha Pontos Verdes diretamente na sua conta, incentivando a economia circular e aumentando seu prestígio na comunidade!
                </p>
              </div>
              <div class="bg-white/10 backdrop-blur p-4 rounded-2xl border border-white/20 text-center sm:text-right shrink-0">
                <div class="text-[11px] text-teal-200 uppercase tracking-wider font-bold">Pontos Acumulados em Vendas</div>
                <div class="text-3xl font-black text-emerald-300 mt-0.5">+${sTier.total_seller_points} pts</div>
                <button type="button" onclick="App.navigateTo('points')" class="mt-2 text-xs font-bold text-white hover:text-emerald-200 underline cursor-pointer inline-flex items-center gap-1">
                  <span>Ver Extrato de Pontos</span> →
                </button>
              </div>
            </div>

            <!-- BARRA DE PROGRESSO DO VENDEDOR -->
            <div class="bg-black/30 p-4 rounded-2xl border border-white/10 space-y-2">
              <div class="flex justify-between items-center text-xs font-semibold">
                <span class="text-teal-100">Progresso para o próximo nível de vendedor</span>
                <span class="text-emerald-300 font-bold">${sTier.sales_to_next_tier > 0 ? `Faltam ${sTier.sales_to_next_tier} venda(s) para ${sTier.next_tier_name}` : 'Nível Máximo Atingido'}</span>
              </div>
              <div class="w-full bg-white/20 h-2.5 rounded-full overflow-hidden">
                <div class="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500" style="width: ${sTier.progress_percent}%"></div>
              </div>
              ${sTier.next_tier_bonus > 0 ? `
                <div class="text-[11px] text-teal-200 flex items-center justify-between">
                  <span>Próximo Marco: <strong>${sTier.next_tier_name}</strong></span>
                  <span class="text-emerald-300 font-bold">Bônus de Incentivo: +${sTier.next_tier_bonus} Pontos</span>
                </div>
              ` : `
                <div class="text-[11px] text-emerald-300 font-medium">
                  Parabéns! Você alcançou o nível mais alto de vendedor sustentável (Eco Master Seller).
                </div>
              `}
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

          <!-- ÚLTIMAS VENDAS REALIZADAS COM HORÁRIO SINCRONIZADO -->
          <div class="p-6 rounded-3xl border dark:border-gray-800 bg-white dark:bg-gray-800 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-lg font-bold flex items-center gap-2">
                  <i data-lucide="receipt" class="w-5 h-5 text-teal-600"></i>
                  <span>Últimas Vendas Realizadas</span>
                </h2>
                <p class="text-xs text-gray-500 mt-0.5">Histórico recente de pedidos com horário sincronizado em tempo real com o seu dispositivo.</p>
              </div>
              <span class="text-xs text-teal-600 font-bold bg-teal-50 dark:bg-teal-950/60 px-3 py-1 rounded-full border border-teal-200 dark:border-teal-800">
                ${recentSales.length} registro(s)
              </span>
            </div>

            ${recentSales.length > 0 ? `
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b dark:border-gray-700 text-gray-500 uppercase tracking-wider text-[10px]">
                      <th class="py-2.5 font-bold">Pedido</th>
                      <th class="py-2.5 font-bold">Produto</th>
                      <th class="py-2.5 font-bold">Comprador</th>
                      <th class="py-2.5 font-bold">Valor</th>
                      <th class="py-2.5 font-bold text-right">Data & Horário Local</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y dark:divide-gray-700/60 font-medium">
                    ${recentSales.map(s => `
                      <tr class="hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition">
                        <td class="py-3 font-bold text-teal-600">#${this.escapeHtml(s.order_number)}</td>
                        <td class="py-3 text-gray-900 dark:text-white">${this.escapeHtml(s.product_name)} <span class="text-gray-400">(${s.quantity}x)</span></td>
                        <td class="py-3 text-gray-600 dark:text-gray-300">${this.escapeHtml(s.buyer_name || 'Comprador')}</td>
                        <td class="py-3 font-bold text-emerald-600">R$ ${parseFloat(s.price * s.quantity).toFixed(2).replace('.', ',')}</td>
                        <td class="py-3 text-right text-gray-500 dark:text-gray-400" title="${DateHelper.formatDateTime(s.order_date)}">
                          <span class="inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-300">
                            <i data-lucide="clock" class="w-3.5 h-3.5 text-teal-600 inline"></i>
                            ${DateHelper.formatDateTime(s.order_date)}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
                Nenhuma venda registrada até o momento. As novas vendas aparecerão aqui com data e horário em tempo real.
              </div>
            `}
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
                            ? `<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><i data-lucide="alert-triangle" class="w-3 h-3 inline"></i> Estoque baixo: ${p.stock} un.</span>`
                            : `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Estoque: ${p.stock} un.</span>`)}
                      </div>
                      <div class="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3 text-teal-600"></i> ${p.location || 'Local não informado'}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button type="button" onclick="App.navigateTo('edit-product', { productId: ${p.id} })" title="Editar Anúncio" class="text-teal-600 hover:text-teal-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 p-2 rounded-lg cursor-pointer transition">
                      <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button type="button" onclick="App.deleteProductSeller(${p.id})" title="Excluir Anúncio" class="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 p-2 rounded-lg cursor-pointer transition">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
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

  async deleteProductSeller(productId) {
    const confirmed = await ModalDialog.confirm({
      title: 'Excluir Anúncio',
      message: 'Tem certeza de que deseja excluir este anúncio? O produto sairá do catálogo do marketplace e a ação não poderá ser desfeita.',
      confirmText: 'Sim, Excluir Anúncio',
      cancelText: 'Cancelar',
      type: 'danger',
      icon: 'trash'
    });
    if (!confirmed) return;

    const res = await SellerManager.deleteProduct(productId);
    if (res.success) {
      ToastManager.show('Anúncio excluído com sucesso.', 'info');
      this.renderSellerScreen(document.getElementById('main-content'));
    } else {
      ModalDialog.alert({
        title: 'Erro ao Excluir Anúncio',
        message: res.error || 'Não foi possível excluir o anúncio.',
        type: 'danger'
      });
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
            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Local de Venda (Município, UF) *</label>
            <div id="add-prod-location-wrapper"></div>
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

    // Inicialização da Seleção em Lista Pré-determinada de Municípios/UF
    const defaultUserLoc = ((AuthManager.currentUser && AuthManager.currentUser.city)
      ? AuthManager.currentUser.city + (AuthManager.currentUser.state ? ', ' + AuthManager.currentUser.state : '')
      : 'São Paulo, SP');

    if (window.LocationPicker) {
      window.LocationPicker.mount({
        containerId: 'add-prod-location-wrapper',
        hiddenInputId: 'prod-location',
        initialValue: defaultUserLoc,
        placeholder: 'Digite para buscar município ou selecione na lista...',
        required: true
      });
    }

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
      <span class="inline-flex items-center gap-1.5"><i data-lucide="camera" class="w-3.5 h-3.5 text-teal-600 dark:text-teal-400"></i> ${this.selectedProductImages.length}/5 foto(s) selecionada(s)</span>
      <span class="text-[10px] text-gray-400 font-normal">A foto #1 será a capa</span>
    `;

    previewContainer.appendChild(header);

    // IMPORTANTE: renderizar os ícones adicionados dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

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
    const location = document.getElementById('prod-location') ? document.getElementById('prod-location').value.trim() : '';
    const description = document.getElementById('prod-desc').value.trim();

    if (!name || !description || isNaN(price) || price <= 0 || !category) {
      ToastManager.show('Por favor, preencha todos os campos obrigatórios do produto.', 'error');
      return;
    }

    if (!location || (window.LocationPicker && !window.LocationPicker.isValid(location))) {
      ToastManager.show('Por favor, selecione um município/UF válido da lista pré-determinada.', 'error');
      const searchInput = document.querySelector('#add-prod-location-wrapper input[type="text"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
              <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Local de Venda (Município, UF) *</label>
              <div id="edit-prod-location-wrapper"></div>
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

      // Inicialização da Seleção em Lista Pré-determinada de Municípios/UF
      if (window.LocationPicker) {
        window.LocationPicker.mount({
          containerId: 'edit-prod-location-wrapper',
          hiddenInputId: 'edit-prod-location',
          initialValue: p.location || '',
          placeholder: 'Digite para buscar município ou selecione na lista...',
          required: true
        });
      }

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
    const location = document.getElementById('edit-prod-location') ? document.getElementById('edit-prod-location').value.trim() : '';
    const description = document.getElementById('edit-prod-desc').value.trim();

    if (!name || !description || isNaN(price) || price <= 0 || !category) {
      ToastManager.show('Preencha todos os campos obrigatórios do produto.', 'error');
      return;
    }

    if (!location || (window.LocationPicker && !window.LocationPicker.isValid(location))) {
      ToastManager.show('Por favor, selecione um município/UF válido da lista pré-determinada.', 'error');
      const searchInput = document.querySelector('#edit-prod-location-wrapper input[type="text"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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

  async openSupportChat(context = {}) {
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

        const initialMsg = context?.orderNumber 
          ? `Olá! Preciso de ajuda com o meu Pedido #${context.orderNumber}.` 
          : (context?.initialMessage || '');

        const chatParams = { 
          withUserId: supportId,
          orderNumber: context?.orderNumber || null,
          initialMessage: initialMsg
        };

        this.chatParams = chatParams;
        if (this.currentScreen !== 'chat') {
          this.navigateTo('chat', chatParams);
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
    return DateHelper.formatChatTime(dateStr);
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
    const prevParams = this.chatParams || {};
    this.chatParams = {
      ...prevParams,
      withUserId: partnerId,
      productId: productId !== null ? productId : (prevParams.withUserId === partnerId ? prevParams.productId : null)
    };
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

      <!-- CARD DE REFERÊNCIA AO PEDIDO EM SUPORTE (SE HOUVER) -->
      ${this.chatParams?.orderNumber ? `
        <div class="p-2.5 mx-4 mt-3 bg-teal-500/10 dark:bg-teal-950/50 border border-teal-500/30 rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-xs">
              <i data-lucide="package" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[10px] text-teal-700 dark:text-teal-300 font-bold uppercase tracking-wider">Atendimento sobre Pedido</div>
              <div class="font-bold text-xs text-gray-900 dark:text-white truncate">Referente ao Pedido #${this.escapeHtml(String(this.chatParams.orderNumber))}</div>
            </div>
          </div>
          <button type="button" onclick="App.navigateTo('orders')" class="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline px-2 py-1 shrink-0 cursor-pointer">
            Ver Pedidos →
          </button>
        </div>
      ` : ''}

      <!-- CORPO DE MENSAGENS COM CONTRASTE EQUILIBRADO NO MODO CLARO E ESCURO -->
      <div id="chat-msgs-body" class="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 min-h-0 w-full chat-body-bg bg-slate-50/70 dark:bg-gray-950/40">
        ${msgs.length === 0 ? `
          <div id="chat-empty-intro" class="text-center py-12 space-y-3 text-gray-400 dark:text-gray-500">
            <div class="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto shadow-sm">
              <i data-lucide="message-square" class="w-6 h-6"></i>
            </div>
            <div class="font-bold text-xs text-gray-700 dark:text-gray-300">Inicie uma conversa com ${this.escapeHtml(partner.name)}!</div>
            <div class="text-[11px] text-gray-500 dark:text-gray-400 max-w-xs mx-auto">Tire dúvidas sobre o produto, combine formas de entrega ou faça sua proposta.</div>
          </div>
        ` : ''}

        ${(() => {
          let lastDayKey = '';
          return msgs.map(m => {
            const d = DateHelper.parseServerDate(m.created_at);
            const dayKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '';
            let separatorHTML = '';
            if (dayKey && dayKey !== lastDayKey) {
              lastDayKey = dayKey;
              const headerTitle = DateHelper.formatChatDayHeader(d);
              separatorHTML = `
                <div class="flex items-center justify-center my-3 select-none chat-day-divider" data-day="${dayKey}">
                  <span class="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-200/90 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300/60 dark:border-gray-700/80 shadow-xs">
                    ${headerTitle}
                  </span>
                </div>
              `;
            }
            return separatorHTML + this.renderMessageBubbleHTML(m, currentUserId, partnerId);
          }).join('');
        })()}
      </div>

      <!-- SUGESTÕES RÁPIDAS -->
      <div class="px-4 py-2 border-t border-gray-200 dark:border-gray-800/80 bg-white dark:bg-gray-900 flex gap-2 overflow-x-auto no-scrollbar">
        ${(partner.name.toLowerCase().includes('suporte') || (partner.business_name && partner.business_name.toLowerCase().includes('suporte')) ? [
          ...(this.chatParams?.orderNumber ? [`Dúvida sobre o Pedido #${this.chatParams.orderNumber}`] : []),
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
          value="${this.escapeHtml(this.chatParams?.initialMessage || '')}"
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

    const chatInput = document.getElementById('chat-input-text');
    if (chatInput && this.chatParams?.initialMessage) {
      chatInput.focus();
      chatInput.select();
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
    const fullDateTime = DateHelper.formatDateTime(m.created_at);
    const bubbleId = `chat-msg-${m.id}`;

    return `
      <div id="${bubbleId}" class="flex w-full ${isMe ? 'justify-end' : 'justify-start'} group animate-fade-in" data-created-at="${this.escapeHtml(m.created_at || '')}">
        <div class="relative max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words overflow-hidden ${
          isMe 
            ? 'chat-bubble-me bg-teal-600 text-white rounded-br-sm' 
            : 'chat-bubble-other bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        }">
          <div class="break-words leading-relaxed whitespace-pre-wrap">${this.escapeHtml(m.message)}</div>
          <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] ${isMe ? 'text-teal-100' : 'text-gray-500 dark:text-gray-400'}">
            <span title="${fullDateTime}">${timeFormatted}</span>
            ${isMe ? `<span class="msg-status font-bold">${m.is_read ? '✓✓' : '✓'}</span>` : ''}
            ${isMe ? `
              <button 
                type="button" 
                onclick="App.deleteChatMessage(${m.id}, ${partnerId})" 
                title="Apagar mensagem" 
                class="msg-delete-btn opacity-0 group-hover:opacity-100 hover:text-red-300 ml-1 transition cursor-pointer p-0.5 inline-flex items-center"
              >
                <svg class="w-3 h-3 fill-none stroke-current" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
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

      const d = DateHelper.parseServerDate(m.created_at);
      const dayKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : '';
      if (dayKey) {
        const lastDivider = body.querySelector('.chat-day-divider:last-of-type');
        const lastDividerKey = lastDivider ? lastDivider.getAttribute('data-day') : '';
        if (lastDividerKey !== dayKey) {
          const divHeader = document.createElement('div');
          divHeader.className = 'flex items-center justify-center my-3 select-none chat-day-divider';
          divHeader.setAttribute('data-day', dayKey);
          divHeader.innerHTML = `
            <span class="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-200/90 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300/60 dark:border-gray-700/80 shadow-xs">
              ${DateHelper.formatChatDayHeader(d)}
            </span>
          `;
          body.appendChild(divHeader);
        }
      }

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
    if (this.chatParams) {
      this.chatParams.initialMessage = '';
    }
    input.focus();

    const intro = document.getElementById('chat-empty-intro');
    if (intro) intro.remove();

    const body = document.getElementById('chat-msgs-body');
    const tempId = 'temp_' + Date.now();
    const nowTime = DateHelper.formatChatTime(new Date());
    const fullNow = DateHelper.formatDateTime(new Date());

    // Inserção otimista instantânea na tela
    if (body) {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      const lastDivider = body.querySelector('.chat-day-divider:last-of-type');
      if (!lastDivider || lastDivider.getAttribute('data-day') !== todayKey) {
        const divHeader = document.createElement('div');
        divHeader.className = 'flex items-center justify-center my-3 select-none chat-day-divider';
        divHeader.setAttribute('data-day', todayKey);
        divHeader.innerHTML = `
          <span class="px-3 py-1 rounded-full text-[10px] font-bold bg-gray-200/90 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300/60 dark:border-gray-700/80 shadow-xs">
            Hoje
          </span>
        `;
        body.appendChild(divHeader);
      }

      const tempHolder = document.createElement('div');
      tempHolder.innerHTML = `
        <div id="chat-msg-${tempId}" class="flex w-full justify-end group animate-fade-in">
          <div class="relative max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl text-sm shadow-sm break-words overflow-hidden chat-bubble-me bg-teal-600 text-white rounded-br-sm">
            <div class="break-words leading-relaxed whitespace-pre-wrap">${this.escapeHtml(text)}</div>
            <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-teal-100">
              <span title="${fullNow}">${nowTime}</span>
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

          const timeSpan = tempEl.querySelector('.text-\\[10px\\] span:first-child');
          if (timeSpan && sent.created_at) {
            timeSpan.innerText = DateHelper.formatChatTime(sent.created_at);
            timeSpan.title = DateHelper.formatDateTime(sent.created_at);
          }

          const timeContainer = tempEl.querySelector('.text-\\[10px\\]');
          if (timeContainer) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.setAttribute('onclick', `App.deleteChatMessage(${sent.id}, ${partnerId})`);
            delBtn.title = 'Apagar mensagem';
            delBtn.className = 'msg-delete-btn opacity-0 group-hover:opacity-100 hover:text-red-300 ml-1 transition cursor-pointer p-0.5 inline-flex items-center';
            delBtn.innerHTML = '<svg class="w-3 h-3 fill-none stroke-current" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';
            timeContainer.appendChild(delBtn);
          }
        }

        this.refreshConversationsList(partnerId);
      } else {
        ToastManager.show(res.error || 'Não foi possível enviar a mensagem.', 'error');
        const tempEl = document.getElementById(`chat-msg-${tempId}`);
        if (tempEl) {
          const statusEl = tempEl.querySelector('.msg-status');
          if (statusEl) statusEl.innerHTML = '<span class="text-red-300 font-semibold">Falha no envio</span>';
        }
      }
    } catch (err) {
      console.error(err);
      ToastManager.show('Erro de conexão ao enviar mensagem.', 'error');
    }
  },

  async deleteChatMessage(msgId, partnerId) {
    const confirmed = await ModalDialog.confirm({
      title: 'Apagar Mensagem',
      message: 'Deseja realmente apagar esta mensagem enviada? Ela será removida da conversa.',
      confirmText: 'Sim, Apagar',
      cancelText: 'Cancelar',
      type: 'danger',
      icon: 'trash'
    });
    if (!confirmed) return;

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
      const time = c.last_message ? DateHelper.formatConversationTime(c.last_message.created_at) : '';
      const fullTime = c.last_message ? DateHelper.formatDateTime(c.last_message.created_at) : '';

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
              <span class="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 font-medium" title="${fullTime}">${time}</span>
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
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <i data-lucide="accessibility" class="w-5 h-5"></i>
            </div>
            <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white">Preferências de Acessibilidade</h1>
          </div>
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
            <div class="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <i data-lucide="help-circle" class="w-5 h-5"></i>
            </div>
            <div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">Central de Dúvidas / FAQ</h2>
              <p class="text-xs text-gray-500">Tudo o que você precisa saber sobre o Re-Store e a economia circular</p>
            </div>
          </div>

          <div class="space-y-3">
            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Como funcionam os Pontos Verdes e os Níveis?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <div class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed space-y-2">
                <p>O Re-Store adota um sistema justo, equilibrado e sustentável tanto para quem compra quanto para quem vende:</p>
                <ul class="list-disc pl-4 space-y-1">
                  <li><strong>Compradores:</strong> Ganham 1 Ponto Verde por cada R$ 1,00 gasto em compras ecológicas.</li>
                  <li><strong>Vendedores:</strong> Ganham bônus a cada produto vendido (de 0,30 a 0,60 pts por R$ 1,00 conforme o nível de vendedor: Semente, Broto, Florescer e Eco Master), além de incentivos de até +300 pts nos marcos de vendas!</li>
                  <li><strong>Avaliações:</strong> Ganham +30 Pontos Verdes ao deixar feedback detalhado de um produto recebido.</li>
                  <li><strong>Boas-Vindas:</strong> Ganham +150 Pontos Verdes de incentivo ao cadastrar e validar o e-mail.</li>
                </ul>
                <p>Seus pontos acumulados aumentam seu nível de sustentabilidade geral (Iniciante, Sustentável, Eco Warrior e Eco Master) e podem ser trocados por cupons de desconto reais na aba <em>"Extrato de Pontos"</em>.</p>
              </div>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Posso comprar produtos anunciados por mim mesmo?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                <strong>Não.</strong> Para garantir a integridade das avaliações, manter a transparência das métricas e prevenir fraudes no sistema de bonificação de pontos, nossa plataforma bloqueia tecnicamente qualquer tentativa de um vendedor comprar seus próprios anúncios.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Como resgatar e aplicar meus cupons de desconto?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Acesse a aba <strong>"Extrato de Pontos"</strong> no topo da página. Na seção de cupons, escolha o desconto desejado (5%, 10%, 15% ou Frete Grátis) e clique em <em>"Resgatar Cupom"</em>. Seus cupons resgatados aparecerão na seção <strong>"Meus Cupons Resgatados"</strong>. Na hora de finalizar a compra no Checkout, você poderá aplicar o cupom com apenas 1 clique ou digitando o código correspondente.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Como anunciar e vender produtos no Re-Store?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Clique em <strong>"Área Vendedor"</strong> no menu superior e selecione o botão <em>"Novo Anúncio"</em>. Preencha o nome do produto, categoria, preço, quantidade em estoque, condição (Novo, Usado ou Restaurado/Upcycled) e envie as fotos. Assim que publicado, o item fica imediatamente disponível para compra em todo o Brasil.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Quantas fotos posso colocar por produto?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                É obrigatório enviar pelo menos <strong>1 foto real</strong> do produto, sendo permitido anexar <strong>até 5 fotos</strong> por anúncio (formatos JPG, JPEG, PNG e WEBP). A primeira foto será a capa principal da vitrine, e as demais aparecerão em miniatura clicável na página de detalhes do produto.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Qual a diferença entre Pessoa Física (PF) e Empresa Verificada (PJ)?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Qualquer pessoa pode se cadastrar como <strong>Pessoa Física (PF)</strong> para comprar e desapegar de itens. Já as lojas, cooperativas ou artesãos podem optar por <strong>Empresa Sustentável Verificada (PJ)</strong> informando um CNPJ válido de 14 dígitos. Ao ser validado, o perfil recebe o selo <em>"CNPJ Verificado ✓"</em>, gerando maior autoridade perante os clientes. É possível alternar entre PF e PJ quando quiser na tela de edição de perfil.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Quais são os métodos de pagamento disponíveis?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Você pode pagar via <strong>PIX instantâneo</strong> (com QR Code dinâmico e código copia-e-cola), <strong>Cartão de Crédito</strong> (com opção de parcelamento em até 3x sem juros) ou <strong>Boleto Ecológico Digital</strong> (sem impressão ou desperdício de papel).
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Como falar com o vendedor antes de comprar?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Na página de qualquer produto, há um botão <em>"Chat"</em> junto ao perfil do anunciante. Clicando nele, abre-se uma conversa direta e privada em tempo real onde você pode tirar dúvidas sobre dimensões, estado de conservação, frete ou negociar propostas.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Como funciona a entrega e o frete dos produtos?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                O envio pode ser realizado via transportadora parceira com compensação de carbono (Frete Ecológico) ou combinado diretamente entre comprador e vendedor para retirada presencial caso ambos residam na mesma cidade/região.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Quais produtos se encaixam na proposta da Economia Circular?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
              </summary>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                Priorizamos itens usados em bom estado de uso, produtos restaurados (upcycling), artesanatos com reaproveitamento de materiais recicláveis, móveis reformados, eletrônicos revisados e utilidades reutilizáveis (como ecobags e garrafas térmicas inox), diminuindo a geração de lixo nos aterros sanitários.
              </p>
            </details>

            <details class="p-4 rounded-2xl border dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer group">
              <summary class="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
                <span>Como meus dados e senhas são protegidos?</span>
                <i data-lucide="chevron-down" class="w-4 h-4 text-teal-600 dark:text-teal-400 group-open:rotate-180 transition-transform"></i>
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
  openAuthModal(contentHtml) {
    let modal = document.getElementById('auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'auth-modal';
      modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-backdrop-in overscroll-contain select-none';
      
      // Fecha ao clicar no backdrop (fora do card)
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeAuthModal();
        }
      });

      // Impede propagação de rolagem e toques para a tela de trás
      modal.addEventListener('wheel', (e) => {
        if (e.target === modal) {
          e.preventDefault();
        }
      }, { passive: false });

      modal.addEventListener('touchmove', (e) => {
        if (e.target === modal) {
          e.preventDefault();
        }
      }, { passive: false });

      document.body.appendChild(modal);
    }

    // Trava de rolagem absoluta do fundo (body e html)
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');

    modal.innerHTML = contentHtml;

    // Garante que o card interno não propague o clique de fechar para o backdrop
    const card = modal.firstElementChild;
    if (card) {
      card.classList.add('select-auto');
      card.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      // Permite rolagem apenas dentro do próprio card se ele tiver overflow
      card.addEventListener('wheel', (e) => {
        e.stopPropagation();
      }, { passive: true });
      card.addEventListener('touchmove', (e) => {
        e.stopPropagation();
      }, { passive: true });
    }

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    return modal;
  },

  closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.remove();
    }
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  },

  showTutorialModal(step = 1) {
    const stepsContent = [
      {
        iconName: 'recycle',
        title: 'Passo 1: Bem-vindo ao Re-Store!',
        desc: 'O Re-Store é o marketplace de economia circular onde você pode comprar, vender e trocar produtos sustentáveis, reutilizáveis e artesanais.'
      },
      {
        iconName: 'sprout',
        title: 'Passo 2: Ganhe & Troque Pontos Verdes',
        desc: 'A cada compra ou cadastro você acumula Pontos Verdes. Troque seus pontos na aba "Recompensas" por cupons de até 15% OFF ou Frete Grátis!'
      },
      {
        iconName: 'credit-card',
        title: 'Passo 3: Checkout Rápido & PIX',
        desc: 'Compre de forma segura via PIX Copia-e-Cola com QR Code instantâneo, Cartão de Crédito parcelado ou Boleto Ecológico.'
      },
      {
        iconName: 'store',
        title: 'Passo 4: Anuncie Seus Produtos & Chat',
        desc: 'Crie seu perfil de vendedor para publicar itens parados na sua casa. Negocie detalhes e tire dúvidas pelo Chat em tempo real.'
      }
    ];

    const currentStep = stepsContent[step - 1];

    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative text-center animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="flex items-center gap-2 justify-center mb-6">
          ${[1, 2, 3, 4].map(s => `
            <div class="w-8 h-2 rounded-full ${s === step ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-700'}"></div>
          `).join('')}
        </div>

        <div class="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <i data-lucide="${currentStep.iconName}" class="w-8 h-8"></i>
        </div>
        <h2 class="text-xl font-extrabold mb-2 text-gray-900 dark:text-white">${currentStep.title}</h2>
        <p class="text-xs text-gray-600 dark:text-gray-300 mb-8 leading-relaxed max-w-xs mx-auto">${currentStep.desc}</p>

        <div class="flex gap-3">
          ${step > 1 ? `
            <button type="button" onclick="App.showTutorialModal(${step - 1})" class="btn-outline flex-1 py-2.5 text-xs cursor-pointer">Anterior</button>
          ` : ''}
          ${step < 4 ? `
            <button type="button" onclick="App.showTutorialModal(${step + 1})" class="btn-primary flex-1 py-2.5 text-xs cursor-pointer">Próximo Passo →</button>
          ` : `
            <button type="button" onclick="App.closeAuthModal(); ToastManager.show('Tutorial concluído! Bom proveito!', 'success');" class="btn-primary flex-1 py-2.5 text-xs cursor-pointer">Concluir Tutorial</button>
          `}
        </div>
      </div>
    `);
  },

  showLoginModal() {
    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <div class="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl mb-4 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
          <i data-lucide="shield-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"></i>
          <span>Proteção de dados com criptografia de ponta a ponta.</span>
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
          <summary class="font-bold cursor-pointer text-teal-600 flex items-center gap-1.5"><i data-lucide="sprout" class="w-3.5 h-3.5"></i> O que é o Sistema de Pontos Re-Store?</summary>
          <p class="mt-2 leading-relaxed">Ganhe pontos verdes a cada produto comprado, vendido ou avaliado. Troque por cupons de desconto exclusivos!</p>
        </details>

        <div class="mt-4 text-center text-xs text-gray-500">
          Não tem conta? <button type="button" onclick="App.showRegisterModal()" class="text-teal-600 font-bold hover:underline cursor-pointer">Cadastre-se e ganhe +150 pts</button>
        </div>
      </div>
    `);

    this.renderGoogleSignInButton('google-login-btn-container');

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

      this.closeAuthModal();

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

        this.closeAuthModal();

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
    const saved = preserveData || this.pendingRegistration || {};
    const nameVal = saved.name || '';
    const emailVal = saved.email || '';
    const phoneVal = saved.phone || '';
    const passVal = saved.pass || '';
    const roleVal = saved.selectedRole || this.selectedRole || 'buyer';
    const bizNameVal = saved.businessName || '';
    const cnpjVal = saved.cnpj || '';

    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative max-h-[90vh] overflow-y-auto animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <span class="inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-2"><i data-lucide="gift" class="w-3.5 h-3.5"></i> Bônus de 150 Pontos Verdes</span>
        <h2 class="text-2xl font-bold mb-1 text-gray-900 dark:text-white">Criar Nova Conta</h2>
        <p class="text-xs text-gray-500 mb-3">Preencha seus dados para validar seu e-mail e receber seus pontos.</p>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <button type="button" onclick="App.setRole('buyer')" id="role-btn-buyer" class="${roleVal === 'buyer' ? 'p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer' : 'p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer'}">
            <div class="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center mx-auto mb-1 pointer-events-none">
              <i data-lucide="shopping-bag" class="w-4 h-4"></i>
            </div>
            <div class="font-bold text-xs pointer-events-none">Comprador</div>
            <div class="text-[10px] text-gray-500 pointer-events-none">Compre e ganhe pontos</div>
          </button>
          <button type="button" onclick="App.setRole('seller')" id="role-btn-seller" class="${roleVal === 'seller' ? 'p-3 border-2 border-teal-500 bg-teal-50 dark:bg-teal-950/40 rounded-2xl text-center cursor-pointer' : 'p-3 border-2 border-gray-200 dark:border-gray-700 rounded-2xl text-center cursor-pointer'}">
            <div class="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center mx-auto mb-1 pointer-events-none">
              <i data-lucide="store" class="w-4 h-4"></i>
            </div>
            <div class="font-bold text-xs pointer-events-none">Vendedor</div>
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
            <div class="text-[10px] text-teal-700 dark:text-teal-400 mt-1 flex items-center gap-1.5 font-medium">
              <i data-lucide="mail" class="w-3.5 h-3.5 shrink-0"></i> <span>Enviaremos um código de 6 dígitos para validar este e-mail.</span>
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
    `);

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
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
        <span>Enviando código de verificação...</span>
      `;
    }

    try {
      const res = await AuthManager.sendRegisterCode(name, email);
      if (res.success) {
        ToastManager.show(res.message, 'success', 5000);
        this.renderRegisterVerifyStep(email);
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

  renderRegisterVerifyStep(email) {
    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

        <!-- Barra de Progresso do Cadastro -->
        <div class="flex items-center gap-2 mb-6">
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
          <div class="flex-1 h-2 bg-teal-600 rounded-full"></div>
        </div>

        <div class="text-center mb-5">
          <div class="w-14 h-14 bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <i data-lucide="mail-check" class="w-7 h-7"></i>
          </div>
          <span class="inline-flex items-center gap-1.5 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Validação Obrigatória
          </span>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Confirme seu E-mail</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
            Para ativar sua conta e liberar <strong>+150 Pontos Verdes</strong>, digite o código de 6 dígitos enviado para:
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
            Confirmar e Criar Conta
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
          <i data-lucide="info" class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"></i>
          <span>Dica: Caso não encontre em sua caixa de entrada, verifique também as pastas de <strong>Spam</strong> ou <strong>Lixo Eletrônico</strong>.</span>
        </div>
      </div>
    `);

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
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
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

        this.closeAuthModal();

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
          btn.innerHTML = 'Confirmar e Criar Conta';
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
        btn.innerHTML = 'Confirmar e Criar Conta';
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
    this.renderForgotStep1();
  },

  renderForgotStep1() {
    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

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
    `);
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
      this.renderForgotStep2();
    } else {
      ToastManager.show(data.error, 'error');
    }
  },

  renderForgotStep2() {
    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

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
    `);
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
      this.renderForgotStep3();
    } else {
      ToastManager.show(data.error, 'error');
    }
  },

  renderForgotStep3() {
    this.openAuthModal(`
      <div class="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative animate-modal-in">
        <button type="button" onclick="App.closeAuthModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer">✕</button>

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
    `);
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
            <h1 class="text-2xl font-extrabold flex items-center gap-2.5 text-gray-900 dark:text-white">
              <i data-lucide="heart" class="w-6 h-6 text-red-500 fill-red-500"></i>
              <span>Meus Produtos Favoritos</span>
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
            <div class="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 flex items-center justify-center mx-auto mb-4">
              <i data-lucide="heart" class="w-8 h-8"></i>
            </div>
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
        ToastManager.show('Produto adicionado aos Favoritos!', 'success');
      } else {
        this.favoriteIds = this.favoriteIds.filter(id => id !== productId);
        ToastManager.show('Produto removido dos Favoritos.', 'info');
      }

      if (btnElement) {
        btnElement.innerHTML = data.is_favorite 
          ? `<svg class="w-4 h-4 text-red-500 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
          : `<svg class="w-4 h-4 text-gray-400 stroke-current fill-none" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
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
              <label class="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-teal-600 dark:text-teal-400"></i> Localização / Região</label>
              <div class="flex gap-2">
                <input type="text" id="srch-location" placeholder="Cidade ou UF (ex: São Paulo)" value="${this.searchLocation}" class="flex-1 px-3 py-2 border rounded-xl dark:bg-gray-700 text-sm">
                <button type="button" onclick="App.simulateGeoLocation()" title="Detectar Minha Localização" class="px-3 py-2 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-xl text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900 transition flex items-center gap-1.5 cursor-pointer">
                  <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
                  <span>Detectar</span>
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t dark:border-gray-700">
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="font-bold text-gray-500 py-1">Atributos Ecológicos:</span>
              <label class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950 transition inline-flex items-center gap-1.5">
                <input type="checkbox" class="accent-teal-600"> <span class="font-medium text-xs">Reciclado</span>
              </label>
              <label class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950 transition inline-flex items-center gap-1.5">
                <input type="checkbox" class="accent-teal-600"> <span class="font-medium text-xs">Algodão Orgânico</span>
              </label>
              <label class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-950 transition inline-flex items-center gap-1.5">
                <input type="checkbox" class="accent-teal-600"> <span class="font-medium text-xs">Upcycled</span>
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
      ToastManager.show('Geolocalização detectada: São Paulo, SP', 'success');
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
    if (!grid) return;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.products && data.products.length > 0) {
        grid.innerHTML = data.products.map(p => this.renderProductCardHTML(p)).join('');
      } else {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">${data.error || 'Nenhum produto encontrado para estes filtros de localização e categoria.'}</div>`;
      }
    } catch (e) {
      console.error('Erro ao buscar produtos:', e);
      if (grid) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Erro ao carregar produtos.</div>`;
      }
    }
  },

  // UTILS
  async removeOwnCartItems() {
    const user = AuthManager.currentUser;
    if (!user) return;
    const confirmed = await ModalDialog.confirm({
      title: 'Remover Seus Produtos',
      message: 'Deseja remover do carrinho todos os produtos que foram anunciados por você?',
      confirmText: 'Remover Produtos',
      cancelText: 'Cancelar',
      type: 'warning'
    });
    if (!confirmed) return;
    const cart = CartManager.getCart();
    const filtered = cart.filter(item => parseInt(item.seller_id) !== parseInt(user.id));
    CartManager.saveCart(filtered);
    ToastManager.show('Produtos de sua autoria foram removidos do carrinho.', 'info');
    const main = document.getElementById('main-content');
    if (main && (this.currentScreen === 'cart' || this.currentScreen === 'checkout')) {
      this.renderCartScreen(main);
    }
  },

  addToCartDirect(productId, btnElement = null) {
    const user = AuthManager.currentUser;

    if (this.productsCache) {
      const p = this.productsCache.find(item => item.id === productId);
      if (p) {
        if (user && parseInt(user.id) === parseInt(p.seller_id)) {
          ToastManager.show('Você não pode comprar produtos anunciados por você mesmo!', 'warning');
          return;
        }
        if (btnElement) {
          const originalHTML = btnElement.innerHTML;
          btnElement.innerHTML = `<span class="inline-flex items-center gap-1"><svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg> Adicionado!</span>`;
          btnElement.classList.add('bg-emerald-600');
          setTimeout(() => {
            btnElement.innerHTML = originalHTML;
            btnElement.classList.remove('bg-emerald-600');
          }, 1500);
        }
        CartManager.addItem(p);
        ToastManager.show(`"${p.name}" adicionado ao carrinho!`, 'success');
        return;
      }
    }

    fetch(`api/products.php?action=detail&id=${productId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.product) {
          if (user && parseInt(user.id) === parseInt(data.product.seller_id)) {
            ToastManager.show('Você não pode comprar produtos anunciados por você mesmo!', 'warning');
            return;
          }
          if (btnElement) {
            const originalHTML = btnElement.innerHTML;
            btnElement.innerHTML = `<span class="inline-flex items-center gap-1"><svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg> Adicionado!</span>`;
            btnElement.classList.add('bg-emerald-600');
            setTimeout(() => {
              btnElement.innerHTML = originalHTML;
              btnElement.classList.remove('bg-emerald-600');
            }, 1500);
          }
          CartManager.addItem(data.product);
          ToastManager.show(`"${data.product.name}" adicionado ao carrinho!`, 'success');
        }
      });
  },

  async addToCartAndCheckout(productId) {
    const user = AuthManager.currentUser;
    let p = this.productsCache ? this.productsCache.find(item => item.id === productId) : null;
    if (!p) {
      try {
        const res = await fetch(`api/products.php?action=detail&id=${productId}`);
        const data = await res.json();
        if (data.success) p = data.product;
      } catch (e) {}
    }

    if (p && user && parseInt(user.id) === parseInt(p.seller_id)) {
      ToastManager.show('Você não pode comprar produtos anunciados por você mesmo!', 'warning');
      return;
    }

    if (p) {
      CartManager.addItem(p);
    } else {
      this.addToCartDirect(productId);
    }

    if (!user) {
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

  async removeCartItem(id) {
    const confirmed = await ModalDialog.confirm({
      title: 'Remover do Carrinho',
      message: 'Deseja remover este produto do seu carrinho de compras?',
      confirmText: 'Remover',
      cancelText: 'Manter no Carrinho',
      type: 'warning'
    });
    if (!confirmed) return;

    CartManager.removeItem(id);
    ToastManager.show('Item removido do carrinho.', 'info');
    this.renderCartScreen(document.getElementById('main-content'));
  },


  async cancelOrder(orderId) {
    const confirmed = await ModalDialog.confirm({
      title: 'Cancelar Pedido',
      message: 'Deseja realmente solicitar o cancelamento deste pedido? Se você utilizou um cupom de desconto, ele será reativado para a sua conta.',
      confirmText: 'Sim, Cancelar Pedido',
      cancelText: 'Voltar',
      type: 'warning'
    });
    if (!confirmed) return;

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
  },

  switchPaymentTab(tab) {
    document.getElementById('pay-box-pix').className = tab === 'pix' ? 'p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 text-center space-y-3' : 'hidden';
    document.getElementById('pay-box-credit').className = tab === 'credit' ? 'p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3' : 'hidden';
    document.getElementById('pay-box-boleto').className = tab === 'boleto' ? 'p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border dark:border-gray-600 space-y-3' : 'hidden';
  },

  async confirmLogout() {
    const confirmed = await ModalDialog.confirm({
      title: 'Encerrar Sessão',
      message: 'Deseja realmente sair da sua conta no Re-Store?',
      confirmText: 'Sim, Sair',
      cancelText: 'Permanecer Conectado',
      type: 'info',
      icon: 'logout'
    });
    if (!confirmed) return;

    await AuthManager.logout();
    ToastManager.show('Sessão encerrada com sucesso.', 'info');
    this.updateHeaderUI();
    this.navigateTo('home');
  },

  async confirmDeleteAccount() {
    const confirmed = await ModalDialog.confirm({
      title: 'Excluir Conta Permanentemente',
      message: 'ATENÇÃO: Esta ação é definitiva e irreversível! Todos os seus dados cadastrais, pedidos, anúncios e pontos verdes acumulados serão permanentemente apagados.',
      confirmText: 'Sim, Excluir Minha Conta',
      cancelText: 'Cancelar',
      type: 'danger',
      icon: 'trash'
    });
    if (!confirmed) return;

    try {
      const res = await fetch('api/auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_account' })
      });
      const data = await res.json();
      if (data.success) {
        ToastManager.show(data.message, 'info');
        AuthManager.currentUser = null;
        this.updateHeaderUI();
        this.navigateTo('home');
      } else {
        ToastManager.show(data.error, 'error');
      }
    } catch (e) {
      ToastManager.show('Erro ao processar exclusão de conta.', 'error');
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
          this.closeAuthModal();
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
