/**
 * CRYPTO IDEAS ENGINE — native, 24/7 crypto trade ideas (step 1).
 *
 * Before this, "quant" never looked at a coin: the quant generator scans US
 * stocks weekdays 9–15 ET, crypto reached the board only through equity
 * proxies (crypto-proxy-promoter.ts, long-only, cash session, Bullflow-gated),
 * and BTC/ETH/SOL/HYPE/QNT… were display-only on the Crypto tab.
 *
 * WHAT RUNS WHEN (server/idea-producer-schedule.ts, every day incl. weekends)
 *   • scan + publish  — minutes :07 and :37 of every hour (CRYPTO_ENGINE_CRON)
 *   • outcome tracker — every 5 minutes (CRYPTO_TRACKER_CRON)
 *
 * SOURCES (public, no key; cached, requests spaced ≥ 150 ms)
 *   • Coinbase Exchange spot candles — 1h (300 bars, 5-min cache; 4h is built
 *     from 1h in UTC 4h buckets because Coinbase has no 4h granularity), 1d
 *     (300 bars, 30-min cache), 15m for the tracker (60-s cache).
 *   • Hyperliquid perps (api.hyperliquid.xyz/info) — metaAndAssetCtxs (funding,
 *     OI, mark, oracle, 24h notional; 4-min cache) and fundingHistory (24h
 *     average funding; 30-min cache). OI change comes from this process's own
 *     snapshots (taken each scan and each tracker pass) — it is "not measured"
 *     for the first 1.5h after a restart. QNT has no Hyperliquid perp.
 *
 * Every idea is published through storage.createTradeIdea (assetType 'crypto',
 * source 'crypto_engine') with its entry at the live Coinbase price (market
 * entry, trigger recorded at publish), loss-rules stamp computed here on the
 * calendar clock, and a dedicated path tracker (resolveCryptoPath over 15m
 * Coinbase bars since publish) — the stock tracker neither runs on weekends
 * nor prices coins from the right candles.
 */
import { and, desc, eq, gte } from 'drizzle-orm';
import { logger } from './logger';
import {
  analyzeCoin, parseUniverse, resolveCryptoPath, selectForPublish, summarizeCryptoRecord, T,
  type Candle, type CoinRead, type CryptoPlan, type PerpContext, type Trend,
} from '@shared/crypto-ideas-core';
import { LOSS_RULES_VERSION, readLossRulesConfig, type LossRulesStamp } from '@shared/loss-rules';
import { BoundedCache } from './lib/bounded-cache';

export const CRYPTO_SOURCE = 'crypto_engine';
const COINBASE = 'https://api.exchange.coinbase.com';
const HL = 'https://api.hyperliquid.xyz/info';
const UA = { 'User-Agent': 'quantedge-crypto-engine/1.0', Accept: 'application/json' };

const universe = () => parseUniverse(process.env.CRYPTO_IDEAS_UNIVERSE);
const maxPerDay = () => {
  const n = Number(process.env.CRYPTO_IDEAS_MAX_PER_DAY);
  return Number.isFinite(n) && n >= 0 && n <= 50 ? Math.floor(n) : 6;
};
const DEDUP_HOURS = 12;
const MAX_PER_RUN = 3;

// ─── polite fetch + caches ──────────────────────────────────────────────────
let lastReqAt = 0;
async function politeJson(url: string, init?: RequestInit): Promise<any> {
  const wait = lastReqAt + 150 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, signal: ctl.signal });
    if (r.status === 429) throw new Error('HTTP 429 (rate limited)');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const cache = new BoundedCache<string, { at: number; value: any }>({ name: 'crypto.reads', maxEntries: 300, ttlMs: 6 * 3_600_000, maxBytes: 24 * 1024 * 1024 });
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ value: T; at: number }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return { value: hit.value as T, at: hit.at };
  const value = await fn();
  const at = Date.now();
  cache.set(key, { at, value });
  return { value, at };
}

