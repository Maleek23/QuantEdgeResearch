/**
 * EXTENDED-HOURS LEADERS — who is actually moving before the bell (and after it).
 *
 * The platform previously went blind outside 9:30–16:00: rotation correctly reported
 * "Aug 19 close · stale" and every signal sat still, because regular-session quotes
 * genuinely weren't moving. But pre-market IS where the day's leaders declare
 * themselves — gaps, earnings reactions, news. This reads the extended-hours tape.
 *
 * Yahoo's chart API exposes pre/post bars via includePrePost=true, and marks the current
 * session in meta.currentTradingPeriod. We compare the latest extended-hours print to the
 * prior regular-session close, which is exactly how a gap is quoted.
 */
import { logger } from './logger';

export type Session = 'pre' | 'regular' | 'post' | 'closed';

export interface ExtendedQuote {
  symbol: string;
  lastPrice: number;
  previousClose: number;
  changePct: number;
  session: Session;
  volume: number;
  /** true when the print came from outside the regular session */
  isExtended: boolean;
}

export interface ExtendedLeaders {
  generatedAt: string;
  session: Session;
  scanned: number;
  gainers: ExtendedQuote[];
  losers: ExtendedQuote[];
  mostActive: ExtendedQuote[];
  interpretation: string;
}

/** Which session a unix-second timestamp falls in, per Yahoo's own period bounds. */
function sessionAt(ts: number, periods: any): Session {
  const p = periods || {};
  const inRange = (x: any) => x && ts >= x.start && ts < x.end;
  const first = (v: any) => (Array.isArray(v) ? v[0] : v);
  if (inRange(first(p.pre))) return 'pre';
  if (inRange(first(p.regular))) return 'regular';
  if (inRange(first(p.post))) return 'post';
  return 'closed';
}

export async function fetchExtendedQuote(symbol: string): Promise<ExtendedQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?range=1d&interval=5m&includePrePost=true`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const body = await res.json();
    const r = body?.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta) return null;

    const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? 0);
    if (!previousClose) return null;

    const ts: number[] = r.timestamp || [];
    const closes: number[] = r.indicators?.quote?.[0]?.close || [];
    const vols: number[] = r.indicators?.quote?.[0]?.volume || [];

    // walk back to the most recent bar that actually printed
    let i = closes.length - 1;
    while (i >= 0 && (closes[i] == null || !Number.isFinite(closes[i]))) i--;
    const lastPrice = i >= 0 ? Number(closes[i]) : Number(meta.regularMarketPrice ?? 0);
    if (!lastPrice) return null;

    const barSession = i >= 0 ? sessionAt(ts[i], meta.currentTradingPeriod) : 'closed';
    const volume = i >= 0 ? Number(vols[i] ?? 0) : 0;

    return {
      symbol,
      lastPrice,
      previousClose,
      changePct: ((lastPrice - previousClose) / previousClose) * 100,
      session: barSession,
      volume,
      isExtended: barSession === 'pre' || barSession === 'post',
    };
  } catch (e: any) {
    logger.warn(`[EXT-HOURS] ${symbol}: ${e?.message}`);
    return null;
  }
}

/** Current session for the market as a whole (from a liquid proxy). */
export async function currentSession(): Promise<Session> {
  const spy = await fetchExtendedQuote('SPY');
  return spy?.session ?? 'closed';
}

export async function getExtendedLeaders(symbols: string[], limit = 10): Promise<ExtendedLeaders> {
  const CONCURRENCY = 8;
  const out: ExtendedQuote[] = [];
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(batch.map((s) => fetchExtendedQuote(s)));
    for (const r of rows) if (r) out.push(r);
  }

  const session = out.find((q) => q.symbol === 'SPY')?.session
    ?? (out.length ? out[0].session : 'closed');

  const ranked = [...out].sort((a, b) => b.changePct - a.changePct);
  const gainers = ranked.filter((q) => q.changePct > 0).slice(0, limit);
  const losers = ranked.filter((q) => q.changePct < 0).slice(-limit).reverse();
  const mostActive = [...out].sort((a, b) => b.volume - a.volume).slice(0, limit);

  const label = session === 'pre' ? 'Pre-market'
              : session === 'post' ? 'After-hours'
              : session === 'regular' ? 'Regular session' : 'Market closed';
  const interpretation = gainers.length
    ? `${label}: ${gainers[0].symbol} leads ${gainers[0].changePct >= 0 ? '+' : ''}${gainers[0].changePct.toFixed(1)}%` +
      `${gainers[1] ? `, then ${gainers[1].symbol} ${gainers[1].changePct >= 0 ? '+' : ''}${gainers[1].changePct.toFixed(1)}%` : ''}` +
      `${losers[0] ? `. Weakest is ${losers[0].symbol} ${losers[0].changePct.toFixed(1)}%` : ''}.` +
      `${session === 'pre' ? ' These are the names declaring themselves before the bell.' : ''}`
    : `${label}: nothing moving on the scanned names.`;

  return {
    generatedAt: new Date().toISOString(),
    session, scanned: out.length, gainers, losers, mostActive, interpretation,
  };
}
