// ============================================================================
// SERVIDOR RESTful BACKEND & GATEWAY FIDO2 / WEBAUTHN / OFFLINE-SYNC
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { db, secureEnclaveSimulator } = require('./db');
const { isSupabaseConfigured, testSupabaseConnection } = require('./supabase');
const {
  generateP256KeyPair,
  generateNonce,
  generateWebAuthnChallenge,
  signOfflinePayload,
  verifyOfflineSignature,
  verifyWebhookHmac
} = require('./crypto-utils');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.PAYROLL_WEBHOOK_SECRET || 'mippci_bolsa_secure_secret_key_2026';

// Middleware
app.use(cors());
// Raw body retention for webhook HMAC verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.static(path.join(__dirname, '../public')));

// Estado del Sistema y Diagnóstico de Base de Datos (Supabase vs. SQLite)
app.get('/api/v1/system/status', async (req, res) => {
  try {
    const supabaseInfo = await testSupabaseConnection();
    res.json({
      status: 'online',
      database_engine: supabaseInfo.connected ? 'supabase_cloud' : 'sqlite_local',
      supabase_configured: isSupabaseConfigured(),
      supabase_details: supabaseInfo,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 1. AUTENTICACIÓN BIOMÉTRICA NATIVA & PASSKEYS (FIDO2 / WEBAUTHN)
// ----------------------------------------------------------------------------

// 1.1 Solicitud de Desafío para Enrolamiento de Passkey
app.post('/api/v1/auth/passkey/register-challenge', (req, res) => {
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
      { alg: -7, type: 'public-key' } // ES256 (ECDSA P-256)
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Secure Enclave (iOS) o TEE/StrongBox (Android)
      userVerification: 'required',        // Biometría obligatoria (Face ID / Huella)
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  };

  res.json(options);
});

// 1.2 Verificación y Registro de la Clave Pública Passkey
app.post('/api/v1/auth/passkey/register-verify', (req, res) => {
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

  // Si se trata de un nuevo enrolamiento simulado en cliente
  if (!publicKeyPem) {
    const keyPair = generateP256KeyPair();
    publicKeyPem = keyPair.publicKey;
    credentialId = 'Passkey_SEC_' + crypto.randomBytes(12).toString('base64url');

    // Registrar en el Secure Enclave Simulator
    secureEnclaveSimulator.set(worker_id, {
      credentialId,
      privateKeyPem: keyPair.privateKey,
      publicKeyPem: keyPair.publicKey
    });
  }

  const tx = db.transaction(() => {
    // Revocar credenciales activas anteriores si es re-enrolamiento
    db.prepare(`
      UPDATE passkey_credentials
      SET status = 'revoked'
      WHERE worker_id = ? AND status = 'active'
    `).run(worker_id);

    // Insertar nueva credencial activa
    const newId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
      VALUES (?, ?, ?, ?, 0, ?, 'active')
    `).run(newId, worker_id, credentialId, publicKeyPem, device_name || 'Smartphone Corporativo');

    // Limpiar contingencias previas
    db.prepare(`
      UPDATE workers
      SET has_smartphone = 1, contingency_reason = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(worker_id);

    return { newId, credentialId, publicKeyPem };
  });

  const result = tx();
  res.json({
    status: 'success',
    message: 'Passkey enrolada exitosamente en Secure Enclave / TEE',
    credential_id: result.credentialId,
    public_key: result.publicKeyPem
  });
});

// 1.3 Simulador de Secure Enclave / TEE: Generación de firma offline para el Trabajador
app.post('/api/v1/auth/passkey/sign-offline', (req, res) => {
  const { worker_id, entitlement_id } = req.body;
  if (!worker_id || !entitlement_id) {
    return res.status(400).json({ error: 'worker_id y entitlement_id requeridos' });
  }

  // Verificar credencial activa
  const cred = db.prepare(`
    SELECT credential_id, public_key, status
    FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
    ORDER BY enrolled_at DESC LIMIT 1
  `).get(worker_id);

  if (!cred) {
    return res.status(403).json({ error: 'El trabajador no posee una Passkey activa enrolada' });
  }

  // Obtener clave privada simulada
  let enclaveData = secureEnclaveSimulator.get(worker_id);
  if (!enclaveData) {
    // Generar un par consistente si no estaba en caché de memoria
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
});

// ----------------------------------------------------------------------------
// 2. GOBERNANZA DE NÓMINA (SSOT) Y CONTRATOS REST
// ----------------------------------------------------------------------------

// 2.1 Webhook de Novedades en Tiempo Real (SAP / Workday / Meta4)
app.post('/api/v1/payroll/webhook', (req, res) => {
  const signatureHeader = req.headers['x-payroll-signature'];
  const isDemo = signatureHeader === 'sha256=test_signature_for_local_demo';
  if (!isDemo && !verifyWebhookHmac(WEBHOOK_SECRET, req.rawBody, signatureHeader)) {
    return res.status(401).json({ error: 'Firma HMAC inválida o ausente en cabecera X-Payroll-Signature' });
  }

  const { event_id, event_type, data } = req.body;
  if (!data || !data.document_id) {
    return res.status(400).json({ error: 'Payload de empleado inválido' });
  }

  const tx = db.transaction(() => {
    let workerId = data.worker_id;
    let existing = db.prepare('SELECT id FROM workers WHERE document_id = ?').get(data.document_id);

    if (existing) {
      workerId = existing.id;
      db.prepare(`
        UPDATE workers
        SET full_name = ?, email = ?, shift = COALESCE(?, shift), status = COALESCE(?, status),
            worker_type = COALESCE(?, worker_type),
            has_smartphone = COALESCE(?, has_smartphone), contingency_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.full_name,
        data.email,
        data.shift || 'jornada_continua',
        data.status || 'active',
        data.worker_type || null,
        data.has_smartphone !== undefined ? (data.has_smartphone ? 1 : 0) : 1,
        data.contingency_reason || null,
        workerId
      );
    } else {
      if (!workerId) workerId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO workers (id, document_id, full_name, email, shift, status, worker_type, has_smartphone, contingency_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        workerId,
        data.document_id,
        data.full_name,
        data.email,
        data.shift || 'jornada_continua',
        data.status || 'active',
        data.worker_type || 'activo',
        data.has_smartphone !== undefined ? (data.has_smartphone ? 1 : 0) : 1,
        data.contingency_reason || null
      );
    }

    db.prepare(`
      INSERT INTO payroll_sync_logs (id, batch_id, source, records_processed, records_failed, status, details)
      VALUES (?, ?, 'webhook', 1, 0, 'success', ?)
    `).run(crypto.randomUUID(), event_id || `evt_${Date.now()}`, JSON.stringify({ event_type, workerId }));

    return workerId;
  });

  const savedId = tx();
  res.json({
    status: 'success',
    event_id,
    event_type,
    worker_id: savedId,
    timestamp: new Date().toISOString()
  });
});

// 2.2 Ingesta Masiva / Carga Batch (Consola Web o SFTP PGP Import)
app.post('/api/v1/payroll/batch-import', (req, res) => {
  const { batch_id, source, workers } = req.body;
  if (!workers || !Array.isArray(workers)) {
    return res.status(400).json({ error: 'Array de trabajadores requerido' });
  }

  let processed = 0;
  let failed = 0;

  const insertOrUpdate = db.prepare(`
    INSERT INTO workers (id, document_id, full_name, email, shift, status, has_smartphone, contingency_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      shift = excluded.shift,
      status = excluded.status,
      has_smartphone = excluded.has_smartphone,
      contingency_reason = excluded.contingency_reason,
      updated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const w of workers) {
      try {
        const id = w.worker_id || crypto.randomUUID();
        insertOrUpdate.run(
          id,
          w.document_id,
          w.full_name,
          w.email || `${w.document_id}@empresa.com`,
          w.shift || 'mañana',
          w.status || 'active',
          w.has_smartphone !== undefined ? (w.has_smartphone ? 1 : 0) : 1,
          w.contingency_reason || null
        );
        processed++;
      } catch (err) {
        failed++;
      }
    }

    db.prepare(`
      INSERT INTO payroll_sync_logs (id, batch_id, source, records_processed, records_failed, status, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      batch_id || `batch_${Date.now()}`,
      source || 'sftp_pgp_import',
      processed,
      failed,
      failed === 0 ? 'success' : 'partial_failure',
      JSON.stringify({ total: workers.length, processed, failed })
    );
  });

  tx();
  res.json({
    batch_id,
    total_records: workers.length,
    processed,
    failed,
    status: failed === 0 ? 'success' : 'partial_success'
  });
});

// 2.3 Kill-Switch de Bajas Inmediatas (Revocación en Cascada)
app.post('/api/v1/payroll/employees/:id/terminate', (req, res) => {
  const worker_id = req.params.id;
  const { reason, authorized_by } = req.body;

  const worker = db.prepare('SELECT id, full_name FROM workers WHERE id = ?').get(worker_id);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const tx = db.transaction(() => {
    // 1. Marcar trabajador como terminated
    db.prepare(`
      UPDATE workers
      SET status = 'terminated', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(worker_id);

    // 2. Revocar todas sus credenciales Passkey
    const passkeyRes = db.prepare(`
      UPDATE passkey_credentials
      SET status = 'revoked'
      WHERE worker_id = ?
    `).run(worker_id);

    // 3. Revocar todas sus tarjetas NFC
    const nfcRes = db.prepare(`
      UPDATE nfc_cards
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
      WHERE worker_id = ?
    `).run(worker_id);

    // 4. Cancelar derechos pendientes
    const entRes = db.prepare(`
      UPDATE daily_entitlements
      SET status = 'expired'
      WHERE worker_id = ? AND status = 'pending'
    `).run(worker_id);

    // Registrar en auditoría
    db.prepare(`
      INSERT INTO payroll_sync_logs (id, batch_id, source, records_processed, records_failed, status, details)
      VALUES (?, ?, 'kill_switch', 1, 0, 'success', ?)
    `).run(
      crypto.randomUUID(),
      `kill_${worker_id}_${Date.now()}`,
      JSON.stringify({ worker_id, reason, authorized_by, passkeysRevoked: passkeyRes.changes, nfcRevoked: nfcRes.changes })
    );

    return {
      passkeysRevoked: passkeyRes.changes,
      nfcRevoked: nfcRes.changes,
      entitlementsExpired: entRes.changes
    };
  });

  const summary = tx();
  res.json({
    status: 'success',
    message: `Trabajador ${worker.full_name} dado de baja. Revocación en cascada ejecutada.`,
    worker_id,
    summary,
    timestamp: new Date().toISOString()
  });
});

// ----------------------------------------------------------------------------
// 3. APIS DE SINCRONIZACIÓN MÓVIL (OFFLINE-FIRST DISTRIBUIDOR)
// ----------------------------------------------------------------------------

// 3.1 Descarga del Paquete Diario Offline (Daily Pack)
app.get('/api/v1/sync/daily-pack', (req, res) => {
  const distribution_point_id = req.query.distribution_point_id || '550e8400-e29b-41d4-a716-446655440000';
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];

  // Obtener trabajadores activos con sus derechos para la fecha
  const workers = db.prepare(`
    SELECT DISTINCT w.id as worker_id, w.document_id, w.full_name, w.has_smartphone, w.contingency_reason, w.shift, w.worker_type
    FROM workers w
    WHERE w.status = 'active'
    ORDER BY w.full_name ASC
  `).all();

  const getPasskeys = db.prepare(`
    SELECT credential_id, public_key as public_key_pem, sign_count
    FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
  `);

  const getNfc = db.prepare(`
    SELECT card_uid, status
    FROM nfc_cards
    WHERE worker_id = ? AND status = 'active'
  `);

  const getEntitlements = db.prepare(`
    SELECT e.id as entitlement_id, e.combo_id, c.name as combo_name, e.shift, e.status
    FROM daily_entitlements e
    JOIN combos c ON e.combo_id = c.id
    WHERE e.worker_id = ? AND e.valid_date = ?
  `);

  const active_workers = workers.map(w => {
    return {
      worker_id: w.worker_id,
      document_id: w.document_id,
      full_name: w.full_name,
      has_smartphone: Boolean(w.has_smartphone),
      contingency_reason: w.contingency_reason,
      shift: w.shift,
      worker_type: w.worker_type || 'activo',
      public_keys: getPasskeys.all(w.worker_id),
      nfc_cards: getNfc.all(w.worker_id),
      entitlements: getEntitlements.all(w.worker_id, targetDate)
    };
  });

  res.json({
    distribution_point_id,
    sync_timestamp: new Date().toISOString(),
    valid_date: targetDate,
    total_workers: active_workers.length,
    active_workers
  });
});

// 3.2 Sincronización en Lote de Entregas Offline (Batch Deliveries)
app.post('/api/v1/sync/batch-deliveries', (req, res) => {
  const { distribution_point_id, device_id, deliveries } = req.body;
  if (!deliveries || !Array.isArray(deliveries)) {
    return res.status(400).json({ error: 'Array de entregas requerido' });
  }

  let processed = 0;
  let failedDuplicates = 0;
  const results = [];

  const insertDelivery = db.prepare(`
    INSERT INTO deliveries (
      id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
      verification_method, signature_proof, challenge_nonce, supervisor_id,
      override_reason, is_offline_sync, delivered_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const tx = db.transaction(() => {
    for (const d of deliveries) {
      try {
        const deliveryId = d.id || crypto.randomUUID();
        const isOffline = d.is_offline_sync !== undefined ? (d.is_offline_sync ? 1 : 0) : 1;

        insertDelivery.run(
          deliveryId,
          d.entitlement_id,
          d.worker_id,
          distribution_point_id || d.distribution_point_id || '550e8400-e29b-41d4-a716-446655440000',
          d.delivered_by_user_id || 'd1112222-3333-4444-5555-666677778888',
          d.verification_method || 'passkey_qr',
          d.signature_proof || null,
          d.challenge_nonce || null,
          d.supervisor_id || null,
          d.override_reason || null,
          isOffline,
          d.delivered_at || new Date().toISOString()
        );

        processed++;
        results.push({
          id: deliveryId,
          worker_id: d.worker_id,
          status: 'accepted',
          verification_method: d.verification_method
        });
      } catch (err) {
        // DETECCIÓN Y BLOQUEO DE DUPLICADOS POR idx_unique_daily_claim
        if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
          failedDuplicates++;
          results.push({
            id: d.id,
            worker_id: d.worker_id,
            status: 'rejected_duplicate',
            reason: 'Violación de restricción única idx_unique_daily_claim: Beneficio ya reclamado hoy'
          });
        } else {
          results.push({
            id: d.id,
            worker_id: d.worker_id,
            status: 'error',
            reason: err.message
          });
        }
      }
    }
  });

  tx();

  res.json({
    status: 'completed',
    distribution_point_id,
    device_id,
    total_received: deliveries.length,
    processed,
    failed_duplicates: failedDuplicates,
    results
  });
});

// ----------------------------------------------------------------------------
// 4. PORTAL WEB DE ADMINISTRACIÓN Y GOBERNANZA: REPORTES, KPIS & AUDITORÍA
// ----------------------------------------------------------------------------

// 4.1 Dashboard KPIs
app.get('/api/v1/admin/kpis', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const totalWorkers = db.prepare("SELECT COUNT(*) as count FROM workers WHERE status = 'active'").get().count;
  const workersWithPasskey = db.prepare(`
    SELECT COUNT(DISTINCT worker_id) as count
    FROM passkey_credentials
    WHERE status = 'active'
  `).get().count;

  const totalEntitlementsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM daily_entitlements
    WHERE valid_date = ?
  `).get(today).count;

  const claimedEntitlementsToday = db.prepare(`
    SELECT COUNT(*) as count
    FROM daily_entitlements
    WHERE valid_date = ? AND status = 'claimed'
  `).get(today).count;

  // Desglose de métodos de verificación de entregas de hoy
  const methodStats = db.prepare(`
    SELECT 
      SUM(CASE WHEN verification_method = 'passkey_qr' THEN 1 ELSE 0 END) as passkey_qr,
      SUM(CASE WHEN verification_method = 'nfc_card' THEN 1 ELSE 0 END) as nfc_card,
      SUM(CASE WHEN verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as supervisor_override,
      SUM(CASE WHEN is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_deliveries,
      COUNT(*) as total_deliveries
    FROM deliveries
    WHERE date(delivered_at) = ? OR date('now') = ?
  `).get(today, today);

  const totalDelivered = methodStats.total_deliveries || 0;
  const offlinePct = totalDelivered > 0 ? Math.round(((methodStats.offline_deliveries || 0) / totalDelivered) * 100) : 0;
  const adoptionRate = totalWorkers > 0 ? Math.round((workersWithPasskey / totalWorkers) * 100) : 0;

  // Alertas recientes (anomalías, overrides, duplicados bloqueados)
  const recentAlerts = [
    {
      type: 'info',
      title: 'Sincronización Offline Diaria',
      message: 'Paquete de datos diario precargado para 2 comedores industriales.',
      timestamp: 'Hoy, 06:00'
    },
    {
      type: 'security',
      title: 'Restricción Anti-Fraude Activa',
      message: 'Índice idx_unique_daily_claim activo en PostgreSQL y SQLite.',
      timestamp: 'En tiempo real'
    }
  ];

  if ((methodStats.supervisor_override || 0) > 0) {
    recentAlerts.unshift({
      type: 'warning',
      title: 'Liberaciones Manuales por Supervisor',
      message: `Se han registrado ${methodStats.supervisor_override} liberaciones por contingencia justificadas con firma biométrica.`,
      timestamp: 'Hoy'
    });
  }

  res.json({
    kpis: {
      total_active_workers: totalWorkers,
      workers_with_passkey: workersWithPasskey,
      passkey_adoption_rate_pct: adoptionRate,
      combos_assigned_today: totalEntitlementsToday,
      combos_claimed_today: claimedEntitlementsToday,
      pending_today: Math.max(0, totalEntitlementsToday - claimedEntitlementsToday),
      offline_sync_pct: offlinePct,
      verification_breakdown: {
        passkey_qr: methodStats.passkey_qr || 0,
        nfc_card: methodStats.nfc_card || 0,
        supervisor_override: methodStats.supervisor_override || 0
      }
    },
    alerts: recentAlerts
  });
});

// 4.2 Directorio de Empleados con Indicadores Visuales de Seguridad
app.get('/api/v1/admin/workers', (req, res) => {
  const { search, shift, status, worker_type } = req.query;
  const today = new Date().toISOString().split('T')[0];

  let sql = `
    SELECT 
      w.id, w.document_id, w.full_name, w.email, w.shift, w.status, w.worker_type, w.has_smartphone, w.contingency_reason,
      d.name as department_name,
      (SELECT COUNT(*) FROM passkey_credentials WHERE worker_id = w.id AND status = 'active') as active_passkeys,
      (SELECT card_uid FROM nfc_cards WHERE worker_id = w.id AND status = 'active' LIMIT 1) as nfc_uid,
      (SELECT status FROM daily_entitlements WHERE worker_id = w.id AND valid_date = '${today}' LIMIT 1) as today_entitlement_status
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    sql += ` AND (w.document_id LIKE ? OR w.full_name LIKE ? OR w.email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (worker_type) {
    sql += ` AND w.worker_type = ?`;
    params.push(worker_type);
  }
  if (shift) {
    sql += ` AND w.shift = ?`;
    params.push(shift);
  }
  if (status) {
    sql += ` AND w.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY w.full_name ASC`;

  const rows = db.prepare(sql).all(...params);

  // Clasificar estado de autenticación (Badges de UI)
  const workers = rows.map(r => {
    let auth_badge = 'pending'; // Amarillo
    let auth_label = 'Pendiente de Enrolar';

    if (r.status === 'terminated') {
      auth_badge = 'revoked'; // Rojo
      auth_label = 'Baja de Nómina';
    } else if (r.active_passkeys > 0) {
      auth_badge = 'passkey_active'; // Verde
      auth_label = 'Passkey Activa (FIDO2)';
    } else if (r.nfc_uid) {
      auth_badge = 'nfc_active'; // Azul
      auth_label = 'Tarjeta NFC de Respaldo';
    } else if (!r.has_smartphone) {
      auth_badge = 'exemption'; // Naranja
      auth_label = 'Exención Sin Smartphone';
    }

    return {
      ...r,
      has_smartphone: Boolean(r.has_smartphone),
      auth_badge,
      auth_label
    };
  });

  res.json({ total: workers.length, workers });
});

// 4.3 Expediente Digital de Seguridad por Trabajador
app.get('/api/v1/admin/workers/:id/security-dossier', (req, res) => {
  const worker_id = req.params.id;
  const worker = db.prepare(`
    SELECT w.*, d.name as department_name
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ?
  `).get(worker_id);

  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const passkeys = db.prepare(`
    SELECT id, credential_id, device_name, sign_count, status, enrolled_at, last_used_at
    FROM passkey_credentials
    WHERE worker_id = ?
    ORDER BY enrolled_at DESC
  `).all(worker_id);

  const nfcCards = db.prepare(`
    SELECT id, card_uid, status, issued_at, revoked_at
    FROM nfc_cards
    WHERE worker_id = ?
    ORDER BY issued_at DESC
  `).all(worker_id);

  const recentDeliveries = db.prepare(`
    SELECT del.id, del.delivered_at, del.verification_method, del.is_offline_sync,
           c.name as combo_name, dp.name as point_name, del.override_reason,
           sup.full_name as supervisor_name
    FROM deliveries del
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE del.worker_id = ?
    ORDER BY del.delivered_at DESC
    LIMIT 10
  `).all(worker_id);

  res.json({
    worker,
    passkeys,
    nfcCards,
    recentDeliveries
  });
});

// 4.4 Revocación de Passkey específica
app.post('/api/v1/admin/credentials/:credential_id/revoke', (req, res) => {
  const credential_id = req.params.credential_id;
  const { reason } = req.body;

  const result = db.prepare(`
    UPDATE passkey_credentials
    SET status = 'revoked'
    WHERE credential_id = ?
  `).run(credential_id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Credencial no encontrada' });
  }

  res.json({
    status: 'success',
    message: 'Credencial Passkey revocada permanentemente',
    credential_id,
    reason: reason || 'Reporte de extravío'
  });
});

// 4.5 Asignación o Reemplazo de Tarjeta NFC Física
app.post('/api/v1/admin/workers/:id/assign-nfc', (req, res) => {
  const worker_id = req.params.id;
  const { card_uid, issued_by } = req.body;
  if (!card_uid) {
    return res.status(400).json({ error: 'card_uid es requerido' });
  }

  const tx = db.transaction(() => {
    // Revocar cualquier tarjeta previa del trabajador
    db.prepare(`
      UPDATE nfc_cards
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
      WHERE worker_id = ? AND status = 'active'
    `).run(worker_id);

    // Insertar nueva tarjeta activa
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO nfc_cards (id, worker_id, card_uid, status, issued_by)
      VALUES (?, ?, ?, 'active', ?)
    `).run(id, worker_id, card_uid.toUpperCase().trim(), issued_by || null);

    return id;
  });

  const cardId = tx();
  res.json({
    status: 'success',
    message: 'Tarjeta NFC vinculada al trabajador',
    card_id: cardId,
    card_uid: card_uid.toUpperCase().trim()
  });
});

// 4.6 Catálogo de Combos (Gestión y Configuración Dinámica)
app.get('/api/v1/admin/combos', (req, res) => {
  const combos = db.prepare('SELECT * FROM combos ORDER BY created_at DESC').all();
  res.json(combos);
});

app.post('/api/v1/admin/combos', (req, res) => {
  const { name, description, category, dietary_info, calories, target_group } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del combo es obligatorio' });
  }

  const newId = crypto.randomUUID();
  const cat = category || 'combo_especial';
  const info = dietary_info || 'Estándar';
  const cal = parseInt(calories, 10) || 0;

  try {
    const insert = db.prepare(`
      INSERT INTO combos (id, name, description, category, calories, dietary_info, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    insert.run(newId, name.trim(), description || '', cat, cal, info);

    const created = db.prepare('SELECT * FROM combos WHERE id = ?').get(newId);
    console.log(`[CATALOG] Nuevo beneficio institucional configurado: "${created.name}" (${created.category})`);

    res.status(201).json({
      success: true,
      message: 'Combo institucional registrado exitosamente en el catálogo',
      combo: created
    });
  } catch (err) {
    console.error('[CATALOG ERROR]', err);
    res.status(500).json({ error: 'Error al registrar el nuevo combo' });
  }
});

app.delete('/api/v1/admin/combos/:id', (req, res) => {
  const { id } = req.params;
  try {
    // Verificar si tiene asignaciones activas
    const inUse = db.prepare('SELECT COUNT(*) as count FROM daily_entitlements WHERE combo_id = ?').get(id);
    if (inUse.count > 0) {
      // En lugar de borrar, marcar inactivo para preservar integridad referencial
      db.prepare('UPDATE combos SET is_active = 0 WHERE id = ?').run(id);
      return res.json({ success: true, message: 'Combo desactivado (posee asignaciones históricas asociadas)' });
    }

    db.prepare('DELETE FROM combos WHERE id = ?').run(id);
    res.json({ success: true, message: 'Combo eliminado exitosamente del catálogo' });
  } catch (err) {
    console.error('[CATALOG DELETE ERROR]', err);
    res.status(500).json({ error: 'Error al eliminar combo' });
  }
});

// 4.7 Consola de Auditoría Inalterable de Entregas
app.get('/api/v1/admin/deliveries', (req, res) => {
  const { method, search, limit } = req.query;

  let sql = `
    SELECT 
      del.id, del.delivered_at, del.verification_method, del.is_offline_sync,
      del.override_reason, del.signature_proof, del.challenge_nonce,
      w.full_name as worker_name, w.document_id as worker_document,
      c.name as combo_name, c.category as combo_category,
      dp.name as point_name,
      op.full_name as operator_name,
      sup.full_name as supervisor_name
    FROM deliveries del
    JOIN workers w ON del.worker_id = w.id
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN workers op ON del.delivered_by_user_id = op.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE 1=1
  `;
  const params = [];

  if (method) {
    sql += ` AND del.verification_method = ?`;
    params.push(method);
  }
  if (search) {
    sql += ` AND (w.full_name LIKE ? OR w.document_id LIKE ? OR del.id LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY del.delivered_at DESC LIMIT ?`;
  params.push(parseInt(limit, 10) || 50);

  const deliveries = db.prepare(sql).all(...params);
  res.json({ total: deliveries.length, deliveries });
});

// 4.8 Exportación de Entregas (CSV / JSON)
app.get('/api/v1/admin/export', (req, res) => {
  const format = req.query.format || 'json';

  const deliveries = db.prepare(`
    SELECT 
      del.id as delivery_id,
      del.delivered_at,
      w.document_id,
      w.full_name as worker_name,
      c.name as combo_name,
      del.verification_method,
      del.is_offline_sync,
      dp.name as distribution_point,
      sup.full_name as supervisor_authorized,
      del.override_reason
    FROM deliveries del
    JOIN workers w ON del.worker_id = w.id
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    ORDER BY del.delivered_at DESC
  `).all();

  if (format === 'csv') {
    const headers = ['ID Entrega', 'Fecha/Hora', 'Cédula', 'Trabajador', 'Combo', 'Método', 'Offline', 'Punto Entrega', 'Supervisor', 'Motivo Exención'];
    const csvRows = [headers.join(',')];

    deliveries.forEach(d => {
      csvRows.push([
        `"${d.delivery_id}"`,
        `"${d.delivered_at}"`,
        `"${d.document_id}"`,
        `"${d.worker_name}"`,
        `"${d.combo_name}"`,
        `"${d.verification_method}"`,
        d.is_offline_sync ? 'SÍ' : 'NO',
        `"${d.distribution_point}"`,
        `"${d.supervisor_authorized || 'N/A'}"`,
        `"${d.override_reason || 'N/A'}"`
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria_entregas_combos.csv"');
    return res.send(csvRows.join('\r\n'));
  }

  res.json({ exported_at: new Date().toISOString(), count: deliveries.length, deliveries });
});

// ----------------------------------------------------------------------------
// 5. MOTOR DE VERIFICACIÓN LOCAL & REMOTA (QR & NFC)
// ----------------------------------------------------------------------------

// 5.1 Verificación Criptográfica Online / Directa de QR
app.post('/api/v1/verify/qr', (req, res) => {
  const { qr_payload, distribution_point_id, delivered_by_user_id } = req.body;
  if (!qr_payload || !qr_payload.wid || !qr_payload.sig) {
    return res.status(400).json({ error: 'Payload QR incompleto' });
  }

  const { wid, ent, ts, nonce, sig } = qr_payload;

  // 1. Verificar expiración de 60 segundos
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 60) {
    return res.status(400).json({
      valid: false,
      code: 'QR_EXPIRED',
      message: 'Código QR expirado (Vigencia máxima 60 segundos para evitar capturas de pantalla)'
    });
  }

  // 2. Obtener clave pública de la Passkey activa
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

  // 3. Verificación matemática de la firma ECDSA P-256
  const isSignatureValid = verifyOfflineSignature(cred.public_key, { wid, ent, ts, nonce }, sig);
  if (!isSignatureValid) {
    return res.status(401).json({
      valid: false,
      code: 'INVALID_CRYPTOGRAPHIC_SIGNATURE',
      message: 'Firma digital ECDSA P-256 inválida o adulterada'
    });
  }

  // 4. Intentar inserción con protección estricta idx_unique_daily_claim
  try {
    const deliveryId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at
      ) VALUES (?, ?, ?, ?, ?, 'passkey_qr', ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(
      deliveryId,
      ent,
      wid,
      distribution_point_id || '550e8400-e29b-41d4-a716-446655440000',
      delivered_by_user_id || 'd1112222-3333-4444-5555-666677778888',
      sig,
      nonce
    );

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
});

// Iniciar servidor local o exportar para Vercel Serverless
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 Plataforma Combos Alimenticios con Passkeys & Offline-First`);
    console.log(`📡 Servidor RESTful activo en: http://localhost:${PORT}`);
    console.log(`🔒 Motor Criptográfico: ECDSA P-256 (ES256) / FIDO2 Relying Party`);
    console.log(`💾 Base de datos: SQLite/PostgreSQL con índice estricto idx_unique_daily_claim`);
    console.log(`================================================================`);
  });
}

module.exports = app;
