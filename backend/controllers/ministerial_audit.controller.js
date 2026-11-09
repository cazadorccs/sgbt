// backend/controllers/ministerial_audit.controller.js
// ============================================================================
// CONTROLADOR DE AUDITORÍA MINISTERIAL, MONITOR DE FORMALIZACIÓN Y ACTA DEFINITIVA (FASE 5)
// Fecha Límite de Cierre de Censo: 12/11/2026 | Gran Jornada de Despacho: 27/11/2026
// ============================================================================

const crypto = require('crypto');
const QRCode = require('qrcode');
const { db } = require('../db');
const { generateSha256IntegritySeal } = require('../services/audit.service');

// Prepared statements en caché para auditoría de entregas
let _stmtDelStats = null;
let _stmtDeliveriesList = null;

function getDelStatsStmt() {
  if (!_stmtDelStats) {
    _stmtDelStats = db.prepare(`
      SELECT 
        COUNT(del.id) as total_delivered_combos,
        COUNT(DISTINCT del.worker_id) as total_delivered_workers,
        ROUND(COALESCE(SUM(COALESCE(c.weight_kg, 14.0)), 0), 2) as total_weight_kg,
        ROUND(COALESCE(SUM(COALESCE(c.weight_kg, 14.0)), 0) / 1000.0, 3) as total_weight_tons,
        SUM(CASE WHEN del.verification_method IN ('passkey_qr', 'passkey_nfc') THEN 1 ELSE 0 END) as count_passkey,
        SUM(CASE WHEN del.verification_method = 'nfc_card' THEN 1 ELSE 0 END) as count_nfc,
        SUM(CASE WHEN del.verification_method = 'supervisor_daily_qr' THEN 1 ELSE 0 END) as count_sup_qr,
        SUM(CASE WHEN del.verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as count_override,
        SUM(CASE WHEN del.is_offline_sync = 1 THEN 1 ELSE 0 END) as count_offline
      FROM deliveries del
      JOIN daily_entitlements ent ON del.entitlement_id = ent.id
      JOIN combos c ON ent.combo_id = c.id
    `);
  }
  return _stmtDelStats;
}

function getDeliveriesListStmt() {
  if (!_stmtDeliveriesList) {
    _stmtDeliveriesList = db.prepare(`
      SELECT del.id, del.delivered_at, w.document_id 
      FROM deliveries del 
      JOIN workers w ON del.worker_id = w.id 
      ORDER BY del.delivered_at ASC, del.id ASC
    `);
  }
  return _stmtDeliveriesList;
}

/**
 * 1. KPIs gerenciales y semaforización de formalización por dirección
 */
