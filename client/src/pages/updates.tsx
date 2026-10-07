/**
 * /updates — public changelog: what shipped and what's being built, with dates.
 * Source: the admin roadmap (/admin/roadmap → /api/updates, shipped + in progress only).
 * Opening it clears the "What's new" badge on this device (lib/updates.ts).
 */
import { LuxPage, LuxPageHeader, LuxTag, LuxFootnote, type LuxTone } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { STATUS_LABEL } from '@shared/roadmap';
import { useMarkUpdatesSeen, useUpdates, type PublicUpdate } from '@/lib/updates';
import '@/styles/onboarding.css';

const fmtDate = (d: string | null) => {
  if (!d) return '';
  const t = new Date(`${d}T12:00:00`);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : d;
};
const AUDIENCE: Record<string, string> = { beginner: 'For beginners', pro: 'For pros', all: '' };

function Row({ u }: { u: PublicUpdate }) {
  const tone: LuxTone = u.status === 'shipped' ? 'accent' : 'caution';
  return (
    <article className="ob-upd" data-testid={`update-${u.id}`}>
      <div className="ob-upd-top">
        <LuxTag tone={tone}>{STATUS_LABEL[u.status].toUpperCase()}</LuxTag>
        <LuxTag tone="mute">{u.area}</LuxTag>
        {u.targetDate && <time dateTime={u.targetDate}>{u.status === 'shipped' ? fmtDate(u.targetDate) : `Target ${fmtDate(u.targetDate)}`}</time>}
        {AUDIENCE[u.audience] && <span>· {AUDIENCE[u.audience]}</span>}
      </div>
      <h3>{u.title}</h3>
      {u.description && <p>{u.description}</p>}
    </article>
  );
}

export default function UpdatesPage() {
  const q = useUpdates();
  const items = q.data?.items;
  useMarkUpdatesSeen(items);
  const building = (items ?? []).filter((i) => i.status === 'in_progress');
  const shipped = (items ?? []).filter((i) => i.status === 'shipped');

  return (
    <LuxPage width="narrow" className="ob">
      <LuxPageHeader section="Updates" title="What’s new" purpose="Everything we’ve shipped, newest first, and what we’re building now." />
      {q.isError && <QEError title="Updates didn’t load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
      {q.isLoading && <p className="ob-step-sub">Loading…</p>}
      {items && !items.length && <p className="ob-step-sub">Nothing to show yet.</p>}
      {building.length > 0 && (<>
        <h2 className="ob-upd-group">In progress</h2>
        <div className="ob-updates">{building.map((u) => <Row key={u.id} u={u} />)}</div>
      </>)}
      {shipped.length > 0 && (<>
        <h2 className="ob-upd-group">Shipped</h2>
        <div className="ob-updates">{shipped.map((u) => <Row key={u.id} u={u} />)}</div>
      </>)}
      <LuxFootnote>“In progress” items may change or be dropped. QuantEdge is for education and research — not investment advice.</LuxFootnote>
    </LuxPage>
  );
}
