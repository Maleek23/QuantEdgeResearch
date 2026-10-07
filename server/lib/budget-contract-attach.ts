/**
 * Attach a BUDGET CONTRACT (shared/budget-contract.ts) to an option idea at the
 * single write point (storage.createTradeIdea, right after the liquidity gate).
 * The primary contract is never changed. Stored at
 * convergenceSignalsJson.budgetContract (existing JSONB column — no migration).
 *
 * Flag: BUDGET_CONTRACT (default ON; off|0|false disables). Never throws and
 * never blocks a publish for longer than `timeoutMs` (default 4 s): no chain /
 * no fit → the idea is written without a budget contract and the reason is
 * stored at convergenceSignalsJson.budgetContractSkip.
 */
import {
  budgetContractEnabled, pickBudgetContract, type BudgetChainRow, type BudgetContract,
} from '@shared/budget-contract';
import { holdDaysForLabel } from '@shared/contract-engine';
import { readNexusRiskDollars } from '@shared/position-sizing';
import { shortDatedReason } from '@shared/short-dated-option';
import { calendarDte } from './publish-gates';
import { logger } from '../logger';

export type BudgetChainLoader = (symbol: string, maxDays: number, nowMs: number) => Promise<{ rows: BudgetChainRow[]; source: string; asOf: string } | null>;

interface AttachIdea {
  symbol?: string | null;
  source?: string | null;
  dataSourceUsed?: string | null;
  assetType?: string | null;
  direction?: string | null;
  entryPrice?: number | null;
  targetPrice?: number | null;
  target2?: number | null;
  stopLoss?: number | null;
  holdingPeriod?: string | null;
  expiryTier?: string | null;
  optionDte?: number | null;
  expiryDate?: string | null;
  convergenceSignalsJson?: unknown;
}

const num = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Alpaca indicative multi-expiry chain (cached in alpaca-options). */
export const loadBudgetChain: BudgetChainLoader = async (symbol, maxDays, nowMs) => {
  const { getAlpacaOptionsChain, isAlpacaOptionsConfigured } = await import('../alpaca-options');
  if (!isAlpacaOptionsConfigured()) return null;
  const ch = await getAlpacaOptionsChain(symbol, { maxDays, band: 0.25 });
  if (!ch || !ch.contracts.length) return null;
  return {
    source: 'alpaca_indicative',
    asOf: new Date(ch.fetchedAt).toISOString(),
    rows: ch.contracts.map((c) => ({
      type: c.type, strike: c.strike, expiry: c.expiration, bid: c.bid, ask: c.ask, delta: c.delta, gamma: c.gamma, iv: c.iv,
      openInterest: c.openInterest, volume: c.volume, prevVolume: c.prevVolume ?? null, dte: calendarDte(c.expiration, nowMs) ?? 0, occ: c.occ,
    })),
  };
};

export async function attachBudgetContract<T extends AttachIdea>(
  idea: T,
  deps: { loadChain?: BudgetChainLoader; nowMs?: number; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<{ idea: T; pick: BudgetContract | null; reason: string }> {
  const env = deps.env ?? process.env;
  if (!budgetContractEnabled(env)) return { idea, pick: null, reason: 'BUDGET_CONTRACT off' };
  if (String(idea.assetType ?? '') !== 'option') return { idea, pick: null, reason: 'not an option idea' };
  const nowMs = deps.nowMs ?? Date.now();
  const spot = num(idea.entryPrice);
  const t1 = num(idea.targetPrice);
  const dir = String(idea.direction ?? '').toLowerCase() === 'short' ? 'short' : 'long';
  const sym = String(idea.symbol ?? '').toUpperCase();
  const cs = idea.convergenceSignalsJson && typeof idea.convergenceSignalsJson === 'object' ? idea.convergenceSignalsJson as Record<string, unknown> : {};
  const skip = (reason: string) => ({ idea: { ...idea, convergenceSignalsJson: { ...cs, budgetContractSkip: { reason, at: new Date(nowMs).toISOString() } } }, pick: null, reason });
  if (!sym || spot == null || t1 == null) return skip('no symbol / entry / T1');

  // 0DTE stays 0DTE only for a same-day desk idea; everything else needs ≥ 1 DTE.
  const sd = shortDatedReason({ source: idea.source, dataSourceUsed: idea.dataSourceUsed }, nowMs);
  const zeroDteIdea = sd != null;
  const hp = String(idea.holdingPeriod ?? '').toLowerCase();
  const holding: 'day' | 'swing' | 'position' = zeroDteIdea || hp === 'day' ? 'day' : hp === 'position' ? 'position' : 'swing';
  const holdDays = holding === 'day' ? 1 : holdDaysForLabel(hp === 'week-ending' ? 'week' : hp);
  const maxDays = holding === 'position' ? 120 : holding === 'swing' ? 45 : 14;

  const timeoutMs = deps.timeoutMs ?? 4000;
  let chain: Awaited<ReturnType<BudgetChainLoader>> = null;
  try {
    chain = await Promise.race([
      (deps.loadChain ?? loadBudgetChain)(sym, maxDays, nowMs),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
  } catch (e: any) {
    logger.debug(`[BUDGET] ${sym}: chain load failed — ${e?.message ?? e}`);
  }
  if (!chain) return skip('no option chain answered');
  const res = pickBudgetContract({
    symbol: sym, direction: dir, spot, t1, t2: num(idea.target2), stop: num(idea.stopLoss),
    budget: readNexusRiskDollars(env), holding, holdDays, zeroDteIdea,
    rows: chain.rows, nowMs, source: chain.source, asOf: chain.asOf,
  });
  if (!res.ok) return skip(res.reason);
  return { idea: { ...idea, convergenceSignalsJson: { ...cs, budgetContract: res.pick } }, pick: res.pick, reason: res.pick.rationale };
}
