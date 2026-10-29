// backend/controllers/manual_dispatch.controller.js
// Controlador para despacho manual de combos por cédula e incorporación rápida a nómina
// Diseñado para contingencia y primera jornada de entrega sin QR/NFC.

const crypto = require('crypto');
const { db } = require('../db');
const { resetDeliveriesAndSeedToday } = require('../reset-and-seed-today');

function normalizeCedula(input) {
  if (!input) return '';
  const trimmed = input.toString().trim().toUpperCase();
  const digitsOnly = trimmed.replace(/[^0-9]/g, '');
  const prefixMatch = trimmed.match(/^([VvEeJjGg])[-_ ]?/);
  const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'V';
  return {
    raw: trimmed,
    digits: digitsOnly,
    formatted: digitsOnly ? `${prefix}-${digitsOnly}` : trimmed
  };
}

// 1. Búsqueda de trabajador por cédula
const searchWorkerByCedula = (req, res) => {
  const query = req.params.cedula || req.query.cedula || req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Debe ingresar un número de cédula' });
  }

  const { digits, formatted, raw } = normalizeCedula(query);
  const today = new Date().toISOString().split('T')[0];

  try {
    // Buscar trabajador por coincidencia de cédula (exacta, formateada o dígitos)
    let worker = db.prepare(`
      SELECT 
        w.id, w.document_id, w.full_name, w.email, w.role, w.shift, w.status, w.worker_type,
        w.phone_number, w.job_title,
        d.id as department_id, d.name as department_name, d.code as department_code
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.document_id = ? 
         OR w.document_id = ?
         OR w.document_id LIKE ?
         OR REPLACE(REPLACE(w.document_id, 'V-', ''), 'E-', '') = ?
      LIMIT 1
    `).get(formatted, raw, `%${digits}%`, digits);

    if (!worker) {
      return res.json({
        found: false,
        searched_term: query,
        suggested_cedula: formatted,
        message: `El trabajador con cédula "${query}" no fue encontrado en la base de datos.`
      });
    }

    // Asegurar que el trabajador tenga asignaciones para hoy (para todos los combos activos)
    ensureTodayEntitlementsForWorker(worker.id, today);

    // Obtener los derechos / combos de hoy para este trabajador (activos o ya entregados)
    const entitlements = db.prepare(`
      SELECT 
        e.id as entitlement_id, e.shift, e.status, e.valid_date,
        c.id as combo_id, c.name as combo_name, c.category, c.items_detail,
        c.icon, c.weight_kg, c.mesa_name,
        d.id as delivery_id, d.delivered_at, d.verification_method, d.override_reason,
        sup.full_name as supervisor_name
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      LEFT JOIN deliveries d ON d.entitlement_id = e.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      WHERE e.worker_id = ? AND e.valid_date = ? AND (c.is_active = 1 OR d.id IS NOT NULL)
      ORDER BY c.created_at ASC, c.id ASC
    `).all(worker.id, today);

    const totalCombos = entitlements.length;
    const claimedCombos = entitlements.filter(e => e.status === 'claimed').length;
    const pendingCombos = entitlements.filter(e => e.status === 'pending').length;

    return res.json({
      found: true,
      worker,
      summary: {
        today,
        total_combos: totalCombos,
        claimed_combos: claimedCombos,
        pending_combos: pendingCombos,
        is_fully_delivered: totalCombos > 0 && pendingCombos === 0,
        has_partial_delivery: claimedCombos > 0 && pendingCombos > 0
      },
      entitlements
    });
  } catch (err) {
    console.error('[MANUAL SEARCH ERROR]', err);
    res.status(500).json({ error: 'Error consultando trabajador: ' + err.message });
  }
};

