/**
 * LEARNING LOOP — gated self-calibration over the learning ledger. Pure: no I/O.
 * ==========================================================================
 * server/learning-loop-job.ts runs it; /admin/learning shows it; tests:
 * scripts/test-learning-loop.ts.
 *
 *  1. SCORECARD (nightly)  win rate (Wilson 95% CI), avg R, expectancy, P&L at
 *     $500 / $1,000 by engine / grade band / setup / time bucket / GEX regime /
 *     DTE bucket, each with n. DRIFT: a slice's last 20 decided ideas diverge
 *     from its baseline (the slice's earlier ideas) when the baseline win rate
 *     falls outside the last-20 Wilson CI, or the last-20 mean R falls outside
 *     the baseline mean ± 1.96·sd/√20.
 *  2. RE-FIT (weekly)  bounded candidate set, one family at a time, each
 *     candidate compared with the INCUMBENT on the SAME universe of ideas:
 *       grade weight vectors × grade floor · stop ATR multiple × T1 ATR distance ·
 *       contract |delta| × DTE bands · exit policy (plan vs managed-v1 replay) ·
 *       single engine / time-bucket mutes.
 *     Objective = expectancy in R (clipped to [−3, +5]). Walk-forward: halves
 *     split at the median publish day, plus K rolling sequential folds. A
 *     candidate is ACCEPTED only when it beats the incumbent in BOTH halves with
 *     n ≥ minN taken per half, AND in a majority of evaluable rolling folds.
 *     Every candidate tested is counted (multiple-comparison disclosure).
 *  3. SHADOW  the accepted challenger grades live ideas side by side for ≥ 10
 *     trading days (no effect on publishing) and is scored on their outcomes.
 *  4. PROMOTION GATE  eligible only when refit (both halves) AND shadow
 *     (n ≥ 50 decided, challenger expectancy > incumbent) both hold. Never
 *     auto-promoted: an admin approves. Approve writes a versioned calibration
 *     (rollback restores the previous version). AUTO-ROLLBACK when the first 30
 *     decided ideas after promotion average below the expectation band.
 *
 * Bracket replays (stop / T1 ATR families) use the underlying's max favourable
 * and max adverse excursion with the conservative rule "if the new stop was
 * reachable, the stop came first" — 1-minute order is not stored. They are
 * labelled as such on the admin page and never mixed with premium R.
 */
import { clipR, etDay, type LedgerRow, type TodBucket } from './learning-ledger';
import { isValidTradingDay } from './market-calendar';

export const LEARNING_LOOP_VERSION = 'learning-loop-v1';
export const MIN_SLICE_N = 30;
export const DRIFT_WINDOW = 20;
export const SHADOW_MIN_DAYS = 10;
export const SHADOW_MIN_DECIDED = 50;
export const ROLLBACK_WINDOW = 30;
export const ROLLING_FOLDS = 4;
/** A candidate must beat the incumbent by at least this much expectancy in EACH half — a 0.001R "win" is noise. */
export const MIN_EDGE_R = 0.05;
/**
 * Families shown on the admin page but never merged into a challenger. bracket: the
 * tracker's highest/lowest-reached are quote-sampled, not bar extremes, so adverse
 * excursion is understated and tight stops look good — the first prod re-fit preferred
 * 0.5×ATR stops, the opposite of the bar-verified book (losers rarely recover; 0.5×ATR
 * stops too tight). Advisory until MFE/MAE come from 1-minute bars.
 */
export const ADVISORY_FAMILIES: ReadonlySet<CandidateFamily> = new Set(['bracket']);

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

// ─── statistics ─────────────────────────────────────────────────────────────

/** Wilson score interval for k successes in n trials (95% by default). */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } | null {
  if (!(n > 0)) return null;
  const p = k / n, z2 = z * z;
  const den = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: r3(Math.max(0, c - h)), hi: r3(Math.min(1, c + h)) };
}

export interface SliceStats {
  n: number;
  wins: number;
  winRate: number | null;
  ci: { lo: number; hi: number } | null;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  /** p·avgWin + (1−p)·avgLoss, in R (equals avgR on the same rows; kept explicit). */
  expectancyR: number | null;
  /** mean R ± 1.96·se */
  rCi: { lo: number; hi: number } | null;
  pnl500: number;
  pnl1000: number;
  /** ideas affordable at one whole contract / share at each size */
  sized500: number;
  sized1000: number;
  reportable: boolean;
}

