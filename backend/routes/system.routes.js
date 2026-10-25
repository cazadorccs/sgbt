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

// Catálogo de combos activos para estaciones de despacho y beneficiarios
router.get('/combos', (req, res) => {
  try {
    const { db } = require('../db');
    const combos = db.prepare(`
      SELECT id, name, description, category, items_detail, icon, mesa_name, mesa_number, weight_kg, is_active
      FROM combos
      WHERE is_active = 1
      ORDER BY created_at ASC, id ASC
    `).all();
    res.json(combos);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando combos: ' + err.message });
  }
});

module.exports = router;

