/**
 * OPTION LIQUIDITY GATE — one rule for every contract picker, every publisher
 * and the bot.
 *
 * WHY (book verifier, 2026-10-07)
 *   239 of 617 closed NEXUS option trades could not be verified: the contract
 *   did not trade within 30 min of the recorded entry/exit. Those were illiquid
 *   strikes, so the recorded fills are untrustworthy. A contract that does not
 *   trade cannot be published as if it could be filled at mid.
 *
 * THE RULE (env-configurable; defaults in brackets)
 *   • open interest ≥ OPT_MIN_OI [500]; 0DTE contracts and cash-index roots
 *     ≥ OPT_MIN_OI_0DTE [1000]. Unknown OI fails.
 *   • volume ≥ OPT_MIN_VOL [100]: today's volume from 10:00 ET, the PRIOR
 *     session's volume before 10:00 ET (falls back to today's, labelled, when
 *     the feed has no prior-day volume).
 *   • bid > 0 and ask > 0 (two-sided).
 *   • spread ≤ OPT_MAX_SPREAD_PCT [10%] of mid — or, for a sub-$0.50 contract,
 *     ≤ OPT_MAX_SPREAD_ABS_SUB50 [$0.05] absolute.
 *   • mid ≥ OPT_MIN_MID [$0.10].
 *   OPT_LIQUIDITY_GATE=off disables the gate everywhere.
 *
 * When the chosen strike fails, pickers step to the nearest liquid strike of
 * the same type and expiry within the delta band (pickLiquidStrike); when none
 * passes the idea is published underlying-only with "no liquid contract" —
 * unless it is short-dated (0DTE/≤1DTE or a same-day engine,
 * shared/short-dated-option.ts), in which case it is WITHHELD: a 0DTE option
 * idea is never republished as shares.
 *
 * Pure: no I/O.
 */
import { etClock } from './quote-freshness';

export const LIQUIDITY_RULE_VERSION = 'liq-v1';
export const ILLIQUID_SKIP_CODE = 'illiquid_contract';
export const NO_LIQUID_CONTRACT_SIGNAL = 'underlying_only:no_liquid_contract';
export const NO_LIQUID_CONTRACT_NOTE = 'no liquid contract';

type Env = Record<string, string | undefined>;

export interface LiquidityConfig {
  enabled: boolean;
  minOi: number;
  minOiZeroDteIndex: number;
  minVol: number;
  maxSpreadPct: number;
  /** Absolute spread allowed for contracts whose mid is under $0.50. */
  maxSpreadAbsSub50: number;
  minMid: number;
  /** ET minutes before which prior-day volume is used (10:00 = 600). */
  priorVolumeUntilEt: number;
  /** Half-width of the |delta| band a stepped strike must stay within. */
  deltaBand: number;
}

