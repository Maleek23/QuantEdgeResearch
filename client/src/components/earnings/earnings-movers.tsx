/**
 * EarningsMovers — post-earnings reaction tracker.
 *
 * Shows recently-reported tickers with:
 *   • Pre-market/after-hours move %
 *   • Implied move (what was priced) vs realized move (what happened)
 *   • Reaction-to-thesis classification: BEAT-RIP / BEAT-FADE / MISS-DUMP / MISS-RECOVER
 *   • Auto-suggested follow-up trades
 *
 * Today: pulls last 24h reporters from /api/earnings/movers
 *        + gets current quote vs prior-close to detect gap
 *
 * Tomorrow: WebSocket feed for intraday gappers (when Tradier WS wired)
 *          + auto-create Trade Desk idea for follow-through plays
 */
import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEStatStrip, QEPill } from '@/components/ui/qe';

interface MoverRow {
  symbol: string;
  name: string;
  reportedAt: string;     // ISO — when the print landed
  reportedDate: string;   // YYYY-MM-DD
  reportedTime: 'BMO' | 'AMC';
  priorClose: number;     // close before the print
  spot: number;           // current price
  gapPct: number;         // (spot - priorClose) / priorClose × 100
  impliedMovePct: number; // what IV implied
  realizedMovePct: number;// what actually happened (== |gapPct|)
  surprisePct: number | null;
  reaction: 'BEAT-RIP' | 'BEAT-FADE' | 'MISS-DUMP' | 'MISS-RECOVER' | 'UNCLEAR';
  followup: string;       // suggested trade
}

interface MoversResponse {
  asOf: string;
  movers: MoverRow[];
  total: number;
}

