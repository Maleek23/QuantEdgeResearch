/**
 * SECTOR ROTATION IDEAS — I/O around shared/sector-rotation-ideas.ts.
 * ===================================================================
 *   build    WORKER, after every sector-board publish in pre-market/session
 *            (server/sector-board.ts runSectorBoard): ≤ 14 suggestions from the
 *            board's rotation read, each a stated plan — entry rule from the
 *            member's chips, structural stop + T1/T2 from the platform level map
 *            and snap (ATR floor, expected-move cap), horizon, vehicle — with the
 *            forward-log stats so far. Published to shared state
 *            ('sector-rotation-ideas'); the web route only reads it.
 *   fire     manual (POST /api/sectors/rotation-ideas/fire, operator only —
 *            server/route-guards.ts) or auto (env SECTOR_ROTATION_IDEAS=true,
 *            default OFF; 09:50 and 13:00 ET; the highest-confluence suggestions
 *            in sectors with side-consensus ≥ 5). Every fire re-reads the plan
 *            LIVE (price, VWAP, levels), then refuses on: the daily cap
 *            (SECTOR_ROTATION_MAX_PER_DAY, default 4, manual + auto together),
 *            earnings within 2 days, an open idea on the same symbol + side, the
 *            bot's rules (loss rule 1 confluence, rule 2 entry window, BTC-proxy
 *            short discipline), the publish gates (no options after the close),
 *            R:R < 1. What passes goes through storage.createTradeIdea — the one
 *            write point: validation, dedup, same-instrument rule, loss rules v1.
 *            Source 'sector_rotation', dataSourceUsed 'sector_board_rotation_*',
 *            labelled measuring, tagged rotation:with.
 *   record   GET /api/sectors/rotation-ideas: suggestions → fired (fire log +
 *            the idea's live outcome) and this engine's own record (outcome v2,
 *            shared/model-record.ts) beside the Fire button.
 *
 * Fire log: .cache/sector-rotation/fires-YYYY-MM.jsonl (fired AND withheld).
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { promises as fsp } from 'fs';
import path from 'path';
import { logger } from './logger';
import { readShared, writeShared, sharedStamp } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { etParts, etWallToMs, checkEntryWindow } from '@shared/loss-rules';
import { outcomeSummary, type BoardLogRow, type BoardSnapshot, type Chip } from '@shared/sector-board';
import {
  ROTATION_CFG, ROTATION_DATA_SOURCE, ROTATION_HONESTY, ROTATION_SOURCE, ROTATION_VERSION,
  autoOrder, capState, catalystLine, chooseEntry, horizonFor, isAutoEligible, pickByDelta, planLevels, readRotationEnv,
  selectCandidates, staticBlocks, vehicleFor, earningsWithin,
  type Candidate, type FireLogRow, type ForwardStat, type Suggestion,
} from '@shared/sector-rotation-ideas';

export const ROTATION_SHARED = 'sector-rotation-ideas';

export interface RotationSnapshot {
  asOf: string;
  boardAsOf: string;
  phase: string;
  suggestions: Suggestion[];
  notes: string[];
  status: 'measuring';
}

let last: RotationSnapshot | null = null;

type CandidateLike = Pick<Candidate, 'key' | 'sectorId' | 'sectorLabel' | 'etf' | 'regime' | 'side' | 'rank' | 'consensus' | 'igniting' | 'kind' | 'symbol'> & {
  score: number | null; chips: Chip[]; earnings: string | null;
};

const fromCandidate = (c: Candidate): CandidateLike => ({
  key: c.key, sectorId: c.sectorId, sectorLabel: c.sectorLabel, etf: c.etf, regime: c.regime, side: c.side, rank: c.rank,
  consensus: c.consensus, igniting: c.igniting, kind: c.kind, symbol: c.symbol, score: c.member.score, chips: c.member.chips, earnings: c.member.earnings,
});

// ─── one plan (used by the batch build AND by every fire, with live reads) ─

export interface BuildDeps {
  nowMs?: number;
  /** Test seams. */
  daily?: (s: string) => Promise<Array<{ time: number; open?: number; high: number; low: number; close: number }>>;
  levelMap?: (s: string) => Promise<{ clusters: any[]; tolerance: number; atrDaily: number | null; asOf: string } | null>;
  intraday?: (s: string) => Promise<{ lastClose: number | null; vwap: number | null; lastBarAt: number | null } | null>;
  cap?: (plan: { symbol: string; direction: 'long' | 'short'; entry: number; stop: number; targets: number[]; horizon: 'day' | 'swing' | 'position' }) => Promise<number | null>;
  earnings?: (s: string) => Promise<string | null>;
  forward?: (sectorId: string) => { sector: ForwardStat[]; all: ForwardStat[] };
}

