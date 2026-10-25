// ============================================================================
// BASE DE DATOS MULTI-ENTORNO (LOCAL / SERVERLESS / VERCEL / SUPABASE)
// Soporta better-sqlite3 nativo de alto rendimiento y motor WebAssembly (sql.js)
// para compatibilidad 100% con Vercel Serverless Functions sin compilación C++
// ============================================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { generateP256KeyPair } = require('./crypto-utils');

let productionSeed = null;
try {
  productionSeed = require('./production_seed.json');
} catch (e) {
  console.warn('[DB] production_seed.json no disponible:', e.message);
}

const isVercel = Boolean(process.env.VERCEL);
const DB_PATH = isVercel 
  ? path.join('/tmp', 'combos_platform.sqlite') 
  : path.join(__dirname, 'combos_platform.sqlite');

let rawDb = null;
let isWasmMode = false;
let readyResolve;
const readyPromise = new Promise((resolve) => {
  readyResolve = resolve;
});

// Simulador de Enclave Seguro de Dispositivos Móviles (Keystore / Titan M2)
const secureEnclaveSimulator = new Map();

// Interfaz universal de Base de Datos compatible con better-sqlite3 y sql.js
const db = {
  prepare(sql) {
    if (!isWasmMode && rawDb) {
      return rawDb.prepare(sql);
    }

    return {
      get(...params) {
        if (!rawDb) return undefined;
        const flat = params.flat();
        const stmt = rawDb.prepare(sql);
        try {
          if (flat.length > 0) stmt.bind(flat);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },
      all(...params) {
        if (!rawDb) return [];
        const flat = params.flat();
        const stmt = rawDb.prepare(sql);
        const results = [];
        try {
          if (flat.length > 0) stmt.bind(flat);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      },
      run(...params) {
        if (!rawDb) return { changes: 0, lastInsertRowid: 0 };
        const flat = params.flat();
        if (flat.length > 0) {
          rawDb.run(sql, flat);
        } else {
          rawDb.run(sql);
        }
        const changes = rawDb.getRowsModified();
        let lastInsertRowid = 0;
        try {
          const res = rawDb.exec('SELECT last_insert_rowid() as id');
          if (res.length && res[0].values.length) {
            lastInsertRowid = res[0].values[0][0];
          }
        } catch (e) {}

        // Persistir copia en /tmp en Vercel (programada de forma debounced para no bloquear el CPU)
        if (isVercel && rawDb) {
          scheduleVercelPersist();
        }

        return { changes, lastInsertRowid };
      }
    };
  },
  exec(sql) {
    if (!isWasmMode && rawDb) {
      return rawDb.exec(sql);
    }
    if (rawDb) {
      rawDb.exec(sql);
    }
  },
  pragma(str) {
    if (!isWasmMode && rawDb) {
      return rawDb.pragma(str);
    }
    if (rawDb) {
      try { rawDb.exec('PRAGMA ' + str); } catch (e) {}
    }
  },
  transaction(fn) {
    if (!isWasmMode && rawDb) {
      return rawDb.transaction(fn);
    }
    return (...args) => {
      let inTx = false;
      try {
        rawDb.run('BEGIN TRANSACTION;');
        inTx = true;
      } catch (e) {}

      try {
        const res = fn(...args);
        if (inTx) {
          try {
            rawDb.run('COMMIT;');
            if (isVercel && rawDb) {
              scheduleVercelPersist();
            }
          } catch (commitErr) {
            console.warn('[DB WASM TRANSACTION WARNING]', commitErr.message);
          }
        }
        return res;
      } catch (err) {
        if (inTx) {
          try { rawDb.run('ROLLBACK;'); } catch (rbErr) {}
        }
        throw err;
      }
    };
  }
};

let vercelPersistTimer = null;
function scheduleVercelPersist() {
  if (!isVercel || !rawDb) return;
  if (vercelPersistTimer) return;
  vercelPersistTimer = setTimeout(() => {
    vercelPersistTimer = null;
    try {
      const data = rawDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {}
  }, 1000);
}

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
      shift TEXT NOT NULL DEFAULT 'jornada_continua',
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'claimed', 'expired'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      campaign_id TEXT REFERENCES delivery_campaigns(id),
      UNIQUE (worker_id, valid_date, combo_id)
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

    -- 10. CONFIGURACIÓN INSTITUCIONAL DE MARCA BLANCA / TENANT GUBERNAMENTAL
    CREATE TABLE IF NOT EXISTS tenant_settings (
      id TEXT PRIMARY KEY DEFAULT 'current_tenant',
      entity_name TEXT NOT NULL DEFAULT 'Ministerio del Poder Popular para la Comunicación y la Información',
      entity_short_name TEXT NOT NULL DEFAULT 'MIPPCI',
      slogan TEXT NOT NULL DEFAULT 'Bienestar y Soberanía Alimentaria Institucional',
      logo_url TEXT,
      primary_color TEXT DEFAULT '#0284c7',
      secondary_color TEXT DEFAULT '#0ea5e9',
      is_initialized INTEGER DEFAULT 1,
      is_demo_mode INTEGER DEFAULT 0,
      supervisor_qr_mode INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. PLANIFICACIÓN DE JORNADAS DE DESPACHO (CAMPAIGNS)
    CREATE TABLE IF NOT EXISTS delivery_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      combo_id TEXT REFERENCES combos(id) ON DELETE SET NULL,
      target_group TEXT NOT NULL DEFAULT 'all', -- 'all', 'activo', 'jubilado', 'contratado', o departamento
      distribution_point_id TEXT REFERENCES distribution_points(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'programada', -- 'programada', 'en_curso', 'finalizada', 'cancelada'
      notification_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. NOTIFICACIONES DEL SISTEMA (IN-APP & WEB PUSH)
    CREATE TABLE IF NOT EXISTS system_notifications (
      id TEXT PRIMARY KEY,
      campaign_id TEXT REFERENCES delivery_campaigns(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      target_group TEXT NOT NULL DEFAULT 'all',
      notification_type TEXT NOT NULL DEFAULT 'jornada', -- 'jornada', 'alerta', 'recordatorio'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 13. LISTA NEGRA / REVOCACIÓN DE SESIONES (TOKEN BLACKLIST / LOGOUT)
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      revoked_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(expires_at);
  `);

  // Migraciones automáticas seguras de columnas opcionales en tablas existentes
  try { db.exec("ALTER TABLE workers ADD COLUMN job_title TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE workers ADD COLUMN hire_date TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN items_detail TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN icon TEXT DEFAULT '🍱'"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN mesa_number INTEGER DEFAULT 1"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN mesa_name TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN conservation TEXT DEFAULT 'Ambiente'"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN target_qty TEXT DEFAULT '1'"); } catch (e) {}
  try { db.exec("ALTER TABLE combos ADD COLUMN weight_kg REAL DEFAULT 14.0"); } catch (e) {}
  try { db.exec("ALTER TABLE deliveries ADD COLUMN campaign_id TEXT REFERENCES delivery_campaigns(id)"); } catch (e) {}
  try { db.exec("ALTER TABLE daily_entitlements ADD COLUMN campaign_id TEXT REFERENCES delivery_campaigns(id)"); } catch (e) {}
  try { db.exec("ALTER TABLE tenant_settings ADD COLUMN is_initialized INTEGER DEFAULT 1"); } catch (e) {}
  try { db.exec("ALTER TABLE tenant_settings ADD COLUMN is_demo_mode INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE tenant_settings ADD COLUMN supervisor_qr_mode INTEGER DEFAULT 0"); } catch (e) {}

  // Migración automática de daily_entitlements a UNIQUE (worker_id, valid_date, combo_id)
  try {
    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_entitlements'").get()?.sql || '';
    if (tableSql && tableSql.includes('UNIQUE (worker_id, valid_date, shift)')) {
      db.exec("PRAGMA foreign_keys = OFF;");
      db.exec("DROP TRIGGER IF EXISTS trg_mark_entitlement_claimed;");
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_entitlements_v2 (
          id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL,
          combo_id TEXT NOT NULL,
          valid_date TEXT NOT NULL,
          shift TEXT NOT NULL DEFAULT 'jornada_continua',
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          campaign_id TEXT,
          UNIQUE (worker_id, valid_date, combo_id)
        );
      `);
      db.exec("INSERT OR IGNORE INTO daily_entitlements_v2 SELECT id, worker_id, combo_id, valid_date, shift, status, created_at, campaign_id FROM daily_entitlements;");
      db.exec("DROP TABLE daily_entitlements;");
      db.exec("ALTER TABLE daily_entitlements_v2 RENAME TO daily_entitlements;");
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS trg_mark_entitlement_claimed
        AFTER INSERT ON deliveries
        BEGIN
          UPDATE daily_entitlements
          SET status = 'claimed'
          WHERE id = NEW.entitlement_id;
        END;
      `);
      db.exec("PRAGMA foreign_keys = ON;");
    }
  } catch (migErr) {
    console.warn('[DB MIGRATION WARNING] daily_entitlements unique migration:', migErr.message);
  }

  // Índices de alto rendimiento para búsquedas instantáneas, filtros y login (<1ms)
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_workers_document_id ON workers(document_id);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_workers_full_name ON workers(full_name);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_workers_department ON workers(department_id);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_daily_entitlements_worker_date ON daily_entitlements(worker_id, valid_date);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_daily_entitlements_combo ON daily_entitlements(combo_id);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_passkey_credentials_worker ON passkey_credentials(worker_id, status);"); } catch (e) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_nfc_cards_worker ON nfc_cards(worker_id, status);"); } catch (e) {}

  // Actualizar pesos estimados de combos por categoría
  try {
    db.prepare("UPDATE combos SET weight_kg = 14.5 WHERE (category = 'almuerzo' OR category = 'bolsa_viveres') AND (weight_kg IS NULL OR weight_kg = 0 OR weight_kg = 14.0)").run();
    db.prepare("UPDATE combos SET weight_kg = 5.2 WHERE category = 'combo_higienico' AND (weight_kg IS NULL OR weight_kg = 0 OR weight_kg = 14.0)").run();
    db.prepare("UPDATE combos SET weight_kg = 8.0 WHERE category = 'proteico' AND (weight_kg IS NULL OR weight_kg = 0 OR weight_kg = 14.0)").run();
    db.prepare("UPDATE combos SET weight_kg = 3.5 WHERE category = 'utiles_escolares' AND (weight_kg IS NULL OR weight_kg = 0 OR weight_kg = 14.0)").run();
    
    // Configuración oficial: Combos separados de Higiene Personal y Limpieza
    db.prepare(`
      UPDATE combos 
      SET name = 'Combo de Higiene Personal',
          description = 'Kit de higiene personal (4 artículos esenciales)',
          items_detail = '4 artículos: 4 Jabones de Tocador, 1 Crema Dental, 1 Champú, 4 Rollos de Papel Higiénico',
          mesa_name = 'Mesa 2 - Higiene y Aseo Personal',
          icon = '🧼',
          is_active = 1
      WHERE id = '3df50537-3333-4fce-8bdc-f4ecbb567adf'
    `).run();

    db.prepare(`
      UPDATE combos 
      SET name = 'Combo de Limpieza',
          description = 'Kit de artículos de limpieza y desinfección del hogar',
          items_detail = 'Artículos de limpieza: 1 Detergente en Polvo (1kg), 1 Jabón Lavaplatos, Desinfectante y Cloro',
          mesa_name = 'Mesa 4 - Artículos de Limpieza',
          icon = '🧹',
          is_active = 1
      WHERE id = '2e39c4a5-0611-4a03-b10c-08ef7e270684'
    `).run();

    db.prepare(`
      UPDATE combos 
      SET icon = '🍗',
          mesa_name = 'Mesa 2 - Charcutería / Proteína'
      WHERE id = 'c1a2b3c4-1111-2222-3333-444455557777'
    `).run();
  } catch (e) {}

  // Inicializar tenant_settings por defecto si está vacío
  const tenantExists = db.prepare("SELECT COUNT(*) as count FROM tenant_settings WHERE id = 'current_tenant'").get();
  if (tenantExists.count === 0) {
    const defaultTenant = (productionSeed && productionSeed.tenant_settings && productionSeed.tenant_settings[0]) || {
      entity_name: 'Ministerio del Poder Popular para la Comunicación y la Información',
      entity_short_name: 'MIPPCI',
      slogan: 'Bienestar y Soberanía Alimentaria Institucional',
      logo_url: '',
      primary_color: '#0284c7',
      secondary_color: '#0ea5e9',
      is_initialized: 1,
      is_demo_mode: 0
    };
    db.prepare(`
      INSERT INTO tenant_settings (id, entity_name, entity_short_name, slogan, logo_url, primary_color, secondary_color, is_initialized, is_demo_mode)
      VALUES ('current_tenant', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      defaultTenant.entity_name,
      defaultTenant.entity_short_name,
      defaultTenant.slogan,
      defaultTenant.logo_url || '',
      defaultTenant.primary_color || '#0284c7',
      defaultTenant.secondary_color || '#0ea5e9',
      defaultTenant.is_initialized !== undefined ? defaultTenant.is_initialized : 1,
      defaultTenant.is_demo_mode !== undefined ? defaultTenant.is_demo_mode : 0
    );
  }

  // Inicializar una campaña de demostración si la tabla está vacía
  const campCount = db.prepare("SELECT COUNT(*) as count FROM delivery_campaigns").get();
  if (campCount.count === 0) {
    const campId = crypto.randomUUID();
    const todayStr = new Date().toISOString().split('T')[0];
    const comboViveres = 'c1a2b3c4-1111-2222-3333-444455556666';
    const pointPlantaA = '550e8400-e29b-41d4-a716-446655440000';
    db.prepare(`
      INSERT INTO delivery_campaigns (id, name, description, start_date, end_date, combo_id, target_group, distribution_point_id, status, notification_sent)
      VALUES (?, 'Gran Jornada Integral de Víveres y Proteína - Mes en Curso', 'Despacho institucional para todo el personal activo y jubilado en Almacén Central', ?, ?, ?, 'all', ?, 'en_curso', 1)
    `).run(campId, todayStr, todayStr, comboViveres, pointPlantaA);

    // Notificación inicial de la jornada
    db.prepare(`
      INSERT INTO system_notifications (id, campaign_id, title, message, target_group, notification_type)
      VALUES (?, ?, '📢 ¡Jornada de Despacho Activa!', 'Se encuentra activo el despacho de tu Bolsa de Víveres y Proteína en el Almacén Central. Recuerda presentar tu código QR biométrico o documento.', 'all', 'jornada')
    `).run(crypto.randomUUID(), campId);
  }

  // Actualizar detalle de rubros para combos existentes si están vacíos
  try {
    db.prepare(`
      UPDATE combos 
      SET items_detail = '4 kg Harina de Maíz Precocida, 2 kg Arroz Blanco, 2 kg Pasta Larga, 1 Lt Aceite Vegetal, 1 kg Azúcar, 1 kg Granos Negros (Caraotas), 2 Latas de Sardinas en Aceite',
          icon = '🌾'
      WHERE category = 'almuerzo' OR category = 'bolsa_viveres'
    `).run();

    db.prepare(`
      UPDATE combos 
      SET items_detail = '2 Polleras Enteras Beneficiadas (aprox. 4.2 kg), 1 Pieza de Carne de Res para Guisar (1.5 kg), 1 Cartón de Huevos Frescos (30 unidades)',
          icon = '🍗'
      WHERE category = 'proteico'
    `).run();

    // Garantizar asignaciones para todos los combos activos para hoy (en bloque atómico)
    const today = new Date().toISOString().split('T')[0];
    const entCount = db.prepare("SELECT COUNT(*) as c FROM daily_entitlements WHERE valid_date = ?").get()?.c || 0;
    if (entCount === 0) {
      const allWorkers = db.prepare("SELECT id FROM workers WHERE status = 'active'").all();
      const activeCombos = db.prepare("SELECT id FROM combos WHERE is_active = 1").all();
      if (activeCombos.length > 0 && allWorkers && allWorkers.length > 0) {
        const assignTx = db.transaction((workersList) => {
          const insEnt = db.prepare(`
            INSERT OR IGNORE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
            VALUES (?, ?, ?, ?, 'jornada_continua', 'pending')
          `);
          for (const w of workersList) {
            for (const c of activeCombos) {
              insEnt.run(crypto.randomUUID(), w.id, c.id, today);
            }
          }
        });
        assignTx(allWorkers);
      }
    }
  } catch (e) {}

  console.log('[DB] Esquema relacional verificado e inicializado con soporte Multi-Ente, Jornadas y Notificaciones.');
}

// Almacén seguro en memoria para simulación de llaves privadas (Secure Enclave simulado)
// (declarado al inicio del archivo)

function seedDatabase(force = false) {
  if (force) {
    try {
      db.exec(`
        DELETE FROM deliveries;
        DELETE FROM daily_entitlements;
        DELETE FROM passkey_credentials;
        DELETE FROM nfc_cards;
        DELETE FROM workers;
      `);
      if (secureEnclaveSimulator && typeof secureEnclaveSimulator.clear === 'function') {
        secureEnclaveSimulator.clear();
      }
    } catch (e) {
      console.warn('[DB SEED] Error limpiando datos previos:', e.message);
    }
  } else {
    const rowCount = db.prepare('SELECT COUNT(*) as count FROM workers').get();
    if (rowCount && rowCount.count > 0) {
      return; // Ya existen datos
    }

    // Si el sistema fue puesto a cero explícitamente (is_initialized = 0), no regenerar
    try {
      const tenant = db.prepare("SELECT is_initialized FROM tenant_settings WHERE id = 'current_tenant'").get();
      if (tenant && tenant.is_initialized === 0) {
        console.log('[DB] Sistema pendiente por configuración inicial tras puesta a cero. Omitiendo seeds.');
        return;
      }
    } catch (e) {}
  }

  console.log('[DB] Insertando datos maestros iniciales (Seeds Oficiales MIPPCI)...');

  // 1. Departamentos
  if (productionSeed && Array.isArray(productionSeed.departments)) {
    const insertDept = db.prepare('INSERT OR IGNORE INTO departments (id, code, name, cost_center) VALUES (?, ?, ?, ?)');
    for (const d of productionSeed.departments) {
      insertDept.run(d.id, d.code, d.name, d.cost_center || null);
    }
  } else {
    let deptGestionHumana = db.prepare("SELECT id FROM departments WHERE code = 'DGGH_01'").get()?.id;
    if (!deptGestionHumana) {
      deptGestionHumana = crypto.randomUUID();
      db.prepare("INSERT INTO departments (id, code, name, cost_center) VALUES (?, 'DGGH_01', 'Dirección General de Gestión Humana', 'CC-1010')").run(deptGestionHumana);
    }
    let deptComunicacion = db.prepare("SELECT id FROM departments WHERE code = 'DGCD_02'").get()?.id;
    if (!deptComunicacion) {
      deptComunicacion = crypto.randomUUID();
      db.prepare("INSERT INTO departments (id, code, name, cost_center) VALUES (?, 'DGCD_02', 'Dirección General de Comunicación Digital', 'CC-2020')").run(deptComunicacion);
    }
    let deptJubilados = db.prepare("SELECT id FROM departments WHERE code = 'CJP_03'").get()?.id;
    if (!deptJubilados) {
      deptJubilados = crypto.randomUUID();
      db.prepare("INSERT INTO departments (id, code, name, cost_center) VALUES (?, 'CJP_03', 'Coordinación de Jubilados y Pensionados (MIPPCI)', 'CC-3030')").run(deptJubilados);
    }
  }

  // 2. Puntos de Distribución
  if (productionSeed && Array.isArray(productionSeed.distribution_points)) {
    const insertPoint = db.prepare('INSERT OR IGNORE INTO distribution_points (id, name, location_code, address, is_active) VALUES (?, ?, ?, ?, ?)');
    for (const p of productionSeed.distribution_points) {
      insertPoint.run(p.id, p.name, p.location_code, p.address, p.is_active ?? 1);
    }
    // Asegurar estaciones oficiales de despacho
    insertPoint.run('dist-point-station-1', 'Estación 1: Bulto Víveres Secos (Sótano 1)', 'EST-01', 'Estación 1 [Ambiente] - Almacén Central Sótano 1', 1);
    insertPoint.run('dist-point-station-2', 'Estación 2: Combo Proteico Fresco (Cadena de Frío)', 'EST-02', 'Estación 2 [Cavas Frías] - Almacén Central Sótano 1', 1);
  } else {
    const pointPlantaA = '550e8400-e29b-41d4-a716-446655440000';
    const pointPlantaB = '550e8400-e29b-41d4-a716-446655440001';
    db.prepare('INSERT OR IGNORE INTO distribution_points (id, name, location_code, address) VALUES (?, ?, ?, ?)').run(pointPlantaA, 'Almacén Central - Sótano 1 (Sede Principal)', 'ALM-S1', 'Edificio Principal MIPPCI, Sótano 1');
    db.prepare('INSERT OR IGNORE INTO distribution_points (id, name, location_code, address) VALUES (?, ?, ?, ?)').run(pointPlantaB, 'Mesa de Despacho 2 (Auditorio Central)', 'MESA-AUD', 'Planta Baja, Auditorio Principal');
    db.prepare('INSERT OR IGNORE INTO distribution_points (id, name, location_code, address) VALUES (?, ?, ?, ?)').run('dist-point-station-1', 'Estación 1: Bulto Víveres Secos (Sótano 1)', 'EST-01', 'Estación 1 [Ambiente] - Almacén Sótano 1');
    db.prepare('INSERT OR IGNORE INTO distribution_points (id, name, location_code, address) VALUES (?, ?, ?, ?)').run('dist-point-station-2', 'Estación 2: Combo Proteico Fresco (Cadena de Frío)', 'EST-02', 'Estación 2 [Cavas Frías] - Almacén Sótano 1');
  }

  // 3. Catálogo de Combos
  const comboViveres = 'c1a2b3c4-1111-2222-3333-444455556666';
  const comboProteico = 'c1a2b3c4-1111-2222-3333-444455557777';
  const comboNavideno = 'c1a2b3c4-1111-2222-3333-444455558888';
  const comboComplementario = 'c1a2b3c4-1111-2222-3333-444455559999';

  if (productionSeed && Array.isArray(productionSeed.combos)) {
    const insertCombo = db.prepare('INSERT OR IGNORE INTO combos (id, name, description, category, calories, dietary_info, is_active, items_detail, icon, mesa_number, mesa_name, conservation, target_qty, weight_kg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const c of productionSeed.combos) {
      insertCombo.run(
        c.id, c.name, c.description, c.category || 'bolsa_viveres', c.calories || 0, c.dietary_info || 'Estándar', c.is_active ?? 1,
        c.items_detail || '', c.icon || '🍱', c.mesa_number || 1, c.mesa_name || '', c.conservation || 'Ambiente', c.target_qty || '1', c.weight_kg || 14.0
      );
    }
  } else {
    const insertCombo = db.prepare('INSERT OR IGNORE INTO combos (id, name, description, category, calories, dietary_info, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertCombo.run(comboViveres, 'Bolsa de Víveres Secos (12 rubros)', 'Harina de maíz, arroz, pasta, caraotas negras, aceite comestible, azúcar, leche en polvo', 'bolsa_viveres', 12000, 'Alimentos no perecederos', 1);
    insertCombo.run(comboProteico, 'Combo Proteico Fresco', 'Pollo beneficiado entero, carne de res molida y mortadela especial', 'combo_proteico', 6500, 'Cadena de frío / Consumo familiar', 1);
    insertCombo.run(comboNavideno, 'Combo Navideño Especial', 'Pernil navideño deshuesado, jamón planchado, aceitunas y alcaparras', 'combo_navideno', 9000, 'Edición decembrina', 1);
    insertCombo.run(comboComplementario, 'Combo Complementario Especial', 'Granos variados (lentejas, arvejas) y sardina enlatada', 'combo_especial', 4000, 'Refuerzo nutricional', 1);
  }

  // 4. Beneficiarios y Personal Oficial (16 Funcionarios)
  const insertWorker = db.prepare(`
    INSERT OR REPLACE INTO workers (
      id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, contingency_reason, phone_number, avatar_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  if (productionSeed && Array.isArray(productionSeed.workers) && productionSeed.workers.length > 0) {
    const seedWorkersTx = db.transaction((workersList) => {
      for (const w of workersList) {
        insertWorker.run(
          w.id,
          w.document_id,
          w.full_name,
          w.email,
          w.department_id,
          w.shift || 'jornada_continua',
          w.status || 'active',
          w.worker_type || 'activo',
          w.role || 'worker',
          w.has_smartphone ? 1 : 0,
          w.contingency_reason || null,
          w.phone_number || null,
          w.avatar_url || null
        );
      }
    });
    seedWorkersTx(productionSeed.workers);
  } else {
    const deptGestionHumana = db.prepare("SELECT id FROM departments WHERE code = 'DGGH_01'").get()?.id;
    const deptComunicacion = db.prepare("SELECT id FROM departments WHERE code = 'DGCD_02'").get()?.id;
    const deptJubilados = db.prepare("SELECT id FROM departments WHERE code = 'CJP_03'").get()?.id;

    insertWorker.run('a8b19654-8d50-4c60-a99a-259d6960a62f', '13537582', 'Msc. Sahib A Franco', 'Sfranco@mippci.gob.ve', deptComunicacion, 'jornada_continua', 'active', 'activo', 'admin', 1, null, '+584129743120', null);
    insertWorker.run('fdb4d82c-e11f-4d44-998d-b3cc0fa57d90', 'V-18456123', 'Carlos Eduardo Mendoza', 'carlos.mendoza@mippci.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'worker', 1, null, '+58 412 1112233', null);
    insertWorker.run('594a7451-f3b9-4c58-9a26-78eb132d5300', 'V-06894321', 'Hilda Teresa Domínguez', 'hilda.dominguez@mippci.gob.ve', deptJubilados, 'jornada_continua', 'active', 'jubilado', 'worker', 0, 'adulto_mayor_sin_smartphone', '+58 412 1112233', null);
    insertWorker.run('23eb7b65-d7f0-4281-a940-63db5302fdf7', 'V-12345678', 'Roberto Alexander Gómez', 'roberto.gomez@mippci.gob.ve', deptComunicacion, 'jornada_continua', 'active', 'activo', 'worker', 1, 'device_lost', '+58 412 1112233', null);
    insertWorker.run('d1794f4a-7dfa-47d6-97ed-0aee326a3aa4', 'V-21555666', 'Elena Sofía Morales', 'elena.morales@mippci.gob.ve', deptGestionHumana, 'mañana', 'active', 'activo', 'worker', 1, null, '+58 412 1112233', null);
    insertWorker.run('d8e1ab71-354c-409d-977a-f7fa510ca31e', 'V-15888999', 'Andrés David Silva', 'andres.silva@mippci.gob.ve', deptComunicacion, 'tarde', 'active', 'contratado', 'worker', 1, null, '+58 412 1112233', null);
    insertWorker.run('03ff49f9-70c7-4177-9d28-ad833563d6f1', 'V-14111222', 'Miguel Ángel Torres', 'miguel.torres@mippci.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'operator', 1, null, '+58 412 1112233', null);
    insertWorker.run('d1388f41-9015-430f-891a-55ebee18fd5c', 'V-13222333', 'Claudia Patricia Vega', 'claudia.vega@mippci.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'supervisor', 1, null, '+58 412 1112233', null);
    insertWorker.run('0149e33b-892d-43e3-92e8-f635e7a1d001', 'V-11123987', 'Juan Carlos Rivas', 'juan.rivas@mippci.gob.ve', deptGestionHumana, 'jornada_continua', 'active', 'activo', 'admin', 1, null, '+58 412 1112233', null);
  }

  // 5. Enrolamiento y llaves criptográficas reales ECDSA P-256
  const workerCarlos = db.prepare("SELECT id FROM workers WHERE UPPER(document_id) LIKE '%18456123%'").get()?.id || 'fdb4d82c-e11f-4d44-998d-b3cc0fa57d90';
  const supervisorClaudia = db.prepare("SELECT id FROM workers WHERE UPPER(document_id) LIKE '%13222333%'").get()?.id || 'd1388f41-9015-430f-891a-55ebee18fd5c';
  const workerRoberto = db.prepare("SELECT id FROM workers WHERE UPPER(document_id) LIKE '%12345678%'").get()?.id || '23eb7b65-d7f0-4281-a940-63db5302fdf7';
  const workerHilda = db.prepare("SELECT id FROM workers WHERE UPPER(document_id) LIKE '%06894321%'").get()?.id || '594a7451-f3b9-4c58-9a26-78eb132d5300';
  const operatorMiguel = db.prepare("SELECT id FROM workers WHERE UPPER(document_id) LIKE '%14111222%'").get()?.id || '03ff49f9-70c7-4177-9d28-ad833563d6f1';
  const adminSahib = db.prepare("SELECT id FROM workers WHERE UPPER(document_id) LIKE '%13537582%'").get()?.id || 'a8b19654-8d50-4c60-a99a-259d6960a62f';

  // Llaves para Carlos Mendoza
  const carlosKeyPair = generateP256KeyPair();
  const carlosCredId = 'K38aXm_SecureEnclave_' + crypto.randomBytes(8).toString('base64url');
  secureEnclaveSimulator.set(workerCarlos, {
    credentialId: carlosCredId,
    privateKeyPem: carlosKeyPair.privateKey,
    publicKeyPem: carlosKeyPair.publicKey
  });
  secureEnclaveSimulator.set('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', {
    credentialId: carlosCredId,
    privateKeyPem: carlosKeyPair.privateKey,
    publicKeyPem: carlosKeyPair.publicKey
  });
  secureEnclaveSimulator.set('V-18456123', {
    credentialId: carlosCredId,
    privateKeyPem: carlosKeyPair.privateKey,
    publicKeyPem: carlosKeyPair.publicKey
  });

  const insertPasskey = db.prepare(`
    INSERT OR REPLACE INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertPasskey.run(crypto.randomUUID(), workerCarlos, carlosCredId, carlosKeyPair.publicKey, 42, 'iPhone 15 Pro (Secure Enclave)', 'active');

  // Llaves para Supervisora Claudia Vega
  const claudiaKeyPair = generateP256KeyPair();
  const claudiaCredId = 'Supervisor_Passkey_' + crypto.randomBytes(8).toString('base64url');
  secureEnclaveSimulator.set(supervisorClaudia, {
    credentialId: claudiaCredId,
    privateKeyPem: claudiaKeyPair.privateKey,
    publicKeyPem: claudiaKeyPair.publicKey
  });
  insertPasskey.run(crypto.randomUUID(), supervisorClaudia, claudiaCredId, claudiaKeyPair.publicKey, 15, 'Pixel 8 (Titan M2 TEE)', 'active');

  // Credencial revocada para Roberto Gómez
  const robertoKeyPair = generateP256KeyPair();
  const robertoCredId = 'Lost_Device_Credential_' + crypto.randomBytes(8).toString('base64url');
  insertPasskey.run(crypto.randomUUID(), workerRoberto, robertoCredId, robertoKeyPair.publicKey, 7, 'Samsung Galaxy S22 (Extraviado)', 'revoked');

  // Tarjeta NFC para Hilda Domínguez (Jubilada) y Roberto Gómez
  const insertNfc = db.prepare(`
    INSERT OR REPLACE INTO nfc_cards (id, worker_id, card_uid, status, issued_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNfc.run(crypto.randomUUID(), workerHilda, '04A1B2C3D4E5F6', 'active', operatorMiguel);
  insertNfc.run(crypto.randomUUID(), workerRoberto, '04F9E8D7C6B5A4', 'active', supervisorClaudia);

  // 6. Asignaciones de la Jornada (Víveres y Proteína por Estaciones) para hoy
  const today = new Date().toISOString().split('T')[0];
  const insertEntitlement = db.prepare(`
    INSERT OR REPLACE INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    const allActiveWorkers = db.prepare("SELECT id, shift FROM workers WHERE status = 'active'").all();
    const vCombo = db.prepare("SELECT id FROM combos WHERE category IN ('bolsa_viveres') OR name LIKE '%Víveres%' ORDER BY id ASC LIMIT 1").get() || { id: comboViveres };
    const pCombo = db.prepare("SELECT id FROM combos WHERE category IN ('combo_proteico', 'proteico') OR name LIKE '%Prote%' ORDER BY id ASC LIMIT 1").get() || { id: comboProteico };

    for (const w of allActiveWorkers) {
      // Estación 1: Bulto Víveres Secos
      const ex1 = db.prepare("SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? AND shift = 'estacion_1'").get(w.id, today);
      if (!ex1) {
        insertEntitlement.run(crypto.randomUUID(), w.id, vCombo.id, today, 'estacion_1', 'pending');
      }
      // Estación 2: Combo Proteico Fresco (Cadena de Frío)
      const ex2 = db.prepare("SELECT id FROM daily_entitlements WHERE worker_id = ? AND valid_date = ? AND shift = 'estacion_2'").get(w.id, today);
      if (!ex2) {
        insertEntitlement.run(crypto.randomUUID(), w.id, pCombo.id, today, 'estacion_2', 'pending');
      }
    }
  } catch (entErr) {
    console.warn('[DB SEED] Aviso asignando derechos diarios por estaciones:', entErr.message);
  }

  console.log('[DB] Seeds oficiales cargados exitosamente (Asignaciones por Estación 1 y Estación 2 activas).');
}

// ----------------------------------------------------------------------------
// INICIALIZACIÓN DEL MOTOR DE BASE DE DATOS (NATIVO O WEBASSEMBLY)
// ----------------------------------------------------------------------------
const isServerless = Boolean(
  process.env.VERCEL || 
  process.env.AWS_LAMBDA_FUNCTION_NAME || 
  process.env.LAMBDA_TASK_ROOT || 
  process.env.NOW_REGION
);

let Database = null;
// En Vercel / Serverless no intentar cargar better-sqlite3 nativo para evitar SIGABRT de binarios C++
if (!isServerless) {
  try {
    Database = require('better-sqlite3');
  } catch (nativeErr) {
    console.warn('[DB] better-sqlite3 nativo no disponible en este entorno:', nativeErr.message);
  }
}

// Función de sincronización bidireccional / hidratación con Supabase Cloud
async function syncFromSupabase() {
  try {
    const { supabase, isSupabaseConfigured } = require('./supabase');
    if (!isSupabaseConfigured() || !supabase) return;

    // Hidratar combos desde Supabase Cloud
    try {
      const { data: remoteCombos, error: cErr } = await supabase.from('combos').select('*');
      if (!cErr && Array.isArray(remoteCombos) && remoteCombos.length > 0) {
        const remoteIds = new Set(remoteCombos.map(r => r.id));
        const localCombos = db.prepare('SELECT id FROM combos').all();
        for (const loc of localCombos) {
          if (!remoteIds.has(loc.id)) {
            try {
              db.prepare('DELETE FROM daily_entitlements WHERE combo_id = ?').run(loc.id);
              db.prepare('DELETE FROM delivery_campaigns WHERE combo_id = ?').run(loc.id);
              db.prepare('DELETE FROM combos WHERE id = ?').run(loc.id);
            } catch (e) {}
          }
        }

        for (const c of remoteCombos) {
          try {
            db.prepare(`
              INSERT INTO combos (id, name, description, category, calories, dietary_info, is_active, items_detail, icon, mesa_number, mesa_name, conservation, target_qty, weight_kg, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                category = excluded.category,
                calories = excluded.calories,
                dietary_info = excluded.dietary_info,
                is_active = excluded.is_active
            `).run(
              c.id, c.name, c.description, c.category || 'combo_especial', c.calories || 0, c.dietary_info || 'Estándar', c.is_active ? 1 : 0,
              c.description || '', '🍱', 1, 'Mesa 1', 'Ambiente', '1', 14.0, c.created_at || new Date().toISOString()
            );
          } catch (e) {}
        }
        if (remoteCombos && remoteCombos.length > 0) {
          const remoteIds = remoteCombos.map(c => c.id);
          const placeholders = remoteIds.map(() => '?').join(',');
          try {
            db.prepare(`UPDATE combos SET is_active = 0 WHERE id NOT IN (${placeholders})`).run(...remoteIds);
          } catch (e) {}
        }
        console.log(`[SUPABASE HYDRATION] ${remoteCombos.length} combos sincronizados desde Supabase Cloud.`);
      }
    } catch (e) {}

    const { data: remoteWorkers, error: wErr } = await supabase.from('workers').select('*');
    if (!wErr && Array.isArray(remoteWorkers) && remoteWorkers.length > 0) {
      const insertWorker = db.prepare(`
        INSERT INTO workers (
          id, document_id, full_name, email, department_id, shift, status, worker_type, role, has_smartphone, contingency_reason, phone_number, avatar_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          document_id = excluded.document_id,
          full_name = excluded.full_name,
          email = excluded.email,
          department_id = excluded.department_id,
          shift = excluded.shift,
          status = excluded.status,
          worker_type = excluded.worker_type,
          role = excluded.role,
          has_smartphone = excluded.has_smartphone,
          contingency_reason = excluded.contingency_reason,
          phone_number = excluded.phone_number,
          avatar_url = excluded.avatar_url,
          updated_at = excluded.updated_at
      `);
      for (const w of remoteWorkers) {
        try {
          insertWorker.run(
            w.id,
            w.document_id,
            w.full_name,
            w.email,
            w.department_id,
            w.shift || 'jornada_continua',
            w.status || 'active',
            w.worker_type || 'activo',
            w.role || 'worker',
            w.has_smartphone ? 1 : 0,
            w.contingency_reason,
            w.phone_number,
            w.avatar_url,
            w.created_at || new Date().toISOString(),
            w.updated_at || new Date().toISOString()
          );
        } catch (singleErr) {
          // Si hay conflicto de email o document_id con ID distinto, no detener la sincronización
        }
      }
      console.log(`[SUPABASE HYDRATION] ${remoteWorkers.length} funcionarios procesados desde Supabase Cloud.`);
    }

    // Hidratar credenciales Passkey (FIDO2) registradas en la nube
    const { data: remotePasskeys, error: pkErr } = await supabase.from('passkey_credentials').select('*');
    if (!pkErr && Array.isArray(remotePasskeys) && remotePasskeys.length > 0) {
      const insertRemotePasskey = db.prepare(`
        INSERT INTO passkey_credentials (id, worker_id, credential_id, public_key, sign_count, device_name, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          worker_id = excluded.worker_id,
          credential_id = excluded.credential_id,
          public_key = excluded.public_key,
          sign_count = excluded.sign_count,
          device_name = excluded.device_name,
          status = excluded.status
      `);
      for (const pk of remotePasskeys) {
        insertRemotePasskey.run(
          pk.id,
          pk.worker_id,
          pk.credential_id,
          pk.public_key,
          pk.sign_count || 0,
          pk.device_name || 'Dispositivo Móvil',
          pk.status || 'active'
        );
      }
      console.log(`[SUPABASE HYDRATION] ${remotePasskeys.length} passkeys sincronizadas desde Supabase Cloud.`);
    }

    // Hidratar asignaciones de la jornada (daily_entitlements) de hoy
    const today = new Date().toISOString().split('T')[0];
    const { data: remoteEntitlements, error: entErr } = await supabase.from('daily_entitlements').select('*').eq('valid_date', today);
    if (!entErr && Array.isArray(remoteEntitlements) && remoteEntitlements.length > 0) {
      const insertRemoteEnt = db.prepare(`
        INSERT INTO daily_entitlements (id, worker_id, combo_id, valid_date, shift, status)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(worker_id, valid_date, combo_id) DO UPDATE SET
          shift = excluded.shift,
          status = excluded.status
      `);
      for (const ent of remoteEntitlements) {
        insertRemoteEnt.run(
          ent.id,
          ent.worker_id,
          ent.combo_id,
          ent.valid_date,
          ent.shift || 'jornada_continua',
          ent.status || 'pending'
        );
      }
      console.log(`[SUPABASE HYDRATION] ${remoteEntitlements.length} asignaciones de hoy sincronizadas desde Supabase Cloud.`);
    }
  } catch (err) {
    console.warn('[SUPABASE HYDRATION WARNING] Error sincronizando con Supabase:', err.message);
  }
}

if (Database) {
  try {
    rawDb = new Database(DB_PATH);
    rawDb.pragma('foreign_keys = ON');
    rawDb.pragma('journal_mode = WAL');

    initializeDatabase();
    seedDatabase();
    syncFromSupabase().catch(() => {}).finally(() => {
      readyResolve(true);
    });
    console.log('[DB] Motor better-sqlite3 nativo activo exitosamente.');
  } catch (err) {
    console.warn('[DB] Fallo al iniciar better-sqlite3, pasando a motor WebAssembly:', err.message);
    rawDb = null;
  }
}

// Si better-sqlite3 no está disponible o estamos en Vercel Serverless, activar sql.js (WebAssembly)
if (!rawDb) {
  isWasmMode = true;
  // Usar la versión inline de WebAssembly para garantizar 100% de compatibilidad sin dependencias externas
  const initSqlJs = require('sql.js/dist/sql-wasm-inline.js');

  initSqlJs().then(async (SQL) => {
    try {
      if (isVercel && fs.existsSync(DB_PATH)) {
        try {
          const fileBuf = fs.readFileSync(DB_PATH);
          if (fileBuf && fileBuf.length > 1000) {
            rawDb = new SQL.Database(fileBuf);
            console.log('[DB] Base de datos SQLite restaurada desde caché /tmp en Vercel.');
          } else {
            rawDb = new SQL.Database();
          }
        } catch (readErr) {
          rawDb = new SQL.Database();
        }
      } else {
        rawDb = new SQL.Database();
      }

      console.log('[DB] Base de datos SQLite inicializada en memoria WASM.');

      initializeDatabase();
      seedDatabase();

      if (isVercel && rawDb) {
        try {
          const data = rawDb.export();
          fs.writeFileSync(DB_PATH, Buffer.from(data));
        } catch (e) {}
      }

      // Sincronizar en segundo plano sin retrasar el arranque
      syncFromSupabase().catch(() => {});

      readyResolve(true);
      console.log('[DB] Motor SQLite WebAssembly (sql-wasm-inline) listo y operativo para Vercel.');
    } catch (wasmErr) {
      console.error('[DB FATAL] Fallo al inicializar sql.js:', wasmErr);
      readyResolve(false);
    }
  }).catch((loadErr) => {
    console.error('[DB FATAL] Fallo al cargar módulo sql.js:', loadErr);
    readyResolve(false);
  });
}

module.exports = {
  db,
  readyPromise,
  secureEnclaveSimulator,
  seedDatabase,
  syncFromSupabase
};
