// ============================================================================
// SERVICE WORKER OFFLINE-FIRST: SISTEMA DE BENEFICIOS MIPPCI
// Garantiza funcionamiento al 100% en sótanos y almacenes sin señal celular
// ============================================================================

const CACHE_NAME = 'mippci-bienestar-v1.2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/qrcode.js',
  '/js/html5-qrcode.min.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 1. INSTALACIÓN: Precarga de assets del shell de la aplicación
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precargando shell de la aplicación para modo Offline...');
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
    // Si es daily-pack o catálogo de combos, intentar red primero y guardar en caché
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

    // Otras peticiones API van directo a red (o se gestionan por la cola local del cliente)
    event.respondWith(fetch(event.request));
    return;
  }

  // B) Recursos estáticos (HTML, CSS, JS, Iconos): Estrategia Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // En segundo plano refrescar la caché si hay conexión
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {/* Silencioso en offline */});
        return cachedResponse;
      }

      // Si no estaba en caché, pedir a la red
      return fetch(event.request).catch(() => {
        // Si falla la red y es navegación HTML, retornar página principal en caché
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
