/**
 * Admin hub › Users & access › Waitlist (docs/ADMIN_TAB.md §Waitlist).
 *
 *   list / search   GET  /api/admin/waitlist
 *   approve         POST /api/admin/ops/waitlist/approve { ids, tierOverride, expiryDays }
 *                   → one invite code locked to each entry's email; entry marked approved.
 *                   No email is sent: copy the code / link (or use "Email it" on Invite codes).
 *   approve N       the N oldest pending entries in one call (max 100)
 *   reject          POST /api/admin/waitlist/reject { ids }
 *   export CSV      client-side Blob of the filtered list
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxKpi, LuxKpiGrid, LuxPanel, LuxTag, type LuxTone } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { toCsv, downloadCsv } from '@/lib/journal/metrics-extra';
import { adminWrite, copyText, fmtDate, getJson } from '@/components/admin/hub-data';

const KEY = '/api/admin/waitlist';
interface Entry { id: string; email: string; source: string | null; referralCode: string | null; status: string | null; inviteId: string | null; createdAt: string | null }
interface Approved { id: string; email: string; code: string | null; link: string | null; reused: boolean; skipped?: string }
const TONE: Record<string, LuxTone> = { pending: 'caution', approved: 'accent', invited: 'accent', joined: 'mute', rejected: 'mute' };

export default function AdminWaitlist() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ entries: Entry[]; count: number }>({ queryKey: [KEY], queryFn: () => getJson(KEY) });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkN, setBulkN] = useState('10');
  const [tier, setTier] = useState('none');
  const [days, setDays] = useState('14');
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<Approved[]>([]);

  const all = q.data?.entries ?? [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((e) => (status === 'all' || (e.status ?? 'pending') === status)
      && (!needle || `${e.email} ${e.source ?? ''} ${e.referralCode ?? ''}`.toLowerCase().includes(needle)));
  }, [all, status, search]);
  const count = (s: string) => all.filter((e) => (e.status ?? 'pending') === s).length;
  const oldestPending = useMemo(() => all.filter((e) => (e.status ?? 'pending') === 'pending')
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')), [all]);

  const refresh = async () => {
    setPicked(new Set());
    await qc.invalidateQueries({ queryKey: [KEY] });
    void qc.invalidateQueries({ queryKey: ['/api/admin/ops/overview'] });
    void qc.invalidateQueries({ queryKey: ['/api/admin/ops/invites'] });
  };

  const approve = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await adminWrite<{ results: Approved[] }>('POST', '/api/admin/ops/waitlist/approve', { ids, tierOverride: tier, expiryDays: Number(days) });
      setApproved(r.results);
      const made = r.results.filter((x) => x.code).length;
      toast({ title: `${made} approved`, description: 'Each has an invite code locked to their email. Copy the codes or links below.' });
      await refresh();
    } catch (e) {
      toast({ title: 'Not approved', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const reject = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      await adminWrite('POST', '/api/admin/waitlist/reject', { ids });
      toast({ title: `${ids.length} rejected` });
      await refresh();
    } catch (e) {
      toast({ title: 'Not rejected', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const copy = async (text: string, what: string) => toast({ title: (await copyText(text)) ? `${what} copied` : 'Copy failed — select it by hand' });

  const exportCsv = () => downloadCsv(`quantedge-waitlist-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
    ['email', 'source', 'referral', 'status', 'joined_waitlist'],
    ...rows.map((e) => [e.email, e.source ?? '', e.referralCode ?? '', e.status ?? 'pending', e.createdAt ?? '']),
  ]));

  return (
    <AdminLayout>
      <div className="ah-stack">
        <LuxKpiGrid cols={4}>
          <LuxKpi label="On the waitlist" value={q.data?.count ?? '—'} sub="every entry ever" />
          <LuxKpi label="Pending" value={q.data ? count('pending') : '—'} sub="waiting for a decision" />
          <LuxKpi label="Approved / invited" value={q.data ? `${count('approved')} / ${count('invited')}` : '—'} sub="have a code (invited = emailed)" />
          <LuxKpi label="Joined" value={q.data ? count('joined') : '—'} sub={`${count('rejected')} rejected`} />
        </LuxKpiGrid>

        <LuxPanel title="Approve" sub="Approving creates one invite code per person, locked to their email, and marks them approved. Accounts start on Free unless you pick a tier.">
          <div className="ah-form">
            <label className="ah-field">Tier override
              <select className="ah-select" value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="none">None (Free)</option><option value="free">Free</option><option value="advanced">Advanced</option><option value="pro">Pro</option>
              </select>
            </label>
            <label className="ah-field">Code expires in (days)
              <input className="ah-input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <label className="ah-field">Approve the oldest N pending
              <input className="ah-input" type="number" min={1} max={100} value={bulkN} onChange={(e) => setBulkN(e.target.value)} />
            </label>
            <div className="ah-bar">
              <LuxButton variant="primary" disabled={busy || !oldestPending.length}
                onClick={() => void approve(oldestPending.slice(0, Math.max(1, Math.min(100, Number(bulkN) || 0))).map((e) => e.id))} data-testid="button-approve-oldest">
                Approve oldest {Math.min(Number(bulkN) || 0, oldestPending.length, 100)}
              </LuxButton>
              <LuxButton disabled={busy || !picked.size} onClick={() => void approve([...picked])} data-testid="button-approve-selected">Approve selected ({picked.size})</LuxButton>
              <LuxButton variant="ghost" disabled={busy || !picked.size} onClick={() => void reject([...picked])}>Reject selected</LuxButton>
            </div>
          </div>
          {approved.length > 0 && (
            <div className="ah-fresh" aria-live="polite">
              <div className="ah-bar">
                <b style={{ fontSize: 13 }}>Just approved</b>
                <LuxButton onClick={() => void copy(approved.filter((a) => a.link).map((a) => `${a.email}\t${a.link}`).join('\n'), 'Emails + links')}>Copy all (email + link)</LuxButton>
                <LuxButton variant="ghost" onClick={() => setApproved([])}>Dismiss</LuxButton>
              </div>
              {approved.map((a) => (
                <div key={a.id} className="ah-fresh-row">
                  <span>{a.email}{a.code ? <> · <span className="ah-code">{a.code}</span></> : <span className="ah-mute"> · {a.skipped}</span>}{a.reused ? <span className="ah-mute"> (existing unused code)</span> : null}</span>
                  {a.code && a.link && (
                    <div className="ah-acts">
                      <LuxButton onClick={() => void copy(a.code!, 'Code')}>Copy code</LuxButton>
                      <LuxButton onClick={() => void copy(a.link!, 'Invite link')}>Copy link</LuxButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </LuxPanel>

        <LuxPanel title="Entries" meta={q.data ? <LuxTag tone="mute">{rows.length} shown</LuxTag> : undefined}>
          <div className="ah-bar" style={{ marginBottom: 10 }}>
            <input className="ah-input ah-grow" type="search" placeholder="Search email, source, referral" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search waitlist" data-testid="input-waitlist-search" />
            <select className="ah-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="invited">Invited</option><option value="joined">Joined</option><option value="rejected">Rejected</option>
            </select>
            <LuxButton onClick={exportCsv} disabled={!rows.length}>Export CSV</LuxButton>
          </div>
          {q.isError && <QEError title="The waitlist didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
          {q.isLoading && <p className="ah-note">Loading…</p>}
          {!!rows.length && (
            <div className="ah-scroll">
              <table className="ah-table ah-rows">
                <thead><tr>
                  <th><input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => picked.has(r.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                  <th>Email</th><th>Source</th><th>Joined waitlist</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {rows.map((e) => {
                    const st = e.status ?? 'pending';
                    return (
                      <tr key={e.id} data-testid={`row-waitlist-${e.id}`}>
                        <td data-label="Select"><input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.email}`} /></td>
                        <td data-label="Email">{e.email}</td>
                        <td data-label="Source">{e.source ?? '—'}{e.referralCode && <span className="ah-sub2">ref {e.referralCode}</span>}</td>
                        <td data-label="Date">{fmtDate(e.createdAt)}</td>
                        <td data-label="Status"><LuxTag tone={TONE[st] ?? 'mute'}>{st.toUpperCase()}</LuxTag></td>
                        <td data-label="">
                          <div className="ah-acts">
                            {st !== 'joined' && (
                              <LuxButton disabled={busy} onClick={() => void approve([e.id])}>{st === 'approved' || st === 'invited' ? 'Show code' : 'Approve'}</LuxButton>
                            )}
                            {st === 'pending' && <LuxButton variant="ghost" disabled={busy} onClick={() => void reject([e.id])}>Reject</LuxButton>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {q.data && !rows.length && <p className="ah-note">{all.length ? 'No entries match.' : 'Nobody on the waitlist yet.'}</p>}
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