async function liveDaily(s: string) { const { fetchCandles } = await import('./historical-candles'); return (await fetchCandles(s, '3mo', '1d')) as any[]; }
async function liveMap(s: string) { const { getLevelMap } = await import('./levels/level-map'); return getLevelMap(s); }
async function liveIntraday(s: string) { const { getIntradayStructure } = await import('./zero-dte-structure'); return getIntradayStructure(s); }
async function liveCap(p: Parameters<NonNullable<BuildDeps['cap']>>[0]) { const { expectedMoveCapFor } = await import('./levels/level-map'); return expectedMoveCapFor(p); }
async function liveEarnings(s: string): Promise<string | null> {
  try {
    const { peekEarningsDate, getEarningsDate } = await import('./earnings-service');
    const peek = peekEarningsDate(s);
    const d = peek === undefined ? await getEarningsDate(s) : peek;
    return d ? d.toISOString().slice(0, 10) : null;
  } catch { return null; }
}

export async function buildPlan(c: CandidateLike, deps: BuildDeps = {}): Promise<Suggestion | null> {
  const nowMs = deps.nowMs ?? Date.now();
  const et = etParts(nowMs);
  const inSession = et.weekday >= 1 && et.weekday <= 5 && et.minutes >= 9 * 60 + 30 && et.minutes < 16 * 60;
  const bars = await (deps.daily ?? liveDaily)(c.symbol).catch(() => []);
  const done = bars.filter((b) => etParts(b.time * 1000).dateKey < et.dateKey || !inSession);
  if (done.length < 25) return null;
  const { atr14 } = await import('./lib/atr-stop-floor');
  const atr = atr14(done as any);
  const map = await (deps.levelMap ?? liveMap)(c.symbol).catch(() => null);
  const intra = inSession ? await (deps.intraday ?? liveIntraday)(c.symbol).catch(() => null) : null;
  const price = intra?.lastClose ?? done[done.length - 1].close;
  const priceAt = intra?.lastBarAt ? new Date(intra.lastBarAt + 5 * 60_000).toISOString() : new Date(done[done.length - 1].time * 1000).toISOString();
  const entry = chooseEntry({ side: c.side, kind: c.kind, closes: done.map((b) => b.close), price, atr, vwap: intra?.vwap ?? null, chips: c.chips });
  if (!entry) return null;
  const hz = horizonFor(c);
  const clusters = map?.clusters ?? [];
  const tolerance = map?.tolerance ?? Math.max(0.01, entry.entry * 0.001);
  // Expected-move cap on the 2R formula T1 (the cap needs a stop: read it off the plan without a cap first).
  const pre = planLevels({ side: c.side, entry: entry.entry, clusters, tolerance, atr: map?.atrDaily ?? atr, horizon: hz.horizon, maxTarget: null });
  if (!pre) return null;
  const maxTarget = await (deps.cap ?? liveCap)({ symbol: c.symbol, direction: c.side, entry: entry.entry, stop: pre.formulaStop, targets: [entry.entry + (c.side === 'long' ? 1 : -1) * ROTATION_CFG.formulaTargetsR[0] * Math.abs(entry.entry - pre.formulaStop)], horizon: hz.horizon }).catch(() => null);
  const asOfEt = map?.asOf ? new Date(map.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : undefined;
  const lv = planLevels({ side: c.side, entry: entry.entry, clusters, tolerance, atr: map?.atrDaily ?? atr, horizon: hz.horizon, maxTarget, levelsAsOf: asOfEt });
  if (!lv) return null;
  // Gate 5 (server/lib/atr-stop-floor.ts) as the final word on the stop — a no-op when the snap already honoured it.
  let stop = lv.stop; let rr = lv.rr; let stopBasis = lv.stopBasis;
  if (hz.horizon !== 'day') {
    const { computeAtrStopFloor } = await import('./lib/atr-stop-floor');
    const f = computeAtrStopFloor({ symbol: c.symbol, entry: entry.entry, stop, target: lv.t1, direction: c.side, holdingPeriod: hz.horizon, assetType: 'stock' }, done as any);
    if (f.widened && typeof f.stopLoss === 'number') { stop = f.stopLoss; rr = Math.round((f.riskRewardRatio ?? rr) * 100) / 100; stopBasis += '; widened to the 1.25× ATR(14) floor'; }
  }
  const earnings = c.earnings ?? await (deps.earnings ?? liveEarnings)(c.symbol);
  const forward = deps.forward?.(c.sectorId) ?? { sector: [], all: [] };
  const s: Suggestion = {
    key: c.key, sectorId: c.sectorId, sectorLabel: c.sectorLabel, etf: c.etf, regime: c.regime, side: c.side, rank: c.rank,
    consensus: c.consensus, igniting: c.igniting, kind: c.kind, symbol: c.symbol, score: c.score,
    price: Math.round(price * 100) / 100, priceAt,
    entry, stop, t1: lv.t1, t2: lv.t2, rr, stopBasis, t1Basis: lv.t1Basis, t2Basis: lv.t2Basis, capped: lv.capped,
    horizon: hz.horizon, horizonLabel: hz.label, vehicle: vehicleFor(price, hz.horizon),
    chips: c.chips.map((x) => ({ key: x.key, label: x.label, state: x.state, detail: x.detail })),
    earnings, levelsAsOf: map?.asOf ?? null, forward, blocks: [], autoEligible: false, status: 'measuring',
  };
  s.blocks = staticBlocks(s, nowMs);
  s.autoEligible = isAutoEligible(s);
  return s;
}

// ─── batch build (worker) ────────────────────────────────────────────────

function forwardReader(rows: BoardLogRow[]): (sectorId: string) => { sector: ForwardStat[]; all: ForwardStat[] } {
  const all = outcomeSummary(rows);
  return (id) => ({ sector: outcomeSummary(rows.filter((r) => r.sectorId === id)), all });
}

export async function buildRotationSuggestions(snap: BoardSnapshot, deps: BuildDeps & { forwardRows?: BoardLogRow[] } = {}): Promise<RotationSnapshot> {
  const nowMs = deps.nowMs ?? Date.now();
  const notes: string[] = [];
  let rows = deps.forwardRows;
  if (!rows) { try { rows = await (await import('./sector-board')).readForwardLog(); } catch { rows = []; } }
  const forward = forwardReader(rows);
  const cands = selectCandidates(snap.sectors);
  const out: Suggestion[] = [];
  for (const c of cands) {
    try {
      const s = await buildPlan(fromCandidate(c), { ...deps, nowMs, forward });
      if (s) out.push(s); else notes.push(`${c.symbol}: no plan (bars, levels or a valid stop/target missing)`);
    } catch (err) { notes.push(`${c.symbol}: ${(err as Error).message}`); }
  }
  if (!cands.length) notes.push('no sector in a Leading/Improving or Weakening/Lagging regime had a leader above the confluence floor');
  return { asOf: new Date(nowMs).toISOString(), boardAsOf: snap.asOf, phase: snap.phase, suggestions: out, notes, status: 'measuring' };
}

/** Called by runSectorBoard after it publishes (worker). Pre-market and session only — the plans are for the next fire. */
export async function refreshRotationSuggestions(snap: BoardSnapshot): Promise<number> {
  if (snap.phase !== 'premarket' && snap.phase !== 'session') return 0;
  const r = await buildRotationSuggestions(snap);
  last = r;
  if (writesSharedState()) await writeShared(ROTATION_SHARED, r);
  logger.info(`[SECTOR-ROTATION] ${r.suggestions.length} suggestion(s) (${r.suggestions.filter((s) => s.autoEligible).length} auto-eligible) from the ${snap.phase} board`);
  return r.suggestions.length;
}

export function readRotation(): { snap: RotationSnapshot | null; stamp: ReturnType<typeof sharedStamp> } {
  if (readsSharedState() || !last) {
    const r = readShared<RotationSnapshot>(ROTATION_SHARED, 6 * 3_600_000);
    if (r?.data) return { snap: r.data, stamp: sharedStamp(r) };
  }
  return { snap: last, stamp: last ? { source: 'memory', asOf: last.asOf, ageSec: Math.round((Date.now() - Date.parse(last.asOf)) / 1000), stale: false } : { source: 'memory', asOf: null, ageSec: null, stale: true } };
}

// ─── fire log ────────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), '.cache', 'sector-rotation');
async function appendFire(row: FireLogRow): Promise<void> {
  try {
    await fsp.mkdir(LOG_DIR, { recursive: true });
    await fsp.appendFile(path.join(LOG_DIR, `fires-${row.dateKey.slice(0, 7)}.jsonl`), JSON.stringify(row) + '\n', 'utf8');
  } catch (err) { logger.warn(`[SECTOR-ROTATION] fire log write failed: ${(err as Error).message}`); }
}
export async function readFires(months = 2): Promise<FireLogRow[]> {
  try {
    const files = (await fsp.readdir(LOG_DIR)).filter((f) => /^fires-\d{4}-\d{2}\.jsonl$/.test(f)).sort().slice(-months);
    const out: FireLogRow[] = [];
    for (const f of files) for (const line of (await fsp.readFile(path.join(LOG_DIR, f), 'utf8')).split('\n')) { if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* torn line */ } } }
    return out;
  } catch { return []; }
}

