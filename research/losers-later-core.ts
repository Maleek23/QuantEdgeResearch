/**
 * LOSERS LATER — pure core for research/losers-later.ts (no I/O; unit-tested by
 * scripts/test-losers-later.ts).
 *
 * Question (operator, 2026-10-06): "NEXUS had a lot of losing trades Monday —
 * did those losing trades end up green later?" For every closed losing idea we
 * measure, on the UNDERLYING from the plan entry and in the idea's underlying
 * direction (a bought put is 'short'):
 *   (a) did price reach T1 AFTER we closed it (and when) — "stopped, then would have won"
 *   (b) best favourable move after the close, inside the original holding window and by Friday's close
 *   (d) stop width in % / daily ATR vs the adverse excursion the trade actually needed to survive
 *   (e) entry context (time of day, gap, pre-market publish, SPY day direction)
 * and replay rule candidates on EVERY triggered closed idea (winners included —
 * a wider stop also changes winners and the size of the losses it doesn't save).
 *
 * Conventions (same as shared/run-up.ts / shared/exit-policy.ts):
 *   - a level counts when a bar's range touches it; stop and target in one bar → stop
 *   - the path after a close starts at the first bar opening at/after the close time
 *   - everything after the close is HINDSIGHT about that idea; it is reported as
 *     such and never relabels the recorded outcome.
 */
import { simulateExit, type RunUpBar } from '../shared/run-up';
import { atrSeries } from '../shared/exit-policy';

import { pctFrom, touches, stopTouched, type Bar, type Dir, type AfterClose } from '../shared/after-stop';

// The bar logic shared with the after-close job lives in shared/after-stop.ts.
export { pctFrom, firstStopBar, afterClose, type Bar, type Dir, type AfterCloseInput, type AfterClose } from '../shared/after-stop';

export const toRunUp = (b: Bar): RunUpBar => ({ t: b.t, open: b.o, high: b.h, low: b.l, close: b.c });
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

// ─── classification ────────────────────────────────────────────────────────

/**
 * A closed idea is a LOSS when its book P&L is negative. With no measured P&L,
 * only an explicit stop-out counts (an expiry/time-stop without a measured exit
 * is unmeasured, not a loss). Breakeven (0) is not a loss.
 */
export function isLoss(outcomeStatus: string | null | undefined, pnl: number | null | undefined): boolean {
  if (fin(pnl)) return pnl < 0;
  const s = String(outcomeStatus ?? '').toLowerCase();
  return s === 'hit_stop' || s === 'stopped_out';
}

export type CloseKind = 'stop' | 'expiry' | 'time_stop' | 'target' | 'manual' | 'other';
export function closeKind(outcomeStatus: string | null | undefined, resolutionReason?: string | null): CloseKind {
  const s = String(outcomeStatus ?? '').toLowerCase();
  const r = String(resolutionReason ?? '').toLowerCase();
  if (s === 'hit_stop' || s === 'stopped_out') return 'stop';
  if (s === 'hit_target') return 'target';
  if (r.includes('time_stop') || r.includes('time stop') || s === 'time_stop') return 'time_stop';
  if (s === 'expired') return 'expiry';
  if (s === 'manual_exit') return 'manual';
  return 'other';
}

const advPct = (dir: Dir, entry: number, b: Bar) => pctFrom(dir, entry, dir === 'long' ? b.l : b.h);

// ─── (d) stop geometry vs the excursion it had to survive ──────────────────

export interface StopGeometry {
  stopPct: number;
  /** stop distance in prior-session daily ATR(14); null without ATR */
  stopAtr: number | null;
  /** worst adverse % from entry, trigger → T1 touch (or → hold end when T1 never came) */
  maePct: number | null;
  /** maePct ÷ stopPct — a stop wider than this multiple would have survived that path */
  maeOverStop: number | null;
  maeAtr: number | null;
}
export function stopGeometry(a: { dir: Dir; entry: number; stop: number; atrD: number | null; bars: Bar[]; triggerMs: number; untilMs: number }): StopGeometry {
  const stopPct = Math.abs(a.entry - a.stop) / a.entry * 100;
  const path = a.bars.filter((b) => b.t >= a.triggerMs && b.t < a.untilMs);
  let mae: number | null = null;
  for (const b of path) { const x = -advPct(a.dir, a.entry, b); mae = mae == null ? x : Math.max(mae, x); }
  if (mae != null) mae = Math.max(0, mae);
  const atrPct = fin(a.atrD) && a.atrD > 0 ? (a.atrD / a.entry) * 100 : null;
  return {
    stopPct: r2(stopPct),
    stopAtr: atrPct ? r2(stopPct / atrPct) : null,
    maePct: mae == null ? null : r2(mae),
    maeOverStop: mae == null || !(stopPct > 0) ? null : r2(mae / stopPct),
    maeAtr: mae == null || !atrPct ? null : r2(mae / atrPct),
  };
}

/** Stopped (or closed), price later reached T1 in the window, and a stop ≤ k× wider would have survived to it. */
export const NOISE_STOP_MULTIPLE = 1.5;
export function isNoiseStop(after: Pick<AfterClose, 't1HitInHold'>, geo: Pick<StopGeometry, 'maeOverStop'>, k = NOISE_STOP_MULTIPLE): boolean {
  return after.t1HitInHold && geo.maeOverStop != null && geo.maeOverStop < k;
}

// ─── (e) context ───────────────────────────────────────────────────────────

