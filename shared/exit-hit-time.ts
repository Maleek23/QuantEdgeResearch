/**
 * EXIT TIME = HIT TIME.
 *
 * The outcome tracker stamped every resolution with the moment it RAN, not the
 * moment price did anything. Prod never ran the tracker until 2026-09-30 12:43
 * UTC, so a month of backlog resolved in one sweep and every one of those exits
 * landed on 2026-09-30 in the journal calendar, while the days the stops and
 * targets actually printed stayed empty.
 *
 * The rules here (pure, no I/O — the server wrapper fetches the bars):
 *
 *   - hit_target / hit_stop: exitDate = the start of the FIRST bar at or after
 *     entry whose high/low crossed the decided level. The exit price stays the
 *     level. Source 'bar_hit'.
 *   - expiry / time-stop: exitDate = the deadline (never later than now). The
 *     exit price is the close of the last bar before the deadline when one
 *     exists; otherwise the resolution-time quote is kept and the note says so.
 *     Source 'deadline'.
 *   - no bar evidence: exitDate = now, because the decision genuinely happened
 *     live from the current quote. Source 'live'.
 *
 * A bar that touches BOTH barriers counts as the stop (shared/barrier-resolution
 * convention): intrabar order is unknown and the ambiguous case must not
 * resolve in our favour.
 */
import { formatInTimeZone } from 'date-fns-tz';

export type ExitTimeSource = 'bar_hit' | 'deadline' | 'live';

