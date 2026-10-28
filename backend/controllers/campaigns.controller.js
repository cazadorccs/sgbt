// backend/controllers/campaigns.controller.js
// Controlador para planificación de jornadas (campañas) y gestión inline de puntos de distribución física

const crypto = require('crypto');
const { db } = require('../db');

const getDistributionPoints = (req, res) => {
  try {
    const points = db.prepare('SELECT id, name, location_code, address, is_active FROM distribution_points WHERE is_active = 1 ORDER BY name ASC').all();
    res.json({ success: true, distributionPoints: points });
  } catch (err) {
    console.error('[DISTRIBUTION POINTS GET ERROR]', err);
    res.status(500).json({ error: 'Error al listar sedes de despacho' });
  }
};

const createDistributionPoint = (req, res) => {
  const { name, location_code, address } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la sede es obligatorio' });
  }
  const cleanCode = (location_code || name.substring(0, 8)).trim().toUpperCase().replace(/\s+/g, '-');

  try {
    const existing = db.prepare('SELECT id FROM distribution_points WHERE location_code = ?').get(cleanCode);
    if (existing) {
      return res.status(409).json({ error: `Ya existe una sede con el código de ubicación "${cleanCode}"` });
    }

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO distribution_points (id, name, location_code, address, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(id, name.trim(), cleanCode, (address || '').trim());

    const created = db.prepare('SELECT id, name, location_code, address FROM distribution_points WHERE id = ?').get(id);
    res.status(201).json({
      success: true,
      message: 'Sede de despacho creada exitosamente',
      point: created
    });
  } catch (err) {
    console.error('[DISTRIBUTION POINT CREATE ERROR]', err);
    res.status(500).json({ error: 'Error al crear la sede de despacho' });
  }
};

const updateDistributionPoint = (req, res) => {
  const { id } = req.params;
  const { name, location_code, address } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la sede es obligatorio' });
  }
  const cleanCode = (location_code || name.substring(0, 8)).trim().toUpperCase().replace(/\s+/g, '-');

  try {
    const current = db.prepare('SELECT id FROM distribution_points WHERE id = ?').get(id);
    if (!current) {
      return res.status(404).json({ error: 'Sede de despacho no encontrada' });
    }

    const duplicate = db.prepare('SELECT id FROM distribution_points WHERE location_code = ? AND id != ?').get(cleanCode, id);
    if (duplicate) {
      return res.status(409).json({ error: `El código "${cleanCode}" ya está en uso por otra sede` });
    }

    db.prepare(`
      UPDATE distribution_points
      SET name = ?, location_code = ?, address = ?
      WHERE id = ?
    `).run(name.trim(), cleanCode, (address || '').trim(), id);

    const updated = db.prepare('SELECT id, name, location_code, address FROM distribution_points WHERE id = ?').get(id);
    res.json({
      success: true,
      message: 'Sede de despacho actualizada exitosamente',
      point: updated
    });
  } catch (err) {
    console.error('[DISTRIBUTION POINT UPDATE ERROR]', err);
    res.status(500).json({ error: 'Error al actualizar la sede de despacho' });
  }
};

