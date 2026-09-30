/**
 * PUBLISH GATES — from the 2026-09-30 loss attribution (docs/LOSS_ATTRIBUTION_2026-09-30.md),
 * applied to NEW automated ideas in DatabaseStorage.createTradeIdea. Pure; returns the
 * refusal reason or null.
 *
 *  #1 Options published after the close / overnight / weekends lost −$4,516 (n=72) while
 *     options published in regular hours made +$1,758 (n=73); 27 of 72 stops were first
 *     crossed in the opening bar. Refused 16:00–04:00 ET and on weekends — the producer
 *     re-evaluates on its next in-session run against a live chain. Pre-market (04:00–09:30)
 *     is left to the pre-market engine, whose plans trigger in session.
 *     OPTIONS_AFTER_CLOSE=allow disables.
 *  #2 market_scanner call/put swings on 8–21 DTE contracts lost −$3,738 (n=86, 29% win)
 *     and the Aug 31 batch −$7,634 — suspended until a walk-forward replay shows a positive
 *     half. MARKET_SCANNER_SWING_OPTIONS=on re-enables.
 */
const ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

function etClock(ms: number): { weekday: string; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of ET.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { weekday: p.weekday, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** Calendar days from the ET date of `nowMs` to an option's expiry date (YYYY-MM-DD…). */
export function calendarDte(expiry: string | null | undefined, nowMs: number): number | null {
  const e = String(expiry ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) return null;
  const today = ET_DAY.format(new Date(nowMs));
  return Math.round((Date.parse(e + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000);
}

export function publishGateFor(
  idea: { source?: string | null; assetType?: string | null; expiryDate?: string | null },
  nowMs: number,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const source = String(idea.source ?? '').toLowerCase();
  if (String(idea.assetType ?? '') !== 'option') return null;
  const { weekday, minutes } = etClock(nowMs);
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  if (env.OPTIONS_AFTER_CLOSE !== 'allow' && (weekend || minutes >= 16 * 60 || minutes < 4 * 60)) {
    return 'option ideas are not published after the close / overnight / weekends (after-close options −$4,516 n=72 vs in-session +$1,758) — re-evaluate in session';
  }
  if (source === 'market_scanner' && env.MARKET_SCANNER_SWING_OPTIONS !== 'on') {
    const dte = calendarDte(idea.expiryDate, nowMs);
    if (dte != null && dte >= 8 && dte <= 21) {
      return `market_scanner 8–21 DTE option swings are suspended (−$3,738 n=86, 29% win) — this contract is ${dte} DTE`;
    }
  }
  return null;
}
