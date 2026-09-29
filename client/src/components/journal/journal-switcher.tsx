/**
 * Journal switcher — which book the journal is computed on:
 *   Journal: Mine · Bot · Trade desk | Traders: Femi · Malik · Uzo · Bean
 * A pressed-button group (not another tab strip), so the journal keeps one level
 * of destinations. The basis line underneath names what every number on the
 * page is computed on, its sizing rule, and anything the source held that the
 * journal could not score.
 */
import { useEffect, useState } from 'react';
import { Loader2, Lock, Plus, Settings2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import type { JournalKey, JournalSourceMeta } from '@shared/journal-sources';
import { JOURNAL_SOURCES_KEY, readApiError, type JournalSourcesResponse } from '@/lib/journal/use-journal';
import { useJournalPortalClass } from './parts';

export function JournalSwitcher({ value, onChange, sources, loading }: {
  value: JournalKey;
  onChange: (key: JournalKey) => void;
  sources: JournalSourcesResponse | undefined;
  loading: boolean;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; slug?: string }>({ open: false });
  const list = sources?.sources ?? [
    // Before /sources answers, the three fixed books are still switchable.
    { key: 'mine' as const, kind: 'mine' as const, label: 'Mine', hint: 'Your trades', readOnly: false, canWrite: true },
    { key: 'bot' as const, kind: 'bot' as const, label: 'Bot', hint: "The Quant Bot's paper fills", readOnly: true, canWrite: false },
    { key: 'desk' as const, kind: 'desk' as const, label: 'Trade desk', hint: 'Every published idea', readOnly: true, canWrite: false },
  ];
  const books = list.filter((s) => s.kind !== 'trader');
  const people = list.filter((s) => s.kind === 'trader');
  const currentTrader = value.startsWith('trader:') ? value.slice(7) : null;

  const btn = (s: (typeof list)[number]) => (
    <button key={s.key} type="button" aria-pressed={value === s.key} title={s.hint} onClick={() => onChange(s.key)}>
      {s.label}{s.readOnly && s.kind !== 'trader' ? <Lock className="h-2.5 w-2.5" aria-label="read-only" style={{ marginLeft: 4, display: 'inline' }} /> : null}
    </button>
  );

  return (
    <nav className="jr-books" aria-label="Choose which journal to show">
      <span className="jr-books-l" id="jr-books-l">Journal</span>
      <div className="jr-seg" role="group" aria-labelledby="jr-books-l">{books.map(btn)}</div>
      <span className="jr-books-l" id="jr-people-l">Traders</span>
      <div className="jr-seg" role="group" aria-labelledby="jr-people-l">
        {people.map(btn)}
        {loading && !people.length && <span className="jr-n" style={{ padding: '6px 8px' }}>loading…</span>}
        {!loading && !people.length && !sources && <span className="jr-n" style={{ padding: '6px 8px' }}>unavailable</span>}
      </div>
      {sources?.isAdmin && (
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="jr-icon-btn" aria-label="Add a trader" title="Add a trader" onClick={() => setDialog({ open: true })}><Plus className="h-4 w-4" /></button>
          {currentTrader && (
            <button type="button" className="jr-icon-btn" aria-label="Trader settings" title="Trader settings (handle, source, Discord channel)" onClick={() => setDialog({ open: true, slug: currentTrader })}><Settings2 className="h-4 w-4" /></button>
          )}
        </div>
      )}
      <TraderDialog open={dialog.open} slug={dialog.slug} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} onCreated={(slug) => onChange(`trader:${slug}`)} />
    </nav>
  );
}

