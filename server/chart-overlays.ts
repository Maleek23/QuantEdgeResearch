/**
 * CHART OVERLAYS — the data behind the CHART tab's GEX bubbles, dark-pool
 * levels and flow markers (the Bullflow-style chart).
 *
 * Three layers, each stamped with where it came from and how old it is:
 *
 *   GEX TIMELINE  Per-strike GEX through the session. Nobody sells us this as a
 *                 history, so we RECORD it: every 5 min in the session window
 *                 the watched set (SPY/QQQ/SPX/IWM + anything charted in the
 *                 last 2h) is snapshotted from the same chain path the GEX
 *                 terminal uses, and the top-20 strikes by |GEX| are kept.
 *                 In memory + one JSON file per symbol per ET date on disk, so
 *                 a restart keeps the day. The hourly gex_snapshots archive
 *                 fills hours we did not record, labelled 'archive-hourly'.
 *                 If recording started at 10:05, the timeline starts at 10:05.
 *   DARK POOL     Bullflow darkPoolTrades over a multi-day window, aggregated
 *                 by print price → the largest notional levels near spot.
 *                 Cached 30 min (Bullflow budget is 8 req/min process-wide).
 *   FLOW          Bullflow's algo-alert prints for the symbol (live ring +
 *                 the persisted JSONL). The print's aggressor SIDE is not in
 *                 the feed — we say so rather than guess it.
 */
import { readShared, writeSharedSync } from './lib/shared-state';
import { readsSharedState, runsWorkerJobs, writesSharedState } from './lib/process-role';
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { marketDateET } from '@shared/market-day';
import { BoundedCache } from './lib/bounded-cache';
import { runHeavy } from './lib/heavy-job-gate';
import { canonicalChartSymbol, indexInfo, indexEtfRatio, optionRootsFor } from '@shared/index-symbols';
import { HORIZON_LABEL, horizonLastExpiry, isIntradayHeatmap, nodesForHorizon, topNodes, type GexHorizon, type MatrixCellLike } from '@shared/gex-horizon';

// Env-tunable: every recorded ticker re-pulls its full option chain every 5 min
// (SPY ≈ 8k contracts, 11 requests) — the 2 GB box can't carry many (2026-09-30).
const DEFAULT_WATCH = (process.env.CHART_RECORDER_WATCH ?? 'SPY,QQQ,SPX,IWM').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const VIEW_TTL_MS = 2 * 60 * 60_000;
const MAX_WATCH = Number(process.env.CHART_RECORDER_MAX ?? 8); // defaults + anything charted in the last 2h (sequential; ~2–3s per chain)
const SAMPLE_EVERY_MS = 5 * 60_000;
const ON_DEMAND_MIN_GAP_MS = 4 * 60_000;
const KEEP_DAYS = 10;
const CACHE_DIR = path.join(process.cwd(), '.cache', 'chart-overlays');

/* ────────────────────────────── GEX recorder ────────────────────────────── */

export interface GexSample {
  /** Epoch ms when WE observed it. */
  t: number;
  spot: number | null;
  /** Net GEX in whole dollars (the snapshot's $B × 1e9, same methodology). */
  net: number;
  source: string;
  /** [strike, gex$] top strikes by |gex| */
  levels: Array<[number, number]>;
}

const timeline = new BoundedCache<string, Map<string, GexSample[]>>({ name: 'chart.gexTimeline', maxEntries: 40 }); // sym → date → samples
const lastViewed = new Map<string, number>();
const inFlight = new Map<string, Promise<GexSample | null>>();
let recorderStarted = false;
let lastRecorderRun: number | null = null;

const safeSym = (s: string) => s.toUpperCase().replace(/[^A-Z0-9.^]/g, '');
const fileFor = (sym: string, date: string) => path.join(CACHE_DIR, `gex-${safeSym(sym)}-${date}.json`);

function etParts(d = new Date()) {
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { dow: et.getDay(), mins: et.getHours() * 60 + et.getMinutes() };
}

function daySamples(sym: string, date: string): GexSample[] {
  let byDate = timeline.get(sym);
  if (!byDate) { byDate = new Map(); timeline.set(sym, byDate); }
  const cached = byDate.get(date);
  // ROLE=web: the worker appends to today's file every 5 min — re-read when it changed.
  if (cached && !(readsSharedState() && fileChanged(sym, date))) return cached;
  let rows: GexSample[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(sym, date), 'utf8'));
    if (Array.isArray(raw?.samples)) rows = raw.samples;
  } catch { /* no file for that day — nothing was recorded */ }
  byDate.set(date, rows);
  return rows;
}

