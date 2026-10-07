/**
 * MOVERS / LEADERS SCANNER — I/O around shared/leaders-detector.ts.
 * ==================================================================
 * One pass (scheduled in server/idea-producer-schedule.ts, in session):
 *   A  universe = top-N liquid names + every sector-board leader. One batched
 *      Alpaca read of today's 5-min bars (plus a once-a-day batched daily read for
 *      prior close / ATR) gives each name's move vs the prior close. Names under
 *      the move threshold stop here (the closest ones are logged).
 *   B  at most LEADERS_CFG.maxDeepReads movers get 12 sessions of 5-min bars (one
 *      batched read): time-of-day RVOL, VWAP, opening range, session high/low →
 *      qualify → trigger → plan (platform level map + snap, ATR floor,
 *      expected-move cap, ≥ MIN_RR_PUBLISH to T1).
 *   C  gates: daily cap (LEADERS_MAX_PER_DAY, default 6), one per symbol/side/day,
 *      earnings within 2 days, BTC-proxy short discipline, already-held, the
 *      option publish gate; then storage.createTradeIdea — validation, dedup,
 *      same-instrument rule, loss rules v1 all apply at the write.
 * Vehicle: ~0.40Δ 14–45 DTE from the existing contract picker when the stock is
 * ≥ $10; stock otherwise or when no contract passes.
 *
 * Every candidate is logged — logger line + .cache/leaders/candidates-YYYY-MM-DD.jsonl —
 * with published / withheld and the reason. LEADERS_IDEAS=false disables.
 * Source `leaders`, labelled MEASURING.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { logger } from './logger';
import { etParts, etWallToMs } from '@shared/loss-rules';
import {
  LEADERS_CFG, LEADERS_DATA_SOURCE, LEADERS_SOURCE, LEADERS_VERSION, TRIGGER_LABEL,
  capCheck, dailyAtr14, etKeyMin, findTrigger, planLeader, qualify, readLeadersEnv, readSession,
  type Bar5, type LeaderPlan, type Qualify, type Side, type Trigger,
} from '@shared/leaders-detector';
import { readMinRrPublish } from '@shared/publish-rr';
import { earningsWithin, pickByDelta, ROTATION_CFG } from '@shared/sector-rotation-ideas';

// ─── types / seams ──────────────────────────────────────────────────────

export interface DailyCtx { prevClose: number; atr: number | null }
export interface SectorPick { id: string; label: string; regime: string | null; rank: number | null }

export interface LeadersDeps {
  nowMs?: number;
  env?: Record<string, string | undefined>;
  universe?: () => Promise<string[]>;
  /** symbol → sector reads for every board group containing it. */
  sectors?: () => Promise<Map<string, SectorPick[]>>;
  daily?: (syms: string[], nowMs: number) => Promise<Map<string, DailyCtx>>;
  bars5m?: (syms: string[], startMs: number) => Promise<Map<string, Bar5[]>>;
  levelMap?: (s: string) => Promise<{ clusters: any[]; tolerance: number; asOf: string } | null>;
  cap?: (p: { symbol: string; direction: Side; entry: number; stop: number; targets: number[]; horizon: 'swing' }) => Promise<number | null>;
  earnings?: (s: string) => Promise<string | null>;
  openIdeas?: () => Promise<any[]>;
  publishedToday?: (dateKey: string) => Promise<Array<{ symbol: string; direction: string }>>;
  contract?: (p: { symbol: string; side: Side; plan: LeaderPlan; price: number }) => Promise<{ pick: any | null; note: string | null }>;
  write?: (idea: Record<string, any>) => Promise<string | null>;
  log?: (row: CandidateLog) => Promise<void>;
}

export interface CandidateLog {
  at: string; dateKey: string; symbol: string; side: Side | null; status: 'published' | 'withheld';
  stage: 'prefilter' | 'qualify' | 'trigger' | 'plan' | 'gate' | 'write';
  reason: string | null; movePct: number | null; rvol?: number | null;
  sector?: SectorPick | null; checks?: Qualify['checks']; trigger?: Trigger | null;
  plan?: LeaderPlan | null; vehicle?: string; ideaId?: string | null; status_tag: 'measuring';
}

export interface LeadersPassResult {
  published: number; candidates: number; universe: number; ms: number; rssDeltaMb: number; rows: CandidateLog[];
}

// ─── live implementations ───────────────────────────────────────────────

const r2 = (x: number) => Math.round(x * 100) / 100;

