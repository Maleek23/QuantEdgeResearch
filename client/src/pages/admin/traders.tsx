/**
 * Admin hub › Users & access › Trader books (docs/ADMIN_TAB.md §Trader books).
 *
 *   list        GET /api/admin/ops/traders  (passcode set / unset — never the hash)
 *   set/clear   PUT /api/journal/traders/:slug/passcode { passcode }  — the existing
 *               journal endpoint ({ passcode: '' } clears). It checks the SIGNED-IN
 *               account is the admin (ADMIN_EMAIL / admin tier), so sign in to the
 *               app as the admin as well as the hub. It logs to the audit log itself.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { adminWrite, useAdminJson } from '@/components/admin/hub-data';

const KEY = '/api/admin/ops/traders';
interface TraderRow { slug: string; name: string; locked: boolean; linked: boolean; source: string | null }

export default function AdminTraders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useAdminJson<{ traders: TraderRow[] }>(KEY);
  const [editing, setEditing] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (slug: string, passcode: string) => {
    setBusy(slug);
    try {
      await adminWrite('PUT', `/api/journal/traders/${encodeURIComponent(slug)}/passcode`, { passcode });
      toast({ title: passcode ? `Passcode set for ${slug}` : `Passcode cleared for ${slug}` });
      setEditing(null); setCode('');
      await qc.invalidateQueries({ queryKey: [KEY] });
    } catch (e) {
      const msg = (e as Error).message;
      toast({
        title: 'Not saved',
        description: /admins only|authentication|beta access|sign in/i.test(msg) ? `${msg} — sign in to the app as the admin account, then retry.` : msg,
        variant: 'destructive',
      });
    } finally { setBusy(null); }
  };

  return (
    <AdminLayout>
      <div className="ah-stack">
        <LuxPanel title="Trader books" sub="A book with a passcode is locked to everyone except admins, the linked trader, and sessions that enter the code. Passcodes are 6–128 characters and stored as bcrypt hashes — they can be replaced, never read back.">
          <p className="ah-banner">Setting a passcode uses the journal's own endpoint, which needs you signed in to the app as the admin account (not only this hub).</p>
          {q.isError && <QEError title="Trader books didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
          {q.isLoading && <p className="ah-note">Loading…</p>}
          {!!q.data?.traders.length && (
            <div className="ah-scroll" style={{ marginTop: 10 }}>
              <table className="ah-table ah-rows">
                <thead><tr><th>Book</th><th>Passcode</th><th>Linked account</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {q.data.traders.map((t) => (
                    <tr key={t.slug} data-testid={`row-trader-${t.slug}`}>
                      <td data-label="Book">{t.name}<span className="ah-sub2">{t.slug}{t.source ? ` · ${t.source}` : ''}</span></td>
                      <td data-label="Passcode"><LuxTag tone={t.locked ? 'accent' : 'caution'}>{t.locked ? 'SET' : 'NOT SET'}</LuxTag></td>
                      <td data-label="Linked">{t.linked ? 'yes' : 'no'}</td>
                      <td data-label="">
                        {editing === t.slug ? (
                          <div className="ah-bar" style={{ justifyContent: 'flex-end' }}>
                            <input className="ah-input" type="password" autoComplete="new-password" minLength={6} maxLength={128} placeholder="new passcode (6+)"
                              value={code} onChange={(e) => setCode(e.target.value)} aria-label={`New passcode for ${t.name}`} data-testid={`input-passcode-${t.slug}`} />
                            <LuxButton variant="primary" disabled={busy === t.slug || code.length < 6} onClick={() => void save(t.slug, code)}>Save</LuxButton>
                            <LuxButton variant="ghost" onClick={() => { setEditing(null); setCode(''); }}>Cancel</LuxButton>
                          </div>
                        ) : (
                          <div className="ah-acts">
                            <LuxButton disabled={busy === t.slug} onClick={() => { setEditing(t.slug); setCode(''); }}>{t.locked ? 'Change passcode' : 'Set passcode'}</LuxButton>
                            {t.locked && <LuxButton className="ah-danger" disabled={busy === t.slug} onClick={() => void save(t.slug, '')}>Clear</LuxButton>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && !q.data.traders.length && <p className="ah-note">No trader books yet.</p>}
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
