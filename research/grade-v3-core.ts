/**
 * GRADE v3 STUDY — pure logic (research/grade-v3-study.ts does the I/O).
 * Tests: scripts/test-grade-v3.ts.
 *
 *   1. TRUTH   the verification ledger (research/verify-nexus-book.ts): VERIFIED rows use the
 *              recorded P&L, MISMATCH rows the recomputed P&L; never-triggered, synthetic /
 *              retroactive, premium-scale and duplicate rows are excluded, as is UNVERIFIABLE.
 *   2. LABEL   R per trade. Stock/crypto/futures: (P&L ÷ $1,000 notional) × entry ÷ |entry − stop|.
 *              Options: premium return ÷ premium risk (premium-level stop) — else 1R = the
 *              premium paid. Clipped to [−3, +5] for every average.
 *   3. FEATURES numeric + categorical, measured at publish (study main).
 *   4. HALVES  split at the median publish day; every association is reported per half with
 *              each half's top-5 trades removed (walk-forward law).
 *   5. FIT     a monotone, interpretable points-per-bucket score fitted on one half and tested
 *              on the other (both directions); compared with the current grade and the v3 prior.
 */

export const LEDGER_EXCLUDE = new Set([
  'never_triggered', 'synthetic_or_retroactive', 'premium_scale_ladder', 'impossible_entry_premium',
  'impossible_exit_premium', 'fill_off_strike_scale',
]);
export const R_CLIP: readonly [number, number] = [-3, 5];
export const clipR = (r: number) => Math.max(R_CLIP[0], Math.min(R_CLIP[1], r));

export interface LedgerTrade {
  id: string; verdict: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE' | string; bugClass?: string | null;
  recordedPnL: number; recomputedPnL?: number | null; recordedEntry?: number | null; recomputedEntry?: number | null;
  duplicateOf?: string | null; triggerAt?: string | null; assetType?: string | null;
}
export type Truth = { ok: true; pnl: number; basis: 'verified' | 'recomputed'; entry: number | null; triggerAt: string | null } | { ok: false; reason: string };

