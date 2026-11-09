// benchmarks/benchmark_supabase_cold_start.js
// Harness inmutable para evaluar el Cold-Start y la Hidratación Asíncrona de Supabase (Frente 8/9)

const { performance } = require('perf_hooks');

async function runColdStartBenchmark() {
  console.log('================================================================');
  console.log('⚡ BENCHMARK AUTORESEARCH: COLD-START INSTANTÁNEO & STREAMING DB');
  console.log('================================================================\n');

  // Medir tiempo de evaluación de módulo y disponibilidad de readyPromise
  const t0 = performance.now();
  const dbModule = require('../backend/db');
  const tModuleLoaded = performance.now();

  const isReady = await dbModule.readyPromise;
  const tReady = performance.now();

  const moduleLoadMs = tModuleLoaded - t0;
  const readyPromiseMs = tReady - t0;

  console.log(`[1] TIEMPO DE COLD START A READY:`);
  console.log(`    - Carga de Módulo DB : ${moduleLoadMs.toFixed(2)} ms`);
  console.log(`    - Resuelve readyPromise: ${readyPromiseMs.toFixed(2)} ms`);
  console.log(`    - Estatus Base Datos : ${isReady ? '✅ Operativa' : '❌ Error'}\n`);

  // Verificar que la base de datos ya puede responder consultas inmediatamente
  const tQuery0 = performance.now();
  const workerCount = dbModule.db.prepare("SELECT count(1) as c FROM workers WHERE status = 'active'").get().c;
  const comboCount = dbModule.db.prepare("SELECT count(1) as c FROM combos WHERE is_active = 1").get().c;
  const tQuery1 = performance.now();
  const firstQueryMs = tQuery1 - tQuery0;

  console.log(`[2] PRIMERA CONSULTA INMEDIATA (Post-Ready):`);
  console.log(`    - Funcionarios Activos: ${workerCount}`);
  console.log(`    - Combos Disponibles  : ${comboCount}`);
  console.log(`    - Latencia Consulta   : ${firstQueryMs.toFixed(2)} ms\n`);

  // Medir latencia de simulación de primer request HTTP (/api/v1/system/status)
  const tReq0 = performance.now();
  let statusResponse = null;
  const mockReq = {};
  const mockRes = {
    json: (data) => { statusResponse = data; }
  };

  const systemRoutes = require('../backend/routes/system.routes');
  // Buscar el handler de /status
  const statusLayer = systemRoutes.stack.find(s => s.route && s.route.path === '/status');
  if (statusLayer && statusLayer.route.stack[0]) {
    statusLayer.route.stack[0].handle(mockReq, mockRes);
  }
  const tReq1 = performance.now();
  const firstReqMs = tReq1 - tReq0;

  console.log(`[3] SIMULACIÓN PRIMER REQUEST API (/api/v1/system/status):`);
  console.log(`    - Latencia Primer Req : ${firstReqMs.toFixed(2)} ms`);
  console.log(`    - Motor Reportado     : ${statusResponse ? statusResponse.database : 'N/A'}\n`);

  // Objetivo escalar: cold_start_ms (Menor es mejor)
  const isColdStartInstant = readyPromiseMs <= 100;
  const compositeScore = readyPromiseMs + (firstReqMs * 2) + (isColdStartInstant ? 0 : 500);

  console.log('================================================================');
  console.log(`🏆 RESUMEN DE PUNTUACIÓN (SCALAR OBJECTIVE FUNCTION):`);
  console.log(`   val_ready_promise_ms  : ${readyPromiseMs.toFixed(2)} ms`);
  console.log(`   val_first_query_ms    : ${firstQueryMs.toFixed(2)} ms`);
  console.log(`   val_first_request_ms  : ${firstReqMs.toFixed(2)} ms`);
  console.log(`   val_under_100ms       : ${isColdStartInstant ? 'YES' : 'NO'}`);
  console.log(`   val_composite_score   : ${compositeScore.toFixed(2)} (Menor es mejor)`);
  console.log('================================================================\n');

  return {
    readyPromiseMs,
    firstQueryMs,
    firstReqMs,
    isColdStartInstant,
    compositeScore
  };
}

if (require.main === module) {
  runColdStartBenchmark().catch(console.error);
}

module.exports = { runColdStartBenchmark };
