/**
 * CASH INDICES ON THE CHART — one definition of what SPX (NDX, RUT, VIX) is,
 * what it can and cannot show, and the labelled proxies that fill the gaps.
 *
 *   canonicalChartSymbol('$SPX' | '^GSPC' | 'SPXW' | 'spx.x')  → 'SPX'
 *   INDEX_INFO.SPX                                              → Yahoo ^GSPC,
 *       volume proxy SPY, extended-hours proxy ES=F, option roots SPX + SPXW
 *
 * What a cash index does NOT have, and how the chart says so:
 *   - volume: an index is a calculation, not a security. Yahoo's ^GSPC
 *     "volume" is the summed share volume of the constituents — a different
 *     quantity from what a volume bar means everywhere else on the chart. The
 *     chart shows the ETF's (SPY's) traded volume instead, labelled as a proxy.
 *   - extended hours: SPX prints 09:30–16:00 ET only. Yahoo pads the series
 *     with flat post-close "settlement" bars (16:05–16:35 at the closing
 *     level); those are folded into the last regular bar, never drawn as
 *     trading. Pre/post/overnight is drawn from ES=F scaled to the index
 *     (index close ÷ future at that close), every bar flagged `proxy`.
 *   - VIX does print outside RTH (Cboe GTH, 03:15–09:15 ET) — its own bars
 *     are kept; it has no volume and no ETF/future proxy here.
 *
 * Pure functions only (no fetch) so the server, the client and the tests share
 * them. Bar times are epoch SECONDS (the /api/historical-prices shape).
 */

export interface IndexInfo {
  symbol: string;
  /** Yahoo chart symbol. */
  yahoo: string;
  name: string;
  /** ETF whose traded volume stands in for the index's (null: none). */
  volumeProxy: string | null;
  /** Future used for pre/post/overnight bars (null: none). */
  extendedProxy: string | null;
  /** OCC roots whose prints belong on this chart (Bullflow underlying). */
  optionRoots: string[];
  /** The index prints its own out-of-RTH session (VIX GTH). */
  ownExtendedSession: boolean;
  /** Rough index/ETF ratio — a sanity band for live ratios, never used as the ratio. */
  etfRatioApprox: number | null;
}

export const INDEX_INFO: Record<string, IndexInfo> = {
  SPX: { symbol: 'SPX', yahoo: '^GSPC', name: 'S&P 500 index (cash)', volumeProxy: 'SPY', extendedProxy: 'ES=F', optionRoots: ['SPX', 'SPXW'], ownExtendedSession: false, etfRatioApprox: 10.03 },
  NDX: { symbol: 'NDX', yahoo: '^NDX', name: 'Nasdaq-100 index (cash)', volumeProxy: 'QQQ', extendedProxy: 'NQ=F', optionRoots: ['NDX', 'NDXP'], ownExtendedSession: false, etfRatioApprox: 41 },
  RUT: { symbol: 'RUT', yahoo: '^RUT', name: 'Russell 2000 index (cash)', volumeProxy: 'IWM', extendedProxy: 'RTY=F', optionRoots: ['RUT', 'RUTW'], ownExtendedSession: false, etfRatioApprox: 10 },
  VIX: { symbol: 'VIX', yahoo: '^VIX', name: 'Cboe Volatility index', volumeProxy: null, extendedProxy: null, optionRoots: ['VIX', 'VIXW'], ownExtendedSession: true, etfRatioApprox: null },
};

/** Alias → canonical. Keys are already upper-cased with $ / .X / leading dot stripped. */
const ALIASES: Record<string, string> = {
  SPXW: 'SPX', GSPC: 'SPX', '^GSPC': 'SPX', '^SPX': 'SPX', INX: 'SPX', '^INX': 'SPX',
  NDXP: 'NDX', '^NDX': 'NDX',
  RUTW: 'RUT', '^RUT': 'RUT',
  VIXW: 'VIX', '^VIX': 'VIX',
};

/**
 * The terminal's one name for a symbol. "$SPX", "SPX.X", ".SPX", "^GSPC",
 * "SPXW" → "SPX"; ordinary tickers only lose whitespace/case ("nvda" → "NVDA").
 * Crypto (BTC-USD), futures (ES=F) and unknown caret symbols (^TNX) pass through.
 */
export function canonicalChartSymbol(raw: string | null | undefined): string {
  let s = String(raw ?? '').trim();
  try { s = decodeURIComponent(s); } catch { /* already plain */ }
  s = s.trim().toUpperCase();
  if (s.startsWith('$')) s = s.slice(1);
  if (s.startsWith('.') && s.length > 1) s = s.slice(1);
  if (s.endsWith('.X') && s.length > 2) s = s.slice(0, -2);
  return ALIASES[s] ?? s;
}

