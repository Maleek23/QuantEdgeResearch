/**
 * Batch B "state you can trust" checks: URL view-state encode/decode, the
 * optimistic-update / deferred-delete (Undo) helpers, and the watchlist order.
 *   npx tsx scripts/test-batchb-state.ts
 */
import assert from 'node:assert/strict';
import {
  cleanSym, idSet, intIn, oneOf, readParam, readSym, sortCodec, text, withParams,
} from '../client/src/lib/url-state';
import {
  deferCommit, flushPendingCommits, inverseOf, moveItem, orderBy, patchWhere, pendingCommitCount,
  reasonOf, removeWhere, runOptimistic, toggleIn,
} from '../client/src/lib/optimistic';
import { applyWatchlistOrder, sanitizeWatchlistOrder, MAX_WATCHLIST_ORDER } from '../shared/watchlist-order';

async function main() {
  // ── URL: symbols ──
  assert.equal(cleanSym(' nvda '), 'NVDA');
  assert.equal(cleanSym('BRK.B'), 'BRK.B');
  assert.equal(cleanSym('^SPX'), '^SPX');
  for (const bad of [null, undefined, '', '   ', 'NVDA<script>', 'A'.repeat(13), 'a b', 'javascript:1']) assert.equal(cleanSym(bad as any), null, `rejects ${bad}`);
  assert.equal(readSym('?tab=gex&sym=nvda'), 'NVDA');
  assert.equal(readSym('?sym=%3Cx%3E'), null);
  assert.equal(readSym(''), null);

  // ── URL: withParams (set / delete / keep the rest, stable order, hash kept) ──
  assert.equal(withParams('/t?tab=gex', { sym: 'NVDA' }), '/t?tab=gex&sym=NVDA');
  assert.equal(withParams('/t?tab=gex&sym=NVDA', { sym: 'AAPL' }), '/t?tab=gex&sym=AAPL', 'existing key keeps its place');
  assert.equal(withParams('/t?tab=gex&sym=NVDA&idea=x', { idea: null }), '/t?tab=gex&sym=NVDA');
  assert.equal(withParams('/t?sym=NVDA', { sym: null }), '/t', 'last param removed → no dangling ?');
  assert.equal(withParams('/t?tab=flow#top', { 'f.days': '5' }), '/t?tab=flow&f.days=5#top');
  assert.equal(withParams('/t?tab=flow', { 'f.q': '' }), '/t?tab=flow', 'empty string deletes');
  assert.equal(withParams('/t?tab=flow&f.chips=sweeps%2Cputs', {}), '/t?tab=flow&f.chips=sweeps%2Cputs', 'no-op patch is identity');

  // ── URL: codecs round-trip, defaults omitted, junk rejected ──
  const metric = oneOf(['gex', 'vex'] as const, 'gex');
  assert.equal(metric.enc('gex'), null, 'default omitted');
  assert.equal(metric.enc('vex'), 'vex');
  assert.equal(metric.dec('vex'), 'vex');
  assert.equal(metric.dec('dex'), undefined);

  const days = intIn(1, 5, 1);
  assert.equal(days.enc(1), null);
  assert.equal(days.enc(5), '5');
  assert.equal(days.dec('5'), 5);
  for (const bad of ['0', '6', '2.5', 'x', '']) assert.equal(days.dec(bad), undefined, `days rejects ${bad}`);

  const q = text(12);
  assert.equal(q.enc('  '), null);
  assert.equal(q.enc(' nvda '), 'nvda');
  assert.equal(q.dec('A'.repeat(40)).length, 12, 'text is capped');

  const chips = idSet(['etfs', 'calls', 'puts', 'sweeps'] as const);
  assert.equal(chips.enc([]), null);
  assert.equal(chips.enc(['sweeps', 'calls']), 'calls,sweeps', 'stable canonical order');
  assert.deepEqual(chips.dec('sweeps,calls'), ['calls', 'sweeps']);
  assert.deepEqual(chips.dec('calls,bogus'), ['calls'], 'unknown ids dropped');
  assert.equal(chips.dec('bogus'), undefined, 'nothing valid → ignore the param');
  assert.deepEqual(chips.dec(chips.enc(['puts', 'etfs'])!), ['etfs', 'puts'], 'round trip');

  const sort = sortCodec(['at', 'premium', 'symbol'] as const, { key: 'at', dir: -1 });
  assert.equal(sort.enc({ key: 'at', dir: -1 }), null);
  assert.equal(sort.enc({ key: 'premium', dir: 1 }), 'premium.asc');
  assert.deepEqual(sort.dec('premium.desc'), { key: 'premium', dir: -1 });
  assert.equal(sort.dec('premium.sideways'), undefined);
  assert.equal(sort.dec('nope.asc'), undefined);

  assert.equal(readParam('?f.days=5', 'f.days', days), 5);
  assert.equal(readParam('?f.days=9', 'f.days', days), undefined);
  assert.equal(readParam('?tab=flow', 'f.days', days), undefined);
  // a full FLOW view survives encode → URL → decode
  let href = '/t?tab=flow';
  href = withParams(href, { sym: 'NVDA', 'f.days': days.enc(5), 'f.chips': chips.enc(['puts', 'sweeps']), 'f.sort': sort.enc({ key: 'premium', dir: -1 }) });
  const search = href.slice(href.indexOf('?'));
  assert.equal(readSym(search), 'NVDA');
  assert.equal(readParam(search, 'f.days', days), 5);
  assert.deepEqual(readParam(search, 'f.chips', chips), ['puts', 'sweeps']);
  assert.deepEqual(readParam(search, 'f.sort', sort), { key: 'premium', dir: -1 });

  // ── optimistic: success keeps the change ──
  let state = ['SPY'];
  const ok = await runOptimistic({
    apply: () => { const prev = state; state = [...state, 'NVDA']; return () => { state = prev; }; },
    commit: async () => 'row-1',
  });
  assert.deepEqual(ok, { ok: true, value: 'row-1' });
  assert.deepEqual(state, ['SPY', 'NVDA']);

  // ── optimistic: failure rolls back and reports the reason ──
  let reported = '';
  const bad = await runOptimistic({
    apply: () => { const prev = state; state = [...state, 'AMD']; return () => { state = prev; }; },
    commit: async () => { throw new Error('403: {"error":"That watchlist row belongs to another account"}'); },
    onError: (e) => { reported = reasonOf(e); },
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(state, ['SPY', 'NVDA'], 'rolled back');
  assert.equal(reported, 'That watchlist row belongs to another account');

  // apply is visible BEFORE the commit resolves (that is the point)
  let seenDuring: string[] = [];
  await runOptimistic({
    apply: () => { state = [...state, 'TSLA']; return () => {}; },
    commit: async () => { seenDuring = [...state]; },
  });
  assert.ok(seenDuring.includes('TSLA'));

  // ── deferCommit with a fake clock ──
  type Timer = { fn: () => void; ms: number; live: boolean };
  const timers: Timer[] = [];
  const clock = {
    schedule: (fn: () => void, ms: number) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    cancel: (h: unknown) => { (h as Timer).live = false; },
  };
  const fire = () => { for (const t of timers.splice(0)) if (t.live) t.fn(); };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // undo inside the window: nothing is sent, the row comes back
  let rows = ['a', 'b', 'c'];
  let sent = 0;
  const h1 = deferCommit({
    apply: () => { const prev = rows; rows = rows.filter((x) => x !== 'b'); return () => { rows = prev; }; },
    commit: async () => { sent++; },
    ...clock,
  });
  assert.deepEqual(rows, ['a', 'c'], 'hidden at once');
  assert.equal(h1.state, 'pending');
  assert.equal(h1.undo(), true);
  assert.deepEqual(rows, ['a', 'b', 'c'], 'restored');
  fire(); await tick();
  assert.equal(sent, 0, 'undo cancels the commit');
  assert.equal(h1.undo(), false, 'second undo is a no-op');

  // window closes: commit runs once; undo afterwards reports false
  let committed = 0;
  const h2 = deferCommit({
    apply: () => { rows = rows.filter((x) => x !== 'c'); return () => { rows = [...rows, 'c']; }; },
    commit: async () => { sent++; },
    onCommitted: () => { committed++; },
    ...clock,
  });
  fire(); await tick();
  assert.equal(sent, 1);
  assert.equal(committed, 1);
  assert.equal(h2.state, 'done');
  assert.equal(h2.undo(), false, 'too late to undo → caller re-creates');
  assert.deepEqual(rows, ['a', 'b']);

  // server refuses: rolled back + error surfaced
  let err: unknown = null;
  const h3 = deferCommit({
    apply: () => { const prev = rows; rows = []; return () => { rows = prev; }; },
    commit: async () => { throw new Error('500: {"error":"Failed to delete journal trade"}'); },
    onError: (e) => { err = e; },
    ...clock,
  });
  assert.deepEqual(rows, []);
  fire(); await tick(); await tick();
  assert.equal(h3.state, 'failed');
  assert.deepEqual(rows, ['a', 'b'], 'failed delete restores the row');
  assert.equal(reasonOf(err), 'Failed to delete journal trade');

  // flush (pagehide) commits everything still pending, exactly once
  const before = pendingCommitCount();
  let flushed = 0;
  deferCommit({ apply: () => undefined, commit: async () => { flushed++; }, ...clock });
  deferCommit({ apply: () => undefined, commit: async () => { flushed++; }, ...clock });
  assert.equal(pendingCommitCount(), before + 2);
  await flushPendingCommits();
  assert.equal(flushed, 2);
  assert.equal(pendingCommitCount(), before);
  fire(); await tick();
  assert.equal(flushed, 2, 'the timer after a flush does not commit again');

  // ── list helpers ──
  assert.deepEqual(toggleIn(['A', 'B'], (x) => x === 'B', 'B'), ['A']);
  assert.deepEqual(toggleIn(['A'], (x) => x === 'B', 'B'), ['A', 'B']);
  assert.deepEqual(removeWhere([1, 2, 3, 2], (x) => x === 2), [1, 3]);
  assert.deepEqual(patchWhere([{ id: 1, t: 'a' }, { id: 2, t: 'b' }], (x) => x.id === 2, { t: 'z' }), [{ id: 1, t: 'a' }, { id: 2, t: 'z' }]);
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 5, 0), ['a', 'b'], 'out-of-range from is a no-op');
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a'], 'to is clamped');
  assert.deepEqual(orderBy(['x', 'y', 'z', 'w'], ['z', 'x'], (s) => s), ['z', 'x', 'y', 'w'], 'unlisted keep relative order after');
  assert.deepEqual(inverseOf({ notes: 'old', rating: 3, emotion: null } as Record<string, unknown>, { notes: 'new', setupType: 'ORB' }), { notes: 'old', setupType: null }, 'undo patch writes back old values, null for absent');

  // ── reasonOf ──
  assert.equal(reasonOf(new Error('400: {"error":"symbol and a positive price are required"}')), 'symbol and a positive price are required');
  assert.equal(reasonOf(new Error('401: Unauthorized')), 'Sign in first.');
  assert.equal(reasonOf(new Error('network down')), 'network down');
  assert.equal(reasonOf(new Error('502: <html>bad gateway</html>')), 'The server had a problem. Try again in a minute.', 'no raw HTML/status codes in toasts');
  assert.equal(reasonOf(new Error('500: ')), 'The server had a problem. Try again in a minute.');
  assert.equal(reasonOf(new TypeError('Failed to fetch')), 'Couldn’t reach QuantEdge — check your connection and try again.');

  // ── watchlist order (server + client share it) ──
  const items = [{ id: 'n' }, { id: 'a' }, { id: 't' }, { id: 'new' }];
  assert.deepEqual(applyWatchlistOrder(items, ['t', 'a', 'n']).map((x) => x.id), ['t', 'a', 'n', 'new'], 'rows added since the save go last');
  assert.deepEqual(applyWatchlistOrder(items, []).map((x) => x.id), ['n', 'a', 't', 'new']);
  const owned = new Set(['n', 'a', 't']);
  assert.deepEqual(sanitizeWatchlistOrder(['t', 'x', 't', 3, 'a'], owned), ['t', 'a'], 'foreign ids, dupes and non-strings dropped');
  assert.deepEqual(sanitizeWatchlistOrder('t,a', owned), []);
  const many = new Set(Array.from({ length: 900 }, (_, i) => `r${i}`));
  assert.equal(sanitizeWatchlistOrder([...many], many).length, MAX_WATCHLIST_ORDER);

  console.log('test-batchb-state: all checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
