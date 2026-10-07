/* assets/js/toast.js - Sistema de Notificações Toast e Diálogos Pop-up Personalizados (Heurística de Nielsen #1 e #5) */

const ModalDialog = {
  currentModal: null,

  /**
   * Mostra um pop-up de confirmação personalizado moderno (substitui window.confirm).
   * Retorna uma Promise<boolean> que resolve true se confirmado, false se cancelado ou fechado.
   * @param {Object|string} options - Opções do modal ou texto da mensagem
   * @param {string} [options.title] - Título do pop-up
   * @param {string} [options.message] - Texto da mensagem
   * @param {string} [options.confirmText] - Texto do botão de confirmação (default: 'Confirmar')
   * @param {string} [options.cancelText] - Texto do botão de cancelamento (default: 'Cancelar')
   * @param {string} [options.type] - 'danger' | 'warning' | 'info' | 'success' (default: 'warning')
   * @param {string} [options.icon] - 'trash' | 'warning' | 'info' | 'success' | 'logout' (opcional)
   * @returns {Promise<boolean>}
   */
  confirm(options) {
    return this._showDialog(options, true);
  },

  /**
   * Mostra um pop-up de aviso/alerta personalizado moderno (substitui window.alert).
   * Retorna uma Promise<void> que resolve quando o usuário fecha o diálogo.
   * @param {Object|string} options - Opções do modal ou texto da mensagem
   * @returns {Promise<void>}
   */
  alert(options) {
    return this._showDialog(options, false);
  },

  _showDialog(options, isConfirm = false) {
    if (typeof options === 'string') {
      options = { message: options };
    }
    const {
      title = isConfirm ? 'Confirmação' : 'Aviso do Sistema',
      message = '',
      confirmText = isConfirm ? 'Confirmar' : 'Entendido',
      cancelText = 'Cancelar',
      type = isConfirm ? 'warning' : 'info',
      icon = null,
      closeOnBackdrop = true
    } = options || {};

    return new Promise((resolve) => {
      // Se já houver um modal ativo aberto, encerra-o
      if (this.currentModal && typeof this.currentModal.cleanup === 'function') {
        this.currentModal.cleanup(false);
      }

      const backdrop = document.createElement('div');
      backdrop.id = 'modal-dialog-backdrop';
      backdrop.className = 'fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-backdrop-in';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'modal-dialog-title');

      const card = document.createElement('div');
      card.id = 'modal-dialog-card';
      card.className = 'bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-gray-700 relative text-center animate-modal-in transform transition-all duration-200';

      const iconHtml = this._getIconHtml(type, icon);

      // Estilo do botão principal baseado na severidade da ação
      let confirmBtnClass = 'btn-primary';
      if (type === 'danger') {
        confirmBtnClass = 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-lg shadow-red-600/30 font-bold';
      } else if (type === 'warning') {
        confirmBtnClass = 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-lg shadow-amber-500/30 font-bold';
      } else if (type === 'success') {
        confirmBtnClass = 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg shadow-emerald-600/30 font-bold';
      } else {
        confirmBtnClass = 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-lg shadow-teal-600/30 font-bold';
      }

      card.innerHTML = `
        <button type="button" id="modal-dialog-close-btn" aria-label="Fechar janela" title="Fechar" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer font-bold text-base">✕</button>

        ${iconHtml}

        <h3 id="modal-dialog-title" class="text-xl font-extrabold text-gray-900 dark:text-white mb-2 leading-tight tracking-tight">${this._escapeHtml(title)}</h3>
        <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">${this._escapeHtml(message)}</p>

        <div class="flex flex-col-reverse sm:flex-row gap-3 justify-center mt-6">
          ${isConfirm ? `
            <button type="button" id="modal-dialog-cancel-btn" class="w-full sm:flex-1 py-2.5 px-4 rounded-xl font-semibold text-xs sm:text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer">
              ${this._escapeHtml(cancelText)}
            </button>
          ` : ''}
          <button type="button" id="modal-dialog-confirm-btn" class="${isConfirm ? 'w-full sm:flex-1' : 'w-full'} py-2.5 px-5 rounded-xl text-xs sm:text-sm transition cursor-pointer ${confirmBtnClass}">
            ${this._escapeHtml(confirmText)}
          </button>
        </div>
      `;

      backdrop.appendChild(card);
      document.body.appendChild(backdrop);

      // Trava de rolagem da página com o modal ativo
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      let isClosed = false;

      const cleanup = (result) => {
        if (isClosed) return;
        isClosed = true;

        // Animação de fechamento
        card.style.opacity = '0';
        card.style.transform = 'scale(0.93) translateY(8px)';
        backdrop.style.opacity = '0';
        backdrop.style.transition = 'opacity 0.18s ease';

        setTimeout(() => {
          document.removeEventListener('keydown', keyHandler);
          document.body.style.overflow = previousOverflow;
          if (backdrop.parentNode) {
            backdrop.parentNode.removeChild(backdrop);
          }
          this.currentModal = null;
          resolve(result);
        }, 180);
      };

      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          cleanup(true);
        }
      };

      document.addEventListener('keydown', keyHandler);

      const confirmBtn = card.querySelector('#modal-dialog-confirm-btn');
      const cancelBtn = card.querySelector('#modal-dialog-cancel-btn');
      const closeBtn = card.querySelector('#modal-dialog-close-btn');

      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          cleanup(true);
        });
        setTimeout(() => {
          try { confirmBtn.focus(); } catch (err) {}
        }, 60);
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          cleanup(false);
        });
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          cleanup(false);
        });
      }

      if (closeOnBackdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) {
            cleanup(false);
          }
        });
      }

      this.currentModal = { cleanup };
    });
  },

  _escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  _getIconHtml(type, customIcon) {
    let bgClasses = 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900';
    let svgPath = '';

    if (customIcon === 'trash' || type === 'danger' || type === 'error') {
      bgClasses = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 shadow-red-500/10';
      if (customIcon === 'trash') {
        svgPath = '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>';
      } else {
        svgPath = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>';
      }
    } else if (type === 'warning') {
      bgClasses = 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900 shadow-amber-500/10';
      svgPath = '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>';
    } else if (type === 'success') {
      bgClasses = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 shadow-emerald-500/10';
      svgPath = '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    } else if (customIcon === 'logout') {
      bgClasses = 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900 shadow-teal-500/10';
      svgPath = '<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>';
    } else {
      bgClasses = 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900 shadow-teal-500/10';
      svgPath = '<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    }

    return `
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center border shadow-sm ${bgClasses}">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          ${svgPath}
        </svg>
      </div>
    `;
  }
};

