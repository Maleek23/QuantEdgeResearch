/**
 * npm run test:detail-everywhere — Setup Detail BY ID everywhere (operator bug
 * 2026-10-14: the 0DTE desk's "SPX" row for the SPY 770P 1DTE index scalp
 * dead-ended with "not on the live NEXUS board"), the 0DTE journal chip and the
 * "SPX thesis · traded on SPY" label.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  dteAtPublish, ideaStatusChip, isIndexScalp, isZeroDteJournalRow, spxThesisLabel, zeroDteFamilyOf,
} from '../shared/zero-dte-journal';
import { buildIdeaDetail, ideaRowToPick } from '../server/idea-detail-core';
import { countJournalFilters, journalFiltersToParams, matchesJournalFilters, parseJournalFilters } from '../shared/journal-filters';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';
import { isAppRoute } from '../server/seo-metadata';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// The prod row (trade_ideas 8b2a688c-…, 2026-10-14 10:50 ET), as stored.
const SPY770P = {
  id: '8b2a688c-8ec3-4c18-add3-3330cbdbc7ca', symbol: 'SPY', source: 'gex_scanner', status: 'published',
  assetType: 'option', direction: 'long', optionType: 'put', strikePrice: 770, expiryDate: '2026-10-15',
  entryPrice: 773.1, targetPrice: 769.5, stopLoss: 774.6, riskRewardRatio: 2.45, entryPremium: 1.46,
  outcomeStatus: 'open', holdingPeriod: 'day', timestamp: '2026-10-14T14:50:00.000Z',
  dataSourceUsed: 'GEX_index_scalp_A_neg_gamma_continuation',
  qualitySignals: ['index_scalp:wall_break', 'underlying:SPY', 'vehicle:SPY', 'strike:770', '0DTE:2026-10-15', 'contract_dte:1'],
  convergenceSignalsJson: { executionAudit: { version: 1, state: 'triggered', triggerObservedAt: '2026-10-14T14:51:00.000Z' } },
  genConvictionScore: 41, genConvictionBand: 'B', genScoringLayers: [{ kind: 'gex', points: 8, why: 'neg gamma below flip' }],
  catalyst: 'SPY PUT $770 wall_break', analysis: 'Index scalp: put wall break', outcomeNotes: null,
};

console.log('0DTE / index classification');
t('the SPY 770P index scalp is an index scalp, a 0DTE play, 1 DTE at publish', () => {
  assert.equal(isIndexScalp(SPY770P), true);
  assert.equal(zeroDteFamilyOf(SPY770P), 'index_scalp');
  assert.equal(dteAtPublish(SPY770P.expiryDate, SPY770P.timestamp), 1);
  assert.equal(isZeroDteJournalRow({ ...SPY770P, entryTime: SPY770P.timestamp }), true);
});
t('every 0DTE engine counts; a 30-DTE swing does not; a 0-1 DTE option from any engine does', () => {
  for (const s of ['zero_dte_flow', 'zero_dte_desk', 'zero_dte_sniper', 'open_drive', 'spx_fast_move', 'spx_session']) {
    assert.equal(isZeroDteJournalRow({ source: s }), true, s);
  }
  assert.equal(isZeroDteJournalRow({ source: 'quant', assetType: 'option', expiryDate: '2026-11-13', entryTime: '2026-10-14T15:00:00Z' }), false);
  assert.equal(isZeroDteJournalRow({ setupType: 'flow', assetType: 'option', expiryDate: '2026-10-14', entryTime: '2026-10-14T15:00:00Z' }), true);
  assert.equal(isZeroDteJournalRow({ setupType: 'flow', assetType: 'stock', expiryDate: null, entryTime: '2026-10-14T15:00:00Z' }), false);
});

console.log('SPX thesis on SPY');
t('"SPX thesis · traded on SPY 770P" for the index scalp; null for a plain SPY idea and for SPX itself', () => {
  assert.equal(spxThesisLabel(SPY770P), 'SPX thesis · traded on SPY 770P');
  assert.equal(spxThesisLabel({ symbol: 'SPY', source: 'quant', optionType: 'call', strikePrice: 780 }), null);
  assert.equal(spxThesisLabel({ symbol: 'SPX', source: 'spx_session', optionType: 'call', strikePrice: 6800 }), null);
  assert.equal(spxThesisLabel({ symbol: 'SPY', source: 'spx_fast_move', optionType: 'call', strikePrice: 781 }), 'SPX thesis · traded on SPY 781C');
});

console.log('status chip');
t('Open / waiting / Hit T1 / Hit T2 / Stopped / Expired / Missed entry', () => {
  assert.equal(ideaStatusChip({ outcomeStatus: 'open', lifecycleState: 'triggered' }).label, 'Open');
  assert.equal(ideaStatusChip({ outcomeStatus: 'open', lifecycleState: 'pending_trigger' }).code, 'waiting');
  assert.equal(ideaStatusChip({ outcomeStatus: 'hit_target' }).label, 'Hit T1');
  assert.equal(ideaStatusChip({ outcomeStatus: 'hit_target', t2HitAt: 1 }).label, 'Hit T2');
  assert.equal(ideaStatusChip({ outcomeStatus: 'hit_stop' }).label, 'Stopped');
  assert.equal(ideaStatusChip({ outcomeStatus: 'expired' }).label, 'Expired');
  assert.equal(ideaStatusChip({ outcomeStatus: 'expired', resolutionReason: 'missed_entry_window' }).code, 'missed');
});

console.log('detail by id (server/idea-detail-core.ts)');
t('the stored idea maps to the board pick shape — plan as published, never a carried price as live', () => {
  const p = ideaRowToPick(SPY770P, Date.parse('2026-10-14T16:00:00Z')) as any;
  assert.equal(p.ideaId, SPY770P.id);
  assert.equal(p.symbol, 'SPY');
  assert.deepEqual([p.entryPrice, p.stopLoss, p.targetPrice, p.strikePrice, p.optionType, p.entryPremium], [773.1, 774.6, 769.5, 770, 'put', 1.46]);
  assert.equal(p.lifecycleState, 'triggered');
  assert.equal(p.triggeredAt, '2026-10-14T14:51:00.000Z');
  assert.equal(p.calledAt, '2026-10-14T14:50:00.000Z');
  assert.equal(p.currentPrice, null);
  assert.equal(p.priceIsLive, false);
  assert.equal(p.offBoard, true);
  assert.equal(p.thesisLabel, 'SPX thesis · traded on SPY 770P');
  assert.equal(p.convictionBand, 'B');
  assert.equal(p.layers.length, 1);
  assert.equal(p.horizon.horizon !== undefined, true);
});
t('resolved and expired ideas still build a detail (lifecycle closed, status chip, record)', () => {
  const won = buildIdeaDetail({ ...SPY770P, outcomeStatus: 'hit_target', exitPremium: 2.9, optionPercentGain: 98.6, exitDate: '2026-10-14T17:02:00Z' }, null, 'no contract bars', Date.parse('2026-10-15T12:00:00Z'));
  assert.equal(won.status.label, 'Hit T1');
  assert.equal((won.pick as any).lifecycleState, 'closed');
  assert.equal(won.record.exitPremium, 2.9);
  assert.equal(won.thesisLabel, 'SPX thesis · traded on SPY 770P');
  assert.equal(won.zeroDte, true);
  assert.equal(won.family, 'index_scalp');
  const exp = buildIdeaDetail({ ...SPY770P, outcomeStatus: 'expired' }, null, null);
  assert.equal(exp.status.label, 'Expired');
  const t2 = buildIdeaDetail({ ...SPY770P, outcomeStatus: 'hit_target' }, { v: 'premium-outcome-v1', status: 'hit_target', exitPremium: 2.2, exitAtMs: 1, optionPercentGain: 50, t1HitAt: 1, t2HitAt: 2, stopHitAt: null, peak: { premium: 3, atMs: 2 }, bars: 40, basis: 'x', asOf: null, lastPremium: 2.5, source: 'alpaca' }, null);
  assert.equal(t2.status.label, 'Hit T2');
});

console.log('journal 0DTE chip (shared/journal-filters.ts)');
t('j0dte round-trips through the URL and counts as one filter', () => {
  const f = parseJournalFilters((k) => (k === 'j0dte' ? '1' : null));
  assert.equal(f.zeroDte, true);
  assert.equal(journalFiltersToParams(f).get('j0dte'), '1');
  assert.equal(countJournalFilters(f), 1);
  assert.equal(parseJournalFilters(() => null).zeroDte, undefined);
});
t('the chip keeps flagged rows, 0-1 DTE options and 0DTE engines; drops swings', () => {
  const base = { symbol: 'X', direction: 'long', assetType: 'option', entryTime: '2026-10-14T15:00:00Z', status: 'closed' };
  assert.equal(matchesJournalFilters({ ...base, zeroDte: true }, { zeroDte: true }), true);
  assert.equal(matchesJournalFilters({ ...base, setupType: 'zero_dte_flow' }, { zeroDte: true }), true);
  assert.equal(matchesJournalFilters({ ...base, setupType: 'quant', expiryDate: '2026-10-15' }, { zeroDte: true }), true);
  assert.equal(matchesJournalFilters({ ...base, setupType: 'quant', expiryDate: '2026-11-20' }, { zeroDte: true }), false);
  assert.equal(matchesJournalFilters({ ...base, setupType: 'quant', expiryDate: '2026-11-20' }, {}), true);
});
t('the NEXUS ideas row of the SPY 770P is flagged 0DTE and labelled as the SPX thesis', () => {
  const res = mapDeskIdea({ ...SPY770P, executionState: 'triggered', convergenceSignalsJson: null } as unknown as DeskIdea);
  assert.ok('row' in res, `excluded: ${(res as any).excluded}`);
  const row = (res as any).row;
  assert.equal(row.zeroDte, true);
  assert.equal(row.thesisLabel, 'SPX thesis · traded on SPY 770P');
  assert.equal(row.id, `desk:${SPY770P.id}`);
});

console.log('entry points pass the idea id, never the desk symbol');
t('the 0DTE desk sheet resolves by id and has no "not on the live board" dead end', () => {
  const src = read('client/src/components/zerodte/zd-setup-detail.tsx');
  assert.ok(src.includes('<IdeaDetailById ideaId={ideaId}'));
  assert.ok(!/not on the live NEXUS board/.test(src));
  assert.ok(!/all\.find\(\(p\) => p\.ideaId === ideaId\)/.test(src));
});
t('NEXUS DetailSetup + deep links resolve an off-board id by id (no symbol substitution)', () => {
  const src = read('client/src/components/dashboard/tools/nexus/nexus-tools.tsx');
  assert.ok(src.includes('if (offBoard) return <IdeaDetailById ideaId={id!}'));
  assert.ok(src.includes('const pick = exact ?? (t.ideaId ? undefined : bySym);'));
  assert.ok(!src.includes("'selection left the book · showing top setup'"));
});
t('the by-id detail falls back to GET /api/ideas/:id/detail; the route is registered', () => {
  assert.ok(read('client/src/components/ideas/idea-detail-by-id.tsx').includes('/api/ideas/${encodeURIComponent(String(id))}/detail'));
  assert.ok(read('server/idea-detail.ts').includes("app.get('/api/ideas/:id/detail'"));
  assert.ok(read('server/routes.ts').includes('registerIdeaDetailRoutes(app, requireBetaAccess)'));
});
t('/idea/:id is a routed app page (App.tsx + APP_ROUTE_PATTERNS)', () => {
  assert.ok(read('client/src/App.tsx').includes('<Route path="/idea/:id"'));
  assert.equal(isAppRoute('/idea/8b2a688c-8ec3-4c18-add3-3330cbdbc7ca'), true);
  assert.equal(isAppRoute('/idea'), false);
});
t('desk ideas, past sessions, journal rows, journal not-scored list and Discord cards link to /idea/:id', () => {
  assert.ok(read('client/src/components/zerodte/zero-dte-ideas.tsx').includes('ideaDetailHref(x.ideaId)'));
  assert.ok(read('client/src/components/zerodte/zd-sessions.tsx').includes('ideaDetailHref(p.id)'));
  assert.ok(read('client/src/pages/journal/trade-view.tsx').includes('ideaDetailHref(row.id)'));
  assert.ok(read('client/src/components/journal/journal-switcher.tsx').includes('ideaDetailHref(r.id)'));
  assert.ok(read('server/discord-lifecycle.ts').includes('/idea/${encodeURIComponent(c.ideaId)}'));
  assert.ok(read('server/discord-service.ts').includes('url: ideaDetailUrl(idea.id)'));
  assert.ok(read('client/src/components/journal/filter-bar.tsx').includes("setFilter('zeroDte'"));
});

console.log(`\n${n} passed`);
