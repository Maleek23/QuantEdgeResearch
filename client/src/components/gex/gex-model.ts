/**
 * GEX read model — the derivations the GEX hub draws, as pure functions and
 * shared hooks, so the hub (gex-hub-nexus.tsx) and every GEX dashboard tool
 * (components/dashboard/tools/gex) compute them ONE way and fetch them with
 * ONE query key per symbol (react-query dedupes: five GEX tools on screen =
 * one /api/gex-vex/terminal request per refresh).
 *
 * Units (server units v2 — docs/GEX_VEX_METHODOLOGY.md):
 *   matrix / snapshot GEX = $B of underlying per 1% move
 *   matrix / snapshot VEX = $M of underlying per 1 IV point
 */
import { useQuery } from '@tanstack/react-query';
import type { StrikeExpiryCell, GEXSnapshot } from '@shared/gex-types';
import { describeLegacyRegime, type GammaRegime } from '@shared/gex-regime';
import { fmtGexB, fmtVexM } from './gex-colors';
import type { GridLevels } from './gex-strike-grid';

/* ── payloads ── */
export interface TopPlay {
  symbol: string; sector?: string; spotPrice?: number; playScore?: number;
  conviction?: string; regime?: string; bias?: string; callWall?: number; putWall?: number;
  isNegativeGamma?: boolean; insight?: string;
  totalVEX?: number; vexSignal?: string; gammaFlip?: number | null; flipDistancePct?: number | null;
}
export interface HubPayload { hub?: { topPlays?: TopPlay[]; totalScanned?: number; totalTickers?: number; attempted?: number; failedSymbols?: string[]; miniScan?: boolean }; generatedAt?: string }
export interface TerminalData {
  symbol: string;
  snapshot: GEXSnapshot;
  strikeExpiryMatrix: StrikeExpiryCell[];
  generatedAt?: string;
  cached?: boolean;
  cachedAt?: string;
  optionsSource?: string;
  dataQuality?: { bestSource?: string; isStale?: boolean; marketStatus?: string };
  /** 15m candles, 5 sessions (the request's interval/lookback) — the matrix's strike band uses their realized vol */
  candles?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
}
export interface Sector { etf: string; name: string; change: number }
export interface RotationPayload { leaders?: Sector[]; laggards?: Sector[]; sectors?: Sector[]; sessionLabel?: string; generatedAt?: string; asOf?: string }
export interface EHQuote { symbol: string; lastPrice: number; changePct: number }
export interface EHPayload { session?: string; gainers?: EHQuote[]; losers?: EHQuote[]; mostActive?: EHQuote[]; asOf?: string }

const getJson = (path: string) => async () => {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} failed`);
  return r.json();
};

/** Past this the terminal request is abandoned: an honest error + retry beats an endless "reading". */
export const TERMINAL_TIMEOUT_MS = 45_000;

/* ── shared queries — the hub's keys, so hub + tools share one fetch ── */
export const useGexTerminal = (symbol: string) => useQuery<TerminalData>({
  queryKey: ['/api/gex-vex/terminal', symbol, 'nexus'],
  queryFn: async ({ signal }) => {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctl.abort(), TERMINAL_TIMEOUT_MS);
    try {
      const r = await fetch(`/api/gex-vex/terminal/${encodeURIComponent(symbol)}?interval=15m&lookback=5`, { credentials: 'include', signal: ctl.signal });
      if (!r.ok) throw new Error(`${symbol} dealer map: HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (ctl.signal.aborted && !signal?.aborted) throw new Error(`${symbol} chain read timed out after ${TERMINAL_TIMEOUT_MS / 1000}s — the options-data queue is busy`);
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  },
  staleTime: 60_000, refetchInterval: 120_000, retry: 1, retryDelay: 3_000,
});
export const useGexHub = () => useQuery<HubPayload>({
  queryKey: ['/api/gex-vex/hub', 'nexus'], queryFn: getJson('/api/gex-vex/hub'),
  staleTime: 120_000, refetchInterval: 180_000, retry: 1,
});
export const useSectorRotation = () => useQuery<RotationPayload>({
  queryKey: ['/api/sector-rotation', 'nexus'], queryFn: getJson('/api/sector-rotation'),
  staleTime: 120_000, refetchInterval: 180_000, retry: 1,
});
export const useExtendedHoursNexus = () => useQuery<EHPayload>({
  queryKey: ['/api/extended-hours', 'nexus'], queryFn: getJson('/api/extended-hours'),
  staleTime: 60_000, refetchInterval: 120_000, retry: 1,
});

