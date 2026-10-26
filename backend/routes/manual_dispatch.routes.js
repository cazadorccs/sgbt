// backend/routes/manual_dispatch.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/manual_dispatch.controller');
const { requireRole, authenticate } = require('../middleware/auth.middleware');

// Búsqueda de trabajador por cédula (Mesa de despacho / Supervisión)
router.get('/manual-dispatch/search/:cedula', requireRole('operator', 'distributor', 'supervisor', 'admin', 'director'), controller.searchWorkerByCedula);
router.get('/manual-dispatch/search', requireRole('operator', 'distributor', 'supervisor', 'admin', 'director'), controller.searchWorkerByCedula);

// Despacho y descuento manual de combos (Mesa de despacho)
router.post('/manual-dispatch/deliver', requireRole('operator', 'distributor', 'supervisor', 'admin', 'director'), controller.deliverManualCombos);

// Incorporación rápida a nómina y despacho (Exclusivo Supervisor / RRHH / Admin)
router.post('/manual-dispatch/incorporate', requireRole('supervisor', 'admin', 'director'), controller.incorporateAndDeliver);

// KPIs y despachos recientes de hoy (Mesa de despacho / Supervisión / Monitor en vivo)
router.get('/manual-dispatch/today-summary', authenticate, controller.getTodayStatsAndRecent);

// Reinicio de entregas a 0 (Exclusivo Administrador General / Director)
router.post('/manual-dispatch/reset-deliveries', requireRole('admin', 'director'), controller.resetDeliveriesAction);

module.exports = router;
