// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/auth/login', authController.login);
router.post('/auth/magic-login', authController.magicLogin);
router.post('/auth/passkey/register-challenge', authController.registerChallenge);
router.post('/auth/passkey/register-verify', authController.registerVerify);
router.post('/auth/passkey/sign-offline', authController.signOffline);

router.get('/supervisor/daily-qr', authController.getSupervisorDailyQr);
router.post('/auth/supervisor/delegate', authController.createDelegation);
router.post('/auth/supervisor/contingency-override', authController.contingencyOverride);
router.post('/verify/qr', authController.verifyQr);
router.get('/auth/delivery-status', authController.getDeliveryStatus);
router.get('/auth/delivery-stream', authController.deliveryStream);

module.exports = router;
