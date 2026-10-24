// backend/routes/system.routes.js
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');
const { requireRole } = require('../middleware/auth.middleware');

router.get('/system/status', systemController.getStatus);
router.post('/system/demo-mode', requireRole('admin', 'director'), systemController.toggleDemoMode);

router.get('/admin/export-backup', requireRole('admin', 'director'), systemController.exportBackup);
router.post('/admin/factory-reset', requireRole('admin', 'director'), systemController.factoryReset);

router.post('/setup/initialize', systemController.initializeSetup);
router.get('/setup/sample-payroll.csv', systemController.samplePayrollCsv);
router.get('/payroll/sample-payroll.csv', systemController.samplePayrollCsv);

module.exports = router;

