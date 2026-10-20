/**
 * Generador de DUMP SQL Completo para Migración a Producción
 * Sistema de Gestión de Beneficios Institucionales (MIPPCI)
 * 
 * Genera dos archivos:
 * 1. dump_sqlite_produccion.sql -> Compatible con SQLite / better-sqlite3
 * 2. dump_postgresql_produccion.sql -> Compatible con PostgreSQL / Supabase
 */

const fs = require('fs');
const path = require('path');
const { db, readyPromise } = require('./db');

async function exportSqlDumps() {
  await readyPromise;

  const tables = db.prepare(`
    SELECT name, sql FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%' 
    ORDER BY name
  `).all();

  console.log(`[DUMP] Exportando ${tables.length} tablas...`);

  const now = new Date().toISOString();
  let sqliteDump = `-- =============================================================================\n`;
  sqliteDump += `-- DUMP SQL OFICIAL PARA MIGRACIÓN A PRODUCCIÓN (SQLITE NATIVO / ON-PREMISE)\n`;
  sqliteDump += `-- Sistema: Bienestar y Gestión de Beneficios Alimentarios (MIPPCI)\n`;
  sqliteDump += `-- Fecha de generación: ${now}\n`;
  sqliteDump += `-- =============================================================================\n\n`;
  sqliteDump += `PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n\n`;

  let pgDump = `-- =============================================================================\n`;
  pgDump += `-- DUMP SQL OFICIAL PARA MIGRACIÓN A PRODUCCIÓN (POSTGRESQL / SUPABASE)\n`;
  pgDump += `-- Sistema: Bienestar y Gestión de Beneficios Alimentarios (MIPPCI)\n`;
  pgDump += `-- Fecha de generación: ${now}\n`;
  pgDump += `-- =============================================================================\n\n`;
  pgDump += `BEGIN;\nSET CONSTRAINTS ALL DEFERRED;\n\n`;

  // Orden de inserción para respetar llaves foráneas
  const tableOrder = [
    'departments',
    'workers',
    'passkey_credentials',
    'nfc_cards',
    'combos',
    'distribution_points',
    'delivery_campaigns',
    'daily_entitlements',
    'deliveries',
    'tenant_settings',
    'system_notifications',
    'payroll_sync_logs'
  ];

  const orderedTables = [];
  tableOrder.forEach(name => {
    const found = tables.find(t => t.name === name);
    if (found) orderedTables.push(found);
  });
  // Añadir cualquier otra tabla no prevista
  tables.forEach(t => {
    if (!orderedTables.some(ot => ot.name === t.name)) {
      orderedTables.push(t);
    }
  });

  for (const table of orderedTables) {
    const tableName = table.name;
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();

    console.log(`  -> Procesando tabla '${tableName}': ${rows.length} registros`);

    sqliteDump += `-- -----------------------------------------------------------------------------\n`;
    sqliteDump += `-- TABLA: ${tableName} (${rows.length} registros)\n`;
    sqliteDump += `-- -----------------------------------------------------------------------------\n`;
    sqliteDump += `${table.sql};\n\n`;

    pgDump += `-- -----------------------------------------------------------------------------\n`;
    pgDump += `-- DATOS DE LA TABLA: ${tableName}\n`;
    pgDump += `-- -----------------------------------------------------------------------------\n`;

    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      const colList = columns.map(c => `"${c}"`).join(', ');

      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          // Escapar comillas simples
          const escaped = String(val).replace(/'/g, "''");
          return `'${escaped}'`;
        }).join(', ');

        const insertStmt = `INSERT INTO "${tableName}" (${colList}) VALUES (${values});\n`;
        sqliteDump += insertStmt;
        pgDump += insertStmt;
      }
      sqliteDump += `\n`;
      pgDump += `\n`;
    }
  }

  // Índices y Triggers
  const indexes = db.prepare(`
    SELECT name, tbl_name, sql FROM sqlite_master 
    WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
  `).all();

  sqliteDump += `-- =============================================================================\n`;
  sqliteDump += `-- ÍNDICES Y RESTRICCIONES ANTI-FRAUDE\n`;
  sqliteDump += `-- =============================================================================\n`;
  for (const idx of indexes) {
    sqliteDump += `${idx.sql};\n`;
  }

  const triggers = db.prepare(`
    SELECT name, sql FROM sqlite_master 
    WHERE type='trigger' AND sql IS NOT NULL
  `).all();

  sqliteDump += `\n-- =============================================================================\n`;
  sqliteDump += `-- TRIGGERS AUTOMÁTICOS\n`;
  sqliteDump += `-- =============================================================================\n`;
  for (const trg of triggers) {
    sqliteDump += `${trg.sql};\n\n`;
  }

  sqliteDump += `COMMIT;\nPRAGMA foreign_keys = ON;\n`;
  pgDump += `COMMIT;\n`;

  const sqliteDumpPath = path.join(__dirname, '..', 'dump_sqlite_produccion.sql');
  const pgDumpPath = path.join(__dirname, '..', 'dump_postgresql_produccion.sql');

  fs.writeFileSync(sqliteDumpPath, sqliteDump, 'utf8');
  fs.writeFileSync(pgDumpPath, pgDump, 'utf8');

  console.log(`\n✅ Dumps generados exitosamente:`);
  console.log(`   1. SQLite: ${sqliteDumpPath} (${(fs.statSync(sqliteDumpPath).size / 1024).toFixed(2)} KB)`);
  console.log(`   2. PostgreSQL: ${pgDumpPath} (${(fs.statSync(pgDumpPath).size / 1024).toFixed(2)} KB)`);

  process.exit(0);
}

exportSqlDumps().catch(err => {
  console.error('[DUMP ERROR]', err);
  process.exit(1);
});
