// backend/controllers/notifications.controller.js
// Controlador para notificaciones, avisos institucionales y Web Push API (VAPID)

const crypto = require('crypto');
const { db } = require('../db');
const pushService = require('../services/push.service');

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

const createNotification = async (req, res) => {
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

    // Despacho en segundo plano a dispositivos suscritos mediante Web Push VAPID
    pushService.dispatchPushNotification({
      title: title.trim(),
      body: message.trim(),
      tag: notification_type || 'jornada-alert',
      url: '/'
    }).catch(pushErr => console.warn('[PUSH DISPATCH BACKGROUND WARNING]', pushErr.message));

    res.status(201).json({
      success: true,
      message: 'Aviso publicado exitosamente',
      notification_id: notifId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getVapidPublicKey = (req, res) => {
  try {
    const publicKey = pushService.getVapidPublicKey();
    res.json({ success: true, publicKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const subscribeWebPush = (req, res) => {
  try {
    const { subscription, worker_id } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Objeto de suscripción Web Push inválido' });
    }

    const effectiveWorkerId = worker_id || req.user?.id || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = pushService.saveSubscription(subscription, effectiveWorkerId, userAgent);
    res.json({
      success: true,
      message: 'Dispositivo suscrito a notificaciones Web Push en segundo plano.',
      subscription_id: result.subscription_id
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const unsubscribeWebPush = (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint requerido' });
    }

    pushService.removeSubscription(endpoint);
    res.json({ success: true, message: 'Suscripción dada de baja exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const sendTestPush = async (req, res) => {
  try {
    const { title, message, worker_id } = req.body;
    const result = await pushService.dispatchPushNotification({
      title: title || '🔔 Prueba de Web Push SGBT',
      body: message || 'Comprobación de conectividad en segundo plano exitosa.'
    }, worker_id || null);

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getNotifications,
  createNotification,
  getVapidPublicKey,
  subscribeWebPush,
  unsubscribeWebPush,
  sendTestPush
};
