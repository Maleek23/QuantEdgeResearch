/**
 * BOUNDED CACHE — an LRU + TTL Map with an optional approximate byte budget.
 *
 * WHY
 * Prod runs one Node process on a 1 vCPU / 2 GB droplet that also hosts
 * Postgres. At the 2026-09-30 open it reached ~1.4 GB RSS and the box swapped.
 * The growth was module-level Maps that only ever grew: option chains (Alpaca
 * held up to 400 full chains, CBOE up to 300), 800 Yahoo chart payloads, whole
 * days of flow prints, per-symbol bar caches with no eviction at all.
 *
 * WHAT
 * `BoundedCache<K, V>` IS a Map (subclass), so a module-level
 * `new Map<K, V>()` converts in place without touching its call sites:
 *   • maxEntries  — hard cap; the least-recently-used entry is evicted first.
 *   • ttlMs       — hard retention. An entry older than this is gone (get/has
 *                   return undefined/false). Callers that keep their own
 *                   freshness stamp still check it; ttlMs only bounds how long a
 *                   stale entry can sit in memory. Set it to the longest window
 *                   a caller would still use the value (e.g. a stale-fallback).
 *   • maxBytes    — optional budget on the sum of `sizeOf(value)` estimates.
 *
 * Every cache registers itself by name so the admin System-health endpoint and
 * the memory watchdog (server/lib/memory-guard.ts) can report and trim them.
 *
 * LRU is tracked with a per-entry access stamp rather than by re-inserting on
 * read, so iterating a cache while calling get() on it can never loop forever.
 * Eviction scans for the oldest stamp — O(n), fine at the few-hundred-entry caps
 * used here.
 */

export interface BoundedCacheOptions<V> {
  /** Registry name — shown in /api/admin/hub/status and watchdog logs. */
  name: string;
  maxEntries: number;
  ttlMs?: number;
  maxBytes?: number;
  /** Approximate retained bytes of one value. Defaults to `approxBytes`. Only used when maxBytes is set or for stats. */
  sizeOf?: (v: V) => number;
  /** Skip the size estimate entirely (stats then report entries only). */
  noSizing?: boolean;
}

interface Meta { at: number; used: number; bytes: number }

export interface CacheStats {
  name: string;
  entries: number;
  maxEntries: number | null;
  approxBytes: number | null;
  maxBytes: number | null;
  ttlMs: number | null;
  evictions: number;
  expirations: number;
}

/** Anything that can report its size and be trimmed — BoundedCache, or a probe for a structure we did not convert. */
export interface CacheLike {
  readonly cacheName: string;
  stats(): CacheStats;
  /** Remove expired entries. Returns how many were removed. */
  sweep(now?: number): number;
  /** Evict least-recently-used entries until at most `fraction` of the current entries remain. Returns how many were evicted. */
  trimTo(fraction: number): number;
}

const registry = new Map<string, CacheLike>();

export function registerCache(c: CacheLike): void {
  // Re-registration under the same name (hot reload, a second import path) replaces the old handle.
  registry.set(c.cacheName, c);
}

export function listCaches(): CacheLike[] {
  return [...registry.values()];
}

/**
 * Cheap retained-size estimate. Samples at most a few elements of each array /
 * a few keys of each object and extrapolates, so estimating a 10k-contract
 * chain costs microseconds, not a full walk. Order-of-magnitude accurate — it
 * is for budgets and dashboards, not billing.
 */
export function approxBytes(v: unknown, depth = 0): number {
  if (v == null) return 8;
  switch (typeof v) {
    case 'number': return 8;
    case 'boolean': return 4;
    case 'string': return 16 + (v as string).length * 2;
    case 'function': return 0;
    case 'object': break;
    default: return 8;
  }
  if (depth > 4) return 64;
  if (v instanceof Date) return 32;
  if (Array.isArray(v)) {
    const n = v.length;
    if (n === 0) return 32;
    const sample = Math.min(n, 3);
    let s = 0;
    for (let i = 0; i < sample; i++) s += approxBytes(v[Math.floor((i * n) / sample)], depth + 1);
    return 32 + 8 * n + (s / sample) * n;
  }
  if (v instanceof Map || v instanceof Set) {
    const n = v.size;
    if (n === 0) return 64;
    let s = 0; let k = 0;
    for (const e of v as Iterable<unknown>) { s += approxBytes(e, depth + 1); if (++k >= 3) break; }
    return 64 + 24 * n + (s / k) * n;
  }
  const keys = Object.keys(v as object);
  const n = keys.length;
  if (n === 0) return 32;
  const sample = Math.min(n, 12);
  let s = 0;
  for (let i = 0; i < sample; i++) {
    const key = keys[Math.floor((i * n) / sample)];
    s += 16 + approxBytes((v as any)[key], depth + 1);
  }
  return 32 + (s / sample) * n;
}

