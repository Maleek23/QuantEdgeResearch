/**
 * GEX / VEX CROSS-TICKER RANKINGS
 * ===============================
 * One number per ticker is not enough to catch a BE-style move (2026-09-29:
 * spot 296, the 300C for 10-02 traded 9.6k vs 4.0k OI and the 300 strike held
 * the largest near-expiry |GEX| on the book). Neither BE nor STX was in the
 * GEX scan universe, so we never looked. This module ranks the whole
 * universe on the four reads that matter:
 *
 *   magnet  — large near-expiry CALL gamma 0–5% above spot with volume > OI
 *             (fresh positioning pulling price into the strike: the BE pattern)
 *   negVex  — most negative VEX (dealers sell as IV rises: crash fuel)
 *   lowGexPlus — lowest GEX+ (option-originated liquidity is being TAKEN)
 *   pins    — highest |GEX| concentration at a strike within 2.5% of spot
 *
 * UNITS (so GEX and VEX are genuinely additive):
 *   GEX  = $ of underlying dealers must trade per 1% spot move
 *          Σ sign · OI · Γ · S²          (100-share multiplier × 1% cancel)
 *   VEX  = $ of underlying dealers must trade per 1 IV point (0.01 abs vol)
 *          Σ −sign · OI · vanna · S      (vanna per 1.00 vol; ×100 mult ÷100)
 *          sign flipped so VEX > 0 = liquidity PROVIDED, matching GEX
 *          (SqueezeMetrics GEX Ed.: dealer long vanna sells as IV rises, which
 *          happens into selloffs — liquidity-taking — so that is negative VEX)
 *   GEX+ = GEX + VEX, i.e. dealer hedge $ for a shock of "1% spot ≡ 1 IV pt".
 *          Treating those two shocks as equal-sized is THE assumption that
 *          makes the sum meaningful; it is stated in every payload.
 *
 * SIGN CONVENTION — naive-oi: we have open interest, not dealer-directional
 * OI. Calls count + (dealer long), puts − (dealer short). When customers are
 * BUYING calls (volume/OI > 1 at a strike, the magnet case) the true dealer
 * sign there is probably negative — which is precisely why it squeezes.
 *
 * DATA: CBOE delayed chain only (Tradier token rejected; Yahoo 429s). Fetches
 * are sequential through the shared 'cboe' limiter with ≥1.5s spacing, the job
 * runs on a cadence (10 min in cash hours, 2 h otherwise), every row carries
 * its own fetch time, and the last good ranking is persisted to disk so a
 * restart serves it stamped with its real age — never as live.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import { rateLimited } from './provider-cache';
import {
  INDEX_TICKERS, S_TIER, A_TIER, SECONDARY, SMALL_ACCOUNT_TIER,
} from '../shared/approved-tickers';

// ─── Types ──────────────────────────────────────────────────────────────

export type GexRankRegime = 'positive' | 'negative' | 'neutral';

export interface GexMagnet {
  strike: number;
  distPct: number;       // strike vs spot, %
  callGEX: number;       // unsigned call-only $ per 1% at this strike (near expiries)
  share: number;         // callGEX / gross near-expiry |GEX| (0..1)
  callVolume: number;
  callOI: number;
  volOI: number;         // callVolume / callOI
  score: number;         // share × min(volOI, 5)
}

export interface GexRankRow {
  symbol: string;
  spot: number;
  changePct: number | null;
  iv30: number | null;              // CBOE iv30, vol points
  netGEX: number;                   // $ per 1% move, all listed expiries, naive-oi sign
  netVEX: number;                   // $ per 1 IV point, all listed expiries, + = provides liquidity
  gexPlus: number;                  // netGEX + netVEX (1% spot ≡ 1 IV pt)
  grossGEX: number;                 // Σ|contract GEX|, all expiries
  regime: GexRankRegime;
  nearExpiries: string[];           // the two nearest listed expiries used for strike reads
  nearNetGEX: number;
  topStrike: number | null;         // largest |net GEX| strike across near expiries
  topStrikeGEX: number | null;
  topStrikeShare: number | null;    // |topStrikeGEX| / Σ|strike net GEX| (near) — concentration
  topStrikeDistPct: number | null;
  topStrikeVolume: number | null;   // calls + puts, near expiries
  topStrikeOI: number | null;
  topStrikeVolOI: number | null;    // surge
  callWall: number | null;          // nearest expiry: strike with the most call gamma $
  putWall: number | null;           // nearest expiry: strike with the most put gamma $
  magnet: GexMagnet | null;
  pinScore: number | null;          // topStrikeShare × (1 − |dist|/5) when |dist| ≤ 2.5%
  contracts: number;
  dataSource: 'cboe-delayed';
  quoteTime: string | null;         // CBOE payload timestamp (UTC), ISO
  fetchedAt: string;                // when WE pulled it, ISO
}

export type GexRankView = 'magnet' | 'negVex' | 'lowGexPlus' | 'pins';

export interface GexRankingsPayload {
  generatedAt: string;
  rows: Array<GexRankRow & { ageSec: number; stale: boolean }>;
  views: Record<GexRankView, string[]>;
  units: { gex: string; vex: string; gexPlus: string };
  signConvention: 'naive-oi';
  signConventionNote: string;
  dataSource: string;
  cycle: GexRankCycle;
  universe: { total: number; sources: Record<string, number> };
  persisted: { loadedFromDisk: boolean; savedAt: string | null };
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
}

// ─── Constants ──────────────────────────────────────────────────────────

export const GEX_RANK_UNITS = {
  gex: '$ of underlying dealers trade per 1% spot move',
  vex: '$ of underlying dealers trade per 1 IV point (0.01 absolute vol); + provides liquidity',
  gexPlus: 'GEX + VEX, additive under the stated equivalence 1% spot move ≡ 1 IV point',
};
export const SIGN_CONVENTION_NOTE =
  'naive-oi: no dealer-directional OI is available, so calls count + (dealer long) and puts − (dealer short). ' +
  'Where customers are opening calls (volume > OI) the true dealer sign is likely the opposite — the squeeze case.';

/** Liquid high-beta names the operator wants covered regardless of tiering. */
export const HIGH_BETA_EXTRAS = ['BE', 'STX', 'MSTR', 'COIN', 'SMCI', 'PLTR', 'TSLA', 'NVDA', 'AMD', 'SNDK', 'MU', 'WDC'];