const fileMtimes = new Map<string, number>();
function fileChanged(sym: string, date: string): boolean {
  const f = fileFor(sym, date);
  let m = 0;
  try { m = fs.statSync(f).mtimeMs; } catch { return false; }
  if (fileMtimes.get(f) === m) return false;
  fileMtimes.set(f, m);
  return true;
}

function persist(sym: string, date: string, rows: GexSample[]) {
  fs.promises.mkdir(CACHE_DIR, { recursive: true })
    .then(() => fs.promises.writeFile(fileFor(sym, date), JSON.stringify({ symbol: sym, date, samples: rows })))
    .catch(() => { /* best effort — memory still serves */ });
}

function pruneDisk() {
  fs.promises.readdir(CACHE_DIR).then((files) => {
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    for (const f of files) {
      const m = /-(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
      if (m && Date.parse(m[1]) < cutoff) void fs.promises.unlink(path.join(CACHE_DIR, f)).catch(() => {});
    }
  }).catch(() => {});
}

/** Same chain path as /api/gex-vex/terminal: aggregate chain → CBOE fallback. */
async function snapshotNow(sym: string): Promise<GexSample | null> {
  const withTimeout = <T>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  try {
    const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
    const { toSnapshot } = await import('./gex-vex-scanner');
    let snap: any = null;
    const agg = await withTimeout(calculateAggregateGammaExposure(sym), 25_000);
    if (agg) snap = toSnapshot(agg);
    if (!snap) {
      const { computeGEXFromCBOE } = await import('./gex-cboe-fallback');
      snap = await withTimeout(computeGEXFromCBOE(sym), 20_000);
      if (snap) snap.source = snap.source ?? 'cboe-delayed';
    }
    if (!snap || !Array.isArray(snap.levels) || !snap.levels.length) return null;
    // Snapshot GEX is in $B; the overlay speaks whole dollars.
    const levels = (snap.levels as Array<{ strike: number; gex: number }>)
      .filter((l) => Number.isFinite(l.strike) && Number.isFinite(l.gex) && l.gex !== 0)
      .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
      .slice(0, 20)
      .map((l) => [l.strike, Math.round(l.gex * 1e9)] as [number, number]);
    return {
      t: Date.now(),
      spot: Number.isFinite(snap.spotPrice) && snap.spotPrice > 0 ? snap.spotPrice : null,
      net: Math.round((Number(snap.totalGEX) || 0) * 1e9),
      source: String(snap.source ?? 'chain'),
      levels,
    };
  } catch (err: any) {
    logger.debug?.(`[CHART-OVERLAYS] GEX snapshot failed for ${sym}: ${err?.message}`);
    return null;
  }
}

async function recordSample(sym: string): Promise<GexSample | null> {
  const existing = inFlight.get(sym);
  if (existing) return existing;
  const p = (async () => {
    const sample = await snapshotNow(sym);
    if (!sample) return null;
    const date = marketDateET(new Date(sample.t));
    const rows = daySamples(sym, date);
    rows.push(sample);
    persist(sym, date, rows);
    return sample;
  })().finally(() => inFlight.delete(sym));
  inFlight.set(sym, p);
  return p;
}

function latestSample(sym: string): GexSample | null {
  const rows = daySamples(sym, marketDateET());
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * Read-only: today's latest RECORDED GEX sample for `sym` (memory or today's
 * file), or null. Never fetches a chain. The 0DTE sniper reads its GEX zones
 * from here (server/zero-dte-sniper.ts).
 */
export function peekLatestGexSample(sym: string): GexSample | null {
  return latestSample(sym.toUpperCase());
}

export function watchedSymbols(): string[] {
  const now = Date.now();
  const viewed = [...lastViewed.entries()]
    .filter(([, at]) => now - at < VIEW_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  // Split deployment: symbols charted in the web process (published there).
  let webViewed: string[] = [];
  if (writesSharedState() || readsSharedState()) {
    const r = readShared<Array<[string, number]>>('chart-watch');
    if (r) webViewed = r.data.filter(([, at]) => now - at < VIEW_TTL_MS).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }
  return [...new Set([...DEFAULT_WATCH, ...viewed, ...webViewed])].slice(0, MAX_WATCH);
}

/** Session window for the scheduled recorder: weekdays 09:00–16:30 ET. */
function inRecordWindow(d = new Date()) {
  const { dow, mins } = etParts(d);
  return dow >= 1 && dow <= 5 && mins >= 9 * 60 && mins <= 16 * 60 + 30;
}

export function startChartOverlayRecorder(): void {
  if (recorderStarted) return;
  recorderStarted = true;
  pruneDisk();
  const tick = async () => {
    if (!inRecordWindow()) return;
    lastRecorderRun = Date.now();
    // Sequential on purpose: the chain providers are the scarce resource.
    for (const sym of watchedSymbols()) {
      const last = latestSample(sym);
      if (last && Date.now() - last.t < SAMPLE_EVERY_MS - 30_000) continue;
      // Per symbol through the heavy-job gate: each chain parse is its own
      // short slot, so a 20-symbol tick cannot hold the CPU for a minute.
      await runHeavy(`chart-gex:${sym}`, () => recordSample(sym), { priority: 'low', maxWaitMs: SAMPLE_EVERY_MS });
    }
  };
  setTimeout(() => { void tick(); }, 90_000);
  setInterval(() => { void tick(); }, SAMPLE_EVERY_MS).unref?.();
  setInterval(pruneDisk, 12 * 60 * 60_000).unref?.();
  logger.info('[CHART-OVERLAYS] GEX timeline recorder scheduled (5m, 09:00–16:30 ET)');
}

/* ────────────────────────────── ranges ────────────────────────────── */

/** ET market dates covered by a range, newest first, weekends skipped.
 *  A session only counts once it has 2+ recorded samples (orbs need two
 *  points in time) — before 09:00 ET, or early in a session, "1D" means the
 *  last session that actually has a timeline instead of a blank chart. */
function datesFor(range: string, sym?: string): string[] {
  const n = range === '5D' ? 5 : range === '2D' ? 2 : 1;
  const out: string[] = [];
  const now = Date.now();
  for (let back = 0; out.length < n && back < 14; back++) {
    const d = new Date(now - back * 86_400_000);
    const date = marketDateET(d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (out.includes(date)) continue;
    if (sym && back < 14 && daySamples(sym, date).length < 2 && out.length === 0 && back < 5) continue;
    out.push(date);
  }
  return out;
}

/* ────────────────────────────── dark pool ────────────────────────────── */

interface DarkPoolLevel { price: number; notional: number; prints: number; firstAt: number | null; lastAt: number | null }
interface DarkPoolRead { at: number; windowFrom: string; windowTo: string; rows: number; truncated: boolean; levels: DarkPoolLevel[]; source: string }
const dpCache = new BoundedCache<string, DarkPoolRead>({ name: 'chart.darkPool', maxEntries: 60, ttlMs: 12 * 3_600_000 });
const DP_TTL_MS = 30 * 60_000;
/** Provider rejects windows over 30 days ('Date range cannot exceed 30 days'). */
const DP_WINDOW_DAYS = 28;
const INDEX_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA']);

/** Last index/ETF ratio used for dark-pool levels (peekDarkPoolLevels reuses it). */
const lastIndexRatio = new Map<string, { ratio: number; basis: 'live' | 'regular-close'; at: number }>();

function scaleDpRead(read: DarkPoolRead, sym: string, etfSym: string, k: { ratio: number; basis: string }): DarkPoolRead {
  return {
    ...read,
    source: `${read.source} · ${etfSym} prints × ${sym}/${etfSym} ${k.ratio.toFixed(4)} (${k.basis === 'live' ? 'live ratio' : 'ratio of regular closes'}; ${sym} has no prints of its own)`,
    levels: read.levels.map((l) => ({ ...l, price: Math.round(l.price * k.ratio * 100) / 100 })),
  };
}

async function darkPoolFor(sym: string): Promise<{ read: DarkPoolRead | null; stale: boolean; reason?: string }> {
  const idx = indexInfo(sym);
  if (idx?.volumeProxy) {
    // A cash index has no prints of its own; the ETF's dark-pool levels are
    // carried over at the index/ETF ratio and labelled as such (operator
    // 2026-09-30). Ratio: both prices within 2 min of each other (live), else
    // the two regular closes — never a 16:00 index close against an 18:00
    // after-hours ETF print.
    const etfSym = idx.volumeProxy;
    const etfRead = await darkPoolFor(etfSym);
    if (!etfRead.read) return { read: null, stale: etfRead.stale, reason: etfRead.reason ?? `${etfSym} dark-pool read unavailable` };
    let k: { ratio: number; basis: 'live' | 'regular-close' } | null = null;
    try {
      const { yahooQuote } = await import('./yahoo-client');
      const [a, b] = await Promise.all([yahooQuote(sym), yahooQuote(etfSym)]);
      k = indexEtfRatio(sym,
        a ? { price: a.price, at: a.at, regularClose: a.regularMarketPrice } : null,
        b ? { price: b.price, at: b.at, regularClose: b.regularMarketPrice } : null);
    } catch { /* ratio unavailable */ }
    if (k == null) return { read: null, stale: false, reason: `${sym}/${etfSym} ratio unavailable — see ${etfSym} for dark-pool levels` };
    lastIndexRatio.set(sym, { ...k, at: Date.now() });
    return { stale: etfRead.stale, read: scaleDpRead(etfRead.read, sym, etfSym, k) };
  }
  if (idx) return { read: null, stale: false, reason: `${sym} is an index with no ETF proxy — it has no dark-pool prints` };
  const hit = dpCache.get(sym) ?? loadDpDisk(sym);
  if (hit && Date.now() - hit.at < DP_TTL_MS) return { read: hit, stale: false };
  const bf = await import('./bullflow-service');
  if (!bf.bullflowEnabled()) return { read: hit ?? null, stale: !!hit, reason: 'Bullflow key not configured' };
  const to = marketDateET();
  const from = marketDateET(new Date(Date.now() - DP_WINDOW_DAYS * 86_400_000));
  const minNotional = INDEX_ETFS.has(sym) ? 25_000_000 : 2_000_000;
  let body = await bf.getDarkPoolTradesRange(sym, from, to, minNotional);
  let source = `bullflow darkPoolTrades ${from}→${to} (≥$${minNotional / 1e6}M prints)`;
  let windowFrom = from;
  if (!Array.isArray(body?.rows)) {
    body = await bf.getDarkPoolTrades(sym, minNotional);
    source = `bullflow darkPoolTrades ${to} only (multi-day window unavailable)`;
    windowFrom = to;
  }
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!Array.isArray(body?.rows)) return { read: hit ?? null, stale: !!hit, reason: 'Bullflow dark-pool read unavailable (rate budget or provider)' };
  const byPrice = new Map<string, DarkPoolLevel>();
  for (const r of rows) {
    const price = Number(r.price); const notional = Number(r.notional);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(notional) || notional <= 0) continue;
    const ts = Number(r.sipTimestampMs ?? r.timestampMs ?? r.timestamp);
    const at = Number.isFinite(ts) && ts > 0 ? (ts < 1e11 ? ts * 1000 : ts) : null;
    const key = price.toFixed(2);
    const lvl = byPrice.get(key) ?? { price: Number(key), notional: 0, prints: 0, firstAt: null, lastAt: null };
    lvl.notional += notional; lvl.prints += 1;
    if (at != null) {
      lvl.firstAt = lvl.firstAt == null ? at : Math.min(lvl.firstAt, at);
      lvl.lastAt = lvl.lastAt == null ? at : Math.max(lvl.lastAt, at);
    }
    byPrice.set(key, lvl);
  }
  const read: DarkPoolRead = {
    at: Date.now(), windowFrom, windowTo: to, rows: rows.length, source,
    // Provider pages at 500 rows (newest first); a further page would spend
    // another budget slot, so a truncated window is disclosed instead.
    truncated: body?.hasMore === true,
    levels: [...byPrice.values()].sort((a, b) => b.notional - a.notional).slice(0, 60),
  };
  dpCache.set(sym, read);
  fs.promises.mkdir(CACHE_DIR, { recursive: true })
    .then(() => fs.promises.writeFile(path.join(CACHE_DIR, `dp-${safeSym(sym)}.json`), JSON.stringify(read)))
    .catch(() => {});
  return { read, stale: false };
}

/**
 * Read-only: the cached dark-pool level read for `sym` (memory, else the disk
 * copy), or null. Never calls Bullflow or a quote. A cash index (SPX/NDX/RUT)
 * gets its ETF's cached read × the ratio the chart overlay last used (≤ 1 day);
 * null until the overlay has computed one.
 */
export function peekDarkPoolLevels(sym: string): { at: number; source: string; levels: Array<{ price: number; notional: number; prints: number }> } | null {
  const s = canonicalChartSymbol(sym);
  const idx = indexInfo(s);
  if (idx) {
    // Index: the ETF's cached read × the ratio the overlay last used (≤ 1 day old).
    const k = lastIndexRatio.get(s);
    const etf = idx.volumeProxy ? dpCache.peek(idx.volumeProxy) ?? loadDpDisk(idx.volumeProxy) : undefined;
    if (!k || !etf || Date.now() - k.at > 86_400_000) return null;
    const scaled = scaleDpRead(etf, s, idx.volumeProxy!, k);
    return { at: etf.at, source: scaled.source, levels: scaled.levels.map((l) => ({ price: l.price, notional: l.notional, prints: l.prints })) };
  }
  const r = dpCache.peek(s) ?? loadDpDisk(s);
  return r ? { at: r.at, source: r.source, levels: r.levels.map((l) => ({ price: l.price, notional: l.notional, prints: l.prints })) } : null;
}

function loadDpDisk(sym: string): DarkPoolRead | undefined {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `dp-${safeSym(sym)}.json`), 'utf8'));
    if (r && Array.isArray(r.levels)) { dpCache.set(sym, r); return r; }
  } catch { /* none */ }
  return undefined;
}

