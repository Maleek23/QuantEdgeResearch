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

console.log(`audit-p0-data: ${n} checks passed`);
process.exit(0);
