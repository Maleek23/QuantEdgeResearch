/**
 * 0DTE DESK — the NEXUS "0DTE" view, its dashboard tool, the single-name 0DTE
 * producer and the 2–4 day swing producer.
 * ============================================================================
 *   GET /api/zero-dte/desk      the 0DTE IDEAS list (actionable first) + one row
 *                               per tracked name (ZERO_DTE_WATCH, default SPX,
 *                               MSTR, META, BE, TSLA) + the session clock + short
 *                               swings + this engine's honest record.
 *   runZeroDteDeskScan()        EVERY watched name each pass: WATCH ideas (setups
 *                               forming, server/zero-dte-ideas-core.ts) with their
 *                               contract, and — for the single names — the same
 *                               pre-registered policies A/B/C
 *                               (server/zero-dte-policies.ts) on the name's own
 *                               levels; a TRIGGERED setup with a contract inside
 *                               the caps is logged to trade_ideas (source
 *                               'zero_dte_desk') so the outcome tracker resolves
 *                               it, and raises an in-app alert. SPX is logged by
 *                               the index engine (server/index-scalp-engine.ts:
 *                               SPY GEX → SPX, SPY as the account-fit fallback) —
 *                               one owner per name, never two engines logging the
 *                               same call; the desk shows its SPX ideas.
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
import { readShared, sharedStamp, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { tradeIdeas } from '@shared/schema';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import { realizedVolDaily } from '@shared/loss-rules';
import {
  armedReads, deskEngineState, etDateKey, expectedMoveFor, expiryBucketLevels, intradayRead, parseWatch,
  pickDeskExpiry, planShortSwing, sessionPhase, summarizeDeskRecord, todayFraction,
  type BucketLevels, type DeskChainRow, type DeskIdeaRef, type DeskExpiry, type DeskRecord, type EngineState, type ExpectedMove,
  type IntradayRead, type RecordRow, type SessionPhase, type SwingPlan,
} from './zero-dte-desk-core';
import { evaluateZeroDte, timeStopIso, zeroDteWallsEnabled, ZERO_DTE_PROVENANCE, TIME_STOP_ET, type PolicyVerdict, type ZeroDteSetup } from './zero-dte-policies';
import { BoundedCache } from './lib/bounded-cache';
import {
  capsFor, ENTRY_WINDOW_MIN, ideaStage, KIND_LABEL, kindForSetup, occSymbol, pickIdeaContract, sortIdeas, watchSetups, zeroDteEligibility,
  type Eligibility, type IdeaContract, type IdeaStage, type SetupKind, type WatchSetup,
} from './zero-dte-ideas-core';

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
const chainCache = new BoundedCache<string, { at: number; c: DeskChain | null }>({ name: '0dte.deskChains', maxEntries: 30, ttlMs: 30 * 60_000, maxBytes: 32 * 1024 * 1024 });

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
  entryValidUntil: string | null; exitBy: string | null; entryPremium: number | null; analysis: string | null; catalyst: string | null;
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
    entryValidUntil: tradeIdeas.entryValidUntil, exitBy: tradeIdeas.exitBy, entryPremium: tradeIdeas.entryPremium,
    analysis: tradeIdeas.analysis, catalyst: tradeIdeas.catalyst,
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
  /** 0DTE ideas, actionable first: TRIGGERED → IN PLAY → WATCH (closest to trigger) → DONE. */
  ideas: DeskIdea[];
  ideasInfo: IdeasInfo;
  record: DeskRecord & { perName: Record<string, { n: number; wins: number; losses: number; total: number }> };
  provenance: string;
  /** ROLE=web: age of the worker's last evaluation pass. */
  engineState?: { source: string; asOf: string | null; ageSec: number | null; stale: boolean };
  notes: string[];
}

/**
 * All-book levels for the swing plan: expiries ≤ 60 days, strikes ±25% (±10%
 * for SPX, whose chain is ~30k contracts). Bounded CPU on the 1-vCPU droplet
 * and computed once per chain fetch (cached with the chain's fetchedAt).
 */