export function sliceStats(rows: LedgerRow[]): SliceStats {
  const rs = rows.map((r) => clipR(r.outcome!.R!));
  const n = rs.length;
  const wins = rs.filter((x) => x > 0).length;
  const winR = rs.filter((x) => x > 0), lossR = rs.filter((x) => x <= 0);
  const p = n ? wins / n : null;
  const aw = mean(winR), al = mean(lossR);
  const m = mean(rs), s = sd(rs);
  const exp = p == null ? null : p * (aw ?? 0) + (1 - p) * (al ?? 0);
  let pnl500 = 0, pnl1000 = 0, sized500 = 0, sized1000 = 0;
  for (const r of rows) {
    const o = r.outcome!;
    if (o.qty500 && o.pnl500 != null) { pnl500 += o.pnl500; sized500++; }
    if (o.qty1000 && o.pnl1000 != null) { pnl1000 += o.pnl1000; sized1000++; }
  }
  return {
    n, wins, winRate: p == null ? null : r3(p), ci: wilson(wins, n),
    avgR: m == null ? null : r3(m), avgWinR: aw == null ? null : r3(aw), avgLossR: al == null ? null : r3(al),
    expectancyR: exp == null ? null : r3(exp),
    rCi: m != null && s != null ? { lo: r3(m - 1.96 * s / Math.sqrt(n)), hi: r3(m + 1.96 * s / Math.sqrt(n)) } : null,
    pnl500: r2(pnl500), pnl1000: r2(pnl1000), sized500, sized1000, reportable: n >= MIN_SLICE_N,
  };
}

export type ScoreDim = 'engine' | 'gradeBand' | 'setup' | 'tod' | 'regime' | 'dte';
export const SCORE_DIMS: ScoreDim[] = ['engine', 'gradeBand', 'setup', 'tod', 'regime', 'dte'];
export const DIM_LABEL: Record<ScoreDim, string> = {
  engine: 'Engine', gradeBand: 'Grade band (g2 at publish)', setup: 'Setup', tod: 'Time of day (ET)', regime: 'GEX regime', dte: 'DTE bucket',
};
export function dimValue(r: LedgerRow, d: ScoreDim): string {
  const f = r.features;
  switch (d) {
    case 'engine': return f.engine;
    case 'gradeBand': return f.gradeBand;
    case 'setup': return f.setup;
    case 'tod': return f.tod ?? 'unknown';
    case 'regime': return f.gexRegime ?? 'no GEX read';
    case 'dte': return f.dteBucket;
  }
}

export interface DriftFlag { dim: ScoreDim; value: string; kind: 'win_rate' | 'avg_r'; baseline: number; recent: number; band: { lo: number; hi: number }; nBaseline: number; nRecent: number; note: string }

/** Last DRIFT_WINDOW decided rows of a slice vs the slice's earlier rows. */
export function driftFor(rows: LedgerRow[], dim: ScoreDim, value: string): DriftFlag[] {
  const sorted = [...rows].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  if (sorted.length < DRIFT_WINDOW + 10) return [];
  const recent = sorted.slice(-DRIFT_WINDOW), base = sorted.slice(0, -DRIFT_WINDOW);
  const b = sliceStats(base), c = sliceStats(recent);
  const out: DriftFlag[] = [];
  if (b.winRate != null && c.ci && (b.winRate < c.ci.lo || b.winRate > c.ci.hi)) {
    out.push({ dim, value, kind: 'win_rate', baseline: b.winRate, recent: c.winRate!, band: c.ci, nBaseline: b.n, nRecent: c.n,
      note: `last ${DRIFT_WINDOW} win rate ${(c.winRate! * 100).toFixed(0)}% (CI ${(c.ci.lo * 100).toFixed(0)}–${(c.ci.hi * 100).toFixed(0)}%) excludes the baseline ${(b.winRate * 100).toFixed(0)}%` });
  }
  const bs = sd(base.map((r) => clipR(r.outcome!.R!)));
  if (b.avgR != null && c.avgR != null && bs != null) {
    const band = { lo: r3(b.avgR - 1.96 * bs / Math.sqrt(DRIFT_WINDOW)), hi: r3(b.avgR + 1.96 * bs / Math.sqrt(DRIFT_WINDOW)) };
    if (c.avgR < band.lo || c.avgR > band.hi) {
      out.push({ dim, value, kind: 'avg_r', baseline: b.avgR, recent: c.avgR, band, nBaseline: b.n, nRecent: c.n,
        note: `last ${DRIFT_WINDOW} avg R ${c.avgR.toFixed(2)} outside the baseline band ${band.lo.toFixed(2)}…${band.hi.toFixed(2)}` });
    }
  }
  return out;
}

