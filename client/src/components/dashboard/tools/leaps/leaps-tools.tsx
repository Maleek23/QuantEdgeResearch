/**
 * LEAPS tools — the LEAPS page (components/hunt/leaps-nexus.tsx) split into
 * dashboard tools.
 *
 * Each tool renders ONE section of LeapsNexus via its `only` prop, so cards,
 * grades, budget maths, ⌘K search and clicks are the page's own code. All
 * tools observe the same /api/leap-tracker query (useLeapTracker), and the
 * budget / min-grade filters live in per-page dashboard state so the card
 * list and the grade distribution's "N shown" agree across tiles.
 */
import type { ReactNode } from 'react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { LeapsNexus, useLeapTracker, type LeapsSection } from '@/components/hunt/leaps-nexus';
import { useDashState, useToolReport } from '../../frame';
import './leaps-tools.css';

function useLeaps() {
  const q = useLeapTracker();
  const d = q.data;
  useToolReport({
    asOf: q.isError && !d ? null : d ? (d.asOf ?? null) : undefined,
    note: q.isError ? 'refresh failed' : d?.isStale ? `stale · ${d.sessionLabel ?? 'last session'}` : d ? `${d.qualified ?? 0}/${d.scanned ?? 0} liquid${d.sessionLabel ? ` · ${d.sessionLabel}` : ''}` : undefined,
    tone: q.isError || d?.isStale ? 'warn' : 'ok',
  });
  return q;
}

function gate(q: ReturnType<typeof useLeapTracker>): ReactNode | null {
  if (q.isLoading) return <QELoading rows={5} className="fd-pad" label="scanning leap chains…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="LEAPS tracker didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data?.picks?.length) return <QEEmpty className="fd-m" message="No liquid LEAPS contracts qualified in the last scan. Try a wider budget or a lower grade." />;
  return null;
}

/** shared filters: one budget / min grade for every LEAPS tile on the page */
function Section({ only }: { only?: LeapsSection }) {
  const [budget, setBudget] = useDashState<number>('leaps:budget', 1000);
  const [minGrade, setMinGrade] = useDashState<string | null>('leaps:minGrade', null);
  return (
    <div className="fd-fill fd-legacy leaps-tool">
      <LeapsNexus only={only} budget={budget} onBudget={setBudget} minGrade={minGrade} onMinGrade={setMinGrade} />
    </div>
  );
}

/* ════════════ Ranked LEAPS cards · budget / grade filters · ⌘K ════════════ */
export function LeapsListTool() {
  const q = useLeaps();
  return gate(q) ?? <Section only="list" />;
}

/* ════════════ Summary — liquid count, top grade, averages ════════════ */
export function LeapsSummaryTool() {
  const q = useLeaps();
  return gate(q) ?? <Section only="summary" />;
}

/* ════════════ Grade distribution · how graded ════════════ */
export function LeapsGradesTool() {
  const q = useLeaps();
  return gate(q) ?? <Section only="grades" />;
}

/* ════════════ LEAPS (classic, all-in-one) ════════════ */
export function LeapsClassicTool() {
  useLeaps();
  return <Section />;
}
