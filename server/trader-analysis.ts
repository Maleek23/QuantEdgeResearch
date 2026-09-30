/**
 * Trader analysis, leaderboard, and the NEXUS "Trader calls" feed.
 *
 *   traderAnalysis(slug)   one trader: stated stats (entry AND exit posted),
 *                          measured-on-underlying outcomes for calls without an
 *                          exit, best setups/tickers, per-call rows with links
 *   leaderboard()          every trader with scored calls, ranked (shared/trader-ranking.ts)
 *   traderCallsFeed()      open calls ≤ N trading days old from traders who pass
 *                          the threshold, repriced LIVE on the underlying
 *
 * Measured outcomes use daily bars (server/historical-candles.ts): reference =
 * the open of the first bar that starts after the post, then up to 5 bars —
 * labelled "measured on underlying", never the trader's P&L.
 *
 * EVIDENCE, NOT AN AUTO-TRADE: nothing here is read by the bot or its
 * confluence gates (shared/loss-rules.ts). NEXUS shows these as a labelled
 * evidence source with the message link and the call's age.
 *
 * Thresholds (env, else TRADER_FEED_DEFAULTS):
 *   TRADER_FEED_MIN_SCORE, TRADER_FEED_MIN_SAMPLE, TRADER_FEED_MAX_AGE_DAYS, TRADER_FEED_MIN_CONFIDENCE
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';
import { journalTrades, traders, type JournalTrade, type Trader } from '@shared/schema';
import { traderOwnerId } from '@shared/journal-sources';
import {
  TRADER_FEED_DEFAULTS, ageLabel, feedEligible, measureOnUnderlying, rankTraders, traderStats, underlyingSide,
  type BarRow, type LeaderRow, type MeasuredOutcome, type RankTrade, type TraderFeedConfig, type TraderStats,
} from '@shared/trader-ranking';

const TTL_MS = 30 * 60_000;
const MAX_MEASURED_SYMBOLS = 80;
const MEASURE_LOOKBACK_MS = 700 * 86_400_000;

export function traderFeedConfig(): TraderFeedConfig {
  const num = (k: string, d: number) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && process.env[k]?.trim() ? v : d;
  };
  return {
    minScore: num('TRADER_FEED_MIN_SCORE', TRADER_FEED_DEFAULTS.minScore),
    minSample: num('TRADER_FEED_MIN_SAMPLE', TRADER_FEED_DEFAULTS.minSample),
    maxAgeTradingDays: num('TRADER_FEED_MAX_AGE_DAYS', TRADER_FEED_DEFAULTS.maxAgeTradingDays),
    minConfidence: num('TRADER_FEED_MIN_CONFIDENCE', TRADER_FEED_DEFAULTS.minConfidence),
  };
}

interface CallRow extends RankTrade {
  link: string | null;
  source: string;
  optionType: string | null;
  strike: number | null;
  expiry: string | null;
  target: number | null;
  broker: string;
  /** Where a Discord call's numbers came from: post text, screenshot, or both (forum import). */
  evidence: 'text' | 'vision' | 'text+vision' | null;
}

export interface TraderAnalysis {
  trader: { slug: string; name: string; handle: string | null; source: string | null };
  asOf: string;
  stats: TraderStats;
  calls: (Omit<CallRow, 'measured'> & { measured: MeasuredOutcome | null; statedPnlPct: number | null })[];
  notes: string[];
}

const cache = new Map<string, { at: number; value: TraderAnalysis }>();
let boardCache: { at: number; value: ReturnType<typeof buildBoard> } | null = null;

export function invalidateTraderAnalysis() {
  cache.clear();
  boardCache = null;
  boardInflight = null;
}

function toCall(r: JournalTrade): CallRow {
  const raw = (r.rawCsvRow ?? {}) as Record<string, any>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    id: r.id, symbol: r.symbol, assetType: r.assetType, direction: r.direction, optionType: r.optionType ?? null,
    strike: r.strikePrice ?? null, expiry: r.expiryDate ?? null, setupType: r.setupType ?? null,
    status: r.status, entryPrice: r.entryPrice, exitPrice: r.exitPrice ?? null,
    stop: num(raw.stop), target: num(raw.target),
    entryTime: r.entryTime, exitTime: r.exitTime ?? null, holdingMinutes: r.holdingMinutes ?? null,
    pnlPct: r.status === 'closed' && r.exitPrice != null ? r.realizedPnLPercent ?? null : null,
    confidence: num(raw.confidence) ?? (r.broker === 'discord' ? null : 1),
    link: typeof raw.link === 'string' ? raw.link : null,
    source: r.broker === 'discord' ? 'discord' : r.broker,
    broker: r.broker,
    evidence: raw.evidence === 'vision' || raw.evidence === 'text+vision' || raw.evidence === 'text' ? raw.evidence : r.broker === 'discord' ? 'text' : null,
  };
}

