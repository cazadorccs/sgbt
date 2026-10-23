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
    const campaigns = db.prepare(`
      SELECT 
        c.id, c.name, c.description, c.start_date, c.end_date, c.target_group, c.status, c.notification_sent, c.created_at,
        cb.name as combo_name, cb.category as combo_category, cb.icon as combo_icon, cb.items_detail as combo_items,
        dp.name as point_name, dp.location_code as point_code
      FROM delivery_campaigns c
      LEFT JOIN combos cb ON c.combo_id = cb.id
      LEFT JOIN distribution_points dp ON c.distribution_point_id = dp.id
      ORDER BY c.start_date DESC, c.created_at DESC
    `).all();

    const enriched = campaigns.map(camp => {
      let workerCondition = "status = 'active'";
      if (camp.target_group === 'activo') workerCondition += " AND worker_type = 'activo'";
      else if (camp.target_group === 'jubilado') workerCondition += " AND worker_type IN ('jubilado', 'pensionado')";
      else if (camp.target_group === 'contratado') workerCondition += " AND worker_type = 'contratado'";

      const totalEligible = db.prepare(`SELECT COUNT(*) as count FROM workers WHERE ${workerCondition}`).get().count;

      const entitlements = db.prepare(`
        SELECT 
          COUNT(*) as total_entitlements,
          SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM daily_entitlements
        WHERE valid_date >= ? AND valid_date <= ? AND combo_id = ?
      `).get(camp.start_date, camp.end_date, camp.combo_id || '');

      return {
        ...camp,
        total_eligible: totalEligible,
        assigned_count: entitlements ? (entitlements.total_entitlements || 0) : 0,
        claimed_count: entitlements ? (entitlements.claimed_count || 0) : 0,
        pending_count: entitlements ? (entitlements.pending_count || 0) : 0
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[CAMPAIGNS GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener jornadas de entrega' });
  }
};

const createCampaign = (req, res) => {
  const { name, description, start_date, end_date, combo_id, target_group, distribution_point_id, auto_generate_entitlements } = req.body;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nombre de jornada, fecha inicio y fecha fin son obligatorios' });
  }

  const campaignId = crypto.randomUUID();
  const group = target_group || 'all';

  try {
    const tx = db.transaction(() => {
      // Validar claves foráneas para evitar 'FOREIGN KEY constraint failed'
      let validComboId = null;
      if (combo_id) {
        const found = db.prepare('SELECT id FROM combos WHERE id = ?').get(combo_id);
        if (found) validComboId = found.id;
      }

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
        validComboId,
        group,
        validPointId
      );

      let generatedCount = 0;

      if (validComboId && (auto_generate_entitlements !== false)) {
        let workerQuery = "SELECT id FROM workers WHERE status = 'active'";
        if (group === 'activo') workerQuery += " AND worker_type = 'activo'";
        else if (group === 'jubilado') workerQuery += " AND worker_type IN ('jubilado', 'pensionado')";
        else if (group === 'contratado') workerQuery += " AND worker_type = 'contratado'";

        const workers = db.prepare(workerQuery).all();
        const insertEntitlement = db.prepare(`
          INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
          VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
        `);

        for (const w of workers) {
          insertEntitlement.run(crypto.randomUUID(), w.id, validComboId, start_date);
          generatedCount++;
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

module.exports = {
  getDistributionPoints,
  createDistributionPoint,
  updateDistributionPoint,
  getCampaigns,
  createCampaign,
  updateCampaignStatus,
  notifyCampaign
};