/** Same zone and format the validator has always written exitDate in. */
export const EXIT_DATE_TZ = 'America/Chicago';
export function formatExitDate(at: Date | number): string {
  return formatInTimeZone(new Date(at), EXIT_DATE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Tag written into outcomeNotes so a row states how its exit time was found. */
export const EXIT_TIME_TAG_RE = /\[exit-time:(bar_hit|deadline|live)\]/;
export function exitTimeNote(source: ExitTimeSource, detail: string): string {
  return `[exit-time:${source}] ${detail}`.trim();
}
export function appendNote(existing: string | null | undefined, note: string): string {
  const base = (existing ?? '').trim();
  return base ? `${base}\n${note}` : note;
}

export interface TimedBar { time: number; open?: number; high: number; low: number; close: number }

type Dir = 'long' | 'short';
const touchesTarget = (d: Dir, b: TimedBar, level: number) => (d === 'long' ? b.high >= level : b.low <= level);
const touchesStop = (d: Dir, b: TimedBar, level: number) => (d === 'long' ? b.low <= level : b.high >= level);

/** Bars in [fromSec, toSec], in time order. */
function window(bars: TimedBar[], fromSec: number, toSec?: number): TimedBar[] {
  return bars
    .filter((b) => Number.isFinite(b.time) && b.time >= fromSec && (toSec == null || b.time <= toSec))
    .sort((a, b) => a.time - b.time);
}

/** First bar at/after fromSec whose range crossed ONE level. */
export function firstLevelTouch(
  bars: TimedBar[],
  o: { direction: Dir; kind: 'target' | 'stop'; level: number; fromSec: number; toSec?: number },
): TimedBar | null {
  if (!Number.isFinite(o.level)) return null;
  for (const b of window(bars, o.fromSec, o.toSec)) {
    if (o.kind === 'target' ? touchesTarget(o.direction, b, o.level) : touchesStop(o.direction, b, o.level)) return b;
  }
  return null;
}

/** Which barrier the bar path touched first; both inside one bar = stop. */
export function firstBarrierTouch(
  bars: TimedBar[],
  o: { direction: Dir; target: number; stop: number; fromSec: number; toSec?: number },
): { outcome: 'hit_target' | 'hit_stop'; bar: TimedBar; sameBar: boolean } | null {
  for (const b of window(bars, o.fromSec, o.toSec)) {
    const t = touchesTarget(o.direction, b, o.target);
    const s = touchesStop(o.direction, b, o.stop);
    if (s) return { outcome: 'hit_stop', bar: b, sameBar: t };
    if (t) return { outcome: 'hit_target', bar: b, sameBar: false };
  }
  return null;
}

/** The last bar that STARTED before `sec` (and at/after fromSec) — its close is the mark at the deadline. */
export function barBefore(bars: TimedBar[], sec: number, fromSec = -Infinity): TimedBar | null {
  let out: TimedBar | null = null;
  for (const b of bars) if (b.time >= fromSec && b.time < sec && (!out || b.time > out.time)) out = b;
  return out;
}

export const pctMove = (direction: Dir, entry: number, exit: number): number =>
  !entry ? 0 : ((exit - entry) / entry) * 100 * (direction === 'short' ? -1 : 1);

export interface ExitTimingIdea {
  symbol: string;
  timestamp: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  /** Underlying direction (a long put is 'short'). */
  direction: Dir;
  /** Entry anchor: publish time or later trigger time, epoch ms. */
  entryMs: number;
}

export interface ExitTimingInput {
  outcomeStatus: string;
  resolutionReason?: string | null;
  exitPrice?: number | null;
  /** Validator-declared deadline for expiry/time-stop outcomes (epoch ms). */
  deadlineMs?: number | null;
}

export interface ExitTimingPlan {
  source: ExitTimeSource;
  exitMs: number;
  exitDate: string;
  /** Set only when the plan changes the exit price (deadline repricing). */
  exitPrice?: number;
  percentGain?: number;
  holdingMinutes: number;
  note: string;
  /** Set when the plan fell back to live (for the repair script's 'unchanged' list). */
  unresolved?: string;
}

const iso = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16) + 'Z';

/**
 * Decide the exit timestamp (and, for deadlines, the exit price) of one
 * resolution from its bars. `bars` should be regular-session bars for equities.
 */
export function planExitTiming(
  idea: ExitTimingIdea,
  res: ExitTimingInput,
  bars: TimedBar[],
  nowMs: number,
  opts: { barInterval?: string } = {},
): ExitTimingPlan {
  const createdMs = Date.parse(idea.timestamp);
  const fromSec = Math.floor(idea.entryMs / 1000);
  const nowSec = Math.floor(nowMs / 1000);
  const hold = (ms: number) => Math.max(0, Math.floor((ms - createdMs) / 60_000));
  const iv = opts.barInterval ? `${opts.barInterval} ` : '';
  const live = (why: string): ExitTimingPlan => ({
    source: 'live', exitMs: nowMs, exitDate: formatExitDate(nowMs), holdingMinutes: hold(nowMs),
    note: exitTimeNote('live', `decided from the quote at resolution — ${why}`), unresolved: why,
  });

  if (res.outcomeStatus === 'hit_target' || res.outcomeStatus === 'hit_stop') {
    const kind = res.outcomeStatus === 'hit_target' ? 'target' : 'stop';
    const level = kind === 'target' ? idea.targetPrice : idea.stopLoss;
    if (!bars.length) return live('no bars since entry');
    const bar = firstLevelTouch(bars, { direction: idea.direction, kind, level, fromSec, toSec: nowSec });
    if (!bar) return live(`no ${iv}bar since entry crossed the ${kind} ${level}`);
    const exitMs = bar.time * 1000;
    const first = firstBarrierTouch(bars, { direction: idea.direction, target: idea.targetPrice, stop: idea.stopLoss, fromSec, toSec: nowSec });
    const disagree = first && first.outcome !== res.outcomeStatus
      ? ` · NOTE path touched the ${first.outcome === 'hit_stop' ? 'stop' : 'target'} first at ${iso(first.bar.time)}${first.sameBar ? ' (same bar as target)' : ''}`
      : '';
    return {
      source: 'bar_hit', exitMs, exitDate: formatExitDate(exitMs), holdingMinutes: hold(exitMs),
      note: exitTimeNote('bar_hit', `first ${iv}bar crossing ${kind} ${level} at ${iso(bar.time)}${disagree}`),
    };
  }

  if (res.deadlineMs != null && Number.isFinite(res.deadlineMs)) {
    const deadlineMs = Math.min(res.deadlineMs, nowMs);
    const reason = String(res.resolutionReason ?? '');
    const base = { source: 'deadline' as const, exitMs: deadlineMs, exitDate: formatExitDate(deadlineMs), holdingMinutes: hold(deadlineMs) };
    // A missed entry never traded: its exit price is the entry by definition.
    if (reason.startsWith('missed_entry')) {
      return { ...base, holdingMinutes: 0, note: exitTimeNote('deadline', `entry window closed ${iso(deadlineMs / 1000)}`) };
    }
    const bar = barBefore(bars, Math.floor(deadlineMs / 1000), fromSec);
    if (bar) {
      const px = bar.close;
      return {
        ...base, exitPrice: px, percentGain: pctMove(idea.direction, idea.entryPrice, px),
        note: exitTimeNote('deadline', `deadline ${iso(deadlineMs / 1000)}; exit marked at the ${iv}bar close ${px} (${iso(bar.time)})`),
      };
    }
    return {
      ...base,
      note: exitTimeNote('deadline', `deadline ${iso(deadlineMs / 1000)}; no bar before it — exit price is the quote at resolution, not at the deadline`),
      unresolved: 'no bar before the deadline',
    };
  }

  return live('no deadline or barrier decision');
}
