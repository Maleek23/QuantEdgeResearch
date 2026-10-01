/**
 * SECTOR IGNITION — I/O around the pure core in shared/sector-ignition.ts.
 * ========================================================================
 * Reads, per horizon (thresholds documented in IGNITION_CFG):
 *
 *   intraday  getIntradayStructure (Yahoo 5-min, 60 s cache, shared with the
 *             0DTE desk) for every group ETF + SPY every pass, and for the
 *             members of every group on a FULL sweep (every ~15 min) or when
 *             the group was ≥ stirring last pass — a tiered read so the 1-vCPU
 *             box does not pull ~170 charts every 5 minutes. Flow = the
 *             Bullflow print ring already in memory (no request). The group's
 *             pre-market gap comes from this module's own 09:05/09:20 pass.
 *   daily     pre-market gap breadth (pre-market-service, Yahoo meta, 60 s
 *             cache) at 09:05/09:20; ORB breadth from the intraday pass
 *             (first hour); an end-of-day read at 16:10 from the full day's
 *             5-min bars.
 *   swing     daily bars: members from the liquid-universe bars
 *             (getUniverseBars(70): disk-cached per day, 15-min memory cache,
 *             shared with the index-swing/pattern scanners); ETFs + SPY from
 *             fetchCandles 1y (10-min provider cache); members missing from
 *             the liquid set are fetched individually (bounded). Multi-day
 *             flow = buildFlowTape(5) (Bullflow ring + chain-scan history).
 *             Laggards are ranked with theme-leverage (beta / R² / residual
 *             vs the group ETF, 60 sessions).
 *   weekly    the same daily bars → RRG quadrant path on ETF/SPY.
 *
 * Ideas (source 'sector_ignition', measuring) go through the one write point
 * (storage.createTradeIdea → validation, dedup, loss rules v1):
 *   intraday → ETF or best laggard, WATCH first in the 0DTE desk ideas list
 *              with a contract from the desk's own picker; logged only when the
 *              trigger prints (5-min close through the prior high/low of day
 *              on the group's side of VWAP).
 *   daily    → intraday stock/option idea (0–7 DTE, intraday hold) at the
 *              first-hour igniting read.
 *   swing    → laggard catch-up, 30–60 DTE (loss rule 4), time stop by rule 3.
 *   weekly   → watchlist/theme entries only — no auto trades.
 * Caps: ≤ 2 per group per horizon per day; per-day caps per horizon; never on
 * top of an open idea on the same symbol + side from any engine.
 *
 * Every stage transition and every emission is appended to
 * .cache/sector-ignition/events-YYYY-MM.jsonl (monthly files, 6 kept, 20 MB
 * roll-over) for the forward record — intraday cannot be backtested without
 * intraday history, so the forward log IS its test.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { BoundedCache } from './lib/bounded-cache';
import { readShared, writeShared } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etParts, etWallToMs } from '@shared/loss-rules';
import {
  IGNITION_CFG, ignitionGroups, ideaCapCheck, ideaVehicles, intradayMemberFromBars, median, pickStructuralTargets, r2,
  scoreDaily, scoreIntraday, scoreSwing, scoreWeekly, shouldLogTransition, sortGroupReads, STAGE_RANK,
  type DailyMember, type GroupRead, type IdeaCapState, type IgnitionEvent, type IgnitionGroup, type IgnitionHorizon,
  type IgnitionStage, type IntradayMember, type Side, type SwingMember,
} from '@shared/sector-ignition';

export const IGNITION_SOURCE = 'sector_ignition';
const TTL: Record<IgnitionHorizon, number> = { intraday: 5 * 60_000, daily: 10 * 60_000, swing: 6 * 3_600_000, weekly: 12 * 3_600_000 };

export interface WatchItem {
  key: string;
  horizon: IgnitionHorizon;
  groupId: string;
  groupLabel: string;
  symbol: string;
  side: Side;
  trigger: { name: string; price: number } | null;
  triggerText: string;
  entry: number | null;
  stop: number | null;
  t1: number | null;
  t2: number | null;
  rr: number | null;
  t1Basis: string | null;
  price: number | null;
  priceAt: string | null;
  contract: any | null;
  contractNote: string | null;
  why: string;
  firstSeen: string;
  status: 'watch' | 'published' | 'withheld';
  ideaId: string | null;
  note: string | null;
}

export interface HorizonState {
  horizon: IgnitionHorizon;
  asOf: string;
  phase: string | null;
  groups: GroupRead[];
  /** ISO time of the newest input bar/quote, per input family. */
  dataAsOf: Record<string, string | null>;
  notes: string[];
  watch: WatchItem[];
  watchlist: Array<{ groupId: string; label: string; etf: string; side: Side; stage: IgnitionStage; symbols: string[]; why: string; at: string }>;
  emitted: Array<{ symbol: string; groupId: string; side: Side; ideaId: string | null; at: string }>;
}

const stateCache = new BoundedCache<IgnitionHorizon, HorizonState>({ name: 'sector-ignition.state', maxEntries: 8, ttlMs: 3 * 86_400_000, maxBytes: 8 * 1024 * 1024 });
const lastStage = new Map<string, { stage: IgnitionStage; dateKey: string }>();
const inflight = new Map<IgnitionHorizon, Promise<HorizonState>>();
/** Today's pre-market group gaps (leading signal), recorded before the open. */
let pmGaps: { dateKey: string; at: string; bySymbol: Map<string, number> } | null = null;
let lastFullSweepAt = 0;
const emittedDay = new Map<IgnitionHorizon, { dateKey: string; perGroup: Record<string, number>; symbols: Set<string>; n: number }>();

// ─── Event log (append-only jsonl, monthly rotation) ─────────────────────

const LOG_DIR = path.join(process.cwd(), '.cache', 'sector-ignition');
const LOG_MAX_BYTES = 20 * 1024 * 1024;
const LOG_KEEP_MONTHS = 6;

async function appendEvents(events: IgnitionEvent[]): Promise<void> {
  if (!events.length) return;
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    let file = path.join(LOG_DIR, `events-${month}.jsonl`);
    const st = await fs.stat(file).catch(() => null);
    if (st && st.size > LOG_MAX_BYTES) file = path.join(LOG_DIR, `events-${month}-${Date.now()}.jsonl`);
    await fs.appendFile(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    const files = (await fs.readdir(LOG_DIR)).filter((f) => /^events-\d{4}-\d{2}/.test(f)).sort();
    const months = Array.from(new Set(files.map((f) => f.slice(7, 14)))).sort();
    const drop = new Set(months.slice(0, Math.max(0, months.length - LOG_KEEP_MONTHS)));
    for (const f of files) if (drop.has(f.slice(7, 14))) await fs.unlink(path.join(LOG_DIR, f)).catch(() => {});
  } catch (err) {
    logger.warn(`[SECTOR-IGNITION] event log write failed: ${(err as Error).message}`);
  }
}

