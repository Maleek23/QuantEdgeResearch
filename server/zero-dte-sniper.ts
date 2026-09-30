/**
 * 0DTE SNIPER — board-wide classic setups + lotto contracts, two-stage, OFF by default.
 * ===================================================================================
 * The 0DTE desk (server/zero-dte-desk.ts) watches five names. The AMD 0DTE of
 * 2026-09-30 (held ~600 twice, reclaimed VWAP ~605, ran to 610.58; the 615C went
 * 0.25 → 1.22) was on the board but not on the desk. This engine watches the
 * whole board for the classic setups defined in server/zero-dte-sniper-core.ts —
 * the same detectors research/zero-dte-setups-replay.ts measured on real option
 * bars — without paying for an option chain per name.
 *
 * MEMORY IS THE CONSTRAINT (2 GB droplet; the worker restarts above ~900 MB; a
 * full chain + GEX pass costs 150–250 MB transient). So:
 *
 *   STAGE 1 — price only, whole board, every 2 min 09:45–15:50 ET.
 *     One batched Alpaca request for many symbols (v2/stocks/bars?symbols=A,B,…
 *     &timeframe=1Min), fetched INCREMENTALLY (only bars newer than the last
 *     one held), kept in a BoundedCache (compact 1-minute rows for today only).
 *     Prior-day high/low/close + ATR20 come from one batched daily-bar request
 *     per day. The detectors run on closed bars; a trigger is "fresh" when its
 *     bar closed inside the last FRESH_MS.
 *
 *   STAGE 2 — an option chain ONLY for names whose setup just fired, at most
 *     ZERO_DTE_SNIPER_MAX_CHAINS (default 3) per cycle, each fetch through the
 *     process-wide heavy-job gate (runHeavy, 'high'), expiry-bounded to TODAY and
 *     strike-bounded (±15%) via getAlpacaOptionsChain; CBOE (maxDays 0) is the
 *     fallback. Names over the cap become "watch" rows with the reason.
 *
 * Because stage 2 calls runHeavy per chain, the cycle itself must NOT run under
 * runHeavy (the gate is concurrency 1 — nesting would deadlock); the schedule
 * uses its own in-flight guard (see idea-producer-schedule.ts).
 *
 * PUBLISHING. Only setup × side × contract combinations listed publish:true in
 * SNIPER_POLICIES (core) — i.e. those that held in BOTH walk-forward halves of
 * the replay — publish, through storage.createTradeIdea (source
 * 'zero_dte_sniper'), labelled measuring, with the exact trigger timestamp,
 * setup, contract, entry premium, the exit rule that replayed best, and the
 * loss rules. Every other trigger is a "watch" row. ZERO_DTE_SNIPER=true in
 * the environment is required for the schedule to run at all.
 *
 * GET /api/zero-dte/sniper serves the last cycle (ROLE=web reads the worker's
 * shared file .cache/shared/zero-dte-sniper.json).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { BoundedCache } from './lib/bounded-cache';
import { readShared, sharedStamp, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etDateKey, etMinutes, parseWatch } from './zero-dte-desk-core';
import {
  CONTRACT_VARIANTS, EXIT_LABEL, SETUP_LABEL, SNIPER_LOSS_RULES, SNIPER_POLICIES, VARIANT_LABEL,
  detectSetups, etClock, hhmm, pickContract, policyFor, selectForStage2, zoneRoundStep,
  type ContractCandidate, type ContractVariant, type DayContext, type ExternalZone, type MinuteBar, type SetupId, type Side, type ZoneKind,
} from './zero-dte-sniper-core';

export const SNIPER_SOURCE = 'zero_dte_sniper';
export const SNIPER_SHARED = 'zero-dte-sniper';

export const SNIPER_LIVE_CFG = {
  START_MIN: 9 * 60 + 45,
  END_MIN: 15 * 60 + 50,
  /** A trigger bar must have CLOSED within this window to act on it (cadence 2 min + fetch latency). */
  FRESH_MS: 4 * 60_000,
  UNIVERSE_CAP: Math.max(10, Number(process.env.ZERO_DTE_SNIPER_UNIVERSE_CAP) || 150),
  MAX_CHAINS: Math.max(0, Number(process.env.ZERO_DTE_SNIPER_MAX_CHAINS ?? 3)),
  MAX_PUBLISH_PER_DAY: Math.max(0, Number(process.env.ZERO_DTE_SNIPER_MAX_PER_DAY ?? 8)),
  SYMBOLS_PER_REQUEST: 100,
  CHAIN_BAND: 0.15,
} as const;

