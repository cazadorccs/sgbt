// backend/middleware/idempotency.middleware.js
// Middleware de Idempotencia para Operaciones Críticas (RFC / API-Design)
// Previene doble despacho, cobros o mutaciones duplicadas en redes inestables de almacén.

const { db } = require('../db');

function idempotencyMiddleware(req, res, next) {
  // Solo se aplica a métodos mutadores
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (!idempotencyKey) {
    return next();
  }

  try {
    // Asegurar tabla idempotency_keys
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        user_id TEXT,
        endpoint TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        response_headers TEXT,
        response_body TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
    `);

    // Buscar clave previa existente
    const cached = db.prepare(`
      SELECT status_code, response_headers, response_body
      FROM idempotency_keys
      WHERE key = ?
    `).get(idempotencyKey);

    if (cached) {
      res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT');
      res.setHeader('X-Idempotency-Key', idempotencyKey);
      
      let parsedHeaders = {};
      try {
        parsedHeaders = JSON.parse(cached.response_headers || '{}');
      } catch (e) {}

      for (const [headerName, headerVal] of Object.entries(parsedHeaders)) {
        if (!['content-length', 'connection'].includes(headerName.toLowerCase())) {
          res.setHeader(headerName, headerVal);
        }
      }

      let parsedBody;
      try {
        parsedBody = JSON.parse(cached.response_body);
        return res.status(cached.status_code).json(parsedBody);
      } catch (e) {
        return res.status(cached.status_code).send(cached.response_body);
      }
    }

    // Interceptar la respuesta para registrarla en caso de éxito (status 200 a 299)
    res.setHeader('X-Cache-Lookup', 'MISS-IDEMPOTENT');
    res.setHeader('X-Idempotency-Key', idempotencyKey);

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const bodyStr = JSON.stringify(body);
          const headersStr = JSON.stringify({
            'content-type': res.getHeader('content-type') || 'application/json'
          });
          const userId = req.user ? req.user.id : null;

          db.prepare(`
            INSERT OR REPLACE INTO idempotency_keys (key, user_id, endpoint, status_code, response_headers, response_body)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(idempotencyKey, userId, req.originalUrl, res.statusCode, headersStr, bodyStr);
        } catch (dbErr) {
          console.warn('[IDEMPOTENCY CACHE ERROR]', dbErr.message);
        }
      }
      return originalJson(body);
    };

    res.send = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300 && typeof body === 'string') {
        try {
          const headersStr = JSON.stringify({
            'content-type': res.getHeader('content-type') || 'text/plain'
          });
          const userId = req.user ? req.user.id : null;

          db.prepare(`
            INSERT OR REPLACE INTO idempotency_keys (key, user_id, endpoint, status_code, response_headers, response_body)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(idempotencyKey, userId, req.originalUrl, res.statusCode, headersStr, body);
        } catch (dbErr) {
          console.warn('[IDEMPOTENCY CACHE ERROR]', dbErr.message);
        }
      }
      return originalSend(body);
    };

    next();
  } catch (err) {
    console.error('[IDEMPOTENCY MIDDLEWARE ERROR]', err);
    next();
  }
}

module.exports = {
  idempotencyMiddleware
};