export async function readRecentEvents(limit = 200): Promise<IgnitionEvent[]> {
  try {
    const files = (await fs.readdir(LOG_DIR)).filter((f) => f.startsWith('events-')).sort().slice(-2);
    const out: IgnitionEvent[] = [];
    for (const f of files) {
      const txt = await fs.readFile(path.join(LOG_DIR, f), 'utf8');
      for (const line of txt.split('\n')) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ } } }
    }
    return out.slice(-limit);
  } catch { return []; }
}

function transitionEvents(horizon: IgnitionHorizon, groups: GroupRead[], nowMs: number): IgnitionEvent[] {
  const dk = etParts(nowMs).dateKey;
  const out: IgnitionEvent[] = [];
  for (const g of groups) {
    const k = `${horizon}|${g.groupId}`;
    const prev = lastStage.get(k);
    if (shouldLogTransition(prev, g, dk)) {
      out.push({
        at: new Date(nowMs).toISOString(), horizon, kind: 'stage', groupId: g.groupId, etf: g.etf,
        from: prev?.stage ?? null, to: g.stage, side: g.side,
        etfPrice: (g.metrics.etfPrice as number | null) ?? null, etfMovePct: g.etfMovePct, relPct: g.relPct, breadthPct: g.breadthPct,
        leaders: g.leaders.map((l) => l.symbol), laggards: g.laggards.map((l) => l.symbol), note: g.phase ?? undefined, status: 'measuring',
      });
    }
    lastStage.set(k, { stage: g.stage, dateKey: dk });
  }
  return out;
}

// ─── Readers ─────────────────────────────────────────────────────────────

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

type Struct = Awaited<ReturnType<typeof import('./zero-dte-structure')['getIntradayStructure']>>;
async function structures(symbols: string[]): Promise<Map<string, Struct>> {
  const { getIntradayStructure } = await import('./zero-dte-structure');
  const uniq = Array.from(new Set(symbols));
  const rows = await pool(uniq, 4, (s) => getIntradayStructure(s).catch(() => null));
  return new Map(uniq.map((s, k) => [s, rows[k]]));
}

/** Calls − puts premium per underlying over the last `minutes` from the in-memory Bullflow ring; null when the ring is off/empty. */
async function recentNetPremium(minutes: number, nowMs: number): Promise<Map<string, number> | null> {
  try {
    const bf = await import('./bullflow-service');
    if (!bf.bullflowEnabled()) return null;
    const { prints } = bf.getBullflowPrints();
    if (!prints.length) return null;
    const since = nowMs - minutes * 60_000;
    const out = new Map<string, number>();
    for (const p of prints) {
      const t = Date.parse(p.at);
      if (!(t >= since && t <= nowMs + 60_000)) continue;
      out.set(p.underlying, (out.get(p.underlying) ?? 0) + (p.optionType === 'call' ? p.premium : -p.premium));
    }
    return out;
  } catch { return null; }
}

function memberFromStruct(sym: string, s: Struct, nowMs: number): Omit<IntradayMember, 'netPremium30m'> {
  if (!s || !s.bars.length) return { symbol: sym, movePct: null, last: null, vwap: null, orHigh: null, orLow: null, orBreak: null, gapPct: null };
  return intradayMemberFromBars(sym, s.bars, s.pdc, nowMs);
}

// Daily bars (swing + weekly)
interface DailyBars { closes: Map<string, Map<string, number>>; lows: Map<string, Map<string, number>>; highs: Map<string, Map<string, number>>; newest: string | null; notes: string[] }
const dailyCache = new BoundedCache<string, { at: number; v: DailyBars }>({ name: 'sector-ignition.daily', maxEntries: 1, ttlMs: 30 * 60_000, maxBytes: 24 * 1024 * 1024 });
const dayKeyOf = (tSec: number) => new Date(tSec * 1000).toISOString().slice(0, 10);

async function dailyBars(groups: IgnitionGroup[]): Promise<DailyBars> {
  const hit = dailyCache.get('all');
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
  const notes: string[] = [];
  const closes = new Map<string, Map<string, number>>(); const lows = new Map<string, Map<string, number>>(); const highs = new Map<string, Map<string, number>>();
  const put = (sym: string, bars: Array<{ time: number; close: number; low: number; high: number }>) => {
    const c = new Map<string, number>(); const l = new Map<string, number>(); const h = new Map<string, number>();
    for (const b of bars) { const k = dayKeyOf(b.time); c.set(k, b.close); l.set(k, b.low); h.set(k, b.high); }
    closes.set(sym, c); lows.set(sym, l); highs.set(sym, h);
  };
  const { fetchCandles } = await import('./historical-candles');
  const etfs = Array.from(new Set(['SPY', ...groups.map((g) => g.etf)]));
  const etfBars = await pool(etfs, 4, (s) => fetchCandles(s, '1y', '1d').catch(() => []));
  etfs.forEach((s, k) => { if (etfBars[k].length) put(s, etfBars[k]); else notes.push(`${s}: no daily bars`); });
  const members = Array.from(new Set(groups.flatMap((g) => g.members)));
  let uni = new Map<string, any[]>();
  try { const { getUniverseBars } = await import('./liquid-universe'); uni = await getUniverseBars(70) as any; } catch { /* fall back per symbol */ }
  const missing: string[] = [];
  for (const m of members) { const b = uni.get(m); if (b && b.length >= 30) put(m, b); else missing.push(m); }
  if (missing.length) {
    // Cold liquid universe (restart before the warm): read individually, 3 at a time, capped.
    const CAP = 240;
    const got = await pool(missing.slice(0, CAP), 3, (s) => fetchCandles(s, '6mo', '1d').catch(() => []));
    missing.slice(0, CAP).forEach((s, k) => { if (got[k].length) put(s, got[k]); });
    notes.push(`${missing.length} member(s) not in the liquid-universe bars — read individually${missing.length > CAP ? ` (first ${CAP})` : ''}`);
  }
  const spy = closes.get('SPY');
  const newest = spy ? Array.from(spy.keys()).sort().pop() ?? null : null;
  const v = { closes, lows, highs, newest, notes };
  dailyCache.set('all', { at: Date.now(), v });
  return v;
}

/** Closes of `sym` on the calendar of `dates` (dates missing for sym are dropped from both). */
function aligned(bars: DailyBars, syms: string[], todayKey: string, includeToday: boolean): { dates: string[]; series: Map<string, number[]> } {
  const spy = bars.closes.get('SPY');
  let dates = spy ? Array.from(spy.keys()).sort() : [];
  if (!includeToday) dates = dates.filter((d) => d < todayKey);
  const series = new Map<string, number[]>();
  for (const s of syms) { const m = bars.closes.get(s); if (m) series.set(s, dates.map((d) => m.get(d) ?? NaN)); }
  return { dates, series };
}
function dropNaN(xs: number[]): number[] { return xs.filter((x) => Number.isFinite(x)); }

