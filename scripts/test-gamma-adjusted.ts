/**
 * Raw vs Δ-adjusted vs flow-signed GEX — formula, sign and level checks.
 * docs/GAMMA_RAW_VS_ADJUSTED.md.
 *
 *   npx tsx scripts/test-gamma-adjusted.ts      (npm run -s test:gamma-adjusted)
 *
 * FIXTURES ONLY. Every chain below is synthetic, written for these tests.
 */
import assert from 'node:assert/strict';
import {
  bsGamma, bsCallDelta, gexPer1Pct, deltaAdjGexPer1Pct, deltaMoveSplit, gammaProfile, type GammaContract,
} from '../shared/gex-math';
import { flowResignWeight, summarizeGammaMetrics, diffLevels, levelsFor } from '../shared/gex-adjusted';
import { computeExposures, type OptionInput } from '../server/options-exposures';

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));

const HOUR = 1 / (365 * 24);

// ─── 1 · per-contract formulas ──────────────────────────────────────────
console.log('per-contract formulas');
ok('long-dated: Δ-adjusted ≈ raw Γ·OI·100·S²·0.01 (60 d, 20% IV, ATM) within 0.5%', () => {
  const S = 500, K = 500, T = 60 / 365, v = 0.2, oi = 1000;
  const raw = gexPer1Pct(bsGamma(S, K, T, v), oi, S);
  const adj = deltaAdjGexPer1Pct(S, K, T, v, oi);
  assert.ok(rel(adj, raw) < 0.005, `adj ${adj} vs raw ${raw}`);
});
ok('h → 0 converges to raw (central difference is second-order accurate)', () => {
  const S = 763.76, K = 770, T = 3 / 365, v = 0.14, oi = 5000;
  const raw = gexPer1Pct(bsGamma(S, K, T, v), oi, S);
  // shrink the move, rescale to per-1%
  const small = deltaAdjGexPer1Pct(S, K, T, v, oi, 0, 0, 1e-4) * (0.01 / 1e-4);
  assert.ok(rel(small, raw) < 1e-4, `small ${small} vs raw ${raw}`);
});
ok('call and put lines carry the same unsigned Δ-adjusted magnitude (put Δ = call Δ − 1)', () => {
  const S = 100, K = 103, T = 10 / 365, v = 0.5;
  const callSpread = bsCallDelta(S * 1.01, K, T, v) - bsCallDelta(S * 0.99, K, T, v);
  const putSpread = (bsCallDelta(S * 1.01, K, T, v) - 1) - (bsCallDelta(S * 0.99, K, T, v) - 1);
  assert.ok(Math.abs(callSpread - putSpread) < 1e-15);
});
ok('0DTE at the money: linear Γ overstates the 1% hedge (Δ can only move 0 → 1)', () => {
  const S = 763.76, K = 764, T = 3 * HOUR, v = 0.12, oi = 50_000;
  const raw = gexPer1Pct(bsGamma(S, K, T, v), oi, S);
  const adj = deltaAdjGexPer1Pct(S, K, T, v, oi);
  assert.ok(adj < raw * 0.6, `adj ${adj} raw ${raw}`);
  // hard bound: |Δ(+1%) − Δ(−1%)|/2 ≤ 0.5
  assert.ok(adj <= 0.5 * oi * 100 * S + 1e-6);
});
ok('0DTE just out of the money: linear Γ understates (delta crosses the strike inside the move)', () => {
  const S = 763.76, K = 768, T = 3 * HOUR, v = 0.12, oi = 50_000;
  const raw = gexPer1Pct(bsGamma(S, K, T, v), oi, S);
  const adj = deltaAdjGexPer1Pct(S, K, T, v, oi);
  assert.ok(adj > raw * 1.5, `adj ${adj} raw ${raw}`);
});
ok('split: (up + down)/2 = central; an OTM call hedges more on the way up', () => {
  const S = 100, K = 104, T = 5 / 365, v = 0.4, oi = 700;
  const { up, down } = deltaMoveSplit(S, K, T, v, oi);
  assert.ok(rel((up + down) / 2, deltaAdjGexPer1Pct(S, K, T, v, oi)) < 1e-12);
  assert.ok(up > down && down > 0);
});
ok('degenerate inputs return 0, never NaN', () => {
  assert.equal(deltaAdjGexPer1Pct(100, 100, 0, 0.3, 10), 0);
  assert.equal(deltaAdjGexPer1Pct(100, 100, 0.1, 0, 10), 0);
  assert.equal(deltaAdjGexPer1Pct(100, 100, 0.1, 0.3, 0), 0);
});

