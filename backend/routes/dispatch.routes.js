// backend/routes/dispatch.routes.js
// Rutas para Despacho Simplificado y Retiro Único Totalizado (Fase 3)

const express = require('express');
const router = express.Router();
const dispatchController = require('../controllers/dispatch.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// Endpoint principal de Despacho Atómico Totalizado (1 solo escaneo para todos los combos)
router.post('/dispatch/atomic-claim', dispatchController.atomicClaim);

// Consulta y configuración del Modo de Despacho en Mesa de Almacén (Totalizado vs Estación Específica)
router.get('/dispatch/mode', dispatchController.getDispatchMode);
router.post('/dispatch/mode', authenticate, requireRole('operator', 'supervisor', 'admin', 'director'), dispatchController.setDispatchMode);

// Estadísticas de entregas y candados del día
router.get('/dispatch/stats', authenticate, dispatchController.getDispatchStats);

module.exports = router;
