/**
 * CHART PATH — /api/chart/path/:symbol?horizon=session|tomorrow|week|opex
 *
 * Wires live inputs into the pure engine (shared/path-projection.ts):
 *   sessionMove  /api/chart/expected-move's per-session priced move (ATM straddle / IV)
 *   skew         25Δ put IV vs 25Δ call IV on the nearest expiry of the same chain
 *   nodes/walls  the GEX engine read over the matching expiry horizon (gex-horizon-view)
 *   curve        intraday variance curve from our 5-min bars (10 sessions)
 *   delivered    nodes this session's range has already traded through
 * Cached 60 s per symbol × horizon. A modelled scenario, not a forecast.
 *
 * Frozen snapshots: the 09:40 ET read and the close read are stored once per
 * day under .cache/shared/path-snapshots/<SYM>/<date>.json, so past days show
 * "as computed then" next to what price actually did. Request-driven, plus a
 * one-minute ticker for the index set (PATH_SNAPSHOT_SYMBOLS, default SPY,QQQ,SPX).
 */
import type { Express, RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  etParts, parsePathHorizon, simulatePath, varianceCurveFromBars, PATH_DISCLAIMER,
  type PathHorizon, type PathLevel, type PathNode, type PathResult,
} from '@shared/path-projection';
import type { GexHorizon } from '@shared/gex-horizon';
import { logger } from './logger';

export interface PathPayload {
  symbol: string; generatedAt: string; label: typeof PATH_DISCLAIMER; horizon: PathHorizon;
  result: PathResult | null;
  inputs: null | {
    sessionMove: number; skew: number; regime: 'long' | 'short' | 'neutral'; gexHorizon: GexHorizon; nodes: number;
    curve: 'bars' | 'fallback'; curveSessions: number; delivered: number; chainSource: string | null; events: number;
  };
  note: string;
}

const GEX_FOR: Record<PathHorizon, GexHorizon> = { session: 'today', tomorrow: 'week', week: 'week', opex: 'opex' };
const cache = new Map<string, { at: number; p: Promise<PathPayload> }>();
const TTL = 60_000;

/** 25Δ skew from the nearest expiry: (ivPut − ivCall) / (ivPut + ivCall), clamped ±0.25. Pure. */
export function skewFromChain(rows: Array<{ option_type: 'call' | 'put'; expiration_date: string; greeks?: { delta?: number; mid_iv?: number; smv_vol?: number } | null }>): number {
  const exps = [...new Set(rows.map((r) => r.expiration_date))].sort();
  for (const e of exps.slice(0, 3)) {
    const leg = rows.filter((r) => r.expiration_date === e && r.greeks?.delta != null);
    const iv = (r: typeof leg[number]) => Number(r.greeks?.mid_iv ?? r.greeks?.smv_vol ?? 0);
    const pick = (target: number) => leg.filter((r) => iv(r) > 0 && iv(r) < 5).sort((a, b) => Math.abs((a.greeks!.delta ?? 0) - target) - Math.abs((b.greeks!.delta ?? 0) - target))[0];
    const p = pick(-0.25); const c = pick(0.25);
    if (p && c && Math.abs((p.greeks!.delta ?? 0) + 0.25) < 0.12 && Math.abs((c.greeks!.delta ?? 0) - 0.25) < 0.12) {
      const s = (iv(p) - iv(c)) / (iv(p) + iv(c));
      return Math.max(-0.25, Math.min(0.25, s));
    }
  }
  return 0;
}

/** Nodes the current session already traded through (low ≤ strike ≤ high). Pure. */
export function markDelivered(nodes: PathNode[], sessionHigh: number | null, sessionLow: number | null): PathNode[] {
  if (sessionHigh == null || sessionLow == null) return nodes;
  return nodes.map((n) => ({ ...n, delivered: n.strike >= sessionLow && n.strike <= sessionHigh }));
}

