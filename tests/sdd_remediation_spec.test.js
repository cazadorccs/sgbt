// tests/sdd_remediation_spec.test.js
// Verificación Automatizada del Plan de Remediación SDD (Spec-Driven Development)
// SGBT MIPPCI - DevSecOps

const assert = require('assert');
const { db } = require('../backend/db');
const { assertWorkerCanClaim } = require('../backend/services/passkey.service');
const { recordDelivery, voidDelivery, validateClockSkew } = require('../backend/services/delivery.service');

async function runSddTests() {
  console.log('================================================================');
  console.log('📐 VERIFICACIÓN DE INVARIANTES Y REMEDIACIÓN SDD (SPEC-DRIVEN)');
  console.log('================================================================');

  // 1. Invariante 1: Validación de Clock Skew (Desfase de tiempo máximo)
  const okTime = new Date().toISOString();
  const skewOk = validateClockSkew(okTime);
  assert.strictEqual(skewOk.valid, true, 'Hora actual debe ser válida');

  const oldTime = new Date(Date.now() - 10 * 3600 * 1000).toISOString(); // 10 horas atrás
  const skewFail = validateClockSkew(oldTime);
  assert.strictEqual(skewFail.valid, false, 'Hora desfasada debe ser rechazada');
  assert.ok(skewFail.reason.includes('Desfase temporal excesivo'), 'Debe alertar clock skew');
  console.log('  ✅ SDD-01: Protección de Clock Skew (Rechazo de dispositivos con desfase > 4h)');

  // 2. Invariante 2: Invariante puro de trabajador assertWorkerCanClaim
  const worker = db.prepare("SELECT id FROM workers WHERE document_id = 'V-18456123'").get();
  assert.ok(worker, 'Trabajador de prueba debe existir');
  const claimCheck = assertWorkerCanClaim(worker.id);
  assert.strictEqual(claimCheck.canClaim, true);
  assert.strictEqual(claimCheck.worker.document_id, 'V-18456123');

  const invalidCheck = assertWorkerCanClaim('00000000-0000-0000-0000-000000000000');
  assert.strictEqual(invalidCheck.canClaim, false);
  console.log('  ✅ SDD-02: Centralización de invariante de nómina pura (assertWorkerCanClaim)');

  // 3. Invariante 3: Flujo de Anulación Inmediata (Void Delivery)
  // Crear una entrega de prueba
  const testEntitlementId = 'ent-sdd-test-' + Date.now();
  const testDeliveryId = 'del-sdd-test-' + Date.now();

  try {
    db.prepare(`
      INSERT OR REPLACE INTO daily_entitlements (id, worker_id, combo_id, valid_date, status)
      VALUES (?, ?, (SELECT id FROM combos LIMIT 1), date('now'), 'claimed')
    `).run(testEntitlementId, worker.id);

    const recResult = recordDelivery({
      deliveryId: testDeliveryId,
      entitlementId: testEntitlementId,
      workerId: worker.id,
      verificationMethod: 'supervisor_override',
      supervisorId: worker.id,
      overrideReason: 'Prueba de anulación SDD'
    });
    assert.strictEqual(recResult.success, true, 'La entrega de prueba debe registrarse');

    // Ahora anular la entrega
    const voidResult = voidDelivery({
      deliveryId: testDeliveryId,
      supervisorId: worker.id,
      reason: 'Corrección de error de mesa de despacho'
    });
    assert.strictEqual(voidResult.success, true, 'La anulación debe ser exitosa');

    // Verificar que la asignación volvió a 'pending'
    const restoredEnt = db.prepare('SELECT status FROM daily_entitlements WHERE id = ?').get(testEntitlementId);
    assert.strictEqual(restoredEnt.status, 'pending', 'El estatus debe retornar a pending');

    // Verificar que el registro en deliveries fue eliminado
    const deletedDel = db.prepare('SELECT id FROM deliveries WHERE id = ?').get(testDeliveryId);
    assert.strictEqual(deletedDel, undefined, 'El despacho debe haber sido eliminado');

    console.log('  ✅ SDD-03: Anulación reversible de despacho y restauración de asignación (voidDelivery)');
  } finally {
    // Limpieza de datos de prueba
    db.prepare('DELETE FROM deliveries WHERE id = ?').run(testDeliveryId);
    db.prepare('DELETE FROM daily_entitlements WHERE id = ?').run(testEntitlementId);
  }

  console.log('================================================================');
  console.log('🎉 TODAS LAS REGLAS DE REMEDIACIÓN SDD (3/3) PASARON AL 100%');
  console.log('================================================================');
}

if (require.main === module) {
  runSddTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error en pruebas SDD:', err);
      process.exit(1);
    });
}

module.exports = { runSddTests };
