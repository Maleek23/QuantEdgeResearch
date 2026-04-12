/**
 * TradeIdeaCard — reusable trade idea card
 * =========================================
 * Shared visual language for surfacing a single trade idea across:
 *   • /trade-desk
 *   • /home
 *   • /stock/:symbol
 *   • /command (intelligence rail)
 *
 * Skylit/QE design tokens — uses CSS vars from design-tokens.ts.
 */

import { Link } from 'wouter';
import {
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Shield,
  Activity,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTier } from '../../../../shared/approved-tickers';

// ---------- types ----------

export interface TradeIdeaCardData {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  confidenceScore: number;
  probabilityBand?: string; // 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D'
  catalyst?: string;
  source?: string;
  holdingPeriod?: 'day' | 'swing' | 'position' | 'week-ending';
  livePrice?: number | null;
  priceStale?: boolean;
  liquidityWarning?: boolean;
  tradeType?: 'lotto' | 'swing' | 'mover' | 'scalp';
}

export interface TradeIdeaCardProps {
  idea: TradeIdeaCardData;
  onClick?: () => void;
  className?: string;
  compact?: boolean;
  showGexLink?: boolean;
  'data-testid'?: string;
}

// ---------- helpers ----------

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function gradeColor(band?: string): string {
  if (!band) return 'text-muted-foreground';
  if (band.startsWith('A')) return 'text-[var(--gex-positive)]';
  if (band.startsWith('B')) return 'text-cyan-400';
  if (band.startsWith('C')) return 'text-yellow-400';
  return 'text-orange-400';
}

function tierBadgeColor(tier: ReturnType<typeof getTier>): string {
  switch (tier) {
    case 'MEGA':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/40';
    case 'S':
      return 'bg-[var(--gex-positive)]/20 text-[var(--gex-positive)] border-[var(--gex-positive)]/40';
    case 'A':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40';
    case 'INDEX':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/40';
    case 'SECONDARY':
      return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/40';
    default:
      return 'bg-zinc-700/30 text-zinc-400 border-zinc-700/50';
  }
}

// ---------- component ----------

export function TradeIdeaCard({
  idea,
  onClick,
  className,
  compact = false,
  showGexLink = true,
  'data-testid': testId,
}: TradeIdeaCardProps) {
  const isLong = idea.direction === 'long';
  const directionColor = isLong
    ? 'text-[var(--gex-positive)]'
    : 'text-[var(--gex-negative)]';
  const directionBg = isLong
    ? 'bg-[var(--gex-positive)]/10 border-[var(--gex-positive)]/30'
    : 'bg-[var(--gex-negative)]/10 border-[var(--gex-negative)]/30';

  const tier = getTier(idea.symbol);
  const livePrice = idea.livePrice ?? idea.entryPrice;
  const drift =
    idea.livePrice != null && Number.isFinite(idea.livePrice)
      ? ((idea.livePrice - idea.entryPrice) / idea.entryPrice) * 100
      : null;
  const inEntryZone = drift != null && Math.abs(drift) <= 1.5;

  return (
    <div
      onClick={onClick}
      data-testid={testId ?? `trade-idea-${idea.symbol}`}
      className={cn(
        'group relative rounded-lg border transition-all',
        'bg-[var(--surface-raised)] border-border',
        'hover:border-[var(--gex-positive)]/40 hover:shadow-[0_0_24px_-12px_var(--glow-cyan,#22d3ee)]',
        onClick && 'cursor-pointer',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      {/* === HEADER === */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'font-mono font-bold tracking-tight text-foreground',
              compact ? 'text-base' : 'text-lg',
            )}
            data-testid={`text-symbol-${idea.symbol}`}
          >
            {idea.symbol}
          </span>
          {tier && (
            <span
              className={cn(
                'px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded border',
                tierBadgeColor(tier),
              )}
            >
              {tier}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded border',
              directionBg,
              directionColor,
            )}
          >
            {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {idea.direction}
          </span>
          {idea.tradeType && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-zinc-700/40 text-zinc-300 border border-zinc-600/40">
              {idea.tradeType}
            </span>
          )}
        </div>

        <div className="flex flex-col items-end shrink-0">
          <span
            className={cn('font-mono font-bold text-sm', gradeColor(idea.probabilityBand))}
            data-testid={`grade-${idea.symbol}`}
          >
            {idea.probabilityBand ?? '—'}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Math.round(idea.confidenceScore)}%
          </span>
        </div>
      </div>

      {/* === LIVE PRICE STRIP === */}
      {idea.livePrice != null && (
        <div className="flex items-center justify-between mb-3 px-2 py-1.5 rounded bg-[var(--surface-base)] border border-border/50">
          <div className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Live
            </span>
            <span className="font-mono font-bold text-sm text-foreground tabular-nums">
              {fmtPrice(livePrice)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {drift != null && (
              <span
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  drift >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]',
                )}
              >
                {fmtPct(drift)} vs entry
              </span>
            )}
            {inEntryZone && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-[var(--gex-positive)]/20 text-[var(--gex-positive)] border border-[var(--gex-positive)]/40">
                IN ZONE
              </span>
            )}
            {idea.priceStale && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                STALE
              </span>
            )}
          </div>
        </div>
      )}

      {/* === ENTRY / TARGET / STOP === */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <PriceCell
          label="Entry"
          value={fmtPrice(idea.entryPrice)}
          icon={<Activity className="w-3 h-3" />}
          tone="neutral"
        />
        <PriceCell
          label="Target"
          value={fmtPrice(idea.targetPrice)}
          icon={<Target className="w-3 h-3" />}
          tone="positive"
        />
        <PriceCell
          label="Stop"
          value={fmtPrice(idea.stopLoss)}
          icon={<Shield className="w-3 h-3" />}
          tone="negative"
        />
      </div>

      {/* === META ROW === */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums">
            R:R <span className="text-foreground font-bold">{idea.riskRewardRatio.toFixed(2)}</span>
          </span>
          {idea.holdingPeriod && (
            <>
              <span className="opacity-50">•</span>
              <span className="uppercase tracking-wider">{idea.holdingPeriod}</span>
            </>
          )}
          {idea.source && (
            <>
              <span className="opacity-50">•</span>
              <span className="uppercase tracking-wider truncate max-w-[80px]">
                {idea.source.replace(/_/g, ' ')}
              </span>
            </>
          )}
        </div>

        {showGexLink && (
          <Link
            href={`/command/${idea.symbol}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-colors"
            data-testid={`link-gex-${idea.symbol}`}
          >
            GEX <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        )}
      </div>

      {/* === CATALYST === */}
      {!compact && idea.catalyst && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground line-clamp-2">{idea.catalyst}</p>
        </div>
      )}

      {/* === LIQUIDITY WARNING === */}
      {idea.liquidityWarning && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-yellow-400">
          <AlertTriangle className="w-3 h-3" />
          Low liquidity — use limit orders
        </div>
      )}
    </div>
  );
}

// ---------- subcomponents ----------

interface PriceCellProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'positive' | 'negative' | 'neutral';
}

function PriceCell({ label, value, icon, tone }: PriceCellProps) {
  const toneStyles =
    tone === 'positive'
      ? 'text-[var(--gex-positive)]'
      : tone === 'negative'
      ? 'text-[var(--gex-negative)]'
      : 'text-foreground';

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded bg-[var(--surface-base)] border border-border/50">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className={cn('font-mono font-bold text-xs tabular-nums', toneStyles)}>{value}</span>
    </div>
  );
}
