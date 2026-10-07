/**
 * GEX SNAPSHOT SERVICE
 * ====================
 * Lightweight wrapper around `calculateAggregateGammaExposure` that exposes
 * just the few fields the convictions engine needs to score directional
 * confluence (calls vs puts), with batch + caching so a build doesn't fan
 * out 50 expensive options-chain fetches.
 *
 * The full GEX result is heavy (every strike × every expiration). For
 * confluence scoring we only care about:
 *   - regime (positive_gamma / negative_gamma / neutral / transitioning)
 *   - flipPoint vs spot (distance + direction)
 *   - call wall / put wall (pin levels)
 *   - vexRegime (vol tailwind/headwind)
 *
 * Cached for 5 minutes — GEX doesn't move that fast intraday, and the user
 * sees the score, not the raw GEX.
 */

import { logger } from "./logger";
import { calculateAggregateGammaExposure } from "./gamma-exposure";
import { summarizeGammaMetrics, type GammaCompare } from "../shared/gex-adjusted";
import { BoundedCache } from './lib/bounded-cache';

export interface GexSnapshot {
  symbol: string;
  spot: number;
  flipPoint: number | null;
  callWall: number | null;
  putWall: number | null;
  /** Distance from spot to flip, signed (positive = flip is above spot). */
  flipDistancePct: number | null;
  regime: "positive_gamma" | "negative_gamma" | "neutral" | "transitioning" | null;
  vexRegime: "vol_tailwind" | "vol_headwind" | "vol_neutral" | null;
  /** Sign of total net GEX (positive = pinned, negative = volatile). */
  netGexSign: "positive" | "negative" | "neutral";
  fetchedAt: string;
  /** Share of gross GEX resting on modelled (not feed-supplied) gamma — shared/iv-fill.ts. */
  modelledGrossShare?: number | null;
  /**
   * Raw vs Δ-adjusted vs flow-signed GEX: regime and levels under each
   * (docs/GAMMA_RAW_VS_ADJUSTED.md). Context only — no scorer reads it.
   */
  gammaCompare?: GammaCompare | null;
}

interface CacheEntry {
  snap: GexSnapshot | null;
  cachedAt: number;
  /** Last failed refresh (a failure keeps the previous good snapshot — see LAST_GOOD_MAX_MS). */
  failedAt?: number;
}

const cache = new BoundedCache<string, CacheEntry>({ name: 'gex.snapshots', maxEntries: 80, ttlMs: 30 * 60_000, maxBytes: 32 * 1024 * 1024 });
const CACHE_TTL_MS = 5 * 60 * 1000;
// 12 s, was 6 s: a cold Alpaca SPY chain is ~11 paced requests (≥330 ms apart)
// plus open interest, so 6 s timed out on every cold index fetch and the null
// was then cached for the full 5 minutes — the index 0DTE scan saw "no GEX".
const REQUEST_TIMEOUT_MS = 12_000;
/** A failed fetch is retried after 30 s, not after the full TTL. */
const NULL_TTL_MS = 30_000;
/**
 * 2026-10-01 open: every SPY refresh timed out while the droplet was saturated,
 * each timeout REPLACED the last good snapshot with null, and the index engine
 * reported "no GEX snapshot" for 46 minutes. A failed refresh now keeps the
 * previous good snapshot (with its own fetchedAt — the 0DTE policies gate on
 * its age) for up to this long; only after that does the symbol read as absent.
 */
const LAST_GOOD_MAX_MS = 15 * 60_000;

/** Read-only: the cached snapshot for `symbol` with its fetch time, or null. Never fetches. */
export function peekGexSnapshot(symbol: string): { at: number; snap: GexSnapshot } | null {
  const c = cache.peek(symbol.toUpperCase());
  return c && c.snap ? { at: c.cachedAt, snap: c.snap } : null;
}

function isFresh(entry: CacheEntry | undefined, maxAgeMs = CACHE_TTL_MS, now = Date.now()): boolean {
  if (!entry) return false;
  if (entry.failedAt && now - entry.failedAt < NULL_TTL_MS) return true; // back off after a failure
  return entry.snap ? now - entry.cachedAt < maxAgeMs : now - entry.cachedAt < NULL_TTL_MS;
}

/** The snapshot a cache entry may serve: a kept last-good one expires after LAST_GOOD_MAX_MS. */
function servable(entry: CacheEntry | undefined, now = Date.now()): GexSnapshot | null {
  if (!entry?.snap) return null;
  return now - entry.cachedAt <= LAST_GOOD_MAX_MS ? entry.snap : null;
}

const TIMED_OUT = Symbol('timed-out');
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(TIMED_OUT), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(null);
    });
  });
}

type AggregateResult = Awaited<ReturnType<typeof calculateAggregateGammaExposure>>;

