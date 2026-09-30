/**
 * EXIT-DATE REPAIR planner (pure given a bar supplier) — used by
 * scripts/repair-exit-dates.ts and scripts/test-exit-dates.ts.
 *
 * Prod's outcome tracker first ran 2026-09-30 12:43 UTC and cleared a backlog,
 * stamping every exit with the sweep time. A row is a repair candidate when:
 *   - it resolved (hit_target / hit_stop / expired) with exitDate ≥ `since`,
 *   - its exitDate is the resolution time — within 120 s of predictionValidatedAt
 *     (the validator writes both from the same `now`),
 *   - it carries no [exit-time:…] tag yet (idempotent: a repaired row is tagged
 *     and its exitDate moves before `since`, so it never qualifies twice).
 * A candidate is updated only when the bars establish a real time (first bar
 * crossing the level, or the deadline with a bar close before it). Everything
 * else is left untouched and listed with the reason.
 */
import { planExitTiming, appendNote, EXIT_TIME_TAG_RE, type TimedBar } from '@shared/exit-hit-time';
import { PerformanceValidator } from '../performance-validator';
import { toExitTimingIdea } from './exit-time-bars';

export const DEFAULT_REPAIR_SINCE = '2026-09-30T12:40:00Z';
const SAME_STAMP_MS = 120_000;

export interface RepairRow {
  id: string; symbol: string; assetType: string | null; direction: string; source?: string | null;
  entryPrice: number; targetPrice: number; stopLoss: number; timestamp: string;
  outcomeStatus: string | null; resolutionReason: string | null;
  exitDate: string | null; exitPrice: number | null; percentGain: number | null;
  predictionValidatedAt: string | null; outcomeNotes: string | null;
  exitBy?: string | null; expiryDate?: string | null; entryValidUntil?: string | null;
  convergenceSignalsJson?: unknown;
}

export interface RepairPlan {
  id: string; symbol: string; outcome: string; oldExitDate: string | null;
  action: 'update' | 'unchanged' | 'skip';
  reason: string;
  source?: string;
  set?: { exitDate: string; exitPrice?: number; percentGain?: number; actualHoldingTimeMinutes: number; outcomeNotes: string };
}

export type BarSupplier = (row: RepairRow, entryMs: number) => Promise<{ bars: TimedBar[]; interval: string | null }>;

/** The deadline the validator used for an expired row, replaying its branch order. */
export function deadlineOf(row: RepairRow, resolvedMs: number): number | null {
  const created = new Date(row.timestamp);
  const reason = String(row.resolutionReason ?? '');
  if (reason.startsWith('missed_entry')) {
    const d = row.entryValidUntil ? PerformanceValidator.parseExitByDate(row.entryValidUntil, created) : null;
    return d && d.getTime() <= resolvedMs ? d.getTime() : null;
  }
  if (reason !== 'auto_expired') return null; // time stops were decided on the live quote
  if (row.assetType === 'future') return null;
  if (row.assetType === 'option' && row.expiryDate) {
    const t = new Date(row.expiryDate).getTime();
    if (Number.isFinite(t) && t <= resolvedMs) return t;
  }
  if (row.exitBy) {
    const d = PerformanceValidator.parseExitByDate(row.exitBy, created);
    if (d && d.getTime() <= resolvedMs) return d.getTime();
  }
  const seven = created.getTime() + 7 * 86_400_000;
  return seven <= resolvedMs ? seven : null;
}

