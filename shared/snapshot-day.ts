/**
 * GEX matrix DTE is counted from the chain snapshot, not from "now" (audit
 * 2026-10-07 #15). When the snapshot is from an earlier ET day the grid says so,
 * otherwise "3d" silently means three days from a day that has passed.
 */
const etDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function snapshotDayNote(asOf: string | number | null | undefined, nowMs = Date.now()): string | null {
  if (asOf == null || asOf === '') return null;
  const t = typeof asOf === 'number' ? asOf : Date.parse(asOf);
  if (!Number.isFinite(t)) return null;
  if (etDay(t) === etDay(nowMs)) return null;
  const d = new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
  return `Snapshot from ${d} · days to expiry counted from ${d}`;
}
