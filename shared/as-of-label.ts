/**
 * Stamps for values that are NOT repriced on read (audit 2026-10-07 #3,
 * memory: live, not carried — reprice live or stamp age).
 */
/** "as of last cycle 4m ago" — the paper book's marks are written by the cycle, not repriced on read. */
export function bookAsOfLabel(lastCycleAt: string | null, oldestMarkAt: string | null, now = Date.now()): string {
  const at = lastCycleAt ?? oldestMarkAt;
  if (!at) return 'as of last cycle · time unknown';
  const m = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  if (!Number.isFinite(m)) return 'as of last cycle · time unknown';
  const ago = m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
  return `as of last cycle ${ago}`;
}
