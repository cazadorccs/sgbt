// backend/reconcile_orphan_entitlements.js
const { db, supabase } = require('./db');

async function run() {
  console.log('[RECONCILIATION] Iniciando conciliación de beneficios y combos...');

  const inactiveCombos = db.prepare('SELECT id, name FROM combos WHERE is_active = 0').all();
  console.log('[RECONCILIATION] Combos inactivos detectados:', inactiveCombos);

  for (const c of inactiveCombos) {
    const res = db.prepare('DELETE FROM daily_entitlements WHERE combo_id = ? AND status = ?').run(c.id, 'pending');
    console.log(`[RECONCILIATION] SQLite: Eliminadas ${res.changes} asignaciones pendientes para "${c.name}" (${c.id})`);

    if (supabase) {
      try {
        const { error, count } = await supabase
          .from('daily_entitlements')
          .delete({ count: 'exact' })
          .eq('combo_id', c.id)
          .eq('status', 'pending');
        if (error) {
          console.warn(`[RECONCILIATION] Supabase error para ${c.name}:`, error.message);
        } else {
          console.log(`[RECONCILIATION] Supabase: Eliminadas ${count || 0} asignaciones pendientes para "${c.name}"`);
        }
      } catch (err) {
        console.warn(`[RECONCILIATION] Supabase exception para ${c.name}:`, err.message);
      }
    }
  }

  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const todayUtc = new Date().toISOString().split('T')[0];

  const assigned = db.prepare(`
    SELECT COUNT(*) as c 
    FROM daily_entitlements e 
    JOIN combos c ON e.combo_id = c.id 
    WHERE e.valid_date IN (?, ?) AND c.is_active = 1 AND e.status != 'cancelled'
  `).get(todayUtc, todayVzla).c;

  const totalWorkers = db.prepare("SELECT COUNT(*) as c FROM workers WHERE status = 'active'").get().c;
  const activeCombosCount = db.prepare("SELECT COUNT(*) as c FROM combos WHERE is_active = 1").get().c;

  console.log('\n[RESULTADOS CONCILIACIÓN]');
  console.log(`- Trabajadores activos: ${totalWorkers}`);
  console.log(`- Combos activos: ${activeCombosCount}`);
  console.log(`- Combos programados para hoy: ${assigned}`);
}

run().catch(err => {
  console.error('[RECONCILIATION FATAL ERROR]', err);
  process.exit(1);
});
