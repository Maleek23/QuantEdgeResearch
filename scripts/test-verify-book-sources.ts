/**
 * Option-bar source chain for research/verify-nexus-book.ts, driven with mocked
 * HTTP (no network): Massive 1m → 5m → trades → Alpaca → Yahoo, entitlement
 * detection (403 / NOT_AUTHORIZED / 401), exact expiry settlement, and the
 * --only-unverifiable ledger merge.
 *   npx tsx scripts/test-verify-book-sources.ts
 */
import assert from 'node:assert/strict';
import {
  classifyMassive, expirySettlement, MassiveEntitlement, mergeRechecked, optionBarChain, tradesToBars, unverifiableIds,
  type ChainDeps, type HttpResult,
} from '../research/verify-nexus-book-sources';

let failures = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ok  ${name}`); } catch (e) { failures++; console.error(`  FAIL ${name}\n       ${(e as Error).message}`); }
}

const OCC = 'AAPL261016C00250000';
const T0 = Date.parse('2026-10-05T14:00:00Z');
const T1 = Date.parse('2026-10-05T18:00:00Z');
const agg = (t: number, c: number) => ({ t, o: c, h: c + 0.1, l: c - 0.1, c, v: 10 });
const OK = (body: any): HttpResult => ({ status: 200, body: { status: 'OK', ...body } });
const NOT_ENTITLED: HttpResult = { status: 403, body: { status: 'NOT_AUTHORIZED', request_id: 'x', message: 'You are not entitled to this data. Please upgrade your plan at https://massive.com/pricing' } };

type Route = [RegExp, (url: string) => HttpResult | null];
function mkDeps(massiveRoutes: Route[] | null, jsonRoutes: [RegExp, (url: string) => any][] = [], opts: { alpaca?: boolean } = {}) {
  const calls = { massive: [] as string[], json: [] as string[] };
  const ent = new MassiveEntitlement(massiveRoutes != null);
  const refusals: string[] = [];
  ent.onRefusal = (ep, kind) => refusals.push(`${ep}:${kind}`);
  const deps: ChainDeps = {
    massive: massiveRoutes == null ? null : async (_key, url) => {
      calls.massive.push(url);
      const r = massiveRoutes.find(([re]) => re.test(url));
      return r ? r[1](url) : OK({ resultsCount: 0 });
    },
    entitlement: ent,
    alpaca: opts.alpaca === false ? null : { id: 'id', secret: 'secret' },
    json: async (_key, url) => {
      calls.json.push(url);
      const r = jsonRoutes.find(([re]) => re.test(url));
      return r ? r[1](url) : {};
    },
    now: () => Date.parse('2026-10-07T12:00:00Z'),
  };
  return { deps, calls, ent, refusals };
}
const AGG1 = /\/v2\/aggs\/ticker\/O:.*\/range\/1\/minute\//;
const AGG5 = /\/v2\/aggs\/ticker\/O:.*\/range\/5\/minute\//;
const TRADES = /\/v3\/trades\/O:/;
const ALPACA = /data\.alpaca\.markets\/v1beta1\/options\/bars/;
const YAHOO = /query1\.finance\.yahoo\.com\/v8\/finance\/chart\/AAPL26/;

console.log('verify-nexus-book source chain');

await test('classifyMassive: entitlement, key, rate-limit, ok/delayed, error', () => {
  assert.equal(classifyMassive(NOT_ENTITLED).kind, 'not_entitled');
  assert.equal(classifyMassive({ status: 200, body: { status: 'NOT_AUTHORIZED', message: 'nope' } }).kind, 'not_entitled');
  assert.equal(classifyMassive({ status: 401, body: { status: 'ERROR', error: 'Unknown API Key' } }).kind, 'bad_key');
  assert.equal(classifyMassive({ status: 429, body: { status: 'ERROR', error: "You've exceeded the maximum requests per minute" } }).kind, 'rate_limited');
  assert.equal(classifyMassive(OK({})).kind, 'ok');
  assert.equal(classifyMassive({ status: 200, body: { status: 'DELAYED' } }).kind, 'ok');
  assert.equal(classifyMassive({ status: 200, body: { status: 'ERROR', error: 'boom' } }).kind, 'error');
  assert.equal(classifyMassive(null).kind, 'error');
});

await test('Massive 1m bars win; nothing else is called', async () => {
  const { deps, calls } = mkDeps([[AGG1, () => OK({ results: [agg(T0 + 60_000, 2.1), agg(T0, 2)] })]]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(r.source, `massive:O:${OCC}:1m`);
  assert.deepEqual(r.bars.map((b) => b.c), [2, 2.1]); // sorted
  assert.equal(calls.massive.length, 1);
  assert.equal(calls.json.length, 0);
  assert.ok(!calls.massive[0].includes('apiKey'), 'key must never be in the URL');
  assert.ok(calls.massive[0].includes(`/${T0}/${T1}?`), 'ms bounds');
});

await test('1m empty → 5m bars', async () => {
  const { deps, calls } = mkDeps([[AGG5, () => OK({ results: [agg(T0, 3)] })]]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(r.source, `massive:O:${OCC}:5m`);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ['empty', 'bars']);
  assert.equal(calls.massive.length, 2);
});

await test('aggs empty → trades rolled into 1m OHLCV bars (ns timestamps)', async () => {
  const ns = (ms: number) => `${ms}000000`;
  const { deps, calls } = mkDeps([[TRADES, () => OK({ results: [
    { sip_timestamp: Number(ns(T0 + 5_000)), price: 1.0, size: 2 },
    { sip_timestamp: Number(ns(T0 + 50_000)), price: 1.4, size: 1 },
    { sip_timestamp: Number(ns(T0 + 20_000)), price: 0.9, size: 3 },
    { sip_timestamp: Number(ns(T0 + 65_000)), price: 1.2, size: 5 },
  ] })]]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(r.source, `massive:O:${OCC}:trades`);
  assert.equal(r.bars.length, 2);
  assert.deepEqual(r.bars[0], { t: T0, o: 1.0, h: 1.4, l: 0.9, c: 1.4, v: 6 });
  assert.deepEqual(r.bars[1], { t: T0 + 60_000, o: 1.2, h: 1.2, l: 1.2, c: 1.2, v: 5 });
  const tradesUrl = calls.massive.find((u) => TRADES.test(u))!;
  assert.ok(tradesUrl.includes(`timestamp.gte=${T0}000000`) && tradesUrl.includes(`timestamp.lte=${T1}000000`), 'ns bounds as exact strings');
});

await test('aggs NOT ENTITLED → refusal reported once, 5m skipped, trades tried; then Alpaca', async () => {
  const { deps, calls, ent, refusals } = mkDeps(
    [[AGG1, () => NOT_ENTITLED], [AGG5, () => NOT_ENTITLED], [TRADES, () => NOT_ENTITLED]],
    [[ALPACA, () => ({ bars: { [OCC]: [{ t: new Date(T0).toISOString(), o: 1, h: 1.2, l: 0.9, c: 1.1, v: 4 }] }, next_page_token: null })]],
  );
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(r.source, `alpaca:${OCC}:1Min(indicative)`);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ['not_entitled', 'skipped', 'not_entitled', 'bars']);
  assert.match(r.attempts[0].detail ?? '', /not entitled/i);
  assert.deepEqual(refusals, ['optionAggs:not_entitled', 'optionTrades:not_entitled']);
  assert.equal(calls.massive.length, 2);
  // Second contract: no Massive calls at all — the refusal is remembered.
  await optionBarChain('AAPL261016P00200000', T0, T1, deps);
  assert.equal(calls.massive.length, 2);
  const rep = ent.report();
  assert.equal(rep.state.optionAggs, 'not_entitled');
  assert.equal(rep.state.optionTrades, 'not_entitled');
  assert.equal(rep.state.stockDaily, 'unknown');
  assert.equal(rep.refusal.optionAggs?.status, 403);
  assert.equal(rep.needs.length, 2);
});

await test('401 bad key stops every Massive endpoint', async () => {
  const { deps, calls, ent } = mkDeps([[AGG1, () => ({ status: 401, body: { status: 'ERROR', error: 'Unknown API Key' } })]],
    [[YAHOO, () => ({ chart: { result: [{ timestamp: [T0 / 1000], indicators: { quote: [{ open: [1], high: [1], low: [1], close: [1], volume: [3] }] } }] } })]]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(calls.massive.length, 1);
  assert.equal(r.source, `yahoo-opr:${OCC}:1m`);
  assert.deepEqual(Object.values(ent.report().state), ['bad_key', 'bad_key', 'bad_key']);
});

await test('rate-limited / error answers fall through without poisoning entitlement', async () => {
  const { deps, ent } = mkDeps([[AGG1, () => ({ status: 429, body: { status: 'ERROR' } })], [AGG5, () => null]]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.deepEqual(r.attempts.slice(0, 2).map((a) => a.outcome), ['rate_limited', 'error']);
  assert.equal(ent.report().state.optionAggs, 'unknown');
  assert.equal(ent.report().rateLimited, 1);
});

await test('every source empty → none, six attempts in order', async () => {
  const { deps } = mkDeps([]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(r.source, 'none');
  assert.deepEqual(r.attempts.map((a) => a.source.split(':')[0] + ':' + a.source.split(':').pop()),
    ['massive:1m', 'massive:5m', 'massive:trades', 'alpaca:1Min(indicative)', 'yahoo-opr:1m', 'yahoo-opr:5m']);
});

await test('no key → Massive skipped (no calls), old chain still works', async () => {
  const { deps, calls } = mkDeps(null, [], { alpaca: false });
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(calls.massive.length, 0);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ['skipped', 'skipped', 'skipped', 'skipped', 'empty', 'empty']);
});

await test('pagination follows Massive next_url only', async () => {
  const { deps, calls } = mkDeps([
    [/cursor=abc/, () => OK({ results: [agg(T0 + 60_000, 2)] })],
    [AGG1, () => OK({ results: [agg(T0, 1)], next_url: 'https://api.polygon.io/v2/aggs/ticker/O:X/range/1/minute/1/2?cursor=abc' })],
  ]);
  const r = await optionBarChain(OCC, T0, T1, deps);
  assert.equal(r.bars.length, 2);
  assert.equal(calls.massive.length, 2);
  const { deps: d2, calls: c2 } = mkDeps([[AGG1, () => OK({ results: [agg(T0, 1)], next_url: 'https://evil.example/steal' })]]);
  await optionBarChain(OCC, T0, T1, d2);
  assert.equal(c2.massive.length, 1);
});

await test('tradesToBars drops bad prints', () => {
  assert.deepEqual(tradesToBars([{ sip_timestamp: null, price: 1 }, { sip_timestamp: 1e15, price: 0 }, { participant_timestamp: T0 * 1e6, price: 2, size: 1 }]),
    [{ t: T0, o: 2, h: 2, l: 2, c: 2, v: 1 }]);
});

// ─── settlement ──────────────────────────────────────────────
const DAY = '2026-10-02'; // a Friday, not the third
const yDaily = (rows: [string, number, number][]) => ({ chart: { result: [{ timestamp: rows.map(([d]) => Date.parse(`${d}T13:30:00Z`) / 1000),
  indicators: { quote: [{ open: rows.map((r) => r[1]), high: rows.map((r) => Math.max(r[1], r[2]) + 1), low: rows.map((r) => Math.min(r[1], r[2]) - 1), close: rows.map((r) => r[2]), volume: rows.map(() => 1) }] } }] } });

await test('equity settlement: Massive unadjusted close of the expiry day → exact intrinsic', async () => {
  const { deps, calls } = mkDeps([[/\/v2\/aggs\/ticker\/AAPL\/range\/1\/day\/2026-10-02\/2026-10-02\?adjusted=false/, () => OK({ results: [{ t: Date.parse(`${DAY}T04:00:00Z`), o: 250, h: 260, l: 249, c: 257.43 }] })]]);
  const call = await expirySettlement('AAPL', DAY, 'call', 250, deps);
  assert.equal(call?.S, 257.43);
  assert.equal(call?.intrinsic, 7.43);
  assert.equal(call?.source, 'massive:AAPL:1d(unadjusted)');
  assert.equal(call?.approximate, null);
  const put = await expirySettlement('AAPL', DAY, 'put', 250, deps);
  assert.equal(put?.intrinsic, 0);
  assert.equal(calls.json.length, 0);
});

await test('equity settlement: Massive not entitled → Yahoo daily of that exact day', async () => {
  const { deps } = mkDeps([[/\/range\/1\/day\//, () => NOT_ENTITLED]], [[/chart\/AAPL\?/, () => yDaily([['2026-10-01', 1, 240], [DAY, 1, 245.5]])]]);
  const s = await expirySettlement('AAPL', DAY, 'put', 250, deps);
  assert.equal(s?.S, 245.5);
  assert.equal(s?.intrinsic, 4.5);
  assert.equal(s?.source, 'yahoo:AAPL:1d');
  assert.equal(deps.entitlement.report().state.stockDaily, 'not_entitled');
});

await test('settlement never uses a neighbouring day', async () => {
  const { deps } = mkDeps(null, [[/chart\/AAPL\?/, () => yDaily([['2026-10-01', 1, 240], ['2026-10-05', 1, 241]])]]);
  assert.equal(await expirySettlement('AAPL', DAY, 'call', 200, deps), null);
});

await test('index roots: SPXW PM close; SPX third-Friday AM open flagged; XSP ÷10; VIX none', async () => {
  const { deps, calls } = mkDeps([], [[/chart\/%5EGSPC\?/, () => yDaily([[DAY, 6600, 6650.25], ['2026-09-18', 6500, 6520]])]]);
  const w = await expirySettlement('SPXW', DAY, 'call', 6600, deps);
  assert.equal(w?.intrinsic, 50.25);
  assert.equal(w?.approximate, null);
  assert.equal(calls.massive.length, 0, 'indices are not priced from Massive stocks');
  const am = await expirySettlement('SPX', '2026-09-18', 'put', 6550, deps);
  assert.equal(am?.field, 'open');
  assert.equal(am?.intrinsic, 50);
  assert.ok(am?.approximate);
  const xsp = await expirySettlement('XSP', DAY, 'call', 660, deps);
  assert.equal(xsp?.S, 665.03);
  assert.equal(await expirySettlement('VIX', DAY, 'call', 20, deps), null);
});

// ─── merge ───────────────────────────────────────────────────
await test('--only-unverifiable: ids + merge keeps order, tags previous verdict', () => {
  const t = (id: string, verdict: string, reason = '') => ({ id, verdict, reason, evidence: {} as Record<string, unknown> });
  const prior = { trades: [t('a', 'VERIFIED'), t('b', 'UNVERIFIABLE', 'no bars'), t('c', 'MISMATCH'), t('d', 'UNVERIFIABLE', 'no bars')] };
  assert.deepEqual(unverifiableIds(prior), ['b', 'd']);
  assert.deepEqual(unverifiableIds({}), []);
  const m = mergeRechecked(prior.trades, [t('d', 'MISMATCH', 'settlement'), t('b', 'VERIFIED', 'massive')]);
  assert.deepEqual(m.trades.map((x) => `${x.id}:${x.verdict}`), ['a:VERIFIED', 'b:VERIFIED', 'c:MISMATCH', 'd:MISMATCH']);
  assert.equal(m.replaced, 2);
  assert.equal(m.added, 0);
  assert.deepEqual(m.transitions, { 'UNVERIFIABLE→MISMATCH': 1, 'UNVERIFIABLE→VERIFIED': 1 });
  assert.deepEqual(m.trades[1].evidence.previous, { verdict: 'UNVERIFIABLE', reason: 'no bars' });
  assert.equal(m.trades[0], prior.trades[0], 'untouched rows are the same objects');
});

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
