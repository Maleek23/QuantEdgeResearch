/**
 * GEX WALL-TOUCH ENGINE — live detection + forward log. OFF by default. MEASURING.
 * ===============================================================================
 * Detects price APPROACHING / TOUCHING / REJECTING / BREAKING a put or call wall
 * (detector: server/wall-touch-core.ts), raises in-app alerts, and logs every
 * touch with its outcome so the idea is measured going forward.
 *
 * HONESTY. Historical GEX walls cannot be replayed (no historical chains / OI),
 * so the evidence for this engine is the FORWARD LOG written here. The proxy
 * replay (research/wall-touch-proxy-replay.ts) measures the same detector on
 * levels that CAN be reconstructed (round strikes, prior-day H/L, opening-range
 * H/L) and is labelled a proxy everywhere.
 *
 * MEMORY (2 GB droplet; one full-chain GEX pass costs 150–250 MB transient).
 * Walls come from open interest, which only changes overnight, so each name's
 * walls are computed ONCE per session — pre-market ~09:00 ET and again ~12:30 ET
 * — sequentially, one symbol per runHeavy slot (server/lib/heavy-job-gate.ts),
 * via calculateAggregateGammaExposure (60-s cache) and its `byDte.next7` book
 * (shared/gex-buckets.ts: expiries within 8 days). The all-expiry walls are used
 * only when next7 is missing, and labelled so. A wall-map pass stops early when
 * RSS is above WALL_TOUCH_MAP_RSS_CEILING_MB (default 650); the rest are marked
 * deferred (the 12:30 pass recomputes every name). Per-symbol RSS before/after
 * is recorded on the map. Measured 2026-10-01 (local probe, real Alpaca chains):
 * SPY's full chain took RSS 107 → 436 MB (+329 MB, the largest), QQQ/IWM/AMD/
 * NVDA/TSLA/META each ran inside the already-grown heap (≤ +50 MB); sampled
 * peak 496 MB for 8 names in 21 s — hence the 650 MB ceiling, not 800.
 *
 * INTRADAY uses ONLY 1-minute price bars from the 0DTE sniper's stage-1 store
 * (refreshStage1Bars / peekStage1Bars — one incremental batched Alpaca request
 * shared with the sniper and Holy Grail). An option chain is read only when a
 * rejection or break is confirmed (≤ WALL_TOUCH_MAX_CHAINS per cycle, default 2,
 * each through runHeavy 'high'): expiry ≤ 7 days, strikes ±5%, nearest OTM via
 * the sniper's picker — call for a put-wall bounce / call-wall break, put for a
 * call-wall rejection / put-wall break. SPX walls are read on SPY bars × the
 * SPX/SPY ratio at map time (labelled); SPY is the SPX contract vehicle.
 *
 * OUTPUTS
 *   • watch rows + alerts (pulse + /ws/bot, as the 0DTE desk does), debounced:
 *     one per wall per state per session; exact ET timestamps to the second.
 *   • FORWARD LOG .cache/wall-touch/events-YYYY-MM.jsonl (monthly, 6 kept, 20 MB
 *     roll-over): map / approach / touch / rejection / break / stall / alert
 *     lines as they happen, and one `outcome` line per touch after the close
 *     (+15/+30/+60 min and close vs the wall, MFE/MAE, the option's price path).
 *   • GET /api/wall-touch (state), /api/wall-touch/report (forward-log summary),
 *     /api/wall-touch/:symbol (badge). ROLE=web reads the worker's shared files.
 *
 * No ideas are published. WALL_TOUCH=true (worker role) is required for the schedule.
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { readShared, sharedStamp, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etDateKey, etMinutes, parseWatch } from './zero-dte-desk-core';
import { etClock, hhmm, pickNearestOtm, type ContractCandidate, type MinuteBar } from './zero-dte-sniper-core';
import {
  detectWalls, fmtLevel, fmtPctAbs, optionPathOutcome, optionTypeFor, statusLine, summarizeWallLog, tradeSideFor, underlyingOutcome,
  type OptMinute, type UnderlyingOutcome, type WallEvent, type WallKind, type WallLevel, type WallRecord, type WallStatus,
} from './wall-touch-core';
import type { GexByDte } from '@shared/gex-buckets';

export const WALL_SHARED = 'wall-touch';
export const WALL_MAP_SHARED = 'wall-touch-map';
const INDEXES = ['SPX', 'SPY', 'QQQ', 'IWM'];

export const WALL_LIVE_CFG = {
  START_MIN: 9 * 60 + 31,
  END_MIN: 16 * 60,
  UNIVERSE_CAP: Math.max(4, Number(process.env.WALL_TOUCH_UNIVERSE_CAP) || 48),
  BOARD_TOP: Math.max(0, Number(process.env.WALL_TOUCH_BOARD_TOP ?? 40)),
  MAX_CHAINS: Math.max(0, Number(process.env.WALL_TOUCH_MAX_CHAINS ?? 2)),
  /** An event must have become known (bar close) within this window to alert / read a chain. */
  FRESH_MS: 3 * 60_000,
  MAP_RSS_CEILING_MB: Math.max(300, Number(process.env.WALL_TOUCH_MAP_RSS_CEILING_MB) || 650),
  CHAIN_BAND: 0.05,
  CHAIN_MAX_DAYS: 7,
} as const;

export function wallTouchEnabled(): boolean {
  return process.env.WALL_TOUCH === 'true';
}

// ─── types ────────────────────────────────────────────────────────────────