export function todBucket(etMinute: number): string {
  if (etMinute < 570) return 'pre-market (<09:30)';
  if (etMinute < 600) return 'open 09:30–10:00';
  if (etMinute < 690) return 'morning 10:00–11:30';
  if (etMinute < 840) return 'midday 11:30–14:00';
  if (etMinute < 960) return 'afternoon 14:00–16:00';
  return 'after-hours (≥16:00)';
}
export function gapPct(prevClose: number | null, open: number | null): number | null {
  return fin(prevClose) && fin(open) && prevClose > 0 ? r2(((open - prevClose) / prevClose) * 100) : null;
}
export type DayDir = 'up' | 'down' | 'flat';
export function dayDirection(open: number | null, close: number | null, flatPct = 0.1): DayDir | null {
  if (!fin(open) || !fin(close) || open <= 0) return null;
  const p = ((close - open) / open) * 100;
  return p > flatPct ? 'up' : p < -flatPct ? 'down' : 'flat';
}
export function alignment(dir: Dir, d: DayDir | null): 'with' | 'against' | 'flat' | null {
  if (d == null) return null;
  if (d === 'flat') return 'flat';
  return (d === 'up') === (dir === 'long') ? 'with' : 'against';
}
/** Prior-session daily ATR(14) for `dayKey` (bars strictly before that day). */
export function atrBefore(daily: { day: string; o: number; h: number; l: number; c: number }[], dayKey: string, n = 14): number | null {
  const prior = daily.filter((d) => d.day < dayKey);
  if (prior.length < n) return null;
  const a = atrSeries(prior, n);
  const v = a[a.length - 1];
  return fin(v) ? v : null;
}

// ─── rule candidates ───────────────────────────────────────────────────────

export type RuleId = 'plan' | 'atr1' | 'atr1_5' | 'atr2' | 'wide1' | 'wide1_5' | 'wide2' | 'hyb_n3' | 'hyb_n6' | 'hyb_trail6' | 'close_stop' | 'time_only' | 'reentry';
export const RULES: RuleId[] = ['plan', 'atr1', 'atr1_5', 'atr2', 'wide1', 'wide1_5', 'wide2', 'hyb_n3', 'hyb_n6', 'hyb_trail6', 'close_stop', 'time_only', 'reentry'];
/** Hybrid: the plan stop for the first N bars after the trigger, then the wide stop (further of plan and k×ATR). */
export const HYBRID_K = 1.5;
export const RULE_LABEL: Record<RuleId, string> = {
  plan: 'Published plan: stop / T1 / horizon close (baseline)',
  atr1: 'Stop at 1.0× daily ATR(14) from entry (T1 unchanged)',
  atr1_5: 'Stop at 1.5× daily ATR(14) from entry (T1 unchanged)',
  atr2: 'Stop at 2.0× daily ATR(14) from entry (T1 unchanged)',
  wide1: 'Wider of the plan (structural) stop and 1.0× daily ATR(14) (T1 unchanged)',
  wide1_5: 'Wider of the plan (structural) stop and 1.5× daily ATR(14) (T1 unchanged)',
  wide2: 'Wider of the plan (structural) stop and 2.0× daily ATR(14) (T1 unchanged)',
  close_stop: 'Plan stop on a 5-min CLOSE beyond it (fill at that close), 3×ATR hard stop',
  hyb_n3: 'Hybrid: plan stop for the first 3 bars (15 min), then wider of plan and 1.5× ATR',
  hyb_n6: 'Hybrid: plan stop for the first 6 bars (30 min), then wider of plan and 1.5× ATR',
  hyb_trail6: 'Hybrid: plan stop for 6 bars, then a 1.5× ATR trail from the best price (never looser than wider-of plan/1.5× ATR)',
  time_only: 'No price stop except a 3×ATR catastrophe stop; exit at T1 or the horizon close',
  reentry: 'Plan; after a stop-out, re-enter once if price trades back at entry within 60 min (same stop/T1)',
};
export const REENTRY_WINDOW_MS = 60 * 60_000;

export interface RuleTrade {
  dir: Dir; entry: number; stop: number; target: number; atrD: number | null;
  triggerMs: number; holdEndMs: number; holdComplete: boolean; bars: Bar[];
}
export interface RuleResult { rule: RuleId; reason: string; pct: number | null; exitMs: number | null; reentered?: boolean }

function plan(t: RuleTrade, stop: number, from = t.triggerMs): RuleResult & { exitMs: number | null } {
  const x = simulateExit('actual', {
    direction: t.dir, entry: t.entry, stop, target: t.target, triggerMs: from, horizonEndMs: t.holdEndMs,
    bars: t.bars.map(toRunUp), horizonComplete: t.holdComplete,
  });
  return { rule: 'plan', reason: x.reason, pct: x.pct, exitMs: x.exitMs };
}
const atrStop = (t: RuleTrade, k: number) => (t.dir === 'long' ? t.entry - k * t.atrD! : t.entry + k * t.atrD!);
/** max(structural level, k×ATR): the further of the plan stop and the ATR stop — what shared/wide-stops.ts widenStop applies live. */
const wideStop = (t: RuleTrade, k: number) => { const a = atrStop(t, k); return t.dir === 'long' ? Math.min(t.stop, a) : Math.max(t.stop, a); };

/** Close-based stop: a bar that CLOSES beyond the stop exits at that close (before any target in it); 3×ATR touch = hard stop. */
/**
 * Hybrid stop: plan stop on bars [0, n) after the trigger, then the wide stop (further of plan and
 * HYBRID_K×ATR); with `trail`, after bar n the stop also trails HYBRID_K×ATR behind the best
 * high (long) / low (short) seen so far, but never looser than that wide stop. Same conventions as
 * simulateExit: stop before target inside a bar, stop fills at min(open, stop) (gap-through costs),
 * horizon close otherwise.
 */
