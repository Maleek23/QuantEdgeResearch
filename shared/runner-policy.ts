/**
 * RUNNER EXIT POLICY (0DTE ideas + the bot's 0DTE sleeve) — one pure, tick-driven
 * state machine used by the replay (research/runner-replay.ts, option bars), the
 * after-close / intraday idea runner pass (server/option-peak-job.ts) and the bot
 * (server/quant-bot.ts step 2a, live quotes). No I/O.
 *
 *   stage 'full'    first of: stop (underlying stop, or the bot's −40% premium stop)
 *                   → all out · 15:45 ET flatten → all out ·
 *                   T1 (underlying T1, or +50% premium) → SELL HALF ("T1 half") and
 *                   move the rest's stop to breakeven (entry premium).
 *   stage 'runner'  the other half exits on the first of:
 *                     trail  — premium gives back RUNNER_TRAIL_PCT (default 25%) from
 *                              its peak since entry (never below breakeven)
 *                     VWAP   — the underlying closes back through session VWAP
 *                     T2     — underlying T2 when the plan has one, or +100% premium
 *                     15:45  — hard flatten
 *
 * mode 'all_out' is the comparison: the published plan (stop / T1 / 15:45), all out.
 *
 * Fill conventions (conservative, identical across modes):
 *   · a tick is one bar (hi/lo/close of the CONTRACT, hi/lo/close of the underlying)
 *     or one quote (hi = lo = close = mark);
 *   · stop before target inside one tick; the T1 tick does not also run the
 *     runner's exits (the runner starts on the next tick);
 *   · an underlying-triggered exit fills at the contract's tick close (the touch-bar
 *     convention of shared/option-exit-pricing.ts); a premium level fills at the
 *     level, or at the tick open when it opened through it.
 *
 * Outcome record (ideas): the T1 outcome stays a win; exit_premium becomes the
 * BLENDED premium (frac-weighted mean of the legs) and the T1-touch premium is kept
 * as its own field (convergence_signals_json.runner.t1ExitPremium) and in the note.
 */

export type RunnerMode = 'runner' | 'all_out';

export interface RunnerConfig {
  on: boolean;
  /** Give-back from the runner's peak premium, 0–1 (RUNNER_TRAIL_PCT, default 25). */
  trailPct: number;
  /** Premium gain that counts as T1 for the partial, 0–1 (default 0.5 = +50%). */
  t1PremPct: number;
  /** Premium gain that closes the runner, 0–1 (default 1.0 = +100%). */
  t2PremPct: number;
  /** ET minute of the hard flatten (default 15:45). */
  flattenEt: number;
  /** Exit the runner when the underlying closes back through session VWAP. */
  vwapExit: boolean;
  /** Fraction sold at T1 (default 0.5). */
  partialFrac: number;
}

/**
 * Default when RUNNER_POLICY is unset. research/runner-replay.ts (2026-10-07, last
 * 20 sessions of 0DTE ideas, both halves) decides it — see docs/RUNNER_REPLAY_2026-10-07.md.
 */
export const RUNNER_POLICY_DEFAULT_ON = false;

type Env = Record<string, string | undefined>;
const num = (v: string | undefined, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function readRunnerPolicy(env: Env = {}, defaultOn = RUNNER_POLICY_DEFAULT_ON): RunnerConfig {
  const raw = String(env.RUNNER_POLICY ?? '').trim().toLowerCase();
  const on = raw === 'on' || raw === '1' || raw === 'true' ? true : raw === 'off' || raw === '0' || raw === 'false' ? false : defaultOn;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(env.BOT_0DTE_FLATTEN_ET ?? '').trim());
  return {
    on,
    trailPct: num(env.RUNNER_TRAIL_PCT, 25, 5, 90) / 100,
    t1PremPct: num(env.BOT_0DTE_T1_PCT, 50, 5, 500) / 100,
    t2PremPct: num(env.BOT_0DTE_T2_PCT, 100, 10, 1_000) / 100,
    flattenEt: m ? Number(m[1]) * 60 + Number(m[2]) : 15 * 60 + 45,
    vwapExit: env.RUNNER_VWAP_EXIT !== 'off',
    partialFrac: 0.5,
  };
}