export interface WallMapEntry {
  symbol: string;
  ok: boolean;
  error: string | null;
  spot: number | null;
  putWall: number | null;
  callWall: number | null;
  flip: number | null;
  basis: 'next7' | 'all' | null;
  basisLabel: string;
  expirations: number | null;
  source: string | null;
  chainAsOf: string | null;
  openInterestDate: string | null;
  computedAt: string;
  ms: number;
  rssBeforeMb: number;
  rssAfterMb: number;
}
export interface WallMap {
  dateKey: string;
  passes: Array<{ phase: string; startedAt: string; finishedAt: string; computed: number; failed: number; deferred: string[]; peakRssMb: number; maxDeltaMb: number }>;
  entries: Record<string, WallMapEntry>;
  /** Detection levels per symbol: current walls plus superseded ones (untilMs) so pending touches resolve. */
  levels: Record<string, WallLevel[]>;
  spxPerSpy: number | null;
  universe: string[];
  label: 'measuring';
}
export interface WallContract {
  occ: string; strike: number; type: 'call' | 'put'; expiry: string; dte: number; label: string;
  bid: number | null; ask: number | null; mid: number | null; vehicle: string; quoteAt: string; source: string;
}
export interface WallEventRow {
  id: string;
  touchId: string;
  kind: WallEvent['kind'];
  symbol: string;
  wall: WallKind;
  wallPrice: number;
  wallBasis: string;
  touch: number;
  /** Bar START, ISO + ET to the second (the minute in which it printed). */
  barAt: string; barEt: string;
  /** When it became known: bar CLOSE, ISO + ET to the second. */
  at: string; atEt: string;
  price: number;
  extreme: number;
  distPct: number;
  atr5: number;
  rvol: number | null;
  text: string;
  contract: WallContract | null;
  contractNote: string | null;
  /** Logged later than the bar close by more than the freshness window (engine was down / late). */
  late: boolean;
  measuring: true;
}
export interface WallRow {
  symbol: string;
  wall: WallKind;
  wallPrice: number;
  wallBasis: string;
  state: WallStatus['state'];
  distPct: number | null;
  touches: number;
  line: string;
  lastEvent: { kind: string; atEt: string; price: number } | null;
  live: UnderlyingOutcome | null;
  contract: WallContract | null;
  superseded: boolean;
}
export interface WallAlert { key: string; at: string; atEt: string; symbol: string; kind: string; text: string }
export interface WallCycle {
  at: string; dateKey: string; enabled: boolean; skipped: string | null;
  symbols: number; requests: number; feed: string | null; barsHeld: number;
  newEvents: number; chains: { used: number; cap: number; deferred: string[] };
  cycleMs: number; memory: { rssBeforeMb: number; rssAfterMb: number };
  errors: string[]; label: 'measuring';
}

// ─── small utils ─────────────────────────────────────────────────────────

const mb = (n: number) => Math.round(n / 1024 / 1024);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const etSec = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
function etWallMs(dateKey: string, minOfDay: number): number {
  const guess = Date.parse(`${dateKey}T${hhmm(minOfDay)}:00Z`);
  for (const off of [4, 5]) { const t = guess + off * 3600_000; if (etMinutes(t) === minOfDay && etDateKey(t) === dateKey) return t; }
  return guess + 4 * 3600_000;
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
const stockOf = (sym: string) => (sym === 'SPX' ? 'SPY' : sym);

// ─── forward log (append-only jsonl, monthly rotation — as server/sector-ignition.ts) ──

const LOG_DIR = () => process.env.WALL_TOUCH_LOG_DIR || path.join(process.cwd(), '.cache', 'wall-touch');
const LOG_MAX_BYTES = 20 * 1024 * 1024;
const LOG_KEEP_MONTHS = 6;

export async function appendWallLog(lines: object[]): Promise<void> {
  if (!lines.length) return;
  const dir = LOG_DIR();
  try {
    await fs.mkdir(dir, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    let file = path.join(dir, `events-${month}.jsonl`);
    const st = await fs.stat(file).catch(() => null);
    if (st && st.size > LOG_MAX_BYTES) file = path.join(dir, `events-${month}-${Date.now()}.jsonl`);
    await fs.appendFile(file, lines.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    const files = (await fs.readdir(dir)).filter((f) => /^events-\d{4}-\d{2}/.test(f)).sort();
    const months = Array.from(new Set(files.map((f) => f.slice(7, 14)))).sort();
    const drop = new Set(months.slice(0, Math.max(0, months.length - LOG_KEEP_MONTHS)));
    for (const f of files) if (drop.has(f.slice(7, 14))) await fs.unlink(path.join(dir, f)).catch(() => {});
  } catch (err) {
    logger.warn(`[WALL-TOUCH] log write failed: ${(err as Error).message}`);
  }
}

/** Every parsed line of the newest `months` monthly files (oldest first). */
export async function readWallLog(months = LOG_KEEP_MONTHS): Promise<any[]> {
  const dir = LOG_DIR();
  try {
    const files = (await fs.readdir(dir)).filter((f) => /^events-\d{4}-\d{2}/.test(f)).sort();
    const keep = new Set(Array.from(new Set(files.map((f) => f.slice(7, 14)))).sort().slice(-months));
    const out: any[] = [];
    for (const f of files) {
      if (!keep.has(f.slice(7, 14))) continue;
      const txt = await fs.readFile(path.join(dir, f), 'utf8');
      for (const line of txt.split('\n')) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* torn line */ } } }
    }
    return out;
  } catch { return []; }
}

// ─── state ────────────────────────────────────────────────────────────────

let map: WallMap | null = null;
let mapInflight: Promise<WallMap> | null = null;
let lateMapKickDay = '';
let day = {
  dateKey: '', seeded: false,
  seen: new Set<string>(), alerted: new Set<string>(),
  events: [] as WallEventRow[], alerts: [] as WallAlert[],
  contracts: new Map<string, { contract: WallContract | null; note: string | null }>(),
};
let lastCycle: WallCycle | null = null;
let lastRows: WallRow[] = [];
let inflight: Promise<WallCycle> | null = null;
const rvolBase = new Map<string, { dateKey: string; slots: Float64Array }>();

function resetDay(dateKey: string) {
  if (day.dateKey === dateKey) return;
  day = { dateKey, seeded: false, seen: new Set(), alerted: new Set(), events: [], alerts: [], contracts: new Map() };
  lastRows = [];
}

function loadMap(dateKey: string): WallMap | null {
  if (map && map.dateKey === dateKey) return map;
  const r = readShared<WallMap>(WALL_MAP_SHARED);
  if (r && r.data?.dateKey === dateKey) { map = r.data; return map; }
  return null;
}

// ─── universe + wall map ──────────────────────────────────────────────────

export function buildWallUniverse(input: { board: string[]; watch: string[]; cap: number; boardTop: number }): string[] {
  const ordered = [...INDEXES, ...input.board.slice(0, input.boardTop), ...input.watch].map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z.]{1,6}$/.test(s));
  return Array.from(new Set(ordered)).slice(0, input.cap);
}

async function boardSymbols(): Promise<string[]> {
  try {
    const { peekConvictions } = await import('./convictions-engine');
    const hit = peekConvictions(); // never triggers a build
    return hit ? hit.data.picks.map((p) => p.symbol) : [];
  } catch { return []; }
}

type GexLike = { spotPrice: number; callWall?: number | null; putWall?: number | null; flipPoint: number | null; byDte?: unknown; dataSource?: string; dataQuality?: { chainFetchedAt?: string; openInterestDate?: string | null } };
type ComputeFn = (sym: string) => Promise<GexLike | null>;
type GateFn = <T>(name: string, fn: () => Promise<T>) => Promise<T | undefined>;

