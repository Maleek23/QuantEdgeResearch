/**
 * Journal · Notebook — LuxAlgo's Notebook (apps/web/src/app/notebook): every
 * note in the book, searchable, tagged by ticker and day. Three sources:
 *   · journal_notes      day notes, notebook entries, missed trades, imported posts
 *   · trade notes        the notes field of each trade in view (for the Bot: its
 *                        entry/exit reasons; for the Trade desk: none)
 *   · trader calls       for a trader book, the Discord calls imported onto their
 *                        watchlist (read-only; the importer lives on the watchlist)
 *   · Discord posts      (2026-09-29, feat/forum) every message of the trader's
 *                        forum thread, as posted — author, time, link back to
 *                        Discord, images as links. Read them oldest → newest with
 *                        "only <trader>'s posts" to follow their analysis; the
 *                        REVIEW filter lists trade-looking posts the parser could
 *                        not turn into a trade. The trader picker switches book.
 * Writing is offered only on books the caller can write.
 */
import { useMemo, useState } from 'react';
import { ExternalLink, Loader2, Search, Trash2 } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { Card, N, fmtDayLabel } from '@/components/journal/parts';
import {
  fmtStamp, noteKindLabel, readApiError, useJournalNoteMutations, useTraderWatchlist,
} from '@/lib/journal/use-journal';

type Kind = 'all' | 'day_note' | 'note' | 'missed' | 'imported' | 'trade' | 'calls' | 'discord' | 'review';
type ItemKind = Exclude<Kind, 'all' | 'review'>;

interface PostMeta { authorName?: string; byTrader?: boolean; link?: string | null; review?: string | null; threadName?: string; parsed?: { kind: string; symbol: string | null; confidence: number } | null }
const REVIEW_TEXT: Record<string, string> = {
  entry_without_price: 'entry without a price',
  unmatched_exit: 'exit with no open entry',
  unpriced_exit: 'closed without a price',
  trade_looking: 'reads like a trade — not parsed',
};

interface Item {
  id: string;
  kind: ItemKind;
  label: string;
  day: string | null;
  at: string | null;
  symbols: string[];
  body: string;
  /** Deletable manual journal_notes row. */
  noteId?: string;
  tradeId?: string;
  attachments?: { url: string; name: string; isImage: boolean }[] | null;
  author?: string;
  byTrader?: boolean;
  link?: string | null;
  review?: string | null;
  parsed?: PostMeta['parsed'];
}

const SYM_RE = /\$?\b[A-Z]{1,5}\b/g;

