/**
 * GEX / VEX MATH — the one implementation every pipeline calls.
 * =============================================================
 * Pure functions, no imports, safe on server and client.
 * Methodology, sources and every assumption: docs/GEX_VEX_METHODOLOGY.md.
 *
 * UNITS (per contract, before the dealer sign):
 *   GEX  = Γ · OI · 100 · S² · 0.01    → $ of underlying dealers trade per 1% spot move
 *   VEX  = vanna · OI · 100 · S · 0.01 → $ of underlying dealers trade per 1 IV point
 *          (vanna = ∂Δ/∂σ per 1.00 of vol, so × 0.01 for one vol point)
 *
 * SIGN (naive-OI — an assumption, not an observation):
 *   dealers are LONG calls and SHORT puts (customers overwrite calls, buy puts).
 *   GEX sign  = +1 call, −1 put        → + = dealers long gamma = liquidity PROVIDED
 *   VEX sign  = −(dealer vanna)        → + = dealers BUY as IV rises = liquidity PROVIDED
 *   (SqueezeMetrics "GEX Ed." / Implied Order Book convention: negative VEX means
 *   dealers sell into rising vol — the self-reinforcing selloff case.)
 *
 * ZERO-GAMMA LEVEL (a.k.a. gamma flip): the hypothetical spot S* at which
 * Σ sign·Γ_BS(S*)·OI·100·S*²·0.01 = 0, found by RE-PRICING every contract's
 * Black-Scholes gamma on a grid of spots (Perfiliev method) and bisecting the
 * crossing nearest the current spot. NOT the strike where a cumulative sum of
 * per-strike GEX changes sign — that sum is evaluated at today's spot only and
 * ignores that every contract's gamma moves as spot moves.
 */

export const GEX_UNITS = {
  gex: '$ of underlying dealers must trade per 1% spot move',
  vex: '$ of underlying dealers must trade per 1 IV point (0.01 abs vol); + = dealers buy as IV rises',
  gexPlus: 'GEX + VEX — additive only under the stated equivalence "1% spot move ≡ 1 IV point"',
} as const;
export const SIGN_CONVENTION_NOTE =
  'naive-oi: open interest carries no side, so calls count + (dealer long) and puts − (dealer short). ' +
  'Where customers are opening calls (volume > OI) the true dealer sign there is likely the opposite — the squeeze case.';

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const normPdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT2PI;

/** Abramowitz-Stegun 7.1.26 — |error| < 1.5e-7. */
export function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function d1(S: number, K: number, T: number, v: number, r: number, q: number): number {
  return (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * Math.sqrt(T));
}

/** Black-Scholes gamma per share (same for calls and puts). */
export function bsGamma(S: number, K: number, T: number, v: number, r = 0, q = 0): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return 0;
  return (Math.exp(-q * T) * normPdf(d1(S, K, T, v, r, q))) / (S * v * Math.sqrt(T));
}

/** Black-Scholes vanna ∂Δ/∂σ per share, per 1.00 of vol (same for calls and puts). */
export function bsVanna(S: number, K: number, T: number, v: number, r = 0, q = 0): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return 0;
  const a = d1(S, K, T, v, r, q);
  return (-Math.exp(-q * T) * normPdf(a) * (a - v * Math.sqrt(T))) / v;
}

/** Black-Scholes call delta N(d1)·e^(−qT). Put delta = call delta − e^(−qT), so Δ DIFFERENCES are identical for calls and puts. */
export function bsCallDelta(S: number, K: number, T: number, v: number, r = 0, q = 0): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return S > K ? 1 : 0;
  return Math.exp(-q * T) * normCdf(d1(S, K, T, v, r, q));
}

/**
 * Δ-ADJUSTED (finite-move) gamma for one contract line, UNSIGNED, $ per 1% move.
 * docs/GAMMA_RAW_VS_ADJUSTED.md §2(d):
 *   OI · 100 · S · [Δ(S·(1+h)) − Δ(S·(1−h))] / 2,   h = 0.01
 * = the shares a delta-hedger actually trades for a ±1% move, averaged over the
 * two directions, in dollars. Γ·S²·0.01 is its first-order Taylor term; the two
 * agree for long-dated contracts and part ways where gamma is peaked (0DTE):
 * linear Γ overstates an ATM 0DTE line (delta cannot move more than 0→1) and
 * understates one just OTM (delta crosses the strike inside the move).
 * Same for calls and puts (the Δ difference is sign-free).
 */
