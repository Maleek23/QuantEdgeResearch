/**
 * TERMINAL — the one shell. Replaces the scattered pages with a single persistent
 * chrome + 10 tabs (NEXUS · CHART · FLOW · GEX · LEAPS · CRYPTO · CATALYST ·
 * BOT · POSITIONS · JOURNAL), the MomoEdge grammar
 * applied to QuantEdge's real engines. Everything moves via the shared motion
 * system; the tab underline slides (layoutId) and content cross-fades.
 *
 * This is the consolidation target for AUDIT.md / BLUEPRINT.md / TERMINAL_SPEC.md.
 */
import { CopyLinkButton } from '@/components/shell/copy-link-button';
import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { onWorkup } from '@/lib/workup-bus';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Bitcoin, Bot, BookOpen, CalendarDays, CandlestickChart, Grid3X3,
  LogOut, MoreHorizontal, Radar, Search, SlidersHorizontal,
  TrendingUp, UserRound, Wallet, X, Zap, Bell, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE } from '@/lib/motion';
;
// Market-focus overlays render only when opened — keep them (and their chart
// code) out of the eager /t chunk.
const RotationMap = lazy(() => import('@/components/rotation-map').then(m => ({ default: m.RotationMap })));
const SessionBrief = lazy(() => import('@/components/oracle/session-brief').then(m => ({ default: m.SessionBrief })));
const OracleMarketField = lazy(() => import('@/components/oracle/oracle-market-field').then(m => ({ default: m.OracleMarketField })));
import { FooterMarketLine } from '@/components/oracle/oracle-rails';
import { LiveStatsBar } from '@/components/footer';
import { TerminalAlerts, AlertBell, useSignalAlerts } from '@/components/terminal/terminal-alerts';
import { useQuery } from '@tanstack/react-query';
import { CONVICTIONS_QUERY_KEY, type ConvictionsResponse } from '@/lib/convictions';
import { useStockContext } from '@/contexts/stock-context';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/hooks/useAuth';
import { KitStyles } from '@/components/templates/kit';
import quantEdgeLogoUrl from '@assets/qe-mark.svg';
import '@/styles/nexus.css';
import { TerminalTickerSearch } from '@/components/terminal/terminal-ticker-search';
import { SystemPulse } from '@/components/terminal/system-pulse';
// The palette renders nothing while closed, so load it on first open.
const CommandPalette = lazy(() => import('@/components/terminal/command-palette').then(m => ({ default: m.CommandPalette })));
// Non-default tabs and closed overlays must not tax Oracle's first paint. Keeping
// these as static imports made charting, bot analytics and settings code part of
// every terminal visit even when the user never opened those surfaces.
const TerminalGuide = lazy(() => import('@/components/terminal/terminal-guide').then(m => ({ default: m.TerminalGuide })));
const TerminalSettings = lazy(() => import('@/components/terminal/terminal-settings').then(m => ({ default: m.TerminalSettings })));

// Every tab below is a TOOL DASHBOARD (components/dashboard — the FLOW tab's
// framework generalised): named dashboards, Add tool from the one registry,
// drag/resize grid, Restore default. The previous boards live on as tools.
const Dashboard     = lazy(() => import('@/components/dashboard/dashboard').then(m => ({ default: m.Dashboard })));
// JOURNAL keeps its own sub-tabs (owned by the journal branch), synced to ?jtab=.
// Every other tab's previous board is registered as an "all-in-one" tool.
const JournalPanel = lazy(() => import('@/pages/shells/journal-shell'));
const SectorsPage = lazy(() => import('@/pages/sectors'));
// NEXUS = the board + a 0DTE view (?nx=0dte) — components/zerodte/nexus-views.tsx.
const NexusViews = lazy(() => import('@/components/zerodte/nexus-views'));

