// backend/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { requireRole } = require('../middleware/auth.middleware');
const { validateWorkerRole } = require('../middleware/validator.middleware');

// KPIs y Métricas de Auditoría
router.get('/admin/kpis', requireRole('admin', 'director', 'supervisor', 'auditor'), adminController.getKpis);
router.get('/admin/audit/stats', requireRole('admin', 'director', 'supervisor', 'auditor'), adminController.getAuditStats);
router.get('/admin/deliveries', requireRole('admin', 'director', 'supervisor', 'auditor'), adminController.getDeliveries);
router.get('/admin/export', requireRole('admin', 'director', 'supervisor', 'auditor'), adminController.exportDeliveries);

// Directorio y Gestión de Personal
router.get('/admin/workers', requireRole('admin', 'director', 'supervisor'), adminController.getWorkers);
router.post('/admin/workers', requireRole('admin', 'director'), adminController.createWorker);
router.put('/admin/workers/:id', requireRole('admin', 'director'), adminController.updateWorker);
router.put('/admin/workers/:id/role', requireRole('admin', 'director'), validateWorkerRole(), adminController.updateWorkerRole);
router.delete('/admin/workers/:id', requireRole('admin', 'director'), adminController.deleteWorker);

// Seguridad, Dossier y Contingencias
router.get('/admin/workers/:id/security-dossier', requireRole('admin', 'director', 'supervisor'), adminController.getWorkerDossier);
router.post('/admin/credentials/:credential_id/revoke', requireRole('admin', 'director'), adminController.revokeCredential);
router.post('/admin/workers/:id/assign-nfc', requireRole('admin', 'director', 'supervisor'), adminController.assignNfc);

// Catálogo de Combos y Beneficios
router.get('/admin/combos', requireRole('admin', 'director', 'supervisor', 'auditor'), adminController.getCombos);
router.post('/admin/combos', requireRole('admin', 'director'), adminController.createCombo);
router.put('/admin/combos/:id', requireRole('admin', 'director'), adminController.updateCombo);
router.patch('/admin/combos/:id/toggle-status', requireRole('admin', 'director'), adminController.toggleComboStatus);
router.delete('/admin/combos/:id', requireRole('admin', 'director'), adminController.deleteCombo);

module.exports = router;

