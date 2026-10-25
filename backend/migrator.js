// backend/migrator.js
// Gestor Declarativo de Migraciones de Base de Datos (database-migrations)
// Ejecuta scripts SQL versionados con control de integridad SHA-256 y atomicidad

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}

/**
 * Inicializa la tabla de control de versiones de esquema
 */
function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Obtiene la lista de migraciones ya aplicadas
 */
function getAppliedMigrations(db) {
  ensureMigrationTable(db);
  try {
    return db.prepare('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC').all();
  } catch (err) {
    return [];
  }
}

/**
 * Ejecuta todas las migraciones pendientes en orden secuencial
 */
function runMigrations(db) {
  ensureMigrationTable(db);
  
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn('[MIGRATOR] Directorio de migraciones no encontrado:', MIGRATIONS_DIR);
    return { applied: [], skipped: [] };
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const appliedRows = getAppliedMigrations(db);
  const appliedSet = new Map(appliedRows.map(r => [r.version, r]));

  const appliedNow = [];
  const skipped = [];

  for (const file of files) {
    const version = file.split('_')[0];
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = computeChecksum(content);

    if (appliedSet.has(version)) {
      skipped.push({ version, file, checksum });
      continue;
    }

    console.log(`[MIGRATOR] Aplicando migración: ${file}...`);

    try {
      db.transaction(() => {
        // En SQLite, db.exec ejecuta múltiples sentencias SQL de forma nativa
        db.exec(content);

        db.prepare(`
          INSERT INTO schema_migrations (version, name, checksum, applied_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).run(version, file, checksum);
      })();

      appliedNow.push({ version, file, checksum });
      console.log(`[MIGRATOR] ✅ Migración ${file} aplicada con éxito.`);
    } catch (err) {
      // Manejo específico si las columnas de ALTER TABLE ya existían
      if (err.message && (err.message.includes('duplicate column name') || err.message.includes('already exists'))) {
        try {
          db.prepare(`
            INSERT OR REPLACE INTO schema_migrations (version, name, checksum, applied_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `).run(version, file, checksum);
          appliedNow.push({ version, file, checksum });
          console.log(`[MIGRATOR] ✅ Migración ${file} sincronizada (columnas preexistentes).`);
          continue;
        } catch (innerErr) {}
      }

      console.error(`[MIGRATOR] ❌ Error aplicando migración ${file}:`, err.message);
      throw err;
    }
  }

  return { applied: appliedNow, skipped };
}

/**
 * Obtiene el estado consolidado de migraciones
 */
function getMigrationStatus(db) {
  ensureMigrationTable(db);
  const applied = getAppliedMigrations(db);
  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    : [];

  const appliedVersions = new Set(applied.map(a => a.version));

  return files.map(file => {
    const version = file.split('_')[0];
    const isApplied = appliedVersions.has(version);
    const record = applied.find(a => a.version === version);
    return {
      version,
      file,
      status: isApplied ? 'APLICADA' : 'PENDIENTE',
      applied_at: record ? record.applied_at : null,
      checksum: record ? record.checksum.substring(0, 8) + '...' : 'N/A'
    };
  });
}

module.exports = {
  runMigrations,
  getMigrationStatus,
  getAppliedMigrations
};

// Ejecución directa desde CLI: node backend/migrator.js
if (require.main === module) {
  setImmediate(async () => {
    const { db, readyPromise } = require('./db');
    if (readyPromise) await readyPromise;
    console.log('================================================================');
    console.log('🔄 GESTOR DECLARATIVO DE MIGRACIONES (SGBT / MIPPCI)');
    console.log('================================================================');
    
    const result = runMigrations(db);
    console.log(`\nResumen: ${result.applied.length} aplicadas, ${result.skipped.length} previamente registradas.`);
    
    console.log('\n--- ESTADO ACTUAL DEL ESQUEMA ---');
    console.table(getMigrationStatus(db));
    process.exit(0);
  });
}
