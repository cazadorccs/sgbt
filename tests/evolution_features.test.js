// tests/evolution_features.test.js
// Suite de Verificación de las 3 Carencias Evolutivas Implementadas:
// 1. Auto-Verificación Merkle en Carnet del Beneficiario (/api/v1/auth/my-merkle-proof)
// 2. Web Push Notifications en Segundo Plano con VAPID (/api/v1/notifications/vapid-public-key & subscribe)
// 3. Pipeline de Empaquetado APK Android Nativo (scripts/package_android_apk.js)

const assert = require('assert');
const { db } = require('../backend/db');
const pushService = require('../backend/services/push.service');
const auditService = require('../backend/services/audit.service');
const { execSync } = require('child_process');

console.log('================================================================');
console.log('🧪 PRUEBAS UNITARIAS Y DE INTEGRACIÓN: NUEVAS FUNCIONALIDADES');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// ============================================================================
// BLOQUE 1: AUTO-VERIFICACIÓN MERKLE PARA EL BENEFICIARIO
// ============================================================================
console.log('--- 1. Auto-Verificación Merkle en Carnet del Beneficiario ---');

runTest('Generación y verificación de Merkle Proof para beneficiario', () => {
  const deliveries = db.prepare(`
    SELECT d.id, d.entitlement_id, d.worker_id, w.document_id, w.full_name, d.delivered_at, 
           d.verification_method, d.signature_proof, d.is_offline_sync, c.name as combo_name, cb.weight_kg
    FROM deliveries d
    JOIN workers w ON d.worker_id = w.id
    LEFT JOIN daily_entitlements de ON d.entitlement_id = de.id
    LEFT JOIN combos c ON de.combo_id = c.id
    LEFT JOIN combos cb ON cb.id = c.id
    ORDER BY d.delivered_at ASC, d.id ASC
  `).all();

  assert(deliveries.length > 0, 'Debe haber entregas registradas en la base de datos');

  const tree = auditService.generateMerkleTree(deliveries);
  assert(tree.root && tree.root.length === 64, 'La raíz de Merkle debe ser un hash SHA-256 de 64 caracteres hex');

  // Elegir una entrega objetivo
  const target = deliveries[0];
  const proof = auditService.generateMerkleProof(deliveries, target.id);
  assert(Array.isArray(proof), 'La prueba Merkle debe ser un array de hashes hermanos');
  assert(proof.length > 0, 'La prueba debe contener al menos un paso logarítmico');

  const leafHash = auditService.hashDeliveryLeaf(target);
  const isValid = auditService.verifyMerkleProof(leafHash, proof, tree.root);
  assert.strictEqual(isValid, true, 'La prueba de inclusión Merkle Proof debe verificar al 100% contra tree.root');

  // Verificar que una hoja alterada es rechazada
  const fakeLeaf = 'a'.repeat(64);
  const isFakeValid = auditService.verifyMerkleProof(fakeLeaf, proof, tree.root);
  assert.strictEqual(isFakeValid, false, 'Una entrega alterada o falsa debe ser rechazada inmediatamente');
});

runTest('Controlador getMyMerkleProof responde con estructura estándar RFC 6962', () => {
  const authController = require('../backend/controllers/auth.controller');
  assert.strictEqual(typeof authController.getMyMerkleProof, 'function', 'authController.getMyMerkleProof debe ser una función');

  // Simular mock de request y response
  const worker = db.prepare("SELECT w.id, w.document_id FROM workers w JOIN deliveries d ON d.worker_id = w.id LIMIT 1").get();
  assert(worker, 'Debe existir un trabajador con entregas');

  const mockReq = {
    user: { id: worker.id, document_id: worker.document_id },
    query: {}
  };

  let responseData = null;
  let statusCode = 200;

  const mockRes = {
    status: (code) => { statusCode = code; return mockRes; },
    json: (data) => { responseData = data; return mockRes; }
  };

  authController.getMyMerkleProof(mockReq, mockRes);

  assert.strictEqual(statusCode, 200, 'Debe retornar HTTP 200');
  assert.strictEqual(responseData.success, true, 'Debe indicar success: true');
  assert.strictEqual(responseData.verified, true, 'Debe certificar verified: true');
  assert(responseData.merkle_root, 'Debe incluir merkle_root');
  assert(responseData.leaf_hash, 'Debe incluir leaf_hash');
  assert(responseData.proof_length >= 0, 'Debe incluir proof_length');
  assert.strictEqual(responseData.standard, 'RFC 6962 / SHA-256 Binary Merkle Tree');
});

