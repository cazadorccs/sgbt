// ============================================================================
// CORE: REACTIVE STATE MANAGEMENT (SINGLE SOURCE OF TRUTH)
// ============================================================================

window.STATE = {
  isOnline: true,
  currentView: 'view-login',
  currentSubtab: 'subtab-dashboard',
  currentUser: null,
  selectedWorkerId: null,
  activeQrPayload: null,
  qrTimerInterval: null,
  localCache: {
    workers: [],
    publicKeys: {},
    nfcCards: {},
    entitlements: {},
    deliveredEntitlements: new Set(),
    syncQueue: []
  },
  operatorOverridesCount: 0,
  supervisorId: '8022233344', // Lic. Claudia Patricia Vega (Supervisor)
  operatorId: 'd1112222-3333-4444-5555-666677778888', // Miguel Ángel Torres (Operador)
  is_demo_mode: false,
  supervisor_qr_mode: false,

  // Sistema de suscripción a eventos reactivos
  _listeners: {},

  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  },

  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[STATE EVENT ERROR: ${event}]`, err);
      }
    });
  },

  // Métodos de mutación reactiva
  setCurrentUser(user) {
    this.currentUser = user;
    if (user) {
      try {
        sessionStorage.setItem('sgbt_user', JSON.stringify(user));
        localStorage.removeItem('sgbt_user');
      } catch (e) {}
      if (window.SessionManager && typeof window.SessionManager.startSession === 'function') {
        window.SessionManager.startSession(user);
      }
    } else {
      try {
        sessionStorage.removeItem('sgbt_user');
        sessionStorage.removeItem('sgbt_session_meta');
        localStorage.removeItem('sgbt_user');
      } catch (e) {}
      if (window.SessionManager && typeof window.SessionManager.stopWatchdog === 'function') {
        window.SessionManager.stopWatchdog();
      }
    }
    this.emit('user:changed', user);
  },

  setSelectedWorkerId(workerId) {
    this.selectedWorkerId = workerId;
    this.emit('worker:selected', workerId);
  },

  updateWorkerPasskeyStatus(workerId, hasPasskey, deviceName = 'Dispositivo Enrolado') {
    // 1. Actualizar caché local de trabajadores
    if (this.localCache && this.localCache.workers) {
      const cached = this.localCache.workers.find(w => w.id === workerId || w.worker_id === workerId);
      if (cached) {
        cached.has_passkey = hasPasskey;
        cached.has_smartphone = 1;
        cached.auth_label = hasPasskey ? '🔐 Passkey Activa (FIDO2)' : '⚠️ Sin Dispositivo';
      }
    }

    // 2. Si el usuario actual es el trabajador modificado, actualizarlo en memoria y sessionStorage
    if (this.currentUser && this.currentUser.id === workerId) {
      this.currentUser.has_passkey = hasPasskey;
      this.currentUser.has_smartphone = 1;
      try {
        sessionStorage.setItem('sgbt_user', JSON.stringify(this.currentUser));
      } catch (e) {}
    }

    // 3. Emitir evento reactivo para repintado instantáneo de la interfaz (0ms)
    this.emit('passkey:enrolled', { workerId, hasPasskey, deviceName });
  }
};
