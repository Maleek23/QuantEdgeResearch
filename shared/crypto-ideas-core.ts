/**
 * CRYPTO IDEAS — pure core (no I/O). server/crypto-ideas-engine.ts feeds it
 * Coinbase spot candles and Hyperliquid perp context; scripts/test-crypto-ideas.ts
 * feeds it synthetic candles.
 *
 * Crypto trades 24/7, so every clock here is CALENDAR time: a "day" is 24h,
 * horizons are calendar days, the time stop is wall-clock. The expected-move
 * cap is the same loss-rules cap (shared/loss-rules.ts capTargetToExpectedMove)
 * fed a σ from 20 completed UTC daily bars and a calendar-day horizon.
 *
 * GRADE: the "crypto structure grade" (CS-A / CS-B / CS-C, 0–10 points) is its
 * OWN scale. It is not the NEXUS conviction band (S/A/B/C, raw evidence points,
 * shared/conviction-bands.ts) — the board re-scores every published idea on the
 * band scale with its own layers. The two are never added or compared.
 */
import { capTargetToExpectedMove, realizedVolDaily } from './loss-rules';

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number } // time = bar START, epoch seconds

export interface PerpContext {
  /** Hyperliquid hourly funding rate, current. */
  fundingHourly: number | null;
  /** Average hourly funding over the last 24h (fundingHistory). */
  fundingAvg24h: number | null;
  openInterest: number | null; // in coins
  /** OI change over the snapshot window, fraction (0.05 = +5%). null = not enough history. */
  oiChangePct: number | null;
  oiWindowHours: number | null;
  markPx: number | null;
  oraclePx: number | null;
  /** (mark − oracle) / oracle. */
  basisPct: number | null;
  dayNtlVlm: number | null;
  asOf: string | null;
}

export type Direction = 'long' | 'short';
export type SetupKind = 'trend_pullback' | 'range_breakout' | 'range_reclaim' | 'funding_squeeze' | 'funding_fade';
export type Trend = 'up' | 'down' | 'mixed';
export type HorizonKind = 'intraday' | 'swing';

export const CRYPTO_DEFAULT_UNIVERSE = ['BTC', 'ETH', 'SOL', 'HYPE', 'QNT', 'XRP', 'DOGE', 'LINK', 'AVAX', 'SUI'] as const;

export function parseUniverse(env: string | undefined): string[] {
  if (!env || !env.trim()) return [...CRYPTO_DEFAULT_UNIVERSE];
  const list = env.split(/[\s,]+/).map((s) => s.trim().toUpperCase().replace(/-USD$/, '')).filter((s) => /^[A-Z0-9]{2,10}$/.test(s));
  return list.length ? Array.from(new Set(list)) : [...CRYPTO_DEFAULT_UNIVERSE];
}

/**
 * Equity proxies shown on BTC/ETH ideas. Mirrors ROUTES in
 * server/crypto-proxy-promoter.ts (kept as is — that module owns promotion).
 */
export const PROXY_WATCH: Record<string, string[]> = {
  BTC: ['MSTR', 'IBIT', 'COIN', 'CRCL', 'MARA', 'RIOT'],
  ETH: ['ETHA', 'COIN', 'HOOD'],
};

// ─── thresholds (exported so tests and the UI legend use the same numbers) ───
export const T = Object.freeze({
  /** Funding APR (%) at or below which shorts are paying heavily — squeeze fuel. */
  fundingNegAprPct: -10,
  /** Funding APR (%) at or above which longs are crowded — fade fuel. */
  fundingHotAprPct: 40,
  /** OI must have risen at least this much over ≥ 1.5h of snapshots. */
  oiRisePct: 0.03,
  oiMinWindowHours: 1.5,
  breakoutVolMult: 1.5,
  reclaimVolMult: 1.3,
  /** Range must be tight: width ≤ this many 1h ATRs. */
  rangeMaxAtr: 8,
  rangeBars: 24,
  /** Stop distance bounds in ATR of the setup's timeframe. */
  minStopAtr: 1.0,
  maxStopAtr: 3.0,
  /** Minimum R:R after the expected-move cap. */
  minRR: 1.2,
  publishMinPoints: 5,
});

export const fundingAprPct = (hourly: number | null | undefined) =>
  hourly == null || !Number.isFinite(hourly) ? null : hourly * 24 * 365 * 100;

