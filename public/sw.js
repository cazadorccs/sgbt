// ============================================================================
// SERVICE WORKER OFFLINE-FIRST: SISTEMA DE BENEFICIOS MIPPCI
// Garantiza funcionamiento al 100% en sótanos y almacenes sin señal celular
// ============================================================================

const CACHE_NAME = 'mippci-bienestar-v2.6-templates';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/templates/modals.html',
  '/css/styles.css',
  '/js/qrcode.js',
  '/js/html5-qrcode.min.js',
  '/js/core/templates.js',
  '/js/core/state.js',
  '/js/core/audio.js',
  '/js/core/toast.js',
  '/js/core/api.js',
  '/js/modules/auth.js',
  '/js/modules/beneficiary.js',
  '/js/modules/distributor.js',
  '/js/modules/admin.js',
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
      console.log('[SW] Precargando shell de la aplicación para modo Offline (v2.0 Light)...');
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
