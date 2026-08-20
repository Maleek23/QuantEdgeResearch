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
import { OracleOrb } from '@/components/oracle-orb';
import { RotationMap } from '@/components/rotation-map';
import { TerminalGuide } from '@/components/terminal/terminal-guide';
import { TerminalSettings } from '@/components/terminal/terminal-settings';
import { useStockContext } from '@/contexts/stock-context';

const HuntCockpit   = lazy(() => import('@/pages/shells/hunt-cockpit'));
const GexShell      = lazy(() => import('@/pages/shells/gex-shell'));
const FlowBoard     = lazy(() => import('@/components/flow/flow-board').then(m => ({ default: m.FlowBoard })));
// The old flow-heatmap page is the SECTOR TREEMAP with a flow overlay (breadth, net flow,
// sweeps, whales + per-ticker flow detail). That's the Heatmap surface, not the tape — so
// it belongs on HEATMAP. Keeping it preserves the strongest part of the old design.
const SectorHeatmap = lazy(() => import('@/pages/flow-heatmap'));
// PRISM = the strike x expiry gamma surface (what the walkthrough actually shows),
// not the premium-spectrum strike picker that used to sit here.
const PrismBoard    = lazy(() => import('@/components/prism/prism-board').then(m => ({ default: m.PrismBoard })));

type Tab = 'oracle' | 'flow' | 'heatmap' | 'gex' | 'prism';
const TABS: { id: Tab; label: string }[] = [
  { id: 'oracle',  label: 'ORACLE' },
  { id: 'flow',    label: 'FLOW' },
  { id: 'heatmap', label: 'HEATMAP' },
  { id: 'gex',     label: 'GEX' },
  { id: 'prism',   label: 'PRISM' },
];

function useUptime() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const isTab = (v: string | null): v is Tab => !!v && TABS.some((t) => t.id === v);

export default function TerminalShell() {
  // Tab lives in the URL (?tab=gex) so it's deep-linkable, shareable, survives a reload,
  // and lets legacy routes redirect straight to the right surface.
  const [location, setLocation] = useLocation();
  const urlTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const [tab, setTabState] = useState<Tab>(isTab(urlTab) ? urlTab : 'oracle');

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
          <span className="font-mono text-[13px] font-bold tracking-widest text-foreground shrink-0">
            QUANT<span className="text-[var(--brand-cyan,#22d3ee)]">EDGE</span>
            <span className="text-muted-foreground/50"> // TERMINAL</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--trade-bullish,#22c55e)] shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Engaged
          </span>

          <nav className="flex-1 flex items-center justify-center gap-0.5 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors whitespace-nowrap',
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
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="ticker"
                  aria-label="Search ticker"
                  className="w-28 rounded border border-border/60 bg-background/60 py-1 pl-7 pr-2 text-[11px] font-mono uppercase tracking-wider text-foreground outline-none transition-colors focus:border-[var(--brand-cyan,#22d3ee)]"
                />
              </div>
            </form>

            {currentStock?.symbol && (
              <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-[var(--brand-cyan,#22d3ee)]/40 bg-[var(--brand-cyan,#22d3ee)]/10 px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider text-[var(--brand-cyan,#22d3ee)]">
                {currentStock.symbol}
                <button onClick={clearStock} aria-label="Clear ticker" className="cursor-pointer opacity-70 transition-opacity hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings"
              className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setGuideOpen(true)}
              aria-label={`Open ${tab} guide`}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
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
                <div className="mx-auto w-full max-w-[1600px] px-4 py-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <OracleOrb />
                    <RotationMap />
                  </div>
                  <HuntCockpit />
                </div>
              )}
              {tab === 'flow' && (
                <div className="mx-auto w-full max-w-[1600px]">
                  {/* clicking a ticker sets the shared symbol, so PRISM/GEX follow it */}
                  <FlowBoard onSelectSymbol={(sym) => setCurrentStock({ symbol: sym })} />
                </div>
              )}
              {tab === 'heatmap' && <div className="mx-auto w-full max-w-[1600px]"><SectorHeatmap /></div>}
              {tab === 'gex' && <div className="mx-auto w-full max-w-[1600px]"><GexShell /></div>}
              {tab === 'prism' && <div className="mx-auto w-full max-w-[1600px]"><PrismBoard /></div>}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <TerminalGuide tab={tab} open={guideOpen} onClose={() => setGuideOpen(false)} />
      <TerminalSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── footer ── */}
      <footer className="border-t border-border/50 px-4 h-8 flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
        <span className="inline-flex items-center gap-1.5 text-[var(--trade-bullish,#22c55e)]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" /> Online
        </span>
        <span className="tabular-nums">Uptime {uptime}</span>
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
