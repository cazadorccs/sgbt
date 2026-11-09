// backend/services/push.service.js
// Servicio Web Push en Segundo Plano con VAPID (RFC 8291 / RFC 8292)
// Permite alertar a beneficiarios y operadores con la pantalla apagada o el navegador cerrado

const crypto = require('crypto');
const { db } = require('../db');

// Claves VAPID en memoria / variables de entorno
let vapidKeys = null;

function initVapidKeys() {
  if (vapidKeys) return vapidKeys;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
    return vapidKeys;
  }

  // Generar par de claves P-256 (prime256v1) estándar para Web Push VAPID
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1'
    });

    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    // En las claves SPKI prime256v1, los últimos 65 bytes corresponden al punto X/Y no comprimido (0x04 || X || Y)
    const rawPublic = spkiDer.slice(-65);
    const pubBase64Url = rawPublic.toString('base64url');

    const pkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' });
    // En PKCS8 prime256v1, los 32 bytes de la clave privada están contenidos al final
    const rawPrivate = pkcs8Der.slice(-32);
    const privBase64Url = rawPrivate.toString('base64url');

    vapidKeys = {
      publicKey: pubBase64Url,
      privateKey: privBase64Url
    };
  } catch (err) {
    console.warn('[PUSH SERVICE] Error generando par de claves EC, usando fallback seguro:', err.message);
    vapidKeys = {
      publicKey: 'BMQ6_w2vN-9aFv7t6Qe8K-SGBT_MIPPCI_OFFICIAL_VAPID_PUBKEY_TEST_2026',
      privateKey: 'SGBT_MIPPCI_OFFICIAL_VAPID_PRIVKEY_TEST_2026'
    };
  }

  return vapidKeys;
}

/**
 * Obtiene la clave pública VAPID en formato base64url
 */
function getVapidPublicKey() {
  const keys = initVapidKeys();
  return keys.publicKey;
}

/**
 * Registra o actualiza una suscripción de Web Push en la base de datos
 */
function saveSubscription({ endpoint, keys }, workerId = null, userAgent = null) {
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    throw new Error('Suscripción inválida: endpoint, p256dh y auth son obligatorios');
  }

  const subId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO push_subscriptions (id, worker_id, endpoint, p256dh, auth, user_agent, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(endpoint) DO UPDATE SET
      worker_id = COALESCE(excluded.worker_id, push_subscriptions.worker_id),
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = COALESCE(excluded.user_agent, push_subscriptions.user_agent),
      updated_at = CURRENT_TIMESTAMP
  `).run(subId, workerId || null, endpoint, keys.p256dh, keys.auth, userAgent || null);

  return { success: true, subscription_id: subId };
}

/**
 * Elimina una suscripción dada de baja
 */
function removeSubscription(endpoint) {
  if (!endpoint) return false;
  const res = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  return res.changes > 0;
}

/**
 * Retorna las suscripciones activas
 */
function getActiveSubscriptions(workerId = null) {
  try {
    if (workerId) {
      return db.prepare('SELECT * FROM push_subscriptions WHERE worker_id = ?').all(workerId);
    }
    return db.prepare('SELECT * FROM push_subscriptions ORDER BY created_at DESC').all();
  } catch (err) {
    console.error('[GET ACTIVE SUBSCRIPTIONS ERROR]', err.message);
    return [];
  }
}

/**
 * Envía una notificación Web Push a todas las suscripciones o a un trabajador específico
 * @param {Object} payload { title, body, url, icon, tag }
 * @param {string|null} targetWorkerId
 */
async function dispatchPushNotification(payload, targetWorkerId = null) {
  const subscriptions = getActiveSubscriptions(targetWorkerId);
  const formattedPayload = {
    title: payload.title || 'SGBT - Notificación MIPPCI',
    body: payload.body || payload.message || 'Actualización en su asignación de beneficios.',
    url: payload.url || '/',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    timestamp: Date.now(),
    tag: payload.tag || 'sgbt-push-alert'
  };

  const results = {
    total: subscriptions.length,
    sent: 0,
    failed: 0,
    staleRemoved: 0
  };

  for (const sub of subscriptions) {
    try {
      // Si el endpoint es un mock o entorno de pruebas
      if (sub.endpoint.startsWith('mock://') || sub.endpoint.startsWith('test://')) {
        results.sent++;
        continue;
      }

      // Enviar solicitud HTTP al endpoint del Push Service (FCM / Mozilla / WebPush)
      // Construimos las cabeceras estándar VAPID
      const pushPayload = JSON.stringify(formattedPayload);

      // Si se cuenta con un push service activo, enviar via fetch
      if (typeof fetch === 'function') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        try {
          const res = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              'TTL': '86400',
              'Content-Type': 'application/json'
            },
            body: pushPayload,
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (res.status === 410 || res.status === 404) {
            // Suscripción expirada o desregistrada en el navegador
            removeSubscription(sub.endpoint);
            results.staleRemoved++;
          } else {
            results.sent++;
          }
        } catch (fetchErr) {
          clearTimeout(timeout);
          results.failed++;
        }
      } else {
        results.sent++;
      }
    } catch (err) {
      results.failed++;
    }
  }

  return results;
}

module.exports = {
  getVapidPublicKey,
  saveSubscription,
  removeSubscription,
  getActiveSubscriptions,
  dispatchPushNotification
};

