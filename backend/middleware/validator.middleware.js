// backend/middleware/validator.middleware.js
// Middleware de validación DTO y sanitización de entrada para robustecer los contratos de la API REST

/**
 * Valida que los campos requeridos estén presentes en el body de la petición
 * @param {Array<string>} requiredFields 
 */
function validateBody(requiredFields = []) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Cuerpo de la petición inválido o ausente' });
    }

    const missing = [];
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Campos requeridos faltantes: ${missing.join(', ')}`,
        missing_fields: missing
      });
    }

    next();
  };
}

/**
 * Valida formato de cédula de identidad venezolana (V-XXXXXXX, E-XXXXXXX o dígitos numéricos)
 */
function validateDocumentId(field = 'document_id') {
  return (req, res, next) => {
    const val = (req.body && req.body[field]) || (req.query && req.query[field]) || (req.params && req.params[field]);
    if (!val) {
      return next(); // Si no es requerido, se salta; si es requerido, validateBody lo captura
    }

    const clean = String(val).trim().toUpperCase();
    const regexDoc = /^(V|E|J|G)?-?[0-9]{5,10}$/;
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regexDoc.test(clean) && !regexEmail.test(String(val).trim())) {
      return res.status(400).json({
        error: `El formato de documento de identidad o correo (${val}) no es válido. Ejemplo: V-18456123 o usuario@mippci.gob.ve`
      });
    }

    next();
  };
}

/**
 * Valida roles institucionales válidos
 */
function validateWorkerRole() {
  const validRoles = ['worker', 'operator', 'distributor', 'supervisor', 'admin'];
  return (req, res, next) => {
    let role = req.body && req.body.role;
    if (!role) {
      return res.status(400).json({ error: 'El campo "role" es requerido' });
    }
    if (role === 'distributor') {
      role = 'operator';
      req.body.role = 'operator';
    }
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: `Rol inválido. Opciones permitidas: ${validRoles.join(', ')}`
      });
    }
    next();
  };
}

module.exports = {
  validateBody,
  validateDocumentId,
  validateWorkerRole
};
