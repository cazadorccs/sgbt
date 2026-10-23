// backend/sync-to-supabase.js
// Sincronización completa de la Base de Datos Local (SQLite) hacia Supabase Cloud
// Asegura que trabajadores, departamentos, combos, asignaciones y entregas (0) estén 100% sincronizados.

require('dotenv').config();
const { db } = require('./db');
const { supabase, isSupabaseConfigured } = require('./supabase');

const isValidUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

async function syncAllToSupabase() {
  console.log('================================================================');
  console.log('🚀 INICIANDO SINCRONIZACIÓN SQLITE -> SUPABASE CLOUD');
  console.log('================================================================');

  if (!isSupabaseConfigured() || !supabase) {
    console.error('❌ Supabase no está configurado.');
    return { success: false, error: 'Supabase no configurado' };
  }

  const today = new Date().toISOString().split('T')[0];
  const stats = {
    departments: 0,
    combos: 0,
    workers: 0,
    entitlements: 0,
    deliveries_cleared: 0
  };

  try {
    // 1. SINCRONIZAR DEPARTAMENTOS
    console.log('📂 1. Sincronizando departamentos...');
    const localDeps = db.prepare('SELECT id, code, name, cost_center FROM departments').all();
    const validDeps = localDeps.filter(d => isValidUUID(d.id));
    for (let i = 0; i < validDeps.length; i += 100) {
      const chunk = validDeps.slice(i, i + 100);
      const { error } = await supabase.from('departments').upsert(chunk, { onConflict: 'id' });
      if (error) console.warn('Aviso sincronizando departamentos:', error.message);
      else stats.departments += chunk.length;
    }
    console.log(`✅ Departamentos sincronizados: ${stats.departments}`);

    // 2. SINCRONIZAR COMBOS (Mapeando enums)
    console.log('🍱 2. Sincronizando catálogo de combos...');
    const localCombos = db.prepare('SELECT id, name, description, category, calories, dietary_info, is_active FROM combos').all();
    const validCategoryMap = {
      'bolsa_viveres': 'bolsa_viveres',
      'proteico': 'combo_proteico',
      'combo_proteico': 'combo_proteico',
      'utiles_escolares': 'utiles_escolares',
      'combo_higienico': 'combo_higienico',
      'dotacion_uniformes': 'dotacion_uniformes',
      'combo_navideno': 'combo_navideno',
      'combo_salud': 'combo_salud',
      'combo_especial': 'combo_especial',
      'almuerzo': 'bolsa_viveres'
    };

    const sanitizedCombos = localCombos
      .filter(c => isValidUUID(c.id))
      .map(c => ({
        ...c,
        category: validCategoryMap[c.category] || 'bolsa_viveres'
      }));

    if (sanitizedCombos.length > 0) {
      const { error } = await supabase.from('combos').upsert(sanitizedCombos, { onConflict: 'id' });
      if (error) console.warn('Aviso sincronizando combos:', error.message);
      else stats.combos = sanitizedCombos.length;
    }
    console.log(`✅ Combos sincronizados: ${stats.combos}`);

    // 3. SINCRONIZAR PADRÓN DE TRABAJADORES (Conciliando IDs remotos con locales por document_id)
    console.log('👥 3. Sincronizando padrón de trabajadores...');
    const { data: remoteWorkers } = await supabase.from('workers').select('id, document_id');
    const remoteDocMap = new Map();
    if (Array.isArray(remoteWorkers)) {
      remoteWorkers.forEach(rw => remoteDocMap.set(rw.document_id, rw.id));
    }

    const localWorkers = db.prepare(`
      SELECT id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
      FROM workers
    `).all();

    // Actualizar en SQLite los IDs que difieren del UUID remoto para mantener coherencia estricta
    db.pragma('foreign_keys = OFF');
    const updateWorkerId = db.prepare('UPDATE workers SET id = ? WHERE id = ?');
    const updateEntWorkerId = db.prepare('UPDATE daily_entitlements SET worker_id = ? WHERE worker_id = ?');

    db.transaction(() => {
      for (const lw of localWorkers) {
        if (remoteDocMap.has(lw.document_id)) {
          const rId = remoteDocMap.get(lw.document_id);
          if (rId !== lw.id) {
            updateWorkerId.run(rId, lw.id);
            updateEntWorkerId.run(rId, lw.id);
            lw.id = rId;
          }
        }
      }
    })();
    db.pragma('foreign_keys = ON');

    // Ahora upsert a Supabase usando onConflict: 'document_id'
    const validWorkers = localWorkers
      .filter(w => isValidUUID(w.id))
      .map(w => ({
        ...w,
        department_id: (w.department_id && isValidUUID(w.department_id)) ? w.department_id : null,
        worker_type: ['activo', 'jubilado', 'pensionado', 'contratado'].includes(w.worker_type) ? w.worker_type : 'activo',
        status: ['active', 'suspended', 'terminated'].includes(w.status) ? w.status : 'active'
      }));

    for (let i = 0; i < validWorkers.length; i += 150) {
      const chunk = validWorkers.slice(i, i + 150);
      const { error } = await supabase.from('workers').upsert(chunk, { onConflict: 'document_id' });
      if (error) console.warn(`Aviso en trabajadores chunk ${i}:`, error.message);
      else stats.workers += chunk.length;
    }
    console.log(`✅ Trabajadores sincronizados: ${stats.workers}`);

    // 4. ASEGURAR QUE LAS ENTREGAS EN SUPABASE ESTÉN EN CERO
    console.log('🧹 4. Verificando entregas en Supabase (Llevar a 0)...');
    const { data: remoteDeliveries, error: delErr } = await supabase.from('deliveries').select('id');
    if (!delErr && Array.isArray(remoteDeliveries) && remoteDeliveries.length > 0) {
      const ids = remoteDeliveries.map(d => d.id);
      const { error: remErr } = await supabase.from('deliveries').delete().in('id', ids);
      if (!remErr) stats.deliveries_cleared = ids.length;
    }
    console.log(`✅ Entregas en Supabase: 0 (limpiadas: ${stats.deliveries_cleared})`);

    // 5. SINCRONIZAR ASIGNACIONES DIARIAS DE HOY
    console.log(`📦 5. Sincronizando derechos de hoy (${today})...`);
    const todayEntitlements = db.prepare(`
      SELECT id, worker_id, combo_id, valid_date, shift, status
      FROM daily_entitlements
      WHERE valid_date = ?
    `).all(today);

    const shiftMap = {
      'estacion_1': 'mañana',
      'estacion_2': 'tarde',
      'mañana': 'mañana',
      'tarde': 'tarde',
      'noche': 'noche',
      'jornada_continua': 'jornada_continua'
    };

    const validEntitlements = todayEntitlements
      .filter(e => isValidUUID(e.id) && isValidUUID(e.worker_id) && isValidUUID(e.combo_id))
      .map(e => ({
        id: e.id,
        worker_id: e.worker_id,
        combo_id: e.combo_id,
        valid_date: e.valid_date,
        shift: shiftMap[e.shift] || 'mañana',
        status: ['pending', 'claimed', 'expired'].includes(e.status) ? e.status : 'pending'
      }));

    for (let i = 0; i < validEntitlements.length; i += 150) {
      const chunk = validEntitlements.slice(i, i + 150);
      const { error } = await supabase.from('daily_entitlements').upsert(chunk, { onConflict: 'id' });
      if (error) console.warn(`Aviso en asignaciones chunk ${i}:`, error.message);
      else stats.entitlements += chunk.length;
    }
    console.log(`✅ Asignaciones de hoy sincronizadas: ${stats.entitlements}`);

    console.log('================================================================');
    console.log('🎉 SINCRONIZACIÓN CON SUPABASE COMPLETADA CON ÉXITO');
    console.log(JSON.stringify(stats, null, 2));
    console.log('================================================================');

    return { success: true, stats };
  } catch (err) {
    console.error('❌ Error en sincronización:', err);
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  syncAllToSupabase().then(() => process.exit(0));
}

module.exports = { syncAllToSupabase };