export async function planRepairs(
  rows: RepairRow[], getBars: BarSupplier, opts: { since?: string } = {},
): Promise<RepairPlan[]> {
  const sinceMs = Date.parse(opts.since ?? DEFAULT_REPAIR_SINCE);
  const out: RepairPlan[] = [];
  for (const row of rows) {
    const base = { id: row.id, symbol: row.symbol, outcome: String(row.outcomeStatus), oldExitDate: row.exitDate };
    const exitMs = row.exitDate ? Date.parse(row.exitDate) : NaN;
    if (!['hit_target', 'hit_stop', 'expired'].includes(String(row.outcomeStatus))) continue;
    if (!Number.isFinite(exitMs) || exitMs < sinceMs) continue;
    if (String(row.source) === 'crypto_engine') { out.push({ ...base, action: 'skip', reason: 'crypto_engine rows are stamped by their own bar tracker' }); continue; }
    if (EXIT_TIME_TAG_RE.test(row.outcomeNotes ?? '')) { out.push({ ...base, action: 'skip', reason: 'already carries an exit-time tag' }); continue; }
    const validatedMs = row.predictionValidatedAt ? Date.parse(row.predictionValidatedAt) : NaN;
    if (!Number.isFinite(validatedMs)) { out.push({ ...base, action: 'skip', reason: 'no predictionValidatedAt — cannot tell whether exitDate is the sweep time' }); continue; }
    if (Math.abs(exitMs - validatedMs) > SAME_STAMP_MS) { out.push({ ...base, action: 'skip', reason: 'exitDate differs from resolution time — not a sweep stamp' }); continue; }

    const tIdea = toExitTimingIdea(row as any);
    const barrier = row.outcomeStatus === 'hit_target' || row.outcomeStatus === 'hit_stop';
    const deadlineMs = barrier ? null : deadlineOf(row, validatedMs);
    if (!barrier && deadlineMs == null) {
      out.push({ ...base, action: 'unchanged', reason: row.resolutionReason === 'auto_time_stop' ? 'time stop decided on the live quote' : 'no determinable deadline' });
      continue;
    }
    const missed = String(row.resolutionReason ?? '').startsWith('missed_entry');
    const { bars, interval } = missed ? { bars: [], interval: null } : await getBars(row, tIdea.entryMs);
    const plan = planExitTiming(
      tIdea,
      { outcomeStatus: String(row.outcomeStatus), resolutionReason: row.resolutionReason, exitPrice: row.exitPrice, deadlineMs },
      bars, validatedMs, { barInterval: interval ?? undefined },
    );
    if (plan.source === 'live' || plan.unresolved) {
      out.push({ ...base, action: 'unchanged', reason: plan.unresolved ?? 'no bar evidence', source: plan.source });
      continue;
    }
    const optNote = row.assetType === 'option' ? ' · contract exit premium unchanged (quoted at the sweep)' : '';
    out.push({
      ...base, action: 'update', source: plan.source, reason: plan.note,
      set: {
        exitDate: plan.exitDate,
        ...(plan.exitPrice != null ? { exitPrice: plan.exitPrice, percentGain: Math.round(plan.percentGain! * 100) / 100 } : {}),
        actualHoldingTimeMinutes: plan.holdingMinutes,
        outcomeNotes: appendNote(row.outcomeNotes, `${plan.note} (repaired from sweep stamp ${row.exitDate})${optNote}`),
      },
    });
  }
  return out;
}

export function formatRepairTable(plans: RepairPlan[]): string {
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  const lines = [
    `${pad('id', 10)} ${pad('symbol', 8)} ${pad('outcome', 10)} ${pad('action', 9)} ${pad('old exitDate', 26)} ${pad('new exitDate', 26)} ${pad('src', 8)} reason`,
  ];
  for (const p of plans) {
    lines.push(`${pad(p.id, 10)} ${pad(p.symbol, 8)} ${pad(p.outcome, 10)} ${pad(p.action, 9)} ${pad(p.oldExitDate ?? '—', 26)} ${pad(p.set?.exitDate ?? '—', 26)} ${pad(p.source ?? '', 8)} ${p.set?.exitPrice != null ? `px→${p.set.exitPrice} ` : ''}${p.reason}`);
  }
  const c = (a: string) => plans.filter((p) => p.action === a).length;
  lines.push('', `candidates ${plans.length}: update ${c('update')} · unchanged ${c('unchanged')} · skip ${c('skip')}`);
  return lines.join('\n');
}
