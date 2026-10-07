/**
 * IDEA TIMELINE — what actually happened to one published idea, in order.
 * ============================================================================
 * Pure (no I/O). The server route (server/idea-timeline.ts) loads the row and
 * calls buildIdeaTimeline; the NEXUS detail (setup-timeline.tsx) renders it and
 * the replay (setup-replay.tsx) marks the recorded events on its bars.
 *
 * Integrity rules:
 *   • Only RECORDED events carry a time and price. Anything the database does
 *     not hold is 'pending' (still possible) / 'not_reached' (the idea closed
 *     another way) / 'not_recorded' (should exist but no column holds it) /
 *     'not_applicable' — never a guessed time.
 *   • Every event names its source column / engine and how its time was found
 *     (timeBasis). The trigger time is the trigger observer's PASS time, not the
 *     cross (server/oracle-lifecycle-reconciler.ts); a barrier exit tagged
 *     [exit-time:live] is the tracker's cycle time, "hit time unknown"
 *     (shared/exit-hit-time.ts).
 *   • A pending level (T1 / stop not yet hit) is reported as `level`, never as
 *     `price` — `price` is only ever an observed / recorded print.
 *   • T2: trade_ideas stores a single target (target_price). There is no T2
 *     column, so T2 is 'not_applicable' with that reason.
 *
 * Also here: detectReplayCrossings — the crossings a replay can SEE in bars
 * (first touch of entry, then T1 / stop; same bar = stop first). These are
 * labelled "replay-detected" and never replace a recorded event.
 */
import { readOracleExecutionAudit } from './oracle-lifecycle';
import { parsePeak, peakCapture } from './option-peak';
import { parseRunner } from './runner-policy';

export type TimelineEventKind = 'published' | 'trigger' | 'execution' | 't1' | 't2' | 'stop' | 'exit' | 'runner' | 'peak';
export type TimelineStatus = 'recorded' | 'pending' | 'not_reached' | 'not_recorded' | 'not_applicable';
export type TimelineTimeBasis =
  | 'stored'          // a timestamp column written when it happened (publish, paper fill)
  | 'observer_pass'   // trigger observer pass time (≤ one cycle after the cross)
  | 'bar_hit'         // exit time located on the first bar that crossed the level
  | 'deadline'        // exit at the idea's deadline / expiry
  | 'tracker_cycle'   // barrier exit stamped with the tracker's cycle time — hit time unknown
  | 'untagged'        // exit_date with no [exit-time:*] tag (pre-tag rows)
  | 'contract_bar'    // the contract's own trade bar (peak / runner exit)
  | 'quote_pass';     // a live mid the tracker saw on a pass (peak while open)

export interface TimelineEvent {
  kind: TimelineEventKind;
  label: string;
  status: TimelineStatus;
  /** ISO UTC — only when status === 'recorded'. */
  at: string | null;
  /** America/New_York rendering of `at`, e.g. "Mon Oct 6, 10:42 AM ET". */
  atEt: string | null;
  timeBasis: TimelineTimeBasis | null;
  /** Recorded underlying price at this event (never a plan level). */
  price: number | null;
  /** Plan level for a pending / unreached event (entry, T1, stop). */
  level: number | null;
  /** Option contract premium recorded at this event (entry_premium / exit_premium). */
  premium: number | null;
  /** Column / engine that recorded it. */
  source: string;
  note: string | null;
}

export interface TimelineIdea {
  id: string;
  symbol: string;
  assetType?: string | null;
  direction?: string | null;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  timestamp?: string | null;
  source?: string | null;
  outcomeStatus?: string | null;
  resolutionReason?: string | null;
  outcomeNotes?: string | null;
  exitPrice?: number | null;
  exitDate?: string | null;
  percentGain?: number | null;
  entryPremium?: number | null;
  exitPremium?: number | null;
  optionPercentGain?: number | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  exitBy?: string | null;
  entryValidUntil?: string | null;
  convergenceSignalsJson?: unknown;
}