// ─── 2 · zero-gamma under the Δ-adjusted kernel ─────────────────────────
console.log('zero-gamma kernels');
ok('long-dated book: Δ-adjusted zero-γ within 0.5% of raw zero-γ', () => {
  const S = 100;
  const book: GammaContract[] = [
    { strike: 90, T: 45 / 365, iv: 0.3, oi: 4000, isCall: false },
    { strike: 95, T: 45 / 365, iv: 0.27, oi: 3000, isCall: false },
    { strike: 105, T: 45 / 365, iv: 0.22, oi: 3000, isCall: true },
    { strike: 110, T: 45 / 365, iv: 0.2, oi: 4000, isCall: true },
  ];
  const raw = gammaProfile(book, S).zeroGamma!;
  const adj = gammaProfile(book, S, { kernel: 'delta1pct' }).zeroGamma!;
  assert.ok(raw > 95 && raw < 105, `raw ${raw}`);
  assert.ok(Math.abs(adj - raw) / raw < 0.005, `adj ${adj} raw ${raw}`);
});
ok('kernel sign: an all-call book is + under both kernels, an all-put book −', () => {
  const calls: GammaContract[] = [{ strike: 100, T: 0.1, iv: 0.3, oi: 100, isCall: true }];
  const puts: GammaContract[] = calls.map((c) => ({ ...c, isCall: false }));
  for (const kernel of ['gamma', 'delta1pct'] as const) {
    assert.ok(gammaProfile(calls, 100, { kernel }).netAtSpot > 0);
    assert.ok(gammaProfile(puts, 100, { kernel }).netAtSpot < 0);
  }
});

// ─── 3 · flow re-sign weight ────────────────────────────────────────────
console.log('flow-signed re-sign rule');
ok('only near-dated (0.75–21 d) OTM (+2–25%) calls, w = min(1, vol/OI)', () => {
  assert.equal(flowResignWeight(true, 105, 100, 3, 2000, 1000), 1);
  assert.equal(flowResignWeight(true, 105, 100, 3, 500, 1000), 0.5);
  assert.equal(flowResignWeight(false, 95, 100, 3, 5000, 1000), 0, 'puts never');
  assert.equal(flowResignWeight(true, 101, 100, 3, 5000, 1000), 0, 'within 2% of spot');
  assert.equal(flowResignWeight(true, 130, 100, 3, 5000, 1000), 0, 'beyond +25%');
  assert.equal(flowResignWeight(true, 105, 100, 0.2, 5000, 1000), 0, 'same-day');
  assert.equal(flowResignWeight(true, 105, 100, 40, 5000, 1000), 0, 'far-dated');
  assert.equal(flowResignWeight(true, 105, 100, 3, 10, 0), 0, 'no OI');
});

// ─── 4 · the exposures engine ───────────────────────────────────────────
console.log('computeExposures · gammaMetrics');
const opt = (optionType: 'call' | 'put', strike: number, dte: number, oi: number, iv: number, volume = 0): OptionInput =>
  ({ strike, optionType, openInterest: oi, volume, impliedVolatility: iv, daysToExpiry: dte });

