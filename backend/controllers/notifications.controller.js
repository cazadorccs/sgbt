// backend/controllers/notifications.controller.js
// Controlador para notificaciones y avisos institucionales

const crypto = require('crypto');
const { db } = require('../db');

const getNotifications = (req, res) => {
  const { worker_id } = req.query;

  try {
    let targetFilter = "n.target_group = 'all'";
    if (worker_id) {
      const worker = db.prepare('SELECT worker_type, department_id FROM workers WHERE id = ?').get(worker_id);
      if (worker) {
        targetFilter = `n.target_group IN ('all', '${worker.worker_type}', '${worker.department_id}')`;
      }
    }

    const notifications = db.prepare(`
      SELECT n.*, c.name as campaign_name, c.status as campaign_status
      FROM system_notifications n
      LEFT JOIN delivery_campaigns c ON n.campaign_id = c.id
      WHERE ${targetFilter}
      ORDER BY n.created_at DESC
      LIMIT 20
    `).all();

    res.json(notifications);
  } catch (err) {
    console.error('[NOTIFICATIONS GET ERROR]', err);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

const createNotification = (req, res) => {
  const { title, message, target_group, notification_type } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Título y Mensaje son requeridos' });
  }

  const notifId = crypto.randomUUID();
  try {
    db.prepare(`
      INSERT INTO system_notifications (id, title, message, target_group, notification_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(notifId, title.trim(), message.trim(), target_group || 'all', notification_type || 'alerta');

    res.status(201).json({
      success: true,
      message: 'Aviso publicado exitosamente',
      notification_id: notifId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getNotifications,
  createNotification
};
