/**
 * Shared GEX / VEX Types
 * ======================
 * Scanner + dashboard contracts shared between server/* and client/*.
 * Keep this file free of runtime imports — TYPES ONLY (plus a few pure helpers).
 */

// ─────────────────────────────────────────────────────────────
// CORE LEVEL & EXPOSURE SHAPES
// ─────────────────────────────────────────────────────────────

/** A single strike-level exposure record (call wall, put wall, etc.) */
export interface GEXLevel {
  /** Option strike price */
  strike: number;
  /** Net gamma exposure in billions ($/1% move × 1e9) */
  gex: number;
  /** Call-side gamma exposure */
  callGex: number;
  /** Put-side gamma exposure */
  putGex: number;
  /** Net vanna exposure in billions */
  vex: number;
  /** Percentage of total |GEX| concentrated at this strike */
  gammaPct: number;
  /** Total open interest at this strike (calls + puts) */
  openInterest: number;
  /** Classification: call wall / put wall / flip / neutral */
  role: 'call_wall' | 'put_wall' | 'flip' | 'max_gamma' | 'support' | 'resistance' | 'neutral';
  /** Distance from spot in % (signed — positive = above spot) */
  distancePct: number;
}

/** Complete GEX/VEX snapshot for a single ticker */
export interface GEXSnapshot {
  symbol: string;
  spotPrice: number;
  /** Timestamp of calculation (ms epoch) */
  calculatedAt: number;

  // Aggregate exposures
  totalGEX: number;       // net dealer gamma exposure ($/1% move, billions)
  totalVEX: number;       // net dealer vanna exposure (billions)
  callGEX: number;
  putGEX: number;
  putCallRatio: number;   // |put GEX| / call GEX

  // Key structural levels
  gammaFlipPrice: number | null;     // where dealer gamma flips from + to -
  maxGammaStrike: number;            // strike with largest |GEX|
  callWall: number | null;           // largest positive-GEX strike above spot
  putWall: number | null;            // largest negative-GEX strike below spot
  zeroGammaProjection: number | null; // near-term magnet target (Skylit "projection")

  // Top-N levels for rendering
  levels: GEXLevel[];

  // Regime / environment
  regime: 'positive_gamma' | 'negative_gamma' | 'neutral' | 'transitioning';
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';

  // Data provenance
  source: 'schwab' | 'tradier' | 'yahoo' | 'mixed' | 'none';
  expirationsUsed: string[];

  // Data quality (optional — populated when cross-validation layer is used)
  dataQuality?: {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    score: number;
    sourceCount: number;
    spreadPct: number;
    isStale: boolean;
    hasDisagreement: boolean;
  };
}

// ─────────────────────────────────────────────────────────────
// CONFLUENCE SCORING (Scanner)
// ─────────────────────────────────────────────────────────────

/** Why a ticker scored high — each component 0-25, sum 0-100 */
export interface ConfluenceBreakdown {
  /** Proximity to gamma flip (0-25) */
  flipProximity: number;
  /** Wall setup quality — clear call/put wall bracketing spot (0-25) */
  wallSetup: number;
  /** VEX alignment — vanna supporting directional move (0-20) */
  vexAlignment: number;
  /** Volume / OI liquidity on key strikes (0-15) */
  liquidity: number;
  /** Regime score — positive gamma suppression or negative gamma volatility (0-15) */
  regime: number;
}

/** Scanner output row — one per watchlist ticker */
export interface ConfluenceRow {
  symbol: string;
  tier: 'S' | 'A' | 'INDEX' | 'SECONDARY' | null;
  spotPrice: number;
  change: number;
  changePct: number;

  /** Total confluence score 0-100 */
  score: number;
  /** Breakdown of how score was derived */
  breakdown: ConfluenceBreakdown;
  /** Tier label for visual badge */
  scoreTier: 'elite' | 'strong' | 'watch' | 'weak';

  // Key levels surfaced for the scanner row
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  projection: number | null;
  maxGammaStrike: number;

  // Aggregate exposures (used by GEX Hub for top-N rankings)
  totalGEX: number;            // net dealer gamma in $B / 1% move
  totalVEX: number;            // net dealer vanna in $B
  regime: 'positive_gamma' | 'negative_gamma' | 'neutral' | 'transitioning';
  sector: string;              // sector slug from approved-tickers.SECTOR_MAP

  // Directional bias + R:R
  bias: 'long' | 'short' | 'neutral';
  target: number | null;
  stop: number | null;
  riskReward: number | null;

  // Data freshness
  dataSource: 'schwab' | 'tradier' | 'yahoo' | 'mixed' | 'none';
  calculatedAt: number;
  note?: string;
}

/** Full scanner response */
export interface ConfluenceScanResult {
  rows: ConfluenceRow[];
  scannedAt: number;
  tickersScanned: number;
  tickersWithData: number;
  marketRegime: 'risk_on' | 'risk_off' | 'choppy' | 'trending';
  topPick: string | null;
  errors: Array<{ symbol: string; error: string }>;
}

// ─────────────────────────────────────────────────────────────
// GEX HUB — market-wide aggregation panels
// ─────────────────────────────────────────────────────────────

/** A single sector's aggregate GEX/VEX */
export interface SectorAggregate {
  sector: string;
  label: string;
  symbols: string[];           // tickers in this sector
  netGEX: number;              // sum of totalGEX across sector
  netVEX: number;              // sum of totalVEX across sector
  avgScore: number;            // mean confluence score
  bullishCount: number;        // # of long-bias tickers
  bearishCount: number;        // # of short-bias tickers
  neutralCount: number;
  topPick: string | null;      // highest-scoring ticker in sector
}

