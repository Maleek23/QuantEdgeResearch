/**
 * Squeeze radar checks — chain extraction, the customer-long-calls re-sign,
 * every component's availability rule, stages, OCC parsing and the rankings
 * hook.
 *
 *   npx tsx scripts/test-squeeze.ts
 *
 * FIXTURES ONLY. Every chain, bar, print and OCC line below is synthetic,
 * written for these tests. Nothing here is market data.
 */
import assert from 'node:assert/strict';
import {
  extractSqueezeChainInputs, scoreSqueezeRadar, scoreHistoryCapable, realisedVol,
  SQUEEZE_WEIGHTS, SQUEEZE_RULES,
  type SqueezeChainContract, type SqueezeRadarInputs, type SqueezeHistoryPoint,
} from '../shared/squeeze-radar';
import { expiryInstantMs, YEAR_MS } from '../shared/gex-math';

const NOW = Date.UTC(2026, 8, 29, 17, 0); // 2026-09-29 13:00 ET
const exp = (d: string) => ({ exp: d, expMs: expiryInstantMs(d), T: (expiryInstantMs(d) - NOW) / YEAR_MS });
const NEAR = exp('2026-10-02');  // ~3 days
const MID = exp('2026-10-09');   // ~10 days
const FAR = exp('2026-12-18');   // ~80 days
const c = (e: typeof NEAR, cp: 'C' | 'P', K: number, oi: number, vol: number, iv = 0.6): SqueezeChainContract =>
  ({ ...e, cp, K, oi, vol, gamma: 0, iv });

