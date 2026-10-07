/**
 * Unit tests for research/losers-later-core.ts. All bars are SYNTHETIC.
 *   npm run -s test:losers-later
 */
import assert from 'node:assert/strict';
import {
  isLoss, closeKind, firstStopBar, afterClose, stopGeometry, isNoiseStop, todBucket, gapPct, dayDirection, alignment,
  atrBefore, replayRule, ruleStats, measuringLabel, median, fridayOf, renderMarkdown, type Bar, type RuleTrade, type MarkdownInput,
} from '../research/losers-later-core';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };
const T0 = Date.parse('2026-10-05T14:00:00Z'); // 10:00 ET Monday
const M5 = 5 * 60_000;
const mk = (rows: [number, number, number, number][], start = T0): Bar[] => rows.map(([o, h, l, c], k) => ({ t: start + k * M5, o, h, l, c }));

// long 100, stop 99, T1 102. Bar 1 wicks to 98.9 (stop), then the move to 102.5.
const shake = mk([
  [100, 100.4, 99.6, 100.1],
  [100.1, 100.2, 98.9, 99.4],   // stop bar
  [99.4, 100.3, 99.3, 100.2],   // back through entry
  [100.2, 101.4, 100.1, 101.3],
  [101.3, 102.5, 101.2, 102.2], // T1
  [102.2, 102.4, 101.8, 102.0],
]);

t('isLoss: P&L first, stop-out only without P&L, breakeven is not a loss', () => {
  assert.equal(isLoss('hit_stop', -12), true);
  assert.equal(isLoss('hit_stop', 5), false);       // a stop that locked profit
  assert.equal(isLoss('expired', -3), true);
  assert.equal(isLoss('expired', null), false);     // unmeasured
  assert.equal(isLoss('hit_stop', null), true);
  assert.equal(isLoss('closed', 0), false);
});

t('closeKind', () => {
  assert.equal(closeKind('hit_stop'), 'stop');
  assert.equal(closeKind('expired', 'time_stop_half_horizon'), 'time_stop');
  assert.equal(closeKind('expired', null), 'expiry');
  assert.equal(closeKind('hit_target'), 'target');
  assert.equal(closeKind('manual_exit'), 'manual');
});

t('firstStopBar finds the wick', () => {
  const b = firstStopBar(shake, 'long', 99, T0, T0 + 99 * M5);
  assert.equal(b?.t, T0 + M5);
  assert.equal(firstStopBar(shake, 'short', 101, T0, T0 + 99 * M5)?.t, T0 + 3 * M5);
});

t('afterClose: stopped, back at entry, then T1 inside the window', () => {
  const a = afterClose({ dir: 'long', entry: 100, stop: 99, target: 102, closeMs: T0 + 2 * M5, holdEndMs: T0 + 99 * M5, weekEndMs: T0 + 999 * M5, dataEndMs: T0 + 6 * M5, bars: shake });
  assert.equal(a.t1HitInHold, true);
  assert.equal(a.t1AtMs, T0 + 4 * M5);
  assert.equal(a.minutesToT1, 10);
  assert.equal(a.reclaimedEntryInHold, true);
  assert.equal(a.mfeHoldPct, 2.5);
  assert.equal(a.mfeHoldR, 2.5);
  assert.equal(a.lastInHoldPct, 2);
  assert.equal(a.greenAtHoldEnd, true);
  assert.equal(a.holdComplete, false);
});

t('afterClose: T1 after the holding window counts by week only; the stop bar itself is excluded', () => {
  const a = afterClose({ dir: 'long', entry: 100, stop: 99, target: 102, closeMs: T0 + 2 * M5, holdEndMs: T0 + 4 * M5, weekEndMs: T0 + 99 * M5, dataEndMs: T0 + 99 * M5, bars: shake });
  assert.equal(a.t1HitInHold, false);
  assert.equal(a.t1HitByWeekEnd, true);
  assert.equal(a.mfeHoldPct, 1.4);
  const never = afterClose({ dir: 'long', entry: 100, stop: 99, target: 102, closeMs: T0 + 99 * M5, holdEndMs: T0 + 200 * M5, weekEndMs: T0 + 300 * M5, dataEndMs: T0, bars: shake });
  assert.equal(never.barsAfter, 0);
  assert.equal(never.mfeHoldPct, null);
});

