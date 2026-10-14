/**
 * 0DTE desk "Details" — the NEXUS Setup Detail (nexus-parts.tsx SetupDetail),
 * reused as-is in a sheet, resolved BY IDEA ID (components/ideas/idea-detail-by-id.tsx):
 * the live board pick when it is there, else the stored idea with its status
 * chip, premium outcome and "as of" stamps. Never a dead end — the desk files
 * index ideas published on SPY under its "SPX" row, so the symbol is only a
 * label here, never the lookup key (operator bug 2026-10-14, SPY 770P).
 * Lazy-loaded by zero-dte-desk.tsx so the desk does not pull the chart bundle
 * until a Details button is pressed.
 */
import { Link } from 'wouter';
import { QEDrawer } from '@/components/ui/qe-drawer';
import { usePhone } from '@/components/ui/qe-phone';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { IdeaDetailById, ideaDetailHref } from '@/components/ideas/idea-detail-by-id';
import '@/styles/nexus-prototype.css';
import '@/components/dashboard/dashboard.css';
import '@/components/dashboard/tools/nexus/nexus-tools.css';

export default function ZdSetupDetail({ ideaId, title, onClose }: { ideaId: string; symbol?: string; title: string; onClose: () => void }) {
  const phone = usePhone();
  return (
    <QEDrawer open onClose={onClose} title={title} subtitle="Setup detail — same view as NEXUS" side={phone ? 'bottom' : 'right'} size="lg" className="zd-detail-sheet">
      <div className="flowdash zd-detail-host">
        <div className="nxd nxd-detail">
          <IdeaDetailById ideaId={ideaId} />
          <p className="idb-foot">
            <Link href={nexusIdeaHref({ ideaId })} onClick={onClose}>Open on NEXUS</Link>
            {' · '}
            <Link href={ideaDetailHref(ideaId)} onClick={onClose}>Full page</Link>
            {' · '}
            <Link href="/t?tab=journal&journal=desk&j0dte=1" onClick={onClose}>0DTE journal</Link>
          </p>
        </div>
      </div>
    </QEDrawer>
  );
}