async function compute(sym: string, horizon: PathHorizon, nowMs: number): Promise<PathPayload> {
  const base: PathPayload = { symbol: sym, generatedAt: new Date(nowMs).toISOString(), label: PATH_DISCLAIMER, horizon, result: null, inputs: null, note: '' };
  const { buildExpectedMove } = await import('./chart-expected-move');
  const em = await buildExpectedMove(sym, nowMs);
  if (!em.cone || !(em.spot && em.spot > 0)) return { ...base, note: `No options-priced move for ${sym} right now — no path is modelled (nothing is estimated in its place).` };
  const spot = em.spot;

  let skew = 0; let chainSource: string | null = em.chainSource;
  try {
    const { getDeskChain } = await import('./zero-dte-desk');
    const chain = await getDeskChain(sym, true);
    if (chain) { skew = skewFromChain(chain.rows); chainSource = chain.source; }
  } catch { /* skew 0 */ }

  const gexHorizon = GEX_FOR[horizon];
  let nodes: PathNode[] = []; let regime: 'long' | 'short' | 'neutral' = 'neutral';
  const levels: PathLevel[] = [];
  try {
    const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
    const { buildHorizonView } = await import('./gex-horizon-view');
    const gex = await calculateAggregateGammaExposure(sym);
    if (gex) {
      const view = buildHorizonView(gex, gex.strikeExpiryMatrix ?? [], gexHorizon, nowMs);
      nodes = view.nodes.map(([strike, g]) => ({ strike, gex: g })).filter((n) => Math.abs(n.strike - spot) / spot < 0.15);
      const tot = view.totalGEX ?? gex.totalGEX ?? null;
      regime = tot == null ? 'neutral' : tot > 0 ? 'long' : tot < 0 ? 'short' : 'neutral';
      if (view.callWall) levels.push({ name: 'Call wall', price: view.callWall });
      if (view.putWall) levels.push({ name: 'Put wall', price: view.putWall });
      if (view.zeroGamma) levels.push({ name: 'Flip', price: view.zeroGamma });
    }
  } catch (e) { logger.debug?.(`[CHART-PATH] ${sym} gex: ${(e as Error).message}`); }
  const apex = nodes.filter((n) => n.gex > 0).sort((a, b) => b.gex - a.gex)[0];
  if (apex && !levels.some((l) => Math.abs(l.price - apex.strike) < 1e-6)) levels.unshift({ name: 'Apex', price: apex.strike });
  // node strikes near price as candidate gatekeepers
  for (const n of nodes) if (!levels.some((l) => Math.abs(l.price - n.strike) < 1e-6) && levels.length < 14) levels.push({ name: n.gex > 0 ? '+γ node' : '−γ node', price: n.strike });

  let curve: ReturnType<typeof varianceCurveFromBars> = varianceCurveFromBars([]);
  let hi: number | null = null; let lo: number | null = null;
  try {
    const yf = await (await import('./yahoo-finance-service')).getYahooFinance();
    const ySym = sym === 'SPX' ? '^SPX' : sym;
    const chart: any = await (yf as any).chart(ySym, { period1: new Date(nowMs - 16 * 86_400_000), interval: '5m' });
    const bars = (chart?.quotes ?? []).filter((q: any) => q.close > 0).map((q: any) => ({ time: Math.floor(new Date(q.date).getTime() / 1000), close: q.close, high: q.high, low: q.low }));
    curve = varianceCurveFromBars(bars);
    const today = etParts(nowMs).date;
    const todays = bars.filter((b: any) => etParts(b.time * 1000).date === today);
    if (todays.length) { hi = Math.max(...todays.map((b: any) => b.high || b.close)); lo = Math.min(...todays.map((b: any) => b.low || b.close)); }
  } catch (e) { logger.debug?.(`[CHART-PATH] ${sym} bars: ${(e as Error).message}`); }
  nodes = markDelivered(nodes, hi, lo);

  const result = simulatePath({
    spot, nowMs, horizon, sessionMove: em.cone.perSessionMove, varianceCurve: curve.weights, regime, nodes, skew, levels,
    events: [], paths: 2000, seed: Math.floor(nowMs / TTL),
  });
  return {
    ...base, result,
    inputs: { sessionMove: em.cone.perSessionMove, skew, regime, gexHorizon, nodes: nodes.length, curve: curve.source, curveSessions: curve.sessions, delivered: nodes.filter((n) => n.delivered).length, chainSource, events: 0 },
    note: `${PATH_DISCLAIMER}: 2,000 simulated paths on 5-min steps from the options-priced move (${em.cone.basis}); `
      + `${regime === 'long' ? 'long gamma — positive nodes pull (capped)' : 'short/neutral gamma — no node pull (λ = 0)'}; negative nodes raise local vol; `
      + `intraday shape from ${curve.source === 'bars' ? `${curve.sessions} sessions of our 5-min bars` : 'a default U-curve (too few bars)'}; holidays not excluded; no event calendar wired yet.`,
  };
}

