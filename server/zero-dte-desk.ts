/**
 * 0DTE DESK — the NEXUS "0DTE" view, its dashboard tool, the single-name 0DTE
 * producer and the 2–4 day swing producer.
 * ============================================================================
 *   GET /api/zero-dte/desk      one row per tracked name (ZERO_DTE_WATCH,
 *                               default SPX,TSLA,MSTR,KWEB) + the session clock
 *                               + short swings + this engine's honest record.
 *   runZeroDteDeskScan()        TSLA/MSTR/KWEB (every watched name except SPX)
 *                               through the same pre-registered policies A/B/C
 *                               (server/zero-dte-policies.ts) with the name's
 *                               own measured levels; publishes to trade_ideas
 *                               (source 'zero_dte_desk') so the outcome tracker
 *                               resolves them. SPX stays with the index engine
 *                               (server/index-scalp-engine.ts: SPY GEX → SPX,
 *                               SPY as the account-fit fallback) — one owner per
 *                               name, never two engines publishing the same call.
 *   runShortSwingPublish()      2–4 day plans (zero-dte-desk-core planShortSwing)
 *                               at 10:30 / 14:30 ET, contracts 30–60 DTE (loss
 *                               rule 4), T1 ≤ 1σ of the horizon (rule 3).
 *
 * PROVIDER BUDGET: a handful of names, all cached. Chains — Alpaca default
 * 180d/±40% key (shared with the GEX snapshot; 90 s cache in session) in the
 * PRIORITY lane when a user is waiting; SPX from the CBOE delayed CDN (Alpaca
 * lists no index options), 60 s CDN cache + this desk's 3-minute cache. Bars —
 * Yahoo 5-min (60 s cache). Flow — the Bullflow print ring already in memory
 * (no request) plus the net-premium read that shares the 3-minute Bullflow
 * cache and the process-wide 8/min budget. The whole desk payload is cached
 * 60 s and built by one in-flight promise.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { and, gte, like, or, eq } from 'drizzle-orm';
import { logger } from './logger';
import { tradeIdeas } from '@shared/schema';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import { realizedVolDaily } from '@shared/loss-rules';
import {
  armedReads, deskEngineState, etDateKey, expectedMoveFor, expiryBucketLevels, intradayRead, parseWatch,
  pickDeskExpiry, planShortSwing, sessionPhase, summarizeDeskRecord, todayFraction,
  type BucketLevels, type DeskChainRow, type DeskIdeaRef, type DeskExpiry, type DeskRecord, type EngineState, type ExpectedMove,
  type IntradayRead, type RecordRow, type SessionPhase, type SwingPlan,
} from './zero-dte-desk-core';
import { evaluateZeroDte, timeStopIso, zeroDteWallsEnabled, ZERO_DTE_PROVENANCE, TIME_STOP_ET, type PolicyVerdict } from './zero-dte-policies';

export const DESK_SOURCE = 'zero_dte_desk';
export const watchList = () => parseWatch(process.env.ZERO_DTE_WATCH);
/** Names the index engine owns (it publishes SPX from SPY GEX). */
const INDEX_OWNED = new Set(['SPX', 'SPY', 'QQQ', 'IWM']);
const CHAIN_TTL_MS = 3 * 60_000;
const DESK_TTL_MS = 60_000;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((res) => { const t = setTimeout(() => res(null), ms); p.then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(null); }); });

// ─── chains ──────────────────────────────────────────────────────────────

interface DeskChain { rows: DeskChainRow[]; expirations: string[]; spot: number; source: string; fetchedAt: number }
const chainCache = new Map<string, { at: number; c: DeskChain | null }>();

async function getDeskChain(sym: string, priority: boolean): Promise<DeskChain | null> {
  const hit = chainCache.get(sym);
  if (hit && Date.now() - hit.at < (hit.c ? CHAIN_TTL_MS : 30_000)) return hit.c;
  let c: DeskChain | null = null;
  try {
    if (sym !== 'SPX') {
      const ap = await import('./alpaca-options');
      if (ap.isAlpacaOptionsConfigured()) {
        const fetch = () => ap.getAlpacaOptionsChain(sym);
        const chain = await withTimeout(priority ? ap.withAlpacaPriority(fetch) : fetch(), 20_000);
        if (chain?.contracts.length && chain.spot) {
          c = { rows: ap.alpacaToTradierShape(chain) as DeskChainRow[], expirations: chain.expirations, spot: chain.spot, source: 'Alpaca indicative', fetchedAt: chain.fetchedAt };
        }
      }
    }
    if (!c) {
      const { fetchCboeChain } = await import('./contract-analyzer/cboe-chain');
      const cb = await fetchCboeChain(sym, 15_000);
      if (cb?.rawChain.length) {
        c = { rows: cb.rawChain as unknown as DeskChainRow[], expirations: [...new Set(cb.rawChain.map((r) => r.expiration_date))].sort(), spot: cb.spot, source: 'CBOE delayed (~15 min)', fetchedAt: cb.fetchedAt ?? Date.now() };
      }
    }
  } catch (e) {
    logger.warn(`[0DTE-DESK] ${sym} chain failed: ${(e as Error).message}`);
  }
  chainCache.set(sym, { at: Date.now(), c });
  return c;
}

