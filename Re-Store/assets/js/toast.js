/* assets/js/toast.js - Sistema de Notificações Instantâneas Toast (Heurística de Nielsen #1) */

const ToastManager = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none';
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
      <button onclick="this.parentElement.remove()" class="ml-4 text-xs font-bold opacity-70 hover:opacity-100">✕</button>
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
