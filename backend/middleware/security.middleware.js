// ============================================================================
// MIDDLEWARE DE SEGURIDAD Y ENDURECIMIENTO DE TRANSPORTE HTTP (HARDENING)
// Protección contra CVE-2026-111497 (Brotli Heap Corruption) y Ataques de Cabeceras
// ============================================================================

/**
 * Middleware de defensa en profundidad contra vulnerabilidades de descompresión
 * y corrupción de memoria en librerías nativas (e.g., CVE-2026-111497 / Brotli OOB Write).
 * 
 * Reglas de aplicación:
 * 1. Rechazo estricto de cualquier petición entrante con 'Content-Encoding' comprimido
 *    (br, brotli, gzip, deflate, compress) hacia los endpoints de la API.
 * 2. Inyección de cabeceras de seguridad HTTP estándar para mitigar MIME-sniffing,
 *    clickjacking y ataques basados en tipos de contenido.
 */
function securityHardening(req, res, next) {
  // 1. Inyección de Cabeceras de Seguridad Defensivas (OWASP Recommended)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // 2. Blindaje ante CVE-2026-111497: Inspección de Content-Encoding entrante
  const contentEncoding = (req.headers['content-encoding'] || '').toLowerCase().trim();

  if (contentEncoding && contentEncoding !== 'identity') {
    // Si la petición intenta enviar un payload comprimido con Brotli o cualquier otro algoritmo
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

module.exports = {
  securityHardening
};