export interface Scorecard {
  v: typeof LEARNING_LOOP_VERSION;
  asOf: string;
  since: string;
  population: { rows: number; eligible: number; decided: number; excluded: Record<string, number>; unresolved: number; firstDay: string | null; lastDay: string | null };
  overall: SliceStats;
  byBasis: { premium: SliceStats; underlying: SliceStats };
  slices: Record<ScoreDim, Array<{ value: string } & SliceStats>>;
  drift: DriftFlag[];
  caveats: string[];
}

export function buildScorecard(all: LedgerRow[], since: string, nowMs = Date.now()): Scorecard {
  const excluded: Record<string, number> = {};
  for (const r of all) if (r.excluded) excluded[r.excluded] = (excluded[r.excluded] ?? 0) + 1;
  const eligible = all.filter((r) => !r.excluded);
  const decided = eligible.filter((r) => r.outcome?.decided && r.outcome.R != null);
  const days = decided.map((r) => r.day).sort();
  const slices = {} as Scorecard['slices'];
  const drift: DriftFlag[] = [];
  for (const d of SCORE_DIMS) {
    const groups = new Map<string, LedgerRow[]>();
    for (const r of decided) { const v = dimValue(r, d); (groups.get(v) ?? groups.set(v, []).get(v)!).push(r); }
    slices[d] = [...groups.entries()].map(([value, rs]) => ({ value, ...sliceStats(rs) })).sort((a, b) => b.n - a.n);
    for (const [value, rs] of groups) drift.push(...driftFor(rs, d, value));
  }
  return {
    v: LEARNING_LOOP_VERSION, asOf: new Date(nowMs).toISOString(), since,
    population: { rows: all.length, eligible: eligible.length, decided: decided.length, excluded, unresolved: eligible.length - decided.length, firstDay: days[0] ?? null, lastDay: days[days.length - 1] ?? null },
    overall: sliceStats(decided),
    byBasis: { premium: sliceStats(decided.filter((r) => r.outcome!.basis === 'premium')), underlying: sliceStats(decided.filter((r) => r.outcome!.basis === 'underlying')) },
    slices, drift,
    caveats: [
      `population: ideas published since ${since}; pre-baseline outcomes are never used`,
      'options scored on contract premium (R = premium move ÷ premium-plan risk); stocks on the underlying',
      'NEXUS book verification MISMATCH rows, duplicates, superseded, synthetic and excluded-from-training rows are removed',
      `R clipped to [−3, +5] in every average; a slice is reportable at n ≥ ${MIN_SLICE_N}`,
      'unresolved ideas (missed entry, unmeasured expiry, open) count as coverage, never in a rate',
    ],
  };
}

// ─── configuration ───────────────────────────────────────────────────────────

export const GRADE_FACTORS = ['evidence', 'technical', 'lifecycle', 'window', 'session'] as const;
export type GradeFactorKey = typeof GRADE_FACTORS[number];
export type ExitPolicyChoice = 'plan' | 'managed';

export interface LearningConfig {
  id: string;
  label: string;
  /** Multipliers on the g2 factor points at publish (1 = g2 as shipped). */
  gradeWeights: Record<GradeFactorKey, number>;
  /** Re-weighted grade (0–100) an idea must reach to be taken; null = no floor. */
  gradeFloor: number | null;
  /** Stop distance in daily ATR; null = as published. */
  stopAtr: number | null;
  /** T1 distance in daily ATR; null = as published. */
  t1Atr: number | null;
  /** Contract |delta| band; null = any. */
  deltaBand: [number, number] | null;
  /** Contract DTE band (calendar days at publish); null = any. */
  dteBand: [number, number] | null;
  exitPolicy: ExitPolicyChoice;
  muteEngines: string[];
  muteTod: TodBucket[];
}

export const INCUMBENT: LearningConfig = Object.freeze({
  id: 'incumbent', label: 'Incumbent (as published: g2, published stops/targets, any contract, plan exits, no mutes)',
  gradeWeights: { evidence: 1, technical: 1, lifecycle: 1, window: 1, session: 1 },
  gradeFloor: null, stopAtr: null, t1Atr: null, deltaBand: null, dteBand: null, exitPolicy: 'plan', muteEngines: [], muteTod: [],
}) as LearningConfig;

export type CandidateFamily = 'grade' | 'bracket' | 'contract' | 'exit' | 'mute';
export const FAMILY_LABEL: Record<CandidateFamily, string> = {
  grade: 'Grade weight vector × floor (premium/underlying R as recorded)',
  bracket: 'Stop ATR × T1 ATR (ADVISORY — underlying bracket replay on tracker extremes, stop-first)',
  contract: 'Contract |delta| × DTE band (options, premium R)',
  exit: 'Exit policy: plan vs managed-v1 replay',
  mute: 'Single engine / time-bucket mute',
};

