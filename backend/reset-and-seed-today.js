// backend/reset-and-seed-today.js
const crypto = require('crypto');
const { db } = require('./db');

function resetDeliveriesAndSeedToday() {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Eliminar entregas previas (llevar a 0)
  const delResult = db.prepare('DELETE FROM deliveries').run();
  
  // 2. Localizar los combos canónicos de la jornada (Víveres y Proteína)
  const vCombo = db.prepare("SELECT id, name FROM combos WHERE category IN ('bolsa_viveres') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get();
  const pCombo = db.prepare("SELECT id, name FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();
  
  const vComboId = vCombo ? vCombo.id : 'c1a2b3c4-1111-2222-3333-444455556666';
  const pComboId = pCombo ? pCombo.id : 'ae65fee7-79f6-48a3-bc41-a61c928876b5';

  // 3. Obtener todos los trabajadores activos
  const allActive = db.prepare("SELECT id FROM workers WHERE status = 'active'").all();

  const insEnt = db.prepare(`
    INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  let createdCount = 0;
  const tx = db.transaction(() => {
    for (const w of allActive) {
      const r1 = insEnt.run(crypto.randomUUID(), w.id, vComboId, today, 'estacion_1');
      if (r1.changes > 0) createdCount++;
      const r2 = insEnt.run(crypto.randomUUID(), w.id, pComboId, today, 'estacion_2');
      if (r2.changes > 0) createdCount++;
    }
    // Reiniciar cualquier derecho de hoy a status = 'pending'
    db.prepare("UPDATE daily_entitlements SET status = 'pending' WHERE valid_date = ?").run(today);
  });
  tx();

  const totalDeliveries = db.prepare("SELECT COUNT(*) as count FROM deliveries").get().count;
  const pendingEntitlements = db.prepare("SELECT COUNT(*) as count FROM daily_entitlements WHERE valid_date = ? AND status = 'pending'").get(today).count;

  return {
    success: true,
    today,
    deliveries_cleared: delResult.changes,
    total_deliveries: totalDeliveries,
    workers_active: allActive.length,
    entitlements_created: createdCount,
    pending_entitlements_today: pendingEntitlements
  };
}

if (require.main === module) {
  const res = resetDeliveriesAndSeedToday();
  console.log('Resultado reset y preparación de hoy:', JSON.stringify(res, null, 2));
}

module.exports = { resetDeliveriesAndSeedToday };
