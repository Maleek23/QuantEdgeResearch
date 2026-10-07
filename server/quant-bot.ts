/**
 * QUANT BOT — paper-trades the platform's own signals, so the engine gets a track record.
 *
 * Everything upstream produces opinions; nothing was recording whether they worked. The
 * bot closes that loop: it takes the highest-conviction signals into a paper portfolio,
 * manages them against their own stop/target, and books the result. It is a paper-execution
 * ledger — one source of calibration evidence, never a replacement for the platform outcome
 * model or a signal's 0–100 evidence grade.
 *
 * Rules are deliberately mechanical. A bot that second-guesses the signal is no longer
 * measuring the signal.
 */
import { logger } from './logger';
import { storage } from './storage';
import { convictionDisplayPercent } from '@shared/conviction-display';
import { processRole } from './lib/process-role';
import {
  readBotSleeveConfig, classifyZeroDteIdea, zeroDteKindOf, zeroDteQuantity, premiumManage, sleeveOfPosition, sleeveTag,
  swingOrder, isLiveGrade, timeStopDue, executableQuote, etMinutesOf, in0dteWindow, daysToExpiry, underlyingSide, SkipTally, formatSkipSummary,
  stoppedOutToday,
  type BotSleeve, type BotSleeveConfig, type SkipSummary,
} from '@shared/bot-sleeves';
import { gradePick, gradeIdeaRow, gradeComponentsTag, formatNexusGrade, gradeAtLeast, type NexusGrade } from '@shared/nexus-grade';
import {
  readBotStopConfig, widenStop, optionPremiumStop, sizeForRisk, underlyingStopCrossed, ustopTag, parseUstopTag,
  zeroDteGrace, openingRange, type BotStopConfig, type Side,
} from '@shared/wide-stops';
import {
  executeTradeIdea, checkStopsAndTargets, updatePositionPrices, closePosition, closeOptionPositionAtBid,
  recordEquitySnapshot,
  getOpenPositions,
} from './paper-trading-service';

// The 10K book could not buy ONE contract of the board it measures: at 1-2%
// risk its premium ceiling was ~$250 while MSFT's conservative call cost $655
// and LITE's $2,865 — every fill died at the position sizer after passing
// every other gate. Options are lumpy; the account must afford the lumps.
// New clean-era book at 100K (1% risk ≈ $1K → ceiling ~$2.5K covers the
// board's actual premiums). The old 'Quant Bot' 10K book stays in the DB
// untouched for audit; this name creates a fresh ledger aligned with
// OUTCOME_BASELINE_DATE.
export const BOT_PORTFOLIO_NAME = 'Quant Bot · 100K';
const BOT_USER = 'system-quant-bot';
/** Owner id of every paper portfolio the bot trades (read by the journal's Accounts page). */
export const BOT_USER_ID = BOT_USER;

/**
 * Whose bot a cycle runs. The platform bot (primary) owns Discord / notifier
 * alerts, the new-signal announcements, the blocked-trade ledger, gap watch and
 * retired runs. A desk bot (docs/DESK_ADMINS.md) runs the SAME cycle - same
 * sleeves logic, every gate - on its own paper book with its own sleeve config,
 * none of those side effects, plus its own entry rules.
 */
export interface BotOwner {
  /** paper_portfolios.user_id of the book. */
  userId: string;
  portfolioName: string;
  label: string;
  primary: boolean;
  /** Per-desk sleeve config (capacity, risk, grade floor, 0DTE windows). Default: the env config. */
  sleeves?: BotSleeveConfig;
  /** Desk rules, checked in both sleeves after the platform's own refusals and before the loss-rule gates. */
  entryCheck?: (pick: any, idea: any) => { ok: true } | { ok: false; code: string; reason: string };
}
export const PRIMARY_BOT_OWNER: BotOwner = { userId: BOT_USER, portfolioName: BOT_PORTFOLIO_NAME, label: 'Quant Bot', primary: true };

export interface BotConfig {
  /**
   * Raw evidence (conviction) score. NO LONGER an entry floor (2026-10-01): the
   * grade audit found the score inverted on the honest record, and the floor kept
   * every index 0DTE plan out. It is logged with each fill and still gates the
   * board-flip exit. Entry selection: shared/bot-sleeves.ts.
   */
  minConviction: number;
  /** Legacy total cap; the sleeves (BOT_0DTE_MAX + BOT_SWING_MAX) decide capacity now. */
  maxOpen: number;
  startingCapital: number;
  riskPerTradePct: number;
  /** refuse a signal that has already travelled this far entry -> T1 (chase guard) */
  maxProgressPct: number;
  /** Minimum reward/risk on the underlying thesis before choosing an option. */
  minUnderlyingRR: number;
  /** Maximum live bid/ask spread accepted for a paper fill. */
  maxOptionSpreadPct: number;
  /** Maximum debit committed to one trade as a fraction of current cash. */
  maxDebitPct: number;
  /** Absolute managed-loss ceiling for one trade, independent of paper equity. */
  maxRiskDollars: number;
  /** Absolute debit ceiling for one trade, independent of paper equity. */
  maxDebitDollars: number;
  /** Minimum modeled contract return when the underlying reaches T1. */
  minContractRoiAtT1Pct: number;
  /** Do not simulate delayed-quote fills before this New York minute (swing sleeve). */
  delayedFillNotBeforeEtMinutes: number;
  /**
   * 0DTE sleeve entries on a DELAYED quote wait until this minute: a ~15-minute
   * delayed chain at 09:50 reflects the 09:35 market; at 09:35 it is pre-open.
   * A live quote (OPRA / production Tradier) is usable from 09:35.
   */
  zeroDteDelayedNotBeforeEtMinutes: number;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  // convictionScore is a raw CONFLUENCE-POINT sum, not a percent: it tops out around the
  // high 20s and the canonical bands are S>=25 / A>=19 / B>=13. A threshold of 25 therefore left
  // only rare S-band names. 18 takes strong B and near-A setups without scraping the
  // bottom of the board.
  minConviction: 18,
  maxOpen: 10,
  startingCapital: 100_000,
  riskPerTradePct: 2,
  // Past ~35% of the way to T1 the remaining reward no longer justifies the same risk.
  maxProgressPct: 35,
  minUnderlyingRR: 1,
  maxOptionSpreadPct: 0.15,
  maxDebitPct: 0.03,
  // Swing-sleeve values come from BOT_SWING_RISK_USD / BOT_SWING_MAX_DEBIT_USD
  // (shared/bot-sleeves.ts, $500 / $1,500). $250 / $300 with 30–60 DTE (loss
  // rule 4) left almost no large-cap contract that fit — 'no_contract' every cycle.
  maxRiskDollars: 500,
  maxDebitDollars: 1_500,
  minContractRoiAtT1Pct: 30,
  // Opening prints and delayed option chains are especially stale/wide. SNOW's
  // $420C was booked at 09:38 ET for $25.18 after being published near $15.78.
  delayedFillNotBeforeEtMinutes: 10 * 60,
  zeroDteDelayedNotBeforeEtMinutes: 9 * 60 + 50,
};

/**
 * Entry-quote standard (on top of executableQuote's two-sided / spread / session
 * checks). A live quote must be fresh (60 s); a delayed quote is accepted only
 * after the configured minute and is recorded delayed=true, so
 * shared/bot-fill-verification.ts classifies the fill unverified, never verified.
 */
export function entryQuoteIssue(
  q: import('./tradier-api').OptionMark,
  notBeforeEtMinute: number,
  issueFn: typeof import('./tradier-api').optionMarkExecutionIssue,
  now = new Date(),
): string | null {
  const allowDelayed = easternMinutes(now) >= notBeforeEtMinute;
  const issue = issueFn(q, now.getTime(), 60_000, { allowDelayed });
  if (issue && q.delayed && !allowDelayed) return `${issue} before ${Math.floor(notBeforeEtMinute / 60)}:${String(notBeforeEtMinute % 60).padStart(2, '0')} ET`;
  return issue;
}

/** Provenance tag for an entry fill — appended LAST so bot-fill-verification reads it. */
function entryAuditTag(q: { ask: number; bid: number; source?: string; feed?: string | null; delayed?: boolean; quoteTime?: string | null }, observedAt: Date): string {
  return `[entry ask=${q.ask.toFixed(4)} bid=${q.bid.toFixed(4)} source=${q.source ?? 'unknown'} feed=${q.feed ?? 'unknown'} delayed=${!!q.delayed} quoteTime=${q.quoteTime ?? 'unknown'} observedAt=${observedAt.toISOString()}]`;
}
/** Provenance tag for an exit at the bid. */
function exitAuditTag(q: { ask: number; bid: number; source?: string; feed?: string | null; delayed?: boolean; quoteTime?: string | null }, observedAt: Date): string {
  const raw = q.quoteTime == null ? NaN : Number(q.quoteTime);
  const qMs = Number.isFinite(raw) ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(String(q.quoteTime ?? ''));
  const age = Number.isFinite(qMs) ? Math.round((observedAt.getTime() - qMs) / 1000) : 'unknown';
  return `[fill bid=${q.bid.toFixed(4)} ask=${q.ask.toFixed(4)} source=${q.source ?? 'unknown'} feed=${q.feed ?? 'unknown'} delayed=${!!q.delayed} quoteTime=${q.quoteTime ?? 'unknown'} quoteAgeSeconds=${age} observedAt=${observedAt.toISOString()}]`;
}

