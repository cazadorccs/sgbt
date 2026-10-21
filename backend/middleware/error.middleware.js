// backend/middleware/error.middleware.js
// Middleware centralizado de gestión de errores y formatos de respuesta HTTP

function errorHandler(err, req, res, next) {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      error: 'El archivo excede el tamaño máximo permitido (50MB).'
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Formato de datos JSON inválido en la solicitud.' });
  }

  if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
    return res.status(409).json({
      valid: false,
      code: 'DUPLICATE_DELIVERY_BLOCKED',
      message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
    });
  }

  console.error('[SERVER UNHANDLED ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor'
  });
}

module.exports = {
  errorHandler
};
