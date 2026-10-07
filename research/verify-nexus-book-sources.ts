/**
 * OPTION-BAR SOURCE CHAIN for research/verify-nexus-book.ts — pure, injectable,
 * no side effects on import (so scripts/test-verify-book-sources.ts can drive it
 * with mocked HTTP).
 *
 *   contract bars:  Massive (Polygon) option aggs 1m → 5m → option trades
 *                   (rolled into 1m bars) → Alpaca 1Min (indicative) → Yahoo OPR 1m/5m
 *   expiry exits:   settlement = intrinsic from the expiry day's OFFICIAL
 *                   (unadjusted) underlying close — Massive stocks daily, then
 *                   Yahoo daily. Index roots per shared/journal-expiry (SPXW/NDXP
 *                   PM close; SPX/NDX/RUT third-Friday AM = approximate; VIX none).
 *
 * ENTITLEMENT: Massive answers a plan that does not cover an endpoint with
 * HTTP 403 / status NOT_AUTHORIZED ("not entitled"). The first refusal per
 * endpoint is recorded with its message and that endpoint is skipped for the
 * rest of the run (no wasted throttled calls); a bad key (401) stops every
 * Massive endpoint. MassiveEntitlement.report() says what was refused and why.
 *
 * READ-ONLY: GETs only. The API key travels in an Authorization header, never
 * in a URL, cache key, ledger or log line.
 */
import { intrinsicValue, settlementUnderlying } from '../shared/journal-expiry';

export type Bar = { t: number; o: number; h: number; l: number; c: number; v?: number };
export interface HttpResult { status: number; body: any }
/** Raw GET (status + body). The caller owns caching / throttling / 429 back-off. */
export type RawGet = (cacheKey: string, url: string, headers?: Record<string, string>) => Promise<HttpResult | null>;
/** Cached JSON GET (body, or { __status } on a non-2xx) — the script's existing cachedJson. */
export type JsonGet = (cacheKey: string, url: string, headers?: Record<string, string>) => Promise<any | null>;

export const MASSIVE_BASE = 'https://api.polygon.io';
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);

// ─── Massive entitlement ─────────────────────────────────────
export type MassiveEndpoint = 'optionAggs' | 'optionTrades' | 'stockDaily';
export type MassiveKind = 'ok' | 'not_entitled' | 'bad_key' | 'rate_limited' | 'not_found' | 'error';
export type EntitlementState = 'unknown' | 'ok' | 'not_entitled' | 'bad_key' | 'no_key';

/** What Massive's answer means. 403 / NOT_AUTHORIZED / "not entitled" = the plan does not cover it. */
export function classifyMassive(res: HttpResult | null): { kind: MassiveKind; message: string } {
  if (!res) return { kind: 'error', message: 'network error / no response' };
  const b = res.body ?? {};
  const message = String(b.message ?? b.error ?? b.status ?? `HTTP ${res.status}`).slice(0, 240);
  if (res.status === 401) return { kind: 'bad_key', message };
  if (res.status === 403 || b.status === 'NOT_AUTHORIZED' || /not entitled|not authorized|upgrade your plan/i.test(message)) return { kind: 'not_entitled', message };
  if (res.status === 429) return { kind: 'rate_limited', message };
  if (res.status === 404) return { kind: 'not_found', message };
  if (res.status >= 200 && res.status < 300 && (b.status == null || b.status === 'OK' || b.status === 'DELAYED')) return { kind: 'ok', message: String(b.status ?? 'OK') };
  return { kind: 'error', message };
}

export const MASSIVE_ENTITLEMENT_HINT: Record<MassiveEndpoint, string> = {
  optionAggs: 'historical option aggregates (/v2/aggs/ticker/O:…) — Massive Options plan with aggregates (Basic lists minute aggs at 5 calls/min; Starter+ removes the call cap)',
  optionTrades: 'historical option trades (/v3/trades/O:…) — Massive Options Developer or higher',
  stockDaily: 'stock daily aggregates (/v2/aggs/ticker/{SYM}/range/1/day) — any Massive Stocks plan',
};

