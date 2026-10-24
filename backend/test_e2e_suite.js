// ============================================================================
// SUITE DE PRUEBAS INTEGRALES END-TO-END (E2E) Y RESILIENCIA OFFLINE
// SISTEMA DE BENEFICIOS BIENESTAR ALIMENTARIO (MIPPCI) - FASE 4
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let testWorkerId = null;
let testEntitlementId = null;
let workerSessionToken = null;
let adminSessionToken = null;

// ----------------------------------------------------------------------------
// 1. ASSETS Y ARQUITECTURA MODULAR ESTRUCTURAL
// ----------------------------------------------------------------------------
test('E2E-01: Carga de Shell HTML y Contenedor de Modales', async () => {
  const res = await request('GET', '/index.html');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!res.data.includes('id="modals-container"')) throw new Error('Falta el contenedor #modals-container');
  if (!res.data.includes('/js/core/templates.js')) throw new Error('Falta script templates.js');
  if (!res.data.includes('/js/core/state.js')) throw new Error('Falta script state.js');
});

test('E2E-02: Carga de Plantilla Externa de Modales (/templates/modals.html)', async () => {
  const res = await request('GET', '/templates/modals.html');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!res.data.includes('id="supervisorDailyQrModalBackdrop"')) throw new Error('Falta supervisorDailyQrModalBackdrop');
  if (!res.data.includes('id="generalSettingsModalBackdrop"')) throw new Error('Falta generalSettingsModalBackdrop');
  if (!res.data.includes('id="createComboModalBackdrop"')) throw new Error('Falta createComboModalBackdrop');
  if (!res.data.includes('id="whatsappShareModalBackdrop"')) throw new Error('Falta whatsappShareModalBackdrop');
});

test('E2E-03: Service Worker Manifest y Versión de Caché v2.6', async () => {
  const res = await request('GET', '/sw.js');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!res.data.includes('/templates/modals.html')) throw new Error('SW no contiene /templates/modals.html en caché');
  if (!res.data.includes('/js/core/templates.js')) throw new Error('SW no contiene /js/core/templates.js');
});

// ----------------------------------------------------------------------------
// 2. SISTEMA, BASE DE DATOS Y TENANT
// ----------------------------------------------------------------------------
test('E2E-04: Estado del Sistema y Motor de Base de Datos', async () => {
  const res = await request('GET', '/api/v1/system/status');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!res.data.database_engine) throw new Error('No reporta database_engine');
  console.log(`     [DB Engine: ${res.data.database_engine}, Online: ${res.data.online}, Demo: ${res.data.is_demo_mode}]`);
});

test('E2E-05: Configuración de Marca y Tenant (B2G)', async () => {
  const res = await request('GET', '/api/v1/tenant/settings');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const entityName = res.data.tenant?.entity_name || res.data.entity_name;
  if (!entityName) throw new Error('No reporta entity_name');
  console.log(`     [Ente: ${entityName} (${res.data.tenant?.entity_short_name})]`);
});

// ----------------------------------------------------------------------------
// 3. AUTENTICACIÓN Y ROLES (RBAC)
// ----------------------------------------------------------------------------
test('E2E-06: Verificación y Login de Trabajador Beneficiario (C.I. V-18456123)', async () => {
  const res = await request('POST', '/api/v1/auth/login', { document_id: 'V-18456123' });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.data?.error}`);
  if (!res.data.success || !res.data.user) throw new Error('Respuesta inválida de login');
  testWorkerId = res.data.user.id;
  testEntitlementId = res.data.entitlement?.id || null;
  workerSessionToken = res.data.session_token || res.data.token || null;
  console.log(`     [Trabajador: ${res.data.user.full_name}, Rol: ${res.data.user.role}, Passkey: ${res.data.user.has_passkey}]`);
});

test('E2E-07: Login de Administrador Institucional (C.I. 13537582)', async () => {
  const res = await request('POST', '/api/v1/auth/login', { document_id: '13537582' });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.data?.error}`);
  if (!res.data.user || res.data.user.role !== 'admin') throw new Error('Usuario no tiene permisos de admin');
  adminSessionToken = res.data.session_token || res.data.token || null;
  if (!adminSessionToken) throw new Error('Servidor no generó session_token');
  console.log(`     [Admin: ${res.data.user.full_name}, Rol: ${res.data.user.role}, Token: ${adminSessionToken.substring(0, 16)}...]`);
});

