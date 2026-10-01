/**
 * Unit + integration tests — 0DTE flow ignition (server/zero-dte-flow-core.ts, server/zero-dte-flow.ts).
 *   npm run -s test:zero-dte-flow
 * No network, no database: chains and bars are synthetic and injected.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-dte-flow-test-'));
process.env.SHARED_STATE_DIR = path.join(TMP, 'shared');
process.env.ZERO_DTE_FLOW_LOG_DIR = path.join(TMP, 'log');
delete process.env.ALPACA_API_KEY; delete process.env.ALPACA_SECRET_KEY;
delete process.env.ROLE; delete process.env.WORKER_ENABLED; delete process.env.ZERO_DTE_FLOW;

const core = await import('../server/zero-dte-flow-core');
const eng = await import('../server/zero-dte-flow');
type MinuteBar = import('../server/zero-dte-sniper-core').MinuteBar;
type ChainRow = import('../server/zero-dte-flow-core').ChainRow;

const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// 2026-09-30 is EDT: 09:30 ET = 13:30Z.
const DAY = '2026-09-30';
const OPEN = Date.parse(`${DAY}T13:30:00Z`);
const at = (min: number) => OPEN + (min - 570) * 60_000;

/** 1-min bars 09:30 → `toMin` (exclusive) from a close function. */
function bars(toMin: number, close: (i: number) => number, v = 1000): MinuteBar[] {
  const out: MinuteBar[] = [];
  let prev = close(0);
  for (let m = 570; m < toMin; m++) {
    const i = m - 570; const c = close(i); const o = prev; prev = c;
    out.push({ t: at(m), min: m, o, h: Math.max(o, c) + 0.05, l: Math.min(o, c) - 0.05, c, v, vw: (o + c) / 2 });
  }
  return out;
}
const row = (over: Partial<ChainRow>): ChainRow => ({ occ: 'AMZN260930C00247500', strike: 247.5, type: 'call', expiration: DAY, volume: 0, bid: 0.8, ask: 0.9, last: 0.9, quoteTime: new Date(at(600)).toISOString(), openInterest: 500, delta: 0.45, ...over });

// ─── core ──────────────────────────────────────────────────────────────

t('universe: indexes + mega caps + tracked, deduped, no SPX', () => {
  const u = core.buildFlowUniverse(['amd', 'PLTR', 'SPX']);
  assert.deepEqual(u.slice(0, 3), ['SPY', 'QQQ', 'IWM']);
  assert.ok(u.includes('PLTR')); assert.ok(!u.includes('SPX'));
  assert.equal(u.filter((s) => s === 'AMD').length, 1);
});

t('printSide: ask / bid / mid / unknown', () => {
  assert.equal(core.printSide(1.0, 0.8, 1.0), 'ask');
  assert.equal(core.printSide(0.96, 0.8, 1.0), 'ask'); // ≥ ask − ¼ spread
  assert.equal(core.printSide(0.8, 0.8, 1.0), 'bid');
  assert.equal(core.printSide(0.9, 0.8, 1.0), 'mid');
  assert.equal(core.printSide(null, 0.8, 1.0), 'unknown');
});

t('ingest: first read inside 10 min counts the day volume; later only deltas', () => {
  const mem = core.newFlowMemory();
  core.ingestChainRead(mem, [row({ volume: 2000 })], at(575), 5);
  assert.equal(core.windowFlow(mem, 'AMZN260930C00247500', at(575)).aggressive, 2000 * 0.9 * 100);
  const late = core.newFlowMemory();
  core.ingestChainRead(late, [row({ volume: 2000 })], at(620), 50);
  assert.equal(core.windowFlow(late, 'AMZN260930C00247500', at(620)).total, 0, 'late first sighting only seeds');
  core.ingestChainRead(late, [row({ volume: 3500, last: 1.0, bid: 0.9, ask: 1.0 })], at(622), 52);
  assert.equal(core.windowFlow(late, 'AMZN260930C00247500', at(622)).aggressive, 1500 * 1.0 * 100);
  core.ingestChainRead(late, [row({ volume: 3000 })], at(624), 54); // provider reset → never negative
  assert.equal(core.windowFlow(late, 'AMZN260930C00247500', at(624)).contracts, 1500);
  assert.equal(core.windowFlow(late, 'AMZN260930C00247500', at(640)).total, 0, 'outside 10 min');
});

