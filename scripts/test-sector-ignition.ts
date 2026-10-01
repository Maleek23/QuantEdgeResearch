/**
 * Unit tests for shared/sector-ignition.ts (pure core) on synthetic bars and
 * flow: each horizon's stage logic (both sides), laggard selection, the
 * theme-leverage "breaking down" exclusion, idea vehicles and caps.
 *   npm run -s test:sector-ignition
 */
import assert from 'node:assert/strict';
import {
  IGNITION_CFG, breadthAboveMa, ideaCapCheck, ideaVehicles, ignitionGroups, intradayMemberFromBars, pickStructuralTargets, quadrantOf,
  rrgSeries, scoreDaily, scoreIntraday, scoreSwing, scoreWeekly, selectLeadersLaggards, shouldLogTransition, sortGroupReads,
  type DailyMember, type GroupRead, type IdeaCapState, type IntradayMember, type SwingMember,
} from '../shared/sector-ignition';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };
const G = { groupId: 'compute_semis', label: 'compute-semis', etf: 'SMH' };

// ── groups ────────────────────────────────────────────────────────────────
t('groups come from sector-peers, ETF-backed only, capped, ETF excluded', () => {
  const gs = ignitionGroups();
  assert.ok(gs.length > 20);
  assert.ok(gs.every((g) => g.etf && g.members.length <= IGNITION_CFG.maxMembersPerGroup && !g.members.includes(g.etf)));
  assert.ok(!gs.some((g) => g.groupId === 'us_indices'));
  assert.ok(gs.some((g) => g.etf === 'CIBR') && gs.some((g) => g.etf === 'IGV') && gs.some((g) => g.etf === 'SMH'));
});

// ── intraday ──────────────────────────────────────────────────────────────
const im = (symbol: string, movePct: number, above: boolean, orBreak: 'up' | 'down' | null, net: number | null, gap = 0.6): IntradayMember => ({
  symbol, movePct, last: 100 + movePct, vwap: above ? 99 + movePct : 101 + movePct, orHigh: 101, orLow: 99, orBreak, netPremium30m: net, gapPct: gap,
});

t('intraday: breadth + ETF vs SPY + ORB + flow cluster + gap → igniting long', () => {
  const r = scoreIntraday({ ...G, etfMovePct: 1.0, spyMovePct: 0.2, members: [
    im('NVDA', 1.4, true, 'up', 200_000), im('AMD', 1.1, true, 'up', 120_000), im('AVGO', 0.9, true, 'up', 80_000),
    im('MRVL', 0.2, true, null, 60_000), im('ARM', 0.1, false, null, 0),
  ] });
  assert.equal(r.side, 'long');
  assert.equal(r.stage, 'igniting', r.why.join(' | '));
  assert.equal(r.breadthPct, 80);
  assert.equal(r.flowCount, 4);
  assert.ok(r.points >= IGNITION_CFG.intraday.pointsIgnite);
});

t('intraday: mirrored tape ignites SHORT on equal footing', () => {
  const r = scoreIntraday({ ...G, etfMovePct: -1.0, spyMovePct: -0.2, members: [
    im('NVDA', -1.4, false, 'down', -200_000, -0.7), im('AMD', -1.1, false, 'down', -120_000, -0.7), im('AVGO', -0.9, false, 'down', -80_000, -0.7),
    im('MRVL', -0.2, false, null, -60_000, -0.7), im('ARM', -0.1, true, null, 0, -0.7),
  ] });
  assert.equal(r.side, 'short');
  assert.equal(r.stage, 'igniting', r.why.join(' | '));
});

t('intraday: breadth without the ETF outperforming → stirring, not igniting', () => {
  const r = scoreIntraday({ ...G, etfMovePct: 0.35, spyMovePct: 0.2, members: [
    im('NVDA', 0.4, true, 'up', null), im('AMD', 0.3, true, null, null), im('AVGO', 0.2, true, null, null), im('MRVL', 0.1, true, null, null),
  ] });
  assert.notEqual(r.stage, 'igniting');
  assert.equal(r.flowCount, null, 'no flow read is null, never 0');
  assert.ok(r.why.some((w) => w.includes('no flow read')));
});

