/**
 * Unit tests for fix/catch-leaders (2026-10-07):
 *   • shared/publish-rr.ts + server/lib/publish-plan.ts — plan first (ATR floor), then ≥ MIN_RR_PUBLISH
 *   • server/quant-ideas-generator.ts — no legacy-score publish filter, no 2R floor
 *   • shared/magnet-plan.ts + server/gex-magnet-actions.ts — rebuild a too-close magnet instead of rejecting
 *   • shared/catch-leaders-schedule.ts + heavy-gate quiet window — the new cadence
 *   • shared/leaders-detector.ts + server/leaders-scanner.ts — session leaders, every I/O behind a seam
 * No network, no DB, no file writes.
 *   npm run -s test:catch-leaders
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_RR_PUBLISH_DEFAULT, readMinRrPublish, rrPublishVerdict, rrToT1 } from '../shared/publish-rr';
import { floorAndGatePlan } from '../server/lib/publish-plan';
import { rebuildMagnetPlan } from '../shared/magnet-plan';
import { CATCH_SLOTS_CRON, CATCH_SLOTS_ET, LEADERS_SLOTS_CRON, LEADERS_SLOTS_ET, LEADER_SWING_SLOTS_CRON, cronFor } from '../shared/catch-leaders-schedule';
import { isDeferrableAtOpen, openQuietDeferMs } from '../server/lib/heavy-job-gate';
import {
  LEADERS_CFG, LEADERS_SOURCE, capCheck, dailyAtr14, findTrigger, planLeader, qualify, readLeadersEnv, readSession,
  type Bar5, type SessionRead,
} from '../shared/leaders-detector';
import { etWallToMs } from '../shared/loss-rules';
import { getIdeaSourceMeta } from '../shared/idea-sources';
import type { LevelCluster } from '../shared/levels/level-math';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

/** 20 daily bars with a constant true range `tr` around `px`. */
const dailyBars = (px: number, tr: number, k = 20) => Array.from({ length: k }, () => ({ high: px + tr / 2, low: px - tr / 2, close: px }));
const cluster = (price: number, score: number, label = 'lvl'): LevelCluster => ({ price, low: price - 0.05, high: price + 0.05, members: [], kinds: [], families: [], score, label });

// Session fixture: 2026-10-06 (Tue) + 3 prior sessions, 5-min RTH bars.
const D = (day: number, min: number) => etWallToMs(2026, 10, day, min);
function sessionBars(day: number, path: (i: number) => { o: number; h: number; l: number; c: number }, vol: (i: number) => number, nBars = 78): Bar5[] {
  return Array.from({ length: nBars }, (_, i) => ({ t: D(day, 570 + 5 * i), ...path(i), v: vol(i) }));
}
const flat = (px: number) => () => ({ o: px, h: px + 0.2, l: px - 0.2, c: px });

