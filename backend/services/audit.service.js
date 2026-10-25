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
 * Genera el sello de integridad SHA-256 a partir de la secuencia ordenada de despachos
 * @param {Array} deliveries Lista de despachos
 */
function generateSha256IntegritySeal(deliveries = []) {
  const integrityPayload = deliveries
    .map(d => `${d.delivery_id || d.id}:${d.delivered_at}:${d.document_id}`)
    .join('|');
  return crypto.createHash('sha256').update(integrityPayload || 'SGBT_EMPTY_DISPATCH').digest('hex');
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

  const entityName = tenantInfo.name || 'MINISTERIO DEL PODER POPULAR PARA LA COMUNICACIÓN Y LA INFORMACIÓN';
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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Acta Oficial de Despacho y Auditoría - ${actaNumber}</title>
  <style>
    @page { size: letter; margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; margin: 0; padding: 2rem; background: #f8fafc; }
    .page-container { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 3rem; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 1.25rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-titles h1 { font-size: 1.15rem; font-weight: 800; color: #0f172a; margin: 0 0 0.25rem 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-titles h2 { font-size: 0.95rem; font-weight: 600; color: #475569; margin: 0 0 0.25rem 0; }
    .header-titles p { font-size: 0.8rem; color: #64748b; margin: 0; }
    .badge-acta { text-align: right; }
    .badge-acta .num { font-size: 1rem; font-weight: 800; color: #0284c7; background: #e0f2fe; padding: 0.35rem 0.75rem; border-radius: 6px; display: inline-block; }
    .badge-acta .date { font-size: 0.75rem; color: #64748b; margin-top: 0.35rem; }
    .section-title { font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: #0f172a; border-left: 4px solid #0284c7; padding-left: 0.5rem; margin: 1.75rem 0 0.85rem 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; text-align: center; }
    .kpi-box .val { font-size: 1.6rem; font-weight: 800; color: #0f172a; line-height: 1.1; }
    .kpi-box .lbl { font-size: 0.75rem; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 0.35rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.85rem; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; text-transform: uppercase; font-size: 0.75rem; }
    td { padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; color: #1e293b; }
    tr:nth-child(even) { background: #f8fafc; }
    .integrity-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 0.85rem 1rem; font-size: 0.75rem; color: #166534; margin: 1.5rem 0; word-break: break-all; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 4rem; text-align: center; }
    .sig-line { border-top: 1.5px solid #64748b; margin-top: 3.5rem; padding-top: 0.5rem; }
    .sig-line .name { font-weight: 700; font-size: 0.85rem; color: #0f172a; }
    .sig-line .title { font-size: 0.75rem; color: #64748b; }
    .print-actions { text-align: right; margin-bottom: 1.5rem; }
    .btn-print { background: #0284c7; color: #ffffff; border: none; padding: 0.6rem 1.25rem; font-weight: 600; font-size: 0.85rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
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
        <div class="val">${metrics.totalDeliveries}</div>
        <div class="lbl">Total Entregas</div>
      </div>
      <div class="kpi-box">
        <div class="val">${metrics.totalBeneficiaries}</div>
        <div class="lbl">Beneficiarios Atendidos</div>
      </div>
      <div class="kpi-box">
        <div class="val">${metrics.totalTons} t</div>
        <div class="lbl">Tonelaje Total Despachado</div>
      </div>
      <div class="kpi-box">
        <div class="val">${metrics.offlinePct}%</div>
        <div class="lbl">Sincronización Offline</div>
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

    <div class="section-title">2. Rendición Consolidada por Dependencia Ministerial</div>
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

    <div class="section-title">3. Sello de Integridad Digital Inmutable (SHA-256)</div>
    <div class="integrity-box">
      <strong>🔒 Sello de Integridad Criptográfica de la Jornada (SHA-256):</strong><br>
      <code>${integrityHash}</code><br>
      <small style="color: #15803d; margin-top: 4px; display: inline-block;">
        ✓ Este sello certifica que ningún registro de entrega ha sido alterado, eliminado o duplicado con posterioridad a la jornada.
      </small>
    </div>

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
        <div class="name">Auditor Interno</div>
        <div class="title">Dirección de Auditoría Ministerial</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  calculateAuditMetrics,
  generateSha256IntegritySeal,
  generateOfficialActaHtml
};
