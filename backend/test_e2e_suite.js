// ============================================================================
// SUITE DE PRUEBAS INTEGRALES END-TO-END (E2E) Y RESILIENCIA OFFLINE
// SISTEMA DE BENEFICIOS BIENESTAR ALIMENTARIO (MIPPCI) - FASE 4
// ============================================================================

const http = require('http');

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
  console.log(`     [Trabajador: ${res.data.user.full_name}, Rol: ${res.data.user.role}, Passkey: ${res.data.user.has_passkey}]`);
});

test('E2E-07: Login de Administrador Institucional (C.I. 13537582)', async () => {
  const res = await request('POST', '/api/v1/auth/login', { document_id: '13537582' });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.data?.error}`);
  if (!res.data.user || res.data.user.role !== 'admin') throw new Error('Usuario no tiene permisos de admin');
  console.log(`     [Admin: ${res.data.user.full_name}, Rol: ${res.data.user.role}]`);
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
  const res = await request('GET', `/api/v1/admin/workers/${testWorkerId}/security-dossier`);
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
  const res = await request('GET', '/api/v1/admin/combos');
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
  const res = await request('GET', '/api/v1/admin/campaigns');
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
  const resKpis = await request('GET', '/api/v1/admin/kpis');
  if (resKpis.status !== 200) throw new Error(`HTTP ${resKpis.status} en /admin/kpis`);
  const k = resKpis.data.kpis || {};
  console.log(`     [Total Beneficiarios KPI: ${k.total_active_workers}, Adopción Passkeys: ${k.passkey_adoption_rate_pct}%]`);
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
