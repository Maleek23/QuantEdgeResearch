/**
 * AFTER STOP — "stopped, then would have won" as a SEPARATE tracked fact.
 *
 * Operator (2026-10-07): wider stops are approved, but the record must stay
 * honest. A stopped-out idea is a LOSS and stays a loss. What this module adds
 * is a second, clearly-labelled fact about it: inside the idea's own holding
 * window, after the stop, did the underlying
 *   · reach T1            → 't1'    ("stopped · later reached T1 at 11:42")
 *   · trade back at entry → 'entry' ("stopped · later back at entry 10:05")
 *   · neither             → 'none'  ("stopped · did not recover")
 * Evidence (research/results/LOSERS_LATER_2026-10-05.md): of 141 analysable
 * losers since 2026-09-29, 9.9% later hit T1 in the hold window and 46.8%
 * traded back at entry — that is what a wider stop would recover, shown next to
 * the loss, never instead of it.
 *
 * Storage: an `[after-stop:…]` tag appended to trade_ideas.outcome_notes (the
 * same channel as `[exit-premium:…]`), written by the after-close worker job
 * (server/after-stop-job.ts). outcome_status / percent_gain are NEVER touched.
 *
 * The bar logic (afterClose / firstStopBar) is the one research/losers-later-core.ts
 * uses — that module re-exports it from here.
 *
 * Conventions (shared/run-up.ts): a level counts when a bar's range touches it;
 * the path after a close starts at the first bar opening at/after the close.
 */
import { horizonTradingDays, addTradingMinutes } from './loss-rules';
import { optionExpiryCloseMs } from './option-expiry';

export type Dir = 'long' | 'short';
export interface Bar { t: number; o: number; h: number; l: number; c: number }

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Signed % move from entry in the trade's favour. */
export function pctFrom(dir: Dir, entry: number, px: number): number {
  return ((dir === 'long' ? px - entry : entry - px) / entry) * 100;
}
export const touches = (dir: Dir, lvl: number, b: Bar) => (dir === 'long' ? b.h >= lvl : b.l <= lvl);
export const stopTouched = (dir: Dir, stop: number, b: Bar) => (dir === 'long' ? b.l <= stop : b.h >= stop);
const favPct = (dir: Dir, entry: number, b: Bar) => pctFrom(dir, entry, dir === 'long' ? b.h : b.l);

/** First bar opening in [fromMs, toMs) whose range touches the stop. */
export function firstStopBar(bars: Bar[], dir: Dir, stop: number, fromMs: number, toMs: number): Bar | null {
  return bars.find((b) => b.t >= fromMs && b.t < toMs && stopTouched(dir, stop, b)) ?? null;
}

export interface AfterCloseInput {
  dir: Dir; entry: number; stop: number; target: number | null;
  /** close time (stop bar END for a stop-out) — the path starts at bars opening at/after it */
  closeMs: number;
  holdEndMs: number; weekEndMs: number;
  /** last bar time available (data end) */
  dataEndMs: number;
  bars: Bar[];
}
export interface AfterClose {
  barsAfter: number;
  t1HitInHold: boolean;
  t1HitByWeekEnd: boolean;
  t1AtMs: number | null;
  minutesToT1: number | null;
  /** price traded back at the entry (break-even) inside the holding window */
  reclaimedEntryInHold: boolean;
  reclaimAtMs: number | null;
  /** best favourable % from entry after the close (negative = never got back to entry) */
  mfeHoldPct: number | null;
  mfeWeekPct: number | null;
  /** same, in units of the original stop distance (R) */
  mfeHoldR: number | null;
  mfeWeekR: number | null;
  /** % from entry at the last bar inside the holding window */
  lastInHoldPct: number | null;
  greenAtHoldEnd: boolean | null;
  holdComplete: boolean;
  weekComplete: boolean;
}

export function afterClose(i: AfterCloseInput): AfterClose {
  const riskPct = Math.abs(i.entry - i.stop) / i.entry * 100;
  const endWeek = Math.max(i.holdEndMs, i.weekEndMs);
  const path = i.bars.filter((b) => b.t >= i.closeMs && b.t < endWeek).sort((a, b) => a.t - b.t);
  let t1At: number | null = null, reclaimAt: number | null = null;
  let mfeH: number | null = null, mfeW: number | null = null, last: number | null = null;
  for (const b of path) {
    const f = favPct(i.dir, i.entry, b);
    mfeW = mfeW == null ? f : Math.max(mfeW, f);
    if (t1At == null && i.target != null && touches(i.dir, i.target, b)) t1At = b.t;
    if (b.t < i.holdEndMs) {
      mfeH = mfeH == null ? f : Math.max(mfeH, f);
      if (reclaimAt == null && touches(i.dir, i.entry, b)) reclaimAt = b.t;
      last = pctFrom(i.dir, i.entry, b.c);
    }
  }
  const R = (x: number | null) => (x == null || !(riskPct > 0) ? null : r2(x / riskPct));
  return {
    barsAfter: path.length,
    t1HitInHold: t1At != null && t1At < i.holdEndMs,
    t1HitByWeekEnd: t1At != null,
    t1AtMs: t1At,
    minutesToT1: t1At == null ? null : Math.round((t1At - i.closeMs) / 60_000),
    reclaimedEntryInHold: reclaimAt != null,
    reclaimAtMs: reclaimAt,
    mfeHoldPct: mfeH == null ? null : r2(mfeH),
    mfeWeekPct: mfeW == null ? null : r2(mfeW),
    mfeHoldR: R(mfeH), mfeWeekR: R(mfeW),
    lastInHoldPct: last == null ? null : r2(last),
    greenAtHoldEnd: last == null ? null : last > 0,
    holdComplete: i.dataEndMs >= i.holdEndMs,
    weekComplete: i.dataEndMs >= i.weekEndMs,
  };
}