// ─── DB reads: today's count, the engine's rows ──────────────────────────

async function engineRows(): Promise<any[]> {
  try {
    const { db } = await import('./db');
    const { tradeIdeas } = await import('@shared/schema');
    const { and, eq, like, desc } = await import('drizzle-orm');
    return await db.select().from(tradeIdeas)
      .where(and(eq(tradeIdeas.source, ROTATION_SOURCE as any), like(tradeIdeas.dataSourceUsed, `${ROTATION_DATA_SOURCE}%`)))
      .orderBy(desc(tradeIdeas.timestamp)).limit(400) as any[];
  } catch (err) { logger.debug(`[SECTOR-ROTATION] engine rows unavailable: ${(err as Error).message}`); return []; }
}

export function firedTodayCount(rows: Array<{ timestamp?: string | null }>, nowMs: number): number {
  const et = etParts(nowMs);
  const start = etWallToMs(et.y, et.m, et.d, 0);
  return rows.filter((r) => Date.parse(String(r.timestamp ?? '')) >= start).length;
}

// ─── fire ────────────────────────────────────────────────────────────────

export interface FireResult { ok: boolean; ideaId: string | null; reason: string | null; suggestion: Suggestion | null }

export interface FireDeps extends BuildDeps {
  env?: Record<string, string | undefined>;
  rows?: () => Promise<any[]>;
  openIdeas?: () => Promise<any[]>;
  confluence?: (s: Suggestion) => Promise<{ passed: boolean; reason: string }>;
  contract?: (s: Suggestion) => Promise<{ pick: any | null; note: string | null }>;
  write?: (idea: Record<string, any>) => Promise<string | null>;
  log?: (row: FireLogRow) => Promise<void>;
}

