/**
 * Admin hub › Overview — who is using the platform and whether it is healthy.
 * Every figure is read from an endpoint and printed with its basis; nothing is
 * a placeholder.
 *
 *   /api/admin/ops/overview   users by tier, beta access, signups 7/30d, sessions,
 *                             waitlist, invite codes, job last-runs, web/worker memory
 *   /api/health               release, providers, Postgres
 *   /api/quant-bot/status     the bot's last cycle (when this process ran it)
 *   /api/admin/ops/audit      the newest operator actions
 *   /api/admin/stats          the raw idea record
 */
import { Link } from 'wouter';
import { AdminLayout } from '@/components/admin/admin-layout';
import { TraderAccountsPanel } from '@/components/admin/trader-accounts-panel';
import { LuxKpi, LuxKpiGrid, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import {
  AUDIT_LABEL, fmtAgo, fmtUptime, useAdminJson, STATE_LABEL, STATE_TONE, type AdminAuditRow, type HealthResponse,
} from '@/components/admin/hub-data';

interface Overview {
  users: { total: number; byTier: Record<string, number>; betaAccess: number; disabled: number; signups7d: number; signups30d: number; seen24h: number; seen7d: number };
  sessions: { active: number; users: number } | null;
  waitlist: { total: number; byStatus: Record<string, number> };
  invites: { issued: number; unused: number; used: number; expired: number; revoked: number };
  jobs: { id: string; label: string; cadence: string; asOf: string | null; ageSec: number | null; stale: boolean }[];
  web: { rssMb: number; heapUsedMb: number; uptimeSec: number };
  worker: { pid: number | null; rssMb: number | null; peakRssMb: number | null; heapUsedMb: number | null; uptimeSec: number | null; asOf: string; ageSec: number } | null;
  at: string;
}
interface Stats { totalIdeas: number; activeIdeas: number; closedIdeas: number; wins: number; losses: number; winRate: number }
interface BotStatus { lastCycle: { at: string; origin: string; opened: number; closed: number; skipped: number; openCount: number; error?: string } | null; repricedAt: string | null }

export default function AdminOverview() {
  const ov = useAdminJson<Overview>('/api/admin/ops/overview', 60_000);
  const health = useAdminJson<HealthResponse>('/api/health', 30_000);
  const bot = useAdminJson<BotStatus>('/api/quant-bot/status', 120_000);
  const audit = useAdminJson<{ entries: AdminAuditRow[] }>('/api/admin/ops/audit?limit=6', 60_000);
  const stats = useAdminJson<Stats>('/api/admin/stats', 120_000);
  const o = ov.data;
  const h = health.data;
  const s = stats.data;
  // One coherent failure state (audit 2026-10-07 #18): no "loading" forever after a failure,
  // and HEALTHY only when the check answered AND every feed + Postgres is up.
  const pend = ov.isError ? 'unavailable' : 'loading';
  const allUp = !!h && h.status === 'ok' && !health.isError && (h.dataProviders ?? []).every((p) => p.state === 'ok') && h.checks?.postgres?.ok !== false;
  const platformTag = health.isError ? { tone: 'caution' as const, text: 'NO ANSWER' } : !h ? null : allUp ? { tone: 'accent' as const, text: 'HEALTHY' } : { tone: 'caution' as const, text: 'DEGRADED' };

  return (
    <AdminLayout>
      <div className="ah-stack">
        {ov.isError && <QEError title="The overview didn't load" message="Counts below are unavailable until it answers. (ops/overview — the server may be on an older build.)" onRetry={() => void ov.refetch()} />}

        {/* Operator 2026-10-07: trader accounts first, right after the admin code. */}
        <TraderAccountsPanel />

        <LuxKpiGrid cols={4}>
          <LuxKpi label="Users" value={o?.users.total ?? '—'}
            sub={o ? `Free ${o.users.byTier.free ?? 0} · Adv ${o.users.byTier.advanced ?? 0} · Pro ${o.users.byTier.pro ?? 0} · Admin ${o.users.byTier.admin ?? 0}` : pend} />
          <LuxKpi label="Beta access" value={o?.users.betaAccess ?? '—'} sub={o ? `${o.users.disabled} disabled account${o.users.disabled === 1 ? '' : 's'}` : pend} />
          <LuxKpi label="Sign-ups" value={o ? `${o.users.signups7d} / ${o.users.signups30d}` : '—'} sub="last 7 / 30 days (account created)" />
          <LuxKpi label="Seen" value={o ? `${o.users.seen24h} / ${o.users.seen7d}` : '—'}
            sub={o ? `signed in last 24h / 7d · ${o.sessions ? `${o.sessions.active} live sessions (${o.sessions.users} users)` : 'sessions not readable'}` : pend} />
        </LuxKpiGrid>

        <LuxKpiGrid cols={4}>
          <LuxKpi label="Waitlist" value={o?.waitlist.total ?? '—'}
            sub={o ? `${o.waitlist.byStatus.pending ?? 0} pending · ${o.waitlist.byStatus.approved ?? 0} approved · ${o.waitlist.byStatus.joined ?? 0} joined` : pend} />
          <LuxKpi label="Invite codes issued" value={o?.invites.issued ?? '—'} sub={o ? `${o.invites.unused} unused` : pend} />
          <LuxKpi label="Redeemed" value={o?.invites.used ?? '—'} sub={o && o.invites.issued ? `${Math.round((o.invites.used / o.invites.issued) * 100)}% of issued` : '—'} />
          <LuxKpi label="Expired / revoked" value={o ? `${o.invites.expired} / ${o.invites.revoked}` : '—'} sub={<Link href="/admin/invites" className="ah-link">Invite codes →</Link>} />
        </LuxKpiGrid>

        <div className="ah-grid">
          <LuxPanel title="Platform" meta={platformTag ? <LuxTag tone={platformTag.tone}>{platformTag.text}</LuxTag> : undefined}
            sub={<>From <a className="ah-link" href="/api/health" target="_blank" rel="noreferrer">/api/health</a>{h ? ` · release ${h.release} · checked ${fmtAgo(h.timestamp)}` : ''}. <Link href="/admin/system" className="ah-link">System health →</Link></>}>
            {health.isError && <p className="ah-note">The health check didn't answer.</p>}
            {h && (
              <div className="flex flex-wrap gap-2">
                {h.dataProviders.map((p) => <LuxTag key={p.id} tone={STATE_TONE[p.state]}>{p.label} · {STATE_LABEL[p.state]}</LuxTag>)}
                <LuxTag tone={h.checks.postgres?.ok ? 'accent' : 'caution'}>Postgres · {h.checks.postgres?.ok ? `${h.checks.postgres.latencyMs ?? '?'} ms` : 'DOWN'}</LuxTag>
              </div>
            )}
            <div className="ah-list" style={{ marginTop: 8 }}>
              <div className="ah-li"><b>Web process</b><span className="ah-kv">{o ? `${o.web.rssMb} MB RSS · heap ${o.web.heapUsedMb} MB · up ${fmtUptime(o.web.uptimeSec)}` : '—'}</span></div>
              <div className="ah-li"><b>Worker process</b><span className="ah-kv">{o?.worker
                ? `${o.worker.rssMb ?? '?'} MB RSS (peak ${o.worker.peakRssMb ?? '?'}) · up ${fmtUptime(o.worker.uptimeSec)} · heartbeat ${fmtAgo(o.worker.asOf)}`
                : o ? 'no heartbeat file — single-process mode or worker down' : '—'}</span></div>
            </div>
          </LuxPanel>

          <LuxPanel title="Job last runs" sub="When each worker job last wrote its state (.cache/shared). Jobs only run in their market windows, so outside them an old time is expected.">
            <div className="ah-list">
              {(o?.jobs ?? []).map((j) => (
                <div key={j.id} className="ah-li">
                  <b>{j.label}</b>
                  <span className="ah-kv">{j.asOf ? fmtAgo(j.asOf) : 'never'} {j.asOf && <LuxTag tone={j.stale ? 'caution' : 'accent'}>{j.stale ? 'OLD' : 'FRESH'}</LuxTag>}</span>
                  <small>{j.cadence}{j.asOf ? ` · ${new Date(j.asOf).toLocaleString()}` : ''}</small>
                </div>
              ))}
              <div className="ah-li">
                <b>Quantinum Bot cycle</b>
                <span className="ah-kv">{bot.data?.lastCycle ? fmtAgo(bot.data.lastCycle.at) : bot.isError ? 'status unavailable' : bot.data ? 'not seen by this process' : '—'}</span>
                <small>{bot.data?.lastCycle
                  ? `${bot.data.lastCycle.origin} · opened ${bot.data.lastCycle.opened}${bot.data.lastCycle.skipped != null ? ` · skipped ${bot.data.lastCycle.skipped}` : ''} · closed ${bot.data.lastCycle.closed} · ${bot.data.lastCycle.openCount} open${bot.data.lastCycle.error ? ` · error: ${bot.data.lastCycle.error}` : ''}`
                  : 'From /api/quant-bot/status. The cycle runs in the worker; the web process only sees cycles it ran itself.'}</small>
              </div>
            </div>
          </LuxPanel>
        </div>

        <div className="ah-grid">
          <LuxPanel title="Recent admin actions" sub={<><Link href="/admin/audit" className="ah-link">Full audit log →</Link></>}>
            <div className="ah-list">
              {(audit.data?.entries ?? []).map((e, i) => (
                <div key={`${e.at}-${i}`} className="ah-li"><b style={{ fontWeight: 500 }}>{AUDIT_LABEL[e.action] ?? e.action}{e.target ? ` · ${e.target}` : ''}</b><span className="ah-kv">{fmtAgo(e.at)}</span></div>
              ))}
              {audit.data && !audit.data.entries.length && <p className="ah-note">No admin actions recorded yet.</p>}
              {audit.isError && <p className="ah-note">Audit log unavailable.</p>}
            </div>
          </LuxPanel>

          <LuxPanel title="Idea record (all engines)" sub="From /api/admin/stats — canonical filters; win rate = wins ÷ (wins + real losses).">
            {s ? (
              <div className="ah-list">
                <div className="ah-li"><b>Ideas stored</b><span className="ah-kv">{s.totalIdeas.toLocaleString()}</span></div>
                <div className="ah-li"><b>Open now</b><span className="ah-kv">{s.activeIdeas.toLocaleString()}</span></div>
                <div className="ah-li"><b>Decided</b><span className="ah-kv">{s.closedIdeas.toLocaleString()} ({s.wins}W / {s.losses}L)</span></div>
                <div className="ah-li"><b>Win rate</b><span className="ah-kv">{s.closedIdeas ? `${s.winRate}% · n=${s.closedIdeas}` : '— (no decided ideas)'}</span></div>
              </div>
            ) : stats.isError ? <p className="ah-note">Stats unavailable.</p> : <p className="ah-note">Loading…</p>}
            <p className="ah-note">The honest model record lives in JOURNAL › Track record and the model validation report; this is a raw count.</p>
          </LuxPanel>
        </div>
      </div>
    </AdminLayout>
  );
}
