/**
 * RUN-UP AFTER TRIGGER — how far did a triggered idea run in its favour, and
 * did it get there BEFORE its stop?
 * ============================================================================
 * Operator ask (2026-09-30): "any NEXUS play that triggered and then ran 5–10%
 * should count as a win (e.g. GOOGL now)". We do NOT redefine the win: counting
 * a trade as won because price later passed some level it never exited at is
 * hindsight max-favourable-excursion, and it would make the strict win rate
 * (shared/model-record.ts, outcome v2) unreadable. Instead this module measures
 * the run-up as its own, separately-labelled number:
 *
 *   "Reached +5% after trigger, before stop — not the win rate."
 *
 * RULES (pure, deterministic, conservative — mirrored in the replay):
 *   • The path starts at the first bar that OPENS at or after the trigger time.
 *     With an audited trigger time the bar in progress at the trigger is
 *     excluded (part of its range printed before entry). With the bar fallback
 *     (no audit) the crossing bar itself starts the path — its stop side counts,
 *     and the same-bar rule below sends any ambiguity to the stop.
 *   • Excursion is measured on the UNDERLYING, from the plan entry, in the
 *     idea's underlying direction (a bought put is 'short').
 *   • A threshold counts as reached before the stop only if it is touched on a
 *     bar strictly before the bar that touches the stop. Stop and threshold in
 *     the same bar = STOP FIRST (intrabar order is unknown and the ambiguous
 *     case never resolves in our favour — same rule as barrier-resolution.ts).
 *   • mfePct is the best favourable excursion up to (not including) the stop
 *     bar. The stop bar's favourable side is excluded for the same reason.
 *   • The window ends at `endMs` (the caller passes the idea's close / horizon /
 *     now), so a later move after the idea was closed is never credited.
 *
 * Also here: the three pre-registered take-profit exit variants that
 * research/replay-tp5.ts replays (A/B/C), plus the plain T1/stop/horizon plan,
 * so the replay and the tests exercise one implementation.
 */

import { OUTCOME_BASELINE_DATE } from './constants';
import { isSyntheticOutcome } from './model-record';
import { isOptionScaleIncoherent } from './option-unit-guard';
import { readOracleExecutionAudit, isOutcomeEligible } from './oracle-lifecycle';

export interface RunUpBar {
  /** bar OPEN time, epoch ms */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type UnderlyingDirection = 'long' | 'short';

export const RUN_UP_THRESHOLDS = [3, 5, 10] as const;
export const RUN_UP_LABEL = 'Reached +5% after trigger, before stop — not the win rate';

export interface ThresholdHit {
  pct: number;
  /** touched on a bar strictly before the stop bar (or with no stop hit) */
  reachedBeforeStop: boolean;
  /** epoch ms of the bar that first touched it (before stop), else null */
  atMs: number | null;
  /** minutes from trigger to that bar, else null */
  minutesToReach: number | null;
}

export interface RunUpResult {
  /** best favourable excursion %, bars before the stop bar only; null with no bars */
  mfePct: number | null;
  /** worst adverse excursion %, all bars in the window (incl. the stop bar); null with no bars */
  maePct: number | null;
  stopHit: boolean;
  stopAtMs: number | null;
  thresholds: ThresholdHit[];
  barsUsed: number;
  startMs: number;
  endMs: number;
}

export interface RunUpInput {
  direction: UnderlyingDirection;
  entry: number;
  stop: number;
  /** trigger time, epoch ms */
  triggerMs: number;
  /** window end, epoch ms (exclusive) */
  endMs: number;
  bars: RunUpBar[];
  thresholds?: readonly number[];
}

const fav = (d: UnderlyingDirection, entry: number, b: RunUpBar) =>
  d === 'long' ? ((b.high - entry) / entry) * 100 : ((entry - b.low) / entry) * 100;
const adv = (d: UnderlyingDirection, entry: number, b: RunUpBar) =>
  d === 'long' ? ((b.low - entry) / entry) * 100 : ((entry - b.high) / entry) * 100;
const stopTouched = (d: UnderlyingDirection, stop: number, b: RunUpBar) => (d === 'long' ? b.low <= stop : b.high >= stop);

/** Bars in [triggerMs, endMs), sorted. */
export function windowBars(bars: RunUpBar[], startMs: number, endMs: number): RunUpBar[] {
  return bars.filter((b) => b.t >= startMs && b.t < endMs).sort((a, b) => a.t - b.t);
}

export function computeRunUp(i: RunUpInput): RunUpResult {
  const th = i.thresholds ?? RUN_UP_THRESHOLDS;
  const path = windowBars(i.bars, i.triggerMs, i.endMs);
  const hits: ThresholdHit[] = th.map((pct) => ({ pct, reachedBeforeStop: false, atMs: null, minutesToReach: null }));
  let mfe: number | null = null;
  let mae: number | null = null;
  let stopAtMs: number | null = null;
  const valid = i.entry > 0 && Number.isFinite(i.entry) && Number.isFinite(i.stop);
  if (valid) {
    for (const b of path) {
      const a = adv(i.direction, i.entry, b);
      mae = mae == null ? a : Math.min(mae, a);
      if (stopTouched(i.direction, i.stop, b)) { stopAtMs = b.t; break; }
      const f = fav(i.direction, i.entry, b);
      mfe = mfe == null ? f : Math.max(mfe, f);
      for (const h of hits) {
        if (!h.reachedBeforeStop && f >= h.pct) {
          h.reachedBeforeStop = true; h.atMs = b.t; h.minutesToReach = Math.round((b.t - i.triggerMs) / 60_000);
        }
      }
    }
  }
  const r2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);
  return {
    mfePct: r2(mfe), maePct: r2(mae),
    stopHit: stopAtMs != null, stopAtMs,
    thresholds: hits, barsUsed: path.length,
    startMs: i.triggerMs, endMs: i.endMs,
  };
}

