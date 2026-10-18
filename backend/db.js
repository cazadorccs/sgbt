// ============================================================================
// BASE DE DATOS LOCAL Y RELACIONAL (SQLite compatible con SQLCipher / PostgreSQL)
// Implementa el esquema estricto y el índice anti-fraude idx_unique_daily_claim
// ============================================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { generateP256KeyPair } = require('./crypto-utils');

const isVercel = Boolean(process.env.VERCEL);
const DB_PATH = isVercel 
  ? path.join('/tmp', 'combos_platform.sqlite') 
  : path.join(__dirname, 'combos_platform.sqlite');

const db = new Database(DB_PATH);

// Habilitar claves foráneas y modo WAL para alto rendimiento
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Inicializar tablas
function initializeDatabase() {
  db.exec(`
    -- 1. DEPARTAMENTOS
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      cost_center TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. TRABAJADORES (BENEFICIARIOS / SUPERVISORES / OPERADORES)
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      document_id TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
      shift TEXT NOT NULL DEFAULT 'jornada_continua',
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended', 'terminated'
      worker_type TEXT NOT NULL DEFAULT 'activo', -- 'activo', 'jubilado', 'pensionado', 'contratado'
      role TEXT NOT NULL DEFAULT 'worker',   -- 'worker', 'operator', 'supervisor', 'admin'
      has_smartphone INTEGER NOT NULL DEFAULT 1,
      contingency_reason TEXT,
      phone_number TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. CREDENCIALES PASSKEY (FIDO2 / WEBAUTHN - ECDSA P-256)
    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      sign_count INTEGER NOT NULL DEFAULT 0,
      device_name TEXT NOT NULL DEFAULT 'Dispositivo Móvil',
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked'
      aaguid TEXT,
      enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );

    -- 4. TARJETAS FÍSICAS NFC / RFID
    CREATE TABLE IF NOT EXISTS nfc_cards (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      card_uid TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked', 'lost'
      issued_by TEXT REFERENCES workers(id),
      issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    );

    -- 5. CATÁLOGO DE COMBOS ALIMENTICIOS
    CREATE TABLE IF NOT EXISTS combos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'almuerzo', -- 'desayuno', 'almuerzo', 'cena', 'snack'
      calories INTEGER DEFAULT 650,
      dietary_info TEXT DEFAULT 'Estándar',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. PUNTOS DE DISTRIBUCIÓN (COMEDORES INDUSTRIALES)
    CREATE TABLE IF NOT EXISTS distribution_points (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location_code TEXT UNIQUE NOT NULL,
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. ASIGNACIONES DIARIAS (DAILY ENTITLEMENTS)
    CREATE TABLE IF NOT EXISTS daily_entitlements (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE RESTRICT,
      valid_date TEXT NOT NULL,
      shift TEXT NOT NULL DEFAULT 'mañana',
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'claimed', 'expired'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (worker_id, valid_date, shift)
    );

    -- 8. REGISTRO DE ENTREGAS (DELIVERIES)
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      entitlement_id TEXT NOT NULL REFERENCES daily_entitlements(id) ON DELETE RESTRICT,
      worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
      distribution_point_id TEXT NOT NULL REFERENCES distribution_points(id) ON DELETE RESTRICT,
      delivered_by_user_id TEXT REFERENCES workers(id),
      verification_method TEXT NOT NULL DEFAULT 'passkey_qr', -- 'passkey_qr', 'nfc_card', 'supervisor_override'
      signature_proof TEXT,
      challenge_nonce TEXT,
      supervisor_id TEXT REFERENCES workers(id),
      override_reason TEXT,
      is_offline_sync INTEGER NOT NULL DEFAULT 0,
      delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- ========================================================================
    -- ÍNDICE ANTI-FRAUDE ESTRICTO (ANTI REPLAY ATTACK & NO DOBLE ENTREGA)
    -- ========================================================================
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_claim 
    ON deliveries (worker_id, entitlement_id);

    -- 9. LOGS DE INGESTA DE NÓMINA (SFTP / WEBHOOKS)
    CREATE TABLE IF NOT EXISTS payroll_sync_logs (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      source TEXT NOT NULL,
      records_processed INTEGER NOT NULL DEFAULT 0,
      records_failed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      details TEXT,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- TRIGGER: Actualizar daily_entitlements a 'claimed' al insertar en deliveries
    CREATE TRIGGER IF NOT EXISTS trg_mark_entitlement_claimed
    AFTER INSERT ON deliveries
    BEGIN
      UPDATE daily_entitlements
      SET status = 'claimed'
      WHERE id = NEW.entitlement_id;
    END;
  `);

  console.log('[DB] Esquema relacional verificado e inicializado.');
}

// Almacén seguro en memoria para simulación de llaves privadas (Secure Enclave simulado)
const secureEnclaveSimulator = new Map();