/** Coinbase candles, oldest→newest. Rows are [time, low, high, open, close, volume], newest first. */
export async function coinbaseCandles(symbol: string, granSec: number, opts: { startMs?: number; endMs?: number } = {}): Promise<Candle[]> {
  const q = new URLSearchParams({ granularity: String(granSec) });
  if (opts.startMs) q.set('start', new Date(opts.startMs).toISOString());
  if (opts.endMs) q.set('end', new Date(opts.endMs).toISOString());
  const rows: any[] = await politeJson(`${COINBASE}/products/${encodeURIComponent(symbol)}-USD/candles?${q}`);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ time: Number(r[0]), low: Number(r[1]), high: Number(r[2]), open: Number(r[3]), close: Number(r[4]), volume: Number(r[5]) }))
    .filter((b) => Number.isFinite(b.time) && b.close > 0)
    .sort((a, b) => a.time - b.time);
}

// Hyperliquid context + in-process OI snapshots.
const oiHistory = new Map<string, Array<{ t: number; oi: number }>>();
function noteOi(coin: string, oi: number, t: number) {
  const arr = oiHistory.get(coin) ?? [];
  if (!arr.length || t - arr[arr.length - 1].t >= 60_000) arr.push({ t, oi });
  while (arr.length && t - arr[0].t > 12 * 3_600_000) arr.shift();
  oiHistory.set(coin, arr);
}
function oiChange(coin: string, now: number): { pct: number | null; hours: number | null } {
  const arr = oiHistory.get(coin) ?? [];
  if (arr.length < 2) return { pct: null, hours: null };
  const cur = arr[arr.length - 1];
  // Compare with the oldest snapshot inside an 8h window.
  const base = arr.find((x) => now - x.t <= 8 * 3_600_000) ?? arr[0];
  const hours = (cur.t - base.t) / 3_600_000;
  if (hours < 0.25 || !(base.oi > 0)) return { pct: null, hours: null };
  return { pct: cur.oi / base.oi - 1, hours };
}

interface HlCtx { funding: number; openInterest: number; markPx: number; oraclePx: number; dayNtlVlm: number }
async function hyperliquidContexts(): Promise<{ map: Map<string, HlCtx>; at: number }> {
  const { value, at } = await cached('hl:ctx', 4 * 60_000, async () => {
    const d = await politeJson(HL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }) });
    const map = new Map<string, HlCtx>();
    const uni = d?.[0]?.universe ?? []; const ctxs = d?.[1] ?? [];
    uni.forEach((a: any, i: number) => {
      const c = ctxs[i]; if (!c) return;
      map.set(String(a.name).toUpperCase(), {
        funding: Number(c.funding), openInterest: Number(c.openInterest), markPx: Number(c.markPx), oraclePx: Number(c.oraclePx), dayNtlVlm: Number(c.dayNtlVlm),
      });
    });
    const now = Date.now();
    for (const [k, v] of Array.from(map.entries())) if (Number.isFinite(v.openInterest)) noteOi(k, v.openInterest, now);
    return map;
  });
  return { map: value, at };
}

async function fundingAvg24h(coin: string): Promise<number | null> {
  try {
    const { value } = await cached(`hl:funding:${coin}`, 30 * 60_000, async () => {
      const rows: any[] = await politeJson(HL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'fundingHistory', coin, startTime: Date.now() - 24 * 3_600_000 }) });
      const rates = (Array.isArray(rows) ? rows : []).map((r) => Number(r.fundingRate)).filter(Number.isFinite);
      return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
    });
    return value;
  } catch { return null; }
}

async function perpContext(coin: string, ctxMap: Map<string, HlCtx>, ctxAt: number): Promise<PerpContext | null> {
  const c = ctxMap.get(coin);
  if (!c) return null;
  const oi = oiChange(coin, Date.now());
  return {
    fundingHourly: Number.isFinite(c.funding) ? c.funding : null,
    fundingAvg24h: await fundingAvg24h(coin),
    openInterest: c.openInterest, oiChangePct: oi.pct, oiWindowHours: oi.hours,
    markPx: c.markPx, oraclePx: c.oraclePx,
    basisPct: c.oraclePx > 0 ? (c.markPx - c.oraclePx) / c.oraclePx : null,
    dayNtlVlm: c.dayNtlVlm, asOf: new Date(ctxAt).toISOString(),
  };
}

