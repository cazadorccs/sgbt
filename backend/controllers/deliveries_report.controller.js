// backend/controllers/deliveries_report.controller.js
// Controlador para Reporte Consolidado y Auditoría en Pantalla Completa de Entregas en Vivo (/entregas)

const { db } = require('../db');

/**
 * Convierte un timestamp ISO a formato legible en zona horaria America/Caracas
 */
function formatVzlaTime(isoString) {
  if (!isoString) return { dateStr: '--', timeStr: '--', fullStr: '--' };
  try {
    const d = new Date(isoString);
    const dateStr = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);

    const timeStr = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);

    return {
      dateStr,
      timeStr,
      fullStr: `${dateStr} ${timeStr}`
    };
  } catch (e) {
    return { dateStr: isoString, timeStr: '', fullStr: isoString };
  }
}

/**
 * Obtener reporte detallado de entregas con paginación, filtros y KPIs en tiempo real
 */
const getDeliveriesReport = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const todayUtc = new Date().toISOString().split('T')[0];
    const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

    // Parámetros de consulta
    const dateParam = (req.query.date || 'today').trim();
    const searchParam = (req.query.search || '').trim().toLowerCase();
    const methodParam = (req.query.method || 'all').trim();
    const pointParam = (req.query.point_id || 'all').trim();
    const operatorParam = (req.query.operator_id || 'all').trim();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(10, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    // Construcción dinámica del WHERE
    const whereClauses = [];
    const params = [];

    // 1. Filtro de fecha
    if (dateParam === 'today') {
      whereClauses.push(`(
        date(d.delivered_at) IN (?, ?)
        OR date(d.delivered_at, '-4 hours') IN (?, ?)
        OR substr(d.delivered_at, 1, 10) IN (?, ?)
        OR d.delivered_at >= datetime('now', '-24 hours')
      )`);
      params.push(todayUtc, todayVzla, todayUtc, todayVzla, todayUtc, todayVzla);
    } else if (dateParam === 'yesterday') {
      whereClauses.push(`date(d.delivered_at, '-4 hours') = date('now', '-4 hours', '-1 day')`);
    } else if (dateParam === 'week') {
      whereClauses.push(`d.delivered_at >= datetime('now', '-7 days')`);
    } else if (dateParam !== 'all' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      whereClauses.push(`(date(d.delivered_at) = ? OR date(d.delivered_at, '-4 hours') = ? OR substr(d.delivered_at, 1, 10) = ?)`);
      params.push(dateParam, dateParam, dateParam);
    }

    // 2. Filtro de búsqueda (Cédula, Nombre, Cargo, Departamento, Operador)
    if (searchParam) {
      whereClauses.push(`(
        LOWER(w.document_id) LIKE ? 
        OR LOWER(w.full_name) LIKE ? 
        OR LOWER(COALESCE(dep.name, '')) LIKE ?
        OR LOWER(COALESCE(w.job_title, '')) LIKE ?
        OR LOWER(COALESCE(sup.full_name, '')) LIKE ?
      )`);
      const wild = `%${searchParam}%`;
      params.push(wild, wild, wild, wild, wild);
    }

    // 3. Filtro de Método
    if (methodParam !== 'all') {
      whereClauses.push(`d.verification_method = ?`);
      params.push(methodParam);
    }

    // 4. Filtro de Punto de Distribución
    if (pointParam !== 'all') {
      whereClauses.push(`d.distribution_point_id = ?`);
      params.push(pointParam);
    }

    // 5. Filtro de Operador
    if (operatorParam !== 'all') {
      whereClauses.push(`d.delivered_by_user_id = ?`);
      params.push(operatorParam);
    }

    // Excluir registros con documentos de prueba inválidos si existiesen
    whereClauses.push(`w.document_id IS NOT NULL AND w.document_id NOT IN ('V-00000000', '00000000', '')`);

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Consulta de conteo total de la selección
    const countSql = `
      SELECT COUNT(*) as total_count, COUNT(DISTINCT d.worker_id) as unique_workers
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      ${whereSql}
    `;
    const countRow = db.prepare(countSql).get(...params) || { total_count: 0, unique_workers: 0 };
    const totalRecords = countRow.total_count;
    const uniqueBeneficiaries = countRow.unique_workers;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    // Consulta paginada de registros detallados
    const dataSql = `
      SELECT 
        d.id as delivery_id,
        d.delivered_at,
        COALESCE(d.verification_method, 'passkey_qr') as verification_method,
        d.override_reason,
        d.is_offline_sync,
        w.id as worker_id,
        w.document_id,
        COALESCE(NULLIF(TRIM(w.full_name), ''), 'Funcionario C.I. ' || w.document_id) as full_name,
        COALESCE(w.worker_type, 'activo') as worker_type,
        COALESCE(w.job_title, 'Personal Institucional') as job_title,
        COALESCE(dep.name, 'Nómina Central MIPPCI') as department_name,
        COALESCE(cb.name, 'Bolsa de Víveres Secos (Canasta Básica MIPPCI)') as combo_name,
        COALESCE(cb.icon, '📦') as combo_icon,
        COALESCE(dp.name, 'Mesa General de Despacho') as distribution_point_name,
        COALESCE(sup.full_name, 'Mesa Central / Despacho Directo') as operator_name,
        c.name as campaign_name
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN daily_entitlements e ON d.entitlement_id = e.id
      LEFT JOIN combos cb ON COALESCE(e.combo_id, (SELECT id FROM combos WHERE is_active = 1 LIMIT 1)) = cb.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN distribution_points dp ON d.distribution_point_id = dp.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      LEFT JOIN delivery_campaigns c ON d.campaign_id = c.id
      ${whereSql}
      ORDER BY d.delivered_at DESC
      LIMIT ? OFFSET ?
    `;

    const rawDeliveries = db.prepare(dataSql).all(...params, limit, offset);

    // Mapeo estructurado para frontend
    const deliveries = rawDeliveries.map((d, index) => {
      const formatted = formatVzlaTime(d.delivered_at);
      return {
        row_number: offset + index + 1,
        id: d.delivery_id,
        delivered_at: d.delivered_at,
        date_formatted: formatted.dateStr,
        time_formatted: formatted.timeStr,
        full_time_formatted: formatted.fullStr,
        document_id: d.document_id,
        full_name: d.full_name,
        worker_type: d.worker_type,
        job_title: d.job_title,
        department_name: d.department_name,
        combo_name: d.combo_name,
        combo_icon: d.combo_icon,
        distribution_point_name: d.distribution_point_name,
        operator_name: d.operator_name,
        verification_method: d.verification_method,
        override_reason: d.override_reason,
        is_offline_sync: Boolean(d.is_offline_sync),
        campaign_name: d.campaign_name
      };
    });

    // Estadísticas globales consolidadas del universo de funcionarios
    const totalActiveWorkers = db.prepare(`
      SELECT COUNT(*) as c FROM workers 
      WHERE status = 'active' AND document_id NOT IN ('V-00000000', '00000000', '')
    `).get()?.c || 2258;

    const activeCombosCount = db.prepare("SELECT COUNT(*) as c FROM combos WHERE is_active = 1").get()?.c || 1;
    const totalAssignedCombos = totalActiveWorkers * activeCombosCount;

    // Desglose de métodos para la selección actual
    const methodsBreakdownSql = `
      SELECT COALESCE(d.verification_method, 'passkey_qr') as method, COUNT(*) as count
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      ${whereSql}
      GROUP BY COALESCE(d.verification_method, 'passkey_qr')
    `;
    const methodsRaw = db.prepare(methodsBreakdownSql).all(...params);
    const methodsSummary = {
      passkey_qr: 0,
      passkey_nfc: 0,
      supervisor_override: 0,
      offline_sync: 0
    };
    methodsRaw.forEach(m => {
      if (m.method in methodsSummary) {
        methodsSummary[m.method] = m.count;
      }
    });

    // Desglose por Operador para la selección actual
    const operatorsSql = `
      SELECT COALESCE(sup.full_name, 'Sin Asignar / Despacho Directo') as operator_name, COUNT(*) as count
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      ${whereSql}
      GROUP BY sup.full_name
      ORDER BY count DESC
    `;
    const operatorsSummary = db.prepare(operatorsSql).all(...params);

    // Desglose por Punto / Mesa para la selección actual
    const pointsSql = `
      SELECT COALESCE(dp.name, 'Mesa General') as point_name, COUNT(*) as count
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN distribution_points dp ON d.distribution_point_id = dp.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      ${whereSql}
      GROUP BY dp.name
      ORDER BY count DESC
    `;
    const pointsSummary = db.prepare(pointsSql).all(...params);

    // Lista de opciones para filtros (Mesas y Operadores activos)
    const availablePoints = db.prepare("SELECT id, name FROM distribution_points WHERE is_active = 1 ORDER BY name ASC").all();
    const availableOperators = db.prepare(`
      SELECT DISTINCT w.id, w.full_name 
      FROM workers w 
      WHERE w.role IN ('operator', 'supervisor', 'admin', 'director') 
         OR w.id IN (SELECT DISTINCT delivered_by_user_id FROM deliveries WHERE delivered_by_user_id IS NOT NULL)
      ORDER BY w.full_name ASC
    `).all();

    return res.json({
      success: true,
      current_date_vzla: todayVzla,
      query: {
        date: dateParam,
        search: searchParam,
        method: methodParam,
        point_id: pointParam,
        operator_id: operatorParam,
        page,
        limit
      },
      pagination: {
        page,
        limit,
        total_records: totalRecords,
        unique_beneficiaries: uniqueBeneficiaries,
        total_pages: totalPages
      },
      stats: {
        total_delivered: totalRecords,
        unique_beneficiaries: uniqueBeneficiaries,
        total_active_workers: totalActiveWorkers,
        total_assigned_combos: totalAssignedCombos,
        coverage_pct: totalAssignedCombos > 0 ? parseFloat(((totalRecords / totalAssignedCombos) * 100).toFixed(2)) : 0,
        methods: methodsSummary,
        operators: operatorsSummary,
        points: pointsSummary
      },
      filter_options: {
        points: availablePoints,
        operators: availableOperators
      },
      deliveries
    });

  } catch (error) {
    console.error('[DELIVERIES REPORT ERROR]', error);
    return res.status(500).json({
      success: false,
      error: 'Error consultando reporte de entregas: ' + error.message
    });
  }
};