t('intraday: ETF far ahead of SPY → extended (never an entry)', () => {
  const r = scoreIntraday({ ...G, etfMovePct: 2.4, spyMovePct: 0.3, members: [im('NVDA', 3, true, 'up', 1e6), im('AMD', 2.5, true, 'up', 1e6), im('AVGO', 2, true, 'up', 1e6)] });
  assert.equal(r.stage, 'extended');
  assert.deepEqual(ideaVehicles(r), []);
});

t('intraday: < 3 members read → quiet, not staged', () => {
  const r = scoreIntraday({ ...G, etfMovePct: 1, spyMovePct: 0, members: [im('NVDA', 1, true, 'up', 1e6), { ...im('AMD', 0, true, null, null), movePct: null }] });
  assert.equal(r.stage, 'quiet');
});

t('intraday: pre-market group gap is the leading gap when recorded', () => {
  const base = { ...G, etfMovePct: 0.6, spyMovePct: 0.0, members: [im('NVDA', 0.6, true, null, null, 0), im('AMD', 0.5, true, null, null, 0), im('AVGO', 0.4, true, null, null, 0), im('MRVL', 0.4, true, null, null, 0)] };
  const without = scoreIntraday(base);
  const withPm = scoreIntraday({ ...base, pmGapPct: 0.9 });
  assert.equal(withPm.metrics.gapBasis, 'pre-market');
  assert.ok(withPm.points > without.points);
  assert.equal(withPm.stage, 'igniting', withPm.why.join(' | '));
});

t('intraday member read from 5m bars: VWAP, OR15, ORB, gap, move', () => {
  const t0 = Date.UTC(2026, 8, 30, 13, 30);
  const bars = [0, 1, 2, 3, 4, 5].map((k) => ({ t: t0 + k * 300_000, o: 100 + k * 0.2, h: 100.3 + k * 0.2, l: 99.9 + k * 0.2, c: 100.2 + k * 0.2, v: 1000 }));
  const m = intradayMemberFromBars('X', bars, 99, t0 + 6 * 300_000);
  assert.equal(m.orHigh, 100.3 + 0.4);
  assert.equal(m.orBreak, 'up');
  assert.ok(m.gapPct! > 1 && m.movePct! > 1 && m.vwap! < m.last!);
});

// ── laggards ──────────────────────────────────────────────────────────────
t('laggards: carry a group signal, ≤ half the ETF move; leaders moved ≥ ETF', () => {
  const r = selectLeadersLaggards([
    { symbol: 'A', movePct: 2.0, signals: ['above VWAP'] },
    { symbol: 'B', movePct: 0.3, signals: ['above VWAP', 'call flow'] },
    { symbol: 'C', movePct: 0.2, signals: [] },
    { symbol: 'D', movePct: 0.8, signals: ['ORB'] },
  ], 1.0, 'long');
  assert.deepEqual(r.leaders.map((x) => x.symbol), ['A']);
  assert.deepEqual(r.laggards.map((x) => x.symbol), ['B'], 'C has no signal, D moved > half the ETF');
});

t('laggards: theme-leverage "breaking down" is excluded; catch-up score ranks', () => {
  const lev = (catchUpScore: number, breakingDown: boolean) => ({ beta: 1.5, rSquared: 0.6, residualPct: -5, catchUpScore, breakingDown, decoupling: false });
  const r = selectLeadersLaggards([
    { symbol: 'X', movePct: 0.1, signals: ['s'], leverage: lev(40, false) },
    { symbol: 'Y', movePct: 0.0, signals: ['s'], leverage: lev(90, true) },
    { symbol: 'Z', movePct: 0.2, signals: ['s'], leverage: lev(70, false) },
  ], 2, 'long');
  assert.deepEqual(r.laggards.map((x) => x.symbol), ['Z', 'X']);
});