/* ── DTE buckets for the strike × expiry surface ── */
/* Chip order = reading order (operator 2026-10-01: "this is GEX, it needs to
   fit to screen, especially 0–7 days or 14 possibly"): the near-term horizons
   first, ALL last. 0–7d is the phone default, 0–14d the tablet/desktop one. */
export const DTE_BUCKETS = [
  { id: '0-7', label: '0–7d', test: (d: number) => d >= 0 && d <= 7 },
  { id: '0-14', label: '0–14d', test: (d: number) => d >= 0 && d <= 14 },
  { id: '7-30', label: '7–30d', test: (d: number) => d > 7 && d <= 30 },
  { id: '30-90', label: '30–90d', test: (d: number) => d > 30 && d <= 90 },
  { id: '90+', label: '90d+', test: (d: number) => d > 90 },
  { id: 'all', label: 'ALL', test: (d: number) => d >= 0 },
] as const;
export type BucketId = typeof DTE_BUCKETS[number]['id'];
/** Default horizon per device class: phones read the week, wider screens two. */
export const defaultBucketFor = (phone: boolean): BucketId => (phone ? '0-7' : '0-14');

/**
 * Remembered horizon, PER DEVICE CLASS (phone vs tablet/desktop), in this
 * browser's localStorage. Unavailable storage (private mode, blocked) just
 * means the default every visit.
 */
const HORIZON_KEY = (phone: boolean) => `qe-gex-horizon:${phone ? 'phone' : 'desk'}`;
export function readHorizon(phone: boolean): BucketId {
  try {
    const v = localStorage.getItem(HORIZON_KEY(phone));
    if (v && DTE_BUCKETS.some((b) => b.id === v)) return v as BucketId;
  } catch { /* blocked storage */ }
  return defaultBucketFor(phone);
}
export function writeHorizon(phone: boolean, b: BucketId) {
  try { localStorage.setItem(HORIZON_KEY(phone), b); } catch { /* blocked storage */ }
}

/**
 * Default STRIKE BAND for the matrix — the useful part of the book, sized so
 * it fills the screen instead of 600 strikes of dust.
 *
 * 1-week expected move (1σ) = spot · σ_day · √5. The terminal payload carries
 * no implied vol, so σ_day is REALIZED: intraday log returns of the payload's
 * own candles (overnight gaps excluded), scaled to a 6.5h session. Band =
 * ±1.5 × that move, widened to take in the structural levels (call/put wall,
 * king node, zero-γ) that sit within ±3 moves, and clamped to ±1.5%…±25% of
 * spot. No usable candles → the walls set the band (±25% around them), else
 * ±5%. Always labelled with its basis; the ⋯ menu shows every strike.
 */