function easternMinutes(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function easternDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * Read the dedicated portfolio without changing account state.
 *
 * Two bot portfolios carry the name "Quant Bot · 100K" (Run 2, Aug 26–Sep 9, and
 * Run 3 from Sep 24). The bot trades the MOST RECENT one it owns — decided here
 * explicitly rather than by whatever order the DB returned. Older runs stay in
 * the DB, untouched, and every record surface reads them (see shared/bot-runs.ts).
 */
async function findBotPortfolio(owner: BotOwner = PRIMARY_BOT_OWNER) {
  const all = await storage.getAllPaperPortfolios();
  const { pickActiveBotPortfolio } = await import('@shared/bot-runs');
  const mine = (Array.isArray(all) ? all : []).filter((p: any) => p.userId === owner.userId);
  return pickActiveBotPortfolio(mine as any[], owner.portfolioName);
}

/** Every paper portfolio the bot owns (all runs), oldest first. */
async function botPortfolios(owner: BotOwner = PRIMARY_BOT_OWNER): Promise<any[]> {
  const all = await storage.getAllPaperPortfolios();
  return (Array.isArray(all) ? all : [])
    .filter((p: any) => p.userId === owner.userId)
    .sort((a: any, b: any) => Date.parse(a.createdAt ?? 0) - Date.parse(b.createdAt ?? 0));
}

/** Re-price open, unexpired contracts in runs the bot no longer trades. */
async function repriceRetiredRuns(activeId: string): Promise<void> {
  const today = easternDateKey();
  for (const p of await botPortfolios()) {
    if (p.id === activeId) continue;
    const open = await getOpenPositions(p.id);
    // An expired contract has no chain to price — the reconciler settles it instead.
    if (!open.some((x: any) => !x.expiryDate || String(x.expiryDate).slice(0, 10) >= today)) continue;
    await updatePositionPrices(p.id);
  }
}

/** The bot trades one dedicated portfolio; create it only when a cycle is explicitly run. */
export async function getBotPortfolio(cfg: BotConfig = DEFAULT_BOT_CONFIG, owner: BotOwner = PRIMARY_BOT_OWNER) {
  const existing = await findBotPortfolio(owner);
  if (existing) return existing;

  return storage.createPaperPortfolio({
    userId: owner.userId,
    name: owner.portfolioName,
    startingCapital: cfg.startingCapital,
    cashBalance: cfg.startingCapital,
    totalValue: cfg.startingCapital,
    // riskPerTrade is stored as a FRACTION (0.02 = 2%). Passing the percent value made
    // the sizer read 2 as 200% risk, which then hit the flat $5,000 position cap — two
    // trades consumed the entire $10k account. A bot that goes all-in on two names isn't
    // measuring signals.
    riskPerTrade: cfg.riskPerTradePct / 100,
    maxPositionSize: Math.round((cfg.startingCapital * 0.15)),
  } as any);
}

export interface BotRunResult {
  ranAt: string;
  portfolioId: string;
  opened: { symbol: string; reason: string }[];
  closed: { symbol: string; reason: string }[];
  skipped: number;
  openCount: number;
  /** Levels the bot exited on. A later fill clears the name for re-entry. */
  gapWatch: { symbol: string; level: number }[];
  /** Why candidates were refused this cycle (counts by reason + the best-ranked three). */
  skipSummary?: SkipSummary;
  error?: string;
}

/**
 * One bot cycle: mark positions to market, take exits the signal itself defined, then
 * fill any remaining slots with the best signals available.
 */

/**
 * Announce a closed position. Every exit route funnels through here — stop, target,
 * expiry settlement, gap magnet — so an exit reason can never be reported one way
 * in the log and another way in Discord. A notification failure must never roll
 * back a real close, hence the swallow.
 */
/**
 * Discord side effects of a cycle (entry/exit alerts, new-signal announcements).
 * On for the worker/dev entry points as before; the web-process schedule turns
 * them OFF unless QUANT_BOT_DISCORD=1 — same rule as the web idea producers.
 */
let discordAlerts = true;
export function setBotDiscordAlerts(on: boolean): void { discordAlerts = on; }

async function announceExit(pos: any, exitPrice: number, reason: string): Promise<void> {
  void import('./bot-discord-notifier').then((n) => n.postBotExit(pos, exitPrice, reason)).catch(() => {});
  if (!discordAlerts) return;
  try {
    const { sendBotTradeExitToDiscord } = await import('./discord-service');
    const mult = pos.assetType === 'option' ? 100 : 1;
    const pnl = (exitPrice - Number(pos.entryPrice)) * Number(pos.quantity) * mult;
    await sendBotTradeExitToDiscord({
      symbol: pos.symbol,
      assetType: pos.assetType ?? 'option',
      optionType: pos.optionType ?? null,
      strikePrice: pos.strikePrice ?? null,
      entryPrice: Number(pos.entryPrice),
      exitPrice,
      quantity: Number(pos.quantity),
      realizedPnL: pnl,
      exitReason: reason,
      portfolio: 'Quant Bot',
      source: 'quant-bot',
    });
  } catch (err: any) {
    logger.warn(`[QUANT-BOT] exit alert failed for ${pos?.symbol}: ${err?.message ?? err}`);
  }
}

/**
 * One cycle, at most ONE at a time ANYWHERE. Before 2026-09-29 nothing stopped
 * two processes cycling the same book: the prod web tier, a worker, a laptop dev
 * server pointed at the prod DB (Run 3's entries and exits all came from one),
 * or the unauthenticated POST /api/quant-bot/run. Two cycles racing can fill the
 * same slot twice. A Postgres advisory lock (held for the cycle, on a dedicated
 * pool client) makes the second caller skip; an in-process guard skips re-entry.
 */
const BOT_CYCLE_LOCK_KEY = 8_531_2027;
let cycleInFlight: Promise<BotRunResult> | null = null;

/**
 * Bot cycles belong to the worker. Under the web/worker split (ROLE=web on
 * dist/web.js) the web process must never trade, manage or settle the book —
 * only the worker (ROLE=worker) or a single-process ROLE=all (dev / rollback).
 */
export function botCycleAllowedHere(): { ok: boolean; role: string } {
  const role = processRole();
  return { ok: role !== 'web', role };
}

export async function runBotCycle(cfg: BotConfig = DEFAULT_BOT_CONFIG, origin = 'manual'): Promise<BotRunResult> {
  const here = botCycleAllowedHere();
  if (!here.ok) {
    const refused: BotRunResult = { ranAt: new Date().toISOString(), portfolioId: '', opened: [], closed: [], skipped: 0, openCount: 0, gapWatch: [], error: `bot cycles run only in the worker (this process is ROLE=${here.role}) — refused` };
    logger.warn(`[QUANT-BOT] ${origin}: refused — ROLE=${here.role}; the worker owns the bot`);
    return refused;
  }
  if (cycleInFlight) return cycleInFlight;
  cycleInFlight = (async () => {
    const { pool } = await import('./db');
    const client = await pool.connect();
    let locked = false;
    try {
      const r = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [BOT_CYCLE_LOCK_KEY]);
      locked = r.rows?.[0]?.ok === true;
      if (!locked) {
        const skipped: BotRunResult = { ranAt: new Date().toISOString(), portfolioId: '', opened: [], closed: [], skipped: 0, openCount: 0, gapWatch: [], error: 'another process is running a bot cycle — skipped' };
        logger.info(`[QUANT-BOT] ${origin}: another process holds the bot-cycle lock — skipped`);
        noteBotCycle(origin, skipped, skipped.error);
        return skipped;
      }
      const res = await runBotCycleInner(cfg);
      noteBotCycle(origin, res, res.error);
      return res;
    } catch (err) {
      noteBotCycle(origin, null, (err as Error)?.message ?? String(err));
      throw err;
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [BOT_CYCLE_LOCK_KEY]).catch(() => {});
      client.release();
    }
  })().finally(() => { cycleInFlight = null; });
  return cycleInFlight;
}

/**
 * One desk bot cycle (docs/DESK_ADMINS.md). Same engine, same gates, its own
 * paper book and sleeve config; worker-only like the platform bot; serialised
 * per desk by its own advisory lock so a second process never doubles it.
 */
const deskInFlight = new Map<string, Promise<BotRunResult>>();
const deskLastCycle = new Map<string, BotCycleStamp>();
/** The newest desk cycle stamp: this process's, or the worker's via shared state (the portal is served by web). */
export async function deskBotLastCycle(slug: string): Promise<BotCycleStamp | null> {
  const mine = deskLastCycle.get(slug) ?? null;
  try {
    const { readShared } = await import('./lib/shared-state');
    const shared = readShared<BotCycleStamp>(`desk-bot-cycle-${slug}`)?.data ?? null;
    if (!mine) return shared;
    if (!shared) return mine;
    return Date.parse(shared.at) > Date.parse(mine.at) ? shared : mine;
  } catch { return mine; }
}
function deskLockKey(userId: string): number {
  let h = 0;
  for (const ch of userId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return 853_100_000 + (Math.abs(h) % 99_000);
}
export async function runDeskBotCycle(slug: string, cfg: BotConfig, owner: BotOwner, origin = 'desk'): Promise<BotRunResult> {
  if (owner.primary || owner.userId === BOT_USER) throw new Error('runDeskBotCycle never runs the platform bot');
  const stamp = (r: BotRunResult | null, error?: string) => {
    const st: BotCycleStamp = {
      at: new Date().toISOString(), origin, opened: r?.opened.length ?? 0, closed: r?.closed.length ?? 0, skipped: r?.skipped ?? 0, openCount: r?.openCount ?? 0, error,
      pid: process.pid, role: processRole(), skipSummary: r?.skipSummary, openedList: r?.opened,
    } as BotCycleStamp;
    deskLastCycle.set(slug, st);
    void import('./lib/shared-state').then(({ writeSharedSync }) => writeSharedSync(`desk-bot-cycle-${slug}`, st)).catch(() => {});
  };
  const here = botCycleAllowedHere();
  if (!here.ok) {
    const refused: BotRunResult = { ranAt: new Date().toISOString(), portfolioId: '', opened: [], closed: [], skipped: 0, openCount: 0, gapWatch: [], error: `desk bot cycles run only in the worker (ROLE=${here.role}) - refused` };
    stamp(refused, refused.error);
    return refused;
  }
  const existing = deskInFlight.get(slug);
  if (existing) return existing;
  const run = (async () => {
    const { pool } = await import('./db');
    const client = await pool.connect();
    let locked = false;
    const key = deskLockKey(owner.userId);
    try {
      const r = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [key]);
      locked = r.rows?.[0]?.ok === true;
      if (!locked) {
        const skipped: BotRunResult = { ranAt: new Date().toISOString(), portfolioId: '', opened: [], closed: [], skipped: 0, openCount: 0, gapWatch: [], error: 'another process is running this desk bot - skipped' };
        stamp(skipped, skipped.error);
        return skipped;
      }
      const res = await runBotCycleInner(cfg, owner);
      stamp(res, res.error);
      return res;
    } catch (err) {
      stamp(null, (err as Error)?.message ?? String(err));
      throw err;
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [key]).catch(() => {});
      client.release();
    }
  })().finally(() => { deskInFlight.delete(slug); });
  deskInFlight.set(slug, run);
  return run;
}

/** Read-only: a desk bot's active book (never creates one). */
export async function findDeskBotPortfolio(owner: BotOwner) {
  return findBotPortfolio(owner);
}

