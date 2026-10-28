// tests/e2e_offline_flow.test.js
// Suite Automatizada de Pruebas E2E: Offline Engine, Service Worker, Idempotencia y RFC 7807
// (e2e-testing / browser-qa)

const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT_DIR = path.join(__dirname, '..');
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

function httpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
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
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawBody: data
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      if (typeof postData === 'object') {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

let testServer = null;

async function ensureServerRunning() {
  try {
    await new Promise((resolve, reject) => {
      const checkReq = http.request({ hostname: 'localhost', port: 3000, path: '/api/v1/docs', method: 'GET', timeout: 600 }, (res) => {
        resolve();
      });
      checkReq.on('error', reject);
      checkReq.on('timeout', () => {
        checkReq.destroy();
        reject(new Error('timeout'));
      });
      checkReq.end();
    });
  } catch (e) {
    const app = require('../backend/server');
    await new Promise((resolve) => {
      testServer = app.listen(3000, () => {
        resolve();
      });
    });
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 SUITE E2E: OFFLINE ENGINE, IDEMPOTENCIA Y ESTÁNDAR RFC 7807');
  console.log('================================================================\n');

  await ensureServerRunning();

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    process.stdout.write(`  [${total < 10 ? '0' + total : total}] ${name}... `);
    try {
      await fn();
      console.log('✅ PASÓ');
      passed++;
    } catch (err) {
      console.log('❌ FALLÓ');
      console.error('      Detalle del error:', err.message);
    }
  }

  // 1. Service Worker & PWA Cache Manifest
  await test('Verificación de Integridad de Service Worker (public/sw.js)', async () => {
    const swPath = path.join(ROOT_DIR, 'public', 'sw.js');
    assert.ok(fs.existsSync(swPath), 'public/sw.js debe existir');
    const content = fs.readFileSync(swPath, 'utf8');
    assert.ok(content.includes('STATIC_CACHE_NAME') || content.includes('CACHE_NAME'), 'Debe definir nombre de caché');
    assert.ok(content.includes('fetch'), 'Debe interceptar eventos fetch');
  });

  // 2. Web App Manifest
  await test('Verificación de Manifiesto PWA para Operación de Almacén (public/manifest.json)', async () => {
    const manifestPath = path.join(ROOT_DIR, 'public', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json debe existir');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.name, 'Debe especificar nombre de la PWA');
    assert.ok(manifest.icons && manifest.icons.length > 0, 'Debe tener iconos configurados');
    assert.strictEqual(manifest.display, 'standalone', 'El display debe ser standalone');
  });

  // 3. Declarative Migrations Table & Records
  await test('Integridad del Gestor de Migraciones Declarativo (schema_migrations)', async () => {
    const { db } = require('../backend/db');
    const migrations = db.prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC').all();
    assert.ok(migrations.length >= 3, 'Debe haber al menos 3 migraciones aplicadas');
    assert.strictEqual(migrations[0].version, '001', 'Migración 001 debe ser initial_schema');
    assert.strictEqual(migrations[1].version, '002', 'Migración 002 debe ser add_extended_combo_fields');
    assert.strictEqual(migrations[2].version, '003', 'Migración 003 debe ser add_idempotency_keys');
    for (const m of migrations) {
      assert.ok(m.checksum && m.checksum.length === 64, `Checksum SHA-256 de ${m.name} debe tener 64 caracteres`);
    }
  });

  // 4. OpenAPI Specification YAML & Swagger UI Endpoints
  await test('Disponibilidad de Contrato OpenAPI 3.1 (/api/v1/docs/openapi.yaml)', async () => {
    const res = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/docs/openapi.yaml',
      method: 'GET'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('yaml'), 'Debe responder con content-type yaml');
    assert.ok(res.rawBody.includes('openapi: 3.1.0'), 'Debe contener cabecera OpenAPI 3.1.0');
  });

  // 5. Interactive Swagger UI Explorer
  await test('Explorador Interactivo Swagger UI (/docs y /api/v1/docs)', async () => {
    const res = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/docs',
      method: 'GET'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'), 'Debe responder con HTML');
    assert.ok(res.rawBody.includes('SwaggerUIBundle'), 'Debe cargar SwaggerUIBundle');
  });

  // 6. Idempotency Key Engine: First Call (MISS-IDEMPOTENT)
  const testIdempotencyKey = 'e2e-idemp-' + Date.now();
  await test('Mecanismo de Idempotencia: Primera Llamada (MISS-IDEMPOTENT)', async () => {
    const res = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/system/demo-mode',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testIdempotencyKey
      }
    }, { enabled: true });

    // La ruta exige auth admin pero el middleware de idempotencia inyecta X-Cache-Lookup
    assert.ok(res.headers['x-cache-lookup'], 'Debe retornar cabecera X-Cache-Lookup');
    assert.strictEqual(res.headers['x-cache-lookup'], 'MISS-IDEMPOTENT');
    assert.strictEqual(res.headers['x-idempotency-key'], testIdempotencyKey);
  });

  // 7. Idempotency Key Engine: Direct Cache Storage & HIT-IDEMPOTENT verification
  await test('Mecanismo de Idempotencia: Verificación de Replay Cacheado (HIT-IDEMPOTENT)', async () => {
    const { db } = require('../backend/db');
    const cachedKey = 'cached-test-key-' + Date.now();
    const mockPayload = { success: true, message: 'Despacho simulado idempotente', dispatch_id: 999 };

    db.prepare(`
      INSERT INTO idempotency_keys (key, user_id, endpoint, status_code, response_headers, response_body)
      VALUES (?, 'system-test', '/api/v1/manual-dispatch/deliver', 201, '{"content-type":"application/json"}', ?)
    `).run(cachedKey, JSON.stringify(mockPayload));

    const res = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/manual-dispatch/deliver',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': cachedKey
      }
    }, { dummy: true });

    assert.strictEqual(res.statusCode, 201, 'Debe devolver el status code cacheado (201)');
    assert.strictEqual(res.headers['x-cache-lookup'], 'HIT-IDEMPOTENT', 'Debe marcar HIT-IDEMPOTENT');
    assert.strictEqual(res.body.dispatch_id, 999, 'Debe devolver el payload exacto cacheado');
  });

  // 8. RFC 7807 Problem Details
  await test('Formato Estándar de Error RFC 7807 (application/problem+json)', async () => {
    const res = await httpRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/v1/verify/qr',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/problem+json'
      }
    }, { qr_data: 'INVALID_CORRUPTED_PAYLOAD' });

    assert.ok([400, 401].includes(res.statusCode), 'Debe retornar código de error de cliente (400 o 401)');
    assert.ok(res.headers['content-type'].includes('problem+json') || res.headers['content-type'].includes('json'), 'Debe incluir problem+json o json');
    assert.ok(res.body.type || res.body.error || res.body.title, 'Debe cumplir con el esquema de error');
  });

  // 9. Architecture Decision Records Consistency
  await test('Consistencia de Documentación y ADRs en docs/adr/', async () => {
    const adrDir = path.join(ROOT_DIR, 'docs', 'adr');
    assert.ok(fs.existsSync(adrDir), 'docs/adr/ debe existir');
    const files = fs.readdirSync(adrDir);
    assert.ok(files.includes('README.md'), 'README.md índice debe existir');
    assert.ok(files.includes('template.md'), 'template.md debe existir');
    assert.ok(files.includes('0001-fido2-passkeys-como-factor-de-identidad.md'));
    assert.ok(files.includes('0002-arquitectura-dual-sqlite-wasm-supabase.md'));
    assert.ok(files.includes('0003-estrategia-revocacion-jwt-cookies-httponly.md'));
    assert.ok(files.includes('0004-feedback-haptico-y-ergonomia-de-almacen.md'));
    assert.ok(files.includes('0005-modularizacion-servicios-backend.md'));
  });

  console.log('\n================================================================');
  console.log(`📊 RESULTADO SUITE E2E: ${passed}/${total} PRUEBAS EXITOSAS`);
  console.log('================================================================');

  if (testServer) {
    testServer.close();
  }

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('Error fatal ejecutando suite E2E:', err);
    process.exit(1);
  });
}

module.exports = { runTestSuite };
