// ============================================================================
// CORE: BANKING-GRADE SESSION MANAGER (AUTO-LOGOUT & INACTIVITY WATCHDOG)
// Sistema Institucional SGBT MIPPCI
// Regla: Los super administradores y perfiles directivos están EXENTOS
// del cierre por inactividad o abandono de ventana.
// ============================================================================

window.SessionManager = (function() {
  'use strict';

  // Configuración predeterminada estilo bancario
  const STORAGE_USER_KEY = 'sgbt_user';
  const STORAGE_META_KEY = 'sgbt_session_meta';
  const STORAGE_CONFIG_TIMEOUT = 'sgbt_session_timeout_mins';
  const STORAGE_CONFIG_ABANDON = 'sgbt_session_abandon_mins';

  let config = {
    inactivityMinutes: 10,   // Cierre tras 10 minutos de inactividad con la pestaña abierta
    abandonmentMinutes: 3,   // Cierre tras 3 minutos si la pestaña/navegador se minimiza o abandona
    warningSeconds: 60       // Mostrar advertencia bancaria 60 segundos antes del cierre
  };

  let heartbeatTimer = null;
  let lastActivityTimestamp = Date.now();
  let hiddenTimestamp = null;
  let isWarningOpen = false;
  let isInitialized = false;
  let throttleTimer = 0;

  // Verifica si un usuario es super administrador o perfil directivo exento de timeout
  function isSuperAdmin(user) {
    if (!user) return false;
    const r = (user.role || '').toLowerCase();
    return (
      r === 'admin' ||
      r === 'superadmin' ||
      r === 'super_admin' ||
      r === 'director' ||
      Boolean(user.is_admin) ||
      Boolean(user.is_superadmin)
    );
  }

  // Cargar configuración guardada
  function loadConfig() {
    try {
      const savedTimeout = localStorage.getItem(STORAGE_CONFIG_TIMEOUT);
      if (savedTimeout) {
        config.inactivityMinutes = parseInt(savedTimeout, 10) || 10;
      }
      const savedAbandon = localStorage.getItem(STORAGE_CONFIG_ABANDON);
      if (savedAbandon) {
        config.abandonmentMinutes = parseInt(savedAbandon, 10) || 3;
      }
    } catch (e) {
      console.warn('[SESSION] Error cargando configuración:', e);
    }
  }

  // Guardar configuración personalizada
  function saveConfig(inactivityMins, abandonmentMins) {
    if (inactivityMins) {
      config.inactivityMinutes = parseInt(inactivityMins, 10);
      try { localStorage.setItem(STORAGE_CONFIG_TIMEOUT, config.inactivityMinutes.toString()); } catch (e) {}
    }
    if (abandonmentMins !== undefined) {
      config.abandonmentMinutes = parseInt(abandonmentMins, 10);
      try { localStorage.setItem(STORAGE_CONFIG_ABANDON, config.abandonmentMinutes.toString()); } catch (e) {}
    }
  }

  // Registrar actividad del usuario (Throttled a cada 2.5 segundos para no impactar rendimiento)
  function recordActivity() {
    const now = Date.now();
    if (now - throttleTimer < 2500) return;
    throttleTimer = now;
    lastActivityTimestamp = now;

    if (isWarningOpen) {
      dismissWarningModal();
    }

    try {
      const metaStr = sessionStorage.getItem(STORAGE_META_KEY);
      if (metaStr) {
        const meta = JSON.parse(metaStr);
        meta.lastActive = now;
        sessionStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
      }
    } catch (e) {}
  }

  // Iniciar sesión bancaria
  function startSession(user) {
    const now = Date.now();
    lastActivityTimestamp = now;
    hiddenTimestamp = null;
    const superAdminMode = isSuperAdmin(user);

    try {
      // 1. Guardar en sessionStorage (se destruye naturalmente al cerrar el navegador/ventana)
      sessionStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
      sessionStorage.setItem(STORAGE_META_KEY, JSON.stringify({
        loginAt: now,
        lastActive: now,
        userId: user.id,
        role: user.role,
        isSuperAdmin: superAdminMode
      }));

      // 2. Limpiar cualquier sesión residual en localStorage para evitar persistencia eterna
      localStorage.removeItem(STORAGE_USER_KEY);
    } catch (e) {
      console.warn('[SESSION] Error guardando sesión:', e);
    }

    // Regla: No aplicar cierre por inactividad para el Super Administrador
    if (superAdminMode) {
      console.log(`[SESSION WATCHDOG] 🛡️ Super Administrador (${user.full_name}): Exclusión de cierre por inactividad activa permanentemente.`);
      stopWatchdog();
      dismissWarningModal();
      return;
    }

    startWatchdog();
  }

  // Terminar sesión
  function endSession(reason) {
    stopWatchdog();
    dismissWarningModal();

    try {
      sessionStorage.removeItem(STORAGE_USER_KEY);
      sessionStorage.removeItem(STORAGE_META_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
    } catch (e) {}

    if (typeof window.handleLogout === 'function') {
      window.handleLogout(reason);
    }
  }

  // Extender sesión manualmente al pulsar el botón de advertencia
  function extendSession() {
    lastActivityTimestamp = Date.now();
    dismissWarningModal();
    recordActivity();
    if (typeof window.showToast === 'function') {
      window.showToast('🛡️ Sesión extendida con éxito.', 'info');
    }
  }

  // Mostrar modal de advertencia de expiración
  function showWarningModal(remainingSeconds) {
    // Si el usuario actual es super admin, nunca mostrar advertencia
    if (STATE && STATE.currentUser && isSuperAdmin(STATE.currentUser)) {
      dismissWarningModal();
      return;
    }

    isWarningOpen = true;
    const modal = document.getElementById('sessionTimeoutModalBackdrop');
    const label = document.getElementById('sessionTimeoutCountdownLabel');
    const bar = document.getElementById('sessionTimeoutCountdownBar');

    if (modal) {
      modal.classList.add('active');
    }
    if (label) {
      label.textContent = `${Math.max(0, remainingSeconds)}s`;
    }
    if (bar) {
      const pct = (Math.max(0, remainingSeconds) / config.warningSeconds) * 100;
      bar.style.width = `${pct}%`;
    }

    if (typeof window.playAudioFeedback === 'function') {
      window.playAudioFeedback('warning');
    }
  }

  // Cerrar modal de advertencia
  function dismissWarningModal() {
    isWarningOpen = false;
    const modal = document.getElementById('sessionTimeoutModalBackdrop');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // Ciclo principal de vigilancia (Watchdog heartbeat)
  function heartbeat() {
    if (!STATE || !STATE.currentUser) {
      stopWatchdog();
      return;
    }

    // Regla: Eximir totalmente al Super Administrador de la expiración por inactividad
    if (isSuperAdmin(STATE.currentUser)) {
      if (isWarningOpen) dismissWarningModal();
      stopWatchdog();
      return;
    }

    const now = Date.now();
    const inactivityLimitMs = config.inactivityMinutes * 60 * 1000;
    const warningWindowMs = config.warningSeconds * 1000;
    const elapsed = now - lastActivityTimestamp;

    // 1. Expiración total por inactividad
    if (elapsed >= inactivityLimitMs) {
      console.warn('[SESSION WATCHDOG] Sesión expirada por inactividad prolongada.');
      endSession('🔒 Su sesión fue cerrada automáticamente por inactividad para proteger sus datos bancarios e institucionales.');
      return;
    }

    // 2. Ventana de advertencia (últimos 60 segundos)
    if (elapsed >= (inactivityLimitMs - warningWindowMs)) {
      const remainingSec = Math.ceil((inactivityLimitMs - elapsed) / 1000);
      showWarningModal(remainingSec);
    } else {
      if (isWarningOpen) {
        dismissWarningModal();
      }
    }
  }

  // Iniciar temporizador de vigilancia
  function startWatchdog() {
    // Si el usuario es Super Administrador, la vigilancia nunca se activa
    if (STATE && STATE.currentUser && isSuperAdmin(STATE.currentUser)) {
      stopWatchdog();
      dismissWarningModal();
      return;
    }

    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(heartbeat, 1000);
  }

  // Detener vigilancia
  function stopWatchdog() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // Validar sesión al recargar la página (F5) o abrir la app
  function validateSessionOnBoot() {
    loadConfig();

    try {
      const metaStr = sessionStorage.getItem(STORAGE_META_KEY);
      if (!metaStr) return false;

      const meta = JSON.parse(metaStr);
      const now = Date.now();
      const inactivityLimitMs = config.inactivityMinutes * 60 * 1000;

      // Si es super administrador, su sesión NUNCA expira por inactividad
      if (meta && (meta.isSuperAdmin || meta.role === 'admin' || meta.role === 'superadmin' || meta.role === 'director')) {
        lastActivityTimestamp = now;
        return true;
      }

      // Si el tiempo transcurrido desde la última actividad supera el límite, descartar
      if (!meta.lastActive || (now - meta.lastActive) > inactivityLimitMs) {
        sessionStorage.removeItem(STORAGE_USER_KEY);
        sessionStorage.removeItem(STORAGE_META_KEY);
        return false;
      }

      lastActivityTimestamp = now;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Manejo de abandono de pestaña o ventana (VisibilityChange y Blur/Focus)
  function setupAbandonmentListeners() {
    // 1. Cambio de visibilidad (minimizar navegador o cambiar de pestaña)
    document.addEventListener('visibilitychange', () => {
      if (!STATE || !STATE.currentUser) return;

      // Regla: Exención total para el Super Administrador al minimizar o cambiar de pestaña
      if (isSuperAdmin(STATE.currentUser)) return;

      if (document.hidden) {
        hiddenTimestamp = Date.now();
      } else {
        if (hiddenTimestamp) {
          const awayDurationMs = Date.now() - hiddenTimestamp;
          const maxAwayMs = config.abandonmentMinutes * 60 * 1000;
          const totalIdleMs = Date.now() - lastActivityTimestamp;
          const maxIdleMs = config.inactivityMinutes * 60 * 1000;

          // Si estuvo ausente más del límite de abandono o superó la inactividad global
          if (awayDurationMs >= maxAwayMs || totalIdleMs >= maxIdleMs) {
            console.warn('[SESSION WATCHDOG] Ventana abandonada durante más de', config.abandonmentMinutes, 'minutos.');
            hiddenTimestamp = null;
            endSession('🔒 Sesión cerrada automáticamente al abandonar o minimizar la ventana (Política de Seguridad Bancaria).');
            return;
          }

          hiddenTimestamp = null;
          recordActivity();
        }
      }
    });

    // 2. Listeners de interacción global (ratón, teclado, pantalla táctil, scroll)
    const interactionEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    interactionEvents.forEach(evt => {
      window.addEventListener(evt, recordActivity, { passive: true });
    });

    // 3. Listener para cerrar el modal o extender sesión
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'btnSessionExtend') {
        extendSession();
      }
      if (e.target && e.target.id === 'btnSessionLogoutNow') {
        endSession('Sesión cerrada manualmente.');
      }
    });
  }

  // Inicialización global del módulo
  function init() {
    if (isInitialized) return;
    isInitialized = true;
    loadConfig();
    setupAbandonmentListeners();
  }

  return {
    init,
    startSession,
    endSession,
    extendSession,
    recordActivity,
    validateSessionOnBoot,
    startWatchdog,
    stopWatchdog,
    saveConfig,
    isSuperAdmin,
    getConfig: () => ({ ...config })
  };
})();