export class MassiveEntitlement {
  readonly state: Record<MassiveEndpoint, EntitlementState>;
  readonly refusal: Partial<Record<MassiveEndpoint, { status: number; message: string }>> = {};
  calls = 0; rateLimited = 0; errors = 0;
  /** Called once per endpoint on its first refusal — the script prints it loudly. */
  onRefusal: ((ep: MassiveEndpoint, kind: 'not_entitled' | 'bad_key', status: number, message: string) => void) | null = null;
  constructor(hasKey: boolean) {
    const s: EntitlementState = hasKey ? 'unknown' : 'no_key';
    this.state = { optionAggs: s, optionTrades: s, stockDaily: s };
  }
  usable(ep: MassiveEndpoint): boolean { return this.state[ep] === 'unknown' || this.state[ep] === 'ok'; }
  /** Record an answer; returns its classification. */
  note(ep: MassiveEndpoint, res: HttpResult | null): { kind: MassiveKind; message: string } {
    this.calls++;
    const c = classifyMassive(res);
    if (c.kind === 'ok') { if (this.state[ep] === 'unknown') this.state[ep] = 'ok'; }
    else if (c.kind === 'not_entitled') {
      if (this.state[ep] !== 'not_entitled') { this.state[ep] = 'not_entitled'; this.refusal[ep] = { status: res?.status ?? 0, message: c.message }; this.onRefusal?.(ep, 'not_entitled', res?.status ?? 0, c.message); }
    } else if (c.kind === 'bad_key') {
      for (const k of Object.keys(this.state) as MassiveEndpoint[]) { if (this.state[k] !== 'bad_key') { this.state[k] = 'bad_key'; this.refusal[k] = { status: res?.status ?? 401, message: c.message }; } }
      this.onRefusal?.(ep, 'bad_key', res?.status ?? 401, c.message);
    } else if (c.kind === 'rate_limited') this.rateLimited++;
    else if (c.kind === 'error') this.errors++;
    return c;
  }
  report() {
    return {
      state: { ...this.state }, refusal: { ...this.refusal }, calls: this.calls, rateLimited: this.rateLimited, errors: this.errors,
      needs: (Object.keys(this.state) as MassiveEndpoint[]).filter((k) => this.state[k] === 'not_entitled' || this.state[k] === 'bad_key').map((k) => MASSIVE_ENTITLEMENT_HINT[k]),
    };
  }
}

// ─── deps ────────────────────────────────────────────────────
export interface ChainDeps {
  /** Massive raw GET (Authorization header added by the caller); null = no key / disabled. */
  massive: RawGet | null;
  entitlement: MassiveEntitlement;
  alpaca: { id: string; secret: string } | null;
  json: JsonGet;
  now: () => number;
}

export interface ChainAttempt { source: string; outcome: 'bars' | 'empty' | 'not_entitled' | 'bad_key' | 'skipped' | 'rate_limited' | 'not_found' | 'error'; n: number; detail?: string }
export interface ChainResult { bars: Bar[]; source: string; attempts: ChainAttempt[] }
export const attemptsText = (a: ChainAttempt[]) => a.map((x) => `${x.source}:${x.outcome}${x.n ? `(${x.n})` : ''}`).join(', ');

// ─── Massive option aggregates / trades ──────────────────────
function mapAggs(results: any[]): Bar[] {
  const out: Bar[] = [];
  for (const b of results ?? []) {
    if (fin(b?.t) && fin(b?.o) && fin(b?.h) && fin(b?.l) && fin(b?.c) && b.h > 0) out.push({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: num(b.v) ?? 0 });
  }
  return out;
}