async function runBotCycleInner(cfg: BotConfig, owner: BotOwner = PRIMARY_BOT_OWNER): Promise<BotRunResult> {
  // Side effects belong to the platform bot only (see BotOwner).
  const alerts = owner.primary && discordAlerts;
  const announce = (pos: any, px: number, why: string) => (owner.primary ? announceExit(pos, px, why) : Promise.resolve());
  const ranAt = new Date().toISOString();
  const opened: BotRunResult['opened'] = [];
  const closed: BotRunResult['closed'] = [];
  // Levels we exited on, so a later fill can flip the name back to a candidate.
  const gapWatch: { symbol: string; level: number }[] = [];
  const portfolio: any = await getBotPortfolio(cfg, owner);
  if (!portfolio?.id) {
    return { ranAt, portfolioId: '', opened, closed, skipped: 0, openCount: 0, gapWatch: [], error: 'no portfolio' };
  }

  // ── A cycle, concretely ──────────────────────────────────────────────────
  // For shares a "cycle" is just re-price and check levels. Options add a clock: every
  // contract has an expiry, and a position nobody settles would sit in the book forever
  // claiming value it no longer has. So a cycle is four steps, in this order:
  //   1. RE-PRICE every open contract from the live chain,
  //   2. SETTLE anything at or past expiry,
  //   3. EXIT on the premium stop / target,
  //   4. ENTER with whatever capacity is left.
  // Exits precede entries so a slot freed this cycle is reusable immediately.

  // 1 — re-price
  try {
    await updatePositionPrices(portfolio.id);
  } catch (err) {
    logger.warn('[QUANT-BOT] re-price failed:', err);
  }
  // Retired runs still hold live contracts (e.g. Run 2's DKS/JNJ Oct 16 calls).
  // They are not managed any more, but their marks must not freeze at the day
  // the run stopped — the record shows them with a mark and its age.
  if (owner.primary) try { await repriceRetiredRuns(portfolio.id); } catch (err) { logger.warn('[QUANT-BOT] retired-run re-price failed:', err); }

  const sleeves = owner.sleeves ?? readBotSleeveConfig(process.env);
  const stopCfg = readBotStopConfig(process.env);
  const tally = new SkipTally();

  // 2 — same-day contracts outside the 0DTE sleeve (legacy rows): flatten before
  //     the close at a LIVE quote. The old code booked pos.currentPrice — a mark
  //     that could be hours old. No live quote → no close; the reconciler settles
  //     the contract at intrinsic after 16:00.
  try {
    const open = await getOpenPositions(portfolio.id);
    const today = easternDateKey();
    const etMinute = easternMinutes();
    for (const pos of open as any[]) {
      if (!pos.expiryDate || !pos.optionType) continue;
      if (sleeveOfPosition(pos) === '0dte') continue; // managed by step 2a
      const expiryDay = String(pos.expiryDate).slice(0, 10);
      if (expiryDay !== today || etMinute < 15 * 60 + 55 || etMinute >= 16 * 60) continue;
      const live = await liveContractQuote(pos, 0.6);
      if (!live) { logger.warn(`[QUANT-BOT] ${pos.symbol} same-day flatten skipped — no live quote (reconciler settles at intrinsic)`); continue; }
      await closePosition(pos.id, live.bid, `0dte_eod_exit ${exitAuditTag(live.q, new Date())}`);
      await announce(pos, live.bid, `0DTE time exit before close (${live.stamp})`);
      closed.push({ symbol: pos.symbol, reason: `0DTE time exit before close (${live.stamp})` });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] expiry settlement failed:', err);
  }

  // 2a — 0DTE sleeve premium management at a LIVE quote: −40% stop, +50% arms a
  //      breakeven stop, +100% target, hard flatten 15:45 ET. Triggers read the
  //      mid; exits fill at the bid. No live quote → nothing is decided.
  const zeroDteManaged = new Set<string>();
  try {
    const etMin = easternMinutes();
    for (const pos of (await getOpenPositions(portfolio.id)) as any[]) {
      if (pos.assetType !== 'option' || sleeveOfPosition(pos) !== '0dte') continue;
      zeroDteManaged.add(pos.id);
      const live = await liveContractQuote(pos, 0.6);
      if (!live) { logger.warn(`[QUANT-BOT] 0DTE ${pos.symbol}: no live quote — bracket not evaluated (never on a stale mark)`); continue; }
      const entry = Number(pos.entryPrice);
      const v = premiumManage({ entry, mark: live.mid, stop: pos.stopLoss != null ? Number(pos.stopLoss) : null, etMin }, sleeves);
      if (v.action === 'hold') continue;
      // Opening grace (shared/wide-stops.ts): the −40% stop waits out the first
      // BOT_0DTE_STOP_GRACE_MIN minutes after the fill unless the underlying has
      // broken the opening range against the position. Unknown → the stop applies.
      if (v.action === 'stop') {
        const g = await zeroDteGraceVerdict(pos, entry, live.mid, stopCfg);
        if (g?.hold) { logger.info(`[QUANT-BOT] 0DTE ${pos.symbol}: ${v.reason} held — grace: ${g.reason}`); continue; }
      }
      if (v.action === 'arm_breakeven') {
        await storage.updatePaperPosition(pos.id, { stopLoss: entry } as any);
        logger.info(`[QUANT-BOT] 0DTE ${pos.symbol}: ${v.reason}`);
        continue;
      }
      const code = v.action === 'flatten' ? '0dte_flatten_1545' : v.action === 'target' ? 'premium_target' : v.action === 'breakeven_stop' ? 'breakeven_stop' : 'premium_stop';
      await closePosition(pos.id, live.bid, `${code} ${exitAuditTag(live.q, new Date())}`);
      const why = `${v.reason} · ${live.stamp}`;
      await announce(pos, live.bid, why);
      closed.push({ symbol: pos.symbol, reason: why });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] 0DTE sleeve management failed:', err);
  }

  // 2b — settle every contract past expiry, in EVERY run the bot owns (retired
  //      runs included — their opens were never settled). The old inline
  //      settlement read pos.underlyingPrice, a column that does not exist, so it
  //      would have booked every expiry as worthless. See server/bot-reconcile.ts.
  try {
    const { reconcileExpiredBotPositions } = await import('./bot-reconcile');
    const rec = await reconcileExpiredBotPositions({ apply: true, ownerId: owner.userId });
    for (const st of rec.settlements) {
      closed.push({ symbol: st.symbol, reason: `expired — intrinsic $${st.exitPrice.toFixed(2)} at ${st.symbol} close $${st.underlyingClose}` });
    }
    for (const sk of rec.skipped) logger.warn(`[QUANT-BOT] expiry not settled: ${sk.contract} — ${sk.reason}`);
  } catch (err) {
    logger.warn('[QUANT-BOT] expiry reconciliation failed:', err);
  }

  // 2c — stale-position hygiene (swing sleeve). A swing contract is held for the
  //      idea's own hold window (docs/SETUP_LIFECYCLE.md windowFor) and, under
  //      EXIT_POLICY=time_half, to half its horizon unless ≥ +0.5R. Past that it
  //      is closed at the LIVE mid with exit_reason 'time_stop'. DKS/JNJ sat open
  //      from Aug 28 because nothing applied a clock. No live quote → skip.
  try {
    const { readExitPolicy } = await import('@shared/exit-policy');
    const policy = readExitPolicy(process.env);
    const books = sleeves.timeStopRetired && owner.primary ? await botPortfolios(owner) : [portfolio];
    for (const book of books) {
      for (const pos of (await getOpenPositions(book.id)) as any[]) {
        if (pos.assetType !== 'option' || sleeveOfPosition(pos) !== 'swing') continue;
        const idea: any = pos.tradeIdeaId ? await storage.getTradeIdeaById(pos.tradeIdeaId).catch(() => null) : null;
        let liveUnderlying: number | null = null;
        if (policy === 'time_half' && idea) {
          try {
            const { getRealtimeQuote } = await import('./realtime-pricing-service');
            const q = await getRealtimeQuote(pos.symbol, 'stock' as any);
            liveUnderlying = q && q.price > 0 && !q.proxy ? q.price : null;
          } catch { /* judged without the R test */ }
        }
        const v = timeStopDue({
          nowMs: Date.now(),
          idea: idea ? {
            direction: idea.direction, entryPrice: Number(idea.entryPrice), stopLoss: Number(idea.stopLoss), targetPrice: Number(idea.targetPrice),
            assetType: idea.assetType, holdingPeriod: idea.holdingPeriod, tradeType: idea.tradeType, source: idea.source,
            expiryDate: idea.expiryDate ?? pos.expiryDate, generatedAt: idea.timestamp ?? null, exitBy: idea.exitBy ?? null,
          } : null,
          entryTime: pos.entryTime ?? null,
          direction: pos.direction === 'short' ? 'short' : 'long',
          expiryDate: pos.expiryDate ?? null,
          liveUnderlying,
          policy,
        });
        if (!v.due) continue;
        const live = await liveContractQuote(pos, 0.6);
        if (!live) { logger.warn(`[QUANT-BOT] time stop due on ${pos.symbol} (${v.why}) — no live quote, not closed on a stale mark`); continue; }
        // Time stops close at the LIVE MID (operator rule) — tagged so the fill
        // audit classifies it as a mid, not a bid fill.
        await closePosition(pos.id, live.mid, `time_stop [fill-mid mid=${live.mid.toFixed(4)} bid=${live.q.bid.toFixed(4)} ask=${live.q.ask.toFixed(4)} source=${live.q.source ?? 'unknown'} delayed=${!!live.q.delayed} observedAt=${new Date().toISOString()}]`);
        const why = `time stop — ${v.why} · mid ${live.mid.toFixed(2)} (${live.stamp})${book.id !== portfolio.id ? ' · retired run' : ''}`;
        await announce(pos, live.mid, why);
        closed.push({ symbol: pos.symbol, reason: why });
      }
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] time-stop hygiene failed:', err);
  }

  // Announce anything the board has newly published. Piggy-backs on the bot cycle
  // because it already holds a fresh conviction set; a separate cron would rebuild
  // the same expensive thing on its own schedule and drift out of step with it.
  if (alerts) try {
    const { alertNewSignals } = await import('./signal-alerts');
    // peekConvictions() is a CACHE-ONLY read that returns null on a cold cache and
    // never computes. Using it here meant alerts fired only if a human had loaded
    // the Oracle page in this same process since the last restart — otherwise this
    // block silently did nothing, with no error and no log. Signals scored 92 and
    // were never announced anywhere. getCachedConvictions() builds on a miss.
    const { getCachedConvictions } = await import('./convictions-engine');
    const board = await getCachedConvictions();
    const picks = board?.picks ?? [];
    if (picks.length) {
      const sent = await alertNewSignals(picks as any);
      logger.info(`[QUANT-BOT] board has ${picks.length} pick(s); announced ${sent}`);
    } else {
      // Silence has to be loud. An empty board is a real condition worth seeing.
      logger.warn('[QUANT-BOT] conviction board returned 0 picks — nothing to announce');
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] signal alerts failed:', err);
  }

  // OPEX awareness. An IWM $296P was held into monthly expiration and settled
  // worthless because nothing in the cycle knew the date mattered. Contracts
  // expiring INTO the monthly are flagged before the roll/exit passes run, so the
  // decision is made with the calendar in view rather than after the fact.
  try {
    const { getOpexContext } = await import('@shared/opex-calendar');
    const opex = getOpexContext();
    if (opex.isOpexDay || opex.isOpexWeek) {
      const open = await getOpenPositions(portfolio.id);
      const atRisk = open.filter(
        (p: any) => p.assetType === 'option' && p.expiryDate && String(p.expiryDate).slice(0, 10) <= opex.thisMonth,
      );
      if (atRisk.length) {
        logger.warn(
          `[QUANT-BOT] ${opex.label}: ${atRisk.length} position(s) expire on or before ${opex.thisMonth} — ` +
          atRisk.map((p: any) => `${p.symbol} $${p.strikePrice}${String(p.optionType)[0].toUpperCase()}`).join(', '),
        );
      }
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] opex check failed:', err);
  }

  // 3.5 — gap magnets. A static stop and target cannot see that the underlying has
  // a high-confidence unfilled gap sitting below a position that is well in profit.
  // MARA ran to +159% with a gap 12.4% under it on a name that has filled 100% of
  // 31 past gaps in a median of 3 sessions, and the bot held it back to +74%
  // because nothing consulted that. This banks the gain and records the level, so
  // the fill becomes a re-entry trigger rather than just a loss avoided.
  try {
    const { evaluateGapExit, describeGapExit } = await import('./gap-aware-exits');
    const { rateLimited } = await import('./provider-cache');
    const stillOpen = await getOpenPositions(portfolio.id);

    for (const pos of stillOpen) {
      if (pos.assetType !== 'option') continue;
      const cost = Number(pos.entryPrice) * Number(pos.quantity) * 100;
      const gainPct = cost > 0 ? (Number(pos.unrealizedPnL ?? 0) / cost) * 100 : 0;
      if (gainPct < 40) continue;   // cheap pre-filter before any network call

      const chart: any = await rateLimited('yahoo', 1200, async () => {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${pos.symbol}?range=2y&interval=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        );
        return r.ok ? r.json() : null;
      });
      const res = chart?.chart?.result?.[0];
      const q = res?.indicators?.quote?.[0];
      if (!res || !q) continue;
      const bars = (res.timestamp || [])
        .map((t: number, i: number) => ({
          time: t, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i],
        }))
        .filter((b: any) => [b.open, b.high, b.low, b.close].every((v: any) => Number.isFinite(v)));

      // A long call is threatened by a gap below; a long put by one above.
      const dir = pos.optionType === 'put' ? 'short' : 'long';
      const signal = evaluateGapExit(bars, gainPct, dir as 'long' | 'short');
      if (signal.action !== 'scale_out') continue;

      logger.info(describeGapExit(pos.symbol, signal));
      const mark = Number(pos.currentPrice ?? pos.entryPrice);
      const gx = await closeOptionPositionAtBid(pos.id, 'gap_magnet');
      if (!gx.success) continue;
      await announce(pos, Number(gx.position?.exitPrice ?? mark), `gap magnet at $${signal.gapLevel?.toFixed(2)} — banked +${gainPct.toFixed(0)}%`);
      closed.push({ symbol: pos.symbol, reason: `gap magnet at $${signal.gapLevel?.toFixed(2)} — banked +${gainPct.toFixed(0)}%` });
      gapWatch.push({ symbol: pos.symbol, level: signal.gapLevel ?? 0 });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] gap-exit check failed:', err);
  }

  // 3.7 — thesis check. The operator's rule, verbatim: "bot should be able to
  // take profit and switch thesis when the intelligence does." A bracket knows
  // two prices; it cannot know that the board now publishes the OPPOSITE
  // direction on a held name, or that the session's options tape turned
  // decisively against it. Two independent triggers, both evidence-gated:
  //   • BOARD FLIP — the conviction board's current pick on this symbol points
  //     the other way at or above the bot's own entry floor. The board is the
  //     strategy; holding against it measures nothing.
  //   • FLOW REVERSAL — >=$750k of dominant premium against the position at
  //     >=2:1 skew, with no tape-read contradiction (same honesty bar the
  //     generator's flow signal uses — skew alone can't tell buyer from seller,
  //     so the threshold is higher here than for entries).
  // Green positions bank the gain; red ones stop the bleeding. Either way the
  // exit reason names the evidence so the ledger can score this rule later.
  try {
    const { getCachedConvictions } = await import('./convictions-engine');
    const board = await getCachedConvictions();
    const byOppDir = new Map<string, any>();
    for (const p of board?.picks ?? []) byOppDir.set(`${p.symbol}:${p.direction}`, p);

    let flowAgainst: Map<string, { prem: number; skew: number }> | null = null;
    try {
      const { getTodayFlows } = await import('./options-flow-scanner');
      flowAgainst = new Map();
      const agg = new Map<string, { call: number; put: number; tapeNet: number }>();
      for (const f of getTodayFlows() as any[]) {
        const a = agg.get(f.symbol) ?? { call: 0, put: 0, tapeNet: 0 };
        // ×100 restores real dollars from the scanner's per-contract-price
        // units — without it the $750k reversal floor was effectively $75M
        // and this exit could never fire. (Unit bug, caught 2026-09-08.)
        const dollars = f.premium * 100;
        if (f.optionType === 'call') a.call += dollars; else a.put += dollars;
        if (f.biasBasis === 'tape') a.tapeNet += f.sentiment === 'bullish' ? 1 : f.sentiment === 'bearish' ? -1 : 0;
        agg.set(f.symbol, a);
      }
      for (const [sym, a] of agg) {
        const dom = a.call >= a.put ? 'call' : 'put';
        const domPrem = Math.max(a.call, a.put);
        const skew = Math.min(a.call, a.put) > 0 ? domPrem / Math.min(a.call, a.put) : Infinity;
        if (domPrem < 750_000 || skew < 2) continue;
        if (dom === 'call' && a.tapeNet < 0) continue;
        if (dom === 'put' && a.tapeNet > 0) continue;
        flowAgainst.set(`${sym}:${dom === 'call' ? 'long' : 'short'}`, { prem: domPrem, skew });
      }
    } catch { /* scanner cold — board flip still runs */ }

    const held = await getOpenPositions(portfolio.id);
    for (const pos of held as any[]) {
      const thesis = pos.optionType === 'put' ? 'short' : 'long';
      const opposite = thesis === 'long' ? 'short' : 'long';
      const mark = Number(pos.currentPrice ?? pos.entryPrice);
      if (!Number.isFinite(mark) || mark <= 0) continue;
      const cost = Number(pos.entryPrice) * Number(pos.quantity) * 100;
      const pnlPct = cost > 0 ? (Number(pos.unrealizedPnL ?? 0) / cost) * 100 : 0;
      const pnlWord = pnlPct >= 0 ? `banked +${pnlPct.toFixed(0)}%` : `cut at ${pnlPct.toFixed(0)}%`;

      // Board flip gated on the ONE grade: the opposite setup must be NEXUS grade B or better.
      const flip = byOppDir.get(`${pos.symbol}:${opposite}`);
      const flipGrade = flip ? gradePick(flip) : null;
      if (flip && flipGrade && gradeAtLeast(flipGrade, 'B')) {
        const fx0 = await closeOptionPositionAtBid(pos.id, 'thesis_flip');
        if (!fx0.success) continue;
        const why = `board flipped ${opposite.toUpperCase()} on ${pos.symbol} (NEXUS ${formatNexusGrade(flipGrade)}) — ${pnlWord}`;
        await announce(pos, Number(fx0.position?.exitPrice ?? mark), why);
        closed.push({ symbol: pos.symbol, reason: why });
        continue;
      }

      // Flow-reversal exits are restricted to RED positions. The exit autopsy
      // replayed every green flow-reversal exit against the position's own
      // brackets: TSLA +364 would have been +2,696, AAPL −249 would have hit
      // target for +774. Opposing tape on a losing position is a cut signal;
      // on a winning one it is not evidence the brackets are wrong. (Board
      // FLIPS above still exit either way — a published opposite signal is a
      // stronger claim than tape skew.)
      const fx = flowAgainst?.get(`${pos.symbol}:${opposite}`);
      if (fx && (pos.unrealizedPnL ?? 0) < 0) {
        const fr = await closeOptionPositionAtBid(pos.id, 'flow_reversal');
        if (!fr.success) continue;
        const skewStr = fx.skew === Infinity ? 'one-sided' : `${fx.skew.toFixed(1)}:1`;
        const why = `options tape turned against it — $${(fx.prem / 1e6).toFixed(1)}M ${opposite === 'long' ? 'call' : 'put'} premium at ${skewStr} — ${pnlWord}`;
        await announce(pos, Number(fr.position?.exitPrice ?? mark), why);
        closed.push({ symbol: pos.symbol, reason: why });
      }
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] thesis check failed:', err);
  }

  // 2d — wide underlying stop (swing sleeve, shared/wide-stops.ts). A contract
  //      opened under BOT_WIDE_STOPS carries `ustop:<side>:<px>` — the further of
  //      the plan's structural stop and BOT_STOP_ATR_MULT × daily ATR(14). When the
  //      LIVE underlying reaches it the contract exits at the live bid. Its premium
  //      stop (the delta-implied value at that same underlying stop) is checked in
  //      step 3 in place of the DTE-aware −25…−75% stops, which would cut the
  //      trade inside its own invalidation. Whichever fires first exits.
  const wideStopIds = new Set<string>();
  try {
    for (const pos of (await getOpenPositions(portfolio.id)) as any[]) {
      if (pos.assetType !== 'option' || zeroDteManaged.has(pos.id)) continue;
      const u = parseUstopTag(pos.entrySignals);
      if (!u) continue;
      wideStopIds.add(pos.id);
      let liveU: number | null = null;
      try {
        const { getRealtimeQuote } = await import('./realtime-pricing-service');
        const q = await getRealtimeQuote(pos.symbol, 'stock' as any);
        liveU = q && q.price > 0 && !q.proxy ? q.price : null;
      } catch { /* not judged without a live underlying */ }
      if (!underlyingStopCrossed(u.side, liveU, u.stop)) continue;
      const live = await liveContractQuote(pos, 0.6);
      if (!live) { logger.warn(`[QUANT-BOT] ${pos.symbol} underlying ${liveU} through the wide stop ${u.stop} — no live contract quote, not closed on a stale mark`); continue; }
      await closePosition(pos.id, live.bid, `underlying_stop ${exitAuditTag(live.q, new Date())}`);
      wideStopIds.delete(pos.id);
      const why = `underlying stop — ${pos.symbol} ${liveU} through ${u.stop} (wide ATR stop) · ${live.stamp}`;
      await announce(pos, live.bid, why);
      closed.push({ symbol: pos.symbol, reason: why });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] underlying-stop check failed:', err);
  }

  // 3 — premium stop / target (0DTE-sleeve rows are bracketed in 2a instead —
  //     the shared DTE-aware stop would cut them at −35% before the sleeve's −40%;
  //     wide-stop swing rows use their own premium stop, see 2d).
  try {
    const exited = await checkStopsAndTargets(portfolio.id, { skipIds: zeroDteManaged, premiumStopOnlyIds: wideStopIds });
    for (const p of exited ?? []) {
      const reason = (p as any).exitReason ?? 'stop/target';
      closed.push({ symbol: p.symbol, reason });
      await announce(p, Number((p as any).exitPrice ?? 0), reason);
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] exit check failed:', err);
  }

  // 4 — entries: two sleeves, separate capacity (shared/bot-sleeves.ts).
  try {
    await enterSleeves({ cfg, sleeves, stopCfg, portfolio, opened, tally, owner });
  } catch (err) {
    logger.warn('[QUANT-BOT] entry pass failed:', err);
  }

  // 3 — snapshot the curve so performance is measurable over time
  try { await recordEquitySnapshot(portfolio.id); } catch { /* non-fatal */ }
  // total_value = cash + open positions at their marks, for every run, every cycle.
  try {
    const { syncBotPortfolioValue } = await import('./bot-reconcile');
    for (const p of await botPortfolios(owner)) await syncBotPortfolioValue(p.id);
  } catch (err) { logger.warn('[QUANT-BOT] value sync failed:', err); }

  const openCount = (await getOpenPositions(portfolio.id)).length;
  const skipSummary = tally.summary();
  logger.info(`[QUANT-BOT] ${owner.primary ? 'cycle' : `${owner.label} cycle`}: +${opened.length} opened, -${closed.length} closed, ${openCount} open · ${formatSkipSummary(skipSummary)}`);
  if (owner.primary) try {
    const { pulse } = await import('./system-pulse');
    if (opened.length || closed.length) {
      pulse('bot', `bot: ${opened.length ? `opened ${opened.map((o) => o.symbol).join(', ')}` : ''}${opened.length && closed.length ? ' · ' : ''}${closed.length ? `closed ${closed.map((c) => c.symbol).join(', ')}` : ''} — ${openCount} open`);
    } else {
      pulse('bot', `bot cycle: book re-priced, ${openCount} position(s) held, nothing new qualified`);
    }
  } catch { /* pulse is decoration */ }
  // Persist the levels we left on. A gap exit is only half the trade the bot was
  // missing — the other half is noticing when that gap fills, because at that point
  // the reason for leaving is gone. This does NOT re-enter on its own: the
  // conviction engine still has to publish a fresh signal. It only clears the block,
  // which is the difference between a rule and a hunch.
  if (owner.primary && gapWatch.length) {
    try {
      const { setBotGapWatch } = await import('./gap-aware-exits');
      await setBotGapWatch(gapWatch);
      logger.info(`[QUANT-BOT] watching ${gapWatch.length} gap level(s) for re-entry`);
    } catch (err) {
      logger.warn('[QUANT-BOT] could not persist gap watch:', err);
    }
  }

  return { ranAt, portfolioId: portfolio.id, opened, closed, skipped: skipSummary.total, openCount, gapWatch, skipSummary };
}