/** Sessions of the last N with ≥2 members net-premium long / short (flow tape: Bullflow ring + chain-scan history). */
async function flowPersistence(groups: IgnitionGroup[], lookback: number): Promise<{ byGroup: Map<string, { long: number; short: number }>; asOf: string | null } | null> {
  try {
    const { buildFlowTape } = await import('./flow-tape');
    const tape = await buildFlowTape(5);
    if (!tape.rows.length) return null;
    const net = new Map<string, Map<string, number>>(); // sym → date → net
    const dates = new Set<string>();
    for (const r of tape.rows) {
      if (!r.at) continue;
      const d = etParts(Date.parse(r.at)).dateKey; dates.add(d);
      let m = net.get(r.symbol); if (!m) { m = new Map(); net.set(r.symbol, m); }
      m.set(d, (m.get(d) ?? 0) + (r.optionType === 'call' ? r.premium : -r.premium));
    }
    const last = Array.from(dates).sort().slice(-lookback);
    const byGroup = new Map<string, { long: number; short: number }>();
    for (const g of groups) {
      let L = 0; let S = 0;
      for (const d of last) {
        let up = 0; let dn = 0;
        for (const m of g.members) { const v = net.get(m)?.get(d); if (v == null) continue; if (v >= 50_000) up++; else if (v <= -50_000) dn++; }
        if (up >= 2) L++; if (dn >= 2) S++;
      }
      byGroup.set(g.groupId, { long: L, short: S });
    }
    return { byGroup, asOf: tape.sources.bullflow.newestAt ?? tape.sources.chainScan.newestAt ?? null };
  } catch { return null; }
}

// ─── Horizon builders ────────────────────────────────────────────────────

function newState(horizon: IgnitionHorizon, nowMs: number): HorizonState {
  return { horizon, asOf: new Date(nowMs).toISOString(), phase: null, groups: [], dataAsOf: {}, notes: [], watch: [], watchlist: [], emitted: [] };
}
const newestBarIso = (m: Map<string, Struct>) => {
  let t = 0; for (const s of m.values()) if (s?.lastBarAt && s.lastBarAt > t) t = s.lastBarAt;
  return t ? new Date(t).toISOString() : null;
};

async function buildIntraday(nowMs: number): Promise<HorizonState> {
  const groups = ignitionGroups();
  const st = newState('intraday', nowMs);
  const prev = stateCache.get('intraday');
  const full = nowMs - lastFullSweepAt > 14 * 60_000 || !prev;
  const hot = new Set((prev?.groups ?? []).filter((g) => STAGE_RANK[g.stage] >= 1 && g.stage !== 'extended').map((g) => g.groupId));
  const readGroups = groups.filter((g) => full || hot.has(g.groupId));
  const syms = ['SPY', ...groups.map((g) => g.etf), ...readGroups.flatMap((g) => g.members)];
  const S = await structures(syms);
  if (full) lastFullSweepAt = nowMs;
  const flow = await recentNetPremium(IGNITION_CFG.intraday.flowWindowMin, nowMs);
  const dk = etParts(nowMs).dateKey;
  const pm = pmGaps && pmGaps.dateKey === dk ? pmGaps : null;
  const spy = memberFromStruct('SPY', S.get('SPY') ?? null, nowMs);
  for (const g of groups) {
    if (!readGroups.includes(g)) {
      const old = prev?.groups.find((x) => x.groupId === g.groupId);
      if (old) st.groups.push({ ...old, metrics: { ...old.metrics, carried: true } });
      continue;
    }
    const e = memberFromStruct(g.etf, S.get(g.etf) ?? null, nowMs);
    const es = S.get(g.etf);
    const members: IntradayMember[] = g.members.map((m) => ({ ...memberFromStruct(m, S.get(m) ?? null, nowMs), netPremium30m: flow ? (flow.get(m) ?? 0) : null }));
    const pmGap = pm ? median(g.members.map((m) => pm.bySymbol.get(m)).filter((x): x is number => x != null)) : null;
    const read = scoreIntraday({
      groupId: g.groupId, label: g.label, etf: g.etf, etfMovePct: e.movePct, spyMovePct: spy.movePct, pmGapPct: pmGap,
      etfLevels: { vwap: e.vwap, orHigh: e.orHigh, orLow: e.orLow, last: e.last, pdh: es?.pdh ?? null, pdl: es?.pdl ?? null }, members,
    });
    read.metrics.etfPrice = e.last != null ? r2(e.last) : null;
    read.metrics.readAt = new Date(nowMs).toISOString();
    st.groups.push(read);
  }
  st.groups = sortGroupReads(st.groups);
  st.dataAsOf = { bars5m: newestBarIso(S), flow: flow ? new Date(nowMs).toISOString() : null, pmGap: pm?.at ?? null };
  st.notes.push(full ? 'full sweep: every group\'s members read this pass' : `tiered pass: members re-read for ${readGroups.length} stirring/igniting group(s); other rows carried from the last full sweep (see readAt)`);
  if (!flow) st.notes.push('Bullflow ring off or empty — flow clustering not counted');
  if (!pm) st.notes.push('no pre-market gap recorded today — the opening gap is used instead');
  st.watch = prev?.watch?.filter((w) => etParts(Date.parse(w.firstSeen)).dateKey === dk) ?? [];
  st.emitted = prev?.emitted?.filter((x) => etParts(Date.parse(x.at)).dateKey === dk) ?? [];
  return st;
}

