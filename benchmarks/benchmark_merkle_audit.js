// benchmarks/benchmark_merkle_audit.js
// Harness inmutable para evaluar la generación del Árbol Merkle, Pruebas de Inclusión y Detección de Fraude (Frente 10)

const { performance } = require('perf_hooks');
const { db } = require('../backend/db');
const auditService = require('../backend/services/audit.service');

function runMerkleAuditBenchmark() {
  console.log('================================================================');
  console.log('⚖️ BENCHMARK AUTORESEARCH: FRENTE 10 (ÁRBOL MERKLE MINISTERIAL)');
  console.log('================================================================\n');

  // 1. Obtener despachos reales de la base de datos o generar dataset canónico de 1,138 registros
  let deliveries = db.prepare(`
    SELECT d.id, d.entitlement_id, d.worker_id, w.document_id, w.full_name, d.delivered_at, 
           d.verification_method, d.signature_proof, d.is_offline_sync, c.name as combo_name, cb.weight_kg
    FROM deliveries d
    JOIN workers w ON d.worker_id = w.id
    LEFT JOIN daily_entitlements de ON d.entitlement_id = de.id
    LEFT JOIN combos c ON de.combo_id = c.id
    LEFT JOIN combos cb ON cb.id = c.id
    ORDER BY d.delivered_at ASC, d.id ASC
  `).all();

  // Si hay pocos despachos reales hoy, sintetizar lote completo de 1,138 despachos para benchmarking exhaustivo
  if (!deliveries || deliveries.length < 1000) {
    const allWorkers = db.prepare("SELECT id, document_id, full_name FROM workers WHERE status = 'active' LIMIT 1138").all();
    deliveries = allWorkers.map((w, i) => ({
      id: `deliv-mock-${w.id}`,
      entitlement_id: `ent-mock-${w.id}`,
      worker_id: w.id,
      document_id: w.document_id,
      full_name: w.full_name,
      delivered_at: new Date(1764201600000 + (i * 30000)).toISOString(),
      verification_method: (i % 3 === 0) ? 'passkey_qr' : ((i % 3 === 1) ? 'passkey_nfc' : 'nfc_card'),
      signature_proof: `SIG_P256_${i}_${w.document_id}`,
      is_offline_sync: i % 2,
      combo_name: 'Combo Integral de Víveres',
      weight_kg: 14.5
    }));
  }

  const N = deliveries.length;
  console.log(`[DATASET AUDITORÍA]: ${N} despachos canónicos listos para sellado criptográfico.\n`);

  // [1] CONSTRUCCIÓN DEL ÁRBOL MERKLE
  const tTree0 = performance.now();
  let merkleResult = null;
  if (typeof auditService.generateMerkleTree === 'function') {
    merkleResult = auditService.generateMerkleTree(deliveries);
  } else {
    // Si aún no está implementado
    const linearSeal = auditService.generateSha256IntegritySeal(deliveries);
    merkleResult = { root: linearSeal, leaves: [], layers: [] };
  }
  const tTree1 = performance.now();
  const buildTimeMs = tTree1 - tTree0;

  const isTrueMerkleTree = Boolean(merkleResult && merkleResult.layers && merkleResult.layers.length > 1);

  console.log(`[1] CONSTRUCCIÓN DEL ÁRBOL MERKLE:`);
  console.log(`    - Tiempo de Construcción : ${buildTimeMs.toFixed(3)} ms (${(1000 / buildTimeMs).toFixed(0)} ops/seg)`);
  console.log(`    - Merkle Root (Sello)    : ${merkleResult.root}`);
  console.log(`    - Profundidad del Árbol  : ${isTrueMerkleTree ? merkleResult.layers.length : '1 (Lineal)'}`);
  console.log(`    - Hojas Criptográficas   : ${merkleResult.leaves ? merkleResult.leaves.length : 0}`);
  console.log(`    - Estatus Merkle Real    : ${isTrueMerkleTree ? '✅ Árbol Binario RFC 6962' : '❌ Hash Lineal Antiguo'}\n`);

  // [2] GENERACIÓN Y VERIFICACIÓN DE PRUEBA DE INCLUSIÓN (MERKLE PROOF)
  const sampleIndex = Math.floor(N / 2);
  const sampleDelivery = deliveries[sampleIndex];

  let proofGenerationMs = 0;
  let proofVerificationMs = 0;
  let proofValid = false;
  let proofLength = 0;

  if (typeof auditService.generateMerkleProof === 'function' && typeof auditService.verifyMerkleProof === 'function') {
    const tP0 = performance.now();
    const proof = auditService.generateMerkleProof(deliveries, sampleIndex);
    const tP1 = performance.now();
    proofGenerationMs = tP1 - tP0;
    proofLength = proof ? proof.length : 0;

    const tV0 = performance.now();
    const leafHash = merkleResult.leaves[sampleIndex];
    proofValid = auditService.verifyMerkleProof(leafHash, proof, merkleResult.root);
    const tV1 = performance.now();
    proofVerificationMs = tV1 - tV0;
  }

  console.log(`[2] PRUEBA DE INCLUSIÓN CRIPTOGRÁFICA (MERKLE PROOF O(log N)):`);
  console.log(`    - Funcionario Muestra    : ${sampleDelivery.document_id} (${sampleDelivery.full_name})`);
  console.log(`    - Hashes en la Prueba    : ${proofLength} hashes (${(proofLength * 32)} bytes transferidos)`);
  console.log(`    - Tiempo Gen. Prueba     : ${(proofGenerationMs * 1000).toFixed(2)} µs`);
  console.log(`    - Tiempo Verif. Prueba   : ${(proofVerificationMs * 1000).toFixed(2)} µs`);
  console.log(`    - Verificación Exitosa   : ${proofValid ? '✅ VÁLIDA (Zero-Knowledge Inclusión)' : '❌ No soportado'}\n`);

  // [3] DETECCIÓN DE FRAUDE / ALTERACIÓN (TAMPER RESISTANCE)
  let tamperDetected = false;
  if (isTrueMerkleTree && typeof auditService.generateMerkleTree === 'function') {
    const tamperedDeliveries = JSON.parse(JSON.stringify(deliveries));
    // Alterar sutilmente 1 caracter en un hash de firma de una entrega
    tamperedDeliveries[sampleIndex].signature_proof += '_TAMPERED';
    const tamperedResult = auditService.generateMerkleTree(tamperedDeliveries);

    if (tamperedResult.root !== merkleResult.root) {
      tamperDetected = true;
    }
  }

  console.log(`[3] DETECCIÓN DE FRAUDE Y RESISTENCIA A COLISIONES:`);
  console.log(`    - Alteración Detectada   : ${tamperDetected ? '✅ 100% Detectada (Root Mutado)' : '❌ Fallo'}\n`);

  // [4] SCALAR OBJECTIVE FUNCTION PARA AUTORESEARCH (Menor es mejor)
  // Penaliza tiempo de construcción + tiempo de verificación + falta de árbol/pruebas
  const compositeScore = (buildTimeMs * 5) + (proofVerificationMs * 20) + 
                         (isTrueMerkleTree ? 0 : 300) + 
                         (proofValid ? 0 : 300) + 
                         (tamperDetected ? 0 : 400);

  console.log('================================================================');
  console.log(`🏆 RESUMEN DE PUNTUACIÓN (SCALAR OBJECTIVE FUNCTION):`);
  console.log(`   val_build_time_ms     : ${buildTimeMs.toFixed(3)} ms`);
  console.log(`   val_proof_verif_us    : ${(proofVerificationMs * 1000).toFixed(2)} µs`);
  console.log(`   val_merkle_tree       : ${isTrueMerkleTree ? 'YES' : 'NO'}`);
  console.log(`   val_proof_valid       : ${proofValid ? 'YES' : 'NO'}`);
  console.log(`   val_tamper_detected   : ${tamperDetected ? 'YES' : 'NO'}`);
  console.log(`   val_composite_score   : ${compositeScore.toFixed(2)} (Menor es mejor)`);
  console.log('================================================================\n');

  return {
    buildTimeMs,
    proofVerificationMs,
    isTrueMerkleTree,
    proofValid,
    tamperDetected,
    compositeScore
  };
}

if (require.main === module) {
  runMerkleAuditBenchmark();
}

module.exports = { runMerkleAuditBenchmark };

