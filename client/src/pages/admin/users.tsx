/**
 * Admin hub › Users & access › Users (docs/ADMIN_TAB.md §Users).
 *
 *   list / search      GET    /api/admin/ops/users (no password hashes)
 *   tier               PATCH  /api/admin/ops/users/:id { tier }   free · advanced · pro
 *                      (admin is never granted here — ADMIN_EMAIL / the env decide)
 *   beta access        PATCH  … { hasBetaAccess }
 *   disable / enable   PATCH  … { disabled }   (signs the account out everywhere)
 *   reset password     POST   /api/admin/ops/users/:id/password-reset  (emails the normal reset link)
 *   delete             DELETE /api/admin/ops/users/:id { confirmEmail }  — full cascade
 *
 * Every change lands in the audit log. The admin account itself is read-only here.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { toCsv, downloadCsv } from '@/lib/journal/metrics-extra';
import { adminWrite, fmtAgo, fmtDate, getJson, type AdminUserRow } from '@/components/admin/hub-data';

const KEY = '/api/admin/ops/users';
type Filter = 'all' | 'free' | 'advanced' | 'pro' | 'admin' | 'beta' | 'no-beta' | 'disabled';

export default function AdminUsers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ users: AdminUserRow[] }>({ queryKey: [KEY], queryFn: () => getJson(KEY) });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (q.data?.users ?? []).filter((u) => {
      if (needle && !`${u.email} ${u.name ?? ''} ${u.id}`.toLowerCase().includes(needle)) return false;
      switch (filter) {
        case 'all': return true;
        case 'beta': return u.hasBetaAccess;
        case 'no-beta': return !u.hasBetaAccess;
        case 'disabled': return u.disabled;
        default: return u.tier === filter;
      }
    });
  }, [q.data, search, filter]);

  const run = async (id: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      toast({ title: label });
      await qc.invalidateQueries({ queryKey: [KEY] });
      void qc.invalidateQueries({ queryKey: ['/api/admin/ops/overview'] });
    } catch (e) {
      toast({ title: 'Not done', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };
  const patch = (u: AdminUserRow, body: Record<string, unknown>, label: string) =>
    run(u.id, label, () => adminWrite('PATCH', `/api/admin/ops/users/${encodeURIComponent(u.id)}`, body));

  const exportCsv = () => {
    const head = ['email', 'name', 'tier', 'beta_access', 'disabled', 'created', 'last_login', 'sign_in'];
    downloadCsv(`quantedge-users-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...rows.map((u) => [
      u.email, u.name ?? '', u.tier, u.hasBetaAccess ? 'yes' : 'no', u.disabled ? 'yes' : 'no', u.createdAt ?? '', u.lastLoginAt ?? '', u.authMethod,
    ])]));
  };

  return (
    <AdminLayout>
      <div className="ah-stack">
        <LuxPanel title="Users" meta={q.data ? <LuxTag tone="mute">{rows.length} of {q.data.users.length}</LuxTag> : undefined}
          sub="New accounts start on Free. Tier changes take effect on the user's next request. Paid checkout is off, so tiers are set here.">
          <div className="ah-bar" style={{ marginBottom: 10 }}>
            <input className="ah-input ah-grow" type="search" placeholder="Search email, name or id" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" data-testid="input-user-search" />
            <select className="ah-select" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter users">
              <option value="all">All</option><option value="free">Free</option><option value="advanced">Advanced</option><option value="pro">Pro</option>
              <option value="admin">Admin</option><option value="beta">Beta access</option><option value="no-beta">No beta access</option><option value="disabled">Disabled</option>
            </select>
            <LuxButton onClick={exportCsv} disabled={!rows.length}>Export CSV</LuxButton>
            <LuxButton variant="ghost" onClick={() => void q.refetch()}>Refresh</LuxButton>
          </div>

          {q.isError && <QEError title="Users didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
          {q.isLoading && <p className="ah-note">Loading…</p>}

          {deleting && (
            <div className="ah-confirm" role="alertdialog" aria-label={`Delete ${deleting.email}`}>
              <b>Delete {deleting.email}?</b>
              <span className="ah-mute">This removes the account and everything it owns: preferences, watchlist, personal journal, notes, paper portfolios, wallets, login history, analytics and sessions. Trade ideas stay in the model record (detached from the account). It cannot be undone. Type the email to confirm.</span>
              <div className="ah-bar">
                <input className="ah-input ah-grow" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={deleting.email} aria-label="Type the email to confirm" data-testid="input-delete-confirm" />
                <LuxButton className="ah-danger" disabled={confirmEmail.trim().toLowerCase() !== deleting.email.toLowerCase() || busy === deleting.id}
                  onClick={() => void run(deleting.id, `Deleted ${deleting.email}`, () => adminWrite('DELETE', `/api/admin/ops/users/${encodeURIComponent(deleting.id)}`, { confirmEmail })).then(() => { setDeleting(null); setConfirmEmail(''); })}
                  data-testid="button-confirm-delete">Delete permanently</LuxButton>
                <LuxButton variant="ghost" onClick={() => { setDeleting(null); setConfirmEmail(''); }}>Cancel</LuxButton>
              </div>
            </div>
          )}

          {!!rows.length && (
            <div className="ah-scroll">
              <table className="ah-table ah-rows">
                <thead><tr><th>Account</th><th>Tier</th><th>Beta</th><th>Created</th><th>Last sign-in</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} data-off={u.disabled} data-testid={`row-user-${u.id}`}>
                      <td data-label="Account">
                        {u.email}
                        <span className="ah-sub2">{u.name ?? 'no name'} · {u.authMethod}{u.disabled ? ' · DISABLED' : ''}{u.isAdmin ? ' · ADMIN' : ''}</span>
                      </td>
                      <td data-label="Tier">
                        {u.isAdmin ? <LuxTag tone="accent">{u.tier.toUpperCase()}</LuxTag> : (
                          <select className="ah-select" value={u.tier === 'admin' ? 'pro' : u.tier} disabled={busy === u.id} aria-label={`Tier for ${u.email}`}
                            onChange={(e) => void patch(u, { tier: e.target.value }, `${u.email} → ${e.target.value}`)} data-testid={`select-tier-${u.id}`}>
                            <option value="free">Free</option><option value="advanced">Advanced</option><option value="pro">Pro</option>
                          </select>
                        )}
                      </td>
                      <td data-label="Beta">
                        <label className="ah-check">
                          <input type="checkbox" checked={u.hasBetaAccess} disabled={u.isAdmin || busy === u.id}
                            onChange={(e) => void patch(u, { hasBetaAccess: e.target.checked }, `${u.email}: beta ${e.target.checked ? 'on' : 'off'}`)} />
                          {u.hasBetaAccess ? 'Yes' : 'No'}
                        </label>
                      </td>
                      <td data-label="Created">{fmtDate(u.createdAt)}</td>
                      <td data-label="Last sign-in">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : 'never recorded'}</td>
                      <td data-label="">
                        {u.isAdmin ? <span className="ah-mute">Managed by ADMIN_EMAIL</span> : (
                          <div className="ah-acts">
                            <LuxButton disabled={busy === u.id} onClick={() => void patch(u, { disabled: !u.disabled }, u.disabled ? `Enabled ${u.email}` : `Disabled ${u.email} and signed it out`)}>
                              {u.disabled ? 'Enable' : 'Disable'}
                            </LuxButton>
                            {u.authMethod === 'password' && (
                              <LuxButton disabled={busy === u.id} title="Emails the normal password-reset link"
                                onClick={() => void run(u.id, `Reset link emailed to ${u.email}`, () => adminWrite('POST', `/api/admin/ops/users/${encodeURIComponent(u.id)}/password-reset`))}>
                                Reset password
                              </LuxButton>
                            )}
                            <LuxButton className="ah-danger" disabled={busy === u.id} onClick={() => { setDeleting(u); setConfirmEmail(''); }} data-testid={`button-delete-${u.id}`}>Delete…</LuxButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && !rows.length && <p className="ah-note">No users match.</p>}
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
