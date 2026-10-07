/**
 * 0DTE FLOW IGNITION — live engine + forward log. Source `zero_dte_flow`. MEASURING.
 * =================================================================================
 * Rules + the flow proxy are in server/zero-dte-flow-core.ts (pure). This file:
 *
 *   CYCLE every 2 min 09:34–15:30 ET (worker role; schedule in
 *   server/idea-producer-schedule.ts, own in-flight guard).
 *     • 09:35–11:30 — for every universe name (SPY QQQ IWM, ten mega caps, NEXUS
 *       tracked names): one small 0–2 DTE / ±2% Alpaca chain each, ALL read inside ONE
 *       heavy-gate job ('zero-dte-flow:chains', 'high', the INDEX lane by default,
 *       110 s wait — ZERO_DTE_FLOW_LANE=main moves it back). 2026-10-06: 60 per-name
 *       jobs in the main lane were "dropped after waiting 85s" 09:30–11:30 and only
 *       8–10 of 13 chains were read per cycle. A dropped batch is stated on the cycle.
 *       + the 0DTE sniper's shared 1-min bar store.
 *       Flow leg + structure leg + wall leg → a FIRED trigger, a WATCH row (flow
 *       passed, another leg did not), or nothing. SPY additionally runs the
 *       dominant-strike UNWIND detector.
 *     • after 11:30 — chains only for names with a fired row, to mark them
 *       (fired → reached at +50% mid / faded at −40%, the underlying stop, or 15:30).
 *   PUBLISH only with ZERO_DTE_FLOW=true: top ≤ 6/day by score, ≤ 1 per symbol per
 *   side, two-sided quote ≤ 20 min old and spread ≤ 15% (older than 2 min or from a
 *   delayed feed = labelled "delayed quote · Nm"; else refused, stated), through
 *   storage.createTradeIdea (publish gates + loss rules apply there) with
 *   lib/option-publish-plan for the holding period. Without the flag every
 *   trigger is watch-only and logged the same way.
 *   FORWARD LOG .cache/zero-dte-flow/events-YYYY-MM.jsonl: `near` (flow passed,
 *   once per name/side/strike/day), `fired`, `unwind`, `state` changes, and one
 *   `outcome` per fired/unwind trigger after the close (16:25 / 16:55 ET):
 *   reached +50% / +100% before the stop or the 15:30 time stop, on the
 *   contract's real 1-minute bars (Alpaca) and the underlying's 1-min closes.
 *
 * SPX: the unwind detector runs on SPY (the contract vehicle). No SPX mirror
 * helper exists on this branch, so no SPX levels are claimed.
 *
 * GET /api/zero-dte/flow (state; ROLE=web reads the worker's shared file),
 * GET /api/zero-dte/flow/report (forward-log summary).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { readShared, sharedStamp, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etDateKey, etMinutes } from './zero-dte-desk-core';
import { hhmm, type MinuteBar } from './zero-dte-sniper-core';
import {
  FLOW_CFG, FLOW_LOSS_RULES, atmContract, bestFlow, buildFlowUniverse, calendarDays, detectUnwind, dominantStrikes, evaluateFlowOutcome,
  flowLegReason, ingestChainRead, liveState, midOf, newFlowMemory, planFor, quoteCheck, scoreTrigger, structureFor, summarizeFlowOutcomes, wallBlock,
  type ChainRow, type FlowLeg, type FlowMemory, type FlowPlan, type FlowState, type OptMin, type Side, type Structure, type Walls,
} from './zero-dte-flow-core';

export const FLOW_SOURCE = 'zero_dte_flow';
export const FLOW_SHARED = 'zero-dte-flow';

export function zeroDteFlowEnabled(): boolean {
  return process.env.ZERO_DTE_FLOW === 'true';
}

// ─── types ────────────────────────────────────────────────────────────────

export interface FlowContract {
  occ: string; strike: number; type: 'call' | 'put'; expiry: string; dte: number;
  bid: number | null; ask: number | null; mid: number | null; delta: number | null;
  quoteAt: string | null; quoteAgeS: number | null; spreadPct: number | null; source: string;
  /** "delayed quote · Nm" when the quote is > 2 min old or from a delayed feed (Alpaca indicative, CBOE). */
  quoteLabel?: string | null;
}
export interface FlowRow {
  id: string; kind: 'ignition' | 'unwind'; dateKey: string; symbol: string; side: Side; state: FlowState;
  at: string; atEt: string; updatedAt: string;
  spot: number | null; score: number | null;
  flow: FlowLeg | null; structure: Pick<Structure, 'ok' | 'reason' | 'last' | 'vwap' | 'orHigh' | 'orLow' | 'orMid' | 'heldBars'> | null;
  wall: string | null; unwind: string | null;
  contract: FlowContract | null; plan: FlowPlan | null;
  published: boolean; ideaId: string | null; reason: string | null;
  stateWhy: string | null; lastMid: number | null; lastMarkAt: string | null;
  text: string; measuring: true;
}
export interface FlowCycle {
  at: string; dateKey: string; enabled: boolean; skipped: string | null; inWindow: boolean;
  symbols: number; chains: { read: number; dropped: string[]; failed: string[] }; barsRequests: number; feed: string | null;
  fired: number; watch: number; published: number; cycleMs: number; memory: { rssBeforeMb: number; rssAfterMb: number }; errors: string[]; label: 'measuring';
}

