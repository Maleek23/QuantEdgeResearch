/**
 * LEARNING LEDGER — one feature row per published idea, joined to its outcome.
 * ==========================================================================
 * The input of the gated self-calibration loop (shared/learning-loop.ts,
 * server/learning-loop-job.ts, docs in the job header). Pure: no I/O.
 *
 * POPULATION (statistical honesty rules, all enforced here)
 *   · published at or after OUTCOME_BASELINE_DATE (2026-08-26) — earlier
 *     outcomes are invalid (sub-3% stop-outs were erased) and are NEVER used;
 *   · excludeFromTraining rows, synthetic/backfill rows, duplicate-collapsed and
 *     superseded rows are excluded;
 *   · a row the NEXUS book verification ledger marked MISMATCH is excluded
 *     (recorded vs bar-replayed P&L disagree — its outcome is not trusted);
 *   · options are scored on the CONTRACT's premium (shared/premium-outcome.ts):
 *     R = (exit premium − entry premium) ÷ (entry premium − premium-plan stop).
 *     Underlying movement is never an option's result.
 *   · win / loss / unresolved = classifyOutcomeV2 (the canonical record);
 *     unresolved rows stay in the ledger (coverage) but never in a rate.
 *
 * FEATURES are what was known AT PUBLISH: grade components (g2 factors from
 * nexusGradeAtPublish; v3 inputs when stamped), engine/source, setup kind,
 * direction, GEX regime + distance to flip / walls, flow skew, rotation tag,
 * ET time-of-day bucket, DTE, |delta|, stop width and T1 distance in daily ATR,
 * budget-vs-primary contract. The outcome block carries premium T1 / stop /
 * peak, R, P&L at $500 and $1,000 whole-contract sizing, and call accuracy
 * (from the managed-replay ledger, when present).
 */
import { OUTCOME_BASELINE_DATE, classifyOutcomeV2, type OutcomeV2 } from './constants';
import { premiumPlanFor } from './premium-outcome';

export const LEARNING_LEDGER_VERSION = 'learning-ledger-v1';
export const R_CLIP: readonly [number, number] = [-3, 5];
export const clipR = (r: number) => Math.max(R_CLIP[0], Math.min(R_CLIP[1], r));

export type TodBucket = 'premarket' | 'open' | 'morning' | 'midday' | 'afternoon' | 'power' | 'after';
export type DteBucket = 'stock' | '0' | '1-2' | '3-7' | '8-21' | '22-60' | '61+' | 'n/a';
export type ExcludeReason =
  | 'before_baseline' | 'excluded_from_training' | 'synthetic' | 'verify_mismatch' | 'duplicate' | 'superseded'
  | 'no_entry_premium' | 'draft';

export interface LedgerFeatures {
  engine: string;
  setup: string;
  direction: 'long' | 'short';
  assetType: string;
  vehicle: 'stock' | 'call' | 'put' | 'crypto' | 'other';
  /** g2 grade at publish (nexusGradeAtPublish) — score, letter, factor points. */
  grade: { score: number | null; letter: string | null; version: string | null; f: Record<string, number> | null };
  gradeBand: string;
  /** v3 inputs, when the row carries them (gradeInputs). */
  v3: { stopAtr: number | null; chaseAtr: number | null; regime: number | null; gapAtr: number | null } | null;
  confidence: number | null;
  conviction: { score: number | null; band: string | null };
  gexRegime: string | null;
  /** Signed distances from the underlying entry: (level − entry) ÷ entry, %, and ÷ ATR when known. */
  gex: { flipPct: number | null; callWallPct: number | null; putWallPct: number | null; flipAtr: number | null; wallRoomAtr: number | null };
  /** Flow skew at publish: relative-volume and aggression reads off the engine's tags (null when the engine had none). */
  flow: { rel: number | null; aggr: number | null };
  /** Rotation: sector/stage tag + relative strength vs SPY read WITH the trade. */
  rotation: { tag: 'leading' | 'lagging' | 'neutral' | null; stage: string | null; relSpy: number | null };
  etMinute: number | null;
  tod: TodBucket | null;
  dte: number | null;
  dteBucket: DteBucket;
  delta: number | null;
  /** Daily ATR(14) of the underlying at publish (gradeInputs, else the level-snap note). */
  atr: number | null;
  stopAtr: number | null;
  t1Atr: number | null;
  rr: number | null;
  contract: 'primary' | 'budget_promoted' | 'budget_alt' | 'none';
}