// ─── scan ───────────────────────────────────────────────────────────────────
export interface CoinStatus extends CoinRead {
  sources: { spot: string; spotAsOf: string | null; perp: string | null; perpAsOf: string | null };
  error?: string;
}
let lastScan: { at: string; coins: CoinStatus[]; published: string[]; skipped: string[] } | null = null;

async function readCoin(sym: string, btcRegime: Trend | null, ctx: { map: Map<string, HlCtx>; at: number } | null): Promise<CoinStatus> {
  const cfg = readLossRulesConfig(process.env);
  try {
    const h1 = await cached(`cb:${sym}:3600`, 5 * 60_000, () => coinbaseCandles(sym, 3600));
    const d1 = await cached(`cb:${sym}:86400`, 30 * 60_000, () => coinbaseCandles(sym, 86400));
    const perp = ctx ? await perpContext(sym, ctx.map, ctx.at) : null;
    const read = analyzeCoin({ symbol: sym, h1: h1.value, d1: d1.value, perp, btcRegime: sym === 'BTC' ? null : btcRegime, nowMs: Date.now(), targetCapMultiple: cfg.targetCapMultiple });
    const lastBar = h1.value.at(-1);
    return {
      ...read,
      sources: {
        spot: 'Coinbase Exchange spot candles (1h, 1d; 4h built from 1h)',
        spotAsOf: new Date(h1.at).toISOString(),
        perp: perp ? 'Hyperliquid perp (funding, OI, mark/oracle)' : null,
        perpAsOf: perp?.asOf ?? null,
      },
      ...(lastBar ? {} : { error: 'no candles' }),
    };
  } catch (err: any) {
    return {
      symbol: sym, price: null, daily: 'mixed', h4: 'mixed', fundingAprPct: null, oiChangePct: null, basisPct: null, plans: [],
      notes: [`data unavailable: ${err?.message ?? err}`],
      sources: { spot: 'Coinbase Exchange spot candles', spotAsOf: null, perp: null, perpAsOf: null }, error: String(err?.message ?? err),
    };
  }
}

export async function scanCrypto(): Promise<CoinStatus[]> {
  const syms = universe();
  let ctx: { map: Map<string, HlCtx>; at: number } | null = null;
  try { ctx = await hyperliquidContexts(); } catch (err: any) { logger.warn(`[CRYPTO-ENGINE] Hyperliquid unavailable: ${err?.message ?? err}`); }
  // BTC first: its regime filters the alts.
  const ordered = ['BTC', ...syms.filter((s) => s !== 'BTC')];
  const out: CoinStatus[] = [];
  let btcRegime: Trend | null = null;
  for (const s of ordered) {
    const r = await readCoin(s, btcRegime, ctx);
    if (s === 'BTC') btcRegime = r.price ? (r.daily === r.h4 ? r.daily : 'mixed') : null;
    if (syms.includes(s)) out.push(r);
  }
  return out;
}

