// backend/middleware/auth.middleware.js
// Middleware para verificación de sesión criptográfica y Control de Acceso Basado en Roles (RBAC)

const { verifySessionToken } = require('../crypto-utils');
const { db } = require('../db');

function extractToken(req) {
  // 1. Cabecera Authorization: Bearer
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  // 2. Cookie segura HttpOnly (sgbt_session)
  if (req.cookies && req.cookies.sgbt_session) {
    return String(req.cookies.sgbt_session).trim();
  }
  if (req.headers && req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)sgbt_session=([^;]+)/);
    if (match) return decodeURIComponent(match[1].trim());
  }
  // 3. Cabeceras alternativas
  if (req.headers['x-session-token']) {
    return String(req.headers['x-session-token']).trim();
  }
  if (req.headers['x-worker-session']) {
    return String(req.headers['x-worker-session']).trim();
  }
  if (req.query && req.query.session_token) {
    return String(req.query.session_token).trim();
  }
  return null;
}

function isTokenRevoked(jti) {
  if (!jti) return false;
  try {
    const revoked = db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(jti);
    return Boolean(revoked);
  } catch (e) {
    return false;
  }
}

/**
 * Middleware opcional de autenticación: Si hay token, lo valida y asigna req.user.
 */
function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const result = verifySessionToken(token);
  if (!result.valid || isTokenRevoked(result.payload?.jti)) {
    req.user = null;
    return next();
  }

  try {
    const worker = db.prepare(`
      SELECT id, document_id, full_name, email, role, status, worker_type
      FROM workers
      WHERE id = ?
    `).get(result.payload.sub);

    if (worker && worker.status === 'active') {
      req.user = worker;
    } else {
      req.user = null;
    }
  } catch (err) {
    console.warn('[AUTH MIDDLEWARE] Error consultando usuario:', err.message);
    req.user = null;
  }

  next();
}

/**
 * Middleware estricto: Exige una sesión válida para continuar.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Acceso no autorizado: Se requiere una sesión institucional activa (Token Bearer o Cookie ausente).'
    });
  }

  const result = verifySessionToken(token);
  if (!result.valid) {
    return res.status(401).json({
      error: `Sesión no válida: ${result.error}`
    });
  }

  if (isTokenRevoked(result.payload?.jti)) {
    return res.status(401).json({
      error: 'Sesión revocada: Este token de sesión ha sido invalidado mediante cierre de sesión.'
    });
  }

  try {
    const worker = db.prepare(`
      SELECT id, document_id, full_name, email, role, status, worker_type
      FROM workers
      WHERE id = ?
    `).get(result.payload.sub);

    if (!worker || worker.status !== 'active') {
      return res.status(401).json({
        error: 'El usuario asociado a esta sesión no está activo en la nómina institucional.'
      });
    }

    req.user = worker;
    next();
  } catch (err) {
    console.error('[AUTH MIDDLEWARE ERROR]', err);
    return res.status(500).json({ error: 'Error interno verificando credenciales' });
  }
}

/**
 * Middleware RBAC: Exige que el usuario posea al menos uno de los roles autorizados.
 * Los roles 'admin' y 'director' poseen acceso total por defecto.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Si req.user aún no está poblado, intentar resolverlo
    if (!req.user) {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({
          error: 'Acceso no autorizado: Debe iniciar sesión con credenciales administrativas.'
        });
      }

      const result = verifySessionToken(token);
      if (!result.valid) {
        return res.status(401).json({
          error: `Sesión no válida: ${result.error}`
        });
      }

      if (isTokenRevoked(result.payload?.jti)) {
        return res.status(401).json({
          error: 'Sesión revocada: Este token de sesión ha sido invalidado mediante cierre de sesión.'
        });
      }

      try {
        const worker = db.prepare(`
          SELECT id, document_id, full_name, email, role, status, worker_type
          FROM workers
          WHERE id = ?
        `).get(result.payload.sub);

        if (!worker || worker.status !== 'active') {
          return res.status(401).json({
            error: 'Usuario de sesión inactivo o no encontrado.'
          });
        }
        req.user = worker;
      } catch (err) {
        return res.status(500).json({ error: 'Error verificando rol de usuario' });
      }
    }

    const currentRole = (req.user.role || '').toLowerCase();
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    // Superusuarios y Directores institucionales tienen acceso universal
    if (currentRole === 'admin' || currentRole === 'director' || normalizedAllowed.includes(currentRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Acceso denegado: Su perfil no cuenta con permisos suficientes para esta operación administrativa.',
      required_roles: allowedRoles,
      current_role: currentRole
    });
  };
}

module.exports = {
  extractToken,
  authenticate,
  requireAuth,
  requireRole
};