t('bestFlow: band, floor, vol > OI', () => {
  const mem = core.newFlowMemory();
  const rows = [
    row({ volume: 4000 }), // 247.5C, $360K at ask
    row({ occ: 'AMZN260930C00255000', strike: 255, volume: 9000 }), // 3% OTM — out of band
    row({ occ: 'AMZN260930P00245000', strike: 245, type: 'put', volume: 9000 }),
  ];
  core.ingestChainRead(mem, rows, at(580), 10);
  const f = core.bestFlow(mem, rows, 'AMZN', 247, 'long', DAY, at(580), () => 2)!;
  assert.equal(f.occ, 'AMZN260930C00247500');
  assert.equal(f.relSize, 3.6); assert.equal(f.volOverOi, true); assert.equal(f.sweeps, 2); assert.equal(f.share, 1);
  assert.equal(core.flowLegReason(f), null);
  assert.match(core.flowLegReason({ ...f, aggressive: 50_000 })!, /floor/);
  assert.match(core.flowLegReason({ ...f, volOverOi: false })!, /not opening/);
  assert.match(core.flowLegReason({ ...f, volOverOi: null })!, /no open interest/);
  // SPY floor is $250K.
  assert.equal(core.premiumFloor('SPY'), 250_000); assert.equal(core.premiumFloor('AMZN'), 100_000);
  // 1.5% OTM boundary, ITM 0.5% boundary, DTE ≤ 2.
  assert.ok(core.inBand({ strike: 250.6, type: 'call', expiration: DAY }, 247, 'long', DAY));
  assert.ok(!core.inBand({ strike: 251, type: 'call', expiration: DAY }, 247, 'long', DAY));
  assert.ok(!core.inBand({ strike: 245, type: 'call', expiration: DAY }, 247, 'long', DAY));
  assert.ok(!core.inBand({ strike: 247.5, type: 'call', expiration: '2026-10-03' }, 247, 'long', DAY));
});

t('structure: OR-high broken and held 2 bars above VWAP fires; 1 bar does not', () => {
  // OR 09:30–09:34 around 100, then a ramp to 101.
  const up = bars(590, (i) => (i < 5 ? 100 + (i % 2) * 0.1 : 100 + (i - 4) * 0.08));
  const s = core.structureFor(up, 'long');
  assert.equal(s.ok, true, s.reason ?? ''); assert.ok(s.heldBars >= 2);
  const oneBar = bars(577, (i) => (i < 5 ? 100 : i === 5 ? 99.9 : 100.4));
  const s2 = core.structureFor(oneBar, 'long');
  assert.equal(s2.ok, false); assert.match(s2.reason!, /held 2 bars/);
  assert.equal(core.structureFor(up, 'short').ok, false);
  assert.match(core.structureFor(bars(573, () => 100), 'long').reason!, /opening range/);
});

t('walls: opposing wall within 0.5% blocks; none held = unchecked', () => {
  assert.equal(core.wallBlock('long', 100, { callWall: 100.4, putWall: 98, source: 'x' }).blocked, true);
  assert.equal(core.wallBlock('long', 100, { callWall: 101, putWall: 98, source: 'x' }).blocked, false);
  assert.equal(core.wallBlock('short', 100, { callWall: 101, putWall: 99.6, source: 'x' }).blocked, true);
  const u = core.wallBlock('long', 100, null);
  assert.equal(u.blocked, false); assert.equal(u.checked, false); assert.match(u.note, /unchecked/);
});