async function barsFor(symbols: string[]): Promise<Map<string, BarRow[]>> {
  const out = new Map<string, BarRow[]>();
  if (!symbols.length) return out;
  try {
    const { fetchCandlesBatch } = await import('./historical-candles');
    const got = await fetchCandlesBatch(symbols, '2y', '1d', 4);
    for (const s of symbols) {
      const rows = (got.get(s) ?? [])
        .map((c) => [c.time < 10_000_000_000 ? c.time * 1000 : c.time, c.open, c.high, c.low, c.close] as BarRow)
        .filter((b) => b.slice(1).every((v) => Number.isFinite(v) && v > 0));
      if (rows.length) out.set(s, rows);
    }
  } catch (e) {
    logger.warn('[TRADER-ANALYSIS] bars unavailable', { error: (e as Error).message });
  }
  return out;
}

async function computeAnalysis(t: Trader): Promise<TraderAnalysis> {
  const rows = await db.select().from(journalTrades).where(eq(journalTrades.userId, traderOwnerId(t.id)));
  const calls = rows.map(toCall).sort((a, b) => Date.parse(b.entryTime) - Date.parse(a.entryTime));
  const now = Date.now();
  // Only calls without a stated exit are measured on the underlying.
  const toMeasure = calls.filter((c) => c.status !== 'closed' && now - Date.parse(c.entryTime) < MEASURE_LOOKBACK_MS);
  const symbols = [...new Set(toMeasure.map((c) => c.symbol))].slice(0, MAX_MEASURED_SYMBOLS);
  const bars = await barsFor(symbols);
  const notes: string[] = [];
  let unmeasured = 0;
  for (const c of toMeasure) {
    const b = bars.get(c.symbol);
    if (!b) { unmeasured++; continue; }
    const expiryMs = c.assetType === 'option' && c.expiry ? Date.parse(`${c.expiry}T20:00:00Z`) : null;
    c.measured = measureOnUnderlying(b, Date.parse(c.entryTime), underlyingSide(c), {
      expiryMs,
      // Stated stop/target are underlying levels only on stock calls (on options they are premiums).
      stop: c.assetType === 'stock' ? c.stop : null,
      target: c.assetType === 'stock' ? c.target : null,
    });
  }
  if (unmeasured) notes.push(`${unmeasured} open call${unmeasured === 1 ? '' : 's'} could not be measured (no daily bars for the underlying).`);
  const olderOpen = calls.filter((c) => c.status !== 'closed' && now - Date.parse(c.entryTime) >= MEASURE_LOOKBACK_MS).length;
  if (olderOpen) notes.push(`${olderOpen} open call${olderOpen === 1 ? '' : 's'} older than the bar history are not measured.`);
  const stats = traderStats(calls);
  return {
    trader: { slug: t.slug, name: t.name, handle: t.handle ?? null, source: t.source ?? null },
    asOf: new Date(now).toISOString(),
    stats,
    calls: calls.slice(0, 300).map((c) => ({ ...c, measured: c.measured ?? null, statedPnlPct: c.pnlPct ?? null })),
    notes,
  };
}

export async function traderAnalysis(slug: string): Promise<TraderAnalysis | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const [t] = await db.select().from(traders).where(eq(traders.slug, slug)).limit(1);
  if (!t) return null;
  const value = await computeAnalysis(t);
  cache.set(slug, { at: Date.now(), value });
  return value;
}

function buildBoard(list: TraderAnalysis[], cfg: TraderFeedConfig) {
  const ranked: LeaderRow[] = rankTraders(list.map((a) => ({ slug: a.trader.slug, name: a.trader.name, stats: a.stats })), cfg);
  return { asOf: new Date().toISOString(), config: cfg, rows: ranked };
}

let boardInflight: Promise<ReturnType<typeof buildBoard>> | null = null;

/**
 * Every trader, ranked. The first read after a restart or import reads daily
 * bars for open calls (cached 30 min); concurrent callers (NEXUS polling, the
 * journal) share one in-flight computation instead of stampeding the bar feed.
 */
