/**
 * Idea detail BY ID — the pure half of GET /api/ideas/:id/detail.
 *
 * The NEXUS Setup Detail renders a board pick (ConvictionPick). The board only
 * carries live, gated ideas, so any idea that resolved, expired, was deduped
 * or was never board-eligible (index scalps on SPY under the desk's "SPX" row,
 * operator bug 2026-10-14) dead-ended with "not on the live NEXUS board".
 * This maps the stored trade_ideas row to the SAME pick shape — the plan as
 * published, never re-scored — plus the stored outcome, so the detail renders
 * for open, resolved, expired and past-day ideas alike.
 */
import { readOracleExecutionAudit } from '@shared/oracle-lifecycle';
import { readBudgetContract } from '@shared/budget-contract';
import { stripConflictingTargetClaims } from '@shared/plan-narrative';
import { getSector } from '@shared/approved-tickers';
import { classifyIdeaHorizon } from '@shared/idea-horizon';
import { parsePeak } from '@shared/option-peak';
import type { PremiumOutcome } from '@shared/premium-outcome';
import { ideaStatusChip, isZeroDteJournalRow, spxThesisLabel, zeroDteFamilyOf } from '@shared/zero-dte-journal';

const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const iso = (x: unknown): string | null => {
  if (x == null || x === '') return null;
  const ms = x instanceof Date ? x.getTime() : Date.parse(String(x));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

export interface IdeaDetailRecord {
  outcomeStatus: string;
  resolutionReason: string | null;
  exitPrice: number | null;
  exitDate: string | null;
  entryPremium: number | null;
  exitPremium: number | null;
  optionPercentGain: number | null;
  percentGain: number | null;
  /** Best premium after entry recorded by the tracker ([peak:…] tag). */
  peak: { premium: number; at: string; basis: string } | null;
  notes: string | null;
}

export interface IdeaDetailResponse {
  ideaId: string;
  /** ConvictionPick-shaped (client/src/lib/convictions.ts) — the plan as published. */
  pick: Record<string, unknown>;
  status: ReturnType<typeof ideaStatusChip>;
  record: IdeaDetailRecord;
  /** Contract premium judged on its own 1-minute bars (shared/premium-outcome.ts); null when no bars answered. */
  premium: (PremiumOutcome & { asOf: string | null; lastPremium: number | null; source: string | null; trough?: { premium: number; atMs: number } | null }) | null;
  /** Verify-ledger chip (shared/nexus-pnl.ts verificationOf). */
  verification?: import("@shared/nexus-pnl").PnlVerification;
  premiumNote: string | null;
  /** "SPX thesis · traded on SPY 770P" when an index thesis is expressed on SPY. */
  thesisLabel: string | null;
  zeroDte: boolean;
  family: string | null;
  source: string;
  /** When this response was built (server clock). */
  asOf: string;
}

/** The stored row → the board's pick shape. Pure. */
export function ideaRowToPick(idea: any, nowMs = Date.now()): Record<string, unknown> {
  const audit = readOracleExecutionAudit(idea.convergenceSignalsJson);
  const resolved = String(idea.outcomeStatus ?? 'open').toLowerCase() !== 'open';
  const direction = /short|bear/i.test(String(idea.direction ?? '')) ? 'short' : 'long';
  const entry = num(idea.entryPrice) ?? 0;
  const strike = num(idea.strikePrice);
  const publishedLayers = Array.isArray(idea.genScoringLayers)
    ? (idea.genScoringLayers as any[])
      .filter((l) => l && typeof l.why === 'string' && Number.isFinite(Number(l.points)))
      .map((l) => ({ kind: String(l.kind), points: Number(l.points), why: String(l.why) }))
    : null;
  const band = ['S', 'A', 'B', 'C'].includes(String(idea.genConvictionBand)) ? String(idea.genConvictionBand) : 'C';
  const score = num(idea.genConvictionScore) ?? 0;
  const calledAt = iso(idea.timestamp) ?? iso(idea.generationTimestamp);
  const pick: Record<string, unknown> = {
    ideaId: String(idea.id),
    symbol: String(idea.symbol ?? '').toUpperCase(),
    sector: getSector(String(idea.symbol ?? '').toUpperCase()),
    direction,
    assetType: idea.assetType ?? 'option',
    levelBasis: strike != null && idea.optionType != null && entry > 0 && entry < strike * 0.5 ? 'contract' : 'underlying',
    holdingPeriod: idea.holdingPeriod ?? 'day',
    tradeType: idea.tradeType ?? null,
    entryPrice: entry,
    targetPrice: num(idea.targetPrice) ?? 0,
    stopLoss: num(idea.stopLoss) ?? 0,
    riskRewardRatio: num(idea.riskRewardRatio) ?? 0,
    optionType: idea.optionType ?? null,
    strikePrice: strike,
    entryPremium: num(idea.entryPremium),
    optionDte: num(idea.optionDte),
    expiryDate: idea.expiryDate ?? null,
    contractLiquidity: (idea.convergenceSignalsJson as any)?.contractLiquidity ?? null,
    budgetContract: readBudgetContract(idea.convergenceSignalsJson),
    // Not re-scored: the evidence shown is the evidence AT PUBLISH.
    convictionScore: score,
    convictionBand: band,
    layerCount: publishedLayers?.length ?? 0,
    layers: (publishedLayers ?? []).map((l) => ({ ...l, label: l.kind })),
    publishedConvictionScore: num(idea.genConvictionScore),
    publishedConvictionBand: ['S', 'A', 'B', 'C'].includes(String(idea.genConvictionBand)) ? idea.genConvictionBand : null,
    publishedLayers,
    thesis: stripConflictingTargetClaims(
      (idea.convergenceSignalsJson as any)?.primaryThesis ?? idea.analysis ?? idea.catalyst ?? '',
      Number(idea.targetPrice),
    ),
    catalyst: idea.catalyst ?? '',
    catalystSourceUrl: idea.catalystSourceUrl ?? null,
    generatedAt: iso(idea.generationTimestamp) ?? calledAt ?? new Date(nowMs).toISOString(),
    source: idea.source ?? 'quant',
    // Never present a stored price as live (feedback: live, not carried).
    currentPrice: null,
    priceIsLive: false,
    lifecycleState: resolved ? 'closed' : audit?.state ?? 'pending_trigger',
    calledAt,
    triggeredAt: audit?.triggerObservedAt ?? null,
    exitBy: idea.exitBy ?? null,
    entryValidUntil: idea.entryValidUntil ?? null,
    offBoard: true,
    thesisLabel: spxThesisLabel({ symbol: String(idea.symbol ?? ''), source: idea.source, dataSourceUsed: idea.dataSourceUsed, qualitySignals: idea.qualitySignals, optionType: idea.optionType, strikePrice: strike }),
  };
  pick.horizon = classifyIdeaHorizon(pick as any, nowMs);
  return pick;
}

export function ideaRecordOf(idea: any): IdeaDetailRecord {
  const pk = parsePeak(idea.outcomeNotes);
  return {
    outcomeStatus: String(idea.outcomeStatus ?? 'open'),
    resolutionReason: idea.resolutionReason ?? null,
    exitPrice: num(idea.exitPrice),
    exitDate: iso(idea.exitDate),
    entryPremium: num(idea.entryPremium),
    exitPremium: num(idea.exitPremium),
    optionPercentGain: num(idea.optionPercentGain),
    percentGain: num(idea.percentGain),
    peak: pk ? { premium: pk.premium, at: new Date(pk.atMs).toISOString(), basis: pk.basis } : null,
    notes: idea.outcomeNotes ? String(idea.outcomeNotes).slice(0, 1200) : null,
  };
}

/** Everything but the premium bars. Pure. */
export function buildIdeaDetail(idea: any, premium: IdeaDetailResponse['premium'], premiumNote: string | null, nowMs = Date.now()): IdeaDetailResponse {
  const pick = ideaRowToPick(idea, nowMs);
  const sig = { source: idea.source, dataSourceUsed: idea.dataSourceUsed, qualitySignals: idea.qualitySignals };
  return {
    ideaId: String(idea.id),
    pick,
    status: ideaStatusChip({
      outcomeStatus: idea.outcomeStatus, resolutionReason: idea.resolutionReason,
      lifecycleState: readOracleExecutionAudit(idea.convergenceSignalsJson)?.state ?? null,
      t2HitAt: premium?.t2HitAt ?? null,
    }),
    record: ideaRecordOf(idea),
    premium,
    premiumNote,
    thesisLabel: spxThesisLabel({ symbol: String(idea.symbol ?? ''), ...sig, optionType: idea.optionType, strikePrice: num(idea.strikePrice) }),
    zeroDte: isZeroDteJournalRow({ ...sig, assetType: idea.assetType, expiryDate: idea.expiryDate, entryTime: idea.timestamp }),
    family: zeroDteFamilyOf(sig),
    source: String(idea.source ?? 'quant'),
    asOf: new Date(nowMs).toISOString(),
  };
}