export function indexInfo(sym: string): IndexInfo | null {
  return INDEX_INFO[canonicalChartSymbol(sym)] ?? null;
}

export const isCashIndex = (sym: string): boolean => indexInfo(sym) != null;

/** OCC roots whose option prints belong on `sym`'s chart. */
export function optionRootsFor(sym: string): string[] {
  const c = canonicalChartSymbol(sym);
  return INDEX_INFO[c]?.optionRoots ?? [c];
}

/* ── time ─────────────────────────────────────────────────────────────── */

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});

/** ET calendar date + minutes after midnight for an epoch-ms instant. */
export function etDayMinutes(ms: number): { date: string; mins: number; weekday: string } {
  const p: Record<string, string> = {};
  for (const part of ET_FMT.formatToParts(ms)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
}

export const RTH_OPEN_MIN = 570;  // 09:30 ET
export const RTH_CLOSE_MIN = 960; // 16:00 ET

export function isRthBar(timeSec: number): boolean {
  const { mins, weekday } = etDayMinutes(timeSec * 1000);
  return weekday !== 'Sat' && weekday !== 'Sun' && mins >= RTH_OPEN_MIN && mins < RTH_CLOSE_MIN;
}

/* ── bars ─────────────────────────────────────────────────────────────── */

export interface IdxBar { time: number; open: number; high: number; low: number; close: number; volume: number; proxy?: boolean }

const INTRADAY_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h']);
export const isIntradayInterval = (interval: string) => INTRADAY_INTERVALS.has(interval);

/**
 * Regular-session-only intraday bars for a cash index that has no extended
 * session. Pre-09:30 bars are dropped. Yahoo's flat post-16:00 bars (the
 * closing level re-printed while the settlement is published) are folded into
 * that day's last regular bar — their close IS the official close, so the
 * chart's last regular bar ends on it — and never drawn as their own candles.
 */
export function foldIndexSession<T extends IdxBar>(bars: T[]): T[] {
  const out: T[] = [];
  for (const b of bars) {
    const { date, mins, weekday } = etDayMinutes(b.time * 1000);
    if (weekday === 'Sat' || weekday === 'Sun' || mins < RTH_OPEN_MIN) continue;
    if (mins >= RTH_CLOSE_MIN) {
      const last = out[out.length - 1];
      if (last && etDayMinutes(last.time * 1000).date === date) {
        out[out.length - 1] = {
          ...last,
          high: Math.max(last.high, b.high),
          low: Math.min(last.low, b.low),
          close: b.close,
        };
      }
      continue;
    }
    out.push(b);
  }
  return out;
}

/**
 * Replace the index's volume with the proxy ETF's traded volume on the same bar
 * (same timestamp; daily bars match by ET date). A bar the ETF has no row for
 * gets 0 — "not available", drawn as whitespace — never the index figure.
 */
export function joinProxyVolume<T extends IdxBar>(indexBars: T[], etfBars: IdxBar[], daily: boolean): T[] {
  const byTime = new Map<number, number>();
  const byDate = new Map<string, number>();
  for (const e of etfBars) {
    byTime.set(e.time, e.volume);
    if (daily) byDate.set(etDayMinutes(e.time * 1000).date, e.volume);
  }
  return indexBars.map((b) => {
    const v = byTime.get(b.time) ?? (daily ? byDate.get(etDayMinutes(b.time * 1000).date) : undefined);
    return { ...b, volume: Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0 };
  });
}

export interface ExtendedProxyResult {
  bars: IdxBar[];
  /** One entry per index close used as an anchor. */
  anchors: Array<{ date: string; indexClose: number; futureAtClose: number; ratio: number }>;
}

/**
 * Pre-market, post-market and overnight bars for a cash index, drawn from its
 * future. Each out-of-RTH future bar is scaled by the ratio at the most recent
 * index close before it: index close ÷ the future's close on the bar covering
 * that close. So the first proxy bar after the close starts at the index's own
 * closing level and the gap into the next open is the future's move, in index
 * points. Every bar carries `proxy: true`; nothing is emitted inside RTH, before
 * the first index close in the window, or where the future has no bar at the
 * anchor (no anchor → no invented level).
 */
export function buildFutureProxyBars(indexRth: IdxBar[], futureBars: IdxBar[]): ExtendedProxyResult {
  const anchors: ExtendedProxyResult['anchors'] = [];
  if (!indexRth.length || !futureBars.length) return { bars: [], anchors };
  // The last regular bar of each ET date = that session's close.
  const closes: Array<{ time: number; date: string; close: number }> = [];
  for (const b of indexRth) {
    const date = etDayMinutes(b.time * 1000).date;
    const last = closes[closes.length - 1];
    if (last && last.date === date) { last.time = b.time; last.close = b.close; } else closes.push({ time: b.time, date, close: b.close });
  }
  const futSorted = [...futureBars].sort((a, b) => a.time - b.time);
  const futAt = (t: number): number | null => {
    // future bar starting at or before t (the one covering the index's last bar)
    let lo = 0; let hi = futSorted.length - 1; let ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (futSorted[m].time <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    if (ans < 0) return null;
    // An anchor more than 30 min from the close is not "the future at the close".
    return t - futSorted[ans].time <= 1800 ? futSorted[ans].close : null;
  };
  const ratios = closes.map((c) => {
    const f = futAt(c.time);
    const ratio = f && f > 0 ? c.close / f : null;
    if (ratio != null) anchors.push({ date: c.date, indexClose: c.close, futureAtClose: f!, ratio });
    return { ...c, ratio };
  });
  const out: IdxBar[] = [];
  let k = -1;
  for (const f of futSorted) {
    while (k + 1 < ratios.length && ratios[k + 1].time < f.time) k++;
    if (k < 0) continue;
    const a = ratios[k];
    if (a.ratio == null || f.time <= a.time) continue;
    if (isRthBar(f.time)) continue;
    const r = a.ratio;
    const round = (x: number) => Math.round(x * r * 100) / 100;
    out.push({ time: f.time, open: round(f.open), high: round(f.high), low: round(f.low), close: round(f.close), volume: 0, proxy: true });
  }
  return { bars: out, anchors };
}

/**
 * Overnight high/low (proxy bars) relevant at `nowMs`: during or after a
 * regular session, the window between the prior close and today's open; before
 * today's open, the window since the last close (still forming). Null when the
 * window has no bars.
 */
export function overnightRange(indexRth: IdxBar[], proxyBars: IdxBar[], nowMs: number): { high: number; low: number; fromSec: number; toSec: number; bars: number; forming: boolean } | null {
  if (!indexRth.length || !proxyBars.length) return null;
  const today = etDayMinutes(nowMs).date;
  const lastRth = indexRth[indexRth.length - 1];
  const lastDate = etDayMinutes(lastRth.time * 1000).date;
  let from: number; let to: number; let forming: boolean;
  if (lastDate === today) {
    // Today's session has printed: the overnight that led into it.
    const firstToday = indexRth.find((b) => etDayMinutes(b.time * 1000).date === today)!;
    const prior = [...indexRth].reverse().find((b) => b.time < firstToday.time && etDayMinutes(b.time * 1000).date !== today);
    if (!prior) return null;
    from = prior.time; to = firstToday.time; forming = false;
  } else {
    from = lastRth.time; to = Math.floor(nowMs / 1000) + 1; forming = true;
  }
  const w = proxyBars.filter((b) => b.time > from && b.time < to);
  if (!w.length) return null;
  return { high: Math.max(...w.map((b) => b.high)), low: Math.min(...w.map((b) => b.low)), fromSec: w[0].time, toSec: w[w.length - 1].time, bars: w.length, forming };
}

/**
 * Index ÷ ETF ratio for carrying ETF price levels (dark-pool prints) onto the
 * index. Prices observed within 2 min of each other → live ratio; otherwise the
 * two regular closes (same instant by construction). Rejected outside ±20% of
 * the known ratio so a stale or mis-mapped quote cannot move levels by 10×.
 */
export function indexEtfRatio(
  sym: string,
  idx: { price: number; at: number; regularClose?: number | null } | null,
  etf: { price: number; at: number; regularClose?: number | null } | null,
): { ratio: number; basis: 'live' | 'regular-close' } | null {
  const info = indexInfo(sym);
  if (!info?.etfRatioApprox || !idx || !etf) return null;
  const ok = (r: number) => Number.isFinite(r) && r > info.etfRatioApprox! * 0.8 && r < info.etfRatioApprox! * 1.25;
  if (idx.price > 0 && etf.price > 0 && Math.abs(idx.at - etf.at) <= 120_000) {
    const r = idx.price / etf.price;
    if (ok(r)) return { ratio: r, basis: 'live' };
  }
  if (idx.regularClose && etf.regularClose && idx.regularClose > 0 && etf.regularClose > 0) {
    const r = idx.regularClose / etf.regularClose;
    if (ok(r)) return { ratio: r, basis: 'regular-close' };
  }
  return null;
}