/** Re-weighted g2 score, rescaled to 0–100 against the weighted maxima. */
const G2_MAX: Record<GradeFactorKey, number> = { evidence: 25, technical: 15, lifecycle: 25, window: 25, session: 10 };
export function reweightedGrade(f: Record<string, number> | null, w: Record<GradeFactorKey, number>): number | null {
  if (!f) return null;
  let s = 0, m = 0;
  for (const k of GRADE_FACTORS) { s += (f[k] ?? 0) * w[k]; m += G2_MAX[k] * w[k]; }
  return m > 0 ? Math.round((s / m) * 100) : null;
}

/**
 * Bracket replay for one row in units of the bracket's own stop:
 *   MAE ≥ stop → −1R (stop-first when both were reachable);
 *   else MFE ≥ T1 → +T1/stop;
 *   else the close-out (closeAtr) ÷ stop.
 */
export function bracketR(row: LedgerRow, stopAtr: number, t1Atr: number): number | null {
  const o = row.outcome;
  if (!o || o.mfeAtr == null || o.maeAtr == null || !(stopAtr > 0) || !(t1Atr > 0)) return null;
  if (o.maeAtr >= stopAtr) return -1;
  if (o.mfeAtr >= t1Atr) return r3(t1Atr / stopAtr);
  if (o.closeAtr == null) return null;
  return r3(Math.max(-1, Math.min(t1Atr, o.closeAtr)) / stopAtr);
}

/** Does `cfg` take this idea, and at what R? null = not taken (or not evaluable under this family). */
export function evaluateRow(cfg: LearningConfig, row: LedgerRow, family: CandidateFamily | 'all' = 'all'): number | null {
  const f = row.features, o = row.outcome;
  if (!o || !o.decided || o.R == null) return null;
  if (cfg.muteEngines.includes(f.engine)) return null;
  if (f.tod && cfg.muteTod.includes(f.tod)) return null;
  if (cfg.gradeFloor != null) {
    const g = reweightedGrade(f.grade.f, cfg.gradeWeights);
    if (g == null || g < cfg.gradeFloor) return null;
  }
  if (cfg.deltaBand && f.assetType === 'option' && (f.delta == null || f.delta < cfg.deltaBand[0] || f.delta > cfg.deltaBand[1])) return null;
  if (cfg.dteBand && f.assetType === 'option' && (f.dte == null || f.dte < cfg.dteBand[0] || f.dte > cfg.dteBand[1])) return null;
  if (family === 'bracket') {
    const s = cfg.stopAtr ?? f.stopAtr, t = cfg.t1Atr ?? f.t1Atr;
    return s != null && t != null ? bracketR(row, s, t) : null;
  }
  if (family === 'exit' || cfg.exitPolicy === 'managed') {
    if (o.managedR == null) return null; // same universe for plan and managed
    return clipR(cfg.exitPolicy === 'managed' ? o.managedR : o.R);
  }
  return clipR(o.R);
}

/** The universe a family is judged on — identical for incumbent and candidate. */
export function familyUniverse(rows: LedgerRow[], family: CandidateFamily): LedgerRow[] {
  return rows.filter((r) => {
    const f = r.features, o = r.outcome;
    if (!o?.decided || o.R == null) return false;
    switch (family) {
      case 'grade': return !!f.grade.f;
      case 'bracket': return o.mfeAtr != null && o.maeAtr != null && f.stopAtr != null && f.t1Atr != null && bracketR(r, f.stopAtr, f.t1Atr) != null;
      case 'contract': return f.assetType === 'option';
      case 'exit': return o.managedR != null;
      case 'mute': return true;
    }
  });
}

export interface Candidate { family: CandidateFamily; config: LearningConfig }

