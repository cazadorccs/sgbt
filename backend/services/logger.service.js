// backend/services/logger.service.js
// Servicio centralizado de Auditoría, Captura Universal de Logs y Streaming en Tiempo Real
// Diseñado para trazabilidad forense, diagnóstico de escaneo QR y monitoreo de producción

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../db');

const LOGS_DIR = path.join(__dirname, '../logs');
const ACTIVITY_LOG_PATH = path.join(LOGS_DIR, 'activity.log');

// Asegurar existencia del directorio de logs
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (e) {
    console.warn('[LOGGER WARNING] No se pudo crear directorio de logs:', e.message);
  }
}

// Inicializar tabla relacional de logs si no existe
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS system_activity_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      action TEXT NOT NULL,
      method TEXT,
      endpoint TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      user_id TEXT,
      user_name TEXT,
      ip_address TEXT,
      request_payload TEXT,
      response_payload TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_activity_logs(timestamp)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_logs_level ON system_activity_logs(level)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_logs_action ON system_activity_logs(action)').run();
} catch (e) {
  console.warn('[LOGGER WARNING] Error inicializando tabla system_activity_logs:', e.message);
}

// Clientes suscritos al stream SSE en tiempo real
const logStreamClients = new Set();

/**
 * Sanitiza objetos o cadenas para eliminar credenciales y limitar tamaño
 */
function sanitizePayload(payload, maxLen = 3000) {
  if (!payload) return null;
  try {
    let obj = payload;
    if (typeof payload === 'string') {
      try { obj = JSON.parse(payload); } catch { return payload.slice(0, maxLen); }
    }
    const clean = JSON.parse(JSON.stringify(obj, (k, v) => {
      const lowerKey = k.toLowerCase();
      if (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('private_key')) {
        return '***REDACTED***';
      }
      return v;
    }));
    const str = JSON.stringify(clean);
    return str.length > maxLen ? str.slice(0, maxLen) + '...[TRUNCATED]' : str;
  } catch {
    return String(payload).slice(0, maxLen);
  }
}

/**
 * Registra un evento en la base de datos, en el archivo de texto y lo transmite por SSE
 */