function hybridStop(t: RuleTrade, n: number, trail: boolean, rule: RuleId): RuleResult {
  const L = t.dir === 'long';
  const wide = wideStop(t, HYBRID_K);
  const path = t.bars.filter((b) => b.t >= t.triggerMs && b.t < t.holdEndMs).sort((a, b) => a.t - b.t);
  const pc = (px: number) => r2(pctFrom(t.dir, t.entry, px));
  let best = t.entry;
  for (let k = 0; k < path.length; k++) {
    const b = path[k];
    let stop = k < n ? t.stop : wide;
    if (trail && k >= n) {
      const tr = L ? best - HYBRID_K * t.atrD! : best + HYBRID_K * t.atrD!;
      stop = L ? Math.max(stop, tr) : Math.min(stop, tr);
    }
    if (stopTouched(t.dir, stop, b)) return { rule, reason: 'stop', pct: pc(L ? Math.min(b.o, stop) : Math.max(b.o, stop)), exitMs: b.t };
    if (touches(t.dir, t.target, b)) return { rule, reason: 'target', pct: pc(t.target), exitMs: b.t };
    best = L ? Math.max(best, b.h) : Math.min(best, b.l);
  }
  if (!t.holdComplete || !path.length) return { rule, reason: path.length ? 'open' : 'nodata', pct: null, exitMs: null };
  const last = path[path.length - 1];
  return { rule, reason: 'horizon', pct: pc(last.c), exitMs: last.t };
}

function closeStop(t: RuleTrade): RuleResult {
  const L = t.dir === 'long';
  const hard = fin(t.atrD) ? atrStop(t, 3) : null;
  const path = t.bars.filter((b) => b.t >= t.triggerMs && b.t < t.holdEndMs).sort((a, b) => a.t - b.t);
  const pc = (px: number) => r2(pctFrom(t.dir, t.entry, px));
  for (const b of path) {
    if (hard != null && stopTouched(t.dir, hard, b)) return { rule: 'close_stop', reason: 'hard_stop', pct: pc(L ? Math.min(b.o, hard) : Math.max(b.o, hard)), exitMs: b.t };
    if (L ? b.c <= t.stop : b.c >= t.stop) return { rule: 'close_stop', reason: 'close_stop', pct: pc(b.c), exitMs: b.t };
    if (touches(t.dir, t.target, b)) return { rule: 'close_stop', reason: 'target', pct: pc(t.target), exitMs: b.t };
  }
  if (!t.holdComplete || !path.length) return { rule: 'close_stop', reason: path.length ? 'open' : 'nodata', pct: null, exitMs: null };
  const last = path[path.length - 1];
  return { rule: 'close_stop', reason: 'horizon', pct: pc(last.c), exitMs: last.t };
}

/** Bars are assumed 5-min unless they say otherwise; used to start a re-entry after the stop bar. */
const barWidth = (bars: Bar[]) => {
  const d = bars.slice(1, 40).map((b, k) => b.t - bars[k].t).filter((x) => x > 0).sort((a, b) => a - b);
  return d[0] ?? 5 * 60_000;
};

export function replayRule(rule: RuleId, t: RuleTrade): RuleResult {
  const needAtr = rule === 'atr1' || rule === 'atr1_5' || rule === 'atr2' || rule === 'time_only' || rule === 'wide1' || rule === 'wide1_5' || rule === 'wide2' || rule === 'hyb_n3' || rule === 'hyb_n6' || rule === 'hyb_trail6';
  if (needAtr && !(fin(t.atrD) && t.atrD > 0)) return { rule, reason: 'no_atr', pct: null, exitMs: null };
  switch (rule) {
    case 'plan': return plan(t, t.stop);
    case 'atr1': return { ...plan(t, atrStop(t, 1)), rule };
    case 'atr1_5': return { ...plan(t, atrStop(t, 1.5)), rule };
    case 'atr2': return { ...plan(t, atrStop(t, 2)), rule };
    case 'wide1': return { ...plan(t, wideStop(t, 1)), rule };
    case 'wide1_5': return { ...plan(t, wideStop(t, 1.5)), rule };
    case 'wide2': return { ...plan(t, wideStop(t, 2)), rule };
    case 'hyb_n3': return hybridStop(t, 3, false, rule);
    case 'hyb_n6': return hybridStop(t, 6, false, rule);
    case 'hyb_trail6': return hybridStop(t, 6, true, rule);
    case 'time_only': return { ...plan(t, atrStop(t, 3)), rule };
    case 'close_stop': return closeStop(t);
    case 'reentry': {
      const first = plan(t, t.stop);
      if (first.reason !== 'stop' || first.exitMs == null || first.pct == null) return { ...first, rule, reentered: false };
      const from = first.exitMs + barWidth(t.bars);
      const until = Math.min(first.exitMs + REENTRY_WINDOW_MS, t.holdEndMs);
      const back = t.bars.find((b) => b.t >= from && b.t < until && b.l <= t.entry && b.h >= t.entry);
      if (!back) return { ...first, rule, reentered: false };
      const second = plan(t, t.stop, back.t);
      if (second.pct == null) return { rule, reason: `stop+reentry_${second.reason}`, pct: null, exitMs: null, reentered: true };
      // two $1,000 legs: total = sum of the two % results
      return { rule, reason: `stop+reentry_${second.reason}`, pct: r2(first.pct + second.pct), exitMs: second.exitMs, reentered: true };
    }
  }
}

export interface RuleStats {
  n: number; wins: number; winRate: number | null; avgPct: number | null; sumPct: number | null;
  /** $1,000 notional per idea (per leg for re-entry) */
  pnl1000: number | null;
  /** sum of % with the 3 best results removed — a rule that only wins on its outliers is fragile */
  sumPctExTop3: number | null;
}
export function ruleStats(pcts: number[]): RuleStats {
  const n = pcts.length;
  if (!n) return { n, wins: 0, winRate: null, avgPct: null, sumPct: null, pnl1000: null, sumPctExTop3: null };
  const sum = pcts.reduce((s, x) => s + x, 0);
  const ex = [...pcts].sort((a, b) => b - a).slice(3).reduce((s, x) => s + x, 0);
  const wins = pcts.filter((x) => x > 0).length;
  return { n, wins, winRate: r1((wins / n) * 100), avgPct: r2(sum / n), sumPct: r2(sum), pnl1000: r2(sum * 10), sumPctExTop3: r2(ex) };
}

