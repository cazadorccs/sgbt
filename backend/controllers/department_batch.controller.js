// backend/controllers/department_batch.controller.js
// ============================================================================
// CONTROLADOR DE ENTREGAS MASIVAS POR DEPENDENCIA Y CADENA DE APROBACIÓN (FASE 4)
// Flujo Jerárquico: Solicitud de Lote -> Revisión RRHH -> Aprobación y Despacho en Almacén
// ============================================================================

const crypto = require('crypto');
const { db } = require('../db');
const { notifyDeliveryStream } = require('../services/sse.service');
const { enqueueEvent } = require('../services/outbox.service');

/**
 * Registra actividades en el log de auditoría del sistema
 */
function logBatchActivity(action, payload, details = {}, req = {}) {
  try {
    const logId = crypto.randomUUID();
    const ip = (req.ip) || '127.0.0.1';
    const method = req.method || 'POST';
    const endpoint = req.originalUrl || '/api/v1/department-batches';

    db.prepare(`
      INSERT INTO system_activity_logs (
        id, timestamp, level, source, action, method, endpoint, status_code, ip_address, request_payload, response_payload, created_at
      ) VALUES (?, datetime('now'), ?, 'DEPARTMENT_BATCH_ENGINE', ?, ?, ?, 200, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      logId,
      details.error ? 'WARN' : 'INFO',
      `BATCH_${action}`,
      method,
      endpoint,
      ip,
      typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
      JSON.stringify(details)
    );
  } catch (e) {
    console.warn('[BATCH AUDIT LOG WARN]', e.message);
  }
}

/**
 * 1. Métricas generales del módulo de entregas masivas
 */
const getDepartmentBatchStats = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalDepts = db.prepare("SELECT COUNT(*) as cnt FROM departments").get().cnt;
    const pendingOrders = db.prepare("SELECT COUNT(*) as cnt FROM department_batch_orders WHERE status = 'pending_review'").get().cnt;
    const approvedOrders = db.prepare("SELECT COUNT(*) as cnt FROM department_batch_orders WHERE status = 'approved'").get().cnt;
    const dispatchedOrders = db.prepare("SELECT COUNT(*) as cnt FROM department_batch_orders WHERE status = 'dispatched'").get().cnt;

    const totalCombosDispatched = db.prepare(`
      SELECT COALESCE(SUM(total_combos), 0) as total
      FROM department_batch_orders
      WHERE status = 'dispatched'
    `).get().total;

    const combosStock = db.prepare(`
      SELECT id, name, category, icon, stock, weight_kg
      FROM combos
      WHERE is_active = 1
      ORDER BY created_at ASC
    `).all();

    return res.json({
      success: true,
      stats: {
        total_departments: totalDepts,
        pending_review_orders: pendingOrders,
        approved_awaiting_dispatch: approvedOrders,
        dispatched_orders: dispatchedOrders,
        total_combos_delivered_in_batches: totalCombosDispatched,
        combos_inventory: combosStock,
        valid_date: today
      }
    });
  } catch (err) {
    console.error('[BATCH STATS ERROR]', err);
    return res.status(500).json({ error: 'Error obteniendo estadísticas de lotes departamentales: ' + err.message });
  }
};

/**
 * 2. Listado de dependencias / direcciones con conteo de trabajadores y estado de hoy
 */
const listDepartmentsWithStats = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const depts = db.prepare(`
      SELECT 
        d.id, d.code, d.name, d.cost_center,
        COUNT(DISTINCT w.id) as total_workers,
        COUNT(DISTINCT CASE WHEN e.status = 'pending' THEN w.id END) as pending_workers_today,
        COUNT(DISTINCT CASE WHEN e.status = 'claimed' THEN w.id END) as claimed_workers_today,
        (
          SELECT COUNT(*) 
          FROM department_batch_orders bo 
          WHERE bo.department_id = d.id AND bo.status IN ('pending_review', 'approved')
        ) as active_orders_count
      FROM departments d
      LEFT JOIN workers w ON w.department_id = d.id AND w.status = 'active'
      LEFT JOIN daily_entitlements e ON e.worker_id = w.id AND date(e.valid_date) = date(?)
      GROUP BY d.id
      ORDER BY total_workers DESC, d.name ASC
    `).all(today);

    return res.json({
      success: true,
      count: depts.length,
      departments: depts
    });
  } catch (err) {
    console.error('[LIST DEPTS ERROR]', err);
    return res.status(500).json({ error: 'Error listando dependencias: ' + err.message });
  }
};

/**
 * 3. Listado nominal de beneficiarios adscritos a una dependencia
 */
const getDepartmentBeneficiaries = (req, res) => {
  try {
    const { id } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const dept = db.prepare("SELECT id, code, name FROM departments WHERE id = ?").get(id);
    if (!dept) {
      return res.status(404).json({ error: 'Dependencia o Dirección no encontrada' });
    }

    const workers = db.prepare(`
      SELECT 
        w.id, w.document_id, w.full_name, w.email, w.worker_type, w.job_title, w.role,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM daily_entitlements e 
            WHERE e.worker_id = w.id AND date(e.valid_date) = date(?) AND e.status = 'claimed'
          ) THEN 'claimed'
          WHEN EXISTS (
            SELECT 1 FROM daily_entitlements e 
            WHERE e.worker_id = w.id AND date(e.valid_date) = date(?) AND e.status = 'pending'
          ) THEN 'pending'
          ELSE 'no_entitlement'
        END as daily_status,
        (
          SELECT del.batch_order_id
          FROM deliveries del
          JOIN daily_entitlements de ON del.entitlement_id = de.id
          WHERE del.worker_id = w.id AND date(de.valid_date) = date(?)
          LIMIT 1
        ) as batch_order_id
      FROM workers w
      WHERE w.department_id = ? AND w.status = 'active'
      ORDER BY w.full_name ASC
    `).all(today, today, id);

    return res.json({
      success: true,
      department: dept,
      total_workers: workers.length,
      workers
    });
  } catch (err) {
    console.error('[GET DEPT BENEFICIARIES ERROR]', err);
    return res.status(500).json({ error: 'Error obteniendo beneficiarios de la dependencia: ' + err.message });
  }
};

/**
 * 4. Listado de órdenes de entrega masiva (con filtros por estado)
 */
const listBatchOrders = (req, res) => {
  try {
    const { status, department_id } = req.query;

    let query = `
      SELECT 
        bo.*,
        d.name as department_name, d.code as department_code, d.cost_center,
        c.name as combo_name, c.icon as combo_icon,
        w_req.full_name as requested_by_name,
        w_rev.full_name as reviewed_by_name,
        w_disp.full_name as dispatched_by_name
      FROM department_batch_orders bo
      JOIN departments d ON bo.department_id = d.id
      LEFT JOIN combos c ON bo.combo_id = c.id
      LEFT JOIN workers w_req ON bo.requested_by = w_req.id
      LEFT JOIN workers w_rev ON bo.reviewed_by = w_rev.id
      LEFT JOIN workers w_disp ON bo.dispatched_by = w_disp.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND bo.status = ?`;
      params.push(status);
    }
    if (department_id) {
      query += ` AND bo.department_id = ?`;
      params.push(department_id);
    }

    query += ` ORDER BY bo.requested_at DESC`;

    const orders = db.prepare(query).all(...params);

    return res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (err) {
    console.error('[LIST BATCH ORDERS ERROR]', err);
    return res.status(500).json({ error: 'Error listando órdenes de lote departamental: ' + err.message });
  }
};

/**
 * 5. Crear solicitud de lote departamental (Stage 1: Solicitud de Lote)
 */
const createBatchOrder = (req, res) => {
  try {
    const {
      department_id,
      combo_id,
      delegate_name,
      delegate_document_id,
      delegate_phone,
      notes
    } = req.body;

    if (!department_id) {
      return res.status(400).json({ error: 'Debe especificar la Dependencia o Dirección destinataria' });
    }
    if (!delegate_name || !delegate_document_id) {
      return res.status(400).json({ error: 'Debe indicar los datos del Delegado Receptor acreditado (Nombre y Cédula)' });
    }

    const dept = db.prepare("SELECT id, name, code FROM departments WHERE id = ?").get(department_id);
    if (!dept) {
      return res.status(404).json({ error: 'Dependencia no encontrada en el sistema' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Verificar si ya existe una orden activa para esta dependencia hoy
    const activeOrder = db.prepare(`
      SELECT id, order_number, status 
      FROM department_batch_orders 
      WHERE department_id = ? AND status IN ('pending_review', 'approved')
    `).get(department_id);

    if (activeOrder) {
      return res.status(409).json({
        error: `Ya existe una orden activa (${activeOrder.order_number}) en estado "${activeOrder.status}" para esta dependencia.`
      });
    }

    // 1. Obtener trabajadores activos de la dependencia
    const activeWorkers = db.prepare(`
      SELECT id, document_id, full_name 
      FROM workers 
      WHERE department_id = ? AND status = 'active'
    `).all(department_id);

    if (!activeWorkers || activeWorkers.length === 0) {
      return res.status(400).json({ error: 'La dependencia seleccionada no tiene funcionarios activos registrados.' });
    }

    // 2. Asegurar y consultar entitlements para hoy
    const activeCombos = combo_id 
      ? db.prepare("SELECT id, name, weight_kg FROM combos WHERE id = ? AND is_active = 1").all(combo_id)
      : db.prepare("SELECT id, name, weight_kg FROM combos WHERE is_active = 1 ORDER BY created_at ASC").all();

    if (!activeCombos || activeCombos.length === 0) {
      return res.status(400).json({ error: 'No se encontraron combos alimenticios activos en el catálogo.' });
    }

    // Auto-poblar entitlements si aún no estaban generados
    for (const w of activeWorkers) {
      for (const c of activeCombos) {
        db.prepare(`
          INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
          VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
        `).run(crypto.randomUUID(), w.id, c.id, today);
      }
    }

    // Filtrar trabajadores con derechos pendientes (no retirados previamente de forma individual)
    const checkDelivery = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
    const eligibleWorkers = [];
    let totalCombosToDeliver = 0;
    let totalWeightKg = 0;

    for (const w of activeWorkers) {
      let workerEnts = db.prepare(`
        SELECT e.id, e.combo_id, c.weight_kg 
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND e.status = 'pending'
      `).all(w.id, today);

      const pendingForWorker = workerEnts.filter(e => !checkDelivery.get(w.id, e.id));
      if (pendingForWorker.length > 0) {
        eligibleWorkers.push(w);
        totalCombosToDeliver += pendingForWorker.length;
        totalWeightKg += pendingForWorker.reduce((acc, curr) => acc + (curr.weight_kg || 14.0), 0);
      }
    }

    if (eligibleWorkers.length === 0) {
      return res.status(409).json({
        error: 'Todos los funcionarios adscritos a esta dependencia ya retiraron sus beneficios para la jornada de hoy.'
      });
    }

    const orderId = crypto.randomUUID();
    const dateCode = today.replace(/-/g, '').slice(2);
    const randCode = crypto.randomBytes(2).toString('hex').toUpperCase();
    const orderNumber = `LOTE-${dateCode}-${randCode}`;
    const claimToken = `DLG-MIPPCI-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;

    const requestedBy = (req.user && req.user.id) || null;

    db.prepare(`
      INSERT INTO department_batch_orders (
        id, order_number, department_id, combo_id, total_beneficiaries, total_combos,
        total_weight_kg, delegate_name, delegate_document_id, delegate_phone,
        delegate_claim_token, status, requested_by, requested_at, review_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, CURRENT_TIMESTAMP, ?)
    `).run(
      orderId,
      orderNumber,
      department_id,
      combo_id || null,
      eligibleWorkers.length,
      totalCombosToDeliver,
      Math.round(totalWeightKg * 10) / 10,
      delegate_name.trim(),
      delegate_document_id.trim().toUpperCase(),
      delegate_phone ? delegate_phone.trim() : null,
      claimToken,
      requestedBy,
      notes ? notes.trim() : null
    );

    logBatchActivity('ORDER_CREATED', { orderId, orderNumber, department_id }, {
      eligibleWorkers: eligibleWorkers.length,
      totalCombos: totalCombosToDeliver
    }, req);

    console.log(`📋 [BATCH ORDER CREATED] Orden ${orderNumber} para ${dept.name} (${eligibleWorkers.length} beneficiarios, ${totalCombosToDeliver} combos)`);

    return res.status(201).json({
      success: true,
      message: `Solicitud de Lote Departamental ${orderNumber} creada exitosamente. En espera de revisión por RRHH.`,
      order: {
        id: orderId,
        order_number: orderNumber,
        department_name: dept.name,
        total_beneficiaries: eligibleWorkers.length,
        total_combos: totalCombosToDeliver,
        total_weight_kg: Math.round(totalWeightKg * 10) / 10,
        delegate_name: delegate_name.trim(),
        delegate_document_id: delegate_document_id.trim().toUpperCase(),
        claim_token: claimToken,
        status: 'pending_review'
      }
    });
  } catch (err) {
    console.error('[CREATE BATCH ORDER ERROR]', err);
    return res.status(500).json({ error: 'Error creando orden de lote departamental: ' + err.message });
  }
};

