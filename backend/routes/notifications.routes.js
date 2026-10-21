// backend/routes/notifications.routes.js
const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');

router.get('/notifications', notificationsController.getNotifications);
router.post('/notifications', notificationsController.createNotification);

module.exports = router;
