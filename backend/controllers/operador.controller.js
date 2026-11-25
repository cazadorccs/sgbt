// backend/controllers/operador.controller.js
// Controlador para el Puesto de Supervisión & Despacho Manual (Operador)
// Ventana minimalista: solo tipeo de cédula y aprobar entrega. Sin desplegar contenido de combos.

const crypto = require('crypto');
const { db } = require('../db');
const { generateSessionToken } = require('../crypto-utils');
const { cache } = require('../services/cache.service');

function getTodayVzla() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

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

// 1. Login de operador por cédula (público, sin contraseña)
const operadorLogin = (req, res) => {
  const { document_id } = req.body || {};
  if (!document_id || !document_id.trim()) {
    return res.status(400).json({ error: 'Debe ingresar su Cédula de Identidad' });
  }

  const { formatted, digits, raw } = normalizeCedula(document_id);

  try {
    const operador = db.prepare(`
      SELECT id, document_id, full_name, mesa, role, status
      FROM operadores_puesto_autorizados
      WHERE (document_id = ? OR document_id = ? OR REPLACE(document_id, 'V-', '') = ?)
        AND role = 'operator'
        AND status = 'active'
      LIMIT 1
    `).get(formatted, raw, digits);

    if (!operador) {
      return res.status(404).json({ error: 'Cédula no registrada como operador de despacho. Acceso denegado.' });
    }

    const deviceId = req.headers['x-device-id'] || req.body.device_id || null;
    const token = generateSessionToken({
      userId: operador.id,
      role: operador.role,
      documentId: operador.document_id,
      deviceId,
      scope: 'beneficiary'
    }, 12);

    // Registrar sesión de dispositivo
    try {
      const { createDeviceSession } = require('../services/session.service');
      const jti = token.split('.')[1]; // payload contiene jti
      const payload = JSON.parse(Buffer.from(jti, 'base64url').toString());
      createDeviceSession(operador.id, deviceId || 'dispositivo_operador', 'Puesto de Despacho Manual', req.ip || '127.0.0.1', req.headers['user-agent'] || '');
    } catch (e) {}

    return res.json({
      success: true,
      message: 'Inicio de sesión de operador exitoso',
      token,
      operador: {
        id: operador.id,
        document_id: operador.document_id,
        full_name: operador.full_name,
        role: operador.role,
        mesa: operador.mesa
      },
      expires_in_hours: 12
    });
  } catch (err) {
    console.error('[OPERADOR LOGIN ERROR]', err);
    return res.status(500).json({ error: 'Error autenticando operador: ' + err.message });
  }
};

