// backend/services/worker_repository.service.js
// Capa de Abstracción y Persistencia para Trabajadores y Credenciales (Repository Pattern)
// Centraliza todas las consultas SQL sobre workers y passkey_credentials

const { db } = require('../db');

/**
 * Busca un trabajador por documento de identidad (Cédula) o Correo Electrónico.
 * @param {string} identifier - Cédula (V-XXXXXXX) o Email
 * @returns {object|undefined}
 */
function findWorkerByIdentifier(identifier) {
  if (!identifier) return undefined;
  const clean = String(identifier).trim().toUpperCase();
  return db.prepare(`
    SELECT w.*, d.name as department_name, d.code as department_code
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE UPPER(w.document_id) = ? 
       OR UPPER(w.email) = ? 
       OR w.document_id = ?
    LIMIT 1
  `).get(clean, clean.toLowerCase(), clean.replace(/^V-?/i, ''));
}

/**
 * Busca un trabajador exclusivamente por su UUID primario.
 * @param {string} id - UUID del trabajador
 * @returns {object|undefined}
 */
function findWorkerById(id) {
  if (!id) return undefined;
  return db.prepare(`
    SELECT w.*, d.name as department_name
    FROM workers w
    LEFT JOIN departments d ON w.department_id = d.id
    WHERE w.id = ?
    LIMIT 1
  `).get(id);
}

/**
 * Actualiza la información de formalización y contraseña de un trabajador.
 */
function updateWorkerFormalization({ id, passwordHash, avatarUrl, boundDeviceId }) {
  return db.prepare(`
    UPDATE workers
    SET password_hash = COALESCE(?, password_hash),
        avatar_url = COALESCE(?, avatar_url),
        bound_device_id = COALESCE(?, bound_device_id),
        enrollment_status = 'enrolled',
        enrolled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(passwordHash, avatarUrl, boundDeviceId, id);
}

/**
 * Obtiene la credencial Passkey activa más reciente de un trabajador.
 * @param {string} workerId
 */
function getActivePasskeyByWorkerId(workerId) {
  return db.prepare(`
    SELECT id, credential_id, public_key, sign_count, device_name, created_at
    FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(workerId);
}

module.exports = {
  findWorkerByIdentifier,
  findWorkerById,
  updateWorkerFormalization,
  getActivePasskeyByWorkerId
};