/** Every rule is a hypothesis: this label travels with every number. */
export function measuringLabel(n: number): string {
  return `MEASURING (n=${n})${n < 30 ? ' — too small to act on' : ''}`;
}

// ─── aggregation helpers ───────────────────────────────────────────────────

export function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter(fin).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return r2(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
}
export function pct(k: number, n: number): number | null { return n ? r1((k / n) * 100) : null; }

/** Friday 16:00 ET of the ISO week containing `dayKey` (YYYY-MM-DD, a weekday). */
export function fridayOf(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  const wd = d.getUTCDay(); // 0 Sun … 6 Sat
  const add = wd <= 5 ? 5 - wd : 6; // Saturday → next Friday
  return new Date(d.getTime() + add * 86_400_000).toISOString().slice(0, 10);
}

// ─── markdown ──────────────────────────────────────────────────────────────

export interface GroupRow { key: string; n: number; laterT1: number; laterT1Pct: number | null; medianStopAtr: number | null; medianStopPct: number | null; medianMaeOverStop: number | null; noise: number }
export interface RuleRow { rule: RuleId; label: string; stats: RuleStats; plan: RuleStats; deltaPnl1000: number | null; deltaWinRate: number | null; measuring: string; extra?: string }
export interface MondayIdeaRow {
  id: string; symbol: string; engine: string; direction: string; vehicle: string; publishedEt: string; triggered: boolean | null;
  outcome: string; pnl: number | null; bookExcluded: string | null; missedWinner: string | null;
}
export interface MarkdownInput {
  generatedAt: string; since: string; focus: string; dataThrough: string;
  population: { ideas: number; closed: number; losers: number; analysed: number; skipped: Record<string, number> };
  headline: {
    laterT1InHold: number; laterT1InHoldPct: number | null; laterT1ByWeek: number; laterT1ByWeekPct: number | null;
    reclaimedEntry: number; reclaimedEntryPct: number | null; greenAtHoldEnd: number; greenAtHoldEndPct: number | null; holdComplete: number;
    noise: number; noisePct: number | null; medianStopPct: number | null; medianStopAtr: number | null;
    medianMaeOverStopLaterT1: number | null; medianMaeOverStopOthers: number | null;
    optionLosers: number; optionLaterAboveEntryPremium: number; optionLaterAboveEntryPremiumPct: number | null;
  };
  byEngine: GroupRow[]; byCloseKind: GroupRow[]; byHolding: GroupRow[]; byTod: GroupRow[]; bySpy: GroupRow[]; byGap: GroupRow[]; byStopAtr: GroupRow[];
  rules: RuleRow[];
  monday: {
    published: number; triggered: number; closed: number; wins: number; losses: number; flat: number; open: number; untriggered: number; bookPnl: number;
    byEngine: { engine: string; published: number; closed: number; wins: number; losses: number; open: number; untriggered: number; pnl: number }[];
    missed: { closedThenT1: number; ranWithoutFill: number; wouldHaveWonAtMarket: number };
    ideas: MondayIdeaRow[];
  };
}

const f = (x: number | null | undefined, suffix = '') => (x == null ? '—' : `${x}${suffix}`);
const money = (x: number | null | undefined) => (x == null ? '—' : `${x < 0 ? '−' : '+'}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`);
function groupTable(title: string, rows: GroupRow[]): string {
  if (!rows.length) return `### ${title}\n\n_no rows_\n`;
  return [`### ${title}`, '',
    '| group | losers | later hit T1 (hold) | % | median stop % | median stop ×ATR | median MAE ÷ stop | noise stops |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.key} | ${r.n} | ${r.laterT1} | ${f(r.laterT1Pct, '%')} | ${f(r.medianStopPct, '%')} | ${f(r.medianStopAtr)} | ${f(r.medianMaeOverStop)} | ${r.noise} |`),
    ''].join('\n');
}

