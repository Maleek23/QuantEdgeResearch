/**
 * Journal › Import › Discord forum — every trader's journal thread at once.
 *
 *   bot mode     the server reads the forum with DISCORD_BOT_TOKEN (shown only
 *                when /api/journal/sources says capabilities.discordBot)
 *   export mode  DiscordChatExporter JSON exports of the threads — several
 *                files, or a .zip of them (unzipped here, in the browser)
 *
 * Preview first (nothing written): one row per thread — who it maps to (an
 * existing trader, or a NEW trader the operator must confirm with a name),
 * message counts (new vs already imported), parsed trades with confidence,
 * the review list. "Import" sends only the mapping; the server writes exactly
 * what it previewed. Nothing is ever sent to Discord. Admin only.
 */
import { Fragment, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ExternalLink, FileUp, Loader2, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { readApiError } from '@/lib/journal/use-journal';
import { readZip } from '@/lib/zip-read';

interface PTrade {
  key: string; symbol: string; assetType: string; direction: string; optionType: string | null; strike: number | null; expiry: string | null;
  entryPrice: number; exitPrice: number | null; stop: number | null; target: number | null; status: string;
  entryTime: string; exitTime: string | null; confidence: number; qtyStated: boolean; exitDerivedFromPct: number | null;
}
interface PThread {
  threadId: string; name: string; archived: boolean; source: string;
  messages: number; posts: number; alreadyImported: number; newPosts: number; firstAt: string | null; lastAt: string | null;
  primary: { authorId: string; authorName: string } | null;
  authors: { authorId: string; authorName: string; messages: number }[];
  match: { slug: string; name: string; existing: boolean; via: string } | null;
  parse: { entries: number; exits: number; trims: number; closed: number; open: number; review: number; avgConfidence: number | null };
  trades: PTrade[];
  review: { messageId: string; at: string; reason: string; label: string; excerpt: string; link: string | null }[];
}
interface Preview {
  token: string; expiresAt: string; forum: { id: string | null; name: string | null };
  skipped: { reason: string; count: number }[];
  traders: { slug: string; name: string }[];
  threads: PThread[];
}
interface Choice { slug: string | null; createName: string; confirmed: boolean }
interface CommitResult { threads: { threadId: string; name: string; trader: string; created: boolean; posts: number; tradesNew: number; tradesUpdated: number; tradesUnchanged: number; watchlist: { added: number; updated: number } }[] }

const MAX_TOTAL = 38_000_000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—');
const px = (n: number | null) => (n == null ? '—' : n >= 100 ? n.toFixed(2) : String(Math.round(n * 1000) / 1000));

export function DiscordForumImport({ botAvailable, onDone }: { botAvailable: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<'bot' | 'files'>(botAvailable ? 'bot' : 'files');
  const [forumId, setForumId] = useState('');
  const [busy, setBusy] = useState<'read' | 'preview' | 'commit' | null>(null);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [done, setDone] = useState<CommitResult | null>(null);
  const [fileNote, setFileNote] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const run = async (body: unknown) => {
    setBusy('preview'); setErr(''); setDone(null); setPreview(null);
    try {
      const res = await apiRequest('POST', '/api/journal/discord/forum/preview', body);
      const p: Preview = await res.json();
      setPreview(p);
      const init: Record<string, Choice> = {};
      for (const t of p.threads) {
        init[t.threadId] = t.posts === 0 || !t.match
          ? { slug: null, createName: '', confirmed: false }
          : { slug: t.match.slug, createName: t.match.existing ? '' : t.match.name, confirmed: t.match.existing };
      }
      setChoices(init);
    } catch (e) {
      setErr(await readApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const takeFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy('read'); setErr(''); setFileNote('');
    try {
      const files: { name: string; content: string }[] = [];
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) {
          const entries = await readZip(await f.arrayBuffer(), (n) => /\.json$/i.test(n));
          for (const e of entries) files.push({ name: e.name.split('/').pop() || e.name, content: await e.text() });
        } else if (/\.json$/i.test(f.name)) {
          files.push({ name: f.name, content: await f.text() });
        }
      }
      if (!files.length) throw new Error('No .json thread exports found — export each thread with DiscordChatExporter (format JSON).');
      const total = files.reduce((s, f) => s + f.content.length, 0);
      if (total > MAX_TOTAL) throw new Error(`${(total / 1e6).toFixed(1)}MB of exports — over the 38MB limit. Import the threads in two batches.`);
      setFileNote(`${files.length} thread export${files.length === 1 ? '' : 's'} · ${(total / 1e6).toFixed(1)}MB`);
      setBusy(null);
      await run({ source: 'files', files });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const set = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  const known = useMemo(() => new Set(preview?.traders.map((t) => t.slug) ?? []), [preview]);

  const rows = preview?.threads ?? [];
  const problems = rows.flatMap((t) => {
    const c = choices[t.threadId];
    if (!c?.slug) return [];
    if (!SLUG_RE.test(c.slug)) return [`${t.name}: "${c.slug}" is not a valid slug`];
    if (!known.has(c.slug) && (!c.confirmed || !c.createName.trim())) return [`${t.name}: confirm the new trader "${c.slug}" and give it a name`];
    return [];
  });
  const included = rows.filter((t) => choices[t.threadId]?.slug);

  const commit = async () => {
    if (!preview || problems.length) return;
    setBusy('commit'); setErr('');
    try {
      const threads = rows.map((t) => {
        const c = choices[t.threadId];
        return { threadId: t.threadId, slug: c?.slug ?? null, createName: c?.slug && !known.has(c.slug) ? c.createName.trim() : null };
      });
      const res = await apiRequest('POST', '/api/journal/discord/forum/commit', { token: preview.token, threads });
      setDone(await res.json());
      setPreview(null);
      onDone();
    } catch (e) {
      setErr(await readApiError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="jr-seg" role="group" aria-label="Discord forum source">
        <button type="button" aria-pressed={mode === 'bot'} disabled={!botAvailable} onClick={() => { setMode('bot'); setPreview(null); }}
          title={botAvailable ? 'The server reads the forum with its bot token' : 'No DISCORD_BOT_TOKEN on the server — see docs/DISCORD_IMPORT.md'}>BOT · READ FORUM</button>
        <button type="button" aria-pressed={mode === 'files'} onClick={() => { setMode('files'); setPreview(null); }}>EXPORT FILES</button>
      </div>

      {mode === 'bot' ? (
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); if (forumId) run({ source: 'bot', forumId }); }}>
          <div className="jr-field" style={{ flex: '1 1 240px' }}>
            <label htmlFor="jr-forum-id">Forum channel id</label>
            <input id="jr-forum-id" className="jr-input" inputMode="numeric" placeholder="right-click the forum › Copy Channel ID" value={forumId}
              onChange={(e) => setForumId(e.target.value.replace(/\D/g, ''))} />
          </div>
          <button type="submit" className="jr-btn" disabled={!!busy || forumId.length < 15}>
            {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin" />} Read forum
          </button>
          {busy === 'preview' && <span className="jr-n">Reading every thread (rate-limited — ~1,300 messages take about a minute)…</span>}
        </form>
      ) : (
        <div className="jr-dropzone" role="button" tabIndex={0} aria-busy={!!busy}
          aria-label="Choose DiscordChatExporter JSON exports of the forum's threads, or a zip of them"
          onClick={() => !busy && input.current?.click()}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (!busy) takeFiles(e.dataTransfer.files); }}>
          {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <FileUp className="mx-auto h-6 w-6" />}
          <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--text)' }}>
            {busy === 'read' ? 'Unpacking…' : busy === 'preview' ? 'Parsing threads…' : fileNote || 'Drop the thread exports (.json, several) or one .zip of them'}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 2 }}>DiscordChatExporter, format JSON, one file per thread. Parsed on the server for a preview — nothing is saved until you confirm.</div>
          <input ref={input} type="file" multiple accept=".json,.zip,application/json,application/zip" hidden onChange={(e) => { takeFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      {err && <div className="jr-err" role="alert"><div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}><X className="h-4 w-4" /> Nothing was imported</div>{err}</div>}

      {done && (
        <div className="jr-ok" role="status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Check className="h-4 w-4" /> Imported {done.threads.length} thread{done.threads.length === 1 ? '' : 's'}</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {done.threads.map((t) => (
              <li key={t.threadId}><b>{t.trader}</b>{t.created ? ' (new trader)' : ''} — {t.posts} posts in the Notebook · {t.tradesNew} new / {t.tradesUpdated} updated trades · watchlist +{t.watchlist.added}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
          <div className="jr-stats">
            <div><span>Threads</span><b>{rows.length}</b><small>{preview.forum.name ? `#${preview.forum.name}` : 'from the exports'}</small></div>
            <div><span>Posts</span><b>{rows.reduce((s, t) => s + t.posts, 0)}</b><small>{rows.reduce((s, t) => s + t.newPosts, 0)} not yet imported</small></div>
            <div><span>Parsed trades</span><b>{rows.reduce((s, t) => s + t.parse.closed + t.parse.open, 0)}</b><small>{rows.reduce((s, t) => s + t.parse.closed, 0)} closed · {rows.reduce((s, t) => s + t.parse.open, 0)} open</small></div>
            <div><span>For review</span><b>{rows.reduce((s, t) => s + t.parse.review, 0)}</b><small>trade-looking, not parsed</small></div>
          </div>
          {preview.skipped.length > 0 && <p className="jr-note" style={{ margin: 0 }}>Skipped: {preview.skipped.map((s) => `${s.count} ${s.reason}`).join(' · ')}</p>}

          <div className="jr-preview">
            <table className="jr-table">
              <thead><tr>
                <th scope="col" aria-label="Details" />
                <th scope="col">Thread</th><th scope="col">Trader book</th>
                <th scope="col" className="num">Posts</th><th scope="col" className="num">Trades</th><th scope="col" className="num">Review</th><th scope="col" className="num">Conf.</th>
              </tr></thead>
              <tbody>
                {rows.map((t) => {
                  const c = choices[t.threadId] ?? { slug: null, createName: '', confirmed: false };
                  const isNew = !!c.slug && !known.has(c.slug);
                  const open = expanded === t.threadId;
                  return (
                    <Fragment key={t.threadId}>
                      <tr style={{ cursor: 'default', verticalAlign: 'top' }}>
                        <td>
                          <button type="button" className="jr-icon-btn" style={{ width: 24, height: 24 }} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} parsed trades and review items for ${t.name}`}
                            onClick={() => setExpanded(open ? null : t.threadId)}>{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                        </td>
                        <td style={{ whiteSpace: 'normal', minWidth: 180 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                          <div className="jr-n">{t.primary ? `by ${t.primary.authorName}` : 'no author'} · {day(t.firstAt)} → {day(t.lastAt)}{t.archived ? ' · archived' : ''}</div>
                        </td>
                        <td style={{ minWidth: 200 }}>
                          <select className="jr-select" aria-label={`Trader book for ${t.name}`} value={c.slug == null ? '' : known.has(c.slug) ? c.slug : '__new'}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') set(t.threadId, { slug: null });
                              else if (v === '__new') set(t.threadId, { slug: t.match && !t.match.existing ? t.match.slug : '', createName: t.match && !t.match.existing ? t.match.name : '', confirmed: false });
                              else set(t.threadId, { slug: v, confirmed: true });
                            }}>
                            <option value="">Skip this thread</option>
                            {preview.traders.map((x) => <option key={x.slug} value={x.slug}>{x.name} ({x.slug})</option>)}
                            <option value="__new">New trader…</option>
                          </select>
                          {isNew && (
                            <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <input className="jr-input" aria-label="New trader slug" style={{ width: 96 }} value={c.slug ?? ''} placeholder="slug"
                                  onChange={(e) => set(t.threadId, { slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''), confirmed: false })} />
                                <input className="jr-input" aria-label="New trader name" style={{ flex: 1, minWidth: 0 }} value={c.createName} placeholder="Name"
                                  onChange={(e) => set(t.threadId, { createName: e.target.value, confirmed: false })} />
                              </div>
                              <label className="jr-n" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input type="checkbox" checked={c.confirmed} onChange={(e) => set(t.threadId, { confirmed: e.target.checked })} /> create trader “{c.createName || c.slug}”
                              </label>
                            </div>
                          )}
                          {!isNew && c.slug && t.match?.existing && t.match.slug === c.slug && <div className="jr-n">matched by {t.match.via}</div>}
                        </td>
                        <td className="num">{t.posts}<div className="jr-n">{t.alreadyImported ? `${t.newPosts} new` : 'all new'}</div></td>
                        <td className="num">{t.parse.closed + t.parse.open}<div className="jr-n">{t.parse.closed} closed · {t.parse.open} open</div></td>
                        <td className="num">{t.parse.review}</td>
                        <td className="num">{t.parse.avgConfidence == null ? '—' : `${Math.round(t.parse.avgConfidence * 100)}%`}</td>
                      </tr>
                      {open && (
                        <tr style={{ cursor: 'default' }}>
                          <td />
                          <td colSpan={6} style={{ whiteSpace: 'normal' }}>
                            {t.trades.length ? (
                              <table className="jr-table" style={{ fontSize: 12 }}>
                                <thead><tr><th scope="col">Posted</th><th scope="col">Call</th><th scope="col" className="num">Entry</th><th scope="col" className="num">Exit</th><th scope="col" className="num">Stop / target</th><th scope="col">Status</th><th scope="col" className="num">Conf.</th></tr></thead>
                                <tbody>
                                  {t.trades.map((x) => (
                                    <tr key={x.key} style={{ cursor: 'default' }}>
                                      <td>{day(x.entryTime)}</td>
                                      <td><span className="jr-sym">{x.symbol}</span> {x.assetType === 'option' ? `${x.strike ?? '?'}${x.optionType === 'put' ? 'P' : 'C'} ${x.expiry ?? 'no expiry'}` : x.direction}{x.qtyStated ? '' : ' · size not stated'}</td>
                                      <td className="num">{px(x.entryPrice)}</td>
                                      <td className="num">{x.exitPrice == null ? '—' : px(x.exitPrice)}{x.exitDerivedFromPct != null ? ` (from ${x.exitDerivedFromPct}%)` : ''}</td>
                                      <td className="num">{px(x.stop)} / {px(x.target)}</td>
                                      <td>{x.status === 'open' ? 'open — no exit posted' : 'closed'}</td>
                                      <td className="num">{Math.round(x.confidence * 100)}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : <p className="jr-note" style={{ margin: 0 }}>No trades parsed from {t.primary?.authorName ?? 'this thread'}'s messages. Every message is still imported to the Notebook.</p>}
                            {t.trades.length > 0 && <p className="jr-n" style={{ margin: '4px 0' }}>Latest {t.trades.length} of {t.parse.closed + t.parse.open} shown. P&amp;L is booked only where both entry and exit were posted; open calls stay open.</p>}
                            {t.review.length > 0 && (
                              <>
                                <div style={{ fontWeight: 600, marginTop: 8 }}>Review list ({t.parse.review})</div>
                                <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                                  {t.review.map((r) => (
                                    <li key={r.messageId}><span className="jr-n">{day(r.at)} · {r.label}</span> — {r.excerpt}{r.link && <> <a href={r.link} target="_blank" rel="noreferrer noopener" aria-label="Open in Discord"><ExternalLink className="inline h-3 w-3" /></a></>}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {problems.length > 0 && <div className="jr-err" role="alert">{problems.map((p) => <div key={p}>{p}</div>)}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="jr-btn jr-btn-primary" disabled={!!busy || !included.length || problems.length > 0} onClick={commit}>
              {busy === 'commit' && <Loader2 className="h-4 w-4 animate-spin" />}
              {included.length ? `Import ${included.length} thread${included.length === 1 ? '' : 's'}` : 'Pick at least one thread'}
            </button>
            <button type="button" className="jr-btn" disabled={!!busy} onClick={() => setPreview(null)}>Discard preview</button>
            <span className="jr-n">Posts → each trader's Notebook · trades → their journal · tickers → their watchlist. Re-importing updates, never duplicates.</span>
          </div>
        </div>
      )}
    </div>
  );
}
