/**
 * CONTRACT ENGINE (I/O shell) — fetch ONE chain, rank it with shared/contract-engine.ts.
 *
 * Chain order, first usable wins, and the response names the one actually used:
 *   1. Alpaca indicative snapshots (server/alpaca-options.ts) — primary. Free
 *      derived feed, NOT the OPRA tape; open interest lags 1–2 sessions.
 *   2. CBOE delayed quotes (~15 min) — when Alpaca is unconfigured / cooling down.
 *   3. Yahoo — last resort; its greeks are Black-Scholes on Yahoo's IV.
 * Nothing is synthesised when all three fail: status 'no_chain' with the list
 * of sources tried.
 *
 * Replaces the two surfaces the UI used to call side by side
 * (POST /api/options/select for "Pick Tier" and GET /api/contract-picker for
 * "Fit my budget"). Both endpoints still exist for their other callers.
 */
import { logger } from './logger';
import {
  rankContracts,
  dteOf,
  type ContractEngineLimits,
  type ContractEngineResult,
  type ContractEngineThesis,
  type EngineChainRow,
  type ChainSourceInfo,
} from '../shared/contract-engine';

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
};

interface LoadedChain { spot: number; rows: EngineChainRow[]; source: ChainSourceInfo }

async function loadAlpaca(symbol: string, dteMax: number): Promise<LoadedChain | null> {
  const { getAlpacaOptionsChain, isAlpacaOptionsConfigured, withAlpacaPriority } = await import('./alpaca-options');
  if (!isAlpacaOptionsConfigured()) return null;
  const maxDays = Math.max(180, dteMax + 5);
  const chain = await withAlpacaPriority(() => getAlpacaOptionsChain(symbol, { maxDays }));
  if (!chain || !(chain.spot && chain.spot > 0) || chain.contracts.length === 0) return null;
  const rows: EngineChainRow[] = chain.contracts.map((c) => ({
    occ: c.occ, type: c.type, strike: c.strike, expiry: c.expiration,
    bid: c.bid, ask: c.ask, delta: c.delta, gamma: c.gamma, theta: c.theta, vega: c.vega, iv: c.iv,
    openInterest: c.openInterest, volume: c.volume,
    greekSource: c.greekSource, quoteTime: c.quoteTime,
  }));
  return {
    spot: chain.spot,
    rows,
    source: {
      kind: 'alpaca_indicative',
      label: 'Alpaca indicative',
      fetchedAt: new Date(chain.fetchedAt).toISOString(),
      quotesAsOf: null,
      openInterestDate: chain.openInterestDate,
      note: 'Alpaca free indicative feed — not the OPRA tape; open interest lags 1–2 sessions.'
        + (chain.modelledShare > 0 ? ` ${Math.round(chain.modelledShare * 100)}% of greeks modelled from quotes.` : ''),
    },
  };
}

async function loadCboe(symbol: string): Promise<LoadedChain | null> {
  const { fetchCboeChain } = await import('./contract-analyzer/cboe-chain');
  const chain = await fetchCboeChain(symbol);
  if (!chain || !(chain.spot > 0) || chain.rawChain.length === 0) return null;
  const rows: EngineChainRow[] = chain.rawChain.map((o) => {
    const g = o.greeks;
    const delta = g && Number(g.delta) !== 0 ? Number(g.delta) : null; // CBOE fills missing greeks with 0
    return {
      occ: o.symbol, type: o.option_type === 'put' ? 'put' : 'call', strike: o.strike, expiry: o.expiration_date,
      bid: numOrNull(o.bid), ask: numOrNull(o.ask),
      delta, gamma: numOrNull(g?.gamma), theta: numOrNull(g?.theta), vega: numOrNull(g?.vega),
      iv: g?.mid_iv && g.mid_iv > 0 ? g.mid_iv : null,
      openInterest: numOrNull(o.open_interest), volume: numOrNull(o.volume),
      greekSource: 'provider', quoteTime: null,
    };
  });
  return {
    spot: chain.spot,
    rows,
    source: {
      kind: 'cboe_delayed',
      label: 'CBOE delayed',
      fetchedAt: new Date(chain.fetchedAt ?? Date.now()).toISOString(),
      quotesAsOf: null,
      openInterestDate: null,
      note: 'CBOE delayed quotes (~15 min behind); greeks are CBOE\'s own.',
    },
  };
}

