// ============================================================================
// MIDDLEWARE DE SEGURIDAD Y ENDURECIMIENTO DE TRANSPORTE HTTP (HARDENING)
// Protección contra CVE-2026-111497 (Brotli Heap Corruption), Cabeceras OWASP y Rate Limiting
// ============================================================================

/**
 * Middleware de defensa en profundidad contra vulnerabilidades de descompresión
 * y corrupción de memoria en librerías nativas (e.g., CVE-2026-111497 / Brotli OOB Write).
 */
function securityHardening(req, res, next) {
  // 1. Inyección de Cabeceras de Seguridad Defensivas (OWASP Recommended)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'self';");

  // 2. Blindaje ante CVE-2026-111497: Inspección de Content-Encoding entrante
  const contentEncoding = (req.headers['content-encoding'] || '').toLowerCase().trim();

  if (contentEncoding && contentEncoding !== 'identity') {
    const forbiddenEncodings = ['br', 'brotli', 'gzip', 'deflate', 'compress', 'zstd'];
    const containsForbidden = forbiddenEncodings.some(enc => contentEncoding.includes(enc));

    if (containsForbidden) {
      console.warn(`[SECURITY ALERT] Intento de carga comprimida bloqueada (${contentEncoding}) desde IP: ${req.ip || req.socket.remoteAddress} a ${req.method} ${req.originalUrl}`);
      
      return res.status(415).json({
        error: 'Codificación de contenido no admitida por la política de seguridad (Content-Encoding no permitido).',
        code: 'UNSUPPORTED_CONTENT_ENCODING',
        detail: 'La API SGBT rechaza flujos comprimidos entrantes (Brotli/Gzip/Deflate) como mitigación activa ante CVE-2026-111497 y riesgos de descompresión.'
      });
    }
  }

  // 3. Validación de Longitud de Carga (Content-Length sanity check)
  const contentLength = req.headers['content-length'];
  if (contentLength && (isNaN(contentLength) || parseInt(contentLength, 10) < 0)) {
    return res.status(400).json({
      error: 'Cabecera Content-Length no válida.',
      code: 'INVALID_CONTENT_LENGTH'
    });
  }

  next();
}

/**
 * Rate Limiter en memoria para prevenir ataques de fuerza bruta en endpoints de autenticación
 */
const ipAttemptsMap = new Map();

function loginRateLimiter(windowMs = 60000, maxAttempts = 30) {
  return (req, res, next) => {
    // Si estamos en entorno de prueba automatizada, permitir sin bloqueo
    if (process.env.NODE_ENV === 'test') return next();

    const clientIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const now = Date.now();

    const record = ipAttemptsMap.get(clientIp) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    ipAttemptsMap.set(clientIp, record);

    if (record.count > maxAttempts) {
      return res.status(429).json({
        error: 'Demasiadas solicitudes de autenticación desde esta dirección IP. Intente de nuevo en 1 minuto.',
        code: 'RATE_LIMIT_EXCEEDED',
        retry_after_seconds: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

module.exports = {
  securityHardening,
  loginRateLimiter
};
