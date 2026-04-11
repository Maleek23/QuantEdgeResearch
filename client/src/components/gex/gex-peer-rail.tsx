/**
 * GEXPeerRail — right-rail list of watchlist peers for quick context switching.
 * Click a peer to navigate to its terminal.
 */

import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import { componentStyles } from '@/lib/design-tokens';

interface PeerEntry {
  symbol: string;
  spotPrice: number;
  changePct: number;
  score: number;
  bias: 'long' | 'short' | 'neutral';
}

interface GEXPeerRailProps {
  peers: PeerEntry[];
  currentSymbol: string;
}

export function GEXPeerRail({ peers, currentSymbol }: GEXPeerRailProps) {
  if (peers.length === 0) return null;

  return (
    <div
      className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden"
      data-testid="gex-peer-rail"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/50">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
          WATCHLIST · PEERS
        </div>
        <div className="text-[9px] font-mono text-muted-foreground">{peers.length}</div>
      </div>
      <div className="divide-y divide-[var(--gex-positive)]/10">
        {peers.map((p) => (
          <Link
            key={p.symbol}
            href={`/command/${p.symbol}`}
            className={cn(
              'flex items-center justify-between px-3 py-2 hover:bg-[var(--gex-positive)]/5 transition-colors',
              p.symbol === currentSymbol && 'bg-[var(--gex-positive)]/10',
            )}
            data-testid={`peer-${p.symbol}`}
          >
              <div className="flex items-center gap-2">
                <div className={cn(componentStyles.text.ticker, 'text-sm text-foreground')}>
                  {p.symbol}
                </div>
                <BiasIndicator bias={p.bias} />
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[11px] font-mono font-semibold tabular-nums text-foreground">
                    ${p.spotPrice.toFixed(2)}
                  </div>
                  <div
                    className={cn(
                      'text-[9px] font-mono tabular-nums',
                      p.changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
                    )}
                  >
                    {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(2)}%
                  </div>
                </div>
                <ScoreChip score={p.score} />
              </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function BiasIndicator({ bias }: { bias: 'long' | 'short' | 'neutral' }) {
  const color =
    bias === 'long' ? 'bg-[var(--trade-bullish)]'
    : bias === 'short' ? 'bg-[var(--trade-bearish)]'
    : 'bg-muted-foreground';
  return <div className={cn('w-1.5 h-1.5 rounded-full', color)} />;
}

function ScoreChip({ score }: { score: number }) {
  const style =
    score >= 75 ? componentStyles.gex.scoreElite
    : score >= 60 ? componentStyles.gex.scoreStrong
    : componentStyles.gex.scoreWeak;
  return <div className={cn(style, 'w-10 justify-center')}>{score}</div>;
}
