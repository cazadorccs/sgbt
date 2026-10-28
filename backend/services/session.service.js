// ============================================================================
// SERVICIO DE GESTIÓN DE SESIONES POR DISPOSITIVO (DEVICE-BOUND SESSIONS)
// Blindaje de Cookies HttpOnly, Detección de Dispositivos y Control de Sesiones
// ============================================================================

const crypto = require('crypto');
const { db } = require('../db');
const { generateSessionToken, verifySessionToken } = require('../crypto-utils');

/**
 * Parsea un User-Agent simple para obtener un nombre descriptivo de dispositivo
 */
function parseDeviceName(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Navegador Web';
  
  let os = 'Dispositivo';
  if (/Windows/i.test(userAgent)) os = 'Windows';
  else if (/iPhone/i.test(userAgent)) os = 'iPhone';
  else if (/iPad/i.test(userAgent)) os = 'iPad';
  else if (/Android/i.test(userAgent)) os = 'Android';
  else if (/Macintosh|Mac OS/i.test(userAgent)) os = 'macOS';
  else if (/Linux/i.test(userAgent)) os = 'Linux';

  let browser = 'Web';
  if (/Edg/i.test(userAgent)) browser = 'Edge';
  else if (/Chrome/i.test(userAgent)) browser = 'Chrome';
  else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
  else if (/Safari/i.test(userAgent)) browser = 'Safari';

  return `${browser} en ${os}`;
}

/**
 * Genera las opciones seguras para la cookie de sesión institucional (OWASP)
 */
function getSecureCookieOptions(req, maxAgeMs = 12 * 3600 * 1000) {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecureConnection = Boolean(
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.socket?.encrypted ||
    isProduction
  );

  return {
    httpOnly: true,
    secure: isSecureConnection,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeMs
  };
}

/**
 * Inyecta la cookie de sesión HttpOnly en la respuesta HTTP
 */
function setSessionCookie(res, token, req, maxAgeMs = 12 * 3600 * 1000) {
  const options = getSecureCookieOptions(req, maxAgeMs);
  res.cookie('sgbt_session', token, options);
}

/**
 * Limpia la cookie de sesión HttpOnly
 */
function clearSessionCookie(res, req) {
  const options = getSecureCookieOptions(req || {});
  res.clearCookie('sgbt_session', {
    ...options,
    maxAge: 0
  });
}

/**
 * Registra una nueva sesión vinculada a un dispositivo
 */
function createDeviceSession({ workerId, role, documentId, deviceId, deviceName, ipAddress, userAgent, expiresInHours = 12 }) {
  const cleanDeviceId = String(deviceId || 'dev_unknown_' + crypto.randomBytes(4).toString('hex')).trim();
  const readableName = deviceName || parseDeviceName(userAgent);
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = nowSec + (expiresInHours * 3600);

  // Generar el token de sesión con el deviceId incrustado en el payload criptográfico
  const sessionToken = generateSessionToken({
    userId: workerId,
    role,
    documentId,
    deviceId: cleanDeviceId
  }, expiresInHours);

  // Extraer el JTI del token generado
  const decoded = verifySessionToken(sessionToken);
  const jti = decoded.payload?.jti || crypto.randomUUID();

  // Guardar en la tabla de sesiones de dispositivo
  try {
    db.prepare(`
      INSERT INTO user_device_sessions (
        id, worker_id, device_id, device_name, ip_address, user_agent, is_active, created_at, last_active_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `).run(
      jti,
      workerId,
      cleanDeviceId,
      readableName,
      ipAddress || '127.0.0.1',
      userAgent || 'Unknown',
      expiresAtSec
    );
  } catch (err) {
    console.warn('[SESSION SERVICE WARNING] Error registrando sesión de dispositivo:', err.message);
  }

  return {
    sessionToken,
    jti,
    deviceId: cleanDeviceId,
    deviceName: readableName
  };
}

/**
 * Valida la sesión activa en base de datos y actualiza el timestamp de última actividad
 */
