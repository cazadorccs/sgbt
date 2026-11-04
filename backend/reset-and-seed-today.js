// backend/reset-and-seed-today.js
const crypto = require('crypto');
const { db } = require('./db');
const { supabase, isSupabaseConfigured } = require('./supabase');
const { clearDeliveriesInCloud } = require('./services/cloud_sync.service');

async function resetDeliveriesAndSeedToday() {
  const todayUtc = new Date().toISOString().split('T')[0];
  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const today = todayVzla;
  
  // 1. Eliminar entregas previas y liberar candados de dispositivos
  const delResult = db.prepare('DELETE FROM deliveries').run();
  try {
    db.prepare('DELETE FROM device_locks').run();
  } catch (e) {}
  
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
        const r1 = insEnt.run(crypto.randomUUID(), w.id, c.id, todayUtc);
        if (r1.changes > 0) createdCount++;
        if (todayVzla !== todayUtc) {
          const r2 = insEnt.run(crypto.randomUUID(), w.id, c.id, todayVzla);
          if (r2.changes > 0) createdCount++;
        }
      }
    }
    // Reiniciar cualquier derecho de hoy (UTC o VET) a status = 'pending'
    db.prepare("UPDATE daily_entitlements SET status = 'pending' WHERE valid_date IN (?, ?)").run(todayUtc, todayVzla);
  });
  tx();

  // 4. Sincronizar reseteo a Supabase Cloud con AWAIT garantizado (para que Vercel Serverless permanezca en 0)
  if (isSupabaseConfigured() && supabase) {
    try {
      await clearDeliveriesInCloud();
    } catch (sbErr) {
      console.warn('[RESET] No se pudo sincronizar reseteo a Supabase:', sbErr.message);
    }
  }

  const totalDeliveries = db.prepare("SELECT COUNT(*) as count FROM deliveries").get().count;
  const pendingEntitlements = db.prepare("SELECT COUNT(*) as count FROM daily_entitlements WHERE valid_date IN (?, ?) AND status = 'pending'").get(todayUtc, todayVzla).count;

  return {
    success: true,
    today,
    today_utc: todayUtc,
    today_vzla: todayVzla,
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
