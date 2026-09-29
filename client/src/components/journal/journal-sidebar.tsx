/**
 * Journal sidebar — the page list from the Trade Journal web app (apps/web/src/
 * components/shell.tsx: main pages · a rule · setup pages, collapsible to icons,
 * the collapsed state remembered). Ours adds a "Platform" group for Track
 * record. Prop firms is not carried over.
 *
 * 2026-09-29: drawn by the shared LuxSidebar (placement="inline") — the same
 * component as the app rail and the phone More sheet. It is a <nav> landmark
 * of real links (?jtab=…, so middle-click / copy link work) with
 * aria-current="page" on the page in view. At ≤768px it becomes a horizontal
 * scroll strip above the page; the collapse control is desktop-only.
 */
import type { ComponentType } from 'react';
import { LuxSidebar, type LuxNavGroup } from '@/components/lux/lux-sidebar';
import {
  BarChart3, BookmarkPlus, BookOpen, BookOpenCheck, BookText, CalendarDays, Import, LayoutDashboard, ListChecks,
  ListOrdered, NotebookPen, Settings, Wallet,
} from 'lucide-react';
import { JOURNAL_PAGES, type JournalPageGroup, type JournalView } from '@/lib/journal/legacy-jtab';

const ICON: Record<JournalView, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  daily: NotebookPen,
  trades: ListOrdered,
  reports: BarChart3,
  notebook: BookText,
  playbooks: BookOpen,
  progress: ListChecks,
  missed: BookmarkPlus,
  import: Import,
  accounts: Wallet,
  settings: Settings,
  record: BookOpenCheck,
};

const GROUP_LABEL: Record<JournalPageGroup, string> = { journal: 'Journal', setup: 'Setup', platform: 'Platform' };

/** Same URL with ?jtab= set to the page (dashboard = no param), ?jpage= dropped. */
export function pageHref(view: JournalView): string {
  if (typeof window === 'undefined') return `?jtab=${view}`;
  const url = new URL(window.location.href);
  url.searchParams.delete('jpage');
  if (view === 'dashboard') url.searchParams.delete('jtab');
  else url.searchParams.set('jtab', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function JournalSidebar({ view, onSelect, collapsed, onToggle }: {
  view: JournalView;
  onSelect: (view: JournalView) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const groups: LuxNavGroup[] = (['journal', 'setup', 'platform'] as JournalPageGroup[]).map((g) => ({
    id: g,
    label: GROUP_LABEL[g],
    items: JOURNAL_PAGES.filter((p) => p.group === g).map((p) => ({
      id: p.id,
      label: p.label,
      hint: p.hint,
      icon: ICON[p.id],
      href: pageHref(p.id),
      active: view === p.id,
      onSelect: () => onSelect(p.id),
    })),
  }));
  return (
    <LuxSidebar
      id="jr-side"
      placement="inline"
      label="Journal pages"
      groups={groups}
      collapsed={collapsed}
      onToggle={onToggle}
    />
  );
}
