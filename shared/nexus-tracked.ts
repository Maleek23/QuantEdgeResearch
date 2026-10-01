/**
 * NEXUS TRACKED SYMBOLS — pure core (no I/O).
 *
 * The operator can tell NEXUS to "track MRVL, MSFT for the rest of the week":
 * a short, time-boxed list of names every idea producer that keeps a universe
 * list scans first (source label 'tracked'). Tracking widens WHAT is scanned;
 * it never lowers a publish gate — a tracked name earns a card on the same
 * evidence as any other name.
 *
 * Entries come from two places, merged:
 *   env   NEXUS_TRACK="MRVL:2026-10-02,MSFT:2026-10-02"  (date = last ET day tracked;
 *         a bare symbol means "today only")
 *   file  .cache/shared/nexus-tracked.json (server/nexus-tracked.ts, admin endpoints)
 * An entry expires at the END of its `until` ET day and drops out automatically.
 */

export const TRACKED_SOURCE = 'tracked' as const;
/** Hard cap: every tracked name costs chain/tape reads on a 1 vCPU box. */
export const MAX_TRACKED = 8;
export const MAX_TRACK_DAYS = 10;

export interface TrackedSymbol {
  symbol: string;
  /** ISO instant — the end (23:59:59.999) of the last ET day tracked. */
  until: string;
  note: string;
  addedAt: string;
  origin: 'env' | 'operator';
}

/** What the shared file holds. `dismissed` = env seeds the operator removed ("SYM@until"). */
export interface TrackedFile {
  entries: TrackedSymbol[];
  dismissed: string[];
}

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const ET_WD = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });

export const etDay = (ms: number): string => ET_DAY.format(new Date(ms));

export function normSymbol(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z.]{0,5}$/.test(s) ? s : null;
}

/** The last millisecond of ET calendar day `day` (YYYY-MM-DD), as ISO. DST-safe. */
export function etEndOfDayIso(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Midnight ET of the next day is 04:00 or 05:00 UTC; the one whose previous ms is still `day` wins.
  for (const offH of [4, 5]) {
    const t = Date.UTC(y, mo - 1, d + 1, offH, 0, 0) - 1;
    if (etDay(t) === day && etDay(t + 1) !== day) return new Date(t).toISOString();
  }
  return null;
}

/** ET day `n` trading sessions from now, counting today as 1 (weekends skipped). */
export function tradingDayAhead(nowMs: number, sessions: number): string {
  const n = Math.max(1, Math.min(MAX_TRACK_DAYS, Math.floor(sessions) || 1));
  let t = nowMs;
  const isWeekend = (ms: number) => /Sat|Sun/.test(ET_WD.format(new Date(ms)));
  while (isWeekend(t)) t += 86_400_000;
  let left = n - 1;
  while (left > 0) {
    t += 86_400_000;
    if (!isWeekend(t)) left--;
  }
  return etDay(t);
}

/** Parse NEXUS_TRACK. Bad items are skipped, never thrown. */
export function parseTrackEnv(raw: string | undefined | null, nowMs: number): TrackedSymbol[] {
  const out: TrackedSymbol[] = [];
  for (const part of String(raw ?? '').split(/[,\s]+/)) {
    if (!part.trim()) continue;
    const [symRaw, dayRaw] = part.split(':');
    const symbol = normSymbol(symRaw);
    const until = etEndOfDayIso(dayRaw?.trim() || etDay(nowMs));
    if (!symbol || !until) continue;
    out.push({ symbol, until, note: 'NEXUS_TRACK env', addedAt: new Date(nowMs).toISOString(), origin: 'env' });
  }
  return out;
}

export const dismissKey = (e: Pick<TrackedSymbol, 'symbol' | 'until'>) => `${e.symbol}@${e.until}`;

/**
 * The live list: file entries win over env seeds for the same symbol, dismissed
 * env seeds and anything past `until` drop, capped at MAX_TRACKED (soonest expiry last).
 */
export function mergeTracked(env: TrackedSymbol[], file: TrackedFile | null | undefined, nowMs: number): TrackedSymbol[] {
  const dismissed = new Set(file?.dismissed ?? []);
  const bySym = new Map<string, TrackedSymbol>();
  for (const e of env) if (!dismissed.has(dismissKey(e))) bySym.set(e.symbol, e);
  for (const e of file?.entries ?? []) {
    const symbol = normSymbol(e?.symbol);
    if (symbol && typeof e.until === 'string') bySym.set(symbol, { ...e, symbol });
  }
  return Array.from(bySym.values())
    .filter((e) => Date.parse(e.until) > nowMs)
    .sort((a, b) => Date.parse(b.until) - Date.parse(a.until) || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_TRACKED);
}

/** Prepend tracked names to a universe, deduped, preserving the rest's order. */
export function withTracked(tracked: string[], universe: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...tracked, ...universe]) {
    const u = String(s).toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** "until Fri" style label for the UI (ET weekday of the expiry). */
export function untilLabel(untilIso: string, nowMs: number): string {
  const t = Date.parse(untilIso);
  if (!Number.isFinite(t)) return '—';
  if (etDay(t) === etDay(nowMs)) return 'today';
  return ET_WD.format(new Date(t));
}
