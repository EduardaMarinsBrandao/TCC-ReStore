/* assets/js/auth.js - Autenticação & Gerenciamento de Sessão */

const AuthManager = {
  currentUser: null,

  async checkAuth() {
    try {
      const res = await fetch('api/auth.php?action=me');
      const data = await res.json();
      if (data.success && data.logged_in) {
        this.currentUser = data.user;
      } else {
        this.currentUser = null;
      }
      return this.currentUser;
    } catch (e) {
      console.error('Erro ao verificar sessão:', e);
      this.currentUser = null;
      return null;
    }
  },

  async login(email, password) {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password })
    });
    const data = await res.json();
    if (data.success) {
      this.currentUser = data.user;
    }
    return data;
  },

  async register(name, email, password, phone = '') {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', name, email, password, phone })
    });
    const data = await res.json();
    if (data.success) {
      this.currentUser = data.user;
    }
    return data;
  },

  async logout() {
    await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    });
    this.currentUser = null;
  },

  async updateProfile(formData) {
    formData.append('action', 'update_profile');
    const res = await fetch('api/auth.php', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      this.currentUser = data.user;
    }
    return data;
  }
};