/** Runner applies to 0DTE-sleeve kinds only (shared/bot-sleeves zeroDteKindOf) — never swings. */
export function runnerAppliesTo(kind: string | null | undefined, cfg: Pick<RunnerConfig, 'on'>): boolean {
  return cfg.on && !!kind;
}

export interface RunnerPlan {
  /** Underlying thesis: a bought put is 'short'. */
  dir: 'long' | 'short';
  entryPremium: number;
  uStop?: number | null;
  uT1?: number | null;
  uT2?: number | null;
  /** Bot: premium stop as a fraction (0.4 = −40%). Ideas use the underlying stop. */
  premStopPct?: number | null;
  /** Use the +T1 premium gain as a T1 trigger too (runner mode). Default true. */
  premT1?: boolean;
}

export interface RunnerTick {
  t: number;
  etMin: number;
  pO?: number | null; pH: number | null; pL: number | null; pC: number | null;
  uH?: number | null; uL?: number | null; uC?: number | null;
  vwap?: number | null;
}

export interface RunnerLeg { frac: number; premium: number; atMs: number; why: string }

export interface RunnerState {
  stage: 'full' | 'runner' | 'closed';
  legs: RunnerLeg[];
  /** Runner premium stop (entry once armed). */
  stop: number | null;
  peak: number;
  peakAtMs: number | null;
  rem: number;
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function runnerInit(plan: RunnerPlan): RunnerState {
  return { stage: 'full', legs: [], stop: null, peak: plan.entryPremium, peakAtMs: null, rem: 1 };
}

function close(s: RunnerState, frac: number, premium: number, atMs: number, why: string): RunnerState {
  const f = Math.min(frac, s.rem);
  const legs = f > 1e-9 ? [...s.legs, { frac: f, premium: r4(Math.max(0, premium)), atMs, why }] : s.legs;
  const rem = s.rem - f;
  return { ...s, legs, rem, stage: rem <= 1e-9 ? 'closed' : s.stage };
}

/** One tick. Pure: returns the next state (unchanged object when nothing happens except the peak). */
export function runnerStep(s0: RunnerState, k: RunnerTick, plan: RunnerPlan, cfg: RunnerConfig, mode: RunnerMode): RunnerState {
  if (s0.stage === 'closed') return s0;
  const E = plan.entryPremium;
  const L = plan.dir === 'long';
  const pC = fin(k.pC) ? k.pC : null;
  // A tick without its own contract print (carried close) cannot fire premium levels.
  const pH = fin(k.pH) ? k.pH : null;
  const pL = fin(k.pL) ? k.pL : null;
  const pO = fin(k.pO) ? k.pO : null;
  let s = s0;

  if (s.stage === 'full') {
    // 1 · stops
    const uStopHit = fin(plan.uStop) && (L ? fin(k.uL) && k.uL <= plan.uStop : fin(k.uH) && k.uH >= plan.uStop);
    if (uStopHit && pC != null) return close(s, s.rem, pC, k.t, 'stop');
    if (fin(plan.premStopPct) && pL != null) {
      const lvl = E * (1 - plan.premStopPct);
      if (pL <= lvl) return close(s, s.rem, pO != null && pO < lvl ? pO : lvl, k.t, 'premium stop');
    }
    // 2 · flatten
    if (k.etMin >= cfg.flattenEt && pC != null) return close(s, s.rem, pC, k.t, '15:45 flatten');
    // 3 · T1
    const uT1Hit = fin(plan.uT1) && (L ? fin(k.uH) && k.uH >= plan.uT1 : fin(k.uL) && k.uL <= plan.uT1);
    const premLvl = E * (1 + cfg.t1PremPct);
    const premT1Hit = mode === 'runner' && plan.premT1 !== false && pH != null && pH >= premLvl;
    if (uT1Hit || premT1Hit) {
      let px: number | null;
      let why: string;
      if (premT1Hit) { px = pO != null && pO > premLvl ? pO : premLvl; why = uT1Hit ? 'T1' : `+${Math.round(cfg.t1PremPct * 100)}%`; }
      else { px = pC; why = 'T1'; }
      if (px == null) return s;
      if (mode === 'all_out') return close(s, s.rem, px, k.t, why);
      s = close(s, cfg.partialFrac, px, k.t, `${why} half`);
      return { ...s, stage: s.rem > 1e-9 ? 'runner' : 'closed', stop: E, peak: Math.max(s.peak, pH ?? 0), peakAtMs: pH != null && pH > s.peak ? k.t : s.peakAtMs ?? k.t };
    }
    if (pH != null && pH > s.peak) s = { ...s, peak: pH, peakAtMs: k.t };
    return s;
  }

  // stage 'runner' — levels from the peak BEFORE this tick
  const trail = Math.max(s.stop ?? E, s.peak * (1 - cfg.trailPct));
  if (pL != null && pL <= trail) {
    const px = pO != null && pO < trail ? pO : trail;
    return close(s, s.rem, px, k.t, trail <= (s.stop ?? E) + 1e-9 ? 'breakeven' : `trail ${Math.round(cfg.trailPct * 100)}% from peak`);
  }
  const t2Lvl = E * (1 + cfg.t2PremPct);
  if (pH != null && pH >= t2Lvl) return close(s, s.rem, pO != null && pO > t2Lvl ? pO : t2Lvl, k.t, `+${Math.round(cfg.t2PremPct * 100)}%`);
  const uT2Hit = fin(plan.uT2) && (L ? fin(k.uH) && k.uH >= plan.uT2 : fin(k.uL) && k.uL <= plan.uT2);
  if (uT2Hit && pC != null) return close(s, s.rem, pC, k.t, 'T2');
  if (cfg.vwapExit && fin(k.vwap) && fin(k.uC) && pC != null && (L ? k.uC < k.vwap : k.uC > k.vwap)) return close(s, s.rem, pC, k.t, 'back through VWAP');
  if (k.etMin >= cfg.flattenEt && pC != null) return close(s, s.rem, pC, k.t, '15:45 flatten');
  if (pH != null && pH > s.peak) s = { ...s, peak: pH, peakAtMs: k.t };
  return s;
}

/** Run a whole tick path. `endFill` closes what is left at the last tick's close ('data end'). */
/** Resume a runner whose T1 half is already booked (live idea pass / bot restart). */
export function runnerResume(plan: RunnerPlan, t1: { premium: number; atMs: number; why?: string }, cfg: Pick<RunnerConfig, 'partialFrac'>, peak?: { premium: number; atMs: number } | null): RunnerState {
  const pk = peak && peak.premium > t1.premium ? peak : { premium: t1.premium, atMs: t1.atMs };
  return {
    stage: 'runner', legs: [{ frac: cfg.partialFrac, premium: r4(t1.premium), atMs: t1.atMs, why: `${t1.why ?? 'T1'} half` }],
    stop: plan.entryPremium, peak: Math.max(pk.premium, plan.entryPremium), peakAtMs: pk.atMs, rem: 1 - cfg.partialFrac,
  };
}

/** A quote tick: hi = lo = open = close = the mark. */
export function quoteTick(t: number, etMin: number, mark: number, u?: { price?: number | null; vwap?: number | null }): RunnerTick {
  const up = u?.price ?? null;
  return { t, etMin, pO: mark, pH: mark, pL: mark, pC: mark, uH: up, uL: up, uC: up, vwap: u?.vwap ?? null };
}

export function runnerPath(ticks: RunnerTick[], plan: RunnerPlan, cfg: RunnerConfig, mode: RunnerMode, opts: { endFill?: boolean; from?: RunnerState } = {}): RunnerState {
  let s = opts.from ?? runnerInit(plan);
  for (const k of ticks) {
    s = runnerStep(s, k, plan, cfg, mode);
    if (s.stage === 'closed') break;
  }
  if (s.stage !== 'closed' && opts.endFill) {
    const last = [...ticks].reverse().find((k) => fin(k.pC));
    if (last) s = close(s, s.rem, last.pC!, last.t, 'data end');
  }
  return s;
}

export interface RunnerSummary {
  closed: boolean;
  /** Frac-weighted premium of the closed legs (null while any part is open). */
  blendedPremium: number | null;
  /** The first leg when it was the T1 partial — its own field, for honesty. */
  t1ExitPremium: number | null;
  t1AtMs: number | null;
  runnerExitPremium: number | null;
  runnerAtMs: number | null;
  runnerWhy: string | null;
  legs: RunnerLeg[];
}

export function summarizeRunner(s: RunnerState): RunnerSummary {
  const t1 = s.legs.length && / half$/.test(s.legs[0].why) ? s.legs[0] : null;
  const runner = t1 && s.legs.length > 1 ? s.legs[s.legs.length - 1] : null;
  const closed = s.stage === 'closed';
  const blended = closed ? r4(s.legs.reduce((a, l) => a + l.frac * l.premium, 0) / Math.max(1e-9, s.legs.reduce((a, l) => a + l.frac, 0))) : null;
  return {
    closed, blendedPremium: blended,
    t1ExitPremium: t1?.premium ?? null, t1AtMs: t1?.atMs ?? null,
    runnerExitPremium: runner?.premium ?? null, runnerAtMs: runner?.atMs ?? null, runnerWhy: runner?.why ?? null,
    legs: s.legs,
  };
}

/** Session VWAP per bar (cumulative typical price × volume from the first bar given). NaN until volume prints. */
export function sessionVwap(bars: Array<{ h: number; l: number; c: number; v?: number | null }>): number[] {
  let pv = 0, vv = 0;
  return bars.map((b) => {
    const v = fin(b.v) && b.v > 0 ? b.v : 0;
    pv += ((b.h + b.l + b.c) / 3) * v; vv += v;
    return vv > 0 ? pv / vv : NaN;
  });
}

export interface TickBar { t: number; o: number; h: number; l: number; c: number; v?: number | null }

/**
 * Ticks on the UNDERLYING's bar grid from the first bar starting at/after `entryMs`
 * to `endMs`. Contract bars are bucketed into each underlying bar's width; a bucket
 * with no contract print carries the last print forward as close only (hi/lo/open
 * unknown → premium-level exits cannot fire on it). VWAP is cumulative from
 * `sessionOpenMs` (09:30 ET) through each bar. `etMinOf` maps a bar start to its ET minute.
 */
export function buildRunnerTicks(opt: TickBar[], und: TickBar[], entryMs: number, endMs: number, sessionOpenMs: number, etMinOf: (ms: number) => number): RunnerTick[] {
  const u = und.filter((b) => fin(b.t) && b.t >= sessionOpenMs && b.t < endMs).sort((a, b) => a.t - b.t);
  if (!u.length) return [];
  const widths = u.slice(1, 40).map((b, i) => b.t - u[i].t).filter((d) => d > 0).sort((a, b) => a - b);
  const w = widths[0] ?? 60_000;
  const vw = sessionVwap(u);
  const o = opt.filter((b) => fin(b.t) && b.h > 0).sort((a, b) => a.t - b.t);
  const out: RunnerTick[] = [];
  let j = 0;
  let last: number | null = null;
  for (const b of o) { if (b.t < u[0].t) last = b.c; else break; }
  for (let i = 0; i < u.length; i++) {
    const ub = u[i];
    let oo: number | null = null, hh = -Infinity, ll = Infinity, cc: number | null = null;
    while (j < o.length && o[j].t < ub.t) { last = o[j].c; j++; }
    while (j < o.length && o[j].t < ub.t + w) {
      const x = o[j];
      if (oo == null) oo = x.o;
      hh = Math.max(hh, x.h); ll = Math.min(ll, x.l); cc = x.c; j++;
    }
    if (cc != null) last = cc;
    if (ub.t < entryMs) continue;
    out.push({
      t: ub.t, etMin: etMinOf(ub.t),
      pO: oo, pH: cc != null ? hh : null, pL: cc != null ? ll : null, pC: cc ?? last,
      uH: ub.h, uL: ub.l, uC: ub.c, vwap: Number.isFinite(vw[i]) ? vw[i] : null,
    });
  }
  return out;
}

// ── bot: one live-quote decision for a 0DTE-sleeve position ─────────────────

export type BotRunnerAction = 'flatten' | 'stop' | 'target' | 'partial' | 'arm_runner' | 'trail' | 'breakeven_stop' | 'vwap_exit' | 'hold';

/**
 * The runner policy on a LIVE mark (two clips): before T1 the sleeve's −stop%;
 * at +T1% sell half (`partial`, qtyClose) and arm the breakeven — a 1-contract
 * position cannot split, so it arms the runner whole (`arm_runner`); armed, the
 * rest exits on the trail from `peak`, breakeven, +T2%, back through VWAP, or 15:45.
 * `armed` = the position's stop is at/above entry (the T1 half is already sold).
 */
export function botRunnerManage(p: {
  entry: number; mark: number; qty: number; armed: boolean; peak: number; etMin: number;
  dir?: 'long' | 'short'; underlying?: number | null; vwap?: number | null;
}, sleeve: { premStopPct: number }, cfg: RunnerConfig): { action: BotRunnerAction; reason: string; qtyClose?: number; level?: number } {
  const pct = (p.mark / p.entry - 1) * 100;
  const pctTxt = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  const hhmm = `${String(Math.floor(cfg.flattenEt / 60)).padStart(2, '0')}:${String(cfg.flattenEt % 60).padStart(2, '0')}`;
  if (p.etMin >= cfg.flattenEt) return { action: 'flatten', reason: `0DTE hard flatten ${hhmm} ET (${pctTxt})` };
  if (p.mark >= p.entry * (1 + cfg.t2PremPct)) return { action: 'target', reason: `premium target +${Math.round(cfg.t2PremPct * 100)}% (${pctTxt})` };
  if (!p.armed) {
    if (p.mark <= p.entry * (1 - sleeve.premStopPct)) return { action: 'stop', reason: `premium stop −${Math.round(sleeve.premStopPct * 100)}% (${pctTxt})` };
    if (p.mark >= p.entry * (1 + cfg.t1PremPct)) {
      const half = Math.floor(p.qty * cfg.partialFrac);
      if (half >= 1 && p.qty - half >= 1) return { action: 'partial', qtyClose: half, reason: `T1 +${Math.round(cfg.t1PremPct * 100)}% — sold ${half} of ${p.qty}, runner stop → breakeven (${pctTxt})` };
      return { action: 'arm_runner', reason: `T1 +${Math.round(cfg.t1PremPct * 100)}% — single contract, runner stop → breakeven (${pctTxt})` };
    }
    return { action: 'hold', reason: pctTxt };
  }
  const peak = Math.max(p.peak, p.entry);
  const trail = Math.max(p.entry, peak * (1 - cfg.trailPct));
  if (p.mark <= trail) {
    return trail <= p.entry + 1e-9
      ? { action: 'breakeven_stop', level: trail, reason: `runner breakeven stop (${pctTxt}, peak $${peak.toFixed(2)})` }
      : { action: 'trail', level: trail, reason: `runner trail ${Math.round(cfg.trailPct * 100)}% from peak $${peak.toFixed(2)} (${pctTxt})` };
  }
  if (cfg.vwapExit && p.dir && fin(p.underlying) && fin(p.vwap) && (p.dir === 'long' ? p.underlying < p.vwap : p.underlying > p.vwap)) {
    return { action: 'vwap_exit', reason: `runner: underlying back through VWAP ${p.vwap.toFixed(2)} (${pctTxt})` };
  }
  return { action: 'hold', reason: `runner ${pctTxt} · trail $${trail.toFixed(2)}` };
}

// ── outcome-note tag for an idea's runner ───────────────────────────────────
// [runner:open|t1=4.22@2026-10-07T14:00Z|stop=3.05]
// [runner:closed|t1=4.22@…|run=5.10@2026-10-07T14:31Z|why=trail 25% from peak|blend=4.66]

export const RUNNER_TAG_RE = /\[runner:(open|closed)\|t1=(\d+(?:\.\d+)?)@(\S+?Z)(?:\|stop=(\d+(?:\.\d+)?))?(?:\|run=(\d+(?:\.\d+)?)@(\S+?Z)\|why=([^|\]]*)\|blend=(\d+(?:\.\d+)?))?\]/;
const isoMin = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z';
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface RunnerRecord {
  state: 'open' | 'closed';
  t1ExitPremium: number; t1AtMs: number;
  stop: number | null;
  runnerExitPremium: number | null; runnerAtMs: number | null; runnerWhy: string | null;
  blendedPremium: number | null;
}

