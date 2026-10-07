/**
 * PUBLISH-TIME LIQUIDITY GATE — applied at the single write point
 * (storage.createTradeIdea) to every automated option idea, whichever picker
 * chose its contract (selectContracts, the Contract Engine, the GEX scanners,
 * gex_magnet, 0DTE desk/flow, fast-moves …).
 *
 *   1. Re-read the idea's expiry from the chain (Alpaca indicative → CBOE
 *      delayed → Yahoo) and check the exact contract against
 *      shared/option-liquidity.ts.
 *   2. Fails → step to the nearest liquid strike of the same type and expiry
 *      within the delta band; the entry premium becomes that contract's mid.
 *   3. None → publish UNDERLYING-ONLY (assetType 'stock', contract fields
 *      cleared) with the note "no liquid contract". Never an illiquid contract.
 *   4. The snapshot (OI, vol, bid/ask, spread %, source, asOf) is stored on the
 *      idea at convergenceSignalsJson.contractLiquidity — NEXUS "contract liquidity".
 *
 * No chain at all: the contract cannot be verified, so by default the idea goes
 * underlying-only too (OPT_LIQUIDITY_UNVERIFIED=allow publishes it as-is,
 * stamped 'unverified'). OPT_LIQUIDITY_GATE=off disables the gate.
 */
import {
  checkContractLiquidity, pickLiquidStrike, readLiquidityConfig, contractLabel, describeLiquidity,
  NO_LIQUID_CONTRACT_NOTE, NO_LIQUID_CONTRACT_SIGNAL, ILLIQUID_SKIP_CODE,
  type ContractLiquiditySnapshot, type LiquidityConfig, type StrikeRow,
} from '@shared/option-liquidity';
import { calendarDte } from './publish-gates';
import { optionExpiryCloseMs } from '@shared/option-expiry';
import { logger } from '../logger';

export interface GateChain { rows: StrikeRow[]; source: string; asOf: string }
export type ExpiryChainLoader = (symbol: string, expiry: string, nowMs: number) => Promise<GateChain | null>;

export type LiquidityAction = 'kept' | 'stepped' | 'underlying_only' | 'unverified' | 'not_applicable';

export interface LiquidityGateResult<T> {
  action: LiquidityAction;
  idea: T;
  snapshot: ContractLiquiditySnapshot | null;
  note: string;
}

interface GateIdea {
  symbol?: string | null;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPremium?: number | null;
  optionDelta?: number | null;
  optionOpenInterest?: number | null;
  optionVolume?: number | null;
  exitBy?: string | null;
  analysis?: string | null;
  qualitySignals?: unknown;
  convergenceSignalsJson?: unknown;
}

const num = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

function withSnapshot<T extends GateIdea>(idea: T, snap: ContractLiquiditySnapshot): T {
  const cs = idea.convergenceSignalsJson && typeof idea.convergenceSignalsJson === 'object' ? idea.convergenceSignalsJson as Record<string, unknown> : {};
  return { ...idea, convergenceSignalsJson: { ...cs, contractLiquidity: snap } };
}

function appendNote(analysis: string | null | undefined, note: string): string {
  return analysis ? `${analysis} ${note}` : note;
}

/** The underlying-only version of an option idea whose contract is not liquid. Pure. */
export function toUnderlyingOnly<T extends GateIdea>(idea: T, why: string, snap: ContractLiquiditySnapshot): T {
  const label = contractLabel(String(idea.symbol ?? ''), idea.expiryDate, idea.strikePrice, idea.optionType);
  const note = `Underlying-only idea: ${NO_LIQUID_CONTRACT_NOTE} — ${label} ${why}, and no strike within the delta band passed the liquidity gate; ` +
    'published and scored on the underlying (entry/target/stop are underlying levels), not as a contract.';
  const closeMs = optionExpiryCloseMs(idea.expiryDate);
  const exitBy = idea.exitBy || (Number.isFinite(closeMs) ? new Date(closeMs).toISOString() : idea.exitBy);
  const signals = Array.isArray(idea.qualitySignals) ? [...(idea.qualitySignals as unknown[]), NO_LIQUID_CONTRACT_SIGNAL] : [NO_LIQUID_CONTRACT_SIGNAL];
  return withSnapshot({
    ...idea,
    assetType: 'stock',
    optionType: null,
    strikePrice: null,
    expiryDate: null,
    entryPremium: null,
    optionDelta: null,
    exitBy: exitBy ?? null,
    analysis: appendNote(idea.analysis, note),
    qualitySignals: signals,
  }, snap);
}

/**
 * Decide on a loaded chain. Pure (chain injected) — the unit tests drive this.
 */
