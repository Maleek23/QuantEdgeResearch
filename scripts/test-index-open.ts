/**
 * Fake-clock tests — the 2026-10-01 "index engine blind at the open" fixes.
 *   npm run -s test:index-open
 * No network, no database: the GEX computation, quotes and alerts are injected.
 *
 *   gate     open quiet window (09:30–09:45 ET deferral) + the dedicated index lane
 *   gex      snapshot timeout keeps the late result; a failed refresh keeps the last good snapshot
 *   ratio    SPX/SPY: live → last live (labelled) → none; never a flat ×10
 *   health   watchdog: 09:33 open check, 3 consecutive misses, one alert per episode, recovery, banner
 *   prewarm  09:20–10:00 phases; warms SPY first, reports to the watchdog
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'index-open-test-'));
process.env.SHARED_STATE_DIR = path.join(TMP, 'shared');
delete process.env.ALPACA_API_KEY; delete process.env.ALPACA_SECRET_KEY;
delete process.env.ROLE; delete process.env.WORKER_ENABLED; delete process.env.OPEN_QUIET_WINDOW; delete process.env.INDEX_PREWARM;

const gate = await import('../server/lib/heavy-job-gate');
const gex = await import('../server/gex-snapshot-service');
const ratio = await import('../server/spx-ratio');
const health = await import('../server/index-engine-health');
const prewarm = await import('../server/index-prewarm');

const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 2026-10-01 (Thu) is EDT: 09:30 ET = 13:30Z.
const DAY = '2026-10-01';
const OPEN = Date.parse(`${DAY}T13:30:00Z`);
const et = (h: number, m: number, s = 0) => OPEN + ((h * 60 + m) - 570) * 60_000 + s * 1000;
const SATURDAY = Date.parse('2026-10-03T13:35:00Z');

// ─── gate: open quiet window ────────────────────────────────────────────

t('quiet window: deferrable jobs wait for 09:45 ET, the index/0DTE/tracker/bot jobs do not', () => {
  const at = et(9, 31);
  for (const n of ['gex-rank:AAPL', 'producer:sector-board', 'producer:sector-board:bootstrap', 'convictions-warm', 'chart-gex:NVDA', 'self-learning', 'producer:quant', 'producer:index-swing', 'producer:gex-setups']) {
    assert.equal(gate.openQuietDeferMs(n, at), 14 * 60_000, n);
  }
  for (const n of ['producer:index-0dte', 'producer:index-prewarm', 'producer:0dte-desk', 'zero-dte-flow:SPY', 'outcome-tracker', 'quant-bot:web', 'chart-gex:SPY', 'chart-gex:SPX', 'flow-scan', 'producer:premarket-triggers']) {
    assert.equal(gate.openQuietDeferMs(n, at), 0, n);
  }
});

t('quiet window: boundaries, weekend, kill switch', () => {
  assert.equal(gate.openQuietDeferMs('convictions-warm', et(9, 29, 59)), 0);
  assert.equal(gate.openQuietDeferMs('convictions-warm', et(9, 30)), 15 * 60_000);
  assert.equal(gate.openQuietDeferMs('convictions-warm', et(9, 44, 30)), 30_000);
  assert.equal(gate.openQuietDeferMs('convictions-warm', et(9, 45)), 0);
  assert.equal(gate.openQuietDeferMs('convictions-warm', SATURDAY), 0);
  process.env.OPEN_QUIET_WINDOW = 'off';
  try { assert.equal(gate.openQuietDeferMs('convictions-warm', et(9, 35)), 0); } finally { delete process.env.OPEN_QUIET_WINDOW; }
});

t('quiet window: a deferred job runs at 09:45, a second submit is dropped, non-deferrable runs now', async () => {
  let fake = et(9, 44, 59) + 600; // 400 ms before 09:45
  gate.__setGateClock(() => fake);
  try {
    const order: string[] = [];
    const p1 = gate.runHeavy('convictions-warm', async () => { order.push('warm'); return 'warm'; }, { priority: 'low' });
    const p2 = gate.runHeavy('convictions-warm', async () => { order.push('warm-dup'); return 'dup'; }, { priority: 'low' });
    const p3 = gate.runHeavy('producer:index-0dte', async () => { order.push('index'); return 'index'; }, { priority: 'high' });
    assert.equal(await p2, undefined, 'duplicate deferred submit is dropped');
    assert.equal(await p3, 'index');
    assert.deepEqual(order, ['index']);
    assert.ok(gate.heavyGateStats().deferredToOpenEnd.includes('convictions-warm'));
    fake = et(9, 45, 1); // the clock passes 09:45 before the timer fires
    assert.equal(await p1, 'warm');
    assert.deepEqual(order, ['index', 'warm']);
    assert.equal(gate.heavyGateStats().deferredToOpenEnd.length, 0);
  } finally { gate.__setGateClock(null); }
});

t('index lane: an index job starts while a main-lane job holds the only main slot', async () => {
  let releaseMain!: () => void;
  const mainHeld = new Promise<void>((r) => { releaseMain = r; });
  const main = gate.runHeavy('test:main-long', () => mainHeld.then(() => 'main'));
  const queuedMain = gate.runHeavy('test:main-high', async () => 'main-high', { priority: 'high' });
  const t0 = Date.now();
  const idx = await gate.runHeavy('test:index', async () => 'index', { lane: 'index', priority: 'high' });
  assert.equal(idx, 'index');
  assert.ok(Date.now() - t0 < 200, 'index lane did not wait for the main lane');
  const s = gate.heavyGateStats();
  assert.ok(s.running.some((r) => r.name === 'test:main-long' && r.lane === 'main'));
  assert.ok(s.queued.some((q) => q.name === 'test:main-high'), 'main-lane high job still waits for the main slot');
  releaseMain();
  assert.equal(await main, 'main');
  assert.equal(await queuedMain, 'main-high');
});

t('index lane: one index job at a time, FIFO inside the lane', async () => {
  const order: string[] = [];
  const a = gate.runHeavy('test:idx-a', async () => { order.push('a+'); await sleep(30); order.push('a-'); }, { lane: 'index' });
  const b = gate.runHeavy('test:idx-b', async () => { order.push('b+'); order.push('b-'); }, { lane: 'index' });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['a+', 'a-', 'b+', 'b-']);
});

// ─── gex snapshot service ──────────────────────────────────────────────

const agg = (spot: number) => ({ spotPrice: spot, flipPoint: spot - 2, callWall: spot + 5, putWall: spot - 5, regime: 'negative_gamma', vexRegime: null, totalNetGEX: -1, regimeRead: { regime: 'negative' } } as any);

t('gex: a timed-out computation is cached when it lands (late fill), not thrown away', async () => {
  let calls = 0;
  gex.__setGexComputeForTest(async () => { calls++; await sleep(80); return agg(670); });
  try {
    const first = await gex.getGexSnapshotBatch(['SPY'], { timeoutMs: 20 });
    assert.equal(first.has('SPY'), false, 'timed out → absent this pass');
    await sleep(120);
    const peek = gex.peekGexSnapshot('SPY');
    assert.ok(peek, 'late result cached');
    assert.equal(peek!.snap.spot, 670);
    const second = await gex.getGexSnapshotBatch(['SPY'], { timeoutMs: 20 });
    assert.equal(second.get('SPY')?.spot, 670);
    assert.equal(calls, 1, 'served from cache, no second computation');
  } finally { gex.__setGexComputeForTest(null); }
});

t('gex: a failed refresh keeps the last good snapshot (with its own fetchedAt)', async () => {
  let fail = false;
  gex.__setGexComputeForTest(async () => (fail ? null : agg(671)));
  try {
    const a = await gex.getGexSnapshotBatch(['SPY']);
    const fetchedAt = a.get('SPY')!.fetchedAt;
    fail = true;
    const b = await gex.getGexSnapshotBatch(['SPY'], { maxAgeMs: 0 }); // force a refresh
    assert.equal(b.get('SPY')?.spot, 671, 'last good kept through the failure');
    assert.equal(b.get('SPY')?.fetchedAt, fetchedAt, 'age is not hidden');
  } finally { gex.__setGexComputeForTest(null); }
});

t('gex: maxAgeMs forces a refresh of a fresh-enough snapshot (prewarm refresh)', async () => {
  let spot = 600;
  gex.__setGexComputeForTest(async () => agg(++spot));
  try {
    assert.equal((await gex.getGexSnapshotBatch(['QQQ'])).get('QQQ')?.spot, 601);
    assert.equal((await gex.getGexSnapshotBatch(['QQQ'])).get('QQQ')?.spot, 601, 'default: 5-min cache');
    await sleep(5);
    assert.equal((await gex.getGexSnapshotBatch(['QQQ'], { maxAgeMs: 1 })).get('QQQ')?.spot, 602, 'refresh');
  } finally { gex.__setGexComputeForTest(null); }
});

// ─── SPX / SPY ratio ────────────────────────────────────────────────────

t('ratio: live when both reads are fresh; remembered with asOf', () => {
  const now = et(10, 20);
  const r = ratio.resolveSpxRatio({ price: 6745.2, atMs: now - 10_000 }, { price: 671.0, atMs: now - 5_000 }, null, now);
  assert.equal(r.ratio?.source, 'live');
  assert.ok(Math.abs(r.ratio!.ratio - 6745.2 / 671.0) < 1e-9);
  assert.notEqual(r.ratio!.ratio, 10);
  assert.equal(r.remember?.asOfMs, now - 10_000);
  assert.match(r.ratio!.label, /^SPX\/SPY 10\.05\d \(live\)$/);
});

t('ratio: SPX read stale/missing → last live ratio, labelled with its ET time and age — never ×10', () => {
  const now = et(10, 20);
  const last = { ratio: 10.052, asOfMs: et(9, 41) };
  for (const spx of [null, { price: 6700, atMs: now - 5 * 60_000 }]) {
    const r = ratio.resolveSpxRatio(spx, { price: 671, atMs: now }, last, now);
    assert.equal(r.ratio?.source, 'last_live');
    assert.equal(r.ratio?.ratio, 10.052);
    assert.equal(r.remember, null);
    assert.equal(r.ratio?.label, 'SPX/SPY 10.052 (last live 09:41 ET, 39 min old)');
  }
});

t('ratio: nothing on record → null (caller does not translate); implausible prints rejected', () => {
  const now = et(10, 20);
  assert.equal(ratio.resolveSpxRatio(null, { price: 671, atMs: now }, null, now).ratio, null);
  assert.equal(ratio.resolveSpxRatio({ price: 671, atMs: now }, { price: 671, atMs: now }, null, now).ratio, null, 'SPX=SPY print');
  assert.equal(ratio.resolveSpxRatio(null, null, { ratio: 10.05, asOfMs: now - 8 * 864e5 }, now).ratio, null, 'last live older than 7 days');
});

t('ratio IO: a live read is persisted; when Yahoo then fails the last live ratio is used', async () => {
  const now = Date.now();
  let up = true;
  ratio.__setSpxRatioQuotesForTest(async (s) => (!up ? null : s === 'SPY' ? { currentPrice: 670, fetchedAt: new Date(now).toISOString() } : { currentPrice: 6734.5, fetchedAt: new Date(now).toISOString() }));
  try {
    const live = await ratio.getSpxPerSpy(null, { nowMs: now });
    assert.equal(live?.source, 'live');
    assert.ok(fs.existsSync(path.join(process.env.SHARED_STATE_DIR!, 'spx-spy-ratio.json')), 'persisted for restarts');
    up = false;
    const fb = await ratio.getSpxPerSpy({ price: 671, atMs: now }, { nowMs: now + 60_000 });
    assert.equal(fb?.source, 'last_live');
    assert.ok(Math.abs(fb!.ratio - 6734.5 / 670) < 1e-9);
    assert.match(fb!.label, /last live \d\d:\d\d ET, 1 min old/);
  } finally { ratio.__setSpxRatioQuotesForTest(null); }
});

// ─── watchdog ───────────────────────────────────────────────────────────

const snapAt = (ms: number) => ({ fetchedAt: new Date(ms).toISOString() });

t('health: pre-open misses do not count; 3 consecutive in-session misses → blind since the open, one alert', () => {
  let s = health.emptyHealthState();
  let r = health.stepIndexHealth(s, { kind: 'cycle', at: et(9, 22), spyOk: false, source: 'prewarm' });
  assert.equal(r.state.consecutiveMisses, 0);
  s = r.state;
  const transitions: Array<string | null> = [];
  for (const m of [30, 32, 34, 36]) {
    r = health.stepIndexHealth(s, { kind: 'cycle', at: et(9, m), spyOk: false, source: 'prewarm', reason: 'no SPY GEX snapshot (chain fetch failed or timed out)' });
    s = r.state; transitions.push(r.transition);
  }
  assert.deepEqual(transitions, [null, null, 'blind', null], 'alert edge fires once');
  const v = health.healthView(s, et(9, 36));
  assert.equal(v.status, 'blind');
  assert.equal(v.blindSinceEt, '09:30');
  assert.equal(v.banner, 'Index engine blind since 09:30 ET — no SPY GEX snapshot (chain fetch failed or timed out). No SPX/SPY/QQQ/IWM 0DTE calls until it recovers.');
  r = health.stepIndexHealth(s, { kind: 'cycle', at: et(9, 50), spyOk: true, source: 'scan' });
  assert.equal(r.transition, 'recovered');
  assert.equal(health.healthView(r.state, et(9, 50)).status, 'ok');
  assert.equal(health.healthView(r.state, et(9, 50)).banner, null);
});

t('health: blind since the streak start when SPY was fine earlier', () => {
  let s = health.emptyHealthState();
  s = health.stepIndexHealth(s, { kind: 'cycle', at: et(9, 40), spyOk: true, source: 'prewarm' }).state;
  let tr: string | null = null;
  for (const m of [10 * 60 + 5, 10 * 60 + 10, 10 * 60 + 15]) {
    const r = health.stepIndexHealth(s, { kind: 'cycle', at: et(Math.floor(m / 60), m % 60), spyOk: false, source: 'scan' });
    s = r.state; tr = r.transition ?? tr;
  }
  assert.equal(tr, 'blind');
  assert.equal(health.healthView(s, et(10, 15)).blindSinceEt, '10:05');
});

t('health: 09:33 open check with no usable SPY snapshot → blind since 09:30 at once', () => {
  const r = health.stepIndexHealth(health.emptyHealthState(), { kind: 'open-check', at: et(9, 33), spyOk: false, reason: 'no SPY GEX snapshot at 09:33 ET' });
  assert.equal(r.transition, 'blind');
  assert.equal(health.healthView(r.state, et(9, 33)).blindSinceEt, '09:30');
  const ok = health.stepIndexHealth(health.emptyHealthState(), { kind: 'open-check', at: et(9, 33), spyOk: true });
  assert.equal(ok.transition, null);
  assert.equal(health.healthView(ok.state, et(9, 33)).status, 'ok');
});

t('health: a new day starts clean; yesterday\'s blind state is "unknown" today', () => {
  const r = health.stepIndexHealth(health.emptyHealthState(), { kind: 'open-check', at: et(9, 33), spyOk: false });
  assert.equal(health.healthView(r.state, et(9, 33) + 864e5).status, 'unknown');
  const next = health.stepIndexHealth(r.state, { kind: 'cycle', at: et(9, 22) + 864e5, spyOk: false, source: 'prewarm' });
  assert.equal(next.state.blindSince, null);
});

t('health: a snapshot older than 10 min is not usable', () => {
  assert.equal(health.spySnapshotUsable(snapAt(et(9, 40)), et(9, 49)), true);
  assert.equal(health.spySnapshotUsable(snapAt(et(9, 40)), et(9, 51)), false);
  assert.equal(health.spySnapshotUsable(null, et(9, 51)), false);
});

t('health IO: ERROR alert once via the ops path, recovery note, shared-state status for the desk', async () => {
  const alerts: Array<[string, string]> = [];
  let now = et(9, 33);
  process.env.ROLE = 'all';
  health.__setIndexHealthForTest({ alert: async (text, level) => { alerts.push([level, text]); }, clock: () => now, reset: true });
  try {
    health.runOpenCheck(null);
    now = et(9, 34); health.noteIndexCycle('prewarm', null);
    now = et(9, 36); health.noteIndexCycle('prewarm', null);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0][0], 'error');
    assert.match(alerts[0][1], /BLIND since 09:30 ET — no SPY GEX snapshot at 09:33 ET/);
    const v = health.getIndexEngineHealth();
    assert.equal(v.status, 'blind');
    assert.match(v.banner ?? '', /^Index engine blind since 09:30 ET/);
    now = et(9, 38); health.noteIndexCycle('prewarm', snapAt(et(9, 37, 30)));
    assert.equal(alerts.length, 2);
    assert.equal(alerts[1][0], 'info');
    assert.equal(health.getIndexEngineHealth().status, 'ok');

    // ROLE=web reads the worker's file.
    now = et(9, 40); health.noteIndexCycle('prewarm', null); health.noteIndexCycle('prewarm', null); health.noteIndexCycle('prewarm', null);
    process.env.ROLE = 'worker'; health.noteIndexCycle('prewarm', null); // worker writes the shared file
    process.env.ROLE = 'web';
    const web = health.getIndexEngineHealth();
    assert.equal(web.status, 'blind');
    assert.equal(web.source, 'worker');
    assert.equal(web.blindSinceEt, '09:40');
  } finally {
    delete process.env.ROLE;
    health.__setIndexHealthForTest({ alert: null, clock: null, reset: true });
  }
});

t('health: the ops webhook is never a trader-facing DISCORD_WEBHOOK_*', () => {
  const femi = 'https://discord.com/api/webhooks/1/femi';
  assert.equal(health.opsWebhookUrl({ ERROR_WEBHOOK_URL: 'https://discord.com/api/webhooks/2/ops' } as any), 'https://discord.com/api/webhooks/2/ops');
  assert.equal(health.opsWebhookUrl({ OPS_ALERT_WEBHOOK_URL: 'https://x/ops2', ERROR_WEBHOOK_URL: 'https://x/ops' } as any), 'https://x/ops2');
  assert.equal(health.opsWebhookUrl({ ERROR_WEBHOOK_URL: femi, DISCORD_WEBHOOK_QUANTFLOOR: femi } as any), null);
  assert.equal(health.opsWebhookUrl({ DISCORD_WEBHOOK_URL: femi } as any), null, 'no ops webhook configured → nothing');
});

// ─── prewarm ────────────────────────────────────────────────────────────

t('prewarm: phases — warm 09:20–09:29, refresh 09:30–10:00, nothing else / weekends', () => {
  assert.equal(prewarm.prewarmPhase(et(9, 19)), null);
  assert.equal(prewarm.prewarmPhase(et(9, 20)), 'warm');
  assert.equal(prewarm.prewarmPhase(et(9, 28)), 'warm');
  assert.equal(prewarm.prewarmPhase(et(9, 30)), 'refresh');
  assert.equal(prewarm.prewarmPhase(et(10, 0)), 'refresh');
  assert.equal(prewarm.prewarmPhase(et(10, 1)), null);
  assert.equal(prewarm.prewarmPhase(SATURDAY), null);
});

t('prewarm: SPY first, then QQQ/IWM; SPX chain warmed; ratio only after the open; watchdog fed', async () => {
  const order: string[] = [];
  gex.__setGexComputeForTest(async (s) => { order.push(s); return s === 'IWM' ? null : agg(s === 'SPY' ? 670 : 600); });
  let ratioCalls = 0;
  prewarm.__setPrewarmExtrasForTest({ spx: async () => ({ ok: true, source: 'CBOE delayed (~15 min)' }), ratio: async () => { ratioCalls++; return 'SPX/SPY 10.050 (live)'; } });
  let now = et(9, 22);
  health.__setIndexHealthForTest({ alert: async () => undefined, clock: () => now, reset: true });
  try {
    const w = await prewarm.runIndexPrewarm(et(9, 22));
    assert.deepEqual(order, ['SPY', 'QQQ', 'IWM']);
    assert.equal(w.phase, 'warm');
    assert.deepEqual(w.ok, ['SPY', 'QQQ']);
    assert.deepEqual(w.failed, ['IWM']);
    assert.equal(w.spx?.ok, true);
    assert.equal(ratioCalls, 0, 'no ratio before the cash open');
    now = et(9, 32);
    const r = await prewarm.runIndexPrewarm(et(9, 32));
    assert.equal(r.phase, 'refresh');
    assert.equal(ratioCalls, 1);
    assert.equal(health.getIndexEngineHealth().status, 'ok');
    assert.equal((await prewarm.runIndexPrewarm(et(10, 5))).phase, null);
  } finally {
    gex.__setGexComputeForTest(null);
    prewarm.__setPrewarmExtrasForTest({});
    health.__setIndexHealthForTest({ alert: null, clock: null, reset: true });
  }
});

// ─── 0DTE desk payload ──────────────────────────────────────────────────

t('desk: indexEngineHealth is exposed for the banner', async () => {
  let now = et(9, 33);
  health.__setIndexHealthForTest({ alert: async () => undefined, clock: () => now, reset: true });
  try {
    health.runOpenCheck(null);
    const { deskIndexHealth } = await import('../server/zero-dte-desk');
    const h = await deskIndexHealth();
    assert.equal(h?.status, 'blind');
    assert.equal(h?.blindSinceEt, '09:30');
  } finally { health.__setIndexHealthForTest({ alert: null, clock: null, reset: true }); }
});

let failed = 0;
const keepAlive = setInterval(() => undefined, 1_000); // the gate's deferral timers are unref'd
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).stack?.split('\n').slice(0, 4).join('\n    ')}`); }
}
clearInterval(keepAlive);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
