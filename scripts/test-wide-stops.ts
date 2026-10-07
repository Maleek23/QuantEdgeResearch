/**
 * Wider stops (operator 2026-10-07): shared/wide-stops.ts, the NEXUS phase-2 switch in
 * server/lib/atr-stop-floor.ts, the "stopped then would have won" fact (shared/after-stop.ts),
 * the walk-forward chooser (research/losers-later-core.ts) and the track-record count.
 * All data SYNTHETIC.   npm run -s test:wide-stops
 */
import assert from 'node:assert/strict';
import {
  readStopAtrMult, widenStop, readBotStopConfig, optionPremiumStop, sizeForRisk, underlyingStopCrossed,
  ustopTag, parseUstopTag, zeroDteGrace, openingRange, BOT_STOP_ATR_MULT_DEFAULT,
} from '../shared/wide-stops';
import {
  afterClose, classifyAfterStop, formatAfterStopTag, parseAfterStop, withAfterStopTag, afterStopLabel, countMissedWinners, holdEndFor, type Bar,
} from '../shared/after-stop';
import { computeAtrStopFloor, nexusStopAtrK, ATR_STOP_FLOOR_K, type DailyBar } from '../server/lib/atr-stop-floor';
import {
  walkForward, replayRule, renderWalkForward, WF_FALLBACK_MULT, walkForwardR, renderWalkForwardR, rStats, riskPctFor,
  type WfIdea, type WfRIdea, type RuleTrade,
} from '../research/losers-later-core';
import { isStopExit } from '../shared/bot-sleeves';
import { computeTrackRecord } from '../shared/track-record';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

// ── widenStop: further of structural and k×ATR ─────────────────────────────
t('widenStop: ATR further than the plan stop → ATR', () => {
  const w = widenStop({ entry: 100, stop: 99, side: 'long', atr: 2, mult: 1.5 })!;
  assert.equal(w.stop, 97); assert.equal(w.widened, true); assert.equal(w.basis, 'atr'); assert.equal(w.structural, 99);
});
t('widenStop: structural level further → kept', () => {
  const w = widenStop({ entry: 100, stop: 95, side: 'long', atr: 2, mult: 1.5 })!;
  assert.equal(w.stop, 95); assert.equal(w.widened, false); assert.equal(w.basis, 'structural');
});
t('widenStop: shorts widen upward', () => {
  const w = widenStop({ entry: 50, stop: 50.5, side: 'short', atr: 1, mult: 2 })!;
  assert.equal(w.stop, 52); assert.equal(w.widened, true);
});
t('widenStop: no ATR → structural unchanged; wrong-side plan stop → ATR only; nothing → null', () => {
  assert.equal(widenStop({ entry: 100, stop: 99, side: 'long', atr: null, mult: 1.5 })!.stop, 99);
  const w = widenStop({ entry: 100, stop: 101, side: 'long', atr: 2, mult: 1 })!;
  assert.equal(w.stop, 98); assert.equal(w.basis, 'atr_only');
  assert.equal(widenStop({ entry: 100, stop: null, side: 'long', atr: null, mult: 1 }), null);
  assert.equal(widenStop({ entry: 0, stop: 1, side: 'long', atr: 1, mult: 1 }), null);
});

// ── config / flags ─────────────────────────────────────────────────────────
t('readStopAtrMult: unset → fallback, clamps, garbage → fallback', () => {
  assert.equal(readStopAtrMult(undefined, null), null);
  assert.equal(readStopAtrMult('', 1.5), 1.5);
  assert.equal(readStopAtrMult('2', null), 2);
  assert.equal(readStopAtrMult('9', null), 4);
  assert.equal(readStopAtrMult('0.1', null), 0.5);
  assert.equal(readStopAtrMult('abc', 1.5), 1.5);
  assert.equal(readStopAtrMult('-1', null), null);
});
t('readBotStopConfig: defaults ON at 1.5×, 5-min grace, −50% fallback, −80% cap, −70% grace disaster', () => {
  const c = readBotStopConfig({});
  assert.equal(c.enabled, true); assert.equal(c.atrMult, BOT_STOP_ATR_MULT_DEFAULT); assert.equal(BOT_STOP_ATR_MULT_DEFAULT, 1.5);
  assert.equal(c.zeroDteGraceMin, 5); assert.equal(c.zeroDteOrMin, 5);
  assert.equal(c.fallbackPremStopPct, 0.5); assert.equal(c.maxPremLossPct, 0.8); assert.equal(c.zeroDteGraceDisasterPct, 0.7);
  assert.equal(readBotStopConfig({ BOT_WIDE_STOPS: 'false' }).enabled, false);
  assert.equal(readBotStopConfig({ BOT_WIDE_STOPS: '0' }).enabled, false);
  assert.equal(readBotStopConfig({ BOT_STOP_ATR_MULT: '2' }).atrMult, 2);
  assert.equal(readBotStopConfig({ BOT_0DTE_STOP_GRACE_MIN: '0' }).zeroDteGraceMin, 0);
});

