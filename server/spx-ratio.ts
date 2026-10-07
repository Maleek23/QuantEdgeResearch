/**
 * SPX / SPY RATIO — how the index engine translates SPY GEX levels into SPX.
 * ===========================================================================
 * SPX is not SPY × 10: the ratio sits near 10.05 and drifts with SPY's
 * dividend accrual, so a flat ×10 moves a 0DTE SPX strike by 25+ points. On
 * 2026-10-01 10:20 ET the Yahoo ^GSPC read failed and the engine logged
 * "using fallback SPY×10 translation" — a freshly restarted worker had nothing
 * better. Never again:
 *
 *   1. live       Yahoo ^GSPC ÷ a simultaneous SPY price (Yahoo SPY, else the
 *                 GEX snapshot spot when it is under 90 s old). Both reads must
 *                 be ≤ 90 s old. A live ratio is remembered (memory + shared
 *                 state file, so it survives a restart) with its asOf.
 *   2. last_live  the last live ratio, up to 7 days old, LABELLED with its age.
 *   3. none       nothing known → null. The caller does NOT translate: SPY
 *                 setups publish on SPY in SPY units (never a flat ×10).
 *
 * Sanity band 9.5–10.6: anything outside is a bad print, not a ratio.
 */
import { logger } from './logger';
import { readShared, writeSharedSync } from './lib/shared-state';

export const RATIO_MIN = 9.5;
export const RATIO_MAX = 10.6;
export const LIVE_MAX_AGE_MS = 90_000;
export const LAST_LIVE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const SHARED_NAME = 'spx-spy-ratio';

export interface SpxRatio {
  ratio: number;
  source: 'live' | 'last_live';
  /** ISO — when the ratio was measured live. */
  asOf: string;
  ageSec: number;
  /** Human label for theses / logs, e.g. "SPX/SPY 10.052 (live)" or "SPX/SPY 10.051 (last live 09:41 ET, 39 min old)". */
  label: string;
}

export interface RatioMemory { ratio: number; asOfMs: number }
export interface Observation { price: number; atMs: number }

export const plausibleRatio = (r: number): boolean => Number.isFinite(r) && r >= RATIO_MIN && r <= RATIO_MAX;

const etHm = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
function ageText(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 120) return `${m} min old`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h old` : `${Math.round(h / 24)} d old`;
}

/**
 * Pure resolver. `spx` / `spy` are the freshest observations available (null =
 * no read). Returns the ratio to use and the memory to store (a new live ratio)
 * — or `remember: null` when nothing new was measured.
 */
export function resolveSpxRatio(spx: Observation | null, spy: Observation | null, last: RatioMemory | null, nowMs: number): { ratio: SpxRatio | null; remember: RatioMemory | null } {
  const fresh = (o: Observation | null) => !!o && o.price > 0 && nowMs - o.atMs <= LIVE_MAX_AGE_MS && o.atMs <= nowMs + 5_000;
  if (fresh(spx) && fresh(spy)) {
    const r = spx!.price / spy!.price;
    if (plausibleRatio(r)) {
      const asOfMs = Math.min(spx!.atMs, spy!.atMs);
      return {
        ratio: { ratio: r, source: 'live', asOf: new Date(asOfMs).toISOString(), ageSec: Math.max(0, Math.round((nowMs - asOfMs) / 1000)), label: `SPX/SPY ${r.toFixed(3)} (live)` },
        remember: { ratio: r, asOfMs },
      };
    }
  }
  if (last && plausibleRatio(last.ratio) && nowMs - last.asOfMs <= LAST_LIVE_MAX_AGE_MS && last.asOfMs <= nowMs + 5_000) {
    const age = nowMs - last.asOfMs;
    return {
      ratio: { ratio: last.ratio, source: 'last_live', asOf: new Date(last.asOfMs).toISOString(), ageSec: Math.round(age / 1000), label: `SPX/SPY ${last.ratio.toFixed(3)} (last live ${etHm(last.asOfMs)} ET, ${ageText(age)})` },
      remember: null,
    };
  }
  return { ratio: null, remember: null };
}

// ─── IO ──────────────────────────────────────────────────────────────────

let memory: RatioMemory | null = null;
let hydrated = false;
function lastLive(): RatioMemory | null {
  if (!hydrated) {
    hydrated = true;
    const r = readShared<RatioMemory>(SHARED_NAME);
    if (r?.data && plausibleRatio(r.data.ratio) && Number.isFinite(r.data.asOfMs)) memory = r.data;
  }
  return memory;
}

type QuoteFn = (symbol: string) => Promise<{ currentPrice: number; fetchedAt: string } | null>;
let quoteFn: QuoteFn | null = null;
/** Test seam: replace the quote reader; `resetMemory` forgets the last live ratio. */
export function __setSpxRatioQuotesForTest(fn: QuoteFn | null, resetMemory = true): void {
  quoteFn = fn;
  if (resetMemory) { memory = null; hydrated = true; }
}

async function readQuote(symbol: string, nowMs: number, timeoutMs: number): Promise<Observation | null> {
  try {
    const fn: QuoteFn = quoteFn ?? (async (s) => (await import('./market-api')).fetchYahooFinancePrice(s));
    const q = await Promise.race([fn(symbol), new Promise<null>((r) => setTimeout(() => r(null), timeoutMs).unref?.())]);
    if (!q || !(q.currentPrice > 0)) return null;
    const atMs = Date.parse(q.fetchedAt);
    return { price: q.currentPrice, atMs: Number.isFinite(atMs) ? atMs : nowMs };
  } catch {
    return null;
  }
}

/**
 * The SPX/SPY ratio to translate with right now. `spySnapshot` is the GEX
 * snapshot's spot + fetch time (used for SPY when the Yahoo SPY read fails).
 */
export async function getSpxPerSpy(spySnapshot: Observation | null, opts: { nowMs?: number; timeoutMs?: number } = {}): Promise<SpxRatio | null> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const [spx, spyQ] = await Promise.all([readQuote('%5EGSPC', nowMs, timeoutMs), readQuote('SPY', nowMs, timeoutMs)]);
  const spy = spyQ && nowMs - spyQ.atMs <= LIVE_MAX_AGE_MS ? spyQ : spySnapshot;
  const { ratio, remember } = resolveSpxRatio(spx, spy, lastLive(), nowMs);
  if (remember) {
    memory = remember;
    writeSharedSync(SHARED_NAME, remember);
  }
  if (ratio && ratio.source !== 'live') logger.warn(`[SPX-RATIO] SPX cash quote unavailable — using ${ratio.label}`);
  if (!ratio) logger.warn('[SPX-RATIO] SPX cash quote unavailable and no live SPX/SPY ratio on record — SPY levels are NOT translated to SPX (SPY units only)');
  return ratio;
}

/** Read-only: the last live ratio on record (no request). */
export function peekSpxPerSpy(nowMs = Date.now()): SpxRatio | null {
  return resolveSpxRatio(null, null, lastLive(), nowMs).ratio;
}
