/**
 * PUBLIC SHOWCASE — the landing page's live product panels (GET /api/public/showcase).
 *
 * Read-only, no auth, one payload built at most every 15 s and shared by every
 * visitor (in-flight deduped). Every section is built independently: a section
 * that fails keeps its last good value and says how old it is, or is null —
 * never a made-up number.
 *
 *   quotes     SPY / QQQ / BTC through the canonical quote paths (Coinbase
 *              stream for BTC, realtime-pricing-service for equities), each
 *              with its source and as-of time.
 *   gex        SPY dealer levels + regime + a small strike profile from the
 *              canonical GEX engine (gamma-exposure.ts). The chain is heavy, so
 *              it refreshes in the background at most every 2 min and the last
 *              good read is served with its age.
 *   ideas      NEXUS ideas DELAYED: only ideas published ≥ 24 h ago (or already
 *              closed). Today's live book is for members.
 *   crypto     top movers from crypto-pulse (24 h change).
 *   catalysts  next earnings from the high-attention calendar.
 *   bot        Quantinum Bot record, model-record style: n closed, win rate only
 *              when n ≥ 30, since date. Journal = the bot's book stats.
 *   record     the landing's record strip: the NEXUS ideas book, BAR-VERIFIED
 *              rows only (shared/landing-record.ts) — never the recorded total.
 *              Reads every desk row, so it refreshes at most every 10 min in the
 *              background; its asOf is the verification ledger's time.
 */
import { summarizeVerifiedBook, type PublicRecord } from '../shared/landing-record';
import { pickWalls } from '../shared/gex-wall-basis';
import { and, desc, eq, gte, lte, isNotNull } from 'drizzle-orm';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { logger } from './logger';

const TTL_MS = 15_000;
const GEX_REFRESH_MS = 120_000;
const SECTION_TIMEOUT_MS = 6_000;
const MIN_SAMPLE = 30;

type Section<T> = { data: T | null; asOf: string | null; error?: string };

export interface ShowcaseQuote { symbol: string; price: number; changePct: number | null; source: string; asOf: string; delayed?: boolean }
export interface ShowcaseGex {
  symbol: string; spot: number; callWall: number | null; putWall: number | null; zeroGamma: number | null;
  /** Which book the walls/zero-γ are from — shared/gex-wall-basis.ts (≤7d, else all-expiry fallback). */
  wallBasis: 'next7' | 'all'; wallBasisLabel: string;
  maxGammaStrike: number | null; regime: string | null; netGexB: number | null; source: string | null;
  chainAgeMs: number | null; delayedFeed: boolean;
  profile: Array<{ strike: number; netGex: number }>;
}
export interface ShowcaseIdea { symbol: string; side: string; band: string | null; publishedAt: string; outcome: string | null; percentGain: number | null; assetType: string }
export interface ShowcaseMover { symbol: string; name: string; price: number; change24h: number }
export interface ShowcaseCatalyst { symbol: string; date: string; estimate: string | null }
export interface ShowcaseBot {
  closed: number; open: number; wins: number; winRate: number | null; minSample: number;
  netRealizedPnL: number; avgWinPct: number | null; avgLossPct: number | null; profitFactor: number | null;
  since: string | null; runLabel: string | null; startingCapital: number | null;
}
export interface Showcase {
  builtAt: string;
  quotes: Section<ShowcaseQuote[]>;
  gex: Section<ShowcaseGex>;
  ideas: Section<ShowcaseIdea[]>;
  crypto: Section<ShowcaseMover[]>;
  catalysts: Section<ShowcaseCatalyst[]>;
  bot: Section<ShowcaseBot>;
  record: Section<PublicRecord>;
}

