/**
 * OPTION FILL TRUTH — the pure core of research/verify-nexus-book.ts verifyOption
 * (ledger audit 2026-10-15, research/ledger-audit-2026-10-15/REPORT.md fixes 1 + 2).
 *
 * WHAT WAS WRONG
 *   · "VERIFIED" meant the recomputed P&L landed within $15 or 20% of the recorded
 *     one. SPX 7760P / SPY 779P / COIN 200C carried entries the contract never
 *     traded at and still passed; 37% of option entries since 08-26 were never
 *     inside the contract's traded range within ±5 min of publish.
 *   · Stop-vs-target order was never checked from the trigger: CRDO 180P was a
 *     verified stop although the underlying reached the target first; SPY 780P
 *     "expired +$18" although it reached the target first (+$262); QQQ 746P "hit
 *     stop" although nothing was touched and it expired worthless.
 *
 * THE RULES (pure; no I/O — tests: scripts/test-verify-option-core.ts)
 *   ENTRY  verified only when the recorded entry premium lies inside the contract's
 *          traded range (1-min bars, low..high, ±5 min of publish OR of the trigger;
 *          slack max($0.01, 3%) for the tick / print-vs-quote gap — the audit's
 *          bracket). Otherwise the entry is RE-PRICED from the first real print at or
 *          after the trigger (bar VWAP, else close) → "entry-repriced". No print at
 *          all → "no-print" (unverifiable). There is no $ / % tolerance pass.
 *   ORDER  from the trigger to the recorded exit, the FIRST barrier touched on
 *          (a) the underlying (plan stop / target) and (b) the premium plan (premium
 *          stop / T1) when one exists. Both inside one bar → stop (bars cannot order
 *          them). The GOVERNING path is the premium plan for premium-stop engines
 *          (stored premiumPlan or a premium_* resolution), else the underlying.
 *          Governing first-hit ≠ recorded outcome → wrong_outcome_order. Governing
 *          agrees but the other path hit the OPPOSITE barrier first →
 *          barrier_order_disagrees. Either way MISMATCH — never silently accepted.
 *   EXIT   the recorded exit premium must lie inside the traded range around the exit
 *          event (±5 min of the touch / recorded exit), or equal settlement intrinsic
 *          (±$0.05) at expiry; otherwise it is re-priced from bars.
 */

export type OBar = { t: number; o: number; h: number; l: number; c: number; v?: number; vw?: number };

export const ENTRY_WINDOW_MS = 5 * 60_000;
export const EXIT_WINDOW_MS = 5 * 60_000;
export const RANGE_SLACK = { abs: 0.01, rel: 0.03 } as const;
export const SETTLEMENT_TOL = 0.05;
/** Off-hours publish: the "first prints after publish" range only spans this long from the first print (CNC 70C, KORU 17P: 5 prints over 2 days). */
export const OFFHOURS_RANGE_SPAN_MS = 30 * 60_000;
/** A re-priced entry must print within this long of the trigger's session open; later is no fill (DASH 145C: first print 8 days on). */
export const MAX_FILL_DELAY_MS = 60 * 60_000;

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

export interface TradedRange { lo: number; hi: number; bars: number; basis: string }

/** Inside a traded range with the tick slack. Pure. */
export function insideRange(px: number, r: Pick<TradedRange, 'lo' | 'hi'>): boolean {
  if (!fin(px)) return false;
  return px >= r.lo - Math.max(RANGE_SLACK.abs, r.lo * RANGE_SLACK.rel) && px <= r.hi + Math.max(RANGE_SLACK.abs, r.hi * RANGE_SLACK.rel);
}

/** Low..high of every bar within ±halfMs of any center (1-min bars keyed by their start). Pure. */
export function tradedRange(bars: readonly OBar[], centers: readonly (number | null | undefined)[], halfMs: number, basis: string): TradedRange | null {
  const cs = centers.filter(fin);
  const w = bars.filter((b) => cs.some((c) => b.t >= c - halfMs && b.t <= c + halfMs));
  if (!w.length) return null;
  return { lo: Math.min(...w.map((b) => b.l)), hi: Math.max(...w.map((b) => b.h)), bars: w.length, basis };
}