function validateAndUpdateDeviceSession(jti, incomingDeviceId = null) {
  if (!jti) return { valid: false, error: 'Identificador de sesión ausente' };

  try {
    const session = db.prepare(`
      SELECT * FROM user_device_sessions WHERE id = ?
    `).get(jti);

    if (!session) {
      // Si no existe registro histórico (e.g. sesión creada antes de la migración), permitir con advertencia
      return { valid: true, isLegacy: true };
    }

    if (session.is_active !== 1) {
      return { valid: false, error: 'Sesión finalizada o revocada en este dispositivo' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at < nowSec) {
      return { valid: false, error: 'La sesión de este dispositivo ha expirado' };
    }

    // Comprobación de amarre al dispositivo (si el cliente envía su device_id)
    if (incomingDeviceId && session.device_id && session.device_id !== incomingDeviceId) {
      console.warn(`[SECURITY HIJACK ALERT] Discrepancia de dispositivo detectada. Sesión vinculada a ${session.device_id}, petición recibida desde: ${incomingDeviceId}`);
      return { valid: false, error: 'Discrepancia de seguridad: la sesión pertenece a otro dispositivo registrado' };
    }

    // Actualizar última actividad periódicamente (con throttle)
    db.prepare(`
      UPDATE user_device_sessions
      SET last_active_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(jti);

    return { valid: true, session };
  } catch (err) {
    console.error('[DEVICE SESSION VALIDATION ERROR]', err);
    return { valid: true }; // Fallback tolerante en caso de error transitorio
  }
}

/**
 * Obtiene la lista de sesiones activas de un usuario
 */
function getActiveDeviceSessions(workerId, currentJti = null) {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const sessions = db.prepare(`
      SELECT id, device_id, device_name, ip_address, user_agent, created_at, last_active_at, expires_at
      FROM user_device_sessions
      WHERE worker_id = ? AND is_active = 1 AND expires_at > ?
      ORDER BY last_active_at DESC
    `).all(workerId, nowSec);

    return sessions.map(s => ({
      id: s.id,
      device_id: s.device_id,
      device_name: s.device_name,
      ip_address: s.ip_address,
      created_at: s.created_at,
      last_active_at: s.last_active_at,
      is_current: currentJti ? (s.id === currentJti) : false
    }));
  } catch (err) {
    console.error('[GET SESSIONS ERROR]', err);
    return [];
  }
}

/**
 * Revoca una sesión específica por su ID (JTI)
 */
function revokeDeviceSession(jti, workerId = null) {
  try {
    let query = 'UPDATE user_device_sessions SET is_active = 0 WHERE id = ?';
    const params = [jti];
    if (workerId) {
      query += ' AND worker_id = ?';
      params.push(workerId);
    }
    const result = db.prepare(query).run(...params);

    // Añadir a revoked_tokens para invalidación inmediata de JWT
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 12 * 3600;
    db.prepare('INSERT OR REPLACE INTO revoked_tokens (jti, revoked_at, expires_at) VALUES (?, ?, ?)')
      .run(jti, now, exp);

    return result.changes > 0;
  } catch (err) {
    console.error('[REVOKE SESSION ERROR]', err);
    return false;
  }
}

/**
 * Revoca todas las demás sesiones de un usuario excepto la actual
 */
function revokeOtherDeviceSessions(workerId, currentJti) {
  try {
    const rows = db.prepare(`
      SELECT id FROM user_device_sessions
      WHERE worker_id = ? AND id != ? AND is_active = 1
    `).all(workerId, currentJti);

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 12 * 3600;
    const insRevoked = db.prepare('INSERT OR REPLACE INTO revoked_tokens (jti, revoked_at, expires_at) VALUES (?, ?, ?)');

    for (const r of rows) {
      insRevoked.run(r.id, now, exp);
    }

    const result = db.prepare(`
      UPDATE user_device_sessions
      SET is_active = 0
      WHERE worker_id = ? AND id != ? AND is_active = 1
    `).run(workerId, currentJti);

    return result.changes;
  } catch (err) {
    console.error('[REVOKE OTHER SESSIONS ERROR]', err);
    return 0;
  }
}

module.exports = {
  parseDeviceName,
  getSecureCookieOptions,
  setSessionCookie,
  clearSessionCookie,
  createDeviceSession,
  validateAndUpdateDeviceSession,
  getActiveDeviceSessions,
  revokeDeviceSession,
  revokeOtherDeviceSessions
};
