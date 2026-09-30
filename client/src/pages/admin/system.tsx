/**
 * Admin hub › System health — observed state only.
 *
 *   Data providers   /api/health dataProviders (server/data-provider-health.ts)
 *   Process          /api/admin/hub/status (pid, node, memory, uptime, pm2, faults)
 *   Discord bot      /api/admin/hub/status discord.botConfigured
 *   API traffic      /api/admin/hub/status api (monitoring-service: rate-limit warnings)
 *   AI keys          /api/admin/ai-provider-status (configured or not — no live calls)
 *   Database         /api/health postgres latency + /api/admin/database-health (size, top tables)
 *   Admin security   /api/admin/security-stats + /api/admin/audit-logs (in-memory, since boot)
 *
 * Replaces the old System page (hardcoded "operational" AI/services rows and a
 * "Optimize database" button whose endpoint did not exist) and the separate
 * Security page (its two endpoints are folded in here).
 */
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxKpi, LuxKpiGrid, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { fmtAgo, fmtUptime, useAdminJson, STATE_LABEL, STATE_TONE, type HealthResponse } from '@/components/admin/hub-data';

interface HubStatus {
  release: { label: string; version: string; series: string; date: string };
  gitSha: string | null; env: string | null;
  process: { pid: number; node: string; uptimeSec: number; rssMb: number; heapUsedMb: number; heapTotalMb: number; pm2: { id: number | null; name: string | null; restarts: number | null } | null };
  faultsSinceBoot: Record<string, number>;
  discord: { botConfigured: boolean };
  ideaProducersInWeb: boolean | null;
  api: { summary: { failingAPIs: number; rateLimitWarnings: number; unresolvedAlerts: number; criticalAlerts: number; totalAPIMetrics: number }; rateLimited: { provider: string; endpoint: string; failureCount: number; lastFailure: string | null }[] } | null;
  at: string;
}
interface DbHealth { databaseSize: string; tables: { name: string; size: string; rowCount: number }[] }
interface SecStats { last24HoursRequests: number; failedAttempts: number; blockedIPs: number; uniqueIPs: number; recentFailedLogins: { ip: string; count: number; blockedUntil: string | null }[] }
interface Audit { logs: { id: string; timestamp: string; action: string; endpoint: string; method: string; responseStatus: number }[]; total: number }
type AiStatus = Record<string, { status: string; model?: string; message?: string }>;