/** Regime distribution across the watchlist */
export interface RegimeDistribution {
  positive_gamma: number;
  negative_gamma: number;
  neutral: number;
  transitioning: number;
  total: number;
}

/** Compact row used by hub leaderboards */
export interface HubLeaderRow {
  symbol: string;
  tier: 'S' | 'A' | 'INDEX' | 'SECONDARY' | null;
  spotPrice: number;
  changePct: number;
  totalGEX: number;
  totalVEX: number;
  score: number;
  regime: ConfluenceRow['regime'];
  bias: ConfluenceRow['bias'];
  sector: string;
  callWall: number | null;
  putWall: number | null;
}

/** Full GEX Hub payload — overlays the existing scanner result */
export interface GEXHubData {
  scannedAt: number;
  marketRegime: ConfluenceScanResult['marketRegime'];
  totalTickers: number;

  /** Top 6 by net positive GEX (call wall heavy / pin candidates) */
  topPositiveGEX: HubLeaderRow[];
  /** Top 6 by net negative GEX (volatility / break candidates) */
  topNegativeGEX: HubLeaderRow[];
  /** Top 6 by absolute VEX magnitude (vanna movers) */
  topVEX: HubLeaderRow[];

  /** Sector aggregates sorted by |netGEX| desc */
  sectors: SectorAggregate[];

  /** Regime counts across watchlist */
  regimeDistribution: RegimeDistribution;

  /** Single-line market-wide summary */
  marketNetGEX: number;
  marketNetVEX: number;
}

// ─────────────────────────────────────────────────────────────
// PER-TICKER TERMINAL (gex-command.tsx)
// ─────────────────────────────────────────────────────────────

/** Display modes — Skylit-style toggles */
export type GEXViewMode = 'orbs' | 'heatmap' | 'projection' | 'walls';

/** Chart candle — compatible with lightweight-charts Time/CandlestickData */
export interface GEXCandle {
  time: number;   // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Orb overlay — plotted on candles at strike levels */
export interface GEXOrb {
  strike: number;
  gex: number;            // absolute GEX value
  gammaPct: number;       // % of total
  kind: 'call' | 'put' | 'flip' | 'max';
  /** Orb radius scaled 0..1 (1 = max gamma) */
  size: number;
  /** Text label for the orb (e.g. "$587 31%") */
  label: string;
}

/** Heatmap cell — strike × time matrix */
export interface HeatmapCell {
  strike: number;
  timestamp: number;
  intensity: number;      // 0..1 normalized
  gex: number;
  side: 'call' | 'put' | 'neutral';
}

/** Projection arc — curve from spot to magnet target */
export interface ProjectionArc {
  startPrice: number;
  startTime: number;
  endPrice: number;
  endTime: number;
  confidence: number;     // 0..1
  /** Sampled points along the arc for rendering */
  points: Array<{ time: number; price: number }>;
}

/** Full terminal payload — one request returns everything */
export interface GEXTerminalData {
  symbol: string;
  snapshot: GEXSnapshot;
  candles: GEXCandle[];
  orbs: GEXOrb[];
  heatmap: HeatmapCell[];
  projection: ProjectionArc | null;
  /** Adjacent tickers for right-rail context (same sector / watchlist peers) */
  peers: Array<{
    symbol: string;
    spotPrice: number;
    changePct: number;
    score: number;
    bias: 'long' | 'short' | 'neutral';
  }>;
  /** Data quality metadata for the terminal's spot price */
  dataQuality?: {
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    score: number;
    sourceCount: number;
    bestSource: string;
    spreadPct: number;
    isStale: boolean;
    hasDisagreement: boolean;
    marketStatus: 'live' | 'closed' | 'premarket' | 'afterhours';
  };
}

// ─────────────────────────────────────────────────────────────
// REQUEST TYPES
// ─────────────────────────────────────────────────────────────

export interface ScanWatchlistRequest {
  /** Optional ticker filter — defaults to full approved watchlist */
  tickers?: string[];
  /** Include per-ticker level detail (slower) */
  detailed?: boolean;
  /** Minimum confluence score to include (default 0) */
  minScore?: number;
}

export interface GEXTerminalRequest {
  symbol: string;
  /** Timeframe for candles: 1m, 5m, 15m, 1h, 1d */
  interval?: '1m' | '5m' | '15m' | '1h' | '1d';
  /** Lookback in days (default 5) */
  lookback?: number;
}

// ─────────────────────────────────────────────────────────────
// PURE HELPERS (used client + server)
// ─────────────────────────────────────────────────────────────

/** Map a 0-100 score to a tier */
export function scoreToTier(score: number): ConfluenceRow['scoreTier'] {
  if (score >= 75) return 'elite';
  if (score >= 60) return 'strong';
  if (score >= 40) return 'watch';
  return 'weak';
}

/** Map a GEX value to a heatmap intensity 0..1 (log-scaled) */
export function gexToIntensity(gex: number, maxAbs: number): number {
  if (maxAbs <= 0) return 0;
  const normalized = Math.abs(gex) / maxAbs;
  // Log scale so small values are still visible
  return Math.min(1, Math.log1p(normalized * 9) / Math.log(10));
}

/** Format GEX in billions with sign */
export function formatGEX(gex: number): string {
  const sign = gex >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(gex).toFixed(2)}B`;
}

/** Format a percentage of total gamma */
export function formatGammaPct(pct: number): string {
  return `${(pct * 100).toFixed(1)}%`;
}
