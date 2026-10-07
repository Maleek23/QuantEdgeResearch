/**
 * SECTOR BOARD — I/O around the pure core in shared/sector-board.ts.
 * ===================================================================
 * Computed in the WORKER on a schedule (server/idea-producer-schedule.ts):
 *   08:45 / 09:20 ET  pre-market: completed sessions + pre-market gaps
 *   09:37 → 15:52     every 15 min: completed sessions + today priced from live
 *                     quotes (the last rank-flow column is marked provisional)
 *   16:15             close: same, plus the forward-log line and due outcomes
 *   17:45             after-hours movers
 *   + a quotes-only LIVE pass (runSectorBoardLive, shared/sector-board-live.ts)
 *     every 5 min in session (10 min pre-market, 30 min after hours): today /
 *     since open / last 30m, intraday + live composite rank, breadth, sparkline
 *     ring — re-priced on the completed-session bars the last board run kept in
 *     memory, published as 'sector-board-live' and laid over the board by the route
 * and published with server/lib/shared-state.ts ('sector-board'). The web route
 * only READS the published snapshot — it never computes (2 GB droplet).
 *
 * Inputs — only what the platform already holds or reads cheaply:
 *   daily bars   liquid-universe bars (getUniverseBars(70), disk-cached per
 *                session); members outside the liquid set and SPY/ETFs from
 *                fetchCandles 6mo (provider cache), missing members cached here
 *                once per day (capped)
 *   quotes       pre-market-service getPreMarketBatch (Yahoo meta, 60 s cache —
 *                shared with sector ignition's 09:20 read)
 *   flow         buildFlowTape(1) (Bullflow ring + chain-scan rows) — calls − puts
 *                alert premium per member; Bullflow does not report aggressor side
 *   levels       peekLevelMap — only maps a producer already computed
 *   gamma        peekAggregateGammaExposure (60 s cache) → wall-touch day map
 *                (shared state) → GEX snapshot cache; never starts a chain fetch
 *   ignition     peekSectorIgnition (the horizons' last published reads)
 *   NEXUS        storage.getOpenTradeIdeas()
 *   earnings     peekEarningsDate (cache only)
 *
 * Forward log: .cache/sector-board/forward-YYYY-MM.jsonl — each close's top-3
 * leaders in the top-5 sectors, then (later closes) their next 1/3/5-session
 * returns vs the equal-weight sector. Weights are unvalidated → 'measuring'.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { promises as fsp } from 'fs';
import path from 'path';
import { logger } from './logger';
import { readShared, writeShared, writeSharedSync, sharedStamp } from './lib/shared-state';
import { readsSharedState, runsWorkerJobs, writesSharedState } from './lib/process-role';
import { etParts } from '@shared/loss-rules';
import {
  BOARD_CFG, BOARD_HONESTY, boardGroups, computeCore, confluenceOf, consensusOf, laggardsOf, leaderLogRows, outcomeSummary,
  outcomesDue, overnightDrift, r2, rankMembers,
  type BoardLogRow, type BoardPhase, type BoardSnapshot, type IdeaRef, type IgnitionLeanInput, type MemberInput, type OvernightMover, type SectorRow, type Side,
} from '@shared/sector-board';
import { applyLive, computeLive, type BoardLive, type LiveBase, type LiveQuote } from '@shared/sector-board-live';

export const BOARD_SHARED = 'sector-board';
export const LIVE_SHARED = 'sector-board-live';
export const LIVE_CADENCE = 'live quotes pass: every 10 min 08:01–08:51 ET, every 5 min 09:01–15:56 ET, 16:01/16:06/16:11, then half-hourly to 19:31 ET';
const OVERNIGHT_SHARED = 'sector-board-overnight';
export const BOARD_CADENCE = 'pre-market 08:45 / 09:20 ET; every 15 min 09:37–15:52 ET; close 16:15 ET (forward log); after-hours 17:45 ET';

let last: BoardSnapshot | null = null;
let inflight: Promise<BoardSnapshot> | null = null;

// ─── phase ───────────────────────────────────────────────────────────────

export function boardPhase(nowMs: number): BoardPhase {
  const et = etParts(nowMs);
  if (et.weekday < 1 || et.weekday > 5) return 'closed';
  const m = et.minutes;
  if (m >= 4 * 60 && m < 9 * 60 + 30) return 'premarket';
  if (m >= 9 * 60 + 30 && m < 16 * 60) return 'session';
  if (m >= 16 * 60 && m < 16 * 60 + 30) return 'close';
  if (m >= 16 * 60 + 30 && m < 20 * 60) return 'after_hours';
  return 'closed';
}

// ─── daily bars ──────────────────────────────────────────────────────────

const dayKeyOf = (tSec: number) => new Date(tSec * 1000).toISOString().slice(0, 10);
type CloseMap = Map<string, Map<string, number>>;

/**
 * Members outside the liquid-universe bars are read one by one (fetchCandles 6mo).
 * 2026-10-01 (prod): a freshly restarted worker had an empty liquid ranking, so
 * getUniverseBars returned nothing, EVERY member fell to this path, and the old
 * 160-symbol cap read 21 heads + 158 members = 179 of 277 symbols; the groups at
 * the end of the list (pharma, managed care, miners, quantum, drones…) read 0/N.
 * A failed fetch was also never retried that day. Now: no truncating cap, reads
 * persist to disk per day (a restart neither re-downloads nor goes blind),
 * failures retry after RETRY_MS, and a recent cached series is used — with a
 * note — when today's re-read fails.
 */
