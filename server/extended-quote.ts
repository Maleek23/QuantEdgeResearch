/**
 * EXTENDED-HOURS + INDEX-PROXY QUOTES — the freshest honest print per symbol.
 * ============================================================================
 * Two problems this fixes (docs/DATA_LATENCY.md):
 *
 *  1. Stocks/ETFs outside 09:30–16:00. Yahoo prints pre (04:00–09:30) and post
 *     (16:00–20:00) but nothing overnight (20:00–04:00). Alpaca can, on the
 *     `overnight` / `boats` feeds — if the account's data plan allows it. We try
 *     those, detect 401/403/422 ("subscription does not permit…") and remember
 *     the refusal for six hours, then fall through to Yahoo. `delayed_sip` (free,
 *     15 min) is a last candidate. Whatever wins is the MOST RECENT print, and it
 *     carries its own session, print time and lag.
 *
 *  2. Cash indices. SPX/NDX/RUT do not trade outside RTH, and the free CBOE level
 *     is 15 minutes behind. During RTH, when the index print is ≥ 60 s old we
 *     publish SPY(realtime) × live ratio (SPX/SPY observed at the index's print
 *     time); outside RTH we publish the ETF's extended print × close ratio, or
 *     the future (ES=F) × index close / future settle — whichever printed last.
 *     Always `proxy: true`; the real level rides along as `underlyingPrice`.
 *     CBOE stays the source for options chains.
 *
 * Nothing here writes anywhere; it only reads providers and returns quotes.
 */
import { logger } from './logger';
import { yahooChart, yahooQuote } from './yahoo-client';
import type { RealtimeQuote } from './realtime-pricing-service';
import {
  marketSessionAt, pickFreshest, ratioProxy, barCloseAt,
  type MarketSession, type QuoteCandidate,
} from '../shared/quote-freshness';

export type AlpacaFeed = 'overnight' | 'boats' | 'sip' | 'iex' | 'delayed_sip';

/** Known lag per Alpaca feed (seconds). */
export const ALPACA_FEED_DELAY_SEC: Record<AlpacaFeed, number> = {
  overnight: 0, boats: 0, sip: 0, iex: 0, delayed_sip: 900,
};

const DENY_MS = 6 * 3_600_000;
const feedDeniedUntil = new Map<AlpacaFeed, number>();
const tradeCache = new Map<string, { at: number; data: Map<string, { price: number; at: number }> }>();
const TRADE_TTL_MS = 5_000;

/** Status codes that mean "your plan does not include this feed" — stop asking for a while. */
export function isEntitlementRefusal(status: number): boolean {
  return status === 401 || status === 403 || status === 422;
}

export function alpacaFeedStatus(): Record<string, string> {
  const out: Record<string, string> = {};
  const now = Date.now();
  for (const f of Object.keys(ALPACA_FEED_DELAY_SEC) as AlpacaFeed[]) {
    const until = feedDeniedUntil.get(f) ?? 0;
    out[f] = !process.env.ALPACA_API_KEY ? 'no key' : until > now ? `refused (retry ${new Date(until).toISOString()})` : 'allowed/untested';
  }
  return out;
}

/**
 * Latest trade per symbol on one Alpaca feed. Empty map when the feed is not
 * entitled, keys are missing, or the call fails — never throws.
 */
export async function alpacaLatestTrades(symbols: string[], feed: AlpacaFeed, fetchImpl: typeof fetch = fetch): Promise<Map<string, { price: number; at: number }>> {
  const out = new Map<string, { price: number; at: number }>();
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret || symbols.length === 0) return out;
  if ((feedDeniedUntil.get(feed) ?? 0) > Date.now()) return out;
  const syms = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).sort();
  const ck = `${feed}:${syms.join(',')}`;
  const hit = tradeCache.get(ck);
  if (hit && Date.now() - hit.at < TRADE_TTL_MS) return hit.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4_000);
    const r = await fetchImpl(
      `https://data.alpaca.markets/v2/stocks/trades/latest?symbols=${encodeURIComponent(syms.join(','))}&feed=${feed}`,
      { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }, signal: ctrl.signal },
    ).finally(() => clearTimeout(timer));
    if (isEntitlementRefusal(r.status)) {
      feedDeniedUntil.set(feed, Date.now() + DENY_MS);
      logger.info(`[EXT-QUOTE] Alpaca feed=${feed} refused (${r.status}) — not entitled; retry in 6h`);
      return out;
    }
    if (!r.ok) return out;
    const j: any = await r.json();
    for (const [sym, t] of Object.entries<any>(j?.trades ?? {})) {
      const price = Number(t?.p);
      const at = Date.parse(t?.t);
      if (price > 0 && Number.isFinite(at)) out.set(sym.toUpperCase(), { price, at });
    }
    tradeCache.set(ck, { at: Date.now(), data: out });
  } catch (e) {
    logger.debug(`[EXT-QUOTE] Alpaca ${feed} failed: ${(e as Error).message}`);
  }
  return out;
}

