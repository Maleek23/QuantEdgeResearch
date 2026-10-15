/**
 * Known events for the Path engine and the Envelope cones: macro releases
 * from server/economic-calendar.ts (FRED release dates over the curated
 * floor) and the symbol's own earnings date from server/earnings-calendar.ts.
 * Converted to jump steps by shared/event-steps.ts. Never throws — a missing
 * source means fewer events, and the count is reported in the payload.
 */
import { buildEventSteps } from '@shared/event-steps';
import type { PathEvent } from '@shared/path-projection';
import { logger } from './logger';

const NO_EARNINGS = new Set(['SPX', 'SPY', 'QQQ', 'NDX', 'IWM', 'DIA', 'RUT', 'XSP', 'VIX', 'ES', 'NQ']);

export async function knownPathEvents(sym: string, sessionMove: number, nowMs: number, endMs: number): Promise<{ events: PathEvent[]; sources: string[] }> {
  const days = Math.min(60, Math.max(2, Math.ceil((endMs - nowMs) / 86_400_000) + 1));
  const sources: string[] = [];
  let macro: { name: string; date: string; time?: string; importance: 'high' | 'medium' | 'low' }[] = [];
  try {
    const cal = await import('./economic-calendar');
    void cal.refreshFredCalendar().catch(() => undefined);
    macro = cal.getUpcomingEvents(days);
    sources.push(`macro:${cal.getCalendarCoverage().source}`);
  } catch (e) { logger.debug?.(`[PATH-EVENTS] macro: ${(e as Error).message}`); }
  let earnings: { date: string; timing: string | null }[] = [];
  if (!NO_EARNINGS.has(sym.toUpperCase())) {
    try {
      const ec = await import('./earnings-calendar');
      // a slow provider never holds up the projection: 2.5 s, then no earnings step
      const map = await Promise.race([ec.getEarningsBySymbol(days), new Promise<Awaited<ReturnType<typeof ec.getEarningsBySymbol>>>((r) => setTimeout(() => r(new Map()), 2500))]);
      const e = map.get(sym.toUpperCase());
      if (e) { earnings = [{ date: e.date, timing: e.session === 'post' ? 'amc' : e.session === 'pre' ? 'bmo' : null }]; sources.push('earnings'); }
    } catch (err) { logger.debug?.(`[PATH-EVENTS] earnings: ${(err as Error).message}`); }
  }
  return { events: buildEventSteps({ sessionMove, nowMs, endMs, macro, earnings }), sources };
}