/** The bounded candidate set. Engines / time buckets come from the data (only those with ≥ minN rows). */
export function candidateSet(rows: LedgerRow[], minN = MIN_SLICE_N): Candidate[] {
  const out: Candidate[] = [];
  const base = (over: Partial<LearningConfig>, id: string, label: string): LearningConfig => ({ ...INCUMBENT, gradeWeights: { ...INCUMBENT.gradeWeights }, muteEngines: [], muteTod: [], ...over, id, label });
  const W: Array<[string, Record<GradeFactorKey, number>]> = [
    ['g2', { evidence: 1, technical: 1, lifecycle: 1, window: 1, session: 1 }],
    ['no-evidence', { evidence: 0, technical: 1, lifecycle: 1, window: 1, session: 1 }],
    ['no-technical', { evidence: 1, technical: 0, lifecycle: 1, window: 1, session: 1 }],
    ['timing-only', { evidence: 0, technical: 0, lifecycle: 1, window: 1, session: 1 }],
    ['evidence-2x', { evidence: 2, technical: 1, lifecycle: 1, window: 1, session: 1 }],
    ['technical-2x', { evidence: 1, technical: 2, lifecycle: 1, window: 1, session: 1 }],
    ['window-2x', { evidence: 1, technical: 1, lifecycle: 1, window: 2, session: 1 }],
    ['no-session', { evidence: 1, technical: 1, lifecycle: 1, window: 1, session: 0 }],
  ];
  for (const [name, w] of W) for (const floor of [50, 65, 80]) out.push({ family: 'grade', config: base({ gradeWeights: w, gradeFloor: floor }, `grade:${name}@${floor}`, `grade weights ${name}, floor ${floor}`) });
  for (const s of [0.5, 0.75, 1, 1.25, 1.5, 2]) for (const t of [0.75, 1, 1.5, 2, 3]) out.push({ family: 'bracket', config: base({ stopAtr: s, t1Atr: t }, `bracket:${s}x/${t}x`, `stop ${s}×ATR, T1 ${t}×ATR`) });
  const D: Array<[number, number] | null> = [null, [0.15, 0.35], [0.3, 0.5], [0.4, 0.6], [0.5, 0.8], [0.2, 0.6]];
  const T: Array<[number, number] | null> = [null, [0, 0], [0, 2], [1, 7], [3, 21], [8, 60], [22, 400]];
  for (const d of D) for (const t of T) {
    if (!d && !t) continue;
    out.push({ family: 'contract', config: base({ deltaBand: d, dteBand: t }, `contract:Δ${d ? d.join('-') : 'any'}/dte${t ? t.join('-') : 'any'}`, `|Δ| ${d ? `${d[0]}–${d[1]}` : 'any'}, DTE ${t ? `${t[0]}–${t[1]}` : 'any'}`) });
  }
  out.push({ family: 'exit', config: base({ exitPolicy: 'managed' }, 'exit:managed-v1', 'managed-v1 exits (BE after +1R, ½ at T1, trail)') });
  const count = (key: (r: LedgerRow) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) { if (!r.outcome?.decided) continue; const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].filter(([, n]) => n >= minN).map(([k]) => k).sort();
  };
  for (const e of count((r) => r.features.engine)) out.push({ family: 'mute', config: base({ muteEngines: [e] }, `mute:engine:${e}`, `mute engine ${e}`) });
  for (const t of count((r) => r.features.tod)) out.push({ family: 'mute', config: base({ muteTod: [t as TodBucket] }, `mute:tod:${t}`, `mute time bucket ${t}`) });
  return out;
}

// ─── walk-forward ────────────────────────────────────────────────────────────

export interface Perf { n: number; expR: number | null }
function perf(cfg: LearningConfig, rows: LedgerRow[], family: CandidateFamily | 'all'): Perf {
  const rs = rows.map((r) => evaluateRow(cfg, r, family)).filter((x): x is number => x != null).map(clipR);
  const m = mean(rs);
  return { n: rs.length, expR: m == null ? null : r3(m) };
}

export function splitHalves(rows: LedgerRow[]): { A: LedgerRow[]; B: LedgerRow[]; medianDay: string | null } {
  const days = rows.map((r) => r.day).sort();
  const med = days[Math.floor(days.length / 2)] ?? null;
  return { A: rows.filter((r) => med != null && r.day < med), B: rows.filter((r) => med != null && r.day >= med), medianDay: med };
}
export function rollingFolds(rows: LedgerRow[], k = ROLLING_FOLDS): LedgerRow[][] {
  const sorted = [...rows].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const size = Math.ceil(sorted.length / k);
  return Array.from({ length: k }, (_, i) => sorted.slice(i * size, (i + 1) * size)).filter((f) => f.length);
}

export interface CandidateResult {
  id: string; label: string; family: CandidateFamily;
  incumbent: { A: Perf; B: Perf; all: Perf };
  candidate: { A: Perf; B: Perf; all: Perf };
  folds: { beat: number; evaluable: number };
  beatsBothHalves: boolean;
  accepted: boolean;
  /** min over halves of (candidate − incumbent) expectancy — the ranking key. */
  edgeMinR: number | null;
  why: string;
}

