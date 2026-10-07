/**
 * Unit tests — the 0DTE desk's one actionability state (shared/zero-dte-actionability.ts).
 *   npm run -s test:zero-dte-actionability
 * Pure: no network, no database, no Date.now() — every case passes its own clock.
 */
import assert from 'node:assert/strict';
import {
  ideaActionability, flowActionability, sniperActionability, sessionBanner, indexHealth, doneKind, hhmmToMin, etMinutesOf, fmtCountdown,
  ACT_CFG, isDoneLike, isIndexSymbol, type IdeaActInput, type ActCtx,
} from '../shared/zero-dte-actionability';

const tests: Array<[string, () => void]> = [];
const t = (name: string, fn: () => void) => tests.push([name, fn]);

// 2026-10-06 is a Tuesday in EDT: ET = UTC − 4.
const ET = (hhmm: string, s = 0) => Date.parse(`2026-10-06T${String(Number(hhmm.slice(0, 2)) + 4).padStart(2, '0')}:${hhmm.slice(3, 5)}:${String(s).padStart(2, '0')}Z`);
const iso = (ms: number) => new Date(ms).toISOString();
const ctx = (hhmm: string, phaseId: string, entriesOpen: boolean): ActCtx => ({ nowMs: ET(hhmm), phaseId, entriesOpen });
const idea = (o: Partial<IdeaActInput> = {}): IdeaActInput => ({
  stage: 'triggered', doneReason: null, distPct: null, hasContract: true,
  quote: { mid: 1.2, at: iso(ET('09:59:30')) }, entryBy: '10:15', exitBy: '15:30', ...o,
});

t('clock helpers', () => {
  assert.equal(etMinutesOf(ET('09:40')), 580);
  assert.equal(hhmmToMin('15:45'), 945);
  assert.equal(hhmmToMin(null), null);
  assert.equal(fmtCountdown(65), '1:05');
  assert.equal(fmtCountdown(3 * 3600 + 120), '3h 02m');
});

t('idea: triggered + fresh quote inside the entry window → LIVE (actionable, rank 0)', () => {
  const a = ideaActionability(idea({ quote: { mid: 1.2, at: iso(ET('10:00') - 30_000) } }), ctx('10:00', 'midday', true));
  assert.equal(a.state, 'live'); assert.equal(a.actionable, true); assert.equal(a.rank, 0); assert.equal(a.label, 'LIVE');
  assert.match(a.reason, /enter by 10:15/);
});

t('idea: triggered but quote older than 2 min → STALE QUOTE (not actionable)', () => {
  const a = ideaActionability(idea({ quote: { mid: 1.2, at: iso(ET('10:00') - (ACT_CFG.QUOTE_STALE_SEC + 60) * 1000) } }), ctx('10:00', 'midday', true));
  assert.equal(a.state, 'stale'); assert.equal(a.actionable, false); assert.match(a.reason, /quote 3m old/);
});

t('idea: triggered with no quote / no contract → STALE', () => {
  assert.equal(ideaActionability(idea({ quote: null }), ctx('10:00', 'midday', true)).state, 'stale');
  assert.match(ideaActionability(idea({ hasContract: false }), ctx('10:00', 'midday', true)).reason, /no contract/);
});

t('idea: triggered past its enter-by → PASSED', () => {
  const a = ideaActionability(idea(), ctx('10:20', 'midday', true));
  assert.equal(a.state, 'passed'); assert.match(a.reason, /10:15/);
});

t('idea: in_play → PASSED (manage only), with exit time', () => {
  const a = ideaActionability(idea({ stage: 'in_play' }), ctx('11:00', 'midday', true));
  assert.equal(a.state, 'passed'); assert.match(a.reason, /15:30/); assert.equal(a.actionable, false);
});

