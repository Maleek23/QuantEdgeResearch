/**
 * Journal nav — ONE side nav (the app rail); the journal's own pages live in
 * its top bar as a compact grouped tab row (feat/jnav, 2026-09-29):
 *
 *   [Book ▾]  OVERVIEW Dashboard Calendar Daily │ TRADES Trades Missed │
 *             INSIGHTS Insights Reports Loss analysis │ IMPROVE … │ SETUP … │ [More ▾]
 *
 * Desktop: group captions show while everything fits; when it doesn't, the
 * captions go first, then the trailing tabs move into "More ▾" (grouped). If
 * the page in view is one of them, the More button carries its name and the
 * active style, so the current page is always visible in the bar.
 * Phones (≤768px): the book select, and a horizontally scrollable strip of
 * every tab (the active one scrolled into view).
 *
 * Every tab is a real link (?jtab=…, middle-click / copy link work) with
 * aria-current="page"; a plain click switches in place.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JOURNAL_GROUPS, JOURNAL_PAGES, type JournalPageGroup, type JournalView } from '@/lib/journal/legacy-jtab';
import type { JournalKey } from '@shared/journal-sources';
import type { JournalSourcesResponse } from '@/lib/journal/use-journal';
import { JournalSwitcher } from './journal-switcher';

/** Same URL with ?jtab= set to the page (dashboard = no param), ?jpage= / ?jtrade= dropped. */
export function pageHref(view: JournalView): string {
  if (typeof window === 'undefined') return `?jtab=${view}`;
  const url = new URL(window.location.href);
  url.searchParams.delete('jpage');
  url.searchParams.delete('jtrade');
  if (view === 'dashboard') url.searchParams.delete('jtab');
  else url.searchParams.set('jtab', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

const GROUPS = JOURNAL_GROUPS.map((g) => ({ ...g, pages: JOURNAL_PAGES.filter((p) => p.group === g.id) })).filter((g) => g.pages.length);

/** Pure fit: which pages show in the bar, and whether group captions fit. Exported for tests. */
export function fitTabs(avail: number, w: { tab: Record<string, number>; label: Record<string, number>; sep: number; more: number },
  groups: readonly { id: string; pages: readonly { id: string }[] }[] = GROUPS): { labels: boolean; visible: Set<string> } {
  const all = groups.flatMap((g) => g.pages.map((p) => p.id));
  const tabs = all.reduce((s, id) => s + (w.tab[id] ?? 0), 0);
  const seps = w.sep * Math.max(0, groups.length - 1);
  const labels = groups.reduce((s, g) => s + (w.label[g.id] ?? 0), 0);
  if (tabs + seps + labels <= avail) return { labels: true, visible: new Set(all) };
  if (tabs + seps <= avail) return { labels: false, visible: new Set(all) };
  // A prefix of the tab order stays in the bar; the rest go to More.
  const order = groups.flatMap((g, gi) => g.pages.map((p, pi) => ({ id: p.id, w: (w.tab[p.id] ?? 0) + (gi > 0 && pi === 0 ? w.sep : 0) })));
  const visible = new Set<string>();
  let used = w.more;
  for (const it of order) {
    if (used + it.w > avail) break;
    used += it.w;
    visible.add(it.id);
  }
  return { labels: false, visible };
}

interface Props {
  view: JournalView;
  onSelect: (view: JournalView) => void;
  book: JournalKey;
  onBook: (key: JournalKey) => void;
  sources: JournalSourcesResponse | undefined;
  sourcesLoading: boolean;
}

export function JournalNav({ view, onSelect, ...book }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ labels: boolean; visible: Set<string> }>(() => ({ labels: true, visible: new Set(JOURNAL_PAGES.map((p) => p.id)) }));
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 768px)');
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const measure = useCallback(() => {
    const bar = barRef.current, m = measureRef.current;
    if (!bar || !m) return;
    const tab: Record<string, number> = {}, label: Record<string, number> = {};
    m.querySelectorAll<HTMLElement>('[data-m-tab]').forEach((el) => { tab[el.dataset.mTab!] = el.offsetWidth + 2; });
    m.querySelectorAll<HTMLElement>('[data-m-label]').forEach((el) => { label[el.dataset.mLabel!] = el.offsetWidth + 6; });
    const sep = (m.querySelector<HTMLElement>('[data-m-sep]')?.offsetWidth ?? 9) + 4;
    const more = (m.querySelector<HTMLElement>('[data-m-more]')?.offsetWidth ?? 110) + 6;
    const next = fitTabs(bar.clientWidth, { tab, label, sep, more });
    setFit((prev) => (prev.labels === next.labels && prev.visible.size === next.visible.size ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (phone) return;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (barRef.current) ro?.observe(barRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro?.disconnect();
  }, [measure, phone]);

  const click = (id: JournalView) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onSelect(id);
  };

  // Phones: keep the active tab in view.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!phone) return;
    const el = stripRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [phone, view]);

  const tabLink = (p: (typeof JOURNAL_PAGES)[number]) => (
    <a key={p.id} href={pageHref(p.id)} className="jr-tab" aria-current={view === p.id ? 'page' : undefined}
      title={p.hint} onClick={click(p.id)} data-testid={`jr-nav-${p.id}`}>{p.label}</a>
  );

  if (phone) {
    return (
      <div className="jr-nav jr-nav-phone">
        <JournalSwitcher value={book.book} onChange={book.onBook} sources={book.sources} loading={book.sourcesLoading} idSuffix="-phone" />
        <nav className="jr-tabstrip" aria-label="Journal pages" ref={stripRef}>
          {GROUPS.map((g, gi) => (
            <div className="jr-tabs-g" key={g.id} role="group" aria-label={g.label}>
              {gi > 0 && <span className="jr-tabs-sep" aria-hidden />}
              {g.pages.map(tabLink)}
            </div>
          ))}
        </nav>
      </div>
    );
  }

  const hidden = GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => !fit.visible.has(p.id)) })).filter((g) => g.pages.length);
  const activeHidden = hidden.some((g) => g.pages.some((p) => p.id === view));
  return (
    <div className="jr-nav">
      <JournalSwitcher value={book.book} onChange={book.onBook} sources={book.sources} loading={book.sourcesLoading} />
      <nav className="jr-tabs" aria-label="Journal pages" ref={barRef}>
        {GROUPS.map((g, gi) => {
          const shown = g.pages.filter((p) => fit.visible.has(p.id));
          if (!shown.length) return null;
          return (
            <div className="jr-tabs-g" key={g.id} role="group" aria-label={g.label}>
              {gi > 0 && <span className="jr-tabs-sep" aria-hidden />}
              {fit.labels && <span className="jr-tabs-gl" aria-hidden>{g.label}</span>}
              {shown.map(tabLink)}
            </div>
          );
        })}
        {hidden.length > 0 && <MoreMenu groups={hidden} view={view} activeHidden={activeHidden} onPick={onSelect} />}
      </nav>
      {/* Off-screen copy at natural width — what the fit is measured on. */}
      <div className="jr-tabs-measure" ref={measureRef} aria-hidden>
        {GROUPS.map((g) => <span key={g.id} className="jr-tabs-gl" data-m-label={g.id}>{g.label}</span>)}
        {JOURNAL_PAGES.map((p) => <span key={p.id} className="jr-tab" data-m-tab={p.id}>{p.label}</span>)}
        <span className="jr-tabs-sep" data-m-sep />
        <span className="jr-tab jr-more-btn" data-m-more>Loss analysis <ChevronDown className="h-3.5 w-3.5" /></span>
      </div>
    </div>
  );
}

