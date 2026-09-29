/**
 * GEX / VEX CROSS-TICKER RANKINGS
 * ===============================
 * One number per ticker is not enough to catch a BE-style move (2026-09-29:
 * spot 296, the 300C for 10-02 traded 9.6k vs 4.0k OI and the 300 strike held
 * the largest near-expiry |GEX| on the book). Neither BE nor STX was in the
 * GEX scan universe, so we never looked. This module ranks the whole
 * universe on the reads that matter:
 *
 *   setups  — the magnet detector (server/gex-magnet.ts): explicit criteria,
 *             score and why-lines, call AND put side; replaces v1 "magnet"
 *   negVex  — most negative VEX (dealers sell as IV rises: crash fuel)
 *   lowGexPlus — lowest GEX+ (option-originated liquidity is being TAKEN)
 *   pins    — highest |GEX| concentration at a strike within 2.5% of spot
 *
 * MATH: shared/gex-math.ts (one implementation with the hub). Units:
 *   GEX  = Σ sign · Γ · OI · 100 · S² · 0.01          $ per 1% spot move
 *   VEX  = Σ −sign · vanna · OI · 100 · S · 0.01      $ per 1 IV point, + = dealers buy as IV rises
 *   GEX+ = GEX + VEX under the stated equivalence 1% spot ≡ 1 IV point
 *   zero-gamma = spot-grid re-priced crossing nearest spot (all listed expiries)
 *   walls = largest call (put) gamma strike above (below) spot, all expiries
 *   regime = shared/gex-regime.ts classifyGammaRegime (neutral inside ±5% of gross)
 *
 * SIGN CONVENTION — naive-oi: calls + (dealer long), puts − (dealer short).
 * Where customers are opening calls (volume > OI) the true dealer sign there is
 * probably negative — which is precisely why a magnet squeezes.
 *
 * DATA: Alpaca indicative chain first (server/alpaca-options.ts — process-wide
 * budget ≤180 req/min, OI lags 1–2 sessions and its date is stamped), CBOE
 * delayed chain second (sequential through the shared 'cboe' limiter ≥1.5 s).
 * The job runs 10 min in cash hours / 2 h otherwise; every row carries its own
 * source, fetch time and OI date; the last good ranking is persisted to disk so
 * a restart serves it stamped with its real age — never as live.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { rateLimited } from './provider-cache';
import {
  INDEX_TICKERS, S_TIER, A_TIER, SECONDARY, SMALL_ACCOUNT_TIER,
} from '../shared/approved-tickers';
import {
  bsGamma, bsVanna, gexPer1Pct, vannaPerVolPt, gammaProfile, pickWalls, expiryInstantMs,
  YEAR_MS, MIN_T_YEARS, GEX_UNITS, SIGN_CONVENTION_NOTE as SHARED_SIGN_NOTE,
  type GammaContract,
} from '../shared/gex-math';
import { classifyGammaRegime } from '../shared/gex-regime';
import { detectMagnets, MAGNET_RULES, type MagnetSetup, type MagnetStrikeAgg } from './gex-magnet';
import { magnetActionStats } from './gex-magnet-actions';

// ─── Types ──────────────────────────────────────────────────────────────

export type GexRankRegime = 'positive' | 'negative' | 'neutral';

/** v1 shape, kept so older clients render; now derived from the call-side setup. */
export interface GexMagnet {
  strike: number;
  distPct: number;       // strike vs spot, %
  callGEX: number;       // unsigned call-only $ per 1% at this strike (near expiries)
  share: number;         // callGEX / gross near-expiry |GEX| (0..1)
  callVolume: number;
  callOI: number;
  volOI: number;         // callVolume / callOI
  score: number;         // detector score 0–100
}

export type RankDataSource = 'alpaca-indicative' | 'cboe-delayed';

