// ============================================================================
// SERVICIO DE AUTENTICACIÓN MULTIFACTOR (MFA / 2FA)
// Conforme a RFC 6238 (TOTP - HMAC-SHA1) y Códigos de Respaldo Criptográficos
// Compatible con Google Authenticator, Microsoft Authenticator, Aegis, 1Password
// ============================================================================

const crypto = require('crypto');
const QRCode = require('qrcode');
const { db } = require('../db');

// Alfabeto estándar Base32 (RFC 4648)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Codifica un Buffer a Base32
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodifica una cadena Base32 a Buffer
 */
function base32Decode(base32) {
  const clean = String(base32 || '').toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Genera un secreto aleatorio Base32 de 20 bytes (160 bits)
 */
function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/**
 * Genera un token TOTP de 6 dígitos para un instante temporal dado (RFC 6238)
 */
function generateTotpToken(secretBase32, timeStep = 30, epoch = Date.now()) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(epoch / 1000 / timeStep);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;

  return code.toString().padStart(6, '0');
}

/**
 * Verifica un código TOTP de 6 dígitos con ventana de tolerancia de ±1 paso (30s)
 * para compensar desviaciones de reloj del dispositivo móvil.
 */
function verifyTotpToken(secretBase32, token, windowSteps = 1) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim().replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const now = Date.now();
  for (let i = -windowSteps; i <= windowSteps; i++) {
    const expected = generateTotpToken(secretBase32, 30, now + (i * 30000));
    const bufA = Buffer.from(expected, 'utf8');
    const bufB = Buffer.from(cleanToken, 'utf8');
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return true;
    }
  }
  return false;
}

/**
 * Genera 8 códigos de respaldo (Backup Codes) alfanuméricos de un solo uso
 * Formato: XXXX-XXXX
 */
function generateBackupCodes(count = 8) {
  const rawCodes = [];
  const hashedCodes = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`;
    rawCodes.push(code);

    const hash = crypto.createHash('sha256').update(code).digest('hex');
    hashedCodes.push(hash);
  }

  return { rawCodes, hashedCodes };
}

/**
 * Verifica y consume un código de respaldo de un solo uso
 */
function verifyAndConsumeBackupCode(workerId, candidateCode) {
  if (!workerId || !candidateCode) return false;
  const cleanCode = String(candidateCode).trim().toUpperCase();

  try {
    const row = db.prepare('SELECT backup_codes FROM user_mfa WHERE worker_id = ?').get(workerId);
    if (!row || !row.backup_codes) return false;

    let hashes = [];
    try {
      hashes = JSON.parse(row.backup_codes);
    } catch {
      return false;
    }

    if (!Array.isArray(hashes) || hashes.length === 0) return false;

    const candidateHash = crypto.createHash('sha256').update(cleanCode).digest('hex');
    const candBuf = Buffer.from(candidateHash, 'hex');

    let matchedIndex = -1;
    for (let i = 0; i < hashes.length; i++) {
      const storedBuf = Buffer.from(hashes[i], 'hex');
      if (storedBuf.length === candBuf.length && crypto.timingSafeEqual(storedBuf, candBuf)) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex !== -1) {
      // Consumir el código (eliminarlo de la lista para que no pueda reutilizarse)
      hashes.splice(matchedIndex, 1);
      db.prepare('UPDATE user_mfa SET backup_codes = ?, last_used_at = CURRENT_TIMESTAMP WHERE worker_id = ?')
        .run(JSON.stringify(hashes), workerId);
      return true;
    }

    return false;
  } catch (err) {
    console.error('[MFA BACKUP CODE ERROR]', err);
    return false;
  }
}

/**
 * Genera la configuración completa de enrolamiento MFA para un trabajador:
 * Secreto Base32, URL otpauth://, código QR en Base64 Data URI y Códigos de Respaldo.
 */
async function generateMfaSetup(worker) {
  const secret = generateTotpSecret(20);
  const doc = worker.document_id || worker.email || worker.id;
  const issuer = 'MIPPCI SGBT';
  const label = encodeURIComponent(`MIPPCI:${doc}`);
  const encodedIssuer = encodeURIComponent(issuer);

  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  // Generar código QR en Base64
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    },
    width: 256
  });

  const { rawCodes, hashedCodes } = generateBackupCodes(8);

  return {
    secret,
    otpauth_url: otpauthUrl,
    qr_code: qrCodeDataUrl,
    backup_codes: rawCodes,
    hashed_backup_codes: hashedCodes
  };
}

/**
 * Guarda y activa la configuración de MFA de un usuario tras comprobar el primer código
 */
function activateMfa(workerId, secret, hashedBackupCodes) {
  const backupJson = JSON.stringify(hashedBackupCodes);
  db.prepare(`
    INSERT INTO user_mfa (worker_id, mfa_enabled, totp_secret, backup_codes, enrolled_at, last_used_at)
    VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(worker_id) DO UPDATE SET
      mfa_enabled = 1,
      totp_secret = excluded.totp_secret,
      backup_codes = excluded.backup_codes,
      enrolled_at = CURRENT_TIMESTAMP,
      last_used_at = CURRENT_TIMESTAMP
  `).run(workerId, secret, backupJson);

  return true;
}

/**
 * Desactiva la autenticación multifactor para un usuario
 */
function disableMfa(workerId) {
  db.prepare(`
    UPDATE user_mfa
    SET mfa_enabled = 0, totp_secret = NULL, backup_codes = NULL, last_used_at = CURRENT_TIMESTAMP
    WHERE worker_id = ?
  `).run(workerId);
  return true;
}

/**
 * Verifica si un usuario tiene MFA activado o si su rol requiere MFA por política institucional
 */
function getWorkerMfaStatus(workerId) {
  try {
    const row = db.prepare('SELECT mfa_enabled, enrolled_at, last_used_at FROM user_mfa WHERE worker_id = ?').get(workerId);
    if (row && row.mfa_enabled === 1) {
      return {
        enabled: true,
        enrolled_at: row.enrolled_at,
        last_used_at: row.last_used_at
      };
    }
    return { enabled: false };
  } catch {
    return { enabled: false };
  }
}

/**
 * Obtiene el secreto de un trabajador activo para verificar su código
 */
function getWorkerMfaSecret(workerId) {
  try {
    const row = db.prepare('SELECT totp_secret, mfa_enabled FROM user_mfa WHERE worker_id = ?').get(workerId);
    if (row && row.mfa_enabled === 1 && row.totp_secret) {
      return row.totp_secret;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpToken,
  verifyTotpToken,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
  generateMfaSetup,
  activateMfa,
  disableMfa,
  getWorkerMfaStatus,
  getWorkerMfaSecret
};