export function renderMarkdown(m: MarkdownInput): string {
  const h = m.headline;
  const skipped = Object.entries(m.population.skipped).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none';
  const out: string[] = [];
  out.push(`# Losers later — did NEXUS's losing trades end up green? (focus ${m.focus})`, '');
  out.push(`Generated ${m.generatedAt} by \`research/losers-later.ts\` · window: published since ${m.since} · bars through ${m.dataThrough} · READ-ONLY (one read-only transaction, rolled back).`, '');
  out.push('> Everything after a close is **hindsight about that idea**. It does not relabel the recorded outcome and it is not the win rate. Rule candidates below are replays on real bars, each **MEASURING** with its n — one week of data is a regime sample (Signal Lab walk-forward law), not proof.', '');
  out.push('## Population', '');
  out.push(`- ideas in window: **${m.population.ideas}** · closed in the book: **${m.population.closed}** · losers: **${m.population.losers}** · analysed on bars: **${m.population.analysed}**`);
  out.push(`- skipped: ${skipped}`, '');
  out.push('## Headline — losers after we closed them', '');
  out.push('| measure | count | % of analysed losers |', '|---|---:|---:|');
  out.push(`| later reached T1 inside the original holding window | ${h.laterT1InHold} | ${f(h.laterT1InHoldPct, '%')} |`);
  out.push(`| later reached T1 by Friday's close | ${h.laterT1ByWeek} | ${f(h.laterT1ByWeekPct, '%')} |`);
  out.push(`| traded back at entry (break-even) inside the window | ${h.reclaimedEntry} | ${f(h.reclaimedEntryPct, '%')} |`);
  out.push(`| green at the end of the holding window (of ${h.holdComplete} with a complete window) | ${h.greenAtHoldEnd} | ${f(h.greenAtHoldEndPct, '%')} |`);
  out.push(`| noise stops: later hit T1 and a stop < ${NOISE_STOP_MULTIPLE}× wider would have survived | ${h.noise} | ${f(h.noisePct, '%')} |`);
  out.push(`| options: contract later traded above the entry premium (of ${h.optionLosers} option losers with bars) | ${h.optionLaterAboveEntryPremium} | ${f(h.optionLaterAboveEntryPremiumPct, '%')} |`, '');
  out.push(`Typical stop: **${f(h.medianStopPct, '%')}** from entry = **${f(h.medianStopAtr)}× daily ATR(14)** (median). Adverse excursion the trade needed to survive (MAE ÷ stop distance, trigger → T1/hold end): losers that later hit T1 **${f(h.medianMaeOverStopLaterT1)}×**, the rest **${f(h.medianMaeOverStopOthers)}×**. A multiple just above 1 means the stop sat inside normal noise.`, '');
  out.push('## Where it happens', '');
  for (const [t, rows] of [['By engine', m.byEngine], ['By how it closed', m.byCloseKind], ['By holding period', m.byHolding], ['By trigger time of day (ET)', m.byTod],
    ['By SPY day direction vs trade', m.bySpy], ['By opening gap vs trade', m.byGap], ['By stop width (× daily ATR)', m.byStopAtr]] as [string, GroupRow[]][]) out.push(groupTable(t, rows));
  out.push('## Rule candidates (replayed on every triggered closed idea, winners included)', '');
  out.push('Underlying % from the plan entry, $1,000 notional per idea (per leg for re-entry). Same bars, same triggers, same T1; only the exit differs. "ex-top-3" removes each rule\'s three best trades.', '');
  out.push('| rule | status | n | win rate | Δ win rate vs plan | avg % | $ @1k | Δ $ vs plan | Σ% ex-top-3 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of m.rules) {
    out.push(`| ${r.label} | ${r.measuring} | ${r.stats.n} | ${f(r.stats.winRate, '%')} | ${f(r.deltaWinRate, ' pp')} | ${f(r.stats.avgPct, '%')} | ${money(r.stats.pnl1000)} | ${money(r.deltaPnl1000)} | ${f(r.stats.sumPctExTop3, '%')} |`);
  }
  out.push('');
  for (const r of m.rules.filter((x) => x.extra)) out.push(`- ${r.rule}: ${r.extra}`);
  out.push('', '_Δ columns compare each rule with the published plan on the SAME ideas (the ones the rule could replay). No rule here is adopted; each stays MEASURING until it holds in a walk-forward split with its top trades removed._', '');
  const mo = m.monday;
  out.push(`## Monday ${m.focus} — every idea published`, '');
  out.push(`Published **${mo.published}** · triggered **${mo.triggered}** · closed **${mo.closed}** (wins **${mo.wins}**, losses **${mo.losses}**, flat ${mo.flat}) · still open ${mo.open} · never triggered ${mo.untriggered} · book P&L on closed **${money(mo.bookPnl)}**.`, '');
  out.push(`Missed winners: closed (not at target) then hit T1 inside the window **${mo.missed.closedThenT1}** · never filled but ran to T1 without touching entry **${mo.missed.ranWithoutFill}** · never filled but a market fill at publish would have hit T1 before the stop **${mo.missed.wouldHaveWonAtMarket}**.`, '');
  out.push('| engine | published | closed | wins | losses | open | untriggered | book P&L |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const e of mo.byEngine) out.push(`| ${e.engine} | ${e.published} | ${e.closed} | ${e.wins} | ${e.losses} | ${e.open} | ${e.untriggered} | ${money(e.pnl)} |`);
  out.push('', '| published (ET) | symbol | engine | dir | vehicle | triggered | outcome | book P&L | missed winner |', '|---|---|---|---|---|---|---|---:|---|');
  for (const r of mo.ideas) {
    out.push(`| ${r.publishedEt} | ${r.symbol} | ${r.engine} | ${r.direction} | ${r.vehicle} | ${r.triggered == null ? '?' : r.triggered ? 'yes' : 'no'} | ${r.outcome}${r.bookExcluded ? ` (not in book: ${r.bookExcluded})` : ''} | ${money(r.pnl)} | ${r.missedWinner ?? ''} |`);
  }
  out.push('');
  return out.join('\n');
}

// ─── walk-forward: does a stop rule hold in BOTH halves with its top trades removed? ──

/** Stop-width candidates → the multiple shared/wide-stops.ts would use. 'time_only' is reported, never chosen. */
export const WF_CANDIDATES: { rule: RuleId; mult: number | null; adoptable: boolean }[] = [
  { rule: 'wide1', mult: 1.0, adoptable: true },
  { rule: 'wide1_5', mult: 1.5, adoptable: true },
  { rule: 'wide2', mult: 2.0, adoptable: true },
  { rule: 'atr1', mult: 1.0, adoptable: false },
  { rule: 'atr1_5', mult: 1.5, adoptable: false },
  { rule: 'atr2', mult: 2.0, adoptable: false },
  { rule: 'time_only', mult: null, adoptable: false },
];
export const WF_FALLBACK_MULT = 1.5;

export interface WfIdea { id: string; triggerMs: number; pcts: Partial<Record<RuleId, number | null>> }
export interface WfCell {
  n: number;
  winRate: number | null; planWinRate: number | null; deltaWinRate: number | null;
  /** Σ(rule − plan) % over the half */
  deltaSumPct: number | null;
  /** Σ(rule − plan) % after removing the k ideas where the rule helped MOST — an edge that lives in a few trades fails here */
  deltaSumExTop: number | null;
  /** Σ% of the rule and of the plan, each with its own k best results removed */
  sumExTop: number | null; planSumExTop: number | null;
  holds: boolean;
}
export interface WfRow { rule: RuleId; mult: number | null; adoptable: boolean; label: string; halves: [WfCell, WfCell]; holdsBoth: boolean; score: number | null }
export interface WalkForward {
  n: number; minPerHalf: number; topRemoved: number;
  halves: [{ from: number | null; to: number | null; n: number }, { from: number | null; to: number | null; n: number }];
  rows: WfRow[];
  chosen: { rule: RuleId | null; mult: number; basis: string };
}

function wfCell(ideas: WfIdea[], rule: RuleId, k: number, minN: number): WfCell {
  const pairs = ideas.map((i) => ({ r: i.pcts[rule], p: i.pcts.plan })).filter((x): x is { r: number; p: number } => fin(x.r) && fin(x.p));
  const n = pairs.length;
  if (!n) return { n, winRate: null, planWinRate: null, deltaWinRate: null, deltaSumPct: null, deltaSumExTop: null, sumExTop: null, planSumExTop: null, holds: false };
  const wr = (xs: number[]) => r1((xs.filter((x) => x > 0).length / xs.length) * 100);
  const exTop = (xs: number[]) => r2([...xs].sort((a, b) => b - a).slice(k).reduce((s, x) => s + x, 0));
  const d = pairs.map((x) => x.r - x.p);
  const winRate = wr(pairs.map((x) => x.r)), planWinRate = wr(pairs.map((x) => x.p));
  const deltaSumExTop = exTop(d);
  const deltaWinRate = r1(winRate - planWinRate);
  return {
    n, winRate, planWinRate, deltaWinRate,
    deltaSumPct: r2(d.reduce((s, x) => s + x, 0)), deltaSumExTop,
    sumExTop: exTop(pairs.map((x) => x.r)), planSumExTop: exTop(pairs.map((x) => x.p)),
    holds: n >= minN && deltaSumExTop > 0 && deltaWinRate > 0,
  };
}

/**
 * Chronological split into two equal halves (by trigger time). A candidate HOLDS when, in
 * each half separately, it beats the plan on the same ideas on win rate AND on Σ% with the
 * k ideas it helped most removed, with ≥ minPerHalf paired ideas. Among adoptable holders the
 * one with the best worst-half (Σ ex-top ÷ n) is chosen; none holding → WF_FALLBACK_MULT.
 */
export function walkForward(ideas: WfIdea[], opts: { topRemoved?: number; minPerHalf?: number } = {}): WalkForward {
  const k = opts.topRemoved ?? 3, minN = opts.minPerHalf ?? 30;
  const sorted = ideas.filter((i) => fin(i.triggerMs) && fin(i.pcts.plan)).sort((a, b) => a.triggerMs - b.triggerMs);
  const mid = Math.floor(sorted.length / 2);
  const H = [sorted.slice(0, mid), sorted.slice(mid)] as const;
  const span = (xs: WfIdea[]) => ({ from: xs[0]?.triggerMs ?? null, to: xs[xs.length - 1]?.triggerMs ?? null, n: xs.length });
  const rows: WfRow[] = WF_CANDIDATES.map((c) => {
    const halves = [wfCell(H[0], c.rule, k, minN), wfCell(H[1], c.rule, k, minN)] as [WfCell, WfCell];
    const holdsBoth = halves[0].holds && halves[1].holds;
    const per = halves.map((h) => (h.n && h.deltaSumExTop != null ? h.deltaSumExTop / h.n : null));
    const score = per[0] != null && per[1] != null ? r2(Math.min(per[0], per[1])) : null;
    return { rule: c.rule, mult: c.mult, adoptable: c.adoptable, label: RULE_LABEL[c.rule], halves, holdsBoth, score };
  });
  const holders = rows.filter((r) => r.adoptable && r.holdsBoth && r.score != null).sort((a, b) => b.score! - a.score! || (a.mult! - b.mult!));
  const best = holders[0];
  const chosen = best
    ? { rule: best.rule, mult: best.mult!, basis: `${best.rule} holds in both halves with the top ${k} removed (worst-half Δ Σ ex-top ${best.score}%/idea vs plan)` }
    : {
      rule: null, mult: WF_FALLBACK_MULT, basis: sorted.length < 2 * minN
        ? `not enough paired ideas (${sorted.length} < ${2 * minN}) — fallback ${WF_FALLBACK_MULT}×`
        : `no stop-width candidate held in both halves — fallback ${WF_FALLBACK_MULT}×`,
    };
  return { n: sorted.length, minPerHalf: minN, topRemoved: k, halves: [span(H[0]), span(H[1])], rows, chosen };
}

export function renderWalkForward(w: WalkForward, meta: { generatedAt: string; source: string }): string {
  const d = (ms: number | null) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));
  const out: string[] = [];
  out.push('# Stop width — walk-forward check', '');
  out.push(`Generated ${meta.generatedAt} from \`${meta.source}\` by \`research/stop-width-walkforward.ts\` (read-only; no database access).`, '');
  out.push(`Paired ideas: **${w.n}** · half A ${d(w.halves[0].from)} → ${d(w.halves[0].to)} (n=${w.halves[0].n}) · half B ${d(w.halves[1].from)} → ${d(w.halves[1].to)} (n=${w.halves[1].n}) · top ${w.topRemoved} improvements removed per half · min ${w.minPerHalf} per half.`, '');
  out.push('A candidate **holds** when, in EACH half, it beats the published plan on the same ideas on win rate AND on Σ(rule − plan)% after removing the ideas it helped most.', '');
  out.push('| rule | ×ATR | A: n | A: win vs plan | A: Δ Σ% ex-top | B: n | B: win vs plan | B: Δ Σ% ex-top | holds both | worst-half %/idea |', '|---|---:|---:|---|---:|---:|---|---:|---|---:|');
  for (const r of w.rows) {
    const c = (h: WfCell) => `${h.n} | ${f(h.winRate, '%')} vs ${f(h.planWinRate, '%')} (${f(h.deltaWinRate, ' pp')}) | ${f(h.deltaSumExTop, '%')}`;
    const tag = r.adoptable ? '' : r.rule === 'time_only' ? ' — NOT adoptable without a disaster stop (3×ATR here)' : ' — comparison only (ignores the structural level)';
    out.push(`| ${r.label}${tag} | ${f(r.mult)} | ${c(r.halves[0])} | ${c(r.halves[1])} | ${r.holdsBoth ? 'YES' : 'no'} | ${f(r.score)} |`);
  }
  out.push('', `**Chosen: ${w.chosen.mult}× daily ATR(14)** (stop = wider of the structural level and ${w.chosen.mult}×ATR) — ${w.chosen.basis}.`, '');
  out.push(`Set \`BOT_STOP_ATR_MULT=${w.chosen.mult}\` for the bot. NEXUS keeps the current 1.25× floor until \`NEXUS_STOP_ATR_MULT\` is set after the bot proves it.`, '');
  return out.join('\n');
}

