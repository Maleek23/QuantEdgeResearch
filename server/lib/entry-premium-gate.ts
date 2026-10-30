/**
 * PUBLISH-TIME ENTRY PREMIUM GATE (shared/entry-premium-truth.ts) — applied in
 * storage.createTradeIdea to every automated option idea, after the liquidity
 * gate / budget promotion settled the final contract and BEFORE the premium
 * plan is mapped, so T1/T2/stop are mapped from the corrected entry.
 *
 *   quote: the liquidity gate's own snapshot for the same contract when it is
 *   live and ≤ 60 s old, else one Alpaca contract quote.
 *   → entry = live ask (tight spread) / mid; > 25% divergence logged as a re-price;
 *   → no live quote → withheld (storage refuses the write).
 * SPX / SPXW (ledger audit 2026-10-15 fix 7): no quote → priced from the SPXW
 * contract's own Alpaca 1-min bars — the last print ≤ 5 min old is the entry
 * (> 25% off the claim = re-priced). The audit found SPX 7775P / 7760P published
 * at premiums the contract never traded. Other index roots Alpaca cannot quote
 * (NDX/VIX/RUT) — and SPX with no recent print — are stamped 'unverified' and
 * keep the producer's premium; the outcome guard still re-prices them.
 * ENTRY_PREMIUM_TRUTH=off disables the gate.
 */
import { decideEntryPremium, type EntryQuoteStamp, type LiveQuote, ENTRY_QUOTE_VERSION } from '@shared/entry-premium-truth';
import { contractLabel } from '@shared/option-liquidity';
import { logger } from '../logger';

const INDEX_ROOTS = new Set(['SPX', 'SPXW', 'NDX', 'NDXP', 'VIX', 'RUT', 'XSP']);

interface GateIdea {
  symbol?: string | null;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPremium?: number | null;
  analysis?: string | null;
  convergenceSignalsJson?: unknown;
}

export interface EntryGateDeps {
  fetchQuote?: (occ: string) => Promise<{ bid: number | null; ask: number | null; quoteTime: string | null; via: string } | null>;
  /** Recent 1-min bars for a contract (SPX → SPXW). Default: Alpaca, no history cap. */
  fetchBars?: (occ: string, nowMs: number) => Promise<{ t: number; o: number; h: number; l: number; c: number; v?: number }[]>;
  env?: Record<string, string | undefined>;
}

const csOf = (x: unknown): Record<string, any> => (x && typeof x === 'object' ? (x as Record<string, any>) : {});

/** A liquidity snapshot on the idea that describes exactly this contract. */
function snapshotQuote(idea: GateIdea, label: string): LiveQuote | null {
  const cs = csOf(idea.convergenceSignalsJson);
  for (const s of [cs.contractLiquidity, cs.budgetContract?.liquidity]) {
    if (s && s.contract === label && (s.bid != null || s.ask != null)) {
      const asOfMs = Date.parse(String(s.asOf ?? ''));
      return { bid: s.bid ?? null, ask: s.ask ?? null, source: String(s.source ?? 'unknown'), asOfMs: Number.isFinite(asOfMs) ? asOfMs : null };
    }
  }
  return null;
}

/** SPX / SPXW publish premiums are priced from the SPXW contract's prints. */
const SPX_ROOTS = new Set(['SPX', 'SPXW']);
export const SPX_BAR_MAX_AGE_MS = 5 * 60_000;
export const SPX_BAR_DIVERGENCE = 0.25;

async function defaultFetchBars(occ: string, nowMs: number) {
  const { getAlpacaOptionBarsRecent } = await import('../alpaca-options');
  return getAlpacaOptionBarsRecent(occ, 15 * 60_000, nowMs);
}

/**
 * Fix 7: an SPX / SPXW entry from the SPXW contract's last 1-min print (≤ 5 min old).
 * Returns null when nothing printed recently (the caller keeps 'unverified'). Pure apart from `bars`.
 */
export function spxBarStamp(claimed: number, bars: { t: number; c: number; v?: number }[], nowMs: number, occ: string): EntryQuoteStamp | null {
  const last = [...bars].reverse().find((b) => b.t <= nowMs && b.c > 0);
  if (!last) return null;
  const ageMs = Math.max(0, nowMs - (last.t + 60_000));
  if (ageMs > SPX_BAR_MAX_AGE_MS) return null;
  const px = Math.round(last.c * 100) / 100;
  const cl = Number.isFinite(claimed) && claimed > 0 ? claimed : null;
  const off = cl == null ? null : Math.abs(cl - px) / px;
  const repriced = off == null || off > SPX_BAR_DIVERGENCE;
  return {
    v: ENTRY_QUOTE_VERSION, action: repriced ? 'repriced' : 'confirmed', entry: px, mid: px, basis: 'mid', claimed: cl, bid: null, ask: null,
    source: `alpaca_spxw_bars:${occ}`, quoteAsOf: new Date(last.t).toISOString(), ageMs, at: new Date(nowMs).toISOString(),
    reason: cl == null
      ? `no claimed premium — SPXW last print $${px.toFixed(2)}`
      : repriced
        ? `claimed $${cl.toFixed(2)} is ${Math.round(off! * 100)}% off the SPXW last print $${px.toFixed(2)} — re-priced to the print`
        : `claimed $${cl.toFixed(2)} within ${Math.round(SPX_BAR_DIVERGENCE * 100)}% of the SPXW last print $${px.toFixed(2)} — entry is the print`,
  } as EntryQuoteStamp;
}

