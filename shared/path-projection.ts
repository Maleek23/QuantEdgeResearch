/**
 * PATH PROJECTION — the "Path" overlay engine (research/skylit-teardown/REPORT.md §3).
 *
 * A MODELLED SCENARIO, NOT A FORECAST. Monte-Carlo of price over the chosen
 * horizon on a 5-minute RTH grid:
 *
 *   dx = −∇U(x)·λ(regime)·dt  +  σ(t)·mult(x)·skew(dW)·dW   (+ event / overnight steps)
 *
 *   σ(t)     per-session 1σ $ move from the options market (ATM straddle / IV),
 *            spread across the session by an intraday variance curve measured
 *            from our own 5-min bars (U-shape fallback); an overnight share is
 *            paid as one step at each open the horizon crosses.
 *   −∇U      positive-GEX nodes attract (Gaussian wells, width ∝ session σ),
 *            weight ∝ |GEX| / max, delivered nodes (already traded through
 *            this session) at half weight. λ = 0 in short gamma — no pull.
 *            The pull per step is capped at 0.35 × that step's σ.
 *   mult(x)  negative-GEX nodes raise local vol near them (≤ 1.6×), no pull.
 *   skew     downside shocks × (1+s), upside × (1−s); s from 25Δ put vs call IV.
 *   events   a priced event adds one N(0, σ_event²) step at its time.
 *
 * Pure and deterministic for a given seed (mulberry32) — scripts/test-chart-v3.ts.
 */

export type PathHorizon = 'session' | 'tomorrow' | 'week' | 'opex';
export const PATH_HORIZONS: PathHorizon[] = ['session', 'tomorrow', 'week', 'opex'];
export const PATH_HORIZON_LABEL: Record<PathHorizon, string> = { session: 'Session', tomorrow: 'Tomorrow', week: 'Week', opex: 'OpEx' };
export const PATH_DISCLAIMER = 'modelled scenario, not a forecast';

export function parsePathHorizon(v: unknown): PathHorizon {
  const s = String(v ?? '').toLowerCase();
  return (PATH_HORIZONS as string[]).includes(s) ? (s as PathHorizon) : 'session';
}

/* ── ET calendar helpers (holidays NOT excluded — stated in the payload note) ── */
const RTH_OPEN = 570; const RTH_CLOSE = 960; const SLOTS = 78; // 5-min slots per session
const fmtET = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  : null;
export function etParts(ms: number): { date: string; min: number } {
  const p = fmtET!.formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '0';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, min: (Number(v('hour')) % 24) * 60 + Number(v('minute')) };
}
/** UTC ms of ET wall time `min` minutes after midnight on `date`. */
export function etInstant(date: string, min: number): number {
  const [y, m, d] = date.split('-').map(Number);
  for (const off of [4, 5]) {
    const t = Date.UTC(y, m - 1, d, 0, 0) + (min + off * 60) * 60_000;
    const p = etParts(t);
    if (p.date === date && p.min === min) return t;
  }
  return Date.UTC(y, m - 1, d, 0, 0) + (min + 300) * 60_000;
}
const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const isWeekday = (iso: string) => { const w = dow(iso); return w >= 1 && w <= 5; };
function thirdFriday(iso: string): string { const first = `${iso.slice(0, 7)}-01`; return addDays(first, ((5 - dow(first) + 7) % 7) + 14); }

/** Session dates (ET) the horizon covers, starting with the current/next session. */
export function horizonSessions(h: PathHorizon, nowMs: number): string[] {
  const { date, min } = etParts(nowMs);
  let s0 = date;
  if (!isWeekday(s0) || min >= RTH_CLOSE) { s0 = addDays(s0, 1); while (!isWeekday(s0)) s0 = addDays(s0, 1); }
  const next = (d: string) => { let x = addDays(d, 1); while (!isWeekday(x)) x = addDays(x, 1); return x; };
  if (h === 'session') return [s0];
  if (h === 'tomorrow') return [s0, next(s0)];
  let end = h === 'week' ? addDays(s0, 5 - dow(s0)) : thirdFriday(s0);
  if (h === 'opex' && end < s0) { const [y, m] = s0.split('-').map(Number); end = thirdFriday(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)); }
  const out = [s0];
  while (out.length < 40) { const n = next(out[out.length - 1]); if (n > end) break; out.push(n); }
  return out;
}