const printPx = (b: OBar) => (fin(b.vw) && b.vw > 0 ? b.vw : b.c);

/** First real print at/after `ms` (the bar containing it counts) up to `untilMs`. Pure. */
export function firstPrintFrom(bars: readonly OBar[], ms: number, untilMs: number): { px: number; at: number; delayMs: number } | null {
  const b = bars.find((x) => x.t > ms - 60_000 && x.t <= untilMs);
  return b ? { px: r2(printPx(b)), at: b.t, delayMs: Math.max(0, b.t - ms) } : null;
}

export interface EntryCheck {
  status: 'verified' | 'entry-repriced' | 'no-print';
  recorded: number;
  /** The entry the P&L uses: the recorded premium when verified, else the first real print. */
  entry: number | null;
  range: TradedRange | null;
  fill: { px: number; at: string; delayMin: number } | null;
  detail: string;
}

/** Fix 1: was the recorded entry premium a price the contract traded at publish / trigger? Pure. */
export function entryCheck(bars: readonly OBar[], a: { pubMs: number; trigMs: number; exitMs: number; recorded: number }): EntryCheck {
  let range = tradedRange(bars, [a.pubMs, a.trigMs], ENTRY_WINDOW_MS, '±5m of publish / trigger');
  if (!range) {
    // Off-hours publish: the first prints after publication are the market it met.
    const after = bars.filter((b) => b.t >= a.pubMs);
    const nxt = after.filter((b) => b.t - after[0].t <= OFFHOURS_RANGE_SPAN_MS).slice(0, 5);
    if (nxt.length) range = { lo: Math.min(...nxt.map((b) => b.l)), hi: Math.max(...nxt.map((b) => b.h)), bars: nxt.length, basis: 'first 5 prints after publish' };
  }
  const fill0 = firstPrintFrom(bars, a.trigMs, Math.max(a.trigMs, a.exitMs));
  const lateFill = fill0 != null && fill0.at - nextRthOpenMs(a.trigMs) > MAX_FILL_DELAY_MS;
  const fill = fill0 ? { px: fill0.px, at: iso(fill0.at)!, delayMin: Math.round(fill0.delayMs / 60_000) } : null;
  if (range && insideRange(a.recorded, range)) {
    return { status: 'verified', recorded: a.recorded, entry: a.recorded, range, fill, detail: `entry ${a.recorded} inside traded [${range.lo}, ${range.hi}] (${range.basis}, ${range.bars} bars)` };
  }
  if (fill && lateFill) {
    return { status: 'no-print', recorded: a.recorded, entry: null, range, fill, detail: `entry ${a.recorded} ${range ? `outside traded [${range.lo}, ${range.hi}] (${range.basis})` : 'had no print near publish / trigger'}; the first print (${fill.px} at ${fill.at}) is more than ${MAX_FILL_DELAY_MS / 60_000}m after the trigger's session open — no fill to price` };
  }
  if (fill) {
    return {
      status: 'entry-repriced', recorded: a.recorded, entry: fill.px, range, fill,
      detail: `entry ${a.recorded} ${range ? `outside traded [${range.lo}, ${range.hi}] (${range.basis})` : 'had no print near publish / trigger'} → first real print ${fill.px} at ${fill.at}${fill.delayMin > 0 ? ` (${fill.delayMin}m after the trigger)` : ''}`,
    };
  }
  return { status: 'no-print', recorded: a.recorded, entry: null, range, fill: null, detail: `no contract print from the trigger to the exit${range ? `; publish range [${range.lo}, ${range.hi}]` : ''}` };
}

// ─── barrier order (fix 2) ────────────────────────────────────

export interface BarrierHit { kind: 'stop' | 'target' | 'none'; at: number | null; px: number | null; sameBar: boolean; basis: 'underlying' | 'premium' }

