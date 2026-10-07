/**
 * Pure row mappers for the read-only journal books (no DB import, so the
 * journal tests can exercise them): one published trade idea → one journal row.
 */
import type { JournalTrade } from '@shared/schema';
import { classifyOutcomeV2, isUnmeasuredExpiry } from '@shared/constants';
import { isHitTimeUnknown, unresolvedExitLabel } from '@shared/exit-hit-time';
import { captureRatio } from '@shared/exit-policy';
import { readPlanSnapshot } from '@shared/plan-snapshot';

/** The journal wire row (client/src/lib/journal/types.ts JournalTradeRow). */
export type JournalWireRow = Pick<JournalTrade,
  'id' | 'symbol' | 'assetType' | 'direction' | 'optionType' | 'strikePrice' | 'expiryDate' | 'quantity' | 'entryPrice' |
  'exitPrice' | 'fees' | 'entryTime' | 'exitTime' | 'holdingMinutes' | 'realizedPnL' | 'realizedPnLPercent' | 'grossPnL' |
  'status' | 'outcome' | 'notes' | 'emotion' | 'setupType' | 'mistakeTag' | 'rating' | 'screenshot' | 'importBatchId'
> & {
  broker: string;
  userId?: string;
  /** Bot book only: the run (paper portfolio) the fill belongs to. */
  runId?: string | null;
  runLabel?: string | null;
  /** Open bot rows: the last mark and when it was taken — never a 0 standing in for "unknown". */
  mark?: { price: number; asOf: string; unrealizedPnL: number } | null;
  /**
   * Desk rows: set when a target/stop exit's time is the tracker cycle that
   * graded it, not the bar that touched — "resolved at 11:40 ET (hit time unknown)".
   */
  exitTimeNote?: string | null;
  /**
   * Desk rows, closed: realized underlying move ÷ the best favourable underlying
   * move while open (shared/exit-policy.ts captureRatio; docs/EXIT_RULE_REPLAY.md).
   */
  captureRatio?: number | null;
  /** Bot book only: whether option P&L reconciles to its saved execution/settlement evidence. */
  measurementStatus?: 'pending' | 'verified' | 'unverified' | 'not_applicable';
  measurementNote?: string | null;
};

export const r2 = (v: number) => Math.round(v * 100) / 100;
export const minutesBetween = (a: string, b: string | null | undefined) => {
  if (!b) return null;
  const d = (Date.parse(b) - Date.parse(a)) / 60_000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
};
export const outcomeOf = (pnl: number | null): JournalTrade['outcome'] =>
  pnl == null ? 'open' : Math.abs(pnl) < 0.005 ? 'breakeven' : pnl > 0 ? 'win' : 'loss';
export const assetOf = (a: string | null | undefined): JournalTrade['assetType'] =>
  a === 'option' ? 'option' : a === 'crypto' ? 'crypto' : a === 'future' || a === 'futures' ? 'future' : 'stock';


// ─── Trade desk: every published idea, scored as a trade ────

/** Unit size for ideas, which carry no position size of their own. */
export const DESK_STOCK_NOTIONAL = 1000;

export interface DeskIdea {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  entryPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  riskRewardRatio: number | null;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  entryPremium: number | null;
  exitPremium: number | null;
  /** Premium basis: historical contract trade print, tracker-pass fallback, or withheld. */
  exitPremiumBasis?: 'touch_bar' | 'pass' | 'withheld' | null;
  optionPercentGain: number | null;
  outcomeNotes?: string | null;
  exitPrice: number | null;
  percentGain: number | null;
  outcomeStatus: string | null;
  resolutionReason: string | null;
  exitDate: string | null;
  timestamp: string;
  source: string | null;
  catalyst: string | null;
  genConvictionBand: string | null;
  /** The [exit-time:…] tag from outcomeNotes (bar_hit | deadline | live), when present. */
  exitTimeSource?: string | null;
  /** Tracker's peak / trough of the UNDERLYING while the idea was open. */
  highestPriceReached?: number | null;
  lowestPriceReached?: number | null;
  /** Immutable levels and contract terms captured at first publication. */
  convergenceSignalsJson?: unknown;
}

export type DeskMapResult = { row: JournalWireRow } | { excluded: string };

/**
 * One idea → one journal row. Options: 1 contract at the recorded entry premium,
 * exited at the recorded exit premium (or entry × the recorded contract %).
 * Stock/crypto/futures: $1,000 notional at the published entry. Anything that
 * cannot be scored is returned as an exclusion reason — never as a 0 P&L.
 */
