// backend/sync_to_supabase.js
require('dotenv').config();
const { supabase } = require('./supabase');
const seed = require('./production_seed.json');

async function syncAllToSupabase() {
  console.log('================================================================');
  console.log('🚀 SINCRONIZACIÓN COMPLETA A SUPABASE CLOUD (POSTGRESQL)');
  console.log('================================================================');

  if (!supabase) {
    console.error('❌ Supabase no está configurado');
    return;
  }

  // 1. Departamentos
  console.log(`[1/3] Sincronizando ${seed.departments.length} departamentos...`);
  const { error: dErr } = await supabase
    .from('departments')
    .upsert(seed.departments, { onConflict: 'id' });
  if (dErr) {
    console.error('❌ Error en departamentos:', dErr.message);
    return;
  }
  console.log('✅ Departamentos sincronizados.');

  // 2. Puntos de Distribución
  console.log(`[2/3] Sincronizando ${seed.distribution_points.length} puntos de distribución...`);
  const { error: pErr } = await supabase
    .from('distribution_points')
    .upsert(seed.distribution_points, { onConflict: 'id' });
  if (pErr) console.warn('⚠️ Puntos de distribución:', pErr.message);
  else console.log('✅ Puntos de distribución sincronizados.');

  // 3. Trabajadores (en lotes de 100, unificados por document_id)
  const workers = seed.workers;
  const total = workers.length;
  console.log(`[3/3] Sincronizando ${total} trabajadores a Supabase en lotes...`);

  const BATCH_SIZE = 100;
  let successCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = workers.slice(i, i + BATCH_SIZE).map(w => ({
      document_id: w.document_id,
      full_name: w.full_name,
      email: w.email,
      department_id: w.department_id || null,
      shift: w.shift || 'jornada_continua',
      status: w.status || 'active',
      worker_type: w.worker_type || 'activo',
      role: w.role || 'worker',
      has_smartphone: Boolean(w.has_smartphone),
      contingency_reason: w.contingency_reason || null,
      phone_number: w.phone_number || null,
      avatar_url: w.avatar_url || null,
      updated_at: new Date().toISOString()
    }));

    const { error: wErr } = await supabase
      .from('workers')
      .upsert(chunk, { onConflict: 'document_id' });

    if (wErr) {
      console.error(`❌ Error en lote ${i} a ${i + chunk.length}:`, wErr.message);
    } else {
      successCount += chunk.length;
      process.stdout.write(`   Procesados: ${successCount} / ${total}\r`);
    }
  }

  console.log(`\n✅ ${successCount} funcionarios sincronizados exitosamente en Supabase.`);

  // Verificación final
  const { count: finalCount } = await supabase
    .from('workers')
    .select('count', { count: 'exact', head: true });

  console.log(`📊 Conteo total de funcionarios en Supabase Cloud: ${finalCount}`);
  console.log('================================================================');
}

syncAllToSupabase().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