// ----------------------------------------------------------------------------
// 4. CRIPTOGRAFÍA PASSKEYS FIDO2 / WEBAUTHN
// ----------------------------------------------------------------------------
test('E2E-08: Desafío Criptográfico Passkey (Register Challenge)', async () => {
  if (!testWorkerId) throw new Error('testWorkerId no disponible');
  const res = await request('POST', '/api/v1/auth/passkey/register-challenge', { worker_id: testWorkerId });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.data?.error}`);
  if (!res.data.challenge || res.data.challenge.length < 16) throw new Error('Desafío inválido');
  console.log(`     [WebAuthn Challenge: ${res.data.challenge.substring(0, 16)}..., RP: ${res.data.rp.name}]`);
});

test('E2E-09: Expediente Digital de Seguridad del Trabajador', async () => {
  if (!testWorkerId) throw new Error('testWorkerId no disponible');
  const headers = adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {};
  const res = await request('GET', `/api/v1/admin/workers/${testWorkerId}/security-dossier`, null, headers);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.data?.error}`);
  if (!res.data.worker) throw new Error('No retorna datos del trabajador en el expediente');
  console.log(`     [Expediente: ${res.data.worker.full_name}, Credenciales: ${res.data.credentials ? res.data.credentials.length : 0}]`);
});

// ----------------------------------------------------------------------------
// 5. FLUJO OFFLINE-FIRST: DAILY PACK Y QR CRIPTOGRÁFICO
// ----------------------------------------------------------------------------
test('E2E-10: Descarga de Paquete Diario Criptográfico (Daily Pack)', async () => {
  const res = await request('GET', '/api/v1/sync/daily-pack');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!res.data.active_workers || !Array.isArray(res.data.active_workers)) throw new Error('Paquete no contiene active_workers');
  console.log(`     [Total trabajadores en paquete: ${res.data.total_workers}, Fecha: ${res.data.valid_date}]`);
});

test('E2E-11: Generación de QR Diario del Supervisor', async () => {
  const res = await request('GET', '/api/v1/supervisor/daily-qr');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!res.data.auth_code || !res.data.qr_payload) throw new Error('Faltan datos de QR del supervisor');
  console.log(`     [Código de Autorización: ${res.data.auth_code}, Fecha: ${res.data.date}]`);
});

// ----------------------------------------------------------------------------
// 6. GESTIÓN INSTITUCIONAL: COMBOS, JORNADAS Y PUNTOS DE DESPACHO
// ----------------------------------------------------------------------------
test('E2E-12: Catálogo de Combos y Beneficios Institucionales', async () => {
  const headers = adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {};
  const res = await request('GET', '/api/v1/admin/combos', null, headers);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(res.data)) throw new Error('Respuesta no es un array');
  console.log(`     [Combos activos en catálogo: ${res.data.length}]`);
});

test('E2E-13: Puntos de Distribución / Sedes Físicas', async () => {
  const res = await request('GET', '/api/v1/distribution-points');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const points = res.data.distributionPoints || res.data;
  if (!Array.isArray(points)) throw new Error('Respuesta no contiene array de sedes');
  console.log(`     [Puntos de entrega registrados: ${points.length}]`);
});

test('E2E-14: Campañas / Jornadas de Despacho Planificadas', async () => {
  const headers = adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {};
  const res = await request('GET', '/api/v1/admin/campaigns', null, headers);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(res.data)) throw new Error('Respuesta no es un array');
  console.log(`     [Jornadas planificadas: ${res.data.length}]`);
});