// ── options: premium stop + same-dollar sizing ─────────────────────────────
t('optionPremiumStop: delta-implied value at the wide underlying stop', () => {
  const cfg = readBotStopConfig({});
  const p = optionPremiumStop({ premium: 4, delta: 0.5, underlyingEntry: 100, underlyingStop: 97 }, cfg)!;
  assert.equal(p.basis, 'delta'); assert.equal(p.stop, 2.5); assert.equal(p.riskPerContract, 150);
  // puts: signed delta, same maths
  assert.equal(optionPremiumStop({ premium: 4, delta: -0.5, underlyingEntry: 100, underlyingStop: 103 }, cfg)!.stop, 2.5);
  // capped at −80%
  assert.equal(optionPremiumStop({ premium: 2, delta: 0.6, underlyingEntry: 100, underlyingStop: 90 }, cfg)!.stop, 0.4);
  // no delta → −50% fallback (the old swing stop)
  const f = optionPremiumStop({ premium: 2, delta: null, underlyingEntry: 100, underlyingStop: 97 }, cfg)!;
  assert.equal(f.basis, 'fallback'); assert.equal(f.stop, 1);
  assert.equal(optionPremiumStop({ premium: 0, delta: 0.5, underlyingEntry: 100, underlyingStop: 97 }, cfg), null);
});
t('sizing keeps dollar risk constant: wider stop → fewer contracts / shares', () => {
  const cfg = readBotStopConfig({});
  const tight = optionPremiumStop({ premium: 4, delta: 0.5, underlyingEntry: 100, underlyingStop: 99 }, cfg)!;   // $50/contract
  const wide = optionPremiumStop({ premium: 4, delta: 0.5, underlyingEntry: 100, underlyingStop: 97 }, cfg)!;    // $150/contract
  const qT = sizeForRisk(500, tight.riskPerContract), qW = sizeForRisk(500, wide.riskPerContract);
  assert.equal(qT, 10); assert.equal(qW, 3);
  assert.ok(qW * wide.riskPerContract <= 500 && qT * tight.riskPerContract <= 500);
  assert.equal(sizeForRisk(500, 1), 500); assert.equal(sizeForRisk(500, 3), 166); assert.equal(sizeForRisk(100, 150), 0);
  assert.equal(sizeForRisk(500, 50, 4), 4);
});

// ── underlying stop on a held contract ─────────────────────────────────────
t('underlyingStopCrossed + ustop tag round-trip', () => {
  assert.equal(underlyingStopCrossed('long', 96.9, 97), true);
  assert.equal(underlyingStopCrossed('long', 97.1, 97), false);
  assert.equal(underlyingStopCrossed('short', 103, 103), true);
  assert.equal(underlyingStopCrossed('long', null, 97), false); // unknown → never judged
  const tag = ustopTag('short', 412.345);
  assert.equal(tag, 'ustop:short:412.35');
  assert.deepEqual(parseUstopTag(JSON.stringify(['sleeve:swing', tag])), { side: 'short', stop: 412.35 });
  assert.deepEqual(parseUstopTag(['ustop:long:97']), { side: 'long', stop: 97 });
  assert.equal(parseUstopTag('not json'), null);
  assert.equal(parseUstopTag(JSON.stringify(['sleeve:swing'])), null);
});
t('isStopExit counts the wide-stop exits (no same-day re-entry after them)', () => {
  assert.equal(isStopExit('underlying_stop [fill bid=1]'), true);
  assert.equal(isStopExit('premium_stop_wide_38pct'), true);
  assert.equal(isStopExit('time_stop [fill-mid mid=1]'), false);
});