const defaultGate = (priority: 'high' | 'normal', maxWaitMs: number): GateFn => async (name, fn) => (await import('./lib/heavy-job-gate')).runHeavy(name, fn, { priority, maxWaitMs });

/** Walls for one result: the next-7-day book, falling back (labelled) to the all-expiry walls. */
export function wallsFromGex(g: GexLike): Pick<WallMapEntry, 'putWall' | 'callWall' | 'flip' | 'basis' | 'basisLabel' | 'expirations'> {
  const n7 = (g.byDte as GexByDte | undefined)?.next7;
  if (n7 && (n7.putWall != null || n7.callWall != null)) {
    return { putWall: n7.putWall, callWall: n7.callWall, flip: n7.gammaFlipPrice, basis: 'next7', basisLabel: `next-7-day book (expiries ≤7d, ${n7.expirationsCount})`, expirations: n7.expirationsCount };
  }
  return { putWall: g.putWall ?? null, callWall: g.callWall ?? null, flip: g.flipPoint ?? null, basis: 'all', basisLabel: 'all expiries (no near-dated book — fallback)', expirations: null };
}

/** Merge a fresh wall pick into the detection levels: unchanged walls keep their start; replaced ones get untilMs. */
export function mergeLevels(prev: WallLevel[] | undefined, next: { putWall: number | null; callWall: number | null }, sinceMs: number | undefined): WallLevel[] {
  const out: WallLevel[] = (prev ?? []).map((l) => ({ ...l }));
  for (const kind of ['put', 'call'] as const) {
    const price = kind === 'put' ? next.putWall : next.callWall;
    const cur = out.find((l) => l.kind === kind && l.untilMs == null);
    if (cur && price != null && Math.abs(cur.price - price) < 1e-9) continue;
    // Before the open a replaced wall simply goes; during the session it is kept (untilMs) so its pending touch resolves.
    if (cur && sinceMs == null) out.splice(out.indexOf(cur), 1);
    else if (cur) cur.untilMs = sinceMs;
    if (price != null && price > 0) out.push({ kind, price, ...(sinceMs != null ? { sinceMs } : {}) });
  }
  return out;
}

/**
 * Compute the day's wall map, sequentially, one symbol per heavy-gate slot.
 * `phase` is a label (premarket / midday / late). Options exist for tests.
 */
export async function computeWallMap(phase: string, nowMs = Date.now(), opts: { universe?: string[]; computeFn?: ComputeFn; gate?: GateFn; persist?: boolean; pauseMs?: number } = {}): Promise<WallMap> {
  if (mapInflight) return mapInflight;
  mapInflight = (async () => {
    const dateKey = etDateKey(nowMs);
    const startedAt = new Date().toISOString();
    // NEXUS tracked symbols (source 'tracked') lead the board slice so the cap never drops them.
    const universe = opts.universe ?? buildWallUniverse({ board: [...(await import('./nexus-tracked')).getTrackedSymbols(), ...await boardSymbols()], watch: parseWatch(process.env.ZERO_DTE_WATCH), cap: WALL_LIVE_CFG.UNIVERSE_CAP, boardTop: WALL_LIVE_CFG.BOARD_TOP });
    const prev = loadMap(dateKey);
    const m: WallMap = prev ? { ...prev, entries: { ...prev.entries }, levels: { ...prev.levels }, passes: [...prev.passes], universe: Array.from(new Set([...prev.universe, ...universe])) }
      : { dateKey, passes: [], entries: {}, levels: {}, spxPerSpy: null, universe, label: 'measuring' };
    const compute: ComputeFn = opts.computeFn ?? (async (sym) => (await import('./gamma-exposure')).calculateAggregateGammaExposure(sym) as Promise<GexLike | null>);
    const gate = opts.gate ?? defaultGate('normal', 10 * 60_000);
    const openMs = etWallMs(dateKey, 9 * 60 + 30);
    // Walls known before the open apply to the whole session; a midday pick applies from when it was computed.
    const sinceMs = nowMs < openMs ? undefined : nowMs;
    let computed = 0, failed = 0, peak = 0, maxDelta = 0;
    const deferred: string[] = [];
    for (let i = 0; i < universe.length; i++) {
      const sym = universe[i];
      const before = process.memoryUsage().rss;
      if (mb(before) > WALL_LIVE_CFG.MAP_RSS_CEILING_MB) { deferred.push(...universe.slice(i)); logger.warn(`[WALL-TOUCH] map ${phase}: RSS ${mb(before)} MB > ceiling ${WALL_LIVE_CFG.MAP_RSS_CEILING_MB} — deferred ${universe.length - i} names`); break; }
      const t0 = Date.now();
      let g: GexLike | null | undefined = null; let err: string | null = null;
      try { g = await gate(`wall-map:${sym}`, () => compute(sym)); } catch (e) { err = (e as Error).message; }
      const after = process.memoryUsage().rss;
      peak = Math.max(peak, mb(after)); maxDelta = Math.max(maxDelta, mb(after - before));
      const base = { symbol: sym, computedAt: new Date().toISOString(), ms: Date.now() - t0, rssBeforeMb: mb(before), rssAfterMb: mb(after), source: null, chainAsOf: null, openInterestDate: null, spot: null };
      if (!g || !(g.spotPrice > 0)) {
        failed++;
        // Keep a previous good pick for the day rather than erase it.
        if (!m.entries[sym]?.ok) m.entries[sym] = { ...base, ok: false, error: err ?? (g === undefined ? 'heavy gate dropped the job' : 'no chain'), putWall: null, callWall: null, flip: null, basis: null, basisLabel: '—', expirations: null };
      } else {
        const w = wallsFromGex(g);
        m.entries[sym] = { ...base, ok: w.putWall != null || w.callWall != null, error: null, spot: g.spotPrice, ...w, source: g.dataSource ?? null, chainAsOf: g.dataQuality?.chainFetchedAt ?? null, openInterestDate: g.dataQuality?.openInterestDate ?? null };
        m.levels[sym] = mergeLevels(m.levels[sym], w, sinceMs);
        computed++;
      }
      if (opts.pauseMs !== 0) await sleep(opts.pauseMs ?? 250); // let the GC take the chain before the next one
    }
    const spx = m.entries.SPX, spy = m.entries.SPY;
    if (spx?.spot && spy?.spot) m.spxPerSpy = +(spx.spot / spy.spot).toFixed(5);
    m.passes.push({ phase, startedAt, finishedAt: new Date().toISOString(), computed, failed, deferred, peakRssMb: peak, maxDeltaMb: maxDelta });
    if (m.passes.length > 6) m.passes = m.passes.slice(-6);
    map = m;
    if (opts.persist !== false) {
      writeSharedSync(WALL_MAP_SHARED, m); // always — the worker rehydrates from it after a restart
      await appendWallLog([{ type: 'map', dateKey, phase, at: new Date().toISOString(), spxPerSpy: m.spxPerSpy, peakRssMb: peak, maxDeltaMb: maxDelta, deferred, walls: Object.values(m.entries).map((e) => ({ s: e.symbol, put: e.putWall, call: e.callWall, flip: e.flip, basis: e.basis, spot: e.spot, src: e.source, oi: e.openInterestDate, err: e.error })) }]);
    }
    logger.info(`[WALL-TOUCH] map ${phase}: ${computed} computed, ${failed} failed, ${deferred.length} deferred · peak RSS ${peak} MB · max per-symbol Δ ${maxDelta} MB (measuring)`);
    return m;
  })().finally(() => { mapInflight = null; });
  return mapInflight;
}