/** "Computed on …" — present on every journal view so no number is unattributed. */
export function JournalBasis({ meta, shown, total }: { meta: JournalSourceMeta | null; shown: number; total: number }) {
  if (!meta) return null;
  const excluded = (meta.excluded ?? []).filter((e) => e.count > 0);
  const nExcluded = excluded.reduce((s, e) => s + e.count, 0);
  // The basis names its book first ("Trade desk — every idea…"); bold that part.
  const [head, ...rest] = meta.basis.split(' — ');
  return (
    <div className="jr-basis" role="note" aria-label="What these numbers are computed on">
      <div>
        <span className="jr-basis-k">Computed on</span>{' '}
        <b>{head}</b>{rest.length ? <> — {rest.join(' — ')}</> : null}.{' '}
        <span className="jr-n">n={shown}{shown !== total ? ` of ${total}` : ''} trades{meta.readOnly ? ' · read-only' : ''}</span>
      </div>
      {meta.sizing && <div className="jr-basis-s">{meta.sizing}</div>}
      {nExcluded > 0 && (
        <details className="jr-basis-s">
          <summary style={{ cursor: 'pointer' }}>{nExcluded} source row{nExcluded === 1 ? '' : 's'} not scored — why</summary>
          <ul style={{ margin: '4px 0 0 16px' }}>
            {excluded.map((e) => <li key={e.reason}>{e.count} · {e.reason}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

interface TraderForm { slug: string; name: string; handle: string; source: string; discordChannelId: string; discordAuthorId: string; linkedUserId: string }
const EMPTY: TraderForm = { slug: '', name: '', handle: '', source: '', discordChannelId: '', discordAuthorId: '', linkedUserId: '' };

/** Admin: add a trader, or edit one's handle / source / Discord channel / linked user. */
function TraderDialog({ open, slug, onOpenChange, onCreated }: {
  open: boolean;
  slug?: string;
  onOpenChange: (o: boolean) => void;
  onCreated: (slug: string) => void;
}) {
  const portal = useJournalPortalClass();
  const qc = useQueryClient();
  const [form, setForm] = useState<TraderForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const editing = !!slug;

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (!slug) { setForm(EMPTY); return; }
    fetch('/api/traders', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Traders request failed (${r.status})`))))
      .then((d) => {
        const t = (d.traders ?? []).find((x: any) => x.slug === slug);
        if (t) setForm({ slug: t.slug, name: t.name ?? '', handle: t.handle ?? '', source: t.source ?? '', discordChannelId: t.discordChannelId ?? '', discordAuthorId: t.discordAuthorId ?? '', linkedUserId: t.linkedUserId ?? '' });
      })
      .catch((e) => setErr(e.message));
  }, [open, slug]);

  const set = (k: keyof TraderForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    setBusy(true); setErr('');
    const body = {
      name: form.name.trim(),
      handle: form.handle.trim() || null,
      source: form.source.trim() || null,
      discordChannelId: form.discordChannelId.trim() || null,
      discordAuthorId: form.discordAuthorId.trim() || null,
      linkedUserId: form.linkedUserId.trim() || null,
    };
    try {
      if (editing) await apiRequest('PATCH', `/api/traders/${encodeURIComponent(slug!)}`, body);
      else await apiRequest('POST', '/api/traders', { slug: form.slug.trim().toLowerCase(), ...body });
      await qc.invalidateQueries({ queryKey: JOURNAL_SOURCES_KEY });
      await qc.invalidateQueries({ queryKey: ['/api/traders'] });
      onOpenChange(false);
      if (!editing) onCreated(form.slug.trim().toLowerCase());
    } catch (e) {
      setErr(await readApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof TraderForm, label: string, placeholder = '', hint?: string) => (
    <div className="jr-field">
      <label htmlFor={`jr-trader-${k}`}>{label}</label>
      <input id={`jr-trader-${k}`} className="jr-input" value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} disabled={k === 'slug' && editing} />
      {hint && <span className="jr-note" style={{ marginTop: 0 }}>{hint}</span>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(portal, 'max-h-[92dvh] w-[calc(100vw-16px)] max-w-lg overflow-y-auto rounded-xl')} style={{ background: 'var(--bg-2)' }}>
        <DialogHeader>
          <DialogTitle className="jr-title" style={{ fontSize: 22 }}>{editing ? `${form.name || slug} — settings` : 'Add a trader'}</DialogTitle>
          <DialogDescription className="jr-sub">A trader gets a watchlist and a journal. Only admins (and the linked user) can change them.</DialogDescription>
        </DialogHeader>
        <div className="jr-drawer" style={{ gap: 10 }}>
          <div className="jr-form-grid">
            {field('slug', 'Slug', 'femi', 'Lowercase, used in links')}
            {field('name', 'Name', 'Femi')}
            {field('handle', 'Handle', '@femi')}
            {field('source', 'Source', 'discord')}
          </div>
          {field('discordChannelId', 'Discord channel id', '123456789012345678', 'For the bot-token import path (docs/DISCORD_IMPORT.md)')}
          {field('discordAuthorId', 'Discord author id', '', 'Import only this person’s messages from a shared channel')}
          {field('linkedUserId', 'Linked platform user id', '', 'That user may edit this trader’s watchlist and journal')}
          {err && <div className="jr-err" role="alert">{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="jr-btn" onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="button" className="jr-btn jr-btn-primary" disabled={busy || !form.name.trim() || (!editing && !form.slug.trim())} onClick={submit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save' : 'Add trader'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