t('afterClose short mirrors', () => {
  const s = mk([[100, 101.2, 99.9, 101], [101, 101, 98, 98.2]]);
  const a = afterClose({ dir: 'short', entry: 100, stop: 101, target: 98, closeMs: T0 + M5, holdEndMs: T0 + 9 * M5, weekEndMs: T0 + 9 * M5, dataEndMs: T0 + 9 * M5, bars: s });
  assert.equal(a.t1HitInHold, true);
  assert.equal(a.mfeHoldPct, 2);
});

t('stopGeometry: MAE to T1 vs stop width, in ATR', () => {
  const g = stopGeometry({ dir: 'long', entry: 100, stop: 99, atrD: 2, bars: shake, triggerMs: T0, untilMs: T0 + 4 * M5 });
  assert.equal(g.stopPct, 1);
  assert.equal(g.stopAtr, 0.5);
  assert.equal(g.maePct, 1.1);
  assert.equal(g.maeOverStop, 1.1);
  assert.equal(g.maeAtr, 0.55);
  assert.equal(stopGeometry({ dir: 'long', entry: 100, stop: 99, atrD: null, bars: shake, triggerMs: T0, untilMs: T0 }).stopAtr, null);
});

t('noise stop needs T1 later AND survivable MAE', () => {
  assert.equal(isNoiseStop({ t1HitInHold: true }, { maeOverStop: 1.1 }), true);
  assert.equal(isNoiseStop({ t1HitInHold: true }, { maeOverStop: 2.4 }), false);
  assert.equal(isNoiseStop({ t1HitInHold: false }, { maeOverStop: 1.1 }), false);
});

t('context helpers', () => {
  assert.equal(todBucket(9 * 60 + 35), 'open 09:30–10:00');
  assert.equal(todBucket(8 * 60), 'pre-market (<09:30)');
  assert.equal(todBucket(15 * 60), 'afternoon 14:00–16:00');
  assert.equal(gapPct(100, 102), 2);
  assert.equal(gapPct(null, 102), null);
  assert.equal(dayDirection(100, 100.05), 'flat');
  assert.equal(dayDirection(100, 99), 'down');
  assert.equal(alignment('long', 'down'), 'against');
  assert.equal(alignment('short', 'down'), 'with');
  assert.equal(fridayOf('2026-10-05'), '2026-10-09');
  assert.equal(fridayOf('2026-10-09'), '2026-10-09');
  const daily = Array.from({ length: 20 }, (_, k) => ({ day: `2026-09-${String(k + 1).padStart(2, '0')}`, o: 100, h: 101, l: 99, c: 100 }));
  assert.equal(atrBefore(daily, '2026-09-10'), null);  // only 9 prior days
  assert.equal(atrBefore(daily, '2026-09-20'), 2);
});

const trade = (over: Partial<RuleTrade> = {}): RuleTrade => ({ dir: 'long', entry: 100, stop: 99, target: 102, atrD: 1, triggerMs: T0, holdEndMs: T0 + 6 * M5, holdComplete: true, bars: shake, ...over });

t('plan stops on the wick; 1.5×ATR stop survives to T1', () => {
  const p = replayRule('plan', trade());
  assert.equal(p.reason, 'stop');
  assert.equal(p.pct, -1);
  const w = replayRule('atr1_5', trade());
  assert.equal(w.reason, 'target');
  assert.equal(w.pct, 2);
  assert.equal(replayRule('atr1', trade()).reason, 'stop');
  assert.equal(replayRule('atr2', trade({ atrD: null })).reason, 'no_atr');
});

t('close-based stop ignores the wick (close 99.4 > 99)', () => {
  const c = replayRule('close_stop', trade());
  assert.equal(c.reason, 'target');
  assert.equal(c.pct, 2);
  const crash = mk([[100, 100, 98.5, 98.6]]);
  const c2 = replayRule('close_stop', trade({ bars: crash, holdEndMs: T0 + M5 }));
  assert.equal(c2.reason, 'close_stop');
  assert.equal(c2.pct, -1.4);
});

t('time_only: only the 3×ATR catastrophe stop, else T1 / horizon', () => {
  assert.equal(replayRule('time_only', trade()).reason, 'target');
  const drift = mk([[100, 100.5, 99.2, 99.5], [99.5, 99.8, 99.1, 99.6]]);
  const h = replayRule('time_only', trade({ bars: drift, holdEndMs: T0 + 2 * M5 }));
  assert.equal(h.reason, 'horizon');
  assert.equal(h.pct, -0.4);
});

