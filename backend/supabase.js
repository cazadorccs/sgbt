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

module.exports = {
  supabase,
  pgPool,
  isSupabaseConfigured,
  testSupabaseConnection
};