/** Daily ATR(14) of the underlying (server/lib/atr-stop-floor.ts atr14), null when candles are unavailable. */
async function dailyAtr14(symbol: string): Promise<number | null> {
  try {
    const { fetchCandles } = await import('./historical-candles');
    const { atr14 } = await import('./lib/atr-stop-floor');
    return atr14(await fetchCandles(symbol, '3mo', '1d'));
  } catch { return null; }
}

/**
 * 0DTE opening grace inputs: minutes since the fill (cheap check first — no network
 * outside the grace window), the live underlying, and today's opening range from
 * 1-minute bars. Any piece missing → zeroDteGrace says "stop applies".
 */
async function zeroDteGraceVerdict(pos: any, entryPremium: number, mark: number, stopCfg: BotStopConfig): Promise<{ hold: boolean; reason: string } | null> {
  const entryMs = Date.parse(String(pos.entryTime ?? ''));
  const nowMs = Date.now();
  if (!(stopCfg.zeroDteGraceMin > 0) || !Number.isFinite(entryMs) || nowMs - entryMs >= stopCfg.zeroDteGraceMin * 60_000) return null;
  const side: Side = underlyingSide(pos);
  let underlying: number | null = null;
  let or: { high: number; low: number } | null = null;
  try {
    const { etParts, etWallToMs, RTH_OPEN_ET } = await import('@shared/loss-rules');
    const p = etParts(nowMs);
    const openMs = etWallToMs(p.y, p.m, p.d, RTH_OPEN_ET);
    const { fetchCandles } = await import('./historical-candles');
    const bars = (await fetchCandles(pos.symbol, '1d', '1m')).map((b) => ({ t: b.time * 1000, h: b.high, l: b.low, c: b.close }));
    or = openingRange(bars, openMs, stopCfg.zeroDteOrMin);
    // Only a COMPLETE opening range counts.
    if (nowMs < openMs + stopCfg.zeroDteOrMin * 60_000) or = null;
    try {
      const { getRealtimeQuote } = await import('./realtime-pricing-service');
      const q = await getRealtimeQuote(pos.symbol, 'stock' as any);
      underlying = q && q.price > 0 && !q.proxy ? q.price : null;
    } catch { /* fall back to the last 1-minute bar below */ }
    const last = bars[bars.length - 1];
    if (underlying == null && last && nowMs - last.t <= 3 * 60_000) underlying = last.c;
  } catch { /* unknown → the stop applies */ }
  return zeroDteGrace({ entryMs, nowMs, side, premiumEntry: entryPremium, premiumMark: mark, underlying, orHigh: or?.high ?? null, orLow: or?.low ?? null }, stopCfg);
}

