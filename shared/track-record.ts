/**
 * TRACK RECORD — the one function behind every card on Journal › Track record.
 * ===========================================================================
 * Live page, 2026-10-01 07:10 ET, showed four populations side by side:
 *   "Strict win rate 34% · 160 of 467 decided"   model record (outcome v2, since baseline)
 *   "Total Ideas 108"                             legacy v1 stats (stocks only, ±3% rule)
 *   "Expectancy -0.2%" / "Avg Gain -1.5%"         two different v1 averages
 *   "Engine Performance  Flow/Quant/AI/Lotto —"   engine-health buckets that map every real
 *                                                 engine (gex_scanner, market_scanner …) to 'manual'
 * plus a hard-coded "Flow (1,127) and Lotto (341) excluded" banner.
 *
 * Here every number is derived from ONE filtered population run through ONE
 * classifier (computeModelRecord → classifyOutcomeV2), so by construction:
 *   headline.total   = Σ engines[].total   = Σ assets[].total
 *   headline.wins    = Σ engines[].wins    = Σ assets[].wins
 *   headline.decided = wins + losses
 * and with no filters the headline equals /api/performance/model-record.
 *
 * Population: published ideas since OUTCOME_BASELINE_DATE (pre-baseline outcomes
 * are invalid), minus excludeFromTraining and synthetic backfill. The window
 * filter can only narrow that, never reach before the baseline.
 */
import { OUTCOME_BASELINE_DATE, MIN_REPORTABLE_SAMPLE, classifyOutcomeV2, realisedR, reportableRate } from './constants';
import { computeModelRecord, etDateKey, isSyntheticOutcome, type ModelRecord, type RecordIdea } from './model-record';
import { getIdeaSourceMeta } from './idea-sources';

/** The trigger observer (shared/run-up.ts inputs) first ran in prod on this date. */
export const TRIGGER_OBSERVER_START = '2026-09-30';
/** Option contract exits priced at the touch bar (shared/option-exit-pricing.ts) from this date. */
export const OPTION_EXIT_AT_TOUCH_SINCE = '2026-09-30';

export type TrackWindow = 'today' | '7d' | '30d' | '3m' | 'all';
export type TrackAsset = 'all' | 'stock' | 'option' | 'crypto' | 'future';

export interface TrackRecordFilters {
  window?: TrackWindow;
  /** canonical source key (idea-sources), or 'all' */
  engine?: string;
  asset?: TrackAsset;
}

export interface TrackIdea extends RecordIdea {
  assetType?: string | null;
  outcomeNotes?: string | null;
}

export type SampleFlag = 'none' | 'thin' | 'ok';

export interface TrackRow {
  key: string;
  label: string;
  total: number;
  decided: number;
  wins: number;
  losses: number;
  unresolved: number;
  /** percent, null under the sample floor */
  winRate: number | null;
  /** raw wins/decided percent — shown only as "x of y", never as a headline */
  rawWinRate: number | null;
  /** mean realised R over decided ideas with P&L (null when none) */
  avgR: number | null;
  /** mean realised P&L percent (contract % for options, underlying % otherwise) */
  avgPnlPct: number | null;
  pnlN: number;
  sample: SampleFlag;
}

export interface TrackRecord {
  baseline: string;
  /** effective start (ET date) after the window filter */
  since: string;
  filters: Required<TrackRecordFilters>;
  definition: 'outcome-v2';
  sampleFloor: number;
  headline: ModelRecord & {
    avgPnlPct: number | null;
    avgWinPct: number | null;
    avgLossPct: number | null;
    pnlN: number;
  };
  engines: TrackRow[];
  assets: TrackRow[];
  /** every engine present since the baseline — drives the filter dropdown */
  engineOptions: Array<{ key: string; label: string; total: number }>;
  options: {
    included: true;
    since: string;
    exitAtTouchSince: string;
    total: number;
    decided: number;
    unresolved: number;
    /** option rows with a tracker-pass mark; these remain unresolved */
    pricedAtPass: number;
    /** option exits marked from historical trade bars; sensitivity only, not executable fills */
    pricedAtTouchBar: number;
    /** exact contract expiry settlements priced from intrinsic value */
    intrinsicSettlements: number;
    /** option outcomes withheld because no trustworthy contract exit exists */
    withheld: number;
    note: string;
  };
  triggerObserverSince: string;
}

