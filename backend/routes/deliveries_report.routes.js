// backend/routes/deliveries_report.routes.js
// Rutas RESTful para la Consola y Reporte Detallado de Entregas en Pantalla Completa (/entregas)

const express = require('express');
const router = express.Router();
const controller = require('../controllers/deliveries_report.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Consulta estructurada de entregas con paginación, filtros dinámicos y métricas
router.get('/deliveries/report', authenticate, controller.getDeliveriesReport);

// Descarga en formato CSV / Excel con compatibilidad UTF-8 BOM
router.get('/deliveries/export-csv', authenticate, controller.exportDeliveriesCsv);

module.exports = router;