export interface IdeaTimeline {
  ideaId: string;
  symbol: string;
  direction: 'long' | 'short';
  isOption: boolean;
  contract: { optionType: string | null; strike: number | null; expiry: string | null } | null;
  plan: { entry: number; target: number; stop: number };
  outcomeStatus: string;
  events: TimelineEvent[];
  notes: string[];
  asOf: string;
}

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
/** "Mon, Oct 6, 10:42 AM ET" — America/New_York. */
export function fmtEt(ms: number): string {
  return `${ET_FMT.format(new Date(ms))} ET`;
}

const msOf = (s?: string | null): number | null => {
  if (!s) return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : null;
};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function isOptionIdea(i: Pick<TimelineIdea, 'assetType' | 'optionType'>): boolean {
  return /option/i.test(String(i.assetType ?? '')) || i.optionType === 'call' || i.optionType === 'put';
}

const EXIT_TAG = /\[exit-time:(bar_hit|deadline|live)\]/;
function exitBasis(notes: string | null | undefined): TimelineTimeBasis {
  const m = EXIT_TAG.exec(notes ?? '');
  if (!m) return 'untagged';
  return m[1] === 'live' ? 'tracker_cycle' : (m[1] as 'bar_hit' | 'deadline');
}
const BASIS_NOTE: Partial<Record<TimelineTimeBasis, string>> = {
  bar_hit: 'time = first bar that crossed the level',
  deadline: 'time = the idea deadline / expiry',
  tracker_cycle: 'resolved at the tracker cycle time (hit time unknown)',
  untagged: 'exit_date written before exit-time tagging; how the time was found is not recorded',
};

function ev(kind: TimelineEventKind, label: string, status: TimelineStatus, p: Partial<TimelineEvent> & { source: string }): TimelineEvent {
  const atMs = msOf(p.at ?? null);
  return {
    kind, label, status,
    at: status === 'recorded' && atMs != null ? new Date(atMs).toISOString() : null,
    atEt: status === 'recorded' && atMs != null ? fmtEt(atMs) : null,
    timeBasis: status === 'recorded' ? p.timeBasis ?? null : null,
    price: status === 'recorded' ? p.price ?? null : null,
    level: p.level ?? null,
    premium: status === 'recorded' ? p.premium ?? null : null,
    source: p.source,
    note: p.note ?? null,
  };
}

const KIND_ORDER: Record<TimelineEventKind, number> = { published: 0, trigger: 1, execution: 2, t1: 3, t2: 4, stop: 5, runner: 6, exit: 7, peak: 8 };

