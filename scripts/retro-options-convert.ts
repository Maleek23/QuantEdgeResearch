/**
 * SHARES → OPTIONS (retro) — every legacy STOCK idea from an option-capable engine
 * (market_scanner, quant, sector_ignition, leaders, gex_scanner, flow) since
 * 2026-08-26, re-expressed as the option play the budget rule WOULD have picked at
 * publish — no hindsight — and priced from that contract's real bars.
 * (operator 2026-10-14: "any shares should be converted to the options play as long
 * as stock moves"; shared/journal-pnl-truth.ts).
 *
 *   1. only ideas whose underlying TRIGGERED (executionAudit.triggerObservedAt, else
 *      the first underlying bar after publication trading at the entry) — else
 *      status not_triggered, never converted;
 *   2. candidates: call for a long / put for a short; the nearest Friday with DTE ≥
 *      the idea's hold (day 1, swing/position = hold days, default 3), then the
 *      monthly; strikes on a grid around the underlying AT THE TRIGGER;
 *   3. each candidate priced from its own 1-minute bars AT OR BEFORE the trigger
 *      (nothing after it), IV inverted from that price, |Δ| 0.15–0.45, whole
 *      contracts ≤ $500, traded (volume > 0) — best projected payoff at T1 per $
 *      (shared/journal-pnl-truth.ts pickRetroContract);
 *   4. the picked contract: entry = the first bar at/after the trigger (open), exit =
 *      the last bar at/before the idea's recorded exit time (close), peak = max high
 *      between; Massive aggs (prior days) → Alpaca 1-min → Yahoo
 *      (research/verify-nexus-book-sources.ts optionBarChain). No bars → status
 *      unverifiable, not counted.
 *
 * READ-ONLY on the database (one READ ONLY transaction, rolled back). DRY RUN by
 * default: prints counts + the top 20 conversions and writes nothing. --write writes
 * the derived records to the retro ledger FILE (.cache/shared/ledgers/
 * nexus-retro-options.json or --out / NEXUS_RETRO_OPTIONS_LEDGER) — never the DB.
 *
 *   set -a && . ./.env && set +a && npx tsx scripts/retro-options-convert.ts [--write] [--out f.json]
 *     [--ids a,b] [--limit N] [--budget 500] [--skip-known] [--massive-throttle 250] [--cache DIR] [--report f.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
  RETRO_LEDGER_VERSION, RETRO_OPTION_ENGINES, RETRO_SINCE, pickRetroContract, readRetroLedger, retroExpiries, retroMinDte, strikeGrid,
  wholeContractPnl, type RetroCandidate, type RetroRecord,
} from '../shared/journal-pnl-truth';
import { bsDelta, bsPrice, impliedVol } from '../shared/iv-fill';
import { MassiveEntitlement, optionBarChain, parseYahoo, type Bar, type ChainDeps, type HttpResult } from '../research/verify-nexus-book-sources';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const WRITE = argv.includes('--write');
const OUT = arg('--out') ?? process.env.NEXUS_RETRO_OPTIONS_LEDGER ?? path.join(process.cwd(), '.cache', 'shared', 'ledgers', 'nexus-retro-options.json');
const REPORT = arg('--report') ?? null;
const IDS = arg('--ids')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const LIMIT = arg('--limit') ? Number(arg('--limit')) : null;
const BUDGET = Number(arg('--budget') ?? 500);
const SKIP_KNOWN = argv.includes('--skip-known');
const CACHE = arg('--cache') ?? path.join(process.cwd(), '.cache', 'retro-options-cache');
const MASSIVE_THROTTLE = Number(arg('--massive-throttle') ?? 12_500);
const THROTTLE = Number(arg('--throttle') ?? 250);
const MASSIVE_KEY = argv.includes('--no-massive') ? null : process.env.POLYGON_API_KEY?.trim() || null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etDay = (ms: number) => etFmt.format(new Date(ms));

// ── cached HTTP ──────────────────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true });
let netCalls = 0, cacheHits = 0;
const cacheFile = (key: string) => path.join(CACHE, key.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) + '.json');
async function cachedJson(key: string, url: string, headers: Record<string, string> = {}): Promise<any | null> {
  const f = cacheFile(key);
  if (fs.existsSync(f)) { cacheHits++; try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* refetch */ } }
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(THROTTLE * (attempt + 1));
    netCalls++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge-retro/1.0', ...headers } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      const body = res.ok ? await res.json() : { __status: res.status };
      if (res.ok) fs.writeFileSync(f, JSON.stringify(body));
      return body;
    } catch { /* retry */ }
  }
  return null;
}
async function massiveGet(key: string, url: string): Promise<HttpResult | null> {
  const f = cacheFile(key);
  if (fs.existsSync(f)) { cacheHits++; try { return { status: 200, body: JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { /* refetch */ } }
  if (!MASSIVE_KEY) return null;
  let last: HttpResult | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(MASSIVE_THROTTLE);
    netCalls++;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${MASSIVE_KEY}`, 'User-Agent': 'QuantEdge-retro/1.0' } });
      const body = await res.json().catch(() => ({}));
      last = { status: res.status, body };
      if (res.status === 429 || res.status >= 500) { await sleep(res.status === 429 ? 61_000 : 3000 * (attempt + 1)); continue; }
      if (res.ok && (body?.status == null || body.status === 'OK' || body.status === 'DELAYED')) fs.writeFileSync(f, JSON.stringify(body));
      return last;
    } catch { /* retry */ }
  }
  return last;
}
const entitlement = new MassiveEntitlement(!!MASSIVE_KEY);
const ALPACA = process.env.ALPACA_API_KEY ? { id: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_SECRET_KEY ?? '' } : null;
const deps: ChainDeps = { massive: MASSIVE_KEY ? massiveGet : null, entitlement, alpaca: ALPACA, json: cachedJson, now: () => Date.now() };

// ── bars ─────────────────────────────────────────────────────
async function underlyingBars(symbol: string, fromMs: number, toMs: number): Promise<{ bars: Bar[]; source: string }> {
  const p1 = Math.floor((fromMs - 86_400_000) / 1000), p2 = Math.floor((Math.min(toMs, Date.now()) + 86_400_000) / 1000);
  const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const j = await cachedJson(`y5m_${symbol}_${d(fromMs)}_${d(toMs)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=5m&includePrePost=false`);
  let bars = parseYahoo(j);
  let source = `yahoo:${symbol}:5m`;
  if (!bars.length && ALPACA) {
    const a = await cachedJson(`a5m_${symbol}_${d(fromMs)}_${d(toMs)}`,
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=5Min&start=${new Date(fromMs - 86_400_000).toISOString()}&end=${new Date(Math.min(toMs + 86_400_000, Date.now() - 16 * 60_000)).toISOString()}&limit=10000&feed=iex&adjustment=raw`,
      { 'APCA-API-KEY-ID': ALPACA.id, 'APCA-API-SECRET-KEY': ALPACA.secret });
    bars = ((a?.bars ?? []) as any[]).map((b) => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).filter((b) => fin(b.t) && b.h > 0);
    source = `alpaca:${symbol}:5Min(iex)`;
  }
  return { bars: bars.sort((a, b) => a.t - b.t), source };
}

/** 1-min bars for many contracts in one Alpaca call (selection only); missing ones fall back to the chain. */
async function alpacaMulti(occs: string[], fromMs: number, toMs: number): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  if (!ALPACA || !occs.length) return out;
  const end = Math.min(toMs, Date.now() - 16 * 60_000);
  if (end <= fromMs) return out;
  const qs = new URLSearchParams({ symbols: occs.join(','), timeframe: '1Min', start: new Date(fromMs).toISOString(), end: new Date(end).toISOString(), limit: '10000' });
  const j = await cachedJson(`aom_${occs[0]}_${occs.length}_${fromMs}_${end}`, `https://data.alpaca.markets/v1beta1/options/bars?${qs}`,
    { 'APCA-API-KEY-ID': ALPACA.id, 'APCA-API-SECRET-KEY': ALPACA.secret });
  for (const occ of occs) {
    const bars = ((j?.bars?.[occ] ?? []) as any[]).map((b) => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 })).filter((b) => fin(b.t) && b.c > 0);
    if (bars.length) out.set(occ, bars.sort((a, b) => a.t - b.t));
  }
  return out;
}

