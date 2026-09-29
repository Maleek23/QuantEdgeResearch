/**
 * Discord → a trader's WATCHLIST (not their journal — traders keep their own
 * journal once they have accounts). Upload a DiscordChatExporter export (or
 * read the channel with the server's bot token), review the tickers they
 * posted — mentions, last mention, their latest call as a note — then confirm.
 * Nothing is saved until "Add". Re-importing refreshes notes; one row per
 * ticker. Nothing is ever sent to Discord. Setup: docs/DISCORD_IMPORT.md.
 */
import { useCallback, useRef, useState } from 'react';
import { Check, FileUp, Loader2, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { readApiError } from '@/lib/journal/use-journal';
import '@/styles/journal.css';

interface Candidate { symbol: string; mentions: number; lastAt: string; note: string; state: 'new' | 'update' | 'unchanged' }
interface Preview {
  token: string; expiresAt: string; format: string; channel: string | null;
  authors: { authorId: string; authorName: string; messages: number }[];
  selectedAuthorId: string | null;
  stats: { messages: number; entries: number; exits: number; trims: number; notes: number; ignored: number; closedTrades: number; openTrades: number };
  skipped: { reason: string; count: number }[];
  counts: { symbolsNew: number; symbolsUpdated: number; symbolsUnchanged: number; alreadyOnList: number };
  candidates: Candidate[];
}

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
  const [done, setDone] = useState<{ added: number; updated: number } | null>(null);
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
      setDone({ added: r.added, updated: r.updated });
      setPreview(null);
      onDone();
    } catch (e) {
      setErr(await readApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const writes = preview ? preview.counts.symbolsNew + preview.counts.symbolsUpdated : 0;

  return (
    <div className="jr" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Check className="h-4 w-4" /> Added to {traderName}'s watchlist</div>
          {done.added} new ticker{done.added === 1 ? '' : 's'}, {done.updated} note{done.updated === 1 ? '' : 's'} refreshed.
        </div>
      )}

      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
          <div className="jr-stats">
            <div><span>Messages read</span><b>{preview.stats.messages}</b><small>{preview.channel ?? preview.format}</small></div>
            <div><span>Tickers found</span><b>{preview.candidates.length}</b><small>{preview.stats.entries} calls · {preview.stats.notes} analysis posts</small></div>
            <div><span>Will add</span><b>{preview.counts.symbolsNew}</b><small>{preview.counts.symbolsUpdated} notes refreshed · {preview.counts.symbolsUnchanged} unchanged</small></div>
            <div><span>On the list now</span><b>{preview.counts.alreadyOnList}</b><small>{preview.stats.ignored} chatter skipped</small></div>
          </div>

          {preview.authors.length > 1 && (
            <div className="jr-field">
              <label htmlFor="jr-dc-author">Whose calls?</label>
              <select id="jr-dc-author" className="jr-select" value={preview.selectedAuthorId ?? ''} disabled={!!busy}
                onChange={(e) => run({ authorId: e.target.value || null })}>
                <option value="">Everyone in the export ({preview.authors.reduce((s, a) => s + a.messages, 0)} messages)</option>
                {preview.authors.map((a) => <option key={a.authorId} value={a.authorId}>{a.authorName} — {a.messages} messages</option>)}
              </select>
              <span className="jr-note" style={{ marginTop: 0 }}>Shared channels mix people — pick {traderName} so only their calls land on the list.</span>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <p className="jr-note" style={{ margin: 0 }}>Skipped: {preview.skipped.map((s) => `${s.count} ${s.reason}`).join(' · ')}</p>
          )}

          {preview.candidates.length > 0 ? (
            <div className="jr-preview">
              <table className="jr-table">
                <thead><tr><th scope="col">State</th><th scope="col">Ticker</th><th scope="col" className="num">Mentions</th><th scope="col">Latest call / note</th></tr></thead>
                <tbody>
                  {preview.candidates.map((c) => (
                    <tr key={c.symbol} style={{ cursor: 'default' }}>
                      <td><span className={`jr-state ${c.state}`}>{c.state}</span></td>
                      <td><span className="jr-sym">{c.symbol}</span></td>
                      <td className="num">{c.mentions}</td>
                      <td style={{ whiteSpace: 'normal' }}><span className="jr-n">{c.note}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="jr-note" style={{ margin: 0 }}>No tickers found in these messages. Calls like "BE 300c 10/2 @1.00" or "$NVDA" are picked up — see docs/DISCORD_IMPORT.md.</p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="jr-btn jr-btn-primary" disabled={!!busy || writes === 0} onClick={commit}>
              {busy === 'commit' && <Loader2 className="h-4 w-4 animate-spin" />}
              {writes === 0 ? 'Nothing new to add' : `Add to ${traderName}'s watchlist`}
            </button>
            <button type="button" className="jr-btn" disabled={!!busy} onClick={() => setPreview(null)}>Discard preview</button>
            <span className="jr-n">One row per ticker · the note is their most recent call</span>
          </div>
        </div>
      )}
    </div>
  );
}