// ─── RVOL baseline (once a day, 5-min bars, time-of-day matched) ──────────

async function ensureRvolBaseline(symbols: string[], dateKey: string, nowMs: number, fetchJson?: import('./zero-dte-sniper').FetchJson): Promise<void> {
  if (process.env.WALL_TOUCH_RVOL === 'false') return;
  const need = symbols.filter((s) => rvolBase.get(s)?.dateKey !== dateKey);
  if (!need.length) return;
  const { fetchStockBarsBatched } = await import('./zero-dte-sniper');
  for (let i = 0; i < need.length; i += 25) {
    const chunk = need.slice(i, i + 25);
    let rows: Map<string, any[]>;
    try { rows = await fetchStockBarsBatched(chunk, '5Min', new Date(nowMs - 32 * 86400_000).toISOString(), fetchJson); }
    catch (e) { logger.warn(`[WALL-TOUCH] RVOL baseline failed: ${(e as Error).message}`); return; }
    for (const s of chunk) {
      const bySession = new Map<string, Float64Array>();
      for (const b of rows.get(s) ?? []) {
        const ck = etClock(Date.parse(b.t));
        if (ck.dateKey >= dateKey || ck.min < 570 || ck.min >= 960) continue;
        const a = bySession.get(ck.dateKey) ?? new Float64Array(78).fill(NaN);
        a[Math.floor((ck.min - 570) / 5)] = b.v;
        bySession.set(ck.dateKey, a);
      }
      const sessions = [...bySession.keys()].sort().slice(-20).map((k) => bySession.get(k)!);
      const slots = new Float64Array(78).fill(NaN);
      for (let k = 0; k < 78; k++) {
        let sum = 0, n = 0;
        for (const a of sessions) if (Number.isFinite(a[k])) { sum += a[k]; n++; }
        if (n >= 10) slots[k] = sum / n;
      }
      rvolBase.set(s, { dateKey, slots });
    }
  }
}

/** ≈ time-of-day RVOL: the trigger 1-min bar's volume ÷ (20-session mean of its 5-min slot ÷ 5). */
export function rvolFor(slots: Float64Array | undefined, bar: { min: number; v: number }): number | null {
  if (!slots) return null;
  const k = Math.floor((bar.min - 570) / 5);
  const avg = slots[k];
  return Number.isFinite(avg) && avg > 0 ? +(bar.v / (avg / 5)).toFixed(2) : null;
}

// ─── contracts ────────────────────────────────────────────────────────────

/** Nearest-OTM contract, nearest expiry ≤ 7 days, from the given chain rows (pure). */
export function pickWallContract(contracts: Array<{ occ: string; strike: number; type: 'call' | 'put'; expiration: string; bid: number | null; ask: number | null; volume: number }>, spot: number, type: 'call' | 'put', todayKey: string): { c: (typeof contracts)[number]; dte: number } | null {
  const exps = Array.from(new Set(contracts.filter((c) => c.expiration >= todayKey && c.type === type).map((c) => c.expiration))).sort();
  for (const exp of exps) {
    const rows = contracts.filter((c) => c.expiration === exp && c.type === type);
    const cands: ContractCandidate[] = rows.map((c) => ({ occ: c.occ, strike: c.strike, type: c.type, price: c.ask, volume: c.volume }));
    const p = pickNearestOtm(cands, spot, type);
    if (p) return { c: rows.find((r) => r.occ === p.occ)!, dte: daysBetween(todayKey, exp) };
  }
  return null;
}

async function attachContract(sym: string, side: 'long' | 'short', price: number, nowMs: number, gate: GateFn): Promise<{ contract: WallContract | null; note: string | null }> {
  const type = optionTypeFor(side);
  const vehicle = stockOf(sym);
  const ratio = sym === 'SPX' ? map?.spxPerSpy ?? null : null;
  if (sym === 'SPX' && !ratio) return { contract: null, note: 'no SPX/SPY ratio for the SPY vehicle' };
  const spot = ratio ? price / ratio : price;
  try {
    const ap = await import('./alpaca-options');
    if (!ap.isAlpacaOptionsConfigured()) return { contract: null, note: 'Alpaca options not configured' };
    const chain = await gate(`wall-chain:${vehicle}`, () => ap.getAlpacaOptionsChain(vehicle, { maxDays: WALL_LIVE_CFG.CHAIN_MAX_DAYS, band: WALL_LIVE_CFG.CHAIN_BAND }));
    if (!chain) return { contract: null, note: 'no chain (gate dropped or provider empty)' };
    const today = etDateKey(nowMs);
    const p = pickWallContract(chain.contracts, spot, type, today);
    if (!p) return { contract: null, note: `no ${type} within ${WALL_LIVE_CFG.CHAIN_MAX_DAYS} days` };
    const c = p.c;
    const mid = c.bid != null && c.ask != null ? +((c.bid + c.ask) / 2).toFixed(2) : null;
    const wd = new Date(`${c.expiration}T12:00:00Z`).toUTCString().slice(0, 3);
    return {
      contract: {
        occ: c.occ, strike: c.strike, type, expiry: c.expiration, dte: p.dte, label: p.dte === 0 ? '0DTE' : `weekly ${wd} ${c.expiration.slice(5)} (${p.dte}d)`,
        bid: c.bid, ask: c.ask, mid, vehicle, quoteAt: new Date(chain.fetchedAt).toISOString(), source: 'Alpaca indicative',
      },
      note: sym === 'SPX' ? `SPX wall → SPY vehicle (levels ÷ ${ratio})` : null,
    };
  } catch (e) {
    return { contract: null, note: `chain failed: ${(e as Error).message}` };
  }
}

// ─── alerts (the 0DTE desk's existing in-app paths) ──────────────────────

