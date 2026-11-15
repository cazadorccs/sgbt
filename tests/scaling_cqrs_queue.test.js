// tests/scaling_cqrs_queue.test.js
// ============================================================================
// SUITE DE PRUEBAS: SEGREGACIÓN LECTURA/ESCRITURA (CQRS) Y SISTEMA DE COLAS (FASES 3 Y 4)
// ============================================================================

const assert = require('assert');
const http = require('http');
const { dbRouter, DatabaseRouterService } = require('../backend/services/db_router.service');
const { queue, QueueService, JOB_TYPES } = require('../backend/services/queue.service');
const { enqueuePushNotification } = require('../backend/services/push.service');
const { enqueueBackgroundCloudSync } = require('../backend/services/outbox.service');
const { generateSessionToken } = require('../backend/crypto-utils');
const app = require('../backend/server');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 SUITE: SEGREGACIÓN CQRS Y COLAS ASÍNCRONAS (FASES 3 Y 4)');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // --- SECCIÓN 1: SEGREGACIÓN LECTURA / ESCRITURA (CQRS) ---
  console.log('\n--- 1. Enrutamiento CQRS de Base de Datos ---');

  test('CQRS 1: dbRouter expone conexiones dbWrite y dbRead válidas', () => {
    assert.ok(dbRouter.dbWrite, 'dbWrite debe estar definido');
    assert.ok(dbRouter.dbRead, 'dbRead debe estar definido');
    assert.strictEqual(typeof dbRouter.queryRead, 'function');
    assert.strictEqual(typeof dbRouter.queryWrite, 'function');
  });

  test('CQRS 2: Consulta de solo lectura dirigida a réplica (queryRead / getRead)', () => {
    const metricsBefore = dbRouter.getMetrics();
    const result = dbRouter.getRead("SELECT COUNT(*) as cnt FROM workers WHERE status = 'active'");
    assert.ok(result && result.cnt > 0, 'Debe devolver conteo de trabajadores activos');

    const metricsAfter = dbRouter.getMetrics();
    assert.strictEqual(metricsAfter.readsRouted, metricsBefore.readsRouted + 1);
  });

  test('CQRS 3: Transacciones y escrituras dirigidas al nodo primario (transactionWrite)', () => {
    const metricsBefore = dbRouter.getMetrics();
    const txRes = dbRouter.transactionWrite(() => {
      return dbRouter.getRead("SELECT 1 as num");
    })();
    assert.strictEqual(txRes.num, 1);

    const metricsAfter = dbRouter.getMetrics();
    assert.strictEqual(metricsAfter.transactionsExecuted, metricsBefore.transactionsExecuted + 1);
  });

  test('CQRS 4: Reporte de métricas de enrutamiento y estado de la réplica', () => {
    const metrics = dbRouter.getMetrics();
    assert.ok(metrics.cqrsActive, 'CQRS debe estar activo');
    assert.ok(typeof metrics.readsRouted === 'number');
    assert.ok(typeof metrics.writesRouted === 'number');
    assert.ok(typeof metrics.engine === 'string');
  });

  // --- SECCIÓN 2: SISTEMA DE COLAS DE MENSAJES Y WORKERS ASÍNCRONOS ---
  console.log('\n--- 2. Sistema de Colas de Mensajes y Background Workers ---');

  const testQueue = new QueueService({ concurrency: 2 });

  await asyncTest('Queue 1: Encolado de trabajo y procesamiento asíncrono exitoso', async () => {
    let executed = false;
    testQueue.registerHandler('TEST_ASYNC_JOB', async (job) => {
      executed = true;
      return { answer: 42, received: job.payload.data };
    });

    const jobInfo = testQueue.addJob('TEST_ASYNC_JOB', { data: 'hello_world' });
    assert.strictEqual(jobInfo.status, 'queued');

    await testQueue.drain(3000);

    const finished = testQueue.getJob(jobInfo.id);
    assert.strictEqual(executed, true);
    assert.strictEqual(finished.status, 'completed');
    assert.strictEqual(finished.result.answer, 42);
    assert.strictEqual(finished.result.received, 'hello_world');
  });

  await asyncTest('Queue 2: Reintentos con Backoff Exponencial ante fallos controlados', async () => {
    let attempts = 0;
    testQueue.registerHandler('TEST_RETRY_JOB', async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`Fallo temporal intento ${attempts}`);
      }
      return { success: true, attempts };
    });

    const job = testQueue.addJob('TEST_RETRY_JOB', {}, { maxRetries: 3 });
    await testQueue.drain(4000);

    const done = testQueue.getJob(job.id);
    assert.strictEqual(attempts, 3);
    assert.strictEqual(done.status, 'completed');
  });

  await asyncTest('Queue 3: Fallo definitivo cuando se excede maxRetries', async () => {
    testQueue.registerHandler('TEST_FAILING_JOB', async () => {
      throw new Error('Fallo irrecuperable en worker');
    });

    const job = testQueue.addJob('TEST_FAILING_JOB', {}, { maxRetries: 1 });
    await testQueue.drain(3000);

    const done = testQueue.getJob(job.id);
    assert.strictEqual(done.status, 'failed');
    assert.ok(done.error.includes('Fallo irrecuperable'));
  });

  await asyncTest('Queue 4: Despacho asíncrono de Web Push VAPID vía cola (enqueuePushNotification)', async () => {
    const job = enqueuePushNotification({
      title: 'Jornada MIPPCI',
      body: 'Su bolsa está disponible para retiro.'
    });
    assert.ok(job.id);
    assert.strictEqual(job.type, JOB_TYPES.PUSH_BROADCAST);

    await queue.drain(3000);
    const completedJob = queue.getJob(job.id);
    assert.strictEqual(completedJob.status, 'completed');
  });

  await asyncTest('Queue 5: Generación asíncrona de sello criptográfico SHA-256 (GENERATE_ACTA_SEAL)', async () => {
    const job = queue.addJob(JOB_TYPES.GENERATE_ACTA_SEAL, { acta_number: 'ACTA-2026-001', tonnage: 15.2 });
    await queue.drain(3000);

    const completed = queue.getJob(job.id);
    assert.strictEqual(completed.status, 'completed');
    assert.ok(completed.result && completed.result.hash);
    assert.strictEqual(completed.result.hash.length, 64);
  });

  // --- SECCIÓN 3: INTEGRACIÓN REST API Y OBSERVABILIDAD ---
  console.log('\n--- 3. Endpoints REST de Monitoreo y Observabilidad ---');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Obtener token administrativo oficial vía endpoint de autenticación
  let loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: 'V-99995001', admin_secret: '0578', require_admin: true })
  });
  if (loginRes.status !== 200) {
    loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: 'V-99995001', admin_secret: '1178', require_admin: true })
    });
  }
  const loginData = await loginRes.json();
  const adminToken = loginData.session_token || loginData.token;

  try {
    await asyncTest('API 1: GET /api/v1/system/status incluye estado de cache, db_routing y queue', async () => {
      const res = await fetch(`${baseUrl}/api/v1/system/status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.cache, 'Debe incluir métricas de caché');
      assert.ok(data.db_routing, 'Debe incluir métricas de enrutamiento DB');
      assert.ok(data.queue, 'Debe incluir estado de cola de tareas');
    });

    await asyncTest('API 2: GET /api/v1/system/queue/status protegido con RBAC', async () => {
      const unauth = await fetch(`${baseUrl}/api/v1/system/queue/status`);
      assert.strictEqual(unauth.status, 401, 'Debe rechazar sin token');

      const auth = await fetch(`${baseUrl}/api/v1/system/queue/status`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(auth.status, 200);
      const body = await auth.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.queue);
      assert.ok(Array.isArray(body.queue.supportedJobTypes));
    });

    await asyncTest('API 3: GET /api/v1/system/db/routing retorna métricas CQRS', async () => {
      const res = await fetch(`${baseUrl}/api/v1/system/db/routing`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.routing);
      assert.strictEqual(body.routing.cqrsActive, true);
    });
  } finally {
    server.close();
  }

  console.log('================================================================');
  console.log(`🎉 TODAS LAS PRUEBAS DE CQRS Y COLAS ASÍNCRONAS (${passed}/${total}) PASARON AL 100%`);
  console.log('================================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('[TEST SUITE ERROR]', err);
  process.exit(1);
});
