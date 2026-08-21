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
  | 'technical' | 'convergence' | 'catalyst' | 'regime' | 'breadth'
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

  thesis: string;
  catalyst: string;
  catalystSourceUrl: string | null;
  generatedAt: string;

  /** Originating engine — drives the unified cockpit's mode tabs. */
  source: string;

  /** Added dynamically by the API at response time when available. */
  currentPrice?: number;
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

export function directionTone(direction: 'long' | 'short'): 'bull' | 'bear' {
  return direction === 'long' ? 'bull' : 'bear';
}

/**
 * Confidence-index display percent (0-100) from the raw confluence score.
 *
 * The server's `convictionScore` is a *confluence-points* sum, not a percent —
 * it realistically tops out around the low 40s, and the bands are:
 *   S ≥ 30 · A ≥ 22 · B ≥ 15 · C < 15  (server/convictions-engine.ts).
 * Rendering that raw number on a 0-100 dial makes an ELITE (band S) signal read
 * as "31" — which looks weak and contradicts the tier label. This is a monotonic
 * transform that anchors each band onto a sensible slice of the dial, so ELITE
 * shows in the high-80s/90s like a real confidence index. It never invents data:
 * same input → same output, strictly increasing with score.
 */
export function convictionPercent(score: number): number {
  const s = Math.max(0, score);
  let pct: number;
  if (s >= 30)      pct = 86 + ((s - 30) / 15) * 13; // S · ELITE
  else if (s >= 22) pct = 72 + ((s - 22) / 8) * 14;  // A · STRONG
  else if (s >= 15) pct = 58 + ((s - 15) / 7) * 14;  // B · HIGH
  else              pct = 30 + (s / 15) * 28;         // C · MED
  return Math.round(Math.max(0, Math.min(99, pct)));
}

/** e.g. "ELITE BULLISH" / "STRONG BEARISH" */
export function tierLabel(pick: Pick<ConvictionPick, 'convictionBand' | 'direction'>): string {
  const word = pick.direction === 'long' ? 'BULLISH' : 'BEARISH';
  return `${bandStrength(pick.convictionBand)} ${word}`;
}

/** CSS var color for a tone — used for text/stroke. */
export function toneColor(tone: Tone): string {
  if (tone === 'bull') return 'var(--trade-bullish)';
  if (tone === 'bear') return 'var(--trade-bearish)';
  return 'var(--brand-cyan)';
}

// ─── Layer kind → short tag + icon hint (for the components/checklist) ──────

export const LAYER_TAG: Record<ConvictionLayerKind, string> = {
  technical:    'TECH',
  convergence:  'CONV',
  catalyst:     'CTLY',
  regime:       'RGME',
  breadth:      'BRTH',
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
 * Per-layer accent color (hex) — mirrors the old Trade Desk LAYER_STYLES palette
 * so each confluence kind keeps its identity across the app (tech=cyan,
 * convergence=violet, catalyst=amber, …). Used for the colorful confluence pills.
 */
export const LAYER_COLOR: Record<ConvictionLayerKind, string> = {
  technical:    '#22d3ee', // cyan
  convergence:  '#a78bfa', // violet
  catalyst:     '#fbbf24', // amber
  regime:       '#34d399', // emerald
  breadth:      '#2dd4bf', // teal
  geopolitical: '#fb923c', // orange
  fundamental:  '#60a5fa', // blue
  analyst:      '#818cf8', // indigo
  sector:       '#f472b6', // pink
  freshness:    '#fb7185', // rose
  weekly:       '#fde047', // yellow
  premarket:    '#c084fc', // purple
  compression:  '#e0a458', // amber — stored energy, not yet directional
  gex:          '#5eead4', // teal-light
};

/** Normalize a layer's points into a 0-100 bar fill (points are small ints). */
export function layerBarPct(points: number): number {
  // Layer points typically range 0-10. Clamp to a readable bar.
  const pct = (Math.abs(points) / 10) * 100;
  return Math.max(6, Math.min(100, pct));
}