async function buildDaily(nowMs: number, phase: 'premarket' | 'first_hour' | 'close'): Promise<HorizonState> {
  const groups = ignitionGroups();
  const st = newState('daily', nowMs);
  st.phase = phase;
  const dk = etParts(nowMs).dateKey;
  if (phase === 'premarket') {
    const { getPreMarketBatch } = await import('./pre-market-service');
    const syms = Array.from(new Set(['SPY', ...groups.flatMap((g) => [g.etf, ...g.members])]));
    const snaps = await getPreMarketBatch(syms, 6);
    const by = new Map<string, number>();
    let newest: string | null = null;
    for (const s of snaps.values()) {
      if (s.preMarketGapPct != null) by.set(s.symbol, s.preMarketGapPct);
      if (!newest || s.fetchedAt > newest) newest = s.fetchedAt;
    }
    if (by.size) pmGaps = { dateKey: dk, at: newest ?? new Date(nowMs).toISOString(), bySymbol: by };
    for (const g of groups) {
      const members: DailyMember[] = g.members.map((m) => ({ symbol: m, gapPct: by.get(m) ?? null, movePct: null, orBreak: null, aboveVwap: null }));
      const read = scoreDaily({ groupId: g.groupId, label: g.label, etf: g.etf, phase, etfGapPct: by.get(g.etf) ?? null, etfMovePct: null, spyMovePct: null, members });
      read.metrics.etfPrice = snaps.get(g.etf)?.price ?? null;
      st.groups.push(read);
    }
    st.dataAsOf = { pmQuotes: newest };
    if (!by.size) st.notes.push('no pre-market prints read — every group quiet by construction, not by measurement');
  } else {
    const syms = ['SPY', ...groups.flatMap((g) => [g.etf, ...g.members])];
    const S = await structures(syms);
    const spy = memberFromStruct('SPY', S.get('SPY') ?? null, nowMs);
    const pm = pmGaps && pmGaps.dateKey === dk ? pmGaps : null;
    for (const g of groups) {
      const e = memberFromStruct(g.etf, S.get(g.etf) ?? null, nowMs);
      const members: DailyMember[] = g.members.map((m) => {
        const x = memberFromStruct(m, S.get(m) ?? null, nowMs);
        return { symbol: m, gapPct: pm?.bySymbol.get(m) ?? x.gapPct, movePct: x.movePct, orBreak: x.orBreak, aboveVwap: x.last != null && x.vwap != null ? x.last > x.vwap : null };
      });
      const es = S.get(g.etf);
      let loc: number | null = null;
      if (es && es.bars.length) { const hi = Math.max(...es.bars.map((b) => b.h)); const lo = Math.min(...es.bars.map((b) => b.l)); if (hi > lo && e.last != null) loc = (e.last - lo) / (hi - lo); }
      const read = scoreDaily({ groupId: g.groupId, label: g.label, etf: g.etf, phase, etfGapPct: e.gapPct, etfMovePct: e.movePct, spyMovePct: spy.movePct, etfCloseLocation: loc, members });
      read.metrics.etfPrice = e.last != null ? r2(e.last) : null;
      if (es) for (const [n, v] of [['VWAP', e.vwap], ['OR high', e.orHigh], ['OR low', e.orLow], ['prior-day high', es.pdh], ['prior-day low', es.pdl]] as const) if (v != null) read.levels.push({ name: `${g.etf} ${n}`, price: r2(v) });
      st.groups.push(read);
    }
    st.dataAsOf = { bars5m: newestBarIso(S), pmGap: pm?.at ?? null };
    if (!pm) st.notes.push('no pre-market gap recorded today — the opening gap vs the prior close is used');
  }
  st.groups = sortGroupReads(st.groups);
  const prev = stateCache.get('daily');
  st.emitted = prev?.emitted?.filter((x) => etParts(Date.parse(x.at)).dateKey === dk) ?? [];
  return st;
}

async function buildSwingOrWeekly(horizon: 'swing' | 'weekly', nowMs: number): Promise<HorizonState> {
  const groups = ignitionGroups();
  const st = newState(horizon, nowMs);
  const bars = await dailyBars(groups);
  const et = etParts(nowMs);
  // In session the forming bar is not a completed session: read completed bars only until 16:00 ET.
  const includeToday = et.weekday >= 1 && et.weekday <= 5 ? et.minutes >= 16 * 60 : true;
  const all = Array.from(new Set(['SPY', ...groups.flatMap((g) => [g.etf, ...g.members])]));
  const { series, dates } = aligned(bars, all, et.dateKey, includeToday);
  const spy = series.get('SPY') ?? [];
  const flow = horizon === 'swing' ? await flowPersistence(groups, IGNITION_CFG.swing.flowLookbackDays) : null;
  const { measureLeverage } = await import('@shared/theme-leverage');
  for (const g of groups) {
    const etfRaw = series.get(g.etf);
    if (!etfRaw) { st.notes.push(`${g.label}: no ${g.etf} bars`); continue; }
    const ok = etfRaw.map((v, k) => Number.isFinite(v) && Number.isFinite(spy[k]));
    const etf = etfRaw.filter((_, k) => ok[k]); const spyA = spy.filter((_, k) => ok[k]);
    const mem = g.members.map((m) => ({ symbol: m, closes: dropNaN(series.get(m) ?? []) })).filter((m) => m.closes.length > 0);
    let read: GroupRead;
    if (horizon === 'swing') {
      // theme-leverage: each member on the group ETF over the last 60 aligned sessions
      const win = 61;
      const lev = new Map<string, any>();
      const idx = etfRaw.map((v, k) => k).filter((k) => ok[k]).slice(-win);
      const drv = idx.map((k) => etfRaw[k]);
      const cands = g.members.map((m) => { const s = series.get(m); return s ? { symbol: m, closes: idx.map((k) => s[k]) } : null; })
        .filter((c): c is { symbol: string; closes: number[] } => !!c && c.closes.every((x) => Number.isFinite(x)));
      try { for (const r of measureLeverage(drv, cands)) lev.set(r.symbol, r); } catch { /* leverage optional */ }
      const swingMembers: SwingMember[] = mem.map((m) => ({ ...m, leverage: lev.get(m.symbol) ?? null }));
      read = scoreSwing({ groupId: g.groupId, label: g.label, etf: g.etf, etfCloses: etf, spyCloses: spyA, members: swingMembers, flowDays: flow?.byGroup.get(g.groupId) ?? null });
    } else {
      read = scoreWeekly({ groupId: g.groupId, label: g.label, etf: g.etf, etfCloses: etf, spyCloses: spyA, members: mem });
    }
    read.metrics.etfPrice = etf.length ? r2(etf[etf.length - 1]) : null;
    st.groups.push(read);
  }
  st.groups = sortGroupReads(st.groups);
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  st.dataAsOf = { dailyClose: lastDate, flowTape: flow?.asOf ?? null };
  st.notes.push(...bars.notes);
  st.notes.push(includeToday ? 'completed sessions through the latest close' : `completed sessions through ${lastDate ?? '—'} — today's forming bar is excluded until 16:00 ET`);
  if (horizon === 'swing' && !flow) st.notes.push('no multi-day flow read — flow persistence not counted');
  if (horizon === 'weekly') {
    st.watchlist = st.groups.filter((g) => g.stage === 'igniting' && g.side).map((g) => ({
      groupId: g.groupId, label: g.label, etf: g.etf, side: g.side as Side, stage: g.stage,
      symbols: [g.etf, ...g.laggards.map((l) => l.symbol), ...g.leaders.map((l) => l.symbol)].slice(0, 6),
      why: g.why[0] ?? '', at: st.asOf,
    }));
  }
  return st;
}

// ─── Public read ─────────────────────────────────────────────────────────

function dailyPhase(nowMs: number): 'premarket' | 'first_hour' | 'close' {
  const m = etParts(nowMs).minutes;
  if (m < 9 * 60 + 30) return 'premarket';
  if (m >= 15 * 60 + 55) return 'close';
  return 'first_hour';
}

async function compute(horizon: IgnitionHorizon, nowMs: number, opts: { phase?: 'premarket' | 'first_hour' | 'close' } = {}): Promise<HorizonState> {
  const running = inflight.get(horizon);
  if (running) return running;
  const p = (async () => {
    const st = horizon === 'intraday' ? await buildIntraday(nowMs)
      : horizon === 'daily' ? await buildDaily(nowMs, opts.phase ?? dailyPhase(nowMs))
      : await buildSwingOrWeekly(horizon, nowMs);
    await appendEvents(transitionEvents(horizon, st.groups, nowMs));
    stateCache.set(horizon, st);
    if (writesSharedState()) void writeShared(`sector-ignition-${horizon}`, st);
    return st;
  })().finally(() => inflight.delete(horizon));
  inflight.set(horizon, p);
  return p;
}

