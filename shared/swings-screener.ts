/**
 * MONTHLY SWINGS & LEAPS — research screen for beaten-down quality names.
 *
 * RESEARCH SCREEN — NOT FINANCIAL ADVICE. Nothing here is an order, a signal
 * or a recommendation; the score is an UNVALIDATED composite (no forward log
 * yet) and the contracts are worked examples of what a $500–1,000 budget buys.
 *
 * Pure: the server (server/swings-screener.ts) loads bars, fundamentals,
 * earnings, sector rotation, flow, GEX and option chains and hands them here.
 *
 * FILTER   price 40–85% below its all-time high (monthly highs; falls back to
 *          the 3-year daily high, stated in `athBasis`).
 *
 * SCORE    0–100 = points earned / points AVAILABLE × 100. A factor whose data
 *          is missing is "n/a" — it is left out of both sides, never scored 0 —
 *          and `coverage` says how much of the 100 points had data.
 *          Letters use the NEXUS cut-offs (shared/nexus-grade.ts letterFor:
 *          A ≥ 90 · B ≥ 80 · C ≥ 65 · D ≥ 45 · F).
 *   Fundamentals 35  revenue growth 8 · EPS trend 7 · gross-margin trend 6 ·
 *                    cash vs debt 7 · dilution 7
 *   Structure    35  basing vs falling 9 · 50/200-day reclaim 9 · distance
 *                    from 52w low 7 · RS vs SPY 5 · RS vs sector 5
 *   Catalyst     15  next earnings 30–60 days out 8 · sector rotation 7
 *   Flow / GEX   15  options-flow premium skew 8 · GEX regime / walls 7
 *
 * CONTRACTS (whole contracts only, liquidity gate shared/option-liquidity.ts,
 * sizing shared/budget-contract.ts + shared/position-sizing.ts):
 *   monthly swing  calls 30–60 DTE, |Δ| 0.30–0.55 (holding 'swing')
 *   LEAPS          calls 270–760 DTE, |Δ| 0.60–0.80 stock replacement (holding
 *                  'position'). One contract over $1,000 → say so, then the
 *                  cheapest liquid LEAPS strike that fits, else "over budget".
 */
import { checkContractLiquidity, contractLabel, readLiquidityConfig, type ContractLiquiditySnapshot, type LiquidityConfig } from './option-liquidity';
import { premiumAtLevel, wholeContracts, type BudgetChainRow } from './budget-contract';
import { DEFAULT_PREMIUM_STOP_PCT, MAX_RISK_DOLLARS, RISK_PRESETS } from './position-sizing';
import { letterFor, type NexusGradeLetter } from './nexus-grade';

export const SWINGS_VERSION = 'swings-v1';
export const SWINGS_DISCLAIMER = 'Research screen — not financial advice';
export const SWINGS_CAVEAT = 'unvalidated composite — no forward record yet; contracts are worked examples, not orders';
export const SWINGS_SHARED = 'swings-screener';
export const DRAWDOWN_MIN = 40;
export const DRAWDOWN_MAX = 85;

export const SWING_DTE = [30, 60] as const;
export const SWING_DELTA = [0.30, 0.55] as const;
export const LEAPS_DTE = [270, 760] as const;
export const LEAPS_DELTA = [0.60, 0.80] as const;
/** Cheapest-fit fallback still needs a real delta (not a lottery ticket). */
export const LEAPS_FIT_MIN_DELTA = 0.20;

