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
  TrendingUp, UserRound, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, DUR } from '@/lib/motion';
import { RotationMap } from '@/components/rotation-map';
import { SessionBrief } from '@/components/oracle/session-brief';
import { EarlyRotationPanel } from '@/components/oracle/early-rotation-panel';
import { OracleMarketField } from '@/components/oracle/oracle-market-field';
import { TickerView } from '@/components/oracle/ticker-view';
import { TerminalGuide } from '@/components/terminal/terminal-guide';
import { LiveStatsBar } from '@/components/footer';
const LeapTracker = lazy(() => import('@/components/hunt/leap-tracker').then(m => ({ default: m.LeapTracker })));
import { TerminalSettings } from '@/components/terminal/terminal-settings';
import { TerminalAlerts, AlertBell, useSignalAlerts } from '@/components/terminal/terminal-alerts';
import { useQuery } from '@tanstack/react-query';
import type { ConvictionsResponse } from '@/lib/convictions';
import { useStockContext } from '@/contexts/stock-context';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/hooks/useAuth';
import { TrackRecord } from '@/components/bot/track-record';
import { KitStyles } from '@/components/templates/kit';
import { TerminalPageHeader, TerminalSectionHeader } from '@/components/templates/terminal-page';
import { TerminalTickerSearch } from '@/components/terminal/terminal-ticker-search';
import { ChartLab } from '@/components/charting/chart-lab';

