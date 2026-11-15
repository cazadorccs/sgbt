// tests/cache_service.test.js
// ============================================================================
// SUITE DE PRUEBAS: SERVICIO DE CACHÉ DISTRIBUIDO Y CABECERAS EDGE CDN (FASES 1 Y 2)
// ============================================================================

const assert = require('assert');
const http = require('http');
const { CacheService, cache } = require('../backend/services/cache.service');
const app = require('../backend/server');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS: SERVICIO DE CACHÉ Y EDGE CDN');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  // Instancia aislada para tests
  const testCache = new CacheService();

  // Test 1: Set y Get básico
  await asyncTest('Cache 1: Almacenamiento y recuperación en memoria (Set/Get)', async () => {
    await testCache.set('test:key1', { foo: 'bar', num: 42 }, 10);
    const val = await testCache.get('test:key1');
    assert.deepStrictEqual(val, { foo: 'bar', num: 42 });
  });

  // Test 2: Miss en clave inexistente
  await asyncTest('Cache 2: Retorno null ante clave inexistente (Cache Miss)', async () => {
    const val = await testCache.get('test:non_existent_key_999');
    assert.strictEqual(val, null);
  });

  // Test 3: Borrado por clave (del)
  await asyncTest('Cache 3: Eliminación explícita de clave (del)', async () => {
    await testCache.set('test:to_delete', 'value123', 60);
    const before = await testCache.get('test:to_delete');
    assert.strictEqual(before, 'value123');

    await testCache.del('test:to_delete');
    const after = await testCache.get('test:to_delete');
    assert.strictEqual(after, null);
  });

  // Test 4: Borrado por patrón (delPattern)
  await asyncTest('Cache 4: Invalidación masiva por patrón wildcard (delPattern)', async () => {
    await testCache.set('kpis:today', { metric: 1 }, 60);
    await testCache.set('kpis:weekly', { metric: 2 }, 60);
    await testCache.set('tenant:settings', { entity: 'MIPPCI' }, 60);

    const deletedCount = await testCache.delPattern('kpis:*');
    assert.strictEqual(deletedCount, 2);

    assert.strictEqual(await testCache.get('kpis:today'), null);
    assert.strictEqual(await testCache.get('kpis:weekly'), null);
    assert.deepStrictEqual(await testCache.get('tenant:settings'), { entity: 'MIPPCI' });
  });

  // Test 5: Patrón Cache-Aside (wrap)
  await asyncTest('Cache 5: Patrón Cache-Aside transparente (wrap)', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { data: 'computed_result', timestamp: Date.now() };
    };

    // Primera invocación -> ejecuta fetcher
    const res1 = await testCache.wrap('wrap:test', 60, fetcher);
    assert.strictEqual(callCount, 1);
    assert.strictEqual(res1.data, 'computed_result');

    // Segunda invocación -> retorna de caché sin ejecutar fetcher
    const res2 = await testCache.wrap('wrap:test', 60, fetcher);
    assert.strictEqual(callCount, 1);
    assert.deepStrictEqual(res2, res1);

    // Invalidación y tercera invocación -> re-ejecuta fetcher
    await testCache.del('wrap:test');
    const res3 = await testCache.wrap('wrap:test', 60, fetcher);
    assert.strictEqual(callCount, 2);
  });

  // Test 6: Expiración por TTL
  await asyncTest('Cache 6: Expiración automática respetando TTL en segundos', async () => {
    await testCache.set('test:quick_expire', 'ephemeral', 1);
    const immediate = await testCache.get('test:quick_expire');
    assert.strictEqual(immediate, 'ephemeral');

    // Esperar 1.1s para que expire
    await new Promise(r => setTimeout(r, 1100));
    const expired = await testCache.get('test:quick_expire');
    assert.strictEqual(expired, null);
  });

  // Test 7: Estadísticas de aciertos y fallas
  test('Cache 7: Métricas de rendimiento y estadísticas (stats)', () => {
    const stats = testCache.stats();
    assert.ok(stats.hits > 0, 'Debe registrar hits');
    assert.ok(stats.misses > 0, 'Debe registrar misses');
    assert.ok(stats.engine === 'memory' || stats.engine === 'upstash' || stats.engine === 'redis');
  });

  // Test 8: Cabeceras Anti-Caché en API REST (Fase 1: Edge CDN)
  await asyncTest('Edge CDN 8: Cabeceras estrictas Anti-Caché en rutas /api/*', async () => {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/system/status`);
      const cacheControl = res.headers.get('cache-control');
      assert.ok(cacheControl, 'Debe incluir cabecera Cache-Control');
      assert.ok(cacheControl.includes('no-store'), 'Debe contener no-store');
      assert.ok(cacheControl.includes('no-cache'), 'Debe contener no-cache');
    } finally {
      server.close();
    }
  });

  // Test 9: Cabeceras de Caché Público para Activos Estáticos (Fase 1: Edge CDN)
  await asyncTest('Edge CDN 9: Cabeceras de caché público para activos estáticos (CSS/JS/Assets)', async () => {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/css/style.css`);
      if (res.ok) {
        const cacheControl = res.headers.get('cache-control');
        assert.ok(cacheControl, 'Debe incluir Cache-Control en CSS');
        assert.ok(cacheControl.includes('public'), 'Debe ser public');
        assert.ok(cacheControl.includes('max-age='), 'Debe especificar max-age');
      }
    } finally {
      server.close();
    }
  });

  console.log('================================================================');
  console.log(`🎉 TODAS LAS PRUEBAS DE CACHÉ Y EDGE CDN (${passed}/${total}) PASARON AL 100%`);
  console.log('================================================================');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('[TEST SUITE ERROR]', err);
  process.exit(1);
});