export type CallResultLite = 'win' | 'loss' | 'no_result' | 'pending' | 'not_triggered';

export interface LedgerOutcome {
  status: string;
  result: OutcomeV2;
  decided: boolean;
  basis: 'premium' | 'underlying';
  R: number | null;
  /** Premium plan (options) — entry / T1 / stop the contract was judged against. */
  premium: { entry: number; t1: number; stop: number; exit: number | null; peak: number | null; peakR: number | null; source: string } | null;
  pnl500: number | null;
  pnl1000: number | null;
  /** Whole contracts (options) or shares at each budget; 0 = not affordable at that size. */
  qty500: number | null;
  qty1000: number | null;
  /** Underlying excursion in ATR, in the trade's favour (mfe) and against it (mae); order unknown. */
  mfeAtr: number | null;
  maeAtr: number | null;
  /** Underlying close-out in ATR (exit price), with the trade. */
  closeAtr: number | null;
  call: CallResultLite | null;
  /** Managed-replay R (managed-exit policy), when the replay ledger has the idea. */
  managedR: number | null;
  exitAt: string | null;
}

export interface LedgerRow {
  v: typeof LEARNING_LEDGER_VERSION;
  id: string;
  symbol: string;
  publishedAt: string;
  day: string;
  excluded: ExcludeReason | null;
  features: LedgerFeatures;
  outcome: LedgerOutcome | null;
  builtAt: string;
}

/** The trade_ideas columns the ledger reads (drizzle camelCase). */
export interface LedgerIdea {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  source?: string | null;
  status?: string | null;
  timestamp: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio?: number | null;
  holdingPeriod?: string | null;
  tradeType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  optionDelta?: number | null;
  optionDte?: number | null;
  entryPremium?: number | null;
  exitPremium?: number | null;
  optionPercentGain?: number | null;
  percentGain?: number | null;
  exitPrice?: number | null;
  exitDate?: string | null;
  outcomeStatus?: string | null;
  outcomeNotes?: string | null;
  resolutionReason?: string | null;
  highestPriceReached?: number | null;
  lowestPriceReached?: number | null;
  excludeFromTraining?: boolean | null;
  dataSourceUsed?: string | null;
  sessionContext?: string | null;
  confidenceScore?: number | null;
  probabilityBand?: string | null;
  genConvictionScore?: number | null;
  genConvictionBand?: string | null;
  qualitySignals?: string[] | null;
  convergenceSignalsJson?: unknown;
}

export interface LedgerContext {
  /** Verification ledger verdict by idea id (server/desk-verify-ledger.ts). */
  verdictOf?: (id: string) => 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE' | null;
  /** Managed-replay ledger entry by id (server/managed-replay-ledger.ts). */
  replayOf?: (id: string) => { call: CallResultLite | null; managedR: number | null } | null;
  nowMs?: number;
}

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