/** Cached read for the API: recompute only when older than the horizon's TTL. */
export async function getSectorIgnition(horizon: IgnitionHorizon): Promise<HorizonState & { ageSec: number; cadence: string; config: unknown; honesty: string }> {
  let st = stateCache.get(horizon);
  // Split deployment: the worker computes on its schedule and publishes; the web
  // process serves the newest published read and only computes when the worker
  // has never published this horizon (computing here held ~15 MB per horizon plus
  // the bar reads, and drove web memory restarts on 2026-09-30).
  if (readsSharedState()) {
    const shared = readShared<HorizonState>(`sector-ignition-${horizon}`, 7 * 86_400_000);
    if (shared?.data && (!st || Date.parse(shared.data.asOf) >= Date.parse(st.asOf))) { st = shared.data; stateCache.set(horizon, st); }
  }
  if (!st || (!readsSharedState() && Date.now() - Date.parse(st.asOf) > TTL[horizon])) {
    const { runHeavy } = await import('./lib/heavy-job-gate');
    const fresh = await runHeavy(`sector-ignition:${horizon}:api`, () => compute(horizon, Date.now()), { priority: 'normal', maxWaitMs: 60_000 });
    st = fresh ?? stateCache.get(horizon) ?? newState(horizon, Date.now());
  }
  return {
    ...st,
    ageSec: Math.round((Date.now() - Date.parse(st.asOf)) / 1000),
    cadence: CADENCE[horizon],
    config: { ...IGNITION_CFG[horizon], ideas: { perGroupPerHorizon: IGNITION_CFG.ideas.perGroupPerHorizon, perDay: IGNITION_CFG.ideas.perDay[horizon] } },
    honesty: 'Measuring: every threshold here is unvalidated. Walk-forward law — a short-window win is a regime artefact until proven (research/sector-ignition-backtest.ts; intraday is forward-logged only). Research, not a recommendation.',
  };
}

/** Read-only: the newest read of a horizon this process holds or the worker published — never computes. */
export function peekSectorIgnition(horizon: IgnitionHorizon): HorizonState | null {
  const local = stateCache.get(horizon) ?? null;
  const shared = readShared<HorizonState>(`sector-ignition-${horizon}`, Infinity)?.data ?? null;
  if (local && shared) return Date.parse(shared.asOf) > Date.parse(local.asOf) ? shared : local;
  return local ?? shared;
}

export const CADENCE: Record<IgnitionHorizon, string> = {
  intraday: 'every 5 min 09:30–11:30 ET (members fully re-read every ~15 min; stirring/igniting groups every pass)',
  daily: 'pre-market 09:05 / 09:20 ET, first hour with the intraday pass to 10:30, end-of-day read 16:10 ET',
  swing: 'after the close 16:45 ET and 10:36 ET',
  weekly: 'Monday 09:12 ET (pre-market) and Friday 16:50 ET',
};

// ─── Ideas ───────────────────────────────────────────────────────────────

function capStateFor(horizon: IgnitionHorizon, dk: string, open: any[]): IdeaCapState {
  let e = emittedDay.get(horizon);
  if (!e || e.dateKey !== dk) { e = { dateKey: dk, perGroup: {}, symbols: new Set(), n: 0 }; emittedDay.set(horizon, e); }
  return { perGroup: e.perGroup, emittedToday: e.n, emittedSymbols: e.symbols, open: open.map((i: any) => ({ symbol: String(i.symbol).toUpperCase(), direction: String(i.direction), source: i.source })) };
}
function noteEmitted(horizon: IgnitionHorizon, groupId: string, symbol: string) {
  const e = emittedDay.get(horizon)!; e.n++; e.perGroup[groupId] = (e.perGroup[groupId] ?? 0) + 1; e.symbols.add(symbol);
}

/** Rebuild today's emitted counts from the DB after a restart (caps must survive a deploy). */
async function hydrateEmitted(dk: string): Promise<void> {
  if (Array.from(emittedDay.values()).some((e) => e.dateKey === dk)) return;
  try {
    const { db } = await import('./db');
    const { tradeIdeas } = await import('@shared/schema');
    const { and, eq, gte } = await import('drizzle-orm');
    const since = new Date(etWallToMs(Number(dk.slice(0, 4)), Number(dk.slice(5, 7)), Number(dk.slice(8, 10)), 0)).toISOString();
    const rows = await db.select({ symbol: tradeIdeas.symbol, qs: tradeIdeas.qualitySignals }).from(tradeIdeas).where(and(eq(tradeIdeas.source, IGNITION_SOURCE as any), gte(tradeIdeas.timestamp, since)));
    for (const r of rows as any[]) {
      const h = (r.qs ?? []).find((s: string) => s.startsWith('horizon:'))?.slice(8) as IgnitionHorizon | undefined;
      const g = (r.qs ?? []).find((s: string) => s.startsWith('group:'))?.slice(6);
      if (!h || !g) continue;
      capStateFor(h, dk, []);
      noteEmitted(h, g, String(r.symbol).toUpperCase());
    }
  } catch { /* DB optional — in-memory caps still hold for this process */ }
}

async function openIdeas(): Promise<any[]> {
  try { const { storage } = await import('./storage'); return await storage.getOpenTradeIdeas(); } catch { return []; }
}

function baseIdea(g: GroupRead, symbol: string, side: Side, entry: number, stop: number, t: { t1: number; t2: number | null; t1Basis: string; rr: number }, nowMs: number, extra: { why: string; holding: 'day' | 'swing'; tradeType: string; tag: string }) {
  const evidence = { horizon: g.horizon, phase: g.phase ?? null, group: g.groupId, etf: g.etf, stage: g.stage, side, points: g.points, etfMovePct: g.etfMovePct, relPct: g.relPct, breadthPct: g.breadthPct, flowCount: g.flowCount, metrics: g.metrics, leaders: g.leaders, laggards: g.laggards, levels: g.levels, why: g.why, t1Basis: t.t1Basis, t2: t.t2, validated: false, status: 'measuring' };
  return {
    symbol, direction: side, entryPrice: r2(entry), targetPrice: t.t1, stopLoss: r2(stop), riskRewardRatio: t.rr,
    catalyst: `Sector ignition (${g.horizon}) — ${g.label} ${side === 'long' ? 'igniting up' : 'igniting down'} via ${g.etf}`,
    analysis: [
      `${g.label} group (${g.etf}) reads IGNITING ${side} on the ${g.horizon} horizon${g.phase ? ` (${g.phase.replace('_', ' ')} read)` : ''}: ${g.why.slice(0, 4).join('; ')}.`,
      extra.why,
      `Stop $${stop.toFixed(2)}, T1 $${t.t1.toFixed(2)} (${t.t1Basis}, ${t.rr.toFixed(2)}R)${t.t2 ? `, T2 $${t.t2.toFixed(2)}` : ''}.`,
      'Measuring: sector-ignition thresholds are unvalidated (walk-forward law); loss rules v1 apply at the write.',
    ].join(' '),
    source: IGNITION_SOURCE, dataSourceUsed: `sector_ignition_${g.horizon}_${extra.tag}`,
    sessionContext: 'regular', timestamp: new Date(nowMs).toISOString(),
    outcomeStatus: 'open', confidenceScore: 55, holdingPeriod: extra.holding, tradeType: extra.tradeType,
    qualitySignals: [`horizon:${g.horizon}`, `group:${g.groupId}`, `etf:${g.etf}`, `stage:${g.stage}`, `vehicle:${extra.tag}`, g.breadthPct != null ? `breadth:${g.breadthPct}` : '', g.relPct != null ? `rel_spy:${g.relPct}` : '', `t1_basis:${t.t1Basis}`, 'validated:false', 'measuring'].filter(Boolean),
    convergenceSignalsJson: { sectorIgnition: evidence },
  };
}