const INDEX_ETFS = ['SPY', 'QQQ', 'IWM'];
/** Names the chart GEX recorder samples by default (SPX is recorded too, but has no stock bars — SPY carries it). */
const GEX_RECORDED = new Set(['SPY', 'QQQ', 'IWM']);
/** Cash indices / non-equities have no Alpaca stock bars — cut from stage 1 (SPX is covered by SPY). */
const NOT_A_STOCK = /^(\^|SPX$|NDX$|RUT$|VIX$|XSP$|DJX$)|[-/=]|USD$/;

export function sniperEnabled(): boolean {
  return process.env.ZERO_DTE_SNIPER === 'true';
}

// ─── types ────────────────────────────────────────────────────────────────

export interface ContractPick {
  variant: ContractVariant;
  occ: string; strike: number; type: 'call' | 'put'; expiry: string;
  bid: number | null; ask: number | null; volume: number;
}
export interface SniperRow {
  symbol: string;
  setup: SetupId; setupLabel: string; side: Side;
  /** Exact trigger time: the CLOSE of the 1-minute trigger bar (bar start + 60 s), ISO + ET clock. */
  triggerAt: string; triggerEt: string;
  triggerPrice: number; level: number; levelName: string; note: string;
  /** reactive_zone: touch number and zone source class ('gex' zones are live-only and UNMEASURED). */
  touch: number | null; zoneKind: ZoneKind | null;
  /** Time-of-day RVOL of the trigger (server/volume-read.ts, 5-min Yahoo bars) — read only for rows that got a chain. */
  volume: { triggerRvol: number | null; label: string; source: string; asOf: string | null } | null;
  status: 'published' | 'watch';
  /** Why it is a watch row (not publishable, cap, no chain, no 0DTE today…). */
  reason: string | null;
  contracts: ContractPick[];
  chainSource: string | null;
  ideaId: string | null;
  measuring: true;
}
export interface SniperCycle {
  at: string;
  dateKey: string;
  enabled: boolean;
  skipped: string | null;
  universeSize: number;
  universeCut: string[];
  universeSources: { convictions: number; watch: number; etfs: number; boardWarm: boolean };
  feed: string | null;
  barsHeld: number;
  requests: number;
  triggersFresh: number;
  triggersStale: number;
  rows: SniperRow[];
  published: Array<{ ideaId: string | null; symbol: string; setup: SetupId; side: Side; variant: ContractVariant; occ: string; premium: number }>;
  chainFetches: { used: number; cap: number; symbols: string[]; deferred: string[] };
  cycleMs: number;
  memory: { rssBeforeMb: number; rssAfterMb: number; heapUsedAfterMb: number };
  errors: string[];
  label: 'measuring';
}

// ─── state ────────────────────────────────────────────────────────────────

interface DayBars { dateKey: string; bars: MinuteBar[]; preLow: number | null; preHigh: number | null; lastT: number }
const barStore = new BoundedCache<string, DayBars>({
  name: '0dte.sniperBars', maxEntries: 220, ttlMs: 10 * 3600_000, maxBytes: 40 * 1024 * 1024,
  sizeOf: (v) => 256 + v.bars.length * 112,
});
interface Daily { dateKey: string; ctx: DayContext }
const dailyStore = new BoundedCache<string, Daily>({ name: '0dte.sniperDaily', maxEntries: 260, ttlMs: 20 * 3600_000, sizeOf: () => 200 });

let day = { dateKey: '', seen: new Set<string>(), published: 0, rows: [] as SniperRow[] };
let lastCycle: SniperCycle | null = null;
let inflight: Promise<SniperCycle> | null = null;

function resetDay(dateKey: string) {
  if (day.dateKey === dateKey) return;
  day = { dateKey, seen: new Set(), published: 0, rows: [] };
  barStore.clear();
}

const mb = (n: number) => Math.round(n / 1024 / 1024);

// ─── Alpaca stock data (batched) ─────────────────────────────────────────

type FetchJson = (url: string) => Promise<{ status: number; json: any | null }>;
const defaultFetch: FetchJson = async (url) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '', 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' }, signal: ctl.signal });
    if (!r.ok) return { status: r.status, json: null };
    return { status: r.status, json: await r.json() };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
};

let feed: 'sip' | 'iex' = (process.env.ZERO_DTE_SNIPER_FEED === 'iex' ? 'iex' : 'sip');
let feedFellBackOn = '';

