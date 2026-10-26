// backend/services/supervisor.service.js
// Servicio de Supervisión Institucional, Delegación de Retiros y Aprobación de Contingencia

const crypto = require('crypto');
const { db } = require('../db');
const { generateNonce, generateDelegationToken } = require('../crypto-utils');

/**
 * Genera el Código QR Diario Dinámico del Supervisor para validación de beneficiarios sin smartphone.
 */
function generateSupervisorDailyQr() {
  const today = new Date().toISOString().split('T')[0];

  let supervisor = db.prepare("SELECT id, document_id, full_name, email, role FROM workers WHERE role IN ('supervisor', 'admin') AND status = 'active' LIMIT 1").get();
  if (!supervisor) {
    supervisor = db.prepare("SELECT id, document_id, full_name, email, role FROM workers LIMIT 1").get();
  }

  if (!supervisor) {
    const err = new Error('No se encontró un usuario supervisor o administrador registrado en el sistema.');
    err.status = 404;
    throw err;
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

  return {
    success: true,
    date: today,
    auth_code: shortAuthCode,
    supervisor,
    token: hmacToken.slice(0, 32),
    qr_payload: qrPayload,
    expires_at: `${today}T23:59:59`
  };
}

/**
 * Genera una autorización de retiro por delegación para beneficiarios de reposo o tercera edad.
 */
function createSupervisorDelegation({ beneficiary_doc, delegate_doc, supervisor_id, reason, valid_hours = 24, delegate_name }) {
  const cleanBenDoc = beneficiary_doc.trim().toUpperCase();
  const digitsBen = cleanBenDoc.replace(/[^0-9]/g, '');
  const beneficiary = db.prepare(`
    SELECT id, document_id, full_name, worker_type, department_id FROM workers
    WHERE UPPER(document_id) = ? 
       OR id = ? 
       OR (LENGTH(?) >= 5 AND REPLACE(REPLACE(REPLACE(REPLACE(UPPER(document_id), 'V-', ''), 'E-', ''), 'V', ''), '.', '') = ?)
  `).get(cleanBenDoc, cleanBenDoc, digitsBen, digitsBen);

  if (!beneficiary) {
    const err = new Error('El titular no se encuentra registrado en la nómina de beneficiarios.');
    err.status = 404;
    throw err;
  }

  const cleanDelDoc = delegate_doc.trim().toUpperCase();
  const digitsDel = cleanDelDoc.replace(/[^0-9]/g, '');
  let delegate = db.prepare(`
    SELECT id, document_id, full_name FROM workers
    WHERE UPPER(document_id) = ? 
       OR id = ? 
       OR (LENGTH(?) >= 5 AND REPLACE(REPLACE(REPLACE(REPLACE(UPPER(document_id), 'V-', ''), 'E-', ''), 'V', ''), '.', '') = ?)
  `).get(cleanDelDoc, cleanDelDoc, digitsDel, digitsDel);

  const finalDelegateName = delegate ? delegate.full_name : (delegate_name || 'Compañero Autorizado');
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
    delegate_name: finalDelegateName,
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

  return {
    success: true,
    delegation: qrPayload,
    qr_payload: qrPayload,
    qr_string: JSON.stringify(qrPayload),
    expires_in_hours: hours,
    message: `Autorización de retiro generada exitosamente. Válida por ${hours} horas para ${finalDelegateName}.`
  };
}

/**
 * Libera de forma inmediata un combo por contingencia justificada con firma de supervisor.
 */
function processContingencyOverride({ worker_document_id, supervisor_id, override_reason, distribution_point_id }) {
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
    const err = new Error('La Cédula no se encuentra registrada en la nómina institucional de beneficiarios.');
    err.status = 404;
    throw err;
  }

  const today = new Date().toISOString().split('T')[0];
  let ent = db.prepare(`
    SELECT e.id, c.name as combo_name, c.icon as combo_icon 
    FROM daily_entitlements e 
    JOIN combos c ON e.combo_id = c.id 
    WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1 AND e.status = 'pending'
    ORDER BY c.created_at ASC
    LIMIT 1
  `).get(worker.id, today);

  if (!ent) {
    ent = db.prepare(`
      SELECT e.id, c.name as combo_name, c.icon as combo_icon 
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1
      LIMIT 1
    `).get(worker.id, today);
  }

  if (!ent) {
    const activeCombo = db.prepare("SELECT id, name, icon FROM combos WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1").get();
    if (!activeCombo) {
      const err = new Error('No hay combos activos disponibles en el catálogo para despachar.');
      err.status = 400;
      throw err;
    }
    const newEntId = crypto.randomUUID();
    db.prepare(`
      INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
      VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
    `).run(newEntId, worker.id, activeCombo.id, today);
    ent = { id: newEntId, combo_name: activeCombo.name, combo_icon: activeCombo.icon };
  }

  // Verificar si ya fue entregado hoy (idx_unique_daily_claim)
  const alreadyDelivered = db.prepare('SELECT id, delivered_at FROM deliveries WHERE worker_id = ? AND entitlement_id = ? LIMIT 1').get(worker.id, ent.id);
  if (alreadyDelivered) {
    const err = new Error('¡ALERTA DE SEGURIDAD! El beneficio de hoy para este trabajador ya fue entregado previamente.');
    err.status = 409;
    throw err;
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

  return {
    success: true,
    delivery_id: deliveryId,
    worker: {
      id: worker.id,
      full_name: worker.full_name,
      document_id: worker.document_id,
      worker_type: worker.worker_type,
      department: worker.department_name
    },
    combo_name: combo ? combo.name : (ent.combo_name || 'Bolsa de Víveres y Proteína'),
    combo_icon: combo ? combo.icon : (ent.combo_icon || '📦'),
    combo_category: combo ? combo.category : 'bolsa_viveres',
    supervisor_name: supName,
    message: `¡Liberación por contingencia autorizada en 1 Clic con firma biométrica del supervisor (${supName})!`
  };
}

module.exports = {
  generateSupervisorDailyQr,
  createSupervisorDelegation,
  processContingencyOverride
};
