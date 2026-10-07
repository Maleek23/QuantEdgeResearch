import { convictionDisplayPercent } from '@shared/conviction-display';

/**
 * Client-side types + helpers for the convictions ("signals") feed.
 *
 * Mirrors the server `ConvictionPick` / `ConvictionsResponse` shapes
 * (server/convictions-engine.ts). Kept as a local copy so the client
 * doesn't import server code. If the server type changes, update here.
 *
 * Everything in the cockpit binds to these — no fabricated values.
 */

export type ConvictionLayerKind =
  | 'technical' | 'ta' | 'convergence' | 'catalyst' | 'regime' | 'breadth' | 'macro'
  | 'geopolitical' | 'fundamental' | 'analyst' | 'sector' | 'freshness'
  | 'weekly' | 'premarket' | 'compression' | 'gex';

export interface ConvictionLayer {
  kind: ConvictionLayerKind;
  label: string;
  points: number;
  why: string;
  data?: Record<string, unknown>;
}

export interface ConvictionPick {
  /**
   * Present and true when this row is something the bot ACTUALLY HOLDS, merged
   * in past every entry filter — see server/bot-held-picks.ts. Held rows carry
   * live P&L instead of a conviction score, because they were never scored for
   * entry and showing a number there would invite a false comparison against
   * candidates that were.
   */
  isBotHeld?: boolean;
  botOwner?: string;
  botBookName?: string;
  botBookLegacy?: boolean;
  quantity?: number;
  unrealizedPnl?: number | null;
  unrealizedPnlPercent?: number | null;
  heldSince?: string | null;
  /** Contract-premium mark and bracket for held options (never underlying prices). */
  currentPremium?: number | null;
  premiumTarget?: number | null;
  premiumStop?: number | null;
  premiumMarkedAt?: string | null;

  ideaId: string;
  symbol: string;
  sector: string;
  direction: 'long' | 'short';
  assetType: string;
  holdingPeriod: string;
  tradeType: string | null;

  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;

  optionType: 'call' | 'put' | null;
  strikePrice: number | null;
  /** Premium per contract at signal time. Null when the idea is not an option. */
  entryPremium: number | null;
  optionDte: number | null;
  expiryDate: string | null;

  convictionScore: number;
  convictionBand: 'S' | 'A' | 'B' | 'C';
  layerCount: number;
  layers: ConvictionLayer[];
  /** Frozen evidence grade at first publication. */
  publishedConvictionScore: number | null;
  publishedConvictionBand: 'S' | 'A' | 'B' | 'C' | null;

  thesis: string;
  catalyst: string;
  catalystSourceUrl: string | null;
  generatedAt: string;

  /** Originating engine — drives the unified cockpit's mode tabs. */
  source: string;

  /** Added dynamically by the API at response time when available. */
  currentPrice?: number;

  /** A plan becomes live only after a trigger or recorded execution. */
  lifecycleState: 'coverage' | 'thesis' | 'pending_trigger' | 'triggered' | 'executed' | 'invalidated' | 'closed';
  /** Exact publish time (ISO). */
  calledAt?: string | null;
  /** Exact time price traded through the trigger (ISO). */
  triggeredAt?: string | null;
  /** The idea's own exit deadline / entry window (stored columns) — shared/setup-lifecycle.ts. */
  exitBy?: string | null;
  entryValidUntil?: string | null;

  /** Server board position (0 = top), present only when BOARD_SORT is recency / engine_record / grade. */
  boardRank?: number;
  /** NEXUS grade at board build (BOARD_SORT=grade only; shared/nexus-grade.ts). The client re-grades on the live lifecycle. Unvalidated. */
  nexusGrade?: import('@shared/nexus-grade').NexusGrade;

  /** 0DTE / weekly / swing / monthly / position / LEAPS — stamped by the API (shared/idea-horizon.ts). */
  horizon?: import('@shared/idea-horizon').HorizonRead;

  /** SPXW mirror of an open SPY 0–2 DTE option idea (display only; tracked as the SPY idea). */
  spxMirror?: import('@shared/spx-mirror').SpxMirror;
}

