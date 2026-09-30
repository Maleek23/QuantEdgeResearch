/**
 * SQUEEZE RADAR — engine + job (docs/GAMMA_SQUEEZE.md).
 * =====================================================
 * Runs at the end of every GEX rankings cycle (server/gex-rankings.ts), so it
 * adds NO chain fetches: each ranking row already carries the squeeze read
 * extracted from the same parse (row.squeeze, shared/squeeze-radar.ts).
 *
 * Per cycle it adds only cheap, cached, budgeted reads:
 *   bars      market-data-fallback getBars (Polygon grouped-daily first; one
 *             request covers the universe) — cached 6 h per symbol, ≤ 25 cold
 *             symbols per cycle so a Yahoo fallback can't be stormed
 *   flow      Bullflow live print ring + today's persisted prints (no API call);
 *             netPremium (the provider's ask/bid-inferred lean) for at most the
 *             top 3 names per cycle through bullflow-service's shared 8/min budget
 *   OCC       one public request per published session (all underlyings, by
 *             account type: customer / firm / market maker), ≤ 3 sessions
 *             back-filled per cycle, 2 s apart, cached on disk
 *   short int server/short-interest.ts (Yahoo key stats, 12 h cache), ≤ 5 new
 *             names per cycle and only for names already scoring ≥ 20
 *
 * FORWARD LOG (append-only): every weekday the first cycle at/after 10:30 ET
 * ('open') and at/after 15:30 ET ('close') writes one line per scored symbol to
 * .cache/squeeze-radar/log.jsonl and, when migration 0004 is applied, one row to
 * squeeze_radar_log (ON CONFLICT DO NOTHING — never updated). The log is also
 * the radar's own history for the OI-build, wall-migration and IV-with-spot
 * components, which stay "unavailable" until enough sessions exist.
 *
 * STATUS: unvalidated — measuring. No threshold was fitted.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { readShared, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { marketDateET } from '@shared/market-day';
import {
  scoreSqueezeRadar, squeezeMedian, SQUEEZE_RULES, SQUEEZE_WEIGHTS,
  type SqueezeBarsRead, type SqueezeFlowRead, type SqueezeHistoryPoint, type SqueezeOccRead,
  type SqueezeRadarPayload, type SqueezeRadarResult, type SqueezeRadarRow, type SqueezeChainInputs,
} from '@shared/squeeze-radar';
import type { GexRankRow } from './gex-rankings';
import { BoundedCache } from './lib/bounded-cache';

const DIR = path.join(process.cwd(), '.cache', 'squeeze-radar');
const LOG_FILE = path.join(DIR, 'log.jsonl');
const OCC_DIR = path.join(process.cwd(), '.cache', 'occ-volume');
const MAX_ROW_AGE_MS = 4 * 24 * 3600_000;
const STALE_MS = 45 * 60_000;
const BARS_TTL_MS = 6 * 3600_000;
const MAX_COLD_BARS_PER_CYCLE = 25;
const MAX_NET_PREMIUM_PER_CYCLE = 3;
const MAX_SHORT_INT_PER_CYCLE = 5;
const OCC_BACKFILL_PER_CYCLE = 3;
const OCC_SPACING_MS = 2_000;

interface Scored { result: SqueezeRadarResult; row: GexRankRow }
const latest = new Map<string, Scored>();
let lastRunAt: string | null = null;
let running = false;

// ─── Forward log / own history ──────────────────────────────────────────

interface LogLine {
  date: string; slot: 'open' | 'close'; symbol: string; at: string;
  score: number; coverage: number; stage: string;
  points: Record<string, number | null>;
  chain: Pick<SqueezeChainInputs, 'spot' | 'nearOtmCallOI' | 'nearOtmCallVol' | 'openingCallStrikes' | 'squeezeStrike' | 'atmIv' | 'callSkew'> & { callWall: number | null; adjBalance: number | null; naiveBalance: number | null } | null;
  chainAsOf: string | null; source: string | null; oiDate: string | null;
}
let history: Map<string, SqueezeHistoryPoint[]> | null = null;
const loggedSlots = new Set<string>(); // `${date}|${slot}|${symbol}`

function loadHistory(): Map<string, SqueezeHistoryPoint[]> {
  if (history) return history;
  history = new Map();
  try {
    const byKey = new Map<string, LogLine>();
    for (const line of fs.readFileSync(LOG_FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const l = JSON.parse(line) as LogLine;
        loggedSlots.add(`${l.date}|${l.slot}|${l.symbol}`);
        const k = `${l.symbol}|${l.date}`;
        const prev = byKey.get(k);
        if (!prev || (prev.slot === 'open' && l.slot === 'close')) byKey.set(k, l); // prefer the close read
      } catch { /* skip corrupt line */ }
    }
    for (const l of byKey.values()) {
      if (!l.chain) continue;
      const arr = history.get(l.symbol) ?? [];
      arr.push({ date: l.date, spot: l.chain.spot, nearOtmCallOI: l.chain.nearOtmCallOI, callWall: l.chain.callWall, squeezeStrike: l.chain.squeezeStrike, atmIv: l.chain.atmIv });
      history.set(l.symbol, arr);
    }
    for (const arr of history.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  } catch { /* no log yet */ }
  return history;
}

