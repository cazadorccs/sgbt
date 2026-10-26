// backend/middleware/audit_logger.middleware.js
// Middleware para interceptar todas las peticiones a la API y registrarlas en el sistema de logs

const { logActivity } = require('../services/logger.service');

function auditLoggerMiddleware(req, res, next) {
  // Ignorar peticiones de estáticos o preflight OPTIONS para evitar saturar el log
  if (req.method === 'OPTIONS' || (!req.path.startsWith('/api/') && !req.path.startsWith('/verify'))) {
    return next();
  }

  // Ignorar el polling continuo de SSE o delivery-status para mantener los logs legibles
  const isHighFrequencyPoll = req.path.includes('/auth/delivery-status') || req.path.includes('/auth/delivery-stream') || req.path.includes('/system/logs/stream');
  if (isHighFrequencyPoll && req.method === 'GET') {
    return next();
  }

  const startTime = Date.now();
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let capturedResponseBody = null;

  // Interceptar la respuesta para capturar el cuerpo retornado
  res.json = function(body) {
    capturedResponseBody = body;
    return originalJson(body);
  };

  res.send = function(body) {
    if (!capturedResponseBody) {
      capturedResponseBody = body;
    }
    return originalSend(body);
  };

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    // Determinar la acción semántica
    let action = 'API_REQUEST';
    if (req.path.includes('/verify/qr')) action = 'SCAN_VERIFY_QR';
    else if (req.path.includes('/auth/login')) action = 'USER_LOGIN';
    else if (req.path.includes('/auth/passkey/sign-offline')) action = 'PASSKEY_SIGN_OFFLINE';
    else if (req.path.includes('/auth/passkey/register')) action = 'PASSKEY_ENROLLMENT';
    else if (req.path.includes('/manual-dispatch/deliver')) action = 'MANUAL_DELIVERY';
    else if (req.path.includes('/supervisor/contingency')) action = 'CONTINGENCY_OVERRIDE';
    else if (req.path.includes('/combos') && req.method !== 'GET') action = 'COMBO_MUTATION';

    // Determinar nivel de log
    let level = 'INFO';
    if (statusCode >= 500) level = 'ERROR';
    else if (statusCode >= 400) level = 'WARN';

    // Extraer usuario autenticado si existe
    const user = req.user || (req.session && req.session.user) || null;
    const userId = user ? (user.id || user.userId || user.sub) : (req.body?.worker_id || req.body?.document_id || null);
    const userName = user ? (user.full_name || user.name || user.documentId) : null;

    // Extraer mensaje de error
    let errorMessage = null;
    if (isError) {
      if (capturedResponseBody && typeof capturedResponseBody === 'object') {
        errorMessage = capturedResponseBody.message || capturedResponseBody.error || capturedResponseBody.detail || 'Error HTTP ' + statusCode;
      } else if (typeof capturedResponseBody === 'string') {
        errorMessage = capturedResponseBody.slice(0, 300);
      }
    }

    logActivity({
      level,
      source: 'server',
      action,
      method: req.method,
      endpoint: req.originalUrl || req.path,
      statusCode,
      durationMs,
      userId,
      userName,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      requestPayload: req.body,
      responsePayload: capturedResponseBody,
      errorMessage
    });
  });

  next();
}

module.exports = {
  auditLoggerMiddleware
};
