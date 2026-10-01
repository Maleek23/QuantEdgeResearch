/**
 * Admin hub › Users & access › Invite codes (docs/ADMIN_TAB.md §Invite codes).
 *
 *   generate   POST /api/admin/ops/invites/generate { count, email?, tierOverride, expiryDays, note }
 *              codes come from crypto.randomBytes on the server (qe-xxxxx-xxxxx-xxxxx-xxxxx)
 *   list       GET  /api/admin/ops/invites  — unused / used / expired / revoked, who redeemed, when
 *   revoke     POST /api/admin/ops/invites/:id/revoke
 *   copy       the code, or the invite link /signup?code=… (the sign-up page prefills it)
 *   email      POST /api/admin/invites/:id/resend (only for email-locked codes, needs RESEND_API_KEY)
 *
 * beta_invites.token is stored in plaintext (every redemption path looks it
 * up by equality), so a code can be copied again later from this list.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxKpi, LuxKpiGrid, LuxPanel, LuxTag, type LuxTone } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { toCsv, downloadCsv } from '@/lib/journal/metrics-extra';
import { adminWrite, copyText, fmtAgo, fmtDate, getJson, useAdminJson, type AdminInviteRow } from '@/components/admin/hub-data';

const KEY = '/api/admin/ops/invites';
const STATUS_TONE: Record<AdminInviteRow['status'], LuxTone> = { unused: 'accent', used: 'mute', expired: 'caution', revoked: 'caution' };
type Fresh = { id: string; code: string; link: string }[];

export default function AdminInvites() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ invites: AdminInviteRow[] }>({ queryKey: [KEY], queryFn: () => getJson(KEY) });
  const email = useAdminJson<{ configured: boolean }>('/api/admin/email-status');
  const [count, setCount] = useState('1');
  const [lockEmail, setLockEmail] = useState('');
  const [tier, setTier] = useState('none');
  const [days, setDays] = useState('14');
  const [note, setNote] = useState('');
  const [fresh, setFresh] = useState<Fresh>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | AdminInviteRow['status']>('all');
  const [search, setSearch] = useState('');

  const all = q.data?.invites ?? [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((i) => (status === 'all' || i.status === status)
      && (!needle || `${i.code} ${i.email ?? ''} ${i.note ?? ''} ${i.redeemedBy?.email ?? ''}`.toLowerCase().includes(needle)));
  }, [all, status, search]);
  const n = (s: AdminInviteRow['status']) => all.filter((i) => i.status === s).length;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: [KEY] });
    void qc.invalidateQueries({ queryKey: ['/api/admin/ops/overview'] });
  };

  const generate = async () => {
    setBusy('generate');
    try {
      const r = await adminWrite<{ invites: Fresh }>('POST', '/api/admin/ops/invites/generate', {
        count: Number(count), email: lockEmail.trim() || null, tierOverride: tier, expiryDays: Number(days), note: note.trim() || null,
      });
      setFresh(r.invites);
      toast({ title: `${r.invites.length} code${r.invites.length === 1 ? '' : 's'} generated` });
      setLockEmail(''); setNote('');
      await refresh();
    } catch (e) {
      toast({ title: 'Not generated', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const act = async (id: string, label: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); toast({ title: label }); await refresh(); }
    catch (e) { toast({ title: 'Not done', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const copy = async (text: string, what: string) => {
    toast({ title: (await copyText(text)) ? `${what} copied` : `Copy failed — select it by hand` });
  };

  const exportCsv = () => {
    downloadCsv(`quantedge-invites-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['code', 'link', 'status', 'email_lock', 'tier_override', 'created', 'expires', 'redeemed_at', 'redeemed_by', 'note'],
      ...rows.map((i) => [i.code, i.link, i.status, i.email ?? '', i.tierOverride ?? '', i.createdAt ?? '', i.expiresAt ?? '', i.redeemedAt ?? '', i.redeemedBy?.email ?? '', i.note ?? '']),
    ]));
  };

  return (
    <AdminLayout>
      <div className="ah-stack">
        <LuxKpiGrid cols={4}>
          <LuxKpi label="Unused" value={q.data ? n('unused') : '—'} sub="valid, not yet redeemed" />
          <LuxKpi label="Used" value={q.data ? n('used') : '—'} sub="redeemed into an account" />
          <LuxKpi label="Expired" value={q.data ? n('expired') : '—'} sub="past their expiry date" />
          <LuxKpi label="Revoked" value={q.data ? n('revoked') : '—'} sub="cancelled by an operator" />
        </LuxKpiGrid>

        <LuxPanel title="Generate codes" sub="Codes are random (server crypto.randomBytes). An email lock makes the code work only for that address (one code). Every account starts on Free unless you pick a tier override; admin can't be granted by a code.">
          <div className="ah-form">
            <label className="ah-field">How many
              <input className="ah-input" type="number" min={1} max={100} value={count} disabled={!!lockEmail.trim()} onChange={(e) => setCount(e.target.value)} data-testid="input-invite-count" />
            </label>
            <label className="ah-field">Email lock (optional)
              <input className="ah-input" type="email" placeholder="person@example.com" value={lockEmail} onChange={(e) => { setLockEmail(e.target.value); if (e.target.value.trim()) setCount('1'); }} data-testid="input-invite-email" />
            </label>
            <label className="ah-field">Tier override
              <select className="ah-select" value={tier} onChange={(e) => setTier(e.target.value)} data-testid="select-invite-tier">
                <option value="none">None (Free)</option><option value="free">Free</option><option value="advanced">Advanced</option><option value="pro">Pro</option>
              </select>
            </label>
            <label className="ah-field">Expires in (days)
              <input className="ah-input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <label className="ah-field" style={{ gridColumn: '1 / -1' }}>Note (internal)
              <input className="ah-input" maxLength={500} placeholder="e.g. Discord giveaway, Femi's friends" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div><LuxButton variant="primary" disabled={busy === 'generate'} onClick={() => void generate()} data-testid="button-generate-invites">{busy === 'generate' ? 'Generating…' : 'Generate'}</LuxButton></div>
          </div>
          {fresh.length > 0 && (
            <div className="ah-fresh" aria-live="polite">
              <div className="ah-bar">
                <b style={{ fontSize: 13 }}>New codes</b>
                <LuxButton onClick={() => void copy(fresh.map((f) => f.code).join('\n'), 'Codes')}>Copy all codes</LuxButton>
                <LuxButton onClick={() => void copy(fresh.map((f) => f.link).join('\n'), 'Links')}>Copy all links</LuxButton>
                <LuxButton variant="ghost" onClick={() => setFresh([])}>Dismiss</LuxButton>
              </div>
              {fresh.map((f) => (
                <div key={f.id} className="ah-fresh-row">
                  <span className="ah-code">{f.code}</span>
                  <div className="ah-acts">
                    <LuxButton onClick={() => void copy(f.code, 'Code')}>Copy code</LuxButton>
                    <LuxButton onClick={() => void copy(f.link, 'Invite link')}>Copy link</LuxButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </LuxPanel>

        <LuxPanel title="All codes" meta={q.data ? <LuxTag tone="mute">{rows.length} of {all.length}</LuxTag> : undefined}
          sub={`Invite link = /signup?code=…, which prefills the code. Email sending is ${email.data?.configured ? 'configured' : 'not configured (no RESEND_API_KEY) — copy codes and links instead'}.`}>
          <div className="ah-bar" style={{ marginBottom: 10 }}>
            <input className="ah-input ah-grow" type="search" placeholder="Search code, email, note" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search codes" />
            <select className="ah-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
              <option value="all">All</option><option value="unused">Unused</option><option value="used">Used</option><option value="expired">Expired</option><option value="revoked">Revoked</option>
            </select>
            <LuxButton onClick={exportCsv} disabled={!rows.length}>Export CSV</LuxButton>
          </div>
          {q.isError && <QEError title="Codes didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
          {q.isLoading && <p className="ah-note">Loading…</p>}
          {!!rows.length && (
            <div className="ah-scroll">
              <table className="ah-table ah-rows">
                <thead><tr><th>Code</th><th>Status</th><th>Lock · tier</th><th>Created · expires</th><th>Redeemed by</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id} data-off={i.status !== 'unused'} data-testid={`row-invite-${i.id}`}>
                      <td data-label="Code"><span className="ah-code">{i.code}</span>{i.note && <span className="ah-sub2">{i.note}</span>}</td>
                      <td data-label="Status"><LuxTag tone={STATUS_TONE[i.status]}>{i.status.toUpperCase()}</LuxTag>{i.sentAt && <span className="ah-sub2">emailed {fmtAgo(i.sentAt)}</span>}</td>
                      <td data-label="Lock · tier">{i.email ?? 'any email'}<span className="ah-sub2">{i.tierOverride ? `grants ${i.tierOverride}` : 'Free'}</span></td>
                      <td data-label="Dates">{fmtDate(i.createdAt)}<span className="ah-sub2">expires {fmtDate(i.expiresAt)}</span></td>
                      <td data-label="Redeemed by">{i.redeemedBy ? i.redeemedBy.email : i.status === 'used' ? '(account deleted or Google)' : '—'}{i.redeemedAt && <span className="ah-sub2">{fmtAgo(i.redeemedAt)}</span>}</td>
                      <td data-label="">
                        <div className="ah-acts">
                          <LuxButton onClick={() => void copy(i.code, 'Code')}>Copy code</LuxButton>
                          <LuxButton onClick={() => void copy(i.link, 'Invite link')}>Copy link</LuxButton>
                          {i.status === 'unused' && i.email && email.data?.configured && (
                            <LuxButton disabled={busy === i.id} onClick={() => void act(i.id, `Invite emailed to ${i.email}`, () => adminWrite('POST', `/api/admin/invites/${encodeURIComponent(i.id)}/resend`))}>Email it</LuxButton>
                          )}
                          {i.status === 'unused' && (
                            <LuxButton className="ah-danger" disabled={busy === i.id} onClick={() => void act(i.id, 'Code revoked', () => adminWrite('POST', `/api/admin/ops/invites/${encodeURIComponent(i.id)}/revoke`))} data-testid={`button-revoke-${i.id}`}>Revoke</LuxButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && !rows.length && <p className="ah-note">{all.length ? 'No codes match.' : 'No codes yet — generate some above.'}</p>}
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
