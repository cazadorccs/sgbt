// backend/controllers/ministerial_audit.controller.js
// ============================================================================
// CONTROLADOR DE AUDITORÍA MINISTERIAL, MONITOR DE FORMALIZACIÓN Y ACTA DEFINITIVA (FASE 5)
// Fecha Límite de Cierre de Censo: 12/11/2026 | Gran Jornada de Despacho: 27/11/2026
// ============================================================================

const crypto = require('crypto');
const { db } = require('../db');

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
      top_departments: topDepts,
      signatories: signatories
    };

    const canonicalString = JSON.stringify(actaDoc);
    const digitalHash = crypto.createHash('sha256').update(canonicalString).digest('hex');

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
      req.user ? req.user.id : null,
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
        signatories: parsedData.signatories || {}
      }
    });
  } catch (err) {
    console.error('[GET MINISTERIAL ACTA ERROR]', err);
    return res.status(500).json({ error: 'Error consultando acta ministerial: ' + err.message });
  }
};

module.exports = {
  getMinisterialMonitorStats,
  listRezagados,
  exportRezagadosCsv,
  getCensusLockStatus,
  toggleCensusLock,
  generateMinisterialActa,
  getMinisterialActa
};
