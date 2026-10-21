// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/auth/login', authController.login);
router.post('/auth/passkey/register-challenge', authController.registerChallenge);
router.post('/auth/passkey/register-verify', authController.registerVerify);
router.post('/auth/passkey/sign-offline', authController.signOffline);

router.get('/supervisor/daily-qr', authController.getSupervisorDailyQr);
router.post('/verify/qr', authController.verifyQr);

module.exports = router;
