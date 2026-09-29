/**
 * SQUEEZE RADAR — shared types, chain extraction and scoring (pure; no I/O).
 * ==========================================================================
 * Research note: docs/GAMMA_SQUEEZE.md. Engine/job: server/squeeze-radar.ts.
 * Offline replay: research/squeeze-radar-backtest.ts. Tests: scripts/test-squeeze.ts.
 *
 * WHAT IT LOOKS FOR (a single-stock gamma squeeze, in order of mechanism):
 *   1. customers BUY near-dated OTM calls (volume ≫ OI; customer call sides up)
 *   2. dealers who sold them are SHORT gamma there — the naive "calls +" OI sign
 *      is wrong exactly at those strikes, so we also compute GEX under an
 *      explicit customer-long-calls assumption for near-dated OTM calls
 *   3. as spot rises, dealers buy stock to re-hedge; IV rises WITH spot
 *      (vanna: dealer short-call delta grows as IV rises → more buying)
 *   4. the call wall migrates up as customers roll strikes higher
 *   5. realised vol expands; the move exhausts when there is no gamma left
 *      above spot or IV stops rising with spot
 *
 * STATUS: UNVALIDATED — MEASURING. Weights and thresholds are judgment, set
 * before any replay; they are not fitted. Only the history-capable legs
 * (OCC customer call sides, realised vol, momentum) could be replayed — see
 * docs/GAMMA_SQUEEZE.md §Validation. Every run is logged for forward scoring.
 * The score orders names; it is NOT a probability.
 *
 * Every component reports `available`. A missing input contributes 0 and is
 * shown as unavailable — never imputed. `coverage` = sum of the weights whose
 * inputs exist, so "score 38 of a possible 62" is readable as such.
 */

import { bsGamma, gexPer1Pct, gammaProfile, pickWalls, type GammaContract } from './gex-math';

// ─── Rules (judgment, not fitted) ───────────────────────────────────────

export const SQUEEZE_RULES = {
  /** Near-dated window for the OTM call build, calendar days (same-day 0DTE excluded: its OI is yesterday's). */
  nearMinDays: 0.75,
  nearMaxDays: 21,
  /** OTM call band as a fraction above spot. */
  otmCallMin: 0.02,
  otmCallMax: 0.25,
  /** OTM put band (below spot) for the call/put comparison. */
  otmPutMin: 0.02,
  otmPutMax: 0.25,
  /** A strike is "opening" when volume ≥ OI and volume ≥ this many contracts. */
  openingMinVolume: 500,
  /** Liquidity floor — below either, the name is listed as illiquid and not staged. */
  minAvgDollarVolume: 20e6,
  minNearCallOI: 2_000,
  /** History needed before a history component is scored. */
  minHistorySessions: 5,
  minWallSessions: 3,
  /** Room-to-run band: distance from spot to the squeeze strike. */
  roomMinPct: 1.5,
  roomMaxPct: 12,
} as const;

/** Component weights — sum to 100. */
export const SQUEEZE_WEIGHTS = {
  otmCallTurnover: 12,   // near-dated OTM call volume ÷ OI today
  otmCallOiBuild: 10,    // near-dated OTM call OI vs median of prior logged sessions
  callWallMigration: 10, // call wall rising over the last N logged sessions
  customerCallFlow: 14,  // tape: call share of premium in aggressive prints (Bullflow), net premium lean
  dealerShortGamma: 12,  // GEX balance under the customer-long-OTM-calls assumption
  roomToRun: 6,          // spot → squeeze strike distance in band
  ivWithSpot: 10,        // call skew now + IV up with spot vs previous session (vanna)
  rvExpansion: 8,        // 5d / 20d realised vol
  momentum: 6,           // 5-session return, price confirming
  occCustomerCalls: 8,   // OCC customer call sides (prior session) ÷ 20-session median
  shortInterest: 4,      // % of float short (exchange-reported, twice monthly)
} as const;