// Tabs, mobile dock and "More" live in ONE shared model so the terminal and
// every standalone page (NexusFrame) wear identical navigation.
import { TABS, type Tab } from '@/components/shell/nav-model';
import { MobileDock, MobileMenuButton } from '@/components/shell/mobile-dock';
// Renders nothing while closed — loaded on first open (perf 2026-09-30).
const CustomizePanel = lazy(() => import('@/components/shell/customize-panel').then((m) => ({ default: m.CustomizePanel })));
import { DesktopRail } from '@/components/shell/desktop-rail';
import { SkipLink, MAIN_CONTENT_ID } from '@/components/shell/skip-link';
import { useMainHeightVar } from '@/components/shell/main-height';
import { LuxTopBar } from '@/components/lux/lux-topbar';
import { LuxMenu, LuxMenuContent, LuxMenuItem, LuxMenuLabel, LuxMenuSeparator, LuxMenuTrigger } from '@/components/lux/lux-menu';
import { TAB_SHORT, TAB_TITLE } from '@/components/shell/nav-groups';
import { RouteFallback } from '@/components/ui/qe-loading';
import { skeletonTiles, type PageId } from '@/components/dashboard/pages';

/** Terminal tab → the dashboard page it renders (JOURNAL is not a dashboard). */
const TAB_PAGE: Partial<Record<Tab, PageId>> = {
  oracle: 'nexus', chart: 'chart', flow: 'flow', gex: 'gex', leaps: 'leaps',
  crypto: 'crypto', catalyst: 'catalyst', bot: 'bot', positions: 'positions',
};
export { TABS };
export type { Tab };

/**
 * The footer's uptime clock, isolated in its own component. It used to be a
 * hook on TerminalShell itself, so its 1 s setState re-rendered the entire
 * terminal — every tab body, every chart, every table — once a second.
 */
function Uptime() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  return <b className="tabular-nums">{`${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`}</b>;
}

const isTab = (v: string | null): v is Tab => !!v && TABS.some((t) => t.id === v);

/**
 * Both of these tabs used to exist at this level and now live inside GEX. Anyone
 * with a bookmark, an open pin, or the muscle memory for ?tab=prism should land on
 * the surface they meant rather than being dropped on Oracle with no explanation —
 * a removed tab that silently resolves elsewhere reads as a bug.
 */
const MOVED_TABS: Record<string, Tab> = { prism: 'gex', heatmap: 'gex' };
const resolveTab = (v: string | null): Tab =>
  isTab(v) ? v : (v && MOVED_TABS[v]) || 'oracle';
/** A ?tab= value that is neither a tab nor a known move — surfaced, not swallowed (F7.12). */
const unknownTabOf = (v: string | null): string | null =>
  v && !isTab(v) && !MOVED_TABS[v] ? v : null;

/** First-run flag: absent → the guide opens on the first /t visit (T9). */
const ONBOARDED_KEY = 'qe-onboarded-v1';

type MarketFocus = 'pulse' | 'rotation' | 'brief';
const MARKET_FOCUS_COPY: Record<MarketFocus, { eyebrow: string; title: string; description: string }> = {
  pulse: {
    eyebrow: 'Market participation',
    title: 'Market Pulse',
    description: 'Broad asset participation and where money is rotating right now.',
  },
  rotation: {
    eyebrow: 'Relative rotation',
    title: 'Rotation Map',
    description: 'Relative strength × momentum across the sector universe.',
  },
  brief: {
    eyebrow: 'Leadership tape',
    title: 'Session Brief',
    description: 'The groups carrying today’s tape, and the names inside them.',
  },
};

