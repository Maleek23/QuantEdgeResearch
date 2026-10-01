/**
 * Journal › Import › Discord forum — every trader's journal thread at once.
 *
 *   bot mode     the server reads the forum with DISCORD_BOT_TOKEN (shown only
 *                when /api/journal/sources says capabilities.discordBot)
 *   export mode  DiscordChatExporter JSON exports of the threads — several
 *                files, or a .zip of them (unzipped here, in the browser)
 *
 * Preview first (nothing written, no model called): one row per thread — the
 * book it maps to (Mine for the operator's own thread — malik = leek; an
 * existing trader; a known trader such as Ayo; or a NEW trader to confirm),
 * message counts, screenshots to read with the estimated cost, parsed trades,
 * the review list. "Import" sends only the mapping and starts a background job
 * on the server: screenshots are read by the vision model (progress polled
 * here: images done / total, trades found), then every thread is written.
 * Nothing is ever sent to Discord. Admin only.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  /** The main author resolved for the mapped book (stored id, name match, most posts; the creator only breaks ties). */
  primary: { authorId: string; authorName: string; via: string; share: number; creatorId: string | null } | null;
  /** Top authors, each with what Import would read/parse if picked as the main author. */
  authors: PAuthor[];
  match: { slug: string; name: string; existing: boolean; via: string; book: 'mine' | 'trader'; confirm: boolean } | null;
  images: number; imagesCached: number;
  parse: { entries: number; exits: number; trims: number; closed: number; open: number; review: number; avgConfidence: number | null };
  trades: PTrade[];
  review: { messageId: string; at: string; reason: string; label: string; excerpt: string; link: string | null }[];
}
interface PParse { entries: number; exits: number; trims: number; closed: number; open: number; review: number; avgConfidence: number | null }
interface PAuthor { authorId: string; authorName: string; messages: number; images: number; imagesCached: number; parse: PParse }
interface Preview {
  token: string; expiresAt: string; forum: { id: string | null; name: string | null };
  skipped: { reason: string; count: number }[];
  traders: { slug: string; name: string; pending: boolean }[];
  mine: { slug: string; label: string; aliases: string[] };
  vision: {
    provider: string | null; model: string | null; cap: number; note: string;
    estimate: { images: number; billable: number; cached: number; cap: number; perImageUsd: number; usd: number; model: string; basis: string };
  };
  threads: PThread[];
}
/** authorId null = the server's resolved main author (preview `primary`). */
interface Choice { slug: string | null; createName: string; confirmed: boolean; authorId: string | null }
interface ThreadResult {
  threadId: string; name: string; book: 'mine' | 'trader'; trader: string; created: boolean; posts: number;
  author: { id: string; name: string; via: string } | null; handleChange: { from: string | null; to: string } | null;
  tradesNew: number; tradesUpdated: number; tradesUnchanged: number; tradesRemoved: number; tradesLinked: number; tradesFlagged: number;
  fromScreenshots: number; review: number; watchlist: { added: number; updated: number } | null;
}
interface Job {
  id: string; status: 'running' | 'done' | 'failed'; phase: string; startedAt: string; finishedAt: string | null; error: string | null;
  threads: { done: number; total: number };
  vision: { total: number; done: number; cached: number; called: number; failed: number; skippedBudget: number; lowConfidence: number; tradesFound: number; retries: number; usd: number; provider: string | null; model: string | null; cap: number };
  results: ThreadResult[];
}

