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

    // Asegurar que el trabajador tenga asignaciones para hoy (víveres y proteína si faltan)
    ensureTodayEntitlementsForWorker(worker.id, today);

    // Obtener los derechos / combos de hoy para este trabajador
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
      WHERE e.worker_id = ? AND e.valid_date = ?
      ORDER BY e.shift ASC
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
const deliverManualCombos = (req, res) => {
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
        WHERE e.id IN (${placeholders}) AND e.worker_id = ? AND e.valid_date = ?
      `).all(...entitlement_ids, worker_id, today);
    } else {
      // Tomar todos o la cantidad solicitada
      const limit = quantity ? parseInt(quantity, 10) : 99;
      pendingList = db.prepare(`
        SELECT e.id, e.combo_id, e.status, c.name as combo_name
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND e.valid_date = ? AND e.status = 'pending'
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

    // Consultar resumen actualizado
    const allEnts = db.prepare("SELECT status FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?").all(worker.id, today);
    const remainingPending = allEnts.filter(e => e.status === 'pending').length;

    // Respaldo asíncrono en Supabase si está disponible
    try {
      const { supabase, isSupabaseConfigured } = require('../supabase');
      if (isSupabaseConfigured() && supabase) {
        for (const item of deliveredItems) {
          supabase.from('daily_entitlements').update({ status: 'claimed' }).eq('id', item.entitlement_id).catch(() => {});
          supabase.from('deliveries').insert([{
            id: item.delivery_id,
            entitlement_id: item.entitlement_id,
            worker_id: worker.id,
            verification_method: 'manual_rrhh',
            delivered_at: new Date().toISOString()
          }]).catch(() => {});
        }
      }
    } catch (e) {}

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

    // 2. Asignar combos para hoy
    const vCombo = db.prepare("SELECT id, name FROM combos WHERE category IN ('bolsa_viveres') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get();
    const pCombo = db.prepare("SELECT id, name FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();

    const vComboId = vCombo ? vCombo.id : 'c1a2b3c4-1111-2222-3333-444455556666';
    const pComboId = pCombo ? pCombo.id : 'ae65fee7-79f6-48a3-bc41-a61c928876b5';

    const insEnt = db.prepare(`
      INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const createdEnts = [];
    const ent1Id = crypto.randomUUID();
    insEnt.run(ent1Id, workerId, vComboId, today, 'estacion_1');
    createdEnts.push({ id: ent1Id, combo_id: vComboId, name: vCombo ? vCombo.name : 'Bolsa de Víveres Secos' });

    // Si la cantidad asignada es 2 o más (por defecto 2: víveres + proteína)
    const qty = combos_qty !== undefined ? parseInt(combos_qty, 10) : 2;
    if (qty >= 2) {
      const ent2Id = crypto.randomUUID();
      insEnt.run(ent2Id, workerId, pComboId, today, 'estacion_2');
      createdEnts.push({ id: ent2Id, combo_id: pComboId, name: pCombo ? pCombo.name : 'Combo Proteico Fresco' });
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
const getTodayStatsAndRecent = (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  try {
    const totalWorkers = db.prepare("SELECT COUNT(*) as c FROM workers WHERE status = 'active'").get().c;
    const totalAssigned = db.prepare("SELECT COUNT(*) as c FROM daily_entitlements WHERE valid_date = ?").get(today).c;
    const totalClaimed = db.prepare("SELECT COUNT(*) as c FROM daily_entitlements WHERE valid_date = ? AND status = 'claimed'").get(today).c;
    const totalPending = db.prepare("SELECT COUNT(*) as c FROM daily_entitlements WHERE valid_date = ? AND status = 'pending'").get(today).c;
    const totalDeliveries = db.prepare("SELECT COUNT(*) as c FROM deliveries WHERE date(delivered_at) = ? OR date('now') = ?").get(today, today).c;

    const recentDeliveries = db.prepare(`
      SELECT 
        d.id as delivery_id, d.delivered_at, d.verification_method, d.override_reason,
        w.document_id, w.full_name, w.worker_type,
        dep.name as department_name,
        c.name as combo_name, c.icon as combo_icon,
        sup.full_name as supervisor_name
      FROM deliveries d
      JOIN workers w ON d.worker_id = w.id
      JOIN daily_entitlements e ON d.entitlement_id = e.id
      JOIN combos c ON e.combo_id = c.id
      LEFT JOIN departments dep ON w.department_id = dep.id
      LEFT JOIN workers sup ON d.delivered_by_user_id = sup.id
      WHERE date(d.delivered_at) = ? OR date('now') = ?
      ORDER BY d.delivered_at DESC
      LIMIT 20
    `).all(today, today);

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

// 5. Reiniciar todas las entregas a 0 (Acción solicitada por el usuario)
const resetDeliveriesAction = (req, res) => {
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
    const count = db.prepare("SELECT COUNT(*) as c FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?").get(workerId, today).c;
    if (count === 0) {
      const vCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get();
      const pCombo = db.prepare("SELECT id FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();
      
      const vComboId = vCombo ? vCombo.id : 'c1a2b3c4-1111-2222-3333-444455556666';
      const pComboId = pCombo ? pCombo.id : 'ae65fee7-79f6-48a3-bc41-a61c928876b5';

      const ins = db.prepare("INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status) VALUES (?, ?, ?, ?, ?, 'pending')");
      ins.run(crypto.randomUUID(), workerId, vComboId, today, 'estacion_1');
      ins.run(crypto.randomUUID(), workerId, pComboId, today, 'estacion_2');
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
