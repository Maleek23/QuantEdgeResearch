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

export type Dir = 'long' | 'short';
export interface Bar { t: number; o: number; h: number; l: number; c: number }

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

/** Signed % move from entry in the trade's favour. */
export function pctFrom(dir: Dir, entry: number, px: number): number {
  return ((dir === 'long' ? px - entry : entry - px) / entry) * 100;
}

const touches = (dir: Dir, lvl: number, b: Bar) => (dir === 'long' ? b.h >= lvl : b.l <= lvl);
const stopTouched = (dir: Dir, stop: number, b: Bar) => (dir === 'long' ? b.l <= stop : b.h >= stop);
const favPct = (dir: Dir, entry: number, b: Bar) => pctFrom(dir, entry, dir === 'long' ? b.h : b.l);
const advPct = (dir: Dir, entry: number, b: Bar) => pctFrom(dir, entry, dir === 'long' ? b.l : b.h);

/** First bar opening in [fromMs, toMs) whose range touches the stop. */
export function firstStopBar(bars: Bar[], dir: Dir, stop: number, fromMs: number, toMs: number): Bar | null {
  return bars.find((b) => b.t >= fromMs && b.t < toMs && stopTouched(dir, stop, b)) ?? null;
}

// ─── (a)/(b) after the close ───────────────────────────────────────────────

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

export type RuleId = 'plan' | 'atr1' | 'atr1_5' | 'atr2' | 'close_stop' | 'time_only' | 'reentry';
export const RULES: RuleId[] = ['plan', 'atr1', 'atr1_5', 'atr2', 'close_stop', 'time_only', 'reentry'];
export const RULE_LABEL: Record<RuleId, string> = {
  plan: 'Published plan: stop / T1 / horizon close (baseline)',
  atr1: 'Stop at 1.0× daily ATR(14) from entry (T1 unchanged)',
  atr1_5: 'Stop at 1.5× daily ATR(14) from entry (T1 unchanged)',
  atr2: 'Stop at 2.0× daily ATR(14) from entry (T1 unchanged)',
  close_stop: 'Plan stop on a 5-min CLOSE beyond it (fill at that close), 3×ATR hard stop',
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

/** Close-based stop: a bar that CLOSES beyond the stop exits at that close (before any target in it); 3×ATR touch = hard stop. */
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
  const needAtr = rule === 'atr1' || rule === 'atr1_5' || rule === 'atr2' || rule === 'time_only';
  if (needAtr && !(fin(t.atrD) && t.atrD > 0)) return { rule, reason: 'no_atr', pct: null, exitMs: null };
  switch (rule) {
    case 'plan': return plan(t, t.stop);
    case 'atr1': return { ...plan(t, atrStop(t, 1)), rule };
    case 'atr1_5': return { ...plan(t, atrStop(t, 1.5)), rule };
    case 'atr2': return { ...plan(t, atrStop(t, 2)), rule };
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
