/**
 * Quantinum Analyst — page context, horizon, slash parsing/autocomplete, every
 * deterministic tool against fixture data (prints one example per command),
 * verified-only track record (baseline, n<20, ledger MISMATCH), re-check diff,
 * shared history + prefs routes, access policy, and the ask route's page
 * context / horizon fields. No DB, no network.
 *
 *   npm run test:quantinum-analyst            (EXAMPLES=1 prints each card)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {
  ANALYST_DISCLAIMER, RECORD_MIN_N, diffCards, isToggleShortcut, pageContextLine, parsePageContext, parseRecordPattern, parseSlash,
  patternLabel, resolveCommandArg, sanitizeConversation, suggestCommands, type AnalystCard, type PageContext,
} from '../shared/quantinum-analyst';
import { HORIZON_WINDOWS, daysToExpiry, expiryInHorizon, parseHorizon } from '../shared/quantinum-horizon';
import { ASK_QUANTINUM_DISCLAIMER, type AskCaller } from '../shared/quantinum-ai';
import { runAnalystCommand, type AnalystDeps } from '../server/quantinum-analyst-tools';
import { fileConversationStore, registerQuantinumAnalystRoutes } from '../server/quantinum-analyst-routes';
import { addAnalystFields, applyPageContext } from '../server/quantinum-ai-routes';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = <T>(a: T, b: T, m: string) => { assert.equal(a, b, m); n++; };
const SHOW = process.env.EXAMPLES === '1';

const NOW = Date.parse('2026-10-07T15:00:00Z'); // Wed 11:00 ET
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qtm-analyst-'));

// ── fixtures ─────────────────────────────────────────────────
const dossier = (sym: string, lean: string, chg: number): any => ({
  symbol: sym, asOf: iso(30_000), lean, bullPoints: 3, bearPoints: 1, confidence: 55,
  price: { last: sym === 'SPX' ? 5810.2 : sym === 'SPY' ? 579.4 : sym === 'QQQ' ? 498.1 : 164.23, changePercent: chg, source: 'tradier', asOf: iso(45_000), session: 'regular', stale: false },
  gex: { spot: 164.2, callWall: 170, putWall: 155, zeroGamma: 160.5, regime: 'positive', netGexSign: '+', asOf: iso(300_000) },
  layers: [], unavailable: [], shortGate: null,
});
const levelMap: any = { symbol: 'AMD', asOf: iso(60_000), last: 164.2, levels: [], tolerance: 0.2, atr5m: 0.4, atrDaily: 4.1, session: null, priorSession: null, notes: [],
  clusters: [{ price: 165, score: 3, label: 'PDH' }, { price: 160, score: 2, label: 'VWAP' }, { price: 168.5, score: 2.5, label: 'Weekly high' }, { price: 140, score: 5, label: 'far away' }] };
const buckets: any = { spot: 164.2, asOf: iso(240_000), source: 'tradier', regime: 'positive', byDte: {
  today: { callWall: 167.5, putWall: 162.5, gammaFlipPrice: 163.8, maxGammaStrike: 165, totalGEX: 0.4, expirationsCount: 1 },
  week: { callWall: 170, putWall: 160, gammaFlipPrice: null, maxGammaStrike: 165, totalGEX: 0.9, expirationsCount: 2 },
  month: { callWall: 175, putWall: 155, gammaFlipPrice: 158.2, maxGammaStrike: 170, totalGEX: 1.6, expirationsCount: 3 },
} };
const flowRow = (id: string, type: 'call' | 'put', expiry: string, premium: number): any => ({ id, source: 'bullflow', at: iso(600_000), symbol: 'AMD', optionType: type, strike: type === 'call' ? 170 : 155, expiry, premium, price: 2, size: 100, spot: null, openInterest: null, volOI: null, label: 'Sweep', kind: 'sweep', alertType: 'algo' });
const tape: any = { generatedAt: iso(20_000), windowDays: 1, symbol: 'AMD', truncated: false,
  rows: [flowRow('a', 'call', '2026-10-07', 900_000), flowRow('b', 'put', '2026-10-09', 300_000), flowRow('c', 'call', '2026-10-16', 1_500_000), flowRow('d', 'call', '2026-11-20', 2_000_000)],
  sources: { bullflow: { enabled: true, streamState: 'open', rows: 4, newestAt: iso(600_000) }, chainScan: { ok: false, rows: 0, newestAt: null } } };

// Record population: 22 post-baseline long breakouts (13 T1 / 9 stop), 5 pre-baseline wins (must be ignored),
// 3 short pullbacks (too few), 1 ledger MISMATCH win (must be excluded).
const ideas: any[] = [];
const mk = (id: string, o: Partial<any>) => ideas.push({ id, userId: null, visibility: 'public', symbol: 'AMD', assetType: 'stock', direction: 'long', tradeType: 'breakout', source: 'quant', holdingPeriod: 'swing', entryPrice: 160, stopLoss: 156, targetPrice: 170, riskRewardRatio: 2.5, timestamp: '2026-09-15T14:00:00Z', outcomeStatus: 'hit_target', genScoringLayers: [], ...o });
for (let i = 0; i < 13; i++) mk(`w${i}`, {});
for (let i = 0; i < 9; i++) mk(`l${i}`, { outcomeStatus: 'hit_stop' });
for (let i = 0; i < 5; i++) mk(`old${i}`, { timestamp: '2026-08-01T14:00:00Z' });
for (let i = 0; i < 3; i++) mk(`s${i}`, { direction: 'short', tradeType: 'pullback', symbol: 'NVDA', outcomeStatus: i ? 'hit_stop' : 'hit_target' });
mk('bad1', {});
mk('open1', { outcomeStatus: 'open', timestamp: iso(3_600_000), symbol: 'AMD' });
mk('priv1', { outcomeStatus: 'open', userId: 'someone', visibility: 'private', symbol: 'TSLA', timestamp: iso(1_000_000) });

const board: any = { asOf: iso(900_000), liveAsOf: iso(120_000), honesty: 'Measuring.', sectors: [
  { id: 'semis', label: 'Semiconductors', etf: 'SMH', rank: 1, rankDelta: 2, composite: 82.4, r1: 1.9, r3: 4.2, r10: 7.7, breadth: 71, regime: 'leading', side: 'long', leaders: [{ symbol: 'AMD', r1: 2.1, relSector: 0.4 }, { symbol: 'NVDA', r1: 1.5, relSector: -0.2 }] },
  { id: 'energy', label: 'Energy', etf: 'XLE', rank: 11, rankDelta: -1, composite: 21, r1: -0.8, r3: -2.1, r10: -4, breadth: 22, regime: 'lagging', side: 'short', leaders: [] },
] };

let leans: Record<string, string> = { SPX: 'bullish', SPY: 'bullish', QQQ: 'bullish' };
let chgs: Record<string, number> = { SPX: 0.6, SPY: 0.6, QQQ: 0.9 };
function deps(over: Partial<AnalystDeps> = {}): AnalystDeps {
  return {
    now: () => NOW,
    getDossier: async (s) => dossier(s, leans[s] ?? 'bullish', chgs[s] ?? 2.1),
    getLevels: async () => levelMap,
    getGexBuckets: async () => buckets,
    getFlow: async () => tape,
    getIdea: async (id) => ideas.find((i) => i.id === id) ?? null,
    getIdeas: async () => ideas,
    getSectorBoard: async () => board,
    getNews: async (s) => ({ fetchedAt: iso(5_000), items: s === 'AMD' ? [{ title: 'AMD unveils new accelerator', source: 'Reuters', url: 'https://example.com/a', publishedAt: '20261007T130000', sentiment: 'Somewhat-Bullish' }] : [] }),
    getVerifyLedger: () => ({ asOf: '2026-10-07T02:00:00Z', byId: new Map([['bad1', { verdict: 'MISMATCH' as const }], ['w0', { verdict: 'VERIFIED' as const }]]) }),
    ...over,
  };
}
const page: PageContext = { route: '/t', tab: 'gex', symbol: 'AMD', setupId: null, tool: 'gex' };
const caller = { userId: 'u1', isSuper: false };
async function run(text: string, horizon: any = 'day', p: PageContext = page, d = deps()): Promise<AnalystCard> {
  const parsed = parseSlash(text);
  assert.ok(parsed && parsed.ok, `parses ${text}`);
  const out = await runAnalystCommand((parsed as any).cmd, { horizon: parseHorizon(horizon), page: p, caller }, d);
  assert.ok(out.ok, `${text} runs: ${(out as any).error ?? ''}`);
  return (out as any).card;
}
const fact = (c: AnalystCard, k: string) => c.facts.find((f) => f.key === k)?.value;
function show(label: string, c: AnalystCard) {
  if (!SHOW) return;
  console.log(`\n── ${label} → ${c.title} [${c.status}]${c.message ? ` "${c.message}"` : ''}`);
  for (const f of c.facts) { const s = c.sources.find((x) => x.key === f.src); console.log(`   ${f.label}: ${f.value}${f.unit && f.unit !== '' ? ` (${f.unit})` : ''}   ⟵ ${s?.source} @ ${s?.asOf}`); }
  if (c.table) for (const r of c.table.rows) console.log(`   | ${r.cells.join(' | ')}`);
  if (c.record) console.log(`   RECORD: ${c.record.text}`);
  for (const note of c.notes) console.log(`   note: ${note}`);
}

async function main() {
  // ══ 1. horizon ══════════════════════════════════════════════
  eq(parseHorizon('SWING'), 'swing', 'horizon parse');
  eq(parseHorizon('weekly'), 'day', 'junk → default day');
  eq(HORIZON_WINDOWS.scalp.gexBucket, 'today', 'scalp → 0DTE bucket');
  eq(HORIZON_WINDOWS.swing.gexBucket, 'week', 'swing → week bucket');
  eq(HORIZON_WINDOWS.position.gexBucket, 'month', 'position → month bucket');
  eq(daysToExpiry('2026-10-07', NOW), 0, '0DTE today (ET)');
  ok(expiryInHorizon('2026-10-09', 'day', NOW) && !expiryInHorizon('2026-10-09', 'scalp', NOW), '2DTE is day, not scalp');
  ok(expiryInHorizon('2026-10-16', 'swing', NOW) && !expiryInHorizon('2026-10-16', 'day', NOW), '9DTE is swing');
  ok(expiryInHorizon('2026-11-20', 'position', NOW) && !expiryInHorizon('2026-10-09', 'position', NOW), 'position ≥8DTE');

  // ══ 2. page context + slash parsing ═══════════════════════════
  const pc = parsePageContext({ route: '/t', tab: 'GEX', symbol: 'amd', setupId: 'idea_1', tool: 'gex', evil: '<x>' });
  eq(pc.symbol, 'AMD', 'page ctx symbol upper-cased');
  eq(pc.tab, 'gex', 'tab lower-cased');
  eq(parsePageContext({ route: 'javascript:alert(1)', setupId: '../../x' }).route, null, 'bad route dropped');
  eq(parsePageContext({ setupId: '../../x' }).setupId, null, 'bad setup id dropped');
  ok(/focused ticker AMD/.test(pageContextLine(pc)) && /selected NEXUS setup idea_1/.test(pageContextLine(pc)), 'context line for the model');
  eq(parseSlash('what are the levels?'), null, 'free text is not a command');
  ok(parseSlash('/bogus x') && !(parseSlash('/bogus x') as any).ok, 'unknown command rejected');
  ok(!(parseSlash('/sector') as any).ok, '/sector requires a name');
  eq((parseSlash('/levels nvda') as any).cmd.arg, 'nvda', 'arg captured');
  eq(suggestCommands('/').length, 7, 'autocomplete lists all 7 on "/"');
  eq(suggestCommands('/se').map((s) => s.name).join(','), 'setup,sector', 'autocomplete prefix');
  eq(suggestCommands('/levels NVDA').length, 0, 'no suggestions once an arg is typed');
  const r0 = resolveCommandArg({ command: 'levels', arg: null }, page);
  ok(r0.ok && (r0 as any).symbol === 'AMD', '/levels with no arg uses the focused ticker');
  ok(!resolveCommandArg({ command: 'levels', arg: null }, { ...page, symbol: null }).ok, '/levels with nothing focused → asks for a ticker');
  ok(!resolveCommandArg({ command: 'flow', arg: 'DROP TABLE' }, page).ok, 'non-ticker refused');
  const rs = resolveCommandArg({ command: 'setup', arg: null }, { ...page, setupId: 'w0' });
  ok(rs.ok && (rs as any).id === 'w0', '/setup with no arg uses the selected NEXUS setup');
  ok(isToggleShortcut({ key: '\\', metaKey: true, ctrlKey: false, altKey: false }) && isToggleShortcut({ key: '\\', metaKey: false, ctrlKey: true, altKey: false }), '⌘\\ and Ctrl+\\ toggle');
  ok(!isToggleShortcut({ key: '\\', metaKey: false, ctrlKey: false, altKey: false }), 'bare backslash does not');

  // ══ 3. record pattern ═══════════════════════════════════════════
  const p1 = parseRecordPattern('A-grade long breakouts');
  ok(p1.grade === 'A' && p1.direction === 'long' && p1.kind === 'breakout' && p1.symbol === null, 'pattern parse');
  eq(parseRecordPattern('nvda shorts').symbol, 'NVDA', 'symbol in pattern');
  eq(patternLabel(p1), 'A-grade long breakouts', 'pattern label');

  // ══ 4. tools on fixtures ═════════════════════════════════════
  const lv = await run('/levels', 'day');
  show('/levels (Day, focused AMD)', lv);
  eq(lv.status, 'ok', 'levels ok');
  eq(fact(lv, 'gex.callWall'), 167.5, 'day → 0DTE bucket call wall');
  eq(fact(lv, 'last'), 164.23, 'quote from dossier');
  ok(lv.facts.every((f) => lv.sources.some((s) => s.key === f.src)), 'every fact has a source');
  ok(lv.sources.every((s) => s.asOf), 'every source carries a timestamp');
  ok(!lv.table!.rows.some((r) => r.cells[0] === 140), 'far level (>8%) not shown');
  ok(lv.notes.some((x) => /no ≤2DTE bucket/.test(x)), 'bucket approximation disclosed');
  const lvSwing = await run('/levels AMD', 'swing');
  eq(fact(lvSwing, 'gex.callWall'), 170, 'swing → week bucket');
  ok(lvSwing.notes.some((x) => /No gamma flip/.test(x)), 'null flip disclosed, not guessed');
  const lvNone = await run('/levels ZZZ', 'day', page, deps({ getDossier: async () => { throw new Error('x'); }, getLevels: async () => null, getGexBuckets: async () => null }));
  eq(lvNone.status, 'unavailable', 'all sources down → unavailable');
  eq(lvNone.facts.length, 0, 'no invented numbers');

  const fl = await run('/flow', 'day');
  show('/flow (Day)', fl);
  eq(fact(fl, 'flow.prints'), 2, 'day window keeps 0DTE + 2DTE');
  eq(fact(fl, 'flow.call'), 900_000, 'call premium in window');
  const flScalp = await run('/flow AMD', 'scalp');
  eq(fact(flScalp, 'flow.prints'), 1, 'scalp keeps 0DTE only');
  const flPos = await run('/flow AMD', 'position');
  eq(fact(flPos, 'flow.prints'), 2, 'position keeps ≥8DTE (9DTE weekly + monthly)');
  const flEmpty = await run('/flow AMD', 'day', page, deps({ getFlow: async () => ({ ...tape, rows: [flowRow('z', 'call', '2026-12-18', 5)] }) }));
  eq(flEmpty.status, 'empty', 'no prints in window → empty');
  ok(/nothing qualifies/.test(flEmpty.message ?? ''), '"nothing qualifies" stated');

  const st = await run('/setup', 'day', { ...page, setupId: 'open1' });
  show('/setup (selected NEXUS setup)', st);
  eq(st.status, 'ok', 'setup ok');
  eq(fact(st, 'entry'), 160, 'plan entry');
  ok(typeof fact(st, 'grade') === 'string', 'grade shown');
  ok(st.record != null, 'setup carries a verified record line');
  const stSym = await run('/setup AMD', 'day');
  eq(stSym.subject, 'AMD', 'setup by symbol → latest open AMD');
  const stPriv = await run('/setup TSLA');
  eq(stPriv.status, 'empty', "another member's private setup not shown");
  const stNone = await run('/setup MSFT');
  ok(stNone.status === 'empty' && /nothing qualifies/.test(stNone.message ?? ''), 'no setup → nothing qualifies');

  const ix = await run('/indices');
  show('/indices (agree)', ix);
  eq(ix.table!.rows.length, 3, 'SPX SPY QQQ rows');
  eq(fact(ix, 'agree.lean'), 'yes — all bullish', 'leans agree');
  eq(ix.message, 'SPX, SPY and QQQ agree.', 'agreement headline');
  leans = { SPX: 'bullish', SPY: 'bullish', QQQ: 'bearish' }; chgs = { SPX: 0.3, SPY: 0.3, QQQ: -0.4 };
  const ix2 = await run('/indices');
  show('/indices (split)', ix2);
  eq(ix2.message, 'The indices do not agree.', 'disagreement stated');
  const ix3 = await run('/indices', 'day', page, deps({ getDossier: async (s) => (s === 'SPY' ? dossier(s, 'bullish', 1) : null) }));
  eq(ix3.status, 'unavailable', 'one index read → agreement not in the data');

  const sc = await run('/sector semis');
  show('/sector semis', sc);
  eq(fact(sc, 'rank'), 1, 'sector rank');
  ok(sc.title.includes('Semiconductors'), 'matched by id');
  eq((await run('/sector smh')).title.includes('Semiconductors'), true, 'matched by ETF');
  const en = await run('/sector energy');
  ok(en.notes.some((x) => /nothing qualifies/.test(x)), 'no leaders → nothing qualifies note');
  eq((await run('/sector crypto miners')).status, 'empty', 'unknown sector → empty with the list');
  eq((await run('/sector semis', 'day', page, deps({ getSectorBoard: async () => null }))).status, 'unavailable', 'board unpublished → unavailable');

  const nw = await run('/news');
  show('/news (AMD)', nw);
  eq(fact(nw, 'news.count'), 1, 'news count');
  const nwE = await run('/news NVDA');
  eq(nwE.status, 'empty', 'no headlines → empty');

  // ══ 5. verified track record ═════════════════════════════════════
  const rc = await run('/record long breakouts');
  show('/record long breakouts', rc);
  eq(rc.record!.n, 22, 'n = 22 post-baseline decided (pre-baseline + MISMATCH excluded)');
  eq(rc.record!.wins, 13, '13 T1 hits (ledger MISMATCH win removed)');
  eq(rc.record!.t1HitPct, 59.1, 'T1 hit 59.1%');
  eq(rc.record!.text, 'long breakouts: T1 hit 59.1% (n=22, since 2026-08-26)', 'record line format');
  eq(rc.record!.ledger!.mismatchesExcluded, 1, 'mismatch count disclosed');
  ok(rc.sources.some((s) => /since 2026-08-26/.test(s.source)), 'source states the baseline');
  const few = await run('/record NVDA shorts');
  show('/record NVDA shorts', few);
  eq(few.record!.verdict, 'too_few', 'n=3 → too few');
  eq(few.record!.t1HitPct, null, 'no rate under the floor');
  ok(/too few to judge \(n=3/.test(few.record!.text), '"too few to judge" text');
  eq(RECORD_MIN_N, 20, 'floor is 20');
  const none = await run('/record TSLA');
  eq(none.status, 'empty', 'no decided → empty');
  const noLedger = await run('/record long breakouts', 'day', page, deps({ getVerifyLedger: () => null }));
  eq(noLedger.record!.n, 23, 'without the ledger the MISMATCH row is not removed …');
  ok(noLedger.sources.some((s) => /ledger not present/.test(s.source)), '… and the source says so');
  const pre = await run('/record AMD', 'day', page, deps({ getIdeas: async () => ideas.filter((i) => i.id.startsWith('old')) }));
  eq(pre.record!.n, 0, 'pre-2026-08-26 outcomes never counted');

  // ══ 6. re-check diff + conversation sanitize ═════════════════════
  const a = await run('/levels', 'day');
  const b = await run('/levels', 'day', page, deps({ getGexBuckets: async () => ({ ...buckets, byDte: { ...buckets.byDte, today: { ...buckets.byDte.today, callWall: 168 } } }) }));
  const d = diffCards(a, b);
  eq(d.changed.length, 1, 'one fact changed');
  eq(d.changed[0].before, 167.5, 'diff before');
  eq(d.changed[0].after, 168, 'diff after');
  eq(diffCards(a, a).changed.length, 0, 'no change → empty diff');
  const conv = sanitizeConversation([{ id: 'm1', role: 'system', content: 'x', at: 'nope' }, { id: '../bad', role: 'user', content: 'y' }, { id: 'm2', role: 'assistant', content: 'z', at: iso(0), card: a }]);
  eq(conv.length, 2, 'bad id dropped');
  eq(conv[0].role, 'user', 'system role coerced');
  ok(conv[1].card?.command === 'levels', 'card kept');
  eq(sanitizeConversation(Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, role: 'user', content: 'q', at: iso(0) }))).length, 120, 'thread capped at 120');

  // ══ 7. ask route helpers: page context + horizon fields ═══════════
  const t1 = applyPageContext({ kind: 'page', page: '/t?tab=gex' } as any, page);
  ok(t1.kind === 'ticker' && t1.symbol === 'AMD', '"what are the levels?" on a focused page → ticker AMD');
  const t2 = applyPageContext({ kind: 'page' } as any, { ...page, setupId: 'open1' });
  ok(t2.kind === 'setup' && t2.id === 'open1', 'selected setup → setup target');
  const t3 = applyPageContext({ kind: 'flow', symbol: 'NVDA' } as any, page);
  eq(t3.symbol, 'NVDA', 'explicit object wins over page context');
  const pack = await addAnalystFields({ generatedAt: iso(0), target: { kind: 'ticker', symbol: 'AMD' }, fields: [], missing: [] }, page, 'position', deps());
  ok(pack.fields.some((f) => f.key === 'page.context' && /focused ticker AMD/.test(String(f.value))), 'page context in the pack');
  const gh = pack.fields.find((f) => f.key === 'gex.horizon');
  ok(gh && (gh.value as any).callWall === 175 && gh.asOf, 'position GEX walls (month bucket) in the pack, stamped');
  const pack2 = await addAnalystFields({ generatedAt: iso(0), target: { kind: 'ticker', symbol: 'AMD' }, fields: [], missing: [] }, page, 'scalp', deps({ getGexBuckets: async () => null }));
  ok(pack2.missing.some((m) => /scalp/.test(m)), 'missing horizon GEX → missing, not guessed');
  eq(ASK_QUANTINUM_DISCLAIMER, 'Educational, can be wrong — decisions are yours.', 'disclaimer text');
  eq(ANALYST_DISCLAIMER, ASK_QUANTINUM_DISCLAIMER, 'one disclaimer');

  // ══ 8. routes end to end ═══════════════════════════════════════
  const callers: Record<string, AskCaller> = {
    admin: { userId: 'admin1', tier: 'admin', role: 'super' },
    desk: { userId: 'desk1', tier: 'free', role: 'desk' },
    member: { userId: 'mem1', tier: 'pro', role: 'none' },
  };
  const app = express();
  app.use(express.json());
  const pass = (_q: any, _s: any, next: any) => next();
  const store = fileConversationStore(path.join(tmp, 'conv'));
  registerQuantinumAnalystRoutes(app, pass, {
    mode: () => undefined, // default admin
    caller: async (req) => callers[String(req.headers['x-who'])] ?? { userId: null, tier: null, role: 'none' },
    tools: () => deps(),
    store: () => store,
  });
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (method: string, p: string, who: string, body?: unknown) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: { 'content-type': 'application/json', 'x-who': who }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json() as any };
  };
  try {
    eq((await call('POST', '/api/quantinum/ai/command', 'member', { text: '/indices' })).status, 403, 'member blocked under admin mode (policy unchanged)');
    const c1 = await call('POST', '/api/quantinum/ai/command', 'desk', { text: '/levels', horizon: 'swing', page });
    eq(c1.status, 200, 'desk admin can run commands');
    eq(c1.json.card.facts.find((f: any) => f.key === 'gex.callWall').value, 170, 'route honours horizon');
    eq((await call('POST', '/api/quantinum/ai/command', 'admin', { command: 'record', arg: 'long breakouts', page })).json.card.record.n, 22, 'command+arg form');
    eq((await call('POST', '/api/quantinum/ai/command', 'admin', { text: '/nope' })).status, 400, 'bad command → 400');
    eq((await call('POST', '/api/quantinum/ai/command', 'admin', { text: '/flow', page: { route: '/t' } })).status, 400, 'no ticker → 400 with a message');
    eq((await call('GET', '/api/quantinum/ai/history', 'admin')).json.messages.length, 0, 'empty history');
    eq((await call('PUT', '/api/quantinum/ai/history', 'admin', { messages: [{ id: 'm1', role: 'user', content: '/levels', at: iso(0), page: { route: '/t', symbol: 'AMD' } }, { id: 'm2', role: 'assistant', content: 'Levels · AMD', at: iso(0), card: c1.json.card }] })).json.count, 2, 'history saved');
    const h = await call('GET', '/api/quantinum/ai/history', 'admin');
    ok(h.json.messages.length === 2 && h.json.messages[1].card.command === 'levels', 'history read back with card (shared across pages)');
    eq((await call('GET', '/api/quantinum/ai/history', 'desk')).json.messages.length, 0, 'history is per member');
    eq((await call('PUT', '/api/quantinum/ai/prefs', 'admin', { horizon: 'position' })).json.horizon, 'position', 'pref saved');
    eq((await call('GET', '/api/quantinum/ai/history', 'admin')).json.horizon, 'position', 'pref persisted per member');
    eq((await call('DELETE', '/api/quantinum/ai/history', 'admin')).status, 200, 'clear');
    const after = (await call('GET', '/api/quantinum/ai/history', 'admin')).json;
    ok(after.messages.length === 0 && after.horizon === 'position', 'cleared thread keeps the pref');
    eq((await call('GET', '/api/quantinum/ai/history', 'member')).status, 403, 'member cannot read history under admin mode');
    ok(!fs.readdirSync(path.join(tmp, 'conv')).some((f) => f.includes('admin1')), 'file names never carry the user id');
  } finally {
    server.close();
  }

  console.log(`\ntest-quantinum-analyst: ${n} assertions passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
