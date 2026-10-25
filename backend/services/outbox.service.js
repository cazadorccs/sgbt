// backend/services/outbox.service.js
// Implementación del Patrón Transaccional Outbox para desacoplamiento y sincronización resiliente SQLite -> Supabase Cloud

const { db } = require('../db');
const crypto = require('crypto');

// Asegurar que la tabla outbox_events exista en el motor local
function initOutboxTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events (status, created_at);
    `);
  } catch (err) {
    console.warn('[OUTBOX INIT WARNING]', err.message);
  }
}

initOutboxTable();

/**
 * Encola un evento transaccional dentro del flujo de negocio
 */
function enqueueEvent(eventType, aggregateType, aggregateId, payload) {
  const eventId = crypto.randomUUID();
  try {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    db.prepare(`
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, payload, status, retry_count, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP)
    `).run(eventId, eventType, aggregateType, aggregateId, payloadStr);

    return { success: true, eventId };
  } catch (err) {
    console.error('[OUTBOX ENQUEUE ERROR]', err);
    return { success: false, error: err.message };
  }
}

/**
 * Procesa eventos pendientes y los despacha a Supabase Cloud con reintentos controlados
 */
async function processPendingEvents(batchSize = 50) {
  let supabase = null;
  let isConfigured = false;
  try {
    const supaModule = require('../supabase');
    isConfigured = supaModule.isSupabaseConfigured();
    supabase = supaModule.supabase;
  } catch (e) {
    return { dispatched: 0, reason: 'Supabase module not ready' };
  }

  if (!isConfigured || !supabase) {
    return { dispatched: 0, reason: 'Supabase not configured (operating in local-only mode)' };
  }

  const events = db.prepare(`
    SELECT id, event_type, aggregate_type, aggregate_id, payload, retry_count
    FROM outbox_events
    WHERE status IN ('pending', 'failed') AND retry_count < 5
    ORDER BY created_at ASC
    LIMIT ?
  `).all(batchSize);

  if (!events || events.length === 0) {
    return { dispatched: 0, pending: 0 };
  }

  let dispatchedCount = 0;

  for (const ev of events) {
    try {
      const data = JSON.parse(ev.payload);
      let targetTable = null;

      if (ev.aggregate_type === 'delivery') targetTable = 'deliveries';
      else if (ev.aggregate_type === 'worker') targetTable = 'workers';
      else if (ev.aggregate_type === 'entitlement') targetTable = 'daily_entitlements';
      else if (ev.aggregate_type === 'combo') targetTable = 'combos';

      if (targetTable) {
        const { error } = await supabase.from(targetTable).upsert(data, { onConflict: 'id' });
        if (error) throw error;
      }

      db.prepare(`
        UPDATE outbox_events
        SET status = 'processed', processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(ev.id);

      dispatchedCount++;
    } catch (sendErr) {
      db.prepare(`
        UPDATE outbox_events
        SET status = 'failed', retry_count = retry_count + 1, last_error = ?
        WHERE id = ?
      `).run(sendErr.message, ev.id);
    }
  }

  return { dispatched: dispatchedCount, processedBatch: events.length };
}

/**
 * Estadísticas de salud de la cola de eventos Outbox
 */
function getOutboxStats() {
  try {
    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COUNT(*) as total
      FROM outbox_events
    `).get();

    return {
      pending: stats.pending || 0,
      processed: stats.processed || 0,
      failed: stats.failed || 0,
      total: stats.total || 0,
      healthy: (stats.failed || 0) === 0
    };
  } catch (err) {
    return { pending: 0, processed: 0, failed: 0, total: 0, healthy: true, error: err.message };
  }
}

module.exports = {
  enqueueEvent,
  processPendingEvents,
  getOutboxStats
};
