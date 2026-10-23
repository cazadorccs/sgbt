// backend/routes/manual_dispatch.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/manual_dispatch.controller');

// Búsqueda de trabajador por cédula
router.get('/manual-dispatch/search/:cedula', controller.searchWorkerByCedula);
router.get('/manual-dispatch/search', controller.searchWorkerByCedula);

// Despacho y descuento manual de combos
router.post('/manual-dispatch/deliver', controller.deliverManualCombos);

// Incorporación rápida a nómina y despacho
router.post('/manual-dispatch/incorporate', controller.incorporateAndDeliver);

// KPIs y despachos recientes de hoy
router.get('/manual-dispatch/today-summary', controller.getTodayStatsAndRecent);

// Reinicio de entregas a 0
router.post('/manual-dispatch/reset-deliveries', controller.resetDeliveriesAction);

module.exports = router;
