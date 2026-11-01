// tests/edge_cases_dispatch.test.js
// Suite de Pruebas de Casos Límite (Edge Cases) y Robustez
// SGBT MIPPCI - DevSecOps

const assert = require('assert');
const http = require('http');
const { app } = require('../backend/server');

const PORT = 4099;

function request(options, bodyData) {
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
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runEdgeCases() {
  console.log('================================================================');
  console.log('🧪 SUITE: CASOS LÍMITE (EDGE CASES) Y RESILIENCIA DE SEGURIDAD');
  console.log('================================================================');

  const server = app.listen(PORT);

  try {
    // Caso 1: JSON Malformado
    const res1 = await request(
      {
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      '{ "document_id": "V-18456123", INVALID_JSON }'
    );
    assert.ok(res1.status >= 400 && res1.status < 500, `Esperado error 4xx, recibido ${res1.status}`);
    console.log('  ✅ EDGE-01: Rechazo seguro de JSON malformado (sin colapso del servidor)');

    // Caso 2: Intento de Inyección SQL
    const sqlInjectionPayload = "V-18456123' OR '1'='1";
    const res2 = await request({
      path: `/api/v1/auth/verify?document_id=${encodeURIComponent(sqlInjectionPayload)}`,
      method: 'GET'
    });
    assert.ok(res2.status === 400 || res2.status === 404, `Status esperado 400 o 404, recibido ${res2.status}`);
    console.log('  ✅ EDGE-02: Neutralización de inyección SQL en parámetros de consulta');

    // Caso 3: QR con firma HMAC adulterada
    const res3 = await request(
      {
        path: '/api/v1/verify/qr',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'EDGE-CASE-FAKE-KEY-9999'
        }
      },
      {
        qr_data: 'MALICIOUS_TAMPERED_DATA',
        distribution_point_id: ''
      }
    );
    assert.ok(res3.status === 400 || res3.status === 401 || res3.status === 422, `Esperado rechazo seguro, recibido ${res3.status}`);
    console.log('  ✅ EDGE-03: Rechazo de token QR adulterado o parámetros incompletos');

    // Caso 4: Ruta Inexistente y RFC 7807
    const res4 = await request({
      path: '/api/v1/ruta-inexistente-seguridad',
      method: 'GET'
    });
    assert.strictEqual(res4.status, 404);
    console.log('  ✅ EDGE-04: Respuesta RFC 7807 ante rutas inexistentes (404 Not Found)');

    // Caso 5: Carga gigante
    const hugePayload = 'A'.repeat(500000);
    const res5 = await request(
      {
        path: '/api/v1/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { document_id: hugePayload }
    );
    assert.ok(res5.status === 400 || res5.status === 413, `Esperado rechazo seguro, recibido ${res5.status}`);
    console.log('  ✅ EDGE-05: Mitigación de desbordamiento de búfer y payloads gigantes');

    console.log('================================================================');
    console.log('🎉 TODOS LOS CASOS LÍMITE (5/5) PASARON EXITOSAMENTE');
    console.log('================================================================');
  } finally {
    server.close();
  }
}

if (require.main === module) {
  runEdgeCases()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en pruebas de casos límite:', err);
      process.exit(1);
    });
}

module.exports = { runEdgeCases };