function logActivity(entry) {
  const now = new Date();
  const timestamp = now.toISOString();
  const id = crypto.randomUUID();

  const level = (entry.level || 'INFO').toUpperCase();
  const source = entry.source || 'server';
  const action = entry.action || 'GENERAL_EVENT';
  const method = entry.method || null;
  const endpoint = entry.endpoint || null;
  const statusCode = entry.statusCode || (entry.status_code !== undefined ? entry.status_code : null);
  const durationMs = entry.durationMs || (entry.duration_ms !== undefined ? entry.duration_ms : null);
  const userId = entry.userId || entry.user_id || null;
  const userName = entry.userName || entry.user_name || null;
  const ipAddress = entry.ipAddress || entry.ip_address || entry.ip || null;
  const requestPayload = sanitizePayload(entry.requestPayload || entry.request_payload);
  const responsePayload = sanitizePayload(entry.responsePayload || entry.response_payload);
  const errorMessage = entry.errorMessage || entry.error_message || (entry.error ? (entry.error.message || String(entry.error)) : null);

  const logRecord = {
    id,
    timestamp,
    level,
    source,
    action,
    method,
    endpoint,
    status_code: statusCode,
    duration_ms: durationMs,
    user_id: userId,
    user_name: userName,
    ip_address: ipAddress,
    request_payload: requestPayload,
    response_payload: responsePayload,
    error_message: errorMessage
  };

  // 1. Inserción en base de datos SQLite
  try {
    db.prepare(`
      INSERT INTO system_activity_logs (
        id, timestamp, level, source, action, method, endpoint, status_code,
        duration_ms, user_id, user_name, ip_address, request_payload, response_payload, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, timestamp, level, source, action, method, endpoint, statusCode,
      durationMs, userId, userName, ipAddress, requestPayload, responsePayload, errorMessage
    );
  } catch (dbErr) {
    console.warn('[LOGGER DB ERROR]', dbErr.message);
  }

  // 2. Escritura en archivo persistente backend/logs/activity.log
  try {
    const textLine = `[${timestamp}] [${level}] [${source}] [${action}] ${method || ''} ${endpoint || ''} - Status: ${statusCode || 'N/A'} - Time: ${durationMs ? durationMs + 'ms' : 'N/A'} - User: ${userName || userId || 'Anon'} - Error: ${errorMessage || 'None'} - Payload: ${requestPayload || ''}\n`;
    fs.appendFileSync(ACTIVITY_LOG_PATH, textLine, 'utf8');
  } catch (fsErr) {
    // Si falla la escritura en disco no interrumpir el flujo
  }

  // 3. Emisión en tiempo real vía SSE a todos los observadores conectados
  if (logStreamClients.size > 0) {
    const sseMessage = `data: ${JSON.stringify(logRecord)}\n\n`;
    for (const client of logStreamClients) {
      try {
        client.res.write(sseMessage);
      } catch (e) {
        logStreamClients.delete(client);
      }
    }
  }

  return logRecord;
}

// Helpers semánticos
function logInfo(action, data = {}) {
  return logActivity({ level: 'INFO', action, ...data });
}

function logWarn(action, data = {}) {
  return logActivity({ level: 'WARN', action, ...data });
}

function logError(action, error, data = {}) {
  return logActivity({
    level: 'ERROR',
    action,
    errorMessage: error ? (error.message || String(error)) : null,
    errorStack: error ? error.stack : null,
    ...data
  });
}

function logScan(action, payload, result = {}, extra = {}) {
  const isOk = result.valid === true || result.success === true;
  return logActivity({
    level: isOk ? 'INFO' : 'WARN',
    source: 'scanner',
    action: `SCAN_${action.toUpperCase()}`,
    requestPayload: payload,
    responsePayload: result,
    errorMessage: result.message || result.error || null,
    ...extra
  });
}

/**
 * Consulta los logs filtrados con paginación
 */
function getRecentLogs({ limit = 100, level, action, search, source } = {}) {
  try {
    let sql = 'SELECT * FROM system_activity_logs WHERE 1=1';
    const params = [];

    if (level && level !== 'ALL') {
      sql += ' AND level = ?';
      params.push(level.toUpperCase());
    }
    if (source && source !== 'ALL') {
      sql += ' AND source = ?';
      params.push(source.toLowerCase());
    }
    if (action && action !== 'ALL') {
      sql += ' AND action LIKE ?';
      params.push(`%${action}%`);
    }
    if (search && search.trim()) {
      sql += ' AND (action LIKE ? OR endpoint LIKE ? OR error_message LIKE ? OR request_payload LIKE ? OR user_name LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(Math.min(parseInt(limit, 10) || 100, 500));

    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('[GET LOGS ERROR]', err);
    return [];
  }
}

/**
 * Limpia o rota los logs almacenados
 */
function clearLogs() {
  try {
    db.prepare('DELETE FROM system_activity_logs').run();
    if (fs.existsSync(ACTIVITY_LOG_PATH)) {
      fs.writeFileSync(ACTIVITY_LOG_PATH, `[${new Date().toISOString()}] [INFO] [server] [LOGS_CLEARED] Logs del sistema reiniciados por el administrador.\n`, 'utf8');
    }
    return { success: true, message: 'Registro de auditoría limpiado exitosamente.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Agrega un cliente SSE para el stream en vivo
 */
function addStreamClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'Canal de logs en tiempo real conectado' })}\n\n`);

  const client = { req, res, id: crypto.randomUUID() };
  logStreamClients.add(client);

  req.on('close', () => {
    logStreamClients.delete(client);
  });
}

module.exports = {
  logActivity,
  logInfo,
  logWarn,
  logError,
  logScan,
  getRecentLogs,
  clearLogs,
  addStreamClient,
  ACTIVITY_LOG_PATH
};
