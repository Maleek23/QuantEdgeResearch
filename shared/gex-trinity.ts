/**
 * GEX TRINITY — SPY · QQQ · IWM dealer positioning read side by side, and the
 * one-line AGREEMENT read across them. Pure: used by the GEX workspace's
 * Trinity tool (client/src/components/dashboard/tools/gex/trinity-tool.tsx)
 * and the /trinity Ask Quantinum command (server/quantinum-analyst-tools.ts),
 * so both say the same sentence from the same numbers.
 *
 * Inputs are what the engine already publishes per index (spot, zero-γ flip,
 * call/put wall, max-γ strike, net GEX, regime word). Nothing is estimated
 * here: a missing level makes that part of the read 'unknown' and the
 * sentence says "not in the data" for it instead of guessing.
 *
 * Thresholds (plain, fixed — not fitted):
 *   ON the flip      |spot − flip| / spot ≤ 0.15 %
 *   AT a wall        |spot − wall| / spot ≤ 0.25 %
 */

export const TRINITY_SYMBOLS = ['SPY', 'QQQ', 'IWM'] as const;
export const FLIP_ON_PCT = 0.15;
export const WALL_AT_PCT = 0.25;

export type TrinityRegime = 'long' | 'short' | 'neutral' | 'unknown';
export type TrinitySide = 'above' | 'below' | 'on' | 'unknown';
export type TrinityWall = 'above-call-wall' | 'at-call-wall' | 'between' | 'at-put-wall' | 'below-put-wall' | 'unknown';

export interface TrinityInput {
  symbol: string;
  spot: number | null;
  flip: number | null;
  callWall: number | null;
  putWall: number | null;
  maxGamma?: number | null;
  /** Net GEX of the book read, $B per 1 % move. Used for the regime only when `regime` is absent. */
  netGex?: number | null;
  /** Engine regime word: positive / negative / neutral (or the legacy *_gamma / transitioning). */
  regime?: string | null;
}

export interface TrinityRead {
  symbol: string;
  regime: TrinityRegime;
  side: TrinitySide;
  wall: TrinityWall;
  /** (spot − flip) / spot × 100; + = spot above its flip. */
  flipDistPct: number | null;
  /** Signed % from spot to each wall (+ = wall above spot). */
  callWallDistPct: number | null;
  putWallDistPct: number | null;
  maxGammaDistPct: number | null;
}

