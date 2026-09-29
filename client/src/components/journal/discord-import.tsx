/**
 * Discord → trader journal: upload a DiscordChatExporter export (or read the
 * channel with the server's bot token), review exactly what will be written,
 * then confirm. Nothing is saved until "Import". Re-importing the same history
 * updates the same rows (keys are Discord message ids). Nothing is ever sent to
 * Discord. Setup: docs/DISCORD_IMPORT.md.
 */
import { useCallback, useRef, useState } from 'react';
import { Check, FileUp, Loader2, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { fmtMoney, fmtPrice } from '@/lib/journal/metrics';
import { readApiError } from '@/lib/journal/use-journal';
import { Pnl } from './parts';

interface PreviewTrade {
  key: string; symbol: string; assetType: string; optionType: string | null; strikePrice: number | null; expiryDate: string | null;
  direction: string; quantity: number; qtyStated: boolean; entryPrice: number; entryTime: string; exitPrice: number | null;
  exitTime: string | null; status: string; realizedPnL: number | null; flags: string[]; state: 'new' | 'update' | 'unchanged';
}
interface PreviewNote { messageId: string; day: string; symbols: string[]; body: string; reason: string; state: string; attachments: { url: string; name: string }[] }
interface Preview {
  token: string; expiresAt: string; format: string; channel: string | null;
  authors: { authorId: string; authorName: string; messages: number }[];
  selectedAuthorId: string | null;
  stats: { messages: number; entries: number; exits: number; trims: number; notes: number; ignored: number; closedTrades: number; openTrades: number };
  skipped: { reason: string; count: number }[];
  counts: { tradesNew: number; tradesUpdated: number; tradesUnchanged: number; notesNew: number; notesUnchanged: number };
  trades: PreviewTrade[];
  notes: PreviewNote[];
}

const REASON: Record<string, string> = {
  analysis: 'analysis',
  unmatched_exit: 'exit with no open entry',
  unpriced_exit: 'closed without price',
  entry_without_price: 'entry without price',
};

const MAX_BYTES = 11_000_000;

export function DiscordImport({ traderSlug, traderName, botAvailable, onDone }: {
  traderSlug: string;
  traderName: string;
  botAvailable: boolean;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'file' | 'bot'>('file');
  const [content, setContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number; notesCreated: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = useCallback(async (opts: { content?: string | null; authorId?: string | null } = {}) => {
    setBusy('preview'); setErr(''); setDone(null);
    try {
      const body = mode === 'file'
        ? { trader: traderSlug, source: 'file', content: opts.content ?? content, authorId: opts.authorId ?? null }
        : { trader: traderSlug, source: 'bot', channelId: channelId.trim() || undefined, authorId: opts.authorId ?? null };
      const res = await apiRequest('POST', '/api/journal/discord/preview', body);
      setPreview(await res.json());
    } catch (e) {
      setPreview(null);
      setErr(await readApiError(e));
    } finally {
      setBusy(null);
    }
  }, [mode, traderSlug, content, channelId]);

  const takeFile = async (file?: File | null) => {
    if (!file) return;
    if (!/\.(json|csv)$/i.test(file.name)) { setErr('Upload the .json or .csv file DiscordChatExporter produced.'); return; }
    if (file.size > MAX_BYTES) { setErr('That export is over 11MB — export a date range (DiscordChatExporter --after/--before) and import each part.'); return; }
    const text = await file.text();
    setContent(text);
    setFileName(file.name);
    run({ content: text });
  };

  const commit = async () => {
    if (!preview) return;
    setBusy('commit'); setErr('');
    try {
      const res = await apiRequest('POST', '/api/journal/discord/commit', { token: preview.token, trader: traderSlug });
      const r = await res.json();
      setDone({ created: r.created, updated: r.updated, notesCreated: r.notesCreated });
      setPreview(null);
      onDone();
    } catch (e) {
      setErr(await readApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const writes = preview ? preview.counts.tradesNew + preview.counts.tradesUpdated + preview.counts.notesNew : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="jr-seg" role="group" aria-label="Discord source">
        <button type="button" aria-pressed={mode === 'file'} onClick={() => { setMode('file'); setPreview(null); }}>EXPORT FILE</button>
        <button type="button" aria-pressed={mode === 'bot'} onClick={() => { setMode('bot'); setPreview(null); }} disabled={!botAvailable}
          title={botAvailable ? 'Read the channel with the server bot token' : 'No DISCORD_BOT_TOKEN on the server — see docs/DISCORD_IMPORT.md'}>BOT TOKEN</button>
      </div>

      {mode === 'file' ? (
        <div
          className="jr-dropzone" role="button" tabIndex={0} data-drag={drag} aria-busy={busy === 'preview'}
          aria-label="Choose or drop a DiscordChatExporter JSON or CSV export"
          onClick={() => !busy && input.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); takeFile(e.dataTransfer.files[0]); }}
        >
          {busy === 'preview' ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <FileUp className="mx-auto h-6 w-6" />}
          <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--text)' }}>{busy === 'preview' ? 'Reading the channel…' : fileName || 'Drop a DiscordChatExporter export (JSON or CSV)'}</div>
          <div style={{ fontSize: 11.5, marginTop: 2 }}>Parsed on the server for a preview — nothing is saved until you confirm.</div>
          <input ref={input} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="jr-field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="jr-dc-channel">Channel id</label>
            <input id="jr-dc-channel" className="jr-input" inputMode="numeric" placeholder={`blank = ${traderName}'s saved channel`} value={channelId} onChange={(e) => setChannelId(e.target.value.replace(/\D/g, ''))} />
          </div>
          <button type="button" className="jr-btn" disabled={!!busy} onClick={() => run()}>
            {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin" />} Read channel
          </button>
        </div>
      )}

      {err && <div className="jr-err" role="alert"><div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}><X className="h-4 w-4" /> Nothing was imported</div>{err}</div>}
      {done && (
        <div className="jr-ok" role="status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Check className="h-4 w-4" /> Imported into {traderName}'s journal</div>
          {done.created} new trade{done.created === 1 ? '' : 's'}, {done.updated} updated, {done.notesCreated} note{done.notesCreated === 1 ? '' : 's'}.
        </div>
      )}

      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
          <div className="jr-stats">
            <div><span>Messages read</span><b>{preview.stats.messages}</b><small>{preview.channel ?? preview.format}</small></div>
            <div><span>Trades</span><b>{preview.trades.length}</b><small>{preview.stats.closedTrades} closed · {preview.stats.openTrades} open</small></div>
            <div><span>Will write</span><b>{preview.counts.tradesNew + preview.counts.tradesUpdated} trades</b><small>{preview.counts.tradesNew} new · {preview.counts.tradesUpdated} updated · {preview.counts.tradesUnchanged} already here</small></div>
            <div><span>Notes</span><b>{preview.counts.notesNew} new</b><small>{preview.counts.notesUnchanged} already here · {preview.stats.ignored} chatter skipped</small></div>
          </div>

          {preview.authors.length > 1 && (
            <div className="jr-field">
              <label htmlFor="jr-dc-author">Whose calls?</label>
              <select id="jr-dc-author" className="jr-select" value={preview.selectedAuthorId ?? ''} disabled={!!busy}
                onChange={(e) => run({ authorId: e.target.value || null })}>
                <option value="">Everyone in the export ({preview.authors.reduce((s, a) => s + a.messages, 0)} messages)</option>
                {preview.authors.map((a) => <option key={a.authorId} value={a.authorId}>{a.authorName} — {a.messages} messages</option>)}
              </select>
              <span className="jr-note" style={{ marginTop: 0 }}>Shared channels mix people — pick {traderName} so only their calls become trades.</span>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <p className="jr-note" style={{ margin: 0 }}>Skipped: {preview.skipped.map((s) => `${s.count} ${s.reason}`).join(' · ')}</p>
          )}

          {preview.trades.length > 0 && (
            <div className="jr-preview">
              <table className="jr-table">
                <thead><tr><th scope="col">State</th><th scope="col">Trade</th><th scope="col" className="num jr-desktop-only">Entry → exit</th><th scope="col" className="num">P&amp;L</th></tr></thead>
                <tbody>
                  {preview.trades.map((t) => (
                    <tr key={t.key} style={{ cursor: 'default' }} title={t.flags.join('\n')}>
                      <td><span className={`jr-state ${t.state}`}>{t.state}</span></td>
                      <td>
                        <span className="jr-sym">{t.symbol}</span>{' '}
                        {t.assetType === 'option' && <span className="jr-chip opt">{t.strikePrice}{(t.optionType ?? '').charAt(0).toUpperCase()} {t.expiryDate?.slice(5) ?? 'no exp'}</span>}
                        <div className="jr-n">{new Date(t.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} · {t.direction} · {t.quantity}{t.qtyStated ? '' : ' (size not stated)'}{t.flags.length ? ` · ${t.flags.length} note${t.flags.length === 1 ? '' : 's'}` : ''}</div>
                        <div className="jr-n jr-phone-only">{fmtPrice(t.entryPrice)} → {t.exitPrice != null ? fmtPrice(t.exitPrice) : 'open'}</div>
                      </td>
                      <td className="num jr-desktop-only">{fmtPrice(t.entryPrice)} → {t.exitPrice != null ? fmtPrice(t.exitPrice) : 'open'}</td>
                      <td className="num">{t.status === 'open' ? <span className="jr-dim">open</span> : <Pnl value={t.realizedPnL} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.notes.length > 0 && (
            <details className="jr-details">
              <summary className="jr-dim" style={{ fontSize: 12 }}>{preview.counts.notesNew + preview.counts.notesUnchanged} notes (analysis posts, unpaired exits) — show newest</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
                {preview.notes.slice(-40).reverse().map((n) => (
                  <div key={n.messageId} className="jr-note-item">
                    <div className="h"><span className={`jr-state ${n.state}`}>{n.state}</span>{n.day}<span className="jr-tag">{REASON[n.reason] ?? n.reason}</span>{n.symbols.slice(0, 4).map((s) => <span key={s} className="jr-chip">{s}</span>)}</div>
                    <div className="b">{n.body}</div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {preview.trades.length === 0 && preview.notes.length === 0 && (
            <p className="jr-note" style={{ margin: 0 }}>No trades or notes found in these messages. If entries look like "BE 300c 10/2 @1.00" and still didn't parse, check the grammar in docs/DISCORD_IMPORT.md.</p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="jr-btn jr-btn-primary" disabled={!!busy || writes === 0} onClick={commit}>
              {busy === 'commit' && <Loader2 className="h-4 w-4 animate-spin" />}
              {writes === 0 ? 'Nothing new to import' : `Import into ${traderName}'s journal`}
            </button>
            <button type="button" className="jr-btn" disabled={!!busy} onClick={() => setPreview(null)}>Discard preview</button>
            <span className="jr-n">P&amp;L shown at stated size; {fmtMoney(preview.trades.reduce((s, t) => s + (t.realizedPnL ?? 0), 0))} closed total</span>
          </div>
        </div>
      )}
    </div>
  );
}
