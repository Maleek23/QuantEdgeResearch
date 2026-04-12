/**
 * GEXSnapshotHeader — terminal-style header strip with symbol, spot, regime, key levels.
 */

import { cn } from '@/lib/utils';
import { componentStyles } from '@/lib/design-tokens';
import { formatGEX } from '../../../../shared/gex-types';
import type { GEXSnapshot } from '../../../../shared/gex-types';

interface GEXSnapshotHeaderProps {
  snapshot: GEXSnapshot;
  changePct?: number;
}

export function GEXSnapshotHeader({ snapshot, changePct = 0 }: GEXSnapshotHeaderProps) {
  const regimeColor =
    snapshot.regime === 'positive_gamma' ? 'text-[var(--gex-positive)]'
    : snapshot.regime === 'negative_gamma' ? 'text-[var(--gex-negative)]'
    : 'text-muted-foreground';

  const regimeBg =
    snapshot.regime === 'positive_gamma' ? 'bg-[var(--gex-positive)]/10 border-[var(--gex-positive)]/40'
    : snapshot.regime === 'negative_gamma' ? 'bg-[var(--gex-negative)]/10 border-[var(--gex-negative)]/40'
    : 'bg-muted border-border';

  const changeColor = changePct > 0 ? 'text-[var(--trade-bullish)]' : changePct < 0 ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground';

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15"
      data-testid="gex-snapshot-header"
    >
      {/* Left: ticker + spot */}
      <div className="flex items-center gap-4">
        <div>
          <div className={cn(componentStyles.text.ticker, 'text-2xl text-[var(--gex-positive)]')}>
            {snapshot.symbol}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            GEX TERMINAL · LIVE
          </div>
        </div>
        <div className="border-l border-[var(--gex-positive)]/20 pl-4">
          <div className={cn(componentStyles.text.price, 'text-2xl')}>
            ${snapshot.spotPrice.toFixed(2)}
          </div>
          <div className={cn('text-xs font-mono tabular-nums', changeColor)}>
            {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Center: regime badge */}
      <div className={cn('px-3 py-1.5 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider', regimeBg, regimeColor)}>
        {snapshot.regime.replace('_', ' ')}
      </div>

      {/* Right: key stats */}
      <div className="flex items-center gap-5 text-[10px] font-mono">
        <Stat label="NET GEX" value={formatGEX(snapshot.totalGEX)} highlight={snapshot.totalGEX >= 0 ? 'pos' : 'neg'} />
        <Stat label="FLIP" value={snapshot.gammaFlipPrice ? `$${snapshot.gammaFlipPrice.toFixed(0)}` : '—'} />
        <Stat label="CALL WALL" value={snapshot.callWall ? `$${snapshot.callWall.toFixed(0)}` : '—'} highlight="pos" />
        <Stat label="PUT WALL" value={snapshot.putWall ? `$${snapshot.putWall.toFixed(0)}` : '—'} highlight="neg" />
        <Stat label="MAX γ" value={`$${snapshot.maxGammaStrike.toFixed(0)}`} highlight="pos" star />
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, star }: { label: string; value: string; highlight?: 'pos' | 'neg'; star?: boolean }) {
  const color =
    highlight === 'pos' ? 'text-[var(--gex-positive)]'
    : highlight === 'neg' ? 'text-[var(--gex-negative)]'
    : 'text-foreground';
  return (
    <div className="text-center">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn('font-bold tabular-nums', color)}>
        {star && <span className="text-[var(--gex-star)] mr-0.5">★</span>}
        {value}
      </div>
    </div>
  );
}