// ============================================================================
// BLOQUE 2: WEB PUSH NOTIFICATIONS EN SEGUNDO PLANO (VAPID)
// ============================================================================
console.log('\n--- 2. Web Push Notifications en Segundo Plano con VAPID ---');

runTest('Generación de Clave Pública VAPID válida P-256', () => {
  const pubKey = pushService.getVapidPublicKey();
  assert(pubKey && typeof pubKey === 'string', 'La clave pública VAPID debe ser un string');
  assert(pubKey.length >= 64, 'La clave pública VAPID debe tener longitud mínima de punto EC P-256');
});

runTest('Registro y persistencia de suscripciones Web Push en base de datos', () => {
  const testEndpoint = `https://fcm.googleapis.com/fcm/send/test_${Date.now()}`;
  const mockSub = {
    endpoint: testEndpoint,
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcDnVuIxSbZZe068GzS8_bTzT_D_TEST',
      auth: '5K3yAuthSecretTest123'
    }
  };

  const realWorker = db.prepare("SELECT id FROM workers LIMIT 1").get();
  const workerId = realWorker ? realWorker.id : null;

  // Guardar suscripción
  const res = pushService.saveSubscription(mockSub, workerId, 'Mozilla/5.0 Android');
  assert.strictEqual(res.success, true);

  // Verificar en base de datos
  const saved = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(testEndpoint);
  assert(saved, 'La suscripción debe existir en la tabla push_subscriptions');
  assert.strictEqual(saved.worker_id, workerId);
  assert.strictEqual(saved.auth, mockSub.keys.auth);

  // Eliminar suscripción
  const removed = pushService.removeSubscription(testEndpoint);
  assert.strictEqual(removed, true, 'Debe confirmar la eliminación de la suscripción');

  const checkAfter = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(testEndpoint);
  assert(!checkAfter, 'La suscripción debe haber sido removida');
});

runTest('Despacho de alerta Push a suscripciones mock', async () => {
  const realWorker = db.prepare("SELECT id FROM workers LIMIT 1").get();
  const workerId = realWorker ? realWorker.id : null;
  const mockEndpoint = `mock://push-service.local/sub_${Date.now()}`;
  pushService.saveSubscription({
    endpoint: mockEndpoint,
    keys: { p256dh: 'mock-p256', auth: 'mock-auth' }
  }, workerId);

  const dispatchRes = await pushService.dispatchPushNotification({
    title: 'Prueba Unitaria Push',
    body: 'Mensaje de prueba de notificación'
  });

  assert(dispatchRes.total >= 1, 'Debe detectar al menos una suscripción');
  assert(dispatchRes.sent >= 1, 'Debe registrar el envío satisfactorio a endpoints mock');

  // Limpieza
  pushService.removeSubscription(mockEndpoint);
});

// ============================================================================
// BLOQUE 3: PIPELINE DE EMPAQUETADO ANDROID APK
// ============================================================================
console.log('\n--- 3. Pipeline de Empaquetado APK Android Nativo ---');

runTest('Ejecución sin errores del pipeline scripts/package_android_apk.js', () => {
  const output = execSync('node scripts/package_android_apk.js', { stdio: 'pipe' }).toString();
  assert(output.includes('PIPELINE DE EMPAQUETADO ANDROID'), 'Debe ejecutar la cabecera del pipeline');
  assert(output.includes('Proyecto Gradle nativo generado con éxito'), 'Debe generar el andamiaje Android Gradle');
  assert(output.includes('build/android'), 'Debe referenciar el directorio de compilación build/android');
});

console.log('\n================================================================');
console.log(`📊 BALANCE DE PRUEBAS DE LAS NUEVAS FUNCIONALIDADES:`);
console.log(`   Total Pruebas : ${totalTests}`);
console.log(`   Exitosas      : ${passedTests}`);
console.log(`   Fallidas      : ${totalTests - passedTests}`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 TODAS LAS PRUEBAS DE EVOLUCIÓN (6/6) PASARON AL 100%');
  process.exit(0);
} else {
  process.exit(1);
}