/**
 * First barrier touched in (fromMs, toMs]: stop first on a bar touching both. A gap
 * through the level fills at the bar open. `long` = the barrier sense of the series
 * (underlying: the published direction; premium: always long). Pure.
 */
export function firstBarrier(bars: readonly OBar[], a: { long: boolean; stop: number | null; target: number | null; fromMs: number; toMs: number; basis: 'underlying' | 'premium' }): BarrierHit {
  for (const b of bars) {
    if (b.t + 60_000 <= a.fromMs || b.t > a.toMs) continue;
    const sh = fin(a.stop) && (a.long ? b.l <= a.stop : b.h >= a.stop);
    const th = fin(a.target) && (a.long ? b.h >= a.target : b.l <= a.target);
    if (sh) return { kind: 'stop', at: b.t, px: (a.long ? b.o <= a.stop! : b.o >= a.stop!) ? b.o : a.stop, sameBar: !!th, basis: a.basis };
    if (th) return { kind: 'target', at: b.t, px: (a.long ? b.o >= a.target! : b.o <= a.target!) ? b.o : a.target, sameBar: false, basis: a.basis };
  }
  return { kind: 'none', at: null, px: null, sameBar: false, basis: a.basis };
}

export type RecordedKind = 'stop' | 'target' | 'none';
export function recordedKindOf(status: string | null | undefined): RecordedKind {
  const s = String(status ?? '').toLowerCase();
  return s === 'hit_stop' ? 'stop' : s === 'hit_target' ? 'target' : 'none';
}

/**
 * Premium-stop engine: a stored premium plan, or the tracker resolved it on premium
 * (premium_* — and the older option_target_hit / option_stop_hit labels). Pure.
 */
export function premiumGoverned(a: { hasStoredPremiumPlan: boolean; resolutionReason?: string | null }): boolean {
  const r = String(a.resolutionReason ?? '');
  return a.hasStoredPremiumPlan || r.startsWith('premium_') || r === 'option_target_hit' || r === 'option_stop_hit';
}

// ─── the order window (spot-check 2026-10-30) ─────────────────
/** Tracker stamps for barrier exits are 5-min bucket starts (refineExitTiming, 5-min bars). */
export const BARRIER_STAMP_SLACK_MS = 5 * 60_000;
/** A cycle-stamped ("live") barrier exit: the touch is somewhere in the cycle before the stamp + one cycle. */
export const LIVE_STAMP_SLACK_MS = 15 * 60_000;
/** Look-ahead for a barrier recorded EARLIER than any bar shows it (exit_time_misstamped). */
export const MISSTAMP_LOOKAHEAD_MS = 24 * 3600_000;

const etMin = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { min: Number(g('hour')) * 60 + Number(g('minute')), wd: g('weekday') };
};
/** 09:30 ET of the first weekday session at/after ms (ms itself when already inside RTH). Pure. */
export function nextRthOpenMs(ms: number): number {
  const { min, wd } = etMin(ms);
  const weekend = wd === 'Sat' || wd === 'Sun';
  if (!weekend && min >= 570 && min < 960) return ms;
  let t = ms - (min * 60_000) + 570 * 60_000; // today 09:30 ET (DST-safe to within the day)
  if (weekend || min >= 960) t += 86400_000;
  for (let i = 0; i < 4 && ['Sat', 'Sun'].includes(etMin(t).wd); i++) t += 86400_000;
  return t;
}

/**
 * The window the first-barrier search runs over, from the trigger.
 *   · barrier outcome (hit_stop / hit_target): to the stamp + its bucket (5 min; 15 min for a
 *     cycle "live" stamp). A stamp outside RTH (extended-hours quote) runs to the next RTH
 *     open + the bucket — the contract cannot trade before it.
 *   · time / expiry exit: up to, NOT including, the exit minute — a touch inside the exit bar
 *     cannot be ordered against the exit (the tracker judges [entry, exit) the same way).
 * The trigger is clamped to the exit: a trigger observed AFTER the exit (stale observer stamp)
 * falls back to `fallbackTrigMs`. Pure.
 */
