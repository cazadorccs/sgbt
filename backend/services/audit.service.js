// backend/services/audit.service.js
// Servicio centralizado de Auditoría, Métricas de Despacho y Generación de Actas Oficiales con Sellos Criptográficos SHA-256

const crypto = require('crypto');
const { db } = require('../db');

/**
 * Calcula métricas detalladas y agregaciones de entregas para auditoría
 * @param {Array} deliveries Lista de entregas registradas
 */
function calculateAuditMetrics(deliveries = []) {
  let totalCombos = 0;
  let totalWeightKg = 0;
  const beneficiariesSet = new Set();
  const methodCounts = {
    passkey_qr: 0,
    passkey_nfc: 0,
    nfc_card: 0,
    supervisor_daily_qr: 0,
    supervisor_override: 0
  };
  let offlineCount = 0;

  const deptMap = {};

  deliveries.forEach(d => {
    totalCombos++;
    totalWeightKg += (Number(d.weight_kg) || 14.0);
    if (d.document_id) {
      beneficiariesSet.add(d.document_id);
    }

    if (methodCounts[d.verification_method] !== undefined) {
      methodCounts[d.verification_method]++;
    } else {
      methodCounts[d.verification_method] = 1;
    }
    if (d.is_offline_sync) {
      offlineCount++;
    }

    const dep = d.department_name || 'Dirección General';
    if (!deptMap[dep]) {
      deptMap[dep] = { workers: new Set(), combos: 0, weight: 0 };
    }
    deptMap[dep].workers.add(d.document_id);
    deptMap[dep].combos++;
    deptMap[dep].weight += (Number(d.weight_kg) || 14.0);
  });

  return {
    totalDeliveries: deliveries.length,
    totalCombos,
    totalBeneficiaries: beneficiariesSet.size,
    totalWeightKg: Math.round(totalWeightKg * 10) / 10,
    totalTons: Math.round((totalWeightKg / 1000) * 100) / 100,
    methodCounts,
    offlineCount,
    offlinePct: deliveries.length > 0 ? Math.round((offlineCount / deliveries.length) * 100) : 0,
    departmentBreakdown: Object.entries(deptMap).map(([name, data]) => ({
      name,
      workersCount: data.workers.size,
      combosCount: data.combos,
      weightKg: Math.round(data.weight * 10) / 10,
      tons: Math.round((data.weight / 1000) * 100) / 100
    }))
  };
}

/**
 * Hashea una hoja canónica del despacho para el árbol Merkle
 */