type Env = Record<string, string | undefined>;
/** SWINGS_SCREENER flag — default ON; off|0|false|no disables the nightly job. */
export function swingsScreenerEnabled(env: Env = typeof process !== 'undefined' ? process.env : {}): boolean {
  return !/^(0|false|off|no)$/i.test(String(env.SWINGS_SCREENER ?? '').trim());
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

// ─── inputs ────────────────────────────────────────────────────────────────

export interface Bar { t: number; o: number; h: number; l: number; c: number; v?: number }

export interface FundamentalsInput {
  /** Quarterly, oldest first. Any value may be null. */
  quarters: Array<{ date: string; revenue: number | null; grossProfit: number | null; dilutedEps: number | null; dilutedShares: number | null }>;
  cash: number | null;
  totalDebt: number | null;
  /** Fallback YoY revenue growth (fraction) when the series is short (Yahoo financialData.revenueGrowth). */
  revenueGrowthFallback?: number | null;
  sharesOutstanding?: number | null;
  asOf: string | null;
  source: string;
}

export interface FlowInput { callPremium: number; putPremium: number; prints: number; days: number; asOf: string | null; source: string }
export interface GexInput { regime: string | null; spot: number | null; flip: number | null; callWall: number | null; putWall: number | null; asOf: string | null; source: string }
export interface RotationInput { groupId: string; label: string; etf: string; quadrant: string | null; stage: string | null; side: string | null; asOf: string | null }

export interface ScreenInput {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  /** Daily bars, oldest first (≥ 1y wanted; 3y for the fallback high). */
  daily: Bar[];
  /** Max monthly high over the full listed history (ATH), when loaded. */
  athMonthly?: { high: number; atMs: number } | null;
  spyDaily?: Bar[] | null;
  sectorDaily?: Bar[] | null;
  sectorEtf?: string | null;
  fundamentals?: FundamentalsInput | null;
  nextEarnings?: { date: string; source: string } | null;
  rotation?: RotationInput | null;
  flow?: FlowInput | null;
  gex?: GexInput | null;
  nowMs: number;
  barsSource?: string;
}

// ─── outputs ───────────────────────────────────────────────────────────────

export type FactorGroup = 'fundamentals' | 'structure' | 'catalyst' | 'flow';
export interface Factor {
  key: string;
  group: FactorGroup;
  label: string;
  /** null = n/a (missing data — excluded from the score, not scored 0). */
  points: number | null;
  max: number;
  value: string;
  note: string;
  asOf: string | null;
}
export interface GroupScore { group: FactorGroup; label: string; points: number; available: number; max: number }

export interface ContractIdea {
  kind: 'swing' | 'leaps';
  holding: 'swing' | 'position';
  label: string;
  strike: number;
  expiry: string;
  dte: number;
  delta: number;
  mid: number;
  bid: number;
  ask: number;
  /** One contract's debit (mid × 100). */
  debitOne: number;
  /** Whole contracts at each budget preset ($500, $1,000). 0 = one contract costs more. */
  qtyAt: Record<string, number>;
  breakeven: number;
  /** Premium stop (−50% swing default, shared/position-sizing.ts). */
  premiumStop: number;
  scenario: { label: string; level: number; premium: number; pnlOne: number; method: string } | null;
  /** LEAPS only: payoff at expiry if the stock is at the scenario level (intrinsic − debit). */
  expiryPnlOne?: number | null;
  liquidity: ContractLiquiditySnapshot;
  note: string;
}
export interface ContractSlot {
  pick: ContractIdea | null;
  /** LEAPS: the in-band (Δ 0.60–0.80) contract when it is over the $1,000 budget. */
  overBudget?: { label: string; debitOne: number; delta: number } | null;
  status: 'ok' | 'fit_fallback' | 'over_budget' | 'no_liquid' | 'no_chain';
  reason: string;
  chainSource: string | null;
  chainAsOf: string | null;
}

export interface ScreenRow {
  v: typeof SWINGS_VERSION;
  symbol: string;
  name: string | null;
  sector: string | null;
  price: number;
  priceAsOf: string | null;
  ath: number;
  athBasis: 'ATH (monthly)' | '3y high';
  drawdownPct: number;
  low52: number | null;
  score: number;
  letter: NexusGradeLetter;
  coverage: number;
  thinData: boolean;
  groups: GroupScore[];
  factors: Factor[];
  nextEarnings: string | null;
  daysToEarnings: number | null;
  swing: ContractSlot | null;
  leaps: ContractSlot | null;
  news: Array<{ title: string; publisher: string | null; at: string | null; link: string | null }>;
  newsAsOf: string | null;
  sources: Record<string, string | null>;
  computedAt: string;
}

// ─── helpers ───────────────────────────────────────────────────────────────

export function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  let s = 0;
  for (let i = xs.length - n; i < xs.length; i++) s += xs[i];
  return s / n;
}
function retN(closes: number[], n: number): number | null {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1 - n];
  const b = closes[closes.length - 1];
  return a > 0 ? (b / a - 1) * 100 : null;
}
const isoOf = (ms: number | null | undefined) => (fin(ms) ? new Date(ms).toISOString() : null);
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;
const money = (x: number) => {
  const a = Math.abs(x);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}M` : `$${a.toFixed(0)}`;
  return x < 0 ? `-${s}` : s;
};

/** Drawdown from the all-time high (monthly), else the 3-year daily high. */
export function drawdownOf(price: number, daily: Bar[], athMonthly?: { high: number } | null): { ath: number; basis: ScreenRow['athBasis']; drawdownPct: number } | null {
  if (!(price > 0)) return null;
  const dailyHigh = daily.reduce((m, b) => (fin(b.h) && b.h > m ? b.h : m), 0);
  const ath = athMonthly && athMonthly.high > 0 ? Math.max(athMonthly.high, dailyHigh) : dailyHigh;
  if (!(ath > 0)) return null;
  return { ath: r2(ath), basis: athMonthly && athMonthly.high > 0 ? 'ATH (monthly)' : '3y high', drawdownPct: r1((1 - price / ath) * 100) };
}
export function inDrawdownBand(dd: number, lo = DRAWDOWN_MIN, hi = DRAWDOWN_MAX): boolean {
  return dd >= lo && dd <= hi;
}

// ─── factors ───────────────────────────────────────────────────────────────

function fundamentalFactors(f: FundamentalsInput | null | undefined): Factor[] {
  const asOf = f?.asOf ?? null;
  const na = (key: string, label: string, max: number, note: string): Factor => ({ key, group: 'fundamentals', label, points: null, max, value: 'n/a', note, asOf });
  if (!f) {
    return [
      na('revenue', 'Revenue growth', 8, 'no fundamentals source answered'),
      na('eps', 'EPS trend', 7, 'no fundamentals source answered'),
      na('gm', 'Gross-margin trend', 6, 'no fundamentals source answered'),
      na('cash', 'Cash vs debt', 7, 'no fundamentals source answered'),
      na('dilution', 'Dilution (share count)', 7, 'no fundamentals source answered'),
    ];
  }
  const q = f.quarters;
  const out: Factor[] = [];

  // Revenue growth — TTM YoY when 8 quarters, else latest quarter YoY, else the provider's YoY.
  const rev = q.map((x) => x.revenue);
  let revG: number | null = null; let revBasis = '';
  const last8 = rev.slice(-8);
  if (last8.length === 8 && last8.every(fin)) {
    const ttm = (last8 as number[]).slice(4).reduce((a, b) => a + b, 0);
    const prior = (last8 as number[]).slice(0, 4).reduce((a, b) => a + b, 0);
    if (prior > 0) { revG = ttm / prior - 1; revBasis = 'TTM vs prior TTM'; }
  }
  if (revG == null && rev.length >= 5) {
    const a = rev[rev.length - 5]; const b = rev[rev.length - 1];
    if (fin(a) && fin(b) && a > 0) { revG = b / a - 1; revBasis = 'latest quarter YoY'; }
  }
  if (revG == null && fin(f.revenueGrowthFallback)) { revG = f.revenueGrowthFallback; revBasis = 'provider quarterly YoY'; }
  if (revG == null) out.push(na('revenue', 'Revenue growth', 8, 'revenue series too short'));
  else {
    const g = revG * 100;
    const pts = g > 20 ? 8 : g > 10 ? 6 : g >= 0 ? 4 : g >= -10 ? 2 : 0;
    out.push({ key: 'revenue', group: 'fundamentals', label: 'Revenue growth', points: pts, max: 8, value: pct(g), note: revBasis, asOf });
  }

  // EPS trend — latest quarter vs the same quarter a year earlier, plus TTM sign.
  const eps = q.map((x) => x.dilutedEps);
  const e4 = eps.slice(-4);
  if (eps.length >= 5 && fin(eps[eps.length - 1]) && fin(eps[eps.length - 5])) {
    const now = eps[eps.length - 1] as number; const yago = eps[eps.length - 5] as number;
    const ttm = e4.every(fin) ? (e4 as number[]).reduce((a, b) => a + b, 0) : null;
    const up = now > yago;
    const pts = (up ? 4 : 0) + (ttm != null && ttm > 0 ? 3 : 0);
    out.push({ key: 'eps', group: 'fundamentals', label: 'EPS trend', points: pts, max: 7, value: `${now.toFixed(2)} vs ${yago.toFixed(2)} yr-ago`, note: `${up ? 'improving' : 'deteriorating'} YoY${ttm != null ? ` · TTM ${ttm.toFixed(2)}` : ''}`, asOf });
  } else if (e4.length >= 2 && e4.every(fin)) {
    const a = e4[0] as number; const b = e4[e4.length - 1] as number;
    const pts = (b > a ? 3 : 0) + (b > 0 ? 2 : 0);
    out.push({ key: 'eps', group: 'fundamentals', label: 'EPS trend', points: pts, max: 7, value: `${b.toFixed(2)} vs ${a.toFixed(2)}`, note: `sequential (${e4.length}q, no yr-ago quarter)`, asOf });
  } else out.push(na('eps', 'EPS trend', 7, 'EPS series too short'));

  // Gross-margin trend — last 2 quarters vs the same 2 a year earlier (pp).
  const gm = q.map((x) => (fin(x.grossProfit) && fin(x.revenue) && x.revenue > 0 ? x.grossProfit / x.revenue : null));
  if (gm.length >= 6 && [gm.length - 1, gm.length - 2, gm.length - 5, gm.length - 6].every((i) => fin(gm[i]))) {
    const now = ((gm[gm.length - 1] as number) + (gm[gm.length - 2] as number)) / 2;
    const ago = ((gm[gm.length - 5] as number) + (gm[gm.length - 6] as number)) / 2;
    const d = (now - ago) * 100;
    const pts = d > 1 ? 6 : d >= -1 ? 4 : d >= -3 ? 2 : 0;
    out.push({ key: 'gm', group: 'fundamentals', label: 'Gross-margin trend', points: pts, max: 6, value: `${(now * 100).toFixed(1)}% (${d >= 0 ? '+' : ''}${d.toFixed(1)}pp YoY)`, note: '2-quarter average vs a year earlier', asOf });
  } else if (gm.length >= 2 && fin(gm[gm.length - 1]) && fin(gm[0])) {
    const d = ((gm[gm.length - 1] as number) - (gm[0] as number)) * 100;
    const pts = d > 1 ? 5 : d >= -1 ? 3 : d >= -3 ? 1 : 0;
    out.push({ key: 'gm', group: 'fundamentals', label: 'Gross-margin trend', points: pts, max: 6, value: `${((gm[gm.length - 1] as number) * 100).toFixed(1)}% (${d >= 0 ? '+' : ''}${d.toFixed(1)}pp)`, note: `over ${gm.length} quarters (short series)`, asOf });
  } else out.push(na('gm', 'Gross-margin trend', 6, 'no gross profit / revenue series'));

  // Cash vs debt.
  if (fin(f.cash) && fin(f.totalDebt)) {
    const cash = f.cash; const debt = f.totalDebt;
    const ratio = debt <= 0 ? Infinity : cash / debt;
    const pts = ratio >= 1 ? 7 : ratio >= 0.5 ? 4 : ratio >= 0.25 ? 2 : 0;
    out.push({ key: 'cash', group: 'fundamentals', label: 'Cash vs debt', points: pts, max: 7, value: `${money(cash)} cash · ${money(debt)} debt`, note: debt <= 0 ? 'no debt' : `net ${money(cash - debt)} (${ratio.toFixed(2)}× cover)`, asOf });
  } else out.push(na('cash', 'Cash vs debt', 7, 'balance-sheet cash/debt missing'));

  // Dilution — diluted share count vs a year earlier.
  const sh = q.map((x) => x.dilutedShares);
  if (sh.length >= 5 && fin(sh[sh.length - 1]) && fin(sh[sh.length - 5]) && (sh[sh.length - 5] as number) > 0) {
    const ch = ((sh[sh.length - 1] as number) / (sh[sh.length - 5] as number) - 1) * 100;
    const pts = ch <= 0 ? 7 : ch < 2 ? 5 : ch < 5 ? 3 : ch < 10 ? 1 : 0;
    out.push({ key: 'dilution', group: 'fundamentals', label: 'Dilution (share count)', points: pts, max: 7, value: pct(ch), note: ch <= 0 ? 'share count shrinking (buybacks)' : 'diluted shares YoY', asOf });
  } else out.push(na('dilution', 'Dilution (share count)', 7, 'share-count series too short'));
  return out;
}

function structureFactors(i: ScreenInput, price: number): { factors: Factor[]; low52: number | null } {
  const d = i.daily;
  const asOf = isoOf(d[d.length - 1]?.t);
  const closes = d.map((b) => b.c);
  const out: Factor[] = [];
  const na = (key: string, label: string, max: number, note: string): Factor => ({ key, group: 'structure', label, points: null, max, value: 'n/a', note, asOf });

  // Basing vs falling — lower lows over the last 3 months?
  if (d.length >= 126) {
    const minL = (a: Bar[]) => a.reduce((m, b) => Math.min(m, b.l), Infinity);
    const last21 = minL(d.slice(-21));
    const last63 = minL(d.slice(-63));
    const prior63 = minL(d.slice(-126, -63));
    const prior42 = minL(d.slice(-63, -21));
    const lowerLow3m = last63 < prior63;
    const lowerLow1m = last21 < prior42;
    const pts = !lowerLow3m ? 9 : !lowerLow1m ? 5 : 0;
    const state = !lowerLow3m ? 'basing — no lower low in 3 months' : !lowerLow1m ? 'stabilising — last lower low > 1 month ago' : 'falling — lower low this month';
    out.push({ key: 'basing', group: 'structure', label: 'Basing vs falling', points: pts, max: 9, value: state.split(' — ')[0], note: state, asOf });
  } else out.push(na('basing', 'Basing vs falling', 9, `${d.length} daily bars (< 126)`));

  // 50 / 200-day reclaim.
  const s50 = sma(closes, 50); const s200 = sma(closes, 200);
  if (s50 != null) {
    const a50 = price > s50; const a200 = s200 != null ? price > s200 : null;
    const pts = (a50 ? 4 : 0) + (a200 ? 5 : 0);
    const max = s200 != null ? 9 : 4;
    out.push({ key: 'reclaim', group: 'structure', label: '50/200-day reclaim', points: pts, max, value: `${a50 ? 'above' : 'below'} 50d${a200 == null ? '' : ` · ${a200 ? 'above' : 'below'} 200d`}`, note: `50d ${s50.toFixed(2)}${s200 != null ? ` · 200d ${s200.toFixed(2)}` : ' · 200d n/a (short history)'}`, asOf });
  } else out.push(na('reclaim', '50/200-day reclaim', 9, 'fewer than 50 bars'));

  // Distance from the 52-week low.
  const yr = d.slice(-252);
  const low52 = yr.length ? yr.reduce((m, b) => Math.min(m, b.l), Infinity) : null;
  if (low52 != null && Number.isFinite(low52) && low52 > 0) {
    const off = (price / low52 - 1) * 100;
    const pts = off >= 10 && off <= 40 ? 7 : (off >= 5 && off < 10) || (off > 40 && off <= 60) ? 4 : off > 60 ? 3 : 1;
    out.push({ key: 'low52', group: 'structure', label: 'Distance from 52w low', points: pts, max: 7, value: `${pct(off)} off ${low52.toFixed(2)}`, note: off < 5 ? 'sitting on the low — no base yet' : off < 10 ? 'just off the low' : off <= 40 ? 'off the low, not yet extended' : 'well off the low', asOf });
  } else out.push(na('low52', 'Distance from 52w low', 7, 'no 52-week range'));

  // Relative strength vs SPY and vs sector, 1 and 3 months.
  const rs = (other: Bar[] | null | undefined, key: string, label: string, vs: string) => {
    if (!other || other.length < 64 || closes.length < 64) { out.push(na(key, label, 5, `no ${vs} bars`)); return; }
    const oc = other.map((b) => b.c);
    const m1 = (retN(closes, 21) ?? 0) - (retN(oc, 21) ?? 0);
    const m3 = (retN(closes, 63) ?? 0) - (retN(oc, 63) ?? 0);
    const pts = (m1 > 0 ? 2.5 : 0) + (m3 > 0 ? 2.5 : 0);
    out.push({ key, group: 'structure', label, points: pts, max: 5, value: `1m ${pct(m1)} · 3m ${pct(m3)}`, note: `excess return vs ${vs}`, asOf });
  };
  rs(i.spyDaily, 'rs_spy', 'RS vs SPY', 'SPY');
  rs(i.sectorDaily, 'rs_sector', 'RS vs sector', i.sectorEtf ?? 'sector ETF');
  return { factors: out, low52: low52 != null && Number.isFinite(low52) ? r2(low52) : null };
}

export function daysUntil(dateIso: string | null | undefined, nowMs: number): number | null {
  if (!dateIso) return null;
  const t = Date.parse(String(dateIso).length <= 10 ? `${dateIso}T12:00:00Z` : String(dateIso));
  return Number.isFinite(t) ? Math.round((t - nowMs) / 86_400_000) : null;
}

function catalystFactors(i: ScreenInput): Factor[] {
  const out: Factor[] = [];
  const dte = daysUntil(i.nextEarnings?.date, i.nowMs);
  if (dte == null || dte < 0) out.push({ key: 'earnings', group: 'catalyst', label: 'Earnings window', points: null, max: 8, value: 'n/a', note: dte != null ? 'stored date already passed' : 'no upcoming earnings date', asOf: null });
  else {
    const pts = dte >= 30 && dte <= 60 ? 8 : (dte >= 15 && dte < 30) || (dte > 60 && dte <= 75) ? 4 : 1;
    out.push({ key: 'earnings', group: 'catalyst', label: 'Earnings window', points: pts, max: 8, value: `${dte}d (${String(i.nextEarnings!.date).slice(0, 10)})`, note: dte >= 30 && dte <= 60 ? 'inside a 30–60 DTE monthly' : dte < 30 ? 'under 30 days — lands early in a monthly (IV crush risk)' : 'beyond a 60-day monthly', asOf: i.nextEarnings!.source });
  }
  const r = i.rotation;
  if (!r || (!r.quadrant && !r.stage)) out.push({ key: 'rotation', group: 'catalyst', label: 'Sector rotation', points: null, max: 7, value: 'n/a', note: r ? `${r.label}: no weekly read yet` : 'symbol not mapped to a sector group', asOf: r?.asOf ?? null });
  else {
    const q = (r.quadrant ?? '').toLowerCase();
    const longIgnite = r.side === 'long' && (r.stage === 'igniting' || r.stage === 'stirring');
    const base = q === 'improving' ? 6 : q === 'leading' ? 5 : q === 'weakening' ? 2 : q === 'lagging' ? 1 : 3;
    const pts = Math.min(7, base + (longIgnite ? 1 : 0));
    out.push({ key: 'rotation', group: 'catalyst', label: 'Sector rotation', points: pts, max: 7, value: `${r.label} (${r.etf}) ${q || '—'}`, note: `weekly RRG ${q || 'n/a'} · ignition ${r.stage ?? 'n/a'}${r.side ? ` ${r.side}` : ''}`, asOf: r.asOf });
  }
  return out;
}

function flowFactors(i: ScreenInput, price: number): Factor[] {
  const out: Factor[] = [];
  const f = i.flow;
  if (!f || f.prints < 3 || f.callPremium + f.putPremium <= 0) out.push({ key: 'flow', group: 'flow', label: 'Options-flow skew', points: null, max: 8, value: 'n/a', note: f ? `${f.prints} prints in ${f.days}d — too few` : 'no flow history', asOf: f?.asOf ?? null });
  else {
    const share = f.callPremium / (f.callPremium + f.putPremium);
    const pts = share >= 0.65 ? 8 : share >= 0.55 ? 6 : share >= 0.45 ? 4 : share >= 0.35 ? 2 : 0;
    out.push({ key: 'flow', group: 'flow', label: 'Options-flow skew', points: pts, max: 8, value: `${Math.round(share * 100)}% call premium`, note: `${f.prints} prints, ${f.days}d · contract-type skew only (buyer/seller side unknown)`, asOf: f.asOf });
  }
  const g = i.gex;
  if (!g || !g.regime) out.push({ key: 'gex', group: 'flow', label: 'GEX regime / walls', points: null, max: 7, value: 'n/a', note: 'no recent gex_snapshots row', asOf: g?.asOf ?? null });
  else {
    const pos = /positive/i.test(g.regime);
    const aboveFlip = fin(g.flip) ? price >= g.flip : null;
    const supportBelow = fin(g.putWall) && g.putWall <= price && (price - g.putWall) / price <= 0.06;
    const pts = Math.min(7, (pos ? 4 : /neutral|transition/i.test(g.regime) ? 2 : 1) + (aboveFlip ? 2 : 0) + (supportBelow ? 1 : 0));
    out.push({ key: 'gex', group: 'flow', label: 'GEX regime / walls', points: pts, max: 7, value: `${g.regime.replace(/_/g, ' ')}${fin(g.flip) ? ` · flip ${g.flip.toFixed(2)}` : ''}`, note: `${fin(g.putWall) ? `put wall ${g.putWall}` : 'no put wall'}${fin(g.callWall) ? ` · call wall ${g.callWall}` : ''}${supportBelow ? ' · put wall within 6% below = support' : ''}`, asOf: g.asOf });
  }
  return out;
}

const GROUP_LABEL: Record<FactorGroup, string> = { fundamentals: 'Fundamentals', structure: 'Structure', catalyst: 'Catalyst window', flow: 'Flow / GEX' };
const GROUP_MAX: Record<FactorGroup, number> = { fundamentals: 35, structure: 35, catalyst: 15, flow: 15 };

/** Score = earned / available × 100 (n/a factors excluded); coverage = available / 100. */
export function scoreFactors(factors: Factor[]): { score: number; letter: NexusGradeLetter; coverage: number; groups: GroupScore[] } {
  const groups: GroupScore[] = (Object.keys(GROUP_LABEL) as FactorGroup[]).map((g) => {
    const fs = factors.filter((f) => f.group === g);
    return {
      group: g, label: GROUP_LABEL[g], max: GROUP_MAX[g],
      points: r1(fs.reduce((s, f) => s + (f.points ?? 0), 0)),
      available: fs.reduce((s, f) => s + (f.points == null ? 0 : f.max), 0),
    };
  });
  const earned = factors.reduce((s, f) => s + (f.points ?? 0), 0);
  const avail = factors.reduce((s, f) => s + (f.points == null ? 0 : f.max), 0);
  const score = avail > 0 ? Math.round((earned / avail) * 100) : 0;
  return { score, letter: letterFor(score), coverage: Math.round(avail) / 100, groups };
}

// ─── contracts ─────────────────────────────────────────────────────────────

export interface ContractInput {
  symbol: string;
  spot: number;
  ath: number;
  rows: BudgetChainRow[];
  nowMs: number;
  source: string;
  asOf: string;
  liqCfg?: LiquidityConfig;
  budgetMax?: number;
}

type Cand = { row: BudgetChainRow; mid: number; liq: ContractLiquiditySnapshot; liqOk: boolean };
function candidates(i: ContractInput, dte: readonly [number, number]): { all: Cand[]; inDte: number } {
  const cfg = i.liqCfg ?? readLiquidityConfig({});
  const all: Cand[] = [];
  let inDte = 0;
  for (const row of i.rows) {
    if (row.type !== 'call' || !(row.dte >= dte[0] && row.dte <= dte[1])) continue;
    inDte++;
    if (!fin(row.delta) || !(fin(row.bid) && fin(row.ask) && row.bid > 0 && row.ask >= row.bid)) continue;
    const mid = r2((row.bid + row.ask) / 2);
    const label = contractLabel(i.symbol, row.expiry, row.strike, row.type);
    const v = checkContractLiquidity(
      { symbol: i.symbol, openInterest: row.openInterest, volume: row.volume, prevVolume: row.prevVolume, bid: row.bid, ask: row.ask, dte: row.dte },
      { nowMs: i.nowMs, cfg, source: i.source, asOf: i.asOf, contract: label },
    );
    all.push({ row, mid, liq: v.snapshot, liqOk: !cfg.enabled || v.ok });
  }
  return { all, inDte };
}

function buildIdea(i: ContractInput, c: Cand, kind: 'swing' | 'leaps', note: string): ContractIdea {
  const { row, mid } = c;
  const debitOne = r2(mid * 100);
  const qtyAt: Record<string, number> = {};
  for (const b of RISK_PRESETS) qtyAt[String(b)] = wholeContracts(b, mid);
  const halfDays = Math.max(1, Math.round(row.dte / 2));
  let scenario: ContractIdea['scenario'] = null;
  let expiryPnlOne: number | null = null;
  if (kind === 'leaps') {
    const level = r2(i.spot + 0.5 * (i.ath - i.spot));
    const p = premiumAtLevel(row, mid, i.spot, level, halfDays);
    scenario = { label: `stock halfway back to ATH ($${level}) by mid-life`, level, premium: p.premium, pnlOne: r2((p.premium - mid) * 100), method: p.method === 'bs' ? 'Black-Scholes re-price at row IV' : 'delta/gamma approximation' };
    expiryPnlOne = r2((Math.max(0, level - row.strike) - mid) * 100);
  } else {
    const level = r2(i.spot * 1.10);
    const p = premiumAtLevel(row, mid, i.spot, level, halfDays);
    scenario = { label: `stock +10% ($${level}) by mid-life`, level, premium: p.premium, pnlOne: r2((p.premium - mid) * 100), method: p.method === 'bs' ? 'Black-Scholes re-price at row IV' : 'delta/gamma approximation' };
  }
  return {
    kind, holding: kind === 'leaps' ? 'position' : 'swing',
    label: contractLabel(i.symbol, row.expiry, row.strike, row.type),
    strike: row.strike, expiry: row.expiry.slice(0, 10), dte: row.dte, delta: r2(Math.abs(row.delta!)),
    mid, bid: row.bid!, ask: row.ask!, debitOne, qtyAt,
    breakeven: r2(row.strike + mid),
    premiumStop: r2(mid * (1 - DEFAULT_PREMIUM_STOP_PCT.swing)),
    scenario, expiryPnlOne, liquidity: { ...c.liq, action: 'kept' }, note,
  };
}

const spreadOf = (c: Cand) => (c.row.ask! - c.row.bid!) / Math.max(0.01, c.mid);

/** Monthly swing: 30–60 DTE calls, |Δ| 0.30–0.55, liquid, ≥ 1 whole contract within the budget. Closest to Δ0.42, then tighter spread. */
export function pickSwingContract(i: ContractInput): ContractSlot {
  const budget = Math.min(MAX_RISK_DOLLARS, i.budgetMax ?? MAX_RISK_DOLLARS);
  const { all, inDte } = candidates(i, SWING_DTE);
  const base = { chainSource: i.source, chainAsOf: i.asOf };
  if (!inDte) return { pick: null, status: 'no_chain', reason: `no ${SWING_DTE[0]}–${SWING_DTE[1]} DTE calls in the chain`, ...base };
  const band = all.filter((c) => Math.abs(c.row.delta!) >= SWING_DELTA[0] && Math.abs(c.row.delta!) <= SWING_DELTA[1]);
  const liquid = band.filter((c) => c.liqOk);
  const fits = liquid.filter((c) => wholeContracts(budget, c.mid) >= 1);
  if (!fits.length) {
    const why = !band.length ? `no call with Δ ${SWING_DELTA[0]}–${SWING_DELTA[1]}` : !liquid.length ? `${band.length} in-band calls, none pass the liquidity gate` : `cheapest liquid in-band call $${Math.min(...liquid.map((c) => c.mid * 100)).toFixed(0)} > $${budget}`;
    return { pick: null, status: !liquid.length ? 'no_liquid' : 'over_budget', reason: why, ...base };
  }
  fits.sort((a, b) => Math.abs(Math.abs(a.row.delta!) - 0.42) - Math.abs(Math.abs(b.row.delta!) - 0.42) || spreadOf(a) - spreadOf(b));
  const c = fits[0];
  return { pick: buildIdea(i, c, 'swing', `best of ${fits.length} liquid in-band calls within $${budget}`), status: 'ok', reason: 'in band, liquid, fits budget', ...base };
}

/**
 * LEAPS: 270–760 DTE calls, |Δ| 0.60–0.80 (closest to 0.70, liquid). If one
 * contract is over $1,000, say so and fall back to the cheapest-fit liquid
 * LEAPS strike (highest delta ≥ 0.20 whose debit fits), else "over budget".
 */
export function pickLeapsContract(i: ContractInput): ContractSlot {
  const budget = Math.min(MAX_RISK_DOLLARS, i.budgetMax ?? MAX_RISK_DOLLARS);
  const { all, inDte } = candidates(i, LEAPS_DTE);
  const base = { chainSource: i.source, chainAsOf: i.asOf };
  if (!inDte) return { pick: null, status: 'no_chain', reason: `no ${LEAPS_DTE[0]}–${LEAPS_DTE[1]} DTE calls listed / loaded`, ...base };
  const liquid = all.filter((c) => c.liqOk);
  const band = liquid.filter((c) => Math.abs(c.row.delta!) >= LEAPS_DELTA[0] && Math.abs(c.row.delta!) <= LEAPS_DELTA[1]);
  band.sort((a, b) => Math.abs(Math.abs(a.row.delta!) - 0.70) - Math.abs(Math.abs(b.row.delta!) - 0.70) || spreadOf(a) - spreadOf(b));
  const best = band[0] ?? null;
  if (best && best.mid * 100 <= budget) {
    return { pick: buildIdea(i, best, 'leaps', `Δ${Math.abs(best.row.delta!).toFixed(2)} stock replacement`), status: 'ok', reason: '1 contract within budget', ...base };
  }
  const overBudget = best ? { label: contractLabel(i.symbol, best.row.expiry, best.row.strike, 'call'), debitOne: r2(best.mid * 100), delta: r2(Math.abs(best.row.delta!)) } : null;
  const fit = liquid.filter((c) => c.mid * 100 <= budget && Math.abs(c.row.delta!) >= LEAPS_FIT_MIN_DELTA);
  fit.sort((a, b) => Math.abs(b.row.delta!) - Math.abs(a.row.delta!) || a.mid - b.mid);
  const head = overBudget ? `1 contract of ${overBudget.label} = $${overBudget.debitOne.toFixed(0)} — over the $${budget} budget` : 'no liquid Δ0.60–0.80 LEAPS';
  if (fit.length) {
    const c = fit[0];
    return { pick: buildIdea(i, c, 'leaps', `${head}; cheapest-fit liquid LEAPS (Δ${Math.abs(c.row.delta!).toFixed(2)} — less stock-like)`), overBudget, status: 'fit_fallback', reason: head, ...base };
  }
  return { pick: null, overBudget, status: liquid.length ? 'over_budget' : 'no_liquid', reason: liquid.length ? `${head}; no liquid LEAPS strike fits $${budget}` : `${inDte} LEAPS calls listed, none pass the liquidity gate`, ...base };
}

// ─── row ───────────────────────────────────────────────────────────────────

/** Screen one symbol. null when it has no price or is outside the drawdown band (caller decides the band). */
export function screenSymbol(i: ScreenInput, opts: { band?: [number, number] } = {}): Omit<ScreenRow, 'swing' | 'leaps' | 'news' | 'newsAsOf'> | null {
  const last = i.daily[i.daily.length - 1];
  if (!last || !(last.c > 0)) return null;
  const price = last.c;
  const dd = drawdownOf(price, i.daily, i.athMonthly);
  if (!dd) return null;
  const [lo, hi] = opts.band ?? [DRAWDOWN_MIN, DRAWDOWN_MAX];
  if (!inDrawdownBand(dd.drawdownPct, lo, hi)) return null;
  const st = structureFactors(i, price);
  const factors = [...fundamentalFactors(i.fundamentals), ...st.factors, ...catalystFactors(i), ...flowFactors(i, price)];
  const s = scoreFactors(factors);
  return {
    v: SWINGS_VERSION,
    symbol: i.symbol.toUpperCase(),
    name: i.name ?? null,
    sector: i.sector ?? null,
    price: r2(price),
    priceAsOf: isoOf(last.t),
    ath: dd.ath, athBasis: dd.basis, drawdownPct: dd.drawdownPct,
    low52: st.low52,
    score: s.score, letter: s.letter, coverage: s.coverage, thinData: s.coverage < 0.6,
    groups: s.groups, factors,
    nextEarnings: i.nextEarnings?.date ? String(i.nextEarnings.date).slice(0, 10) : null,
    daysToEarnings: daysUntil(i.nextEarnings?.date, i.nowMs),
    sources: {
      bars: i.barsSource ?? null,
      fundamentals: i.fundamentals?.source ?? null,
      earnings: i.nextEarnings?.source ?? null,
      rotation: i.rotation ? 'sector-ignition weekly' : null,
      flow: i.flow?.source ?? null,
      gex: i.gex?.source ?? null,
    },
    computedAt: new Date(i.nowMs).toISOString(),
  };
}

// ─── filters + sort (page and API share them) ──────────────────────────────

export interface SwingsFilter { ddMin?: number; ddMax?: number; sector?: string | null; minScore?: number; earningsWithin?: number | null }
export function filterRows<T extends Pick<ScreenRow, 'drawdownPct' | 'sector' | 'score' | 'daysToEarnings'>>(rows: T[], f: SwingsFilter): T[] {
  return rows.filter((r) =>
    (f.ddMin == null || r.drawdownPct >= f.ddMin)
    && (f.ddMax == null || r.drawdownPct <= f.ddMax)
    && (!f.sector || r.sector === f.sector)
    && (f.minScore == null || r.score >= f.minScore)
    && (f.earningsWithin == null || (r.daysToEarnings != null && r.daysToEarnings >= 0 && r.daysToEarnings <= f.earningsWithin)));
}
/** Rank: score desc, then coverage desc (more evidence first), then deeper drawdown. */
export function rankRows<T extends Pick<ScreenRow, 'score' | 'coverage' | 'drawdownPct' | 'symbol'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.score - a.score || b.coverage - a.coverage || b.drawdownPct - a.drawdownPct || a.symbol.localeCompare(b.symbol));
}

/** "4h ago" style age for stamps. */
export function ageText(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return 'n/a';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'n/a';
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172_800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
