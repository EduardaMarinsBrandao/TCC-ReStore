/* assets/js/cart.js - Gerenciador de Carrinho e Checkout Simulado */

const CartManager = {
  getCart() {
    try {
      return JSON.parse(localStorage.getItem('restore_cart')) || [];
    } catch (e) {
      return [];
    }
  },

  saveCart(cart) {
    localStorage.setItem('restore_cart', JSON.stringify(cart));
    this.updateCartBadge();
  },

  addItem(product, quantity = 1) {
    const cart = this.getCart();
    const existingIndex = cart.findIndex(item => item.product_id === product.id);
    const availableStock = parseInt(product.stock !== undefined ? product.stock : 999);

    if (availableStock <= 0) {
      ToastManager.show(`Este produto está esgotado!`, 'error');
      return cart;
    }

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + quantity > availableStock) {
        cart[existingIndex].quantity = availableStock;
        ToastManager.show(`Estoque máximo atingido! Disponível: ${availableStock} un.`, 'info');
      } else {
        cart[existingIndex].quantity += quantity;
      }
    } else {
      const initialQty = Math.min(quantity, availableStock);
      cart.push({
        product_id: product.id,
        name: product.name,
        price: parseFloat(product.price),
        points: parseInt(product.points || 0),
        image: product.primary_image || (product.images && product.images[0] ? product.images[0].image_url : ''),
        seller_id: product.seller_id,
        seller_name: product.seller_name || 'Vendedor',
        stock: availableStock,
        quantity: initialQty
      });
      if (initialQty < quantity) {
        ToastManager.show(`Apenas ${availableStock} un. disponíveis em estoque.`, 'info');
      }
    }

    this.saveCart(cart);
    return cart;
  },

  updateQuantity(productId, quantity) {
    let cart = this.getCart();
    if (quantity <= 0) {
      cart = cart.filter(item => item.product_id !== productId);
    } else {
      const item = cart.find(item => item.product_id === productId);
      if (item) {
        const availableStock = item.stock || 999;
        if (quantity > availableStock) {
          item.quantity = availableStock;
          ToastManager.show(`Limite máximo do estoque atingido (${availableStock} un.)!`, 'info');
        } else {
          item.quantity = quantity;
        }
      }
    }
    this.saveCart(cart);
    return cart;
  },

  removeItem(productId) {
    const cart = this.getCart().filter(item => item.product_id !== productId);
    this.saveCart(cart);
    return cart;
  },

  clearCart() {
    localStorage.removeItem('restore_cart');
    this.updateCartBadge();
  },

  getTotals() {
    const cart = this.getCart();
    let total = 0.0;
    let totalPoints = 0;
    let totalCount = 0;

    cart.forEach(item => {
      total += item.price * item.quantity;
      totalPoints += item.points * item.quantity;
      totalCount += item.quantity;
    });

    return { total, totalPoints, totalCount };
  },

  updateCartBadge() {
    const { totalCount } = this.getTotals();
    const badges = document.querySelectorAll('.cart-badge');
    badges.forEach(b => {
      b.textContent = totalCount;
      b.style.display = totalCount > 0 ? 'inline-flex' : 'none';
    });
  },

  async processCheckout(paymentMethod, shippingData, couponCode = '') {
    const cart = this.getCart();
    if (cart.length === 0) {
      return { success: false, error: 'O carrinho está vazio.' };
    }

    const payload = {
      action: 'checkout',
      items: cart,
      payment_method: paymentMethod,
      coupon_code: couponCode,
      shipping_address: shippingData.address,
      shipping_city: shippingData.city,
      shipping_state: shippingData.state,
      shipping_zip: shippingData.zip
    };

    const res = await fetch('api/orders.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      this.clearCart();
    }
    return data;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  CartManager.updateCartBadge();
});