// 2. Despachar / Entregar combos manualmente y descontar
const deliverManualCombos = async (req, res) => {
  const { worker_id, entitlement_ids, quantity, note, supervisor_id } = req.body;
  const today = new Date().toISOString().split('T')[0];

  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id es requerido' });
  }

  try {
    const worker = db.prepare(`
      SELECT w.id, w.document_id, w.full_name, w.worker_type, d.name as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.id = ?
    `).get(worker_id);

    if (!worker) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }

    // Buscar derechos pendientes para hoy
    let pendingList = [];
    if (Array.isArray(entitlement_ids) && entitlement_ids.length > 0) {
      // Filtrar los IDs especificados
      const placeholders = entitlement_ids.map(() => '?').join(',');
      pendingList = db.prepare(`
        SELECT e.id, e.combo_id, e.status, c.name as combo_name
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.id IN (${placeholders}) AND e.worker_id = ? AND e.valid_date = ? AND c.is_active = 1
      `).all(...entitlement_ids, worker_id, today);
    } else {
      // Tomar todos o la cantidad solicitada
      const limit = quantity ? parseInt(quantity, 10) : 99;
      pendingList = db.prepare(`
        SELECT e.id, e.combo_id, e.status, c.name as combo_name
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND e.valid_date = ? AND e.status = 'pending' AND c.is_active = 1
        LIMIT ?
      `).all(worker_id, today, limit);
    }

    const strictlyPending = pendingList.filter(item => item.status === 'pending');

    if (strictlyPending.length === 0) {
      return res.status(400).json({
        error: 'No hay combos pendientes para entregar hoy a este trabajador. Ya fueron despachados.'
      });
    }

    // Punto de distribución por defecto
    const distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const distPointId = distPoint ? distPoint.id : '550e8400-e29b-41d4-a716-446655440000';

    const activeCampaign = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campaignId = activeCampaign ? activeCampaign.id : null;

    const deliveredItems = [];
    const insertDelivery = db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, supervisor_id,
        override_reason, is_offline_sync, delivered_at, campaign_id
      ) VALUES (?, ?, ?, ?, ?, 'manual_rrhh', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
    `);

    const updateEntitlement = db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?");

    const tx = db.transaction(() => {
      for (const ent of strictlyPending) {
        const deliveryId = crypto.randomUUID();
        const nonce = crypto.randomBytes(8).toString('hex');
        insertDelivery.run(
          deliveryId,
          ent.id,
          worker.id,
          distPointId,
          supervisor_id || null,
          'MANUAL_RRHH_DISPATCH_' + Date.now(),
          nonce,
          supervisor_id || null,
          note || 'Despacho manual RRHH - Primera Jornada',
          campaignId
        );
        updateEntitlement.run(ent.id);
        deliveredItems.push({
          delivery_id: deliveryId,
          entitlement_id: ent.id,
          combo_name: ent.combo_name
        });
      }
    });

    tx();

    // Notificar evento a clientes SSE conectados
    try {
      const { notifyDeliveryStream } = require('../services/sse.service');
      notifyDeliveryStream(worker.id, {
        valid: true,
        type: 'manual_rrhh',
        worker_id: worker.id,
        worker_name: worker.full_name,
        document_id: worker.document_id,
        combos_delivered: deliveredItems,
        delivered_at: new Date().toISOString()
      });
    } catch (e) {}

    // Consultar resumen actualizado
    const allEnts = db.prepare("SELECT status FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?").all(worker.id, today);
    const remainingPending = allEnts.filter(e => e.status === 'pending').length;

    // Respaldo garantizado en Supabase Cloud con AWAIT (Vercel Serverless)
    try {
      const { persistDeliveries } = require('../services/cloud_sync.service');
      await persistDeliveries(deliveredItems.map(item => ({
        id: item.delivery_id,
        entitlement_id: item.entitlement_id,
        worker_id: worker.id,
        combo_id: item.combo_id,
        verification_method: 'manual_rrhh',
        delivered_at: new Date().toISOString()
      })));
    } catch (e) {
      console.warn('[MANUAL DISPATCH CLOUD PERSIST WARN]', e.message);
    }

    return res.json({
      success: true,
      message: `¡Se entregaron ${strictlyPending.length} combo(s) a ${worker.full_name} (${worker.document_id}) con éxito!`,
      delivered_count: strictlyPending.length,
      remaining_pending: remainingPending,
      delivered_items: deliveredItems,
      worker: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        department: worker.department_name
      }
    });
  } catch (err) {
    console.error('[MANUAL DISPATCH ERROR]', err);
    if (err.message && err.message.includes('idx_unique_daily_claim')) {
      return res.status(409).json({ error: 'Alerta de duplicidad: uno de los combos ya fue registrado como entregado.' });
    }
    res.status(500).json({ error: 'Error procesando la entrega: ' + err.message });
  }
};

// 3. Incorporación rápida a nómina y despacho inmediato
const incorporateAndDeliver = (req, res) => {
  const {
    document_id,
    full_name,
    department_id,
    department_name,
    worker_type,
    shift,
    phone_number,
    combos_qty,
    deliver_now,
    note,
    supervisor_id
  } = req.body;

  if (!document_id || !full_name) {
    return res.status(400).json({ error: 'Cédula y Nombres y Apellidos son obligatorios' });
  }

  const { digits, formatted } = normalizeCedula(document_id);
  const cleanName = full_name.trim();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Verificar si ya existe
    const existing = db.prepare("SELECT id, document_id, full_name FROM workers WHERE document_id = ? OR REPLACE(REPLACE(document_id, 'V-', ''), 'E-', '') = ?").get(formatted, digits);
    if (existing) {
      return res.status(409).json({
        error: `Ya existe un funcionario registrado con esa cédula: ${existing.full_name} (${existing.document_id})`,
        worker_id: existing.id
      });
    }

    // Resolver departamento
    let depId = department_id;
    if (!depId && department_name) {
      const existingDep = db.prepare("SELECT id FROM departments WHERE name LIKE ?").get(`%${department_name.trim()}%`);
      if (existingDep) {
        depId = existingDep.id;
      } else {
        depId = crypto.randomUUID();
        const depCode = 'DEP_' + crypto.randomBytes(3).toString('hex').toUpperCase();
        db.prepare("INSERT INTO departments (id, code, name) VALUES (?, ?, ?)").run(depId, depCode, department_name.trim());
      }
    }

    const workerId = crypto.randomUUID();
    const workerEmail = `${digits}@mippci.gob.ve`;

    // 1. Insertar trabajador
    db.prepare(`
      INSERT INTO workers (
        id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, phone_number
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, 'worker', 1, ?)
    `).run(
      workerId,
      formatted,
      cleanName,
      workerEmail,
      depId || null,
      shift || 'jornada_continua',
      worker_type || 'activo',
      phone_number || null
    );

    // 2. Asignar todos los combos activos del catálogo institucional para hoy
    const activeCombos = db.prepare("SELECT id, name FROM combos WHERE is_active = 1").all();

    const insEnt = db.prepare(`
      INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const createdEnts = [];
    for (const c of activeCombos) {
      const entId = crypto.randomUUID();
      insEnt.run(entId, workerId, c.id, today, 'jornada_continua');
      createdEnts.push({ id: entId, combo_id: c.id, name: c.name });
    }

    // 3. Si se marcó despacho inmediato, entregar de una vez
    const shouldDeliver = deliver_now === true || deliver_now === 'true' || deliver_now === 1;
    let deliveredCount = 0;

    if (shouldDeliver) {
      const distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
      const distPointId = distPoint ? distPoint.id : '550e8400-e29b-41d4-a716-446655440000';
      const insertDelivery = db.prepare(`
        INSERT INTO deliveries (
          id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
          verification_method, signature_proof, challenge_nonce, supervisor_id,
          override_reason, is_offline_sync, delivered_at
        ) VALUES (?, ?, ?, ?, ?, 'manual_incorporation_rrhh', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `);
      const markClaimed = db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?");

      for (const ent of createdEnts) {
        const dId = crypto.randomUUID();
        insertDelivery.run(
          dId,
          ent.id,
          workerId,
          distPointId,
          supervisor_id || null,
          'INCORPORATION_MANUAL_' + Date.now(),
          crypto.randomBytes(8).toString('hex'),
          supervisor_id || null,
          note || 'Incorporación directa en jornada RRHH'
        );
        markClaimed.run(ent.id);
        deliveredCount++;
      }
    }

    // Sincronizar nuevo trabajador con Supabase Cloud si está disponible
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        supabase.from('workers').insert([{
          id: workerId,
          document_id: formatted,
          full_name: cleanName,
          email: workerEmail,
          department_id: depId || null,
          worker_type: worker_type || 'activo',
          status: 'active',
          role: 'worker'
        }]).catch(() => {});
      }
    } catch (e) {}

    const workerRecord = db.prepare(`
      SELECT w.*, d.name as department_name 
      FROM workers w 
      LEFT JOIN departments d ON w.department_id = d.id 
      WHERE w.id = ?
    `).get(workerId);

    return res.status(201).json({
      success: true,
      message: shouldDeliver 
        ? `Trabajador ${cleanName} (${formatted}) incorporado a nómina y ${deliveredCount} combo(s) despachado(s) exitosamente.`
        : `Trabajador ${cleanName} (${formatted}) incorporado a nómina con ${createdEnts.length} combo(s) asignado(s).`,
      worker: workerRecord,
      delivered_immediately: shouldDeliver,
      delivered_count: deliveredCount,
      combos_assigned: createdEnts.length
    });

  } catch (err) {
    console.error('[INCORPORATION ERROR]', err);
    res.status(500).json({ error: 'Error incorporando trabajador: ' + err.message });
  }
};

