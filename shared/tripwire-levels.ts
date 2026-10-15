/**
 * TRIPWIRE LEVEL ALERTS — approach / touch on the dealer-positioning levels
 * (Apex, Gatekeeper, call wall, put wall, zero-γ) for watchlist symbols.
 * Pure: server/tripwire-levels.ts feeds it quotes + levels and delivers.
 *
 *   approach   price within APPROACH_PCT of the level (0.25 %), not yet touched
 *   touch      price at or through the level since the last sweep
 *              (prev on one side, now on/over it), or within TOUCH_PCT (0.03 %)
 *   dedupe     one alert per (session date, symbol, level kind, strike, event):
 *              a level that is touched never re-sends "approach" that session.
 *
 * The key includes the strike, so a level that MOVES (a new Apex) is a new
 * level. Nothing fires without a real price and a real level.
 */
export type TripLevelKind = 'apex' | 'gatekeeper' | 'call-wall' | 'put-wall' | 'zero-gamma';
export type TripEvent = 'approach' | 'touch';
export const TRIP_LEVEL_LABEL: Record<TripLevelKind, string> = {
  apex: 'Apex', gatekeeper: 'Gatekeeper', 'call-wall': 'Call wall', 'put-wall': 'Put wall', 'zero-gamma': 'Zero-γ',
};
export const APPROACH_PCT = 0.25;
export const TOUCH_PCT = 0.03;

export interface TripLevel { kind: TripLevelKind; price: number }
export interface TripAlert { key: string; date: string; symbol: string; kind: TripLevelKind; level: number; event: TripEvent; price: number; text: string }

export const tripKey = (date: string, symbol: string, kind: TripLevelKind, level: number, event: TripEvent) =>
  `${date}|${symbol}|${kind}|${level}|${event}`;

/** Alerts for one symbol this sweep. `sent` = keys already delivered this session (mutated by the caller). Pure. */
export function evaluateTripwires(inp: {
  date: string; symbol: string; price: number; prevPrice: number | null; levels: TripLevel[]; sent: ReadonlySet<string>;
}): TripAlert[] {
  const { date, symbol, price, prevPrice } = inp;
  if (!(price > 0)) return [];
  const out: TripAlert[] = [];
  const seen = new Set<string>();
  for (const l of inp.levels) {
    if (!(l.price > 0)) continue;
    const id = `${l.kind}|${l.price}`;
    if (seen.has(id)) continue; seen.add(id);
    const distPct = (Math.abs(price - l.price) / l.price) * 100;
    const crossed = prevPrice != null && prevPrice > 0 && (prevPrice - l.price) * (price - l.price) <= 0 && prevPrice !== price;
    const touchKey = tripKey(date, symbol, l.kind, l.price, 'touch');
    const apprKey = tripKey(date, symbol, l.kind, l.price, 'approach');
    const name = TRIP_LEVEL_LABEL[l.kind];
    if ((crossed || distPct <= TOUCH_PCT) && !inp.sent.has(touchKey)) {
      out.push({ key: touchKey, date, symbol, kind: l.kind, level: l.price, event: 'touch', price,
        text: `${symbol} touched ${name} ${fmt(l.price)} — now ${fmt(price)}` });
    } else if (distPct <= APPROACH_PCT && !inp.sent.has(apprKey) && !inp.sent.has(touchKey)) {
      out.push({ key: apprKey, date, symbol, kind: l.kind, level: l.price, event: 'approach', price,
        text: `${symbol} approaching ${name} ${fmt(l.price)} — now ${fmt(price)} (${(price < l.price ? '−' : '+')}${distPct.toFixed(2)}%)` });
    }
  }
  return out;
}

const fmt = (p: number) => (p >= 100 ? p.toFixed(2) : p.toFixed(2));