t('laggards: a member moving hard against the group is left behind, not a laggard', () => {
  const r = selectLeadersLaggards([
    { symbol: 'SNDK', movePct: -2.5, signals: ['call flow'] },
    { symbol: 'STX', movePct: -0.4, signals: ['call flow'] },
    { symbol: 'MRVL', movePct: 0.3, signals: ['above VWAP'] },
  ], 2, 'long');
  assert.deepEqual(r.laggards.map((x) => x.symbol).sort(), ['MRVL', 'STX'], 'SNDK -2.5% vs ETF +2% is below the -1% floor');
});

t('laggards short side: members that have not fallen', () => {
  const r = selectLeadersLaggards([{ symbol: 'A', movePct: -2, signals: ['below VWAP'] }, { symbol: 'B', movePct: -0.1, signals: ['below VWAP'] }], -1, 'short');
  assert.deepEqual(r.leaders.map((x) => x.symbol), ['A']);
  assert.deepEqual(r.laggards.map((x) => x.symbol), ['B']);
});

// ── daily ─────────────────────────────────────────────────────────────────
const dm = (symbol: string, gapPct: number | null, movePct: number | null, orBreak: 'up' | 'down' | null, aboveVwap: boolean | null): DailyMember => ({ symbol, gapPct, movePct, orBreak, aboveVwap });

t('daily pre-market: gap breadth can only reach stirring (the open must confirm)', () => {
  const r = scoreDaily({ ...G, phase: 'premarket', etfGapPct: 1.2, etfMovePct: null, spyMovePct: null, members: [dm('A', 1.5, null, null, null), dm('B', 1.1, null, null, null), dm('C', 0.9, null, null, null), dm('D', 0.2, null, null, null)] });
  assert.equal(r.stage, 'stirring');
  assert.equal(r.side, 'long');
});

t('daily first hour: gap breadth + ORB breadth + rel → igniting', () => {
  const r = scoreDaily({ ...G, phase: 'first_hour', etfGapPct: 0.8, etfMovePct: 0.9, spyMovePct: 0.2, members: [dm('A', 1, 1.2, 'up', true), dm('B', 0.8, 0.6, 'up', true), dm('C', 0.7, 0.4, 'up', true), dm('D', 0.1, 0.1, null, false)] });
  assert.equal(r.stage, 'igniting', r.why.join(' | '));
});

t('daily close: held into the close → igniting; faded → quiet', () => {
  const mem = [dm('A', 1, 1.2, 'up', true), dm('B', 0.8, 0.6, 'up', true), dm('C', 0.7, 0.4, 'up', true), dm('D', 0.1, 0.1, null, false)];
  const held = scoreDaily({ ...G, phase: 'close', etfGapPct: 0.8, etfMovePct: 1.0, spyMovePct: 0.3, etfCloseLocation: 0.85, members: mem });
  assert.equal(held.stage, 'igniting');
  const faded = scoreDaily({ ...G, phase: 'close', etfGapPct: 0.8, etfMovePct: -0.4, spyMovePct: 0.3, etfCloseLocation: 0.2, members: mem.map((m) => ({ ...m, aboveVwap: false, movePct: -0.3 })) });
  assert.notEqual(faded.stage, 'igniting');
});

// ── swing ─────────────────────────────────────────────────────────────────
const series = (n: number, f: (k: number) => number) => Array.from({ length: n }, (_, k) => f(k));

