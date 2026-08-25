import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EpochChart } from '@/components/charting/epoch-chart';
import { TerminalPageHeader } from '@/components/templates/terminal-page';
import { useStockContext } from '@/contexts/stock-context';
import type { ConvictionPick, ConvictionsResponse } from '@/lib/convictions';

export function ChartLab() {
  const { currentStock } = useStockContext();
  const symbol = currentStock?.symbol?.toUpperCase() || 'SPY';
  const { data } = useQuery<ConvictionsResponse>({
    queryKey: ['/api/convictions', 'chart-lab'],
    queryFn: async () => {
      const response = await fetch('/api/convictions?limit=100&minScore=0', { credentials: 'include' });
      if (!response.ok) throw new Error('convictions unavailable');
      return response.json();
    },
    staleTime: 60_000,
    retry: 1,
  });
  const pick = useMemo(
    () => data?.picks?.find((candidate: ConvictionPick) => candidate.symbol.toUpperCase() === symbol),
    [data, symbol],
  );
  const bullish = pick?.direction !== 'short';
  const levels = pick ? [
    { price: pick.stopLoss, label: 'STOP', color: 'var(--trade-bearish)' },
    { price: pick.entryPrice, label: 'ENTRY', color: 'var(--brand-cyan)' },
    { price: pick.targetPrice, label: 'T1', color: 'var(--trade-bullish)' },
  ].filter((level) => Number.isFinite(level.price)) : [];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4 px-3 py-4 md:px-5">
      <TerminalPageHeader
        eyebrow="Price intelligence"
        title={`Chart Lab · ${symbol}`}
        description="One chart, every timeframe, with published QuantEdge levels anchored to the same ticker used across Oracle, Flow and GEX."
        status={pick ? `${pick.convictionBand} · ${pick.convictionScore > 0 ? '+' : ''}${pick.convictionScore} evidence` : 'no published signal'}
        tone={pick ? (bullish ? 'bull' : 'bear') : 'structural'}
      />

      <section className="overflow-hidden rounded-lg border border-card-border bg-card">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/60 px-4 py-3 font-mono">
          <div>
            <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">Instrument</div>
            <div className="mt-0.5 text-[18px] font-bold tracking-[0.04em] text-foreground">{symbol}</div>
          </div>
          {pick && <>
            <Metric label="Side" value={bullish ? '▲ LONG' : '▼ SHORT'} tone={bullish ? 'bull' : 'bear'} />
            <Metric label="Entry" value={`$${pick.entryPrice.toFixed(2)}`} tone="structural" />
            <Metric label="Stop" value={`$${pick.stopLoss.toFixed(2)}`} tone="bear" />
            <Metric label="T1" value={`$${pick.targetPrice.toFixed(2)}`} tone="bull" />
            <Metric label="R:R" value={`${pick.riskRewardRatio.toFixed(1)}:1`} />
          </>}
          <div className="ml-auto text-right text-[9px] uppercase tracking-wider text-muted-foreground/55">
            candles / line · crosshair · zoom · expand
          </div>
        </div>
        <EpochChart symbol={symbol} levels={levels as any} initialTf="1h" initialMode="candles" height={620} />
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'bull' | 'bear' | 'structural' }) {
  const color = tone === 'bull' ? 'var(--trade-bullish)' : tone === 'bear' ? 'var(--trade-bearish)' : tone === 'structural' ? 'var(--brand-cyan)' : undefined;
  return <div className="border-l border-border/60 pl-4"><div className="text-[8px] uppercase tracking-[0.14em] text-muted-foreground/55">{label}</div><div className="mt-1 text-[11px] font-bold" style={{ color }}>{value}</div></div>;
}
