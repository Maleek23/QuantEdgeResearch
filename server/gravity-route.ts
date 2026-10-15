/**
 * GRAVITY — GET /api/gex/gravity/:symbol?horizon=today|week|opex|all
 *
 * Node labels (Apex, Gatekeeper, Rug, Trampoline, delivered vs fresh) and node
 * velocity on 5m / 15m / 1h with Halo, from the SAME per-strike timeline the
 * chart's orbs read (server/chart-overlays.ts buildChartOverlays → gexTimeline,
 * fed by the 5-min intraday snapshots, flag GEX_INTRADAY_SNAPSHOTS). Pure maths
 * in shared/gravity-nodes.ts. Delivered/fresh uses the session's high/low of
 * the snapshot spots (5-min resolution — stated in the note).
 * Flag GRAVITY_LABELS (default on; FLAG_GRAVITY_LABELS=off → 404).
 */
import type { Express, RequestHandler } from 'express';
import { readGravity, type GravityRead } from '@shared/gravity-nodes';
import { parseHorizon, type GexHorizon } from '@shared/gex-horizon';
import { serverFlag } from '@shared/feature-flags';
import { etParts } from '@shared/path-projection';
import { logger } from './logger';

export interface GravityPayload {
  symbol: string;
  horizon: GexHorizon;
  generatedAt: string;
  asOf: string | null;
  read: GravityRead | null;
  samples: number;
  note: string;
}

type Timeline = {
  samples: { t: number; spot: number | null }[];
  series: { strike: number; points: [number, number][] }[];
};

/** Payload from a timeline (pure; the route and the test share it). */
export function gravityFromTimeline(symbol: string, horizon: GexHorizon, tl: Timeline | null, nowMs: number): GravityPayload {
  const base: GravityPayload = { symbol, horizon, generatedAt: new Date(nowMs).toISOString(), asOf: null, read: null, samples: 0, note: '' };
  if (!tl || !tl.samples.length) return { ...base, note: `No intraday GEX snapshots for ${symbol} yet — nothing is labelled (nothing is estimated in their place).` };
  const last = tl.samples[tl.samples.length - 1];
  const spot = [...tl.samples].reverse().find((s) => s.spot != null && s.spot > 0)?.spot ?? null;
  if (spot == null) return { ...base, note: 'Snapshots carry no spot — cannot place nodes relative to price.' };
  const nodes = tl.series
    .map((s) => ({ strike: s.strike, gex: s.points.find((p) => p[0] === last.t)?.[1] ?? 0 }))
    .filter((n) => n.gex !== 0);
  const day = etParts(last.t).date;
  const todays = tl.samples.filter((s) => s.spot != null && etParts(s.t).date === day).map((s) => s.spot as number);
  const read = readGravity({
    spot, nodes,
    sessionHigh: todays.length ? Math.max(...todays) : null,
    sessionLow: todays.length ? Math.min(...todays) : null,
    series: tl.series, sampleTimes: tl.samples.map((s) => s.t), asOf: last.t,
  });
  return {
    ...base, asOf: new Date(last.t).toISOString(), read, samples: tl.samples.length,
    note: 'Structural labels (our definitions), not signals. Velocity = Δ GEX over 5m/15m/1h ÷ the book\'s largest |GEX|; Halo = ≥2 timeframes moving the same way by ≥5%. Delivered = inside today\'s range of 5-min snapshot spots.',
  };
}

const cache = new Map<string, { at: number; p: Promise<GravityPayload> }>();
export async function buildGravity(symbol: string, horizon: GexHorizon, nowMs = Date.now()): Promise<GravityPayload> {
  const k = `${symbol}:${horizon}`;
  const hit = cache.get(k);
  if (hit && nowMs - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const { buildChartOverlays } = await import('./chart-overlays');
    const ov: any = await buildChartOverlays(symbol, '1D', null, horizon);
    return gravityFromTimeline(symbol, horizon, ov?.gexTimeline ?? null, nowMs);
  })().catch((e) => { cache.delete(k); throw e; });
  cache.set(k, { at: nowMs, p });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return p;
}

export function registerGravityRoutes(app: Express, requireMember: RequestHandler): void {
  app.get('/api/gex/gravity/:symbol', requireMember, async (req, res) => {
    if (!serverFlag('GRAVITY_LABELS')) return res.status(404).json({ error: 'Gravity labels are switched off' });
    try {
      const { canonicalChartSymbol } = await import('@shared/index-symbols');
      const symbol = canonicalChartSymbol(String(req.params.symbol ?? ''));
      if (!/^[A-Z.^]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'Invalid symbol' });
      const horizon = parseHorizon(req.query.horizon ?? 'today');
      res.setHeader('Cache-Control', 'private, max-age=30');
      res.json(await buildGravity(symbol, horizon));
    } catch (e) {
      logger.warn(`[GRAVITY] failed: ${(e as Error).message}`);
      res.status(500).json({ error: 'Gravity read unavailable' });
    }
  });
}
