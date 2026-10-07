/**
 * Quantinum Bot sleeves + hard rules (shared/bot-sleeves.ts), fill audit
 * (shared/bot-fill-verification.ts) and the read-only diagnosis (research/bot-diagnose.ts).
 *   npm run test:bot-sleeves
 */
import assert from 'node:assert/strict';
import {
  readBotSleeveConfig, classifyZeroDteIdea, premiumManage, zeroDteQuantity, sleeveOfPosition, swingOrder, isLiveGrade,
  oppositeSideHeld, underlyingSide, stoppedOutToday, isStopExit, timeStopDue, executableQuote, SkipTally, formatSkipSummary,
} from '../shared/bot-sleeves';
import { nexusGrade } from '../shared/nexus-grade';
import { auditBotOptionFill } from '../shared/bot-fill-verification';
import { diagnose } from '../research/bot-diagnose';

let n = 0;
const t = (name: string, fn: () => void) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const et = (day: string, hhmm: string) => Date.parse(`${day}T${hhmm}:00-04:00`);
const NOW = et('2026-10-06', '10:15'); // Tuesday

t('sleeve defaults: BOT_0DTE_MAX=3, BOT_SWING_MAX=4, −40/+50/+100, flat 15:45, 09:31–11:30 (BOT_0DTE_START overrides)', () => {
  const c = readBotSleeveConfig({});
  assert.equal(c.zeroDteMax, 3); assert.equal(c.swingMax, 4);
  assert.equal(c.premStopPct, 0.4); assert.equal(c.premT1Pct, 0.5); assert.equal(c.premT2Pct, 1);
  assert.equal(c.flattenEt, 15 * 60 + 45);
  assert.deepEqual(c.zeroDteWindows, [[9 * 60 + 31, 11 * 60 + 30]]);
  assert.deepEqual(readBotSleeveConfig({ BOT_0DTE_START: '09:35' }).zeroDteWindows, [[9 * 60 + 35, 11 * 60 + 30]]);
  assert.equal(c.zeroDteMaxDte, 2);
  assert.equal(readBotSleeveConfig({ BOT_0DTE_MAX: '5', BOT_SWING_MAX: '2' }).zeroDteMax, 5);
});