export default function AdminSystem() {
  const health = useAdminJson<HealthResponse>('/api/health', 30_000);
  const hub = useAdminJson<HubStatus>('/api/admin/hub/status', 30_000);
  const db = useAdminJson<DbHealth>('/api/admin/database-health');
  const ai = useAdminJson<AiStatus>('/api/admin/ai-provider-status');
  const sec = useAdminJson<SecStats>('/api/admin/security-stats', 60_000);
  const audit = useAdminJson<Audit>('/api/admin/audit-logs?limit=15', 60_000);
  const h = health.data, p = hub.data?.process;
  const faults = Object.entries(hub.data?.faultsSinceBoot ?? {}).filter(([, n]) => n > 0);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4">
        {hub.isError && <QEError title="Status endpoint unreachable" message="/api/admin/hub/status failed — the server may be on an older build." onRetry={() => void hub.refetch()} />}
        <LuxKpiGrid cols={4}>
          <LuxKpi label="Release" value={hub.data ? `v${hub.data.release.version}` : h?.release ?? '—'} sub={hub.data ? `${hub.data.release.series} · ${hub.data.release.date}${hub.data.gitSha ? ` · ${hub.data.gitSha.slice(0, 7)}` : ''}` : 'shared/release.ts'} />
          <LuxKpi label="Uptime" value={fmtUptime(p?.uptimeSec ?? h?.uptimeSec)} sub={p ? `pid ${p.pid} · node ${p.node}` : '—'} />
          <LuxKpi label="Memory (RSS)" value={p ? `${p.rssMb} MB` : h ? `${h.memMb} MB` : '—'} sub={p ? `heap ${p.heapUsedMb} / ${p.heapTotalMb} MB` : '—'} />
          <LuxKpi label="pm2" value={p?.pm2 ? (p.pm2.restarts != null ? `${p.pm2.restarts} restarts` : 'running') : 'not under pm2'}
            sub={p?.pm2 ? `${p.pm2.name ?? 'app'} · id ${p.pm2.id ?? '?'}${p.pm2.restarts == null ? ' · restart count not exposed to the process' : ''}` : 'no pm_id in the environment'} />
        </LuxKpiGrid>

        <div className="ah-grid">
          <LuxPanel title="Data providers" sub="Observed from real requests (no probe calls). Tradier is retired and not listed."
            meta={h ? <LuxTag tone={h.dataPartial ? 'caution' : 'accent'}>{h.dataPartial ? `PARTIAL · ${h.dataPartialProviders.join(', ')}` : 'ALL OK'}</LuxTag> : undefined}>
            {health.isError && <p className="ah-note">/api/health unreachable.</p>}
            <div className="ah-list">
              {(h?.dataProviders ?? []).map((d) => (
                <div key={d.id} className="ah-li">
                  <b>{d.label}</b><LuxTag tone={STATE_TONE[d.state]}>{STATE_LABEL[d.state]}</LuxTag>
                  <small>{d.role} · last ok {fmtAgo(d.lastSuccessAt)}{d.lastFailureAt ? ` · last failure ${fmtAgo(d.lastFailureAt)}` : ''}{d.detail ? ` · ${d.detail}` : ''}</small>
                </div>
              ))}
            </div>
          </LuxPanel>

          <LuxPanel title="Services" sub="Configuration and in-process state.">
            <div className="ah-list">
              <div className="ah-li"><b>Postgres</b>
                <LuxTag tone={h?.checks.postgres?.ok ? 'accent' : 'caution'}>{h ? (h.checks.postgres?.ok ? `OK · ${h.checks.postgres.latencyMs ?? '?'} ms` : 'DOWN') : '—'}</LuxTag>
                <small>{db.data ? `${db.data.databaseSize} on disk` : db.isError ? 'size query failed' : 'size loading…'}</small></div>
              <div className="ah-li"><b>Discord bot</b>
                <LuxTag tone={hub.data?.discord.botConfigured ? 'accent' : 'mute'}>{hub.data ? (hub.data.discord.botConfigured ? 'TOKEN SET' : 'NOT CONFIGURED') : '—'}</LuxTag>
                <small>Imports trader calls into journals (DISCORD_BOT_TOKEN). Configured ≠ connected: an import run is the live test.</small></div>
              <div className="ah-li"><b>Idea producers</b>
                <LuxTag tone="mute">{hub.data?.ideaProducersInWeb == null ? '—' : hub.data.ideaProducersInWeb ? 'IN WEB PROCESS' : 'OFF IN WEB'}</LuxTag>
                <small>Whether the scanners that publish ideas run inside this web process (server/idea-producer-schedule.ts).</small></div>
              {Object.entries(ai.data ?? {}).map(([k, v]) => (
                <div key={k} className="ah-li"><b>AI · {k}</b>
                  <LuxTag tone={v.status === 'configured' ? 'accent' : 'mute'}>{v.status.replace(/_/g, ' ').toUpperCase()}</LuxTag>
                  <small>{v.model ? `${v.model} · ` : ''}key present or not — no live call is made</small></div>
              ))}
            </div>
          </LuxPanel>

          <LuxPanel title="API traffic & rate limits" sub="Outbound provider calls recorded by the monitoring service since boot.">
            {hub.data?.api ? (
              <>
                <div className="ah-list">
                  <div className="ah-li"><b>Endpoints tracked</b><span className="ah-kv">{hub.data.api.summary.totalAPIMetrics}</span></div>
                  <div className="ah-li"><b>Endpoints with failures</b><span className="ah-kv">{hub.data.api.summary.failingAPIs}</span></div>
                  <div className="ah-li"><b>Rate-limit warnings</b><span className="ah-kv">{hub.data.api.summary.rateLimitWarnings}</span></div>
                  <div className="ah-li"><b>Unresolved alerts</b><span className="ah-kv">{hub.data.api.summary.unresolvedAlerts} ({hub.data.api.summary.criticalAlerts} critical)</span></div>
                </div>
                {hub.data.api.rateLimited.length > 0 && (
                  <div className="ah-scroll" style={{ marginTop: 8 }}>
                    <table className="ah-table"><thead><tr><th>Provider</th><th>Endpoint</th><th>Failures</th><th>Last</th></tr></thead>
                      <tbody>{hub.data.api.rateLimited.map((r) => <tr key={r.provider + r.endpoint}><td>{r.provider}</td><td>{r.endpoint}</td><td>{r.failureCount}</td><td>{fmtAgo(r.lastFailure)}</td></tr>)}</tbody></table>
                  </div>
                )}
              </>
            ) : <p className="ah-note">{hub.isLoading ? 'Loading…' : 'Monitoring service unavailable.'}</p>}
            <p className="ah-note">Faults caught since boot: {faults.length ? faults.map(([k, n]) => `${k} ${n}`).join(' · ') : 'none'}.</p>
          </LuxPanel>

          <LuxPanel title="Largest tables" sub="From pg_stat_user_tables (live row estimates).">
            {db.data ? (
              <div className="ah-scroll">
                <table className="ah-table"><thead><tr><th>Table</th><th>Size</th><th>Rows</th></tr></thead>
                  <tbody>{db.data.tables.map((t) => <tr key={t.name}><td>{t.name}</td><td>{t.size}</td><td>{t.rowCount.toLocaleString()}</td></tr>)}</tbody></table>
              </div>
            ) : <p className="ah-note">{db.isError ? 'Database health query failed.' : 'Loading…'}</p>}
          </LuxPanel>
        </div>

        <LuxPanel title="Admin access & audit" sub="In-memory since the last restart: admin API requests, failed admin logins and blocked IPs.">
          {sec.data && (
            <LuxKpiGrid cols={4}>
              <LuxKpi label="Admin requests 24h" value={sec.data.last24HoursRequests} />
              <LuxKpi label="Failed attempts" value={sec.data.failedAttempts} tone={sec.data.failedAttempts ? 'caution' : undefined} />
              <LuxKpi label="Blocked IPs" value={sec.data.blockedIPs} />
              <LuxKpi label="Unique IPs" value={sec.data.uniqueIPs} />
            </LuxKpiGrid>
          )}
          <div className="ah-scroll" style={{ marginTop: 10 }}>
            <table className="ah-table"><thead><tr><th>When</th><th>Action</th><th>Request</th><th>Status</th></tr></thead>
              <tbody>{(audit.data?.logs ?? []).map((l) => <tr key={l.id}><td>{fmtAgo(l.timestamp)}</td><td>{l.action}</td><td>{l.method} {l.endpoint}</td><td>{l.responseStatus}</td></tr>)}</tbody></table>
            {audit.data && !audit.data.logs.length && <p className="ah-note">No admin actions logged since the last restart.</p>}
          </div>
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
