/**
 * PHONE NAVIGATION — ONE model for the terminal and every page.
 *
 *   MobileDock        a floating, rounded dock at the bottom (safe-area aware):
 *                     Today · NEXUS · FLOW · GEX · Chart (nav-model MOBILE_DOCK).
 *                     Active item = a pill with icon + label; every item is a
 *                     ≥ 48px target; labels are 11px, never oversized.
 *   MobileMenuButton  the menu button in the phone TOP BAR. It opens the rest
 *                     of the navigation (Research, Manage, Account groups) as
 *                     a sheet — the shared LuxSidebar in its `sheet` placement,
 *                     so phone and desktop menus are one implementation.
 *
 * Operator 2026-09-29: "should show 4–5 including chart" and the More slot
 * moves out of the dock into the top bar.
 *
 * Perf 2026-09-30: CSS transitions, not framer-motion. This file is imported by
 * NexusFrame, which lives in the app entry chunk, so its framer import put the
 * whole animation library (~40 KB gzip) on the first paint of every page —
 * including the public landing page, which never shows the dock.
 */
import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDismissable } from '@/hooks/use-dismissable';
import { LuxSidebar } from '@/components/lux/lux-sidebar';
import { MOBILE_DOCK, MOBILE_PRIMARY, MOBILE_PRIMARY_PAGES, MOBILE_MORE, PAGES, UTILITY_PAGES, MobileTabIcon, tabHref, type Tab } from './nav-model';
import { TAB_SHORT, navGroups, pageShort, utilityItems } from './nav-groups';

export function MobileDock({ activeTab, onTab }: {
  /** The terminal tab in view, or null on a standalone page. */
  activeTab: Tab | null;
  /** In the terminal, switch tabs in place; elsewhere omit it and the dock navigates. */
  onTab?: (t: Tab) => void;
}) {
  const [location, setLocation] = useLocation();
  const path = location.split('?')[0];
  const go = (t: Tab) => (onTab ? onTab(t) : setLocation(tabHref(t)));

  return (
    <nav
      aria-label="Sections"
      className="qe-dock fixed inset-x-2 z-50 lg:hidden"
      style={{ bottom: 'calc(8px + env(safe-area-inset-bottom))' }}
    >
      <ul className="grid grid-cols-5 gap-1 rounded-2xl border border-[var(--lx-line-hi)] bg-[color-mix(in_srgb,var(--lx-surface)_94%,transparent)] p-1.5 shadow-[var(--lx-shadow-pop)] backdrop-blur-xl">
        {MOBILE_DOCK.map((item) => {
          const page = item.kind === 'page' ? PAGES.find((p) => p.href === item.href) : undefined;
          const key = item.kind === 'page' ? item.href : item.tab;
          const label = item.kind === 'page' ? (page ? pageShort(page) : item.href) : TAB_SHORT[item.tab];
          const active = item.kind === 'page' ? activeTab == null && path === item.href : activeTab === item.tab;
          const PageIcon = page?.icon;
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                onClick={() => (item.kind === 'page' ? setLocation(item.href) : go(item.tab))}
                aria-current={active ? 'page' : undefined}
                data-testid={`dock-${item.kind === 'page' ? item.href.slice(1) : item.tab}`}
                className={cn(
                  'lx-focus relative flex h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold leading-none transition-colors',
                  active ? 'text-[var(--lx-accent-text)]' : 'text-[var(--lx-dim)] hover:text-[var(--lx-text)]',
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-xl border border-[color-mix(in_srgb,var(--lx-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--lx-accent)_16%,transparent)] animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
                  />
                )}
                <span className="relative">{item.kind === 'page' ? (PageIcon ? <PageIcon className="h-[18px] w-[18px]" /> : null) : <MobileTabIcon tab={item.tab} />}</span>
                <span className="relative max-w-full truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phone top-bar menu: every destination that is not in the dock, plus account pages. */
export function MobileMenuButton({ activeTab, onTab }: { activeTab: Tab | null; onTab?: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), { panelRef: sheetRef, triggerRef: btnRef, trap: true });
  const path = location.split('?')[0];
  const target = { activeTab, currentPath: path, onTab, go: setLocation, omitTabs: MOBILE_PRIMARY, omitPages: MOBILE_PRIMARY_PAGES };
  const inMenu = (activeTab != null && MOBILE_MORE.includes(activeTab))
    || [...PAGES, ...UTILITY_PAGES].some((p) => p.href === path && !MOBILE_PRIMARY_PAGES.includes(p.href));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? 'Close menu' : 'Open menu — Research, Manage, Account'}
        title="Menu — Research, Manage, Account"
        data-testid="mobile-menu"
        className={cn('lx-icon-btn lg:hidden', inMenu && !open && 'text-[var(--lx-accent-text)]')}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>
      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close menu"
            className="fixed inset-0 z-[70] bg-background/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200 motion-reduce:animate-none"
            onClick={() => setOpen(false)}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-x-2 top-[calc(52px+env(safe-area-inset-top))] z-[71] max-h-[calc(100dvh-140px)] overflow-y-auto rounded-2xl border border-[var(--lx-line-hi)] bg-[var(--lx-surface)] shadow-[var(--lx-shadow-pop)] lg:hidden animate-in fade-in slide-in-from-top-3 zoom-in-[.98] duration-200 motion-reduce:animate-none"
          >
            <LuxSidebar
              placement="sheet"
              label="Menu destinations"
              groups={[...navGroups(target), { id: 'more-utility', label: 'Account', items: utilityItems(target) }]}
              onAnyItem={() => setOpen(false)}
            />
          </div>
        </>
      )}
    </>
  );
}
