// backend/test_logging_and_scan.js
// Script de prueba integral: Captura de logs, auditoría en tiempo real y validación de escaneo de combos

const http = require('http');
const assert = require('assert');
const { db } = require('./db');
const { generateOfflinePasskeySignature } = require('./services/passkey.service');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: body ? JSON.parse(body) : null,
            rawText: body
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            rawText: body
          });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 ================================================================');
  console.log('🧪 SUITE DE PRUEBAS: CAPTURA DE LOGS Y ESCANEO DE COMBOS');
  console.log('🧪 ================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`⏳ Ejecutando: ${name}... `);
      await fn();
      console.log('✅ OK');
      passed++;
    } catch (err) {
      console.log(`❌ FALLÓ: ${err.message}`);
      failed++;
    }
  }

  // PRUEBA 1: Consulta del endpoint de logs del sistema
  await test('1. GET /api/v1/system/logs retorna logs y metadatos', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/system/logs?limit=10',
      method: 'GET'
    });
    assert.strictEqual(res.statusCode, 200, 'Debe responder HTTP 200');
    assert(res.data && Array.isArray(res.data.logs), 'Debe retornar un array en logs');
    assert(typeof res.data.total === 'number', 'Debe retornar total numérico');
  });

  // PRUEBA 2: Envío de logs desde el cliente web
  await test('2. POST /api/v1/system/client-logs recibe y persiste logs del navegador', async () => {
    const testLog = {
      level: 'INFO',
      action: 'TEST_CLIENT_SCAN_SIMULATION',
      message: 'Escaneo de prueba ejecutado desde cliente',
      payload: { rawText: '{"test":true}', scanner: 'camera_front' }
    };

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/system/client-logs',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, testLog);

    assert(res.statusCode === 200 || res.statusCode === 201, `Debe responder HTTP 200 o 201, obtenido: ${res.statusCode}`);
    assert(res.data && (res.data.status === 'logged' || res.data.success === true), 'Debe confirmar guardado');

    // Verificar en SQLite
    const found = db.prepare("SELECT * FROM system_activity_logs WHERE action = 'TEST_CLIENT_SCAN_SIMULATION' LIMIT 1").get();
    assert(found, 'El log del cliente debe persistir en SQLite');
  });

  // PRUEBA 3: Descarga del archivo consolidado .log
  await test('3. GET /api/v1/system/logs/download retorna archivo de texto', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/system/logs/download',
      method: 'GET'
    });
    assert.strictEqual(res.statusCode, 200, 'Debe responder HTTP 200');
    assert(res.headers['content-disposition']?.includes('attachment'), 'Debe tener header de descarga');
  });

  // PRUEBA 4: Escaneo y Validación de QR con Payload en Base64
  await test('4. POST /api/v1/verify/qr acepta QR en formato Base64', async () => {
    // Buscar un trabajador que tenga passkey activa
    const cred = db.prepare(`
      SELECT pc.worker_id, w.document_id, w.full_name
      FROM passkey_credentials pc
      JOIN workers w ON w.id = pc.worker_id
      WHERE pc.status = 'active'
      LIMIT 1
    `).get();
    assert(cred, 'Debe haber un trabajador con passkey');

    const signRes = generateOfflinePasskeySignature({ worker_id: cred.worker_id, station: '1' });
    const b64Payload = Buffer.from(JSON.stringify(signRes.qr_payload)).toString('base64');

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/verify/qr',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      qr_payload: b64Payload,
      station: '1'
    });

    // Puede responder 200 (aprobado) o 409 (ya retirado hoy), pero NUNCA 400 (error de parseo o corrupto)
    assert(res.statusCode === 200 || res.statusCode === 409, `Respuesta esperada 200 o 409, obtenida: ${res.statusCode}`);
    assert(res.data.code !== 'QR_EXPIRED', 'No debe estar expirado con tolerancia de 15 min');
  });

  // PRUEBA 5: Escaneo y Validación de Contingencia de Supervisor
  await test('5. POST /api/v1/verify/qr procesa QR de contingencia para combos activos', async () => {
    // Buscar un trabajador que no tenga entregas hoy
    const today = new Date().toISOString().split('T')[0];
    const worker = db.prepare(`
      SELECT w.id, w.document_id, w.full_name
      FROM workers w
      WHERE w.id NOT IN (SELECT worker_id FROM deliveries)
      LIMIT 1
    `).get();
    assert(worker, 'Debe haber un trabajador sin entregas');

    const contingencyQr = {
      protocol: 'SGBT_SUPERVISOR_CONTINGENCY_V1',
      worker_document_id: worker.document_id,
      reason: 'adulto_mayor_sin_smartphone'
    };

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/verify/qr',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      qr_payload: contingencyQr,
      station: '1'
    });

    assert.strictEqual(res.statusCode, 200, `Debe aprobar contingencia con 200. Error: ${res.data?.error || res.rawText}`);
    assert.strictEqual(res.data.valid, true, 'Debe marcar valid: true');
    assert(res.data.delivery_id, 'Debe retornar un delivery_id');
    assert(res.data.combo_name, 'Debe retornar el nombre del combo activo asignado');

    // Verificar que la acción quedó registrada en los logs del sistema
    const logFound = db.prepare("SELECT * FROM system_activity_logs WHERE action = 'SCAN_APPROVED_CONTINGENCY' LIMIT 1").get();
    assert(logFound, 'El despacho de contingencia debe estar auditado en system_activity_logs');
  });

  // PRUEBA 6: Escaneo directo de Cédula como código de barras
  await test('6. POST /api/v1/verify/qr procesa string de cédula directo (código de barras)', async () => {
    const worker = db.prepare(`
      SELECT w.id, w.document_id
      FROM workers w
      WHERE w.id NOT IN (SELECT worker_id FROM deliveries)
      LIMIT 1
    `).get();
    assert(worker, 'Debe haber un trabajador disponible');

    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/verify/qr',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      qr_payload: worker.document_id,
      station: '1'
    });

    assert.strictEqual(res.statusCode, 200, `Debe procesar la cédula directa con 200. Error: ${res.data?.error || res.rawText}`);
    assert.strictEqual(res.data.valid, true, 'Debe ser validado');
  });

  // PRUEBA 7: Auditoría HTTP automática en Middleware
  await test('7. Middleware de auditoría registra peticiones HTTP en SQLite y activity.log', async () => {
    const recentHttpLog = db.prepare("SELECT * FROM system_activity_logs WHERE (action IN ('API_REQUEST', 'SCAN_VERIFY_QR', 'HTTP_REQUEST') OR method IS NOT NULL) ORDER BY created_at DESC LIMIT 1").get();
    assert(recentHttpLog, 'Debe existir registro de petición HTTP en system_activity_logs');
    assert(recentHttpLog.endpoint, 'Debe tener endpoint');
    assert(recentHttpLog.status_code, 'Debe tener status_code');
  });

  console.log('\n================================================================');
  console.log(`🏁 RESULTADOS: ${passed} pruebas superadas, ${failed} fallidas.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
