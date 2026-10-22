// backend/controllers/sync.controller.js
// Controlador para sincronización offline-first, paquetes diarios e inserción de lotes con reconciliación

const crypto = require('crypto');
const { db } = require('../db');

const getDailyPack = (req, res) => {
  const distribution_point_id = req.query.distribution_point_id || '550e8400-e29b-41d4-a716-446655440000';
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];

  const workers = db.prepare(`
    SELECT DISTINCT w.id as worker_id, w.document_id, w.full_name, w.has_smartphone, w.contingency_reason, w.shift, w.worker_type
    FROM workers w
    WHERE w.status = 'active'
    ORDER BY w.full_name ASC
  `).all();

  const getPasskeys = db.prepare(`
    SELECT credential_id, public_key as public_key_pem, sign_count
    FROM passkey_credentials
    WHERE worker_id = ? AND status = 'active'
  `);

  const getNfc = db.prepare(`
    SELECT card_uid, status
    FROM nfc_cards
    WHERE worker_id = ? AND status = 'active'
  `);

  const getEntitlements = db.prepare(`
    SELECT e.id as entitlement_id, e.combo_id, c.name as combo_name, e.shift, e.status
    FROM daily_entitlements e
    JOIN combos c ON e.combo_id = c.id
    WHERE e.worker_id = ? AND e.valid_date = ?
  `);

  const vCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres', 'almuerzo') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get();
  const pCombo = db.prepare("SELECT id FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get();
  const defaultViveresId = vCombo ? vCombo.id : 'c1a2b3c4-1111-2222-3333-444455556666';
  const defaultProteicoId = pCombo ? pCombo.id : 'ae65fee7-79f6-48a3-bc41-a61c928876b5';

  const insertAutoEntitlement = db.prepare(`
    INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const active_workers = workers.map(w => {
    let entitlements = getEntitlements.all(w.worker_id, targetDate);
    const hasS1 = entitlements && entitlements.some(e => e.shift === 'estacion_1' || (e.combo_name && e.combo_name.toLowerCase().includes('víveres')));
    const hasS2 = entitlements && entitlements.some(e => e.shift === 'estacion_2' || (e.combo_name && e.combo_name.toLowerCase().includes('prote')));

    if (!hasS1) {
      try {
        insertAutoEntitlement.run(crypto.randomUUID(), w.worker_id, defaultViveresId, targetDate, 'estacion_1');
      } catch (e) {}
    }
    if (!hasS2) {
      try {
        insertAutoEntitlement.run(crypto.randomUUID(), w.worker_id, defaultProteicoId, targetDate, 'estacion_2');
      } catch (e) {}
    }

    entitlements = getEntitlements.all(w.worker_id, targetDate);


    return {
      worker_id: w.worker_id,
      document_id: w.document_id,
      full_name: w.full_name,
      has_smartphone: Boolean(w.has_smartphone),
      contingency_reason: w.contingency_reason,
      shift: w.shift,
      worker_type: w.worker_type || 'activo',
      public_keys: getPasskeys.all(w.worker_id),
      nfc_cards: getNfc.all(w.worker_id),
      entitlements: entitlements || []
    };
  });

  res.json({
    distribution_point_id,
    sync_timestamp: new Date().toISOString(),
    valid_date: targetDate,
    total_workers: active_workers.length,
    active_workers
  });
};

const batchDeliveries = (req, res) => {
  const { distribution_point_id, device_id, deliveries } = req.body;
  if (!deliveries || !Array.isArray(deliveries)) {
    return res.status(400).json({ error: 'Array de entregas requerido' });
  }

  let processed = 0;
  let failedDuplicates = 0;
  const results = [];

  const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
  const defaultCampId = activeCamp ? activeCamp.id : null;

  const insertDelivery = db.prepare(`
    INSERT INTO deliveries (
      id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
      verification_method, signature_proof, challenge_nonce, supervisor_id,
      override_reason, is_offline_sync, delivered_at, synced_at, campaign_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
  `);

  const tx = db.transaction(() => {
    const defaultPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const fallbackPointId = defaultPoint ? defaultPoint.id : null;
    const defaultOperator = db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
    const fallbackOperatorId = defaultOperator ? defaultOperator.id : null;

    for (const d of deliveries) {
      try {
        const deliveryId = d.id || crypto.randomUUID();
        const isOffline = d.is_offline_sync !== undefined ? (d.is_offline_sync ? 1 : 0) : 1;

        let ptId = distribution_point_id || d.distribution_point_id;
        if (ptId) {
          const ptExists = db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(ptId);
          if (!ptExists) ptId = fallbackPointId;
        } else {
          ptId = fallbackPointId;
        }

        let opId = d.delivered_by_user_id;
        if (opId) {
          const opExists = db.prepare("SELECT id FROM workers WHERE id = ?").get(opId);
          if (!opExists) opId = fallbackOperatorId;
        } else {
          opId = fallbackOperatorId;
        }

        insertDelivery.run(
          deliveryId,
          d.entitlement_id,
          d.worker_id,
          ptId,
          opId,
          d.verification_method || 'passkey_qr',
          d.signature_proof || null,
          d.challenge_nonce || null,
          d.supervisor_id || null,
          d.override_reason || null,
          isOffline,
          d.delivered_at || new Date().toISOString(),
          d.campaign_id || defaultCampId
        );

        processed++;
        results.push({
          id: deliveryId,
          worker_id: d.worker_id,
          status: 'accepted',
          verification_method: d.verification_method
        });
      } catch (err) {
        if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
          failedDuplicates++;
          results.push({
            id: d.id,
            worker_id: d.worker_id,
            status: 'rejected_duplicate',
            reason: 'Violación de restricción única idx_unique_daily_claim: Beneficio ya reclamado hoy'
          });
        } else {
          results.push({
            id: d.id,
            worker_id: d.worker_id,
            status: 'error',
            reason: err.message
          });
        }
      }
    }
  });

  tx();

  res.json({
    status: 'completed',
    distribution_point_id,
    device_id,
    total_received: deliveries.length,
    processed,
    failed_duplicates: failedDuplicates,
    results
  });
};

module.exports = {
  getDailyPack,
  batchDeliveries
};