export function buildIdeaTimeline(i: TimelineIdea, nowMs: number = Date.now()): IdeaTimeline {
  const option = isOptionIdea(i);
  const status = String(i.outcomeStatus ?? 'open');
  const open = status === 'open';
  const reason = String(i.resolutionReason ?? '');
  const missed = reason.startsWith('missed_entry');
  const audit = readOracleExecutionAudit(i.convergenceSignalsJson);
  const exitMs = msOf(i.exitDate);
  const basis = exitBasis(i.outcomeNotes);
  const events: TimelineEvent[] = [];
  const notes: string[] = [];

  // ── published ──
  const pubMs = msOf(i.timestamp);
  events.push(pubMs != null
    ? ev('published', 'Published', 'recorded', {
      at: i.timestamp!, timeBasis: 'stored', level: i.entryPrice,
      premium: option ? num(i.entryPremium) : null,
      source: `trade_ideas.timestamp${i.source ? ` · engine ${i.source}` : ''}${option && num(i.entryPremium) != null ? ' · entry_premium (mid at creation)' : ''}`,
      note: option && num(i.entryPremium) == null ? 'entry premium not recorded for this option idea' : null,
    })
    : ev('published', 'Published', 'not_recorded', { source: 'trade_ideas.timestamp', note: 'timestamp missing or unparseable' }));

  // ── trigger ──
  const trigAt = audit?.triggerObservedAt ?? null;
  if (trigAt && msOf(trigAt) != null) {
    events.push(ev('trigger', 'Trigger hit', 'recorded', {
      at: trigAt, timeBasis: 'observer_pass',
      price: num(audit?.triggerObservedPrice), level: num(audit?.triggerPrice) ?? i.entryPrice,
      source: 'convergence_signals_json.executionAudit.triggerObservedAt (trigger observer)',
      note: 'observer pass time, not the exact cross; price = best price the observer saw, not a fill',
    }));
  } else if (missed) {
    events.push(ev('trigger', 'Trigger hit', 'not_reached', { level: i.entryPrice, source: 'trade_ideas.resolution_reason', note: `entry window closed without a trigger (${reason})` }));
  } else if (open) {
    events.push(ev('trigger', 'Trigger hit', 'pending', { level: i.entryPrice, source: 'trigger observer', note: 'no trigger observed yet' }));
  } else {
    events.push(ev('trigger', 'Trigger hit', 'not_recorded', {
      level: i.entryPrice, source: 'convergence_signals_json.executionAudit',
      note: 'no trigger record on this row (the trigger observer only started 2026-09-30)',
    }));
  }

  // ── paper / broker execution (only when recorded) ──
  if (audit?.executionRecordedAt && msOf(audit.executionRecordedAt) != null) {
    events.push(ev('execution', `Filled (${audit.executionVenue ?? 'unknown venue'})`, 'recorded', {
      at: audit.executionRecordedAt, timeBasis: 'stored', price: num(audit.executionPrice),
      source: `convergence_signals_json.executionAudit.executionRecordedAt${audit.paperPositionId ? ` · paper position ${audit.paperPositionId}` : ''}`,
      note: null,
    }));
  }

  const exitRecorded = !open && exitMs != null;
  const exitFields = {
    at: i.exitDate!, timeBasis: basis, price: num(i.exitPrice),
    premium: option ? num(i.exitPremium) : null,
    note: BASIS_NOTE[basis] ?? null,
  };

  // ── T1 ──
  if (status === 'hit_target') {
    events.push(exitRecorded
      ? ev('t1', 'T1 hit', 'recorded', { ...exitFields, level: i.targetPrice, source: 'trade_ideas.outcome_status=hit_target · exit_date / exit_price (outcome tracker)' })
      : ev('t1', 'T1 hit', 'not_recorded', { level: i.targetPrice, source: 'trade_ideas.exit_date', note: 'outcome is hit_target but exit_date is missing' }));
  } else if (open) {
    events.push(ev('t1', 'T1', 'pending', { level: i.targetPrice, source: 'trade_ideas.target_price', note: 'not hit yet' }));
  } else {
    events.push(ev('t1', 'T1', 'not_reached', { level: i.targetPrice, source: 'trade_ideas.outcome_status', note: `closed as ${status} — T1 not recorded as hit` }));
  }

  // ── T2 ──
  events.push(ev('t2', 'T2', 'not_applicable', { source: 'trade_ideas.target_price', note: 'this idea stores a single target — no T2 is recorded' }));

  // ── stop ──
  if (status === 'hit_stop') {
    events.push(exitRecorded
      ? ev('stop', 'Stop hit', 'recorded', { ...exitFields, level: i.stopLoss, source: 'trade_ideas.outcome_status=hit_stop · exit_date / exit_price (outcome tracker)' })
      : ev('stop', 'Stop hit', 'not_recorded', { level: i.stopLoss, source: 'trade_ideas.exit_date', note: 'outcome is hit_stop but exit_date is missing' }));
  } else if (open) {
    events.push(ev('stop', 'Stop', 'pending', { level: i.stopLoss, source: 'trade_ideas.stop_loss', note: 'not hit' }));
  } else {
    events.push(ev('stop', 'Stop', 'not_reached', { level: i.stopLoss, source: 'trade_ideas.outcome_status', note: `closed as ${status} — stop not recorded as hit` }));
  }

  // ── exit ──
  if (open) {
    const by = msOf(i.exitBy);
    events.push(ev('exit', 'Exit', 'pending', { source: 'trade_ideas.outcome_status=open', note: by != null ? `open · exit deadline ${fmtEt(by)}` : 'open' }));
  } else if (exitRecorded) {
    const gain = option ? num(i.optionPercentGain) ?? num(i.percentGain) : num(i.percentGain);
    const gainNote = gain != null ? `${gain >= 0 ? '+' : ''}${gain.toFixed(1)}% (${option && num(i.optionPercentGain) != null ? 'option_percent_gain' : 'percent_gain'})` : null;
    events.push(ev('exit', `Exit · ${status.replace('_', ' ')}`, 'recorded', {
      ...exitFields,
      source: `trade_ideas.exit_date / exit_price${option ? ' / exit_premium' : ''} · ${reason || 'resolution_reason not recorded'}`,
      note: [gainNote, exitFields.note].filter(Boolean).join(' · ') || null,
    }));
  } else {
    events.push(ev('exit', `Exit · ${status.replace('_', ' ')}`, 'not_recorded', { source: 'trade_ideas.exit_date', note: 'closed, but exit_date is missing or unparseable' }));
  }

  // ── runner (0DTE runner policy: ½ at T1, the rest trailed) ──
  const run = option ? parseRunner(i.outcomeNotes) : null;
  if (run) {
    events.push(run.state === 'closed' && run.runnerAtMs != null
      ? ev('runner', 'Runner exit (½)', 'recorded', {
        at: new Date(run.runnerAtMs).toISOString(), timeBasis: 'contract_bar', premium: run.runnerExitPremium,
        source: 'outcome_notes [runner:…] (server/option-peak-job.ts, contract 1m bars)',
        note: `½ at T1 $${run.t1ExitPremium.toFixed(2)} · runner $${(run.runnerExitPremium ?? 0).toFixed(2)}${run.runnerWhy ? ` (${run.runnerWhy})` : ''} · blended $${(run.blendedPremium ?? 0).toFixed(2)} = exit_premium`,
      })
      : ev('runner', 'Runner (½)', 'pending', {
        source: 'outcome_notes [runner:open]', level: null,
        note: `½ sold at T1 $${run.t1ExitPremium.toFixed(2)} · runner open${run.stop != null ? `, stop at breakeven $${run.stop.toFixed(2)}` : ''} — trail / VWAP / +100% / 15:45`,
      }));
  }

  // ── peak (hindsight: the contract's best price after entry) ──
  const pk = option ? parsePeak(i.outcomeNotes) : null;
  if (pk) {
    const cap = !open ? peakCapture(num(i.entryPremium), num(i.exitPremium), pk.premium) : null;
    events.push(ev('peak', `Peak premium${pk.window === 'to_eod' ? ' (through 16:00)' : ''}`, 'recorded', {
      at: new Date(pk.atMs).toISOString(), timeBasis: pk.basis === 'quote' ? 'quote_pass' : pk.basis === 'bar' ? 'contract_bar' : 'untagged',
      price: pk.underlying ?? null, premium: pk.premium,
      source: `outcome_notes [peak:…] · ${pk.basis}${pk.basis === 'intrinsic' ? ' (no contract print — intrinsic at the underlying\'s best print)' : ''} · ${pk.source}`,
      note: [
        !open && num(i.exitPremium) != null ? `exit $${num(i.exitPremium)!.toFixed(2)}` : null,
        cap != null ? `exit kept ${Math.round(cap * 100)}% of the move to the peak` : null,
        'hindsight beside the outcome — not the P&L',
      ].filter(Boolean).join(' · '),
    }));
  }

  if (option) notes.push('Prices are the UNDERLYING (exit_price is the stock price); premiums are the contract mid recorded by the validator.');
  if (basis === 'tracker_cycle' && !open) notes.push('Exit time is the tracker cycle time, not the moment price touched the level.');

  // recorded first in time order, then the rest in canonical order
  const rec = events.filter((e) => e.status === 'recorded').sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const rest = events.filter((e) => e.status !== 'recorded').sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return {
    ideaId: i.id,
    symbol: i.symbol,
    direction: i.direction === 'short' ? 'short' : 'long',
    isOption: option,
    contract: option ? { optionType: i.optionType ?? null, strike: num(i.strikePrice), expiry: i.expiryDate ?? null } : null,
    plan: { entry: i.entryPrice, target: i.targetPrice, stop: i.stopLoss },
    outcomeStatus: status,
    events: [...rec, ...rest],
    notes,
    asOf: new Date(nowMs).toISOString(),
  };
}

