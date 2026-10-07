/**
 * VERIFY THE NEXUS IDEAS BOOK — every closed trade recomputed from real bars.
 *
 * The Journal "NEXUS ideas" book scores each published idea as a trade
 * (server/journal-row-maps.ts mapDeskIdea): options = 1 contract × (exit −
 * entry premium) × 100; stock/crypto/futures = $1,000 notional × underlying %.
 * This script re-derives every closed row INDEPENDENTLY of the tracker:
 *
 *   stock / crypto / futures
 *     - underlying 5-minute bars (Yahoo; Alpaca stock bars as fallback)
 *     - trigger: did price trade at the published entry after publication?
 *     - exit: did price trade at the recorded exit at the recorded exit time?
 *       If not, replay the plan's stop/target from the trigger (stop first on a
 *       bar touching both; a gap fills at the open) and price that.
 *   options
 *     - the contract's own bars by OCC symbol (Alpaca options bars 1Min;
 *       Yahoo OPR trade bars as fallback; SPX → SPXW/SPX, NDX → NDXP/NDX)
 *     - entry premium AT THE TRIGGER (executionAudit.triggerObservedAt, else the
 *       first underlying bar trading at entry, else publication)
 *     - exit premium AT THE EXIT (the touch bar when the recorded exit time is a
 *       tracker cycle; 16:00 ET settlement for expiries — intrinsic from the
 *       underlying close when the contract has no bar)
 *
 * Each trade gets VERIFIED (within tolerance) / MISMATCH (recorded vs
 * recomputed, with the bug class that explains it) / UNVERIFIABLE (no data,
 * with why). Row-level integrity flags (shared/desk-integrity.ts) and
 * duplicates are reported alongside.
 *
 * READ-ONLY: one `BEGIN TRANSACTION READ ONLY` SELECT, then ROLLBACK. Nothing
 * is written to the database. Network calls run sequentially, throttled, and
 * every response is cached on disk (re-runs are free).
 *
 * Run on the droplet:
 *   set -a && . ./.env && set +a && NODE_ENV=production npx tsx research/verify-nexus-book.ts --out /tmp/nexus-book-verify.json
 * Options:
 *   --out <file.json>     ledger + summary (default /tmp/nexus-book-verify.json); CSV beside it (.csv)
 *   --since YYYY-MM-DD    default OUTCOME_BASELINE_DATE (2026-08-26)
 *   --ids a,b,c           only these idea ids
 *   --limit N             first N closed trades (by |recorded P&L| desc) — smoke test
 *   --throttle MS         pause between network calls (default 350)
 *   --cache DIR           bar cache (default /tmp/nexus-verify-cache)
 *   --offline             integrity checks only, no network (every trade UNVERIFIABLE)
 *
 * The server reads the --out file as its verification ledger
 * (NEXUS_BOOK_VERIFY_LEDGER, default /tmp/nexus-book-verify.json): only
 * VERIFIED rows count as bar-verified in the journal; MISMATCH / UNVERIFIABLE
 * rows are listed, not counted.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { mapDeskIdea, type DeskIdea, type JournalWireRow } from '../server/journal-row-maps';
import { DESK_BUG_CLASSES, deskIntegrityFlags, findDuplicates, type DeskIntegrityFlag } from '../shared/desk-integrity';
import { optionSideOf } from '../shared/option-value-bounds';

// ─── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const OUT = arg('--out') ?? '/tmp/nexus-book-verify.json';
const CSV = OUT.replace(/\.json$/i, '') + '.csv';
const SINCE = arg('--since') ?? OUTCOME_BASELINE_DATE;
const IDS = arg('--ids')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const LIMIT = arg('--limit') ? Number(arg('--limit')) : null;
const THROTTLE = Number(arg('--throttle') ?? 350);
const CACHE = arg('--cache') ?? '/tmp/nexus-verify-cache';
const OFFLINE = argv.includes('--offline');

/** Tolerances: options trade on prints (not NBBO mids), so they get more room. */
const TOL = { stockAbs: 5, stockRel: 0.10, optionAbs: 15, optionRel: 0.20, pricePct: 0.005, premiumPct: 0.10, nearMs: 30 * 60_000 };

/** Script-level bug classes (in addition to shared/desk-integrity.ts). */
const SCRIPT_BUG_CLASSES = {
  never_triggered: 'price never traded at the published entry between publication and the recorded exit — an open/untriggered idea was closed with P&L',
  exit_price_not_traded: 'the recorded underlying exit did not trade at the recorded exit time (stale or wrong-instrument price)',
  barrier_never_touched: 'the recorded target/stop was never touched by the bars between trigger and exit',
  exit_premium_not_traded: 'the recorded exit premium is outside every print of the contract around the exit — not a price the contract traded at',
  entry_premium_not_traded: 'the recorded entry premium is outside every print of the contract around publication',
  entry_premium_at_publish_not_trigger: 'entry premium captured at publication, but the trade only triggered later at a different premium',
  expiry_settlement: 'expiry exit does not match settlement (16:00 ET close / intrinsic)',
  unexplained: 'recomputed P&L differs beyond tolerance; no single class explains it — see evidence',
} as const;