function withTimeout<T>(p: Promise<T>, ms = SECTION_TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// Last good value per section — served with its own asOf when a rebuild fails.
const lastGood: Partial<Record<keyof Omit<Showcase, 'builtAt'>, Section<any>>> = {};
async function section<K extends keyof Omit<Showcase, 'builtAt'>, T>(key: K, build: () => Promise<T | null>): Promise<Section<T>> {
  try {
    const data = await withTimeout(build());
    if (data == null || (Array.isArray(data) && data.length === 0)) throw new Error('empty');
    const s: Section<T> = { data, asOf: new Date().toISOString() };
    lastGood[key] = s;
    return s;
  } catch (err) {
    const prev = lastGood[key];
    if (prev) return { ...prev, error: 'serving last good read' };
    return { data: null, asOf: null, error: err instanceof Error ? err.message : 'unavailable' };
  }
}

async function buildQuotes(): Promise<ShowcaseQuote[]> {
  const { getRealtimeQuote } = await import('./realtime-pricing-service');
  const { getCryptoPrice } = await import('./realtime-price-service');
  const out: ShowcaseQuote[] = [];
  for (const sym of ['SPY', 'QQQ']) {
    const q = await getRealtimeQuote(sym, 'stock').catch(() => null);
    if (q && q.price > 0) {
      out.push({ symbol: sym, price: q.price, changePct: Number.isFinite(q.changePercent) ? q.changePercent : null, source: q.source ?? 'quote', asOf: new Date(q.lastUpdate).toISOString(), delayed: q.delayed || q.stale || undefined });
    }
  }
  const live = getCryptoPrice('BTC');
  const btc = await getRealtimeQuote('BTC', 'crypto').catch(() => null);
  if (live && live.price > 0) {
    out.push({ symbol: 'BTC', price: live.price, changePct: btc && Number.isFinite(btc.changePercent) ? btc.changePercent : null, source: 'coinbase', asOf: live.timestamp.toISOString() });
  } else if (btc && btc.price > 0) {
    out.push({ symbol: 'BTC', price: btc.price, changePct: btc.changePercent ?? null, source: btc.source ?? 'quote', asOf: new Date(btc.lastUpdate).toISOString() });
  }
  return out;
}

// GEX: background refresh, never on the request path once warm.
let gexCache: { data: ShowcaseGex; at: number } | null = null;
let gexInflight: Promise<void> | null = null;
function refreshGex(): Promise<void> {
  if (gexInflight) return gexInflight;
  gexInflight = (async () => {
    try {
      const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
      const r = await calculateAggregateGammaExposure('SPY');
      if (!r || !(r.spotPrice > 0)) return;
      const spot = r.spotPrice;
      const near = r.strikes
        .filter((s) => Math.abs(s.strike - spot) / spot <= 0.035)
        .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
        .slice(0, 25)
        .sort((a, b) => b.strike - a.strike)
        .map((s) => ({ strike: s.strike, netGex: s.netGEX }));
      gexCache = {
        at: Date.now(),
        data: {
          symbol: 'SPY', spot,
          // The platform's one wall basis (same numbers as Today / ticker / NEXUS).
          ...((w) => ({ callWall: w.callWall, putWall: w.putWall, zeroGamma: w.flip, wallBasis: w.basis, wallBasisLabel: w.basisShort }))(
            pickWalls({ callWall: r.callWall, putWall: r.putWall, flip: r.zeroGammaLevel ?? r.flipPoint ?? null, byDte: r.byDte }),
          ),
          maxGammaStrike: r.maxGammaStrike ?? null,
          regime: (r.regime as string) ?? null,
          netGexB: Number.isFinite(r.totalNetGEX) ? r.totalNetGEX : null,
          source: r.dataQuality?.chainFeed ?? r.dataSource ?? null,
          chainAgeMs: r.dataQuality?.chainAgeMs ?? null,
          delayedFeed: !!r.dataQuality?.chainDelayedFeed,
          profile: near,
        },
      };
    } catch (err) {
      logger.warn('[SHOWCASE] SPY GEX refresh failed', err);
    } finally {
      gexInflight = null;
    }
  })();
  return gexInflight;
}
async function buildGex(): Promise<Section<ShowcaseGex>> {
  if (!gexCache || Date.now() - gexCache.at > GEX_REFRESH_MS) {
    const p = refreshGex();
    // Cold start: wait (bounded) for the first read; warm: refresh in the background.
    if (!gexCache) await withTimeout(p, 14_000).catch(() => undefined);
  }
  if (!gexCache) return { data: null, asOf: null, error: 'GEX not computed yet' };
  return { data: gexCache.data, asOf: new Date(gexCache.at).toISOString() };
}

/**
 * The landing's sample ideas (audit 2026-10-01 item 8): the most recent ≥24h-old
 * ideas from the clean-era (post-baseline) set, one per symbol, in publish
 * order — NO preference for closed (or winning) ideas, so the window carries
 * no selection bias. Rows must already be sorted newest first.
 */
export function pickShowcaseIdeas<T extends { symbol: string; timestamp: string }>(rows: T[], n = 3): T[] {
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const r of rows) {
    if (String(r.timestamp).slice(0, 10) < OUTCOME_BASELINE_DATE) continue;
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    picked.push(r);
    if (picked.length === n) break;
  }
  return picked;
}

