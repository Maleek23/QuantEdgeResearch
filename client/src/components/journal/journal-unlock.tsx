/**
 * Passcode gate for a trader's journal (server: POST /api/journal/traders/:slug/unlock).
 * NEXUS and Quantinum Bot books are never locked; a trader's own linked account
 * and admins never see this. Unlock lasts for the login session.
 */
import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';

export function JournalUnlock({ slug, label, onUnlocked }: { slug: string; label: string; onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/journal/traders/${encodeURIComponent(slug)}/unlock`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j?.error ?? `Unlock failed (${r.status})`); return; }
      setCode('');
      onUnlocked();
    } catch {
      setErr('Network error — try again');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="jr-card" style={{ maxWidth: 420, margin: '32px auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="jr-unlock-h">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Lock className="h-4 w-4" aria-hidden />
        <h2 id="jr-unlock-h" style={{ margin: 0, fontSize: 16 }}>{label}'s journal is private</h2>
      </div>
      <p className="jr-note" style={{ margin: 0 }}>Enter the passcode {label} shared with you. It stays unlocked until you sign out.</p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="jr-unlock-code" className="jr-kpi-l">Passcode</label>
        <input id="jr-unlock-code" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)}
          className="jr-input" style={{ fontSize: 16, minHeight: 44 }} maxLength={128} aria-invalid={!!err} aria-describedby={err ? 'jr-unlock-err' : undefined} />
        <button type="submit" className="jr-btn jr-btn-primary" style={{ minHeight: 44 }} disabled={busy || !code.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Unlock
        </button>
        {err && <p id="jr-unlock-err" role="alert" className="jr-loss" style={{ margin: 0, fontSize: 12 }}>{err}</p>}
      </form>
    </section>
  );
}