function toIdea(p: CryptoPlan, nowIso: string) {
  const cfg = readLossRulesConfig(process.env);
  const stamp: LossRulesStamp & { clock: string } = {
    version: LOSS_RULES_VERSION, appliedAt: nowIso, clock: 'calendar (crypto trades 24/7)',
    targetCap: {
      applied: p.t1Capped, originalTarget: p.t1Capped ? p.t2 : p.t1, cappedTarget: p.t1Capped ? p.t1 : null,
      expectedMove: p.expectedMove, sigmaDaily: p.sigmaDaily, horizonDays: p.horizonDays, multiple: cfg.targetCapMultiple, note: p.capNote,
    },
    timeStop: { atIso: p.timeStopAtIso, fraction: 0.5, minR: cfg.timeStopMinR, horizonDays: p.horizonDays },
  };
  const side = p.direction.toUpperCase();
  const setupLabel = p.setup.replace(/_/g, ' ');
  const hz = p.horizon === 'intraday' ? 'intraday (12h)' : '1–3 day swing (48h)';
  const analysis = [
    `${p.why}.`,
    `Entry zone ${p.entryZone[0]}–${p.entryZone[1]} (published at live ${p.entry}); stop ${p.stop} (${p.stopBasis}); T1 ${p.t1}${p.t1Capped ? ' (capped at the expected move)' : ''}, T2 ${p.t2}; R:R ${p.rr}.`,
    `Horizon ${hz}; time stop ${p.timeStopAtIso} unless ≥ ${cfg.timeStopMinR}R; out by ${p.exitByIso}.`,
    `Crypto structure grade ${p.grade} (${p.points}/10) — a separate scale from the NEXUS conviction band.`,
    `Evidence: ${p.evidence.join(' · ')}.`,
  ].join(' ');
  return {
    symbol: p.symbol,
    assetType: 'crypto' as const,
    direction: p.direction,
    holdingPeriod: p.horizon === 'intraday' ? 'day' : 'swing',
    entryPrice: p.entry,
    targetPrice: p.t1,
    stopLoss: p.stop,
    riskRewardRatio: p.rr,
    catalyst: `Crypto ${side} · ${setupLabel} · ${p.grade}`,
    analysis,
    sessionContext: '24/7 crypto',
    timestamp: nowIso,
    exitBy: p.exitByIso,
    source: CRYPTO_SOURCE,
    status: 'published',
    dataSourceUsed: `coinbase_spot+hyperliquid_perp:${p.setup}`,
    confidenceScore: Math.min(80, 50 + p.points * 3),
    probabilityBand: 'C',
    qualitySignals: [`setup:${p.setup}`, `crypto_structure_grade:${p.grade}`, `crypto_structure_points:${p.points}`, `horizon:${p.horizon}`, ...p.proxies.map((x) => `proxy_watch:${x}`)],
    outcomeStatus: 'open' as const,
    convergenceSignalsJson: {
      lossRules: stamp,
      executionAudit: { version: 1, state: 'triggered', triggerType: 'market', triggerPrice: p.entry, triggerObservedAt: nowIso, triggerObservedPrice: p.entry },
      cryptoEngine: {
        setup: p.setup, horizon: p.horizon, horizonDays: p.horizonDays, entryZone: p.entryZone, t2: p.t2,
        grade: p.grade, points: p.points, gradeScale: 'crypto structure grade (0–10) — not the conviction band',
        why: p.why, evidence: p.evidence, proxies: p.proxies,
        proxyRule: p.proxies.length ? 'watch proxies — not confirmed until their own tape confirms' : null,
        timeStopAt: p.timeStopAtIso, exitBy: p.exitByIso,
      },
    },
  };
}

async function existingIdeas(sinceMs: number) {
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const rows = await db.select().from(tradeIdeas)
    .where(and(eq(tradeIdeas.source, CRYPTO_SOURCE as any), gte(tradeIdeas.timestamp, new Date(sinceMs).toISOString())))
    .orderBy(desc(tradeIdeas.timestamp)).limit(500);
  return rows;
}

