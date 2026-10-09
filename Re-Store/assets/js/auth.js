/* assets/js/auth.js - Autenticação & Gerenciamento de Sessão */

const AuthManager = {
  currentUser: null,

  isAdmin() {
    if (!this.currentUser) return false;
    return parseInt(this.currentUser.is_admin, 10) === 1 || 
           (this.currentUser.email && this.currentUser.email.toLowerCase().trim() === 'tccdssuporte@gmail.com');
  },

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

  async loginWithGoogle(credential) {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'google_login', credential })
    });
    const data = await res.json();
    if (data.success) {
      this.currentUser = data.user;
    }
    return data;
  },

  async sendRegisterCode(name, email) {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_register_code', name, email })
    });
    return await res.json();
  },

  async verifyRegisterCode(code, email) {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_register_code', code, email })
    });
    return await res.json();
  },

  async register(name, email, password, phone = '', code = '', extraData = {}) {
    const res = await fetch('api/auth.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        name,
        email,
        password,
        phone,
        code,
        ...extraData
      })
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
