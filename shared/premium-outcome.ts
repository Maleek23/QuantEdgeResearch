/**
 * PREMIUM-BASED OUTCOMES FOR OPTION IDEAS.
 *
 * WHAT WAS WRONG (prod, 2026-10-07)
 *   The tracker judged option ideas on the UNDERLYING: when the stock touched
 *   T1 the idea became hit_target, and the premium was looked up afterwards.
 *   12 option rows were hit_target with exit_premium < entry_premium —
 *   TSLA 377.5C 0.81 → 0.45, MSTR 157.5C 2.35 → 2.26. A "win" that lost money.
 *
 * THE RULE
 *   An option idea's T1 / T2 / stop / peak are judged on the CONTRACT's own
 *   premium (1-minute option bars, same loader as server/option-peak-job.ts).
 *   The plan's underlying levels are mapped to premium ONCE, at publish
 *   (premiumPlanFor → convergenceSignalsJson.premiumPlan), so the barriers
 *   cannot drift after the fact.
 *     · first bar whose LOW ≤ premium stop → hit_stop, exit = stop (or the bar
 *       open when it gapped through);
 *     · first bar whose HIGH ≥ premium T1 → hit_target, exit = T1 (T2 touch
 *       time recorded beside it);
 *     · both inside one bar → stop (conservative; 1-minute bars cannot order them);
 *     · neither by the end of the window → expired, exit = last bar close.
 *   exit_premium is always a premium the contract printed at the outcome time.
 *   INVARIANT: hit_target never carries exit_premium < entry_premium.
 */
import { DEFAULT_PREMIUM_STOP_PCT } from './position-sizing';

export const PREMIUM_PLAN_VERSION = 'premium-plan-v1';
export const PREMIUM_OUTCOME_VERSION = 'premium-outcome-v1';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface PremiumPlan {
  v: typeof PREMIUM_PLAN_VERSION;
  entry: number;
  t1: number;
  t2: number | null;
  stop: number;
  /** How the underlying levels became premium levels. */
  mapping: string;
  source: 'budget_contract' | 'desk_signals' | 'delta_map' | 'default_pct' | 'stored';
  at?: string;
}

interface PlanIdea {
  assetType?: string | null;
  direction?: string | null;
  entryPrice?: number | null;
  targetPrice?: number | null;
  target2?: number | null;
  stopLoss?: number | null;
  entryPremium?: number | null;
  optionDelta?: number | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  source?: string | null;
  qualitySignals?: unknown;
  convergenceSignalsJson?: unknown;
}