async function writeIdea(idea: Record<string, any>): Promise<string | null> {
  const { storage } = await import('./storage');
  const created = await storage.createTradeIdea(idea as any, { dedupWindowHours: 6 });
  return (created as any)?.id ?? null;
}

async function selectOption(symbol: string, side: Side, entry: number, stop: number, t1: number, t2: number | null, mode: 'intraday' | 'swing') {
  try {
    const { selectContracts } = await import('./option-selection-engine');
    const sel = await selectContracts({
      symbol, direction: side === 'long' ? 'bullish' : 'bearish', setup: mode === 'swing' ? 'swing' : 'scalp',
      ...(mode === 'intraday' ? { expiryTier: 'DAILY', allowZeroDte: true, intradayMaxDte: 7, holdingDays: 0 } : { holdingDays: 5, applyDteFit: true }),
      entry, stop, t1, ...(t2 ? { t2 } : {}), conviction: 55, asOfSpot: entry,
    } as any);
    const [lo, hi] = mode === 'swing' ? [30, 60] : [0, 7];
    const picks = sel.picks.filter((p: any) => p.dte >= lo && p.dte <= hi && p.grade !== 'F' && p.entryPremium > 0);
    const pick = picks.find((p: any) => p.tier === sel.recommendedTier) ?? picks[0] ?? null;
    return { pick, note: pick ? null : (sel.note ?? `no ${lo}–${hi} DTE contract passed the gates`) };
  } catch (err) {
    return { pick: null, note: `contract selection failed: ${(err as Error).message}` };
  }
}
const withOption = (base: Record<string, any>, pick: any, tier: string) => (pick
  ? { ...base, assetType: 'option', optionType: pick.optionType, strikePrice: pick.strike, expiryDate: pick.expiry, entryPremium: Number(pick.entryPremium.toFixed(2)), optionDte: pick.dte, expiryTier: tier }
  : { ...base, assetType: 'stock' });

function dateParts(ms: number): [number, number, number] { const p = etParts(ms); return [p.y, p.m, p.d]; }

/** Intraday: WATCH every igniting group's vehicles in the 0DTE list; log the ones whose trigger printed. */
async function emitIntraday(st: HorizonState, nowMs: number): Promise<number> {
  const et = etParts(nowMs);
  if (et.minutes < IGNITION_CFG.intraday.windowStartEt + IGNITION_CFG.intraday.orMinutes || et.minutes > IGNITION_CFG.intraday.windowEndEt) return 0;
  const { getIntradayStructure } = await import('./zero-dte-structure');
  const open = await openIdeas();
  const caps = capStateFor('intraday', et.dateKey, open);
  let n = 0;
  for (const g of st.groups) {
    for (const sym of ideaVehicles(g)) {
      const side = g.side as Side;
      const key = `intraday|${g.groupId}|${sym}|${side}`;
      let w = st.watch.find((x) => x.key === key);
      if (w && w.status !== 'watch') continue;
      const s = await getIntradayStructure(sym).catch(() => null);
      if (!s || s.lastClose == null || s.vwap == null) continue;
      const trigPx = side === 'long' ? s.hodPrior : s.lodPrior;
      if (trigPx == null) continue;
      const entry = s.lastClose;
      const stop = side === 'long' ? Math.min(s.vwap, entry) * 0.999 : Math.max(s.vwap, entry) * 1.001;
      const orH = s.or30High; const orL = s.or30Low; const h = orH != null && orL != null ? orH - orL : 0;
      const cands = side === 'long'
        ? [{ price: s.pdh, label: 'prior-day high' }, { price: trigPx + h, label: '1× OR30 projection' }, { price: trigPx + 2 * h, label: '2× OR30 projection' }]
        : [{ price: s.pdl, label: 'prior-day low' }, { price: trigPx - h, label: '1× OR30 projection' }, { price: trigPx - 2 * h, label: '2× OR30 projection' }];
      const tg = pickStructuralTargets(side, entry, stop, cands, 1);
      if (!w) {
        let contract: any = null; let contractNote: string | null = null;
        try {
          const { pickZeroDteContractFor } = await import('./zero-dte-desk');
          const r = await pickZeroDteContractFor(sym, side, trigPx, stop, tg?.t1 ?? (side === 'long' ? trigPx + h : trigPx - h), tg?.t2 ?? null);
          contract = r.contract; contractNote = r.note;
        } catch (err) { contractNote = `0DTE picker unavailable: ${(err as Error).message}`; }
        w = {
          key, horizon: 'intraday', groupId: g.groupId, groupLabel: g.label, symbol: sym, side,
          trigger: { name: side === 'long' ? 'high of day' : 'low of day', price: r2(trigPx) },
          triggerText: `5-min close ${side === 'long' ? 'above the high' : 'below the low'} of day $${trigPx.toFixed(2)} while ${side === 'long' ? 'above' : 'below'} VWAP $${s.vwap.toFixed(2)}`,
          entry: r2(trigPx), stop: r2(stop), t1: tg?.t1 ?? null, t2: tg?.t2 ?? null, rr: tg?.rr ?? null, t1Basis: tg?.t1Basis ?? null,
          price: r2(entry), priceAt: s.lastBarAt ? new Date(s.lastBarAt + 5 * 60_000).toISOString() : null,
          contract, contractNote, why: `${g.label} igniting ${side} (${g.why.slice(0, 2).join('; ')})${sym === g.etf ? '' : ` — ${sym} is a laggard (catch-up candidate)`}`,
          firstSeen: new Date(nowMs).toISOString(), status: 'watch', ideaId: null, note: null,
        };
        st.watch.push(w);
      } else {
        w.price = r2(entry); w.priceAt = s.lastBarAt ? new Date(s.lastBarAt + 5 * 60_000).toISOString() : w.priceAt;
      }
      const fired = side === 'long' ? entry > trigPx && entry > s.vwap : entry < trigPx && entry < s.vwap;
      if (!fired) continue;
      if (!tg) { w.status = 'withheld'; w.note = 'trigger printed but no structural target ≥ 1R'; continue; }
      const cap = ideaCapCheck('intraday', g.groupId, sym, side, caps);
      if (!cap.ok) { w.status = 'withheld'; w.note = cap.reason; continue; }
      try {
        const base = baseIdea(g, sym, side, entry, stop, tg, nowMs, { why: `Triggered: ${w.triggerText}.`, holding: 'day', tradeType: 'scalp', tag: sym === g.etf ? 'etf' : 'laggard' });
        const c = w.contract;
        const idea = c
          ? { ...base, assetType: 'option', optionType: c.optionType, strikePrice: c.strike, expiryDate: c.expiry, entryPremium: Number(Number(c.mid).toFixed(2)), expiryTier: '0DTE', qualitySignals: [...base.qualitySignals, c.qty ? `qty:${c.qty}` : '', c.premiumStop ? `prem_stop:${r2(c.premiumStop)}` : '', c.premiumT1 ? `prem_t1:${r2(c.premiumT1)}` : ''].filter(Boolean) }
          : { ...base, assetType: 'stock' };
        Object.assign(idea, {
          entryValidUntil: new Date(nowMs + 10 * 60_000).toISOString(),
          exitBy: new Date(etWallToMs(...dateParts(nowMs), 15 * 60 + 55)).toISOString(),
        });
        const id = await writeIdea(idea);
        w.status = 'published'; w.ideaId = id; w.note = c ? null : `no 0DTE contract (${w.contractNote ?? 'none'}) — logged on the stock`;
        noteEmitted('intraday', g.groupId, sym); n++;
        st.emitted.push({ symbol: sym, groupId: g.groupId, side, ideaId: id, at: new Date(nowMs).toISOString() });
        await appendEvents([{ at: new Date(nowMs).toISOString(), horizon: 'intraday', kind: 'idea', groupId: g.groupId, etf: g.etf, from: null, to: g.stage, side, etfPrice: (g.metrics.etfPrice as number) ?? null, etfMovePct: g.etfMovePct, relPct: g.relPct, breadthPct: g.breadthPct, leaders: g.leaders.map((l) => l.symbol), laggards: g.laggards.map((l) => l.symbol), symbol: sym, ideaId: id, status: 'measuring' }]);
      } catch (err) {
        w.status = 'withheld'; w.note = `write gate: ${(err as Error).message}`;
      }
    }
  }
  return n;
}