export function runnerTag(r: RunnerRecord): string {
  const head = `[runner:${r.state}|t1=${r2(r.t1ExitPremium)}@${isoMin(r.t1AtMs)}`;
  if (r.state === 'open') return `${head}${r.stop != null ? `|stop=${r2(r.stop)}` : ''}]`;
  return `${head}|run=${r2(r.runnerExitPremium ?? 0)}@${isoMin(r.runnerAtMs ?? r.t1AtMs)}|why=${String(r.runnerWhy ?? '').replace(/[|\]]/g, '/')}|blend=${r2(r.blendedPremium ?? 0)}]`;
}

export function parseRunner(notes: string | null | undefined): RunnerRecord | null {
  const m = RUNNER_TAG_RE.exec(String(notes ?? ''));
  if (!m) return null;
  const t1AtMs = Date.parse(m[3].length === 17 ? m[3].replace('Z', ':00Z') : m[3]);
  const runAt = m[6] ? Date.parse(m[6].length === 17 ? m[6].replace('Z', ':00Z') : m[6]) : NaN;
  return {
    state: m[1] as 'open' | 'closed', t1ExitPremium: Number(m[2]), t1AtMs,
    stop: m[4] ? Number(m[4]) : null,
    runnerExitPremium: m[5] ? Number(m[5]) : null, runnerAtMs: fin(runAt) ? runAt : null, runnerWhy: m[7] ?? null,
    blendedPremium: m[8] ? Number(m[8]) : null,
  };
}

export function withRunnerTag(notes: string | null | undefined, r: RunnerRecord): string {
  const base = String(notes ?? '');
  const tag = runnerTag(r);
  if (RUNNER_TAG_RE.test(base)) return base.replace(RUNNER_TAG_RE, tag);
  return base ? `${base}\n${tag}` : tag;
}

/** "½ at T1 $4.22 · runner $5.10 (trail 25% from peak) · blended $4.66" / "½ at T1 $4.22 · runner open, stop $3.05". */
export function runnerLine(r: RunnerRecord | null): string | null {
  if (!r) return null;
  const head = `½ at T1 $${r.t1ExitPremium.toFixed(2)}`;
  if (r.state === 'open') return `${head} · runner open${r.stop != null ? `, stop $${r.stop.toFixed(2)}` : ''}`;
  return `${head} · runner $${(r.runnerExitPremium ?? 0).toFixed(2)}${r.runnerWhy ? ` (${r.runnerWhy})` : ''} · blended $${(r.blendedPremium ?? 0).toFixed(2)}`;
}
