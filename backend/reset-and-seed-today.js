// backend/reset-and-seed-today.js
const crypto = require('crypto');
const { db } = require('./db');
const { supabase, isSupabaseConfigured } = require('./supabase');
const { clearDeliveriesInCloud } = require('./services/cloud_sync.service');

/**
 * Reinicia ÚNICAMENTE las entregas de combos a 0.
 * Preserva intactos:
 * - Jornada programada (delivery_campaigns y campaign_combos)
 * - Órdenes de lotes departamentales (department_batch_orders)
 * - Catálogo de combos, nómina de funcionarios y departamentos
 */
async function resetDeliveriesAndSeedToday() {
  const todayUtc = new Date().toISOString().split('T')[0];
  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const today = todayVzla;
  
  // 1. Eliminar EXCLUSIVAMENTE el registro de entregas (deliveries)
  const delResult = db.prepare('DELETE FROM deliveries').run();

  // Purgar posibles duplicados de daily_entitlements
  try {
    db.prepare(`
      DELETE FROM daily_entitlements 
      WHERE id NOT IN (
        SELECT MIN(id) 
        FROM daily_entitlements 
        GROUP BY worker_id, combo_id, valid_date
      )
    `).run();
  } catch (e) {}

  // 2. Restaurar todos los derechos de hoy a estado 'pending' (sin alterar la jornada ni combos asignados)
  db.prepare("UPDATE daily_entitlements SET status = 'pending' WHERE valid_date IN (?, ?)").run(todayUtc, todayVzla);

  // 3. Sincronizar reseteo a Supabase Cloud con AWAIT garantizado (deliveries a 0 y entitlements a pending)
  if (isSupabaseConfigured() && supabase) {
    try {
      await clearDeliveriesInCloud();
    } catch (sbErr) {
      console.warn('[RESET] No se pudo sincronizar reseteo de entregas a Supabase:', sbErr.message);
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
    pending_entitlements_today: pendingEntitlements
  };
}

if (require.main === module) {
  const res = resetDeliveriesAndSeedToday();
  console.log('Resultado reset y preparación de hoy:', JSON.stringify(res, null, 2));
}

module.exports = { resetDeliveriesAndSeedToday };