/** Daily: at the first-hour igniting read, an intraday stock/option idea on the vehicle (0–7 DTE). */
async function emitDaily(st: HorizonState, nowMs: number): Promise<number> {
  if (st.phase !== 'first_hour') return 0;
  const et = etParts(nowMs);
  if (et.minutes < 9 * 60 + 45 || et.minutes > 10 * 60 + 30) return 0;
  const { getIntradayStructure } = await import('./zero-dte-structure');
  const open = await openIdeas();
  const caps = capStateFor('daily', et.dateKey, open);
  let n = 0;
  for (const g of st.groups) {
    for (const sym of ideaVehicles(g)) {
      const side = g.side as Side;
      if (!ideaCapCheck('daily', g.groupId, sym, side, caps).ok) continue;
      const s = await getIntradayStructure(sym).catch(() => null);
      if (!s || s.lastClose == null || s.vwap == null || s.or30Low == null || s.or30High == null) continue;
      const entry = s.lastClose;
      if (side === 'long' ? entry <= s.vwap : entry >= s.vwap) continue; // must be on the group's side of VWAP
      const stop = side === 'long' ? Math.max(Math.min(s.vwap, s.or30Low), 0) * 0.999 : Math.max(s.vwap, s.or30High) * 1.001;
      const h = s.or30High - s.or30Low;
      const cands = side === 'long'
        ? [{ price: s.pdh, label: 'prior-day high' }, { price: s.or30High + h, label: '1× OR30 projection' }, { price: s.or30High + 2 * h, label: '2× OR30 projection' }]
        : [{ price: s.pdl, label: 'prior-day low' }, { price: s.or30Low - h, label: '1× OR30 projection' }, { price: s.or30Low - 2 * h, label: '2× OR30 projection' }];
      const tg = pickStructuralTargets(side, entry, stop, cands, 1);
      if (!tg) continue;
      try {
        const lag = g.laggards.find((l) => l.symbol === sym);
        const base = baseIdea(g, sym, side, entry, stop, tg, nowMs, { why: lag ? `${sym} is a laggard inside the group: ${lag.note}.` : `${sym} leads the group.`, holding: 'day', tradeType: 'day', tag: lag ? 'laggard' : 'leader' });
        const { pick, note } = await selectOption(sym, side, entry, stop, tg.t1, tg.t2, 'intraday');
        const idea = withOption({ ...base, analysis: `${base.analysis} ${pick ? `Contract: ${pick.optionType.toUpperCase()} ${pick.strike} ${pick.expiry} (${pick.dte} DTE, intraday hold).` : `No contract attached — ${note}.`}`, exitBy: new Date(etWallToMs(...dateParts(nowMs), 15 * 60 + 55)).toISOString(), entryValidUntil: new Date(nowMs + 20 * 60_000).toISOString() }, pick, pick && pick.dte <= 0 ? '0DTE' : 'DAILY');
        const id = await writeIdea(idea);
        noteEmitted('daily', g.groupId, sym); n++;
        st.emitted.push({ symbol: sym, groupId: g.groupId, side, ideaId: id, at: new Date(nowMs).toISOString() });
        await appendEvents([{ at: new Date(nowMs).toISOString(), horizon: 'daily', kind: 'idea', groupId: g.groupId, etf: g.etf, from: null, to: g.stage, side, etfPrice: (g.metrics.etfPrice as number) ?? null, etfMovePct: g.etfMovePct, relPct: g.relPct, breadthPct: g.breadthPct, leaders: g.leaders.map((l) => l.symbol), laggards: g.laggards.map((l) => l.symbol), symbol: sym, ideaId: id, status: 'measuring' }]);
      } catch (err) {
        logger.info(`[SECTOR-IGNITION] daily ${sym} not written — ${(err as Error).message}`);
      }
    }
  }
  return n;
}

