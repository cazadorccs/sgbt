// ============================================================================
// CORE: CENTRALIZED API CLIENT CON TIMEOUT Y RESILIENCIA MÓVIL (3G/4G/WIFI)
// ============================================================================

window.API = {
  hasToken() {
    return Boolean(sessionStorage.getItem('sgbt_session_token') || localStorage.getItem('sgbt_session_token'));
  },

  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  },

  async post(url, body, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body)
    });
  },

  async put(url, body, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body)
    });
  },

  async patch(url, body = {}, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body)
    });
  },

  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  },

  async request(url, options = {}) {
    const timeoutMs = typeof options.timeout === 'number' ? options.timeout : 8000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Inyección automática del Token Criptográfico de Sesión Institucional (RBAC)
      const token = sessionStorage.getItem('sgbt_session_token') || localStorage.getItem('sgbt_session_token');
      const headers = { ...(options.headers || {}) };
      if (token && !headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Inyección del identificador único de dispositivo para verificación de amarre de hardware
      const devId = (typeof window.getPersistentDeviceId === 'function')
        ? window.getPersistentDeviceId()
        : (localStorage.getItem('sgbt_device_id') || '');
      if (devId && !headers['X-Device-Id'] && !headers['x-device-id']) {
        headers['X-Device-Id'] = devId;
      }

      options.headers = headers;
      options.credentials = 'include';
      options.signal = options.signal || controller.signal;

      const res = await fetch(url, options);
      clearTimeout(timeoutId);

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.error(`[API PARSE ERROR] URL: ${url}`, rawText);
        throw new Error(`Respuesta no válida del servidor (${res.status})`);
      }

      if (!res.ok) {
        const errorMsg = data.error || data.message || `Error en la solicitud HTTP (${res.status})`;
        const httpErr = new Error(errorMsg);
        httpErr.status = res.status;
        httpErr.data = data;
        throw httpErr;
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);

      // Detección de fallos de conectividad o timeout en redes móviles intermitentes
      if (err.name === 'AbortError') {
        err.isTimeout = true;
        err.isNetworkError = true;
        err.message = `Tiempo de espera agotado (${timeoutMs}ms). Red móvil o Wi-Fi lenta.`;
      } else if (err instanceof TypeError || (err.message && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed')))) {
        err.isNetworkError = true;
      }

      console.error(`[API FETCH ERROR] URL: ${url}:`, err.message || err);
      throw err;
    }
  }
};
