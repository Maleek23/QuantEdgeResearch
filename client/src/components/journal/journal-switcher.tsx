/**
 * Journal switcher — which book the journal is computed on:
 *   Books: Mine · Bot · Trade desk | Traders: Femi · Malik · Uzo · Bean
 * Since feat/jnav it is a grouped select at the left of the journal's tab
 * row (phones: above the tab strip). The basis line names what every number on the
 * page is computed on, its sizing rule, and anything the source held that the
 * journal could not score.
 */
import { runsCovered } from '@shared/bot-runs';
import { expiryCounts, expiryCountsText } from '@shared/journal-expiry';
import { useEffect, useState } from 'react';
import { Loader2, Lock, Plus, Settings2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import type { JournalKey, JournalSourceMeta } from '@shared/journal-sources';
import { JOURNAL_SOURCES_KEY, readApiError, type JournalSourcesResponse } from '@/lib/journal/use-journal';
import { useJournalPortalClass } from './parts';

/**
 * The book picker — top of the journal sidebar (and of the phone strip).
 * A native <select> grouped Books / Traders: compact, keyboard- and
 * screen-reader-native, and it never wraps. Collapsed sidebar → the book's
 * initials; choosing expands the sidebar first.
 */
export function JournalSwitcher({ value, onChange, sources, loading, collapsed = false, onExpand, idSuffix = '' }: {
  value: JournalKey;
  onChange: (key: JournalKey) => void;
  sources: JournalSourcesResponse | undefined;
  loading: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
  idSuffix?: string;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; slug?: string }>({ open: false });
  const list = sources?.sources ?? [
    // Before /sources answers, the three fixed books are still switchable.
    { key: 'desk' as const, kind: 'desk' as const, label: 'NEXUS ideas', hint: 'Official · every idea NEXUS published', readOnly: true, canWrite: false },
    { key: 'bot' as const, kind: 'bot' as const, label: 'Quantinum Bot', hint: "Official · Quantinum Bot's paper fills", readOnly: true, canWrite: false },
    { key: 'mine' as const, kind: 'mine' as const, label: 'My journal', hint: 'Your trades', readOnly: false, canWrite: true },
  ];
  const books = list.filter((s) => s.kind !== 'trader');
  const people = list.filter((s) => s.kind === 'trader');
  const current = list.find((s) => s.key === value);
  const currentTrader = value.startsWith('trader:') ? value.slice(7) : null;
  const label = current?.label ?? (value === 'mine' ? 'My journal' : value.replace(/^trader:/, ''));
  const selectId = `jr-book-select${idSuffix}`;

  if (collapsed) {
    const initials = label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return (
      <div className="jr-book jr-book-collapsed">
        <button type="button" className="jr-book-chip" onClick={onExpand} aria-label={`Book: ${label}${current?.readOnly ? ' (read-only)' : ''} — expand the sidebar to switch`} title={`Book: ${label} — expand to switch`}>
          {initials}
        </button>
      </div>
    );
  }

  return (
    <div className="jr-book">
      <label className="jr-book-l" htmlFor={selectId}>Book{current?.readOnly ? <span className="jr-book-ro"><Lock className="h-2.5 w-2.5" aria-hidden /> read-only</span> : null}</label>
      <div className="jr-book-row">
        <select id={selectId} className="jr-select jr-book-select" value={value} onChange={(e) => onChange(e.target.value as JournalKey)}
          title={current?.hint}>
          <optgroup label="Books">
            {books.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </optgroup>
          <optgroup label={loading && !people.length ? 'Traders (loading…)' : !people.length && !sources ? 'Traders (unavailable)' : 'Traders'}>
            {people.map((s) => <option key={s.key} value={s.key}>{s.locked ? `🔒 ${s.label}` : s.label}</option>)}
          </optgroup>
          {!list.some((s) => s.key === value) && <option value={value}>{label}</option>}
        </select>
        {sources?.isAdmin && (
          <>
            <button type="button" className="jr-icon-btn" aria-label="Add a trader" title="Add a trader" onClick={() => setDialog({ open: true })}><Plus className="h-4 w-4" /></button>
            {currentTrader && (
              <button type="button" className="jr-icon-btn" aria-label="Trader settings" title="Trader settings (handle, source, Discord channel)" onClick={() => setDialog({ open: true, slug: currentTrader })}><Settings2 className="h-4 w-4" /></button>
            )}
          </>
        )}
      </div>
      <TraderDialog open={dialog.open} slug={dialog.slug} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} onCreated={(slug) => onChange(`trader:${slug}`)} />
    </div>
  );
}

/** "Computed on …" — present on every journal view so no number is unattributed. */
export function JournalBasis({ meta, shown, total, sizing = 'show', rows, compact = false }: {
  meta: JournalSourceMeta | null; shown: number; total: number; sizing?: 'show' | 'hide';
  /** One line (book + n) that expands to the full basis — the fit-to-screen header uses this. */
  compact?: boolean;
  /** Rows in view — the Bot book names which runs they cover. */
  rows?: { runId?: string | null; status: string; realizedPnL?: number | null; expiredAssumed?: boolean; notes?: string | null }[];
}) {
  if (!meta) return null;
  // Options with no closing fill, settled at intrinsic on expiry day (shared/journal-expiry.ts).
  const exp = expiryCounts(rows ?? []);
  const runs = meta.runs ?? [];
  const runLine = runs.length && rows ? (() => {
    const per = runs.map((r) => {
      const mine = rows.filter((x) => x.runId === r.id);
      const closed = mine.filter((x) => x.status === 'closed' && x.realizedPnL != null).length;
      return { r, n: mine.length, closed, open: mine.length - closed };
    }).filter((x) => x.n > 0);
    return per.length ? { text: runsCovered(per.map((x) => x.r.id), runs), per } : null;
  })() : null;
  const excluded = (meta.excluded ?? []).filter((e) => e.count > 0);
  const nExcluded = excluded.reduce((s, e) => s + e.count, 0);
  // NEXUS ideas: what the counted P&L is verified against; unverified rows listed, not counted.
  const ver = meta.verification ?? null;
  const usd = (v: number | null) => v == null ? '—' : `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  // The basis names its book first ("Trade desk — every idea…"); bold that part.
  const [head, ...rest] = meta.basis.split(' — ');
  const detail = (
    <>
      {runs.length > 0 && (
        <div className="jr-basis-s">
          <span className="jr-basis-k">Runs</span>{' '}
          {runLine ? <><b>{runLine.text}</b> — {runLine.per.map((x, i) => (
            <span key={x.r.id} title={`portfolio "${x.r.displayName}" · ${x.r.id}`}>{i ? ' · ' : ''}{x.r.label}{x.r.active ? ' (trading)' : ''}: n={x.closed} closed{x.open ? `, ${x.open} open` : ''}</span>
          ))}</> : 'no run in view'}
        </div>
      )}
      {meta.sizing && (sizing === 'show' || compact
        ? <div className="jr-basis-s">{meta.sizing}</div>
        : <details className="jr-basis-s"><summary style={{ cursor: 'pointer' }}>How P&amp;L is sized</summary>{meta.sizing}</details>)}
      {exp.n > 0 && (
        <div className="jr-basis-s">
          {expiryCountsText(exp)} — no closing fill in the broker export:{' '}
          {exp.pnl < 0 ? '−' : '+'}${Math.abs(exp.pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}.
          {exp.unverified > 0 ? ' Unverified ones stay at $0 (no close available) — Import › Re-settle expired options retries them.' : ''}
        </div>
      )}
      {ver && (
        <div className="jr-basis-s">
          <span className="jr-basis-k">Verified</span>{' '}
          {ver.counted.verified} bar-verified ({usd(ver.counted.verifiedPnL)}) · {ver.counted.checked} integrity-checked only ({usd(ver.counted.checkedPnL)})
          {ver.ledger ? ` · ledger ${ver.ledger.asOf.slice(0, 16).replace('T', ' ')}Z` : ' · no bar-verification ledger on this server'}
        </div>
      )}
      {ver && ver.unverified.count > 0 && (
        <details className="jr-basis-s">
          <summary style={{ cursor: 'pointer' }}>
            {ver.unverified.count} closed trade{ver.unverified.count === 1 ? '' : 's'} UNVERIFIED — recorded {usd(ver.unverified.recordedPnL)} {ver.includeUnverified ? 'shown, labelled' : 'not counted'}
          </summary>
          <ul style={{ margin: '4px 0 0 16px' }}>
            {ver.unverified.byReason.map((r) => <li key={r.code} title={r.label}>{r.count} · {r.code} · recorded {usd(r.recordedPnL)} — {r.label}</li>)}
          </ul>
          <ul style={{ margin: '4px 0 0 16px', maxHeight: 220, overflowY: 'auto' }}>
            {ver.unverified.rows.map((r) => (
              <li key={r.id}>
                {r.symbol} {r.entryTime.slice(0, 10)} · recorded {usd(r.recordedPnL)}{r.recomputedPnL != null ? ` · recomputed ${usd(r.recomputedPnL)}` : ''} · {r.reasons.map((x) => `${x.code} (${x.detail})`).join('; ')}
              </li>
            ))}
          </ul>
        </details>
      )}
      {nExcluded > 0 && (
        <details className="jr-basis-s">
          <summary style={{ cursor: 'pointer' }}>{nExcluded} source row{nExcluded === 1 ? '' : 's'} not scored — why</summary>
          <ul style={{ margin: '4px 0 0 16px' }}>
            {excluded.map((e) => <li key={e.reason}>{e.count} · {e.reason}</li>)}
          </ul>
        </details>
      )}
    </>
  );
  const n = <span className="jr-n">n={shown}{shown !== total ? ` of ${total}` : ''} trades{meta.readOnly ? ' · read-only' : ''}</span>;
  if (compact) {
    return (
      <details className="jr-basis jr-basis-compact" role="note" aria-label="What these numbers are computed on">
        <summary>
          <span className="jr-basis-k">Computed on</span> <b>{head}</b>{' '}{n}
          {nExcluded > 0 && <span className="jr-n"> · {nExcluded} not scored</span>}
          {ver && ver.unverified.count > 0 && <span className="jr-n"> · {ver.unverified.count} unverified ({usd(ver.unverified.recordedPnL)}) {ver.includeUnverified ? 'shown' : 'not counted'}</span>}
          {exp.n > 0 && <span className="jr-n"> · {expiryCountsText(exp)}</span>}
          <span className="jr-basis-more">details</span>
        </summary>
        {rest.length ? <div className="jr-basis-s">{rest.join(' — ')}.</div> : null}
        {detail}
      </details>
    );
  }
  return (
    <div className="jr-basis" role="note" aria-label="What these numbers are computed on">
      <div>
        <span className="jr-basis-k">Computed on</span>{' '}
        <b>{head}</b>{rest.length ? <> — {rest.join(' — ')}</> : null}.{' '}{n}
      </div>
      {detail}
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
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Save trader' : 'Add trader'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
