import Redis from 'ioredis';

// Enable Redis caching only when explicitly configured.
// This prevents dashboards from stalling when Redis isn't running locally.
const REDIS_URL = process.env.REDIS_URL;
const REDIS_DISABLED = String(process.env.REDIS_DISABLED || '').toLowerCase() === 'true';
const REDIS_CACHE_ENABLED = String(process.env.REDIS_CACHE_ENABLED || '').toLowerCase() === 'true';
const REDIS_ENABLED = REDIS_CACHE_ENABLED && !REDIS_DISABLED && typeof REDIS_URL === 'string' && REDIS_URL.trim() !== '';

// Keep Redis operations bounded so the API doesn't hang if Redis is unavailable.
const redis = REDIS_ENABLED
  ? new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      // Avoid background reconnect loops; we handle failures ourselves.
      retryStrategy: () => null,
      reconnectOnError: false,
      enableReadyCheck: false,
    })
  : null;

let readyPingPromise = null;
let redisUnavailableUntilMs = 0;

// Prevent ioredis from emitting "Unhandled error event" logs when Redis is down.
if (redis) {
  redis.on('error', () => {});
}
const REDIS_FAIL_COOLDOWN_MS = (() => {
  const v = Number(process.env.REDIS_FAIL_COOLDOWN_MS || '');
  // Default: 60s. During that window we skip Redis entirely.
  return Number.isFinite(v) && v > 0 ? v : 60_000;
})();

function canAttemptRedis() {
  if (!redis) return false;
  if (Date.now() < redisUnavailableUntilMs) return false;
  return true;
}

async function ensureRedisReady() {
  if (!canAttemptRedis()) return false;
  if (redis.status === 'ready') return true;
  if (redis.status === 'connecting') return true;

  if (!readyPingPromise) {
    readyPingPromise = (async () => {
      await redis.connect();
      await redis.ping();
      return true;
    })();
  }

  try {
    await readyPingPromise;
    return true;
  } catch (_) {
    redisUnavailableUntilMs = Date.now() + REDIS_FAIL_COOLDOWN_MS;
    return false;
  } finally {
    readyPingPromise = null;
  }
}

function stableQueryString(query) {
  if (!query || typeof query !== 'object') return '';
  const keys = Object.keys(query).sort();
  return keys
    .map((k) => {
      const v = query[k];
      if (Array.isArray(v)) {
        // Ensure stable ordering for multi-value query params.
        const normalized = v.slice().map(String).sort().join(',');
        return `${k}=${normalized}`;
      }
      if (v == null) return `${k}=`;
      return `${k}=${String(v)}`;
    })
    .join('&');
}

export function buildDashboardCacheKey(req, routeName) {
  const db = req.user?.databaseName ? String(req.user.databaseName) : 'unknown_db';
  const queryPart = stableQueryString(req.query);
  return `pattex:v1:dashboard:${db}:${routeName}:${queryPart}`;
}

/** Escape Redis SCAN glob metacharacters so databaseName cannot widen the match. */
function escapeRedisGlobSegment(segment) {
  return String(segment).replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/\?/g, '\\?').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export default class Cache {
  static async get(key) {
    try {
      if (!REDIS_ENABLED) return null;
      const ok = await ensureRedisReady();
      if (!ok) return null;

      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (_) {
      // Treat Redis issues as "cache miss" to keep API functional.
      return null;
    }
  }

  static async set(key, data, ttlSeconds = 3600) {
    try {
      if (!REDIS_ENABLED) return false;
      const ok = await ensureRedisReady();
      if (!ok) return false;

      const payload = JSON.stringify(data);
      await redis.set(key, payload, 'EX', ttlSeconds);
      return true;
    } catch (_) {
      return false;
    }
  }

  static async getOrSet(key, fetchFn, ttlSeconds = 3600) {
    const existing = await this.get(key);
    if (existing != null) return existing;
    const fresh = await fetchFn();
    // Cache only non-undefined responses.
    if (fresh !== undefined) await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * Remove all dashboard cache entries for a tenant (databaseName).
   * Used on logout so the next session does not reuse stale aggregated payloads.
   */
  static async invalidateDashboardForDatabase(databaseName) {
    if (!REDIS_ENABLED || databaseName == null || String(databaseName).trim() === '') return 0;
    try {
      const ok = await ensureRedisReady();
      if (!ok) return 0;
      const safeDb = escapeRedisGlobSegment(String(databaseName).trim());
      const pattern = `pattex:v1:dashboard:${safeDb}:*`;
      let cursor = '0';
      let removed = 0;
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          removed += await redis.del(...keys);
        }
      } while (cursor !== '0');
      return removed;
    } catch (_) {
      return 0;
    }
  }
}

