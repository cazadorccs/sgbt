// ============================================================================
// CORE: INDEXEDDB PERSISTENCE ENGINE & BACKGROUND SYNC BRIDGE
// Sistema Institucional SGBT MIPPCI (Offline-First Resiliente)
// ============================================================================

window.OfflineStore = (function() {
  'use strict';

  const DB_NAME = 'sgbt_offline_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'deliveries_queue';

  let dbInstance = null;

  function openDatabase() {
    return new Promise((resolve) => {
      if (dbInstance) return resolve(dbInstance);

      if (!('indexedDB' in window)) {
        console.warn('[OFFLINE STORE] IndexedDB no soportado en este navegador');
        return resolve(null);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('delivered_at', 'delivered_at', { unique: false });
          store.createIndex('worker_id', 'worker_id', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('[OFFLINE STORE ERROR] Error abriendo IndexedDB:', event.target.error);
        resolve(null);
      };
    });
  }

  async function enqueueDelivery(delivery) {
    if (!delivery.id) {
      delivery.id = 'del_off_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }
    delivery.queued_at = new Date().toISOString();

    const db = await openDatabase();
    if (db) {
      await new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(delivery);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        } catch (e) {
          reject(e);
        }
      });
    }

    // Registrar evento en Background Sync API del Service Worker si está soportado
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.sync) {
          await reg.sync.register('sgbt-sync-deliveries');
          console.log('[OFFLINE STORE] 🔄 Evento Background Sync "sgbt-sync-deliveries" registrado exitosamente.');
        }
      } catch (syncErr) {
        console.warn('[OFFLINE STORE] Background Sync no permitido o rechazado:', syncErr);
      }
    }

    return delivery;
  }

  async function getAllPending() {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function removeDeliveries(ids) {
    if (!ids || ids.length === 0) return;
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function clearAll() {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  return {
    openDatabase,
    enqueueDelivery,
    getAllPending,
    removeDeliveries,
    clearAll
  };
})();
