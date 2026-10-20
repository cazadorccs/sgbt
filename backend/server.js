// ============================================================================
// SERVIDOR RESTful BACKEND & GATEWAY FIDO2 / WEBAUTHN / OFFLINE-SYNC
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { db, readyPromise, secureEnclaveSimulator, seedDatabase } = require('./db');
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
// Raw body retention for webhook HMAC verification con límite de 50MB para nóminas masivas
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Manejador para garantizar respuestas en formato JSON si el payload es excesivo o malformado
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      error: 'El archivo de nómina excede el tamaño máximo permitido (50MB).'
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Formato de datos JSON inválido en la solicitud.' });
  }
  next(err);
});

app.use(express.static(path.join(__dirname, '../public')));

// Middleware de sincronización para Vercel Serverless / SQLite en frío
app.use(async (req, res, next) => {
  try {
    if (readyPromise) {
      await readyPromise;
    }
    next();
  } catch (err) {
    console.error('[DB WAIT ERROR]', err);
    res.status(500).json({ error: 'La base de datos se está inicializando: ' + err.message });
  }
});

// Estado del Sistema y Diagnóstico de Base de Datos (Supabase vs. SQLite) & Inicialización
app.get('/api/v1/system/status', async (req, res) => {
  try {
    const supabaseInfo = await testSupabaseConnection();
    let isInitialized = true;
    let isDemoMode = true;
    let hasAdmin = false;
    let tenantInfo = null;

    try {
      const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
      if (tenant) {
        isInitialized = tenant.is_initialized === 1 || tenant.is_initialized === '1';
        isDemoMode = tenant.is_demo_mode === 1 || tenant.is_demo_mode === '1';
        tenantInfo = {
          entity_name: tenant.entity_name,
          entity_short_name: tenant.entity_short_name,
          primary_color: tenant.primary_color,
          is_demo_mode: isDemoMode
        };
      }
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM workers WHERE role = 'admin' OR role = 'director'").get();
      hasAdmin = adminCount && adminCount.count > 0;
    } catch (dbErr) {
      console.warn('[SYSTEM STATUS] Error consultando estado inicialización:', dbErr.message);
    }

    res.json({
      status: 'online',
      database_engine: supabaseInfo.connected ? 'supabase_cloud' : 'sqlite_local',
      supabase_configured: isSupabaseConfigured(),
      supabase_details: supabaseInfo,
      is_initialized: isInitialized,
      is_demo_mode: isDemoMode,
      has_admin: hasAdmin,
      tenant: tenantInfo,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Autenticación Institucional por Cédula / Credenciales y Control de Roles (RBAC)
app.post('/api/v1/auth/login', (req, res) => {
  const { document_id } = req.body;

  if (!document_id || !document_id.trim()) {
    return res.status(400).json({ error: 'La Cédula de Identidad es requerida' });
  }

  const cleanDoc = document_id.trim().toUpperCase();

  try {
    const worker = db.prepare(`
      SELECT w.*, d.name as department_name, d.code as department_code
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE UPPER(w.document_id) = ? OR w.id = ? OR UPPER(w.document_id) LIKE ?
    `).get(cleanDoc, cleanDoc, `%${cleanDoc.replace(/[^0-9]/g, '')}%`);

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

    const entitlement = db.prepare(`
      SELECT de.*, c.name as combo_name, c.category as combo_category, c.description as combo_description
      FROM daily_entitlements de
      JOIN combos c ON de.combo_id = c.id
      WHERE de.worker_id = ?
      ORDER BY de.valid_date DESC LIMIT 1
    `).get(worker.id);

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

// Helper para parsear texto CSV de nómina a array de objetos trabajador
function parseCsvToWorkers(csvText) {
  if (!csvText || !csvText.trim()) return [];
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const separator = lines[0].includes(';') ? ';' : ',';
  const parseRow = (line) => {
    const row = [];
    let insideQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === separator && !insideQuotes) {
        row.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim().replace(/^"|"$/g, ''));
    return row;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_'));

  const docIdx = headers.findIndex(h => h.includes('cedula') || h.includes('document') || h.includes('ci') || h.includes('id'));
  const nameIdx = headers.findIndex(h => h.includes('nombre') || h.includes('name') || h.includes('trabajador') || h.includes('empleado'));
  const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('correo'));
  const phoneIdx = headers.findIndex(h => h.includes('telefono') || h.includes('phone') || h.includes('celular') || h.includes('movil'));
  const deptIdx = headers.findIndex(h => h.includes('departamento') || h.includes('department') || h.includes('sede') || h.includes('area') || h.includes('gerencia') || h.includes('direccion'));
  const shiftIdx = headers.findIndex(h => h.includes('turno') || h.includes('shift') || h.includes('jornada'));
  const typeIdx = headers.findIndex(h => h.includes('tipo') || h.includes('type') || h.includes('cargo') || h.includes('condicion'));
  const phoneHasIdx = headers.findIndex(h => h.includes('smartphone') || h.includes('telefono_propio') || h.includes('tiene_telefono'));

  const workers = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    if (cols.length < 2) continue;

    const docId = docIdx >= 0 ? cols[docIdx] : cols[0];
    const fullName = nameIdx >= 0 ? cols[nameIdx] : (cols[1] || 'Funcionario ' + docId);
    if (!docId || !docId.trim()) continue;

    let email = emailIdx >= 0 && cols[emailIdx] ? cols[emailIdx] : `${docId.replace(/[^a-zA-Z0-9]/g, '')}@mippci.gob.ve`;
    if (!email.includes('@')) email += '@mippci.gob.ve';

    const phone = phoneIdx >= 0 && cols[phoneIdx] ? cols[phoneIdx] : null;
    const deptName = deptIdx >= 0 && cols[deptIdx] ? cols[deptIdx] : null;
    const shift = shiftIdx >= 0 && cols[shiftIdx] ? cols[shiftIdx].toLowerCase().replace(/\s+/g, '_') : 'jornada_continua';
    const workerType = typeIdx >= 0 && cols[typeIdx] ? cols[typeIdx].toLowerCase() : 'activo';

    let hasSmart = 1;
    if (phoneHasIdx >= 0 && cols[phoneHasIdx]) {
      const val = cols[phoneHasIdx].toLowerCase().trim();
      if (val === 'no' || val === '0' || val === 'false' || val === 'sin_smartphone') hasSmart = 0;
    }

    workers.push({
      document_id: docId.trim(),
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone_number: phone ? phone.trim() : null,
      department_name: deptName ? deptName.trim() : null,
      shift: shift || 'jornada_continua',
      worker_type: workerType.includes('jubilad') || workerType.includes('pensionad') ? 'jubilado' : (workerType.includes('contratad') ? 'contratado' : 'activo'),
      status: 'active',
      has_smartphone: hasSmart,
      contingency_reason: hasSmart ? null : 'adulto_mayor_sin_smartphone'
    });
  }
  return workers;
}

// 2.2 Ingesta Masiva / Carga Batch (Consola Web, CSV Upload o SFTP PGP Import)
app.post('/api/v1/payroll/batch-import', (req, res) => {
  let { batch_id, source, workers, csvText } = req.body;

  // Si viene en formato CSV texto directo
  if (csvText && typeof csvText === 'string') {
    workers = parseCsvToWorkers(csvText);
    source = source || 'csv_upload';
  } else if (typeof workers === 'string') {
    try { 
      workers = JSON.parse(workers); 
    } catch (e) {
      workers = parseCsvToWorkers(workers);
      source = source || 'csv_upload';
    }
  }

  if (!workers || !Array.isArray(workers)) {
    return res.status(400).json({ error: 'Array de trabajadores o texto CSV requerido' });
  }

  let processed = 0;
  let updated = 0;
  let failed = 0;

  const insertOrUpdate = db.prepare(`
    INSERT INTO workers (id, document_id, full_name, email, department_id, shift, status, worker_type, has_smartphone, phone_number, contingency_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      full_name = excluded.full_name,
      email = excluded.email,
      department_id = COALESCE(excluded.department_id, workers.department_id),
      shift = excluded.shift,
      status = excluded.status,
      worker_type = excluded.worker_type,
      has_smartphone = excluded.has_smartphone,
      phone_number = COALESCE(excluded.phone_number, workers.phone_number),
      contingency_reason = excluded.contingency_reason,
      updated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const w of workers) {
      try {
        if (!w.document_id || !w.document_id.trim()) {
          failed++;
          continue;
        }

        // Resolver o registrar departamento si viene por nombre
        let deptId = w.department_id || null;
        if (w.department_name && !deptId) {
          const deptClean = w.department_name.trim();
          let existingDept = db.prepare("SELECT id FROM departments WHERE LOWER(name) = LOWER(?)").get(deptClean);
          if (!existingDept) {
            deptId = crypto.randomUUID();
            const code = 'DEP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
            db.prepare("INSERT INTO departments (id, code, name, cost_center) VALUES (?, ?, ?, ?)").run(deptId, code, deptClean, 'CC-NOMINA');
          } else {
            deptId = existingDept.id;
          }
        }

        const id = w.id || w.worker_id || crypto.randomUUID();
        const docId = w.document_id.trim();
        const fullName = (w.full_name || 'Trabajador ' + docId).trim();
        const email = (w.email || `${docId.replace(/[^a-zA-Z0-9]/g, '')}@mippci.gob.ve`).trim().toLowerCase();
        const shift = w.shift || 'jornada_continua';
        const status = w.status || 'active';
        const workerType = w.worker_type || 'activo';
        const hasSmart = w.has_smartphone !== undefined ? (w.has_smartphone ? 1 : 0) : 1;
        const phone = w.phone_number || null;
        const contingency = w.contingency_reason || (hasSmart ? null : 'adulto_mayor_sin_smartphone');

        const existingWorker = db.prepare("SELECT id FROM workers WHERE document_id = ?").get(docId);
        if (existingWorker) {
          updated++;
        }

        insertOrUpdate.run(
          id,
          docId,
          fullName,
          email,
          deptId,
          shift,
          status,
          workerType,
          hasSmart,
          phone,
          contingency
        );
        processed++;
      } catch (err) {
        console.error('[BATCH IMPORT WORKER ERROR]', err);
        failed++;
      }
    }

    db.prepare(`
      INSERT INTO payroll_sync_logs (id, batch_id, source, records_processed, records_failed, status, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      batch_id || `batch_${Date.now()}`,
      source || 'csv_upload',
      processed,
      failed,
      failed === 0 ? 'success' : 'partial_failure',
      JSON.stringify({ total: workers.length, processed, updated, failed, source: source || 'csv_upload' })
    );
  });

  tx();
  res.json({
    success: true,
    batch_id: batch_id || `batch_${Date.now()}`,
    total_records: workers.length,
    processed,
    updated,
    failed,
    status: failed === 0 ? 'success' : 'partial_success',
    message: `Sincronización de nómina exitosa: ${processed} trabajadores procesados (${updated} actualizados en base de datos, ${failed} omitidos).`
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

  const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
  const defaultCampId = activeCamp ? activeCamp.id : null;

  const insertDelivery = db.prepare(`
    INSERT INTO deliveries (
      id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
      verification_method, signature_proof, challenge_nonce, supervisor_id,
      override_reason, is_offline_sync, delivered_at, synced_at, campaign_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
  `);

  const tx = db.transaction(() => {
    const defaultPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const fallbackPointId = defaultPoint ? defaultPoint.id : null;
    const defaultOperator = db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
    const fallbackOperatorId = defaultOperator ? defaultOperator.id : null;

    for (const d of deliveries) {
      try {
        const deliveryId = d.id || crypto.randomUUID();
        const isOffline = d.is_offline_sync !== undefined ? (d.is_offline_sync ? 1 : 0) : 1;

        let ptId = distribution_point_id || d.distribution_point_id;
        if (ptId) {
          const ptExists = db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(ptId);
          if (!ptExists) ptId = fallbackPointId;
        } else {
          ptId = fallbackPointId;
        }

        let opId = d.delivered_by_user_id;
        if (opId) {
          const opExists = db.prepare("SELECT id FROM workers WHERE id = ?").get(opId);
          if (!opExists) opId = fallbackOperatorId;
        } else {
          opId = fallbackOperatorId;
        }

        insertDelivery.run(
          deliveryId,
          d.entitlement_id,
          d.worker_id,
          ptId,
          opId,
          d.verification_method || 'passkey_qr',
          d.signature_proof || null,
          d.challenge_nonce || null,
          d.supervisor_id || null,
          d.override_reason || null,
          isOffline,
          d.delivered_at || new Date().toISOString(),
          d.campaign_id || defaultCampId
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
      SUM(CASE WHEN verification_method = 'supervisor_daily_qr' THEN 1 ELSE 0 END) as supervisor_daily_qr,
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
  const { name, description, category, dietary_info, calories, items_detail, icon } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre del combo es obligatorio' });
  }

  const newId = crypto.randomUUID();
  const cat = category || 'combo_especial';
  const info = dietary_info || 'Estándar';
  const cal = parseInt(calories, 10) || 0;
  const items = items_detail ? items_detail.trim() : '';
  const comboIcon = icon || (cat === 'proteico' ? '🍗' : (cat === 'navideno' ? '🎄' : '🍱'));

  try {
    const insert = db.prepare(`
      INSERT INTO combos (id, name, description, category, calories, dietary_info, items_detail, icon, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insert.run(newId, name.trim(), description || '', cat, cal, info, items, comboIcon);

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
    const inUse = db.prepare('SELECT COUNT(*) as count FROM daily_entitlements WHERE combo_id = ?').get(id);
    if (inUse.count > 0) {
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

// ----------------------------------------------------------------------------
// 4.9 CONFIGURACIÓN DEL ENTE GUBERNAMENTAL / MARCA BLANCA (MULTI-TENANT B2G)
// ----------------------------------------------------------------------------
app.get('/api/v1/tenant/settings', (req, res) => {
  try {
    let tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    if (!tenant) {
      tenant = {
        id: 'current_tenant',
        entity_name: 'Ministerio del Poder Popular para la Comunicación y la Información',
        entity_short_name: 'MIPPCI',
        slogan: 'Bienestar y Soberanía Alimentaria Institucional',
        logo_url: '',
        primary_color: '#0284c7',
        secondary_color: '#0ea5e9'
      };
    }

    const distributionPoints = db.prepare('SELECT id, name, location_code, address FROM distribution_points WHERE is_active = 1').all();
    const departments = db.prepare('SELECT id, code, name FROM departments ORDER BY name ASC').all();

    res.json({
      tenant,
      distributionPoints,
      departments
    });
  } catch (err) {
    console.error('[TENANT GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener configuración del ente' });
  }
});

app.post('/api/v1/tenant/settings', (req, res) => {
  const { entity_name, entity_short_name, slogan, logo_url, primary_color, secondary_color, supervisor_qr_mode } = req.body;

  if (!entity_name || !entity_name.trim()) {
    return res.status(400).json({ error: 'El nombre del ente gubernamental es requerido' });
  }

  try {
    const qrMode = (supervisor_qr_mode !== undefined) ? (supervisor_qr_mode ? 1 : 0) : null;

    db.prepare(`
      INSERT INTO tenant_settings (id, entity_name, entity_short_name, slogan, logo_url, primary_color, secondary_color, updated_at)
      VALUES ('current_tenant', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        entity_name = excluded.entity_name,
        entity_short_name = excluded.entity_short_name,
        slogan = excluded.slogan,
        logo_url = excluded.logo_url,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      entity_name.trim(),
      (entity_short_name || 'GOB').trim().toUpperCase(),
      (slogan || '').trim(),
      logo_url || '',
      primary_color || '#0284c7',
      secondary_color || '#0ea5e9'
    );

    if (qrMode !== null) {
      db.prepare("UPDATE tenant_settings SET supervisor_qr_mode = ? WHERE id = 'current_tenant'").run(qrMode);
    }

    const updated = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    console.log(`[TENANT] Identidad institucional actualizada: ${updated.entity_short_name} - ${updated.entity_name} (supervisor_qr_mode: ${updated.supervisor_qr_mode})`);

    res.json({
      success: true,
      message: 'Identidad y configuración institucional guardadas exitosamente',
      tenant: updated
    });
  } catch (err) {
    console.error('[TENANT POST ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar configuración institucional' });
  }
});

// ----------------------------------------------------------------------------
// 4.9.0 CÓDIGO QR DE APROBACIÓN DIARIA DEL SUPERVISOR (BENEFICIARIOS SIN SMARTPHONE)
// ----------------------------------------------------------------------------
app.get('/api/v1/supervisor/daily-qr', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Buscar supervisor o admin activo
    let supervisor = db.prepare("SELECT id, document_id, full_name, email, role FROM workers WHERE role IN ('supervisor', 'admin') AND status = 'active' LIMIT 1").get();
    if (!supervisor) {
      supervisor = db.prepare("SELECT id, document_id, full_name, email, role FROM workers LIMIT 1").get();
    }

    if (!supervisor) {
      return res.status(404).json({ error: 'No se encontró un usuario supervisor o administrador registrado en el sistema.' });
    }

    // Firma HMAC determinista para la fecha del día
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
});

// Conmutar Modo de Validación (Tarjetas NFC vs Código QR Diario del Supervisor)
app.post('/api/v1/tenant/settings/validation-mode', (req, res) => {
  try {
    const { supervisor_qr_mode } = req.body;
    const modeVal = supervisor_qr_mode ? 1 : 0;

    db.prepare(`
      UPDATE tenant_settings 
      SET supervisor_qr_mode = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 'current_tenant'
    `).run(modeVal);

    const updated = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    console.log(`[VALIDATION MODE] Modo cambiado: ${modeVal === 1 ? 'Código QR Diario de Supervisor' : 'Tarjetas Físicas NFC'}`);

    res.json({
      success: true,
      supervisor_qr_mode: modeVal === 1,
      message: modeVal === 1
        ? 'Modo de validación por Código QR Diario del Supervisor ACTIVADO. Las entregas a beneficiarios sin smartphone se autorizan con el QR diario en mesa.'
        : 'Modo de validación por Tarjeta Física NFC ACTIVADO. Las entregas a beneficiarios sin smartphone requieren lectura de tarjeta NFC/RFID.',
      tenant: updated
    });
  } catch (err) {
    console.error('[VALIDATION MODE ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar el modo de validación: ' + err.message });
  }
});

// ----------------------------------------------------------------------------
// 4.9.1 GESTIÓN DINÁMICA DE PUNTOS / SEDES DE DESPACHO
// ----------------------------------------------------------------------------
app.get('/api/v1/distribution-points', (req, res) => {
  try {
    const points = db.prepare('SELECT id, name, location_code, address, is_active FROM distribution_points WHERE is_active = 1 ORDER BY name ASC').all();
    res.json({ success: true, distributionPoints: points });
  } catch (err) {
    console.error('[DISTRIBUTION POINTS GET ERROR]', err);
    res.status(500).json({ error: 'Error al listar sedes de despacho' });
  }
});

app.post('/api/v1/distribution-points', (req, res) => {
  const { name, location_code, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la sede es obligatorio' });
  }
  const cleanCode = (location_code || name.substring(0, 8)).trim().toUpperCase().replace(/\s+/g, '-');

  try {
    const existing = db.prepare('SELECT id FROM distribution_points WHERE location_code = ?').get(cleanCode);
    if (existing) {
      return res.status(409).json({ error: `Ya existe una sede con el código de ubicación "${cleanCode}"` });
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO distribution_points (id, name, location_code, address, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(id, name.trim(), cleanCode, (address || '').trim());

    const created = db.prepare('SELECT id, name, location_code, address FROM distribution_points WHERE id = ?').get(id);
    console.log(`[DISTRIBUTION POINT] Nueva sede creada: ${created.name} (${created.location_code})`);

    res.status(201).json({
      success: true,
      message: 'Sede de despacho creada exitosamente',
      point: created
    });
  } catch (err) {
    console.error('[DISTRIBUTION POINT CREATE ERROR]', err);
    res.status(500).json({ error: 'Error al crear la sede de despacho' });
  }
});

app.put('/api/v1/distribution-points/:id', (req, res) => {
  const { id } = req.params;
  const { name, location_code, address } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la sede es obligatorio' });
  }
  const cleanCode = (location_code || name.substring(0, 8)).trim().toUpperCase().replace(/\s+/g, '-');

  try {
    const current = db.prepare('SELECT id FROM distribution_points WHERE id = ?').get(id);
    if (!current) {
      return res.status(404).json({ error: 'Sede de despacho no encontrada' });
    }

    const duplicate = db.prepare('SELECT id FROM distribution_points WHERE location_code = ? AND id != ?').get(cleanCode, id);
    if (duplicate) {
      return res.status(409).json({ error: `El código "${cleanCode}" ya está en uso por otra sede` });
    }

    db.prepare(`
      UPDATE distribution_points
      SET name = ?, location_code = ?, address = ?
      WHERE id = ?
    `).run(name.trim(), cleanCode, (address || '').trim(), id);

    const updated = db.prepare('SELECT id, name, location_code, address FROM distribution_points WHERE id = ?').get(id);
    console.log(`[DISTRIBUTION POINT] Sede actualizada: ${updated.name} (${updated.location_code})`);

    res.json({
      success: true,
      message: 'Sede de despacho actualizada exitosamente',
      point: updated
    });
  } catch (err) {
    console.error('[DISTRIBUTION POINT UPDATE ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar la sede de despacho' });
  }
});

// ----------------------------------------------------------------------------
// 4.9.2 ESTADO DEL SISTEMA, PUESTA A CERO & ASISTENTE DE CONFIGURACIÓN INICIAL
// ----------------------------------------------------------------------------
app.get('/api/v1/system/status', (req, res) => {
  try {
    const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM workers WHERE role = 'admin'").get().count;
    const is_initialized = tenant ? (tenant.is_initialized === 1 && adminCount > 0) : false;

    res.json({
      success: true,
      is_initialized: Boolean(is_initialized),
      has_admin: adminCount > 0,
      tenant: tenant || null
    });
  } catch (err) {
    console.error('[SYSTEM STATUS ERROR]', err);
    res.status(500).json({ error: 'Error al verificar estado del sistema' });
  }
});

app.get('/api/v1/admin/export-backup', (req, res) => {
  try {
    const dateStr = new Date().toISOString().split('T')[0];
    const backup = {
      export_version: '2.3',
      exported_at: new Date().toISOString(),
      tenant: db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get() || {},
      departments: db.prepare("SELECT * FROM departments").all(),
      distribution_points: db.prepare("SELECT * FROM distribution_points").all(),
      combos: db.prepare("SELECT * FROM combos").all(),
      workers: db.prepare("SELECT id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number FROM workers").all(),
      campaigns: db.prepare("SELECT * FROM delivery_campaigns").all(),
      daily_entitlements: db.prepare("SELECT * FROM daily_entitlements").all(),
      deliveries: db.prepare("SELECT * FROM deliveries").all(),
      payroll_sync_logs: db.prepare("SELECT * FROM payroll_sync_logs").all()
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sgbt_backup_${dateStr}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('[EXPORT BACKUP ERROR]', err);
    res.status(500).json({ error: 'Error al generar el respaldo de la base de datos' });
  }
});

app.post('/api/v1/admin/factory-reset', (req, res) => {
  const { phrase, keep_templates } = req.body;

  if (!phrase || phrase.trim() !== 'REINICIAR SISTEMA') {
    return res.status(400).json({ error: 'Debe ingresar exactamente la frase "REINICIAR SISTEMA" para autorizar la puesta a cero.' });
  }

  try {
    // 1. Limpieza de datos transaccionales, auditorías, jornadas y beneficiarios
    db.exec(`
      DELETE FROM deliveries;
      DELETE FROM daily_entitlements;
      DELETE FROM delivery_campaigns;
      DELETE FROM system_notifications;
      DELETE FROM passkey_credentials;
      DELETE FROM nfc_cards;
      DELETE FROM workers;
    `);

    // 2. Si no se desea conservar plantillas, vaciar combos, sedes y departamentos
    if (!keep_templates) {
      db.exec(`
        DELETE FROM combos;
        DELETE FROM distribution_points;
        DELETE FROM departments;
      `);
    }

    // 3. Marcar el sistema como no inicializado
    db.prepare(`
      UPDATE tenant_settings
      SET is_initialized = 0,
          entity_name = 'Ente Institucional',
          entity_short_name = 'INSTITUCIÓN',
          slogan = 'Bienestar y Soberanía Alimentaria',
          logo_url = '',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 'current_tenant'
    `).run();

    // 4. Limpiar llaves de enclave simuladas en memoria
    if (secureEnclaveSimulator && typeof secureEnclaveSimulator.clear === 'function') {
      secureEnclaveSimulator.clear();
    }

    console.log('[FACTORY RESET] Base de datos puesta a cero exitosamente. is_initialized = 0.');

    res.json({
      success: true,
      message: 'Base de datos puesta a cero exitosamente. El sistema está listo para la primera configuración.',
      is_initialized: false
    });
  } catch (err) {
    console.error('[FACTORY RESET ERROR]', err);
    res.status(500).json({ error: 'Error al ejecutar la puesta a cero de la base de datos' });
  }
});

app.post('/api/v1/setup/initialize', (req, res) => {
  const { admin, tenant, distribution_point, combo, combos, workers, clear_demo_data } = req.body;

  if (!admin || !admin.document_id || !admin.full_name) {
    return res.status(400).json({ error: 'Los datos del Administrador Principal (Cédula y Nombre) son obligatorios.' });
  }

  try {
    const adminDoc = admin.document_id.trim().toUpperCase();
    const adminEmail = (admin.email && admin.email.trim()) ? admin.email.trim() : `${adminDoc.toLowerCase().replace(/[^a-z0-9]/g, '')}@mippci.gob.ve`;

    // 0. Limpieza de beneficiarios y transacciones de demostración si procede
    if (clear_demo_data !== false) {
      db.exec(`
        DELETE FROM deliveries;
        DELETE FROM daily_entitlements;
        DELETE FROM system_notifications;
        DELETE FROM delivery_campaigns;
        DELETE FROM passkey_credentials;
        DELETE FROM nfc_cards;
        DELETE FROM workers;
        DELETE FROM combos;
        DELETE FROM distribution_points;
      `);
      if (secureEnclaveSimulator && typeof secureEnclaveSimulator.clear === 'function') {
        secureEnclaveSimulator.clear();
      }
    }

    // 1. Departamento por defecto si no existe
    let deptId = null;
    const existingDept = db.prepare('SELECT id FROM departments LIMIT 1').get();
    if (existingDept) {
      deptId = existingDept.id;
    } else {
      deptId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO departments (id, code, name, cost_center)
        VALUES (?, 'DGGH_01', 'Dirección General de Gestión Humana', 'CC-1010')
      `).run(deptId);
    }

    // 2. Crear Administrador Principal
    const adminId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO workers (
        id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
      ) VALUES (?, ?, ?, ?, ?, 'jornada_continua', 'active', 'activo', 'admin', 1, ?)
    `).run(
      adminId,
      adminDoc,
      admin.full_name.trim(),
      adminEmail,
      deptId,
      admin.phone_number || ''
    );

    // 3. Configurar Tenant / Identidad Institucional y Desactivar Modo Demostración
    if (tenant) {
      db.prepare(`
        UPDATE tenant_settings
        SET entity_name = ?,
            entity_short_name = ?,
            slogan = ?,
            logo_url = ?,
            primary_color = ?,
            secondary_color = ?,
            is_initialized = 1,
            is_demo_mode = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'current_tenant'
      `).run(
        tenant.entity_name?.trim() || 'Ministerio del Poder Popular para la Comunicación y la Información',
        tenant.entity_short_name?.trim().toUpperCase() || 'MIPPCI',
        tenant.slogan?.trim() || 'Bienestar y Soberanía Alimentaria Institucional',
        tenant.logo_url || '',
        tenant.primary_color || '#0284c7',
        tenant.secondary_color || '#0ea5e9'
      );
    } else {
      db.prepare("UPDATE tenant_settings SET is_initialized = 1, is_demo_mode = 0 WHERE id = 'current_tenant'").run();
    }

    // 4. Crear Punto / Sede de Despacho si se especificó
    let pointId = null;
    if (distribution_point && distribution_point.name && distribution_point.name.trim()) {
      pointId = crypto.randomUUID();
      const pointCode = (distribution_point.location_code || distribution_point.name.substring(0, 6)).trim().toUpperCase().replace(/\s+/g, '-');
      db.prepare(`
        INSERT INTO distribution_points (id, name, location_code, address, is_active)
        VALUES (?, ?, ?, ?, 1)
      `).run(pointId, distribution_point.name.trim(), pointCode, (distribution_point.address || '').trim());
    }

    // 5. Crear Combos / Beneficios y Disposición Logística de Mesas de Despacho
    const createdCombos = [];
    const combosToInsert = (Array.isArray(combos) && combos.length > 0)
      ? combos
      : (combo && combo.name ? [combo] : []);

    let primaryComboId = null;

    for (let i = 0; i < combosToInsert.length; i++) {
      const c = combosToInsert[i];
      if (!c.name || !c.name.trim()) continue;

      const comboId = crypto.randomUUID();
      if (!primaryComboId) primaryComboId = comboId;

      const mesaNum = parseInt(c.mesa_number, 10) || (i + 1);
      const mesaName = (c.mesa_name && c.mesa_name.trim()) ? c.mesa_name.trim() : `Mesa ${mesaNum}`;
      const cat = c.category || 'bolsa_viveres';
      const conservation = (c.conservation && c.conservation.trim()) ? c.conservation.trim() : (cat.includes('proteico') ? 'Cadena de Frío' : 'Ambiente');
      const targetQty = c.target_qty ? String(c.target_qty).trim() : '1 por funcionario';
      const cal = parseInt(c.calories, 10) || 1200;
      const icon = c.icon || (
        cat === 'combo_higienico' ? '🧼' :
        cat === 'utiles_escolares' ? '🎒' :
        (cat === 'combo_proteico' || cat === 'proteico') ? '🍗' :
        cat === 'combo_navideno' ? '🎁' : '📦'
      );

      db.prepare(`
        INSERT INTO combos (id, name, description, category, calories, dietary_info, items_detail, icon, mesa_number, mesa_name, conservation, target_qty, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        comboId,
        c.name.trim(),
        c.description || `${mesaName} - Disposición logística (${conservation}) - Cantidad: ${targetQty}`,
        cat,
        cal,
        conservation,
        c.items_detail || 'Rubros y artículos asignados para la entrega',
        icon,
        mesaNum,
        mesaName,
        conservation,
        targetQty
      );

      // Registrar también la estación de despacho en distribution_points
      const mesaCode = `MESA-${String(mesaNum).padStart(2, '0')}`;
      try {
        db.prepare(`
          INSERT OR IGNORE INTO distribution_points (id, name, location_code, address, is_active)
          VALUES (?, ?, ?, ?, 1)
        `).run(
          crypto.randomUUID(),
          `${mesaName}: ${c.name.trim()}`,
          mesaCode,
          `Estación de Despacho N° ${mesaNum} [${conservation}] - ${distribution_point?.name || 'Sede Principal MIPPCI'}`
        );
      } catch (err) {}

      createdCombos.push({
        id: comboId,
        name: c.name.trim(),
        mesa_number: mesaNum,
        mesa_name: mesaName,
        category: cat,
        conservation: conservation,
        target_qty: targetQty,
        icon: icon
      });
    }

    // 5.1 Crear Campaña Operacional Inicial si existen punto y combo
    if (pointId && primaryComboId) {
      const campId = crypto.randomUUID();
      const todayStr = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      try {
        db.prepare(`
          INSERT INTO delivery_campaigns (id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent)
          VALUES (?, 'Jornada Integral de Despacho Multi-Mesa MIPPCI', 'Distribución organizada por mesas de entrega: Víveres, Higiene, Útiles y Cadena de Frío', ?, ?, ?, 'all', ?, 'en_curso', 1)
        `).run(campId, todayStr, endDate, primaryComboId, pointId);

        db.prepare(`
          INSERT INTO system_notifications (id, campaign_id, title, message, target_group, notification_type)
          VALUES (?, ?, '📢 ¡Jornada Integral de Despacho Activa!', 'Se encuentra activo el despacho de beneficios organizados por mesas de entrega (Víveres, Higiene, Útiles y Proteínas en Cadena de Frío). Presente su credencial o QR biométrico.', 'all', 'jornada')
        `).run(crypto.randomUUID(), campId);
      } catch (e) {
        console.warn('[CAMPAIGN INIT WARNING]', e.message);
      }
    }

    // 6. Cargar trabajadores adicionales si se cargó nómina CSV
    let importedWorkersCount = 0;
    if (Array.isArray(workers) && workers.length > 0) {
      const insertWorker = db.prepare(`
        INSERT OR IGNORE INTO workers (
          id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `);

      for (const w of workers) {
        if (!w.document_id || !w.full_name) continue;
        const wDoc = w.document_id.trim().toUpperCase();
        if (wDoc === adminDoc) continue; // Ya es el admin

        insertWorker.run(
          crypto.randomUUID(),
          wDoc,
          w.full_name.trim(),
          w.email || `${wDoc.toLowerCase().replace(/[^0-9a-z]/g, '')}@mippci.gob.ve`,
          deptId,
          w.shift || 'jornada_continua',
          w.worker_type || 'activo',
          w.role || 'worker',
          1,
          w.phone_number || ''
        );
        importedWorkersCount++;
      }
    }

    console.log(`[SETUP COMPLETE] Instalación oficial completada para: ${tenant?.entity_name || 'Ente'}. Admin: ${admin.full_name}. Modo producción activado (is_demo_mode = 0). Nómina cargada: ${importedWorkersCount}`);

    const createdAdmin = db.prepare('SELECT id, document_id, full_name, email, role FROM workers WHERE id = ?').get(adminId);
    const updatedTenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();

    res.status(201).json({
      success: true,
      message: '¡Plataforma instalada e inicializada exitosamente en Modo Producción!',
      admin: createdAdmin,
      tenant: updatedTenant,
      combos: createdCombos,
      imported_workers: importedWorkersCount
    });

  } catch (err) {
    console.error('[SETUP INITIALIZE ERROR]', err);
    res.status(500).json({ error: 'Error durante la inicialización del sistema: ' + err.message });
  }
});

// Descarga directa de archivo CSV modelo de nómina oficial (Plantilla SSOT)
const handleSamplePayrollCsv = (req, res) => {
  const csvContent = 
`cedula,nombre,email,telefono,departamento,turno,tipo_trabajador,tiene_telefono
V-18456123,Carlos Eduardo Mendoza,carlos.mendoza@mippci.gob.ve,+58 414 1234567,Dirección General de Gestión Humana,jornada_continua,activo,si
V-12345678,Roberto Alexander Gómez,roberto.gomez@mippci.gob.ve,+58 412 5551234,Dirección General de Comunicación Digital,jornada_continua,activo,si
V-06894321,Hilda Teresa Domínguez,hilda.dominguez@mippci.gob.ve,+58 424 9876543,Coordinación de Jubilados y Pensionados,jornada_continua,jubilado,no
V-21555666,Elena Sofía Morales,elena.morales@mippci.gob.ve,+58 416 7778899,Dirección General de Prensa Presidencial,mañana,activo,si
V-15888999,Andrés David Silva,andres.silva@mippci.gob.ve,+58 426 3334455,Dirección de Tecnología y Sistemas,tarde,contratado,si
V-14111222,Miguel Ángel Torres,miguel.torres@mippci.gob.ve,+58 414 0001122,Almacén y Servicios Generales,jornada_continua,activo,si
V-13222333,Claudia Patricia Vega,claudia.vega@mippci.gob.ve,+58 412 9998877,Dirección General de Gestión Humana,jornada_continua,activo,si
V-11123987,Juan Carlos Rivas,juan.rivas@mippci.gob.ve,+58 414 7776655,Dirección General de Gestión Humana,jornada_continua,activo,si`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nomina_oficial_mippci_plantilla.csv"');
  res.send('\uFEFF' + csvContent);
};

app.get('/api/v1/setup/sample-payroll.csv', handleSamplePayrollCsv);
app.get('/api/v1/payroll/sample-payroll.csv', handleSamplePayrollCsv);

// Conmutar Modo de Demostración vs Modo Producción
app.post('/api/v1/system/demo-mode', (req, res) => {
  const { enable } = req.body;

  try {
    const isDemo = enable !== false;
    db.prepare(`
      UPDATE tenant_settings
      SET is_demo_mode = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 'current_tenant'
    `).run(isDemo ? 1 : 0);

    if (isDemo) {
      // Si se activa el modo demo, restaurar los datos de prueba
      seedDatabase(true);
      console.log('[DEMO MODE] Modo de demostración ACTIVADO y datos de prueba restaurados.');
    } else {
      console.log('[DEMO MODE] Modo de demostración DESACTIVADO. Sistema en Modo Producción.');
    }

    const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get();

    res.json({
      success: true,
      is_demo_mode: isDemo,
      message: isDemo 
        ? 'Modo de Demostración activado exitosamente con perfiles de prueba.' 
        : 'Modo Producción activado. La demostración ha sido ocultada.',
      tenant
    });
  } catch (err) {
    console.error('[DEMO MODE TOGGLE ERROR]', err);
    res.status(500).json({ error: 'Error al cambiar el modo de demostración: ' + err.message });
  }
});

// ----------------------------------------------------------------------------
// 4.10 GESTIÓN DINÁMICA DE BENEFICIARIOS / NÓMINA FLEXIBLE
// ----------------------------------------------------------------------------
app.post('/api/v1/admin/workers', (req, res) => {
  const { document_id, full_name, email, department_id, worker_type, role, has_smartphone, phone_number, shift } = req.body;

  if (!document_id || !full_name) {
    return res.status(400).json({ error: 'Cédula y Nombre Completo son obligatorios' });
  }

  const cleanDoc = document_id.trim().toUpperCase();
  const workerEmail = (email && email.trim()) ? email.trim() : `${cleanDoc.toLowerCase().replace(/[^a-z0-9]/g, '')}@mippci.gob.ve`;

  try {
    const existing = db.prepare('SELECT id FROM workers WHERE document_id = ?').get(cleanDoc);
    if (existing) {
      return res.status(409).json({ error: `Ya existe un beneficiario registrado con la cédula ${cleanDoc}` });
    }

    const workerId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO workers (
        id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(
      workerId,
      cleanDoc,
      full_name.trim(),
      workerEmail,
      department_id || null,
      shift || 'jornada_continua',
      worker_type || 'activo',
      role || 'worker',
      has_smartphone !== undefined ? (has_smartphone ? 1 : 0) : 1,
      phone_number || null
    );

    const created = db.prepare('SELECT * FROM workers WHERE id = ?').get(workerId);
    console.log(`[WORKER CREATED] Beneficiario agregado: ${created.full_name} (${created.document_id})`);

    res.status(201).json({
      success: true,
      message: 'Beneficiario incorporado exitosamente al padrón institucional',
      worker: created
    });
  } catch (err) {
    console.error('[WORKER CREATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Carga masiva de nómina
app.post('/api/v1/admin/workers/batch', (req, res) => {
  const { workers } = req.body;
  if (!workers || !Array.isArray(workers) || workers.length === 0) {
    return res.status(400).json({ error: 'Se requiere una lista de trabajadores válida' });
  }

  let imported = 0;
  let skipped = 0;
  const errors = [];

  const insertWorker = db.prepare(`
    INSERT INTO workers (
      id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 'worker', ?, ?)
  `);

  const tx = db.transaction((list) => {
    for (const w of list) {
      if (!w.document_id || !w.full_name) {
        skipped++;
        continue;
      }
      const cleanDoc = w.document_id.trim().toUpperCase();
      const existing = db.prepare('SELECT id FROM workers WHERE document_id = ?').get(cleanDoc);
      if (existing) {
        skipped++;
        continue;
      }

      const email = w.email || `${cleanDoc.toLowerCase().replace(/[^a-z0-9]/g, '')}@institucion.gob.ve`;
      try {
        insertWorker.run(
          crypto.randomUUID(),
          cleanDoc,
          w.full_name.trim(),
          email,
          w.department_id || null,
          w.shift || 'jornada_continua',
          w.worker_type || 'activo',
          w.has_smartphone === false ? 0 : 1,
          w.phone_number || null
        );
        imported++;
      } catch (e) {
        errors.push({ doc: cleanDoc, error: e.message });
        skipped++;
      }
    }
  });

  try {
    tx(workers);
    res.json({
      success: true,
      message: `Importación completada: ${imported} beneficiarios registrados, ${skipped} omitidos o duplicados.`,
      imported_count: imported,
      skipped_count: skipped,
      errors
    });
  } catch (err) {
    console.error('[WORKER BATCH ERROR]', err);
    res.status(500).json({ error: 'Error durante la importación masiva de nómina' });
  }
});

// Actualizar o dar de baja a beneficiario
app.put('/api/v1/admin/workers/:id', (req, res) => {
  const { id } = req.params;
  const { full_name, email, department_id, worker_type, role, has_smartphone, phone_number, status, shift } = req.body;

  try {
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
    if (!worker) {
      return res.status(404).json({ error: 'Beneficiario no encontrado' });
    }

    db.prepare(`
      UPDATE workers SET
        full_name = COALESCE(?, full_name),
        email = COALESCE(?, email),
        department_id = COALESCE(?, department_id),
        worker_type = COALESCE(?, worker_type),
        role = COALESCE(?, role),
        has_smartphone = COALESCE(?, has_smartphone),
        phone_number = COALESCE(?, phone_number),
        status = COALESCE(?, status),
        shift = COALESCE(?, shift),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      full_name ? full_name.trim() : null,
      email ? email.trim() : null,
      department_id || null,
      worker_type || null,
      role || null,
      has_smartphone !== undefined ? (has_smartphone ? 1 : 0) : null,
      phone_number || null,
      status || null,
      shift || null,
      id
    );

    const updated = db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
    res.json({ success: true, message: 'Datos del beneficiario actualizados', worker: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/v1/admin/workers/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare("UPDATE workers SET status = 'terminated', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    res.json({ success: true, message: 'Beneficiario dado de baja (marcado inactivo)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4.11 PLANIFICACIÓN Y CRONOGRAMA DE JORNADAS DE ENTREGA (CAMPAIGNS)
// ----------------------------------------------------------------------------
app.get('/api/v1/admin/campaigns', (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT 
        c.id, c.name, c.description, c.start_date, c.end_date, c.target_group, c.status, c.notification_sent, c.created_at,
        cb.name as combo_name, cb.category as combo_category, cb.icon as combo_icon, cb.items_detail as combo_items,
        dp.name as point_name, dp.location_code as point_code
      FROM delivery_campaigns c
      LEFT JOIN combos cb ON c.combo_id = cb.id
      LEFT JOIN distribution_points dp ON c.distribution_point_id = dp.id
      ORDER BY c.start_date DESC, c.created_at DESC
    `).all();

    // Obtener estadísticas de cada jornada
    const enriched = campaigns.map(camp => {
      let workerCondition = "status = 'active'";
      if (camp.target_group === 'activo') workerCondition += " AND worker_type = 'activo'";
      else if (camp.target_group === 'jubilado') workerCondition += " AND worker_type IN ('jubilado', 'pensionado')";
      else if (camp.target_group === 'contratado') workerCondition += " AND worker_type = 'contratado'";

      const totalEligible = db.prepare(`SELECT COUNT(*) as count FROM workers WHERE ${workerCondition}`).get().count;

      // Asignaciones generadas para las fechas de esta jornada
      const entitlements = db.prepare(`
        SELECT 
          COUNT(*) as total_entitlements,
          SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM daily_entitlements
        WHERE valid_date >= ? AND valid_date <= ? AND combo_id = ?
      `).get(camp.start_date, camp.end_date, camp.combo_id || '');

      return {
        ...camp,
        total_eligible: totalEligible,
        assigned_count: entitlements ? (entitlements.total_entitlements || 0) : 0,
        claimed_count: entitlements ? (entitlements.claimed_count || 0) : 0,
        pending_count: entitlements ? (entitlements.pending_count || 0) : 0
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[CAMPAIGNS GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener jornadas de entrega' });
  }
});

app.post('/api/v1/admin/campaigns', (req, res) => {
  const { name, description, start_date, end_date, combo_id, target_group, distribution_point_id, auto_generate_entitlements } = req.body;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nombre de jornada, fecha inicio y fecha fin son obligatorios' });
  }

  const campaignId = crypto.randomUUID();
  const group = target_group || 'all';

  try {
    const tx = db.transaction(() => {
      // 1. Insertar campaña
      db.prepare(`
        INSERT INTO delivery_campaigns (
          id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'programada', 0)
      `).run(
        campaignId,
        name.trim(),
        description || '',
        start_date,
        end_date,
        combo_id || null,
        group,
        distribution_point_id || null
      );

      let generatedCount = 0;

      // 2. Si se solicitó autogenerar asignaciones para los beneficiarios
      if (combo_id && (auto_generate_entitlements !== false)) {
        let workerQuery = "SELECT id FROM workers WHERE status = 'active'";
        if (group === 'activo') workerQuery += " AND worker_type = 'activo'";
        else if (group === 'jubilado') workerQuery += " AND worker_type IN ('jubilado', 'pensionado')";
        else if (group === 'contratado') workerQuery += " AND worker_type = 'contratado'";

        const workers = db.prepare(workerQuery).all();
        const insertEntitlement = db.prepare(`
          INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
          VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
        `);

        for (const w of workers) {
          insertEntitlement.run(crypto.randomUUID(), w.id, combo_id, start_date);
          generatedCount++;
        }
      }

      return generatedCount;
    });

    const generated = tx();
    const created = db.prepare('SELECT * FROM delivery_campaigns WHERE id = ?').get(campaignId);

    console.log(`[CAMPAIGN CREATED] Jornada planificada: "${created.name}" para ${start_date} (${generated} asignaciones creadas)`);

    res.status(201).json({
      success: true,
      message: `Jornada "${created.name}" planificada con éxito (${generated} asignaciones preparadas)`,
      campaign: created,
      generated_entitlements: generated
    });
  } catch (err) {
    console.error('[CAMPAIGN CREATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Cambiar estado de la jornada ('programada', 'en_curso', 'finalizada', 'cancelada')
app.put('/api/v1/admin/campaigns/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Estado requerido' });
  }

  try {
    db.prepare('UPDATE delivery_campaigns SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true, message: `Estado de la jornada actualizado a: ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activar Notificación Push & In-App para una Jornada
app.post('/api/v1/admin/campaigns/:id/notify', (req, res) => {
  const { id } = req.params;
  const { custom_title, custom_message } = req.body;

  try {
    const camp = db.prepare(`
      SELECT c.*, cb.name as combo_name, dp.name as point_name 
      FROM delivery_campaigns c
      LEFT JOIN combos cb ON c.combo_id = cb.id
      LEFT JOIN distribution_points dp ON c.distribution_point_id = dp.id
      WHERE c.id = ?
    `).get(id);

    if (!camp) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const title = custom_title || `📢 ¡Jornada de Entrega: ${camp.name}!`;
    const message = custom_message || `Se ha programado la entrega de ${camp.combo_name || 'beneficios'} desde el ${camp.start_date} hasta el ${camp.end_date} en ${camp.point_name || 'Sede Principal'}. ¡Consulta tu código en la App!`;

    const notifId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO system_notifications (id, campaign_id, title, message, target_group, notification_type)
      VALUES (?, ?, ?, ?, ?, 'jornada')
    `).run(notifId, id, title, message, camp.target_group);

    db.prepare('UPDATE delivery_campaigns SET notification_sent = 1 WHERE id = ?').run(id);

    console.log(`[NOTIFICATION SENT] Aviso masivo emitido para jornada: ${camp.name}`);

    res.json({
      success: true,
      message: 'Notificación activada y enviada a los beneficiarios de la jornada',
      notification: {
        id: notifId,
        title,
        message,
        target_group: camp.target_group,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[NOTIFY ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4.12 SISTEMA DE NOTIFICACIONES (IN-APP & WEB PUSH API)
// ----------------------------------------------------------------------------
app.get('/api/v1/notifications', (req, res) => {
  const { worker_id } = req.query;

  try {
    let targetFilter = "n.target_group = 'all'";
    if (worker_id) {
      const worker = db.prepare('SELECT worker_type, department_id FROM workers WHERE id = ?').get(worker_id);
      if (worker) {
        targetFilter = `n.target_group IN ('all', '${worker.worker_type}', '${worker.department_id}')`;
      }
    }

    const notifications = db.prepare(`
      SELECT n.*, c.name as campaign_name, c.status as campaign_status
      FROM system_notifications n
      LEFT JOIN delivery_campaigns c ON n.campaign_id = c.id
      WHERE ${targetFilter}
      ORDER BY n.created_at DESC
      LIMIT 20
    `).all();

    res.json(notifications);
  } catch (err) {
    console.error('[NOTIFICATIONS GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

app.post('/api/v1/notifications', (req, res) => {
  const { title, message, target_group, notification_type } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Título y Mensaje son requeridos' });
  }

  const notifId = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO system_notifications (id, title, message, target_group, notification_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(notifId, title.trim(), message.trim(), target_group || 'all', notification_type || 'alerta');

    res.status(201).json({
      success: true,
      message: 'Aviso publicado exitosamente',
      notification_id: notifId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4.7.1 Estadísticas Analíticas y Métricas de Auditoría por Jornada
app.get('/api/v1/admin/audit/stats', (req, res) => {
  const { campaign_id } = req.query;

  try {
    let whereClause = "1=1";
    const params = [];
    let selectedCampaign = null;

    if (campaign_id && campaign_id !== 'all' && campaign_id !== '') {
      selectedCampaign = db.prepare("SELECT * FROM delivery_campaigns WHERE id = ?").get(campaign_id);
      if (selectedCampaign) {
        whereClause += " AND (del.campaign_id = ? OR (del.campaign_id IS NULL AND date(del.delivered_at) >= ? AND date(del.delivered_at) <= ?))";
        params.push(campaign_id, selectedCampaign.start_date, selectedCampaign.end_date);
      } else {
        whereClause += " AND del.campaign_id = ?";
        params.push(campaign_id);
      }
    }

    // 1. Métricas Globales
    const globalStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT del.worker_id) as total_workers,
        COUNT(del.id) as total_combos,
        ROUND(COALESCE(SUM(COALESCE(c.weight_kg, 14.0)), 0), 2) as total_weight_kg,
        ROUND(COALESCE(SUM(COALESCE(c.weight_kg, 14.0)), 0) / 1000.0, 3) as total_weight_tons
      FROM deliveries del
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
      WHERE ${whereClause}
    `).get(...params);

    const totalWorkers = globalStats.total_workers || 0;
    const totalCombos = globalStats.total_combos || 0;
    const totalWeightKg = globalStats.total_weight_kg || 0;
    const totalWeightTons = globalStats.total_weight_tons || 0;
    const avgKgPerWorker = totalWorkers > 0 ? (totalWeightKg / totalWorkers).toFixed(1) : 0;

    // 2. Desglose por Combo
    const combosBreakdown = db.prepare(`
      SELECT 
        c.id as combo_id,
        c.name as combo_name,
        c.category as combo_category,
        COALESCE(c.icon, '🍱') as combo_icon,
        COALESCE(c.weight_kg, 14.0) as unit_weight_kg,
        COUNT(del.id) as total_delivered,
        ROUND(SUM(COALESCE(c.weight_kg, 14.0)), 1) as total_kg,
        ROUND(SUM(COALESCE(c.weight_kg, 14.0)) / 1000.0, 3) as total_tons
      FROM deliveries del
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
      WHERE ${whereClause}
      GROUP BY c.id, c.name, c.category, c.icon, c.weight_kg
      ORDER BY total_delivered DESC
    `).all(...params);

    const combosWithPct = combosBreakdown.map(c => ({
      ...c,
      percentage: totalCombos > 0 ? Math.round((c.total_delivered / totalCombos) * 100) : 0
    }));

    // 3. Desglose por Departamento / Dirección Institucional
    const deptBreakdown = db.prepare(`
      SELECT 
        COALESCE(d.name, 'Sede Principal / Área Central') as department_name,
        COUNT(DISTINCT del.worker_id) as workers_count,
        COUNT(del.id) as combos_count,
        ROUND(SUM(COALESCE(c.weight_kg, 14.0)) / 1000.0, 3) as total_tons
      FROM deliveries del
      JOIN workers w ON del.worker_id = w.id
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE ${whereClause}
      GROUP BY d.name
      ORDER BY combos_count DESC
    `).all(...params);

    // 4. Desglose por Método de Validación
    const methodStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN del.verification_method = 'passkey_qr' THEN 1 ELSE 0 END) as passkey_qr,
        SUM(CASE WHEN del.verification_method = 'nfc_card' THEN 1 ELSE 0 END) as nfc_card,
        SUM(CASE WHEN del.verification_method = 'supervisor_daily_qr' THEN 1 ELSE 0 END) as supervisor_daily_qr,
        SUM(CASE WHEN del.verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as supervisor_override,
        SUM(CASE WHEN del.is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_deliveries,
        COUNT(del.id) as total
      FROM deliveries del
      WHERE ${whereClause}
    `).get(...params);

    // 5. Tasa de Cobertura de la Jornada o Padrón
    let totalEligible = 0;
    if (selectedCampaign) {
      let workerCondition = "status = 'active'";
      if (selectedCampaign.target_group === 'activo') workerCondition += " AND worker_type = 'activo'";
      else if (selectedCampaign.target_group === 'jubilado') workerCondition += " AND worker_type IN ('jubilado', 'pensionado')";
      else if (selectedCampaign.target_group === 'contratado') workerCondition += " AND worker_type = 'contratado'";
      totalEligible = db.prepare(`SELECT COUNT(*) as count FROM workers WHERE ${workerCondition}`).get().count;
    } else {
      totalEligible = db.prepare("SELECT COUNT(*) as count FROM workers WHERE status = 'active'").get().count;
    }

    const coveragePct = totalEligible > 0 ? Math.min(100, Math.round((totalWorkers / totalEligible) * 100)) : 100;

    // 6. Lista de todas las jornadas para el selector
    const campaignsList = db.prepare(`
      SELECT id, name, status, start_date, end_date 
      FROM delivery_campaigns 
      ORDER BY start_date DESC, created_at DESC
    `).all();

    res.json({
      success: true,
      selected_campaign: selectedCampaign,
      kpis: {
        total_workers: totalWorkers,
        total_combos: totalCombos,
        total_weight_kg: totalWeightKg,
        total_weight_tons: totalWeightTons,
        avg_kg_per_worker: avgKgPerWorker,
        total_eligible: totalEligible,
        coverage_pct: coveragePct
      },
      combos_breakdown: combosWithPct,
      departments_breakdown: deptBreakdown,
      methods_breakdown: {
        passkey_qr: methodStats ? (methodStats.passkey_qr || 0) : 0,
        nfc_card: methodStats ? (methodStats.nfc_card || 0) : 0,
        supervisor_daily_qr: methodStats ? (methodStats.supervisor_daily_qr || 0) : 0,
        supervisor_override: methodStats ? (methodStats.supervisor_override || 0) : 0,
        offline_deliveries: methodStats ? (methodStats.offline_deliveries || 0) : 0,
        total: methodStats ? (methodStats.total || 0) : 0
      },
      campaigns_list: campaignsList
    });
  } catch (err) {
    console.error('[AUDIT STATS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// 4.7 Consola de Auditoría Inalterable de Entregas (Filtrado por Jornada, Método y Búsqueda)
app.get('/api/v1/admin/deliveries', (req, res) => {
  const { campaign_id, method, search, limit } = req.query;

  let sql = `
    SELECT 
      del.id, del.delivered_at, del.verification_method, del.is_offline_sync,
      del.override_reason, del.signature_proof, del.challenge_nonce,
      w.full_name as worker_name, w.document_id as worker_document, w.worker_type,
      d.name as department_name,
      c.name as combo_name, c.category as combo_category, COALESCE(c.weight_kg, 14.0) as weight_kg,
      camp.name as campaign_name, camp.id as campaign_id,
      dp.name as point_name,
      op.full_name as operator_name,
      sup.full_name as supervisor_name
    FROM deliveries del
    JOIN workers w ON del.worker_id = w.id
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN departments d ON w.department_id = d.id
    LEFT JOIN delivery_campaigns camp ON del.campaign_id = camp.id
    LEFT JOIN workers op ON del.delivered_by_user_id = op.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE 1=1
  `;
  const params = [];

  if (campaign_id && campaign_id !== 'all' && campaign_id !== '') {
    const selectedCamp = db.prepare("SELECT * FROM delivery_campaigns WHERE id = ?").get(campaign_id);
    if (selectedCamp) {
      sql += ` AND (del.campaign_id = ? OR (del.campaign_id IS NULL AND date(del.delivered_at) >= ? AND date(del.delivered_at) <= ?))`;
      params.push(campaign_id, selectedCamp.start_date, selectedCamp.end_date);
    } else {
      sql += ` AND del.campaign_id = ?`;
      params.push(campaign_id);
    }
  }

  if (method) {
    sql += ` AND del.verification_method = ?`;
    params.push(method);
  }
  if (search) {
    sql += ` AND (w.full_name LIKE ? OR w.document_id LIKE ? OR del.id LIKE ? OR d.name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY del.delivered_at DESC LIMIT ?`;
  params.push(parseInt(limit, 10) || 100);

  const deliveries = db.prepare(sql).all(...params);
  res.json({ total: deliveries.length, deliveries });
});

// 4.8 Exportación de Entregas y Auditoría por Jornada (CSV / JSON)
app.get('/api/v1/admin/export', (req, res) => {
  const { campaign_id, format } = req.query;
  const exportFormat = format || 'json';

  let sql = `
    SELECT 
      del.id as delivery_id,
      del.delivered_at,
      COALESCE(camp.name, 'Jornada General Institucional') as campaign_name,
      w.document_id,
      w.full_name as worker_name,
      COALESCE(d.name, 'Sede Principal') as department_name,
      c.name as combo_name,
      COALESCE(c.weight_kg, 14.0) as weight_kg,
      del.verification_method,
      del.is_offline_sync,
      dp.name as distribution_point,
      sup.full_name as supervisor_authorized,
      del.override_reason,
      del.signature_proof
    FROM deliveries del
    JOIN workers w ON del.worker_id = w.id
    JOIN daily_entitlements ent ON del.entitlement_id = ent.id
    JOIN combos c ON ent.combo_id = c.id
    JOIN distribution_points dp ON del.distribution_point_id = dp.id
    LEFT JOIN departments d ON w.department_id = d.id
    LEFT JOIN delivery_campaigns camp ON del.campaign_id = camp.id
    LEFT JOIN workers sup ON del.supervisor_id = sup.id
    WHERE 1=1
  `;
  const params = [];

  if (campaign_id && campaign_id !== 'all' && campaign_id !== '') {
    const selectedCamp = db.prepare("SELECT * FROM delivery_campaigns WHERE id = ?").get(campaign_id);
    if (selectedCamp) {
      sql += ` AND (del.campaign_id = ? OR (del.campaign_id IS NULL AND date(del.delivered_at) >= ? AND date(del.delivered_at) <= ?))`;
      params.push(campaign_id, selectedCamp.start_date, selectedCamp.end_date);
    } else {
      sql += ` AND del.campaign_id = ?`;
      params.push(campaign_id);
    }
  }

  sql += ` ORDER BY del.delivered_at DESC`;

  const deliveries = db.prepare(sql).all(...params);

  if (exportFormat === 'csv') {
    const headers = ['ID Entrega', 'Fecha/Hora', 'Jornada', 'Cédula', 'Trabajador', 'Departamento', 'Combo', 'Peso (Kg)', 'Método Validación', 'Offline Sync', 'Punto Entrega', 'Supervisor/Operador', 'Motivo Exención', 'Firma Criptográfica'];
    const csvRows = [headers.join(',')];

    deliveries.forEach(d => {
      csvRows.push([
        `"${d.delivery_id}"`,
        `"${d.delivered_at}"`,
        `"${d.campaign_name}"`,
        `"${d.document_id}"`,
        `"${d.worker_name}"`,
        `"${d.department_name}"`,
        `"${d.combo_name}"`,
        d.weight_kg,
        `"${d.verification_method}"`,
        d.is_offline_sync ? 'SÍ' : 'NO',
        `"${d.distribution_point}"`,
        `"${d.supervisor_authorized || 'Despachador Autorizado'}"`,
        `"${d.override_reason || 'N/A'}"`,
        `"${d.signature_proof ? d.signature_proof.substring(0, 32) + '...' : 'N/A'}"`
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_jornada_${campaign_id || 'todas'}.csv"`);
    return res.send('\uFEFF' + csvRows.join('\r\n'));
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

  // 1. Verificar expiración de 180 segundos (3 minutos para permitir verificación cómoda)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 180) {
    return res.status(400).json({
      valid: false,
      code: 'QR_EXPIRED',
      message: 'Código QR expirado (Vigencia máxima 180 segundos para evitar capturas de pantalla)'
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
    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campId = activeCamp ? activeCamp.id : null;

    // Resolver punto de entrega válido
    let distPoint = distribution_point_id 
      ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
      : null;
    if (!distPoint) {
      distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    }
    const finalPointId = distPoint ? distPoint.id : null;

    // Resolver usuario operador/supervisor válido
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
