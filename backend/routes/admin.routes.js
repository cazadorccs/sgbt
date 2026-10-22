// backend/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

router.get('/admin/kpis', adminController.getKpis);

router.get('/admin/workers', adminController.getWorkers);
router.post('/admin/workers', adminController.createWorker);
router.put('/admin/workers/:id', adminController.updateWorker);
router.put('/admin/workers/:id/role', adminController.updateWorkerRole);
router.delete('/admin/workers/:id', adminController.deleteWorker);

router.get('/admin/workers/:id/security-dossier', adminController.getWorkerDossier);
router.post('/admin/credentials/:credential_id/revoke', adminController.revokeCredential);
router.post('/admin/workers/:id/assign-nfc', adminController.assignNfc);

router.get('/admin/combos', adminController.getCombos);
router.post('/admin/combos', adminController.createCombo);
router.delete('/admin/combos/:id', adminController.deleteCombo);

router.get('/admin/audit/stats', adminController.getAuditStats);
router.get('/admin/deliveries', adminController.getDeliveries);
router.get('/admin/export', adminController.exportDeliveries);

module.exports = router;