export type SqueezeComponentKey = keyof typeof SQUEEZE_WEIGHTS;

export const SQUEEZE_COMPONENT_LABELS: Record<SqueezeComponentKey, string> = {
  otmCallTurnover: 'OTM call turnover (vol ÷ OI)',
  otmCallOiBuild: 'OTM call OI build vs baseline',
  callWallMigration: 'Call wall migrating up',
  customerCallFlow: 'Customer call buying (tape)',
  dealerShortGamma: 'Dealer short gamma (adjusted)',
  roomToRun: 'Room to the squeeze strike',
  ivWithSpot: 'IV rising with spot (vanna)',
  rvExpansion: 'Realised-vol expansion',
  momentum: 'Price confirming',
  occCustomerCalls: 'OCC customer call sides surge',
  shortInterest: 'Short interest (% float)',
};

export type SqueezeStage = 'igniting' | 'primed' | 'building' | 'exhausted' | 'quiet' | 'illiquid';

export const SQUEEZE_STAGE_COPY: Record<SqueezeStage, string> = {
  igniting: 'Price is moving into short-dealer-gamma strikes with fresh call buying',
  primed: 'Call build and dealer short gamma in place; price not yet running',
  building: 'Some squeeze ingredients present — watch for call OI build and wall migration',
  exhausted: 'Big run already; little gamma left above or IV no longer rising with spot',
  quiet: 'No squeeze structure',
  illiquid: 'Below the liquidity floor — not staged',
};

// ─── Chain extraction ───────────────────────────────────────────────────

/** One parsed option line (CBOE shape after OCC parse; Alpaca maps into it). */
export interface SqueezeChainContract {
  exp: string;          // YYYY-MM-DD
  expMs: number;        // expiry instant (16:00 ET)
  T: number;            // years to expiry
  cp: 'C' | 'P';
  K: number;
  oi: number;
  vol: number;
  gamma: number;        // feed gamma, or BS on own IV
  iv: number;           // decimal, 0 when missing
}

export interface SqueezeStrikeRead {
  strike: number;
  distPct: number;
  exp: string;
  dte: number;
  volume: number;
  openInterest: number;
  volOI: number | null;
  iv: number | null;
  /** unsigned $ per 1% of this strike's near-dated calls */
  gex: number;
}

/** Everything the radar needs from one chain read — compact enough to log daily. */
export interface SqueezeChainInputs {
  spot: number;
  nearExpiries: string[];
  nearOtmCallOI: number;
  nearOtmCallVol: number;
  nearOtmPutOI: number;
  nearOtmPutVol: number;
  /** all near-dated calls (any strike) OI — liquidity floor */
  nearCallOI: number;
  /** strikes where volume ≥ OI and volume ≥ openingMinVolume (near-dated OTM calls) */
  openingCallStrikes: number;
  /** top near-dated OTM call strikes by volume (≤ 6) */
  topOtmCalls: SqueezeStrikeRead[];
  /** largest near-dated OTM call gamma strike — where customer-long calls leave dealers shortest */
  squeezeStrike: number | null;
  naive: { netGEX: number; grossGEX: number; balance: number | null; zeroGamma: number | null; callWall: number | null };
  /**
   * Customer-long-calls assumption, turnover-weighted (the SCORED read): at each
   * near-dated OTM call contract, the fraction w = min(1, volume ÷ OI) of its OI
   * is re-signed dealer-SHORT — only as much as traded today, so a stale OI
   * stack is not assumed customer-bought. `fullBalance` is the upper bound where
   * every near-dated OTM call is customer-long.
   */
  adjusted: { netGEX: number; balance: number | null; zeroGamma: number | null; flippedGross: number; flippedShare: number | null; fullBalance: number | null };
  atmIv: number | null;
  /** IV at the strike nearest spot×1.10 in the same expiry as atmIv */
  otmCallIv: number | null;
  callSkew: number | null;
  ivExpiry: string | null;
}

