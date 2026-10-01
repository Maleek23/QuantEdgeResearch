/**
 * Unit tests for the sector board: the pure core (shared/sector-board.ts) on
 * synthetic closes, and the server assembly (server/sector-board.ts) with every
 * I/O read replaced by a seam — no network, no DB, no shared-state writes.
 *   npm run -s test:sector-board
 */
import assert from 'node:assert/strict';
import {
  BOARD_CFG, boardGroups, compositeScores, computeCore, confluenceOf, consensusOf, emaAt, laggardsOf, leaderLogRows, outcomeSummary,
  outcomesDue, overnightDrift, pctRanks, ranksOf, regimeOf, sectorStatsAt, type BoardLogRow, type MemberInput,
} from '../shared/sector-board';
import { PEER_GROUPS, getPeerSet } from '../shared/sector-peers';
import { ignitionGroups } from '../shared/sector-ignition';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

// ── synthetic market ─────────────────────────────────────────────────────
const N = 70;
const dates = Array.from({ length: N }, (_, i) => { const d = new Date(Date.UTC(2026, 5, 1) + i * 86_400_000); return d.toISOString().slice(0, 10); });
const line = (start: number, drift: number, wiggle = 0.002, seed = 1) => Array.from({ length: N }, (_, i) => start * Math.exp(drift * i + wiggle * Math.sin(i * 0.9 + seed)));
/** Flat for most of the window, then a late move of `late` per session over the last `k` sessions. */
const lateMove = (start: number, late: number, k = 8, seed = 1) => Array.from({ length: N }, (_, i) => start * Math.exp((i >= N - k ? late * (i - (N - k)) : 0) + 0.002 * Math.sin(i * 0.7 + seed)));