export interface GexRankRow {
  symbol: string;
  spot: number;
  changePct: number | null;
  iv30: number | null;              // CBOE iv30, vol points (null on Alpaca rows)
  netGEX: number;                   // $ per 1% move, all listed expiries, naive-oi sign
  netVEX: number;                   // $ per 1 IV point, all listed expiries, + = provides liquidity
  gexPlus: number;                  // netGEX + netVEX (1% spot ≡ 1 IV pt)
  grossGEX: number;                 // Σ|contract GEX|, all expiries
  regime: GexRankRegime;
  /** Spot within 1% of the zero-gamma level. */
  nearFlip: boolean;
  /** Spot-grid re-priced zero-gamma level nearest spot; null when no crossing in ±20%. */
  zeroGamma: number | null;
  zeroGammaDistPct: number | null;
  nearExpiries: string[];           // the two nearest listed expiries used for strike reads
  nearNetGEX: number;
  topStrike: number | null;         // largest |net GEX| strike across near expiries
  topStrikeGEX: number | null;
  topStrikeShare: number | null;    // |topStrikeGEX| / Σ|strike net GEX| (near) — concentration
  topStrikeDistPct: number | null;
  topStrikeVolume: number | null;   // calls + puts, near expiries
  topStrikeOI: number | null;
  topStrikeVolOI: number | null;    // surge
  callWall: number | null;          // strike ABOVE spot with the most call gamma $ (all expiries)
  putWall: number | null;           // strike BELOW spot with the most put gamma $ (all expiries)
  magnet: GexMagnet | null;
  /** Magnet detector output (call and/or put), best first. */
  setups: MagnetSetup[];
  pinScore: number | null;          // topStrikeShare × (1 − |dist|/5) when |dist| ≤ 2.5%
  atmIvNear: number | null;
  atmIv30: number | null;
  contracts: number;
  dataSource: RankDataSource;
  /** Alpaca: open-interest as-of date (lags 1–2 sessions). CBOE: null (prior-day OI, undated). */
  openInterestDate: string | null;
  quoteTime: string | null;         // provider payload timestamp (UTC), ISO
  fetchedAt: string;                // when WE pulled it, ISO
}

export type GexRankView = 'setups' | 'magnet' | 'negVex' | 'lowGexPlus' | 'pins';

export interface GexRankingsPayload {
  generatedAt: string;
  rows: Array<GexRankRow & { ageSec: number; stale: boolean }>;
  views: Record<GexRankView, string[]>;
  /** Flattened setups across rows (best first), each with its row's age. */
  setups: Array<MagnetSetup & { ageSec: number; stale: boolean; dataSource: RankDataSource; spot: number }>;
  magnetRules: typeof MAGNET_RULES;
  units: { gex: string; vex: string; gexPlus: string };
  signConvention: 'naive-oi';
  signConventionNote: string;
  dataSource: string;
  cycle: GexRankCycle;
  universe: { total: number; sources: Record<string, number> };
  persisted: { loadedFromDisk: boolean; savedAt: string | null };
  alerts: { discordConfigured: boolean; sentToday: number; ideasToday: number };
}