export function buildPath(symbol: string, horizon: PathHorizon, nowMs = Date.now()): Promise<PathPayload> {
  const k = `${symbol}:${horizon}`;
  const hit = cache.get(k);
  if (hit && nowMs - hit.at < TTL) return hit.p;
  const p = compute(symbol, horizon, nowMs).catch((e) => { cache.delete(k); throw e; });
  cache.set(k, { at: nowMs, p });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return p;
}

/* ── frozen snapshots ── */
export type SnapKind = '0940' | 'close';
export function snapshotDir(): string {
  return path.join(process.env.SHARED_STATE_DIR || path.join(process.cwd(), '.cache', 'shared'), 'path-snapshots');
}
/** Which snapshot (if any) a minute-of-day should freeze. Pure. */
export function snapshotKindAt(etMin: number): SnapKind | null {
  if (etMin >= 580 && etMin < 595) return '0940';
  if (etMin >= 955 && etMin < 960) return 'close';
  return null;
}
const safe = (s: string) => s.replace(/[^A-Z0-9.^]/gi, '');
type DayFile = Partial<Record<SnapKind, Partial<Record<PathHorizon, PathPayload>>>>;
export function readSnapshots(sym: string, date: string, dir = snapshotDir()): DayFile {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return {};
  try { return JSON.parse(fs.readFileSync(path.join(dir, safe(sym), `${date}.json`), 'utf8')) ?? {}; } catch { return {}; }
}
export function writeSnapshot(sym: string, date: string, kind: SnapKind, p: PathPayload, dir = snapshotDir()): boolean {
  const f = readSnapshots(sym, date, dir);
  if (f[kind]?.[p.horizon]) return false; // frozen once
  f[kind] = { ...(f[kind] ?? {}), [p.horizon]: p };
  const d = path.join(dir, safe(sym));
  fs.mkdirSync(d, { recursive: true });
  const tmp = path.join(d, `${date}.json.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(f));
  fs.renameSync(tmp, path.join(d, `${date}.json`));
  return true;
}
function maybeFreeze(sym: string, p: PathPayload, nowMs: number) {
  if (!p.result) return;
  const { date, min } = etParts(nowMs);
  const kind = snapshotKindAt(min);
  if (!kind) return;
  try { writeSnapshot(sym, date, kind, p); } catch (e) { logger.debug?.(`[CHART-PATH] snapshot ${sym}: ${(e as Error).message}`); }
}

let ticker: ReturnType<typeof setInterval> | null = null;
function startSnapshotTicker() {
  if (ticker || process.env.PATH_SNAPSHOTS === '0') return;
  const syms = (process.env.PATH_SNAPSHOT_SYMBOLS || 'SPY,QQQ,SPX').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  ticker = setInterval(() => {
    const now = Date.now();
    const { min } = etParts(now);
    if (!snapshotKindAt(min)) return;
    for (const s of syms) for (const h of ['session', 'week'] as PathHorizon[]) {
      buildPath(s, h, now).then((p) => maybeFreeze(s, p, now)).catch(() => { /* next minute */ });
    }
  }, 60_000);
  ticker.unref?.();
}

export function registerChartPathRoutes(app: Express, requireMember: RequestHandler): void {
  startSnapshotTicker();
  app.get('/api/chart/path/:symbol', requireMember, async (req, res) => {
    try {
      const { canonicalChartSymbol } = await import('@shared/index-symbols');
      const symbol = canonicalChartSymbol(String(req.params.symbol ?? ''));
      if (!/^[A-Z.^]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
      const date = typeof req.query.date === 'string' ? req.query.date : null;
      if (date) return res.json({ symbol, date, label: PATH_DISCLAIMER, snapshots: readSnapshots(symbol, date) });
      const now = Date.now();
      const p = await buildPath(symbol, parsePathHorizon(req.query.horizon), now);
      maybeFreeze(symbol, p, now);
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.json(p);
    } catch (e) {
      logger.warn(`[CHART-PATH] failed: ${(e as Error).message}`);
      res.status(500).json({ error: 'Path projection unavailable' });
    }
  });
}