const bookCache = new Map<string, { fetchedAt: number; v: SwingBook | null }>();
type SwingBook = { regime: 'positive' | 'negative' | 'neutral'; zeroGamma: number | null; callWall: number | null; putWall: number | null; maxGamma: number | null; basis: string };
async function swingBookLevels(sym: string, chain: DeskChain): Promise<SwingBook | null> {
  const hit = bookCache.get(sym);
  if (hit && hit.fetchedAt === chain.fetchedAt) return hit.v;
  const spot = chain.spot;
  const band = sym === 'SPX' ? 0.10 : 0.25;
  const maxKey = etDateKey(Date.now() + 60 * 864e5);
  const today = etDateKey(Date.now());
  const rows = chain.rows.filter((r) => r.expiration_date >= today && r.expiration_date <= maxKey && r.strike >= spot * (1 - band) && r.strike <= spot * (1 + band));
  const { computeExposures, optionToInput } = await import('./options-exposures');
  const ins = rows.map((r) => optionToInput(r, r.expiration_date)).filter((x): x is NonNullable<typeof x> => !!x && x.openInterest > 0);
  let v: SwingBook | null = null;
  if (ins.length >= 10) {
    const s = computeExposures(sym, spot, ins, [...new Set(rows.map((r) => r.expiration_date))]);
    v = { regime: s.regimeRead.regime, zeroGamma: s.zeroGammaLevel, callWall: s.callWall, putWall: s.putWall, maxGamma: s.maxGammaStrike || null, basis: `${s.regimeRead.basis} · book = expiries ≤60d, strikes ±${Math.round(band * 100)}%` };
  }
  bookCache.set(sym, { fetchedAt: chain.fetchedAt, v });
  return v;
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
  const book = chain && spot ? await swingBookLevels(sym, chain).catch(() => null) : null;
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

// ─── 0DTE ideas on the wire ──────────────────────────────────────────────

export interface IdeaQuote { bid: number | null; ask: number | null; mid: number | null; at: string | null; source: string }

export interface DeskIdea {
  key: string;
  symbol: string;
  stage: IdeaStage;
  doneReason: string | null;
  direction: 'long' | 'short';
  side: 'CALLS' | 'PUTS';
  kind: SetupKind | null;
  kindLabel: string;
  policy: 'A' | 'B' | null;
  trigger: { name: string; price: number } | null;
  triggerText: string;
  entry: number;
  stop: number;
  target: { name: string; price: number };
  target2: { name: string; price: number } | null;
  rr: number | null;
  /** Underlying price the idea is measured against, with its stamp. */
  price: number | null;
  priceAt: string | null;
  distPct: number | null;
  expiryLabel: string;
  contract: {
    occ: string; root: string; optionType: 'call' | 'put'; strike: number; expiry: string; dte: number | null;
    delta: number | null; openInterest: number | null; spreadPct: number | null;
    qty: number | null; riskDollars: number | null; debitDollars: number | null;
    premiumStop: number | null; premiumT1: number | null; premiumT2: number | null; basis: string | null;
  } | null;
  /** Repriced at desk build — never older than its own stamp. */
  quote: IdeaQuote | null;
  loggedPremium: number | null;
  contractNote: string | null;
  vehicle: string;
  entryBy: string | null;
  exitBy: string;
  why: string;
  grade: 'A' | 'B' | 'C' | null;
  gradeWhy: string[];
  /** First seen (WATCH) or logged (TRIGGERED onwards). */
  at: string;
  ideaId: string | null;
  logged: boolean;
  loggedNote: string | null;
  /** SPX mirror of an SPY contract (display only — the record stays on the SPY idea). */
  spxMirror?: import('@shared/spx-mirror').SpxMirror | null;
}

export interface IdeasInfo {
  evaluated: Record<string, { at: string | null; eligibility: string; notes: string[] }>;
  noZeroDte: Array<{ symbol: string; label: string }>;
  cadence: string;
  caps: Record<string, string>;
  honesty: string;
}

const qs = (r: IdeaLite, prefix: string) => (r.qualitySignals ?? []).find((s) => s.startsWith(prefix))?.slice(prefix.length) ?? null;
const qn = (r: IdeaLite, prefix: string) => { const v = Number(qs(r, prefix)); return Number.isFinite(v) && v > 0 ? v : null; };
const hhmmEt = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : null);

const quoteCache = new BoundedCache<string, { at: number; q: IdeaQuote | null }>({ name: '0dte.quotes', maxEntries: 500, ttlMs: 30 * 60_000, noSizing: true });
/** Reprice one contract: Alpaca (chain cache first, else one snapshot) for equity roots; the desk's CBOE chain (delayed) for SPXW. */
async function repriceContract(c: { occ: string; root: string; optionType: 'call' | 'put'; strike: number; expiry: string }, priority: boolean): Promise<IdeaQuote | null> {
  const hit = quoteCache.get(c.occ);
  if (hit && Date.now() - hit.at < 20_000) return hit.q;
  let q: IdeaQuote | null = null;
  try {
    if (c.root === 'SPXW' || c.root === 'SPX') {
      const ch = await getDeskChain('SPX', priority);
      const row = ch?.rows.find((r) => r.expiration_date === c.expiry && r.option_type === c.optionType && r.strike === c.strike);
      if (row && ch) {
        const b = Number(row.bid); const a = Number(row.ask);
        q = { bid: b > 0 ? b : null, ask: a > 0 ? a : null, mid: b > 0 && a >= b ? (a + b) / 2 : null, at: new Date(ch.fetchedAt).toISOString(), source: ch.source };
      }
    } else {
      const ap = await import('./alpaca-options');
      const r = await withTimeout(priority ? ap.withAlpacaPriority(() => ap.getAlpacaContractQuote(c.occ)) : ap.getAlpacaContractQuote(c.occ), 6000);
      if (r) q = { bid: r.bid, ask: r.ask, mid: r.bid != null && r.ask != null && r.ask >= r.bid && r.bid > 0 ? (r.bid + r.ask) / 2 : null, at: r.quoteTime, source: `Alpaca indicative${r.via === 'chain_cache' ? ' (chain)' : ''}` };
    }
  } catch { /* shown as "no quote" */ }
  quoteCache.set(c.occ, { at: Date.now(), q });
  return q;
}