// ─── realized vol (daily bars, cached 30 min) ────────────────────────────
const volCache = new Map<string, { at: number; v: number | null }>();
async function sigmaDaily(sym: string): Promise<number | null> {
  const hit = volCache.get(sym);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
  let v: number | null = null;
  try {
    const { fetchCandles } = await import('./historical-candles');
    const bars = (await withTimeout(fetchCandles(sym === 'SPX' ? '^GSPC' : sym, '3mo', '1d'), 6000)) ?? [];
    const today = etDateKey(Date.now());
    v = realizedVolDaily(bars.filter((b) => etDateKey(b.time * 1000) < today).map((b) => b.close), 20);
  } catch { /* disclosed as null */ }
  volCache.set(sym, { at: Date.now(), v });
  return v;
}

// ─── flow ────────────────────────────────────────────────────────────────

export interface FlowTide {
  expiry: string | null;
  prints: number;
  callPremium: number;
  putPremium: number;
  lean: 'long' | 'short' | 'flat' | null;
  /** All-expiry net premium lean today (Bullflow netPremiumSeries), null when unavailable. */
  dayLean: 'long' | 'short' | 'flat' | null;
  dayCallsNet: number | null;
  dayPutsNet: number | null;
  asOf: string | null;
  basis: string;
}

async function flowTide(sym: string, expiry: string | null, readNet: boolean): Promise<FlowTide> {
  const aliases = sym === 'SPX' ? new Set(['SPX', 'SPXW']) : new Set([sym]);
  let prints = 0; let calls = 0; let puts = 0; let last: string | null = null;
  try {
    const bf = await import('./bullflow-service');
    const today = etDateKey(Date.now());
    for (const p of bf.getBullflowPrints().prints) {
      if (!aliases.has(p.underlying) || etDateKey(Date.parse(p.at)) !== today) continue;
      if (expiry && p.expiry !== expiry) continue;
      prints++;
      if (p.optionType === 'call') calls += p.premium; else puts += p.premium;
      if (!last || p.at > last) last = p.at;
    }
    let dayLean: FlowTide['dayLean'] = null; let dc: number | null = null; let dp: number | null = null; let asOf = last;
    if (readNet && bf.bullflowEnabled()) {
      const np = await withTimeout(bf.getNetPremiumToday(sym), 5000);
      if (np) { dayLean = np.lean; dc = np.callsNetPremium; dp = np.putsNetPremium; asOf = np.asOf ?? asOf; }
    }
    const net = calls - puts;
    const lean = prints === 0 ? null : Math.abs(net) < 100_000 ? 'flat' : net > 0 ? 'long' : 'short';
    return {
      expiry, prints, callPremium: calls, putPremium: puts, lean, dayLean, dayCallsNet: dc, dayPutsNet: dp, asOf,
      basis: bf.bullflowEnabled()
        ? `${prints} Bullflow algo print(s) today on the ${expiry ?? 'front'} expiry (call $${Math.round(calls / 1000)}K vs put $${Math.round(puts / 1000)}K); day lean from net premium, all expiries`
        : 'Bullflow not configured — no tape read',
    };
  } catch {
    return { expiry, prints: 0, callPremium: 0, putPremium: 0, lean: null, dayLean: null, dayCallsNet: null, dayPutsNet: null, asOf: null, basis: 'flow unavailable' };
  }
}

// ─── ideas (state + record) ──────────────────────────────────────────────

interface IdeaLite {
  id: string; symbol: string; direction: string; entryPrice: number; stopLoss: number; targetPrice: number;
  exitPrice: number | null; outcomeStatus: string | null; resolutionReason: string | null; timestamp: string;
  source: string | null; dataSourceUsed: string | null; qualitySignals: string[] | null; expiryDate: string | null;
  optionType: string | null; strikePrice: number | null;
}
let ideasCache: { at: number; rows: IdeaLite[] } | null = null;

