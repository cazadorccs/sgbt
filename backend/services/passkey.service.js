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
 * Genera el desafío criptográfico WebAuthn para enrolamiento FIDO2.
 * @param {object} worker - Objeto trabajador con id, full_name, email.
 * @returns {object} Opciones de registro WebAuthn
 */
function createRegisterChallenge(worker) {
  const challenge = generateWebAuthnChallenge();
  return {
    challenge,
    rp: {
      name: 'Sistema Bienestar Social - Beneficios Alimenticios (MIPPCI)',
      id: 'bienestar.ministerio.gob.ve'
    },
    user: {
      id: Buffer.from(worker.id).toString('base64url'),
      name: worker.email,
      displayName: worker.full_name
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }
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

  // Respaldo asíncrono en Supabase Cloud
  try {
    const { supabase, isSupabaseConfigured } = require('../supabase');
    if (isSupabaseConfigured() && supabase) {
      supabase.from('passkey_credentials').upsert([{
        id: result.newId,
        worker_id,
        credential_id: result.credentialId,
        public_key: result.publicKeyPem,
        sign_count: 0,
        device_name: device_name || 'Smartphone Corporativo',
        status: 'active'
      }], { onConflict: 'credential_id' }).catch(e => console.warn('[SUPABASE PASSKEY SYNC WARN]', e.message));

      if (ent && ent.id) {
        supabase.from('daily_entitlements').upsert([{
          id: ent.id,
          worker_id,
          combo_id: 'c1a2b3c4-1111-2222-3333-444455556666',
          valid_date: today,
          status: 'pending'
        }], { onConflict: 'worker_id,valid_date,shift,combo_id' }).catch(() => {});
      }
    }
  } catch (e) {}

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
  let targetEnt = null;

  if (entitlement_id) {
    targetEnt = db.prepare('SELECT id, shift, combo_id FROM daily_entitlements WHERE id = ?').get(entitlement_id);
  }

  if (!targetEnt) {
    if (isStation2) {
      targetEnt = db.prepare(`
        SELECT e.id, e.shift FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND date(e.valid_date) = date(?)
        AND (e.shift = 'estacion_2' OR c.category IN ('combo_proteico', 'proteico') OR c.name LIKE '%Prote%')
        LIMIT 1
      `).get(worker_id, today);

      if (!targetEnt) {
        const pCombo = db.prepare("SELECT id, name, category FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();
        if (pCombo) {
          const newEntId = crypto.randomUUID();
          try {
            db.prepare(`
              INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
              VALUES (?, ?, ?, ?, 'estacion_2', 'pending')
            `).run(newEntId, worker_id, pCombo.id, today);
            targetEnt = { id: newEntId };
          } catch (e) {}
        }
      }
    } else {
      targetEnt = db.prepare(`
        SELECT e.id, e.shift FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND date(e.valid_date) = date(?)
        AND (e.shift = 'estacion_1' OR c.category IN ('bolsa_viveres', 'almuerzo') OR c.name LIKE '%Víveres%')
        LIMIT 1
      `).get(worker_id, today);

      if (!targetEnt) {
        const vCombo = db.prepare("SELECT id, name, category FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get();
        if (vCombo) {
          const newEntId = crypto.randomUUID();
          try {
            db.prepare(`
              INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
              VALUES (?, ?, ?, ?, 'estacion_1', 'pending')
            `).run(newEntId, worker_id, vCombo.id, today);
            targetEnt = { id: newEntId };
          } catch (e) {}
        }
      }
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
    station: isStation2 ? '2' : '1',
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
