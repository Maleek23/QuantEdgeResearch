/**
 * IDEA PRICE SCALE — an idea's entry / target / stop must be UNDERLYING prices.
 *
 * WHAT WAS WRONG (book verifier, prod 2026-10-06)
 * 17 QUANT-engine ideas stored as STOCK were scored 'never_triggered' and had
 * recorded +$273,428: their entryPrice was an option premium (CRCL 2.40, RIOT
 * 0.64, NU 0.515, SPXU 1.275, RGTI 0.86, MARA 0.765 …). The chain:
 *   1. server/quant-ideas-generator.ts (also auto-idea-generator.ts and the
 *      news path in ai-service.ts) called enrichOptionIdea() and OVERWROTE
 *      entry/target/stop with the contract's PREMIUM levels, without setting
 *      entryPremium.
 *   2. storage.createTradeIdea's premium guard (shared/option-premium-guard.ts)
 *      saw an option with no entryPremium and republished it as an
 *      underlying-only STOCK idea — "entry/target/stop are underlying levels".
 *      They were not: a $2.40 premium became CRCL's share entry.
 *   3. The tracker then compared a $2.40 "entry" to a ~$100+ share price and
 *      booked thousands of percent.
 *
 * THE FIX
 *   • Source: applyEnrichedContract() keeps the underlying levels and puts the
 *     contract mid in entryPremium (what the GEX publishers already did).
 *   • Write point: checkIdeaPriceScale() rejects, before the premium guard can
 *     convert anything, (a) an option whose entry/target/stop sit below
 *     OPTION_SCALE_FLOOR × strike (premium scale — shared/option-unit-guard.ts
 *     threshold), and (b) any idea whose entry is more than 25% off the live
 *     underlying quote.
 *
 * Pure: no I/O.
 */
import { OPTION_SCALE_FLOOR } from './option-unit-guard';

/** Max |entry / live quote − 1| for a publishable idea. */
export const ENTRY_QUOTE_MAX_DEVIATION = 0.25;

export type PriceScaleCode = 'option_levels_on_premium_scale' | 'entry_off_live_quote';

export interface PriceScaleInput {
  symbol?: string | null;
  assetType?: string | null;
  entryPrice?: number | null;
  targetPrice?: number | null;
  stopLoss?: number | null;
  strikePrice?: number | null;
}

export type PriceScaleResult = { ok: true } | { ok: false; code: PriceScaleCode; reason: string };

const pos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** Cash indices: their quote path varies by provider (proxy ETFs), so no quote check. */
const INDEX_ROOTS = new Set(['SPX', 'SPXW', 'NDX', 'NDXP', 'RUT', 'RUTW', 'VIX', 'VIXW', 'XSP', 'DJX']);

/** Ideas whose entry is compared against the underlying's equity quote. */
export function usesEquityQuote(assetType: string | null | undefined, symbol?: string | null): boolean {
  if (INDEX_ROOTS.has(String(symbol ?? '').toUpperCase().replace(/^\^|^\$/, ''))) return false;
  const a = String(assetType ?? 'stock').toLowerCase();
  return a === 'stock' || a === 'penny_stock' || a === 'etf' || a === 'option';
}

/**
 * @param liveQuote the underlying's current price, or null when unavailable
 *                  (the quote check is then skipped — never a reason to reject).
 */
export function checkIdeaPriceScale(idea: PriceScaleInput, liveQuote: number | null = null): PriceScaleResult {
  const asset = String(idea.assetType ?? '').toLowerCase();
  if (asset === 'option' && pos(idea.strikePrice)) {
    const floor = OPTION_SCALE_FLOOR * idea.strikePrice;
    const bad = (['entryPrice', 'targetPrice', 'stopLoss'] as const)
      .filter((k) => pos(idea[k]) && (idea[k] as number) < floor);
    if (bad.length) {
      return {
        ok: false, code: 'option_levels_on_premium_scale',
        reason: `${bad.map((k) => `${k} ${idea[k]}`).join(', ')} < ${OPTION_SCALE_FLOOR}× strike ${idea.strikePrice} — premium, not underlying levels (put the premium in entryPremium)`,
      };
    }
  }
  if (pos(liveQuote) && pos(idea.entryPrice) && usesEquityQuote(idea.assetType, idea.symbol)) {
    const dev = Math.abs(idea.entryPrice / liveQuote - 1);
    if (dev > ENTRY_QUOTE_MAX_DEVIATION) {
      return {
        ok: false, code: 'entry_off_live_quote',
        reason: `entry ${idea.entryPrice} is ${(dev * 100).toFixed(0)}% off the live ${String(idea.symbol ?? '').toUpperCase()} quote ${liveQuote} (max ${ENTRY_QUOTE_MAX_DEVIATION * 100}%)`,
      };
    }
  }
  return { ok: true };
}

/** What options-enricher.enrichOptionIdea returns (premium-space levels). */
export interface EnrichedContract {
  entryPrice: number;   // contract mid (premium)
  optionType: 'call' | 'put';
  strikePrice: number;
  expiryDate: string;
  analysis?: string;
  isLottoPlay?: boolean;
}

/**
 * Attach an enriched contract to an idea WITHOUT touching its underlying
 * levels: the premium goes to entryPremium, entry/target/stop stay on the
 * underlying, assetType becomes 'option'.
 */
export function applyEnrichedContract<T extends Record<string, any>>(idea: T, c: EnrichedContract): T & {
  assetType: 'option'; entryPremium: number; optionType: 'call' | 'put'; strikePrice: number; expiryDate: string; isLottoPlay: boolean;
} {
  return {
    ...idea,
    assetType: 'option',
    entryPremium: c.entryPrice,
    optionType: c.optionType,
    strikePrice: c.strikePrice,
    expiryDate: c.expiryDate,
    analysis: c.analysis ?? idea.analysis,
    isLottoPlay: !!c.isLottoPlay,
  };
}
