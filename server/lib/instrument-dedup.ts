/**
 * Same-instrument dedup — the ONE rule every automated publisher goes through
 * (DatabaseStorage.createTradeIdea calls it; see storage.ts).
 *
 * Measured 2026-09-30: the index-scalp engine published the same IWM 279P 0DTE
 * three times in one afternoon (13:25, 14:15, 14:50 ET — all losers) and the GEX
 * scanner published CRM 220P Nov-20 twice (03:40 and 18:28, same $10.20 entry).
 * Every existing gate was a publish-time WINDOW: index-scalp passed
 * dedupWindowHours 0.5 (30 min — the three IWM rows were 50 and 35 min apart),
 * the GEX scanner's own check was 1 h and the spine default 6 h (CRM rows were
 * 14.8 h apart). None of them asked "is this exact contract already live, or did
 * it just close?" — a closed-today loser was invisible to all of them.
 *
 * Rule: reject a new idea when an existing row has the same
 *   symbol + side (long/short) + source + instrument
 * where instrument = asset type, and for options the option type + strike +
 * expiry, AND that row is either
 *   - still open (outcome_status 'open', not archived) — whatever its age, or
 *   - published, or closed, inside the lookback: 24 h; for a 0DTE contract the
 *     current ET session (the contract dies today, so "today" is its lifetime).
 *
 * A different strike/expiry/type, a stock vs an option, or the opposite side is
 * a different instrument/view and is NOT blocked.
 */

export const SAME_INSTRUMENT_LOOKBACK_HOURS = 24;

export interface DedupCandidate {
  symbol: string;
  direction: string;
  source?: string | null;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
}

export interface DedupRow extends DedupCandidate {
  id: string;
  timestamp?: string | null;
  exitDate?: string | null;
  outcomeStatus?: string | null;
  status?: string | null;
  archived?: boolean | null;
}

/** long / short — the producers spell direction half a dozen ways. */
export function normalizeSide(direction: string | null | undefined): 'long' | 'short' {
  return /bear|short|put|down|sell/i.test(String(direction ?? '')) ? 'short' : 'long';
}

/** YYYY-MM-DD of an instant in America/New_York. */
export function etDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

/** The instant 00:00 America/New_York on the ET date of `ms`. */
export function etSessionStartMs(ms: number): number {
  const day = etDate(ms);
  // ET is UTC-4 or UTC-5; try both offsets and keep the one that maps back to `day` at 00:00.
  for (const off of [4, 5]) {
    const t = Date.parse(`${day}T00:00:00Z`) + off * 3600_000;
    const hm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(t));
    if (etDate(t) === day && hm === '00:00') return t;
  }
  return Date.parse(`${day}T04:00:00Z`);
}

function expiryDay(e: string | null | undefined): string {
  return String(e ?? '').slice(0, 10);
}

/** Stable instrument identity: 'stock', 'crypto', or 'option|put|279|2026-09-30'. */
export function instrumentKey(c: DedupCandidate): string {
  const asset = String(c.assetType ?? 'stock').toLowerCase();
  if (asset !== 'option') return asset;
  const strike = Number(c.strikePrice);
  return [
    'option',
    String(c.optionType ?? '').toLowerCase(),
    Number.isFinite(strike) ? strike.toFixed(3) : '',
    expiryDay(c.expiryDate),
  ].join('|');
}

/** Is this candidate a same-session (0DTE) contract at `nowMs`? */
export function isZeroDte(c: DedupCandidate, nowMs: number): boolean {
  return String(c.assetType ?? '').toLowerCase() === 'option' && expiryDay(c.expiryDate) === etDate(nowMs);
}

/** The earliest publish/close instant that still blocks the candidate. */
export function lookbackStartMs(c: DedupCandidate, nowMs: number): number {
  return isZeroDte(c, nowMs)
    ? etSessionStartMs(nowMs)
    : nowMs - SAME_INSTRUMENT_LOOKBACK_HOURS * 3600_000;
}

function parseMs(s: string | null | undefined): number {
  if (!s) return NaN;
  return Date.parse(s);
}

/**
 * Pure: return the existing row that blocks `c`, or null. `rows` may be any
 * superset (the DB query pre-filters on symbol + source + asset type).
 */
export function findSameInstrumentDuplicate<R extends DedupRow>(
  c: DedupCandidate,
  rows: readonly R[],
  nowMs: number = Date.now(),
): { row: R; why: 'open' | 'published_recently' | 'closed_recently' } | null {
  const sym = String(c.symbol).toUpperCase();
  const side = normalizeSide(c.direction);
  const src = String(c.source ?? '').toLowerCase();
  const key = instrumentKey(c);
  const since = lookbackStartMs(c, nowMs);
  for (const r of rows) {
    if (String(r.symbol).toUpperCase() !== sym) continue;
    if (String(r.source ?? '').toLowerCase() !== src) continue;
    if (normalizeSide(r.direction) !== side) continue;
    if (instrumentKey(r) !== key) continue;
    if (r.status === 'archived' || r.archived === true) continue;
    if ((r.outcomeStatus ?? 'open') === 'open') return { row: r, why: 'open' };
    const pub = parseMs(r.timestamp);
    if (Number.isFinite(pub) && pub >= since) return { row: r, why: 'published_recently' };
    const exit = parseMs(r.exitDate);
    if (Number.isFinite(exit) && exit >= since) return { row: r, why: 'closed_recently' };
  }
  return null;
}

/** Human label for the rejection log line. */
export function describeInstrument(c: DedupCandidate): string {
  const asset = String(c.assetType ?? 'stock').toLowerCase();
  if (asset !== 'option') return `${String(c.symbol).toUpperCase()} ${asset}`;
  const t = String(c.optionType ?? '').toLowerCase() === 'put' ? 'P' : 'C';
  return `${String(c.symbol).toUpperCase()} ${c.strikePrice}${t} ${expiryDay(c.expiryDate)}`;
}

/**
 * createTradeIdea keeps its long-standing contract of returning the EXISTING
 * row on a dedup hit (58 call sites rely on it not throwing). Callers that
 * alert (Discord, websocket) ask this before announcing a "new" idea.
 */
const deduped = new WeakSet<object>();
export function markDedupedResult<T extends object>(row: T): T {
  deduped.add(row);
  return row;
}
export function isDedupedResult(row: unknown): boolean {
  return !!row && typeof row === 'object' && deduped.has(row as object);
}
