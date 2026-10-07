/**
 * Board filter by call time (date + time range, ET). Pure — the NEXUS board
 * control lives in client/src/components/dashboard/tools/nexus/board-time-filter.tsx.
 *
 * A pick's call time is `calledAt` (ISO), falling back to `generatedAt`. Bounds
 * are inclusive. With any bound set, a pick with no parseable call time is
 * excluded (its time is unknown, so it cannot be said to fall in the range).
 */

export interface CalledTimes { calledAt?: string | null; generatedAt?: string | null }

const parse = (s?: string | null): number | null => {
  if (!s) return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : null;
};

export function calledMsOf(p: CalledTimes): number | null {
  return parse(p.calledAt) ?? parse(p.generatedAt);
}

export function filterByCalledRange<T extends CalledTimes>(picks: T[], fromIso: string | null, toIso: string | null): T[] {
  const from = parse(fromIso);
  const to = parse(toIso);
  if (from == null && to == null) return picks;
  return picks.filter((p) => {
    const t = calledMsOf(p);
    if (t == null) return false;
    if (from != null && t < from) return false;
    if (to != null && t > to) return false;
    return true;
  });
}

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function etWallMs(ms: number): number {
  const p = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
}

/**
 * "YYYY-MM-DDTHH:mm" (a datetime-local value) read as America/New_York wall
 * time → ISO UTC. Null for anything else. `endOfMinute` returns the last
 * millisecond of that minute (for an inclusive "to" bound).
 */
export function etLocalToIso(local: string | null | undefined, endOfMinute = false): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local ?? ''));
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall;
  for (let k = 0; k < 3; k++) guess = wall - (etWallMs(guess) - guess);
  if (!Number.isFinite(guess)) return null;
  return new Date(guess + (endOfMinute ? 59_999 : 0)).toISOString();
}

/** ISO → "YYYY-MM-DDTHH:mm" in America/New_York (for a datetime-local input). */
export function isoToEtLocal(iso: string | null | undefined): string {
  const t = parse(iso);
  if (t == null) return '';
  return new Date(etWallMs(t)).toISOString().slice(0, 16);
}
