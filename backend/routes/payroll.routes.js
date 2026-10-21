// backend/routes/payroll.routes.js
const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payroll.controller');

router.post('/payroll/webhook', payrollController.handleWebhook);
router.post('/payroll/batch-import', payrollController.handleBatchImport);
router.post('/admin/workers/batch', payrollController.handleBatchImport);
router.post('/payroll/employees/:id/terminate', payrollController.terminateEmployee);

module.exports = router;