async function liveConfluence(s: Suggestion) {
  const { botConfluenceGate } = await import('./loss-rules');
  const gamma = s.chips.find((c) => c.key === 'gamma' && c.state === 'pass');
  return botConfluenceGate({ symbol: s.symbol, direction: s.side, source: ROTATION_SOURCE, layers: gamma ? [{ kind: 'gex', points: 3, why: gamma.detail }] : [] }, { source: ROTATION_SOURCE });
}
async function liveContract(s: Suggestion) {
  try {
    const { selectContracts } = await import('./option-selection-engine');
    const sel = await selectContracts({
      symbol: s.symbol, direction: s.side === 'long' ? 'bullish' : 'bearish', setup: 'swing', holdingDays: 5, applyDteFit: true,
      entry: s.entry.entry, stop: s.stop, t1: s.t1, ...(s.t2 ? { t2: s.t2 } : {}), conviction: 55, asOfSpot: s.price,
    } as any);
    const pick = pickByDelta(sel.picks as any[]);
    return { pick, note: pick ? null : (sel.note ?? `no ${ROTATION_CFG.option.dteMin}–${ROTATION_CFG.option.dteMax} DTE contract near ${ROTATION_CFG.option.delta}Δ passed the gates`) };
  } catch (err) { return { pick: null, note: `contract selection failed: ${(err as Error).message}` }; }
}
async function liveWrite(idea: Record<string, any>): Promise<string | null> {
  const { storage } = await import('./storage');
  const created = await storage.createTradeIdea(idea as any, { dedupWindowHours: 24 });
  return (created as any)?.id ?? null;
}
async function liveOpen(): Promise<any[]> { try { const { storage } = await import('./storage'); return await storage.getOpenTradeIdeas(); } catch { return []; } }

