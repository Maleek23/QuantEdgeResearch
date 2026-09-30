/**
 * RAW vs Δ-ADJUSTED vs FLOW-SIGNED GAMMA — the shared definitions and the
 * level picker every surface uses. Pure, no imports beyond gex-math.
 * Research note, sources, worked SPY example: docs/GAMMA_RAW_VS_ADJUSTED.md.
 *
 * Three per-contract dollar exposures, all "$ of underlying dealers trade per
 * 1% spot move", all under the SAME dealer sign unless stated:
 *
 *   raw         sign · Γ · OI · 100 · S² · 0.01
 *               (SqueezeMetrics / Perfiliev GEX; the headline everywhere)
 *   Δ-adjusted  sign · OI · 100 · S · [Δ(S·1.01) − Δ(S·0.99)] / 2
 *               (the hedge actually traded for a ±1% move — delta re-priced
 *               at both ends instead of Γ's straight-line estimate)
 *   flow-signed raw magnitude, but a fraction w = min(1, volume ÷ OI) of every
 *               near-dated (0.75–21 d) OTM (2–25% above spot) call's OI is
 *               re-signed dealer-SHORT (the Squeeze Radar rule,
 *               docs/GAMMA_SQUEEZE.md §1.2) — an assumption, stated as one.
 *
 * sign = +1 call, −1 put (naive-OI). + = dealers long gamma = hedging provides
 * liquidity (sell rallies / buy dips).
 */
import { pickWalls, type WallStrike } from './gex-math';
import { classifyGammaRegime, type GammaRegime } from './gex-regime';

export type GammaMetricKey = 'raw' | 'deltaAdjusted' | 'flowSigned';

export const GAMMA_METRIC_DEFS: Record<GammaMetricKey, { label: string; short: string; formula: string; unit: string; meaning: string }> = {
  raw: {
    label: 'Raw GEX', short: 'Raw',
    formula: 'Σ sign·Γ·OI·100·S²·0.01',
    unit: '$ per 1% move',
    meaning: 'Instantaneous: the dealer hedge for a vanishingly small move, scaled to 1%. Industry standard (SqueezeMetrics, SpotGamma, Perfiliev).',
  },
  deltaAdjusted: {
    label: 'Δ-adjusted GEX', short: 'Δ-adj',
    formula: 'Σ sign·OI·100·S·[Δ(S·1.01) − Δ(S·0.99)]/2',
    unit: '$ per 1% move',
    meaning: 'The shares a delta-hedger actually trades if spot moves 1%, delta re-priced at both ends (Black-Scholes, contract IV held). Equals raw for long-dated books; smaller at the ATM 0DTE strike, larger just beside it.',
  },
  flowSigned: {
    label: 'Flow-signed GEX (estimate)', short: 'Flow',
    formula: 'raw, with w = min(1, vol/OI) of near-dated OTM call OI re-signed dealer-short',
    unit: '$ per 1% move',
    meaning: 'Where calls are being opened today, assume customers bought them (dealers short). An assumption, not an observation — OI carries no side.',
  },
};

/** Squeeze-radar re-sign window (docs/GAMMA_SQUEEZE.md §1.2). Kept in step with SQUEEZE_RULES. */
export const FLOW_RESIGN_RULE = { nearMinDays: 0.75, nearMaxDays: 21, otmCallMin: 0.02, otmCallMax: 0.25 } as const;

/** Share of this contract's OI assumed customer-long (re-signed dealer-short), 0–1. */
export function flowResignWeight(isCall: boolean, strike: number, spot: number, daysToExpiry: number, volume: number, oi: number): number {
  const R = FLOW_RESIGN_RULE;
  if (!isCall || !(oi > 0) || !(spot > 0)) return 0;
  if (daysToExpiry < R.nearMinDays || daysToExpiry > R.nearMaxDays) return 0;
  if (!(strike > spot * (1 + R.otmCallMin) && strike <= spot * (1 + R.otmCallMax))) return 0;
  return Math.max(0, Math.min(1, (volume || 0) / oi));
}

/** Levels read under one metric. Walls/king are strikes; zeroGamma is a price. */
export interface GammaMetricLevels {
  callWall: number | null;
  putWall: number | null;
  /** largest |net| strike, all expiries (= maxGammaStrike under raw) */
  maxGammaStrike: number | null;
  /** largest |cell| in the strike × expiry matrix — the heatmap's ★ */
  kingNode: { strike: number; dte: number; value: number } | null;
  /** re-priced zero-gamma nearest spot under this metric's kernel; null = none within ±20% */
  zeroGamma: number | null;
  /** top-5 strikes by |net|, descending — the "key strikes" ranking */
  keyStrikes: number[];
}

