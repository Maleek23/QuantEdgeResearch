/**
 * 0DTE trade card — one shape for every "can I trade this now?" row on the
 * desk (desk ideas, flow ignition, sniper) and for today's results.
 *
 * Operator 2026-10-07: "0DTE page is so confusing". The desk is rebuilt around
 * ONE question — what can I trade right now? Each card shows the same plan as
 * NEXUS Setup Detail: contract, side, entry (trigger + mid at entry), stop
 * (premium AND underlying), T1 / T2, R:R, time left, grade, the LIVE contract
 * mark and the live underlying, each stamped with source + age ("delayed Nm"
 * when delayed), and progress to T1. Publish-time values are never shown as
 * current (shared/live-mark.ts rule).
 *
 * Pure: no I/O.
 */

export interface Mark { value: number; at: string | null; source: string | null }

/** "12s" · "4m" · "1.2h". */
export function ageShort(at: string | null | undefined, nowMs: number): string | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;
}

const DELAYED_SRC = /delayed|indicative|cboe|yahoo|15\s*min/i;

/**
 * The stamp under a live number: "Alpaca · 12s", "delayed 15m · CBOE".
 * A mark older than 2 min, or from a delayed feed, says "delayed Nm".
 */
export function markStamp(m: { at: string | null; source: string | null } | null | undefined, nowMs: number): { text: string; delayed: boolean; stale: boolean } {
  if (!m || !m.at) return { text: 'no live mark', delayed: false, stale: true };
  const t = Date.parse(m.at);
  const ageS = Number.isFinite(t) ? Math.max(0, (nowMs - t) / 1000) : Infinity;
  const src = (m.source ?? '').replace(/\s*\(.*\)\s*/g, '').trim();
  const delayedFeed = DELAYED_SRC.test(m.source ?? '');
  const stale = ageS > 20 * 60;
  if (delayedFeed || ageS > 120) {
    const mins = Math.max(1, Math.round(ageS / 60));
    return { text: `delayed ${Number.isFinite(mins) ? mins : '—'}m${src ? ` · ${src}` : ''}`, delayed: true, stale };
  }
  return { text: `${src || 'live'} · ${ageShort(m.at, nowMs) ?? '—'}`, delayed: false, stale };
}

/**
 * Progress from entry toward T1 in the trade's favour: 0 at entry, 1 at T1,
 * negative when it has moved against the trade (floored at −1, capped at 1.5).
 * Works on premium (always "up is good" for a long option) or on the
 * underlying with the trade's direction. null when any input is missing.
 */
export function progressToT1(entry: number | null | undefined, t1: number | null | undefined, now: number | null | undefined): number | null {
  if (entry == null || t1 == null || now == null) return null;
  if (![entry, t1, now].every(Number.isFinite)) return null;
  const span = t1 - entry;
  if (Math.abs(span) < 1e-9) return null;
  const p = (now - entry) / span;
  return Math.max(-1, Math.min(1.5, Math.round(p * 1000) / 1000));
}

/** Plain-word state labels (no jargon on the card; the reason is the tooltip). */
export const STATE_WORDS: Record<string, string> = {
  live: 'Enter now', armed: 'Almost — trigger close', watch: 'Forming', stale: 'Quote stale',
  passed: 'Entry window passed', done_reached: 'Hit target', done_faded: 'Stopped / faded', expired: 'Expired',
};

/** "TSLA 380P 0DTE" / "SPY 671C 1DTE" from a contract. */
export function bigContract(symbol: string, c: { strike: number; optionType?: 'call' | 'put'; type?: 'call' | 'put'; dte?: number | null; expiry?: string } | null, nowDay?: string): string {
  if (!c) return symbol;
  const t = (c.optionType ?? c.type) === 'put' ? 'P' : 'C';
  let dte = c.dte;
  if (dte == null && c.expiry && nowDay) dte = Math.round((Date.parse(`${c.expiry.slice(0, 10)}T12:00:00Z`) - Date.parse(`${nowDay}T12:00:00Z`)) / 86_400_000);
  const d = dte == null ? '' : ` ${dte <= 0 ? '0DTE' : `${dte}DTE`}`;
  return `${symbol} ${c.strike}${t}${d}`;
}

/** Today's result chip for a done row: ✓ T1 / ✕ stop / time exit / passed. */
export function resultChip(state: string, reason?: string | null): { label: string; tone: 'win' | 'loss' | 'flat' } {
  const r = String(reason ?? '').toLowerCase();
  // "time stop" contains "stop": the time exit is checked first.
  if (state === 'expired' || /time stop|time_stop|expired|15:30/.test(r)) return { label: 'time exit', tone: 'flat' };
  if (state === 'done_reached' || (/target|reached|t1/.test(r) && !/stop/.test(r))) return { label: '✓ T1', tone: 'win' };
  if (state === 'done_faded' || /stop|faded/.test(r)) return { label: '✕ stop', tone: 'loss' };
  return { label: 'not entered', tone: 'flat' };
}