export interface TrinityAgreement {
  regime: 'all-long' | 'all-short' | 'mixed' | 'insufficient';
  flips: 'all-above' | 'all-below' | 'mixed' | 'insufficient';
  /** Short verdict: "Aligned long gamma", "Aligned short gamma", "Mixed", "Not enough data". */
  verdict: string;
  /** Plain-English one-liner, e.g. "Mixed: SPY on its flip, QQQ under flip at its put wall, IWM short gamma." */
  sentence: string;
  reads: TrinityRead[];
  /** Glossary keys (shared/glossary.ts) the sentence leans on. */
  terms: Array<'gex' | 'gamma-flip' | 'call-wall' | 'put-wall'>;
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pct = (from: number | null, to: number | null | undefined): number | null =>
  fin(from) && from > 0 && fin(to) ? ((to - from) / from) * 100 : null;

export function regimeOf(regime: string | null | undefined, netGex: number | null | undefined): TrinityRegime {
  const r = String(regime ?? '').toLowerCase();
  if (r.startsWith('positive') || r === 'long') return 'long';
  if (r.startsWith('negative') || r === 'short') return 'short';
  if (r === 'neutral' || r === 'transitioning') return 'neutral';
  if (fin(netGex)) return netGex > 0 ? 'long' : netGex < 0 ? 'short' : 'neutral';
  return 'unknown';
}

export function readIndex(i: TrinityInput): TrinityRead {
  const spot = fin(i.spot) && i.spot > 0 ? i.spot : null;
  const flipDistPct = spot != null && fin(i.flip) ? ((spot - i.flip) / spot) * 100 : null;
  const side: TrinitySide = flipDistPct == null ? 'unknown' : Math.abs(flipDistPct) <= FLIP_ON_PCT ? 'on' : flipDistPct > 0 ? 'above' : 'below';
  const cw = pct(spot, i.callWall);
  const pw = pct(spot, i.putWall);
  let wall: TrinityWall = 'unknown';
  if (cw != null && Math.abs(cw) <= WALL_AT_PCT) wall = 'at-call-wall';
  else if (pw != null && Math.abs(pw) <= WALL_AT_PCT) wall = 'at-put-wall';
  else if (cw != null && cw < 0) wall = 'above-call-wall';
  else if (pw != null && pw > 0) wall = 'below-put-wall';
  else if (cw != null || pw != null) wall = 'between';
  return {
    symbol: i.symbol.toUpperCase(), regime: regimeOf(i.regime, i.netGex), side, wall,
    flipDistPct, callWallDistPct: cw, putWallDistPct: pw, maxGammaDistPct: pct(spot, i.maxGamma),
  };
}

const REGIME_WORD: Record<TrinityRegime, string> = { long: 'long gamma', short: 'short gamma', neutral: 'near-neutral gamma', unknown: 'regime not in the data' };
const SIDE_WORD: Record<TrinitySide, string> = { on: 'on its flip', above: 'above flip', below: 'under flip', unknown: 'flip not in the data' };
const WALL_WORD: Partial<Record<TrinityWall, string>> = {
  'at-call-wall': 'at its call wall', 'at-put-wall': 'at its put wall',
  'above-call-wall': 'through its call wall', 'below-put-wall': 'through its put wall',
};

/** The value most reads share, or null when there is no strict majority. */
function majority<T>(xs: T[]): T | null {
  const n = new Map<T, number>();
  xs.forEach((x) => n.set(x, (n.get(x) ?? 0) + 1));
  for (const [k, c] of n) if (c * 2 > xs.length) return k;
  return null;
}

/**
 * One index's clause inside a mixed sentence. An index whose regime differs
 * from the others is named by its regime (the bigger fact); otherwise by where
 * it sits against its flip. A wall it sits at / has broken is always added.
 */
export function clauseFor(r: TrinityRead, majRegime: TrinityRegime | null): string {
  const parts: string[] = [];
  const oddRegime = majRegime == null || r.regime !== majRegime;
  if (oddRegime) parts.push(REGIME_WORD[r.regime]);
  else parts.push(SIDE_WORD[r.side]);
  const w = WALL_WORD[r.wall];
  if (w) parts.push(w);
  if (oddRegime && r.side === 'on') parts.push(SIDE_WORD.on);
  return `${r.symbol} ${parts.join(' ')}`;
}

export function trinityAgreement(inputs: TrinityInput[]): TrinityAgreement {
  const reads = inputs.map(readIndex);
  const known = reads.filter((r) => r.regime !== 'unknown');
  const sided = reads.filter((r) => r.side !== 'unknown');
  const regime: TrinityAgreement['regime'] = known.length < 2 ? 'insufficient'
    : known.length === reads.length && reads.every((r) => r.regime === 'long') ? 'all-long'
    : known.length === reads.length && reads.every((r) => r.regime === 'short') ? 'all-short' : 'mixed';
  const flips: TrinityAgreement['flips'] = sided.length < 2 ? 'insufficient'
    : sided.length === reads.length && reads.every((r) => r.side === 'above') ? 'all-above'
    : sided.length === reads.length && reads.every((r) => r.side === 'below') ? 'all-below' : 'mixed';

  const terms = new Set<TrinityAgreement['terms'][number]>(['gex', 'gamma-flip']);
  reads.forEach((r) => {
    if (r.wall === 'at-call-wall' || r.wall === 'above-call-wall') terms.add('call-wall');
    if (r.wall === 'at-put-wall' || r.wall === 'below-put-wall') terms.add('put-wall');
  });

  if (regime === 'insufficient' && flips === 'insufficient') {
    const have = reads.filter((r) => r.regime !== 'unknown' || r.side !== 'unknown').map((r) => r.symbol);
    return {
      regime, flips, verdict: 'Not enough data', reads, terms: [...terms],
      sentence: have.length ? `Only ${have.join(', ')} read — agreement not in the data.` : 'No index read — agreement not in the data.',
    };
  }

  const wallBits = reads.map((r) => (WALL_WORD[r.wall] ? `${r.symbol} ${WALL_WORD[r.wall]}` : null)).filter(Boolean) as string[];
  const tail = wallBits.length ? `; ${wallBits.join(', ')}` : '';
  const flipPhrase = flips === 'all-above' ? 'all above their flips' : flips === 'all-below' ? 'all under their flips' : null;

  if ((regime === 'all-long' || regime === 'all-short') && flipPhrase) {
    const word = regime === 'all-long' ? 'long' : 'short';
    return { regime, flips, verdict: `Aligned ${word} gamma`, reads, terms: [...terms], sentence: `Aligned: all ${word} gamma, ${flipPhrase}${tail}.` };
  }

  const majRegime = majority(known.map((r) => r.regime));
  const clauses = reads.map((r) => clauseFor(r, majRegime));
  const lead = regime === 'all-long' ? 'Mixed (all long gamma)' : regime === 'all-short' ? 'Mixed (all short gamma)' : 'Mixed';
  return { regime, flips, verdict: 'Mixed', reads, terms: [...terms], sentence: `${lead}: ${clauses.join(', ')}.` };
}

/* ── mini ladder window (pure, shared with the tests) ── */

export interface LadderNode { strike: number; gex: number; vex: number }

/**
 * The `rows` strikes nearest spot (by listed strike), ascending, from per-strike
 * horizon nodes. Strikes with no exposure at all are dropped first so the
 * window spends its rows on the book, not on empty listings.
 */
export function ladderWindow(nodes: LadderNode[], spot: number | null, rows = 15): LadderNode[] {
  const live = nodes.filter((n) => Number.isFinite(n.strike) && (n.gex !== 0 || n.vex !== 0));
  if (!live.length || !fin(spot)) return [];
  const sorted = [...live].sort((a, b) => a.strike - b.strike);
  let at = sorted.findIndex((n) => n.strike >= spot);
  if (at < 0) at = sorted.length - 1;
  const half = Math.floor(rows / 2);
  let lo = Math.max(0, at - half);
  const hi = Math.min(sorted.length, lo + rows);
  lo = Math.max(0, hi - rows);
  return sorted.slice(lo, hi);
}
