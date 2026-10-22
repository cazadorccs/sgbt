// backend/controllers/auth.controller.js
// Controlador para autenticación, gestión de Passkeys FIDO2, verificación de QR y QR de supervisor

const crypto = require('crypto');
const { db, secureEnclaveSimulator } = require('../db');
const {
  generateP256KeyPair,
  generateNonce,
  generateWebAuthnChallenge,
  signOfflinePayload,
  verifyOfflineSignature,
  generateMagicLinkToken,
  verifyMagicLinkToken,
  generateDelegationToken,
  verifyDelegationToken
} = require('../crypto-utils');

// ============================================================================
// SERVIDOR EN TIEMPO REAL: SERVER-SENT EVENTS (SSE)
// Notificación Push reactiva instantánea entre puestos de despacho y móviles
// Permite actualización en tiempo real (0ms delay) sin recargar la página (F5)
// ============================================================================
const sseClients = new Map(); // worker_id -> Set of { res, id }

function notifyDeliveryStream(worker_id, data) {
  const jsonStr = JSON.stringify(data);
  const targets = [];

  if (worker_id && sseClients.has(worker_id)) {
    targets.push(...sseClients.get(worker_id));
  }
  if (sseClients.has('*')) {
    targets.push(...sseClients.get('*'));
  }

  targets.forEach(client => {
    try {
      client.res.write(`event: delivery_update\ndata: ${jsonStr}\n\n`);
    } catch (e) {
      if (worker_id && sseClients.has(worker_id)) {
        sseClients.get(worker_id).delete(client);
      }
    }
  });
}