/** A LIVE two-sided quote for a held contract, or null (never a stale mark). */
async function liveContractQuote(pos: any, maxSpreadPct: number): Promise<{ bid: number; ask: number; mid: number; stamp: string; q: import('./tradier-api').OptionMark } | null> {
  if (!pos?.optionType || !pos?.strikePrice || !pos?.expiryDate) return null;
  try {
    const { getOptionMark } = await import('./tradier-api');
    const q = await getOptionMark({ underlying: pos.symbol, optionType: pos.optionType, strike: Number(pos.strikePrice), expiryDate: String(pos.expiryDate).slice(0, 10) });
    const v = executableQuote(q as any, { nowMs: Date.now(), maxSpreadPct });
    if (!v.ok || !q) return null;
    return { bid: q.bid, ask: q.ask, mid: (q.bid + q.ask) / 2, stamp: v.stamp ?? q.source, q };
  } catch { return null; }
}


interface EnterCtx {
  cfg: BotConfig;
  sleeves: ReturnType<typeof readBotSleeveConfig>;
  stopCfg: BotStopConfig;
  portfolio: any;
  opened: BotRunResult['opened'];
  tally: SkipTally;
  owner: BotOwner;
}

/**
 * The entry pass. Two sleeves, each with its own capacity; every refusal is
 * tallied by reason. Kept gates: tape sit-out, loss rules 1 (confluence) and 2
 * (entry window), BTC-proxy short discipline, one position per symbol, NO
 * opposite directions on one symbol across every bot run, and fills only on an
 * executable live quote (stamped into the fill).
 */
