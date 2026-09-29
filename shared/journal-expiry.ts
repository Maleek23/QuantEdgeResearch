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

/** Client read-side: settle every expired-unclosed row (rows imported before the importer did it). */
export function settleExpiredRows<T extends ExpirableRow>(rows: T[], nowMs = Date.now()): (T & { expiredAssumed?: boolean })[] {
  let changed = false;
  const out = rows.map((r) => {
    if (r.status === 'closed' && r.notes?.includes(EXPIRED_NOTE_HEAD)) { changed = true; return { ...r, expiredAssumed: true }; }
    if (!isExpiredUnclosed(r, nowMs)) return r;
    changed = true;
    const s = expiredSettlement(r);
    return { ...r, ...s, notes: r.notes ? `${r.notes}\n${EXPIRED_ASSUMED_NOTE}` : EXPIRED_ASSUMED_NOTE };
  });
  return changed ? out : rows;
}