export function EarningsMovers() {
  const [, setLocation] = useLocation();
  const [direction, setDirection] = useState<'all' | 'up' | 'down'>('all');

  const { data, isLoading, error } = useQuery<MoversResponse>({
    queryKey: ['/api/earnings/movers'],
    queryFn: async () => {
      const r = await fetch('/api/earnings/movers', { credentials: 'include' });
      if (!r.ok) throw new Error(`fetch failed (${r.status})`);
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const movers = data?.movers ?? [];
  const filtered = useMemo(() => {
    if (direction === 'all') return movers;
    return movers.filter(m => direction === 'up' ? m.gapPct > 0 : m.gapPct < 0);
  }, [movers, direction]);

  const upCount = movers.filter(m => m.gapPct > 0).length;
  const downCount = movers.filter(m => m.gapPct < 0).length;
  const beatRippers = movers.filter(m => m.reaction === 'BEAT-RIP').length;
  const missDumpers = movers.filter(m => m.reaction === 'MISS-DUMP').length;

  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-base font-mono font-bold uppercase tracking-widest text-foreground">
          📈 Earnings Movers
        </h2>
        <p className="text-[10px] font-mono text-muted-foreground/70">
          Post-earnings gappers — implied vs realized move, reaction classification, follow-up plays.
        </p>
      </header>

      <QECard variant="default" padding="md">
        <QEStatStrip stats={[
          { label: 'TOTAL',       value: movers.length },
          { label: 'GAPPING UP',   value: upCount, tone: 'bull' },
          { label: 'GAPPING DOWN', value: downCount, tone: 'bear' },
          { label: 'BEAT-RIP',     value: beatRippers, tone: 'cyan' },
          { label: 'MISS-DUMP',    value: missDumpers, tone: 'bear' },
        ]} />
      </QECard>

      {/* Direction filter */}
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">
          DIRECTION
        </span>
        {(['all', 'up', 'down'] as const).map(d => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={cn(
              'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded border transition-colors',
              direction === d
                ? 'border-[var(--brand-cyan)]/50 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10'
                : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {d === 'up' ? '▲ Gainers' : d === 'down' ? '▼ Decliners' : 'All'}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
        </div>
      )}
      {error && (
        <QECard variant="default" padding="lg" className="text-center">
          <div className="text-sm font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Movers tracker · backend not yet wired
          </div>
          <p className="text-xs text-muted-foreground/70 max-w-md mx-auto">
            This view is queued for next sprint. The endpoint{' '}
            <code className="text-[var(--brand-cyan)]">/api/earnings/movers</code> needs a daily
            cron that captures prior-close + post-print quote for every recent reporter,
            classifies the reaction, and stores it. UI is built — just needs the data pipeline.
          </p>
        </QECard>
      )}

      {!isLoading && !error && filtered.length === 0 && movers.length === 0 && (
        <QECard variant="default" padding="lg" className="text-center text-[10px] font-mono text-muted-foreground">
          No earnings movers in the last 24h.
        </QECard>
      )}

      {filtered.length > 0 && (
        <QECard variant="default" padding="none" className="overflow-hidden">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-muted/30 border-b border-border/40">
              <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
                <Th>Symbol</Th>
                <Th>Reported</Th>
                <Th align="right">Prior Close</Th>
                <Th align="right">Spot</Th>
                <Th align="right">Gap%</Th>
                <Th align="right">Implied</Th>
                <Th align="right">Vs iMove</Th>
                <Th align="right">Surprise</Th>
                <Th>Reaction</Th>
                <Th>Follow-up</Th>
                <Th align="right">→</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => <MoverRow key={m.symbol} m={m} onJump={() => setLocation(`/r/${m.symbol}`)} />)}
            </tbody>
          </table>
        </QECard>
      )}
    </div>
  );
}

function MoverRow({ m, onJump }: { m: MoverRow; onJump: () => void }) {
  const gapTone = m.gapPct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';
  const Icon = m.gapPct >= 0 ? TrendingUp : TrendingDown;
  const reactionVariant = (() => {
    switch (m.reaction) {
      case 'BEAT-RIP': return 'bull';
      case 'BEAT-FADE': return 'warn';
      case 'MISS-DUMP': return 'bear';
      case 'MISS-RECOVER': return 'cyan';
      default: return 'default';
    }
  })();

  // "Vs iMove" — exceeded expectations or fell short
  const vsImplied = Math.abs(m.gapPct) - m.impliedMovePct;

  return (
    <tr onClick={onJump} className="border-b border-border/20 hover:bg-muted/20 cursor-pointer">
      <Td>
        <div className="font-bold text-foreground">{m.symbol}</div>
        <div className="text-[9px] text-muted-foreground/70 truncate max-w-[180px]">{m.name}</div>
      </Td>
      <Td className="text-muted-foreground">{m.reportedDate.slice(5)} <span className="text-[var(--brand-cyan)]">{m.reportedTime}</span></Td>
      <Td align="right" className="tabular-nums text-muted-foreground">${m.priorClose.toFixed(2)}</Td>
      <Td align="right" className="tabular-nums text-foreground">${m.spot.toFixed(2)}</Td>
      <Td align="right" className={cn('tabular-nums font-bold', gapTone)}>
        <Icon className="w-3 h-3 inline mr-0.5" />
        {m.gapPct >= 0 ? '+' : ''}{m.gapPct.toFixed(1)}%
      </Td>
      <Td align="right" className="tabular-nums text-muted-foreground">±{m.impliedMovePct.toFixed(1)}%</Td>
      <Td align="right" className={cn('tabular-nums font-bold', vsImplied > 0 ? 'text-[var(--brand-gold)]' : 'text-muted-foreground')}>
        {vsImplied >= 0 ? '+' : ''}{vsImplied.toFixed(1)}%
      </Td>
      <Td align="right" className={cn('tabular-nums', m.surprisePct && m.surprisePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
        {m.surprisePct != null ? `${m.surprisePct >= 0 ? '+' : ''}${m.surprisePct.toFixed(0)}%` : '—'}
      </Td>
      <Td><QEPill variant={reactionVariant}>{m.reaction.replace('-', ' ')}</QEPill></Td>
      <Td className="text-[9px] text-muted-foreground/80 truncate max-w-[200px]">{m.followup}</Td>
      <Td align="right" className="text-muted-foreground"><ArrowRight className="w-3 h-3 inline" /></Td>
    </tr>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={cn('px-2 py-1.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>{children}</th>;
}
function Td({ children, align = 'left', className }: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={cn('px-2 py-1.5 whitespace-nowrap', align === 'right' && 'text-right', className)}>{children}</td>;
}
