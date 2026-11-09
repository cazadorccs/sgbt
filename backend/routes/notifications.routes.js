// backend/routes/notifications.routes.js
const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notifications.controller');

// Avisos institucionales en plataforma
router.get('/notifications', notificationsController.getNotifications);
router.post('/notifications', notificationsController.createNotification);

// Web Push API en segundo plano (VAPID RFC 8291 / 8292)
router.get('/notifications/vapid-public-key', notificationsController.getVapidPublicKey);
router.post('/notifications/subscribe', notificationsController.subscribeWebPush);
router.post('/notifications/unsubscribe', notificationsController.unsubscribeWebPush);
router.post('/notifications/test-push', notificationsController.sendTestPush);

module.exports = router;
