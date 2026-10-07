/**
 * RUNNER REPLAY — the 0DTE runner exit (shared/runner-policy.ts) vs "all out at T1"
 * (the published plan) on the recorded 0DTE option ideas of the last N sessions,
 * from the contracts' OWN bars. MEASURING — not a validated edge.
 *
 *   ideas     trade_ideas, asset_type option, entry_premium > 0, one of
 *             zero_dte_flow · zero_dte_desk · index scalps (gex_scanner
 *             GEX_index_scalp_*, incl. open_drive) · index_scalp; published in the
 *             last --sessions completed sessions (default 20); missed entries and
 *             excluded/synthetic rows dropped.
 *   entry     the trigger observer's pass when recorded, else publication; the
 *             recorded entry premium (published mid) for BOTH policies.
 *   bars      contract: Massive aggs 1m → 5m → trades → Alpaca 1Min → Yahoo
 *             (research/verify-nexus-book-sources.ts optionBarChain);
 *             underlying: Alpaca 1Min (IEX) → Yahoo 1m. VWAP from 09:30 on the
 *             underlying's volume (IEX volume for equities — an approximation).
 *   policies  all_out  stop / T1 / 15:45 flatten, whole position
 *             runner   ½ at T1 or +50% premium, rest: breakeven stop, trail
 *                      --trail (default 25%) from peak, back through VWAP,
 *                      +100%, 15:45 flatten
 *   metrics   R unit = 40% of the entry premium (the 0DTE sleeve's premium risk),
 *             the same denominator for both policies. E[R], mean premium %,
 *             capture of peak = (exit − entry) ÷ (peak to 16:00 − entry), win rate.
 *             Halves: the sessions split in time order (walk-forward).
 *
 * Decision rule: runner ON by default only if it beats all_out on E[R] in BOTH
 * halves; otherwise it ships OFF (shared/runner-policy.ts RUNNER_POLICY_DEFAULT_ON).
 *
 * READ-ONLY: one READ ONLY transaction; HTTP GETs cached under --cache.
 *   node --env-file=.env node_modules/.bin/tsx research/runner-replay.ts [--sessions 20] [--trail 25] [--out research/results/runner-replay.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
  MassiveEntitlement, optionBarChain, parseYahoo, attemptsText, type ChainDeps, type HttpResult,
} from './verify-nexus-book-sources';
import {
  buildRunnerTicks, readRunnerPolicy, runnerPath, summarizeRunner, type RunnerConfig, type RunnerPlan, type TickBar,
} from '../shared/runner-policy';
import { premiumPeakFromBars, peakCapture } from '../shared/option-peak';
import { etParts, etWallToMs } from '../shared/loss-rules';
import { zeroDteKindOf } from '../shared/bot-sleeves';
import { readOracleExecutionAudit } from '../shared/oracle-lifecycle';
import { readPlanSnapshot } from '../shared/plan-snapshot';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const SESSIONS = Number(arg('--sessions') ?? 20);
const TRAIL = Number(arg('--trail') ?? 25);
const OUT = arg('--out') ?? 'research/results/runner-replay.json';
const MD = arg('--md') ?? 'docs/RUNNER_REPLAY_2026-10-07.md';
const CACHE = arg('--cache') ?? '/tmp/runner-replay-cache';
const THROTTLE = Number(arg('--throttle') ?? 300);
const MASSIVE_THROTTLE = Number(arg('--massive-throttle') ?? 12_500);
const MASSIVE_KEY = argv.includes('--no-massive') ? null : process.env.POLYGON_API_KEY?.trim() || null;
const R_UNIT = 0.40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ─── cached HTTP ─────────────────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true });
let net = 0, hits = 0;
const fileOf = (k: string) => path.join(CACHE, k.replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
async function cachedJson(key: string, url: string, headers: Record<string, string> = {}): Promise<any | null> {
  const f = fileOf(key);
  if (fs.existsSync(f)) { hits++; try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* refetch */ } }
  for (let a = 0; a < 3; a++) {
    await sleep(THROTTLE * (a + 1)); net++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge-research/1.0', ...headers } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (a + 1)); continue; }
      const body = res.ok ? await res.json() : { __status: res.status };
      fs.writeFileSync(f, JSON.stringify(body));
      return body;
    } catch { /* retry */ }
  }
  return null;
}
async function massiveGet(key: string, url: string): Promise<HttpResult | null> {
  const f = fileOf(key);
  if (fs.existsSync(f)) { hits++; try { return { status: 200, body: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { /* refetch */ } }
  if (!MASSIVE_KEY) return null;
  let last: HttpResult | null = null;
  for (let a = 0; a < 3; a++) {
    await sleep(MASSIVE_THROTTLE); net++;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${MASSIVE_KEY}`, 'User-Agent': 'QuantEdge-research/1.0' } });
      const body = await res.json().catch(() => ({}));
      last = { status: res.status, body };
      if (res.status === 429 || res.status >= 500) { await sleep(res.status === 429 ? 61_000 : 3000 * (a + 1)); continue; }
      if (res.ok && (body?.status == null || body.status === 'OK' || body.status === 'DELAYED')) fs.writeFileSync(f, JSON.stringify(body));
      return last;
    } catch { /* retry */ }
  }
  return last;
}
const entitlement = new MassiveEntitlement(!!MASSIVE_KEY);
entitlement.onRefusal = (ep, kind, status, message) => console.warn(`[massive] ${ep} ${kind} (HTTP ${status}: ${message}) — skipped for the rest of the run`);
const deps: ChainDeps = {
  massive: MASSIVE_KEY ? massiveGet : null, entitlement,
  alpaca: process.env.ALPACA_API_KEY ? { id: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_SECRET_KEY ?? '' } : null,
  json: cachedJson, now: () => Date.now(),
};

// ─── underlying 1m bars ──────────────────────────────────────
const YAHOO_INDEX: Record<string, string> = { SPX: '^GSPC', SPXW: '^GSPC', NDX: '^NDX', RUT: '^RUT', XSP: '^XSP' };
const uMemo = new Map<string, { bars: TickBar[]; source: string }>();
async function underlying1m(symbol: string, day: string): Promise<{ bars: TickBar[]; source: string }> {
  const k = `${symbol}|${day}`;
  if (uMemo.has(k)) return uMemo.get(k)!;
  const [y, m, d] = day.split('-').map(Number);
  const from = etWallToMs(y, m, d, 9 * 60 + 30), to = etWallToMs(y, m, d, 16 * 60);
  let bars: TickBar[] = []; let source = 'none';
  const s = symbol.toUpperCase();
  if (!YAHOO_INDEX[s] && deps.alpaca) {
    const j = await cachedJson(`au1m_${s}_${day}`,
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(s)}/bars?timeframe=1Min&start=${new Date(from).toISOString()}&end=${new Date(to).toISOString()}&limit=10000&feed=iex&adjustment=raw`,
      { 'APCA-API-KEY-ID': deps.alpaca.id, 'APCA-API-SECRET-KEY': deps.alpaca.secret });
    bars = ((j?.bars ?? []) as any[]).map((b) => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).filter((b) => fin(b.t) && b.h > 0);
    source = 'alpaca:1Min(iex)';
  }
  if (bars.length < 100) {
    const ys = YAHOO_INDEX[s] ?? s;
    const j = await cachedJson(`yu1m_${ys}_${day}`,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${Math.floor(from / 1000)}&period2=${Math.floor(to / 1000)}&interval=1m&includePrePost=false`);
    const yb = parseYahoo(j).filter((b) => b.t >= from && b.t < to);
    if (yb.length > bars.length) { bars = yb; source = `yahoo:${ys}:1m`; }
  }
  bars.sort((a, b) => a.t - b.t);
  const r = { bars, source };
  uMemo.set(k, r);
  return r;
}

function occOf(root: string, day: string, side: 'call' | 'put', strike: number): string {
  return `${root}${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}${side === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}
const rootsOf = (s: string) => (s === 'SPX' ? ['SPXW', 'SPX'] : s === 'NDX' ? ['NDXP', 'NDX'] : [s]);

interface Row {
  id: string; day: string; symbol: string; kind: string; contract: string; entryPremium: number; entryAt: string;
  recorded: string; barSource: string; underlyingSource: string; peak: number | null; peakAt: string | null;
  allOut: { exit: number; why: string; pct: number; R: number; capture: number | null };
  runner: { exit: number; t1: number | null; runner: number | null; why: string; pct: number; R: number; capture: number | null };
  /** Runner with the partial at the underlying T1 only (what the idea record implements). */
  runnerT1: { exit: number; why: string; pct: number; R: number; capture: number | null };
  t1Reached: boolean;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const cfg: RunnerConfig = { ...readRunnerPolicy({ RUNNER_POLICY: 'on', RUNNER_TRAIL_PCT: String(TRAIL) }), on: true };
  const today = etParts(Date.now()).dateKey;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  let rows: any[] = [];
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    // Last N completed weekday sessions (calendar; holidays simply have no rows).
    const days: string[] = [];
    for (let t = Date.now() - 86_400_000; days.length < SESSIONS; t -= 86_400_000) { const p = etParts(t); if (p.weekday >= 1 && p.weekday <= 5) days.push(p.dateKey); }
    const since = days[days.length - 1];
    const res = await client.query(`
      SELECT id, symbol, source, data_source_used, option_type, strike_price, expiry_date, entry_premium, entry_price, target_price, stop_loss,
             direction, outcome_status, resolution_reason, timestamp, exit_date, exclude_from_training, convergence_signals_json
        FROM trade_ideas
       WHERE asset_type = 'option' AND entry_premium > 0 AND timestamp >= $1
         AND (source IN ('zero_dte_flow','zero_dte_desk','index_scalp') OR data_source_used LIKE 'GEX_index_scalp_%')
       ORDER BY timestamp`, [since + 'T00:00:00-04:00']);
    rows = res.rows;
    await client.query('ROLLBACK');
  } finally { await client.end(); }

  const out: Row[] = [];
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1; };
  for (const i of rows) {
    const pubMs = Date.parse(i.timestamp);
    const day = etParts(pubMs).dateKey;
    if (day >= today) { skip('session_not_complete'); continue; }
    if (i.exclude_from_training) { skip('excluded'); continue; }
    if (String(i.resolution_reason ?? '').startsWith('missed_entry') || i.resolution_reason === 'never_triggered_no_outcome') { skip('never_triggered'); continue; }
    const kind = zeroDteKindOf({ source: i.source, dataSourceUsed: i.data_source_used });
    if (!kind) { skip('not_0dte_kind'); continue; }
    const snap = readPlanSnapshot(i.convergence_signals_json);
    const E = num(snap?.entryPremium ?? i.entry_premium)!;
    const strike = num(snap?.strikePrice ?? i.strike_price);
    const side = String(snap?.optionType ?? i.option_type).toLowerCase().startsWith('p') ? 'put' : 'call';
    const expiry = String(snap?.expiryDate ?? i.expiry_date ?? '').slice(0, 10);
    const uStop = num(snap?.stopLoss ?? i.stop_loss), uT1 = num(snap?.targetPrice ?? i.target_price), uEntry = num(snap?.entryPrice ?? i.entry_price);
    if (!(strike && strike > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !(uStop && uT1 && uEntry)) { skip('no_contract_or_levels'); continue; }
    if (Math.abs(uEntry / strike - 1) > 0.2) { skip('levels_off_strike_scale'); continue; }
    const audit = readOracleExecutionAudit(i.convergence_signals_json);
    const trigMs = audit?.triggerObservedAt ? Date.parse(audit.triggerObservedAt) : NaN;
    const entryMs = Number.isFinite(trigMs) && trigMs >= pubMs ? trigMs : pubMs;
    const [y, m, d] = day.split('-').map(Number);
    const openMs = etWallToMs(y, m, d, 9 * 60 + 30), closeMs = etWallToMs(y, m, d, 16 * 60);
    if (entryMs >= etWallToMs(y, m, d, cfg.flattenEt)) { skip('entry_after_flatten'); continue; }

    const u = await underlying1m(i.symbol, day);
    if (u.bars.length < 30) { skip('no_underlying_bars'); continue; }
    let chain = null as Awaited<ReturnType<typeof optionBarChain>> | null; let occ = '';
    for (const root of rootsOf(String(i.symbol).toUpperCase())) {
      occ = occOf(root, expiry, side, strike);
      chain = await optionBarChain(occ, openMs, closeMs, deps);
      if (chain.bars.length) break;
    }
    if (!chain || !chain.bars.length) { skip('no_contract_bars'); console.log(`  · ${i.symbol} ${occ}: no bars (${chain ? attemptsText(chain.attempts) : ''})`); continue; }

    const etMinOf = (ms: number) => etParts(ms).minutes;
    const ticks = buildRunnerTicks(chain.bars, u.bars, entryMs, closeMs, openMs, etMinOf);
    if (ticks.length < 3) { skip('no_ticks_after_entry'); continue; }
    const plan: RunnerPlan = { dir: side === 'put' ? 'short' : 'long', entryPremium: E, uStop, uT1 };
    const A = runnerPath(ticks, plan, cfg, 'all_out', { endFill: true });
    const B = runnerPath(ticks, plan, cfg, 'runner', { endFill: true });
    const C = runnerPath(ticks, { ...plan, premT1: false }, cfg, 'runner', { endFill: true });
    const sa = summarizeRunner(A), sb = summarizeRunner(B), sc = summarizeRunner(C);
    const pcx = sc.blendedPremium!;
    const pk = premiumPeakFromBars(chain.bars, entryMs, closeMs, 60_000);
    const pa = sa.blendedPremium!, pb = sb.blendedPremium!;
    const t1Reached = A.legs.some((l) => l.why === 'T1') || B.legs.some((l) => / half$/.test(l.why));
    out.push({
      id: i.id, day, symbol: i.symbol, kind, contract: occ, entryPremium: E, entryAt: new Date(entryMs).toISOString(),
      recorded: `${i.outcome_status}${i.resolution_reason ? ` (${i.resolution_reason})` : ''}`,
      barSource: chain.source, underlyingSource: u.source,
      peak: pk?.premium ?? null, peakAt: pk ? new Date(pk.atMs).toISOString() : null,
      allOut: { exit: r2(pa), why: A.legs.map((l) => l.why).join('+'), pct: r2((pa / E - 1) * 100), R: r3((pa / E - 1) / R_UNIT), capture: pk ? peakCapture(E, pa, pk.premium) : null },
      runner: { exit: r2(pb), t1: sb.t1ExitPremium, runner: sb.runnerExitPremium, why: B.legs.map((l) => l.why).join(' → '), pct: r2((pb / E - 1) * 100), R: r3((pb / E - 1) / R_UNIT), capture: pk ? peakCapture(E, pb, pk.premium) : null },
      runnerT1: { exit: r2(pcx), why: C.legs.map((l) => l.why).join(' → '), pct: r2((pcx / E - 1) * 100), R: r3((pcx / E - 1) / R_UNIT), capture: pk ? peakCapture(E, pcx, pk.premium) : null },
      t1Reached,
    });
    console.log(`  ${day} ${i.symbol} ${occ} E ${E} · all_out ${r2(pa)} (${A.legs.map((l) => l.why).join('+')}) · runner ${r2(pb)} (${B.legs.map((l) => `${l.why} ${l.premium}`).join(' → ')}) · peak ${pk?.premium ?? '—'}`);
  }

  // ─── aggregate ──────────────────────────────────────────────
  const sessions = [...new Set(out.map((r) => r.day))].sort();
  const cut = sessions[Math.floor(sessions.length / 2)] ?? '9999';
  const halves = { first: out.filter((r) => r.day < cut), second: out.filter((r) => r.day >= cut), all: out };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const agg = (rs: Row[]) => {
    type K = 'allOut' | 'runner' | 'runnerT1';
    const caps = (k: K) => rs.map((r) => r[k].capture).filter(fin);
    const one = (k: K) => ({
      n: rs.length,
      ER: mean(rs.map((r) => r[k].R)), avgPremiumPct: mean(rs.map((r) => r[k].pct)),
      winRate: rs.length ? rs.filter((r) => r[k].pct > 0).length / rs.length : null,
      captureOfPeak: mean(caps(k)), captureN: caps(k).length,
    });
    return { allOut: one('allOut'), runner: one('runner'), runnerT1: one('runnerT1'), t1ReachedN: rs.filter((r) => r.t1Reached).length };
  };
  const res = {
    generatedAt: new Date().toISOString(), label: 'MEASURING — not a validated edge',
    sessionsRequested: SESSIONS, sessionsWithIdeas: sessions, halfCut: cut, trailPct: TRAIL, rUnit: `${R_UNIT * 100}% of entry premium`,
    halves: { first: agg(halves.first), second: agg(halves.second), all: agg(halves.all) },
    skipped, network: { calls: net, cacheHits: hits }, massive: entitlement.report(), rows: out,
  };
  const beats = (h: ReturnType<typeof agg>, k: 'runner' | 'runnerT1') => h.allOut.n > 0 && (h[k].ER ?? -Infinity) > (h.allOut.ER ?? Infinity);
  const both = (k: 'runner' | 'runnerT1') => beats(res.halves.first, k) && beats(res.halves.second, k);
  const decision = both('runner') && both('runnerT1') ? 'ON' : 'OFF';
  (res as any).decision = { defaultOn: decision === 'ON', runnerBeatsBothHalves: both('runner'), runnerT1BeatsBothHalves: both('runnerT1'), rule: 'runner (T1/+50%) AND runner (T1 only) E[R] > all_out E[R] in BOTH halves' };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));

  const f = (x: number | null, d = 3) => (x == null ? '—' : x.toFixed(d));
  const pc = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`);
  const line = (name: string, h: ReturnType<typeof agg>) => [
    `| ${name} | ${h.allOut.n} | ${h.t1ReachedN} | ${f(h.allOut.ER)} | ${f(h.runner.ER)} | ${f(h.runnerT1.ER)} | ${f(h.allOut.avgPremiumPct, 1)}% | ${f(h.runner.avgPremiumPct, 1)}% | ${f(h.runnerT1.avgPremiumPct, 1)}% | ${pc(h.allOut.captureOfPeak)} | ${pc(h.runner.captureOfPeak)} | ${pc(h.runnerT1.captureOfPeak)} | ${pc(h.allOut.winRate)} | ${pc(h.runner.winRate)} | ${pc(h.runnerT1.winRate)} |`,
  ].join('');
  const md = [
    `# Runner replay — 0DTE ideas, ${sessions[0] ?? '—'} → ${sessions[sessions.length - 1] ?? '—'}`,
    '',
    `**MEASURING — not a validated edge.** Generated ${res.generatedAt} by \`research/runner-replay.ts\` (read-only).`,
    '',
    `Policies on the same entries (trigger pass when recorded, else publish; recorded entry premium): **all_out** = stop / T1 / 15:45, whole position; **runner** = ½ at T1 or +50% premium, rest breakeven → trail ${TRAIL}% from peak / back through VWAP / +100% / 15:45. R = ${R_UNIT * 100}% of the entry premium for both. Capture = (exit − entry) ÷ (peak to 16:00 − entry). Halves split the ${sessions.length} sessions with ideas in time order at ${cut}.`,
    '',
    'Columns: A = all_out · B = runner (½ at T1 or +50%, the bot) · C = runner (½ at the underlying T1 only, the idea record).',
    '',
    '| half | n | T1/+50% reached | E[R] A | E[R] B | E[R] C | prem % A | prem % B | prem % C | capture A | capture B | capture C | win A | win B | win C |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    line('first', res.halves.first), line('second', res.halves.second), line('all', res.halves.all),
    '',
    `**Decision: RUNNER_POLICY default ${decision}** (rule: B and C each beat A on E[R] in both halves; B both halves: ${both('runner')}, C both halves: ${both('runnerT1')}).`,
    '',
    `Sessions requested ${SESSIONS}; sessions with replayable 0DTE ideas: ${sessions.length} (${sessions.join(', ')}). Skipped: ${JSON.stringify(skipped)}.`,
    `Contract bars: ${[...new Set(out.map((r) => r.barSource.split(':')[0]))].join(', ')}; underlying: ${[...new Set(out.map((r) => r.underlyingSource))].join(', ')}.`,
    '',
    '| day | symbol | contract | entry | A all_out | B runner legs | C runner (T1 only) | peak | recorded |',
    '|---|---|---|---|---|---|---|---|---|',
    ...out.map((r) => `| ${r.day} | ${r.symbol} | ${r.contract} | ${r.entryPremium} | ${r.allOut.exit} (${r.allOut.why}) | ${r.runner.why} → blend ${r.runner.exit} | ${r.runnerT1.why} → ${r.runnerT1.exit} | ${r.peak ?? '—'} | ${r.recorded} |`),
    '',
    'Caveats: small n; option bars are trade prints (Massive / Alpaca indicative / Yahoo), not NBBO — fills at prints are optimistic for both policies alike; a minute with no print carries the last print as close only (no premium-level exits on it); IEX volume makes VWAP approximate.',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(MD), { recursive: true });
  fs.writeFileSync(MD, md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