async function massivePaged(ep: MassiveEndpoint, label: string, firstKey: string, firstUrl: string, deps: ChainDeps, maxPages: number,
  take: (body: any) => void): Promise<ChainAttempt> {
  if (!deps.massive) return { source: label, outcome: 'skipped', n: 0, detail: 'no POLYGON_API_KEY' };
  if (!deps.entitlement.usable(ep)) return { source: label, outcome: 'skipped', n: 0, detail: `endpoint ${deps.entitlement.state[ep]}` };
  let url: string | null = firstUrl;
  let key = firstKey;
  for (let page = 0; url && page < maxPages; page++) {
    const res = await deps.massive(key, url);
    const c = deps.entitlement.note(ep, res);
    if (c.kind !== 'ok') {
      if (page > 0) break; // keep what earlier pages returned
      const outcome = c.kind === 'not_entitled' ? 'not_entitled' : c.kind === 'bad_key' ? 'bad_key' : c.kind === 'rate_limited' ? 'rate_limited' : c.kind === 'not_found' ? 'not_found' : 'error';
      return { source: label, outcome, n: 0, detail: c.message };
    }
    take(res!.body);
    const next: string | null = typeof res!.body?.next_url === 'string' ? res!.body.next_url : null;
    if (!next || !next.startsWith(MASSIVE_BASE)) break; // only ever follow Massive's own cursor
    url = next;
    key = `${firstKey}_p${page + 1}`;
  }
  return { source: label, outcome: 'empty', n: 0 }; // caller fills n / outcome
}

export async function massiveOptionAggs(occ: string, fromMs: number, toMs: number, minutes: 1 | 5, deps: ChainDeps): Promise<{ bars: Bar[]; attempt: ChainAttempt }> {
  const label = `massive:O:${occ}:${minutes}m`;
  const bars: Bar[] = [];
  const url = `${MASSIVE_BASE}/v2/aggs/ticker/O:${encodeURIComponent(occ)}/range/${minutes}/minute/${Math.floor(fromMs)}/${Math.ceil(toMs)}?adjusted=true&sort=asc&limit=50000`;
  const a = await massivePaged('optionAggs', label, `mo${minutes}m_${occ}_${Math.floor(fromMs)}_${Math.ceil(toMs)}`, url, deps, 4, (b) => bars.push(...mapAggs(b?.results)));
  if (a.outcome !== 'empty') return { bars: [], attempt: a };
  bars.sort((x, y) => x.t - y.t);
  return { bars, attempt: { source: label, outcome: bars.length ? 'bars' : 'empty', n: bars.length } };
}

/** Prints → 1-minute OHLCV bars (sip_timestamp ns; participant_timestamp fallback). */
export function tradesToBars(trades: any[], widthMs = 60_000): Bar[] {
  const m = new Map<number, Bar>();
  const rows = (trades ?? [])
    .map((x) => ({ t: Math.floor(Number(x?.sip_timestamp ?? x?.participant_timestamp) / 1e6), p: num(x?.price), s: num(x?.size) ?? 0 }))
    .filter((x) => fin(x.t) && x.t > 0 && x.p != null && x.p > 0)
    .sort((a, b) => a.t - b.t);
  for (const x of rows) {
    const k = Math.floor(x.t / widthMs) * widthMs;
    const b = m.get(k);
    if (!b) m.set(k, { t: k, o: x.p!, h: x.p!, l: x.p!, c: x.p!, v: x.s });
    else { b.h = Math.max(b.h, x.p!); b.l = Math.min(b.l, x.p!); b.c = x.p!; b.v = (b.v ?? 0) + x.s; }
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

export async function massiveOptionTrades(occ: string, fromMs: number, toMs: number, deps: ChainDeps): Promise<{ bars: Bar[]; attempt: ChainAttempt }> {
  const label = `massive:O:${occ}:trades`;
  const trades: any[] = [];
  const from = Math.floor(fromMs), to = Math.ceil(toMs);
  // Nanosecond bounds as strings — ms × 1e6 overflows Number precision.
  const url = `${MASSIVE_BASE}/v3/trades/O:${encodeURIComponent(occ)}?timestamp.gte=${from}000000&timestamp.lte=${to}000000&order=asc&sort=timestamp&limit=50000`;
  const a = await massivePaged('optionTrades', label, `mot_${occ}_${from}_${to}`, url, deps, 5, (b) => trades.push(...(b?.results ?? [])));
  if (a.outcome !== 'empty') return { bars: [], attempt: a };
  const bars = tradesToBars(trades);
  return { bars, attempt: { source: label, outcome: bars.length ? 'bars' : 'empty', n: bars.length } };
}

// ─── Alpaca / Yahoo (moved from the script; cache keys unchanged) ─────
export function parseYahoo(j: any): Bar[] {
  const res = j?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  const ts: number[] = res?.timestamp ?? [];
  if (!q) return [];
  const out: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = num(q.open?.[i]), h = num(q.high?.[i]), l = num(q.low?.[i]), c = num(q.close?.[i]);
    if (o != null && h != null && l != null && c != null && h > 0) out.push({ t: ts[i] * 1000, o, h, l, c, v: num(q.volume?.[i]) ?? 0 });
  }
  return out;
}

export async function alpacaOptionBars(occ: string, fromMs: number, toMs: number, deps: ChainDeps): Promise<{ bars: Bar[]; attempt: ChainAttempt }> {
  const label = `alpaca:${occ}:1Min(indicative)`;
  const end = Math.min(toMs, deps.now() - 16 * 60_000);
  if (!deps.alpaca) return { bars: [], attempt: { source: label, outcome: 'skipped', n: 0, detail: 'no ALPACA_API_KEY' } };
  if (end <= fromMs) return { bars: [], attempt: { source: label, outcome: 'skipped', n: 0, detail: 'window not yet closed' } };
  const out: Bar[] = [];
  let token: string | null = null;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ symbols: occ, timeframe: '1Min', start: new Date(fromMs).toISOString(), end: new Date(end).toISOString(), limit: '10000' });
    if (token) qs.set('page_token', token);
    const j = await deps.json(`ao1m_${occ}_${fromMs}_${end}_${page}`, `https://data.alpaca.markets/v1beta1/options/bars?${qs}`,
      { 'APCA-API-KEY-ID': deps.alpaca.id, 'APCA-API-SECRET-KEY': deps.alpaca.secret });
    for (const b of j?.bars?.[occ] ?? []) {
      const t = Date.parse(b?.t);
      if (fin(t) && fin(b?.o) && fin(b?.h) && fin(b?.l) && fin(b?.c)) out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });
    }
    token = j?.next_page_token ?? null;
    if (!token) break;
  }
  out.sort((a, b) => a.t - b.t);
  return { bars: out, attempt: { source: label, outcome: out.length ? 'bars' : 'empty', n: out.length } };
}