const csOf = (x: unknown): Record<string, any> => {
  if (x && typeof x === 'object') return x as Record<string, any>;
  if (typeof x === 'string') { try { const p = JSON.parse(x); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  return {};
};
const sigOf = (q: unknown): string[] => (Array.isArray(q) ? q.map(String) : typeof q === 'string' ? (() => { try { const p = JSON.parse(q); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } })() : []);
const sigNum = (sig: string[], key: string): number | null => {
  const s = sig.find((x) => x.startsWith(`${key}:`));
  return s ? num(s.slice(key.length + 1)) : null;
};

/** A stored plan off the idea, when it is a valid one. Pure. */
export function readPremiumPlan(convergenceSignalsJson: unknown): PremiumPlan | null {
  const p = csOf(convergenceSignalsJson).premiumPlan;
  if (!p || p.v !== PREMIUM_PLAN_VERSION) return null;
  if (!(fin(p.entry) && p.entry > 0 && fin(p.t1) && p.t1 > p.entry && fin(p.stop) && p.stop < p.entry && p.stop >= 0)) return null;
  return { ...p, source: 'stored' } as PremiumPlan;
}

/**
 * Map the plan's underlying T1 / T2 / stop to premium levels. Pure.
 * Precedence: stored plan → the budget contract when it IS the primary →
 * the 0DTE desk's own premium levels (prem_t1 / prem_stop signals) →
 * delta mapping (|Δ| × underlying distance; Δ 0.5 when unknown) →
 * the default premium stop (−40% 0DTE / −50% swing) as a floor.
 * Returns null when the idea is not an option with a positive entry premium.
 */
export function premiumPlanFor(idea: PlanIdea, opts: { zeroDte?: boolean; nowMs?: number } = {}): PremiumPlan | null {
  if (String(idea.assetType ?? '') !== 'option') return null;
  const E = num(idea.entryPremium);
  if (!(E != null && E > 0)) return null;
  const stored = readPremiumPlan(idea.convergenceSignalsJson);
  if (stored && Math.abs(stored.entry - E) < 0.005) return stored;
  const at = new Date(opts.nowMs ?? Date.now()).toISOString();
  const cs = csOf(idea.convergenceSignalsJson);
  const bc = cs.budgetContract;
  if (bc && fin(bc.strike) && fin(bc.entryPremium) && Math.abs(bc.strike - Number(idea.strikePrice)) < 1e-6 &&
      String(bc.expiry).slice(0, 10) === String(idea.expiryDate ?? '').slice(0, 10) && Math.abs(bc.entryPremium - E) < 0.005 &&
      fin(bc.premiumT1) && bc.premiumT1 > E && fin(bc.premiumStop) && bc.premiumStop < E) {
    return { v: PREMIUM_PLAN_VERSION, entry: E, t1: bc.premiumT1, t2: fin(bc.premiumT2) && bc.premiumT2 > bc.premiumT1 ? bc.premiumT2 : null, stop: bc.premiumStop, mapping: `budget contract: ${bc.mapping ?? 'mapped at pick'}`, source: 'budget_contract', at };
  }
  const stopPct = opts.zeroDte ? DEFAULT_PREMIUM_STOP_PCT.zeroDte : DEFAULT_PREMIUM_STOP_PCT.swing;
  const floorStop = r2(E * (1 - stopPct));
  const sig = sigOf(idea.qualitySignals);
  const pt1 = sigNum(sig, 'prem_t1');
  const pst = sigNum(sig, 'prem_stop');
  if (pt1 != null && pt1 > E && pt1 <= E * 6) { // a prem_t1 beyond 6x entry is a unit error (IWM 280C "prem_t1:50"), not a plan
    const stop = pst != null && pst < E && pst > 0 ? pst : floorStop;
    return { v: PREMIUM_PLAN_VERSION, entry: E, t1: r2(pt1), t2: null, stop: r2(stop), mapping: 'engine premium levels (prem_t1 / prem_stop)', source: 'desk_signals', at };
  }
  const entry = num(idea.entryPrice);
  const t1u = num(idea.targetPrice);
  const t2u = num(idea.target2);
  const stu = num(idea.stopLoss);
  const dRaw = num(idea.optionDelta);
  const d = dRaw != null && Math.abs(dRaw) > 0.02 && Math.abs(dRaw) <= 1 ? Math.abs(dRaw) : 0.5;
  const dLabel = dRaw != null && Math.abs(dRaw) > 0.02 ? `Δ${d.toFixed(2)} at publish` : 'Δ0.50 assumed (no delta recorded)';
  if (entry != null && entry > 0 && t1u != null && Math.abs(t1u - entry) > 0) {
    const t1 = r2(E + d * Math.abs(t1u - entry));
    const t2 = t2u != null && Math.abs(t2u - entry) > Math.abs(t1u - entry) ? r2(E + d * Math.abs(t2u - entry)) : null;
    const mapped = stu != null && stu > 0 ? r2(E - d * Math.abs(entry - stu)) : null;
    const stop = r2(Math.min(E - 0.01, Math.max(floorStop, mapped ?? floorStop, 0.01)));
    if (t1 > E) return { v: PREMIUM_PLAN_VERSION, entry: E, t1, t2, stop, mapping: `first-order delta (${dLabel}) × underlying distance; stop floored at −${Math.round(stopPct * 100)}%`, source: 'delta_map', at };
  }
  return { v: PREMIUM_PLAN_VERSION, entry: E, t1: r2(E * 1.5), t2: null, stop: floorStop, mapping: `no underlying plan to map — default +50% / −${Math.round(stopPct * 100)}% on premium`, source: 'default_pct', at };
}

export interface PremiumBar { t: number; o: number; h: number; l: number; c: number }

export type PremiumOutcomeStatus = 'hit_target' | 'hit_stop' | 'expired' | 'open';

export interface PremiumOutcome {
  v: typeof PREMIUM_OUTCOME_VERSION;
  status: PremiumOutcomeStatus;
  exitPremium: number | null;
  exitAtMs: number | null;
  optionPercentGain: number | null;
  t1HitAt: number | null;
  t2HitAt: number | null;
  stopHitAt: number | null;
  peak: { premium: number; atMs: number } | null;
  bars: number;
  basis: string;
}

/**
 * Judge an option idea on its contract's 1-minute bars over [fromMs, toMs).
 * `final` = the window is complete (session over / time stop passed): no
 * barrier → expired at the last close. Not final and no barrier → open. Pure.
 */
export function judgePremiumOutcome(bars: PremiumBar[], plan: PremiumPlan, fromMs: number, toMs: number, opts: { final: boolean; source?: string }): PremiumOutcome {
  const sorted = bars.filter((b) => fin(b.t) && b.t >= fromMs && b.t < toMs && fin(b.h) && b.h > 0).sort((a, b) => a.t - b.t);
  let peak: PremiumOutcome['peak'] = null;
  let t1HitAt: number | null = null, t2HitAt: number | null = null, stopHitAt: number | null = null;
  let status: PremiumOutcomeStatus = 'open';
  let exit: number | null = null, exitAt: number | null = null;
  for (const b of sorted) {
    if (status === 'open') {
      if (!peak || b.h > peak.premium + 1e-9) peak = { premium: r2(b.h), atMs: b.t };
      const stopTouch = fin(b.l) && b.l <= plan.stop + 1e-9;
      const t1Touch = b.h >= plan.t1 - 1e-9;
      if (stopTouch && (!t1Touch || !(fin(b.o) && b.o >= plan.t1))) {
        status = 'hit_stop'; stopHitAt = b.t; exitAt = b.t;
        exit = fin(b.o) && b.o < plan.stop ? r2(b.o) : plan.stop;
        continue;
      }
      if (t1Touch) {
        status = 'hit_target'; t1HitAt = b.t; exitAt = b.t;
        exit = fin(b.o) && b.o > plan.t1 ? r2(b.o) : plan.t1;
        if (plan.t2 != null && b.h >= plan.t2 - 1e-9) t2HitAt = b.t;
        continue;
      }
    } else if (status === 'hit_target') {
      // after the exit: T2 touch time is recorded for the record (hindsight), the exit stays at T1
      if (plan.t2 != null && t2HitAt == null && b.h >= plan.t2 - 1e-9) t2HitAt = b.t;
    }
  }
  if (status === 'open' && opts.final && sorted.length) {
    const last = sorted[sorted.length - 1];
    status = 'expired'; exit = r2(last.c); exitAt = last.t;
  }
  // INVARIANT: a target outcome never books less than the entry premium.
  if (status === 'hit_target' && exit != null && exit < plan.entry) { status = 'expired'; }
  const pct = exit != null && plan.entry > 0 ? r2(((exit - plan.entry) / plan.entry) * 100) : null;
  return {
    v: PREMIUM_OUTCOME_VERSION, status, exitPremium: exit, exitAtMs: exitAt, optionPercentGain: pct,
    t1HitAt, t2HitAt, stopHitAt, peak, bars: sorted.length,
    basis: `${opts.source ?? 'contract bars'} · ${sorted.length} bars · plan ${plan.source}`,
  };
}

/** The write-side invariant, applied to any option outcome before it is stored. Pure. */
export function premiumConsistent(status: string | null | undefined, entryPremium: number | null | undefined, exitPremium: number | null | undefined): { ok: boolean; reason: string | null } {
  if (status !== 'hit_target') return { ok: true, reason: null };
  const E = num(entryPremium), X = num(exitPremium);
  if (E == null || X == null) return { ok: true, reason: null };
  return X + 1e-9 < E
    ? { ok: false, reason: `hit_target with exit premium $${X.toFixed(2)} below entry $${E.toFixed(2)} — the underlying touched T1, the contract did not pay` }
    : { ok: true, reason: null };
}

// ── backfill window (pure) ──────────────────────────────────────────────────

const ET_TZ = 'America/New_York';
export function etDateKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: ET_TZ });
}
/** UTC ms of an ET wall-clock time (minutes after midnight) on a YYYY-MM-DD date. */
export function etWallMs(dateKey: string, minutes: number): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const asEt = new Date(new Date(guess).toLocaleString('en-US', { timeZone: ET_TZ })).getTime();
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return guess + (asUtc - asEt);
}