export interface StrikeBand { lo: number; hi: number; pct: number; move: number | null; basis: string }
export function strikeBandOf(
  spot: number,
  candles: Array<{ time: number; close: number }> | undefined,
  levels: Array<number | null | undefined>,
): StrikeBand | null {
  if (!(spot > 0)) return null;
  let move: number | null = null;
  const cs = (candles ?? []).filter((c) => c.close > 0 && Number.isFinite(c.time)).sort((a, b) => a.time - b.time);
  if (cs.length >= 20) {
    const gaps = cs.slice(1).map((c, i) => c.time - cs[i].time).filter((g) => g > 0).sort((a, b) => a - b);
    const step = gaps[Math.floor(gaps.length / 2)] ?? 0;
    const rets: number[] = [];
    for (let i = 1; i < cs.length; i++) if (cs[i].time - cs[i - 1].time <= step * 2) rets.push(Math.log(cs[i].close / cs[i - 1].close));
    if (step > 0 && rets.length >= 10) {
      const m = rets.reduce((s, r) => s + r, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / (rets.length - 1));
      const perDay = (6.5 * 3600) / step;
      const em = spot * sd * Math.sqrt(perDay) * Math.sqrt(5);
      if (Number.isFinite(em) && em > 0) move = em;
    }
  }
  const lv = levels.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  let half: number; let basis: string;
  if (move != null) {
    half = move * 1.5;
    for (const v of lv) if (Math.abs(v - spot) <= move * 3) half = Math.max(half, Math.abs(v - spot) * 1.08);
    basis = `±1.5 × 1-week move (≈ ±$${move.toFixed(2)}, realized vol of the chart candles), widened to the walls / king node / zero-γ`;
  } else if (lv.length) {
    half = Math.max(...lv.map((v) => Math.abs(v - spot))) * 1.25;
    basis = 'no candles for a vol estimate — band spans the walls / king node / zero-γ (+25%)';
  } else {
    half = spot * 0.05;
    basis = 'no candles or levels — ±5% of spot';
  }
  half = Math.min(spot * 0.25, Math.max(spot * 0.015, half));
  return { lo: spot - half, hi: spot + half, pct: (half / spot) * 100, move, basis };
}

/**
 * Cell metrics. 'gexAdj' is Δ-adjusted GEX (docs/GAMMA_RAW_VS_ADJUSTED.md):
 * same unit as 'gex' ($B per 1% move), delta re-priced at spot ±1%.
 */
export type CellMetric = 'gex' | 'gexAdj' | 'vex';
/** Raw | Δ-adjusted | both columns — the GEX gamma-definition toggle. */
export type GammaView = 'raw' | 'adj' | 'both';
export const GAMMA_VIEWS: Array<{ id: GammaView; label: string; title: string }> = [
  { id: 'raw', label: 'Raw', title: 'Raw GEX — Γ·OI·100·S²·0.01: the instantaneous dealer hedge, scaled to a 1% move (industry standard)' },
  { id: 'adj', label: 'Δ-adj', title: 'Δ-adjusted GEX — OI·100·S·[Δ(S+1%) − Δ(S−1%)]/2: the hedge a 1% move actually needs, delta re-priced at both ends. Smaller than raw at the 0DTE ATM strike, larger just beside it; ≈ raw for longer expiries.' },
  { id: 'both', label: 'Side by side', title: 'Raw and Δ-adjusted in two columns per expiry' },
];
export const fmtCell = (v: number, metric: CellMetric) => (metric === 'vex' ? fmtVexM(v) : fmtGexB(v));
export const cellValue = (c: StrikeExpiryCell, metric: CellMetric) =>
  (metric === 'vex' ? (c.netVEX ?? 0) : metric === 'gexAdj' ? (c.netGEXAdj ?? 0) : c.netGEX);
/** Does this payload carry Δ-adjusted cells? (absent on the CBOE-fallback path and on cached pre-feature payloads) */
export const hasAdjusted = (matrix: StrikeExpiryCell[]) => matrix.some((c) => typeof c.netGEXAdj === 'number');
/** The cell metric a GEX view reads (the primary column in 'both'). */
export const gexMetricOf = (metric: 'gex' | 'vex', view: GammaView, adjAvailable: boolean): CellMetric =>
  metric === 'vex' ? 'vex' : view === 'adj' && adjAvailable ? 'gexAdj' : 'gex';

/**
 * Near-term map: currently listed 0–7 DTE cells aggregated by strike. A
 * January node must not dominate a September trading screen; long-dated
 * chain data stays in the strike × expiry matrix.
 */