export function deltaAdjGexPer1Pct(S: number, K: number, T: number, v: number, oi: number, r = 0, q = 0, h = 0.01): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0 && oi > 0)) return 0;
  return (oi * 100 * S * (bsCallDelta(S * (1 + h), K, T, v, r, q) - bsCallDelta(S * (1 - h), K, T, v, r, q))) / 2;
}
/** One-sided hedge moves, UNSIGNED $: up = Δ(S(1+h)) − Δ(S), down = Δ(S) − Δ(S(1−h)), × OI·100·S. */
export function deltaMoveSplit(S: number, K: number, T: number, v: number, oi: number, r = 0, q = 0, h = 0.01): { up: number; down: number } {
  if (!(S > 0 && K > 0 && T > 0 && v > 0 && oi > 0)) return { up: 0, down: 0 };
  const m = oi * 100 * S;
  const d0 = bsCallDelta(S, K, T, v, r, q);
  return { up: m * (bsCallDelta(S * (1 + h), K, T, v, r, q) - d0), down: m * (d0 - bsCallDelta(S * (1 - h), K, T, v, r, q)) };
}

/** $ per 1% move for one contract line, UNSIGNED. */
export const gexPer1Pct = (gamma: number, oi: number, S: number) => gamma * oi * 100 * S * S * 0.01;
/** $ per 1 IV point for one contract line, UNSIGNED dealer-long vanna (apply −sign for the liquidity sign). */
export const vannaPerVolPt = (vanna: number, oi: number, S: number) => vanna * oi * 100 * S * 0.01;
/** Dealer GEX sign under naive-OI. */
export const gexSign = (isCall: boolean) => (isCall ? 1 : -1);

// ─── Zero-gamma by spot-grid re-pricing ──────────────────────────────────

export interface GammaContract {
  strike: number;
  /** Years to expiry, > 0. */
  T: number;
  /** Implied vol, decimal. Contracts without a usable IV must be excluded or given a disclosed fallback. */
  iv: number;
  oi: number;
  isCall: boolean;
}

export interface GammaProfilePoint { spot: number; netGEX: number }
export interface GammaProfile {
  /** Net GEX ($ per 1%) re-priced at each hypothetical spot. */
  points: GammaProfilePoint[];
  /** Crossing nearest the current spot (bisected), or null when the profile never changes sign in range. */
  zeroGamma: number | null;
  /** Every crossing found in range, ascending. */
  crossings: number[];
  /** Net GEX re-priced at the current spot with BS gamma (for consistency checks against feed gamma). */
  netAtSpot: number;
  range: { lo: number; hi: number };
  contracts: number;
}

/**
 * Which per-contract exposure the profile sums:
 *   'gamma'    Σ sign·Γ_BS(s)·OI·100·s²·0.01 (raw GEX — the default everywhere)
 *   'delta1pct' Σ sign·OI·100·s·[Δ(s·1.01) − Δ(s·0.99)]/2 (Δ-adjusted, finite ±1% move)
 */
export type ProfileKernel = 'gamma' | 'delta1pct';

/** Net GEX at hypothetical spot s: Σ sign·Γ_BS(s)·OI·100·s²·0.01 (or the Δ-adjusted kernel). */
export function netGexAt(contracts: GammaContract[], s: number, r = 0, q = 0, kernel: ProfileKernel = 'gamma'): number {
  if (kernel === 'delta1pct') {
    let g = 0;
    for (const c of contracts) g += (c.isCall ? 1 : -1) * deltaAdjGexPer1Pct(s, c.strike, c.T, c.iv, c.oi, r, q);
    return g;
  }
  let g = 0;
  for (const c of contracts) {
    const gm = bsGamma(s, c.strike, c.T, c.iv, r, q);
    if (gm) g += (c.isCall ? 1 : -1) * gm * c.oi;
  }
  return g * 100 * s * s * 0.01;
}

/**
 * Re-price the whole book across spot × [lo, hi] and find the zero-gamma level.
 * Coarse grid (default 121 points) then 30 bisection steps on each bracket, so
 * the level is exact to well under a cent regardless of grid spacing.
 */
