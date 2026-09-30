/**
 * Position bias — what a position BETS ON, not which side of the ticket it is.
 *
 * The journal rendered every bought option as "▲ LONG" (server/journal-row-maps.ts
 * mapDeskIdea stores options as direction 'long' — the contract was bought), so a
 * bought put, a bearish position, read as a bullish one. The arrow must follow
 * the market view:
 *   long call / long stock / short put            → ▲ BULL
 *   long put  / short stock / short call          → ▼ BEAR
 * and the ticket side stays available as secondary text ("long put").
 */
export type Bias = 'bull' | 'bear';

export interface PositionLike {
  direction?: string | null;
  assetType?: string | null;
  optionType?: string | null;
}

export interface PositionBias {
  bias: Bias;
  arrow: '▲' | '▼';
  /** "BULL" | "BEAR" */
  label: 'BULL' | 'BEAR';
  /** Ticket side + instrument, lowercase: "long put", "short stock", "long call". */
  leg: string;
}

const isShortSide = (d: string | null | undefined) => /^(short|sell|bear)/i.test(String(d ?? '').trim());

export function positionBias(p: PositionLike): PositionBias {
  const short = isShortSide(p.direction);
  const asset = String(p.assetType ?? 'stock').toLowerCase();
  const ot = String(p.optionType ?? '').toLowerCase();
  const isOption = asset === 'option' || ot === 'call' || ot === 'put';
  let bearish: boolean;
  let instrument: string;
  if (isOption && (ot === 'call' || ot === 'put')) {
    // A put is bearish when bought, bullish when sold; a call the reverse.
    bearish = ot === 'put' ? !short : short;
    instrument = ot;
  } else {
    bearish = short;
    instrument = isOption ? 'option' : asset === 'crypto' || asset === 'future' ? asset : 'stock';
  }
  return {
    bias: bearish ? 'bear' : 'bull',
    arrow: bearish ? '▼' : '▲',
    label: bearish ? 'BEAR' : 'BULL',
    leg: `${short ? 'short' : 'long'} ${instrument}`,
  };
}

/** "▼ BEAR · long put" (or just "▼ BEAR" when compact). */
export function positionBiasText(p: PositionLike, compact = false): string {
  const b = positionBias(p);
  return compact ? `${b.arrow} ${b.label}` : `${b.arrow} ${b.label} · ${b.leg}`;
}