t('quote check: stale > 2 min and spread > 15% refused', () => {
  const now = at(600);
  assert.equal(core.quoteCheck({ bid: 0.8, ask: 0.9, quoteTime: new Date(now - 30_000).toISOString() }, now).ok, true);
  assert.match(core.quoteCheck({ bid: 0.8, ask: 0.9, quoteTime: new Date(now - 150_000).toISOString() }, now).reason!, /old/);
  assert.match(core.quoteCheck({ bid: 0.5, ask: 0.9, quoteTime: new Date(now).toISOString() }, now).reason!, /spread/);
  assert.match(core.quoteCheck({ bid: null, ask: 0.9, quoteTime: new Date(now).toISOString() }, now).reason!, /two-sided/);
});

t('plan: premium targets, delta-mapped underlying, stop = nearer of VWAP / OR mid', () => {
  const s = { ok: true, reason: null, last: 101, vwap: 100.5, orHigh: 100.3, orLow: 99.7, orMid: 100, atr5: 0.2, heldBars: 2, barAt: 0 };
  const p = core.planFor('long', 101, 1.0, 0.5, s, { callWall: 103, putWall: 98, source: 'x' });
  assert.equal(p.t1Premium, 1.5); assert.equal(p.t2Premium, 2); assert.equal(p.stopPremium, 0.6);
  assert.equal(p.t1Underlying, 102); assert.equal(p.t2Underlying, 103);
  assert.equal(p.stopUnderlying, 100.5); assert.equal(p.stopBasis, 'VWAP');
  assert.equal(p.wallAhead, 103);
  const ps = core.planFor('short', 99, 1.0, -0.5, { ...s, vwap: 99.5, orMid: 100 }, null);
  assert.equal(ps.t1Underlying, 98); assert.equal(ps.stopUnderlying, 99.5);
});

t('live state: fired → reached / faded, sticky', () => {
  const base = { entry: 1, spot: 101, side: 'long' as const, stopUnderlying: 100.5, etMin: 620 };
  assert.equal(core.liveState('fired', { ...base, mid: 1.5 }).state, 'reached');
  assert.equal(core.liveState('fired', { ...base, mid: 0.6 }).state, 'faded');
  assert.equal(core.liveState('fired', { ...base, mid: 1.1, spot: 100.4 }).state, 'faded');
  assert.equal(core.liveState('fired', { ...base, mid: 1.1, etMin: 930 }).state, 'faded');
  assert.equal(core.liveState('fired', { ...base, mid: 1.1 }).state, 'fired');
  assert.equal(core.liveState('reached', { ...base, mid: 0.1 }).state, 'reached');
});

t('unwind: dominant call strike net −40% from peak + rejection → SHORT', () => {
  const k = 100;
  const hist = [{ t: at(600), net: 1000 }, { t: at(605), net: 5000 }, { t: at(615), net: 2500 }];
  // Price rallies to 99.95 (within 0.10% of 100), then falls to 99.6 and keeps falling.
  const b = bars(616, (i) => (i < 35 ? 99 + i * 0.027 : 99.95 - (i - 35) * 0.035));
  const sig = core.detectUnwind(hist, { strike: k, type: 'call', occ: 'SPY260930C00100000' }, b, at(616));
  assert.ok(sig, 'unwind detected'); assert.equal(sig!.side, 'short'); assert.equal(sig!.dropPct, 0.5);
  assert.equal(core.detectUnwind([{ t: at(600), net: 1000 }, { t: at(610), net: 500 }], { strike: k, type: 'call', occ: 'x' }, b, at(616)), null, 'peak below the minimum');
  assert.equal(core.detectUnwind([{ t: at(600), net: 5000 }, { t: at(610), net: 4000 }], { strike: k, type: 'call', occ: 'x' }, b, at(616)), null, 'only −20%');
  const flat = bars(616, () => 99);
  assert.equal(core.detectUnwind(hist, { strike: k, type: 'call', occ: 'x' }, flat, at(616)), null, 'no touch of the strike');
});