export interface GexRankCycle {
  inProgress: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  attempted: number;
  succeeded: number;
  failed: number;
  rateLimited: number;
  aborted: string | null;
  nextRunAt: string | null;
  bySource?: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────────

export const GEX_RANK_UNITS = { gex: GEX_UNITS.gex, vex: GEX_UNITS.vex, gexPlus: GEX_UNITS.gexPlus };
export const SIGN_CONVENTION_NOTE = SHARED_SIGN_NOTE;

/** Liquid high-beta names the operator wants covered regardless of tiering. */
export const HIGH_BETA_EXTRAS = ['BE', 'STX', 'MSTR', 'COIN', 'SMCI', 'PLTR', 'TSLA', 'NVDA', 'AMD', 'SNDK', 'MU', 'WDC'];

const FETCH_SPACING_MS = 1500;
const MARKET_CADENCE_MS = 10 * 60_000;
const OFF_HOURS_CADENCE_MS = 2 * 60 * 60_000;
const MAX_ROW_AGE_MS = 4 * 24 * 60 * 60_000;     // drop rows older than 4 days entirely
const STALE_MARKET_MS = 2 * MARKET_CADENCE_MS + 5 * 60_000;
const PIN_BAND_PCT = 2.5;
const MOVER_LIMIT = 20;
const MOVER_REFRESH_MS = 30 * 60_000;
let moverCache: { at: number; syms: string[] } | null = null;
const OPTIONS_LEADER_LIMIT = 30;
let optionsLeaderCache: { at: number; syms: string[] } | null = null;

// ─── Math ───────────────────────────────────────────────────────────────

/** Re-exported for research scripts; the implementation is shared/gex-math.ts. */
export { bsVanna };

const OCC_RE = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;

function parseCboeTimestamp(ts: unknown): string | null {
  if (typeof ts !== 'string' || !ts) return null;
  // "2026-09-29 17:54:53" — verified against wall-clock UTC on 2026-09-29.
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// ─── Core computation (pure) ───────────────────────────────────────────

/**
 * Build one ranking row from a raw CBOE delayed-quotes payload
 * (`https://cdn.cboe.com/api/global/delayed_quotes/options/{SYM}.json`) or an
 * Alpaca chain mapped to that shape (alpacaToCboeShape).
 * Returns null when the payload is unusable — never a fabricated row.
 */
export function computeRankRowFromCboe(
  symbol: string, payload: any, fetchedAt: number, now = fetchedAt,
  meta: { dataSource?: RankDataSource; openInterestDate?: string | null } = {},
): GexRankRow | null {
  const d = payload?.data;
  const S = Number(d?.current_price ?? 0);
  const options: any[] = Array.isArray(d?.options) ? d.options : [];
  if (!(S > 0) || options.length === 0) return null;

  interface StrikeAgg { callGEX: number; putGEX: number; callVol: number; putVol: number; callOI: number; putOI: number }
  const nearAgg = new Map<number, StrikeAgg>();          // strike → aggregate over the two nearest expiries (pins, top strike)
  const allAgg = new Map<number, StrikeAgg>();           // strike → aggregate over every expiry (walls)
  const blank = (): StrikeAgg => ({ callGEX: 0, putGEX: 0, callVol: 0, putVol: 0, callOI: 0, putOI: 0 });

  // Parse once; determine live expiries.
  type P = { exp: string; expMs: number; T: number; cp: 'C' | 'P'; K: number; oi: number; vol: number; gamma: number; iv: number; bid: number | null; ask: number | null; last: number | null };
  const parsed: P[] = [];
  let minK = Infinity; let maxK = -Infinity;
  for (const o of options) {
    const m = OCC_RE.exec(String(o?.option ?? ''));
    if (!m) continue;
    const [, , yymmdd, cp, k8] = m;
    const K = Number(k8) / 1000;
    if (!(K > 0)) continue;
    const exp = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
    const expMs = expiryInstantMs(exp);
    if (expMs <= now) continue; // expired contracts carry no forward exposure
    const oi = Number(o.open_interest ?? 0) || 0;
    const vol = Number(o.volume ?? 0) || 0;
    if (oi <= 0 && vol <= 0) continue;
    const T = Math.max((expMs - now) / YEAR_MS, MIN_T_YEARS);
    const iv = Number(o.iv ?? 0) || 0;
    let gamma = Number(o.gamma ?? 0) || 0;
    // Feed without gamma but with IV (common on Alpaca's indicative feed for
    // untraded strikes): Black-Scholes gamma on that contract's own IV.
    if (!(gamma > 0) && iv > 0.01) gamma = bsGamma(S, K, T, iv);
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
    minK = Math.min(minK, K); maxK = Math.max(maxK, K);
    parsed.push({ exp, expMs, T, cp: cp as 'C' | 'P', K, oi, vol, gamma, iv, bid: n(o.bid), ask: n(o.ask), last: n(o.last_trade_price ?? o.last) });
  }
  if (!parsed.length) return null;
  // Same spot-sanity guard as contract-analyzer/cboe-chain: reject an
  // internally-consistent but implausible quote rather than rank garbage.
  if (S < minK * 0.5 || S > maxK * 1.5) {
    logger.warn(`[GEX-RANK] ${symbol}: spot ${S} outside strike ladder [${minK}, ${maxK}] — rejected`);
    return null;
  }

  const expiries = [...new Set(parsed.map((p) => p.exp))].sort();
  const near = new Set(expiries.slice(0, 2));
  // Magnet window: 0.75–10.5 calendar days (no same-day 0DTE); fallback nearest ≤ 21 d.
  const dteOf = (e: string) => (expiryInstantMs(e) - now) / 864e5;
  let magnetExps = expiries.filter((e) => dteOf(e) >= MAGNET_RULES.nearMinDays && dteOf(e) <= MAGNET_RULES.nearMaxDays);
  if (!magnetExps.length) {
    const nxt = expiries.find((e) => dteOf(e) >= MAGNET_RULES.nearMinDays && dteOf(e) <= MAGNET_RULES.fallbackMaxDays);
    magnetExps = nxt ? [nxt] : [];
  }
  const magnetSet = new Set(magnetExps);
  const magAgg = new Map<number, MagnetStrikeAgg>();

  let netGEX = 0; let grossGEX = 0; let netVEX = 0; let grossMagnet = 0;
  const profileContracts: GammaContract[] = [];
  for (const p of parsed) {
    const sign = p.cp === 'C' ? 1 : -1;
    const gexAbs = gexPer1Pct(p.gamma, p.oi, S);     // $ per 1% move, unsigned
    netGEX += sign * gexAbs;
    grossGEX += gexAbs;
    if (p.iv > 0.01 && p.oi > 0) {
      netVEX += -sign * vannaPerVolPt(bsVanna(S, p.K, p.T, p.iv), p.oi, S); // $ per 1 IV point, + provides liquidity
      profileContracts.push({ strike: p.K, T: p.T, iv: p.iv, oi: p.oi, isCall: p.cp === 'C' });
    }
    const all = allAgg.get(p.K) ?? blank();
    if (p.cp === 'C') { all.callGEX += gexAbs; all.callOI += p.oi; all.callVol += p.vol; } else { all.putGEX += gexAbs; all.putOI += p.oi; all.putVol += p.vol; }
    allAgg.set(p.K, all);
    if (near.has(p.exp)) {
      const a = nearAgg.get(p.K) ?? blank();
      if (p.cp === 'C') { a.callGEX += gexAbs; a.callVol += p.vol; a.callOI += p.oi; }
      else { a.putGEX += gexAbs; a.putVol += p.vol; a.putOI += p.oi; }
      nearAgg.set(p.K, a);
    }
    if (magnetSet.has(p.exp)) {
      const a = magAgg.get(p.K) ?? { strike: p.K, callGEX: 0, putGEX: 0, callVol: 0, putVol: 0, callOI: 0, putOI: 0 };
      grossMagnet += gexAbs;
      const top = { exp: p.exp, dte: (p.expMs - now) / 864e5, vol: p.vol, oi: p.oi, bid: p.bid, ask: p.ask, last: p.last };
      if (p.cp === 'C') {
        a.callGEX += gexAbs; a.callVol += p.vol; a.callOI += p.oi;
        if (!a.callTop || p.vol > a.callTop.vol) a.callTop = top;
      } else {
        a.putGEX += gexAbs; a.putVol += p.vol; a.putOI += p.oi;
        if (!a.putTop || p.vol > a.putTop.vol) a.putTop = top;
      }
      magAgg.set(p.K, a);
    }
  }

  // Near-expiry strike reads
  let nearNetGEX = 0; let sumAbsStrike = 0;
  let top: { K: number; net: number; a: StrikeAgg } | null = null;
  for (const [K, a] of nearAgg) {
    const net = a.callGEX - a.putGEX;
    nearNetGEX += net;
    sumAbsStrike += Math.abs(net);
    if (!top || Math.abs(net) > Math.abs(top.net)) top = { K, net, a };
  }
  const topStrikeShare = top && sumAbsStrike > 0 ? Math.abs(top.net) / sumAbsStrike : null;
  const topStrikeDistPct = top ? ((top.K - S) / S) * 100 : null;
  const topVol = top ? top.a.callVol + top.a.putVol : null;
  const topOI = top ? top.a.callOI + top.a.putOI : null;

  // Walls — shared definition, every expiry: call wall above spot, put wall below.
  // (v1 used the nearest expiry only and did not require the side of spot:
  // SPY 2026-09-29 returned call wall 763 and put wall 764 around a 763.76 spot.)
  const walls = pickWalls([...allAgg.entries()].map(([strike, a]) => ({ strike, callOI: a.callOI, putOI: a.putOI, callGEX: a.callGEX, putGEX: a.putGEX })), S);

  // ATM IV: nearest non-same-day expiry, and the expiry closest to 30 days.
  const atmIv = (exp: string | undefined): number | null => {
    if (!exp) return null;
    const rows = parsed.filter((p) => p.exp === exp && p.iv > 0.01);
    if (!rows.length) return null;
    const k = rows.reduce((b, p) => (Math.abs(p.K - S) < Math.abs(b - S) ? p.K : b), rows[0].K);
    const at = rows.filter((p) => p.K === k);
    return at.reduce((a, p) => a + p.iv, 0) / at.length;
  };
  const frontExp = expiries.find((e) => dteOf(e) >= MAGNET_RULES.nearMinDays);
  const exp30 = expiries.reduce<string | undefined>((b, e) => (!b || Math.abs(dteOf(e) - 30) < Math.abs(dteOf(b) - 30) ? e : b), undefined);
  const atmIvNear = atmIv(frontExp);
  const atmIv30 = exp30 && Math.abs(dteOf(exp30) - 30) <= 15 && exp30 !== frontExp ? atmIv(exp30) : null;

  const chgRaw = Number(d?.price_change_percent);
  const changePct = d?.price_change_percent != null && Number.isFinite(chgRaw) ? chgRaw : null;
  const setups = detectMagnets(
    { symbol: symbol.toUpperCase(), spot: S, changePct, atmIvNear, atmIv30, nearExpiries: magnetExps, grossNearGEX: grossMagnet },
    [...magAgg.values()],
  );
  const callSetup = setups.find((x) => x.side === 'call');
  const magnet: GexMagnet | null = callSetup
    ? { strike: callSetup.strike, distPct: callSetup.distPct, callGEX: magAgg.get(callSetup.strike)?.callGEX ?? 0, share: callSetup.share, callVolume: callSetup.volume, callOI: callSetup.openInterest, volOI: callSetup.volOI, score: callSetup.score }
    : null;

  const pinScore = topStrikeShare != null && topStrikeDistPct != null && Math.abs(topStrikeDistPct) <= PIN_BAND_PCT
    ? topStrikeShare * (1 - Math.abs(topStrikeDistPct) / 5)
    : null;

  // Zero-gamma: spot-grid re-pricing over every listed expiry (80 grid steps + bisection).
  const profile = gammaProfile(profileContracts, S, { lo: 0.8, hi: 1.2, steps: 80 });
  const read = classifyGammaRegime({ netGEX, grossGEX, spot: S, zeroGamma: profile.zeroGamma });

  const iv30 = Number(d?.iv30);
  return {
    symbol: symbol.toUpperCase(),
    spot: S,
    changePct,
    iv30: Number.isFinite(iv30) && iv30 > 0 ? iv30 : null,
    netGEX, netVEX, gexPlus: netGEX + netVEX, grossGEX,
    regime: read.regime,
    nearFlip: read.nearFlip,
    zeroGamma: profile.zeroGamma,
    zeroGammaDistPct: read.zeroGammaDistPct,
    nearExpiries: [...near],
    nearNetGEX,
    topStrike: top?.K ?? null,
    topStrikeGEX: top?.net ?? null,
    topStrikeShare,
    topStrikeDistPct,
    topStrikeVolume: topVol,
    topStrikeOI: topOI,
    topStrikeVolOI: topVol != null && topOI ? topVol / topOI : null,
    callWall: walls.callWall, putWall: walls.putWall, magnet, setups, pinScore,
    atmIvNear, atmIv30,
    contracts: parsed.length,
    dataSource: meta.dataSource ?? 'cboe-delayed',
    openInterestDate: meta.openInterestDate ?? null,
    quoteTime: parseCboeTimestamp(payload?.timestamp),
    fetchedAt: new Date(fetchedAt).toISOString(),
  };
}

export function buildViews(rows: GexRankRow[], limit = 30): Record<GexRankView, string[]> {
  const take = (xs: GexRankRow[]) => xs.slice(0, limit).map((r) => r.symbol);
  const bestSetup = (r: GexRankRow) => Math.max(0, ...(r.setups ?? []).map((x) => x.score));
  return {
    setups: take(rows.filter((r) => (r.setups ?? []).length > 0).sort((a, b) => bestSetup(b) - bestSetup(a))),
    magnet: take(rows.filter((r) => r.magnet).sort((a, b) => b.magnet!.score - a.magnet!.score)),
    negVex: take(rows.filter((r) => r.netVEX < 0).sort((a, b) => a.netVEX - b.netVEX)),
    lowGexPlus: take([...rows].sort((a, b) => a.gexPlus - b.gexPlus)),
    pins: take(rows.filter((r) => r.pinScore != null).sort((a, b) => b.pinScore! - a.pinScore!)),
  };
}

// ─── Fetch (throttled) ──────────────────────────────────────────────────

export async function fetchCboeRaw(symbol: string, timeoutMs = 20_000): Promise<{ status: number; payload: any | null; fetchedAt: number }> {
  const cboeSymbol = symbol.toUpperCase() === 'SPX' ? '_SPX' : symbol.toUpperCase();
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(cboeSymbol)}.json`;
  return rateLimited('cboe', FETCH_SPACING_MS, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, redirect: 'follow', signal: controller.signal });
      const fetchedAt = Date.now();
      if (!r.ok) return { status: r.status, payload: null, fetchedAt };
      return { status: r.status, payload: await r.json(), fetchedAt };
    } catch {
      return { status: 0, payload: null, fetchedAt: Date.now() };
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Fetch + compute one symbol: Alpaca indicative chain first, CBOE delayed second.
 * Used by the job and by research/_gexrank-verify.ts.
 */
export async function rankSymbol(symbol: string): Promise<{ row: GexRankRow | null; status: number; source: RankDataSource | null }> {
  try {
    const { getAlpacaOptionsChain, alpacaToCboeShape, isAlpacaOptionsConfigured } = await import('./alpaca-options');
    if (isAlpacaOptionsConfigured()) {
      const chain = await getAlpacaOptionsChain(symbol);
      const payload = chain ? alpacaToCboeShape(chain) : null;
      if (chain && payload) {
        const row = computeRankRowFromCboe(symbol, payload, chain.fetchedAt, Date.now(), { dataSource: 'alpaca-indicative', openInterestDate: chain.openInterestDate });
        if (row) return { row, status: 200, source: 'alpaca-indicative' };
      }
    }
  } catch (e: any) {
    logger.warn(`[GEX-RANK] ${symbol}: Alpaca leg failed — ${e?.message ?? e}`);
  }
  const { status, payload, fetchedAt } = await fetchCboeRaw(symbol);
  if (!payload) return { row: null, status, source: null };
  return { row: computeRankRowFromCboe(symbol, payload, fetchedAt, fetchedAt, { dataSource: 'cboe-delayed' }), status, source: 'cboe-delayed' };
}

// ─── Cache, persistence, job ────────────────────────────────────────────

const rows = new Map<string, GexRankRow>();
const cycle: GexRankCycle = {
  inProgress: false, startedAt: null, finishedAt: null,
  attempted: 0, succeeded: 0, failed: 0, rateLimited: 0, aborted: null, nextRunAt: null,
};
let universeInfo: { total: number; sources: Record<string, number> } = { total: 0, sources: {} };
let loadedFromDisk = false;
let savedAt: string | null = null;
let jobStarted = false;

// Mirrors routes.ts loadLastGood/saveLastGood: same dir, same {data, cachedAt} shape.
const lastGoodFile = path.join(process.cwd(), '.cache', 'last-good', 'gex-rankings-ALL.json');

function loadFromDisk(): void {
  try {
    const { data, cachedAt } = JSON.parse(fs.readFileSync(lastGoodFile, 'utf8')) as { data: { rows: GexRankRow[] }; cachedAt: number };
    const now = Date.now();
    for (const r of data?.rows ?? []) {
      if (r?.symbol && now - Date.parse(r.fetchedAt) < MAX_ROW_AGE_MS) rows.set(r.symbol, r);
    }
    loadedFromDisk = rows.size > 0;
    savedAt = new Date(cachedAt).toISOString();
  } catch { /* no persisted ranking yet */ }
}

function saveToDisk(): void {
  const data = { rows: [...rows.values()] };
  const cachedAt = Date.now();
  fs.promises.mkdir(path.dirname(lastGoodFile), { recursive: true })
    .then(() => fs.promises.writeFile(lastGoodFile, JSON.stringify({ data, cachedAt })))
    .then(() => { savedAt = new Date(cachedAt).toISOString(); })
    .catch(() => { /* best effort */ });
}

function inCashHours(at = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const mins = h * 60 + m;
  return wd !== 'Sat' && wd !== 'Sun' && mins >= 9 * 60 + 30 && mins <= 16 * 60 + 15;
}

async function buildUniverse(): Promise<string[]> {
  const sources: Record<string, number> = {};
  const out = new Set<string>();
  const add = (label: string, syms: readonly string[]) => {
    let n = 0;
    for (const s of syms) {
      const u = String(s).toUpperCase();
      if (!/^[A-Z]{1,5}$/.test(u) || out.has(u)) continue;
      out.add(u); n++;
    }
    sources[label] = n;
  };
  // 1) the existing GEX scan universe (same tier list as gex-vex-scanner runFullScan)
  add('gexScan', [...INDEX_TICKERS, ...S_TIER, ...A_TIER, ...SECONDARY, ...SMALL_ACCOUNT_TIER] as string[]);
  // 2) liquid high-beta names
  add('highBeta', HIGH_BETA_EXTRAS);
  // 3) today's top movers (mover-discovery; has its own fallback cache when Yahoo 429s)
  // discoverMovers() hits Yahoo and records attention, so call it at most every
  // 30 min from here; between calls the last top-N list is reused.
  let moverSyms: string[] = moverCache && Date.now() - moverCache.at < MOVER_REFRESH_MS ? moverCache.syms : [];
  if (!moverSyms.length) {
    try {
      const { discoverMovers } = await import('./mover-discovery');
      const movers = await discoverMovers();
      moverSyms = movers
        .filter((m) => Number.isFinite(m.changePercent) && (m.price ?? 0) >= 5)
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, MOVER_LIMIT)
        .map((m) => m.symbol.toUpperCase());
      if (moverSyms.length) moverCache = { at: Date.now(), syms: moverSyms };
    } catch (e: any) {
      logger.warn(`[GEX-RANK] mover discovery unavailable: ${e?.message}`);
    }
  }
  add('movers', moverSyms);
  // 4) today's top options-volume names — Bullflow optionsTopTickers through the
  // existing rate-limited bullflow-service (its own 6-min cache); asked at most
  // every 30 min from here.
  let leaderSyms: string[] = optionsLeaderCache && Date.now() - optionsLeaderCache.at < MOVER_REFRESH_MS ? optionsLeaderCache.syms : [];
  if (!leaderSyms.length) {
    try {
      const bf = await import('./bullflow-service');
      if (bf.bullflowEnabled()) {
        const top = await bf.getTopTickers('volume', { excludeEtfs: false });
        leaderSyms = ((top?.rows ?? []) as any[]).map((r) => String(r?.ticker ?? '').toUpperCase()).filter(Boolean).slice(0, OPTIONS_LEADER_LIMIT);
        if (leaderSyms.length) optionsLeaderCache = { at: Date.now(), syms: leaderSyms };
      }
    } catch (e: any) {
      logger.warn(`[GEX-RANK] options-volume leaders unavailable: ${e?.message}`);
    }
  }
  add('optionsVolume', leaderSyms);
  universeInfo = { total: out.size, sources };
  // Movers + high-beta first: they are the reason this ranking exists, and a
  // rate-limit abort mid-cycle should cost the long tail, not them.
  const priority = new Set([...HIGH_BETA_EXTRAS, ...moverSyms, ...leaderSyms]);
  return [...out].sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)));
}

export async function runRankingCycle(): Promise<void> {
  if (cycle.inProgress) return;
  Object.assign(cycle, { inProgress: true, startedAt: new Date().toISOString(), finishedAt: null, attempted: 0, succeeded: 0, failed: 0, rateLimited: 0, aborted: null, bySource: {} });
  try {
    const universe = await buildUniverse();
    let consecutive429 = 0;
    for (const sym of universe) {
      cycle.attempted++;
      const { row, status, source } = await rankSymbol(sym);
      if (row) {
        rows.set(sym, row);
        cycle.succeeded++;
        if (source) cycle.bySource![source] = (cycle.bySource![source] ?? 0) + 1;
        consecutive429 = 0;
      } else {
        cycle.failed++;
        if (status === 429) {
          cycle.rateLimited++;
          consecutive429++;
          if (consecutive429 >= 3) {
            cycle.aborted = `CBOE rate-limited (429 ×${consecutive429}) after ${cycle.attempted}/${universe.length}; cached rows kept with their own age`;
            logger.warn(`[GEX-RANK] ${cycle.aborted}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 20_000)); // back off before the next symbol
        }
      }
      if (cycle.succeeded > 0 && cycle.succeeded % 25 === 0) saveToDisk();
    }
    const now = Date.now();
    for (const [sym, r] of rows) if (now - Date.parse(r.fetchedAt) > MAX_ROW_AGE_MS) rows.delete(sym);
    if (cycle.succeeded > 0) saveToDisk();
    logger.info(`[GEX-RANK] cycle done: ${cycle.succeeded}/${cycle.attempted} ok, ${cycle.rateLimited} rate-limited, sources ${JSON.stringify(cycle.bySource)}`);
    try {
      const { processMagnetSetups } = await import('./gex-magnet-actions');
      const fresh = [...rows.values()].filter((r) => Date.now() - Date.parse(r.fetchedAt) < STALE_MARKET_MS);
      await processMagnetSetups(fresh, { cashHours: inCashHours() });
    } catch (e: any) {
      logger.warn(`[GEX-RANK] setup actions failed: ${e?.message ?? e}`);
    }
  } catch (e: any) {
    cycle.aborted = `cycle error: ${e?.message ?? 'unknown'}`;
    logger.error('[GEX-RANK] cycle failed', { error: e?.message });
  } finally {
    cycle.inProgress = false;
    cycle.finishedAt = new Date().toISOString();
  }
}

