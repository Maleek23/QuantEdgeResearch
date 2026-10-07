/**
 * MANAGED-EXIT REPLAY + CALL ACCURACY — every NEXUS idea since the clean-era
 * baseline replayed on real bars under ONE defined, executable exit policy
 * (shared/managed-exit.ts "managed-v1"), beside its RECORDED outcome, its peak
 * (MFE, with time) and whether the CALL was right (shared/call-accuracy.ts).
 *
 * Recorded history is never overwritten: this script is READ-ONLY (one
 * `BEGIN … READ ONLY` SELECT, then ROLLBACK) and writes a separate JSON ledger
 * the server reads as a labelled view (MANAGED_REPLAY_LEDGER, default
 * /tmp/nexus-managed-replay.json — "replayed with current exit rules — not live
 * fills").
 *
 * Data (cached on disk, throttled, sequential):
 *   underlying  Yahoo 5m RTH bars (Alpaca 5Min IEX fallback); daily bars for swing ATR
 *   options     the contract's own bars by OCC symbol via research/verify-nexus-book-sources.ts
 *               (Massive 1m → 5m → trades → Alpaca 1Min → Yahoo OPR), bucketed to the 5m grid
 *   An idea published today only has bars up to now (prior-day availability):
 *   its window is incomplete and whatever the policy has not exited stays OPEN.
 *
 * Per idea: recorded outcome (unit P&L, R), managed outcome (unit P&L, R, exit
 * reason / time), peak underlying + premium (with time), call accuracy, and P&L
 * at risk $500 / $1,000 for both (shared/position-sizing.ts; losses capped at
 * the stop). Summary: win rate, E[R], profit factor, max drawdown for recorded
 * vs managed in both time halves, with and without the top-3 winners; call
 * accuracy overall and per half; highlights (TSLA 380P 2026-10-07 09:58 ET,
 * MU 1100C 2026-10-07 09:53 ET quant) and the 10 biggest by |recorded P&L|.
 *
 * Run on the droplet:
 *   set -a && . ./.env && set +a && NODE_ENV=production npx tsx research/managed-exit-replay.ts --out /tmp/nexus-managed-replay.json
 * Options:
 *   --out <file.json>       default /tmp/nexus-managed-replay.json (CSV beside it)
 *   --since YYYY-MM-DD      default OUTCOME_BASELINE_DATE
 *   --ids a,b,c             only these ideas
 *   --limit N               first N ideas (newest first) — smoke test
 *   --throttle MS           pause between Yahoo/Alpaca calls (default 350)
 *   --massive-throttle MS   pause before each Massive call (default 12500 = free tier; 250 on a paid plan)
 *   --no-massive            skip Massive
 *   --cache DIR             default /tmp/nexus-verify-cache (shared with verify-nexus-book.ts)
 *   --verify-ledger <file>  bar-verification ledger to label recorded rows (default /tmp/nexus-book-verify.json if present)
 *   --self-test             no database: the policy on synthetic paths + one real-bar smoke (AAPL)
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { mapDeskIdea, type DeskIdea, type JournalWireRow } from '../server/journal-row-maps';
import { addTradingMinutes, etParts, etWallToMs, horizonTradingDays } from '../shared/loss-rules';
import { atrSeries } from '../shared/exit-policy';
import { MANAGED_POLICY_ID, MANAGED_POLICY_LABEL, bookStats, simulateManaged, withoutTopWinners, type BookStats, type ManagedBar } from '../shared/managed-exit';
import { classifyCall, splitHalves, summarizeCalls, type CallResult } from '../shared/call-accuracy';
import { effectivePremiumStop, parsePremiumStopTag, riskSizedPnl, sizeForRisk } from '../shared/position-sizing';
import { optionSideOf } from '../shared/option-value-bounds';
import { MassiveEntitlement, optionBarChain, parseYahoo, type ChainDeps, type HttpResult } from './verify-nexus-book-sources';

// ─── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const OUT = arg('--out') ?? '/tmp/nexus-managed-replay.json';
const CSV = OUT.replace(/\.json$/i, '') + '.csv';
const SINCE = arg('--since') ?? OUTCOME_BASELINE_DATE;
const IDS = arg('--ids')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const LIMIT = arg('--limit') ? Number(arg('--limit')) : null;
const THROTTLE = Number(arg('--throttle') ?? 350);
const MASSIVE_THROTTLE = Number(arg('--massive-throttle') ?? 12_500);
const CACHE = arg('--cache') ?? '/tmp/nexus-verify-cache';
const MASSIVE_KEY = argv.includes('--no-massive') ? null : process.env.POLYGON_API_KEY?.trim() || null;
const VERIFY_LEDGER = arg('--verify-ledger') ?? '/tmp/nexus-book-verify.json';
const NOW = Date.now();
const RISKS = [500, 1000] as const;

type Bar = { t: number; o: number; h: number; l: number; c: number; v?: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const iso = (ms: number | null | undefined) => (fin(ms) ? new Date(ms).toISOString() : null);
const etDay = (ms: number) => { const p = etParts(ms); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
const etHm = (ms: number) => { const p = etParts(ms); return `${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`; };
const rth = (b: Bar) => { const p = etParts(b.t); return p.weekday >= 1 && p.weekday <= 5 && p.minutes >= 570 && p.minutes < 960; };
const W5 = 5 * 60_000;

// ─── cached, throttled HTTP (same cache as verify-nexus-book.ts) ─────
fs.mkdirSync(CACHE, { recursive: true });
let netCalls = 0, cacheHits = 0;
const cacheFile = (key: string) => path.join(CACHE, key.replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
async function cachedJson(key: string, url: string, headers: Record<string, string> = {}): Promise<any | null> {
  const file = cacheFile(key);
  if (fs.existsSync(file)) { cacheHits++; try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* refetch */ } }
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(THROTTLE * (attempt + 1));
    netCalls++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge-managed-replay/1.0', ...headers } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      const body = res.ok ? await res.json() : { __status: res.status };
      // Do not cache a window that is still forming (today's bars) — re-fetch next run.
      if (!key.includes(etDay(NOW))) fs.writeFileSync(file, JSON.stringify(body));
      return body;
    } catch { /* retry */ }
  }
  return null;
}
async function massiveGet(key: string, url: string): Promise<HttpResult | null> {
  const file = cacheFile(key);
  if (fs.existsSync(file)) { cacheHits++; try { return { status: 200, body: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* refetch */ } }
  if (!MASSIVE_KEY) return null;
  let last: HttpResult | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(MASSIVE_THROTTLE);
    netCalls++;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${MASSIVE_KEY}`, 'User-Agent': 'QuantEdge-managed-replay/1.0' } });
      const body = await res.json().catch(() => ({}));
      last = { status: res.status, body };
      if (res.status === 429 || res.status >= 500) { await sleep(res.status === 429 ? 61_000 : 3000 * (attempt + 1)); continue; }
      if (res.ok && (body?.status == null || body.status === 'OK' || body.status === 'DELAYED')) fs.writeFileSync(file, JSON.stringify(body));
      return last;
    } catch { /* retry */ }
  }
  return last;
}
const entitlement = new MassiveEntitlement(!!MASSIVE_KEY);
const chainDeps: ChainDeps = {
  massive: MASSIVE_KEY ? massiveGet : null,
  entitlement,
  alpaca: process.env.ALPACA_API_KEY ? { id: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_SECRET_KEY ?? '' } : null,
  json: cachedJson,
  now: () => NOW,
};

// ─── bars ────────────────────────────────────────────────────
const YAHOO_INDEX: Record<string, string> = { SPX: '^GSPC', SPXW: '^GSPC', NDX: '^NDX', NDXP: '^NDX', RUT: '^RUT', VIX: '^VIX', XSP: '^XSP', DJX: '^DJI' };
function yahooSymbol(symbol: string, assetType: string): string {
  const s = symbol.toUpperCase().replace(/^\$/, '');
  if (assetType === 'crypto') return `${s.replace(/[-/]?USDT?$/, '')}-USD`;
  return YAHOO_INDEX[s] ?? s;
}
const memo = new Map<string, Bar[]>();
async function bars5m(symbol: string, assetType: string, fromMs: number, toMs: number): Promise<{ bars: Bar[]; source: string }> {
  const ys = yahooSymbol(symbol, assetType);
  const k = `${ys}|${etDay(fromMs)}|${etDay(toMs)}`;
  if (memo.has(k)) return { bars: memo.get(k)!, source: `yahoo:${ys}:5m` };
  const p1 = Math.floor((fromMs - 86400_000) / 1000), p2 = Math.floor((Math.min(toMs, NOW) + 86400_000) / 1000);
  const j = await cachedJson(`mx_y5m_${ys}_${etDay(fromMs)}_${etDay(toMs)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${p1}&period2=${p2}&interval=5m&includePrePost=false`);
  let bars = parseYahoo(j);
  let source = `yahoo:${ys}:5m`;
  if (!bars.length && assetType !== 'crypto' && !YAHOO_INDEX[symbol.toUpperCase()] && process.env.ALPACA_API_KEY) {
    const a = await cachedJson(`mx_a5m_${symbol}_${etDay(fromMs)}_${etDay(toMs)}`,
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars?timeframe=5Min&start=${new Date(fromMs - 86400_000).toISOString()}&end=${new Date(Math.min(toMs + 86400_000, NOW - 16 * 60_000)).toISOString()}&limit=10000&feed=iex&adjustment=raw`,
      { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' });
    bars = ((a?.bars ?? []) as any[]).map((b) => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).filter((b) => fin(b.t) && b.h > 0);
    source = `alpaca:${symbol}:5Min(iex)`;
  }
  bars = (assetType === 'crypto' ? bars : bars.filter(rth)).sort((a, b) => a.t - b.t);
  memo.set(k, bars);
  return { bars, source };
}
async function dailyAtr(symbol: string, assetType: string, beforeMs: number): Promise<number | null> {
  const ys = yahooSymbol(symbol, assetType);
  const day = etDay(beforeMs);
  const j = await cachedJson(`mx_y1d_${ys}_${day}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${Math.floor((beforeMs - 60 * 86400_000) / 1000)}&period2=${Math.floor(beforeMs / 1000)}&interval=1d`);
  const d = parseYahoo(j).filter((b) => etDay(b.t) < day);
  if (d.length < 15) return null;
  const a = atrSeries(d, 14);
  const v = a[a.length - 1];
  return fin(v) ? v : null;
}
function occOf(root: string, day: string, side: 'call' | 'put', strike: number): string {
  return `${root}${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}${side === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}
const occRoots = (s: string) => { const u = s.toUpperCase(); return u === 'SPX' ? ['SPXW', 'SPX'] : u === 'NDX' ? ['NDXP', 'NDX'] : u === 'RUT' ? ['RUTW', 'RUT'] : [u]; };
/** Contract bars → OHLC per 5-minute bucket start. */
function bucket5(bars: Bar[]): Map<number, { o: number; h: number; l: number; c: number }> {
  const m = new Map<number, { o: number; h: number; l: number; c: number }>();
  for (const b of [...bars].sort((a, z) => a.t - z.t)) {
    const k = Math.floor(b.t / W5) * W5;
    const cur = m.get(k);
    if (!cur) m.set(k, { o: b.o, h: b.h, l: b.l, c: b.c });
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; }
  }
  return m;
}

// ─── the book (read-only) ────────────────────────────────────
interface IdeaRow extends DeskIdea {
  exitBy: string | null; holdingPeriod: string | null; triggerObservedAt: string | null; qualitySignals: string[] | null;
}
async function loadBook(): Promise<IdeaRow[]> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '120s'");
    const { rows } = await client.query(`
      SELECT id, symbol, asset_type, direction, entry_price, target_price, stop_loss, risk_reward_ratio, option_type, strike_price,
             expiry_date, entry_premium, exit_premium, option_percent_gain, exit_price, percent_gain, outcome_status, resolution_reason,
             exit_date, timestamp, source, catalyst, outcome_notes, highest_price_reached, lowest_price_reached, data_source_used,
             session_context, exit_by, holding_period, quality_signals,
             substring(outcome_notes from '\\[exit-time:([a-z_]+)\\]') AS exit_time_source,
             substring(outcome_notes from '\\[exit-premium:(touch_bar|pass|withheld)\\]') AS exit_premium_basis,
             convergence_signals_json->'executionAudit'->>'state' AS execution_state,
             convergence_signals_json->'executionAudit'->>'triggerObservedAt' AS trigger_observed_at,
             convergence_signals_json->'planSnapshot' AS plan_snapshot
      FROM trade_ideas
      WHERE timestamp >= $1 AND status <> 'draft' AND (exclude_from_training = false OR exclude_from_training IS NULL)
      ORDER BY timestamp`, [SINCE]);
    return rows.map((x: any) => ({
      id: x.id, symbol: x.symbol, assetType: x.asset_type, direction: x.direction, entryPrice: Number(x.entry_price),
      targetPrice: num(x.target_price), stopLoss: num(x.stop_loss), riskRewardRatio: num(x.risk_reward_ratio), optionType: x.option_type,
      strikePrice: num(x.strike_price), expiryDate: x.expiry_date, entryPremium: num(x.entry_premium), exitPremium: num(x.exit_premium),
      optionPercentGain: num(x.option_percent_gain), exitPrice: num(x.exit_price), percentGain: num(x.percent_gain),
      outcomeStatus: x.outcome_status, resolutionReason: x.resolution_reason, exitDate: x.exit_date, timestamp: x.timestamp,
      source: x.source, catalyst: x.catalyst, genConvictionBand: null, exitTimeSource: x.exit_time_source,
      exitPremiumBasis: x.exit_premium_basis, highestPriceReached: num(x.highest_price_reached), lowestPriceReached: num(x.lowest_price_reached),
      executionState: x.execution_state, dataSourceUsed: x.data_source_used, sessionContext: x.session_context, outcomeNotes: x.outcome_notes,
      exitBy: x.exit_by, holdingPeriod: x.holding_period, triggerObservedAt: x.trigger_observed_at,
      qualitySignals: Array.isArray(x.quality_signals) ? x.quality_signals : null,
      convergenceSignalsJson: x.plan_snapshot ? { planSnapshot: x.plan_snapshot } : null,
    }));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

// ─── replay one idea ─────────────────────────────────────────
interface Side { pnlUnit: number | null; r: number | null; atRisk: Record<string, number | null> }
export interface ReplayEntry {
  id: string; symbol: string; source: string | null; assetType: string; direction: string; optionType: string | null;
  strike: number | null; expiry: string | null; publishedAt: string; publishedEt: string;
  plan: { entry: number; stop: number | null; target: number | null; premium: number | null; premiumStop: number | null; premiumStopBasis: string | null };
  triggerAt: string | null; triggerBasis: string; windowEnd: string | null; windowComplete: boolean;
  recorded: { status: string; outcome: string | null; exitAt: string | null } & Side;
  recordedVerdict: string | null;
  managed: { status: 'closed' | 'open' | 'skipped'; exitAt: string | null; exitPx: number | null; exitReason: string; entryPremium: number | null; entryPremiumBasis: string | null; premiumStop: number | null } & Side;
  peak: { underlying: { px: number; at: string; r: number | null; pct: number | null } | null; premium: { px: number; at: string; pct: number | null } | null; unitPnl: number | null };
  call: { result: CallResult; at: string | null; winKind: 'T1' | '1R' | null; winLevel: number | null; detail: string };
  sources: { underlying: string | null; option: string | null; atr: string | null };
}

function windowEndOf(i: IdeaRow, trigMs: number, planEntry: { expiry: string | null }): number {
  const exitBy = i.exitBy ? Date.parse(i.exitBy) : NaN;
  const exp = planEntry.expiry ? String(planEntry.expiry).slice(0, 10) : null;
  const trigDay = etDay(trigMs);
  const at1545 = (day: string) => { const [y, m, d] = day.split('-').map(Number); return etWallToMs(y, m, d, 15 * 60 + 45); };
  if (i.assetType === 'option' && exp && exp <= trigDay) return at1545(trigDay); // 0DTE
  let end = Number.isFinite(exitBy) && exitBy > trigMs ? exitBy
    : addTradingMinutes(trigMs, horizonTradingDays({ holdingPeriod: i.holdingPeriod, expiryDate: exp, publishedMs: Date.parse(i.timestamp) }) * 390);
  if (i.assetType === 'option' && exp) end = Math.min(end, at1545(exp));
  return end;
}

const sideAtRisk = (unitPnl: number | null, unitQty: number, sz: (d: number) => ReturnType<typeof sizeForRisk>) => {
  const out: Record<string, number | null> = {};
  for (const d of RISKS) out[`r${d}`] = riskSizedPnl(unitPnl, unitQty, sz(d)).pnl;
  return out;
};

async function replay(i: IdeaRow, row: JournalWireRow | null, verdicts: Map<string, string>): Promise<ReplayEntry> {
  const snap = (i.convergenceSignalsJson as any)?.planSnapshot ?? null;
  const entry = Number(snap?.entryPrice ?? i.entryPrice);
  const stop = num(snap?.stopLoss ?? i.stopLoss);
  const target = num(snap?.targetPrice ?? i.targetPrice);
  const direction = (snap?.direction ?? i.direction) === 'short' ? 'short' : 'long';
  const expiry = (snap?.expiryDate ?? i.expiryDate) ? String(snap?.expiryDate ?? i.expiryDate).slice(0, 10) : null;
  const recPremium = num(snap?.entryPremium ?? i.entryPremium);
  const isOpt = i.assetType === 'option';
  const pubMs = Date.parse(i.timestamp);
  const zeroDteAtPub = isOpt && !!expiry && expiry <= etDay(pubMs);
  const tagStop = parsePremiumStopTag(i.qualitySignals, recPremium);
  const recPs = isOpt ? effectivePremiumStop({ entryPremium: recPremium, premiumStop: tagStop, zeroDte: zeroDteAtPub }) : null;
  const unitQty = isOpt ? 1 : entry > 0 ? 1000 / entry : 0;
  const recordedStatus = row?.status ?? 'excluded';
  const recUnit = row?.status === 'closed' ? row.realizedPnL ?? null : null;
  const recRisk = isOpt ? (recPs && recPremium ? (recPremium - recPs.stop) * 100 : null) : stop != null ? unitQty * Math.abs(entry - stop) : null;
  const recSize = (d: number) => sizeForRisk({ assetType: isOpt ? 'option' : i.assetType === 'crypto' ? 'crypto' : 'stock', entry, stop, entryPremium: recPremium, premiumStop: tagStop, zeroDte: zeroDteAtPub }, d);
  const e: ReplayEntry = {
    id: i.id, symbol: i.symbol, source: i.source, assetType: i.assetType, direction, optionType: i.optionType, strike: i.strikePrice, expiry,
    publishedAt: new Date(pubMs).toISOString(), publishedEt: `${etDay(pubMs)} ${etHm(pubMs)} ET`,
    plan: { entry, stop, target, premium: recPremium, premiumStop: recPs ? r4(recPs.stop) : null, premiumStopBasis: recPs?.basis ?? null },
    triggerAt: null, triggerBasis: '', windowEnd: null, windowComplete: false,
    recorded: {
      status: recordedStatus, outcome: row?.outcome ?? null, exitAt: row?.exitTime ?? null,
      pnlUnit: recUnit, r: recUnit != null && recRisk ? r4(recUnit / recRisk) : null, atRisk: sideAtRisk(recUnit, unitQty, recSize),
    },
    recordedVerdict: verdicts.get(i.id) ?? null,
    managed: { status: 'skipped', exitAt: null, exitPx: null, exitReason: '', entryPremium: null, entryPremiumBasis: null, premiumStop: null, pnlUnit: null, r: null, atRisk: {} },
    peak: { underlying: null, premium: null, unitPnl: null },
    call: { result: 'no_result', at: null, winKind: null, winLevel: null, detail: '' },
    sources: { underlying: null, option: null, atr: null },
  };
  const skip = (why: string, call?: CallResult) => { e.managed.exitReason = why; if (call) e.call = { ...e.call, result: call, detail: why }; return e; };
  if (!(entry > 0) || stop == null || !(stop > 0) || (direction === 'long' ? stop >= entry : stop <= entry)) return skip('no valid stop on the losing side of entry', 'no_result');
  if (i.assetType === 'future' || i.assetType === 'futures') return skip('futures not replayed');

  // Underlying bars from publication to the plan window's longest possible end.
  const roughEnd = Math.min(NOW, addTradingMinutes(pubMs, 11 * 390));
  const { bars: ub, source: usrc } = await bars5m(i.symbol, i.assetType, pubMs - 86400_000, roughEnd);
  e.sources.underlying = usrc;
  if (!ub.length) return skip(`no underlying bars (${usrc})`, 'no_result');
  // Trigger: recorded observation, else the first bar trading at entry after publication.
  let trigMs = i.triggerObservedAt ? Date.parse(i.triggerObservedAt) : NaN;
  e.triggerBasis = Number.isFinite(trigMs) ? 'executionAudit.triggerObservedAt' : '';
  if (!Number.isFinite(trigMs)) {
    const tb = ub.find((b) => b.t + W5 > pubMs && b.l <= entry && b.h >= entry);
    if (tb) { trigMs = Math.max(tb.t, pubMs); e.triggerBasis = 'first 5m bar trading at entry'; }
  }
  if (!Number.isFinite(trigMs)) return skip('entry never traded after publication (not triggered)', 'not_triggered');
  e.triggerAt = iso(trigMs);
  const winEnd = windowEndOf(i, trigMs, { expiry });
  e.windowEnd = iso(winEnd);
  const win = ub.filter((b) => b.t + W5 > trigMs && b.t < winEnd);
  if (!win.length) return skip('no underlying bars inside the plan window', 'no_result');
  const lastT = win[win.length - 1].t;
  e.windowComplete = winEnd <= NOW && lastT + 2 * W5 >= Math.min(winEnd, etWallToMs(...(etDay(winEnd).split('-').map(Number) as [number, number, number]), 960)) - 30 * 60_000;

  // Call accuracy (underlying first touch).
  const c = classifyCall({ direction, entry, stop, target, bars: win, triggerMs: trigMs, windowEndMs: winEnd, nowMs: NOW });
  e.call = { result: c.result, at: c.at, winKind: c.winKind, winLevel: c.winLevel == null ? null : r4(c.winLevel), detail: c.detail };

  // ATR: day holds → 5m ATR(14) (no look-ahead: each bar's own close), swings → prior-day daily ATR(14).
  const dayHold = etDay(winEnd) === etDay(trigMs);
  let atrOf: (t: number) => number | null;
  if (dayHold) {
    const all = ub;
    const a = atrSeries(all, 14);
    const byT = new Map(all.map((b, k) => [b.t, fin(a[k]) ? a[k] : null]));
    atrOf = (t) => byT.get(t) ?? null;
    e.sources.atr = '5m ATR(14)';
  } else {
    const d = await dailyAtr(i.symbol, i.assetType, trigMs);
    atrOf = () => d;
    e.sources.atr = d != null ? 'prior-day daily ATR(14)' : 'daily ATR unavailable';
  }

  let mbars: ManagedBar[] = win.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, atr: atrOf(b.t) }));
  let eP: number | null = null, eBasis: string | null = null, premStop: number | null = null;
  if (isOpt) {
    if (!expiry || !fin(i.strikePrice)) return skip('option without expiry/strike');
    const side = optionSideOf(i.optionType);
    let ob: Bar[] = [], osrc = 'none';
    for (const root of occRoots(i.symbol)) {
      const res = await optionBarChain(occOf(root, expiry, side, i.strikePrice), trigMs - 60 * 60_000, Math.min(winEnd + W5, NOW), chainDeps);
      if (res.bars.length) { ob = res.bars; osrc = `${res.source} ${occOf(root, expiry, side, i.strikePrice)}`; break; }
    }
    e.sources.option = osrc;
    const b5 = bucket5(ob);
    mbars = mbars.map((b) => ({ ...b, opt: b5.get(b.t) ?? null }));
    const at = b5.get(Math.floor(trigMs / W5) * W5) ?? [...b5.entries()].filter(([t]) => Math.abs(t - trigMs) <= 30 * 60_000).sort((a, z) => Math.abs(a[0] - trigMs) - Math.abs(z[0] - trigMs))[0]?.[1];
    if (at) { eP = at.c; eBasis = 'contract bar at the trigger'; }
    else if (recPremium) { eP = recPremium; eBasis = 'recorded premium (no contract print within 30m of the trigger)'; }
    if (!eP || !ob.length) {
      e.managed.entryPremium = eP;
      return skip(`no contract bars (${osrc}) — managed premium exits cannot be replayed`);
    }
    // The plan's premium stop scales with the premium actually paid.
    const ps = effectivePremiumStop({ entryPremium: eP, premiumStop: tagStop != null && recPremium ? eP * (tagStop / recPremium) : null, zeroDte: etDay(trigMs) >= expiry });
    premStop = ps!.stop;
  }
  const res = simulateManaged({ kind: isOpt ? 'option' : 'stock', direction, entry, stop, target, bars: mbars, windowComplete: e.windowComplete, entryPremium: eP, premiumStop: premStop });
  const pnlUnit = res.pnlPerUnit == null ? null : isOpt ? res.pnlPerUnit : res.pnlPerUnit * unitQty;
  const mSize = (d: number) => sizeForRisk({ assetType: isOpt ? 'option' : i.assetType === 'crypto' ? 'crypto' : 'stock', entry, stop, entryPremium: eP, premiumStop: premStop }, d);
  e.managed = {
    status: res.closed ? 'closed' : 'open', exitAt: iso(res.exitAt), exitPx: res.avgExit == null ? null : r4(res.avgExit), exitReason: res.exitReason,
    entryPremium: eP == null ? null : r4(eP), entryPremiumBasis: eBasis, premiumStop: premStop == null ? null : r4(premStop),
    pnlUnit: res.closed && pnlUnit != null ? r2(pnlUnit) : null, r: res.closed && res.rMultiple != null ? r4(res.rMultiple) : null,
    atRisk: res.closed ? sideAtRisk(pnlUnit, unitQty, mSize) : {},
  };
  const pu = res.peakUnderlying, pp = res.peakPremium;
  e.peak = {
    underlying: pu ? { px: r4(pu.px), at: iso(pu.at)!, r: pu.r == null ? null : r4(pu.r), pct: pu.pct == null ? null : r4(pu.pct) } : null,
    premium: pp ? { px: r4(pp.px), at: iso(pp.at)!, pct: pp.pct == null ? null : r4(pp.pct) } : null,
    unitPnl: isOpt ? (pp && eP ? r2((pp.px - eP) * 100) : null) : pu ? r2(unitQty * (direction === 'long' ? 1 : -1) * (pu.px - entry)) : null,
  };
  return e;
}

// ─── summary ─────────────────────────────────────────────────
type Pair = { publishedAt: string; recorded: { pnl: number; r: number | null }; managed: { pnl: number; r: number | null } };
const fmtStats = (s: BookStats) => ({
  n: s.n, winRate: s.winRate == null ? null : r4(s.winRate), expectancyR: s.expectancyR == null ? null : r4(s.expectancyR),
  profitFactor: s.profitFactor == null ? null : Number.isFinite(s.profitFactor) ? r4(s.profitFactor) : 'inf', totalPnl: s.totalPnl, maxDrawdown: s.maxDrawdown,
});
function compare(pairs: Pair[]) {
  const sorted = [...pairs].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  const [h1, h2] = splitHalves(sorted);
  const block = (xs: Pair[]) => {
    const rec = xs.map((x) => x.recorded), man = xs.map((x) => x.managed);
    return {
      from: xs[0]?.publishedAt ?? null, to: xs[xs.length - 1]?.publishedAt ?? null,
      recorded: fmtStats(bookStats(rec)), managed: fmtStats(bookStats(man)),
      recordedTop3Removed: fmtStats(bookStats(withoutTopWinners(rec))), managedTop3Removed: fmtStats(bookStats(withoutTopWinners(man))),
    };
  };
  const all = block(sorted), first = block(h1), second = block(h2);
  const beats = (b: ReturnType<typeof block>) => (b.managedTop3Removed.expectancyR ?? -Infinity) > (b.recordedTop3Removed.expectancyR ?? -Infinity)
    && b.managedTop3Removed.totalPnl > b.recordedTop3Removed.totalPnl;
  return { all, firstHalf: first, secondHalf: second, managedBeatsRecordedBothHalves: sorted.length >= 20 && beats(first) && beats(second) };
}

function findHighlight(entries: ReplayEntry[], sym: string, opt: 'call' | 'put', strike: number, day: string, hm: string, source?: string): ReplayEntry | null {
  const [hh, mm] = hm.split(':').map(Number);
  const want = hh * 60 + mm;
  const c = entries.filter((e) => e.symbol.toUpperCase() === sym && e.optionType === opt && e.strike === strike && e.publishedEt.startsWith(day) && (!source || String(e.source ?? '').toLowerCase().includes(source)));
  return c.sort((a, b) => Math.abs(Number(a.publishedEt.slice(11, 13)) * 60 + Number(a.publishedEt.slice(14, 16)) - want) - Math.abs(Number(b.publishedEt.slice(11, 13)) * 60 + Number(b.publishedEt.slice(14, 16)) - want))[0] ?? null;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (set -a && . ./.env && set +a)');
  console.log(`[managed-exit-replay] ${MANAGED_POLICY_ID} · since ${SINCE} · out ${OUT} · cache ${CACHE} · massive ${MASSIVE_KEY ? `on (${MASSIVE_THROTTLE}ms)` : 'off'}`);
  const verdicts = new Map<string, string>();
  try {
    const v = JSON.parse(fs.readFileSync(VERIFY_LEDGER, 'utf8'));
    for (const t of v?.trades ?? []) if (t?.id && t?.verdict) verdicts.set(t.id, t.verdict);
    console.log(`  verify ledger ${VERIFY_LEDGER}: ${verdicts.size} verdicts`);
  } catch { console.log(`  no verify ledger at ${VERIFY_LEDGER} — recorded rows unlabelled`); }
  let ideas = await loadBook();
  if (IDS) ideas = ideas.filter((i) => IDS.includes(i.id));
  ideas.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  if (LIMIT) ideas = ideas.slice(0, LIMIT);
  console.log(`  ${ideas.length} ideas (read-only txn)`);
  const entries: ReplayEntry[] = [];
  let n = 0;
  for (const i of ideas) {
    n++;
    const m = mapDeskIdea(i);
    const row = 'row' in m ? m.row : null;
    let e: ReplayEntry;
    try { e = await replay(i, row, verdicts); } catch (err: any) {
      e = await replay({ ...i, stopLoss: null }, row, verdicts); // records the idea with a skip
      e.managed.exitReason = `error: ${err?.message ?? err}`;
    }
    entries.push(e);
    if (n % 10 === 0 || n === ideas.length) console.log(`  ${n}/${ideas.length} · net ${netCalls} · cache ${cacheHits}`);
  }
  entries.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  // Walk-forward: ideas CLOSED under BOTH recorded and managed, compared at equal risk ($500) and in R.
  const both = entries.filter((e) => e.recorded.status === 'closed' && e.managed.status === 'closed' && e.recorded.atRisk.r500 != null && e.managed.atRisk.r500 != null);
  const toPair = (e: ReplayEntry): Pair => ({ publishedAt: e.publishedAt, recorded: { pnl: e.recorded.atRisk.r500!, r: e.recorded.r }, managed: { pnl: e.managed.atRisk.r500!, r: e.managed.r } });
  const pairs: Pair[] = both.map(toPair);
  const walk = compare(pairs);
  const verifiedPairs = both.filter((e) => e.recordedVerdict === 'VERIFIED').map(toPair);
  const calls = entries.map((e) => ({ result: e.call.result, publishedAt: e.publishedAt }));
  const [c1, c2] = splitHalves(calls.filter((c) => c.result === 'win' || c.result === 'loss'));
  const callAccuracy = { overall: summarizeCalls(calls), firstHalf: summarizeCalls(c1), secondHalf: summarizeCalls(c2) };
  const brief = (e: ReplayEntry | null) => e && ({
    id: e.id, label: `${e.symbol} ${e.strike ?? ''}${e.optionType ? e.optionType[0].toUpperCase() : ''} ${e.publishedEt} ${e.source ?? ''}`.trim(),
    plan: e.plan, triggerAt: e.triggerAt, windowEnd: e.windowEnd,
    recorded: e.recorded, recordedVerdict: e.recordedVerdict, managed: e.managed, peak: e.peak, call: e.call, sources: e.sources,
  });
  const highlights = {
    tsla380p: brief(findHighlight(entries, 'TSLA', 'put', 380, '2026-10-07', '09:58')),
    mu1100c: brief(findHighlight(entries, 'MU', 'call', 1100, '2026-10-07', '09:53', 'quant')),
    biggest10: [...entries].filter((e) => e.recorded.pnlUnit != null).sort((a, b) => Math.abs(b.recorded.pnlUnit!) - Math.abs(a.recorded.pnlUnit!)).slice(0, 10).map(brief),
  };
  const count = (f: (e: ReplayEntry) => boolean) => entries.filter(f).length;
  const summary = {
    since: SINCE, policy: MANAGED_POLICY_ID, policyLabel: MANAGED_POLICY_LABEL,
    ideas: entries.length,
    managed: { closed: count((e) => e.managed.status === 'closed'), open: count((e) => e.managed.status === 'open'), skipped: count((e) => e.managed.status === 'skipped') },
    skippedByReason: Object.fromEntries(entries.filter((e) => e.managed.status === 'skipped').reduce((m, e) => m.set(e.managed.exitReason.replace(/\(.*$/, '').trim(), (m.get(e.managed.exitReason.replace(/\(.*$/, '').trim()) ?? 0) + 1), new Map<string, number>())),
    walkForward: { basis: 'ideas closed under BOTH recorded and managed exits; P&L at $500 risk per trade (losses capped at the stop); halves split at the median publish time', ...walk },
    walkForwardBarVerifiedOnly: verdicts.size ? compare(verifiedPairs) : null,
    callAccuracy,
    proposal: walk.managedBeatsRecordedBothHalves
      ? 'Managed beats recorded in BOTH halves with the top-3 winners removed (E[R] and $ at $500 risk) — propose MANAGED_EXITS=1 for NEXUS ideas (implemented, default off).'
      : 'Managed does NOT beat recorded in both halves with the top-3 removed — keep MANAGED_EXITS off.',
    network: { calls: netCalls, cacheHits }, massive: entitlement.report(),
  };
  const ledger = { generatedAt: new Date().toISOString(), script: 'research/managed-exit-replay.ts', caveat: 'replayed with current exit rules — not live fills', summary, highlights, ideas: entries };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (fs.existsSync(OUT)) fs.copyFileSync(OUT, OUT.replace(/\.json$/i, '') + `.bak-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(OUT, JSON.stringify(ledger, null, 1));
  const cols = ['id', 'symbol', 'source', 'assetType', 'direction', 'optionType', 'strike', 'expiry', 'publishedEt', 'triggerAt', 'windowEnd',
    'recStatus', 'recUnit', 'recR', 'rec500', 'rec1000', 'verdict', 'manStatus', 'manUnit', 'manR', 'man500', 'man1000', 'manExit', 'manExitAt',
    'peakU', 'peakUAt', 'peakR', 'peakP', 'peakPAt', 'peakUnitPnl', 'call', 'callAt'];
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(',')];
  for (const e of entries) lines.push([e.id, e.symbol, e.source, e.assetType, e.direction, e.optionType, e.strike, e.expiry, e.publishedEt, e.triggerAt, e.windowEnd,
    e.recorded.status, e.recorded.pnlUnit, e.recorded.r, e.recorded.atRisk.r500, e.recorded.atRisk.r1000, e.recordedVerdict,
    e.managed.status, e.managed.pnlUnit, e.managed.r, e.managed.atRisk.r500, e.managed.atRisk.r1000, e.managed.exitReason, e.managed.exitAt,
    e.peak.underlying?.px, e.peak.underlying?.at, e.peak.underlying?.r, e.peak.premium?.px, e.peak.premium?.at, e.peak.unitPnl, e.call.result, e.call.at].map(cell).join(','));
  fs.writeFileSync(CSV, lines.join('\n'));

  // ─── console ───
  const $ = (v: number | null | undefined) => v == null ? '—' : `${v < 0 ? '-' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const pc = (v: number | null) => v == null ? '—' : `${(v * 100).toFixed(1)}%`;
  const line = (k: string, s: ReturnType<typeof fmtStats>) => console.log(`    ${k.padEnd(22)} n=${String(s.n).padStart(4)} win ${pc(s.winRate).padStart(6)} E[R] ${s.expectancyR == null ? '—' : s.expectancyR.toFixed(3).padStart(7)} PF ${String(s.profitFactor ?? '—').slice(0, 5).padStart(5)} net ${$(s.totalPnl).padStart(9)} maxDD ${$(-s.maxDrawdown).padStart(9)}`);
  console.log(`\n=== Managed-exit replay (${entries.length} ideas since ${SINCE}) — ${MANAGED_POLICY_LABEL} ===`);
  console.log(`managed: ${summary.managed.closed} closed · ${summary.managed.open} open · ${summary.managed.skipped} skipped`);
  for (const [k, v] of Object.entries(summary.skippedByReason)) console.log(`  skipped ${String(v).padStart(4)}  ${k}`);
  for (const [name, b] of [['ALL', walk.all], ['FIRST HALF', walk.firstHalf], ['SECOND HALF', walk.secondHalf]] as const) {
    console.log(`\n  ${name} ${b.from?.slice(0, 10) ?? ''} → ${b.to?.slice(0, 10) ?? ''} (at $500 risk)`);
    line('recorded', b.recorded); line('managed', b.managed); line('recorded −top3', b.recordedTop3Removed); line('managed −top3', b.managedTop3Removed);
  }
  const ca = (k: string, s: ReturnType<typeof summarizeCalls>) => console.log(`  ${k.padEnd(12)} ${pc(s.rate)} (${s.wins}W/${s.losses}L, n=${s.n}; no result ${s.noResult}, pending ${s.pending}, not triggered ${s.notTriggered}) ${s.from?.slice(0, 10) ?? ''} → ${s.to?.slice(0, 10) ?? ''}`);
  console.log('\nCALL ACCURACY (T1 or +1R before the stop, first touch on 5m bars):');
  ca('overall', callAccuracy.overall); ca('first half', callAccuracy.firstHalf); ca('second half', callAccuracy.secondHalf);
  const hl = (k: string, h: ReturnType<typeof brief>) => {
    if (!h) { console.log(`  ${k}: not found in the book`); return; }
    console.log(`  ${h.label}: recorded ${h.recorded.status} ${$(h.recorded.pnlUnit)} unit (${$(h.recorded.atRisk.r500)} @$500) · managed ${h.managed.status} ${$(h.managed.pnlUnit)} unit (${$(h.managed.atRisk.r500)} @$500) ${h.managed.exitReason}`
      + ` · peak ${h.peak.underlying ? `${h.peak.underlying.px} (${h.peak.underlying.r?.toFixed(2)}R) ${h.peak.underlying.at}` : '—'}${h.peak.premium ? ` · peak premium ${h.peak.premium.px} ${h.peak.premium.at}` : ''} · call ${h.call.result}${h.call.at ? ` ${h.call.at}` : ''}`);
  };
  console.log('\nHIGHLIGHTS:'); hl('TSLA 380P', highlights.tsla380p); hl('MU 1100C', highlights.mu1100c);
  console.log('\n10 BIGGEST by |recorded unit P&L|:'); for (const h of highlights.biggest10) hl('', h);
  console.log(`\n${summary.proposal}`);
  console.log(`\nwrote ${OUT} and ${CSV} (read-only; nothing written to the database). Server: MANAGED_REPLAY_LEDGER=${OUT}`);
}

async function selfTest() {
  // 1) Synthetic: the policy's documented behaviour.
  const mk = (rows: [number, number, number, number][]): ManagedBar[] => rows.map(([o, h, l, c], k) => ({ t: k * W5, o, h, l, c, atr: 1 }));
  const a = simulateManaged({ kind: 'stock', direction: 'long', entry: 100, stop: 98, target: 104, windowComplete: true,
    bars: mk([[100, 100.5, 99.5, 100], [100, 102.2, 99.9, 102], [102, 104.5, 101.8, 104.2], [104, 106, 103.9, 105.8], [105.8, 105.9, 104.2, 104.5]]) });
  console.log(`  synthetic long: ${a.exitReason} · R ${a.rMultiple?.toFixed(2)} · peak ${a.peakUnderlying?.px}`);
  const ok1 = a.closed && a.fills[0].why === 'T1½' && a.fills[1].why === 'trail' && (a.rMultiple ?? 0) > 1;
  // 2) Real bars: AAPL 5m through the same fetch path.
  const to = NOW - 3 * 86400_000, from = to - 6 * 86400_000;
  const { bars, source } = await bars5m('AAPL', 'stock', from, to);
  const ok2 = bars.length > 100;
  console.log(`  real bars: AAPL ${bars.length} 5m RTH bars via ${source}`);
  if (ok2) {
    const b0 = bars[10];
    const r = simulateManaged({ kind: 'stock', direction: 'long', entry: b0.c, stop: b0.c * 0.99, target: b0.c * 1.02, windowComplete: true,
      bars: bars.slice(10, 90).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, atr: null })) });
    console.log(`  real-bar replay: ${r.exitReason} · R ${r.rMultiple?.toFixed(2)}`);
  }
  console.log(ok1 && ok2 ? 'self-test PASSED' : 'self-test FAILED');
  process.exit(ok1 && ok2 ? 0 : 1);
}

(argv.includes('--self-test') ? selfTest() : main()).catch((e) => { console.error(e); process.exit(1); });