/* ────────────────────────────── flow ────────────────────────────── */

const flowDayCache = new BoundedCache<string, { at: number; prints: any[] }>({ name: 'chart.flowDays', maxEntries: 6, ttlMs: 30 * 60_000, maxBytes: 32 * 1024 * 1024 });
async function printsForDate(date: string): Promise<any[]> {
  const hit = flowDayCache.get(date);
  const ttl = date === marketDateET() ? 60_000 : 30 * 60_000;
  if (hit && Date.now() - hit.at < ttl) return hit.prints;
  const bf = await import('./bullflow-service');
  const prints = await bf.readPersistedPrints(date);
  flowDayCache.set(date, { at: Date.now(), prints });
  return prints;
}

/* ────────────────────────────── GEX timeline ────────────────────────────── */

export interface TimelineSample { t: number; spot: number | null; net: number; source: string }
export interface TimelineRow {
  t: number; spot: number | null; net: number; source: string;
  /** [strike, gex $, vex $ | null] */
  nodes: Array<[number, number, number | null]>;
  lv?: { cw: number | null; pw: number | null; flip: number | null; maxG: number | null; net?: number | null } | null;
}

/**
 * One gex_snapshots row → nodes for the horizon. Pure (exported for tests).
 * 5-min rows carry per-horizon blocks; hourly rows carry the full matrix (any
 * horizon, cut relative to the row's OWN time) and top_levels (all only).
 */
