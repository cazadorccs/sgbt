// ============================================================================
// SISTEMA DE CARGA DINÁMICA DE PLANTILLAS Y MODALES (CORE)
// Carga asíncrona optimizada para arquitectura Offline-First PWA
// ============================================================================

/**
 * Sanitizador de texto contra inyección XSS en manipulación de DOM / innerHTML
 */
window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.loadTemplates = async function() {
  const container = document.getElementById('modals-container');
  if (!container) {
    console.warn('[Templates] Contenedor #modals-container no encontrado en el DOM.');
    return;
  }

  // Si ya tiene contenido cargado, evitar recarga
  if (container.children.length > 0) {
    return;
  }

  try {
    const res = await fetch('/templates/modals.html');
    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    container.innerHTML = html;
    console.log('✅ [Templates] 15 Ventanas modales institucionales inyectadas en el DOM.');
    window.dispatchEvent(new CustomEvent('templates:loaded'));
  } catch (err) {
    console.error('❌ [Templates] Error cargando /templates/modals.html:', err);
    if (typeof window.showToast === 'function') {
      window.showToast('Error cargando componentes de interfaz de usuario.', 'error');
    }
  }
};