export function walkForward(c: Candidate, rows: LedgerRow[], minN = MIN_SLICE_N): CandidateResult {
  const U = familyUniverse(rows, c.family);
  const { A, B } = splitHalves(U);
  const inc = { A: perf(INCUMBENT, A, c.family), B: perf(INCUMBENT, B, c.family), all: perf(INCUMBENT, U, c.family) };
  const cand = { A: perf(c.config, A, c.family), B: perf(c.config, B, c.family), all: perf(c.config, U, c.family) };
  const beat = (x: Perf, y: Perf, n: number) => x.n >= n && x.expR != null && y.expR != null && x.expR >= y.expR + MIN_EDGE_R;
  const beatsBothHalves = beat(cand.A, inc.A, minN) && beat(cand.B, inc.B, minN);
  let fb = 0, fe = 0;
  for (const fold of rollingFolds(U)) {
    const ci = perf(c.config, fold, c.family), ii = perf(INCUMBENT, fold, c.family);
    if (ci.n >= Math.max(10, Math.floor(minN / 3)) && ci.expR != null && ii.expR != null) { fe++; if (ci.expR > ii.expR) fb++; }
  }
  const foldsOk = fe > 0 && fb > fe / 2;
  const accepted = beatsBothHalves && foldsOk;
  const edgeMinR = cand.A.expR != null && cand.B.expR != null && inc.A.expR != null && inc.B.expR != null
    ? r3(Math.min(cand.A.expR - inc.A.expR, cand.B.expR - inc.B.expR)) : null;
  const why = cand.A.n < minN || cand.B.n < minN ? `n per half ${cand.A.n}/${cand.B.n} < ${minN}`
    : !beatsBothHalves ? `does not beat the incumbent by ≥ ${MIN_EDGE_R}R in both halves`
    : !foldsOk ? `beats in only ${fb}/${fe} rolling folds`
    : `beats both halves (+${edgeMinR}R min edge) and ${fb}/${fe} folds`;
  return { id: c.config.id, label: c.config.label, family: c.family, incumbent: inc, candidate: cand, folds: { beat: fb, evaluable: fe }, beatsBothHalves, accepted, edgeMinR, why };
}

export interface RefitReport {
  v: typeof LEARNING_LOOP_VERSION;
  asOf: string;
  universe: { decided: number; medianDay: string | null; firstDay: string | null; lastDay: string | null };
  tested: number;
  byFamily: Record<CandidateFamily, { tested: number; accepted: number; best: CandidateResult | null; universe: number }>;
  accepted: CandidateResult[];
  challenger: LearningConfig | null;
  notes: string[];
}

/** Merge accepted family winners (one per family) into one challenger. */
export function mergeWinners(winners: CandidateResult[], cands: Candidate[]): LearningConfig | null {
  if (!winners.length) return null;
  const byId = new Map(cands.map((c) => [c.config.id, c.config]));
  const cfg: LearningConfig = { ...INCUMBENT, gradeWeights: { ...INCUMBENT.gradeWeights }, muteEngines: [], muteTod: [], id: '', label: '' };
  for (const w of winners) {
    const c = byId.get(w.id)!;
    if (w.family === 'grade') { cfg.gradeWeights = { ...c.gradeWeights }; cfg.gradeFloor = c.gradeFloor; }
    if (w.family === 'bracket') { cfg.stopAtr = c.stopAtr; cfg.t1Atr = c.t1Atr; }
    if (w.family === 'contract') { cfg.deltaBand = c.deltaBand; cfg.dteBand = c.dteBand; }
    if (w.family === 'exit') cfg.exitPolicy = c.exitPolicy;
    if (w.family === 'mute') { cfg.muteEngines = [...new Set([...cfg.muteEngines, ...c.muteEngines])]; cfg.muteTod = [...new Set([...cfg.muteTod, ...c.muteTod])]; }
  }
  cfg.id = `challenger:${winners.map((w) => w.id).join('+')}`;
  cfg.label = winners.map((w) => w.label).join(' · ');
  return cfg;
}

