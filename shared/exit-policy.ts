/**
 * EXIT POLICY — the exit rules measured by research/exit-rule-replay.ts, as one
 * pure, bar-driven state machine, plus the LIVE manage signal for the rule the
 * replay validated (EXIT_POLICY). No I/O; imports only pure shared/loss-rules.
 *
 * Same entries for every rule; only the exit differs. Bars are 1-minute
 * regular-session bars of the UNDERLYING from the entry bar to the end of the
 * idea's horizon; the indicator fields on each bar (5-min 20-EMA / 14-ATR of the
 * last completed 5-min bar, prior-session daily 20-EMA / 14-ATR) are attached by
 * the caller so the rules never look ahead.
 *
 * Conventions (conservative, identical across rules):
 *   - entry bar: only the stop is checked (no target fills inside the entry bar);
 *   - stop and target in the same bar: the stop is taken;
 *   - a bar that opens through a level fills at the open (gap), else at the level;
 *   - option legs triggered by an UNDERLYING level fill at the contract's last
 *     trade at or before that minute; legs triggered by a PREMIUM level (rule 6)
 *     fill at that premium.
 */

import { horizonTradingDays, planTimeStop, progressR } from './loss-rules';

export type ExitRuleId =
  | 'plan'            // 1. first of stop / T1, else horizon end
  | 'hold'            // 2. stop only, else horizon end
  | 't1_ema'          // 3. ½ at T1 → stop to entry → rest trails the 20-EMA (5-min day / daily swing)
  | 't1_chandelier'   // 4. ½ at T1 → stop to entry → rest trails a 2×ATR chandelier
  | 'ladder_thirds'   // 5. ⅓ at 1R / 2R / 3R, stop to entry after the first
  | 'opt_premium'     // 6. options: ½ at +100% premium, rest at +200% or 20-EMA trail; day trades out 15:30 if < +50%
  | 'time_half';      // 7. plan + time stop at 50% of the horizon unless ≥ +0.5R

export const EXIT_RULES: ExitRuleId[] = ['plan', 'hold', 't1_ema', 't1_chandelier', 'ladder_thirds', 'opt_premium', 'time_half'];

export const EXIT_RULE_LABEL: Record<ExitRuleId, string> = {
  plan: '1 · Published plan (stop / T1)',
  hold: '2 · Hold to horizon (stop only)',
  t1_ema: '3 · ½ at T1, BE, trail 20-EMA',
  t1_chandelier: '4 · ½ at T1, BE, 2×ATR chandelier',
  ladder_thirds: '5 · ⅓ at 1R/2R/3R, BE after 1R',
  opt_premium: '6 · Options: ½ at +100%, rest +200% / EMA; day out 15:30 if < +50%',
  time_half: '7 · Plan + time stop at ½ horizon unless ≥ +0.5R',
};

export interface SimBar {
  t: number; o: number; h: number; l: number; c: number;
  /** Index of the session this bar belongs to (0 = entry session). */
  sess: number;
  /** Last 1-min bar of its 5-min bucket → a 5-min bar just closed. */
  end5: boolean;
  /** Last 1-min bar of its session. */
  endSess: boolean;
  /** 20-EMA / 14-ATR of the last COMPLETED 5-min bar (includes this bucket when end5). */
  ema5: number | null;
  atr5: number | null;
  /** Prior-session daily 20-EMA / 14-ATR (no look-ahead intraday). */
  emaD: number | null;
  atrD: number | null;
}

export interface SimOption {
  /** Entry premium actually paid. */
  eP: number;
  /** Last contract trade at or before bar i (carry-forward), else the next print's open; null if none. */
  px: (i: number) => number | null;
  /** High of the contract's bar in the same minute as bar i, if one printed. */
  hi: (i: number) => number | null;
}

export interface SimInput {
  dir: 1 | -1;
  bars: SimBar[];
  entry: number;
  stop: number;
  target: number;
  /** Trail timeframe: 'm5' for day / 0DTE holds, 'd1' for swings. */
  tf: 'm5' | 'd1';
  opt?: SimOption;
  /** Bar index of 15:30 ET in the entry session (day option trades only). */
  dayTimeStopIdx?: number | null;
}

export interface Fill { frac: number; i: number; u: number; opt: number | null; why: string }

const K20 = 2 / 21;

