/**
 * Unit tests for sector-rotation ideas: the pure core
 * (shared/sector-rotation-ideas.ts) and the server build/fire path
 * (server/sector-rotation-ideas.ts) with every I/O read replaced by a seam —
 * no network, no DB, no shared-state or fire-log writes.
 *   npm run -s test:sector-rotation-ideas
 */
import assert from 'node:assert/strict';
import type { Chip, MemberRead, SectorRow } from '../shared/sector-board';
import type { LevelCluster } from '../shared/levels/level-math';
import {
  ROTATION_CFG, ROTATION_DATA_SOURCE, ROTATION_SOURCE, autoOrder, capState, catalystLine, chooseEntry, earningsWithin, horizonFor,
  isAutoEligible, nearestConfluent, pickByDelta, planLevels, readRotationEnv, sectorIgniting, selectCandidates, vehicleFor,
  type FireLogRow, type Suggestion,
} from '../shared/sector-rotation-ideas';
import { guardFor } from '../server/route-guards';
import { getIdeaSourceMeta } from '../shared/idea-sources';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

const chip = (key: string, state: Chip['state'], detail = ''): Chip => ({ key, label: key, state, detail, weight: 1 });
const member = (symbol: string, score: number | null, last = 100, chips: Chip[] = []): MemberRead => ({ symbol, last, r1: 0.5, r10: 3, relSector: 1, score, passed: 3, available: 5, chips, earnings: null });
const cons = (bull: number, bear: number, n = 9, extra: SectorRow['consensus']['signals'] = []) => ({ bull, bear, n, lean: bull > bear ? 'bull' as const : bear > bull ? 'bear' as const : 'mixed' as const, signals: extra });
function sector(id: string, rank: number, regime: SectorRow['regime'], leaders: MemberRead[], laggards: string[] = [], c = cons(6, 1)): SectorRow {
  return {
    id, label: id.toUpperCase(), etf: 'XLK', thematic: false, memberCount: leaders.length, membersRead: leaders.length,
    rank, rankThen: rank, rankDelta: 0, composite: 50, r1: 0, r3: 0, r10: 0, r20: 0, breadth: 60, highsPct: 10, lowsPct: 0,
    rs: 1, rsMomentum: 1, regime, side: regime === 'leading' || regime === 'improving' ? 'long' : 'short', stretch: 0, drawdown: 0,
    history: [], consensus: c, overnight: { driftPct: null, n: 0, flag: null, kind: null },
    leaders, laggards: laggards.map((s) => ({ symbol: s, relSector: -3, why: '' })), ideas: [],
  };
}
const cluster = (price: number, score: number, label = 'lvl'): LevelCluster => ({ price, low: price - 0.1, high: price + 0.1, members: [], kinds: [], families: [], score, label });
/** 60 daily closes: flat at `base`, then a ramp of `ramp` per session over the last k. */
const series = (base: number, ramp = 0, k = 10) => Array.from({ length: 60 }, (_, i) => base + (i >= 60 - k ? ramp * (i - (60 - k) + 1) : 0) + 0.05 * Math.sin(i));

