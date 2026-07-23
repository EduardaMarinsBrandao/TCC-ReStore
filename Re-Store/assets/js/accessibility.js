/* assets/js/accessibility.js - Gerenciador de Acessibilidade Re-Store */

const AccessibilityManager = {
  init() {
    this.applyDarkMode(this.getDarkMode());
    this.applyFontSize(this.getFontSize());
    this.applyColorblindMode(this.getColorblindMode());
    this.injectSVGFilters();
  },

  // --- DARK MODE ---
  getDarkMode() {
    return localStorage.getItem('restore_dark_mode') === 'true';
  },
  setDarkMode(enabled) {
    localStorage.setItem('restore_dark_mode', enabled ? 'true' : 'false');
    this.applyDarkMode(enabled);
  },
  toggleDarkMode() {
    const nextState = !this.getDarkMode();
    this.setDarkMode(nextState);
    return nextState;
  },
  applyDarkMode(enabled) {
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },

  // --- AJUSTE DE TAMANHO DE FONTE (3 NÍVEIS) ---
  getFontSize() {
    return localStorage.getItem('restore_font_size') || 'md';
  },
  setFontSize(size) {
    if (['sm', 'md', 'lg'].includes(size)) {
      localStorage.setItem('restore_font_size', size);
      this.applyFontSize(size);
    }
  },
  applyFontSize(size) {
    document.documentElement.classList.remove('font-sm', 'font-md', 'font-lg');
    document.documentElement.classList.add(`font-${size}`);
  },

  // --- MODOS DE DALTONISMO ---
  getColorblindMode() {
    return localStorage.getItem('restore_colorblind') || 'none';
  },
  setColorblindMode(mode) {
    localStorage.setItem('restore_colorblind', mode);
    this.applyColorblindMode(mode);
  },
  applyColorblindMode(mode) {
    document.documentElement.classList.remove('colorblind-protanopia', 'colorblind-deuteranopia', 'colorblind-tritanopia');
    if (mode && mode !== 'none') {
      document.documentElement.classList.add(`colorblind-${mode}`);
    }
  },

  // Injetar Filtros SVG de Matriz de Cor para Daltonismo no DOM
  injectSVGFilters() {
    if (document.getElementById('svg-colorblind-filters')) return;

    const svgContainer = document.createElement('div');
    svgContainer.id = 'svg-colorblind-filters';
    svgContainer.style.cssText = 'position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none;';
    svgContainer.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <filter id="protanopia-filter">
          <feColorMatrix type="matrix" values="
            0.56667, 0.43333, 0.00000, 0, 0
            0.55833, 0.44167, 0.00000, 0, 0
            0.00000, 0.24167, 0.75833, 0, 0
            0,       0,       0,       1, 0" />
        </filter>
        <filter id="deuteranopia-filter">
          <feColorMatrix type="matrix" values="
            0.625, 0.375, 0.000, 0, 0
            0.700, 0.300, 0.000, 0, 0
            0.000, 0.300, 0.700, 0, 0
            0,     0,     0,     1, 0" />
        </filter>
        <filter id="tritanopia-filter">
          <feColorMatrix type="matrix" values="
            0.95, 0.05, 0.00, 0, 0
            0.00, 0.433, 0.567, 0, 0
            0.00, 0.475, 0.525, 0, 0
            0,    0,     0,     1, 0" />
        </filter>
      </svg>
    `;
    document.body.appendChild(svgContainer);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AccessibilityManager.init();
});