// ─── indicators ─────────────────────────────────────────────────────────────
export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (prev == null) {
      if (i + 1 >= period) { prev = values.slice(i + 1 - period, i + 1).reduce((a, b) => a + b, 0) / period; out.push(prev); }
      else out.push(NaN);
    } else { prev = v * k + prev * (1 - k); out.push(prev); }
  }
  return out;
}

export function atr(c: Candle[], period = 14): number | null {
  if (c.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const p = c[i - 1].close;
    trs.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - p), Math.abs(c[i].low - p)));
  }
  const tail = trs.slice(-period);
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

/** Aggregate 1h bars into 4h bars aligned to UTC 00/04/08/12/16/20. Incomplete buckets are kept (the last one forms). */
export function aggregate4h(h1: Candle[]): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  for (const b of [...h1].sort((a, z) => a.time - z.time)) {
    const start = Math.floor(b.time / 14_400) * 14_400;
    if (!cur || cur.time !== start) {
      if (cur) out.push(cur);
      cur = { time: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function trendOf(c: Candle[]): { trend: Trend; ema20: number | null; ema50: number | null; close: number | null } {
  const closes = c.map((b) => b.close);
  const e20 = ema(closes, 20).at(-1); const e50 = ema(closes, 50).at(-1); const last = closes.at(-1);
  if (!(e20 && e50 && last) || !Number.isFinite(e20) || !Number.isFinite(e50)) return { trend: 'mixed', ema20: null, ema50: null, close: last ?? null };
  const trend: Trend = last > e50 && e20 > e50 ? 'up' : last < e50 && e20 < e50 ? 'down' : 'mixed';
  return { trend, ema20: e20, ema50: e50, close: last };
}

// ─── inputs / outputs ───────────────────────────────────────────────────────
export interface CoinInput {
  symbol: string;
  /** 1h candles, oldest→newest; the LAST bar is the forming bar (its close = live price). */
  h1: Candle[];
  /** Daily candles, oldest→newest; the last bar may be forming. */
  d1: Candle[];
  perp: PerpContext | null;
  /** BTC's regime for the alt filter (null when this IS BTC or BTC unread). */
  btcRegime: Trend | null;
  nowMs: number;
  targetCapMultiple?: number;
}

export interface CryptoPlan {
  symbol: string;
  setup: SetupKind;
  direction: Direction;
  horizon: HorizonKind;
  horizonDays: number; // calendar days
  entry: number;
  entryZone: [number, number];
  stop: number;
  stopBasis: string;
  t1: number;
  t2: number;
  t1Capped: boolean;
  expectedMove: number | null;
  sigmaDaily: number | null;
  capNote: string;
  rr: number;
  timeStopAtIso: string;
  exitByIso: string;
  why: string;
  evidence: string[];
  points: number;
  grade: 'CS-A' | 'CS-B' | 'CS-C';
  proxies: string[];
}

export interface CoinRead {
  symbol: string;
  price: number | null;
  daily: Trend;
  h4: Trend;
  fundingAprPct: number | null;
  oiChangePct: number | null;
  basisPct: number | null;
  plans: CryptoPlan[];
  /** Why nothing (or nothing publishable) fired — plain words, one line each. */
  notes: string[];
}

export const gradeFor = (points: number): CryptoPlan['grade'] => (points >= 7 ? 'CS-A' : points >= T.publishMinPoints ? 'CS-B' : 'CS-C');

const round = (v: number) => {
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 6;
  return Number(v.toFixed(d));
};

// ─── plan builder (stop / targets / caps / clocks) ──────────────────────────
interface Draft {
  setup: SetupKind; direction: Direction; horizon: HorizonKind;
  entryZone: [number, number]; stop: number; stopBasis: string; atrRef: number;
  structuralT1: number; t2: number | null;
  why: string; evidence: string[]; basePoints: number;
}

export function horizonDaysFor(h: HorizonKind): number { return h === 'intraday' ? 0.5 : 2; }

export function buildPlan(inp: CoinInput, d: Draft, extraPoints: { pts: number; line: string }[]): { plan: CryptoPlan | null; reason: string | null } {
  const entry = inp.h1.at(-1)?.close ?? NaN;
  if (!(entry > 0)) return { plan: null, reason: 'no live price' };
  const [zLo, zHi] = d.entryZone[0] <= d.entryZone[1] ? d.entryZone : [d.entryZone[1], d.entryZone[0]];
  if (entry < zLo || entry > zHi) return { plan: null, reason: `${d.setup}: live ${entry} outside entry zone ${round(zLo)}–${round(zHi)} — not chased` };
  const long = d.direction === 'long';
  const risk = long ? entry - d.stop : d.stop - entry;
  if (!(risk > 0)) return { plan: null, reason: `${d.setup}: stop on the wrong side of entry` };
  if (risk < T.minStopAtr * d.atrRef) return { plan: null, reason: `${d.setup}: stop ${(risk / d.atrRef).toFixed(2)} ATR from entry < ${T.minStopAtr} ATR floor (noise stop)` };
  if (risk > T.maxStopAtr * d.atrRef) return { plan: null, reason: `${d.setup}: stop ${(risk / d.atrRef).toFixed(2)} ATR away > ${T.maxStopAtr} ATR ceiling` };

  const horizonDays = horizonDaysFor(d.horizon);
  // σ from COMPLETED daily bars only (the forming bar is not a realized return).
  const dayStart = Math.floor(inp.nowMs / 86_400_000) * 86_400;
  const closes = inp.d1.filter((b) => b.time < dayStart).map((b) => b.close);
  const sigma = realizedVolDaily(closes, 20);
  const cap = capTargetToExpectedMove({ direction: d.direction, entry, target: round(d.structuralT1), stop: d.stop, sigmaDaily: sigma, horizonDays, multiple: inp.targetCapMultiple ?? 1 });
  const t1 = round(cap.target);
  const rr = Math.abs(t1 - entry) / risk;
  if (rr < T.minRR) return { plan: null, reason: `${d.setup}: R:R ${rr.toFixed(2)} after the ${horizonDays}d expected-move cap < ${T.minRR} — stop too wide for the move` };
  let t2 = cap.capped ? cap.originalTarget : (d.t2 ?? (long ? entry + 3 * risk : entry - 3 * risk));
  if (long ? t2 <= t1 : t2 >= t1) t2 = long ? t1 + risk : t1 - risk;

  const evidence = [...d.evidence];
  let points = d.basePoints;
  for (const x of extraPoints) { points += x.pts; if (x.line) evidence.push(x.line); }
  if (rr >= 2) { points += 1; evidence.push(`R:R ${rr.toFixed(2)} after cap (≥ 2 → +1)`); }
  evidence.push(cap.note);
  points = Math.max(0, Math.min(10, points));
  const proxies = PROXY_WATCH[inp.symbol] ?? [];
  if (proxies.length) evidence.push(`watch proxies — ${proxies.join(', ')} — not confirmed until their own tape confirms`);

  const horizonMs = horizonDays * 86_400_000;
  return {
    reason: null,
    plan: {
      symbol: inp.symbol, setup: d.setup, direction: d.direction, horizon: d.horizon, horizonDays,
      entry: round(entry), entryZone: [round(zLo), round(zHi)], stop: round(d.stop), stopBasis: d.stopBasis,
      t1, t2: round(t2), t1Capped: cap.capped, expectedMove: cap.expectedMove, sigmaDaily: sigma, capNote: cap.note, rr: Math.round(rr * 100) / 100,
      timeStopAtIso: new Date(inp.nowMs + horizonMs * 0.5).toISOString(),
      exitByIso: new Date(inp.nowMs + horizonMs).toISOString(),
      why: d.why, evidence, points, grade: gradeFor(points), proxies,
    },
  };
}

// ─── setup detection ────────────────────────────────────────────────────────
export function analyzeCoin(inp: CoinInput): CoinRead {
  const notes: string[] = [];
  const h1 = inp.h1; const h4 = aggregate4h(h1);
  const price = h1.at(-1)?.close ?? null;
  const daily = trendOf(inp.d1).trend;
  const t4 = trendOf(h4);
  const fApr = fundingAprPct(inp.perp?.fundingAvg24h ?? inp.perp?.fundingHourly ?? null);
  const read: CoinRead = {
    symbol: inp.symbol, price, daily, h4: t4.trend, fundingAprPct: fApr,
    oiChangePct: inp.perp?.oiChangePct ?? null, basisPct: inp.perp?.basisPct ?? null, plans: [], notes,
  };
  if (!price || h1.length < 60 || inp.d1.length < 30) { notes.push(`not enough history (1h ${h1.length}, 1d ${inp.d1.length})`); return read; }
  const atr1 = atr(h1.slice(0, -1), 14); const atr4 = atr(h4.slice(0, -1), 14);
  if (!atr1 || !atr4) { notes.push('ATR unavailable'); return read; }

  // Shared context points.
  const ctx = (dir: Direction) => {
    const out: { pts: number; line: string }[] = [];
    if (inp.btcRegime) {
      const aligned = dir === 'long' ? inp.btcRegime === 'up' : inp.btcRegime === 'down';
      out.push({ pts: aligned ? 1 : 0, line: `BTC regime ${inp.btcRegime}${aligned ? ' — aligned (+1)' : ' — not aligned'}` });
    }
    if (fApr != null) {
      // Hyperliquid's resting rate is ~11% APR: longs are uncrowded below ~5%, shorts get paid to fade above ~20%.
      const supportive = dir === 'long' ? fApr <= 5 : fApr >= 20;
      out.push({ pts: supportive ? 1 : 0, line: `funding ${fApr.toFixed(1)}% APR (24h avg, Hyperliquid)${supportive ? ' — not crowded on this side (+1)' : ''}` });
    }
    const oi = inp.perp?.oiChangePct;
    if (oi != null && inp.perp?.oiWindowHours) {
      out.push({ pts: oi >= T.oiRisePct ? 1 : 0, line: `OI ${oi >= 0 ? '+' : ''}${(oi * 100).toFixed(1)}% over ${inp.perp.oiWindowHours.toFixed(1)}h${oi >= T.oiRisePct ? ' — new positioning (+1)' : ''}` });
    }
    if (inp.perp?.basisPct != null) out.push({ pts: 0, line: `perp basis ${(inp.perp.basisPct * 100).toFixed(3)}% (mark vs oracle)` });
    return out;
  };
  const altBlocked = (dir: Direction) => inp.btcRegime != null && (dir === 'long' ? inp.btcRegime === 'down' : inp.btcRegime === 'up');
  const push = (d: Draft) => {
    if (altBlocked(d.direction)) { notes.push(`${d.setup} ${d.direction}: blocked by BTC regime (${inp.btcRegime})`); return; }
    const r = buildPlan(inp, d, ctx(d.direction));
    if (r.plan) read.plans.push(r.plan); else if (r.reason) notes.push(r.reason);
  };

  // A. Trend continuation: 1d + 4h aligned, pullback to the 4h EMA20.
  for (const dir of ['long', 'short'] as Direction[]) {
    const want: Trend = dir === 'long' ? 'up' : 'down';
    if (daily !== want || t4.trend !== want || !t4.ema20 || !t4.ema50) continue;
    const recent = h4.slice(-3); // two completed 4h bars + the forming one (live price counts as a touch)
    const touched = dir === 'long'
      ? recent.some((b) => b.low <= t4.ema20! + 0.5 * atr4)
      : recent.some((b) => b.high >= t4.ema20! - 0.5 * atr4);
    if (!touched) { notes.push(`trend ${dir}: 1d+4h ${want} but no pullback to the 4h EMA20 in the last ~8h`); continue; }
    // Structure = the pullback's own extreme (last ~8h) or 0.5 ATR through the EMA20, whichever is further.
    const structure = dir === 'long' ? Math.min(...recent.map((b) => b.low), t4.ema20 - 0.5 * atr4) : Math.max(...recent.map((b) => b.high), t4.ema20 + 0.5 * atr4);
    let stop = dir === 'long' ? structure - 0.25 * atr4 : structure + 0.25 * atr4;
    const floor = 1.25 * atr4; // 2026-09-24 stop floor: never tighter than 1.25 ATR on swings
    if (Math.abs(price - stop) < floor) stop = dir === 'long' ? price - floor : price + floor;
    const zone: [number, number] = dir === 'long' ? [t4.ema20 - 0.25 * atr4, t4.ema20 + 0.75 * atr4] : [t4.ema20 - 0.75 * atr4, t4.ema20 + 0.25 * atr4];
    const risk = Math.abs(price - stop);
    const hi20 = Math.max(...h4.slice(-21, -1).map((b) => b.high)); const lo20 = Math.min(...h4.slice(-21, -1).map((b) => b.low));
    push({
      setup: 'trend_pullback', direction: dir, horizon: 'swing', entryZone: zone, stop, stopBasis: `pullback ${dir === 'long' ? 'low' : 'high'} / EMA20 ∓ 0.5 ATR, ± 0.25 ATR buffer (≥ 1.25 × 4h ATR)`, atrRef: atr4,
      structuralT1: dir === 'long' ? price + 2 * risk : price - 2 * risk, t2: dir === 'long' ? Math.max(hi20, price + 3 * risk) : Math.min(lo20, price - 3 * risk),
      why: `${inp.symbol} 1d and 4h trend ${want}; price pulled back to the 4h EMA20 (${round(t4.ema20)}) and is ${dir === 'long' ? 'holding above' : 'capped below'} it`,
      evidence: [`daily trend ${daily} (close vs EMA50, EMA20 vs EMA50)`, `4h trend ${t4.trend}: EMA20 ${round(t4.ema20)} / EMA50 ${round(t4.ema50)}`, `4h ATR ${round(atr4)}`],
      basePoints: 5,
    });
  }

  // B. Range breakout / reclaim on 1h with volume.
  const done = h1.slice(0, -1); // completed 1h bars
  const last = done.at(-1)!;
  const rangeBars = done.slice(-(T.rangeBars + 3), -3);
  if (rangeBars.length >= T.rangeBars) {
    const H = Math.max(...rangeBars.map((b) => b.high)); const L = Math.min(...rangeBars.map((b) => b.low));
    const width = H - L; const mid = (H + L) / 2;
    const medVol = median(rangeBars.map((b) => b.volume));
    const volMult = medVol > 0 ? last.volume / medVol : 0;
    if (width > T.rangeMaxAtr * atr1) notes.push(`no range: prior ${T.rangeBars}h width ${(width / atr1).toFixed(1)} ATR > ${T.rangeMaxAtr}`);
    else {
      const rangeLine = `range ${round(L)}–${round(H)} over ${T.rangeBars}h (${(width / atr1).toFixed(1)} × 1h ATR)`;
      const volLine = `breakout bar volume ${volMult.toFixed(2)}× the range median`;
      const trendPts = (dir: Direction) => ((dir === 'long' ? daily === 'up' && t4.trend === 'up' : daily === 'down' && t4.trend === 'down') ? 2 : 0);
      if (last.close > H) {
        if (volMult < T.breakoutVolMult) notes.push(`breakout long: closed above ${round(H)} on ${volMult.toFixed(2)}× volume < ${T.breakoutVolMult}× — unconfirmed`);
        else push({
          setup: 'range_breakout', direction: 'long', horizon: 'intraday', entryZone: [H, H + 0.6 * atr1],
          stop: Math.min(H - 1.25 * atr1, mid), stopBasis: 'back inside the range (range high − 1.25 ATR, or mid)', atrRef: atr1,
          structuralT1: price + width, t2: price + 2 * width,
          why: `${inp.symbol} broke a ${T.rangeBars}h range high ${round(H)} on ${volMult.toFixed(1)}× volume; measured move = range width`,
          evidence: [rangeLine, volLine, `1d ${daily} / 4h ${t4.trend}${trendPts('long') ? ' — trend-aligned (+2)' : ''}`],
          basePoints: 3 + trendPts('long') + (volMult >= 2 ? 1 : 0),
        });
      } else if (last.close < L) {
        if (volMult < T.breakoutVolMult) notes.push(`breakdown short: closed below ${round(L)} on ${volMult.toFixed(2)}× volume < ${T.breakoutVolMult}× — unconfirmed`);
        else push({
          setup: 'range_breakout', direction: 'short', horizon: 'intraday', entryZone: [L - 0.6 * atr1, L],
          stop: Math.max(L + 1.25 * atr1, mid), stopBasis: 'back inside the range (range low + 1.25 ATR, or mid)', atrRef: atr1,
          structuralT1: price - width, t2: price - 2 * width,
          why: `${inp.symbol} broke down through a ${T.rangeBars}h range low ${round(L)} on ${volMult.toFixed(1)}× volume; measured move = range width`,
          evidence: [rangeLine, volLine.replace('breakout', 'breakdown'), `1d ${daily} / 4h ${t4.trend}${trendPts('short') ? ' — trend-aligned (+2)' : ''}`],
          basePoints: 3 + trendPts('short') + (volMult >= 2 ? 1 : 0),
        });
      } else {
        // Reclaim: a sweep of the range edge in the last 3 bars, closed back inside on volume.
        const sweep = done.slice(-3);
        const sweptLow = Math.min(...sweep.map((b) => b.low)); const sweptHigh = Math.max(...sweep.map((b) => b.high));
        if (sweptLow < L && last.close > L && volMult >= T.reclaimVolMult) {
          push({
            setup: 'range_reclaim', direction: 'long', horizon: 'intraday', entryZone: [L, L + 0.75 * atr1],
            stop: sweptLow - 0.25 * atr1, stopBasis: 'below the sweep low − 0.25 ATR', atrRef: atr1,
            structuralT1: mid, t2: H,
            why: `${inp.symbol} swept the range low ${round(L)} to ${round(sweptLow)} and reclaimed it on ${volMult.toFixed(1)}× volume — targets range mid then high`,
            evidence: [rangeLine, `sweep low ${round(sweptLow)}; reclaim close ${round(last.close)} on ${volMult.toFixed(2)}× volume`, `1d ${daily} / 4h ${t4.trend}`],
            basePoints: 2 + trendPts('long'),
          });
        } else if (sweptHigh > H && last.close < H && volMult >= T.reclaimVolMult) {
          push({
            setup: 'range_reclaim', direction: 'short', horizon: 'intraday', entryZone: [H - 0.75 * atr1, H],
            stop: sweptHigh + 0.25 * atr1, stopBasis: 'above the sweep high + 0.25 ATR', atrRef: atr1,
            structuralT1: mid, t2: L,
            why: `${inp.symbol} swept the range high ${round(H)} to ${round(sweptHigh)} and lost it on ${volMult.toFixed(1)}× volume — targets range mid then low`,
            evidence: [rangeLine, `sweep high ${round(sweptHigh)}; failure close ${round(last.close)} on ${volMult.toFixed(2)}× volume`, `1d ${daily} / 4h ${t4.trend}`],
            basePoints: 2 + trendPts('short'),
          });
        }
      }
    }
  }

  // C. Funding / OI extremes (Hyperliquid perps).
  const perp = inp.perp;
  if (!perp) notes.push('no Hyperliquid perp — funding/OI setups not measured');
  else if (fApr == null) notes.push('funding not measured');
  else {
    const oi = perp.oiChangePct; const oiOk = oi != null && (perp.oiWindowHours ?? 0) >= T.oiMinWindowHours && oi >= T.oiRisePct;
    const day = done.slice(-24);
    const lo24 = Math.min(...day.map((b) => b.low)); const hi24 = Math.max(...day.map((b) => b.high));
    const last6 = done.slice(-6);
    const oiLine = oi == null ? 'OI change not measured yet (needs ≥ 1.5h of snapshots)' : `OI ${oi >= 0 ? '+' : ''}${(oi * 100).toFixed(1)}% over ${(perp.oiWindowHours ?? 0).toFixed(1)}h`;
    if (fApr <= T.fundingNegAprPct) {
      const holding = Math.min(...last6.map((b) => b.low)) > lo24 && price >= lo24 + 0.5 * atr1;
      if (!oiOk) notes.push(`squeeze long: funding ${fApr.toFixed(1)}% APR but ${oiLine} — OI not rising`);
      else if (!holding) notes.push(`squeeze long: funding ${fApr.toFixed(1)}% APR, OI rising, but price made a new 24h low in the last 6h — not holding`);
      else push({
        setup: 'funding_squeeze', direction: 'long', horizon: 'intraday', entryZone: [lo24 + 0.5 * atr1, lo24 + 3 * atr1],
        stop: lo24 - 0.25 * atr1, stopBasis: '24h low − 0.25 ATR', atrRef: atr1,
        structuralT1: price + 2 * (price - (lo24 - 0.25 * atr1)), t2: hi24,
        why: `${inp.symbol} shorts paying ${Math.abs(fApr).toFixed(0)}% APR while OI builds and price holds its 24h low — short-squeeze conditions`,
        evidence: [`funding ${fApr.toFixed(1)}% APR (24h avg) ≤ ${T.fundingNegAprPct}%`, oiLine, `no new 24h low in 6h; 24h range ${round(lo24)}–${round(hi24)}`],
        basePoints: 4,
      });
    } else if (fApr >= T.fundingHotAprPct) {
      const failing = Math.max(...last6.map((b) => b.high)) < hi24 && price <= hi24 - 0.5 * atr1;
      if (!oiOk) notes.push(`crowded-long fade: funding ${fApr.toFixed(1)}% APR but ${oiLine} — OI not rising`);
      else if (!failing) notes.push(`crowded-long fade: funding ${fApr.toFixed(1)}% APR, OI rising, but price still printing 24h highs — no failure yet`);
      else push({
        setup: 'funding_fade', direction: 'short', horizon: 'intraday', entryZone: [hi24 - 3 * atr1, hi24 - 0.5 * atr1],
        stop: hi24 + 0.25 * atr1, stopBasis: '24h high + 0.25 ATR', atrRef: atr1,
        structuralT1: price - 2 * ((hi24 + 0.25 * atr1) - price), t2: lo24,
        why: `${inp.symbol} longs paying ${fApr.toFixed(0)}% APR with OI still building while price fails under its 24h high — crowded-long fade`,
        evidence: [`funding ${fApr.toFixed(1)}% APR (24h avg) ≥ ${T.fundingHotAprPct}%`, oiLine, `no new 24h high in 6h; 24h range ${round(lo24)}–${round(hi24)}`],
        basePoints: 4,
      });
    }
  }

  if (!read.plans.length && !notes.length) notes.push(`no setup: 1d ${daily}, 4h ${t4.trend}, no range break/reclaim, funding ${fApr == null ? 'n/a' : `${fApr.toFixed(1)}% APR`} not extreme`);
  read.plans.sort((a, b) => b.points - a.points);
  return read;
}

// ─── outcome path (the tracker) ─────────────────────────────────────────────
export interface PathInput {
  direction: Direction;
  entry: number; stop: number; target: number;
  publishedMs: number;
  timeStopAtMs: number | null;
  minR: number;
  exitByMs: number | null;
  /** Bars (any granularity) oldest→newest; `granSec` is their length. */
  bars: Candle[];
  granSec: number;
  nowMs: number;
}
export interface PathResult {
  status: 'open' | 'hit_target' | 'hit_stop' | 'expired';
  exitPrice: number | null;
  exitAtMs: number | null;
  reason: string;
  resolution: 'target' | 'stop' | 'time_stop' | 'horizon' | null;
  highest: number | null;
  lowest: number | null;
  lastPrice: number | null;
}

/**
 * Walk bars that STARTED at or after publication (a bar that began before the
 * idea existed can carry pre-publish prices — the 2026-09-24 tracker bug).
 * Stop and target touched in the same bar resolve as the STOP (conservative).
 */
export function resolveCryptoPath(p: PathInput): PathResult {
  const long = p.direction === 'long';
  const risk = Math.abs(p.entry - p.stop);
  const bars = p.bars.filter((b) => b.time * 1000 >= p.publishedMs && b.time * 1000 <= p.nowMs).sort((a, b) => a.time - b.time);
  let hi: number | null = null; let lo: number | null = null; let tsDone = false;
  const res = (status: PathResult['status'], exitPrice: number, atMs: number, reason: string, resolution: PathResult['resolution']): PathResult =>
    ({ status, exitPrice, exitAtMs: atMs, reason, resolution, highest: hi, lowest: lo, lastPrice: exitPrice });
  for (const b of bars) {
    const t0 = b.time * 1000;
    // Clocks are checked at the bar OPEN: the decision uses the first price at/after the deadline.
    if (p.exitByMs != null && t0 >= p.exitByMs) return res('expired', b.open, t0, `horizon ended ${new Date(p.exitByMs).toISOString()} — closed at ${b.open}`, 'horizon');
    if (!tsDone && p.timeStopAtMs != null && t0 >= p.timeStopAtMs) {
      tsDone = true;
      const r = risk > 0 ? (long ? b.open - p.entry : p.entry - b.open) / risk : 0;
      if (r < p.minR) return res('expired', b.open, t0, `time stop: ${r.toFixed(2)}R at half-horizon (< ${p.minR}R)`, 'time_stop');
    }
    hi = hi == null ? b.high : Math.max(hi, b.high);
    lo = lo == null ? b.low : Math.min(lo, b.low);
    const stopHit = long ? b.low <= p.stop : b.high >= p.stop;
    const tgtHit = long ? b.high >= p.target : b.low <= p.target;
    if (stopHit) return res('hit_stop', p.stop, t0 + p.granSec * 1000, tgtHit ? 'stop and target in the same bar — resolved as stop (conservative)' : 'stop touched', 'stop');
    if (tgtHit) return res('hit_target', p.target, t0 + p.granSec * 1000, 'T1 touched', 'target');
  }
  const lastBar = bars.at(-1);
  return { status: 'open', exitPrice: null, exitAtMs: null, reason: 'open', resolution: null, highest: hi, lowest: lo, lastPrice: lastBar?.close ?? null };
}

// ─── scheduling / caps ──────────────────────────────────────────────────────
/** The engine's cron: minutes 7 and 37 of EVERY hour, every day (no weekday field). */
export const CRYPTO_ENGINE_CRON = '7,37 * * * *';
/** The crypto outcome tracker: every 5 minutes, every day. */
export const CRYPTO_TRACKER_CRON = '*/5 * * * *';

/** Does a 5-field cron expression fire at this UTC-agnostic wall time? (minute/hour/dow only — enough for tests.) */
export function cronFires(expr: string, d: { minute: number; hour: number; weekday: number }): boolean {
  const [m, h, , , dow] = expr.trim().split(/\s+/);
  const match = (field: string, v: number, max: number) => field.split(',').some((part) => {
    if (part === '*') return true;
    const step = /^\*\/(\d+)$/.exec(part); if (step) return v % Number(step[1]) === 0;
    const range = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part);
    if (range) { const a = Number(range[1]); const b = Number(range[2]); const s = Number(range[3] ?? 1); return v >= a && v <= b && (v - a) % s === 0 && b <= max; }
    return Number(part) === v;
  });
  return match(m, d.minute, 59) && match(h, d.hour, 23) && match(dow, d.weekday, 7);
}

export interface PublishCandidate { symbol: string; direction: Direction; setup: SetupKind; points: number }
export interface ExistingIdea { symbol: string; direction: string; setup: string | null; timestampMs: number; open: boolean }

/**
 * Choose which plans to publish: best first; at most one OPEN idea per coin;
 * no same coin+direction+setup within `dedupHours`; at most `maxPerDay` per
 * UTC day (counting what is already published today) and `maxPerRun` per scan —
 * coins are correlated, so one scan never dumps the whole universe on the board.
 */
export function selectForPublish<C extends PublishCandidate>(cands: C[], existing: ExistingIdea[], o: { nowMs: number; maxPerDay: number; dedupHours: number; maxPerRun?: number }): { publish: C[]; skipped: Array<{ c: C; why: string }> } {
  const dayStart = Math.floor(o.nowMs / 86_400_000) * 86_400_000;
  let today = existing.filter((e) => e.timestampMs >= dayStart).length;
  const openCoins = new Set(existing.filter((e) => e.open).map((e) => e.symbol));
  const publish: C[] = []; const skipped: Array<{ c: C; why: string }> = [];
  for (const c of [...cands].sort((a, b) => b.points - a.points)) {
    if (c.points < T.publishMinPoints) { skipped.push({ c, why: `grade ${gradeFor(c.points)} (${c.points}/10) below publish bar` }); continue; }
    if (openCoins.has(c.symbol)) { skipped.push({ c, why: `${c.symbol} already has an open crypto idea` }); continue; }
    const dup = existing.find((e) => e.symbol === c.symbol && e.direction === c.direction && e.setup === c.setup && o.nowMs - e.timestampMs < o.dedupHours * 3_600_000);
    if (dup) { skipped.push({ c, why: `same ${c.setup} ${c.direction} published ${((o.nowMs - dup.timestampMs) / 3_600_000).toFixed(1)}h ago` }); continue; }
    if (today >= o.maxPerDay) { skipped.push({ c, why: `daily cap ${o.maxPerDay} reached` }); continue; }
    if (o.maxPerRun != null && publish.length >= o.maxPerRun) { skipped.push({ c, why: `per-run cap ${o.maxPerRun} (correlated book) — next scan` }); continue; }
    publish.push(c); openCoins.add(c.symbol); today++;
  }
  return { publish, skipped };
}

// ─── record ─────────────────────────────────────────────────────────────────
export interface RecordRow { timestamp: string; direction: string; entryPrice: number; stopLoss: number; exitPrice?: number | null; outcomeStatus?: string | null }
export const LOW_N = 20;
export function summarizeCryptoRecord(rows: RecordRow[]) {
  const r = [...rows].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  let wins = 0; let losses = 0; let open = 0; let other = 0; let rSum = 0; let rCount = 0;
  for (const x of r) {
    const s = String(x.outcomeStatus ?? 'open');
    if (s === 'open') { open++; continue; }
    if (s === 'hit_target') wins++; else if (s === 'hit_stop') losses++; else other++;
    const risk = Math.abs(x.entryPrice - x.stopLoss);
    if (x.exitPrice != null && x.exitPrice > 0 && risk > 0) {
      rSum += (String(x.direction) === 'short' ? x.entryPrice - x.exitPrice : x.exitPrice - x.entryPrice) / risk; rCount++;
    }
  }
  const n = wins + losses;
  return {
    n, total: r.length, open, unresolvedClosed: other, wins, losses,
    winRate: n ? wins / n : null, avgR: rCount ? rSum / rCount : null, rCount,
    firstAt: r[0]?.timestamp ?? null, lastAt: r.at(-1)?.timestamp ?? null, lowN: n < LOW_N,
  };
}