t('idea: watch near trigger → ARMED; far → WATCH (greyed)', () => {
  const armed = ideaActionability(idea({ stage: 'watch', distPct: -0.12, entryBy: '15:45' }), ctx('10:30', 'midday', true));
  assert.equal(armed.state, 'armed'); assert.equal(armed.actionable, true); assert.match(armed.reason, /0\.12% away/);
  const far = ideaActionability(idea({ stage: 'watch', distPct: 1.1, entryBy: '15:45' }), ctx('10:30', 'midday', true));
  assert.equal(far.state, 'watch'); assert.equal(far.actionable, false);
  assert.equal(ideaActionability(idea({ stage: 'watch', distPct: null, entryBy: '15:45' }), ctx('10:30', 'midday', true)).state, 'watch');
});

t('idea: watch before 09:45 → WATCH "entries open 09:45" (pre-market and first 15 min)', () => {
  assert.match(ideaActionability(idea({ stage: 'watch', distPct: 0.05 }), ctx('09:10', 'pre', false)).reason, /entries open 09:45/);
  assert.equal(ideaActionability(idea({ stage: 'watch', distPct: 0.05 }), ctx('09:35', 'open_drive', false)).state, 'watch');
});

t('idea: watch after entries close or past its own entry-by → EXPIRED', () => {
  assert.equal(ideaActionability(idea({ stage: 'watch', distPct: 0.1 }), ctx('15:50', 'power_hour', false)).state, 'expired');
  const own = ideaActionability(idea({ stage: 'watch', distPct: 0.1, entryBy: '11:00' }), ctx('13:00', 'midday', true));
  assert.equal(own.state, 'expired'); assert.match(own.reason, /never triggered/);
});

t('idea: done reasons → DONE · REACHED / DONE · FADED / EXPIRED (time stop beats "stop")', () => {
  assert.equal(ideaActionability(idea({ stage: 'done', doneReason: 'target hit' }), ctx('13:00', 'midday', true)).state, 'done_reached');
  assert.equal(ideaActionability(idea({ stage: 'done', doneReason: 'stop hit — tracker' }), ctx('13:00', 'midday', true)).state, 'done_faded');
  assert.equal(ideaActionability(idea({ stage: 'done', doneReason: 'time stop 15:30 ET (tracker resolving)' }), ctx('15:40', 'power_hour', true)).state, 'expired');
  assert.equal(ideaActionability(idea({ stage: 'done', doneReason: 'stop touched on the live price (tracker resolving)' }), ctx('13:00', 'midday', true)).state, 'done_faded');
  assert.equal(doneKind('time stop / expired'), 'expired');
  assert.equal(doneKind('target touched on the live price'), 'done_reached');
});

t('idea: session closed or past exit-by → EXPIRED; done-like helper', () => {
  assert.equal(ideaActionability(idea(), ctx('16:30', 'closed', false)).reason, 'session closed');
  assert.equal(ideaActionability(idea({ stage: 'in_play' }), ctx('15:31', 'power_hour', false)).state, 'expired');
  assert.ok(isDoneLike('expired') && isDoneLike('done_faded') && !isDoneLike('passed') && !isDoneLike('live'));
});

t('flow: fired, fresh, quote ≤ 2 min → LIVE; > 15 min → PASSED; old quote → STALE', () => {
  const base = { state: 'fired' as const, at: iso(ET('09:38')), quoteAgeSec: 40, hasPlan: true, stateWhy: null, reason: null };
  assert.equal(flowActionability(base, ctx('09:40', 'open_drive', false)).state, 'live');
  assert.equal(flowActionability({ ...base, quoteAgeSec: 300 }, ctx('09:40', 'open_drive', false)).state, 'stale');
  assert.equal(flowActionability({ ...base, quoteAgeSec: null }, ctx('09:40', 'open_drive', false)).state, 'stale');
  const p = flowActionability(base, ctx('10:10', 'midday', true));
  assert.equal(p.state, 'passed'); assert.match(p.reason, /32m ago/);
  assert.equal(flowActionability({ ...base, at: iso(ET('11:25')) }, ctx('11:35', 'midday', true)).state, 'passed');
});