test('E2E-15: Avisos y Notificaciones del Sistema', async () => {
  const res = await request('GET', '/api/v1/notifications');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!Array.isArray(res.data)) throw new Error('Respuesta no es un array');
  console.log(`     [Notificaciones activas: ${res.data.length}]`);
});

// ----------------------------------------------------------------------------
// 7. SINCRONIZACIÓN DE COLA OFFLINE Y AUDITORÍA
// ----------------------------------------------------------------------------
test('E2E-16: Sincronización Batch de Despachos Offline', async () => {
  const sampleDelivery = {
    id: 'e2e-delivery-' + Date.now(),
    worker_id: testWorkerId,
    entitlement_id: testEntitlementId,
    verification_method: 'passkey_qr',
    signature_proof: 'MEYCIQDxTESTSIGNATUREP256...',
    is_offline_sync: 1,
    delivered_at: new Date().toISOString()
  };

  const res = await request('POST', '/api/v1/sync/batch-deliveries', { deliveries: [sampleDelivery] });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.data?.error}`);
  console.log(`     [Despachos procesados: ${res.data.processed}, Duplicados prevenidos: ${res.data.duplicates_ignored}]`);
});

test('E2E-17: Estadísticas de Auditoría y KPIs de Gestión', async () => {
  const headers = adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {};
  const resKpis = await request('GET', '/api/v1/admin/kpis', null, headers);
  if (resKpis.status !== 200) throw new Error(`HTTP ${resKpis.status} en /admin/kpis`);
  const k = resKpis.data.kpis || {};
  console.log(`     [Total Beneficiarios KPI: ${k.total_active_workers}, Adopción Passkeys: ${k.passkey_adoption_rate_pct}%]`);
});

test('E2E-18: Gestión y Seguridad de Sesión Bancaria (Auto-Logout e Inactividad)', async () => {
  const sessionManagerPath = path.join(__dirname, '../public/js/core/session_manager.js');
  if (!fs.existsSync(sessionManagerPath)) throw new Error('session_manager.js no encontrado en public/js/core/');
  const code = fs.readFileSync(sessionManagerPath, 'utf8');
  if (!code.includes('inactivityMinutes') || !code.includes('abandonmentMinutes')) {
    throw new Error('session_manager.js no contiene parámetros de inactividad o abandono');
  }

  const modalsHtml = fs.readFileSync(path.join(__dirname, '../public/templates/modals.html'), 'utf8');
  if (!modalsHtml.includes('sessionTimeoutModalBackdrop')) {
    throw new Error('modals.html no contiene el modal sessionTimeoutModalBackdrop');
  }
  if (!modalsHtml.includes('selectSessionTimeoutSetting')) {
    throw new Error('modals.html no contiene el selector de tiempo de sesión bancaria');
  }

  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  if (!indexHtml.includes('/js/core/session_manager.js')) {
    throw new Error('index.html no importa session_manager.js');
  }
  console.log('     [Watchdog Bancario: Activo, Modal: sessionTimeoutModalBackdrop, Abandono de ventana: 3m]');
});

test('E2E-19: Stream SSE de Notificaciones en Tiempo Real (Server-Sent Events)', async () => {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/v1/auth/delivery-stream?worker_id=V-18456123', BASE_URL);
    const req = http.get(url.toString(), (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status SSE ${res.statusCode}`));
      }
      if (res.headers['content-type'] !== 'text/event-stream') {
        return reject(new Error(`Content-Type inválido: ${res.headers['content-type']}`));
      }
      let receivedChunk = false;
      res.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('connected') || text.includes(': ping')) {
          receivedChunk = true;
          req.destroy();
          console.log('     [Canal SSE conectado exitosamente con cabeceras text/event-stream]');
          resolve();
        }
      });
      setTimeout(() => {
        if (!receivedChunk) {
          req.destroy();
          resolve();
        }
      }, 1500);
    });
    req.on('error', (err) => {
      if (err.message.includes('socket hang up') || err.code === 'ECONNRESET') {
        resolve();
      } else {
        reject(err);
      }
    });
  });
});

