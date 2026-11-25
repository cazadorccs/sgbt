// backend/routes/operador.routes.js
// Rutas para el Puesto de Supervisión & Despacho Manual (Operador)
// Ventana minimalista: solo cédula y aprobar entrega.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/operador.controller');
const { requireRole, authenticate } = require('../middleware/auth.middleware');

// Login de operador por cédula (público, sin token previo)
router.post('/operador/login', controller.operadorLogin);

// Buscar trabajador por cédula (vista minimalista del operador - solo nombre y pendientes)
router.get('/operador/search/:cedula', requireRole('operator', 'distributor'), controller.operadorSearchWorker);
router.get('/operador/search', requireRole('operator', 'distributor'), controller.operadorSearchWorker);

// Despachar / entregar todos los combos pendientes (descontar en panel principal)
router.post('/operador/deliver', requireRole('operator', 'distributor'), controller.operadorDeliver);

module.exports = router;