async function defaultFetchQuote(occ: string) {
  const { getAlpacaContractQuote } = await import('../alpaca-options');
  return getAlpacaContractQuote(occ);
}

export async function applyEntryPremiumGate<T extends GateIdea>(
  idea: T, nowMs = Date.now(), deps: EntryGateDeps = {},
): Promise<{ idea: T; stamp: EntryQuoteStamp | null }> {
  const env = deps.env ?? process.env;
  if (String(env.ENTRY_PREMIUM_TRUTH ?? '').toLowerCase() === 'off') return { idea, stamp: null };
  if (String(idea.assetType ?? '') !== 'option' || idea.strikePrice == null || !idea.expiryDate || !idea.optionType) return { idea, stamp: null };
  const sym = String(idea.symbol ?? '').toUpperCase();
  const type: 'call' | 'put' = String(idea.optionType).toLowerCase().startsWith('p') ? 'put' : 'call';
  const expiry = String(idea.expiryDate).slice(0, 10);
  const strike = Number(idea.strikePrice);
  const label = contractLabel(sym, expiry, strike, type);
  const claimed = Number(idea.entryPremium);

  let quote = snapshotQuote(idea, label);
  let stamp = decideEntryPremium(claimed, quote, nowMs);
  if (stamp.action === 'withheld' && !INDEX_ROOTS.has(sym)) {
    try {
      const { buildOccOptionSymbol } = await import('../option-minute-history');
      const occ = buildOccOptionSymbol(sym, expiry, type, strike);
      const q = await (deps.fetchQuote ?? defaultFetchQuote)(occ);
      if (q) {
        // A fresh snapshot request IS the standing quote now; a cached chain's
        // quote is only as fresh as its own quote timestamp.
        const qt = Date.parse(String(q.quoteTime ?? ''));
        const asOfMs = q.via === 'chain_cache' ? (Number.isFinite(qt) ? qt : null) : nowMs;
        quote = { bid: q.bid, ask: q.ask, source: 'alpaca_indicative', asOfMs };
        stamp = decideEntryPremium(claimed, quote, nowMs);
      }
    } catch (e: any) {
      logger.debug(`[ENTRY-PREMIUM] ${label} quote failed: ${e?.message ?? e}`);
    }
  }
  if (stamp.action === 'withheld' && SPX_ROOTS.has(sym)) {
    try {
      const { buildOccOptionSymbol } = await import('../option-minute-history');
      const occ = buildOccOptionSymbol('SPXW', expiry, type, strike);
      const bars = await (deps.fetchBars ?? defaultFetchBars)(occ, nowMs);
      const st = spxBarStamp(claimed, bars, nowMs, occ);
      if (st) stamp = st;
    } catch (e: any) {
      logger.debug(`[ENTRY-PREMIUM] ${label} SPXW bars failed: ${e?.message ?? e}`);
    }
  }
  if (stamp.action === 'withheld' && INDEX_ROOTS.has(sym)) {
    stamp = { ...stamp, v: ENTRY_QUOTE_VERSION, action: 'unverified', entry: Number.isFinite(claimed) && claimed > 0 ? claimed : null, reason: `${stamp.reason}; index root — producer premium kept, outcome guard checks it against prints` };
  }

  const cs = csOf(idea.convergenceSignalsJson);
  const next: T = { ...idea, convergenceSignalsJson: { ...cs, entryQuote: stamp } };
  if ((stamp.action === 'repriced' || stamp.action === 'confirmed') && stamp.entry != null) {
    (next as any).entryPremium = stamp.entry;
    if (stamp.action === 'repriced') {
      const note = `Entry premium re-priced at publish: ${stamp.reason} (${stamp.source}, quote ${stamp.ageMs != null ? Math.round(stamp.ageMs / 1000) + 's' : '?'} old).`;
      (next as any).analysis = idea.analysis ? `${idea.analysis} ${note}` : note;
      logger.warn(`[ENTRY-PREMIUM] ${label}: ${stamp.reason}`);
    }
  }
  return { idea: next, stamp };
}