export interface BackfillRow {
  outcomeStatus?: string | null;
  resolutionReason?: string | null;
  timestamp: string;
  exitDate?: string | null;
  exitBy?: string | null;
  expiryDate?: string | null;
  entryMs?: number | null;
}

export type BackfillWindow =
  | { ok: true; fromMs: number; toMs: number; final: boolean; deadlineMs: number; shortDated: boolean }
  | { ok: false; why: string };

/**
 * The window an option idea is re-judged over. Short-dated (≤ 2 DTE at entry,
 * held intraday): entry → that session's 16:00 ET (or exit_by when earlier).
 * Longer-dated: entry → the recorded time/expiry exit, else exit_by / the
 * expiry close. Never-entered and superseded rows are skipped. Pure.
 */
export function backfillWindow(r: BackfillRow, nowMs: number, lagMs = 16 * 60_000): BackfillWindow {
  const reason = String(r.resolutionReason ?? '');
  if (reason.startsWith('missed_entry')) return { ok: false, why: 'never entered (missed entry)' };
  if (reason.startsWith('superseded')) return { ok: false, why: 'superseded before an outcome' };
  const fromMs = r.entryMs ?? Date.parse(r.timestamp);
  const expiry = String(r.expiryDate ?? '').slice(0, 10);
  if (!Number.isFinite(fromMs) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return { ok: false, why: 'no entry time / expiry' };
  const entryDay = etDateKey(fromMs);
  const dte = Math.round((Date.parse(`${expiry}T12:00:00Z`) - Date.parse(`${entryDay}T12:00:00Z`)) / 86_400_000);
  const shortDated = dte <= 2;
  const expiryClose = etWallMs(expiry, 16 * 60);
  const exitBy = Date.parse(String(r.exitBy ?? ''));
  const exitAt = Date.parse(String(r.exitDate ?? ''));
  let deadline: number;
  if (shortDated) {
    deadline = Math.min(etWallMs(entryDay, 16 * 60), expiryClose);
    if (Number.isFinite(exitBy) && exitBy > fromMs) deadline = Math.min(deadline, exitBy);
  } else if (r.outcomeStatus && r.outcomeStatus !== 'open' && Number.isFinite(exitAt) && exitAt > fromMs) {
    // A longer-dated idea the desk already closed: judged up to the recorded exit
    // (the trade was out then); no premium barrier by then → time exit at that premium.
    deadline = exitAt;
  } else {
    deadline = Number.isFinite(exitBy) && exitBy > fromMs ? Math.min(exitBy, expiryClose) : expiryClose;
  }
  const dataEnd = nowMs - lagMs;
  const toMs = Math.min(deadline, dataEnd);
  if (toMs <= fromMs) return { ok: false, why: 'window not started (bars lag)' };
  return { ok: true, fromMs, toMs, final: deadline <= dataEnd, deadlineMs: deadline, shortDated };
}

/** Best premium over a window (the "true peak"). Pure. */
export function peakOverWindow(bars: PremiumBar[], fromMs: number, toMs: number): { premium: number; atMs: number } | null {
  let best: { premium: number; atMs: number } | null = null;
  for (const b of bars) {
    if (!fin(b.t) || b.t < fromMs || b.t >= toMs || !fin(b.h) || b.h <= 0) continue;
    if (!best || b.h > best.premium + 1e-9) best = { premium: r2(b.h), atMs: b.t };
  }
  return best;
}

/** Parse "TSLA 380P 0DTE … mid $3.05" / "AMZN 255P 0DTE … mid $1.33" style catalysts. Pure. */
export function contractFromCatalyst(catalyst: string | null | undefined): { strike: number; optionType: 'call' | 'put'; mid: number | null } | null {
  const m = String(catalyst ?? '').match(/\b[A-Z.]{1,6}\s+(\d+(?:\.\d+)?)([CP])\b/);
  if (!m) return null;
  const mid = String(catalyst).match(/mid \$(\d+(?:\.\d+)?)/);
  return { strike: Number(m[1]), optionType: m[2] === 'P' ? 'put' : 'call', mid: mid ? Number(mid[1]) : null };
}