const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
export { median as squeezeMedian };

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

export function extractSqueezeChainInputs(contracts: SqueezeChainContract[], spot: number, now: number): SqueezeChainInputs | null {
  if (!(spot > 0) || !contracts.length) return null;
  const R = SQUEEZE_RULES;
  const dte = (c: SqueezeChainContract) => (c.expMs - now) / 864e5;
  const isNear = (c: SqueezeChainContract) => dte(c) >= R.nearMinDays && dte(c) <= R.nearMaxDays;
  const isOtmCall = (c: SqueezeChainContract) => c.cp === 'C' && c.K > spot * (1 + R.otmCallMin) && c.K <= spot * (1 + R.otmCallMax);
  const isOtmPut = (c: SqueezeChainContract) => c.cp === 'P' && c.K < spot * (1 - R.otmPutMin) && c.K >= spot * (1 - R.otmPutMax);

  let nearOtmCallOI = 0, nearOtmCallVol = 0, nearOtmPutOI = 0, nearOtmPutVol = 0, nearCallOI = 0;
  let netGEX = 0, grossGEX = 0, adjNet = 0, flippedGross = 0, fullFlippedGross = 0;
  const byStrike = new Map<number, SqueezeStrikeRead>();
  const topVolByStrike = new Map<number, number>();
  const wallAgg = new Map<number, { strike: number; callOI: number; putOI: number; callGEX: number; putGEX: number }>();
  const naiveProfile: GammaContract[] = [];
  const adjProfile: GammaContract[] = [];
  const nearExp = new Set<string>();

  for (const c of contracts) {
    if (c.expMs <= now) continue;
    const g = c.gamma > 0 ? c.gamma : c.iv > 0.01 ? bsGamma(spot, c.K, c.T, c.iv) : 0;
    const gAbs = gexPer1Pct(g, c.oi, spot);
    const sign = c.cp === 'C' ? 1 : -1;
    const near = isNear(c);
    const flip = near && isOtmCall(c);
    const w = flip && c.oi > 0 ? Math.min(1, c.vol / c.oi) : 0; // share of OI re-signed dealer-short
    netGEX += sign * gAbs;
    grossGEX += gAbs;
    adjNet += sign * gAbs - 2 * w * gAbs;
    flippedGross += w * gAbs;
    if (flip) fullFlippedGross += gAbs;
    const wa = wallAgg.get(c.K) ?? { strike: c.K, callOI: 0, putOI: 0, callGEX: 0, putGEX: 0 };
    if (c.cp === 'C') { wa.callOI += c.oi; wa.callGEX += gAbs; } else { wa.putOI += c.oi; wa.putGEX += gAbs; }
    wallAgg.set(c.K, wa);
    if (c.iv > 0.01 && c.oi > 0) {
      naiveProfile.push({ strike: c.K, T: c.T, iv: c.iv, oi: c.oi, isCall: c.cp === 'C' });
      // isCall:false only flips the sign — BS gamma is identical for calls and puts.
      if (w > 0) {
        adjProfile.push({ strike: c.K, T: c.T, iv: c.iv, oi: c.oi * w, isCall: false });
        if (w < 1) adjProfile.push({ strike: c.K, T: c.T, iv: c.iv, oi: c.oi * (1 - w), isCall: true });
      } else adjProfile.push({ strike: c.K, T: c.T, iv: c.iv, oi: c.oi, isCall: c.cp === 'C' });
    }
    if (!near) continue;
    nearExp.add(c.exp);
    if (c.cp === 'C') nearCallOI += c.oi;
    if (isOtmCall(c)) {
      nearOtmCallOI += c.oi; nearOtmCallVol += c.vol;
      // Aggregate across near expiries; exp/dte/iv describe the expiry carrying the most volume.
      const prev = byStrike.get(c.K);
      if (!prev) {
        byStrike.set(c.K, { strike: c.K, distPct: ((c.K - spot) / spot) * 100, exp: c.exp, dte: dte(c), volume: c.vol, openInterest: c.oi, volOI: null, iv: c.iv > 0.01 ? c.iv : null, gex: gAbs });
        topVolByStrike.set(c.K, c.vol);
      } else {
        if (c.vol > (topVolByStrike.get(c.K) ?? 0)) {
          topVolByStrike.set(c.K, c.vol);
          prev.exp = c.exp; prev.dte = dte(c); prev.iv = c.iv > 0.01 ? c.iv : prev.iv;
        }
        prev.volume += c.vol; prev.openInterest += c.oi; prev.gex += gAbs;
      }
    }
    if (isOtmPut(c)) { nearOtmPutOI += c.oi; nearOtmPutVol += c.vol; }
  }
  const strikes = [...byStrike.values()].map((s) => ({ ...s, volOI: s.openInterest > 0 ? s.volume / s.openInterest : null }));
  const openingCallStrikes = strikes.filter((s) => s.volume >= R.openingMinVolume && s.volume >= s.openInterest).length;
  const topOtmCalls = [...strikes].sort((a, b) => b.volume - a.volume).slice(0, 6);
  const sq = [...strikes].sort((a, b) => b.gex - a.gex)[0];
  const walls = pickWalls([...wallAgg.values()], spot);
  const naiveZ = naiveProfile.length ? gammaProfile(naiveProfile, spot, { lo: 0.8, hi: 1.2, steps: 80 }).zeroGamma : null;
  const adjZ = adjProfile.length ? gammaProfile(adjProfile, spot, { lo: 0.8, hi: 1.2, steps: 80 }).zeroGamma : null;

  // IV: first expiry ≥ 5 days (front weeklies are noisy), ATM vs ~+10% call.
  const ivExps = [...new Set(contracts.filter((c) => dte(c) >= 5 && c.iv > 0.01).map((c) => c.exp))].sort();
  const ivExpiry = ivExps[0] ?? null;
  let atmIv: number | null = null, otmCallIv: number | null = null;
  if (ivExpiry) {
    const calls = contracts.filter((c) => c.exp === ivExpiry && c.cp === 'C' && c.iv > 0.01);
    const nearestTo = (target: number) => calls.reduce<SqueezeChainContract | null>((b, c) => (!b || Math.abs(c.K - target) < Math.abs(b.K - target) ? c : b), null);
    const atm = nearestTo(spot); const otm = nearestTo(spot * 1.1);
    atmIv = atm?.iv ?? null;
    otmCallIv = otm && atm && otm.K > atm.K ? otm.iv : null;
  }
  return {
    spot,
    nearExpiries: [...nearExp].sort(),
    nearOtmCallOI, nearOtmCallVol, nearOtmPutOI, nearOtmPutVol, nearCallOI,
    openingCallStrikes,
    topOtmCalls,
    squeezeStrike: sq?.strike ?? null,
    naive: { netGEX, grossGEX, balance: grossGEX > 0 ? netGEX / grossGEX : null, zeroGamma: naiveZ, callWall: walls.callWall },
    adjusted: {
      netGEX: adjNet, balance: grossGEX > 0 ? adjNet / grossGEX : null, zeroGamma: adjZ, flippedGross,
      flippedShare: grossGEX > 0 ? flippedGross / grossGEX : null,
      fullBalance: grossGEX > 0 ? (netGEX - 2 * fullFlippedGross) / grossGEX : null,
    },
    atmIv, otmCallIv,
    callSkew: atmIv != null && otmCallIv != null ? otmCallIv - atmIv : null,
    ivExpiry,
  };
}

