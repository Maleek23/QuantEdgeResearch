/**
 * MANAGED EXIT POLICY — one defined, executable exit rule for NEXUS ideas,
 * replayed on real bars (research/managed-exit-replay.ts) and, behind
 * MANAGED_EXITS (default OFF), shown live as a manage instruction.
 *
 * Operator ask (2026-10-07): "stocks don't have to reach T1 for it to be a
 * win". The guardrail: a trade is a realized WIN only when it CLOSED with
 * positive P&L under an exit rule a trader could have executed — never because
 * the price once went its way (that is the peak / MFE, reported beside it, and
 * the call — shared/call-accuracy.ts — is a separate, labelled measure).
 *
 * Policy "managed":
 *   1. initial stop = the plan's stop (options: ALSO the premium stop — the
 *      plan's own, else −40% for 0DTE / −50% swing; whichever trips first);
 *   2. breakeven: once +1R on the underlying (options: +50% premium), the stop
 *      moves to entry (options: the premium stop moves to the entry premium);
 *   3. take HALF at T1;
 *   4. trail the remainder after T1 — stocks: 1 × ATR from the best price since
 *      entry (never looser than the current stop); options: give back at most
 *      25% of the peak premium (never below the current premium stop);
 *   5. time exit: whatever is left at the end of the plan window (0DTE: 15:45 ET).
 *
 * Bar conventions (conservative, identical for every idea):
 *   - bar 0 is the trigger bar: only stops are checked there;
 *   - a stop and a target in the same bar → the stop is taken;
 *   - a bar that opens through a level fills at the open (gap), else at the level;
 *   - the trailing level uses the peak and ATR as of the PREVIOUS bar (no look-ahead);
 *   - option fills on an UNDERLYING event (stop, T1) take the contract's close in
 *     that bar (carried forward from the last print when the contract did not
 *     trade); PREMIUM levels fill at the level (or the bar's open on a gap).
 *
 * Pure: no I/O.
 */

export const MANAGED_POLICY_ID = 'managed-v1';
export const MANAGED_POLICY_LABEL = 'Managed: BE after +1R (opt +50%), ½ at T1, trail 1×ATR (opt ≤25% give-back), time exit (0DTE 15:45)';
export const MANAGED_RULES = {
  beAfterR: 1,
  optBeAfterPct: 0.5,
  t1Fraction: 0.5,
  stockTrailAtr: 1,
  optGiveBack: 0.25,
  zeroDteExitEtMin: 15 * 60 + 45,
} as const;

export interface PremiumOHLC { o: number; h: number; l: number; c: number }

export interface ManagedBar {
  t: number; o: number; h: number; l: number; c: number;
  /** ATR of the underlying as of this bar's close (5-min for day holds, prior-day daily for swings). */
  atr: number | null;
  /** The contract's bar in the same interval, when it printed (options). */
  opt?: PremiumOHLC | null;
}

export interface ManagedInput {
  kind: 'stock' | 'option';
  /** Called direction on the UNDERLYING. */
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number | null;
  /** From the trigger bar (index 0) to the last bar of the plan window (or the last bar available). */
  bars: ManagedBar[];
  /** True when `bars` reach the end of the plan window (else what is left stays open). */
  windowComplete: boolean;
  /** Options: the premium actually paid at the trigger, and the premium stop. */
  entryPremium?: number | null;
  premiumStop?: number | null;
}

export interface ManagedFill { frac: number; t: number; px: number; why: string; stale?: boolean }

export interface Peak { px: number; at: number; r: number | null; pct: number | null }