export function ideaFromSuggestion(s: Suggestion, nowMs: number, mode: 'manual' | 'auto', contract: any | null, contractNote: string | null): Record<string, any> {
  const fwd = s.forward.sector.find((f) => f.h === 3) ?? s.forward.all.find((f) => f.h === 3) ?? null;
  const fwdText = fwd && fwd.n ? `Forward log so far (leaders vs their sector, 3 sessions): n=${fwd.n}, mean excess ${fwd.meanExcess}pp, beat ${fwd.beatPct}%.` : 'Forward log: no measured outcomes yet.';
  const evidence = {
    version: ROTATION_VERSION, status: 'measuring', validated: false, mode,
    sector: { id: s.sectorId, label: s.sectorLabel, etf: s.etf, regime: s.regime, rank: s.rank, consensus: s.consensus, igniting: s.igniting },
    kind: s.kind, score: s.score, chips: s.chips, entryRule: s.entry, stopBasis: s.stopBasis, t1Basis: s.t1Basis, t2: s.t2, t2Basis: s.t2Basis,
    horizon: s.horizon, vehicle: s.vehicle, forward: s.forward, suggestionKey: s.key,
  };
  const base: Record<string, any> = {
    symbol: s.symbol, direction: s.side, entryPrice: s.entry.entry, targetPrice: s.t1, stopLoss: s.stop, riskRewardRatio: s.rr,
    catalyst: catalystLine(s),
    analysis: [
      `${s.sectorLabel}${s.etf ? ` (${s.etf})` : ''} reads ${s.regime.toUpperCase()} on the sector board (rank #${s.rank}; ${s.consensus.with} of ${s.consensus.n} signals agree on the ${s.side} side).`,
      `${s.symbol} is a ${s.kind === 'leader' ? `confluence leader (score ${s.score ?? '—'}/100)` : 'catch-up laggard'}: ${s.chips.filter((c) => c.state === 'pass').map((c) => `${c.label} — ${c.detail}`).join('; ') || 'no chip passed'}.`,
      `Entry: ${s.entry.text}`,
      `Stop $${s.stop.toFixed(2)} (${s.stopBasis}); T1 $${s.t1.toFixed(2)} (${s.t1Basis}, ${s.rr.toFixed(2)}R)${s.t2 != null ? `; T2 $${s.t2.toFixed(2)} (${s.t2Basis})` : ''}. Horizon: ${s.horizonLabel}.`,
      contract ? `Contract: ${String(contract.optionType).toUpperCase()} ${contract.strike} ${contract.expiry} (${contract.dte} DTE, Δ ${Number(contract.delta).toFixed(2)}).` : s.vehicle.kind === 'option' ? `No contract attached — ${contractNote ?? 'none passed'}; logged on the stock.` : '',
      fwdText,
      'MEASURING: sector-rotation ideas are unvalidated (rotation alignment flipped sign between study halves; recent semis-rotation longs lost). Loss rules v1 apply at the write.',
    ].filter(Boolean).join(' '),
    source: ROTATION_SOURCE, dataSourceUsed: `${ROTATION_DATA_SOURCE}_${s.kind}_${mode}`,
    sessionContext: 'regular', timestamp: new Date(nowMs).toISOString(), outcomeStatus: 'open', confidenceScore: 55,
    holdingPeriod: s.horizon === 'day' ? 'day' : 'swing', tradeType: s.horizon === 'day' ? 'day' : 'swing',
    qualitySignals: [`engine:${ROTATION_VERSION}`, `sector:${s.sectorId}`, `regime:${s.regime}`, `consensus:${s.consensus.with}/${s.consensus.n}`, `kind:${s.kind}`, `entry_rule:${s.entry.rule}`, 'rotation:with', `fire:${mode}`, 'validated:false', 'measuring'],
    convergenceSignalsJson: { sectorRotation: evidence },
  };
  if (s.horizon === 'day') base.exitBy = new Date(etWallToMs(...ymd(nowMs), 15 * 60 + 55)).toISOString();
  return contract
    ? { ...base, assetType: 'option', optionType: contract.optionType, strikePrice: contract.strike, expiryDate: contract.expiry, entryPremium: Number(Number(contract.entryPremium).toFixed(2)), optionDte: contract.dte, expiryTier: 'MONTHLY' }
    : { ...base, assetType: 'stock' };
}
function ymd(ms: number): [number, number, number] { const p = etParts(ms); return [p.y, p.m, p.d]; }

