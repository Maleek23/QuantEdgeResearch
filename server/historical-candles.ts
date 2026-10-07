/**
 * HISTORICAL CANDLES — one callable source of daily bars.
 *
 * This logic lived inline inside the /api/historical-prices route, which meant
 * the only way for other server code to reach it was to make an HTTP request
 * back to its own process. early-rotation did exactly that, once per candidate
 * symbol, sequentially — so every name cost a full request/response cycle
 * (socket, routing, JSON serialise, JSON parse) stacked on top of the upstream
 * fetch it was actually there to do. That endpoint measured 13.8 seconds to
 * produce two kilobytes.
 *
 * The fan-out is the bug, not the fetching. Extracting the body into a function
 * lets in-process callers call it, and lets them do so concurrently, while the
 * route keeps serving the same shape to the browser. The provider cache still
 * coalesces concurrent callers for the same symbol into one upstream request, so
 * parallelism here costs no extra load on Yahoo.
 */
import { cachedFetchWithStale } from './provider-cache';
import { toYahooSymbol } from './yahoo-client';
import {
  indexInfo, canonicalChartSymbol, foldIndexSession, joinProxyVolume, buildFutureProxyBars,
  isIntradayInterval, type IdxBar,
} from '@shared/index-symbols';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const RANGE_MAP: Record<string, string> = {
  '1D': '1d', '5D': '5d', '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', '2Y': '2y', '5Y': '5y', '10Y': '10y',
  '1d': '1d', '5d': '5d', '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y', '2y': '2y', '5y': '5y', '10y': '10y',
};

export function normalizeRange(raw: string | undefined, fallback = '1mo'): string {
  return RANGE_MAP[raw ?? ''] ?? fallback;
}

function startDateFor(range: string): Date {
  const now = Date.now();
  const DAY = 86_400_000;
  switch (range) {
    case '1d': return new Date(now - 2 * DAY);
    case '5d': return new Date(now - 7 * DAY);
    case '1mo': return new Date(now - 32 * DAY);
    case '3mo': return new Date(now - 95 * DAY);
    case '6mo': return new Date(now - 190 * DAY);
    case '1y': return new Date(now - 370 * DAY);
    case '2y': return new Date(now - 728 * DAY);
    case '5y': return new Date(now - 5 * 370 * DAY);
    case '10y': return new Date(now - 10 * 370 * DAY);
    default: return new Date(now - 32 * DAY);
  }
}

/**
 * Daily (or intraday) bars for one symbol, already filtered to complete rows.
 * Returns an empty array rather than throwing — a missing chart must degrade one
 * panel, never take down a caller that is fetching twenty other things.
 */