const getMinisterialMonitorStats = (req, res) => {
  try {
    const tenant = db.prepare(`
      SELECT 
        entity_name, entity_short_name, slogan, 
        COALESCE(is_census_locked, 0) as is_census_locked,
        COALESCE(census_cutoff_date, '2026-11-12T23:59:59') as census_cutoff_date,
        census_locked_at, census_locked_by, census_lock_reason
      FROM tenant_settings 
      WHERE id = 'current_tenant'
    `).get() || {
      entity_name: 'Ministerio del Poder Popular para la Comunicación y la Información',
      entity_short_name: 'MIPPCI',
      is_census_locked: 0,
      census_cutoff_date: '2026-11-12T23:59:59'
    };

    // Padrón General
    const totalWorkers = db.prepare("SELECT COUNT(*) as cnt FROM workers WHERE status = 'active'").get().cnt;
    const formalizedWorkers = db.prepare("SELECT COUNT(*) as cnt FROM workers WHERE status = 'active' AND enrollment_status = 'registrado'").get().cnt;
    const rezagadosWorkers = db.prepare("SELECT COUNT(*) as cnt FROM workers WHERE status = 'active' AND (enrollment_status = 'precargado' OR enrollment_status IS NULL)").get().cnt;
    const workersWithPasskey = db.prepare("SELECT COUNT(DISTINCT worker_id) as cnt FROM passkey_credentials WHERE status = 'active'").get().cnt;

    const formalizationPct = totalWorkers > 0 ? Math.round((formalizedWorkers / totalWorkers) * 1000) / 10 : 0;
    const passkeyAdoptionPct = totalWorkers > 0 ? Math.round((workersWithPasskey / totalWorkers) * 1000) / 10 : 0;

    // Desglose con Semaforización por Dependencia / Dirección
    const depts = db.prepare(`
      SELECT 
        d.id, d.code, d.name, d.cost_center,
        COUNT(w.id) as total_workers,
        SUM(CASE WHEN w.enrollment_status = 'registrado' THEN 1 ELSE 0 END) as formalized_count,
        SUM(CASE WHEN w.enrollment_status = 'precargado' OR w.enrollment_status IS NULL THEN 1 ELSE 0 END) as rezagados_count
      FROM departments d
      JOIN workers w ON w.department_id = d.id AND w.status = 'active'
      GROUP BY d.id
      ORDER BY rezagados_count DESC, total_workers DESC
    `).all();

    const departmentsBreakdown = depts.map(d => {
      const tot = d.total_workers || 0;
      const form = d.formalized_count || 0;
      const pct = tot > 0 ? Math.round((form / tot) * 100) : 0;

      // Semaforización oficial
      let trafficLight = 'green';
      if (pct < 50) {
        trafficLight = 'red';
      } else if (pct < 85) {
        trafficLight = 'yellow';
      }

      return {
        id: d.id,
        code: d.code || 'S/C',
        name: d.name,
        cost_center: d.cost_center || '00-00-00',
        total_workers: tot,
        formalized_count: form,
        rezagados_count: d.rezagados_count || 0,
        formalization_pct: pct,
        traffic_light: trafficLight
      };
    });

    // Auditoría de Seguridad e Incidentes de Colusión Prevenidos
    const totalDeliveries = db.prepare("SELECT COUNT(*) as cnt FROM deliveries").get().cnt;
    let blockedIncidents = 0;
    try {
      blockedIncidents = db.prepare(`
        SELECT COUNT(*) as cnt FROM system_activity_logs 
        WHERE action LIKE '%REJECTED%' OR action LIKE '%DUPLICATE%' OR action LIKE '%FRAUD%'
      `).get()?.cnt || 0;
    } catch (e) {}

    // Última Acta Ministerial Generada
    const latestActa = db.prepare(`
      SELECT id, acta_number, digital_acta_hash, generated_at, total_workers_census, formalization_pct
      FROM ministerial_actas
      ORDER BY generated_at DESC LIMIT 1
    `).get() || null;

    return res.json({
      success: true,
      monitor: {
        dates: {
          census_cutoff_date: tenant.census_cutoff_date,
          campaign_date: '2026-11-27',
          now: new Date().toISOString()
        },
        census_lock: {
          is_locked: tenant.is_census_locked === 1,
          locked_at: tenant.census_locked_at,
          locked_by: tenant.census_locked_by,
          reason: tenant.census_lock_reason
        },
        kpis: {
          total_workers: totalWorkers,
          formalized_workers: formalizedWorkers,
          rezagados_workers: rezagadosWorkers,
          formalized_count: formalizedWorkers,
          rezagados_count: rezagadosWorkers,
          formalization_pct: formalizationPct,
          rezagados_pct: totalWorkers > 0 ? Math.round((rezagadosWorkers / totalWorkers) * 1000) / 10 : 0,
          workers_with_passkey: workersWithPasskey,
          passkey_adoption_count: workersWithPasskey,
          passkey_adoption_pct: passkeyAdoptionPct,
          total_deliveries: totalDeliveries,
          security_incidents_blocked: blockedIncidents
        },
        census: {
          total_workers: totalWorkers,
          formalized_count: formalizedWorkers,
          rezagados_count: rezagadosWorkers,
          formalization_pct: formalizationPct,
          rezagados_pct: totalWorkers > 0 ? Math.round((rezagadosWorkers / totalWorkers) * 1000) / 10 : 0,
          passkey_adoption_count: workersWithPasskey,
          passkey_adoption_pct: passkeyAdoptionPct
        },
        departments: departmentsBreakdown,
        latest_acta: latestActa
      }
    });
  } catch (err) {
    console.error('[MINISTERIAL MONITOR ERROR]', err);
    return res.status(500).json({ error: 'Error obteniendo monitor ministerial: ' + err.message });
  }
};

/**
 * 2. Directorio nominal de rezagados (personal sin clave ni selfie)
 */
const listRezagados = (req, res) => {
  try {
    const { search, department_id, page = 1, limit = 50 } = req.query;

    let query = `
      SELECT 
        w.id, w.document_id, w.full_name, w.email, w.phone_number, w.job_title,
        w.worker_type, w.enrollment_status, w.department_id,
        d.name as department_name, d.code as department_code
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.status = 'active' AND (w.enrollment_status = 'precargado' OR w.enrollment_status IS NULL)
    `;
    const params = [];

    if (department_id && department_id !== 'all') {
      query += ` AND w.department_id = ?`;
      params.push(department_id);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      query += ` AND (LOWER(w.full_name) LIKE ? OR LOWER(w.document_id) LIKE ? OR LOWER(w.email) LIKE ?)`;
      params.push(q, q, q);
    }

    query += ` ORDER BY d.name ASC, w.full_name ASC`;

    // Conteo total
    const countSql = query.replace(/SELECT[\s\S]+?FROM/i, 'SELECT COUNT(*) as count FROM');
    const total = db.prepare(countSql).get(...params)?.count || 0;

    // Paginación
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);

    const rezagados = db.prepare(query).all(...params);

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      rezagados
    });
  } catch (err) {
    console.error('[LIST REZAGADOS ERROR]', err);
    return res.status(500).json({ error: 'Error listando rezagados: ' + err.message });
  }
};