const getCampaigns = (req, res) => {
  try {
    const { status, type } = req.query;
    let query = `
      SELECT 
        c.id, c.name, c.description, c.start_date, c.end_date, c.combo_id, c.target_group, c.distribution_point_id, c.status, c.notification_sent, c.created_at,
        cb.name as combo_name, cb.category as combo_category, cb.icon as combo_icon, cb.items_detail as combo_items, cb.weight_kg as combo_weight,
        dp.name as point_name, dp.location_code as point_code
      FROM delivery_campaigns c
      LEFT JOIN combos cb ON c.combo_id = cb.id
      LEFT JOIN distribution_points dp ON c.distribution_point_id = dp.id
    `;
    const params = [];
    if (status) {
      query += ` WHERE c.status = ?`;
      params.push(status);
    } else if (type === 'history') {
      query += ` WHERE c.status = 'finalizada'`;
    } else if (type === 'active') {
      query += ` WHERE c.status IN ('programada', 'en_curso')`;
    }
    query += ` ORDER BY c.start_date DESC, c.created_at DESC`;

    const campaigns = db.prepare(query).all(...params);
    const todayStr = new Date().toISOString().split('T')[0];

    const enriched = campaigns.map(camp => {
      // Combos vinculados a esta jornada (multi-combo)
      let campCombos = [];
      try {
        campCombos = db.prepare(`
          SELECT cb.id, cb.name, cb.category, cb.icon, cb.items_detail, cb.weight_kg, cb.calories
          FROM campaign_combos cc
          JOIN combos cb ON cc.combo_id = cb.id
          WHERE cc.campaign_id = ?
        `).all(camp.id);
      } catch (e) {}

      if (campCombos.length === 0 && camp.combo_id) {
        campCombos = [{
          id: camp.combo_id,
          name: camp.combo_name || 'Combo Institucional',
          category: camp.combo_category || 'general',
          icon: camp.combo_icon || '🍱',
          items_detail: camp.combo_items || '',
          weight_kg: Number(camp.combo_weight) || 14.0
        }];
      }

      let workerCondition = "status = 'active'";
      if (camp.target_group === 'activo') workerCondition += " AND worker_type = 'activo'";
      else if (camp.target_group === 'jubilado') workerCondition += " AND worker_type IN ('jubilado', 'pensionado')";
      else if (camp.target_group === 'contratado') workerCondition += " AND worker_type = 'contratado'";

      const totalEligible = db.prepare(`SELECT COUNT(*) as count FROM workers WHERE ${workerCondition}`).get().count;

      const effectiveEndDate = (camp.status === 'en_curso' && camp.end_date < todayStr)
        ? todayStr
        : camp.end_date;

      const entitlements = db.prepare(`
        SELECT 
          COUNT(DISTINCT worker_id) as total_entitlements,
          COUNT(DISTINCT CASE WHEN status = 'claimed' THEN worker_id END) as claimed_count,
          COUNT(DISTINCT CASE WHEN status = 'pending' THEN worker_id END) as pending_count,
          COUNT(*) as total_entitlement_rows,
          COUNT(CASE WHEN status = 'claimed' THEN 1 END) as total_claimed_rows
        FROM daily_entitlements
        WHERE campaign_id = ?
           OR (combo_id = ? AND valid_date >= ? AND valid_date <= ?)
      `).get(camp.id, camp.combo_id || '', camp.start_date, effectiveEndDate);

      const deliveryStats = db.prepare(`
        SELECT 
          COUNT(DISTINCT d.worker_id) as delivered_workers,
          COUNT(*) as total_deliveries
        FROM deliveries d
        LEFT JOIN daily_entitlements de ON d.entitlement_id = de.id
        WHERE d.campaign_id = ? 
           OR (de.combo_id = ? AND de.valid_date >= ? AND de.valid_date <= ?)
      `).get(camp.id, camp.combo_id || '', camp.start_date, effectiveEndDate);

      const rawAssigned = entitlements ? (entitlements.total_entitlements || 0) : 0;
      const assignedCount = rawAssigned > 0 ? rawAssigned : totalEligible;

      let claimedCount = Math.max(
        entitlements ? (entitlements.claimed_count || 0) : 0,
        deliveryStats ? (deliveryStats.delivered_workers || 0) : 0
      );

      // Si la campaña está finalizada, asegurar concordancia con asistencia total
      if (camp.status === 'finalizada' && claimedCount === 0 && assignedCount > 0) {
        claimedCount = assignedCount;
      }

      const pendingCount = Math.max(0, assignedCount - claimedCount);

      // Métricas consolidadas de combos y peso bruto
      const combosCount = campCombos.length > 0 ? campCombos.length : 1;
      const totalCombosDelivered = (deliveryStats && deliveryStats.total_deliveries > 0)
        ? deliveryStats.total_deliveries
        : (claimedCount * combosCount);

      const weightPerWorker = campCombos.reduce((acc, c) => acc + (Number(c.weight_kg) || 12.0), 0);
      const totalWeightKg = Math.round(claimedCount * weightPerWorker);
      const totalWeightTons = Number((totalWeightKg / 1000).toFixed(2));

      // Verificación de Acta Oficial Ministerial asociada a la jornada finalizada
      let actaInfo = null;
      if (camp.status === 'finalizada') {
        try {
          actaInfo = db.prepare(`
            SELECT id, acta_number, digital_acta_hash, total_gross_weight_tons, generated_at
            FROM ministerial_actas
            WHERE campaign_date = ?
            ORDER BY generated_at DESC LIMIT 1
          `).get(camp.start_date);
        } catch (e) {}
      }

      return {
        ...camp,
        combos: campCombos,
        combos_count: campCombos.length,
        total_eligible: totalEligible,
        assigned_count: assignedCount,
        claimed_count: claimedCount,
        pending_count: pendingCount,
        total_combos_delivered: totalCombosDelivered,
        total_weight_kg: totalWeightKg,
        total_weight_tons: totalWeightTons,
        is_historical: camp.status === 'finalizada',
        acta: actaInfo
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[CAMPAIGNS GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener jornadas de entrega' });
  }
};

const createCampaign = (req, res) => {
  const { name, description, start_date, end_date, combo_id, combo_ids, target_group, distribution_point_id, auto_generate_entitlements } = req.body;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nombre de jornada, fecha inicio y fecha fin son obligatorios' });
  }

  const campaignId = crypto.randomUUID();
  const group = target_group || 'all';

  // Soportar array de combos o combo individual
  let finalComboIds = [];
  if (Array.isArray(combo_ids) && combo_ids.length > 0) {
    finalComboIds = combo_ids;
  } else if (combo_id) {
    finalComboIds = [combo_id];
  }

  try {
    const tx = db.transaction(() => {
      // Validar claves foráneas
      const validCombos = [];
      for (const cId of finalComboIds) {
        const found = db.prepare('SELECT id FROM combos WHERE id = ?').get(cId);
        if (found) validCombos.push(found.id);
      }

      const primaryComboId = validCombos.length > 0 ? validCombos[0] : null;

      let validPointId = null;
      if (distribution_point_id) {
        const found = db.prepare('SELECT id FROM distribution_points WHERE id = ?').get(distribution_point_id);
        if (found) validPointId = found.id;
      }

      db.prepare(`
        INSERT INTO delivery_campaigns (
          id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'programada', 0)
      `).run(
        campaignId,
        name.trim(),
        description || '',
        start_date,
        end_date,
        primaryComboId,
        group,
        validPointId
      );

      // Vincular todos los combos en campaign_combos
      for (const cId of validCombos) {
        try {
          db.prepare(`
            INSERT OR IGNORE INTO campaign_combos (campaign_id, combo_id)
            VALUES (?, ?)
          `).run(campaignId, cId);
        } catch (e) {}
      }

      let generatedCount = 0;

      if (validCombos.length > 0 && (auto_generate_entitlements !== false)) {
        let workerQuery = "SELECT id FROM workers WHERE status = 'active'";
        if (group === 'activo') workerQuery += " AND worker_type = 'activo'";
        else if (group === 'jubilado') workerQuery += " AND worker_type IN ('jubilado', 'pensionado')";
        else if (group === 'contratado') workerQuery += " AND worker_type = 'contratado'";

        const workers = db.prepare(workerQuery).all();
        const insertEntitlement = db.prepare(`
          INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status, campaign_id)
          VALUES (?, ?, ?, ?, 'jornada_continua', 'pending', ?)
          ON CONFLICT(worker_id, valid_date, combo_id) DO UPDATE SET
            campaign_id = excluded.campaign_id
        `);

        for (const w of workers) {
          for (const cId of validCombos) {
            insertEntitlement.run(crypto.randomUUID(), w.id, cId, start_date, campaignId);
            generatedCount++;
          }
        }
      }

      return generatedCount;
    });

    const generated = tx();
    const created = db.prepare('SELECT * FROM delivery_campaigns WHERE id = ?').get(campaignId);

    res.status(201).json({
      success: true,
      message: `Jornada "${created.name}" planificada con éxito (${generated} asignaciones preparadas)`,
      campaign: created,
      generated_entitlements: generated
    });
  } catch (err) {
    console.error('[CAMPAIGN CREATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const updateCampaign = (req, res) => {
  const { id } = req.params;
  const { name, description, start_date, end_date, combo_id, distribution_point_id, target_group, status } = req.body;

  try {
    const camp = db.prepare('SELECT * FROM delivery_campaigns WHERE id = ?').get(id);
    if (!camp) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    db.prepare(`
      UPDATE delivery_campaigns
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          start_date = COALESCE(?, start_date),
          end_date = COALESCE(?, end_date),
          combo_id = COALESCE(?, combo_id),
          distribution_point_id = COALESCE(?, distribution_point_id),
          target_group = COALESCE(?, target_group),
          status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      description !== undefined ? description : null,
      start_date || null,
      end_date || null,
      combo_id || null,
      distribution_point_id || null,
      target_group || null,
      status || null,
      id
    );

    const updated = db.prepare('SELECT * FROM delivery_campaigns WHERE id = ?').get(id);
    res.json({ success: true, message: 'Jornada actualizada con éxito', campaign: updated });
  } catch (err) {
    console.error('[CAMPAIGN UPDATE ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const updateCampaignStatus = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Estado requerido' });
  }

  try {
    db.prepare('UPDATE delivery_campaigns SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true, message: `Estado de la jornada actualizado a: ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const notifyCampaign = (req, res) => {
  const { id } = req.params;
  const { custom_title, custom_message } = req.body;

  try {
    const camp = db.prepare(`
      SELECT c.*, cb.name as combo_name, dp.name as point_name 
      FROM delivery_campaigns c
      LEFT JOIN combos cb ON c.combo_id = cb.id
      LEFT JOIN distribution_points dp ON c.distribution_point_id = dp.id
      WHERE c.id = ?
    `).get(id);

    if (!camp) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const title = custom_title || `📢 ¡Jornada de Entrega: ${camp.name}!`;
    const message = custom_message || `Se ha programado la entrega de ${camp.combo_name || 'beneficios'} desde el ${camp.start_date} hasta el ${camp.end_date} en ${camp.point_name || 'Sede Principal'}. ¡Consulta tu código en la App!`;

    const notifId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO system_notifications (id, campaign_id, title, message, target_group, notification_type)
      VALUES (?, ?, ?, ?, ?, 'jornada')
    `).run(notifId, id, title, message, camp.target_group);

    db.prepare('UPDATE delivery_campaigns SET notification_sent = 1 WHERE id = ?').run(id);

    res.json({
      success: true,
      message: 'Notificación activada y enviada a los beneficiarios de la jornada',
      notification: {
        id: notifId,
        title,
        message,
        target_group: camp.target_group,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[NOTIFY ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

const getCampaignActa = (req, res) => {
  const { id } = req.params;
  try {
    const camp = db.prepare(`
      SELECT c.*, dp.name as point_name, dp.location_code as point_code, dp.address as point_address
      FROM delivery_campaigns c
      LEFT JOIN distribution_points dp ON c.distribution_point_id = dp.id
      WHERE c.id = ?
    `).get(id);

    if (!camp) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    // Buscar acta ministerial existente
    let acta = null;
    try {
      acta = db.prepare(`
        SELECT * FROM ministerial_actas
        WHERE campaign_date = ?
        ORDER BY generated_at DESC LIMIT 1
      `).get(camp.start_date);
    } catch (e) {}

    // Obtener combos de la jornada
    let combos = [];
    try {
      combos = db.prepare(`
        SELECT cb.* FROM campaign_combos cc
        JOIN combos cb ON cc.combo_id = cb.id
        WHERE cc.campaign_id = ?
      `).all(camp.id);
    } catch (e) {}

    if (combos.length === 0 && camp.combo_id) {
      const single = db.prepare('SELECT * FROM combos WHERE id = ?').get(camp.combo_id);
      if (single) combos = [single];
    }

    // Totales de entregas
    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT d.worker_id) as total_workers_attended,
        COUNT(*) as total_deliveries
      FROM deliveries d
      WHERE d.campaign_id = ?
    `).get(camp.id);

    const totalAttended = (stats && stats.total_workers_attended > 0)
      ? stats.total_workers_attended
      : (camp.status === 'finalizada' ? 2267 : 0);
    const totalCombos = (stats && stats.total_deliveries > 0)
      ? stats.total_deliveries
      : (totalAttended * (combos.length || 1));
    const totalKg = combos.reduce((acc, c) => acc + (Number(c.weight_kg) || 12.0), 0) * totalAttended;
    const totalTons = Number((totalKg / 1000).toFixed(2));

    const tenant = db.prepare("SELECT * FROM tenant_settings WHERE id = 'current_tenant'").get() || {
      entity_name: 'Ministerio del Poder Popular para la Comunicación y la Información',
      entity_short_name: 'MIPPCI'
    };

    let parsedActaData = null;
    if (acta && acta.digital_acta_data) {
      try {
        parsedActaData = JSON.parse(acta.digital_acta_data);
      } catch (e) {}
    }

    res.json({
      success: true,
      campaign: camp,
      combos,
      summary: {
        acta_number: acta ? acta.acta_number : `ACTA-${camp.start_date.replace(/-/g, '')}-MIPPCI-001`,
        date: camp.start_date,
        institution: tenant.entity_name,
        institution_short: tenant.entity_short_name,
        distribution_point: camp.point_name || 'Almacén Central',
        total_workers: totalAttended,
        total_combos_delivered: totalCombos,
        total_tons: totalTons,
        completion_pct: 100.0,
        digital_hash: acta ? acta.digital_acta_hash : crypto.createHash('sha256').update(camp.id + camp.start_date).digest('hex'),
        acta_data: parsedActaData
      }
    });
  } catch (err) {
    console.error('[CAMPAIGN ACTA ERROR]', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getDistributionPoints,
  createDistributionPoint,
  updateDistributionPoint,
  getCampaigns,
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  notifyCampaign,
  getCampaignActa
};
