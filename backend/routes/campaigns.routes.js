// backend/routes/campaigns.routes.js
const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaigns.controller');

router.get('/distribution-points', campaignsController.getDistributionPoints);
router.post('/distribution-points', campaignsController.createDistributionPoint);
router.put('/distribution-points/:id', campaignsController.updateDistributionPoint);

router.get('/admin/campaigns', campaignsController.getCampaigns);
router.post('/admin/campaigns', campaignsController.createCampaign);
router.put('/admin/campaigns/:id/status', campaignsController.updateCampaignStatus);
router.post('/admin/campaigns/:id/notify', campaignsController.notifyCampaign);

module.exports = router;