// 2. Buscar trabajador por cédula para despacho (vista minimalista del operador)
// Devuelve SOLO: nombre, cédula, departamento, cantidad de pendientes. SIN contenido de combos.
const operadorSearchWorker = (req, res) => {
  const query = req.params.cedula || req.query.cedula || req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Debe ingresar un número de cédula' });
  }

  const { digits, formatted, raw } = normalizeCedula(query);
  const today = getTodayVzla();

  try {
    const worker = db.prepare(`
      SELECT w.id, w.document_id, w.full_name, w.email, w.role, w.shift, w.status, w.worker_type,
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
        message: `El funcionario con cédula "${query}" no se encuentra en la nómina institucional.`
      });
    }

    // Asegurar asignaciones para hoy (para los 4 combos activos del catálogo o jornada)
    try {
      const { ensureTodayEntitlementsForWorker } = require('./manual_dispatch.controller');
      if (typeof ensureTodayEntitlementsForWorker === 'function') {
        ensureTodayEntitlementsForWorker(worker.id, today);
      }
    } catch (e) {
      console.warn('[OPERADOR] Aviso asegurando entitlements:', e.message);
    }

    // Contar solo cuántos combos tiene pendientes (SIN mostrar nombres ni detalles)
    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    let pendSql = `
      SELECT COUNT(DISTINCT e.combo_id) as cnt FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND e.valid_date = ? AND e.status = 'pending' AND c.is_active = 1 AND c.name NOT LIKE '__SYSTEM_%'
    `;
    const pendParams = [worker.id, today];
    if (activeCamp) {
      pendSql += ` AND (e.campaign_id = ? OR e.combo_id IN (
        SELECT combo_id FROM campaign_combos WHERE campaign_id = ?
        UNION
        SELECT combo_id FROM delivery_campaigns WHERE id = ? AND combo_id IS NOT NULL
      ))`;
      pendParams.push(activeCamp.id, activeCamp.id, activeCamp.id);
    }
    const pendingCount = db.prepare(pendSql).get(...pendParams).cnt;

    // Total asignados hoy (conteo de combos únicos activos)
    let totalSql = `
      SELECT COUNT(DISTINCT e.combo_id) as cnt FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND e.valid_date = ? AND c.is_active = 1 AND c.name NOT LIKE '__SYSTEM_%'
    `;
    const totalParams = [worker.id, today];
    if (activeCamp) {
      totalSql += ` AND (e.campaign_id = ? OR e.combo_id IN (
        SELECT combo_id FROM campaign_combos WHERE campaign_id = ?
        UNION
        SELECT combo_id FROM delivery_campaigns WHERE id = ? AND combo_id IS NOT NULL
      ))`;
      totalParams.push(activeCamp.id, activeCamp.id, activeCamp.id);
    }
    const totalCount = db.prepare(totalSql).get(...totalParams).cnt;

    // Ya entregados
    const deliveredCount = totalCount - pendingCount;

    return res.json({
      found: true,
      worker: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        department_name: worker.department_name || 'Sin Dirección Asignada',
        worker_type: worker.worker_type || 'activo',
        shift: worker.shift || 'jornada_continua'
      },
      summary: {
        today,
        total_combos: totalCount,
        pending_combos: pendingCount,
        delivered_combos: deliveredCount,
        is_fully_delivered: totalCount > 0 && pendingCount === 0,
        has_pending: pendingCount > 0
      }
    });
  } catch (err) {
    console.error('[OPERADOR SEARCH ERROR]', err);
    res.status(500).json({ error: 'Error consultando funcionario: ' + err.message });
  }
};

// 3. Despachar / entregar todos los combos pendientes del trabajador (descontar)
// Minimalista: no requiere seleccionar combos individuales, entrega hasta 4 combos únicos activos.
const operadorDeliver = async (req, res) => {
  const { worker_id, note, delivered_by_user_id } = req.body || {};
  const today = getTodayVzla();
  const operatorUserId = (req.user && (req.user.id || req.user.sub)) || delivered_by_user_id || null;

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

    // Asegurar derechos de hoy para todos los combos activos
    try {
      const { ensureTodayEntitlementsForWorker } = require('./manual_dispatch.controller');
      if (typeof ensureTodayEntitlementsForWorker === 'function') {
        ensureTodayEntitlementsForWorker(worker.id, today);
      }
    } catch (e) {}

    // Purgar duplicados si existieran para este trabajador y fecha
    try {
      db.prepare(`
        DELETE FROM daily_entitlements 
        WHERE id NOT IN (
          SELECT MIN(id) 
          FROM daily_entitlements 
          WHERE worker_id = ? AND valid_date = ? 
          GROUP BY combo_id
        )
        AND worker_id = ? AND valid_date = ?
      `).run(worker.id, today, worker.id, today);
    } catch (e) {}

    // Obtener combos pendientes agrupando por combo_id (máx 1 por tipo, límite 4 combos)
    const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
    let pendSql = `
      SELECT MIN(e.id) as id, e.combo_id, 'pending' as status, c.name as combo_name
      FROM daily_entitlements e
      JOIN combos c ON e.combo_id = c.id
      WHERE e.worker_id = ? AND e.valid_date = ? AND e.status = 'pending' AND c.is_active = 1 AND c.name NOT LIKE '__SYSTEM_%'
    `;
    const pendParams = [worker.id, today];
    if (activeCamp) {
      pendSql += ` AND (e.campaign_id = ? OR e.combo_id IN (
        SELECT combo_id FROM campaign_combos WHERE campaign_id = ?
        UNION
        SELECT combo_id FROM delivery_campaigns WHERE id = ? AND combo_id IS NOT NULL
      ))`;
      pendParams.push(activeCamp.id, activeCamp.id, activeCamp.id);
    }
    pendSql += ` GROUP BY e.combo_id ORDER BY c.created_at ASC, c.id ASC LIMIT 4`;
    const strictlyPending = db.prepare(pendSql).all(...pendParams);

    if (strictlyPending.length === 0) {
      return res.status(400).json({
        error: 'No hay combos pendientes para entregar hoy a este trabajador. Ya fueron despachados.'
      });
    }

    const distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const distPointId = distPoint ? distPoint.id : '550e8400-e29b-41d4-a716-446655440000';
    const campaignId = activeCamp ? activeCamp.id : null;

    const insertDelivery = db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, supervisor_id,
        override_reason, is_offline_sync, delivered_at, campaign_id
      ) VALUES (?, ?, ?, ?, ?, 'manual_operador', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
    `);

    const deliveredItems = [];
    const tx = db.transaction(() => {
      for (const ent of strictlyPending) {
        const deliveryId = crypto.randomUUID();
        const nonce = crypto.randomBytes(8).toString('hex');
        insertDelivery.run(
          deliveryId,
          ent.id,
          worker.id,
          distPointId,
          operatorUserId,
          'OPERADOR_DESPATCH_' + Date.now(),
          nonce,
          operatorUserId,
          note || 'Despacho por operador de puesto de supervisión',
          campaignId
        );
        // Marcar todas las filas de este combo para este funcionario hoy como claimed
        db.prepare(`
          UPDATE daily_entitlements 
          SET status = 'claimed' 
          WHERE worker_id = ? AND valid_date = ? AND combo_id = ?
        `).run(worker.id, today, ent.combo_id);

        deliveredItems.push({
          delivery_id: deliveryId,
          entitlement_id: ent.id,
          combo_id: ent.combo_id,
          combo_name: ent.combo_name
        });
      }
    });
    tx();

    // Notificar evento SSE para sincronizar paneles en tiempo real
    try {
      const { notifyDeliveryStream } = require('../services/sse.service');
      notifyDeliveryStream(worker.id, {
        valid: true,
        type: 'manual_operador',
        worker_id: worker.id,
        worker_name: worker.full_name,
        document_id: worker.document_id,
        combos_delivered: deliveredItems,
        delivered_at: new Date().toISOString()
      });
    } catch (e) {}

    // Respaldo en Supabase Cloud
    try {
      const { persistDeliveries } = require('../services/cloud_sync.service');
      await persistDeliveries(deliveredItems.map(item => ({
        id: item.delivery_id,
        entitlement_id: item.entitlement_id,
        worker_id: worker.id,
        combo_id: item.combo_id,
        verification_method: 'manual_operador',
        delivered_at: new Date().toISOString()
      })));
    } catch (e) {
      console.warn('[OPERADOR DELIVER CLOUD WARN]', e.message);
    }

    try {
      await cache.delPattern('kpis:*');
      await cache.delPattern('ministerial:*');
    } catch (e) {}

    return res.json({
      success: true,
      message: `¡Se entregaron ${strictlyPending.length} combo(s) a ${worker.full_name} (${worker.document_id}) con éxito!`,
      delivered_count: strictlyPending.length,
      worker: {
        id: worker.id,
        document_id: worker.document_id,
        full_name: worker.full_name,
        department: worker.department_name
      },
      delivered_items: deliveredItems
    });
  } catch (err) {
    console.error('[OPERADOR DELIVER ERROR]', err);
    if (err.message && err.message.includes('idx_unique_daily_claim')) {
      return res.status(409).json({ error: 'Uno de los combos ya fue registrado como entregado.' });
    }
    res.status(500).json({ error: 'Error procesando la entrega: ' + err.message });
  }
};

