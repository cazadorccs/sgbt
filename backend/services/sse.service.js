// backend/services/sse.service.js
// Servicio en tiempo real: Server-Sent Events (SSE)
// Notificación push reactiva instantánea entre puestos de despacho y dispositivos móviles

const crypto = require('crypto');

const sseClients = new Map(); // worker_id -> Set of { res, id }

/**
 * Emite una notificación push a los clientes suscritos al flujo de entregas.
 * @param {string} worker_id - ID del trabajador o '*' para difusión general.
 * @param {object} data - Carga útil JSON del evento.
 */
function notifyDeliveryStream(worker_id, data) {
  const jsonStr = JSON.stringify(data);
  const targets = [];

  if (worker_id && sseClients.has(worker_id)) {
    targets.push(...sseClients.get(worker_id));
  }
  if (sseClients.has('*')) {
    targets.push(...sseClients.get('*'));
  }

  targets.forEach(client => {
    try {
      client.res.write(`event: delivery_update\ndata: ${jsonStr}\n\n`);
    } catch (e) {
      if (worker_id && sseClients.has(worker_id)) {
        sseClients.get(worker_id).delete(client);
      }
    }
  });
}

/**
 * Controlador de conexión para el canal HTTP Server-Sent Events.
 */
function deliveryStream(req, res) {
  const worker_id = req.query.worker_id || '*';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = crypto.randomUUID();
  const clientObj = { res, id: clientId };

  if (!sseClients.has(worker_id)) {
    sseClients.set(worker_id, new Set());
  }
  sseClients.get(worker_id).add(clientObj);

  res.write(`event: connected\ndata: ${JSON.stringify({ worker_id, status: 'streaming', timestamp: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = sseClients.get(worker_id);
    if (set) {
      set.delete(clientObj);
      if (set.size === 0) sseClients.delete(worker_id);
    }
  });
}

module.exports = {
  notifyDeliveryStream,
  deliveryStream,
  sseClients
};
