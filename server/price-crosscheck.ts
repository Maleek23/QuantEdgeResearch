/**
 * PRICE CROSS-CHECK — fetch the same daily bars and live last price from each
 * provider the platform already uses, and report where they disagree.
 *
 * Idea and checks ported from vivek-v-rao/price-check (xprice_check.py, MIT
 * License — https://github.com/vivek-v-rao/price-check). Comparison logic is in
 * shared/price-crosscheck.ts; this file only fetches.
 *
 * Rules (operator + SR 11-7): never auto-repair, never silently pick a provider.
 * Every read keeps its provider name, feed and timestamp; the report also names
 * the provider the platform itself served (realtime-pricing-service) so a
 * disagreement can be traced to the number a user actually saw.
 *
 * Providers:
 *   daily bars  yahoo (chart, split-adjusted OHLC) · alpaca (v2 bars, adjustment=split,
 *               SIP when entitled else IEX — IEX-only bars legitimately differ; labelled)
 *   last price  yahoo (latest 1m print, pre/post incl.) · alpaca (IEX trade stream, if live)
 *               · tradier (if the key works) · cboe (15-min delayed quote)
 */
import { logger } from './logger';
import { yahooChart, yahooQuote } from './yahoo-client';
import { buildCrossCheck, type CrossCheckReport, type DailyBar, type LastPriceRead, type ProviderSeries } from '../shared/price-crosscheck';

const etDay = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

async function yahooDaily(symbol: string, days: number): Promise<ProviderSeries> {
  const range = days <= 5 ? '5d' : days <= 30 ? '1mo' : '3mo';
  const j = await yahooChart(symbol, { range, interval: '1d' });
  const r = j?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0] ?? {};
  const bars: DailyBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = Number(q.open?.[i]), h = Number(q.high?.[i]), l = Number(q.low?.[i]), c = Number(q.close?.[i]);
    if (![o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ date: etDay(ts[i] * 1000), open: o, high: h, low: l, close: c, volume: Number(q.volume?.[i]) || null });
  }
  // Yahoo includes the in-progress session as a bar; drop today's while the
  // session is open so a live bar is not compared against a finished one.
  const today = etDay(Date.now());
  const regEnd = Number(r?.meta?.currentTradingPeriod?.regular?.end) * 1000;
  const out = bars.filter((b) => !(b.date === today && Number.isFinite(regEnd) && Date.now() < regEnd));
  return { provider: 'yahoo', bars: out.slice(-days), note: 'chart API, split-adjusted OHLC' };
}

async function alpacaDaily(symbol: string, days: number): Promise<ProviderSeries> {
  const key = process.env.ALPACA_API_KEY; const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) return { provider: 'alpaca', bars: [], note: 'not configured' };
  const start = new Date(Date.now() - (days * 1.6 + 7) * 86_400_000).toISOString().slice(0, 10);
  // Free plans may read SIP history older than 15 minutes; fall back to IEX.
  for (const feed of ['sip', 'iex'] as const) {
    try {
      const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=1Day&start=${start}&adjustment=split&feed=${feed}&limit=1000`;
      const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }, signal: AbortSignal.timeout(8_000) });
      if (!r.ok) continue;
      const j: any = await r.json();
      const bars: DailyBar[] = (j?.bars ?? []).map((b: any) => ({
        date: etDay(Date.parse(b.t)), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      }));
      const today = etDay(Date.now());
      return { provider: `alpaca-${feed}`, bars: bars.filter((b) => b.date !== today).slice(-days), note: feed === 'iex' ? 'IEX-only prints — closes can differ from the consolidated close' : 'SIP consolidated' };
    } catch (e: any) {
      logger.debug(`[XCHECK] alpaca ${feed} ${symbol}: ${e?.message ?? e}`);
    }
  }
  return { provider: 'alpaca', bars: [], note: 'request failed' };
}

async function cboeLast(symbol: string): Promise<LastPriceRead | null> {
  try {
    const idx = ['SPX', 'NDX', 'RUT', 'VIX'].includes(symbol) ? `_${symbol}` : symbol;
    const r = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/quotes/${idx}.json`, { signal: AbortSignal.timeout(6_000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    const px = Number(j?.data?.current_price);
    const at = Date.parse(String(j?.data?.last_trade_time ?? j?.timestamp ?? ''));
    return px > 0 ? { provider: 'cboe', price: px, at: Number.isFinite(at) ? at : null, delayed: true } : null;
  } catch { return null; }
}

const _cache = new Map<string, { at: number; report: CrossCheckReport }>();
const TTL_MS = 10 * 60_000;

export async function crossCheckPrices(rawSymbol: string, opts: { days?: number; force?: boolean } = {}): Promise<CrossCheckReport> {
  const symbol = rawSymbol.toUpperCase();
  const days = Math.min(60, Math.max(5, opts.days ?? 20));
  const key = `${symbol}:${days}`;
  const hit = _cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.report;

  const [y, a, yq, cb, platform] = await Promise.all([
    yahooDaily(symbol, days).catch(() => ({ provider: 'yahoo', bars: [], note: 'request failed' } as ProviderSeries)),
    alpacaDaily(symbol, days),
    yahooQuote(symbol).catch(() => null),
    cboeLast(symbol),
    import('./realtime-pricing-service').then((m) => m.getRealtimeQuote(symbol, 'stock')).catch(() => null),
  ]);

  const reads: LastPriceRead[] = [];
  if (yq) reads.push({ provider: 'yahoo', price: yq.price, at: yq.at, session: yq.session });
  if (cb) reads.push(cb);
  try {
    const { getLastEquityTrade } = await import('./live-equity-stream');
    const t = getLastEquityTrade(symbol, 60_000);
    if (t) reads.push({ provider: t.source, price: t.price, at: t.ts });
  } catch { /* stream not running */ }
  if (process.env.TRADIER_API_KEY) {
    try {
      const { getTradierQuote } = await import('./tradier-api');
      const tq: any = await getTradierQuote(symbol);
      if (tq?.last > 0) reads.push({ provider: 'tradier', price: tq.last, at: Number(tq.trade_date) || null });
    } catch { /* key dead */ }
  }

  const report = buildCrossCheck(symbol, [y, a], reads, {
    provider: (platform as any)?.source ?? null,
    price: (platform as any)?.price ?? null,
  });
  _cache.set(key, { at: Date.now(), report });
  return report;
}
