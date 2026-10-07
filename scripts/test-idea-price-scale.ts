/**
 * Unit tests for the idea price-scale gate + contract attachment
 * (shared/idea-price-scale.ts) — the fix for quant STOCK ideas published with
 * an option PREMIUM as entryPrice (verifier 2026-10-06: CRCL 2.40, RIOT 0.64 …).
 *   npm run -s test:idea-price-scale
 */
import assert from 'node:assert/strict';
import { checkIdeaPriceScale, applyEnrichedContract, usesEquityQuote, ENTRY_QUOTE_MAX_DEVIATION } from '../shared/idea-price-scale';
import { ensureScorableOptionIdea } from '../shared/option-premium-guard';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

// The pre-fix quant output: enrichOptionIdea premium levels written into entry/target/stop, no entryPremium.
const brokenQuant = { symbol: 'CRCL', assetType: 'option', source: 'quant', direction: 'long', entryPrice: 2.4, targetPrice: 4.2, stopLoss: 1.2, strikePrice: 130, optionType: 'call', expiryDate: '2026-10-09', entryPremium: null };

t('the old chain really produced a STOCK idea with a premium entry (regression witness)', () => {
  const g = ensureScorableOptionIdea(brokenQuant as any);
  assert.equal(g.converted, true);
  assert.equal(g.idea.assetType, 'stock');
  assert.equal(g.idea.entryPrice, 2.4);
});

t('option with premium-scale levels is rejected (no quote needed)', () => {
  const r = checkIdeaPriceScale(brokenQuant);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, 'option_levels_on_premium_scale');
  assert.match(!r.ok ? r.reason : '', /entryPrice 2\.4.*targetPrice 4\.2.*stopLoss 1\.2/);
});

t('option with only the stop on premium scale is rejected', () => {
  const r = checkIdeaPriceScale({ assetType: 'option', entryPrice: 128, targetPrice: 140, stopLoss: 1.2, strikePrice: 130 });
  assert.equal(r.ok, false);
});

t('option with underlying levels passes (deep ITM ok)', () => {
  assert.equal(checkIdeaPriceScale({ assetType: 'option', entryPrice: 128, targetPrice: 140, stopLoss: 122, strikePrice: 130 }).ok, true);
  assert.equal(checkIdeaPriceScale({ assetType: 'option', entryPrice: 285.77, targetPrice: 300, stopLoss: 270, strikePrice: 110 }).ok, true);
});

t('stock entry > 25% off the live quote is rejected', () => {
  const r = checkIdeaPriceScale({ symbol: 'CRCL', assetType: 'stock', entryPrice: 2.4, targetPrice: 4.2, stopLoss: 1.2 }, 118.5);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, 'entry_off_live_quote');
  const rr = checkIdeaPriceScale({ symbol: 'RIOT', assetType: 'stock', entryPrice: 0.64 }, 13.1);
  assert.equal(rr.ok, false);
});

t('25% is the boundary', () => {
  assert.equal(ENTRY_QUOTE_MAX_DEVIATION, 0.25);
  assert.equal(checkIdeaPriceScale({ symbol: 'X', assetType: 'stock', entryPrice: 124.9 }, 100).ok, true);
  assert.equal(checkIdeaPriceScale({ symbol: 'X', assetType: 'stock', entryPrice: 75.1 }, 100).ok, true);
  assert.equal(checkIdeaPriceScale({ symbol: 'X', assetType: 'stock', entryPrice: 125.5 }, 100).ok, false);
  assert.equal(checkIdeaPriceScale({ symbol: 'X', assetType: 'penny_stock', entryPrice: 0.7 }, 1).ok, false);
});

t('option underlying entry off the quote is rejected too', () => {
  assert.equal(checkIdeaPriceScale({ symbol: 'NU', assetType: 'option', entryPrice: 9, targetPrice: 10, stopLoss: 8.5, strikePrice: 10 }, 15).ok, false);
});

t('no quote → no quote rejection; crypto / futures / cash indices never quote-checked', () => {
  assert.equal(checkIdeaPriceScale({ symbol: 'CRCL', assetType: 'stock', entryPrice: 2.4 }, null).ok, true);
  assert.equal(checkIdeaPriceScale({ symbol: 'BTC', assetType: 'crypto', entryPrice: 1 }, 60000).ok, true);
  assert.equal(checkIdeaPriceScale({ symbol: 'ES', assetType: 'future', entryPrice: 1 }, 6000).ok, true);
  assert.equal(usesEquityQuote('option', 'SPX'), false);
  assert.equal(usesEquityQuote('option', '^NDX'), false);
  assert.equal(usesEquityQuote('stock', 'SPY'), true);
  assert.equal(checkIdeaPriceScale({ symbol: 'SPX', assetType: 'option', entryPrice: 6700, targetPrice: 6720, stopLoss: 6690, strikePrice: 6700 }, 670).ok, true);
});

t('applyEnrichedContract keeps underlying levels and moves the premium to entryPremium', () => {
  const idea = { symbol: 'CRCL', assetType: 'stock', direction: 'long', entryPrice: 118.5, targetPrice: 128, stopLoss: 114, analysis: 'base' };
  const out = applyEnrichedContract(idea, { entryPrice: 2.4, optionType: 'call', strikePrice: 125, expiryDate: '2026-11-20', analysis: 'with contract', isLottoPlay: false });
  assert.equal(out.assetType, 'option');
  assert.equal(out.entryPrice, 118.5);
  assert.equal(out.targetPrice, 128);
  assert.equal(out.stopLoss, 114);
  assert.equal(out.entryPremium, 2.4);
  assert.equal(out.strikePrice, 125);
  assert.equal(out.analysis, 'with contract');
  assert.equal(checkIdeaPriceScale(out, 118.6).ok, true);
  // and the premium guard leaves it an option
  assert.equal(ensureScorableOptionIdea(out as any).converted, false);
});

console.log(`✓ idea-price-scale: ${n} tests passed`);