const MAX_TOTAL = 38_000_000;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const VIA_LABEL: Record<string, string> = {
  override: 'your pick', stored_id: "matches the trader's saved Discord id", name: 'name matches the trader',
  dominant: 'wrote the most messages', creator_tiebreak: 'tied on messages, thread creator', only: 'only author',
};
/** The author whose messages are the journal for this thread (the operator's pick, else the server's). */
const chosenAuthor = (t: PThread, c: Choice | undefined): PAuthor | null => {
  const id = c?.authorId ?? t.primary?.authorId ?? null;
  return t.authors.find((a) => a.authorId === id) ?? null;
};
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
  const [job, setJob] = useState<Job | null>(null);
  const [fileNote, setFileNote] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const run = async (body: unknown) => {
    setBusy('preview'); setErr(''); setJob(null); setPreview(null);
    try {
      const res = await apiRequest('POST', '/api/journal/discord/forum/preview', body);
      const p: Preview = await res.json();
      setPreview(p);
      const init: Record<string, Choice> = {};
      for (const t of p.threads) {
        // Pre-selected; confirmed only where the mapping is certain (Mine, existing traders, Ayo…).
        // Tommi/Teejay and any NEW trader wait for the operator's tick.
        init[t.threadId] = t.posts === 0 || !t.match
          ? { slug: null, createName: '', confirmed: false, authorId: null }
          : { slug: t.match.slug, createName: t.match.existing ? '' : t.match.name, confirmed: !t.match.confirm, authorId: null };
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
  const known = useMemo(() => new Set([...(preview?.traders.map((t) => t.slug) ?? []), ...(preview ? [preview.mine.slug] : [])]), [preview]);
  const pending = useMemo(() => new Set(preview?.traders.filter((t) => t.pending).map((t) => t.slug) ?? []), [preview]);
  const needsTick = (t: PThread, c: Choice | undefined) => !!c?.slug && !!t.match?.confirm && known.has(c.slug) && c.slug === t.match.slug;

  const rows = preview?.threads ?? [];
  const problems = rows.flatMap((t) => {
    const c = choices[t.threadId];
    if (!c?.slug) return [];
    if (!SLUG_RE.test(c.slug)) return [`${t.name}: "${c.slug}" is not a valid slug`];
    if (!known.has(c.slug) && (!c.confirmed || !c.createName.trim())) return [`${t.name}: confirm the new trader "${c.slug}" and give it a name`];
    if (needsTick(t, c) && !c.confirmed) return [`${t.name}: confirm it goes to ${t.match!.name}'s book (or pick another / skip)`];
    return [];
  });
  // Exact screenshots Import would read: the CHOSEN main author's images in each selected thread.
  const imagesFor = (t: PThread) => {
    const a = chosenAuthor(t, choices[t.threadId]);
    return a ? { images: a.images, cached: a.imagesCached } : { images: t.images, cached: t.imagesCached };
  };
  const selectedImages = rows.filter((t) => choices[t.threadId]?.slug).reduce((s, t) => { const i = imagesFor(t); return { images: s.images + i.images, cached: s.cached + i.cached }; }, { images: 0, cached: 0 });
  const est = preview ? (() => {
    const billable = Math.min(Math.max(0, selectedImages.images - selectedImages.cached), preview.vision.cap);
    return { billable, usd: Math.round(billable * preview.vision.estimate.perImageUsd * 100) / 100 };
  })() : null;

  // Poll the running import job.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let stop = false;
    const id = window.setTimeout(async () => {
      try {
        const r = await apiRequest('GET', `/api/journal/discord/forum/jobs/${encodeURIComponent(job.id)}`);
        const j: Job = await r.json();
        if (stop) return;
        setJob(j);
        if (j.status !== 'running') { setBusy(null); if (j.status === 'done') onDone(); }
      } catch (e) {
        if (!stop) setJob((cur) => (cur ? { ...cur } : cur)); // retry on the next tick
      }
    }, 1500);
    return () => { stop = true; window.clearTimeout(id); };
  }, [job, onDone]);
  const included = rows.filter((t) => choices[t.threadId]?.slug);

  const commit = async () => {
    if (!preview || problems.length) return;
    setBusy('commit'); setErr('');
    try {
      const threads = rows.map((t) => {
        const c = choices[t.threadId];
        // authorId only when the operator changed it; otherwise the server resolves it for the chosen book.
        const authorId = c?.authorId && c.authorId !== t.primary?.authorId ? c.authorId : null;
        return { threadId: t.threadId, slug: c?.slug ?? null, createName: c?.slug && !known.has(c.slug) ? c.createName.trim() : null, ...(authorId ? { authorId } : {}) };
      });
      const res = await apiRequest('POST', '/api/journal/discord/forum/commit', { token: preview.token, threads });
      const body: { jobId: string; job: Job } = await res.json();
      setJob(body.job);
      setPreview(null);
    } catch (e) {
      setErr(await readApiError(e));
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

      {job && <JobPanel job={job} />}

      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
          <div className="jr-stats">
            <div><span>Threads</span><b>{rows.length}</b><small>{preview.forum.name ? `#${preview.forum.name}` : 'from the exports'}</small></div>
            <div><span>Posts</span><b>{rows.reduce((s, t) => s + t.posts, 0)}</b><small>{rows.reduce((s, t) => s + t.newPosts, 0)} not yet imported</small></div>
            <div><span>Parsed trades</span><b>{rows.reduce((s, t) => s + t.parse.closed + t.parse.open, 0)}</b><small>{rows.reduce((s, t) => s + t.parse.closed, 0)} closed · {rows.reduce((s, t) => s + t.parse.open, 0)} open</small></div>
            <div><span>For review</span><b>{rows.reduce((s, t) => s + t.parse.review, 0)}</b><small>trade-looking, not parsed</small></div>
            <div><span>Screenshots</span><b>{selectedImages.images}</b><small>{selectedImages.cached ? `${selectedImages.cached} already read · ` : ''}in the selected threads</small></div>
          </div>
          <p className="jr-note" style={{ margin: 0 }} role="note">
            {preview.vision.provider ? (
              <>Import reads <b>{est?.billable ?? 0}</b> screenshot{est?.billable === 1 ? '' : 's'} with {preview.vision.model} — est. <b>${(est?.usd ?? 0).toFixed(2)}</b>
                {' '}(~${preview.vision.estimate.perImageUsd.toFixed(4)}/image; {preview.vision.estimate.basis}).
                {selectedImages.images - selectedImages.cached > preview.vision.cap && <> Capped at {preview.vision.cap} per import (FORUM_VISION_MAX_IMAGES) — run Import again for the rest.</>}
                {' '}{preview.vision.note}</>
            ) : preview.vision.note}
            {' '}Trades above are from the post text only; screenshot trades are added on Import.
          </p>
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
                  const c = choices[t.threadId] ?? { slug: null, createName: '', confirmed: false, authorId: null };
                  const author = chosenAuthor(t, c);
                  const img = imagesFor(t);
                  const parse = author?.parse ?? t.parse;
                  const overridden = !!c.authorId && c.authorId !== t.primary?.authorId;
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
                          <div className="jr-n">{day(t.firstAt)} → {day(t.lastAt)}{t.archived ? ' · archived' : ''}</div>
                          {t.authors.length > 0 && (
                            <label className="jr-n" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                              Journal author
                              <select className="jr-select" style={{ maxWidth: 220 }} aria-label={`Main author of ${t.name} (their messages are the journal; others are comments)`}
                                value={author?.authorId ?? ''} onChange={(e) => set(t.threadId, { authorId: e.target.value || null })}>
                                {t.authors.map((a) => (
                                  <option key={a.authorId} value={a.authorId}>{a.authorName} — {a.messages} msg{a.messages === 1 ? '' : 's'} · {a.images} img</option>
                                ))}
                              </select>
                            </label>
                          )}
                          {t.primary && (
                            <div className="jr-n">
                              {overridden ? 'your pick' : VIA_LABEL[t.primary.via] ?? t.primary.via}
                              {!overridden && t.primary.creatorId
                                ? ` · thread created by ${t.authors.find((a) => a.authorId === t.primary!.creatorId)?.authorName ?? 'someone else'} (not the journal author)` : ''}
                            </div>
                          )}
                          {img.images > 0 && <div className="jr-n">{img.images} screenshot{img.images === 1 ? '' : 's'} by {author?.authorName ?? 'the author'}{img.cached ? ` (${img.cached} already read)` : ''}{preview.vision.provider ? ` · ~$${(Math.min(Math.max(0, img.images - img.cached), preview.vision.cap) * preview.vision.estimate.perImageUsd).toFixed(2)}` : ''}</div>}
                        </td>
                        <td style={{ minWidth: 200 }}>
                          <select className="jr-select" aria-label={`Trader book for ${t.name}`} value={c.slug == null ? '' : known.has(c.slug) ? c.slug : '__new'}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') set(t.threadId, { slug: null });
                              else if (v === '__new') set(t.threadId, { slug: t.match && !t.match.existing && !known.has(t.match.slug) ? t.match.slug : '', createName: t.match && !t.match.existing ? t.match.name : '', confirmed: false });
                              // Choosing a book by hand is the confirmation.
                              else set(t.threadId, { slug: v, confirmed: true });
                            }}>
                            <option value="">Skip this thread</option>
                            <option value={preview.mine.slug}>{preview.mine.label}</option>
                            {preview.traders.map((x) => <option key={x.slug} value={x.slug}>{x.name} ({x.slug}){x.pending ? ' — new, created on import' : ''}</option>)}
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
                          {needsTick(t, c) && (
                            <label className="jr-n" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                              <input type="checkbox" checked={c.confirmed} onChange={(e) => set(t.threadId, { confirmed: e.target.checked })} /> confirm: this is {t.match!.name}'s journal
                            </label>
                          )}
                          {c.slug === preview.mine.slug && <div className="jr-n">your own book — trades matched to your broker rows are linked, not added twice</div>}
                          {!isNew && c.slug && c.slug !== preview.mine.slug && pending.has(c.slug) && <div className="jr-n">new trader, created on import</div>}
                          {!isNew && c.slug && t.match?.slug === c.slug && t.match.book === 'trader' && <div className="jr-n">matched by {t.match.via}</div>}
                        </td>
                        <td className="num">{t.posts}<div className="jr-n">{t.alreadyImported ? `${t.newPosts} new` : 'all new'}</div></td>
                        <td className="num">{parse.closed + parse.open}<div className="jr-n">{parse.closed} closed · {parse.open} open</div></td>
                        <td className="num">{parse.review}</td>
                        <td className="num">{parse.avgConfidence == null ? '—' : `${Math.round(parse.avgConfidence * 100)}%`}</td>
                      </tr>
                      {open && (
                        <tr style={{ cursor: 'default' }}>
                          <td />
                          <td colSpan={6} style={{ whiteSpace: 'normal' }}>
                            {overridden && <p className="jr-note" style={{ margin: '0 0 4px' }}>The trades listed below were parsed for {t.primary?.authorName}. Import re-parses for {author?.authorName}: {parse.closed + parse.open} trade{parse.closed + parse.open === 1 ? '' : 's'} from text, {img.images} screenshot{img.images === 1 ? '' : 's'}.</p>}
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
              {included.length ? `Import ${included.length} thread${included.length === 1 ? '' : 's'}${est?.billable ? ` · read ${est.billable} screenshots (~$${est.usd.toFixed(2)})` : ''}` : 'Pick at least one thread'}
            </button>
            <button type="button" className="jr-btn" disabled={!!busy} onClick={() => setPreview(null)}>Discard preview</button>
            <span className="jr-n">Posts → each book's Notebook · trades → its journal · tickers → the trader's watchlist. Runs in the background; re-importing updates, never duplicates, and never re-reads a screenshot.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function JobPanel({ job }: { job: Job }) {
  const v = job.vision;
  const pct = v.total ? Math.round((v.done / v.total) * 100) : job.status === 'running' ? 0 : 100;
  const cls = job.status === 'failed' ? 'jr-err' : job.status === 'done' ? 'jr-ok' : 'jr-note';
  return (
    <div className={cls} role={job.status === 'running' ? 'status' : job.status === 'failed' ? 'alert' : 'status'} aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
        {job.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : job.status === 'done' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        {job.status === 'running' ? `Importing — ${job.phase}` : job.status === 'done' ? `Imported ${job.results.length} thread${job.results.length === 1 ? '' : 's'}` : 'Import failed'}
      </div>
      {v.total > 0 && (
        <div style={{ margin: '6px 0' }}>
          <div role="progressbar" aria-label="Screenshots read" aria-valuemin={0} aria-valuemax={v.total} aria-valuenow={v.done}
            style={{ height: 6, borderRadius: 3, background: 'var(--line, rgba(127,127,127,.25))', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent, currentColor)', transition: 'width .3s' }} />
          </div>
          <div className="jr-n" style={{ marginTop: 3 }}>
            Screenshots {v.done} / {v.total} · {v.tradesFound} trade{v.tradesFound === 1 ? '' : 's'} found · {v.cached} reused · {v.called} read{v.model ? ` (${v.model})` : ''}
            {v.failed ? ` · ${v.failed} unreadable` : ''}{v.lowConfidence ? ` · ${v.lowConfidence} low-confidence → review` : ''}{v.skippedBudget ? ` · ${v.skippedBudget} over the ${v.cap}-image cap` : ''}
            {v.retries ? ` · ${v.retries} rate-limit retries` : ''}{v.usd ? ` · ~$${v.usd.toFixed(2)} spent` : ''}
          </div>
        </div>
      )}
      {v.total === 0 && job.status === 'running' && <div className="jr-n">No screenshots to read{v.provider ? '' : ' (no vision provider configured)'} — writing posts and trades…</div>}
      <div className="jr-n">Threads written {job.threads.done} / {job.threads.total}</div>
      {job.error && <div>{job.error}</div>}
      {job.results.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {job.results.map((t) => (
            <li key={t.threadId}>
              <b>{t.book === 'mine' ? 'My journal' : t.trader}</b>{t.created ? ' (new trader)' : ''}{t.author ? ` · author ${t.author.name}` : ''}
              {t.handleChange ? ` · handle ${t.handleChange.from ?? '(none)'} → ${t.handleChange.to}` : ''} — {t.posts} posts in the Notebook ·{' '}
              {t.tradesNew} new / {t.tradesUpdated} updated trades{t.tradesRemoved ? ` · ${t.tradesRemoved} re-paired` : ''}
              {t.book === 'mine' ? ` · ${t.tradesLinked} matched to your broker rows (not added) · ${t.tradesFlagged} flagged from Discord` : ''}
              {t.fromScreenshots ? ` · ${t.fromScreenshots} from screenshots` : ''}{t.review ? ` · ${t.review} for review` : ''}
              {t.watchlist ? ` · watchlist +${t.watchlist.added}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
