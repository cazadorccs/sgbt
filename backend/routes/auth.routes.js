const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireRole, authenticate, requireAuth } = require('../middleware/auth.middleware');
const { loginRateLimiter } = require('../middleware/security.middleware');
const { validateBody, validateDocumentId } = require('../middleware/validator.middleware');

// Autenticación pública protegida por limitador de tasa y validación estricta de formato
router.post('/auth/login', loginRateLimiter(), validateBody(['document_id']), validateDocumentId('document_id'), authController.login);
router.post('/auth/magic-login', loginRateLimiter(), authController.magicLogin);
router.post('/auth/logout', requireAuth, authController.logout);

// Enrolamiento y validación de Passkeys FIDO2
router.post('/auth/passkey/register-challenge', authController.registerChallenge);
router.post('/auth/passkey/register-verify', authController.registerVerify);
router.post('/auth/passkey/sign-offline', authenticate, authController.signOffline);

// Rutas de supervisión y contingencia protegidas por RBAC
router.get('/supervisor/daily-qr', authController.getSupervisorDailyQr);
router.post('/auth/supervisor/delegate', requireRole('supervisor', 'admin', 'director'), authController.createDelegation);
router.post('/auth/supervisor/contingency-override', requireRole('supervisor', 'admin', 'director'), authController.contingencyOverride);

// Validación de QR y estado en tiempo real (Blindado contra IDOR con authenticate)
router.post('/verify/qr', authController.verifyQr);
router.get('/auth/delivery-status', authenticate, authController.getDeliveryStatus);
router.get('/auth/delivery-stream', authController.deliveryStream);

module.exports = router;
