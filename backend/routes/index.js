// backend/routes/index.js
// Agregador de rutas modulares de la API REST v1

const express = require('express');
const router = express.Router();

const systemRoutes = require('./system.routes');
const authRoutes = require('./auth.routes');
const payrollRoutes = require('./payroll.routes');
const syncRoutes = require('./sync.routes');
const adminRoutes = require('./admin.routes');
const campaignsRoutes = require('./campaigns.routes');
const tenantRoutes = require('./tenant.routes');
const notificationsRoutes = require('./notifications.routes');
const manualDispatchRoutes = require('./manual_dispatch.routes');
const dispatchRoutes = require('./dispatch.routes');
const departmentBatchRoutes = require('./department_batch.routes');
const ministerialAuditRoutes = require('./ministerial_audit.routes');

router.use('/', systemRoutes);
router.use('/', authRoutes);
router.use('/', payrollRoutes);
router.use('/', syncRoutes);
router.use('/', adminRoutes);
router.use('/', campaignsRoutes);
router.use('/', tenantRoutes);
router.use('/', notificationsRoutes);
router.use('/', manualDispatchRoutes);
router.use('/', dispatchRoutes);
router.use('/', departmentBatchRoutes);
router.use('/', ministerialAuditRoutes);

module.exports = router;