// ── 0DTE opening grace ─────────────────────────────────────────────────────
t('zeroDteGrace: holds the −40% only inside the grace, inside the opening range, above the disaster stop', () => {
  const cfg = readBotStopConfig({});
  const T = Date.parse('2026-10-07T13:40:00Z'); // 09:40 ET
  const base = { entryMs: T, nowMs: T + 3 * 60_000, side: 'long' as const, premiumEntry: 2, premiumMark: 1.15, underlying: 500, orHigh: 502, orLow: 499 };
  assert.equal(zeroDteGrace(base, cfg).hold, true);
  assert.equal(zeroDteGrace({ ...base, nowMs: T + 6 * 60_000 }, cfg).hold, false);         // past 5 min
  assert.equal(zeroDteGrace({ ...base, underlying: 498.9 }, cfg).hold, false);             // broke OR low (call)
  assert.equal(zeroDteGrace({ ...base, side: 'short', underlying: 502.5 }, cfg).hold, false); // broke OR high (put)
  assert.equal(zeroDteGrace({ ...base, side: 'short', underlying: 500 }, cfg).hold, true);
  assert.equal(zeroDteGrace({ ...base, premiumMark: 0.55 }, cfg).hold, false);             // past −70%
  assert.equal(zeroDteGrace({ ...base, underlying: null }, cfg).hold, false);              // unknown → stop applies
  assert.equal(zeroDteGrace({ ...base, orHigh: null }, cfg).hold, false);
  assert.equal(zeroDteGrace(base, { ...cfg, zeroDteGraceMin: 0 }).hold, false);           // off
});
t('openingRange: first N minutes from the open', () => {
  const open = Date.parse('2026-10-07T13:30:00Z');
  const bars = [0, 1, 2, 3, 4, 5, 6].map((k) => ({ t: open + k * 60_000, h: 100 + k, l: 99 - k }));
  assert.deepEqual(openingRange(bars, open, 5), { high: 104, low: 95 });
  assert.equal(openingRange([], open, 5), null);
});

// ── NEXUS phase 2: one switch, unset = unchanged ───────────────────────────
const daily: DailyBar[] = Array.from({ length: 16 }, (_, k) => ({ high: 102 + (k % 2) * 0.0, low: 98, close: 100 })); // ATR 4
t('NEXUS_STOP_ATR_MULT unset → the 1.25× floor, byte-identical', () => {
  assert.equal(nexusStopAtrK({}), ATR_STOP_FLOOR_K);
  const r = computeAtrStopFloor({ symbol: 'X', entry: 100, stop: 99, target: 110, direction: 'long', holdingPeriod: 'swing' }, daily, nexusStopAtrK({}));
  assert.equal(r.stopLoss, 95); assert.equal(r.widened, true);
  assert.match(r.note, /1\.25× ATR/);
});
t('NEXUS_STOP_ATR_MULT=2 → stop = further of structural and 2×ATR', () => {
  assert.equal(nexusStopAtrK({ NEXUS_STOP_ATR_MULT: '2' }), 2);
  const r = computeAtrStopFloor({ symbol: 'X', entry: 100, stop: 99, target: 110, direction: 'long', holdingPeriod: 'swing' }, daily, 2);
  assert.equal(r.stopLoss, 92); assert.match(r.note, /2× ATR/);
  const keep = computeAtrStopFloor({ symbol: 'X', entry: 100, stop: 90, target: 120, direction: 'long', holdingPeriod: 'swing' }, daily, 2);
  assert.equal(keep.widened, false); assert.equal(keep.stopLoss, 90);
  const day = computeAtrStopFloor({ symbol: 'X', entry: 100, stop: 99, target: 110, direction: 'long', holdingPeriod: 'day' }, daily, 2);
  assert.equal(day.widened, false); // day trades still excluded
});