/**
 * 6. Revisar y autorizar lote departamental (Stage 2: Revisión RRHH)
 */
const reviewBatchOrder = (req, res) => {
  try {
    const { id } = req.params;
    const { action, review_notes } = req.body;

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return res.status(400).json({ error: 'Acción de revisión no válida. Valores permitidos: "approve" o "reject"' });
    }

    const order = db.prepare(`
      SELECT bo.*, d.name as department_name
      FROM department_batch_orders bo
      JOIN departments d ON bo.department_id = d.id
      WHERE bo.id = ?
    `).get(id);

    if (!order) {
      return res.status(404).json({ error: 'Orden de lote departamental no encontrada' });
    }

    if (order.status !== 'pending_review') {
      return res.status(400).json({
        error: `La orden ${order.order_number} ya fue procesada previamente (Estado actual: ${order.status})`
      });
    }

    const reviewerId = (req.user && req.user.id) || null;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    db.prepare(`
      UPDATE department_batch_orders
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?
      WHERE id = ?
    `).run(newStatus, reviewerId, review_notes ? review_notes.trim() : null, id);

    logBatchActivity(action === 'approve' ? 'ORDER_APPROVED' : 'ORDER_REJECTED', { id, orderNumber: order.order_number }, {
      reviewerId,
      status: newStatus
    }, req);

    console.log(`⚖️ [BATCH ORDER REVIEWED] Orden ${order.order_number} ${newStatus.toUpperCase()} por RRHH`);

    return res.json({
      success: true,
      message: action === 'approve'
        ? `Orden de entrega ${order.order_number} APROBADA exitosamente por RRHH. Habilitada para despacho en almacén.`
        : `Orden de entrega ${order.order_number} RECHAZADA por RRHH.`,
      order_id: id,
      order_number: order.order_number,
      status: newStatus,
      claim_token: order.delegate_claim_token
    });
  } catch (err) {
    console.error('[REVIEW BATCH ORDER ERROR]', err);
    return res.status(500).json({ error: 'Error procesando revisión de lote: ' + err.message });
  }
};