async function main() {
  await t('sector-peers: thematic groups appended last, primaries unchanged, ignition skips them', () => {
    const ids = PEER_GROUPS.map((g) => g.id);
    for (const id of ['photonics', 'ai_neoclouds', 'mag7', 'glp1', 'inverse_vol']) assert.ok(ids.includes(id), id);
    const firstThematic = PEER_GROUPS.findIndex((g) => g.thematic);
    assert.ok(PEER_GROUPS.slice(firstThematic).every((g) => g.thematic), 'thematic groups are the tail');
    assert.equal(getPeerSet('NBIS')!.group.id, 'ai_servers_cloud');
    assert.equal(getPeerSet('NVDA')!.group.id, 'compute_semis');
    assert.equal(getPeerSet('LLY')!.group.id, 'pharma');
    assert.equal(getPeerSet('CORZ')!.group.id, 'ai_neoclouds'); // only listed in the theme
    assert.ok(!ignitionGroups().some((g) => ['photonics', 'ai_neoclouds', 'mag7', 'glp1', 'inverse_vol'].includes(g.groupId)));
    const bg = boardGroups();
    assert.ok(!bg.some((g) => g.id === 'us_indices'));
    assert.ok(bg.find((g) => g.id === 'ai_neoclouds')!.members.includes('NBIS'));
    assert.ok(bg.every((g) => !g.etf || !g.members.includes(g.etf)));
  });

  await t('helpers: percentile ranks with ties, ranks, EMA, regime quadrants', () => {
    assert.deepEqual(pctRanks([1, 2, 2, 3, null]), [0, 50, 50, 100, null]);
    assert.deepEqual(ranksOf([10, null, 30, 20]), [3, null, 1, 2]);
    assert.equal(emaAt([1, 2, 3], 2, 5), null);
    assert.ok(Math.abs(emaAt(Array(30).fill(10), 29, 20)! - 10) < 1e-9);
    assert.equal(regimeOf(2, 1), 'leading');
    assert.equal(regimeOf(2, -1), 'weakening');
    assert.equal(regimeOf(-2, -1), 'lagging');
    assert.equal(regimeOf(-2, 1), 'improving');
    assert.equal(regimeOf(null, 1), null);
  });

  await t('sector stats: equal-weight returns, breadth above 20-MA, 20-session highs, RS vs SPY', () => {
    const spy = line(100, 0);
    const up = [line(50, 0.01, 0, 1), line(80, 0.012, 0, 2)];
    const s = sectorStatsAt(up, spy, N - 1);
    assert.equal(s.membersRead, 2);
    assert.equal(s.breadth, 100);
    assert.equal(s.highsPct, 100);
    assert.equal(s.lowsPct, 0);
    assert.ok(s.r20! > 20 && s.rs! > 20, `r20 ${s.r20} rs ${s.rs}`);
    assert.ok(Math.abs(s.r1! - (Math.exp(0.011) - 1) * 100) < 0.05);
  });

  await t('composite is breadth-weighted and needs ≥2 members read', () => {
    const base = { r1: 0, r3: 1, r10: 2, r20: 3, rs: 1, highsPct: 0, lowsPct: 0, membersRead: 5 };
    const sc = compositeScores([{ ...base, breadth: 90 }, { ...base, breadth: 10 }, { ...base, breadth: 90, membersRead: 1 }]);
    assert.ok(sc[0]! > sc[1]!);
    assert.equal(sc[2], null);
  });

  // A two-sector-plus market: semis rip late, software slides late, the rest drift flat.
  const groups = boardGroups().filter((g) => ['compute_semis', 'enterprise_software', 'banks', 'pharma', 'defense', 'ai_neoclouds'].includes(g.id));
  const closes = new Map<string, number[]>();
  closes.set('SPY', line(500, 0.0005));
  groups.forEach((g, gi) => g.members.forEach((m, k) => {
    if (closes.has(m)) return;
    const late = g.id === 'compute_semis' ? 0.02 : g.id === 'enterprise_software' ? -0.02 : g.id === 'ai_neoclouds' ? 0.03 : 0.001 * (gi - 2);
    closes.set(m, lateMove(20 + k * 7, late * (1 + k * 0.05), 8, gi * 3 + k));
  }));
  // ensure the early half of the window ranks software above semis so the late move shows as a climb
  for (const m of groups.find((g) => g.id === 'enterprise_software')!.members) closes.set(m, closes.get(m)!.map((v, i) => (i < N - 8 ? v * Math.exp(0.004 * i) : v * Math.exp(0.004 * (N - 9)))));
  const core = computeCore({ dates, spy: closes.get('SPY')!, closes, groups });

  await t('rank flow: 10 sessions, climbers / sliders from rank change, ranks contiguous', () => {
    assert.equal(core.sessions.length, BOARD_CFG.sessions);
    for (const s of core.sectors) assert.equal(s.history.length, BOARD_CFG.sessions);
    const ranks = core.sectors.map((s) => s.rank).filter((r) => r != null).sort((a, b) => a! - b!);
    assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
    const semis = core.sectors.find((s) => s.id === 'compute_semis')!;
    const soft = core.sectors.find((s) => s.id === 'enterprise_software')!;
    assert.ok(semis.rank! < soft.rank!, `semis ${semis.rank} soft ${soft.rank}`);
    assert.ok(core.sliders.includes('enterprise_software'), `sliders ${core.sliders}`);
    assert.ok(semis.side === 'long' && (semis.regime === 'leading' || semis.regime === 'improving'), String(semis.regime));
    assert.equal(soft.side, 'short');
    assert.ok(semis.stretch! > 0 && soft.drawdown! < 0);
  });

  await t('consensus counts only signals that were read and says which agree', () => {
    const c = consensusOf({ breadth: 80, rs: 4, trendUp: true, trendDown: false, ignition: { intraday: { stage: 'igniting', side: 'long', asOf: '2026-10-01T14:00:00Z' }, daily: { stage: 'quiet', side: null, asOf: null } }, flow: { net: 900_000, up: 3, down: 0 }, nexus: { long: 0, short: 1 }, gex: null });
    assert.equal(c.bull, 5); // breadth, rs, trend, intraday, flow
    assert.equal(c.bear, 1); // nexus
    assert.equal(c.n, 7);    // + daily neutral; swing/weekly unread, gex n/a
    assert.equal(c.lean, 'bull');
    assert.equal(c.signals.find((s) => s.key === 'gex')!.lean, 'na');
    const th = consensusOf({ breadth: null, rs: null, trendUp: null, trendDown: null, ignition: null, flow: null, nexus: null, gex: null });
    assert.equal(th.n, 0);
    assert.ok(th.signals.filter((s) => s.key.startsWith('ign_')).every((s) => s.detail.includes('thematic')));
  });

  await t('overnight drift: median, flat band, confirms vs fights the rotation side', () => {
    assert.deepEqual(overnightDrift([1.2, 0.8, null, 2], 'long'), { driftPct: 1.2, n: 3, flag: 'confirms' });
    assert.equal(overnightDrift([-1, -0.8], 'long').flag, 'fights');
    assert.equal(overnightDrift([0.1, -0.1], 'short').flag, 'flat');
    assert.deepEqual(overnightDrift([null], 'long'), { driftPct: null, n: 0, flag: null });
  });

  const nbis: MemberInput = {
    symbol: 'NBIS', closes: line(60, 0.012, 0.004, 3), sectorR10: 3,
    flow: { net: 1_400_000, big: 2 }, gapPct: 2.4,
    levels: { support: { price: 0, score: 3, label: 'prior-day high + 5-day VAH' }, resistance: null, atr: 2, asOf: '2026-10-01T14:00:00Z' },
    gamma: { zeroGamma: 100, callWall: 999, putWall: 90, source: 'aggregate GEX cache', asOf: '2026-10-01T14:00:00Z' },
    nexus: { long: 1, short: 0 }, earnings: null,
  };
  const last = nbis.closes[N - 1];
  nbis.levels!.support!.price = last * 0.99;

  await t('confluence: every component explicit; long and short mirror; n/a never counted', () => {
    const L = confluenceOf(nbis, 'long');
    assert.deepEqual(L.chips.map((c) => c.key), ['trend', 'high', 'setup', 'flow', 'levels', 'gamma', 'rs', 'gap', 'nexus']);
    for (const k of ['trend', 'high', 'flow', 'levels', 'rs', 'gap', 'nexus']) assert.equal(L.chips.find((c) => c.key === k)!.state, 'pass', k);
    assert.equal(L.chips.find((c) => c.key === 'gamma')!.state, 'pass'); // last ≈ 137 > zero-γ 100, call wall far away
    assert.equal(L.available, 9);
  });

  await t('confluence gamma: above zero-γ with room to the call wall passes; below fails', () => {
    const g = confluenceOf({ ...nbis, gamma: { zeroGamma: last * 0.9, callWall: last * 1.1, putWall: null, source: 'x', asOf: 'x' } }, 'long');
    assert.equal(g.chips.find((c) => c.key === 'gamma')!.state, 'pass');
    const b = confluenceOf({ ...nbis, gamma: { zeroGamma: last * 1.1, callWall: null, putWall: null, source: 'x', asOf: 'x' } }, 'long');
    assert.equal(b.chips.find((c) => c.key === 'gamma')!.state, 'fail');
    const s = confluenceOf({ ...nbis, gamma: { zeroGamma: last * 1.1, callWall: null, putWall: last * 0.9, source: 'x', asOf: 'x' } }, 'short');
    assert.equal(s.chips.find((c) => c.key === 'gamma')!.state, 'pass');
  });

  await t('confluence: missing reads are n/a and the score is over what was read', () => {
    const bare = confluenceOf({ ...nbis, flow: null, gapPct: null, levels: null, gamma: null, nexus: { long: 0, short: 0 } }, 'long');
    assert.equal(bare.available, 4); // trend, high, setup, rs
    assert.ok(bare.chips.filter((c) => c.state === 'na').length === 5);
    const sh = confluenceOf({ ...nbis, nexus: { long: 0, short: 0 } }, 'short');
    assert.equal(sh.chips.find((c) => c.key === 'trend')!.state, 'fail');
    assert.equal(sh.chips.find((c) => c.key === 'flow')!.state, 'fail');
    assert.ok(sh.score! < confluenceOf(nbis, 'long').score!);
  });

  await t('laggards: behind the sector on its side, with a why-line incl. earnings when known', () => {
    const rows = [
      { ...confluenceOf(nbis, 'long'), symbol: 'A', relSector: 4 },
      { ...confluenceOf(nbis, 'long'), symbol: 'B', relSector: -6, earnings: '2026-10-03' },
      { ...confluenceOf(nbis, 'long'), symbol: 'C', relSector: -2 },
    ];
    const lag = laggardsOf(rows, 'long', new Set(['A']));
    assert.deepEqual(lag.map((l) => l.symbol), ['B', 'C']);
    assert.ok(lag[0].why.includes('earnings 2026-10-03'));
    assert.ok(lag[1].why.includes('no earnings/news flag read'));
    assert.deepEqual(laggardsOf(rows, 'short', new Set()).map((l) => l.symbol), ['A']);
  });

  await t('forward log: top-5 sectors × top-3 leaders, outcomes once per horizon, side-signed excess', () => {
    const lr = leaderLogRows([
      { id: 's1', rank: 1, side: 'long', regime: 'leading', members: ['X', 'Y'], leaders: [confluenceOf({ ...nbis, symbol: 'X' }, 'long')] },
      { id: 's9', rank: 9, side: 'long', regime: 'lagging', members: ['Z'], leaders: [] },
    ], '2026-06-02', 'now');
    assert.equal(lr.length, 1);
    const cl = new Map([['X', new Map([['2026-06-02', 100], ['2026-06-03', 103], ['2026-06-04', 104], ['2026-06-05', 99]])], ['Y', new Map([['2026-06-02', 50], ['2026-06-03', 50.5], ['2026-06-04', 51], ['2026-06-05', 50]])]]);
    const ds = ['2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];
    const o = outcomesDue(lr, cl, ds, 'later');
    assert.deepEqual(o.map((r) => r.h), [1, 3]); // 5-session not due yet
    const h1 = o[0];
    assert.equal(h1.ret, 3); assert.equal(h1.sectorRet, 2); assert.equal(h1.excess, 1);
    assert.equal(outcomesDue([...lr, ...o] as BoardLogRow[], cl, ds, 'later').length, 0, 'idempotent');
    const sum = outcomeSummary([...lr, ...o]);
    assert.equal(sum.find((s) => s.h === 1)!.n, 1);
  });

  await t('server assembly with I/O seams: board publishes, ranks, overnight flags, leaders, ideas tags', async () => {
    const { computeSectorBoard, boardSummary } = await import('../server/sector-board');
    const closeMaps = new Map<string, Map<string, number>>();
    for (const [s, xs] of closes) closeMaps.set(s, new Map(xs.map((v, i) => [dates[i], v])));
    // every other board group gets flat members so the full group list ranks
    for (const g of boardGroups()) for (const m of g.members) if (!closeMaps.has(m)) closeMaps.set(m, new Map(line(30, 0, 0.003, m.length).map((v, i) => [dates[i], v])));
    const quotes = new Map<string, any>();
    for (const m of groups.find((g) => g.id === 'compute_semis')!.members) quotes.set(m, { symbol: m, price: 10, preMarketGapPct: 1.5, preMarketAt: '2026-08-08T12:30:00Z', fetchedAt: '2026-08-08T12:31:00Z' });
    quotes.set('NBIS', { symbol: 'NBIS', price: 10, preMarketGapPct: 6.2, preMarketAt: '2026-08-08T12:30:00Z', fetchedAt: '2026-08-08T12:31:00Z' });
    const saved: any[] = [];
    const nowMs = Date.parse('2026-08-10T12:45:00Z'); // Mon 08:45 ET → pre-market
    const snap = await computeSectorBoard({
      nowMs, log: false,
      loadCloses: async () => ({ closes: closeMaps, newest: dates[N - 1] }),
      quotes: async () => quotes,
      flow: async () => ({ by: new Map([['NVDA', { net: 2_000_000, big: 3 }], ['AMD', { net: 600_000, big: 1 }]]), asOf: '2026-08-07T20:00:00Z' }),
      ideas: async () => [{ id: 'i1', symbol: 'NVDA', direction: 'long', source: 'flow', timestamp: '2026-08-07T15:00:00Z' }, { id: 'i2', symbol: 'CRM', direction: 'long', source: 'quant', timestamp: '2026-08-07T15:00:00Z' }],
      ignition: (h) => (h === 'intraday' ? { asOf: '2026-08-07T15:00:00Z', groups: [{ groupId: 'compute_semis', stage: 'igniting', side: 'long' }] } : null),
      gamma: () => null, levels: () => null, earnings: () => null,
      overnightStores: () => [], saveOvernight: (s) => saved.push(s),
    });
    assert.equal(snap.phase, 'premarket');
    assert.equal(snap.status, 'measuring');
    assert.equal(snap.provisional, null);
    assert.equal(snap.sessions.length, BOARD_CFG.sessions);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].kind, 'premarket');
    const semis = snap.sectors.find((s) => s.id === 'compute_semis')!;
    assert.equal(semis.overnight.flag, 'confirms');
    assert.ok(semis.consensus.signals.find((s) => s.key === 'ign_intraday')!.lean === 'bull');
    assert.equal(semis.ideas[0].tag, 'with');
    const soft = snap.sectors.find((s) => s.id === 'enterprise_software')!;
    assert.equal(soft.ideas[0].tag, 'against');
    assert.ok(snap.overnight.movers[0].symbol === 'NBIS' && snap.overnight.movers[0].sectors.includes('ai_neoclouds'));
    const neo = snap.sectors.find((s) => s.id === 'ai_neoclouds')!;
    assert.ok(neo.leaders.length === neo.memberCount && neo.leaders[0].chips.length === 9);
    assert.ok(neo.consensus.signals.filter((s) => s.key.startsWith('ign_')).every((s) => s.lean === 'na'));
    const ranks = snap.sectors.map((s) => s.rank).filter((r) => r != null);
    assert.equal(ranks.length, boardGroups().length);
    assert.ok(snap.compute.symbols > 200);
    const sum = boardSummary(snap);
    assert.ok(sum.sectors.every((s: any) => !('chips' in (s.leaders[0] ?? {}))));
    const bytes = JSON.stringify(snap).length;
    console.log(`  published snapshot ${(bytes / 1024).toFixed(0)} KB, board summary ${(JSON.stringify(sum).length / 1024).toFixed(0)} KB; compute ${snap.compute.ms} ms, heap Δ ${snap.compute.heapDeltaMb} MB, ${snap.compute.symbols} symbols`);
    assert.ok(bytes < 1.5 * 1024 * 1024, 'snapshot stays small');
  });

  await t('server assembly in session: today priced from quotes as a provisional column', async () => {
    const { computeSectorBoard } = await import('../server/sector-board');
    const closeMaps = new Map<string, Map<string, number>>();
    for (const g of boardGroups()) for (const m of g.members) closeMaps.set(m, new Map(line(30, 0.001, 0.003, m.length).map((v, i) => [dates[i], v])));
    closeMaps.set('SPY', new Map(line(500, 0.0005).map((v, i) => [dates[i], v])));
    const quotes = new Map<string, any>([['SPY', { symbol: 'SPY', price: 520, fetchedAt: '2026-08-10T15:00:00Z' }], ['NVDA', { symbol: 'NVDA', price: 99, fetchedAt: '2026-08-10T15:00:00Z' }]]);
    const snap = await computeSectorBoard({
      nowMs: Date.parse('2026-08-10T15:00:00Z'), log: false,
      loadCloses: async () => ({ closes: closeMaps, newest: dates[N - 1] }),
      quotes: async () => quotes, flow: async () => null, ideas: async () => null, ignition: () => null,
      gamma: () => null, levels: () => null, earnings: () => null, overnightStores: () => [], saveOvernight: () => {},
    });
    assert.equal(snap.phase, 'session');
    assert.equal(snap.provisional?.date, '2026-08-10');
    assert.equal(snap.sessions[snap.sessions.length - 1], '2026-08-10');
    assert.ok(snap.notes.some((x) => x.includes('flow tape not read')));
  });

  console.log(`sector-board: ${n} tests passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