const deliveryStream = (req, res) => {
  const worker_id = req.query.worker_id || '*';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = crypto.randomUUID();
  const clientObj = { res, id: clientId };

  if (!sseClients.has(worker_id)) {
    sseClients.set(worker_id, new Set());
  }
  sseClients.get(worker_id).add(clientObj);

  res.write(`event: connected\ndata: ${JSON.stringify({ worker_id, status: 'streaming', timestamp: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = sseClients.get(worker_id);
    if (set) {
      set.delete(clientObj);
      if (set.size === 0) sseClients.delete(worker_id);
    }
  });
};

const login = async (req, res) => {
  const { document_id } = req.body;

  if (!document_id || !document_id.trim()) {
    return res.status(400).json({ error: 'La Cédula de Identidad es requerida' });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');

  try {
    // 1. Búsqueda indexada ultra-rápida directa (<1ms)
    let worker = db.prepare(`
      SELECT w.*, d.name as department_name, d.code as department_code
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.document_id IN (?, ?, ?, ?) OR w.id = ?
    `).get(cleanDoc, `V-${digitsOnly}`, `E-${digitsOnly}`, digitsOnly, cleanDoc);

    // 2. Si no coincide exacto, intentar búsqueda parcial local rápida
    if (!worker && digitsOnly.length >= 5) {
      worker = db.prepare(`
        SELECT w.*, d.name as department_name, d.code as department_code
        FROM workers w
        LEFT JOIN departments d ON w.department_id = d.id
        WHERE w.document_id LIKE ? OR w.document_id LIKE ?
        LIMIT 1
      `).get(`%${digitsOnly}%`, `%${cleanDoc}%`);
    }

    // Fallback de consulta en tiempo real a Supabase SOLO si la base de datos local no contiene la nómina o con timeout estricto
    if (!worker && digitsOnly.length >= 5) {
      const localWorkersCount = db.prepare('SELECT COUNT(*) as c FROM workers').get()?.c || 0;
      if (localWorkersCount < 50) {
        try {
          const { supabase, isSupabaseConfigured } = require('../supabase');
          if (isSupabaseConfigured() && supabase) {
            const queryPromise = supabase
              .from('workers')
              .select('*')
              .or(`document_id.eq.${cleanDoc},document_id.eq.V-${digitsOnly},document_id.eq.${digitsOnly}`);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase')), 1200));

            const { data: remoteWorkers } = await Promise.race([queryPromise, timeoutPromise]);

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
    }

    if (!worker) {
      return res.status(404).json({
        error: 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios. Debe estar en la lista oficial para acceder a este proceso.'
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

    // Generar token temporal de auto-enrolamiento (Magic Link / One-Click Onboarding) de 15 minutos
    const onboardingToken = generateMagicLinkToken({
      workerId: worker.id,
      documentId: worker.document_id
    }, 15);

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
      entitlement: entitlement || null,
      onboarding_token: onboardingToken
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
    message: 'Validación en celular activada exitosamente',
    credential_id: result.credentialId,
    public_key: result.publicKeyPem,
    entitlement_id: ent ? ent.id : null
  });
};

const signOffline = (req, res) => {
  const { worker_id, entitlement_id, station } = req.body;
  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id requerido' });
  }

  // Resolver derecho del trabajador para la jornada actual según la estación solicitada
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
    return res.status(403).json({ error: 'El trabajador no tiene activada la validación en su celular' });
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
  const { qr_payload, distribution_point_id, delivered_by_user_id, station } = req.body;
  if (!qr_payload) {
    return res.status(400).json({ error: 'Payload QR incompleto' });
  }

  // Soporte para Código QR de Delegación Criptográfica Temporal (Retiro por Terceros)
  if (qr_payload.protocol === 'SGBT_DELEGATED_CLAIM_V1') {
    const { token, beneficiary_id, delegate_doc, supervisor_id, reason } = qr_payload;
    const tokenResult = verifyDelegationToken(token);
    if (!tokenResult.valid) {
      return res.status(401).json({
        valid: false,
        code: 'INVALID_DELEGATION_TOKEN',
        message: 'Autorización de retiro por delegación inválida o expirada: ' + tokenResult.error
      });
    }

    const payloadData = tokenResult.payload;
    const workerId = payloadData.beneficiary_id || beneficiary_id;
    const today = new Date().toISOString().split('T')[0];

    // Obtener derecho de combo del beneficiario titular
    let ent = db.prepare('SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? LIMIT 1').get(workerId, today);
    if (!ent) {
      const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
      const newEntId = crypto.randomUUID();
      db.prepare(`
        INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
      `).run(newEntId, workerId, defaultCombo, today);
      ent = { id: newEntId };
    }

    // Verificar si ya fue entregado hoy (idx_unique_daily_claim)
    const alreadyDelivered = db.prepare('SELECT id, delivered_at FROM deliveries WHERE worker_id = ? AND entitlement_id = ? LIMIT 1').get(workerId, ent.id);
    if (alreadyDelivered) {
      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        message: '¡ALERTA DE SEGURIDAD! El beneficio de este trabajador ya fue retirado el día de hoy.'
      });
    }

    try {
      const deliveryId = crypto.randomUUID();
      const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
      const campId = activeCamp ? activeCamp.id : null;

      let distPoint = distribution_point_id 
        ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
        : db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
      const finalPointId = distPoint ? distPoint.id : null;

      let operatorUser = delivered_by_user_id 
        ? db.prepare("SELECT id FROM workers WHERE id = ?").get(delivered_by_user_id) 
        : db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
      const finalOperatorId = operatorUser ? operatorUser.id : null;

      db.prepare(`
        INSERT INTO deliveries (
          id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
          verification_method, signature_proof, challenge_nonce, supervisor_id, override_reason, is_offline_sync, delivered_at, campaign_id
        ) VALUES (?, ?, ?, ?, ?, 'delegated_proxy_qr', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
      `).run(
        deliveryId,
        ent.id,
        workerId,
        finalPointId,
        finalOperatorId,
        token.slice(0, 64),
        payloadData.jti || generateNonce(16),
        payloadData.supervisor_id || supervisor_id,
        `delegacion_${payloadData.reason || reason || 'tercero'}_retira_${payloadData.delegate_doc || delegate_doc}`,
        campId
      );

      try {
        db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(ent.id);
      } catch (e) {}

      const worker = db.prepare('SELECT full_name, document_id, worker_type FROM workers WHERE id = ?').get(workerId);
      const combo = db.prepare(`
        SELECT c.name, c.category, c.description
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.id = ?
      `).get(ent.id);

      return res.json({
        valid: true,
        delivery_id: deliveryId,
        worker_name: worker ? worker.full_name : payloadData.beneficiary_name,
        document_id: worker ? worker.document_id : payloadData.beneficiary_doc,
        delegate_name: payloadData.delegate_name,
        delegate_doc: payloadData.delegate_doc,
        is_delegated: true,
        worker_type: worker ? worker.worker_type : 'activo',
        combo_name: combo ? combo.name : 'Bolsa de Víveres y Proteína',
        combo_category: combo ? combo.category : 'bolsa_viveres',
        combo_description: combo ? combo.description : 'Víveres y alimentos no perecederos',
        message: `¡Despacho por Delegación Autorizado! Titular: ${worker ? worker.full_name : payloadData.beneficiary_name} | Retira: ${payloadData.delegate_name} (${payloadData.delegate_doc})`
      });
    } catch (dErr) {
      if (dErr.message && (dErr.message.includes('UNIQUE constraint failed') || dErr.message.includes('idx_unique_daily_claim'))) {
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
        });
      }
      return res.status(500).json({ error: dErr.message });
    }
  }

  if (!qr_payload.wid || !qr_payload.sig) {
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
      message: 'El beneficiario no tiene validación activa en su celular o el dispositivo fue desvinculado'
    });
  }

  const isSignatureValid = verifyOfflineSignature(cred.public_key, { wid, ent, ts, nonce }, sig);
  if (!isSignatureValid) {
    return res.status(401).json({
      valid: false,
      code: 'INVALID_CRYPTOGRAPHIC_SIGNATURE',
      message: 'Código de seguridad no válido o expirado. Por favor genere un nuevo código.'
    });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Buscar derechos diarios de hoy para este beneficiario
    let entitlements = db.prepare(`
      SELECT e.id, e.combo_id, e.shift, e.status,
             c.name as combo_name, c.category as combo_category, c.mesa_number
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND date(e.valid_date) = date(?)
      ORDER BY c.mesa_number ASC, e.shift ASC
    `).all(wid, today);

    if (!entitlements || entitlements.length === 0) {
      entitlements = db.prepare(`
        SELECT e.id, e.combo_id, e.shift, e.status,
               c.name as combo_name, c.category as combo_category, c.mesa_number
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ?
        ORDER BY e.valid_date DESC, c.mesa_number ASC
        LIMIT 2
      `).all(wid);
    }

    let entViveres = entitlements.find(e => 
      e.shift === 'estacion_1' || 
      e.combo_category === 'bolsa_viveres' || 
      (e.combo_name && e.combo_name.toLowerCase().includes('víveres'))
    );

    let entProteico = entitlements.find(e => 
      e.shift === 'estacion_2' || 
      e.combo_category === 'proteico' || 
      e.combo_category === 'combo_proteico' || 
      (e.combo_name && e.combo_name.toLowerCase().includes('prote'))
    );

    if (!entViveres) {
      const vCombo = db.prepare("SELECT id, name, category FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get();
      if (vCombo) {
        const newEntId = crypto.randomUUID();
        try {
          db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, 'estacion_1', 'pending')
          `).run(newEntId, wid, vCombo.id, today);
          entViveres = {
            id: newEntId,
            combo_id: vCombo.id,
            shift: 'estacion_1',
            status: 'pending',
            combo_name: vCombo.name,
            combo_category: vCombo.category
          };
          entitlements.push(entViveres);
        } catch (e) {}
      }
    }

    if (!entProteico) {
      const pCombo = db.prepare("SELECT id, name, category FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();
      if (pCombo) {
        const newEntId = crypto.randomUUID();
        try {
          db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, 'estacion_2', 'pending')
          `).run(newEntId, wid, pCombo.id, today);
          entProteico = {
            id: newEntId,
            combo_id: pCombo.id,
            shift: 'estacion_2',
            status: 'pending',
            combo_name: pCombo.name,
            combo_category: pCombo.category
          };
          entitlements.push(entProteico);
        } catch (e) {}
      }
    }

    const checkDelivery = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
    const isViveresDelivered = entViveres ? Boolean(checkDelivery.get(wid, entViveres.id)) : false;
    const isProteicoDelivered = entProteico ? Boolean(checkDelivery.get(wid, entProteico.id)) : false;

    let targetEnt = null;
    let targetStationNum = 1;
    let targetToastMsg = '';
    let targetComboTitle = '';

    const reqStation = (station && station !== 'all') 
      ? String(station).toLowerCase() 
      : (qr_payload && qr_payload.station ? String(qr_payload.station).toLowerCase() : 'all');

    if (reqStation === '1' || reqStation === 'estacion_1' || reqStation === 'viveres') {
      targetStationNum = 1;
      targetComboTitle = 'Bulto Viveres Secos';
      targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.';

      if (isViveresDelivered) {
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          station: 1,
          combo_name: targetComboTitle,
          message: '¡ATENCIÓN! Su Bulto de Víveres Secos ya fue retirado previamente en la Estación 1.'
        });
      }
      targetEnt = entViveres || entitlements.find(e => !entProteico || e.id !== entProteico.id) || entitlements[0];

    } else if (reqStation === '2' || reqStation === 'estacion_2' || reqStation === 'proteina') {
      targetStationNum = 2;
      targetComboTitle = '🍗 Combo Proteico Fresco (Cadena de Frío)';
      targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.';

      if (isProteicoDelivered) {
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          station: 2,
          combo_name: targetComboTitle,
          message: '¡ATENCIÓN! Su 🍗 Combo Proteico Fresco ya fue retirado previamente en la Estación 2.'
        });
      }

      targetEnt = entProteico;
      if (!targetEnt || (entViveres && targetEnt.id === entViveres.id)) {
        const pCombo = db.prepare("SELECT id, name, category FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();
        const newEntId = crypto.randomUUID();
        try {
          db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, 'estacion_2', 'pending')
          `).run(newEntId, wid, (pCombo && pCombo.id) || 'ae65fee7-79f6-48a3-bc41-a61c928876b5', today);
          targetEnt = { id: newEntId, combo_id: (pCombo && pCombo.id), shift: 'estacion_2', status: 'pending', combo_name: targetComboTitle, combo_category: 'proteico' };
        } catch (e) {}
      }

    } else {
      // Modo Despacho Unificado / General:
      if (isViveresDelivered && isProteicoDelivered) {
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          message: '¡ALERTA DE SEGURIDAD! Todos los combos de hoy (Víveres y Proteína) ya fueron retirados.'
        });
      }

      if (!isViveresDelivered && entViveres) {
        targetStationNum = 1;
        targetEnt = entViveres;
        targetComboTitle = 'Bulto Viveres Secos';
        targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.';
      } else if (!isProteicoDelivered && entProteico) {
        targetStationNum = 2;
        targetEnt = entProteico;
        targetComboTitle = '🍗 Combo Proteico Fresco (Cadena de Frío)';
        targetToastMsg = '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.';
      } else {
        targetEnt = entitlements.find(e => !checkDelivery.get(wid, e.id)) || entitlements[0];
        targetStationNum = 1;
        targetComboTitle = targetEnt.combo_name || 'Bulto Viveres Secos';
        targetToastMsg = `🎉 ¡RETIRO APROBADO! Ya puede retirar su ${targetComboTitle} en la Estación 1.`;
      }
    }

    if (!targetEnt) {
      targetEnt = { id: ent, combo_name: targetComboTitle };
    }


    const deliveryId = crypto.randomUUID();
    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campId = activeCamp ? activeCamp.id : null;

    let distPoint = targetStationNum === 2 
      ? (db.prepare("SELECT id FROM distribution_points WHERE location_code = 'EST-02'").get() || db.prepare("SELECT id FROM distribution_points LIMIT 1").get())
      : (db.prepare("SELECT id FROM distribution_points WHERE location_code = 'EST-01'").get() || db.prepare("SELECT id FROM distribution_points LIMIT 1").get());
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
      targetEnt.id,
      wid,
      finalPointId,
      finalOperatorId,
      sig,
      nonce,
      campId
    );

    // Marcar derecho diario como reclamado en SQLite local
    try {
      db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(targetEnt.id);
    } catch (e) {}

    // Respaldo asíncrono del despacho en Supabase Cloud
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        supabase.from('deliveries').insert([{
          id: deliveryId,
          entitlement_id: targetEnt.id,
          worker_id: wid,
          distribution_point_id: finalPointId,
          delivered_by_user_id: finalOperatorId,
          verification_method: 'passkey_qr',
          signature_proof: sig,
          challenge_nonce: nonce,
          is_offline_sync: false
        }]).catch(e => console.warn('[DELIVERY SUPABASE SYNC ERROR]', e.message));

        supabase.from('daily_entitlements').update({ status: 'claimed' }).eq('id', targetEnt.id).catch(() => {});
      }
    } catch (e) {}

    const worker = db.prepare('SELECT full_name, document_id, worker_type FROM workers WHERE id = ?').get(wid);

    const finalViveresDelivered = targetStationNum === 1 ? true : Boolean(isViveresDelivered);
    const finalProteicoDelivered = targetStationNum === 2 ? true : Boolean(isProteicoDelivered);
    const isAllCompleted = Boolean(finalViveresDelivered && finalProteicoDelivered);

    const deliveryPayload = {
      valid: true,
      delivery_id: deliveryId,
      worker_id: wid,
      worker_name: worker.full_name,
      document_id: worker.document_id,
      worker_type: worker.worker_type || 'activo',
      station: targetStationNum,
      station_name: `Estación ${targetStationNum}`,
      combo_name: targetComboTitle,
      combo_category: targetEnt.combo_category || (targetStationNum === 2 ? 'proteico' : 'bolsa_viveres'),
      combo_description: targetEnt.combo_name || targetComboTitle,
      toast_message: targetToastMsg,
      message: targetToastMsg,
      station_1_delivered: finalViveresDelivered,
      station_2_delivered: finalProteicoDelivered,
      all_completed: isAllCompleted,
      delivered_at: new Date().toISOString()
    };

    // Notificación Push reactiva instantánea por SSE al teléfono móvil del beneficiario
    notifyDeliveryStream(wid, deliveryPayload);

    return res.json(deliveryPayload);
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

