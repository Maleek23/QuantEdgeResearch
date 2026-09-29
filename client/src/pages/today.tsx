/**
 * TODAY — the signed-in home, now a dashboard (2026-09-29).
 *
 * The 2026-09-24 prototype (one job per band: the week's dealer map + model
 * path, the single best idea, the ranked book, the index desk, rotation and
 * the honest record) is split into TODAY tools — defs/today.ts,
 * components/dashboard/tools/today/. The default layout keeps the reading
 * order: the week dealer map is the hero, the best idea beside it.
 *
 * Integrity is unchanged: only MEASURED dealer levels are drawn; the weekly
 * path is a model projection labelled "not a forecast"; every tool stamps the
 * age of the newest datum it shows.
 *
 * Rendered inside NexusFrame: 44px topbar + 26px desktop bottombar = 70px of
 * chrome around <main> (nexus-frame.tsx), which the dashboard subtracts to
 * fit the viewport.
 */
import { lazy, Suspense } from 'react';
import { Link } from 'wouter';
import { RouteFallback } from '@/components/ui/qe-loading';
import { skeletonTiles } from '@/components/dashboard/pages';
import '@/styles/nexus.css';
import '@/styles/today.css';

const Dashboard = lazy(() => import('@/components/dashboard/dashboard').then((m) => ({ default: m.Dashboard })));

/**
 * PROVE before you ACT: an idea's own audit trail (entry evidence, snapshots,
 * outcome). Used by the Best idea tool; kept here so the page that owns the
 * "check an idea's evidence" workflow (W4) carries the link.
 */
export function AuditTrailLink({ ideaId, className }: { ideaId: string; className?: string }) {
  return <Link href={`/trade-ideas/${encodeURIComponent(ideaId)}/audit`} className={className}>Audit trail</Link>;
}

export default function TodayPage() {
  return (
    <Suspense fallback={<RouteFallback tiles={skeletonTiles('today')} />}>
      <Dashboard page="today" chrome={70} />
    </Suspense>
  );
}