/** Batched multi-symbol bars; pages merged per symbol. Returns rows keyed by symbol. */
async function batchedBars(symbols: string[], timeframe: '1Min' | '1Day', startIso: string, fetchJson: FetchJson, counter: { n: number }): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  for (let i = 0; i < symbols.length; i += SNIPER_LIVE_CFG.SYMBOLS_PER_REQUEST) {
    const chunk = symbols.slice(i, i + SNIPER_LIVE_CFG.SYMBOLS_PER_REQUEST);
    let token: string | null = null;
    for (let page = 0; page < 30; page++) {
      const qs = new URLSearchParams({ symbols: chunk.join(','), timeframe, start: startIso, limit: '10000', adjustment: 'split', feed });
      if (token) qs.set('page_token', token);
      const { status, json } = await fetchJson(`https://data.alpaca.markets/v2/stocks/bars?${qs}`);
      counter.n++;
      if (status === 403 && feed === 'sip') {
        // Free plans may not query the last 15 min of SIP; IEX is real-time (thinner volume — stamped on the cycle).
        feed = 'iex'; feedFellBackOn = new Date().toISOString(); page--; token = null;
        logger.warn('[0DTE-SNIPER] SIP refused for recent bars — using the IEX feed');
        continue;
      }
      if (!json) throw new Error(`stock bars HTTP ${status}`);
      for (const [sym, arr] of Object.entries(json.bars ?? {}) as Array<[string, any[]]>) {
        const a = out.get(sym) ?? [];
        for (const b of arr) a.push(b);
        out.set(sym, a);
      }
      token = json.next_page_token ?? null;
      if (!token) break;
    }
  }
  return out;
}

async function ensureDaily(symbols: string[], dateKey: string, fetchJson: FetchJson, counter: { n: number }): Promise<void> {
  const need = symbols.filter((s) => dailyStore.get(s)?.dateKey !== dateKey);
  if (!need.length) return;
  const start = new Date(Date.now() - 45 * 86400_000).toISOString();
  const rows = await batchedBars(need, '1Day', start, fetchJson, counter);
  for (const s of need) {
    const prior = (rows.get(s) ?? []).filter((b) => etClock(Date.parse(b.t)).dateKey < dateKey);
    if (prior.length < 2) continue;
    const pd = prior[prior.length - 1];
    const last20 = prior.slice(-20);
    dailyStore.set(s, { dateKey, ctx: { pdh: pd.h, pdl: pd.l, pdc: pd.c, atr20: last20.reduce((a: number, b: any) => a + (b.h - b.l), 0) / last20.length } });
  }
}

/** ET wall-clock → epoch ms for today's date key. */
function etWallMs(dateKey: string, minOfDay: number): number {
  const guess = Date.parse(`${dateKey}T${hhmm(minOfDay)}:00Z`);
  // ET is UTC-4 or UTC-5; pick the offset whose ET clock matches.
  for (const off of [4, 5]) { const t = guess + off * 3600_000; if (etMinutes(t) === minOfDay && etDateKey(t) === dateKey) return t; }
  return guess + 4 * 3600_000;
}

async function refreshBars(symbols: string[], dateKey: string, nowMs: number, fetchJson: FetchJson, counter: { n: number }): Promise<void> {
  const nowMin = etClock(nowMs).min;
  // First fetch of the day: from 04:00 ET while the flush window is still open (pre-market low/high), else 09:30.
  const firstStartMs = etWallMs(dateKey, nowMin <= 11 * 60 + 30 ? 4 * 60 : 9 * 60 + 30);
  // Continuations are grouped so one request serves every symbol that is about equally up to date:
  // "recent" (last bar inside 15 min) share one request from the oldest of them; laggards (thin names,
  // or a symbol with no bars yet) share another, never earlier than the day's first start.
  const fresh: string[] = []; const recent: Array<[string, number]> = []; const lagging: Array<[string, number]> = [];
  for (const s of symbols) {
    const d = barStore.get(s);
    if (!d || d.dateKey !== dateKey || !d.lastT) { fresh.push(s); continue; }
    const since = Math.max(d.lastT + 60_000, firstStartMs);
    (nowMs - since <= 15 * 60_000 ? recent : lagging).push([s, since]);
  }
  const jobs: Array<{ syms: string[]; start: string }> = [];
  if (fresh.length) jobs.push({ syms: fresh, start: new Date(firstStartMs).toISOString() });
  for (const g of [recent, lagging]) if (g.length) jobs.push({ syms: g.map((x) => x[0]), start: new Date(Math.min(...g.map((x) => x[1]))).toISOString() });
  for (const job of jobs) {
    const rows = await batchedBars(job.syms, '1Min', job.start, fetchJson, counter);
    for (const s of job.syms) {
      const d: DayBars = barStore.get(s) && barStore.get(s)!.dateKey === dateKey ? barStore.get(s)! : { dateKey, bars: [], preLow: null, preHigh: null, lastT: 0 };
      for (const b of rows.get(s) ?? []) {
        const t = Date.parse(b.t);
        if (t <= d.lastT) continue;
        const ck = etClock(t);
        if (ck.dateKey !== dateKey) continue;
        const min = ck.min;
        if (min < 9 * 60 + 30) { d.preLow = d.preLow == null ? b.l : Math.min(d.preLow, b.l); d.preHigh = d.preHigh == null ? b.h : Math.max(d.preHigh, b.h); d.lastT = t; continue; }
        if (min >= 16 * 60) continue;
        d.bars.push({ t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw, min });
        d.lastT = t;
      }
      barStore.set(s, d); // re-set so the byte estimate follows the appended bars
    }
  }
}

