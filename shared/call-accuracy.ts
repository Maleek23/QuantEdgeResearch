/**
 * CALL ACCURACY — was the idea's CALL right? (operator decision 2026-10-07)
 *
 * An idea is a WIN if, after it triggered, the underlying reached T1 or ≥ +1R
 * in the called direction BEFORE it touched the stop — first touch on real
 * bars, whichever win level is nearer. It counts even if no exit was taken
 * there. LOSS = the stop was touched first. Neither inside the hold window =
 * NO RESULT (expired / flat): shown separately and NOT in the rate.
 *
 * Conventions (conservative):
 *   - a bar that touches both the stop and the win level is a LOSS (stop first);
 *   - on the trigger bar only the stop is checked (the part of that bar before
 *     the trigger cannot be told apart from the part after it);
 *   - a window that has not ended yet with no touch is PENDING (not counted).
 *
 * This is NOT realized P&L. It measures the call, not the trade: the journal
 * shows it beside realized P&L (recorded and managed replay) and the peak, as
 * "called vs captured". A call can be a WIN while the realized trade lost
 * (e.g. +1R reached, then stopped at the original stop with no management).
 *
 * Pure: no I/O. research/managed-exit-replay.ts computes it per idea into the
 * replay ledger; the server summarises it (server/managed-replay-ledger.ts).
 */

export type CallResult = 'win' | 'loss' | 'no_result' | 'pending' | 'not_triggered';

export interface CallBar { t: number; o: number; h: number; l: number; c: number }

export interface CallInput {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  /** Published T1 (ignored when it is not on the profitable side of entry). */
  target: number | null;
  /** Underlying bars, ascending. */
  bars: CallBar[];
  /** Trigger time (ms); null = never triggered. */
  triggerMs: number | null;
  /** End of the hold window (ms). */
  windowEndMs: number;
  /** "Now" — a window that ends after this with no touch is pending. */
  nowMs: number;
}

export interface CallOutcome {
  result: CallResult;
  /** Bar time of the deciding touch (ISO), when there was one. */
  at: string | null;
  /** The win level used (nearer of T1 / +1R) and which one it was. */
  winLevel: number | null;
  winKind: 'T1' | '1R' | null;
  detail: string;
}

/** The nearer of T1 and entry ± 1R in the called direction. */
export function callWinLevel(direction: 'long' | 'short', entry: number, stop: number, target: number | null): { level: number; kind: 'T1' | '1R' } | null {
  const R = Math.abs(entry - stop);
  if (!(R > 0) || !(entry > 0)) return null;
  const s = direction === 'long' ? 1 : -1;
  const oneR = entry + s * R;
  const t1Valid = target != null && Number.isFinite(target) && s * (target - entry) > 0;
  if (!t1Valid) return { level: oneR, kind: '1R' };
  return s * (target! - oneR) <= 0 ? { level: target!, kind: 'T1' } : { level: oneR, kind: '1R' };
}

export function classifyCall(c: CallInput): CallOutcome {
  const none = (result: CallResult, detail: string, w: ReturnType<typeof callWinLevel> = null): CallOutcome =>
    ({ result, at: null, winLevel: w?.level ?? null, winKind: w?.kind ?? null, detail });
  if (c.triggerMs == null || !Number.isFinite(c.triggerMs)) return none('not_triggered', 'entry never triggered');
  const s = c.direction === 'long' ? 1 : -1;
  if (!(c.entry > 0) || !(c.stop > 0) || s * (c.entry - c.stop) <= 0) return none('no_result', 'no valid stop on the losing side of entry');
  const w = callWinLevel(c.direction, c.entry, c.stop, c.target);
  if (!w) return none('no_result', 'no risk distance');
  const width = barWidthMs(c.bars);
  let first = true;
  for (const b of c.bars) {
    if (b.t + width <= c.triggerMs) continue; // bars that ended before the trigger
    if (b.t > c.windowEndMs) break;
    const stopHit = s > 0 ? b.l <= c.stop : b.h >= c.stop;
    if (stopHit) return { result: 'loss', at: new Date(b.t).toISOString(), winLevel: w.level, winKind: w.kind, detail: `stop ${c.stop} touched before ${w.kind} ${round(w.level)}` };
    if (!first) {
      const winHit = s > 0 ? b.h >= w.level : b.l <= w.level;
      if (winHit) return { result: 'win', at: new Date(b.t).toISOString(), winLevel: w.level, winKind: w.kind, detail: `${w.kind} ${round(w.level)} reached before the stop ${c.stop}` };
    }
    first = false;
  }
  if (c.windowEndMs > c.nowMs) return none('pending', 'hold window still open — no touch yet', w);
  return none('no_result', `neither stop nor ${w.kind} ${round(w.level)} touched inside the hold window`, w);
}

/** Smallest spacing between the first bars (1m / 5m / 1d); 60 s when unknown. */
export function barWidthMs(bars: readonly { t: number }[]): number {
  let w = Infinity;
  for (let i = 1; i < Math.min(bars.length, 60); i++) { const d = bars[i].t - bars[i - 1].t; if (d > 0 && d < w) w = d; }
  return Number.isFinite(w) ? w : 60_000;
}

const round = (x: number) => Math.round(x * 100) / 100;

export interface CallSummary {
  wins: number;
  losses: number;
  noResult: number;
  pending: number;
  notTriggered: number;
  /** wins + losses. */
  n: number;
  /** wins / n; null when n = 0. */
  rate: number | null;
  /** Publish-time range (ISO) of the decided ideas. */
  from: string | null;
  to: string | null;
}

export function summarizeCalls(items: readonly { result: CallResult | null | undefined; publishedAt: string }[]): CallSummary {
  let wins = 0, losses = 0, noResult = 0, pending = 0, notTriggered = 0;
  const decided: string[] = [];
  for (const it of items) {
    switch (it.result) {
      case 'win': wins++; decided.push(it.publishedAt); break;
      case 'loss': losses++; decided.push(it.publishedAt); break;
      case 'no_result': noResult++; break;
      case 'pending': pending++; break;
      case 'not_triggered': notTriggered++; break;
      default: break;
    }
  }
  decided.sort();
  const n = wins + losses;
  return { wins, losses, noResult, pending, notTriggered, n, rate: n ? wins / n : null, from: decided[0] ?? null, to: decided[decided.length - 1] ?? null };
}

/** Split by publish time at the median (first half / second half) — walk-forward check. */
export function splitHalves<T extends { publishedAt: string }>(items: readonly T[]): [T[], T[]] {
  const sorted = [...items].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const mid = Math.floor(sorted.length / 2);
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

export function callRateText(s: CallSummary): string {
  if (s.rate == null) return '—';
  return `${Math.round(s.rate * 1000) / 10}%`;
}

/** Call-accuracy headline as the API serves it (server/managed-replay-ledger.ts callAccuracyHeadline). */
export interface CallAccuracyHeadline {
  overall: CallSummary;
  firstHalf: CallSummary;
  secondHalf: CallSummary;
  /** When the replay ledger was produced — the headline's age. */
  ledgerAsOf: string;
  definition: string;
}

export const CALL_ACCURACY_DEFINITION = 'WIN = T1 or +1R reached in the called direction before the stop (first touch on 5-minute bars; same bar → stop). LOSS = stop first. Neither inside the hold window = no result (not in the rate).';
