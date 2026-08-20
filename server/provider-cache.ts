/**
 * PROVIDER CACHE — one guard in front of every rate-limited upstream.
 *
 * The platform makes ~72 distinct Yahoo calls plus CBOE chains, and on boot several
 * scanners request the SAME symbol at the same moment. The providers answer with 429s,
 * every retry queues, and unrelated endpoints (charts, convictions) stall behind the
 * storm — which reads to a user as "the app hangs".
 *
 * Two mechanisms, both cheap:
 *   • COALESCE — concurrent callers for an identical key share ONE in-flight request.
 *   • TTL CACHE — repeat calls inside the window are served from memory.
 *
 * Neither costs accuracy on delayed/daily data, and together they turn N duplicate
 * requests per symbol into one.
 */
import { logger } from './logger';

interface Entry<T> { data: T; expiresAt: number }

const _cache = new Map<string, Entry<any>>();
const _inflight = new Map<string, Promise<any>>();
const MAX_ENTRIES = 800;

function prune() {
  if (_cache.size <= MAX_ENTRIES) return;
  const sorted = Array.from(_cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < Math.ceil(MAX_ENTRIES * 0.2); i++) {
    if (sorted[i]) _cache.delete(sorted[i][0]);
  }
}

/**
 * Run `fetcher` under the given cache key, coalescing concurrent callers.
 * A thrown fetcher error is NOT cached — failures must be retryable.
 */
export async function cachedFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) return hit.data as T;

  const inflight = _inflight.get(key);
  if (inflight) return inflight as Promise<T>;

  const p = fetcher()
    .then((data) => {
      _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
      prune();
      return data;
    })
    .finally(() => { _inflight.delete(key); });

  _inflight.set(key, p);
  return p;
}

/** Serve stale data rather than nothing when the upstream is rate-limiting us. */
export async function cachedFetchWithStale<T>(
  key: string, ttlMs: number, staleMs: number, fetcher: () => Promise<T>,
): Promise<T> {
  try {
    return await cachedFetch(key, ttlMs, fetcher);
  } catch (err) {
    const stale = _cache.get(key);
    if (stale && Date.now() - stale.expiresAt < staleMs) {
      logger.warn(`[PROVIDER-CACHE] ${key}: upstream failed, serving stale`);
      return stale.data as T;
    }
    throw err;
  }
}

export function providerCacheStats() {
  return { cached: _cache.size, inflight: _inflight.size };
}
