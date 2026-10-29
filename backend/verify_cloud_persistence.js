// ============================================================================
// SCRIPT DE VERIFICACIÓN DEVSECOPS: PERSISTENCIA CRIPTOGRÁFICA EN LA NUBE
// Audita la persistencia en Supabase Cloud y la resiliencia en Vercel Serverless
// ============================================================================

require('dotenv').config();
const crypto = require('crypto');
const { supabase, isSupabaseConfigured } = require('./supabase');
const { db } = require('./db');
const { hashPassword, verifyPassword } = require('./crypto-utils');
const {
  persistWorkerFormalization,
  persistPasskey,
  persistDeliveries,
  persistNfcCard,
  revokeNfcCard
} = require('./services/cloud_sync.service');

async function runAudit() {
  console.log('\n================================================================');
  console.log('🛡️  AUDITORÍA DE PERSISTENCIA CRIPTOGRÁFICA EN LA NUBE (SUPABASE)');
  console.log('================================================================\n');

  if (!isSupabaseConfigured() || !supabase) {
    console.error('❌ Supabase no está configurado en las variables de entorno.');
    process.exit(1);
  }

  const results = [];
  const testWorkerId = 'a2939a40-5465-4923-a2d9-ddf5ed8332c2'; // Kleymari (worker existente)
  const testDistPointId = '5b0f10e3-7eac-4872-bf96-74ecd359be7e'; // Almacén Central

  // 1. Verificación de Tablas y Esquema en Supabase
  try {
    const tables = ['workers', 'passkey_credentials', 'deliveries', 'daily_entitlements', 'combos', 'departments', 'nfc_cards'];
    let allExist = true;
    for (const t of tables) {
      const { error } = await supabase.from(t).select('id').limit(1);
      if (error && !error.message.includes('0 rows')) {
        allExist = false;
        console.log(`   ❌ Tabla '${t}': ${error.message}`);
      } else {
        console.log(`   ✅ Tabla '${t}': Activa y accesible en Supabase`);
      }
    }
    results.push({ test: 'Esquema de Tablas en Supabase Cloud', passed: allExist });
  } catch (e) {
    results.push({ test: 'Esquema de Tablas en Supabase Cloud', passed: false, error: e.message });
  }

  // 2. Proceso 1: Formalización de Beneficiario (Foto + Clave Criptográfica)
  try {
    const testDoc = 'V-TEST-VERIFY';
    const testPwd = 'TestPassword2026!';
    const pwdHash = hashPassword(testPwd);
    const success = await persistWorkerFormalization({
      workerId: testWorkerId,
      documentId: testDoc,
      photoBase64: 'data:image/jpeg;base64,TEST_PHOTO_AUDIT',
      phoneNumber: '04120000000',
      passwordHash: pwdHash,
      boundDeviceId: 'dev_audit_test'
    });

    // Validar lectura desde Supabase
    const { data: credData } = await supabase
      .from('passkey_credentials')
      .select('*')
      .eq('credential_id', `formalized_pwd_${testWorkerId}`)
      .single();

    const isHashValid = credData && verifyPassword(testPwd, credData.public_key);
    results.push({
      test: 'Proceso 1: Formalización y Contraseña en Nube (passkey_credentials)',
      passed: success && isHashValid
    });
  } catch (e) {
    results.push({ test: 'Proceso 1: Formalización y Contraseña en Nube', passed: false, error: e.message });
  }

  // 3. Proceso 2: Credenciales Passkey Biométricas FIDO2
  try {
    const passkeyCredId = `passkey_audit_${Date.now()}`;
    const success = await persistPasskey({
      workerId: testWorkerId,
      credentialId: passkeyCredId,
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----',
      deviceName: 'Audit Device Titan M2'
    });

    const { data: pkData } = await supabase
      .from('passkey_credentials')
      .select('*')
      .eq('credential_id', passkeyCredId)
      .single();

    // Limpieza
    if (pkData) {
      await supabase.from('passkey_credentials').delete().eq('credential_id', passkeyCredId);
    }

    results.push({
      test: 'Proceso 2: Registro de Passkey Biométrico (WebAuthn/FIDO2)',
      passed: success && Boolean(pkData)
    });
  } catch (e) {
    results.push({ test: 'Proceso 2: Registro de Passkey Biométrico', passed: false, error: e.message });
  }

  // 4. Proceso 3: Despacho y Entrega de Beneficios (deliveries + daily_entitlements)
  try {
    const auditEntId = crypto.randomUUID();
    const auditDelId = crypto.randomUUID();

    const success = await persistDeliveries([{
      id: auditDelId,
      entitlement_id: auditEntId,
      worker_id: testWorkerId,
      distribution_point_id: testDistPointId,
      verification_method: 'passkey_qr',
      signature_proof: 'AUDIT_ECDSA_PROOF',
      challenge_nonce: 'AUDIT_NONCE_1234',
      delivered_at: new Date().toISOString()
    }]);

    const { data: delRow } = await supabase
      .from('deliveries')
      .select('*')
      .eq('id', auditDelId)
      .single();

    const { data: entRow } = await supabase
      .from('daily_entitlements')
      .select('*')
      .eq('id', auditEntId)
      .single();

    // Limpieza
    await supabase.from('deliveries').delete().eq('id', auditDelId);
    await supabase.from('daily_entitlements').delete().eq('id', auditEntId);

    const validDelivery = success && Boolean(delRow) && entRow?.status === 'claimed';
    results.push({
      test: 'Proceso 3: Despacho Criptográfico y Liquidación (deliveries)',
      passed: validDelivery
    });
  } catch (e) {
    results.push({ test: 'Proceso 3: Despacho Criptográfico y Liquidación', passed: false, error: e.message });
  }

  // 5. Proceso 4: Tarjetas Físicas NFC / RFID
  try {
    const auditNfcId = crypto.randomUUID();
    const auditCardUid = 'NFC_TEST_AUDIT_' + Date.now();

    const success = await persistNfcCard({
      id: auditNfcId,
      workerId: testWorkerId,
      cardUid: auditCardUid,
      status: 'active'
    });

    const { data: nfcRow } = await supabase
      .from('nfc_cards')
      .select('*')
      .eq('id', auditNfcId)
      .single();

    // Revocar
    await revokeNfcCard(testWorkerId);
    const { data: revokedRow } = await supabase
      .from('nfc_cards')
      .select('status')
      .eq('id', auditNfcId)
      .single();

    // Limpieza
    await supabase.from('nfc_cards').delete().eq('id', auditNfcId);

    const validNfc = success && Boolean(nfcRow) && revokedRow?.status === 'revoked';
    results.push({
      test: 'Proceso 4: Vinculación y Revocación de Tarjetas NFC (nfc_cards)',
      passed: validNfc
    });
  } catch (e) {
    results.push({ test: 'Proceso 4: Vinculación y Revocación de Tarjetas NFC', passed: false, error: e.message });
  }

  // 6. Proceso 5: Resiliencia de Sesión en Vercel Serverless (Targeted Sync)
  try {
    const { syncFromSupabase } = require('./db');
    await syncFromSupabase();
    const localCred = db.prepare("SELECT * FROM passkey_credentials WHERE credential_id = ?").get(`formalized_pwd_${testWorkerId}`);
    const localWorker = db.prepare("SELECT enrollment_status, password_hash FROM workers WHERE id = ?").get(testWorkerId);

    const validHydration = Boolean(localCred) && localWorker?.enrollment_status === 'registrado';
    results.push({
      test: 'Proceso 5: Hidratación y Reconciliación en SQLite (syncFromSupabase)',
      passed: validHydration
    });
  } catch (e) {
    results.push({ test: 'Proceso 5: Hidratación y Reconciliación en SQLite', passed: false, error: e.message });
  }

  console.log('\n================================================================');
  console.log('📊 RESUMEN DE CONFORMIDAD DE PERSISTENCIA CRIPTOGRÁFICA:');
  console.log('================================================================');
  let passedCount = 0;
  for (const r of results) {
    const icon = r.passed ? '✅ PASÓ' : '❌ FALLÓ';
    if (r.passed) passedCount++;
    console.log(`  ${icon} | ${r.test}`);
    if (r.error) console.log(`         Detalle: ${r.error}`);
  }

  console.log(`\nTOTAL: ${passedCount}/${results.length} PROCESOS AUDITADOS EXITOSAMENTE`);
  console.log('================================================================\n');

  if (passedCount === results.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAudit();