// 4. Descargar padrón completo de la jornada para operar sin conexión (Modo Offline)
const operadorOfflinePack = (req, res) => {
  const today = getTodayVzla();
  try {
    const workers = db.prepare(`
      SELECT w.id, w.document_id, w.full_name, w.worker_type,
             COALESCE(d.name, 'Sin Dirección') as department_name,
             CASE WHEN EXISTS (
               SELECT 1 FROM daily_entitlements de
               JOIN combos c ON de.combo_id = c.id
               WHERE de.worker_id = w.id AND de.valid_date = ? AND de.status = 'claimed' AND c.is_active = 1
             ) THEN 1 ELSE 0 END as is_delivered
      FROM workers w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.status = 'active'
      ORDER BY w.full_name ASC
    `).all(today);

    return res.json({
      success: true,
      today,
      total_workers: workers.length,
      workers
    });
  } catch (err) {
    console.error('[OPERADOR OFFLINE PACK ERROR]', err);
    return res.status(500).json({ error: 'Error generando padrón offline: ' + err.message });
  }
};

// 5. Sincronizar lote de entregas diferidas realizadas sin conexión
const operadorSyncBatch = async (req, res) => {
  const { deliveries } = req.body || {};
  const today = getTodayVzla();

  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    return res.json({ success: true, processed: 0, already_delivered: 0, total: 0 });
  }

  let processed = 0;
  let alreadyDelivered = 0;
  const errors = [];
  const distPoint = db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
  const distPointId = distPoint ? distPoint.id : '550e8400-e29b-41d4-a716-446655440000';
  const activeCamp = db.prepare("SELECT id FROM delivery_campaigns WHERE status = 'en_curso' LIMIT 1").get();
  const campaignId = activeCamp ? activeCamp.id : null;

  for (const item of deliveries) {
    const workerId = item.worker_id || item.workerId;
    const docId = item.document_id || item.documentId;
    if (!workerId && !docId) continue;

    try {
      let worker = null;
      if (workerId) {
        worker = db.prepare("SELECT id, document_id, full_name, worker_type FROM workers WHERE id = ?").get(workerId);
      }
      if (!worker && docId) {
        const { formatted, raw, digits } = normalizeCedula(docId);
        worker = db.prepare("SELECT id, document_id, full_name, worker_type FROM workers WHERE document_id = ? OR document_id = ? OR REPLACE(document_id, 'V-', '') = ? LIMIT 1").get(formatted, raw, digits);
      }
      if (!worker) {
        errors.push({ docId, error: 'Trabajador no encontrado en el servidor' });
        continue;
      }

      // Asegurar entitlements si faltan
      try {
        const { ensureTodayEntitlementsForWorker } = require('./manual_dispatch.controller');
        if (typeof ensureTodayEntitlementsForWorker === 'function') {
          ensureTodayEntitlementsForWorker(worker.id, today);
        }
      } catch (e) {}

      // Buscar combos pendientes
      let pendSql = `
        SELECT MIN(e.id) as id, e.combo_id, c.name as combo_name
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND e.valid_date = ? AND e.status = 'pending' AND c.is_active = 1 AND c.name NOT LIKE '__SYSTEM_%'
      `;
      const pendParams = [worker.id, today];
      if (activeCamp) {
        pendSql += ` AND (e.campaign_id = ? OR e.combo_id IN (
          SELECT combo_id FROM campaign_combos WHERE campaign_id = ?
          UNION
          SELECT combo_id FROM delivery_campaigns WHERE id = ? AND combo_id IS NOT NULL
        ))`;
        pendParams.push(activeCamp.id, activeCamp.id, activeCamp.id);
      }
      pendSql += ` GROUP BY e.combo_id ORDER BY c.created_at ASC, c.id ASC LIMIT 4`;
      const strictlyPending = db.prepare(pendSql).all(...pendParams);

      if (strictlyPending.length === 0) {
        alreadyDelivered++;
        continue;
      }

      const deliveredItems = [];
      const tx = db.transaction(() => {
        for (const ent of strictlyPending) {
          const deliveryId = crypto.randomUUID();
          const nonce = crypto.randomBytes(8).toString('hex');
          const deliveredAt = item.delivered_at || new Date().toISOString();

          const opUserId = item.delivered_by_user_id || (req.user && (req.user.id || req.user.sub)) || null;

          db.prepare(`
            INSERT INTO deliveries (
              id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
              verification_method, signature_proof, challenge_nonce, supervisor_id,
              override_reason, is_offline_sync, delivered_at, campaign_id
            ) VALUES (?, ?, ?, ?, ?, 'manual_operador_offline', ?, ?, ?, ?, 1, ?, ?)
          `).run(
            deliveryId,
            ent.id,
            worker.id,
            distPointId,
            opUserId,
            'OFFLINE_SYNC_' + Date.now(),
            nonce,
            opUserId,
            item.note || 'Sincronización diferida desde Puesto de Operador Offline',
            deliveredAt,
            campaignId
          );

          db.prepare(`
            UPDATE daily_entitlements 
            SET status = 'claimed' 
            WHERE worker_id = ? AND valid_date = ? AND combo_id = ?
          `).run(worker.id, today, ent.combo_id);

          deliveredItems.push({
            delivery_id: deliveryId,
            entitlement_id: ent.id,
            combo_id: ent.combo_id
          });
        }
      });
      tx();

      // Respaldo en Supabase
      try {
        const { persistDeliveries } = require('../services/cloud_sync.service');
        await persistDeliveries(deliveredItems.map(d => ({
          id: d.delivery_id,
          entitlement_id: d.entitlement_id,
          worker_id: worker.id,
          combo_id: d.combo_id,
          verification_method: 'manual_operador_offline',
          delivered_at: item.delivered_at || new Date().toISOString()
        })));
      } catch (e) {}

      processed++;
    } catch (errOne) {
      console.warn(`[SYNC ONE ERR] Error sincronizando ${docId}:`, errOne.message);
      errors.push({ docId, error: errOne.message });
    }
  }

  try {
    await cache.delPattern('kpis:*');
    await cache.delPattern('ministerial:*');
  } catch (e) {}

  return res.json({
    success: true,
    total: deliveries.length,
    processed,
    already_delivered: alreadyDelivered,
    errors: errors.length > 0 ? errors : undefined,
    message: `Sincronización finalizada: ${processed} despachos procesados, ${alreadyDelivered} ya estaban registrados.`
  });
};

module.exports = {
  operadorLogin,
  operadorSearchWorker,
  operadorDeliver,
  operadorOfflinePack,
  operadorSyncBatch
};
