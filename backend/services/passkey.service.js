// backend/services/passkey.service.js
// Servicio de Criptografía FIDO2 / WebAuthn y Firmas Offline ECDSA P-256
// Responsable de desafíos biométricos, enrolamiento de llaves y simulación de Enclave Seguro

const crypto = require('crypto');
const { db, secureEnclaveSimulator } = require('../db');
const {
  generateP256KeyPair,
  generateNonce,
  generateWebAuthnChallenge,
  signOfflinePayload
} = require('../crypto-utils');

/**
 * Genera el desafío criptográfico WebAuthn para enrolamiento FIDO2 / Biometría Nativa (Android & iPhone).
 * @param {object} worker - Objeto trabajador con id, full_name, email.
 * @param {string} [clientHostname] - Hostname del cliente para evitar WebAuthn SecurityError
 * @returns {object} Opciones de registro WebAuthn
 */
function createRegisterChallenge(worker, clientHostname) {
  const challenge = generateWebAuthnChallenge();
  let rpId = 'localhost';
  if (clientHostname && typeof clientHostname === 'string') {
    const clean = clientHostname.split(':')[0].trim();
    if (clean && clean !== '127.0.0.1' && clean !== '0.0.0.0') {
      rpId = clean;
    }
  }

  return {
    challenge,
    rp: {
      name: 'Sistema Bienestar Social - Beneficios Alimenticios (MIPPCI)',
      id: rpId
    },
    user: {
      id: Buffer.from(worker.id).toString('base64url'),
      name: worker.email || `${worker.document_id || worker.id}@mippci.gob.ve`,
      displayName: worker.full_name
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },  // ES256 (ECDSA con curva P-256) - Estándar FIDO2/Android/iOS
      { alg: -257, type: 'public-key' } // RS256 (RSA 2048) - Fallback para enclaves antiguos
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  };
}

/**
 * Registra y activa una credencial Passkey para el beneficiario.
 * @param {object} params - { worker_id, credential, device_name }
 * @returns {object} { credentialId, publicKeyPem, entitlementId }
 */
async function registerPasskeyCredential({ worker_id, credential, device_name }) {
  let credentialId = credential.credential_id;
  let publicKeyPem = credential.public_key_pem;

  // Si el cliente no envió llave pública nativa, generar par P-256 institucional en Enclave Seguro
  if (!publicKeyPem) {
    const keyPair = generateP256KeyPair();
    publicKeyPem = keyPair.publicKey;
    credentialId = 'Passkey_SEC_' + crypto.randomBytes(12).toString('base64url');

    secureEnclaveSimulator.set(worker_id, {
      credentialId,
      privateKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey
    });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE passkey_credentials
      SET status = 'revoked'
      WHERE worker_id = ? AND status = 'active'
    `).run(worker_id);

    const newId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
      VALUES (?, ?, ?, ?, 0, ?, 'active')
    `).run(newId, worker_id, credentialId, publicKeyPem, device_name || 'Smartphone Corporativo');

    db.prepare(`
      UPDATE workers
      SET has_smartphone = 1, contingency_reason = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(worker_id);

    return { newId, credentialId, publicKeyPem };
  });

  const result = tx();

  // Asignar beneficio para la jornada de hoy de forma automática si no posee
  const today = new Date().toISOString().split('T')[0];
  let ent = db.prepare('SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? LIMIT 1').get(worker_id, today);
  if (!ent) {
    try {
      const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
      const wShift = db.prepare('SELECT shift FROM workers WHERE id = ?').get(worker_id)?.shift || 'jornada_continua';
      const newEntId = crypto.randomUUID();
      db.prepare(`
        INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(newEntId, worker_id, defaultCombo, today, wShift);
      ent = { id: newEntId };
    } catch (e) {}
  }

  // Respaldo garantizado en Supabase Cloud con AWAIT (Vercel Serverless)
  try {
    const { persistPasskey } = require('./cloud_sync.service');
    await persistPasskey({
      id: result.newId,
      workerId: worker_id,
      credentialId: result.credentialId,
      publicKeyPem: result.publicKeyPem,
      deviceName: device_name || 'Smartphone Corporativo',
      status: 'active'
    });
  } catch (e) {
    console.warn('[PASSKEY CLOUD SYNC EXCEPTION]', e.message);
  }

  return {
    credentialId: result.credentialId,
    publicKeyPem: result.publicKeyPem,
    entitlementId: ent ? ent.id : null
  };
}

