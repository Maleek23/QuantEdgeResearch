/**
 * Journal sidebar — LuxAlgo Trade Journal's page list (apps/web/src/components/
 * shell.tsx: main pages · a rule · setup pages, collapsible to icons, the
 * collapsed state remembered) drawn in the journal's own language. Ours adds a
 * "Platform" group for Track record. Prop firms is not carried over.
 *
 * It is a <nav> landmark of real links (?jtab=…, so middle-click / copy link
 * work) with aria-current="page" on the page in view. At ≤768px it becomes a
 * horizontal scroll strip above the page; the collapse control is desktop-only.
 */
import { useEffect, useRef, type ComponentType, type MouseEvent } from 'react';
import {
  BarChart3, BookmarkPlus, BookOpen, BookOpenCheck, BookText, CalendarDays, Import, LayoutDashboard, ListChecks,
  ListOrdered, NotebookPen, PanelLeftClose, PanelLeftOpen, Settings, Wallet,
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
  const groups: JournalPageGroup[] = ['journal', 'setup', 'platform'];
  const navRef = useRef<HTMLElement>(null);
  // Phone strip: keep the current page visible (horizontal scroll only — never moves the page).
  useEffect(() => {
    const nav = navRef.current;
    const a = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !a || nav.scrollWidth <= nav.clientWidth) return;
    const l = a.offsetLeft - nav.offsetLeft;
    if (l < nav.scrollLeft || l + a.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, l - 12);
  }, [view]);
  const click = (v: JournalView) => (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks open a new tab; plain clicks switch in place.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onSelect(v);
  };
  return (
    <aside className="jr-side" data-collapsed={collapsed}>
      <nav ref={navRef} className="jr-side-nav" aria-label="Journal pages">
        {groups.map((g) => {
          const pages = JOURNAL_PAGES.filter((p) => p.group === g);
          return (
            <div key={g} className="jr-side-group" role="group" aria-labelledby={`jr-side-g-${g}`}>
              <div className="jr-side-gl" id={`jr-side-g-${g}`}>{GROUP_LABEL[g]}</div>
              <ul>
                {pages.map((p) => {
                  const Icon = ICON[p.id];
                  const active = view === p.id;
                  return (
                    <li key={p.id}>
                      <a
                        href={pageHref(p.id)}
                        className="jr-side-link"
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? `${p.label} — ${p.hint}` : p.hint}
                        onClick={click(p.id)}
                      >
                        <Icon className="jr-side-ic" aria-hidden />
                        <span className="jr-side-label">{p.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        className="jr-side-toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand journal sidebar' : 'Collapse journal sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
        <span className="jr-side-label">Collapse</span>
      </button>
    </aside>
  );
}