// ─── universe ─────────────────────────────────────────────────────────────

export function buildUniverse(input: { convictions: string[]; watch: string[]; cap: number }): { symbols: string[]; cut: string[]; dropped: string[] } {
  const ordered = [...INDEX_ETFS, ...input.watch, ...input.convictions].map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const uniq: string[] = []; const dropped: string[] = [];
  for (const s of ordered) {
    if (uniq.includes(s) || dropped.includes(s)) continue;
    if (NOT_A_STOCK.test(s) || !/^[A-Z.]{1,6}$/.test(s)) { dropped.push(s); continue; }
    uniq.push(s);
  }
  return { symbols: uniq.slice(0, input.cap), cut: uniq.slice(input.cap), dropped };
}

async function boardUniverse(): Promise<{ symbols: string[]; cut: string[]; sources: SniperCycle['universeSources'] }> {
  let conv: string[] = []; let warm = false;
  try {
    const { peekConvictions } = await import('./convictions-engine');
    const hit = peekConvictions(); // never triggers a build
    if (hit) { warm = true; conv = hit.data.picks.map((p) => p.symbol); }
  } catch (e) {
    logger.warn(`[0DTE-SNIPER] convictions peek failed: ${(e as Error).message}`);
  }
  const watch = parseWatch(process.env.ZERO_DTE_WATCH);
  const u = buildUniverse({ convictions: conv, watch, cap: SNIPER_LIVE_CFG.UNIVERSE_CAP });
  if (u.cut.length) logger.info(`[0DTE-SNIPER] universe capped at ${SNIPER_LIVE_CFG.UNIVERSE_CAP}: cut ${u.cut.length} (${u.cut.slice(0, 20).join(', ')}${u.cut.length > 20 ? ' …' : ''})`);
  if (u.dropped.length) logger.info(`[0DTE-SNIPER] not stock-bar symbols, skipped: ${u.dropped.join(', ')}`);
  return { symbols: u.symbols, cut: u.cut, sources: { convictions: new Set(conv).size, watch: watch.length, etfs: INDEX_ETFS.length, boardWarm: warm } };
}

// ─── stage 1 ──────────────────────────────────────────────────────────────

export interface LiveTrigger {
  symbol: string; setup: SetupId; side: Side; t: number; closeAt: number; min: number;
  price: number; level: number; levelName: string; note: string; publish: boolean;
  touch: number | null; zoneKind: ZoneKind | null;
}

/**
 * Live GEX zones for reactive_zone (source (b)): the chart GEX recorder's
 * latest sample for this symbol (SPY/QQQ/IWM + charted names), top strikes by
 * |GEX|, only when the sample is < 30 min old. Never fetches a chain.
 * UNMEASURED — the replay has no historical chains.
 */
type GexPeek = (sym: string) => { t: number; levels: Array<[number, number]> } | null;
let gexPeek: GexPeek | null = null;
async function gexZonesFor(sym: string, nowMs: number): Promise<ExternalZone[]> {
  try {
    if (!gexPeek) gexPeek = (await import('./chart-overlays')).peekLatestGexSample;
    const s = gexPeek(sym);
    if (!s || nowMs - s.t > 30 * 60_000) return [];
    return [...s.levels].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6)
      .map(([k, g]) => ({ price: k, source: `GEX ${k} (${g >= 0 ? '+' : '−'}γ, recorded ${hhmm(etClock(s.t).min)} ET)` }));
  } catch {
    return [];
  }
}

/**
 * Stage 1 over `symbols`: refresh bars, run the detectors on CLOSED bars,
 * return the fresh triggers (and count the ones that fired earlier).
 * `freshMs = Infinity` returns every trigger of the day (used by the memory probe).
 */