export function mapDeskIdea(i: DeskIdea): DeskMapResult {
  const snapshot = readPlanSnapshot(i.convergenceSignalsJson);
  const planEntry = snapshot?.entryPrice ?? i.entryPrice;
  const planTarget = snapshot?.targetPrice ?? i.targetPrice;
  const planStop = snapshot?.stopLoss ?? i.stopLoss;
  const planRr = snapshot?.riskRewardRatio ?? i.riskRewardRatio;
  const planDirection = snapshot?.direction ?? i.direction;
  const planPremium = snapshot?.entryPremium ?? i.entryPremium;
  const planOptionType = snapshot?.optionType ?? i.optionType;
  const planStrike = snapshot?.strikePrice ?? i.strikePrice;
  const planExpiry = snapshot?.expiryDate ?? i.expiryDate;
  const status = (i.outcomeStatus ?? 'open').trim().toLowerCase();
  if ((i.resolutionReason ?? '').startsWith('missed_entry')) return { excluded: 'entry never triggered (missed entry window)' };
  const resolved = status !== 'open' && status !== '';
  if (resolved && isUnmeasuredExpiry(i)) return { excluded: 'expired without a measured exit' };
  const option = i.assetType === 'option';
  if (option && resolved && i.exitPremiumBasis === 'pass') {
    return { excluded: 'option exit premium came from the tracker pass, not the outcome time' };
  }
  if (option && resolved && i.exitPremiumBasis === 'touch_bar') {
    return { excluded: 'option exit premium is a historical trade print, not an executable bid/ask fill' };
  }
  if (option && resolved && !(planPremium != null && planPremium > 0)) {
    return { excluded: 'option idea without a recorded entry premium' };
  }
  if (option && resolved && classifyOutcomeV2({ ...i, assetType: 'option' }) === 'unresolved') {
    return { excluded: 'option outcome lacks a provenance-backed, premium-consistent execution or exact expiry settlement' };
  }
  const short = planDirection === 'short';

  let entry: number, qty: number, exit: number | null = null, pnl: number | null = null, pct: number | null = null;
  if (option) {
    if (!(planPremium != null && planPremium > 0)) return { excluded: 'option idea without a recorded entry premium' };
    entry = planPremium;
    qty = 1;
    if (resolved) {
      exit = i.exitPremium != null && i.exitPremium >= 0 ? i.exitPremium
        : i.optionPercentGain != null ? Math.max(0, entry * (1 + i.optionPercentGain / 100)) : null;
      if (exit == null) return { excluded: 'resolved without a contract exit premium' };
      pnl = (exit - entry) * 100;
      pct = ((exit - entry) / entry) * 100;
    }
  } else {
    if (!(planEntry > 0)) return { excluded: 'no entry price' };
    entry = planEntry;
    qty = DESK_STOCK_NOTIONAL / entry;
    if (resolved) {
      if (i.exitPrice != null && i.exitPrice > 0) pct = ((i.exitPrice - entry) / entry) * 100 * (short ? -1 : 1);
      else if (i.percentGain != null) pct = i.percentGain;
      if (pct == null) return { excluded: 'resolved without an exit price or % result' };
      exit = i.exitPrice != null && i.exitPrice > 0 ? i.exitPrice : entry * (1 + (short ? -1 : 1) * (pct / 100));
      pnl = (pct / 100) * DESK_STOCK_NOTIONAL;
    }
  }
  const exitTime = resolved ? i.exitDate ?? null : null;
  const exitMs = exitTime ? Date.parse(exitTime) : NaN;
  const exitTimeNote = exitTime && Number.isFinite(exitMs) && isHitTimeUnknown(status, i.exitTimeSource)
    ? unresolvedExitLabel(exitMs) : null;
  const plan = [
    `Published ${planDirection.toUpperCase()} ${i.symbol}${option ? ` ${planStrike ?? ''}${(planOptionType ?? '').charAt(0).toUpperCase()} ${planExpiry?.slice(0, 10) ?? ''}` : ''}`.trim(),
    `plan${snapshot ? ` (${snapshot.version} · ${snapshot.capturedAt})` : ''}: entry ${planEntry} · target ${planTarget ?? '—'} · stop ${planStop ?? '—'}${planRr ? ` · R:R ${planRr.toFixed(1)}` : ''}`,
    i.genConvictionBand ? `conviction band at publish: ${i.genConvictionBand}` : null,
    resolved ? `outcome: ${status}${i.resolutionReason ? ` (${i.resolutionReason})` : ''}` : 'still open — no live mark carried here',
    exitTimeNote ? `exit time: ${exitTimeNote} — the tracker could not find the bar that touched the ${status === 'hit_stop' ? 'stop' : 'target'}` : null,
    i.catalyst ? `catalyst: ${i.catalyst}` : null,
  ].filter(Boolean).join('\n');
  const rp = pnl == null ? null : r2(pnl);
  // Capture on the underlying (options too: exitPrice is the underlying at exit).
  const capRaw = resolved ? captureRatio({
    direction: short ? 'short' : 'long', entry: planEntry, exit: i.exitPrice,
    high: i.highestPriceReached ?? null, low: i.lowestPriceReached ?? null,
  }) : null;
  const capture = capRaw == null ? null : r2(capRaw);
  return {
    row: {
      id: `desk:${i.id}`,
      symbol: i.symbol,
      assetType: assetOf(i.assetType),
      // Options are bought contracts (long); stock ideas keep their published side.
      direction: option ? 'long' : short ? 'short' : 'long',
      optionType: (i.optionType as 'call' | 'put' | null) ?? null,
      strikePrice: i.strikePrice ?? null,
      expiryDate: i.expiryDate ?? null,
      quantity: Math.round(qty * 10_000) / 10_000,
      entryPrice: entry,
      exitPrice: exit == null ? null : Math.round(exit * 10_000) / 10_000,
      fees: 0,
      entryTime: i.timestamp,
      exitTime,
      holdingMinutes: minutesBetween(i.timestamp, exitTime),
      realizedPnL: rp,
      realizedPnLPercent: pct == null ? null : r2(pct),
      grossPnL: rp,
      status: resolved ? 'closed' : 'open',
      outcome: outcomeOf(rp),
      notes: plan,
      emotion: null,
      setupType: i.source ?? null,
      mistakeTag: null,
      rating: null,
      screenshot: null,
      importBatchId: null,
      broker: 'trade-desk',
      ...(exitTimeNote ? { exitTimeNote } : {}),
      ...(capture != null ? { captureRatio: capture } : {}),
    },
  };
}