async function raiseAlert(a: WallAlert, contract: WallContract | null): Promise<void> {
  try { const { pulse } = await import('./system-pulse'); pulse('alert', a.text); } catch { /* decoration */ }
  import('./bot-notification-service')
    .then(({ broadcastBotEvent }) => broadcastBotEvent({
      eventType: a.kind === 'rejection' || a.kind === 'break' ? 'signal' : 'looking', source: 'wall_touch', symbol: a.symbol, reason: a.text,
      ...(contract ? { optionType: contract.type, strike: contract.strike, expiry: contract.expiry, price: contract.ask ?? undefined } : {}),
    }))
    .catch(() => { /* no socket server in this process */ });
}

// ─── text ────────────────────────────────────────────────────────────────

const money = (x: number | null | undefined) => (x == null ? '—' : `$${x.toFixed(2)}`);
export function eventText(sym: string, e: Pick<WallEventRow, 'kind' | 'wall' | 'wallPrice' | 'touch' | 'extreme' | 'price' | 'barEt' | 'atEt' | 'distPct'>, c: WallContract | null): string {
  const w = `${e.wall} wall ${fmtLevel(e.wallPrice)}`;
  const k = c ? ` — ${c.label} ${fmtLevel(c.strike)}${c.type === 'call' ? 'C' : 'P'} @ ${money(c.ask)}${c.vehicle !== sym ? ` (${c.vehicle})` : ''}` : '';
  switch (e.kind) {
    case 'approach': return `${sym} approaching ${w} (${fmtPctAbs(e.distPct)} away) · ${e.atEt} ET`;
    case 'touch': return `${sym} touched ${w} at ${e.extreme.toFixed(2)} in the ${e.barEt} ET bar (touch #${e.touch})`;
    case 'rejection': return `${sym} ${w} rejection confirmed ${e.atEt} ET, close ${e.price.toFixed(2)} (touch #${e.touch})${k} · measuring`;
    case 'break': return `${sym} ${w} BROKEN ${e.atEt} ET, close ${e.price.toFixed(2)} (touch #${e.touch})${k} · measuring`;
    case 'stall': return `${sym} ${w} touch #${e.touch}: no rejection or break within 5 bars (${e.atEt} ET)`;
  }
}

// ─── the cycle ────────────────────────────────────────────────────────────

/** Today's closed 1-min bars for a wall symbol (SPX = SPY × ratio). */
function barsFor(sym: string, dateKey: string, nowMs: number, peek: (s: string) => { dateKey: string; bars: readonly MinuteBar[] } | null): MinuteBar[] {
  const held = peek(stockOf(sym));
  if (!held || held.dateKey !== dateKey) return [];
  const closed = held.bars.filter((b) => b.t + 60_000 <= nowMs);
  if (sym !== 'SPX') return closed as MinuteBar[];
  const k = map?.spxPerSpy;
  if (!k) return [];
  return closed.map((b) => ({ ...b, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k, vw: b.vw != null ? b.vw * k : undefined }));
}

async function seedFromLog(dateKey: string): Promise<void> {
  if (day.seeded) return;
  day.seeded = true;
  const lines = await readWallLog(1);
  for (const l of lines) {
    if (l.dateKey !== dateKey) continue;
    if (l.type === 'alert' && l.key) day.alerted.add(l.key);
    else if (l.id && ['approach', 'touch', 'rejection', 'break', 'stall'].includes(l.type)) {
      day.seen.add(l.id);
      if (l.row) day.events.push(l.row as WallEventRow);
      if (l.row?.touchId && (l.type === 'rejection' || l.type === 'break')) day.contracts.set(l.row.touchId, { contract: l.row.contract ?? null, note: l.row.contractNote ?? null });
    }
  }
}

/**
 * One cycle. `force` ignores the clock; `fetchJson` / `peek` / `gate` / `nowMs`
 * exist for tests and dry runs; `alerts:false` never raises an alert; `log:false` writes nothing.
 */
export async function runWallTouch(nowMs = Date.now(), opts: { force?: boolean; fetchJson?: import('./zero-dte-sniper').FetchJson; peek?: (s: string) => { dateKey: string; bars: readonly MinuteBar[] } | null; gate?: GateFn; alerts?: boolean; log?: boolean; refresh?: boolean } = {}): Promise<WallCycle> {
  if (inflight) return inflight;
  inflight = cycle(nowMs, opts).finally(() => { inflight = null; });
  return inflight;
}