export async function yahooOptionBars(occ: string, fromMs: number, toMs: number, interval: '1m' | '5m', deps: ChainDeps): Promise<{ bars: Bar[]; attempt: ChainAttempt }> {
  const label = `yahoo-opr:${occ}:${interval}`;
  const p1 = Math.floor((fromMs - 3600_000) / 1000), p2 = Math.floor((toMs + 3600_000) / 1000);
  const j = await deps.json(`yo${interval}_${occ}_${p1}_${p2}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(occ)}?period1=${p1}&period2=${p2}&interval=${interval}&includePrePost=false`);
  const bars = parseYahoo(j).filter((b) => (b.v ?? 0) > 0 || interval === '5m');
  return { bars, attempt: { source: label, outcome: bars.length ? 'bars' : 'empty', n: bars.length } };
}

/**
 * The contract's bars over [fromMs, toMs]: first source with any bars wins.
 * Massive 1m → Massive 5m → Massive trades → Alpaca → Yahoo 1m → Yahoo 5m.
 */
export async function optionBarChain(occ: string, fromMs: number, toMs: number, deps: ChainDeps): Promise<ChainResult> {
  const attempts: ChainAttempt[] = [];
  const steps: (() => Promise<{ bars: Bar[]; attempt: ChainAttempt }>)[] = [
    () => massiveOptionAggs(occ, fromMs, toMs, 1, deps),
    () => massiveOptionAggs(occ, fromMs, toMs, 5, deps),
    () => massiveOptionTrades(occ, fromMs, toMs, deps),
    () => alpacaOptionBars(occ, fromMs, toMs, deps),
    () => yahooOptionBars(occ, fromMs, toMs, '1m', deps),
    () => yahooOptionBars(occ, fromMs, toMs, '5m', deps),
  ];
  for (const step of steps) {
    const { bars, attempt } = await step();
    attempts.push(attempt);
    if (bars.length) return { bars, source: attempt.source, attempts };
  }
  return { bars: [], source: 'none', attempts };
}