export interface GammaMetricBook {
  /** $B per 1% (units v2) */
  net: number;
  /** Σ|contract|, $B per 1% */
  gross: number;
  /** net / gross ∈ [−1, 1] */
  balance: number | null;
  levels: GammaMetricLevels;
}

/** The comparison block the exposures engine ships (snapshot.gammaMetrics). */
export interface GammaMetricsBlock {
  version: 1;
  unit: '$B per 1% move';
  defs: typeof GAMMA_METRIC_DEFS;
  raw: GammaMetricBook;
  deltaAdjusted: GammaMetricBook & {
    /** $B dealers trade if spot rises 1% / falls 1% (one-sided; + = against the move). */
    moveUp: number; moveDown: number;
  };
  flowSigned: GammaMetricBook & {
    /** gross ($B) re-signed and its share of gross */
    resignedGross: number; resignedShare: number | null;
  };
  /** Which raw levels move under Δ-adjusted / flow-signed. */
  differs: {
    deltaAdjusted: Array<keyof Omit<GammaMetricLevels, 'keyStrikes'>>;
    flowSigned: Array<keyof Omit<GammaMetricLevels, 'keyStrikes'>>;
  };
  /** Rank overlap of the top-5 key strikes, raw vs Δ-adjusted (0–5). */
  keyStrikeOverlap: number;
  notes: string[];
}

export interface MetricStrikeRow { strike: number; call: number; put: number; net: number; callOI?: number; putOI?: number }
export interface MetricCell { strike: number; dte: number; value: number }

/** Levels for one metric from its per-strike rows (call/put UNSIGNED magnitudes, net signed) and matrix cells. */
export function levelsFor(rows: MetricStrikeRow[], cells: MetricCell[], spot: number, zeroGamma: number | null): GammaMetricLevels {
  const walls = pickWalls(rows.map((r): WallStrike => ({ strike: r.strike, callOI: r.callOI ?? 0, putOI: r.putOI ?? 0, callGEX: Math.abs(r.call), putGEX: Math.abs(r.put) })), spot);
  const ranked = rows.filter((r) => r.net !== 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  let king: MetricCell | null = null;
  for (const c of cells) if (c.value !== 0 && (!king || Math.abs(c.value) > Math.abs(king.value))) king = c;
  return {
    callWall: walls.callWall,
    putWall: walls.putWall,
    maxGammaStrike: ranked[0]?.strike ?? null,
    kingNode: king ? { strike: king.strike, dte: king.dte, value: king.value } : null,
    zeroGamma,
    keyStrikes: ranked.slice(0, 5).map((r) => r.strike),
  };
}

/** Level keys whose value differs between two reads (zero-gamma: > 0.1% of spot apart, or one side null). */
export function diffLevels(a: GammaMetricLevels, b: GammaMetricLevels, spot: number): Array<keyof Omit<GammaMetricLevels, 'keyStrikes'>> {
  const out: Array<keyof Omit<GammaMetricLevels, 'keyStrikes'>> = [];
  if (a.callWall !== b.callWall) out.push('callWall');
  if (a.putWall !== b.putWall) out.push('putWall');
  if (a.maxGammaStrike !== b.maxGammaStrike) out.push('maxGammaStrike');
  if ((a.kingNode?.strike ?? null) !== (b.kingNode?.strike ?? null) || (a.kingNode?.dte ?? null) !== (b.kingNode?.dte ?? null)) out.push('kingNode');
  if ((a.zeroGamma == null) !== (b.zeroGamma == null)
    || (a.zeroGamma != null && b.zeroGamma != null && Math.abs(a.zeroGamma - b.zeroGamma) > spot * 0.001)) out.push('zeroGamma');
  return out;
}

export const LEVEL_LABELS: Record<keyof Omit<GammaMetricLevels, 'keyStrikes'>, string> = {
  callWall: 'call wall', putWall: 'put wall', maxGammaStrike: 'max γ', kingNode: 'king node', zeroGamma: 'zero-γ',
};

export const overlapCount = (a: number[], b: number[]) => a.filter((k) => b.includes(k)).length;

// ─── Compact comparison for Quantinum / snapshots (context, never scored) ───


export interface GammaCompareRow {
  metric: GammaMetricKey;
  label: string;
  regime: GammaRegime;
  glyph: string;
  /** net / gross */
  balance: number | null;
  /** $B per 1% */
  net: number;
  callWall: number | null;
  putWall: number | null;
  maxGammaStrike: number | null;
  kingNode: { strike: number; dte: number } | null;
  zeroGamma: number | null;
  keyStrikes: number[];
}
export interface GammaCompare {
  rows: GammaCompareRow[];
  /** Human-readable level changes vs raw, e.g. "king node $764 (0d) → $762 (0d)". */
  changes: { deltaAdjusted: string[]; flowSigned: string[] };
  regimeAgrees: boolean;
  keyStrikeOverlap: number;
  /**
   * Δ-adjusted dealer hedge trade, $B, for a +1% rally / −1% drop from spot
   * (+ = dealers buy, − = sell). Raw GEX implies these are equal and opposite.
   */
  hedgeOnRally1Pct: number;
  hedgeOnDrop1Pct: number;
  /** One line, for layer text. */
  read: string;
}

const px = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? 'none' : `$${v.toFixed(d)}`);
const lvText = (k: keyof Omit<GammaMetricLevels, 'keyStrikes'>, lv: GammaMetricLevels) =>
  k === 'kingNode' ? (lv.kingNode ? `${px(lv.kingNode.strike, lv.kingNode.strike % 1 ? 1 : 0)} (${lv.kingNode.dte}d)` : 'none')
  : k === 'zeroGamma' ? px(lv.zeroGamma, 2)
  : px(lv[k] as number | null, (lv[k] as number | null) != null && (lv[k] as number) % 1 ? 1 : 0);