/**
 * Holding-window end for an idea, as research/losers-later.ts computes it:
 * horizon trading days from the trigger (or publish), cut by exit_by and by an
 * option's expiry close.
 */
export function holdEndFor(a: { anchorMs: number; publishedMs: number; holdingPeriod?: string | null; expiryDate?: string | null; exitBy?: string | null; isOption: boolean }): number {
  const days = horizonTradingDays({ holdingPeriod: a.holdingPeriod, expiryDate: a.isOption ? a.expiryDate : null, publishedMs: a.publishedMs });
  let end = addTradingMinutes(a.anchorMs, days * 390);
  const exitBy = a.exitBy ? Date.parse(a.exitBy) : NaN;
  if (fin(exitBy) && exitBy > a.anchorMs) end = exitBy;
  const exp = a.isOption ? optionExpiryCloseMs(a.expiryDate) : NaN;
  if (fin(exp)) end = Math.min(end, exp);
  return end;
}

// ─── the tracked fact ───────────────────────────────────────────────────────

export type AfterStopKind = 't1' | 'entry' | 'none';
export interface AfterStop { kind: AfterStopKind; atMs: number | null }

/**
 * Final verdict from an afterClose() result, or null while it can still change:
 * T1 is final the moment it prints; 'entry' / 'none' only once the window is complete.
 */
export function classifyAfterStop(a: Pick<AfterClose, 't1HitInHold' | 't1AtMs' | 'reclaimedEntryInHold' | 'reclaimAtMs' | 'holdComplete'>): AfterStop | null {
  if (a.t1HitInHold && a.t1AtMs != null) return { kind: 't1', atMs: a.t1AtMs };
  if (!a.holdComplete) return null;
  if (a.reclaimedEntryInHold) return { kind: 'entry', atMs: a.reclaimAtMs };
  return { kind: 'none', atMs: null };
}

const TAG_RE = /\[after-stop:(t1|entry|none)(?:@([0-9T:.\-]+Z))?\]/;
const TAG_RE_G = /\s*\[after-stop:[^\]]*\]/g;

export function formatAfterStopTag(v: AfterStop): string {
  return v.atMs != null && v.kind !== 'none' ? `[after-stop:${v.kind}@${new Date(v.atMs).toISOString()}]` : `[after-stop:${v.kind}]`;
}

export function parseAfterStop(notes: string | null | undefined): AfterStop | null {
  const m = TAG_RE.exec(String(notes ?? ''));
  if (!m) return null;
  const at = m[2] ? Date.parse(m[2]) : NaN;
  return { kind: m[1] as AfterStopKind, atMs: fin(at) ? at : null };
}

/** outcome_notes with exactly one after-stop tag (replaces any earlier one; everything else untouched). */
export function withAfterStopTag(notes: string | null | undefined, v: AfterStop): string {
  const base = String(notes ?? '').replace(TAG_RE_G, '').trimEnd();
  return `${base}${base ? ' ' : ''}${formatAfterStopTag(v)}`;
}

const etHHMM = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/**
 * "stopped · later reached T1 at 11:42" — the label shown on the NEXUS row and in
 * the journal. `stoppedMs` (the exit time) adds the date when T1 came on a later day.
 */
export function afterStopLabel(v: AfterStop | null, stoppedMs?: number | null): string | null {
  if (!v) return null;
  const when = (ms: number | null) => {
    if (ms == null) return '';
    const sameDay = stoppedMs != null && fin(stoppedMs) && etDay(stoppedMs) === etDay(ms);
    return ` ${sameDay || stoppedMs == null ? '' : `${etDay(ms).slice(5)} `}${etHHMM(ms)}`;
  };
  if (v.kind === 't1') return `stopped · later reached T1 at${when(v.atMs)}`;
  if (v.kind === 'entry') return `stopped · later back at entry${when(v.atMs)}`;
  return 'stopped · did not recover';
}

/** Is this a stop-out the after-stop fact applies to? (A stop that locked profit is not a loss and is skipped.) */
export function isStoppedOut(outcomeStatus: string | null | undefined): boolean {
  const s = String(outcomeStatus ?? '').toLowerCase();
  return s === 'hit_stop' || s === 'stopped_out';
}

export interface MissedWinners {
  /** stop-outs with a final after-stop verdict */
  checked: number;
  /** of those, T1 printed later inside the hold window */
  laterT1: number;
  /** traded back at entry (no T1) */
  backToEntry: number;
  /** stop-outs still waiting for a verdict (window open or job not yet run) */
  pending: number;
}

/** Track-record "missed winners" count over a population — hindsight, not part of the win rate. */
export function countMissedWinners(ideas: Array<{ outcomeStatus?: string | null; outcomeNotes?: string | null }>): MissedWinners {
  const out: MissedWinners = { checked: 0, laterT1: 0, backToEntry: 0, pending: 0 };
  for (const i of ideas) {
    if (!isStoppedOut(i.outcomeStatus)) continue;
    const v = parseAfterStop(i.outcomeNotes);
    if (!v) { out.pending++; continue; }
    out.checked++;
    if (v.kind === 't1') out.laterT1++;
    else if (v.kind === 'entry') out.backToEntry++;
  }
  return out;
}