export function orderWindow(a: { recordedStatus: string | null | undefined; trigMs: number; fallbackTrigMs: number; exitMs: number; exitTimeSource?: string | null; capMs: number }): { fromMs: number; toMs: number; trigClamped: boolean } {
  const barrier = recordedKindOf(a.recordedStatus) !== 'none';
  const trigClamped = a.trigMs > a.exitMs;
  const fromMs = trigClamped ? Math.min(a.fallbackTrigMs, a.exitMs) : a.trigMs;
  if (!barrier) return { fromMs, toMs: Math.min(a.capMs, a.exitMs - 1), trigClamped };
  const slack = a.exitTimeSource === 'live' ? LIVE_STAMP_SLACK_MS : BARRIER_STAMP_SLACK_MS;
  const base = nextRthOpenMs(a.exitMs);
  return { fromMs, toMs: Math.min(a.capMs, Math.max(a.exitMs, base) + slack), trigClamped };
}

export interface OrderCheck {
  governing: 'underlying' | 'premium';
  /** First barrier on the governing path (null: no bars on it). */
  first: BarrierHit | null;
  other: BarrierHit | null;
  recorded: RecordedKind;
  bug: 'wrong_outcome_order' | 'barrier_order_disagrees' | 'exit_time_misstamped' | null;
  detail: string;
}

const hitText = (h: BarrierHit | null) => !h ? 'no bars' : h.kind === 'none' ? 'nothing touched' : `${h.kind} first at ${iso(h.at)}${h.sameBar ? ' (same bar as target)' : ''}`;

/**
 * Fix 2: does the recorded outcome match the first barrier from the trigger? Pure.
 * A premium-governed row with no contract bars is NOT judged on the underlying (the
 * engine's barriers are premium levels) — it is unverifiable. `late` = the governing
 * path's first barrier AFTER the order window: when nothing was touched inside the window
 * but the recorded barrier is the next one touched, the outcome is right and only the
 * stamp is early → exit_time_misstamped (the exit is re-priced at the real touch).
 */
export function orderCheck(a: { recordedStatus: string | null | undefined; governing: 'underlying' | 'premium'; underlying: BarrierHit | null; premium: BarrierHit | null; late?: BarrierHit | null }): OrderCheck {
  const recorded = recordedKindOf(a.recordedStatus);
  let gov = a.governing;
  let first = gov === 'premium' ? a.premium : a.underlying;
  let other = gov === 'premium' ? a.underlying : a.premium;
  if (!first && other && gov === 'underlying') { first = other; other = null; gov = 'premium'; }
  const base = { governing: gov, first, other, recorded };
  const where = `${gov}: ${hitText(first)}${other ? `; ${other.basis}: ${hitText(other)}` : ''}`;
  if (!first) return { ...base, bug: null, detail: gov === 'premium' ? 'premium-governed but no contract bars to order the barriers' : 'no bars to order the barriers' };
  if (first.kind === 'none' && recorded !== 'none' && a.late && a.late.kind === recorded) {
    return { ...base, first: a.late, bug: 'exit_time_misstamped', detail: `recorded ${a.recordedStatus} is the first barrier, but touched later than stamped — ${gov}: ${hitText(a.late)}` };
  }
  if (first.kind !== recorded) {
    return { ...base, bug: 'wrong_outcome_order', detail: `recorded ${a.recordedStatus ?? 'open'} but ${where}` };
  }
  if (other && other.kind !== 'none' && other.kind !== first.kind) {
    return { ...base, bug: 'barrier_order_disagrees', detail: `recorded ${a.recordedStatus} agrees with the ${gov} path but ${where}` };
  }
  return { ...base, bug: null, detail: `recorded ${a.recordedStatus ?? 'open'} matches — ${where}` };
}