async function liveUniverse(): Promise<string[]> {
  const out = new Set<string>();
  try { const { getLiquidSymbols } = await import('./liquid-universe'); for (const s of getLiquidSymbols(LEADERS_CFG.universeN)) out.add(s); } catch { /* cold */ }
  try {
    const { readBoard } = await import('./sector-board');
    const snap = readBoard().snap;
    for (const sec of snap?.sectors ?? []) for (const l of sec.leaders ?? []) out.add(l.symbol);
  } catch { /* board not published */ }
  return Array.from(out).filter((s) => /^[A-Z]{1,5}$/.test(s));
}

async function liveSectors(): Promise<Map<string, SectorPick[]>> {
  const map = new Map<string, SectorPick[]>();
  try {
    const [{ readBoard }, { boardGroups }] = await Promise.all([import('./sector-board'), import('@shared/sector-board')]);
    const snap = readBoard().snap;
    if (!snap) return map;
    const byId = new Map(snap.sectors.map((s) => [s.id, s]));
    for (const g of boardGroups()) {
      const row = byId.get(g.id);
      const pick: SectorPick = { id: g.id, label: g.label, regime: row?.regime ?? null, rank: row?.rank ?? null };
      for (const m of g.members) { const a = map.get(m) ?? []; a.push(pick); map.set(m, a); }
    }
  } catch { /* no board */ }
  return map;
}

const toBar = (b: any): Bar5 => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v ?? 0 });

let dailyCache: { dateKey: string; by: Map<string, DailyCtx> } | null = null;
async function liveDaily(syms: string[], nowMs: number): Promise<Map<string, DailyCtx>> {
  const today = etParts(nowMs).dateKey;
  if (!dailyCache || dailyCache.dateKey !== today) dailyCache = { dateKey: today, by: new Map() };
  const need = syms.filter((s) => !dailyCache!.by.has(s));
  if (need.length) {
    const { fetchStockBarsBatched } = await import('./zero-dte-sniper');
    const rows = await fetchStockBarsBatched(need, '1Day', new Date(nowMs - 40 * 86_400_000).toISOString());
    for (const s of need) {
      const done = (rows.get(s) ?? []).filter((b: any) => etKeyMin(Date.parse(b.t)).dateKey < today)
        .map((b: any) => ({ high: b.h, low: b.l, close: b.c }));
      if (done.length < 2) continue;
      dailyCache.by.set(s, { prevClose: done[done.length - 1].close, atr: dailyAtr14(done) });
    }
  }
  return new Map(syms.filter((s) => dailyCache!.by.has(s)).map((s) => [s, dailyCache!.by.get(s)!]));
}

async function liveBars(syms: string[], startMs: number): Promise<Map<string, Bar5[]>> {
  const { fetchStockBarsBatched } = await import('./zero-dte-sniper');
  const rows = await fetchStockBarsBatched(syms, '5Min', new Date(startMs).toISOString());
  const out = new Map<string, Bar5[]>();
  for (const [s, arr] of rows) out.set(s, arr.map(toBar));
  return out;
}