/** Test hook. */
export function _resetAlpacaFeedState(): void {
  feedDeniedUntil.clear();
  tradeCache.clear();
}

/** Alpaca feeds worth asking for in a given clock session, most capable first. */
export function feedsForSession(s: MarketSession): AlpacaFeed[] {
  if (s === 'overnight') return ['overnight', 'boats'];
  if (s === 'pre' || s === 'post') return ['sip', 'iex', 'delayed_sip'];
  return [];
}

interface Cand extends QuoteCandidate { session: MarketSession }

/**
 * Replace `base` with a fresher print when one exists. Change is re-measured
 * against base.previousClose so the % keeps the platform's one definition.
 */
export function applyFresher(base: RealtimeQuote, c: Cand | null): RealtimeQuote {
  if (!c || c.at <= base.lastUpdate.getTime()) return base;
  const prev = base.previousClose && base.previousClose > 0 ? base.previousClose : null;
  const change = prev ? c.price - prev : base.change;
  return {
    ...base,
    price: c.price,
    change,
    changePercent: prev ? (change / prev) * 100 : base.changePercent,
    lastUpdate: new Date(c.at),
    source: c.source,
    session: c.session,
    delayed: (c.delayedSec ?? 0) >= 60,
    delayedSec: c.delayedSec ?? 0,
    stale: false,
  };
}

/**
 * Overlay extended-hours prints from Alpaca on equity quotes, in place.
 * No-op during the regular session (Yahoo is realtime there) and for indices.
 */
export async function overlayExtendedHours(quotes: Map<string, RealtimeQuote>, symbols: string[], now = Date.now()): Promise<void> {
  const clock = marketSessionAt(now);
  const feeds = feedsForSession(clock);
  const eq = symbols.map((s) => s.toUpperCase()).filter((s) => !INDEX_PROXIES[s] && /^[A-Z.]{1,6}$/.test(s));
  if (!feeds.length || !eq.length) return;
  const results = await Promise.all(feeds.map(async (f) => [f, await alpacaLatestTrades(eq, f)] as const));
  for (const sym of eq) {
    const base = quotes.get(sym);
    if (!base) continue;
    const cands: Cand[] = [];
    for (const [feed, m] of results) {
      const t = m.get(sym);
      if (t) cands.push({ price: t.price, at: t.at, source: `alpaca-${feed}`, delayedSec: ALPACA_FEED_DELAY_SEC[feed], session: marketSessionAt(t.at) });
    }
    const best = pickFreshest(cands);
    // Only take a print from the current extended session or newer than base.
    if (best) quotes.set(sym, applyFresher(base, best));
  }
}

/* ── index proxies ─────────────────────────────────────────────────────── */

export const INDEX_PROXIES: Record<string, { etf: string; future: string }> = {
  SPX: { etf: 'SPY', future: 'ES=F' },
  NDX: { etf: 'QQQ', future: 'NQ=F' },
  RUT: { etf: 'IWM', future: 'RTY=F' },
};

/** Index print older than this during RTH → publish the realtime proxy instead. */
export const INDEX_STALE_SEC = 60;

export interface IndexProxyInputs {
  now: number;
  index: { price: number; at: number; previousClose?: number | null };
  /** ETF latest print (may be extended hours) and its regular close. */
  etf?: { price: number; at: number; regularClose?: number | null; previousClose?: number | null; priceAtIndexPrint?: number | null; session?: MarketSession } | null;
  /** Future latest print and its prior settlement. */
  future?: { price: number; at: number; previousClose?: number | null } | null;
}

export interface IndexProxyResult {
  price: number;
  at: number;
  source: string;
  session: MarketSession;
  /** Ratio or basis used, for the tooltip. */
  basis: string;
}

/**
 * Pure: decide whether (and how) to replace an index level with a proxy.
 * Returns null when the real index print should stand.
 */
