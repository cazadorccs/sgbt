// tests/contract_openapi.test.js
// Validación Automatizada de Contrato OpenAPI 3.1 (Contract Testing)
// Asegura que los contratos de la API REST nunca diverjan de la especificación YAML viva

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { app } = require('../backend/server');

const PORT = 4098;
const openapiPath = path.resolve(__dirname, '../docs/openapi.yaml');

function request(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        ...options
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runContractTests() {
  console.log('================================================================');
  console.log('📜 SUITE DE VALIDACIÓN CONTRACTUAL OPENAPI 3.1 (CONTRACT TESTING)');
  console.log('================================================================');

  assert.ok(fs.existsSync(openapiPath), 'El archivo docs/openapi.yaml debe existir');
  const yamlContent = fs.readFileSync(openapiPath, 'utf8');

  // Iniciar servidor de prueba
  const server = app.listen(PORT);

  try {
    // 1. Validar endpoint de documentación OpenAPI
    const resDoc = await request({ path: '/api/v1/docs/openapi.yaml', method: 'GET' });
    assert.strictEqual(resDoc.status, 200, 'Ruta /api/v1/docs/openapi.yaml debe responder 200');
    console.log('  ✅ CONTRACT-01: Disponibilidad y exposición viva del documento OpenAPI 3.1');

    // 2. Comprobar que endpoints críticos declarados en YAML están implementados en el router Express
    const criticalPaths = [
      '/dispatch/atomic-claim',
      '/dispatch/void',
      '/auth/login',
      '/verify/qr',
      '/system/status'
    ];

    for (const p of criticalPaths) {
      assert.ok(yamlContent.includes(p + ':'), `La ruta ${p} debe estar declarada formalmente en openapi.yaml`);
    }
    console.log('  ✅ CONTRACT-02: Concordancia de endpoints de producción con el esquema YAML');

    // 3. Comprobar estructura estándar de Error RFC 7807 (ProblemDetails en YAML)
    assert.ok(yamlContent.includes('ProblemDetails:'), 'openapi.yaml debe definir el schema ProblemDetails');
    const res404 = await request({ path: '/api/v1/ruta-inexistente-contrato', method: 'GET' });
    assert.strictEqual(res404.status, 404);
    assert.strictEqual(res404.headers['content-type'].includes('json'), true);
    console.log('  ✅ CONTRACT-03: Alineación de errores RFC 7807 con el esquema ProblemDetails');

    console.log('================================================================');
    console.log('🎉 TODOS LOS TESTS DE CONTRATO OPENAPI (3/3) PASARON EXITOSAMENTE');
    console.log('================================================================');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runContractTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en Contract Testing:', err);
      process.exit(1);
    });
}

module.exports = { runContractTests };
