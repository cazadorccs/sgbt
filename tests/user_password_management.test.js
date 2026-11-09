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
    console.log('1. Autenticando como Administrador con PIN...');
    let adminLogin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582',
      admin_secret: '0578',
      require_admin: true
    });
    if (adminLogin.status !== 200) {
      // 13537582 posee PIN personalizado por el usuario; autenticar con admin institucional V-99995001
      adminLogin = await httpRequest('POST', '/api/v1/auth/login', {
        document_id: 'V-99995001',
        admin_secret: '0578',
        require_admin: true
      });
    }
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

    // 9. Administrador gestiona y actualiza su PIN Administrativo de Gobernanza (/coseg)
    console.log('9. Administrador gestiona y actualiza su PIN Administrativo de Gobernanza (/coseg)...');
    const adminWorkerRes = await httpRequest('GET', '/api/v1/admin/workers?search=99995001', null, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(adminWorkerRes.status, 200);
    const adminWorker = adminWorkerRes.data.workers[0];
    assert(adminWorker, 'Debe encontrar al administrador institucional');

    // Asignar nuevo PIN administrativo personalizado
    const setAdminPinRes = await httpRequest('POST', `/api/v1/admin/workers/${adminWorker.id}/password`, {
      action: 'set_admin_pin',
      new_password: 'PIN-CUSTOM-2026'
    }, {
      'Authorization': `Bearer ${adminToken}`
    });
    assert.strictEqual(setAdminPinRes.status, 200);
    assert.strictEqual(setAdminPinRes.data.success, true);
    assert.strictEqual(setAdminPinRes.data.is_admin_pin, true);

    // Iniciar sesión en /coseg con el nuevo PIN
    const newPinLogin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-99995001',
      admin_secret: 'PIN-CUSTOM-2026',
      require_admin: true
    });
    assert.strictEqual(newPinLogin.status, 200, 'Debe iniciar sesión administrativa con el nuevo PIN');
    assert.strictEqual(newPinLogin.data.success, true);

    // Verificación de Vulnerabilidad Resuelta: El PIN institucional por defecto (0578) DEBE ser revocado
    const oldPinLogin = await httpRequest('POST', '/api/v1/auth/login', {
      document_id: 'V-99995001',
      admin_secret: '0578',
      require_admin: true
    });
    assert.strictEqual(oldPinLogin.status, 401, 'El PIN anterior por defecto (0578) DEBE ser rechazado al existir PIN personalizado');
    assert.strictEqual(oldPinLogin.data.success, undefined);

    // Restaurar PIN por defecto en SQLite y Supabase para mantener idempotencia
    const { db } = require('../backend/db');
    const { supabase, isSupabaseConfigured } = require('../backend/supabase');
    db.prepare("UPDATE workers SET admin_pin_hash = '' WHERE id = ?").run(adminWorker.id);
    if (isSupabaseConfigured && isSupabaseConfigured() && supabase) {
      await supabase.from('passkey_credentials')
        .delete()
        .eq('worker_id', adminWorker.id)
        .like('credential_id', 'admin_pin_%');
    }
    console.log('   ✅ [OK] Gestión dual de PIN administrativo y revocación estricta de PIN por defecto validada exitosamente.');
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