export function thresholdHit(r: RunUpResult, pct: number): boolean {
  return !!r.thresholds.find((h) => h.pct === pct)?.reachedBeforeStop;
}

/**
 * Fallback trigger when no execution audit timestamp exists: the first bar
 * opening at/after `fromMs` whose range contains the entry (or that gaps across
 * it from the previous close). Returns that bar's open time, or null.
 */
export function findBarTrigger(bars: RunUpBar[], entry: number, fromMs: number, untilMs: number): number | null {
  const path = windowBars(bars, fromMs, untilMs);
  let prevClose: number | null = null;
  for (const b of path) {
    if (b.low <= entry && b.high >= entry) return b.t;
    if (prevClose != null && ((prevClose < entry && b.open > entry) || (prevClose > entry && b.open < entry))) return b.t;
    prevClose = b.close;
  }
  return null;
}

// ── population + trigger time (shared by the server tracker and the replay) ──
export interface RunUpIdea {
  id: string;
  symbol: string;
  assetType?: string | null;
  direction?: string | null;
  entryPrice: number;
  stopLoss: number;
  strikePrice?: number | null;
  timestamp?: string | null;
  entryValidUntil?: string | null;
  exitDate?: string | null;
  outcomeStatus?: string | null;
  resolutionReason?: string | null;
  excludeFromTraining?: boolean | null;
  dataSourceUsed?: string | null;
  convergenceSignalsJson?: unknown;
}

const msOf = (s?: string | null) => (s ? Date.parse(s) : NaN);

/**
 * In the run-up population (before knowing whether it traded): published since
 * OUTCOME_BASELINE_DATE, not excluded / synthetic, barriers on the underlying
 * scale, not a missed entry, and — when a lifecycle audit exists — audited as
 * triggered/executed/closed. Rows with no audit at all fall back to the bars.
 */
export function inRunUpPopulation(i: RunUpIdea, since = OUTCOME_BASELINE_DATE): boolean {
  if (!(msOf(i.timestamp) >= Date.parse(`${since}T00:00:00-04:00`))) return false;
  if (i.excludeFromTraining) return false;
  if (isSyntheticOutcome(i)) return false;
  if (isOptionScaleIncoherent(i)) return false;
  if ((i.resolutionReason || '').toLowerCase().includes('missed_entry')) return false;
  if (!(i.entryPrice > 0) || !(i.stopLoss > 0)) return false;
  if (readOracleExecutionAudit(i.convergenceSignalsJson) && !isOutcomeEligible(i.convergenceSignalsJson)) return false;
  return true;
}

/** Underlying direction: a bought put is 'short' (the bot never writes options). */
export const underlyingDirection = (d?: string | null): UnderlyingDirection => (d === 'short' ? 'short' : 'long');

/**
 * Trigger time: executionAudit.triggerObservedAt, else executionRecordedAt, else
 * the first bar through the entry after publish (within entryValidUntil and
 * before `endMs`). Null = never traded.
 */