/** Every idea this engine logged since the outcome baseline: desk ideas + the index engine's policy A/B ideas. */
async function engineIdeas(): Promise<IdeaLite[]> {
  if (ideasCache && Date.now() - ideasCache.at < 60_000) return ideasCache.rows;
  const { db } = await import('./db');
  const rows = await db.select({
    id: tradeIdeas.id, symbol: tradeIdeas.symbol, direction: tradeIdeas.direction, entryPrice: tradeIdeas.entryPrice,
    stopLoss: tradeIdeas.stopLoss, targetPrice: tradeIdeas.targetPrice, exitPrice: tradeIdeas.exitPrice,
    outcomeStatus: tradeIdeas.outcomeStatus, resolutionReason: tradeIdeas.resolutionReason, timestamp: tradeIdeas.timestamp,
    source: tradeIdeas.source, dataSourceUsed: tradeIdeas.dataSourceUsed, qualitySignals: tradeIdeas.qualitySignals,
    expiryDate: tradeIdeas.expiryDate, optionType: tradeIdeas.optionType, strikePrice: tradeIdeas.strikePrice,
  }).from(tradeIdeas).where(and(
    gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE),
    or(
      eq(tradeIdeas.source, DESK_SOURCE as any),
      like(tradeIdeas.dataSourceUsed, 'GEX_index_scalp_A_%'),
      like(tradeIdeas.dataSourceUsed, 'GEX_index_scalp_B_%'),
    ),
  ));
  ideasCache = { at: Date.now(), rows: rows as IdeaLite[] };
  return ideasCache.rows;
}

const kindOf = (r: IdeaLite): '0dte' | 'swing' => (String(r.dataSourceUsed ?? '').includes('swing') ? 'swing' : '0dte');
/** Desk name an idea belongs to (index ideas published on SPY carry underlying:SPY → SPX row). */
function deskNameOf(r: IdeaLite): string {
  const u = (r.qualitySignals ?? []).find((s) => s.startsWith('underlying:'))?.slice(11);
  if (String(r.dataSourceUsed ?? '').startsWith('GEX_index_scalp_') && (u === 'SPY' || r.symbol === 'SPX')) return 'SPX';
  return r.symbol;
}
const toRef = (r: IdeaLite): DeskIdeaRef => ({
  id: r.id, direction: r.direction === 'short' ? 'short' : 'long', outcomeStatus: r.outcomeStatus, timestamp: r.timestamp,
  entry: r.entryPrice, stop: r.stopLoss, target: r.targetPrice, exitPrice: r.exitPrice, resolutionReason: r.resolutionReason, kind: kindOf(r),
});

// ─── single-name engine state (last evaluation per name) ─────────────────

interface EvalMemo { at: number; verdict: PolicyVerdict; withheld: string | null }
const lastEval = new Map<string, EvalMemo>();
const recentPublishes = new Map<string, number>();

// ─── the desk ────────────────────────────────────────────────────────────

export interface DeskRow {
  symbol: string;
  optionRoot: string;
  owner: string;
  spot: number | null;
  spotSource: string | null;
  chainSource: string | null;
  chainAgeSec: number | null;
  expiry: DeskExpiry;
  expectedMove: ExpectedMove | null;
  levels: BucketLevels | null;
  levelsNote: string | null;
  intraday: IntradayRead;
  intradayNote: string | null;
  barsAgeSec: number | null;
  flow: FlowTide;
  engine: EngineState & { evaluatedAgeSec: number | null };
  todaysIdeas: Array<DeskIdeaRef & { contract: string | null }>;
  swing: SwingPlan;
  swingLevels: { regime: string; zeroGamma: number | null; callWall: number | null; putWall: number | null; maxGamma: number | null; basis: string } | null;
  errors: string[];
}

export interface DeskPayload {
  asOf: string;
  watch: string[];
  phase: SessionPhase;
  rows: DeskRow[];
  record: DeskRecord & { perName: Record<string, { n: number; wins: number; losses: number; total: number }> };
  provenance: string;
  notes: string[];
}

/** All-book levels for the swing plan: expiries ≤ 60 days, strikes ±25% (bounded CPU; disclosed). */
function swingBookLevels(sym: string, rows: DeskChainRow[], spot: number) {
  const maxKey = etDateKey(Date.now() + 60 * 864e5);
  const today = etDateKey(Date.now());
  const inputs = rows.filter((r) => r.expiration_date >= today && r.expiration_date <= maxKey && r.strike >= spot * 0.75 && r.strike <= spot * 1.25);
  return import('./options-exposures').then(({ computeExposures, optionToInput }) => {
    const ins = inputs.map((r) => optionToInput(r, r.expiration_date)).filter((x): x is NonNullable<typeof x> => !!x && x.openInterest > 0);
    if (ins.length < 10) return null;
    const s = computeExposures(sym, spot, ins, [...new Set(inputs.map((r) => r.expiration_date))]);
    return { regime: s.regimeRead.regime, zeroGamma: s.zeroGammaLevel, callWall: s.callWall, putWall: s.putWall, maxGamma: s.maxGammaStrike || null, basis: `${s.regimeRead.basis} · book = expiries ≤60d, strikes ±25%` };
  });
}

