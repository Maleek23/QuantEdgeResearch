/**
 * Options that EXPIRED with no closing fill in a broker export.
 *
 * WHAT WAS WRONG (accuracy audit, 2026-09-29)
 * A broker order export only lists orders. A bought option that is held to
 * expiry has no sell order, so the CSV pairing left it "open" forever — and
 * every journal number (net P&L, win rate, profit factor, drawdown, by-ticker,
 * by-DTE…) silently skipped it. On the operator's Webull exports that was 106
 * expired contracts / $10,014 of premium: the journal said +$9,038 while the
 * premium actually spent said about −$976.
 *
 * THE RULE
 *   • Only OPTIONS, only rows from a broker CSV import (the bot and the trade
 *     desk settle their own expiries; manual / Discord rows are left alone).
 *   • The contract settles once its expiry session is over: a later New York
 *     day, or the expiry day after 16:15 ET.
 *   • Settlement is at $0 — "expired worthless". The export cannot tell us the
 *     underlying's close, so a contract that finished IN the money (cash-settled
 *     SPX/SPXW, or auto-exercised) is understated; every such row says so and is
 *     flagged `expiredAssumed` so the UI can name the count and the dollars.
 *   • Exit time = expiry day 16:00 ET (when it settled, not when we noticed).
 */

/** Broker values written by the CSV importer (server/broker-csv-parser.ts). */
export const CSV_IMPORT_BROKERS: ReadonlySet<string> = new Set(['webull', 'robinhood', 'schwab', 'tda', 'ibkr', 'etrade', 'fidelity', 'tastytrade', 'csv']);

export const EXPIRED_ASSUMED_NOTE = 'Expired — no closing fill in the broker export; settled at $0 (assumed worthless). If it finished in the money (cash-settled or exercised), edit the exit.';