export async function runStage1(symbols: string[], nowMs: number, opts: { fetchJson?: FetchJson; freshMs?: number; gexZones?: (sym: string) => Promise<ExternalZone[]> } = {}) {
  const fetchJson = opts.fetchJson ?? defaultFetch;
  const dateKey = etDateKey(nowMs);
  resetDay(dateKey);
  const counter = { n: 0 };
  await ensureDaily(symbols, dateKey, fetchJson, counter);
  await refreshBars(symbols, dateKey, nowMs, fetchJson, counter);
  const freshMs = opts.freshMs ?? SNIPER_LIVE_CFG.FRESH_MS;
  const fresh: LiveTrigger[] = []; let stale = 0; let barsHeld = 0;
  for (const s of symbols) {
    const d = barStore.get(s); const daily = dailyStore.get(s);
    if (!d || !daily) continue;
    barsHeld += d.bars.length;
    const closed = d.bars.filter((b) => b.t + 60_000 <= nowMs);
    if (!closed.length) continue;
    const zones = GEX_RECORDED.has(s) ? await (opts.gexZones ?? ((x: string) => gexZonesFor(x, nowMs)))(s) : [];
    const trig = detectSetups(closed, { ...daily.ctx, preLow: d.preLow, preHigh: d.preHigh }, undefined, { zoneRoundStep: zoneRoundStep(s, closed[0].o), zones });
    for (const t of trig) {
      // reactive_zone fires on every holding touch — its key carries the bar; the rest fire once a day.
      const key = t.setup === 'reactive_zone' ? `${s}|${t.setup}|${t.side}|${t.t}` : `${s}|${t.setup}|${t.side}`;
      const closeAt = t.t + 60_000;
      if (day.seen.has(key)) continue;
      if (nowMs - closeAt > freshMs) { stale++; day.seen.add(key); continue; }
      day.seen.add(key);
      const publish = CONTRACT_VARIANTS.some((v) => policyFor(t.setup, t.side, v)?.publish === true);
      fresh.push({ symbol: s, setup: t.setup, side: t.side, t: t.t, closeAt, min: t.min, price: t.price, level: t.level, levelName: t.levelName, note: t.note, publish, touch: t.touch ?? null, zoneKind: t.zoneKind ?? null });
    }
  }
  return { fresh, stale, barsHeld, requests: counter.n, feed };
}

// ─── stage 2 ──────────────────────────────────────────────────────────────

interface SniperChain { source: string; expiry: string; cands: Array<ContractCandidate & { bid: number | null; ask: number | null }> }

async function fetchZeroDteChain(sym: string, dateKey: string): Promise<SniperChain | null> {
  try {
    const ap = await import('./alpaca-options');
    if (ap.isAlpacaOptionsConfigured()) {
      const chain = await ap.getAlpacaOptionsChain(sym, { expiration: dateKey, band: SNIPER_LIVE_CFG.CHAIN_BAND });
      const today = chain?.contracts.filter((c) => c.expiration === dateKey) ?? [];
      if (today.length) {
        return { source: 'Alpaca indicative', expiry: dateKey, cands: today.map((c) => ({ occ: c.occ, strike: c.strike, type: c.type, price: c.ask, volume: c.volume, bid: c.bid, ask: c.ask })) };
      }
    }
  } catch (e) {
    logger.warn(`[0DTE-SNIPER] ${sym} Alpaca chain failed: ${(e as Error).message}`);
  }
  try {
    const { loadCboeChain } = await import('./lib/cboe-loader');
    const j: any = (await loadCboeChain(sym, { maxDays: 0 })).payload;
    const yymmdd = dateKey.slice(2).replace(/-/g, '');
    const opts: any[] = (j?.data?.options ?? []).filter((o: any) => String(o?.option ?? '').includes(yymmdd));
    if (opts.length) {
      const cands = opts.map((o: any) => {
        const m = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(String(o.option));
        return m ? { occ: String(o.option), strike: Number(m[4]) / 1000, type: (m[3] === 'C' ? 'call' : 'put') as 'call' | 'put', price: Number(o.ask) || null, volume: Number(o.volume) || 0, bid: Number(o.bid) || null, ask: Number(o.ask) || null } : null;
      }).filter(Boolean) as SniperChain['cands'];
      if (cands.length) return { source: 'CBOE delayed (~15 min)', expiry: dateKey, cands };
    }
  } catch (e) {
    logger.warn(`[0DTE-SNIPER] ${sym} CBOE chain failed: ${(e as Error).message}`);
  }
  return null;
}