function seedDatabase() {
  const rowCount = db.prepare('SELECT COUNT(*) as count FROM workers').get();
  if (rowCount.count > 0) {
    return; // Ya existen datos
  }

  console.log('[DB] Insertando datos maestros iniciales (Seeds)...');

  // Departamentos
  const deptGestionHumana = crypto.randomUUID();
  const deptComunicacion = crypto.randomUUID();
  const deptJubilados = crypto.randomUUID();

  const insertDept = db.prepare(`
    INSERT INTO departments (id, code, name, cost_center) VALUES (?, ?, ?, ?)
  `);
  insertDept.run(deptGestionHumana, 'DGGH_01', 'Dirección General de Gestión Humana', 'CC-1010');
  insertDept.run(deptComunicacion, 'DGCD_02', 'Dirección General de Comunicación Digital', 'CC-2020');
  insertDept.run(deptJubilados, 'CJP_03', 'Coordinación de Jubilados y Pensionados (MIPPCI)', 'CC-3030');

  // Puntos de Distribución (Almacenes y Mesas de Entrega)
  const pointPlantaA = '550e8400-e29b-41d4-a716-446655440000'; // ID canónico del contrato
  const pointPlantaB = crypto.randomUUID();
  const insertPoint = db.prepare(`
    INSERT INTO distribution_points (id, name, location_code, address) VALUES (?, ?, ?, ?)
  `);
  insertPoint.run(pointPlantaA, 'Almacén Central - Sótano 1 (Sede Principal)', 'ALM-S1', 'Edificio Principal MIPPCI, Sótano 1');
  insertPoint.run(pointPlantaB, 'Mesa de Despacho 2 (Auditorio Central)', 'MESA-AUD', 'Planta Baja, Auditorio Principal');

  // Catálogo de Combos (Víveres, Proteínas, Especiales)
  const comboViveres = 'c1a2b3c4-1111-2222-3333-444455556666'; // ID canónico del contrato
  const comboProteico = crypto.randomUUID();
  const comboNavideno = crypto.randomUUID();
  const comboComplementario = crypto.randomUUID();

  const insertCombo = db.prepare(`
    INSERT INTO combos (id, name, description, category, calories, dietary_info, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertCombo.run(comboViveres, 'Bolsa de Víveres Secos (12 rubros)', 'Harina de maíz, arroz, pasta, caraotas negras, aceite comestible, azúcar, leche en polvo', 'bolsa_viveres', 12000, 'Alimentos no perecederos', 1);
  insertCombo.run(comboProteico, 'Combo Proteico Fresco', 'Pollo beneficiado entero, carne de res molida y mortadela especial', 'combo_proteico', 6500, 'Cadena de frío / Consumo familiar', 1);
  insertCombo.run(comboNavideno, 'Combo Navideño Especial', 'Pernil navideño deshuesado, jamón planchado, aceitunas y alcaparras', 'combo_navideno', 9000, 'Edición decembrina', 1);
  insertCombo.run(comboComplementario, 'Combo Complementario Especial', 'Granos variados (lentejas, arvejas) y sardina enlatada', 'combo_especial', 4000, 'Refuerzo nutricional', 1);

  // Beneficiarios (Activos, Jubilados, Contratados)
  const workerCarlos = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // Canónico de PRD
  const workerHilda = 'b1ffcd00-0d1c-5fg9-cc7e-7cc0ce491b22'; // Jubilada
  const workerRoberto = crypto.randomUUID();
  const workerElena = crypto.randomUUID();
  const workerAndres = crypto.randomUUID();

  // Personal operativo y supervisores de Gestión Humana
  const operatorMiguel = 'd1112222-3333-4444-5555-666677778888'; // Operador del contrato
  const supervisorClaudia = crypto.randomUUID();
  const adminJuan = crypto.randomUUID();

  const insertWorker = db.prepare(`
    INSERT INTO workers (id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, contingency_reason, phone_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1. Carlos Mendoza: Funcionario activo con Passkey enrolada
  insertWorker.run(workerCarlos, 'V-18456123', 'Carlos Eduardo Mendoza', 'carlos.mendoza@ministerio.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'worker', 1, null, '+58 414 1234567');
  
  // 2. Hilda Domínguez: Jubilada sin smartphone (contingencia NFC activa)
  insertWorker.run(workerHilda, 'V-06894321', 'Hilda Teresa Domínguez', 'hilda.dominguez@jubilados.gob.ve', deptJubilados, 'jornada_continua', 'active', 'jubilado', 'worker', 0, 'adulto_mayor_sin_smartphone', '+58 424 9876543');

  // 3. Roberto Gómez: Funcionario activo con celular extraviado/dañado
  insertWorker.run(workerRoberto, 'V-12345678', 'Roberto Alexander Gómez', 'roberto.gomez@ministerio.gob.ve', deptComunicacion, 'jornada_continua', 'active', 'activo', 'worker', 1, 'device_lost', '+58 412 5551234');

  // 4. Elena Morales: Funcionaria activa pendiente de enrolar Passkey
  insertWorker.run(workerElena, 'V-21555666', 'Elena Sofía Morales', 'elena.morales@ministerio.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'worker', 1, null, '+58 416 7778899');

  // 5. Andrés Silva: Egresado / Desincorporado de nómina (Kill-Switch)
  insertWorker.run(workerAndres, 'V-15888999', 'Andrés David Silva', 'andres.silva@ministerio.gob.ve', deptComunicacion, 'jornada_continua', 'terminated', 'contratado', 'worker', 1, null, '+58 426 3334455');

  // Personal operativo y directivo
  insertWorker.run(operatorMiguel, 'V-14111222', 'Miguel Ángel Torres (Despacho Almacén)', 'miguel.torres@ministerio.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'operator', 1, null, '+58 414 0001122');
  insertWorker.run(supervisorClaudia, 'V-13222333', 'Lic. Claudia Patricia Vega (Supervisor RRHH)', 'claudia.vega@ministerio.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'supervisor', 1, null, '+58 412 9998877');
  insertWorker.run(adminJuan, 'V-11123987', 'Ing. Juan Carlos Rivas (Director Gestión Humana)', 'juan.rivas@ministerio.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'admin', 1, null, '+58 414 7776655');

  // Generar llaves criptográficas reales ECDSA P-256 para Carlos Mendoza
  const carlosKeyPair = generateP256KeyPair();
  const carlosCredId = 'K38aXm_SecureEnclave_' + crypto.randomBytes(8).toString('base64url');
  
  // Guardar clave privada en el simulador de chip seguro
  secureEnclaveSimulator.set(workerCarlos, {
    credentialId: carlosCredId,
    privateKeyPem: carlosKeyPair.privateKey,
    publicKeyPem: carlosKeyPair.publicKey
  });

  const insertPasskey = db.prepare(`
    INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertPasskey.run(crypto.randomUUID(), workerCarlos, carlosCredId, carlosKeyPair.publicKey, 42, 'iPhone 15 Pro (Secure Enclave)', 'active');

  // Credencial para la Supervisora Claudia (Firma biométrica supervisor)
  const claudiaKeyPair = generateP256KeyPair();
  const claudiaCredId = 'Supervisor_Passkey_' + crypto.randomBytes(8).toString('base64url');
  secureEnclaveSimulator.set(supervisorClaudia, {
    credentialId: claudiaCredId,
    privateKeyPem: claudiaKeyPair.privateKey,
    publicKeyPem: claudiaKeyPair.publicKey
  });
  insertPasskey.run(crypto.randomUUID(), supervisorClaudia, claudiaCredId, claudiaKeyPair.publicKey, 15, 'Pixel 8 (Titan M2 TEE)', 'active');

  // Credencial revocada para Roberto Gómez (Simulando celular perdido)
  const robertoKeyPair = generateP256KeyPair();
  const robertoCredId = 'Lost_Device_Credential_' + crypto.randomBytes(8).toString('base64url');
  insertPasskey.run(crypto.randomUUID(), workerRoberto, robertoCredId, robertoKeyPair.publicKey, 7, 'Samsung Galaxy S22 (Extraviado)', 'revoked');

  // Tarjeta NFC para Hilda Domínguez (Jubilada)
  const insertNfc = db.prepare(`
    INSERT INTO nfc_cards (id, worker_id, card_uid, status, issued_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNfc.run(crypto.randomUUID(), workerHilda, '04A1B2C3D4E5F6', 'active', operatorMiguel);

  // Tarjeta NFC temporal para Roberto Gómez
  insertNfc.run(crypto.randomUUID(), workerRoberto, '04F9E8D7C6B5A4', 'active', supervisorClaudia);

  // Asignaciones de la Jornada (Víveres y Proteína) para hoy
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const insertEntitlement = db.prepare(`
    INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const entCarlos = '770e8400-e29b-41d4-a716-446655440001'; // Canónico del contrato
  const entHilda = '880e8400-e29b-41d4-a716-446655440002';
  const entRoberto = crypto.randomUUID();
  const entElena = crypto.randomUUID();

  // Se asigna la Bolsa de Víveres Secos como beneficio principal de la jornada
  insertEntitlement.run(entCarlos, workerCarlos, comboViveres, today, 'jornada_continua', 'pending');
  insertEntitlement.run(entHilda, workerHilda, comboViveres, today, 'jornada_continua', 'pending');
  insertEntitlement.run(entRoberto, workerRoberto, comboViveres, today, 'jornada_continua', 'pending');
  insertEntitlement.run(entElena, workerElena, comboViveres, today, 'jornada_continua', 'pending');

  console.log('[DB] Seeds iniciales cargados exitosamente.');
}

// Inicializar y cargar seeds
initializeDatabase();
seedDatabase();

module.exports = {
  db,
  secureEnclaveSimulator
};