/**
 * 7. Despacho masivo atómico en almacén (Stage 3: Aprobación y Despacho en Almacén)
 */
const dispatchBatchOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { delegate_token, distribution_point_id, notes } = req.body;

    let order = null;
    if (id) {
      order = db.prepare(`
        SELECT bo.*, d.name as department_name, d.code as department_code
        FROM department_batch_orders bo
        JOIN departments d ON bo.department_id = d.id
        WHERE bo.id = ?
      `).get(id);
    } else if (delegate_token) {
      order = db.prepare(`
        SELECT bo.*, d.name as department_name, d.code as department_code
        FROM department_batch_orders bo
        JOIN departments d ON bo.department_id = d.id
        WHERE bo.delegate_claim_token = ?
      `).get(delegate_token.trim());
    }

    if (!order) {
      return res.status(404).json({ error: 'Orden de lote departamental o token de delegación no encontrado' });
    }

    if (order.status === 'dispatched') {
      return res.status(409).json({
        error: `¡ALERTA! La orden ${order.order_number} ya fue despachada y liquidada previamente el ${order.dispatched_at}.`
      });
    }

    if (order.status !== 'approved') {
      return res.status(400).json({
        error: `La orden ${order.order_number} no cuenta con la aprobación requerida de RRHH (Estado actual: ${order.status})`
      });
    }

    const today = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    // 1. Resolver punto de distribución y despachador
    let distPoint = distribution_point_id 
      ? db.prepare("SELECT id FROM distribution_points WHERE id = ?").get(distribution_point_id) 
      : db.prepare("SELECT id FROM distribution_points LIMIT 1").get();
    const finalPointId = distPoint ? distPoint.id : '5b0f10e3-7eac-4872-bf96-74ecd359be7e';

    const dispatchedBy = (req.user && req.user.id) || null;

    // 2. Obtener trabajadores de la dependencia y sus entitlements pendientes
    const activeWorkers = db.prepare(`
      SELECT id, document_id, full_name, worker_type 
      FROM workers 
      WHERE department_id = ? AND status = 'active'
    `).all(order.department_id);

    const checkDelivery = db.prepare("SELECT id FROM deliveries WHERE worker_id = ? AND entitlement_id = ?");
    const eligibleDeliveries = [];
    const affectedWorkerIds = new Set();
    const combosCountMap = {};

    for (const w of activeWorkers) {
      let query = `
        SELECT e.id, e.combo_id, c.name as combo_name, c.stock, c.weight_kg, c.mesa_name
        FROM daily_entitlements e
        JOIN combos c ON e.combo_id = c.id
        WHERE e.worker_id = ? AND date(e.valid_date) = date(?) AND e.status = 'pending'
      `;
      const queryParams = [w.id, today];

      if (order.combo_id) {
        query += ` AND e.combo_id = ?`;
        queryParams.push(order.combo_id);
      }

      const pendingEnts = db.prepare(query).all(...queryParams);

      for (const ent of pendingEnts) {
        if (!checkDelivery.get(w.id, ent.id)) {
          eligibleDeliveries.push({
            worker: w,
            entitlement: ent
          });
          affectedWorkerIds.add(w.id);
          combosCountMap[ent.combo_id] = (combosCountMap[ent.combo_id] || 0) + 1;
        }
      }
    }

    if (eligibleDeliveries.length === 0) {
      return res.status(409).json({
        error: 'No se encontraron beneficios pendientes por despachar para esta dependencia en la fecha de hoy.'
      });
    }

    // 3. Verificación de stock disponible antes de debitar
    for (const [comboId, qtyNeeded] of Object.entries(combosCountMap)) {
      const comboRow = db.prepare("SELECT name, stock FROM combos WHERE id = ?").get(comboId);
      const currentStock = comboRow ? (comboRow.stock !== null && comboRow.stock !== undefined ? comboRow.stock : 5000) : 0;
      if (currentStock < qtyNeeded) {
        return res.status(400).json({
          error: `Stock insuficiente en almacén para ${comboRow?.name || 'Combo'}. Disponible: ${currentStock}, Requerido por Lote: ${qtyNeeded}`
        });
      }
    }

    // 4. Preparación de Sentencias SQL para Transacción Atómica
    const insertDeliveryStmt = db.prepare(`
      INSERT INTO deliveries (
        id, entitlement_id, worker_id, distribution_point_id, delivered_by_user_id,
        verification_method, signature_proof, challenge_nonce, supervisor_id,
        override_reason, is_offline_sync, delivered_at, synced_at, batch_order_id
      ) VALUES (?, ?, ?, ?, ?, 'bulk_department_lot', ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, ?)
    `);

    const updateEntStmt = db.prepare(`
      UPDATE daily_entitlements 
      SET status = 'claimed', batch_order_id = ?
      WHERE id = ?
    `);

    const updateStockStmt = db.prepare(`
      UPDATE combos 
      SET stock = stock - ? 
      WHERE id = ?
    `);

    const updateLockStmt = db.prepare(`
      UPDATE device_locks
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE worker_id = ? AND valid_date = ? AND status = 'active'
    `);

    const updateOrderStmt = db.prepare(`
      UPDATE department_batch_orders
      SET status = 'dispatched', dispatched_by = ?, dispatched_at = CURRENT_TIMESTAMP,
          total_beneficiaries = ?, total_combos = ?, digital_acta_hash = ?, digital_acta_data = ?
      WHERE id = ?
    `);

    const createdDeliveryIds = [];
    const nominalBeneficiaries = [];

    // 5. Ejecución en Transacción Atómica (BEGIN TRANSACTION ... COMMIT)
    const tx = db.transaction(() => {
      // A. Descontar Stock de Inventario
      for (const [comboId, qty] of Object.entries(combosCountMap)) {
        updateStockStmt.run(qty, comboId);
      }

      // B. Insertar Despachos y Marcar Entitlements
      for (const item of eligibleDeliveries) {
        const dId = crypto.randomUUID();
        const nonce = crypto.randomBytes(16).toString('hex');
        const sigProof = `SIG_BATCH_${order.order_number}_${item.worker.document_id}`;

        insertDeliveryStmt.run(
          dId,
          item.entitlement.id,
          item.worker.id,
          finalPointId,
          dispatchedBy,
          sigProof,
          nonce,
          order.reviewed_by,
          `Entrega Masiva Departamental - Lote ${order.order_number}`,
          nowIso,
          order.id
        );

        updateEntStmt.run(order.id, item.entitlement.id);
        createdDeliveryIds.push(dId);

        nominalBeneficiaries.push({
          worker_id: item.worker.id,
          document_id: item.worker.document_id,
          full_name: item.worker.full_name,
          worker_type: item.worker.worker_type,
          combo_id: item.entitlement.combo_id,
          combo_name: item.entitlement.combo_name,
          delivery_id: dId
        });

        // Encolar evento outbox
        try {
          enqueueEvent('DELIVERY_RECORDED', 'delivery', dId, {
            id: dId,
            entitlement_id: item.entitlement.id,
            worker_id: item.worker.id,
            batch_order_id: order.id,
            verification_method: 'bulk_department_lot',
            delivered_at: nowIso
          });
        } catch (e) {}
      }

      // C. Liberar candados de dispositivo de los trabajadores incluidos
      for (const wid of affectedWorkerIds) {
        updateLockStmt.run(wid, today);
      }

      // D. Construir Acta Digital Oficial
      const actaObj = {
        title: 'ACTA OFICIAL DE ENTREGA INSTITUCIONAL POR LOTE DEPARTAMENTAL',
        institution: 'MINISTERIO DEL PODER POPULAR PARA LA COMUNICACIÓN Y LA INFORMACIÓN (MIPPCI)',
        order_number: order.order_number,
        department: {
          id: order.department_id,
          name: order.department_name,
          code: order.department_code
        },
        delegate_receiver: {
          name: order.delegate_name,
          document_id: order.delegate_document_id,
          phone: order.delegate_phone
        },
        metrics: {
          beneficiaries_count: affectedWorkerIds.size,
          total_combos: eligibleDeliveries.length,
          total_weight_kg: order.total_weight_kg
        },
        dispatched_at: nowIso,
        dispatched_by: dispatchedBy,
        reviewed_by: order.reviewed_by,
        deliveries_sample: nominalBeneficiaries.slice(0, 50)
      };

      const actaCanonical = JSON.stringify(actaObj);
      const actaHash = crypto.createHash('sha256').update(actaCanonical).digest('hex');

      // E. Actualizar Orden
      updateOrderStmt.run(
        dispatchedBy,
        affectedWorkerIds.size,
        eligibleDeliveries.length,
        actaHash,
        actaCanonical,
        order.id
      );
    });

    tx();

    // Persistencia Criptográfica en la Nube (Supabase Cloud) con AWAIT
    try {
      const { persistDeliveries } = require('../services/cloud_sync.service');
      const deliveriesToPersist = nominalBeneficiaries.map(nb => ({
        id: nb.delivery_id,
        entitlement_id: nb.entitlement_id,
        worker_id: nb.worker_id,
        distribution_point_id: finalPointId,
        delivered_by_user_id: dispatchedBy,
        verification_method: 'bulk_department_lot',
        signature_proof: `SIG_BATCH_${order.order_number}`,
        combo_id: nb.combo_id,
        delivered_at: nowIso
      }));
      await persistDeliveries(deliveriesToPersist);
    } catch (cloudErr) {
      console.warn('[BATCH DISPATCH CLOUD PERSIST WARN]', cloudErr.message);
    }

    console.log(`📦 [BATCH DISPATCH SUCCESS] Lote ${order.order_number} para ${order.department_name} entregado exitosamente (${eligibleDeliveries.length} combos a ${affectedWorkerIds.size} titulares)`);

    // Notificar SSE en vivo
    try {
      notifyDeliveryStream({
        valid: true,
        delivery_type: 'bulk_department_dispatch',
        batch_order_id: order.id,
        order_number: order.order_number,
        department_name: order.department_name,
        total_combos: eligibleDeliveries.length,
        total_beneficiaries: affectedWorkerIds.size,
        toast_message: `🎉 ¡LOTE DEPARTAMENTAL ${order.order_number} DESPACHADO! ${eligibleDeliveries.length} combos entregados para ${order.department_name}.`
      });
    } catch (e) {}

    logBatchActivity('ORDER_DISPATCHED', { orderId: order.id, orderNumber: order.order_number }, {
      totalCombos: eligibleDeliveries.length,
      beneficiaries: affectedWorkerIds.size
    }, req);

    return res.json({
      success: true,
      message: `¡LOTE DEPARTAMENTAL ${order.order_number} DESPACHADO CON ÉXITO!`,
      order_number: order.order_number,
      department_name: order.department_name,
      total_beneficiaries: affectedWorkerIds.size,
      total_combos: eligibleDeliveries.length,
      dispatched_at: nowIso,
      digital_acta_hash: crypto.createHash('sha256').update(JSON.stringify(order)).digest('hex'),
      toast_message: `🎉 ¡LOTE DEPARTAMENTAL ${order.order_number} DESPACHADO! Se liquidaron ${eligibleDeliveries.length} combos para ${order.department_name}.`
    });
  } catch (err) {
    console.error('[DISPATCH BATCH ORDER ERROR]', err);
    return res.status(500).json({ error: 'Error procesando despacho de lote departamental: ' + err.message });
  }
};