t('swing: RS line turns up + breadth thrust from < 40% to ≥ 70% → igniting', () => {
  const N = 40;
  const spy = series(N, () => 100);
  // ETF lags SPY for the prior 10 sessions, then turns up over the last 5.
  const etf = series(N, (k) => (k < N - 5 ? 100 - (k - (N - 16)) * 0.1 * (k >= N - 16 ? 1 : 0) : 99 + (k - (N - 6)) * 0.6));
  // Members: below their 10d MA until 3 sessions ago, then ramp above.
  const mk = (s: string, lag = 0): SwingMember => ({ symbol: s, closes: series(N, (k) => (k < N - 3 ? 50 - k * 0.05 : 50 + (k - (N - 4)) * (2 - lag))) });
  const members = [mk('A'), mk('B'), mk('C'), mk('D', 1.9)];
  const bNow = breadthAboveMa(members, 10, 0, 'long');
  const bOld = breadthAboveMa(members, 10, 5, 'long');
  assert.ok(bNow! >= 70 && bOld! < 40, `breadth now ${bNow} then ${bOld}`);
  const r = scoreSwing({ ...G, etfCloses: etf, spyCloses: spy, members, flowDays: { long: 1, short: 0 } });
  assert.equal(r.side, 'long');
  assert.equal(r.metrics.rsTurn, true, JSON.stringify(r.metrics));
  assert.equal(r.metrics.thrust, true);
  assert.equal(r.stage, 'igniting', r.why.join(' | '));
});

t('swing: RS already up 10%+ vs SPY → extended', () => {
  const N = 40;
  const r = scoreSwing({ ...G, etfCloses: series(N, (k) => 100 * (1 + 0.012 * k)), spyCloses: series(N, () => 100), members: ['A', 'B', 'C'].map((s) => ({ symbol: s, closes: series(N, (k) => 50 + k) })) });
  assert.equal(r.stage, 'extended');
});

t('swing: flat RS → quiet', () => {
  const N = 40;
  const r = scoreSwing({ ...G, etfCloses: series(N, () => 100), spyCloses: series(N, () => 100), members: ['A', 'B', 'C'].map((s) => ({ symbol: s, closes: series(N, () => 50) })) });
  assert.equal(r.stage, 'quiet');
});

// ── weekly (RRG) ──────────────────────────────────────────────────────────
t('RRG quadrants', () => {
  assert.equal(quadrantOf(101, 101), 'leading');
  assert.equal(quadrantOf(101, 99), 'weakening');
  assert.equal(quadrantOf(99, 99), 'lagging');
  assert.equal(quadrantOf(99, 101), 'improving');
});

t('weekly: lagging → improving transition with rising momentum → igniting long', () => {
  const N = 120;
  const spy = series(N, () => 100);
  // Long decline vs SPY, then a turn in the last ~8 sessions.
  const etf = series(N, (k) => (k < N - 8 ? 100 - k * 0.15 : 100 - (N - 8) * 0.15 + (k - (N - 8)) * 0.35));
  const rr = rrgSeries(etf, spy);
  assert.equal(rr[rr.length - 1].quadrant, 'improving', `path ${rr.slice(-12).map((x) => x.quadrant).join(',')}`);
  const r = scoreWeekly({ ...G, etfCloses: etf, spyCloses: spy, members: ['A', 'B', 'C'].map((s) => ({ symbol: s, closes: series(N, (k) => 50 + k * 0.01) })) });
  assert.equal(r.stage, 'igniting', r.why.join(' | '));
  assert.equal(r.side, 'long');
  assert.deepEqual(ideaVehicles(r), [], 'weekly never auto-trades');
});

t('weekly: leading for 4+ weeks → extended', () => {
  const N = 140;
  const r = scoreWeekly({ ...G, etfCloses: series(N, (k) => 100 * Math.exp(0.00008 * k * k)), spyCloses: series(N, () => 100), members: [] });
  assert.equal(r.stage, 'extended', r.why.join(' | '));
});

