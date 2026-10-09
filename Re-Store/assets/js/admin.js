/* assets/js/admin.js - Módulo de Administração & Moderação Suporte Re-Store */

const AdminManager = {
  async listUsers(search = '') {
    try {
      const res = await fetch(`api/admin.php?action=list_users&search=${encodeURIComponent(search)}`);
      return await res.json();
    } catch (e) {
      console.error('Erro ao listar usuários:', e);
      return { success: false, error: 'Falha de comunicação com o servidor.', users: [] };
    }
  },

  async getUserProducts(userId) {
    try {
      const res = await fetch(`api/admin.php?action=user_products&user_id=${userId}`);
      return await res.json();
    } catch (e) {
      console.error('Erro ao buscar produtos do usuário:', e);
      return { success: false, error: 'Falha ao buscar produtos.', products: [] };
    }
  },

  async getStats() {
    try {
      const res = await fetch('api/admin.php?action=stats');
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar estatísticas do admin:', e);
      return { success: false };
    }
  },

  async getModerationNotices() {
    try {
      const res = await fetch('api/admin.php?action=my_moderation_notices');
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar notificações de moderação:', e);
      return { success: false, notices: [] };
    }
  },

  async dismissNotice(noticeId) {
    try {
      const formData = new FormData();
      formData.append('notice_id', noticeId);
      const res = await fetch('api/admin.php?action=dismiss_notice', {
        method: 'POST',
        body: formData
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  },

  async deleteProductAsAdmin(productId, reason) {
    try {
      const formData = new FormData();
      formData.append('action', 'delete');
      formData.append('id', productId);
      formData.append('reason', reason);

      const res = await fetch('api/products.php', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('Erro ao excluir produto como admin:', e);
      return { success: false, error: 'Falha ao processar solicitação no servidor.' };
    }
  }
};

window.AdminManager = AdminManager;