export function assetKey(a?: string | null): Exclude<TrackAsset, 'all'> | string {
  const s = String(a ?? '').toLowerCase();
  if (s === 'option' || s === 'options') return 'option';
  if (s === 'crypto') return 'crypto';
  if (s === 'future' || s === 'futures') return 'future';
  if (s === 'stock' || s === 'equity' || s === 'equities' || s === 'penny_stock' || s === 'etf' || s === '') return 'stock';
  return s;
}

const ASSET_LABEL: Record<string, string> = { stock: 'Stocks & ETFs', option: 'Options', crypto: 'Crypto', future: 'Futures' };

export function sampleFlag(decided: number, floor = MIN_REPORTABLE_SAMPLE): SampleFlag {
  if (decided <= 0) return 'none';
  return decided < floor ? 'thin' : 'ok';
}

/** ET date the window opens, clamped to the baseline. */
export function windowStart(window: TrackWindow, nowMs: number, baseline = OUTCOME_BASELINE_DATE): string {
  const day = 86_400_000;
  let start: string | null = null;
  switch (window) {
    case 'today': start = etDateKey(nowMs); break;
    case '7d': start = etDateKey(nowMs - 7 * day); break;
    case '30d': start = etDateKey(nowMs - 30 * day); break;
    case '3m': start = etDateKey(nowMs - 91 * day); break;
    default: start = null;
  }
  return start && start > baseline ? start : baseline;
}

function pnlOf(i: TrackIdea): number | null {
  const p = i.optionPercentGain ?? i.percentGain;
  return p == null || !Number.isFinite(Number(p)) ? null : Number(p);
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);

function row(key: string, label: string, ideas: TrackIdea[], since: string, floor: number): TrackRow {
  const rec = computeModelRecord(ideas, { since, sampleFloor: floor });
  const rs: number[] = []; const pct: number[] = [];
  for (const i of ideas) {
    if (classifyOutcomeV2(i) === 'unresolved') continue;
    const r = realisedR(i); if (r != null && Number.isFinite(r)) rs.push(r);
    const p = pnlOf(i); if (p != null) pct.push(p);
  }
  return {
    key, label,
    total: rec.total, decided: rec.decided, wins: rec.wins, losses: rec.losses, unresolved: rec.unresolved,
    winRate: rec.winRate,
    rawWinRate: rec.decided ? Math.round((rec.wins / rec.decided) * 1000) / 10 : null,
    avgR: mean(rs), avgPnlPct: mean(pct), pnlN: pct.length,
    sample: sampleFlag(rec.decided, floor),
  };
}

function group<K extends string>(ideas: TrackIdea[], keyOf: (i: TrackIdea) => K): Map<K, TrackIdea[]> {
  const m = new Map<K, TrackIdea[]>();
  for (const i of ideas) { const k = keyOf(i); const a = m.get(k); if (a) a.push(i); else m.set(k, [i]); }
  return m;
}

/** The filtered population every card is computed from (also used for run-up). */
export function trackPopulation<T extends TrackIdea>(
  all: T[], filters: TrackRecordFilters = {}, opts: { nowMs?: number; baseline?: string } = {},
): T[] {
  const since = windowStart(filters.window ?? 'all', opts.nowMs ?? Date.now(), opts.baseline ?? OUTCOME_BASELINE_DATE);
  const sinceMs = Date.parse(`${since}T00:00:00-04:00`);
  const engine = filters.engine || 'all'; const asset = filters.asset ?? 'all';
  return all.filter((i) => {
    const t = i.timestamp instanceof Date ? i.timestamp.getTime() : Date.parse(String(i.timestamp ?? ''));
    return t >= sinceMs && !i.excludeFromTraining && !isSyntheticOutcome(i)
      && (engine === 'all' || getIdeaSourceMeta(i.source).canonical === engine)
      && (asset === 'all' || assetKey(i.assetType) === asset);
  });
}