async function enterSleeves(ctx: EnterCtx): Promise<void> {
  const { cfg, sleeves, stopCfg, portfolio, opened, tally, owner } = ctx;
  const nowMs = Date.now();
  const open = await getOpenPositions(portfolio.id);
  const held = { '0dte': 0, swing: 0 } as Record<BotSleeve, number>;
  for (const p of open as any[]) held[sleeveOfPosition(p)]++;
  tally.capacity = { '0dte': { held: held['0dte'], max: sleeves.zeroDteMax }, swing: { held: held.swing, max: sleeves.swingMax } };

  // Every open position the bot holds in ANY run: one symbol, one side.
  const sideBySymbol = new Map<string, Set<'long' | 'short'>>();
  for (const book of await botPortfolios(owner)) {
    for (const p of (await getOpenPositions(book.id)) as any[]) {
      const k = String(p.symbol).toUpperCase();
      if (!sideBySymbol.has(k)) sideBySymbol.set(k, new Set());
      sideBySymbol.get(k)!.add(underlyingSide(p));
    }
  }
  const heldSymbols = new Set((open as any[]).map((p) => String(p.symbol).toUpperCase()));
  // No same-day re-entry after a stop-out (any run).
  const stoppedToday = new Set<string>();
  for (const book of await botPortfolios(owner)) {
    try {
      const rows = await storage.getPaperPositionsByPortfolio(book.id);
      for (const s of stoppedOutToday(rows as any[], nowMs)) stoppedToday.add(s);
    } catch { /* a book that cannot be read cannot block */ }
  }
  const sideConflict = (symbol: string, side: 'long' | 'short') => {
    const s = sideBySymbol.get(symbol.toUpperCase());
    return !!s && s.has(side === 'long' ? 'short' : 'long');
  };
  const noteFilled = (symbol: string, side: 'long' | 'short') => {
    const k = symbol.toUpperCase();
    heldSymbols.add(k);
    if (!sideBySymbol.has(k)) sideBySymbol.set(k, new Set());
    sideBySymbol.get(k)!.add(side);
  };

  // THE DAY IS A FILTER TOO (tape conditions). Sitting in cash is a position.
  let tapeVerdict: string | null = null;
  try {
    const { getTapeConditions } = await import('./tape-conditions');
    const tape = await getTapeConditions();
    tapeVerdict = tape.verdict;
    if (tape.verdict === 'sit_out') {
      logger.warn(`[QUANT-BOT] SIT OUT (tape ${tape.score}) — no entries this cycle. ${tape.headline}`);
      tape.signals.filter((x) => x.points < 0).forEach((x) => logger.warn(`  ${x.label}: ${x.detail}`));
      tally.add('all', '—', 'tape_sit_out', tape.headline, 0);
      return;
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] tape read failed, proceeding without the gate:', err);
  }
  // A selective tape halves dollars, never the sample.
  const riskFraction = tapeVerdict === 'selective' ? (cfg.riskPerTradePct / 100) / 2 : cfg.riskPerTradePct / 100;
  if (tapeVerdict === 'selective') logger.info(`[QUANT-BOT] selective tape — half size (${(riskFraction * 100).toFixed(1)}%/trade)`);

  const lossRulesMod = await import('./loss-rules');
  const { lossRulesConfig, botConfluenceGate, botEntryWindowGate } = lossRulesMod;
  // The blocked-trade ledger is the platform bot's discipline record; a desk bot's refusals are tallied, never written there.
  const noteBotSkip: typeof lossRulesMod.noteBotSkip = owner.primary ? lossRulesMod.noteBotSkip : () => {};
  const { LOSS_RULES_TAG } = await import('@shared/loss-rules');
  const rules = lossRulesConfig();
  const { isBtcProxy, evaluateShortDiscipline } = await import('./short-discipline');
  let btcChange: number | null | undefined;
  const btcProxyBlock = async (symbol: string, side: 'long' | 'short'): Promise<string | null> => {
    if (side !== 'short' || !isBtcProxy(symbol)) return null;
    if (btcChange === undefined) {
      try {
        const { getRealtimeQuote } = await import('./realtime-pricing-service');
        const q = await getRealtimeQuote('BTC', 'crypto' as any);
        btcChange = q && Number.isFinite(q.changePercent) ? q.changePercent : null;
      } catch { btcChange = null; }
    }
    const v = evaluateShortDiscipline({ symbol, direction: side, hasEventCatalyst: false, btcChangePercent: btcChange });
    return v.allowed ? null : v.reason;
  };
  const refuse = (sleeve: BotSleeve, p: any, code: string, reason: string, rank: number, ledger = true) => {
    tally.add(sleeve, String(p.symbol), code, reason, rank);
    if (ledger) noteBotSkip(p, code, reason);
  };

  const { getOptionMark, optionMarkExecutionIssue } = await import('./tradier-api');
  const cashNow = async () => Number((await storage.getPaperPortfolioById(portfolio.id))?.cashBalance ?? portfolio.cashBalance ?? 0);

  // ── 0DTE / 1DTE sleeve ───────────────────────────────────────────────────
  {
    let slots = Math.max(0, sleeves.zeroDteMax - held['0dte']);
    const etMin = etMinutesOf(nowMs);
    const afternoon = etMin >= 13 * 60 + 30;
    let rows: any[] = [];
    try {
      const { db } = await import('./db');
      const { tradeIdeas } = await import('@shared/schema');
      const { and, gte, eq, or, like, inArray, desc } = await import('drizzle-orm');
      const dayStart = new Date(nowMs - 20 * 3_600_000).toISOString();
      rows = await db.select().from(tradeIdeas).where(and(
        gte(tradeIdeas.timestamp, dayStart),
        eq(tradeIdeas.outcomeStatus, 'open' as any),
        or(
          like(tradeIdeas.dataSourceUsed, 'GEX_index_scalp_%'),
          inArray(tradeIdeas.source, ['zero_dte_desk', 'zero_dte_flow', 'gex_magnet', 'index_scalp'] as any),
        ),
      )).orderBy(desc(tradeIdeas.timestamp)).limit(60) as any[];
    } catch (err) {
      logger.warn('[QUANT-BOT] 0DTE candidate read failed:', err);
    }
    const seen = new Set<string>();
    let rank = 0;
    for (const idea of rows) {
      rank++;
      const side: 'long' | 'short' = String(idea.direction).toLowerCase() === 'short' ? 'short' : 'long';
      const key = `${String(idea.symbol).toUpperCase()}:${idea.optionType}:${idea.strikePrice}:${idea.expiryDate}`;
      if (seen.has(key)) continue; // same contract re-published — one decision
      seen.add(key);
      const c = classifyZeroDteIdea(idea, nowMs, sleeves);
      if (!c.ok) {
        // Expired / not-today rows are history, not refusals worth a ledger line.
        if (!['not_today', 'expired_contract', 'resolved', 'not_0dte_source'].includes(c.code)) refuse('0dte', idea, c.code, c.reason, rank, false);
        continue;
      }
      if (!in0dteWindow(nowMs, sleeves)) { refuse('0dte', idea, 'outside_0dte_window', `0DTE sleeve enters ${sleeves.zeroDteWindows.map(([a, b]) => `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}–${Math.floor(b / 60)}:${String(b % 60).padStart(2, '0')}`).join(', ')} ET`, rank, false); continue; }
      if (slots <= 0) { refuse('0dte', idea, 'sleeve_full', `0DTE sleeve full (${sleeves.zeroDteMax})`, rank, false); continue; }
      if (heldSymbols.has(String(idea.symbol).toUpperCase())) { refuse('0dte', idea, 'already_held', 'one position per symbol', rank, false); continue; }
      if (stoppedToday.has(String(idea.symbol).toUpperCase())) { refuse('0dte', idea, 'stopped_today', `${idea.symbol} was stopped out today — no same-day re-entry`, rank); continue; }
      if (sideConflict(idea.symbol, side)) { refuse('0dte', idea, 'opposite_held', `already holding the opposite side of ${idea.symbol} — never both directions at once`, rank); continue; }
      const btc = await btcProxyBlock(idea.symbol, side);
      if (btc) { refuse('0dte', idea, 'btc_proxy', btc, rank); continue; }
      if (owner.entryCheck) {
        const dk = owner.entryCheck({ symbol: idea.symbol, direction: side }, null); // premium-level plan: no underlying stop-width test
        if (!dk.ok) { refuse('0dte', idea, dk.code, dk.reason, rank, false); continue; }
      }
      // Loss rule 2 inside the morning window; the afternoon window is the operator's explicit BOT_0DTE_AFTERNOON opt-in.
      if (rules.botEntryWindow && !afternoon) {
        const w = await botEntryWindowGate({ symbol: idea.symbol, direction: side, entryPrice: Number(idea.entryPrice), currentPrice: null }, idea);
        if (!w.ok) { refuse('0dte', idea, w.code, w.reason, rank); continue; }
      }
      if (rules.botConfluence) {
        const cf = await botConfluenceGate({ symbol: idea.symbol, direction: side, layers: Array.isArray(idea.genScoringLayers) ? idea.genScoringLayers : undefined, source: idea.source }, idea);
        if (!cf.passed) { refuse('0dte', idea, 'confluence', cf.reason, rank); continue; }
      }
      const q = await getOptionMark({ underlying: idea.symbol, optionType: idea.optionType, strike: Number(idea.strikePrice), expiryDate: String(idea.expiryDate).slice(0, 10) }).catch(() => null);
      const qv = executableQuote(q as any, { nowMs, maxSpreadPct: cfg.maxOptionSpreadPct, delayedNotBeforeEt: cfg.zeroDteDelayedNotBeforeEtMinutes });
      if (!qv.ok || !q) { refuse('0dte', idea, qv.code, qv.reason, rank); continue; }
      const qi = entryQuoteIssue(q, cfg.zeroDteDelayedNotBeforeEtMinutes, optionMarkExecutionIssue);
      if (qi) { refuse('0dte', idea, q.delayed ? 'delayed_quote' : 'stale_quote', qi, rank); continue; }
      const zGrade = gradeIdeaRow(idea, nowMs);
      const qty = zeroDteQuantity(q.ask, sleeves);
      if (qty < 1) { refuse('0dte', idea, 'too_expensive', `one contract at $${q.ask.toFixed(2)} risks $${(q.ask * 100 * sleeves.premStopPct).toFixed(0)} at the −${Math.round(sleeves.premStopPct * 100)}% stop > $${sleeves.zeroDteRiskUsd} sleeve risk`, rank); continue; }
      const cash = await cashNow();
      const tradeable: any = {
        ...idea,
        assetType: 'option',
        catalyst: `[0DTE SLEEVE · ${c.kind} · ${c.dte}DTE · NEXUS ${formatNexusGrade(zGrade)}] ${idea.catalyst ?? ''} ${entryAuditTag(q, new Date())}`,
        currentPrice: q.ask,
        entryPrice: q.ask,
        stopLoss: Number((q.ask * (1 - sleeves.premStopPct)).toFixed(2)),
        targetPrice: Number((q.ask * (1 + sleeves.premT2Pct)).toFixed(2)),
        qualitySignals: [
          ...(Array.isArray(idea.qualitySignals) ? idea.qualitySignals : []),
          sleeveTag('0dte'), `zero_dte_kind:${c.kind}`, `quote:${qv.stamp}`, gradeComponentsTag(zGrade),
          ...(rules.botConfluence || rules.botEntryWindow ? [LOSS_RULES_TAG] : []),
        ],
      };
      const res = await executeTradeIdea(portfolio.id, tradeable, { riskFraction: Math.min(1, sleeves.zeroDteRiskUsd / Math.max(1, cash)), maxQuantity: qty });
      if (!res.success) { refuse('0dte', idea, 'no_fill', res.error ?? 'no fill', rank); continue; }
      slots--;
      noteFilled(idea.symbol, side);
      opened.push({ symbol: idea.symbol, reason: `0DTE sleeve · ${c.kind} ${c.dte}DTE ${idea.optionType} $${idea.strikePrice} x${res.position?.quantity ?? qty} @ $${q.ask.toFixed(2)} (${qv.stamp})` });
      if (owner.primary) await announceEntry(idea.symbol, tradeable, res, null, idea.analysis ?? null, zGrade);
    }
  }

  // ── Swing sleeve: NEXUS ideas by NEXUS grade (BOARD_SORT-independent) ────
  {
    let slots = Math.max(0, sleeves.swingMax - held.swing);
    const { getCachedConvictions } = await import('./convictions-engine');
    const { gradePick } = await import('@shared/nexus-grade');
    const { publishMsOf } = await import('@shared/setup-lifecycle');
    const board = await getCachedConvictions({});
    const graded = (board.picks ?? [])
      .filter((p: any) => !p.isBotHeld)
      .map((p: any) => ({ p, ideaId: p.ideaId, grade: gradePick(p, nowMs), publishMs: publishMsOf(p) }));
    const ordered = swingOrder(graded);

    const chaseOf = (p: any) => {
      const live = p.currentPrice;
      if (!live || !p.entryPrice || !p.targetPrice) return 0;
      const span = p.direction === 'long' ? p.targetPrice - p.entryPrice : p.entryPrice - p.targetPrice;
      const done = p.direction === 'long' ? live - p.entryPrice : p.entryPrice - live;
      return span > 0 ? (done / span) * 100 : 0;
    };
    const triggered = (p: any) => {
      const live = p.currentPrice;
      if (!live || !p.entryPrice) return false;
      return p.direction === 'long' ? live >= p.entryPrice : live <= p.entryPrice;
    };
    const stoppedOut = (p: any) => {
      const live = p.currentPrice;
      if (!live || !p.stopLoss) return false;
      return p.direction === 'long' ? live <= p.stopLoss : live >= p.stopLoss;
    };

    let rank = 0;
    for (const { p: pick, grade } of ordered) {
      rank++;
      const side: 'long' | 'short' = pick.direction === 'short' ? 'short' : 'long';
      const gtxt = `NEXUS ${formatNexusGrade(grade)}`;
      // 0DTE-kind ideas belong to the other sleeve — not a refusal.
      const zeroBound = (src: any, dsu: any, expiry: any, hp: any) => {
        const kind = zeroDteKindOf({ source: src, dataSourceUsed: dsu ?? (src === 'gex_scanner' && /day/i.test(String(hp ?? '')) ? 'GEX_index_scalp_' : null) });
        const dte = daysToExpiry(expiry, nowMs);
        return !!kind && (dte == null || dte <= sleeves.zeroDteMaxDte);
      };
      if (zeroBound(pick.source, (pick as any).dataSourceUsed, pick.expiryDate, pick.holdingPeriod)) continue;
      if (!isLiveGrade(grade) || grade.score < sleeves.swingMinGrade) { refuse('swing', pick, 'grade_below_min', `${gtxt} — needs live & ≥ ${sleeves.swingMinGrade} (${grade.factors[0].label})`, rank, false); continue; }
      if (slots <= 0) { refuse('swing', pick, 'sleeve_full', `swing sleeve full (${sleeves.swingMax})`, rank, false); continue; }
      if (heldSymbols.has(String(pick.symbol).toUpperCase())) { refuse('swing', pick, 'already_held', 'one position per symbol', rank, false); continue; }
      if (stoppedToday.has(String(pick.symbol).toUpperCase())) { refuse('swing', pick, 'stopped_today', `${pick.symbol} was stopped out today — no same-day re-entry`, rank); continue; }
      if (sideConflict(pick.symbol, side)) { refuse('swing', pick, 'opposite_held', `already holding the opposite side of ${pick.symbol} — never both directions at once`, rank); continue; }
      if (!triggered(pick)) { refuse('swing', pick, 'pending_trigger', `live ${pick.currentPrice ?? '—'} has not traded through entry ${pick.entryPrice}`, rank, false); continue; }
      if (stoppedOut(pick)) { refuse('swing', pick, 'stopped_out', 'price already through the stop — idea invalidated', rank); continue; }
      const chase = chaseOf(pick);
      if (chase > cfg.maxProgressPct) { refuse('swing', pick, 'chase', `${chase.toFixed(0)}% of the way to T1 already (limit ${cfg.maxProgressPct}%)`, rank); continue; }
      const btc = await btcProxyBlock(pick.symbol, side);
      if (btc) { refuse('swing', pick, 'btc_proxy', btc, rank); continue; }
      const idea: any = await storage.getTradeIdeaById(pick.ideaId).catch(() => null);
      if (!idea) { refuse('swing', pick, 'idea_missing', 'idea row not found', rank, false); continue; }
      if (zeroBound(idea.source, idea.dataSourceUsed, idea.expiryDate, idea.holdingPeriod)) continue; // the 0DTE sleeve decides it
      if (idea.assetType !== 'option') { refuse('swing', pick, 'not_option', 'idea has no option vehicle — the bot trades contracts only', rank); continue; }
      if (owner.entryCheck) {
        const dk = owner.entryCheck(pick, idea);
        if (!dk.ok) { refuse('swing', pick, dk.code, dk.reason, rank, false); continue; }
      }
      if (rules.botEntryWindow) {
        const w = await botEntryWindowGate({ symbol: pick.symbol, direction: side, entryPrice: pick.entryPrice, currentPrice: pick.currentPrice }, idea);
        if (!w.ok) { refuse('swing', pick, w.code, w.reason, rank); continue; }
      }
      let families: string[] | undefined;
      if (rules.botConfluence) {
        const cf = await botConfluenceGate({ symbol: pick.symbol, direction: side, layers: pick.layers as any, source: pick.source }, idea);
        if (!cf.passed) { refuse('swing', pick, 'confluence', cf.reason, rank); continue; }
        families = cf.families;
      }

      const underlyingEntry = Number(idea.entryPrice ?? pick.entryPrice);
      const underlyingStop = Number(idea.stopLoss ?? pick.stopLoss);
      const underlyingT1 = Number(idea.targetPrice ?? pick.targetPrice);
      const direction = side === 'short' ? 'bearish' : 'bullish';
      const directionValid = direction === 'bullish'
        ? underlyingStop < underlyingEntry && underlyingT1 > underlyingEntry
        : underlyingStop > underlyingEntry && underlyingT1 < underlyingEntry;
      const risk = Math.abs(underlyingEntry - underlyingStop);
      const rr = risk > 0 ? Math.abs(underlyingT1 - underlyingEntry) / risk : 0;
      if (!directionValid || rr < cfg.minUnderlyingRR) { refuse('swing', pick, 'weak_plan', `invalid/weak underlying plan (R:R ${rr.toFixed(2)}, minimum ${cfg.minUnderlyingRR.toFixed(2)})`, rank); continue; }

      // Wide stop (shared/wide-stops.ts): the further of the plan's structural stop and
      // BOT_STOP_ATR_MULT × daily ATR(14). R:R above is judged on the PLAN (thesis
      // quality); the wide stop sets the exit and the size — never the dollars at risk.
      let botStop = underlyingStop;
      let stopNote = '';
      if (stopCfg.enabled) {
        const atr = await dailyAtr14(idea.symbol);
        const w = widenStop({ entry: underlyingEntry, stop: underlyingStop, side, atr, mult: stopCfg.atrMult });
        if (w) {
          botStop = w.stop;
          stopNote = w.widened
            ? `wide stop ${w.stop} (${stopCfg.atrMult}× ATR ${atr?.toFixed(2)}; plan ${underlyingStop})`
            : `plan stop ${w.stop} kept (wider than ${stopCfg.atrMult}× ATR${atr ? ` ${atr.toFixed(2)}` : ' — no ATR'})`;
        }
      }

      const cash = await cashNow();
      const riskBudget = Math.min(cash * riskFraction, sleeves.swingRiskUsd);
      const maxDebit = Math.min(cash * cfg.maxDebitPct, sleeves.swingMaxDebitUsd, riskBudget / 0.5);
      const holding = String(idea.holdingPeriod ?? pick.holdingPeriod ?? '').toLowerCase();
      const setup = holding.includes('day') ? 'scalp' : holding.includes('position') ? 'position' : 'swing';
      const { selectContracts } = await import('./option-selection-engine');
      const selection = await selectContracts({
        symbol: idea.symbol, direction, setup,
        entry: underlyingEntry, stop: botStop, t1: underlyingT1,
        holdingDays: Number((pick as any).horizonDays ?? idea.horizonDays ?? 0) || undefined,
        applyDteFit: true, // loss rule 4 (LOSS_RULE_DTE_FIT)
        conviction: convictionDisplayPercent(pick.convictionScore ?? 0),
        asOfSpot: Number(pick.currentPrice ?? 0) || undefined,
        accountSize: cash, riskBudgetDollars: riskBudget, maxDebitDollars: maxDebit,
        minRoiAtT1Pct: cfg.minContractRoiAtT1Pct,
      });
      const recommended = selection.recommendedTier ? selection.picks.find((x) => x.tier === selection.recommendedTier) : null;
      const selected = recommended && recommended.fitsAccount && recommended.grade !== 'F' ? recommended : null;
      if (!selected) {
        refuse('swing', pick, selection.dteGateNote?.startsWith('DTE fit') ? 'dte_fit' : 'no_contract', `${selection.dteGateNote ? `${selection.dteGateNote} — ` : ''}${selection.note ?? 'no contract clears reachability/account gates'} (max debit $${maxDebit.toFixed(0)})`, rank);
        continue;
      }
      const q = await getOptionMark({ underlying: idea.symbol, optionType: selected.optionType, strike: selected.strike, expiryDate: selected.expiry }).catch(() => null);
      const qv = executableQuote(q as any, { nowMs, maxSpreadPct: cfg.maxOptionSpreadPct, delayedNotBeforeEt: cfg.delayedFillNotBeforeEtMinutes });
      if (!qv.ok || !q) { refuse('swing', pick, qv.code, qv.reason, rank); continue; }
      const qi = entryQuoteIssue(q, cfg.delayedFillNotBeforeEtMinutes, optionMarkExecutionIssue);
      if (qi) { refuse('swing', pick, q.delayed ? 'delayed_quote' : 'stale_quote', qi, rank); continue; }
      const premium = q.ask; // a long option crosses the spread
      // Premium stop: legacy −50%, or (wide stops) the delta-implied premium at the wide
      // underlying stop — sized so the dollar risk stays at the sleeve budget.
      let premiumStop = Number((premium * 0.5).toFixed(2));
      let maxQty = Math.max(1, Number(selected.maxContracts ?? 1));
      const stopTags: string[] = [];
      if (stopCfg.enabled) {
        const ps = optionPremiumStop({ premium, delta: selected.delta, underlyingEntry, underlyingStop: botStop }, stopCfg);
        if (!ps) { refuse('swing', pick, 'no_contract', `no premium stop for ${selected.optionType} $${selected.strike} @ $${premium}`, rank); continue; }
        const byRisk = sizeForRisk(riskBudget, ps.riskPerContract); // = executeTradeIdea's budget at effectiveRisk below
        if (byRisk < 1) { refuse('swing', pick, 'too_expensive', `one contract risks $${ps.riskPerContract.toFixed(0)} to the wide stop ${botStop} > $${riskBudget.toFixed(0)} trade risk`, rank); continue; }
        premiumStop = ps.stop;
        maxQty = Math.min(maxQty, byRisk);
        stopTags.push(ustopTag(side as Side, botStop), `prem_stop:${ps.basis}:${ps.stop}`, `stop_atr_mult:${stopCfg.atrMult}`);
        stopNote += ` · premium stop $${ps.stop} (${ps.basis === 'delta' ? `Δ ${Math.abs(selected.delta).toFixed(2)}` : `−${Math.round(stopCfg.fallbackPremStopPct * 100)}% fallback`}) · ≤${maxQty} contract(s) at $${ps.riskPerContract.toFixed(0)} risk each`;
      }
      const tradeable: any = {
        ...idea,
        catalyst: `[SWING SLEEVE · ${gtxt} · ${selection.recommendedTier} · ${selected.grade}${stopNote ? ` · ${stopNote}` : ''}] ${selected.rationale} ${entryAuditTag(q, new Date())}`,
        assetType: 'option',
        optionType: selected.optionType, strikePrice: selected.strike, expiryDate: selected.expiry,
        currentPrice: premium, entryPrice: premium,
        targetPrice: Number((premium * 2).toFixed(2)),
        stopLoss: premiumStop,
        qualitySignals: [
          ...(Array.isArray(idea.qualitySignals) ? idea.qualitySignals : []),
          sleeveTag('swing'), gradeComponentsTag(grade), `evidence_score:${pick.convictionScore}`, `quote:${qv.stamp}`,
          ...stopTags,
          ...(rules.botConfluence || rules.botEntryWindow || rules.dteFit ? [LOSS_RULES_TAG] : []),
          ...(families?.length ? [`confluence:${families.join('+')}`] : []),
        ],
      };
      const effectiveRisk = Math.min(riskFraction, sleeves.swingRiskUsd / Math.max(1, cash));
      const res = await executeTradeIdea(portfolio.id, tradeable, { riskFraction: effectiveRisk, maxQuantity: maxQty });
      if (!res.success) { refuse('swing', pick, 'no_fill', res.error ?? 'no fill', rank); continue; }
      slots--;
      noteFilled(pick.symbol, side);
      opened.push({ symbol: pick.symbol, reason: `swing sleeve · ${gtxt} · R:R 1:${(pick.riskRewardRatio ?? 0).toFixed(1)} · ${qv.stamp}` });
      if (owner.primary) await announceEntry(pick.symbol, tradeable, res, pick, pick.thesis ?? null, grade);
    }
  }
}