function toSnapshot(symbol: string, result: AggregateResult): GexSnapshot | null {
  if (!result || !Number.isFinite(result.spotPrice) || result.spotPrice <= 0) return null;

  const spot = result.spotPrice;
  const flip = typeof result.flipPoint === "number" ? result.flipPoint : null;
  const flipDistancePct = flip !== null ? ((flip - spot) / spot) * 100 : null;

  // Shared regime definition (shared/gex-regime.ts) — sign with a 5%-of-gross neutral band.
  const netSign: GexSnapshot["netGexSign"] = result.regimeRead?.regime
    ?? (result.totalNetGEX > 0.05 ? "positive" : result.totalNetGEX < -0.05 ? "negative" : "neutral");

  return {
    symbol: symbol.toUpperCase(),
    spot,
    flipPoint: flip,
    callWall: result.callWall ?? null,
    putWall: result.putWall ?? null,
    flipDistancePct: flipDistancePct !== null ? Number(flipDistancePct.toFixed(2)) : null,
    regime: (result.regime as GexSnapshot["regime"]) ?? null,
    vexRegime: (result.vexRegime as GexSnapshot["vexRegime"]) ?? null,
    netGexSign: netSign,
    fetchedAt: new Date().toISOString(),
    modelledGrossShare: result.dataQuality?.modelledGrossShare ?? null,
    gammaCompare: result.gammaMetrics ? summarizeGammaMetrics(result.gammaMetrics, spot) : null,
  };
}

/** Test seam: replaces the aggregate GEX computation and clears the cache (scripts/test-index-open.ts). */
let computeAggregate: (symbol: string) => Promise<AggregateResult> = calculateAggregateGammaExposure;
export function __setGexComputeForTest(fn: ((symbol: string) => Promise<AggregateResult>) | null): void {
  computeAggregate = fn ?? calculateAggregateGammaExposure;
  cache.clear();
}

function storeSnapshot(sym: string, snap: GexSnapshot | null, now = Date.now()): void {
  if (snap) { cache.set(sym, { snap, cachedAt: now }); return; }
  const prev = cache.peek(sym);
  // Keep the last good snapshot through a failed refresh (it carries its own age).
  if (prev?.snap && now - prev.cachedAt <= LAST_GOOD_MAX_MS) cache.set(sym, { ...prev, failedAt: now });
  else cache.set(sym, { snap: null, cachedAt: now });
}

async function fetchOne(symbol: string, timeoutMs: number): Promise<GexSnapshot | null> {
  const sym = symbol.toUpperCase();
  const p = Promise.resolve().then(() => computeAggregate(symbol)).then((r) => toSnapshot(sym, r));
  const result = await withTimeout(p, timeoutMs);
  if (result === TIMED_OUT) {
    // The chain keeps loading after we stop waiting. Before 2026-10-01 that late
    // result was thrown away (and the 60–90 s chain/aggregate caches it filled
    // had expired by the next 5-minute scan), so a slow open stayed cold. Keep it.
    p.then((late) => {
      if (!late) return;
      const cur = cache.peek(sym);
      if (cur?.snap && cur.cachedAt > Date.parse(late.fetchedAt)) return;
      cache.set(sym, { snap: late, cachedAt: Date.now() });
      logger.info(`[GEX-SNAPSHOT] ${sym}: late result cached after the ${Math.round(timeoutMs / 1000)}s wait expired`);
    }).catch(() => undefined);
    logger.warn(`[GEX-SNAPSHOT] ${sym}: aggregate GEX not ready within ${Math.round(timeoutMs / 1000)}s — chain still loading (kept for late fill)`);
    return null;
  }
  return result;
}

export interface GexBatchOptions {
  /** Parallel fetches (default 4). */
  concurrency?: number;
  /** Per-symbol wait for a cold computation (default 12 s). */
  timeoutMs?: number;
  /** Refresh a cached snapshot older than this (default 5 min). */
  maxAgeMs?: number;
}

/**
 * Batch fetch GEX snapshots with bounded concurrency (4 parallel requests
 * by default — options chains are heavy and we don't want to flood Tradier).
 * Returns a Map keyed by uppercase symbol; failed fetches are absent — unless a
 * good snapshot under 15 min old is still held, which is returned with its own
 * fetchedAt (consumers that care, like the 0DTE policies, gate on that age).
 */
export async function getGexSnapshotBatch(
  symbols: string[],
  options: number | GexBatchOptions = {},
): Promise<Map<string, GexSnapshot>> {
  const opts: GexBatchOptions = typeof options === 'number' ? { concurrency: options } : options;
  const concurrency = opts.concurrency ?? 4;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAgeMs = opts.maxAgeMs ?? CACHE_TTL_MS;
  const out = new Map<string, GexSnapshot>();
  const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  if (unique.length === 0) return out;

  // Serve from cache
  const remaining: string[] = [];
  for (const sym of unique) {
    const c = cache.get(sym);
    if (isFresh(c, maxAgeMs)) {
      const s = servable(c);
      if (s) out.set(sym, s);
    } else {
      remaining.push(sym);
    }
  }

  if (remaining.length === 0) return out;

  let i = 0;
  let okCount = 0;
  let errCount = 0;
  const workers = Array.from({ length: Math.min(concurrency, remaining.length) }, async () => {
    while (i < remaining.length) {
      const idx = i++;
      const sym = remaining[idx];
      try {
        const snap = await fetchOne(sym, timeoutMs);
        storeSnapshot(sym, snap);
        if (snap) okCount++;
        else errCount++;
      } catch {
        errCount++;
        storeSnapshot(sym, null);
      }
      const s = servable(cache.peek(sym));
      if (s) out.set(sym, s);
    }
  });
  await Promise.all(workers);

  if (okCount + errCount > 0) {
    logger.debug(
      `[GEX-SNAPSHOT] batch fetched ${okCount} ok / ${errCount} fail of ${remaining.length}`,
    );
  }
  return out;
}

export async function getGexSnapshot(symbol: string): Promise<GexSnapshot | null> {
  const m = await getGexSnapshotBatch([symbol]);
  return m.get(symbol.toUpperCase()) ?? null;
}
