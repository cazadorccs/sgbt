// public/js/modules/log_viewer.js
// Visor Interactivo y Streaming en Tiempo Real de Logs del Sistema (Cliente & Servidor)

(function() {
  let eventSource = null;
  let allLogs = [];
  let currentFilterLevel = 'ALL';
  let currentSearchQuery = '';

  function initLogViewer() {
    // Escuchar botón en el menú de usuario
    document.getElementById('btnOpenSystemLogs')?.addEventListener('click', () => {
      openSystemLogsModal();
    });

    // Escuchar botón flotante si existe
    document.getElementById('btnFloatingLogsViewer')?.addEventListener('click', () => {
      openSystemLogsModal();
    });

    // Eventos del modal
    document.getElementById('btnCloseSystemLogsModal')?.addEventListener('click', closeSystemLogsModal);
    document.getElementById('btnHeaderCloseSystemLogsModal')?.addEventListener('click', closeSystemLogsModal);
    document.getElementById('btnRefreshLogs')?.addEventListener('click', fetchRecentLogs);
    document.getElementById('btnClearLogsServer')?.addEventListener('click', handleClearLogs);
    document.getElementById('btnDownloadServerLogs')?.addEventListener('click', () => {
      window.open('/api/v1/system/logs/download', '_blank');
    });
    document.getElementById('btnDownloadClientLogs')?.addEventListener('click', () => {
      if (window.AppLogger) window.AppLogger.downloadLogs();
    });

    // Filtros de nivel
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilterLevel = btn.dataset.level || 'ALL';
        renderLogsTable();
      });
    });

    // Búsqueda en vivo
    document.getElementById('inputSearchLogs')?.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.trim().toLowerCase();
      renderLogsTable();
    });

    // Escuchar logs generados localmente en el cliente
    window.addEventListener('app:log', (e) => {
      if (e.detail) {
        addLogEntry(e.detail, false);
      }
    });

    window.addEventListener('app:log_clear', () => {
      allLogs = allLogs.filter(l => l.source !== 'client');
      renderLogsTable();
    });
  }

  function startLogStream() {
    if (eventSource) return;
    try {
      eventSource = new EventSource('/api/v1/system/logs/stream');
      const statusBadge = document.getElementById('logStreamStatusBadge');

      eventSource.onopen = () => {
        if (statusBadge) {
          statusBadge.className = 'badge badge-success';
          statusBadge.innerHTML = '🟢 Conectado en Vivo (SSE)';
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const logData = JSON.parse(event.data);
          addLogEntry(logData, true);
        } catch (e) {}
      };

      eventSource.onerror = () => {
        if (statusBadge) {
          statusBadge.className = 'badge badge-warning';
          statusBadge.innerHTML = '🟠 Reconectando Stream...';
        }
      };
    } catch (e) {
      console.warn('[LOG STREAM] Error iniciando SSE:', e.message);
    }
  }

  function stopLogStream() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  async function fetchRecentLogs() {
    const tbody = document.getElementById('systemLogsTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #94a3b8;"><span class="spinner" style="display:inline-block; width:16px; height:16px; margin-right:6px;"></span> Cargando registros del sistema...</td></tr>`;
    }

    try {
      const res = await fetch('/api/v1/system/logs?limit=150');
      if (res.ok) {
        const data = await res.json();
        const serverLogs = (data.logs || []).map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          level: l.level,
          source: l.source,
          action: l.action,
          method: l.method,
          endpoint: l.endpoint,
          status_code: l.status_code,
          duration_ms: l.duration_ms,
          user_name: l.user_name,
          user_id: l.user_id,
          ip_address: l.ip_address,
          request_payload: l.request_payload,
          response_payload: l.response_payload,
          error_message: l.error_message
        }));

        // Combinar con logs del cliente
        const clientLogs = window.AppLogger ? window.AppLogger.getLogs().map(c => ({
          id: c.id,
          timestamp: c.timestamp,
          level: c.level,
          source: 'client',
          action: c.action,
          message: c.message,
          payload: c.payload,
          error_message: c.error
        })) : [];

        // Unificar y ordenar por fecha descendente
        const combined = [...serverLogs, ...clientLogs];
        combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        allLogs = combined.slice(0, 300);

        renderLogsTable();
      }
    } catch (e) {
      console.warn('[LOGS FETCH ERROR]', e);
    }
  }

  function addLogEntry(entry, shouldRender = true) {
    // Evitar duplicados por ID
    if (allLogs.some(l => l.id === entry.id)) return;
    allLogs.unshift(entry);
    if (allLogs.length > 300) allLogs.pop();
    if (shouldRender) {
      renderLogsTable();
    }
  }

  function renderLogsTable() {
    const tbody = document.getElementById('systemLogsTableBody');
    const counterBadge = document.getElementById('systemLogsCountBadge');
    if (!tbody) return;

    let filtered = allLogs;

    // Filtro por nivel
    if (currentFilterLevel === 'SCAN') {
      filtered = filtered.filter(l => (l.action && l.action.toLowerCase().includes('scan')) || l.source === 'scanner');
    } else if (currentFilterLevel === 'HTTP') {
      filtered = filtered.filter(l => l.method && l.endpoint);
    } else if (currentFilterLevel === 'CLIENT') {
      filtered = filtered.filter(l => l.source === 'client' || l.source === 'client_browser');
    } else if (currentFilterLevel !== 'ALL') {
      filtered = filtered.filter(l => l.level === currentFilterLevel);
    }

    // Filtro por texto de búsqueda
    if (currentSearchQuery) {
      filtered = filtered.filter(l => {
        const haystack = `${l.action} ${l.endpoint || ''} ${l.message || ''} ${l.user_name || ''} ${l.error_message || ''} ${l.request_payload || ''} ${JSON.stringify(l.payload || '')}`.toLowerCase();
        return haystack.includes(currentSearchQuery);
      });
    }

    if (counterBadge) {
      counterBadge.textContent = `${filtered.length} eventos`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: #94a3b8;">No se encontraron registros que coincidan con los filtros aplicados.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(log => {
      const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('es-VE', { hour12: false }) : '--:--:--';
      
      let badgeStyle = 'background: rgba(14, 165, 233, 0.2); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.4);';
      if (log.level === 'ERROR') {
        badgeStyle = 'background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4);';
      } else if (log.level === 'WARN') {
        badgeStyle = 'background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);';
      }

      let sourceIcon = '🌐';
      if (log.source === 'client' || log.source === 'client_browser') sourceIcon = '📱';
      if (log.source === 'scanner' || (log.action && log.action.includes('SCAN'))) sourceIcon = '📷';

      const hasPayload = Boolean(log.request_payload || log.response_payload || log.payload || log.error_message);
      const rowId = 'log_row_' + (log.id || Math.random().toString(36).slice(2, 7));

      return `
        <tr style="border-bottom: 1px solid #1e293b; font-family: monospace; font-size: 0.78rem; transition: background 0.15s ease;" onmouseover="this.style.background='rgba(30, 41, 59, 0.7)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 0.5rem 0.65rem; color: #94a3b8; white-space: nowrap;">
            ${timeStr}
          </td>
          <td style="padding: 0.5rem 0.65rem; white-space: nowrap;">
            <span style="display: inline-block; padding: 0.15rem 0.45rem; border-radius: 4px; font-weight: 700; font-size: 0.7rem; ${badgeStyle}">
              ${sourceIcon} ${log.level}
            </span>
          </td>
          <td style="padding: 0.5rem 0.65rem; color: #f1f5f9; font-weight: 600;">
            ${log.action || 'GENERAL'}
            ${log.error_message ? `<div style="color: #f87171; font-size: 0.72rem; margin-top: 2px;">⚠️ ${log.error_message}</div>` : ''}
          </td>
          <td style="padding: 0.5rem 0.65rem; color: #cbd5e1;">
            ${log.method ? `<span style="color: #38bdf8; font-weight: 700;">${log.method}</span> ` : ''}
            <span>${log.endpoint || log.message || '-'}</span>
          </td>
          <td style="padding: 0.5rem 0.65rem; text-align: center; white-space: nowrap;">
            ${log.status_code ? `<span class="badge" style="background: ${log.status_code < 400 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${log.status_code < 400 ? '#34d399' : '#f87171'}; font-weight: 700;">${log.status_code}</span>` : '-'}
            ${log.duration_ms ? `<span style="color: #64748b; font-size: 0.7rem; margin-left: 4px;">${log.duration_ms}ms</span>` : ''}
          </td>
          <td style="padding: 0.5rem 0.65rem; text-align: right; white-space: nowrap;">
            ${hasPayload ? `
              <button type="button" class="btn btn-outline" onclick="window.viewLogDetail('${log.id}')" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; border-radius: 4px; border-color: #334155; color: #94a3b8;">
                🔍 Detalle
              </button>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join('');
  }

  window.viewLogDetail = function(logId) {
    const entry = allLogs.find(l => l.id === logId);
    if (!entry) return;

    const modal = document.getElementById('logDetailViewerModal');
    const content = document.getElementById('logDetailViewerContent');
    const title = document.getElementById('logDetailViewerTitle');

    if (title) title.textContent = `Detalle del Evento: ${entry.action || 'Log'}`;
    if (content) {
      let formatted = {
        id: entry.id,
        timestamp: entry.timestamp,
        level: entry.level,
        source: entry.source,
        action: entry.action,
        endpoint: entry.endpoint,
        status_code: entry.status_code,
        duration_ms: entry.duration_ms,
        user: entry.user_name || entry.user_id,
        ip_address: entry.ip_address,
        error: entry.error_message
      };

      if (entry.request_payload) {
        try { formatted.request = JSON.parse(entry.request_payload); } catch { formatted.request = entry.request_payload; }
      }
      if (entry.response_payload) {
        try { formatted.response = JSON.parse(entry.response_payload); } catch { formatted.response = entry.response_payload; }
      }
      if (entry.payload) {
        formatted.client_payload = entry.payload;
      }

      content.textContent = JSON.stringify(formatted, null, 2);
    }

    if (modal) modal.style.display = 'flex';
  };

  window.closeLogDetailModal = function() {
    const modal = document.getElementById('logDetailViewerModal');
    if (modal) modal.style.display = 'none';
  };

  async function handleClearLogs() {
    if (!confirm('¿Está seguro de que desea limpiar la pantalla de logs y el historial reciente en el servidor?')) return;
    try {
      await fetch('/api/v1/system/logs', { method: 'DELETE' });
      allLogs = [];
      if (window.AppLogger) window.AppLogger.clearLogs();
      renderLogsTable();
      if (window.showToast) window.showToast('Historial de logs limpiado exitosamente.', 'info');
    } catch (e) {
      alert('Error limpiando logs: ' + e.message);
    }
  }

  function openSystemLogsModal() {
    const modal = document.getElementById('systemLogsModal');
    if (modal) {
      modal.style.display = 'flex';
      fetchRecentLogs();
      startLogStream();
    }
  }

  function closeSystemLogsModal() {
    const modal = document.getElementById('systemLogsModal');
    if (modal) {
      modal.style.display = 'none';
      stopLogStream();
    }
  }

  window.openSystemLogsModal = openSystemLogsModal;
  window.closeSystemLogsModal = closeSystemLogsModal;

  // Inicializar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogViewer);
  } else {
    initLogViewer();
  }
})();
