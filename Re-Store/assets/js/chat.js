/* assets/js/chat.js - Sistema de Chat em Tempo Real via Ajax */

const ChatManager = {
  activePartnerId: null,
  activeProductId: null,
  pollTimer: null,

  async getConversations() {
    try {
      const res = await fetch('api/chat.php?action=conversations');
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar conversas:', e);
      return { success: false, conversations: [] };
    }
  },

  async getMessages(withUserId, productId = null) {
    this.activePartnerId = withUserId;
    this.activeProductId = productId;

    let url = `api/chat.php?action=messages&with_user_id=${withUserId}`;
    if (productId) url += `&product_id=${productId}`;

    try {
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
      return { success: false, messages: [] };
    }
  },

  async sendMessage(receiverId, messageText, productId = null) {
    try {
      const res = await fetch('api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          receiver_id: receiverId,
          product_id: productId,
          message: messageText
        })
      });
      return await res.json();
    } catch (e) {
      console.error('Erro ao enviar mensagem:', e);
      return { success: false, error: 'Falha na conexão.' };
    }
  },

  startPolling(callback) {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      // Não executa a chamada de polling se a aba do navegador estiver inativa ou se o chat não estiver visível
      if (document.hidden) return;
      if (this.activePartnerId) {
        const data = await this.getMessages(this.activePartnerId, this.activeProductId);
        if (data.success && typeof callback === 'function') {
          callback(data);
        }
      }
    }, 5000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.activePartnerId = null;
    this.activeProductId = null;
  }
};