export function refit(rows: LedgerRow[], nowMs = Date.now(), minN = MIN_SLICE_N): RefitReport {
  const decided = rows.filter((r) => !r.excluded && r.outcome?.decided && r.outcome.R != null);
  const cands = candidateSet(decided, minN);
  const results = cands.map((c) => walkForward(c, decided, minN));
  const fams: CandidateFamily[] = ['grade', 'bracket', 'contract', 'exit', 'mute'];
  const byFamily = {} as RefitReport['byFamily'];
  const winners: CandidateResult[] = [];
  for (const fam of fams) {
    const rs = results.filter((r) => r.family === fam);
    const acc = rs.filter((r) => r.accepted).sort((a, b) => (b.edgeMinR ?? -9) - (a.edgeMinR ?? -9));
    const best = acc[0] ?? [...rs].sort((a, b) => (b.edgeMinR ?? -9) - (a.edgeMinR ?? -9))[0] ?? null;
    byFamily[fam] = { tested: rs.length, accepted: acc.length, best, universe: familyUniverse(decided, fam).length };
    if (acc[0] && !ADVISORY_FAMILIES.has(fam)) winners.push(acc[0]);
  }
  const days = decided.map((r) => r.day).sort();
  return {
    v: LEARNING_LOOP_VERSION, asOf: new Date(nowMs).toISOString(),
    universe: { decided: decided.length, medianDay: splitHalves(decided).medianDay, firstDay: days[0] ?? null, lastDay: days[days.length - 1] ?? null },
    tested: results.length, byFamily, accepted: results.filter((r) => r.accepted), challenger: mergeWinners(winners, cands),
    notes: [
      `${results.length} candidates tested — expect ~${Math.round(results.length * 0.05)} false passes per half at random; the shadow period is the out-of-sample check`,
      `acceptance: beats the incumbent in BOTH halves with n ≥ ${minN} taken per half AND a majority of ${ROLLING_FOLDS} rolling folds`,
      `acceptance also needs an edge ≥ ${MIN_EDGE_R}R over the incumbent in each half`,
      'bracket family is ADVISORY (never merged into a challenger): an underlying MFE/MAE replay (stop-first) on quote-sampled tracker extremes, which understate adverse excursion — not premium R; contract/grade/mute/exit use recorded premium R',
    ],
  };
}

// ─── shadow + promotion gate ─────────────────────────────────────────────────

export interface ShadowEntry { id: string; at: string; challengerId: string; take: boolean; grade: number | null }

export interface ChallengerState {
  config: LearningConfig;
  createdAt: string;
  refitAsOf: string;
  refitBothHalves: boolean;
  status: 'shadow' | 'rejected' | 'approved' | 'superseded';
  decidedAt?: string;
  decidedBy?: string;
}

export interface ShadowReport {
  challengerId: string;
  since: string;
  tradingDays: number;
  ideasSeen: number;
  decided: number;
  incumbent: Perf;
  challenger: Perf;
  /** mean R ± 1.96·se of the challenger's shadow trades — the expectation band used for auto-rollback. */
  band: { lo: number; hi: number } | null;
  complete: boolean;
  beats: boolean;
}

export function shadowReport(ch: ChallengerState, rows: LedgerRow[], tradingDaysSince: number): ShadowReport {
  const since = ch.createdAt;
  const live = rows.filter((r) => !r.excluded && r.publishedAt >= since);
  const decided = live.filter((r) => r.outcome?.decided && r.outcome.R != null);
  const inc = perf(INCUMBENT, decided, 'all');
  const fam: CandidateFamily | 'all' = ch.config.stopAtr != null || ch.config.t1Atr != null ? 'bracket' : 'all';
  const cRs = decided.map((r) => evaluateRow(ch.config, r, fam)).filter((x): x is number => x != null).map(clipR);
  const m = mean(cRs), s = sd(cRs);
  const chal: Perf = { n: cRs.length, expR: m == null ? null : r3(m) };
  const complete = tradingDaysSince >= SHADOW_MIN_DAYS && decided.length >= SHADOW_MIN_DECIDED;
  return {
    challengerId: ch.config.id, since, tradingDays: tradingDaysSince, ideasSeen: live.length, decided: decided.length,
    incumbent: inc, challenger: chal,
    band: m != null && s != null ? { lo: r3(m - 1.96 * s / Math.sqrt(cRs.length)), hi: r3(m + 1.96 * s / Math.sqrt(cRs.length)) } : null,
    complete, beats: chal.expR != null && inc.expR != null && chal.expR > inc.expR,
  };
}

export interface GateVerdict { eligible: boolean; reasons: string[] }
export function promotionGate(ch: ChallengerState | null, shadow: ShadowReport | null): GateVerdict {
  const reasons: string[] = [];
  if (!ch) return { eligible: false, reasons: ['no challenger'] };
  if (ch.status !== 'shadow') reasons.push(`challenger is ${ch.status}`);
  if (!ch.refitBothHalves) reasons.push('did not beat the incumbent in both walk-forward halves');
  if (!shadow) reasons.push('no shadow record');
  else {
    if (shadow.tradingDays < SHADOW_MIN_DAYS) reasons.push(`shadow ${shadow.tradingDays}/${SHADOW_MIN_DAYS} trading days`);
    if (shadow.decided < SHADOW_MIN_DECIDED) reasons.push(`shadow n=${shadow.decided} decided < ${SHADOW_MIN_DECIDED}`);
    if (!shadow.beats) reasons.push(`shadow: challenger ${shadow.challenger.expR ?? '—'}R does not beat incumbent ${shadow.incumbent.expR ?? '—'}R`);
  }
  return { eligible: reasons.length === 0, reasons };
}

