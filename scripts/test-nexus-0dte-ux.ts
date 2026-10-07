/**
 * NEXUS / 0DTE UX (operator 2026-10-07):
 *   shared/zero-dte-names.ts      auto name list + engine-stamp label (no bare "16.8h old")
 *   shared/nexus-resolved.ts      "Resolved today" group (TSLA 380P hit T1 10:05 stays on the board)
 *   shared/board-filters.ts       compact filter row + popover count / clear, Today default
 *   shared/zero-dte-trade-card.ts mark stamps ("delayed Nm"), progress to T1, result chips
 *   shared/nexus-grade.ts         whyShort — the clean "why" line
 *   npm run test:nexus-0dte-ux
 */
import assert from 'node:assert/strict';
import { autoZeroDteNames, engineStampLabel } from '../shared/zero-dte-names';
import { outcomeChip, resolvedToday, resolvedInstrument } from '../shared/nexus-resolved';
import { BOARD_FILTER_DEFAULTS, activeFilterCount, clearPopoverFilters, showsResolvedToday, popoverFilters } from '../shared/board-filters';
import { markStamp, progressToT1, bigContract, resultChip, ageShort } from '../shared/zero-dte-trade-card';
import { whyShort, shortFactorLabel } from '../shared/nexus-grade';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`);
const NOW = et('2026-10-07', '10:30');
const iso = (ms: number) => new Date(ms).toISOString();

t('auto names: open / today short-dated option ideas + today flow triggers; swings, stock and old resolved ideas excluded', () => {
  const ideas = [
    { symbol: 'TSLA', assetType: 'option', source: 'zero_dte_flow', expiryDate: '2026-10-07', outcomeStatus: 'hit_target', timestamp: iso(et('2026-10-07', '09:58')) },
    { symbol: 'NVDA', assetType: 'option', source: 'quant', expiryDate: '2026-10-08', outcomeStatus: 'open', timestamp: iso(et('2026-10-07', '10:05')) },
    { symbol: 'SPY', assetType: 'option', source: 'gex_scanner', dataSourceUsed: 'GEX_index_scalp_A_x', qualitySignals: ['underlying:SPY'], expiryDate: '2026-10-07', outcomeStatus: 'open', timestamp: iso(et('2026-10-07', '10:00')) },
    { symbol: 'AAPL', assetType: 'option', source: 'quant', expiryDate: '2026-11-20', outcomeStatus: 'open', timestamp: iso(et('2026-10-07', '10:10')) },
    { symbol: 'MSFT', assetType: 'stock', source: 'zero_dte_flow', outcomeStatus: 'open', timestamp: iso(et('2026-10-07', '09:58')) },
    { symbol: 'AMD', assetType: 'option', source: 'zero_dte_desk', expiryDate: '2026-10-06', outcomeStatus: 'hit_stop', timestamp: iso(et('2026-10-06', '11:00')) },
    { symbol: 'META', assetType: 'option', source: 'zero_dte_desk', dataSourceUsed: 'zero_dte_desk_swing', expiryDate: '2026-11-20', outcomeStatus: 'open', timestamp: iso(et('2026-10-07', '10:30')) },
  ];
  const flow = [{ symbol: 'AMZN', at: iso(et('2026-10-07', '09:52')) }, { symbol: 'NVDA', at: iso(et('2026-10-07', '09:40')) }, { symbol: 'GOOGL', at: iso(et('2026-10-06', '09:56')) }];
  const names = autoZeroDteNames(ideas as any, flow, NOW, { exclude: ['SPX'] });
  const syms = names.map((x) => x.symbol);
  assert.deepEqual(syms.slice(0, 1), ['NVDA'], 'open first');
  assert.ok(syms.includes('TSLA') && syms.includes('AMZN'));
  for (const s of ['AAPL', 'MSFT', 'AMD', 'META', 'GOOGL', 'SPX', 'SPY']) assert.ok(!syms.includes(s), `${s} excluded`);
  const nv = names.find((x) => x.symbol === 'NVDA')!;
  assert.equal(nv.why, '1 open · 1 today · flow 09:40');
});

t('engine stamp: pre-market label, prior-session / stale ages are named, never bare', () => {
  assert.equal(engineStampLabel('pre', 60_480, NOW), 'pre-market · entries from 09:31 (open drive) / 09:45');
  assert.match(engineStampLabel('midday', 16.8 * 3600, NOW), /prior session — not current/);
  assert.match(engineStampLabel('midday', 20 * 60, NOW), /stale/);
  assert.equal(engineStampLabel('midday', 95, NOW), 'evaluated 2m ago');
  assert.match(engineStampLabel('closed', 600, et('2026-10-07', '16:20')), /session closed · last evaluated 16:10 ET/);
  assert.match(engineStampLabel('midday', null, NOW), /not evaluated yet/);
});

t('resolved today: today ET only, newest first, deduped, missed entries left off; chips', () => {
  const rows = [
    { ideaId: 'a', outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', exitDate: iso(et('2026-10-07', '10:05')) },
    { ideaId: 'b', outcomeStatus: 'hit_stop', resolutionReason: 'auto_stop_hit', exitDate: iso(et('2026-10-07', '10:20')) },
    { ideaId: 'a', outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', exitDate: iso(et('2026-10-07', '10:04')) },
    { ideaId: 'c', outcomeStatus: 'hit_target', exitDate: iso(et('2026-10-06', '15:00')) },
    { ideaId: 'd', outcomeStatus: 'expired', resolutionReason: 'missed_entry_window', exitDate: iso(et('2026-10-07', '10:00')) },
    { ideaId: 'e', outcomeStatus: 'open', exitDate: iso(et('2026-10-07', '10:00')) },
  ];
  assert.deepEqual(resolvedToday(rows, NOW).map((r) => r.ideaId), ['b', 'a']);
  const c = outcomeChip({ outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', exitDate: iso(et('2026-10-07', '10:05')), percentGain: null, optionPercentGain: 52 });
  assert.deepEqual([c.label, c.tone, c.at], ['✓ T1', 'win', '10:05']);
  assert.equal(outcomeChip({ outcomeStatus: 'hit_stop', resolutionReason: null, exitDate: iso(NOW), percentGain: -1, optionPercentGain: null }).label, '✕ stop');
  const ts = outcomeChip({ outcomeStatus: 'expired', resolutionReason: 'auto_time_stop', exitDate: iso(NOW), percentGain: 0.4, optionPercentGain: null });
  assert.deepEqual([ts.label, ts.tone], ['time exit', 'win']);
  assert.equal(resolvedInstrument({ symbol: 'TSLA', assetType: 'option', optionType: 'put', strikePrice: 380, expiryDate: '2026-10-07' }), 'TSLA 380P 10/07');
  assert.equal(resolvedInstrument({ symbol: 'JPM', assetType: 'stock', optionType: null, strikePrice: null, expiryDate: null }), 'JPM');
});

t('board filters: Today default, popover count + clear, resolved shows under Today / Week / All', () => {
  assert.equal(BOARD_FILTER_DEFAULTS.day, 'today'); assert.equal(BOARD_FILTER_DEFAULTS.view, 'list'); assert.equal(BOARD_FILTER_DEFAULTS.side, 'all');
  assert.equal(activeFilterCount(BOARD_FILTER_DEFAULTS), 0);
  const s = { ...BOARD_FILTER_DEFAULTS, cryptoOnly: true, withRotation: true, day: '2026-10-01', calledRange: { from: 'x', to: null }, rank: 'new' as const, side: 'short' as const, view: 'grid' as const };
  assert.deepEqual(popoverFilters(s), ['crypto', 'rotation', 'new', 'date', 'called']);
  const c = clearPopoverFilters(s);
  assert.equal(activeFilterCount(c), 0);
  assert.equal(c.side, 'short', 'row choices kept'); assert.equal(c.view, 'grid', 'view is a layout, kept'); assert.equal(c.day, 'today');
  assert.equal(clearPopoverFilters({ ...BOARD_FILTER_DEFAULTS, rank: 'conviction' }).rank, 'conviction', 'Grade A/B is a row toggle, kept');
  assert.ok(showsResolvedToday('today') && showsResolvedToday('week') && showsResolvedToday('all'));
  assert.ok(!showsResolvedToday('yesterday') && !showsResolvedToday('2026-10-01'));
});

t('trade card: stamps say "delayed Nm" for delayed feeds or > 2 min; progress to T1; big contract; result chips', () => {
  assert.equal(markStamp({ at: iso(NOW - 12_000), source: 'Alpaca' }, NOW).text, 'Alpaca · 12s');
  const d = markStamp({ at: iso(NOW - 15 * 60_000), source: 'CBOE delayed (~15 min)' }, NOW);
  assert.ok(d.delayed); assert.match(d.text, /^delayed 15m · CBOE delayed/);
  assert.ok(markStamp({ at: iso(NOW - 3 * 60_000), source: 'Alpaca' }, NOW).delayed, '> 2 min is delayed');
  assert.equal(markStamp(null, NOW).text, 'no live mark');
  assert.equal(progressToT1(1.0, 1.5, 1.25), 0.5);
  assert.equal(progressToT1(1.0, 1.5, 0.6), -0.8);
  assert.equal(progressToT1(100, 98, 99), 0.5, 'short on the underlying: down is progress');
  assert.equal(progressToT1(1, 1, 1), null); assert.equal(progressToT1(null, 1.5, 1), null);
  assert.equal(bigContract('TSLA', { strike: 380, optionType: 'put', dte: 0 }), 'TSLA 380P 0DTE');
  assert.equal(bigContract('SPY', { strike: 671, type: 'call', expiry: '2026-10-08' }, '2026-10-07'), 'SPY 671C 1DTE');
  assert.equal(resultChip('done_reached').label, '✓ T1');
  assert.equal(resultChip('done_faded', 'stop hit — tracker 10:58 ET').label, '✕ stop');
  assert.equal(resultChip('expired', 'time stop / expired — 15:30 ET').label, 'time exit');
  assert.equal(ageShort(iso(NOW - 125_000), NOW), '2m');
});

t('why line: top two drivers, short labels, no point arithmetic', () => {
  const g = { top: [
    { key: 'lifecycle', label: 'live & valid', points: 25 }, { key: 'window', label: '85% of window left', points: 21.3 }, { key: 'session', label: 'current session', points: 10 },
  ] } as any;
  assert.equal(whyShort(g), 'live · 85% window');
  assert.ok(!/\+/.test(whyShort(g)));
  assert.equal(shortFactorLabel({ key: 'session', label: 'current session' } as any), 'today');
  assert.equal(whyShort({ top: [{ key: 'lifecycle', label: 'stale', points: 0 }] } as any), '', 'zero-point drivers dropped');
});

console.log(`test-nexus-0dte-ux: ${n} passed`);