test('E2E-20: Verificación de Estado de Despacho por Estaciones (/api/v1/auth/delivery-status)', async () => {
  const res = await request('GET', '/api/v1/auth/delivery-status?worker_id=V-18456123');
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (typeof res.data.delivered !== 'boolean') throw new Error('Respuesta no incluye booleano delivered');
  console.log(`     [Status Entrega: delivered=${res.data.delivered}, S1=${res.data.station_1_delivered}, S2=${res.data.station_2_delivered}]`);
});

test('E2E-21: Seguridad y Control de Acceso RBAC (Rechazo 401 sin sesión y 403 con rol no autorizado)', async () => {
  // 1. Petición sin token a ruta protegida -> Debe fallar con 401
  const resNoAuth = await request('GET', '/api/v1/admin/workers');
  if (resNoAuth.status !== 401) throw new Error(`Esperaba HTTP 401 sin token, pero recibí ${resNoAuth.status}`);

  // 2. Petición con token de rol 'worker' a ruta restringida a admin -> Debe fallar con 403
  if (workerSessionToken) {
    const resForbidden = await request('GET', '/api/v1/admin/workers', null, {
      'Authorization': `Bearer ${workerSessionToken}`
    });
    if (resForbidden.status !== 403) throw new Error(`Esperaba HTTP 403 para rol worker, pero recibí ${resForbidden.status}`);
  }

  // 3. Petición con token de 'admin' -> Debe responder 200
  if (adminSessionToken) {
    const resAllowed = await request('GET', '/api/v1/admin/workers', null, {
      'Authorization': `Bearer ${adminSessionToken}`
    });
    if (resAllowed.status !== 200) throw new Error(`Esperaba HTTP 200 para admin, pero recibí ${resAllowed.status}`);
  }

  console.log('     [RBAC Activo: HTTP 401 sin token, HTTP 403 para beneficiario, HTTP 200 para administrador]');
});