// ── replay-detected crossings (bars → first touches) ──────────────────────
export interface ReplayBar { t: number; open: number; high: number; low: number; close: number }
export interface ReplayCrossing { kind: 'trigger' | 't1' | 'stop'; t: number; level: number }

/**
 * What the bars show, from `fromMs`: first bar whose range contains the entry
 * (or gaps across it) = trigger; after it, first bar touching T1 or stop
 * (long: high ≥ T1 / low ≤ stop; short mirrored). Same bar touching both =
 * stop (intrabar order unknown). With `triggerMs` given (a recorded trigger),
 * the barrier search starts there instead of at the bar-detected trigger.
 */
export function detectReplayCrossings(
  bars: ReplayBar[],
  plan: { direction: 'long' | 'short'; entry: number; target: number; stop: number },
  fromMs: number,
  untilMs: number = Infinity,
  triggerMs: number | null = null,
): ReplayCrossing[] {
  const path = bars.filter((b) => b.t >= fromMs && b.t < untilMs).sort((a, b) => a.t - b.t);
  const out: ReplayCrossing[] = [];
  let trigT: number | null = null;
  let prevClose: number | null = null;
  for (const b of path) {
    const inRange = b.low <= plan.entry && b.high >= plan.entry;
    const gapped = prevClose != null && ((prevClose < plan.entry && b.open > plan.entry) || (prevClose > plan.entry && b.open < plan.entry));
    if (inRange || gapped) { trigT = b.t; break; }
    prevClose = b.close;
  }
  if (trigT != null) out.push({ kind: 'trigger', t: trigT, level: plan.entry });
  const start = triggerMs ?? trigT;
  if (start == null) return out;
  const L = plan.direction === 'long';
  for (const b of path) {
    if (b.t < start) continue;
    const stop = L ? b.low <= plan.stop : b.high >= plan.stop;
    const tgt = L ? b.high >= plan.target : b.low <= plan.target;
    if (stop) { out.push({ kind: 'stop', t: b.t, level: plan.stop }); break; }
    if (tgt) { out.push({ kind: 't1', t: b.t, level: plan.target }); break; }
  }
  return out;
}