// ─── versioned calibration file ──────────────────────────────────────────────

export interface CalibrationVersion {
  version: number;
  config: LearningConfig;
  at: string;
  by: string;
  action: 'approve' | 'rollback' | 'auto_rollback';
  /** Expected R band from the shadow period; auto-rollback compares against its lower edge. */
  expectation: { lo: number; hi: number; expR: number | null } | null;
  note: string;
}
export interface CalibrationFile {
  v: 'calibration-v1';
  current: number;
  versions: CalibrationVersion[];
}
export const EMPTY_CALIBRATION: CalibrationFile = Object.freeze({ v: 'calibration-v1', current: 0, versions: [] }) as CalibrationFile;

export function activeCalibration(file: CalibrationFile | null): CalibrationVersion | null {
  if (!file || !file.current) return null;
  return file.versions.find((x) => x.version === file.current) ?? null;
}

export function approveInto(file: CalibrationFile | null, ch: ChallengerState, shadow: ShadowReport | null, by: string, nowMs = Date.now()): CalibrationFile {
  const f = file ?? EMPTY_CALIBRATION;
  const version = f.versions.reduce((m, x) => Math.max(m, x.version), 0) + 1;
  const v: CalibrationVersion = {
    version, config: ch.config, at: new Date(nowMs).toISOString(), by, action: 'approve',
    expectation: shadow?.band ? { ...shadow.band, expR: shadow.challenger.expR } : null,
    note: `approved challenger ${ch.config.id}`,
  };
  return { v: 'calibration-v1', current: version, versions: [...f.versions, v] };
}

/** Roll back to the version before the current one (0 = incumbent / no calibration). New version entry, history kept. */
export function rollbackFrom(file: CalibrationFile, by: string, action: 'rollback' | 'auto_rollback', note: string, nowMs = Date.now()): CalibrationFile {
  const cur = activeCalibration(file);
  if (!cur) return file;
  const idx = file.versions.findIndex((x) => x.version === cur.version);
  // the config that was active before `cur` (walk back past rollback entries to the previous effective one)
  const prev = idx > 0 ? file.versions[idx - 1] : null;
  const version = file.versions.reduce((m, x) => Math.max(m, x.version), 0) + 1;
  const restored = prev && prev.config.id !== cur.config.id ? prev.config : INCUMBENT;
  const v: CalibrationVersion = { version, config: restored, at: new Date(nowMs).toISOString(), by, action, expectation: prev?.expectation ?? null, note };
  return { v: 'calibration-v1', current: version, versions: [...file.versions, v] };
}

export interface RollbackCheck { due: boolean; n: number; meanR: number | null; floor: number | null; reason: string }
/** First ROLLBACK_WINDOW decided ideas after the active version's approval vs its expectation band. */
export function autoRollbackCheck(file: CalibrationFile | null, rows: LedgerRow[]): RollbackCheck {
  const cur = activeCalibration(file);
  if (!cur || cur.action !== 'approve' || !cur.expectation) return { due: false, n: 0, meanR: null, floor: null, reason: 'no promoted config with an expectation band' };
  const after = rows.filter((r) => !r.excluded && r.publishedAt >= cur.at && r.outcome?.decided)
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const rs = after.map((r) => evaluateRow(cur.config, r)).filter((x): x is number => x != null).slice(0, ROLLBACK_WINDOW).map(clipR);
  const m = mean(rs);
  if (rs.length < ROLLBACK_WINDOW) return { due: false, n: rs.length, meanR: m == null ? null : r3(m), floor: cur.expectation.lo, reason: `${rs.length}/${ROLLBACK_WINDOW} decided since promotion` };
  const due = m! < cur.expectation.lo;
  return { due, n: rs.length, meanR: r3(m!), floor: cur.expectation.lo, reason: due ? `first ${ROLLBACK_WINDOW} decided averaged ${r3(m!)}R < expectation floor ${cur.expectation.lo}R` : 'within expectation' };
}

/** NYSE trading days strictly after the ET day of `fromIso`, up to and including the ET day of `toMs`. */
export function tradingDaysBetween(fromIso: string, toMs: number): number {
  const from = etDay(Date.parse(fromIso)), to = etDay(toMs);
  let n = 0;
  const d = new Date(`${from}T12:00:00Z`);
  for (let guard = 0; guard < 800; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const k = d.toISOString().slice(0, 10);
    if (k > to) break;
    if (isValidTradingDay(k)) n++;
  }
  return n;
}