/** The ledger's verdict on one trade → the P&L to treat as truth, or why the trade is excluded. */
export function ledgerTruth(t: LedgerTrade | null | undefined): Truth {
  if (!t) return { ok: false, reason: 'not in ledger' };
  if (t.duplicateOf) return { ok: false, reason: 'duplicate' };
  if (t.bugClass && LEDGER_EXCLUDE.has(t.bugClass)) return { ok: false, reason: t.bugClass };
  if (t.verdict === 'VERIFIED') {
    return Number.isFinite(t.recordedPnL) ? { ok: true, pnl: t.recordedPnL, basis: 'verified', entry: num(t.recomputedEntry) ?? num(t.recordedEntry), triggerAt: t.triggerAt ?? null } : { ok: false, reason: 'no recorded P&L' };
  }
  if (t.verdict === 'MISMATCH') {
    const p = num(t.recomputedPnL);
    return p != null ? { ok: true, pnl: p, basis: 'recomputed', entry: num(t.recomputedEntry) ?? num(t.recordedEntry), triggerAt: t.triggerAt ?? null } : { ok: false, reason: 'mismatch without recomputed P&L' };
  }
  return { ok: false, reason: 'unverifiable' };
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * R from the truth P&L. `contractLevels` = the plan's entry/stop are option premiums.
 * premium = entry premium per share for options (truth entry, else plan entry premium).
 */
export function rFromPnl(a: { assetType: string; pnl: number; entry: number; stop: number; premium: number | null; contractLevels: boolean }): number | null {
  if (a.assetType === 'option') {
    const prem = a.premium;
    if (prem == null || !(prem > 0)) return null;
    const ret = a.pnl / (prem * 100);
    if (a.contractLevels && a.stop > 0 && a.stop < a.entry) return ret * a.entry / (a.entry - a.stop);
    return ret; // 1R = premium paid
  }
  if (!(a.entry > 0) || !(a.stop > 0) || a.entry === a.stop) return null;
  return (a.pnl / 1000) * a.entry / Math.abs(a.entry - a.stop);
}

// ─── rows ──────────────────────────────────────────────────────────────────
export interface StudyRow {
  id: string; day: string; half?: 'A' | 'B'; R: number;
  /** numeric features (null = not measurable for this trade) */
  f: Record<string, number | null>;
  /** categorical features */
  c: Record<string, string | null>;
  /** comparison scores at publish */
  s: { grade: number | null; v3prior: number | null };
}

export const NUMERIC_FEATURES = [
  'stopAtr', 'chaseAtr', 'trigSlipAtr', 'isShort', 'regime', 'spyVwap', 'rotation', 'gexRoomAtr', 'gapAtr',
  'rsSector', 'dteFit', 'rr', 'confFamilies', 'freshMin', 'etMinute',
] as const;
export const CATEGORICAL_FEATURES = ['engine', 'tod', 'vehicle'] as const;
export const FEATURE_LABEL: Record<string, string> = {
  stopAtr: 'stop distance ÷ ATR(14)', chaseAtr: 'publish price past entry ÷ ATR (chase)', trigSlipAtr: 'trigger fill past entry ÷ ATR',
  isShort: 'short side', regime: 'SPY trend (EMA20) with trade', spyVwap: 'SPY vs session VWAP with trade', rotation: 'sector-rotation layer sign',
  gexRoomAtr: 'room to opposing GEX wall ÷ ATR', gapAtr: 'gap with trade ÷ ATR', rsSector: 'RS vs sector ETF, 5d, with trade (%)',
  dteFit: 'log2(DTE ÷ planned hold)', rr: 'plan R:R', confFamilies: 'confluence family count', freshMin: 'minutes publish → trigger',
  etMinute: 'ET minute of publish', engine: 'engine / source', tod: 'time-of-day bucket', vehicle: 'stock / call / put',
};

/** Assign halves at the median publish day. */
export function splitHalves<T extends { day: string }>(rows: T[]): Array<T & { half: 'A' | 'B' }> {
  const days = rows.map((r) => r.day).sort();
  const med = days[Math.floor(days.length / 2)] ?? '';
  return rows.map((r) => ({ ...r, half: r.day < med ? 'A' : 'B' }));
}
export const dropTop = <T extends { R: number }>(rs: T[], k = 5): T[] => [...rs].sort((a, b) => b.R - a.R).slice(k);

// ─── stats ─────────────────────────────────────────────────────────────────
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}
export function spearman(x: number[], y: number[]): number | null {
  if (x.length < 8) return null;
  const rx = ranks(x), ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length, my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? Math.round((n / Math.sqrt(dx * dy)) * 1000) / 1000 : null;
}
export interface Cell { n: number; win: number | null; avgR: number | null }
export const cell = (rs: Array<{ R: number }>): Cell => ({
  n: rs.length,
  win: rs.length ? Math.round((rs.filter((r) => r.R > 0).length / rs.length) * 1000) / 1000 : null,
  avgR: rs.length ? Math.round((rs.reduce((s, r) => s + clipR(r.R), 0) / rs.length) * 1000) / 1000 : null,
});
const rhoOf = (rs: StudyRow[], key: string) => {
  const xs = rs.filter((r) => r.f[key] != null);
  return { n: xs.length, rho: spearman(xs.map((r) => r.f[key] as number), xs.map((r) => clipR(r.R))) };
};
const MIN_RHO = 0.05;
const agree = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a) >= MIN_RHO && Math.abs(b) >= MIN_RHO && Math.sign(a) === Math.sign(b);

export interface NumericAssoc {
  key: string; label: string; n: number;
  A: { n: number; rho: number | null; rhoDrop: number | null }; B: { n: number; rho: number | null; rhoDrop: number | null };
  holdsBoth: boolean;
  tertiles: Array<{ bucket: string; A: Cell; B: Cell }>;
}
export function numericAssoc(rows: StudyRow[], key: string): NumericAssoc {
  const A = rows.filter((r) => r.half === 'A'), B = rows.filter((r) => r.half === 'B');
  const a = rhoOf(A, key), b = rhoOf(B, key), ad = rhoOf(dropTop(A), key), bd = rhoOf(dropTop(B), key);
  const vals = rows.map((r) => r.f[key]).filter((v): v is number => v != null).sort((x, y) => x - y);
  const edges = quantileEdges(vals, 3);
  const tertiles = bucketsOf(edges).map((bk) => ({
    bucket: bk.label,
    A: cell(A.filter((r) => r.f[key] != null && bk.test(r.f[key] as number))),
    B: cell(B.filter((r) => r.f[key] != null && bk.test(r.f[key] as number))),
  }));
  return {
    key, label: FEATURE_LABEL[key] ?? key, n: a.n + b.n,
    A: { n: a.n, rho: a.rho, rhoDrop: ad.rho }, B: { n: b.n, rho: b.rho, rhoDrop: bd.rho },
    holdsBoth: agree(a.rho, b.rho) && agree(ad.rho, bd.rho) && Math.sign(ad.rho!) === Math.sign(a.rho!),
    tertiles,
  };
}

