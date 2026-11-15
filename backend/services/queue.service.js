// backend/services/queue.service.js
// ============================================================================
// SISTEMA DE COLAS DE MENSAJES Y WORKERS ASÍNCRONOS (Fase 4)
// Desacopla tareas computacionalmente pesadas o de red del ciclo HTTP:
// - Notificaciones Web Push masivas en micro-lotes
// - Sincronización Outbox en segundo plano
// - Generación de sellos criptográficos SHA-256
// - Recálculo de árboles Merkle para carnet digital
// ============================================================================

const crypto = require('crypto');

const JOB_TYPES = {
  PUSH_BROADCAST: 'PUSH_BROADCAST',
  OUTBOX_SYNC: 'OUTBOX_SYNC',
  AUDIT_MERKLE_REFRESH: 'AUDIT_MERKLE_REFRESH',
  GENERATE_ACTA_SEAL: 'GENERATE_ACTA_SEAL',
  GENERIC_TASK: 'GENERIC_TASK'
};

class QueueService {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 2;
    this.jobs = new Map();
    this.queue = [];
    this.delayedJobs = new Set();
    this.activeWorkers = 0;
    this.handlers = new Map();
    this.totalProcessed = 0;
    this.completedCount = 0;
    this.failedCount = 0;
    this._isProcessing = false;

    this._registerDefaultHandlers();
  }

  _registerDefaultHandlers() {
    // 1. Manejador de notificaciones Web Push masivas
    this.registerHandler(JOB_TYPES.PUSH_BROADCAST, async (job) => {
      const { dispatchPushNotification } = require('./push.service');
      const { payload, targetWorkerId } = job.payload;
      return await dispatchPushNotification(payload, targetWorkerId);
    });

    // 2. Manejador de sincronización Outbox en segundo plano
    this.registerHandler(JOB_TYPES.OUTBOX_SYNC, async (job) => {
      const { processPendingEvents } = require('./outbox.service');
      const batchSize = job.payload?.batchSize || 50;
      return await processPendingEvents(batchSize);
    });

    // 3. Manejador de recálculo de árbol Merkle
    this.registerHandler(JOB_TYPES.AUDIT_MERKLE_REFRESH, async (job) => {
      const { generateSha256IntegritySeal } = require('./audit.service');
      const input = job.payload?.data || Date.now().toString();
      return { seal: generateSha256IntegritySeal(input), refreshedAt: new Date().toISOString() };
    });

    // 4. Manejador de generación de sellos criptográficos pesados
    this.registerHandler(JOB_TYPES.GENERATE_ACTA_SEAL, async (job) => {
      const content = typeof job.payload === 'string' ? job.payload : JSON.stringify(job.payload);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return { hash, size: content.length, timestamp: new Date().toISOString() };
    });

    // 5. Manejador genérico de prueba / tareas arbitrarias
    this.registerHandler(JOB_TYPES.GENERIC_TASK, async (job) => {
      if (typeof job.payload?.fn === 'function') {
        return await job.payload.fn();
      }
      return { status: 'processed', payload: job.payload };
    });
  }

  /**
   * Registra un manejador para un tipo específico de trabajo
   * @param {string} type
   * @param {Function} handlerFn
   */
  registerHandler(type, handlerFn) {
    this.handlers.set(type, handlerFn);
  }

  /**
   * Encola un nuevo trabajo para procesamiento asíncrono en segundo plano
   * @param {string} type - Uno de los valores de JOB_TYPES
   * @param {any} payload
   * @param {Object} options { maxRetries: 3, delayMs: 0 }
   * @returns {Object} { id, type, status, createdAt }
   */
  addJob(type, payload, options = {}) {
    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      type,
      payload,
      status: 'queued',
      attempts: 0,
      maxRetries: options.maxRetries !== undefined ? options.maxRetries : 3,
      delayMs: options.delayMs || 0,
      error: null,
      result: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };

    this.jobs.set(jobId, job);

    if (job.delayMs > 0) {
      this.delayedJobs.add(jobId);
      const timer = setTimeout(() => {
        this.delayedJobs.delete(jobId);
        this.queue.push(jobId);
        this._scheduleProcessing();
      }, job.delayMs);
      if (timer.unref) timer.unref();
    } else {
      this.queue.push(jobId);
      this._scheduleProcessing();
    }

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt
    };
  }

  /**
   * Obtiene la información y estado de un trabajo
   * @param {string} jobId
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  _scheduleProcessing() {
    setImmediate(() => {
      this._processNext();
    });
  }

  async _processNext() {
    if (this.activeWorkers >= this.concurrency) return;
    if (this.queue.length === 0) return;

    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'queued') return;

    this.activeWorkers++;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    job.attempts++;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'failed';
      job.error = `No hay manejador registrado para el tipo de trabajo: ${job.type}`;
      job.completedAt = new Date().toISOString();
      this.activeWorkers--;
      this.failedCount++;
      this._scheduleProcessing();
      return;
    }

    try {
      const result = await handler(job);
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date().toISOString();
      this.completedCount++;
      this.totalProcessed++;
    } catch (err) {
      job.error = err.message;
      if (job.attempts < job.maxRetries) {
        job.status = 'queued';
        // Backoff exponencial: 50ms, 100ms, 200ms...
        const retryDelay = Math.min(2000, 50 * Math.pow(2, job.attempts - 1));
        this.delayedJobs.add(job.id);
        const retryTimer = setTimeout(() => {
          this.delayedJobs.delete(job.id);
          this.queue.push(job.id);
          this._scheduleProcessing();
        }, retryDelay);
        if (retryTimer.unref) retryTimer.unref();
      } else {
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
        this.failedCount++;
        this.totalProcessed++;
      }
    } finally {
      this.activeWorkers--;
      this._scheduleProcessing();
    }
  }

  /**
   * Espera a que la totalidad de los trabajos pendientes se hayan procesado
   * @returns {Promise<void>}
   */
  async drain(timeoutMs = 10000) {
    const start = Date.now();
    while (this.queue.length > 0 || this.activeWorkers > 0 || this.delayedJobs.size > 0) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout agotado (${timeoutMs}ms) esperando vaciado de la cola de tareas`);
      }
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /**
   * Retorna métricas en tiempo real de la cola y workers
   */
  getQueueStatus() {
    return {
      activeWorkers: this.activeWorkers,
      pendingJobs: this.queue.length,
      delayedJobs: this.delayedJobs.size,
      completedJobs: this.completedCount,
      failedJobs: this.failedCount,
      totalProcessed: this.totalProcessed,
      totalRegistered: this.jobs.size,
      concurrencyLimit: this.concurrency,
      supportedJobTypes: Object.values(JOB_TYPES)
    };
  }

  /**
   * Limpia la cola y el historial de trabajos
   */
  clear() {
    this.queue = [];
    this.delayedJobs.clear();
    this.jobs.clear();
    this.activeWorkers = 0;
    this.totalProcessed = 0;
    this.completedCount = 0;
    this.failedCount = 0;
  }
}

const queue = new QueueService();

module.exports = {
  JOB_TYPES,
  QueueService,
  queue
};
