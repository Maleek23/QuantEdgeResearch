/**
 * Expiry settlement for the bot's bought options — the pure half (no DB, no
 * network), so scripts/test-journal.ts can pin the arithmetic.
 *
 * WHAT WAS WRONG (2026-09-29)
 * quant-bot.ts settled expiries from `pos.underlyingPrice ?? pos.currentUnderlyingPrice`
 * — columns paper_positions does not have — so every settlement would have
 * booked $0 (worthless) whatever the underlying did. And it only ever looked at
 * the ONE portfolio the bot was trading, so contracts in retired runs (PLUG,
 * AAPL, B from Run 2; COPX from the 10K pilot) sat "open" weeks past expiry with
 * realized_pnl 0 and a mark from the day the run stopped.
 *
 * THE RULE
 *   • Only bought OPTIONS settle. Shares never auto-close here.
 *   • A contract settles once its expiry session is over (a later New York day,
 *     or the same day after 16:15 ET so the daily bar exists).
 *   • Settlement value = intrinsic at the UNDERLYING'S CLOSE ON EXPIRY DAY:
 *     call max(0, S − K), put max(0, K − S). Time value is gone at expiry.
 *   • No close for that exact day → the row is NOT touched and the reason is
 *     reported. A neighbouring day's close is never substituted.
 *   • Exit time is expiry day 16:00 ET — when it actually settled, not when the
 *     reconciler happened to run. Exit reason 'expired'.
 */

export interface OpenBotOptionRow {
  id: string;
  portfolioId: string;
  symbol: string;
  assetType: string;
  status: string;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  entryPrice: number;
  quantity: number;
  currentPrice: number | null;
  lastPriceUpdate: string | null;
}

export interface ExpirySettlement {
  id: string;
  portfolioId: string;
  symbol: string;
  contract: string;
  quantity: number;
  entryPrice: number;
  expiryDay: string;
  underlyingClose: number;
  /** Provider of the expiry-day close (set by the I/O layer). */
  closeSource?: string;
  /** Settlement premium per share (intrinsic). */
  exitPrice: number;
  exitTime: string;
  realizedPnL: number;
  realizedPnLPercent: number;
  /** Cash credited back: exitPrice × qty × 100. */
  proceeds: number;
  /** What the open row claimed before: last mark and its unrealized P&L. */
  priorMark: number | null;
  priorMarkAt: string | null;
  priorUnrealizedPnL: number | null;
}

export interface ExpirySkip { id: string; symbol: string; contract: string; reason: string }

const etParts = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: `${v('year')}-${v('month')}-${v('day')}`, minute: (Number(v('hour')) % 24) * 60 + Number(v('minute')) };
};

/** ISO instant of 16:00 New York time on `day` (EDT or EST as that date had it). */
export function nyCloseIso(day: string): string {
  for (const utcHour of [20, 21]) {
    const iso = `${day}T${utcHour}:00:00.000Z`;
    const { day: d, minute } = etParts(new Date(iso));
    if (d === day && minute === 16 * 60) return iso;
  }
  return `${day}T20:00:00.000Z`;
}

/** Is the expiry session over at `now`? */
export function expirySessionOver(expiryDay: string, now: Date): boolean {
  const { day, minute } = etParts(now);
  if (expiryDay < day) return true;
  return expiryDay === day && minute >= 16 * 60 + 15;
}

export function contractLabel(r: Pick<OpenBotOptionRow, 'symbol' | 'strikePrice' | 'optionType' | 'expiryDate'>): string {
  return `${r.symbol} $${r.strikePrice}${(r.optionType ?? '?').charAt(0).toUpperCase()} ${String(r.expiryDate ?? '').slice(0, 10)}`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Which open rows are due, and which are not settleable (with why). No I/O. */
export function dueForSettlement(rows: OpenBotOptionRow[], now: Date): { due: OpenBotOptionRow[]; skipped: ExpirySkip[] } {
  const due: OpenBotOptionRow[] = [];
  const skipped: ExpirySkip[] = [];
  for (const r of rows) {
    if (r.status !== 'open' || r.assetType !== 'option') continue; // shares never auto-close
    const exp = String(r.expiryDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) { skipped.push({ id: r.id, symbol: r.symbol, contract: contractLabel(r), reason: 'no expiry date recorded' }); continue; }
    if (!expirySessionOver(exp, now)) continue;
    if (!(Number(r.strikePrice) > 0) || (r.optionType !== 'call' && r.optionType !== 'put')) {
      skipped.push({ id: r.id, symbol: r.symbol, contract: contractLabel(r), reason: 'strike / call-put not recorded' });
      continue;
    }
    due.push(r);
  }
  return { due, skipped };
}

/** Settle one due row at the underlying's close on expiry day. */
export function settleAtExpiry(r: OpenBotOptionRow, underlyingClose: number): ExpirySettlement {
  const k = Number(r.strikePrice);
  const intrinsic = r.optionType === 'call' ? Math.max(0, underlyingClose - k) : Math.max(0, k - underlyingClose);
  const exitPrice = r2(intrinsic);
  const qty = Number(r.quantity);
  const realizedPnL = r2((exitPrice - r.entryPrice) * qty * 100);
  const expiryDay = String(r.expiryDate).slice(0, 10);
  const priorUnrealizedPnL = r.currentPrice != null ? r2((r.currentPrice - r.entryPrice) * qty * 100) : null;
  return {
    id: r.id,
    portfolioId: r.portfolioId,
    symbol: r.symbol,
    contract: contractLabel(r),
    quantity: qty,
    entryPrice: r.entryPrice,
    expiryDay,
    underlyingClose,
    exitPrice,
    exitTime: nyCloseIso(expiryDay),
    realizedPnL,
    realizedPnLPercent: r.entryPrice > 0 ? r2(((exitPrice - r.entryPrice) / r.entryPrice) * 100) : 0,
    proceeds: r2(exitPrice * qty * 100),
    priorMark: r.currentPrice,
    priorMarkAt: r.lastPriceUpdate,
    priorUnrealizedPnL,
  };
}
