/**
 * ALPACA OPTIONS CHAIN — primary chain source for GEX / VEX.
 * ==========================================================
 * Tradier's token is rejected, Yahoo 429s, CBOE's delayed CDN 429s bursts.
 * Alpaca's market-data API serves the whole chain with greeks + IV per call
 * page, and the trading API serves open interest.
 *
 *   snapshots  GET https://data.alpaca.markets/v1beta1/options/snapshots/{UNDERLYING}
 *              ?feed=indicative&expiration_date_gte&expiration_date_lte
 *              &strike_price_gte&strike_price_lte&limit=1000&page_token
 *              → greeks {delta,gamma,theta,vega,rho}, impliedVolatility,
 *                latestQuote, latestTrade, dailyBar (volume = dailyBar.v)
 *   contracts  GET https://{paper-api|api}.alpaca.markets/v2/options/contracts
 *              ?underlying_symbols&expiration_date_gte&expiration_date_lte
 *              &strike_price_gte&strike_price_lte&limit=10000&page_token
 *              → open_interest + open_interest_date (lags 1–2 sessions), close_price, multiplier
 *   spot       GET https://data.alpaca.markets/v2/stocks/{SYM}/snapshot?feed=iex
 *
 * FEED: 'indicative' is Alpaca's free derived feed — NOT the consolidated OPRA
 * tape. Quotes/greeks are indicative; real-time OPRA needs Alpaca's paid
 * options data plan. Every chain carries feed='indicative', its fetch time and
 * the open-interest date so no surface can present it as a live OPRA read.
 *
 * BUDGET: Alpaca's free tier allows 200 requests/min. Every request in this
 * process goes through one serial queue at ≥330 ms spacing (≤ ~180/min), and a
 * 429 parks the whole client for 60 s. Chains are cached (90 s in cash hours,
 * 15 min otherwise; open interest 30 min — it only changes overnight) and
 * concurrent callers for the same chain share one in-flight fetch.
 */

import { logger } from './logger';
import { rateLimited } from './provider-cache';
import { fillMissingGreeks, type GreekSource, type GreekSourceCounts } from '../shared/iv-fill';

/** Risk-free rate for the gap-fill inversion — the same 4.5% options-exposures.ts prices greeks with. */
const FILL_RISK_FREE = 0.045;

const DATA_BASE = 'https://data.alpaca.markets';
const tradingBase = () => (process.env.ALPACA_PAPER !== 'false' ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets');
const SPACING_MS = 330;
const COOLDOWN_MS = 60_000;
const MAX_PAGES = 25;

export const ALPACA_OPTIONS_FEED = 'indicative' as const;

export function isAlpacaOptionsConfigured(): boolean {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY);
}

export interface AlpacaOptionContract {
  /** OCC compact symbol, e.g. BE261002C00300000 */
  occ: string;
  underlying: string;
  expiration: string;         // YYYY-MM-DD
  strike: number;
  type: 'call' | 'put';
  gamma: number | null;
  delta: number | null;
  vega: number | null;
  theta: number | null;
  /** Decimal (0.94 = 94%). null when Alpaca had no IV for the contract. */
  iv: number | null;
  /** Today's volume (dailyBar.v) — 0 when no bar yet. */
  volume: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** Time of the last trade (latestTrade.t) — a stale last is not inverted. */
  lastTime: string | null;
  quoteTime: string | null;
  /**
   * Where gamma/delta/IV came from: Alpaca itself, inverted from this contract's
   * own quote/last, interpolated across the expiry's smile, or nowhere (see shared/iv-fill.ts).
   */
  greekSource: GreekSource;
  openInterest: number | null;
  openInterestDate: string | null;
  closePrice: number | null;
}

export interface AlpacaChain {
  underlying: string;
  contracts: AlpacaOptionContract[];
  expirations: string[];
  spot: number | null;
  spotTime: string | null;
  prevClose: number | null;
  changePct: number | null;
  feed: typeof ALPACA_OPTIONS_FEED;
  /** When this process received the chain (ms epoch). */
  fetchedAt: number;
  /** Most common open_interest_date across contracts — OI lags 1–2 sessions. */
  openInterestDate: string | null;
  coverage: { expirationLte: string; strikeLo: number | null; strikeHi: number | null };
  requests: number;
  /** Per-source contract counts after the gap-fill (shared/iv-fill.ts). */
  greekSources: GreekSourceCounts;
  /** (implied-from-price + smile-interpolated) / contracts — the modelled share of the chain's greeks. */
  modelledShare: number;
}