// A spot-100 book: 0DTE nodes around spot + a weekly + a monthly.
const chain: OptionInput[] = [
  opt('call', 100, 0.125, 800, 0.15),     // ATM 0DTE (3 h)
  opt('call', 100.5, 0.125, 1000, 0.15),  // +0.5% 0DTE
  opt('put', 99, 0.125, 600, 0.17),
  opt('call', 104, 4, 3000, 0.25, 6000),  // opened today (vol 2× OI) → re-signed under flow
  opt('put', 95, 4, 2500, 0.3),
  opt('call', 110, 30, 5000, 0.22),
  opt('put', 90, 30, 6000, 0.3),
];
const snap = computeExposures('TEST', 100, chain);
const gm = snap.gammaMetrics!;

ok('block present with units and all three metrics', () => {
  assert.ok(gm);
  assert.equal(gm.unit, '$B per 1% move');
  assert.ok(gm.defs.raw && gm.defs.deltaAdjusted && gm.defs.flowSigned);
});
ok('raw block reproduces the headline (net, gross, walls, max-γ, zero-γ)', () => {
  assert.ok(rel(gm.raw.net, snap.totalGEX) < 1e-12);
  assert.ok(rel(gm.raw.gross, snap.grossGEX) < 1e-12);
  assert.equal(gm.raw.levels.callWall, snap.callWall);
  assert.equal(gm.raw.levels.putWall, snap.putWall);
  assert.equal(gm.raw.levels.maxGammaStrike, snap.maxGammaStrike);
  assert.equal(gm.raw.levels.zeroGamma, snap.zeroGammaLevel);
});
ok('Δ-adjusted: strikes and matrix cells sum to the book net (all strikes in band)', () => {
  const byStrike = snap.strikes.reduce((a, s) => a + s.netGEXAdj, 0);
  const byCell = snap.strikeExpiryMatrix.reduce((a, c) => a + (c.netGEXAdj ?? 0), 0);
  assert.ok(rel(byStrike, gm.deltaAdjusted.net) < 1e-9);
  assert.ok(rel(byCell, gm.deltaAdjusted.net) < 1e-9);
  const s104 = snap.strikes.find((s) => s.strike === 104)!;
  assert.ok(s104.callGEXAdj > 0 && s104.putGEXAdj === 0, 'call leg signed +');
  const s95 = snap.strikes.find((s) => s.strike === 95)!;
  assert.ok(s95.putGEXAdj < 0, 'put leg signed −');
});
ok('Δ-adjusted per-cell value matches the per-contract formula (r = 4.5%)', () => {
  const cell = snap.strikeExpiryMatrix.find((c) => c.strike === 110)!;
  const want = deltaAdjGexPer1Pct(100, 110, 30 / 365.25, 0.22, 5000, 0.045) / 1e9;
  assert.ok(rel(cell.netGEXAdj!, want) < 1e-9, `${cell.netGEXAdj} vs ${want}`);
});
ok('moveUp / moveDown average to the Δ-adjusted net', () => {
  assert.ok(rel((gm.deltaAdjusted.moveUp + gm.deltaAdjusted.moveDown) / 2, gm.deltaAdjusted.net) < 1e-9);
});
ok('key-strike ranking changes on the 0DTE pair: raw king 100, Δ-adjusted king 100.5', () => {
  assert.equal(gm.raw.levels.kingNode!.strike, 100);
  assert.equal(gm.deltaAdjusted.levels.kingNode!.strike, 100.5);
  assert.ok(gm.differs.deltaAdjusted.includes('kingNode'));
});
ok('flow-signed: the opened 104 call is re-signed dealer-short (net drops by 2× its raw GEX)', () => {
  const c104 = snap.strikes.find((s) => s.strike === 104)!;
  assert.ok(Math.abs(gm.flowSigned.net - (gm.raw.net - 2 * c104.callGEX)) < 1e-12);
  assert.ok(rel(gm.flowSigned.resignedGross, c104.callGEX) < 1e-12);
  assert.ok(c104.netGEXFlow < 0 && c104.netGEX > 0);
  // walls are magnitude-ranked, so they do not move under a re-sign
  assert.equal(gm.flowSigned.levels.callWall, gm.raw.levels.callWall);
});
ok('flow-signed zero-γ moves up when OTM calls are re-signed short', () => {
  const zr = gm.raw.levels.zeroGamma; const zf = gm.flowSigned.levels.zeroGamma;
  if (zr != null && zf != null) assert.ok(zf >= zr - 1e-6, `flow ${zf} raw ${zr}`);
});
ok('no volume → flow-signed equals raw', () => {
  const quiet = computeExposures('TEST', 100, chain.map((o) => ({ ...o, volume: 0 })));
  assert.ok(Math.abs(quiet.gammaMetrics!.flowSigned.net - quiet.totalGEX) < 1e-15);
  assert.equal(quiet.gammaMetrics!.flowSigned.levels.zeroGamma, quiet.zeroGammaLevel);
  assert.deepEqual(quiet.gammaMetrics!.differs.flowSigned, []);
});