export function simulateExit(rule: ExitRuleId, s: SimInput): Fill[] {
  const { dir, bars, opt } = s;
  const N = bars.length;
  if (!N) return [];
  const entry = s.entry;
  const R = Math.abs(entry - s.stop);
  const fills: Fill[] = [];
  let rem = 1;
  let stop = s.stop;
  let stage = 0;                 // rule-specific progress (T1 done, rungs done, …)
  let best = dir > 0 ? bars[0].h : bars[0].l;   // chandelier extreme since entry
  const halfIdx = Math.floor(N / 2);

  const optAt = (i: number) => (opt ? opt.px(i) : null);
  const take = (frac: number, i: number, u: number, why: string, optPx?: number | null) => {
    const f = Math.min(frac, rem);
    if (f <= 1e-9) return;
    fills.push({ frac: f, i, u, opt: opt ? (optPx !== undefined ? optPx : optAt(i)) : null, why });
    rem -= f;
  };
  const crossedStop = (b: SimBar, lvl: number) => (dir > 0 ? b.l <= lvl : b.h >= lvl);
  const stopFill = (b: SimBar, lvl: number) => (dir > 0 ? Math.min(b.o, lvl) : Math.max(b.o, lvl));
  const reached = (b: SimBar, lvl: number) => (dir > 0 ? b.h >= lvl : b.l <= lvl);
  const levelFill = (b: SimBar, lvl: number) => (dir > 0 ? Math.max(b.o, lvl) : Math.min(b.o, lvl));
  const emaTrailBroken = (b: SimBar): boolean => {
    if (s.tf === 'm5') return b.end5 && b.ema5 != null && dir * (b.c - b.ema5) < 0;
    if (!b.endSess || b.emaD == null) return false;
    const emaToday = b.emaD + K20 * (b.c - b.emaD);
    return dir * (b.c - emaToday) < 0;
  };
  if (rule === 'opt_premium' && !opt) return [];

  for (let i = 0; i < N && rem > 1e-9; i++) {
    const b = bars[i];
    // Stop (current, possibly moved to break-even / trailed) — checked on every bar.
    if (i === 0) {
      if (crossedStop(b, stop)) { take(rem, i, stopFill(b, stop), 'stop'); break; }
      best = dir > 0 ? b.h : b.l;
      continue;
    }

    switch (rule) {
      case 'plan':
      case 'time_half': {
        if (crossedStop(b, stop)) { take(rem, i, stopFill(b, stop), 'stop'); break; }
        if (reached(b, s.target)) { take(rem, i, levelFill(b, s.target), 'T1'); break; }
        if (rule === 'time_half' && i === halfIdx && dir * (b.c - entry) < 0.5 * R) { take(rem, i, b.c, 'time½'); break; }
        break;
      }
      case 'hold': {
        if (crossedStop(b, stop)) { take(rem, i, stopFill(b, stop), 'stop'); break; }
        break;
      }
      case 't1_ema':
      case 't1_chandelier': {
        if (stage === 0) {
          if (crossedStop(b, stop)) { take(rem, i, stopFill(b, stop), 'stop'); break; }
          if (reached(b, s.target)) {
            take(0.5, i, levelFill(b, s.target), 'T1½');
            stop = entry; stage = 1;
            best = dir > 0 ? b.h : b.l;
          }
          break;
        }
        // stage 1: runner
        let lvl = stop;
        if (rule === 't1_chandelier') {
          const atr = s.tf === 'm5' ? b.atr5 : b.atrD;
          if (atr != null && atr > 0) {
            const tr = best - dir * 2 * atr;
            lvl = dir > 0 ? Math.max(stop, tr) : Math.min(stop, tr);
          }
        }
        if (crossedStop(b, lvl)) { take(rem, i, stopFill(b, lvl), lvl === stop ? 'BE' : 'chandelier'); break; }
        if (rule === 't1_ema' && emaTrailBroken(b)) { take(rem, i, b.c, 'ema'); break; }
        break;
      }
      case 'ladder_thirds': {
        if (crossedStop(b, stop)) { take(rem, i, stopFill(b, stop), stage ? 'BE' : 'stop'); break; }
        for (let k = stage; k < 3; k++) {
          const lvl = entry + dir * (k + 1) * R;
          if (!reached(b, lvl)) break;
          take(k === 2 ? rem : 1 / 3, i, levelFill(b, lvl), `${k + 1}R`);
          stage = k + 1;
          stop = entry;
        }
        break;
      }
      case 'opt_premium': {
        const o = opt!;
        if (crossedStop(b, stop)) { take(rem, i, stopFill(b, stop), 'stop'); break; }
        const hi = o.hi(i);
        if (stage === 0 && hi != null && hi >= 2 * o.eP) { take(0.5, i, b.c, '+100%½', 2 * o.eP); stage = 1; }
        if (stage === 1 && rem > 1e-9) {
          if (hi != null && hi >= 3 * o.eP) { take(rem, i, b.c, '+200%', 3 * o.eP); break; }
          if (emaTrailBroken(b)) { take(rem, i, b.c, 'ema'); break; }
        }
        if (s.dayTimeStopIdx != null && i === s.dayTimeStopIdx) {
          const p = o.px(i);
          if (p != null && p < 1.5 * o.eP) { take(rem, i, b.c, '15:30'); break; }
        }
        break;
      }
    }
    if (dir > 0) best = Math.max(best, b.h); else best = Math.min(best, b.l);
  }
  if (rem > 1e-9) { const i = N - 1; take(rem, i, bars[i].c, 'horizon'); }
  return fills;
}

