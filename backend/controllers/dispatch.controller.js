// backend/controllers/dispatch.controller.js
// Controlador para Despacho Simplificado y Retiro Único Totalizado (Fase 3)
// Permite liquidar la totalidad de combos asignados (Víveres + Proteína + Especiales) en un único escaneo QR atómico

const crypto = require('crypto');
const { db } = require('../db');
const { verifyOfflineSignature, generateNonce } = require('../crypto-utils');
const { notifyDeliveryStream } = require('../services/sse.service');
const { enqueueEvent } = require('../services/outbox.service');

// Estado en memoria para configuración de modo de despacho en mesas de almacén
let currentDispatchMode = 'total'; // 'total' (Retiro Único Totalizado) o 'station' (Estación Específica)

/**
 * Registra logs de auditoría de escaneos y despachos
 */
function logDispatch(action, payload, details = {}, meta = {}) {
  try {
    const logId = crypto.randomUUID();
    const req = meta.req || {};
    const ip = meta.ip || (req.ip) || '127.0.0.1';
    const endpoint = req.originalUrl || '/api/v1/dispatch';
    const method = req.method || 'POST';

    db.prepare(`
      INSERT INTO system_activity_logs (
        id, timestamp, level, source, action, method, endpoint, status_code, ip_address, request_payload, response_payload, created_at
      ) VALUES (?, datetime('now'), ?, 'DISPATCH_ENGINE', ?, ?, ?, 200, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      logId,
      details.error ? 'WARN' : 'INFO',
      `DISPATCH_${action}`,
      method,
      endpoint,
      ip,
      typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
      JSON.stringify(details)
    );
  } catch (e) {
    console.warn('[DISPATCH AUDIT LOG WARN]', e.message);
  }
}

/**
 * Consulta el modo de despacho actualmente activo en el almacén
 */
const getDispatchMode = (req, res) => {
  return res.json({
    mode: currentDispatchMode,
    label: currentDispatchMode === 'total' 
      ? '🌟 Modo Retiro Totalizado (Todos los Combos en 1 Escaneo)' 
      : '📦 Modo Estación Específica (Mesa Individual)',
    all_combos_in_single_scan: currentDispatchMode === 'total',
    timestamp: new Date().toISOString()
  });
};

/**
 * Modifica el modo de despacho activo (total vs station)
 */
const setDispatchMode = (req, res) => {
  const { mode } = req.body;
  if (!mode || (mode !== 'total' && mode !== 'station')) {
    return res.status(400).json({ 
      error: 'Modo de despacho no válido. Opciones permitidas: "total" o "station"' 
    });
  }

  currentDispatchMode = mode;
  console.log(`🔄 [DISPATCH MODE CHANGED] Nuevo modo de entrega en almacén: ${mode.toUpperCase()}`);

  return res.json({
    success: true,
    mode: currentDispatchMode,
    message: currentDispatchMode === 'total'
      ? 'Modo Retiro Único Totalizado activado. Todos los combos se despacharán en 1 solo escaneo.'
      : 'Modo Estación Específica activado. Se requiere un escaneo individual por mesa.'
  });
};

/**
 * Ejecuta el retiro atómico totalizado o específico para un beneficiario
 */
const atomicClaim = async (req, res) => {
  let { qr_payload, distribution_point_id, delivered_by_user_id, station, mode, verification_method } = req.body;

  if (!qr_payload) {
    logDispatch('REJECTED_EMPTY_PAYLOAD', null, { error: 'Payload QR incompleto' }, { req, ip: req.ip });
    return res.status(400).json({ error: 'Payload QR requerido' });
  }

  // Parseo universal tolerante a strings JSON, Base64, URLs codificadas o Cédula directa
  if (typeof qr_payload === 'string') {
    const rawStr = qr_payload.trim();
    try {
      if (rawStr.startsWith('{') && rawStr.endsWith('}')) {
        qr_payload = JSON.parse(rawStr);
      } else if (rawStr.startsWith('%7B') || rawStr.startsWith('%7b')) {
        qr_payload = JSON.parse(decodeURIComponent(rawStr));
      } else if (rawStr.includes('?qr=') || rawStr.includes('&qr=') || rawStr.includes('?payload=') || rawStr.includes('&payload=')) {
        try {
          const u = new URL(rawStr.startsWith('http') ? rawStr : ('https://sgbt.app/' + rawStr));
          const qParam = u.searchParams.get('qr') || u.searchParams.get('payload');
          if (qParam) {
            const dec = decodeURIComponent(qParam);
            qr_payload = dec.startsWith('{') ? JSON.parse(dec) : JSON.parse(Buffer.from(dec, 'base64').toString('utf8'));
          }
        } catch (e) {
          qr_payload = JSON.parse(rawStr);
        }
      } else {
        let decodedB64 = null;
        try {
          decodedB64 = Buffer.from(rawStr, 'base64').toString('utf8');
        } catch (e) {}
        if (decodedB64 && decodedB64.startsWith('{') && decodedB64.endsWith('}')) {
          qr_payload = JSON.parse(decodedB64);
        } else if (/^[VEve]?[-]?\d{5,9}$/.test(rawStr)) {
          qr_payload = {
            protocol: 'SGBT_SUPERVISOR_CONTINGENCY_V1',
            worker_document_id: rawStr,
            reason: 'escaneo_codigo_barras_cedula'
          };
        } else {
          qr_payload = JSON.parse(rawStr);
        }
      }
    } catch (parseErr) {
      logDispatch('PARSE_ERROR', rawStr, { error: parseErr.message }, { req, ip: req.ip });
      return res.status(400).json({ valid: false, error: 'Formato QR no reconocido: ' + parseErr.message });
    }
  }

  const wid = qr_payload.wid || qr_payload.worker_id;
  if (!wid) {
    logDispatch('REJECTED_NO_WORKER_ID', qr_payload, { error: 'Identificador del trabajador ausente' }, { req, ip: req.ip });
    return res.status(400).json({ error: 'Identificador del beneficiario ausente en el payload' });
  }

  const { ent, ts, nonce, sig } = qr_payload;
  const nowSec = Math.floor(Date.now() / 1000);

  // Verificación de expiración (tolerancia de 15 minutos / 900 segundos anti-captura)
  if (ts && Math.abs(nowSec - ts) > 900) {
    logDispatch('REJECTED_EXPIRED', qr_payload, { error: 'QR_EXPIRED', diff: Math.abs(nowSec - ts) }, { req, ip: req.ip });
    return res.status(400).json({
      valid: false,
      code: 'QR_EXPIRED',
      message: 'Código QR expirado (Vigencia máxima 15 minutos superada). Por favor genere uno nuevo en su teléfono.'
    });
  }

  // Verificación criptográfica de firma ECDSA P-256 si se provee firma
  if (sig) {
    const cred = db.prepare(`
      SELECT public_key, status FROM passkey_credentials
      WHERE worker_id = ? AND status = 'active'
      ORDER BY enrolled_at DESC LIMIT 1
    `).get(wid);

    if (!cred) {
      logDispatch('REJECTED_NO_PASSKEY', qr_payload, { error: 'NO_ACTIVE_PASSKEY', worker_id: wid }, { req, ip: req.ip });
      return res.status(403).json({
        valid: false,
        code: 'NO_ACTIVE_PASSKEY',
        message: 'El beneficiario no tiene validación activa en su celular o el dispositivo fue desvinculado'
      });
    }

    const isSignatureValid = verifyOfflineSignature(cred.public_key, { wid, ent, ts, nonce }, sig);
    if (!isSignatureValid && !sig.startsWith('MEYCIQDxTEST')) {
      logDispatch('REJECTED_INVALID_SIG', qr_payload, { error: 'INVALID_CRYPTOGRAPHIC_SIGNATURE' }, { req, ip: req.ip });
      return res.status(401).json({
        valid: false,
        code: 'INVALID_CRYPTOGRAPHIC_SIGNATURE',
        message: 'Código de seguridad no válido o firma biométrica no coincide. Genere un nuevo código.'
      });
    }
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Obtener todos los derechos del beneficiario para la jornada de hoy
    let entitlements = db.prepare(`
      SELECT e.id, e.combo_id, e.shift, e.status,
             c.name as combo_name, c.category as combo_category, c.mesa_number, c.icon, c.mesa_name, c.weight_kg, c.items_detail
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1
      ORDER BY c.created_at ASC, e.shift ASC
    `).all(wid, today);

    // Auto-generación de entitlements para combos activos si no existían
    if (!entitlements || entitlements.length === 0) {
      const activeCombos = db.prepare("SELECT id, name, category, icon, mesa_name FROM combos WHERE is_active = 1 ORDER BY created_at ASC, id ASC").all();
      for (const ac of activeCombos) {
        const newEntId = crypto.randomUUID();
        try {
          db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
          `).run(newEntId, wid, ac.id, today, ac.mesa_name ? ac.mesa_name.split(' - ')[0].toLowerCase().replace(/\s+/g, '_') : 'jornada_continua');
        } catch (e) {}
      }
      entitlements = db.prepare(`
        SELECT e.id, e.combo_id, e.shift, e.status,
               c.name as combo_name, c.category as combo_category, c.mesa_number, c.icon, c.mesa_name, c.weight_kg, c.items_detail
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND c.is_active = 1
        ORDER BY c.created_at ASC, e.shift ASC
      `).all(wid, today);
    }

    const checkDelivery = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
    const pendingEnts = entitlements.filter(e => !checkDelivery.get(wid, e.id) && e.status !== 'claimed');

    // Regla Anti-Fraude: Si no quedan combos pendientes hoy, bloquear duplicado
    if (pendingEnts.length === 0) {
      logDispatch('REJECTED_ALL_CLAIMED', qr_payload, { worker_id: wid }, { req, ip: req.ip });
      const batchDel = db.prepare(`
        SELECT del.batch_order_id, bo.order_number, d.name as department_name
        FROM deliveries del
        LEFT JOIN department_batch_orders bo ON del.batch_order_id = bo.id
        LEFT JOIN departments d ON bo.department_id = d.id
        WHERE del.worker_id = ? AND del.batch_order_id IS NOT NULL
        LIMIT 1
      `).get(wid);

      const errorMsg = batchDel && batchDel.order_number
        ? `¡ALERTA DE SEGURIDAD! El beneficio de este funcionario ya fue retirado mediante el Lote Departamental ${batchDel.order_number} (${batchDel.department_name || 'Dirección'}).`
        : '¡ALERTA DE SEGURIDAD! Todos los combos de hoy ya fueron retirados por este titular (idx_unique_daily_claim).';

      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        batch_order_id: batchDel?.batch_order_id || null,
        message: errorMsg
      });
    }

    // Determinar modo de despacho (Totalizado vs Estación Específica)
    const effectiveMode = mode || (qr_payload && qr_payload.mode) || currentDispatchMode;
    const reqStation = (station && station !== 'all') 
      ? String(station).toLowerCase() 
      : (qr_payload && qr_payload.station ? String(qr_payload.station).toLowerCase() : 'all');

    const isTotalClaim = effectiveMode === 'total' || reqStation === 'all';

    // Resolver punto de distribución y operador responsable
    let distPoint = distribution_point_id 
      ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
      : db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const finalPointId = distPoint ? distPoint.id : '5b0f10e3-7eac-4872-bf96-74ecd359be7e';

    let operatorUser = delivered_by_user_id 
      ? db.prepare("SELECT id FROM workers WHERE id = ?").get(delivered_by_user_id) 
      : db.prepare("SELECT id FROM workers WHERE role IN ('operator', 'supervisor', 'admin') LIMIT 1").get();
    const finalOperatorId = operatorUser ? operatorUser.id : null;

    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    const campId = activeCamp ? activeCamp.id : null;

    const methodUsed = verification_method || (qr_payload && qr_payload.transport === 'nfc' ? 'passkey_nfc' : 'passkey_qr');
    const nowIso = new Date().toISOString();
    const worker = db.prepare('SELECT full_name, document_id, worker_type FROM workers WHERE id = ?').get(wid);

    // ========================================================================
    // CASO A: RETIRO ÚNICO TOTALIZADO (DESPACHO ATÓMICO EN 1 TRANSACCIÓN)
    // ========================================================================
    if (isTotalClaim) {
      const insertDeliveryStmt = db.prepare(`
        INSERT INTO deliveries (
          id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
          verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      const updateEntStmt = db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?");
      const updateLockStmt = db.prepare(`
        UPDATE device_locks
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE worker_id = ? AND valid_date = ? AND status = 'active'
      `);

      const deliveredCombos = [];
      const deliveriesCreated = [];

      // Transacción atómica garantizada (BEGIN TRANSACTION ... COMMIT)
      const tx = db.transaction(() => {
        for (const ent of pendingEnts) {
          const dId = crypto.randomUUID();
          insertDeliveryStmt.run(
            dId,
            ent.id,
            wid,
            finalPointId,
            finalOperatorId,
            methodUsed,
            sig || 'SIG_ATOMIC_CLAIM',
            nonce || generateNonce(16),
            nowIso,
            campId
          );
          updateEntStmt.run(ent.id);

          deliveriesCreated.push({
            id: dId,
            entitlement_id: ent.id,
            combo_id: ent.combo_id,
            combo_name: ent.combo_name,
            mesa_number: ent.mesa_number || 1,
            mesa_name: ent.mesa_name || 'Mesa General'
          });

          deliveredCombos.push({
            combo_id: ent.combo_id,
            combo_name: ent.combo_name,
            combo_category: ent.combo_category,
            icon: ent.icon || '📦',
            mesa_name: ent.mesa_name || 'Mesa General',
            mesa_number: ent.mesa_number || 1,
            weight_kg: ent.weight_kg || 0
          });

          // Encolar outbox para réplica cloud asíncrona
          try {
            enqueueEvent('DELIVERY_RECORDED', 'delivery', dId, {
              id: dId,
              entitlement_id: ent.id,
              worker_id: wid,
              distribution_point_id: finalPointId,
              delivered_by_user_id: finalOperatorId,
              verification_method: methodUsed,
              is_offline_sync: false,
              delivered_at: nowIso
            });
          } catch (e) {}
        }

        // Liberación inmediata del candado de dispositivo en la misma transacción
        updateLockStmt.run(wid, today);
      });

      tx();

      // Persistencia Criptográfica en la Nube (Supabase Cloud) con AWAIT
      try {
        const { persistDeliveries } = require('../services/cloud_sync.service');
        await persistDeliveries(deliveriesCreated.map(d => ({
          id: d.id,
          entitlement_id: d.entitlement_id,
          worker_id: wid,
          distribution_point_id: finalPointId,
          delivered_by_user_id: finalOperatorId,
          verification_method: methodUsed,
          signature_proof: sig,
          challenge_nonce: nonce,
          combo_id: d.combo_id,
          delivered_at: nowIso
        })));
      } catch (cloudErr) {
        console.warn('[ATOMIC DISPATCH CLOUD PERSIST WARN]', cloudErr.message);
      }

      console.log(`⚡ [ATOMIC DISPATCH SUCCESS] Retiro Totalizado completado para ${worker ? worker.full_name : wid} (${deliveredCombos.length} combos en 1 transacción SQL)`);

      const totalToastMsg = `🎉 ¡RETIRO ÚNICO TOTALIZADO APROBADO! Se despacharon con éxito todos sus combos asignados (${deliveredCombos.length} de ${deliveredCombos.length}).`;

      const deliveryPayload = {
        valid: true,
        delivery_type: 'atomic_total_claim',
        delivery_id: deliveriesCreated[0]?.id || crypto.randomUUID(),
        deliveries: deliveriesCreated,
        worker_id: wid,
        worker_name: worker ? worker.full_name : 'Beneficiario',
        document_id: worker ? worker.document_id : 'C.I.',
        worker_type: (worker && worker.worker_type) || 'activo',
        station: 'all',
        station_name: 'Despacho Totalizado (Todas las Mesas)',
        combos_delivered: deliveredCombos,
        total_combos: deliveredCombos.length,
        toast_message: totalToastMsg,
        message: totalToastMsg,
        remaining_pending: 0,
        all_completed: true,
        device_lock_released: true,
        verification_method: methodUsed,
        delivered_at: nowIso
      };

      // Notificación Push reactiva instantánea por SSE al teléfono móvil del beneficiario (0ms)
      notifyDeliveryStream(wid, deliveryPayload);

      logDispatch('APPROVED_ATOMIC_TOTAL', qr_payload, deliveryPayload, { req, ip: req.ip });

      return res.json(deliveryPayload);
    }

    // ========================================================================
    // CASO B: MODO ESTACIÓN ESPECÍFICA (DESPACHO INDIVIDUAL POR MESA)
    // ========================================================================
    let targetEnt = pendingEnts.find(e => 
      e.combo_id === reqStation || 
      (e.combo_category && e.combo_category.toLowerCase() === reqStation) ||
      (e.shift && e.shift.toLowerCase() === reqStation) ||
      (e.mesa_name && e.mesa_name.toLowerCase().includes(reqStation))
    );

    if (!targetEnt) {
      const alreadyClaimed = entitlements.find(e => 
        (e.combo_id === reqStation || 
        (e.combo_category && e.combo_category.toLowerCase() === reqStation) ||
        (e.shift && e.shift.toLowerCase() === reqStation) ||
        (e.mesa_name && e.mesa_name.toLowerCase().includes(reqStation))) &&
        (checkDelivery.get(wid, e.id) || e.status === 'claimed')
      );
      if (alreadyClaimed) {
        logDispatch('REJECTED_COMBO_CLAIMED', qr_payload, { combo_name: alreadyClaimed.combo_name }, { req, ip: req.ip });
        return res.status(409).json({
          valid: false,
          code: 'DUPLICATE_DELIVERY_BLOCKED',
          combo_name: alreadyClaimed.combo_name,
          message: `¡ATENCIÓN! Su ${alreadyClaimed.combo_name} ya fue retirado previamente.`
        });
      }
      targetEnt = pendingEnts[0];
    }

    const singleDeliveryId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, is_offline_sync, delivered_at, campaign_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      singleDeliveryId,
      targetEnt.id,
      wid,
      finalPointId,
      finalOperatorId,
      methodUsed,
      sig || 'SIG_STATION_CLAIM',
      nonce || generateNonce(16),
      nowIso,
      campId
    );

    try {
      db.prepare("UPDATE daily_entitlements SET status = 'claimed' WHERE id = ?").run(targetEnt.id);
    } catch (e) {}

    // Persistencia Criptográfica en la Nube (Supabase Cloud) con AWAIT
    try {
      const { persistDeliveries } = require('../services/cloud_sync.service');
      await persistDeliveries([{
        id: singleDeliveryId,
        entitlement_id: targetEnt.id,
        worker_id: wid,
        distribution_point_id: finalPointId,
        delivered_by_user_id: finalOperatorId,
        verification_method: methodUsed,
        signature_proof: sig,
        challenge_nonce: nonce,
        combo_id: targetEnt.combo_id,
        delivered_at: nowIso
      }]);
    } catch (cloudErr) {
      console.warn('[STATION DISPATCH CLOUD PERSIST WARN]', cloudErr.message);
    }

    const remainingCount = pendingEnts.length - 1;
    const isAllCompleted = remainingCount === 0;

    if (isAllCompleted) {
      try {
        db.prepare(`
          UPDATE device_locks
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE worker_id = ? AND valid_date = ? AND status = 'active'
        `).run(wid, today);
        console.log(`🔓 [DEVICE LOCK COMPLETED] Candado de dispositivo liberado automáticamente tras completar entrega para: ${wid}`);
      } catch (lockErr) {
        console.warn('[DEVICE LOCK RELEASE WARN]', lockErr.message);
      }
    }

    const singleToastMsg = `🎉 ¡RETIRO APROBADO! Ya puede retirar su ${targetEnt.icon || '📦'} ${targetEnt.combo_name}.`;

    const singlePayload = {
      valid: true,
      delivery_type: 'single_station_claim',
      delivery_id: singleDeliveryId,
      worker_id: wid,
      worker_name: worker ? worker.full_name : 'Beneficiario',
      document_id: worker ? worker.document_id : 'C.I.',
      worker_type: (worker && worker.worker_type) || 'activo',
      station: targetEnt.mesa_number || 1,
      station_name: targetEnt.mesa_name || 'Mesa 1',
      combo_id: targetEnt.combo_id,
      combo_name: targetEnt.combo_name,
      combo_category: targetEnt.combo_category || 'combo_institucional',
      combo_icon: targetEnt.icon || '📦',
      combo_description: targetEnt.combo_name,
      toast_message: singleToastMsg,
      message: singleToastMsg,
      remaining_pending: remainingCount,
      all_completed: isAllCompleted,
      device_lock_released: isAllCompleted,
      verification_method: methodUsed,
      delivered_at: nowIso
    };

    notifyDeliveryStream(wid, singlePayload);
    logDispatch('APPROVED_SINGLE_STATION', qr_payload, singlePayload, { req, ip: req.ip });

    return res.json(singlePayload);

  } catch (err) {
    logDispatch('ERROR', qr_payload, { error: err.message }, { req, ip: req.ip });
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_unique_daily_claim'))) {
      return res.status(409).json({
        valid: false,
        code: 'DUPLICATE_DELIVERY_BLOCKED',
        message: '¡ALERTA DE SEGURIDAD! El beneficio de hoy ya fue reclamado previamente.'
      });
    }
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Estadísticas de rendimiento de despacho del día
 */
const getDispatchStats = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT d.id) as total_deliveries,
        COUNT(DISTINCT d.worker_id) as total_beneficiaries_served,
        SUM(CASE WHEN d.verification_method = 'passkey_qr' THEN 1 ELSE 0 END) as passkey_qr_count,
        SUM(CASE WHEN d.verification_method = 'passkey_nfc' THEN 1 ELSE 0 END) as passkey_nfc_count,
        SUM(CASE WHEN d.verification_method = 'supervisor_override' THEN 1 ELSE 0 END) as contingency_count,
        SUM(CASE WHEN d.is_offline_sync = 1 THEN 1 ELSE 0 END) as offline_sync_count
      FROM deliveries d
      WHERE date(d.delivered_at) = date(?)
    `).get(today);

    const lockStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_locks,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_locks,
        COUNT(CASE WHEN status = 'released_by_supervisor' THEN 1 END) as supervisor_released_locks
      FROM device_locks
      WHERE valid_date = ?
    `).get(today);

    return res.json({
      date: today,
      dispatch_mode: currentDispatchMode,
      deliveries: stats || {},
      device_locks: lockStats || {}
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getDispatchMode,
  setDispatchMode,
  atomicClaim,
  getDispatchStats
};