export class BoundedCache<K, V> extends Map<K, V> implements CacheLike {
  readonly cacheName: string;
  private readonly maxEntries: number;
  private readonly ttlMs: number | null;
  private readonly maxBytes: number | null;
  private readonly sizeOf: ((v: V) => number) | null;
  private readonly meta = new Map<K, Meta>();
  private tick = 0;
  private totalBytes = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(opts: BoundedCacheOptions<V>) {
    super();
    this.cacheName = opts.name;
    this.maxEntries = Math.max(1, opts.maxEntries);
    this.ttlMs = opts.ttlMs && opts.ttlMs > 0 ? opts.ttlMs : null;
    this.maxBytes = opts.maxBytes && opts.maxBytes > 0 ? opts.maxBytes : null;
    this.sizeOf = opts.noSizing ? null : (opts.sizeOf ?? ((v: V) => approxBytes(v)));
    registerCache(this);
  }

  private expired(m: Meta | undefined, now: number): boolean {
    return !!(m && this.ttlMs != null && now - m.at > this.ttlMs);
  }

  override get(key: K): V | undefined {
    const m = this.meta.get(key);
    if (!m) return super.get(key);
    if (this.expired(m, Date.now())) { this.delete(key); this.expirations++; return undefined; }
    m.used = ++this.tick;
    return super.get(key);
  }

  override has(key: K): boolean {
    const m = this.meta.get(key);
    if (m && this.expired(m, Date.now())) { this.delete(key); this.expirations++; return false; }
    return super.has(key);
  }

  /** Read without refreshing recency or expiring (diagnostics, iteration helpers). */
  peek(key: K): V | undefined {
    return super.get(key);
  }

  override set(key: K, value: V): this {
    // Map's constructor may call set() before our fields exist; we never pass entries to super(), but be safe.
    if (!this.meta) return super.set(key, value);
    const prev = this.meta.get(key);
    if (prev) this.totalBytes -= prev.bytes;
    let bytes = 0;
    if (this.sizeOf) { try { bytes = Math.max(0, Math.round(this.sizeOf(value))) || 0; } catch { bytes = 0; } }
    this.meta.set(key, { at: Date.now(), used: ++this.tick, bytes });
    this.totalBytes += bytes;
    super.set(key, value);
    this.enforce(key);
    return this;
  }

  override delete(key: K): boolean {
    const m = this.meta.get(key);
    if (m) { this.totalBytes -= m.bytes; this.meta.delete(key); }
    return super.delete(key);
  }

  override clear(): void {
    this.meta.clear();
    this.totalBytes = 0;
    super.clear();
  }

  private evictOne(protect?: K): boolean {
    let victim: K | undefined; let best = Infinity; let found = false;
    for (const [k, m] of this.meta) {
      if (k === protect && this.meta.size > 1) continue;
      if (m.used < best) { best = m.used; victim = k; found = true; }
    }
    if (!found) return false;
    this.delete(victim as K);
    this.evictions++;
    return true;
  }

  private enforce(justSet?: K): void {
    while (super.size > this.maxEntries) { if (!this.evictOne(justSet)) break; }
    if (this.maxBytes != null) {
      // Keep at least the entry just written: a single oversized value is still better served than dropped.
      while (this.totalBytes > this.maxBytes && super.size > 1) { if (!this.evictOne(justSet)) break; }
    }
  }

  sweep(now = Date.now()): number {
    if (this.ttlMs == null) return 0;
    let n = 0;
    for (const [k, m] of [...this.meta]) {
      if (now - m.at > this.ttlMs) { this.delete(k); n++; }
    }
    this.expirations += n;
    return n;
  }

  trimTo(fraction: number): number {
    const keep = Math.max(0, Math.floor(super.size * Math.min(1, Math.max(0, fraction))));
    const order = [...this.meta].sort((a, b) => a[1].used - b[1].used);
    let n = 0;
    for (const [k] of order) {
      if (super.size <= keep) break;
      this.delete(k); n++;
    }
    this.evictions += n;
    return n;
  }

  stats(): CacheStats {
    return {
      name: this.cacheName,
      entries: super.size,
      maxEntries: this.maxEntries,
      approxBytes: this.sizeOf ? this.totalBytes : null,
      maxBytes: this.maxBytes,
      ttlMs: this.ttlMs,
      evictions: this.evictions,
      expirations: this.expirations,
    };
  }
}

/**
 * Register a read-only probe (plus an optional trimmer) for a structure that is
 * bounded by its own logic and was not converted — so it still shows up in the
 * admin endpoint and the watchdog.
 */
export function registerCacheProbe(
  name: string,
  probe: () => { entries: number; approxBytes?: number | null; maxEntries?: number | null },
  trim?: (fraction: number) => number,
): void {
  registerCache({
    cacheName: name,
    stats: () => {
      const p = probe();
      return {
        name, entries: p.entries, maxEntries: p.maxEntries ?? null, approxBytes: p.approxBytes ?? null,
        maxBytes: null, ttlMs: null, evictions: 0, expirations: 0,
      };
    },
    sweep: () => 0,
    trimTo: (f) => (trim ? trim(f) : 0),
  });
}
