// backend/middleware/error.middleware.js
// Middleware centralizado de gestión de errores y formatos de respuesta HTTP RFC 7807

/**
 * Middleware que inyecta en `res` la función `res.problem()` conforme al estándar RFC 7807
 */
function rfc7807Middleware(req, res, next) {
  res.problem = function ({ status = 500, title, detail, type, instance, invalidParams, extra = {} }) {
    const statusCode = status || 500;
    const defaultTypes = {
      400: 'https://sgbt-combos.gob.ve/problems/bad-request',
      401: 'https://sgbt-combos.gob.ve/problems/unauthorized',
      403: 'https://sgbt-combos.gob.ve/problems/forbidden',
      404: 'https://sgbt-combos.gob.ve/problems/not-found',
      409: 'https://sgbt-combos.gob.ve/problems/conflict',
      413: 'https://sgbt-combos.gob.ve/problems/payload-too-large',
      415: 'https://sgbt-combos.gob.ve/problems/unsupported-media-type',
      422: 'https://sgbt-combos.gob.ve/problems/unprocessable-entity',
      500: 'https://sgbt-combos.gob.ve/problems/internal-server-error'
    };

    const problemPayload = {
      type: type || defaultTypes[statusCode] || 'about:blank',
      title: title || (statusCode >= 500 ? 'Error Interno del Servidor' : 'Solicitud no procesada'),
      status: statusCode,
      detail: detail || '',
      instance: instance || req.originalUrl,
      timestamp: new Date().toISOString(),
      ...extra
    };

    if (invalidParams && Array.isArray(invalidParams)) {
      problemPayload['invalid-params'] = invalidParams;
    }

    res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    return res.status(statusCode).json(problemPayload);
  };

  next();
}

function errorHandler(err, req, res, next) {
  const acceptsProblemJson = req.headers.accept && req.headers.accept.includes('application/problem+json');
  
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    if (acceptsProblemJson) {
      return res.problem({
        status: 413,
        title: 'Payload demasiado grande',
        detail: 'El archivo excede el tamaño máximo permitido (50MB).'
      });
    }
    return res.status(413).json({
      error: 'El archivo excede el tamaño máximo permitido (50MB).'
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    if (acceptsProblemJson) {
      return res.problem({
        status: 400,
        title: 'JSON Malformado',
        detail: 'Formato de datos JSON inválido en la solicitud.'
      });
    }
    return res.status(400).json({ error: 'Formato de datos JSON inválido en la solicitud.' });
  }

  if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
    // Si el cliente pide problem+json, incluimos las cabeceras estándar
    if (acceptsProblemJson) {
      return res.problem({
        status: 409,
        title: 'Beneficio Ya Reclamado Hoy',
        detail: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.',
        extra: {
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED'
        }
      });
    }

    return res.status(409).json({
      valid: false,
      code: 'DUPLICATE_DELIVERY_BLOCKED',
      message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.',
      type: 'https://sgbt-combos.gob.ve/problems/duplicate-delivery',
      title: 'Beneficio Ya Reclamado Hoy',
      status: 409,
      detail: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.',
      instance: req.originalUrl
    });
  }

  console.error('[SERVER UNHANDLED ERROR]', err);
  const statusCode = err.status || 500;
  
  if (acceptsProblemJson) {
    return res.problem({
      status: statusCode,
      title: 'Error Interno del Servidor',
      detail: err.message || 'Error interno del servidor'
    });
  }

  res.status(statusCode).json({
    error: err.message || 'Error interno del servidor',
    type: 'https://sgbt-combos.gob.ve/problems/internal-server-error',
    title: 'Error Interno',
    status: statusCode,
    instance: req.originalUrl
  });
}

module.exports = {
  errorHandler,
  rfc7807Middleware
};
