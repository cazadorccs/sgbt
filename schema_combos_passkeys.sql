-- =============================================================================
-- ESPECIFICACIÓN TÉCNICA: ESQUEMA DE BASE DE DATOS POSTGRESQL
-- Sistema Institucional de Beneficios Alimenticios (Víveres y Proteína) con Passkeys
-- =============================================================================

-- Habilitar extensión para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TIPOS ENUM
-- -----------------------------------------------------------------------------

CREATE TYPE worker_status_enum AS ENUM ('active', 'suspended', 'terminated');
CREATE TYPE worker_type_enum AS ENUM ('activo', 'jubilado', 'pensionado', 'contratado');
CREATE TYPE combo_category_enum AS ENUM ('bolsa_viveres', 'combo_proteico', 'utiles_escolares', 'combo_higienico', 'dotacion_uniformes', 'combo_navideno', 'combo_salud', 'combo_especial');
CREATE TYPE entitlement_shift_enum AS ENUM ('mañana', 'tarde', 'noche', 'jornada_continua');
CREATE TYPE entitlement_status_enum AS ENUM ('pending', 'claimed', 'expired');
CREATE TYPE nfc_card_status_enum AS ENUM ('active', 'revoked', 'lost');
CREATE TYPE verification_method_enum AS ENUM ('passkey_qr', 'nfc_card', 'supervisor_override');

-- -----------------------------------------------------------------------------
-- 2. IDENTIDAD Y AUTENTICACIÓN BIOMÉTRICA (PASSKEYS & CONTINGENCIAS)
-- -----------------------------------------------------------------------------

-- Dependencias / Direcciones Generales Ministeriales
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Beneficiarios (Personal Activo, Contratado y Jubilados)
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id VARCHAR(20) NOT NULL UNIQUE, -- Cédula venezolana (V- / E-)
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    status worker_status_enum NOT NULL DEFAULT 'active',
    worker_type worker_type_enum NOT NULL DEFAULT 'activo',
    has_smartphone BOOLEAN NOT NULL DEFAULT TRUE,
    contingency_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Credenciales Passkey (FIDO2 / WebAuthn)
CREATE TABLE passkey_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    sign_count BIGINT NOT NULL DEFAULT 0,
    device_name VARCHAR(100),
    transports TEXT[] DEFAULT ARRAY['internal'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tarjetas Físicas NFC / RFID para Contingencia y Jubilados
CREATE TABLE nfc_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    card_uid VARCHAR(100) NOT NULL UNIQUE,
    status nfc_card_status_enum NOT NULL DEFAULT 'active',
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. CATÁLOGO DE COMBOS Y ASIGNACIÓN DE DERECHOS EN JORNADAS
-- -----------------------------------------------------------------------------

-- Catálogo de Beneficios Alimenticios (Víveres, Proteínas, Especiales)
CREATE TABLE combos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category combo_category_enum NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Asignación de Derechos por Jornada
CREATE TABLE daily_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE RESTRICT,
    valid_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift entitlement_shift_enum NOT NULL DEFAULT 'jornada_continua',
    status entitlement_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. CONTROL DE DESPACHO Y PUNTOS DE ENTREGA EN ALMACÉN
-- -----------------------------------------------------------------------------

-- Puntos de Entrega y Almacenes
CREATE TABLE distribution_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    location_code VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Registro de Entregas Físicas y Validación Criptográfica / Contingencias
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entitlement_id UUID NOT NULL REFERENCES daily_entitlements(id) ON DELETE RESTRICT,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    distribution_point_id UUID NOT NULL REFERENCES distribution_points(id) ON DELETE RESTRICT,
    delivered_by_user_id UUID,
    verification_method verification_method_enum NOT NULL DEFAULT 'passkey_qr',
    signature_proof TEXT, -- NULL cuando el método es supervisor_override o nfc_card
    challenge_nonce VARCHAR(64),
    supervisor_id UUID REFERENCES workers(id) ON DELETE SET NULL, -- Obligatorio cuando verification_method = 'supervisor_override'
    override_reason VARCHAR(255),
    is_offline_sync BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 5. ÍNDICES Y RESTRICCIONES ANTI-FRAUDE E IDEMPOTENCIA
-- -----------------------------------------------------------------------------

-- Regla de Oro: Impide doble retiro del mismo combo asignado a un beneficiario
CREATE UNIQUE INDEX idx_unique_daily_claim ON deliveries (worker_id, entitlement_id);

-- Índices de rendimiento
CREATE INDEX idx_workers_document ON workers (document_id);
CREATE INDEX idx_workers_type ON workers (worker_type);
CREATE INDEX idx_passkey_worker ON passkey_credentials (worker_id);
CREATE INDEX idx_nfc_cards_worker ON nfc_cards (worker_id);
CREATE INDEX idx_nfc_cards_uid ON nfc_cards (card_uid);
CREATE INDEX idx_entitlements_worker_date ON daily_entitlements (worker_id, valid_date, status);
CREATE INDEX idx_deliveries_delivered_at ON deliveries (delivered_at);
CREATE INDEX idx_deliveries_offline ON deliveries (is_offline_sync) WHERE is_offline_sync = TRUE;
CREATE INDEX idx_deliveries_verification_method ON deliveries (verification_method);

-- -----------------------------------------------------------------------------
-- 6. DATOS INICIALES (SEMILLA MINISTERIAL)
-- -----------------------------------------------------------------------------

INSERT INTO departments (name, code) VALUES 
('Dirección General de Gestión Humana', 'DGGH-01'),
('Dirección General de Comunicación Digital', 'DGCD-02'),
('Coordinación de Jubilados y Pensionados', 'CJP-03');

INSERT INTO combos (name, description, category, is_active) VALUES 
('Bolsa de Víveres Secos', '12 rubros: Harina de maíz, arroz, pasta, caraotas negras, aceite, azúcar, leche', 'bolsa_viveres', TRUE),
('Combo Proteico', 'Proteínas frescas: Pollo beneficiado, carne de res molida y mortadela', 'combo_proteico', TRUE),
('Combo Escolar "Paso a Clases"', 'Kits escolares: 6 cuadernos, morral tricolor, lápices, colores, juego de geometría', 'utiles_escolares', TRUE),
('Combo Higiénico y Aseo', 'Aseo personal: 4 jabones, 2 cremas dentales, 2 champús, papel higiénico, detergente', 'combo_higienico', TRUE),
('Combo Especial Navideño', 'Pernil navideño, jamón planchado, aceitunas y alcaparras', 'combo_navideno', TRUE);

INSERT INTO distribution_points (name, location_code) VALUES 
('Almacén Central - Sótano 1 (Sede Principal)', 'ALM-S1'),
('Mesa de Despacho 2 (Auditorio Principal)', 'MESA-AUD');