export function rowToTimeline(r: { snapshotAt: Date | string; spotPrice: number | null; totalGex: number | null; topLevels: unknown; heatmapData: unknown; strikeExpiryMatrix?: unknown }, horizon: GexHorizon): TimelineRow | null {
  const t = new Date(r.snapshotAt).getTime();
  if (!Number.isFinite(t)) return null;
  const spot = typeof r.spotPrice === 'number' && Number.isFinite(r.spotPrice) ? r.spotPrice : null;
  if (isIntradayHeatmap(r.heatmapData)) {
    const b = r.heatmapData.horizons[horizon];
    if (!b) return null;
    const nodes = b.n.filter((x) => Number.isFinite(x[0])).map(([k, g, v]) => [k, Math.round(g * 1e9), Math.round(v * 1e6)] as [number, number, number]);
    if (!nodes.length) return null;
    const net = horizon === 'all' ? Math.round((Number(r.totalGex) || 0) * 1e9) : Math.round((Number(b.lv?.net) || 0) * 1e9);
    return { t, spot, net, source: 'snapshot-5m', nodes, lv: b.lv ?? null };
  }
  const matrix = Array.isArray(r.strikeExpiryMatrix) ? (r.strikeExpiryMatrix as MatrixCellLike[]) : [];
  if (matrix.length) {
    const nodes = topNodes(nodesForHorizon(matrix, horizon, t), 20, 10)
      .map(([k, g, v]) => [k, Math.round(g * 1e9), Math.round(v * 1e6)] as [number, number, number]);
    if (!nodes.length) return null;
    const net = horizon === 'all' ? Math.round((Number(r.totalGex) || 0) * 1e9) : nodes.reduce((a, n) => a + n[1], 0);
    return { t, spot, net, source: 'archive-hourly', nodes };
  }
  if (horizon !== 'all') return null; // top_levels are all-expiry: never relabelled as a horizon
  const nodes = ((r.topLevels as any[]) ?? [])
    .filter((l) => Number.isFinite(l?.strike) && Number.isFinite(l?.gex) && l.gex !== 0)
    .map((l) => [l.strike, Math.round(l.gex * 1e9), Number.isFinite(l?.vex) ? Math.round(l.vex * 1e6) : null] as [number, number, number | null]);
  return nodes.length ? { t, spot, net: Math.round((Number(r.totalGex) || 0) * 1e9), source: 'archive-hourly', nodes } : null;
}