const FETCH_SPACING_MS = 1500;
const MARKET_CADENCE_MS = 10 * 60_000;
const OFF_HOURS_CADENCE_MS = 2 * 60 * 60_000;
const MAX_ROW_AGE_MS = 4 * 24 * 60 * 60_000;     // drop rows older than 4 days entirely
const STALE_MARKET_MS = 2 * MARKET_CADENCE_MS + 5 * 60_000;
const MAGNET_BAND = 0.05;                          // 0–5% above spot
const PIN_BAND_PCT = 2.5;
const MOVER_LIMIT = 20;
const MOVER_REFRESH_MS = 30 * 60_000;
let moverCache: { at: number; syms: string[] } | null = null;

// ─── Math ───────────────────────────────────────────────────────────────

const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Black-Scholes vanna ∂Δ/∂σ per share, per 1.00 of vol (r = q = 0 — negligible at these tenors). */
export function bsVanna(S: number, K: number, T: number, sigma: number): number {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return (-normPdf(d1) * d2) / sigma;
}

const OCC_RE = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;

/** Expiry instant ≈ 16:00 America/New_York. EDT/EST offset resolved per date. */
function expiryMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  // Find the NY offset on that date by formatting noon UTC in NY.
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const nyHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(probe));
  const offsetH = 12 - (nyHour % 24); // 4 in EDT, 5 in EST
  return Date.UTC(y, m - 1, d, 16 + offsetH, 0);
}

