/**
 * Bars for exit-time resolution (shared/exit-hit-time.ts does the deciding).
 *
 *   ≤5 days since entry   5-minute bars, 5d range
 *   ≤30 days              5-minute bars, 1mo range (Yahoo keeps 60 days of 5m)
 *   older / 5m empty      daily bars
 *
 * Equities are filtered to the regular session (09:30–16:00 ET) — the same
 * window the validator's same-day enrichment and research/path-replay use.
 * Crypto uses Yahoo's SYM-USD 24/7 bars. Futures are not resolved here (no
 * reliable continuous-contract bars): they fall back to 'live'.
 * All fetches go through historical-candles → provider cache, so repeated
 * symbols in one sweep cost one upstream request.
 */
import { fetchCandles } from '../historical-candles';
import { readOracleExecutionAudit } from '@shared/oracle-lifecycle';
import type { ExitTimingIdea, TimedBar } from '@shared/exit-hit-time';

const DAY = 86_400_000;

function etMinute(sec: number): number {
  const [h, m] = new Date(sec * 1000)
    .toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
    .split(':').map(Number);
  return (h % 24) * 60 + m;
}
export const isRegularSession = (sec: number) => { const m = etMinute(sec); return m >= 570 && m < 960; };

export interface BarsForExit { bars: TimedBar[]; interval: '5m' | '1d' | null }

export async function barsSinceEntry(
  symbol: string, assetType: string | null | undefined, entryMs: number, nowMs = Date.now(),
): Promise<BarsForExit> {
  if (assetType === 'future') return { bars: [], interval: null };
  const crypto = assetType === 'crypto';
  const sym = crypto ? `${symbol.toUpperCase().replace(/-USD$/, '')}-USD` : symbol.toUpperCase();
  const ageDays = (nowMs - entryMs) / DAY;
  if (ageDays <= 30) {
    const intraday = await fetchCandles(sym, ageDays <= 5 ? '5d' : '1mo', '5m');
    const bars = crypto ? intraday : intraday.filter((b) => isRegularSession(b.time));
    if (bars.some((b) => b.time * 1000 <= entryMs + 5 * 60_000)) return { bars, interval: '5m' };
    // 5m history does not reach back to entry — daily bars cover the gap.
  }
  const daily = await fetchCandles(sym, ageDays <= 90 ? '3mo' : '1y', '1d');
  return { bars: daily, interval: daily.length ? '1d' : null };
}

/** Entry anchor: the later of publication and a recorded trigger. */
export function entryAnchorMs(idea: { timestamp: string; convergenceSignalsJson?: unknown }): number {
  const created = Date.parse(idea.timestamp);
  const trig = Date.parse(String(readOracleExecutionAudit(idea.convergenceSignalsJson as any)?.triggerObservedAt ?? ''));
  return Math.max(created, Number.isFinite(trig) ? trig : 0);
}

export function toExitTimingIdea(idea: {
  symbol: string; timestamp: string; entryPrice: number; targetPrice: number; stopLoss: number;
  direction: string; convergenceSignalsJson?: unknown;
}): ExitTimingIdea {
  return {
    symbol: idea.symbol, timestamp: idea.timestamp,
    entryPrice: Number(idea.entryPrice), targetPrice: Number(idea.targetPrice), stopLoss: Number(idea.stopLoss),
    // Underlying thesis direction — same normalisation as PerformanceValidator.getNormalizedDirection.
    direction: idea.direction === 'short' ? 'short' : 'long',
    entryMs: entryAnchorMs(idea),
  };
}