/** Swing: laggard catch-up, 30–60 DTE (loss rule 4), structural targets; loss rules add the time stop. */
async function emitSwing(st: HorizonState, nowMs: number): Promise<number> {
  const et = etParts(nowMs);
  const groups = ignitionGroups();
  const bars = await dailyBars(groups);
  const open = await openIdeas();
  const caps = capStateFor('swing', et.dateKey, open);
  let n = 0;
  for (const g of st.groups) {
    for (const sym of ideaVehicles(g)) {
      const side = g.side as Side;
      if (!ideaCapCheck('swing', g.groupId, sym, side, caps).ok) continue;
      const c = bars.closes.get(sym); const lo = bars.lows.get(sym); const hi = bars.highs.get(sym);
      if (!c || !lo || !hi) continue;
      const keys = Array.from(c.keys()).sort().filter((k) => k < et.dateKey || et.minutes >= 16 * 60);
      if (keys.length < 25) continue;
      const entry = c.get(keys[keys.length - 1])!;
      const last5 = keys.slice(-5);
      const stop = side === 'long' ? Math.min(...last5.map((k) => lo.get(k)!)) * 0.995 : Math.max(...last5.map((k) => hi.get(k)!)) * 1.005;
      const k20 = keys.slice(-20); const k60 = keys.slice(-60);
      const lag = g.laggards.find((l) => l.symbol === sym);
      const lev = (g.laggards.find((l) => l.symbol === sym)?.note ?? '');
      const etfMove = g.etfMovePct ?? 0;
      const catchUp = lag && lag.movePct != null ? entry * (1 + (etfMove - lag.movePct) / 100) : null;
      const cands = side === 'long'
        ? [{ price: catchUp, label: 'catch-up to the ETF\'s 5-session move' }, { price: Math.max(...k20.map((k) => hi.get(k)!)), label: '20-session high' }, { price: Math.max(...k60.map((k) => hi.get(k)!)), label: '60-session high' }]
        : [{ price: catchUp, label: 'catch-up to the ETF\'s 5-session move' }, { price: Math.min(...k20.map((k) => lo.get(k)!)), label: '20-session low' }, { price: Math.min(...k60.map((k) => lo.get(k)!)), label: '60-session low' }];
      const tg = pickStructuralTargets(side, entry, stop, cands, 1.2);
      if (!tg) continue;
      try {
        const base = baseIdea(g, sym, side, entry, stop, tg, nowMs, { why: `Laggard catch-up: ${lev}. Entry is the last completed close ${keys[keys.length - 1]} (reprice before acting); stop beyond the 5-session ${side === 'long' ? 'low' : 'high'}.`, holding: 'swing', tradeType: 'swing', tag: 'laggard' });
        const { pick, note } = await selectOption(sym, side, entry, stop, tg.t1, tg.t2, 'swing');
        const idea = withOption({ ...base, analysis: `${base.analysis} ${pick ? `Contract: ${pick.optionType.toUpperCase()} ${pick.strike} ${pick.expiry} (${pick.dte} DTE — loss rule 4 fit for a multi-day hold).` : `No 30–60 DTE contract attached — ${note}.`}` }, pick, 'MONTHLY');
        const id = await writeIdea(idea);
        noteEmitted('swing', g.groupId, sym); n++;
        st.emitted.push({ symbol: sym, groupId: g.groupId, side, ideaId: id, at: new Date(nowMs).toISOString() });
        await appendEvents([{ at: new Date(nowMs).toISOString(), horizon: 'swing', kind: 'idea', groupId: g.groupId, etf: g.etf, from: null, to: g.stage, side, etfPrice: (g.metrics.etfPrice as number) ?? null, etfMovePct: g.etfMovePct, relPct: g.relPct, breadthPct: g.breadthPct, leaders: g.leaders.map((l) => l.symbol), laggards: g.laggards.map((l) => l.symbol), symbol: sym, ideaId: id, status: 'measuring' }]);
      } catch (err) {
        logger.info(`[SECTOR-IGNITION] swing ${sym} not written — ${(err as Error).message}`);
      }
    }
  }
  return n;
}

// ─── Scheduled passes (registered in server/idea-producer-schedule.ts) ───

export async function runSectorIgnition(horizon: IgnitionHorizon, opts: { phase?: 'premarket' | 'first_hour' | 'close'; emit?: boolean } = {}): Promise<number> {
  const nowMs = Date.now();
  const et = etParts(nowMs);
  if (et.weekday < 1 || et.weekday > 5) return 0;
  if (horizon === 'intraday' && (et.minutes < IGNITION_CFG.intraday.windowStartEt || et.minutes > IGNITION_CFG.intraday.windowEndEt)) return 0;
  const st = await compute(horizon, nowMs, opts);
  if (opts.emit === false || process.env.SECTOR_IGNITION_IDEAS === 'false') return 0;
  await hydrateEmitted(et.dateKey);
  let n = 0;
  if (horizon === 'intraday') {
    n += await emitIntraday(st, nowMs);
    // The first-hour daily read shares the intraday pass's bars (same 60 s structure cache).
    if (et.minutes <= 10 * 60 + 30) {
      const d = await compute('daily', nowMs, { phase: 'first_hour' });
      n += await emitDaily(d, nowMs);
    }
  } else if (horizon === 'swing') {
    n += await emitSwing(st, nowMs);
  } else if (horizon === 'weekly' && st.watchlist.length) {
    await appendEvents(st.watchlist.map((w) => ({ at: st.asOf, horizon: 'weekly' as const, kind: 'watchlist' as const, groupId: w.groupId, etf: w.etf, from: null, to: w.stage, side: w.side, etfPrice: null, etfMovePct: null, relPct: null, breadthPct: null, leaders: [], laggards: w.symbols, note: w.why, status: 'measuring' as const })));
  }
  const ign = st.groups.filter((g) => g.stage === 'igniting').map((g) => `${g.label} ${g.side}`);
  logger.info(`[SECTOR-IGNITION] ${horizon}${opts.phase ? `/${opts.phase}` : ''}: ${st.groups.length} groups, igniting: ${ign.join(', ') || 'none'} — ${n} idea(s)`);
  return n;
}

/** Intraday WATCH rows for the 0DTE desk ideas list (in memory, no I/O). */
export function getIgnitionDeskWatch(nowMs = Date.now()): WatchItem[] {
  const st = stateCache.get('intraday');
  if (!st) return [];
  const dk = etParts(nowMs).dateKey;
  return st.watch.filter((w) => etParts(Date.parse(w.firstSeen)).dateKey === dk);
}

// ─── Route ───────────────────────────────────────────────────────────────

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerSectorIgnitionRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/sector-ignition', requireBetaAccess, async (req, res) => {
    const h = String(req.query.horizon ?? 'intraday') as IgnitionHorizon;
    if (!['intraday', 'daily', 'swing', 'weekly'].includes(h)) return res.status(400).json({ error: 'horizon must be intraday|daily|swing|weekly' });
    try {
      const st = await getSectorIgnition(h);
      res.json({ ...st, source: IGNITION_SOURCE, generatedAt: new Date().toISOString() });
    } catch (err) {
      logger.error('[SECTOR-IGNITION] read failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'sector ignition unavailable', message: (err as Error)?.message });
    }
  });
  app.get('/api/sector-ignition/events', requireBetaAccess, async (req, res) => {
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200) || 200));
    res.json({ events: await readRecentEvents(limit), generatedAt: new Date().toISOString() });
  });
}