export function computeIndexProxy(sym: string, x: IndexProxyInputs): IndexProxyResult | null {
  const p = INDEX_PROXIES[sym];
  if (!p) return null;
  const clock = marketSessionAt(x.now);
  const indexAge = (x.now - x.index.at) / 1000;

  if (clock === 'regular') {
    if (indexAge < INDEX_STALE_SEC || !x.etf) return null;
    if ((x.now - x.etf.at) / 1000 >= INDEX_STALE_SEC || x.etf.at <= x.index.at) return null;
    // Live ratio: index and ETF at the SAME instant (the index's delayed print).
    // Fallback: both prior closes — tracking drift intraday is a few bp.
    const live = x.etf.priceAtIndexPrint ? ratioProxy(x.etf.price, x.index.price, x.etf.priceAtIndexPrint) : null;
    const close = live == null && x.index.previousClose && x.etf.previousClose ? ratioProxy(x.etf.price, x.index.previousClose, x.etf.previousClose) : null;
    const price = live ?? close;
    if (price == null) return null;
    const ratio = live != null ? x.index.price / (x.etf.priceAtIndexPrint as number) : (x.index.previousClose as number) / (x.etf.previousClose as number);
    return { price, at: x.etf.at, source: `proxy:${p.etf}×${ratio.toFixed(4)}`, session: 'regular', basis: live != null ? `${sym}/${p.etf} at the index print` : `${sym}/${p.etf} prior closes` };
  }

  // Outside RTH the index does not print. Anchor = its last regular close.
  const anchor = x.index.price;
  const cands: Array<IndexProxyResult & { price: number; at: number }> = [];
  if (x.etf && x.etf.regularClose && x.etf.at > x.index.at) {
    const px = ratioProxy(x.etf.price, anchor, x.etf.regularClose);
    if (px != null) cands.push({ price: px, at: x.etf.at, source: `proxy:${p.etf}×${(anchor / x.etf.regularClose).toFixed(4)}`, session: clock, basis: `${p.etf} extended print × ${sym}/${p.etf} close ratio` });
  }
  // Futures settle ≈ cash close only once the new Globex day has rolled (18:00 ET);
  // in the 16:00–18:00 window their previousClose is the PRIOR day, so skip post.
  if (x.future && x.future.previousClose && x.future.at > x.index.at && clock !== 'post') {
    const px = ratioProxy(x.future.price, anchor, x.future.previousClose);
    if (px != null) cands.push({ price: px, at: x.future.at, source: `proxy:${p.future}`, session: clock, basis: `${sym} close × ${p.future} move since settle` });
  }
  return pickFreshest(cands);
}

/**
 * Overlay proxies on index quotes in place (SPX/NDX/RUT). VIX is left as the
 * real (delayed) level: its futures are a different instrument.
 */
export async function overlayIndexProxies(quotes: Map<string, RealtimeQuote>, symbols: string[], now = Date.now()): Promise<void> {
  const want = symbols.map((s) => s.toUpperCase()).filter((s) => INDEX_PROXIES[s] && quotes.get(s));
  for (const sym of want) {
    const base = quotes.get(sym)!;
    const p = INDEX_PROXIES[sym];
    try {
      const clock = marketSessionAt(now);
      const indexAt = base.lastUpdate.getTime();
      if (clock === 'regular' && (now - indexAt) / 1000 < INDEX_STALE_SEC) continue;
      const [etfQ, futQ] = await Promise.all([
        yahooQuote(p.etf),
        clock === 'regular' ? Promise.resolve(null) : yahooQuote(p.future),
      ]);
      let etf: IndexProxyInputs['etf'] = null;
      if (etfQ) {
        let etfPrice = etfQ.price, etfAt = etfQ.at, etfSession: MarketSession = etfQ.session;
        // Overnight: Yahoo has no prints; Alpaca might.
        if (clock === 'overnight' || clock === 'pre' || clock === 'post') {
          const fs = feedsForSession(clock);
          for (const f of fs) {
            const t = (await alpacaLatestTrades([p.etf], f)).get(p.etf);
            if (t && t.at > etfAt && ALPACA_FEED_DELAY_SEC[f] === 0) { etfPrice = t.price; etfAt = t.at; etfSession = marketSessionAt(t.at); }
          }
        }
        let priceAtIndexPrint: number | null = null;
        if (clock === 'regular') {
          const j = await yahooChart(p.etf, { range: '1d', interval: '1m', includePrePost: true });
          const r = j?.chart?.result?.[0];
          priceAtIndexPrint = r ? barCloseAt(r.timestamp ?? [], r.indicators?.quote?.[0]?.close ?? [], Math.floor(indexAt / 1000)) : null;
        }
        etf = { price: etfPrice, at: etfAt, session: etfSession, regularClose: etfQ.regularMarketPrice, previousClose: etfQ.previousClose, priceAtIndexPrint };
      }
      const future = futQ ? { price: futQ.price, at: futQ.at, previousClose: futQ.previousClose } : null;
      const res = computeIndexProxy(sym, { now, index: { price: base.price, at: indexAt, previousClose: base.previousClose }, etf, future });
      if (!res) continue;
      // Change vs the index's own reference: prior close in RTH, last close outside it.
      const ref = clock === 'regular' ? (base.previousClose ?? null) : base.price;
      const change = ref ? res.price - ref : 0;
      quotes.set(sym, {
        ...base,
        price: res.price,
        change,
        changePercent: ref ? (change / ref) * 100 : 0,
        previousClose: ref ?? base.previousClose,
        lastUpdate: new Date(res.at),
        source: res.source,
        session: res.session,
        proxy: true,
        delayed: false,
        // ES=F on Yahoo lags ~10 min; the age stamp shows it — mark it delayed too.
        delayedSec: res.source.includes('=F') ? Math.max(0, Math.round((now - res.at) / 1000)) : 0,
        underlyingPrice: base.price,
        underlyingAsOf: base.lastUpdate,
        stale: false,
      });
    } catch (e) {
      logger.debug(`[EXT-QUOTE] index proxy ${sym} failed: ${(e as Error).message}`);
    }
  }
}
