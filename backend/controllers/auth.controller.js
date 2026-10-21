// backend/controllers/auth.controller.js
// Controlador para autenticación, gestión de Passkeys FIDO2, verificación de QR y QR de supervisor

const crypto = require('crypto');
const { db, secureEnclaveSimulator } = require('../db');
const {
  generateP256KeyPair,
  generateNonce,
  generateWebAuthnChallenge,
  signOfflinePayload,
  verifyOfflineSignature
} = require('../crypto-utils');

const login = async (req, res) => {
  const { document_id } = req.body;

  if (!document_id || !document_id.trim()) {
    return res.status(400).json({ error: 'La Cédula de Identidad es requerida' });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');

  try {
    let worker = db.prepare(`
      SELECT w.*, d.name as department_name, d.code as department_code
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE UPPER(w.document_id) = ? 
         OR w.id = ? 
         OR UPPER(w.document_id) LIKE ?
         OR (LENGTH(?) >= 5 AND REPLACE(REPLACE(REPLACE(REPLACE(UPPER(w.document_id), 'V-', ''), 'E-', ''), 'V', ''), '.', '') = ?)
    `).get(cleanDoc, cleanDoc, `%${digitsOnly}%`, digitsOnly, digitsOnly);

    // Fallback de consulta en tiempo real a Supabase si no se encuentra en memoria
    if (!worker && digitsOnly.length >= 5) {
      try {
        const { supabase, isSupabaseConfigured } = require('../supabase');
        if (isSupabaseConfigured() && supabase) {
          const { data: remoteWorkers } = await supabase
            .from('workers')
            .select('*')
            .or(`document_id.eq.${cleanDoc},document_id.eq.V-${digitsOnly},document_id.eq.${digitsOnly}`);

          if (remoteWorkers && remoteWorkers.length > 0) {
            const rw = remoteWorkers[0];
            db.prepare(`
              INSERT OR REPLACE INTO workers (
                id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, contingency_reason, phone_number, avatar_url
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              rw.id,
              rw.document_id,
              rw.full_name,
              rw.email,
              rw.department_id,
              rw.shift || 'jornada_continua',
              rw.status || 'active',
              rw.worker_type || 'activo',
              rw.role || 'worker',
              rw.has_smartphone ? 1 : 0,
              rw.contingency_reason,
              rw.phone_number,
              rw.avatar_url
            );

            worker = db.prepare(`
              SELECT w.*, d.name as department_name, d.code as department_code
              FROM workers w
              LEFT JOIN departments d ON w.department_id = d.id
              WHERE w.id = ?
            `).get(rw.id);
          }
        }
      } catch (sbErr) {
        console.warn('[LOGIN SUPABASE FALLBACK WARNING]', sbErr.message);
      }
    }

    if (!worker) {
      return res.status(404).json({
        error: 'Funcionario no encontrado. Verifique la Cédula o consulte con Gestión Humana.'
      });
    }

    const passkey = db.prepare(`
      SELECT * FROM passkey_credentials 
      WHERE worker_id = ? AND status = 'active' 
      LIMIT 1
    `).get(worker.id);

    const today = new Date().toISOString().split('T')[0];
    let entitlement = db.prepare(`
      SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description
      FROM daily_entitlements de
      JOIN combos c ON de.combo_id = c.id
      WHERE de.worker_id = ? AND de.valid_date = ?
      LIMIT 1
    `).get(worker.id, today);

    // Auto-asignación en jornada activa para trabajadores activos/jubilados
    if (!entitlement && worker.status === 'active') {
      try {
        const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
        const newEntId = crypto.randomUUID();
        db.prepare(`
          INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
          VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(newEntId, worker.id, defaultCombo, today, worker.shift || 'jornada_continua');

        entitlement = db.prepare(`
          SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description
          FROM daily_entitlements de
          JOIN combos c ON de.combo_id = c.id
          WHERE de.worker_id = ? AND de.valid_date = ?
          LIMIT 1
        `).get(worker.id, today);
      } catch (autoEntErr) {
        console.warn('[LOGIN AUTO-ENTITLEMENT WARNING]', autoEntErr.message);
      }
    }

    res.json({
      success: true,
      user: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        email: worker.email,
        role: worker.role || 'worker',
        worker_type: worker.worker_type || 'activo',
        department: worker.department_name,
        has_passkey: Boolean(passkey),
        has_smartphone: Boolean(worker.has_smartphone)
      },
      entitlement: entitlement || null
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Error interno al autenticar' });
  }
};

const registerChallenge = (req, res) => {
  const { worker_id } = req.body;
  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id es requerido' });
  }

  const worker = db.prepare('SELECT id, full_name, email FROM workers WHERE id = ?').get(worker_id);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const challenge = generateWebAuthnChallenge();
  const options = {
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

  res.json(options);
};

const registerVerify = (req, res) => {
  const { worker_id, credential, device_name } = req.body;
  if (!worker_id || !credential) {
    return res.status(400).json({ error: 'worker_id y credential son requeridos' });
  }

  const worker = db.prepare('SELECT id FROM workers WHERE id = ?').get(worker_id);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  let credentialId = credential.credential_id;
  let publicKeyPem = credential.public_key_pem;

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

  res.json({
    status: 'success',
    message: 'Passkey enrolada exitosamente en Secure Enclave / TEE',
    credential_id: result.credentialId,
    public_key: result.publicKeyPem,
    entitlement_id: ent ? ent.id : null
  });
};

const signOffline = (req, res) => {
  const { worker_id, entitlement_id } = req.body;
  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id requerido' });
  }

  // Resolver derecho del trabajador para la jornada actual
  const today = new Date().toISOString().split('T')[0];
  let finalEntId = entitlement_id;
  const userEnt = db.prepare('SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? LIMIT 1').get(worker_id, today);
  if (userEnt) {
    finalEntId = userEnt.id;
  } else if (!finalEntId) {
    try {
      const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
      finalEntId = crypto.randomUUID();
      db.prepare(`
        INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
      `).run(finalEntId, worker_id, defaultCombo, today);
    } catch (e) {}
  }

  const cred = db.prepare(`
    SELECT credential_id, public_key, status
    FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
    ORDER BY enrolled_at DESC LIMIT 1
  `).get(worker_id);

  if (!cred) {
    return res.status(403).json({ error: 'El trabajador no posee una Passkey activa enrolada' });
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
    ent: entitlement_id,
    ts,
    nonce
  };

  const signature = signOfflinePayload(enclaveData.privateKeyPem, payload);

  res.json({
    qr_payload: {
      ...payload,
      sig: signature
    },
    qr_raw_string: JSON.stringify({ ...payload, sig: signature }),
    expires_in_seconds: 60,
    created_at: new Date(ts * 1000).toISOString()
  });
};

const getSupervisorDailyQr = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    let supervisor = db.prepare("SELECT id, document_id, full_name, email, role FROM workers WHERE role IN ('supervisor', 'admin') AND status = 'active' LIMIT 1").get();
    if (!supervisor) {
      supervisor = db.prepare("SELECT id, document_id, full_name, email, role FROM workers LIMIT 1").get();
    }

    if (!supervisor) {
      return res.status(404).json({ error: 'No se encontró un usuario supervisor o administrador registrado en el sistema.' });
    }

    const secretKey = 'SGBT_DAILY_SUPERVISOR_KEY_MIPPCI';
    const hmacToken = crypto.createHmac('sha256', secretKey)
      .update(`SUPERVISOR_APPROVAL_${supervisor.id}_${today}`)
      .digest('hex');

    const shortAuthCode = `SUP-${today.replace(/-/g, '').slice(2)}-${hmacToken.slice(0, 6).toUpperCase()}`;

    const qrPayload = JSON.stringify({
      protocol: 'SGBT_SUPERVISOR_DAILY_QR_V1',
      action: 'APPROVE_NO_SMARTPHONE_DELIVERY',
      date: today,
      supervisor_id: supervisor.id,
      supervisor_name: supervisor.full_name,
      supervisor_doc: supervisor.document_id,
      auth_code: shortAuthCode,
      token: hmacToken.slice(0, 32),
      expires_at: `${today}T23:59:59`
    });

    res.json({
      success: true,
      date: today,
      auth_code: shortAuthCode,
      supervisor,
      token: hmacToken.slice(0, 32),
      qr_payload: qrPayload,
      expires_at: `${today}T23:59:59`
    });
  } catch (err) {
    console.error('[SUPERVISOR DAILY QR ERROR]', err);
    res.status(500).json({ error: 'Error al generar el Código QR Diario del Supervisor' });
  }
};

const verifyQr = (req, res) => {
  const { qr_payload, distribution_point_id, delivered_by_user_id } = req.body;
  if (!qr_payload || !qr_payload.wid || !qr_payload.sig) {
    return res.status(400).json({ error: 'Payload QR incompleto' });
  }

  const { wid, ent, ts, nonce, sig } = qr_payload;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 180) {
    return res.status(400).json({
      valid: false,
      code: 'QR_EXPIRED',
      message: 'Código QR expirado (Vigencia máxima 180 segundos para evitar capturas de pantalla)'
    });
  }

  const cred = db.prepare(`
    SELECT public_key, status FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
    ORDER BY enrolled_at DESC LIMIT 1
  `).get(wid);

  if (!cred) {
    return res.status(403).json({
      valid: false,
      code: 'NO_ACTIVE_PASSKEY',
      message: 'El trabajador no posee una Passkey activa o su dispositivo fue revocado'
    });
  }

  const isSignatureValid = verifyOfflineSignature(cred.public_key, { wid, ent, ts, nonce }, sig);
  if (!isSignatureValid) {
    return res.status(401).json({
      valid: false,
      code: 'INVALID_CRYPTOGRAPHIC_SIGNATURE',
      message: 'Firma digital ECDSA P-256 inválida o adulterada'
    });
  }

  try {
    const deliveryId = crypto.randomUUID();
    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campId = activeCamp ? activeCamp.id : null;

    let distPoint = distribution_point_id 
      ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
      : null;
    if (!distPoint) {
      distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    }
    const finalPointId = distPoint ? distPoint.id : null;

    let operatorUser = delivered_by_user_id 
      ? db.prepare("SELECT id FROM workers WHERE id = ?").get(delivered_by_user_id) 
      : null;
    if (!operatorUser) {
      operatorUser = db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
    }
    const finalOperatorId = operatorUser ? operatorUser.id : null;

    db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id
      ) VALUES (?, ?, ?, ?, ?, 'passkey_qr', ?, ?, 0, CURRENT_TIMESTAMP, ?)
    `).run(
      deliveryId,
      ent,
      wid,
      finalPointId,
      finalOperatorId,
      sig,
      nonce,
      campId
    );

    // Respaldo asíncrono del despacho en Supabase Cloud
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        supabase.from('deliveries').insert([{
          id: deliveryId,
          entitlement_id: ent,
          worker_id: wid,
          distribution_point_id: finalPointId,
          delivered_by_user_id: finalOperatorId,
          verification_method: 'passkey_qr',
          signature_proof: sig,
          challenge_nonce: nonce,
          is_offline_sync: false
        }]).catch(e => console.warn('[DELIVERY SUPABASE SYNC ERROR]', e.message));

        supabase.from('daily_entitlements').update({ status: 'claimed' }).eq('id', ent).catch(() => {});
      }
    } catch (e) {}

    const worker = db.prepare('SELECT full_name, document_id, worker_type FROM workers WHERE id = ?').get(wid);
    const combo = db.prepare(`
      SELECT c.name, c.category, c.description, c.calories
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.id = ?
    `).get(ent);

    return res.json({
      valid: true,
      delivery_id: deliveryId,
      worker_name: worker.full_name,
      document_id: worker.document_id,
      worker_type: worker.worker_type || 'activo',
      combo_name: combo ? combo.name : 'Bolsa de Víveres y Proteína',
      combo_category: combo ? combo.category : 'bolsa_viveres',
      combo_description: combo ? combo.description : 'Víveres y alimentos no perecederos',
      message: '¡Despacho autorizado e irrefutable con firma biométrica!'
    });
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
      });
    }
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  login,
  registerChallenge,
  registerVerify,
  signOffline,
  getSupervisorDailyQr,
  verifyQr
};