export default function NotebookView() {
  const { data, filters, canWrite, bookLabel, openTrade, openDay, prefs, sources, setJournal } = useJournal();
  const { notesQ, trades } = data;
  const slug = data.key.startsWith('trader:') ? data.key.slice(7) : null;
  const callsQ = useTraderWatchlist(slug);
  const { remove } = useJournalNoteMutations(data.key);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [limit, setLimit] = useState(40);
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const [onlyTrader, setOnlyTrader] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const traderBooks = (sources?.sources ?? []).filter((x) => x.kind === 'trader');
  const [delErr, setDelErr] = useState('');
  const f = filters.resolved;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const n of notesQ.data?.notes ?? []) {
      if (n.reason === 'playbook' || n.reason === 'trade_review') continue; // playbook definitions live on Playbooks, trade reviews on the trade page
      if (n.reason === 'discord_post') {
        const m = (n.meta ?? {}) as PostMeta;
        out.push({
          id: `n:${n.id}`, kind: 'discord', label: `Discord · ${m.authorName ?? 'unknown'}`, day: n.day, at: n.postedAt,
          symbols: (n.symbols ?? []).map((x) => x.toUpperCase()), body: n.body, attachments: n.attachments,
          author: m.authorName, byTrader: m.byTrader !== false, link: m.link ?? null, review: m.review ?? null, parsed: m.parsed ?? null,
        });
        continue;
      }
      const k: Item['kind'] = n.source === 'manual' && (n.reason === 'day_note' || n.reason === 'note' || n.reason === 'missed') ? n.reason : 'imported';
      out.push({ id: `n:${n.id}`, kind: k, label: noteKindLabel(n.reason, n.source), day: n.day, at: n.postedAt, symbols: (n.symbols ?? []).map((s) => s.toUpperCase()), body: n.body, noteId: n.source === 'manual' ? n.id : undefined, attachments: n.attachments });
    }
    for (const t of trades) {
      const body = t.row.notes?.trim();
      if (!body) continue;
      out.push({ id: `t:${t.id}`, kind: 'trade', label: `trade note · ${t.symbol}`, day: journalDayKey(t.closedAt ?? t.openedAt), at: t.closedAt ?? t.openedAt, symbols: [t.symbol.toUpperCase()], body, tradeId: t.id });
    }
    for (const c of callsQ.data?.items ?? []) {
      if (!c.note?.trim()) continue;
      out.push({ id: `c:${c.id}`, kind: 'calls', label: 'watchlist call', day: c.addedAt ? journalDayKey(c.addedAt) : null, at: c.addedAt, symbols: [c.symbol.toUpperCase()], body: c.note });
    }
    return out;
  }, [notesQ.data, trades, callsQ.data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) {
      c[i.kind] = (c[i.kind] ?? 0) + 1;
      if (i.review) c.review = (c.review ?? 0) + 1;
    }
    return c;
  }, [items]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => items.filter((i) =>
    (kind === 'all' || (kind === 'review' ? !!i.review : i.kind === kind))
    && (!onlyTrader || i.kind !== 'discord' || i.byTrader)
    && (!needle || i.body.toLowerCase().includes(needle) || i.symbols.some((s) => s.toLowerCase().includes(needle)) || (i.day ?? '').includes(needle) || (i.author ?? '').toLowerCase().includes(needle))
    && (!f.symbols?.length || i.symbols.some((s) => f.symbols!.includes(s)))
    && (!i.day || ((!f.from || i.day >= f.from) && (!f.to || i.day <= f.to))))
    .sort((a, b) => ((Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0)) * (order === 'new' ? 1 : -1)),
  [items, kind, needle, f.symbols, f.from, f.to, onlyTrader, order]);

  const KINDS: { id: Kind; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'day_note', label: 'Day notes' },
    { id: 'note', label: 'Notes' },
    { id: 'missed', label: 'Missed' },
    { id: 'imported', label: 'Imported' },
    { id: 'trade', label: 'Trade notes' },
    ...(slug ? [{ id: 'calls' as Kind, label: 'Watchlist calls' }] : []),
    ...(counts.discord ? [{ id: 'discord' as Kind, label: 'Discord' }] : []),
    ...(counts.review ? [{ id: 'review' as Kind, label: 'Review' }] : []),
  ];

  const loading = notesQ.isLoading && notesQ.fetchStatus !== 'idle';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {canWrite && <NewNote />}

      <Card num={canWrite ? '02' : '01'} title="Notebook" meta={<N n={shown.length} unit={`of ${items.length} notes`} />}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
            <Search className="h-3.5 w-3.5" aria-hidden style={{ position: 'absolute', left: 9, top: 9, color: 'var(--text-mute)' }} />
            <input className="jr-input" style={{ width: '100%', paddingLeft: 28 }} type="search" aria-label="Search notes" placeholder="Search text, ticker or YYYY-MM-DD"
              value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} />
          </div>
          {traderBooks.length > 0 && (
            <select className="jr-select" aria-label="Trader" value={slug ? `trader:${slug}` : ''} style={{ minHeight: 32 }}
              onChange={(e) => { if (e.target.value) { setJournal(e.target.value as any); setLimit(40); } }}>
              {!slug && <option value="">Trader…</option>}
              {traderBooks.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          )}
          <div className="jr-seg" role="group" aria-label="Order">
            <button type="button" aria-pressed={order === 'new'} onClick={() => setOrder('new')}>NEWEST</button>
            <button type="button" aria-pressed={order === 'old'} onClick={() => setOrder('old')}>OLDEST</button>
          </div>
          {!!counts.discord && slug && (
            <label className="jr-n" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyTrader} onChange={(e) => setOnlyTrader(e.target.checked)} /> only {bookLabel}'s posts
            </label>
          )}
          <div className="jr-seg" role="group" aria-label="Note kind">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setLimit(40); }}>
                {k.label.toUpperCase()}{k.id !== 'all' && counts[k.id] ? ` ${counts[k.id]}` : ''}
              </button>
            ))}
          </div>
        </div>

        {notesQ.isError && <QEError title="Journal notes didn't load" message="Trade notes and watchlist calls below are unaffected; journal notes are missing until this loads." onRetry={() => notesQ.refetch()} retrying={notesQ.isFetching} />}
        {callsQ.isError && <QEError title={`${bookLabel}'s watchlist calls didn't load`} message="The trader watchlist request failed — other notes are unaffected." onRetry={() => callsQ.refetch()} retrying={callsQ.isFetching} />}
        {delErr && <div className="jr-err" role="alert" style={{ marginBottom: 8 }}>{delErr}</div>}

        {loading ? <QELoading rows={3} /> : !items.length ? (
          <QEEmpty message={
            data.key === 'bot' || data.key === 'desk'
              ? `The ${bookLabel} book is a ledger: it has no journal notes, and none of its trades in view carry notes.`
              : canWrite ? 'No notes yet. Write one above, add a day note in the Daily journal, or log a missed trade.' : `${bookLabel} has no notes yet.`
          } />
        ) : !shown.length ? (
          <QEEmpty message={`None of the ${items.length} notes match this search and the journal filters.`} action={<button type="button" className="jr-btn" onClick={() => { setQ(''); setKind('all'); }}>Clear search</button>} />
        ) : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
            {shown.slice(0, limit).map((n) => (
              <article key={n.id} className="jr-note-item">
                <div className="h">
                  <span className="jr-tag">{n.label}</span>
                  {n.day && <button type="button" className="jr-cell-btn jr-n" onClick={() => openDay(n.day!)} aria-label={`Open ${n.day} in the Daily journal`}>{fmtDayLabel(n.day, { month: 'short', day: 'numeric', year: '2-digit' })}</button>}
                  {n.at && n.kind !== 'calls' && <time dateTime={n.at}>{fmtStamp(n.at, prefs.timeDisplay, { hour: 'numeric', minute: '2-digit' })}</time>}
                  {n.review && <span className="jr-tag" title="On the review list: the parser did not turn this into a trade">review · {REVIEW_TEXT[n.review] ?? n.review}</span>}
                  {n.parsed && <span className="jr-n" title="What the parser read in this post">{n.parsed.kind}{n.parsed.symbol ? ` ${n.parsed.symbol}` : ''} · {Math.round(n.parsed.confidence * 100)}%</span>}
                  {n.link && <a className="jr-n" href={n.link} target="_blank" rel="noreferrer noopener" aria-label="Open this post in Discord" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>Discord <ExternalLink className="h-3 w-3" /></a>}
                  {n.symbols.slice(0, 5).map((s) => (
                    <button key={s} type="button" className="jr-chip" style={{ cursor: 'pointer', background: 'transparent' }}
                      onClick={() => filters.setFilter('symbols', [s])} aria-label={`Filter the journal to ${s}`}>{s}</button>
                  ))}
                  {n.tradeId && <button type="button" className="jr-btn jr-btn-sm" style={{ marginLeft: 'auto', minHeight: 26 }} onClick={() => openTrade(n.tradeId!)}>Open trade</button>}
                  {canWrite && n.noteId && (
                    <button type="button" className="jr-icon-btn danger" style={{ marginLeft: n.tradeId ? 0 : 'auto', width: 26, height: 26 }} aria-label="Delete this note"
                      disabled={remove.isPending}
                      onClick={async () => {
                        if (!window.confirm('Delete this note? This cannot be undone.')) return;
                        setDelErr('');
                        try { await remove.mutateAsync(n.noteId!); } catch (e) { setDelErr(await readApiError(e)); }
                      }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="b" style={{ whiteSpace: 'pre-wrap' }}>{n.body.length > 900 && !open.has(n.id) ? `${n.body.slice(0, 900)}…` : n.body}</div>
                {n.body.length > 900 && (
                  <button type="button" className="jr-cell-btn jr-n" style={{ alignSelf: 'flex-start' }}
                    onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; })}>
                    {open.has(n.id) ? 'Show less' : `Read all ${n.body.length.toLocaleString()} characters`}
                  </button>
                )}
                {!!n.attachments?.length && (
                  <div className="att">
                    {n.attachments.slice(0, 6).map((a) => <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener">{a.isImage ? '▣ ' : '⎘ '}{a.name}</a>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {shown.length > limit && (
          <button type="button" className="jr-btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setLimit((l) => l + 40)}>Show more · {shown.length - limit} hidden</button>
        )}
        {(counts.discord ?? 0) > 0 && <p className="jr-note">Discord posts are {bookLabel}'s forum thread, imported as posted (Journal › Import › Discord forum). Images stay on Discord's CDN as links; re-importing updates edits and never duplicates. Trades parsed from them are in Trades; ranking in Trader ranking.</p>}
        {slug && (counts.calls ?? 0) > 0 && <p className="jr-note">Watchlist calls are {bookLabel}'s imported Discord calls (latest call per ticker) — read-only here; manage them on the trader's watchlist.</p>}
      </Card>
    </div>
  );
}

function NewNote() {
  const { data } = useJournal();
  const { save } = useJournalNoteMutations(data.key);
  const [body, setBody] = useState('');
  const [tickers, setTickers] = useState('');
  const [day, setDay] = useState(journalDayKey(new Date()));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const symbols = [...new Set((tickers.toUpperCase().match(SYM_RE) ?? []).map((s) => s.replace('$', '')))].slice(0, 12);
  const submit = async () => {
    setMsg(null);
    try {
      await save.mutateAsync({ kind: 'note', day, body, symbols });
      setBody(''); setTickers('');
      setMsg({ ok: true, text: 'Saved to the notebook.' });
    } catch (e) {
      setMsg({ ok: false, text: await readApiError(e) });
    }
  };
  return (
    <Card num="01" title="New note">
      <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (body.trim()) submit(); }}>
        <div className="jr-field">
          <label htmlFor="jr-nb-body">Note</label>
          <textarea id="jr-nb-body" className="jr-input" value={body} maxLength={20_000} onChange={(e) => setBody(e.target.value)} placeholder="A lesson, a level to watch, a rule you broke…" />
        </div>
        <div className="jr-form-grid">
          <div className="jr-field">
            <label htmlFor="jr-nb-tickers">Tickers</label>
            <input id="jr-nb-tickers" className="jr-input" value={tickers} onChange={(e) => setTickers(e.target.value)} placeholder="NVDA, SPY" autoComplete="off" />
          </div>
          <div className="jr-field">
            <label htmlFor="jr-nb-day">Day</label>
            <input id="jr-nb-day" type="date" className="jr-input" value={day} onChange={(e) => setDay(e.target.value)} required />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="jr-btn jr-btn-primary jr-btn-sm" disabled={!body.trim() || !day || save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save note
          </button>
          {symbols.length > 0 && <span className="jr-n">tags: {symbols.join(' · ')}</span>}
          {msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{msg.text}</span>}
        </div>
      </form>
    </Card>
  );
}