async function cycle(nowMs: number, opts: Parameters<typeof runWallTouch>[1] = {}): Promise<WallCycle> {
  const t0 = Date.now();
  const rss0 = process.memoryUsage().rss;
  const dateKey = etDateKey(nowMs);
  resetDay(dateKey);
  const base: WallCycle = {
    at: new Date(nowMs).toISOString(), dateKey, enabled: wallTouchEnabled(), skipped: null, symbols: 0, requests: 0, feed: null, barsHeld: 0,
    newEvents: 0, chains: { used: 0, cap: WALL_LIVE_CFG.MAX_CHAINS, deferred: [] }, cycleMs: 0, memory: { rssBeforeMb: mb(rss0), rssAfterMb: 0 }, errors: [], label: 'measuring',
  };
  const doLog = opts.log !== false;
  const finish = (c: WallCycle): WallCycle => {
    c.cycleMs = Date.now() - t0; c.memory.rssAfterMb = mb(process.memoryUsage().rss);
    lastCycle = c;
    if (doLog && writesSharedState()) writeSharedSync(WALL_SHARED, { cycle: c, rows: lastRows, events: day.events.slice(-300), alerts: day.alerts.slice(-100), dateKey });
    return c;
  };
  const wd = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const min = etMinutes(nowMs);
  if (!opts.force && (wd === 'Sat' || wd === 'Sun' || min < WALL_LIVE_CFG.START_MIN || min > WALL_LIVE_CFG.END_MIN)) return finish({ ...base, skipped: `outside 09:31–16:00 ET weekdays (${wd} ${hhmm(min)})` });
  const m = loadMap(dateKey);
  if (!m) {
    if (!opts.force && lateMapKickDay !== dateKey) {
      lateMapKickDay = dateKey;
      computeWallMap('late', Date.now()).catch((e) => logger.warn(`[WALL-TOUCH] late map failed: ${(e as Error).message}`));
    }
    return finish({ ...base, skipped: 'no wall map for today yet (computed ~09:00 and ~12:30 ET)' });
  }
  if (doLog) await seedFromLog(dateKey);
  const syms = Object.keys(m.levels).filter((s) => m.levels[s].length);
  base.symbols = syms.length;
  const stockSyms = Array.from(new Set(syms.map(stockOf)));
  let peek = opts.peek;
  if (!peek) {
    const sn = await import('./zero-dte-sniper');
    if (opts.refresh !== false) {
      if (!opts.fetchJson && (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY)) return finish({ ...base, skipped: 'Alpaca keys not configured' });
      try {
        const r = await sn.refreshStage1Bars(stockSyms, nowMs, opts.fetchJson);
        base.requests = r.requests; base.feed = r.feed;
      } catch (e) {
        base.errors.push(`bars: ${(e as Error).message}`);
        return finish(base);
      }
    }
    peek = sn.peekStage1Bars;
  }
  if (!(opts.peek && !opts.fetchJson)) await ensureRvolBaseline(stockSyms, dateKey, nowMs, opts.fetchJson).catch(() => {});

  const gate = opts.gate ?? defaultGate('high', 90_000);
  const allowAlerts = opts.alerts ?? true;
  const rows: WallRow[] = [];
  const pendingLog: object[] = [];
  for (const sym of syms) {
    const bars = barsFor(sym, dateKey, nowMs, peek);
    base.barsHeld += bars.length;
    if (!bars.length) continue;
    const entry = m.entries[sym];
    const basis = entry?.basisLabel ?? '—';
    const { events, statuses } = detectWalls(bars, m.levels[sym]);
    const slots = rvolBase.get(stockOf(sym))?.slots;
    for (const ev of events) {
      const wallKey = `${sym}|${ev.wall}|${fmtLevel(ev.wallPrice)}`;
      const touchId = `${dateKey}|${wallKey}|${ev.touch}`;
      const id = `${touchId}|${ev.kind}`;
      if (day.seen.has(id)) continue;
      day.seen.add(id);
      base.newEvents++;
      const fresh = nowMs - ev.at <= WALL_LIVE_CFG.FRESH_MS;
      const bar = bars[ev.idx];
      const row: WallEventRow = {
        id, touchId, kind: ev.kind, symbol: sym, wall: ev.wall, wallPrice: ev.wallPrice, wallBasis: basis, touch: ev.touch,
        barAt: new Date(ev.t).toISOString(), barEt: etSec(ev.t), at: new Date(ev.at).toISOString(), atEt: etSec(ev.at),
        price: +ev.price.toFixed(4), extreme: +ev.extreme.toFixed(4), distPct: +ev.distPct.toFixed(5), atr5: +ev.atr5.toFixed(4),
        rvol: ev.kind === 'approach' ? null : rvolFor(slots, bar), text: '', contract: null, contractNote: null, late: !fresh, measuring: true,
      };
      if ((ev.kind === 'rejection' || ev.kind === 'break')) {
        if (!fresh) row.contractNote = 'confirmed before this cycle — no chain read (not chased)';
        else if (base.chains.used >= WALL_LIVE_CFG.MAX_CHAINS) { row.contractNote = `chain cap ${WALL_LIVE_CFG.MAX_CHAINS}/cycle reached`; base.chains.deferred.push(sym); }
        else {
          base.chains.used++;
          const r = await attachContract(sym, tradeSideFor(ev.wall, ev.kind), ev.price, nowMs, gate);
          row.contract = r.contract; row.contractNote = r.note;
        }
        day.contracts.set(touchId, { contract: row.contract, note: row.contractNote });
      }
      row.text = eventText(sym, row, row.contract);
      day.events.push(row);
      pendingLog.push({ type: ev.kind, id, touchId, dateKey, symbol: sym, wall: ev.wall, wallPrice: ev.wallPrice, wallBasis: basis, touch: ev.touch, at: row.at, scale: sym === 'SPX' ? m.spxPerSpy : null, loggedAt: new Date().toISOString(), row });
      const akey = `${wallKey}|${ev.kind}`;
      if (ev.kind !== 'stall' && fresh && allowAlerts && !day.alerted.has(akey)) {
        day.alerted.add(akey);
        const a: WallAlert = { key: akey, at: new Date(nowMs).toISOString(), atEt: etSec(nowMs), symbol: sym, kind: ev.kind, text: row.text };
        day.alerts.push(a);
        pendingLog.push({ type: 'alert', dateKey, key: akey, at: a.at, text: a.text });
        await raiseAlert(a, row.contract);
      }
    }
    for (const st of statuses) {
      const lvl = m.levels[sym].find((l) => l.kind === st.wall && l.price === st.wallPrice);
      const superseded = lvl?.untilMs != null;
      if (superseded && st.touches === 0) continue;
      const le = st.lastEvent;
      // Live (provisional) outcome of the latest resolved touch on this wall — the logged outcome is written after the close.
      let live: UnderlyingOutcome | null = null; let contract: WallContract | null = null;
      if (le && (le.kind === 'rejection' || le.kind === 'break')) {
        live = underlyingOutcome(bars, le.at, le.price, le.wallPrice, le.wall, tradeSideFor(le.wall, le.kind));
        contract = day.contracts.get(`${dateKey}|${sym}|${le.wall}|${fmtLevel(le.wallPrice)}|${le.touch}`)?.contract ?? null;
      }
      rows.push({
        symbol: sym, wall: st.wall, wallPrice: st.wallPrice, wallBasis: basis, state: st.state,
        distPct: st.distPct != null ? +st.distPct.toFixed(5) : null, touches: st.touches, line: statusLine(sym, st) + (superseded ? ' (superseded wall)' : ''),
        lastEvent: le ? { kind: le.kind, atEt: etSec(le.kind === 'touch' ? le.t : le.at), price: +le.extreme.toFixed(2) } : null,
        live, contract, superseded,
      });
    }
  }
  if (doLog) await appendWallLog(pendingLog);
  if (day.events.length > 600) day.events = day.events.slice(-600);
  const order: Record<string, number> = { touched: 0, approaching: 1, rejected: 2, broken: 3, stalled: 4, beyond: 5, away: 6 };
  lastRows = rows.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || Math.abs(a.distPct ?? 1) - Math.abs(b.distPct ?? 1));
  if (base.newEvents) logger.info(`[WALL-TOUCH] ${hhmm(min)} ET: ${base.symbols} names, ${base.newEvents} new events, chains ${base.chains.used}/${base.chains.cap}, rss ${base.memory.rssBeforeMb}→${mb(process.memoryUsage().rss)} MB (measuring)`);
  return finish(base);
}

// ─── outcome pass (after the close; also back-fills missed sessions) ─────

async function alpacaJson(url: string): Promise<any | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '', 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' }, signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

export type BarsLoader = (dateKey: string, symbols: string[]) => Promise<Map<string, MinuteBar[]>>;
export type OptBarsLoader = (dateKey: string, occs: string[]) => Promise<Map<string, OptMinute[]>>;