async function main() {
  // ── publish R:R ──
  await t('MIN_RR_PUBLISH: default 1.0, env override, clamp, junk → default', () => {
    assert.equal(MIN_RR_PUBLISH_DEFAULT, 1);
    assert.equal(readMinRrPublish({}), 1);
    assert.equal(readMinRrPublish({ MIN_RR_PUBLISH: '1.5' }), 1.5);
    assert.equal(readMinRrPublish({ MIN_RR_PUBLISH: '0.1' }), 0.5);
    assert.equal(readMinRrPublish({ MIN_RR_PUBLISH: '9' }), 5);
    assert.equal(readMinRrPublish({ MIN_RR_PUBLISH: 'abc' }), 1);
  });
  await t('rr verdict: 1.00 passes (incl. 0.998 under the hood), 0.99 refused, null refused', () => {
    assert.equal(rrPublishVerdict(1.0).ok, true);
    assert.equal(rrPublishVerdict(0.998).ok, true);
    assert.equal(rrPublishVerdict(0.99).ok, false);
    assert.match(rrPublishVerdict(0.99).reason!, /0\.99 < 1\.00/);
    assert.equal(rrPublishVerdict(null).ok, false);
    assert.equal(rrPublishVerdict(1.2, 1.5).ok, false);
    assert.equal(rrToT1(100, 95, 110), 2);
    assert.equal(rrToT1(100, 100, 110), null);
  });
  await t('floorAndGatePlan: tight stop widened to 1.25×ATR BEFORE R:R is read', () => {
    // ATR 4 → floor 5. Raw stop 99 (1 pt) with T1 108: raw R:R 8 would have passed a 2R floor.
    const v = floorAndGatePlan({ symbol: 'X', direction: 'long', entry: 100, stop: 99, target: 108 }, dailyBars(100, 4), 1);
    assert.equal(v.widened, true);
    assert.equal(v.stop, 95);
    assert.equal(v.rr, 1.6);
    assert.equal(v.ok, true);
    // Same plan, T1 104 → 0.8R on the honest stop → refused.
    const w = floorAndGatePlan({ symbol: 'X', direction: 'long', entry: 100, stop: 99, target: 104 }, dailyBars(100, 4), 1);
    assert.equal(w.ok, false);
    assert.match(w.reason!, /0\.80 < 1\.00/);
  });
  await t('floorAndGatePlan: AAOI/CRWD-style 1.00R plan with a stop already wider than the floor publishes', () => {
    const v = floorAndGatePlan({ symbol: 'AAOI', direction: 'long', entry: 126, stop: 116, target: 136 }, dailyBars(126, 6), 1);
    assert.equal(v.widened, false);
    assert.equal(v.rr, 1);
    assert.equal(v.ok, true);
  });
  await t('floorAndGatePlan: shorts floor upward; crypto keeps its stop; no bars keeps the stop', () => {
    const s = floorAndGatePlan({ symbol: 'ZS', direction: 'short', entry: 200, stop: 201, target: 190 }, dailyBars(200, 6), 1);
    assert.equal(s.stop, 207.5);
    assert.equal(s.ok, true); // 10 / 7.5 = 1.33R
    const c = floorAndGatePlan({ symbol: 'BTC', direction: 'long', entry: 100, stop: 99, target: 103, assetType: 'crypto' }, dailyBars(100, 4), 1);
    assert.equal(c.widened, false); assert.equal(c.stop, 99);
    const nb = floorAndGatePlan({ symbol: 'X', direction: 'long', entry: 100, stop: 99, target: 103 }, [], 1);
    assert.equal(nb.widened, false); assert.equal(nb.rr, 3);
  });
  await t('quant generator: legacy C-grade filter and 2R floor are gone; plan-then-gate is wired', () => {
    const src = readFileSync(new URL('../server/quant-ideas-generator.ts', import.meta.url), 'utf8');
    assert.ok(!/below minimum threshold/.test(src), 'C-grade publish filter still present');
    assert.ok(!/minRiskReward/.test(src), '2R floor still present');
    assert.ok(/informational only, not a publish gate/.test(src));
    assert.equal((src.match(/await gateQuantPlan\(/g) ?? []).length, 2, 'stock path + option re-plan both gated');
  });

  // ── GEX magnet ──
  await t('magnet: strike ≥ 1R on the floored stop → T1 = strike', () => {
    const r = rebuildMagnetPlan({ side: 'long', entry: 100, strike: 106, flooredStop: 95, levels: [], maxTarget: null, minRR: 1 });
    assert.ok(r.plan); assert.equal(r.plan!.target, 106); assert.equal(r.plan!.extended, false); assert.equal(r.plan!.rr, 1.2);
  });
  await t('magnet: AVGO case — strike 0.31R → T1 extended to the next mapped level beyond it', () => {
    // spot 367, ATR-floored stop 354 (13 pts), magnet 371 (4 pts = 0.31R); call wall 385 beyond.
    const r = rebuildMagnetPlan({
      side: 'long', entry: 367, strike: 371, flooredStop: 354, minRR: 1, maxTarget: null,
      levels: [cluster(375, 1, 'single'), cluster(380.5, 2, 'prior high + VAH'), { price: 385, score: 1, label: 'call wall 385' }],
    });
    assert.ok(r.plan);
    assert.equal(r.plan!.strikeRR, 0.31);
    assert.equal(r.plan!.target, 380.5); // first level ≥ 1R (13.5/13 = 1.04R); the score-1 375 cluster is skipped
    assert.equal(r.plan!.extended, true);
    assert.match(r.plan!.targetBasis, /beyond the \$371 magnet/);
  });
  await t('magnet: structural stop wider than the floor is used; no level ≥1R inside the cap → reject with reason', () => {
    const r = rebuildMagnetPlan({ side: 'long', entry: 100, strike: 103, flooredStop: 95, levels: [cluster(93, 2, 'PDL + VAL')], maxTarget: null, minRR: 1, tolerance: 0.2 });
    assert.equal(r.plan, null);
    assert.match(r.reason!, /no valid plan: magnet \$103 is 0\.42R on a \$92\.85 stop \(beyond PDL \+ VAL/);
    const capped = rebuildMagnetPlan({ side: 'long', entry: 100, strike: 102, flooredStop: 95, levels: [{ price: 108, score: 1, label: 'call wall 108' }], maxTarget: 104, minRR: 1 });
    assert.equal(capped.plan, null);
    assert.match(capped.reason!, /expected-move cap \$104/);
  });
  await t('magnet: short side mirrors', () => {
    const r = rebuildMagnetPlan({ side: 'short', entry: 100, strike: 98, flooredStop: 105, levels: [{ price: 94, score: 1, label: 'put wall 94' }], maxTarget: null, minRR: 1 });
    assert.ok(r.plan); assert.equal(r.plan!.target, 94); assert.equal(r.plan!.rr, 1.2);
  });
  await t('gex-magnet-actions: rebuildFromStructure merges the map, the row walls and the cap (seams)', async () => {
    const { rebuildFromStructure } = await import('../server/gex-magnet-actions');
    const r = await rebuildFromStructure({ symbol: 'AVGO', side: 'call', strike: 371, expiry: '2026-10-16' }, { callWall: 385, putWall: 350, zeroGamma: 360 }, 367, 354, 1, 'swing', {
      levelMap: async () => ({ clusters: [cluster(375, 1)], tolerance: 0.3 }), cap: async () => 400,
    });
    assert.ok(r.plan); assert.equal(r.plan!.target, 385);
    const none = await rebuildFromStructure({ symbol: 'AVGO', side: 'call', strike: 371, expiry: null }, { callWall: null, putWall: null, zeroGamma: null }, 367, 354, 1, 'swing', {
      levelMap: async () => null, cap: async () => null,
    });
    assert.equal(none.plan, null);
  });

  // ── cadence ──
  await t('schedule: catch-leaders slots and cron', () => {
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    assert.deepEqual(CATCH_SLOTS_ET.map(hhmm), ['08:45', '09:20', '09:35', '09:50', '10:05', '10:20', '10:40', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30']);
    assert.deepEqual(CATCH_SLOTS_CRON, ['45 8 * * 1-5', '20,35,50 9 * * 1-5', '5,20,40 10 * * 1-5', '0,30 11 * * 1-5', '0,30 12 * * 1-5', '0,30 13 * * 1-5', '0,30 14 * * 1-5', '0,30 15 * * 1-5']);
    assert.equal(hhmm(LEADERS_SLOTS_ET[0]), '09:52');
    assert.equal(hhmm(LEADERS_SLOTS_ET[LEADERS_SLOTS_ET.length - 1]), '15:32');
    assert.ok(LEADERS_SLOTS_ET.every((m) => m <= LEADERS_CFG.lastEntryEt), 'every leaders slot is inside the entry window');
    assert.deepEqual(LEADERS_SLOTS_CRON.slice(0, 2), ['52 9 * * 1-5', '7,22,42 10 * * 1-5']);
    assert.equal(LEADER_SWING_SLOTS_CRON[0], '49 8 * * 1-5');
    assert.deepEqual(cronFor([600, 605, 660]), ['0,5 10 * * 1-5', '0 11 * * 1-5']);
  });
  await t('schedule: open quiet window still defers quant / leaders / leader-swing; not the index lane', () => {
    for (const nm of ['producer:quant', 'producer:leaders', 'producer:leader-swing']) assert.equal(isDeferrableAtOpen(nm), true, nm);
    assert.equal(isDeferrableAtOpen('producer:index-0dte'), false);
    assert.equal(openQuietDeferMs('producer:quant', D(6, 9 * 60 + 35)), 10 * 60_000);
    assert.equal(openQuietDeferMs('producer:quant', D(6, 9 * 60 + 50)), 0);
    const sched = readFileSync(new URL('../server/idea-producer-schedule.ts', import.meta.url), 'utf8');
    assert.ok(!/'27,57 9-15/.test(sched), 'old :27/:57 quant cadence removed');
    assert.ok(/for \(const expr of CATCH_SLOTS_CRON\) cron\.schedule\(expr, quant, ET\)/.test(sched));
  });

  // ── leaders: pure core ──
  const ATR = 4; // daily
  // Prior sessions: flat 100, 1,000 shares per bar. Today: gap to 102, drive to ~106 on 2× volume.
  const priors = [1, 2, 5].flatMap((d) => sessionBars(d, flat(100), () => 1000));
  const todayPath = (i: number) => {
    const c = Math.min(106, 102 + i * 0.25);
    return { o: c - 0.2, h: c + 0.1, l: c - 0.3, c };
  };
  const todayBars = sessionBars(6, todayPath, () => 2000, 30); // through 12:00
  const nowMs = D(6, 12 * 60) + 1000;

  let read: SessionRead;
  await t('readSession: OR, VWAP, time-of-day RVOL, prior close', () => {
    read = readSession([...priors, ...todayBars], nowMs)!;
    assert.ok(read);
    assert.equal(read.throughMin, 12 * 60);
    assert.equal(read.rvol, 2);
    assert.equal(read.rvolSessions, 3);
    assert.equal(read.prevCloseFromBars, 100);
    assert.equal(read.orHigh, 102.6); // first 15 min: bars 0–2, c 102.0/102.25/102.5, h +0.1
    assert.ok(read.vwap > 103 && read.vwap < 106);
    // Before the OR completes → null.
    assert.equal(readSession([...priors, ...todayBars], D(6, 9 * 60 + 44)), null);
  });
  await t('qualify: all five checks; each one can fail it', () => {
    const ok = qualify({ symbol: 'X', prevClose: 100, atr: ATR, read, regime: 'leading', sectorLabel: 'Semis' });
    assert.equal(ok.ok, true, ok.reason ?? '');
    assert.equal(ok.side, 'long');
    assert.equal(ok.threshold, 3); // min(3, 2 × 4%)
    assert.equal(qualify({ symbol: 'X', prevClose: 100, atr: ATR, read, regime: 'lagging' }).ok, false);
    assert.equal(qualify({ symbol: 'X', prevClose: 100, atr: ATR, read, regime: null }).ok, false);
    assert.equal(qualify({ symbol: 'X', prevClose: 104, atr: ATR, read, regime: 'leading' }).ok, false); // +1.9%
    // Low-vol name: ATR 1% → 2×ATR% = 2% threshold admits a +2.5% move.
    const low = qualify({ symbol: 'Y', prevClose: 103.4, atr: 1.034, read, regime: 'improving' });
    assert.equal(low.threshold, 2);
    assert.equal(low.checks.find((c) => c.key === 'move')!.pass, true);
    const thin = { ...read, rvol: 1.2 };
    assert.match(qualify({ symbol: 'X', prevClose: 100, atr: ATR, read: thin, regime: 'leading' }).reason!, /rvol: 1\.20×/);
    const under = { ...read, last: read.vwap - 0.1 };
    assert.equal(qualify({ symbol: 'X', prevClose: 100, atr: ATR, read: under, regime: 'leading' }).checks.find((c) => c.key === 'vwap')!.pass, false);
    // Shorts need Weakening.
    const down = { ...read, last: 96, vwap: 97, orLow: 97.5 };
    assert.equal(qualify({ symbol: 'Z', prevClose: 100, atr: ATR, read: down, regime: 'weakening' }).ok, true);
    assert.equal(qualify({ symbol: 'Z', prevClose: 100, atr: ATR, read: down, regime: 'leading' }).ok, false);
  });
  await t('findTrigger: continuation, retest, extended, none', () => {
    // Continuation: last close above the prior high, within 1 ATR of VWAP.
    const cont = { ...read, lastBar: { ...read.lastBar, o: 105.5, c: 106.3, h: 106.4, l: 105.4 }, last: 106.3, hodPrior: 106.1, vwap: 104.5 };
    const c = findTrigger('long', cont, ATR);
    assert.equal(c.trigger?.rule, 'continuation');
    assert.equal(c.trigger?.defendedLabel, 'VWAP');
    // Extended: 2 ATR above VWAP.
    const ext = { ...cont, vwap: 98 };
    const e = findTrigger('long', ext, ATR);
    assert.equal(e.trigger, null); assert.match(e.watching, /^extended/);
    // Retest: a recent bar tagged VWAP, last bar green and above it.
    const rb = (lo: number, c2: number): Bar5 => ({ t: 0, o: c2 - 0.3, h: c2 + 0.1, l: lo, c: c2, v: 1 });
    const re = { ...read, vwap: 104, hodPrior: 107, closed: [...read.closed.slice(0, -3), rb(104.6, 105), rb(104.1, 104.5), rb(104.3, 104.9)], lastBar: rb(104.3, 104.9), last: 104.9 };
    const r = findTrigger('long', re, ATR);
    assert.equal(r.trigger?.rule, 'vwap_retest');
    assert.equal(r.trigger?.entry, 104.9);
    // None: below the prior high, no retest.
    const none = { ...read, vwap: 100, hodPrior: 107, lastBar: rb(105.5, 105.9), last: 105.9, closed: [...read.closed.slice(0, -1), rb(105.5, 105.9)] };
    assert.match(findTrigger('long', none, ATR).watching, /^no trigger yet/);
  });
  await t('planLeader: stop = further of structure and 1.25×ATR; T1 snapped; refused under 1R', () => {
    const trig = { rule: 'continuation' as const, entry: 106, defended: 104.5, defendedLabel: 'VWAP', text: '' };
    const p = planLeader({ side: 'long', trigger: trig, atr: ATR, clusters: [], tolerance: 0.1, maxTarget: null, minRR: 1 });
    assert.ok(p.plan, p.reason ?? '');
    assert.equal(p.plan!.stop, 101); // 1.25 × 4 = 5 below entry (wider than VWAP − pad 104.1)
    assert.equal(p.plan!.t1, 116);   // 2R formula, no structure mapped
    assert.equal(p.plan!.rr, 2);
    // Expected-move cap at 109 → 0.6R → refused.
    const capped = planLeader({ side: 'long', trigger: trig, atr: ATR, clusters: [], tolerance: 0.1, maxTarget: 109, minRR: 1 });
    assert.equal(capped.plan, null);
    assert.match(capped.reason!, /0\.60R/);
  });
  await t('caps + env + ATR helper + source meta', () => {
    assert.deepEqual(readLeadersEnv({}), { enabled: true, cap: 6 });
    assert.deepEqual(readLeadersEnv({ LEADERS_IDEAS: 'false', LEADERS_MAX_PER_DAY: '3' }), { enabled: false, cap: 3 });
    assert.equal(capCheck('A', 'long', { publishedToday: 6, keys: new Set() }, 6).ok, false);
    assert.equal(capCheck('A', 'long', { publishedToday: 1, keys: new Set(['A|long']) }, 6).ok, false);
    assert.equal(capCheck('A', 'short', { publishedToday: 1, keys: new Set(['A|long']) }, 6).ok, true);
    assert.equal(dailyAtr14(Array.from({ length: 16 }, () => ({ high: 102, low: 98, close: 100 }))), 4);
    assert.equal(getIdeaSourceMeta(LEADERS_SOURCE).label, 'Session Leaders');
  });

  // ── leaders: the pass, all seams ──
  await t('runLeadersScan: publishes the qualified leader, withholds the rest with reasons, honours caps', async () => {
    const { runLeadersScan, __resetLeadersDay, pickSector } = await import('../server/leaders-scanner');
    __resetLeadersDay();
    const contBars = sessionBars(6, (i) => {
      const c = i < 29 ? Math.min(105.6, 102 + i * 0.2) : 106.2; // last bar breaks the prior high
      return { o: c - 0.2, h: i < 29 ? c + 0.1 : 106.3, l: c - 0.3, c };
    }, () => 2000, 30);
    const quiet = sessionBars(6, flat(100.5), () => 1000, 30);
    const all = new Map<string, Bar5[]>([['LEAD', [...priors, ...contBars]], ['QUIET', [...priors, ...quiet]], ['LAG', [...priors, ...contBars]]]);
    const written: any[] = []; const logs: any[] = [];
    const res = await runLeadersScan({
      nowMs, env: {},
      universe: async () => ['LEAD', 'QUIET', 'LAG'],
      sectors: async () => new Map([['LEAD', [{ id: 'semis', label: 'Semis', regime: 'leading', rank: 1 }]], ['LAG', [{ id: 'retail', label: 'Retail', regime: 'lagging', rank: 20 }]]]),
      daily: async (syms) => new Map(syms.map((s) => [s, { prevClose: 100, atr: ATR }])),
      bars5m: async (syms, startMs) => new Map(syms.map((s) => [s, all.get(s)!.filter((b) => b.t >= startMs)])),
      levelMap: async () => null, cap: async () => null, earnings: async () => null,
      openIdeas: async () => [], publishedToday: async () => [],
      contract: async () => ({ pick: null, note: 'test: no chain' }),
      write: async (idea) => { written.push(idea); return 'id-1'; },
      log: async (row) => { logs.push(row); },
    });
    assert.equal(res.published, 1);
    assert.equal(written.length, 1);
    const idea = written[0];
    assert.equal(idea.symbol, 'LEAD'); assert.equal(idea.source, 'leaders'); assert.equal(idea.direction, 'long');
    assert.equal(idea.assetType, 'stock'); // no contract passed → stock
    assert.ok(idea.qualitySignals.includes('measuring'));
    assert.equal(idea.entryPrice, 106.2);
    assert.ok(idea.stopLoss <= 106.2 - 1.25 * ATR + 1e-9);
    assert.ok((idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss) >= 1 - 1e-9);
    const byS = new Map(logs.map((l) => [l.symbol, l]));
    assert.equal(byS.get('LEAD').status, 'published');
    assert.equal(byS.get('LAG').status, 'withheld'); assert.match(byS.get('LAG').reason, /sector: Retail reads lagging/);
    assert.ok(!byS.has('QUIET') || byS.get('QUIET').stage === 'prefilter');
    // Second pass the same day: one per symbol/side/day.
    const res2 = await runLeadersScan({
      nowMs: nowMs + 15 * 60_000, env: {},
      universe: async () => ['LEAD'], sectors: async () => new Map([['LEAD', [{ id: 'semis', label: 'Semis', regime: 'leading', rank: 1 }]]]),
      daily: async (syms) => new Map(syms.map((s) => [s, { prevClose: 100, atr: ATR }])),
      bars5m: async (syms, startMs) => new Map(syms.map((s) => [s, all.get(s)!.filter((b) => b.t >= startMs)])),
      levelMap: async () => null, cap: async () => null, earnings: async () => null, openIdeas: async () => [], publishedToday: async () => [],
      write: async () => { throw new Error('must not write'); }, log: async (row) => { logs.push(row); },
    });
    assert.equal(res2.published, 0);
    // pickSector prefers a passing group.
    assert.equal(pickSector([{ id: 'a', label: 'A', regime: 'lagging', rank: 2 }, { id: 'b', label: 'B', regime: 'improving', rank: 9 }], 'long')!.id, 'b');
  });
  await t('runLeadersScan: earnings, already-held and the daily cap withhold; disabled / pre-OR no-op', async () => {
    const { runLeadersScan, __resetLeadersDay } = await import('../server/leaders-scanner');
    const contBars = sessionBars(6, (i) => { const c = i < 29 ? Math.min(105.6, 102 + i * 0.2) : 106.2; return { o: c - 0.2, h: i < 29 ? c + 0.1 : 106.3, l: c - 0.3, c }; }, () => 2000, 30);
    const base = {
      nowMs, env: {} as Record<string, string>,
      universe: async () => ['LEAD'], sectors: async () => new Map([['LEAD', [{ id: 'semis', label: 'Semis', regime: 'leading', rank: 1 }]]]),
      daily: async (syms: string[]) => new Map(syms.map((s) => [s, { prevClose: 100, atr: ATR }])),
      bars5m: async (syms: string[], startMs: number) => new Map(syms.map((s) => [s, [...priors, ...contBars].filter((b) => b.t >= startMs)])),
      levelMap: async () => null, cap: async () => null, openIdeas: async () => [], publishedToday: async () => [],
      write: async () => 'x', log: async () => {},
    };
    __resetLeadersDay();
    const rows1 = (await runLeadersScan({ ...base, earnings: async () => '2026-10-07' })).rows;
    assert.match(rows1.find((r) => r.symbol === 'LEAD')!.reason!, /earnings/i);
    __resetLeadersDay();
    const rows2 = (await runLeadersScan({ ...base, earnings: async () => null, openIdeas: async () => [{ id: 'o1', symbol: 'LEAD', direction: 'long', source: 'quant' }] })).rows;
    assert.match(rows2[0].reason!, /already held/);
    __resetLeadersDay();
    const rows3 = (await runLeadersScan({ ...base, earnings: async () => null, publishedToday: async () => Array.from({ length: 6 }, (_, i) => ({ symbol: `S${i}`, direction: 'long' })) })).rows;
    assert.match(rows3[0].reason!, /daily cap/);
    __resetLeadersDay();
    assert.equal((await runLeadersScan({ ...base, env: { LEADERS_IDEAS: 'false' } })).universe, 0);
    assert.equal((await runLeadersScan({ ...base, nowMs: D(6, 9 * 60 + 40) })).universe, 0);
  });

  console.log(`✓ catch-leaders: ${n} tests passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