const MEMBER_CACHE_FILE = path.join(process.cwd(), '.cache', 'sector-board', 'member-closes.json');
const FETCH_CAP = 400; // above every member + ETF — a cap that truncates whole sectors is a bug, not a budget
const RETRY_MS = 20 * 60_000;
const STALE_OK_DAYS = 4;
interface MemberCacheFile { bars: Record<string, { fetched: string; rows: Array<[string, number]> }>; failed: Record<string, { at: number; why: string }> }
let memberCache: MemberCacheFile | null = null;
const daysBefore = (dateKey: string, n: number) => new Date(Date.parse(dateKey) - n * 86_400_000).toISOString().slice(0, 10);

async function memberCacheLoad(): Promise<MemberCacheFile> {
  if (memberCache) return memberCache;
  try {
    const raw = JSON.parse(await fsp.readFile(MEMBER_CACHE_FILE, 'utf8'));
    memberCache = { bars: raw?.bars ?? {}, failed: raw?.failed ?? {} };
  } catch { memberCache = { bars: {}, failed: {} }; }
  return memberCache;
}
async function memberCacheSave(c: MemberCacheFile, dateKey: string): Promise<void> {
  const cutoff = daysBefore(dateKey, STALE_OK_DAYS);
  for (const [k, v] of Object.entries(c.bars)) if (v.fetched < cutoff) delete c.bars[k];
  try {
    await fsp.mkdir(path.dirname(MEMBER_CACHE_FILE), { recursive: true });
    await fsp.writeFile(MEMBER_CACHE_FILE, JSON.stringify(c), 'utf8');
  } catch { /* cache is optional */ }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export interface LoadedCloses { closes: CloseMap; newest: string | null; noBars?: Map<string, string> }

async function loadCloses(members: string[], etfs: string[], dateKey: string, notes: string[]): Promise<LoadedCloses> {
  const closes: CloseMap = new Map();
  const noBars = new Map<string, string>();
  const put = (sym: string, bars: Array<{ time: number; close: number }>) => {
    const m = new Map<string, number>();
    for (const b of bars) if (b.close > 0) m.set(dayKeyOf(b.time), b.close);
    if (m.size) closes.set(sym, m);
  };
  const { fetchCandles } = await import('./historical-candles');
  const heads = Array.from(new Set(['SPY', ...etfs]));
  const hb = await pool(heads, 4, (s) => fetchCandles(s, '6mo', '1d').catch(() => []));
  heads.forEach((s, k) => { if (hb[k].length) put(s, hb[k]); else notes.push(`${s}: no daily bars`); });
  let uni = new Map<string, Array<{ time: number; close: number }>>();
  let uniNote: string | null = null;
  try {
    const { getUniverseBars } = await import('./liquid-universe');
    uni = await getUniverseBars(70);
    if (uni.size === 0) uniNote = 'liquid-universe bars empty (ranking not loaded)';
  } catch (err) { uniNote = `liquid-universe bars failed: ${(err as Error).message}`; }
  const missing: string[] = [];
  let fromUni = 0;
  for (const m of members) { if (closes.has(m)) continue; const b = uni.get(m); if (b && b.length >= 30) { put(m, b); fromUni++; } else missing.push(m); }
  uni = new Map(); // drop the reference — the liquid-universe module keeps its own cache

  const cache = await memberCacheLoad();
  const now = Date.now();
  const todo = missing.filter((s) => cache.bars[s]?.fetched !== dateKey && !(cache.failed[s] && now - cache.failed[s].at < RETRY_MS));
  if (todo.length > FETCH_CAP) notes.push(`${todo.length - FETCH_CAP} member(s) beyond the per-run fetch cap — read next run`);
  const batch = todo.slice(0, FETCH_CAP);
  if (batch.length) {
    const got = await pool(batch, 4, async (s) => {
      try { return { bars: await fetchCandles(s, '6mo', '1d'), why: null as string | null }; } catch (err) { return { bars: [] as Array<{ time: number; close: number }>, why: (err as Error).message }; }
    });
    batch.forEach((s, k) => {
      const rows: Array<[string, number]> = [];
      for (const b of got[k].bars) if (b.close > 0) rows.push([dayKeyOf(b.time), b.close]);
      if (rows.length) { cache.bars[s] = { fetched: dateKey, rows }; delete cache.failed[s]; }
      else cache.failed[s] = { at: now, why: got[k].why ?? 'provider returned no daily bars' };
    });
    await memberCacheSave(cache, dateKey);
  }
  let stale = 0;
  const cutoff = daysBefore(dateKey, STALE_OK_DAYS);
  for (const m of missing) {
    const c = cache.bars[m];
    if (c && c.fetched >= cutoff) {
      closes.set(m, new Map(c.rows));
      if (c.fetched !== dateKey) stale++;
      continue;
    }
    const f = cache.failed[m];
    noBars.set(m, f ? `no daily bars — ${f.why}; retry after ${new Date(f.at + RETRY_MS).toISOString().slice(11, 16)}Z` : 'no daily bars read');
  }
  if (uniNote) notes.push(`${uniNote} — ${missing.length} member(s) read individually`);
  else if (missing.length) notes.push(`${missing.length} member(s) outside the liquid-universe bars — read individually (cached on disk per day)`);
  if (stale) notes.push(`${stale} member(s) on a cached series from an earlier day (today's re-read failed)`);
  if (noBars.size) notes.push(`${noBars.size} member(s) with no daily bars: ${Array.from(noBars.keys()).slice(0, 12).join(', ')}${noBars.size > 12 ? '…' : ''}`);
  logger.info(`[SECTOR-BOARD] bars: ${fromUni} members from liquid-universe bars, ${missing.length} individually (${batch.length} fetched, ${stale} stale-cached), ${noBars.size} with none${uniNote ? ` — ${uniNote}` : ''}`);
  const spy = closes.get('SPY');
  return { closes, newest: spy ? Array.from(spy.keys()).sort().pop() ?? null : null, noBars };
}

// ─── quotes / overnight ──────────────────────────────────────────────────

interface OvernightStore { dateKey: string; kind: 'premarket' | 'after_hours'; at: string; by: Record<string, { pct: number; price: number | null; at: string | null }> }

function readOvernight(): OvernightStore[] {
  const r = readShared<OvernightStore[]>(OVERNIGHT_SHARED);
  return Array.isArray(r?.data) ? r!.data : [];
}
function saveOvernight(s: OvernightStore): void {
  const keep = readOvernight().filter((x) => !(x.dateKey === s.dateKey && x.kind === s.kind)).concat(s)
    .sort((a, b) => a.at.localeCompare(b.at)).slice(-4);
  writeSharedSync(OVERNIGHT_SHARED, keep); // always — the worker rehydrates today's pre-market read after a restart
}
/** The overnight read to show: today's pre-market, else the newest after-hours read. */
function pickOvernight(stores: OvernightStore[], dateKey: string, phase: BoardPhase): OvernightStore | null {
  const pm = stores.find((s) => s.kind === 'premarket' && s.dateKey === dateKey);
  const ah = stores.filter((s) => s.kind === 'after_hours').sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  if (phase === 'after_hours' || phase === 'closed') return ah && (ah.dateKey === dateKey || !pm) ? ah : pm ?? ah;
  return pm ?? ah;
}

// ─── cached-only per-symbol reads ────────────────────────────────────────

type Gamma = NonNullable<MemberInput['gamma']>;
const GEX_MAX_AGE_MS = 30 * 60_000;

async function gammaReader(dateKey: string): Promise<(s: string) => Gamma | null> {
  let peekAgg: ((s: string) => any) | null = null; let peekSnap: ((s: string) => any) | null = null;
  try { peekAgg = (await import('./gamma-exposure')).peekAggregateGammaExposure; } catch { /* optional */ }
  try { peekSnap = (await import('./gex-snapshot-service')).peekGexSnapshot; } catch { /* optional */ }
  let wall: Record<string, any> = {};
  try { const r = readShared<any>('wall-touch-map'); if (r?.data?.dateKey === dateKey) wall = r.data.entries ?? {}; } catch { /* optional */ }
  return (s: string) => {
    const now = Date.now();
    const a = peekAgg?.(s);
    if (a && now - a.at < GEX_MAX_AGE_MS) {
      return { zeroGamma: a.v.zeroGammaLevel ?? a.v.flipPoint ?? null, callWall: a.v.callWall ?? null, putWall: a.v.putWall ?? null, source: 'aggregate GEX cache', asOf: new Date(a.at).toISOString() };
    }
    const w = wall[s];
    if (w?.ok && (w.flip != null || w.callWall != null || w.putWall != null)) {
      return { zeroGamma: w.flip ?? null, callWall: w.callWall ?? null, putWall: w.putWall ?? null, source: `wall-touch map (${w.basisLabel ?? w.basis ?? 'chain'})`, asOf: w.computedAt };
    }
    const g = peekSnap?.(s);
    if (g && now - g.at < GEX_MAX_AGE_MS) {
      return { zeroGamma: g.snap.flipPoint ?? null, callWall: g.snap.callWall ?? null, putWall: g.snap.putWall ?? null, source: 'GEX snapshot cache', asOf: new Date(g.at).toISOString() };
    }
    return null;
  };
}

async function levelsReader(): Promise<(s: string, last: number | null) => MemberInput['levels']> {
  let peek: ((s: string) => any) | null = null;
  try { peek = (await import('./levels/level-map')).peekLevelMap; } catch { /* optional */ }
  return (s, lastPx) => {
    const hit = peek?.(s);
    if (!hit || !hit.map) return null;
    const px = lastPx ?? hit.map.last;
    if (px == null) return null;
    const cl = (hit.map.clusters ?? []) as Array<{ price: number; score: number; label: string }>;
    const below = cl.filter((c) => c.price < px).sort((a, b) => b.price - a.price)[0] ?? null;
    const above = cl.filter((c) => c.price > px).sort((a, b) => a.price - b.price)[0] ?? null;
    const pick = (c: typeof below) => (c ? { price: r2(c.price), score: c.score, label: c.label } : null);
    return { support: pick(below), resistance: pick(above), atr: hit.map.atrDaily ?? null, asOf: new Date(hit.at).toISOString() };
  };
}

async function earningsReader(nowMs: number): Promise<(s: string) => string | null> {
  let peek: ((s: string) => Date | null | undefined) | null = null;
  try { peek = (await import('./earnings-service')).peekEarningsDate; } catch { /* optional */ }
  return (s) => {
    const d = peek?.(s);
    if (!d) return null;
    const days = (d.getTime() - nowMs) / 86_400_000;
    return days >= -3 && days <= 10 ? d.toISOString().slice(0, 10) : null;
  };
}

async function flowBySymbol(): Promise<{ by: Map<string, { net: number; big: number }>; asOf: string | null } | null> {
  try {
    const { buildFlowTape } = await import('./flow-tape');
    const tape = await buildFlowTape(1);
    if (!tape.sources.bullflow.enabled && !tape.sources.chainScan.ok) return null;
    const by = new Map<string, { net: number; big: number }>();
    for (const r of tape.rows) {
      const x = by.get(r.symbol) ?? { net: 0, big: 0 };
      x.net += r.optionType === 'call' ? r.premium : -r.premium;
      if (r.premium >= 250_000) x.big++;
      by.set(r.symbol, x);
    }
    return { by, asOf: tape.sources.bullflow.newestAt ?? tape.sources.chainScan.newestAt ?? null };
  } catch { return null; }
}

async function openIdeas(): Promise<any[] | null> {
  try { const { storage } = await import('./storage'); return await storage.getOpenTradeIdeas(); } catch { return null; }
}

// ─── compute ─────────────────────────────────────────────────────────────

export interface ComputeDeps {
  nowMs?: number;
  phase?: BoardPhase;
  /** Test seams: replace every I/O read. */
  loadCloses?: typeof loadCloses;
  quotes?: (syms: string[]) => Promise<Map<string, any>>;
  flow?: typeof flowBySymbol;
  ideas?: typeof openIdeas;
  ignition?: (h: string) => any;
  gamma?: (s: string) => Gamma | null;
  levels?: (s: string, last: number | null) => MemberInput['levels'];
  earnings?: (s: string) => string | null;
  overnightStores?: () => OvernightStore[];
  saveOvernight?: (s: OvernightStore) => void;
  log?: boolean;
  /** Receives the completed-session series + this run's quotes for the live pass. */
  onBase?: (base: LiveBase, quotes: Map<string, any>) => void;
}

export async function computeSectorBoard(deps: ComputeDeps = {}): Promise<BoardSnapshot> {
  const t0 = Date.now();
  const mem0 = process.memoryUsage();
  const nowMs = deps.nowMs ?? Date.now();
  const phase = deps.phase ?? boardPhase(nowMs);
  const et = etParts(nowMs);
  const notes: string[] = [];
  const groups = boardGroups();
  const members = Array.from(new Set(groups.flatMap((g) => g.members)));
  const etfs = Array.from(new Set(groups.map((g) => g.etf).filter((e): e is string => !!e)));
  const all = Array.from(new Set(['SPY', ...etfs, ...members]));

  // 1. bars (completed sessions)
  const { closes, newest, noBars } = await (deps.loadCloses ?? loadCloses)(members, etfs, et.dateKey, notes);
  const spyMap = closes.get('SPY');
  if (!spyMap) throw new Error('no SPY daily bars — board not computed');
  let dates = Array.from(spyMap.keys()).sort();
  // A bar dated today before 16:00 ET is a forming bar, not a completed session.
  if (phase === 'premarket' || phase === 'session') dates = dates.filter((d) => d < et.dateKey);
  const sessionThrough = dates.length ? dates[dates.length - 1] : null;

  // 2. quotes: pre-market gaps, live prices (session/close), after-hours moves
  let quotes = new Map<string, any>();
  if (phase !== 'closed') {
    try { quotes = await (deps.quotes ?? (async (s) => (await import('./pre-market-service')).getPreMarketBatch(s, 6)))(all); } catch { notes.push('quote read failed'); }
  }
  const stores = (deps.overnightStores ?? readOvernight)();
  if (quotes.size && (phase === 'premarket' || phase === 'after_hours' || phase === 'close')) {
    const kind = phase === 'premarket' ? 'premarket' : 'after_hours';
    const by: OvernightStore['by'] = {};
    let newestAt: string | null = null;
    for (const q of quotes.values()) {
      const pct = kind === 'premarket' ? q.preMarketGapPct : q.postMarketMovePct;
      const at = kind === 'premarket' ? q.preMarketAt ?? null : q.postMarketAt ?? null;
      if (pct == null || !Number.isFinite(pct)) continue;
      by[q.symbol] = { pct: r2(pct), price: q.price ?? null, at };
      if (at && (!newestAt || at > newestAt)) newestAt = at;
    }
    if (Object.keys(by).length) {
      const s: OvernightStore = { dateKey: et.dateKey, kind, at: newestAt ?? new Date(nowMs).toISOString(), by };
      (deps.saveOvernight ?? saveOvernight)(s);
      stores.push(s);
    } else if (kind === 'after_hours' && phase === 'after_hours') notes.push('no after-hours prints read yet');
  }
  const ov = pickOvernight(stores, et.dateKey, phase);

  // Today priced from quotes once the session is open (provisional until the close);
  // after the close, members whose daily bar has not landed yet are filled from the regular close.
  let provisional: BoardSnapshot['provisional'] = null;
  if ((phase === 'session' || phase === 'close' || phase === 'after_hours') && quotes.size) {
    const pxOf = (q: any): number | null => {
      const v = phase === 'session' ? q.price : (q.regularMarketPrice ?? null);
      return typeof v === 'number' && v > 0 ? v : null;
    };
    const spyToday = spyMap.has(et.dateKey) || pxOf(quotes.get('SPY') ?? {}) != null;
    if (spyToday) {
      let n = 0; let newestQ: string | null = null;
      for (const [sym, q] of quotes) {
        const m = closes.get(sym); const px = pxOf(q);
        if (!m || px == null) continue;
        if (phase === 'session' || !m.has(et.dateKey)) { m.set(et.dateKey, px); n++; if (!newestQ || q.fetchedAt > newestQ) newestQ = q.fetchedAt; }
      }
      if (dates[dates.length - 1] !== et.dateKey) dates = [...dates, et.dateKey];
      if (phase === 'session') provisional = { date: et.dateKey, quotesAt: newestQ, quotes: n };
      else if (n) notes.push(`${n} symbol(s) had no ${et.dateKey} daily bar yet — today's close read from the regular-session quote`);
    }
  }
  if (dates.length < BOARD_CFG.minBars) throw new Error(`only ${dates.length} aligned sessions — need ${BOARD_CFG.minBars}`);

  const series = new Map<string, number[]>();
  for (const s of all) { const m = closes.get(s); if (m) series.set(s, dates.map((d) => m.get(d) ?? NaN)); }
  const core = computeCore({ dates, spy: series.get('SPY')!, closes: series, groups });

  // Live-pass base: completed sessions only (today's forming column stripped).
  if (deps.onBase) {
    const cut = dates[dates.length - 1] === et.dateKey && (phase === 'session' || phase === 'premarket') ? 1 : 0;
    const bSeries = new Map<string, number[]>();
    for (const [k, v] of series) bSeries.set(k, cut ? v.slice(0, -1) : v.slice());
    deps.onBase({ asOf: new Date(nowMs).toISOString(), dateKey: et.dateKey, dates: cut ? dates.slice(0, -1) : dates.slice(), series: bSeries, groups }, quotes);
  }

  // Coverage: why each member is or is not read on the newest session.
  const endI = dates.length - 1;
  const reasonOf = (sym: string): string | null => {
    const c = series.get(sym);
    if (!c) return noBars?.get(sym) ?? 'no daily bars read';
    if (!Number.isFinite(c[endI])) return provisional && dates[endI] === et.dateKey ? 'no live quote this run' : `no bar for ${dates[endI]}`;
    if (!Number.isFinite(c[endI - 1])) return `no bar for ${dates[endI - 1]}`;
    return null;
  };
  const unreadBy = new Map<string, Array<{ symbol: string; reason: string }>>();
  const reasonCount: Record<string, number> = {};
  let readNow = 0;
  for (const g of groups) {
    const u: Array<{ symbol: string; reason: string }> = [];
    for (const m of g.members) { const r = reasonOf(m); if (r) u.push({ symbol: m, reason: r }); }
    unreadBy.set(g.id, u);
  }
  for (const m of members) {
    const r = reasonOf(m);
    if (!r) { readNow++; continue; }
    const k = r.startsWith('no daily bars') ? 'no daily bars' : r.startsWith('no bar for') ? 'no bar on the newest/prior session' : r;
    reasonCount[k] = (reasonCount[k] ?? 0) + 1;
  }
  const withBars = members.filter((m) => series.has(m)).length;
  const coverage = { members: members.length, withBars, readNow, reasons: reasonCount };
  if (readNow < members.length) notes.push(`members read ${readNow}/${members.length} on the newest session — ${Object.entries(reasonCount).map(([k, v]) => `${v} ${k}`).join(', ')}`);

  // 3. cached-only context reads
  const flow = await (deps.flow ?? flowBySymbol)();
  if (!flow) notes.push('flow tape not read — flow chips and the flow consensus signal are n/a');
  const ideaRows = await (deps.ideas ?? openIdeas)();
  if (!ideaRows) notes.push('open NEXUS ideas not read');
  const nexusBy = new Map<string, { long: number; short: number; refs: IdeaRef[] }>();
  for (const i of ideaRows ?? []) {
    const sym = String(i.symbol ?? '').toUpperCase(); const dir: Side = String(i.direction).toLowerCase() === 'short' ? 'short' : 'long';
    const x = nexusBy.get(sym) ?? { long: 0, short: 0, refs: [] };
    x[dir]++; x.refs.push({ id: String(i.id), symbol: sym, direction: dir, source: i.source ?? null, at: i.timestamp ? new Date(i.timestamp).toISOString() : null, tag: 'neutral' });
    nexusBy.set(sym, x);
  }
  const peekIgn = deps.ignition ?? (await import('./sector-ignition')).peekSectorIgnition;
  const ign: Record<string, Map<string, IgnitionLeanInput>> = {};
  const ignAsOf: Record<string, string | null> = {};
  for (const h of ['intraday', 'daily', 'swing', 'weekly'] as const) {
    let st: any = null; try { st = peekIgn(h); } catch { st = null; }
    ignAsOf[h] = st?.asOf ?? null;
    if (st?.groups) ign[h] = new Map(st.groups.map((g: any) => [g.groupId, { stage: g.stage, side: g.side ?? null, asOf: st.asOf ?? null }]));
  }
  const gammaOf = deps.gamma ?? await gammaReader(et.dateKey);
  const levelsOf = deps.levels ?? await levelsReader();
  const earningsOf = deps.earnings ?? await earningsReader(nowMs);

  // 4. per-sector assembly
  const ovKind = ov?.kind ?? null;
  const rows: SectorRow[] = core.sectors.map((s) => {
    const side: Side = s.side ?? 'long';
    const mreads = s.members.filter((m) => series.has(m)).map((sym) => confluenceOf({
      symbol: sym, closes: series.get(sym)!, sectorR10: s.stats.r10,
      flow: flow ? (flow.by.get(sym) ?? { net: 0, big: 0 }) : null,
      gapPct: ov?.by[sym]?.pct ?? null,
      levels: levelsOf(sym, series.get(sym)!.at(-1) ?? null),
      gamma: gammaOf(sym),
      nexus: { long: nexusBy.get(sym)?.long ?? 0, short: nexusBy.get(sym)?.short ?? 0 },
      earnings: earningsOf(sym),
    }, side));
    const leaders = rankMembers(mreads, side);
    const top = new Set(leaders.slice(0, BOARD_CFG.leadersShown).map((l) => l.symbol));
    const fl = flow ? s.members.map((m) => flow.by.get(m)?.net ?? 0) : null;
    const etfGamma = s.etf ? gammaOf(s.etf) : null;
    const etfLast = s.etf ? series.get(s.etf)?.at(-1) : undefined;
    const ignRead = s.thematic ? null : Object.fromEntries(Object.entries(ign).map(([h, m]) => [h, m.get(s.id)]));
    const nexusCount = ideaRows ? s.members.reduce((a, m) => ({ long: a.long + (nexusBy.get(m)?.long ?? 0), short: a.short + (nexusBy.get(m)?.short ?? 0) }), { long: 0, short: 0 }) : null;
    const consensus = consensusOf({
      breadth: s.stats.breadth, rs: s.stats.rs, trendUp: s.trendUp, trendDown: s.trendDown, ignition: ignRead,
      flow: fl ? { net: fl.reduce((a, b) => a + b, 0), up: fl.filter((x) => x >= BOARD_CFG.confluence.flowMin).length, down: fl.filter((x) => x <= -BOARD_CFG.confluence.flowMin).length } : null,
      nexus: nexusCount,
      gex: etfGamma?.zeroGamma != null && etfLast != null && Number.isFinite(etfLast) ? { spot: etfLast, zeroGamma: etfGamma.zeroGamma, source: `${etfGamma.source}, ${etfGamma.asOf.slice(11, 16)}Z` } : null,
    });
    const ideas: IdeaRef[] = s.members.flatMap((m) => nexusBy.get(m)?.refs ?? []).map((r) => ({ ...r, tag: s.side == null ? 'neutral' : r.direction === s.side ? 'with' : 'against' }));
    return {
      id: s.id, label: s.label, etf: s.etf, thematic: s.thematic, memberCount: s.members.length, membersRead: s.stats.membersRead,
      unread: unreadBy.get(s.id) ?? [],
      rank: s.rank, rankThen: s.rankThen, rankDelta: s.rankDelta, composite: s.composite,
      r1: s.stats.r1, r3: s.stats.r3, r10: s.stats.r10, r20: s.stats.r20, breadth: s.stats.breadth, highsPct: s.stats.highsPct, lowsPct: s.stats.lowsPct,
      rs: s.stats.rs, rsMomentum: s.rsMomentum, regime: s.regime, side: s.side, stretch: s.stretch, drawdown: s.drawdown,
      history: s.history, consensus,
      overnight: { ...overnightDrift(s.members.map((m) => ov?.by[m]?.pct ?? null), s.side), kind: ovKind },
      leaders, laggards: laggardsOf(leaders, side, top), ideas,
    };
  }).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  const movers: OvernightMover[] = ov ? Object.entries(ov.by)
    .filter(([sym, x]) => Math.abs(x.pct) >= BOARD_CFG.overnight.moverPct && sym !== 'SPY')
    .map(([sym, x]) => ({ symbol: sym, movePct: x.pct, kind: ov.kind, price: x.price, at: x.at, sectors: groups.filter((g) => g.members.includes(sym) || g.etf === sym).map((g) => g.id) }))
    .filter((m) => m.sectors.length)
    .sort((a, b) => Math.abs(b.movePct) - Math.abs(a.movePct)).slice(0, 40) : [];

  const unranked = rows.filter((r) => r.rank == null).map((r) => r.label);
  if (unranked.length) notes.push(`not ranked (fewer than ${BOARD_CFG.minMembersRead} members read): ${unranked.join(', ')}`);
  if (provisional) notes.push(`last rank-flow column is today (${provisional.date}) priced from live quotes — provisional until the close`);
  if (!ov) notes.push('no overnight read yet — pre-market gaps are read at 08:45/09:20 ET, after-hours at 16:15/17:45 ET');

  // 5. forward log (close only, once per date)
  let forward: BoardSnapshot['forward'] = { rows: 0, summary: outcomeSummary([]), since: null };
  try {
    const logRows = await readForwardLog();
    let add: BoardLogRow[] = [];
    if (phase === 'close' && deps.log !== false && !logRows.some((r) => r.kind === 'leaders' && r.date === et.dateKey)) {
      add = leaderLogRows(rows.map((r) => ({ id: r.id, rank: r.rank, side: r.side, regime: r.regime, members: groups.find((g) => g.id === r.id)!.members, leaders: r.leaders })), et.dateKey, new Date(nowMs).toISOString());
    }
    if (phase === 'close' || phase === 'after_hours') {
      const completed = dates.filter((d) => d <= et.dateKey);
      add = add.concat(outcomesDue([...logRows, ...add], closes, completed, new Date(nowMs).toISOString()));
    }
    if (add.length && deps.log !== false) await appendForward(add);
    const allRows = [...logRows, ...add];
    forward = { rows: allRows.length, summary: outcomeSummary(allRows), since: allRows.find((r) => r.kind === 'leaders')?.date ?? null };
  } catch (err) { notes.push(`forward log unavailable: ${(err as Error).message}`); }

  const mem1 = process.memoryUsage();
  const snap: BoardSnapshot = {
    asOf: new Date(nowMs).toISOString(), dateKey: et.dateKey, phase, sessionThrough, provisional,
    sessions: core.sessions, sectors: rows, climbers: core.climbers, sliders: core.sliders,
    overnight: { kind: ov?.kind ?? null, at: ov?.at ?? null, movers },
    forward,
    dataAsOf: { dailyClose: newest, overnight: ov?.at ?? null, flow: flow?.asOf ?? null, ...Object.fromEntries(Object.entries(ignAsOf).map(([h, v]) => [`ignition_${h}`, v])) },
    notes,
    compute: { ms: Date.now() - t0, rssBeforeMb: mb(mem0.rss), rssAfterMb: mb(mem1.rss), heapDeltaMb: mb(mem1.heapUsed - mem0.heapUsed), symbols: series.size },
    coverage,
    cadence: BOARD_CADENCE,
    status: 'measuring',
  };
  return snap;
}
const mb = (b: number) => Math.round(b / 1048576);

// ─── forward log ─────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), '.cache', 'sector-board');
export async function readForwardLog(months = 3): Promise<BoardLogRow[]> {
  try {
    const files = (await fsp.readdir(LOG_DIR)).filter((f) => /^forward-\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-months);
    const out: BoardLogRow[] = [];
    for (const f of files) {
      for (const line of (await fsp.readFile(path.join(LOG_DIR, f), 'utf8')).split('\n')) {
        if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* torn line */ } }
      }
    }
    return out;
  } catch { return []; }
}
async function appendForward(rows: BoardLogRow[]): Promise<void> {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `forward-${new Date().toISOString().slice(0, 7)}.jsonl`);
  await fsp.appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