// 4. Estadísticas del día y lista de despachos recientes
const getTodayStatsAndRecent = async (req, res) => {
  const todayUtc = new Date().toISOString().split('T')[0];
  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const today = todayVzla;

  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Hidratación reactiva desde Supabase Cloud si estamos en serverless y no hay entregas locales
    try {
      const localCount = db.prepare("SELECT COUNT(*) as c FROM deliveries WHERE delivered_at >= datetime('now', '-24 hours')").get()?.c || 0;
      if (localCount === 0) {
        const { supabase, isSupabaseConfigured } = require('../supabase');
        if (isSupabaseConfigured() && supabase) {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Supabase')), 800));
          const queryPromise = supabase.from('deliveries').select('*').order('delivered_at', { ascending: false }).limit(60);
          const { data: remoteDeliveries } = await Promise.race([queryPromise, timeoutPromise]);
          if (Array.isArray(remoteDeliveries) && remoteDeliveries.length > 0) {
            const insRemoteDelivery = db.prepare(`
              INSERT OR IGNORE INTO deliveries (
                id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
                verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const d of remoteDeliveries) {
              insRemoteDelivery.run(
                d.id,
                d.entitlement_id,
                d.worker_id,
                d.distribution_point_id,
                d.delivered_by_user_id,
                d.verification_method || 'passkey_qr',
                d.signature_proof,
                d.challenge_nonce,
                d.is_offline_sync ? 1 : 0,
                d.delivered_at,
                d.campaign_id
              );
            }
          }
        }
      }
    } catch (sbSyncErr) {
      // Ignorar fallback silenciosamente
    }

    const totalWorkers = db.prepare("SELECT COUNT(*) as c FROM workers WHERE status = 'active'").get().c;
    const totalAssigned = db.prepare(`
      SELECT COUNT(*) as c 
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.valid_date IN (?, ?) AND c.is_active = 1 AND e.status != 'cancelled'
    `).get(todayUtc, todayVzla).c;
    const totalClaimed = db.prepare(`
      SELECT COUNT(*) as c 
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.valid_date IN (?, ?) AND e.status = 'claimed'
    `).get(todayUtc, todayVzla).c;
    const totalPending = db.prepare(`
      SELECT COUNT(*) as c 
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.valid_date IN (?, ?) AND e.status = 'pending' AND c.is_active = 1
    `).get(todayUtc, todayVzla).c;
    const totalDeliveries = db.prepare(`
      SELECT COUNT(*) as c FROM deliveries 
      WHERE date(delivered_at) IN (?, ?) 
         OR date(delivered_at, '-4 hours') IN (?, ?)
         OR substr(delivered_at, 1, 10) IN (?, ?)
         OR delivered_at >= datetime('now', '-24 hours')
    `).get(todayUtc, todayVzla, todayUtc, todayVzla, todayUtc, todayVzla).c;

    const rawDeliveries = db.prepare(`
      SELECT 
        d.id as delivery_id, d.delivered_at, d.verification_method, d.override_reason,
        COALESCE(w.document_id, 'V-00000000') as document_id,
        COALESCE(NULLIF(w.full_name, ''), 'Funcionario C.I. ' || COALESCE(w.document_id, 'N/D')) as full_name,
        COALESCE(w.worker_type, 'activo') as worker_type,
        COALESCE(dep.name, 'Nómina Central') as department_name,
        COALESCE(c.name, 'Combo Institucional') as combo_name, 
        COALESCE(c.icon, '📦') as combo_icon,
        sup.full_name as supervisor_name
      FROM deliveries d
      LEFT JOIN workers w ON d.worker_id = w.id
      LEFT JOIN daily_entitlements e ON d.entitlement_id = e.id
      LEFT JOIN combos c ON e.combo_id = c.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      WHERE date(d.delivered_at) IN (?, ?)
         OR date(d.delivered_at, '-4 hours') IN (?, ?)
         OR substr(d.delivered_at, 1, 10) IN (?, ?)
         OR d.delivered_at >= datetime('now', '-24 hours')
      ORDER BY d.delivered_at DESC
      LIMIT 500
    `).all(todayUtc, todayVzla, todayUtc, todayVzla, todayUtc, todayVzla);

    // Agrupar entregas por funcionario y momento de despacho para simplificar la vista
    const groupedMap = new Map();
    for (const d of rawDeliveries) {
      const timeKey = (d.delivered_at || '').substring(0, 19);
      const groupKey = `${d.document_id}_${timeKey}`;

      if (!groupedMap.has(groupKey)) {
        groupedMap.set(groupKey, {
          delivery_id: d.delivery_id,
          delivered_at: d.delivered_at,
          verification_method: d.verification_method,
          override_reason: d.override_reason,
          document_id: d.document_id,
          full_name: d.full_name,
          worker_type: d.worker_type,
          department_name: d.department_name,
          supervisor_name: d.supervisor_name,
          combos_count: 0,
          combos: []
        });
      }

      const grp = groupedMap.get(groupKey);
      grp.combos_count++;
      grp.combos.push({
        name: d.combo_name,
        icon: d.combo_icon || '🍱'
      });
    }

    const recentDeliveries = Array.from(groupedMap.values()).slice(0, 100);

    res.json({
      success: true,
      today,
      stats: {
        total_workers: totalWorkers,
        combos_assigned_today: totalAssigned,
        combos_delivered_today: totalDeliveries || totalClaimed,
        combos_pending_today: totalPending
      },
      recent_deliveries: recentDeliveries
    });
  } catch (err) {
    console.error('[STATS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

// 5. Reiniciar todas las entregas a 0 (Acción crítica protegida con clave de seguridad y RBAC)
const resetDeliveriesAction = (req, res) => {
  const { key, pin, password } = req.body || {};
  const providedKey = String(key || pin || password || '').trim();
  const configuredSecret = (process.env.SYSTEM_RESET_SECRET || '0578').trim();

  if (!providedKey || providedKey !== configuredSecret) {
    return res.status(403).json({
      success: false,
      error: 'Clave de seguridad de reinicio no válida o denegada.'
    });
  }

  try {
    const result = resetDeliveriesAndSeedToday();
    res.json({
      success: true,
      message: 'Todas las entregas han sido reiniciadas a 0. Asignaciones de hoy preparadas en estado pendiente.',
      data: result
    });
  } catch (err) {
    console.error('[RESET ERROR]', err);
    res.status(500).json({ error: 'Error reiniciando entregas: ' + err.message });
  }
};

// Helper interno para asegurar que el trabajador tenga asignaciones para hoy
function ensureTodayEntitlementsForWorker(workerId, today) {
  try {
    // 1. Obtener todos los combos activos del catálogo institucional
    const activeCombos = db.prepare("SELECT id, name, category, icon, weight_kg, mesa_name FROM combos WHERE is_active = 1").all();
    if (!activeCombos || activeCombos.length === 0) return;

    // 2. Consultar cuáles combos ya están asignados hoy a este trabajador
    const existingEnts = db.prepare(
      "SELECT combo_id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?"
    ).all(workerId, today);
    const existingComboIds = new Set(existingEnts.map(e => e.combo_id));

    const ins = db.prepare(`
      INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
      VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
    `);

    const newEnts = [];
    for (const combo of activeCombos) {
      if (!existingComboIds.has(combo.id)) {
        const entId = crypto.randomUUID();
        const r = ins.run(entId, workerId, combo.id, today);
        if (r.changes > 0) {
          newEnts.push({
            id: entId,
            worker_id: workerId,
            combo_id: combo.id,
            valid_date: today,
            shift: 'jornada_continua',
            status: 'pending'
          });
        }
      }
    }

    // 3. Sincronizar de forma asíncrona en Supabase si está disponible
    if (newEnts.length > 0) {
      try {
        const { supabase, isSupabaseConfigured } = require('../supabase');
        if (isSupabaseConfigured() && supabase) {
          supabase.from('daily_entitlements').upsert(newEnts, { onConflict: 'worker_id,valid_date,shift,combo_id' }).catch(() => {});
        }
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[ENSURE ENTITLEMENTS WARNING]', e.message);
  }
}

module.exports = {
  searchWorkerByCedula,
  deliverManualCombos,
  incorporateAndDeliver,
  getTodayStatsAndRecent,
  resetDeliveriesAction
};
