/**
 * 0DTE / ≤1DTE option ideas never become shares (shared/short-dated-option.ts,
 * server/lib/liquidity-gate.ts) and the 0DTE flow plan tracks a premium-based
 * stop, not a 0.2-point VWAP (server/zero-dte-flow-core.ts planFor).
 *
 * Evidence: GOOGL zero_dte_flow 2026-10-07 09:56 ET was published as a SHORT
 * STOCK idea (2.89 sh, entry 346.23 / target 345.07 / stop 346.43) while its
 * catalyst read "GOOGL 345P 0DTE … mid $0.83".
 *   npm run test:short-dated
 */
import assert from 'node:assert/strict';
import { readLiquidityConfig, type StrikeRow } from '../shared/option-liquidity';
import { decideIdeaLiquidity, applyLiquidityGate, type GateChain } from '../server/lib/liquidity-gate';
import { shortDatedReason, isShortDatedOptionIdea, SHORT_DATED_WITHHELD_CODE } from '../shared/short-dated-option';
import { planFor } from '../server/zero-dte-flow-core';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`);
const AT = et('2026-10-07', '09:56');
const cfg = readLiquidityConfig({});
const TODAY = '2026-10-07';

const row = (strike: number, delta: number, oi: number, vol: number, bid: number, ask: number, type: 'call' | 'put' = 'put', expiry = TODAY): StrikeRow =>
  ({ type, strike, expiry, bid, ask, delta, openInterest: oi, volume: vol, prevVolume: vol, dte: 0 });

// The GOOGL idea as zero_dte_flow handed it to storage.createTradeIdea.
const googl = {
  symbol: 'GOOGL', assetType: 'option', direction: 'short', optionType: 'put', strikePrice: 345, expiryDate: TODAY,
  entryPremium: 0.83, optionDelta: -0.4, source: 'zero_dte_flow', dataSourceUsed: 'zero_dte_flow_ignition_short',
  expiryTier: '0DTE', optionDte: 0, entryPrice: 346.23, targetPrice: 345.07, stopLoss: 346.43,
  catalyst: 'GOOGL 345P 0DTE — opening-flow ignition @ 09:56 ET · mid $0.83', analysis: 'x', qualitySignals: ['desk:zero_dte_flow'],
};
const thin: GateChain = { rows: [row(345, -0.4, 120, 3, 0.70, 0.96), row(340, -0.1, 50, 1, 0.05, 0.20)], source: 'alpaca_indicative', asOf: new Date(AT - 30_000).toISOString() };

async function main() {
  await t('short-dated detection: same-day engines, index scalp / open drive, 0DTE tier, ≤1 DTE expiry', () => {
    for (const source of ['zero_dte_flow', 'zero_dte_desk', 'zero_dte_sniper', 'index_scalp', 'spx_fast_move']) {
      assert.ok(isShortDatedOptionIdea({ source, expiryDate: '2026-11-20' }, AT), source);
    }
    assert.match(String(shortDatedReason({ source: 'gex_scanner', dataSourceUsed: 'GEX_index_scalp_flip_bounce' }, AT)), /index scalp/);
    assert.match(String(shortDatedReason({ source: 'zero_dte_desk', dataSourceUsed: 'zero_dte_desk_open_drive' }, AT)), /zero_dte_desk/);
    assert.match(String(shortDatedReason({ source: 'gex_scanner', dataSourceUsed: 'x_open_drive' }, AT)), /open drive/);
    assert.ok(isShortDatedOptionIdea({ source: 'quant', expiryTier: '0DTE' }, AT));
    assert.ok(isShortDatedOptionIdea({ source: 'quant', expiryDate: TODAY }, AT), '0 DTE');
    assert.ok(isShortDatedOptionIdea({ source: 'quant', expiryDate: '2026-10-08' }, AT), '1 DTE');
    assert.ok(!isShortDatedOptionIdea({ source: 'quant', expiryDate: '2026-10-09' }, AT), '2 DTE swing keeps the fallback');
    assert.ok(!isShortDatedOptionIdea({ source: 'gex_scanner', dataSourceUsed: 'GEX_wall', expiryDate: '2026-10-23' }, AT));
  });

  await t('GOOGL 345P 0DTE, illiquid, no liquid strike → WITHHELD, never a short stock idea', () => {
    const r = decideIdeaLiquidity(googl, thin, AT, { cfg, env: {} });
    assert.equal(r.action, 'withheld');
    assert.equal(r.idea.assetType, 'option', 'not converted');
    assert.equal(r.idea.strikePrice, 345);
    assert.match(r.note, new RegExp(SHORT_DATED_WITHHELD_CODE));
    assert.match(r.note, /WITHHELD/);
    assert.equal((r.idea.convergenceSignalsJson as any).contractLiquidity.action, 'withheld');
  });

  await t('0DTE with no chain at all → withheld (not underlying-only)', async () => {
    assert.equal(decideIdeaLiquidity(googl, null, AT, { cfg, env: {} }).action, 'withheld');
    const failed = await applyLiquidityGate(googl, { nowMs: AT, env: {}, loadChain: async () => { throw new Error('boom'); } });
    assert.equal(failed.action, 'withheld');
  });

  await t('0DTE with a liquid neighbouring strike → stepped (still an option)', () => {
    const ok: GateChain = { ...thin, rows: [...thin.rows, row(346, -0.48, 4000, 2500, 1.10, 1.14)] };
    const r = decideIdeaLiquidity(googl, ok, AT, { cfg, env: {} });
    assert.equal(r.action, 'stepped'); assert.equal(r.idea.assetType, 'option'); assert.equal(r.idea.strikePrice, 346);
  });

  await t('a 1DTE idea from any source is withheld too; a 9DTE swing keeps underlying-only', () => {
    const tmr = { ...googl, source: 'quant', dataSourceUsed: 'quant', expiryTier: null, optionDte: null, expiryDate: '2026-10-08' };
    const ch: GateChain = { ...thin, rows: thin.rows.map((r) => ({ ...r, expiry: '2026-10-08' })) };
    assert.equal(decideIdeaLiquidity(tmr, ch, AT, { cfg, env: {} }).action, 'withheld');
    const swing = { ...tmr, expiryDate: '2026-10-16' };
    const ch2: GateChain = { ...thin, rows: thin.rows.map((r) => ({ ...r, expiry: '2026-10-16' })) };
    const r = decideIdeaLiquidity(swing, ch2, AT, { cfg, env: {} });
    assert.equal(r.action, 'underlying_only'); assert.equal(r.idea.assetType, 'stock');
  });

  await t('0DTE flow plan: published stop is the −40% premium stop via delta when the VWAP is closer', () => {
    // GOOGL short put: spot 346.23, mid 0.83, Δ −0.40, VWAP 346.43 (0.2 pts away).
    const s = { vwap: 346.43, orMid: 347.5, orHigh: 348, orLow: 345.9, last: 346.23, heldBars: 3, ok: true } as any;
    const p = planFor('short', 346.23, 0.83, -0.4, s, null);
    assert.equal(p.stopUnderlying, 346.43, 'structure stop kept for the live fade read');
    // 0.4 × 0.83 / 0.4 = 0.83 pts above spot
    assert.equal(p.ideaStopUnderlying, 347.06);
    assert.match(p.ideaStopBasis, /premium −40%/);
    assert.ok(Math.abs(p.ideaStopUnderlying - 346.23) > 0.5, 'not a 0.2-point stop');
  });

  await t('0DTE flow plan: structure stop kept when it is already beyond the premium stop', () => {
    const s = { vwap: 100.0, orMid: 99.5, orHigh: 101, orLow: 99, last: 101, heldBars: 3, ok: true } as any;
    const p = planFor('long', 101, 1.0, 0.5, s, null); // premium stop ≈ 100.2, VWAP 100.0 is farther
    assert.equal(p.ideaStopUnderlying, 100.0); assert.equal(p.ideaStopBasis, 'VWAP');
  });

  console.log(`test-short-dated-withhold: ${n} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
