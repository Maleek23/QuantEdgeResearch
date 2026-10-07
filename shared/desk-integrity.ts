/**
 * NEXUS BOOK INTEGRITY — can a closed NEXUS-ideas row's recorded P&L be true?
 *
 * The NEXUS ideas journal book (server/journal-row-maps.ts mapDeskIdea) scores
 * every published idea as a trade: options = 1 contract × (exit − entry
 * premium) × 100, stock/crypto = $1,000 notional × underlying %. It trusted
 * every stored number. Audit 2026-10-06 (book showed +$271K, PF 50.7, avg win
 * $2.5K vs avg loss $55) traced the inflation paths below to code; each check
 * here is a necessary condition for a recorded P&L to be real, decidable from
 * the row alone (no network). research/verify-nexus-book.ts is the full
 * bar-level recomputation and uses the same bug-class names.
 *
 * 'fail'    → the recorded P&L is not counted by default (row labelled)
 * 'caveat'  → counted, but the label says what is weaker about it
 */
import { isOptionScaleIncoherent, OPTION_SCALE_FLOOR } from './option-unit-guard';
import { exceedsOptionValue, fillOnStrikeScale, optionSideOf } from './option-value-bounds';

export const DESK_BUG_CLASSES = {
  synthetic_or_retroactive: 'not a live publication — a synthetic backfill / replay row written after the fact',
  premium_scale_ladder: `option ladder (entry/target/stop) is premium, not underlying (entry < ${OPTION_SCALE_FLOOR}× strike) — barriers were resolved against spot, so the outcome is an artifact`,
  impossible_exit_premium: 'recorded exit premium exceeds what the contract can be worth (call ≤ underlying, put ≤ strike) — typically an intrinsic floor computed from an off-scale fill',
  impossible_entry_premium: 'recorded entry premium exceeds what the contract can be worth — wrong units (per-contract vs per-share) or a foreign quote',
  fill_off_strike_scale: 'recorded underlying exit is not on the strike\'s scale — any intrinsic floor applied to it is fabricated',
  sub_tick_entry_premium: 'entry premium below $0.05 — not a fillable price; the % return off it is meaningless',
  implausible_contract_multiple: 'exit premium ≥ 25× the entry premium — needs contract-bar evidence before it counts',
  exit_outside_recorded_range: 'recorded underlying exit lies outside the high/low the tracker recorded while the idea was open',
  implausible_underlying_move: 'underlying move larger than the asset can plausibly make over the hold — likely a wrong-instrument / wrong-scale price',
  duplicate: 'same position (symbol, side, contract) as an earlier idea that was still open — the same move counted twice',
  exit_premium_inferred: 'no recorded exit premium; exit derived from the recorded contract %',
  percent_only: 'no recorded exit price; P&L derived from the recorded %',
  outcome_rewritten_post_hoc: 'outcome rewritten after the fact by a contract-path audit script (reported trades, not NBBO)',
  bar_mismatch: 'independent bar recomputation disagrees with the recorded P&L',
  bar_unverifiable: 'no market data was found to recompute this trade',
} as const;

export type DeskBugClass = keyof typeof DESK_BUG_CLASSES;
export interface DeskIntegrityFlag { code: DeskBugClass; severity: 'fail' | 'caveat'; detail: string }

export interface DeskIntegrityInput {
  assetType: string;
  symbol: string;
  direction: string;
  entryPrice: number;
  strikePrice: number | null;
  optionType: string | null;
  entryPremium: number | null;
  exitPremium: number | null;
  optionPercentGain: number | null;
  exitPrice: number | null;
  percentGain: number | null;
  highestPriceReached?: number | null;
  lowestPriceReached?: number | null;
  outcomeStatus: string | null;
  dataSourceUsed?: string | null;
  sessionContext?: string | null;
}

/** Minimum fillable premium. */
export const MIN_FILL_PREMIUM = 0.05;
/** Exit/entry premium multiple that needs bar evidence. */
export const MAX_UNEVIDENCED_MULTIPLE = 25;
/** |move| on the underlying beyond which a stock/crypto exit needs bar evidence. */
export const MAX_STOCK_MOVE_PCT = 40;
export const MAX_CRYPTO_MOVE_PCT = 60;
/** Tolerance around the tracker's recorded extremes (gap fills, rounding). */
export const RANGE_TOLERANCE = 0.02;

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function isSyntheticOrRetroactive(i: Pick<DeskIntegrityInput, 'dataSourceUsed' | 'sessionContext'>): boolean {
  const ds = String(i.dataSourceUsed ?? '').toLowerCase();
  return ds.includes('synthetic') || ds.includes('backfill') || ds.includes('replay') || String(i.sessionContext ?? '').toLowerCase() === 'backfill';
}