// ─── Scoring ────────────────────────────────────────────────────────────

/** One logged session (from the radar's own append-only log). Oldest first when passed in. */
export interface SqueezeHistoryPoint {
  date: string;              // ET session date
  spot: number;
  nearOtmCallOI: number | null;
  callWall: number | null;
  squeezeStrike: number | null;
  atmIv: number | null;
}

export interface SqueezeBarsRead {
  /** daily closes, oldest first, completed sessions (today's partial bar excluded) */
  closes: number[];
  avgDollarVolume20: number | null;
  asOf: string | null;       // date of the last close
}

export interface SqueezeFlowRead {
  /** premium of call prints / (call + put prints), today, from the aggressive-print stream */
  callPremium: number;
  putPremium: number;
  /** near-dated (≤ 21d) OTM call print premium */
  otmNearCallPremium: number;
  prints: number;
  /** provider ask/bid-inferred net premium, when a cached read exists */
  netCallPremium?: number | null;
  netPutPremium?: number | null;
  asOf: string | null;
  source: string;
}

export interface SqueezeOccRead {
  /** customer call sides on the latest published session */
  customerCallSides: number;
  /** median of the prior 20 published sessions */
  baselineMedian: number | null;
  sessions: number;
  date: string;
}

export interface SqueezeRadarInputs {
  symbol: string;
  chain: SqueezeChainInputs | null;
  chainAsOf: string | null;
  chainSource: string | null;
  openInterestDate: string | null;
  changePct: number | null;
  history: SqueezeHistoryPoint[];
  bars: SqueezeBarsRead | null;
  flow: SqueezeFlowRead | null;
  occ: SqueezeOccRead | null;
  shortPctFloat: number | null;
}