/**
 * Descarga directa en formato CSV compatible con Microsoft Excel (BOM UTF-8)
 */
const exportDeliveriesCsv = async (req, res) => {
  try {
    const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    const dateParam = (req.query.date || 'today').trim();
    const searchParam = (req.query.search || '').trim().toLowerCase();
    const methodParam = (req.query.method || 'all').trim();
    const pointParam = (req.query.point_id || 'all').trim();
    const operatorParam = (req.query.operator_id || 'all').trim();

    const whereClauses = [];
    const params = [];

    const todayUtc = new Date().toISOString().split('T')[0];

    if (dateParam === 'today') {
      whereClauses.push(`(
        date(d.delivered_at) IN (?, ?)
        OR date(d.delivered_at, '-4 hours') IN (?, ?)
        OR substr(d.delivered_at, 1, 10) IN (?, ?)
        OR d.delivered_at >= datetime('now', '-24 hours')
      )`);
      params.push(todayUtc, todayVzla, todayUtc, todayVzla, todayUtc, todayVzla);
    } else if (dateParam === 'yesterday') {
      whereClauses.push(`date(d.delivered_at, '-4 hours') = date('now', '-4 hours', '-1 day')`);
    } else if (dateParam === 'week') {
      whereClauses.push(`d.delivered_at >= datetime('now', '-7 days')`);
    } else if (dateParam !== 'all' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      whereClauses.push(`(date(d.delivered_at) = ? OR date(d.delivered_at, '-4 hours') = ? OR substr(d.delivered_at, 1, 10) = ?)`);
      params.push(dateParam, dateParam, dateParam);
    }

    if (searchParam) {
      whereClauses.push(`(
        LOWER(w.document_id) LIKE ? 
        OR LOWER(w.full_name) LIKE ? 
        OR LOWER(COALESCE(dep.name, '')) LIKE ?
        OR LOWER(COALESCE(sup.full_name, '')) LIKE ?
      )`);
      const wild = `%${searchParam}%`;
      params.push(wild, wild, wild, wild);
    }

    if (methodParam !== 'all') {
      whereClauses.push(`d.verification_method = ?`);
      params.push(methodParam);
    }

    if (pointParam !== 'all') {
      whereClauses.push(`d.distribution_point_id = ?`);
      params.push(pointParam);
    }

    if (operatorParam !== 'all') {
      whereClauses.push(`d.delivered_by_user_id = ?`);
      params.push(operatorParam);
    }

    whereClauses.push(`w.document_id IS NOT NULL AND w.document_id NOT IN ('V-00000000', '00000000', '')`);
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const exportSql = `
      SELECT 
        d.delivered_at,
        w.document_id,
        COALESCE(NULLIF(TRIM(w.full_name), ''), 'Funcionario C.I. ' || w.document_id) as full_name,
        COALESCE(dep.name, 'Nómina Central MIPPCI') as department_name,
        COALESCE(w.job_title, 'Personal Institucional') as job_title,
        COALESCE(cb.name, 'Bolsa de Víveres Secos (Canasta Básica MIPPCI)') as combo_name,
        COALESCE(dp.name, 'Mesa General') as point_name,
        COALESCE(sup.full_name, 'Mesa Central / Despacho Directo') as operator_name,
        COALESCE(d.verification_method, 'passkey_qr') as verification_method,
        d.override_reason
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      LEFT JOIN daily_entitlements e ON d.entitlement_id = e.id
      LEFT JOIN combos cb ON COALESCE(e.combo_id, (SELECT id FROM combos WHERE is_active = 1 LIMIT 1)) = cb.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN distribution_points dp ON d.distribution_point_id = dp.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      ${whereSql}
      ORDER BY d.delivered_at DESC
      LIMIT 10000
    `;

    const rows = db.prepare(exportSql).all(...params);

    // CSV Header con UTF-8 BOM para apertura perfecta en Excel
    const BOM = '\uFEFF';
    const csvHeader = [
      '"N°"',
      '"Fecha (Caracas)"',
      '"Hora (Caracas)"',
      '"Cédula de Identidad"',
      '"Nombre y Apellido"',
      '"Departamento / Dirección"',
      '"Cargo"',
      '"Combo Entregado"',
      '"Punto / Mesa de Despacho"',
      '"Operador / Despachador"',
      '"Método de Verificación"',
      '"Observaciones / Override"'
    ].join(',');

    const csvLines = rows.map((r, i) => {
      const f = formatVzlaTime(r.delivered_at);
      return [
        i + 1,
        `"${f.dateStr}"`,
        `"${f.timeStr}"`,
        `"${r.document_id.replace(/"/g, '""')}"`,
        `"${r.full_name.replace(/"/g, '""')}"`,
        `"${r.department_name.replace(/"/g, '""')}"`,
        `"${r.job_title.replace(/"/g, '""')}"`,
        `"${r.combo_name.replace(/"/g, '""')}"`,
        `"${r.point_name.replace(/"/g, '""')}"`,
        `"${r.operator_name.replace(/"/g, '""')}"`,
        `"${r.verification_method}"`,
        `"${(r.override_reason || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = BOM + [csvHeader, ...csvLines].join('\r\n');

    const filename = `SGBT_Auditoria_Despachos_${dateParam}_${todayVzla}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache');

    return res.status(200).send(csvContent);

  } catch (error) {
    console.error('[EXPORT CSV ERROR]', error);
    return res.status(500).json({ error: 'Error exportando CSV: ' + error.message });
  }
};

module.exports = {
  getDeliveriesReport,
  exportDeliveriesCsv
};