/** Discord entry alert — never rolls back a fill. */
async function announceEntry(symbol: string, tradeable: any, res: any, pick: any | null, analysis: string | null, grade: NexusGrade | null = null): Promise<void> {
  void import('./bot-discord-notifier').then((n) => n.postBotEntry(res?.position, tradeable, pick, grade ? `${grade.letter} ${grade.score}` : null)).catch(() => {});
  if (!discordAlerts) return;
  try {
    const { sendBotTradeEntryToDiscord } = await import('./discord-service');
    await sendBotTradeEntryToDiscord({
      symbol,
      assetType: 'option',
      optionType: tradeable.optionType ?? null,
      strikePrice: tradeable.strikePrice ?? null,
      expiryDate: tradeable.expiryDate ?? null,
      entryPrice: Number(tradeable.entryPrice ?? 0),
      quantity: Number(res.position?.quantity ?? 1),
      targetPrice: pick?.targetPrice ?? tradeable.targetPrice ?? null,
      stopLoss: pick?.stopLoss ?? tradeable.stopLoss ?? null,
      nexusGrade: grade ? { letter: grade.letter, score: grade.score, version: grade.version } : null,
      riskRewardRatio: pick?.riskRewardRatio ?? null,
      analysis,
      signals: pick ? (pick.layers ?? []).filter((l: any) => l.points > 0).slice(0, 4).map((l: any) => l.why).filter(Boolean) : [],
      portfolio: 'Quant Bot',
      source: 'quant-bot',
    } as any);
  } catch (err: any) {
    logger.warn(`[QUANT-BOT] entry alert failed for ${symbol}: ${err?.message ?? err}`);
  }
}