export interface ManagedResult {
  fills: ManagedFill[];
  /** Fully exited under the policy. */
  closed: boolean;
  /** Reason of the last fill (stop / BE / trail / time / T1½+…), or 'open'. */
  exitReason: string;
  exitAt: number | null;
  /** Size-weighted exit price (underlying for stocks, premium for options) of the filled part. */
  avgExit: number | null;
  /** Realized move per unit of the filled part: stocks $/share, options $/contract (×100). Open part excluded. */
  pnlPerUnit: number | null;
  /** In R of the initial risk (stocks: |entry − stop|; options: entryPremium − premiumStop). */
  rMultiple: number | null;
  /** Best favourable underlying price inside the window (MFE) and when. */
  peakUnderlying: Peak | null;
  /** Options: best premium inside the window and when. */
  peakPremium: Peak | null;
  /** Remaining fraction still open (0 when closed). */
  remaining: number;
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function simulateManaged(s: ManagedInput): ManagedResult {
  const dir = s.direction === 'long' ? 1 : -1;
  const bars = s.bars;
  const R = Math.abs(s.entry - s.stop);
  const isOpt = s.kind === 'option';
  const eP = isOpt ? Number(s.entryPremium) : NaN;
  const optRisk = isOpt && fin(s.premiumStop) ? eP - (s.premiumStop as number) : NaN;
  const empty: ManagedResult = { fills: [], closed: false, exitReason: 'no bars', exitAt: null, avgExit: null, pnlPerUnit: null, rMultiple: null, peakUnderlying: null, peakPremium: null, remaining: 1 };
  if (!bars.length || !(R > 0) || (isOpt && !(eP > 0 && optRisk > 0))) return empty;

  const fills: ManagedFill[] = [];
  let rem = 1;
  let stop = s.stop;                       // underlying stop (moves to BE for stocks)
  let pStop = isOpt ? (s.premiumStop as number) : NaN;
  let beArmed = false, t1Done = false;
  const t1Valid = fin(s.target) && dir * ((s.target as number) - s.entry) > 0;
  let peakU = s.entry;
  let peakP = isOpt ? eP : NaN;
  let lastPrem: number | null = isOpt ? eP : null;
  let prevAtr: number | null = null;

  const take = (frac: number, t: number, px: number, why: string, stale = false) => {
    const f = Math.min(frac, rem);
    if (f <= 1e-9) return;
    fills.push({ frac: f, t, px, why, ...(stale ? { stale } : {}) });
    rem -= f;
  };
  const crossed = (b: ManagedBar, lvl: number) => (dir > 0 ? b.l <= lvl : b.h >= lvl);
  const stopFill = (b: ManagedBar, lvl: number) => (dir > 0 ? Math.min(b.o, lvl) : Math.max(b.o, lvl));
  const reached = (b: ManagedBar, lvl: number) => (dir > 0 ? b.h >= lvl : b.l <= lvl);
  const levelFill = (b: ManagedBar, lvl: number) => (dir > 0 ? Math.max(b.o, lvl) : Math.min(b.o, lvl));
  const premAt = (b: ManagedBar): { px: number; stale: boolean } => b.opt ? { px: b.opt.c, stale: false } : { px: lastPrem ?? eP, stale: true };

  for (let i = 0; i < bars.length && rem > 1e-9; i++) {
    const b = bars[i];
    const first = i === 0;
    // ── stops (checked first, every bar) ──
    let uStop = stop;
    if (!isOpt && t1Done && prevAtr != null && prevAtr > 0) {
      const trail = peakU - dir * MANAGED_RULES.stockTrailAtr * prevAtr;
      uStop = dir > 0 ? Math.max(stop, trail) : Math.min(stop, trail);
    }
    let curPStop = pStop;
    if (isOpt && t1Done) curPStop = Math.max(pStop, (1 - MANAGED_RULES.optGiveBack) * peakP);
    if (crossed(b, uStop)) {
      const why = !isOpt && uStop !== stop ? 'trail' : stop === s.stop ? 'stop' : 'BE';
      if (isOpt) { const p = premAt(b); take(rem, b.t, p.px, `underlying ${why}`, p.stale); }
      else take(rem, b.t, stopFill(b, uStop), why);
      break;
    }
    if (isOpt && b.opt && b.opt.l <= curPStop) {
      const why = t1Done && curPStop > pStop ? 'premium trail' : pStop >= eP - 1e-9 ? 'premium BE' : 'premium stop';
      take(rem, b.t, Math.min(b.opt.o, curPStop), why);
      break;
    }
    if (!first) {
      // ── T1: half off, trailing starts ──
      if (!t1Done && t1Valid && reached(b, s.target as number)) {
        if (isOpt) { const p = premAt(b); take(MANAGED_RULES.t1Fraction, b.t, p.px, 'T1½', p.stale); }
        else take(MANAGED_RULES.t1Fraction, b.t, levelFill(b, s.target as number), 'T1½');
        t1Done = true;
      }
      // ── breakeven ──
      if (!beArmed) {
        if (!isOpt && reached(b, s.entry + dir * MANAGED_RULES.beAfterR * R)) {
          beArmed = true;
          stop = dir > 0 ? Math.max(stop, s.entry) : Math.min(stop, s.entry);
        } else if (isOpt && b.opt && b.opt.h >= eP * (1 + MANAGED_RULES.optBeAfterPct)) {
          beArmed = true;
          pStop = Math.max(pStop, eP);
        }
      }
    }
    // ── peaks (after the checks: the trail uses them from the next bar) ──
    const ext = dir > 0 ? b.h : b.l;
    if (dir * (ext - peakU) > 0) peakU = ext;
    if (isOpt && b.opt) {
      if (b.opt.h > peakP) peakP = b.opt.h;
      lastPrem = b.opt.c;
    }
    if (fin(b.atr)) prevAtr = b.atr;
  }
  if (rem > 1e-9 && s.windowComplete) {
    const b = bars[bars.length - 1];
    if (isOpt) { const p = premAt(b); take(rem, b.t, p.px, 'time', p.stale); }
    else take(rem, b.t, b.c, 'time');
  }
  // Peak over the WHOLE window (not only until the exit) — MFE of the idea.
  let pkU = s.entry, pkUAt = bars[0].t, pkP = isOpt ? eP : NaN, pkPAt = bars[0].t;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const ext = i === 0 ? b.c : dir > 0 ? b.h : b.l; // trigger bar: only its close is surely after the trigger
    if (dir * (ext - pkU) > 0) { pkU = ext; pkUAt = b.t; }
    if (isOpt && b.opt && i > 0 && b.opt.h > pkP) { pkP = b.opt.h; pkPAt = b.t; }
  }

