// backend/routes/system.routes.js
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');

router.get('/system/status', systemController.getStatus);
router.post('/system/demo-mode', systemController.toggleDemoMode);

router.get('/admin/export-backup', systemController.exportBackup);
router.post('/admin/factory-reset', systemController.factoryReset);

router.post('/setup/initialize', systemController.initializeSetup);
router.get('/setup/sample-payroll.csv', systemController.samplePayrollCsv);
router.get('/payroll/sample-payroll.csv', systemController.samplePayrollCsv);

module.exports = router;