export function resolveTrigger(i: RunUpIdea, bars: RunUpBar[], endMs: number): { ms: number; source: 'audit' | 'bars' } | null {
  const audit = readOracleExecutionAudit(i.convergenceSignalsJson);
  const a = msOf(audit?.triggerObservedAt ?? audit?.executionRecordedAt ?? null);
  if (Number.isFinite(a)) return { ms: a, source: 'audit' };
  const publish = msOf(i.timestamp);
  if (!Number.isFinite(publish)) return null;
  const until = Number.isFinite(msOf(i.entryValidUntil)) ? Math.min(msOf(i.entryValidUntil), endMs) : endMs;
  const t = findBarTrigger(bars, i.entryPrice, publish, until);
  return t == null ? null : { ms: t, source: 'bars' };
}

// ── summary across ideas ───────────────────────────────────────────────────
export interface RunUpSummary {
  label: string;
  since: string;
  /** triggered ideas with a computed run-up */
  triggered: number;
  reached3: number;
  reached5BeforeStop: number;
  reached10: number;
  /** reached5BeforeStop / triggered, percent (1dp); null when triggered === 0 */
  rate: number | null;
  /** median minutes from trigger to +5% among those that reached it */
  medianMinutesTo5: number | null;
  /** ideas in the population not yet evaluated (computed in bounded background passes of ≤25) */
  pending: number;
  asOf: string;
  note: string;
}

export function summarizeRunUps(rs: RunUpResult[], since: string, pending = 0, nowIso = new Date().toISOString()): RunUpSummary {
  const hit = (p: number) => rs.filter((r) => thresholdHit(r, p)).length;
  const five = hit(5);
  const mins = rs.map((r) => r.thresholds.find((h) => h.pct === 5)?.minutesToReach).filter((m): m is number => m != null).sort((a, b) => a - b);
  const med = mins.length ? (mins.length % 2 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2) : null;
  return {
    label: RUN_UP_LABEL,
    since,
    triggered: rs.length,
    reached3: hit(3),
    reached5BeforeStop: five,
    reached10: hit(10),
    rate: rs.length ? Math.round((five / rs.length) * 1000) / 10 : null,
    medianMinutesTo5: med,
    pending,
    asOf: nowIso,
    note: 'Underlying move from the plan entry, measured on real bars after the trigger; a threshold and the stop inside one bar counts as stop first. This is run-up (max favourable excursion), not a win — a trade that reached +5% and was not exited there can still lose.',
  };
}

// ── exit variants (pre-registered for research/replay-tp5.ts) ─────────────
export type ExitVariant = 'actual' | 'A' | 'B' | 'C';

export const EXIT_VARIANTS: Record<ExitVariant, string> = {
  actual: 'Plan as published: full exit at T1, stop, or horizon close',
  A: 'Full exit at +5% on the underlying (T1 replaced), stop unchanged, else horizon close',
  B: 'Full exit at the nearer of +5% or 1R (T1 replaced), stop unchanged, else horizon close',
  C: 'Half at +5%, stop on the rest moved to breakeven; rest exits at T1, breakeven, or horizon close (before +5%: plan as published)',
};

export interface ExitInput {
  direction: UnderlyingDirection;
  entry: number;
  stop: number;
  target: number;
  triggerMs: number;
  /** horizon end, epoch ms (exclusive). If the data ends before it, the trade is 'open'. */
  horizonEndMs: number;
  bars: RunUpBar[];
  /** true when bars cover the whole horizon (else an un-exited trade is 'open', not timed out) */
  horizonComplete: boolean;
  tpPct?: number;
}

export type ExitReason = 'target' | 'tp5' | 'tp1R' | 'stop' | 'breakeven' | 'horizon' | 'open' | 'nodata';

export interface ExitResult {
  variant: ExitVariant;
  reason: ExitReason;
  /** position-weighted R (risk = |entry − stop|); null when open/nodata */
  r: number | null;
  /** position-weighted underlying % from entry, signed for direction; null when open/nodata */
  pct: number | null;
  exitMs: number | null;
  /** C only: the half booked at +5% */
  partial: boolean;
}

/**
 * Replay one exit variant on bars. Conservative fill rules:
 *   stop     fills at the stop, or at the bar open when the bar gaps through it
 *   targets  fill at the level (never at a better gap open)
 *   same bar stop + any take-profit → stop
 *   C        the bar that books +5% also closes the rest at breakeven if it
 *            touches entry (intrabar order unknown → worse outcome)
 */
