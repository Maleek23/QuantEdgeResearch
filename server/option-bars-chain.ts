/**
 * One contract's 1-minute TRADE bars over a window, first source with data wins:
 *   Massive (Polygon) option aggs 1m — prior sessions only (our plan serves
 *   aggregates for completed days; same-day asks are skipped) → Alpaca 1Min
 *   (indicative prints, ~16-min delay) → Yahoo OPR 1m (single session).
 * Read-only GETs; the Massive key travels in the Authorization header, never a URL.
 * Never throws: an empty result names every source tried.
 */
import { etParts, etWallToMs } from '@shared/loss-rules';
import { logger } from './logger';

export interface ContractBar { t: number; o: number; h: number; l: number; c: number; v?: number }
export interface ContractBars { bars: ContractBar[]; source: string; occ: string | null; tried: string[] }

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function occRoots(symbol: string): string[] {
  const s = symbol.toUpperCase();
  return s === 'SPX' ? ['SPXW', 'SPX'] : s === 'NDX' ? ['NDXP', 'NDX'] : s === 'RUT' ? ['RUTW', 'RUT'] : [s];
}

async function massiveAggs(occ: string, fromMs: number, toMs: number): Promise<ContractBar[]> {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) return [];
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/O:${encodeURIComponent(occ)}/range/1/minute/${Math.floor(fromMs)}/${Math.ceil(toMs)}?adjusted=true&sort=asc&limit=50000`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return [];
    const j: any = await res.json();
    if (j?.status && j.status !== 'OK' && j.status !== 'DELAYED') return [];
    return ((j?.results ?? []) as any[])
      .filter((b) => fin(b?.t) && fin(b?.h) && b.h > 0 && fin(b?.o) && fin(b?.l) && fin(b?.c))
      .map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: Number(b.v) || 0 }));
  } catch (e) {
    logger.debug(`[OPTION-BARS] massive ${occ}: ${(e as Error).message}`);
    return [];
  }
}

export async function contractMinuteBars(args: {
  symbol: string; expiry: string; optionType: 'call' | 'put'; strike: number; fromMs: number; toMs: number; nowMs?: number;
}): Promise<ContractBars> {
  const nowMs = args.nowMs ?? Date.now();
  const tried: string[] = [];
  const { buildOccOptionSymbol, getHistoricalOptionMinutes } = await import('./option-minute-history');
  const { getAlpacaOptionBars } = await import('./alpaca-options');
  const today = etParts(nowMs).dateKey;
  const p = etParts(nowMs);
  const todayOpen = etWallToMs(p.y, p.m, p.d, 9 * 60 + 30);
  const inWin = (b: ContractBar) => b.t >= args.fromMs - 60_000 && b.t < args.toMs;
  for (const root of occRoots(args.symbol)) {
    let occ: string;
    try { occ = buildOccOptionSymbol(root, args.expiry, args.optionType, args.strike); } catch { continue; }
    if (args.toMs <= todayOpen) {
      tried.push(`massive:${occ}`);
      const m = (await massiveAggs(occ, args.fromMs - 60_000, args.toMs)).filter(inWin);
      if (m.length) return { bars: m, source: 'massive:1m', occ, tried };
    }
    tried.push(`alpaca:${occ}`);
    try {
      const a = (await getAlpacaOptionBars(occ, args.fromMs - 60_000, args.toMs, '1Min')).filter(inWin);
      if (a.length) return { bars: a, source: 'alpaca:1Min', occ, tried };
    } catch { /* next */ }
    const day = etParts(args.fromMs).dateKey;
    if (day === etParts(args.toMs - 1).dateKey && day <= today) {
      tried.push(`yahoo:${occ}`);
      const y = await getHistoricalOptionMinutes(occ, day).catch(() => null);
      const bars = (y?.bars ?? []).map((b) => ({ t: Date.parse(b.timestamp), o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })).filter(inWin);
      if (bars.length) return { bars, source: 'yahoo:1m', occ, tried };
    }
  }
  return { bars: [], source: 'none', occ: null, tried };
}