export interface SqueezeComponent {
  key: SqueezeComponentKey;
  label: string;
  weight: number;
  points: number;
  available: boolean;
  /** the input value(s) behind the points, human-readable */
  detail: string;
}

export interface SqueezeKeyStrikes {
  squeezeStrike: number | null;
  callWall: number | null;
  zeroGammaNaive: number | null;
  zeroGammaAdjusted: number | null;
  topOtmCalls: SqueezeStrikeRead[];
}

export interface SqueezeRadarResult {
  symbol: string;
  score: number;             // 0–100, sum of available components
  coverage: number;          // 0–100, sum of weights whose inputs exist
  stage: SqueezeStage;
  stageNote: string;
  components: SqueezeComponent[];
  keyStrikes: SqueezeKeyStrikes;
  why: string[];
  missing: string[];
  spot: number | null;
  changePct: number | null;
  ret5Pct: number | null;
  validation: 'unvalidated';
}

const pct = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}%`;
const usd = (v: number) => {
  const a = Math.abs(v); const s = v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

/** Annualised close-to-close realised vol over the last n returns. */
export function realisedVol(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const r: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) {
    const a = closes[i - 1], b = closes[i];
    if (!(a > 0 && b > 0)) return null;
    r.push(Math.log(b / a));
  }
  const m = r.reduce((x, y) => x + y, 0) / r.length;
  const v = r.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, r.length - 1);
  return Math.sqrt(v * 252);
}

/**
 * The history-capable legs, exported so the replay (research/) and the live
 * engine score them with the SAME code.
 */
export function scoreHistoryCapable(bars: SqueezeBarsRead | null, occ: SqueezeOccRead | null) {
  const W = SQUEEZE_WEIGHTS;
  const closes = bars?.closes ?? [];
  const rv5 = realisedVol(closes, 5), rv20 = realisedVol(closes, 20);
  const rvRatio = rv5 != null && rv20 != null && rv20 > 0 ? rv5 / rv20 : null;
  const ret5 = closes.length >= 6 && closes[closes.length - 6] > 0 ? (closes[closes.length - 1] / closes[closes.length - 6] - 1) * 100 : null;
  const occRatio = occ && occ.baselineMedian && occ.baselineMedian > 0 && occ.sessions >= 10 ? occ.customerCallSides / occ.baselineMedian : null;
  return {
    rvRatio, ret5, occRatio, rv5, rv20,
    rvExpansion: rvRatio != null ? W.rvExpansion * clamp01((rvRatio - 1) / 1) : null,
    momentum: ret5 != null ? W.momentum * clamp01(ret5 / 15) : null,
    occCustomerCalls: occRatio != null ? W.occCustomerCalls * clamp01((occRatio - 1) / 2) : null,
  };
}

export function scoreSqueezeRadar(inp: SqueezeRadarInputs): SqueezeRadarResult {
  const W = SQUEEZE_WEIGHTS; const R = SQUEEZE_RULES;
  const ch = inp.chain;
  const comps: SqueezeComponent[] = [];
  const add = (key: SqueezeComponentKey, points: number | null, detail: string) => {
    comps.push({ key, label: SQUEEZE_COMPONENT_LABELS[key], weight: W[key], points: points == null ? 0 : Math.round(points * 10) / 10, available: points != null, detail });
  };
  const hist = inp.history.filter((h) => h.date && Number.isFinite(h.spot));

  // 1 OTM call turnover
  if (ch && ch.nearOtmCallOI > 0) {
    const t = ch.nearOtmCallVol / ch.nearOtmCallOI;
    add('otmCallTurnover', W.otmCallTurnover * clamp01((t - 0.3) / 1.2),
      `near-dated OTM calls: volume ${ch.nearOtmCallVol.toLocaleString()} vs OI ${ch.nearOtmCallOI.toLocaleString()} = ${t.toFixed(2)}×; ${ch.openingCallStrikes} strike(s) with volume ≥ OI`);
  } else add('otmCallTurnover', null, ch ? 'no near-dated OTM call OI' : 'no chain read');

  // 2 OTM call OI build vs baseline
  const oiHist = hist.map((h) => h.nearOtmCallOI).filter((x): x is number => x != null && x > 0);
  if (ch && oiHist.length >= R.minHistorySessions) {
    const base = median(oiHist)!;
    const r = ch.nearOtmCallOI / base;
    add('otmCallOiBuild', W.otmCallOiBuild * clamp01((r - 1) / 1), `OTM call OI ${ch.nearOtmCallOI.toLocaleString()} vs ${oiHist.length}-session median ${Math.round(base).toLocaleString()} = ${r.toFixed(2)}× (rolling window; expiries roll off)`);
  } else add('otmCallOiBuild', null, `needs ≥ ${R.minHistorySessions} logged sessions (have ${oiHist.length})`);

  // 3 call wall migration
  const walls = hist.map((h) => h.callWall).filter((x): x is number => x != null && x > 0);
  const nowWall = ch?.naive.callWall ?? null;
  if (nowWall && walls.length >= R.minWallSessions) {
    const seq = [...walls.slice(-5), nowWall];
    let ups = 0, downs = 0;
    for (let i = 1; i < seq.length; i++) { if (seq[i] > seq[i - 1]) ups++; else if (seq[i] < seq[i - 1]) downs++; }
    const rise = (nowWall / seq[0] - 1) * 100;
    const pts = W.callWallMigration * clamp01(rise / 10) * clamp01((ups - downs) / 2);
    add('callWallMigration', pts, `call wall ${seq.map((x) => x.toFixed(x % 1 ? 1 : 0)).join(' → ')} (${pct(rise)}; ${ups} up / ${downs} down steps)`);
  } else add('callWallMigration', null, `needs ≥ ${R.minWallSessions} logged sessions with a call wall (have ${walls.length})`);

  // 4 customer call flow (tape)
  const f = inp.flow;
  if (f && f.prints > 0 && f.callPremium + f.putPremium > 0) {
    const share = f.callPremium / (f.callPremium + f.putPremium);
    const size = clamp01(f.otmNearCallPremium / 1e6);
    let pts = W.customerCallFlow * 0.7 * clamp01((share - 0.55) / 0.35) * (0.4 + 0.6 * size);
    let net = '';
    if (f.netCallPremium != null && f.netPutPremium != null) {
      const lean = f.netCallPremium - f.netPutPremium;
      pts += W.customerCallFlow * 0.3 * clamp01(lean / 5e6);
      net = `; provider net call ${usd(f.netCallPremium)} vs put ${usd(f.netPutPremium)}`;
    }
    add('customerCallFlow', pts, `${f.prints} aggressive prints: calls ${(share * 100).toFixed(0)}% of premium, near OTM calls ${usd(f.otmNearCallPremium)}${net} (${f.source})`);
  } else add('customerCallFlow', null, f ? 'no prints for this name today' : 'flow tape unavailable');

  // 5 dealer short gamma (adjusted)
  if (ch && ch.adjusted.balance != null) {
    const b = ch.adjusted.balance;
    const pts = W.dealerShortGamma * clamp01(-b / 0.3);
    const p0 = (x: number | null) => (x != null ? `${(x * 100).toFixed(0)}%` : '—');
    add('dealerShortGamma', pts, `net GEX balance ${p0(b)} of gross with today's near-dated OTM call turnover re-signed customer-long (naive ${p0(ch.naive.balance)}; re-signed ${p0(ch.adjusted.flippedShare)} of gross; upper bound if every near OTM call is customer-long ${p0(ch.adjusted.fullBalance)})`);
  } else add('dealerShortGamma', null, 'no chain read');

  // 6 room to run
  if (ch && ch.squeezeStrike) {
    const d = (ch.squeezeStrike / ch.spot - 1) * 100;
    const inBand = d >= R.roomMinPct && d <= R.roomMaxPct;
    const pts = inBand ? W.roomToRun : d > R.roomMaxPct ? W.roomToRun * clamp01(1 - (d - R.roomMaxPct) / 10) : W.roomToRun * clamp01(d / R.roomMinPct);
    add('roomToRun', pts, `squeeze strike ${ch.squeezeStrike} is ${pct(d)} from spot`);
  } else add('roomToRun', null, ch ? 'no near-dated OTM call gamma above spot' : 'no chain read');

  // 7 IV with spot (vanna)
  let ivPts: number | null = null; const ivBits: string[] = [];
  if (ch && ch.callSkew != null) {
    ivPts = (W.ivWithSpot / 2) * clamp01(ch.callSkew / 0.08);
    ivBits.push(`+10% call IV ${(ch.otmCallIv! * 100).toFixed(0)}% vs ATM ${(ch.atmIv! * 100).toFixed(0)}% (${ch.ivExpiry})`);
  }
  const prev = hist[hist.length - 1];
  if (ch && ch.atmIv != null && prev?.atmIv != null && prev.spot > 0) {
    const dIv = (ch.atmIv - prev.atmIv) * 100; const dS = (ch.spot / prev.spot - 1) * 100;
    const up = dS > 0 && dIv > 0 ? clamp01(dIv / 5) * clamp01(dS / 3) : 0;
    ivPts = (ivPts ?? 0) + (W.ivWithSpot / 2) * up;
    ivBits.push(`ATM IV ${dIv >= 0 ? '+' : '−'}${Math.abs(dIv).toFixed(1)} pts with spot ${pct(dS)} since ${prev.date}`);
  } else ivBits.push('no previous logged IV (IV-with-spot half unscored)');
  add('ivWithSpot', ivPts, ivBits.join('; '));

  // 8–10 history-capable legs
  const hc = scoreHistoryCapable(inp.bars, inp.occ);
  add('rvExpansion', hc.rvExpansion, hc.rvRatio != null ? `RV5 ${(hc.rv5! * 100).toFixed(0)}% vs RV20 ${(hc.rv20! * 100).toFixed(0)}% = ${hc.rvRatio.toFixed(2)}×` : 'needs 21 daily closes');
  add('momentum', hc.momentum, hc.ret5 != null ? `5-session return ${pct(hc.ret5)}` : 'needs 6 daily closes');
  add('occCustomerCalls', hc.occCustomerCalls, hc.occRatio != null ? `OCC customer call sides ${inp.occ!.customerCallSides.toLocaleString()} on ${inp.occ!.date} vs 20-session median ${Math.round(inp.occ!.baselineMedian!).toLocaleString()} = ${hc.occRatio.toFixed(2)}×` : 'OCC history unavailable');

  // 11 short interest
  add('shortInterest', inp.shortPctFloat != null ? W.shortInterest * clamp01((inp.shortPctFloat - 0.05) / 0.15) : null,
    inp.shortPctFloat != null ? `${(inp.shortPctFloat * 100).toFixed(1)}% of float short (exchange-reported, twice monthly)` : 'short interest unavailable');

  const score = Math.round(comps.reduce((a, c) => a + c.points, 0));
  const coverage = comps.filter((c) => c.available).reduce((a, c) => a + c.weight, 0);
  const get = (k: SqueezeComponentKey) => comps.find((c) => c.key === k)!;

  // Stage (judgment rules)
  const liquid = (inp.bars?.avgDollarVolume20 == null || inp.bars.avgDollarVolume20 >= R.minAvgDollarVolume) && (!ch || ch.nearCallOI >= R.minNearCallOI);
  const room = ch?.squeezeStrike ? (ch.squeezeStrike / ch.spot - 1) * 100 : null;
  let stage: SqueezeStage;
  if (!liquid) stage = 'illiquid';
  else if (hc.ret5 != null && hc.ret5 >= 30 && (room == null || room > 20 || (get('ivWithSpot').available && get('ivWithSpot').points < 1 && (inp.changePct ?? 0) < 0))) stage = 'exhausted';
  else if (score >= 55 && (inp.changePct ?? 0) >= 3 && get('dealerShortGamma').points >= W.dealerShortGamma / 2) stage = 'igniting';
  else if (score >= 45) stage = 'primed';
  else if (score >= 25) stage = 'building';
  else stage = 'quiet';

  const why = comps.filter((c) => c.available && c.points >= c.weight * 0.4).sort((a, b) => b.points - a.points).map((c) => `${c.label}: ${c.detail}`);
  const missing = comps.filter((c) => !c.available).map((c) => `${c.label} — ${c.detail}`);

  return {
    symbol: inp.symbol.toUpperCase(),
    score, coverage, stage, stageNote: SQUEEZE_STAGE_COPY[stage],
    components: comps,
    keyStrikes: {
      squeezeStrike: ch?.squeezeStrike ?? null,
      callWall: ch?.naive.callWall ?? null,
      zeroGammaNaive: ch?.naive.zeroGamma ?? null,
      zeroGammaAdjusted: ch?.adjusted.zeroGamma ?? null,
      topOtmCalls: ch?.topOtmCalls ?? [],
    },
    why, missing,
    spot: ch?.spot ?? (inp.bars?.closes.length ? inp.bars.closes[inp.bars.closes.length - 1] : null),
    changePct: inp.changePct,
    ret5Pct: hc.ret5,
    validation: 'unvalidated',
  };
}

// ─── Wire payload ───────────────────────────────────────────────────────

export interface SqueezeRadarRow extends SqueezeRadarResult {
  chainAsOf: string | null;
  chainSource: string | null;
  openInterestDate: string | null;
  ageSec: number | null;
  stale: boolean;
}

export interface SqueezeRadarPayload {
  generatedAt: string;
  lastRunAt: string | null;
  rows: SqueezeRadarRow[];
  weights: typeof SQUEEZE_WEIGHTS;
  rules: typeof SQUEEZE_RULES;
  status: 'unvalidated — measuring';
  note: string;
  universe: number;
  logged: { sessions: number; lastDate: string | null; sink: string };
}