// ─── forward log ─────────────────────────────────────────────────────────

const LOG_DIR = () => process.env.ZERO_DTE_FLOW_LOG_DIR || path.join(process.cwd(), '.cache', 'zero-dte-flow');
export async function appendFlowLog(lines: object[]): Promise<void> {
  if (!lines.length) return;
  try {
    const dir = LOG_DIR();
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `events-${new Date().toISOString().slice(0, 7)}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  } catch (err) {
    logger.warn(`[0DTE-FLOW] log write failed: ${(err as Error).message}`);
  }
}
export async function readFlowLog(months = 6): Promise<any[]> {
  try {
    const dir = LOG_DIR();
    const files = (await fs.readdir(dir)).filter((f) => /^events-\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-months);
    const out: any[] = [];
    for (const f of files) for (const line of (await fs.readFile(path.join(dir, f), 'utf8')).split('\n')) {
      if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* torn line */ } }
    }
    return out;
  } catch { return []; }
}

// ─── state ───────────────────────────────────────────────────────────────

const mb = (n: number) => Math.round(n / 1024 / 1024);
const etSec = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
function etWallMs(dateKey: string, minOfDay: number): number {
  const guess = Date.parse(`${dateKey}T${hhmm(minOfDay)}:00Z`);
  for (const off of [4, 5]) { const t = guess + off * 3600_000; if (etMinutes(t) === minOfDay && etDateKey(t) === dateKey) return t; }
  return guess + 4 * 3600_000;
}

let day = { dateKey: '', seeded: false, mem: new Map<string, FlowMemory>(), rows: new Map<string, FlowRow>(), logged: new Set<string>(), published: 0 };
let lastCycle: FlowCycle | null = null;
let inflight: Promise<FlowCycle> | null = null;

function resetDay(dateKey: string) {
  if (day.dateKey === dateKey) return;
  day = { dateKey, seeded: false, mem: new Map(), rows: new Map(), logged: new Set(), published: 0 };
}
const memFor = (sym: string) => { let m = day.mem.get(sym); if (!m) { m = newFlowMemory(); day.mem.set(sym, m); } return m; };

async function seedFromLog(dateKey: string): Promise<void> {
  if (day.seeded) return;
  day.seeded = true;
  for (const l of await readFlowLog(1)) {
    if (l.dateKey !== dateKey) continue;
    if (l.key) day.logged.add(l.key);
    if ((l.type === 'fired' || l.type === 'unwind') && l.row) {
      day.rows.set(l.row.id, l.row as FlowRow);
      if (l.row.published) day.published++;
    }
    if (l.type === 'state' && l.id && day.rows.has(l.id)) Object.assign(day.rows.get(l.id)!, { state: l.state, stateWhy: l.why });
  }
}

// ─── inputs ──────────────────────────────────────────────────────────────

export interface FlowChain { spot: number | null; rows: ChainRow[]; fetchedAt: number; source: string }
export type ChainFn = (sym: string) => Promise<FlowChain | null>;
export type GateFn = <T>(name: string, fn: () => Promise<T>) => Promise<T | undefined>;
type Peek = (s: string) => { dateKey: string; bars: readonly MinuteBar[] } | null;

const defaultChain: ChainFn = async (sym) => {
  const ap = await import('./alpaca-options');
  if (!ap.isAlpacaOptionsConfigured()) return null;
  const ch = await ap.getAlpacaOptionsChain(sym, { maxDays: FLOW_CFG.MAX_DTE, band: FLOW_CFG.CHAIN_BAND });
  if (!ch) return null;
  return {
    spot: ch.spot, fetchedAt: ch.fetchedAt, source: 'Alpaca indicative',
    rows: ch.contracts.map((c) => ({ occ: c.occ, strike: c.strike, type: c.type, expiration: c.expiration, volume: c.volume, bid: c.bid, ask: c.ask, last: c.last, quoteTime: c.quoteTime, openInterest: c.openInterest, delta: c.delta })),
  };
};
/** Heavy-gate lane for the batched chain read: 'index' (default) or 'main' (ZERO_DTE_FLOW_LANE=main). */
export function flowGateLane(env: Record<string, string | undefined> = process.env): 'index' | 'main' {
  return env.ZERO_DTE_FLOW_LANE === 'main' ? 'main' : 'index';
}
export const FLOW_GATE_MAX_WAIT_MS = 110_000; // inside the 2-minute cadence
const defaultGate: GateFn = async (name, fn) => (await import('./lib/heavy-job-gate')).runHeavy(name, fn, { priority: 'high', lane: flowGateLane(), maxWaitMs: FLOW_GATE_MAX_WAIT_MS });
/** Feeds whose quotes are delayed by construction. */
export const isDelayedFeed = (source: string): boolean => /indicative|cboe|delayed|yahoo/i.test(source);

async function trackedSymbols(): Promise<string[]> {
  try { return (await import('./nexus-tracked')).getTrackedSymbols(); } catch { return []; }
}

function readWalls(sym: string, dateKey: string): Walls | null {
  try {
    const r = readShared<any>('wall-touch-map');
    const e = r?.data?.dateKey === dateKey ? r.data.entries?.[sym] : null;
    if (!e || !e.ok) return null;
    return { callWall: e.callWall ?? null, putWall: e.putWall ?? null, source: `wall-touch map ${e.basis ?? ''} ${String(e.computedAt ?? '').slice(11, 16)}Z`.trim() };
  } catch { return null; }
}

/** Bullflow print-stream sweeps on a contract in the window (in-memory ring; 0 when the stream is not in this process). */
async function sweepCounter(nowMs: number): Promise<(occ: string) => number> {
  try {
    const { getBullflowPrints } = await import('./bullflow-service');
    const counts = new Map<string, number>();
    for (const p of getBullflowPrints().prints) {
      if (nowMs - Date.parse(p.at) > FLOW_CFG.WINDOW_MS) continue;
      const k = p.occ.replace(/^O:/, '');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return (occ) => counts.get(occ) ?? 0;
  } catch { return () => 0; }
}

// ─── text ────────────────────────────────────────────────────────────────

const k$ = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1000)}K`);
const cLabel = (c: { strike: number; type: 'call' | 'put'; dte: number }) => `${c.strike}${c.type === 'call' ? 'C' : 'P'} ${c.dte === 0 ? '0DTE' : `${c.dte}DTE`}`;
function rowText(r: FlowRow): string {
  const head = `${r.symbol} ${r.side === 'long' ? 'CALLS' : 'PUTS'}`;
  const c = r.contract ? ` · ${cLabel(r.contract)} @ ${r.plan ? `$${r.plan.entryPremium.toFixed(2)} mid${r.contract.quoteLabel ? ` (${r.contract.quoteLabel})` : ''}` : '—'}` : '';
  if (r.kind === 'unwind') return `${head} — unwind fade: ${r.unwind ?? ''}${c} · measuring`;
  const f = r.flow ? `${k$(r.flow.aggressive)} at-ask on ${r.flow.strike}${r.flow.type === 'call' ? 'C' : 'P'} in 10 min (${r.flow.relSize}× floor, vol ${r.flow.dayVolume} > OI ${r.flow.openInterest ?? '—'})` : 'flow —';
  return `${head} — flow ignition ${r.atEt} ET: ${f}${r.structure?.ok ? `, ${r.side === 'long' ? 'above VWAP + OR-high' : 'below VWAP + OR-low'} held ${r.structure.heldBars} bars` : ''}${c} · measuring`;
}

// ─── publish ─────────────────────────────────────────────────────────────

async function publishFlowIdea(r: FlowRow, nowMs: number): Promise<string | null> {
  const { storage } = await import('./storage');
  const { optionPublishPlan } = await import('./lib/option-publish-plan');
  const c = r.contract!; const p = r.plan!; const spot = r.spot!;
  const long = r.side === 'long';
  const target = p.t1Underlying ?? +(long ? spot * 1.003 : spot * 0.997).toFixed(2);
  const pp = await optionPublishPlan({ symbol: r.symbol, direction: r.side, entry: spot, stop: p.stopUnderlying, target, expiryDate: c.expiry, fallbackHolding: 'day', nowMs });
  const created = await storage.createTradeIdea({
    symbol: r.symbol, assetType: 'option', direction: r.side,
    entryPrice: spot, targetPrice: target, stopLoss: pp.stopLoss, riskRewardRatio: pp.riskRewardRatio,
    optionType: c.type, strikePrice: c.strike, expiryDate: c.expiry, entryPremium: p.entryPremium,
    catalyst: `${r.symbol} ${cLabel(c)} — ${r.kind === 'unwind' ? 'dominant-strike unwind fade' : 'opening-flow ignition'} @ ${r.atEt} ET · mid $${p.entryPremium.toFixed(2)}${c.quoteLabel ? ` · ${c.quoteLabel}` : ''} (measuring)`,
    analysis: [
      r.kind === 'unwind' ? `Trigger: ${r.unwind}.` : `Trigger: ${r.flow ? `${k$(r.flow.aggressive)} aggressive (last print at/near the ask) premium on ${r.flow.occ} in the last 10 min — ${r.flow.relSize}× the ${k$(r.flow.floor)} floor, ${Math.round(r.flow.share * 100)}% of the side's in-band at-ask flow; day volume ${r.flow.dayVolume} > OI ${r.flow.openInterest} (opening). Flow side is a proxy: the contract's last print vs its quote at each 2-min read.` : ''}`,
      r.structure ? `Structure: last ${r.structure.last?.toFixed(2)} vs VWAP ${r.structure.vwap?.toFixed(2)}, opening range ${r.structure.orLow?.toFixed(2)}–${r.structure.orHigh?.toFixed(2)}, broken and held ${r.structure.heldBars} bars.` : '',
      r.wall ? `Walls: ${r.wall}.` : '',
      `Contract: ${c.occ}, bid ${c.bid ?? '—'} / ask ${c.ask ?? '—'}, mid $${p.entryPremium.toFixed(2)} (${c.source}${c.quoteLabel ? ` · ${c.quoteLabel} — NOT a live quote` : ''}, quote ${c.quoteAgeS ?? '—'}s old, spread ${c.spreadPct != null ? (c.spreadPct * 100).toFixed(1) : '—'}%).`,
      `Plan (premium): T1 $${p.t1Premium} (+50%)${p.t1Underlying != null ? ` ≈ underlying ${p.t1Underlying}` : ''}, T2 $${p.t2Premium} (+100%)${p.t2Underlying != null ? ` ≈ ${p.t2Underlying}` : ''}${p.wallAhead != null ? `; nearest wall ahead ${p.wallAhead}` : ''} — ${p.mapping}. Stop: underlying back through ${p.stopBasis} ${p.stopUnderlying} or premium $${p.stopPremium} (−40%). Time stop ${p.timeStopEt} ET.`,
      pp.note,
      `Loss rules: ${FLOW_LOSS_RULES.join(' ')}`,
      'MEASURING — no edge is claimed; every trigger is forward-logged with its outcome.',
    ].filter(Boolean).join(' '),
    source: FLOW_SOURCE, dataSourceUsed: `zero_dte_flow_${r.kind}_${r.side}`,
    sessionContext: 'intraday', timestamp: new Date(nowMs).toISOString(),
    entryValidUntil: new Date(nowMs + 5 * 60_000).toISOString(),
    exitBy: new Date(etWallMs(r.dateKey, FLOW_CFG.TIME_STOP_MIN)).toISOString(),
    expiryTier: c.dte === 0 ? '0DTE' : 'DAILY', optionDte: c.dte, tradeType: 'scalp', holdingPeriod: pp.holdingPeriod, outcomeStatus: 'open', confidenceScore: 50,
    qualitySignals: [
      `kind:${r.kind}`, `side:${r.side}`, c.quoteLabel ? `quote:delayed_${Math.round((c.quoteAgeS ?? 0) / 60)}m` : 'quote:live', `trigger_at:${r.at}`, `score:${r.score ?? '—'}`, 'validated:false', 'measuring', 'desk:zero_dte_flow',
      r.flow ? `flow_aggr:${r.flow.aggressive}` : '', r.flow ? `flow_rel:${r.flow.relSize}` : '', r.flow?.sweeps ? `bullflow_sweeps:${r.flow.sweeps}` : '',
    ].filter(Boolean),
    convergenceSignalsJson: { zeroDteFlow: { ...r, lossRules: FLOW_LOSS_RULES } },
  } as any, { dedupWindowHours: 1 });
  return (created as any)?.id ?? null;
}

// ─── the cycle ───────────────────────────────────────────────────────────

export async function runZeroDteFlow(nowMs = Date.now(), opts: { force?: boolean; chainFn?: ChainFn; gate?: GateFn; peek?: Peek; publish?: boolean; log?: boolean; universe?: string[]; walls?: (sym: string) => Walls | null; publishFn?: (r: FlowRow, nowMs: number) => Promise<string | null> } = {}): Promise<FlowCycle> {
  if (inflight) return inflight;
  inflight = cycle(nowMs, opts).finally(() => { inflight = null; });
  return inflight;
}

function contractOf(c: ChainRow, todayKey: string, nowMs: number, source: string): FlowContract {
  const q = quoteCheck(c, nowMs, { delayedFeed: isDelayedFeed(source) });
  return { occ: c.occ, strike: c.strike, type: c.type, expiry: c.expiration, dte: calendarDays(todayKey, c.expiration), bid: c.bid, ask: c.ask, mid: q.mid ?? midOf(c.bid, c.ask), delta: c.delta, quoteAt: c.quoteTime, quoteAgeS: q.ageMs != null ? Math.round(q.ageMs / 1000) : null, spreadPct: q.spreadPct, source, quoteLabel: q.label };
}

async function cycle(nowMs: number, opts: Parameters<typeof runZeroDteFlow>[1] = {}): Promise<FlowCycle> {
  const t0 = Date.now(); const rss0 = process.memoryUsage().rss;
  const dateKey = etDateKey(nowMs);
  resetDay(dateKey);
  const min = etMinutes(nowMs);
  const inWindow = min >= FLOW_CFG.START_MIN && min <= FLOW_CFG.END_MIN;
  const doLog = opts.log !== false;
  const base: FlowCycle = {
    at: new Date(nowMs).toISOString(), dateKey, enabled: zeroDteFlowEnabled(), skipped: null, inWindow: !!opts.force || inWindow,
    symbols: 0, chains: { read: 0, dropped: [], failed: [] }, barsRequests: 0, feed: null, fired: 0, watch: 0, published: 0,
    cycleMs: 0, memory: { rssBeforeMb: mb(rss0), rssAfterMb: 0 }, errors: [], label: 'measuring',
  };
  const finish = (c: FlowCycle): FlowCycle => {
    c.cycleMs = Date.now() - t0; c.memory.rssAfterMb = mb(process.memoryUsage().rss);
    const rows = [...day.rows.values()];
    c.fired = rows.filter((r) => r.state !== 'watch').length; c.watch = rows.filter((r) => r.state === 'watch').length;
    lastCycle = c;
    if (doLog && writesSharedState()) writeSharedSync(FLOW_SHARED, { cycle: c, rows, dateKey });
    return c;
  };
  const wd = new Date(nowMs).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  if (!opts.force && (wd === 'Sat' || wd === 'Sun' || min < FLOW_CFG.START_MIN - 1 || min > FLOW_CFG.TIME_STOP_MIN)) return finish({ ...base, skipped: `outside 09:34–15:30 ET weekdays (${wd} ${hhmm(min)})` });
  const triggering = !!opts.force || inWindow;
  if (doLog) await seedFromLog(dateKey);

  const universe = opts.universe ?? buildFlowUniverse(await trackedSymbols());
  const markSyms = Array.from(new Set([...day.rows.values()].filter((r) => r.state === 'fired').map((r) => r.symbol)));
  const syms = triggering ? Array.from(new Set([...universe, ...markSyms])) : markSyms;
  base.symbols = syms.length;
  if (!syms.length) return finish({ ...base, skipped: triggering ? 'empty universe' : 'after 11:30 — nothing fired to mark' });

  let peek = opts.peek;
  if (!peek) {
    if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) return finish({ ...base, skipped: 'Alpaca keys not configured' });
    const sn = await import('./zero-dte-sniper');
    try { const r = await sn.refreshStage1Bars(syms, nowMs); base.barsRequests = r.requests; base.feed = r.feed; }
    catch (e) { base.errors.push(`bars: ${(e as Error).message}`); return finish(base); }
    peek = sn.peekStage1Bars;
  }
  const chainFn = opts.chainFn ?? defaultChain;
  const gate = opts.gate ?? defaultGate;
  const wallsOf = opts.walls ?? ((s: string) => readWalls(s, dateKey));
  const sweeps = await sweepCounter(nowMs);
  const allowPublish = opts.publish ?? zeroDteFlowEnabled();
  const pendingLog: object[] = [];
  const fresh: FlowRow[] = [];

  // Every chain in ONE gated job, so a busy lane costs one wait per cycle, not one per name.
  type Read = { chain: FlowChain | null } | { error: string };
  let reads: Map<string, Read> | undefined;
  try {
    reads = await gate('zero-dte-flow:chains', async () => {
      const out = new Map<string, Read>();
      for (const sym of syms) {
        try { out.set(sym, { chain: await chainFn(sym) }); } catch (e) { out.set(sym, { error: (e as Error).message }); }
      }
      return out;
    });
  } catch (e) { base.errors.push(`chains: ${(e as Error).message}`); }
  if (reads === undefined) logger.warn(`[0DTE-FLOW] chain batch dropped by the heavy gate (${syms.length} names unread this cycle)`);

  for (const sym of syms) {
    const read = reads?.get(sym);
    if (read === undefined) { base.chains.dropped.push(sym); continue; }
    if ('error' in read) { base.chains.failed.push(`${sym}: ${read.error}`); continue; }
    const chain = read.chain;
    if (!chain || !chain.rows.length) { base.chains.failed.push(`${sym}: no chain`); continue; }
    base.chains.read++;
    const held = peek(sym);
    const bars = held && held.dateKey === dateKey ? held.bars.filter((b) => b.t + 60_000 <= nowMs) : [];
    const spot = chain.spot ?? bars[bars.length - 1]?.c ?? null;
    if (spot == null) { base.chains.failed.push(`${sym}: no spot`); continue; }
    const mem = memFor(sym);
    ingestChainRead(mem, chain.rows, nowMs, min - 570);

    // Marks for this symbol's fired rows.
    for (const r of day.rows.values()) {
      if (r.symbol !== sym || r.state !== 'fired' || !r.contract || !r.plan) continue;
      const c = chain.rows.find((x) => x.occ === r.contract!.occ);
      const mid = c ? midOf(c.bid, c.ask) : null;
      const ls = liveState(r.state, { entry: r.plan.entryPremium, mid, spot, side: r.side, stopUnderlying: r.plan.stopUnderlying, etMin: min });
      r.lastMid = mid != null ? +mid.toFixed(2) : r.lastMid; r.lastMarkAt = new Date(nowMs).toISOString(); r.updatedAt = r.lastMarkAt;
      if (ls.state !== r.state) {
        r.state = ls.state; r.stateWhy = ls.why;
        pendingLog.push({ type: 'state', dateKey, id: r.id, state: ls.state, why: ls.why, mid, spot, at: r.lastMarkAt });
      }
    }
    if (!triggering) continue;

    const walls = wallsOf(sym);
    for (const side of ['long', 'short'] as Side[]) {
      const key = `${sym}|${side}|ignition`;
      const id = `${dateKey}|${key}`;
      const existing = day.rows.get(id);
      if (existing && existing.state !== 'watch') continue; // one fired per symbol per side per day
      const flow = bestFlow(mem, chain.rows, sym, spot, side, dateKey, nowMs, sweeps);
      const flowWhy = flowLegReason(flow);
      if (flowWhy) { if (existing) day.rows.delete(id); continue; } // flow leg gone → the watch row goes too
      const st = structureFor(bars, side);
      const wb = wallBlock(side, spot, walls);
      const fc = chain.rows.find((c) => c.occ === flow!.occ)!;
      const row: FlowRow = {
        id, kind: 'ignition', dateKey, symbol: sym, side, state: 'watch',
        at: existing?.at ?? new Date(nowMs).toISOString(), atEt: existing?.atEt ?? etSec(nowMs), updatedAt: new Date(nowMs).toISOString(),
        spot: +spot.toFixed(2), score: scoreTrigger(flow!, st, side), flow, wall: wb.note, unwind: null,
        structure: { ok: st.ok, reason: st.reason, last: st.last, vwap: st.vwap != null ? +st.vwap.toFixed(2) : null, orHigh: st.orHigh, orLow: st.orLow, orMid: st.orMid != null ? +st.orMid.toFixed(2) : null, heldBars: st.heldBars },
        contract: contractOf(fc, dateKey, nowMs, chain.source), plan: null,
        published: false, ideaId: null, reason: !st.ok ? st.reason : wb.blocked ? wb.note : null,
        stateWhy: null, lastMid: null, lastMarkAt: null, text: '', measuring: true,
      };
      if (st.ok && !wb.blocked) {
        // FIRED — stamped now (the first cycle all three legs agree).
        row.state = 'fired'; row.at = new Date(nowMs).toISOString(); row.atEt = etSec(nowMs);
        const q = quoteCheck(fc, nowMs, { delayedFeed: isDelayedFeed(chain.source) });
        if (q.ok && q.mid) row.plan = planFor(side, spot, q.mid, fc.delta, st, walls);
        else row.reason = `quote refused: ${q.reason}`;
        fresh.push(row);
      } else {
        const nk = `${dateKey}|near|${sym}|${side}|${flow!.occ}`;
        if (!day.logged.has(nk)) { day.logged.add(nk); pendingLog.push({ type: 'near', key: nk, dateKey, at: row.updatedAt, symbol: sym, side, flow, structure: row.structure, wall: wb.note, reason: row.reason }); }
      }
      row.text = rowText(row);
      day.rows.set(id, row);
    }

    // Unwind fade (SPY dominant 0DTE strike).
    if (FLOW_CFG.UNWIND_SYMBOLS.includes(sym)) {
      const dom = dominantStrikes(chain.rows, spot, dateKey);
      for (const c of [dom.call, dom.put]) {
        if (!c) continue;
        const sig = detectUnwind(mem.net.get(c.occ) ?? [], c, bars, nowMs);
        if (!sig) continue;
        const id = `${dateKey}|${sym}|unwind|${sig.strike}${sig.strikeType === 'call' ? 'C' : 'P'}`;
        if (day.rows.has(id)) continue;
        const atm = atmContract(chain.rows, spot, sig.side === 'long' ? 'call' : 'put', dateKey);
        const row: FlowRow = {
          id, kind: 'unwind', dateKey, symbol: sym, side: sig.side, state: 'fired', at: new Date(nowMs).toISOString(), atEt: etSec(nowMs), updatedAt: new Date(nowMs).toISOString(),
          spot: +spot.toFixed(2), score: null, flow: null, structure: null, wall: wallBlock(sig.side, spot, walls).note, unwind: sig.text,
          contract: atm ? contractOf(atm, dateKey, nowMs, chain.source) : null, plan: null, published: false, ideaId: null, reason: atm ? null : 'no ATM contract in the chain',
          stateWhy: null, lastMid: null, lastMarkAt: null, text: '', measuring: true,
        };
        if (atm) {
          const q = quoteCheck(atm, nowMs, { delayedFeed: isDelayedFeed(chain.source) });
          const st = structureFor(bars, sig.side);
          // Stop for a fade = back through the strike it was rejected from.
          if (q.ok && q.mid) row.plan = { ...planFor(sig.side, spot, q.mid, atm.delta, st, walls), stopUnderlying: sig.strike, stopBasis: `the unwound ${sig.strike} strike` };
          else row.reason = `quote refused: ${q.reason}`;
        }
        row.text = rowText(row);
        day.rows.set(id, row);
        fresh.push(row);
      }
    }
  }

  // Publish the best fresh triggers within the caps; log every one.
  fresh.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const publishedSide = new Set([...day.rows.values()].filter((r) => r.published).map((r) => `${r.symbol}|${r.side}`));
  for (const r of fresh) {
    if (r.plan && r.contract) {
      if (!allowPublish) r.reason = 'watch-only — ZERO_DTE_FLOW is off';
      else if (day.published >= FLOW_CFG.MAX_PUBLISH_PER_DAY) r.reason = `daily cap ${FLOW_CFG.MAX_PUBLISH_PER_DAY} reached`;
      else if (publishedSide.has(`${r.symbol}|${r.side}`)) r.reason = 'already published this symbol + side today';
      else {
        try {
          const id = await (opts.publishFn ?? publishFlowIdea)(r, nowMs);
          r.published = true; r.ideaId = id; day.published++; base.published++; publishedSide.add(`${r.symbol}|${r.side}`);
          logger.info(`[0DTE-FLOW] ✅ ${r.symbol} ${r.kind} ${r.side} → ${r.contract.occ} @ $${r.plan.entryPremium} mid (measuring)`);
        } catch (e) { r.reason = `write gate: ${(e as Error).message}`; }
      }
    }
    r.text = rowText(r);
    if (!r.published) logger.info(`[0DTE-FLOW] not published: ${r.symbol} ${r.kind} ${r.side}${r.contract ? ` ${r.contract.occ}` : ''} — ${r.reason ?? (r.plan ? 'unknown' : 'no plan')}`);
    pendingLog.push({ type: r.kind === 'unwind' ? 'unwind' : 'fired', key: r.id, dateKey, at: r.at, row: r });
    try { const { pulse } = await import('./system-pulse'); pulse('alert', r.text); } catch { /* decoration */ }
  }
  if (doLog) await appendFlowLog(pendingLog);
  if (fresh.length) logger.info(`[0DTE-FLOW] ${hhmm(min)} ET: ${fresh.length} trigger(s), ${base.published} published, chains ${base.chains.read}/${syms.length} (measuring)`);
  return finish(base);
}

