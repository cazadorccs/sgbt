// backend/routes/ministerial_audit.routes.js
// ============================================================================
// RUTAS DE MONITOR DE FORMALIZACIÓN PREVIA Y AUDITORÍA MINISTERIAL (FASE 5)
// ============================================================================

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ministerial_audit.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// 1. Estadísticas, KPIs gerenciales y semaforización de formalización por dirección
router.get('/audit/ministerial/stats', authenticate, controller.getMinisterialMonitorStats);

// 2. Directorio nominal y búsqueda de rezagados (personal sin clave / selfie)
router.get('/audit/ministerial/rezagados', authenticate, controller.listRezagados);

// 3. Exportación oficial de Rezagados a CSV para citaciones de RRHH (BOM UTF-8)
router.get('/audit/ministerial/rezagados/export', authenticate, controller.exportRezagadosCsv);

// 4. Estado de congelamiento del censo previo (Cierre 12/Nov)
router.get('/audit/ministerial/census-lock', authenticate, controller.getCensusLockStatus);

// 5. Control administrativo de congelamiento / prórroga del censo (Admin / Director)
router.post('/audit/ministerial/census-lock', authenticate, requireRole('admin', 'director'), controller.toggleCensusLock);

// 6. Generador Oficial de Acta Ministerial Definitiva (Jornada 27/Nov con Sello SHA-256)
router.post('/audit/ministerial/acta', authenticate, requireRole('admin', 'director'), controller.generateMinisterialActa);

// 7. Consulta de Acta Ministerial Definitiva (por ID o 'latest')
router.get('/audit/ministerial/acta/latest', authenticate, controller.getMinisterialActa);
router.get('/audit/ministerial/acta/:id', authenticate, controller.getMinisterialActa);

module.exports = router;