t('outcome: +100% before stop; stop first when a bar does both; time stop', () => {
  const opt = (pts: Array<[number, number, number]>) => pts.map(([m, h, l]) => ({ t: at(m), o: l, h, l, c: (h + l) / 2, v: 10 }));
  const under = bars(700, () => 101);
  const p = { entry: 1, side: 'long' as const, stopUnderlying: 100.5, entryAt: at(600), timeStopAt: at(930) };
  const r1 = core.evaluateFlowOutcome(p, opt([[600, 1.1, 0.95], [610, 1.6, 1.2], [620, 2.1, 1.5]]), under);
  assert.equal(r1.result, 'reached_100'); assert.equal(r1.minutesTo50, 10);
  const r2 = core.evaluateFlowOutcome(p, opt([[600, 1.6, 0.55]]), under);
  assert.equal(r2.result, 'stopped'); assert.equal(r2.stopReason, 'premium −40%');
  const r3 = core.evaluateFlowOutcome(p, opt([[600, 1.6, 1.0], [601, 1.2, 0.5]]), under);
  assert.equal(r3.result, 'reached_50');
  const r4 = core.evaluateFlowOutcome(p, opt([[600, 1.2, 0.9], [601, 1.1, 0.9]]), under);
  assert.equal(r4.result, 'time_stop');
  const dip = bars(700, (i) => (i === 31 ? 100 : 101));
  assert.equal(core.evaluateFlowOutcome(p, opt([[600, 1.2, 0.9], [601, 1.2, 0.9]]), dip).stopReason, 'underlying stop');
  assert.equal(core.evaluateFlowOutcome(p, [], under).result, 'no_data');
});

// ─── engine ────────────────────────────────────────────────────────────

/** AMZN ramps above its opening range; the 247.5C takes $360K at the ask between reads. */
const amzBars = bars(600, (i) => (i < 5 ? 246 + (i % 2) * 0.2 : 246.2 + (i - 4) * 0.04));
const peek = (s: string) => (s === 'AMZN' ? { dateKey: DAY, bars: amzBars } : null);
function chainAt(nowMs: number, vol: number) {
  return async (sym: string) => sym !== 'AMZN' ? null : ({
    spot: 247.2, fetchedAt: nowMs, source: 'test',
    rows: [row({ volume: vol, quoteTime: new Date(nowMs - 20_000).toISOString() }), row({ occ: 'AMZN260930P00246000', strike: 246, type: 'put', volume: 100, last: 0.5, bid: 0.5, ask: 0.6, quoteTime: new Date(nowMs).toISOString() })],
  });
}
const gate = async <T,>(_n: string, fn: () => Promise<T>) => fn();

t('engine: watch-only by default — fired row logged, nothing published', async () => {
  eng.__resetZeroDteFlowForTests();
  const now1 = at(598); const now2 = at(600);
  await eng.runZeroDteFlow(now1, { force: true, universe: ['AMZN'], chainFn: chainAt(now1, 1000), gate, peek, walls: () => null });
  const c = await eng.runZeroDteFlow(now2, { force: true, universe: ['AMZN'], chainFn: chainAt(now2, 5000), gate, peek, walls: () => null });
  assert.equal(c.chains.read, 1); assert.equal(c.published, 0);
  const s = eng.getZeroDteFlowState(now2);
  const r = s.rows.find((x) => x.symbol === 'AMZN' && x.side === 'long')!;
  assert.equal(r.state, 'fired', r.reason ?? '');
  assert.equal(r.flow!.aggressive, 4000 * 0.9 * 100);
  assert.equal(r.plan!.entryPremium, 0.85);
  assert.match(r.reason!, /ZERO_DTE_FLOW is off/);
  assert.match(r.wall!, /unchecked/);
  const log = await eng.readFlowLog();
  assert.equal(log.filter((l) => l.type === 'fired').length, 1);
  // A third cycle never fires the same symbol/side again.
  await eng.runZeroDteFlow(at(602), { force: true, universe: ['AMZN'], chainFn: chainAt(at(602), 9000), gate, peek, walls: () => null });
  assert.equal((await eng.readFlowLog()).filter((l) => l.type === 'fired').length, 1);
});