async function liveMap(s: string) { const { getLevelMap } = await import('./levels/level-map'); return getLevelMap(s); }
async function liveCap(p: Parameters<NonNullable<LeadersDeps['cap']>>[0]) { const { expectedMoveCapFor } = await import('./levels/level-map'); return expectedMoveCapFor(p); }
async function liveEarnings(s: string): Promise<string | null> {
  try {
    const { peekEarningsDate, getEarningsDate } = await import('./earnings-service');
    const peek = peekEarningsDate(s);
    const d = peek === undefined ? await getEarningsDate(s) : peek;
    return d ? d.toISOString().slice(0, 10) : null;
  } catch { return null; }
}
async function liveOpen(): Promise<any[]> { try { const { storage } = await import('./storage'); return await storage.getOpenTradeIdeas(); } catch { return []; } }
async function livePublishedToday(dateKey: string): Promise<Array<{ symbol: string; direction: string }>> {
  try {
    const { db } = await import('./db');
    const { tradeIdeas } = await import('@shared/schema');
    const { and, eq, gte } = await import('drizzle-orm');
    const since = new Date(etWallToMs(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)), Number(dateKey.slice(8, 10)), 0)).toISOString();
    return await db.select({ symbol: tradeIdeas.symbol, direction: tradeIdeas.direction }).from(tradeIdeas)
      .where(and(eq(tradeIdeas.source, LEADERS_SOURCE as any), gte(tradeIdeas.timestamp, since))) as any[];
  } catch { return []; }
}
const LEADERS_OPTION_CFG = { ...ROTATION_CFG, option: LEADERS_CFG.option } as unknown as typeof ROTATION_CFG;
async function liveContract(p: { symbol: string; side: Side; plan: LeaderPlan; price: number }) {
  try {
    const { selectContracts } = await import('./option-selection-engine');
    const sel = await selectContracts({
      symbol: p.symbol, direction: p.side === 'long' ? 'bullish' : 'bearish', setup: 'swing', holdingDays: 5, applyDteFit: true,
      entry: p.plan.entry, stop: p.plan.stop, t1: p.plan.t1, ...(p.plan.t2 ? { t2: p.plan.t2 } : {}), conviction: 55, asOfSpot: p.price,
    } as any);
    const pick = pickByDelta(sel.picks as any[], LEADERS_OPTION_CFG);
    return { pick, note: pick ? null : (sel.note ?? `no ${LEADERS_CFG.option.dteMin}–${LEADERS_CFG.option.dteMax} DTE contract near ${LEADERS_CFG.option.delta}Δ passed the gates`) };
  } catch (err) { return { pick: null, note: `contract selection failed: ${(err as Error).message}` }; }
}
async function liveWrite(idea: Record<string, any>): Promise<string | null> {
  const { storage } = await import('./storage');
  const created = await storage.createTradeIdea(idea as any, { dedupWindowHours: 24 });
  const { isDedupedResult } = await import('./lib/instrument-dedup');
  if (isDedupedResult(created)) return null;
  return (created as any)?.id ?? null;
}
const LOG_DIR = path.join(process.cwd(), '.cache', 'leaders');
async function appendLog(row: CandidateLog): Promise<void> {
  try {
    await fsp.mkdir(LOG_DIR, { recursive: true });
    await fsp.appendFile(path.join(LOG_DIR, `candidates-${row.dateKey}.jsonl`), JSON.stringify(row) + '\n', 'utf8');
  } catch (err) { logger.warn(`[LEADERS] candidate log write failed: ${(err as Error).message}`); }
}

// ─── idea ───────────────────────────────────────────────────────────────