export interface CategoricalAssoc { key: string; label: string; levels: Array<{ level: string; A: Cell; B: Cell; Adrop: Cell; Bdrop: Cell; sameSideBoth: boolean | null }> }
/** Per level: avg R vs the half's book in each half (top 5 removed too). sameSideBoth = above/below book in both halves, n ≥ 10 each. */
export function categoricalAssoc(rows: StudyRow[], key: string): CategoricalAssoc {
  const A = rows.filter((r) => r.half === 'A'), B = rows.filter((r) => r.half === 'B');
  const Ad = dropTop(A), Bd = dropTop(B);
  const bookA = cell(Ad).avgR ?? 0, bookB = cell(Bd).avgR ?? 0;
  const levels = Array.from(new Set(rows.map((r) => r.c[key] ?? '∅'))).sort();
  return {
    key, label: FEATURE_LABEL[key] ?? key,
    levels: levels.map((lv) => {
      const m = (rs: StudyRow[]) => rs.filter((r) => (r.c[key] ?? '∅') === lv);
      const ad = cell(m(Ad)), bd = cell(m(Bd));
      const same = ad.n >= 10 && bd.n >= 10 && ad.avgR != null && bd.avgR != null
        ? Math.sign(ad.avgR - bookA) === Math.sign(bd.avgR - bookB) && Math.sign(ad.avgR - bookA) !== 0 : null;
      return { level: lv, A: cell(m(A)), B: cell(m(B)), Adrop: ad, Bdrop: bd, sameSideBoth: same };
    }),
  };
}

// ─── buckets ───────────────────────────────────────────────────────────────
export function quantileEdges(sorted: number[], k: number): number[] {
  if (!sorted.length) return [];
  const e: number[] = [];
  for (let i = 1; i < k; i++) e.push(sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / k))]);
  return Array.from(new Set(e));
}
export function bucketsOf(edges: number[]): Array<{ label: string; test: (x: number) => boolean; idx: number }> {
  const lo = [-Infinity, ...edges], hi = [...edges, Infinity];
  return lo.map((l, i) => ({
    idx: i,
    label: `${l === -Infinity ? '<' : `${+l.toFixed(2)}–`}${hi[i] === Infinity ? '∞' : +hi[i].toFixed(2)}`,
    test: (x: number) => x >= l && x < hi[i],
  }));
}
export function bucketIndex(edges: number[], x: number): number { let i = 0; while (i < edges.length && x >= edges[i]) i++; return i; }

