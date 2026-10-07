/**
 * Unit tests for the sector board's live pass (shared/sector-board-live.ts) and
 * the coverage / root-cause fixes around it (server/sector-board.ts,
 * server/pre-market-service.ts). No network, no DB, no shared-state writes.
 *   npm run -s test:sector-board-live
 */
import assert from 'node:assert/strict';
import { boardGroups, type BoardGroup } from '../shared/sector-board';
import { LIVE_CFG, applyLive, computeLive, rankAgo, type BoardLive, type LiveBase, type LiveQuote } from '../shared/sector-board-live';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

const N = 40;
const dates = Array.from({ length: N }, (_, i) => new Date(Date.UTC(2026, 7, 1) + i * 86_400_000).toISOString().slice(0, 10));
const TODAY = '2026-10-01';
const groups: BoardGroup[] = [
  { id: 'up', label: 'Up', etf: null, thematic: false, members: ['A1', 'A2', 'A3'] },
  { id: 'dn', label: 'Down', etf: null, thematic: false, members: ['B1', 'B2', 'B3'] },
  { id: 'flat', label: 'Flat', etf: null, thematic: false, members: ['C1', 'C2'] },
];
const base: LiveBase = {
  asOf: '2026-10-01T14:07:00Z', dateKey: TODAY, dates, groups,
  series: new Map(['SPY', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'].map((s, k) => [s, Array.from({ length: N }, (_, i) => 100 + k + Math.sin(i + k) * 0.5)])),
};
const prior = (s: string) => base.series.get(s)![N - 1];
const q = (sym: string, movePct: number, extra: Partial<LiveQuote> = {}): [string, LiveQuote] => {
  const pc = prior(sym); const px = pc * (1 + movePct / 100);
  return [sym, { price: px, prevClose: 1, open: pc, vwap: pc * (1 + movePct / 200), p30: pc * (1 + movePct / 150), preGapPct: null, postMovePct: null, regular: px, at: '2026-10-01T15:00:00Z', ...extra }];
};

async function main() {
  await t('session pass: today / since open / last 30m / breadth / VWAP / intraday rank, prior close from the bars', () => {
    const quotes = new Map([q('SPY', 0.2), q('A1', 2), q('A2', 3), q('A3', 1), q('B1', -2), q('B2', -1), q('B3', 0.5), q('C1', 0.1), q('C2', -0.1)]);
    const live = computeLive({ nowMs: Date.parse('2026-10-01T15:00:00Z'), dateKey: TODAY, phase: 'session', groups, quotes, base, prev: null });
    const up = live.sectors.up; const dn = live.sectors.dn;
    assert.ok(Math.abs(up.today! - 2) < 0.01, `up.today ${up.today}`); // prevClose 1 on the quote is ignored — bars win
    assert.equal(up.up, 3); assert.equal(dn.down, 2); assert.equal(dn.up, 1);
    assert.equal(up.aboveVwap, 3); assert.equal(up.vwapRead, 3);
    assert.ok(up.sinceOpen! > 1.9 && up.last30m! > 0);
    assert.equal(up.irank, 1); assert.equal(live.sectors.flat.irank, 2); assert.equal(dn.irank, 3);
    assert.ok(up.rank != null && up.composite != null, 'live composite recomputed on the base');
    assert.equal(live.base, base.asOf);
    assert.equal(live.points.length, 1);
    assert.deepEqual(up.spark, [up.today]);
    assert.equal(up.irankOpen, 1);
    assert.equal(up.rank15, null, 'ring does not reach back 15 min yet');
  });

  await t('ring: grows per pass, rank arrows read 15/30 min back, bounded, resets on a new day', () => {
    let prev: BoardLive | null = null;
    const start = Date.parse('2026-10-01T13:35:00Z');
    for (let k = 0; k < 9; k++) {
      // "dn" climbs through the morning: its move goes from −3% to +3%
      const quotes = new Map([q('SPY', 0), q('A1', 1), q('A2', 1), q('A3', 1), q('B1', -3 + k * 0.75), q('B2', -3 + k * 0.75), q('B3', -3 + k * 0.75), q('C1', 0), q('C2', 0)]);
      prev = { ...computeLive({ nowMs: start + k * 5 * 60_000, dateKey: TODAY, phase: 'session', groups, quotes, base, prev }), compute: { ms: 0, heapDeltaMb: 0, rssMb: 0 } };
    }
    const dn = prev!.sectors.dn;
    assert.equal(prev!.points.length, 9);
    assert.equal(dn.spark.length, 9);
    assert.equal(dn.irankOpen, 3);
    assert.equal(dn.irank, 1);
    assert.equal(dn.irank30, 3, 'six passes back it was last');
    assert.ok(dn.irank15 != null && dn.irank15 >= dn.irank!);
    assert.ok(dn.spark[0]! < 0 && dn.spark[8]! > 0);
    // bounded
    let p2: BoardLive | null = prev;
    for (let k = 0; k < LIVE_CFG.maxPoints + 5; k++) {
      p2 = { ...computeLive({ nowMs: start + (9 + k) * 60_000, dateKey: TODAY, phase: 'session', groups, quotes: new Map([q('A1', 1), q('A2', 1)]), base, prev: p2 }), compute: { ms: 0, heapDeltaMb: 0, rssMb: 0 } };
    }
    assert.equal(p2!.points.length, LIVE_CFG.maxPoints);
    assert.equal(p2!.sectors.up.spark.length, LIVE_CFG.maxPoints);
    // new day resets
    const next = computeLive({ nowMs: Date.parse('2026-10-02T13:00:00Z'), dateKey: '2026-10-02', phase: 'premarket', groups, quotes: new Map(), base, prev: p2 });
    assert.equal(next.points.length, 1);
  });

  await t('unquoted members are not read (nothing carried); quotes-only without a base says so', () => {
    const quotes = new Map([q('A1', 2)]);
    const live = computeLive({ nowMs: Date.parse('2026-10-01T15:00:00Z'), dateKey: TODAY, phase: 'session', groups, quotes, base: null, prev: null });
    assert.equal(live.sectors.up.quoted, 1);
    assert.equal(live.sectors.up.today, null, 'one member is below minMembersRead');
    assert.equal(live.sectors.up.rank, null);
    assert.equal(live.base, null);
    assert.ok(live.notes.some((x) => x.includes('worker restarted')));
  });

  await t('phase-aware reads: pre-market median gap, after-hours median move', () => {
    const pm = computeLive({ nowMs: Date.parse('2026-10-01T12:40:00Z'), dateKey: TODAY, phase: 'premarket', groups, base, prev: null,
      quotes: new Map([q('A1', 1, { preGapPct: 1 }), q('A2', 2, { preGapPct: 2 }), q('A3', 4, { preGapPct: 4 })]) });
    assert.equal(pm.sectors.up.preMkt, 2);
    assert.equal(pm.sectors.up.sinceOpen, null);
    assert.equal(pm.sectors.up.rank, null, 'no live composite before the open');
    const ah = computeLive({ nowMs: Date.parse('2026-10-01T21:00:00Z'), dateKey: TODAY, phase: 'after_hours', groups, base, prev: null,
      quotes: new Map([q('B1', 0, { postMovePct: -1 }), q('B2', 0, { postMovePct: -3 })]) });
    assert.equal(ah.sectors.dn.afterHrs, -2);
  });

  await t('applyLive: replaces today*, re-sorts by the live rank, ignores a stale or older live layer', () => {
    const quotes = new Map([q('SPY', 0), q('A1', -4), q('A2', -4), q('A3', -4), q('B1', 4), q('B2', 4), q('B3', 4), q('C1', 0), q('C2', 0)]);
    const live = { ...computeLive({ nowMs: Date.parse('2026-10-01T15:00:00Z'), dateKey: TODAY, phase: 'session', groups, quotes, base, prev: null }), compute: { ms: 0, heapDeltaMb: 0, rssMb: 0 } };
    const row = (id: string, rank: number) => ({ id, rank, rankThen: rank, rankDelta: 0, composite: 50, r1: 0, r3: 0, r10: 0, r20: 0, breadth: 50, rs: 0, regime: null, history: [{ date: '2026-09-30', rank, score: 50 }, { date: TODAY, rank, score: 50 }] });
    const board = { asOf: '2026-10-01T14:52:00Z', dateKey: TODAY, provisional: { date: TODAY }, sectors: [row('up', 1), row('flat', 2), row('dn', 3)] };
    const m = applyLive(board, live);
    assert.ok(m.applied);
    assert.equal(m.sectors[0].id, 'dn', 'live rank re-sorts');
    assert.equal(m.sectors[0].history[1].rank, m.sectors[0].rank);
    assert.equal(m.sectors[0].rankDelta, 3 - m.sectors[0].rank!);
    assert.ok(!applyLive({ ...board, dateKey: '2026-10-02' }, live).applied);
    assert.ok(!applyLive({ ...board, asOf: '2026-10-01T15:07:00Z' }, live).applied);
    assert.equal(rankAgo([{ t: '2026-10-01T14:00:00Z', phase: 'session' }], [4], Date.parse('2026-10-01T13:59:00Z')), null);
  });

  await t('pre-market-service: regular-session open / VWAP / 30-min-ago from the same 1-minute bars', async () => {
    const { metaToSnapshot } = await import('../server/pre-market-service');
    const s = metaToSnapshot('XYZ', { previousClose: 100, regularMarketPrice: 103, regularMarketOpen: 101, __rthOpen: 101, __rthVwap: 102.2, __rth30: 102.5, __rthLastAt: Date.parse('2026-10-01T15:00:00Z') }, 'regular')!;
    assert.equal(s.sessionOpen, 101); assert.equal(s.vwap, 102.2); assert.equal(s.price30mAgo, 102.5);
    assert.equal(s.regularAt, '2026-10-01T15:00:00.000Z');
    const { toLiveQuote } = await import('../server/sector-board');
    const lq = toLiveQuote(s, 'session');
    assert.equal(lq.open, 101); assert.equal(lq.p30, 102.5); assert.equal(lq.at, '2026-10-01T15:00:00.000Z');
  });

  await t('coverage: every unread member carries its reason; per-run coverage counts', async () => {
    const { computeSectorBoard } = await import('../server/sector-board');
    const all = boardGroups();
    const closeMaps = new Map<string, Map<string, number>>();
    const line = (k: number) => new Map(dates.map((d, i) => [d, 30 + k + Math.sin(i + k)]));
    closeMaps.set('SPY', line(0));
    const dropped = all.find((g) => g.id === 'pharma')!.members;
    let k = 1;
    for (const g of all) for (const m of g.members) if (!dropped.includes(m) && !closeMaps.has(m)) closeMaps.set(m, line(k++));
    const noBars = new Map(dropped.map((m) => [m, 'no daily bars — yahoo chart 429; retry after 15:12Z']));
    const snap = await computeSectorBoard({
      nowMs: Date.parse('2026-09-12T23:30:00Z'), phase: 'closed', log: false,
      loadCloses: async () => ({ closes: closeMaps, newest: dates[N - 1], noBars }),
      quotes: async () => new Map(), flow: async () => null, ideas: async () => null, ignition: () => null,
      gamma: () => null, levels: () => null, earnings: () => null, overnightStores: () => [], saveOvernight: () => {},
    });
    const ph = snap.sectors.find((s) => s.id === 'pharma')!;
    assert.equal(ph.membersRead, 0);
    assert.equal(ph.unread!.length, ph.memberCount);
    assert.ok(ph.unread!.every((u) => u.reason.includes('429')));
    assert.ok(snap.coverage!.readNow < snap.coverage!.members);
    assert.ok(snap.coverage!.reasons['no daily bars'] >= 1);
    assert.ok(snap.notes.some((x) => x.startsWith('members read ')));
    const other = snap.sectors.find((s) => s.id === 'compute_semis')!;
    assert.deepEqual(other.unread, []);
  });

  await t('runSectorBoardLive: injected quotes, no fetch, publishes nothing outside a worker', async () => {
    const { runSectorBoardLive, readLive } = await import('../server/sector-board');
    const n0 = await runSectorBoardLive({ nowMs: Date.parse('2026-10-01T15:00:00Z'), phase: 'session',
      quotes: new Map([['NVDA', { symbol: 'NVDA', price: 101, previousClose: 100, sessionOpen: 100.5, vwap: 100.8, price30mAgo: 100.2, regularAt: '2026-10-01T14:59:00Z', fetchedAt: '2026-10-01T15:00:00Z' }], ['AMD', { symbol: 'AMD', price: 99, previousClose: 100, fetchedAt: '2026-10-01T15:00:00Z' }]]) });
    assert.equal(n0, 2);
    const live = readLive()!;
    assert.equal(live.dateKey, '2026-10-01');
    assert.equal(live.sectors.compute_semis.quoted, 2);
    assert.equal(live.sectors.compute_semis.up, 1);
    assert.equal(live.quotesAt, '2026-10-01T15:00:00Z');
  });

  console.log(`sector-board-live: ${n} tests passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
