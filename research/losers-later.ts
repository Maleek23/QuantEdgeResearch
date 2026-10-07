/**
 * LOSERS LATER — did NEXUS's losing trades end up green after we closed them?
 *
 * Operator (2026-10-06): "there's no way we didn't win more Monday — why does
 * NEXUS have a lot of losing trades, did those losing trades end up green later?"
 *
 * For every NEXUS idea in the window that CLOSED AS A LOSS (book P&L < 0, or a
 * stop-out without a measured P&L), on real bars:
 *   (a) did price later reach T1 (when) — "stopped, then would have won"
 *   (b) best favourable move after the close, inside the holding window and by Friday's close
 *   (c) options: the contract's premium path after the close (Alpaca option bars by OCC, Yahoo OPR fallback)
 *   (d) stop width in % and in daily ATR(14) vs the adverse excursion the trade had to survive
 *   (e) entry timing (ET time of day, opening gap, pre-market publish), engine, direction vs SPY's day
 * Rule candidates (wider ATR stops, close-based stop, time-only stop, re-entry after a
 * shake-out) are replayed on EVERY triggered closed idea — winners included — and labelled
 * MEASURING with their n. Monday (--focus) gets every published idea, outcome, book P&L,
 * winners vs losers by engine, and the "missed winners".
 *
 * Pure logic: research/losers-later-core.ts (tests: scripts/test-losers-later.ts).
 * Bar fetching mirrors research/verify-nexus-book.ts (same sources, same cache key
 * formats, same cache dir /tmp/nexus-verify-cache — that script runs main() on import,
 * so its helpers are mirrored here rather than imported). The verifier's ledger
 * (/tmp/nexus-book-verify.json) is read to skip rows it found UNVERIFIABLE or whose
 * recorded outcome is invalid (never_triggered, premium-scale, synthetic …).
 *
 * READ-ONLY: one `BEGIN TRANSACTION READ ONLY` SELECT, then ROLLBACK.
 *
 * Run on the droplet:
 *   set -a && . ./.env && set +a && NODE_ENV=production npx tsx research/losers-later.ts --since 2026-09-29 --focus 2026-10-05 --out /tmp/losers-later.json
 * Options:
 *   --since YYYY-MM-DD   window start (published since; default 2026-09-29)
 *   --focus YYYY-MM-DD   the day to break down idea-by-idea (default 2026-10-05)
 *   --out file.json      default /tmp/losers-later.json
 *   --md file.md         default research/results/LOSERS_LATER_<focus>.md
 *   --ledger file.json   verifier ledger (default /tmp/nexus-book-verify.json; missing → no ledger skips)
 *   --cache DIR          default /tmp/nexus-verify-cache
 *   --throttle MS        default 350
 *   --offline            cache only, no network
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { mapDeskIdea, type DeskIdea } from '../server/journal-row-maps';
import { readPlanSnapshot } from '../shared/plan-snapshot';
import { resolveTrigger, simulateExit } from '../shared/run-up';
import { isOptionScaleIncoherent } from '../shared/option-unit-guard';
import { optionSideOf } from '../shared/option-value-bounds';
import { optionExpiryCloseMs } from '../shared/option-expiry';
import { horizonTradingDays, addTradingMinutes } from '../shared/loss-rules';
import { isSyntheticOutcome } from '../shared/model-record';
import {
  type Bar, type Dir, type RuleId, type GroupRow, type RuleRow, type MondayIdeaRow, type MarkdownInput,
  isLoss, closeKind, firstStopBar, afterClose, stopGeometry, isNoiseStop, todBucket, gapPct, dayDirection, alignment,
  atrBefore, RULES, RULE_LABEL, replayRule, ruleStats, measuringLabel, median, pct, fridayOf, renderMarkdown, toRunUp,
  type AfterClose, type StopGeometry,
} from './losers-later-core';

// ─── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const SINCE = arg('--since') ?? '2026-09-29';
const FOCUS = arg('--focus') ?? '2026-10-05';
const OUT = arg('--out') ?? '/tmp/losers-later.json';
const MD = arg('--md') ?? `research/results/LOSERS_LATER_${FOCUS}.md`;
const LEDGER = arg('--ledger') ?? '/tmp/nexus-book-verify.json';
const CACHE = arg('--cache') ?? '/tmp/nexus-verify-cache';
const THROTTLE = Number(arg('--throttle') ?? 350);
const OFFLINE = argv.includes('--offline');

// ─── utils (as research/verify-nexus-book.ts) ────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r2 = (x: number) => Math.round(x * 100) / 100;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const iso = (ms: number | null | undefined) => (fin(ms) ? new Date(ms).toISOString() : null);
const etFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function et(ms: number) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute), hhmm: `${p.hour}:${p.minute}` };
}
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
const rth = (b: Bar) => { const m = et(b.t).min; return m >= 570 && m < 960; };
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ─── cached, throttled HTTP (same cache dir + key style as the verifier) ──
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
    if (o != null && h != null && l != null && c != null && h > 0) out.push({ t: ts[i] * 1000, o, h, l, c });
  }
  return out;
}
const alpacaHeaders = () => ({ 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!, 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' });

const NOW = Date.now();
const WIN_FROM = Date.parse(`${SINCE}T00:00:00Z`) - 3 * 86400_000;
const WIN_TO = NOW;

/** One 5-minute series per symbol for the whole window (Yahoo; Alpaca IEX fallback). RTH only for equities. */
const intradayMemo = new Map<string, { bars: Bar[]; source: string }>();
async function intraday(symbol: string, assetType: string): Promise<{ bars: Bar[]; source: string }> {
  const ys = yahooSymbol(symbol, assetType === 'option' ? 'stock' : assetType);
  if (intradayMemo.has(ys)) return intradayMemo.get(ys)!;
  const p1 = Math.floor(WIN_FROM / 1000), p2 = Math.floor(WIN_TO / 1000);
  const j = await cachedJson(`y5m_${ys}_${dayKey(WIN_FROM)}_${dayKey(WIN_TO)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${p1}&period2=${p2}&interval=5m&includePrePost=${assetType === 'crypto' ? 'true' : 'false'}`);
  let bars = parseYahoo(j);
  let source = `yahoo:${ys}:5m`;
  if (!bars.length && assetType !== 'crypto' && !YAHOO_INDEX[symbol.toUpperCase()] && process.env.ALPACA_API_KEY) {
    const a = await cachedJson(`a5m_${symbol}_${dayKey(WIN_FROM)}_${dayKey(WIN_TO)}`,
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol.toUpperCase())}/bars?timeframe=5Min&start=${new Date(WIN_FROM).toISOString()}&end=${new Date(WIN_TO - 16 * 60_000).toISOString()}&limit=10000&feed=iex&adjustment=raw`,
      alpacaHeaders());
    bars = ((a?.bars ?? []) as any[]).map((b) => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c })).filter((b) => fin(b.t) && b.h > 0);
    source = `alpaca:${symbol}:5Min(iex)`;
  }
  bars.sort((a, b) => a.t - b.t);
  if (assetType !== 'crypto') bars = bars.filter(rth);
  const out = { bars, source };
  intradayMemo.set(ys, out);
  return out;
}

/** Daily bars [window − 60d, now] for ATR(14), gaps and SPY's day. */
const dailyMemo = new Map<string, { day: string; o: number; h: number; l: number; c: number }[]>();
async function daily(symbol: string, assetType: string) {
  const ys = yahooSymbol(symbol, assetType === 'option' ? 'stock' : assetType);
  if (dailyMemo.has(ys)) return dailyMemo.get(ys)!;
  const from = WIN_FROM - 60 * 86400_000;
  const j = await cachedJson(`y1d_${ys}_${dayKey(from)}_${dayKey(WIN_TO)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${Math.floor(from / 1000)}&period2=${Math.floor(WIN_TO / 1000)}&interval=1d`);
  const out = parseYahoo(j).map((b) => ({ day: et(b.t + 6 * 3600_000).day, o: b.o, h: b.h, l: b.l, c: b.c }));
  dailyMemo.set(ys, out);
  return out;
}

function occOf(root: string, day: string, side: 'call' | 'put', strike: number): string {
  return `${root}${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}${side === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}
function occRoots(symbol: string): string[] {
  const s = symbol.toUpperCase();
  return s === 'SPX' ? ['SPXW', 'SPX'] : s === 'NDX' ? ['NDXP', 'NDX'] : s === 'RUT' ? ['RUTW', 'RUT'] : s === 'VIX' ? ['VIXW', 'VIX'] : [s];
}
async function optionBars(occ: string, fromMs: number, toMs: number): Promise<{ bars: Bar[]; source: string }> {
  const end = Math.min(toMs, NOW - 16 * 60_000);
  if (process.env.ALPACA_API_KEY && end > fromMs) {
    const out: Bar[] = [];
    let token: string | null = null;
    for (let page = 0; page < 5; page++) {
      const qs = new URLSearchParams({ symbols: occ, timeframe: '1Min', start: new Date(fromMs).toISOString(), end: new Date(end).toISOString(), limit: '10000' });
      if (token) qs.set('page_token', token);
      const j = await cachedJson(`ao1m_${occ}_${fromMs}_${end}_${page}`, `https://data.alpaca.markets/v1beta1/options/bars?${qs}`, alpacaHeaders());
      for (const b of j?.bars?.[occ] ?? []) {
        const t = Date.parse(b?.t);
        if (fin(t) && fin(b?.o) && fin(b?.h) && fin(b?.l) && fin(b?.c)) out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c });
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
    const bars = parseYahoo(j);
    if (bars.length) return { bars, source: `yahoo-opr:${occ}:${interval}` };
  }
  return { bars: [], source: 'none' };
}
const widthOf = (bars: Bar[]) => {
  const ds = bars.slice(1, 50).map((b, i) => b.t - bars[i].t).filter((d) => d > 0).sort((a, b) => a - b);
  return ds[0] ?? 5 * 60_000;
};

// ─── the book (read-only) ────────────────────────────────────
interface Row extends DeskIdea {
  entryValidUntil: string | null; triggerObservedAt: string | null; executionState: string | null; csj: any;
}
async function loadIdeas(): Promise<Row[]> {
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
             session_context, exit_by, holding_period, entry_valid_until, gen_conviction_band,
             substring(outcome_notes from '\\[exit-time:([a-z_]+)\\]') AS exit_time_source,
             substring(outcome_notes from '\\[exit-premium:(touch_bar|pass|withheld)\\]') AS exit_premium_basis,
             json_build_object(
               'planSnapshot', (convergence_signals_json)::jsonb -> 'planSnapshot',
               'executionAudit', (convergence_signals_json)::jsonb -> 'executionAudit') AS csj,
             (convergence_signals_json)::jsonb -> 'nexusGradeAtPublish' AS nexus_grade
      FROM trade_ideas
      WHERE timestamp >= $1 AND status <> 'draft' AND (exclude_from_training = false OR exclude_from_training IS NULL)
      ORDER BY timestamp`, [SINCE]);
    return rows.map((x: any) => ({
      id: x.id, symbol: x.symbol, assetType: x.asset_type, direction: x.direction, entryPrice: Number(x.entry_price),
      targetPrice: num(x.target_price), stopLoss: num(x.stop_loss), riskRewardRatio: num(x.risk_reward_ratio), optionType: x.option_type,
      strikePrice: num(x.strike_price), expiryDate: x.expiry_date, entryPremium: num(x.entry_premium), exitPremium: num(x.exit_premium),
      exitPremiumBasis: x.exit_premium_basis ?? null,
      optionPercentGain: num(x.option_percent_gain), exitPrice: num(x.exit_price), percentGain: num(x.percent_gain),
      outcomeStatus: x.outcome_status, resolutionReason: x.resolution_reason, exitDate: x.exit_date, timestamp: x.timestamp,
      source: x.source, catalyst: x.catalyst, genConvictionBand: x.gen_conviction_band ?? null, exitTimeSource: x.exit_time_source,
      highestPriceReached: num(x.highest_price_reached), lowestPriceReached: num(x.lowest_price_reached),
      executionState: x.csj?.executionAudit?.state ?? null, dataSourceUsed: x.data_source_used, sessionContext: x.session_context,
      outcomeNotes: x.outcome_notes, exitBy: x.exit_by, holdingPeriod: x.holding_period, entryValidUntil: x.entry_valid_until,
      triggerObservedAt: x.csj?.executionAudit?.triggerObservedAt ?? null, convergenceSignalsJson: x.csj, csj: x.csj,
      nexusGradeAtPublish: x.nexus_grade ?? null,
    }));
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

/** Verifier verdicts that make the recorded outcome itself unusable. */
const INVALID_OUTCOME = new Set(['never_triggered', 'premium_scale_ladder', 'synthetic_or_retroactive', 'impossible_exit_premium',
  'impossible_entry_premium', 'fill_off_strike_scale', 'exit_premium_not_traded', 'entry_premium_not_traded']);
function loadLedger(): Map<string, { verdict: string; bugClass: string | null }> {
  const m = new Map<string, { verdict: string; bugClass: string | null }>();
  try {
    const j = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    for (const t of j?.trades ?? []) m.set(String(t.id), { verdict: t.verdict, bugClass: t.bugClass ?? null });
  } catch { /* no ledger → no skips */ }
  return m;
}

// ─── per-idea analysis ───────────────────────────────────────
interface Analysed {
  id: string; symbol: string; engine: string; assetType: string; direction: string; dir: Dir; vehicle: string;
  publishedAt: string; publishedEt: string; holdingPeriod: string | null; outcomeStatus: string | null; resolutionReason: string | null;
  closeKind: string; bookPnl: number | null; bookExcluded: string | null; ledger: string | null;
  plan: { entry: number; target: number | null; stop: number };
  triggerAt: string | null; triggerSource: string | null; closeAt: string | null; holdEndAt: string; weekEndAt: string;
  context: { triggerEt: string | null; tod: string | null; premarketPublish: boolean; gapPct: number | null; gapVsTrade: string | null; spyDay: string | null; spyVsTrade: string | null; atrD: number | null };
  after: AfterClose | null; stopGeo: StopGeometry | null; noiseStop: boolean;
  option: null | { occ: string; source: string; entryPremium: number | null; premiumAtClose: number | null; maxAfterInHold: number | null; maxAfterByWeek: number | null; lastInHold: number | null; maxAfterPctVsEntry: number | null; laterAboveEntryPremium: boolean | null };
  rules: Partial<Record<RuleId, { reason: string; pct: number | null }>>;
  isLoser: boolean; skipped: string | null;
  monday?: { triggered: boolean | null; missedWinner: string | null };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (set -a && . ./.env && set +a)');
  console.log(`[losers-later] since ${SINCE} · focus ${FOCUS} · cache ${CACHE} · ledger ${LEDGER}${OFFLINE ? ' · OFFLINE' : ''}`);
  const ideas = await loadIdeas();
  const ledger = loadLedger();
  console.log(`  ${ideas.length} ideas read (read-only txn, rolled back) · ledger rows ${ledger.size}`);
  const spyDaily = await daily('SPY', 'stock');
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1; return k; };
  const results: Analysed[] = [];
  let dataEnd = 0;
  let k = 0;

  for (const i of ideas) {
    k++;
    const pubMs = Date.parse(i.timestamp);
    const pubEt = et(pubMs);
    const isFocus = pubEt.day === FOCUS;
    const snap = readPlanSnapshot(i.convergenceSignalsJson);
    const entry = snap?.entryPrice ?? i.entryPrice;
    const target = snap?.targetPrice ?? i.targetPrice;
    const stop = snap?.stopLoss ?? i.stopLoss;
    const direction = snap?.direction ?? i.direction;
    const option = i.assetType === 'option';
    const optType = snap?.optionType ?? i.optionType;
    const strike = snap?.strikePrice ?? i.strikePrice;
    const expiry = snap?.expiryDate ?? i.expiryDate;
    // underlying direction: a bought put is short the underlying
    const dir: Dir = option ? (optionSideOf(optType) === 'put' ? 'short' : 'long') : direction === 'short' ? 'short' : 'long';
    const mapped = mapDeskIdea(i);
    const row = 'row' in mapped ? mapped.row : null;
    const status = String(i.outcomeStatus ?? 'open').toLowerCase();
    const resolved = status !== 'open' && status !== '';
    const bookPnl = row?.status === 'closed' ? row.realizedPnL ?? null : null;
    const fallbackPnl = !row && resolved ? (option ? i.optionPercentGain : i.percentGain) : null;
    const loser = resolved && isLoss(status, bookPnl ?? fallbackPnl);
    const lg = ledger.get(i.id) ?? null;
    const base: Analysed = {
      id: i.id, symbol: i.symbol, engine: i.source ?? 'unknown', assetType: i.assetType, direction, dir,
      vehicle: option ? `${strike ?? '?'}${optionSideOf(optType) === 'put' ? 'P' : 'C'} ${expiryDay(expiry) ?? ''}`.trim() : i.assetType,
      publishedAt: i.timestamp, publishedEt: `${pubEt.day} ${pubEt.hhmm}`, holdingPeriod: i.holdingPeriod ?? null,
      outcomeStatus: i.outcomeStatus, resolutionReason: i.resolutionReason, closeKind: closeKind(status, i.resolutionReason),
      bookPnl, bookExcluded: 'excluded' in mapped ? mapped.excluded : null, ledger: lg ? `${lg.verdict}${lg.bugClass ? `:${lg.bugClass}` : ''}` : null,
      plan: { entry, target, stop: stop ?? NaN }, triggerAt: null, triggerSource: null, closeAt: null, holdEndAt: '', weekEndAt: '',
      context: { triggerEt: null, tod: null, premarketPublish: pubEt.min < 570, gapPct: null, gapVsTrade: null, spyDay: null, spyVsTrade: null, atrD: null },
      after: null, stopGeo: null, noiseStop: false, option: null, rules: {}, isLoser: loser, skipped: null,
    };
    const done = (why: string | null) => { base.skipped = why ? skip(why) : null; results.push(base); };
    if (!resolved && !isFocus) continue; // open ideas only matter for the Monday list
    if (!(entry > 0) || !fin(stop) || !(stop > 0)) { done('no_levels'); continue; }
    if (isSyntheticOutcome(i)) { done('synthetic'); continue; }
    if (isOptionScaleIncoherent({ assetType: i.assetType, entryPrice: entry, strikePrice: strike })) { done('option_levels_on_premium_scale'); continue; }
    if (lg && (lg.verdict === 'UNVERIFIABLE' || (lg.bugClass && INVALID_OUTCOME.has(lg.bugClass))) ) { done(`ledger_${lg.verdict}${lg.bugClass ? `:${lg.bugClass}` : ''}`); continue; }

    const { bars } = await intraday(i.symbol, i.assetType);
    if (!bars.length) { done('no_underlying_bars'); continue; }
    dataEnd = Math.max(dataEnd, bars[bars.length - 1].t + widthOf(bars));
    // price-scale sanity vs the real tape: entry > 25% off the first bar after publish = not an underlying level
    const ref = bars.find((b) => b.t >= pubMs) ?? bars[bars.length - 1];
    if (Math.abs(entry / ref.c - 1) > 0.25) { done('entry_off_underlying_>25%'); continue; }

    const exitMs = i.exitDate ? Date.parse(i.exitDate) : NaN;
    const ri = { id: i.id, symbol: i.symbol, entryPrice: entry, stopLoss: stop, timestamp: i.timestamp, entryValidUntil: i.entryValidUntil, convergenceSignalsJson: i.csj };
    const searchEnd = resolved && fin(exitMs) ? exitMs + 1 : NOW;
    const trig = resolveTrigger(ri as any, bars.map(toRunUp), searchEnd);
    const triggerMs = trig?.ms ?? null;
    base.triggerAt = iso(triggerMs); base.triggerSource = trig?.source ?? null;
    const anchor = triggerMs ?? pubMs;
    const days = horizonTradingDays({ holdingPeriod: i.holdingPeriod, expiryDate: option ? expiry : null, publishedMs: pubMs });
    let holdEnd = addTradingMinutes(anchor, days * 390);
    const exitBy = i.exitBy ? Date.parse(i.exitBy) : NaN;
    if (fin(exitBy) && exitBy > anchor) holdEnd = exitBy;
    const expClose = option ? optionExpiryCloseMs(expiry) : NaN;
    if (fin(expClose)) holdEnd = Math.min(holdEnd, expClose);
    const weekEnd = nyWall(fridayOf(et(anchor).day), 960);
    base.holdEndAt = iso(holdEnd)!; base.weekEndAt = iso(weekEnd)!;
    const dataEndMs = Math.min(NOW - 16 * 60_000, bars[bars.length - 1].t + widthOf(bars));

    // context
    const dl = await daily(i.symbol, i.assetType);
    const trigDay = et(anchor).day;
    const atrD = atrBefore(dl, trigDay);
    const today = dl.find((d) => d.day === trigDay) ?? null;
    const prev = [...dl].reverse().find((d) => d.day < trigDay) ?? null;
    const gp = gapPct(prev?.c ?? null, today?.o ?? null);
    const spyT = spyDaily.find((d) => d.day === trigDay) ?? null;
    const spyDir = dayDirection(spyT?.o ?? null, spyT?.c ?? null);
    base.context = {
      triggerEt: triggerMs ? et(triggerMs).hhmm : null, tod: triggerMs ? todBucket(et(triggerMs).min) : null,
      premarketPublish: pubEt.min < 570 || pubEt.day < trigDay, gapPct: gp,
      gapVsTrade: gp == null ? null : Math.abs(gp) < 0.3 ? 'flat' : (gp > 0) === (dir === 'long') ? 'with' : 'against',
      spyDay: spyDir, spyVsTrade: alignment(dir, spyDir), atrD: atrD == null ? null : r2(atrD),
    };

    // Monday-only: untriggered ideas → would they have won?
    if (isFocus) {
      let missed: string | null = null;
      if (triggerMs == null && target != null) {
        const path = bars.filter((b) => b.t >= pubMs && b.t < holdEnd);
        const t1 = path.find((b) => (dir === 'long' ? b.h >= target : b.l <= target));
        if (t1) missed = 'ran to T1 without touching entry';
        const mk = path[0];
        if (mk) {
          const x = simulateExit('actual', { direction: dir, entry: mk.o, stop, target, triggerMs: mk.t, horizonEndMs: holdEnd, bars: bars.map(toRunUp), horizonComplete: dataEndMs >= holdEnd });
          if (x.reason === 'target') missed = missed ? `${missed}; market fill at publish → T1` : 'market fill at publish → T1 before stop';
        }
      }
      base.monday = { triggered: triggerMs != null, missedWinner: missed };
    }
    if (triggerMs == null) { done(resolved ? 'closed_but_no_trigger_on_bars' : null); continue; }

    // rule replays — every triggered CLOSED idea (winners included)
    if (resolved && target != null) {
      for (const rule of RULES) {
        const x = replayRule(rule, { dir, entry, stop, target, atrD, triggerMs, holdEndMs: holdEnd, holdComplete: dataEndMs >= holdEnd, bars });
        base.rules[rule] = { reason: x.reason, pct: x.pct };
      }
    }

    if (resolved && (loser || (isFocus && status !== 'hit_target'))) {
      // close time: the stop bar's END for a stop-out, else the recorded exit
      let closeMs = fin(exitMs) ? exitMs : NaN;
      if (base.closeKind === 'stop') {
        const sb = firstStopBar(bars, dir, stop, triggerMs, fin(exitMs) ? exitMs + widthOf(bars) : holdEnd);
        if (sb) closeMs = sb.t + widthOf(bars);
      }
      if (!fin(closeMs)) { done('no_close_time'); continue; }
      base.closeAt = iso(closeMs);
      base.after = afterClose({ dir, entry, stop, target, closeMs, holdEndMs: holdEnd, weekEndMs: weekEnd, dataEndMs, bars });
      const until = base.after.t1HitInHold ? base.after.t1AtMs! : holdEnd;
      base.stopGeo = stopGeometry({ dir, entry, stop, atrD, bars, triggerMs, untilMs: until });
      base.noiseStop = isNoiseStop(base.after, base.stopGeo);
      if (isFocus && !base.monday?.missedWinner && base.after.t1HitInHold) base.monday = { triggered: true, missedWinner: `closed (${base.closeKind}) then hit T1 ${base.after.minutesToT1}m later` };

      // (c) option premium path after the close
      const day = expiryDay(expiry);
      if (option && day && fin(strike) && strike > 0) {
        const side = optionSideOf(optType);
        let ob: { bars: Bar[]; source: string } = { bars: [], source: 'none' }; let occ = '';
        const endMs = Math.min(fin(expClose) ? expClose : weekEnd, Math.max(holdEnd, weekEnd));
        for (const root of occRoots(i.symbol)) {
          occ = occOf(root, day, side, strike);
          ob = await optionBars(occ, closeMs - 30 * 60_000, endMs);
          if (ob.bars.length) break;
        }
        const ent = row?.entryPrice ?? i.entryPremium ?? null;
        const atClose = [...ob.bars].reverse().find((b) => b.t <= closeMs) ?? ob.bars.find((b) => b.t >= closeMs) ?? null;
        const afterB = ob.bars.filter((b) => b.t >= closeMs);
        const inHold = afterB.filter((b) => b.t < holdEnd);
        const maxH = inHold.length ? Math.max(...inHold.map((b) => b.h)) : null;
        const maxW = afterB.length ? Math.max(...afterB.map((b) => b.h)) : null;
        base.option = {
          occ, source: ob.source, entryPremium: ent, premiumAtClose: atClose?.c ?? null, maxAfterInHold: maxH, maxAfterByWeek: maxW,
          lastInHold: inHold.length ? inHold[inHold.length - 1].c : null,
          maxAfterPctVsEntry: ent && maxH != null ? r2(((maxH - ent) / ent) * 100) : null,
          laterAboveEntryPremium: ent && maxH != null ? maxH > ent : null,
        };
      }
    }
    done(null);
    if (k % 25 === 0) console.log(`  ${k}/${ideas.length} · net ${netCalls} · cache ${cacheHits}`);
  }

  // ─── aggregate ──────────────────────────────────────────────
  const losers = results.filter((r) => r.isLoser);
  const A = losers.filter((r) => r.after && r.stopGeo);
  const groupBy = (key: (r: Analysed) => string | null): GroupRow[] => {
    const m = new Map<string, Analysed[]>();
    for (const r of A) { const g = key(r) ?? 'unknown'; m.set(g, [...(m.get(g) ?? []), r]); }
    return [...m.entries()].map(([g, rs]) => ({
      key: g, n: rs.length, laterT1: rs.filter((r) => r.after!.t1HitInHold).length, laterT1Pct: pct(rs.filter((r) => r.after!.t1HitInHold).length, rs.length),
      medianStopAtr: median(rs.map((r) => r.stopGeo!.stopAtr)), medianStopPct: median(rs.map((r) => r.stopGeo!.stopPct)),
      medianMaeOverStop: median(rs.map((r) => r.stopGeo!.maeOverStop)), noise: rs.filter((r) => r.noiseStop).length,
    })).sort((a, b) => b.n - a.n);
  };
  const t1H = A.filter((r) => r.after!.t1HitInHold);
  const hc = A.filter((r) => r.after!.holdComplete && r.after!.greenAtHoldEnd != null);
  const optL = A.filter((r) => r.option && r.option.laterAboveEntryPremium != null);

  // rules: paired with plan on the same ideas
  const ruled = results.filter((r) => r.rules.plan && r.rules.plan.pct != null);
  const rules: RuleRow[] = RULES.map((rule) => {
    const pairs = ruled.filter((r) => r.rules[rule]?.pct != null);
    const st = ruleStats(pairs.map((r) => r.rules[rule]!.pct!));
    const pl = ruleStats(pairs.map((r) => r.rules.plan!.pct!));
    let extra: string | undefined;
    if (rule === 'reentry') {
      const re = pairs.filter((r) => r.rules.reentry!.reason.startsWith('stop+reentry'));
      const legs = re.map((r) => r.rules.reentry!.pct! - r.rules.plan!.pct!);
      extra = `re-entries taken ${re.length} of ${pairs.filter((r) => r.rules.plan!.reason === 'stop').length} stop-outs; re-entry legs won ${legs.filter((x) => x > 0).length}, Σ ${r2(legs.reduce((s, x) => s + x, 0))}% (${measuringLabel(re.length)})`;
    }
    const noAtr = ruled.filter((r) => r.rules[rule]?.reason === 'no_atr').length;
    if (noAtr) extra = `${extra ? `${extra}; ` : ''}${noAtr} ideas without a daily ATR were not replayed`;
    return {
      rule, label: RULE_LABEL[rule], stats: st, plan: pl, measuring: measuringLabel(st.n), extra,
      deltaPnl1000: st.pnl1000 != null && pl.pnl1000 != null ? r2(st.pnl1000 - pl.pnl1000) : null,
      deltaWinRate: st.winRate != null && pl.winRate != null ? Math.round((st.winRate - pl.winRate) * 10) / 10 : null,
    };
  });

  // Monday
  const mon = results.filter((r) => r.publishedEt.startsWith(FOCUS));
  const monClosed = mon.filter((r) => r.bookPnl != null);
  const engines = [...new Set(mon.map((r) => r.engine))];
  const untrig = (r: Analysed) => r.monday?.triggered === false || (r.outcomeStatus === 'open' && r.triggerAt == null);
  const monday: MarkdownInput['monday'] = {
    published: mon.length,
    triggered: mon.filter((r) => r.triggerAt != null).length,
    closed: monClosed.length,
    wins: monClosed.filter((r) => r.bookPnl! > 0).length,
    losses: monClosed.filter((r) => r.bookPnl! < 0).length,
    flat: monClosed.filter((r) => r.bookPnl === 0).length,
    open: mon.filter((r) => String(r.outcomeStatus ?? 'open') === 'open' && r.triggerAt != null).length,
    untriggered: mon.filter(untrig).length,
    bookPnl: r2(monClosed.reduce((s, r) => s + r.bookPnl!, 0)),
    byEngine: engines.map((e) => {
      const rs = mon.filter((r) => r.engine === e); const c = rs.filter((r) => r.bookPnl != null);
      return { engine: e, published: rs.length, closed: c.length, wins: c.filter((r) => r.bookPnl! > 0).length, losses: c.filter((r) => r.bookPnl! < 0).length,
        open: rs.filter((r) => String(r.outcomeStatus ?? 'open') === 'open' && r.triggerAt != null).length, untriggered: rs.filter(untrig).length,
        pnl: r2(c.reduce((s, r) => s + r.bookPnl!, 0)) };
    }).sort((a, b) => b.published - a.published),
    missed: {
      closedThenT1: mon.filter((r) => r.monday?.missedWinner?.startsWith('closed')).length,
      ranWithoutFill: mon.filter((r) => r.monday?.missedWinner?.includes('without touching entry')).length,
      wouldHaveWonAtMarket: mon.filter((r) => r.monday?.missedWinner?.includes('market fill')).length,
    },
    ideas: mon.map((r): MondayIdeaRow => ({
      id: r.id, symbol: r.symbol, engine: r.engine, direction: r.direction, vehicle: r.vehicle, publishedEt: r.publishedEt.slice(11),
      triggered: r.monday?.triggered ?? (r.triggerAt != null ? true : null), outcome: r.outcomeStatus ?? 'open', pnl: r.bookPnl,
      bookExcluded: r.bookExcluded, missedWinner: r.monday?.missedWinner ?? (r.skipped ? `n/a (${r.skipped})` : null),
    })),
  };

  const stopAtrBand = (r: Analysed) => { const x = r.stopGeo!.stopAtr; return x == null ? 'no ATR' : x < 0.5 ? '< 0.5× ATR' : x < 1 ? '0.5–1× ATR' : x < 1.5 ? '1–1.5× ATR' : '≥ 1.5× ATR'; };
  const md: MarkdownInput = {
    generatedAt: new Date().toISOString(), since: SINCE, focus: FOCUS, dataThrough: iso(dataEnd) ?? '—',
    population: { ideas: ideas.length, closed: results.filter((r) => r.bookPnl != null).length, losers: losers.length, analysed: A.length, skipped },
    headline: {
      laterT1InHold: t1H.length, laterT1InHoldPct: pct(t1H.length, A.length),
      laterT1ByWeek: A.filter((r) => r.after!.t1HitByWeekEnd).length, laterT1ByWeekPct: pct(A.filter((r) => r.after!.t1HitByWeekEnd).length, A.length),
      reclaimedEntry: A.filter((r) => r.after!.reclaimedEntryInHold).length, reclaimedEntryPct: pct(A.filter((r) => r.after!.reclaimedEntryInHold).length, A.length),
      greenAtHoldEnd: hc.filter((r) => r.after!.greenAtHoldEnd).length, greenAtHoldEndPct: pct(hc.filter((r) => r.after!.greenAtHoldEnd).length, hc.length), holdComplete: hc.length,
      noise: A.filter((r) => r.noiseStop).length, noisePct: pct(A.filter((r) => r.noiseStop).length, A.length),
      medianStopPct: median(A.map((r) => r.stopGeo!.stopPct)), medianStopAtr: median(A.map((r) => r.stopGeo!.stopAtr)),
      medianMaeOverStopLaterT1: median(t1H.map((r) => r.stopGeo!.maeOverStop)),
      medianMaeOverStopOthers: median(A.filter((r) => !r.after!.t1HitInHold).map((r) => r.stopGeo!.maeOverStop)),
      optionLosers: optL.length, optionLaterAboveEntryPremium: optL.filter((r) => r.option!.laterAboveEntryPremium).length,
      optionLaterAboveEntryPremiumPct: pct(optL.filter((r) => r.option!.laterAboveEntryPremium).length, optL.length),
    },
    byEngine: groupBy((r) => r.engine), byCloseKind: groupBy((r) => r.closeKind), byHolding: groupBy((r) => r.holdingPeriod),
    byTod: groupBy((r) => r.context.tod), bySpy: groupBy((r) => r.context.spyVsTrade ? `${r.context.spyVsTrade} SPY (${r.context.spyDay})` : null),
    byGap: groupBy((r) => `${r.context.gapVsTrade ? `gap ${r.context.gapVsTrade} trade` : 'gap unknown'}${r.context.premarketPublish ? ' · pre-market publish' : ''}`),
    byStopAtr: groupBy(stopAtrBand), rules, monday,
  };

  const json = {
    generatedAt: md.generatedAt, script: 'research/losers-later.ts', args: { since: SINCE, focus: FOCUS, ledger: LEDGER, cache: CACHE },
    dataThrough: md.dataThrough, summary: { population: md.population, headline: md.headline, rules, byEngine: md.byEngine, byCloseKind: md.byCloseKind },
    monday, losers: losers.map((r) => ({ ...r, rules: undefined })), allAnalysed: results, network: { calls: netCalls, cacheHits },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(json, null, 1));
  fs.mkdirSync(path.dirname(MD), { recursive: true });
  fs.writeFileSync(MD, renderMarkdown(md));

  const h = md.headline;
  console.log(`\n=== losers later (since ${SINCE}, bars through ${md.dataThrough}) ===`);
  console.log(`losers ${losers.length} · analysed ${A.length} · skipped ${JSON.stringify(skipped)}`);
  console.log(`later hit T1 in hold ${h.laterT1InHold} (${h.laterT1InHoldPct}%) · by Friday ${h.laterT1ByWeek} (${h.laterT1ByWeekPct}%) · back to entry ${h.reclaimedEntry} (${h.reclaimedEntryPct}%) · noise stops ${h.noise}`);
  console.log(`median stop ${h.medianStopPct}% = ${h.medianStopAtr}× ATR · MAE÷stop later-T1 ${h.medianMaeOverStopLaterT1}× vs others ${h.medianMaeOverStopOthers}×`);
  console.log('\nrules (paired with plan on the same ideas):');
  for (const r of rules) console.log(`  ${r.rule.padEnd(11)} n=${String(r.stats.n).padStart(3)} win ${String(r.stats.winRate ?? '—').padStart(5)}% $${r.stats.pnl1000 ?? '—'} (Δ ${r.deltaPnl1000 ?? '—'})  ${r.measuring}`);
  console.log(`\nMonday ${FOCUS}: published ${monday.published} · closed ${monday.closed} (W${monday.wins}/L${monday.losses}) · book ${monday.bookPnl} · missed winners ${JSON.stringify(monday.missed)}`);
  console.log(`\nwrote ${OUT} and ${MD} (read-only; nothing written to the database) · net ${netCalls} · cache ${cacheHits}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
