/**
 * Admin hub › Audit log (docs/ADMIN_TAB.md §Audit log).
 *
 *   GET /api/admin/ops/audit?limit=500 — the append-only admin action log
 *   (.cache/admin-audit/actions.jsonl, server/admin-audit.ts). Codes appear only
 *   as their last 4 characters; passcodes and reset tokens never appear.
 *
 * The per-request in-memory log (since boot) stays on System health.
 */
import { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { toCsv, downloadCsv } from '@/lib/journal/metrics-extra';
import { AUDIT_LABEL, fmtAgo, useAdminJson, type AdminAuditRow } from '@/components/admin/hub-data';

const detailText = (d: Record<string, unknown>) => Object.entries(d)
  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
  .join(' · ');

export default function AdminAudit() {
  const q = useAdminJson<{ entries: AdminAuditRow[] }>('/api/admin/ops/audit?limit=500', 60_000);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.data?.entries ?? []).filter((e) => (kind === 'all' || e.action.startsWith(kind))
      && (!needle || `${e.action} ${e.target ?? ''} ${e.actor} ${detailText(e.detail)}`.toLowerCase().includes(needle)));
  }, [q.data, search, kind]);

  const exportCsv = () => downloadCsv(`quantedge-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
    ['at', 'action', 'actor', 'target', 'detail', 'ip'],
    ...rows.map((e) => [e.at, e.action, e.actor, e.target ?? '', detailText(e.detail), e.ip ?? '']),
  ]));

  return (
    <AdminLayout>
      <div className="ah-stack">
        <LuxPanel title="Admin actions" meta={q.data ? <LuxTag tone="mute">{rows.length} shown</LuxTag> : undefined}
          sub="Invite codes generated / revoked, waitlist decisions, tier and beta changes, disables, deletes, password resets and book passcodes. Append-only; newest first.">
          <div className="ah-bar" style={{ marginBottom: 10 }}>
            <input className="ah-input ah-grow" type="search" placeholder="Search action, target, actor" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the audit log" />
            <select className="ah-select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by kind">
              <option value="all">All</option><option value="invite.">Invite codes</option><option value="waitlist.">Waitlist</option><option value="user.">Users</option><option value="trader.">Trader books</option>
            </select>
            <LuxButton onClick={exportCsv} disabled={!rows.length}>Export CSV</LuxButton>
            <LuxButton variant="ghost" onClick={() => void q.refetch()}>Refresh</LuxButton>
          </div>
          {q.isError && <QEError title="The audit log didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
          {q.isLoading && <p className="ah-note">Loading…</p>}
          {!!rows.length && (
            <div className="ah-scroll">
              <table className="ah-table ah-rows">
                <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Detail</th><th>By</th></tr></thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr key={`${e.at}-${i}`}>
                      <td data-label="When">{fmtAgo(e.at)}<span className="ah-sub2">{new Date(e.at).toLocaleString()}</span></td>
                      <td data-label="Action">{AUDIT_LABEL[e.action] ?? e.action}</td>
                      <td data-label="Target">{e.target ?? '—'}</td>
                      <td data-label="Detail" style={{ fontFamily: 'var(--lx-font-ui)' }}>{detailText(e.detail) || '—'}</td>
                      <td data-label="By">{e.actor}{e.ip && <span className="ah-sub2">{e.ip}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && !rows.length && <p className="ah-note">{q.data.entries.length ? 'Nothing matches.' : 'No admin actions recorded yet. They appear here as soon as you generate a code, change a tier, etc.'}</p>}
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