export function simulateExit(variant: ExitVariant, i: ExitInput): ExitResult {
  const L = i.direction === 'long';
  const risk = Math.abs(i.entry - i.stop);
  const tpPct = i.tpPct ?? 5;
  const px5 = L ? i.entry * (1 + tpPct / 100) : i.entry * (1 - tpPct / 100);
  const px1R = L ? i.entry + risk : i.entry - risk;
  const signed = (px: number) => (L ? px - i.entry : i.entry - px);
  const R = (px: number) => signed(px) / risk;
  const P = (px: number) => (signed(px) / i.entry) * 100;
  const path = windowBars(i.bars, i.triggerMs, i.horizonEndMs);
  const out = (reason: ExitReason, r: number | null, pct: number | null, exitMs: number | null, partial = false): ExitResult =>
    ({ variant, reason, r: r == null ? null : Math.round(r * 1000) / 1000, pct: pct == null ? null : Math.round(pct * 1000) / 1000, exitMs, partial });
  if (!path.length || !(risk > 0) || !(i.entry > 0)) return out('nodata', null, null, null);

  const touches = (b: RunUpBar, lvl: number) => (L ? b.high >= lvl : b.low <= lvl);
  const stopFill = (b: RunUpBar, lvl: number) => (L ? Math.min(b.open, lvl) : Math.max(b.open, lvl));
  const stopHitBar = (b: RunUpBar, lvl: number) => (L ? b.low <= lvl : b.high >= lvl);

  // take-profit level for full-exit variants
  const tp = variant === 'actual' || variant === 'C' ? i.target
    : variant === 'A' ? px5
    : (Math.abs(px5 - i.entry) <= Math.abs(px1R - i.entry) ? px5 : px1R);
  const tpReason: ExitReason = variant === 'A' ? 'tp5' : variant === 'B' ? (tp === px5 ? 'tp5' : 'tp1R') : 'target';

  let half: { r: number; pct: number } | null = null; // C: booked half
  for (const b of path) {
    if (!half) {
      if (stopHitBar(b, i.stop)) { const f = stopFill(b, i.stop); return out('stop', R(f), P(f), b.t); }
      if (touches(b, tp) && (variant !== 'C' || Math.abs(tp - i.entry) <= Math.abs(px5 - i.entry))) {
        return out(tpReason, R(tp), P(tp), b.t);
      }
      if (variant === 'C' && touches(b, px5)) {
        half = { r: R(px5), pct: P(px5) };
        // same bar: T1 beyond +5% also touched → rest exits at T1 only if entry was NOT touched
        const beTouched = stopHitBar(b, i.entry);
        if (beTouched) return out('breakeven', 0.5 * half.r, 0.5 * half.pct, b.t, true);
        if (touches(b, i.target)) return out('target', 0.5 * half.r + 0.5 * R(i.target), 0.5 * half.pct + 0.5 * P(i.target), b.t, true);
        continue;
      }
    } else {
      if (stopHitBar(b, i.entry)) { const f = stopFill(b, i.entry); return out('breakeven', 0.5 * half.r + 0.5 * R(f), 0.5 * half.pct + 0.5 * P(f), b.t, true); }
      if (touches(b, i.target)) return out('target', 0.5 * half.r + 0.5 * R(i.target), 0.5 * half.pct + 0.5 * P(i.target), b.t, true);
    }
  }
  if (!i.horizonComplete) return out('open', null, null, null, !!half);
  const last = path[path.length - 1];
  if (half) return out('horizon', 0.5 * half.r + 0.5 * R(last.close), 0.5 * half.pct + 0.5 * P(last.close), last.t, true);
  return out('horizon', R(last.close), P(last.close), last.t);
}

// ── aggregate stats for a set of exit results ─────────────────────────────
export interface ExitStats {
  n: number;
  open: number;
  noData: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  avgPct: number | null;
  /** expectancy per trade in R (= avgR) */
  expectancyR: number | null;
  profitFactor: number | null;
}

export function exitStats(rs: ExitResult[]): ExitStats {
  const closed = rs.filter((r) => r.r != null);
  const n = closed.length;
  const wins = closed.filter((r) => (r.r as number) > 0).length;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const R = closed.map((r) => r.r as number);
  const pos = sum(R.filter((x) => x > 0)); const neg = -sum(R.filter((x) => x < 0));
  const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    n, open: rs.filter((r) => r.reason === 'open').length, noData: rs.filter((r) => r.reason === 'nodata').length,
    wins,
    winRate: n ? round((wins / n) * 100, 1) : null,
    avgR: n ? round(sum(R) / n) : null,
    avgPct: n ? round(sum(closed.map((r) => r.pct as number)) / n) : null,
    expectancyR: n ? round(sum(R) / n) : null,
    profitFactor: neg > 0 ? round(pos / neg, 2) : (pos > 0 ? Infinity : null),
  };
}