async function publishIdea(row: SniperRow, pick: ContractPick, exitRule: string, evidence: string, nowMs: number): Promise<string | null> {
  const { storage } = await import('./storage');
  const long = row.side === 'long';
  // Underlying plan: stop = back through the trigger level; target = 2R (the premium plan governs the exit).
  let stop = row.level;
  const minGap = row.triggerPrice * 0.002;
  if (long && !(stop < row.triggerPrice - minGap)) stop = row.triggerPrice - minGap;
  if (!long && !(stop > row.triggerPrice + minGap)) stop = row.triggerPrice + minGap;
  const risk = Math.abs(row.triggerPrice - stop);
  const target = long ? row.triggerPrice + 2 * risk : row.triggerPrice - 2 * risk;
  const premium = pick.ask ?? 0;
  const created = await storage.createTradeIdea({
    symbol: row.symbol, assetType: 'option', direction: row.side,
    entryPrice: row.triggerPrice, targetPrice: +target.toFixed(2), stopLoss: +stop.toFixed(2), riskRewardRatio: 2,
    optionType: pick.type, strikePrice: pick.strike, expiryDate: pick.expiry, entryPremium: Number(premium.toFixed(2)),
    catalyst: `${row.symbol} 0DTE ${long ? 'CALLS' : 'PUTS'} — ${row.setupLabel} @ ${row.triggerEt} ET · ${VARIANT_LABEL[pick.variant]} ${pick.strike}${long ? 'C' : 'P'} @ $${premium.toFixed(2)} ask (measuring)`,
    analysis: [
      `Trigger: ${row.note} — bar closed ${row.triggerEt} ET (${row.triggerAt}).`,
      row.touch != null ? `Zone: ${row.levelName} (${row.zoneKind}${row.zoneKind === 'gex' ? ', live GEX — unmeasured' : ''}), touch #${row.touch}.` : '',
      row.volume?.triggerRvol != null ? `Volume: trigger bar ${row.volume.triggerRvol.toFixed(2)}× normal for the time of day (${row.volume.source}).` : '',
      `Contract: ${pick.occ} (${VARIANT_LABEL[pick.variant]}), ask $${premium.toFixed(2)}${pick.bid != null ? ` / bid $${pick.bid.toFixed(2)}` : ''}, day volume ${pick.volume}, chain ${row.chainSource}.`,
      `Plan: ${exitRule}. Replay: ${evidence}.`,
      `Loss rules: ${SNIPER_LOSS_RULES.join(' ')}`,
      'Measuring — replay-selected (both walk-forward halves) but unproven live.',
    ].filter(Boolean).join(' '),
    source: SNIPER_SOURCE, dataSourceUsed: `zero_dte_sniper_${row.setup}_${row.side}_${pick.variant}`,
    sessionContext: 'intraday', timestamp: new Date(nowMs).toISOString(),
    entryValidUntil: new Date(nowMs + 5 * 60_000).toISOString(),
    exitBy: new Date(etWallMs(etDateKey(nowMs), 15 * 60 + 55)).toISOString(),
    expiryTier: '0DTE', optionDte: 0, tradeType: 'scalp', holdingPeriod: 'day', outcomeStatus: 'open', confidenceScore: 50,
    qualitySignals: [
      `setup:${row.setup}`, `side:${row.side}`, `variant:${pick.variant}`, `trigger_at:${row.triggerAt}`, `level:${row.levelName}@${row.level.toFixed(2)}`,
      `exit_plan:${exitRule}`, 'validated:false', 'measuring', 'desk:zero_dte_sniper',
      row.touch != null ? `zone_touch:${row.touch}` : '', row.zoneKind ? `zone_kind:${row.zoneKind}` : '',
      row.volume?.triggerRvol != null ? `trigger_rvol:${row.volume.triggerRvol.toFixed(2)}` : '',
    ].filter(Boolean),
    convergenceSignalsJson: { zeroDteSniper: { ...row, contracts: [pick], plan: exitRule, evidence, lossRules: SNIPER_LOSS_RULES } },
  } as any, { dedupWindowHours: 1 });
  return (created as any)?.id ?? null;
}

/** "Trigger bar N× normal" from the shared volume helper; never throws. */
async function triggerVolume(sym: string, atIso: string): Promise<SniperRow['volume']> {
  try {
    const { getVolumeRead } = await import('./volume-read');
    const v = await getVolumeRead(sym, atIso);
    return { triggerRvol: v.trigger?.rvol ?? null, label: v.label, source: v.source, asOf: v.asOf };
  } catch {
    return null;
  }
}

// ─── the cycle ────────────────────────────────────────────────────────────

/**
 * One cycle. Options exist for dry runs and tests: `force` ignores the clock,
 * `universe` replaces the board (no convictions read), `freshMs` widens the
 * freshness window, `publish:false` never writes an idea.
 */
export async function runZeroDteSniper(nowMs = Date.now(), opts: { force?: boolean; fetchJson?: FetchJson; runHeavyFn?: <T>(name: string, fn: () => Promise<T>) => Promise<T | undefined>; publish?: boolean; universe?: string[]; freshMs?: number } = {}): Promise<SniperCycle> {
  if (inflight) return inflight;
  inflight = cycle(nowMs, opts).finally(() => { inflight = null; });
  return inflight;
}