/* Sistema de Notificações Instantâneas Toast (Heurística de Nielsen #1) */
const ToastManager = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'fixed top-5 right-5 z-[99999] flex flex-col gap-2 max-w-sm w-full pointer-events-none';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'success', duration = 3000) {
    this.init();

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center justify-between p-4 rounded-2xl shadow-xl border text-sm font-semibold transition-all duration-300 transform translate-x-10 opacity-0 animate-toast-slide-in ${this.getTypeStyles(type)}`;
    
    const icon = type === 'success' ? '🌱' : (type === 'error' ? '⚠️' : (type === 'warning' ? '🔔' : 'ℹ️'));

    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-base">${icon}</span>
        <span>${message}</span>
      </div>
      <button onclick="this.parentElement.remove()" class="ml-4 text-xs font-bold opacity-70 hover:opacity-100 cursor-pointer">✕</button>
    `;

    this.container.appendChild(toast);

    // Animação de entrada
    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-10', 'opacity-0');
    });

    // Auto-remover após o tempo limite
    setTimeout(() => {
      toast.classList.add('translate-x-10', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Atalhos práticos que direcionam para o ModalDialog
  confirm(options) {
    return ModalDialog.confirm(options);
  },

  alert(options) {
    return ModalDialog.alert(options);
  },

  getTypeStyles(type) {
    switch (type) {
      case 'success':
        return 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/20';
      case 'error':
        return 'bg-red-600 text-white border-red-500 shadow-red-900/20';
      case 'warning':
        return 'bg-amber-500 text-white border-amber-400 shadow-amber-900/20';
      case 'info':
      default:
        return 'bg-teal-600 text-white border-teal-500 shadow-teal-900/20';
    }
  }
};

// Exposição Global
window.ModalDialog = ModalDialog;
window.ToastManager = ToastManager;

// Sobrescrita dos diálogos nativos e feios do navegador (window.alert e window.confirm)
window.alert = function(message) {
  return ModalDialog.alert({
    title: 'Aviso do Sistema',
    message: String(message !== undefined && message !== null ? message : ''),
    type: 'info'
  });
};

window.confirm = function(message) {
  return ModalDialog.confirm({
    title: 'Confirmação',
    message: String(message !== undefined && message !== null ? message : ''),
    type: 'warning'
  });
};
