// ============================================================================
// CORE: SISTEMA INSTITUCIONAL DE NOTIFICACIONES TOAST (NON-BLOCKING)
// Reemplaza los alert() nativos bloqueantes para garantizar 0 retardo en UI
// Conectado con feedback háptico y acústico industrial para operadores
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
    container.style.maxWidth = '400px';
    container.style.width = 'calc(100% - 2.5rem)';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }

  // Feedback acústico y háptico automático para operadores
  if (typeof window.playAudioFeedback === 'function') {
    window.playAudioFeedback(type);
  }

  const toast = document.createElement('div');
  toast.className = `sgbt-toast toast-${type}`;
  toast.style.pointerEvents = 'auto';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '0.75rem';
  toast.style.padding = '0.75rem 0.85rem 0.75rem 1rem';
  toast.style.borderRadius = '10px';
  toast.style.boxShadow = '0 10px 25px -5px rgba(15, 23, 42, 0.18), 0 8px 10px -6px rgba(15, 23, 42, 0.1)';
  toast.style.fontSize = '0.88rem';
  toast.style.fontWeight = '500';
  toast.style.lineHeight = '1.35';
  toast.style.backdropFilter = 'blur(12px)';
  toast.style.border = '1px solid';
  toast.style.transitionProperty = 'opacity, transform';
  toast.style.transitionDuration = '200ms';
  toast.style.transitionTimingFunction = 'ease-out';

  // Iconografía SVG Vectorial Nítida (Taste-Skill / Impeccable)
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="icon-svg" style="width: 20px; height: 20px; color: #10b981;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    toast.style.background = '#064e3b';
    toast.style.color = '#ecfdf5';
    toast.style.borderColor = '#059669';
  } else if (type === 'error') {
    iconSvg = `<svg class="icon-svg" style="width: 20px; height: 20px; color: #f43f5e;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    toast.style.background = '#4c0519';
    toast.style.color = '#ffe4e6';
    toast.style.borderColor = '#e11d48';
  } else if (type === 'warning') {
    iconSvg = `<svg class="icon-svg" style="width: 20px; height: 20px; color: #f59e0b;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    toast.style.background = '#451a03';
    toast.style.color = '#fef3c7';
    toast.style.borderColor = '#d97706';
  } else {
    iconSvg = `<svg class="icon-svg" style="width: 20px; height: 20px; color: #0ea5e9;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    toast.style.background = '#0c4a6e';
    toast.style.color = '#e0f2fe';
    toast.style.borderColor = '#0284c7';
  }

  toast.innerHTML = `
    <span style="flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;">${iconSvg}</span>
    <div style="flex: 1; word-break: break-word; text-wrap: pretty;">${message}</div>
    <button type="button" aria-label="Cerrar notificación" style="background: none; border: none; color: inherit; opacity: 0.7; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin: -10px -8px -10px 0; border-radius: 8px; flex-shrink: 0;" onclick="if(window.triggerHaptic) window.triggerHaptic('tick'); this.parentElement.remove()">
      <svg class="icon-svg" style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 220);
  }, duration);
};

// Polyfill o alias seguro para código legado que requiera feedback rápido
window.notifyFeedback = function(msg, isSuccess = true) {
  window.showToast(msg, isSuccess ? 'success' : 'error');
};

window.Toast = {
  success(msg, duration) { return window.showToast(msg, 'success', duration); },
  error(msg, duration) { return window.showToast(msg, 'error', duration); },
  warning(msg, duration) { return window.showToast(msg, 'warning', duration); },
  info(msg, duration) { return window.showToast(msg, 'info', duration); }
};

