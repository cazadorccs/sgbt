// backend/routes/simulation.routes.js
// Rutas de simulación interactiva dual (Beneficiario / Mesa de Despacho)

const express = require('express');
const router = express.Router();
const controller = require('../controllers/simulation.controller');

router.get('/simulation/workers', controller.getSimulationWorkers);
router.post('/simulation/dispatch-step', controller.dispatchStep);
router.post('/simulation/reset', controller.resetSimulation100);

module.exports = router;
