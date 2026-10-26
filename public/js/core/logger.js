// public/js/core/logger.js
// Capturador Universal de Logs del Cliente, Diagnóstico de Escaneo QR y Telemetría en Tiempo Real

(function() {
  const MAX_LOCAL_LOGS = 250;
  const localLogs = [];
  let isSending = false;
  const sendQueue = [];

  function formatTime(d = new Date()) {
    return d.toLocaleTimeString('es-VE', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function appendLog(level, action, message, payload = null, error = null) {
    const timestamp = new Date().toISOString();
    const entry = {
      id: 'clog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp,
      displayTime: formatTime(),
      level: level.toUpperCase(),
      source: 'client',
      action,
      message,
      payload,
      error: error ? (error.message || String(error)) : null
    };

    localLogs.unshift(entry);
    if (localLogs.length > MAX_LOCAL_LOGS) {
      localLogs.pop();
    }

    // Notificar al visor si está activo en la página
    try {
      window.dispatchEvent(new CustomEvent('app:log', { detail: entry }));
    } catch (e) {}

    // Enviar a la cola de sincronización con el servidor
    sendQueue.push(entry);
    flushQueue();

    return entry;
  }

  async function flushQueue() {
    if (isSending || sendQueue.length === 0) return;
    isSending = true;

    const item = sendQueue.shift();
    try {
      if (window.fetch) {
        await fetch('/api/v1/system/client-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: item.level,
            action: item.action,
            message: item.message,
            payload: item.payload,
            error: item.error,
            source: 'client_browser'
          })
        });
      }
    } catch (e) {
      // Si el servidor está temporalmente offline, no lanzar excepciones
    } finally {
      isSending = false;
      if (sendQueue.length > 0) {
        setTimeout(flushQueue, 300);
      }
    }
  }

  const AppLogger = {
    info(action, message, payload = null) {
      console.log(`ℹ️ [${action}]`, message, payload || '');
      return appendLog('INFO', action, message, payload);
    },

    warn(action, message, payload = null) {
      console.warn(`⚠️ [${action}]`, message, payload || '');
      return appendLog('WARN', action, message, payload);
    },

    error(action, message, error = null, payload = null) {
      console.error(`🛑 [${action}]`, message, error || '', payload || '');
      return appendLog('ERROR', action, message, payload, error);
    },

    scan(rawText, parsedPayload, isValid, statusMessage) {
      const level = isValid ? 'INFO' : 'WARN';
      const action = isValid ? 'QR_SCAN_SUCCESS' : 'QR_SCAN_FAILED';
      return appendLog(level, action, statusMessage, {
        raw: rawText,
        parsed: parsedPayload,
        valid: isValid
      });
    },

    getLogs() {
      return [...localLogs];
    },

    clearLogs() {
      localLogs.length = 0;
      try {
        window.dispatchEvent(new CustomEvent('app:log_clear'));
      } catch (e) {}
    },

    downloadLogs() {
      try {
        const text = localLogs.map(l => 
          `[${l.timestamp}] [${l.level}] [${l.action}] ${l.message} - Payload: ${JSON.stringify(l.payload || {})} - Error: ${l.error || 'None'}`
        ).join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sgbt_client_logs_${new Date().toISOString().split('T')[0]}.log`;
        a.click();
      } catch (e) {
        alert('Error descargando logs: ' + e.message);
      }
    }
  };

  // Capturar errores no manejados de JS
  window.addEventListener('error', (event) => {
    AppLogger.error('UNCAUGHT_JS_ERROR', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    AppLogger.error('UNHANDLED_PROMISE_REJECTION', event.reason?.message || String(event.reason), {
      stack: event.reason?.stack
    });
  });

  window.AppLogger = AppLogger;
  console.log('[LOGGER CLIENT] Capturador Universal de Logs inicializado.');
})();