export function nearTermByStrike(matrix: StrikeExpiryCell[], spot: number, maxDte = 7, metric: 'gex' | 'gexAdj' = 'gex') {
  const byStrike = new Map<number, number>();
  const expiries = new Set<string>();
  for (const cell of matrix) {
    if (!Number.isFinite(cell.strike) || !Number.isFinite(cell.dte) || cell.dte < 0 || cell.dte > maxDte) continue;
    const v = cellValue(cell, metric);
    byStrike.set(cell.strike, (byStrike.get(cell.strike) ?? 0) + (Number.isFinite(v) ? v : 0));
    expiries.add(cell.expiryLabel);
  }
  const all = [...byStrike.entries()].map(([strike, gex]) => ({
    strike,
    gex,
    distancePct: spot > 0 ? ((strike - spot) / spot) * 100 : 0,
  }));
  const nearest = [...all].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 17).sort((a, b) => b.strike - a.strike);
  const positive = all.filter((x) => x.gex > 0).sort((a, b) => b.gex - a.gex)[0] ?? null;
  const negative = all.filter((x) => x.gex < 0).sort((a, b) => a.gex - b.gex)[0] ?? null;
  const dominant = [...all].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))[0] ?? null;
  return {
    levels: nearest,
    /** every listed strike in the 0–7 DTE scope — the scrollable ladder */
    all,
    positive,
    negative,
    dominant,
    total: all.reduce((sum, x) => sum + x.gex, 0),
    max: Math.max(1e-9, ...nearest.map((x) => Math.abs(x.gex))),
    expiries: [...expiries],
  };
}
export type NearTerm = ReturnType<typeof nearTermByStrike>;

/** Matrix shaping for the surface: expiries in the bucket, strongest nodes, gravity. */
export function shapeMatrix(matrix: StrikeExpiryCell[], bucket: BucketId, spot: number, metric: CellMetric) {
  const valOf = (c: StrikeExpiryCell) => cellValue(c, metric);
  const cells = matrix.filter((c) => Number.isFinite(c.strike) && Number.isFinite(c.dte) && c.dte >= 0);
  const expiryAll = [...new Map(cells.map((c) => [c.dte, c.expiryLabel] as const)).entries()]
    .sort((a, b) => a[0] - b[0]);
  const bucketDef = DTE_BUCKETS.find((b) => b.id === bucket)!;
  const expiries = expiryAll.filter(([d]) => bucketDef.test(d));
  const bucketCounts = Object.fromEntries(
    DTE_BUCKETS.map((b) => [b.id, expiryAll.filter(([d]) => b.test(d)).length]),
  ) as Record<BucketId, number>;

  // Every listed strike is shown — the grid scrolls (gex-strike-grid.tsx).
  const strikeCount = new Set(cells.map((c) => c.strike)).size;

  /* strongest listed nodes above / below spot */
  let above: StrikeExpiryCell | null = null; let below: StrikeExpiryCell | null = null;
  for (const c of cells) {
    if (c.strike > spot && (!above || Math.abs(valOf(c)) > Math.abs(valOf(above)))) above = c;
    if (c.strike < spot && (!below || Math.abs(valOf(c)) > Math.abs(valOf(below)))) below = c;
  }
  /* gravity: positive vs negative share of total |exposure| */
  let pos = 0; let neg = 0;
  for (const c of cells) { const v = valOf(c); if (v >= 0) pos += v; else neg += -v; }
  // One decimal, clamped off the poles: 0% is a claim of absence; 0.2% is a
  // measurement (puts EXIST, they are just dwarfed).
  const callPct = pos + neg > 0
    ? Math.min(99.9, Math.max(0.1, (pos / (pos + neg)) * 100))
    : null;

  return { expiries, expiryAll, bucketCounts, strikeCount, above, below, callPct, total: cells.length };
}
export type ShapedMatrix = ReturnType<typeof shapeMatrix>;

/**
 * ONE regime read for every panel (shared/gex-regime.ts): the server's
 * regimeRead when present, else the same words from the legacy enum.
 */