async function main() {
  await t('source: sector_rotation is a canonical idea source', () => {
    const m = getIdeaSourceMeta(ROTATION_SOURCE);
    assert.equal(m.canonical, 'sector_rotation');
    assert.equal(m.label, 'Sector Rotation');
  });

  await t('candidates: long from Leading/Improving, short from Weakening/Lagging, leaders above the floor, one laggard, symbols once', () => {
    const sectors = [
      sector('semis', 1, 'leading', [member('NVDA', 90), member('AMD', 80), member('MU', 70), member('INTC', 30)], ['INTC']),
      sector('soft', 2, 'improving', [member('CRM', 40)], []), // leader under the floor → nothing
      sector('banks', 3, 'leading', [member('JPM', 75), member('NVDA', 95)], []), // NVDA already taken
      sector('energy', 9, 'lagging', [member('XOM', 85), member('CVX', 40)], ['CVX'], cons(1, 6)),
      sector('util', 8, 'weakening', [member('DUK', 55)], [], cons(2, 5)),
      sector('flat', 5, null, [member('ZZZ', 99)]),
    ];
    const c = selectCandidates(sectors);
    const syms = c.map((x) => x.symbol);
    assert.ok(syms.includes('NVDA') && syms.includes('AMD') && !syms.includes('MU'), 'two leaders per sector');
    assert.ok(syms.includes('INTC') && c.find((x) => x.symbol === 'INTC')!.kind === 'laggard');
    assert.ok(!syms.includes('CRM') && !syms.includes('ZZZ'));
    assert.equal(syms.filter((s) => s === 'NVDA').length, 1);
    assert.equal(c.find((x) => x.symbol === 'XOM')!.side, 'short');
    assert.equal(c.find((x) => x.symbol === 'XOM')!.consensus.with, 6);
    assert.equal(c.find((x) => x.symbol === 'CVX')!.kind, 'laggard');
    assert.equal(c[0].consensus.with, 6, 'highest consensus first');
    assert.ok(c.length <= ROTATION_CFG.maxSuggestions);
  });

  await t('igniting: intraday/daily ignition read igniting on the side → day horizon, stock vehicle', () => {
    const s = sector('semis', 1, 'leading', [member('NVDA', 90)], [], cons(6, 0, 9, [{ key: 'ign_intraday', label: 'Ignition intraday', lean: 'bull', detail: 'igniting long (read 14:05Z)' }]));
    assert.equal(sectorIgniting(s, 'long'), true);
    assert.equal(sectorIgniting(s, 'short'), false);
    assert.equal(horizonFor({ igniting: true }).horizon, 'day');
    assert.equal(horizonFor({ igniting: false }).horizon, 'swing');
    assert.equal(vehicleFor(150, 'day').kind, 'stock');
    assert.equal(vehicleFor(150, 'swing').kind, 'option');
    assert.equal(vehicleFor(6, 'swing').kind, 'stock');
  });

  await t('entry rule follows the chips: extended → pullback to EMA20; breakout printed → current; compression → breakout trigger; laggard → VWAP reclaim', () => {
    // extended: ramp of +2/session for 10 sessions on a $100 base, ATR 2
    const ext = chooseEntry({ side: 'long', kind: 'leader', closes: series(100, 2), atr: 2, vwap: null, chips: [chip('setup', 'pass', 'close above the prior 20-session high (breakout)')] })!;
    assert.equal(ext.rule, 'pullback_ema20');
    assert.ok(ext.entry < ext.last && ext.entry === ext.ema20);
    const brk = chooseEntry({ side: 'long', kind: 'leader', closes: series(100, 0.3), atr: 3, vwap: null, chips: [chip('setup', 'pass', 'close above the prior 20-session high (breakout)')] })!;
    assert.equal(brk.rule, 'current');
    assert.match(brk.text, /breakout already printed/);
    const flat = series(100, 0); flat[45] = 101.5; // a 20-session high just above
    const tight = chooseEntry({ side: 'long', kind: 'leader', closes: flat, atr: 2, vwap: null, chips: [chip('setup', 'pass', '10-session range 20% of the 55-session range (compression)')] })!;
    assert.equal(tight.rule, 'breakout_20d');
    assert.equal(tight.entry, tight.high20);
    assert.ok(tight.entry > tight.last);
    const far = series(100, 0); far[45] = 110; // high is 5× ATR away — no breakout trigger
    assert.notEqual(chooseEntry({ side: 'long', kind: 'leader', closes: far, atr: 2, vwap: null, chips: [chip('setup', 'pass', '(compression)')] })!.rule, 'breakout_20d');
    const lag = chooseEntry({ side: 'long', kind: 'laggard', closes: series(100, 0), price: 99, atr: 2, vwap: 100.4, chips: [] })!;
    assert.equal(lag.rule, 'vwap_reclaim');
    assert.equal(lag.entry, 100.4);
    assert.equal(chooseEntry({ side: 'long', kind: 'laggard', closes: series(100, 0), price: 101, atr: 2, vwap: 100.4, chips: [] })!.rule, 'current');
    // short mirror: a leader 1+ ATR below its EMA20 → rally to the EMA
    const sh = chooseEntry({ side: 'short', kind: 'leader', closes: series(100, -2), atr: 2, vwap: null, chips: [] })!;
    assert.equal(sh.rule, 'pullback_ema20');
    assert.ok(sh.entry > sh.last);
    assert.equal(chooseEntry({ side: 'long', kind: 'leader', closes: [1, 2, 3], atr: 1, vwap: null, chips: [] }), null);
  });

  await t('levels: stop beyond the nearest confluent support, ATR floor first, targets only closer, cap respected', () => {
    const clusters = [cluster(97, 2, 'prior-day low + VAL'), cluster(98.5, 1, 'single'), cluster(104, 3, 'call wall + PDH'), cluster(112, 2, 'weekly high')];
    assert.equal(nearestConfluent('long', 100, clusters)!.price, 97);
    assert.equal(nearestConfluent('short', 100, clusters)!.price, 104);
    const p = planLevels({ side: 'long', entry: 100, clusters, tolerance: 0.1, atr: 1, horizon: 'swing', maxTarget: null })!;
    assert.ok(p.stop < 96.9 && p.stop >= 96.8, `stop ${p.stop}`);
    assert.ok(Math.abs(100 - p.stop) >= 1.25 * 1);
    assert.equal(p.t1, 103.9, 'T1 snapped to the near edge of the 3-family cluster, closer than 2R (106.2)');
    assert.ok(p.rr >= 1);
    // no confluent support → 1.25× ATR stop; the floor is honoured
    const q = planLevels({ side: 'long', entry: 100, clusters: [], tolerance: 0.1, atr: 2, horizon: 'swing', maxTarget: null })!;
    assert.equal(q.stop, 97.5);
    assert.equal(q.t1, 105);
    assert.match(q.t1Basis, /formula/);
    // support hugging entry → widened to the floor
    const r = planLevels({ side: 'long', entry: 100, clusters: [cluster(99.6, 2)], tolerance: 0.1, atr: 2, horizon: 'swing', maxTarget: null })!;
    assert.ok(100 - r.stop >= 2.5 - 0.01, `floored ${r.stop}`);
    // expected-move cap bounds T1
    const c = planLevels({ side: 'long', entry: 100, clusters: [], tolerance: 0.1, atr: 2, horizon: 'swing', maxTarget: 103 })!;
    assert.ok(c.t1 <= 103 && c.capped);
    // short mirror
    const s = planLevels({ side: 'short', entry: 100, clusters, tolerance: 0.1, atr: 1, horizon: 'swing', maxTarget: null })!;
    assert.ok(s.stop > 104 && s.t1 < 100);
  });

  await t('earnings within 2 days blocks; caps; env default OFF with cap 4; auto eligibility ≥ 5 agreeing signals', () => {
    const now = Date.parse('2026-10-01T14:00:00Z');
    assert.ok(earningsWithin('2026-10-03', now));
    assert.ok(earningsWithin('2026-10-01', now));
    assert.equal(earningsWithin('2026-10-05', now), null);
    assert.equal(earningsWithin('2026-09-29', now), null);
    assert.deepEqual(capState(4, 4).ok, false);
    assert.equal(capState(1, 4).left, 3);
    assert.deepEqual(readRotationEnv({}), { auto: false, cap: 4 });
    assert.deepEqual(readRotationEnv({ SECTOR_ROTATION_IDEAS: 'true', SECTOR_ROTATION_MAX_PER_DAY: '2' }), { auto: true, cap: 2 });
    assert.deepEqual(readRotationEnv({ SECTOR_ROTATION_IDEAS: '1', SECTOR_ROTATION_MAX_PER_DAY: 'x' }), { auto: false, cap: 4 });
    assert.equal(isAutoEligible({ consensus: { with: 5, against: 0, n: 9 }, blocks: [] }), true);
    assert.equal(isAutoEligible({ consensus: { with: 4, against: 0, n: 9 }, blocks: [] }), false);
    assert.equal(isAutoEligible({ consensus: { with: 7, against: 0, n: 9 }, blocks: ['earnings'] }), false);
    const o = autoOrder([{ consensus: { with: 5, against: 0, n: 9 }, score: 60, rr: 2 }, { consensus: { with: 6, against: 0, n: 9 }, score: 80, rr: 1.5 }]);
    assert.equal(o[0].score, 80);
  });

  await t('contract pick: ~0.40Δ inside 21–45 DTE, never F, never 0DTE', () => {
    const p = pickByDelta([
      { dte: 0, delta: 0.4, grade: 'A', entryPremium: 1 },
      { dte: 30, delta: 0.55, grade: 'B', entryPremium: 3 },
      { dte: 35, delta: 0.38, grade: 'F', entryPremium: 2 },
      { dte: 40, delta: -0.42, grade: 'C', entryPremium: 2 },
      { dte: 60, delta: 0.4, grade: 'A', entryPremium: 2 },
    ]);
    assert.equal(p!.dte, 40);
    assert.equal(pickByDelta([{ dte: 7, delta: 0.4 }]), null);
  });

  // ── server: build + fire with seams ────────────────────────────────────
  const nowMs = Date.parse('2026-10-01T14:00:00Z'); // Thu 10:00 ET — inside the bot entry window
  const dayBars = series(100, 0.25, 12).map((c, i) => ({ time: Math.floor(Date.parse('2026-07-01T20:00:00Z') / 1000) + i * 86_400, open: c, high: c + 1, low: c - 1, close: c }));
  const deps = {
    nowMs,
    daily: async () => dayBars,
    levelMap: async () => ({ clusters: [cluster(100.2, 2, 'VWAP band + POC'), cluster(108.5, 3, 'call wall + weekly high')], tolerance: 0.1, atrDaily: 2, asOf: new Date(nowMs).toISOString() }),
    intraday: async () => ({ lastClose: 103, vwap: 102.5, lastBarAt: nowMs - 5 * 60_000 }),
    cap: async () => null,
    earnings: async () => null,
  };
  const cand = { key: 'semis|NVDA|long', sectorId: 'semis', sectorLabel: 'Compute semis', etf: 'SMH', regime: 'leading' as const, side: 'long' as const, rank: 1, consensus: { with: 6, against: 1, n: 9 }, igniting: false, kind: 'leader' as const, symbol: 'NVDA', score: 82, chips: [chip('trend', 'pass', 'above 20 EMA'), chip('gamma', 'pass', 'above zero-γ'), chip('flow', 'fail', '−$10k')], earnings: null };

  const { buildPlan, fireSuggestion, ideaFromSuggestion, firedTodayCount } = await import('../server/sector-rotation-ideas');
  let sug: Suggestion;
  await t('build: a stated plan — entry rule, structural stop beyond the floor, snapped T1, swing, option vehicle, measuring', async () => {
    sug = (await buildPlan(cand, deps))!;
    assert.ok(sug, 'plan built');
    if (process.env.DEBUG_ROT) console.log(JSON.stringify({ ...sug, chips: undefined, forward: undefined }, null, 1));
    assert.equal(sug.status, 'measuring');
    assert.equal(sug.horizon, 'swing');
    assert.equal(sug.vehicle.kind, 'option');
    assert.ok(sug.stop < sug.entry.entry && sug.entry.entry - sug.stop >= 1.25 * 2 - 0.01, `stop ${sug.stop} entry ${sug.entry.entry}`);
    assert.ok(sug.t1 > sug.entry.entry && sug.t1 <= 108.5);
    assert.ok(sug.rr > 0 && sug.blocks.length === (sug.rr < 1 ? 1 : 0));
    assert.equal(sug.autoEligible, sug.blocks.length === 0);
  });

  const writes: any[] = []; const logs: FireLogRow[] = [];
  const fireDeps = (over: Record<string, unknown> = {}) => ({
    ...deps, env: {}, rows: async () => [], openIdeas: async () => [], log: async (r: FireLogRow) => { logs.push(r); },
    confluence: async () => ({ passed: true, reason: '2 families' }),
    contract: async () => ({ pick: { optionType: 'call', strike: 105, expiry: '2026-11-06', dte: 36, delta: 0.41, entryPremium: 3.1 }, note: null }),
    write: async (idea: any) => { writes.push(idea); return 'idea-1'; },
    ...over,
  });

  await t('fire: passes every gate → createTradeIdea payload tagged sector_rotation, rotation:with, measuring, option ~0.40Δ', async () => {
    const r = await fireSuggestion(sug.key, { mode: 'manual', suggestion: { ...sug, rr: Math.max(sug.rr, 1.2) } }, fireDeps());
    if (!r.ok) assert.fail(`withheld: ${r.reason}`);
    assert.equal(r.ideaId, 'idea-1');
    const idea = writes[0];
    assert.equal(idea.source, 'sector_rotation');
    assert.ok(String(idea.dataSourceUsed).startsWith(ROTATION_DATA_SOURCE));
    assert.ok(idea.qualitySignals.includes('rotation:with') && idea.qualitySignals.includes('measuring'));
    assert.equal(idea.assetType, 'option');
    assert.equal(idea.optionDte, 36);
    assert.match(idea.catalyst, /^Sector rotation LONG — Compute semis leading \(consensus 6\/9\)/);
    assert.equal(idea.convergenceSignalsJson.sectorRotation.status, 'measuring');
    assert.equal(logs.at(-1)!.status, 'fired');
  });

  await t('fire: withheld on cap, earnings, open same-side idea, bot confluence, entry window, BTC-proxy short, option after the close', async () => {
    const one = async (over: Record<string, unknown>, s: Suggestion = sug, now = nowMs) => fireSuggestion(s.key, { mode: 'auto', suggestion: s }, { ...fireDeps(over), nowMs: now });
    let r = await one({ rows: async () => Array.from({ length: 4 }, () => ({ timestamp: new Date(nowMs - 3600_000).toISOString() })) });
    assert.match(r.reason!, /daily cap/);
    r = await one({ earnings: async () => '2026-10-02' });
    assert.match(r.reason!, /earnings 2026-10-02/);
    r = await one({ openIdeas: async () => [{ id: 'x', symbol: 'NVDA', direction: 'long', source: 'quant' }] });
    assert.match(r.reason!, /already held/);
    r = await one({ confluence: async () => ({ passed: false, reason: 'single-source' }) });
    assert.match(r.reason!, /bot rule 1/);
    r = await one({}, sug, Date.parse('2026-10-01T17:00:00Z')); // 13:00 ET — outside the default 09:30–11:30 window
    assert.match(r.reason!, /bot rule 2/);
    r = await one({}, { ...sug, key: 'crypto|MARA|short', symbol: 'MARA', side: 'short' });
    assert.ok(/BTC proxy/.test(r.reason!) || /re-plan/.test(r.reason!), r.reason!);
    const writesBefore = writes.length;
    r = await one({ env: { LOSS_RULE_BOT_ENTRY_WINDOW: 'off' } }, sug, Date.parse('2026-10-01T21:00:00Z')); // 17:00 ET
    assert.equal(r.ok, false);
    assert.equal(writes.length, writesBefore, 'nothing written on a refusal');
    assert.ok(logs.filter((l) => l.status === 'withheld').length >= 6, 'refusals are logged');
  });

  await t('fire: an unknown key is refused without a write', async () => {
    const r = await fireSuggestion('x|Y|long', { mode: 'manual', suggestion: null }, { ...fireDeps(), nowMs });
    // readRotation() may find nothing published in a test process
    assert.equal(r.ok, false);
  });

  await t('payload passes the write gate shape: long target > entry > stop, R:R ≥ 0.5, catalyst names its side', () => {
    const idea = ideaFromSuggestion({ ...sug, rr: 1.5 }, nowMs, 'manual', null, null);
    assert.ok(idea.targetPrice > idea.entryPrice && idea.stopLoss < idea.entryPrice);
    assert.ok((idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss) >= 0.5);
    assert.match(idea.catalyst, /\bLONG\b/);
    assert.equal(idea.assetType, 'stock');
    assert.match(catalystLine({ ...sug, side: 'short' }), /\bSHORT\b/);
    assert.equal(firedTodayCount([{ timestamp: new Date(nowMs - 3_600_000).toISOString() }, { timestamp: '2026-09-30T15:00:00Z' }], nowMs), 1);
  });

  await t('route guard: firing is operator-only; reading is not in the guard table', () => {
    assert.equal(guardFor('POST', '/api/sectors/rotation-ideas/fire'), 'operator');
    assert.equal(guardFor('POST', '/API/Sectors/Rotation-Ideas/Fire/'), 'operator');
    assert.equal(guardFor('GET', '/api/sectors/rotation-ideas'), null);
  });

  console.log(`sector-rotation-ideas: ${n} tests passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