async function assembleIdeas(watch: string[], rows: DeskRow[], ideas: IdeaLite[], nowMs: number, priority: boolean): Promise<{ ideas: DeskIdea[]; info: IdeasInfo }> {
  const today = etDateKey(nowMs);
  const out: DeskIdea[] = [];
  const info: IdeasInfo = {
    evaluated: {}, noZeroDte: [],
    cadence: 'every watched name is evaluated every 5 min 09:45–15:00 ET and every 2 min in power hour (to 15:45); nothing new after 15:45, everything flat by 15:55',
    caps: Object.fromEntries(watch.map((s) => [s, capsFor(s).basis])),
    honesty: 'Model ideas from a pre-registered, UNVALIDATED policy family (5-observation pilot). Walk-forward law: a short-window win is a regime artefact until proven. Grade = structure count, not a probability. Research only — not a recommendation to buy or sell; 0DTE options can lose their full value within minutes.',
  };
  const { getIntradayStructure } = await import('./zero-dte-structure');
  const spy = watch.includes('SPX') ? await getIntradayStructure('SPY').catch(() => null) : null;

  for (const sym of watch) {
    const row = rows.find((r) => r.symbol === sym);
    const elig = row ? zeroDteEligibility(row.expiry) : { ok: false, dte: null, label: 'no desk row', reason: 'desk row failed' };
    const memo = ideaEval.get(sym);
    const fresh = memo && memo.day === today && nowMs - memo.at < 15 * 60_000 ? memo : null;
    info.evaluated[sym] = { at: memo && memo.day === today ? new Date(memo.at).toISOString() : null, eligibility: elig.label, notes: fresh?.notes.slice(0, 3) ?? [] };
    if (!elig.ok) info.noZeroDte.push({ symbol: sym, label: elig.label });
    const live = row?.intraday.lastClose ?? row?.spot ?? null;
    const liveAt = row?.barsAgeSec != null ? new Date(nowMs - row.barsAgeSec * 1000).toISOString() : null;

    // Logged ideas (TRIGGERED → IN PLAY → DONE): this desk's + the index engine's for SPX.
    const logged = ideas.filter((r) => deskNameOf(r) === sym && kindOf(r) === '0dte' && etDateKey(Date.parse(r.timestamp)) === today);
    const activeSides = new Set<string>();
    for (const r of logged) {
      const dir: 'long' | 'short' = r.direction === 'short' ? 'short' : 'long';
      const vehicle = r.symbol;
      const px = vehicle === sym ? live : vehicle === 'SPY' ? spy?.lastClose ?? null : null;
      const st = ideaStage({ direction: dir, stop: r.stopLoss, target: r.targetPrice, timestamp: r.timestamp, entryValidUntil: r.entryValidUntil, exitBy: r.exitBy, outcomeStatus: r.outcomeStatus, resolutionReason: r.resolutionReason }, nowMs, px);
      if (st.stage !== 'done') activeSides.add(dir);
      const policy = String(r.dataSourceUsed ?? '').includes('_A_') ? 'A' : String(r.dataSourceUsed ?? '').includes('_B_') ? 'B' : null;
      const kind = (qs(r, 'kind:') as SetupKind | null) ?? null;
      const trig = qs(r, 'trigger:');
      const trigger = trig ? { name: trig.split('@')[0], price: Number(trig.split('@')[1]) } : null;
      const root = r.symbol === 'SPX' ? 'SPXW' : r.symbol;
      const contract = r.strikePrice && r.expiryDate && r.optionType ? {
        occ: occSymbol(root, r.expiryDate, r.optionType === 'put' ? 'put' : 'call', r.strikePrice), root, optionType: (r.optionType === 'put' ? 'put' : 'call') as 'call' | 'put',
        strike: r.strikePrice, expiry: r.expiryDate, dte: Math.round((Date.parse(`${r.expiryDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5),
        delta: null, openInterest: null, spreadPct: null, qty: qn(r, 'qty:') ?? qn(r, 'package_qty:'), riskDollars: qn(r, 'risk_usd:'), debitDollars: qn(r, 'package_debit:'),
        premiumStop: qn(r, 'prem_stop:'), premiumT1: qn(r, 'prem_t1:'), premiumT2: null, basis: null,
      } : null;
      out.push({
        key: `logged|${r.id}`, symbol: sym, stage: st.stage, doneReason: st.doneReason, direction: dir, side: dir === 'long' ? 'CALLS' : 'PUTS',
        kind, kindLabel: kind ? KIND_LABEL[kind] : policy === 'A' ? 'A · −γ continuation' : policy === 'B' ? 'B · +γ wall fade / pin' : 'index 0DTE',
        policy, trigger, triggerText: trigger ? `fired: ${trigger.name} $${trigger.price.toFixed(2)} at ${hhmmEt(r.timestamp)} ET` : `fired at ${hhmmEt(r.timestamp)} ET`,
        entry: r.entryPrice, stop: r.stopLoss, target: { name: qs(r, 'target_level:') ?? 'T1', price: r.targetPrice }, target2: null,
        rr: Math.abs(r.entryPrice - r.stopLoss) > 0 ? Math.abs(r.targetPrice - r.entryPrice) / Math.abs(r.entryPrice - r.stopLoss) : null,
        price: px, priceAt: px != null ? liveAt : null, distPct: null,
        expiryLabel: contract ? (contract.dte != null && contract.dte <= 0 ? '0DTE' : `${contract.dte}DTE`) : elig.label,
        contract, quote: null, loggedPremium: r.entryPremium, contractNote: vehicle !== sym ? `logged on ${vehicle} (account-fit vehicle); thesis measured on ${sym}` : null, vehicle,
        entryBy: hhmmEt(r.entryValidUntil), exitBy: TIME_STOP_ET, why: String(r.analysis ?? r.catalyst ?? '').split(' | ')[0].slice(0, 200),
        grade: null, gradeWhy: [], at: r.timestamp, ideaId: r.id, logged: true, loggedNote: null,
      });
    }
    if (!fresh || !elig.ok) continue;

    // Fired but not logged (no contract inside the caps / dedup / write gate).
    if (fresh.withheld && !activeSides.has(fresh.withheld.setup.direction)) {
      const s = fresh.withheld.setup;
      activeSides.add(s.direction);
      out.push({
        key: `withheld|${sym}|${s.policy}|${s.direction}`, symbol: sym, stage: nowMs - fresh.withheld.at < ENTRY_WINDOW_MIN * 60_000 ? 'triggered' : 'done',
        doneReason: nowMs - fresh.withheld.at < ENTRY_WINDOW_MIN * 60_000 ? null : 'entry window passed (never logged)',
        direction: s.direction, side: s.direction === 'long' ? 'CALLS' : 'PUTS', kind: fresh.withheld.kind, kindLabel: KIND_LABEL[fresh.withheld.kind],
        policy: s.policy.startsWith('A') ? 'A' : 'B', trigger: s.trigger, triggerText: `fired: ${s.trigger.name} $${s.trigger.price.toFixed(2)}`,
        entry: s.entry, stop: s.stop, target: s.targetLevel, target2: null, rr: s.rr, price: fresh.price, priceAt: fresh.priceAt ? new Date(fresh.priceAt).toISOString() : null, distPct: null,
        expiryLabel: elig.label, contract: null, quote: null, loggedPremium: null, contractNote: null, vehicle: sym,
        entryBy: null, exitBy: TIME_STOP_ET, why: s.evidence[0] ?? '', grade: null, gradeWhy: [], at: new Date(fresh.withheld.at).toISOString(),
        ideaId: null, logged: false, loggedNote: `not logged: ${fresh.withheld.reason}`,
      });
    }

    // WATCH — forming setups, minus any side already triggered / in play.
    for (const w of fresh.watch) {
      if (activeSides.has(w.direction)) continue;
      const c = w.contract;
      out.push({
        key: w.key, symbol: sym, stage: 'watch', doneReason: null, direction: w.direction, side: w.direction === 'long' ? 'CALLS' : 'PUTS',
        kind: w.kind, kindLabel: KIND_LABEL[w.kind], policy: w.policy, trigger: w.trigger, triggerText: w.triggerText,
        entry: w.entry, stop: w.stop, target: w.target, target2: w.target2, rr: w.rr,
        price: live ?? fresh.price, priceAt: live != null ? liveAt : fresh.priceAt ? new Date(fresh.priceAt).toISOString() : null,
        distPct: live != null && live > 0 ? Math.abs(w.trigger.price - live) / live * 100 : w.distPct,
        expiryLabel: elig.label,
        contract: c ? { occ: c.occ, root: c.root, optionType: c.optionType, strike: c.strike, expiry: c.expiry, dte: elig.dte, delta: c.delta, openInterest: c.openInterest, spreadPct: c.spreadPct, qty: c.qty, riskDollars: c.riskDollars, debitDollars: c.debitDollars, premiumStop: c.premiumStop, premiumT1: c.premiumT1, premiumT2: c.premiumT2, basis: c.basis } : null,
        quote: c ? { bid: c.bid, ask: c.ask, mid: c.mid, at: w.chainFetchedAt ? new Date(w.chainFetchedAt).toISOString() : null, source: w.chainSource ?? 'chain' } : null,
        loggedPremium: null, contractNote: w.note, vehicle: w.vehicle, entryBy: w.entryBy, exitBy: w.exitBy, why: w.why, grade: w.grade, gradeWhy: w.gradeWhy,
        at: new Date(w.firstSeen).toISOString(), ideaId: null, logged: false, loggedNote: 'WATCH is not logged — nothing is entered until the trigger prints',
      });
    }
  }

  // Reprice every live contract (the quote shown is stamped with its own time).
  await Promise.all(out.filter((x) => x.stage !== 'done' && x.contract).slice(0, 10).map(async (x) => {
    const q = await repriceContract(x.contract!, priority);
    if (q && (q.bid != null || q.ask != null)) x.quote = q;
  }));

  // SPX mirror for SPY contracts (logged index ideas + SPY WATCH): SPXW strike,
  // CBOE-delayed premium, levels × live ratio. Bounded; never fails the desk.
  try {
    const { spxMirrorEnabled, computeSpxMirrors } = await import('./spx-mirror');
    const live = out.filter((x) => x.stage !== 'done' && x.contract?.root === 'SPY' && x.contract.dte != null && x.contract.dte >= 0 && x.contract.dte <= 2);
    // Logged rows carry their vehicle's (SPY) units; WATCH rows carry the name's own (an SPX WATCH is already in SPX).
    const inSpy = (x: DeskIdea) => (x.logged ? x.vehicle === 'SPY' : x.symbol === 'SPY');
    if (spxMirrorEnabled() && live.length) {
      const m = await computeSpxMirrors(live.map((x) => ({
        key: `desk|${x.key}|${x.contract!.strike}|${x.contract!.expiry}`, optionType: x.contract!.optionType, strike: x.contract!.strike, expiry: x.contract!.expiry,
        dte: x.contract!.dte, entry: inSpy(x) ? (x.trigger?.price ?? x.entry) : null, stop: inSpy(x) ? x.stop : null,
        targets: inSpy(x) ? [x.target.price, x.target2?.price] : [],
      })));
      for (const x of live) x.spxMirror = m.get(`desk|${x.key}|${x.contract!.strike}|${x.contract!.expiry}`) ?? null;
    }
  } catch (e) { logger.warn(`[0DTE-DESK] SPX mirror skipped: ${(e as Error).message}`); }
  return { ideas: sortIdeas(out), info };
}

let deskCache: { at: number; p: DeskPayload } | null = null;
let deskInflight: Promise<DeskPayload> | null = null;

// Split deployment: the worker's producer passes (runZeroDteDeskScan) publish
// the per-name evaluation memos; the web desk adopts them (ROLE=web only).
const DESK_SHARED = 'zero-dte-eval';
let deskHydratedAt = 0;
let engineStamp: ReturnType<typeof sharedStamp> | null = null;
function hydrateDeskEval(): void {
  if (!readsSharedState()) return;
  const r = readShared<{ lastEval: Array<[string, EvalMemo]>; ideaEval: Array<[string, IdeaEval]> }>(DESK_SHARED, 10 * 60_000);
  engineStamp = sharedStamp(r);
  if (!r || r.writtenAtMs <= deskHydratedAt) return;
  deskHydratedAt = r.writtenAtMs;
  lastEval.clear(); for (const [k, v] of r.data.lastEval ?? []) lastEval.set(k, v);
  ideaEval.clear(); for (const [k, v] of r.data.ideaEval ?? []) ideaEval.set(k, v);
  deskCache = null;
}

export async function getZeroDteDesk(opts: { priority?: boolean } = {}): Promise<DeskPayload> {
  hydrateDeskEval();
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
      try {
        const row = await buildRow(s, phase, ideas, opts.priority !== false, nowMs);
        rows.push(row);
        // SPX has no Alpaca chain; when CBOE fails too, show SPY (Alpaca) so the
        // index lane never goes dark. SPY is its own row with its own prices —
        // nothing is rescaled or relabelled as SPX.
        if (s === 'SPX' && !row.chainSource && !watch.includes('SPY')) {
          const spy = await buildRow('SPY', phase, ideas, opts.priority !== false, nowMs);
          spy.intradayNote = `Stand-in for SPX — the SPX chain is unavailable right now (${row.errors[0] ?? 'no chain'}).${spy.intradayNote ? ' ' + spy.intradayNote : ''}`;
          rows.push(spy);
        }
      } catch (e) {
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
    let assembled: { ideas: DeskIdea[]; info: IdeasInfo } = { ideas: [], info: { evaluated: {}, noZeroDte: [], cadence: '', caps: {}, honesty: '' } };
    try { assembled = await assembleIdeas(watch, rows, ideas, nowMs, opts.priority !== false); } catch (e) { logger.warn(`[0DTE-DESK] ideas failed: ${(e as Error).message}`); }
    // Sector-ignition intraday vehicles join the list as WATCH first (server/sector-ignition.ts).
    const ign = await ignitionIdeas(nowMs);
    if (ign.length) assembled = { ...assembled, ideas: sortIdeas([...assembled.ideas, ...ign.filter((x) => !assembled.ideas.some((y) => y.symbol === x.symbol && y.direction === x.direction && y.stage !== 'done'))]) };
    const p: DeskPayload = {
      asOf: new Date(nowMs).toISOString(), watch, phase, rows, ideas: assembled.ideas, ideasInfo: assembled.info,
      record: { ...summarizeDeskRecord(recRows, OUTCOME_BASELINE_DATE), perName },
      provenance: ZERO_DTE_PROVENANCE,
      ...(engineStamp ? { engineState: engineStamp } : {}),
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

/**
 * The desk's own 0DTE contract picker for a name outside ZERO_DTE_WATCH (used by
 * server/sector-ignition.ts for intraday ignition vehicles): same chain source,
 * same ≤ 2-DTE eligibility, same liquidity gates and $ caps as the desk ideas.
 */
export async function pickZeroDteContractFor(sym: string, direction: 'long' | 'short', entry: number, stop: number, target: number, target2: number | null): Promise<{ contract: IdeaContract | null; note: string | null; expiry: string | null }> {
  const chain = await getDeskChain(sym.toUpperCase(), false);
  if (!chain) return { contract: null, note: 'no option chain', expiry: null };
  const ex = pickDeskExpiry(chain.expirations, etDateKey(Date.now()));
  const elig = zeroDteEligibility(ex);
  if (!elig.ok || !ex.expiry) return { contract: null, note: `no 0–2 DTE expiry (${elig.label})`, expiry: ex.expiry ?? null };
  const r = await contractFor(sym.toUpperCase(), chain, ex.expiry, { direction, entry, stop, target, target2 }, null);
  return { contract: r.contract, note: r.note, expiry: ex.expiry };
}

/** Sector-ignition intraday WATCH/published rows, shaped as desk ideas (they sort with the desk's own). */
async function ignitionIdeas(nowMs: number): Promise<DeskIdea[]> {
  try {
    const { getIgnitionDeskWatch } = await import('./sector-ignition');
    return getIgnitionDeskWatch(nowMs).filter((w) => w.status !== 'withheld' || nowMs - Date.parse(w.firstSeen) < 30 * 60_000).map((w): DeskIdea => {
      const c = w.contract as IdeaContract | null;
      return {
        key: `ignition|${w.key}`, symbol: w.symbol, stage: w.status === 'published' ? 'triggered' : 'watch', doneReason: null,
        direction: w.side, side: w.side === 'long' ? 'CALLS' : 'PUTS', kind: null, kindLabel: `Sector ignition · ${w.groupLabel}`, policy: null,
        trigger: w.trigger, triggerText: w.triggerText, entry: w.entry ?? 0, stop: w.stop ?? 0,
        target: { name: w.t1Basis ?? 'T1', price: w.t1 ?? 0 }, target2: w.t2 != null ? { name: 'T2', price: w.t2 } : null, rr: w.rr,
        price: w.price, priceAt: w.priceAt, distPct: w.price && w.trigger ? Math.abs(w.trigger.price - w.price) / w.price * 100 : null,
        expiryLabel: c ? `${c.expiry}` : 'no 0DTE contract',
        contract: c ? { occ: c.occ, root: c.root, optionType: c.optionType, strike: c.strike, expiry: c.expiry, dte: null, delta: c.delta, openInterest: c.openInterest, spreadPct: c.spreadPct, qty: c.qty, riskDollars: c.riskDollars, debitDollars: c.debitDollars, premiumStop: c.premiumStop, premiumT1: c.premiumT1, premiumT2: c.premiumT2, basis: c.basis } : null,
        quote: c ? { bid: c.bid, ask: c.ask, mid: c.mid, at: w.firstSeen, source: 'chain at WATCH time' } : null,
        loggedPremium: null, contractNote: w.contractNote ?? w.note, vehicle: w.symbol, entryBy: null, exitBy: TIME_STOP_ET,
        why: `${w.why} · measuring (sector ignition, unvalidated)`, grade: null, gradeWhy: [], at: w.firstSeen,
        ideaId: w.ideaId, logged: w.status === 'published', loggedNote: w.status === 'published' ? 'logged by sector ignition' : w.note ?? 'WATCH is not logged — nothing is entered until the trigger prints',
      };
    });
  } catch { return []; }
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

// ─── 0DTE ideas: evaluation memo (one per watched name, per producer pass) ──

interface IdeaEvalContract { contract: IdeaContract | null; note: string | null; vehicle: string; chainSource: string | null; chainFetchedAt: number | null }
interface IdeaEval {
  at: number;
  day: string;
  eligibility: Eligibility;
  expiry: string | null;
  /** Price the setups were read on (the name's own units; SPX = SPY × live ratio). */
  price: number | null;
  priceAt: number | null;
  watch: Array<WatchSetup & IdeaEvalContract & { firstSeen: number }>;
  /** A policy setup that fired this pass but was NOT logged (no contract inside the caps, dedup, write gate). */
  withheld: { setup: ZeroDteSetup; kind: SetupKind; reason: string; at: number } | null;
  notes: string[];
}
const ideaEval = new Map<string, IdeaEval>();
/** First time each WATCH key was seen today — the idea's age. */
const firstSeen = new Map<string, number>();

async function notifyTriggered(line: string, ev: { symbol: string; optionType: 'call' | 'put'; strike: number; expiry: string; price: number; qty: number; ideaId?: string }): Promise<void> {
  // Existing in-app paths only: the shell's pulse feed + the /ws/bot event stream.
  try { const { pulse } = await import('./system-pulse'); pulse('alert', line); } catch { /* decoration */ }
  import('./bot-notification-service')
    .then(({ broadcastBotEvent }) => broadcastBotEvent({ eventType: 'signal', source: 'zero_dte_desk', symbol: ev.symbol, optionType: ev.optionType, strike: ev.strike, expiry: ev.expiry, price: ev.price, quantity: ev.qty, reason: line, ideaId: ev.ideaId, portfolio: 'small_account' }))
    .catch(() => { /* no socket server in this process */ });
  // Operator relay (the existing QuantFloor webhook) — opt-in, the web process publishes only by default.
  if (process.env.ZERO_DTE_DISCORD === '1') {
    import('./discord-service').then(({ sendDiscordAlert }) => sendDiscordAlert(line, 'info')).catch(() => { /* relay optional */ });
  }
}

async function highImpactEventNear(etMin: number): Promise<string | null> {
  try {
    const { getTodayEvents } = await import('./economic-calendar');
    for (const e of getTodayEvents()) {
      if (e.importance !== 'high') continue;
      const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(e.time ?? '');
      if (!m) continue;
      const mins = ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
      if (Math.abs(etMin - mins) <= 30) return `${e.name} at ${e.time}`;
    }
  } catch { /* calendar unavailable — not a block */ }
  return null;
}

/** The contract for a setup: the name's own chain on the eligible expiry; SPX falls back to SPY (account fit), like the index engine. */
async function contractFor(sym: string, chain: DeskChain | null, expiry: string, s: { direction: 'long' | 'short'; entry: number; stop: number; target: number; target2?: number | null }, spxPerSpy: number | null): Promise<IdeaEvalContract> {
  const caps = capsFor(sym);
  const root = sym === 'SPX' ? 'SPXW' : sym;
  let note: string | null = chain ? null : 'no option chain';
  if (chain) {
    const r = pickIdeaContract({ rows: chain.rows, root, expiry, ...s, ...caps });
    if (r.contract) return { contract: r.contract, note: null, vehicle: sym, chainSource: chain.source, chainFetchedAt: chain.fetchedAt };
    note = r.reason;
  }
  if (sym === 'SPX' && spxPerSpy && spxPerSpy > 0) {
    const spy = await getDeskChain('SPY', false);
    if (spy) {
      const k = 1 / spxPerSpy;
      const ex = pickDeskExpiry(spy.expirations, etDateKey(Date.now()));
      if (ex.expiry === expiry) {
        const r = pickIdeaContract({ rows: spy.rows, root: 'SPY', expiry, direction: s.direction, entry: s.entry * k, stop: s.stop * k, target: s.target * k, target2: s.target2 != null ? s.target2 * k : null, ...capsFor('SPY') });
        if (r.contract) return { contract: r.contract, note: `SPXW: ${note ?? 'no fit'} — SPY is the account-fit vehicle (levels ÷ ${spxPerSpy.toFixed(3)})`, vehicle: 'SPY', chainSource: spy.source, chainFetchedAt: spy.fetchedAt };
        note = `${note ?? ''}; SPY: ${r.reason}`;
      }
    }
  }
  return { contract: null, note: `${note ?? 'no contract'} (${caps.basis})`, vehicle: sym, chainSource: chain?.source ?? null, chainFetchedAt: chain?.fetchedAt ?? null };
}

/**
 * The 0DTE producer — every watched name, every pass (5 min; 2 min in power
 * hour, server/idea-producer-schedule.ts).
 *   • WATCH: forming setups (zero-dte-ideas-core watchSetups) with their contract,
 *     kept in memory for the desk — not logged, because nothing was entered.
 *   • TRIGGERED: the pre-registered policy fired → contract inside the caps →
 *     storage.createTradeIdea (source zero_dte_desk) so the outcome tracker
 *     resolves it, + an in-app alert. SPX is published by the index engine
 *     (one owner per name); the desk still evaluates SPX WATCH setups on the
 *     same SPY GEX the index engine reads, scaled by the live SPX/SPY ratio.
 *   • Names whose nearest expiry is > 2 days out: "no 0DTE today", no idea.
 */
export async function runZeroDteDeskScan(): Promise<{ evaluated: number; published: number; waits: Record<string, string[]> }> {
  const nowMs = Date.now();
  const phase = sessionPhase(nowMs);
  const waits: Record<string, string[]> = {};
  if (!phase.entriesOpen) return { evaluated: 0, published: 0, waits };
  const today = etDateKey(nowMs);
  for (const [k, t] of firstSeen) if (etDateKey(t) !== today) firstSeen.delete(k);
  let published = 0; let evaluated = 0;
  const { getGexSnapshot } = await import('./gex-snapshot-service');
  const { getIntradayStructure } = await import('./zero-dte-structure');
  const eventBlock = await highImpactEventNear(phase.etMin);

  for (const sym of watchList()) {
    const isIndex = INDEX_OWNED.has(sym);
    const src = sym === 'SPX' ? 'SPY' : sym; // SPX levels = SPY GEX (the index engine's basis) × live ratio
    try {
      const [snap, st, chain] = await Promise.all([getGexSnapshot(src), getIntradayStructure(src), getDeskChain(sym, false)]);
      const ex = chain ? pickDeskExpiry(chain.expirations, today) : pickDeskExpiry([], today);
      const elig = zeroDteEligibility(ex);
      const memo: IdeaEval = { at: nowMs, day: today, eligibility: elig, expiry: ex.expiry, price: null, priceAt: null, watch: [], withheld: null, notes: [] };
      ideaEval.set(sym, memo);
      if (!elig.ok) { waits[sym] = [elig.label]; memo.notes.push(elig.reason ?? elig.label); continue; }
      if (!snap || !st || st.lastClose == null) { waits[sym] = [!snap ? 'no GEX snapshot' : 'no intraday bars']; memo.notes.push(waits[sym][0]); if (!isIndex) lastEval.set(sym, { at: nowMs, verdict: { setup: null, wait: waits[sym] }, withheld: null }); continue; }

      // Units: the name's own. SPX = SPY × the live cash ratio (Yahoo ^GSPC; the CBOE SPX spot is delayed).
      let k = 1;
      if (sym === 'SPX') {
        try {
          const { fetchYahooFinancePrice } = await import('./market-api');
          const q = await withTimeout(fetchYahooFinancePrice('%5EGSPC'), 5000);
          k = q?.currentPrice && q.currentPrice > 1000 ? q.currentPrice / st.lastClose : (chain?.spot ?? 0) / st.lastClose;
        } catch { k = (chain?.spot ?? 0) / st.lastClose; }
        if (!(k > 5 && k < 15)) { waits[sym] = ['no SPX/SPY ratio']; memo.notes.push('no live SPX/SPY ratio — SPX levels not translated'); continue; }
      }
      const sc = (x: number | null | undefined) => (x == null ? null : x * k);
      const bucket = chain && ex.expiry && ex.sameDay && zeroDteWallsEnabled() ? expiryBucketLevels(sym, chain.rows, chain.spot, ex.expiry) : null; // SPX: SPXW's own walls, already in SPX units
      const em = chain && ex.expiry ? expectedMoveFor(chain.rows, chain.spot, ex.expiry, todayFraction(phase.etMin), ex.sessionsAfterToday ?? 0) : null;
      // Index cap 0.6%; a single name scales with its own day: 35% of today's expected move, never below 0.6%.
      const maxRiskPct = isIndex ? 0.6 : Math.max(0.6, em ? 0.35 * em.todayPct : 0.6);
      const price = st.lastClose * k;
      memo.price = price; memo.priceAt = st.lastBarAt != null ? st.lastBarAt + 5 * 60_000 : nowMs;
      const flow = await flowTide(sym, ex.expiry, false);

      // ── WATCH: forming setups ──
      const w = watchSetups({
        symbol: sym, phase, price, sign: snap.netGexSign, vwap: sc(st.vwap),
        levels: {
          zeroGamma: sc(snap.flipPoint), callWall: sc(snap.callWall), putWall: sc(snap.putWall),
          or30High: sc(st.or30High), or30Low: sc(st.or30Low), pdh: sc(st.pdh), pdl: sc(st.pdl), hod: sc(st.hodPrior), lod: sc(st.lodPrior),
          zCallWall: bucket?.callWall ?? null, zPutWall: bucket?.putWall ?? null, zMaxGamma: bucket?.maxGamma ?? null,
        },
        maxRiskPct, emTodayPct: em?.todayPct ?? null, flowLean: flow.lean,
      });
      memo.notes.push(...w.notes);
      for (const s of w.setups) {
        const c = await contractFor(sym, chain, ex.expiry!, { direction: s.direction, entry: s.entry, stop: s.stop, target: s.target.price, target2: s.target2?.price ?? null }, sym === 'SPX' ? k : null);
        if (!firstSeen.has(s.key)) firstSeen.set(s.key, nowMs);
        memo.watch.push({ ...s, ...c, firstSeen: firstSeen.get(s.key)! });
      }
      evaluated++;

      // ── TRIGGERED: the index engine owns SPX; the desk publishes the single names ──
      if (isIndex) { waits[sym] = memo.watch.length ? [`${memo.watch.length} forming (index engine publishes)`] : w.notes.slice(0, 1); continue; }
      const verdict = evaluateZeroDte(sym, {
        spot: snap.spot, zeroGamma: snap.flipPoint, callWall: snap.callWall, putWall: snap.putWall,
        sign: snap.netGexSign, fetchedAt: snap.fetchedAt, modelledGrossShare: snap.modelledGrossShare ?? null,
      }, st, nowMs, phase.etMin, eventBlock, { zeroDte: bucket ? { expiry: bucket.expiry, callWall: bucket.callWall, putWall: bucket.putWall, maxGamma: bucket.maxGamma, zeroGamma: bucket.zeroGamma } : null, maxRiskPct });
      let withheld: string | null = null;
      if (verdict.setup) {
        const s = verdict.setup;
        const kind = kindForSetup(s);
        const key = `${sym}|${s.policy}|${s.direction}`;
        const last = recentPublishes.get(key);
        if (last && nowMs - last < 30 * 60_000) withheld = 'same policy + side logged inside 30 min';
        else {
          const sel = await contractFor(sym, chain, ex.expiry!, { direction: s.direction, entry: s.entry, stop: s.stop, target: s.target }, null);
          const c = sel.contract;
          if (!c) withheld = sel.note ?? 'no contract inside the caps';
          else {
            const label = s.policy.startsWith('A') ? 'A · −γ continuation' : s.powerHour ? 'B · +γ power-hour pin' : 'B · +γ wall fade';
            const dte = elig.dte ?? 0;
            try {
              const { storage } = await import('./storage');
              const created = await storage.createTradeIdea({
                symbol: sym, assetType: 'option', direction: s.direction,
                entryPrice: s.entry, targetPrice: s.target, stopLoss: s.stop, riskRewardRatio: +s.rr.toFixed(2),
                optionType: c.optionType, strikePrice: c.strike, expiryDate: c.expiry, entryPremium: Number(c.mid.toFixed(2)),
                catalyst: `${s.powerHour ? '⚡ POWER HOUR ' : ''}${sym} ${dte <= 0 ? '0DTE' : `${dte}DTE (nearest expiry, held intraday)`} ${s.direction === 'long' ? 'CALLS' : 'PUTS'} — ${KIND_LABEL[kind]} (${label}) | ${c.qty}x @ $${c.mid.toFixed(2)} mid`,
                analysis: `${s.evidence.join(' | ')}. Stop $${s.stop.toFixed(2)}, target $${s.target.toFixed(2)} (${s.rr.toFixed(2)}R on ${sym}); risk cap ${maxRiskPct.toFixed(2)}% of ${sym} (35% of today's expected move) and ${capsFor(sym).basis}. Premium stop ≈ $${c.premiumStop.toFixed(2)}, T1 ≈ $${c.premiumT1.toFixed(2)} (${c.basis}). Hard time stop ${TIME_STOP_ET} ET.${dte > 0 ? ` ${sym} lists no same-day expiry — the ${c.expiry} contract is flattened by ${TIME_STOP_ET} ET like a 0DTE.` : ''} Policies were pre-registered for the index; applying them to ${sym} is a desk extension. ${ZERO_DTE_PROVENANCE}`,
                source: DESK_SOURCE, dataSourceUsed: `zero_dte_desk_${s.policy}`,
                sessionContext: s.powerHour ? 'power_hour' : 'intraday', timestamp: new Date(nowMs).toISOString(),
                exitBy: timeStopIso(nowMs), entryValidUntil: new Date(nowMs + 10 * 60_000).toISOString(),
                expiryTier: dte <= 0 ? '0DTE' : 'DAILY', optionDte: Math.max(0, dte), tradeType: 'scalp', outcomeStatus: 'open',
                confidenceScore: 60, holdingPeriod: 'day',
                qualitySignals: [
                  `policy:${s.policy}`, `kind:${kind}`, `trigger:${s.trigger.name}@${s.trigger.price.toFixed(2)}`, `target_level:${s.targetLevel.name}`,
                  `prem_stop:${c.premiumStop.toFixed(2)}`, `prem_t1:${c.premiumT1.toFixed(2)}`, `qty:${c.qty}`, `risk_usd:${Math.round(c.riskDollars)}`,
                  'validated:false', 'desk:zero_dte', `contract_dte:${dte}`, `time_stop:${TIME_STOP_ET}ET`, bucket ? 'levels:0dte_walls' : '', s.powerHour ? 'power_hour' : '',
                ].filter(Boolean),
              } as any, { dedupWindowHours: 0.5 });
              const { isDedupedResult } = await import('./lib/instrument-dedup');
              if (isDedupedResult(created)) {
                // Same contract already open / published this session (server/lib/instrument-dedup.ts).
                recentPublishes.set(key, nowMs);
                withheld = `same contract already on the book (idea ${(created as any)?.id})`;
              } else {
              recentPublishes.set(key, nowMs); published++; ideasCache = null; deskCache = null;
              logger.info(`[0DTE-DESK] ✅ TRIGGERED ${sym} ${KIND_LABEL[kind]} ${s.direction} → ${c.optionType} ${c.strike} ${c.expiry} @ $${c.mid.toFixed(2)}`);
              void notifyTriggered(
                `0DTE TRIGGERED · ${sym} ${c.strike}${c.optionType === 'call' ? 'C' : 'P'} ${c.expiry.slice(5)} @ ~$${c.mid.toFixed(2)} · ${KIND_LABEL[kind]} · stop $${s.stop.toFixed(2)} → T1 $${s.target.toFixed(2)} · out by ${TIME_STOP_ET} ET (unvalidated)`,
                { symbol: sym, optionType: c.optionType, strike: c.strike, expiry: c.expiry, price: c.mid, qty: c.qty, ideaId: (created as any)?.id },
              );
              }
            } catch (e) { withheld = `write gate: ${(e as Error).message}`; }
          }
        }
        if (withheld) {
          memo.withheld = { setup: s, kind, reason: withheld, at: nowMs };
          logger.info(`[0DTE-DESK] ${sym} ${s.policy} ${s.direction} withheld: ${withheld}`);
        }
      }
      waits[sym] = verdict.setup ? [withheld ? `triggered, withheld: ${withheld}` : 'published'] : memo.watch.length ? [`${memo.watch.length} forming`, ...verdict.wait] : verdict.wait;
      lastEval.set(sym, { at: nowMs, verdict, withheld });
    } catch (e) {
      waits[sym] = [`scan failed: ${(e as Error).message}`];
    }
  }
  deskCache = null;
  if (writesSharedState()) {
    writeSharedSync(DESK_SHARED, { lastEval: Array.from(lastEval.entries()), ideaEval: Array.from(ideaEval.entries()) });
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