/** Re-plan one suggestion live and fire it through every gate. Never throws. */
export async function fireSuggestion(key: string, opts: { mode: 'manual' | 'auto'; suggestion?: Suggestion | null } , deps: FireDeps = {}): Promise<FireResult> {
  const nowMs = deps.nowMs ?? Date.now();
  const env = deps.env ?? process.env;
  const published = opts.suggestion ?? readRotation().snap?.suggestions.find((s) => s.key === key) ?? null;
  const log = deps.log ?? appendFire;
  const dk = etParts(nowMs).dateKey;
  const finish = async (s: Suggestion | null, status: 'fired' | 'withheld', ideaId: string | null, reason: string | null, vehicle?: string): Promise<FireResult> => {
    const p = s ?? published;
    if (p) await log({ at: new Date(nowMs).toISOString(), dateKey: dk, key, symbol: p.symbol, side: p.side, sectorId: p.sectorId, sectorLabel: p.sectorLabel, mode: opts.mode, status, ideaId, reason, plan: { rule: p.entry.rule, entry: p.entry.entry, stop: p.stop, t1: p.t1, t2: p.t2, rr: p.rr, vehicle: vehicle ?? p.vehicle.kind, horizon: p.horizon }, status_tag: 'measuring' });
    return { ok: status === 'fired', ideaId, reason, suggestion: p };
  };
  if (!published) return { ok: false, ideaId: null, reason: 'unknown suggestion — the list was republished; reload', suggestion: null };

  const { cap } = readRotationEnv(env);
  const rows = await (deps.rows ?? engineRows)();
  const capR = capState(firedTodayCount(rows, nowMs), cap);
  if (!capR.ok) return finish(null, 'withheld', null, capR.reason);

  // Live re-plan (price, VWAP, levels) — never fire a stale plan.
  const live = await buildPlan({ ...published, chips: published.chips.map((c) => ({ ...c, weight: 1 })), earnings: null }, { ...deps, nowMs, forward: () => published.forward }).catch(() => null);
  if (!live) return finish(null, 'withheld', null, 'live re-plan failed (bars, levels or a valid stop/target missing)');
  const blocks = staticBlocks(live, nowMs);
  const earnBlock = earningsWithin(live.earnings, nowMs);
  if (earnBlock && !blocks.includes(earnBlock)) blocks.push(earnBlock);
  if (blocks.length) return finish(live, 'withheld', null, blocks.join('; '));

  // Bot rules: BTC-proxy short discipline, entry window (rule 2), confluence (rule 1).
  const { evaluateShortDiscipline } = await import('./short-discipline');
  const sd = evaluateShortDiscipline({ symbol: live.symbol, direction: live.side, hasEventCatalyst: false, btcChangePercent: null });
  if (!sd.allowed) return finish(live, 'withheld', null, `bot rule: ${sd.reason}`);
  const { lossRulesConfig } = await import('./loss-rules');
  const lr = lossRulesConfig();
  if (lr.botEntryWindow) {
    const w = checkEntryWindow({ nowMs, publishedAt: nowMs, direction: live.side, entry: live.entry.entry, live: live.price, cfg: lr });
    if (!w.ok) return finish(live, 'withheld', null, `bot rule 2: ${w.reason}`);
  }
  if (lr.botConfluence) {
    const cf = await (deps.confluence ?? liveConfluence)(live).catch((e) => ({ passed: false, reason: `confluence read failed: ${(e as Error).message}` }));
    if (!cf.passed) return finish(live, 'withheld', null, `bot rule 1: ${cf.reason}`);
  }
  const open = await (deps.openIdeas ?? liveOpen)();
  const held = open.find((i: any) => String(i.symbol).toUpperCase() === live.symbol && (String(i.direction).toLowerCase() === 'short' ? 'short' : 'long') === live.side);
  if (held) return finish(live, 'withheld', null, `already held — open ${live.side} idea ${held.id} (${held.source ?? 'unknown source'})`);

  // Vehicle: ~0.40Δ 21–45 DTE from the contract engine; the publish gate decides whether an option may publish now.
  let contract: any = null; let contractNote: string | null = null;
  if (live.vehicle.kind === 'option') {
    const { publishGateFor } = await import('./lib/publish-gates');
    const gate = publishGateFor({ source: ROTATION_SOURCE, assetType: 'option', expiryDate: null }, nowMs, env);
    if (gate) return finish(live, 'withheld', null, `publish gate: ${gate}`, 'option');
    const r = await (deps.contract ?? liveContract)(live);
    contract = r.pick; contractNote = r.note;
  }
  try {
    const idea = ideaFromSuggestion(live, nowMs, opts.mode, contract, contractNote);
    const id = await (deps.write ?? liveWrite)(idea);
    if (!id) return finish(live, 'withheld', null, 'write returned no id', contract ? 'option' : 'stock');
    return finish(live, 'fired', id, contract ? null : live.vehicle.kind === 'option' ? `no contract (${contractNote ?? 'none'}) — logged on the stock` : null, contract ? 'option' : 'stock');
  } catch (err) {
    return finish(live, 'withheld', null, `write gate: ${(err as Error).message}`);
  }
}