export async function leaderboard() {
  if (boardCache && Date.now() - boardCache.at < TTL_MS) return boardCache.value;
  if (boardInflight) return boardInflight;
  boardInflight = (async () => {
    const all = await db.select().from(traders);
    const list: TraderAnalysis[] = [];
    for (const t of all) {
      const a = await traderAnalysis(t.slug);
      if (a && (a.stats.sample > 0 || a.stats.open > 0)) list.push(a);
    }
    const value = buildBoard(list, traderFeedConfig());
    boardCache = { at: Date.now(), value };
    return value;
  })().finally(() => { boardInflight = null; });
  return boardInflight;
}

export interface TraderCall {
  id: string;
  label: 'Trader call';
  trader: { slug: string; name: string; score: number | null; rank: number | null };
  symbol: string;
  assetType: string;
  direction: string;
  /** The view on the underlying (a bought put = short). */
  view: 'long' | 'short';
  optionType: string | null;
  strike: number | null;
  expiry: string | null;
  /** What the post stated, at post time — never presented as current. */
  stated: { entry: number; stop: number | null; target: number | null; units: 'premium' | 'price' };
  postedAt: string;
  age: string;
  link: string | null;
  confidence: number | null;
  /** Live underlying quote at response time (null = no source answered). */
  underlying: { price: number; changePct: number; source: string; live: boolean; asOf: string } | null;
  /** Stock calls only: underlying move vs the stated entry, signed for the call's side, from a live quote. */
  sinceCallPct: number | null;
}

/** Open, recent calls from traders who pass the ranking threshold. */
export async function traderCallsFeed(opts: { symbol?: string | null } = {}) {
  const cfg = traderFeedConfig();
  const board = await leaderboard();
  const passing = board.rows.filter((r) => r.passes);
  const now = Date.now();
  const bySlug = new Map(passing.map((r) => [r.slug, r]));
  const all = passing.length ? await db.select().from(traders).where(inArray(traders.slug, passing.map((r) => r.slug))) : [];
  const owners = new Map(all.map((t) => [traderOwnerId(t.id), t]));
  const rows = owners.size
    ? await db.select().from(journalTrades).where(and(inArray(journalTrades.userId, [...owners.keys()]), eq(journalTrades.status, 'open')))
    : [];
  const sym = opts.symbol?.trim().toUpperCase() || null;
  const eligible = rows
    .map((r) => ({ r, c: toCall(r), t: owners.get(r.userId)! }))
    .filter(({ r, c, t }) => r.broker === 'discord' && (!sym || c.symbol === sym) && feedEligible(c, bySlug.get(t.slug)?.passes ?? false, now, cfg))
    .sort((a, b) => Date.parse(b.c.entryTime) - Date.parse(a.c.entryTime))
    .slice(0, 50);

  // Live reprice of each underlying once (quote source stamped; a bars-derived quote is marked not live).
  const { getQuote } = await import('./market-data-fallback');
  const symbols = [...new Set(eligible.map((e) => e.c.symbol))].slice(0, 30);
  const quotes = new Map<string, TraderCall['underlying']>();
  await Promise.all(symbols.map(async (s) => {
    try {
      const q = await getQuote(s);
      quotes.set(s, q ? { price: q.price, changePct: q.changePct, source: q.source, live: q.source !== 'bars', asOf: new Date().toISOString() } : null);
    } catch { quotes.set(s, null); }
  }));

  const calls: TraderCall[] = eligible.map(({ c, t }) => {
    const u = quotes.get(c.symbol) ?? null;
    const view = underlyingSide(c);
    const since = c.assetType === 'stock' && u?.live && c.entryPrice > 0
      ? Math.round(((u.price - c.entryPrice) / c.entryPrice) * 100 * (view === 'long' ? 1 : -1) * 100) / 100
      : null;
    const lr = bySlug.get(t.slug)!;
    return {
      id: c.id, label: 'Trader call',
      trader: { slug: t.slug, name: t.name, score: lr.stats.score, rank: lr.rank },
      symbol: c.symbol, assetType: c.assetType, direction: c.direction, view,
      optionType: c.optionType, strike: c.strike, expiry: c.expiry,
      stated: { entry: c.entryPrice, stop: c.stop ?? null, target: c.target, units: c.assetType === 'option' ? 'premium' : 'price' },
      postedAt: c.entryTime, age: ageLabel(c.entryTime, now), link: c.link, confidence: c.confidence ?? null,
      underlying: u, sinceCallPct: since,
    };
  });
  return {
    asOf: new Date(now).toISOString(),
    config: cfg,
    traders: passing.map((r) => ({ slug: r.slug, name: r.name, score: r.stats.score, rank: r.rank, sample: r.stats.sample })),
    calls,
    note: 'Evidence, not a signal: calls from ranked traders, repriced live on the underlying. Not used by the bot.',
  };
}
