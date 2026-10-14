/**
 * npm run test:journal-pnl-truth — the ONE P&L definition of the NEXUS ideas book
 * (shared/journal-pnl-truth.ts), the nightly auto-verify plumbing, the retro
 * shares → options rule pick, and options-only-v2 at the write.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CORRECTABLE_BUG_CLASSES, HEADLINE_CLASSES, RETRO_LEDGER_VERSION, classifyClosedRow, contractsForBudget, isCorrectable, pickRetroContract,
  readRetroLedger, retroExpiries, retroLine, retroMinDte, strikeGrid, summarizeTruth, wholeContractPnl, type RetroRecord,
} from '../shared/journal-pnl-truth';
import { bsDelta, bsPrice, impliedVol } from '../shared/iv-fill';
import { mapDeskIdea, verifyDeskRows, deskVerificationMeta, type DeskIdea, type DeskLedger } from '../server/journal-row-maps';
import { ledgerEntryOf } from '../server/desk-verify-ledger';
import { incrementalIds } from '../research/verify-nexus-book-sources';
import { isOptionIntendedWrite, instrumentLabel } from '../shared/options-only';
import { applyDeskView, type DeskViewRow } from '../shared/desk-view';
import { verifyCommand, retroCommand, ledgerIsStale } from '../server/journal-verify-job';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('classification');
t('verified / corrected / mismatch / unverifiable / pending / duplicate / crypto / shares', () => {
  const opt = { instrument: 'option' as const, duplicateOf: null, integrityFail: false };
  assert.equal(classifyClosedRow({ ...opt, ledger: { verdict: 'VERIFIED', recordedPnL: 10, recomputedPnL: 12, bugClass: null, reason: null } }).cls, 'verified');
  const corr = classifyClosedRow({ ...opt, ledger: { verdict: 'MISMATCH', recordedPnL: 300, recomputedPnL: 40, recomputedEntry: 2.1, recomputedExit: 2.5, bugClass: 'exit_premium_not_traded', reason: 'x', optionSource: 'massive:O:X:1m' } });
  assert.deepEqual([corr.cls, corr.counted, corr.corrected], ['corrected', true, { entry: 2.1, exit: 2.5, pnl: 40 }]);
  // no bar source / entry not from bars (expiry_settlement) → not correctable
  assert.equal(classifyClosedRow({ ...opt, ledger: { verdict: 'MISMATCH', recordedPnL: 300, recomputedPnL: 40, recomputedEntry: 2.1, recomputedExit: 2.5, bugClass: 'expiry_settlement', reason: 'x', optionSource: 'massive' } }).cls, 'bar_mismatch');
  assert.equal(classifyClosedRow({ ...opt, ledger: { verdict: 'MISMATCH', recordedPnL: 0, recomputedPnL: 0, bugClass: 'never_triggered', reason: 'x' } }).cls, 'bar_mismatch');
  assert.equal(classifyClosedRow({ ...opt, ledger: { verdict: 'UNVERIFIABLE', recordedPnL: 1, recomputedPnL: null, bugClass: 'bar_unverifiable', reason: 'no bars' } }).cls, 'bar_unverifiable');
  assert.equal(classifyClosedRow({ ...opt, ledger: null }).cls, 'bar_pending');
  assert.equal(classifyClosedRow({ ...opt, ledger: null, integrityFail: true }).cls, 'integrity_fail');
  assert.equal(classifyClosedRow({ ...opt, duplicateOf: 'a', ledger: { verdict: 'VERIFIED', recordedPnL: 1, recomputedPnL: 1, bugClass: null, reason: null } }).cls, 'duplicate', 'duplicate wins over VERIFIED');
  assert.equal(classifyClosedRow({ instrument: 'crypto', duplicateOf: null, integrityFail: false, ledger: { verdict: 'VERIFIED', recordedPnL: 1, recomputedPnL: 1, bugClass: null, reason: null } }).cls, 'crypto_excluded');
  assert.equal(classifyClosedRow({ instrument: 'shares', duplicateOf: null, integrityFail: false, ledger: { verdict: 'VERIFIED', recordedPnL: 1, recomputedPnL: 1, bugClass: null, reason: null } }).cls, 'not_options');
  assert.deepEqual([...HEADLINE_CLASSES].sort(), ['corrected', 'retro', 'verified']);
  assert.ok(CORRECTABLE_BUG_CLASSES.has('exit_premium_pass') && !CORRECTABLE_BUG_CLASSES.has('expiry_settlement'));
  assert.equal(isCorrectable({ verdict: 'MISMATCH', recordedPnL: 1, recomputedPnL: 1, recomputedEntry: 1, recomputedExit: 1, bugClass: 'unexplained', reason: null, optionSource: 'none' }), false);
});

console.log('whole contracts');
t('$500 / $1,000 budgets buy whole contracts; over budget → null', () => {
  assert.equal(contractsForBudget(500, 1.42), 3);
  assert.equal(contractsForBudget(500, 5.01), 0);
  assert.deepEqual(wholeContractPnl(1.42, 2.1, 500), { qty: 3, debit: 426, pnl: 204 });
  assert.deepEqual(wholeContractPnl(6, 3, 1000), { qty: 1, debit: 600, pnl: -300 });
  assert.equal(wholeContractPnl(12, 20, 1000), null);
});

// ── the desk book with a ledger + retro ledger ──
const base: DeskIdea = {
  id: 'x', symbol: 'NVDA', assetType: 'option', direction: 'long', entryPrice: 185, targetPrice: 190, stopLoss: 182, riskRewardRatio: 1.7,
  optionType: 'call', strikePrice: 187.5, expiryDate: '2026-09-12', entryPremium: 2, exitPremium: 3, optionPercentGain: null, exitPrice: 189,
  percentGain: null, outcomeStatus: 'hit_target', resolutionReason: null, exitDate: '2026-09-09T16:00:00Z', timestamp: '2026-09-09T14:00:00Z',
  source: 'market_scanner', catalyst: null, genConvictionBand: null, executionState: 'closed',
};
const idea = (o: Partial<DeskIdea>): DeskIdea => ({ ...base, ...o });
const pair = (i: DeskIdea) => { const m = mapDeskIdea(i); assert.ok('row' in m, JSON.stringify(m)); return { idea: i, row: (m as any).row }; };
const shares = idea({ id: 'sh', symbol: 'AMD', assetType: 'stock', optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, entryPrice: 100, targetPrice: 104, stopLoss: 98, exitPrice: 103, timestamp: '2026-09-10T14:00:00Z', exitDate: '2026-09-11T15:00:00Z' });
const sharesNo = idea({ ...shares, id: 'sh2', symbol: 'INTC', timestamp: '2026-09-15T14:00:00Z', exitDate: '2026-09-15T18:00:00Z' });
const crypto = idea({ id: 'btc', symbol: 'BTC', assetType: 'crypto', optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, entryPrice: 60000, targetPrice: 62000, stopLoss: 59000, exitPrice: 61000, source: 'crypto_engine' });
const ver = idea({ id: 'v', exitPremium: 3 }); // +$100 unit
const cor = idea({ id: 'c', symbol: 'TSLA', strikePrice: 400, entryPrice: 398, targetPrice: 405, stopLoss: 395, exitPrice: 404, entryPremium: 2, exitPremium: 6, timestamp: '2026-09-16T14:00:00Z', exitDate: '2026-09-16T15:00:00Z' }); // recorded +$400
const dup = idea({ id: 'd', exitPremium: 3, timestamp: '2026-09-09T14:30:00Z' }); // same NVDA contract while v open
const pend = idea({ id: 'p', symbol: 'AAPL', strikePrice: 250, entryPrice: 248, targetPrice: 252, stopLoss: 246, exitPrice: 251, entryPremium: 1, exitPremium: 1.5, timestamp: '2026-09-17T14:00:00Z', exitDate: '2026-09-17T16:00:00Z' });
const open = idea({ id: 'o', outcomeStatus: 'open', exitDate: null, exitPremium: null, exitPrice: null, timestamp: '2026-10-13T14:00:00Z', executionState: 'triggered', symbol: 'META', strikePrice: 700 });
const ledger: DeskLedger = { asOf: '2026-10-14T21:40:00Z', path: '/x.json', byId: new Map([
  ['v', ledgerEntryOf({ id: 'v', verdict: 'VERIFIED', recordedPnL: 100, recomputedPnL: 104, evidence: { optionSource: 'massive:O:NVDA:1m' } })!],
  ['c', ledgerEntryOf({ id: 'c', verdict: 'MISMATCH', recordedPnL: 400, recomputedPnL: 60, recomputedEntry: 2.2, recomputedExit: 2.8, bugClass: 'exit_premium_pass', reason: 'pass exit re-priced from bars', evidence: { optionSource: 'alpaca:TSLA:1Min' } })!],
  ['d', ledgerEntryOf({ id: 'd', verdict: 'VERIFIED', recordedPnL: 100, recomputedPnL: 100, evidence: {} })!],
]) };
const retroRec: RetroRecord = {
  v: RETRO_LEDGER_VERSION, id: 'sh', symbol: 'AMD', source: 'market_scanner', direction: 'long', status: 'verified', reason: 'rule pick',
  contract: { occ: 'AMD250912C00102000', label: 'AMD 2026-09-12 102C', type: 'call', strike: 102, expiry: '2026-09-12', dte: 2, delta: 0.36, iv: 0.42, qty: 3, debit: 426 },
  triggerAt: '2026-09-10T14:05:00Z', exitAt: '2026-09-11T15:00:00Z', entryPremium: 1.42, exitPremium: 2.1, peakPremium: 2.4, unitPnL: 68, budgetPnL: 204, budget: 500,
  sources: { entry: 'massive:O:AMD250912C00102000:1m', exit: 'massive:O:AMD250912C00102000:1m' }, sharesPnL: 30, at: '2026-10-14T22:00:00Z',
};
const retro = readRetroLedger({ records: [retroRec, { ...retroRec, id: 'sh2', status: 'unverifiable', reason: 'no call fits the rule', contract: null, unitPnL: null }] });
const res = verifyDeskRows([pair(ver), pair(cor), pair(dup), pair(pend), pair(shares), pair(sharesNo), pair(crypto), pair(open)], ledger, retro);
const all = [...res.counted, ...res.unverified];
const byId = (id: string) => all.find((r) => r.id === `desk:${id}`)!;

console.log('one truth');
t('each row lands in exactly one class; headline = verified + corrected + retro', () => {
  assert.deepEqual(
    ['v', 'c', 'd', 'p', 'sh', 'sh2', 'btc'].map((id) => [id, byId(id).verification!.truth]),
    [['v', 'verified'], ['c', 'corrected'], ['d', 'duplicate'], ['p', 'bar_pending'], ['sh', 'retro'], ['sh2', 'not_options'], ['btc', 'crypto_excluded']]);
  assert.equal(byId('o').status, 'open');
  assert.deepEqual(res.counted.filter((r) => r.status === 'closed').map((r) => r.id).sort(), ['desk:c', 'desk:sh', 'desk:v']);
});
t('corrected row carries the bar value, recorded kept on the label', () => {
  const c = byId('c');
  assert.deepEqual([c.realizedPnL, c.entryPrice, c.exitPrice, c.verification!.recordedPnL], [60, 2.2, 2.8, 400]);
  assert.match(c.notes!, /BAR-CORRECTED — recorded \+\$400 → bars \+\$60/);
});
t('legacy shares idea becomes its rule-picked options view (labelled), shares P&L kept in the note', () => {
  const s = byId('sh');
  assert.deepEqual([s.assetType, s.optionType, s.strikePrice, s.entryPrice, s.exitPrice, s.realizedPnL, s.instrumentLabel], ['option', 'call', 102, 1.42, 2.1, 68, 'Options view (rule-picked, verified)']);
  assert.match(s.notes!, /Options view \(rule-picked, verified\): 09\/12 102C ×3/);
  assert.match(s.notes!, /Shares as published: \+\$30/);
  assert.match(byId('sh2').verification!.reasons[0].detail, /options view: unverifiable — no call fits the rule/);
  assert.match(retroLine(retroRec), /\+\$204/);
});
t('meta headline n/P&L = the rows the client counts (same set, same n)', () => {
  const meta = deskVerificationMeta(res, ledger, true);
  assert.deepEqual([meta.truth!.n, meta.truth!.pnl], [3, 100 + 60 + 68]);
  assert.deepEqual([meta.truth!.byClass.verified?.n, meta.truth!.byClass.corrected?.n, meta.truth!.byClass.retro?.n], [1, 1, 1]);
  assert.equal(meta.truth!.outside.n, 4);
  // Client: headline = rows not 'unverified'; after whole-contract $500 sizing the n is unchanged.
  const counted = all.filter((r) => r.status === 'closed' && r.verification!.status !== 'unverified');
  assert.equal(counted.length, meta.truth!.n);
  const sized = applyDeskView(all as unknown as DeskViewRow[], { view: 'recorded', sizing: { mode: 'risk', riskDollars: 500 } });
  const sizedHeadline = sized.rows.filter((r: any) => r.status === 'closed' && r.verification?.status !== 'unverified');
  assert.equal(sizedHeadline.length, meta.truth!.n, 'whole-contract sizing keeps the same n');
  const amd = sizedHeadline.find((r: any) => r.id === 'desk:sh')!;
  assert.deepEqual([amd.quantity, amd.realizedPnL], [3, 204], 'retro row re-sized to the same 3 whole contracts as its record');
  assert.ok(sizedHeadline.every((r: any) => !r.sizedAs?.capped), 'verified option exits are never capped at a stop');
});
t('summarizeTruth ignores open rows and never adds outside rows to the headline', () => {
  const s = summarizeTruth([
    { status: 'closed', realizedPnL: 50, verification: { truth: 'verified' } },
    { status: 'closed', realizedPnL: 9999, verification: { truth: 'bar_pending' } },
    { status: 'open', realizedPnL: null, verification: { truth: 'verified' } },
  ]);
  assert.deepEqual([s.n, s.pnl, s.outside.n, s.outside.pnl], [1, 50, 1, 9999]);
});

console.log('retro rule pick (no hindsight)');
const bs = { price: (S: number, K: number, T: number, v: number, c: boolean) => bsPrice(S, K, T, v, c), delta: (S: number, K: number, T: number, v: number, c: boolean) => bsDelta(S, K, T, v, c), iv: (p: number, S: number, K: number, T: number, c: boolean) => impliedVol(p, S, K, T, c) };
const priced = (K: number, dte: number, iv = 0.45) => ({ type: 'call' as const, strike: K, expiry: '2026-09-12', dte, price: Math.round(bsPrice(100, K, dte / 365, iv, true) * 100) / 100, volume: 10, occ: `AMD260912C${K}` });
t('delta band 0.15–0.45, whole contracts within budget, traded only', () => {
  const cands = [priced(95, 5), priced(100, 5), priced(102, 5), priced(104, 5), priced(108, 5), priced(115, 5), { ...priced(103, 5), volume: 0 }];
  const r = pickRetroContract({ direction: 'long', spot: 100, t1: 104, candidates: cands, budget: 500 }, bs);
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) {
    assert.ok(r.pick.delta >= 0.15 && r.pick.delta <= 0.45, `delta ${r.pick.delta}`);
    assert.ok(r.pick.debit <= 500 && r.pick.qty >= 1);
    assert.notEqual(r.pick.strike, 103, 'untraded candidate never picked');
    assert.notEqual(r.pick.strike, 95, 'ITM (Δ>0.45) outside the band');
  }
  const none = pickRetroContract({ direction: 'short', spot: 100, t1: 96, candidates: cands, budget: 500 }, bs);
  assert.equal(none.ok, false, 'a short needs puts');
});
t('expiries: nearest Friday ≥ min DTE, then the monthly; strike grid OTM-leaning', () => {
  assert.deepEqual(retroExpiries('2026-09-10', 1), ['2026-09-11', '2026-09-18']);
  assert.deepEqual(retroExpiries('2026-09-14', 3), ['2026-09-18']);
  assert.equal(retroMinDte('day', null), 1);
  assert.equal(retroMinDte('swing', 6.2), 7);
  assert.equal(retroMinDte('swing', null), 3);
  const g = strikeGrid(101.3, 'call', 10);
  assert.equal(g.length, 10); assert.equal(g[0], 90); assert.ok(g.includes(110) && g.includes(135));
  assert.ok(strikeGrid(101.3, 'put', 10).includes(85));
});

console.log('nightly auto-verify');
t('incremental: new / changed / catch-up / pass-priced; settled rows skipped', () => {
  const now = Date.parse('2026-10-14T21:30:00Z');
  const prior = { trades: [
    { id: 'a', verdict: 'VERIFIED', recordedPnL: 100 },
    { id: 'b', verdict: 'VERIFIED', recordedPnL: 100 },
    { id: 'c', verdict: 'UNVERIFIABLE', recordedPnL: 5 },
    { id: 'd', verdict: 'UNVERIFIABLE', recordedPnL: 5 },
    { id: 'e', verdict: 'MISMATCH', recordedPnL: 250 },
  ] };
  const r = incrementalIds(prior, [
    { id: 'a', recordedPnL: 100, exitMs: now - 86_400_000 },
    { id: 'b', recordedPnL: 40, exitMs: now - 30 * 86_400_000 },
    { id: 'c', recordedPnL: 5, exitMs: now - 2 * 86_400_000 },
    { id: 'd', recordedPnL: 5, exitMs: now - 40 * 86_400_000 },
    { id: 'e', recordedPnL: 250, exitMs: now - 40 * 86_400_000 },
    { id: 'f', recordedPnL: 12, exitMs: now - 3600_000 },
  ], now, 10, new Set(['e']));
  assert.deepEqual(r.ids, ['b', 'c', 'e', 'f']);
  assert.deepEqual(r.why, { new: 1, changed: 1, catchup: 1, pass: 1 });
});
t('job commands target the shared ledger, merge in place; stale check', () => {
  const v = verifyCommand('/opt/q/.cache/shared/ledgers/nexus-book-verify.json', {});
  assert.deepEqual(v.slice(0, 5), ['research/verify-nexus-book.ts', '--incremental', '/opt/q/.cache/shared/ledgers/nexus-book-verify.json', '--out', '/opt/q/.cache/shared/ledgers/nexus-book-verify.json']);
  assert.ok(retroCommand('/r.json', {}).includes('--write') && retroCommand('/r.json', {}).includes('--skip-known'));
  assert.equal(ledgerIsStale(null, 0), true);
  assert.equal(ledgerIsStale(Date.parse('2026-10-07T06:33:00Z'), Date.parse('2026-10-14T18:00:00Z')), true, 'the static Oct 7 ledger is stale');
  assert.equal(ledgerIsStale(Date.parse('2026-10-14T21:40:00Z'), Date.parse('2026-10-15T09:20:00Z')), false);
});
t('ledger reader keeps the bar-priced legs and the option bar source', () => {
  const e = ledgerEntryOf({ id: 'z', verdict: 'MISMATCH', recordedPnL: 1, recomputedPnL: 2, recomputedEntry: 1.1, recomputedExit: 1.3, bugClass: 'unexplained', reason: 'r', evidence: { optionSource: 'massive:O:Z:1m' } })!;
  assert.deepEqual([e.recomputedEntry, e.recomputedExit, e.optionSource], [1.1, 1.3, 'massive:O:Z:1m']);
  assert.equal(ledgerEntryOf({ id: 'z', verdict: 'nope' }), null);
});

console.log('options-only v2 (no shares ideas)');
t('every automated equity idea is option-intended at the write; crypto stays crypto', () => {
  for (const source of ['market_scanner', 'quant', 'sector_ignition', 'leaders', 'gex_scanner', 'flow', 'orb_scanner']) {
    assert.equal(isOptionIntendedWrite({ source, assetType: 'stock' }), true, source);
  }
  assert.equal(isOptionIntendedWrite({ source: 'quant', assetType: 'penny_stock' }), true);
  assert.equal(isOptionIntendedWrite({ source: 'crypto_engine', assetType: 'crypto' }), false);
  assert.equal(isOptionIntendedWrite({ source: 'quant', assetType: 'option' }), false);
  assert.equal(instrumentLabel({ source: 'market_scanner', assetType: 'stock' }), 'Legacy shares idea');
});
t('wiring: storage uses the v2 rule; leaders never publishes a shares idea; job registered', () => {

  const rd = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.match(rd('server/storage.ts'), /automatedWrite && isOptionIntendedWrite\(idea as any\)/);
  assert.doesNotMatch(rd('server/leaders-scanner.ts'), /SHARES_IDEA_LABEL/);
  assert.match(rd('server/background-jobs.ts'), /name: 'journal-verify'/);
  assert.match(rd('server/journal-sources.ts'), /verifyDeskRows\(pairs, ledger, retro\?\.byId \?\? null\)/);
  const retroScript = rd('scripts/retro-options-convert.ts');
  assert.match(retroScript, /READ ONLY/);
  assert.equal(/\b(UPDATE|INSERT INTO|DELETE FROM|TRUNCATE|ALTER TABLE)\b/.test(retroScript.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'no write SQL in the converter');
  assert.match(rd('client/src/lib/journal/use-journal.ts'), /matchesJournalFilters\(r, filters\) && r\.verification\?\.status !== 'unverified'/, 'call accuracy on the headline set');
});

console.log(`\n${n} journal-pnl-truth checks passed`);
