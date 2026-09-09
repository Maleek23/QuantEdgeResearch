/**
 * BULLFLOW — the options tape the platform has waited for.
 *
 * What this unlocks, mapped to standing gaps:
 *   - LIVE PRINTS: /v1/streaming/alerts SSE delivers algo-detected trades
 *     (Sizable Sweep, Urgent Repeater, …) with the OCC contract, the trade's
 *     premium, average fill and timestamps — a real print stream, not a
 *     chain-snapshot aggregate.
 *   - DIRECTION: /v1/data/netPremiumSeries carries cumulative call/put NET
 *     premium with ask-side/bid-side inference — the aggressor read our flow
 *     scanner was architected to receive (sentiment stayed 'unknown' until a
 *     tape existed; this is the tape).
 *   - Whole-market leaders, per-strike net GEX/VEX, dark pool prints, and a
 *     peak-return lookup for scoring prints after the fact.
 *
 * Config-gated on BULLFLOW_API_KEY: absent key → every accessor returns
 * null/[] and the platform's existing paths stand. Rate limits respected via
 * per-endpoint caches (netgex/netvex 25/min, netPremium 30/min, topTickers
 * 10/min, peakReturn/lastTrade 60/min per their docs).
 */
import { logger } from './logger';
import { marketDateET } from '@shared/market-day';

const BASE = 'https://api.bullflow.io';

function key(): string | null {
  return process.env.BULLFLOW_API_KEY?.trim() || null;
}
export function bullflowEnabled(): boolean { return !!key(); }