  const filled = fills.reduce((a, f) => a + f.frac, 0);
  const avgExit = filled > 0 ? fills.reduce((a, f) => a + f.frac * f.px, 0) / filled : null;
  const perUnitMove = avgExit == null ? null : isOpt ? (avgExit - eP) * 100 * filled : dir * (avgExit - s.entry) * filled;
  const risk = isOpt ? optRisk * 100 : R;
  const last = fills[fills.length - 1];
  return {
    fills,
    closed: rem <= 1e-9,
    exitReason: rem <= 1e-9 ? fills.map((f) => f.why).join(' → ') : fills.length ? `${fills.map((f) => f.why).join(' → ')} · rest open` : 'open',
    exitAt: last ? last.t : null,
    avgExit,
    pnlPerUnit: perUnitMove,
    rMultiple: perUnitMove == null ? null : perUnitMove / risk,
    peakUnderlying: { px: pkU, at: pkUAt, r: dir * (pkU - s.entry) / R, pct: (dir * (pkU - s.entry) / s.entry) * 100 },
    peakPremium: isOpt ? { px: pkP, at: pkPAt, r: (pkP - eP) / optRisk, pct: ((pkP - eP) / eP) * 100 } : null,
    remaining: Math.max(0, rem),
  };
}

// ─── book statistics (recorded vs managed, walk-forward) ─────────────────────

export interface BookStats {
  n: number;
  wins: number;
  /** Realized: closed with P&L > 0. */
  winRate: number | null;
  /** Mean R per trade. */
  expectancyR: number | null;
  profitFactor: number | null;
  totalPnl: number;
  /** Largest peak-to-trough fall of cumulative P&L (positive number). */
  maxDrawdown: number;
}

/** Stats over closed trades in time order. `r` may be null (then only $ stats use it). */
export function bookStats(trades: readonly { pnl: number; r: number | null }[]): BookStats {
  let wins = 0, gp = 0, gl = 0, cum = 0, peak = 0, dd = 0, rSum = 0, rN = 0;
  for (const t of trades) {
    if (t.pnl > 0) { wins++; gp += t.pnl; } else gl += -t.pnl;
    cum += t.pnl; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum);
    if (t.r != null && Number.isFinite(t.r)) { rSum += t.r; rN++; }
  }
  const n = trades.length;
  return {
    n, wins, winRate: n ? wins / n : null, expectancyR: rN ? rSum / rN : null,
    profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : null,
    totalPnl: Math.round(cum * 100) / 100, maxDrawdown: Math.round(dd * 100) / 100,
  };
}