export interface RegimeView { regime: GammaRegime; nearFlip: boolean; glyph: string; title: string; posture: string; basis: string }
export function regimeView(snap: GEXSnapshot | undefined | null): RegimeView | null {
  if (!snap) return null;
  const rr = snap.regimeRead;
  if (rr) {
    return {
      regime: rr.regime as GammaRegime, nearFlip: !!rr.nearFlip, glyph: rr.glyph,
      title: rr.nearFlip ? `${rr.title} · near the flip` : rr.title,
      posture: rr.posture, basis: rr.basis,
    };
  }
  const d = describeLegacyRegime(snap.regime);
  return { regime: d.regime, nearFlip: !!d.nearFlip, glyph: d.glyph, title: d.title, posture: d.posture, basis: `net GEX ${fmtGexB(snap.totalGEX)}/1%` };
}

export const zeroGammaOf = (snap: GEXSnapshot | undefined | null): number | null =>
  snap ? (snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null) : null;

/**
 * Structural levels every strike grid marks (all listed expiries). With
 * view 'adj' the Δ-adjusted levels (snapshot.gammaMetrics) are marked instead;
 * 'raw' and 'both' mark the raw levels (the compare strip lists what moves).
 */
export const gridLevelsOf = (snap: GEXSnapshot | undefined | null, spot: number, view: GammaView = 'raw'): GridLevels => {
  const adj = view === 'adj' ? snap?.gammaMetrics?.deltaAdjusted.levels : undefined;
  if (adj) return { spot, callWall: adj.callWall, putWall: adj.putWall, maxGamma: adj.maxGammaStrike, zeroGamma: adj.zeroGamma };
  return {
    spot,
    callWall: snap?.callWall ?? null,
    putWall: snap?.putWall ?? null,
    maxGamma: snap?.maxGammaStrike ?? null,
    zeroGamma: zeroGammaOf(snap),
  };
};

export const REGIME_EXPECT: Record<GammaRegime, string> = {
  negative: 'Breaks can accelerate. Wait for price to clear a wall, then trade with the confirmed direction instead of fading it.',
  positive: 'Expect two-way trade and pinning toward the dominant node. Fade weak extensions until a wall breaks with confirmation.',
  neutral: 'Treat the walls as decision levels, reduce size, and let price confirm direction before using gamma as confluence.',
};

export function regimeNarrative(reg: RegimeView | null, zeroGamma: number | null) {
  return reg
    ? {
        label: reg.title,
        tone: reg.nearFlip || reg.regime === 'neutral' ? 'amber' : reg.regime === 'negative' ? 'red' : 'blue',
        headline: reg.posture,
        expectation: reg.nearFlip
          ? `Spot is within 1% of the zero-gamma level ($${zeroGamma?.toFixed(2)}): a small move flips dealers between dampening and amplifying. ${REGIME_EXPECT.neutral}`
          : REGIME_EXPECT[reg.regime],
      }
    : { label: 'Reading the chain', tone: 'amber', headline: 'No dealer map yet.', expectation: 'Levels appear once the chain is read.' };
}

/** Does the 0–7 DTE book lean the other way from the whole book? */
export const nearTermDisagrees = (reg: RegimeView | null, near: NearTerm) =>
  !!reg && near.levels.length > 0 && reg.regime !== 'neutral' && Math.sign(near.total) !== (reg.regime === 'positive' ? 1 : -1);

/** Cash-session clock (ET). Square-root-of-time is a clock proxy, not theta. */
export function sessionClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const at = hour * 60 + minute;
  const open = 9 * 60 + 30; const close = 16 * 60;
  const marketDay = weekday !== 'Sat' && weekday !== 'Sun';
  const minutesLeft = marketDay && at >= open && at < close ? close - at : 0;
  return {
    minutesLeft,
    label: minutesLeft > 0 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m to close` : 'cash session closed',
    timeValuePct: minutesLeft > 0 ? Math.round(Math.sqrt(minutesLeft / 390) * 100) : 0,
  };
}

export const sessionLabelOf = (eh?: EHPayload) =>
  eh?.session === 'pre' ? 'Pre-market' : eh?.session === 'post' ? 'After hours' : eh?.session === 'regular' ? 'Live' : 'Last close';

/** Newest datum time of a terminal payload (for the tool frame's age stamp). */
export const terminalAsOf = (t?: TerminalData) => (t ? (t.cached ? t.cachedAt : t.generatedAt) ?? null : undefined);