/** Merge: 5-min DB rows › recorder disk samples (4 min window) › hourly archive (20 min window). Pure. */
export function mergeTimeline(db5: TimelineRow[], recorded: TimelineRow[], hourly: TimelineRow[]): TimelineRow[] {
  const out = [...db5];
  for (const r of recorded) if (!out.some((x) => Math.abs(x.t - r.t) < 4 * 60_000)) out.push(r);
  for (const r of hourly) if (!out.some((x) => Math.abs(x.t - r.t) < 20 * 60_000)) out.push(r);
  return out.sort((a, b) => a.t - b.t);
}

async function readSnapshotRows(sym: string, start: Date, needMatrix: boolean): Promise<any[]> {
  const { pool } = await import('./db');
  // Columns, not SELECT *: an hourly row's strike_expiry_matrix is ~0.5 MB and
  // is only read when a horizon must be cut from it.
  const r = await pool.query(
    `SELECT snapshot_at AS "snapshotAt", spot_price AS "spotPrice", total_gex AS "totalGex", top_levels AS "topLevels",
            heatmap_data AS "heatmapData",
            CASE WHEN $3::boolean AND (heatmap_data->>'kind') IS DISTINCT FROM 'intraday-5m' THEN strike_expiry_matrix END AS "strikeExpiryMatrix"
       FROM gex_snapshots WHERE symbol = $1 AND snapshot_at >= $2 ORDER BY snapshot_at ASC LIMIT 3000`,
    [sym.toUpperCase(), start, needMatrix],
  );
  return r.rows ?? [];
}

