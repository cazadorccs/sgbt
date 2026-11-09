// backend/controllers/simulation.controller.js
// Controlador para el Simulador Dual de Despacho (100 Entregas en Vivo con Teléfono Beneficiario y Teléfono Mesa)

const crypto = require('crypto');
const { db } = require('../db');

/**
 * Obtiene los primeros 100 trabajadores activos para la simulación
 */
const getSimulationWorkers = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Obtener los primeros 100 trabajadores activos de la nómina
    const workers = db.prepare(`
      SELECT 
        w.id,
        w.document_id,
        w.full_name,
        w.worker_type,
        w.role,
        COALESCE(d.name, 'Nómina Central MIPPCI') as department_name,
        w.avatar_url
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.status = 'active' AND w.document_id NOT IN ('V-00000000', '00000000', '')
      ORDER BY w.document_id ASC
      LIMIT 100
    `).all();

    // Obtener los combos disponibles de la jornada activa
    const activeCampaign = db.prepare("SELECT id, name FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get()
      || db.prepare("SELECT id, name FROM delivery_campaigns ORDER BY start_date DESC LIMIT 1").get();

    const combos = db.prepare("SELECT id, name, category, icon, weight_kg FROM combos WHERE is_active = 1 ORDER BY mesa_number ASC").all();
    const defaultCombo = combos.find(c => c.category === 'bolsa_viveres') || combos[0] || {
      id: 'c1a2b3c4-1111-2222-3333-444455556666',
      name: 'Bolsa de Víveres Secos (Canasta Básica MIPPCI)',
      icon: '🌾',
      weight_kg: 14.5
    };

    // Verificar el estado de entrega actual de estos 100 trabajadores hoy
    const enrichedWorkers = workers.map((w, index) => {
      const delivery = db.prepare(`
        SELECT d.id, d.delivered_at, d.verification_method, d.signature_proof
        FROM deliveries d
        WHERE d.worker_id = ? 
          AND (
            date(d.delivered_at) = ? 
            OR date(d.delivered_at, '-4 hours') = ?
            OR d.delivered_at >= datetime('now', '-24 hours')
          )
        ORDER BY d.delivered_at DESC LIMIT 1
      `).get(w.id, today, today);

      return {
        ...w,
        order_index: index + 1,
        combo: defaultCombo,
        is_already_delivered: Boolean(delivery),
        delivered_at: delivery?.delivered_at || null,
        verification_method: delivery?.verification_method || null
      };
    });

    res.json({
      success: true,
      total_workers: enrichedWorkers.length,
      active_campaign: activeCampaign,
      default_combo: defaultCombo,
      available_combos: combos,
      workers: enrichedWorkers
    });
  } catch (err) {
    console.error('[SIMULATION WORKERS ERROR]', err);
    res.status(500).json({ error: 'Error al cargar lista de 100 beneficiarios para simulación' });
  }
};

/**
 * Ejecuta el escaneo y despacho individual de un trabajador en la simulación
 */