const HuntCockpit   = lazy(() => import('@/pages/shells/hunt-cockpit'));
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
const CryptoTerminal = lazy(() => import('@/components/crypto/crypto-terminal').then(m => ({ default: m.CryptoTerminal })));

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
  { id: 'oracle',  label: 'ORACLE' },
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
const MOBILE_MORE: Tab[] = ['crypto', 'catalyst', 'bot'];

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
  const night = theme === 'night';
  const dataPartial = health?.status === 'degraded' || health?.dependencies?.tradier === false;
  const accountLabel = user?.firstName || user?.email?.split('@')[0] || 'Account';
  const accountInitial = accountLabel.slice(0, 1).toUpperCase();

  return (
    <div className="qe-terminal min-h-screen flex flex-col bg-background">
      <KitStyles />
      {/* ── persistent chrome ── */}
      <header className="qe-terminal-chrome sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4 lg:px-5">
          <span className="shrink-0 font-mono text-[13px] font-bold tracking-[0.16em] text-foreground">
            QUANT<span className="text-[var(--brand-cyan,#22d3ee)]">EDGE</span>
            <span className="hidden text-muted-foreground/70 sm:inline"> // TERMINAL</span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--trade-bullish,#22c55e)] sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Engaged
          </span>

          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.13em] lg:inline-flex"
            style={{
              color: dataPartial ? 'var(--brand-gold)' : 'var(--brand-cyan)',
              borderColor: dataPartial ? 'color-mix(in srgb, var(--brand-gold) 35%, transparent)' : 'color-mix(in srgb, var(--brand-cyan) 30%, transparent)',
              background: dataPartial ? 'color-mix(in srgb, var(--brand-gold) 7%, transparent)' : 'color-mix(in srgb, var(--brand-cyan) 6%, transparent)',
            }}
            title={dataPartial ? 'Some premium and chain-dependent reads are unavailable' : 'Primary data dependencies are healthy'}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> {dataPartial ? 'Data partial' : 'Data ready'}
          </span>

          <nav className="hidden flex-1 items-center justify-center gap-0.5 overflow-x-auto md:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative px-3 py-1.5 text-meta font-mono uppercase tracking-widest transition-colors whitespace-nowrap',
                  tab === t.id ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground',
                )}
                data-testid={`terminal-tab-${t.id}`}
              >
                {t.label}
                {tab === t.id && (
                  <motion.span layoutId="terminal-tab-underline"
                    className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[var(--brand-cyan,#22d3ee)]" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
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
                value={currentStock?.symbol}
                onSelect={(result) => setCurrentStock({ symbol: result.symbol, name: result.name })}
              />
            </div>

            <AlertBell
              unread={alerts.unread}
              onClick={() => { setAlertsOpen(true); alerts.setUnread(0); }}
            />

            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings"
              className="hidden cursor-pointer items-center gap-1.5 text-label font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground md:inline-flex"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setTheme(night ? 'dark' : 'night')}
              aria-label={night ? 'Use terminal appearance' : 'Use night appearance'}
              title={night ? 'Terminal appearance' : 'Night appearance'}
              className={cn('hidden h-7 w-7 cursor-pointer items-center justify-center rounded border text-muted-foreground/75 transition-colors hover:text-foreground md:inline-flex',
                night ? 'border-[var(--brand-cyan)]/55 bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)]' : 'border-border/50')}
            >
              <Moon className="h-3.5 w-3.5" />
            </button>

            <div className="relative">
              <button
                onClick={() => setAccountOpen((open) => !open)}
                aria-label="Open account menu"
                aria-expanded={accountOpen}
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-border/60 bg-foreground/5 font-mono text-[10px] font-bold text-foreground transition-colors hover:border-[var(--brand-cyan)]"
              >
                {accountInitial}
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
                    <button onClick={() => { setAccountOpen(false); setSettingsOpen(true); }} className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
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

            <button
              onClick={() => setGuideOpen(true)}
              aria-label={`Open ${tab} guide`}
              className="hidden cursor-pointer items-center gap-1.5 text-label font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground lg:inline-flex"
            >
              <BookOpen className="h-3.5 w-3.5" /> Guide
            </button>
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
                <div className="qe-oracle-page mx-auto w-full max-w-[1680px] space-y-6 px-3 py-4 md:px-5 lg:py-5">
                  {/* 1. One market stage, three distinct readings: broad participation,
                      real relative rotation, and the names carrying that tape. */}
                  <section className="qe-market-stage">
                    <TerminalSectionHeader
                      eyebrow="01 · Market intelligence"
                      title="Read the tape before the trade."
                      description="Participation, relative rotation and leadership—one connected market view."
                      live={!dataPartial}
                      meta={dataPartial ? 'partial feed' : 'context updating'}
                    />
                    {!dataPartial && <div className="qe-context-current" aria-hidden="true"><span /></div>}
                    <div className="qe-market-grid">
                      <OracleMarketField className="qe-market-panel h-full" collapsedHeight={420} onFocus={() => setMarketFocus('pulse')} />
                      <RotationMap className="qe-market-panel h-full" collapsedHeight={420} onFocus={() => setMarketFocus('rotation')} />
                      <SessionBrief className="qe-market-panel h-full" collapsedHeight={420} onFocus={() => setMarketFocus('brief')} onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                    </div>
                  </section>

                  {/* 2. The current trade book is the page's primary object. */}
                  <section className="qe-oracle-section">
                    <TerminalSectionHeader
                      eyebrow="02 · Active book"
                      title="Ranked opportunities."
                      description="Select a ticker to connect price, evidence, levels and execution."
                      meta="ranked book"
                    />
                    <HuntCockpit />
                  </section>

                  {/* 3. Candidates inside incoming groups are the next action layer.
                      It is a setup queue, not another market summary. */}
                  <section className="qe-oracle-section">
                    <TerminalSectionHeader
                      eyebrow="03 · Developing"
                      title="Setups before the trigger."
                      description="Coiled names inside groups already receiving money."
                      meta="watch · not signals"
                    />
                    <EarlyRotationPanel onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                  </section>

                </div>
              )}
              {tab === 'chart' && <ChartLab />}
              {tab === 'flow' && (
                <div className="qe-module-page mx-auto w-full max-w-[1680px]">
                  {/* clicking a ticker sets the shared symbol, so PRISM/GEX follow it */}
                  <FlowBoard onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                </div>
              )}
              {tab === 'gex' && <div className="qe-module-page mx-auto w-full max-w-[1680px]"><GexShell /></div>}
              {tab === 'leaps' && <div className="qe-module-page mx-auto w-full max-w-[1680px]"><LeapTracker /></div>}
              {tab === 'crypto' && <CryptoTerminal onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />}
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
              <div className="grid grid-cols-3 gap-px bg-border/50">
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
                {marketFocus === 'pulse' && <OracleMarketField expanded />}
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

      <TerminalGuide tab={tab} open={guideOpen} onClose={() => setGuideOpen(false)} />
      <TerminalSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <TerminalAlerts
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        feed={alerts.feed}
        setFeed={alerts.setFeed}
        prefs={alerts.prefs}
        update={alerts.update}
      />

      {/* ── footer ── */}
      <footer className="border-t border-border/50 px-4 h-8 flex items-center gap-3 text-label font-mono uppercase tracking-wider text-muted-foreground/60">
        <span className="inline-flex items-center gap-1.5 text-[var(--trade-bullish,#22c55e)]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> Online
        </span>
        <span className="tabular-nums">Uptime {uptime}</span>
        {/* The same live status strip the rest of the app footers show — bots
            running, watchlist size, VIX. Imported rather than reimplemented so
            the two footers cannot drift apart. */}
        <span className="hidden md:inline-flex items-center normal-case tracking-normal">
          <LiveStatsBar />
        </span>
        <span className="ml-auto hidden sm:inline">Educational only · not investment advice</span>
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
