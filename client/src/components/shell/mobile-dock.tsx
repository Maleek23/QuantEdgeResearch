/**
 * The bottom navigation — ONE component for the terminal and every page.
 * Four primary sections (Today, NEXUS, FLOW, GEX — nav-model MOBILE_DOCK) + More. More opens a sheet with the remaining
 * instruments and the standalone pages. Touch targets are ≥ 44pt (Apple HIG).
 *
 * 2026-09-29 lux pass: the dock and the rail share names, icons and grouping
 * (nav-groups.ts) — short sentence-case labels, accent bar on the active item —
 * and the More sheet IS the shared LuxSidebar (placement="sheet"), so the
 * phone and desktop menus are one implementation.
 */
import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, DUR } from '@/lib/motion';
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
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const reduce = useReducedMotion();
  // "More" sheet: Escape closes, Tab stays inside, focus returns to the More button.
  const moreRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), { panelRef: sheetRef, triggerRef: moreRef, trap: true });
  const path = location.split('?')[0];
  const go = (t: Tab) => { setOpen(false); onTab ? onTab(t) : setLocation(tabHref(t)); };
  const target = { activeTab, currentPath: path, onTab, go: setLocation, omitTabs: MOBILE_PRIMARY, omitPages: MOBILE_PRIMARY_PAGES };
  const onPage = [...PAGES, ...UTILITY_PAGES].some((p) => p.href === path && !MOBILE_PRIMARY_PAGES.includes(p.href));
  const goPage = (href: string) => { setOpen(false); setLocation(href); };
  const moreActive = open || (activeTab != null && MOBILE_MORE.includes(activeTab)) || onPage;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--lx-line)] bg-[color-mix(in_srgb,var(--lx-bg)_96%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <nav className="grid h-16 grid-cols-5 px-1" aria-label="Sections">
          {MOBILE_DOCK.map((item) => {
            const page = item.kind === 'page' ? PAGES.find((p) => p.href === item.href) : undefined;
            const key = item.kind === 'page' ? item.href : item.tab;
            const label = item.kind === 'page' ? (page ? pageShort(page) : item.href) : TAB_SHORT[item.tab];
            const active = item.kind === 'page' ? activeTab == null && path === item.href : activeTab === item.tab;
            const PageIcon = page?.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => (item.kind === 'page' ? goPage(item.href) : go(item.tab))}
                aria-current={active ? 'page' : undefined}
                data-testid={`dock-${item.kind === 'page' ? item.href.slice(1) : item.tab}`}
                className={cn(
                  'lx-focus relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                  active ? 'text-[var(--lx-accent-text)]' : 'text-[var(--lx-dim)]',
                )}
              >
                {active && <motion.span layoutId="mobile-dock-active" className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--lx-accent)]" />}
                {item.kind === 'page' ? (PageIcon ? <PageIcon className="h-[18px] w-[18px]" /> : null) : <MobileTabIcon tab={item.tab} />}
                <span>{label}</span>
              </button>
            );
          })}
          <button
            ref={moreRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              'lx-focus relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
              moreActive ? 'text-[var(--lx-accent-text)]' : 'text-[var(--lx-dim)]',
            )}
          >
            {moreActive && !open && <motion.span layoutId="mobile-dock-active" className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-[var(--lx-accent)]" />}
            <MoreHorizontal className="h-[18px] w-[18px]" />
            <span>More</span>
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              tabIndex={-1}
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="More sections"
              className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-[var(--lx-line-hi)] bg-[var(--lx-surface)] shadow-[var(--lx-shadow-pop)] lg:hidden"
              initial={reduce ? false : { opacity: 0, y: 16, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 12, scale: .98 }}
              transition={{ duration: DUR.fast, ease: EASE }}
            >
              <LuxSidebar
                placement="sheet"
                label="More destinations"
                groups={[...navGroups(target), { id: 'more-utility', label: 'Account', items: utilityItems(target) }]}
                onAnyItem={() => setOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
