-- migrations/003_add_idempotency_keys.sql
-- Migración 003: Soporte para Idempotencia HTTP y Prevención de Doble Despacho

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_headers TEXT,
  response_body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
