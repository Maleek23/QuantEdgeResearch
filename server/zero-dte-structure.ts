/**
 * 0DTE INTRADAY STRUCTURE — the measured levels an index 0DTE setup is gated on.
 * ============================================================================
 * One Yahoo chart call per symbol (5-minute bars, 2 sessions, regular hours
 * only), cached 60 s, gives:
 *   • VWAP of today's regular session (Σ typical·volume / Σ volume)
 *   • 30-minute opening range (09:30–10:00 ET high/low)
 *   • prior-day high / low / close (the previous session's bars)
 *   • high/low of day EXCLUDING the last two bars (so "breaking HOD" is
 *     measured against a level that existed before the break)
 *   • the last closed bars, and the last bar's timestamp (its age is stamped)
 * Nothing is interpolated: a missing input is null and the policy that needs
 * it does not fire.
 */
import { logger } from './logger';

export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number }

export interface IntradayStructure {
  symbol: string;
  bars: Bar[];            // today's regular-session 5-minute bars, oldest first (last one may be forming)
  closed: Bar[];          // bars whose 5 minutes have elapsed
  lastClose: number | null;
  lastBarAt: number | null;
  vwap: number | null;
  or30High: number | null;
  or30Low: number | null;
  pdh: number | null;
  pdl: number | null;
  pdc: number | null;
  hodPrior: number | null;
  lodPrior: number | null;
  fetchedAt: number;
}

const cache = new Map<string, { at: number; s: IntradayStructure | null }>();
const TTL_MS = 60_000;
const BAR_MS = 5 * 60_000;

function etDateKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function etMinutes(ms: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** Pure — build the structure from raw bars (exported for tests / research replays). */
export function structureFromBars(symbol: string, all: Bar[], now = Date.now()): IntradayStructure {
  const rth = all.filter((b) => { const m = etMinutes(b.t); return m >= 570 && m < 960; });
  const today = etDateKey(now);
  const bars = rth.filter((b) => etDateKey(b.t) === today);
  const prevDay = [...new Set(rth.map((b) => etDateKey(b.t)).filter((d) => d < today))].sort().pop();
  const prev = prevDay ? rth.filter((b) => etDateKey(b.t) === prevDay) : [];
  const closed = bars.filter((b) => b.t + BAR_MS <= now);

  let pv = 0; let vv = 0;
  for (const b of bars) { if (b.v > 0) { pv += ((b.h + b.l + b.c) / 3) * b.v; vv += b.v; } }
  const or = bars.filter((b) => etMinutes(b.t) < 600);
  const orDone = bars.some((b) => etMinutes(b.t) >= 600) || etMinutes(now) >= 600;
  const priorPart = closed.slice(0, Math.max(0, closed.length - 2));
  const last = closed[closed.length - 1] ?? null;

  return {
    symbol,
    bars,
    closed,
    lastClose: last?.c ?? null,
    lastBarAt: last?.t ?? null,
    vwap: vv > 0 ? pv / vv : null,
    or30High: orDone && or.length ? Math.max(...or.map((b) => b.h)) : null,
    or30Low: orDone && or.length ? Math.min(...or.map((b) => b.l)) : null,
    pdh: prev.length ? Math.max(...prev.map((b) => b.h)) : null,
    pdl: prev.length ? Math.min(...prev.map((b) => b.l)) : null,
    pdc: prev.length ? prev[prev.length - 1].c : null,
    hodPrior: priorPart.length ? Math.max(...priorPart.map((b) => b.h)) : null,
    lodPrior: priorPart.length ? Math.min(...priorPart.map((b) => b.l)) : null,
    fetchedAt: now,
  };
}

export async function getIntradayStructure(symbol: string): Promise<IntradayStructure | null> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.s;
  let s: IntradayStructure | null = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8_000);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=5d&includePrePost=false`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (r.ok) {
      const j: any = await r.json();
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const q = res?.indicators?.quote?.[0] ?? {};
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i]; const h = q.high?.[i]; const l = q.low?.[i]; const c = q.close?.[i];
        if ([o, h, l, c].every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
          bars.push({ t: ts[i] * 1000, o, h, l, c, v: Number(q.volume?.[i] ?? 0) || 0 });
        }
      }
      if (bars.length) s = structureFromBars(sym, bars);
    } else {
      logger.warn(`[0DTE-STRUCT] ${sym}: Yahoo chart HTTP ${r.status}`);
    }
  } catch (e: any) {
    logger.warn(`[0DTE-STRUCT] ${sym}: ${e?.message ?? e}`);
  }
  cache.set(sym, { at: Date.now(), s });
  return s;
}
