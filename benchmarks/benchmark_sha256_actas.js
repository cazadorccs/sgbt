// benchmarks/benchmark_sha256_actas.js
// Benchmark estandarizado para Autoresearch - Medición de Criptografía de Actas (SHA-256 Batch)

const crypto = require('crypto');
const { generateSha256IntegritySeal, calculateAuditMetrics } = require('../backend/services/audit.service');

async function runActasBenchmark(batchSize = 10000) {
  console.log(`\n======================================================`);
  console.log(`🔬 AUTORESEARCH BENCHMARK: CRIPTOGRAFÍA DE ACTAS (SHA-256)`);
  console.log(`🔒 Función Hash: SHA-256 Canónico de Cierre`);
  console.log(`📦 Lote de prueba: ${batchSize} despachos para sellado`);
  console.log(`======================================================`);

  // 1. Sintetizar un lote representativo de 10,000 despachos con diversos métodos
  const deliveries = [];
  const methods = ['passkey_qr', 'passkey_nfc', 'nfc_card', 'supervisor_daily_qr', 'supervisor_override'];
  const baseTime = Date.now();

  for (let i = 0; i < batchSize; i++) {
    deliveries.push({
      id: `del-${i}-${baseTime}`,
      delivery_id: `del-${i}-${baseTime}`,
      worker_id: `w-${i % 2000}`,
      document_id: `V-${10000000 + (i % 2000)}`,
      weight_kg: 14.5,
      verification_method: methods[i % methods.length],
      is_offline_sync: i % 3 === 0 ? 1 : 0,
      delivered_at: new Date(baseTime + (i * 1000)).toISOString(),
      department_name: `Dirección General ${i % 15}`
    });
  }

  // 2. Medir cálculo de métricas de auditoría
  const tMetricsStart = process.hrtime.bigint();
  const metrics = calculateAuditMetrics(deliveries);
  const tMetricsEnd = process.hrtime.bigint();
  const metricsTimeMs = Number(tMetricsEnd - tMetricsStart) / 1_000_000;

  // 3. Medir generación de Sello Criptográfico SHA-256 en Lote (10,000 despachos)
  const runs = 20;
  const hashTimes = [];
  let baseHash = null;

  for (let r = 0; r < runs; r++) {
    const tHashStart = process.hrtime.bigint();
    const h = generateSha256IntegritySeal(deliveries);
    const tHashEnd = process.hrtime.bigint();
    hashTimes.push(Number(tHashEnd - tHashStart) / 1_000_000);
    if (!baseHash) baseHash = h;
  }

  const avgHashTimeMs = hashTimes.reduce((a, b) => a + b, 0) / runs;
  const itemsPerSec = Math.round((batchSize / (avgHashTimeMs / 1000)) * 100) / 100;

  // 4. Medir detección de adulteración / colisión
  const tamperedDeliveries = [...deliveries];
  // Adulterar un solo carácter en el medio del lote
  tamperedDeliveries[5000] = { ...tamperedDeliveries[5000], document_id: 'V-99999999' };
  const tamperedHash = generateSha256IntegritySeal(tamperedDeliveries);
  const tamperDetected = baseHash !== tamperedHash;

  // 5. Medir sellado completo de Acta Oficial Ministerial (JSON canónico + SHA-256)
  const actaDoc = {
    acta_number: 'ACTA-MINISTERIAL-BENCHMARK-001',
    metrics,
    deliveries_merkle_hash: baseHash,
    generated_at: new Date().toISOString()
  };

  const tActaStart = process.hrtime.bigint();
  const canonicalJson = JSON.stringify(actaDoc);
  const digitalActaSeal = crypto.createHash('sha256').update(canonicalJson).digest('hex');
  const tActaEnd = process.hrtime.bigint();
  const actaSealTimeMs = Number(tActaEnd - tActaStart) / 1_000_000;

  console.log(`⏱️  Tiempo Métricas Auditoría: ${metricsTimeMs.toFixed(2)} ms`);
  console.log(`⏱️  Tiempo Sello Lote SHA-256: ${avgHashTimeMs.toFixed(2)} ms (${batchSize} registros)`);
  console.log(`🚀 Throughput Sellado Lote:  ${itemsPerSec} despachos/seg`);
  console.log(`🔒 Sello SHA-256 Base:        ${baseHash.slice(0, 16)}...`);
  console.log(`🛡️  Detección de Adulteración: ${tamperDetected ? '100% Detectada (Sello Diferente)' : 'FALLO'}`);
  console.log(`📄 Sellado Canónico del Acta: ${actaSealTimeMs.toFixed(3)} ms -> ${digitalActaSeal.slice(0, 16)}...`);
  console.log(`📊 Conteo passkey_nfc:        ${metrics.methodCounts.passkey_nfc !== undefined ? `${metrics.methodCounts.passkey_nfc} registros` : 'NO SOPORTADO (FALLO)'}`);
  console.log(`======================================================\n`);

  return {
    batchSize,
    metricsTimeMs,
    avgHashTimeMs,
    itemsPerSec,
    tamperDetected,
    actaSealTimeMs,
    supportsPasskeyNfc: metrics.methodCounts.passkey_nfc !== undefined
  };
}

if (require.main === module) {
  runActasBenchmark(10000)
    .then(stats => {
      process.exit(stats.tamperDetected ? 0 : 1);
    })
    .catch(err => {
      console.error('Benchmark Error:', err);
      process.exit(1);
    });
}

module.exports = { runActasBenchmark };