function MoreMenu({ groups, view, activeHidden, onPick }: {
  groups: { id: JournalPageGroup; label: string; pages: (typeof JOURNAL_PAGES)[number][] }[];
  view: JournalView;
  activeHidden: boolean;
  onPick: (v: JournalView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    (menu.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? menu.current?.querySelector<HTMLElement>('a'))?.focus();
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [open]);
  const activeLabel = activeHidden ? JOURNAL_PAGES.find((p) => p.id === view)?.label : null;
  return (
    <div className="jr-more">
      <button ref={btn} type="button" className={cn('jr-tab jr-more-btn')} aria-haspopup="true" aria-expanded={open}
        aria-current={activeHidden ? 'page' : undefined}
        onClick={() => {
          const r = btn.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
          setOpen((o) => !o);
        }}>
        {activeLabel ?? 'More'} <ChevronDown className="h-3.5 w-3.5" style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div ref={menu} className="jr-more-menu" role="menu" aria-label="More journal pages" style={pos ? { top: pos.top, right: pos.right } : undefined}>
          {groups.map((g) => (
            <div key={g.id} role="group" aria-label={g.label}>
              <div className="jr-more-gl">{g.label}</div>
              {g.pages.map((p) => (
                <a key={p.id} role="menuitem" href={pageHref(p.id)} className="jr-more-item" aria-current={view === p.id ? 'page' : undefined}
                  onClick={(e) => { if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); setOpen(false); onPick(p.id); } }}>
                  <span>{p.label}</span><span className="jr-more-hint">{p.hint}</span>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
