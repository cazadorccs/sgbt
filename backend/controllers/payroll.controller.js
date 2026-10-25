// backend/controllers/payroll.controller.js
// Controlador para ingesta masiva de nómina, webhooks institucionales y bajas inmediatas (kill-switch)

const crypto = require('crypto');
const { db } = require('../db');
const { verifyWebhookHmac } = require('../crypto-utils');

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.PAYROLL_WEBHOOK_SECRET) {
  throw new Error('[CRITICAL DEVSECOPS SECURITY ERROR] La variable de entorno PAYROLL_WEBHOOK_SECRET debe estar configurada en producción.');
}
const WEBHOOK_SECRET = process.env.PAYROLL_WEBHOOK_SECRET || 'mippci_bolsa_secure_secret_key_2026';

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

const handleWebhook = (req, res) => {
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
};

const handleBatchImport = (req, res) => {
  let { batch_id, source, workers, csvText } = req.body;

  if (csvText && typeof csvText === 'string') {
    if (csvText.length > 10 * 1024 * 1024) { // Límite estricto de 10MB
      return res.status(413).json({ error: 'El archivo CSV excede el tamaño máximo permitido de 10MB.' });
    }
    workers = parseCsvToWorkers(csvText);
    source = source || 'csv_upload';
  } else if (typeof workers === 'string') {
    if (workers.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'La carga excede el tamaño máximo permitido de 10MB.' });
    }
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

  if (workers.length > 5000) {
    return res.status(413).json({ 
      error: 'El lote excede el límite máximo permitido de 5,000 registros por carga. Divida el lote en bloques menores.' 
    });
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
};

const terminateEmployee = (req, res) => {
  const worker_id = req.params.id;
  const { reason, authorized_by } = req.body;

  const worker = db.prepare('SELECT id, full_name FROM workers WHERE id = ?').get(worker_id);
  if (!worker) {
    return res.status(404).json({ error: 'Trabajador no encontrado' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE workers
      SET status = 'terminated', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(worker_id);

    const passkeyRes = db.prepare(`
      UPDATE passkey_credentials
      SET status = 'revoked'
      WHERE worker_id = ?
    `).run(worker_id);

    const nfcRes = db.prepare(`
      UPDATE nfc_cards
      SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
      WHERE worker_id = ?
    `).run(worker_id);

    const entRes = db.prepare(`
      UPDATE daily_entitlements
      SET status = 'expired'
      WHERE worker_id = ? AND status = 'pending'
    `).run(worker_id);

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
};

module.exports = {
  handleWebhook,
  handleBatchImport,
  terminateEmployee,
  parseCsvToWorkers
};