/** Scan the universe and publish the best plans (cap/dedupe). Returns the number published. */
export async function runCryptoIdeasEngine(): Promise<number> {
  const now = Date.now();
  const coins = await scanCrypto();
  const plans = coins.flatMap((c) => c.plans);
  const rows = await existingIdeas(now - 3 * 86_400_000);
  const existing = rows.map((r: any) => ({
    symbol: String(r.symbol).toUpperCase(), direction: String(r.direction),
    setup: (r.convergenceSignalsJson as any)?.cryptoEngine?.setup ?? null,
    timestampMs: Date.parse(r.timestamp), open: (r.outcomeStatus ?? 'open') === 'open' && !r.archived,
  }));
  const { publish, skipped } = selectForPublish(plans, existing, { nowMs: now, maxPerDay: maxPerDay(), dedupHours: DEDUP_HOURS, maxPerRun: MAX_PER_RUN });
  const { storage } = await import('./storage');
  const published: string[] = [];
  for (const p of publish) {
    try {
      await storage.createTradeIdea(toIdea(p, new Date().toISOString()) as any, { dedupWindowHours: 0 });
      published.push(`${p.symbol} ${p.direction} ${p.setup} ${p.grade}`);
      logger.info(`[CRYPTO-ENGINE] 📤 ${p.symbol} ${p.direction} ${p.setup} ${p.grade} @ ${p.entry} stop ${p.stop} T1 ${p.t1}`);
    } catch (err: any) {
      skipped.push({ c: p, why: `write gate: ${err?.message ?? err}` });
    }
  }
  lastScan = {
    at: new Date(now).toISOString(), coins, published,
    skipped: skipped.map((s) => `${s.c.symbol} ${s.c.direction} ${s.c.setup}: ${s.why}`),
  };
  for (const s of lastScan.skipped) logger.info(`[CRYPTO-ENGINE] not published — ${s}`);
  return published.length;
}

// ─── tracker ────────────────────────────────────────────────────────────────
/**
 * Resolve every open crypto_engine idea from Coinbase 15m bars since publish.
 * Runs 24/7. Writes through storage.updateTradeIdeaPerformance — the same
 * columns the stock tracker writes.
 */
export async function trackCryptoIdeas(): Promise<{ checked: number; resolved: number }> {
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const { storage } = await import('./storage');
  try { await hyperliquidContexts(); } catch { /* OI snapshot only */ }
  const open = await db.select().from(tradeIdeas)
    .where(and(eq(tradeIdeas.source, CRYPTO_SOURCE as any), eq(tradeIdeas.outcomeStatus, 'open' as any), eq(tradeIdeas.archived, false)))
    .limit(200);
  let resolved = 0;
  const now = Date.now();
  for (const idea of open as any[]) {
    try {
      const pub = Date.parse(idea.timestamp);
      if (!Number.isFinite(pub)) continue;
      const ce = idea.convergenceSignalsJson?.cryptoEngine ?? {};
      const ts = idea.convergenceSignalsJson?.lossRules?.timeStop;
      const gran = 900;
      // 15m bars: 300 per request = 75h, enough for the 48h swing horizon + slack.
      const start = Math.floor(pub / (gran * 1000)) * gran * 1000;
      const end = Math.min(now, start + 299 * gran * 1000);
      const { value: bars } = await cached(`cb:${idea.symbol}:900:${start}`, 60_000, () => coinbaseCandles(String(idea.symbol).toUpperCase(), gran, { startMs: start, endMs: end }));
      const r = resolveCryptoPath({
        direction: idea.direction === 'short' ? 'short' : 'long',
        entry: Number(idea.entryPrice), stop: Number(idea.stopLoss), target: Number(idea.targetPrice),
        publishedMs: pub,
        timeStopAtMs: ts?.atIso ? Date.parse(ts.atIso) : (ce.timeStopAt ? Date.parse(ce.timeStopAt) : null),
        minR: Number(ts?.minR ?? 0.5),
        exitByMs: idea.exitBy ? Date.parse(idea.exitBy) : null,
        bars, granSec: gran, nowMs: now,
      });
      if (r.status === 'open') {
        const hi = r.highest; const lo = r.lowest;
        if ((hi != null && hi !== idea.highestPriceReached) || (lo != null && lo !== idea.lowestPriceReached)) {
          await storage.updateTradeIdeaPerformance(idea.id, { highestPriceReached: hi ?? undefined, lowestPriceReached: lo ?? undefined } as any);
        }
        continue;
      }
      const entry = Number(idea.entryPrice);
      const exit = Number(r.exitPrice);
      const pct = idea.direction === 'short' ? (entry - exit) / entry * 100 : (exit - entry) / entry * 100;
      const exitIso = new Date(r.exitAtMs ?? now).toISOString();
      await storage.updateTradeIdeaPerformance(idea.id, {
        outcomeStatus: r.status as any,
        exitPrice: exit,
        percentGain: Math.round(pct * 100) / 100,
        resolutionReason: r.resolution === 'target' ? 'auto_target_hit' : r.resolution === 'stop' ? 'auto_stop_hit' : r.resolution === 'time_stop' ? 'auto_time_stop' : 'auto_expired',
        exitDate: exitIso,
        actualHoldingTimeMinutes: Math.max(0, Math.round(((r.exitAtMs ?? now) - pub) / 60_000)),
        predictionAccurate: r.status === 'hit_target' ? true : r.status === 'hit_stop' ? false : pct > 0,
        predictionValidatedAt: new Date().toISOString(),
        highestPriceReached: r.highest ?? undefined,
        lowestPriceReached: r.lowest ?? undefined,
        outcomeNotes: `crypto tracker (Coinbase 15m since publish): ${r.reason}`,
      } as any);
      resolved++;
      logger.info(`[CRYPTO-TRACKER] ${idea.symbol} ${idea.direction} → ${r.status} @ ${exit} (${r.reason})`);
    } catch (err: any) {
      logger.warn(`[CRYPTO-TRACKER] ${idea.symbol} ${idea.id}: ${err?.message ?? err}`);
    }
  }
  return { checked: open.length, resolved };
}