// ─── walk-forward in R (equal-risk sizing) ─────────────────────────────────
//
// The % table above compares UNSIZED moves: a wider stop loses more % per loser,
// but the bot sizes every trade to the same $ risk, so a wider stop means a smaller
// position. Here each variant's result is divided by ITS OWN stop distance:
// 1R = what that variant risks per trade, so ΣR is $ P&L at equal risk.

/** Stop distance (% of entry) a variant sizes against. null = not R-comparable. */
export function riskPctFor(rule: RuleId, planRiskPct: number, atrPct: number | null): number | null {
  if (!(planRiskPct > 0)) return null;
  const a = atrPct != null && atrPct > 0 ? atrPct : null;
  switch (rule) {
    case 'plan': return planRiskPct;
    case 'atr1': return a && a * 1;
    case 'atr1_5': return a && a * 1.5;
    case 'atr2': return a && a * 2;
    case 'wide1': return a && Math.max(planRiskPct, a * 1);
    case 'wide1_5': return a && Math.max(planRiskPct, a * 1.5);
    case 'wide2': return a && Math.max(planRiskPct, a * 2);
    // hybrids can end on the wide stop → sized to it
    case 'hyb_n3': case 'hyb_n6': case 'hyb_trail6': return a && Math.max(planRiskPct, a * HYBRID_K);
    // time-only: the 3×ATR disaster stop is the risk
    case 'time_only': return a && a * 3;
    default: return null; // close_stop / reentry: no single stop distance
  }
}

