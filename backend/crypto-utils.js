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

module.exports = {
  generateP256KeyPair,
  generateNonce,
  generateWebAuthnChallenge,
  canonicalizePayload,
  signOfflinePayload,
  verifyOfflineSignature,
  generateWebhookHmac,
  verifyWebhookHmac
};
