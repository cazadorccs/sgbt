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
 * Blindado contra fugas de información, ataques IDOR y suscripciones no autorizadas.
 */
function deliveryStream(req, res) {
  const origin = req.headers.origin || '';
  const currentUser = req.user;
  const requestedWorkerId = (req.query.worker_id || '').trim();

  const isSupervisorOrAdmin = currentUser && ['supervisor', 'admin', 'director', 'operator', 'distributor'].includes(currentUser.role);

  // 1. CONTROL DE ACCESO ESTRICTO:
  // El canal global '*' expone todas las entregas institucionales en tiempo real.
  // SOLO usuarios autenticados con rol operativo o directivo pueden suscribirse a '*'.
  if (!requestedWorkerId || requestedWorkerId === '*') {
    if (!isSupervisorOrAdmin) {
      return res.status(403).json({
        error: 'Acceso restringido: Se requieren privilegios de supervisor o administrador para monitorear el canal global de despachos.',
        code: 'FORBIDDEN_BROADCAST_STREAM'
      });
    }
  } else if (currentUser && !isSupervisorOrAdmin) {
    // 2. BLINDAJE ANTI-IDOR:
    // Un beneficiario regular solo puede suscribirse a su propio canal de notificaciones.
    const isOwnChannel = requestedWorkerId === currentUser.id || requestedWorkerId === currentUser.document_id;
    if (!isOwnChannel) {
      return res.status(403).json({
        error: 'Acceso no autorizado: No tiene permisos para suscribirse al flujo de entrega de otro beneficiario.',
        code: 'IDOR_STREAM_FORBIDDEN'
      });
    }
  }

  const targetChannel = requestedWorkerId || '*';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.flushHeaders?.();

  const clientId = crypto.randomUUID();
  const clientObj = { res, id: clientId, userId: currentUser ? currentUser.id : null };

  if (!sseClients.has(targetChannel)) {
    sseClients.set(targetChannel, new Set());
  }
  sseClients.get(targetChannel).add(clientObj);

  res.write(`event: connected\ndata: ${JSON.stringify({ worker_id: targetChannel, status: 'streaming', timestamp: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = sseClients.get(targetChannel);
    if (set) {
      set.delete(clientObj);
      if (set.size === 0) sseClients.delete(targetChannel);
    }
  });
}

module.exports = {
  notifyDeliveryStream,
  deliveryStream,
  sseClients
};