// ─── desk payload for the Crypto tab ────────────────────────────────────────
export async function getCryptoIdeasDesk() {
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const rows: any[] = await db.select().from(tradeIdeas)
    .where(eq(tradeIdeas.source, CRYPTO_SOURCE as any))
    .orderBy(desc(tradeIdeas.timestamp)).limit(1000);
  const live = rows.filter((r) => !r.archived);
  const record = summarizeCryptoRecord(live.map((r) => ({
    timestamp: r.timestamp, direction: r.direction, entryPrice: Number(r.entryPrice), stopLoss: Number(r.stopLoss),
    exitPrice: r.exitPrice == null ? null : Number(r.exitPrice), outcomeStatus: r.outcomeStatus,
  })));
  const ideas = live.slice(0, 40).map((r) => {
    const ce = r.convergenceSignalsJson?.cryptoEngine ?? {};
    return {
      id: r.id, symbol: r.symbol, direction: r.direction, timestamp: r.timestamp,
      setup: ce.setup ?? null, horizon: ce.horizon ?? null, grade: ce.grade ?? null, points: ce.points ?? null,
      entry: Number(r.entryPrice), entryZone: ce.entryZone ?? null, stop: Number(r.stopLoss), t1: Number(r.targetPrice), t2: ce.t2 ?? null,
      rr: Number(r.riskRewardRatio), timeStopAt: ce.timeStopAt ?? null, exitBy: r.exitBy ?? null,
      why: ce.why ?? r.catalyst, evidence: (ce.evidence ?? []) as string[], proxies: (ce.proxies ?? []) as string[],
      outcomeStatus: r.outcomeStatus ?? 'open', exitPrice: r.exitPrice ?? null, percentGain: r.percentGain ?? null, resolutionReason: r.resolutionReason ?? null,
    };
  });
  return {
    asOf: new Date().toISOString(),
    universe: universe(),
    schedule: 'scan :07 and :37 every hour, every day (weekends included); outcome tracker every 5 min',
    maxPerDay: maxPerDay(),
    maxPerRun: MAX_PER_RUN,
    lastScan,
    ideas,
    record: { ...record, since: record.firstAt },
    gradeScale: 'Crypto structure grade CS-A (≥7/10) · CS-B (5–6) · CS-C (<5, not published). Separate from the NEXUS conviction band; the board re-scores each idea on the band scale.',
    thresholds: { fundingNegAprPct: T.fundingNegAprPct, fundingHotAprPct: T.fundingHotAprPct, oiRisePct: T.oiRisePct, minRR: T.minRR },
    provenance: 'Coinbase Exchange spot candles + Hyperliquid perp info (public). Ideas enter at the live price at publish; resolved from Coinbase 15m bars that start after publish; stop and target in one bar count as a stop.',
  };
}