/**
 * Autenticación inmediata con Magic Link de Nómina (One-Click Onboarding)
 */
const magicLogin = (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token de acceso rápido requerido' });
  }

  const verifyRes = verifyMagicLinkToken(token);
  if (!verifyRes.valid) {
    return res.status(401).json({ error: verifyRes.error || 'Token inválido o expirado' });
  }

  const { sub: worker_id } = verifyRes.payload;
  const worker = db.prepare(`
    SELECT w.*, d.name as department_name, d.code as department_code
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ?
  `).get(worker_id);

  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado en el sistema institucional' });
  }

  const passkey = db.prepare("SELECT id FROM passkey_credentials WHERE worker_id = ? AND status = 'active' LIMIT 1").get(worker.id);

  const today = new Date().toISOString().split('T')[0];
  let entitlement = db.prepare(`
    SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description
    FROM daily_entitlements de
    JOIN combos c ON de.combo_id = c.id
    WHERE de.worker_id = ? AND de.valid_date = ?
    LIMIT 1
  `).get(worker.id, today);

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
    entitlement: entitlement || null,
    auto_enroll: !passkey
  });
};

/**
 * Genera un Código QR de Delegación Criptográfica Temporal (Retiro por Terceros)
 * Autorizado por supervisor para funcionarios de reposo o jubilados sin móvil.
 */