function scheduleNext(): void {
  const delay = inCashHours() ? MARKET_CADENCE_MS : OFF_HOURS_CADENCE_MS;
  cycle.nextRunAt = new Date(Date.now() + delay).toISOString();
  setTimeout(() => { void runRankingCycle().finally(scheduleNext); }, delay).unref?.();
}

/** Idempotent. First cycle 90s after boot so it doesn't join the boot-time CBOE storm. */
export function startGexRankingJob(firstDelayMs = 90_000): void {
  if (jobStarted) return;
  jobStarted = true;
  loadFromDisk();
  cycle.nextRunAt = new Date(Date.now() + firstDelayMs).toISOString();
  setTimeout(() => { void runRankingCycle().finally(scheduleNext); }, firstDelayMs).unref?.();
  logger.info(`[GEX-RANK] job scheduled (first run in ${Math.round(firstDelayMs / 1000)}s; ${rows.size} rows restored from disk)`);
}

export function getGexRankings(limit = 30): GexRankingsPayload {
  const now = Date.now();
  const staleAfter = inCashHours() ? STALE_MARKET_MS : 24 * 60 * 60_000;
  const list = [...rows.values()];
  const aged = list.map((r) => {
    const ageSec = Math.max(0, Math.round((now - Date.parse(r.fetchedAt)) / 1000));
    return { ...r, setups: r.setups ?? [], ageSec, stale: ageSec * 1000 > staleAfter };
  });
  const setups = aged
    .flatMap((r) => r.setups.map((x) => ({ ...x, ageSec: r.ageSec, stale: r.stale, dataSource: r.dataSource, spot: r.spot })))
    .sort((a, b) => Number(a.stale) - Number(b.stale) || b.score - a.score)
    .slice(0, limit);
  let alerts = { discordConfigured: false, sentToday: 0, ideasToday: 0 };
  try { alerts = magnetActionStats(); } catch { /* module not loaded yet */ }
  return {
    generatedAt: new Date(now).toISOString(),
    rows: aged,
    views: buildViews(list, limit),
    setups,
    magnetRules: MAGNET_RULES,
    units: GEX_RANK_UNITS,
    signConvention: 'naive-oi',
    signConventionNote: SIGN_CONVENTION_NOTE,
    dataSource: 'Alpaca options (indicative feed — not OPRA; OI lags 1–2 sessions) first, CBOE delayed quotes (~15 min) second; one chain per ticker, throttled',
    cycle: { ...cycle },
    universe: universeInfo,
    persisted: { loadedFromDisk, savedAt },
    alerts,
  };
}
