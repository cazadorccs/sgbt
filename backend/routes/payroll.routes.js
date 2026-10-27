// backend/routes/payroll.routes.js
const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payroll.controller');
const { requireRole } = require('../middleware/auth.middleware');

// Ingesta por webhook institucional validado por firma HMAC SHA-256
router.post('/payroll/webhook', payrollController.handleWebhook);

// Ingesta masiva manual y bajas de personal (Exclusivo Administrador General / Director)
router.get('/payroll/enrollment-stats', requireRole('admin', 'director', 'supervisor', 'auditor'), payrollController.getEnrollmentStats);
router.post('/payroll/batch-import', requireRole('admin', 'director'), payrollController.handleBatchImport);
router.post('/admin/workers/batch', requireRole('admin', 'director'), payrollController.handleBatchImport);
router.post('/payroll/employees/:id/terminate', requireRole('admin', 'director'), payrollController.terminateEmployee);

module.exports = router;