function hashDeliveryLeaf(d) {
  const payload = `SGBT:v1:${d.id || d.delivery_id}:${d.delivered_at || ''}:${d.document_id || ''}:${d.verification_method || ''}:${d.signature_proof || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Combina dos hashes hermanos en el árbol Merkle
 */
function combineMerkleHashes(left, right) {
  return crypto.createHash('sha256').update(left + right).digest('hex');
}

/**
 * Construye el Árbol Merkle Criptográfico binario completo (RFC 6962 / Bitcoin standard)
 * @param {Array} deliveries Lista de despachos
 * @returns {Object} { root, leaves, layers, totalRecords }
 */
function generateMerkleTree(deliveries = []) {
  if (!deliveries || deliveries.length === 0) {
    const emptyRoot = crypto.createHash('sha256').update('SGBT_EMPTY_MERKLE_TREE').digest('hex');
    return {
      root: emptyRoot,
      leaves: [],
      layers: [[emptyRoot]],
      totalRecords: 0
    };
  }

  // 1. Capa 0: Hashes de las hojas
  const leaves = deliveries.map(hashDeliveryLeaf);
  const layers = [leaves];

  // 2. Reducción jerárquica por capas
  let currentLayer = leaves;
  while (currentLayer.length > 1) {
    const nextLayer = [];
    const len = currentLayer.length;
    for (let i = 0; i < len; i += 2) {
      const left = currentLayer[i];
      // Si el número de nodos es impar, se duplica el último nodo (RFC 6962)
      const right = (i + 1 < len) ? currentLayer[i + 1] : left;
      nextLayer.push(combineMerkleHashes(left, right));
    }
    layers.push(nextLayer);
    currentLayer = nextLayer;
  }

  const root = currentLayer[0];
  return {
    root,
    leaves,
    layers,
    totalRecords: deliveries.length
  };
}

/**
 * Genera la prueba de inclusión Merkle Proof O(log N) para un despacho específico
 * @param {Array} deliveries Lista de despachos
 * @param {number|string} target Index numérico o ID/Cédula del despacho
 */
function generateMerkleProof(deliveries = [], target) {
  if (!deliveries || deliveries.length === 0) return null;

  let index = -1;
  if (typeof target === 'number') {
    index = target;
  } else if (typeof target === 'string') {
    index = deliveries.findIndex(d =>
      d.document_id === target ||
      d.id === target ||
      d.delivery_id === target
    );
  }

  if (index < 0 || index >= deliveries.length) return null;

  const tree = generateMerkleTree(deliveries);
  const proof = [];
  let currentIndex = index;

  for (let l = 0; l < tree.layers.length - 1; l++) {
    const currentLayer = tree.layers[l];
    const isEven = (currentIndex % 2 === 0);
    const pairIndex = isEven ? currentIndex + 1 : currentIndex - 1;

    let pairHash = null;
    if (pairIndex < currentLayer.length) {
      pairHash = currentLayer[pairIndex];
    } else {
      pairHash = currentLayer[currentIndex]; // Duplicado si es impar al final
    }

    proof.push({
      position: isEven ? 'right' : 'left',
      hash: pairHash
    });

    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verifica una prueba de inclusión Merkle Proof en tiempo O(log N) sin conocer las demás hojas
 * @param {string} leafHash Hash SHA-256 de la hoja
 * @param {Array} proof Array de objetos { position, hash }
 * @param {string} expectedRoot Raíz de Merkle oficial sellada en el acta
 * @returns {boolean} True si la prueba es válida e inmutable
 */
function verifyMerkleProof(leafHash, proof, expectedRoot) {
  if (!leafHash || !proof || !Array.isArray(proof) || !expectedRoot) return false;

  let current = leafHash;
  for (const step of proof) {
    if (step.position === 'right') {
      current = combineMerkleHashes(current, step.hash);
    } else {
      current = combineMerkleHashes(step.hash, current);
    }
  }

  return current === expectedRoot;
}

/**
 * Genera el sello de integridad SHA-256 a partir de la secuencia ordenada de despachos.
 * Utiliza la Raíz del Árbol Merkle (RFC 6962) para garantizar verificabilidad descentralizada.
 * @param {Array} deliveries Lista de despachos
 */
function generateSha256IntegritySeal(deliveries = []) {
  if (!deliveries || deliveries.length === 0) {
    return crypto.createHash('sha256').update('SGBT_EMPTY_DISPATCH').digest('hex');
  }

  const tree = generateMerkleTree(deliveries);
  return tree.root;
}

/**
 * Helpers de formateo para fecha y hora venezolana
 */
function formatVzlaTime(dateStr) {
  if (!dateStr) return '--:--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch (e) {
    return String(dateStr);
  }
}

function formatVzlaDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  } catch (e) {
    return '';
  }
}

function formatMethodLabel(method) {
  switch (method) {
    case 'passkey_qr':
    case 'passkey_nfc':
      return 'FIDO2 Passkey';
    case 'nfc_card':
      return 'Tarjeta NFC';
    case 'supervisor_daily_qr':
      return 'QR Supervisor';
    case 'supervisor_override':
      return 'Liberación Supervisor';
    case 'manual_operador':
      return 'Despacho Manual';
    default:
      return method || 'Registrado';
  }
}

/**
 * Genera el documento HTML imprimible del Acta Oficial Ministerial de Despacho y Auditoría
 */
function generateOfficialActaHtml({ deliveries = [], tenantInfo = {} }) {
  const metrics = calculateAuditMetrics(deliveries);
  const integrityHash = generateSha256IntegritySeal(deliveries);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const actaNumber = `ACTA-${dateStr}-${integrityHash.slice(0, 8).toUpperCase()}`;
  const emissionDate = new Date().toLocaleString('es-VE', { dateStyle: 'full', timeStyle: 'medium' });

  const entityName = tenantInfo.name || 'SISTEMA DE GESTIÓN DE BENEFICIOS PARA LOS TRABAJADORES';
  const slogan = tenantInfo.slogan || 'Gobierno Bolivariano de Venezuela';

  const deptRows = metrics.departmentBreakdown.map(dept => `
    <tr>
      <td style="font-weight: 600;">${dept.name}</td>
      <td style="text-align: right;">${dept.workersCount}</td>
      <td style="text-align: right; font-weight: 700;">${dept.combosCount}</td>
      <td style="text-align: right;">${dept.weightKg.toLocaleString('es-VE')} kg</td>
      <td style="text-align: right; font-weight: 700;">${dept.tons} t</td>
    </tr>
  `).join('');

  // 3. Desglose detallado de cada entrega con su hora respectiva por dependencia ministerial
  const deptsDeliveriesMap = new Map();
  for (const d of deliveries) {
    const depName = d.department_name || 'Dirección General / Nómina Central';
    if (!deptsDeliveriesMap.has(depName)) {
      deptsDeliveriesMap.set(depName, []);
    }
    deptsDeliveriesMap.get(depName).push(d);
  }

  const sortedDeptNames = Array.from(deptsDeliveriesMap.keys()).sort((a, b) => a.localeCompare(b, 'es'));

  const deptDetailSections = sortedDeptNames.map((depName, idx) => {
    const rawDeptDeliveries = deptsDeliveriesMap.get(depName) || [];

    // Agrupar entregas por trabajador y segundo de despacho
    const groupedMap = new Map();
    for (const d of rawDeptDeliveries) {
      const timeKey = (d.delivered_at || '').substring(0, 19);
      const groupKey = `${d.document_id || d.worker_id}_${timeKey}`;
      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          delivered_at: d.delivered_at,
          document_id: d.document_id || d.worker_id || '--',
          worker_name: d.worker_name || 'Funcionario Registrado',
          verification_method: d.verification_method,
          operator_name: d.operator_name || d.operator_mesa || 'Mesa Central',
          combos_count: 0,
          combo_names: []
        });
      }
      const grp = groupedMap.get(groupKey);
      grp.combos_count++;
      if (d.combo_name && !grp.combo_names.includes(d.combo_name)) {
        grp.combo_names.push(d.combo_name);
      }
    }

    // Ordenar cronológicamente por hora de entrega (ascendente)
    const sortedGrouped = Array.from(groupedMap.values()).sort((a, b) => {
      const ta = new Date(a.delivered_at || 0).getTime();
      const tb = new Date(b.delivered_at || 0).getTime();
      return ta - tb;
    });

    const deptBeneficiariesCount = new Set(rawDeptDeliveries.map(d => d.document_id)).size;
    const deptCombosCount = rawDeptDeliveries.length;

    const rowsHtml = sortedGrouped.map((item, rowIdx) => {
      const timeFormatted = formatVzlaTime(item.delivered_at);
      const dateFormatted = formatVzlaDate(item.delivered_at);
      const combosLabel = item.combos_count > 1
        ? `<strong>${item.combos_count} combos</strong> <span style="color: #64748b; font-size: 0.72rem;">(${item.combo_names.join(', ') || 'Combos Asignados'})</span>`
        : `<strong>1 combo</strong> <span style="color: #64748b; font-size: 0.72rem;">(${item.combo_names[0] || 'Combo Institucional'})</span>`;

      return `
        <tr>
          <td style="text-align: center; white-space: nowrap;">
            <div class="delivery-time">${timeFormatted}</div>
            <div style="font-size: 0.66rem; color: #64748b;">${dateFormatted}</div>
          </td>
          <td style="font-weight: 700; white-space: nowrap; font-family: monospace, monospace;">${item.document_id}</td>
          <td style="font-weight: 600;">${item.worker_name}</td>
          <td>${combosLabel}</td>
          <td style="font-size: 0.73rem; white-space: nowrap;">${formatMethodLabel(item.verification_method)}</td>
          <td style="font-size: 0.73rem; color: #475569; white-space: nowrap;">${item.operator_name}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="dept-detail-card">
        <table class="delivery-table">
          <thead>
            <tr class="dept-banner-row">
              <th colspan="6" class="dept-banner-th">
                <div class="dept-banner-content">
                  <span class="dept-title">🏢 ${depName}</span>
                  <span class="dept-stats"><strong>${deptBeneficiariesCount}</strong> funcionarios atendidos &bull; <strong>${deptCombosCount}</strong> combos despachados</span>
                </div>
              </th>
            </tr>
            <tr class="dept-cols-row">
              <th style="width: 14%; text-align: center;">Hora Entrega</th>
              <th style="width: 13%;">Cédula</th>
              <th style="width: 29%;">Funcionario Beneficiario</th>
              <th style="width: 26%;">Combos Despachados</th>
              <th style="width: 9%;">Validación</th>
              <th style="width: 9%;">Mesa / Operador</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 0.75rem;">Sin despachos registrados en esta dependencia.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  // 4. Desglose detallado de personal que aún no ha retirado (rezagados) por dependencia ministerial
  const deliveredCedulasSet = new Set(deliveries.map(d => d.document_id).filter(Boolean));
  const deliveredWorkerIdsSet = new Set(deliveries.map(d => d.worker_id).filter(Boolean));

  let allActiveWorkers = [];
  try {
    allActiveWorkers = db.prepare(`
      SELECT 
        w.id,
        w.document_id,
        w.full_name,
        COALESCE(w.job_title, 'Funcionario Público') as job_title,
        COALESCE(w.worker_type, 'activo') as worker_type,
        COALESCE(d.name, 'Dirección General / Nómina Central') as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.status = 'active'
        AND w.document_id NOT IN ('V-99995001', 'V-18456123', 'V-11123987', 'V-00000000', '00000000', '')
      ORDER BY department_name ASC, w.full_name ASC
    `).all();
  } catch (errWorkers) {
    console.warn('[AUDIT ACTA] Error consultando nómina de trabajadores:', errWorkers.message);
  }

  const pendingWorkers = allActiveWorkers.filter(w => !deliveredCedulasSet.has(w.document_id) && !deliveredWorkerIdsSet.has(w.id));

  // Agrupar pendientes por dependencia ministerial
  const pendingDeptsMap = new Map();
  for (const pw of pendingWorkers) {
    const depName = pw.department_name || 'Dirección General / Nómina Central';
    if (!pendingDeptsMap.has(depName)) {
      pendingDeptsMap.set(depName, []);
    }
    pendingDeptsMap.get(depName).push(pw);
  }

  const sortedPendingDeptNames = Array.from(pendingDeptsMap.keys()).sort((a, b) => a.localeCompare(b, 'es'));

  // Determinar cuántos combos corresponden por trabajador (por defecto 4 según la jornada institucional)
  const activeCombosCount = db.prepare("SELECT COUNT(*) as c FROM combos WHERE is_active = 1 AND name NOT LIKE '__SYSTEM_%'").get()?.c || 4;

  const pendingDetailSections = sortedPendingDeptNames.map((depName) => {
    const workersList = pendingDeptsMap.get(depName) || [];
    const combosPendingDept = workersList.length * activeCombosCount;

    const rowsPendingHtml = workersList.map((pw, idx) => `
      <tr>
        <td style="text-align: center; font-weight: 700; color: #64748b;">${idx + 1}</td>
        <td style="font-weight: 700; white-space: nowrap; font-family: monospace, monospace; color: #0f172a;">${pw.document_id}</td>
        <td style="font-weight: 600;">${pw.full_name}</td>
        <td style="color: #475569; font-size: 0.72rem;">${pw.job_title}</td>
        <td style="text-align: center;"><strong>${activeCombosCount} combos</strong></td>
        <td style="text-align: center;">
          <span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.69rem; border: 1px solid #fde68a; display: inline-block; white-space: nowrap;">
            ⏳ Rezagado (En Mesa)
          </span>
        </td>
      </tr>
    `).join('');

    return `
      <div class="dept-detail-card dept-pending-card">
        <table class="delivery-table">
          <thead>
            <tr class="dept-banner-row">
              <th colspan="6" class="dept-banner-th dept-banner-pending-th">
                <div class="dept-banner-content dept-banner-pending-content">
                  <span class="dept-title">🏢 ${depName}</span>
                  <span class="dept-stats"><strong>${workersList.length}</strong> funcionarios pendientes &bull; <strong>${combosPendingDept}</strong> combos remanentes</span>
                </div>
              </th>
            </tr>
            <tr class="dept-cols-row">
              <th style="width: 5%; text-align: center;">N°</th>
              <th style="width: 15%;">Cédula</th>
              <th style="width: 32%;">Funcionario Beneficiario</th>
              <th style="width: 24%;">Cargo / Área</th>
              <th style="width: 12%; text-align: center;">Cuota Asignada</th>
              <th style="width: 12%; text-align: center;">Estatus Logístico</th>
            </tr>
          </thead>
          <tbody>
            ${rowsPendingHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta Oficial de Despacho y Auditoría - ${actaNumber}</title>
  <style>
    @page { size: letter; margin: 1.2cm 1cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.45; margin: 0; padding: 1.5rem; background: #f8fafc; }
    .page-container { max-width: 920px; margin: 0 auto; background: #ffffff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-titles h1 { font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0 0 0.25rem 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-titles h2 { font-size: 0.95rem; font-weight: 600; color: #475569; margin: 0 0 0.25rem 0; }
    .header-titles p { font-size: 0.8rem; color: #64748b; margin: 0; }
    .badge-acta { text-align: right; }
    .badge-acta .num { font-size: 1rem; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 0.35rem 0.75rem; border-radius: 6px; display: inline-block; }
    .badge-acta .date { font-size: 0.75rem; color: #64748b; margin-top: 0.35rem; }
    .section-title { font-size: 0.92rem; font-weight: 700; text-transform: uppercase; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 0.5rem; margin: 1.5rem 0 0.75rem 0; page-break-after: avoid; break-after: avoid; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.65rem; margin-bottom: 1.25rem; page-break-inside: avoid; break-inside: avoid; }
    .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.75rem 0.5rem; text-align: center; }
    .kpi-box .val { font-size: 1.45rem; font-weight: 800; color: #0f172a; line-height: 1.1; }
    .kpi-box .lbl { font-size: 0.7rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 0.3rem; }
    
    /* Control de continuidad de tablas y cabeceras repetitivas en salto de página */
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: 0.82rem; page-break-inside: auto; break-inside: auto; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 0.5rem 0.65rem; border: 1px solid #cbd5e1; text-transform: uppercase; font-size: 0.72rem; }
    td { padding: 0.5rem 0.65rem; border: 1px solid #cbd5e1; color: #1e293b; }
    tr:nth-child(even) { background: #f8fafc; }
    
    .dept-detail-card { margin-bottom: 1.25rem; page-break-inside: auto; break-inside: auto; background: #ffffff; }
    .delivery-table { width: 100%; border-collapse: collapse; font-size: 0.76rem; margin-bottom: 0; border: 1px solid #cbd5e1; page-break-inside: auto; break-inside: auto; }
    .delivery-table thead { display: table-header-group; }
    .delivery-table tbody { display: table-row-group; }
    .delivery-table tr { page-break-inside: avoid; break-inside: avoid; }
    .delivery-table th { background: #f8fafc; color: #475569; font-size: 0.69rem; padding: 0.38rem 0.55rem; border: 1px solid #cbd5e1; text-transform: uppercase; font-weight: 700; }
    .delivery-table td { padding: 0.35rem 0.55rem; border: 1px solid #e2e8f0; color: #1e293b; vertical-align: middle; }
    .delivery-table tr:nth-child(even) { background: #f8fafc; }
    
    .dept-banner-row { page-break-inside: avoid; break-inside: avoid; page-break-after: avoid; break-after: avoid; }
    .dept-banner-th { background: #f1f5f9 !important; padding: 0.5rem 0.75rem !important; border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #0284c7 !important; color: #0f172a !important; text-align: left !important; }
    .dept-banner-pending-th { background: #fffbeb !important; border-bottom: 2px solid #f59e0b !important; color: #92400e !important; }
    .dept-banner-content { display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 0.82rem; font-weight: 700; text-transform: none; letter-spacing: normal; }
    .dept-title { font-size: 0.84rem; font-weight: 800; color: #0f172a; }
    .dept-stats { font-size: 0.75rem; font-weight: 600; color: #475569; }
    .dept-banner-pending-content .dept-title { color: #92400e; }
    .dept-banner-pending-content .dept-stats { color: #b45309; }
    
    .delivery-time { font-weight: 800; color: #0284c7; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.75rem; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 3rem; text-align: center; page-break-inside: avoid; break-inside: avoid; }
    .sig-line { border-top: 1.5px solid #64748b; margin-top: 2.5rem; padding-top: 0.4rem; }
    .sig-line .name { font-weight: 700; font-size: 0.82rem; color: #0f172a; }
    .sig-line .title { font-size: 0.72rem; color: #64748b; }
    .print-actions { text-align: right; margin-bottom: 1.25rem; }
    .btn-print { background: #0284c7; color: #ffffff; border: none; padding: 0.55rem 1.2rem; font-weight: 600; font-size: 0.82rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn-print:hover { background: #0369a1; }
    
    @media print {
      body { background: #ffffff !important; padding: 0 !important; margin: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .page-container { box-shadow: none !important; border: none !important; padding: 0 !important; margin: 0 !important; max-width: 100% !important; width: 100% !important; }
      .print-actions { display: none !important; }
      table { page-break-inside: auto !important; break-inside: auto !important; }
      thead { display: table-header-group !important; }
      tbody { display: table-row-group !important; }
      tr { page-break-inside: avoid !important; break-inside: avoid !important; }
      .dept-banner-row { page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: avoid !important; break-after: avoid !important; }
      .dept-detail-card { page-break-inside: auto !important; break-inside: auto !important; margin-bottom: 0.85rem !important; }
      .section-title { page-break-after: avoid !important; break-after: avoid !important; }
      .kpi-grid, .signatures { page-break-inside: avoid !important; break-inside: avoid !important; }
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
        <h1>${entityName}</h1>
        <h2>SGBT &bull; Acta Oficial de Despacho, Rendición y Auditoría Logística</h2>
        <p>${slogan} &bull; Módulo de Control y Entrega Criptográfica</p>
      </div>
      <div class="badge-acta">
        <div class="num">${actaNumber}</div>
        <div class="date">Emisión: ${emissionDate}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="val">${allActiveWorkers.length || metrics.totalBeneficiaries}</div>
        <div class="lbl">Padrón Total</div>
      </div>
      <div class="kpi-box">
        <div class="val" style="color: #0284c7;">${metrics.totalBeneficiaries}</div>
        <div class="lbl">Atendidos</div>
      </div>
      <div class="kpi-box">
        <div class="val" style="color: #d97706;">${pendingWorkers.length}</div>
        <div class="lbl">Rezagados / Pendientes</div>
      </div>
      <div class="kpi-box">
        <div class="val" style="color: #16a34a;">${metrics.totalTons} t</div>
        <div class="lbl">Tonelaje Despachado</div>
      </div>
      <div class="kpi-box">
        <div class="val">${metrics.offlinePct}%</div>
        <div class="lbl">Sync Offline</div>
      </div>
    </div>

    <div class="section-title">1. Resumen por Métodos de Validación y Seguridad</div>
    <table>
      <thead>
        <tr>
          <th>Método de Validación</th>
          <th style="text-align: right;">Cantidad Despachada</th>
          <th style="text-align: right;">Porcentaje</th>
          <th>Nivel de Seguridad</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>FIDO2 / WebAuthn Passkey (Criptográfico P-256)</td>
          <td style="text-align: right; font-weight: 700;">${metrics.methodCounts.passkey_qr}</td>
          <td style="text-align: right;">${metrics.totalDeliveries > 0 ? Math.round((metrics.methodCounts.passkey_qr / metrics.totalDeliveries) * 100) : 0}%</td>
          <td><span style="color: #16a34a; font-weight: 600;">Máximo (Criptográfico Asimétrico)</span></td>
        </tr>
        <tr>
          <td>Tarjeta Física NFC / RFID</td>
          <td style="text-align: right; font-weight: 700;">${metrics.methodCounts.nfc_card}</td>
          <td style="text-align: right;">${metrics.totalDeliveries > 0 ? Math.round((metrics.methodCounts.nfc_card / metrics.totalDeliveries) * 100) : 0}%</td>
          <td><span style="color: #0284c7; font-weight: 600;">Alto (Identificador Físico)</span></td>
        </tr>
        <tr>
          <td>QR Dinámico Diario del Supervisor</td>
          <td style="text-align: right; font-weight: 700;">${metrics.methodCounts.supervisor_daily_qr}</td>
          <td style="text-align: right;">${metrics.totalDeliveries > 0 ? Math.round((metrics.methodCounts.supervisor_daily_qr / metrics.totalDeliveries) * 100) : 0}%</td>
          <td><span style="color: #ca8a04; font-weight: 600;">Medio-Alto (Rotación Diaria)</span></td>
        </tr>
        <tr>
          <td>Liberación por Contingencia / Override Supervisor</td>
          <td style="text-align: right; font-weight: 700;">${metrics.methodCounts.supervisor_override}</td>
          <td style="text-align: right;">${metrics.totalDeliveries > 0 ? Math.round((metrics.methodCounts.supervisor_override / metrics.totalDeliveries) * 100) : 0}%</td>
          <td><span style="color: #ea580c; font-weight: 600;">Auditado (Justificación Obligatoria)</span></td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">2. Rendición Consolidada por Dependencia Ministerial (Balance General)</div>
    <table>
      <thead>
        <tr>
          <th>Dependencia / Dirección</th>
          <th style="text-align: right;">Beneficiarios</th>
          <th style="text-align: right;">Combos</th>
          <th style="text-align: right;">Peso Total (kg)</th>
          <th style="text-align: right;">Tonelaje (t)</th>
        </tr>
      </thead>
      <tbody>
        ${deptRows || '<tr><td colspan="5" style="text-align:center;">No se registraron entregas en el período.</td></tr>'}
      </tbody>
    </table>

    <div class="section-title">3. Rendición Consolidada por Dependencia Ministerial (Desglose Detallado con Horas de Entrega)</div>
    <div style="font-size: 0.76rem; color: #64748b; margin-bottom: 0.85rem;">
      Registro exhaustivo de despachos efectuados por dependencia, identificando funcionario, documento de identidad, combos asignados, mecanismo de autenticación y hora exacta de recepción auditada.
    </div>
    ${deptDetailSections || '<div style="text-align:center; padding: 1rem; color: #94a3b8; border: 1px dashed #cbd5e1; border-radius: 6px;">No se registraron despachos para desglosar en este período.</div>'}

    <div class="section-title">4. Rendición Consolidada por Dependencia Ministerial (Desglose Detallado de Personal Pendiente por Retirar / Rezagados)</div>
    <div style="font-size: 0.76rem; color: #64748b; margin-bottom: 0.85rem;">
      Relación nominal de trabajadores que aún no han formalizado el retiro de sus beneficios alimenticios en las mesas de despacho. La cuota asignada permanece en custodia y reserva garantizada en almacén central.
      <br>
      <strong>Balance de Remanente:</strong> ${pendingWorkers.length} funcionarios pendientes distribuidos en ${sortedPendingDeptNames.length} dependencias (${pendingWorkers.length * activeCombosCount} combos en resguardo en mesa).
    </div>
    ${pendingDetailSections || '<div style="text-align:center; padding: 1.25rem; color: #166534; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; font-weight: 700;">✓ ¡Jornada Completa! El 100% del personal de todas las dependencias ha retirado sus combos satisfactoriamente.</div>'}

    <div class="signatures">
      <div class="sig-line">
        <div class="name">Msc. Sahib A Franco</div>
        <div class="title">Administrador General de Logística</div>
      </div>
      <div class="sig-line">
        <div class="name">Supervisor de Jornada</div>
        <div class="title">Mesa de Despacho Central</div>
      </div>
      <div class="sig-line">
        <div class="name">Lic. Marisol Pastrana</div>
        <div class="title">Oficina de Gestión Humana</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  calculateAuditMetrics,
  generateSha256IntegritySeal,
  generateMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
  hashDeliveryLeaf,
  combineMerkleHashes,
  generateOfficialActaHtml
};