export function decideIdeaLiquidity<T extends GateIdea>(
  idea: T,
  chain: GateChain | null,
  nowMs: number,
  opts: { cfg?: LiquidityConfig; env?: Record<string, string | undefined> } = {},
): LiquidityGateResult<T> {
  const env = opts.env ?? process.env;
  const cfg = opts.cfg ?? readLiquidityConfig(env);
  const symbol = String(idea.symbol ?? '').toUpperCase();
  if (!cfg.enabled || String(idea.assetType ?? '') !== 'option' || idea.strikePrice == null || !idea.expiryDate || !idea.optionType) {
    return { action: 'not_applicable', idea, snapshot: null, note: '' };
  }
  const type: 'call' | 'put' = String(idea.optionType).toLowerCase().startsWith('p') ? 'put' : 'call';
  const expiry = String(idea.expiryDate).slice(0, 10);
  const strike = Number(idea.strikePrice);
  const label = contractLabel(symbol, expiry, strike, type);
  const dte = calendarDte(expiry, nowMs) ?? 0;

  if (!chain || chain.rows.length === 0) {
    const snap: ContractLiquiditySnapshot = {
      rule: 'liq-v1', ok: false, contract: label, oi: null, vol: null, volBasis: 'today', bid: null, ask: null, mid: null,
      spreadPct: null, spreadAbs: null, minOi: cfg.minOi, minVol: cfg.minVol,
      failures: ['no option chain to verify liquidity'], source: 'none', asOf: new Date(nowMs).toISOString(),
    };
    if (String(env.OPT_LIQUIDITY_UNVERIFIED ?? '').toLowerCase() === 'allow') {
      return { action: 'unverified', idea: withSnapshot(idea, { ...snap, action: 'unverified' }), snapshot: { ...snap, action: 'unverified' }, note: `${label}: liquidity unverified (no chain) — published as-is (OPT_LIQUIDITY_UNVERIFIED=allow)` };
    }
    const s2 = { ...snap, action: 'underlying_only' as const };
    return { action: 'underlying_only', idea: toUnderlyingOnly(idea, 'could not be verified (no option chain answered)', s2), snapshot: s2, note: `${label}: no chain — underlying-only` };
  }

  const row = chain.rows.find((r) => r.type === type && r.expiry.slice(0, 10) === expiry && Math.abs(r.strike - strike) < 1e-6);
  const base = checkContractLiquidity(
    { symbol, openInterest: row?.openInterest ?? null, volume: row?.volume ?? null, prevVolume: row?.prevVolume ?? null, bid: row?.bid ?? null, ask: row?.ask ?? null, dte },
    { nowMs, cfg, source: chain.source, asOf: chain.asOf, contract: label },
  );
  if (!row) base.failures.unshift('contract not on the chain');
  if (row && base.ok) {
    const snap = { ...base.snapshot, action: 'kept' as const };
    return {
      action: 'kept',
      idea: withSnapshot({ ...idea, optionOpenInterest: snap.oi != null ? Math.round(snap.oi) : idea.optionOpenInterest ?? null, optionVolume: snap.vol != null ? Math.round(snap.vol) : idea.optionVolume ?? null }, snap),
      snapshot: snap,
      note: `${label} liquid: ${describeLiquidity(snap)}`,
    };
  }

  const why = `failed the liquidity gate (${(row ? base.failures : ['contract not on the chain', ...base.failures.filter((f) => f !== 'contract not on the chain')]).join('; ')})`;
  const delta = num(idea.optionDelta) ?? row?.delta ?? null;
  const step = pickLiquidStrike(chain.rows, { type, strike, expiry, delta, symbol }, { nowMs, cfg });
  if (step) {
    const r = step.row;
    const newLabel = contractLabel(symbol, expiry, r.strike, type);
    const v = checkContractLiquidity(
      { symbol, openInterest: r.openInterest, volume: r.volume, prevVolume: r.prevVolume ?? null, bid: r.bid, ask: r.ask, dte },
      { nowMs, cfg, source: chain.source, asOf: chain.asOf, contract: newLabel },
    );
    const snap: ContractLiquiditySnapshot = { ...v.snapshot, action: 'stepped', steppedFrom: label };
    const mid = snap.mid ?? ((Number(r.bid) + Number(r.ask)) / 2);
    const note = `Contract stepped to the nearest liquid strike: ${label} ${why} → ${newLabel} (${describeLiquidity(snap)}); entry premium is its mid $${mid.toFixed(2)}.`;
    return {
      action: 'stepped',
      idea: withSnapshot({
        ...idea,
        strikePrice: r.strike,
        entryPremium: Math.round(mid * 100) / 100,
        optionDelta: r.delta ?? idea.optionDelta ?? null,
        optionOpenInterest: snap.oi != null ? Math.round(snap.oi) : null,
        optionVolume: snap.vol != null ? Math.round(snap.vol) : null,
        analysis: appendNote(idea.analysis, note),
      }, snap),
      snapshot: snap,
      note,
    };
  }

  const snap: ContractLiquiditySnapshot = { ...base.snapshot, action: 'underlying_only' };
  return { action: 'underlying_only', idea: toUnderlyingOnly(idea, why, snap), snapshot: snap, note: `${label} ${why}; no liquid strike in the delta band — underlying-only` };
}

