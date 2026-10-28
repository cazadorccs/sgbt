// ============================================================================
// CORE: MOTOR DE PREVENCIÓN ACTIVA DE CROSS-SITE SCRIPTING (XSS)
// SGBT MIPPCI - Saneamiento de Entradas, Escape Seguro y Renderizado Protegido
// ============================================================================

(function(window) {
  'use strict';

  /**
   * Mapa de caracteres peligrosos a entidades HTML seguras
   */
  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  const ESCAPE_REGEX = /[&<>"'`=\/]/g;

  /**
   * Escapa caracteres especiales de HTML en texto no confiable (nombres, cédulas, notas, errores)
   * @param {*} str - Texto a escapar
   * @returns {string} Texto seguro para incrustar en HTML
   */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(ESCAPE_REGEX, char => HTML_ESCAPES[char]);
  }

  /**
   * Sanitiza fragmentos HTML eliminando scripts ejecutables y manejadores inline
   * @param {string} dirty - Cadena con potencial código malicioso
   * @returns {string} HTML sanitizado
   */
  function sanitizeHTML(dirty) {
    if (!dirty || typeof dirty !== 'string') return '';

    return dirty
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/javascript\s*:/gi, 'blocked-javascript:')
      .replace(/vbscript\s*:/gi, 'blocked-vbscript:')
      .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\bon\w+\s*=\s*[^>\s]+/gi, '');
  }

  /**
   * Asigna texto de forma 100% segura mediante textContent
   */
  function safeSetText(element, text) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    if (el) {
      el.textContent = text !== null && text !== undefined ? String(text) : '';
    }
  }

  /**
   * Asigna HTML desinfectado de forma segura
   */
  function safeSetHTML(element, dirtyHTML) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    if (el) {
      el.innerHTML = sanitizeHTML(dirtyHTML);
    }
  }

  // Exposición global
  window.escapeHTML = escapeHTML;
  window.sanitizeHTML = sanitizeHTML;
  window.safeSetText = safeSetText;
  window.safeSetHTML = safeSetHTML;
  window.DOMUtils = {
    escape: escapeHTML,
    sanitize: sanitizeHTML,
    setText: safeSetText,
    setHTML: safeSetHTML
  };

})(window);
