// backend/routes/tenant.routes.js
const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenant.controller');

router.get('/tenant/settings', tenantController.getSettings);
router.post('/tenant/settings', tenantController.updateSettings);
router.post('/tenant/settings/validation-mode', tenantController.updateValidationMode);

module.exports = router;