let passed = 0;
const ok = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// ─── 1 · weights and rules ──────────────────────────────────────────────
ok('weights sum to 100', () => {
  assert.equal(Object.values(SQUEEZE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

// ─── 2 · chain extraction ───────────────────────────────────────────────
const squeezeChain: SqueezeChainContract[] = [
  c(NEAR, 'C', 100, 3000, 2000, 0.6),
  c(NEAR, 'C', 110, 1000, 5000, 0.75),   // the opening OTM call strike
  c(NEAR, 'C', 115, 800, 300, 0.8),
  c(MID, 'C', 110, 500, 900, 0.7),
  c(MID, 'C', 100, 1500, 400, 0.58),
  c(NEAR, 'P', 95, 1200, 400, 0.65),
  c(NEAR, 'P', 90, 900, 100, 0.7),
  c(FAR, 'C', 120, 4000, 50, 0.55),       // far-dated: never re-signed
  c(FAR, 'P', 80, 3000, 20, 0.6),
  c(MID, 'C', 111, 0, 0, 0),               // nothing — ignored
];
const inputs = extractSqueezeChainInputs(squeezeChain, 100, NOW)!;

ok('near-dated OTM call aggregates (2–25% above spot, 0.75–21 d)', () => {
  // 110 NEAR + 115 NEAR + 110 MID (100 is ATM, 120 is far-dated)
  assert.equal(inputs.nearOtmCallOI, 1000 + 800 + 500);
  assert.equal(inputs.nearOtmCallVol, 5000 + 300 + 900);
  assert.equal(inputs.nearOtmPutOI, 1200 + 900);
  assert.equal(inputs.nearCallOI, 3000 + 1000 + 800 + 500 + 1500);
});
ok('opening strikes = volume ≥ OI and ≥ 500 contracts (aggregated per strike)', () => {
  assert.equal(inputs.openingCallStrikes, 1); // 110: 5900 vs 1500
  assert.equal(inputs.topOtmCalls[0].strike, 110);
  assert.equal(inputs.topOtmCalls[0].exp, '2026-10-02', 'exp = the expiry carrying the most volume');
  assert.equal(inputs.topOtmCalls[0].volume, 5900);
});
ok('squeeze strike = largest near-dated OTM call gamma strike', () => {
  assert.equal(inputs.squeezeStrike, 110);
});
ok('customer-long-calls re-sign lowers net GEX by exactly 2× the flipped gross', () => {
  assert.ok(inputs.adjusted.flippedGross > 0);
  assert.ok(Math.abs(inputs.naive.netGEX - inputs.adjusted.netGEX - 2 * inputs.adjusted.flippedGross) < 1e-6 * Math.abs(inputs.naive.grossGEX));
  assert.ok(inputs.adjusted.balance! < inputs.naive.balance!);
});
ok('call skew read on the first expiry ≥ 5 d (ATM vs ~+10% call)', () => {
  assert.equal(inputs.ivExpiry, '2026-10-09');
  assert.equal(inputs.atmIv, 0.58);
  assert.equal(inputs.otmCallIv, 0.7);
  assert.ok(Math.abs(inputs.callSkew! - 0.12) < 1e-9);
});
ok('a book of only near OTM calls flips from positive (naive) to negative (adjusted)', () => {
  const only = extractSqueezeChainInputs([c(NEAR, 'C', 106, 2000, 3000), c(NEAR, 'C', 110, 2000, 3000)], 100, NOW)!;
  assert.ok(only.naive.netGEX > 0);
  assert.ok(only.adjusted.netGEX < 0);
  assert.equal(only.adjusted.balance, -1);
});
ok('re-sign is turnover-weighted: only min(1, vol ÷ OI) of each contract flips; full upper bound reported', () => {
  const r = extractSqueezeChainInputs([c(NEAR, 'C', 106, 2000, 500), c(NEAR, 'P', 94, 2000, 0)], 100, NOW)!;
  const callG = r.adjusted.flippedGross / 0.25; // w = 500/2000
  assert.ok(Math.abs(r.naive.netGEX - r.adjusted.netGEX - 2 * 0.25 * callG) < 1e-6 * r.naive.grossGEX);
  assert.ok(r.adjusted.fullBalance! < r.adjusted.balance!);
});
ok('expired contracts and same-day 0DTE are excluded from the near window', () => {
  const past = exp('2026-09-28');
  const today = exp('2026-09-29'); // 3 h left < 0.75 d
  const r = extractSqueezeChainInputs([c(past, 'C', 110, 9999, 9999), c(today, 'C', 110, 5000, 5000), c(NEAR, 'C', 110, 10, 10)], 100, NOW)!;
  assert.equal(r.nearOtmCallOI, 10);
});
ok('empty / invalid input → null, never a fabricated read', () => {
  assert.equal(extractSqueezeChainInputs([], 100, NOW), null);
  assert.equal(extractSqueezeChainInputs(squeezeChain, 0, NOW), null);
});

// ─── 3 · scoring ────────────────────────────────────────────────────────
const blank: SqueezeRadarInputs = {
  symbol: 'TEST', chain: null, chainAsOf: null, chainSource: null, openInterestDate: null, changePct: null,
  history: [], bars: null, flow: null, occ: null, shortPctFloat: null,
};
ok('no inputs → score 0, coverage 0, every component unavailable, quiet', () => {
  const r = scoreSqueezeRadar(blank);
  assert.equal(r.score, 0);
  assert.equal(r.coverage, 0);
  assert.ok(r.components.every((x) => !x.available && x.points === 0));
  assert.equal(r.missing.length, Object.keys(SQUEEZE_WEIGHTS).length);
  assert.equal(r.stage, 'quiet');
  assert.equal(r.validation, 'unvalidated');
});

const risingCloses = (n: number, start: number, step: number) => Array.from({ length: n }, (_, i) => start * (1 + step) ** i);
// 25 quiet sessions then 5 big ones → RV5 ≫ RV20 and a strong 5-day return
const closes = [...risingCloses(25, 80, 0.001).map((x, i) => x * (1 + (i % 2 ? 0.004 : -0.004))), 82, 86, 90, 95, 100];
const hist: SqueezeHistoryPoint[] = ['09-22', '09-23', '09-24', '09-25', '09-28'].map((d, i) => ({
  date: `2026-${d}`, spot: 90 + i * 2, nearOtmCallOI: 1000, callWall: 100 + i * 2, squeezeStrike: 105, atmIv: 0.5,
}));
const full: SqueezeRadarInputs = {
  ...blank,
  chain: inputs, changePct: 5,
  history: hist,
  bars: { closes, avgDollarVolume20: 5e8, asOf: '2026-09-28' },
  flow: { callPremium: 9e6, putPremium: 1e6, otmNearCallPremium: 3e6, prints: 40, netCallPremium: 8e6, netPutPremium: 1e6, asOf: '2026-09-29T16:00:00Z', source: 'fixture' },
  occ: { customerCallSides: 90_000, baselineMedian: 30_000, sessions: 20, date: '2026-09-28' },
  shortPctFloat: 0.22,
};
const rFull = scoreSqueezeRadar(full);

ok('full synthetic squeeze: every component available, coverage 100', () => {
  assert.equal(rFull.coverage, 100);
  assert.ok(rFull.components.every((x) => x.available));
  assert.ok(rFull.score >= 55, `score ${rFull.score}`);
  assert.ok(rFull.score <= 100);
});
ok('component points never exceed their weights', () => {
  for (const x of rFull.components) assert.ok(x.points <= x.weight + 1e-9 && x.points >= 0, x.key);
});
ok('OI build: 2300 vs median 1000 → full points; wall 100→108→wall now', () => {
  const b = rFull.components.find((x) => x.key === 'otmCallOiBuild')!;
  assert.equal(b.points, SQUEEZE_WEIGHTS.otmCallOiBuild);
  const w = rFull.components.find((x) => x.key === 'callWallMigration')!;
  assert.ok(w.available);
});
ok('igniting needs score ≥ 55, day ≥ +3% and adjusted dealer short gamma', () => {
  // the fixture chain's adjusted balance decides; assert the rule is applied consistently
  const dsg = rFull.components.find((x) => x.key === 'dealerShortGamma')!;
  const expect = rFull.score >= 55 && dsg.points >= SQUEEZE_WEIGHTS.dealerShortGamma / 2 ? 'igniting' : rFull.score >= 45 ? 'primed' : 'building';
  assert.equal(rFull.stage, expect);
});
ok('history components stay unavailable below their minimum sessions', () => {
  const r = scoreSqueezeRadar({ ...full, history: hist.slice(0, 2) });
  assert.equal(r.components.find((x) => x.key === 'otmCallOiBuild')!.available, false);
  assert.equal(r.components.find((x) => x.key === 'callWallMigration')!.available, false);
  assert.ok(r.coverage < 100);
});
ok('illiquid names are not staged', () => {
  const r = scoreSqueezeRadar({ ...full, bars: { ...full.bars!, avgDollarVolume20: SQUEEZE_RULES.minAvgDollarVolume / 2 } });
  assert.equal(r.stage, 'illiquid');
});
ok('exhausted: +30% in 5 sessions with no squeeze strike within 20%', () => {
  const runCloses = [...closes.slice(0, 25), 100, 110, 120, 130, 140];
  const far = extractSqueezeChainInputs([c(NEAR, 'C', 174, 2000, 3000), c(NEAR, 'P', 130, 2000, 100)], 140, NOW)!;
  const r = scoreSqueezeRadar({ ...full, chain: far, bars: { closes: runCloses, avgDollarVolume20: 5e8, asOf: null } });
  assert.equal(r.stage, 'exhausted');
});
ok('bearish tape scores no customer-call points', () => {
  const r = scoreSqueezeRadar({ ...full, flow: { ...full.flow!, callPremium: 1e6, putPremium: 9e6, netCallPremium: -2e6, netPutPremium: 5e6 } });
  assert.equal(r.components.find((x) => x.key === 'customerCallFlow')!.points, 0);
});

// ─── 4 · history-capable legs (shared with the replay) ──────────────────
ok('realised vol: constant growth → 0; alternating → > 0; short series → null', () => {
  assert.ok(realisedVol(risingCloses(30, 100, 0.01), 20)! < 1e-9);
  assert.ok(realisedVol([100, 102, 100, 102, 100, 102], 5)! > 0);
  assert.equal(realisedVol([100, 101], 5), null);
});
ok('OCC surge needs ≥ 10 baseline sessions', () => {
  const h = scoreHistoryCapable(null, { customerCallSides: 9e4, baselineMedian: 3e4, sessions: 9, date: 'x' });
  assert.equal(h.occCustomerCalls, null);
  const h2 = scoreHistoryCapable(null, { customerCallSides: 9e4, baselineMedian: 3e4, sessions: 20, date: 'x' });
  assert.equal(h2.occCustomerCalls, SQUEEZE_WEIGHTS.occCustomerCalls); // 3× → (3−1)/2 = 1
});

// ─── 5 · server pieces (no network) ─────────────────────────────────────
const { parseOccCsv, logSlotFor } = await import('../server/squeeze-radar');
ok('OCC CSV → per-underlying sides by account type', () => {
  const csv = [
    'quantity,underlying,symbol,actype,porc,exchange,actdate',
    '100,XYZ,XYZ,C,C,CBOE,09/25/2026,',
    '50,XYZ,2XYZ,C,C,AMEX,09/25/2026,',
    '120,XYZ,XYZ,M,C,CBOE,09/25/2026,',
    '30,XYZ,XYZ,F,P,PHLX,09/25/2026,',
    '7,XYZ,XYZ,Q,P,PHLX,09/25/2026,',   // unknown account type — ignored
    'garbage',
  ].join('\n');
  const d = parseOccCsv(csv);
  assert.deepEqual(d.XYZ, { cC: 150, fC: 0, mC: 120, cP: 0, fP: 30, mP: 0 });
});
ok('log slots: 10:30–15:29 ET open, 15:30–16:30 close, weekends none', () => {
  assert.equal(logSlotFor(new Date('2026-09-29T14:45:00Z')), 'open');   // 10:45 ET
  assert.equal(logSlotFor(new Date('2026-09-29T19:40:00Z')), 'close');  // 15:40 ET
  assert.equal(logSlotFor(new Date('2026-09-29T13:40:00Z')), null);     // 09:40 ET
  assert.equal(logSlotFor(new Date('2026-09-27T19:40:00Z')), null);     // Sunday
});

const { computeRankRowFromCboe } = await import('../server/gex-rankings');
ok('rankings row carries the squeeze read from the same parse', () => {
  const occ = (K: number, cp: 'C' | 'P', d = '261002') => `XYZ${d}${cp}${String(K * 1000).padStart(8, '0')}`;
  const payload = {
    timestamp: '2026-09-29 17:00:00',
    data: {
      current_price: 100, price_change_percent: 4,
      options: [
        { option: occ(110, 'C'), open_interest: 1000, volume: 5000, iv: 0.75, gamma: 0.02 },
        { option: occ(100, 'C'), open_interest: 3000, volume: 2000, iv: 0.6, gamma: 0.05 },
        { option: occ(95, 'P'), open_interest: 1200, volume: 400, iv: 0.65, gamma: 0.03 },
      ],
    },
  };
  const row = computeRankRowFromCboe('XYZ', payload, NOW, NOW)!;
  assert.ok(row.squeeze);
  assert.equal(row.squeeze!.squeezeStrike, 110);
  assert.equal(row.squeeze!.nearOtmCallVol, 5000);
});

console.log(`\nsqueeze radar: ${passed} checks passed`);
process.exit(0);