export function computeTrackRecord(
  all: TrackIdea[],
  filters: TrackRecordFilters = {},
  opts: { nowMs?: number; sampleFloor?: number; baseline?: string } = {},
): TrackRecord {
  const f: Required<TrackRecordFilters> = {
    window: filters.window ?? 'all',
    engine: (filters.engine ?? 'all') || 'all',
    asset: filters.asset ?? 'all',
  };
  const baseline = opts.baseline ?? OUTCOME_BASELINE_DATE;
  const floor = opts.sampleFloor ?? MIN_REPORTABLE_SAMPLE;
  const since = windowStart(f.window, opts.nowMs ?? Date.now(), baseline);
  const baseMs = Date.parse(`${baseline}T00:00:00-04:00`);
  const engineOf = (i: TrackIdea) => getIdeaSourceMeta(i.source).canonical;

  // Engine options come from the whole post-baseline population so the dropdown
  // does not shrink as filters narrow.
  const eligible = (i: TrackIdea, fromMs: number) => {
    const t = i.timestamp instanceof Date ? i.timestamp.getTime() : Date.parse(String(i.timestamp ?? ''));
    return t >= fromMs && !i.excludeFromTraining && !isSyntheticOutcome(i);
  };
  const engineCounts = new Map<string, number>();
  for (const i of all) if (eligible(i, baseMs)) engineCounts.set(engineOf(i), (engineCounts.get(engineOf(i)) ?? 0) + 1);
  const engineOptions = Array.from(engineCounts.entries())
    .map(([key, total]) => ({ key, label: getIdeaSourceMeta(key).label, total }))
    .sort((a, b) => b.total - a.total);

  // ONE population. Everything below is a partition of `pop`.
  const pop = trackPopulation(all, f, { nowMs: opts.nowMs, baseline });

  const rec = computeModelRecord(pop, { since, sampleFloor: floor });
  const winsP: number[] = []; const lossP: number[] = []; const allP: number[] = [];
  for (const i of pop) {
    const o = classifyOutcomeV2(i); if (o === 'unresolved') continue;
    const p = pnlOf(i); if (p == null) continue;
    allP.push(p); (o === 'win' ? winsP : lossP).push(p);
  }

  const engines = Array.from(group(pop, engineOf).entries())
    .map(([k, xs]) => row(k, getIdeaSourceMeta(k).label, xs, since, floor))
    .sort((a, b) => b.decided - a.decided || b.total - a.total);
  const assets = Array.from(group(pop, (i) => assetKey(i.assetType)).entries())
    .map(([k, xs]) => row(k, ASSET_LABEL[k] ?? k, xs, since, floor))
    .sort((a, b) => b.total - a.total);

  const opt = pop.filter((i) => assetKey(i.assetType) === 'option');
  let optDecided = 0; let pricedAtPass = 0; let pricedAtTouchBar = 0; let intrinsicSettlements = 0; let withheld = 0;
  for (const i of opt) {
    const notes = String(i.outcomeNotes ?? '');
    if (notes.includes('[exit-premium:pass]')) pricedAtPass++;
    if (notes.includes('[exit-premium:touch_bar]')) pricedAtTouchBar++;
    if (notes.includes('[exit-premium:withheld]')) withheld++;
    if (notes.includes('[expiry-premium:intrinsic]')) intrinsicSettlements++;
    if (classifyOutcomeV2(i) !== 'unresolved') optDecided++;
  }

  return {
    baseline, since, filters: f, definition: 'outcome-v2', sampleFloor: floor,
    headline: { ...rec, avgPnlPct: mean(allP), avgWinPct: mean(winsP), avgLossPct: mean(lossP), pnlN: allP.length },
    engines, assets, engineOptions,
    options: {
      included: true, since: baseline, exitAtTouchSince: OPTION_EXIT_AT_TOUCH_SINCE,
      total: opt.length, decided: optDecided, unresolved: opt.length - optDecided, pricedAtPass, withheld,
      pricedAtTouchBar, intrinsicSettlements,
      note: `Option ideas count as decided only with a tagged execution exit or exact expiry intrinsic settlement. `
        + `Tracker-pass marks, historical touch-bar prints, unmeasured expiries, unit-corrupted barriers, and never-entered plans remain unresolved.`,
    },
    triggerObserverSince: TRIGGER_OBSERVER_START,
  };
}