async function buildGexTimeline(sym: string, dates: string[], sinceDate: string, horizon: GexHorizon) {
  const db5: TimelineRow[] = []; const hourly: TimelineRow[] = [];
  try {
    const start = new Date(`${sinceDate}T04:00:00-04:00`);
    for (const row of await readSnapshotRows(sym, start, horizon !== 'all')) {
      const tr = rowToTimeline(row, horizon);
      if (!tr) continue;
      (tr.source === 'snapshot-5m' ? db5 : hourly).push(tr);
    }
  } catch { /* archive optional */ }
  // Recorder disk samples are all-expiry GEX only.
  const recorded: TimelineRow[] = [];
  if (horizon === 'all') {
    for (const d of [...dates].reverse()) {
      for (const s of daySamples(sym, d)) recorded.push({ t: s.t, spot: s.spot, net: s.net, source: s.source, nodes: s.levels.map(([k, g]) => [k, g, null]) });
    }
  }
  const rows = mergeTimeline(db5, recorded, hourly);
  const samples: TimelineSample[] = rows.map((r) => ({ t: r.t, spot: r.spot, net: r.net, source: r.source }));
  const byStrike = new Map<number, Array<[number, number]>>();
  const byStrikeV = new Map<number, Array<[number, number]>>();
  for (const r of rows) {
    for (const [k, g, v] of r.nodes) {
      if (g !== 0) { const a = byStrike.get(k) ?? []; a.push([r.t, g]); byStrike.set(k, a); }
      if (v != null && v !== 0) { const a = byStrikeV.get(k) ?? []; a.push([r.t, v]); byStrikeV.set(k, a); }
    }
  }
  const top = (m: Map<number, Array<[number, number]>>) => [...m.entries()]
    .map(([strike, points]) => ({ strike, points, peakAbs: Math.max(...points.map((p) => Math.abs(p[1]))) }))
    .sort((a, b) => b.peakAbs - a.peakAbs)
    .slice(0, 40);
  const hasHourly = rows.some((r) => r.source === 'archive-hourly');
  const has5 = rows.some((r) => r.source !== 'archive-hourly');
  const cadence: '5m' | 'hourly' | 'mixed' | null = !rows.length ? null : has5 && hasHourly ? 'mixed' : hasHourly ? 'hourly' : '5m';
  const lvRow = [...rows].reverse().find((r) => r.lv);
  return {
    samples, series: top(byStrike), vexSeries: top(byStrikeV), cadence,
    levels: lvRow?.lv ? { ...lvRow.lv, asOf: new Date(lvRow.t).toISOString() } : null,
  };
}

/* ────────────────────────────── the payload ────────────────────────────── */

