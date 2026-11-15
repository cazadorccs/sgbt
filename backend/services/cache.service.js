// backend/services/cache.service.js
// ============================================================================
// SERVICIO DE CACHÉ DISTRIBUIDO CON FALLBACK EN MEMORIA (Arquitectura v2.0)
// Soporta Upstash Redis REST (Serverless Edge), Redis TCP y Fallback en Memoria
// ============================================================================

class CacheService {
  constructor() {
    this.memoryStore = new Map();
    this.hits = 0;
    this.misses = 0;
    this.engine = 'memory';

    this.upstashUrl = process.env.UPSTASH_REDIS_REST_URL || null;
    this.upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || null;

    this.redisUrl = process.env.REDIS_URL || null;
    this.redisClient = null;

    if (this.upstashUrl && this.upstashToken) {
      this.engine = 'upstash';
      console.log('[CACHE] Motor activo: Upstash Redis REST (Serverless Edge)');
    } else if (this.redisUrl) {
      try {
        const IORedis = require('ioredis');
        this.redisClient = new IORedis(this.redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          lazyConnect: true
        });
        this.redisClient.connect().catch((err) => {
          console.warn('[CACHE WARN] Fallo al conectar a Redis TCP, degradando a memoria:', err.message);
          this.engine = 'memory';
        });
        this.engine = 'redis';
        console.log('[CACHE] Motor activo: Redis TCP Client');
      } catch (err) {
        this.engine = 'memory';
      }
    } else {
      this.engine = 'memory';
    }

    // Temporizador de desalojo de claves expiradas en memoria (cada 60s)
    const pruneTimer = setInterval(() => {
      this._pruneExpiredMemory();
    }, 60000);
    if (pruneTimer.unref) pruneTimer.unref();
  }

  _pruneExpiredMemory() {
    const now = Date.now();
    for (const [k, v] of this.memoryStore.entries()) {
      if (v.expiresAt && v.expiresAt <= now) {
        this.memoryStore.delete(k);
      }
    }
  }

  async _upstashExec(command) {
    if (!this.upstashUrl || !this.upstashToken) return null;
    try {
      const res = await fetch(this.upstashUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.upstashToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(command)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.result;
    } catch (e) {
      console.warn('[CACHE UPSTASH ERR]', e.message);
      return null;
    }
  }

  /**
   * Obtiene un valor desde el caché (deserializa JSON automáticamente)
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    if (!key) return null;

    // 1. Upstash Redis REST
    if (this.engine === 'upstash') {
      try {
        const val = await this._upstashExec(['GET', key]);
        if (val !== null && val !== undefined) {
          this.hits++;
          try { return JSON.parse(val); } catch (e) { return val; }
        }
      } catch (e) {
        // Fallback inmediato a memoria
      }
    }

    // 2. Redis TCP Client
    if (this.engine === 'redis' && this.redisClient && this.redisClient.status === 'ready') {
      try {
        const val = await this.redisClient.get(key);
        if (val !== null && val !== undefined) {
          this.hits++;
          try { return JSON.parse(val); } catch (e) { return val; }
        }
      } catch (e) {
        // Fallback inmediato a memoria
      }
    }

    // 3. Fallback Local en Memoria (con comprobación de TTL)
    const item = this.memoryStore.get(key);
    if (item) {
      if (item.expiresAt && item.expiresAt <= Date.now()) {
        this.memoryStore.delete(key);
        this.misses++;
        return null;
      }
      this.hits++;
      return item.value;
    }

    this.misses++;
    return null;
  }

  /**
   * Almacena un valor en el caché con tiempo de vida (TTL en segundos)
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds - Predeterminado 60 segundos
   */
  async set(key, value, ttlSeconds = 60) {
    if (!key) return false;
    const ttl = Math.max(1, parseInt(ttlSeconds, 10) || 60);
    const serialized = JSON.stringify(value);

    // Siempre guardar en memoria como soporte / fallback local inmediato
    this.memoryStore.set(key, {
      value,
      expiresAt: Date.now() + (ttl * 1000)
    });

    // 1. Upstash Redis REST
    if (this.engine === 'upstash') {
      try {
        await this._upstashExec(['SET', key, serialized, 'EX', ttl]);
      } catch (e) {}
    }

    // 2. Redis TCP
    if (this.engine === 'redis' && this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.set(key, serialized, 'EX', ttl);
      } catch (e) {}
    }

    return true;
  }

  /**
   * Elimina una clave del caché
   * @param {string} key
   */
  async del(key) {
    if (!key) return false;
    this.memoryStore.delete(key);

    if (this.engine === 'upstash') {
      try { await this._upstashExec(['DEL', key]); } catch (e) {}
    }

    if (this.engine === 'redis' && this.redisClient && this.redisClient.status === 'ready') {
      try { await this.redisClient.del(key); } catch (e) {}
    }

    return true;
  }

  /**
   * Invalida todas las claves que coincidan con un prefijo o patrón
   * @param {string} pattern - Ejemplo: 'kpis:*', 'campaigns:*', 'tenant:*'
   */
  async delPattern(pattern) {
    if (!pattern) return 0;
    let count = 0;

    // Invalida en memoria local
    const regexPattern = new RegExp('^' + pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$');
    for (const k of Array.from(this.memoryStore.keys())) {
      if (regexPattern.test(k)) {
        this.memoryStore.delete(k);
        count++;
      }
    }

    // Invalida en Upstash
    if (this.engine === 'upstash') {
      try {
        const keys = await this._upstashExec(['KEYS', pattern]);
        if (Array.isArray(keys) && keys.length > 0) {
          for (const k of keys) {
            await this._upstashExec(['DEL', k]);
          }
        }
      } catch (e) {}
    }

    // Invalida en Redis TCP
    if (this.engine === 'redis' && this.redisClient && this.redisClient.status === 'ready') {
      try {
        const keys = await this.redisClient.keys(pattern);
        if (Array.isArray(keys) && keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (e) {}
    }

    return count;
  }

  /**
   * Patrón Cache-Aside: Retorna del caché si existe; si no, ejecuta fetcherFn,
   * guarda el resultado y lo retorna.
   * @param {string} key
   * @param {number} ttlSeconds
   * @param {Function} fetcherFn - Función asíncrona generadora del dato
   */
  async wrap(key, ttlSeconds, fetcherFn) {
    const cached = await this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await fetcherFn();
    if (fresh !== undefined && fresh !== null) {
      await this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  /**
   * Limpia la totalidad del almacenamiento en caché
   */
  async clear() {
    this.memoryStore.clear();
    this.hits = 0;
    this.misses = 0;

    if (this.engine === 'redis' && this.redisClient && this.redisClient.status === 'ready') {
      try { await this.redisClient.flushdb(); } catch (e) {}
    }
    return true;
  }

  /**
   * Retorna estadísticas del servicio de caché
   */
  stats() {
    return {
      engine: this.engine,
      keysInMemory: this.memoryStore.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: (this.hits + this.misses) > 0 ? (this.hits / (this.hits + this.misses)).toFixed(2) : 0
    };
  }
}

const cache = new CacheService();

module.exports = {
  CacheService,
  cache
};