/** Exit premium for a barrier event: premium-plan level (gap → open), else the first contract print after the underlying touch. Pure. */
export function exitPremiumAt(hit: BarrierHit, optBars: readonly OBar[]): { px: number; at: number; basis: string } | null {
  if (hit.kind === 'none' || hit.at == null) return null;
  if (hit.basis === 'premium' && fin(hit.px)) return { px: r2(hit.px), at: hit.at, basis: `premium-plan ${hit.kind} (level, or the open when it gapped through)` };
  const after = optBars.find((b) => b.t >= hit.at! && b.t <= hit.at! + EXIT_WINDOW_MS)
    ?? optBars.find((b) => b.t >= hit.at! - 2 * EXIT_WINDOW_MS && b.t <= hit.at! + 2 * EXIT_WINDOW_MS);
  return after ? { px: r2(printPx(after)), at: after.t, basis: `first contract print after the underlying ${hit.kind} touch` } : null;
}

export interface ExitCheck { status: 'verified' | 'repriced' | 'no-print'; exit: number | null; recorded: number | null; range: TradedRange | null; detail: string }

/** Fix 1 for the exit leg: recorded exit inside the traded range around the event, or equal to settlement. Pure. */
export function exitCheck(bars: readonly OBar[], a: { recorded: number | null; eventMs: number | null; recordedExitMs: number | null; computed: number | null; settlement?: number | null }): ExitCheck {
  if (a.settlement != null && fin(a.settlement)) {
    const ok = a.recorded != null && Math.abs(a.recorded - a.settlement) <= SETTLEMENT_TOL;
    return { status: ok ? 'verified' : 'repriced', exit: ok ? a.recorded : r2(a.settlement), recorded: a.recorded, range: null, detail: `settlement intrinsic ${a.settlement}${ok ? ' = recorded' : ` ≠ recorded ${a.recorded}`}` };
  }
  const range = tradedRange(bars, [a.eventMs, a.recordedExitMs], EXIT_WINDOW_MS, '±5m of the exit event / recorded exit');
  if (a.recorded != null && range && insideRange(a.recorded, range)) {
    return { status: 'verified', exit: a.recorded, recorded: a.recorded, range, detail: `exit ${a.recorded} inside traded [${range.lo}, ${range.hi}]` };
  }
  if (a.computed != null && fin(a.computed)) {
    return { status: 'repriced', exit: r2(a.computed), recorded: a.recorded, range, detail: `exit ${a.recorded ?? '—'} ${range ? `outside traded [${range.lo}, ${range.hi}]` : 'had no print near the exit'} → ${r2(a.computed)} from bars` };
  }
  return { status: 'no-print', exit: null, recorded: a.recorded, range, detail: 'no contract print at the exit' };
}

export type FillVerdict =
  | { verdict: 'VERIFIED'; bugClass: null }
  | { verdict: 'MISMATCH'; bugClass: 'entry_repriced' | 'exit_premium_not_traded' | 'settlement_repriced' | 'wrong_outcome_order' | 'barrier_order_disagrees' | 'exit_time_misstamped' }
  | { verdict: 'UNVERIFIABLE'; bugClass: 'bar_unverifiable' };

/** The one verdict from the three checks. Order errors win (the outcome itself is wrong), then the legs. Pure. */
export function fillVerdict(e: EntryCheck, o: OrderCheck, x: ExitCheck, expiry: boolean): FillVerdict {
  if (o.bug && o.bug !== 'exit_time_misstamped') return { verdict: 'MISMATCH', bugClass: o.bug };
  if (e.status === 'no-print' || x.status === 'no-print' || !o.first) return { verdict: 'UNVERIFIABLE', bugClass: 'bar_unverifiable' };
  // Outcome right, stamp early: both legs priced from bars → a correctable mismatch.
  if (o.bug === 'exit_time_misstamped') return { verdict: 'MISMATCH', bugClass: 'exit_time_misstamped' };
  if (e.status === 'entry-repriced') return { verdict: 'MISMATCH', bugClass: 'entry_repriced' };
  if (x.status === 'repriced') return { verdict: 'MISMATCH', bugClass: expiry ? 'settlement_repriced' : 'exit_premium_not_traded' };
  return { verdict: 'VERIFIED', bugClass: null };
}