/** $ P&L of a fill list. Stocks: `notional` × return; options: contracts × 100 × premium change. */
export function fillsPnl(fills: Fill[], s: { dir: 1 | -1; entry: number; eP?: number; notional?: number; contracts?: number }): number {
  let p = 0;
  for (const f of fills) {
    if (s.eP != null) {
      const x = f.opt;
      if (x == null) continue;
      p += f.frac * (s.contracts ?? 1) * 100 * (x - s.eP);
    } else {
      p += f.frac * (s.notional ?? 1000) * s.dir * (f.u - s.entry) / s.entry;
    }
  }
  return p;
}

// ── indicators (shared with the live manage signal) ─────────────────────────

export interface OHLC { o: number; h: number; l: number; c: number }

/** 20-EMA over closes, seeded with the first close. Returns one value per bar. */
export function emaSeries(closes: number[], n = 20): number[] {
  const k = 2 / (n + 1); const out: number[] = [];
  let e = NaN;
  for (const c of closes) { e = Number.isFinite(e) ? e + k * (c - e) : c; out.push(e); }
  return out;
}

/** Wilder ATR(n). Returns one value per bar (NaN until n bars). */
export function atrSeries(bars: OHLC[], n = 14): number[] {
  const out: number[] = []; let a = NaN; let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]; const pc = i ? bars[i - 1].c : b.c;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    if (i < n) { sum += tr; a = i === n - 1 ? sum / n : NaN; }
    else a = (a * (n - 1) + tr) / n;
    out.push(a);
  }
  return out;
}

// ── LIVE: the model exit plan behind EXIT_POLICY ─────────────────────────────
//
// docs/EXIT_RULE_REPLAY.md: of the seven rules, only rule 7 (published plan +
// a time stop at 50% of the horizon unless ≥ +0.5R) beat the published plan in
// BOTH walk-forward halves with its top-3 trades removed. It is the only rule
// the flag can select; anything else reads as the unchanged default ('plan').

export type ExitPolicyId = 'plan' | 'time_half';

export function readExitPolicy(env: Record<string, string | undefined> = {}): ExitPolicyId {
  const v = String(env.EXIT_POLICY ?? '').trim().toLowerCase();
  return v === 'time_half' || v === '7' ? 'time_half' : 'plan';
}

export interface ExitPolicyPlan {
  policy: ExitPolicyId;
  label: string;
  /** time_half: the instant the time stop is evaluated (ISO), its fraction / min R, the horizon used. */
  timeStopAt: string | null;
  fraction: number;
  minR: number;
  horizonDays: number;
}

/** Server side: the policy's fixed schedule for one idea (computed once per card). */
export function exitPolicyPlan(args: {
  policy: ExitPolicyId; publishedMs: number | null; holdingPeriod?: string | null; expiryDate?: string | null;
  fraction?: number; minR?: number;
}): ExitPolicyPlan {
  const fraction = args.fraction ?? 0.5, minR = args.minR ?? 0.5;
  const horizonDays = horizonTradingDays({ holdingPeriod: args.holdingPeriod, expiryDate: args.expiryDate, publishedMs: args.publishedMs });
  const timeStopAt = args.policy === 'time_half' && args.publishedMs && Number.isFinite(args.publishedMs)
    ? planTimeStop(args.publishedMs, horizonDays, fraction, minR).atIso : null;
  return { policy: args.policy, label: EXIT_RULE_LABEL[args.policy === 'time_half' ? 'time_half' : 'plan'], timeStopAt, fraction, minR, horizonDays };
}

