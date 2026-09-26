import { logger } from './logger';

export interface OptionMinuteBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionMinuteSeries {
  occSymbol: string;
  source: 'yahoo-opr-trades';
  priceBasis: 'reported-trade-ohlcv';
  delayed: boolean;
  bars: OptionMinuteBar[];
}

/** Yahoo's chart endpoint wants the compact OSI symbol without `O:` or spaces. */
export function normalizeYahooOptionSymbol(occSymbol: string): string {
  return occSymbol.trim().toUpperCase().replace(/^O:/, '').replace(/\s+/g, '');
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const nyMinuteFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function isRequestedRegularSession(timestampMs: number, requestedDate: string): boolean {
  const parts = Object.fromEntries(
    nyMinuteFormatter.formatToParts(new Date(timestampMs)).map((part) => [part.type, part.value]),
  );
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localMinute = Number(parts.hour) * 60 + Number(parts.minute);
  return localDate === requestedDate && localMinute >= 9 * 60 + 30 && localMinute < 16 * 60;
}

/**
 * Historical one-minute OPTION trades. These are reported OPR trade bars, not
 * reconstructed Greeks and not an underlying-price proxy. They are suitable
 * for an auditable mark-to-market replay. They are not NBBO, so a replay must
 * never call the close an executable bid/ask fill.
 */
export async function getHistoricalOptionMinutes(
  occSymbol: string,
  date: string,
): Promise<OptionMinuteSeries | null> {
  const symbol = normalizeYahooOptionSymbol(occSymbol);
  if (!/^[A-Z.]{1,6}\d{6}[CP]\d{8}$/.test(symbol)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const start = Math.floor(new Date(`${date}T00:00:00-04:00`).getTime() / 1000);
  const end = start + 36 * 60 * 60;
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set('period1', String(start));
  url.searchParams.set('period2', String(end));
  url.searchParams.set('interval', '1m');
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('events', 'div,splits');

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge/1.0' } });
    if (!response.ok) {
      logger.warn(`[OPTION-HISTORY] ${symbol} HTTP ${response.status}`);
      return null;
    }
    const payload: any = await response.json();
    const result = payload?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    if (!quote || timestamps.length === 0) return null;

    const byMinute = new Map<string, OptionMinuteBar>();
    for (let i = 0; i < timestamps.length; i++) {
      if (!isRequestedRegularSession(timestamps[i] * 1000, date)) continue;
      const open = finite(quote.open?.[i]);
      const high = finite(quote.high?.[i]);
      const low = finite(quote.low?.[i]);
      const close = finite(quote.close?.[i]);
      if (open == null || high == null || low == null || close == null) continue;
      const timestamp = new Date(timestamps[i] * 1000).toISOString();
      const bar = { timestamp, open, high, low, close, volume: Math.max(0, finite(quote.volume?.[i]) ?? 0) };
      const key = timestamp.slice(0, 16);
      const prior = byMinute.get(key);
      if (!prior || bar.volume >= prior.volume) byMinute.set(key, bar);
    }

    return {
      occSymbol: symbol,
      source: 'yahoo-opr-trades',
      priceBasis: 'reported-trade-ohlcv',
      delayed: true,
      bars: [...byMinute.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
  } catch (error) {
    logger.warn(`[OPTION-HISTORY] ${symbol} failed: ${error}`);
    return null;
  }
}

export function optionMarkAtOrAfter(bars: OptionMinuteBar[], at: string): OptionMinuteBar | null {
  const target = Date.parse(at);
  if (!Number.isFinite(target)) return null;
  return bars.find((bar) => Date.parse(bar.timestamp) >= target) ?? null;
}

export function replayOptionMarks(args: { series: OptionMinuteSeries; entryAt: string; exitAt: string }) {
  const entry = optionMarkAtOrAfter(args.series.bars, args.entryAt);
  const exit = optionMarkAtOrAfter(args.series.bars, args.exitAt);
  if (!entry || !exit || entry.close <= 0) return null;
  // Entry is the completed signal bar's close. Its earlier open/high/low all
  // happened before that decision and must not contaminate post-entry MFE/MAE.
  const postEntry = args.series.bars.filter((bar) => bar.timestamp > entry.timestamp && bar.timestamp <= exit.timestamp);
  const path = postEntry.length > 0 ? postEntry : [exit];
  const peak = path.reduce((best, bar) => bar.high > best.high ? bar : best, path[0]);
  const trough = path.reduce((worst, bar) => bar.low < worst.low ? bar : worst, path[0]);
  return {
    entry,
    exit,
    peak,
    trough,
    returnPct: ((exit.close / entry.close) - 1) * 100,
    peakReturnPct: ((peak.high / entry.close) - 1) * 100,
    maxAdversePct: ((trough.low / entry.close) - 1) * 100,
  };
}
