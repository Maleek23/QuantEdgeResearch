/**
 * Admin hub › Overview — who is using the platform and whether it is healthy.
 * Every figure is read from an endpoint and printed with its basis; nothing is
 * a placeholder (the old page showed a $0.00 "Revenue", a "0 tables" DB card
 * and an always-empty "System Status" list — fields no endpoint returned).
 */
import { Link } from 'wouter';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxKpi, LuxKpiGrid, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { fmtAgo, fmtUptime, useAdminJson, STATE_LABEL, STATE_TONE, type HealthResponse } from '@/components/admin/hub-data';

interface Stats { totalUsers: number; premiumUsers: number; totalIdeas: number; activeIdeas: number; closedIdeas: number; expiredIdeas: number; wins: number; losses: number; winRate: number }
interface Invite { id: string; email: string; status: string }
interface Activity { id: string; type: string; description: string; timestamp: string }
interface Analytics { totalUsers: number; activeUsers24h: number; totalPageViews24h: number; topPages: { path: string; count: number }[] }

export default function AdminOverview() {
  const stats = useAdminJson<Stats>('/api/admin/stats', 120_000);
  const health = useAdminJson<HealthResponse>('/api/health', 30_000);
  const waitlist = useAdminJson<{ entries: { status: string }[]; count: number }>('/api/admin/waitlist');
  const invites = useAdminJson<{ invites: Invite[] }>('/api/admin/invites');
  const activity = useAdminJson<Activity[]>('/api/admin/activity', 60_000);
  const analytics = useAdminJson<Analytics>('/api/admin/analytics', 60_000);

  const inv = invites.data?.invites ?? [];
  const by = (s: string) => inv.filter((i) => i.status === s).length;
  const pendingWait = (waitlist.data?.entries ?? []).filter((e) => e.status === 'pending').length;
  const h = health.data;
  const s = stats.data;

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4">
        {h && (
          <LuxPanel title="Platform" meta={<LuxTag tone={h.status === 'ok' ? 'accent' : 'caution'}>{h.status === 'ok' ? 'HEALTHY' : 'DEGRADED'}</LuxTag>}
            sub={<>Release {h.release} · up {fmtUptime(h.uptimeSec)} · {h.memMb} MB RSS · checked {fmtAgo(h.timestamp)}. <Link href="/admin/system" className="ah-link">System health →</Link></>}>
            <div className="flex flex-wrap gap-2">
              {h.dataProviders.map((p) => <LuxTag key={p.id} tone={STATE_TONE[p.state]}>{p.label} · {STATE_LABEL[p.state]}</LuxTag>)}
              <LuxTag tone={h.checks.postgres?.ok ? 'accent' : 'caution'}>Postgres · {h.checks.postgres?.ok ? `${h.checks.postgres.latencyMs ?? '?'} ms` : 'DOWN'}</LuxTag>
            </div>
          </LuxPanel>
        )}
        {health.isError && <QEError title="Health check unreachable" message="/api/health did not answer." onRetry={() => void health.refetch()} />}

        <LuxKpiGrid cols={4}>
          <LuxKpi label="Users" value={s?.totalUsers ?? '—'} sub={s ? `${s.premiumUsers} on a paid or admin tier` : 'loading'} />
          <LuxKpi label="Active 24h" value={analytics.data?.activeUsers24h ?? '—'} sub={analytics.data ? `${analytics.data.totalPageViews24h} page views` : 'loading'} />
          <LuxKpi label="Waitlist" value={waitlist.data?.count ?? '—'} sub={waitlist.data ? `${pendingWait} pending review` : 'loading'} />
          <LuxKpi label="Invites" value={inv.length || (invites.isLoading ? '—' : 0)} sub={`${by('redeemed')} redeemed · ${by('sent')} sent · ${by('pending')} unsent`} />
        </LuxKpiGrid>

        <div className="ah-grid">
          <LuxPanel title="Idea record (all engines)" sub="From /api/admin/stats — canonical filters; win rate = wins ÷ (wins + real losses).">
            {s ? (
              <div className="ah-list">
                <div className="ah-li"><b>Ideas stored</b><span className="ah-kv">{s.totalIdeas.toLocaleString()}</span></div>
                <div className="ah-li"><b>Open now</b><span className="ah-kv">{s.activeIdeas.toLocaleString()}</span></div>
                <div className="ah-li"><b>Decided</b><span className="ah-kv">{s.closedIdeas.toLocaleString()} ({s.wins}W / {s.losses}L)</span></div>
                <div className="ah-li"><b>Win rate</b><span className="ah-kv">{s.closedIdeas ? `${s.winRate}% · n=${s.closedIdeas}` : '— (no decided ideas)'}</span></div>
              </div>
            ) : stats.isError ? <p className="ah-note">Stats unavailable.</p> : <p className="ah-note">Loading…</p>}
            <p className="ah-note">The honest model record lives in JOURNAL › Track record and the SR 11-7 report; this is a raw count.</p>
          </LuxPanel>

          <LuxPanel title="Recent activity" sub="Newest ideas and sign-ups.">
            <div className="ah-list">
              {(activity.data ?? []).slice(0, 10).map((a) => (
                <div key={`${a.type}-${a.id}`} className="ah-li"><b style={{ fontWeight: 500 }}>{a.description}</b><span className="ah-kv">{fmtAgo(a.timestamp)}</span></div>
              ))}
              {activity.isError && <p className="ah-note">Activity unavailable.</p>}
              {activity.data && !activity.data.length && <p className="ah-note">Nothing yet.</p>}
            </div>
          </LuxPanel>
        </div>

        {analytics.data?.topPages?.length ? (
          <LuxPanel title="Top pages (24h)" sub="Page views recorded by the analytics tracker.">
            <div className="ah-scroll">
              <table className="ah-table"><thead><tr><th>Path</th><th>Views</th></tr></thead>
                <tbody>{analytics.data.topPages.slice(0, 10).map((p) => <tr key={p.path}><td>{p.path}</td><td>{p.count}</td></tr>)}</tbody>
              </table>
            </div>
          </LuxPanel>
        ) : null}
      </div>
    </AdminLayout>
  );
}