function priorSessions(symbol: string, today: string): SqueezeHistoryPoint[] {
  return (loadHistory().get(symbol) ?? []).filter((h) => h.date < today).slice(-20);
}

function etClock(at = new Date()): { wd: string; mins: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { wd, mins: h * 60 + m };
}

/** Which log slot this moment belongs to, if any. */
export function logSlotFor(at = new Date()): 'open' | 'close' | null {
  const { wd, mins } = etClock(at);
  if (wd === 'Sat' || wd === 'Sun') return null;
  if (mins >= 15 * 60 + 30 && mins <= 16 * 60 + 30) return 'close';
  if (mins >= 10 * 60 + 30 && mins < 15 * 60 + 30) return 'open';
  return null;
}

async function appendLog(lines: LogLine[]): Promise<void> {
  if (!lines.length) return;
  try {
    await fs.promises.mkdir(DIR, { recursive: true });
    await fs.promises.appendFile(LOG_FILE, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  } catch (e: any) {
    logger.warn(`[SQUEEZE-RADAR] log write failed: ${e?.message ?? e}`);
  }
  // DB sink — migrations/0004_squeeze_radar_log.sql. Absent table → one warning, file log stands.
  try {
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    for (const l of lines) {
      await db.execute(sql`
        INSERT INTO squeeze_radar_log (session_date, slot, symbol, score, coverage, stage, spot, components, inputs, logged_at)
        VALUES (${l.date}, ${l.slot}, ${l.symbol}, ${l.score}, ${l.coverage}, ${l.stage}, ${l.chain?.spot ?? null},
                ${JSON.stringify(l.points)}::jsonb, ${JSON.stringify({ chain: l.chain, chainAsOf: l.chainAsOf, source: l.source, oiDate: l.oiDate })}::jsonb, ${l.at})
        ON CONFLICT (session_date, slot, symbol) DO NOTHING`);
    }
  } catch (e: any) {
    if (!dbWarned) { dbWarned = true; logger.warn(`[SQUEEZE-RADAR] DB log unavailable (apply migrations/0004_squeeze_radar_log.sql): ${e?.message ?? e}`); }
  }
}
let dbWarned = false;

// ─── Daily bars ─────────────────────────────────────────────────────────

const barsCache = new BoundedCache<string, { at: number; read: SqueezeBarsRead | null }>({ name: 'squeeze.bars', maxEntries: 400, ttlMs: 12 * 3_600_000, maxBytes: 32 * 1024 * 1024 });

async function barsFor(symbol: string, budget: { cold: number }): Promise<SqueezeBarsRead | null> {
  const hit = barsCache.get(symbol);
  if (hit && Date.now() - hit.at < BARS_TTL_MS) return hit.read;
  if (budget.cold <= 0) return hit?.read ?? null;
  budget.cold--;
  let read: SqueezeBarsRead | null = null;
  try {
    const { getBars } = await import('./market-data-fallback');
    const today = marketDateET();
    const bars = (await getBars(symbol, 60)).filter((b) => b.close > 0 && marketDateET(b.date) < today); // completed sessions only
    if (bars.length >= 6) {
      const last20 = bars.slice(-20);
      read = {
        closes: bars.map((b) => b.close),
        avgDollarVolume20: last20.reduce((a, b) => a + b.close * (b.volume || 0), 0) / last20.length,
        asOf: marketDateET(bars[bars.length - 1].date),
      };
    }
  } catch (e: any) {
    logger.debug(`[SQUEEZE-RADAR] bars ${symbol}: ${e?.message ?? e}`);
  }
  barsCache.set(symbol, { at: Date.now(), read });
  return read;
}

/**
 * Completed sessions + today's chain spot as a provisional last close, when the
 * chain is from today's session. At the 'close' log slot this is (to within the
 * chain delay) the replay's close_t, so live and research/ read the same series.
 */
function withTodaySpot(b: SqueezeBarsRead | null, row: GexRankRow, today: string): SqueezeBarsRead | null {
  if (!b) return null;
  const at = row.quoteTime ?? row.fetchedAt;
  if (!(row.spot > 0) || !at || marketDateET(new Date(at)) !== today || (b.asOf && b.asOf >= today)) return b;
  const { wd } = etClock(new Date(at));
  if (wd === 'Sat' || wd === 'Sun') return b;
  return { ...b, closes: [...b.closes, row.spot], asOf: `${today} (provisional: chain spot)` };
}

// ─── Flow (Bullflow tape; no API call except the budgeted net premium) ──

interface FlowAgg { read: SqueezeFlowRead; nearCalls: Array<{ strike: number; premium: number }> }

async function flowBySymbol(): Promise<{ map: Map<string, FlowAgg>; state: string }> {
  const map = new Map<string, FlowAgg>();
  try {
    const bf = await import('./bullflow-service');
    if (!bf.bullflowEnabled()) return { map, state: 'off' };
    const today = marketDateET();
    const ring = bf.getBullflowPrints();
    const persisted = await bf.readPersistedPrints(today);
    const seen = new Set<string>();
    const now = Date.now();
    for (const p of [...persisted, ...ring.prints]) {
      if (seen.has(p.id) || marketDateET(new Date(p.at)) !== today) continue;
      seen.add(p.id);
      const sym = p.underlying.toUpperCase();
      const a = map.get(sym) ?? { read: { callPremium: 0, putPremium: 0, otmNearCallPremium: 0, prints: 0, asOf: null, source: 'Bullflow algo prints (today)' }, nearCalls: [] };
      const f = a.read;
      f.prints++;
      if (p.optionType === 'call') f.callPremium += p.premium || 0; else f.putPremium += p.premium || 0;
      const dte = (Date.parse(`${p.expiry}T20:00:00Z`) - now) / 864e5;
      // OTM is judged against the chain spot in finishFlow().
      if (p.optionType === 'call' && dte <= SQUEEZE_RULES.nearMaxDays) a.nearCalls.push({ strike: p.strike, premium: p.premium || 0 });
      if (!f.asOf || p.at > f.asOf) f.asOf = p.at;
      map.set(sym, a);
    }
    return { map, state: ring.state };
  } catch (e: any) {
    logger.debug(`[SQUEEZE-RADAR] flow read failed: ${e?.message ?? e}`);
    return { map, state: 'error' };
  }
}

function finishFlow(a: FlowAgg | undefined, spot: number): SqueezeFlowRead | null {
  if (!a) return null;
  const otm = a.nearCalls.filter((c) => c.strike > spot * (1 + SQUEEZE_RULES.otmCallMin)).reduce((x, c) => x + c.premium, 0);
  return { ...a.read, otmNearCallPremium: otm };
}

// ─── OCC daily volume by account type ───────────────────────────────────

type OccDay = Record<string, { cC: number; fC: number; mC: number; cP: number; fP: number; mP: number }>;
const occMem = new BoundedCache<string, OccDay | 'none'>({ name: 'squeeze.occDays', maxEntries: 25, maxBytes: 32 * 1024 * 1024 });

/** Parse an OCC volume-query CSV (all underlyings, one day) into per-underlying sides. Exported for tests/research. */
export function parseOccCsv(txt: string): OccDay {
  const agg: OccDay = {};
  const lines = txt.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 7) continue;
    const q = Number(p[0]); const u = p[1]; const ac = p[3]; const pc = p[4];
    if (!u || !Number.isFinite(q)) continue;
    const k = ac === 'C' ? 'c' : ac === 'F' ? 'f' : ac === 'M' ? 'm' : null;
    if (!k) continue;
    const a = (agg[u] ??= { cC: 0, fC: 0, mC: 0, cP: 0, fP: 0, mP: 0 });
    (a as any)[k + (pc === 'C' ? 'C' : 'P')] += q;
  }
  return agg;
}