// ── tiny per-endpoint cache ─────────────────────────────────────────────────
const cache = new Map<string, { at: number; data: any }>();
async function cachedGet(path: string, params: Record<string, string>, ttlMs: number): Promise<any | null> {
  const k = key();
  if (!k) return null;
  const qs = new URLSearchParams(params).toString();
  const ck = `${path}?${qs}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  try {
    const r = await fetch(`${BASE}${path}?${qs}`, { headers: { 'X-API-Key': k } });
    if (!r.ok) {
      logger.warn(`[BULLFLOW] ${path} HTTP ${r.status}`);
      return hit?.data ?? null; // stale beats nothing; null when never fetched
    }
    const data = await r.json();
    cache.set(ck, { at: Date.now(), data });
    return data;
  } catch (err: any) {
    logger.warn(`[BULLFLOW] ${path} failed: ${err?.message}`);
    return hit?.data ?? null;
  }
}

// ── OCC parsing: O:AMD251205P00205000 → { sym, expiry, type, strike } ──────
export function parseOcc(occ: string): { underlying: string; expiry: string; optionType: 'call' | 'put'; strike: number } | null {
  const m = /^O:([A-Z.]+)(\d{6})([CP])(\d{8})$/.exec(occ?.trim() ?? '');
  if (!m) return null;
  const [, underlying, ymd, cp, strikeRaw] = m;
  return {
    underlying,
    expiry: `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`,
    optionType: cp === 'C' ? 'call' : 'put',
    strike: Number(strikeRaw) / 1000,
  };
}

// ── LIVE PRINT STREAM ───────────────────────────────────────────────────────
export interface BullflowPrint {
  id: string;
  underlying: string;
  occ: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  alertName: string;          // Bullflow's classification, verbatim
  alertType: 'algo' | 'custom';
  premium: number;            // the triggering TRADE's premium, dollars
  fillPrice: number;          // average fill for that trade
  contracts: number | null;   // premium / (fill × 100) — derived, not reported
  at: string;                 // ISO
}

const PRINT_CAP = 600;
const prints: BullflowPrint[] = [];
let streamState: 'off' | 'connecting' | 'live' | 'backoff' = 'off';
let reconnectDelay = 2_000;
let abort: AbortController | null = null;

export function getBullflowPrints(): { state: string; prints: BullflowPrint[] } {
  return { state: streamState, prints: [...prints] };
}

/** Start (or restart) the live alert stream. Safe to call repeatedly. */
export function startBullflowStream(): void {
  const k = key();
  if (!k || streamState === 'connecting' || streamState === 'live') return;
  streamState = 'connecting';
  abort?.abort();
  abort = new AbortController();

  void (async () => {
    try {
      const r = await fetch(`${BASE}/v1/streaming/alerts?key=${encodeURIComponent(k)}`, {
        signal: abort!.signal,
        headers: { Accept: 'text/event-stream' },
      });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      streamState = 'live';
      reconnectDelay = 2_000;
      logger.info('[BULLFLOW] live alert stream connected');
      try {
        const { pulse } = await import('./system-pulse');
        pulse('flow', 'Bullflow tape connected — live print stream feeding the flow layer');
      } catch { /* decoration */ }

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data: ')) continue;
          let msg: any;
          try { msg = JSON.parse(line.slice(6)); } catch { continue; }
          if (msg?.event !== 'alert' || !msg.data) continue;
          const d = msg.data;
          const occ = parseOcc(String(d.symbol ?? ''));
          if (!occ) continue;
          const premium = Number(d.alertPremium) || 0;
          const fill = Number(d.averageFillPrice) || 0;
          prints.push({
            id: String(msg.id ?? `${d.symbol}-${d.timestamp}`),
            underlying: occ.underlying,
            occ: String(d.symbol),
            optionType: occ.optionType,
            strike: occ.strike,
            expiry: occ.expiry,
            alertName: String(d.alertName ?? 'alert'),
            alertType: d.alertType === 'custom' ? 'custom' : 'algo',
            premium,
            fillPrice: fill,
            contracts: fill > 0 ? Math.round(premium / (fill * 100)) : null,
            at: new Date((Number(d.timestamp) || Date.now() / 1000) * 1000).toISOString(),
          });
          if (prints.length > PRINT_CAP) prints.splice(0, prints.length - PRINT_CAP);
          if (premium >= 1_000_000) {
            try {
              const { pulse } = await import('./system-pulse');
              pulse('flow', `Bullflow: ${occ.underlying} $${occ.strike}${occ.optionType === 'call' ? 'C' : 'P'} ${d.alertName} — $${(premium / 1e6).toFixed(1)}M print`);
            } catch { /* decoration */ }
          }
        }
      }
      throw new Error('stream ended');
    } catch (err: any) {
      if (abort?.signal.aborted) { streamState = 'off'; return; }
      streamState = 'backoff';
      logger.warn(`[BULLFLOW] stream dropped (${err?.message}) — reconnect in ${Math.round(reconnectDelay / 1000)}s`);
      setTimeout(() => { streamState = 'off'; startBullflowStream(); }, reconnectDelay);
      reconnectDelay = Math.min(60_000, reconnectDelay * 2);
    }
  })();
}

export function stopBullflowStream(): void {
  abort?.abort();
  abort = null;
  streamState = 'off';
}

// ── DIRECTIONAL NET PREMIUM — the aggressor read ────────────────────────────
export interface NetPremiumRead {
  ticker: string;
  callsNetPremium: number;   // cumulative, ask/bid-inferred by the provider
  putsNetPremium: number;
  asOf: string;
  /** long when net call premium leads, short when net put premium leads. */
  lean: 'long' | 'short' | 'flat';
}

export async function getNetPremiumToday(ticker: string): Promise<NetPremiumRead | null> {
  // ET market date, not UTC — a 10pm CT query with UTC dates asks for
  // TOMORROW's session and gets nothing.
  const today = marketDateET();
  const d = await cachedGet('/v1/data/netPremiumSeries',
    { ticker: ticker.toUpperCase(), from: today, to: today, period: '1D' }, 3 * 60_000);
  const pts: any[] = d?.points ?? [];
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const calls = Number(last.callsNetPremium) || 0;
  const puts = Number(last.putsNetPremium) || 0;
  const net = calls - puts;
  return {
    ticker: ticker.toUpperCase(),
    callsNetPremium: calls,
    putsNetPremium: puts,
    asOf: new Date((Number(last.timestamp) || 0) * 1000).toISOString(),
    lean: Math.abs(net) < 100_000 ? 'flat' : net > 0 ? 'long' : 'short',
  };
}

// ── market-wide leaders / chains / dark pool ────────────────────────────────
export async function getTopTickers(metric: 'volume' | 'premium' | 'net_premium' = 'net_premium', opts: { excludeEtfs?: boolean; sweepsOnly?: boolean } = {}): Promise<any | null> {
  return cachedGet('/v1/data/optionsTopTickers', {
    metric, ticker_count: '30',
    exclude_etfs: String(opts.excludeEtfs ?? true),
    sweeps_only: String(opts.sweepsOnly ?? false),
  }, 6 * 60_000); // 10 req/min limit — cache hard
}

export async function getNetGexChain(ticker: string): Promise<any | null> {
  return cachedGet('/v1/data/netgex', { ticker: ticker.toUpperCase() }, 5 * 60_000);
}
export async function getNetVexChain(ticker: string): Promise<any | null> {
  return cachedGet('/v1/data/netvex', { ticker: ticker.toUpperCase() }, 5 * 60_000);
}
export async function getDarkPoolTrades(ticker: string, minNotional = 1_000_000): Promise<any | null> {
  const today = marketDateET();
  return cachedGet('/v1/data/darkPoolTrades', { ticker: ticker.toUpperCase(), from: today, to: today, minNotional: String(minNotional) }, 6 * 60_000);
}
export async function getPeakReturn(occ: string, oldPrice: number, tradeTsSec: number): Promise<{ peakPrice: number; peakPct: number } | null> {
  const d = await cachedGet('/v1/data/peakReturn', { sym: occ, old_price: String(oldPrice), trade_timestamp: String(Math.floor(tradeTsSec)) }, 10 * 60_000);
  if (!d) return null;
  const peakPct = Number(d.peakPercentReturnSinceTimestamp);
  const peakPrice = Number(d.peakPriceSinceTimestamp);
  return Number.isFinite(peakPct) ? { peakPrice, peakPct } : null;
}
