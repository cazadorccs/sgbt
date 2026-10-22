// ============================================================================
// SERVIDOR RESTful BACKEND & GATEWAY FIDO2 / WEBAUTHN / OFFLINE-SYNC
// Arquitectura Modular v2.0 (Rutas, Controladores y Middleware Desacoplados)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { readyPromise } = require('./db');
const { errorHandler } = require('./middleware/error.middleware');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares base
app.use(cors());

// Raw body retention para verificación HMAC en Webhooks con límite de 50MB
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servidor de estáticos (PWA, CSS, JS, Assets)
app.use(express.static(path.join(__dirname, '../public')));

// Middleware de auditoría y traza de peticiones HTTP
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
    res.status(500).json({ error: 'La base de datos se está inicializando: ' + err.message });
  }
});

// Montaje de rutas de la API REST v1
app.use('/api/v1', apiRoutes);

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