// ── chain loading (I/O) ─────────────────────────────────────────────────────

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
};

/** One expiry of one underlying: Alpaca indicative → CBOE delayed → Yahoo. */
export const loadExpiryChain: ExpiryChainLoader = async (symbol, expiry, nowMs) => {
  const sym = symbol.toUpperCase();
  const dteOf = (e: string) => calendarDte(e, nowMs) ?? 0;
  try {
    const { getAlpacaOptionsChain, isAlpacaOptionsConfigured } = await import('../alpaca-options');
    if (isAlpacaOptionsConfigured()) {
      const ch = await getAlpacaOptionsChain(sym, { expiration: expiry });
      if (ch && ch.contracts.length) {
        return {
          source: 'alpaca_indicative',
          asOf: new Date(ch.fetchedAt).toISOString(),
          rows: ch.contracts.map((c) => ({
            type: c.type, strike: c.strike, expiry: c.expiration, bid: c.bid, ask: c.ask, delta: c.delta,
            openInterest: c.openInterest, volume: c.volume, prevVolume: c.prevVolume ?? null, dte: dteOf(c.expiration),
          })),
        };
      }
    }
  } catch (e: any) { logger.debug(`[LIQ-GATE] ${sym} alpaca: ${e?.message ?? e}`); }
  try {
    const { fetchCboeChain } = await import('../contract-analyzer/cboe-chain');
    const ch = await fetchCboeChain(sym);
    const rows = (ch?.rawChain ?? []).filter((o) => String(o.expiration_date).slice(0, 10) === expiry);
    if (ch && rows.length) {
      return {
        source: 'cboe_delayed',
        asOf: new Date(ch.fetchedAt ?? nowMs).toISOString(),
        rows: rows.map((o) => ({
          type: o.option_type === 'put' ? 'put' as const : 'call' as const, strike: o.strike, expiry: String(o.expiration_date).slice(0, 10),
          bid: numOrNull(o.bid), ask: numOrNull(o.ask),
          delta: o.greeks && Number(o.greeks.delta) !== 0 ? Number(o.greeks.delta) : null,
          openInterest: numOrNull(o.open_interest), volume: numOrNull(o.volume), prevVolume: null, dte: dteOf(String(o.expiration_date)),
        })),
      };
    }
  } catch (e: any) { logger.debug(`[LIQ-GATE] ${sym} cboe: ${e?.message ?? e}`); }
  try {
    const { getYahooEngineChain } = await import('../yahoo-options-fallback');
    const { chain } = await getYahooEngineChain(sym, [expiry]);
    if (chain.length) {
      return {
        source: 'yahoo',
        asOf: new Date(nowMs).toISOString(),
        rows: chain.map((o: any) => ({
          type: o.option_type === 'put' ? 'put' as const : 'call' as const, strike: Number(o.strike), expiry: String(o.expiration_date).slice(0, 10),
          bid: numOrNull(o.bid), ask: numOrNull(o.ask), delta: numOrNull(o.greeks?.delta),
          openInterest: numOrNull(o.open_interest), volume: numOrNull(o.volume), prevVolume: null, dte: dteOf(String(o.expiration_date)),
        })),
      };
    }
  } catch (e: any) { logger.debug(`[LIQ-GATE] ${sym} yahoo: ${e?.message ?? e}`); }
  return null;
};

/** A producer-supplied snapshot for this exact contract, passing, ≤ 5 min old. */
export function freshPassingSnapshot(idea: GateIdea, nowMs: number): ContractLiquiditySnapshot | null {
  const cs = idea.convergenceSignalsJson as any;
  const s: ContractLiquiditySnapshot | undefined = cs?.contractLiquidity;
  if (!s || !s.ok || s.rule !== 'liq-v1') return null;
  const label = contractLabel(String(idea.symbol ?? ''), idea.expiryDate, idea.strikePrice, idea.optionType);
  if (s.contract !== label) return null;
  const age = nowMs - Date.parse(s.asOf);
  return Number.isFinite(age) && age >= 0 && age <= 5 * 60_000 ? s : null;
}

