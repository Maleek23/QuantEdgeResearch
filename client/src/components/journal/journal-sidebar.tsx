/**
 * Journal sidebar — 2026-09-29 nav redesign.
 *
 *   [Book ▾]                      ← which book every page is computed on
 *   Overview  Dashboard · Calendar · Daily
 *   Trades    Trades · Reports · Loss analysis
 *   Improve   Playbooks · Progress · Missed · Notebook
 *   Setup     Import · Accounts · Settings
 *   Platform  Track record
 *   ‹ Collapse
 *
 * Desktop: a fixed column the full height of the journal (only the page
 * content scrolls), collapsible to icons (remembered on this device) — the
 * book picker then shows the book's initials. The page list is the shared
 * LuxSidebar (placement="inline"): a <nav> landmark of real links (?jtab=…,
 * middle-click / copy link work) with aria-current="page" and an accent bar
 * on the page in view.
 *
 * Phones (≤768px): a compact top strip — the book select and a "page" button
 * that opens the same list as a sheet (LuxSidebar placement="sheet").
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { LuxSidebar, type LuxNavGroup } from '@/components/lux/lux-sidebar';
import {
  BarChart3, BookmarkPlus, BookOpen, BookOpenCheck, BookText, CalendarDays, ChevronDown, Import, LayoutDashboard, ListChecks,
  ListOrdered, NotebookPen, SearchX, Settings, Trophy, Wallet,
} from 'lucide-react';
import { JOURNAL_GROUPS, JOURNAL_PAGES, type JournalView } from '@/lib/journal/legacy-jtab';
import type { JournalKey } from '@shared/journal-sources';
import type { JournalSourcesResponse } from '@/lib/journal/use-journal';
import { JournalSwitcher } from './journal-switcher';

const ICON: Record<JournalView, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  daily: NotebookPen,
  trades: ListOrdered,
  reports: BarChart3,
  loss: SearchX,
  notebook: BookText,
  playbooks: BookOpen,
  progress: ListChecks,
  missed: BookmarkPlus,
  import: Import,
  accounts: Wallet,
  settings: Settings,
  record: BookOpenCheck,
  traders: Trophy,
};

/** Same URL with ?jtab= set to the page (dashboard = no param), ?jpage= dropped. */
export function pageHref(view: JournalView): string {
  if (typeof window === 'undefined') return `?jtab=${view}`;
  const url = new URL(window.location.href);
  url.searchParams.delete('jpage');
  if (view === 'dashboard') url.searchParams.delete('jtab');
  else url.searchParams.set('jtab', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

function navGroups(view: JournalView, onSelect: (v: JournalView) => void): LuxNavGroup[] {
  return JOURNAL_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: JOURNAL_PAGES.filter((p) => p.group === g.id).map((p) => ({
      id: p.id,
      label: p.label,
      hint: p.hint,
      icon: ICON[p.id],
      href: pageHref(p.id),
      active: view === p.id,
      onSelect: () => onSelect(p.id),
      testId: `jr-nav-${p.id}`,
    })),
  }));
}

interface BookProps {
  book: JournalKey;
  onBook: (key: JournalKey) => void;
  sources: JournalSourcesResponse | undefined;
  sourcesLoading: boolean;
}

export function JournalSidebar({ view, onSelect, collapsed, onToggle, ...book }: BookProps & {
  view: JournalView;
  onSelect: (view: JournalView) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="jr-side" data-collapsed={collapsed}>
      <JournalSwitcher value={book.book} onChange={book.onBook} sources={book.sources} loading={book.sourcesLoading}
        collapsed={collapsed} onExpand={onToggle} />
      <LuxSidebar
        id="jr-side"
        placement="inline"
        label="Journal pages"
        groups={navGroups(view, onSelect)}
        collapsed={collapsed}
        onToggle={onToggle}
      />
    </div>
  );
}

/** Phones: book select + current page button → the page list as a sheet. */
export function JournalPhoneNav({ view, onSelect, pageLabel, ...book }: BookProps & {
  view: JournalView;
  onSelect: (view: JournalView) => void;
  pageLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const Icon = ICON[view] ?? LayoutDashboard;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    sheetRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <div className="jr-strip">
      <JournalSwitcher value={book.book} onChange={book.onBook} sources={book.sources} loading={book.sourcesLoading} idSuffix="-phone" />
      <button ref={btnRef} type="button" className="jr-strip-page" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon className="h-4 w-4" />
        <span>{pageLabel}</span>
        <ChevronDown className="h-4 w-4" style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <>
          <button type="button" tabIndex={-1} aria-label="Close pages" className="jr-sheet-scrim" onClick={() => setOpen(false)} />
          <div ref={sheetRef} className="jr-sheet" role="dialog" aria-modal="true" aria-label="Journal pages">
            <LuxSidebar placement="sheet" label="Journal pages" groups={navGroups(view, onSelect)} onAnyItem={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
