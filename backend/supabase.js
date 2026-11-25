// ============================================================================
// CONECTOR Y CLIENTE OFICIAL DE SUPABASE (PostgreSQL Cloud)
// Compatible con Supabase REST (Serverless / Vercel) y conexión directa PostgreSQL
// ============================================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const supabaseUrl = process.env.SUPABASE_URL || process.env.SUPABASE_SGBT_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SGBT_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  process.env.SUPABASE_SGBT_ANON_KEY || 
  process.env.SUPABASE_KEY;
const databaseUrl = process.env.DATABASE_URL;

let supabase = null;
let pgPool = null;

// Inicializar cliente Supabase JS (API RESTful segura para Vercel)
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    console.log('[SUPABASE] Cliente REST inicializado para:', supabaseUrl);
  } catch (err) {
    console.error('[SUPABASE ERROR] Fallo al inicializar cliente Supabase:', err.message);
  }
}

// Inicializar Pool de PostgreSQL directo si se configuró DATABASE_URL
if (databaseUrl) {
  try {
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 2000
    });
    console.log('[SUPABASE PG] Pool de conexiones PostgreSQL directo inicializado.');
  } catch (err) {
    console.error('[SUPABASE PG ERROR] Fallo al inicializar pool de Postgres:', err.message);
  }
}

// Verifica si Supabase está plenamente configurado
function isSupabaseConfigured() {
  return Boolean((supabaseUrl && supabaseKey) || databaseUrl);
}

// Ejecuta un test de conectividad contra Supabase
async function testSupabaseConnection() {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      mode: 'sqlite_local',
      message: 'Supabase no configurado. Operando con SQLite Local (offline-ready).'
    };
  }

  // 1. Probar con Pool directo de PostgreSQL si está disponible
  if (pgPool) {
    try {
      const start = Date.now();
      const res = await pgPool.query('SELECT NOW() as server_time, current_database() as db_name');
      const latencyMs = Date.now() - start;
      return {
        connected: true,
        mode: 'supabase_postgres_direct',
        latencyMs,
        serverTime: res.rows[0].server_time,
        database: res.rows[0].db_name
      };
    } catch (err) {
      console.warn('[SUPABASE PG] Fallo conexión directa, probando REST client:', err.message);
    }
  }

  // 2. Probar con Supabase REST API
  if (supabase) {
    try {
      const start = Date.now();
      const { data, error } = await supabase.from('combos').select('id, name').limit(1);
      const latencyMs = Date.now() - start;
      if (error) {
        if (error.message.includes('schema cache') || error.message.includes('find the table')) {
          return {
            connected: true,
            mode: 'supabase_rest_api_tables_pending',
            latencyMs,
            message: 'Autenticación exitosa con Supabase. Pendiente ejecutar backend/supabase_schema.sql en el SQL Editor para inicializar las tablas.'
          };
        }
        throw error;
      }
      return {
        connected: true,
        mode: 'supabase_rest_api',
        latencyMs,
        sampleRecords: data ? data.length : 0
      };
    } catch (err) {
      return {
        connected: false,
        mode: 'supabase_error',
        error: err.message
      };
    }
  }

  return { connected: false, mode: 'unconfigured' };
}

/**
 * Recupera todas las filas paginadas de una tabla en Supabase Cloud
 * superando la restricción estricta de 1000 filas (max-rows) de PostgREST.
 */
async function fetchAllRows(tableName, options = {}) {
  if (!supabase) return [];
  const pageSize = options.pageSize || 1000;
  const maxPages = options.maxPages || 10; // Hasta 10,000 registros
  let results = [];
  let page = 0;

  while (page < maxPages) {
    let q = supabase
      .from(tableName)
      .select(options.select || '*')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (options.orderBy) {
      q = q.order(options.orderBy, { ascending: options.ascending ?? false });
    }
    if (options.filters && typeof options.filters === 'function') {
      q = options.filters(q);
    }

    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) break;
    results = results.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  return results;
}

module.exports = {
  supabase,
  pgPool,
  isSupabaseConfigured,
  testSupabaseConnection,
  fetchAllRows
};
