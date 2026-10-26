// backend/routes/system.routes.js
const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');
const { requireRole } = require('../middleware/auth.middleware');

router.get('/system/status', systemController.getStatus);
router.post('/system/demo-mode', requireRole('admin', 'director'), systemController.toggleDemoMode);

// Rutas de Auditoría, Logs en Vivo y Diagnóstico Forense
router.get('/system/logs', systemController.getLogs);
router.get('/system/logs/stream', systemController.streamLogs);
router.get('/system/logs/download', systemController.downloadLogs);
router.post('/system/client-logs', systemController.receiveClientLog);
router.delete('/system/logs/clear', requireRole('admin', 'director'), systemController.clearSystemLogs);

router.get('/admin/export-backup', requireRole('admin', 'director'), systemController.exportBackup);
router.post('/admin/factory-reset', requireRole('admin', 'director'), systemController.factoryReset);

router.post('/setup/initialize', systemController.initializeSetup);
router.get('/setup/sample-payroll.csv', systemController.samplePayrollCsv);
router.get('/payroll/sample-payroll.csv', systemController.samplePayrollCsv);

// Catálogo de combos activos para estaciones de despacho y beneficiarios
router.get('/combos', (req, res) => {
  try {
    const { db } = require('../db');
    const combos = db.prepare(`
      SELECT id, name, description, category, items_detail, icon, mesa_name, mesa_number, weight_kg, is_active
      FROM combos
      WHERE is_active = 1
      ORDER BY created_at ASC, id ASC
    `).all();
    res.json(combos);
  } catch (err) {
    res.status(500).json({ error: 'Error consultando combos: ' + err.message });
  }
});

// Especificación OpenAPI 3.1 YAML
router.get('/docs/openapi.yaml', (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const openApiPath = path.join(__dirname, '../../docs/openapi.yaml');
  if (fs.existsSync(openApiPath)) {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    return res.sendFile(openApiPath);
  }
  res.status(404).json({ error: 'Especificación OpenAPI no encontrada' });
});

// Explorador Interactivo de API (Swagger UI Standalone)
router.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>API Docs - Plataforma Combos Alimenticios MIPPCI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="/icons/icon-192x192.png" />
  <style>
    body { margin: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .topbar { display: none !important; }
    .swagger-ui { background-color: #ffffff; border-radius: 12px; margin: 24px auto; max-width: 1280px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden; }
    .header-banner { background: linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%); color: #ffffff; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
    .header-banner h1 { margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; }
    .header-banner a { color: #bae6fd; text-decoration: none; font-size: 0.875rem; font-weight: 500; border: 1px solid rgba(255,255,255,0.3); padding: 6px 14px; border-radius: 6px; }
    .header-banner a:hover { background: rgba(255,255,255,0.1); color: #fff; }
  </style>
</head>
<body>
  <div class="header-banner">
    <div>
      <h1>SGBT / MIPPCI — Contrato de API REST v2.1 (OpenAPI 3.1)</h1>
      <small style="opacity: 0.85;">Documentación viva generada bajo directrices de living-docs-governance & api-design</small>
    </div>
    <div>
      <a href="/api/v1/docs/openapi.yaml" download="openapi.yaml">Descargar YAML</a>
      <a href="/" style="margin-left: 8px;">Volver al Sistema</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api/v1/docs/openapi.yaml',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`);
});

module.exports = router;