export default function TerminalShell() {
  // Tab lives in the URL (?tab=gex) so it's deep-linkable, shareable, survives a reload,
  // and lets legacy routes redirect straight to the right surface.
  const [location, setLocation] = useLocation();
  const search = useSearch(); // ?tab= changes within /t must re-run the sync below
  const urlTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const [tab, setTabState] = useState<Tab>(resolveTab(urlTab));
  const [unknownTab, setUnknownTab] = useState<string | null>(unknownTabOf(urlTab));

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const path = window.location.pathname;
    // 'oracle' is the id, NEXUS is the surface: the front tab renders the
    // NEXUS board INSIDE this shell — one chrome, one nav, no second page.
    setLocation(next === 'oracle' ? path : `${path}?tab=${next}`, { replace: true });
  }, [setLocation]);


  // Follow back/forward and external navigations that change ?tab=
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    // resolveTab (not a bare isTab) so MOVED_TABS (prism/heatmap → gex) survive
    // this effect's first run instead of being reset to NEXUS.
    const next = resolveTab(t);
    setTabState((cur) => (next === cur ? cur : next));
    setUnknownTab(unknownTabOf(t));
  }, [location, search]);

  const [guideOpen, setGuideOpen] = useState(false);
  // First /t visit: open the guide once. Storage can throw (private mode) — then
  // we simply don't auto-open rather than nag on every visit.
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDED_KEY)) setGuideOpen(true);
    } catch { /* storage unavailable — skip onboarding */ }
  }, []);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    try { localStorage.setItem(ONBOARDED_KEY, new Date().toISOString()); } catch { /* non-critical */ }
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  // ⌘K from anywhere in the terminal opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [marketFocus, setMarketFocus] = useState<MarketFocus | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Alerts watch the same conviction feed the Oracle tab renders, so they fire on any
  // tab — the point of an alert is that it reaches you when you are NOT looking at it.
  const { data: convictions } = useQuery<ConvictionsResponse>({
    // Same key as every other unparameterised /api/convictions reader
    // (Today, Alerts) so React Query dedupes them into one request.
    queryKey: [...CONVICTIONS_QUERY_KEY],
    queryFn: async () => {
      const r = await fetch('/api/convictions', { credentials: 'include' });
      if (!r.ok) throw new Error('convictions failed');
      return r.json();
    },
    staleTime: 60_000, refetchInterval: 90_000, retry: 1,
  });
  const alerts = useSignalAlerts(convictions?.picks);
  const reduce = useReducedMotion();
  // One ticker for the whole terminal: search once, every tab follows it.
  const { currentStock, setCurrentStock } = useStockContext();
  // ONE ticker destination. Search, flow rows, rotation/session names and every
  // openWorkup() call land on the same deep-linkable Research shell. The old
  // behavior mixed context-only changes, modal dossiers and tab switches.
  const openResearch = useCallback((symbol: string, name?: string, researchTab: 'workup' | 'chart' | 'flow' | 'gex' = 'workup') => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setCurrentStock({ symbol: sym, name });
    const params = new URLSearchParams();
    if (researchTab !== 'workup') params.set('tab', researchTab);
    params.set('from', `terminal-${tab}`);
    setLocation(`/r/${encodeURIComponent(sym)}?${params.toString()}`);
  }, [setCurrentStock, setLocation, tab]);
  useEffect(() => onWorkup((sym) => openResearch(sym)), [openResearch]);
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { data: health } = useQuery<{
    status?: string;
    /** true only when a configured provider the product uses (Alpaca, Schwab, CBOE, Yahoo, Bullflow) is down */
    dataPartial?: boolean;
    dataPartialProviders?: string[];
    checks?: { postgres?: { ok?: boolean } };
  }>({
    queryKey: ['/api/health', 'terminal-chrome'],
    queryFn: async () => {
      const response = await fetch('/api/health', { credentials: 'include' });
      if (!response.ok) throw new Error('health unavailable');
      return response.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 0,
  });
  // Server-side truth (server/data-provider-health.ts): partial only when a feed
  // the product actually uses is down — never because of a retired provider.
  const dataPartial = health?.dataPartial === true;
  const dbDown = health?.checks?.postgres?.ok === false;
  const mainRef = useRef<HTMLElement>(null);
  useMainHeightVar(mainRef);
  const accountLabel = user?.firstName || user?.email?.split('@')[0] || 'Account';
  const accountInitial = accountLabel.slice(0, 1).toUpperCase();

  return (
    <div className={cn('qe-terminal nexus-vars h-[100dvh] overflow-hidden flex flex-col', theme === 'nexus-light' && 'light')}>
      <KitStyles />
      <DesktopRail activeTab={tab} currentPath="/t" onTab={setTab} />
      {/* ── persistent chrome — the reference terminal's topbar, verbatim
             classes from styles/nexus.css. Every tab wears it. ── */}
      <SkipLink />
      <header className="relative z-20 shrink-0 lg:pl-[var(--qe-rail-w,196px)]">
        <LuxTopBar
          className="topbar lx-topbar"
          title={TAB_TITLE[tab]}
          crumb="Terminal"
          titleDesktopOnly
          leading={
            <Link href="/today" className="brand lg:hidden" aria-label="QuantEdge — home" style={{ textDecoration: 'none' }}>
              <img className="brand-logo" src={quantEdgeLogoUrl} alt="QuantEdge" />
              <span className="brand-name">QUANTEDGE</span>
              <span className="brand-slash">{'//'}</span>
              <span className="brand-sub hidden sm:inline">TERMINAL</span>
            </Link>
          }
        >
          <div className="status-chip ok hidden sm:flex"><span className="dot" />Engaged</div>
          <div
            className={cn('status-chip hidden lg:flex', !health ? '' : dataPartial || dbDown ? 'warn' : 'ok')}
            title={!health
              ? 'Data status unknown — the health check has not answered yet'
              : dbDown
                ? 'The database is unreachable — saved data may not load'
                : dataPartial
                  ? `Down now: ${(health.dataPartialProviders ?? []).join(', ') || 'a data provider'}. Reads that depend on it fall back to the next provider or show their age.`
                  : 'Data providers in use (Alpaca · CBOE delayed · Yahoo, plus Bullflow / Schwab when configured) are answering'}
          >
            <span className="dot" />{!health ? 'Checking data…' : dbDown ? 'Data offline' : dataPartial ? 'Data partial' : 'Data ready'}
          </div>

          {/* Phones: inline ticker search row below the bar. */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen((open) => !open)}
            aria-label="Search ticker"
            title="Search tickers and pages"
            aria-expanded={mobileSearchOpen}
            className="lx-icon-btn lg:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
          <MobileMenuButton activeTab={tab} onTab={setTab} />
          {/* Desktop search is a ⌘K PALETTE TRIGGER, not an inline dropdown —
              clicking it (or ⌘K from anywhere) opens the command palette. */}
          <div className="hidden lg:block">
            <button
              type="button"
              className="search"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              style={{ cursor: 'pointer', background: 'transparent' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              {currentStock?.symbol ? (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', fontWeight: 700, letterSpacing: 0.8, color: 'var(--cyan-bright, #3b8cff)' }}>{currentStock.symbol}</span>
              ) : (
                <span style={{ fontSize: 'var(--fs-10-5, 10.5px)', color: 'var(--text-mute)' }}>Search any ticker</span>
              )}
              <span className="search-kbd">⌘K</span>
            </button>
          </div>

          <CopyLinkButton />
          {/* Account menu — alerts, guide, theme, layout and settings live here
              so the bar itself stays calm. One menu implementation (LuxMenu). */}
          <LuxMenu>
            <LuxMenuTrigger aria-label="Open account menu" className="user-chip">
              <div className="user-avatar">{accountInitial}</div>
              <span className="user-name hidden lg:inline">{accountLabel}</span>
              {alerts.unread > 0 && (
                <span
                  className="grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
                  style={{ background: 'rgba(59,140,255,0.15)', color: 'var(--cyan-bright)', border: '1px solid rgba(59,140,255,0.3)' }}
                  aria-label={`${alerts.unread} unread alerts`}
                >
                  {alerts.unread}
                </span>
              )}
            </LuxMenuTrigger>
            <LuxMenuContent aria-label="Account">
              <LuxMenuLabel title={accountLabel} sub={user?.email ?? 'Guest'} />
              <LuxMenuSeparator />
              <LuxMenuItem icon={<Bell />} end={alerts.unread > 0 ? alerts.unread : undefined} onSelect={() => { setAlertsOpen(true); alerts.setUnread(0); }}>Alerts</LuxMenuItem>
              <LuxMenuItem icon={<BookOpen />} onSelect={() => setGuideOpen(true)}>Guide</LuxMenuItem>
              <LuxMenuItem icon={<SlidersHorizontal />} onSelect={() => setCustomizeOpen(true)}>Display and layout</LuxMenuItem>
              <LuxMenuItem icon={<UserRound />} onSelect={() => setSettingsOpen(true)}>Preferences and risk</LuxMenuItem>
              <LuxMenuItem icon={<Settings />} onSelect={() => setLocation('/settings')}>Account settings</LuxMenuItem>
              {user && (
                <>
                  <LuxMenuSeparator />
                  <LuxMenuItem icon={<LogOut />} onSelect={() => logout()}>Sign out</LuxMenuItem>
                </>
              )}
            </LuxMenuContent>
          </LuxMenu>
        </LuxTopBar>
        <AnimatePresence initial={false}>
          {mobileSearchOpen && (
            <motion.div
              className="border-t border-border/45 px-3 py-2 lg:hidden"
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduce ? undefined : { opacity: 0, height: 0 }}
            >
              <TerminalTickerSearch
                compact
                value={currentStock?.symbol}
                onSelect={(result) => {
                  openResearch(result.symbol, result.name);
                  setMobileSearchOpen(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── tab content (cross-fades) ── */}
      <main ref={mainRef} id={MAIN_CONTENT_ID} tabIndex={-1} className="relative outline-none min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-[var(--qe-rail-w,196px)]">
        {unknownTab && (
          <div role="status" className="flex items-center gap-3 border-b border-[var(--brand-gold)]/30 bg-[var(--brand-gold)]/[0.06] px-4 py-2 font-mono text-[11px] text-foreground/85">
            <span>No tab called ‘{unknownTab}’ — showing NEXUS instead.</span>
            <button
              type="button"
              onClick={() => setUnknownTab(null)}
              aria-label="Dismiss notice"
              className="ml-auto inline-flex cursor-pointer items-center rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {/* Some market modules keep long-lived subscriptions and nested layout
            animations. `mode="wait"` can leave the outgoing module mounted at
            opacity 0 while it waits for every descendant to finish exiting,
            producing a blank terminal after a tab change. Sync keeps the handoff
            animated without allowing one module to block the next. */}
        {/* popLayout: the outgoing tab is taken out of flow while it fades, so
            main's scroll height never doubles during a switch (main is the
            scroll container now that the shell is exactly one viewport tall). */}
        <AnimatePresence mode="popLayout" initial={false}>
          {/* Opacity only, 120ms (docs/DESIGN_SYSTEM.md "Loading"): a slide
              shifted the whole page 8px on every tab change. */}
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.12, ease: EASE }}
          >
            <Suspense fallback={<Fallback tab={tab} />}>
              {tab === 'oracle' && <NexusViews />}
              {tab === 'chart' && <Dashboard page="chart" />}
              {/* clicking a ticker sets the shared symbol, so PRISM/GEX follow it.
                  Full-bleed: the FLOW mock owns its own two-column layout. */}
              {tab === 'flow' && <Dashboard page="flow" />}
              {tab === 'gex' && <Dashboard page="gex" />}
              {tab === 'sectors' && <SectorsPage />}
              {tab === 'leaps' && <Dashboard page="leaps" />}
              {tab === 'crypto' && <Dashboard page="crypto" />}
              {tab === 'catalyst' && <Dashboard page="catalyst" />}
              {tab === 'bot' && <Dashboard page="bot" />}
              {tab === 'positions' && <Dashboard page="positions" />}
              {tab === 'journal' && <JournalPanel />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>


      <MobileDock activeTab={tab} onTab={setTab} />
      {customizeOpen && (
        <Suspense fallback={null}>
          <CustomizePanel open onClose={() => setCustomizeOpen(false)} />
        </Suspense>
      )}

      {/* Each live market view has a full-screen focus mode. The stage stays comparable
          at a glance; a reader can then inspect one real source without it becoming
          a taller card inside the scrolling Oracle book. */}
      <AnimatePresence>
        {tab === 'oracle' && marketFocus && (
          <motion.div
            className="qe-focus-overlay fixed inset-0 z-[60] grid place-items-center bg-background/55 p-3 backdrop-blur-md md:p-6"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            onMouseDown={() => setMarketFocus(null)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label={`${MARKET_FOCUS_COPY[marketFocus].title} full view`}
              className="qe-focus-panel flex max-h-[calc(100dvh-24px)] w-full max-w-[1480px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/50"
              initial={reduce ? false : { opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: 0.24, ease: EASE }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3 md:px-5">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--brand-cyan)]">{MARKET_FOCUS_COPY[marketFocus].eyebrow}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{MARKET_FOCUS_COPY[marketFocus].title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{MARKET_FOCUS_COPY[marketFocus].description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMarketFocus(null)}
                  className="inline-flex items-center gap-1 border border-border/70 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-[var(--brand-cyan)] hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Close
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto p-3 md:p-5">
                <Suspense fallback={<div className="p-4 font-mono text-[11px] text-muted-foreground">Loading…</div>}>
                  {marketFocus === 'pulse' && <OracleMarketField expanded onSelectSymbol={(sym) => openResearch(sym)} />}
                  {marketFocus === 'rotation' && <RotationMap expanded />}
                  {marketFocus === 'brief' && <SessionBrief expanded onSelectSymbol={(sym) => openResearch(sym)} />}
                </Suspense>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {guideOpen && (
        <Suspense fallback={null}>
          <TerminalGuide tab={tab} open onClose={closeGuide} />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <TerminalSettings open onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      <TerminalAlerts
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        feed={alerts.feed}
        setFeed={alerts.setFeed}
        prefs={alerts.prefs}
        update={alerts.update}
      />

      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open
            onClose={() => setPaletteOpen(false)}
            onTicker={(symbol, name) => openResearch(symbol, name)}
            onTab={(t) => setTab(t as Tab)}
            tabs={TABS.map((t) => ({ ...t, display: TAB_SHORT[t.id] }))}
          />
        </Suspense>
      )}

      {/* ── footer — the reference bottombar. Same real content as before:
             LiveStatsBar (bots/watchlist/VIX) and the market line (session ·
             SPY · BTC · next poll · clock) ride inside his chrome. ── */}
      <footer className="bottombar shrink-0 overflow-hidden whitespace-nowrap lg:pl-[var(--qe-rail-w,196px)]" style={{ height: 26 }}>
        <div className="bb-item"><span className="dot" /><b>{TAB_SHORT[tab].toUpperCase()}</b> engaged</div>
        <div className="bb-sep" />
        <SystemPulse />
        <div className="bb-sep hidden md:block" />
        <div className="bb-item hidden md:flex">Uptime <Uptime /></div>
        <div className="bb-sep hidden md:block" />
        <span className="hidden items-center md:inline-flex">
          <LiveStatsBar />
        </span>
        <div className="bb-spacer" />
        <span className="hidden min-w-0 shrink items-center overflow-hidden lg:inline-flex">
          <FooterMarketLine className="text-[10px]" />
        </span>
        <div className="bb-sep hidden sm:block" />
        {/* the page's ONE disclaimer on desktop/tablet (the rail note was a second copy) — never clipped by the market line */}
        <div className="bb-item hidden shrink-0 sm:flex">Educational only · not investment advice</div>
      </footer>
    </div>
  );
}

/** Page-chunk fallback: the boot screen during boot, else this tab's own skeleton (shell stays mounted). */
function Fallback({ tab }: { tab: Tab }) {
  const page = TAB_PAGE[tab];
  return <RouteFallback tiles={page ? skeletonTiles(page) : undefined} />;
}
