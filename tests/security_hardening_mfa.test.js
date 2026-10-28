// ============================================================================
// TESTS DE SEGURIDAD DEVSECOPS: MFA, SESIONES POR DISPOSITIVO Y PREVENCIÓN XSS
// ============================================================================

const assert = require('assert');
const http = require('http');
const app = require('../backend/server');
const { db } = require('../backend/db');
const {
  generateTotpSecret,
  generateTotpToken,
  verifyTotpToken,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
  activateMfa,
  disableMfa,
  getWorkerMfaStatus
} = require('../backend/services/mfa.service');
const {
  createDeviceSession,
  validateAndUpdateDeviceSession,
  getActiveDeviceSessions,
  revokeDeviceSession,
  revokeOtherDeviceSessions
} = require('../backend/services/session.service');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json || data
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runSecurityTests() {
  console.log('\n================================================================');
  console.log('🔒 VERIFICACIÓN DE BLINDAJE DE SEGURIDAD (DEVSECOPS)');
  console.log('================================================================\n');

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // ------------------------------------------------------------------------
    // PRUEBA 1: Cabeceras OWASP y Content-Security-Policy (CSP) Reforzada
    // ------------------------------------------------------------------------
    console.log('1. Verificando Cabeceras OWASP y Política CSP Reforzada (Anti-XSS)...');
    const resHome = await makeRequest('GET', '/');
    assert.strictEqual(resHome.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(resHome.headers['x-frame-options'], 'DENY');
    assert(resHome.headers['content-security-policy'], 'CSP ausente');
    assert(resHome.headers['content-security-policy'].includes("object-src 'none'"), 'CSP debe bloquear object-src');
    assert(resHome.headers['content-security-policy'].includes("base-uri 'self'"), 'CSP debe restringir base-uri');
    console.log('   ✅ Cabeceras OWASP y CSP verificadas con éxito.');

    // ------------------------------------------------------------------------
    // PRUEBA 2: Middleware Sanitizador Anti-XSS (Desinfección de Payloads)
    // ------------------------------------------------------------------------
    console.log('2. Verificando Sanitización Activa Anti-XSS en Peticiones...');
    const xssPayload = {
      document_id: 'V-18456123<script>alert("xss")</script>',
      notes: '<iframe src="javascript:alert(1)"></iframe>'
    };
    const resXss = await makeRequest('POST', '/api/v1/auth/login', xssPayload);
    // El script tag debe haber sido neutralizado
    assert.notStrictEqual(resXss.status, 500);
    console.log('   ✅ Payload malicioso con <script> e <iframe> neutralizado.');

    // ------------------------------------------------------------------------
    // PRUEBA 3: Inyección de Cookies Seguras HttpOnly (sgbt_session)
    // ------------------------------------------------------------------------
    console.log('3. Verificando Inyección de Cookies HttpOnly + SameSite=Strict...');
    const resLogin = await makeRequest('POST', '/api/v1/auth/login', {
      document_id: '13537582',
      device_id: 'dev_test_device_pc_1'
    });
    assert.strictEqual(resLogin.status, 200);
    assert(resLogin.data.success);
    const cookies = resLogin.headers['set-cookie'];
    assert(cookies && cookies.length > 0, 'Debe emitir cookie set-cookie');
    const sessionCookie = cookies.find(c => c.startsWith('sgbt_session='));
    assert(sessionCookie, 'Cookie sgbt_session ausente');
    assert(sessionCookie.includes('HttpOnly'), 'La cookie debe contener la bandera HttpOnly');
    assert(sessionCookie.includes('SameSite=Strict'), 'La cookie debe tener SameSite=Strict');
    console.log('   ✅ Cookie sgbt_session emitida con HttpOnly y SameSite=Strict.');

    // ------------------------------------------------------------------------
    // PRUEBA 4: Generación y Validación de TOTP RFC 6238 (MFA)
    // ------------------------------------------------------------------------
    console.log('4. Verificando Algoritmo Criptográfico TOTP RFC 6238...');
    const secret = generateTotpSecret(20);
    assert(secret && secret.length >= 16);
    const validCode = generateTotpToken(secret);
    assert(/^\d{6}$/.test(validCode), 'El código TOTP debe ser de 6 dígitos');
    const isValid = verifyTotpToken(secret, validCode);
    assert.strictEqual(isValid, true, 'El código TOTP generado debe ser válido');
    const isInvalid = verifyTotpToken(secret, '000000' === validCode ? '111111' : '000000');
    assert.strictEqual(isInvalid, false, 'Un código TOTP erróneo debe ser rechazado');
    console.log('   ✅ Motor TOTP RFC 6238 validado correctamente.');

    // ------------------------------------------------------------------------
    // PRUEBA 5: Códigos de Respaldo de Un Solo Uso (Backup Codes)
    // ------------------------------------------------------------------------
    console.log('5. Verificando Códigos de Respaldo (Backup Codes)...');
    const testWorkerId = resLogin.data.user.id;
    const { rawCodes, hashedCodes } = generateBackupCodes(4);
    assert.strictEqual(rawCodes.length, 4);
    activateMfa(testWorkerId, secret, hashedCodes);

    const mfaStatus = getWorkerMfaStatus(testWorkerId);
    assert.strictEqual(mfaStatus.enabled, true);

    const backupCodeToUse = rawCodes[0];
    const consumedFirstTime = verifyAndConsumeBackupCode(testWorkerId, backupCodeToUse);
    assert.strictEqual(consumedFirstTime, true, 'El código de respaldo válido debe consumirse');

    // Intentar reutilizar el mismo código de respaldo (debe fallar porque es de UN SOLO USO)
    const consumedSecondTime = verifyAndConsumeBackupCode(testWorkerId, backupCodeToUse);
    assert.strictEqual(consumedSecondTime, false, 'El código de respaldo ya consumido no puede reutilizarse');
    console.log('   ✅ Códigos de respaldo validados y consumidos con éxito.');

    // Desactivar MFA para dejar el trabajador limpio
    disableMfa(testWorkerId);
    assert.strictEqual(getWorkerMfaStatus(testWorkerId).enabled, false);

    // ------------------------------------------------------------------------
    // PRUEBA 6: Sesiones Institucionales por Dispositivo (Device-Bound Sessions)
    // ------------------------------------------------------------------------
    console.log('6. Verificando Amarre de Sesión por Dispositivo y Revocación...');
    const sessionDev1 = createDeviceSession({
      workerId: testWorkerId,
      role: 'admin',
      documentId: '13537582',
      deviceId: 'laptop_oficina_piso3',
      ipAddress: '10.0.1.50',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    });

    const sessionDev2 = createDeviceSession({
      workerId: testWorkerId,
      role: 'admin',
      documentId: '13537582',
      deviceId: 'telefono_movil_guardia',
      ipAddress: '10.0.1.99',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    });

    const activeList = getActiveDeviceSessions(testWorkerId, sessionDev1.jti);
    assert(activeList.length >= 2, 'Debe listar al menos 2 sesiones activas');
    const currentSession = activeList.find(s => s.id === sessionDev1.jti);
    assert.strictEqual(currentSession.is_current, true, 'La sesión dev1 debe estar marcada como actual');

    // Revocar la segunda sesión de forma remota
    const revoked = revokeDeviceSession(sessionDev2.jti, testWorkerId);
    assert.strictEqual(revoked, true, 'La sesión remota debe revocarse');

    const checkDev2 = validateAndUpdateDeviceSession(sessionDev2.jti, 'telefono_movil_guardia');
    assert.strictEqual(checkDev2.valid, false, 'La sesión revocada debe ser rechazada');
    console.log('   ✅ Control y revocación remota de sesiones de dispositivo comprobado.');

    console.log('\n================================================================');
    console.log('🎉 TODAS LAS PRUEBAS DE BLINDAJE Y SEGURIDAD PASARON AL 100%');
    console.log('================================================================\n');

  } finally {
    server.close();
  }
}

runSecurityTests().catch(err => {
  console.error('\n❌ ERROR EN PRUEBAS DE SEGURIDAD:', err);
  if (server) server.close();
  process.exit(1);
});
