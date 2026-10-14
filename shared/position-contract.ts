/**
 * POSITION CONTRACT — the chart long / short position tool sizes in OPTION
 * CONTRACTS, never shares (operator decision 2026-10-14, "no shares at all").
 *
 * The drawn position (entry / T1 / stop, optional T2) is mapped onto one call
 * (long) or put (short) picked from the live chain. The default contract is the
 * BUDGET CONTRACT pick (shared/budget-contract.ts) at the position's $ risk
 * ($500 / $1,000), and premiums at stop / T1 / T2 use the SAME mapping
 * (premiumAtLevel: Black-Scholes re-price from mid at the row IV, else
 * delta + ½gamma). Size = whole contracts whose total debit fits the $ risk
 * (a long option's max loss is its debit). No liquid contract → the tool says
 * so; it never falls back to shares. Pure.
 */
import {
  pickBudgetContract, premiumAtLevel, wholeContracts, clampBudget, shortContract,
  type BudgetChainRow,
} from './budget-contract';

/** The contract a position drawing is sized on (stored on the drawing). */
export interface PositionContract {
  optionType: 'call' | 'put';
  strike: number;
  expiry: string; // YYYY-MM-DD
  dte: number;
  /** Mid when quoted, at `spot`. */
  mid: number;
  /** Underlying price the mid was quoted at. */
  spot: number;
  delta: number;
  gamma?: number | null;
  iv?: number | null;
  occ?: string | null;
  /** Feed + quote time — the panel stamps the age, never presents it as live. */
  source?: string;
  asOf?: string;
}

