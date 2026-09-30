/**
 * OPTION EXPIRY = 16:00 NEW YORK ON THE EXPIRY DATE.
 *
 * WHAT WAS WRONG (SR 11-7 v6 F-3, docs/LOSS_ATTRIBUTION_2026-09-30.md §3)
 * `new Date('2026-10-01')` parses a date-only string as 00:00 UTC — 8 PM ET
 * the evening BEFORE (7 PM in winter). The outcome tracker compared that to
 * "now", so every option idea on its expiry day was "expired" on the first
 * pass: 0DTE and expiry-day holds closed early, 9 rows were stamped closed
 * before they were even published.
 *
 * THE RULE
 *   • An option's expiry instant is 16:00 America/New_York on its expiry date,
 *     DST-correct (20:00Z in EDT, 21:00Z in EST). Every comparison of an
 *     option expiry against a clock goes through optionExpiryCloseMs().
 *   • Days-to-expiry is counted in New York calendar days (0 on expiry day).
 *   • Holding period follows the contract's DTE (holdingPeriodForDte) unless the
 *     producer explicitly publishes an intraday 0DTE plan.
 *
 * Pure: no I/O. Used by the outcome tracker, the exit-date repair, loss rules,
 * the journal expiry settlement and the GEX producers.
 */

const NY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** New York calendar day (YYYY-MM-DD) and minute-of-day for an instant. */
export function nyDayMinute(ms: number): { day: string; minute: number } {
  const p = NY_PARTS.formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, minute: (Number(g('hour')) % 24) * 60 + Number(g('minute')) };
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const US_DAY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * The calendar date an expiry refers to, as YYYY-MM-DD — never shifted by a
 * time zone. Accepts 'YYYY-MM-DD', an ISO timestamp (its date part is the
 * expiry: stored expiries are dates, a trailing time is serialisation noise),
 * 'MM/DD/YYYY', or a Date (a Date built from a date-only string is UTC
 * midnight, so its UTC date is the expiry). Null when unparseable.
 */
export function expiryDay(expiry: string | Date | null | undefined): string | null {
  if (expiry == null) return null;
  if (expiry instanceof Date) {
    return Number.isFinite(expiry.getTime()) ? expiry.toISOString().slice(0, 10) : null;
  }
  const s = String(expiry).trim();
  const iso = ISO_DAY.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = US_DAY.exec(s);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return null;
}

/** 16:00 New York (or `minuteOfDay`) on YYYY-MM-DD `day`, as epoch ms. DST-correct. */
export function nyWallTimeMs(day: string, minuteOfDay = 16 * 60): number {
  const [y, m, d] = day.split('-').map(Number);
  const hh = Math.floor(minuteOfDay / 60), mm = minuteOfDay % 60;
  // New York is UTC−4 (EDT) or UTC−5 (EST): try both offsets, keep the one
  // whose New York rendering is the requested wall time.
  for (const off of [4, 5]) {
    const ms = Date.UTC(y, m - 1, d, hh + off, mm);
    const p = nyDayMinute(ms);
    if (p.day === day && p.minute === minuteOfDay) return ms;
  }
  return Date.UTC(y, m - 1, d, hh + 4, mm);
}

/** The instant an option with this expiry stops trading: 16:00 ET on its expiry date. NaN when unparseable. */
export function optionExpiryCloseMs(expiry: string | Date | null | undefined): number {
  const day = expiryDay(expiry);
  return day ? nyWallTimeMs(day) : NaN;
}

/** Has the option's expiry session closed at `nowMs`? False when the expiry is unparseable. */
export function isOptionExpired(expiry: string | Date | null | undefined, nowMs: number): boolean {
  const close = optionExpiryCloseMs(expiry);
  return Number.isFinite(close) && nowMs >= close;
}

/** New York calendar days from `nowMs` to the expiry date (0 on expiry day, negative after). Null when unparseable. */
export function calendarDaysToExpiry(expiry: string | Date | null | undefined, nowMs: number): number | null {
  const day = expiryDay(expiry);
  if (!day) return null;
  const today = nyDayMinute(nowMs).day;
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

export type IdeaHoldingPeriod = 'day' | 'swing' | 'position';

/**
 * Holding period implied by a contract's DTE (shared/schema.ts conventions:
 * day <6h, swing 1–5 days, position 5+ days):
 *   0 DTE → 'day' · 1–10 DTE → 'swing' · >10 DTE → 'position'.
 * A producer's own 'day' label is NOT an override: only a 0DTE contract is an
 * intraday plan. A dated contract is held on its own clock.
 *
 * 2026-09-30: gex_scanner tagged 16-DTE IWM puts 'day', so the Loss Rules time
 * stop gave them a 1-day horizon and closed them at 12:45 ET (both contracts
 * later closed above entry).
 */
export function holdingPeriodForDte(dte: number | null | undefined, opts: { fallback?: IdeaHoldingPeriod } = {}): IdeaHoldingPeriod {
  if (dte == null || !Number.isFinite(dte)) return opts.fallback ?? 'swing';
  if (dte <= 0) return 'day';
  if (dte <= 10) return 'swing';
  return 'position';
}