async function buildIdeas(): Promise<ShowcaseIdea[]> {
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = await db.select({
    symbol: tradeIdeas.symbol, direction: tradeIdeas.direction, band: tradeIdeas.genConvictionBand,
    timestamp: tradeIdeas.timestamp, outcome: tradeIdeas.outcomeStatus, percentGain: tradeIdeas.percentGain,
    assetType: tradeIdeas.assetType,
  }).from(tradeIdeas)
    .where(and(eq(tradeIdeas.status, 'published'), lte(tradeIdeas.timestamp, cutoff), gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE), isNotNull(tradeIdeas.genConvictionScore)))
    .orderBy(desc(tradeIdeas.timestamp))
    .limit(40);
  const picked = pickShowcaseIdeas(rows);
  return picked.map((r) => ({
    symbol: r.symbol, side: r.direction, band: r.band ?? null, publishedAt: r.timestamp,
    outcome: r.outcome && r.outcome !== 'open' ? r.outcome : null,
    percentGain: r.outcome && r.outcome !== 'open' && Number.isFinite(r.percentGain as number) ? (r.percentGain as number) : null,
    assetType: r.assetType,
  }));
}

async function buildCrypto(): Promise<ShowcaseMover[]> {
  const { getCryptoPulse } = await import('./crypto-pulse');
  const p = await getCryptoPulse();
  return p.assets
    .filter((a) => a.price > 0 && Number.isFinite(a.change24h))
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, 5)
    .map((a) => ({ symbol: a.symbol, name: a.name, price: a.price, change24h: a.change24h }));
}

async function buildCatalysts(): Promise<ShowcaseCatalyst[]> {
  const { getHighAttentionEarnings } = await import('./earnings-trade-scanner');
  const today = new Date().toISOString().slice(0, 10);
  const list = await getHighAttentionEarnings(20);
  return list
    .filter((e) => e.reportDate >= today)
    .sort((a, b) => (a.isHighAttention === b.isHighAttention ? a.reportDate.localeCompare(b.reportDate) : a.isHighAttention ? -1 : 1))
    .slice(0, 3)
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .map((e) => ({ symbol: e.symbol, date: e.reportDate, estimate: e.estimate }));
}

