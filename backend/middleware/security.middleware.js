// ============================================================================
// MIDDLEWARE DE SEGURIDAD Y ENDURECIMIENTO DE TRANSPORTE HTTP (HARDENING)
// Protección contra CVE-2026-111497, Mitigación Activa XSS, Cabeceras OWASP y Anti-Fuerza Bruta
// ============================================================================

const { db } = require('../db');

/**
 * Middleware para parsear cookies de forma nativa sin dependencias externas
 */
function cookieParserMiddleware(req, res, next) {
  req.cookies = req.cookies || {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const pairs = cookieHeader.split(';');
    for (let i = 0; i < pairs.length; i++) {
      const idx = pairs[i].indexOf('=');
      if (idx !== -1) {
        const key = pairs[i].substring(0, idx).trim();
        const val = pairs[i].substring(idx + 1).trim();
        try {
          req.cookies[key] = decodeURIComponent(val);
        } catch {
          req.cookies[key] = val;
        }
      }
    }
  }
  next();
}

/**
 * Middleware de defensa en profundidad contra vulnerabilidades de descompresión,
 * cabeceras de seguridad OWASP y mitigación total contra Cross-Site Scripting (XSS).
 */
function securityHardening(req, res, next) {
  // 1. Inyección de Cabeceras de Seguridad Defensivas (OWASP Top 10 Recommended)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Content Security Policy (CSP) reforzada: Prohíbe object/embed, bloquea iframes y restringe fuentes
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));

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
 * Sanitiza recursivamente cadenas para prevenir Cross-Site Scripting (XSS).
 * Neutraliza <script>, <iframe>, event handlers (onload, onerror, onclick) y javascript: URIs.
 */
function sanitizeXssString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/javascript\s*:/gi, 'blocked-javascript:')
    .replace(/vbscript\s*:/gi, 'blocked-vbscript:')
    .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\bon\w+\s*=\s*[^>\s]+/gi, '');
}

function sanitizeObject(obj, currentKey = '') {
  if (!obj || typeof obj !== 'object') return obj;

  // Preservar datos legítimos de imágenes Base64 / QR
  if (typeof obj === 'string') {
    if (currentKey === 'photo_base64' || currentKey === 'avatar_url' || currentKey === 'qr_payload') {
      return obj;
    }
    return sanitizeXssString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item, idx) => sanitizeObject(item, String(idx)));
  }

  const sanitized = {};
  for (const key of Object.keys(obj)) {
    // Preservar campos que contienen datos binarios / hashes / firmas
    if (key === 'photo_base64' || key === 'password' || key === 'admin_secret' || key === 'passkey_proof' || key === 'rawBody') {
      sanitized[key] = obj[key];
    } else {
      sanitized[key] = sanitizeObject(obj[key], key);
    }
  }
  return sanitized;
}

/**
 * Middleware de Sanitización Activa Anti-XSS para req.body, req.query y req.params
 */
function xssSanitizerMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
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

/**
 * Registra un intento de login fallido en la base de datos (Protección contra fuerza bruta de cuentas)
 * Aplica bloqueo progresivo si se superan 5 intentos fallidos en 15 minutos.
 */
function recordFailedLogin(identifier, ip) {
  if (!identifier || process.env.NODE_ENV === 'test') return;
  const cleanId = String(identifier).trim().toUpperCase();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const id = `${cleanId}_${cleanIp}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = db.prepare('SELECT * FROM login_security_tracker WHERE id = ?').get(id);
    if (!existing) {
      db.prepare(`
        INSERT INTO login_security_tracker (id, identifier, ip_address, failed_attempts, first_failed_at, last_failed_at, locked_until)
        VALUES (?, ?, ?, 1, ?, ?, 0)
      `).run(id, cleanId, cleanIp, now, now);
    } else {
      const attempts = existing.failed_attempts + 1;
      let lockedUntil = existing.locked_until;

      // Si supera 5 intentos fallidos, bloquear por 15 minutos (900 segundos)
      if (attempts >= 5) {
        lockedUntil = now + (15 * 60);
        console.warn(`[SECURITY ALERT] Cuenta/IP bloqueada por 15 minutos por exceso de intentos fallidos: ${cleanId} desde IP ${cleanIp}`);
      }

      db.prepare(`
        UPDATE login_security_tracker
        SET failed_attempts = ?, last_failed_at = ?, locked_until = ?
        WHERE id = ?
      `).run(attempts, now, lockedUntil, id);
    }
  } catch (err) {
    console.warn('[LOGIN TRACKER ERROR]', err.message);
  }
}

/**
 * Comprueba si la cuenta o IP está temporalmente bloqueada por intentos fallidos
 */
function checkAccountLockout(identifier, ip) {
  if (!identifier || process.env.NODE_ENV === 'test') return { locked: false };
  const cleanId = String(identifier).trim().toUpperCase();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const id = `${cleanId}_${cleanIp}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = db.prepare('SELECT * FROM login_security_tracker WHERE id = ?').get(id);
    if (existing && existing.locked_until > now) {
      const remainingSecs = existing.locked_until - now;
      return {
        locked: true,
        remaining_seconds: remainingSecs,
        message: `Acceso temporalmente bloqueado por exceso de intentos fallidos. Intente de nuevo en ${Math.ceil(remainingSecs / 60)} minutos.`
      };
    }
    return { locked: false };
  } catch {
    return { locked: false };
  }
}

/**
 * Resetea el contador de fallos tras un inicio de sesión exitoso
 */
function resetFailedLogins(identifier, ip) {
  if (!identifier) return;
  const cleanId = String(identifier).trim().toUpperCase();
  const cleanIp = String(ip || '127.0.0.1').trim();
  const id = `${cleanId}_${cleanIp}`;
  try {
    db.prepare('DELETE FROM login_security_tracker WHERE id = ?').run(id);
  } catch {}
}

module.exports = {
  cookieParserMiddleware,
  securityHardening,
  xssSanitizerMiddleware,
  loginRateLimiter,
  recordFailedLogin,
  checkAccountLockout,
  resetFailedLogins
};
