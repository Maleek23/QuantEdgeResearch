/**
 * The listed contract this signal trades, priced at publish.
 *
 * The scanner used to publish a SUGGESTED strike (rounded to a $5/$2 grid,
 * often not listed) with no premium — so none of its 142 ideas could be
 * scored (SR 11-7 v6 F-4). Now: the exact strike if listed on that expiry,
 * else the nearest listed strike of the same type and expiry, priced at the
 * bid/ask mid. Null when the chain has no two-sided quote there.
 */
export function pickSessionContract(
  chain: Array<{ option_type?: string; strike?: number; expiration_date?: string; bid?: number | null; ask?: number | null }>,
  optionType: 'call' | 'put', strike: number, expiry: string,
): { strike: number; mid: number } | null {
  const rows = chain.filter((o) =>
    o.option_type === optionType && o.expiration_date === expiry &&
    Number(o.bid) > 0 && Number(o.ask) > 0 && Number(o.ask) >= Number(o.bid) && Number.isFinite(Number(o.strike)));
  if (!rows.length) return null;
  const best = rows.reduce((a, b) => (Math.abs(Number(b.strike) - strike) < Math.abs(Number(a.strike) - strike) ? b : a));
  const mid = (Number(best.bid) + Number(best.ask)) / 2;
  return mid > 0 ? { strike: Number(best.strike), mid: Math.round(mid * 100) / 100 } : null;
}