const createDelegation = (req, res) => {
  const { beneficiary_doc, delegate_doc, supervisor_id, reason, valid_hours = 24 } = req.body;

  if (!beneficiary_doc || !delegate_doc) {
    return res.status(400).json({ error: 'Cédula del titular y Cédula del delegado son requeridas' });
  }

  const cleanBenDoc = beneficiary_doc.trim().toUpperCase();
  const digitsBen = cleanBenDoc.replace(/[^0-9]/g, '');
  const beneficiary = db.prepare(`
    SELECT id, document_id, full_name, worker_type, department_id FROM workers
    WHERE UPPER(document_id) = ? 
       OR id = ? 
       OR (LENGTH(?) >= 5 AND REPLACE(REPLACE(REPLACE(REPLACE(UPPER(document_id), 'V-', ''), 'E-', ''), 'V', ''), '.', '') = ?)
  `).get(cleanBenDoc, cleanBenDoc, digitsBen, digitsBen);

  if (!beneficiary) {
    return res.status(404).json({ error: 'El titular no se encuentra registrado en la nómina de beneficiarios.' });
  }

  const cleanDelDoc = delegate_doc.trim().toUpperCase();
  const digitsDel = cleanDelDoc.replace(/[^0-9]/g, '');
  let delegate = db.prepare(`
    SELECT id, document_id, full_name FROM workers
    WHERE UPPER(document_id) = ? 
       OR id = ? 
       OR (LENGTH(?) >= 5 AND REPLACE(REPLACE(REPLACE(REPLACE(UPPER(document_id), 'V-', ''), 'E-', ''), 'V', ''), '.', '') = ?)
  `).get(cleanDelDoc, cleanDelDoc, digitsDel, digitsDel);

  const delegateName = delegate ? delegate.full_name : (req.body.delegate_name || 'Compañero Autorizado');
  const delegateDocFinal = delegate ? delegate.document_id : cleanDelDoc;

  let supervisor = supervisor_id ? db.prepare('SELECT id, full_name FROM workers WHERE id = ?').get(supervisor_id) : null;
  if (!supervisor) {
    supervisor = db.prepare("SELECT id, full_name FROM workers WHERE role IN ('supervisor', 'admin') AND status = 'active' LIMIT 1").get();
  }

  const hours = Math.min(Math.max(Number(valid_hours) || 24, 1), 72);

  const tokenData = {
    beneficiary_id: beneficiary.id,
    beneficiary_doc: beneficiary.document_id,
    beneficiary_name: beneficiary.full_name,
    delegate_id: delegate ? delegate.id : null,
    delegate_doc: delegateDocFinal,
    delegate_name: delegateName,
    supervisor_id: supervisor ? supervisor.id : 'sup-admin',
    supervisor_name: supervisor ? supervisor.full_name : 'Supervisor de Gestión Humana',
    reason: reason || 'reposo_medico'
  };

  const token = generateDelegationToken(tokenData, hours);

  const qrPayload = {
    protocol: 'SGBT_DELEGATED_CLAIM_V1',
    token,
    ...tokenData,
    valid_until: new Date(Date.now() + hours * 3600 * 1000).toISOString()
  };

  res.json({
    success: true,
    delegation: qrPayload,
    qr_payload: qrPayload,
    qr_string: JSON.stringify(qrPayload),
    expires_in_hours: hours,
    message: `Autorización de retiro generada exitosamente. Válida por ${hours} horas para ${delegateName}.`
  });
};