// ── "test this setup" result (server/idea-timeline.ts testSetup) ─────────
/** Plan rules replayed on similar past setups. Always labelled measuring / unvalidated. */
export interface SetupTestResult {
  ideaId: string;
  label: string;
  status: 'measured' | 'insufficient';
  cohort: { rule: string; widened: boolean; source: string | null; direction: string; assetType: string | null; holdingPeriod: string | null; since: string; before: string };
  rules: string[];
  window: { from: string | null; to: string | null };
  considered: number;
  replayed: number;
  neverTriggered: number;
  noData: number;
  open: number;
  /** closed under the rules (T1 + stop + horizon) */
  n: number;
  hitT1: number;
  stopped: number;
  horizon: number;
  hitT1Rate: number | null;
  stopRate: number | null;
  avgR: number | null;
  intervals: Record<string, number>;
  asOf: string;
  notes: string[];
}

// ── replay bar plan (which interval the feed can serve for a window) ──────
export interface ReplayBarPlan { interval: '1m' | '5m' | '1h' | '1d'; range: '5d' | '1mo' | '3mo' | '1y' | '2y'; tf: '1m' | '5m' | '1h' | '1D'; why: string }
const DAY_MS = 86_400_000;
/**
 * The finest bars the history feed (/api/historical-prices → Yahoo) holds back
 * to `startMs`: 1m for ~7 days ('5d' range = 7 calendar days), 5m inside the
 * '1mo' range (32 days; Yahoo caps 5m at 60 days and the feed has no range
 * between 1mo and 3mo), 1h inside '3mo', else daily.
 */
export function replayBarPlan(startMs: number, nowMs: number = Date.now()): ReplayBarPlan {
  const age = (nowMs - startMs) / DAY_MS;
  if (age <= 6.5) return { interval: '1m', range: '5d', tf: '1m', why: 'publish within the 7-day 1-minute history' };
  if (age <= 31) return { interval: '5m', range: '1mo', tf: '5m', why: '1-minute history ends after 7 days; 5-minute bars cover the last month' };
  if (age <= 90) return { interval: '1h', range: '3mo', tf: '1h', why: 'older than the 1-month 5-minute range; hourly bars cover 3 months' };
  return { interval: '1d', range: age <= 360 ? '1y' : '2y', tf: '1D', why: 'older than 3 months; daily bars only' };
}