// ─── auto-mode (worker, 09:50 + 13:00 ET) ────────────────────────────────

export async function runRotationAuto(deps: FireDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const { auto, cap } = readRotationEnv(env);
  if (!auto) return 0;
  const nowMs = deps.nowMs ?? Date.now();
  const et = etParts(nowMs);
  if (et.weekday < 1 || et.weekday > 5) return 0;
  const snap = readRotation().snap;
  if (!snap || nowMs - Date.parse(snap.asOf) > 45 * 60_000) { logger.info('[SECTOR-ROTATION] auto: no suggestions published in the last 45 min — nothing fired'); return 0; }
  const rows = await (deps.rows ?? engineRows)();
  let left = capState(firedTodayCount(rows, nowMs), cap).left;
  const fires = await readFires(1);
  const firedKeys = new Set(fires.filter((f) => f.dateKey === et.dateKey && f.status === 'fired').map((f) => f.key));
  let n = 0;
  for (const s of autoOrder(snap.suggestions.filter((x) => x.autoEligible && !firedKeys.has(x.key)))) {
    if (left <= 0) break;
    const r = await fireSuggestion(s.key, { mode: 'auto', suggestion: s }, { ...deps, nowMs, rows: async () => rows.concat(Array.from({ length: n }, () => ({ timestamp: new Date(nowMs).toISOString() }))) });
    if (r.ok) { n++; left--; }
    logger.info(`[SECTOR-ROTATION] auto ${s.symbol} ${s.side}: ${r.ok ? `fired ${r.ideaId}` : `withheld — ${r.reason}`}`);
  }
  return n;
}