/**
 * Genera el paquete criptográfico firmado para validación offline en mesas de despacho.
 * @param {object} params - { worker_id, entitlement_id, station, user }
 * @returns {object} Carga útil del QR firmado con ECDSA P-256
 */
function generateOfflinePasskeySignature({ worker_id, entitlement_id, station, user }) {
  // Prevención IDOR: Beneficiarios regulares solo pueden firmar para sí mismos
  if (user && user.role === 'worker' && user.id !== worker_id) {
    const err = new Error('No está autorizado para emitir credenciales offline en nombre de otro beneficiario.');
    err.status = 403;
    throw err;
  }

  const today = new Date().toISOString().split('T')[0];
  const isStation2 = String(station) === '2' || String(station) === 'estacion_2' || String(station) === 'proteina';
  const isStationAll = String(station) === 'all';
  let targetEnt = null;

  if (entitlement_id) {
    targetEnt = db.prepare('SELECT id, shift, combo_id FROM daily_entitlements WHERE id = ?').get(entitlement_id);
  }

  if (!targetEnt) {
    const checkDelivery = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
    const allWorkerEnts = db.prepare(`
      SELECT e.id, e.shift, e.status, c.category, c.name
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1
      ORDER BY c.created_at ASC
    `).all(worker_id, today);

    const pending = allWorkerEnts.filter(e => !checkDelivery.get(worker_id, e.id) && e.status !== 'claimed');

    if (isStation2) {
      targetEnt = pending.find(e => e.shift === 'estacion_2' || (e.category && e.category.includes('prote')) || (e.name && e.name.toLowerCase().includes('prote')))
        || allWorkerEnts.find(e => e.shift === 'estacion_2' || (e.category && e.category.includes('prote')));
    } else if (String(station) === '1' || String(station) === 'estacion_1') {
      targetEnt = pending.find(e => e.shift === 'estacion_1' || (e.category && e.category.includes('viveres')) || (e.name && e.name.toLowerCase().includes('víveres')))
        || allWorkerEnts.find(e => e.shift === 'estacion_1' || (e.category && e.category.includes('viveres')));
    } else {
      // station === 'all' o no especificado: seleccionar el próximo combo pendiente de hoy
      targetEnt = pending[0] || allWorkerEnts[0];
    }
  }

  const finalEntId = (targetEnt && targetEnt.id) || entitlement_id || crypto.randomUUID();

  const cred = db.prepare(`
    SELECT credential_id, public_key, status
    FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
    ORDER BY enrolled_at DESC LIMIT 1
  `).get(worker_id);

  if (!cred) {
    const err = new Error('El trabajador no tiene activada la validación en su celular');
    err.status = 403;
    throw err;
  }

  let enclaveData = secureEnclaveSimulator.get(worker_id);
  if (!enclaveData) {
    const keyPair = generateP256KeyPair();
    enclaveData = {
      credentialId: cred.credential_id,
      privateKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey
    };
    secureEnclaveSimulator.set(worker_id, enclaveData);
    db.prepare('UPDATE passkey_credentials SET public_key = ? WHERE credential_id = ?')
      .run(keyPair.publicKey, cred.credential_id);
  }

  const ts = Math.floor(Date.now() / 1000);
  const nonce = generateNonce(32);

  const payload = {
    wid: worker_id,
    ent: finalEntId,
    station: isStation2 ? '2' : (isStationAll ? 'all' : '1'),
    mode: isStationAll ? 'total' : 'station',
    ts,
    nonce
  };

  const signature = signOfflinePayload(enclaveData.privateKeyPem, payload);

  return {
    qr_payload: {
      ...payload,
      sig: signature
    },
    qr_raw_string: JSON.stringify({ ...payload, sig: signature }),
    expires_in_seconds: 60,
    created_at: new Date(ts * 1000).toISOString()
  };
}

module.exports = {
  createRegisterChallenge,
  registerPasskeyCredential,
  generateOfflinePasskeySignature
};