// ─── Process-wide budget + cooldown ──────────────────────────────────────

let cooldownUntil = 0;
let requestsThisMinute = 0;
let minuteStart = Date.now();

export function alpacaOptionsStatus() {
  return {
    configured: isAlpacaOptionsConfigured(),
    coolingDown: Date.now() < cooldownUntil,
    cooldownUntil: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
    requestsThisMinute,
    feed: ALPACA_OPTIONS_FEED,
  };
}

async function alpacaGet(url: string): Promise<{ status: number; json: any | null }> {
  if (!isAlpacaOptionsConfigured()) return { status: 0, json: null };
  if (Date.now() < cooldownUntil) return { status: 429, json: null };
  return rateLimited('alpaca', SPACING_MS, async () => {
    if (Date.now() < cooldownUntil) return { status: 429, json: null };
    if (Date.now() - minuteStart >= 60_000) { minuteStart = Date.now(); requestsThisMinute = 0; }
    requestsThisMinute++;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    try {
      const r = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
          'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY!,
          Accept: 'application/json',
        },
        signal: ctl.signal,
      });
      if (r.status === 429) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        logger.warn(`[ALPACA-OPT] 429 — parking all Alpaca option calls for ${COOLDOWN_MS / 1000}s`);
        return { status: 429, json: null };
      }
      if (!r.ok) return { status: r.status, json: null };
      return { status: r.status, json: await r.json() };
    } catch {
      return { status: 0, json: null };
    } finally {
      clearTimeout(timer);
    }
  });
}

// ─── Parsing ─────────────────────────────────────────────────────────────

const OCC_RE = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;
function parseOcc(occ: string): { root: string; expiration: string; type: 'call' | 'put'; strike: number } | null {
  const m = OCC_RE.exec(occ);
  if (!m) return null;
  const [, root, d, cp, k] = m;
  return { root, expiration: `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`, type: cp === 'C' ? 'call' : 'put', strike: Number(k) / 1000 };
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function inCashHours(at = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const mins = h * 60 + m;
  return wd !== 'Sat' && wd !== 'Sun' && mins >= 9 * 60 + 30 && mins <= 16 * 60 + 15;
}

// ─── Fetchers ────────────────────────────────────────────────────────────

async function fetchSpot(sym: string): Promise<{ spot: number | null; spotTime: string | null; prevClose: number | null; changePct: number | null; requests: number }> {
  const { json } = await alpacaGet(`${DATA_BASE}/v2/stocks/${encodeURIComponent(sym)}/snapshot?feed=iex`);
  const last = num(json?.latestTrade?.p) ?? num(json?.dailyBar?.c);
  const prev = num(json?.prevDailyBar?.c);
  return {
    spot: last && last > 0 ? last : null,
    spotTime: json?.latestTrade?.t ?? json?.dailyBar?.t ?? null,
    prevClose: prev,
    changePct: last && prev ? ((last - prev) / prev) * 100 : null,
    requests: 1,
  };
}

interface OIRow { oi: number | null; oiDate: string | null; close: number | null; multiplier: number }
const oiCache = new Map<string, { at: number; rows: Map<string, OIRow>; requests: number }>();
const OI_TTL_MS = 30 * 60_000;

async function fetchOpenInterest(sym: string, expLte: string, lo: number | null, hi: number | null): Promise<{ rows: Map<string, OIRow>; requests: number }> {
  const key = `${sym}|${expLte}|${lo ?? ''}|${hi ?? ''}`;
  const hit = oiCache.get(key);
  if (hit && Date.now() - hit.at < OI_TTL_MS) return { rows: hit.rows, requests: 0 };
  const rows = new Map<string, OIRow>();
  let token: string | null = null; let requests = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ underlying_symbols: sym, expiration_date_gte: isoDay(Date.now()), expiration_date_lte: expLte, limit: '10000', status: 'active' });
    if (lo != null) qs.set('strike_price_gte', lo.toFixed(2));
    if (hi != null) qs.set('strike_price_lte', hi.toFixed(2));
    if (token) qs.set('page_token', token);
    const { json } = await alpacaGet(`${tradingBase()}/v2/options/contracts?${qs}`);
    requests++;
    if (!json) break;
    for (const c of json.option_contracts ?? []) {
      rows.set(String(c.symbol), {
        oi: num(c.open_interest),
        oiDate: c.open_interest_date ?? null,
        close: num(c.close_price),
        multiplier: num(c.multiplier) ?? num(c.size) ?? 100,
      });
    }
    token = json.next_page_token ?? null;
    if (!token) break;
  }
  if (rows.size) oiCache.set(key, { at: Date.now(), rows, requests });
  return { rows, requests };
}

