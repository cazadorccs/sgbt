-- migrations/001_initial_schema.sql
-- Migración 001: Esquema Base del Sistema SGBT / MIPPCI

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
  status TEXT NOT NULL DEFAULT 'active',
  worker_type TEXT NOT NULL DEFAULT 'activo',
  role TEXT NOT NULL DEFAULT 'worker',
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
  status TEXT NOT NULL DEFAULT 'active',
  aaguid TEXT,
  enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

-- 4. TARJETAS FÍSICAS NFC / RFID
CREATE TABLE IF NOT EXISTS nfc_cards (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  card_uid TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  issued_by TEXT REFERENCES workers(id),
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

-- 5. CATÁLOGO DE COMBOS ALIMENTICIOS
CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'almuerzo',
  calories INTEGER DEFAULT 650,
  dietary_info TEXT DEFAULT 'Estándar',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. PUNTOS DE DISTRIBUCIÓN (COMEDORES / ALMACENES)
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
  status TEXT NOT NULL DEFAULT 'pending',
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
  verification_method TEXT NOT NULL DEFAULT 'passkey_qr',
  signature_proof TEXT,
  challenge_nonce TEXT,
  supervisor_id TEXT REFERENCES workers(id),
  override_reason TEXT,
  is_offline_sync INTEGER NOT NULL DEFAULT 0,
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICE ANTI-FRAUDE ESTRICTO (ANTI REPLAY ATTACK & NO DOBLE ENTREGA)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_claim 
ON deliveries (worker_id, entitlement_id);

-- 9. LOGS DE INGESTA DE NÓMINA
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
  target_group TEXT NOT NULL DEFAULT 'all',
  distribution_point_id TEXT REFERENCES distribution_points(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'programada',
  notification_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 12. NOTIFICACIONES DEL SISTEMA
CREATE TABLE IF NOT EXISTS system_notifications (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES delivery_campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_group TEXT NOT NULL DEFAULT 'all',
  notification_type TEXT NOT NULL DEFAULT 'jornada',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 13. LISTA NEGRA / REVOCACIÓN DE SESIONES (TOKEN BLACKLIST / LOGOUT)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_exp ON revoked_tokens(expires_at);