// ─── 5 · summary for Quantinum ──────────────────────────────────────────
console.log('summary (Quantinum context layer)');
ok('summary lists every changed level and the regime under each metric', () => {
  const s = summarizeGammaMetrics(gm, 100);
  assert.equal(s.rows.length, 3);
  assert.deepEqual(s.rows.map((r) => r.metric), ['raw', 'deltaAdjusted', 'flowSigned']);
  assert.ok(s.changes.deltaAdjusted.some((t) => t.startsWith('king node $100 (0d) → $100.5 (0d)')), s.changes.deltaAdjusted.join(' | '));
  assert.ok(s.read.includes('Δ-adj'));
  assert.equal(s.hedgeOnRally1Pct, -gm.deltaAdjusted.moveUp);
  assert.equal(s.hedgeOnDrop1Pct, gm.deltaAdjusted.moveDown);
});
ok('hedge-trade sign: dealers long calls SELL into a rally and BUY into a drop', () => {
  const calls = computeExposures('C', 100, [opt('call', 100, 10, 1000, 0.3)]).gammaMetrics!;
  const s = summarizeGammaMetrics(calls, 100);
  assert.ok(s.hedgeOnRally1Pct < 0 && s.hedgeOnDrop1Pct > 0);
  const puts = computeExposures('P', 100, [opt('put', 100, 10, 1000, 0.3)]).gammaMetrics!;
  const p = summarizeGammaMetrics(puts, 100);
  assert.ok(p.hedgeOnRally1Pct > 0 && p.hedgeOnDrop1Pct < 0, 'dealers short puts chase the move');
});
ok('diffLevels: zero-γ within 0.1% of spot is "same"', () => {
  const base = levelsFor([{ strike: 105, call: 1, put: 0, net: 1 }], [], 100, 99.0);
  assert.deepEqual(diffLevels(base, { ...base, zeroGamma: 99.05 }, 100), []);
  assert.deepEqual(diffLevels(base, { ...base, zeroGamma: 99.5 }, 100), ['zeroGamma']);
  assert.deepEqual(diffLevels(base, { ...base, zeroGamma: null }, 100), ['zeroGamma']);
});

// ─── 6 · cost ───────────────────────────────────────────────────────────
console.log('cost');
ok('an 8,000-contract chain computes in well under 2 s', () => {
  const big: OptionInput[] = [];
  const dtes = [0.2, 1, 2, 3, 4, 7, 14, 21, 30, 45, 60, 90, 120, 180];
  for (const d of dtes) for (let k = 60; k <= 140; k += 0.14) {
    if (big.length >= 8000) break;
    big.push(opt(k >= 100 ? 'call' : 'put', Math.round(k * 10) / 10, d, 500, 0.2 + Math.abs(k - 100) / 400, 100));
  }
  const t0 = performance.now();
  const s = computeExposures('BIG', 100, big);
  const ms = performance.now() - t0;
  console.log(`    ${big.length} contracts: ${ms.toFixed(0)} ms`);
  assert.ok(s.gammaMetrics && ms < 2000);
});

console.log(`\n${passed} checks passed`);
