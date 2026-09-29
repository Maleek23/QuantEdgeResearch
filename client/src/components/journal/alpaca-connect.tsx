/**
 * Connect broker — read-only Alpaca import into your journal.
 * Keys are sent once, verified with a read-only account call, sealed server-side
 * (AES-256-GCM) and never shown again: the page only ever sees the last four
 * characters of the key id. Sync pairs your fills into round trips; re-syncing
 * updates the same rows and keeps your notes and tags.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Link2, Loader2, RefreshCw, Unlink, X } from 'lucide-react';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { apiRequest } from '@/lib/queryClient';
import { readApiError } from '@/lib/journal/use-journal';

interface SyncResult { fills: number; trips: number; created: number; updated: number; unchanged: number; open: number; closed: number; account: string; source: string; at: string; error?: string }
interface Status {
  connection: { paper: boolean; keyHint: string | null; lastSyncAt: string | null; lastSyncResult: SyncResult | null; connectedAt: string } | null;
  canStoreKeys: boolean;
  serverAccount: { paper: boolean } | null;
}

const KEY = ['journal-broker-alpaca'] as const;

export function AlpacaConnect({ onSynced }: { onSynced: () => void }) {
  const qc = useQueryClient();
  const q = useQuery<Status>({
    queryKey: KEY,
    queryFn: async () => {
      const r = await fetch('/api/journal/broker/alpaca', { credentials: 'include' });
      if (!r.ok) throw new Error(`Alpaca status failed (${r.status})`);
      return r.json();
    },
  });
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [paper, setPaper] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'sync' | 'server' | 'disconnect' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const syncText = (r: SyncResult) =>
    `${r.trips} round trips from ${r.fills} fills (${r.account}) — ${r.created} new, ${r.updated} updated, ${r.unchanged} unchanged · ${r.closed} closed, ${r.open} open.`;

  const act = async (kind: NonNullable<typeof busy>) => {
    setBusy(kind); setMsg(null);
    try {
      if (kind === 'connect') {
        await apiRequest('POST', '/api/journal/broker/alpaca', { keyId: keyId.trim(), secretKey: secret.trim(), paper });
        setKeyId(''); setSecret('');
        setMsg({ ok: true, text: 'Connected. Keys are stored encrypted and will not be shown again.' });
      } else if (kind === 'disconnect') {
        await apiRequest('DELETE', '/api/journal/broker/alpaca');
        setMsg({ ok: true, text: 'Disconnected — stored keys deleted. Imported trades stay in your journal.' });
      } else {
        const res = await apiRequest('POST', '/api/journal/broker/alpaca/sync', kind === 'server' ? { account: 'server' } : {});
        const r = (await res.json()) as SyncResult;
        setMsg({ ok: true, text: syncText(r) });
        onSynced();
      }
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      setMsg({ ok: false, text: await readApiError(e) });
    } finally {
      setBusy(null);
    }
  };

  if (q.isError) return <QEError title="Alpaca connection status didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (q.isLoading || !q.data) return <QELoading rows={1} />;
  const { connection: c, canStoreKeys, serverAccount } = q.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="jr-note" style={{ margin: 0 }}>
        Read-only: QuantEdge calls only Alpaca's account and fill-history endpoints — it never places, changes or cancels an order.
        Alpaca keys themselves can trade, so paper keys are the safer choice while you try this.
      </p>

      {c ? (
        <div className="jr-stats">
          <div><span>Alpaca</span><b>{c.paper ? 'Paper' : 'Live'}</b><small>key …{c.keyHint ?? '—'}</small></div>
          <div><span>Last sync</span><b style={{ fontSize: 13 }}>{c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'}</b>
            <small>{c.lastSyncResult ? (c.lastSyncResult.error ? `failed: ${c.lastSyncResult.error}` : `${c.lastSyncResult.trips} trips · n=${c.lastSyncResult.fills} fills`) : '—'}</small></div>
        </div>
      ) : canStoreKeys ? (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} autoComplete="off" onSubmit={(e) => { e.preventDefault(); act('connect'); }}>
          <div className="jr-form-grid">
            <div className="jr-field">
              <label htmlFor="jr-alp-key">API key id</label>
              <input id="jr-alp-key" className="jr-input" autoComplete="off" spellCheck={false} value={keyId} onChange={(e) => setKeyId(e.target.value)} />
            </div>
            <div className="jr-field">
              <label htmlFor="jr-alp-secret">Secret key</label>
              <input id="jr-alp-secret" type="password" className="jr-input" autoComplete="new-password" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="jr-seg" role="group" aria-label="Alpaca account type">
              <button type="button" aria-pressed={paper} onClick={() => setPaper(true)}>PAPER</button>
              <button type="button" aria-pressed={!paper} onClick={() => setPaper(false)}>LIVE</button>
            </div>
            <button type="submit" className="jr-btn jr-btn-primary" disabled={!!busy || keyId.trim().length < 8 || secret.trim().length < 8}>
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect Alpaca
            </button>
          </div>
        </form>
      ) : (
        <p className="jr-note" style={{ margin: 0 }}>Saving personal broker keys isn't enabled on this server yet — the operator needs to set <code>BROKER_CREDENTIALS_KEY</code>. Broker CSV import above works today.</p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {c && (
          <>
            <button type="button" className="jr-btn jr-btn-primary" disabled={!!busy} onClick={() => act('sync')}>
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync fills now
            </button>
            <button type="button" className="jr-btn jr-btn-danger" disabled={!!busy} onClick={() => act('disconnect')}>
              {busy === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />} Disconnect
            </button>
          </>
        )}
        {serverAccount && (
          <button type="button" className="jr-btn" disabled={!!busy} onClick={() => act('server')}
            title="Operator only: the Alpaca account configured on the server (ALPACA_API_KEY)">
            {busy === 'server' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync server account ({serverAccount.paper ? 'paper' : 'live'}) into my journal
          </button>
        )}
      </div>

      {msg && (
        <div className={msg.ok ? 'jr-ok' : 'jr-err'} role={msg.ok ? 'status' : 'alert'}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{msg.ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}{msg.text}</span>
        </div>
      )}
    </div>
  );
}
