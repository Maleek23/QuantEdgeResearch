/**
 * Monthly Swings & LEAPS (shared/swings-screener.ts + server/swings-screener.ts).
 *   npm run test:swings-screener
 *
 * ALL DATA HERE IS SYNTHETIC FIXTURE DATA (generated bars, made-up fundamentals
 * and a Black-Scholes chain at a flat IV) — it tests the rules, not a market
 * read. No network, no DB: the server run is driven through injected deps.
 */
import assert from 'node:assert/strict';
import {
  DRAWDOWN_MAX, DRAWDOWN_MIN, LEAPS_DTE, SWING_DTE, drawdownOf, filterRows, inDrawdownBand, pickLeapsContract, pickSwingContract,
  rankRows, scoreFactors, screenSymbol, swingsScreenerEnabled, type Bar, type FundamentalsInput, type ScreenInput,
} from '../shared/swings-screener';
import { bsDelta, bsPrice } from '../shared/iv-fill';
import { readLiquidityConfig } from '../shared/option-liquidity';
import type { BudgetChainRow } from '../shared/budget-contract';
import { runSwingsScreener, type SwingsDeps } from '../server/swings-screener';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; console.log(`  ok  ${name}`); } catch (e) { console.error('FAIL', name); throw e; } };

const NOW = Date.parse('2026-10-07T22:40:00Z'); // 18:40 ET, after the close
const DAY = 86_400_000;

/** Synthetic daily bars: falls from `from` to `low` over `fallDays`, then drifts to `end`. */
function bars(from: number, low: number, end: number, fallDays = 400, baseDays = 300): Bar[] {
  const out: Bar[] = [];
  const total = fallDays + baseDays;
  for (let i = 0; i < total; i++) {
    const c = i < fallDays ? from + (low - from) * (i / (fallDays - 1)) : low + (end - low) * ((i - fallDays) / (baseDays - 1));
    const wig = 1 + 0.004 * Math.sin(i / 3);
    out.push({ t: NOW - (total - 1 - i) * DAY, o: c, h: c * 1.01 * wig, l: c * 0.99 / wig, c, v: 1e6 });
  }
  return out;
}
const fund = (o: Partial<FundamentalsInput> = {}): FundamentalsInput => ({
  quarters: Array.from({ length: 8 }, (_, i) => ({ date: `2024-${String(i + 1).padStart(2, '0')}-28`, revenue: 1000 + i * 60, grossProfit: (1000 + i * 60) * (0.5 + i * 0.005), dilutedEps: 0.5 + i * 0.05, dilutedShares: 100 - i * 0.5 })),
  cash: 900, totalDebt: 500, asOf: '2026-06-30', source: 'fixture', ...o,
});

function chain(spot: number, iv = 0.5): BudgetChainRow[] {
  const rows: BudgetChainRow[] = [];
  for (const dte of [35, 49, 300, 420, 700]) {
    const expiry = new Date(NOW + dte * DAY).toISOString().slice(0, 10);
    for (let k = Math.round(spot * 0.5); k <= spot * 1.6; k += Math.max(1, Math.round(spot / 40))) {
      const T = dte / 365;
      const p = bsPrice(spot, k, T, iv, true);
      const d = bsDelta(spot, k, T, iv, true);
      if (!(p > 0.05)) continue;
      rows.push({ type: 'call', strike: k, expiry, bid: +(p * 0.98).toFixed(2), ask: +(p * 1.02).toFixed(2), delta: d, iv, gamma: null, openInterest: 2000, volume: 300, dte });
    }
  }
  return rows;
}
const cfg = readLiquidityConfig({});