export const WFR_CANDIDATES: { rule: RuleId; mult: number | null; adoptable: boolean }[] = [
  { rule: 'wide1', mult: 1.0, adoptable: true },
  { rule: 'wide1_5', mult: 1.5, adoptable: true },
  { rule: 'wide2', mult: 2.0, adoptable: true },
  { rule: 'atr1', mult: 1.0, adoptable: false },
  { rule: 'atr1_5', mult: 1.5, adoptable: false },
  { rule: 'atr2', mult: 2.0, adoptable: false },
  { rule: 'hyb_n3', mult: HYBRID_K, adoptable: false },
  { rule: 'hyb_n6', mult: HYBRID_K, adoptable: false },
  { rule: 'hyb_trail6', mult: HYBRID_K, adoptable: false },
  { rule: 'time_only', mult: null, adoptable: false },
];

export interface WfRIdea { id: string; triggerMs: number; planRiskPct: number; atrPct: number | null; pcts: Partial<Record<RuleId, number | null>> }
export interface RStats {
  n: number; winRate: number | null;
  /** mean R per trade */
  expR: number | null;
  /** mean R with this variant's own k best trades removed */
  expRExTop: number | null;
  sumR: number | null; sumRExTop: number | null;
  /** Σ winning R ÷ |Σ losing R|; null with no losers */
  profitFactor: number | null;
  /** worst peak-to-trough of cumulative R, trades in trigger order (≥ 0) */
  maxDdR: number | null;
}

