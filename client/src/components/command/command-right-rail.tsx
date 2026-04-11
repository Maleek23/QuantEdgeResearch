/**
 * CommandRightRail — vertical column that hugs the right edge of the
 * command workspace. Currently hosts:
 *
 *   1. GEXPeerRail     — watchlist peers with bias + score
 *   2. RegimeInsight   — dealer-gamma regime explainer
 *
 * Day 4 will add a GEX / VEX / G+V sub-tab block and a sentiment slider
 * above the peer rail. This extraction keeps the page shell clean so
 * those additions land in one file instead of ballooning gex-command.tsx.
 */

import { cn } from '@/lib/utils';
import { GEXPeerRail } from '@/components/gex/gex-peer-rail';
import type { GEXTerminalData } from '../../../../shared/gex-types';

// Reuse the inline peer shape from GEXTerminalData rather than redefining.
type CommandPeer = GEXTerminalData['peers'][number];

interface CommandRightRailProps {
  peers: CommandPeer[];
  currentSymbol: string;
  regime: string;
}

export function CommandRightRail({ peers, currentSymbol, regime }: CommandRightRailProps) {
  return (
    <div className="space-y-4">
      <GEXPeerRail peers={peers} currentSymbol={currentSymbol} />

      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 p-3">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)] mb-2">
          REGIME INSIGHT
        </div>
        <RegimeNote regime={regime} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

const REGIME_NOTES: Record<string, { title: string; body: string; color: string }> = {
  positive_gamma: {
    title: 'DEALERS LONG GAMMA',
    body: 'Volatility suppressed. Mean-reversion favors the max-gamma strike. Fade extremes.',
    color: 'text-[var(--gex-positive)]',
  },
  negative_gamma: {
    title: 'DEALERS SHORT GAMMA',
    body: 'Volatility amplified. Moves chase, trends extend. Break-and-go plays.',
    color: 'text-[var(--gex-negative)]',
  },
  neutral: {
    title: 'BALANCED GAMMA',
    body: 'Neither pinned nor trending. Wait for walls to establish before entering.',
    color: 'text-muted-foreground',
  },
  transitioning: {
    title: 'REGIME SHIFT',
    body: 'Gamma flipping. Expect expansion of range — watch flip level closely.',
    color: 'text-[var(--gex-flip)]',
  },
};

function RegimeNote({ regime }: { regime: string }) {
  const note = REGIME_NOTES[regime] || REGIME_NOTES.neutral;
  return (
    <div>
      <div className={cn('text-xs font-mono font-bold uppercase tracking-wider', note.color)}>
        {note.title}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
        {note.body}
      </div>
    </div>
  );
}
