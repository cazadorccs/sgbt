// ============================================================================
// SERVICE WORKER OFFLINE-FIRST: SISTEMA DE BENEFICIOS MIPPCI
// Garantiza funcionamiento al 100% en sótanos y almacenes sin señal celular
// ============================================================================

const CACHE_NAME = 'mippci-bienestar-v2.6-bgsync';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/templates/modals.html',
  '/css/styles.css',
  '/js/qrcode.js',
  '/js/html5-qrcode.min.js',
  '/js/core/templates.js',
  '/js/core/state.js',
  '/js/core/offline_store.js',
  '/js/core/audio.js',
  '/js/core/toast.js',
  '/js/core/api.js',
  '/js/core/session_manager.js',
  '/js/modules/auth.js',
  '/js/modules/beneficiary.js',
  '/js/modules/distributor.js',
  '/js/modules/admin.js',
  '/js/modules/manual_dispatch.js',
  '/js/modules/payroll.js',
  '/js/modules/combos.js',
  '/js/modules/notifications.js',
  '/js/modules/share.js',
  '/js/modules/settings.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 1. INSTALACIÓN: Precarga de assets del shell de la aplicación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precargando shell de la aplicación para modo Offline (v2.6 Background Sync)...');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVACIÓN: Limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. INTERCEPTOR DE PETICIONES (FETCH)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // A) Rutas de la API (/api/...)
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.includes('/daily-pack') || url.pathname.includes('/admin/combos')) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            console.log('[SW] Modo Offline: Sirviendo respuesta en caché para:', url.pathname);
            return caches.match(event.request);
          })
      );
      return;
    }

    event.respondWith(fetch(event.request));
    return;
  }

  // B) Recursos estáticos (HTML, CSS, JS, Iconos): Estrategia Network-First con fallback a Caché
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// ============================================================================
// 4. BACKGROUND SYNC: PROCESAMIENTO ASÍNCRONO DE DESPACHOS OFFLINE EN INDEXEDDB
// ============================================================================

const OFFLINE_DB_NAME = 'sgbt_offline_db';
const OFFLINE_STORE_NAME = 'deliveries_queue';

function openIndexedDbInWorker() {
  return new Promise((resolve) => {
    if (!self.indexedDB) return resolve(null);
    const req = self.indexedDB.open(OFFLINE_DB_NAME, 1);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
  });
}

function getDeliveriesFromDb(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([OFFLINE_STORE_NAME], 'readonly');
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function clearDeliveriesFromDb(db, ids) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([OFFLINE_STORE_NAME], 'readwrite');
      const store = tx.objectStore(OFFLINE_STORE_NAME);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function processBackgroundSyncDeliveries() {
  console.log('[SW BACKGROUND SYNC] 📡 Disparando vaciado de cola diferida en IndexedDB...');
  const db = await openIndexedDbInWorker();
  if (!db) return;

  const deliveries = await getDeliveriesFromDb(db);
  if (!deliveries || deliveries.length === 0) {
    console.log('[SW BACKGROUND SYNC] No hay entregas pendientes en IndexedDB.');
    return;
  }

  console.log(`[SW BACKGROUND SYNC] 📦 Transmitiendo lote de ${deliveries.length} entregas offline acumuladas...`);

  try {
    const response = await fetch('/api/v1/sync/batch-deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distribution_point_id: '550e8400-e29b-41d4-a716-446655440000',
        device_id: 'distributor_sw_background_sync',
        deliveries
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('[SW BACKGROUND SYNC] ✅ Despachos sincronizados en lote con éxito:', result);

    const idsToRemove = deliveries.map(d => d.id).filter(Boolean);
    await clearDeliveriesFromDb(db, idsToRemove);

    // Notificar a las ventanas activas de la PWA para actualizar contadores y tabla
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'BACKGROUND_SYNC_COMPLETE',
        processed: result.processed,
        failed_duplicates: result.failed_duplicates,
        total: deliveries.length
      });
    }

    // Mostrar notificación nativa PWA si está permitida
    if (self.Notification && self.Notification.permission === 'granted') {
      self.registration.showNotification('SGBT Bienestar Alimentario', {
        body: `✅ ${deliveries.length} despachos offline se sincronizaron automáticamente en segundo plano.`,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'sgbt-bg-sync'
      });
    }
  } catch (err) {
    console.warn('[SW BACKGROUND SYNC] Error transmitiendo lote en segundo plano. Se reintentará:', err);
    throw err;
  }
}

// Escuchador de la Background Sync API nativa
self.addEventListener('sync', (event) => {
  if (event.tag === 'sgbt-sync-deliveries') {
    event.waitUntil(processBackgroundSyncDeliveries());
  }
});

// Soporte de invocación manual desde el cliente vía postMessage
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_BACKGROUND_SYNC') {
    event.waitUntil(processBackgroundSyncDeliveries());
  }
});

