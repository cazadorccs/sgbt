// backend/controllers/sync.controller.js
// Controlador para sincronización offline-first, paquetes diarios e inserción de lotes con reconciliación

const crypto = require('crypto');
const { db } = require('../db');
const { verifyOfflineSignature } = require('../crypto-utils');
const { processBatchDeliveries } = require('../services/delivery.service');

const getDailyPack = (req, res) => {
  const t0 = Date.now();
  const distribution_point_id = req.query.distribution_point_id || '550e8400-e29b-41d4-a716-446655440000';
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];

  // 1. Obtener todos los combos activos del catálogo institucional
  const activeCombos = db.prepare(`
    SELECT id, name, description, category, icon, mesa_name, mesa_number, weight_kg, items_detail
    FROM combos
    WHERE is_active = 1
    ORDER BY created_at ASC, id ASC
  `).all();

  // 2. Garantizar auto-asignación diaria de TODOS los combos activos para trabajadores activos
  try {
    const existingEnts = db.prepare(`
      SELECT de.worker_id, de.combo_id
      FROM daily_entitlements de
      WHERE de.valid_date = ?
    `).all(targetDate);

    const workerComboMap = new Map();
    for (const e of existingEnts) {
      if (!workerComboMap.has(e.worker_id)) {
        workerComboMap.set(e.worker_id, new Set());
      }
      workerComboMap.get(e.worker_id).add(e.combo_id);
    }

    const activeWorkerList = db.prepare("SELECT id FROM workers WHERE status = 'active'").all();
    const insertBatchEnt = db.prepare(`
      INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const txSeed = db.transaction(() => {
      for (const w of activeWorkerList) {
        const assignedSet = workerComboMap.get(w.id);
        for (const combo of activeCombos) {
          if (!assignedSet || !assignedSet.has(combo.id)) {
            const shiftName = combo.mesa_name ? combo.mesa_name.split(' - ')[0].toLowerCase().replace(/\s+/g, '_') : 'jornada_continua';
            insertBatchEnt.run(crypto.randomUUID(), w.id, combo.id, targetDate, shiftName);
          }
        }
      }
    });
    txSeed();
  } catch (seedErr) {
    console.warn('[DAILY PACK AUTO-ENTITLEMENTS WARNING]', seedErr.message);
  }

  // 2. Ejecutar 4 consultas indexadas masivas (en lugar de N * 4 consultas iterativas)
  const workers = db.prepare(`
    SELECT DISTINCT w.id as worker_id, w.document_id, w.full_name, w.has_smartphone, w.contingency_reason, w.shift, w.worker_type
    FROM workers w
    WHERE w.status = 'active'
    ORDER BY w.full_name ASC
  `).all();

  const allPasskeys = db.prepare(`
    SELECT worker_id, credential_id, public_key as public_key_pem, sign_count
    FROM passkey_credentials
    WHERE status = 'active'
  `).all();

  const allNfc = db.prepare(`
    SELECT worker_id, card_uid, status
    FROM nfc_cards
    WHERE status = 'active'
  `).all();

  const allEntitlements = db.prepare(`
    SELECT de.worker_id, de.id as entitlement_id, de.combo_id, c.name as combo_name, de.shift, de.status
    FROM daily_entitlements de
    JOIN combos c ON de.combo_id = c.id
    WHERE de.valid_date = ? AND (c.is_active = 1 OR de.status = 'claimed')
  `).all(targetDate);

  // 3. Indexación en memoria O(1) mediante Maps para rendimiento instantáneo
  const passkeysMap = new Map();
  for (const p of allPasskeys) {
    let list = passkeysMap.get(p.worker_id);
    if (!list) { list = []; passkeysMap.set(p.worker_id, list); }
    list.push({
      credential_id: p.credential_id,
      public_key_pem: p.public_key_pem,
      sign_count: p.sign_count
    });
  }

  const nfcMap = new Map();
  for (const n of allNfc) {
    let list = nfcMap.get(n.worker_id);
    if (!list) { list = []; nfcMap.set(n.worker_id, list); }
    list.push({
      card_uid: n.card_uid,
      status: n.status
    });
  }

  const entitlementsMap = new Map();
  for (const e of allEntitlements) {
    let list = entitlementsMap.get(e.worker_id);
    if (!list) { list = []; entitlementsMap.set(e.worker_id, list); }
    list.push({
      entitlement_id: e.entitlement_id,
      combo_id: e.combo_id,
      combo_name: e.combo_name,
      shift: e.shift,
      status: e.status
    });
  }

  const active_workers = workers.map(w => ({
    worker_id: w.worker_id,
    document_id: w.document_id,
    full_name: w.full_name,
    has_smartphone: Boolean(w.has_smartphone),
    contingency_reason: w.contingency_reason,
    shift: w.shift,
    worker_type: w.worker_type || 'activo',
    public_keys: passkeysMap.get(w.worker_id) || [],
    nfc_cards: nfcMap.get(w.worker_id) || [],
    entitlements: entitlementsMap.get(w.worker_id) || []
  }));

  const dur = Date.now() - t0;
  console.log(`⚡ [DAILY PACK GENERATED] ${active_workers.length} funcionarios procesados en ${dur}ms (Optimización Fase 2)`);

  res.json({
    distribution_point_id,
    sync_timestamp: new Date().toISOString(),
    valid_date: targetDate,
    total_workers: active_workers.length,
    combos: activeCombos,
    active_workers
  });
};

const batchDeliveries = async (req, res) => {
  const { distribution_point_id, device_id, deliveries } = req.body;
  if (!deliveries || !Array.isArray(deliveries)) {
    return res.status(400).json({ error: 'Array de entregas requerido' });
  }

  const batchResult = processBatchDeliveries(deliveries, distribution_point_id);

  // Persistencia Criptográfica en la Nube (Supabase Cloud) con AWAIT
  if (batchResult.results && batchResult.results.length > 0) {
    try {
      const { persistDeliveries } = require('../services/cloud_sync.service');
      const successfulDeliveries = batchResult.results
        .filter(r => r.status === 'success' || r.status === 'duplicate_ignored')
        .map(r => ({
          id: r.delivery_id,
          entitlement_id: r.entitlement_id,
          worker_id: r.worker_id,
          distribution_point_id: distribution_point_id || '5b0f10e3-7eac-4872-bf96-74ecd359be7e',
          verification_method: 'offline_sync',
          is_offline_sync: true,
          delivered_at: new Date().toISOString()
        }));
      if (successfulDeliveries.length > 0) {
        await persistDeliveries(successfulDeliveries);
      }
    } catch (e) {
      console.warn('[BATCH SYNC CLOUD PERSIST WARN]', e.message);
    }
  }

  res.json({
    status: 'completed',
    distribution_point_id,
    device_id,
    total_received: deliveries.length,
    processed: batchResult.processed,
    failed_duplicates: batchResult.failed_duplicates,
    duplicates_ignored: batchResult.duplicates_ignored,
    results: batchResult.results
  });
};

module.exports = {
  getDailyPack,
  batchDeliveries
};