async function cycle(nowMs: number, opts: Parameters<typeof runZeroDteSniper>[1] = {}): Promise<SniperCycle> {
  const t0 = Date.now();
  const rssBefore = process.memoryUsage().rss;
  const dateKey = etDateKey(nowMs);
  const base: SniperCycle = {
    at: new Date(nowMs).toISOString(), dateKey, enabled: sniperEnabled(), skipped: null,
    universeSize: 0, universeCut: [], universeSources: { convictions: 0, watch: 0, etfs: 0, boardWarm: false },
    feed: null, barsHeld: 0, requests: 0, triggersFresh: 0, triggersStale: 0, rows: [], published: [],
    chainFetches: { used: 0, cap: SNIPER_LIVE_CFG.MAX_CHAINS, symbols: [], deferred: [] },
    cycleMs: 0, memory: { rssBeforeMb: mb(rssBefore), rssAfterMb: 0, heapUsedAfterMb: 0 }, errors: [], label: 'measuring',
  };
  const finish = (c: SniperCycle): SniperCycle => {
    const m = process.memoryUsage();
    c.cycleMs = Date.now() - t0; c.memory.rssAfterMb = mb(m.rss); c.memory.heapUsedAfterMb = mb(m.heapUsed);
    lastCycle = c;
    if (writesSharedState()) writeSharedSync(SNIPER_SHARED, { cycle: c, dayRows: day.rows });
    return c;
  };
  const wd = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const min = etMinutes(nowMs);
  if (!opts.force && (wd === 'Sat' || wd === 'Sun' || min < SNIPER_LIVE_CFG.START_MIN || min > SNIPER_LIVE_CFG.END_MIN)) return finish({ ...base, skipped: `outside 09:45–15:50 ET weekdays (${wd} ${hhmm(min)})` });
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) return finish({ ...base, skipped: 'Alpaca keys not configured' });

  const u = opts.universe
    ? { ...buildUniverse({ convictions: opts.universe, watch: [], cap: SNIPER_LIVE_CFG.UNIVERSE_CAP }), sources: { convictions: opts.universe.length, watch: 0, etfs: INDEX_ETFS.length, boardWarm: false } }
    : await boardUniverse();
  base.universeSize = u.symbols.length; base.universeCut = u.cut; base.universeSources = u.sources;
  let s1: Awaited<ReturnType<typeof runStage1>>;
  try {
    s1 = await runStage1(u.symbols, nowMs, { fetchJson: opts.fetchJson, freshMs: opts.freshMs });
  } catch (e) {
    base.errors.push(`stage 1: ${(e as Error).message}`);
    return finish(base);
  }
  base.feed = s1.feed + (feedFellBackOn ? ` (SIP refused ${feedFellBackOn})` : ''); base.barsHeld = s1.barsHeld; base.requests = s1.requests;
  base.triggersFresh = s1.fresh.length; base.triggersStale = s1.stale;

  // Stage 2 — chains only for fired names, capped, through the heavy gate.
  const { chosen, deferred } = selectForStage2(s1.fresh.map((t) => ({ ...t, t: t.closeAt, rank: t.setup === 'reactive_zone' ? 1 : 0 })), SNIPER_LIVE_CFG.MAX_CHAINS);
  base.chainFetches.symbols = chosen; base.chainFetches.deferred = deferred;
  const gate = opts.runHeavyFn ?? (async <T,>(name: string, fn: () => Promise<T>) => (await import('./lib/heavy-job-gate')).runHeavy(name, fn, { priority: 'high', maxWaitMs: 90_000 }));
  const chains = new Map<string, SniperChain | null>();
  for (const sym of chosen) {
    const c = await gate(`sniper-chain:${sym}`, () => fetchZeroDteChain(sym, dateKey));
    base.chainFetches.used++;
    chains.set(sym, c ?? null);
  }

  const allowPublish = opts.publish ?? sniperEnabled();
  for (const t of s1.fresh) {
    const row: SniperRow = {
      symbol: t.symbol, setup: t.setup, setupLabel: SETUP_LABEL[t.setup], side: t.side,
      triggerAt: new Date(t.closeAt).toISOString(),
      triggerEt: new Date(t.closeAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }),
      triggerPrice: t.price, level: t.level, levelName: t.levelName, note: t.note,
      touch: t.touch, zoneKind: t.zoneKind, volume: null,
      status: 'watch', reason: null, contracts: [], chainSource: null, ideaId: null, measuring: true,
    };
    if (chains.get(t.symbol)) row.volume = await triggerVolume(t.symbol, row.triggerAt);
    if (!chains.has(t.symbol)) {
      row.reason = deferred.includes(t.symbol) ? `stage-2 cap (${SNIPER_LIVE_CFG.MAX_CHAINS} chains/cycle) reached — no chain fetched` : 'no chain fetched';
    } else {
      const chain = chains.get(t.symbol);
      if (!chain) row.reason = 'no same-day expiry listed (or chain unavailable)';
      else {
        row.chainSource = chain.source;
        const type = t.side === 'long' ? 'call' : 'put';
        for (const v of CONTRACT_VARIANTS) {
          const p = pickContract(v, chain.cands, t.price, type);
          if (p) { const full = chain.cands.find((c) => c.occ === p.occ)!; row.contracts.push({ variant: v, occ: p.occ, strike: p.strike, type, expiry: chain.expiry, bid: full.bid, ask: full.ask, volume: full.volume }); }
        }
        const publishable = row.contracts.map((p) => ({ p, pol: policyFor(t.setup, t.side, p.variant) })).filter((x) => x.pol?.publish);
        if (!publishable.length) row.reason = 'setup/side/contract did not survive both replay halves — watch only';
        else if (!allowPublish) row.reason = 'publishable, but ZERO_DTE_SNIPER is off';
        else if (day.published >= SNIPER_LIVE_CFG.MAX_PUBLISH_PER_DAY) row.reason = `daily cap ${SNIPER_LIVE_CFG.MAX_PUBLISH_PER_DAY} reached`;
        else {
          const { p, pol } = publishable[0];
          try {
            const id = await publishIdea(row, p, EXIT_LABEL[pol!.exit], pol!.evidence, nowMs);
            row.status = 'published'; row.ideaId = id; day.published++;
            base.published.push({ ideaId: id, symbol: t.symbol, setup: t.setup, side: t.side, variant: p.variant, occ: p.occ, premium: p.ask ?? 0 });
            logger.info(`[0DTE-SNIPER] ✅ ${t.symbol} ${t.setup} ${t.side} → ${p.occ} @ $${(p.ask ?? 0).toFixed(2)} (measuring)`);
          } catch (e) {
            row.reason = `write gate: ${(e as Error).message}`;
          }
        }
      }
    }
    base.rows.push(row);
    day.rows.push(row);
  }
  if (day.rows.length > 300) day.rows = day.rows.slice(-300);
  logger.info(`[0DTE-SNIPER] ${hhmm(min)} ET: universe ${base.universeSize}, ${base.triggersFresh} fresh / ${base.triggersStale} stale triggers, chains ${base.chainFetches.used}/${base.chainFetches.cap}${deferred.length ? ` (deferred ${deferred.length}: ${deferred.slice(0, 10).join(',')}${deferred.length > 10 ? ',…' : ''})` : ''}, ${base.published.length} published, ${base.requests} bar requests, rss ${base.memory.rssBeforeMb}→${mb(process.memoryUsage().rss)} MB`);
  return finish(base);
}