const csOf = (x: unknown): Record<string, any> => {
  if (x && typeof x === 'object') return x as Record<string, any>;
  if (typeof x === 'string') { try { const p = JSON.parse(x); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  return {};
};
function sig(signals: string[] | null | undefined, key: string): string | null {
  for (const s of signals ?? []) {
    if (typeof s === 'string' && s.startsWith(`${key}:`)) return s.slice(key.length + 1).trim();
  }
  return null;
}

const ET_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function etDay(ms: number): string { return ET_DAY.format(new Date(ms)); }
export function etMinuteOf(ms: number): number {
  const p: Record<string, string> = {};
  for (const x of ET_FMT.formatToParts(new Date(ms))) p[x.type] = x.value;
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
}

/** ET time-of-day bucket. */
export function todBucket(etMinute: number | null): TodBucket | null {
  if (etMinute == null) return null;
  if (etMinute < 570) return 'premarket';
  if (etMinute < 630) return 'open';        // 09:30–10:30
  if (etMinute < 720) return 'morning';     // 10:30–12:00
  if (etMinute < 840) return 'midday';      // 12:00–14:00
  if (etMinute < 930) return 'afternoon';   // 14:00–15:30
  if (etMinute < 960) return 'power';       // 15:30–16:00
  return 'after';
}
export function dteBucket(assetType: string, dte: number | null): DteBucket {
  if (assetType !== 'option') return assetType === 'stock' || assetType === 'penny_stock' ? 'stock' : 'n/a';
  if (dte == null) return 'n/a';
  if (dte <= 0) return '0';
  if (dte <= 2) return '1-2';
  if (dte <= 7) return '3-7';
  if (dte <= 21) return '8-21';
  if (dte <= 60) return '22-60';
  return '61+';
}
export function gradeBandOf(score: number | null, letter: string | null): string {
  if (letter && /^[A-F]$/.test(letter)) return letter;
  if (score == null) return 'ungraded';
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 45 ? 'D' : 'F';
}

/** "formula stop … inside 1.25× daily ATR ($12.06)" → ATR 9.648. */
export function atrFromLevelSnap(levelSnap: unknown): number | null {
  const notes = Array.isArray((levelSnap as any)?.notes) ? (levelSnap as any).notes : [];
  for (const n of notes) {
    const m = String(n).match(/(\d+(?:\.\d+)?)×\s*daily ATR \(\$(\d+(?:\.\d+)?)\)/);
    if (m) { const k = Number(m[1]), v = Number(m[2]); if (k > 0 && v > 0) return r3(v / k); }
  }
  return null;
}

/** Plan levels on the underlying (not premium)? Mirrors server/grade-v3-inputs.ts levelsOnUnderlying. */
export function levelsOnUnderlying(i: Pick<LedgerIdea, 'assetType' | 'entryPrice' | 'strikePrice'>): boolean {
  if (String(i.assetType ?? '') !== 'option') return true;
  const k = Number(i.strikePrice);
  return !(Number.isFinite(k) && k > 0 && i.entryPrice < k * 0.5);
}

/** "[peak:4.55@2026-10-13T15:57Z|…]" → 4.55. */
export function peakFromNotes(notes: string | null | undefined): number | null {
  const m = String(notes ?? '').match(/\[peak:(\d+(?:\.\d+)?)@/);
  return m ? Number(m[1]) : null;
}

export function calendarDteAt(expiry: string | null | undefined, atMs: number): number | null {
  const e = String(expiry ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return null;
  return Math.round((Date.parse(`${e}T12:00:00Z`) - Date.parse(`${etDay(atMs)}T12:00:00Z`)) / 86_400_000);
}

export function excludeReason(i: LedgerIdea, ctx: LedgerContext = {}): ExcludeReason | null {
  const ms = Date.parse(i.timestamp);
  if (!Number.isFinite(ms) || ms < Date.parse(`${OUTCOME_BASELINE_DATE}T00:00:00-04:00`)) return 'before_baseline';
  if (String(i.status ?? '') === 'draft') return 'draft';
  if (i.excludeFromTraining) return 'excluded_from_training';
  if (String(i.dataSourceUsed ?? '').toLowerCase().includes('synthetic') || i.sessionContext === 'backfill') return 'synthetic';
  const reason = String(i.resolutionReason ?? '').toLowerCase();
  if (reason.startsWith('duplicate')) return 'duplicate';
  if (reason.startsWith('superseded') || reason.startsWith('retired')) return 'superseded';
  if (ctx.verdictOf?.(i.id) === 'MISMATCH') return 'verify_mismatch';
  if (i.assetType === 'option' && !(num(i.entryPremium) != null && Number(i.entryPremium) > 0)) return 'no_entry_premium';
  return null;
}

export function ledgerFeatures(i: LedgerIdea): LedgerFeatures {
  const cs = csOf(i.convergenceSignalsJson);
  const signals = i.qualitySignals ?? [];
  const ms = Date.parse(i.timestamp);
  const dir: 'long' | 'short' = String(i.direction).toLowerCase() === 'short' ? 'short' : 'long';
  const side = dir === 'short' ? -1 : 1;
  const assetType = String(i.assetType ?? '');
  const vehicle: LedgerFeatures['vehicle'] = assetType === 'option' ? (String(i.optionType).toLowerCase() === 'put' ? 'put' : 'call')
    : assetType === 'stock' || assetType === 'penny_stock' ? 'stock' : assetType === 'crypto' ? 'crypto' : 'other';
  const g = cs.nexusGradeAtPublish;
  const f = g && typeof g.f === 'object' && g.f ? Object.fromEntries(Object.entries(g.f).filter(([, v]) => fin(v))) as Record<string, number> : null;
  const grade = { score: fin(g?.score) ? g.score : null, letter: typeof g?.letter === 'string' ? g.letter : null, version: typeof g?.v === 'string' ? g.v : null, f };
  const gi = cs.gradeInputs && cs.gradeInputs.v === 'v3' ? cs.gradeInputs : null;
  const v3 = gi ? { stopAtr: num(gi.stopAtr), chaseAtr: num(gi.chaseAtr), regime: num(gi.regime), gapAtr: num(gi.gapAtr) } : null;
  const atr = num(gi?.atr) ?? atrFromLevelSnap(cs.levelSnap);
  const underlying = levelsOnUnderlying(i);
  const entry = num(i.entryPrice);
  const stopAtr = v3?.stopAtr ?? (atr && underlying && entry && i.stopLoss > 0 ? r3(Math.abs(entry - i.stopLoss) / atr) : null);
  const t1Atr = atr && underlying && entry && i.targetPrice > 0 ? r3(Math.abs(i.targetPrice - entry) / atr) : null;
  const flip = num(sig(signals, 'flip')), cw = num(sig(signals, 'call_wall')), pw = num(sig(signals, 'put_wall'));
  const pct = (lvl: number | null) => (lvl != null && entry && underlying ? r2(((lvl - entry) / entry) * 100) : null);
  const opposing = dir === 'long' ? cw : pw;
  const wallRoomAtr = opposing != null && entry && atr && underlying ? r3((side * (opposing - entry)) / atr) : null;
  const flipAtr = flip != null && entry && atr && underlying ? r3((side * (entry - flip)) / atr) : null;
  const gexRegime = sig(signals, 'gamma_regime') ?? (() => { const r = sig(signals, 'regime'); return r && /gamma/.test(r) ? r : null; })();
  const relSpyRaw = num(sig(signals, 'rel_spy'));
  const relSpy = relSpyRaw != null ? r2(side * relSpyRaw) : null;
  const stage = sig(signals, 'stage') ?? (typeof cs.sectorIgnition?.stage === 'string' ? cs.sectorIgnition.stage : null);
  const rotTag: LedgerFeatures['rotation']['tag'] = relSpy == null ? (stage ? 'neutral' : null) : relSpy > 0.25 ? 'leading' : relSpy < -0.25 ? 'lagging' : 'neutral';
  const etMinute = Number.isFinite(ms) ? etMinuteOf(ms) : null;
  const dte = assetType === 'option' ? (num(i.optionDte) ?? (Number.isFinite(ms) ? calendarDteAt(i.expiryDate, ms) : null)) : null;
  const d = num(i.optionDelta);
  const bc = cs.budgetContract;
  const contract: LedgerFeatures['contract'] = cs.optionsOnly?.action === 'budget_promoted' ? 'budget_promoted'
    : bc && fin(bc.strike) ? (Math.abs(bc.strike - Number(i.strikePrice)) < 1e-6 ? 'primary' : 'budget_alt')
    : assetType === 'option' ? 'primary' : 'none';
  const setup = sig(signals, 'setup') ?? sig(signals, 'kind') ?? (signals.includes('0DTE') ? '0dte' : null) ?? String(i.tradeType ?? i.holdingPeriod ?? 'unknown');
  return {
    engine: String(i.source ?? 'unknown'), setup: setup.toLowerCase(), direction: dir, assetType, vehicle,
    grade, gradeBand: gradeBandOf(grade.score, grade.letter), v3,
    confidence: num(i.confidenceScore), conviction: { score: num(i.genConvictionScore), band: i.genConvictionBand ?? null },
    gexRegime, gex: { flipPct: pct(flip), callWallPct: pct(cw), putWallPct: pct(pw), flipAtr, wallRoomAtr },
    flow: { rel: num(sig(signals, 'flow_rel')), aggr: num(sig(signals, 'flow_aggr')) },
    rotation: { tag: rotTag, stage, relSpy },
    etMinute, tod: todBucket(etMinute), dte, dteBucket: dteBucket(assetType, dte),
    delta: d != null && Math.abs(d) <= 1 ? r3(Math.abs(d)) : null,
    atr, stopAtr, t1Atr, rr: num(i.riskRewardRatio), contract,
  };
}

export function ledgerOutcome(i: LedgerIdea, feat: LedgerFeatures, ctx: LedgerContext = {}): LedgerOutcome {
  const result = classifyOutcomeV2(i as any);
  const decided = result !== 'unresolved';
  const isOpt = i.assetType === 'option';
  const side = feat.direction === 'short' ? -1 : 1;
  const entry = num(i.entryPrice);
  const replay = ctx.replayOf?.(i.id) ?? null;
  let R: number | null = null, pnl500: number | null = null, pnl1000: number | null = null, qty500: number | null = null, qty1000: number | null = null;
  let premium: LedgerOutcome['premium'] = null;
  if (isOpt) {
    const plan = premiumPlanFor(i as any, { zeroDte: feat.dte != null && feat.dte <= 2 });
    const E = num(i.entryPremium);
    if (plan && E && E > 0) {
      const pg = num(i.optionPercentGain);
      const X = num(i.exitPremium) ?? (pg != null ? r2(E * (1 + pg / 100)) : null);
      const risk = E - plan.stop;
      const peak = peakFromNotes(i.outcomeNotes);
      premium = { entry: E, t1: plan.t1, stop: plan.stop, exit: X, peak, peakR: peak != null && risk > 0 ? r3((peak - E) / risk) : null, source: plan.source };
      qty500 = Math.floor(500 / (E * 100));
      qty1000 = Math.floor(1000 / (E * 100));
      if (decided && X != null && risk > 0) {
        R = r3((X - E) / risk);
        pnl500 = r2(qty500 * 100 * (X - E));
        pnl1000 = r2(qty1000 * 100 * (X - E));
      }
    }
  } else if (entry && entry > 0) {
    const pg = num(i.percentGain);
    const risk = Math.abs(entry - i.stopLoss);
    qty500 = Math.floor(500 / entry);
    qty1000 = Math.floor(1000 / entry);
    if (decided && pg != null && risk > 0) {
      R = r3(((pg / 100) * entry) / risk);
      pnl500 = r2(qty500 * entry * (pg / 100));
      pnl1000 = r2(qty1000 * entry * (pg / 100));
    }
  }
  const atr = feat.atr;
  const under = levelsOnUnderlying(i);
  const hi = num(i.highestPriceReached), lo = num(i.lowestPriceReached);
  let mfeAtr: number | null = null, maeAtr: number | null = null, closeAtr: number | null = null;
  if (atr && under && entry) {
    if (hi != null && lo != null && hi > 0 && lo > 0) {
      mfeAtr = r3(Math.max(0, side > 0 ? hi - entry : entry - lo) / atr);
      maeAtr = r3(Math.max(0, side > 0 ? entry - lo : hi - entry) / atr);
    }
    const xp = num(i.exitPrice);
    if (xp != null && xp > 0 && !isOpt) closeAtr = r3((side * (xp - entry)) / atr);
    else if (isOpt && xp != null && xp > entry * 0.5) closeAtr = r3((side * (xp - entry)) / atr);
  }
  return {
    status: String(i.outcomeStatus ?? 'open'), result, decided: decided && R != null, basis: isOpt ? 'premium' : 'underlying',
    R, premium, pnl500, pnl1000, qty500, qty1000, mfeAtr, maeAtr, closeAtr,
    call: replay?.call ?? null, managedR: replay?.managedR ?? null, exitAt: i.exitDate ?? null,
  };
}

export function buildLedgerRow(i: LedgerIdea, ctx: LedgerContext = {}): LedgerRow {
  const ms = Date.parse(i.timestamp);
  const features = ledgerFeatures(i);
  const excluded = excludeReason(i, ctx);
  return {
    v: LEARNING_LEDGER_VERSION, id: i.id, symbol: i.symbol, publishedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : i.timestamp,
    day: Number.isFinite(ms) ? etDay(ms) : '', excluded, features,
    outcome: excluded ? null : ledgerOutcome(i, features, ctx),
    builtAt: new Date(ctx.nowMs ?? Date.now()).toISOString(),
  };
}

/** Rows that count in any statistic: eligible and decided. */
export function decidedRows(rows: LedgerRow[]): LedgerRow[] {
  return rows.filter((r) => !r.excluded && r.outcome?.decided && r.outcome.R != null);
}
