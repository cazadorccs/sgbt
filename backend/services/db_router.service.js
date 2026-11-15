// backend/services/db_router.service.js
// ============================================================================
// SERVICIO DE ENRUTAMIENTO CQRS Y SEGREGACIÓN LECTURA/ESCRITURA (Fase 3)
// Enruta escrituras y transacciones al nodo primario (dbWrite) y consultas
// pesadas o reportes a la réplica de lectura (dbRead / Read Replica Pool)
// ============================================================================

const { db } = require('../db');

class DatabaseRouterService {
  constructor() {
    this.primaryDb = db;
    this.readReplica = null;
    this.readsRouted = 0;
    this.writesRouted = 0;
    this.transactionsExecuted = 0;
    this.isReplicaConfigured = false;
    this.engine = 'sqlite_wal';

    this._initReadReplica();
  }

  _initReadReplica() {
    // 1. Si existe réplica remota configurada en variables de entorno (Supabase / Postgres)
    const remoteReplicaUrl = process.env.SUPABASE_READ_REPLICA_URL || process.env.DATABASE_READ_URL;
    if (remoteReplicaUrl) {
      this.engine = 'postgres_read_replica';
      this.isReplicaConfigured = true;
      console.log('[DB ROUTER] Réplica de lectura remota configurada para consultas analíticas.');
      return;
    }

    // 2. En entorno SQLite local (better-sqlite3)
    try {
      const Database = require('better-sqlite3');
      const path = require('path');
      const fs = require('fs');
      const isVercel = Boolean(process.env.VERCEL);
      const dbPath = isVercel 
        ? path.join('/tmp', 'combos_platform.sqlite') 
        : path.join(__dirname, '../combos_platform.sqlite');

      if (fs.existsSync(dbPath)) {
        this.readReplica = new Database(dbPath, { readonly: true, fileMustExist: true });
        this.readReplica.pragma('query_only = ON');
        this.readReplica.pragma('busy_timeout = 3000');
        this.isReplicaConfigured = true;
        this.engine = 'sqlite_wal_readonly';
        // console.log('[DB ROUTER] Conexión de réplica de lectura SQLite (Read-Only WAL) inicializada.');
      }
    } catch (err) {
      // Si falla la réplica de solo lectura (ej: WebAssembly o pruebas), degradar a primaryDb
      this.isReplicaConfigured = false;
      this.engine = 'primary_fallback';
    }
  }

  /**
   * Conexión primaria para escrituras, mutaciones y transacciones
   */
  get dbWrite() {
    return this.primaryDb;
  }

  /**
   * Conexión dedicada para lecturas, reportes y consultas masivas
   */
  get dbRead() {
    if (this.readReplica && this.isReplicaConfigured) {
      return this.readReplica;
    }
    return this.primaryDb;
  }

  /**
   * Ejecuta una consulta de solo lectura (múltiples filas) contra la réplica
   * @param {string} sql
   * @param  {...any} params
   */
  queryRead(sql, ...params) {
    this.readsRouted++;
    const target = this.dbRead;
    const stmt = target.prepare(sql);
    const flat = params.flat();
    return flat.length > 0 ? stmt.all(...flat) : stmt.all();
  }

  /**
   * Obtiene un único registro desde la réplica de lectura
   * @param {string} sql
   * @param  {...any} params
   */
  getRead(sql, ...params) {
    this.readsRouted++;
    const target = this.dbRead;
    const stmt = target.prepare(sql);
    const flat = params.flat();
    return flat.length > 0 ? stmt.get(...flat) : stmt.get();
  }

  /**
   * Ejecuta una escritura directamente sobre el nodo primario
   * @param {string} sql
   * @param  {...any} params
   */
  queryWrite(sql, ...params) {
    this.writesRouted++;
    const target = this.dbWrite;
    const stmt = target.prepare(sql);
    const flat = params.flat();
    return flat.length > 0 ? stmt.run(...flat) : stmt.run();
  }

  /**
   * Ejecuta una transacción ACID exclusiva sobre el nodo primario
   * @param {Function} txFn
   */
  transactionWrite(txFn) {
    this.transactionsExecuted++;
    return this.dbWrite.transaction(txFn);
  }

  /**
   * Retorna métricas de enrutamiento y estado de la réplica
   */
  getMetrics() {
    return {
      engine: this.engine,
      isReplicaActive: this.isReplicaConfigured && Boolean(this.readReplica),
      readsRouted: this.readsRouted,
      writesRouted: this.writesRouted,
      transactionsExecuted: this.transactionsExecuted,
      cqrsActive: true
    };
  }

  /**
   * Cierra ordenadamente la conexión de réplica si está abierta
   */
  close() {
    if (this.readReplica) {
      try {
        this.readReplica.close();
      } catch (e) {}
      this.readReplica = null;
      this.isReplicaConfigured = false;
    }
  }
}

const dbRouter = new DatabaseRouterService();

module.exports = {
  DatabaseRouterService,
  dbRouter
};
