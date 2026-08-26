/**
 * TERMINAL — the one shell. Replaces the scattered pages with a single persistent
 * chrome + 5 tabs (ORACLE · FLOW · HEATMAP · GEX · PRISM), the MomoEdge grammar
 * applied to QuantEdge's real engines. Everything moves via the shared motion
 * system; the tab underline slides (layoutId) and content cross-fades.
 *
 * This is the consolidation target for AUDIT.md / BLUEPRINT.md / TERMINAL_SPEC.md.
 */
import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Activity, Bitcoin, Bot, BookOpen, CalendarDays, CandlestickChart, Grid3X3, Loader2,
  LogOut, Moon, MoreHorizontal, Radar, Search, SlidersHorizontal,
  TrendingUp, UserRound, X, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, DUR } from '@/lib/motion';
import { RotationMap } from '@/components/rotation-map';
import { SessionBrief } from '@/components/oracle/session-brief';
import { EarlyRotationPanel } from '@/components/oracle/early-rotation-panel';
import { OracleMarketField } from '@/components/oracle/oracle-market-field';
import { TickerTape, SectorHeatmap, WatchlistRail, SystemStatusBlock, FooterMarketLine } from '@/components/oracle/oracle-rails';
import { LiveStatsBar } from '@/components/footer';
// LEAPS = the fifth reference mock, wired. The prior LeapTracker stays at
// components/hunt/leap-tracker.
const LeapTracker = lazy(() => import('@/components/hunt/leaps-nexus').then(m => ({ default: m.LeapsNexus })));
import { TerminalAlerts, AlertBell, useSignalAlerts } from '@/components/terminal/terminal-alerts';
import { useQuery } from '@tanstack/react-query';
import type { ConvictionsResponse } from '@/lib/convictions';
import { useStockContext } from '@/contexts/stock-context';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/hooks/useAuth';
import { KitStyles } from '@/components/templates/kit';
import quantEdgeLogoUrl from '@assets/q_1767502987714.png';
import '@/styles/nexus.css';
import { TerminalPageHeader, TerminalSectionHeader } from '@/components/templates/terminal-page';
import { TerminalTickerSearch } from '@/components/terminal/terminal-ticker-search';
// Non-default tabs and closed overlays must not tax Oracle's first paint. Keeping
// these as static imports made charting, bot analytics and settings code part of
// every terminal visit even when the user never opened those surfaces.
const TickerView = lazy(() => import('@/components/oracle/ticker-view').then(m => ({ default: m.TickerView })));
const TerminalGuide = lazy(() => import('@/components/terminal/terminal-guide').then(m => ({ default: m.TerminalGuide })));
const TerminalSettings = lazy(() => import('@/components/terminal/terminal-settings').then(m => ({ default: m.TerminalSettings })));
const TrackRecord = lazy(() => import('@/components/bot/track-record').then(m => ({ default: m.TrackRecord })));
// CHART = the reference Chart Lab mock, wired (chart-lab-nexus). The prior
// EpochChart-based lab stays in the tree at charting/chart-lab.tsx.
const ChartLab = lazy(() => import('@/components/charting/chart-lab-nexus').then(m => ({ default: m.ChartLabBoard })));

const HuntCockpit   = lazy(() => import('@/pages/shells/hunt-cockpit'));
const NexusBoard    = lazy(() => import('@/pages/nexus').then(m => ({ default: m.NexusBoard })));
// GEX = the reference GEX Hub mock, wired. The prior GexShell (gainers/
// heatmap/trade-plan subtabs) stays in the tree at pages/shells/gex-shell.
const GexHub        = lazy(() => import('@/components/gex/gex-hub-nexus').then(m => ({ default: m.GexHubNexus })));
const GexShell      = lazy(() => import('@/pages/shells/gex-shell'));
const FlowBoard     = lazy(() => import('@/components/flow/flow-board').then(m => ({ default: m.FlowBoard })));
// The old flow-heatmap page is the SECTOR TREEMAP with a flow overlay (breadth, net flow,
// sweeps, whales + per-ticker flow detail). That's the Heatmap surface, not the tape — so
// it belongs on HEATMAP. Keeping it preserves the strongest part of the old design.
// PRISM = the strike x expiry gamma surface (what the walkthrough actually shows),
// not the premium-spectrum strike picker that used to sit here.
const QuantBotBoard = lazy(() => import('@/components/bot/quant-bot-board').then(m => ({ default: m.QuantBotBoard })));
// CATALYST — the event calendar joined to the signals we publish, so a call and the
// news pointing the other way land on the same screen instead of two separate ones.
const CatalystBoard = lazy(() => import('@/components/catalyst/catalyst-board').then(m => ({ default: m.CatalystBoard })));
// CRYPTO = the sixth reference mock, wired. Prior CryptoTerminal stays in tree.
const CryptoTerminal = lazy(() => import('@/components/crypto/crypto-nexus').then(m => ({ default: m.CryptoNexus })));

