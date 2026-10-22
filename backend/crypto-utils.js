// ============================================================================
// CRIPTOGRAFÍA NATIVA: ECDSA P-256 (ES256) & FIDO2 / WEBAUTHN SIMULATOR
// ============================================================================

const crypto = require('crypto');

/**
 * Genera un par de llaves asimétricas ECDSA P-256 (secp256r1 / ES256).
 * Simula la generación de credenciales dentro del Secure Enclave / TEE.
 */
function generateP256KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1', // NIST P-256 / secp256r1
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return { publicKey, privateKey };
}

/**
 * Genera un Nonce criptográficamente seguro de 32 bytes (64 hex chars).
 */
function generateNonce(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Genera un Challenge aleatorio en Base64URL para FIDO2 / WebAuthn.
 */
function generateWebAuthnChallenge() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Normaliza y serializa el payload a firmar para garantizar consistencia de firma.
 */
function canonicalizePayload({ wid, ent, ts, nonce }) {
  return JSON.stringify({
    wid: String(wid),
    ent: String(ent),
    ts: Number(ts),
    nonce: String(nonce)
  });
}

/**
 * Firma el payload offline usando la clave privada ECDSA P-256.
 * Retorna la firma en formato Base64.
 */
function signOfflinePayload(privateKeyPem, { wid, ent, ts, nonce }) {
  const canonicalData = canonicalizePayload({ wid, ent, ts, nonce });
  const sign = crypto.createSign('SHA256');
  sign.update(canonicalData);
  sign.end();
  return sign.sign(privateKeyPem, 'base64');
}

/**
 * Verifica la firma ECDSA P-256 utilizando la clave pública PEM del trabajador.
 * Funciona de forma 100% offline contra la clave pública en base de datos.
 */
function verifyOfflineSignature(publicKeyPem, { wid, ent, ts, nonce }, signatureBase64) {
  try {
    const canonicalData = canonicalizePayload({ wid, ent, ts, nonce });
    const verify = crypto.createVerify('SHA256');
    verify.update(canonicalData);
    verify.end();
    return verify.verify(publicKeyPem, signatureBase64, 'base64');
  } catch (err) {
    console.error('Error verificando firma ECDSA P-256:', err.message);
    return false;
  }
}

/**
 * Genera la firma HMAC-SHA256 para webhooks de nómina.
 */
function generateWebhookHmac(secretKey, payloadJsonString) {
  return crypto.createHmac('sha256', secretKey).update(payloadJsonString).digest('hex');
}

/**
 * Valida la firma HMAC-SHA256 de un webhook entrante con timingSafeEqual para mitigar timing attacks.
 */
function verifyWebhookHmac(secretKey, payloadJsonString, headerSignature) {
  try {
    if (!headerSignature) return false;
    const cleanSig = headerSignature.replace(/^sha256=/, '');
    const expectedSig = generateWebhookHmac(secretKey, payloadJsonString);
    const bufA = Buffer.from(cleanSig, 'utf8');
    const bufB = Buffer.from(expectedSig, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const MAGIC_SECRET = process.env.MAGIC_LINK_SECRET || 'MIPPCI_SGBT_MAGIC_TOKEN_SECRET_2026';
const DELEGATION_SECRET = process.env.DELEGATION_SECRET || 'MIPPCI_SGBT_DELEGATION_SECRET_2026';

/**
 * Genera un token temporal de un solo uso firmado con HMAC-SHA256 (vigencia corta, ej. 15 min).
 */
function generateMagicLinkToken({ workerId, documentId }, expiresInMinutes = 15) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);
  const jti = generateNonce(16);
  const payload = Buffer.from(JSON.stringify({
    sub: workerId,
    doc: documentId,
    typ: 'magic_onboarding',
    exp,
    jti
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', MAGIC_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * Verifica la firma y expiración de un Magic Link Token.
 */
function verifyMagicLinkToken(token) {
  try {
    if (!token || typeof token !== 'string') return { valid: false, error: 'Token no provisto' };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'Formato de token inválido' };
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = crypto.createHmac('sha256', MAGIC_SECRET).update(`${headerB64}.${payloadB64}`).digest('base64url');
    const bufA = Buffer.from(sigB64, 'utf8');
    const bufB = Buffer.from(expectedSig, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return { valid: false, error: 'Firma de token adulterada o inválida' };
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'El enlace de auto-enrolamiento ha expirado (validez máx 15 min)' };
    }
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Genera un token de Delegación Criptográfica Temporal (Retiro por Terceros) firmado por el supervisor.
 * Validez por defecto de 24 a 48 horas.
 */
function generateDelegationToken(data, validHours = 24) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + (validHours * 3600);
  const jti = generateNonce(16);
  const payload = Buffer.from(JSON.stringify({
    protocol: 'SGBT_DELEGATED_CLAIM_V1',
    ...data,
    exp,
    jti
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', DELEGATION_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * Verifica la firma y vigencia del token de Delegación Criptográfica Temporal.
 */
function verifyDelegationToken(token) {
  try {
    if (!token || typeof token !== 'string') return { valid: false, error: 'Token de delegación no provisto' };
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'Formato de token de delegación inválido' };
    const [headerB64, payloadB64, sigB64] = parts;
    const expectedSig = crypto.createHmac('sha256', DELEGATION_SECRET).update(`${headerB64}.${payloadB64}`).digest('base64url');
    const bufA = Buffer.from(sigB64, 'utf8');
    const bufB = Buffer.from(expectedSig, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return { valid: false, error: 'Firma de delegación inválida o adulterada' };
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'El permiso temporal de delegación ha expirado' };
    }
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

module.exports = {
  generateP256KeyPair,
  generateNonce,
  generateWebAuthnChallenge,
  canonicalizePayload,
  signOfflinePayload,
  verifyOfflineSignature,
  generateWebhookHmac,
  verifyWebhookHmac,
  generateMagicLinkToken,
  verifyMagicLinkToken,
  generateDelegationToken,
  verifyDelegationToken
};