async function buildRow(sym: string, phase: SessionPhase, ideas: IdeaLite[], priority: boolean, nowMs: number): Promise<DeskRow> {
  const errors: string[] = [];
  const today = etDateKey(nowMs);
  const chain = await getDeskChain(sym, priority);
  if (!chain) errors.push('option chain unavailable (Alpaca and CBOE both failed or timed out)');
  const spot = chain?.spot ?? null;
  const expiry = chain ? pickDeskExpiry(chain.expirations, today, phase.etMin >= 960) : pickDeskExpiry([], today);
  const em = chain && spot && expiry.expiry ? expectedMoveFor(chain.rows, spot, expiry.expiry, todayFraction(phase.etMin), expiry.sessionsAfterToday ?? 0) : null;
  const levels = chain && spot && expiry.expiry ? expiryBucketLevels(sym, chain.rows, spot, expiry.expiry) : null;
  const levelsNote = !expiry.expiry ? null : expiry.sameDay ? 'same-day expiry only' : `no same-day expiry listed — levels are the ${expiry.expiry} expiry only`;

  // Intraday structure. SPX: the cash index has no volume, so VWAP / OR are read on SPY and scaled by the live SPX/SPY ratio.
  const { getIntradayStructure } = await import('./zero-dte-structure');
  let intraday: IntradayRead; let intradayNote: string | null = null; let barsAgeSec: number | null = null;
  let st = await getIntradayStructure(sym === 'SPX' ? 'SPY' : sym);
  if (st && sym === 'SPX' && spot && st.lastClose) {
    const k = spot / st.lastClose;
    const sc = (x: number | null) => (x == null ? null : x * k);
    st = { ...st, vwap: sc(st.vwap), or30High: sc(st.or30High), or30Low: sc(st.or30Low), lastClose: spot, pdh: sc(st.pdh), pdl: sc(st.pdl) };
    intradayNote = `VWAP / OR30 measured on SPY 5-min bars × live SPX/SPY ratio ${k.toFixed(3)}`;
  }
  intraday = intradayRead(st, phase.etMin);
  if (st?.lastBarAt) barsAgeSec = Math.round((nowMs - (st.lastBarAt + 5 * 60_000)) / 1000);

  const flow = await flowTide(sym, expiry.expiry, true);

  // Engine state
  const mine = ideas.filter((r) => deskNameOf(r) === sym);
  const todays = mine.filter((r) => etDateKey(Date.parse(r.timestamp)) === today);
  const todays0 = todays.filter((r) => kindOf(r) === '0dte').map(toRef);
  let verdict: PolicyVerdict | null = null; let withheld: string | null = null; let evaluatedAt: number | null = null; let owner = 'desk engine (policies A/B on this name\'s own levels)';
  if (INDEX_OWNED.has(sym)) {
    owner = 'index engine (SPY GEX → SPX; SPY is the account-fit fallback)';
    const { getLastIndexScan } = await import('./index-scalp-engine');
    const ls = getLastIndexScan();
    if (ls) {
      evaluatedAt = ls.at;
      const idea = ls.result.ideas.find((x) => x.underlying === 'SPY');
      const w = ls.result.waits?.SPY ?? [];
      verdict = { setup: idea ? { policy: idea.policy!, powerHour: idea.isPowerHour, direction: idea.direction, entry: idea.spotPrice, stop: idea.stop, target: idea.target, rr: idea.riskRewardRatio, trigger: { name: '', price: 0 }, targetLevel: { name: '', price: idea.target }, evidence: idea.evidence ?? [] } : null, wait: w };
      const wh = ls.withheld.SPY; if (wh && ls.at - wh.at < 120_000) withheld = wh.reason;
    }
  } else {
    const m = lastEval.get(sym);
    if (m && nowMs - m.at < 15 * 60_000) { verdict = m.verdict; withheld = m.withheld; evaluatedAt = m.at; }
  }
  const gexSign = levels?.regime ?? 'neutral';
  const armed = armedReads(gexSign, intraday.lastClose, [
    { name: '0DTE call wall', price: levels?.callWall ?? null }, { name: '0DTE put wall', price: levels?.putWall ?? null },
    { name: 'zero-γ (0DTE)', price: levels?.zeroGamma ?? null }, { name: 'OR30 high', price: intraday.or30High }, { name: 'OR30 low', price: intraday.or30Low },
  ], phase);
  const state = deskEngineState({
    phase, setup: verdict?.setup ?? null, wait: verdict?.wait ?? (phase.entriesOpen ? ['not evaluated yet this session (the producer runs every 5 min, 2 min in power hour)'] : []),
    withheld, todays0dte: todays0, armed, owner,
  });

  // Short swing
  const sig = spot ? await sigmaDaily(sym) : null;
  const book = chain && spot ? await swingBookLevels(sym, chain.rows, spot).catch(() => null) : null;
  const swing = planShortSwing({
    symbol: sym, spot: spot ?? 0, sigmaDaily: sig, regime: book?.regime ?? 'neutral', zeroGamma: book?.zeroGamma ?? null,
    callWall: book?.callWall ?? null, putWall: book?.putWall ?? null, maxGamma: book?.maxGamma ?? null,
    flowLean: flow.dayLean ?? flow.lean, nowMs,
  });
  if (!book && spot) swing.wait.unshift('no all-book GEX read for the swing model');

  return {
    symbol: sym,
    optionRoot: sym === 'SPX' ? 'SPXW' : sym,
    owner,
    spot, spotSource: chain?.source ?? null, chainSource: chain?.source ?? null,
    chainAgeSec: chain ? Math.round((nowMs - chain.fetchedAt) / 1000) : null,
    expiry, expectedMove: em, levels, levelsNote, intraday, intradayNote, barsAgeSec, flow,
    engine: { ...state, evaluatedAgeSec: evaluatedAt ? Math.round((nowMs - evaluatedAt) / 1000) : null },
    todaysIdeas: todays.map((r) => ({ ...toRef(r), contract: r.strikePrice ? `${r.symbol} ${r.expiryDate ?? ''} ${r.strikePrice}${r.optionType === 'put' ? 'P' : 'C'}` : null })),
    swing, swingLevels: book, errors,
  };
}

