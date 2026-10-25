-- migrations/002_add_extended_combo_fields.sql
-- Migración 002: Campos extendidos para combos alimenticios, trabajadores y campañas

-- Extensión de información de trabajadores
ALTER TABLE workers ADD COLUMN job_title TEXT DEFAULT '';
ALTER TABLE workers ADD COLUMN hire_date TEXT DEFAULT '';

-- Extensión de catálogo de combos alimenticios
ALTER TABLE combos ADD COLUMN items_detail TEXT DEFAULT '';
ALTER TABLE combos ADD COLUMN icon TEXT DEFAULT '🍱';
ALTER TABLE combos ADD COLUMN mesa_number INTEGER DEFAULT 1;
ALTER TABLE combos ADD COLUMN mesa_name TEXT DEFAULT '';
ALTER TABLE combos ADD COLUMN conservation TEXT DEFAULT 'Ambiente';
ALTER TABLE combos ADD COLUMN target_qty TEXT DEFAULT '1';
ALTER TABLE combos ADD COLUMN weight_kg REAL DEFAULT 14.0;

-- Extensión de relaciones en entregas y asignaciones
ALTER TABLE deliveries ADD COLUMN campaign_id TEXT REFERENCES delivery_campaigns(id);
ALTER TABLE daily_entitlements ADD COLUMN campaign_id TEXT REFERENCES delivery_campaigns(id);

-- Configuración de banderas de tenant
ALTER TABLE tenant_settings ADD COLUMN is_initialized INTEGER DEFAULT 1;
ALTER TABLE tenant_settings ADD COLUMN is_demo_mode INTEGER DEFAULT 0;
ALTER TABLE tenant_settings ADD COLUMN supervisor_qr_mode INTEGER DEFAULT 0;