// ─── outcomes (after the close) ──────────────────────────────────────────

export type OptLoader = (occ: string, fromMs: number, toMs: number) => Promise<OptMin[]>;
export type StockLoader = (dateKey: string, symbols: string[]) => Promise<Map<string, MinuteBar[]>>;

export async function runZeroDteFlowOutcomes(nowMs = Date.now(), opts: { lines?: any[]; loadOpt?: OptLoader; loadStock?: StockLoader; write?: boolean } = {}): Promise<{ written: number }> {
  const lines = opts.lines ?? await readFlowLog(2);
  const done = new Set(lines.filter((l) => l.type === 'outcome').map((l) => l.id));
  const today = etDateKey(nowMs); const afterClose = etMinutes(nowMs) >= 16 * 60 + 20;
  const pend = lines.filter((l) => (l.type === 'fired' || l.type === 'unwind') && l.row?.plan && l.row?.contract && !done.has(l.row.id) && (l.dateKey < today || (l.dateKey === today && afterClose)));
  if (!pend.length) return { written: 0 };
  const loadOpt: OptLoader = opts.loadOpt ?? (async (occ, a, b) => (await import('./alpaca-options')).getAlpacaOptionBars(occ, a, b, '1Min'));
  const loadStock: StockLoader = opts.loadStock ?? (async (d, s) => (await import('./wall-touch')).loadStockDay(d, s));
  const out: object[] = [];
  const byDate = new Map<string, any[]>();
  for (const l of pend) { const a = byDate.get(l.dateKey) ?? []; a.push(l); byDate.set(l.dateKey, a); }
  for (const [d, ls] of [...byDate.entries()].sort().slice(-5)) {
    const stock = await loadStock(d, Array.from(new Set(ls.map((l) => l.row.symbol))));
    for (const l of ls) {
      const r = l.row as FlowRow;
      const entryAt = Date.parse(r.at);
      const timeStopAt = etWallMs(d, FLOW_CFG.TIME_STOP_MIN);
      const opt = await loadOpt(r.contract!.occ, entryAt - 60_000, timeStopAt);
      const o = evaluateFlowOutcome({ entry: r.plan!.entryPremium, side: r.side, stopUnderlying: r.plan!.stopUnderlying, entryAt, timeStopAt }, opt, stock.get(r.symbol) ?? []);
      out.push({ type: 'outcome', id: r.id, dateKey: d, kind: r.kind, symbol: r.symbol, side: r.side, occ: r.contract!.occ, entry: r.plan!.entryPremium, published: r.published, at: new Date().toISOString(), ...o });
    }
  }
  if (opts.write !== false) await appendFlowLog(out);
  reportCache = null;
  logger.info(`[0DTE-FLOW] outcomes: ${out.length} written (measuring)`);
  return { written: out.length };
}

