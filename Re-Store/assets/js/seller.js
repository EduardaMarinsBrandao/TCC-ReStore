/* assets/js/seller.js - Gestão da Área do Vendedor */

const SellerManager = {
  async getDashboardMetrics() {
    try {
      const res = await fetch('api/dashboard.php');
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar métricas:', e);
      return { success: false };
    }
  },

  async getMyProducts() {
    try {
      const res = await fetch('api/products.php?action=my_products');
      return await res.json();
    } catch (e) {
      console.error('Erro ao carregar produtos:', e);
      return { success: false, products: [] };
    }
  },

  async addProduct(formData) {
    formData.append('action', 'create');
    try {
      const res = await fetch('api/products.php', {
        method: 'POST',
        body: formData
      });
      return await res.json();
    } catch (e) {
      console.error('Erro ao cadastrar produto:', e);
      return { success: false, error: 'Erro de conexão com o servidor.' };
    }
  },

  async deleteProduct(productId) {
    try {
      const formData = new FormData();
      formData.append('action', 'delete');
      formData.append('id', productId);

      const res = await fetch('api/products.php', {
        method: 'POST',
        body: formData
      });
      return await res.json();
    } catch (e) {
      console.error('Erro ao excluir produto:', e);
      return { success: false, error: 'Falha na conexão.' };
    }
  }
};