export interface BotOpenPositionView {
  [k: string]: any;
  runId: string;
  runLabel: string;
  /** Minutes since the mark was taken; null when the row was never marked. */
  markAgeMin: number | null;
  /** True when no mark exists — P&L must render as unknown, never as $0. */
  unmarked: boolean;
}

export interface BotRunStatus {
  id: string; name: string; displayName: string; runNo: number; label: string; short: string;
  start: string | null; end: string | null; active: boolean;
  startingCapital: number;
  cashBalance: number;
  /** Open positions at their marks (cost for a never-marked row, counted in `unmarked`). */
  positionsValue: number;
  /** cash + positionsValue — computed at read, never the stored column. */
  totalValue: number;
  /** What paper_portfolios.total_value says, for audit (it used to drift). */
  storedTotalValue: number;
  realizedPnL: number;
  unrealizedPnL: number | null;
  closed: number;
  open: number;
  unmarked: number;
  oldestMarkAt: string | null;
}

export interface BotStatus {
  /** The run the bot trades now. */
  portfolioId: string;
  name: string;
  label: string;
  startingCapital: number;
  cashBalance: number;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  /** Closed exits in the ACTIVE run. */
  closedCount: number;
  /** Open positions in EVERY run, each labelled with its run and mark age. */
  openPositions: BotOpenPositionView[];
  /** Newest 40 exits across every run, labelled. */
  closedPositions: any[];
  runs: BotRunStatus[];
  config: BotConfig;
  /** When marks were last refreshed by a read (re-pricing is throttled to 1/min). */
  repricedAt: string | null;
  lastCycle: BotCycleStamp | null;
  /** Sleeve capacity in the active run (shared/bot-sleeves.ts). */
  sleeves: Record<BotSleeve, { held: number; max: number; [k: string]: unknown }>;
}

export interface BotCycleStamp {
  at: string; origin: string; opened: number; closed: number; skipped: number; openCount: number; error?: string;
  /** Which process ran it (pid + ROLE) — the web process reads the worker's stamp. */
  pid?: number; role?: string;
  /** Why candidates were refused (counts by reason + the best-ranked three). */
  skipSummary?: SkipSummary;
  openedList?: BotRunResult['opened'];
}
const BOT_CYCLE_SHARED = 'quant-bot-cycle';
let lastCycle: BotCycleStamp | null = null;
export function noteBotCycle(origin: string, r: BotRunResult | null, error?: string): void {
  lastCycle = {
    at: new Date().toISOString(), origin, opened: r?.opened.length ?? 0, closed: r?.closed.length ?? 0, skipped: r?.skipped ?? 0, openCount: r?.openCount ?? 0, error,
    pid: process.pid, role: processRole(), skipSummary: r?.skipSummary, openedList: r?.opened,
  };
  // The bot runs in the worker; the bot page is served by the web process.
  void import('./lib/shared-state').then(({ writeSharedSync }) => writeSharedSync(BOT_CYCLE_SHARED, lastCycle)).catch(() => {});
}
/** The newest cycle stamp: this process's, or the worker's via shared state. */
async function latestBotCycle(): Promise<BotCycleStamp | null> {
  try {
    const { readShared } = await import('./lib/shared-state');
    const r = readShared<BotCycleStamp>(BOT_CYCLE_SHARED);
    const shared = r?.data ?? null;
    if (!lastCycle) return shared;
    if (!shared) return lastCycle;
    return Date.parse(shared.at) > Date.parse(lastCycle.at) ? shared : lastCycle;
  } catch { return lastCycle; }
}
// One re-price at a time, at most once a minute. The status endpoint used to
// re-price the whole book on EVERY read (2–33 s each on prod) and three
// components polled it independently — which is what tripped the rate limiter.
let repricedAt = 0;
let repricing: Promise<void> | null = null;
async function repriceThrottled(activeId: string): Promise<void> {
  if (repricing) return repricing;
  if (Date.now() - repricedAt < 60_000) return;
  repricing = (async () => {
    try { await updatePositionPrices(activeId); } catch { /* stale marks keep their age */ }
    try { await repriceRetiredRuns(activeId); } catch { /* same */ }
    repricedAt = Date.now();
  })().finally(() => { repricing = null; });
  return repricing;
}

export async function getBotStatus(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotStatus | null> {
  // A GET must never create a portfolio or disguise a storage failure as an empty book.
  const portfolio: any = await findBotPortfolio();
  if (!portfolio?.id) return null;

  await repriceThrottled(portfolio.id);

  const { loadBotLedger } = await import('./bot-ledger');
  const ledger = await loadBotLedger();
  const now = Date.now();
  const runStatus: BotRunStatus[] = [];
  const openAll: BotOpenPositionView[] = [];
  const closedAll: any[] = [];
  for (const run of ledger.runs) {
    const pf: any = ledger.portfolios.find((p) => p.id === run.id);
    const rows = ledger.positions.filter((x) => x.portfolioId === run.id);
    let positionsValue = 0; let unreal = 0; let unmarked = 0; let oldest: string | null = null; let realized = 0;
    for (const x of rows) {
      if (x.status === 'closed') {
        realized += Number(x.realizedPnL ?? 0);
        closedAll.push({ ...x, runId: run.id, runLabel: run.label });
        continue;
      }
      const mult = x.assetType === 'option' ? 100 : 1;
      const marked = x.currentPrice != null && Number.isFinite(Number(x.currentPrice)) && !!x.lastPriceUpdate;
      positionsValue += Number(marked ? x.currentPrice : x.entryPrice) * Number(x.quantity) * mult;
      if (marked) {
        unreal += (Number(x.currentPrice) - Number(x.entryPrice)) * Number(x.quantity) * mult * (x.assetType === 'option' || x.direction === 'long' ? 1 : -1);
        if (!oldest || String(x.lastPriceUpdate) < oldest) oldest = String(x.lastPriceUpdate);
      } else unmarked++;
      const age = marked ? (now - Date.parse(String(x.lastPriceUpdate))) / 60_000 : null;
      openAll.push({
        ...x,
        runId: run.id,
        runLabel: run.label,
        markAgeMin: age != null && Number.isFinite(age) ? Math.max(0, Math.round(age)) : null,
        unmarked: !marked,
        // Never a zero standing in for "unknown".
        unrealizedPnL: marked ? x.unrealizedPnL : null,
        unrealizedPnLPercent: marked ? x.unrealizedPnLPercent : null,
      });
    }
    const cash = Number(pf?.cashBalance ?? 0);
    runStatus.push({
      id: run.id, name: run.name, displayName: run.displayName, runNo: run.runNo, label: run.label, short: run.short,
      start: run.start, end: run.end, active: run.active, startingCapital: run.startingCapital,
      cashBalance: cash,
      positionsValue: Math.round(positionsValue * 100) / 100,
      totalValue: Math.round((cash + positionsValue) * 100) / 100,
      storedTotalValue: Number(pf?.totalValue ?? 0),
      realizedPnL: Math.round(realized * 100) / 100,
      unrealizedPnL: run.open - unmarked > 0 ? Math.round(unreal * 100) / 100 : run.open ? null : 0,
      closed: run.closed, open: run.open, unmarked, oldestMarkAt: oldest,
    });
  }
  const active = runStatus.find((r) => r.id === portfolio.id)!;
  const startingCapital = active?.startingCapital ?? cfg.startingCapital;
  const totalValue = active?.totalValue ?? startingCapital;
  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    label: active?.label ?? portfolio.name,
    startingCapital,
    cashBalance: active?.cashBalance ?? 0,
    totalValue,
    totalPnL: Math.round((totalValue - startingCapital) * 100) / 100,
    totalPnLPercent: startingCapital > 0 ? ((totalValue - startingCapital) / startingCapital) * 100 : 0,
    closedCount: active?.closed ?? 0,
    openPositions: openAll,
    closedPositions: closedAll
      .sort((a, b) => Date.parse(b.exitTime ?? 0) - Date.parse(a.exitTime ?? 0))
      .slice(0, 40),
    runs: runStatus,
    config: cfg,
    repricedAt: repricedAt ? new Date(repricedAt).toISOString() : null,
    lastCycle: await latestBotCycle(),
    sleeves: (() => {
      const sc = readBotSleeveConfig(process.env);
      const held = { '0dte': 0, swing: 0 } as Record<BotSleeve, number>;
      for (const x of openAll) if (x.runId === portfolio.id) held[sleeveOfPosition(x as any)]++;
      return {
        '0dte': { held: held['0dte'], max: sc.zeroDteMax, riskUsd: sc.zeroDteRiskUsd, windows: sc.zeroDteWindows, flattenEt: sc.flattenEt },
        swing: { held: held.swing, max: sc.swingMax, minGrade: sc.swingMinGrade, riskUsd: sc.swingRiskUsd, maxDebitUsd: sc.swingMaxDebitUsd },
      };
    })(),
  };
}
