/**
 * TERMINAL GUIDE — the per-tab "how to use this" drawer.
 *
 * Every tab has one (Oracle guide / Flow guide / Prism guide …), so learning is
 * in-context instead of in a manual. Content is the actual desk workflow, not
 * generic help: what the tab answers, how to read it, and what it hands off to.
 */
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE, DUR } from '@/lib/motion';

export type TabId = 'oracle' | 'flow' | 'heatmap' | 'gex' | 'prism';

interface Guide {
  title: string;
  question: string;
  read: string[];
  next: string;
}

export const GUIDES: Record<TabId, Guide> = {
  oracle: {
    title: 'Oracle Guide',
    question: 'What do I trade?',
    read: [
      'The orb is the market regime — risk-on, transition, or risk-off. Set your bias before you look at any ticker.',
      'The Rotation Map plots sectors on relative strength (x) vs momentum (y). Leading = strong, Improving = accelerating, Weakening/Lagging = fading.',
      'Signals are ranked by conviction. Click one: the chart, price ladder (stop / entry / live / T1), and "what to do now" all update.',
      'The right rail is the WHY — confidence band, which layers fired, and the market context behind the call.',
      'Contract Engine turns the level plan into an actual strike: conservative / balanced / aggressive with ROI and R:R.',
    ],
    next: 'Confirm structure in GEX or PRISM before you size in.',
  },
  flow: {
    title: 'Flow Guide',
    question: 'What is smart money doing?',
    read: [
      'Each flow card is one premium-qualifying trade: ticker, strike, expiration, premium spent, direction, and score.',
      'Premium alone is not a signal. A big print only matters if it is unusual for that ticker.',
      'Sweeps take liquidity across exchanges (urgency). Whales are the largest prints. Repeats on one contract mean conviction, not a one-off.',
      'Filter by score, direction, type, premium size, sweep, or whale to cut the tape down to what you actually trade.',
      'Always confirm against the chart: does price have room to move, and is the upside worth the risk?',
    ],
    next: 'Take a flow hit into PRISM to see whether the strike lines up with gamma.',
  },
  heatmap: {
    title: 'Heatmap Guide',
    question: 'Where is money rotating?',
    read: [
      'Start the day here. Cells are sized by market cap and colored by change, so leadership is visible at a glance.',
      'Read the best performers to see which industries are leading, and the weakest to see what is under pressure.',
      'Ask one question: is the market trending, rotating, or reversing? That decides continuation vs reversal setups.',
      'Re-check during the session — leadership changes, and rotation mid-day changes the plan.',
    ],
    next: 'Once you know the leading sector, go to FLOW to see where the premium is going.',
  },
  gex: {
    title: 'GEX Guide',
    question: 'Where does price pin or push?',
    read: [
      'Gamma exposure shows where dealers are positioned, which tells you the levels price gets pulled toward or pushed away from.',
      'Call wall = resistance overhead. Put support = the floor. The magnet is where price tends to gravitate.',
      'The gamma flip is the pivot: above it, dealer hedging dampens moves (mean reversion); below it, moves get amplified.',
      'Positive gamma means drift and pinning. Negative gamma means momentum and bigger swings.',
    ],
    next: 'Use these levels as targets and invalidation on the chart in ORACLE.',
  },
  prism: {
    title: 'Prism Guide',
    question: 'What does the whole options surface say?',
    read: [
      'The matrix is strike (rows) by expiration (columns). Green is call side, red is put side.',
      'Positive means more call flow at that strike; negative means more put flow. Brighter cells carry more weight.',
      'The lit-up nodes are the levels that matter — likely support, resistance, and magnets.',
      'Pick the strongest node in the direction of your thesis, then buy enough time for it to play out rather than the nearest expiry.',
      'Check SPY here for overall market direction before committing to a single-name trade.',
    ],
    next: 'Bring the chosen strike back to ORACLE’s Contract Engine to size the trade.',
  },
};

export function TerminalGuide({ tab, open, onClose }: { tab: TabId; open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const g = GUIDES[tab];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: DUR.fast }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md overflow-y-auto border-l border-border/60 bg-card"
            initial={reduce ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduce ? undefined : { x: '100%' }}
            transition={{ duration: DUR.base, ease: EASE }}
            role="dialog"
            aria-label={g.title}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border/40 bg-card px-4 py-3">
              <div>
                <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground">{g.title}</div>
                <div className="text-[10px] font-mono text-muted-foreground/60">{g.question}</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close guide"
                className="cursor-pointer rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              {g.read.map((line, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="mt-0.5 shrink-0 text-[10px] font-mono tabular-nums text-[var(--brand-cyan,#22d3ee)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[12px] leading-relaxed text-foreground/80">{line}</p>
                </div>
              ))}

              <div className="mt-4 rounded-lg border border-border/40 bg-foreground/[0.03] px-3 py-2.5">
                <div className="mb-0.5 text-[10px] font-mono uppercase tracking-widest text-[var(--brand-cyan,#22d3ee)]">
                  Next step
                </div>
                <div className="text-[11px] font-mono text-foreground/85">{g.next}</div>
              </div>

              <p className="pt-2 text-[10px] leading-relaxed text-muted-foreground/70">
                Educational only — not investment advice. Confirm every signal against your own risk plan.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