export interface PositionContractStats {
  label: string;
  qty: number;
  /** Premium at the drawn entry (mapped from the quoted mid). */
  premEntry: number;
  premStop: number;
  premT1: number;
  premT2: number | null;
  debit: number;
  /** $ lost if the underlying hits the stop (whole position). */
  riskDollars: number;
  rewardT1: number;
  rewardT2: number | null;
  /** Option R:R at T1 (reward ÷ risk on premium). */
  rr: number | null;
  mapping: 'bs' | 'delta_gamma' | 'delta';
  /** Why the contract cannot be sized (budget too small, wrong side…), or null. */
  invalid: string | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Elapsed days used to map stop / T1 and T2 — same split as the budget contract (day vs swing). */
export function mappingDays(dte: number): { toT1: number; toT2: number } {
  return dte <= 1 ? { toT1: 0.25, toT2: 0.25 } : { toT1: 1.5, toT2: 3 };
}

export function contractLabelOf(symbol: string, c: Pick<PositionContract, 'expiry' | 'strike' | 'optionType'>): string {
  return `${symbol.toUpperCase()} ${shortContract(c.expiry, c.strike, c.optionType)}`;
}

/** Size + premium map of a drawn position on `c`. Pure. */
export function positionContractStats(p: {
  symbol: string; side: 'long' | 'short'; entry: number; stop: number; target: number; target2?: number | null;
  contract: PositionContract; risk: number;
}): PositionContractStats {
  const c = p.contract;
  const row = { type: c.optionType, strike: c.strike, delta: c.delta, gamma: c.gamma ?? null, iv: c.iv ?? null, dte: c.dte };
  const days = mappingDays(c.dte);
  const at = (lvl: number, d: number) => premiumAtLevel(row, c.mid, c.spot, lvl, d);
  const e = at(p.entry, 0);
  const premEntry = e.premium;
  // Re-anchor at the entry: stop / targets mapped from the entry premium at the entry price.
  const from = (lvl: number, d: number) => premiumAtLevel(row, premEntry, p.entry, lvl, d).premium;
  const premStop = r2(Math.min(premEntry, from(p.stop, days.toT1)));
  const premT1 = from(p.target, days.toT1);
  const premT2 = fin(p.target2) && p.target2 > 0 ? from(p.target2, days.toT2) : null;
  const budget = clampBudget(p.risk);
  const qty = wholeContracts(budget, premEntry);
  const wrongType = (p.side === 'long') !== (c.optionType === 'call');
  const invalid = !(premEntry > 0) ? 'no premium at the entry'
    : wrongType ? `a ${p.side} needs a ${p.side === 'long' ? 'call' : 'put'}`
    : qty < 1 ? `one contract ($${Math.round(premEntry * 100)}) is more than the $${budget} risk`
    : null;
  const riskDollars = r2(qty * (premEntry - premStop) * 100);
  const rewardT1 = r2(qty * (premT1 - premEntry) * 100);
  return {
    label: contractLabelOf(p.symbol, c),
    qty, premEntry, premStop, premT1, premT2,
    debit: r2(qty * premEntry * 100),
    riskDollars, rewardT1,
    rewardT2: premT2 != null ? r2(qty * (premT2 - premEntry) * 100) : null,
    rr: premEntry - premStop > 0 ? (premT1 - premEntry) / (premEntry - premStop) : null,
    mapping: e.method,
    invalid,
  };
}

/** Option P&L of the sized position at underlying `price`. Pure. */
export function positionContractPnl(s: PositionContractStats, c: PositionContract, entry: number, price: number): number {
  const row = { type: c.optionType, strike: c.strike, delta: c.delta, gamma: c.gamma ?? null, iv: c.iv ?? null, dte: c.dte };
  const prem = premiumAtLevel(row, s.premEntry, entry, price, 0).premium;
  return r2(s.qty * (prem - s.premEntry) * 100);
}

export function rowToPositionContract(row: BudgetChainRow, spot: number, source?: string, asOf?: string): PositionContract | null {
  if (!fin(row.bid) || !fin(row.ask) || !(row.bid > 0) || row.ask < row.bid || !fin(row.delta)) return null;
  return {
    optionType: row.type, strike: row.strike, expiry: row.expiry.slice(0, 10), dte: row.dte,
    mid: r2((row.bid + row.ask) / 2), spot, delta: row.delta, gamma: row.gamma ?? null, iv: row.iv ?? null,
    occ: row.occ ?? null, source, asOf,
  };
}

/**
 * Default contract for a drawn position: the budget-contract pick at the $ risk.
 * `{ ok: false, reason }` when nothing liquid fits — never a shares fallback.
 */
export function suggestPositionContract(p: {
  symbol: string; side: 'long' | 'short'; spot: number; entry: number; stop: number; target: number; target2?: number | null;
  risk: number; rows: BudgetChainRow[]; nowMs: number; source?: string; asOf?: string;
}): { ok: true; contract: PositionContract } | { ok: false; reason: string } {
  const r = pickBudgetContract({
    symbol: p.symbol, direction: p.side, spot: p.spot, t1: p.target, t2: p.target2 ?? null, stop: p.stop,
    budget: p.risk, holding: 'swing', holdDays: 1, rows: p.rows, nowMs: p.nowMs, source: p.source, asOf: p.asOf,
  });
  if (!r.ok) return { ok: false, reason: `No liquid contract — ${r.reason}. Not sized (the chart never sizes in shares).` };
  const row = p.rows.find((x) => x.type === r.pick.optionType && x.strike === r.pick.strike && x.expiry.slice(0, 10) === r.pick.expiry);
  const c = row ? rowToPositionContract(row, p.spot, p.source, p.asOf) : null;
  if (!c) return { ok: false, reason: 'No liquid contract — the picked row has no two-sided quote. Not sized.' };
  return { ok: true, contract: c };
}

/** Expiries + strikes of one side of the chain for the picker (liquid two-sided rows only). */
export function chainChoices(rows: BudgetChainRow[], type: 'call' | 'put'): { expiry: string; dte: number; strikes: number[] }[] {
  const by = new Map<string, { expiry: string; dte: number; strikes: Set<number> }>();
  for (const r of rows) {
    if (r.type !== type || !fin(r.bid) || !fin(r.ask) || !(r.bid > 0) || r.ask < r.bid) continue;
    const k = r.expiry.slice(0, 10);
    const g = by.get(k) ?? { expiry: k, dte: r.dte, strikes: new Set<number>() };
    g.strikes.add(r.strike);
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => a.dte - b.dte).map((g) => ({ expiry: g.expiry, dte: g.dte, strikes: [...g.strikes].sort((a, b) => a - b) }));
}
