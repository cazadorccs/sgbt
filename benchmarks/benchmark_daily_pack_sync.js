// benchmarks/benchmark_daily_pack_sync.js
// Harness inmutable para evaluar la generación, latencia y tamaño del paquete diario (Frente 7)

const { db } = require('../backend/db');
const zlib = require('zlib');
const syncController = require('../backend/controllers/sync.controller');

function runDailyPackBenchmark() {
  console.log('================================================================');
  console.log('⚡ BENCHMARK AUTORESEARCH: FRENTE 7 (DELTA DAILY-PACKS & SYNC)');
  console.log('================================================================\n');

  // 1. Llamada inicial (Cold call)
  const coldReq = { query: {}, headers: {} };
  let coldJson = null;
  let coldHeaders = {};
  let coldStatus = 200;

  const coldRes = {
    setHeader: (k, v) => { coldHeaders[k.toLowerCase()] = v; },
    status: (s) => { coldStatus = s; return coldRes; },
    json: (data) => { coldJson = data; },
    send: (data) => { coldJson = data; }
  };

  const tCold0 = performance.now();
  syncController.getDailyPack(coldReq, coldRes);
  const tCold1 = performance.now();
  const coldLatencyMs = tCold1 - tCold0;

  const rawJson = JSON.stringify(coldJson);
  const rawBytes = Buffer.byteLength(rawJson, 'utf8');
  const gzipBytes = zlib.gzipSync(rawJson).length;
  const brotliBytes = zlib.brotliCompressSync(rawJson).length;

  console.log(`[1] COLD RUN (Generación Inicial):`);
  console.log(`    - Latencia Inicial    : ${coldLatencyMs.toFixed(2)} ms`);
  console.log(`    - Funcionarios        : ${coldJson.total_workers || (coldJson.active_workers && coldJson.active_workers.length)}`);
  console.log(`    - Combos              : ${coldJson.combos ? coldJson.combos.length : 0}`);
  console.log(`    - Tamaño Raw JSON     : ${(rawBytes / 1024).toFixed(2)} KB (${rawBytes} bytes)`);
  console.log(`    - Tamaño Gzip         : ${(gzipBytes / 1024).toFixed(2)} KB`);
  console.log(`    - Tamaño Brotli       : ${(brotliBytes / 1024).toFixed(2)} KB`);
  console.log(`    - Compresión Brotli   : ${((1 - brotliBytes / rawBytes) * 100).toFixed(1)}%\n`);

  // 2. Ráfaga de peticiones calientes (50 iteraciones para medir latencia sostenida y CPU)
  const WARM_ITERATIONS = 50;
  const warmLatencies = [];

  for (let i = 0; i < WARM_ITERATIONS; i++) {
    const warmReq = { query: {}, headers: {} };
    let warmJson = null;
    let warmHeaders = {};
    const warmRes = {
      setHeader: (k, v) => { warmHeaders[k.toLowerCase()] = v; },
      status: (s) => warmRes,
      json: (data) => { warmJson = data; },
      send: (data) => { warmJson = data; }
    };

    const t0 = performance.now();
    syncController.getDailyPack(warmReq, warmRes);
    const t1 = performance.now();
    warmLatencies.push(t1 - t0);
  }

  const avgHotLatencyMs = warmLatencies.reduce((a, b) => a + b, 0) / warmLatencies.length;
  const minHotLatencyMs = Math.min(...warmLatencies);
  const maxHotLatencyMs = Math.max(...warmLatencies);
  const throughputOpsPerSec = 1000 / avgHotLatencyMs;

  console.log(`[2] HOT RUN (${WARM_ITERATIONS} iteraciones sostenidas):`);
  console.log(`    - Latencia Promedio   : ${avgHotLatencyMs.toFixed(2)} ms`);
  console.log(`    - Latencia Mínima     : ${minHotLatencyMs.toFixed(2)} ms`);
  console.log(`    - Latencia Máxima     : ${maxHotLatencyMs.toFixed(2)} ms`);
  console.log(`    - Throughput Estimado : ${throughputOpsPerSec.toFixed(1)} req/seg\n`);

  // 3. Verificación de ETag y HTTP 304 Not Modified
  const etag = coldHeaders['etag'] || null;
  let notModifiedPassed = false;
  let etagLatencyMs = 0;

  if (etag) {
    const etagReq = {
      query: {},
      headers: { 'if-none-match': etag }
    };
    let etagStatus = 200;
    const etagRes = {
      setHeader: () => {},
      status: (s) => { etagStatus = s; return etagRes; },
      end: () => {},
      json: () => {}
    };

    const tE0 = performance.now();
    syncController.getDailyPack(etagReq, etagRes);
    const tE1 = performance.now();
    etagLatencyMs = tE1 - tE0;

    if (etagStatus === 304) {
      notModifiedPassed = true;
    }
  }

  console.log(`[3] VERIFICACIÓN ETAG / HTTP 304:`);
  console.log(`    - ETag Emitido        : ${etag || 'NO DISPONIBLE'}`);
  console.log(`    - Soporte HTTP 304    : ${notModifiedPassed ? '✅ Soportado (0 bytes wire)' : '❌ No implementado'}`);
  if (notModifiedPassed) {
    console.log(`    - Latencia ETag 304   : ${etagLatencyMs.toFixed(2)} ms`);
  }
  console.log('');

  // 4. Verificación de Sincronización Delta (?since=...)
  const deltaReq = {
    query: { since: new Date(Date.now() - 3600000).toISOString() }, // 1 hora atrás
    headers: {}
  };
  let deltaJson = null;
  const deltaRes = {
    setHeader: () => {},
    status: () => deltaRes,
    json: (d) => { deltaJson = d; }
  };

  const tD0 = performance.now();
  syncController.getDailyPack(deltaReq, deltaRes);
  const tD1 = performance.now();
  const deltaLatencyMs = tD1 - tD0;

  let deltaSupported = false;
  let deltaBytes = 0;
  if (deltaJson && (deltaJson.is_delta === true || deltaJson.delta === true)) {
    deltaSupported = true;
    deltaBytes = Buffer.byteLength(JSON.stringify(deltaJson), 'utf8');
  }

  console.log(`[4] SOPORTE DELTA-PACK (?since=ISO_DATE):`);
  console.log(`    - Sincronización Delta: ${deltaSupported ? '✅ Activa' : '❌ No implementada (Retorna paquete completo)'}`);
  if (deltaSupported) {
    console.log(`    - Tamaño Delta Payload: ${(deltaBytes / 1024).toFixed(2)} KB`);
    console.log(`    - Latencia Delta      : ${deltaLatencyMs.toFixed(2)} ms`);
  }
  console.log('');

  // 5. Cómputo del Scalar Metric para Autoresearch (Lower is better)
  // Penaliza latencia caliente (ms) + tamaño de transferencia esperado (KB)
  const effectivePayloadKb = notModifiedPassed ? (brotliBytes / 1024) * 0.2 : (rawBytes / 1024);
  const compositeScore = (avgHotLatencyMs * 1.5) + (effectivePayloadKb * 0.8) + (notModifiedPassed ? 0 : 50) + (deltaSupported ? 0 : 50);

  console.log('================================================================');
  console.log(`🏆 RESUMEN DE PUNTUACIÓN (SCALAR OBJECTIVE FUNCTION):`);
  console.log(`   val_latency_ms       : ${avgHotLatencyMs.toFixed(2)} ms`);
  console.log(`   val_raw_kb           : ${(rawBytes / 1024).toFixed(2)} KB`);
  console.log(`   val_brotli_kb        : ${(brotliBytes / 1024).toFixed(2)} KB`);
  console.log(`   val_etag_supported   : ${notModifiedPassed ? 'YES' : 'NO'}`);
  console.log(`   val_delta_supported  : ${deltaSupported ? 'YES' : 'NO'}`);
  console.log(`   val_composite_score  : ${compositeScore.toFixed(2)} (Menor es mejor)`);
  console.log('================================================================\n');

  return {
    coldLatencyMs,
    avgHotLatencyMs,
    rawBytes,
    brotliBytes,
    notModifiedPassed,
    deltaSupported,
    compositeScore
  };
}

if (require.main === module) {
  runDailyPackBenchmark();
}

module.exports = { runDailyPackBenchmark };

