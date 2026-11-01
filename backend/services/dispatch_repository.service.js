// backend/services/dispatch_repository.service.js
// Capa de Abstracción de Repositorio para Despacho y Entregas (Repository Pattern)
// Aísla las consultas SQL y transacciones de base de datos fuera de los controladores

const { db } = require('../db');

/**
 * Consulta las estadísticas agregadas de entregas para una fecha específica.
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 */
function getDeliveriesSummaryByDate(dateStr) {
  return db.prepare(`
    SELECT 
      COUNT(DISTINCT d.id) as total_deliveries,
      COUNT(DISTINCT d.worker_id) as total_beneficiaries_served,
      SUM(CASE WHEN d.verification_method = 'passkey_qr' THEN 1 ELSE 0 END) as passkey_qr_count,
      SUM(CASE WHEN d.verification_method = 'passkey_nfc' THEN 1 ELSE 0 END) as passkey_nfc_count,
      SUM(CASE WHEN d.verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as contingency_count,
      SUM(CASE WHEN d.is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_sync_count
    FROM deliveries d
    WHERE date(d.delivered_at) = date(?)
  `).get(dateStr) || {};
}

/**
 * Consulta el estado de candados de dispositivo para una fecha.
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 */
function getDeviceLockStatsByDate(dateStr) {
  return db.prepare(`
    SELECT 
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_locks,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_locks,
      COUNT(CASE WHEN status = 'released_by_supervisor' THEN 1 END) as supervisor_released_locks
    FROM device_locks
    WHERE valid_date = ?
  `).get(dateStr) || {};
}

/**
 * Obtiene el punto de distribución por ID o devuelve el primero activo disponible.
 * @param {string|null} pointId
 */
function resolveDistributionPoint(pointId) {
  if (pointId) {
    const pt = db.prepare('SELECT id, name, location_code FROM distribution_points WHERE id = ?').get(pointId);
    if (pt) return pt;
  }
  return db.prepare('SELECT id, name, location_code FROM distribution_points WHERE is_active = 1 LIMIT 1').get() || null;
}

/**
 * Consulta las asignaciones activas de un trabajador para la fecha actual.
 * @param {string} workerId 
 * @param {string} dateStr 
 */
function getWorkerEntitlementsForDate(workerId, dateStr) {
  return db.prepare(`
    SELECT de.id as entitlement_id, de.combo_id, de.status, c.name as combo_name, c.mesa_number
    FROM daily_entitlements de
    JOIN combos c ON de.combo_id = c.id
    WHERE de.worker_id = ? AND date(de.valid_date) = date(?)
  `).all(workerId, dateStr);
}

module.exports = {
  getDeliveriesSummaryByDate,
  getDeviceLockStatsByDate,
  resolveDistributionPoint,
  getWorkerEntitlementsForDate
};

