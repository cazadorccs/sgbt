// backend/reset-and-seed-today.js
const crypto = require('crypto');
const { db } = require('./db');

function resetDeliveriesAndSeedToday() {
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Eliminar entregas previas (llevar a 0)
  const delResult = db.prepare('DELETE FROM deliveries').run();
  
  // 2. Obtener todos los combos activos del catálogo institucional
  const activeCombos = db.prepare("SELECT id, name FROM combos WHERE is_active = 1").all();

  // 3. Obtener todos los trabajadores activos
  const allActive = db.prepare("SELECT id FROM workers WHERE status = 'active'").all();

  const insEnt = db.prepare(`
    INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
    VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
  `);

  let createdCount = 0;
  const tx = db.transaction(() => {
    for (const w of allActive) {
      for (const c of activeCombos) {
        const r = insEnt.run(crypto.randomUUID(), w.id, c.id, today);
        if (r.changes > 0) createdCount++;
      }
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
