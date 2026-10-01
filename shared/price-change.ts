/**
 * DAY CHANGE — the one definition of "% change today" on the platform.
 * ====================================================================
 * Pure functions over a Yahoo v8 chart payload (or plain bar arrays), safe on
 * server and client.
 *
 *   price          = latest non-null print in the payload (pre/post included when
 *                    the request asked for includePrePost) — a live number, never a
 *                    carried close.
 *   previousClose  = the prior REGULAR-session close.
 *   changePercent  = (price − previousClose) / previousClose × 100   (percent, not fraction)
 *   session        = which session the latest print came from, so a surface can
 *                    label an after-hours move instead of passing it off as the day.
 *
 * Why this exists (consistency audit 2026-09-29): Yahoo's `chartPreviousClose` is
 * the close BEFORE THE FIRST BAR OF THE REQUESTED RANGE. It is yesterday's close
 * only for range=1d. /api/market-pulse used range=2d (SPY "today" = a 2-day move:
 * −0.93% on prod while the session was −0.18%), its breadth used range=3mo (advance
 * = up over three months), /api/realtime-quote used range=1y. For any range other
 * than 1d, derive the prior close from the daily bars instead.
 */

export type QuoteSession = 'pre' | 'regular' | 'post' | 'closed';

export interface DayChange {
  price: number;
  previousClose: number;
  change: number;
  /** Percent (−0.18 means −0.18%). */
  changePercent: number;
  /** ms epoch of the print `price` came from (bar time), or null when unknown. */
  at: number | null;
  session: QuoteSession;
  /** Regular-session last and its change, when the payload carries it. */
  regularMarketPrice: number | null;
  regularChangePercent: number | null;
}

export function pctChange(price: number, prev: number): number | null {
  if (!(price > 0) || !(prev > 0)) return null;
  return ((price - prev) / prev) * 100;
}

/** Session of a unix-seconds timestamp given Yahoo's currentTradingPeriod block. */
export function sessionAt(tsSec: number | null, period: any): QuoteSession {
  if (tsSec == null || !period) return 'closed';
  const inP = (p: any) => p && Number.isFinite(p.start) && Number.isFinite(p.end) && tsSec >= p.start && tsSec < p.end;
  if (inP(period.regular)) return 'regular';
  if (inP(period.pre)) return 'pre';
  if (inP(period.post)) return 'post';
  return 'closed';
}

/**
 * Prior regular close from DAILY bars: the close of the bar before the latest
 * bar. Works for any range ≥ 2d with interval=1d. Null when fewer than 2 bars.
 */
export function priorCloseFromDaily(closes: Array<number | null | undefined>): { last: number; prev: number } | null {
  const vals = closes.filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0);
  if (vals.length < 2) return null;
  return { last: vals[vals.length - 1], prev: vals[vals.length - 2] };
}

/**
 * Canonical day change from a Yahoo chart `result[0]` fetched with range=1d
 * (any intraday interval, pre/post optional). Returns null when there is no price.
 */
export function dayChangeFromIntradayChart(res: any): DayChange | null {
  const m = res?.meta;
  if (!m) return null;
  const closes: unknown[] = res.indicators?.quote?.[0]?.close ?? [];
  const ts: unknown[] = res.timestamp ?? [];
  let i = closes.length - 1;
  // Number(null) is 0 and finite — test the raw value, or a trailing null bar
  // (Yahoo pads the current minute) silently drops us back to the regular close.
  const usable = (v: unknown) => v != null && Number.isFinite(Number(v)) && Number(v) > 0;
  while (i >= 0 && !usable(closes[i])) i--;
  const barPrice = i >= 0 ? Number(closes[i]) : NaN;
  const regular = Number(m.regularMarketPrice);
  const price = Number.isFinite(barPrice) && barPrice > 0 ? barPrice : regular;
  if (!(price > 0)) return null;
  const barAt = Number(ts[i]);
  const at = Number.isFinite(barAt) && barAt > 0 ? barAt * 1000 : null;
  // Prior REGULAR close. Usually meta.previousClose — but before today's open
  // Yahoo's previousClose is the close BEFORE regularMarketPrice's session (D-2),
  // so a pre-market print measured against it double-counted yesterday's move.
  const prev = priorRegularCloseFromMeta(m, at != null ? at / 1000 : 0);
  const prevOk = prev != null && prev > 0 ? prev : price;
  const pct = pctChange(price, prevOk) ?? 0;
  return {
    price,
    previousClose: prevOk,
    change: price - prevOk,
    changePercent: pct,
    at,
    session: sessionAt(at != null ? at / 1000 : null, m.currentTradingPeriod),
    regularMarketPrice: regular > 0 ? regular : null,
    regularChangePercent: regular > 0 ? pctChange(regular, prevOk) : null,
  };
}

/**
 * The regular close a print at `printSec` should be measured against.
 *
 * Measured 2026-10-01 07:04 ET on SPY range=1d: currentTradingPeriod = Oct 1,
 * regularMarketTime = Sep 30 16:00 (762.63), previousClose = 764.20 = the Sep 29
 * close. So before today's regular session starts, the prior regular close is
 * regularMarketPrice, not previousClose. Applied only when the print is newer
 * than regularMarketTime (a real pre-market/overnight print); otherwise the
 * classic previousClose (day move, incl. after-hours) is kept.
 */
export function priorRegularCloseFromMeta(m: any, printSec: number | null = null): number | null {
  if (!m) return null;
  const prev = Number(m.previousClose ?? m.chartPreviousClose);
  const rmp = Number(m.regularMarketPrice);
  const rmt = Number(m.regularMarketTime);
  const regStart = Number(m.currentTradingPeriod?.regular?.start);
  const beforeTodaysOpen = Number.isFinite(rmt) && Number.isFinite(regStart) && rmt < regStart;
  const printAfterClose = printSec == null || (Number.isFinite(rmt) && printSec > rmt);
  if (beforeTodaysOpen && printAfterClose && rmp > 0) return rmp;
  return prev > 0 ? prev : null;
}

/** Convert a provider (price, changePercent) pair to an absolute change without assuming price is the base. */
export function changeFromPercent(price: number, changePercent: number): number {
  if (!(price > 0) || !Number.isFinite(changePercent) || changePercent <= -100) return 0;
  const prev = price / (1 + changePercent / 100);
  return price - prev;
}

/**
 * Prior regular close from a DAILY chart result (range ≥ 2d, interval=1d): the close
 * of the session before the one `regularMarketPrice` belongs to. Handles both the
 * case where the latest daily bar is that session (after the open) and where it is
 * not yet printed (pre-market). Null when it cannot be determined.
 */
export function priorRegularCloseFromDailyChart(res: any): number | null {
  const m = res?.meta;
  const closes: unknown[] = res?.indicators?.quote?.[0]?.close ?? [];
  const ts: unknown[] = res?.timestamp ?? [];
  const bars: Array<{ day: string; close: number }> = [];
  const dayOf = (sec: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(sec * 1000));
  for (let i = 0; i < closes.length; i++) {
    const c = Number(closes[i]); const t = Number(ts[i]);
    if (Number.isFinite(c) && c > 0 && Number.isFinite(t)) bars.push({ day: dayOf(t), close: c });
  }
  if (!bars.length) return null;
  const rmt = Number(m?.regularMarketTime);
  const sessionDay = Number.isFinite(rmt) ? dayOf(rmt) : bars[bars.length - 1].day;
  const before = bars.filter((b) => b.day < sessionDay);
  return before.length ? before[before.length - 1].close : null;
}