async function main() {
  console.log('swings-screener (synthetic fixtures)');

  await t('flag default on; off|0|false disables', () => {
    assert.equal(swingsScreenerEnabled({}), true);
    for (const v of ['off', '0', 'false', 'no']) assert.equal(swingsScreenerEnabled({ SWINGS_SCREENER: v }), false);
  });

  await t('drawdown: monthly ATH beats the 3y daily high; band 40–85 inclusive', () => {
    const d = bars(100, 30, 40);
    const a = drawdownOf(40, d, { high: 200 })!;
    assert.equal(a.basis, 'ATH (monthly)'); assert.equal(a.ath, 200); assert.equal(a.drawdownPct, 80);
    const b = drawdownOf(40, d, null)!;
    assert.equal(b.basis, '3y high'); assert.ok(b.drawdownPct > 55 && b.drawdownPct < 62);
    assert.ok(inDrawdownBand(40) && inDrawdownBand(85) && !inDrawdownBand(39.9) && !inDrawdownBand(85.1));
    assert.equal(DRAWDOWN_MIN, 40); assert.equal(DRAWDOWN_MAX, 85);
  });

  const base = (o: Partial<ScreenInput> = {}): ScreenInput => ({
    symbol: 'QUAL', daily: bars(100, 40, 52), athMonthly: { high: 120, atMs: NOW - 900 * DAY }, spyDaily: bars(400, 380, 420), sectorDaily: bars(50, 40, 44),
    sectorEtf: 'XLK', fundamentals: fund(), nextEarnings: { date: new Date(NOW + 40 * DAY).toISOString(), source: 'fixture' },
    rotation: { groupId: 'g', label: 'Semis', etf: 'SMH', quadrant: 'improving', stage: 'stirring', side: 'long', asOf: '2026-10-06T20:00:00Z' },
    flow: { callPremium: 7e6, putPremium: 3e6, prints: 12, days: 10, asOf: '2026-10-07T19:00:00Z', source: 'fixture' },
    gex: { regime: 'positive_gamma', spot: 52, flip: 50, callWall: 60, putWall: 50, asOf: '2026-10-07T19:08:00Z', source: 'fixture' },
    nowMs: NOW, ...o,
  });

  await t('quality basing name scores high; every factor scored; letter uses NEXUS cut-offs', () => {
    const r = screenSymbol(base())!;
    assert.ok(r, 'in band');
    assert.equal(r.drawdownPct, 56.7);
    assert.equal(r.coverage, 1);
    assert.ok(r.factors.every((f) => f.points != null), 'no n/a with full data');
    assert.ok(r.score >= 80, `score ${r.score}`);
    assert.ok(['A', 'B'].includes(r.letter));
    assert.equal(r.factors.find((f) => f.key === 'basing')!.points, 9, 'no lower low in 3 months');
    assert.equal(r.daysToEarnings, 40);
  });

  await t('missing data → n/a (excluded), never 0; coverage + thinData say so', () => {
    const r = screenSymbol(base({ fundamentals: null, flow: null, gex: null, rotation: null, nextEarnings: null, sectorDaily: null }))!;
    const na = r.factors.filter((f) => f.points == null).map((f) => f.key).sort();
    assert.deepEqual(na, ['cash', 'dilution', 'earnings', 'eps', 'flow', 'gex', 'gm', 'revenue', 'rotation', 'rs_sector'].sort());
    assert.ok(r.factors.filter((f) => f.points == null).every((f) => f.value === 'n/a'));
    assert.equal(r.coverage, 0.3);
    assert.equal(r.thinData, true);
    const avail = r.groups.reduce((s, g) => s + g.available, 0);
    assert.equal(avail, 30);
    // n/a must not drag the score: same structure, same score proportion
    const s = scoreFactors(r.factors);
    assert.equal(s.score, r.score);
    assert.ok(r.score > 50, 'structure-only score is not diluted by n/a');
  });

  await t('falling knife (lower low this month, below 50/200d, on the low) scores low', () => {
    const r = screenSymbol(base({ daily: bars(100, 30, 30, 650, 50).map((b, i, a) => (i === a.length - 1 ? { ...b, l: b.l * 0.95 } : b)), fundamentals: fund({ cash: 50, totalDebt: 900, quarters: fund().quarters.map((q, i) => ({ ...q, revenue: 1500 - i * 80, dilutedEps: 0.4 - i * 0.1, dilutedShares: 100 + i * 4 })) }), flow: { callPremium: 1e6, putPremium: 9e6, prints: 20, days: 10, asOf: null, source: 'fixture' }, gex: { regime: 'negative_gamma', spot: 30, flip: 40, callWall: 45, putWall: 25, asOf: null, source: 'fixture' } }))!;
    assert.equal(r.factors.find((f) => f.key === 'basing')!.points, 0);
    assert.equal(r.factors.find((f) => f.key === 'dilution')!.points, 0);
    assert.ok(r.score < 45, `score ${r.score}`);
    assert.equal(r.letter, 'F');
  });

  await t('outside the band → null (unless the caller widens it)', () => {
    assert.equal(screenSymbol(base({ daily: bars(58, 40, 52), athMonthly: { high: 60, atMs: 0 } })), null, '13% off');
    assert.ok(screenSymbol(base({ daily: bars(58, 40, 52), athMonthly: { high: 60, atMs: 0 } }), { band: [0, 100] }));
  });

  await t('monthly swing: 30–60 DTE, Δ0.30–0.55, liquid, whole contracts within $1,000', () => {
    const s = pickSwingContract({ symbol: 'QUAL', spot: 52, ath: 120, rows: chain(52), nowMs: NOW, source: 'fixture', asOf: '2026-10-07T20:00:00Z', liqCfg: cfg });
    assert.equal(s.status, 'ok');
    const p = s.pick!;
    assert.ok(p.dte >= SWING_DTE[0] && p.dte <= SWING_DTE[1]);
    assert.ok(p.delta >= 0.30 && p.delta <= 0.55, `delta ${p.delta}`);
    assert.ok(p.debitOne <= 1000);
    assert.ok(p.qtyAt['1000'] >= 1 && Number.isInteger(p.qtyAt['500']) && Number.isInteger(p.qtyAt['1000']));
    assert.equal(p.holding, 'swing');
    assert.equal(p.breakeven, +(p.strike + p.mid).toFixed(2));
    assert.ok(p.scenario && p.scenario.pnlOne > 0);
  });

  await t('LEAPS in budget: Δ0.60–0.80, 270–760 DTE, payoff at halfway-to-ATH', () => {
    const s = pickLeapsContract({ symbol: 'QUAL', spot: 22, ath: 60, rows: chain(22), nowMs: NOW, source: 'fixture', asOf: 'x', liqCfg: cfg });
    assert.equal(s.status, 'ok');
    const p = s.pick!;
    assert.ok(p.dte >= LEAPS_DTE[0] && p.dte <= LEAPS_DTE[1]);
    assert.ok(p.delta >= 0.6 && p.delta <= 0.8);
    assert.ok(p.debitOne <= 1000);
    assert.equal(p.holding, 'position');
    assert.equal(p.scenario!.level, 41);
    assert.equal(p.expiryPnlOne, +((Math.max(0, 41 - p.strike) - p.mid) * 100).toFixed(2));
  });

  await t('LEAPS over $1,000 → says so, then the cheapest-fit liquid strike (or "over budget")', () => {
    const s = pickLeapsContract({ symbol: 'BIG', spot: 150, ath: 400, rows: chain(150), nowMs: NOW, source: 'fixture', asOf: 'x', liqCfg: cfg });
    assert.ok(s.overBudget && s.overBudget.debitOne > 1000, 'in-band contract over budget');
    assert.match(s.reason, /over the \$1000 budget/);
    assert.equal(s.status, 'fit_fallback');
    assert.ok(s.pick!.debitOne <= 1000 && s.pick!.delta >= 0.2 && s.pick!.delta < 0.6);
    const s2 = pickLeapsContract({ symbol: 'HUGE', spot: 900, ath: 2000, rows: chain(900, 0.3).map((r) => ({ ...r, bid: Math.max(r.bid!, 20), ask: Math.max(r.ask!, 20.4) })), nowMs: NOW, source: 'fixture', asOf: 'x', liqCfg: cfg });
    assert.equal(s2.status, 'over_budget');
    assert.equal(s2.pick, null);
  });

  await t('liquidity gate: illiquid rows are never picked', () => {
    const rows = chain(52).map((r) => ({ ...r, openInterest: 10, volume: 1 }));
    const s = pickSwingContract({ symbol: 'QUAL', spot: 52, ath: 120, rows, nowMs: NOW, source: 'fixture', asOf: 'x', liqCfg: cfg });
    assert.equal(s.status, 'no_liquid'); assert.equal(s.pick, null);
    const l = pickLeapsContract({ symbol: 'QUAL', spot: 52, ath: 120, rows, nowMs: NOW, source: 'fixture', asOf: 'x', liqCfg: cfg });
    assert.equal(l.status, 'no_liquid');
    assert.equal(pickSwingContract({ symbol: 'Q', spot: 52, ath: 120, rows: [], nowMs: NOW, source: 'f', asOf: 'x' }).status, 'no_chain');
  });

  await t('filters + rank', () => {
    const rows = [
      { symbol: 'A', drawdownPct: 50, sector: 'Tech', score: 70, coverage: 1, daysToEarnings: 40 },
      { symbol: 'B', drawdownPct: 80, sector: 'Health', score: 90, coverage: 0.5, daysToEarnings: 10 },
      { symbol: 'C', drawdownPct: 45, sector: 'Tech', score: 90, coverage: 0.9, daysToEarnings: null },
    ];
    assert.deepEqual(rankRows(rows).map((r) => r.symbol), ['C', 'B', 'A']);
    assert.deepEqual(filterRows(rows, { sector: 'Tech' }).map((r) => r.symbol), ['A', 'C']);
    assert.deepEqual(filterRows(rows, { ddMax: 60, minScore: 75 }).map((r) => r.symbol), ['C']);
    assert.deepEqual(filterRows(rows, { earningsWithin: 30 }).map((r) => r.symbol), ['B']);
  });

  await t('server run (injected deps): universe → monthly pass-1 → screen → contracts, ETFs dropped', async () => {
    const monthlyBy: Record<string, { athHigh: number; lastClose: number; instrumentType: string }> = {
      QUAL: { athHigh: 120, lastClose: 52, instrumentType: 'EQUITY' },
      NEAR: { athHigh: 60, lastClose: 52, instrumentType: 'EQUITY' }, // 13% off — dropped at pass 1
      ETFX: { athHigh: 120, lastClose: 52, instrumentType: 'ETF' },   // not an equity
    };
    const deps: SwingsDeps = {
      universe: async () => ({ symbols: Object.keys(monthlyBy), sources: ['fixture'] }),
      monthly: async (s) => (monthlyBy[s] ? { ...monthlyBy[s], athAtMs: 0, name: `${s} Inc` } : null),
      daily: async (s) => (s === 'SPY' ? bars(400, 380, 420) : bars(100, 40, 52)),
      fundamentals: async () => ({ ...fund(), sector: 'Technology', name: 'Quality Inc' }),
      earnings: async () => ({ date: new Date(NOW + 40 * DAY).toISOString(), source: 'fixture' }),
      rotation: async () => null,
      flow: async () => null,
      gex: async () => null,
      news: async () => ({ items: [{ title: 'Fixture headline', publisher: 'fixture', at: null, link: null }], asOf: new Date(NOW).toISOString() }),
      chain: async (_s, lo, hi) => ({ rows: chain(52).filter((r) => r.dte >= lo && r.dte <= hi), source: 'fixture', asOf: new Date(NOW).toISOString() }),
      nowMs: () => NOW,
    };
    const snap = await runSwingsScreener('test', deps, { concurrency: 2 });
    assert.equal(snap.universe.total, 3);
    assert.equal(snap.universe.equities, 2);
    assert.equal(snap.universe.pass1, 1);
    assert.deepEqual(snap.rows.map((r) => r.symbol), ['QUAL']);
    const r = snap.rows[0];
    assert.equal(r.sector, 'Technology');
    assert.equal(r.swing!.status, 'ok');
    assert.ok(r.leaps!.pick);
    assert.equal(r.news.length, 1);
    assert.equal(r.factors.find((f) => f.key === 'flow')!.value, 'n/a');
  });

  console.log(`\n${n} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