let deskCache: { at: number; p: DeskPayload } | null = null;
let deskInflight: Promise<DeskPayload> | null = null;

export async function getZeroDteDesk(opts: { priority?: boolean } = {}): Promise<DeskPayload> {
  if (deskCache && Date.now() - deskCache.at < DESK_TTL_MS) return deskCache.p;
  if (deskInflight) return deskInflight;
  deskInflight = (async () => {
    const nowMs = Date.now();
    const phase = sessionPhase(nowMs);
    const watch = watchList();
    let ideas: IdeaLite[] = [];
    try { ideas = await engineIdeas(); } catch (e) { logger.warn(`[0DTE-DESK] ideas read failed: ${(e as Error).message}`); }
    const rows: DeskRow[] = [];
    // Sequential: a few names, and the provider queues are serial anyway.
    for (const s of watch) {
      try { rows.push(await buildRow(s, phase, ideas, opts.priority !== false, nowMs)); } catch (e) {
        logger.warn(`[0DTE-DESK] ${s} row failed: ${(e as Error).message}`);
      }
    }
    const recRows: RecordRow[] = ideas.map((r) => ({ timestamp: r.timestamp, direction: r.direction, entryPrice: r.entryPrice, stopLoss: r.stopLoss, exitPrice: r.exitPrice, outcomeStatus: r.outcomeStatus, kind: kindOf(r) }));
    const perName: Record<string, { n: number; wins: number; losses: number; total: number }> = {};
    for (const r of ideas) {
      const k = deskNameOf(r); const e = (perName[k] ??= { n: 0, wins: 0, losses: 0, total: 0 });
      e.total++;
      if (r.outcomeStatus === 'hit_target') { e.wins++; e.n++; } else if (r.outcomeStatus === 'hit_stop') { e.losses++; e.n++; }
    }
    const p: DeskPayload = {
      asOf: new Date(nowMs).toISOString(), watch, phase, rows,
      record: { ...summarizeDeskRecord(recRows, OUTCOME_BASELINE_DATE), perName },
      provenance: ZERO_DTE_PROVENANCE,
      notes: [
        `Every 0DTE idea has a hard time stop at ${TIME_STOP_ET} ET.`,
        zeroDteWallsEnabled() ? 'Same-day-expiry walls are added to policies A/B (desk addition 2026-09-29, not in the pre-registered spec).' : 'Same-day-expiry walls are OFF in the policies (ZERO_DTE_WALLS_IN_POLICY=false).',
        'Sessions-to-expiry count weekdays only; US market holidays are not excluded.',
        'Short swings are model plans (weekly-path drift rule + regime + flow), unvalidated; walk-forward law applies — a short-window win is a regime artefact until proven.',
      ],
    };
    deskCache = { at: Date.now(), p };
    return p;
  })().finally(() => { deskInflight = null; });
  return deskInflight;
}

// ─── producers ───────────────────────────────────────────────────────────

