// ============================================================================
// GESTOR DE MODO OSCURO / CLARO INSTITUCIONAL (SGBT THEME ENGINE)
// Soporta: 'dark' / 'light', preferencia del sistema (prefers-color-scheme)
// y persistencia local sin parpadeos de carga (FOUC).
// ============================================================================

window.ThemeManager = (function() {
  const STORAGE_KEY = 'sgbt_theme';

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function applyTheme(theme, save = true) {
    const isDark = theme === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body?.classList.add('dark-mode');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body?.classList.remove('dark-mode');
    }

    updateUIElements(isDark);

    // 4. Actualizar meta theme-color para navegadores móviles
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#0a0f1d' : '#0284c7');
    }

    // 5. Notificar a componentes gráficos y suscriptores del cambio de tema
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme, isDark } }));

    if (save) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (e) {
        console.warn('No se pudo guardar la preferencia de tema:', e);
      }
    }
  }

  function updateUIElements(isDark) {
    // 1. Iconos de sol y luna en botón de cabecera
    const iconSun = document.getElementById('themeIconSun');
    const iconMoon = document.getElementById('themeIconMoon');
    if (iconSun && iconMoon) {
      iconSun.style.display = isDark ? 'inline-block' : 'none';
      iconMoon.style.display = isDark ? 'none' : 'inline-block';
    }

    const btnHeader = document.getElementById('btnThemeToggle');
    if (btnHeader) {
      btnHeader.setAttribute('title', isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro');
      btnHeader.setAttribute('aria-label', isDark ? 'Modo Claro' : 'Modo Oscuro');
    }

    // 2. Toggle en modal de configuración general
    const toggleSetting = document.getElementById('toggleDarkModeSetting');
    if (toggleSetting) {
      toggleSetting.checked = isDark;
    }
    const labelStatus = document.getElementById('labelDarkModeStatus');
    if (labelStatus) {
      labelStatus.textContent = isDark ? 'Activado' : 'Desactivado';
      labelStatus.style.color = isDark ? '#38bdf8' : '#64748b';
    }

    // 3. Texto en dropdown de usuario
    const dropdownText = document.getElementById('dropdownThemeText');
    if (dropdownText) {
      dropdownText.textContent = isDark ? '☀️ Modo Claro' : '🌙 Modo Oscuro';
    }
  }

  function handleBtnClick(e) {
    if (e) e.preventDefault();
    toggle();
  }

  function handleToggleSettingChange(e) {
    applyTheme(e.target.checked ? 'dark' : 'light', true);
  }

  function bindEventListeners() {
    // Enlazar botón principal en la cabecera
    const btnToggle = document.getElementById('btnThemeToggle');
    if (btnToggle) {
      btnToggle.removeEventListener('click', handleBtnClick);
      btnToggle.addEventListener('click', handleBtnClick);
    }

    // Enlazar toggle en modal de configuración
    const toggleSetting = document.getElementById('toggleDarkModeSetting');
    if (toggleSetting) {
      toggleSetting.removeEventListener('change', handleToggleSettingChange);
      toggleSetting.addEventListener('change', handleToggleSettingChange);
    }

    // Enlazar opción en menú desplegable
    const btnDropdown = document.getElementById('btnDropdownToggleTheme');
    if (btnDropdown) {
      btnDropdown.removeEventListener('click', handleBtnClick);
      btnDropdown.addEventListener('click', handleBtnClick);
    }
  }

  function toggle() {
    const current = getCurrentTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);

    if (typeof window.playAudioFeedback === 'function') {
      window.playAudioFeedback('click');
    }
    if (typeof window.showToast === 'function') {
      window.showToast(next === 'dark' ? '🌙 Modo Oscuro activado' : '☀️ Modo Claro activado', 'info');
    }
    return next;
  }

  function init() {
    const saved = getStoredTheme();
    const effectiveTheme = saved || getSystemPreference();
    applyTheme(effectiveTheme, false);

    // Escuchar cambios de preferencia del sistema si el usuario no ha forzado un tema
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!getStoredTheme()) {
          applyTheme(e.matches ? 'dark' : 'light', false);
        }
      });
    }

    bindEventListeners();
  }

  return {
    init,
    bindEventListeners,
    toggle,
    applyTheme,
    getCurrentTheme,
    isDark: () => getCurrentTheme() === 'dark'
  };
})();

// Re-enlazar listeners y actualizar UI cuando se inyectan las plantillas de modales
window.addEventListener('templates:loaded', () => {
  if (window.ThemeManager) {
    window.ThemeManager.bindEventListeners();
    window.ThemeManager.applyTheme(window.ThemeManager.getCurrentTheme(), false);
  }
});

// Inicialización automática
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.ThemeManager.init());
} else {
  window.ThemeManager.init();
}