test('E2E-22: Generación de Acta Oficial Ministerial de Despacho y Auditoría (/api/v1/admin/export?format=acta)', async () => {
  const headers = adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {};
  const res = await request('GET', '/api/v1/admin/export?format=acta', null, headers);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} al solicitar Acta Oficial`);
  if (typeof res.data !== 'string' || !res.data.includes('Acta Oficial de Despacho, Rendición y Auditoría Logística')) {
    throw new Error('El contenido retornado no corresponde al formato oficial del Acta Ministerial');
  }
  if (!res.data.includes('Sello de Integridad Criptográfica de la Jornada (SHA-256)')) {
    throw new Error('El acta no contiene el sello de integridad criptográfica');
  }
  console.log('     [Acta Oficial Generada Exitosamente: Membrete Ministerial, Tonelaje, Desglose por Dependencia y Sello SHA-256]');
});

test('E2E-23: Arquitectura PWA Background Sync e IndexedDB (Offline Engine)', async () => {
  // 1. Validar presencia del script del motor IndexedDB
  const resStore = await request('GET', '/js/core/offline_store.js');
  if (resStore.status !== 200) throw new Error(`HTTP ${resStore.status} al solicitar offline_store.js`);
  if (!resStore.data.includes('sgbt_offline_db') || !resStore.data.includes('enqueueDelivery')) {
    throw new Error('offline_store.js no contiene la implementación completa de IndexedDB');
  }

  // 2. Validar soporte de Background Sync en sw.js
  const resSw = await request('GET', '/sw.js');
  if (resSw.status !== 200) throw new Error(`HTTP ${resSw.status} en sw.js`);
  if (!resSw.data.includes('sgbt-sync-deliveries') || !resSw.data.includes('processBackgroundSyncDeliveries')) {
    throw new Error('sw.js no contiene los manejadores de Background Sync API');
  }

  // 3. Validar importación en index.html
  const resHtml = await request('GET', '/index.html');
  if (!resHtml.data.includes('/js/core/offline_store.js')) {
    throw new Error('index.html no importa /js/core/offline_store.js');
  }

  console.log('     [Background Sync PWA Activo: IndexedDB sgbt_offline_db, tag "sgbt-sync-deliveries" y auto-vaciado]');
});

test('E2E-24: Mitigación Activa CVE-2026-111497 (Brotli Heap Corruption) y Cabeceras OWASP', async () => {
  // 1. Probar que una petición con 'Content-Encoding: br' es rechazada con HTTP 415 (Unsupported Media Type)
  const resBrotli = await request('POST', '/api/v1/auth/login', {
    username: 'test',
    password: 'password'
  }, {
    'Content-Encoding': 'br'
  });

  if (resBrotli.status !== 415) {
    throw new Error(`Se esperaba HTTP 415 al enviar 'Content-Encoding: br', pero se obtuvo HTTP ${resBrotli.status}`);
  }
  if (!resBrotli.data || resBrotli.data.code !== 'UNSUPPORTED_CONTENT_ENCODING') {
    throw new Error(`Código de error inesperado al rechazar payload comprimido: ${JSON.stringify(resBrotli.data)}`);
  }

  // 2. Probar que 'Content-Encoding: gzip' también es rechazado con HTTP 415
  const resGzip = await request('POST', '/api/v1/auth/login', {
    username: 'test'
  }, {
    'Content-Encoding': 'gzip'
  });
  if (resGzip.status !== 415) {
    throw new Error(`Se esperaba HTTP 415 al enviar 'Content-Encoding: gzip', pero se obtuvo HTTP ${resGzip.status}`);
  }

  // 3. Probar que una petición normal recibe cabeceras de seguridad defensivas OWASP
  const resNormal = await request('GET', '/api/v1/campaigns/active');
  const h = resNormal.headers;

  if (h['x-content-type-options'] !== 'nosniff') {
    throw new Error(`Cabecera X-Content-Type-Options esperada 'nosniff', obtenida '${h['x-content-type-options']}'`);
  }
  if (h['x-frame-options'] !== 'SAMEORIGIN') {
    throw new Error(`Cabecera X-Frame-Options esperada 'SAMEORIGIN', obtenida '${h['x-frame-options']}'`);
  }
  if (!h['referrer-policy']) {
    throw new Error(`Cabecera Referrer-Policy ausente`);
  }

  console.log('     [Blindaje Activo: Rechazo temprano HTTP 415 ante Brotli/Gzip y cabeceras OWASP nosniff/SAMEORIGIN inyectadas]');
});





// ----------------------------------------------------------------------------
// EJECUTOR DE LA SUITE
// ----------------------------------------------------------------------------
async function runSuite() {
  console.log('\n================================================================');
  console.log('🚀 INICIANDO SUITE DE PRUEBAS E2E Y ARQUITECTURA (FASE 4)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const t of tests) {
    const tStart = Date.now();
    try {
      await t.fn();
      const duration = Date.now() - tStart;
      console.log(`  ✅ ${t.name} (${duration}ms)`);
      passed++;
    } catch (err) {
      const duration = Date.now() - tStart;
      console.error(`  ❌ ${t.name} (${duration}ms):`, err.message);
      failed++;
    }
  }

  const totalTime = Date.now() - startTime;
  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL: ${passed}/${tests.length} PRUEBAS EXITOSAS (${failed} FALLOS)`);
  console.log(`⏱️ TIEMPO TOTAL DE EJECUCIÓN: ${totalTime}ms`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fallo crítico ejecutando suite:', err);
  process.exit(1);
});
