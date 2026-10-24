// backend/routes/campaigns.routes.js
const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaigns.controller');
const { requireRole } = require('../middleware/auth.middleware');

// Puntos de Distribución
router.get('/distribution-points', campaignsController.getDistributionPoints);
router.post('/distribution-points', requireRole('admin', 'director'), campaignsController.createDistributionPoint);
router.put('/distribution-points/:id', requireRole('admin', 'director'), campaignsController.updateDistributionPoint);

// Campañas y Jornadas Institucionales
router.get('/admin/campaigns', requireRole('admin', 'director', 'supervisor', 'auditor'), campaignsController.getCampaigns);
router.post('/admin/campaigns', requireRole('admin', 'director'), campaignsController.createCampaign);
router.put('/admin/campaigns/:id/status', requireRole('admin', 'director'), campaignsController.updateCampaignStatus);
router.post('/admin/campaigns/:id/notify', requireRole('admin', 'director'), campaignsController.notifyCampaign);

module.exports = router;

