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
 *   - Concurrent callers for the same FILE share one in-flight read.
 *   - ONE cached payload per file (2026-10-30): trimmed to the widest horizon
 *     any caller asked for (never narrower than 120 d / the default reader's),
 *     cached 60 s; a narrower horizon is a filtered view of it. Before, the
 *     cache was keyed `${file}|${maxDays}`, so _SPX was downloaded and parsed
 *     three times a minute (maxDays 0 by the sniper, 60 by the GEX/contract
 *     readers, 120 by the options fallback) — ~100 MB of transient RSS each.
 *   - The far-dated bulk is garbage the moment parsing ends.
 *   - Index price reads use the quote endpoint (~0.5 KB), never the chain.
 *
 * Shape: returns CBOE's own `{ data: {...} }` payload with `data.options`
 * trimmed to the caller's horizon, so existing parsers keep working unchanged.
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

/** Horizon stored per file: the request, but never narrower than 120 d or the default reader's. */
export function storeDaysFor(symbol: string, requested: number): number {
  if (!Number.isFinite(requested)) return requested;
  return Math.max(requested, defaultMaxDays(symbol), 120);
}

type Loaded = { status: number; payload: any | null; fetchedAt: number };
/** Cached per FILE: the payload trimmed to `days`. */
type Stored = Loaded & { days: number };

const cache = new BoundedCache<string, Stored>({
  name: 'cboe.loader', maxEntries: 24, ttlMs: 60_000, maxBytes: 64 * 1024 * 1024,
  sizeOf: (v) => 2048 + (v.payload?.data?.options?.length ?? 0) * 700,
});
const inflight = new Map<string, Promise<Stored>>();
let downloads = 0;

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

/** Contracts expiring within [0, maxDays] days; unparseable symbols are kept. Pure. */
export function trimOptions(options: any[], maxDays: number, nowMs = Date.now()): any[] {
  if (!Number.isFinite(maxDays) || !options.length) return options;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return options.filter((o) => {
    const d = daysToExpiry(String(o?.option ?? ''), today);
    return d === null || (d >= 0 && d <= maxDays);
  });
}

/** A caller's view of a stored file: same payload shape, options narrowed to its horizon (rows shared). */
function view(s: Stored, maxDays: number): Loaded {
  if (!s.payload || maxDays >= s.days) return { status: s.status, payload: s.payload, fetchedAt: s.fetchedAt };
  const options: any[] = s.payload?.data?.options ?? [];
  return { status: s.status, payload: { ...s.payload, data: { ...s.payload.data, options: trimOptions(options, maxDays) } }, fetchedAt: s.fetchedAt };
}

export async function loadCboeChain(symbol: string, opts: { maxDays?: number; timeoutMs?: number } = {}): Promise<Loaded> {
  const key = cboeKey(symbol);
  const maxDays = opts.maxDays ?? defaultMaxDays(symbol);
  const hit = cache.get(key);
  if (hit && hit.days >= maxDays) return view(hit, maxDays);
  const running = inflight.get(key);
  if (running) {
    const r = await running;
    if (!r.payload || r.days >= maxDays) return view(r, maxDays);
  }

  const days = storeDaysFor(symbol, maxDays);
  const p: Promise<Stored> = exclusive(() => rateLimited('cboe', 350, async (): Promise<Stored> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    try {
      downloads++;
      const r = await fetch(`${BASE}/options/${encodeURIComponent(key)}.json`, { headers: HEADERS, redirect: 'follow', signal: controller.signal });
      const fetchedAt = Date.now();
      if (!r.ok) return { status: r.status, payload: null, fetchedAt, days };
      const j: any = await r.json();
      const options: any[] = j?.data?.options ?? [];
      if (options.length) j.data.options = trimOptions(options, days);
      return { status: r.status, payload: j, fetchedAt, days };
    } catch {
      return { status: 0, payload: null, fetchedAt: Date.now(), days };
    } finally {
      clearTimeout(timer);
    }
  }))
    .then((res) => { if (res.payload) cache.set(key, res); return res; })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return view(await p, maxDays);
}

/** Test seams: file downloads so far, and a cache reset. */
export function __cboeLoaderDownloads(): number { return downloads; }
export function __resetCboeLoader(): void { cache.clear(); inflight.clear(); downloads = 0; }

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