const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function etDayMinute(d: Date): { day: string; minute: number } {
  const p = ET.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, minute: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

/** Marks a row the importer (or this module) settled at $0. */
export const EXPIRED_NOTE_HEAD = 'Expired — no closing fill in the broker export';

/** 16:00 New York on `day` (YYYY-MM-DD) as an ISO instant (EDT or EST). */
export function expiryCloseIso(day: string): string {
  for (const utcHour of [20, 21]) {
    const iso = `${day}T${utcHour}:00:00.000Z`;
    const p = etDayMinute(new Date(iso));
    if (p.day === day && p.minute === 16 * 60) return iso;
  }
  return `${day}T20:00:00.000Z`;
}

/** Is the expiry session of `expiryDay` over at `nowMs`? */
export function expiryOver(expiryDay: string, nowMs: number): boolean {
  const { day, minute } = etDayMinute(new Date(nowMs));
  if (expiryDay < day) return true;
  return expiryDay === day && minute >= 16 * 60 + 15;
}

/** The fields the rule reads/writes — satisfied by JournalTradeRow and the parser's ParsedTrade-derived rows. */
export interface ExpirableRow {
  assetType: string;
  direction: string;
  status: string;
  broker: string;
  expiryDate?: string | null;
  entryPrice: number;
  quantity: number;
  fees?: number | null;
  entryTime: string;
  exitTime?: string | null;
  exitPrice?: number | null;
  realizedPnL?: number | null;
  notes?: string | null;
}

/** An open, CSV-imported option whose expiry session is over. */
export function isExpiredUnclosed(row: ExpirableRow, nowMs: number): boolean {
  if (row.status !== 'open' || row.assetType !== 'option' || !row.expiryDate) return false;
  if (!CSV_IMPORT_BROKERS.has((row.broker ?? '').toLowerCase())) return false;
  const day = String(row.expiryDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return expiryOver(day, nowMs);
}

/** Settlement of such a row at $0: long loses the premium paid, short keeps the premium received. */
export function expiredSettlement(row: ExpirableRow) {
  const day = String(row.expiryDate).slice(0, 10);
  const exitTime = expiryCloseIso(day);
  const qty = Math.abs(Number(row.quantity) || 0);
  const premium = Math.abs(Number(row.entryPrice) || 0) * qty * 100;
  const fees = Math.abs(Number(row.fees) || 0);
  const gross = row.direction === 'short' ? premium : -premium;
  const realizedPnL = Math.round((gross - fees) * 100) / 100;
  const entryMs = Date.parse(row.entryTime);
  return {
    status: 'closed' as const,
    exitPrice: 0,
    exitTime,
    realizedPnL,
    grossPnL: Math.round(gross * 100) / 100,
    realizedPnLPercent: premium > 0 ? Math.round((realizedPnL / premium) * 10000) / 100 : null,
    holdingMinutes: Number.isFinite(entryMs) ? Math.max(0, Math.round((Date.parse(exitTime) - entryMs) / 60000)) : null,
    outcome: realizedPnL > 0 ? 'win' : realizedPnL < 0 ? 'loss' : 'breakeven',
    expiredAssumed: true as const,
  };
}

/**
 * Client read-side: rows the server already settled keep its values (intrinsic
 * or $0-unverified). A row still OPEN past expiry (imported before either rule,
 * not yet re-settled) is closed at $0 here — the client has no close, so it
 * reads as unverified until "Re-settle expired options" runs on the server.
 */
export function settleExpiredRows<T extends ExpirableRow>(rows: T[], nowMs = Date.now()): (T & { expiredAssumed?: boolean })[] {
  let changed = false;
  const out = rows.map((r) => {
    // Server-settled (intrinsic / zero marker, or the older $0 import): keep the server's values, just flag it.
    if (r.status === 'closed' && isExpirySettledNote(r.notes)) { changed = true; return { ...r, expiredAssumed: true }; }
    if (!isExpiredUnclosed(r, nowMs)) return r;
    changed = true;
    const s = expiredSettlement(r);
    return { ...r, ...s, notes: r.notes ? `${r.notes}\n${EXPIRED_ASSUMED_NOTE}` : EXPIRED_ASSUMED_NOTE };
  });
  return changed ? out : rows;
}

// ─── Settlement at INTRINSIC (feat/settle, 2026-09-29) ─────────────────────────
//
// $0 understates every contract that finished in the money (the operator's book
// is ~100 such lots, many SPXW 0DTE). The server now settles each expired lot at
// its intrinsic value from the underlying's official print on the expiry date:
//   call max(0, S − K) · put max(0, K − S) · P&L = (intrinsic − entry) × qty × 100
//   (sign by side, minus fees). Exit time stays 16:00 ET on expiry day.
// Which print S is:
//   • SPXW / NDXP / RUTW / XSP (PM-settled, cash)  → index close on expiry day
//     (XSP = ^GSPC / 10).
//   • SPX / NDX / RUT monthlies (root without the W/P, 3rd Friday) are AM-settled
//     on the Special Opening Quotation, which we do not have → the index OPEN of
//     expiry day, flagged "approximate: AM-settled". The same roots on any other
//     day are PM weeklies under the old root → close.
//   • Equity / ETF options → the stock's close. They are physically settled
//     (auto-exercise at ≥ $0.01 ITM); we record the lot closed at intrinsic with
//     "auto-exercise assumed" and never invent a share position.
//   • No print for that exact day (or no source, e.g. VIX) → stays $0 and says
//     "unverified — no close available". A neighbouring day is never used.
// Every settled row carries a machine-readable marker in its notes:
//   [expiry-settlement:intrinsic px=12.34 S=6612.34]  or  [expiry-settlement:zero]
// so the re-settle endpoint and the client can tell a settlement from a real
// exit (and from an exit the operator edited by hand: px no longer matches).

export type ExpirySettlementSource = 'intrinsic' | 'zero' | 'legacy';

export interface SettlementUnderlying {
  /** Yahoo chart symbol (^GSPC, ^NDX, ^RUT, or the stock). */
  symbol: string;
  kind: 'index' | 'equity';
  /** Which print of the expiry day settles the contract. */
  field: 'close' | 'open';
  /** XSP settles on ^GSPC / 10. */
  scale: number;
  style: 'pm-cash' | 'am-cash' | 'physical';
  /** Set when the print is a stand-in for the real settlement value. */
  approximate?: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Third Friday of the month (standard monthly expiry). */
export function isThirdFriday(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDay() !== 5) return false;
  const dom = d.getUTCDate();
  return dom >= 15 && dom <= 21;
}

const AM_NOTE = 'approximate: AM-settled (SOQ not available — expiry-day open used)';
/** Index roots whose settlement print we cannot source honestly (VIX: Wednesday SOQ; DJX/OEX/XEO: AM). */
const NO_SOURCE_ROOTS = new Set(['VIX', 'VIXW', 'DJX', 'OEX', 'XEO', 'MRUT', 'MXEF', 'MXEA']);

/** Where the settlement print of an option on `root` expiring `day` comes from; null = no honest source. */
export function settlementUnderlying(root: string, day: string): SettlementUnderlying | null {
  const r = String(root || '').trim().toUpperCase().replace(/^\^/, '');
  if (!r || NO_SOURCE_ROOTS.has(r)) return null;
  const idx = (symbol: string, amRoot: boolean, scale = 1): SettlementUnderlying =>
    amRoot && isThirdFriday(day)
      ? { symbol, kind: 'index', field: 'open', scale, style: 'am-cash', approximate: AM_NOTE }
      : { symbol, kind: 'index', field: 'close', scale, style: 'pm-cash' };
  switch (r) {
    case 'SPXW': return idx('^GSPC', false);
    case 'SPX': return idx('^GSPC', true);
    case 'NDXP': return idx('^NDX', false);
    case 'NDX': return idx('^NDX', true);
    case 'RUTW': return idx('^RUT', false);
    case 'RUT': return idx('^RUT', true);
    case 'XSP': return idx('^GSPC', false, 0.1);
    default:
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(r)) return null;
      return { symbol: r.replace(/\./g, '-'), kind: 'equity', field: 'close', scale: 1, style: 'physical' };
  }
}

/** Intrinsic value per share at settlement. */
export function intrinsicValue(optionType: string | null | undefined, strike: number, underlying: number): number {
  const t = String(optionType || '').toLowerCase();
  if (!Number.isFinite(strike) || !Number.isFinite(underlying)) return 0;
  return round2(Math.max(0, t === 'put' ? strike - underlying : underlying - strike));
}

const MARKER_RE = /\[expiry-settlement:(intrinsic|zero)(?: px=(-?[\d.]+))?(?: S=(-?[\d.]+))?( approx)?\]/;

export interface ExpiryMarker { source: ExpirySettlementSource; px: number; S: number | null; approximate: boolean }

/** Read the settlement marker from a row's notes; 'legacy' = the $0 rule before this change (no marker). */
export function parseExpiryMarker(notes: string | null | undefined): ExpiryMarker | null {
  if (!notes) return null;
  const m = MARKER_RE.exec(notes);
  if (m) return { source: m[1] as 'intrinsic' | 'zero', px: m[1] === 'intrinsic' ? Number(m[2] ?? 0) : 0, S: m[3] != null ? Number(m[3]) : null, approximate: !!m[4] };
  if (notes.includes(EXPIRED_NOTE_HEAD)) return { source: 'legacy', px: 0, S: null, approximate: false };
  return null;
}

/** Rows whose realized value came from the expiry rule, not a fill. */
export function isExpirySettledNote(notes: string | null | undefined): boolean {
  return parseExpiryMarker(notes) != null;
}

/** Replace the expiry line(s) of a note, keeping everything the operator wrote. */
export function replaceExpiryNote(notes: string | null | undefined, line: string): string {
  const kept = String(notes ?? '').split('\n').filter((l) => l.trim() && !l.includes(EXPIRED_NOTE_HEAD) && !MARKER_RE.test(l));
  return [...kept, line].join('\n');
}

const fmtPx = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface IntrinsicInput extends ExpirableRow {
  symbol: string;
  optionType?: string | null;
  strikePrice?: number | null;
}

export interface ExpiryPrint { open: number; close: number; source?: string }

/**
 * Settle one expired lot. `print` = the underlying's daily bar on expiry day
 * (null = unavailable). Returns the row fields to write plus the note line.
 */
export function intrinsicSettlement(row: IntrinsicInput, print: ExpiryPrint | null) {
  const day = String(row.expiryDate).slice(0, 10);
  const exitTime = expiryCloseIso(day);
  const qty = Math.abs(Number(row.quantity) || 0);
  const entry = Math.abs(Number(row.entryPrice) || 0);
  const premium = entry * qty * 100;
  const fees = Math.abs(Number(row.fees) || 0);
  const strike = Number(row.strikePrice);
  const src = settlementUnderlying(row.symbol, day);
  const raw = print && src ? Number(src.field === 'open' ? print.open : print.close) : NaN;
  const S = Number.isFinite(raw) && raw > 0 && src ? round2(raw * src.scale) : null;
  const ok = S != null && Number.isFinite(strike) && strike > 0 && !!row.optionType;
  const exitPrice = ok ? intrinsicValue(row.optionType, strike, S!) : 0;
  const gross = (row.direction === 'short' ? entry - exitPrice : exitPrice - entry) * qty * 100;
  const realizedPnL = round2(gross - fees);
  const entryMs = Date.parse(row.entryTime);
  const contract = `${row.symbol} ${Number.isFinite(strike) ? strike : '?'}${String(row.optionType || '').toLowerCase() === 'put' ? 'P' : 'C'} ${day}`;
  let noteLine: string;
  let source: 'intrinsic' | 'zero';
  if (ok) {
    source = 'intrinsic';
    const printName = `${src!.symbol}${src!.scale !== 1 ? ` ÷ ${1 / src!.scale}` : ''} ${src!.field}`;
    noteLine = `${EXPIRED_NOTE_HEAD}; settled at intrinsic $${fmtPx(exitPrice)} (${contract} vs ${printName} ${fmtPx(S!)} on ${day})`
      + (exitPrice > 0 && src!.style === 'physical' ? ' — auto-exercise assumed (physically settled; no share position recorded)' : '')
      + (src!.approximate ? ` — ${src!.approximate}` : '')
      + `. [expiry-settlement:intrinsic px=${exitPrice} S=${S}${src!.approximate ? ' approx' : ''}]`;
  } else {
    source = 'zero';
    const why = !src ? `no settlement source for ${row.symbol}` : !(Number.isFinite(strike) && strike > 0) || !row.optionType ? 'strike/type missing' : `no ${src.symbol} ${src.field} available for ${day}`;
    noteLine = `${EXPIRED_NOTE_HEAD}; settled at $0 — unverified — no close available (${why}). If it finished in the money, edit the exit. [expiry-settlement:zero]`;
  }
  return {
    source,
    underlying: src?.symbol ?? null,
    underlyingPrint: S,
    approximate: ok && !!src?.approximate,
    status: 'closed' as const,
    exitPrice,
    exitTime,
    realizedPnL,
    grossPnL: round2(gross),
    realizedPnLPercent: premium > 0 ? Math.round((realizedPnL / premium) * 10000) / 100 : null,
    holdingMinutes: Number.isFinite(entryMs) ? Math.max(0, Math.round((Date.parse(exitTime) - entryMs) / 60000)) : null,
    outcome: (realizedPnL > 0 ? 'win' : realizedPnL < 0 ? 'loss' : 'breakeven') as 'win' | 'loss' | 'breakeven',
    noteLine,
  };
}

/**
 * May the re-settle touch this row? Only a CSV-imported option closed BY THE
 * EXPIRY RULE, still carrying the value the rule wrote (an exit the operator
 * edited by hand no longer matches and is left alone), or an expired lot that
 * is still open (imported before either rule).
 */
export function resettleEligible(row: IntrinsicInput & { status: string }, nowMs = Date.now()): boolean {
  if (row.assetType !== 'option' || !CSV_IMPORT_BROKERS.has((row.broker ?? '').toLowerCase())) return false;
  const day = String(row.expiryDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  if (row.status === 'open') return isExpiredUnclosed(row, nowMs);
  if (row.status !== 'closed') return false;
  const mk = parseExpiryMarker(row.notes);
  if (!mk) return false;
  if (!row.exitTime || Date.parse(String(row.exitTime)) !== Date.parse(expiryCloseIso(day))) return false;
  return Math.abs(Number(row.exitPrice ?? 0) - mk.px) < 0.005;
}

export interface ExpiryCounts { n: number; worthless: number; itm: number; unverified: number; approximate: number; pnl: number }

/** Counts for the basis line: N settled at intrinsic (M worthless, K in the money, J unverified). */
export function expiryCounts(rows: { expiredAssumed?: boolean; notes?: string | null; realizedPnL?: number | null; exitPrice?: number | null }[]): ExpiryCounts {
  const c: ExpiryCounts = { n: 0, worthless: 0, itm: 0, unverified: 0, approximate: 0, pnl: 0 };
  for (const r of rows) {
    if (!r.expiredAssumed) continue;
    c.n++;
    c.pnl += Number(r.realizedPnL ?? 0);
    const mk = parseExpiryMarker(r.notes);
    if (mk?.source !== 'intrinsic') { c.unverified++; continue; }
    if (mk.approximate) c.approximate++;
    if (mk.px > 0) c.itm++; else c.worthless++;
  }
  c.pnl = round2(c.pnl);
  return c;
}

export function expiryCountsText(c: ExpiryCounts): string {
  return `${c.n} expired option${c.n === 1 ? '' : 's'} settled at intrinsic (${c.worthless} worthless, ${c.itm} in the money, ${c.unverified} unverified${c.approximate ? `; ${c.approximate} approximate — AM-settled` : ''})`;
}