async function selectAccountFit(args: {
  symbol: string; direction: 'long' | 'short'; entry: number; stop: number; target: number; spot: number;
  setup: 'scalp' | 'swing'; expiryTier?: '0DTE' | 'DAILY'; holdingDays: number; allowZeroDte: boolean; applyDteFit: boolean; minRoi: number;
}) {
  const { selectContracts } = await import('./option-selection-engine');
  const maxDebit = Math.max(25, Number(process.env.ZERO_DTE_MAX_DEBIT ?? process.env.INDEX_0DTE_MAX_DEBIT ?? 200));
  const accountSize = Math.max(1_000, Number(process.env.INDEX_0DTE_ACCOUNT_SIZE ?? 10_000));
  const riskBudget = Math.max(25, Number(process.env.INDEX_0DTE_RISK_BUDGET ?? 200));
  const res = await selectContracts({
    symbol: args.symbol, direction: args.direction === 'long' ? 'bullish' : 'bearish', setup: args.setup,
    ...(args.expiryTier ? { expiryTier: args.expiryTier } : {}), allowZeroDte: args.allowZeroDte, applyDteFit: args.applyDteFit,
    entry: args.entry, stop: args.stop, t1: args.target, holdingDays: args.holdingDays, asOfSpot: args.spot,
    accountSize, riskBudgetDollars: riskBudget, maxDebitDollars: maxDebit, minRoiAtT1Pct: args.minRoi,
  } as any);
  const pick = res.picks
    .filter((p) => p.fitsAccount && p.grade !== 'F' && p.entryPremium >= 0.20 && p.entryPremium * 100 <= maxDebit && p.roiAtT1Pct >= args.minRoi && p.riskRewardRatio >= 1)
    .sort((a, b) => b.score - a.score)[0] ?? null;
  return { pick, note: res.note, maxDebit };
}