// ─── scheduled run (worker) ──────────────────────────────────────────────

export async function runSectorBoard(opts: { force?: boolean } = {}): Promise<number> {
  const nowMs = Date.now();
  const phase = boardPhase(nowMs);
  if (phase === 'closed' && !opts.force) return 0;
  if (inflight) { await inflight; return 0; }
  let runQuotes: Map<string, any> | null = null;
  inflight = computeSectorBoard({ nowMs, phase, onBase: (b, q) => { liveBase = b; runQuotes = q; } });
  try {
    const snap = await inflight;
    last = snap;
    if (writesSharedState()) await writeShared(BOARD_SHARED, snap);
    // Re-derive the live overlay from this run's own quotes (no second read) so the
    // live layer is never older than the board it sits on.
    try { if (runQuotes) await runSectorBoardLive({ quotes: runQuotes, nowMs }); } catch (err) { logger.warn(`[SECTOR-BOARD] live overlay after run failed: ${(err as Error).message}`); }
    const cov = snap.coverage;
    if (cov) logger.info(`[SECTOR-BOARD] coverage: ${cov.readNow}/${cov.members} members read on the newest session, ${cov.withBars} with bars${Object.keys(cov.reasons).length ? ` — ${Object.entries(cov.reasons).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}`);
    // Rotation suggestions ride the board (server/sector-rotation-ideas.ts) — bounded level-map reads, never fatal.
    try {
      const { refreshRotationSuggestions } = await import('./sector-rotation-ideas');
      await refreshRotationSuggestions(snap);
    } catch (err) { logger.warn(`[SECTOR-BOARD] rotation suggestions failed: ${(err as Error).message}`); }
    const top = snap.sectors.slice(0, 3).map((s) => `${s.label}(${s.regime ?? '—'})`).join(', ');
    logger.info(`[SECTOR-BOARD] ${phase}: ${snap.sectors.length} sectors, top ${top}; ${snap.compute.ms} ms, rss ${snap.compute.rssBeforeMb}→${snap.compute.rssAfterMb} MB, ${snap.compute.symbols} symbols`);
    return snap.sectors.length;
  } finally { inflight = null; }
}

// ─── live pass (worker): quotes only, every 5 min in session ─────────────

let liveBase: LiveBase | null = null;
let liveLast: BoardLive | null = null;
let liveRunning = false;

export function toLiveQuote(q: any, phase: BoardPhase): LiveQuote {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const at = phase === 'premarket' ? q.preMarketAt ?? null : phase === 'after_hours' || phase === 'closed' ? q.postMarketAt ?? q.regularAt ?? null : q.regularAt ?? null;
  return {
    price: num(q.price), prevClose: num(q.previousClose), open: num(q.sessionOpen), vwap: num(q.vwap), p30: num(q.price30mAgo),
    preGapPct: num(q.preMarketGapPct), postMovePct: num(q.postMarketMovePct), regular: num(q.regularMarketPrice),
    at: at ?? q.fetchedAt ?? null,
  };
}

export interface LiveDeps { nowMs?: number; phase?: BoardPhase; quotes?: Map<string, any>; force?: boolean }

/** One quotes-only pass: re-price today, intraday ranks, breadth, the in-day ring. Never re-reads daily bars. */
export async function runSectorBoardLive(deps: LiveDeps = {}): Promise<number> {
  const nowMs = deps.nowMs ?? Date.now();
  const phase = deps.phase ?? boardPhase(nowMs);
  if (phase === 'closed' && !deps.force) return 0;
  // A scheduled pass yields to a running heavy run — that run re-derives the overlay itself.
  if (!deps.quotes && (inflight || liveRunning)) return 0;
  liveRunning = true;
  const t0 = Date.now(); const mem0 = process.memoryUsage();
  try {
    const et = etParts(nowMs);
    const groups = boardGroups();
    const all = Array.from(new Set(['SPY', ...groups.map((g) => g.etf).filter((e): e is string => !!e), ...groups.flatMap((g) => g.members)]));
    const raw = deps.quotes ?? await (await import('./pre-market-service')).getPreMarketBatch(all, 6);
    const quotes = new Map<string, LiveQuote>();
    for (const [sym, q] of raw) quotes.set(sym, toLiveQuote(q, phase));
    let prev = liveLast;
    if (!prev || prev.dateKey !== et.dateKey) {
      const r = readShared<BoardLive>(LIVE_SHARED);
      prev = r?.data?.dateKey === et.dateKey ? r.data : null; // a restarted worker keeps today's ring
    }
    const base = liveBase && liveBase.dateKey === et.dateKey ? liveBase : null;
    const core = computeLive({ nowMs, dateKey: et.dateKey, phase, groups, quotes, base, prev });
    const mem1 = process.memoryUsage();
    const live: BoardLive = { ...core, compute: { ms: Date.now() - t0, heapDeltaMb: mb(mem1.heapUsed - mem0.heapUsed), rssMb: mb(mem1.rss) } };
    liveLast = live;
    if (writesSharedState()) await writeShared(LIVE_SHARED, live);
    const moving = Object.entries(live.sectors).filter(([, s]) => s.last30m != null).sort((a, b) => Math.abs(b[1].last30m!) - Math.abs(a[1].last30m!)).slice(0, 3)
      .map(([id, s]) => `${id} ${s.last30m! >= 0 ? '+' : ''}${s.last30m}%`).join(', ');
    logger.info(`[SECTOR-BOARD] live ${phase}: ${live.quoted}/${all.length} quoted, ${live.points.length} ring pts, base ${live.base ? 'yes' : 'none'}${moving ? `, last 30m ${moving}` : ''}; ${live.compute.ms} ms, rss ${mb(mem0.rss)}→${live.compute.rssMb} MB${deps.quotes ? ' (board run quotes)' : ''}`);
    return live.quoted;
  } finally { liveRunning = false; }
}

/** Worker startup: publish once if the newest snapshot is missing or older than a day (weekend/holiday deploys). */
export function scheduleSectorBoardBootstrap(delayMs = 180_000): void {
  const t = setTimeout(async () => {
    const r = readShared<BoardSnapshot>(BOARD_SHARED);
    if (last || (r && r.ageMs < 86_400_000)) return;
    try {
      const { runHeavy } = await import('./lib/heavy-job-gate');
      await runHeavy('producer:sector-board:bootstrap', () => runSectorBoard({ force: true }), { priority: 'low' });
    } catch (err) { logger.warn(`[SECTOR-BOARD] bootstrap failed: ${(err as Error).message}`); }
  }, delayMs);
  t.unref?.();
}

// ─── read side (web) ─────────────────────────────────────────────────────

export function readBoard(): { snap: BoardSnapshot | null; stamp: ReturnType<typeof sharedStamp> } {
  if (readsSharedState()) {
    const r = readShared<BoardSnapshot>(BOARD_SHARED, 35 * 60_000);
    return { snap: r?.data ?? null, stamp: sharedStamp(r) };
  }
  if (!last) {
    const r = readShared<BoardSnapshot>(BOARD_SHARED, 35 * 60_000);
    if (r?.data) last = r.data;
  }
  if (!last && runsWorkerJobs() && !inflight) {
    // ROLE=all (dev / rollback): compute in the background; this request answers "warming".
    void import('./lib/heavy-job-gate').then(({ runHeavy }) => runHeavy('producer:sector-board:first-read', () => runSectorBoard({ force: true }), { priority: 'low' })).catch(() => {});
  }
  const ageMs = last ? Date.now() - Date.parse(last.asOf) : null;
  return { snap: last, stamp: last ? { source: 'memory', asOf: last.asOf, ageSec: Math.round(ageMs! / 1000), stale: ageMs! > 35 * 60_000 } : { source: 'memory', asOf: null, ageSec: null, stale: true } };
}

export function readLive(): BoardLive | null {
  if (!readsSharedState() && liveLast) return liveLast;
  const r = readShared<BoardLive>(LIVE_SHARED, 40 * 60_000);
  return r?.data ?? null;
}

/** Live header block (the ring's times, not every sector's arrays). */
function liveMeta(live: BoardLive | null, applied: boolean) {
  if (!live || !applied) return null;
  return { asOf: live.asOf, quotesAt: live.quotesAt, phase: live.phase, quoted: live.quoted, total: live.total, base: live.base, applied,
    points: live.points, notes: live.notes, compute: live.compute, cadence: LIVE_CADENCE };
}

/** The board list: every sector without member chip detail (the panel route carries that), with the live pass laid over. */
export function boardSummary(snap: BoardSnapshot, live: BoardLive | null = null) {
  const merged = applyLive(snap, live);
  return {
    ...snap,
    live: liveMeta(live, merged.applied),
    sectors: merged.sectors.map((s) => ({
      ...s,
      // the list carries the spark; the rank rings stay server-side (rank15/rank30 already derived)
      live: s.live ? (({ ranks: _r, iranks: _i, ...rest }) => rest)(s.live) : null,
      leaders: s.leaders.slice(0, BOARD_CFG.leadersShown).map((l) => ({ symbol: l.symbol, score: l.score, passed: l.passed, available: l.available, r1: l.r1, relSector: l.relSector })),
      laggards: s.laggards.map((l) => ({ symbol: l.symbol, relSector: l.relSector })),
      ideas: { with: s.ideas.filter((i) => i.tag === 'with').length, against: s.ideas.filter((i) => i.tag === 'against').length, total: s.ideas.length },
    })),
  };
}

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerSectorBoardRoutes(app: Express, requireBetaAccess: Mw) {
  const empty = (stamp: unknown) => ({
    asOf: null, phase: null, sectors: [], sessions: [], climbers: [], sliders: [], overnight: { kind: null, at: null, movers: [] },
    notes: ['not published yet — the worker publishes at ' + BOARD_CADENCE], cadence: BOARD_CADENCE, honesty: BOARD_HONESTY, stamp, status: 'measuring',
  });
  app.get('/api/sectors/board', requireBetaAccess, (_req, res) => {
    const { snap, stamp } = readBoard();
    if (!snap) return res.json(empty(stamp));
    res.json({ ...boardSummary(snap, readLive()), honesty: BOARD_HONESTY, config: BOARD_CFG, stamp, generatedAt: new Date().toISOString() });
  });
  app.get('/api/sectors/:id', requireBetaAccess, (req, res) => {
    const id = String(req.params.id ?? '').toLowerCase();
    if (!/^[a-z0-9_]{1,40}$/.test(id)) return res.status(400).json({ error: 'bad sector id' });
    const { snap, stamp } = readBoard();
    if (!snap) return res.status(404).json({ ...empty(stamp), error: 'not published yet' });
    const live = readLive();
    const merged = applyLive(snap, live);
    const sector = merged.sectors.find((s) => s.id === id);
    if (!sector) return res.status(404).json({ error: `unknown sector ${id}` });
    res.json({
      sector, live: liveMeta(live, merged.applied), asOf: snap.asOf, phase: snap.phase, sessions: snap.sessions, sessionThrough: snap.sessionThrough, provisional: snap.provisional,
      overnight: { kind: snap.overnight.kind, at: snap.overnight.at, movers: snap.overnight.movers.filter((m) => m.sectors.includes(id)) },
      dataAsOf: snap.dataAsOf, honesty: BOARD_HONESTY, stamp, status: 'measuring', generatedAt: new Date().toISOString(),
    });
  });
}
