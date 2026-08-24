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
import { Loader2, BookOpen, Search, X, SlidersHorizontal } from 'lucide-react';
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

const HuntCockpit   = lazy(() => import('@/pages/shells/hunt-cockpit'));
const GexShell      = lazy(() => import('@/pages/shells/gex-shell'));
const FlowBoard     = lazy(() => import('@/components/flow/flow-board').then(m => ({ default: m.FlowBoard })));
// The old flow-heatmap page is the SECTOR TREEMAP with a flow overlay (breadth, net flow,
// sweeps, whales + per-ticker flow detail). That's the Heatmap surface, not the tape — so
// it belongs on HEATMAP. Keeping it preserves the strongest part of the old design.
// PRISM = the strike x expiry gamma surface (what the walkthrough actually shows),
// not the premium-spectrum strike picker that used to sit here.
const QuantBotBoard = lazy(() => import('@/components/bot/quant-bot-board').then(m => ({ default: m.QuantBotBoard })));
// The board's own historical record. Lives beside the bot because both answer the
// same question — what have these signals actually done — and it was unreachable
// after the sidebar was removed.
const TrackRecord   = lazy(() => import('@/components/bot/track-record').then(m => ({ default: m.TrackRecord })));
// CATALYST — the event calendar joined to the signals we publish, so a call and the
// news pointing the other way land on the same screen instead of two separate ones.
const CatalystBoard = lazy(() => import('@/components/catalyst/catalyst-board').then(m => ({ default: m.CatalystBoard })));

type Tab = 'oracle' | 'flow' | 'gex' | 'leaps' | 'catalyst' | 'bot';
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
  { id: 'catalyst', label: 'CATALYST' },
  { id: 'bot',     label: 'BOT' },
];

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
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [marketFocus, setMarketFocus] = useState<MarketFocus | null>(null);

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
  const [draft, setDraft] = useState('');
  const reduce = useReducedMotion();
  const uptime = useUptime();
  // One ticker for the whole terminal: search once, every tab follows it.
  const { currentStock, setCurrentStock, clearStock } = useStockContext();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── persistent chrome ── */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4 px-4 h-12">
          <span className="font-mono text-value font-bold tracking-widest text-foreground shrink-0">
            QUANT<span className="text-[var(--brand-cyan,#22d3ee)]">EDGE</span>
            <span className="text-muted-foreground/70"> // TERMINAL</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-label font-mono uppercase tracking-wider text-[var(--trade-bullish,#22c55e)] shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Engaged
          </span>

          <nav className="flex-1 flex items-center justify-center gap-0.5 overflow-x-auto">
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
            {/* ticker search — sets the shared symbol every tab reads */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const sym = draft.trim().toUpperCase();
                if (sym) { setCurrentStock({ symbol: sym }); setDraft(''); }
              }}
              className="hidden md:flex items-center gap-1"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="ticker"
                  aria-label="Search ticker"
                  className="w-28 rounded border border-border/60 bg-background/60 py-1 pl-7 pr-2 text-meta font-mono uppercase tracking-wider text-foreground outline-none transition-colors focus:border-[var(--brand-cyan,#22d3ee)]"
                />
              </div>
            </form>

            {currentStock?.symbol && (
              <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-[var(--brand-cyan,#22d3ee)]/40 bg-[var(--brand-cyan,#22d3ee)]/10 px-2 py-0.5 text-label font-mono font-bold tracking-wider text-[var(--brand-cyan,#22d3ee)]">
                {currentStock.symbol}
                <button onClick={clearStock} aria-label="Clear ticker" className="cursor-pointer opacity-70 transition-opacity hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            <AlertBell
              unread={alerts.unread}
              onClick={() => { setAlertsOpen(true); alerts.setUnread(0); }}
            />

            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings"
              className="inline-flex cursor-pointer items-center gap-1.5 text-label font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setGuideOpen(true)}
              aria-label={`Open ${tab} guide`}
              className="inline-flex cursor-pointer items-center gap-1.5 text-label font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <BookOpen className="h-3.5 w-3.5" /> Guide
            </button>
          </div>
        </div>
      </header>

      {/* ── tab content (cross-fades) ── */}
      <main className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: DUR.base, ease: EASE }}
          >
            <Suspense fallback={<Fallback />}>
              {tab === 'oracle' && (
                <div className="mx-auto w-full max-w-[1600px] space-y-3 px-3 py-2">
                  {/* 1. One market stage, three distinct readings: broad participation,
                      real relative rotation, and the names carrying that tape. */}
                  <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(240px,0.78fr)_minmax(420px,1.08fr)_minmax(300px,0.9fr)]">
                    <OracleMarketField className="h-full" collapsedHeight={420} onFocus={() => setMarketFocus('pulse')} />
                    <RotationMap className="h-full" collapsedHeight={420} onFocus={() => setMarketFocus('rotation')} />
                    <SessionBrief className="h-full" collapsedHeight={420} onFocus={() => setMarketFocus('brief')} onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                  </div>

                  {/* 2. The current trade book is the page's primary object. */}
                  <HuntCockpit />

                  {/* 3. Candidates inside incoming groups are the next action layer.
                      It is a setup queue, not another market summary. */}
                  <div className="border-t border-border/60 pt-3">
                    <EarlyRotationPanel onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                  </div>

                </div>
              )}
              {tab === 'flow' && (
                <div className="mx-auto w-full max-w-[1600px]">
                  {/* clicking a ticker sets the shared symbol, so PRISM/GEX follow it */}
                  <FlowBoard onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                </div>
              )}
              {tab === 'gex' && <div className="mx-auto w-full max-w-[1600px]"><GexShell /></div>}
              {tab === 'leaps' && <div className="mx-auto w-full max-w-[1600px]"><LeapTracker /></div>}
              {tab === 'catalyst' && <div className="mx-auto w-full max-w-[1600px]"><CatalystBoard /></div>}
              {tab === 'bot' && (
                <div className="mx-auto w-full max-w-[1600px] space-y-3 px-3 py-2">
                  {/* The published record sits ABOVE the live bot: what these signals
                      have historically done is the context for anything the bot is
                      doing right now. */}
                  <TrackRecord />
                  <QuantBotBoard onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                </div>
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Each live market view has a full-screen focus mode. The stage stays comparable
          at a glance; a reader can then inspect one real source without it becoming
          a taller card inside the scrolling Oracle book. */}
      <AnimatePresence>
        {tab === 'oracle' && marketFocus && (
          <motion.div
            className="fixed inset-0 z-[60] grid place-items-center bg-background/55 p-3 backdrop-blur-md md:p-6"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            onMouseDown={() => setMarketFocus(null)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label={`${MARKET_FOCUS_COPY[marketFocus].title} full view`}
              className="flex max-h-[calc(100dvh-24px)] w-full max-w-[1480px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/50"
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
      {currentStock?.symbol && (
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
