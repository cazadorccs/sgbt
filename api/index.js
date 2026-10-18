// ============================================================================
// ENTRYPOINT PARA VERCEL SERVERLESS FUNCTION
// ============================================================================

let app = null;
let bootError = null;

try {
  app = require('../backend/server');
} catch (err) {
  console.error('[VERCEL BOOT ERROR] Fallo al cargar backend/server:', err);
  bootError = err;
}

let readyPromise = null;
try {
  const dbModule = require('../backend/db');
  readyPromise = dbModule.readyPromise;
} catch (dbErr) {
  console.error('[VERCEL DB MODULE ERROR]', dbErr);
  if (!bootError) bootError = dbErr;
}

module.exports = async (req, res) => {
  // Manejador de error en arranque para responder siempre con JSON estructurado
  if (bootError) {
    return res.status(500).json({
      error: 'Error de inicialización del servidor en Vercel',
      message: bootError.message,
      stack: process.env.NODE_ENV === 'development' ? bootError.stack : undefined
    });
  }

  try {
    if (readyPromise) {
      await readyPromise;
    }

    // Preservar la ruta original si Vercel la reescribe
    if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/public')) {
      const originalPath = req.headers['x-matched-path'] || req.headers['x-now-route-matches'];
      if (originalPath && originalPath.startsWith('/api')) {
        req.url = originalPath;
      }
    }

    return app(req, res);
  } catch (runtimeErr) {
    console.error('[VERCEL RUNTIME ERROR]', runtimeErr);
    return res.status(500).json({
      error: 'Error interno de ejecución en Vercel Serverless',
      message: runtimeErr.message
    });
  }
};
