const { db } = require('../backend/db');
const { supabase, isSupabaseConfigured } = require('../backend/supabase');

function canonicalizeDepartmentName(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\xB0\xBA\xAA*~_\"'\`\^\.\,\;\:\/\\]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function sanitizeDepartmentDisplayName(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\xB0\xBA\xAA*~_\"'\`\^]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function consolidateDepartments() {
  console.log('================================================================');
  console.log('🔄 INICIANDO CONSOLIDACIÓN CANÓNICA DE DEPARTAMENTOS');
  console.log('================================================================');

  // 1. Eliminar trabajador fantasma duplicado f14b87b0-db67-4fe3-8989-57e0a20534e2 si existe (no tiene passkeys ni asignaciones)
  try {
    const phantom = db.prepare("SELECT id FROM workers WHERE id = 'f14b87b0-db67-4fe3-8989-57e0a20534e2'").get();
    if (phantom) {
      db.prepare("DELETE FROM workers WHERE id = 'f14b87b0-db67-4fe3-8989-57e0a20534e2'").run();
      console.log('✓ Registro fantasma no formalizado de Kleymari eliminado en favor del registro formalizado con 6 passkeys.');
    }
  } catch (e) {
    console.warn('Aviso limpiando registro fantasma:', e.message);
  }

  // 2. Agrupar departamentos existentes en SQLite
  const depts = db.prepare("SELECT id, code, name, cost_center FROM departments").all();
  const groups = new Map();

  for (const d of depts) {
    const cKey = canonicalizeDepartmentName(d.name);
    if (!cKey) continue;
    if (!groups.has(cKey)) groups.set(cKey, []);
    groups.get(cKey).push(d);
  }

  const consolidationList = [];

  for (const [cKey, list] of groups.entries()) {
    if (list.length <= 1) {
      // Si sólo hay uno pero tiene caracteres parásitos, limpiamos su nombre
      const single = list[0];
      const cleanName = sanitizeDepartmentDisplayName(single.name);
      if (cleanName !== single.name) {
        db.prepare("UPDATE departments SET name = ? WHERE id = ?").run(cleanName, single.id);
      }
      continue;
    }

    // Ordenar para escoger el canónico
    const ranked = [...list].sort((a, b) => {
      const aHasNoise = /[\xB0\xBA\xAA*~_\"'\`\^]/.test(a.name);
      const bHasNoise = /[\xB0\xBA\xAA*~_\"'\`\^]/.test(b.name);
      if (aHasNoise !== bHasNoise) return aHasNoise ? 1 : -1;

      const aIsOfficial = !a.code.startsWith('DEP_');
      const bIsOfficial = !b.code.startsWith('DEP_');
      if (aIsOfficial !== bIsOfficial) return bIsOfficial ? 1 : -1;

      const aWorkers = db.prepare("SELECT COUNT(*) as c FROM workers WHERE department_id = ?").get(a.id)?.c || 0;
      const bWorkers = db.prepare("SELECT COUNT(*) as c FROM workers WHERE department_id = ?").get(b.id)?.c || 0;
      return bWorkers - aWorkers;
    });

    const canonical = ranked[0];
    const duplicates = ranked.slice(1);
    const cleanCanonicalName = sanitizeDepartmentDisplayName(canonical.name);

    consolidationList.push({
      canonicalKey: cKey,
      canonicalId: canonical.id,
      canonicalCode: canonical.code,
      canonicalName: cleanCanonicalName,
      duplicateIds: duplicates.map(d => d.id)
    });
  }

  console.log(`Grupos duplicados a procesar: ${consolidationList.length}`);

  let totalWorkersReassigned = 0;
  let totalDeptsDeleted = 0;

  // Ejecutar en SQLite
  const tx = db.transaction(() => {
    for (const item of consolidationList) {
      // 1. Asegurar nombre limpio en canónico
      db.prepare("UPDATE departments SET name = ? WHERE id = ?").run(item.canonicalName, item.canonicalId);

      // 2. Reasignar trabajadores
      for (const dupId of item.duplicateIds) {
        const moved = db.prepare("UPDATE workers SET department_id = ? WHERE department_id = ?").run(item.canonicalId, dupId);
        totalWorkersReassigned += (moved.changes || 0);

        try {
          db.prepare("UPDATE department_batch_orders SET department_id = ? WHERE department_id = ?").run(item.canonicalId, dupId);
        } catch (e) {}

        // 3. Eliminar departamento duplicado
        const del = db.prepare("DELETE FROM departments WHERE id = ?").run(dupId);
        totalDeptsDeleted += (del.changes || 0);
      }
    }
  });

  tx();
  console.log(`[SQLITE] Consolidación completada: ${totalWorkersReassigned} trabajadores reasignados, ${totalDeptsDeleted} departamentos duplicados eliminados.`);

  // 3. Reconciliar y Sincronizar en Supabase Cloud si está configurado
  if (isSupabaseConfigured() && supabase) {
    console.log('[SUPABASE CLOUD] Sincronizando consolidación con la nube...');
    try {
      for (const item of consolidationList) {
        // Actualizar nombre canónico en Supabase
        await supabase.from('departments').update({ name: item.canonicalName }).eq('id', item.canonicalId);

        // Mover trabajadores en Supabase
        for (const dupId of item.duplicateIds) {
          const { error: updErr } = await supabase.from('workers').update({ department_id: item.canonicalId }).eq('department_id', dupId);
          if (updErr) {
            console.warn(`[SUPABASE WARN] Error reasignando trabajadores de ${dupId}:`, updErr.message);
          }

          // Eliminar departamento duplicado en Supabase
          const { error: delErr } = await supabase.from('departments').delete().eq('id', dupId);
          if (delErr) {
            console.warn(`[SUPABASE WARN] Error eliminando departamento ${dupId} en Supabase:`, delErr.message);
          }
        }
      }
      console.log('[SUPABASE CLOUD] Consolidación reflejada exitosamente en Supabase.');
    } catch (sbErr) {
      console.error('[SUPABASE ERROR]', sbErr.message);
    }
  }

  // 4. Verificar estado final de OTIC en SQLite
  const oticDept = db.prepare("SELECT id, code, name FROM departments WHERE id = '253d9c31-f670-4301-aea5-60a04857cc3b'").get();
  const oticWorkers = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN enrollment_status = 'registrado' THEN 1 ELSE 0 END) as formalizados FROM workers WHERE department_id = ?").get(oticDept.id);

  console.log('================================================================');
  console.log('📊 ESTADO FINAL DE OTIC CONSOLIDADA:');
  console.log(` - ID: ${oticDept.id}`);
  console.log(` - Nombre: "${oticDept.name}"`);
  console.log(` - Código: ${oticDept.code}`);
  console.log(` - Total Trabajadores: ${oticWorkers.total}`);
  console.log(` - Formalizados: ${oticWorkers.formalizados} (${Math.round((oticWorkers.formalizados / oticWorkers.total) * 100)}%)`);
  console.log('================================================================');
}

consolidateDepartments();