const numEnv = (env: Env, k: string, d: number): number => {
  const raw = env[k];
  if (raw == null || String(raw).trim() === '') return d;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function readLiquidityConfig(env: Env = typeof process !== 'undefined' ? process.env : {}): LiquidityConfig {
  return {
    enabled: !/^(0|false|off|no)$/i.test(String(env.OPT_LIQUIDITY_GATE ?? '').trim()),
    minOi: numEnv(env, 'OPT_MIN_OI', 500),
    minOiZeroDteIndex: numEnv(env, 'OPT_MIN_OI_0DTE', 1000),
    minVol: numEnv(env, 'OPT_MIN_VOL', 100),
    maxSpreadPct: numEnv(env, 'OPT_MAX_SPREAD_PCT', 0.10),
    maxSpreadAbsSub50: numEnv(env, 'OPT_MAX_SPREAD_ABS_SUB50', 0.05),
    minMid: numEnv(env, 'OPT_MIN_MID', 0.10),
    priorVolumeUntilEt: 10 * 60,
    deltaBand: numEnv(env, 'OPT_LIQ_DELTA_BAND', 0.15),
  };
}

/** Cash-settled index roots — always held to the 0DTE/index OI floor. */
export const LIQUIDITY_INDEX_ROOTS = new Set(['SPX', 'SPXW', 'NDX', 'NDXP', 'RUT', 'RUTW', 'VIX', 'VIXW', 'XSP', 'DJX']);

export function isIndexRoot(symbol: string | null | undefined): boolean {
  return LIQUIDITY_INDEX_ROOTS.has(String(symbol ?? '').toUpperCase().replace(/^\^|^\$/, ''));
}

export interface LiquidityInput {
  symbol: string;
  openInterest: number | null | undefined;
  /** Today's volume. */
  volume: number | null | undefined;
  /** Prior session's volume, when the feed reports it. */
  prevVolume?: number | null;
  bid: number | null | undefined;
  ask: number | null | undefined;
  /** Calendar DTE (0 = expires today). */
  dte: number | null | undefined;
}

export type VolumeBasis = 'today' | 'prior_day' | 'today_prior_unavailable';

/** What is stored on the idea and shown in NEXUS ("contract liquidity"). */
export interface ContractLiquiditySnapshot {
  rule: typeof LIQUIDITY_RULE_VERSION;
  ok: boolean;
  /** Contract the snapshot describes, e.g. "AAPL 2026-10-17 230C". */
  contract: string | null;
  oi: number | null;
  vol: number | null;
  volBasis: VolumeBasis;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  /** (ask − bid) / mid, fraction. */
  spreadPct: number | null;
  spreadAbs: number | null;
  minOi: number;
  minVol: number;
  failures: string[];
  /** Chain the numbers came from (alpaca_indicative / cboe_delayed / yahoo / tradier / picker). */
  source: string;
  /** When the source produced the numbers (ISO). */
  asOf: string;
  /** Set when the publish gate replaced the producer's strike. */
  steppedFrom?: string | null;
  /** Set when no liquid contract existed and the idea went underlying-only. */
  action?: 'kept' | 'stepped' | 'underlying_only' | 'withheld' | 'unverified';
}

export interface LiquidityVerdict { ok: boolean; failures: string[]; snapshot: ContractLiquiditySnapshot }

const fin = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Check one contract against the rule. `nowMs` decides the volume basis
 * (prior-day before 10:00 ET).
 */
export function checkContractLiquidity(
  input: LiquidityInput,
  ctx: { nowMs: number; cfg?: LiquidityConfig; source?: string; asOf?: string; contract?: string | null },
): LiquidityVerdict {
  const cfg = ctx.cfg ?? readLiquidityConfig();
  const failures: string[] = [];
  const oi = fin(input.openInterest);
  const today = fin(input.volume);
  const prev = fin(input.prevVolume);
  const bid = fin(input.bid);
  const ask = fin(input.ask);
  const dte = fin(input.dte);

  const zeroDteOrIndex = (dte != null && dte <= 0) || isIndexRoot(input.symbol);
  const minOi = zeroDteOrIndex ? cfg.minOiZeroDteIndex : cfg.minOi;

  const early = etClock(ctx.nowMs).minutes < cfg.priorVolumeUntilEt;
  let vol: number | null;
  let volBasis: VolumeBasis;
  if (early && prev != null) { vol = prev; volBasis = 'prior_day'; }
  else if (early) { vol = today; volBasis = 'today_prior_unavailable'; }
  else { vol = today; volBasis = 'today'; }

  if (oi == null) failures.push('open interest unknown');
  else if (oi < minOi) failures.push(`OI ${oi} < ${minOi}${zeroDteOrIndex ? ' (0DTE/index)' : ''}`);

  if (vol == null) failures.push('volume unknown');
  else if (vol < cfg.minVol) failures.push(`${volBasis === 'prior_day' ? 'prior-day ' : ''}volume ${vol} < ${cfg.minVol}`);

  let mid: number | null = null;
  let spreadPct: number | null = null;
  let spreadAbs: number | null = null;
  if (!(bid != null && bid > 0 && ask != null && ask > 0)) {
    failures.push(`one-sided quote (bid ${bid ?? '—'} / ask ${ask ?? '—'})`);
  } else if (ask < bid) {
    failures.push(`crossed quote (bid ${bid} > ask ${ask})`);
  } else {
    mid = (bid + ask) / 2;
    spreadAbs = ask - bid;
    spreadPct = spreadAbs / mid;
    const absOk = mid < 0.5 && spreadAbs <= cfg.maxSpreadAbsSub50 + 1e-9;
    if (spreadPct > cfg.maxSpreadPct + 1e-9 && !absOk) {
      failures.push(`spread ${(spreadPct * 100).toFixed(1)}% of mid > ${(cfg.maxSpreadPct * 100).toFixed(0)}%${mid < 0.5 ? ` and $${spreadAbs.toFixed(2)} > $${cfg.maxSpreadAbsSub50.toFixed(2)}` : ''}`);
    }
    if (mid < cfg.minMid - 1e-9) failures.push(`mid $${mid.toFixed(3)} < $${cfg.minMid.toFixed(2)}`);
  }

  const ok = failures.length === 0;
  return {
    ok,
    failures,
    snapshot: {
      rule: LIQUIDITY_RULE_VERSION,
      ok,
      contract: ctx.contract ?? null,
      oi, vol, volBasis,
      bid, ask,
      mid: mid != null ? Math.round(mid * 1000) / 1000 : null,
      spreadPct: spreadPct != null ? Math.round(spreadPct * 10000) / 10000 : null,
      spreadAbs: spreadAbs != null ? r2(spreadAbs) : null,
      minOi, minVol: cfg.minVol,
      failures,
      source: ctx.source ?? 'unknown',
      asOf: ctx.asOf ?? new Date(ctx.nowMs).toISOString(),
    },
  };
}

/** True when the gate is enabled and the contract fails it. Convenience for filters. */
export function isIlliquid(input: LiquidityInput, nowMs: number, cfg: LiquidityConfig = readLiquidityConfig()): boolean {
  if (!cfg.enabled) return false;
  return !checkContractLiquidity(input, { nowMs, cfg }).ok;
}

// ── nearest liquid strike ───────────────────────────────────────────────────

export interface StrikeRow {
  type: 'call' | 'put';
  strike: number;
  expiry: string; // YYYY-MM-DD
  bid: number | null;
  ask: number | null;
  delta: number | null;
  openInterest: number | null;
  volume: number | null;
  prevVolume?: number | null;
  dte: number;
}

/**
 * Nearest liquid strike to `chosen` (same type + expiry) whose |delta| stays
 * inside the band around the chosen contract's |delta|. When the chosen
 * delta is unknown the band is 0.20–0.80. Ties prefer the strike closer to
 * the money (higher |delta|). Null when none passes.
 */
export function pickLiquidStrike<T extends StrikeRow>(
  rows: T[],
  chosen: { type: 'call' | 'put'; strike: number; expiry: string; delta?: number | null; symbol: string },
  ctx: { nowMs: number; cfg?: LiquidityConfig },
): { row: T; verdict: LiquidityVerdict } | null {
  const cfg = ctx.cfg ?? readLiquidityConfig();
  const exp = chosen.expiry.slice(0, 10);
  const d0 = chosen.delta != null && Number.isFinite(chosen.delta) && Math.abs(chosen.delta) > 0 ? Math.abs(chosen.delta) : null;
  const lo = d0 != null ? Math.max(0.05, d0 - cfg.deltaBand) : 0.20;
  const hi = d0 != null ? Math.min(0.95, d0 + cfg.deltaBand) : 0.80;
  const cands = rows
    .filter((r) => r.type === chosen.type && r.expiry.slice(0, 10) === exp && Math.abs(r.strike - chosen.strike) > 1e-6)
    .filter((r) => r.delta != null && Number.isFinite(r.delta) && Math.abs(r.delta) >= lo - 1e-9 && Math.abs(r.delta) <= hi + 1e-9)
    .sort((a, b) => Math.abs(a.strike - chosen.strike) - Math.abs(b.strike - chosen.strike) || Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  for (const r of cands) {
    const v = checkContractLiquidity(
      { symbol: chosen.symbol, openInterest: r.openInterest, volume: r.volume, prevVolume: r.prevVolume, bid: r.bid, ask: r.ask, dte: r.dte },
      { nowMs: ctx.nowMs, cfg },
    );
    if (v.ok) return { row: r, verdict: v };
  }
  return null;
}

export function contractLabel(symbol: string, expiry: string | null | undefined, strike: number | null | undefined, type: string | null | undefined): string {
  const cp = String(type ?? '').toLowerCase().startsWith('p') ? 'P' : 'C';
  return `${String(symbol).toUpperCase()} ${String(expiry ?? '').slice(0, 10)} ${strike ?? '?'}${cp}`;
}

/** One-line human summary for notes / NEXUS. */
export function describeLiquidity(s: Pick<ContractLiquiditySnapshot, 'oi' | 'vol' | 'volBasis' | 'bid' | 'ask' | 'spreadPct' | 'source' | 'asOf'>): string {
  const vol = s.vol == null ? 'vol —' : `${s.volBasis === 'prior_day' ? 'prior-day vol' : 'vol'} ${s.vol}`;
  const q = s.bid != null && s.ask != null ? `${s.bid.toFixed(2)}/${s.ask.toFixed(2)}` : '—/—';
  const sp = s.spreadPct != null ? `${(s.spreadPct * 100).toFixed(1)}%` : '—';
  return `OI ${s.oi ?? '—'} · ${vol} · ${q} · spread ${sp} · ${s.source} @ ${s.asOf}`;
}

// ── verifier (research/verify-nexus-book.ts) ───────────────────────────────

export type LiquidityGateResult = 'pass' | 'fail' | 'stepped' | 'unverified' | 'unrecorded' | 'n/a';
interface GateRowLike { assetType: string; contractLiquidity?: { ok?: boolean; action?: string | null } | null }

/** The publish-time liquidity-gate result of a stored idea, as the verify ledger records it. */
export function liquidityGateResult(i: GateRowLike): LiquidityGateResult {
  if (i.assetType !== 'option') return i.contractLiquidity?.action === 'underlying_only' ? 'fail' : 'n/a';
  const l = i.contractLiquidity;
  if (!l) return 'unrecorded';
  if (l.action === 'unverified') return 'unverified';
  if (l.ok === false) return 'fail';
  return l.action === 'stepped' ? 'stepped' : 'pass';
}

/**
 * Verifier bug class for an option trade with no contract print within 30 min
 * of entry/exit: without a passing gate snapshot the contract most likely did
 * not trade (illiquid_contract_suspected); with one it stays bar_unverifiable.
 */
export function liquidityBugClass(i: GateRowLike, verdict: string, bugClass: string | null, reason: string): string | null {
  if (i.assetType !== 'option' || verdict !== 'UNVERIFIABLE' || bugClass !== 'bar_unverifiable') return bugClass;
  if (!/within 30m|no contract bars/.test(reason)) return bugClass;
  const g = liquidityGateResult(i);
  return g === 'pass' || g === 'stepped' ? bugClass : 'illiquid_contract_suspected';
}