/* ── intraday variance curve ── */
/** U-shape fallback: heavy open, quiet lunch, heavier close (sums to 1). */
export function defaultVarianceCurve(): number[] {
  const w = Array.from({ length: SLOTS }, (_, i) => { const u = i / (SLOTS - 1); return 0.55 + 2.2 * Math.exp(-u * 9) + 0.9 * Math.exp(-(1 - u) * 7); });
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
/** Mean squared 5-min log return per RTH slot from bars (time = epoch seconds), smoothed, sums to 1.
 *  Needs ≥ 3 sessions of consecutive 5-min bars, else the U-shape fallback. */
export function varianceCurveFromBars(bars: { time: number; close: number }[]): { weights: number[]; sessions: number; source: 'bars' | 'fallback' } {
  const sum = new Float64Array(SLOTS); const cnt = new Float64Array(SLOTS); const days = new Set<string>();
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1]; const b = bars[i];
    if (!(a.close > 0 && b.close > 0) || b.time - a.time !== 300) continue;
    const p = etParts(b.time * 1000);
    if (p.min <= RTH_OPEN || p.min > RTH_CLOSE) continue;
    const slot = Math.min(SLOTS - 1, Math.floor((p.min - RTH_OPEN - 1) / 5));
    const r = Math.log(b.close / a.close);
    sum[slot] += r * r; cnt[slot] += 1; days.add(p.date);
  }
  if (days.size < 3) return { weights: defaultVarianceCurve(), sessions: days.size, source: 'fallback' };
  const raw = Array.from({ length: SLOTS }, (_, i) => (cnt[i] ? sum[i] / cnt[i] : NaN));
  const fb = defaultVarianceCurve(); const meanRaw = raw.filter(Number.isFinite).reduce((a, b) => a + b, 0) / Math.max(1, raw.filter(Number.isFinite).length);
  const filled = raw.map((v, i) => (Number.isFinite(v) ? v : fb[i] * SLOTS * meanRaw));
  const sm = filled.map((_, i) => { let s = 0; let n = 0; for (let k = -1; k <= 1; k++) { const j = i + k; if (j >= 0 && j < SLOTS) { s += filled[j]; n++; } } return s / n; });
  const tot = sm.reduce((a, b) => a + b, 0);
  return { weights: tot > 0 ? sm.map((x) => x / tot) : fb, sessions: days.size, source: 'bars' };
}

/* ── inputs / outputs ── */
export interface PathNode { strike: number; gex: number; delivered?: boolean }
export interface PathLevel { name: string; price: number }
export interface PathEvent { atMs: number; move: number; label: string }
export interface PathInput {
  spot: number;
  nowMs: number;
  horizon: PathHorizon;
  /** 1σ $ move for one full session (options-implied). */
  sessionMove: number;
  /** 78 RTH 5-min weights summing to 1. */
  varianceCurve?: number[];
  /** Share of a session's variance paid overnight (gap step). Default 0.2. */
  overnightShare?: number;
  /** Net GEX sign of the horizon's book: long gamma = attractors on. */
  regime: 'long' | 'short' | 'neutral';
  nodes: PathNode[];
  /** −0.25..0.25: + = puts richer (downside shocks larger). */
  skew?: number;
  events?: PathEvent[];
  levels?: PathLevel[];
  paths?: number;
  seed?: number;
  /** Output points (downsampled). Default 160. */
  maxPoints?: number;
}
export interface PathLevelStat { name: string; price: number; side: 'above' | 'below'; touch: number; stop: number }
export interface PathBadge { kind: 'gatekeeper' | 'rug' | 'trampoline'; price: number; text: string }
export interface PathResult {
  spot: number; horizon: PathHorizon; startMs: number; endMs: number; sessions: string[]; paths: number;
  /** t (ms), then quantile prices p10 p25 p50 p75 p90. */
  points: { t: number; p10: number; p25: number; p50: number; p75: number; p90: number }[];
  terminal: { lo: number; hi: number; bins: number[] };
  levels: PathLevelStat[];
  apex: number | null;
  gatekeeper: PathLevelStat | null;
  badges: PathBadge[];
  lambda: number;
  terminalSd: number;
}

/** Deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(rnd: () => number): number { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }

interface Step { t: number; varShare: number; event?: number }
/** The simulation grid: one step per remaining 5-min RTH slot, an overnight step at each crossed open, event steps. */
export function buildSteps(nowMs: number, sessions: string[], curve: number[], overnightShare: number, events: PathEvent[] = []): Step[] {
  const steps: Step[] = [];
  const intraShare = 1 - overnightShare;
  sessions.forEach((d, si) => {
    const open = etInstant(d, RTH_OPEN);
    if (nowMs < open) steps.push({ t: open, varShare: overnightShare * (si === 0 ? Math.min(1, (open - nowMs) / (17.5 * 3_600_000)) : 1) });
    for (let k = 0; k < SLOTS; k++) {
      const t = open + (k + 1) * 300_000;
      if (t <= nowMs) continue;
      const startK = open + k * 300_000;
      const frac = nowMs > startK ? (t - nowMs) / 300_000 : 1;
      steps.push({ t, varShare: intraShare * curve[k] * frac });
    }
  });
  for (const e of events) {
    if (!(e.move > 0)) continue;
    const s = steps.find((x) => x.t >= e.atMs);
    if (s) s.event = Math.hypot(s.event ?? 0, e.move);
  }
  return steps;
}

const q = (sorted: Float64Array, p: number) => { const i = (sorted.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

export function simulatePath(inp: PathInput): PathResult {
  const N = Math.max(100, Math.min(10_000, inp.paths ?? 2000));
  const sessions = horizonSessions(inp.horizon, inp.nowMs);
  const curve = inp.varianceCurve?.length === SLOTS ? inp.varianceCurve : defaultVarianceCurve();
  const steps = buildSteps(inp.nowMs, sessions, curve, inp.overnightShare ?? 0.2, inp.events);
  const S = inp.sessionMove;
  const h = Math.max(S * 0.35, inp.spot * 1e-4);
  const pos = inp.nodes.filter((n) => n.gex > 0); const neg = inp.nodes.filter((n) => n.gex < 0);
  const maxAbs = Math.max(1e-12, ...inp.nodes.map((n) => Math.abs(n.gex)));
  const wPos = pos.map((n) => (n.gex / maxAbs) * (n.delivered ? 0.5 : 1));
  const wNeg = neg.map((n) => (-n.gex / maxAbs) * (n.delivered ? 0.5 : 1));
  const lambda = inp.regime === 'long' ? 0.12 : 0; // λ = 0 in short gamma (and neutral)
  const s = Math.max(-0.25, Math.min(0.25, inp.skew ?? 0));
  const levels = (inp.levels ?? []).filter((l) => l.price > 0 && Math.abs(l.price - inp.spot) > 1e-9);
  const tol = S * 0.12;
  const touched = levels.map(() => new Uint8Array(N)); const near = levels.map(() => new Uint8Array(N));
  const rnd = mulberry32(inp.seed ?? 1);
  const x = new Float64Array(N).fill(inp.spot);
  const maxPts = Math.max(8, inp.maxPoints ?? 160);
  const every = Math.max(1, Math.ceil(steps.length / maxPts));
  const points: PathResult['points'] = [{ t: inp.nowMs, p10: inp.spot, p25: inp.spot, p50: inp.spot, p75: inp.spot, p90: inp.spot }];
  const buf = new Float64Array(N);
  steps.forEach((st, si) => {
    const sd = S * Math.sqrt(st.varShare);
    for (let p = 0; p < N; p++) {
      let xi = x[p];
      let pull = 0;
      if (lambda > 0) {
        for (let k = 0; k < pos.length; k++) { const d = pos[k].strike - xi; pull += wPos[k] * d * Math.exp(-(d * d) / (2 * h * h)); }
        pull *= lambda * Math.min(1, st.varShare * SLOTS);
        const cap = 0.35 * sd; if (pull > cap) pull = cap; else if (pull < -cap) pull = -cap;
      }
      let mult = 1;
      for (let k = 0; k < neg.length; k++) { const d = neg[k].strike - xi; mult += 0.5 * wNeg[k] * Math.exp(-(d * d) / (2 * h * h)); }
      if (mult > 1.6) mult = 1.6;
      const z = gauss(rnd);
      let dx = pull + sd * mult * z * (z < 0 ? 1 + s : 1 - s);
      if (st.event) dx += st.event * gauss(rnd);
      const prev = xi; xi += dx; x[p] = xi;
      for (let l = 0; l < levels.length; l++) {
        if (touched[l][p]) continue;
        const L = levels[l].price; const above = L > inp.spot;
        if ((above && (xi >= L || prev >= L)) || (!above && (xi <= L || prev <= L))) touched[l][p] = 1;
        else if (Math.abs(L - xi) <= tol) near[l][p] = 1;
      }
    }
    if ((si + 1) % every === 0 || si === steps.length - 1) {
      buf.set(x); buf.sort();
      points.push({ t: st.t, p10: q(buf, 0.1), p25: q(buf, 0.25), p50: q(buf, 0.5), p75: q(buf, 0.75), p90: q(buf, 0.9) });
    }
  });
  buf.set(x); buf.sort();
  const lo = q(buf, 0.01); const hi = q(buf, 0.99); const NB = 40;
  const bins = new Array(NB).fill(0);
  for (let p = 0; p < N; p++) { const b = Math.floor(((x[p] - lo) / Math.max(1e-9, hi - lo)) * NB); if (b >= 0 && b < NB) bins[b]++; }
  const mean = x.reduce((a, b) => a + b, 0) / N;
  const terminalSd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
  const stats: PathLevelStat[] = levels.map((l, i) => {
    let t = 0; let st = 0;
    for (let p = 0; p < N; p++) { if (touched[i][p]) t++; else if (near[i][p]) st++; }
    return { name: l.name, price: l.price, side: l.price > inp.spot ? 'above' : 'below', touch: t / N, stop: st / N };
  });
  const apexNode = pos.length ? pos.reduce((a, b) => (b.gex > a.gex ? b : a)) : null;
  const apex = apexNode?.strike ?? null;
  let gatekeeper: PathLevelStat | null = null;
  if (apex != null) {
    for (const l of stats) {
      const between = apex > inp.spot ? l.price > inp.spot && l.price < apex : l.price < inp.spot && l.price > apex;
      if (between && l.stop > 0 && (!gatekeeper || l.stop > gatekeeper.stop)) gatekeeper = l;
    }
  }
  const badges: PathBadge[] = [];
  if (gatekeeper) badges.push({ kind: 'gatekeeper', price: gatekeeper.price, text: `Gatekeeper ${fmtP(gatekeeper.price)} · stop ${pct(gatekeeper.stop)}` });
  badges.push(...structureBadges(inp.spot, inp.nodes));
  return {
    spot: inp.spot, horizon: inp.horizon, startMs: inp.nowMs, endMs: steps.length ? steps[steps.length - 1].t : inp.nowMs, sessions, paths: N,
    points, terminal: { lo, hi, bins }, levels: stats, apex, gatekeeper, badges, lambda, terminalSd,
  };
}

/** Rug: below price, a positive node sitting directly over a larger negative one (a floor that can give way
 *  into acceleration). Trampoline: below price, a negative node over a larger positive one (a fast drop into
 *  a strong floor). Our definitions — structural, not signals. */
export function structureBadges(spot: number, nodes: PathNode[]): PathBadge[] {
  const below = nodes.filter((n) => n.strike < spot).sort((a, b) => b.strike - a.strike).slice(0, 6);
  const out: PathBadge[] = [];
  for (let i = 0; i + 1 < below.length; i++) {
    const a = below[i]; const b = below[i + 1];
    if (a.gex > 0 && b.gex < 0 && Math.abs(b.gex) > a.gex) { out.push({ kind: 'rug', price: a.strike, text: `Rug ${fmtP(a.strike)} → ${fmtP(b.strike)}` }); break; }
  }
  for (let i = 0; i + 1 < below.length; i++) {
    const a = below[i]; const b = below[i + 1];
    if (a.gex < 0 && b.gex > 0 && b.gex > Math.abs(a.gex)) { out.push({ kind: 'trampoline', price: b.strike, text: `Trampoline ${fmtP(b.strike)}` }); break; }
  }
  return out;
}

const fmtP = (p: number) => (p >= 100 ? p.toFixed(0) : p.toFixed(2));
const pct = (v: number) => `${Math.round(v * 100)}%`;
export const fmtPathPct = pct;

/** Range + probabilities at a hover time: linear between output points. Pure. */
export function pathAt(r: Pick<PathResult, 'points'>, t: number) {
  const pts = r.points;
  if (!pts.length || t < pts[0].t) return null;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1];
  let i = 1; while (i < pts.length && pts[i].t < t) i++;
  const a = pts[i - 1]; const b = pts[i]; const f = (t - a.t) / Math.max(1, b.t - a.t);
  const m = (k: 'p10' | 'p25' | 'p50' | 'p75' | 'p90') => a[k] + (b[k] - a[k]) * f;
  return { t, p10: m('p10'), p25: m('p25'), p50: m('p50'), p75: m('p75'), p90: m('p90') };
}

/** Realized vs frozen: share of realized closes inside the 50% / 80% fans at the matching times. Pure. */
export function scoreRealized(r: Pick<PathResult, 'points'>, realized: { t: number; price: number }[]) {
  let n = 0; let in50 = 0; let in80 = 0;
  for (const x of realized) {
    const v = pathAt(r, x.t); if (!v || x.t <= r.points[0].t) continue;
    n++; if (x.price >= v.p25 && x.price <= v.p75) in50++; if (x.price >= v.p10 && x.price <= v.p90) in80++;
  }
  return { n, in50: n ? in50 / n : null, in80: n ? in80 / n : null };
}

/** RTH trading milliseconds between two instants (weekdays 09:30–16:00 ET; holidays not excluded). Pure. */
export function tradingMsBetween(a: number, b: number): number {
  if (!(b > a)) return 0;
  let total = 0;
  let d = etParts(a).date;
  const end = etParts(b).date;
  for (let i = 0; i < 400 && d <= end; i++) {
    if (isWeekday(d)) {
      const o = etInstant(d, RTH_OPEN); const c = etInstant(d, RTH_CLOSE);
      total += Math.max(0, Math.min(b, c) - Math.max(a, o));
    }
    d = addDays(d, 1);
  }
  return total;
}

/** Re-anchor a computed result to the live price (a pure translation of the fans and the terminal
 *  density; level odds are left as computed). Only for small gaps (≤ maxPct of spot) — a larger gap
 *  means the model read is stale and should be recomputed, not shifted. Pure. */
export function reanchorPath(r: PathResult, live: number | null | undefined, maxPct = 0.02): { result: PathResult; shifted: number } {
  if (live == null || !(live > 0) || !(r.spot > 0)) return { result: r, shifted: 0 };
  const d = live - r.spot;
  if (d === 0 || Math.abs(d) / r.spot > maxPct) return { result: r, shifted: 0 };
  return {
    shifted: d,
    result: {
      ...r, spot: live,
      points: r.points.map((p) => ({ t: p.t, p10: p.p10 + d, p25: p.p25 + d, p50: p.p50 + d, p75: p.p75 + d, p90: p.p90 + d })),
      terminal: { ...r.terminal, lo: r.terminal.lo + d, hi: r.terminal.hi + d },
    },
  };
}