export function summarizeGammaMetrics(block: GammaMetricsBlock, spot: number): GammaCompare {
  const row = (metric: GammaMetricKey, b: GammaMetricBook): GammaCompareRow => {
    const r = classifyGammaRegime({ netGEX: b.net * 1e9, grossGEX: b.gross * 1e9, spot, zeroGamma: b.levels.zeroGamma });
    return {
      metric, label: GAMMA_METRIC_DEFS[metric].short, regime: r.regime, glyph: r.glyph, balance: b.balance, net: b.net,
      callWall: b.levels.callWall, putWall: b.levels.putWall, maxGammaStrike: b.levels.maxGammaStrike,
      kingNode: b.levels.kingNode ? { strike: b.levels.kingNode.strike, dte: b.levels.kingNode.dte } : null,
      zeroGamma: b.levels.zeroGamma, keyStrikes: b.levels.keyStrikes,
    };
  };
  const rows = [row('raw', block.raw), row('deltaAdjusted', block.deltaAdjusted), row('flowSigned', block.flowSigned)];
  const changes = {
    deltaAdjusted: block.differs.deltaAdjusted.map((k) => `${LEVEL_LABELS[k]} ${lvText(k, block.raw.levels)} → ${lvText(k, block.deltaAdjusted.levels)}`),
    flowSigned: block.differs.flowSigned.map((k) => `${LEVEL_LABELS[k]} ${lvText(k, block.raw.levels)} → ${lvText(k, block.flowSigned.levels)}`),
  };
  const regimeAgrees = rows[0].regime === rows[1].regime;
  // Dealer delta rises by moveUp on a rally → they SELL it; falls by moveDown on a drop → they BUY moveDown (negative = sell).
  const hedgeOnRally1Pct = -block.deltaAdjusted.moveUp;
  const hedgeOnDrop1Pct = block.deltaAdjusted.moveDown;
  const trade = (b: number) => `${b < 0 ? 'sell' : 'buy'} $${Math.abs(b).toFixed(2)}B`;
  const pct = (b: number | null) => (b == null ? 'n/a' : `${b >= 0 ? '+' : '−'}${Math.abs(b * 100).toFixed(0)}%`);
  const read = [
    `raw ${rows[0].glyph} (bal ${pct(rows[0].balance)})`,
    `Δ-adj ${rows[1].glyph} (bal ${pct(rows[1].balance)})`,
    `flow-signed ${rows[2].glyph} (bal ${pct(rows[2].balance)})`,
  ].join(' · ') + (changes.deltaAdjusted.length ? ` · Δ-adj moves: ${changes.deltaAdjusted.join('; ')}` : ' · Δ-adj levels match raw')
    + ` · key strikes overlap ${block.keyStrikeOverlap}/5`
    + ` · Δ-adj hedge: rally 1% → dealers ${trade(hedgeOnRally1Pct)}, drop 1% → dealers ${trade(hedgeOnDrop1Pct)}`;
  return { rows, changes, regimeAgrees, keyStrikeOverlap: block.keyStrikeOverlap, hedgeOnRally1Pct, hedgeOnDrop1Pct, read };
}