export function deskIntegrityFlags(i: DeskIntegrityInput): DeskIntegrityFlag[] {
  const out: DeskIntegrityFlag[] = [];
  const add = (code: DeskBugClass, severity: 'fail' | 'caveat', detail: string) => out.push({ code, severity, detail });
  const status = String(i.outcomeStatus ?? 'open').trim().toLowerCase();
  const resolved = status !== 'open' && status !== '';

  if (isSyntheticOrRetroactive(i)) add('synthetic_or_retroactive', 'fail', `data source "${i.dataSourceUsed ?? i.sessionContext}"`);
  if (String(i.dataSourceUsed ?? '') === 'yahoo-opr-trades') add('outcome_rewritten_post_hoc', 'caveat', 'contract-path audit rewrite');

  if (i.assetType === 'option') {
    const strike = i.strikePrice;
    const side = optionSideOf(i.optionType);
    if (isOptionScaleIncoherent(i)) {
      add('premium_scale_ladder', 'fail', `entry ${i.entryPrice} vs strike ${strike} (${fin(strike) && strike > 0 ? (i.entryPrice / strike).toFixed(3) : 'n/a'}×)`);
    }
    const underlyingAtEntry = fillOnStrikeScale(i.entryPrice, strike) ? i.entryPrice : null;
    if (fin(i.entryPremium) && i.entryPremium > 0) {
      if (exceedsOptionValue(i.entryPremium, side, strike, underlyingAtEntry)) {
        add('impossible_entry_premium', 'fail', `entry premium ${i.entryPremium} > ${side === 'put' ? `strike ${strike}` : `underlying ${underlyingAtEntry}`}`);
      }
      if (i.entryPremium < MIN_FILL_PREMIUM) add('sub_tick_entry_premium', 'fail', `entry premium ${i.entryPremium}`);
    }
    if (resolved && fin(i.entryPremium) && i.entryPremium > 0) {
      let exitPrem: number | null = fin(i.exitPremium) && i.exitPremium >= 0 ? i.exitPremium : null;
      if (exitPrem == null && fin(i.optionPercentGain)) {
        exitPrem = Math.max(0, i.entryPremium * (1 + i.optionPercentGain / 100));
        add('exit_premium_inferred', 'caveat', `exit ${exitPrem.toFixed(2)} from ${i.optionPercentGain}%`);
      }
      if (fin(i.exitPrice) && i.exitPrice > 0 && fin(strike) && strike > 0 && !fillOnStrikeScale(i.exitPrice, strike)) {
        add('fill_off_strike_scale', 'fail', `underlying exit ${i.exitPrice} vs strike ${strike}`);
      }
      if (exitPrem != null) {
        const highs = [i.exitPrice, i.highestPriceReached].filter((x): x is number => fin(x) && x > 0 && fillOnStrikeScale(x, strike));
        const capUnderlying = highs.length ? Math.max(...highs) : null;
        if (exceedsOptionValue(exitPrem, side, strike, capUnderlying)) {
          add('impossible_exit_premium', 'fail', `exit premium ${exitPrem} > ${side === 'put' ? `strike ${strike}` : `underlying ${capUnderlying}`}`);
        }
        if (exitPrem >= MAX_UNEVIDENCED_MULTIPLE * i.entryPremium) {
          add('implausible_contract_multiple', 'fail', `${i.entryPremium} → ${exitPrem} (${(exitPrem / i.entryPremium).toFixed(1)}×)`);
        }
      }
    }
    return out;
  }

  // Stock / crypto / futures: $1,000 notional on the underlying.
  if (resolved && fin(i.entryPrice) && i.entryPrice > 0) {
    const short = i.direction === 'short';
    let pct: number | null = null;
    if (fin(i.exitPrice) && i.exitPrice > 0) pct = ((i.exitPrice - i.entryPrice) / i.entryPrice) * 100 * (short ? -1 : 1);
    else if (fin(i.percentGain)) { pct = i.percentGain; add('percent_only', 'caveat', `${i.percentGain}%`); }
    const limit = i.assetType === 'crypto' ? MAX_CRYPTO_MOVE_PCT : MAX_STOCK_MOVE_PCT;
    if (pct != null && Math.abs(pct) > limit) add('implausible_underlying_move', 'fail', `${pct.toFixed(1)}% (limit ±${limit}%)`);
    const hi = i.highestPriceReached, lo = i.lowestPriceReached;
    if (fin(i.exitPrice) && i.exitPrice > 0 && fin(hi) && fin(lo) && hi > 0 && lo > 0 && hi >= lo) {
      if (i.exitPrice > hi * (1 + RANGE_TOLERANCE) || i.exitPrice < lo * (1 - RANGE_TOLERANCE)) {
        add('exit_outside_recorded_range', 'fail', `exit ${i.exitPrice} vs recorded range ${lo}–${hi}`);
      }
    }
  }
  return out;
}

export const failsIntegrity = (flags: DeskIntegrityFlag[]) => flags.some((f) => f.severity === 'fail');

// ─── Duplicates ──────────────────────────────────────────────

export interface DupCandidate {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  entryMs: number;
  exitMs: number | null;
}

export function positionKey(c: Pick<DupCandidate, 'symbol' | 'assetType' | 'direction' | 'optionType' | 'strikePrice' | 'expiryDate'>): string {
  const base = `${c.symbol.toUpperCase()}|${c.assetType}|${c.direction}`;
  return c.assetType === 'option' ? `${base}|${optionSideOf(c.optionType)}|${c.strikePrice ?? ''}|${String(c.expiryDate ?? '').slice(0, 10)}` : base;
}

/**
 * Closed rows that duplicate an earlier still-open position (same key, entry
 * before the earlier one's exit). Returns id → id of the row it duplicates.
 * The earliest publication keeps the P&L; later copies are labelled.
 */
export function findDuplicates(rows: DupCandidate[]): Map<string, string> {
  const dup = new Map<string, string>();
  const byKey = new Map<string, DupCandidate[]>();
  for (const r of [...rows].sort((a, b) => a.entryMs - b.entryMs || a.id.localeCompare(b.id))) {
    const k = positionKey(r);
    const kept = byKey.get(k) ?? [];
    const overlap = kept.find((p) => p.exitMs == null || r.entryMs < p.exitMs);
    if (overlap) { dup.set(r.id, overlap.id); continue; }
    kept.push(r);
    byKey.set(k, kept);
  }
  return dup;
}
