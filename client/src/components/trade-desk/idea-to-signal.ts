/**
 * Adapter — Trade Desk's `prediction` and `setup` shapes → canonical SignalData
 *
 * Both come from different APIs:
 *   prediction → /api/discovery/overnight-predictions  (forward-looking)
 *   setup      → /api/trade-ideas/best-setups          (live trade ideas)
 *
 * Maps them into the SignalData contract used by <SignalCard /> so the
 * Oracle Terminal styling (confidence gauge, T1 progress, "what to do now",
 * Oracle Option Pick, signal components, trade timeline) renders uniformly.
 */
import type { SignalData, SignalDirection, SignalStatus } from '@/components/signal-card';

const safe = (v: any, fb = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
};

function tierToConfidence(tier?: string, fallback = 50): number {
  switch (tier) {
    case 'HIGH_CONVICTION': return 88;
    case 'STRONG_SETUP':    return 74;
    case 'WATCH_CLOSELY':   return 58;
    case 'SPECULATIVE':     return 42;
    default: return fallback;
  }
}

function holdLabel(days: number | undefined, defaultLabel = 'SWING'): string {
  if (!days || days <= 0) return defaultLabel;
  if (days <= 1) return '1 DAY';
  if (days <= 5) return `${days} DAYS`;
  if (days <= 14) return `${Math.round(days / 7)} WEEKS`;
  if (days <= 60) return `${Math.round(days / 7)} WEEKS`;
  if (days <= 365) return `${Math.round(days / 30)} MONTHS`;
  return `${Math.round(days / 365)} YEARS`;
}

// ─── Prediction (forward-looking AI overnight scan) ──────────────────
export function predictionToSignal(pred: any): SignalData {
  const spot = safe(pred.currentPrice ?? pred.spot ?? pred.spotPrice);
  const t1 = safe(pred.prediction?.targetRange?.low ?? pred.prediction?.target ?? spot * 1.05);
  const t2 = safe(pred.prediction?.targetRange?.high ?? spot * 1.10);
  const stop = safe(pred.prediction?.stopLoss ?? spot * 0.94);
  const confidence = safe(pred.prediction?.probability, tierToConfidence(pred.prediction?.tier));
  const direction: SignalDirection =
    pred.prediction?.direction === 'bearish' || pred.direction === 'BEAR' ? 'BEAR' :
    pred.prediction?.direction === 'neutral' ? 'NEUTRAL' : 'BULL';

  return {
    id: pred.id ?? `${pred.symbol}-${pred.timestamp ?? Date.now()}`,
    symbol: pred.symbol,
    direction,
    spot,
    spotChangeToday: safe(pred.change ?? pred.changePct),
    confidence,
    confidenceDelta: 0,
    holdPeriodLabel: holdLabel(pred.prediction?.daysToTarget, 'OVERNIGHT'),
    entry: spot,                      // forward idea → entry = current spot
    t1,
    t2,
    stop,
    pnlPct: 0,
    pnlAbs: 0,
    daysActive: 0,
    status: 'TRIGGER_PENDING',
    issuedAt: pred.timestamp ?? new Date().toISOString(),
    targetDate: pred.prediction?.targetDate,
    trigger: { confirmed: false, price: spot },
    signalComponents: pred.prediction?.components,
    geometry: {
      stopRMultiple: 1.0,
      horizonUsedPct: 0,
    },
    source: pred.prediction?.tier ?? pred.source ?? 'overnight_prediction',
  };
}

// ─── Setup (live tradeIdea row) ─────────────────────────────────────
export function setupToSignal(setup: any): SignalData {
  const spot = safe(setup.currentPrice ?? setup.spotPrice ?? setup.entryPrice);
  const entry = safe(setup.entryPrice ?? spot);
  const t1 = safe(setup.targetPrice ?? entry * 1.05);
  const t2 = safe(setup.target2 ?? setup.targetHigh ?? t1 * 1.05);
  const stop = safe(setup.stopLoss ?? entry * 0.94);
  const confidence = safe(setup.confidenceScore ?? setup.confidence ?? setup.score, 60);
  const directionRaw = (setup.direction ?? '').toString().toUpperCase();
  const direction: SignalDirection =
    directionRaw === 'BEARISH' || directionRaw === 'SHORT' || directionRaw === 'BEAR' ? 'BEAR' :
    directionRaw === 'NEUTRAL' ? 'NEUTRAL' : 'BULL';

  // Compute P&L from entry → spot
  const pnlAbs = direction === 'BULL' ? spot - entry : entry - spot;
  const pnlPct = entry > 0 ? (pnlAbs / entry) * 100 : 0;

  // Days active
  const issuedAt = setup.timestamp ?? setup.createdAt ?? new Date().toISOString();
  const daysActive = Math.max(0, Math.round((Date.now() - new Date(issuedAt).getTime()) / 86_400_000));

  // Status from progress
  let status: SignalStatus = 'TRIGGER_CONFIRMED';
  if (direction === 'BULL') {
    if (spot >= t2) status = 'T2_HIT';
    else if (spot >= t1) status = 'T1_HIT';
    else if (spot <= stop) status = 'STOPPED';
  } else if (direction === 'BEAR') {
    if (spot <= t2) status = 'T2_HIT';
    else if (spot <= t1) status = 'T1_HIT';
    else if (spot >= stop) status = 'STOPPED';
  }

  // Oracle option (if option-typed setup)
  const oracleOption = (setup.assetType === 'option' || setup.optionType) ? {
    strike: safe(setup.strikePrice ?? setup.strike ?? Math.round(entry)),
    expiry: setup.expiryDate ?? setup.expiry ?? '',
    optionType: (setup.optionType?.toLowerCase() ?? (direction === 'BULL' ? 'call' : 'put')) as 'call' | 'put',
    premiumAtIssue: safe(setup.premiumAtIssue ?? setup.premium),
    premiumNow: safe(setup.premiumNow ?? setup.premium),
    pctChange: safe(setup.optionPnlPct),
  } : undefined;

  return {
    id: setup.id ?? `${setup.symbol}-${issuedAt}`,
    symbol: setup.symbol,
    direction,
    spot,
    spotChangeToday: safe(setup.changePct ?? setup.change),
    confidence,
    confidenceDelta: safe(setup.confidenceDelta),
    holdPeriodLabel: holdLabel(safe(setup.daysToTarget), 'SWING'),
    entry,
    t1,
    t2,
    stop,
    pnlPct,
    pnlAbs,
    daysActive,
    status,
    issuedAt,
    targetDate: setup.targetDate,
    trigger: { confirmed: true, price: entry },
    signalComponents: setup.signalComponents,
    geometry: {
      stopRMultiple: stop && entry > 0 ? Math.abs(spot - stop) / Math.abs(entry - stop) : 1.0,
      horizonUsedPct: setup.horizonDays ? Math.min(100, (daysActive / setup.horizonDays) * 100) : 0,
    },
    oracleOption,
    source: setup.source ?? setup.dataSourceUsed ?? 'scanner',
  };
}
