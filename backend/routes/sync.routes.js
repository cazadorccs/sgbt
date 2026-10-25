// backend/routes/sync.routes.js
const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');
const { validateBody } = require('../middleware/validator.middleware');

router.get('/sync/daily-pack', syncController.getDailyPack);
router.post('/sync/batch-deliveries', validateBody(['deliveries']), syncController.batchDeliveries);

module.exports = router;