export interface ManageSignal {
  state: 'stopped' | 'target' | 'time_exit' | 'kept' | 'running';
  /** One-line instruction, e.g. "T1 hit → exit" / "Time stop 12:45 ET Thu: exit unless ≥ +0.5R (now +0.21R)". */
  headline: string;
  detail: string;
  progressR: number | null;
  /** Price that clears the time stop (entry ± minR × risk). */
  keepAbove: number | null;
}

const fmtEtShort = (ms: number) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET';
const usd = (v: number) => `$${v >= 100 ? v.toFixed(2) : v.toFixed(v >= 1 ? 2 : 4)}`;

/** Client/live side: what to do NOW under the policy, from the live underlying price. */
export function manageSignal(plan: ExitPolicyPlan, s: {
  direction: 'long' | 'short'; entry: number; stop: number; target: number | null; live: number | null; nowMs: number;
}): ManageSignal | null {
  if (plan.policy === 'plan' || !(s.entry > 0) || !(s.stop > 0)) return null;
  const sgn = s.direction === 'long' ? 1 : -1;
  const risk = Math.abs(s.entry - s.stop);
  const keepAbove = risk > 0 ? s.entry + sgn * plan.minR * risk : null;
  const live = s.live != null && s.live > 0 ? s.live : null;
  const r = live != null ? progressR(s.direction, s.entry, s.stop, live) : null;
  const rTxt = r == null ? 'no live price' : `now ${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;
  const levels = `stop ${usd(s.stop)}${s.target ? ` · T1 ${usd(s.target)}` : ''}`;
  if (live != null && sgn * (live - s.stop) <= 0) return { state: 'stopped', headline: `Stop ${usd(s.stop)} traded → out`, detail: levels, progressR: r, keepAbove };
  if (live != null && s.target && sgn * (live - s.target) >= 0) return { state: 'target', headline: `T1 ${usd(s.target)} hit → take the plan exit`, detail: levels, progressR: r, keepAbove };
  const at = plan.timeStopAt ? Date.parse(plan.timeStopAt) : NaN;
  if (!Number.isFinite(at)) return { state: 'running', headline: `Plan: ${levels}`, detail: 'time stop not scheduled (no publish time)', progressR: r, keepAbove };
  const need = keepAbove != null ? `≥ +${plan.minR}R (${s.direction === 'long' ? '≥' : '≤'} ${usd(keepAbove)})` : `≥ +${plan.minR}R`;
  if (s.nowMs < at) {
    return { state: 'running', headline: `Time stop ${fmtEtShort(at)}: exit unless ${need}`, detail: `${rTxt} · ${levels} · ${Math.round(plan.fraction * 100)}% of a ${plan.horizonDays}-session horizon`, progressR: r, keepAbove };
  }
  if (r != null && r >= plan.minR) return { state: 'kept', headline: `Time stop passed at +${r.toFixed(2)}R → hold for the plan`, detail: levels, progressR: r, keepAbove };
  return { state: 'time_exit', headline: `Time stop reached (${rTxt}) → exit at market`, detail: `needed ${need} by ${fmtEtShort(at)} · ${levels}`, progressR: r, keepAbove };
}

/**
 * Capture ratio of a closed trade on the UNDERLYING: realized move ÷ the most
 * favourable move seen while open. Null when there was no favourable move or the
 * inputs are missing; can be negative (closed worse than entry) and is ≤ 1.
 */
export function captureRatio(a: { direction: 'long' | 'short'; entry: number | null; exit: number | null; high: number | null; low: number | null }): number | null {
  const { entry, exit } = a;
  if (!(entry && entry > 0) || !(exit && exit > 0)) return null;
  const peak = a.direction === 'long' ? a.high : a.low;
  if (!(peak && peak > 0)) return null;
  const sgn = a.direction === 'long' ? 1 : -1;
  const best = sgn * (peak - entry);
  if (!(best > 0)) return null;
  return Math.min(1, (sgn * (exit - entry)) / best);
}
