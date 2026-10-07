/**
 * Unit tests for loss rules v1 (shared/loss-rules.ts): confluence definition,
 * entry window + next-session trigger, target cap + time stop, DTE fit.
 *   npm run test:loss-rules
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_LOSS_RULES_CONFIG, readLossRulesConfig, assessConfluence, evidenceFamilyOf, aggregateFlowRead,
  checkEntryWindow, etWallToMs, capTargetToExpectedMove, realizedVolDaily, expectedMove, horizonTradingDays,
  planTimeStop, evaluateTimeStop, addTradingMinutes, etParts, dteFitWindow, isDteFit, holdDaysForSetup,
} from '../shared/loss-rules';
import { buildLossRulesReport, groupStats, type ReportTrade } from '../shared/loss-rules-report';
import { dteFitFor, selectFromChain, type RawChainOption } from '../server/option-selection-engine';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; };

// ── config / flags ────────────────────────────────────────────────────────
t('defaults on', () => {
  const c = readLossRulesConfig({});
  assert.equal(c.botConfluence && c.botEntryWindow && c.targetCap && c.timeStop && c.dteFit, true);
  assert.equal(c.entryWindowStartEt, 570); assert.equal(c.entryWindowEndEt, 690);
});
t('master switch and per-rule flags', () => {
  const off = readLossRulesConfig({ LOSS_RULES: 'off' });
  assert.equal(off.botConfluence || off.botEntryWindow || off.targetCap || off.timeStop || off.dteFit, false);
  const one = readLossRulesConfig({ LOSS_RULE_DTE_FIT: 'false', LOSS_RULE_ENTRY_WINDOW: '09:45-11:00' });
  assert.equal(one.dteFit, false); assert.equal(one.botConfluence, true);
  assert.equal(one.entryWindowStartEt, 585); assert.equal(one.entryWindowEndEt, 660);
  assert.equal(readLossRulesConfig({ LOSS_RULE_ENTRY_WINDOW: 'garbage' }).entryWindowStartEt, 570);
});

// ── rule 1: confluence ────────────────────────────────────────────────────
t('families', () => {
  assert.equal(evidenceFamilyOf('flow'), 'flow');
  assert.equal(evidenceFamilyOf('options_flow'), 'flow');
  assert.equal(evidenceFamilyOf('whale_flow'), 'flow');
  assert.equal(evidenceFamilyOf('gex_scanner'), 'gex');
  assert.equal(evidenceFamilyOf('gex_magnet'), 'gex');
  assert.equal(evidenceFamilyOf('quant_signal'), 'quant');
  assert.equal(evidenceFamilyOf('market_scanner'), 'market_scanner');
});
t('single source alone fails', () => {
  for (const src of ['market_scanner', 'gex_scanner', 'flow', 'quant']) {
    const r = assessConfluence({ primarySource: src, direction: 'long' });
    assert.equal(r.passed, false, src);
    assert.match(r.reason, /single-source/);
  }
});
t('same-source duplicates do not count', () => {
  const r = assessConfluence({ primarySource: 'market_scanner', direction: 'long', peerIdeas: [{ source: 'market_scanner', direction: 'long' }, { source: 'market_scanner', direction: 'long' }] });
  assert.equal(r.passed, false);
  // gex_scanner primary + supportive GEX layer = same family (gex)
  const g = assessConfluence({ primarySource: 'gex_scanner', direction: 'long', layers: [{ kind: 'gex', points: 5, why: 'Vol expansion in your direction' }] });
  assert.equal(g.passed, false);
  // flow primary + flow tape = same family
  const f = assessConfluence({ primarySource: 'flow', direction: 'short', flow: { dominantPremium: 2e6, dominantSide: 'short', skew: 4 } });
  assert.equal(f.passed, false);
});
t('quant + second scanner same side passes; opposite side does not', () => {
  assert.equal(assessConfluence({ primarySource: 'quant', direction: 'long', peerIdeas: [{ source: 'market_scanner', direction: 'long' }] }).passed, true);
  assert.equal(assessConfluence({ primarySource: 'quant', direction: 'long', peerIdeas: [{ source: 'market_scanner', direction: 'short' }] }).passed, false);
});
t('quant + supportive GEX passes; weak/negative GEX does not', () => {
  assert.equal(assessConfluence({ primarySource: 'quant', direction: 'long', layers: [{ kind: 'gex', points: 3 }] }).passed, true);
  assert.equal(assessConfluence({ primarySource: 'quant', direction: 'long', layers: [{ kind: 'gex', points: 2 }] }).passed, false);
  assert.equal(assessConfluence({ primarySource: 'quant', direction: 'long', layers: [{ kind: 'gex', points: -5 }] }).passed, false);
});
t('quant + flow tape passes only above the premium/skew bar, on the right side, uncontradicted', () => {
  const base = { primarySource: 'quant', direction: 'long' as const };
  assert.equal(assessConfluence({ ...base, flow: { dominantPremium: 300_000, dominantSide: 'long', skew: 2 } }).passed, true);
  assert.equal(assessConfluence({ ...base, flow: { dominantPremium: 100_000, dominantSide: 'long', skew: 2 } }).passed, false);
  assert.equal(assessConfluence({ ...base, flow: { dominantPremium: 300_000, dominantSide: 'long', skew: 1.2 } }).passed, false);
  assert.equal(assessConfluence({ ...base, flow: { dominantPremium: 300_000, dominantSide: 'short', skew: 3 } }).passed, false);
  assert.equal(assessConfluence({ ...base, flow: { dominantPremium: 300_000, dominantSide: 'long', skew: 3, tapeContradicts: true } }).passed, false);
});
t('context layers are not evidence', () => {
  const r = assessConfluence({ primarySource: 'quant', direction: 'long', layers: [
    { kind: 'regime', points: 5 }, { kind: 'sector', points: 8, why: '3 of 4 peers up — confirms' }, { kind: 'premarket', points: 4 },
    { kind: 'structure', points: 4, why: 'Inside the benchmark complex', label: 'Benchmark Name' }, { kind: 'technical', points: 12 },
  ] });
  assert.equal(r.passed, false);
  const tape = assessConfluence({ primarySource: 'quant', direction: 'long', layers: [{ kind: 'structure', points: 9, why: 'Aggressor tape: $4.1M net bought' }] });
  assert.equal(tape.passed, true);
  assert.deepEqual(tape.families, ['quant', 'flow']);
});
t('convergence: own chart is not a second source; options flow is', () => {
  assert.equal(assessConfluence({ primarySource: 'market_scanner', direction: 'long', convergenceSources: [{ source: 'daily_ohlcv', direction: 'bullish' }] }).passed, false);
  assert.equal(assessConfluence({ primarySource: 'market_scanner', direction: 'long', convergenceSources: [{ source: 'options_flow', direction: 'bullish' }] }).passed, true);
  assert.equal(assessConfluence({ primarySource: 'market_scanner', direction: 'long', convergenceSources: [{ source: 'options_flow', direction: 'bearish' }] }).passed, false);
});
t('flow aggregation restores ×100 and reads skew', () => {
  const r = aggregateFlowRead([{ optionType: 'call', premium: 3000 }, { optionType: 'call', premium: 1000 }, { optionType: 'put', premium: 1000 }])!;
  assert.equal(r.dominantSide, 'long'); assert.equal(r.dominantPremium, 400_000); assert.equal(r.skew, 4);
  assert.equal(aggregateFlowRead([]), null);
});

// ── rule 2: entry window ──────────────────────────────────────────────────
// 2026-09-29 is a Tuesday (EDT, UTC−4).
const at = (h: number, m: number, day = 29) => etWallToMs(2026, 9, day, h * 60 + m);
t('ET clock round-trips across DST', () => {
  assert.equal(new Date(at(9, 30)).toISOString(), '2026-09-29T13:30:00.000Z');
  assert.equal(new Date(etWallToMs(2026, 12, 1, 570)).toISOString(), '2026-12-01T14:30:00.000Z');
  assert.equal(etParts(at(9, 30)).minutes, 570);
});
t('window boundaries', () => {
  const pub = at(9, 40);
  const mk = (h: number, m: number) => checkEntryWindow({ nowMs: at(h, m), publishedAt: pub, direction: 'long', entry: 100, live: 101 });
  assert.equal(mk(9, 45).ok, true);
  assert.equal(mk(11, 29).ok, true);
  assert.equal(mk(11, 30).code, 'outside_window');
  assert.equal(mk(12, 0).code, 'outside_window');
  assert.equal(checkEntryWindow({ nowMs: at(9, 20), publishedAt: at(9, 0), direction: 'long', entry: 100, live: 101 }).code, 'outside_window');
  // Saturday
  assert.equal(checkEntryWindow({ nowMs: etWallToMs(2026, 10, 3, 600), publishedAt: pub, direction: 'long', entry: 100, live: 101 }).code, 'outside_window');
});
t('evening publish needs a next-session trigger — never the stale close', () => {
  const pub = etWallToMs(2026, 9, 28, 19 * 60); // Monday 19:00 ET
  const open = at(9, 30) / 1000;
  const bar = (min: number, low: number, high: number) => ({ time: open + min * 60, low, high });
  const base = { nowMs: at(10, 0), publishedAt: pub, direction: 'long' as const, entry: 100 };
  // No bars → cannot prove the trigger.
  assert.equal(checkEntryWindow({ ...base, live: 101 }).code, 'no_session_bars');
  // Gapped above entry and never traded at it → not triggered.
  assert.equal(checkEntryWindow({ ...base, live: 103, bars: [bar(0, 102, 104), bar(5, 102.5, 103.5)] }).code, 'stale_close_untriggered');
  // Pre-market print at the entry does not count (bar before 09:30).
  assert.equal(checkEntryWindow({ ...base, live: 101, bars: [{ time: open - 600, low: 99, high: 101 }, bar(0, 100.5, 102)] }).code, 'stale_close_untriggered');
  // Traded through after 09:30 and live on the triggered side → ok.
  assert.equal(checkEntryWindow({ ...base, live: 101, bars: [bar(0, 98, 99.5), bar(5, 99.4, 100.6)] }).ok, true);
  // Traded through but live back below → not triggered.
  assert.equal(checkEntryWindow({ ...base, live: 99.8, bars: [bar(5, 99.4, 100.6)] }).code, 'stale_close_untriggered');
  // Short side mirrors.
  assert.equal(checkEntryWindow({ ...base, direction: 'short', live: 99, bars: [bar(5, 99, 100.2)] }).ok, true);
});
t('published earlier in RTH on a prior day also needs the trigger', () => {
  const r = checkEntryWindow({ nowMs: at(10, 0), publishedAt: etWallToMs(2026, 9, 28, 14 * 60), direction: 'long', entry: 100, live: 101 });
  assert.equal(r.code, 'no_session_bars');
  assert.equal(r.publishedOutsideRth, false);
});

// ── rule 3: target cap + time stop ────────────────────────────────────────
t('realized vol and expected move', () => {
  const closes = Array.from({ length: 21 }, (_, i) => 100 * Math.exp((i % 2 ? 0.01 : -0.01) * 1));
  const s = realizedVolDaily(closes, 20)!;
  assert(s > 0.019 && s < 0.021, `sigma ${s}`);
  assert.equal(realizedVolDaily([1, 2, 3], 20), null);
  assert(Math.abs(expectedMove(100, 0.02, 4) - 4) < 1e-9); // 100 × 2% × √4
});
t('horizon days', () => {
  assert.equal(horizonTradingDays({ holdingPeriod: 'day' }), 1);
  assert.equal(horizonTradingDays({ holdingPeriod: 'swing' }), 5);
  assert.equal(horizonTradingDays({ holdingPeriod: 'position' }), 10);
  // option expiring in 3 calendar days caps a swing horizon
  assert.equal(horizonTradingDays({ holdingPeriod: 'swing', expiryDate: '2026-10-02', publishedMs: at(10, 0) }), 2);
});
t('target cap: far T1 capped to 1× EM, near T1 untouched, short mirrored, T2 kept', () => {
  const far = capTargetToExpectedMove({ direction: 'long', entry: 100, target: 115, stop: 96, sigmaDaily: 0.02, horizonDays: 4 });
  assert.equal(far.capped, true); assert.equal(far.target, 104); assert.equal(far.originalTarget, 115);
  assert.equal(far.riskReward, 1);
  const near = capTargetToExpectedMove({ direction: 'long', entry: 100, target: 103, stop: 96, sigmaDaily: 0.02, horizonDays: 4 });
  assert.equal(near.capped, false); assert.equal(near.target, 103);
  const short = capTargetToExpectedMove({ direction: 'short', entry: 50, target: 40, stop: 52, sigmaDaily: 0.03, horizonDays: 1 });
  assert.equal(short.target, 48.5);
  const noVol = capTargetToExpectedMove({ direction: 'long', entry: 100, target: 130, stop: 95, sigmaDaily: null, horizonDays: 5 });
  assert.equal(noVol.capped, false); assert.equal(noVol.target, 130);
});
t('trading-minute clock skips nights and weekends', () => {
  // Friday 15:00 ET + 90 trading minutes → Monday 10:00 ET
  const fri = etWallToMs(2026, 10, 2, 15 * 60);
  const p = etParts(addTradingMinutes(fri, 90));
  assert.equal(p.dateKey, '2026-10-05'); assert.equal(p.minutes, 600);
  // Evening publish anchors at next open.
  const eve = etParts(addTradingMinutes(etWallToMs(2026, 9, 28, 19 * 60), 0));
  assert.equal(eve.dateKey, '2026-09-29'); assert.equal(eve.minutes, 570);
});
t('time stop plan at 50% of horizon, exits only below minR', () => {
  const plan = planTimeStop(at(10, 0), 5, 0.5, 0.5); // 2.5 sessions → Thu 13:15 ET
  const p = etParts(Date.parse(plan.atIso));
  assert.equal(p.dateKey, '2026-10-01'); assert.equal(p.minutes, 13 * 60 + 15);
  const day = etParts(Date.parse(planTimeStop(at(10, 0), 1, 0.5, 0.5).atIso));
  assert.equal(day.minutes, 13 * 60 + 15); assert.equal(day.dateKey, '2026-09-29');
  const before = evaluateTimeStop({ direction: 'long', entry: 100, stop: 96, price: 99, nowMs: Date.parse(plan.atIso) - 1, atIso: plan.atIso, minR: 0.5 });
  assert.equal(before.exit, false);
  const lagging = evaluateTimeStop({ direction: 'long', entry: 100, stop: 96, price: 101, nowMs: Date.parse(plan.atIso), atIso: plan.atIso, minR: 0.5 });
  assert.equal(lagging.exit, true); assert.equal(lagging.progressR, 0.25);
  const working = evaluateTimeStop({ direction: 'short', entry: 100, stop: 104, price: 97, nowMs: Date.parse(plan.atIso) + 1, atIso: plan.atIso, minR: 0.5 });
  assert.equal(working.exit, false); assert.equal(working.progressR, 0.75);
});

// ── rule 4: DTE fit ───────────────────────────────────────────────────────
t('multi-day holds → 30–60 DTE; short holds unconstrained', () => {
  assert.deepEqual(dteFitWindow(5), { min: 30, max: 60, ideal: 45, fallbackMaxDte: 60, label: 'Multi-day hold (30–60 DTE)' });
  assert.equal(dteFitWindow(3)?.min, 30);
  assert.equal(dteFitWindow(2), null);
  assert.equal(dteFitWindow(1), null);
  for (const dte of [1, 7, 8, 14, 29, 61, 120]) assert.equal(isDteFit(dte, 5), false, `dte ${dte} on a 5-day hold`);
  for (const dte of [30, 45, 60]) assert.equal(isDteFit(dte, 5), true);
  for (const dte of [1, 3, 7, 10]) assert.equal(isDteFit(dte, 1), true, `dte ${dte} intraday`);
  assert.equal(holdDaysForSetup('swing'), 5);
  assert.equal(holdDaysForSetup('scalp'), 1);
  assert.equal(holdDaysForSetup('position'), 10);
  assert.equal(holdDaysForSetup('swing', 2), 2);
  assert.equal(dteFitWindow(holdDaysForSetup('week-ending'))?.min, 30);
});

t('selection engine: opt-in callers get 30–60 DTE for a swing; pickers keep their tier; LEAP/0DTE exempt', () => {
  assert.equal(dteFitFor({ applyDteFit: true, setup: 'swing' })?.min, 30);
  assert.equal(dteFitFor({ applyDteFit: true, setup: 'scalp' }), null);
  assert.equal(dteFitFor({ applyDteFit: false, setup: 'swing' }), null);
  assert.equal(dteFitFor({ applyDteFit: true, setup: 'position', expiryTier: 'LEAP' }), null);
  assert.equal(dteFitFor({ applyDteFit: true, setup: 'swing', allowZeroDte: true }), null);
  const exp = (days: number) => new Date(Date.now() + days * 86_400_000 + 3_600_000).toISOString().slice(0, 10);
  const row = (days: number, strike: number, delta: number): RawChainOption => ({
    symbol: `T${days}C${strike}`, option_type: 'call', strike, expiration_date: exp(days), bid: 2.0, ask: 2.1,
    open_interest: 500, volume: 150, // liquid under shared/option-liquidity.ts (OI ≥ 500, vol ≥ 100)
    greeks: { delta, gamma: 0.02, theta: -0.05, vega: 0.1, mid_iv: 0.35 },
  });
  const chain = [10, 20, 45, 90].flatMap((d) => [row(d, 100, 0.52), row(d, 105, 0.32), row(d, 95, 0.68)]);
  const thesis = { symbol: 'TST', direction: 'bullish' as const, setup: 'swing' as const, expiryTier: 'WEEKLY' as const, entry: 100, stop: 96, t1: 106, conviction: 80 };
  const before = selectFromChain(thesis, 100, chain);
  assert(before.picks.length > 0 && before.picks.every((p) => p.dte < 30), 'pre-rule WEEKLY swing picks short-dated');
  const after = selectFromChain({ ...thesis, applyDteFit: true }, 100, chain);
  assert.deepEqual(after.dteWindow, { min: 30, max: 60 });
  assert(after.picks.length > 0 && after.picks.every((p) => p.dte >= 30 && p.dte <= 60), `fit picks ${after.picks.map((p) => p.dte)}`);
  const scalp = selectFromChain({ ...thesis, setup: 'scalp', applyDteFit: true }, 100, chain);
  assert(scalp.picks.every((p) => p.dte < 30), 'intraday hold keeps the short window');
});

// ── report core ───────────────────────────────────────────────────────────
t('group stats: win%, PF, net', () => {
  const g = groupStats([100, -50, 50, -25]);
  assert.equal(g.n, 4); assert.equal(g.winRate, 50); assert.equal(g.profitFactor, 2); assert.equal(g.net, 75);
  assert.equal(groupStats([10]).profitFactor, null);
});
t('report separates measured before/after from hypothetical counterfactual', () => {
  const mk = (id: string, src: string, entryIso: string, pnl: number, ver: string | null): ReportTrade => ({
    id, ideaId: id, symbol: 'AAA', source: src, thesis: 'long', assetType: 'stock', entryTime: entryIso, publishedAt: entryIso, pnl,
    holdingPeriod: 'swing', expiryDate: null, entry: 100, target: 110, stop: 95, layers: null, convergenceSources: null, rulesVersion: ver,
  });
  const trades = [
    mk('a', 'quant', '2026-09-29T14:00:00Z', 100, null),          // 10:00 ET, in window
    mk('b', 'market_scanner', '2026-09-29T14:30:00Z', -40, null), // in window, peer 'a' confirms
    mk('c', 'flow', '2026-09-29T18:00:00Z', -60, 'loss-rules-v1'), // 14:00 ET, outside window
  ];
  const peers = trades.map((x) => ({ id: x.id, symbol: 'AAA', source: x.source, direction: 'long' as const, publishedMs: Date.parse(x.entryTime), closedMs: null }));
  const r = buildLossRulesReport({ journal: 'bot', trades, peers, basis: 'test' });
  assert.equal(r.counterfactual.hypothetical, true);
  assert.equal(r.measured.before.n, 2); assert.equal(r.measured.after.n, 1);
  const conf = r.counterfactual.rules[0].groups;
  // a has no earlier peer (fails); b is confirmed by a; c by a + b.
  assert.equal(conf.find((g) => g.key === 'pass')!.stats.n, 2);
  assert.equal(conf.find((g) => g.key === 'fail')!.stats.net, 100);
  assert.equal(r.counterfactual.rules[1].groups.find((g) => g.key === 'outside_window')!.stats.n, 1);
});

process.exitCode = 0;
console.log(`loss rules: ${n} test groups passed (confluence, entry window, target cap + time stop, DTE fit, report)`);