// ── bot entry check ─────────────────────────────────────────────────────────

export interface BotLiquidityVerdict { ok: boolean; code: 'ok' | typeof ILLIQUID_SKIP_CODE; reason: string; snapshot: ContractLiquiditySnapshot | null }

/**
 * May the bot open this contract? Re-reads the expiry from the chain unless a
 * passing snapshot ≤ 5 min old for this exact contract is supplied (e.g. the
 * picker's own). No chain = unverifiable = refused. Never throws.
 */
export async function botContractLiquidity(
  c: { symbol: string; optionType: string; strike: number; expiry: string },
  deps: { loadChain?: ExpiryChainLoader; nowMs?: number; env?: Record<string, string | undefined>; snapshot?: ContractLiquiditySnapshot | null } = {},
): Promise<BotLiquidityVerdict> {
  const nowMs = deps.nowMs ?? Date.now();
  const cfg = readLiquidityConfig(deps.env ?? process.env);
  if (!cfg.enabled) return { ok: true, code: 'ok', reason: 'liquidity gate off', snapshot: null };
  const label = contractLabel(c.symbol, c.expiry, c.strike, c.optionType);
  const pre = freshPassingSnapshot({
    symbol: c.symbol, assetType: 'option', optionType: c.optionType, strikePrice: c.strike, expiryDate: c.expiry,
    convergenceSignalsJson: deps.snapshot ? { contractLiquidity: deps.snapshot } : null,
  }, nowMs);
  if (pre) return { ok: true, code: 'ok', reason: describeLiquidity(pre), snapshot: pre };
  let chain: GateChain | null = null;
  try { chain = await (deps.loadChain ?? loadExpiryChain)(c.symbol.toUpperCase(), String(c.expiry).slice(0, 10), nowMs); } catch { chain = null; }
  if (!chain) return { ok: false, code: ILLIQUID_SKIP_CODE, reason: `${label}: liquidity unverifiable (no option chain answered)`, snapshot: null };
  const type = String(c.optionType).toLowerCase().startsWith('p') ? 'put' : 'call';
  const row = chain.rows.find((r) => r.type === type && r.expiry.slice(0, 10) === String(c.expiry).slice(0, 10) && Math.abs(r.strike - c.strike) < 1e-6);
  const v = checkContractLiquidity(
    { symbol: c.symbol, openInterest: row?.openInterest ?? null, volume: row?.volume ?? null, prevVolume: row?.prevVolume ?? null, bid: row?.bid ?? null, ask: row?.ask ?? null, dte: calendarDte(c.expiry, nowMs) },
    { nowMs, cfg, source: chain.source, asOf: chain.asOf, contract: label },
  );
  if (!row) return { ok: false, code: ILLIQUID_SKIP_CODE, reason: `${label}: not on the ${chain.source} chain`, snapshot: v.snapshot };
  return v.ok
    ? { ok: true, code: 'ok', reason: describeLiquidity(v.snapshot), snapshot: v.snapshot }
    : { ok: false, code: ILLIQUID_SKIP_CODE, reason: `${label}: ${v.failures.join('; ')}`, snapshot: v.snapshot };
}

/** Async wrapper used by storage.createTradeIdea. Never throws. */
export async function applyLiquidityGate<T extends GateIdea>(
  idea: T,
  deps: { loadChain?: ExpiryChainLoader; nowMs?: number; env?: Record<string, string | undefined> } = {},
): Promise<LiquidityGateResult<T>> {
  const nowMs = deps.nowMs ?? Date.now();
  const env = deps.env ?? process.env;
  const cfg = readLiquidityConfig(env);
  if (!cfg.enabled || String(idea.assetType ?? '') !== 'option' || idea.strikePrice == null || !idea.expiryDate || !idea.optionType) {
    return { action: 'not_applicable', idea, snapshot: null, note: '' };
  }
  const pre = freshPassingSnapshot(idea, nowMs);
  if (pre) return { action: 'kept', idea, snapshot: pre, note: 'producer snapshot' };
  let chain: GateChain | null = null;
  try {
    chain = await (deps.loadChain ?? loadExpiryChain)(String(idea.symbol).toUpperCase(), String(idea.expiryDate).slice(0, 10), nowMs);
  } catch (e: any) {
    logger.warn(`[LIQ-GATE] ${idea.symbol}: chain load failed — ${e?.message ?? e}`);
  }
  return decideIdeaLiquidity(idea, chain, nowMs, { cfg, env });
}