function parseCboeTimestamp(ts: unknown): string | null {
  if (typeof ts !== 'string' || !ts) return null;
  // "2026-09-29 17:54:53" — verified against wall-clock UTC on 2026-09-29.
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// ─── Core computation (pure) ───────────────────────────────────────────

/**
 * Build one ranking row from a raw CBOE delayed-quotes payload
 * (`https://cdn.cboe.com/api/global/delayed_quotes/options/{SYM}.json`).
 * Returns null when the payload is unusable — never a fabricated row.
 */
export function computeRankRowFromCboe(symbol: string, payload: any, fetchedAt: number, now = fetchedAt): GexRankRow | null {
  const d = payload?.data;
  const S = Number(d?.current_price ?? 0);
  const options: any[] = Array.isArray(d?.options) ? d.options : [];
  if (!(S > 0) || options.length === 0) return null;

  interface StrikeAgg { callGEX: number; putGEX: number; callVol: number; putVol: number; callOI: number; putOI: number }
  const nearAgg = new Map<number, StrikeAgg>();          // strike → aggregate over near expiries
  const firstAgg = new Map<number, StrikeAgg>();         // strike → aggregate over the nearest expiry
  const blank = (): StrikeAgg => ({ callGEX: 0, putGEX: 0, callVol: 0, putVol: 0, callOI: 0, putOI: 0 });

  // Parse once; determine live expiries.
  const parsed: Array<{ exp: string; expMs: number; cp: 'C' | 'P'; K: number; oi: number; vol: number; gamma: number; iv: number }> = [];
  let minK = Infinity; let maxK = -Infinity;
  for (const o of options) {
    const m = OCC_RE.exec(String(o?.option ?? ''));
    if (!m) continue;
    const [, , yymmdd, cp, k8] = m;
    const K = Number(k8) / 1000;
    if (!(K > 0)) continue;
    const exp = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
    const expMs = expiryMs(exp);
    if (expMs <= now) continue; // expired contracts carry no forward exposure
    const oi = Number(o.open_interest ?? 0) || 0;
    const vol = Number(o.volume ?? 0) || 0;
    if (oi <= 0 && vol <= 0) continue;
    minK = Math.min(minK, K); maxK = Math.max(maxK, K);
    parsed.push({ exp, expMs, cp: cp as 'C' | 'P', K, oi, vol, gamma: Number(o.gamma ?? 0) || 0, iv: Number(o.iv ?? 0) || 0 });
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
  const first = expiries[0];

  let netGEX = 0; let grossGEX = 0; let netVEX = 0;
  for (const p of parsed) {
    const sign = p.cp === 'C' ? 1 : -1;
    const gexAbs = p.oi * p.gamma * S * S;           // $ per 1% move, unsigned
    netGEX += sign * gexAbs;
    grossGEX += gexAbs;
    if (p.iv > 0.01 && p.oi > 0) {
      const T = Math.max((p.expMs - now) / (365 * 24 * 3600_000), 1 / (365 * 24));
      const vanna = bsVanna(S, p.K, T, p.iv);
      netVEX += -sign * p.oi * vanna * S;             // $ per 1 IV point, + provides liquidity
    }
    if (near.has(p.exp)) {
      const a = nearAgg.get(p.K) ?? blank();
      if (p.cp === 'C') { a.callGEX += gexAbs; a.callVol += p.vol; a.callOI += p.oi; }
      else { a.putGEX += gexAbs; a.putVol += p.vol; a.putOI += p.oi; }
      nearAgg.set(p.K, a);
    }
    if (p.exp === first) {
      const a = firstAgg.get(p.K) ?? blank();
      if (p.cp === 'C') { a.callGEX += gexAbs; a.callOI += p.oi; } else { a.putGEX += gexAbs; a.putOI += p.oi; }
      firstAgg.set(p.K, a);
    }
  }

  // Near-expiry strike reads
  let nearNetGEX = 0; let sumAbsStrike = 0; let grossNear = 0;
  let top: { K: number; net: number; a: StrikeAgg } | null = null;
  for (const [K, a] of nearAgg) {
    const net = a.callGEX - a.putGEX;
    nearNetGEX += net;
    sumAbsStrike += Math.abs(net);
    grossNear += a.callGEX + a.putGEX;
    if (!top || Math.abs(net) > Math.abs(top.net)) top = { K, net, a };
  }
  const topStrikeShare = top && sumAbsStrike > 0 ? Math.abs(top.net) / sumAbsStrike : null;
  const topStrikeDistPct = top ? ((top.K - S) / S) * 100 : null;
  const topVol = top ? top.a.callVol + top.a.putVol : null;
  const topOI = top ? top.a.callOI + top.a.putOI : null;

  // Walls on the nearest expiry
  let callWall: number | null = null; let putWall: number | null = null;
  let cwMax = 0; let pwMax = 0;
  for (const [K, a] of firstAgg) {
    if (a.callGEX > cwMax) { cwMax = a.callGEX; callWall = K; }
    if (a.putGEX > pwMax) { pwMax = a.putGEX; putWall = K; }
  }

  // Magnet squeeze: call gamma just above spot being opened today
  let magnet: GexMagnet | null = null;
  if (grossNear > 0) {
    for (const [K, a] of nearAgg) {
      if (K < S || K > S * (1 + MAGNET_BAND)) continue;
      if (a.callVol < 250 || a.callOI <= 0) continue;
      const volOI = a.callVol / a.callOI;
      if (volOI <= 1) continue;
      const share = a.callGEX / grossNear;
      if (share < 0.03) continue;
      const score = share * Math.min(volOI, 5);
      if (!magnet || score > magnet.score) {
        magnet = { strike: K, distPct: ((K - S) / S) * 100, callGEX: a.callGEX, share, callVolume: a.callVol, callOI: a.callOI, volOI, score };
      }
    }
  }

  const pinScore = topStrikeShare != null && topStrikeDistPct != null && Math.abs(topStrikeDistPct) <= PIN_BAND_PCT
    ? topStrikeShare * (1 - Math.abs(topStrikeDistPct) / 5)
    : null;

  const regime: GexRankRegime = grossGEX > 0 && Math.abs(netGEX) < 0.05 * grossGEX
    ? 'neutral' : netGEX > 0 ? 'positive' : 'negative';

  const iv30 = Number(d?.iv30);
  const chg = Number(d?.price_change_percent);
  return {
    symbol: symbol.toUpperCase(),
    spot: S,
    changePct: Number.isFinite(chg) ? chg : null,
    iv30: Number.isFinite(iv30) && iv30 > 0 ? iv30 : null,
    netGEX, netVEX, gexPlus: netGEX + netVEX, grossGEX, regime,
    nearExpiries: [...near],
    nearNetGEX,
    topStrike: top?.K ?? null,
    topStrikeGEX: top?.net ?? null,
    topStrikeShare,
    topStrikeDistPct,
    topStrikeVolume: topVol,
    topStrikeOI: topOI,
    topStrikeVolOI: topVol != null && topOI ? topVol / topOI : null,
    callWall, putWall, magnet, pinScore,
    contracts: parsed.length,
    dataSource: 'cboe-delayed',
    quoteTime: parseCboeTimestamp(payload?.timestamp),
    fetchedAt: new Date(fetchedAt).toISOString(),
  };
}

export function buildViews(rows: GexRankRow[], limit = 30): Record<GexRankView, string[]> {
  const take = (xs: GexRankRow[]) => xs.slice(0, limit).map((r) => r.symbol);
  return {
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

/** Fetch + compute one symbol. Used by the job and by research/_gexrank-verify.ts. */
export async function rankSymbol(symbol: string): Promise<{ row: GexRankRow | null; status: number }> {
  const { status, payload, fetchedAt } = await fetchCboeRaw(symbol);
  if (!payload) return { row: null, status };
  return { row: computeRankRowFromCboe(symbol, payload, fetchedAt), status };
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
  universeInfo = { total: out.size, sources };
  // Movers + high-beta first: they are the reason this ranking exists, and a
  // rate-limit abort mid-cycle should cost the long tail, not them.
  const priority = new Set([...HIGH_BETA_EXTRAS, ...moverSyms]);
  return [...out].sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)));
}

export async function runRankingCycle(): Promise<void> {
  if (cycle.inProgress) return;
  Object.assign(cycle, { inProgress: true, startedAt: new Date().toISOString(), finishedAt: null, attempted: 0, succeeded: 0, failed: 0, rateLimited: 0, aborted: null });
  try {
    const universe = await buildUniverse();
    let consecutive429 = 0;
    for (const sym of universe) {
      cycle.attempted++;
      const { row, status } = await rankSymbol(sym);
      if (row) {
        rows.set(sym, row);
        cycle.succeeded++;
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
    logger.info(`[GEX-RANK] cycle done: ${cycle.succeeded}/${cycle.attempted} ok, ${cycle.rateLimited} rate-limited`);
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
  return {
    generatedAt: new Date(now).toISOString(),
    rows: list.map((r) => {
      const ageSec = Math.max(0, Math.round((now - Date.parse(r.fetchedAt)) / 1000));
      return { ...r, ageSec, stale: ageSec * 1000 > staleAfter };
    }),
    views: buildViews(list, limit),
    units: GEX_RANK_UNITS,
    signConvention: 'naive-oi',
    signConventionNote: SIGN_CONVENTION_NOTE,
    dataSource: 'CBOE delayed quotes (~15 min delayed); one chain per ticker, fetched sequentially ≥1.5s apart',
    cycle: { ...cycle },
    universe: universeInfo,
    persisted: { loadedFromDisk, savedAt },
  };
}