// ─── tiny utils ──────────────────────────────────────────────
type Bar = { t: number; o: number; h: number; l: number; c: number; v?: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const iso = (ms: number | null | undefined) => (fin(ms) ? new Date(ms).toISOString() : null);
const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function et(ms: number) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
/** UTC ms of a New York wall time on a date (DST-safe by probing both offsets). */
function nyWall(day: string, minute: number): number {
  for (const off of [4, 5]) {
    const ms = Date.parse(`${day}T00:00:00Z`) + (minute + off * 60) * 60_000;
    const e = et(ms);
    if (e.day === day && e.min === minute) return ms;
  }
  return Date.parse(`${day}T00:00:00Z`) + (minute + 4 * 60) * 60_000;
}
function expiryDay(raw: string | null): string | null {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? et(ms + 12 * 3600_000).day : null;
}

// ─── cached, throttled HTTP ──────────────────────────────────
fs.mkdirSync(CACHE, { recursive: true });
let netCalls = 0, cacheHits = 0;
async function cachedJson(key: string, url: string, headers: Record<string, string> = {}): Promise<any | null> {
  const file = path.join(CACHE, key.replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
  if (fs.existsSync(file)) { cacheHits++; try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* refetch */ } }
  if (OFFLINE) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(THROTTLE * (attempt + 1));
    netCalls++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge-verify/1.0', ...headers } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      const body = res.ok ? await res.json() : { __status: res.status };
      fs.writeFileSync(file, JSON.stringify(body));
      return body;
    } catch { /* retry */ }
  }
  return null;
}

// ─── bar sources ─────────────────────────────────────────────
const YAHOO_INDEX: Record<string, string> = { SPX: '^GSPC', SPXW: '^GSPC', NDX: '^NDX', NDXP: '^NDX', RUT: '^RUT', VIX: '^VIX', XSP: '^XSP', DJX: '^DJI' };
function yahooSymbol(symbol: string, assetType: string): string {
  const s = symbol.toUpperCase().replace(/^\$/, '');
  if (assetType === 'crypto') return `${s.replace(/[-/]?USDT?$/, '')}-USD`;
  if (assetType === 'future' || assetType === 'futures') return s.endsWith('=F') ? s : `${s.replace(/[A-Z]\d{1,2}$/, '')}=F`;
  return YAHOO_INDEX[s] ?? s;
}
function parseYahoo(j: any): Bar[] {
  const res = j?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  const ts: number[] = res?.timestamp ?? [];
  if (!q) return [];
  const out: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = num(q.open?.[i]), h = num(q.high?.[i]), l = num(q.low?.[i]), c = num(q.close?.[i]);
    if (o != null && h != null && l != null && c != null && h > 0) out.push({ t: ts[i] * 1000, o, h, l, c, v: num(q.volume?.[i]) ?? 0 });
  }
  return out;
}
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Underlying 5m bars covering [fromMs, toMs] (Yahoo, 60-day window; Alpaca stock bars fallback; daily last resort). */
const underlyingMemo = new Map<string, Bar[]>();
async function underlyingBars(symbol: string, assetType: string, fromMs: number, toMs: number): Promise<{ bars: Bar[]; source: string }> {
  const ys = yahooSymbol(symbol, assetType);
  const p1 = Math.floor((fromMs - 86400_000) / 1000), p2 = Math.floor((Math.min(toMs, Date.now()) + 86400_000) / 1000);
  const memoKey = `${ys}|${dayKey(fromMs)}|${dayKey(toMs)}`;
  if (underlyingMemo.has(memoKey)) return { bars: underlyingMemo.get(memoKey)!, source: `yahoo:${ys}:5m` };
  const j = await cachedJson(`y5m_${ys}_${dayKey(fromMs)}_${dayKey(toMs)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${p1}&period2=${p2}&interval=5m&includePrePost=${assetType === 'crypto' ? 'true' : 'false'}`);
  let bars = parseYahoo(j);
  let source = `yahoo:${ys}:5m`;
  if (!bars.length && assetType !== 'crypto' && !YAHOO_INDEX[symbol.toUpperCase()] && process.env.ALPACA_API_KEY) {
    const a = await cachedJson(`a5m_${symbol}_${dayKey(fromMs)}_${dayKey(toMs)}`,
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars?timeframe=5Min&start=${new Date(fromMs - 86400_000).toISOString()}&end=${new Date(Math.min(toMs + 86400_000, Date.now() - 16 * 60_000)).toISOString()}&limit=10000&feed=iex&adjustment=raw`,
      { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' });
    bars = ((a?.bars ?? []) as any[]).map((b) => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })).filter((b) => fin(b.t) && b.h > 0);
    source = `alpaca:${symbol}:5Min(iex)`;
  }
  if (!bars.length) {
    const d = await cachedJson(`y1d_${ys}_${dayKey(fromMs)}_${dayKey(toMs)}`,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${p1}&period2=${p2}&interval=1d`);
    bars = parseYahoo(d);
    source = `yahoo:${ys}:1d`;
  }
  bars.sort((a, b) => a.t - b.t);
  underlyingMemo.set(memoKey, bars);
  return { bars, source };
}