/** `rs` in chronological order. */
export function rStats(rs: number[], k: number): RStats {
  const n = rs.length;
  if (!n) return { n, winRate: null, expR: null, expRExTop: null, sumR: null, sumRExTop: null, profitFactor: null, maxDdR: null };
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const sum = rs.reduce((s, x) => s + x, 0);
  const ex = [...rs].sort((a, b) => b - a).slice(k);
  const exSum = ex.reduce((s, x) => s + x, 0);
  const pos = rs.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const neg = -rs.filter((x) => x < 0).reduce((s, x) => s + x, 0);
  let cum = 0, peak = 0, dd = 0;
  for (const x of rs) { cum += x; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return {
    n, winRate: r1((rs.filter((x) => x > 0).length / n) * 100),
    expR: r3(sum / n), expRExTop: ex.length ? r3(exSum / ex.length) : null,
    sumR: r2(sum), sumRExTop: r2(exSum),
    profitFactor: neg > 0 ? r2(pos / neg) : null, maxDdR: r2(dd),
  };
}

export interface WfRCell { variant: RStats; plan: RStats; deltaExpRExTop: number | null; holds: boolean }
export interface WfRRow { rule: RuleId; mult: number | null; adoptable: boolean; label: string; halves: [WfRCell, WfRCell]; holdsBoth: boolean; score: number | null; missing: boolean }
export interface WalkForwardR {
  n: number; minPerHalf: number; topRemoved: number;
  halves: [{ from: number | null; to: number | null; n: number }, { from: number | null; to: number | null; n: number }];
  rows: WfRRow[];
  chosen: { rule: RuleId | null; mult: number | null; basis: string };
}

function wfRCell(ideas: WfRIdea[], rule: RuleId, k: number, minN: number): WfRCell {
  const vr: number[] = [], pr: number[] = [];
  for (const i of ideas) {
    const v = i.pcts[rule], p = i.pcts.plan;
    const rv = riskPctFor(rule, i.planRiskPct, i.atrPct);
    if (!fin(v) || !fin(p) || !(rv && rv > 0)) continue;
    vr.push(v / rv); pr.push(p / i.planRiskPct);
  }
  const variant = rStats(vr, k), plan = rStats(pr, k);
  const d = variant.expRExTop != null && plan.expRExTop != null ? Math.round((variant.expRExTop - plan.expRExTop) * 1000) / 1000 : null;
  return { variant, plan, deltaExpRExTop: d, holds: variant.n >= minN && d != null && d > 0 };
}

/**
 * Same chronological halves as walkForward(). A variant HOLDS when, in each half, its
 * R-expectancy with its own top k trades removed beats the plan's (same ideas, plan's own
 * top k removed). Among adoptable holders the best worst-half Δ is chosen; none → no
 * multiple is chosen (chosen.mult null) and the caller keeps the fallback.
 */
export function walkForwardR(ideas: WfRIdea[], opts: { topRemoved?: number; minPerHalf?: number } = {}): WalkForwardR {
  const k = opts.topRemoved ?? 3, minN = opts.minPerHalf ?? 30;
  const sorted = ideas.filter((i) => fin(i.triggerMs) && fin(i.pcts.plan) && i.planRiskPct > 0).sort((a, b) => a.triggerMs - b.triggerMs);
  const mid = Math.floor(sorted.length / 2);
  const H = [sorted.slice(0, mid), sorted.slice(mid)] as const;
  const span = (xs: WfRIdea[]) => ({ from: xs[0]?.triggerMs ?? null, to: xs[xs.length - 1]?.triggerMs ?? null, n: xs.length });
  const rows: WfRRow[] = WFR_CANDIDATES.map((c) => {
    const halves = [wfRCell(H[0], c.rule, k, minN), wfRCell(H[1], c.rule, k, minN)] as [WfRCell, WfRCell];
    const ds = halves.map((h) => h.deltaExpRExTop);
    return {
      rule: c.rule, mult: c.mult, adoptable: c.adoptable, label: RULE_LABEL[c.rule], halves,
      holdsBoth: halves[0].holds && halves[1].holds,
      score: ds[0] != null && ds[1] != null ? Math.min(ds[0], ds[1]) : null,
      missing: !sorted.some((i) => fin(i.pcts[c.rule])),
    };
  });
  const holders = rows.filter((r) => r.adoptable && r.holdsBoth && r.score != null).sort((a, b) => b.score! - a.score! || (a.mult! - b.mult!));
  const best = holders[0];
  const chosen = best
    ? { rule: best.rule, mult: best.mult, basis: `${best.rule}: R-expectancy (top ${k} removed) beats the plan in both halves (worst-half Δ +${best.score}R/trade)` }
    : { rule: null, mult: null, basis: sorted.length < 2 * minN
      ? `not enough paired ideas (${sorted.length} < ${2 * minN})`
      : 'no adoptable stop width beats the plan on R-expectancy (top removed) in both halves' };
  return { n: sorted.length, minPerHalf: minN, topRemoved: k, halves: [span(H[0]), span(H[1])], rows, chosen };
}

export function renderWalkForwardR(w: WalkForwardR, fallbackMult: number): string {
  const d = (ms: number | null) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));
  const pf = (x: number | null) => (x == null ? '∞/—' : String(x));
  const out: string[] = [];
  out.push('## In R — equal-risk sizing (1R = each variant\'s own stop distance)', '');
  out.push(`Same halves: A ${d(w.halves[0].from)} → ${d(w.halves[0].to)} (n=${w.halves[0].n}) · B ${d(w.halves[1].from)} → ${d(w.halves[1].to)} (n=${w.halves[1].n}). Each variant is compared with the plan on the SAME ideas; "ex-top" removes each side's own ${w.topRemoved} best trades. A variant **holds** when its ex-top R-expectancy beats the plan's in BOTH halves (n ≥ ${w.minPerHalf}).`, '');
  out.push('| rule | half | n | win | E[R] | E[R] ex-top | plan E[R] ex-top | Δ ex-top | ΣR | PF | max DD (R) | plan PF | plan DD |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of w.rows) {
    if (r.missing) { out.push(`| ${r.label} | — | not in this input (re-run research/losers-later.ts) | | | | | | | | | | |`); continue; }
    r.halves.forEach((h, i) => {
      const v = h.variant, p = h.plan;
      out.push(`| ${i === 0 ? `${r.label}${r.adoptable ? '' : ' *(report only)*'}` : ''} | ${i === 0 ? 'A' : 'B'} | ${v.n} | ${f(v.winRate, '%')} | ${f(v.expR)} | ${f(v.expRExTop)} | ${f(p.expRExTop)} | ${f(h.deltaExpRExTop)} | ${f(v.sumR)} | ${pf(v.profitFactor)} | ${f(v.maxDdR)} | ${pf(p.profitFactor)} | ${f(p.maxDdR)} |`);
    });
    out.push(`| | **holds both** | ${r.holdsBoth ? 'YES' : 'no'} | | | | | | | | | | |`);
  }
  out.push('', w.chosen.mult != null
    ? `**R-chosen: ${w.chosen.mult}× ATR** — ${w.chosen.basis}. Set \`BOT_STOP_ATR_MULT=${w.chosen.mult}\`.`
    : `**R-chosen: none** — ${w.chosen.basis}. Keep the ${fallbackMult}× fallback only as a MEASURING default, or set \`BOT_WIDE_STOPS=false\` until a width holds.`, '');
  return out.join('\n');
}