// ── after-stop: the tracked fact ───────────────────────────────────────────
const T0 = Date.parse('2026-10-05T14:00:00Z'); // 10:00 ET Monday
const M5 = 5 * 60_000;
const mk = (rows: [number, number, number, number][], start = T0): Bar[] => rows.map(([o, h, l, c], k) => ({ t: start + k * M5, o, h, l, c }));
const shake = mk([
  [100, 100.4, 99.6, 100.1], [100.1, 100.2, 98.9, 99.4], [99.4, 100.3, 99.3, 100.2], [100.2, 101.4, 100.1, 101.3], [101.3, 102.5, 101.2, 102.2], [102.2, 102.4, 101.8, 102.0],
]);
t('classifyAfterStop: T1 final at once; entry/none only when the window is complete', () => {
  const a = afterClose({ dir: 'long', entry: 100, stop: 99, target: 102, closeMs: T0 + 2 * M5, holdEndMs: T0 + 99 * M5, weekEndMs: T0 + 99 * M5, dataEndMs: T0 + 6 * M5, bars: shake });
  assert.deepEqual(classifyAfterStop(a), { kind: 't1', atMs: T0 + 4 * M5 });
  const b = afterClose({ dir: 'long', entry: 100, stop: 99, target: 105, closeMs: T0 + 2 * M5, holdEndMs: T0 + 99 * M5, weekEndMs: T0 + 99 * M5, dataEndMs: T0 + 6 * M5, bars: shake });
  assert.equal(classifyAfterStop(b), null); // back at entry but window still open
  const c = afterClose({ dir: 'long', entry: 100, stop: 99, target: 105, closeMs: T0 + 2 * M5, holdEndMs: T0 + 6 * M5, weekEndMs: T0 + 6 * M5, dataEndMs: T0 + 6 * M5, bars: shake });
  assert.deepEqual(classifyAfterStop(c), { kind: 'entry', atMs: T0 + 2 * M5 });
  const d = afterClose({ dir: 'short', entry: 100, stop: 101, target: 97, closeMs: T0 + 3 * M5, holdEndMs: T0 + 6 * M5, weekEndMs: T0 + 6 * M5, dataEndMs: T0 + 6 * M5, bars: shake });
  assert.deepEqual(classifyAfterStop(d), { kind: 'none', atMs: null });
});
t('after-stop tag: format / parse / replace — other notes untouched', () => {
  const v = { kind: 't1' as const, atMs: T0 + 4 * M5 };
  assert.equal(formatAfterStopTag(v), '[after-stop:t1@2026-10-05T14:20:00.000Z]');
  assert.deepEqual(parseAfterStop(`stopped [exit-premium:touch_bar] ${formatAfterStopTag(v)}`), v);
  assert.deepEqual(parseAfterStop('[after-stop:none]'), { kind: 'none', atMs: null });
  assert.equal(parseAfterStop('no tag'), null);
  const once = withAfterStopTag('[exit-time:bar] hit stop', { kind: 'entry', atMs: T0 });
  const twice = withAfterStopTag(once, v);
  assert.equal((twice.match(/\[after-stop:/g) ?? []).length, 1);
  assert.ok(twice.startsWith('[exit-time:bar] hit stop '));
  assert.equal(withAfterStopTag(null, { kind: 'none', atMs: null }), '[after-stop:none]');
});
t('afterStopLabel: "stopped · later reached T1 at HH:MM" (ET), date when on a later day', () => {
  assert.equal(afterStopLabel({ kind: 't1', atMs: T0 + 4 * M5 }, T0), 'stopped · later reached T1 at 10:20');
  assert.equal(afterStopLabel({ kind: 't1', atMs: T0 + 86_400_000 }, T0), 'stopped · later reached T1 at 10-06 10:00');
  assert.equal(afterStopLabel({ kind: 'entry', atMs: T0 }, T0), 'stopped · later back at entry 10:00');
  assert.equal(afterStopLabel({ kind: 'none', atMs: null }, T0), 'stopped · did not recover');
  assert.equal(afterStopLabel(null), null);
});
t('holdEndFor: a day idea ends at the close; exit_by and option expiry cut it', () => {
  const end = holdEndFor({ anchorMs: T0, publishedMs: T0, holdingPeriod: 'day', isOption: false });
  assert.ok(end > T0 && end <= Date.parse('2026-10-06T20:00:00Z'), new Date(end).toISOString());
  const cut = holdEndFor({ anchorMs: T0, publishedMs: T0, holdingPeriod: 'swing', exitBy: '2026-10-05T18:00:00Z', isOption: false });
  assert.equal(cut, Date.parse('2026-10-05T18:00:00Z'));
});

// ── track record: missed winners beside the record, never in it ────────────
t('countMissedWinners + computeTrackRecord: stop-outs stay losses; missed winners counted separately', () => {
  const ts = '2026-10-01T15:00:00Z';
  const base = { timestamp: ts, source: 'gex_scanner', assetType: 'stock', direction: 'long', entryPrice: 100, stopLoss: 99, targetPrice: 102 };
  const ideas: any[] = [
    { ...base, id: 'a', outcomeStatus: 'hit_stop', percentGain: -1, outcomeNotes: '[after-stop:t1@2026-10-01T17:00:00Z]' },
    { ...base, id: 'b', outcomeStatus: 'hit_stop', percentGain: -1, outcomeNotes: '[after-stop:entry@2026-10-01T16:00:00Z]' },
    { ...base, id: 'c', outcomeStatus: 'hit_stop', percentGain: -1, outcomeNotes: '[after-stop:none]' },
    { ...base, id: 'd', outcomeStatus: 'hit_stop', percentGain: -1, outcomeNotes: null },
    { ...base, id: 'e', outcomeStatus: 'hit_target', percentGain: 2, outcomeNotes: '[after-stop:t1]' },
  ];
  assert.deepEqual(countMissedWinners(ideas), { checked: 3, laterT1: 1, backToEntry: 1, pending: 1 });
  const rec = computeTrackRecord(ideas, {}, { nowMs: Date.parse('2026-10-07T20:00:00Z'), sampleFloor: 1 });
  assert.equal(rec.headline.losses, 4); // the T1-later stop-out is still a loss
  assert.equal(rec.headline.wins, 1);
  assert.equal(rec.missedWinners.laterT1, 1);
});

// ── walk-forward chooser ───────────────────────────────────────────────────
t('replayRule wide*: the further of the plan stop and k×ATR', () => {
  // long 100, plan stop 99.5, ATR 1 → wide1_5 stop 98.5 survives the 98.9 wick; plan does not.
  const bars = mk([[100, 100.2, 99.8, 100], [100, 100.1, 98.9, 99.2], [99.2, 102.2, 99.1, 102]]);
  const tr: RuleTrade = { dir: 'long', entry: 100, stop: 99.5, target: 102, atrD: 1, triggerMs: T0, holdEndMs: T0 + 99 * M5, holdComplete: true, bars };
  assert.equal(replayRule('plan', tr).reason, 'stop');
  assert.equal(replayRule('wide1_5', tr).reason, 'target');
  // structural further than k×ATR → same as plan
  const tr2 = { ...tr, stop: 98 };
  assert.equal(replayRule('wide1', tr2).pct, replayRule('plan', tr2).pct);
});
t('walkForward: picks the multiple that holds in BOTH halves with top trades removed', () => {
  const ideas: WfIdea[] = [];
  for (let k = 0; k < 80; k++) {
    // plan loses −1 half the time; wide1_5 converts every other loser to +1; wide2 helps only in the first half; wide1 never helps
    const lose = k % 2 === 0;
    const plan = lose ? -1 : 1;
    const w15 = lose && k % 4 === 0 ? 1 : plan;
    const w2 = k < 40 && lose ? 2 : plan - (lose ? 0.5 : 0);
    ideas.push({ id: String(k), triggerMs: T0 + k * 3_600_000, pcts: { plan, wide1: plan, wide1_5: w15, wide2: w2, atr1: plan, atr1_5: w15, atr2: plan, time_only: 3 } });
  }
  const w = walkForward(ideas, { topRemoved: 3, minPerHalf: 30 });
  assert.equal(w.n, 80); assert.equal(w.halves[0].n, 40);
  const row = (r: string) => w.rows.find((x) => x.rule === r)!;
  assert.equal(row('wide1_5').holdsBoth, true);
  assert.equal(row('wide2').holdsBoth, false);
  assert.equal(row('wide1').holdsBoth, false);
  assert.equal(row('time_only').adoptable, false); // reported, never chosen
  assert.equal(w.chosen.rule, 'wide1_5'); assert.equal(w.chosen.mult, 1.5);
  assert.match(renderWalkForward(w, { generatedAt: 'x', source: 'y' }), /BOT_STOP_ATR_MULT=1\.5/);
});
t('walkForward: too few ideas → 1.5× fallback, said so', () => {
  const w = walkForward([{ id: 'a', triggerMs: T0, pcts: { plan: 1, wide2: 2 } }], {});
  assert.equal(w.chosen.rule, null); assert.equal(w.chosen.mult, WF_FALLBACK_MULT);
  assert.match(w.chosen.basis, /not enough/);
});

// ── R-normalised walk-forward (equal-risk sizing) ──────────────────────────
t('riskPctFor: each variant sized to its own stop distance', () => {
  assert.equal(riskPctFor('plan', 1, 2), 1);
  assert.equal(riskPctFor('atr1_5', 1, 2), 3);
  assert.equal(riskPctFor('wide1', 3, 2), 3);   // structural further
  assert.equal(riskPctFor('wide2', 1, 2), 4);
  assert.equal(riskPctFor('time_only', 1, 2), 6); // disaster stop is the risk
  assert.equal(riskPctFor('hyb_n6', 1, 2), 3);
  assert.equal(riskPctFor('wide1_5', 1, null), null);
  assert.equal(riskPctFor('close_stop', 1, 2), null);
});
t('rStats: expectancy, ex-top, profit factor, max drawdown (chronological)', () => {
  const s = rStats([1, -1, -1, -1, 3, -1], 1);
  assert.equal(s.n, 6); assert.equal(s.expR, 0); assert.equal(s.sumR, 0);
  assert.equal(s.expRExTop, -0.6); // top (3) removed → (1−4)/5
  assert.equal(s.profitFactor, 1); assert.equal(s.maxDdR, 3);
  assert.equal(rStats([1, 2], 3).profitFactor, null);
  assert.equal(rStats([], 3).expR, null);
});
t('walkForwardR: a % loser can be an R winner at equal risk — and is only chosen if it holds in both halves', () => {
  // plan: 1% stop, T1 +2%: half the ideas −1% (−1R), half +2% (+2R) → E[R] +0.5.
  // wide1_5 (3% stop, ATR 2%): converts every other plan loser into a +2% winner, the rest lose −3% (−1R).
  //   unsized %: worse (−3% losers); in R: 3 of 4 trades ≈ +0.67R / −1R …
  const ideas: WfRIdea[] = [];
  for (let k = 0; k < 80; k++) {
    const lose = k % 2 === 0;
    const plan = lose ? -1 : 2;
    const w15 = lose ? (k % 4 === 0 ? 2 : -3) : 2;
    // wide2 helps only in half A
    const w2 = k < 40 ? (lose ? 2 : 2) : (lose ? -4 : 2);
    ideas.push({ id: String(k), triggerMs: T0 + k * 3_600_000, planRiskPct: 1, atrPct: 2, pcts: { plan, wide1: plan, wide1_5: w15, wide2: w2 } });
  }
  const w = walkForwardR(ideas, { topRemoved: 3, minPerHalf: 30 });
  const row = (r: string) => w.rows.find((x) => x.rule === r)!;
  // plan ex-top ≈ +0.43R; wide1_5: wins +0.667R, losers −1R → lower → must NOT hold
  assert.equal(row('wide1_5').holdsBoth, false);
  assert.equal(row('wide2').holdsBoth, false);   // half B fails
  assert.equal(row('hyb_n3').missing, true);     // not in this input
  assert.equal(w.chosen.mult, null);
  assert.match(renderWalkForwardR(w, 1.5), /R-chosen: none/);
  // now make wide1_5 clearly better in R in both halves
  const better = ideas.map((i) => ({ ...i, pcts: { ...i.pcts, wide1_5: i.pcts.plan! < 0 ? 4.5 : 4.5 } }));
  const w2r = walkForwardR(better, { topRemoved: 3, minPerHalf: 30 });
  assert.equal(w2r.chosen.rule, 'wide1_5'); assert.equal(w2r.chosen.mult, 1.5);
});
t('hybrid replay: plan stop early, wide later; trail locks gains', () => {
  // long 100, plan stop 99.5, ATR 1 → wide 98.5. Bar 1 dips to 99.4 (inside 3 bars → plan stop hit).
  const early = mk([[100, 100.2, 99.8, 100], [100, 100.1, 99.4, 99.6], [99.6, 102.2, 99.5, 102]]);
  const tr: RuleTrade = { dir: 'long', entry: 100, stop: 99.5, target: 102, atrD: 1, triggerMs: T0, holdEndMs: T0 + 99 * M5, holdComplete: true, bars: early };
  assert.equal(replayRule('hyb_n3', tr).reason, 'stop');
  // the same dip at bar 4 (after 3 bars) is inside the wide stop → target
  const late = mk([[100, 100.2, 99.8, 100], [100, 100.2, 99.8, 100], [100, 100.2, 99.8, 100], [100, 100.1, 99.0, 99.6], [99.6, 102.2, 99.5, 102]]);
  assert.equal(replayRule('hyb_n3', { ...tr, bars: late }).reason, 'target');
  assert.equal(replayRule('plan', { ...tr, bars: late }).reason, 'stop');
  // trail: run to 101.9 after bar 6, then fall → trail stop 100.4 (101.9 − 1.5) beats the wide 98.5
  const run = mk([...Array(6).fill([100, 100.2, 99.8, 100]), [100, 101.9, 100, 101.8], [101.8, 101.8, 100, 100.1]] as [number, number, number, number][]);
  const x = replayRule('hyb_trail6', { ...tr, bars: run });
  assert.equal(x.reason, 'stop'); assert.equal(x.pct, 0.4);
});

console.log(`✓ wide-stops: ${n} tests passed`);
