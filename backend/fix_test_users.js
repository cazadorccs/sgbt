const path = require('path');
const { db, readyPromise, secureEnclaveSimulator } = require('./db');
const { generateP256KeyPair } = require('./crypto-utils');
const crypto = require('crypto');

readyPromise.then(() => {
  console.log('[FIX] Sincronizando estado óptimo de usuarios de prueba...');

  const today = new Date().toISOString().split('T')[0];

  // 1. Miguel Ángel Torres -> Rol OPERADOR de Mesa de Despacho
  db.prepare(`
    UPDATE workers
    SET role = 'operator', worker_type = 'activo', status = 'active'
    WHERE document_id = 'V-14111222'
  `).run();

  const miguel = db.prepare("SELECT id FROM workers WHERE document_id = 'V-14111222'").get();
  if (miguel) {
    // Enrolar también passkey para Miguel para que no salga "Pendiente de Enrolar"
    let miguelCred = db.prepare("SELECT id FROM passkey_credentials WHERE worker_id = ? AND status = 'active'").get(miguel.id);
    if (!miguelCred) {
      const kp = generateP256KeyPair();
      const credId = 'Cred_Operator_Miguel_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`
        INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
        VALUES (?, ?, ?, ?, 10, 'Terminal Mesa 1 (Almacén Sótano 1)', 'active')
      `).run(crypto.randomUUID(), miguel.id, credId, kp.publicKey);
      secureEnclaveSimulator.set(miguel.id, {
        credentialId: credId,
        privateKeyPem: kp.privateKey,
        publicKeyPem: kp.publicKey
      });
    }
  }

  // 2. Carlos Eduardo Mendoza -> Beneficiario con Passkey Activa FIDO2
  const carlos = db.prepare("SELECT id FROM workers WHERE document_id = 'V-18456123'").get();
  if (carlos) {
    db.prepare("UPDATE workers SET role = 'worker', worker_type = 'activo', status = 'active' WHERE id = ?").run(carlos.id);

    // Asegurar Passkey activa
    let carlosCred = db.prepare("SELECT id, credential_id FROM passkey_credentials WHERE worker_id = ? AND status = 'active'").get(carlos.id);
    let kpCarlos;
    let carlosCredId;
    if (!carlosCred) {
      kpCarlos = generateP256KeyPair();
      carlosCredId = 'Cred_iPhone15_Carlos_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`
        INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
        VALUES (?, ?, ?, ?, 24, 'iPhone 15 Pro (Secure Enclave)', 'active')
      `).run(crypto.randomUUID(), carlos.id, carlosCredId, kpCarlos.publicKey);
    } else {
      carlosCredId = carlosCred.credential_id;
      kpCarlos = generateP256KeyPair();
      db.prepare("UPDATE passkey_credentials SET public_key = ? WHERE id = ?").run(kpCarlos.publicKey, carlosCred.id);
    }

    secureEnclaveSimulator.set(carlos.id, {
      credentialId: carlosCredId,
      privateKeyPem: kpCarlos.privateKey,
      publicKeyPem: kpCarlos.publicKey
    });

    // Obtener combo principal
    const combo = db.prepare("SELECT id FROM combos WHERE category = 'bolsa_viveres' OR category = 'almuerzo' LIMIT 1").get();
    const comboId = combo ? combo.id : 'c1a2b3c4-1111-2222-3333-444455556666';

    // Eliminar entregas previas de Carlos para HOY para que la prueba sea 100% interactiva
    db.prepare(`
      DELETE FROM deliveries
      WHERE worker_id = ? AND delivered_at LIKE ?
    `).run(carlos.id, `${today}%`);

    // Asegurar daily_entitlement para hoy en status 'pending'
    const existingEnt = db.prepare("SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ?").get(carlos.id, today);
    if (existingEnt) {
      db.prepare("UPDATE daily_entitlements SET status = 'pending', combo_id = ? WHERE id = ?").run(comboId, existingEnt.id);
      // Borrar deliveries que apunten a este entitlement
      db.prepare("DELETE FROM deliveries WHERE entitlement_id = ?").run(existingEnt.id);
    } else {
      const newEntId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
      `).run(newEntId, carlos.id, comboId, today);
    }
  }

  // 3. Claudia Patricia Vega -> Supervisor
  const claudia = db.prepare("SELECT id FROM workers WHERE document_id = 'V-13222333'").get();
  if (claudia) {
    db.prepare("UPDATE workers SET role = 'supervisor', status = 'active' WHERE id = ?").run(claudia.id);
    let claudiaCred = db.prepare("SELECT id FROM passkey_credentials WHERE worker_id = ? AND status = 'active'").get(claudia.id);
    if (!claudiaCred) {
      const kp = generateP256KeyPair();
      const credId = 'Cred_Supervisor_Claudia_' + crypto.randomBytes(6).toString('hex');
      db.prepare(`
        INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
        VALUES (?, ?, ?, ?, 5, 'Pixel 8 (Titan M2 TEE)', 'active')
      `).run(crypto.randomUUID(), claudia.id, credId, kp.publicKey);
      secureEnclaveSimulator.set(claudia.id, {
        credentialId: credId,
        privateKeyPem: kp.privateKey,
        publicKeyPem: kp.publicKey
      });
    }
  }

  // 4. Juan Carlos Rivas -> Admin
  db.prepare("UPDATE workers SET role = 'admin', status = 'active' WHERE document_id = 'V-11123987'").run();

  console.log('[FIX SUCCESS] Usuarios Carlos Mendoza (V-18456123) y Miguel Torres (V-14111222) listos con Passkey y entitlements activos para entrega.');
  process.exit(0);
});
