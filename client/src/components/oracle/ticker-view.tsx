/**
 * TICKER VIEW — what you get when you search a symbol that isn't a signal.
 *
 * The terminal search set the shared ticker, but every Oracle panel renders the SELECTED
 * SIGNAL, so searching MSFT changed nothing on screen: no chart, no quote, no
 * acknowledgement it happened. A search that silently does nothing is worse than no search.
 *
 * This is the fallback surface — the chart plus a live quote for any ticker, whether or
 * not the engine has an opinion on it, and it says plainly when there's no signal.
 */
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { EpochChart } from '@/components/charting/epoch-chart';
import { TC, pnlColor } from '@/lib/oracle/trading-colors';

interface Ext {
  symbol: string; lastPrice: number; previousClose: number;
  changePct: number; session: string; isExtended: boolean;
}

export function TickerView({ symbol, hasSignal, onClear }: {
  symbol: string; hasSignal: boolean; onClear?: () => void;
}) {
  const { data: q } = useQuery<Ext | null>({
    queryKey: ['/api/extended-hours/quote', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/extended-hours?limit=1&symbol=${encodeURIComponent(symbol)}`, { credentials: 'include' });
      if (!r.ok) return null;
      const b = await r.json();
      const all = [...(b.gainers ?? []), ...(b.losers ?? []), ...(b.mostActive ?? [])];
      return all.find((x: Ext) => x.symbol === symbol) ?? null;
    },
    staleTime: 60_000, retry: 1,
  });

  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <span className="text-[14px] font-mono font-bold tracking-wider text-foreground">{symbol}</span>
        {q && (
          <span className="flex items-baseline gap-2">
            <span className="text-[13px] font-mono font-bold tabular-nums text-foreground">
              ${q.lastPrice.toFixed(2)}
            </span>
            <span className="text-[11px] font-mono tabular-nums" style={{ color: pnlColor(q.changePct) }}>
              {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
            </span>
            {q.isExtended && (
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: TC.warn }}>
                {q.session === 'pre' ? 'pre-market' : 'after-hours'}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            {hasSignal ? 'signal below' : 'no active signal'}
          </span>
          {onClear && (
            <button onClick={onClear} aria-label="Clear ticker"
              className="cursor-pointer rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      <div className="p-2">
        <EpochChart symbol={symbol} initialTf="1D" height={320} />
      </div>

      {!hasSignal && (
        <p className="border-t border-border/30 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
          The engine has no published signal on {symbol} right now — this is the chart only.
          GEX and PRISM will follow the same ticker.
        </p>
      )}
    </div>
  );
}
