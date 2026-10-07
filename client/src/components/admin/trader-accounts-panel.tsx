/**
 * Admin hub › Users › Trader accounts (docs/DESK_ADMINS.md §Trader accounts).
 *
 *   list        GET  /api/admin/ops/trader-accounts
 *   add         POST /api/admin/ops/trader-accounts  { displayName, email?, username?, traderSlug, tier, deskAdmin, method }
 *   regenerate  POST /api/admin/ops/trader-accounts/:id/regenerate { method }
 *   revoke      POST /api/admin/ops/trader-accounts/:id/revoke
 *
 * A setup link / temporary password is in the create (or regenerate) response
 * only. It lives in this component's state until "Done", is never cached by
 * react-query and cannot be fetched again — the server keeps only a hash.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LuxButton, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { adminWrite, copyText, fmtDate, getJson } from '@/components/admin/hub-data';
import {
  SETUP_LINK_TTL_HOURS, TRADER_ACCOUNT_STATUS_LABEL, usernameFromDisplayName, type CredentialMethod, type TraderAccountStatus,
} from '@shared/trader-accounts';

const KEY = '/api/admin/ops/trader-accounts';

interface Book { slug: string; name: string; hasDeskAdmin: boolean }
interface Account {
  id: string; displayName: string; login: string; email: string | null; username: string | null;
  status: TraderAccountStatus; linkExpiresAt: string | null; traderSlug: string | null; traderName: string | null;
  tier: string; hasBetaAccess: boolean; createdAt: string | null;
}
type Credential =
  | { method: 'link'; link: string; expiresAt: string }
  | { method: 'temp'; tempPassword: string; login: string };
interface Fresh { who: string; login: string; credential: Credential }

const STATUS_TONE: Record<TraderAccountStatus, 'accent' | 'caution' | 'mute' | 'marker'> = {
  active: 'accent', setup_pending: 'marker', temp_password: 'marker', setup_expired: 'caution', no_credentials: 'caution', disabled: 'mute',
};

export function TraderAccountsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ traders: Book[]; accounts: Account[] }>({ queryKey: [KEY], queryFn: () => getJson(KEY) });

  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [tier, setTier] = useState<'free' | 'advanced' | 'pro'>('free');
  const [deskAdmin, setDeskAdmin] = useState(true);
  const [method, setMethod] = useState<CredentialMethod>('link');
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Fresh | null>(null);

  const books = q.data?.traders ?? [];
  const book = books.find((b) => b.slug === slug);
  const suggested = useMemo(() => usernameFromDisplayName(displayName) ?? '', [displayName]);

  const pickBook = (s: string) => {
    setSlug(s);
    const b = books.find((x) => x.slug === s);
    if (b && !nameTouched) setDisplayName(b.name);
    if (b?.hasDeskAdmin) setDeskAdmin(false);
    else setDeskAdmin(true);
  };

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: [KEY] });
    void qc.invalidateQueries({ queryKey: ['/api/admin/ops/users'] });
    void qc.invalidateQueries({ queryKey: ['/api/admin/ops/desks'] });
  };

  const create = async () => {
    setBusy('create');
    try {
      const r = await adminWrite<{ account: Account; credential: Credential }>('POST', KEY, {
        displayName, email: email.trim() || undefined, username: email.trim() ? undefined : (username.trim() || undefined),
        traderSlug: slug, tier, deskAdmin, method,
      });
      setFresh({ who: r.account.displayName, login: r.account.login, credential: r.credential });
      toast({ title: `Account created for ${r.account.displayName}`, description: `Sign-in: ${r.account.login}` });
      setSlug(''); setDisplayName(''); setNameTouched(false); setEmail(''); setUsername(''); setTier('free'); setDeskAdmin(true); setMethod('link');
      await refresh();
    } catch (e) {
      toast({ title: 'Not created', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const regenerate = async (a: Account, m: CredentialMethod) => {
    if (m === 'temp' && a.status === 'active' && !window.confirm(`${a.displayName} already set a password. A temporary password replaces it now and signs them out everywhere. Continue?`)) return;
    setBusy(a.id);
    try {
      const r = await adminWrite<{ account: Account; credential: Credential }>('POST', `${KEY}/${encodeURIComponent(a.id)}/regenerate`, { method: m });
      setFresh({ who: r.account.displayName, login: r.account.login, credential: r.credential });
      toast({ title: m === 'link' ? `New setup link for ${a.displayName}` : `New temporary password for ${a.displayName}`, description: 'Every earlier link stopped working.' });
      await refresh();
    } catch (e) {
      toast({ title: 'Not done', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const revoke = async (a: Account) => {
    setBusy(a.id);
    try {
      await adminWrite('POST', `${KEY}/${encodeURIComponent(a.id)}/revoke`);
      toast({ title: `Revoked ${a.displayName}'s link`, description: a.status === 'temp_password' ? 'The temporary password no longer works.' : undefined });
      await refresh();
    } catch (e) {
      toast({ title: 'Not done', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const copy = async (text: string, what: string) => toast({ title: (await copyText(text)) ? `${what} copied` : 'Copy failed — select it by hand' });

  const accounts = q.data?.accounts ?? [];
  return (
    <LuxPanel title="Trader accounts" meta={q.data ? <LuxTag tone="mute">{accounts.length}</LuxTag> : undefined}
      sub={`Create a login for a trader and link it to their book as desk admin. Beta access is on (everything open). Default: a one-time setup link (${SETUP_LINK_TTL_HOURS} h) where they choose their own password and land on /desk.`}>
      {q.isError && <QEError title="Trader accounts didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}

      <form className="ah-form" onSubmit={(e) => { e.preventDefault(); void create(); }} data-testid="form-add-trader-account">
        <label className="ah-field">Trader book
          <select className="ah-select" value={slug} onChange={(e) => pickBook(e.target.value)} required data-testid="select-trader-book">
            <option value="">Choose…</option>
            {books.map((b) => <option key={b.slug} value={b.slug}>{b.name}{b.hasDeskAdmin ? ' (has desk admin)' : ''}</option>)}
          </select>
        </label>
        <label className="ah-field">Display name
          <input className="ah-input" value={displayName} maxLength={60} required onChange={(e) => { setDisplayName(e.target.value); setNameTouched(true); }} data-testid="input-trader-display-name" />
        </label>
        <label className="ah-field">Email (optional)
          <input className="ah-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="blank = username login" autoComplete="off" data-testid="input-trader-email" />
        </label>
        {!email.trim() && (
          <label className="ah-field">Username
            <input className="ah-input" value={username} maxLength={32} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder={suggested || 'e.g. femi'} autoComplete="off" autoCapitalize="none" spellCheck={false} data-testid="input-trader-username" />
          </label>
        )}
        <label className="ah-field">Tier
          <select className="ah-select" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)} data-testid="select-trader-tier">
            <option value="free">Free + beta (everything open)</option><option value="advanced">Advanced</option><option value="pro">Pro</option>
          </select>
        </label>
        <label className="ah-field">Credentials
          <select className="ah-select" value={method} onChange={(e) => setMethod(e.target.value as CredentialMethod)} data-testid="select-trader-method">
            <option value="link">Setup link (recommended)</option><option value="temp">Temporary password</option>
          </select>
        </label>
        <label className="ah-check" title={book?.hasDeskAdmin ? 'This book already has a desk admin — remove them in Desk admins first' : undefined}>
          <input type="checkbox" checked={deskAdmin} disabled={!!book?.hasDeskAdmin} onChange={(e) => setDeskAdmin(e.target.checked)} data-testid="check-trader-desk-admin" />
          Desk admin of this book
        </label>
        <LuxButton variant="primary" type="submit" disabled={!slug || !displayName.trim() || busy === 'create'} data-testid="button-add-trader-account">
          {busy === 'create' ? 'Creating…' : 'Add trader account'}
        </LuxButton>
      </form>
      {!email.trim() && displayName.trim() && <p className="ah-note">They will sign in with the username <b>{username.trim() || suggested || '—'}</b> (no email needed).</p>}

      {fresh && (
        <div className="ah-fresh" aria-live="polite" data-testid="trader-credential-once">
          <p className="ah-banner" data-tone="caution">
            <b>Shown once.</b> Copy it now and send it to {fresh.who} yourself (DM). QuantEdge keeps only a hash — it cannot show this again; regenerate if it's lost.
          </p>
          {fresh.credential.method === 'link' ? (
            <div className="ah-fresh-row">
              <span className="ah-code">{fresh.credential.link}<span className="ah-sub2">single use · expires {fmtDate(fresh.credential.expiresAt)} · sign-in name {fresh.login}</span></span>
              <div className="ah-acts"><LuxButton onClick={() => void copy((fresh.credential as { link: string }).link, 'Setup link')}>Copy link</LuxButton></div>
            </div>
          ) : (
            <div className="ah-fresh-row">
              <span className="ah-code">{fresh.credential.tempPassword}<span className="ah-sub2">sign in as {fresh.credential.login} · they must set their own password on first sign-in</span></span>
              <div className="ah-acts"><LuxButton onClick={() => void copy((fresh.credential as { tempPassword: string }).tempPassword, 'Temporary password')}>Copy password</LuxButton></div>
            </div>
          )}
          <div className="ah-bar"><LuxButton variant="ghost" onClick={() => setFresh(null)}>Done — hide it</LuxButton></div>
        </div>
      )}

      {!!accounts.length && (
        <div className="ah-scroll" style={{ marginTop: 10 }}>
          <table className="ah-table ah-rows">
            <thead><tr><th>Trader</th><th>Book</th><th>Status</th><th>Link expires</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} data-off={a.status === 'disabled'} data-testid={`row-trader-account-${a.id}`}>
                  <td data-label="Trader">{a.displayName}<span className="ah-sub2">{a.username ? `username ${a.username}` : a.email} · {a.tier}{a.hasBetaAccess ? ' + beta' : ''}</span></td>
                  <td data-label="Book">{a.traderName ?? <span className="ah-mute">not linked</span>}</td>
                  <td data-label="Status"><LuxTag tone={STATUS_TONE[a.status]}>{TRADER_ACCOUNT_STATUS_LABEL[a.status]}</LuxTag></td>
                  <td data-label="Link expires">{a.linkExpiresAt ? fmtDate(a.linkExpiresAt) : '—'}</td>
                  <td data-label="">
                    <div className="ah-acts">
                      {a.status !== 'disabled' && <LuxButton disabled={busy === a.id} onClick={() => void regenerate(a, 'link')} title="A new single-use setup link; every earlier link stops working">
                        {a.status === 'active' ? 'Reset link' : 'Regenerate link'}</LuxButton>}
                      {a.status !== 'disabled' && <LuxButton disabled={busy === a.id} onClick={() => void regenerate(a, 'temp')}>Temp password</LuxButton>}
                      {(a.status === 'setup_pending' || a.status === 'temp_password' || (a.status === 'active' && a.linkExpiresAt)) &&
                        <LuxButton className="ah-danger" disabled={busy === a.id} onClick={() => void revoke(a)}>Revoke</LuxButton>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && !accounts.length && <p className="ah-note">No trader accounts yet.</p>}
    </LuxPanel>
  );
}