/** Remove the k largest winners (robustness: an edge that is only three trades is not an edge). */
export function withoutTopWinners<T extends { pnl: number }>(trades: readonly T[], k = 3): T[] {
  const top = new Set([...trades].filter((t) => t.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, k));
  return trades.filter((t) => !top.has(t));
}

// ─── LIVE (behind MANAGED_EXITS, default off) ────────────────────────────────

/** MANAGED_EXITS=1|true|on|managed enables the managed exit instruction on NEXUS idea cards. Default OFF. */
export function readManagedExits(env: Record<string, string | undefined> = {}): boolean {
  const v = String(env.MANAGED_EXITS ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'managed';
}

export interface ManagedLivePlan { policy: typeof MANAGED_POLICY_ID; label: string; atr: number | null; zeroDte: boolean }

export interface ManagedLiveSignal {
  state: 'stopped' | 'initial' | 'breakeven' | 'trailing';
  headline: string;
  detail: string;
  /** The stop the policy holds now (underlying). */
  stopNow: number;
}

/**
 * What the managed policy says NOW, from the live underlying and the best price
 * seen since the trigger (the tracker's highest/lowest price reached). Stocks /
 * underlying levels only — the option premium trail needs the contract's own
 * peak, which the card does not carry, so it is described, not computed.
 */
export function managedLiveSignal(plan: ManagedLivePlan, s: {
  direction: 'long' | 'short'; entry: number; stop: number; target: number | null; live: number | null; peak: number | null;
}): ManagedLiveSignal | null {
  if (!(s.entry > 0) || !(s.stop > 0)) return null;
  const dir = s.direction === 'long' ? 1 : -1;
  const R = Math.abs(s.entry - s.stop);
  if (!(R > 0)) return null;
  const usd = (v: number) => `$${v.toFixed(2)}`;
  const peak = s.peak != null && dir * (s.peak - s.entry) > 0 ? s.peak : s.entry;
  const t1Hit = s.target != null && dir * (peak - s.target) >= 0;
  const beHit = dir * (peak - s.entry) >= MANAGED_RULES.beAfterR * R;
  let stopNow = s.stop;
  if (beHit) stopNow = dir > 0 ? Math.max(stopNow, s.entry) : Math.min(stopNow, s.entry);
  if (t1Hit && plan.atr && plan.atr > 0) {
    const tr = peak - dir * MANAGED_RULES.stockTrailAtr * plan.atr;
    stopNow = dir > 0 ? Math.max(stopNow, tr) : Math.min(stopNow, tr);
  }
  const timeTxt = plan.zeroDte ? 'flat by 15:45 ET' : 'flat at the plan window end';
  if (s.live != null && dir * (s.live - stopNow) <= 0) return { state: 'stopped', headline: `Managed stop ${usd(stopNow)} traded → out`, detail: timeTxt, stopNow };
  if (t1Hit) return { state: 'trailing', headline: `T1 hit → ½ off; trail the rest at ${usd(stopNow)}`, detail: `${plan.atr ? `1×ATR ($${plan.atr.toFixed(2)}) from the best ${usd(peak)}` : 'ATR unavailable — hold the breakeven stop'} · ${timeTxt}`, stopNow };
  if (beHit) return { state: 'breakeven', headline: `+1R reached → stop to breakeven ${usd(stopNow)}`, detail: `½ at T1${s.target ? ` ${usd(s.target)}` : ''} · ${timeTxt}`, stopNow };
  return { state: 'initial', headline: `Stop ${usd(s.stop)} · BE at +1R (${usd(s.entry + dir * R)})`, detail: `½ at T1${s.target ? ` ${usd(s.target)}` : ''} · then trail 1×ATR · ${timeTxt}`, stopNow };
}
