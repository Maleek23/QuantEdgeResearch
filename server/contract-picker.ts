/**
 * ADAPTIVE CONTRACT PICKER — the contract engine made interactive.
 *
 * Operator ask (2026-09-23): pick per DTE and account size, and have the
 * engine warn instead of silently choosing. This module turns one delayed
 * CBOE chain fetch into ranked candidates for a chosen DTE window and
 * budget, each carrying explicit warnings a trader can act on:
 * spread cost, theta burn at this DTE, position size vs account, thin OI.
 *
 * Data honesty: the chain is CBOE DELAYED quotes (the Tradier key is dead —
 * 401 since Aug 26; renewing it upgrades this to live). Every response says
 * so. Greeks are the chain's own, never invented; a contract without greeks
 * shows what it lacks instead of a fabricated theta.
 */
import { fetchCboeChain } from './contract-analyzer/cboe-chain';
import { logger } from './logger';

export interface PickerCandidate {
  label: string;            // "CALL $370 · 09/30 · 7 DTE"
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number | null;   // (ask-bid)/mid
  delta: number | null;
  thetaPerDayPct: number | null; // |theta| / mid — % of premium burned per day
  iv: number | null;
  openInterest: number;
  volume: number;
  costPerContract: number;    // mid * 100
  pctOfBudget: number | null;
  warnings: string[];
  score: number;
}

export interface PickerResult {
  symbol: string;
  spot: number;
  dataSource: 'cboe_delayed';
  note: string;
  candidates: PickerCandidate[];
}

const dteOf = (expiry: string): number =>
  Math.max(0, Math.round((new Date(expiry + 'T21:00:00Z').getTime() - Date.now()) / 86_400_000));

export async function pickContracts(
  symbol: string,
  opts: { direction?: 'long' | 'short'; dteMin?: number; dteMax?: number; budget?: number },
): Promise<PickerResult | null> {
  const direction = opts.direction ?? 'long';
  const dteMin = Math.max(0, opts.dteMin ?? 5);
  const dteMax = Math.max(dteMin, opts.dteMax ?? 21);
  const budget = opts.budget && opts.budget > 0 ? opts.budget : null;

  const chain = await fetchCboeChain(symbol);
  if (!chain || !chain.rawChain.length || !(chain.spot > 0)) {
    logger.warn(`[PICKER] no chain for ${symbol}`);
    return null;
  }
  const wantType = direction === 'long' ? 'call' : 'put';

  const candidates: PickerCandidate[] = [];
  for (const o of chain.rawChain) {
    if (String(o.option_type).toLowerCase() !== wantType) continue;
    const dte = dteOf(o.expiration_date);
    if (dte < dteMin || dte > dteMax) continue;
    const bid = Number(o.bid) || 0;
    const ask = Number(o.ask) || 0;
    if (!(ask > 0)) continue;
    const mid = bid > 0 ? (bid + ask) / 2 : ask;
    if (mid < 0.05) continue;
    // Moneyness window: near-the-money is where directional trades live.
    const money = o.strike / chain.spot;
    if (wantType === 'call' && (money < 0.9 || money > 1.15)) continue;
    if (wantType === 'put' && (money > 1.1 || money < 0.85)) continue;

    const delta = o.greeks?.delta != null ? Math.abs(Number(o.greeks.delta)) : null;
    const theta = o.greeks?.theta != null ? Math.abs(Number(o.greeks.theta)) : null;
    const iv = o.greeks?.mid_iv != null ? Number(o.greeks.mid_iv) : null;
    const oi = Number(o.open_interest) || 0;
    const vol = Number(o.volume) || 0;
    const spreadPct = mid > 0 && bid > 0 ? (ask - bid) / mid : null;
    const thetaPerDayPct = theta != null && mid > 0 ? theta / mid : null;
    const cost = mid * 100;
    const pctOfBudget = budget ? cost / budget : null;

    const warnings: string[] = [];
    if (spreadPct == null) warnings.push('no bid — spread unknowable, exit may be ugly');
    else if (spreadPct > 0.10) warnings.push(`spread ${(spreadPct * 100).toFixed(0)}% of premium — you pay it entering AND exiting`);
    if (oi < 100) warnings.push(`OI ${oi} — thin interest, harder fills`);
    if (vol === 0) warnings.push('zero volume this session');
    if (thetaPerDayPct != null && thetaPerDayPct > 0.04) warnings.push(`theta burns ${(thetaPerDayPct * 100).toFixed(1)}%/day of the premium at ${dte} DTE`);
    if (pctOfBudget != null && pctOfBudget > 0.15) warnings.push(`one contract = ${(pctOfBudget * 100).toFixed(0)}% of the account — sizing risk`);
    if (pctOfBudget != null && pctOfBudget > 1) warnings.push('one contract exceeds the whole budget');
    if (delta == null) warnings.push('greeks unavailable on the delayed chain for this strike');

    // Score: liquidity + delta sweet spot (~0.40) + spread + budget fit.
    let score = 50;
    score += Math.min(15, Math.log10(Math.max(1, oi)) * 5);
    if (delta != null) score += 15 - Math.min(15, Math.abs(delta - 0.4) * 60);
    if (spreadPct != null) score += 10 - Math.min(10, spreadPct * 100);
    if (pctOfBudget != null) score += pctOfBudget <= 0.10 ? 10 : pctOfBudget <= 0.25 ? 5 : 0;
    score -= warnings.length * 3;

    candidates.push({
      label: `${wantType.toUpperCase()} $${o.strike} · ${o.expiration_date.slice(5).replace('-', '/')} · ${dte} DTE`,
      optionType: wantType as 'call' | 'put',
      strike: o.strike,
      expiry: o.expiration_date,
      dte, bid, ask,
      mid: Number(mid.toFixed(2)),
      spreadPct, delta,
      thetaPerDayPct, iv,
      openInterest: oi, volume: vol,
      costPerContract: Number(cost.toFixed(0)),
      pctOfBudget,
      warnings,
      score: Math.round(score),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    symbol: symbol.toUpperCase(),
    spot: chain.spot,
    dataSource: 'cboe_delayed',
    note: 'CBOE delayed chain — renew the Tradier key at tradier.com for live quotes/greeks',
    candidates: candidates.slice(0, 8),
  };
}