const occOf = (root: string, day: string, side: 'call' | 'put', strike: number) =>
  `${root}${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}${side === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;

// ── the book (read-only) ─────────────────────────────────────
interface Idea {
  id: string; symbol: string; assetType: string; source: string; direction: 'long' | 'short'; entryPrice: number; targetPrice: number | null;
  stopLoss: number | null; timestamp: string; exitDate: string | null; exitBy: string | null; holdingPeriod: string | null; outcomeStatus: string | null;
  exitPrice: number | null; percentGain: number | null; triggerObservedAt: string | null; executionState: string | null; resolutionReason: string | null;
}
async function loadIdeas(): Promise<Idea[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '120s'");
    const { rows } = await client.query(`
      SELECT id, symbol, asset_type, source, direction, entry_price, target_price, stop_loss, timestamp, exit_date, exit_by, holding_period,
             outcome_status, exit_price, percent_gain, resolution_reason,
             convergence_signals_json->'executionAudit'->>'triggerObservedAt' AS trigger_observed_at,
             convergence_signals_json->'executionAudit'->>'state' AS execution_state
      FROM trade_ideas
      WHERE timestamp >= $1 AND status <> 'draft' AND (exclude_from_training = false OR exclude_from_training IS NULL)
        AND asset_type IN ('stock', 'penny_stock') AND lower(source) = ANY($2)
      ORDER BY timestamp`, [RETRO_SINCE, [...RETRO_OPTION_ENGINES]]);
    return rows.map((x: any) => ({
      id: x.id, symbol: String(x.symbol).toUpperCase(), assetType: x.asset_type, source: String(x.source).toLowerCase(), direction: x.direction === 'short' ? 'short' : 'long',
      entryPrice: Number(x.entry_price), targetPrice: num(x.target_price), stopLoss: num(x.stop_loss), timestamp: new Date(x.timestamp).toISOString(),
      exitDate: x.exit_date ? new Date(x.exit_date).toISOString() : null, exitBy: x.exit_by ? new Date(x.exit_by).toISOString() : null,
      holdingPeriod: x.holding_period, outcomeStatus: x.outcome_status, exitPrice: num(x.exit_price), percentGain: num(x.percent_gain),
      triggerObservedAt: x.trigger_observed_at ? new Date(x.trigger_observed_at).toISOString() : null, executionState: x.execution_state, resolutionReason: x.resolution_reason,
    }));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

// ── one idea ─────────────────────────────────────────────────
const bsFns = {
  price: (S: number, K: number, T: number, v: number, c: boolean) => bsPrice(S, K, T, v, c),
  delta: (S: number, K: number, T: number, v: number, c: boolean) => bsDelta(S, K, T, v, c),
  iv: (p: number, S: number, K: number, T: number, c: boolean) => impliedVol(p, S, K, T, c),
};

async function convert(i: Idea): Promise<RetroRecord> {
  const status = String(i.outcomeStatus ?? 'open').toLowerCase();
  const closed = status !== 'open' && status !== '' && !!i.exitDate;
  const sharesPnL = closed && i.exitPrice != null && i.entryPrice > 0
    ? r2(((i.exitPrice - i.entryPrice) / i.entryPrice) * 1000 * (i.direction === 'short' ? -1 : 1))
    : closed && i.percentGain != null ? r2(i.percentGain * 10) : null;
  const base: RetroRecord = {
    v: RETRO_LEDGER_VERSION, id: i.id, symbol: i.symbol, source: i.source, direction: i.direction, status: 'unverifiable', reason: '',
    contract: null, triggerAt: null, exitAt: i.exitDate, entryPremium: null, exitPremium: null, peakPremium: null, unitPnL: null, budgetPnL: null,
    budget: BUDGET, sources: { entry: null, exit: null }, sharesPnL, at: new Date().toISOString(),
  };
  const done = (s: RetroRecord['status'], reason: string, extra: Partial<RetroRecord> = {}): RetroRecord => ({ ...base, ...extra, status: s, reason });
  if ((i.resolutionReason ?? '').startsWith('missed_entry')) return done('not_triggered', 'missed entry window — the stock never moved through the entry');
  if (!closed) return done('unverifiable', 'idea not closed — nothing to price yet');
  const pubMs = Date.parse(i.timestamp);
  const exitMs = Date.parse(i.exitDate!);
  // 1) trigger: recorded observation, else the first underlying bar trading at the entry after publication.
  const und = await underlyingBars(i.symbol, pubMs, exitMs);
  let trigMs = i.triggerObservedAt ? Date.parse(i.triggerObservedAt) : NaN;
  if (!fin(trigMs)) {
    const b = und.bars.find((x) => x.t + 5 * 60_000 > pubMs && x.t <= exitMs && x.l <= i.entryPrice * 1.002 && x.h >= i.entryPrice * 0.998);
    if (!b) return done('not_triggered', und.bars.length ? `entry ${i.entryPrice} never traded between publication and exit (${und.source})` : `no underlying bars to confirm the trigger (${und.source})`);
    trigMs = Math.max(b.t, pubMs);
  }
  if (!(trigMs <= exitMs)) return done('not_triggered', 'trigger after the recorded exit');
  const spotBar = [...und.bars].reverse().find((b) => b.t <= trigMs && trigMs - b.t <= 60 * 60_000);
  const spot = spotBar?.c ?? i.entryPrice;
  const t1 = i.targetPrice;
  if (!(t1 != null && t1 > 0)) return done('unverifiable', 'no published target (T1) to rank contracts by');
  // 2) candidates (publish-time info only)
  const type: 'call' | 'put' = i.direction === 'short' ? 'put' : 'call';
  const holdDays = i.exitBy ? Math.max(0, (Date.parse(i.exitBy) - pubMs) / 86_400_000) : null;
  const trigDay = etDay(trigMs);
  const expiries = retroExpiries(trigDay, retroMinDte(i.holdingPeriod, holdDays));
  const winFrom = trigMs - 30 * 60_000;
  const candidates: RetroCandidate[] = [];
  for (const exp of expiries) {
    const dte = Math.round((Date.parse(`${exp}T20:00:00Z`) - trigMs) / 86_400_000);
    const strikes = strikeGrid(spot, type, 10);
    const occs = strikes.map((k) => occOf(i.symbol, exp, type, k));
    const multi = await alpacaMulti(occs, winFrom, trigMs);
    for (let s = 0; s < strikes.length; s++) {
      let bars = multi.get(occs[s]) ?? [];
      if (!bars.length && MASSIVE_KEY && entitlement.usable('optionAggs') && s < 6) {
        const ch = await optionBarChain(occs[s], winFrom, trigMs, { ...deps, alpaca: null });
        bars = ch.bars;
      }
      const upto = bars.filter((b) => b.t <= trigMs);
      const last = upto[upto.length - 1];
      if (!last) continue;
      candidates.push({ type, strike: strikes[s], expiry: exp, dte, price: last.c, volume: upto.reduce((a, b) => a + (b.v ?? 0), 0), occ: occs[s] });
    }
    if (candidates.length >= 3) break; // nearest expiry with a priced chain wins; monthly only as fallback
  }
  const pick = pickRetroContract({ direction: i.direction, spot, t1, candidates, budget: BUDGET }, bsFns);
  if (!pick.ok) return done('unverifiable', `${pick.reason} (spot ${r2(spot)} at trigger ${iso(trigMs)}; expiries ${expiries.join(', ')})`, { triggerAt: iso(trigMs) });
  const p = pick.pick;
  const label = `${i.symbol} ${p.expiry} ${p.strike}${p.type === 'put' ? 'P' : 'C'}`;
  const contract = { occ: p.occ, label, type: p.type, strike: p.strike, expiry: p.expiry, dte: p.dte, delta: p.delta, iv: p.iv, qty: p.qty, debit: p.debit };
  // 3) price the pick: entry at/after the trigger, exit at/before the recorded exit.
  const expiryEndMs = Date.parse(`${p.expiry}T20:00:00Z`);
  if (exitMs > expiryEndMs) return done('unverifiable', `idea exited ${iso(exitMs)} after the picked contract expired ${p.expiry}`, { contract, triggerAt: iso(trigMs) });
  const chain = await optionBarChain(p.occ, trigMs - 30 * 60_000, exitMs + 30 * 60_000, deps);
  const after = chain.bars.find((b) => b.t >= trigMs - 60_000 && b.t - trigMs <= 15 * 60_000);
  const before = [...chain.bars].reverse().find((b) => b.t <= exitMs && exitMs - b.t <= 30 * 60_000);
  if (!after) return done('unverifiable', `no ${label} bar within 15m after the trigger (${chain.source})`, { contract, triggerAt: iso(trigMs) });
  if (!before) return done('unverifiable', `no ${label} bar within 30m before the exit (${chain.source})`, { contract, triggerAt: iso(trigMs), entryPremium: r2(after.o) });
  const entry = r2(after.o), exit = r2(before.c);
  if (!(entry > 0)) return done('unverifiable', 'entry bar priced at 0', { contract });
  const peak = r2(Math.max(...chain.bars.filter((b) => b.t >= after.t && b.t <= before.t).map((b) => b.h)));
  const sized = wholeContractPnl(entry, exit, BUDGET);
  const qty = sized?.qty ?? 0;
  if (!sized) return done('unverifiable', `fill $${entry} makes one contract over the $${BUDGET} budget`, { contract, triggerAt: iso(trigMs), entryPremium: entry, exitPremium: exit });
  return done('verified', `rule pick of ${p.considered} ${type}s (Δ${p.delta}, IV ${Math.round(p.iv * 100)}%, ${p.dte} DTE); entry ${iso(after.t)} open, exit ${iso(before.t)} close`, {
    contract: { ...contract, qty, debit: sized.debit }, triggerAt: iso(after.t), exitAt: iso(before.t), entryPremium: entry, exitPremium: exit, peakPremium: peak,
    unitPnL: r2((exit - entry) * 100), budgetPnL: sized.pnl, sources: { entry: chain.source, exit: chain.source },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (set -a && . ./.env && set +a)');
  const prior = (() => { try { return readRetroLedger(JSON.parse(fs.readFileSync(OUT, 'utf8'))); } catch { return new Map<string, RetroRecord>(); } })();
  let ideas = await loadIdeas();
  if (IDS) ideas = ideas.filter((i) => IDS.includes(i.id));
  if (SKIP_KNOWN) ideas = ideas.filter((i) => { const p = prior.get(i.id); return !p || (p.status === 'unverifiable' && Date.now() - Date.parse(p.at) > 20 * 3600_000); });
  if (LIMIT) ideas = ideas.slice(-LIMIT);
  console.log(`[retro-options] ${WRITE ? 'WRITE' : 'DRY RUN'} · ${ideas.length} legacy shares ideas from ${[...RETRO_OPTION_ENGINES].join('/')} since ${RETRO_SINCE} · budget $${BUDGET} · massive ${MASSIVE_KEY ? `on (${MASSIVE_THROTTLE}ms)` : 'off'} · alpaca ${ALPACA ? 'on' : 'off'}`);
  const out: RetroRecord[] = [];
  let n = 0;
  for (const i of ideas) {
    n++;
    let r: RetroRecord;
    try { r = await convert(i); } catch (e: any) {
      r = { v: RETRO_LEDGER_VERSION, id: i.id, symbol: i.symbol, source: i.source, direction: i.direction, status: 'unverifiable', reason: `error: ${e?.message ?? e}`, contract: null, triggerAt: null, exitAt: i.exitDate, entryPremium: null, exitPremium: null, peakPremium: null, unitPnL: null, budgetPnL: null, budget: BUDGET, sources: { entry: null, exit: null }, sharesPnL: null, at: new Date().toISOString() };
    }
    out.push(r);
    if (n % 10 === 0 || n === ideas.length) console.log(`  ${n}/${ideas.length} · net ${netCalls} · cache ${cacheHits}`);
  }
  const $ = (v: number | null) => (v == null ? '—' : `${v < 0 ? '-' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  const count = (s: string) => out.filter((r) => r.status === s).length;
  const ver = out.filter((r) => r.status === 'verified');
  const bySource: Record<string, { n: number; verified: number; notTriggered: number; unverifiable: number; budgetPnL: number; sharesPnL: number }> = {};
  for (const r of out) {
    const g = bySource[r.source ?? '?'] ??= { n: 0, verified: 0, notTriggered: 0, unverifiable: 0, budgetPnL: 0, sharesPnL: 0 };
    g.n++;
    if (r.status === 'verified') { g.verified++; g.budgetPnL = r2(g.budgetPnL + (r.budgetPnL ?? 0)); g.sharesPnL = r2(g.sharesPnL + (r.sharesPnL ?? 0)); }
    else if (r.status === 'not_triggered') g.notTriggered++; else g.unverifiable++;
  }
  const why = new Map<string, number>();
  for (const r of out.filter((x) => x.status === 'unverifiable')) { const k = r.reason.replace(/\(.*$/, '').replace(/[0-9.$:TZ-]{4,}/g, '…').slice(0, 70); why.set(k, (why.get(k) ?? 0) + 1); }
  const summary = {
    ideas: out.length, verified: ver.length, notTriggered: count('not_triggered'), unverifiable: count('unverifiable'),
    coverage: out.length ? r2((ver.length / Math.max(1, out.length - count('not_triggered'))) * 100) : 0,
    verifiedBudgetPnL: r2(ver.reduce((s, r) => s + (r.budgetPnL ?? 0), 0)), verifiedUnitPnL: r2(ver.reduce((s, r) => s + (r.unitPnL ?? 0), 0)),
    sameIdeasSharesPnL: r2(ver.reduce((s, r) => s + (r.sharesPnL ?? 0), 0)),
    bySource, unverifiableWhy: Object.fromEntries([...why.entries()].sort((a, b) => b[1] - a[1])), network: { calls: netCalls, cacheHits }, massive: entitlement.report(),
  };
  console.log(`\n=== shares → options (rule-picked at publish, priced from bars) ===`);
  console.log(`ideas ${summary.ideas} · VERIFIED ${summary.verified} · not triggered ${summary.notTriggered} · unverifiable ${summary.unverifiable} · coverage of triggered ${summary.coverage}%`);
  console.log(`verified options P&L at $${BUDGET} whole contracts ${$(summary.verifiedBudgetPnL)} (1 contract each ${$(summary.verifiedUnitPnL)}) vs the same ideas as $1,000 shares ${$(summary.sameIdeasSharesPnL)}`);
  console.log('by engine:'); for (const [k, g] of Object.entries(bySource)) console.log(`  ${k.padEnd(16)} n=${String(g.n).padStart(3)} V${g.verified} NT${g.notTriggered} U${g.unverifiable}  options ${$(g.budgetPnL)} vs shares ${$(g.sharesPnL)}`);
  console.log('unverifiable why:'); for (const [k, v] of Object.entries(summary.unverifiableWhy).slice(0, 12)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log(`\ntop 20 converted trades by |P&L at $${BUDGET}|:`);
  for (const r of [...ver].sort((a, b) => Math.abs(b.budgetPnL ?? 0) - Math.abs(a.budgetPnL ?? 0)).slice(0, 20)) {
    console.log(`  ${r.symbol.padEnd(6)} ${(r.source ?? '').padEnd(15)} ${r.contract!.label.padEnd(26)} ×${r.contract!.qty} entry $${r.entryPremium!.toFixed(2)} → exit $${r.exitPremium!.toFixed(2)} (peak $${r.peakPremium?.toFixed(2)}) ${$(r.budgetPnL).padStart(8)} · shares ${$(r.sharesPnL).padStart(6)} · VERIFIED ${r.sources.entry}`);
  }
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), summary, records: out }, null, 1));
  if (WRITE) {
    const merged = new Map(prior);
    for (const r of out) merged.set(r.id, r);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ v: RETRO_LEDGER_VERSION, generatedAt: new Date().toISOString(), script: 'scripts/retro-options-convert.ts', budget: BUDGET, summary, records: [...merged.values()] }, null, 1));
    console.log(`\nwrote ${merged.size} records to ${OUT} (a derived ledger FILE — the database is never written)`);
  } else console.log(`\nDRY RUN — nothing written. --write saves the derived records to ${OUT} (file only, never the database).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
