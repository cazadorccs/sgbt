// tests/user_password_management.test.js
// ============================================================================
// SUITE DE VERIFICACIÓN: GESTIÓN DE CONTRASEÑAS Y AUTOSERVICIO DE RECUPERACIÓN
// ============================================================================

const assert = require('assert');
const http = require('http');

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

async function runPasswordManagementSuite() {
  console.log('\n================================================================');
  console.log('🔑 SUITE DE GESTIÓN DE USUARIOS Y RECUPERACIÓN DE CONTRASEÑAS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  let server = null;

  try {
    await httpRequest('GET', '/api/v1/health');
  } catch (e) {
    const app = require('../backend/server');
    await new Promise((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  }

  try {
    // 1. Obtener token administrativo legítimo
    console.log('1. Autenticando como Administrador (13537582) con PIN...');
    const adminLogin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582',
      admin_secret: '0578',
      require_admin: true
    });
    assert.strictEqual(adminLogin.status, 200);
    assert(adminLogin.data.success);
    const adminToken = adminLogin.data.session_token;
    assert(adminToken, 'Debe emitir token administrativo');
    console.log('   ✅ [OK] Administrador autenticado correctamente.');
    passed++;

    // 2. Administrador asigna contraseña directa a un trabajador (V-11123987)
    console.log('2. Administrador asigna nueva contraseña manual a funcionario (V-11123987)...');
    // Primero obtener ID del trabajador
    const workersRes = await httpRequest('GET', '/api/v1/admin/workers?search=11123987', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(workersRes.status, 200);
    const targetWorker = workersRes.data.workers[0];
    assert(targetWorker, 'Debe encontrar al trabajador');

    const setPwdRes = await httpRequest('POST', `/api/v1/admin/workers/${targetWorker.id}/password`, {
      action: 'set_password',
      new_password: 'ClaveSegura2026*',
      clear_device_lock: true
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(setPwdRes.status, 200);
    assert.strictEqual(setPwdRes.data.success, true);
    assert.strictEqual(setPwdRes.data.enrollment_status, 'registrado');
    console.log('   ✅ [OK] Contraseña asignada por el Administrador exitosamente.');
    passed++;

    // 3. Funcionario inicia sesión con la nueva contraseña asignada por el Administrador
    console.log('3. Funcionario inicia sesión con su nueva contraseña asignada...');
    const workerLogin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-11123987',
      password: 'ClaveSegura2026*'
    });
    assert.strictEqual(workerLogin.status, 200);
    assert.strictEqual(workerLogin.data.success, true);
    assert(workerLogin.data.session_token, 'Debe emitir session_token para el funcionario');
    console.log('   ✅ [OK] Funcionario ingresó exitosamente con la nueva clave.');
    passed++;

    // 4. Autoservicio de Recuperación: Solicitud con datos erróneos rechazada
    console.log('4. Verificando rechazo de recuperación ante datos de contacto incorrectos...');
    const failRecovery = await httpRequest('POST', '/api/v1/auth/password-recovery/request', {
      document_id: 'V-11123987',
      email_or_phone: 'correo_falso_no_registrado@gmail.com'
    });
    assert.strictEqual(failRecovery.status, 400);
    assert.strictEqual(failRecovery.data.success, undefined);
    console.log('   ✅ [OK] Recuperación no autorizada ante correo/teléfono incorrecto.');
    passed++;

    // 5. Autoservicio de Recuperación: Solicitud exitosa con correo registrado
    console.log('5. Solicitando recuperación legítima con datos oficiales de nómina...');
    const validRecovery = await httpRequest('POST', '/api/v1/auth/password-recovery/request', {
      document_id: 'V-11123987',
      email_or_phone: targetWorker.email
    });
    assert.strictEqual(validRecovery.status, 200);
    assert.strictEqual(validRecovery.data.success, true);
    assert(validRecovery.data.recovery_token, 'Debe emitir recovery_token temporal');
    const recoveryToken = validRecovery.data.recovery_token;
    console.log('   ✅ [OK] Identidad verificada y token criptográfico de recuperación emitido.');
    passed++;

    // 6. Confirmación de nueva contraseña mediante autoservicio
    console.log('6. Confirmando nueva contraseña mediante token de recuperación...');
    const confirmRecovery = await httpRequest('POST', '/api/v1/auth/password-recovery/confirm', {
      recovery_token: recoveryToken,
      new_password: 'NuevaClaveRecuperada2026!'
    });
    assert.strictEqual(confirmRecovery.status, 200);
    assert.strictEqual(confirmRecovery.data.success, true);
    console.log('   ✅ [OK] Contraseña restablecida exitosamente por el propio usuario.');
    passed++;

    // 7. Funcionario inicia sesión con la contraseña recuperada por él mismo
    console.log('7. Verificando inicio de sesión con la clave recuperada...');
    const postRecoveryLogin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-11123987',
      password: 'NuevaClaveRecuperada2026!'
    });
    assert.strictEqual(postRecoveryLogin.status, 200);
    assert.strictEqual(postRecoveryLogin.data.success, true);
    console.log('   ✅ [OK] Funcionario operando normalmente con su clave recuperada.');
    passed++;

    // 8. Administrador restablece usuario a estatus 'precargado'
    console.log('8. Administrador restablece usuario a estatus PRECARGADO (Auto-Registro)...');
    const resetRes = await httpRequest('POST', `/api/v1/admin/workers/${targetWorker.id}/password`, {
      action: 'reset_enrollment',
      clear_device_lock: true
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(resetRes.status, 200);
    assert.strictEqual(resetRes.data.enrollment_status, 'precargado');
    assert(resetRes.data.onboarding_token, 'Debe generar onboarding_token para auto-registro');
    console.log('   ✅ [OK] Usuario restablecido a precargado correctamente.');
    passed++;

    console.log('\n================================================================');
    console.log(`🎉 TODAS LAS PRUEBAS DE GESTIÓN Y RECUPERACIÓN (${passed}/${passed}) PASARON AL 100%`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ ERROR EN SUITE DE GESTIÓN DE CONTRASEÑAS:', err);
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
  runPasswordManagementSuite();
}

module.exports = { runPasswordManagementSuite };