/**
 * 8. Consulta y descarga de Acta Digital Oficial con firma SHA-256
 */
const getBatchOrderActa = (req, res) => {
  try {
    const { id } = req.params;

    const order = db.prepare(`
      SELECT 
        bo.*,
        d.name as department_name, d.code as department_code, d.cost_center,
        w_req.full_name as requested_by_name, w_req.document_id as requested_by_doc,
        w_rev.full_name as reviewed_by_name, w_rev.document_id as reviewed_by_doc,
        w_disp.full_name as dispatched_by_name, w_disp.document_id as dispatched_by_doc
      FROM department_batch_orders bo
      JOIN departments d ON bo.department_id = d.id
      LEFT JOIN workers w_req ON bo.requested_by = w_req.id
      LEFT JOIN workers w_rev ON bo.reviewed_by = w_rev.id
      LEFT JOIN workers w_disp ON bo.dispatched_by = w_disp.id
      WHERE bo.id = ?
    `).get(id);

    if (!order) {
      return res.status(404).json({ error: 'Orden de lote no encontrada' });
    }

    let parsedActa = null;
    try {
      parsedActa = order.digital_acta_data ? JSON.parse(order.digital_acta_data) : null;
    } catch (e) {}

    // Consultar todos los beneficiarios incluidos en el acta
    const beneficiaries = db.prepare(`
      SELECT w.id, w.document_id, w.full_name, w.worker_type, w.job_title, del.delivered_at, del.id as delivery_id, c.name as combo_name
      FROM deliveries del
      JOIN workers w ON del.worker_id = w.id
      JOIN daily_entitlements e ON del.entitlement_id = e.id
      JOIN combos c ON e.combo_id = c.id
      WHERE del.batch_order_id = ?
      ORDER BY w.full_name ASC
    `).all(id);

    return res.json({
      success: true,
      acta: {
        order_number: order.order_number,
        department_name: order.department_name,
        department_code: order.department_code,
        cost_center: order.cost_center,
        status: order.status,
        delegate: {
          name: order.delegate_name,
          document_id: order.delegate_document_id,
          phone: order.delegate_phone
        },
        metrics: {
          total_beneficiaries: order.total_beneficiaries,
          total_combos: order.total_combos,
          total_weight_kg: order.total_weight_kg
        },
        signatories: {
          requested_by: order.requested_by_name ? `${order.requested_by_name} (${order.requested_by_doc})` : 'Representante Dirección',
          reviewed_by: order.reviewed_by_name ? `${order.reviewed_by_name} (${order.reviewed_by_doc})` : 'Dirección Gestión Humana (RRHH)',
          dispatched_by: order.dispatched_by_name ? `${order.dispatched_by_name} (${order.dispatched_by_doc})` : 'Responsable Almacén Central'
        },
        dates: {
          requested_at: order.requested_at,
          reviewed_at: order.reviewed_at,
          dispatched_at: order.dispatched_at
        },
        digital_acta_hash: order.digital_acta_hash,
        beneficiaries_sample: beneficiaries
      }
    });
  } catch (err) {
    console.error('[GET BATCH ACTA ERROR]', err);
    return res.status(500).json({ error: 'Error obteniendo acta de lote: ' + err.message });
  }
};

module.exports = {
  getDepartmentBatchStats,
  listDepartmentsWithStats,
  getDepartmentBeneficiaries,
  listBatchOrders,
  createBatchOrder,
  reviewBatchOrder,
  dispatchBatchOrder,
  getBatchOrderActa
};