async function occDay(date: string, allowFetch: { n: number }): Promise<OccDay | null> {
  const mem = occMem.get(date);
  if (mem) return mem === 'none' ? null : mem;
  const file = path.join(OCC_DIR, `${date}.json`);
  try {
    const d = JSON.parse(await fs.promises.readFile(file, 'utf8')) as OccDay;
    occMem.set(date, Object.keys(d).length ? d : 'none');
    return Object.keys(d).length ? d : null;
  } catch { /* not cached */ }
  if (allowFetch.n <= 0) return null;
  allowFetch.n--;
  const ymd = date.replace(/-/g, '');
  const url = `https://marketdata.theocc.com/volume-query?reportDate=${ymd}&format=csv&volumeQueryType=O&symbolType=ALL&symbol=&reportType=D&accountType=ALL&productKind=ALL&porc=BOTH`;
  try {
    await new Promise((r) => setTimeout(r, OCC_SPACING_MS));
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (QuantEdge squeeze radar; one request per session)' } });
    if (!r.ok) return null;
    const d = parseOccCsv(await r.text());
    await fs.promises.mkdir(OCC_DIR, { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(d));
    occMem.set(date, Object.keys(d).length ? d : 'none');
    return Object.keys(d).length ? d : null;
  } catch (e: any) {
    logger.debug(`[SQUEEZE-RADAR] OCC ${date}: ${e?.message ?? e}`);
    return null;
  }
}

function priorWeekdays(from: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  while (out.length < n) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Latest published session + up to 20 before it (whatever is cached / fetchable this cycle). */
async function occWindow(): Promise<{ latest: string | null; days: Array<{ date: string; d: OccDay }> }> {
  const budget = { n: OCC_BACKFILL_PER_CYCLE };
  const dates = priorWeekdays(marketDateET(), 30); // newest first; holidays come back empty
  const days: Array<{ date: string; d: OccDay }> = [];
  for (const date of dates) {
    const d = await occDay(date, budget);
    if (d) days.push({ date, d });
    if (days.length >= 21) break;
  }
  return { latest: days[0]?.date ?? null, days };
}

function occReadFor(symbol: string, w: { latest: string | null; days: Array<{ date: string; d: OccDay }> }): SqueezeOccRead | null {
  if (!w.latest || !w.days.length) return null;
  const cur = w.days[0].d[symbol];
  if (!cur) return null;
  const base = w.days.slice(1, 21).map((x) => x.d[symbol]?.cC ?? 0);
  return { customerCallSides: cur.cC, baselineMedian: base.length ? squeezeMedian(base) : null, sessions: base.length, date: w.latest };
}

// ─── Cycle ──────────────────────────────────────────────────────────────

export async function runSqueezeRadarCycle(rows: GexRankRow[]): Promise<void> {
  if (running) return;
  running = true;
  const t0 = Date.now();
  try {
    const now = Date.now();
    const today = marketDateET();
    const usable = rows.filter((r) => r.squeeze && now - Date.parse(r.fetchedAt) < MAX_ROW_AGE_MS);
    const flow = await flowBySymbol();
    const occ = await occWindow();
    const barsBudget = { cold: MAX_COLD_BARS_PER_CYCLE };
    const { getShortInterest } = await import('./short-interest');
    const siBudget = { n: MAX_SHORT_INT_PER_CYCLE };
    const siCache = shortIntCache;

    const scored: Scored[] = [];
    for (const row of usable) {
      const sym = row.symbol;
      const bars = withTodaySpot(await barsFor(sym, barsBudget), row, today);
      const si = siCache.get(sym);
      const inputs = {
        symbol: sym,
        chain: row.squeeze ?? null,
        chainAsOf: row.quoteTime ?? row.fetchedAt,
        chainSource: row.dataSource,
        openInterestDate: row.openInterestDate,
        changePct: row.changePct,
        history: priorSessions(sym, today),
        bars,
        flow: finishFlow(flow.map.get(sym), row.spot),
        occ: occReadFor(sym, occ),
        shortPctFloat: si?.pct ?? null,
      };
      let result = scoreSqueezeRadar(inputs);
      // Short interest: only for names already showing structure, budgeted.
      if (!si && result.score >= 20 && siBudget.n > 0) {
        siBudget.n--;
        try {
          const s = await getShortInterest(sym);
          siCache.set(sym, { pct: s.shortPercentOfFloat, at: Date.now() });
          if (s.shortPercentOfFloat != null) result = scoreSqueezeRadar({ ...inputs, shortPctFloat: s.shortPercentOfFloat });
        } catch { siCache.set(sym, { pct: null, at: Date.now() }); }
      }
      scored.push({ result, row });
    }

    // Provider net premium (aggressor lean) for the top few only — shared 8/min Bullflow budget.
    const top = [...scored].sort((a, b) => b.result.score - a.result.score).slice(0, MAX_NET_PREMIUM_PER_CYCLE);
    if (flow.state !== 'off') {
      const bf = await import('./bullflow-service');
      for (const s of top) {
        try {
          const np = await bf.getNetPremiumToday(s.row.symbol);
          if (!np) continue;
          const f = finishFlow(flow.map.get(s.row.symbol), s.row.spot) ?? { callPremium: 0, putPremium: 0, otmNearCallPremium: 0, prints: 0, asOf: null, source: 'Bullflow' };
          const merged: SqueezeFlowRead = { ...f, netCallPremium: np.callsNetPremium, netPutPremium: np.putsNetPremium, asOf: f.asOf ?? np.asOf, source: `${f.source} + provider net premium (ask/bid-inferred)`, prints: Math.max(f.prints, 1), callPremium: f.callPremium || Math.max(0, np.callsNetPremium), putPremium: f.putPremium || Math.max(0, np.putsNetPremium) };
          const si = siCache.get(s.row.symbol);
          s.result = scoreSqueezeRadar({
            symbol: s.row.symbol, chain: s.row.squeeze ?? null, chainAsOf: s.row.quoteTime ?? s.row.fetchedAt, chainSource: s.row.dataSource,
            openInterestDate: s.row.openInterestDate, changePct: s.row.changePct, history: priorSessions(s.row.symbol, today),
            bars: withTodaySpot(barsCache.get(s.row.symbol)?.read ?? null, s.row, today), flow: merged, occ: occReadFor(s.row.symbol, occ), shortPctFloat: si?.pct ?? null,
          });
        } catch { /* budget exhausted or provider down — tape-only read stands */ }
      }
    }

    latest.clear();
    for (const s of scored) latest.set(s.row.symbol, s);
    lastRunAt = new Date().toISOString();
    if (writesSharedState()) writeSharedSync(RADAR_SHARED, { lastRunAt, latest: [...latest.values()] });

    // Forward log: one line per symbol per slot per day.
    const slot = logSlotFor();
    if (slot) {
      loadHistory();
      const lines: LogLine[] = [];
      for (const { result, row } of scored) {
        const key = `${today}|${slot}|${row.symbol}`;
        if (loggedSlots.has(key)) continue;
        if (Date.now() - Date.parse(row.fetchedAt) > STALE_MS) continue; // only fresh chains are logged as today's read
        loggedSlots.add(key);
        const c = row.squeeze!;
        const line: LogLine = {
          date: today, slot, symbol: row.symbol, at: new Date().toISOString(),
          score: result.score, coverage: result.coverage, stage: result.stage,
          points: Object.fromEntries(result.components.map((x) => [x.key, x.available ? x.points : null])),
          chain: { spot: c.spot, nearOtmCallOI: c.nearOtmCallOI, nearOtmCallVol: c.nearOtmCallVol, openingCallStrikes: c.openingCallStrikes, squeezeStrike: c.squeezeStrike, atmIv: c.atmIv, callSkew: c.callSkew, callWall: c.naive.callWall, adjBalance: c.adjusted.balance, naiveBalance: c.naive.balance },
          chainAsOf: row.quoteTime ?? row.fetchedAt, source: row.dataSource, oiDate: row.openInterestDate,
        };
        lines.push(line);
        const h = loadHistory();
        const arr = h.get(row.symbol) ?? [];
        const existing = arr.findIndex((x) => x.date === today);
        const point = { date: today, spot: c.spot, nearOtmCallOI: c.nearOtmCallOI, callWall: c.naive.callWall, squeezeStrike: c.squeezeStrike, atmIv: c.atmIv };
        if (existing >= 0) { if (slot === 'close') arr[existing] = point; } else arr.push(point);
        h.set(row.symbol, arr);
      }
      await appendLog(lines);
    }
    logger.info(`[SQUEEZE-RADAR] scored ${scored.length} names in ${((Date.now() - t0) / 1000).toFixed(1)}s (flow ${flow.state}, OCC ${occ.days.length} sessions${occ.latest ? ` to ${occ.latest}` : ''})`);
  } finally {
    running = false;
  }
}

const shortIntCache = new Map<string, { pct: number | null; at: number }>();

// ─── Read API ───────────────────────────────────────────────────────────

function toRow(s: Scored): SqueezeRadarRow {
  const asOf = s.row.quoteTime ?? s.row.fetchedAt;
  const ageSec = asOf ? Math.max(0, Math.round((Date.now() - Date.parse(asOf)) / 1000)) : null;
  return { ...s.result, chainAsOf: asOf, chainSource: s.row.dataSource, openInterestDate: s.row.openInterestDate, ageSec, stale: ageSec == null || ageSec * 1000 > STALE_MS };
}

// Split deployment: the cycle runs in the worker (inside the GEX ranking job);
// the web process serves its last result from the shared file.
const RADAR_SHARED = 'squeeze-radar';
let radarHydratedAt = 0;
function hydrateRadar(): void {
  if (!readsSharedState()) return;
  const r = readShared<{ lastRunAt: string | null; latest: Scored[] }>(RADAR_SHARED);
  if (!r || r.writtenAtMs <= radarHydratedAt) return;
  radarHydratedAt = r.writtenAtMs;
  latest.clear();
  for (const x of r.data.latest ?? []) latest.set(x.row.symbol, x);
  lastRunAt = r.data.lastRunAt;
}

export function getSqueezeRadar(limit = 40): SqueezeRadarPayload {
  hydrateRadar();
  const all = [...latest.values()].map(toRow);
  const stageRank: Record<string, number> = { igniting: 0, primed: 1, building: 2, exhausted: 3, quiet: 4, illiquid: 5 };
  all.sort((a, b) => Number(a.stale) - Number(b.stale) || stageRank[a.stage] - stageRank[b.stage] || b.score - a.score);
  const h = loadHistory();
  const dates = new Set<string>();
  for (const arr of h.values()) for (const p of arr) dates.add(p.date);
  const sorted = [...dates].sort();
  return {
    generatedAt: new Date().toISOString(),
    lastRunAt,
    rows: all.slice(0, limit),
    weights: SQUEEZE_WEIGHTS,
    rules: SQUEEZE_RULES,
    status: 'unvalidated — measuring',
    note: 'Score orders names by squeeze structure (0–100, sum of available components); it is not a probability. Weights are judgment, not fitted. Components without data are shown as unavailable, never imputed.',
    universe: latest.size,
    logged: { sessions: sorted.length, lastDate: sorted[sorted.length - 1] ?? null, sink: 'file .cache/squeeze-radar/log.jsonl + table squeeze_radar_log (if migrated)' },
  };
}
