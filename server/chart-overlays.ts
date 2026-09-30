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
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { marketDateET } from '@shared/market-day';

const DEFAULT_WATCH = ['SPY', 'QQQ', 'SPX', 'IWM', 'TSLA', 'NVDA', 'AMD', 'MSTR'];
const VIEW_TTL_MS = 2 * 60 * 60_000;
const MAX_WATCH = 12;
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

const timeline = new Map<string, Map<string, GexSample[]>>(); // sym → date → samples
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
  if (cached) return cached;
  let rows: GexSample[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(sym, date), 'utf8'));
    if (Array.isArray(raw?.samples)) rows = raw.samples;
  } catch { /* no file for that day — nothing was recorded */ }
  byDate.set(date, rows);
  return rows;
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

export function watchedSymbols(): string[] {
  const now = Date.now();
  const viewed = [...lastViewed.entries()]
    .filter(([, at]) => now - at < VIEW_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  return [...new Set([...DEFAULT_WATCH, ...viewed])].slice(0, MAX_WATCH);
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
      await recordSample(sym);
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
const dpCache = new Map<string, DarkPoolRead>();
const DP_TTL_MS = 30 * 60_000;
/** Provider rejects windows over 30 days ('Date range cannot exceed 30 days'). */
const DP_WINDOW_DAYS = 28;
const INDEX_ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA']);

async function darkPoolFor(sym: string): Promise<{ read: DarkPoolRead | null; stale: boolean; reason?: string }> {
  if (sym === 'SPX') return { read: null, stale: false, reason: 'SPX is an index — it has no dark-pool prints (see SPY)' };
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

function loadDpDisk(sym: string): DarkPoolRead | undefined {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `dp-${safeSym(sym)}.json`), 'utf8'));
    if (r && Array.isArray(r.levels)) { dpCache.set(sym, r); return r; }
  } catch { /* none */ }
  return undefined;
}

/* ────────────────────────────── flow ────────────────────────────── */

const flowDayCache = new Map<string, { at: number; prints: any[] }>();
async function printsForDate(date: string): Promise<any[]> {
  const hit = flowDayCache.get(date);
  const ttl = date === marketDateET() ? 60_000 : 30 * 60_000;
  if (hit && Date.now() - hit.at < ttl) return hit.prints;
  const bf = await import('./bullflow-service');
  const prints = await bf.readPersistedPrints(date);
  flowDayCache.set(date, { at: Date.now(), prints });
  return prints;
}

/* ────────────────────────────── the payload ────────────────────────────── */

export async function buildChartOverlays(symbolRaw: string, range: string, spotHint?: number | null) {
  const sym = safeSym(symbolRaw);
  const now = Date.now();
  lastViewed.set(sym, now);
  // Production runs dist/web.js (index.ts's schedulers never start there), so
  // the recorder also starts on first use.
  startChartOverlayRecorder();
  const dates = datesFor(range, sym);
  const sinceDate = dates[dates.length - 1];

  // ── GEX now (+ an on-demand sample so a newly charted symbol starts recording)
  let latest = latestSample(sym);
  const { dow, mins } = etParts();
  const onDemandOk = dow >= 1 && dow <= 5 && mins >= 4 * 60 && mins <= 20 * 60;
  if ((!latest || now - latest.t > ON_DEMAND_MIN_GAP_MS) && (onDemandOk || !latest)) {
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

  // ── GEX timeline: recorded samples for the range + hourly archive for gaps
  const recorded: GexSample[] = [];
  for (const d of [...dates].reverse()) recorded.push(...daySamples(sym, d));
  let archive: GexSample[] = [];
  try {
    const { storage } = await import('./storage');
    const start = new Date(`${sinceDate}T04:00:00-04:00`);
    const rows = await storage.getGexSnapshotsByDateRange(sym, start, new Date());
    archive = (rows ?? []).map((r: any) => ({
      t: new Date(r.snapshotAt).getTime(),
      spot: Number.isFinite(r.spotPrice) ? r.spotPrice : null,
      net: Math.round((Number(r.totalGex) || 0) * 1e9),
      source: 'archive-hourly',
      levels: ((r.topLevels as any[]) ?? [])
        .filter((l) => Number.isFinite(l?.strike) && Number.isFinite(l?.gex) && l.gex !== 0)
        .map((l) => [l.strike, Math.round(l.gex * 1e9)] as [number, number]),
    })).filter((s: GexSample) => s.levels.length > 0)
      // Only where we have no recording within 20 min — recorded wins.
      .filter((s: GexSample) => !recorded.some((r) => Math.abs(r.t - s.t) < 20 * 60_000));
  } catch { /* archive optional */ }
  const samples = [...recorded, ...archive].sort((a, b) => a.t - b.t);

  const byStrike = new Map<number, Array<[number, number]>>();
  for (const s of samples) {
    for (const [k, g] of s.levels) {
      const rows = byStrike.get(k) ?? [];
      rows.push([s.t, g]);
      byStrike.set(k, rows);
    }
  }
  const series = [...byStrike.entries()]
    .map(([strike, points]) => ({ strike, points, peakAbs: Math.max(...points.map((p) => Math.abs(p[1]))) }))
    .sort((a, b) => b.peakAbs - a.peakAbs)
    .slice(0, 40);
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
  const roots = sym === 'SPX' ? new Set(['SPX', 'SPXW']) : new Set([sym]);
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
      unit: 'USD net GEX per strike (snapshot top-20 by |GEX|)',
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
        ? `History exists only from ${new Date(firstAt!).toISOString()} — recorded every ${SAMPLE_EVERY_MS / 60_000}m while ${sym} is watched (09:00–16:30 ET), hourly archive fills gaps. Nothing earlier is reconstructed.`
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
