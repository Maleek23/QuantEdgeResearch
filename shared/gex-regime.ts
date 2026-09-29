/**
 * POSITIVE vs NEGATIVE GAMMA — the one definition.
 * ================================================
 * Every GEX surface (hub, rankings, terminal, narratives, scanners) reads the
 * regime through classifyGammaRegime() and prints the words below, so a +γ
 * badge on one panel can never sit beside "negative gamma" on another.
 *
 * Definition (docs/GEX_VEX_METHODOLOGY.md §Regime):
 *   balance  = netGEX / grossGEX ∈ [−1, 1]          (dimensionless; SPY and BE on one scale)
 *   NEUTRAL  when |balance| < 5 %                    (dealer book roughly flat)
 *   POSITIVE when netGEX > 0 — dealers long gamma: hedging sells rallies / buys dips
 *   NEGATIVE when netGEX < 0 — dealers short gamma: hedging buys rallies / sells dips
 *   NEAR FLIP flag when spot is within 1 % of the zero-gamma level
 *             (a 1 % move re-prices the book into the other regime)
 *
 * netGEX is at CURRENT spot. The zero-gamma level comes from the spot-grid
 * re-pricing in shared/gex-math.ts; spot's side of it is reported, never used
 * to overrule the sign (single-name profiles are not always "negative below,
 * positive above").
 *
 * Legacy enum (still consumed by scanners/convictions):
 *   positive → 'positive_gamma' · negative → 'negative_gamma' · neutral → 'neutral'
 *   near flip (either sign) → 'transitioning'
 */

export type GammaRegime = 'positive' | 'negative' | 'neutral';
export type LegacyGammaRegime = 'positive_gamma' | 'negative_gamma' | 'neutral' | 'transitioning';

export const NEUTRAL_BALANCE = 0.05;
export const NEAR_FLIP_PCT = 1.0;

export const REGIME_COPY: Record<GammaRegime, { title: string; glyph: string; sign: '+' | '−' | '±'; posture: string; effect: string; short: string }> = {
  positive: {
    title: 'Positive gamma',
    glyph: '+γ',
    sign: '+',
    posture: 'Dealers long gamma — they buy dips / sell rips (stabilising)',
    effect: 'stabilising',
    short: 'dealers dampen moves',
  },
  negative: {
    title: 'Negative gamma',
    glyph: '−γ',
    sign: '−',
    posture: 'Dealers short gamma — they chase moves (amplifying)',
    effect: 'amplifying',
    short: 'dealers amplify moves',
  },
  neutral: {
    title: 'Neutral gamma',
    glyph: '±γ',
    sign: '±',
    posture: 'Dealer gamma roughly balanced — hedging neither dampens nor amplifies much',
    effect: 'balanced',
    short: 'no strong dealer footprint',
  },
};

export interface GammaRegimeRead {
  regime: GammaRegime;
  legacy: LegacyGammaRegime;
  title: string;
  glyph: string;
  sign: '+' | '−' | '±';
  posture: string;
  effect: string;
  short: string;
  /** netGEX / grossGEX, null when gross is unknown. */
  balance: number | null;
  zeroGamma: number | null;
  /** Signed % of spot vs the zero-gamma level (+ = spot above it). */
  zeroGammaDistPct: number | null;
  spotVsZeroGamma: 'above' | 'below' | null;
  nearFlip: boolean;
  /** One line that states the basis, e.g. "net GEX −$1.2B/1% · spot 0.4% below zero-gamma $761.20". */
  basis: string;
}

const fmtUsd = (v: number) => {
  const a = Math.abs(v); const s = v > 0 ? '+' : v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

/**
 * @param netGEX   $ per 1% move (dollars, NOT billions) at current spot
 * @param grossGEX Σ|contract GEX| in the same units, if known
 */
export function classifyGammaRegime(input: { netGEX: number; grossGEX?: number | null; spot?: number | null; zeroGamma?: number | null }): GammaRegimeRead {
  const net = Number.isFinite(input.netGEX) ? input.netGEX : 0;
  const gross = input.grossGEX != null && Number.isFinite(input.grossGEX) && input.grossGEX > 0 ? input.grossGEX : null;
  const balance = gross ? net / gross : null;
  const regime: GammaRegime =
    net === 0 || (balance != null && Math.abs(balance) < NEUTRAL_BALANCE) ? 'neutral' : net > 0 ? 'positive' : 'negative';
  const spot = input.spot != null && input.spot > 0 ? input.spot : null;
  const zg = input.zeroGamma != null && Number.isFinite(input.zeroGamma) && input.zeroGamma > 0 ? input.zeroGamma : null;
  const dist = spot && zg ? ((spot - zg) / zg) * 100 : null;
  const nearFlip = dist != null && Math.abs(dist) < NEAR_FLIP_PCT;
  const legacy: LegacyGammaRegime = regime === 'neutral' ? 'neutral' : nearFlip ? 'transitioning' : regime === 'positive' ? 'positive_gamma' : 'negative_gamma';
  const c = REGIME_COPY[regime];
  const basis = [
    `net GEX ${fmtUsd(net)}/1%`,
    balance != null ? `balance ${(balance * 100).toFixed(0)}% of gross` : null,
    zg && dist != null ? `spot ${Math.abs(dist).toFixed(1)}% ${dist >= 0 ? 'above' : 'below'} zero-gamma $${zg.toFixed(2)}` : 'no zero-gamma crossing within ±20% of spot',
  ].filter(Boolean).join(' · ');
  return {
    regime, legacy, ...c, balance, zeroGamma: zg, zeroGammaDistPct: dist,
    spotVsZeroGamma: dist == null ? null : dist >= 0 ? 'above' : 'below',
    nearFlip, basis,
  };
}

/** For surfaces that only receive the legacy enum (older payloads, cached rows). */
export function regimeFromLegacy(legacy: string | null | undefined): GammaRegime {
  if (legacy === 'positive_gamma' || legacy === 'positive') return 'positive';
  if (legacy === 'negative_gamma' || legacy === 'negative') return 'negative';
  return 'neutral';
}

/** Words for a legacy value, including the near-flip state. */
export function describeLegacyRegime(legacy: string | null | undefined): { title: string; glyph: string; posture: string; nearFlip: boolean; regime: GammaRegime } {
  const regime = regimeFromLegacy(legacy);
  const c = REGIME_COPY[regime];
  if (legacy === 'transitioning') {
    return { regime, nearFlip: true, title: 'Near the flip', glyph: '±γ', posture: 'Spot within 1% of the zero-gamma level — a small move changes whether dealers dampen or amplify' };
  }
  return { regime, nearFlip: false, title: c.title, glyph: c.glyph, posture: c.posture };
}