// ─── read side + routes ──────────────────────────────────────────────────

export function getZeroDteFlowState(nowMs = Date.now()) {
  let cycle = lastCycle; let rows = [...day.rows.values()]; let stamp: ReturnType<typeof sharedStamp> | null = null;
  if (readsSharedState()) {
    const r = readShared<{ cycle: FlowCycle; rows: FlowRow[]; dateKey: string }>(FLOW_SHARED, 30 * 60_000);
    stamp = sharedStamp(r);
    if (r) { cycle = r.data.cycle; rows = r.data.rows ?? []; }
  }
  const today = etDateKey(nowMs);
  const order: Record<FlowState, number> = { fired: 0, reached: 1, faded: 2, watch: 3 };
  return {
    enabled: zeroDteFlowEnabled(), label: 'measuring' as const, lastCycle: cycle, engineState: stamp,
    rows: rows.filter((r) => r.dateKey === today).sort((a, b) => order[a.state] - order[b.state] || (b.score ?? 0) - (a.score ?? 0)),
    rules: {
      window: '09:35–11:30 ET, every 2 min',
      flow: `≥ $${Math.round(FLOW_CFG.MIN_PREMIUM_INDEX / 1000)}K (SPY/QQQ/IWM) / $${Math.round(FLOW_CFG.MIN_PREMIUM_SINGLE / 1000)}K (single names) at-ask premium in 10 min on a 0–2 DTE strike 0.5% ITM–1.5% OTM, day volume > OI`,
      structure: 'above VWAP with the 5-min opening-range high broken and held 2 closed 1-min bars (puts mirror)',
      wall: 'no opposing GEX wall within 0.5% (wall-touch map; unchecked when none held)',
      plan: 'contract = the flowed strike, entry = mid (two-sided quote ≤ 20 min, labelled "delayed quote · Nm" past 2 min or on a delayed feed; spread ≤ 15%); +50% / +100% premium targets; stop underlying through VWAP/OR-mid or −40% premium; time stop 15:30',
      unwind: 'SPY dominant 0DTE strike: aggressor-signed net contracts −40% from a ≥ 3,000 peak in 30 min + price rejected from the strike → ATM opposite-side fade',
      caps: '≤ 6 published per day, ≤ 1 per symbol per side; ZERO_DTE_FLOW=true to publish',
    },
    honesty: 'Flow side is a proxy (each 2-min read classes the interval by the contract\'s last print vs its quote). Measuring — no edge claimed.',
  };
}

