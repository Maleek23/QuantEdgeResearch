/**
 * Audit 2026-10-01 P0 data fixes — live-not-carried, one conviction scale,
 * GEX labels/age, positions math, journal awaiting-entry, fabricated numbers,
 * fake defaults.
 *   npx tsx scripts/test-audit-p0-data.ts
 * Pure checks — no DB, no network.
 */
import assert from 'node:assert/strict';

// alert-engine keeps its seen-state in localStorage; give it an in-memory one.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

import { liveMark, boardLivePrice } from '../shared/live-mark';
import { convictionDisplayPercent } from '../shared/conviction-display';
import { detectAlerts, DEFAULT_ALERT_PREFS, alertScore, HIGH_CONVICTION_DISPLAY } from '../client/src/lib/alerts/alert-engine';
import { normalizeCatalystRow } from '../client/src/lib/catalyst-rows';

let n = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++; };

// ── #7 Live, not carried ─────────────────────────────────────────────────────
ok(liveMark({ entryPrice: 100 }, null) === null, 'no quote, no board price → null, never the entry');
ok(liveMark({ entryPrice: 100, currentPrice: 100 }, undefined) === null, 'a board copy of the entry is not the market');
ok(liveMark({ entryPrice: 100, currentPrice: 104, priceIsLive: false }) === null, 'a carried board price (flag false) is refused');
ok(liveMark({ entryPrice: 100, currentPrice: 100, priceIsLive: true }) === 100, 'a live quote AT entry is still live');
ok(liveMark({ entryPrice: 100, currentPrice: 104 }, 105) === 105, 'a fresh quote wins');
ok(liveMark({ entryPrice: 100, currentPrice: 104 }, 0) === 104, 'an unflagged board price that moved is used');
ok(boardLivePrice({ entryPrice: 100, currentPrice: -1 }) === null, 'non-positive price refused');

const basePick: any = {
  ideaId: 'i1', symbol: 'AAPL', direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95,
  riskRewardRatio: 2, holdingPeriod: 'swing', optionDte: null, expiryDate: null,
  generatedAt: new Date(Date.now() - 6 * 3600_000).toISOString(), convictionScore: 20, convictionBand: 'A',
  lifecycleState: 'triggered', layers: [],
};
const prefs = { ...DEFAULT_ALERT_PREFS, enabled: { ...DEFAULT_ALERT_PREFS.enabled, rating_jump: true } };
store.clear();
detectAlerts([{ ...basePick, currentPrice: 104, priceIsLive: true }], prefs); // seen: in play on a live quote
// Quote fails; the carried board price sits beyond the target. No geometry alert may fire.
const carried = detectAlerts([{ ...basePick, currentPrice: 111, priceIsLive: false }], prefs);
ok(!carried.some((e) => e.type === 'target_hit'), 'no target alert on a carried price');
// The quote returns above target → the transition fires now, once.
const back = detectAlerts([{ ...basePick, currentPrice: 111, priceIsLive: true }], prefs);
ok(back.some((e) => e.type === 'target_hit'), 'target alert fires once a live quote confirms it');
store.clear();
const noQuote = detectAlerts([{ ...basePick, currentPrice: undefined }], prefs);
ok(!noQuote.some((e) => ['trigger_confirmed', 'target_hit', 'danger_zone', 'invalidated'].includes(e.type)), 'first sighting without a quote fires no geometry alert');

// ── #8/#9 One conviction scale ───────────────────────────────────────────────
ok(alertScore({ convictionScore: 27 }) === convictionDisplayPercent(27), 'alerts use the display scale');
ok(convictionDisplayPercent(35) >= HIGH_CONVICTION_DISPLAY, 'a top raw score reaches the 90+ alert (it could not before)');
store.clear();
const fresh = { ...basePick, generatedAt: new Date().toISOString() };
const hi = detectAlerts([{ ...fresh, ideaId: 'hi', convictionScore: 35 }], DEFAULT_ALERT_PREFS);
const hiEv = hi.find((e) => e.type === 'high_conviction');
ok(hiEv && /\/100/.test(hiEv.detail), 'default-armed 90+ alert fires and prints the display score');
const lo = detectAlerts([{ ...fresh, ideaId: 'lo', convictionScore: 22 }], DEFAULT_ALERT_PREFS);
ok(!lo.some((e) => e.type === 'high_conviction'), 'a mid score does not fire 90+');