async function loadYahoo(symbol: string, dteMin: number, dteMax: number): Promise<LoadedChain | null> {
  const { getYahooExpirations, getYahooEngineChain } = await import('./yahoo-options-fallback');
  const exps = await getYahooExpirations(symbol);
  if (!exps.length) return null;
  // Every expiry in the window (≤4) plus the nearest one either side, so a
  // "switch DTE" suggestion is still possible on this source.
  const dated = exps.map((e) => ({ e, d: dteOf(e) })).sort((a, b) => a.d - b.d);
  const inWin = dated.filter((x) => x.d >= dteMin && x.d <= dteMax).slice(0, 4);
  const below = dated.filter((x) => x.d < dteMin).slice(-1);
  const above = dated.filter((x) => x.d > dteMax).slice(0, 1);
  const pick = [...below, ...inWin, ...above].map((x) => x.e);
  if (!pick.length) return null;
  const { spot, chain } = await getYahooEngineChain(symbol, pick);
  if (!(spot > 0) || chain.length === 0) return null;
  const rows: EngineChainRow[] = chain.map((o: any) => ({
    occ: String(o.symbol), type: o.option_type === 'put' ? 'put' : 'call', strike: Number(o.strike), expiry: String(o.expiration_date).slice(0, 10),
    bid: numOrNull(o.bid), ask: numOrNull(o.ask),
    delta: numOrNull(o.greeks?.delta), gamma: numOrNull(o.greeks?.gamma), theta: numOrNull(o.greeks?.theta), vega: numOrNull(o.greeks?.vega),
    iv: o.greeks?.mid_iv > 0 ? Number(o.greeks.mid_iv) : null,
    openInterest: numOrNull(o.open_interest), volume: numOrNull(o.volume),
    greekSource: 'modelled (Black-Scholes)', quoteTime: null,
  }));
  return {
    spot,
    rows,
    source: {
      kind: 'yahoo_modelled',
      label: 'Yahoo',
      fetchedAt: new Date().toISOString(),
      quotesAsOf: null,
      openInterestDate: null,
      note: 'Yahoo quotes (delayed); greeks are Black-Scholes on Yahoo IV (30% assumed where Yahoo has none); open interest falls back to volume when Yahoo reports 0.',
    },
  };
}

export async function runContractEngine(
  symbol: string,
  thesis: ContractEngineThesis,
  limits: ContractEngineLimits,
): Promise<ContractEngineResult> {
  const sym = symbol.toUpperCase();
  const tried: string[] = [];
  const loaders: Array<[string, () => Promise<LoadedChain | null>]> = [
    ['Alpaca indicative', () => loadAlpaca(sym, limits.dteMax)],
    ['CBOE delayed', () => loadCboe(sym)],
    ['Yahoo', () => loadYahoo(sym, limits.dteMin, limits.dteMax)],
  ];
  for (const [name, load] of loaders) {
    tried.push(name);
    try {
      const chain = await load();
      if (!chain) continue;
      const optionType = thesis.direction === 'short' ? 'put' : 'call';
      // A source with no rows of the right type is not a usable chain — try the next one.
      if (!chain.rows.some((r) => r.type === optionType)) continue;
      return rankContracts({ symbol: sym, spot: chain.spot, rows: chain.rows, thesis, limits, source: chain.source, sourcesTried: tried });
    } catch (e: any) {
      logger.warn(`[CONTRACT-ENGINE] ${sym}: ${name} failed — ${e?.message ?? e}`);
    }
  }
  return {
    status: 'no_chain',
    symbol: sym,
    direction: thesis.direction,
    optionType: thesis.direction === 'short' ? 'put' : 'call',
    spot: null,
    source: null,
    limits,
    thesis: { stop: thesis.stop ?? null, t1: thesis.t1 ?? null, holdingDays: thesis.holdingDays ?? 3 },
    counts: { typeRows: 0, inWindow: 0, tradeable: 0, withinLimits: 0, outsideLimits: 0 },
    within: [],
    outside: [],
    emptyReason: `No option chain for ${sym} from ${tried.join(', ')} — nothing is shown rather than a guessed contract.`,
    relax: [],
    sourcesTried: tried,
  };
}