export function ideaFromLeader(a: {
  symbol: string; side: Side; q: Qualify; trigger: Trigger; plan: LeaderPlan; sector: SectorPick; rvol: number | null;
  nowMs: number; contract: any | null; contractNote: string | null; price: number;
}): Record<string, any> {
  const { symbol, side, q, trigger, plan, sector, nowMs, contract } = a;
  const evidence = {
    version: LEADERS_VERSION, status: 'measuring', validated: false,
    movePct: q.movePct, threshold: q.threshold, atrPct: q.atrPct, rvol: a.rvol, checks: q.checks,
    sector, trigger, plan, cfg: { minMovePct: LEADERS_CFG.minMovePct, minMoveAtrMult: LEADERS_CFG.minMoveAtrMult, minRvol: LEADERS_CFG.minRvol, orMinutes: LEADERS_CFG.orMinutes },
  };
  const base: Record<string, any> = {
    symbol, direction: side, entryPrice: plan.entry, targetPrice: plan.t1, stopLoss: plan.stop, riskRewardRatio: plan.rr,
    catalyst: `Session ${side === 'long' ? 'leader' : 'laggard'} ${q.movePct >= 0 ? '+' : ''}${q.movePct.toFixed(1)}% on ${a.rvol != null ? `${a.rvol.toFixed(1)}×` : '—'} relative volume — ${TRIGGER_LABEL[trigger.rule]} (${sector.label} ${sector.regime})`,
    analysis: [
      `${symbol} is ${q.movePct >= 0 ? 'up' : 'down'} ${Math.abs(q.movePct).toFixed(2)}% vs the prior close (threshold ${q.threshold.toFixed(2)}%), ${a.rvol != null ? `${a.rvol.toFixed(2)}× time-of-day volume` : 'volume unread'}, holding ${side === 'long' ? 'above' : 'below'} VWAP and the ${LEADERS_CFG.orMinutes}-min opening range; ${sector.label} reads ${String(sector.regime).toUpperCase()} on the sector board${sector.rank != null ? ` (rank #${sector.rank})` : ''}.`,
      `Entry: ${trigger.text}.`,
      `Stop $${plan.stop.toFixed(2)} (${plan.stopBasis}); T1 $${plan.t1.toFixed(2)} (${plan.t1Basis}, ${plan.rr.toFixed(2)}R)${plan.t2 != null ? `; T2 $${plan.t2.toFixed(2)}` : ''}.`,
      contract ? `Contract: ${String(contract.optionType).toUpperCase()} ${contract.strike} ${contract.expiry} (${contract.dte} DTE, Δ ${Number(contract.delta).toFixed(2)}).` : a.price >= LEADERS_CFG.optionMinPrice ? `No contract attached — ${a.contractNote ?? 'none passed'}; logged on the stock.` : `Stock — under $${LEADERS_CFG.optionMinPrice}.`,
      'MEASURING: the leaders engine is unvalidated (source leaders); loss rules v1 apply at the write.',
    ].join(' '),
    source: LEADERS_SOURCE, dataSourceUsed: `${LEADERS_DATA_SOURCE}_${trigger.rule}`,
    sessionContext: 'regular', timestamp: new Date(nowMs).toISOString(), outcomeStatus: 'open', confidenceScore: 55,
    holdingPeriod: 'swing', tradeType: 'swing',
    qualitySignals: [
      `engine:${LEADERS_VERSION}`, `move_pct:${q.movePct}`, a.rvol != null ? `rvol:${a.rvol}` : 'rvol:n/a', `trigger:${trigger.rule}`,
      `sector:${sector.id}`, `regime:${sector.regime}`, 'validated:false', 'measuring',
    ],
    convergenceSignalsJson: { leaders: evidence },
  };
  return contract
    ? { ...base, assetType: 'option', optionType: contract.optionType, strikePrice: contract.strike, expiryDate: contract.expiry, entryPremium: Number(Number(contract.entryPremium).toFixed(2)), optionDte: contract.dte, expiryTier: 'MONTHLY' }
    : { ...base, assetType: 'stock' };
}

/** Of the board groups that contain the symbol, the one that admits `side` (best rank), else the first read. */
export function pickSector(reads: SectorPick[] | undefined, side: Side): SectorPick | null {
  if (!reads?.length) return null;
  const ok: readonly string[] = side === 'long' ? LEADERS_CFG.longRegimes : LEADERS_CFG.shortRegimes;
  const pass = reads.filter((r) => r.regime != null && ok.includes(r.regime)).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  return pass[0] ?? reads.find((r) => r.regime != null) ?? reads[0];
}

// ─── the pass ───────────────────────────────────────────────────────────

let dayKeys: { dateKey: string; keys: Set<string>; published: number } = { dateKey: '', keys: new Set(), published: 0 };

export async function runLeadersScan(deps: LeadersDeps = {}): Promise<LeadersPassResult> {
  const t0 = Date.now();
  const rss0 = process.memoryUsage().rss;
  const nowMs = deps.nowMs ?? Date.now();
  const env = deps.env ?? process.env;
  const rows: CandidateLog[] = [];
  const done = (published: number, candidates: number, universe: number): LeadersPassResult => {
    const res = { published, candidates, universe, ms: Date.now() - t0, rssDeltaMb: Math.round((process.memoryUsage().rss - rss0) / 1048576), rows };
    logger.info(`[LEADERS] pass: universe ${universe}, ${candidates} candidate(s), ${published} published — ${res.ms} ms, rss Δ ${res.rssDeltaMb} MB`);
    return res;
  };
  const { enabled, cap } = readLeadersEnv(env);
  if (!enabled) return done(0, 0, 0);
  const et = etParts(nowMs);
  if (et.weekday < 1 || et.weekday > 5) return done(0, 0, 0);
  if (et.minutes < 570 + LEADERS_CFG.orMinutes + 5 || et.minutes > LEADERS_CFG.lastEntryEt) return done(0, 0, 0);
  if (dayKeys.dateKey !== et.dateKey) dayKeys = { dateKey: et.dateKey, keys: new Set(), published: 0 };
  const log = deps.log ?? appendLog;
  const emit = async (r: Omit<CandidateLog, 'at' | 'dateKey' | 'status_tag'>) => {
    const row: CandidateLog = { at: new Date(nowMs).toISOString(), dateKey: et.dateKey, status_tag: 'measuring', ...r };
    rows.push(row);
    logger.info(`[LEADERS] ${row.symbol} ${row.side ?? ''} ${row.status}${row.reason ? ` — ${row.reason}` : ''}`);
    await log(row);
  };

  const universe = await (deps.universe ?? liveUniverse)();
  if (!universe.length) return done(0, 0, 0);

  // ── A: move vs prior close from today's bars ──
  let daily: Map<string, DailyCtx>; let today: Map<string, Bar5[]>;
  const openMs = etWallToMs(et.y, et.m, et.d, 570);
  try {
    daily = await (deps.daily ?? liveDaily)(universe, nowMs);
    today = await (deps.bars5m ?? liveBars)(universe, openMs);
  } catch (err) {
    logger.warn(`[LEADERS] stage A bars unavailable: ${(err as Error).message}`);
    return done(0, 0, universe.length);
  }
  const movers: Array<{ sym: string; move: number; thr: number; ctx: DailyCtx }> = [];
  const near: Array<{ sym: string; move: number; thr: number }> = [];
  for (const sym of universe) {
    const ctx = daily.get(sym); const bars = today.get(sym);
    if (!ctx || !bars?.length) continue;
    const last = bars.filter((b) => b.t + 5 * 60_000 <= nowMs).pop();
    if (!last) continue;
    const move = (last.c / ctx.prevClose - 1) * 100;
    const atrPct = ctx.atr ? (ctx.atr / ctx.prevClose) * 100 : null;
    const thr = atrPct != null ? Math.min(LEADERS_CFG.minMovePct, LEADERS_CFG.minMoveAtrMult * atrPct) : LEADERS_CFG.minMovePct;
    if (Math.abs(move) + 1e-9 >= thr) movers.push({ sym, move, thr, ctx });
    else if (Math.abs(move) >= 0.75 * thr) near.push({ sym, move, thr });
  }
  today = new Map(); // release
  for (const n of near.sort((a, b) => Math.abs(b.move) / b.thr - Math.abs(a.move) / a.thr).slice(0, 10)) {
    await emit({ symbol: n.sym, side: n.move >= 0 ? 'long' : 'short', status: 'withheld', stage: 'prefilter', reason: `move ${n.move >= 0 ? '+' : ''}${n.move.toFixed(2)}% < ${n.thr.toFixed(2)}% threshold`, movePct: r2(n.move) });
  }
  movers.sort((a, b) => Math.abs(b.move) / b.thr - Math.abs(a.move) / a.thr);
  const deep = movers.slice(0, LEADERS_CFG.maxDeepReads);
  for (const m of movers.slice(LEADERS_CFG.maxDeepReads)) {
    await emit({ symbol: m.sym, side: m.move >= 0 ? 'long' : 'short', status: 'withheld', stage: 'prefilter', reason: `beyond the ${LEADERS_CFG.maxDeepReads} deep reads this pass (ranked by move ÷ threshold)`, movePct: r2(m.move) });
  }
  if (!deep.length) return done(0, 0, universe.length);

  // ── B: deep read ──
  let hist: Map<string, Bar5[]>;
  try { hist = await (deps.bars5m ?? liveBars)(deep.map((d) => d.sym), nowMs - 16 * 86_400_000); }
  catch (err) { logger.warn(`[LEADERS] stage B bars unavailable: ${(err as Error).message}`); return done(0, deep.length, universe.length); }
  const sectors = await (deps.sectors ?? liveSectors)();
  const minRR = readMinRrPublish(env);
  const { nexusStopAtrK } = await import('./lib/atr-stop-floor');
  const floorK = nexusStopAtrK(env);

  // Caps: DB rows today + this process's own day.
  const pubRows = await (deps.publishedToday ?? livePublishedToday)(et.dateKey);
  const caps = { publishedToday: Math.max(pubRows.length, dayKeys.published), keys: new Set<string>([...dayKeys.keys, ...pubRows.map((r) => `${String(r.symbol).toUpperCase()}|${/short|bear/i.test(String(r.direction)) ? 'short' : 'long'}`)]) };
  let open: any[] | null = null;
  let published = 0;

  for (const m of deep) {
    const sym = m.sym;
    const read = readSession(hist.get(sym) ?? [], nowMs);
    if (!read) { await emit({ symbol: sym, side: null, status: 'withheld', stage: 'qualify', reason: 'no session read (opening range not complete or no bars)', movePct: r2(m.move) }); continue; }
    const side: Side = m.move >= 0 ? 'long' : 'short';
    const sector = pickSector(sectors.get(sym), side);
    const q = qualify({ symbol: sym, prevClose: m.ctx.prevClose, atr: m.ctx.atr, read, regime: sector?.regime ?? null, sectorLabel: sector?.label ?? null });
    const baseRow = { symbol: sym, side: q.side, movePct: q.movePct, rvol: read.rvol, sector, checks: q.checks };
    if (!q.ok) { await emit({ ...baseRow, status: 'withheld', stage: 'qualify', reason: q.reason }); continue; }
    if (!m.ctx.atr) { await emit({ ...baseRow, status: 'withheld', stage: 'plan', reason: 'no daily ATR — the stop cannot be floored' }); continue; }
    const { trigger, watching } = findTrigger(q.side, read, m.ctx.atr);
    if (!trigger) { await emit({ ...baseRow, status: 'withheld', stage: 'trigger', reason: watching }); continue; }
    const capR = capCheck(sym, q.side, caps, cap);
    if (!capR.ok) { await emit({ ...baseRow, trigger, status: 'withheld', stage: 'gate', reason: capR.reason }); continue; }

    const map = await (deps.levelMap ?? liveMap)(sym).catch(() => null);
    const maxTarget = await (deps.cap ?? liveCap)({ symbol: sym, direction: q.side, entry: trigger.entry, stop: trigger.entry - (q.side === 'long' ? 1 : -1) * floorK * m.ctx.atr, targets: [trigger.entry * (q.side === 'long' ? 1.5 : 0.5)], horizon: 'swing' }).catch(() => null);
    const asOfEt = map?.asOf ? new Date(map.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : undefined;
    const { plan, reason } = planLeader({ side: q.side, trigger, atr: m.ctx.atr, clusters: map?.clusters ?? [], tolerance: map?.tolerance ?? Math.max(0.01, trigger.entry * 0.001), maxTarget, minRR, floorK, levelsAsOf: asOfEt });
    if (!plan) { await emit({ ...baseRow, trigger, status: 'withheld', stage: 'plan', reason }); continue; }

    // Gates: earnings, short discipline, already held, option publish gate.
    const earn = earningsWithin(await (deps.earnings ?? liveEarnings)(sym), nowMs);
    if (earn) { await emit({ ...baseRow, trigger, plan, status: 'withheld', stage: 'gate', reason: earn }); continue; }
    if (q.side === 'short') {
      const { evaluateShortDiscipline } = await import('./short-discipline');
      const sd = evaluateShortDiscipline({ symbol: sym, direction: 'short', hasEventCatalyst: false, btcChangePercent: null });
      if (!sd.allowed) { await emit({ ...baseRow, trigger, plan, status: 'withheld', stage: 'gate', reason: `short discipline: ${sd.reason}` }); continue; }
    }
    open = open ?? await (deps.openIdeas ?? liveOpen)();
    const held = open.find((i: any) => String(i.symbol).toUpperCase() === sym && (/short|bear/i.test(String(i.direction)) ? 'short' : 'long') === q.side);
    if (held) { await emit({ ...baseRow, trigger, plan, status: 'withheld', stage: 'gate', reason: `already held — open ${q.side} idea ${held.id} (${held.source ?? 'unknown source'})` }); continue; }

    let contract: any = null; let contractNote: string | null = null;
    if (read.last >= LEADERS_CFG.optionMinPrice) {
      const { publishGateFor } = await import('./lib/publish-gates');
      const gate = publishGateFor({ source: LEADERS_SOURCE, assetType: 'option', expiryDate: null }, nowMs, env);
      if (gate) contractNote = `publish gate: ${gate}`;
      else { const r = await (deps.contract ?? liveContract)({ symbol: sym, side: q.side, plan, price: read.last }); contract = r.pick; contractNote = r.note; }
    }
    try {
      const idea = ideaFromLeader({ symbol: sym, side: q.side, q, trigger, plan, sector: sector!, rvol: read.rvol, nowMs, contract, contractNote, price: read.last });
      const id = await (deps.write ?? liveWrite)(idea);
      if (!id) { await emit({ ...baseRow, trigger, plan, status: 'withheld', stage: 'write', reason: 'write deduped / returned no id', vehicle: contract ? 'option' : 'stock' }); continue; }
      published++; dayKeys.published++; caps.publishedToday++;
      const k = `${sym}|${q.side}`; caps.keys.add(k); dayKeys.keys.add(k);
      await emit({ ...baseRow, trigger, plan, status: 'published', stage: 'write', reason: contract ? null : contractNote, vehicle: contract ? 'option' : 'stock', ideaId: id });
    } catch (err) {
      await emit({ ...baseRow, trigger, plan, status: 'withheld', stage: 'write', reason: `write gate: ${(err as Error).message}` });
    }
  }
  hist = new Map();
  return done(published, deep.length, universe.length);
}

/** Test seam: reset the in-process day state. */
export function __resetLeadersDay(): void { dayKeys = { dateKey: '', keys: new Set(), published: 0 }; }
