/**
 * CATALYST tools — the Catalyst page (components/catalyst/catalyst-nexus.tsx)
 * split into dashboard tools.
 *
 * Each tool renders ONE section of CatalystNexus via its `only` prop, so the
 * joins, filters, labels and workup clicks are the page's own code. The tools
 * observe the same three react-query keys the page does (useCatalystBoard /
 * useCatalystEarnings / useCatalystEcon), so five catalyst tools on screen
 * cost one request per feed. This file only adds the frame's age report and
 * the loading / error gates.
 */
import type { ReactNode } from 'react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import {
  CatalystNexus, useCatalystBoard, useCatalystEarnings, useCatalystEcon, type CatalystSection,
} from '@/components/catalyst/catalyst-nexus';
import { useToolReport } from '../../frame';
import './catalyst-tools.css';

type Q = { isLoading: boolean; isError: boolean; isFetching: boolean; data?: unknown; refetch: () => unknown };

/** loading / error gate — a failed feed is an error, never an empty board */
function gate(q: Q, what: string): ReactNode | null {
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" label={`loading ${what}…`} />;
  if (q.isError && !q.data) return <QEError className="fd-m" title={`${what} didn't load`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  return null;
}

const Section = ({ only }: { only?: CatalystSection }) => (
  <div className="fd-fill fd-legacy cat-tool"><CatalystNexus only={only} /></div>
);

/* The board's age = when the server joined the calendar to the live picks. */
function useBoardReport() {
  const q = useCatalystBoard();
  const b = q.data as (NonNullable<typeof q.data> & { warming?: boolean }) | undefined;
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? (b?.generatedAt ?? null) : undefined,
    note: q.isError ? 'refresh failed' : b?.warming ? 'signals warming — board empty until NEXUS builds' : b ? `${b.signalsScanned ?? 0} live signals joined` : undefined,
    tone: q.isError || b?.warming ? 'warn' : 'ok',
  });
  return q;
}

/* ════════════ Signal impact — calendar × active book ════════════ */
export function CatalystImpactTool() {
  const q = useBoardReport();
  return gate(q, 'catalyst board') ?? <Section only="impact" />;
}

/* ════════════ Earnings calendar — 7 days ════════════ */
export function CatalystEarningsTool() {
  const q = useCatalystEarnings();
  useCatalystBoard(); // book rings on chips come from the board (same key, no extra request)
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? (q.data.asOf ?? null) : undefined,
    note: q.isError ? 'refresh failed' : q.data ? `${q.data.count ?? 0} reports` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  const g = gate(q, 'earnings calendar');
  if (g) return g;
  if (!(q.data?.events?.length)) return <QEEmpty className="fd-m" message="No earnings reports in the next 7 days." />;
  return <Section only="earnings" />;
}

/* ════════════ Economic calendar — macro releases ════════════ */
export function CatalystEconTool() {
  const q = useCatalystEcon();
  const cov = q.data?.coverage;
  // A release schedule has no "newest datum"; the age is when the schedule was read.
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? new Date(q.dataUpdatedAt).toISOString() : undefined,
    source: cov?.source ? `economic calendar · ${cov.source.toUpperCase()}` : undefined,
    note: q.isError ? 'refresh failed' : q.data ? (cov?.current ? 'schedule read' : 'calendar stale — dates may be missing') : undefined,
    tone: q.isError || (q.data && !cov?.current) ? 'warn' : 'ok',
  });
  const g = gate(q, 'economic calendar');
  if (g) return g;
  if (!(q.data?.upcoming?.length)) return <QEEmpty className="fd-m" message={cov?.current === false ? 'The macro calendar is stale, so no release dates are shown rather than guessed ones.' : 'No macro releases in the calendar window.'} />;
  return <Section only="econ" />;
}

/* ════════════ Summary · coverage · feed status ════════════ */
export function CatalystSummaryTool() {
  const q = useBoardReport();
  useCatalystEarnings(); useCatalystEcon(); // status rows read these (shared keys)
  return gate(q, 'catalyst board') ?? <Section only="summary" />;
}

/* ════════════ Distance to event ════════════ */
export function CatalystDistanceTool() {
  const q = useBoardReport();
  return gate(q, 'catalyst board') ?? <Section only="distance" />;
}

/* ════════════ Catalyst (classic, all-in-one) ════════════ */
export function CatalystClassicTool() {
  useBoardReport();
  return <Section />;
}
