/**
 * CBOE LOADER — the one place that downloads CBOE's delayed options files.
 *
 * Why (2026-09-30): with Tradier's key rejected, six modules each fetched and
 * parsed the full file on their own. _SPX.json is ~13 MB / 30,100 contracts
 * (~100–150 MB of objects once parsed), and SPX + SPY + QQQ parsed in parallel
 * pushed the worker past 1.5 GB — pm2 restarted it every 5–15 minutes and the
 * 0DTE desk lost its state each time.
 *
 * Rules:
 *   - ONE download+parse at a time, process-wide (a single-slot gate), on top
 *     of the shared 'cboe' rate limiter.
 *   - Concurrent callers for the same file share one in-flight read.
 *   - The payload is trimmed to expiries within `maxDays` before it is cached
 *     or returned, so the far-dated bulk is garbage the moment parsing ends.
 *   - Trimmed payloads are cached 60 s (delayed data; callers keep their own
 *     longer caches where they had them).
 *   - Index price reads use the quote endpoint (~0.5 KB), never the chain.
 *
 * Shape: returns CBOE's own `{ data: {...} }` payload with `data.options`
 * trimmed, so existing parsers keep working unchanged.
 */
import { rateLimited } from '../provider-cache';
import { BoundedCache } from './bounded-cache';
import { canonicalChartSymbol } from '../../shared/index-symbols';

const BASE = 'https://cdn.cboe.com/api/global/delayed_quotes';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Accept: 'application/json' };
const INDEX_ROOTS = new Set(['SPX', 'NDX', 'RUT', 'XSP', 'VIX', 'DJX']);

/** CBOE keys cash indices with a leading underscore; contracts inside keep their OCC roots. */
export function cboeKey(symbol: string): string {
  // SPXW / NDXP / ^GSPC / $SPX are the index's chain (SPXW contracts live in _SPX).
  const s = canonicalChartSymbol(symbol.replace(/^_/, '')).replace(/^\^/, '');
  return INDEX_ROOTS.has(s) ? `_${s}` : s;
}

/** Default horizon: index chains are huge and far-dated; single names are small. */
export function defaultMaxDays(symbol: string): number {
  const s = symbol.toUpperCase().replace(/^[\^_]/, '');
  if (INDEX_ROOTS.has(s)) return 60;
  if (s === 'SPY' || s === 'QQQ' || s === 'IWM') return 90;
  return 400;
}

type Loaded = { status: number; payload: any | null; fetchedAt: number };

const cache = new BoundedCache<string, Loaded>({
  name: 'cboe.loader', maxEntries: 24, ttlMs: 60_000, maxBytes: 64 * 1024 * 1024,
  sizeOf: (v) => 2048 + (v.payload?.data?.options?.length ?? 0) * 700,
});
const inflight = new Map<string, Promise<Loaded>>();

// Single-slot gate: parses never overlap.
let gate: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn);
  gate = run.catch(() => undefined);
  return run;
}

/** Days from today (UTC date) to the expiry encoded in an OCC symbol like SPXW261005C07900000. */
function daysToExpiry(occ: string, todayMs: number): number | null {
  const m = /^[A-Z]{1,6}(\d{2})(\d{2})(\d{2})[CP]\d{8}$/.exec(occ);
  if (!m) return null;
  const t = Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((t - todayMs) / 86_400_000);
}

export async function loadCboeChain(symbol: string, opts: { maxDays?: number; timeoutMs?: number } = {}): Promise<Loaded> {
  const key = cboeKey(symbol);
  const maxDays = opts.maxDays ?? defaultMaxDays(symbol);
  const ck = `${key}|${maxDays}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const running = inflight.get(ck);
  if (running) return running;

  const p = exclusive(() => rateLimited('cboe', 350, async (): Promise<Loaded> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    try {
      const r = await fetch(`${BASE}/options/${encodeURIComponent(key)}.json`, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
      const fetchedAt = Date.now();
      if (!r.ok) return { status: r.status, payload: null, fetchedAt };
      const j: any = await r.json();
      const options: any[] = j?.data?.options ?? [];
      if (Number.isFinite(maxDays) && options.length) {
        const now = new Date();
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        j.data.options = options.filter((o) => {
          const d = daysToExpiry(String(o?.option ?? ''), today);
          return d === null || (d >= 0 && d <= maxDays);
        });
      }
      return { status: r.status, payload: j, fetchedAt };
    } catch {
      return { status: 0, payload: null, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timer);
    }
  }))
    .then((res) => { if (res.payload) cache.set(ck, res); return res; })
    .finally(() => inflight.delete(ck));
  inflight.set(ck, p);
  return p;
}

/** Index / underlying quote only (~0.5 KB) — never download a chain for a price. */
export async function loadCboeQuote(symbol: string): Promise<any | null> {
  try {
    const r = await rateLimited('cboe', 350, () => fetch(`${BASE}/quotes/${encodeURIComponent(cboeKey(symbol))}.json`, { headers: HEADERS, redirect: 'follow' }));
    if (!r.ok) return null;
    const j: any = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}
