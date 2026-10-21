// ============================================================================
// CORE: SISTEMA INSTITUCIONAL DE NOTIFICACIONES TOAST (NON-BLOCKING)
// Reemplaza los alert() nativos bloqueantes para garantizar 0 retardo en UI
// ============================================================================

window.showToast = function(message, type = 'info', duration = 3500) {
  let container = document.getElementById('sgbtToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sgbtToastContainer';
    container.style.position = 'fixed';
    container.style.top = '1.25rem';
    container.style.right = '1.25rem';
    container.style.zIndex = '99999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '0.5rem';
    container.style.maxWidth = '380px';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `sgbt-toast toast-${type}`;
  toast.style.pointerEvents = 'auto';
  toast.style.display = 'flex';
  toast.style.alignItems = 'flex-start';
  toast.style.gap = '0.65rem';
  toast.style.padding = '0.75rem 1rem';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
  toast.style.fontSize = '0.85rem';
  toast.style.fontWeight = '500';
  toast.style.lineHeight = '1.4';
  toast.style.animation = 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  toast.style.backdropFilter = 'blur(8px)';
  toast.style.border = '1px solid';

  let icon = 'ℹ️';
  if (type === 'success') {
    icon = '✅';
    toast.style.background = '#064e3b';
    toast.style.color = '#a7f3d0';
    toast.style.borderColor = '#059669';
  } else if (type === 'error') {
    icon = '❌';
    toast.style.background = '#4c0519';
    toast.style.color = '#fecdd3';
    toast.style.borderColor = '#e11d48';
  } else if (type === 'warning') {
    icon = '⚠️';
    toast.style.background = '#451a03';
    toast.style.color = '#fde68a';
    toast.style.borderColor = '#d97706';
  } else {
    icon = '🔔';
    toast.style.background = '#0c4a6e';
    toast.style.color = '#bae6fd';
    toast.style.borderColor = '#0284c7';
  }

  toast.innerHTML = `
    <span style="font-size: 1.1rem; flex-shrink: 0; line-height: 1;">${icon}</span>
    <div style="flex: 1; word-break: break-word;">${message}</div>
    <button type="button" style="background: none; border: none; color: inherit; opacity: 0.6; cursor: pointer; font-size: 0.9rem; padding: 0 0 0 0.5rem; line-height: 1;" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
};

// Polyfill o alias seguro para código legado que requiera feedback rápido
window.notifyFeedback = function(msg, isSuccess = true) {
  window.showToast(msg, isSuccess ? 'success' : 'error');
  if (typeof window.playAudioFeedback === 'function') {
    window.playAudioFeedback(isSuccess ? 'success' : 'error');
  }
};