export async function buildChartOverlays(symbolRaw: string, range: string, spotHint?: number | null, horizon: GexHorizon = 'all') {
  // SPXW / $SPX / ^GSPC chart (and record, and read flow for) SPX.
  const sym = safeSym(canonicalChartSymbol(symbolRaw));
  const now = Date.now();
  lastViewed.set(sym, now);
  if (readsSharedState()) {
    // ROLE=web: tell the worker's recorder which symbols people are charting.
    writeSharedSync('chart-watch', [...lastViewed.entries()].filter(([, at]) => now - at < VIEW_TTL_MS));
  } else if (runsWorkerJobs()) {
    // ROLE=all: the recorder also starts on first use (pre-split behaviour).
    startChartOverlayRecorder();
  }
  const dates = datesFor(range, sym);
  const sinceDate = dates[dates.length - 1];

  // ── GEX now (+ an on-demand sample so a newly charted symbol starts recording)
  let latest = latestSample(sym);
  const { dow, mins } = etParts();
  const onDemandOk = dow >= 1 && dow <= 5 && mins >= 4 * 60 && mins <= 20 * 60;
  // ROLE=web: only a never-recorded symbol gets an on-demand chain parse here;
  // refreshing a recorded one is the worker's 5-minute job.
  const onDemandAllowed = readsSharedState() ? !latest : (!latest || now - latest.t > ON_DEMAND_MIN_GAP_MS) && (onDemandOk || !latest);
  if (onDemandAllowed) {
    const fresh = await Promise.race([
      recordSample(sym),
      new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
    ]);
    if (fresh) latest = fresh;
  }
  if (!latest) {
    // Nothing recorded today — fall back to the newest sample in range on disk.
    for (const d of dates) { const rows = daySamples(sym, d); if (rows.length) { latest = rows[rows.length - 1]; break; } }
  }

  // ── GEX / VEX timeline for the expiry horizon (shared/gex-horizon.ts):
  //    5-min gex_snapshots rows (intraday writer, every horizon, GEX + VEX)
  //  › the recorder's 5-min disk samples (all expiries, GEX only)
  //  › the hourly archive (full matrix → any horizon, GEX + VEX), labelled hourly.
  const tl = await buildGexTimeline(sym, dates, sinceDate, horizon);
  const samples = tl.samples;
  const series = tl.series;
  const firstAt = samples[0]?.t ?? null;
  const lastAt = samples.at(-1)?.t ?? null;
  const sourcesUsed = [...new Set(samples.map((s) => s.source))];

  // ── dark pool
  const dp = await darkPoolFor(sym).catch(() => ({ read: null, stale: false, reason: 'dark-pool read failed' } as { read: DarkPoolRead | null; stale: boolean; reason?: string }));
  const spot = spotHint ?? latest?.spot ?? null;
  const dpLevels = (dp.read?.levels ?? [])
    .filter((l) => spot == null || Math.abs(l.price / spot - 1) <= 0.08)
    .slice(0, 12);

  // ── flow
  const bf = await import('./bullflow-service');
  // OCC roots: SPX → SPX + SPXW (monthlies + weeklies/0DTE), NDX → NDX + NDXP, …
  const roots = new Set(optionRootsFor(sym));
  const since = new Date(`${sinceDate}T00:00:00-05:00`).getTime();
  const seen = new Map<string, any>();
  const pool = [...bf.getBullflowPrints().prints];
  for (const d of dates) pool.push(...await printsForDate(d));
  for (const p of pool) {
    if (!roots.has(p.underlying)) continue;
    const t = Date.parse(p.at);
    if (!Number.isFinite(t) || t < since) continue;
    // One trade can fire several algo alerts — one marker, names joined.
    // The same trade fires custom + algo alerts milliseconds apart.
    const key = `${p.occ}|${Math.round(t / 2000)}|${Math.round(p.premium)}`;
    const cur = seen.get(key);
    if (cur) { if (!cur.alertNames.includes(p.alertName)) cur.alertNames.push(p.alertName); continue; }
    seen.set(key, {
      time: t,
      optionType: p.optionType,
      strike: p.strike,
      expiry: p.expiry,
      contract: `${p.underlying} ${p.strike}${p.optionType === 'call' ? 'C' : 'P'} ${p.expiry}`,
      premium: p.premium,
      fillPrice: p.fillPrice,
      contracts: p.contracts,
      alertNames: [p.alertName],
      side: null,
    });
  }
  const flowPrints = [...seen.values()].sort((a, b) => a.time - b.time).slice(-400);
  const ageSec = (t: number | null) => (t == null ? null : Math.max(0, Math.round((now - t) / 1000)));

  return {
    symbol: sym,
    range,
    dates,
    generatedAt: new Date(now).toISOString(),
    gexNow: latest ? {
      net: latest.net,
      spot: latest.spot,
      topStrikes: [...latest.levels].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5).map(([strike, gex]) => ({ strike, gex })),
      asOf: new Date(latest.t).toISOString(),
      ageSec: ageSec(latest.t),
      source: latest.source,
    } : null,
    gexTimeline: {
      unit: 'USD net GEX per strike ($ per 1% move); vexSeries: USD net VEX per IV point',
      horizon,
      horizonLabel: HORIZON_LABEL[horizon],
      // Which contracts feed the nodes. 'all' = the whole book the chain read
      // covers; the others are cut at the horizon's last expiry RELATIVE TO
      // EACH SNAPSHOT'S OWN TIME (a Monday 0DTE node is Monday's expiry).
      expiryScope: horizon !== 'all'
        ? `${HORIZON_LABEL[horizon]} — contracts expiring by ${horizonLastExpiry(horizon, now)} 16:00 ET (each snapshot uses its own session's cut-off)`
        : indexInfo(sym)
          ? `all expiries in the ${sym} chain read (${optionRootsFor(sym).join('+')}; CBOE index chains ≤60 DTE) — not the 0–7d book`
          : 'all expiries in the chain read — not the 0–7d book',
      cadence: tl.cadence,
      vexSeries: tl.vexSeries.map(({ strike, points }) => ({ strike, points })),
      horizonLevels: tl.levels,
      sampleEveryMin: SAMPLE_EVERY_MS / 60_000,
      recordingSince: firstAt ? new Date(firstAt).toISOString() : null,
      asOf: lastAt ? new Date(lastAt).toISOString() : null,
      ageSec: ageSec(lastAt),
      sources: sourcesUsed,
      samples: samples.map((s) => ({ t: s.t, spot: s.spot, net: s.net, source: s.source })),
      series: series.map(({ strike, points }) => ({ strike, points })),
      watched: watchedSymbols().includes(sym),
      recorderLastRun: lastRecorderRun ? new Date(lastRecorderRun).toISOString() : null,
      note: samples.length
        ? `History exists only from ${new Date(firstAt!).toISOString()} — ${tl.cadence === 'hourly' ? 'hourly snapshots only for this range' : `5-min snapshots${tl.cadence === 'mixed' ? ', hourly archive in the gaps' : ''}`}. Nothing earlier is reconstructed.`
        : horizon !== 'all'
          ? `No ${HORIZON_LABEL[horizon]} snapshots for ${sym} in this range. Horizon nodes need a stored 5-min row or an hourly archive row with its expiry matrix; nothing is back-filled.`
          : `No GEX samples recorded for ${sym} in this range yet. Recording starts when a symbol is watched; history is never back-filled with invented values.`,
    },
    darkPool: {
      source: dp.read?.source ?? 'bullflow darkPoolTrades',
      asOf: dp.read ? new Date(dp.read.at).toISOString() : null,
      ageSec: dp.read ? ageSec(dp.read.at) : null,
      stale: dp.stale,
      windowFrom: dp.read?.windowFrom ?? null,
      windowTo: dp.read?.windowTo ?? null,
      printsScanned: dp.read?.rows ?? 0,
      truncated: dp.read?.truncated ?? false,
      levels: dpLevels.map((l) => ({ price: l.price, notional: Math.round(l.notional), prints: l.prints, date: l.lastAt ? new Date(l.lastAt).toISOString() : null, firstDate: l.firstAt ? new Date(l.firstAt).toISOString() : null })),
      note: dp.reason ?? 'Dark-pool prints mark high-notional price levels (summed by print price over the window); they are not directional.',
    },
    flow: {
      source: 'bullflow algo alerts (live stream + persisted tape)',
      streamState: bf.getBullflowPrints().state,
      asOf: flowPrints.length ? new Date(flowPrints[flowPrints.length - 1].time).toISOString() : null,
      ageSec: flowPrints.length ? ageSec(flowPrints[flowPrints.length - 1].time) : null,
      prints: flowPrints,
      note: 'Bullflow classifies execution style (sweep, repeater…) but does not report the aggressor side — side is null, never inferred. Markers sit on the candle at the print time.',
    },
  };
}