// ── #20/#21 Catalyst rows ────────────────────────────────────────────────────
const conf = normalizeCatalystRow({ symbol: 'nvda', direction: 'short', convictionScore: 25, events: [{ title: 'FDA', daysAway: 3 }] }, 'confluence');
ok(conf.event?.title === 'FDA' && conf.event.daysAway === 3, 'confluence row maps events[0] → event');
ok(conf.side === 'SHORT' && conf.score === convictionDisplayPercent(25), 'side + display score');
const un = normalizeCatalystRow({ symbol: 'GME', type: 'earnings', title: 'Earnings', date: '2026-10-03', daysAway: 2, importance: 80 }, 'nosignal');
ok(un.side === null, 'NO SIGNAL rows have no side (were "▲ LONG")');
ok(un.event?.title === 'Earnings' && un.event.daysAway === 2 && un.type === 'nosignal', 'flat unclaimed fields map to event; bucket kept');
ok(un.score === null, 'NO SIGNAL rows have no score');
const risk = normalizeCatalystRow({ symbol: 'X', direction: 'long', event: { title: 'CPI', daysAway: 0 } }, 'risk');
ok(risk.event?.title === 'CPI' && risk.side === 'LONG', 'event-risk row keeps its event');

// ── #10/#11 One wall basis; #12 data time ───────────────────────────────────
{
  const { pickWalls } = await import('../shared/gex-wall-basis');
  const { wallsFromGex } = await import('../server/wall-touch');
  const { cboeDataTime } = await import('../server/gex-cboe-fallback');
  const all = { callWall: 800, putWall: 500, flip: 640 };
  const near = { ...all, byDte: { next7: { expirationsCount: 3, callWall: 680, putWall: 650, gammaFlipPrice: 662 } } };
  const a = pickWalls(near);
  ok(a.basis === 'next7' && a.callWall === 680 && a.putWall === 650 && a.flip === 662, '≤7d book wins when it has walls');
  ok(/≤7d/.test(a.basisLabel) && a.basisShort === '≤7d', 'basis is labelled');
  const b = pickWalls({ ...all, byDte: { next7: { expirationsCount: 2, callWall: 680, putWall: 650, gammaFlipPrice: null } } });
  ok(b.flip === null, 'the near book never borrows the all-expiry zero-γ');
  const c = pickWalls(all);
  ok(c.basis === 'all' && c.callWall === 800 && /fallback/.test(c.basisLabel), 'all-expiry fallback is labelled as such');
  ok(pickWalls(null).callWall === null, 'null-safe');
  const wt = wallsFromGex({ spotPrice: 660, callWall: 800, putWall: 500, flipPoint: 640, byDte: near.byDte });
  ok(wt.callWall === a.callWall && wt.putWall === a.putWall && wt.flip === a.flip && wt.basis === a.basis, 'NEXUS wall-touch uses the same rule');

  const fetched = Date.parse('2026-10-01T20:00:00Z');
  ok(cboeDataTime('2026-10-01 15:44:02', fetched) === '2026-10-01T19:44:02.000Z', 'CBOE naive ET timestamp → EDT instant');
  ok(cboeDataTime('2026-01-15 15:44:02', Date.parse('2026-01-15T21:00:00Z')) === '2026-01-15T20:44:02.000Z', 'CBOE naive ET timestamp → EST instant');
  ok(cboeDataTime(undefined, fetched) === new Date(fetched).toISOString(), 'no payload time → download time, not now');
}

// ── #4/#5/#6 Positions math ──────────────────────────────────────────────────
{
  const { markPnl, computePositionsSummary } = await import('../server/positions-live');
  const opt = { direction: 'long', entryPrice: 2.5, assetType: 'option' };
  ok(markPnl(opt, 600, null).pnlPct === null, 'an option without a contract mark has no P&L (not the underlying)');
  const om = markPnl(opt, 600, 3.0);
  ok(om.mark === 3 && om.pnlPct === 20, 'an option is marked on its own premium (+20%), not $600 underlying');
  ok(markPnl({ direction: 'short', entryPrice: 2, assetType: 'option' }, 600, 1).pnlPct === -50, 'a bought put loses when its premium halves');
  ok(markPnl({ direction: 'long', entryPrice: 100, assetType: 'stock' }, null, null).pnlPct === null, 'failed spot → null, not 0%');
  ok(markPnl({ direction: 'short', entryPrice: 100, assetType: 'stock' }, 95, null).pnlPct === 5, 'short stock P&L');
  const pos = (id: string, pnlPct: number | null, pnlAbs: number | null): any => ({ id, symbol: id, pnlPct, pnlAbs, heatRank: pnlPct == null ? 'nomark' : 'warm', source: 's', assetType: 'stock' });
  const ten = Array.from({ length: 10 }, (_, i) => pos(`S${i}`, 5, 5));
  const sum = computePositionsSummary(ten);
  ok(sum.totalPnLPct === 5, '10 × +5% reads +5% (was +50%)');
  const mixed = computePositionsSummary([pos('A', 10, 10), pos('B', -4, -4), pos('C', null, null)]);
  ok(mixed.totalPnLPct === 3 && mixed.marked === 2 && mixed.unmarked === 1, 'unmarked positions are excluded from the headline');
  ok(mixed.bestPosition?.id === 'A' && mixed.worstPosition?.id === 'B', 'best/worst ignore unmarked rows');
  ok(computePositionsSummary([pos('C', null, null)]).totalPnLPct === null, 'nothing marked → null headline');
}

