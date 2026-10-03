/* assets/js/messenger.js - Sistema de Mensagens em Tempo Real via Ajax Delta Polling */

const MessengerManager = {
  activePartnerId: null,
  activeProductId: null,
  lastMessageId: 0,
  pollTimer: null,
  isPollingBusy: false,
  pollIntervalMs: 2500, // 2.5s para resposta rápida sem sobrecarregar a hospedagem

  async getConversations() {
    try {
      const res = await fetch('api/messenger.php?action=conversations');
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar conversas:', e);
      return { success: false, conversations: [] };
    }
  },

  async getMessages(withUserId, productId = null, afterId = 0) {
    this.activePartnerId = withUserId;
    if (productId !== undefined && productId !== null) {
      this.activeProductId = productId;
    }

    let url = `api/messenger.php?action=messages&with_user_id=${encodeURIComponent(withUserId)}`;
    if (this.activeProductId) url += `&product_id=${encodeURIComponent(this.activeProductId)}`;
    if (afterId > 0) url += `&after_id=${encodeURIComponent(afterId)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      
      // Se for a busca completa inicial, rastreia o maior ID
      if (afterId === 0 && data.success && Array.isArray(data.messages)) {
        this.lastMessageId = 0;
        data.messages.forEach(m => {
          const mid = parseInt(m.id, 10);
          if (mid > this.lastMessageId) this.lastMessageId = mid;
        });
      }

      return data;
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
      return { success: false, messages: [] };
    }
  },

  async sendMessage(receiverId, messageText, productId = null) {
    try {
      const res = await fetch('api/messenger.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          receiver_id: receiverId,
          product_id: productId || this.activeProductId,
          message: messageText
        })
      });
      return await res.json();
    } catch (e) {
      console.error('Erro ao enviar mensagem:', e);
      return { success: false, error: 'Falha na conexão.' };
    }
  },

  async deleteMessage(messageId) {
    try {
      const res = await fetch('api/messenger.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_message',
          message_id: messageId
        })
      });
      return await res.json();
    } catch (e) {
      console.error('Erro ao apagar mensagem:', e);
      return { success: false, error: 'Falha na conexão.' };
    }
  },

  async getUnreadCount() {
    try {
      const res = await fetch('api/messenger.php?action=unread_count');
      const data = await res.json();
      return (data.success && data.unread_count !== undefined) ? parseInt(data.unread_count, 10) : 0;
    } catch (e) {
      return 0;
    }
  },

  async getSupportUser() {
    try {
      const res = await fetch('api/messenger.php?action=get_support_user');
      return await res.json();
    } catch (e) {
      console.error('Erro ao buscar usuário de suporte:', e);
      return { success: false };
    }
  },

  startPolling(onNewMessagesCallback) {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      // Não executa a chamada de polling se a aba do navegador estiver inativa, se não houver parceiro ou se outra requisição estiver pendente
      if (document.hidden || !this.activePartnerId || this.isPollingBusy) return;

      this.isPollingBusy = true;
      try {
        const data = await this.getMessages(this.activePartnerId, this.activeProductId, this.lastMessageId);
        if (data && data.success && Array.isArray(data.messages) && data.messages.length > 0) {
          // Atualiza o maior ID conhecido
          data.messages.forEach(m => {
            const mid = parseInt(m.id, 10);
            if (mid > this.lastMessageId) this.lastMessageId = mid;
          });

          if (typeof onNewMessagesCallback === 'function') {
            onNewMessagesCallback(data.messages);
          }
        }
      } catch (err) {
        console.warn('Falha no polling de mensagens:', err);
      } finally {
        this.isPollingBusy = false;
      }
    }, this.pollIntervalMs);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPollingBusy = false;
  }
};

const ChatManager = MessengerManager;
window.ChatManager = MessengerManager;
window.MessengerManager = MessengerManager;