let reportCache: { at: number; v: unknown } | null = null;
export async function getZeroDteFlowReport() {
  if (reportCache && Date.now() - reportCache.at < 5 * 60_000) return reportCache.v;
  const lines = await readFlowLog();
  const outcomes = lines.filter((l) => l.type === 'outcome');
  const v = { ...summarizeFlowOutcomes(outcomes), triggersLogged: lines.filter((l) => l.type === 'fired' || l.type === 'unwind').length, nearLogged: lines.filter((l) => l.type === 'near').length, recent: outcomes.slice(-40), label: 'measuring' };
  reportCache = { at: Date.now(), v };
  return v;
}

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerZeroDteFlowRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/zero-dte/flow', requireBetaAccess, (_req, res) => {
    try { res.json(getZeroDteFlowState()); } catch (err) {
      logger.error('[0DTE-FLOW] state failed', { error: (err as Error)?.message });
      res.status(500).json({ error: '0DTE flow state failed' });
    }
  });
  app.get('/api/zero-dte/flow/report', requireBetaAccess, async (_req, res) => {
    try { res.json(await getZeroDteFlowReport()); } catch (err) {
      logger.error('[0DTE-FLOW] report failed', { error: (err as Error)?.message });
      res.status(500).json({ error: '0DTE flow report failed' });
    }
  });
}

/** Test hook. */
export function __resetZeroDteFlowForTests() {
  day = { dateKey: '', seeded: false, mem: new Map(), rows: new Map(), logged: new Set(), published: 0 };
  lastCycle = null; inflight = null; reportCache = null;
}