// ── #14 Journal NEXUS book: untriggered ≠ open trade ─────────────────────────
{
  const { mapDeskIdea, AWAITING_ENTRY_REASON } = await import('../server/journal-row-maps');
  const idea: any = {
    id: 'd1', symbol: 'AAPL', assetType: 'stock', direction: 'long', entryPrice: 100, targetPrice: 110, stopLoss: 95,
    riskRewardRatio: 2, optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null,
    optionPercentGain: null, exitPrice: null, percentGain: null, outcomeStatus: 'open', resolutionReason: null,
    exitDate: null, timestamp: '2026-09-30T14:00:00Z', source: 'quant', catalyst: null, genConvictionBand: 'A',
  };
  const pending = mapDeskIdea({ ...idea, executionState: 'pending_trigger' });
  ok('excluded' in pending && pending.excluded === AWAITING_ENTRY_REASON, 'pending_trigger idea is awaiting entry, not an open trade');
  const noAudit = mapDeskIdea({ ...idea, executionState: null });
  ok('excluded' in noAudit, 'no recorded trigger → awaiting entry');
  const trig = mapDeskIdea({ ...idea, executionState: 'triggered' });
  ok('row' in trig && trig.row.status === 'open', 'triggered idea is an open trade');
  const closed = mapDeskIdea({ ...idea, executionState: 'pending_trigger', outcomeStatus: 'hit_target', exitPrice: 110, exitDate: '2026-09-30T16:00:00Z' });
  ok('row' in closed && closed.row.status === 'closed', 'resolved ideas are unaffected');
}

// ── #17/#18/#75 Fabricated numbers ───────────────────────────────────────────
{
  const { completeCandles, finitePoints } = await import('../client/src/lib/chart-sanitize');
  const { integrityCheckValues, sampleTradeClass } = await import('../client/src/lib/integrity-checks');
  const { performanceStartDate, clampToBaseline, isClampedToBaseline } = await import('../client/src/lib/performance-range');
  const { OUTCOME_BASELINE_DATE } = await import('../shared/constants');

  const bars = completeCandles([
    { time: 1, open: 10, high: 11, low: 9, close: 10.5 },
    { time: 2, open: null, high: 11, low: 9, close: 10 },
    { time: 3, open: 10, high: undefined, low: 9, close: 10 },
    null,
    { time: null, open: 1, high: 1, low: 1, close: 1 },
  ]);
  ok(bars.length === 1 && bars[0].time === 1, 'bars with a missing price are dropped (no $100 candles)');
  ok(!bars.some((b) => b.open === 100 || b.close === 100), 'no fabricated $100 values');
  const bb = finitePoints([{ time: 1, upper: 12 }, { time: 2, upper: null }, { time: 3, upper: NaN }], 'upper');
  ok(bb.length === 1 && bb[0].value === 12, 'band points with missing values are dropped');

  ok(integrityCheckValues({ checkName: 'Win', status: 'pass', independent: 12, reported: 12 }) === '12 counted / 12 reported', 'reconciliation checks read independent/reported');
  ok(integrityCheckValues({ checkName: 'n', status: 'warning', actual: 48, threshold: 100 }) === '48 / 100 needed', 'sample-size check reads actual/threshold');
  ok(!/undefined/.test(integrityCheckValues({ checkName: 'x', status: 'fail' })), 'never prints "undefined / undefined"');
  ok(sampleTradeClass({ countedAsWin: true }) === 'WIN' && sampleTradeClass({ countedAsLoss: true }) === 'LOSS' && sampleTradeClass({}) === 'EXCL', 'sample trades read countedAsWin/Loss');

  const now = new Date('2026-10-01T15:00:00Z');
  ok(performanceStartDate('3m', now) === OUTCOME_BASELINE_DATE, '"3 Months" is clamped to the outcome baseline');
  ok(isClampedToBaseline('3m', now) && !isClampedToBaseline('7d', now), 'clamp is reported for the label');
  ok(performanceStartDate('7d', now) === '2026-09-24', 'short windows unchanged');
  ok(clampToBaseline('2026-07-01') === OUTCOME_BASELINE_DATE && clampToBaseline(null) === null, 'clamp helper');
}

console.log(`audit-p0-data: ${n} checks passed`);
process.exit(0);