t('re-entry after a shake-out: stop leg + re-entry leg to T1', () => {
  const r = replayRule('reentry', trade());
  assert.equal(r.reentered, true);
  assert.equal(r.reason, 'stop+reentry_target');
  assert.equal(r.pct, 1); // −1 + 2
  // no reclaim inside 60 min → just the stop
  const dead = mk([[100, 100.2, 98.5, 98.7], ...Array.from({ length: 15 }, () => [98.7, 99.0, 98.4, 98.8] as [number, number, number, number]), [98.8, 100.5, 98.8, 100.4]]);
  const r2 = replayRule('reentry', trade({ bars: dead, holdEndMs: T0 + 30 * M5 }));
  assert.equal(r2.reentered, false);
  assert.equal(r2.reason, 'stop');
});

t('incomplete horizon is open, never a horizon close', () => {
  const drift = mk([[100, 100.5, 99.2, 99.5]]);
  assert.equal(replayRule('time_only', trade({ bars: drift, holdComplete: false, holdEndMs: T0 + 10 * M5 })).pct, null);
});

t('ruleStats + labels', () => {
  const s = ruleStats([2, -1, -1, 5, 0.5]);
  assert.equal(s.n, 5); assert.equal(s.wins, 3); assert.equal(s.winRate, 60); assert.equal(s.sumPct, 5.5); assert.equal(s.pnl1000, 55);
  assert.equal(s.sumPctExTop3, -2);
  assert.equal(ruleStats([]).winRate, null);
  assert.equal(measuringLabel(12), 'MEASURING (n=12) — too small to act on');
  assert.equal(measuringLabel(40), 'MEASURING (n=40)');
  assert.equal(median([3, 1, null, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

t('renderMarkdown fills every section', () => {
  const stats = ruleStats([1, -1]);
  const m: MarkdownInput = {
    generatedAt: 'now', since: '2026-09-29', focus: '2026-10-05', dataThrough: 'x',
    population: { ideas: 10, closed: 8, losers: 5, analysed: 4, skipped: { no_levels: 1 } },
    headline: { laterT1InHold: 2, laterT1InHoldPct: 50, laterT1ByWeek: 3, laterT1ByWeekPct: 75, reclaimedEntry: 3, reclaimedEntryPct: 75, greenAtHoldEnd: 1, greenAtHoldEndPct: 25, holdComplete: 4,
      noise: 1, noisePct: 25, medianStopPct: 1.2, medianStopAtr: 0.4, medianMaeOverStopLaterT1: 1.2, medianMaeOverStopOthers: 3, optionLosers: 2, optionLaterAboveEntryPremium: 1, optionLaterAboveEntryPremiumPct: 50 },
    byEngine: [{ key: 'quant', n: 4, laterT1: 2, laterT1Pct: 50, medianStopAtr: 0.4, medianStopPct: 1.2, medianMaeOverStop: 1.5, noise: 1 }],
    byCloseKind: [], byHolding: [], byTod: [], bySpy: [], byGap: [], byStopAtr: [],
    rules: [{ rule: 'atr1_5', label: 'wide', stats, plan: stats, deltaPnl1000: 0, deltaWinRate: 0, measuring: measuringLabel(2), extra: 'x' }],
    monday: { published: 3, triggered: 2, closed: 2, wins: 1, losses: 1, flat: 0, open: 0, untriggered: 1, bookPnl: -20,
      byEngine: [{ engine: 'quant', published: 3, closed: 2, wins: 1, losses: 1, open: 0, untriggered: 1, pnl: -20 }],
      missed: { closedThenT1: 1, ranWithoutFill: 0, wouldHaveWonAtMarket: 1 },
      ideas: [{ id: 'a', symbol: 'AAPL', engine: 'quant', direction: 'long', vehicle: 'stock', publishedEt: '10:01', triggered: true, outcome: 'hit_stop', pnl: -20, bookExcluded: null, missedWinner: 'closed (stop) then hit T1 10m later' }] },
  };
  const s = renderMarkdown(m);
  for (const needle of ['# Losers later', '| later reached T1 inside the original holding window | 2 | 50% |', 'MEASURING (n=2) — too small to act on',
    '## Monday 2026-10-05', '| quant | 3 | 2 | 1 | 1 | 0 | 1 | −$20 |', 'closed (stop) then hit T1 10m later', '### By engine', '_no rows_', 'hindsight']) {
    assert.ok(s.includes(needle), `missing: ${needle}`);
  }
});

console.log(`✓ losers-later: ${n} tests passed`);