t('engine: publishes with the flag; wall within 0.5% keeps it a watch row', async () => {
  eng.__resetZeroDteFlowForTests();
  fs.rmSync(path.join(TMP, 'log'), { recursive: true, force: true });
  const published: string[] = [];
  const publishFn = async (r: any) => { published.push(r.contract.occ); return 'idea-1'; };
  await eng.runZeroDteFlow(at(598), { force: true, universe: ['AMZN'], chainFn: chainAt(at(598), 1000), gate, peek, walls: () => ({ callWall: 247.5, putWall: 240, source: 't' }), publish: true, publishFn });
  await eng.runZeroDteFlow(at(600), { force: true, universe: ['AMZN'], chainFn: chainAt(at(600), 5000), gate, peek, walls: () => ({ callWall: 247.5, putWall: 240, source: 't' }), publish: true, publishFn });
  let r = eng.getZeroDteFlowState(at(600)).rows.find((x) => x.side === 'long')!;
  assert.equal(r.state, 'watch'); assert.match(r.reason!, /wall/); assert.equal(published.length, 0);
  await eng.runZeroDteFlow(at(602), { force: true, universe: ['AMZN'], chainFn: chainAt(at(602), 9000), gate, peek, walls: () => ({ callWall: 252, putWall: 240, source: 't' }), publish: true, publishFn });
  r = eng.getZeroDteFlowState(at(602)).rows.find((x) => x.side === 'long')!;
  assert.equal(r.state, 'fired'); assert.equal(r.published, true); assert.equal(r.ideaId, 'idea-1');
  assert.deepEqual(published, ['AMZN260930C00247500']);
});

t('engine: marks fired → reached from the next chain read', async () => {
  const later = at(640);
  const ch = async () => ({ spot: 248.5, fetchedAt: later, source: 'test', rows: [row({ volume: 9500, bid: 1.6, ask: 1.7, last: 1.7, quoteTime: new Date(later).toISOString() })] });
  await eng.runZeroDteFlow(later, { force: true, universe: ['AMZN'], chainFn: ch, gate, peek, walls: () => null });
  const r = eng.getZeroDteFlowState(later).rows.find((x) => x.side === 'long')!;
  assert.equal(r.state, 'reached'); assert.equal(r.lastMid, 1.65);
});

t('engine: dropped heavy-gate slot skips the name, stated', async () => {
  eng.__resetZeroDteFlowForTests();
  const c = await eng.runZeroDteFlow(at(600), { force: true, universe: ['AMZN'], chainFn: chainAt(at(600), 1000), gate: async () => undefined, peek, walls: () => null, log: false });
  assert.deepEqual(c.chains.dropped, ['AMZN']); assert.equal(c.chains.read, 0);
});

t('outcomes: one line per fired trigger from injected bars', async () => {
  const lines = await eng.readFlowLog();
  const fired = lines.find((l) => l.type === 'fired')!;
  const entry = fired.row.plan.entryPremium;
  const res = await eng.runZeroDteFlowOutcomes(Date.parse('2026-10-01T14:00:00Z'), {
    lines,
    loadOpt: async () => [{ t: Date.parse(fired.row.at) + 60_000, o: entry, h: entry * 2.2, l: entry, c: entry * 2, v: 5 }],
    loadStock: async () => new Map([['AMZN', bars(700, () => 248)]]),
  });
  assert.equal(res.written, 1);
  const out = (await eng.readFlowLog()).filter((l) => l.type === 'outcome');
  assert.equal(out.length, 1); assert.equal(out[0].result, 'reached_100');
  const again = await eng.runZeroDteFlowOutcomes(Date.parse('2026-10-01T14:00:00Z'), { lines: await eng.readFlowLog(), loadOpt: async () => [], loadStock: async () => new Map() });
  assert.equal(again.written, 0, 'idempotent');
  const rep: any = await eng.getZeroDteFlowReport();
  assert.equal(rep.all.reached100, 1); assert.equal(rep.lowN, true);
});

let pass = 0; let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${(e as Error).message}`); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
