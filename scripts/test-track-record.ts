/**
 * Track record cards agree (shared/track-record.ts). SYNTHETIC ideas.
 *   npm run -s test:track-record
 *
 * The 2026-10-01 page printed "160 of 467 decided" beside "Total Ideas 108" and
 * engine tiles of "—" while real engines had hundreds of ideas. These assertions
 * pin the invariant that every card is a partition of ONE population.
 */
import assert from 'node:assert/strict';
import { computeTrackRecord, trackPopulation, windowStart, assetKey, type TrackIdea } from '../shared/track-record';
import { computeModelRecord } from '../shared/model-record';
import { OUTCOME_BASELINE_DATE, MIN_REPORTABLE_SAMPLE } from '../shared/constants';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

const NOW = Date.parse('2026-10-01T11:10:00Z');
const day = (d: string, h = 15) => `${d}T${String(h).padStart(2, '0')}:00:00Z`;
let id = 0;
const mk = (p: Partial<TrackIdea> & { source: string }): TrackIdea => ({
  timestamp: day('2026-09-15'), assetType: 'stock', outcomeStatus: 'open', percentGain: null, ...p, id: String(++id),
} as TrackIdea);

const ideas: TrackIdea[] = [];
// gex_scanner options: 20 wins, 15 losses, 5 open
for (let k = 0; k < 20; k++) ideas.push(mk({ source: 'gex_scanner', assetType: 'option', outcomeStatus: 'hit_target', optionPercentGain: 50, entryPrice: 99, strikePrice: 100 }));
for (let k = 0; k < 15; k++) ideas.push(mk({ source: 'gex_scanner', assetType: 'option', outcomeStatus: 'hit_stop', optionPercentGain: -50, entryPrice: 99, strikePrice: 100, outcomeNotes: k < 3 ? '[exit-premium:pass]' : null }));
for (let k = 0; k < 5; k++) ideas.push(mk({ source: 'gex_scanner', assetType: 'option', outcomeStatus: 'open', entryPrice: 99, strikePrice: 100 }));
// market_scanner stocks (raw synonym 'scanner'): 4 wins, 6 losses, 2 unmeasured expiries, recent
for (let k = 0; k < 4; k++) ideas.push(mk({ source: 'scanner', outcomeStatus: 'hit_target', percentGain: 4, timestamp: day('2026-09-29') }));
for (let k = 0; k < 6; k++) ideas.push(mk({ source: 'market_scanner', outcomeStatus: 'hit_stop', percentGain: -2, timestamp: day('2026-09-29') }));
for (let k = 0; k < 2; k++) ideas.push(mk({ source: 'market_scanner', outcomeStatus: 'expired', percentGain: 0, timestamp: day('2026-09-29') }));
// flow, crypto
ideas.push(mk({ source: 'options_flow', assetType: 'crypto', outcomeStatus: 'hit_target', percentGain: 6 }));
// Must be excluded: pre-baseline, synthetic, excludeFromTraining
for (let k = 0; k < 50; k++) ideas.push(mk({ source: 'quant', outcomeStatus: 'hit_stop', percentGain: -3, timestamp: day('2026-08-01') }));
ideas.push(mk({ source: 'flow', assetType: 'option', outcomeStatus: 'hit_target', optionPercentGain: 80, dataSourceUsed: 'synthetic_backfill' }));
ideas.push(mk({ source: 'flow', outcomeStatus: 'hit_target', percentGain: 9, excludeFromTraining: true }));

const sum = (xs: { [k: string]: any }[], k: string) => xs.reduce((a, r) => a + (r[k] as number), 0);

function agree(label: string, tr: ReturnType<typeof computeTrackRecord>) {
  const h = tr.headline;
  for (const [name, rows] of [['engines', tr.engines], ['assets', tr.assets]] as const) {
    for (const k of ['total', 'decided', 'wins', 'losses', 'unresolved']) {
      assert.equal(sum(rows as any, k), (h as any)[k], `${label}: Σ ${name}.${k} = headline.${k}`);
    }
  }
  assert.equal(h.decided, h.wins + h.losses, `${label}: decided = wins + losses`);
  assert.ok(h.decided <= h.total, `${label}: decided never exceeds Total Ideas`);
  assert.equal(h.total, h.decided + h.unresolved, `${label}: total = decided + unresolved`);
}

