/**
 * /idea/:id — the NEXUS Setup Detail for one idea, standalone. Works for any
 * idea id (open, resolved, expired, past day) — the link Discord cards, the
 * journal, the 0DTE desk and Ask Quantinum can always use
 * (components/ideas/idea-detail-by-id.tsx).
 */
import { Link, useParams } from 'wouter';
import { IdeaDetailById } from '@/components/ideas/idea-detail-by-id';
import { nexusIdeaHref } from '@/lib/nexus-link';
import '@/styles/nexus-prototype.css';
import '@/components/dashboard/dashboard.css';
import '@/components/dashboard/tools/nexus/nexus-tools.css';

export default function IdeaDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const ideaId = decodeURIComponent(id);
  return (
    <main className="idb-page flowdash">
      <div className="idb-page-head">
        <h1 style={{ fontSize: 16, margin: 0 }}>Setup detail</h1>
        <span>
          <Link href={nexusIdeaHref({ ideaId })}>Open on NEXUS</Link>
          {' · '}
          <Link href="/t?tab=journal">Journal</Link>
        </span>
      </div>
      <div className="nxd nxd-detail">
        <IdeaDetailById ideaId={ideaId} />
      </div>
    </main>
  );
}