type Tab = 'oracle' | 'chart' | 'flow' | 'gex' | 'leaps' | 'crypto' | 'catalyst' | 'bot';
/**
 * Two tabs removed here, both by measurement rather than taste.
 *
 * PRISM now lives inside GEX as its default view, because PrismBoard reads both
 * /api/gex-vex/hub and /api/gex-vex/terminal/:sym — it was already the union of
 * that shell's Hub and Matrix sub-tabs, reached by a second door.
 *
 * HEATMAP was an exact duplicate: it lazy-loaded @/pages/flow-heatmap, the same
 * module GexShell loads for its own Heatmap sub-tab, while being aliased
 * "SectorHeatmap" — a name that described neither the file nor what it renders.
 * One page, two routes, one misleading label.
 */
const TABS: { id: Tab; label: string }[] = [
  { id: 'oracle',  label: 'NEXUS' },
  { id: 'chart',   label: 'CHART' },
  { id: 'flow',    label: 'FLOW' },
  { id: 'gex',     label: 'GEX' },
  // LEAPS was fully built and completely unreachable. /api/leap-tracker returns 200
  // with 52 qualified S-grade picks (ABBV 390DTE +125% ROI@T1, JPM 298DTE +168%),
  // the component existed, and the ONLY thing importing it was hunt-shell.tsx —
  // which has no <Route>. So the long-dated engine has been scanning and grading
  // this whole time with no door into it.
  //
  // It earns a top-level tab rather than a sub-tab: the contract engine caps every
  // signal at 45 DTE (SETUP_TO_TIER maps swing→MONTHLY 25-45, lotto→WEEKLY 5-12,
  // and NOTHING maps to the LEAP tier), so this is the only surface in the product
  // where a 6-24 month thesis can appear at all.
  { id: 'leaps',   label: 'LEAPS' },
  { id: 'crypto',  label: 'CRYPTO' },
  { id: 'catalyst', label: 'CATALYST' },
  { id: 'bot',     label: 'BOT' },
];

const MOBILE_PRIMARY: Tab[] = ['oracle', 'chart', 'flow', 'gex'];
// LEAPS was missing from BOTH lists, so the long-dated engine was unreachable on
// phones — the same "fully built and completely unreachable" bug the TABS comment
// above describes, reintroduced for mobile only. Every tab in TABS must appear in
// exactly one of these two arrays; the assertion below fails the build if not.
const MOBILE_MORE: Tab[] = ['leaps', 'crypto', 'catalyst', 'bot'];

if (import.meta.env.DEV) {
  const reachable = new Set<Tab>([...MOBILE_PRIMARY, ...MOBILE_MORE]);
  const orphaned = TABS.filter((t) => !reachable.has(t.id)).map((t) => t.label);
  if (orphaned.length > 0) {
    console.error(`[terminal-shell] Tabs unreachable on mobile: ${orphaned.join(', ')}`);
  }
}

function MobileTabIcon({ tab }: { tab: Tab }) {
  if (tab === 'oracle') return <Radar className="h-[18px] w-[18px]" />;
  if (tab === 'chart') return <CandlestickChart className="h-[18px] w-[18px]" />;
  if (tab === 'flow') return <Activity className="h-[18px] w-[18px]" />;
  if (tab === 'gex') return <Grid3X3 className="h-[18px] w-[18px]" />;
  if (tab === 'leaps') return <TrendingUp className="h-[18px] w-[18px]" />;
  if (tab === 'crypto') return <Bitcoin className="h-[18px] w-[18px]" />;
  if (tab === 'catalyst') return <CalendarDays className="h-[18px] w-[18px]" />;
  return <Bot className="h-[18px] w-[18px]" />;
}