async function buildBot(): Promise<ShowcaseBot> {
  const { loadBotLedger } = await import('./bot-ledger');
  const ledger = await loadBotLedger();
  const run = ledger.runs.find((r) => r.id === ledger.activeId) ?? ledger.runs[ledger.runs.length - 1] ?? null;
  const positions = run ? ledger.positions.filter((p) => p.portfolioId === run.id) : [];
  const closed = positions.filter((p) => p.status !== 'open' && p.realizedPnL != null);
  const wins = closed.filter((p) => (p.realizedPnL ?? 0) > 0);
  const losses = closed.filter((p) => (p.realizedPnL ?? 0) < 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const grossWin = sum(wins.map((p) => p.realizedPnL ?? 0));
  const grossLoss = Math.abs(sum(losses.map((p) => p.realizedPnL ?? 0)));
  const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);
  const enough = closed.length >= MIN_SAMPLE;
  return {
    closed: closed.length,
    open: positions.filter((p) => p.status === 'open').length,
    wins: wins.length,
    winRate: enough ? wins.length / closed.length : null,
    minSample: MIN_SAMPLE,
    netRealizedPnL: sum(closed.map((p) => p.realizedPnL ?? 0)),
    avgWinPct: enough ? avg(wins.map((p) => p.realizedPnLPercent ?? 0)) : null,
    avgLossPct: enough ? avg(losses.map((p) => p.realizedPnLPercent ?? 0)) : null,
    profitFactor: enough && grossLoss > 0 ? grossWin / grossLoss : null,
    since: run?.start ?? null,
    runLabel: run?.label ?? null,
    startingCapital: run?.startingCapital ?? null,
  };
}

const RECORD_REFRESH_MS = 600_000;
let recordCache: { data: PublicRecord; at: number } | null = null;
let recordInflight: Promise<void> | null = null;
function refreshRecord(): Promise<void> {
  if (recordInflight) return recordInflight;
  recordInflight = (async () => {
    const { loadNexusBookForPublicRecord } = await import('./journal-sources');
    const { rows, verification } = await loadNexusBookForPublicRecord();
    const { callAccuracyHeadline } = await import('./managed-replay-ledger');
    const ca = callAccuracyHeadline();
    recordCache = {
      data: {
        ...summarizeVerifiedBook(rows, {
          unverified: verification?.unverified.count ?? 0, ledgerAsOf: verification?.ledger?.asOf ?? null, minSample: MIN_SAMPLE,
          unverifiedSymbols: verification?.unverified.rows.map((r) => r.symbol),
        }),
        callAccuracy: ca ? {
          rate: ca.overall.n >= MIN_SAMPLE ? ca.overall.rate : null, wins: ca.overall.wins, losses: ca.overall.losses, n: ca.overall.n,
          from: ca.overall.from, to: ca.overall.to, ledgerAsOf: ca.ledgerAsOf,
        } : null,
      },
      at: Date.now(),
    };
  })().catch((err) => { logger.warn('[showcase] record refresh failed', { err: err instanceof Error ? err.message : String(err) }); })
    .finally(() => { recordInflight = null; });
  return recordInflight;
}
async function buildRecord(): Promise<Section<PublicRecord>> {
  if (!recordCache || Date.now() - recordCache.at > RECORD_REFRESH_MS) {
    const p = refreshRecord();
    if (!recordCache) await withTimeout(p, 10_000).catch(() => undefined);
  }
  if (!recordCache) return { data: null, asOf: null, error: 'record not computed yet' };
  // The record is as old as its verification ledger, not as old as this read.
  return { data: recordCache.data, asOf: recordCache.data.ledgerAsOf ?? new Date(recordCache.at).toISOString() };
}

let cached: { value: Showcase; at: number } | null = null;
let inflight: Promise<Showcase> | null = null;

export async function getPublicShowcase(): Promise<Showcase> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (inflight) return inflight;
  inflight = (async () => {
    const [quotes, gex, ideas, crypto, catalysts, bot, record] = await Promise.all([
      section('quotes', buildQuotes),
      buildGex(),
      section('ideas', buildIdeas),
      section('crypto', buildCrypto),
      section('catalysts', buildCatalysts),
      section('bot', buildBot),
      buildRecord(),
    ]);
    const value: Showcase = { builtAt: new Date().toISOString(), quotes, gex, ideas, crypto, catalysts, bot, record };
    cached = { value, at: Date.now() };
    return value;
  })().finally(() => { inflight = null; });
  return inflight;
}
