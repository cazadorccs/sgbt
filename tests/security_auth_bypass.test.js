// tests/security_auth_bypass.test.js
// ============================================================================
// SUITE DE AUDITORÍA Y BLINDAJE DE SEGURIDAD (TRAIL OF BITS: AUTH BYPASS & RBAC)
// Verificación de blindaje contra evasión de autenticación administrativa
// ============================================================================

const assert = require('assert');
const http = require('http');

let serverProcess;
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
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

async function runSecurityAuditSuite() {
  console.log('\n================================================================');
  console.log('🛡️ SUITE DE VERIFICACIÓN DEVSECOPS (TRAIL OF BITS: AUTHENTICATION BYPASS)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Iniciar servidor si no está activo
  let server = null;
  try {
    await httpRequest('GET', '/api/v1/health');
  } catch (e) {
    const app = require('../backend/server');
    await new Promise((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  }

  // Asegurar estado determinista de cuentas de prueba para TOB-01 y TOB-09
  try {
    const { db } = require('../backend/db');
    const { hashPassword } = require('../backend/crypto-utils');
    const { supabase, isSupabaseConfigured } = require('../backend/supabase');
    const defaultHash = hashPassword('1178');
    db.prepare(`
      UPDATE workers 
      SET password_hash = ?, admin_pin_hash = '', enrollment_status = 'registrado' 
      WHERE document_id = '13537582'
    `).run(defaultHash);
    
    db.prepare(`
      UPDATE workers 
      SET password_hash = NULL, enrollment_status = 'precargado' 
      WHERE document_id = 'V-11123987'
    `).run();

    if (isSupabaseConfigured && isSupabaseConfigured() && supabase) {
      const w13 = db.prepare('SELECT id FROM workers WHERE document_id = ?').get('13537582');
      if (w13) {
        await supabase.from('passkey_credentials')
          .update({ public_key: defaultHash })
          .eq('worker_id', w13.id)
          .like('credential_id', 'formalized_pwd_%');

        await supabase.from('passkey_credentials')
          .delete()
          .eq('worker_id', w13.id)
          .like('credential_id', 'admin_pin_%');
      }
    }
  } catch (seedErr) {
    console.warn('   ⚠️ [SETUP WARN] No se pudo reiniciar hashes de prueba:', seedErr.message);
  }

  try {
    // ------------------------------------------------------------------------
    // PRUEBA TOB-01: Intentar login administrativo con solo ingresar la cédula
    // ------------------------------------------------------------------------
    console.log('1. Verificando que una cédula de administrador (V-11123987) NO pueda ingresar sin credenciales...');
    const resNoCreds = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-11123987'
    });

    // No debe retornar éxito con sesión abierta
    assert.strictEqual(resNoCreds.status, 200);
    assert.strictEqual(resNoCreds.data.success, false, 'El login no debe ser exitoso sin credenciales');
    assert.strictEqual(resNoCreds.data.requires_enrollment, true, 'Debe exigir formalización/asignación de clave');
    assert(!resNoCreds.data.session_token, 'No debe emitir session_token');
    console.log('   ✅ [OK] Cédula administrativa rechazada de plano para acceso directo sin contraseña.');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-02: Cédula de Super Admin (13537582) sin contraseña
    // ------------------------------------------------------------------------
    console.log('2. Verificando que Super Administrador (13537582) deba ingresar contraseña...');
    const resAdminNoPwd = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582'
    });
    assert.strictEqual(resAdminNoPwd.status, 200);
    assert.strictEqual(resAdminNoPwd.data.success, false);
    assert.strictEqual(resAdminNoPwd.data.requires_password, true, 'Debe solicitar contraseña al usuario registrado');
    assert(!resAdminNoPwd.data.session_token, 'No debe emitir session_token sin contraseña');
    console.log('   ✅ [OK] Super Administrador exige contraseña obligatoria.');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-03: Separación estricta de alcance (Scope)
    // Beneficiario autenticado como tal NO puede llamar a endpoints de /admin/*
    // ------------------------------------------------------------------------
    console.log('3. Verificando aislamiento de alcance: Sesión de beneficiario no puede acceder a /api/v1/admin/*...');
    
    // Iniciar sesión como beneficiario regular (Carlos Eduardo Mendoza V-18456123)
    const resWorker = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-18456123',
      login_mode: 'beneficiary'
    });
    assert.strictEqual(resWorker.status, 200);
    const workerToken = resWorker.data.session_token;
    assert(workerToken, 'Debe emitir token para trabajador regular');

    // Intentar acceder al Directorio de Nómina Administrativo
    const resAdminLeak = await httpRequest('GET', '/api/v1/admin/workers', null, {
      'Authorization': `Bearer ${workerToken}`
    });
    assert.strictEqual(resAdminLeak.status, 403, 'Debe responder 403 Forbidden para token sin elevación');
    assert.strictEqual(resAdminLeak.data.code, 'ADMIN_SCOPE_REQUIRED', 'Debe indicar código de alcance requerido');
    console.log('   ✅ [OK] Token de beneficiario bloqueado estrictamente ante rutas /api/v1/admin/* (403 Forbidden).');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-04: Acceso administrativo formal en /coseg con PIN correcto
    // ------------------------------------------------------------------------
    console.log('4. Verificando acceso administrativo formal en /coseg con PIN institucional válido...');
    const resAdminValid = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-99995001',
      admin_secret: '0578',
      require_admin: true
    });
    assert.strictEqual(resAdminValid.status, 200);
    assert.strictEqual(resAdminValid.data.success, true);
    assert.strictEqual(resAdminValid.data.user.role, 'admin');
    assert.strictEqual(resAdminValid.data.session_scope, 'admin');
    const adminToken = resAdminValid.data.session_token;

    // Verificar que el token administrativo sí tiene acceso a /api/v1/admin/workers
    const resAdminAccess = await httpRequest('GET', '/api/v1/admin/workers', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(resAdminAccess.status, 200, 'Token administrativo legítimo debe acceder');
    assert(Array.isArray(resAdminAccess.data.workers), 'Debe retornar la lista de trabajadores');
    console.log(`   ✅ [OK] Consola administrativa autorizada exitosamente (${resAdminAccess.data.workers.length} registros).`);
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-05: Intento de acceso administrativo con PIN incorrecto
    // ------------------------------------------------------------------------
    console.log('5. Verificando rechazo ante PIN administrativo inválido...');
    const resBadPin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-99995001',
      admin_secret: 'PIN_FALSO_9999',
      require_admin: true
    });
    assert.strictEqual(resBadPin.status, 401, 'Debe rechazar con 401 Unauthorized');
    console.log('   ✅ [OK] PIN incorrecto rechazado con 401 Unauthorized.');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-06: Beneficiario regular intentando forzar require_admin
    // ------------------------------------------------------------------------
    console.log('6. Verificando que un trabajador regular no pueda usar require_admin aunque conozca el PIN...');
    const resWorkerSpoof = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-18456123',
      admin_secret: '0578',
      require_admin: true
    });
    assert.strictEqual(resWorkerSpoof.status, 403, 'Debe rechazar con 403 Forbidden a usuarios sin rol de administración');
    console.log('   ✅ [OK] Intentos de elevación ilegítima por parte de usuarios comunes rechazados con 403.');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-07: Separación Estricta: Super Admin intentando entrar a /coseg con su clave de beneficiario
    // ------------------------------------------------------------------------
    console.log('7. Verificando que Super Administrador (13537582) NO pueda acceder a /coseg usando su clave de beneficiario (1178)...');
    const resAdminWithBeneficiaryPwd = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582',
      admin_secret: '1178',
      require_admin: true
    });
    assert.strictEqual(resAdminWithBeneficiaryPwd.status, 401, 'Debe rechazar con 401 Unauthorized');
    assert.strictEqual(resAdminWithBeneficiaryPwd.data.error, 'Clave o PIN de seguridad administrativa incorrecto. No se permite acceder a la consola administrativa con contraseña de beneficiario.');
    console.log('   ✅ [OK] Acceso administrativo denegado al usar clave de beneficiario en consola administrativa.');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-08: Separación Estricta: Super Admin intentando entrar a portal de beneficiario usando PIN administrativo
    // ------------------------------------------------------------------------
    console.log('8. Verificando que el PIN administrativo (0578) NO sirva como contraseña de beneficiario...');
    const resBeneficiaryWithAdminPin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582',
      password: '0578',
      require_admin: false,
      login_mode: 'beneficiary'
    });
    assert.strictEqual(resBeneficiaryWithAdminPin.status, 401, 'Debe rechazar con 401 Unauthorized');
    assert.strictEqual(resBeneficiaryWithAdminPin.data.error, 'Contraseña de beneficiario incorrecta. Verifique sus datos o contacte a RRHH.');
    console.log('   ✅ [OK] PIN administrativo rechazado en portal de beneficiarios.');
    passed++;

    // ------------------------------------------------------------------------
    // PRUEBA TOB-09: Aislamiento Criptográfico de Sesión de Beneficiario para Super Admin
    // ------------------------------------------------------------------------
    console.log('9. Verificando que login de beneficiario con clave legítima (1178) obtenga scope "beneficiary" y no pueda acceder a /admin/*...');
    try {
      const { db } = require('../backend/db');
      const { hashPassword } = require('../backend/crypto-utils');
      const testHash = hashPassword('1178');
      db.prepare("UPDATE workers SET password_hash = ?, enrollment_status = 'registrado' WHERE document_id = '13537582'").run(testHash);
    } catch (e) {}

    const resAdminAsBeneficiary = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582',
      password: '1178',
      require_admin: false,
      login_mode: 'beneficiary'
    });
    assert.strictEqual(resAdminAsBeneficiary.status, 200, 'Debe iniciar sesión de beneficiario con éxito');
    assert.strictEqual(resAdminAsBeneficiary.data.session_scope, 'beneficiary', 'El alcance de la sesión debe ser strictly beneficiary');
    const adminBeneficiaryToken = resAdminAsBeneficiary.data.session_token;

    // Intentar acceder a ruta administrativa con ese token
    const resAdminCallBlocked = await httpRequest('GET', '/api/v1/admin/workers', null, {
      'Authorization': `Bearer ${adminBeneficiaryToken}`
    });
    assert.strictEqual(resAdminCallBlocked.status, 403, 'Sesión de beneficiario de un administrador debe recibir 403 en /admin/*');
    assert.strictEqual(resAdminCallBlocked.data.code, 'ADMIN_SCOPE_REQUIRED');
    console.log('   ✅ [OK] Sesión de beneficiario no posee acceso administrativo a pesar del rol del usuario.');
    passed++;

    console.log('\n================================================================');
    console.log(`🎉 TODAS LAS PRUEBAS DE BLINDAJE DE SEGURIDAD (${passed}/${passed}) PASARON AL 100%`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ ERROR EN SUITE DE AUDITORÍA DE SEGURIDAD:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    if (require.main === module) {
      process.exit(failed > 0 ? 1 : 0);
    }
  }
}

if (require.main === module) {
  runSecurityAuditSuite();
}

module.exports = { runSecurityAuditSuite };
