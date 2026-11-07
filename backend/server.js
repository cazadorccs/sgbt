// ============================================================================
// SERVIDOR RESTful BACKEND & GATEWAY FIDO2 / WEBAUTHN / OFFLINE-SYNC
// Arquitectura Modular v2.0 (Rutas, Controladores y Middleware Desacoplados)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { readyPromise } = require('./db');
const { errorHandler, rfc7807Middleware } = require('./middleware/error.middleware');
const { idempotencyMiddleware } = require('./middleware/idempotency.middleware');
const { securityHardening, cookieParserMiddleware, xssSanitizerMiddleware } = require('./middleware/security.middleware');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Soporte de formato estándar de errores RFC 7807
app.use(rfc7807Middleware);

// Parser nativo de cookies de sesión HttpOnly
app.use(cookieParserMiddleware);

// Middleware de seguridad y mitigación de ataques de compresión (CVE-2026-111497) y CSP
app.use(securityHardening);

// Redirección forzada a HTTPS en entornos de producción (Mitigación MitM / SSL Stripping)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isHttps) {
      const host = req.headers.host || 'sgbt-bice.vercel.app';
      return res.redirect(301, `https://${host}${req.originalUrl}`);
    }
    next();
  });
}

// Configuración de CORS segura con lista blanca y credenciales (Mitigación CWE-942)
const allowedOrigins = [
  'https://sgbt-bice.vercel.app',
  process.env.APP_URL
].filter(Boolean);

if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
}

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    // Permitir llamadas sin origen (Apps nativas, PWA, curl, scripts o tests)
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'test') {
      return callback(null, true);
    }
    // Permitir dominios de despliegue en Vercel del proyecto
    if (typeof origin === 'string' && (origin.endsWith('.vercel.app') || origin.endsWith('mippci.gob.ve'))) {
      return callback(null, true);
    }
    return callback(new Error(`Bloqueado por política CORS: El origen ${origin} no está autorizado.`));
  }
}));

// Límite de carga para rutas específicas que requieren envío de fotos o ingesta masiva (50MB)
const largePayloadPaths = [
  '/api/v1/payroll/batch-import',
  '/api/v1/admin/workers/batch',
  '/api/v1/auth/enroll'
];
app.use(largePayloadPaths, express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(largePayloadPaths, express.urlencoded({ limit: '50mb', extended: true }));

// Límite seguro predeterminado de 2MB para el resto de endpoints de la API (Mitigación DoS)
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Sanitización activa contra Cross-Site Scripting (XSS) en payloads JSON y formularios
app.use(xssSanitizerMiddleware);

// Ruta segura de acceso a la consola de administración institucional (/coseg)
app.get(/^\/coseg(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Ruta para la vista independiente de Registro y Auditoría de Entregas en Vivo (/entregas)
app.get(/^\/entregas(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/entregas/index.html'));
});

// Servidor de estáticos (PWA, CSS, JS, Assets)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/diagrams', express.static(path.join(__dirname, '../public/diagrams')));
app.use('/docs/diagrams', express.static(path.join(__dirname, '../public/diagrams')));

const { auditLoggerMiddleware } = require('./middleware/audit_logger.middleware');

// Middleware de auditoría universal y traza de peticiones HTTP
app.use(auditLoggerMiddleware);
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const t0 = Date.now();
    res.on('finish', () => {
      const dur = Date.now() - t0;
      console.log(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} - ${dur}ms`);
    });
  }
  next();
});

// Middleware de sincronización para Vercel Serverless / SQLite en frío
app.use(async (req, res, next) => {
  try {
    if (readyPromise) {
      await readyPromise;
    }
    next();
  } catch (err) {
    console.error('[DB WAIT ERROR]', err);
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: isProd
        ? 'La base de datos se está inicializando o no está disponible temporalmente. Intente nuevamente en unos instantes.'
        : ('La base de datos se está inicializando: ' + err.message)
    });
  }
});

// Redirecciones amigables a la documentación interactiva OpenAPI 3.1
app.get('/docs', (req, res) => res.redirect('/api/v1/docs'));
app.get('/api/docs', (req, res) => res.redirect('/api/v1/docs'));

// Soporte de idempotencia en peticiones mutadoras de la API (RFC / Idempotency-Key)
app.use('/api', idempotencyMiddleware);

// Montaje de rutas de la API REST v1
app.use('/api/v1', apiRoutes);

// Captura de 404 para rutas de API en formato RFC 7807 (Problem Details)
app.use('/api', (req, res) => {
  res.status(404).problem({
    type: 'https://tools.ietf.org/html/rfc7807',
    title: 'Endpoint No Encontrado',
    status: 404,
    detail: `La ruta solicitada [${req.method}] ${req.originalUrl} no existe en este servidor.`
  });
});

// Manejador centralizado de errores
app.use(errorHandler);

// Iniciar servidor local o exportar para Vercel Serverless
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 Plataforma Combos Alimenticios con Passkeys & Offline-First`);
    console.log(`📡 Servidor RESTful activo en: http://localhost:${PORT}`);
    console.log(`🔒 Motor Criptográfico: ECDSA P-256 (ES256) / FIDO2 Relying Party`);
    console.log(`💾 Base de datos: SQLite/PostgreSQL con índice estricto idx_unique_daily_claim`);
    console.log(`🧱 Arquitectura: 100% Modular (Routes, Controllers, Middleware)`);
    console.log(`================================================================`);
  });
}

module.exports = app;
module.exports.app = app;
