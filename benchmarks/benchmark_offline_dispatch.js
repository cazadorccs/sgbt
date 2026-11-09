// benchmarks/benchmark_offline_dispatch.js
// Benchmark estandarizado para Autoresearch - Medición de TPS en Despacho Masivo Offline (SQLite WAL)

const crypto = require('crypto');
const { db } = require('../backend/db');
const { processBatchDeliveries } = require('../backend/services/delivery.service');

async function runBenchmark(iterations = 1000) {
  // Esperar a que la DB esté lista si hay inicialización asíncrona
  await new Promise(r => setTimeout(r, 500));

  console.log(`\n======================================================`);
  console.log(`🔬 AUTORESEARCH BENCHMARK: DESPACHO MASIVO OFFLINE`);
  console.log(`📦 Lote de prueba: ${iterations} entregas simuladas`);
  console.log(`======================================================`);

  // 1. Obtener o crear datos base
  let point = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
  if (!point) {
    point = { id: crypto.randomUUID() };
    db.prepare("INSERT INTO distribution_points (id, name, location) VALUES (?, 'Punto Benchmark', 'Sede Central')").run(point.id);
  }

  let combo = db.prepare("SELECT id FROM combos LIMIT 1").get();
  if (!combo) {
    combo = { id: crypto.randomUUID() };
    db.prepare("INSERT INTO combos (id, name, description) VALUES (?, 'Combo Benchmark', 'Combo de Prueba')").run(combo.id);
  }

  let op = db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
  if (!op) {
    op = { id: crypto.randomUUID() };
    db.prepare("INSERT INTO workers (id, document_id, full_name, email, role) VALUES (?, 'V-BENCH-OP', 'Operador Benchmark', 'op@bench.gov.ve', 'operator')").run(op.id);
  }

  // 2. Generar 1,000 asignaciones y beneficiarios de prueba en una transacción rápida
  const testWorkerIds = [];
  const testEntitlementIds = [];
  const testBatch = [];

  const setupTx = db.transaction(() => {
    const insertWorker = db.prepare(`
      INSERT OR IGNORE INTO workers (id, document_id, full_name, email, role)
      VALUES (?, ?, ?, ?, 'worker')
    `);
    const insertEntitlement = db.prepare(`
      INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);

    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < iterations; i++) {
      const wId = `bench-worker-${i}-${Date.now()}`;
      const entId = `bench-ent-${i}-${Date.now()}`;
      testWorkerIds.push(wId);
      testEntitlementIds.push(entId);

      insertWorker.run(wId, `V-BENCH-${i}-${Date.now()}`, `Beneficiario Bench ${i}`, `bench${i}_${Date.now()}@test.ve`);
      insertEntitlement.run(entId, wId, combo.id, today);

      testBatch.push({
        id: `bench-del-${i}-${Date.now()}`,
        entitlement_id: entId,
        worker_id: wId,
        distribution_point_id: point.id,
        delivered_by_user_id: op.id,
        verification_method: 'passkey_qr',
        signature_proof: 'MEYCIQDxTEST_BENCHMARK_SIGNATURE_OK',
        challenge_nonce: 'nonce_bench_123',
        delivered_at: new Date().toISOString(),
        is_offline_sync: true
      });
    }
  });

  setupTx();

  // 3. Medición precisa de la ejecución del lote masivo (Sync Batch)
  const startTime = process.hrtime.bigint();
  const result = processBatchDeliveries(testBatch, point.id);
  const endTime = process.hrtime.bigint();

  const durationNs = Number(endTime - startTime);
  const durationMs = durationNs / 1_000_000;
  const tps = Math.round((iterations / (durationMs / 1000)) * 100) / 100;
  const avgLatencyPerItem = Math.round((durationMs / iterations) * 1000) / 1000;

  // 4. Verificación de Idempotencia y Anti-Fraude (Intentar registrar el mismo lote)
  const idempStart = process.hrtime.bigint();
  const idempResult = processBatchDeliveries(testBatch, point.id);
  const idempEnd = process.hrtime.bigint();
  const idempMs = Number(idempEnd - idempStart) / 1_000_000;

  // 5. Limpieza de datos del benchmark
  const cleanupTx = db.transaction(() => {
    const delDelivery = db.prepare("DELETE FROM deliveries WHERE id = ?");
    const delEnt = db.prepare("DELETE FROM daily_entitlements WHERE id = ?");
    const delWorker = db.prepare("DELETE FROM workers WHERE id = ?");
    const delOutbox = db.prepare("DELETE FROM outbox_events WHERE aggregate_id = ?");

    for (let i = 0; i < iterations; i++) {
      delDelivery.run(testBatch[i].id);
      delEnt.run(testEntitlementIds[i]);
      delWorker.run(testWorkerIds[i]);
      delOutbox.run(testBatch[i].id);
    }
  });
  cleanupTx();

  console.log(`⏱️  Tiempo Total de Lote:   ${durationMs.toFixed(2)} ms`);
  console.log(`🚀 Rendimiento (Throughput): ${tps} despachos/segundo (TPS)`);
  console.log(`⚡ Latencia Media / Ítem:   ${avgLatencyPerItem} ms`);
  console.log(`🛡️  Idempotencia (Duplicados): ${idempResult.failed_duplicates} / ${iterations} prevenidos en ${idempMs.toFixed(2)} ms`);
  console.log(`✅ Integridad Transaccional: ${result.processed === iterations ? '100% Correcta' : 'FALLO'}`);
  console.log(`======================================================\n`);

  return {
    iterations,
    durationMs,
    tps,
    avgLatencyPerItem,
    idempMs,
    allProcessed: result.processed === iterations,
    duplicatesPrevented: idempResult.failed_duplicates === iterations
  };
}

if (require.main === module) {
  runBenchmark(1000)
    .then(stats => {
      process.exit(stats.allProcessed && stats.duplicatesPrevented ? 0 : 1);
    })
    .catch(err => {
      console.error('Benchmark Error:', err);
      process.exit(1);
    });
}

module.exports = { runBenchmark };