const chainCache = new Map<string, { expiresAt: number; chain: AlpacaChain }>();
const inflight = new Map<string, Promise<AlpacaChain | null>>();

/**
 * Full chain for one underlying. Defaults: expiries within 180 days, strikes
 * within ±40% of spot. Returns null when Alpaca is unconfigured, cooling down,
 * or returned nothing usable — callers fall through to CBOE.
 */
export async function getAlpacaOptionsChain(
  underlying: string,
  opts: { maxDays?: number; band?: number; expiration?: string } = {},
): Promise<AlpacaChain | null> {
  if (!isAlpacaOptionsConfigured()) return null;
  const sym = underlying.toUpperCase();
  // Alpaca lists equity/ETF options only — cash-settled index roots go to CBOE.
  if (sym === 'SPX' || sym.startsWith('^') || sym === 'VIX' || sym === 'NDX' || sym === 'RUT') return null;
  const maxDays = opts.maxDays ?? 180;
  const band = opts.band ?? 0.4;
  const key = `${sym}|${opts.expiration ?? maxDays}|${band}`;
  const hit = chainCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.chain;
  const running = inflight.get(key);
  if (running) return running;

  const p = (async (): Promise<AlpacaChain | null> => {
    const spotRead = await fetchSpot(sym);
    let requests = spotRead.requests;
    const S = spotRead.spot;
    const lo = S ? S * (1 - band) : null;
    const hi = S ? S * (1 + band) : null;
    const expLte = opts.expiration ?? isoDay(Date.now() + maxDays * 864e5);

    const snaps: Array<[string, any]> = [];
    let token: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ feed: ALPACA_OPTIONS_FEED, limit: '1000' });
      if (opts.expiration) qs.set('expiration_date', opts.expiration);
      else { qs.set('expiration_date_gte', isoDay(Date.now())); qs.set('expiration_date_lte', expLte); }
      if (lo != null) qs.set('strike_price_gte', lo.toFixed(2));
      if (hi != null) qs.set('strike_price_lte', hi.toFixed(2));
      if (token) qs.set('page_token', token);
      const { json, status } = await alpacaGet(`${DATA_BASE}/v1beta1/options/snapshots/${encodeURIComponent(sym)}?${qs}`);
      requests++;
      if (!json) {
        if (page === 0) { logger.warn(`[ALPACA-OPT] ${sym}: snapshots HTTP ${status}`); return null; }
        break; // keep what we have; coverage is stated by the pages we got
      }
      for (const e of Object.entries(json.snapshots ?? {})) snaps.push(e as [string, any]);
      token = json.next_page_token ?? null;
      if (!token) break;
    }
    if (!snaps.length) return null;

    const oi = await fetchOpenInterest(sym, expLte, lo, hi);
    requests += oi.requests;

    const contracts: AlpacaOptionContract[] = [];
    const oiDates = new Map<string, number>();
    for (const [occ, s] of snaps) {
      const parsed = parseOcc(occ);
      if (!parsed) continue;
      const o = oi.rows.get(occ);
      // Adjusted / non-standard deliverables (multiplier ≠ 100, or a root like BE1) are not the same instrument.
      if (o && o.multiplier !== 100) continue;
      if (parsed.root !== sym) continue;
      if (o?.oiDate) oiDates.set(o.oiDate, (oiDates.get(o.oiDate) ?? 0) + 1);
      const iv = num(s?.impliedVolatility);
      contracts.push({
        occ, underlying: sym, expiration: parsed.expiration, strike: parsed.strike, type: parsed.type,
        gamma: num(s?.greeks?.gamma), delta: num(s?.greeks?.delta), vega: num(s?.greeks?.vega), theta: num(s?.greeks?.theta),
        iv: iv && iv > 0 ? iv : null,
        volume: num(s?.dailyBar?.v) ?? 0,
        bid: num(s?.latestQuote?.bp), ask: num(s?.latestQuote?.ap), last: num(s?.latestTrade?.p),
        lastTime: s?.latestTrade?.t ?? null,
        quoteTime: s?.latestQuote?.t ?? null,
        greekSource: 'provider', // re-stamped by fillMissingGreeks below
        openInterest: o?.oi ?? null,
        openInterestDate: o?.oiDate ?? null,
        closePrice: o?.close ?? null,
      });
    }
    if (!contracts.length) return null;
    // Illiquid strikes come back with no greeks and no IV — fill them from the
    // contract's own quote, else the expiry's smile, and stamp the source.
    const fill = S ? fillMissingGreeks(contracts, S, { r: FILL_RISK_FREE })
      : { counts: { provider: contracts.length, impliedFromPrice: 0, smileInterpolated: 0, none: 0 }, modelledShare: 0 };
    const oiDate = [...oiDates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const chain: AlpacaChain = {
      underlying: sym, contracts,
      expirations: [...new Set(contracts.map((c) => c.expiration))].sort(),
      spot: S, spotTime: spotRead.spotTime, prevClose: spotRead.prevClose, changePct: spotRead.changePct,
      feed: ALPACA_OPTIONS_FEED, fetchedAt: Date.now(), openInterestDate: oiDate,
      coverage: { expirationLte: expLte, strikeLo: lo, strikeHi: hi },
      requests,
      greekSources: fill.counts,
      modelledShare: fill.modelledShare,
    };
    chainCache.set(key, { expiresAt: Date.now() + (inCashHours() ? 90_000 : 15 * 60_000), chain });
    if (chainCache.size > 400) {
      const oldest = [...chainCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) chainCache.delete(oldest[0]);
    }
    const gs = fill.counts;
    logger.info(`[ALPACA-OPT] ${sym}: ${contracts.length} contracts, ${chain.expirations.length} expiries, OI date ${oiDate ?? '—'}, ${requests} requests; greeks provider ${gs.provider} / implied ${gs.impliedFromPrice} / smile ${gs.smileInterpolated} / none ${gs.none}`);
    return chain;
  })().catch((e: any) => {
    logger.warn(`[ALPACA-OPT] ${sym}: ${e?.message ?? e}`);
    return null;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Tradier-compatible rows so optionToInput() consumes Alpaca unchanged. */
export function alpacaToTradierShape(chain: AlpacaChain, expiration?: string): any[] {
  return chain.contracts
    .filter((c) => !expiration || c.expiration === expiration)
    .map((c) => ({
      symbol: c.occ,
      strike: c.strike,
      option_type: c.type,
      expiration_date: c.expiration,
      open_interest: c.openInterest ?? 0,
      volume: c.volume,
      bid: c.bid ?? 0,
      ask: c.ask ?? 0,
      last: c.last ?? 0,
      greeks: {
        delta: c.delta ?? undefined,
        gamma: c.gamma ?? undefined,
        vega: c.vega ?? undefined,
        theta: c.theta ?? undefined,
        mid_iv: c.iv ?? undefined,
      },
      greek_source: c.greekSource,
      source: 'alpaca',
    }));
}

/**
 * CBOE-shaped payload so gex-rankings' pure computeRankRowFromCboe() ranks an
 * Alpaca chain with the identical math. Contracts with unknown OI carry 0 OI
 * (they still count for volume).
 */
export function alpacaToCboeShape(chain: AlpacaChain): any | null {
  if (!chain.spot) return null;
  return {
    timestamp: new Date(chain.fetchedAt).toISOString().replace('T', ' ').slice(0, 19),
    data: {
      current_price: chain.spot,
      price_change_percent: chain.changePct,
      iv30: null,
      options: chain.contracts.map((c) => ({
        option: c.occ,
        open_interest: c.openInterest ?? 0,
        volume: c.volume,
        gamma: c.gamma ?? 0,
        iv: c.iv ?? 0,
        delta: c.delta ?? 0,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        last_trade_price: c.last ?? 0,
        greek_source: c.greekSource,
      })),
    },
  };
}