function occOf(root: string, day: string, side: 'call' | 'put', strike: number): string {
  return `${root}${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}${side === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}
function occRoots(symbol: string): string[] {
  const s = symbol.toUpperCase();
  return s === 'SPX' ? ['SPXW', 'SPX'] : s === 'NDX' ? ['NDXP', 'NDX'] : s === 'RUT' ? ['RUTW', 'RUT'] : s === 'VIX' ? ['VIXW', 'VIX'] : [s];
}
/** The contract's bars over [fromMs, toMs]: Alpaca 1Min, then Yahoo OPR trade bars. */
async function optionBars(occ: string, fromMs: number, toMs: number): Promise<{ bars: Bar[]; source: string }> {
  const end = Math.min(toMs, Date.now() - 16 * 60_000);
  if (process.env.ALPACA_API_KEY && end > fromMs) {
    const out: Bar[] = [];
    let token: string | null = null;
    for (let page = 0; page < 5; page++) {
      const qs = new URLSearchParams({ symbols: occ, timeframe: '1Min', start: new Date(fromMs).toISOString(), end: new Date(end).toISOString(), limit: '10000' });
      if (token) qs.set('page_token', token);
      const j = await cachedJson(`ao1m_${occ}_${fromMs}_${end}_${page}`, `https://data.alpaca.markets/v1beta1/options/bars?${qs}`,
        { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' });
      for (const b of j?.bars?.[occ] ?? []) {
        const t = Date.parse(b?.t);
        if (fin(t) && fin(b?.o) && fin(b?.h) && fin(b?.l) && fin(b?.c)) out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });
      }
      token = j?.next_page_token ?? null;
      if (!token) break;
    }
    if (out.length) return { bars: out.sort((a, b) => a.t - b.t), source: `alpaca:${occ}:1Min(indicative)` };
  }
  const p1 = Math.floor((fromMs - 3600_000) / 1000), p2 = Math.floor((toMs + 3600_000) / 1000);
  for (const interval of ['1m', '5m']) {
    const j = await cachedJson(`yo${interval}_${occ}_${p1}_${p2}`,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(occ)}?period1=${p1}&period2=${p2}&interval=${interval}&includePrePost=false`);
    const bars = parseYahoo(j).filter((b) => (b.v ?? 0) > 0 || interval === '5m');
    if (bars.length) return { bars, source: `yahoo-opr:${occ}:${interval}` };
  }
  return { bars: [], source: 'none' };
}

/** Bar containing t (given bar width), else the nearest bar within nearMs (after first, then before). */
function barAt(bars: Bar[], t: number, widthMs: number, nearMs = TOL.nearMs): Bar | null {
  const inside = bars.find((b) => b.t <= t && t < b.t + widthMs);
  if (inside) return inside;
  const after = bars.find((b) => b.t > t && b.t - t <= nearMs);
  if (after) return after;
  const before = [...bars].reverse().find((b) => b.t < t && t - b.t <= nearMs);
  return before ?? null;
}
const widthOf = (bars: Bar[]) => {
  if (bars.length < 2) return 60_000;
  const ds = bars.slice(1, 50).map((b, i) => b.t - bars[i].t).filter((d) => d > 0).sort((a, b) => a - b);
  return ds[0] ?? 60_000;
};
function rangeAround(bars: Bar[], t: number, halfMs: number): { lo: number; hi: number; n: number } | null {
  const w = bars.filter((b) => b.t >= t - halfMs && b.t <= t + halfMs);
  if (!w.length) return null;
  return { lo: Math.min(...w.map((b) => b.l)), hi: Math.max(...w.map((b) => b.h)), n: w.length };
}
const rth = (b: Bar) => { const m = et(b.t).min; return m >= 570 && m < 960; };

// ─── the book (read-only) ────────────────────────────────────
interface IdeaRow extends DeskIdea {
  targetPrice: number | null; stopLoss: number | null; outcomeNotes: string | null; exitBy: string | null; holdingPeriod: string | null;
  triggerObservedAt: string | null; triggerObservedPrice: number | null; realizedPnLColumn: number | null; status: string | null;
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
             session_context, exit_by, holding_period, realized_pnl, status,
             substring(outcome_notes from '\\[exit-time:([a-z_]+)\\]') AS exit_time_source,
             convergence_signals_json->'executionAudit'->>'state' AS execution_state,
             convergence_signals_json->'executionAudit'->>'triggerObservedAt' AS trigger_observed_at,
             convergence_signals_json->'executionAudit'->>'triggerObservedPrice' AS trigger_observed_price
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
      highestPriceReached: num(x.highest_price_reached), lowestPriceReached: num(x.lowest_price_reached), executionState: x.execution_state,
      dataSourceUsed: x.data_source_used, sessionContext: x.session_context, outcomeNotes: x.outcome_notes, exitBy: x.exit_by,
      holdingPeriod: x.holding_period, triggerObservedAt: x.trigger_observed_at, triggerObservedPrice: num(x.trigger_observed_price),
      realizedPnLColumn: num(x.realized_pnl), status: x.status,
    }));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

// ─── verification ────────────────────────────────────────────
type Verdict = 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE';
interface TradeResult {
  id: string; symbol: string; source: string | null; assetType: string; direction: string; optionType: string | null;
  strike: number | null; expiry: string | null; publishedAt: string; triggerAt: string | null; exitAt: string | null; exitDayET: string | null;
  outcomeStatus: string | null; recordedEntry: number; recordedExit: number | null; recomputedEntry: number | null; recomputedExit: number | null;
  recordedPnL: number; recomputedPnL: number | null; diff: number | null; verdict: Verdict; bugClass: string | null; reason: string;
  integrity: { code: string; severity: string; detail: string }[]; duplicateOf: string | null; evidence: Record<string, unknown>;
}

function within(a: number, b: number, abs: number, rel: number) { return Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)); }

/** First bar at/after fromMs (≤ toMs) where price traded at `level` (or gapped through it in the trade's favour of filling). */
function firstTouch(bars: Bar[], level: number, fromMs: number, toMs: number): Bar | null {
  return bars.find((b) => b.t + 1 >= fromMs && b.t <= toMs && b.l <= level * (1 + TOL.pricePct) && b.h >= level * (1 - TOL.pricePct)) ?? null;
}

/** Replay the plan's barriers from the trigger: stop first on a bar touching both; gap → open. */
function replayBarriers(bars: Bar[], long: boolean, stop: number | null, target: number | null, fromMs: number, toMs: number):
  { kind: 'stop' | 'target' | 'none'; px: number | null; t: number | null } {
  for (const b of bars) {
    if (b.t < fromMs || b.t > toMs) continue;
    const stopHit = stop != null && (long ? b.l <= stop : b.h >= stop);
    const tgtHit = target != null && (long ? b.h >= target : b.l <= target);
    if (stopHit) return { kind: 'stop', px: (long ? b.o <= stop! : b.o >= stop!) ? b.o : stop, t: b.t };
    if (tgtHit) return { kind: 'target', px: (long ? b.o >= target! : b.o <= target!) ? b.o : target, t: b.t };
  }
  return { kind: 'none', px: null, t: null };
}

async function verifyStock(i: IdeaRow, row: JournalWireRow, base: Omit<TradeResult, 'verdict' | 'bugClass' | 'reason' | 'recomputedEntry' | 'recomputedExit' | 'recomputedPnL' | 'diff' | 'triggerAt'>): Promise<TradeResult> {
  const pubMs = Date.parse(i.timestamp);
  const exitMs = i.exitDate ? Date.parse(i.exitDate) : NaN;
  const out = (v: Verdict, bugClass: string | null, reason: string, extra: Partial<TradeResult> = {}): TradeResult =>
    ({ ...base, triggerAt: null, recomputedEntry: null, recomputedExit: null, recomputedPnL: null, diff: null, verdict: v, bugClass, reason, ...extra });
  if (!fin(exitMs)) return out('UNVERIFIABLE', 'bar_unverifiable', 'no exit time recorded');
  const { bars: all, source } = await underlyingBars(i.symbol, i.assetType, pubMs, exitMs);
  const bars = i.assetType === 'crypto' || source.endsWith(':1d') ? all : all.filter(rth);
  base.evidence.underlyingSource = source;
  base.evidence.underlyingBars = bars.filter((b) => b.t >= pubMs - 3600_000 && b.t <= exitMs + 3600_000).length;
  if (!bars.length) return out('UNVERIFIABLE', 'bar_unverifiable', `no underlying bars (${source})`);
  const daily = source.endsWith(':1d');
  const width = daily ? 86400_000 : widthOf(bars);
  const long = i.direction !== 'short';
  const entry = i.entryPrice;
  // Trigger: price traded at the published entry after publication (daily bars: from the publish day).
  const trig = firstTouch(bars, entry, daily ? pubMs - 86400_000 : pubMs - width, exitMs);
  base.evidence.trigger = trig ? { at: iso(trig.t), bar: trig } : null;
  if (!trig) {
    return out('MISMATCH', 'never_triggered', `entry ${entry} never traded between ${iso(pubMs)} and ${iso(exitMs)}`, { recomputedPnL: 0, diff: r2(0 - row.realizedPnL!) });
  }
  const trigMs = Math.max(trig.t, pubMs);
  // Did the recorded exit trade at the recorded exit time?
  const recExit = row.exitPrice ?? null;
  const around = rangeAround(bars, exitMs, daily ? 12 * 3600_000 : Math.max(10 * 60_000, width));
  base.evidence.exitWindow = around;
  const hitUnknown = i.exitTimeSource === 'live' && (i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop');
  let recomputedExit: number | null = null;
  let bug: string | null = null;
  let reason = '';
  if (recExit != null && around && recExit >= around.lo * (1 - TOL.pricePct) && recExit <= around.hi * (1 + TOL.pricePct)) {
    recomputedExit = recExit;
    reason = `exit ${recExit} traded in ${iso(exitMs)} window [${around.lo}, ${around.hi}]`;
  } else if (recExit != null && hitUnknown && firstTouch(bars, recExit, trigMs, exitMs)) {
    const tb = firstTouch(bars, recExit, trigMs, exitMs)!;
    recomputedExit = recExit;
    reason = `barrier ${recExit} touched at ${iso(tb.t)} (recorded exit time is the tracker cycle)`;
    base.evidence.touch = { at: iso(tb.t), bar: tb };
  } else {
    // Replay the plan from the trigger to the recorded exit.
    const rp = replayBarriers(bars, long, i.stopLoss, i.targetPrice, trigMs, exitMs);
    base.evidence.replay = { ...rp, at: iso(rp.t) };
    if (rp.px != null) recomputedExit = rp.px;
    else { const last = [...bars].reverse().find((b) => b.t <= exitMs); recomputedExit = last ? last.c : null; base.evidence.replayMark = last ? { at: iso(last.t), close: last.c } : null; }
    bug = (i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop') && rp.kind === 'none' ? 'barrier_never_touched' : 'exit_price_not_traded';
    reason = `recorded exit ${recExit} not traded ${around ? `(window [${around.lo}, ${around.hi}])` : '(no bars at exit)'}; replay → ${rp.kind} @ ${recomputedExit}`;
  }
  if (recomputedExit == null) return out('UNVERIFIABLE', 'bar_unverifiable', 'no bar to price the exit', { triggerAt: iso(trigMs) });
  const pct = ((recomputedExit - entry) / entry) * 100 * (long ? 1 : -1);
  const recomputedPnL = r2((pct / 100) * 1000);
  const diff = r2(recomputedPnL - row.realizedPnL!);
  const ok = within(recomputedPnL, row.realizedPnL!, TOL.stockAbs, TOL.stockRel);
  return out(ok ? 'VERIFIED' : 'MISMATCH', ok ? null : bug ?? 'unexplained', reason,
    { triggerAt: iso(trigMs), recomputedEntry: entry, recomputedExit: r2(recomputedExit), recomputedPnL, diff });
}

async function verifyOption(i: IdeaRow, row: JournalWireRow, base: Omit<TradeResult, 'verdict' | 'bugClass' | 'reason' | 'recomputedEntry' | 'recomputedExit' | 'recomputedPnL' | 'diff' | 'triggerAt'>): Promise<TradeResult> {
  const out = (v: Verdict, bugClass: string | null, reason: string, extra: Partial<TradeResult> = {}): TradeResult =>
    ({ ...base, triggerAt: null, recomputedEntry: null, recomputedExit: null, recomputedPnL: null, diff: null, verdict: v, bugClass, reason, ...extra });
  const day = expiryDay(i.expiryDate);
  const strike = i.strikePrice;
  if (!day || !fin(strike) || strike <= 0) return out('UNVERIFIABLE', 'bar_unverifiable', `cannot build an OCC symbol (expiry ${i.expiryDate}, strike ${strike})`);
  const side = optionSideOf(i.optionType);
  const pubMs = Date.parse(i.timestamp);
  const status = String(i.outcomeStatus ?? '').toLowerCase();
  const expiryCloseMs = nyWall(day, 960);
  let exitMs = i.exitDate ? Date.parse(i.exitDate) : NaN;
  if (!fin(exitMs)) return out('UNVERIFIABLE', 'bar_unverifiable', 'no exit time recorded');
  if (exitMs > expiryCloseMs) { base.evidence.exitAfterExpiry = iso(exitMs); exitMs = expiryCloseMs; }

  // Underlying path: trigger time and (for cycle-stamped barrier exits) the touch.
  const und = await underlyingBars(i.symbol, 'stock', pubMs, exitMs);
  const ubars = und.bars.filter(rth);
  base.evidence.underlyingSource = und.source;
  const uDaily = und.source.endsWith(':1d');
  const long = i.direction !== 'short';
  let trigMs: number | null = i.triggerObservedAt ? Date.parse(i.triggerObservedAt) : null;
  let trigBasis = trigMs ? 'executionAudit.triggerObservedAt' : '';
  if (!fin(trigMs) && ubars.length && !uDaily) {
    const tb = firstTouch(ubars, i.entryPrice, pubMs - 5 * 60_000, exitMs);
    if (tb) { trigMs = Math.max(tb.t, pubMs); trigBasis = 'first underlying bar at entry'; }
    else if (ubars.some((b) => b.t >= pubMs && b.t <= exitMs)) {
      base.evidence.trigger = null;
      return out('MISMATCH', 'never_triggered', `underlying never traded at entry ${i.entryPrice} between publication and exit (${und.source})`,
        { recomputedPnL: 0, diff: r2(0 - row.realizedPnL!) });
    }
  }
  if (!fin(trigMs)) { trigMs = pubMs; trigBasis = 'publication (no underlying intraday bars)'; }
  base.evidence.trigger = { at: iso(trigMs), basis: trigBasis };
  const hitUnknown = i.exitTimeSource === 'live' && (status === 'hit_target' || status === 'hit_stop');
  if (hitUnknown && ubars.length && !uDaily) {
    const level = status === 'hit_target' ? i.targetPrice : i.stopLoss;
    const tb = level != null ? firstTouch(ubars, level, trigMs!, exitMs) : null;
    base.evidence.touch = tb ? { at: iso(tb.t), level } : { level, found: false };
    if (tb) exitMs = tb.t + widthOf(ubars);
  }

  // The contract's own bars.
  let ob: { bars: Bar[]; source: string } = { bars: [], source: 'none' };
  let occ = '';
  for (const root of occRoots(i.symbol)) {
    occ = occOf(root, day, side, strike);
    ob = await optionBars(occ, Math.min(pubMs, trigMs!) - 60 * 60_000, Math.max(exitMs, Math.min(expiryCloseMs, exitMs + 60 * 60_000)));
    if (ob.bars.length) break;
  }
  base.evidence.occ = occ;
  base.evidence.optionSource = ob.source;
  base.evidence.optionBars = ob.bars.length;
  const bars = ob.bars;
  const w = widthOf(bars);

  // Entry premium at the trigger; recorded entry must have traded near publication.
  const eb = bars.length ? barAt(bars, trigMs!, w) : null;
  const pubRange = bars.length ? rangeAround(bars, pubMs, 15 * 60_000) : null;
  base.evidence.entryBar = eb ? { at: iso(eb.t), o: eb.o, h: eb.h, l: eb.l, c: eb.c } : null;
  base.evidence.publishRange = pubRange;
  // Exit premium at the exit (expiry: last print before 16:00 ET, else intrinsic at the underlying close).
  let exitPx: number | null = null;
  let exitBasis = '';
  if (status === 'expired' && Math.abs(exitMs - expiryCloseMs) < 3600_000) {
    const last = [...bars].reverse().find((b) => b.t <= expiryCloseMs && b.t >= expiryCloseMs - 2 * 3600_000);
    if (last) { exitPx = last.c; exitBasis = `last print ${iso(last.t)}`; }
    else {
      const uc = [...ubars].reverse().find((b) => b.t <= expiryCloseMs);
      if (uc && Math.abs(uc.t - expiryCloseMs) < 3600_000) {
        exitPx = side === 'call' ? Math.max(0, uc.c - strike) : Math.max(0, strike - uc.c);
        exitBasis = `intrinsic at underlying close ${uc.c} (${iso(uc.t)})`;
      }
    }
  } else if (bars.length) {
    const xb = barAt(bars, exitMs, w);
    if (xb) { exitPx = xb.c; exitBasis = `bar ${iso(xb.t)} close`; base.evidence.exitBar = { at: iso(xb.t), o: xb.o, h: xb.h, l: xb.l, c: xb.c }; }
  }
  const exitRange = bars.length ? rangeAround(bars, exitMs, 30 * 60_000) : null;
  base.evidence.exitRange = exitRange;
  base.evidence.exitBasis = exitBasis;

  if (!eb && exitPx == null) return out('UNVERIFIABLE', 'bar_unverifiable', `no contract bars for ${occ} (${ob.source}) around entry or exit`, { triggerAt: iso(trigMs) });
  if (!eb) return out('UNVERIFIABLE', 'bar_unverifiable', `no contract bar within 30m of the trigger ${iso(trigMs)} (${occ})`, { triggerAt: iso(trigMs), recomputedExit: exitPx });
  if (exitPx == null) return out('UNVERIFIABLE', 'bar_unverifiable', `no contract bar within 30m of the exit ${iso(exitMs)} (${occ})`, { triggerAt: iso(trigMs), recomputedEntry: eb.c });

  const entryPx = eb.c;
  const recomputedPnL = r2((exitPx - entryPx) * 100);
  const diff = r2(recomputedPnL - row.realizedPnL!);
  const ok = within(recomputedPnL, row.realizedPnL!, TOL.optionAbs, TOL.optionRel);
  const recEntry = row.entryPrice, recExit = row.exitPrice ?? null;
  let bug: string | null = null;
  const reasons: string[] = [`entry ${recEntry} → bar ${r2(entryPx)} @ ${iso(eb.t)}`, `exit ${recExit} → ${r2(exitPx)} (${exitBasis})`];
  if (!ok) {
    const exitTraded = recExit != null && exitRange && recExit >= exitRange.lo * (1 - TOL.premiumPct) && recExit <= exitRange.hi * (1 + TOL.premiumPct);
    const entryTradedAtPub = pubRange && recEntry >= pubRange.lo * (1 - TOL.premiumPct) && recEntry <= pubRange.hi * (1 + TOL.premiumPct);
    if (recExit != null && exitRange && !exitTraded) bug = 'exit_premium_not_traded';
    else if (status === 'expired') bug = 'expiry_settlement';
    else if (entryTradedAtPub && !within(entryPx, recEntry, 0.05, 0.2) && trigMs! - pubMs > 5 * 60_000) bug = 'entry_premium_at_publish_not_trigger';
    else if (pubRange && !entryTradedAtPub) bug = 'entry_premium_not_traded';
    else bug = 'unexplained';
    if (exitRange) reasons.push(`contract range ±30m of exit [${exitRange.lo}, ${exitRange.hi}]`);
  }
  return out(ok ? 'VERIFIED' : 'MISMATCH', bug, reasons.join('; '),
    { triggerAt: iso(trigMs), recomputedEntry: r2(entryPx), recomputedExit: r2(exitPx), recomputedPnL, diff });
}

// ─── main ────────────────────────────────────────────────────
const OVERRIDING = new Set(['premium_scale_ladder', 'synthetic_or_retroactive', 'impossible_exit_premium', 'impossible_entry_premium', 'fill_off_strike_scale']);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (set -a && . ./.env && set +a)');
  console.log(`[verify-nexus-book] since ${SINCE} · out ${OUT} · cache ${CACHE}${OFFLINE ? ' · OFFLINE' : ''}`);
  const ideas = await loadBook();
  const pairs: { idea: IdeaRow; row: JournalWireRow }[] = [];
  const notScored = new Map<string, number>();
  for (const i of ideas) {
    const m = mapDeskIdea(i);
    if ('row' in m) pairs.push({ idea: i, row: m.row });
    else notScored.set(m.excluded, (notScored.get(m.excluded) ?? 0) + 1);
  }
  let closed = pairs.filter((p) => p.row.status === 'closed' && p.row.realizedPnL != null);
  if (IDS) closed = closed.filter((p) => IDS.includes(p.idea.id));
  closed.sort((a, b) => Math.abs(b.row.realizedPnL!) - Math.abs(a.row.realizedPnL!));
  if (LIMIT) closed = closed.slice(0, LIMIT);
  const dups = findDuplicates(pairs.filter((p) => p.row.status === 'closed').map(({ idea, row }) => ({
    id: idea.id, symbol: idea.symbol, assetType: idea.assetType, direction: idea.direction, optionType: idea.optionType,
    strikePrice: idea.strikePrice, expiryDate: idea.expiryDate, entryMs: Date.parse(row.entryTime), exitMs: row.exitTime ? Date.parse(row.exitTime) : null,
  })));
  const recordedBook = r2(pairs.filter((p) => p.row.status === 'closed').reduce((s, p) => s + (p.row.realizedPnL ?? 0), 0));
  console.log(`  ${ideas.length} ideas read (read-only txn) · ${pairs.length} scored rows · ${closed.length} closed to verify · book recorded total ${recordedBook}`);

  const results: TradeResult[] = [];
  let n = 0;
  for (const { idea: i, row } of closed) {
    n++;
    const integrity: DeskIntegrityFlag[] = deskIntegrityFlags(i);
    const exitMs = row.exitTime ? Date.parse(row.exitTime) : NaN;
    const base = {
      id: i.id, symbol: i.symbol, source: i.source, assetType: i.assetType, direction: i.direction, optionType: i.optionType,
      strike: i.strikePrice, expiry: expiryDay(i.expiryDate), publishedAt: i.timestamp, exitAt: row.exitTime ?? null,
      exitDayET: fin(exitMs) ? et(exitMs).day : null, outcomeStatus: i.outcomeStatus, recordedEntry: row.entryPrice,
      recordedExit: row.exitPrice ?? null, recordedPnL: row.realizedPnL!, integrity: integrity.map((f) => ({ ...f })),
      duplicateOf: dups.get(i.id) ?? null,
      evidence: {
        resolutionReason: i.resolutionReason, exitTimeSource: i.exitTimeSource, executionState: i.executionState,
        exitPremiumTag: (i.outcomeNotes ?? '').match(/\[exit-premium:[a-z_]+\][^\n]*/)?.[0] ?? null,
        recordedUnderlyingExit: i.exitPrice, recordedPercentGain: i.percentGain, recordedOptionPercentGain: i.optionPercentGain,
        plan: { entry: i.entryPrice, target: i.targetPrice, stop: i.stopLoss }, dataSourceUsed: i.dataSourceUsed,
      } as Record<string, unknown>,
    };
    let r: TradeResult;
    try {
      r = OFFLINE
        ? { ...base, triggerAt: null, recomputedEntry: null, recomputedExit: null, recomputedPnL: null, diff: null, verdict: 'UNVERIFIABLE', bugClass: 'bar_unverifiable', reason: 'offline run' }
        : i.assetType === 'option' ? await verifyOption(i, row, base) : await verifyStock(i, row, base);
    } catch (e: any) {
      r = { ...base, triggerAt: null, recomputedEntry: null, recomputedExit: null, recomputedPnL: null, diff: null, verdict: 'UNVERIFIABLE', bugClass: 'bar_unverifiable', reason: `error: ${e?.message ?? e}` };
    }
    // A failed integrity check that makes the OUTCOME itself invalid wins over a price match.
    const over = integrity.find((f) => f.severity === 'fail' && OVERRIDING.has(f.code));
    if (over) { r.verdict = 'MISMATCH'; r.reason = `${over.code}: ${over.detail}; bars: ${r.bugClass ?? 'match'} — ${r.reason}`; r.bugClass = over.code; }
    results.push(r);
    if (n % 10 === 0 || n === closed.length) console.log(`  ${n}/${closed.length} · net calls ${netCalls} · cache hits ${cacheHits}`);
  }

  // ─── summary ──────────────────────────────────────────────
  const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
  const verified = results.filter((r) => r.verdict === 'VERIFIED');
  const mism = results.filter((r) => r.verdict === 'MISMATCH');
  const unv = results.filter((r) => r.verdict === 'UNVERIFIABLE');
  const group = (key: (r: TradeResult) => string) => {
    const m = new Map<string, { n: number; recorded: number; verifiedRecorded: number; recomputed: number; verified: number; mismatch: number; unverifiable: number }>();
    for (const r of results) {
      const k = key(r);
      const g = m.get(k) ?? { n: 0, recorded: 0, verifiedRecorded: 0, recomputed: 0, verified: 0, mismatch: 0, unverifiable: 0 };
      g.n++; g.recorded = r2(g.recorded + r.recordedPnL);
      if (r.verdict === 'VERIFIED' && !r.duplicateOf) g.verifiedRecorded = r2(g.verifiedRecorded + r.recordedPnL);
      if (r.recomputedPnL != null && !r.duplicateOf) g.recomputed = r2(g.recomputed + r.recomputedPnL);
      g[r.verdict === 'VERIFIED' ? 'verified' : r.verdict === 'MISMATCH' ? 'mismatch' : 'unverifiable']++;
      m.set(k, g);
    }
    return Object.fromEntries([...m.entries()].sort((a, b) => Math.abs(b[1].recorded) - Math.abs(a[1].recorded)));
  };
  const byBug = new Map<string, { n: number; recorded: number; recomputed: number; label: string }>();
  for (const r of mism) {
    const k = r.bugClass ?? 'unexplained';
    const g = byBug.get(k) ?? { n: 0, recorded: 0, recomputed: 0, label: (DESK_BUG_CLASSES as any)[k] ?? (SCRIPT_BUG_CLASSES as any)[k] ?? k };
    g.n++; g.recorded = r2(g.recorded + r.recordedPnL); g.recomputed = r2(g.recomputed + (r.recomputedPnL ?? 0));
    byBug.set(k, g);
  }
  const summary = {
    since: SINCE,
    bookRecordedTotal: recordedBook,
    checkedTrades: results.length,
    recordedTotalChecked: sum(results.map((r) => r.recordedPnL)),
    verifiedTotal: sum(verified.filter((r) => !r.duplicateOf).map((r) => r.recordedPnL)),
    recomputedTotalWherePriced: sum(results.filter((r) => r.recomputedPnL != null && !r.duplicateOf).map((r) => r.recomputedPnL!)),
    counts: { verified: verified.length, mismatch: mism.length, unverifiable: unv.length, duplicates: results.filter((r) => r.duplicateOf).length },
    mismatchByBugClass: Object.fromEntries([...byBug.entries()].sort((a, b) => Math.abs(b[1].recorded) - Math.abs(a[1].recorded))),
    unverifiableByReason: Object.fromEntries(unv.reduce((m, r) => m.set(r.reason.replace(/[0-9T:.\-Z]{10,}/g, '…').slice(0, 80), (m.get(r.reason.replace(/[0-9T:.\-Z]{10,}/g, '…').slice(0, 80)) ?? 0) + 1), new Map<string, number>())),
    byEngine: group((r) => r.source ?? 'unknown'),
    byAsset: group((r) => r.assetType),
    byDay: group((r) => r.exitDayET ?? 'unknown'),
    notScoredByBook: Object.fromEntries(notScored),
    tolerance: TOL,
    network: { calls: netCalls, cacheHits },
  };
  const top30 = [...results].sort((a, b) => Math.abs(b.recordedPnL) - Math.abs(a.recordedPnL)).slice(0, 30);
  const ledger = {
    generatedAt: new Date().toISOString(),
    script: 'research/verify-nexus-book.ts',
    bugClasses: { ...DESK_BUG_CLASSES, ...SCRIPT_BUG_CLASSES },
    summary,
    top30,
    trades: results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(ledger, null, 1));
  const cols = ['id', 'symbol', 'source', 'assetType', 'direction', 'optionType', 'strike', 'expiry', 'publishedAt', 'triggerAt', 'exitAt', 'exitDayET',
    'outcomeStatus', 'recordedEntry', 'recordedExit', 'recomputedEntry', 'recomputedExit', 'recordedPnL', 'recomputedPnL', 'diff', 'verdict', 'bugClass',
    'reason', 'integrity', 'duplicateOf', 'occ', 'optionSource', 'underlyingSource'] as const;
  const cell = (v: unknown) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(',')];
  for (const r of results) {
    lines.push(cols.map((c) => c === 'integrity' ? cell(r.integrity.map((f) => `${f.severity}:${f.code}`).join('|'))
      : c === 'occ' || c === 'optionSource' || c === 'underlyingSource' ? cell(r.evidence[c]) : cell((r as any)[c])).join(','));
  }
  fs.writeFileSync(CSV, lines.join('\n'));

  // ─── console report ───────────────────────────────────────
  const $ = (v: number) => `${v < 0 ? '-' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  console.log(`\n=== NEXUS book verification (${results.length} closed trades since ${SINCE}) ===`);
  console.log(`book recorded total      ${$(recordedBook)}`);
  console.log(`recorded (checked set)   ${$(summary.recordedTotalChecked)}`);
  console.log(`VERIFIED total           ${$(summary.verifiedTotal)}   (${verified.length} trades, duplicates excluded)`);
  console.log(`recomputed (where priced) ${$(summary.recomputedTotalWherePriced)}`);
  console.log(`MISMATCH ${mism.length} · UNVERIFIABLE ${unv.length} · duplicates ${summary.counts.duplicates}`);
  console.log('\nmismatch by bug class:');
  for (const [k, g] of Object.entries(summary.mismatchByBugClass)) console.log(`  ${String(g.n).padStart(4)}  ${k.padEnd(38)} recorded ${$(g.recorded).padStart(10)} → recomputed ${$(g.recomputed)}`);
  console.log('\nby engine:');
  for (const [k, g] of Object.entries(summary.byEngine)) console.log(`  ${k.padEnd(24)} n=${String(g.n).padStart(3)} recorded ${$(g.recorded).padStart(10)} verified ${$(g.verifiedRecorded).padStart(10)} (V${g.verified}/M${g.mismatch}/U${g.unverifiable})`);
  console.log('\nby day (exit, ET):');
  for (const [k, g] of Object.entries(summary.byDay).sort()) console.log(`  ${k}  n=${String(g.n).padStart(3)} recorded ${$(g.recorded).padStart(10)} verified ${$(g.verifiedRecorded).padStart(10)}`);
  console.log('\ntop 30 by |recorded P&L|:');
  for (const r of top30) {
    console.log(`  ${r.verdict.padEnd(12)} ${r.symbol.padEnd(6)} ${String(r.optionType ?? r.assetType).padEnd(6)} ${String(r.strike ?? '').padEnd(7)} ${String(r.exitDayET).padEnd(10)} recorded ${$(r.recordedPnL).padStart(9)} recomputed ${r.recomputedPnL == null ? '—'.padStart(9) : $(r.recomputedPnL).padStart(9)}  ${r.bugClass ?? ''}${r.duplicateOf ? ` dup-of:${r.duplicateOf}` : ''}`);
    console.log(`      ${r.reason.slice(0, 220)}`);
  }
  console.log(`\nwrote ${OUT} and ${CSV} (read-only; nothing written to the database)`);
}

/**
 * --self-test: no database. Builds stock ideas from REAL bars (so the right
 * answer is known), then a fabricated exit ×10 and a never-triggered entry,
 * and checks the verdicts. Proves the bar plumbing on the box before the run.
 */
async function selfTest() {
  const sym = arg('--self-test-symbol') ?? 'AAPL';
  const to = Date.now() - 3 * 86400_000, from = to - 10 * 86400_000;
  const { bars, source } = await underlyingBars(sym, 'stock', from, to);
  const rb = bars.filter(rth);
  if (rb.length < 100) throw new Error(`self-test: too few bars for ${sym} (${source}, ${rb.length})`);
  const a = rb[20], b = rb[80];
  const mk = (over: Partial<IdeaRow>): IdeaRow => ({
    id: 'self', symbol: sym, assetType: 'stock', direction: 'long', entryPrice: a.c, targetPrice: a.c * 1.5, stopLoss: a.c * 0.5, riskRewardRatio: 1,
    optionType: null, strikePrice: null, expiryDate: null, entryPremium: null, exitPremium: null, optionPercentGain: null,
    exitPrice: b.c, percentGain: null, outcomeStatus: 'closed', resolutionReason: null, exitDate: new Date(b.t + 60_000).toISOString(),
    timestamp: new Date(a.t).toISOString(), source: 'self', catalyst: null, genConvictionBand: null, exitTimeSource: 'deadline',
    highestPriceReached: null, lowestPriceReached: null, dataSourceUsed: null, sessionContext: null,
    outcomeNotes: null, exitBy: null, holdingPeriod: 'swing', triggerObservedAt: null, triggerObservedPrice: null, realizedPnLColumn: null, status: 'published',
    ...over,
  } as IdeaRow);
  const run = async (i: IdeaRow) => {
    const m = mapDeskIdea(i);
    if (!('row' in m)) throw new Error(`self-test: not scored: ${m.excluded}`);
    const base = { id: i.id, symbol: i.symbol, source: i.source, assetType: i.assetType, direction: i.direction, optionType: null, strike: null, expiry: null,
      publishedAt: i.timestamp, exitAt: m.row.exitTime ?? null, exitDayET: null, outcomeStatus: i.outcomeStatus, recordedEntry: m.row.entryPrice,
      recordedExit: m.row.exitPrice ?? null, recordedPnL: m.row.realizedPnL!, integrity: [], duplicateOf: null, evidence: {} as Record<string, unknown> };
    return verifyStock(i, m.row, base);
  };
  const good = await run(mk({}));
  const fake = await run(mk({ exitPrice: b.c * 10 }));
  const never = await run(mk({ entryPrice: Math.min(...rb.map((x) => x.l)) * 0.5, stopLoss: 0.01, targetPrice: 1e9 }));
  console.log(`self-test ${sym} via ${source}:`);
  console.log(`  real exit         → ${good.verdict} (${good.reason})`);
  console.log(`  exit ×10          → ${fake.verdict} ${fake.bugClass} recorded ${fake.recordedPnL} recomputed ${fake.recomputedPnL}`);
  console.log(`  entry never traded→ ${never.verdict} ${never.bugClass}`);
  const pass = good.verdict === 'VERIFIED' && fake.verdict === 'MISMATCH' && never.verdict === 'MISMATCH' && never.bugClass === 'never_triggered';
  console.log(pass ? 'self-test PASSED' : 'self-test FAILED');
  process.exit(pass ? 0 : 1);
}

(argv.includes('--self-test') ? selfTest() : main()).catch((e) => { console.error(e); process.exit(1); });