t('flow: reached / faded / time stop / watch', () => {
  const base = { at: iso(ET('09:45')), quoteAgeSec: 10, hasPlan: true, reason: null };
  assert.equal(flowActionability({ ...base, state: 'reached', stateWhy: 'mid 2.10 ≥ +50%' }, ctx('10:30', 'midday', true)).state, 'done_reached');
  assert.equal(flowActionability({ ...base, state: 'faded', stateWhy: 'premium −40% (0.70)' }, ctx('10:30', 'midday', true)).state, 'done_faded');
  assert.equal(flowActionability({ ...base, state: 'faded', stateWhy: 'time stop 15:30 ET' }, ctx('15:31', 'power_hour', false)).state, 'expired');
  const w = flowActionability({ ...base, state: 'watch', stateWhy: null, reason: 'below VWAP' }, ctx('10:00', 'midday', true));
  assert.equal(w.state, 'watch'); assert.match(w.reason, /below VWAP/);
  assert.equal(flowActionability({ ...base, state: 'watch', stateWhy: null, reason: null }, ctx('13:00', 'midday', true)).state, 'expired');
});

t('sniper: published within 10 min → LIVE; later → PASSED; watch rows stay WATCH', () => {
  const r = { status: 'published' as const, triggerAt: iso(ET('10:02')), contracts: 2 };
  assert.equal(sniperActionability(r, ctx('10:05', 'midday', true)).state, 'live');
  assert.equal(sniperActionability(r, ctx('10:30', 'midday', true)).state, 'passed');
  assert.equal(sniperActionability({ ...r, contracts: 0 }, ctx('10:05', 'midday', true)).state, 'stale');
  assert.equal(sniperActionability({ ...r, status: 'watch' }, ctx('10:05', 'midday', true)).state, 'watch');
  assert.equal(sniperActionability(r, ctx('16:10', 'closed', false)).state, 'expired');
});

t('session banner: pre / first 15 / open / power hour / closed with countdowns', () => {
  const pre = sessionBanner(ET('09:20', 0), 'pre');
  assert.equal(pre.id, 'pre'); assert.equal(pre.secondsLeft, 600); assert.equal(pre.toCloseSec, null);
  const first = sessionBanner(ET('09:40', 0), 'open_drive');
  assert.equal(first.next, 'entries open 09:45'); assert.equal(first.secondsLeft, 300); assert.equal(first.toCloseSec, 380 * 60);
  assert.equal(sessionBanner(ET('13:00'), 'midday').next, 'power hour 15:00');
  assert.equal(sessionBanner(ET('15:10'), 'power_hour').next, 'entries close 15:45');
  assert.equal(sessionBanner(ET('15:50'), 'power_hour').next, 'close 16:00');
  assert.equal(sessionBanner(ET('16:05'), 'closed').id, 'closed');
  assert.equal(sessionBanner(ET('11:00'), 'closed').id, 'closed', 'server says closed (weekend) — the banner obeys');
});

t('index health: ok / lagging / BLIND / idle', () => {
  const now = ET('10:00');
  const h = (scanAgo: number | null, gexAgo: number | null) => ({ scanAt: scanAgo == null ? null : iso(now - scanAgo * 1000), gexAt: gexAgo == null ? null : iso(now - gexAgo * 1000), wait: null });
  assert.equal(indexHealth(h(60, 90), now, 'midday').tone, 'ok');
  assert.equal(indexHealth(h(60, 400), now, 'midday').tone, 'warn');
  assert.equal(indexHealth(h(60, 900), now, 'midday').tone, 'blind');
  assert.equal(indexHealth(h(60, null), now, 'midday').tone, 'blind');
  assert.equal(indexHealth(null, now, 'midday').tone, 'blind');
  assert.equal(indexHealth(h(null, null), now, 'midday').tone, 'blind');
  assert.equal(indexHealth(h(60, 90), now, 'closed').tone, 'idle');
  assert.equal(indexHealth(null, now, 'pre').tone, 'idle');
});

t('filters: index lane', () => {
  assert.ok(isIndexSymbol('SPX') && isIndexSymbol('spy') && isIndexSymbol('QQQ'));
  assert.ok(!isIndexSymbol('TSLA') && !isIndexSymbol('META'));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