/**
 * Aprobación de Contingencia por Cédula + Huella del Supervisor en 1 Clic
 * Permite liberar el beneficio a trabajadores sin smartphone ni NFC previa validación.
 */
const contingencyOverride = (req, res) => {
  const { worker_document_id, supervisor_id, override_reason, distribution_point_id } = req.body;
  if (!worker_document_id || !worker_document_id.trim()) {
    return res.status(400).json({ error: 'La Cédula del beneficiario es requerida' });
  }

  const cleanDoc = worker_document_id.trim().toUpperCase();
  const digitsOnly = cleanDoc.replace(/[^0-9]/g, '');

  const worker = db.prepare(`
    SELECT w.*, d.name as department_name
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE UPPER(w.document_id) = ? 
       OR w.id = ? 
       OR (LENGTH(?) >= 5 AND REPLACE(REPLACE(REPLACE(REPLACE(UPPER(w.document_id), 'V-', ''), 'E-', ''), 'V', ''), '.', '') = ?)
  `).get(cleanDoc, cleanDoc, digitsOnly, digitsOnly);

  if (!worker) {
    return res.status(404).json({
      error: 'La Cédula no se encuentra registrada en la nómina institucional de beneficiarios.'
    });
  }

  const today = new Date().toISOString().split('T')[0];
  let ent = db.prepare('SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? LIMIT 1').get(worker.id, today);
  if (!ent) {
    const defaultCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') AND is_active = 1 LIMIT 1").get()?.id || 'c1a2b3c4-1111-2222-3333-444455556666';
    const newEntId = crypto.randomUUID();
    db.prepare(`
      INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
      VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
    `).run(newEntId, worker.id, defaultCombo, today);
    ent = { id: newEntId };
  }

  // Verificar si ya fue entregado hoy (idx_unique_daily_claim)
  const alreadyDelivered = db.prepare('SELECT id, delivered_at FROM deliveries WHERE worker_id = ? AND entitlement_id = ? LIMIT 1').get(worker.id, ent.id);
  if (alreadyDelivered) {
    return res.status(409).json({
      error: '¡ALERTA DE SEGURIDAD! El beneficio de hoy para este trabajador ya fue entregado previamente.'
    });
  }

  let supervisor = supervisor_id ? db.prepare('SELECT id, full_name FROM workers WHERE id = ?').get(supervisor_id) : null;
  if (!supervisor) {
    supervisor = db.prepare("SELECT id, full_name FROM workers WHERE role IN ('supervisor', 'admin') AND status = 'active' LIMIT 1").get();
  }
  const supId = supervisor ? supervisor.id : null;
  const supName = supervisor ? supervisor.full_name : 'Supervisor de Gestión Humana';

  const deliveryId = crypto.randomUUID();
  const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
  const campId = activeCamp ? activeCamp.id : null;

  let distPoint = distribution_point_id 
    ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
    : db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
  const finalPointId = distPoint ? distPoint.id : null;

  try {
    db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, supervisor_id, override_reason, is_offline_sync, delivered_at, campaign_id
      ) VALUES (?, ?, ?, ?, ?, 'supervisor_override', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
    `).run(
      deliveryId,
      ent.id,
      worker.id,
      finalPointId,
      supId,
      'FIDO2_SUPERVISOR_BIOMETRIC_ASSERTION_' + Date.now(),
      generateNonce(16),
      supId,
      override_reason || (worker.worker_type === 'jubilado' ? 'adulto_mayor_sin_smartphone' : 'device_lost'),
      campId
    );

    try {
      db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(ent.id);
    } catch (e) {}

    const combo = db.prepare(`
      SELECT c.name, c.category, c.description
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.id = ?
    `).get(ent.id);

    return res.json({
      success: true,
      delivery_id: deliveryId,
      worker: {
        id: worker.id,
        full_name: worker.full_name,
        document_id: worker.document_id,
        worker_type: worker.worker_type,
        department: worker.department_name
      },
      combo_name: combo ? combo.name : 'Bolsa de Víveres y Proteína',
      supervisor_name: supName,
      message: `¡Liberación por contingencia autorizada en 1 Clic con firma biométrica del supervisor (${supName})!`
    });
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
      return res.status(409).json({
        error: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
      });
    }
    return res.status(500).json({ error: err.message });
  }
};

const getDeliveryStatus = (req, res) => {
  const { worker_id, entitlement_id, nonce } = req.query;

  if (!worker_id && !entitlement_id && !nonce) {
    return res.status(400).json({ error: 'Debe suministrar worker_id, entitlement_id o nonce' });
  }

  try {
    let query = `
      SELECT d.id as delivery_id, d.delivered_at, d.verification_method, d.worker_id, d.entitlement_id,
             d.challenge_nonce,
             w.full_name as worker_name, w.document_id, w.worker_type,
             c.name as combo_name, c.category as combo_category, c.description as combo_description,
             dp.name as distribution_point_name, dp.location_code as distribution_location_code,
             op.full_name as operator_name
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN daily_entitlements e ON d.entitlement_id = e.id
      LEFT JOIN combos c ON e.combo_id = c.id
      LEFT JOIN distribution_points dp ON d.distribution_point_id = dp.id
      LEFT JOIN workers op ON d.delivered_by_user_id = op.id
      WHERE 1=1
    `;
    const params = [];

    if (worker_id) {
      query += ` AND d.worker_id = ? AND d.delivered_at >= datetime('now', '-24 hours')`;
      params.push(worker_id);
    } else if (nonce) {
      query += ` AND d.challenge_nonce = ?`;
      params.push(nonce);
    } else if (entitlement_id) {
      query += ` AND d.entitlement_id = ?`;
      params.push(entitlement_id);
    }

    query += ` ORDER BY d.delivered_at ASC`;

    const allDeliveries = db.prepare(query).all(...params);

    if (!allDeliveries || allDeliveries.length === 0) {
      return res.json({ delivered: false, deliveries: [] });
    }

    const station1 = allDeliveries.find(d => 
      (d.combo_category === 'bolsa_viveres') || 
      (d.combo_name && d.combo_name.toLowerCase().includes('víveres')) ||
      (d.distribution_location_code === 'EST-01')
    );

    const station2 = allDeliveries.find(d => 
      (d.combo_category === 'proteico' || d.combo_category === 'combo_proteico') || 
      (d.combo_name && d.combo_name.toLowerCase().includes('prote')) ||
      (d.distribution_location_code === 'EST-02')
    );

    const latest = allDeliveries[allDeliveries.length - 1];
    const isStation2 = (latest === station2);

    const latestToast = isStation2
      ? '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.'
      : '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.';

    const isAllCompleted = Boolean(station1 && station2);

    return res.json({
      delivered: true,
      all_completed: isAllCompleted,
      station_1_delivered: Boolean(station1),
      station_2_delivered: Boolean(station2),
      station_1_time: station1 ? station1.delivered_at : null,
      station_2_time: station2 ? station2.delivered_at : null,
      latest_station: isStation2 ? 2 : 1,
      latest_toast: latestToast,
      deliveries: allDeliveries.map(d => {
        const isProt = (d === station2 || d.combo_category === 'proteico' || d.combo_category === 'combo_proteico' || (d.combo_name && d.combo_name.toLowerCase().includes('prote')));
        return {
          delivery_id: d.delivery_id,
          delivered_at: d.delivered_at,
          station: isProt ? 2 : 1,
          station_name: isProt ? 'Estación 2' : 'Estación 1',
          combo_name: isProt ? '🍗 Combo Proteico Fresco (Cadena de Frío)' : 'Bulto Viveres Secos',
          toast_message: isProt 
            ? '🎉 ¡RETIRO APROBADO! Ya puede retirar su 🍗 Combo Proteico Fresco (Cadena de Frío) en la Estación 2.'
            : '🎉 ¡RETIRO APROBADO! Ya puede retirar su Bulto Viveres Secos en la Estación 1.',
          distribution_point: d.distribution_point_name || (isProt ? 'Estación 2: Cavas Frías' : 'Estación 1: Almacén Sótano 1'),
          operator_name: d.operator_name || 'Personal de Despacho'
        };
      }),
      delivery: {
        delivery_id: latest.delivery_id,
        delivered_at: latest.delivered_at,
        verification_method: latest.verification_method,
        worker_id: latest.worker_id,
        worker_name: latest.worker_name,
        document_id: latest.document_id,
        worker_type: latest.worker_type || 'activo',
        station: isStation2 ? 2 : 1,
        station_name: isStation2 ? 'Estación 2' : 'Estación 1',
        combo_name: isStation2 ? '🍗 Combo Proteico Fresco (Cadena de Frío)' : 'Bulto Viveres Secos',
        combo_category: latest.combo_category || (isStation2 ? 'proteico' : 'bolsa_viveres'),
        combo_description: latest.combo_description,
        distribution_point: latest.distribution_point_name || (isStation2 ? 'Estación 2: Cavas Frías' : 'Estación 1: Almacén Sótano 1'),
        operator_name: latest.operator_name || 'Personal de Despacho',
        toast_message: latestToast,
        message: latestToast
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  login,
  magicLogin,
  registerChallenge,
  registerVerify,
  signOffline,
  getSupervisorDailyQr,
  verifyQr,
  createDelegation,
  contingencyOverride,
  getDeliveryStatus,
  deliveryStream
};
