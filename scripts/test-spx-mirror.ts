/**
 * Unit tests — shared/spx-mirror.ts (SPY 0DTE idea → SPXW mirror).
 *   npm run -s test:spx-mirror
 */
import assert from 'node:assert/strict';
import {
  buildSpxMirror, isMirrorCandidate, roundTo5, spxRatio, spxwOcc, spyToSpx, CBOE_DELAY_SEC, SPX_MIRROR_NOTE,
  type MirrorChain, type MirrorInput, type MirrorRatio,
} from '../shared/spx-mirror';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

t('roundTo5', () => {
  assert.equal(roundTo5(7652.4), 7650);
  assert.equal(roundTo5(7652.6), 7655);
  assert.equal(roundTo5(7657.4), 7655);
});

t('ratio guards — never guess', () => {
  assert.equal(spxRatio(0, 7600), null);
  assert.equal(spxRatio(760, 0), null);
  assert.equal(spxRatio(760, 760), null); // 1.0 — implausible (e.g. SPX quote fell back to SPY)
  assert.ok(Math.abs(spxRatio(760, 7630)! - 10.0394736842) < 1e-9);
});

t('spyToSpx: strike × live ratio, rounded to 5; levels × ratio', () => {
  const r = spyToSpx({ spyStrike: 766, spySpot: 765.2, spxSpot: 7682.6, side: 'call', entry: 765.5, stop: 763.9, targets: [767.8, null, 769] })!;
  const k = 7682.6 / 765.2;
  assert.ok(Math.abs(r.ratio - k) < 1e-12);
  assert.equal(r.spxStrike, roundTo5(766 * k)); // 7690.6… → 7690
  assert.equal(r.spxStrike, 7690);
  assert.equal(r.entry, Math.round(765.5 * k * 100) / 100);
  assert.equal(r.stop, Math.round(763.9 * k * 100) / 100);
  assert.deepEqual(r.targets, [Math.round(767.8 * k * 100) / 100, Math.round(769 * k * 100) / 100]);
  assert.equal(r.side, 'call');
  assert.equal(spyToSpx({ spyStrike: 766, spySpot: 765, spxSpot: 765, side: 'put' }), null);
});

t('spxwOcc', () => {
  assert.equal(spxwOcc('2026-10-01', 'call', 7690), 'SPXW261001C07690000');
  assert.equal(spxwOcc('2026-10-02', 'put', 7605), 'SPXW261002P07605000');
});

t('candidates: SPY options with 0–2 DTE only', () => {
  const p = { symbol: 'SPY', optionType: 'call', strikePrice: 766, expiryDate: '2026-10-01' };
  assert.equal(isMirrorCandidate(p, 0), true);
  assert.equal(isMirrorCandidate(p, 2), true);
  assert.equal(isMirrorCandidate(p, 3), false);
  assert.equal(isMirrorCandidate(p, -1), false);
  assert.equal(isMirrorCandidate(p, null), false);
  assert.equal(isMirrorCandidate({ ...p, symbol: 'QQQ' }, 0), false);
  assert.equal(isMirrorCandidate({ ...p, optionType: null }, 0), false);
  assert.equal(isMirrorCandidate({ ...p, strikePrice: null }, 0), false);
});

const ratio: MirrorRatio = { value: 7682.6 / 765.2, spx: 7682.6, spy: 765.2, asOf: '2026-10-01T14:00:00.000Z', source: 'Yahoo ^GSPC ÷ SPY' };
const input: MirrorInput = { key: 'a', optionType: 'call', strike: 766, expiry: '2026-10-01', dte: 0, entry: 765.5, stop: 763.9, targets: [767.8] };
const fetchedAt = Date.parse('2026-10-01T14:01:00Z');
const chain: MirrorChain = {
  fetchedAt,
  rows: [
    { symbol: 'SPX261001C07690000', option_type: 'call', strike: 7690, expiration_date: '2026-10-01', bid: 99, ask: 99.5 }, // AM monthly — must not be picked
    { symbol: 'SPXW261001C07690000', option_type: 'call', strike: 7690, expiration_date: '2026-10-01', bid: 8.2, ask: 8.6 },
    { symbol: 'SPXW261001P07690000', option_type: 'put', strike: 7690, expiration_date: '2026-10-01', bid: 15, ask: 15.4 },
  ],
};

t('buildSpxMirror ok: SPXW row, delayed premium stamped with fetch time + 15m delay', () => {
  const m = buildSpxMirror(input, ratio, chain, null);
  assert.equal(m.status, 'ok');
  assert.equal(m.reason, null);
  assert.deepEqual(m.contract, { root: 'SPXW', occ: 'SPXW261001C07690000', strike: 7690, expiry: '2026-10-01', optionType: 'call', dte: 0 });
  assert.equal(m.premium!.mid, 8.4);
  assert.equal(m.premium!.source, 'CBOE delayed');
  assert.equal(m.premium!.delayedSec, CBOE_DELAY_SEC);
  assert.equal(m.premium!.asOf, new Date(fetchedAt).toISOString());
  assert.equal(m.ratio!.asOf, ratio.asOf);
  assert.equal(m.note, SPX_MIRROR_NOTE);
  assert.equal(m.levels!.targets.length, 1);
});

t('buildSpxMirror degrades honestly', () => {
  assert.equal(buildSpxMirror(input, null, chain, null).status, 'omitted');
  const pending = buildSpxMirror(input, ratio, null, 'SPXW chain still loading');
  assert.equal(pending.status, 'no_premium');
  assert.equal(pending.reason, 'SPXW chain still loading');
  assert.equal(pending.premium, null);
  assert.equal(pending.contract!.strike, 7690); // contract + levels still shown
  const missing = buildSpxMirror({ ...input, strike: 700 }, ratio, chain, null);
  assert.equal(missing.status, 'no_premium');
  assert.match(missing.reason!, /not in the CBOE delayed chain/);
  const oneSided = buildSpxMirror(input, ratio, { fetchedAt, rows: [{ symbol: 'SPXW261001C07690000', option_type: 'call', strike: 7690, expiration_date: '2026-10-01', bid: 0, ask: 1 }] }, null);
  assert.equal(oneSided.status, 'no_premium');
  assert.equal(oneSided.premium!.mid, null);
});

t('premium-valued levels are not converted as if they were SPY prices', () => {
  const m = buildSpxMirror({ ...input, entry: 2.35, stop: 1.1, targets: [4.2] }, ratio, chain, null);
  assert.deepEqual(m.levels, { entry: null, stop: null, targets: [] });
});

console.log(`spx-mirror: ${n} passed`);
