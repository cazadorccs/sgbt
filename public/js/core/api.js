// ============================================================================
// CORE: CENTRALIZED API CLIENT
// ============================================================================

window.API = {
  async get(url) {
    return this.request(url, { method: 'GET' });
  },

  async post(url, body) {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  async put(url, body) {
    return this.request(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  async patch(url, body = {}) {
    return this.request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  },

  async delete(url) {
    return this.request(url, { method: 'DELETE' });
  },

  async request(url, options = {}) {
    try {
      // Inyección automática del Token Criptográfico de Sesión Institucional (RBAC)
      const token = sessionStorage.getItem('sgbt_session_token') || localStorage.getItem('sgbt_session_token');
      const headers = { ...(options.headers || {}) };
      if (token && !headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      options.headers = headers;
      options.credentials = options.credentials || 'same-origin';

      const res = await fetch(url, options);
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
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error(`[API FETCH ERROR] URL: ${url}:`, err);
      throw err;
    }
  }
};
