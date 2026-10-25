-- =============================================================================
-- ESQUEMA COMPLETO DE BASE DE DATOS PARA SUPABASE (POSTGRESQL)
-- Proyecto: Sistema Institucional de Beneficios y Combos con Passkeys (MIPPCI)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =============================================================================

-- 0. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TIPOS ENUM PERSONALIZADOS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_status_enum') THEN
        CREATE TYPE worker_status_enum AS ENUM ('active', 'suspended', 'terminated');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_type_enum') THEN
        CREATE TYPE worker_type_enum AS ENUM ('activo', 'jubilado', 'pensionado', 'contratado');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'combo_category_enum') THEN
        CREATE TYPE combo_category_enum AS ENUM (
            'bolsa_viveres', 
            'combo_proteico', 
            'utiles_escolares', 
            'combo_higienico', 
            'dotacion_uniformes', 
            'combo_navideno', 
            'combo_salud', 
            'combo_especial'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entitlement_shift_enum') THEN
        CREATE TYPE entitlement_shift_enum AS ENUM ('mañana', 'tarde', 'noche', 'jornada_continua');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entitlement_status_enum') THEN
        CREATE TYPE entitlement_status_enum AS ENUM ('pending', 'claimed', 'expired');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nfc_card_status_enum') THEN
        CREATE TYPE nfc_card_status_enum AS ENUM ('active', 'revoked', 'lost');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_method_enum') THEN
        CREATE TYPE verification_method_enum AS ENUM ('passkey_qr', 'nfc_card', 'supervisor_override');
    END IF;
END $$;

-- 2. TABLA: DEPARTAMENTOS / DIRECCIONES GENERALES
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    cost_center VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA: TRABAJADORES (BENEFICIARIOS, SUPERVISORES Y OPERADORES)
CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id VARCHAR(25) NOT NULL UNIQUE, -- Cédula venezolana (ej: V-14.892.110)
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(120) UNIQUE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    shift entitlement_shift_enum NOT NULL DEFAULT 'jornada_continua',
    status worker_status_enum NOT NULL DEFAULT 'active',
    worker_type worker_type_enum NOT NULL DEFAULT 'activo',
    role VARCHAR(30) NOT NULL DEFAULT 'worker', -- 'worker', 'operator', 'supervisor', 'admin'
    has_smartphone BOOLEAN NOT NULL DEFAULT TRUE,
    contingency_reason VARCHAR(150),
    phone_number VARCHAR(30),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA: CREDENCIALES PASSKEY (FIDO2 / WEBAUTHN)
CREATE TABLE IF NOT EXISTS passkey_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    device_name VARCHAR(100) DEFAULT 'Dispositivo Móvil',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    aaguid VARCHAR(100),
    transports TEXT[] DEFAULT ARRAY['internal'],
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- 5. TABLA: TARJETAS FÍSICAS NFC / RFID (PARA CONTINGENCIA Y JUBILADOS)
CREATE TABLE IF NOT EXISTS nfc_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    card_uid VARCHAR(100) NOT NULL UNIQUE,
    status nfc_card_status_enum NOT NULL DEFAULT 'active',
    issued_by UUID REFERENCES workers(id),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- 6. TABLA: CATÁLOGO DE COMBOS Y BENEFICIOS
CREATE TABLE IF NOT EXISTS combos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    description TEXT,
    category combo_category_enum NOT NULL DEFAULT 'bolsa_viveres',
    calories INTEGER DEFAULT 0,
    dietary_info VARCHAR(150) DEFAULT 'Estándar',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABLA: PUNTOS DE DISTRIBUCIÓN (ALMACENES Y MESAS DE ENTREGA)
CREATE TABLE IF NOT EXISTS distribution_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    location_code VARCHAR(50) NOT NULL UNIQUE,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. TABLA: ASIGNACIONES DIARIAS / DE JORNADA (DAILY ENTITLEMENTS)
CREATE TABLE IF NOT EXISTS daily_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE RESTRICT,
    valid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift entitlement_shift_enum NOT NULL DEFAULT 'jornada_continua',
    status entitlement_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_worker_daily_entitlement UNIQUE (worker_id, valid_date, shift, combo_id)
);

-- 9. TABLA: REGISTRO INALTERABLE DE ENTREGAS FÍSICAS (DELIVERIES)
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entitlement_id UUID NOT NULL REFERENCES daily_entitlements(id) ON DELETE RESTRICT,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    distribution_point_id UUID NOT NULL REFERENCES distribution_points(id) ON DELETE RESTRICT,
    delivered_by_user_id UUID REFERENCES workers(id),
    verification_method verification_method_enum NOT NULL DEFAULT 'passkey_qr',
    signature_proof TEXT,
    challenge_nonce VARCHAR(64),
    supervisor_id UUID REFERENCES workers(id) ON DELETE SET NULL,
    override_reason VARCHAR(255),
    is_offline_sync BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 10. ÍNDICE CRIPTOGRÁFICO ANTI-DUPLICIDAD ESTRICTO (REGLA DE ORO)