export async function fetchCandles(
  symbol: string,
  range = '6mo',
  interval = '1d',
): Promise<Candle[]> {
  const r = normalizeRange(range, '6mo');
  // Public-facing terminal symbols do not always match Yahoo's chart symbols.
  // Keep the UI canonical (SPX) and translate only at the provider boundary.
  // (SPX → ^GSPC, VIX → ^VIX, …) — see toYahooSymbol.
  const providerSymbol = toYahooSymbol(symbol);
  // Intraday charts need overnight/premarket context. The old omission of 1m
  // made the most time-sensitive view regular-session-only while 5m/15m were
  // extended-hours, so the same move appeared differently by timeframe.
  const includeExtended =
    interval === '1m' || interval === '1h' || interval === '5m' || interval === '15m' || interval === '30m' || interval === '1d';
  const period1 = Math.floor(startDateFor(r).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  try {
    const result: any = await cachedFetchWithStale(
      `yahoo:chart:${providerSymbol}:${r}:${interval}`,
      // Daily bars only change once a day apart from the forming last candle, so
      // a 60s TTL meant a scan over 80 symbols re-fetched the whole set every
      // minute for data that had not moved. Intraday intervals keep the short TTL.
      interval === '1d' ? 10 * 60_000 : 60_000,
      30 * 60_000,
      async () => {
        const url =
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}` +
          `?period1=${period1}&period2=${period2}&interval=${interval}` +
          `&includePrePost=${includeExtended}`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!resp.ok) throw new Error(`yahoo chart ${resp.status}`);
        const body: any = await resp.json();
        const res = body?.chart?.result?.[0];
        if (!res) throw new Error('yahoo chart: empty result');

        const stamps: number[] = res.timestamp || [];
        const q = res.indicators?.quote?.[0] || {};
        const adj: Array<number | null> = res.indicators?.adjclose?.[0]?.adjclose ?? [];
        const meta = res.meta ?? {};
        const quotes = stamps.map((t: number, i: number) => ({
          date: new Date(t * 1000),
          open: q.open?.[i], high: q.high?.[i], low: q.low?.[i],
          close: q.close?.[i], volume: q.volume?.[i], adjclose: adj?.[i],
        }));
        return { quotes, meta };
      },
    );

    // Yahoo quirk (found 2026-09-22): for hours after each close, the just-
    // completed session's daily bar comes back with close=null and the old
    // null-filter DROPPED THE WHOLE BAR — every chart (and the TA engine)
    // was missing the latest session, worst on the biggest-move days. Repair
    // the close from adjclose, or for the final bar from Yahoo's own
    // meta.regularMarketPrice, which is the official close of that session.
    const meta: any = (result as any)?.meta ?? {};
    const rows: any[] = result?.quotes ?? [];
    const lastIdx = rows.length - 1;
    const bars: Candle[] = rows
      .map((q: any, i: number) => {
        let close = q.close ?? q.adjclose ?? null;
        if (
          close == null && i === lastIdx &&
          Number.isFinite(meta.regularMarketPrice) &&
          Number.isFinite(meta.regularMarketTime) &&
          Math.abs(meta.regularMarketTime * 1000 - new Date(q.date).getTime()) < 24 * 3600_000
        ) {
          close = meta.regularMarketPrice;
        }
        return { ...q, close };
      })
      .filter((q: any) => q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q: any) => ({
        time: Math.floor(new Date(q.date).getTime() / 1000),
        open: q.open, high: q.high, low: q.low, close: q.close,
        volume: q.volume || 0,
      }));
    // A cash index has no extended session: Yahoo's pre-open and flat
    // post-16:00 "settlement" bars are not trading (shared/index-symbols.ts).
    const info = indexInfo(symbol);
    return info && !info.ownExtendedSession && isIntradayInterval(interval) ? foldIndexSession(bars) : bars;
  } catch {
    return [];
  }
}

/**
 * Bars for many symbols at once, bounded so a large fan-out cannot open an
 * unlimited number of sockets. Concurrency is safe here because the provider
 * cache collapses duplicate in-flight requests and the rate limiter still
 * governs what actually reaches the upstream.
 */
export async function fetchCandlesBatch(
  symbols: string[],
  range = '6mo',
  interval = '1d',
  concurrency = 8,
): Promise<Map<string, Candle[]>> {
  const out = new Map<string, Candle[]>();
  for (let i = 0; i < symbols.length; i += concurrency) {
    const slice = symbols.slice(i, i + concurrency);
    const rows = await Promise.all(slice.map((s) => fetchCandles(s, range, interval)));
    slice.forEach((s, n) => out.set(s, rows[n]));
  }
  return out;
}

/* ── the chart's series: bars + what the bars can and cannot show ─────────── */

export interface ChartSeries {
  symbol: string;
  data: Candle[];
  /** Where the volume column came from. */
  volume: { source: string; proxy: boolean; note: string | null };
  /** Session the bars cover. */
  session: { kind: 'equity' | 'index-rth' | 'index-own-extended'; note: string | null };
  /** Pre/post/overnight bars from the index's future, scaled to the index (proxy). */
  extended: null | {
    bars: Array<Candle & { proxy?: boolean }>;
    source: string;
    basis: string;
    anchors: Array<{ date: string; indexClose: number; futureAtClose: number; ratio: number }>;
    lastAt: string | null;
    note: string;
  };
}

/**
 * /api/historical-prices body. Equities: the bars as before. Cash indices:
 * regular-session bars, the ETF's volume in place of Yahoo's constituent-sum
 * figure (labelled), and — intraday — out-of-RTH bars from the future scaled
 * to the index (labelled, separate array: the chart opts in via ETH).
 */
export async function fetchChartSeries(rawSymbol: string, range = '1mo', interval = '1d'): Promise<ChartSeries> {
  const symbol = canonicalChartSymbol(rawSymbol);
  const info = indexInfo(symbol);
  const intraday = isIntradayInterval(interval);
  const [data, etf, fut] = await Promise.all([
    fetchCandles(symbol, range, interval),
    info?.volumeProxy ? fetchCandles(info.volumeProxy, range, interval) : Promise.resolve(null),
    info?.extendedProxy && intraday ? fetchCandles(info.extendedProxy, range, interval) : Promise.resolve(null),
  ]);
  return assembleChartSeries(symbol, interval, data, etf, fut);
}

/** Pure half of fetchChartSeries (tests feed it recorded Yahoo bars). */
export function assembleChartSeries(symbolRaw: string, interval: string, data: Candle[], etf: Candle[] | null, fut: Candle[] | null): ChartSeries {
  const symbol = canonicalChartSymbol(symbolRaw);
  const info = indexInfo(symbol);
  const intraday = isIntradayInterval(interval);
  if (!info) {
    return { symbol, data, volume: { source: 'yahoo', proxy: false, note: null }, session: { kind: 'equity', note: null }, extended: null };
  }
  let bars: Candle[];
  let volume: ChartSeries['volume'];
  if (info.volumeProxy && etf && etf.length) {
    bars = joinProxyVolume(data as IdxBar[], etf as IdxBar[], !intraday) as Candle[];
    volume = { source: `${info.volumeProxy} (proxy)`, proxy: true, note: `${symbol} is a calculated index with no traded volume — volume bars are ${info.volumeProxy}'s.` };
  } else if (info.volumeProxy) {
    bars = data.map((b) => ({ ...b, volume: 0 }));
    volume = { source: 'none', proxy: false, note: `${symbol} has no traded volume and the ${info.volumeProxy} proxy did not load.` };
  } else {
    bars = data.map((b) => ({ ...b, volume: 0 }));
    volume = { source: 'none', proxy: false, note: `${symbol} is a calculated index — it has no volume.` };
  }
  const session: ChartSeries['session'] = info.ownExtendedSession
    ? { kind: 'index-own-extended', note: `${symbol} prints its own extended session (Cboe GTH from 03:15 ET); those bars are the index, not a proxy. Cboe index levels are 15-min delayed.` }
    : { kind: 'index-rth', note: `${symbol} prints 09:30–16:00 ET only.${info.extendedProxy ? ` Pre/post/overnight = ${info.extendedProxy} scaled to ${symbol} (ETH, proxy).` : ''}` };
  let extended: ChartSeries['extended'] = null;
  if (info.extendedProxy && intraday) {
    if (fut && fut.length && bars.length) {
      const res = buildFutureProxyBars(bars as IdxBar[], fut as IdxBar[]);
      const last = res.anchors[res.anchors.length - 1];
      extended = {
        bars: res.bars,
        source: `${info.extendedProxy} (Yahoo, ~10 min delayed) × ${symbol}/${info.extendedProxy} at each ${symbol} close`,
        basis: last ? `${symbol} ${last.indexClose.toFixed(2)} ÷ ${info.extendedProxy} ${last.futureAtClose.toFixed(2)} = ${last.ratio.toFixed(5)} (${last.date} close)` : 'no anchor close in range',
        anchors: res.anchors,
        lastAt: res.bars.length ? new Date(res.bars[res.bars.length - 1].time * 1000).toISOString() : null,
        note: `Outside 09:30–16:00 ET ${symbol} does not print. These bars are ${info.extendedProxy} rescaled so each session starts at ${symbol}'s close — a proxy, not the index.`,
      };
    } else {
      extended = { bars: [], source: info.extendedProxy, basis: 'unavailable', anchors: [], lastAt: null, note: `${info.extendedProxy} bars did not load — no extended-hours proxy for ${symbol}.` };
    }
  }
  return { symbol, data: bars, volume, session, extended };
}