const dispatchStep = async (req, res) => {
  const { worker_id, verification_method, combo_id, station } = req.body;

  if (!worker_id) {
    return res.status(400).json({ error: 'worker_id es requerido para el despacho simulado' });
  }

  const todayUtc = new Date().toISOString().split('T')[0];
  const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const method = verification_method || 'passkey_qr';
  const targetStation = station || 'all';

  try {
    const worker = db.prepare(`
      SELECT w.id, w.document_id, w.full_name, w.worker_type, COALESCE(d.name, 'Nómina Central') as department_name
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.id = ?
    `).get(worker_id);

    if (!worker) {
      return res.status(404).json({ error: 'Trabajador no encontrado en la nómina' });
    }

    const targetComboId = combo_id || 'c1a2b3c4-1111-2222-3333-444455556666';
    const combo = db.prepare('SELECT id, name, category, icon, weight_kg FROM combos WHERE id = ?').get(targetComboId)
      || db.prepare('SELECT id, name, category, icon, weight_kg FROM combos WHERE is_active = 1 LIMIT 1').get();

    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campaignId = activeCamp ? activeCamp.id : null;

    // Buscar sede de despacho
    const distPoint = db.prepare("SELECT id FROM distribution_points WHERE is_active = 1 LIMIT 1").get();
    const pointId = distPoint ? distPoint.id : 'b12f492f-ebb3-430f-bc20-26ca4aa5b865';

    // Obtener supervisor/operador
    const supervisor = db.prepare("SELECT id, full_name FROM workers WHERE role IN ('admin', 'supervisor') LIMIT 1").get()
      || { id: worker.id, full_name: 'Operador de Mesa de Despacho' };

    // Buscar o crear daily_entitlement para hoy
    let entitlement = db.prepare(`
      SELECT id, status FROM daily_entitlements 
      WHERE worker_id = ? AND (valid_date = ? OR valid_date = ?) AND combo_id = ?
      LIMIT 1
    `).get(worker.id, todayUtc, todayVzla, combo.id);

    if (!entitlement) {
      const entId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status, campaign_id, distribution_point_id)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'pending', ?, ?)
      `).run(entId, worker.id, combo.id, todayVzla, campaignId, pointId);
      entitlement = { id: entId, status: 'pending' };
    }

    // Verificar si ya fue entregado
    const existingDelivery = db.prepare('SELECT id, delivered_at FROM deliveries WHERE entitlement_id = ?').get(entitlement.id);
    if (existingDelivery) {
      return res.json({
        success: true,
        already_claimed: true,
        message: `El funcionario ya retiró su combo previamente`,
        delivery_id: existingDelivery.id,
        delivered_at: existingDelivery.delivered_at,
        worker,
        combo
      });
    }

    // Generar sello criptográfico firmado con clave simulada SHA-256
    const deliveryId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const signatureProof = crypto.createHash('sha256')
      .update(`${deliveryId}:${worker.document_id}:${combo.id}:${nowIso}:${nonce}`)
      .digest('hex');

    // Registrar despacho en transacción atómica
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO deliveries (
          id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
          verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id, override_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'Simulador Dual P2P (Beneficiario / Mesa)')
      `).run(
        deliveryId,
        entitlement.id,
        worker.id,
        pointId,
        supervisor.id,
        method,
        signatureProof,
        nonce,
        nowIso,
        campaignId
      );

      db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(entitlement.id);
    });

    tx();

    // Contar total despachado hoy
    const totalDeliveredToday = db.prepare(`
      SELECT COUNT(*) as c FROM deliveries 
      WHERE date(delivered_at) IN (?, ?) 
         OR date(delivered_at, '-4 hours') IN (?, ?)
         OR delivered_at >= datetime('now', '-24 hours')
    `).get(todayUtc, todayVzla, todayUtc, todayVzla)?.c || 1;

    res.json({
      success: true,
      delivery_id: deliveryId,
      delivered_at: nowIso,
      verification_method: method,
      signature_proof: signatureProof,
      worker,
      combo,
      total_delivered_today: totalDeliveredToday
    });

  } catch (err) {
    console.error('[SIMULATION DISPATCH ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Reinicia las entregas de los 100 trabajadores de la simulación
 */
const resetSimulation100 = (req, res) => {
  try {
    const todayUtc = new Date().toISOString().split('T')[0];
    const todayVzla = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

    const workers = db.prepare(`
      SELECT id FROM workers 
      WHERE status = 'active' AND document_id NOT IN ('V-00000000', '00000000', '')
      ORDER BY document_id ASC LIMIT 100
    `).all();

    const workerIds = workers.map(w => w.id);
    let resetCount = 0;

    const tx = db.transaction(() => {
      for (const wId of workerIds) {
        // Eliminar entregas simuladas de hoy
        const delRes = db.prepare(`
          DELETE FROM deliveries 
          WHERE worker_id = ? 
            AND (
              date(delivered_at) IN (?, ?)
              OR override_reason LIKE '%Simulador Dual%'
            )
        `).run(wId, todayUtc, todayVzla);

        // Revertir entitlements a pending
        db.prepare(`
          UPDATE daily_entitlements 
          SET status = 'pending' 
          WHERE worker_id = ? AND valid_date IN (?, ?)
        `).run(wId, todayUtc, todayVzla);

        if (delRes.changes > 0) resetCount += delRes.changes;
      }
    });

    tx();

    res.json({
      success: true,
      message: `Simulación reiniciada. ${resetCount} despachos revertidos para pruebas limpias.`
    });
  } catch (err) {
    console.error('[SIMULATION RESET ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getSimulationWorkers,
  dispatchStep,
  resetSimulation100
};

