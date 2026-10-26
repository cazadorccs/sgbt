// backend/test_combo_scenarios.js
// Suite de verificación automatizada de todos los escenarios para combos y asignaciones programadas

const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runAllScenarios() {
  console.log('================================================================');
  console.log('🧪 SUITE INTEGRAL DE PRUEBAS MULTI-ESCENARIO: COMBOS PROGRAMADOS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName} ${details ? '(' + details + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  // 1. Obtener Token de Administrador
  console.log('--- PASO 0: Autenticación Admin ---');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { document_id: '13537582' });

  assert(loginRes.status === 200 && loginRes.body.token, 'Login Admin con C.I. 13537582');
  const token = loginRes.body.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Escenario 1: Estado Inicial con Combo de Útiles Desactivado
  console.log('\n--- ESCENARIO 1: Verificación de Estado Actual (Combo Desactivado) ---');
  const kpiRes1 = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/kpis',
    method: 'GET',
    headers: authHeaders
  });
  assert(
    kpiRes1.body?.kpis?.combos_assigned_today === 4544,
    'KPIs Admin: combos_assigned_today es 4544 (1136 trabajadores x 4 combos activos)',
    `Valor recibido: ${kpiRes1.body?.kpis?.combos_assigned_today}`
  );

  const manualRes1 = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/manual-dispatch/today-summary',
    method: 'GET',
    headers: authHeaders
  });
  assert(
    manualRes1.body?.stats?.combos_assigned_today === 4544,
    'Despacho Manual: combos_assigned_today es 4544',
    `Valor recibido: ${manualRes1.body?.stats?.combos_assigned_today}`
  );

  // Escenario 2: Reactivación del combo de Útiles
  console.log('\n--- ESCENARIO 2: Reactivación del Combo en Catálogo ---');
  const toggleOnRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/combos/0f74d741-6310-4d6c-b8e5-8cd6e76f9113/toggle-status',
    method: 'PATCH',
    headers: authHeaders
  }, {});

  assert(toggleOnRes.status === 200, 'PATCH toggle-status activa combo exitosamente');
  assert(toggleOnRes.body?.combos_assigned_today === 5680, 'Respuesta retorna combos_assigned_today: 5680');

  const kpiRes2 = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/kpis',
    method: 'GET',
    headers: authHeaders
  });
  assert(
    kpiRes2.body?.kpis?.combos_assigned_today === 5680,
    'KPIs Admin se incrementaron a 5680 (1136 x 5 combos activos)',
    `Valor recibido: ${kpiRes2.body?.kpis?.combos_assigned_today}`
  );

  const manualRes2 = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/manual-dispatch/today-summary',
    method: 'GET',
    headers: authHeaders
  });
  assert(
    manualRes2.body?.stats?.combos_assigned_today === 5680,
    'Despacho Manual se incrementó a 5680',
    `Valor recibido: ${manualRes2.body?.stats?.combos_assigned_today}`
  );

  // Escenario 3: Volver a desactivar el combo de Útiles
  console.log('\n--- ESCENARIO 3: Desactivación Reactiva del Combo ---');
  const toggleOffRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/combos/0f74d741-6310-4d6c-b8e5-8cd6e76f9113/toggle-status',
    method: 'PATCH',
    headers: authHeaders
  }, {});

  assert(toggleOffRes.status === 200, 'PATCH toggle-status desactiva combo exitosamente');
  assert(toggleOffRes.body?.combos_assigned_today === 4544, 'Respuesta retorna combos_assigned_today: 4544');

  const kpiRes3 = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/kpis',
    method: 'GET',
    headers: authHeaders
  });
  assert(
    kpiRes3.body?.kpis?.combos_assigned_today === 4544,
    'KPIs Admin bajaron inmediatamente a 4544',
    `Valor recibido: ${kpiRes3.body?.kpis?.combos_assigned_today}`
  );

  // Escenario 4: Desactivar un segundo combo (Combo de Limpieza: 2e39c4a5-0611-4a03-b10c-08ef7e270684)
  console.log('\n--- ESCENARIO 4: Desactivación de un Segundo Combo (Multi-Combo Inactivo) ---');
  const toggleSecondOff = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/combos/2e39c4a5-0611-4a03-b10c-08ef7e270684/toggle-status',
    method: 'PATCH',
    headers: authHeaders
  }, {});

  assert(toggleSecondOff.status === 200, 'Desactivar segundo combo exitoso');
  assert(toggleSecondOff.body?.combos_assigned_today === 3408, 'combos_assigned_today baja a 3408 (1136 x 3 combos)');

  // Escenario 5: Reactivar el segundo combo
  console.log('\n--- ESCENARIO 5: Reactivar el Segundo Combo ---');
  const toggleSecondOn = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/combos/2e39c4a5-0611-4a03-b10c-08ef7e270684/toggle-status',
    method: 'PATCH',
    headers: authHeaders
  }, {});

  assert(toggleSecondOn.status === 200, 'Reactivar segundo combo exitoso');
  assert(toggleSecondOn.body?.combos_assigned_today === 4544, 'combos_assigned_today vuelve a 4544');

  // Escenario 6: Creación de Combo Activo Nuevo
  console.log('\n--- ESCENARIO 6: Creación de Nuevo Beneficio en Catálogo ---');
  const newComboRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/admin/combos',
    method: 'POST',
    headers: authHeaders
  }, {
    name: 'Combo Especial Test Automatizado',
    category: 'combo_navideno',
    description: 'Pan de Jamón, Hallacas, Turrón',
    items_detail: 'Pan de Jamón, Hallacas, Turrón',
    dietary_info: 'Almacén Seco',
    mesa_name: 'Mesa Especial',
    weight_kg: 8.5,
    is_active: 1
  });

  assert(newComboRes.status === 201, 'POST /api/v1/admin/combos crea combo activo');
  const testComboId = newComboRes.body?.combo?.id;
  assert(newComboRes.body?.combos_assigned_today === 5680, 'Con 5 combos activos el total sube a 5680');

  // Escenario 7: Edición de Combo para Inactivarlo
  console.log('\n--- ESCENARIO 7: Edición de Beneficio (Cambiar a Inactivo vía PUT) ---');
  const updateComboRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/admin/combos/${testComboId}`,
    method: 'PUT',
    headers: authHeaders
  }, {
    name: 'Combo Especial Test Automatizado',
    category: 'combo_navideno',
    description: 'Pan de Jamón, Hallacas, Turrón',
    items_detail: 'Pan de Jamón, Hallacas, Turrón',
    dietary_info: 'Almacén Seco',
    mesa_name: 'Mesa Especial',
    weight_kg: 8.5,
    is_active: 0
  });

  assert(updateComboRes.status === 200, 'PUT /api/v1/admin/combos/:id actualiza combo');
  assert(updateComboRes.body?.combos_assigned_today === 4544, 'Al inactivar vía PUT vuelve a 4544');

  // Escenario 8: Eliminación de Combo
  console.log('\n--- ESCENARIO 8: Eliminación de Beneficio de Prueba ---');
  const deleteComboRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/v1/admin/combos/${testComboId}`,
    method: 'DELETE',
    headers: authHeaders
  });

  assert(deleteComboRes.status === 200, 'DELETE /api/v1/admin/combos/:id elimina beneficio');
  assert(deleteComboRes.body?.combos_assigned_today === 4544, 'Total se mantiene en 4544 tras borrado');

  // Escenario 9: Verificación de Daily Pack Criptográfico Offline
  console.log('\n--- ESCENARIO 9: Daily Pack Offline Criptográfico ---');
  const packRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/sync/daily-pack',
    method: 'GET',
    headers: authHeaders
  });

  assert(packRes.status === 200, 'GET /api/v1/sync/daily-pack generado exitosamente');
  const workersInPack = packRes.body?.pack?.workers || [];
  const sampleWorker = workersInPack[0];
  const sampleCombos = sampleWorker ? sampleWorker.entitlements : [];
  const hasInactiveComboInPack = sampleCombos.some(e => e.combo_id === '0f74d741-6310-4d6c-b8e5-8cd6e76f9113');
  assert(
    !hasInactiveComboInPack,
    'El Daily Pack offline excluye asignaciones de combos inactivos',
    `Combos asignados al trabajador de muestra: ${sampleCombos.length}`
  );

  // Escenario 10: Búsqueda de Trabajador en Despacho Manual
  console.log('\n--- ESCENARIO 10: Búsqueda de Trabajador y Entitlements Activos ---');
  const searchRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/manual-dispatch/search/V-18456123',
    method: 'GET',
    headers: authHeaders
  });

  assert(searchRes.status === 200 && searchRes.body?.found, 'Búsqueda de trabajador V-18456123 encontrada');
  const entitlementsFound = searchRes.body?.entitlements || [];
  const hasInactiveInSearch = entitlementsFound.some(e => e.combo_id === '0f74d741-6310-4d6c-b8e5-8cd6e76f9113' && e.status === 'pending');
  assert(
    !hasInactiveInSearch,
    'Entitlements en despacho manual no incluyen combos inactivos pendientes',
    `Total beneficios visibles: ${entitlementsFound.length}`
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DE LA SUITE: ${passed} PASADAS / ${failed} FALLIDAS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllScenarios().catch(err => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