export const loadStockDay: BarsLoader = async (dateKey, symbols) => {
  const out = new Map<string, MinuteBar[]>();
  const start = new Date(etWallMs(dateKey, 570)).toISOString(); const end = new Date(etWallMs(dateKey, 960)).toISOString();
  for (let i = 0; i < symbols.length; i += 100) {
    const chunk = symbols.slice(i, i + 100);
    let token: string | null = null;
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({ symbols: chunk.join(','), timeframe: '1Min', start, end, limit: '10000', adjustment: 'split', feed: process.env.ZERO_DTE_SNIPER_FEED === 'iex' ? 'iex' : 'sip' });
      if (token) qs.set('page_token', token);
      const j = await alpacaJson(`https://data.alpaca.markets/v2/stocks/bars?${qs}`);
      if (!j) break;
      for (const [s, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) {
        const a = out.get(s) ?? [];
        for (const b of arr) { const t = Date.parse(b.t); const ck = etClock(t); if (ck.min >= 570 && ck.min < 960) a.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw, min: ck.min }); }
        out.set(s, a);
      }
      token = j.next_page_token ?? null;
      if (!token) break;
    }
  }
  return out;
};

const loadOptDay: OptBarsLoader = async (dateKey, occs) => {
  const out = new Map<string, OptMinute[]>();
  const start = new Date(etWallMs(dateKey, 570)).toISOString();
  const end = new Date(Math.min(etWallMs(dateKey, 960), Date.now() - 16 * 60_000)).toISOString(); // last 15 min need OPRA
  for (let i = 0; i < occs.length; i += 100) {
    const chunk = occs.slice(i, i + 100);
    let token: string | null = null;
    for (let page = 0; page < 20; page++) {
      const qs = new URLSearchParams({ symbols: chunk.join(','), timeframe: '1Min', start, end, limit: '10000' });
      if (token) qs.set('page_token', token);
      const j = await alpacaJson(`https://data.alpaca.markets/v1beta1/options/bars?${qs}`);
      if (!j) break;
      for (const [o, arr] of Object.entries(j.bars ?? {}) as Array<[string, any[]]>) {
        const a = out.get(o) ?? [];
        for (const b of arr) a.push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
        out.set(o, a);
      }
      token = j.next_page_token ?? null;
      if (!token) break;
    }
  }
  return out;
};

/** Join a day's log lines into the touches that still need an outcome line (pure). */
export function pendingTouches(lines: any[], todayKey: string, afterClose: boolean): Map<string, { touch: any; resolution: any | null }> {
  const done = new Set(lines.filter((l) => l.type === 'outcome').map((l) => l.id));
  const out = new Map<string, { touch: any; resolution: any | null }>();
  for (const l of lines) {
    if (l.type !== 'touch' || done.has(l.touchId)) continue;
    if (l.dateKey > todayKey || (l.dateKey === todayKey && !afterClose)) continue;
    out.set(l.touchId, { touch: l, resolution: null });
  }
  for (const l of lines) {
    if ((l.type === 'rejection' || l.type === 'break' || l.type === 'stall') && out.has(l.touchId)) out.get(l.touchId)!.resolution = l;
  }
  return out;
}

/** The outcome record for one logged touch (pure; bars in the wall symbol's own units). */
export function outcomeRecord(p: { touch: any; resolution: any | null }, bars: MinuteBar[], optBars: OptMinute[] | null): WallRecord {
  const t = p.touch; const r = p.resolution;
  const resolution: WallRecord['resolution'] = r ? r.type : 'open';
  const kind: WallKind = t.wall;
  const side = resolution === 'rejection' || resolution === 'break' ? tradeSideFor(kind, resolution) : kind === 'put' ? 'long' : 'short';
  const ref = r?.row ?? t.row;
  const entryAt = Date.parse(ref.at);
  const underlying = bars.length ? underlyingOutcome(bars, entryAt, ref.price, t.wallPrice, kind, side) : null;
  let option: WallRecord['option'] = null;
  const c: WallContract | null = r?.row?.contract ?? null;
  if (c && optBars && optBars.length) {
    const closeAt = bars.length ? bars[bars.length - 1].t + 60_000 : null;
    const nextHigh = optBars.find((b) => b.t >= entryAt && b.t < entryAt + 4 * 60_000)?.h ?? null;
    const entry = c.ask != null && c.ask > 0 ? c.ask : nextHigh;
    if (entry != null && entry > 0) option = { ...optionPathOutcome(entry, c.ask ? 'ask at confirm' : 'next 1-min bar high', optBars, entryAt, closeAt), occ: c.occ, label: c.label };
  }
  return {
    id: t.touchId, dateKey: t.dateKey, symbol: t.symbol, wall: kind, wallPrice: t.wallPrice, wallBasis: t.wallBasis, touch: t.touch,
    touchAt: t.row?.barAt ?? t.at, resolution, rvol: t.row?.rvol ?? null, underlying, option,
  };
}

export async function runWallTouchOutcomes(nowMs = Date.now(), opts: { loadBars?: BarsLoader; loadOpt?: OptBarsLoader; lines?: any[]; write?: boolean; maxDays?: number } = {}): Promise<{ written: number; dates: string[] }> {
  const lines = opts.lines ?? await readWallLog(2);
  const today = etDateKey(nowMs);
  const pend = pendingTouches(lines, today, etMinutes(nowMs) >= 16 * 60 + 15);
  if (!pend.size) return { written: 0, dates: [] };
  const byDate = new Map<string, Array<{ touch: any; resolution: any | null }>>();
  for (const p of pend.values()) { const a = byDate.get(p.touch.dateKey) ?? []; a.push(p); byDate.set(p.touch.dateKey, a); }
  const dates = [...byDate.keys()].sort().slice(-(opts.maxDays ?? 5));
  const loadBars = opts.loadBars ?? loadStockDay; const loadOpt = opts.loadOpt ?? loadOptDay;
  const out: object[] = [];
  for (const d of dates) {
    const ps = byDate.get(d)!;
    const syms = Array.from(new Set(ps.map((p) => stockOf(p.touch.symbol))));
    const bars = await loadBars(d, syms);
    const occs = Array.from(new Set(ps.map((p) => p.resolution?.row?.contract?.occ).filter(Boolean))) as string[];
    const opt = occs.length ? await loadOpt(d, occs) : new Map<string, OptMinute[]>();
    for (const p of ps) {
      const raw = bars.get(stockOf(p.touch.symbol)) ?? [];
      const k = p.touch.symbol === 'SPX' ? Number(p.touch.scale) || null : null;
      if (p.touch.symbol === 'SPX' && !k) continue;
      const b = k ? raw.map((x) => ({ ...x, o: x.o * k, h: x.h * k, l: x.l * k, c: x.c * k })) : raw;
      if (!b.length) continue;
      const occ = p.resolution?.row?.contract?.occ;
      out.push({ type: 'outcome', at: new Date().toISOString(), ...outcomeRecord(p, b, occ ? opt.get(occ) ?? null : null) });
    }
  }
  if (opts.write !== false) await appendWallLog(out);
  reportCache = null;
  logger.info(`[WALL-TOUCH] outcomes: ${out.length} written for ${dates.join(', ') || '—'} (measuring)`);
  return { written: out.length, dates };
}