// ─── record ──────────────────────────────────────────────────────────────

let recordCache: { at: number; data: any } | null = null;
async function engineRecord(): Promise<{ record: any; ideas: any[] }> {
  if (recordCache && Date.now() - recordCache.at < 60_000) return recordCache.data;
  const rows = await engineRows();
  const { computeModelRecord } = await import('@shared/model-record');
  const { realisedR, classifyOutcomeV2 } = await import('@shared/constants');
  const record = computeModelRecord(rows as any[]);
  const ideas = rows.slice(0, 60).map((r: any) => ({
    id: r.id, symbol: r.symbol, direction: r.direction, timestamp: r.timestamp, assetType: r.assetType, outcomeStatus: r.outcomeStatus,
    exitPrice: r.exitPrice ?? null, exitDate: r.exitDate ?? null, percentGain: r.percentGain ?? null,
    outcome: classifyOutcomeV2(r), r: realisedR(r), entryPrice: r.entryPrice, stopLoss: r.stopLoss, targetPrice: r.targetPrice,
  }));
  const data = { record, ideas };
  recordCache = { at: Date.now(), data };
  return data;
}

// ─── routes ──────────────────────────────────────────────────────────────

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;

/** Register BEFORE /api/sectors/:id (server/sector-board.ts) — that route would swallow the path. */
export function registerSectorRotationRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/sectors/rotation-ideas', requireBetaAccess, async (req, res) => {
    try {
      const { snap, stamp } = readRotation();
      const env = readRotationEnv(process.env);
      const [{ record, ideas }, fires] = await Promise.all([engineRecord(), readFires(2)]);
      const byId = new Map(ideas.map((i: any) => [String(i.id), i]));
      const fired = fires.slice(-80).reverse().map((f) => ({ ...f, idea: f.ideaId ? byId.get(f.ideaId) ?? null : null }));
      let canFire = false;
      try { const { journalActor } = await import('./journal-sources'); canFire = (await journalActor(req)).isAdmin; } catch { canFire = false; }
      const nowMs = Date.now();
      res.json({
        asOf: snap?.asOf ?? null, boardAsOf: snap?.boardAsOf ?? null, phase: snap?.phase ?? null,
        suggestions: snap?.suggestions ?? [], notes: snap?.notes ?? ['not published yet — built by the worker after each pre-market/session sector-board read'],
        fired, record, ideas,
        flags: { auto: env.auto, cap: env.cap, firedToday: firedTodayCount(ideas, nowMs), autoTimesEt: ROTATION_CFG.autoTimesEt, autoMinConsensus: ROTATION_CFG.autoMinConsensus },
        canFire, config: ROTATION_CFG, honesty: ROTATION_HONESTY, source: ROTATION_SOURCE, stamp, status: 'measuring', generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('[SECTOR-ROTATION] read failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'rotation ideas unavailable' });
    }
  });
  // Operator only: guarded in server/route-guards.ts (admin JWT or a signed-in admin user).
  app.post('/api/sectors/rotation-ideas/fire', requireBetaAccess, async (req, res) => {
    const key = String(req.body?.key ?? '').slice(0, 120);
    if (!/^[a-z0-9_]{1,40}\|[A-Z0-9.\-]{1,12}\|(long|short)$/.test(key)) return res.status(400).json({ error: 'bad suggestion key' });
    try {
      const r = await fireSuggestion(key, { mode: 'manual' });
      recordCache = null;
      res.status(r.ok ? 200 : 409).json({ ok: r.ok, ideaId: r.ideaId, reason: r.reason, plan: r.suggestion, status: 'measuring' });
    } catch (err) {
      res.status(500).json({ ok: false, reason: (err as Error).message });
    }
  });
}