// ─── exact expiry settlement ─────────────────────────────────
const etDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (ms: number) => etDayFmt.format(new Date(ms));

export interface Settlement {
  root: string; day: string; underlying: string; field: 'close' | 'open'; S: number; intrinsic: number;
  source: string; style: string; approximate: string | null;
}

/**
 * The expiry day's official settlement print → intrinsic value per share.
 * Equity: Massive unadjusted daily (dividend adjustment would misstate intrinsic),
 * then Yahoo daily. Index: Yahoo daily (^GSPC / ^NDX / ^RUT; XSP = ^GSPC ÷ 10).
 * Only the bar OF the expiry day is used — never a neighbouring day.
 */
export async function expirySettlement(root: string, day: string, optionType: string, strike: number, deps: ChainDeps): Promise<Settlement | null> {
  const su = settlementUnderlying(root, day);
  if (!su || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !fin(strike) || strike <= 0) return null;
  let raw: number | null = null;
  let source = '';
  if (su.kind === 'equity' && deps.massive && deps.entitlement.usable('stockDaily')) {
    const res = await deps.massive(`msd_${su.symbol}_${day}`, `${MASSIVE_BASE}/v2/aggs/ticker/${encodeURIComponent(su.symbol.replace(/-/g, '.'))}/range/1/day/${day}/${day}?adjusted=false&sort=asc&limit=5`);
    const c = deps.entitlement.note('stockDaily', res);
    const bar = c.kind === 'ok' ? (res!.body?.results ?? []).find((b: any) => fin(b?.t) && etDay(b.t) === day) : null;
    const v = bar ? num(su.field === 'open' ? bar.o : bar.c) : null;
    if (v != null && v > 0) { raw = v; source = `massive:${su.symbol}:1d(unadjusted)`; }
  }
  if (raw == null) {
    const t0 = Date.parse(`${day}T00:00:00Z`);
    const p1 = Math.floor((t0 - 3 * 86400_000) / 1000), p2 = Math.floor((t0 + 3 * 86400_000) / 1000);
    const j = await deps.json(`ysd_${su.symbol}_${day}`, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(su.symbol)}?period1=${p1}&period2=${p2}&interval=1d`);
    const bar = parseYahoo(j).find((b) => etDay(b.t) === day);
    const v = bar ? (su.field === 'open' ? bar.o : bar.c) : null;
    if (v != null && v > 0) { raw = v; source = `yahoo:${su.symbol}:1d`; }
  }
  if (raw == null) return null;
  const S = Math.round(raw * su.scale * 100) / 100;
  return { root, day, underlying: su.symbol, field: su.field, S, intrinsic: intrinsicValue(optionType, strike, S), source, style: su.style, approximate: su.approximate ?? null };
}

// ─── --only-unverifiable merge ───────────────────────────────
/** Ids the prior ledger marked UNVERIFIABLE. */
export function unverifiableIds(ledger: any): string[] {
  return (Array.isArray(ledger?.trades) ? ledger.trades : []).filter((t: any) => t?.verdict === 'UNVERIFIABLE' && typeof t.id === 'string').map((t: any) => t.id);
}

/**
 * Replace re-checked rows in the prior ledger's trade list (prior order kept).
 * Every re-checked row is tagged with the prior verdict/reason it superseded.
 */
export function mergeRechecked<T extends { id: string; verdict: string; reason: string; evidence: Record<string, unknown> }>(prior: T[], rechecked: T[]):
  { trades: T[]; replaced: number; added: number; transitions: Record<string, number> } {
  const byId = new Map(rechecked.map((r) => [r.id, r]));
  const transitions: Record<string, number> = {};
  let replaced = 0;
  const trades = prior.map((p) => {
    const r = byId.get(p.id);
    if (!r) return p;
    byId.delete(p.id);
    replaced++;
    const k = `${p.verdict}→${r.verdict}`;
    transitions[k] = (transitions[k] ?? 0) + 1;
    return { ...r, evidence: { ...r.evidence, previous: { verdict: p.verdict, reason: p.reason } } };
  });
  const added = byId.size;
  for (const r of byId.values()) trades.push(r);
  return { trades, replaced, added, transitions };
}