// ── ideas: vehicles + caps ────────────────────────────────────────────────
const ign = (horizon: GroupRead['horizon']): GroupRead => ({
  groupId: 'g', label: 'g', etf: 'SMH', horizon, stage: 'igniting', side: 'long', points: 3, etfMovePct: 1, relPct: 0.8, breadthPct: 80, flowCount: 3, membersRead: 5,
  metrics: {}, leaders: [{ symbol: 'NVDA', movePct: 2, note: '' }], laggards: [{ symbol: 'MRVL', movePct: 0.2, note: '' }, { symbol: 'ARM', movePct: 0.1, note: '' }], levels: [], why: [], status: 'measuring',
});

t('vehicles: intraday = best laggard + ETF; daily = laggards then leader; swing = laggards; ≤2', () => {
  assert.deepEqual(ideaVehicles(ign('intraday')), ['MRVL', 'SMH']);
  assert.deepEqual(ideaVehicles(ign('daily')), ['MRVL', 'ARM']);
  assert.deepEqual(ideaVehicles(ign('swing')), ['MRVL', 'ARM']);
  assert.deepEqual(ideaVehicles({ ...ign('intraday'), stage: 'stirring' }), []);
});

t('caps: per-day, per-group, per-symbol, open-idea dedupe, weekly never trades', () => {
  const st = (): IdeaCapState => ({ perGroup: {}, emittedToday: 0, open: [], emittedSymbols: new Set() });
  assert.equal(ideaCapCheck('intraday', 'g', 'NVDA', 'long', st()).ok, true);
  assert.equal(ideaCapCheck('weekly', 'g', 'NVDA', 'long', st()).ok, false);
  assert.equal(ideaCapCheck('intraday', 'g', 'NVDA', 'long', { ...st(), emittedToday: IGNITION_CFG.ideas.perDay.intraday }).ok, false);
  assert.equal(ideaCapCheck('swing', 'g', 'NVDA', 'long', { ...st(), perGroup: { g: 2 } }).ok, false);
  assert.equal(ideaCapCheck('daily', 'g', 'NVDA', 'long', { ...st(), emittedSymbols: new Set(['NVDA']) }).ok, false);
  const clash = ideaCapCheck('daily', 'g', 'NVDA', 'long', { ...st(), open: [{ symbol: 'NVDA', direction: 'long', source: 'flow' }] });
  assert.equal(clash.ok, false); assert.match(clash.reason, /flow already has an open long/);
  assert.equal(ideaCapCheck('daily', 'g', 'NVDA', 'short', { ...st(), open: [{ symbol: 'NVDA', direction: 'long' }] }).ok, true);
});

t('structural targets: first ≥ minRR, never a fixed %', () => {
  const tg = pickStructuralTargets('long', 100, 99, [{ price: 100.5, label: 'near' }, { price: 101.6, label: 'pdh' }, { price: 103, label: 'proj' }], 1);
  assert.deepEqual(tg, { t1: 101.6, t2: 103, t1Basis: 'pdh', rr: 1.6 });
  assert.equal(pickStructuralTargets('long', 100, 99, [{ price: 100.4, label: 'x' }], 1), null);
});

t('transition log: stage changes always, first read of the day only when ≥ stirring', () => {
  const g = ign('intraday');
  assert.equal(shouldLogTransition(undefined, { ...g, stage: 'quiet' }, '2026-09-30'), false);
  assert.equal(shouldLogTransition(undefined, g, '2026-09-30'), true);
  assert.equal(shouldLogTransition({ stage: 'igniting', dateKey: '2026-09-30' }, g, '2026-09-30'), false);
  assert.equal(shouldLogTransition({ stage: 'stirring', dateKey: '2026-09-30' }, g, '2026-09-30'), true);
});

t('display order: igniting → stirring → extended → quiet', () => {
  const rows = sortGroupReads([{ ...ign('intraday'), stage: 'quiet' }, { ...ign('intraday'), stage: 'extended' }, ign('intraday'), { ...ign('intraday'), stage: 'stirring' }]);
  assert.deepEqual(rows.map((r) => r.stage), ['igniting', 'stirring', 'extended', 'quiet']);
});

console.log(`sector-ignition: ${n} tests passed`);