t('unfiltered headline equals /api/performance/model-record', () => {
  const tr = computeTrackRecord(ideas, {}, { nowMs: NOW });
  const mr = computeModelRecord(ideas);
  for (const k of ['total', 'wins', 'losses', 'decided', 'unresolved', 'winRate', 'expectancyR'] as const) {
    assert.equal((tr.headline as any)[k], (mr as any)[k], k);
  }
  assert.equal(tr.since, OUTCOME_BASELINE_DATE);
  agree('all', tr);
  assert.equal(tr.headline.total, 40 + 12 + 1);
  assert.equal(tr.headline.wins, 25);
  assert.equal(tr.headline.losses, 21);
});

t('engines are the real sources, synonyms merged, sample flags set', () => {
  const tr = computeTrackRecord(ideas, {}, { nowMs: NOW });
  const keys = tr.engines.map((e) => e.key);
  assert.deepEqual(keys, ['gex_scanner', 'market_scanner', 'flow']);
  const gex = tr.engines[0];
  assert.equal(gex.decided, 35); assert.equal(gex.sample, 'ok'); assert.ok(gex.winRate != null);
  const ms = tr.engines[1];
  assert.equal(ms.total, 12); assert.equal(ms.decided, 10); assert.equal(ms.sample, 'thin'); assert.equal(ms.winRate, null);
  assert.equal(ms.rawWinRate, 40);
  assert.equal(tr.engineOptions.find((e) => e.key === 'quant'), undefined, 'pre-baseline engines are not offered');
});

t('every filter combination keeps the cards in agreement', () => {
  const wins = ['today', '7d', '30d', '3m', 'all'] as const;
  const engines = ['all', 'gex_scanner', 'market_scanner', 'flow', 'nope'];
  const assets = ['all', 'stock', 'option', 'crypto', 'future'] as const;
  for (const w of wins) for (const e of engines) for (const a of assets) {
    const tr = computeTrackRecord(ideas, { window: w, engine: e, asset: a }, { nowMs: NOW });
    agree(`${w}/${e}/${a}`, tr);
    assert.equal(tr.headline.total, trackPopulation(ideas, { window: w, engine: e, asset: a }, { nowMs: NOW }).length);
    if (e !== 'all') assert.ok(tr.engines.every((r) => r.key === e));
    if (a !== 'all') assert.ok(tr.assets.every((r) => r.key === a));
  }
});

t('window narrows but never reaches before the baseline', () => {
  assert.equal(windowStart('3m', NOW), OUTCOME_BASELINE_DATE);
  assert.equal(windowStart('7d', NOW), '2026-09-24');
  const tr = computeTrackRecord(ideas, { window: '7d' }, { nowMs: NOW });
  assert.equal(tr.headline.total, 12, 'only the 09-29 market_scanner ideas');
});

t('options are included and disclosed with counts', () => {
  const tr = computeTrackRecord(ideas, { asset: 'option' }, { nowMs: NOW });
  assert.equal(tr.options.total, 40); assert.equal(tr.options.decided, 35); assert.equal(tr.options.pricedAtPass, 3);
  assert.equal(tr.headline.total, 40);
  assert.equal(assetKey('options'), 'option'); assert.equal(assetKey('penny_stock'), 'stock');
});

t('expectancy units are consistent: avg P&L % and avg R over the same decided ideas', () => {
  const tr = computeTrackRecord(ideas, { engine: 'gex_scanner' }, { nowMs: NOW });
  const h = tr.headline;
  assert.equal(h.pnlN, 35); assert.equal(h.rSampleSize, 35);
  assert.equal(h.avgPnlPct, Math.round(((20 * 50 - 15 * 50) / 35) * 1000) / 1000);
  assert.equal(h.avgWinPct, 50); assert.equal(h.avgLossPct, -50);
  assert.equal(Math.round(h.avgPnlPct! / 50 * 1000) / 1000, h.expectancyR);
});

t('hit rate is null under the sample floor', () => {
  const tr = computeTrackRecord(ideas, { engine: 'market_scanner' }, { nowMs: NOW });
  assert.ok(tr.headline.decided < MIN_REPORTABLE_SAMPLE);
  assert.equal(tr.headline.winRate, null);
});

console.log(`track-record: ${n} passed`);