/** Single-name 0DTE: every watched name the index engine does not own. */
export async function runZeroDteDeskScan(): Promise<{ evaluated: number; published: number; waits: Record<string, string[]> }> {
  const nowMs = Date.now();
  const phase = sessionPhase(nowMs);
  const waits: Record<string, string[]> = {};
  if (!phase.entriesOpen) return { evaluated: 0, published: 0, waits };
  const names = watchList().filter((s) => !INDEX_OWNED.has(s));
  let published = 0; let evaluated = 0;
  const { getGexSnapshot } = await import('./gex-snapshot-service');
  const { getIntradayStructure } = await import('./zero-dte-structure');
  let eventBlock: string | null = null;
  try {
    const { getTodayEvents } = await import('./economic-calendar');
    for (const e of getTodayEvents()) {
      if (e.importance !== 'high') continue;
      const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(e.time ?? '');
      if (!m) continue;
      const mins = ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
      if (Math.abs(phase.etMin - mins) <= 30) { eventBlock = `${e.name} at ${e.time}`; break; }
    }
  } catch { /* calendar unavailable — not a block */ }

  for (const sym of names) {
    try {
      const [snap, st, chain] = await Promise.all([getGexSnapshot(sym), getIntradayStructure(sym), getDeskChain(sym, false)]);
      if (!snap) { waits[sym] = ['no GEX snapshot']; lastEval.set(sym, { at: nowMs, verdict: { setup: null, wait: waits[sym] }, withheld: null }); continue; }
      if (!st) { waits[sym] = ['no intraday bars']; lastEval.set(sym, { at: nowMs, verdict: { setup: null, wait: waits[sym] }, withheld: null }); continue; }
      const today = etDateKey(nowMs);
      const ex = chain ? pickDeskExpiry(chain.expirations, today) : null;
      const bucket = chain && ex?.expiry && ex.sameDay && zeroDteWallsEnabled() ? expiryBucketLevels(sym, chain.rows, snap.spot, ex.expiry) : null;
      const em = chain && ex?.expiry ? expectedMoveFor(chain.rows, snap.spot, ex.expiry, todayFraction(phase.etMin), ex.sessionsAfterToday ?? 0) : null;
      // Index cap 0.6%; a single name scales with its own day: 35% of today's expected move, never below 0.6%.
      const maxRiskPct = Math.max(0.6, em ? 0.35 * em.todayPct : 0.6);
      const verdict = evaluateZeroDte(sym, {
        spot: snap.spot, zeroGamma: snap.flipPoint, callWall: snap.callWall, putWall: snap.putWall,
        sign: snap.netGexSign, fetchedAt: snap.fetchedAt, modelledGrossShare: snap.modelledGrossShare ?? null,
      }, st, nowMs, phase.etMin, eventBlock, { zeroDte: bucket ? { expiry: bucket.expiry, callWall: bucket.callWall, putWall: bucket.putWall, maxGamma: bucket.maxGamma, zeroGamma: bucket.zeroGamma } : null, maxRiskPct });
      evaluated++;
      let withheld: string | null = null;
      if (verdict.setup) {
        const s = verdict.setup;
        const key = `${sym}|${s.policy}|${s.direction}`;
        const last = recentPublishes.get(key);
        if (last && nowMs - last < 30 * 60_000) withheld = 'same policy + side published inside 30 min';
        else {
          const sel = await selectAccountFit({
            symbol: sym, direction: s.direction, entry: s.entry, stop: s.stop, target: s.target, spot: s.entry, setup: 'scalp',
            expiryTier: ex?.sameDay ? '0DTE' : 'DAILY', holdingDays: 0, allowZeroDte: true, applyDteFit: false, minRoi: 50,
          });
          if (!sel.pick) withheld = sel.note ?? 'no account-fit contract';
          else {
            const c = sel.pick;
            const dte = Math.round((Date.parse(`${c.expiry}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5);
            const qty = Math.max(1, Math.min(5, Math.floor(sel.maxDebit / (c.entryPremium * 100))));
            const label = s.policy.startsWith('A') ? 'A · −γ continuation' : s.powerHour ? 'B · +γ power-hour pin' : 'B · +γ wall fade';
            try {
              const { storage } = await import('./storage');
              await storage.createTradeIdea({
                symbol: sym, assetType: 'option', direction: s.direction,
                entryPrice: s.entry, targetPrice: s.target, stopLoss: s.stop, riskRewardRatio: +s.rr.toFixed(2),
                optionType: c.optionType, strikePrice: c.strike, expiryDate: c.expiry, entryPremium: Number(c.entryPremium.toFixed(2)),
                catalyst: `${s.powerHour ? '⚡ POWER HOUR ' : ''}${sym} ${dte <= 0 ? '0DTE' : `${dte}DTE (nearest expiry, held intraday)`} ${s.direction === 'long' ? 'CALLS' : 'PUTS'} — ${label} | ${c.grade} · ${qty}x @ $${c.entryPremium.toFixed(2)}`,
                analysis: `${s.evidence.join(' | ')}. Stop $${s.stop.toFixed(2)}, target $${s.target.toFixed(2)} (${s.rr.toFixed(2)}R on ${sym}); risk cap ${maxRiskPct.toFixed(2)}% (35% of today's expected move). Hard time stop ${TIME_STOP_ET} ET.${dte > 0 ? ` ${sym} lists no same-day expiry — the ${c.expiry} contract is flattened by ${TIME_STOP_ET} ET like a 0DTE.` : ''} Policies were pre-registered for the index; applying them to ${sym} is a desk extension. ${ZERO_DTE_PROVENANCE}`,
                source: DESK_SOURCE, dataSourceUsed: `zero_dte_desk_${s.policy}`,
                sessionContext: s.powerHour ? 'power_hour' : 'intraday', timestamp: new Date(nowMs).toISOString(),
                exitBy: timeStopIso(nowMs), entryValidUntil: new Date(nowMs + 10 * 60_000).toISOString(),
                expiryTier: dte <= 0 ? '0DTE' : 'DAILY', optionDte: Math.max(0, dte), tradeType: 'scalp', outcomeStatus: 'open',
                confidenceScore: 60, holdingPeriod: 'day',
                qualitySignals: [`policy:${s.policy}`, 'validated:false', 'desk:zero_dte', `contract_dte:${dte}`, `time_stop:${TIME_STOP_ET}ET`, bucket ? 'levels:0dte_walls' : '', s.powerHour ? 'power_hour' : ''].filter(Boolean),
              } as any, { dedupWindowHours: 0.5 });
              recentPublishes.set(key, nowMs); published++; ideasCache = null; deskCache = null;
              logger.info(`[0DTE-DESK] ✅ ${sym} ${label} ${s.direction} → ${c.optionType} ${c.strike} ${c.expiry} @ $${c.entryPremium.toFixed(2)}`);
            } catch (e) { withheld = `write gate: ${(e as Error).message}`; }
          }
        }
        if (withheld) logger.info(`[0DTE-DESK] ${sym} ${s.policy} ${s.direction} withheld: ${withheld}`);
      }
      waits[sym] = verdict.setup ? [withheld ? `triggered, withheld: ${withheld}` : 'published'] : verdict.wait;
      lastEval.set(sym, { at: nowMs, verdict, withheld });
    } catch (e) {
      waits[sym] = [`scan failed: ${(e as Error).message}`];
    }
  }
  logger.info(`[0DTE-DESK] ${phase.label}: ${evaluated} evaluated, ${published} published · ${Object.entries(waits).map(([k, w]) => `${k}: ${w[0] ?? '—'}`).join(' · ')}`);
  return { evaluated, published, waits };
}

/** 2–4 day swings for every watched name (SPX expressed on SPX first, SPY as the account-fit fallback). */
export async function runShortSwingPublish(): Promise<number> {
  const nowMs = Date.now();
  const phase = sessionPhase(nowMs);
  if (phase.id !== 'midday' && phase.id !== 'power_hour') return 0;
  const desk = await getZeroDteDesk({ priority: false });
  const { storage } = await import('./storage');
  let n = 0;
  for (const row of desk.rows) {
    const p = row.swing;
    if (p.verdict !== 'plan' || !p.direction || p.stop == null || p.target == null || !row.spot) continue;
    const key = `swing|${row.symbol}|${p.direction}`;
    const last = recentPublishes.get(key);
    if (last && nowMs - last < 20 * 3600_000) continue;
    const vehicles: Array<{ symbol: string; scale: number }> = [{ symbol: row.symbol, scale: 1 }];
    if (row.symbol === 'SPX') {
      const { getIntradayStructure } = await import('./zero-dte-structure');
      const spy = await getIntradayStructure('SPY');
      if (spy?.lastClose) vehicles.push({ symbol: 'SPY', scale: spy.lastClose / row.spot });
    }
    let chosen: { v: { symbol: string; scale: number }; c: any } | null = null; let note: string | null = null;
    for (const v of vehicles) {
      const sel = await selectAccountFit({
        symbol: v.symbol, direction: p.direction, entry: p.entry * v.scale, stop: p.stop * v.scale, target: p.target * v.scale, spot: row.spot * v.scale,
        setup: 'swing', holdingDays: p.holdDays, allowZeroDte: false, applyDteFit: true, minRoi: 20,
      });
      if (sel.pick) { chosen = { v, c: sel.pick }; break; }
      note = sel.note ?? null;
    }
    if (!chosen) { logger.info(`[0DTE-DESK] swing ${row.symbol} ${p.direction} withheld: ${note ?? 'no contract in the 30–60 DTE window fit the limits'}`); continue; }
    const { v, c } = chosen;
    try {
      await storage.createTradeIdea({
        symbol: v.symbol, assetType: 'option', direction: p.direction,
        entryPrice: p.entry * v.scale, targetPrice: p.target * v.scale, stopLoss: p.stop * v.scale, riskRewardRatio: +(p.rr ?? 0).toFixed(2),
        optionType: c.optionType, strikePrice: c.strike, expiryDate: c.expiry, entryPremium: Number(c.entryPremium.toFixed(2)),
        catalyst: `${v.symbol} ${p.holdDays}-day swing ${p.direction === 'long' ? 'CALLS' : 'PUTS'} — ${row.swingLevels?.regime ?? ''} gamma, weekly-path model · ${c.expiry} (${c.dte}DTE)`,
        analysis: `${p.basis.join(' | ')}.${v.symbol !== row.symbol ? ` Thesis measured on ${row.symbol}; account-fit contract on ${v.symbol}.` : ''} Contract window ${p.dteWindow.label}. Unvalidated model plan; walk-forward law applies.`,
        source: DESK_SOURCE, dataSourceUsed: 'zero_dte_desk_swing', timestamp: new Date(nowMs).toISOString(),
        exitBy: p.exitByIso, holdingPeriod: 'swing', tradeType: 'swing', outcomeStatus: 'open', confidenceScore: 55,
        qualitySignals: ['desk:short_swing', 'validated:false', `hold_days:${p.holdDays}`, p.capped ? 'target_capped_1sigma' : '', `time_stop:${p.timeStopIso}`, `contract_dte:${c.dte}`, `vehicle:${v.symbol}`].filter(Boolean),
      } as any, { dedupWindowHours: 20 });
      recentPublishes.set(key, nowMs); n++; ideasCache = null; deskCache = null;
      logger.info(`[0DTE-DESK] ✅ swing ${v.symbol} ${p.direction} ${c.optionType} ${c.strike} ${c.expiry}`);
    } catch (e) {
      logger.info(`[0DTE-DESK] swing ${row.symbol} not written: ${(e as Error).message}`);
    }
  }
  return n;
}

// ─── routes ──────────────────────────────────────────────────────────────

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
export function registerZeroDteDeskRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/zero-dte/desk', requireBetaAccess, async (_req, res) => {
    try {
      res.json(await getZeroDteDesk({ priority: true }));
    } catch (err) {
      logger.error('[0DTE-DESK] desk failed', { error: (err as Error)?.message });
      res.status(500).json({ error: '0DTE desk failed', message: (err as Error)?.message });
    }
  });
}