export interface ConvictionsResponse {
  generatedAt: string;
  marketContext: {
    regime: string;
    riskSentiment: string;
    preferredDirection: string;
    score: number;
    vixLevel: number | null;
    reasons: string[];
  };
  breadth: {
    regime: string;
    bias: number;
    advanceDeclineRatio: number;
    percentAbove200MA: number;
    percentAbove50MA: number;
    newHighsLows: number;
    sampleSize: number;
    interpretation: string;
  } | null;
  geopolitical: { risk: string; activeScenarios: string[] };
  totalCandidatesScanned: number;
  picks: ConvictionPick[];
  /** Board order chosen by env BOARD_SORT; absent = evidence score (shared/board-sort.ts). */
  boardSort?: 'score' | 'recency' | 'engine_record' | 'grade';
}

// ─── Tier mapping: band + direction → MOMO-style tier word + tone ───────────

export type Tone = 'bull' | 'bear' | 'neutral';

/** "ELITE" / "STRONG" / "HIGH" / "MED" from the conviction band. */
export function bandStrength(band: ConvictionPick['convictionBand']): string {
  switch (band) {
    case 'S': return 'ELITE';
    case 'A': return 'STRONG';
    case 'B': return 'HIGH';
    default:  return 'MED';
  }
}
/**
 * Confidence-index display percent (0-100) from the raw confluence score.
 *
 * The server's `convictionScore` is a *confluence-points* sum, not a percent —
 * it realistically tops out around the low 40s, and the bands are:
 *   see CONVICTION_BAND_CUTOFFS in shared/conviction-bands.ts (the one source
 *   the server engine and every client surface read).
 * Rendering that raw number on a 0-100 dial makes an ELITE (band S) signal read
 * as "31" — which looks weak and contradicts the tier label. This is a monotonic
 * transform that anchors each band onto a sensible slice of the dial, so ELITE
 * shows in the high-80s/90s like a real confidence index. It never invents data:
 * same input → same output, strictly increasing with score.
 */
export function convictionPercent(score: number): number {
  return convictionDisplayPercent(score);
}

/**
 * Older persisted ideas called three unrelated measurements a "grade": the
 * whole-signal evidence band, the chart-pattern detector, and the option pick.
 * Keep old records readable without rewriting their audit history.
 */
export function clarifyOracleNarrative(text: string): string {
  return text
    .replace(
      /((?:Bull Flag Pullback|Bear Flag Breakdown))\s*—\s*([SABC][+-]?) grade \((\d+)\/100\)\./gi,
      '$1 · pattern quality $3/100 ($2).',
    )
    .replace(
      /(At signal:[^\n]*?\b)grade\s+([SABC][+-]?)(\))/gi,
      '$1contract quality $2$3',
    );
}
// ─── Layer kind → short tag + icon hint (for the components/checklist) ──────

export const LAYER_TAG: Record<ConvictionLayerKind, string> = {
  technical:    'TECH',
  ta:           'SIG',
  convergence:  'CONV',
  catalyst:     'CTLY',
  regime:       'RGME',
  breadth:      'BRTH',
  macro:        'MAC',
  geopolitical: 'GEO',
  fundamental:  'FUND',
  analyst:      'ANLY',
  sector:       'SECT',
  freshness:    'FRSH',
  weekly:       'WKLY',
  premarket:    'PREM',
  compression:  'COIL',
  gex:          'GEX',
};
/**
 * THE live book — one membership rule for Today ("The book · N live", best idea)
 * and NEXUS (ranked list). Audit 2026-09-29: Today dropped `executed` picks and NEXUS
 * did not, and each fetched /api/convictions under its own query key and cadence,
 * so the two counts could differ at the same moment.
 */
export const CONVICTIONS_QUERY_KEY = ['/api/convictions', 'nexus-prototype'] as const;
export function isLiveBookPick(p: { isBotHeld?: boolean | null; lifecycleState?: string | null; convictionScore?: number | null }): boolean {
  return typeof p.convictionScore === 'number' && !p.isBotHeld && p.lifecycleState !== 'executed' && p.lifecycleState !== 'invalidated' && p.lifecycleState !== 'closed';
}

/** "Sep 30 · 10:42:13 AM ET" — exact, always Eastern. */
export function fmtExactET(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${day} · ${time} ET`;
}
