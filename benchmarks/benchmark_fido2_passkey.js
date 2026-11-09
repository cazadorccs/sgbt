// benchmarks/benchmark_fido2_passkey.js
// Benchmark estandarizado para Autoresearch - Medición de Latencia y Throughput en Verificación FIDO2 / Passkeys

const crypto = require('crypto');
const {
  generateP256KeyPair,
  signOfflinePayload,
  verifyOfflineSignature,
  generateNonce
} = require('../backend/crypto-utils');
const { db } = require('../backend/db');

async function runPasskeyBenchmark(iterations = 1000) {
  // Breve pausa para asegurar DB lista
  await new Promise(r => setTimeout(r, 300));

  console.log(`\n======================================================`);
  console.log(`🔬 AUTORESEARCH BENCHMARK: VERIFICACIÓN FIDO2 / PASSKEY`);
  console.log(`🔑 Criptografía: ECDSA P-256 (secp256r1 / SHA-256)`);
  console.log(`📦 Lote de prueba: ${iterations} firmas criptográficas reales`);
  console.log(`======================================================`);

  // 1. Preparar 5 pares de llaves reales ECDSA P-256 simulando 5 dispositivos de beneficiarios
  const keyPairs = [];
  for (let k = 0; k < 5; k++) {
    keyPairs.push(generateP256KeyPair());
  }

  // 2. Pre-generar 1,000 firmas biométricas legítimas y 100 firmas manipuladas (ataque de falsificación)
  const legitimatePayloads = [];
  const tamperedPayloads = [];

  for (let i = 0; i < iterations; i++) {
    const kp = keyPairs[i % keyPairs.length];
    const wid = `worker-${i % 50}`;
    const ent = `ent-${i}`;
    const ts = Math.floor(Date.now() / 1000) - (i % 60);
    const nonce = generateNonce(32);

    const sig = signOfflinePayload(kp.privateKey, { wid, ent, ts, nonce });

    legitimatePayloads.push({
      publicKeyPem: kp.publicKey,
      data: { wid, ent, ts, nonce },
      sig
    });

    if (i < 100) {
      // Firma adulterada (manipular el payload alterando el wid o nonce)
      tamperedPayloads.push({
        publicKeyPem: kp.publicKey,
        data: { wid: `${wid}-forged`, ent, ts, nonce },
        sig
      });
    }
  }

  // 3. Medición de rendimiento en Verificación de Firmas Legítimas
  const latencies = [];
  let validCount = 0;

  const tStart = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const item = legitimatePayloads[i];
    const itemStart = process.hrtime.bigint();
    const isValid = verifyOfflineSignature(item.publicKeyPem, item.data, item.sig);
    const itemEnd = process.hrtime.bigint();

    if (isValid) validCount++;
    latencies.push(Number(itemEnd - itemStart) / 1_000_000); // ms
  }
  const tEnd = process.hrtime.bigint();

  const totalTimeMs = Number(tEnd - tStart) / 1_000_000;
  const throughput = Math.round((iterations / (totalTimeMs / 1000)) * 100) / 100;

  latencies.sort((a, b) => a - b);
  const avgLatency = Math.round((totalTimeMs / iterations) * 1000) / 1000;
  const p50Latency = latencies[Math.floor(iterations * 0.50)];
  const p95Latency = latencies[Math.floor(iterations * 0.95)];
  const p99Latency = latencies[Math.floor(iterations * 0.99)];

  // 4. Medición de Detección y Rechazo Anti-Fraude (Firmas adulteradas)
  let rejectedCount = 0;
  const tTamperedStart = process.hrtime.bigint();
  for (const item of tamperedPayloads) {
    const isValid = verifyOfflineSignature(item.publicKeyPem, item.data, item.sig);
    if (!isValid) rejectedCount++;
  }
  const tTamperedEnd = process.hrtime.bigint();
  const tamperedTimeMs = Number(tTamperedEnd - tTamperedStart) / 1_000_000;

  console.log(`⏱️  Tiempo Total de Lote:   ${totalTimeMs.toFixed(2)} ms`);
  console.log(`🚀 Rendimiento (Throughput): ${throughput} verificaciones/seg`);
  console.log(`⚡ Latencia Media:          ${avgLatency} ms`);
  console.log(`📊 Latencia P50 / P95 / P99: ${p50Latency.toFixed(3)} ms / ${p95Latency.toFixed(3)} ms / ${p99Latency.toFixed(3)} ms`);
  console.log(`🛡️  Rechazo de Firmas Falsas: ${rejectedCount} / ${tamperedPayloads.length} detectadas en ${tamperedTimeMs.toFixed(2)} ms`);
  console.log(`✅ Precisión Criptográfica:  ${validCount === iterations && rejectedCount === tamperedPayloads.length ? '100% Exacta' : 'FALLO'}`);
  console.log(`======================================================\n`);

  return {
    iterations,
    totalTimeMs,
    throughput,
    avgLatency,
    p95Latency,
    p99Latency,
    allLegitValid: validCount === iterations,
    allTamperedRejected: rejectedCount === tamperedPayloads.length
  };
}

if (require.main === module) {
  runPasskeyBenchmark(1000)
    .then(stats => {
      process.exit(stats.allLegitValid && stats.allTamperedRejected ? 0 : 1);
    })
    .catch(err => {
      console.error('Benchmark Error:', err);
      process.exit(1);
    });
}

module.exports = { runPasskeyBenchmark };