export function gammaProfile(
  contracts: GammaContract[],
  spot: number,
  opts: { lo?: number; hi?: number; steps?: number; r?: number; q?: number; kernel?: ProfileKernel } = {},
): GammaProfile {
  const lo = opts.lo ?? 0.8; const hi = opts.hi ?? 1.2; const steps = Math.max(10, opts.steps ?? 120);
  const r = opts.r ?? 0; const q = opts.q ?? 0; const kernel = opts.kernel ?? 'gamma';
  const usable = contracts.filter((c) => c.oi > 0 && c.T > 0 && c.iv > 0 && c.strike > 0);
  const points: GammaProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = spot * (lo + ((hi - lo) * i) / steps);
    points.push({ spot: s, netGEX: netGexAt(usable, s, r, q, kernel) });
  }
  const crossings: number[] = [];
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]; let b = points[i];
    if (a.netGEX === 0) { crossings.push(a.spot); continue; }
    if (Math.sign(a.netGEX) === Math.sign(b.netGEX) || b.netGEX === 0) continue;
    for (let k = 0; k < 30; k++) {
      const mid = (a.spot + b.spot) / 2;
      const m = { spot: mid, netGEX: netGexAt(usable, mid, r, q, kernel) };
      if (Math.sign(m.netGEX) === Math.sign(a.netGEX)) a = m; else b = m;
    }
    crossings.push((a.spot + b.spot) / 2);
  }
  const zeroGamma = crossings.length
    ? crossings.reduce((best, z) => (Math.abs(z - spot) < Math.abs(best - spot) ? z : best), crossings[0])
    : null;
  return { points, zeroGamma, crossings, netAtSpot: netGexAt(usable, spot, r, q, kernel), range: { lo: spot * lo, hi: spot * hi }, contracts: usable.length };
}

/** Down-sample a profile for the wire (UI sparkline) — keeps both ends. */
export function thinProfile(points: GammaProfilePoint[], n = 41): GammaProfilePoint[] {
  if (points.length <= n) return points;
  const out: GammaProfilePoint[] = [];
  for (let i = 0; i < n; i++) out.push(points[Math.round((i * (points.length - 1)) / (n - 1))]);
  return out;
}

// ─── Walls ────────────────────────────────────────────────────────────────

export interface WallStrike { strike: number; callOI: number; putOI: number; callGEX: number; putGEX: number }

/**
 * Wall definitions (docs/GEX_VEX_METHODOLOGY.md §Levels):
 *   callWall      = strike ABOVE spot with the largest call GEX ($/1%, all expiries summed)
 *   putWall       = strike BELOW spot with the largest put GEX
 *   callWallOI / putWallOI = the same, ranked by open interest instead of gamma
 * SpotGamma ranks by gamma; the OI variants are kept because OI does not
 * re-centre on spot every tick (0DTE ATM gamma otherwise wins every day).
 * callGEX / putGEX here are UNSIGNED magnitudes.
 */
export function pickWalls(strikes: WallStrike[], spot: number) {
  const best = (f: (s: WallStrike) => boolean, v: (s: WallStrike) => number) => {
    let out: number | null = null; let bv = 0;
    for (const s of strikes) if (f(s) && v(s) > bv) { bv = v(s); out = s.strike; }
    return out;
  };
  return {
    callWall: best((s) => s.strike > spot, (s) => Math.abs(s.callGEX)),
    putWall: best((s) => s.strike < spot, (s) => Math.abs(s.putGEX)),
    callWallOI: best((s) => s.strike > spot, (s) => s.callOI),
    putWallOI: best((s) => s.strike < spot, (s) => s.putOI),
  };
}

/** Years to a listed expiry, taking the 16:00 America/New_York close as the expiry instant. */
export function expiryInstantMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const nyHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(probe));
  return Date.UTC(y, m - 1, d, 16 + (12 - (nyHour % 24)), 0);
}
export const YEAR_MS = 365 * 24 * 3600_000;
/** Floor for T so a contract expiring this afternoon keeps a finite gamma (1 trading hour). */
export const MIN_T_YEARS = 1 / (365 * 24);
