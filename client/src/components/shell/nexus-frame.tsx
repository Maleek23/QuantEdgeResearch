/**
 * NEXUS FRAME — the terminal's chrome around every standalone page.
 *
 * Replaces the legacy left-sidebar layout (AppSidebar + AuthHeader + Footer),
 * which the operator retired on 2026-09-24: "side bar pages was the last design,
 * scrap it". A page like /slate now wears the same topbar, the same desktop
 * tabs and the same mobile bottom dock as /t, so moving between the board and a
 * page no longer swaps the entire interface underneath you.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useMainHeightVar } from './main-height';
import { Link, useLocation } from 'wouter';
import { BookOpen, LogOut, Settings, SlidersHorizontal, Bell, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/hooks/useAuth';
import qeMark from '@assets/qe-mark.svg';
import '@/styles/nexus.css';
import { PAGES, UTILITY_PAGES } from './nav-model';
import { MobileDock, MobileMenuButton } from './mobile-dock';
import { CustomizePanel } from './customize-panel';
import { DesktopRail } from './desktop-rail';
import { SkipLink, MAIN_CONTENT_ID } from './skip-link';
import { LuxTopBar } from '@/components/lux/lux-topbar';
import { LuxMenu, LuxMenuContent, LuxMenuItem, LuxMenuLabel, LuxMenuSeparator, LuxMenuTrigger } from '@/components/lux/lux-menu';
import { usePageReveal } from '@/components/lux/lux-motion';
import { pageShort } from './nav-groups';

/**
 * ONE search for every framed page: the global CommandPalette (App.tsx) owns
 * ticker search, page jumps and ⌘K. This trigger only opens it — before
 * 2026-09-29 the palette's only click trigger lived in the never-rendered
 * AuthHeader, so framed pages (and every phone) had no search at all.
 */
const openPalette = () => window.dispatchEvent(new Event('qe:open-command-palette'));

export function NexusFrame({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const path = location.split('?')[0];
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useMainHeightVar(mainRef);
  usePageReveal(mainRef, path);
  const nexusLight = theme === 'nexus-light';
  const page = [...PAGES, ...UTILITY_PAGES].find((p) => p.href === path)
    ?? (path.startsWith('/r') ? { href: path, label: 'Research', short: 'RESEARCH', icon: PAGES[0].icon } : undefined);
  const accountLabel = (user as any)?.firstName || (user as any)?.email?.split('@')[0] || 'Account';
  const pageTitle = page ? pageShort(page) : undefined;
  // /r/META → "Research / META" in the bar; the page itself owns its <h1>.
  const researchSym = path.startsWith('/r/') ? decodeURIComponent(path.split('/')[2] ?? '').toUpperCase() : '';

  return (
    <div className={cn('qe-terminal nexus-vars flex h-[100dvh] overflow-hidden w-full min-w-0 max-w-[100vw] flex-col', nexusLight && 'light')}>
      <DesktopRail activeTab={null} currentPath={path} />
      <SkipLink />
      <header className="relative z-20 shrink-0 lg:pl-[var(--qe-rail-w,196px)]">
        <LuxTopBar
          className="topbar lx-topbar"
          title={researchSym || pageTitle}
          crumb={researchSym ? 'Research' : undefined}
          titleDesktopOnly
          leading={
            <Link href="/today" className="brand lg:hidden" aria-label="Quant Edge Labs — home">
              <img className="brand-logo" src={qeMark} alt="" width={22} height={22} />
              <span className="brand-name">QUANTEDGE</span>
              <span className="brand-slash">{'//'}</span>
              <span className="brand-sub">{page ? page.short : 'TERMINAL'}</span>
            </Link>
          }
        >
          {/* Phones: icon trigger — the palette is a full-width dialog there. */}
          <button
            type="button"
            onClick={openPalette}
            aria-label="Search tickers and pages"
            title="Search tickers and pages"
            data-testid="frame-search-mobile"
            className="lx-icon-btn lg:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
          <MobileMenuButton activeTab={null} />
          {/* Desktop: the terminal's .search chrome, as a ⌘K palette trigger. */}
          <div className="hidden lg:block">
            <button
              type="button"
              className="search"
              onClick={openPalette}
              aria-label="Open command palette"
              data-testid="frame-search"
              style={{ cursor: 'pointer', background: 'transparent' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <span style={{ fontSize: 'var(--fs-10-5, 10.5px)', color: 'var(--text-mute)' }}>Search any ticker or page</span>
              <span className="search-kbd">⌘K</span>
            </button>
          </div>

          <LuxMenu>
            <LuxMenuTrigger aria-label="Open account menu" className="user-chip">
              <div className="user-avatar">{accountLabel.slice(0, 1).toUpperCase()}</div>
              <span className="user-name hidden lg:inline">{accountLabel}</span>
            </LuxMenuTrigger>
            <LuxMenuContent aria-label="Account">
              <LuxMenuLabel title={accountLabel} sub={(user as any)?.email ?? 'Guest'} />
              <LuxMenuSeparator />
              <LuxMenuItem icon={<Bell />} onSelect={() => setLocation('/alerts')}>Alerts</LuxMenuItem>
              <LuxMenuItem icon={<BookOpen />} onSelect={() => setLocation('/how-to')}>How to use</LuxMenuItem>
              <LuxMenuItem icon={<SlidersHorizontal />} onSelect={() => setCustomizeOpen(true)}>Display & layout</LuxMenuItem>
              <LuxMenuItem icon={<Settings />} onSelect={() => setLocation('/settings')}>Settings</LuxMenuItem>
              {user && (
                <>
                  <LuxMenuSeparator />
                  <LuxMenuItem icon={<LogOut />} onSelect={() => logout()}>Sign out</LuxMenuItem>
                </>
              )}
            </LuxMenuContent>
          </LuxMenu>
        </LuxTopBar>
      </header>

      {/* overflow-x contained HERE: one wide table (the GEX strike matrix, a filter
          row) used to widen the whole document, and iOS then zoomed the entire
          page out — dock included (measured: /r/META 1572px on a 393px phone). */}
      <main ref={mainRef} id={MAIN_CONTENT_ID} tabIndex={-1} className="outline-none min-h-0 w-full min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[var(--qe-rail-w,196px)]">
        {children}
      </main>

      <MobileDock activeTab={null} />
      <CustomizePanel open={customizeOpen} onClose={() => setCustomizeOpen(false)} />

      <footer className="bottombar hidden shrink-0 lg:flex lg:pl-[var(--qe-rail-w,196px)]" style={{ minHeight: 26 }}>
        <div className="bb-item"><span className="dot" /><b>{page ? page.short : 'PAGE'}</b></div>
        <div className="bb-spacer" />
        <div className="bb-item">Educational only · not investment advice</div>
      </footer>
    </div>
  );
}