/** Pool-adjacent-violators: weighted isotonic fit (non-decreasing). */
export function isotonic(ys: number[], ws: number[]): number[] {
  const blocks: Array<{ v: number; w: number; n: number }> = [];
  for (let i = 0; i < ys.length; i++) {
    blocks.push({ v: ys[i], w: Math.max(ws[i], 1e-9), n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
      const b = blocks.pop()!, a = blocks.pop()!;
      blocks.push({ v: (a.v * a.w + b.v * b.w) / (a.w + b.w), w: a.w + b.w, n: a.n + b.n });
    }
  }
  return blocks.flatMap((b) => Array(b.n).fill(b.v));
}

// ─── fit ───────────────────────────────────────────────────────────────────
export const SHRINK_K = 20;
export const POINTS_PER_R = 20;
export interface FeatureTable { key: string; kind: 'numeric' | 'categorical'; sign: 1 | -1 | 0; edges: number[]; levels?: string[]; points: number[]; missing: number; rhoTrain: number | null; nTrain: number }
export interface FittedScore { trainHalf: 'A' | 'B'; tables: FeatureTable[] }

/**
 * Fit on one half: a numeric feature enters when |ρ| ≥ 0.05 on the train half with its top 5
 * removed (n ≥ 30); tertile buckets cut on the train half; bucket mean R shrunk toward the
 * train mean (n ÷ (n + 20)); made monotone in the ρ direction (isotonic); points = (bucket R −
 * worst bucket R) × 20, rounded. A missing value scores the middle bucket. Categorical
 * features: shrunk level mean R vs the train mean, levels with n < 10 score 0.
 */
export function fitScore(train: StudyRow[], numeric: readonly string[], categorical: readonly string[], trainHalf: 'A' | 'B'): FittedScore {
  const tables: FeatureTable[] = [];
  const t5 = dropTop(train);
  const mean = cell(t5).avgR ?? 0;
  for (const key of numeric) {
    const rs = t5.filter((r) => r.f[key] != null);
    if (rs.length < 30) continue;
    const rho = spearman(rs.map((r) => r.f[key] as number), rs.map((r) => clipR(r.R)));
    if (rho == null || Math.abs(rho) < MIN_RHO) continue;
    const sign = rho > 0 ? 1 : -1;
    const edges = quantileEdges(rs.map((r) => r.f[key] as number).sort((a, b) => a - b), 3);
    const nb = edges.length + 1;
    const sums = Array(nb).fill(0), ns = Array(nb).fill(0);
    for (const r of rs) { const i = bucketIndex(edges, r.f[key] as number); sums[i] += clipR(r.R); ns[i]++; }
    const shrunk = sums.map((s, i) => (ns[i] ? mean + ((s / ns[i]) - mean) * (ns[i] / (ns[i] + SHRINK_K)) : mean));
    const ordered = sign > 0 ? shrunk : [...shrunk].reverse();
    const mono = isotonic(ordered, sign > 0 ? ns : [...ns].reverse());
    const fitted = sign > 0 ? mono : [...mono].reverse();
    const lo = Math.min(...fitted);
    const points = fitted.map((v) => Math.round((v - lo) * POINTS_PER_R));
    if (points.every((p) => p === 0)) continue;
    tables.push({ key, kind: 'numeric', sign, edges, points, missing: points[Math.floor(points.length / 2)], rhoTrain: rho, nTrain: rs.length });
  }
  for (const key of categorical) {
    const levels = Array.from(new Set(t5.map((r) => r.c[key] ?? '∅'))).sort();
    const pts = levels.map((lv) => {
      const rs = t5.filter((r) => (r.c[key] ?? '∅') === lv);
      if (rs.length < 10) return 0;
      const m = cell(rs).avgR ?? mean;
      return (m - mean) * (rs.length / (rs.length + SHRINK_K));
    });
    const lo = Math.min(...pts);
    const points = pts.map((p) => Math.round((p - lo) * POINTS_PER_R));
    if (points.every((p) => p === 0)) continue;
    tables.push({ key, kind: 'categorical', sign: 0, edges: [], levels, points, missing: 0, rhoTrain: null, nTrain: t5.length });
  }
  return { trainHalf, tables };
}

export function scoreRow(fit: FittedScore, r: StudyRow): number {
  let s = 0;
  for (const t of fit.tables) {
    if (t.kind === 'numeric') { const v = r.f[t.key]; s += v == null ? t.missing : t.points[bucketIndex(t.edges, v)]; }
    else { const i = t.levels!.indexOf(r.c[t.key] ?? '∅'); s += i >= 0 ? t.points[i] : 0; }
  }
  return s;
}

export interface Ranking { n: number; rho: number | null; rhoDrop: number | null; buckets: Array<{ bucket: string; lo: number; hi: number } & Cell>; topMinusBottomR: number | null }
/** How a score ranks R on a set of rows: Spearman (and with top 5 removed) + decile (quintile when n < 150) win rate / avg R. */
export function ranking(rows: StudyRow[], score: (r: StudyRow) => number | null): Ranking {
  const xs = rows.map((r) => ({ r, s: score(r) })).filter((x): x is { r: StudyRow; s: number } => x.s != null && Number.isFinite(x.s));
  const rho = spearman(xs.map((x) => x.s), xs.map((x) => clipR(x.r.R)));
  const d5 = dropTop(xs.map((x) => ({ ...x, R: x.r.R })));
  const rhoDrop = spearman(d5.map((x) => x.s), d5.map((x) => clipR(x.R)));
  const k = xs.length >= 150 ? 10 : 5;
  const sorted = [...xs].sort((a, b) => a.s - b.s);
  const buckets: Ranking['buckets'] = [];
  for (let i = 0; i < k; i++) {
    const part = sorted.slice(Math.floor((i * sorted.length) / k), Math.floor(((i + 1) * sorted.length) / k));
    if (!part.length) continue;
    buckets.push({ bucket: `${k === 10 ? 'D' : 'Q'}${i + 1}`, lo: part[0].s, hi: part[part.length - 1].s, ...cell(part.map((x) => x.r)) });
  }
  const top = buckets[buckets.length - 1]?.avgR, bot = buckets[0]?.avgR;
  return { n: xs.length, rho, rhoDrop, buckets, topMinusBottomR: top != null && bot != null ? Math.round((top - bot) * 1000) / 1000 : null };
}

export interface CrossFit {
  direction: 'A→B' | 'B→A'; fit: FittedScore;
  test: { fitted: Ranking; currentGrade: Ranking; v3prior: Ranking };
}
export function crossFit(rows: StudyRow[]): CrossFit[] {
  const A = rows.filter((r) => r.half === 'A'), B = rows.filter((r) => r.half === 'B');
  return (['A', 'B'] as const).map((h) => {
    const train = h === 'A' ? A : B, test = h === 'A' ? B : A;
    const fit = fitScore(train, NUMERIC_FEATURES, CATEGORICAL_FEATURES, h);
    return {
      direction: h === 'A' ? 'A→B' : 'B→A', fit,
      test: { fitted: ranking(test, (r) => scoreRow(fit, r)), currentGrade: ranking(test, (r) => r.s.grade), v3prior: ranking(test, (r) => r.s.v3prior) },
    };
  });
}

/**
 * A feature VALIDATES when it is chosen by BOTH fits with the same sign, holds sign in both
 * halves with the top 5 removed, and its own test-half ρ agrees in both directions.
 */
export function validatedFeatures(rows: StudyRow[], fits: CrossFit[], assoc: NumericAssoc[]): string[] {
  const [ab, ba] = fits;
  const out: string[] = [];
  for (const a of assoc) {
    const t1 = ab.fit.tables.find((t) => t.key === a.key), t2 = ba.fit.tables.find((t) => t.key === a.key);
    if (!t1 || !t2 || t1.sign !== t2.sign || !a.holdsBoth) continue;
    const testB = rows.filter((r) => r.half === 'B'), testA = rows.filter((r) => r.half === 'A');
    const rB = rhoOf(testB, a.key).rho, rA = rhoOf(testA, a.key).rho;
    if (rB != null && rA != null && Math.sign(rB) === t1.sign && Math.sign(rA) === t2.sign) out.push(a.key);
  }
  return out;
}

/** Paste-ready V3_VALIDATED entry (shared/nexus-grade.ts) for stop/chase/regime from the pooled fit, scaled into 0..max. */
export function validatedEntry(rows: StudyRow[], key: 'stopAtr' | 'chaseAtr' | 'regime', max: number): { edges: number[]; points: number[]; note: string } | null {
  const fit = fitScore(rows, [key], [], 'A');
  const t = fit.tables[0];
  if (!t) return null;
  const top = Math.max(...t.points);
  if (!(top > 0)) return null;
  const a = numericAssoc(rows, key);
  return { edges: t.edges.map((e) => Math.round(e * 1000) / 1000), points: t.points.map((p) => Math.round((p / top) * max)), note: `validated on the verified book: ρ A ${a.A.rho} / B ${a.B.rho} (top-5 removed ${a.A.rhoDrop} / ${a.B.rhoDrop}), n=${a.n}` };
}

// ─── feature helpers (pure, used by the study main) ────────────────────────
/** Session VWAP from 5m bars of one day up to (and including) the bar containing atMs. */
export function sessionVwap(bars: Array<{ t: number; h: number; l: number; c: number; v: number }>, atMs: number): number | null {
  let pv = 0, vv = 0;
  for (const b of bars) { if (b.t > atMs) break; const tp = (b.h + b.l + b.c) / 3; pv += tp * (b.v || 0); vv += b.v || 0; }
  return vv > 0 ? pv / vv : null;
}
/** Room to the opposing GEX wall in ATRs (long: call wall above; short: put wall below). Negative = already through it. */
export function gexRoomAtr(dir: 'long' | 'short', entry: number, callWall: number | null, putWall: number | null, atr: number | null): number | null {
  if (atr == null || !(atr > 0) || !(entry > 0)) return null;
  const wall = dir === 'long' ? callWall : putWall;
  if (wall == null || !(wall > 0)) return null;
  return Math.round(((dir === 'long' ? wall - entry : entry - wall) / atr) * 1000) / 1000;
}
/** log2(DTE in trading days ÷ planned hold in trading days); null for non-options. */
export function dteFit(dteCalendarDays: number | null, plannedHoldTradingDays: number): number | null {
  if (dteCalendarDays == null || !(plannedHoldTradingDays > 0)) return null;
  const tradingDte = Math.max(0.2, (dteCalendarDays * 5) / 7);
  return Math.round(Math.log2(tradingDte / plannedHoldTradingDays) * 1000) / 1000;
}
/** Planned hold in trading days from the holding period alone (no expiry cap). */
export function plannedHoldDays(holdingPeriod: string | null | undefined): number {
  const hp = String(holdingPeriod ?? '').toLowerCase();
  return hp.includes('position') || hp.includes('long') ? 10 : hp.includes('week') || hp.includes('swing') ? 5 : hp.includes('day') || hp.includes('scalp') || hp.includes('intraday') ? 1 : 5;
}