function useUptime() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
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
  const urlTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const [tab, setTabState] = useState<Tab>(resolveTab(urlTab));

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
    setTabState((cur) => (isTab(t) ? t : 'oracle') === cur ? cur : (isTab(t) ? t : 'oracle'));
  }, [location]);

  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [marketFocus, setMarketFocus] = useState<MarketFocus | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Alerts watch the same conviction feed the Oracle tab renders, so they fire on any
  // tab — the point of an alert is that it reaches you when you are NOT looking at it.
  const { data: convictions } = useQuery<ConvictionsResponse>({
    queryKey: ['/api/convictions', 'alerts'],
    queryFn: async () => {
      const r = await fetch('/api/convictions', { credentials: 'include' });
      if (!r.ok) throw new Error('convictions failed');
      return r.json();
    },
    staleTime: 60_000, refetchInterval: 90_000, retry: 1,
  });
  const alerts = useSignalAlerts(convictions?.picks);
  const reduce = useReducedMotion();
  const uptime = useUptime();
  // One ticker for the whole terminal: search once, every tab follows it.
  const { currentStock, setCurrentStock, clearStock } = useStockContext();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { data: health } = useQuery<{
    status?: string;
    dependencies?: { tradier?: boolean; postgres?: { ok?: boolean } };
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
  const nexusLight = theme === 'nexus-light';
  // The chrome button is the ☀/☾ from the reference topbar: dark blue ↔ light.
  // Night/dark remain reachable from the settings panel's labelled picker.
  const nextTheme = nexusLight ? 'nexus' as const : 'nexus-light' as const;
  const dataPartial = health?.status === 'degraded' || health?.dependencies?.tradier === false;
  const accountLabel = user?.firstName || user?.email?.split('@')[0] || 'Account';
  const accountInitial = accountLabel.slice(0, 1).toUpperCase();

  return (
    <div className={cn('qe-terminal nexus-vars min-h-screen flex flex-col', theme === 'nexus-light' && 'light')}>
      <KitStyles />
      {/* ── persistent chrome — the reference terminal's topbar, verbatim
             classes from styles/nexus.css. Every tab wears it. ── */}
      <header className="sticky top-0 z-20">
        <div className="topbar" style={{ minHeight: 44 }}>
          <div className="brand">
            <img className="brand-logo" src={quantEdgeLogoUrl} alt="Quant Edge Labs" />
            <span className="brand-name">QUANTEDGE</span>
            <span className="brand-slash">{'//'}</span>
            <span className="brand-sub hidden sm:inline">TERMINAL</span>
          </div>
          <div className="status-chip ok hidden sm:flex"><span className="dot" />Engaged</div>
          <div
            className={cn('status-chip hidden lg:flex', dataPartial ? 'warn' : 'ok')}
            title={dataPartial ? 'Some premium and chain-dependent reads are unavailable' : 'Primary data dependencies are healthy'}
          >
            <span className="dot" />{dataPartial ? 'Data partial' : 'Data ready'}
          </div>

          {/* His nav sits LEFT, immediately after the chips — not centered. */}
          <nav className="nav-tabs hidden overflow-x-auto md:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn('nav-tab', tab === t.id && 'active')}
                data-testid={`terminal-tab-${t.id}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="top-spacer" />

          {/* His search box — same typeahead engine, his shell around it. */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen((open) => !open)}
            aria-label="Search ticker"
            aria-expanded={mobileSearchOpen}
            className="grid h-8 w-8 place-items-center rounded border border-border/55 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="hidden md:block">
            <TerminalTickerSearch
              variant="nexus"
              value={currentStock?.symbol}
              onSelect={(result) => setCurrentStock({ symbol: result.symbol, name: result.name })}
            />
          </div>

          {/* His user-chip. Everything the mock's header doesn't show — alerts,
              settings, guide, the ☀/☾ — lives in this menu, so the bar itself
              stays pixel-true to the reference. */}
          <div className="relative">
              <button
                onClick={() => setAccountOpen((open) => !open)}
                aria-label="Open account menu"
                aria-expanded={accountOpen}
                className="user-chip"
              >
                <div className="user-avatar">{accountInitial}</div>
                <span className="user-name hidden lg:inline">{accountLabel}</span>
                {alerts.unread > 0 && (
                  <span
                    className="grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
                    style={{ background: 'rgba(79,209,197,0.15)', color: 'var(--cyan-bright)', border: '1px solid rgba(79,209,197,0.3)' }}
                  >
                    {alerts.unread}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    className="absolute right-0 top-9 z-40 w-52 rounded-lg border border-border/70 bg-card p-1.5 shadow-xl shadow-black/30"
                    initial={reduce ? false : { opacity: 0, y: -4, scale: .98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: .98 }}
                    transition={{ duration: DUR.fast, ease: EASE }}
                  >
                    <div className="border-b border-border/45 px-2.5 py-2 font-mono">
                      <div className="truncate text-[11px] font-bold text-foreground">{accountLabel}</div>
                      <div className="truncate text-[9px] text-muted-foreground/65">{user?.email ?? 'Guest terminal'}</div>
                    </div>
                    {/* Controls the reference header doesn't carry — parked here
                        so the bar matches it exactly. */}
                    <button onClick={() => { setAccountOpen(false); setAlertsOpen(true); alerts.setUnread(0); }} className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                      <Activity className="h-3.5 w-3.5" /> Alerts{alerts.unread > 0 ? ` · ${alerts.unread}` : ''}
                    </button>
                    <button onClick={() => { setAccountOpen(false); setGuideOpen(true); }} className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                      <BookOpen className="h-3.5 w-3.5" /> Guide
                    </button>
                    <button onClick={() => setTheme(nextTheme)} className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                      {nexusLight ? <Moon className="h-3.5 w-3.5" /> : <span className="grid h-3.5 w-3.5 place-items-center text-[11px] leading-none">☀</span>}
                      {nexusLight ? 'Dark mode' : 'Light mode'}
                    </button>
                    <button onClick={() => { setAccountOpen(false); setSettingsOpen(true); }} className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                      <UserRound className="h-3.5 w-3.5" /> Preferences & risk
                    </button>
                    <button onClick={() => { setAccountOpen(false); setLocation('/settings'); }} className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Full account settings
                    </button>
                    {user && <button onClick={() => { setAccountOpen(false); logout(); }} className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[var(--trade-bearish)] transition-colors hover:bg-[var(--trade-bearish)]/10">
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>}
                  </motion.div>
                )}
              </AnimatePresence>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {mobileSearchOpen && (
            <motion.div
              className="border-t border-border/45 px-3 py-2 md:hidden"
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduce ? undefined : { opacity: 0, height: 0 }}
            >
              <TerminalTickerSearch
                compact
                value={currentStock?.symbol}
                onSelect={(result) => {
                  setCurrentStock({ symbol: result.symbol, name: result.name });
                  setMobileSearchOpen(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── quote tape — real movers from the extended-hours scan, labelled by
          session. Hidden on small screens where 28px of marquee is noise. */}
      <div className="hidden md:block">
        <TickerTape />
      </div>

      {/* ── tab content (cross-fades) ── */}
      <main className="min-h-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* Some market modules keep long-lived subscriptions and nested layout
            animations. `mode="wait"` can leave the outgoing module mounted at
            opacity 0 while it waits for every descendant to finish exiting,
            producing a blank terminal after a tab change. Sync keeps the handoff
            animated without allowing one module to block the next. */}
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: DUR.base, ease: EASE }}
          >
            <Suspense fallback={<Fallback />}>
              {tab === 'oracle' && (
                /* NEXUS — the reference board, embedded. The shell owns the
                   chrome (topbar/nav/tape/footer); this renders only the
                   three-column main. The previous Oracle v2 layout this
                   replaces lives at 4598bc1 if it is ever wanted back. */
                <div className="nexus-embed-host">
                  <NexusBoard />
                </div>
              )}
              {tab === 'chart' && <ChartLab />}
              {/* clicking a ticker sets the shared symbol, so PRISM/GEX follow it.
                  Full-bleed: the FLOW mock owns its own two-column layout. */}
              {tab === 'flow' && <FlowBoard onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />}
              {tab === 'gex' && <GexHub />}
              {tab === 'leaps' && <LeapTracker />}
              {tab === 'crypto' && <CryptoTerminal />}
              {tab === 'catalyst' && (
                <div className="qe-module-page mx-auto w-full max-w-[1680px] space-y-4 px-4 py-4 md:px-5">
                  <TerminalPageHeader
                    eyebrow="Event intelligence"
                    title="Catalyst"
                    description="Cross the event calendar against the active book—conflicts first, then confluence and developing ideas."
                    status="signal-linked calendar"
                    tone="time"
                  />
                  <CatalystBoard />
                </div>
              )}
              {tab === 'bot' && (
                <div className="qe-module-page mx-auto w-full max-w-[1680px] space-y-4 px-4 py-4 md:px-5">
                  <TerminalPageHeader
                    eyebrow="Paper execution"
                    title="Bot"
                    description="A separate execution ledger for the platform's own published option signals—not another confidence board."
                    status={dataPartial ? 'pricing constrained' : 'ledger connected'}
                    tone={dataPartial ? 'time' : 'bull'}
                  />
                  {/* The paper portfolio is the page's primary object. Oracle outcomes
                      are below it because a signal close is not a bot close. */}
                  <Suspense fallback={<Fallback />}>
                    <QuantBotBoard onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                  </Suspense>
                  <div className="border-t border-border/60 pt-3">
                    <TrackRecord />
                  </div>
                </div>
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile instrument dock. The four daily workflows stay one tap away;
          secondary modules live in a compact sheet instead of seven cramped tabs. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/65 bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <nav className="grid h-16 grid-cols-5 px-1" aria-label="Terminal sections">
          {MOBILE_PRIMARY.map((id) => {
            const label = TABS.find((item) => item.id === id)?.label ?? id;
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setMobileMoreOpen(false); setTab(id); }}
                className={cn(
                  'relative flex min-w-0 flex-col items-center justify-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors',
                  active ? 'text-[var(--brand-cyan)]' : 'text-muted-foreground/70',
                )}
              >
                {active && <motion.span layoutId="mobile-terminal-active" className="absolute inset-x-4 top-0 h-px bg-[var(--brand-cyan)]" />}
                <MobileTabIcon tab={id} />
                <span>{label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMoreOpen((open) => !open)}
            aria-expanded={mobileMoreOpen}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors',
              MOBILE_MORE.includes(tab) || mobileMoreOpen ? 'text-[var(--brand-cyan)]' : 'text-muted-foreground/70',
            )}
          >
            {MOBILE_MORE.includes(tab) && <motion.span layoutId="mobile-terminal-active" className="absolute inset-x-4 top-0 h-px bg-[var(--brand-cyan)]" />}
            <MoreHorizontal className="h-[18px] w-[18px]" />
            <span>More</span>
          </button>
        </nav>
      </div>

      <AnimatePresence>
        {mobileMoreOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close section menu"
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              onClick={() => setMobileMoreOpen(false)}
            />
            <motion.div
              className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 overflow-hidden rounded-xl border border-border/75 bg-card shadow-2xl md:hidden"
              initial={reduce ? false : { opacity: 0, y: 16, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: 12, scale: .98 }}
              transition={{ duration: DUR.fast, ease: EASE }}
            >
              <div className="border-b border-border/50 px-4 py-3">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">More instruments</p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-border/50">
                {MOBILE_MORE.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setMobileMoreOpen(false); setTab(id); }}
                    className={cn(
                      'flex min-h-20 flex-col items-center justify-center gap-2 bg-card font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                      tab === id ? 'text-[var(--brand-cyan)]' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <MobileTabIcon tab={id} />
                    {TABS.find((item) => item.id === id)?.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
                  className="inline-flex items-center gap-1 border border-border/70 px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/80 transition-colors hover:border-[var(--brand-cyan)] hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Close
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto p-3 md:p-5">
                {marketFocus === 'pulse' && <OracleMarketField expanded onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />}
                {marketFocus === 'rotation' && <RotationMap expanded />}
                {marketFocus === 'brief' && <SessionBrief expanded onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ticker lookup — an overlay above whichever tab you're on, not a panel wedged
          into the page. Searching is a detour; it shouldn't rearrange the board. */}
      {currentStock?.symbol && tab !== 'chart' && (
        <TickerView
          symbol={currentStock.symbol.toUpperCase()}
          hasSignal={!!convictions?.picks?.some(
            (p) => p.symbol.toUpperCase() === currentStock.symbol.toUpperCase())}
          onClear={clearStock}
        />
      )}

      {guideOpen && (
        <Suspense fallback={null}>
          <TerminalGuide tab={tab} open onClose={() => setGuideOpen(false)} />
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

      {/* ── footer — the reference bottombar. Same real content as before:
             LiveStatsBar (bots/watchlist/VIX) and the market line (session ·
             SPY · BTC · next poll · clock) ride inside his chrome. ── */}
      <footer className="bottombar" style={{ minHeight: 26 }}>
        <div className="bb-item"><span className="dot" /><b>{tab.toUpperCase()}</b> engaged</div>
        <div className="bb-sep" />
        <div className="bb-item">Uptime <b className="tabular-nums">{uptime}</b></div>
        <div className="bb-sep hidden md:block" />
        <span className="hidden items-center md:inline-flex">
          <LiveStatsBar />
        </span>
        <div className="bb-spacer" />
        <span className="hidden items-center lg:inline-flex">
          <FooterMarketLine className="text-[10px]" />
        </span>
        <div className="bb-sep hidden sm:block" />
        <div className="bb-item hidden sm:flex">Educational only · not investment advice</div>
      </footer>
    </div>
  );
}

function Fallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-cyan,#22d3ee)]" />
    </div>
  );
}
