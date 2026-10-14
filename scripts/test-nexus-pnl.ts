/**
 * npm run test:nexus-pnl — NEXUS P&L (shared/nexus-pnl.ts) and the batched,
 * cached, time-budgeted marks path (server/journal-marks.ts quotesWithin,
 * server/option-marks-batch.ts). No network, no DB.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_PNL_BUDGET, MARK_STALE_MS, budgetExitPremium, contractKey, nexusPnl, pnlChip, pnlStateOf, summarizeDay, tradableContract, verificationOf,
} from '../shared/nexus-pnl';
import { wholeContractPnl } from '../shared/journal-pnl-truth';
import { instrumentKey, liveMarksWithin, quotesWithin, _clearMarkCache, type MarkQuote } from '../server/journal-marks';
import { cleanKeys, occOfKey } from '../server/option-marks-batch';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const NOW = Date.parse('2026-10-14T15:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

(async () => {
  console.log('tradable contract (whole contracts, options only)');
  await t('default budget is $500', () => assert.equal(DEFAULT_PNL_BUDGET, 500));
  await t('primary fits: qty = floor(budget / (premium×100)); key matches the journal instrument key', () => {
    const tr = tradableContract({ symbol: 'nvda', assetType: 'option', optionType: 'call', strikePrice: 185, expiryDate: '2026-10-17', entryPremium: 2.4 }, 500);
    assert.ok(tr.ok);
    if (!tr.ok) return;
    assert.deepEqual([tr.basis, tr.qty, tr.debit, tr.key], ['primary', 2, 480, 'O:NVDA|2026-10-17|call|185']);
    assert.equal(tr.key, instrumentKey({ id: 'x', symbol: 'NVDA', assetType: 'option', direction: 'long', status: 'open', quantity: 1, entryPrice: 2.4, optionType: 'call', strikePrice: 185, expiryDate: '2026-10-17' }));
    const big = tradableContract({ symbol: 'NVDA', assetType: 'option', optionType: 'call', strikePrice: 185, expiryDate: '2026-10-17', entryPremium: 2.4 }, 1000);
    assert.ok(big.ok && big.qty === 4);
  });
  await t('shares idea → no P&L; missing premium → no contract', () => {
    const s = tradableContract({ symbol: 'JPM', assetType: 'stock' }, 500);
    assert.ok(!s.ok && s.code === 'not_option');
    const m = tradableContract({ symbol: 'JPM', assetType: 'option', optionType: 'call', strikePrice: 300, expiryDate: '2026-10-17', entryPremium: null }, 500);
    assert.ok(!m.ok && m.code === 'no_contract');
  });
  await t('primary over budget → budget contract; neither → over_budget', () => {
    const bc = { optionType: 'put' as const, strike: 415, expiry: '2026-10-17', entryPremium: 3.4, premiumStop: 1.7, premiumT1: 5.1, premiumT2: 6.8 };
    const tr = tradableContract({ symbol: 'TSLA', assetType: 'option', optionType: 'put', strikePrice: 430, expiryDate: '2026-10-17', entryPremium: 9.2, budgetContract: bc }, 500);
    assert.ok(tr.ok && tr.basis === 'budget' && tr.qty === 1 && tr.strike === 415 && tr.premiumStop === 1.7);
    const at1k = tradableContract({ symbol: 'TSLA', assetType: 'option', optionType: 'put', strikePrice: 430, expiryDate: '2026-10-17', entryPremium: 9.2, budgetContract: bc }, 1000);
    assert.ok(at1k.ok && at1k.basis === 'primary' && at1k.qty === 1, 'at $1,000 the primary fits again');
    const none = tradableContract({ symbol: 'TSLA', assetType: 'option', optionType: 'put', strikePrice: 430, expiryDate: '2026-10-17', entryPremium: 12 }, 1000);
    assert.ok(!none.ok && none.code === 'over_budget');
  });
  await t('contractKey normalizes', () => assert.equal(contractKey(' spy ', '2026-10-14T00:00Z', 'put', 660), 'O:SPY|2026-10-14|put|660'));

  console.log('status-aware P&L');
  const tr = tradableContract({ symbol: 'NVDA', assetType: 'option', optionType: 'call', strikePrice: 185, expiryDate: '2026-10-17', entryPremium: 2.4 }, 500);
  await t('lifecycle → state (outcome wins; waiting = no trigger)', () => {
    assert.equal(pnlStateOf({ lifecycleState: 'pending_trigger' }), 'waiting');
    assert.equal(pnlStateOf({ lifecycleState: 'triggered' }), 'open');
    assert.equal(pnlStateOf({ lifecycleState: 'executed' }), 'open');
    assert.equal(pnlStateOf({ lifecycleState: 'triggered', outcomeStatus: 'hit_target' }), 'resolved');
    assert.equal(pnlStateOf({ lifecycleState: 'pending_trigger', outcomeStatus: 'open' }), 'waiting');
  });
  await t('waiting → "—" chip, no number', () => {
    const p = nexusPnl({ state: 'waiting', tradable: tr, nowMs: NOW });
    assert.equal(p.pnl, null);
    assert.equal(pnlChip(p, NOW).text, '—');
  });
  await t('open: unrealized = qty × (mark − entry) × 100, same as the journal whole-contract P&L', () => {
    const p = nexusPnl({ state: 'open', tradable: tr, mark: { price: 3.1, asOf: iso(20_000), delayed: false, source: 'alpaca-opra' }, nowMs: NOW });
    assert.equal(p.pnl, wholeContractPnl(2.4, 3.1, 500)!.pnl);
    assert.equal(p.pnl, 140);
    assert.equal(p.pct, 29.2);
    assert.equal(p.stale, false);
    const c = pnlChip(p, NOW);
    assert.equal(c.tone, 'gain');
    assert.match(c.text, /^\+\$140 \+29\.2%$/);
    assert.match(c.sub!, /unrealized · mark 20s/);
  });
  await t('open: delayed feed says delayed; an old mark is stale, never live', () => {
    const d = nexusPnl({ state: 'open', tradable: tr, mark: { price: 2.0, asOf: iso(MARK_STALE_MS + 60_000), delayed: true, source: 'alpaca-indicative' }, nowMs: NOW });
    assert.equal(d.pnl, -80);
    assert.equal(d.delayed, true);
    assert.equal(d.stale, true);
    const c = pnlChip(d, NOW);
    assert.equal(c.tone, 'loss');
    assert.match(c.sub!, /delayed · stale/);
  });
  await t('open: loading mark → "loading mark" chip; no quote → "no mark"', () => {
    assert.equal(pnlChip(nexusPnl({ state: 'open', tradable: tr, mark: 'loading', nowMs: NOW }), NOW).text, 'loading mark');
    assert.equal(pnlChip(nexusPnl({ state: 'open', tradable: tr, mark: null, nowMs: NOW }), NOW).text, 'no mark');
  });
  await t('resolved: realized from exit premium + peak % + R', () => {
    const p = nexusPnl({ state: 'resolved', tradable: tr, exit: { premium: 3.6, atMs: NOW - 60_000 }, peak: { premium: 4.6, atMs: NOW - 120_000 }, trough: { premium: 2.1, atMs: NOW - 600_000 }, nowMs: NOW });
    assert.equal(p.pnl, 240);
    assert.equal(p.pct, 50);
    assert.equal(p.peak!.pct, 91.7);
    assert.equal(p.trough!.pnl, -60);
    // swing default stop −50% → risk per contract 1.20 × 2 × 100 = 240 → +1R
    assert.equal(p.r, 1);
    assert.match(pnlChip(p, NOW).sub!, /realized · peak \+91\.7%/);
  });
  await t('peak never below the exit; trough never above it', () => {
    const p = nexusPnl({ state: 'resolved', tradable: tr, exit: { premium: 3.6, atMs: 1 }, peak: { premium: 3.0, atMs: 2 }, trough: { premium: 3.9, atMs: 3 }, nowMs: NOW });
    assert.equal(p.peak!.premium, 3.6);
    assert.equal(p.trough!.premium, 3.6);
  });
  await t('budget contract exit from its own tracking', () => {
    const bc = { optionType: 'call' as const, strike: 200, expiry: '2026-10-17', entryPremium: 2, premiumStop: 1, premiumT1: 3, premiumT2: 4, tracking: { outcome: 'hit_t1', t1HitAt: 5 } };
    assert.deepEqual(budgetExitPremium(bc), { premium: 3, atMs: 5, basis: 'budget contract hit T1' });
    assert.equal(budgetExitPremium({ ...bc, tracking: { outcome: 'open' } }), null);
    assert.equal(budgetExitPremium({ ...bc, tracking: { outcome: 'expired', lastMark: 0.4, lastMarkAt: 9 } })!.premium, 0.4);
  });

  console.log('day line');
  await t('realized + unrealized, W/L/open, best/worst; unmarked open not summed', () => {
    const open = nexusPnl({ state: 'open', tradable: tr, mark: { price: 3.1, asOf: iso(5_000), delayed: false, source: 'x' }, nowMs: NOW });
    const win = nexusPnl({ state: 'resolved', tradable: tr, exit: { premium: 3.6, atMs: 1 }, nowMs: NOW });
    const loss = nexusPnl({ state: 'resolved', tradable: tr, exit: { premium: 1.2, atMs: 1 }, nowMs: NOW });
    const loading = nexusPnl({ state: 'open', tradable: tr, mark: 'loading', nowMs: NOW });
    const waiting = nexusPnl({ state: 'waiting', tradable: tr, nowMs: NOW });
    const s = summarizeDay([
      { id: 'a', symbol: 'NVDA', pnl: open }, { id: 'b', symbol: 'AMD', pnl: win }, { id: 'c', symbol: 'TSLA', pnl: loss },
      { id: 'd', symbol: 'PLTR', pnl: loading }, { id: 'e', symbol: 'MSFT', pnl: waiting },
    ]);
    assert.deepEqual([s.realized, s.unrealized, s.total, s.wins, s.losses, s.open, s.waiting, s.unmarked], [0, 140, 140, 1, 1, 2, 1, 1]);
    assert.deepEqual([s.best!.symbol, s.best!.pnl, s.worst!.symbol, s.worst!.pnl], ['AMD', 240, 'TSLA', -240]);
  });

  console.log('verify-ledger chip');
  await t('verified / corrected / unverified', () => {
    assert.equal(verificationOf({ verdict: 'VERIFIED' }, '2026-10-13T21:30:00Z').status, 'verified');
    assert.equal(verificationOf({ verdict: 'MISMATCH', recomputedEntry: 2, recomputedExit: 3 }, 'x').status, 'corrected');
    assert.equal(verificationOf({ verdict: 'UNVERIFIABLE', reason: 'no bars' }, 'x').status, 'unverified');
    assert.equal(verificationOf(null, 'x').status, 'unverified');
    assert.match(verificationOf(null, null).detail, /not available/);
  });

  console.log('marks endpoint (batched, cached, time-budgeted)');
  await t('key ↔ OCC and key sanitizing', () => {
    assert.equal(occOfKey('O:NVDA|2026-10-17|call|185'), 'NVDA261017C00185000');
    assert.equal(occOfKey('O:SPY|2026-10-14|put|662.5'), 'SPY261014P00662500');
    assert.equal(occOfKey('S:NVDA'), null);
    assert.deepEqual(cleanKeys(['o:nvda|2026-10-17|CALL|185', 'junk', 'O:NVDA|2026-10-17|call|185', '../etc']), ['O:NVDA|2026-10-17|call|185']);
    assert.equal(cleanKeys(Array.from({ length: 500 }, (_, i) => `O:A|2026-10-17|call|${i + 1}`)).length, 120);
  });
  const q = (price: number): MarkQuote => ({ price, asOf: new Date().toISOString(), source: 'fake', delayed: false, basis: 'contract' });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await t('one batch call for all uncached option keys; slow per-key fallback never blocks past the budget', async () => {
    _clearMarkCache();
    const keys = Array.from({ length: 40 }, (_, i) => `O:SYM${i}|2026-10-17|call|100`);
    let batchCalls = 0;
    const batch = async (ks: string[]) => { batchCalls++; await sleep(30); return new Map(ks.slice(0, 30).map((k) => [k, q(1.5)] as const)); };
    let perKeyCalls = 0;
    const perKey = async () => { perKeyCalls++; await sleep(5_000); return q(2); }; // the 36 s prod path, scaled
    const t0 = Date.now();
    const r = await quotesWithin(keys, perKey, { budgetMs: 400, batch });
    const ms = Date.now() - t0;
    assert.equal(batchCalls, 1);
    assert.equal(r.timing.batched, 30);
    assert.equal(r.pending.length, 10, '10 keys still loading → pending (progressive fill)');
    assert.ok(ms < 900, `returned in ${ms}ms`);
    assert.ok(perKeyCalls <= 6, 'per-key fallback runs with bounded concurrency');
    console.log(`    timing: 40 keys → ${ms} ms (batch ${r.timing.batchMs} ms, 30 batched, 10 pending)`);
    // second ask: batched keys are served from cache (no new batch), in-flight per-key promises are shared
    const r2 = await quotesWithin(keys, perKey, { budgetMs: 100, batch });
    assert.equal(batchCalls, 1, 'cached keys skip the batch');
    assert.equal(r2.timing.cached, 40);
  });
  await t('journal marks: liveMarksWithin returns marks + pending row ids', async () => {
    _clearMarkCache();
    const rows = [
      { id: 'r1', symbol: 'NVDA', assetType: 'option', direction: 'long', status: 'open', quantity: 2, entryPrice: 2.4, optionType: 'call', strikePrice: 185, expiryDate: '2026-10-17' },
      { id: 'r2', symbol: 'AMD', assetType: 'option', direction: 'long', status: 'open', quantity: 1, entryPrice: 3, optionType: 'call', strikePrice: 170, expiryDate: '2026-10-17' },
    ];
    const batch = async (ks: string[]) => new Map(ks.filter((k) => k.includes('NVDA')).map((k) => [k, q(3.1)] as const));
    const r = await liveMarksWithin(rows, async () => { await sleep(2_000); return q(4); }, { budgetMs: 200, batch });
    assert.equal(r.marks.r1.unrealizedPnL, 140);
    assert.deepEqual(r.pending, ['r2']);
  });
  await t('wiring: NEXUS uses the batched endpoint; journal route is time-budgeted; package script', () => {
    const routes = fs.readFileSync('server/routes.ts', 'utf8');
    assert.match(routes, /registerNexusMarksRoutes\(app, requireBetaAccess\)/);
    assert.match(routes, /liveMarksWithin\(rows as any, undefined, \{ budgetMs: 1500 \}\)/);
    const lib = fs.readFileSync('client/src/lib/nexus-pnl.ts', 'utf8');
    assert.match(lib, /\/api\/nexus\/marks/);
    const tools = fs.readFileSync('client/src/components/dashboard/tools/nexus/nexus-tools.tsx', 'utf8');
    assert.match(tools, /NexusDayStrip/);
    assert.match(tools, /PnlChipView/);
    const parts = fs.readFileSync('client/src/components/dashboard/tools/nexus/nexus-parts.tsx', 'utf8');
    assert.match(parts, /<NexusPnlBlock pick=\{selected\} \/>/);
    assert.match(fs.readFileSync('client/src/components/integrity/setups-by-day.tsx', 'utf8'), /NexusDayStrip/);
    assert.match(fs.readFileSync('package.json', 'utf8'), /"test:nexus-pnl"/);
  });

  console.log(`\n${n} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