// ─── read side + route ────────────────────────────────────────────────────

export function getSniperState() {
  let cycle = lastCycle; let dayRows = day.rows; let stamp: ReturnType<typeof sharedStamp> | null = null;
  if (readsSharedState()) {
    const r = readShared<{ cycle: SniperCycle; dayRows: SniperRow[] }>(SNIPER_SHARED, 30 * 60_000);
    stamp = sharedStamp(r);
    if (r) { cycle = r.data.cycle; dayRows = r.data.dayRows ?? []; }
  }
  const publishable = Object.entries(SNIPER_POLICIES).filter(([, p]) => p?.publish).map(([k, p]) => ({ key: k, exit: p!.exit, evidence: p!.evidence }));
  return {
    enabled: sniperEnabled(),
    label: 'measuring' as const,
    lastCycle: cycle,
    today: dayRows.filter((r) => etDateKey(Date.parse(r.triggerAt)) === etDateKey(Date.now())).slice(-150),
    publishable,
    engineState: stamp,
    cfg: { cadence: 'every 2 min 09:45–15:50 ET', universeCap: SNIPER_LIVE_CFG.UNIVERSE_CAP, maxChainsPerCycle: SNIPER_LIVE_CFG.MAX_CHAINS, maxPublishPerDay: SNIPER_LIVE_CFG.MAX_PUBLISH_PER_DAY },
  };
}

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerZeroDteSniperRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/zero-dte/sniper', requireBetaAccess, (_req, res) => {
    try {
      res.json(getSniperState());
    } catch (err) {
      logger.error('[0DTE-SNIPER] state failed', { error: (err as Error)?.message });
      res.status(500).json({ error: '0DTE sniper state failed' });
    }
  });
}