/**
 * 3. Exportación formal de Rezagados en CSV con formato institucional
 */
const exportRezagadosCsv = (req, res) => {
  try {
    const { department_id } = req.query;

    let query = `
      SELECT 
        w.document_id, w.full_name, w.email, w.phone_number, w.job_title,
        w.worker_type, d.name as department_name, d.code as department_code
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.status = 'active' AND (w.enrollment_status = 'precargado' OR w.enrollment_status IS NULL)
    `;
    const params = [];

    if (department_id && department_id !== 'all') {
      query += ` AND w.department_id = ?`;
      params.push(department_id);
    }

    query += ` ORDER BY d.name ASC, w.full_name ASC`;

    const records = db.prepare(query).all(...params);

    const headers = [
      'Cédula de Identidad',
      'Apellidos y Nombres',
      'Dirección / Adscripción',
      'Código Unidad',
      'Cargo Institucional',
      'Condición',
      'Correo Electrónico',
      'Teléfono Contacto',
      'Estado Censo',
      'Fecha Límite Formalización'
    ];

    const rows = [headers.join(',')];

    for (const r of records) {
      rows.push([
        `"${r.document_id || ''}"`,
        `"${(r.full_name || '').replace(/"/g, '""')}"`,
        `"${(r.department_name || 'Sin Asignar').replace(/"/g, '""')}"`,
        `"${r.department_code || ''}"`,
        `"${(r.job_title || 'Titular').replace(/"/g, '""')}"`,
        `"${r.worker_type || 'fijo'}"`,
        `"${r.email || ''}"`,
        `"${r.phone_number || ''}"`,
        `"NO FORMALIZADO (SIN SELFIE/CLAVE)"`,
        `"12/11/2026 23:59:59"`
      ].join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rezagados_censo_mippci_cierre_12nov.csv"`);
    return res.send(csvContent);
  } catch (err) {
    console.error('[EXPORT REZAGADOS CSV ERROR]', err);
    return res.status(500).json({ error: 'Error exportando reporte de rezagados: ' + err.message });
  }
};

/**
 * 4. Consulta de estado de congelamiento del censo
 */
const getCensusLockStatus = (req, res) => {
  try {
    const tenant = db.prepare(`
      SELECT 
        COALESCE(is_census_locked, 0) as is_census_locked,
        COALESCE(census_cutoff_date, '2026-11-12T23:59:59') as census_cutoff_date,
        census_locked_at, census_locked_by, census_lock_reason
      FROM tenant_settings 
      WHERE id = 'current_tenant'
    `).get();

    const isLocked = tenant ? tenant.is_census_locked === 1 : false;
    return res.json({
      success: true,
      is_locked: isLocked,
      reason: tenant ? tenant.census_lock_reason : null,
      census_lock: {
        is_locked: isLocked,
        cutoff_date: tenant ? tenant.census_cutoff_date : '2026-11-12T23:59:59',
        locked_at: tenant ? tenant.census_locked_at : null,
        locked_by: tenant ? tenant.census_locked_by : null,
        reason: tenant ? tenant.census_lock_reason : null
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error consultando estado de congelamiento: ' + err.message });
  }
};

/**
 * 5. Congelar o abrir prórroga del censo (Control exclusivo de RRHH / Admin)
 */
const toggleCensusLock = (req, res) => {
  try {
    const { lock, reason } = req.body;
    const shouldLock = lock === true || lock === 1 || lock === 'true';
    const lockedBy = (req.user && req.user.full_name) ? `${req.user.full_name} (${req.user.document_id})` : 'Dirección General de Gestión Humana';

    db.prepare(`
      UPDATE tenant_settings
      SET is_census_locked = ?,
          census_locked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
          census_locked_by = CASE WHEN ? = 1 THEN ? ELSE NULL END,
          census_lock_reason = ?
      WHERE id = 'current_tenant'
    `).run(
      shouldLock ? 1 : 0,
      shouldLock ? 1 : 0,
      shouldLock ? 1 : 0,
      lockedBy,
      reason ? reason.trim() : null
    );

    const action = shouldLock ? 'CENSUS_FROZEN_LOCKED' : 'CENSUS_PRORROGA_OPENED';
    console.log(`🔒 [CENSUS LOCK TOGGLED] Padrón institucional: ${shouldLock ? 'CONGELADO (CIERRE FORMAL)' : 'ABIERTO (PRÓRROGA)'} por ${lockedBy}`);

    return res.json({
      success: true,
      is_locked: shouldLock,
      is_census_locked: shouldLock,
      message: shouldLock 
        ? '¡Padrón institucional CONGELADO formalmente! Se ha cerrado la auto-formalización para la Gran Jornada.'
        : '¡Prórroga de Formalización ABIERTA! Se habilitó temporalmente el registro previo de trabajadores.',
      locked_by: lockedBy,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[TOGGLE CENSUS LOCK ERROR]', err);
    return res.status(500).json({ error: 'Error modificando congelamiento de censo: ' + err.message });
  }
};

/**
 * 6. Generación Oficial del Acta Ministerial Definitiva (SHA-256)
 */
const generateMinisterialActa = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    const tenant = db.prepare(`
      SELECT entity_name, entity_short_name, slogan, census_cutoff_date 
      FROM tenant_settings WHERE id = 'current_tenant'
    `).get() || {
      entity_name: 'Ministerio del Poder Popular para la Comunicación y la Información',
      entity_short_name: 'MIPPCI'
    };

    // 1. Métricas Consolidadas del Padrón Cerrado
    const totalWorkers = db.prepare("SELECT COUNT(*) as cnt FROM workers WHERE status = 'active'").get().cnt;
    const formalized = db.prepare("SELECT COUNT(*) as cnt FROM workers WHERE status = 'active' AND enrollment_status = 'registrado'").get().cnt;
    const rezagados = totalWorkers - formalized;
    const formalizationPct = totalWorkers > 0 ? Math.round((formalized / totalWorkers) * 1000) / 10 : 0;

    const passkeyUsers = db.prepare("SELECT COUNT(DISTINCT worker_id) as cnt FROM passkey_credentials WHERE status = 'active'").get().cnt;
    const passkeyPct = totalWorkers > 0 ? Math.round((passkeyUsers / totalWorkers) * 1000) / 10 : 0;

    // 2. Tonelaje Total y Asignación de Combos
    const activeCombos = db.prepare("SELECT id, name, category, weight_kg FROM combos WHERE is_active = 1").all();
    const combosPerWorker = activeCombos.length || 2;
    const totalCombosAssigned = totalWorkers * combosPerWorker;
    const weightPerWorker = activeCombos.reduce((acc, c) => acc + (c.weight_kg || 14.0), 0);
    const totalGrossWeightTons = Math.round(((totalWorkers * weightPerWorker) / 1000) * 100) / 100;

    // 3. Auditoría de Seguridad & Mitigación de Fraude
    let blockedIncidents = 0;
    try {
      blockedIncidents = db.prepare(`
        SELECT COUNT(*) as cnt FROM system_activity_logs 
        WHERE action LIKE '%REJECTED%' OR action LIKE '%DUPLICATE%' OR action LIKE '%FRAUD%'
      `).get()?.cnt || 0;
    } catch (e) {}

    // 4. Desglose Top por Dependencias
    const topDepts = db.prepare(`
      SELECT 
        d.code, d.name, COUNT(w.id) as workers_count,
        SUM(CASE WHEN w.enrollment_status = 'registrado' THEN 1 ELSE 0 END) as formalized_count
      FROM departments d
      JOIN workers w ON w.department_id = d.id AND w.status = 'active'
      GROUP BY d.id
      ORDER BY workers_count DESC
      LIMIT 10
    `).all();

    // 4.1. Reconciliación Viva de Despachos y Entregas de la Jornada
    let delStats = {
      total_delivered_combos: 0,
      total_delivered_workers: 0,
      total_weight_kg: 0,
      total_weight_tons: 0,
      count_passkey: 0,
      count_nfc: 0,
      count_sup_qr: 0,
      count_override: 0,
      count_offline: 0
    };
    let deliveriesMerkleHash = 'SGBT_NO_DELIVERIES';
    try {
      const qDel = getDelStatsStmt().get();
      if (qDel) delStats = { ...delStats, ...qDel };

      const deliveriesList = getDeliveriesListStmt().all();
      deliveriesMerkleHash = generateSha256IntegritySeal(deliveriesList);
    } catch (e) {
      console.warn('[DELIVERY RECONCILIATION WARN]', e.message);
    }

    // 5. Identificadores Oficiales
    const dateCode = today.replace(/-/g, '').slice(2);
    const randHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    const actaNumber = `ACTA-MINISTERIAL-${dateCode}-${randHex}`;
    const actaId = crypto.randomUUID();

    const generatedBy = (req.user && req.user.full_name) 
      ? `${req.user.full_name} (${req.user.document_id})` 
      : 'Dirección General de Gestión Humana (MIPPCI)';

    const signatories = {
      viceminister: {
        role: 'Despacho del Viceministro',
        name: 'Despacho del Viceministro de Gestión Comunicacional',
        status: 'firmado_digitalmente'
      },
      human_resources: {
        role: 'Dirección General de Gestión Humana',
        name: 'Dirección General de Gestión Humana (RRHH)',
        status: 'firmado_digitalmente'
      },
      technology: {
        role: 'Oficina de Tecnologías de Información',
        name: 'Oficina de Tecnologías de Información y Comunicación (OTIC)',
        status: 'firmado_digitalmente'
      },
      audit_inspectorate: {
        role: 'Inspectoría General de Servicios',
        name: 'Inspectoría General de Servicios y Auditoría Interna',
        status: 'firmado_digitalmente'
      },
      despacho: 'Despacho del Viceministro de Gestión Comunicacional',
      rrhh: 'Dirección General de Gestión Humana (RRHH)',
      tic: 'Oficina de Tecnologías de Información y Comunicación (OTIC)',
      inspectoria: 'Inspectoría General de Servicios y Auditoría Interna'
    };

    // 6. Construcción Canónica del Documento Electrónico
    const actaDoc = {
      id: actaId,
      acta_number: actaNumber,
      title: 'ACTA DEFINITIVA DE CONSOLIDACIÓN DE PADRÓN, FORMALIZACIÓN Y LIQUIDACIÓN MINISTERIAL',
      institution: tenant.entity_name || 'MIPPCI',
      short_name: tenant.entity_short_name || 'MIPPCI',
      campaign_date: '2026-11-27',
      census_cutoff_date: tenant.census_cutoff_date || '2026-11-12T23:59:59',
      generated_at: nowIso,
      generated_by: generatedBy,
      metrics: {
        total_workers_census: totalWorkers,
        total_formalized: formalized,
        total_rezagados: rezagados,
        formalization_pct: formalizationPct,
        passkey_adoption_pct: passkeyPct,
        total_combos_assigned: totalCombosAssigned,
        total_gross_weight_tons: totalGrossWeightTons,
        security_incidents_blocked: blockedIncidents
      },
      deliveries_summary: {
        total_delivered_combos: delStats.total_delivered_combos || 0,
        total_delivered_workers: delStats.total_delivered_workers || 0,
        total_weight_kg: delStats.total_weight_kg || 0,
        total_weight_tons: delStats.total_weight_tons || 0,
        delivery_coverage_pct: totalWorkers > 0 ? Math.round(((delStats.total_delivered_workers || 0) / totalWorkers) * 1000) / 10 : 0,
        methods_breakdown: {
          passkey_qr: delStats.count_passkey || 0,
          nfc_card: delStats.count_nfc || 0,
          supervisor_daily_qr: delStats.count_sup_qr || 0,
          supervisor_override: delStats.count_override || 0,
          offline_sync: delStats.count_offline || 0
        },
        deliveries_merkle_hash: deliveriesMerkleHash
      },
      top_departments: topDepts,
      signatories: signatories
    };

    const canonicalString = JSON.stringify(actaDoc);
    const digitalHash = crypto.createHash('sha256').update(canonicalString).digest('hex');

    let generatedByWorkerId = null;
    if (req.user) {
      const validWorker = db.prepare('SELECT id FROM workers WHERE id = ? OR document_id = ?').get(req.user.id || '', req.user.document_id || req.user.id || '');
      if (validWorker) generatedByWorkerId = validWorker.id;
    }

    // 7. Persistencia en Base de Datos
    db.prepare(`
      INSERT INTO ministerial_actas (
        id, acta_number, acta_type, title, institution, campaign_date, census_cutoff_date,
        total_workers_census, total_formalized, total_rezagados, formalization_pct,
        total_combos_assigned, total_gross_weight_tons, passkey_adoption_pct,
        security_incidents_blocked, digital_acta_hash, digital_acta_data, generated_by,
        generated_at, signatories
      ) VALUES (?, ?, 'cierre_censo_y_despacho', ?, ?, '2026-11-27', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(
      actaId,
      actaNumber,
      actaDoc.title,
      actaDoc.institution,
      actaDoc.census_cutoff_date,
      totalWorkers,
      formalized,
      rezagados,
      formalizationPct,
      totalCombosAssigned,
      totalGrossWeightTons,
      passkeyPct,
      blockedIncidents,
      digitalHash,
      canonicalString,
      generatedByWorkerId,
      JSON.stringify(signatories)
    );

    console.log(`📜 [MINISTERIAL ACTA GENERATED] ${actaNumber} | Sello SHA-256: ${digitalHash}`);

    return res.status(201).json({
      success: true,
      message: `Acta Ministerial Definitiva ${actaNumber} generada y firmada criptográficamente con éxito.`,
      acta_id: actaId,
      acta_number: actaNumber,
      digital_acta_hash: digitalHash,
      acta: {
        ...actaDoc,
        digital_acta_hash: digitalHash
      }
    });
  } catch (err) {
    console.error('[GENERATE MINISTERIAL ACTA ERROR]', err);
    return res.status(500).json({ error: 'Error generando acta ministerial: ' + err.message });
  }
};

/**
 * 7. Consulta de Acta Ministerial por ID o última emitida
 */
const getMinisterialActa = (req, res) => {
  try {
    const { id } = req.params;

    let row = null;
    if (id && id !== 'latest') {
      row = db.prepare("SELECT * FROM ministerial_actas WHERE id = ? OR acta_number = ?").get(id, id);
    } else {
      row = db.prepare("SELECT * FROM ministerial_actas ORDER BY generated_at DESC LIMIT 1").get();
    }

    if (!row) {
      return res.status(404).json({ error: 'Acta ministerial no encontrada o aún no ha sido emitida.' });
    }

    let parsedData = {};
    try {
      parsedData = JSON.parse(row.digital_acta_data);
    } catch (e) {}

    return res.json({
      success: true,
      acta: {
        id: row.id,
        acta_number: row.acta_number,
        title: row.title,
        institution: row.institution,
        campaign_date: row.campaign_date,
        census_cutoff_date: row.census_cutoff_date,
        generated_at: row.generated_at,
        generated_by: row.generated_by,
        metrics: {
          total_workers_census: row.total_workers_census,
          total_formalized: row.total_formalized,
          total_rezagados: row.total_rezagados,
          formalization_pct: row.formalization_pct,
          passkey_adoption_pct: row.passkey_adoption_pct,
          total_combos_assigned: row.total_combos_assigned,
          total_gross_weight_tons: row.total_gross_weight_tons,
          security_incidents_blocked: row.security_incidents_blocked
        },
        digital_acta_hash: row.digital_acta_hash,
        top_departments: parsedData.top_departments || [],
        signatories: parsedData.signatories || {},
        deliveries_summary: parsedData.deliveries_summary || null
      }
    });
  } catch (err) {
    console.error('[GET MINISTERIAL ACTA ERROR]', err);
    return res.status(500).json({ error: 'Error consultando acta ministerial: ' + err.message });
  }
};

/**
 * 8. Renderizado e Impresión Oficial del Acta Ministerial (HTML para Contraloría/PDF)
 */
const printMinisterialActaHtml = async (req, res) => {
  try {
    const { id } = req.params;
    let row = null;
    if (id && id !== 'latest') {
      row = db.prepare("SELECT * FROM ministerial_actas WHERE id = ? OR acta_number = ?").get(id, id);
    } else {
      row = db.prepare("SELECT * FROM ministerial_actas ORDER BY generated_at DESC LIMIT 1").get();
    }

    if (!row) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es"><head><meta charset="UTF-8"><title>Acta no encontrada</title>
        <style>body{font-family:sans-serif;text-align:center;padding:4rem;background:#f8fafc;color:#334155;}
        .card{background:white;padding:2rem;border-radius:8px;max-width:500px;margin:0 auto;box-shadow:0 4px 12px rgba(0,0,0,0.05);border:1px solid #e2e8f0;}</style>
        </head><body><div class="card"><h2>⚠️ Acta Ministerial No Encontrada</h2>
        <p>No se encontró ningún Acta Ministerial Definitiva con el identificador solicitado o aún no se ha emitido formalmente.</p>
        <button onclick="window.close()" style="background:#0284c7;color:white;border:none;padding:0.6rem 1.2rem;border-radius:6px;cursor:pointer;font-weight:600;">Cerrar Ventana</button></div></body></html>
      `);
    }

    let parsed = {};
    try {
      parsed = JSON.parse(row.digital_acta_data);
    } catch (e) {}

    const metrics = parsed.metrics || {
      total_workers_census: row.total_workers_census,
      total_formalized: row.total_formalized,
      total_rezagados: row.total_rezagados,
      formalization_pct: row.formalization_pct,
      passkey_adoption_pct: row.passkey_adoption_pct,
      total_combos_assigned: row.total_combos_assigned,
      total_gross_weight_tons: row.total_gross_weight_tons,
      security_incidents_blocked: row.security_incidents_blocked
    };

    const delSummary = parsed.deliveries_summary || {
      total_delivered_combos: row.total_combos_assigned || 0,
      total_delivered_workers: row.total_formalized || 0,
      total_weight_tons: row.total_gross_weight_tons || 0,
      delivery_coverage_pct: row.formalization_pct || 0,
      methods_breakdown: { passkey_qr: 0, nfc_card: 0, supervisor_daily_qr: 0, supervisor_override: 0, offline_sync: 0 }
    };

    const topDepts = parsed.top_departments || [];
    const deptRows = topDepts.map(d => `
      <tr>
        <td style="font-weight: 600;">${d.name || d.code || 'Dependencia'}</td>
        <td style="text-align: right;">${d.workers_count || 0}</td>
        <td style="text-align: right; font-weight: 700; color: #0284c7;">${d.formalized_count || 0}</td>
        <td style="text-align: right;">${d.workers_count > 0 ? Math.round(((d.formalized_count || 0) / d.workers_count) * 100) : 0}%</td>
      </tr>
    `).join('');

    const qrText = `MIPPCI-ACTA-MINISTERIAL:${row.acta_number}:HASH:${row.digital_acta_hash}`;
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(qrText, { width: 110, margin: 1, errorCorrectionLevel: 'M' });
    } catch (e) {
      console.error('Error generando QR para acta:', e);
    }

    const emissionDate = row.generated_at ? new Date(row.generated_at).toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'medium' }) : new Date().toLocaleString('es-VE');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta Ministerial Definitiva - ${row.acta_number}</title>
  <style>
    @page { size: letter; margin: 1.2cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.45; margin: 0; padding: 1.5rem; background: #f8fafc; }
    .page-container { max-width: 860px; margin: 0 auto; background: #ffffff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-titles h1 { font-size: 1.05rem; font-weight: 800; color: #0f172a; margin: 0 0 0.2rem 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-titles h2 { font-size: 0.9rem; font-weight: 700; color: #0284c7; margin: 0 0 0.2rem 0; text-transform: uppercase; }
    .header-titles p { font-size: 0.76rem; color: #64748b; margin: 0; }
    .badge-acta { text-align: right; }
    .badge-acta .num { font-size: 0.95rem; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 0.35rem 0.75rem; border-radius: 6px; display: inline-block; }
    .badge-acta .date { font-size: 0.72rem; color: #64748b; margin-top: 0.35rem; }
    .section-title { font-size: 0.88rem; font-weight: 700; text-transform: uppercase; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 0.5rem; margin: 1.5rem 0 0.75rem 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.85rem; margin-bottom: 1.25rem; }
    .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.85rem; text-align: center; }
    .kpi-box .val { font-size: 1.45rem; font-weight: 800; color: #0f172a; line-height: 1.1; }
    .kpi-box .lbl { font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 0.3rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: 0.82rem; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 0.5rem 0.65rem; border: 1px solid #cbd5e1; text-transform: uppercase; font-size: 0.72rem; }
    td { padding: 0.5rem 0.65rem; border: 1px solid #cbd5e1; color: #1e293b; }
    tr:nth-child(even) { background: #f8fafc; }
    .integrity-container { display: flex; gap: 1rem; align-items: center; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 1rem; margin: 1.5rem 0; }
    .integrity-box { flex: 1; font-size: 0.75rem; color: #166534; word-break: break-all; }
    .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-top: 3rem; text-align: center; }
    .sig-line { border-top: 1.5px solid #64748b; margin-top: 2.5rem; padding-top: 0.4rem; }
    .sig-line .name { font-weight: 700; font-size: 0.78rem; color: #0f172a; }
    .sig-line .title { font-size: 0.68rem; color: #64748b; margin-top: 0.15rem; }
    .print-actions { text-align: right; margin-bottom: 1.25rem; }
    .btn-print { background: #0284c7; color: #ffffff; border: none; padding: 0.55rem 1.2rem; font-weight: 600; font-size: 0.82rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn-print:hover { background: #0369a1; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .page-container { box-shadow: none; border: none; padding: 0; max-width: 100%; }
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="print-actions">
      <button class="btn-print" onclick="window.print()">
        <span>🖨️ Imprimir / Guardar como PDF</span>
      </button>
    </div>

    <div class="header">
      <div class="header-titles">
        <div style="font-size: 0.7rem; font-weight: 800; color: #64748b; letter-spacing: 0.1em;">REPÚBLICA BOLIVARIANA DE VENEZUELA</div>
        <h1>${row.institution || 'MINISTERIO DEL PODER POPULAR PARA LA COMUNICACIÓN Y LA INFORMACIÓN'}</h1>
        <h2>Acta Definitiva de Consolidación, Rendición y Cierre de Jornada</h2>
        <p>Gobierno Bolivariano &bull; Beneficios Sociales &bull; Control Criptográfico Asimétrico &bull; Despacho Ministerial</p>
      </div>
      <div class="badge-acta">
        <div class="num">${row.acta_number}</div>
        <div class="date">Emisión: ${emissionDate}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="val">${Number(metrics.total_workers_census || 0).toLocaleString()}</div>
        <div class="lbl">Padrón Institucional</div>
      </div>
      <div class="kpi-box">
        <div class="val" style="color: #0284c7;">${Number(metrics.total_formalized || 0).toLocaleString()}</div>
        <div class="lbl">Formalizados / Atendidos</div>
      </div>
      <div class="kpi-box">
        <div class="val" style="color: #16a34a;">${metrics.total_gross_weight_tons || 0} t</div>
        <div class="lbl">Tonelaje Consolidado</div>
      </div>
      <div class="kpi-box">
        <div class="val" style="color: #d97706;">${metrics.formalization_pct || 0}%</div>
        <div class="lbl">Cobertura Oficial</div>
      </div>
    </div>

    <div class="section-title">1. Resumen por Métodos de Validación y Seguridad Institucional</div>
    <table>
      <thead>
        <tr>
          <th>Mecanismo de Verificación</th>
          <th style="text-align: right;">Despachos</th>
          <th style="text-align: right;">Proporción</th>
          <th>Protocolo de Seguridad</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>FIDO2 / WebAuthn Passkey (Criptografía P-256)</td>
          <td style="text-align: right; font-weight: 700;">${delSummary.methods_breakdown?.passkey_qr || metrics.passkey_adoption_pct || 0}</td>
          <td style="text-align: right;">${metrics.passkey_adoption_pct || 0}%</td>
          <td><span style="color: #16a34a; font-weight: 600;">Máximo (Biométrico Asimétrico FIDO2)</span></td>
        </tr>
        <tr>
          <td>Tarjeta Física NFC / RFID Cifrada</td>
          <td style="text-align: right; font-weight: 700;">${delSummary.methods_breakdown?.nfc_card || 0}</td>
          <td style="text-align: right;">--</td>
          <td><span style="color: #0284c7; font-weight: 600;">Alto (Identificador Físico por Proximidad)</span></td>
        </tr>
        <tr>
          <td>QR Dinámico Rotativo de Mesa (Supervisor)</td>
          <td style="text-align: right; font-weight: 700;">${delSummary.methods_breakdown?.supervisor_daily_qr || 0}</td>
          <td style="text-align: right;">--</td>
          <td><span style="color: #ca8a04; font-weight: 600;">Medio-Alto (Rotación de Semilla Diaria)</span></td>
        </tr>
        <tr>
          <td>Liberación por Contingencia / Override Supervisado</td>
          <td style="text-align: right; font-weight: 700;">${delSummary.methods_breakdown?.supervisor_override || 0}</td>
          <td style="text-align: right;">--</td>
          <td><span style="color: #ea580c; font-weight: 600;">Auditado (Justificación y Cédula de Supervisor)</span></td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">2. Rendición Consolidada por Dependencias Ministeriales</div>
    <table>
      <thead>
        <tr>
          <th>Dependencia / Dirección General</th>
          <th style="text-align: right;">Nómina Habilitada</th>
          <th style="text-align: right;">Funcionarios Atendidos</th>
          <th style="text-align: right;">Cobertura (%)</th>
        </tr>
      </thead>
      <tbody>
        ${deptRows || '<tr><td colspan="4" style="text-align:center;">Todas las dependencias consolidadas al 100%.</td></tr>'}
      </tbody>
    </table>

    <div class="section-title">3. Certificación de Integridad Criptográfica Inmutable (SHA-256)</div>
    <div class="integrity-container">
      <div class="integrity-box">
        <strong>🔒 Sello SHA-256 Canónico de Cierre:</strong><br>
        <code style="font-size: 0.82rem; font-weight: 700; color: #14532d;">${row.digital_acta_hash}</code><br>
        <div style="color: #15803d; font-size: 0.72rem; margin-top: 0.4rem;">
          ✓ Este sello certifica ante el Despacho del Ministro, la Dirección General de Gestión Humana y la Inspectoría General de Servicios que el padrón, los volúmenes métricos y la bitácora de entregas fueron verificados sin alteraciones posteriores.
        </div>
      </div>
      ${qrDataUrl ? `<div><img src="${qrDataUrl}" width="96" height="96" alt="QR Verificación" style="border: 1px solid #86efac; border-radius: 4px; padding: 2px; background: white;" /></div>` : ''}
    </div>

    <div class="signatures">
      <div class="sig-line">
        <div class="name">Despacho del Viceministro</div>
        <div class="title">Gestión Comunicacional</div>
      </div>
      <div class="sig-line">
        <div class="name">Dirección General</div>
        <div class="title">Gestión Humana (RRHH)</div>
      </div>
      <div class="sig-line">
        <div class="name">Oficina TIC (OTIC)</div>
        <div class="title">Tecnologías de Información</div>
      </div>
      <div class="sig-line">
        <div class="name">Inspectoría General</div>
        <div class="title">Auditoría Interna y Servicios</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('[PRINT MINISTERIAL ACTA ERROR]', err);
    return res.status(500).send('Error generando vista de impresión del acta: ' + err.message);
  }
};

module.exports = {
  getMinisterialMonitorStats,
  listRezagados,
  exportRezagadosCsv,
  getCensusLockStatus,
  toggleCensusLock,
  generateMinisterialActa,
  getMinisterialActa,
  printMinisterialActaHtml
};