// ─── read side + routes ───────────────────────────────────────────────────

function readState(nowMs = Date.now()) {
  let cycle = lastCycle; let rows = lastRows; let events = day.events; let alerts = day.alerts; let stamp: ReturnType<typeof sharedStamp> | null = null;
  if (readsSharedState()) {
    const r = readShared<{ cycle: WallCycle; rows: WallRow[]; events: WallEventRow[]; alerts: WallAlert[]; dateKey: string }>(WALL_SHARED, 10 * 60_000);
    stamp = sharedStamp(r);
    if (r) { cycle = r.data.cycle; rows = r.data.rows ?? []; events = r.data.events ?? []; alerts = r.data.alerts ?? []; }
  }
  const today = etDateKey(nowMs);
  const m = loadMap(today) ?? readShared<WallMap>(WALL_MAP_SHARED)?.data ?? null;
  const fresh = !!cycle && cycle.dateKey === today && nowMs - Date.parse(cycle.at) <= 10 * 60_000;
  return { cycle, rows: fresh ? rows : [], events: events.filter((e) => etDateKey(Date.parse(e.at)) === today), alerts: alerts.filter((a) => etDateKey(Date.parse(a.at)) === today), stamp, map: m && m.dateKey === today ? m : null, staleMap: m && m.dateKey !== today ? m : null };
}

export function getWallTouchState(nowMs = Date.now()) {
  const s = readState(nowMs);
  return {
    enabled: wallTouchEnabled(), label: 'measuring' as const,
    lastCycle: s.cycle, rows: s.rows, events: s.events.slice(-200), alerts: s.alerts.slice(-60),
    map: s.map ? { dateKey: s.map.dateKey, passes: s.map.passes, spxPerSpy: s.map.spxPerSpy, entries: Object.values(s.map.entries) } : null,
    engineState: s.stamp,
    cfg: {
      cadence: 'walls ~09:00 + ~12:30 ET (one chain per name, sequential, heavy gate); detection every minute 09:31–16:00 ET on 1-min bars; outcomes 16:20 + 16:50 ET',
      universeCap: WALL_LIVE_CFG.UNIVERSE_CAP, boardTop: WALL_LIVE_CFG.BOARD_TOP, maxChainsPerCycle: WALL_LIVE_CFG.MAX_CHAINS,
      rules: 'approach ≤ max(0.15%, 0.5×ATR5) · touch = low ≤ wall + tol (call: high ≥ wall − tol), tol = max(0.05%, 0.1×ATR5) · rejection = close ≥ 0.25×ATR5 back off the wall within 1–5 bars · break = close through by > tol',
    },
    honesty: 'Historical GEX walls cannot be replayed (no historical chains / open interest). The forward log is the test; the proxy replay uses reconstructable levels only.',
  };
}

export function getWallTouchForSymbol(symbol: string, nowMs = Date.now()) {
  const s = readState(nowMs);
  const sym = symbol.toUpperCase();
  const e = s.map?.entries[sym] ?? null;
  return {
    symbol: sym, enabled: wallTouchEnabled(), label: 'measuring' as const, asOf: s.cycle?.at ?? null,
    walls: e ? { putWall: e.putWall, callWall: e.callWall, flip: e.flip, basis: e.basisLabel, computedAt: e.computedAt, spot: e.spot } : null,
    rows: s.rows.filter((r) => r.symbol === sym),
    events: s.events.filter((x) => x.symbol === sym).slice(-20),
  };
}

let reportCache: { at: number; v: unknown } | null = null;
export async function getWallTouchReport() {
  if (reportCache && Date.now() - reportCache.at < 5 * 60_000) return reportCache.v;
  const lines = await readWallLog();
  const recs = lines.filter((l) => l.type === 'outcome') as WallRecord[];
  const touches = lines.filter((l) => l.type === 'touch').length;
  const v = {
    ...summarizeWallLog(recs),
    touchesLogged: touches, awaitingOutcome: Math.max(0, touches - recs.length),
    howToRead: [
      'n = logged touches with an outcome. Resolution: rejection (closed ≥ 0.25×ATR5 back off the wall within 5 bars), break (closed through by > tolerance), stall (neither), open (engine stopped before resolving).',
      'Trade-side % are measured from the resolution bar close: away from the wall after a rejection, through it after a break. MFE/MAE run to the close.',
      'Option multiples: the nearest-OTM contract read at confirmation (≤ 7 DTE), entry = the logged ask; maxMult = best 1-min high ÷ entry.',
      'Measuring: nothing here is validated. Read it after 2–4 weeks; a cell needs n ≥ 20 before it means anything.',
    ],
  };
  reportCache = { at: Date.now(), v };
  return v;
}

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerWallTouchRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/wall-touch', requireBetaAccess, (_req, res) => {
    try { res.json(getWallTouchState()); } catch (err) {
      logger.error('[WALL-TOUCH] state failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'wall-touch state failed' });
    }
  });
  app.get('/api/wall-touch/report', requireBetaAccess, async (_req, res) => {
    try { res.json(await getWallTouchReport()); } catch (err) {
      logger.error('[WALL-TOUCH] report failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'wall-touch report failed' });
    }
  });
  app.get('/api/wall-touch/:symbol', requireBetaAccess, (req, res) => {
    try {
      const sym = String(req.params.symbol ?? '').toUpperCase();
      if (!/^[A-Z.]{1,6}$/.test(sym)) return res.status(400).json({ error: 'bad symbol' });
      res.json(getWallTouchForSymbol(sym));
    } catch (err) {
      logger.error('[WALL-TOUCH] symbol read failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'wall-touch read failed' });
    }
  });
}

/** Test hook: reset in-memory state. */
export function __resetWallTouchForTests() {
  map = null; lastCycle = null; lastRows = []; inflight = null; mapInflight = null; lateMapKickDay = '';
  day = { dateKey: '', seeded: false, seen: new Set(), alerted: new Set(), events: [], alerts: [], contracts: new Map() };
  rvolBase.clear(); reportCache = null;
}
export function __setWallMapForTests(m: WallMap | null) { map = m; }
