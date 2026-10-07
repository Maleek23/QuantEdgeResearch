/**
 * Admin hub › Users & access › Waitlist (docs/ADMIN_TAB.md §Waitlist).
 *
 *   list / search   GET  /api/admin/ops/waitlist  (entries + invite + emailed-at / email error + sender status)
 *   approve         POST /api/admin/ops/waitlist/approve { ids, tierOverride, expiryDays, sendEmail }
 *                   → one invite code locked to each entry's email, then the
 *                   "You're in — QuantEdge beta" email (server/invite-mailer.ts).
 *                   Row: "invited · emailed HH:MM" or "email failed — copy link".
 *   approve all     POST /api/admin/ops/waitlist/approve-all { confirm, expectedCount } after a confirm dialog
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

const KEY = '/api/admin/ops/waitlist';
interface InviteInfo { id: string; code: string; link: string; status: string; sentAt: string | null; expiresAt: string | null; emailError: string | null }
interface Entry {
  id: string; email: string; source: string | null; referralCode: string | null; status: string | null; createdAt: string | null;
  referrer?: string | null; landingPath?: string | null; utm?: Record<string, string> | null; invite: InviteInfo | null;
}
interface Sender { configured: boolean; from: string; sandbox?: boolean; problem: string | null }
interface Approved { id: string; email: string; code: string | null; link: string | null; reused: boolean; emailed: boolean; emailedAt: string | null; emailError: string | null; skipped?: string }
interface ApproveResponse { results: Approved[]; remaining?: number; sender?: Sender }
const TONE: Record<string, LuxTone> = { pending: 'caution', approved: 'accent', invited: 'accent', joined: 'mute', rejected: 'mute' };
const hhmm = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
const sourceLine = (e: Entry) => [e.utm?.utm_source, e.utm?.utm_campaign].filter(Boolean).join(' / ')
  || (e.referrer ? (() => { try { return new URL(e.referrer!).hostname; } catch { return e.referrer; } })() : '');

export default function AdminWaitlist() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ entries: Entry[]; count: number; sender: Sender }>({ queryKey: [KEY], queryFn: () => getJson(KEY) });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkN, setBulkN] = useState('10');
  const [tier, setTier] = useState('none');
  const [days, setDays] = useState('14');
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<Approved[]>([]);
  const [sendEmail, setSendEmail] = useState(true);
  const sender = q.data?.sender;

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
    void qc.invalidateQueries({ queryKey: ['/api/admin/waitlist'] });
  };

  const report = (r: ApproveResponse, label: string) => {
    setApproved(r.results);
    const made = r.results.filter((x) => x.code).length;
    const emailed = r.results.filter((x) => x.emailed).length;
    const failed = r.results.filter((x) => x.emailError).length;
    toast({
      title: `${made} ${label}`,
      description: [
        sendEmail ? `${emailed} emailed${failed ? `, ${failed} email failed — copy their links below` : ''}.` : 'No email sent — copy the codes or links below.',
        r.remaining ? `${r.remaining} still pending (max 100 per run).` : '',
      ].filter(Boolean).join(' '),
      variant: failed ? 'destructive' : undefined,
    });
  };

  const approve = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await adminWrite<ApproveResponse>('POST', '/api/admin/ops/waitlist/approve', { ids, tierOverride: tier, expiryDays: Number(days), sendEmail });
      report(r, 'approved');
      await refresh();
    } catch (e) {
      toast({ title: 'Not approved', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const approveAll = async () => {
    const n = oldestPending.length;
    if (!n) return;
    const what = sendEmail ? 'create an invite code for each and email it' : 'create an invite code for each (no email)';
    if (!window.confirm(`Approve all ${n} pending ${n === 1 ? 'entry' : 'entries'}? This will ${what}.${n > 100 ? ' The oldest 100 go in this run.' : ''}`)) return;
    setBusy(true);
    try {
      const r = await adminWrite<ApproveResponse>('POST', '/api/admin/ops/waitlist/approve-all', {
        confirm: 'approve-all-pending', expectedCount: n, tierOverride: tier, expiryDays: Number(days), sendEmail,
      });
      report(r, 'approved');
      await refresh();
    } catch (e) {
      toast({ title: 'Not approved', description: (e as Error).message, variant: 'destructive' });
      await refresh();
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
    ['email', 'source', 'referral', 'referrer', 'utm_source', 'utm_campaign', 'status', 'joined_waitlist', 'emailed_at'],
    ...rows.map((e) => [e.email, e.source ?? '', e.referralCode ?? '', e.referrer ?? '', e.utm?.utm_source ?? '', e.utm?.utm_campaign ?? '', e.status ?? 'pending', e.createdAt ?? '', e.invite?.sentAt ?? '']),
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

        <LuxPanel title="Approve" sub="Approving creates one invite code per person, locked to their email, and emails it (“You’re in — QuantEdge beta”, a /signup link with the code filled in). Accounts start on Free unless you pick a tier.">
          {sender?.problem && (
            <p className="ah-note" role="alert" style={{ marginBottom: 10 }} data-testid="text-sender-problem"><b>Email can’t go out yet.</b> {sender.problem}</p>
          )}
          {sender && !sender.problem && <p className="ah-note" style={{ marginBottom: 10 }}>Emails go from {sender.from}.</p>}
          <div className="ah-form">
            <label className="ah-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} data-testid="checkbox-send-email" />
              Email the invite on approve
            </label>
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
              <LuxButton disabled={busy || !oldestPending.length} onClick={() => void approveAll()} data-testid="button-approve-all">Approve all pending ({oldestPending.length})</LuxButton>
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
                  <span>{a.email}{a.code ? <> · <span className="ah-code">{a.code}</span></> : <span className="ah-mute"> · {a.skipped}</span>}{a.reused ? <span className="ah-mute"> (existing unused code)</span> : null}
                    {a.code && (a.emailed
                      ? <span className="ah-mute"> · emailed {hhmm(a.emailedAt)}</span>
                      : a.emailError ? <span className="ah-mute" title={a.emailError}> · email failed — copy link</span> : <span className="ah-mute"> · not emailed</span>)}</span>
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
                        <td data-label="Source">{e.source ?? '—'}{e.referralCode && <span className="ah-sub2">ref {e.referralCode}</span>}{sourceLine(e) && <span className="ah-sub2">{sourceLine(e)}</span>}</td>
                        <td data-label="Date">{fmtDate(e.createdAt)}</td>
                        <td data-label="Status">
                          <LuxTag tone={TONE[st] ?? 'mute'}>{st.toUpperCase()}</LuxTag>
                          {e.invite && (st === 'invited' || st === 'approved') && (
                            e.invite.sentAt
                              ? <span className="ah-sub2" data-testid={`text-emailed-${e.id}`}>invited · emailed {hhmm(e.invite.sentAt)}</span>
                              : <span className="ah-sub2" title={e.invite.emailError ?? undefined} data-testid={`text-email-failed-${e.id}`}>
                                  {e.invite.emailError ? 'email failed — ' : 'not emailed — '}
                                  <button type="button" className="ah-linkbtn" onClick={() => void copy(e.invite!.link, 'Invite link')}>copy link</button>
                                </span>
                          )}
                        </td>
                        <td data-label="">
                          <div className="ah-acts">
                            {st !== 'joined' && (
                              <LuxButton disabled={busy} onClick={() => void approve([e.id])}>{st === 'approved' || st === 'invited' ? (e.invite && !e.invite.sentAt && sendEmail ? 'Retry email' : 'Show code') : 'Approve'}</LuxButton>
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
