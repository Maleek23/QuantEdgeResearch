/**
 * Trade timeline for one NEXUS idea — GET /api/ideas/:id/timeline
 * (server/idea-timeline.ts → shared/idea-timeline.ts).
 *
 * Only recorded events carry a time and price; the rest say why they have none
 * (pending / not reached / not recorded / n/a). Times are America/New_York.
 */
import { useQuery } from '@tanstack/react-query';
import type { IdeaTimeline, TimelineEvent, TimelineStatus } from '@shared/idea-timeline';
import './setup-tools.css';

export function useIdeaTimeline(ideaId: string | null | undefined) {
  return useQuery<IdeaTimeline>({
    queryKey: ['/api/ideas', ideaId, 'timeline'],
    enabled: !!ideaId,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: (n, e) => !String((e as Error)?.message).startsWith('404') && n < 2,
    queryFn: async () => {
      const r = await fetch(`/api/ideas/${encodeURIComponent(String(ideaId))}/timeline`, { credentials: 'include' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(`${r.status} ${body?.error ?? 'timeline unavailable'}`);
      }
      return r.json();
    },
  });
}

const STATUS_TEXT: Record<TimelineStatus, string> = {
  recorded: 'recorded',
  pending: 'pending',
  not_reached: 'not reached',
  not_recorded: 'not recorded',
  not_applicable: 'n/a',
};
const money = (v: number | null) => (v == null ? null : `$${v >= 100 ? v.toFixed(2) : v.toFixed(v >= 1 ? 2 : 3)}`);

function EventRow({ e, isOption }: { e: TimelineEvent; isOption: boolean }) {
  const price = money(e.price);
  const level = money(e.level);
  const premium = money(e.premium);
  return (
    <li className={`nxp-tl-item ${e.status}`} data-kind={e.kind}>
      <span className="nxp-tl-dot" aria-hidden="true" />
      <div className="nxp-tl-body">
        <div className="nxp-tl-line">
          <strong>{e.label}</strong>
          <span className={`nxp-tl-status ${e.status}`}>{STATUS_TEXT[e.status]}</span>
        </div>
        <div className="nxp-tl-data">
          {e.atEt && <time dateTime={e.at ?? undefined}>{e.atEt}</time>}
          {price && <span>{isOption ? 'underlying ' : ''}{price}</span>}
          {!price && level && <span>level {level}</span>}
          {isOption && premium && <span>premium {premium}</span>}
        </div>
        {e.note && <small className="nxp-tl-note">{e.note}</small>}
        <small className="nxp-tl-src">source: {e.source}</small>
      </div>
    </li>
  );
}

export function SetupTimeline({ ideaId }: { ideaId: string }) {
  const q = useIdeaTimeline(ideaId);
  if (q.isLoading) return <div className="nxp-tl nxp-tl-state" role="status">Loading the idea's recorded events…</div>;
  if (q.isError || !q.data) {
    const msg = String((q.error as Error)?.message ?? '');
    return (
      <div className="nxp-tl nxp-tl-state" role="status">
        Timeline unavailable — {msg.startsWith('404') ? 'no stored idea row for this id (held position or display-only mirror)' : msg || 'the request failed'}.
      </div>
    );
  }
  const t = q.data;
  return (
    <section className="nxp-tl" aria-label={`${t.symbol} trade timeline`}>
      <div className="nxp-tl-head">
        <span>Trade timeline</span>
        <small>times ET · as of {new Date(t.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}</small>
      </div>
      <ol className="nxp-tl-list">
        {t.events.map((e) => <EventRow key={e.kind} e={e} isOption={t.isOption} />)}
      </ol>
      {t.notes.length > 0 && <ul className="nxp-tl-notes">{t.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </section>
  );
}