-- Impide de forma absoluta el doble retiro del mismo combo asignado
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_daily_claim ON deliveries (worker_id, entitlement_id);

-- Índices de aceleración
CREATE INDEX IF NOT EXISTS idx_workers_document ON workers (document_id);
CREATE INDEX IF NOT EXISTS idx_workers_type ON workers (worker_type);
CREATE INDEX IF NOT EXISTS idx_passkey_worker ON passkey_credentials (worker_id);
CREATE INDEX IF NOT EXISTS idx_nfc_cards_uid ON nfc_cards (card_uid);
CREATE INDEX IF NOT EXISTS idx_entitlements_worker_date ON daily_entitlements (worker_id, valid_date, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivered_at ON deliveries (delivered_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_offline ON deliveries (is_offline_sync) WHERE is_offline_sync = TRUE;

-- 11. TABLA: LOGS DE INGESTA DE NÓMINA Y SINCRONIZACIÓN
CREATE TABLE IF NOT EXISTS payroll_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id VARCHAR(100) NOT NULL,
    source VARCHAR(50) NOT NULL,
    records_processed INTEGER NOT NULL DEFAULT 0,
    records_failed INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'success',
    details TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 12. TRIGGER AUTOMÁTICO: Marcar asignación como 'claimed' al entregar
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_fn_mark_entitlement_claimed()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE daily_entitlements
    SET status = 'claimed'
    WHERE id = NEW.entitlement_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mark_entitlement_claimed ON deliveries;
CREATE TRIGGER trg_mark_entitlement_claimed
AFTER INSERT ON deliveries
FOR EACH ROW
EXECUTE FUNCTION trg_fn_mark_entitlement_claimed();

-- =============================================================================
-- 13. POLÍTICAS DE ACCESO (SUPABASE RLS)
-- Permite lectura y escritura a clientes con la API Key pública o service_role
-- =============================================================================
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_sync_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso de Menor Privilegio (Defense-in-Depth)
-- 1. Tablas sensibles restringidas exclusivamente al backend autenticado (service_role)
CREATE POLICY "Acceso exclusivo backend service_role" ON workers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso exclusivo backend service_role" ON passkey_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso exclusivo backend service_role" ON nfc_cards FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso exclusivo backend service_role" ON daily_entitlements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso exclusivo backend service_role" ON deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso exclusivo backend service_role" ON payroll_sync_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso exclusivo backend service_role" ON departments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Catálogos públicos de lectura para anon (solo lectura de activos)
CREATE POLICY "Lectura pública de combos activos" ON combos FOR SELECT TO anon USING (is_active = true);
CREATE POLICY "Lectura pública de sedes" ON distribution_points FOR SELECT TO anon USING (true);
CREATE POLICY "Acceso total service_role combos" ON combos FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Acceso total service_role distribution_points" ON distribution_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- 14. DATOS INICIALES (SEMILLA MINISTERIAL COMPLETA)
-- =============================================================================

INSERT INTO departments (code, name, cost_center) VALUES 
('DGGH-01', 'Dirección General de Gestión Humana', 'CC-1010'),
('DGCD-02', 'Dirección General de Comunicación Digital', 'CC-2020'),
('CJP-03', 'Coordinación de Jubilados y Pensionados (MIPPCI)', 'CC-3030')
ON CONFLICT (code) DO NOTHING;

INSERT INTO distribution_points (name, location_code, address) VALUES 
('Almacén Central - Sótano 1 (Sede Principal)', 'ALM-S1', 'Edificio Principal MIPPCI, Sótano 1'),
('Mesa de Despacho 2 (Auditorio Principal)', 'MESA-AUD', 'Planta Baja, Auditorio Principal')
ON CONFLICT (location_code) DO NOTHING;

INSERT INTO combos (name, description, category, calories, dietary_info, is_active) VALUES 
('Bolsa de Víveres Secos (12 rubros)', 'Harina de maíz, arroz, pasta, caraotas negras, aceite comestible, azúcar, leche en polvo', 'bolsa_viveres', 12000, 'Almacén Seco / Alimentos no perecederos', TRUE),
('Combo Proteico Fresco', 'Pollo beneficiado entero, carne de res molida y mortadela especial', 'combo_proteico', 6500, 'Cadena de frío / Consumo familiar', TRUE),
('Combo Escolar "Paso a Clases" MIPPCI', '6 Cuadernos engrapados, 1 Morral tricolor impermeable, 1 Caja lápices 2B, 1 Juego de geometría, 1 Caja creyones, 1 Pega blanca', 'utiles_escolares', 0, 'Almacén Seco / Logística Estándar', TRUE),
('Combo Higiénico y Aseo Personal', '4 Jabones de tocador, 2 Cremas dentales, 2 Champús, 2 Desodorantes, 4 Rollos papel higiénico, detergente 1kg', 'combo_higienico', 0, 'Almacén Seco / Logística Estándar', TRUE),
('Combo Especial Navideño', 'Pernil navideño deshuesado, jamón planchado, aceitunas y alcaparras', 'combo_navideno', 9000, 'Edición decembrina', TRUE)
ON CONFLICT DO NOTHING;
