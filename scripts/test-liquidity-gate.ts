/**
 * Option liquidity gate (shared/option-liquidity.ts, server/lib/liquidity-gate.ts):
 * the rule, env overrides, prior-day volume before 10:00 ET, nearest liquid strike
 * in the delta band, underlying-only fallback, the picker filter
 * (selectFromChain / rankContracts), the bot refusal and the verifier classes.
 *   npm run test:liquidity-gate
 */
import assert from 'node:assert/strict';
import {
  readLiquidityConfig, checkContractLiquidity, pickLiquidStrike, liquidityGateResult, liquidityBugClass,
  NO_LIQUID_CONTRACT_SIGNAL, ILLIQUID_SKIP_CODE, type StrikeRow,
} from '../shared/option-liquidity';
import { decideIdeaLiquidity, applyLiquidityGate, botContractLiquidity, type GateChain } from '../server/lib/liquidity-gate';
import { deskIntegrityFlags, DESK_BUG_CLASSES } from '../shared/desk-integrity';
import { selectFromChain, type RawChainOption } from '../server/option-selection-engine';
import { rankContracts, type EngineChainRow } from '../shared/contract-engine';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`);
const NOON = et('2026-10-07', '12:00');   // Wed, after 10:00 ET → today's volume
const EARLY = et('2026-10-07', '09:45');  // before 10:00 ET → prior-day volume
const cfg = readLiquidityConfig({});
const EXP = '2026-10-16';

const liquid = { symbol: 'AAPL', openInterest: 2_000, volume: 500, prevVolume: 800, bid: 2.00, ask: 2.10, dte: 9 };

async function main() {
  await t('defaults: OI 500 (0DTE/index 1000), vol 100, spread 10%, $0.05 abs under $0.50, mid ≥ $0.10', () => {
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.minOi, 500); assert.equal(cfg.minOiZeroDteIndex, 1000); assert.equal(cfg.minVol, 100);
    assert.equal(cfg.maxSpreadPct, 0.10); assert.equal(cfg.maxSpreadAbsSub50, 0.05); assert.equal(cfg.minMid, 0.10);
  });

  await t('env overrides + OPT_LIQUIDITY_GATE=off', () => {
    const c = readLiquidityConfig({ OPT_MIN_OI: '250', OPT_MIN_VOL: '50', OPT_MAX_SPREAD_PCT: '0.2', OPT_MIN_OI_0DTE: '3000' });
    assert.equal(c.minOi, 250); assert.equal(c.minVol, 50); assert.equal(c.maxSpreadPct, 0.2); assert.equal(c.minOiZeroDteIndex, 3000);
    assert.equal(readLiquidityConfig({ OPT_LIQUIDITY_GATE: 'off' }).enabled, false);
    assert.equal(readLiquidityConfig({ OPT_MIN_OI: 'junk' }).minOi, 500, 'bad value → default');
  });

  await t('a liquid contract passes and the snapshot carries OI/vol/bid/ask/spread/source/asOf', () => {
    const v = checkContractLiquidity(liquid, { nowMs: NOON, cfg, source: 'alpaca_indicative', asOf: '2026-10-07T16:00:00.000Z', contract: 'AAPL 2026-10-16 230C' });
    assert.equal(v.ok, true, v.failures.join());
    const s = v.snapshot;
    assert.equal(s.oi, 2000); assert.equal(s.vol, 500); assert.equal(s.volBasis, 'today');
    assert.equal(s.bid, 2); assert.equal(s.ask, 2.1); assert.equal(s.mid, 2.05);
    assert.ok(Math.abs((s.spreadPct ?? 0) - 0.0488) < 1e-3);
    assert.equal(s.source, 'alpaca_indicative'); assert.equal(s.asOf, '2026-10-07T16:00:00.000Z'); assert.equal(s.contract, 'AAPL 2026-10-16 230C');
  });

  await t('each rule fails on its own', () => {
    const f = (o: Partial<typeof liquid>) => checkContractLiquidity({ ...liquid, ...o }, { nowMs: NOON, cfg }).failures.join(' | ');
    assert.match(f({ openInterest: 499 }), /OI 499 < 500/);
    assert.match(f({ openInterest: null as any }), /open interest unknown/);
    assert.match(f({ volume: 99 }), /volume 99 < 100/);
    assert.match(f({ bid: 0 }), /one-sided/);
    assert.match(f({ ask: 0 }), /one-sided/);
    assert.match(f({ bid: 2.0, ask: 2.5 }), /spread .* > 10%/);
    assert.match(f({ bid: 0.04, ask: 0.06 }), /mid \$0\.050 < \$0\.10/);
  });

  await t('0DTE and index roots need OI ≥ 1000', () => {
    assert.match(checkContractLiquidity({ ...liquid, openInterest: 800, dte: 0 }, { nowMs: NOON, cfg }).failures.join(), /OI 800 < 1000 \(0DTE\/index\)/);
    assert.match(checkContractLiquidity({ ...liquid, symbol: 'SPX', openInterest: 800 }, { nowMs: NOON, cfg }).failures.join(), /< 1000/);
    assert.equal(checkContractLiquidity({ ...liquid, openInterest: 800 }, { nowMs: NOON, cfg }).ok, true, 'non-0DTE equity at 800 OI passes');
  });

  await t('sub-$0.50 contract: $0.05 absolute spread allowed even when > 10%', () => {
    const v = checkContractLiquidity({ ...liquid, bid: 0.30, ask: 0.35 }, { nowMs: NOON, cfg }); // 15.4% but $0.05
    assert.equal(v.ok, true, v.failures.join());
    assert.equal(checkContractLiquidity({ ...liquid, bid: 0.30, ask: 0.36 }, { nowMs: NOON, cfg }).ok, false, '$0.06 fails');
    assert.equal(checkContractLiquidity({ ...liquid, bid: 1.00, ask: 1.15 }, { nowMs: NOON, cfg }).ok, false, '$1+ contract has no abs allowance');
  });

  await t('before 10:00 ET the prior session volume is the basis', () => {
    const v = checkContractLiquidity({ ...liquid, volume: 5, prevVolume: 800 }, { nowMs: EARLY, cfg });
    assert.equal(v.ok, true); assert.equal(v.snapshot.volBasis, 'prior_day'); assert.equal(v.snapshot.vol, 800);
    const thin = checkContractLiquidity({ ...liquid, volume: 900, prevVolume: 20 }, { nowMs: EARLY, cfg });
    assert.match(thin.failures.join(), /prior-day volume 20 < 100/);
    const none = checkContractLiquidity({ ...liquid, volume: 5, prevVolume: null }, { nowMs: EARLY, cfg });
    assert.equal(none.snapshot.volBasis, 'today_prior_unavailable'); assert.equal(none.ok, false);
    assert.equal(checkContractLiquidity({ ...liquid, volume: 5, prevVolume: 800 }, { nowMs: NOON, cfg }).ok, false, 'after 10:00 today counts');
  });

  // chain: 230C chosen is illiquid; 232.5C liquid (Δ .47) nearest; 227C liquid Δ .62; 240C liquid but outside the band
  const row = (strike: number, delta: number, oi: number, vol: number, bid: number, ask: number, type: 'call' | 'put' = 'call'): StrikeRow =>
    ({ type, strike, expiry: EXP, bid, ask, delta, openInterest: oi, volume: vol, prevVolume: vol, dte: 9 });
  const rows: StrikeRow[] = [
    row(225, 0.70, 3000, 400, 7.0, 7.2),
    row(227, 0.62, 2500, 300, 5.4, 5.6),
    row(230, 0.55, 120, 3, 4.0, 4.9),  // chosen — thin + wide
    row(232.5, 0.47, 1800, 250, 3.0, 3.2),
    row(240, 0.20, 5000, 900, 0.9, 0.95),
    row(232.5, -0.5, 9000, 900, 3.0, 3.1, 'put'),
  ];

  await t('pickLiquidStrike: nearest liquid same-type/expiry within the delta band', () => {
    const p = pickLiquidStrike(rows, { type: 'call', strike: 230, expiry: EXP, delta: 0.55, symbol: 'AAPL' }, { nowMs: NOON, cfg });
    assert.ok(p); assert.equal(p!.row.strike, 232.5); assert.equal(p!.row.type, 'call');
    // band excludes the Δ0.20 240C even though it is liquid
    const none = pickLiquidStrike([row(230, 0.55, 10, 0, 4, 5), row(240, 0.20, 5000, 900, 0.9, 0.95)], { type: 'call', strike: 230, expiry: EXP, delta: 0.55, symbol: 'AAPL' }, { nowMs: NOON, cfg });
    assert.equal(none, null);
  });

  const chain: GateChain = { rows, source: 'alpaca_indicative', asOf: '2026-10-07T15:59:30.000Z' };
  const idea = {
    symbol: 'AAPL', assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 230, expiryDate: EXP,
    entryPremium: 4.45, optionDelta: 0.55, analysis: 'Breakout.', qualitySignals: ['x'], convergenceSignalsJson: { lossRules: { v: 1 } },
    entryPrice: 228, targetPrice: 236, stopLoss: 224,
  };

  await t('illiquid chosen strike → stepped to the nearest liquid strike; premium = its mid; snapshot recorded', () => {
    const r = decideIdeaLiquidity(idea, chain, NOON, { cfg, env: {} });
    assert.equal(r.action, 'stepped');
    assert.equal(r.idea.strikePrice, 232.5);
    assert.equal(r.idea.entryPremium, 3.1);
    assert.equal(r.idea.assetType, 'option');
    assert.equal(r.idea.entryPrice, 228, 'underlying levels untouched');
    const s = (r.idea.convergenceSignalsJson as any).contractLiquidity;
    assert.equal(s.ok, true); assert.equal(s.action, 'stepped'); assert.equal(s.steppedFrom, 'AAPL 2026-10-16 230C');
    assert.equal(s.oi, 1800); assert.equal(s.source, 'alpaca_indicative');
    assert.equal((r.idea.convergenceSignalsJson as any).lossRules.v, 1, 'other convergence keys kept');
    assert.match(String(r.idea.analysis), /stepped to the nearest liquid strike/);
  });

  await t('liquid chosen strike → kept with snapshot', () => {
    const r = decideIdeaLiquidity({ ...idea, strikePrice: 227, optionDelta: 0.62 }, chain, NOON, { cfg, env: {} });
    assert.equal(r.action, 'kept'); assert.equal(r.idea.strikePrice, 227);
    assert.equal((r.idea.convergenceSignalsJson as any).contractLiquidity.ok, true);
    assert.equal(r.idea.optionOpenInterest, 2500);
  });

  await t('no liquid strike in the band → underlying-only with "no liquid contract"', () => {
    const thin: GateChain = { ...chain, rows: [row(230, 0.55, 120, 3, 4.0, 4.9), row(240, 0.2, 5000, 900, 0.9, 0.95)] };
    const r = decideIdeaLiquidity(idea, thin, NOON, { cfg, env: {} });
    assert.equal(r.action, 'underlying_only');
    assert.equal(r.idea.assetType, 'stock');
    assert.equal(r.idea.optionType, null); assert.equal(r.idea.strikePrice, null); assert.equal(r.idea.entryPremium, null);
    assert.match(String(r.idea.analysis), /no liquid contract/);
    assert.ok((r.idea.qualitySignals as string[]).includes(NO_LIQUID_CONTRACT_SIGNAL));
    const s = (r.idea.convergenceSignalsJson as any).contractLiquidity;
    assert.equal(s.ok, false); assert.equal(s.action, 'underlying_only'); assert.ok(s.failures.length > 0);
    assert.ok(r.idea.exitBy, 'expiry kept as the exit deadline');
  });

  await t('no chain → underlying-only by default; OPT_LIQUIDITY_UNVERIFIED=allow publishes stamped unverified', () => {
    const r = decideIdeaLiquidity(idea, null, NOON, { cfg, env: {} });
    assert.equal(r.action, 'underlying_only'); assert.equal(r.idea.assetType, 'stock');
    const a = decideIdeaLiquidity(idea, null, NOON, { cfg, env: { OPT_LIQUIDITY_UNVERIFIED: 'allow' } });
    assert.equal(a.action, 'unverified'); assert.equal(a.idea.assetType, 'option');
    assert.equal((a.idea.convergenceSignalsJson as any).contractLiquidity.action, 'unverified');
  });

  await t('stock ideas / gate off are untouched', async () => {
    assert.equal(decideIdeaLiquidity({ ...idea, assetType: 'stock' }, chain, NOON, { cfg, env: {} }).action, 'not_applicable');
    const off = await applyLiquidityGate(idea, { env: { OPT_LIQUIDITY_GATE: 'off' }, nowMs: NOON, loadChain: async () => { throw new Error('must not load'); } });
    assert.equal(off.action, 'not_applicable'); assert.equal(off.idea, idea);
  });

  await t('applyLiquidityGate: loader injected; fresh producer snapshot skips the fetch', async () => {
    let loads = 0;
    const r = await applyLiquidityGate(idea, { nowMs: NOON, env: {}, loadChain: async () => { loads++; return chain; } });
    assert.equal(r.action, 'stepped'); assert.equal(loads, 1);
    const kept = { ...idea, strikePrice: 227, convergenceSignalsJson: { contractLiquidity: { ...checkContractLiquidity({ ...liquid }, { nowMs: NOON, cfg, contract: 'AAPL 2026-10-16 227C', asOf: new Date(NOON - 60_000).toISOString() }).snapshot } } };
    const r2 = await applyLiquidityGate(kept, { nowMs: NOON, env: {}, loadChain: async () => { loads++; return chain; } });
    assert.equal(r2.action, 'kept'); assert.equal(loads, 1, 'no second fetch');
    const throwing = await applyLiquidityGate(idea, { nowMs: NOON, env: {}, loadChain: async () => { throw new Error('boom'); } });
    assert.equal(throwing.action, 'underlying_only', 'a failed load never publishes the contract');
  });

  await t('bot: illiquid contract refused with illiquid_contract; liquid accepted; no chain refused', async () => {
    assert.equal(ILLIQUID_SKIP_CODE, 'illiquid_contract');
    const bad = await botContractLiquidity({ symbol: 'AAPL', optionType: 'call', strike: 230, expiry: EXP }, { nowMs: NOON, env: {}, loadChain: async () => chain });
    assert.equal(bad.ok, false); assert.equal(bad.code, 'illiquid_contract'); assert.match(bad.reason, /OI 120 < 500/);
    const good = await botContractLiquidity({ symbol: 'AAPL', optionType: 'call', strike: 232.5, expiry: EXP }, { nowMs: NOON, env: {}, loadChain: async () => chain });
    assert.equal(good.ok, true);
    const none = await botContractLiquidity({ symbol: 'AAPL', optionType: 'call', strike: 232.5, expiry: EXP }, { nowMs: NOON, env: {}, loadChain: async () => null });
    assert.equal(none.code, 'illiquid_contract');
    const missing = await botContractLiquidity({ symbol: 'AAPL', optionType: 'call', strike: 231, expiry: EXP }, { nowMs: NOON, env: {}, loadChain: async () => chain });
    assert.equal(missing.code, 'illiquid_contract');
  });

  await t('quant-bot wires botContractLiquidity into both sleeves', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../server/quant-bot.ts', import.meta.url), 'utf8');
    assert.equal((src.match(/botContractLiquidity\(/g) ?? []).length, 2);
    assert.match(src, /refuse\('0dte', idea, lq0\.code/);
    assert.match(src, /refuse\('swing', pick, lqS\.code/);
    const st = readFileSync(new URL('../server/storage.ts', import.meta.url), 'utf8');
    assert.match(st, /applyLiquidityGate\(idea/);
  });

  await t('picker: selectFromChain never offers an illiquid contract', () => {
    const exp = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const mk = (strike: number, delta: number, oi: number, vol: number, bid: number, ask: number): RawChainOption =>
      ({ symbol: `X${strike}`, option_type: 'call', strike, expiration_date: exp, bid, ask, volume: vol, prev_day_volume: vol, open_interest: oi, greeks: { delta, gamma: 0.03, theta: -0.05, vega: 0.1, mid_iv: 0.35 } });
    const raw = [mk(95, 0.7, 50, 0, 6.0, 7.5), mk(100, 0.5, 300, 20, 3.0, 3.6), mk(105, 0.3, 80, 5, 1.2, 1.6)];
    const sel = selectFromChain({ symbol: 'XYZ', direction: 'bullish', setup: 'swing', entry: 100, stop: 96, t1: 108, conviction: 90 } as any, 100, raw);
    assert.equal(sel.picks.length, 0, `illiquid chain → no picks (${sel.status})`);
    assert.match(String(sel.note), /no liquid contract/);
    const ok = [mk(100, 0.5, 3000, 600, 3.0, 3.1), mk(105, 0.32, 2500, 400, 1.2, 1.25)];
    const sel2 = selectFromChain({ symbol: 'XYZ', direction: 'bullish', setup: 'swing', entry: 100, stop: 96, t1: 108, conviction: 90 } as any, 100, ok);
    assert.ok(sel2.picks.length > 0, `liquid chain → picks (${sel2.status}: ${sel2.note})`);
    for (const p of sel2.picks) {
      assert.ok(p.openInterest >= 500 && p.liquidity?.ok, `pick ${p.strike} liquid`);
      assert.equal(p.liquidity?.action, 'kept');
    }
  });

  await t('Contract Engine (rankContracts) skips illiquid rows and says so', () => {
    const exp = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const er = (strike: number, oi: number, vol: number, bid: number, ask: number): EngineChainRow =>
      ({ occ: `X${strike}`, type: 'call', strike, expiry: exp, bid, ask, delta: 0.5, gamma: 0.03, theta: -0.05, vega: 0.1, iv: 0.35, openInterest: oi, volume: vol, prevVolume: vol });
    const base = { symbol: 'XYZ', spot: 100, thesis: { direction: 'long' as const, t1: 108, stop: 96, entry: 100, holdingDays: 3 },
      limits: { accountSize: 1e9, maxLossDollars: 1e9, maxDebitDollars: 1e9, dteMin: 5, dteMax: 21 },
      source: { kind: 'alpaca_indicative' as const, label: 'Alpaca', fetchedAt: '', quotesAsOf: null, openInterestDate: null, note: '' }, sourcesTried: ['Alpaca'], liquidity: cfg };
    const r = rankContracts({ ...base, rows: [er(100, 40, 2, 3.0, 3.2)] });
    assert.equal(r.within.length + r.outside.length, 0);
    assert.match(String(r.emptyReason), /liquidity gate/);
    const r2 = rankContracts({ ...base, rows: [er(100, 4000, 900, 3.0, 3.1)] });
    assert.equal(r2.within.length, 1);
  });

  await t('verifier: integrity flag + bug classes from the gate result', () => {
    assert.ok('illiquid_contract' in DESK_BUG_CLASSES && 'liquidity_unverified' in DESK_BUG_CLASSES);
    const base = { assetType: 'option', symbol: 'AAPL', direction: 'long', entryPrice: 228, strikePrice: 230, optionType: 'call', entryPremium: 4.4, exitPremium: null, optionPercentGain: null, exitPrice: null, percentGain: null, outcomeStatus: 'open' };
    assert.ok(deskIntegrityFlags({ ...base, contractLiquidity: { ok: false, failures: ['OI 3 < 500'] } }).some((f) => f.code === 'illiquid_contract' && f.severity === 'fail'));
    assert.ok(!deskIntegrityFlags({ ...base, contractLiquidity: { ok: true, action: 'kept' } }).some((f) => f.code === 'illiquid_contract'));
    assert.ok(!deskIntegrityFlags(base).some((f) => f.code === 'illiquid_contract'), 'pre-gate rows unflagged');
    assert.equal(liquidityGateResult({ assetType: 'option', contractLiquidity: null }), 'unrecorded');
    assert.equal(liquidityGateResult({ assetType: 'option', contractLiquidity: { ok: true, action: 'stepped' } }), 'stepped');
    assert.equal(liquidityGateResult({ assetType: 'stock', contractLiquidity: { ok: false, action: 'underlying_only' } }), 'fail');
    const why = 'no contract bar within 30m of the trigger 2026-10-01T14:00:00Z (O:X)';
    assert.equal(liquidityBugClass({ assetType: 'option', contractLiquidity: null }, 'UNVERIFIABLE', 'bar_unverifiable', why), 'illiquid_contract_suspected');
    assert.equal(liquidityBugClass({ assetType: 'option', contractLiquidity: { ok: true } }, 'UNVERIFIABLE', 'bar_unverifiable', why), 'bar_unverifiable');
    assert.equal(liquidityBugClass({ assetType: 'option', contractLiquidity: null }, 'VERIFIED', null, ''), null);
  });

  console.log(`liquidity gate: ${n} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