const cfg = readBotSleeveConfig({});
const zIdea = (o: Record<string, unknown> = {}) => ({ symbol: 'SPY', source: 'zero_dte_desk', optionType: 'call', strikePrice: 600, expiryDate: '2026-10-06', timestamp: new Date(et('2026-10-06', '09:50')).toISOString(), outcomeStatus: 'open', ...o });
t('0DTE sleeve takes index scalps, zero_dte_desk, zero_dte_flow, gex_magnet ≤ 2 DTE', () => {
  assert.equal(classifyZeroDteIdea(zIdea(), NOW, cfg).ok, true);
  assert.equal(classifyZeroDteIdea(zIdea({ source: 'zero_dte_flow' }), NOW, cfg).ok, true);
  assert.equal(classifyZeroDteIdea(zIdea({ source: 'gex_magnet', expiryDate: '2026-10-08' }), NOW, cfg).ok, true);
  assert.equal(classifyZeroDteIdea(zIdea({ source: 'gex_scanner', dataSourceUsed: 'GEX_index_scalp_SPY' }), NOW, cfg).kind, 'index_scalp');
  assert.equal(classifyZeroDteIdea(zIdea({ source: 'gex_magnet', expiryDate: '2026-10-09' }), NOW, cfg).code, 'dte_too_long');
  assert.equal(classifyZeroDteIdea(zIdea({ source: 'quant' }), NOW, cfg).code, 'not_0dte_source');
  assert.equal(classifyZeroDteIdea(zIdea({ symbol: 'SNOW' }), NOW, cfg).code, 'outside_universe');
  assert.equal(classifyZeroDteIdea(zIdea({ timestamp: new Date(et('2026-10-05', '10:00')).toISOString() }), NOW, cfg).code, 'not_today');
});
t('premium bracket: −40% stop, +50% arms breakeven, +100% target, 15:45 flatten', () => {
  const m = (mark: number, stop: number | null = null, etMin = 10 * 60) => premiumManage({ entry: 1, mark, stop, etMin }, cfg).action;
  assert.equal(m(0.6), 'stop'); assert.equal(m(0.61), 'hold');
  assert.equal(m(1.5), 'arm_breakeven'); assert.equal(m(1.2, 1), 'hold'); assert.equal(m(1.0, 1), 'breakeven_stop');
  assert.equal(m(2.0), 'target'); assert.equal(m(1.1, null, 15 * 60 + 45), 'flatten');
  assert.equal(zeroDteQuantity(1.0, cfg), 3); assert.equal(zeroDteQuantity(5, cfg), 0);
});
t('sleeve of a held position: tag first, else DTE at entry', () => {
  assert.equal(sleeveOfPosition({ entrySignals: JSON.stringify(['sleeve:swing']), expiryDate: '2026-10-06', entryTime: '2026-10-06T14:00:00Z' }), 'swing');
  assert.equal(sleeveOfPosition({ entrySignals: null, expiryDate: '2026-10-07', entryTime: '2026-10-06T14:00:00Z' }), '0dte');
  assert.equal(sleeveOfPosition({ entrySignals: null, expiryDate: '2026-11-20', entryTime: '2026-10-06T14:00:00Z' }), 'swing');
});
t('swing: ordered by the ONE grade; live only (g2 lifecycle factor)', () => {
  const base = { publishMs: 0, windowEndsMs: 10, publishedDay: 'd', today: 'd', nowMs: 1 };
  const a = nexusGrade({ ...base, lifecycle: 'fresh', convictionScore: 30 });
  const b = nexusGrade({ ...base, lifecycle: 'fresh', convictionScore: 10 });
  const s = nexusGrade({ ...base, lifecycle: 'stale', convictionScore: 40 });
  assert.equal(isLiveGrade(a), true); assert.equal(isLiveGrade(s), false);
  assert.deepEqual(swingOrder([{ ideaId: 'b', grade: b, publishMs: 1 }, { ideaId: 'a', grade: a, publishMs: 0 }]).map((x) => x.ideaId), ['a', 'b']);
  assert.equal(cfg.swingMinGrade, 65);
});
t('never both directions on one symbol', () => {
  assert.equal(underlyingSide({ optionType: 'put', direction: 'long' }), 'short');
  const open = [{ symbol: 'MU', status: 'open', optionType: 'put' }];
  assert.ok(oppositeSideHeld(open, 'MU', 'long'));
  assert.equal(oppositeSideHeld(open, 'MU', 'short'), null);
  assert.equal(oppositeSideHeld([{ ...open[0], status: 'closed' }], 'MU', 'long'), null);
});
t('no same-day re-entry after a stop (time stops do not count)', () => {
  assert.equal(isStopExit('stop_hit'), true); assert.equal(isStopExit('premium_stop [fill bid=1]'), true);
  assert.equal(isStopExit('breakeven_stop'), true); assert.equal(isStopExit('time_stop [fill-mid mid=1]'), false);
  assert.equal(isStopExit('target_hit'), false);
  const rows = [
    { symbol: 'AAPL', status: 'closed', exitReason: 'stop_hit', exitTime: new Date(et('2026-10-06', '09:55')).toISOString() },
    { symbol: 'MSFT', status: 'closed', exitReason: 'stop_hit', exitTime: new Date(et('2026-10-05', '15:00')).toISOString() },
    { symbol: 'NVDA', status: 'closed', exitReason: 'time_stop', exitTime: new Date(et('2026-10-06', '09:55')).toISOString() },
  ];
  assert.deepEqual([...stoppedOutToday(rows, NOW)], ['AAPL']);
});
t('stale swing position: time stop due past its hold window', () => {
  const v = timeStopDue({ nowMs: NOW, idea: null, entryTime: '2026-09-01T14:00:00Z', direction: 'long', expiryDate: '2026-11-20', liveUnderlying: null, policy: 'plan' });
  assert.equal(v.due, true);
  const fresh = timeStopDue({ nowMs: NOW, idea: null, entryTime: new Date(et('2026-10-06', '09:45')).toISOString(), direction: 'long', expiryDate: '2026-11-20', liveUnderlying: null, policy: 'plan' });
  assert.equal(fresh.due, false);
});
t('executable quote: two-sided, spread cap, session, delayed before the minute', () => {
  const q = { bid: 1, ask: 1.1, mid: 1.05, source: 'cboe', delayed: true };
  assert.equal(executableQuote(q, { nowMs: NOW, maxSpreadPct: 0.15 }).ok, true);
  assert.equal(executableQuote(q, { nowMs: et('2026-10-06', '09:40'), maxSpreadPct: 0.15, delayedNotBeforeEt: 9 * 60 + 50 }).code, 'delayed_quote');
  assert.equal(executableQuote({ ...q, bid: 0 }, { nowMs: NOW, maxSpreadPct: 0.15 }).code, 'one_sided');
  assert.equal(executableQuote(q, { nowMs: et('2026-10-06', '17:00'), maxSpreadPct: 0.15 }).code, 'market_closed');
});
t('skip tally: counts by reason, best three', () => {
  const s = new SkipTally();
  s.add('swing', 'A', 'pending_trigger', 'x', 2); s.add('swing', 'B', 'pending_trigger', 'y', 1); s.add('0dte', 'SPY', 'delayed_quote', 'z', 3);
  const sum = s.summary();
  assert.deepEqual(sum.byReason, { pending_trigger: 2, delayed_quote: 1 });
  assert.equal(sum.top[0].symbol, 'B');
  assert.match(formatSkipSummary(sum), /pending_trigger 2/);
});
t('fill audit: a delayed entry is unverified, never verified', () => {
  const p = {
    assetType: 'option', entryPrice: 1.1, exitPrice: 1.5, quantity: 1, optionType: 'call', strikePrice: 600, expiryDate: '2026-10-06',
    entryTime: '2026-10-06T14:20:00.000Z', exitTime: '2026-10-06T15:00:00.000Z', realizedPnL: 40,
    entryReason: '[0DTE SLEEVE] x [entry ask=1.1000 bid=1.0000 source=cboe feed=unknown delayed=true quoteTime=unknown observedAt=2026-10-06T14:20:00.000Z]',
    exitReason: 'premium_target [fill bid=1.5000 ask=1.6000 source=cboe feed=unknown delayed=true quoteTime=unknown quoteAgeSeconds=unknown observedAt=2026-10-06T15:00:00.000Z]',
  };
  assert.equal(auditBotOptionFill(p).status, 'unverified');
});
t('bot-diagnose (pure): full swing sleeve + stale positions + no 0DTE candidates are named', () => {
  const pf = { id: 'p3', userId: 'system-quant-bot', name: 'Quant Bot · 100K', createdAt: '2026-09-24T00:00:00Z' };
  const positions = [1, 2, 3, 4].map((k) => ({
    id: `x${k}`, portfolioId: 'p3', symbol: `S${k}`, assetType: 'option', direction: 'long', optionType: 'call', strikePrice: 100, expiryDate: '2026-11-20',
    entryTime: '2026-09-25T14:00:00Z', entrySignals: JSON.stringify(['sleeve:swing']), status: 'open', lastPriceUpdate: '2026-10-01T15:00:00Z',
  }));
  const d = diagnose({ nowMs: NOW, portfolios: [pf], positions, ideas: [], lastCycle: null });
  assert.deepEqual(d.capacity.swing, { held: 4, max: 4 });
  assert.ok(d.findings.some((f) => /swing sleeve FULL \(4\/4\); 4 of those are past their hold window/.test(f)), d.findings.join('\n'));
  assert.ok(d.findings.some((f) => /no 0DTE-engine idea/.test(f)));
  assert.ok(d.findings.some((f) => /no worker cycle stamp/.test(f)));
  assert.ok(d.findings.some((f) => /no mark in the last 30 min/.test(f)));
});

console.log(`bot-sleeves: ${n} tests passed`);
