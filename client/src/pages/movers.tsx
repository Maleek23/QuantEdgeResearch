/**
 * /movers — Pre-market, After-hours, Overnight gappers
 *
 * Three tabs that scan the curated universe and surface the top % movers
 * in each time window. Click any ticker to jump to /r/[ticker] for analysis.
 *
 * Auto-refresh: every 60s while the window is active. Lives inside HuntShell,
 * so it owns no outer padding / page <h1>; styled to the cockpit aesthetic.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Clock, Moon, Sunrise, Sunset } from 'lucide-react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';

type Window = 'premarket' | 'afterhours' | 'overnight';

const BULL = 'var(--trade-bullish)';
const BEAR = 'var(--trade-bearish)';

interface MoverQuote {
  symbol: string;
  price: number;
  prevClose: number;
  changePct: number;
  volume: number;
  sector?: string;
  capTier?: string;
  direction: 'up' | 'down';
  asOf: string;
}

interface MoversResponse {
  ok: boolean;
  window: Window;
  asOf: string;
  gappers: MoverQuote[];
  summary?: {
    totalScanned: number;
    upGappers: number;
    downGappers: number;
  };
}

const TABS: readonly QETabItem<Window>[] = [
  { id: 'premarket',  label: 'Pre-Market',  icon: <Sunrise className="h-3 w-3" />, hint: '4:00 AM - 9:30 AM ET — yesterday close → PM price' },
  { id: 'afterhours', label: 'After-Hours', icon: <Sunset className="h-3 w-3" />,  hint: '4:00 PM - 8:00 PM ET — today close → AH price' },
  { id: 'overnight',  label: 'Overnight',   icon: <Moon className="h-3 w-3" />,    hint: 'Futures (ES/NQ/RTY) + crypto (BTC/ETH/SOL)' },
];

export default function MoversPage() {
  const [tab, setTab] = useState<Window>('premarket');

  // Detect best default tab based on current NY time
  useEffect(() => {
    const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = ny.getHours();
    if (hour >= 4 && hour < 10) setTab('premarket');
    else if (hour >= 16 && hour < 20) setTab('afterhours');
    else setTab('overnight');
  }, []);

  return (
    <div className="space-y-3">
      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="SESSION" />
      <MoversTab window={tab} />
    </div>
  );
}

function MoversTab({ window }: { window: Window }) {
  const { data, isLoading, error, isFetching, refetch } = useQuery<MoversResponse>({
    queryKey: ['/api/movers', window],
    queryFn: async () => {
      const r = await fetch(`/api/movers/${window}?limit=40`, { credentials: 'include' });
      if (!r.ok) throw new Error(`Scan failed (${r.status})`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const gappers = data?.gappers ?? [];
  const ups = useMemo(() => gappers.filter(g => g.direction === 'up'), [gappers]);
  const downs = useMemo(() => gappers.filter(g => g.direction === 'down'), [gappers]);

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-card-border bg-foreground/[0.03]">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-muted-foreground/60 uppercase tracking-widest">Last scan:</span>
          <span className="text-foreground tabular-nums">
            {data?.asOf ? new Date(data.asOf).toLocaleTimeString() : '—'}
          </span>
          {data?.summary && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span style={{ color: BULL }}>▲ {data.summary.upGappers}</span>
              <span style={{ color: BEAR }}>▼ {data.summary.downGappers}</span>
              <span className="text-muted-foreground/40">of {data.summary.totalScanned}</span>
            </>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="text-[10px] font-mono text-[var(--brand-cyan)] hover:underline flex items-center gap-1 cursor-pointer"
        >
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-[11px] font-mono text-muted-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-[var(--brand-cyan)]" />
          Scanning universe…
        </div>
      )}

      {error && (
        <div
          className="text-[11px] font-mono px-3 py-2 rounded-lg border"
          style={{ color: BEAR, background: `color-mix(in srgb, ${BEAR} 10%, transparent)`, borderColor: `color-mix(in srgb, ${BEAR} 30%, transparent)` }}
        >
          ✗ {(error as Error).message}
        </div>
      )}

      {!isLoading && gappers.length === 0 && (
        <div className="text-center py-8 text-[11px] font-mono text-muted-foreground/60 rounded-lg border border-card-border bg-card">
          <Clock className="h-4 w-4 inline mr-2" />
          No significant gappers right now (threshold: ±1.5%).
          <div className="mt-1 text-muted-foreground/50">
            Auto-refreshes every minute when the window is active.
          </div>
        </div>
      )}

      {/* Two columns: gainers + losers */}
      {!isLoading && gappers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MoverList title="GAINERS" icon={TrendingUp} color={BULL} gappers={ups.slice(0, 20)} />
          <MoverList title="LOSERS"  icon={TrendingDown} color={BEAR} gappers={downs.slice(0, 20)} />
        </div>
      )}
    </div>
  );
}

function MoverList({
  title,
  icon: Icon,
  color,
  gappers,
}: {
  title: string;
  icon: any;
  color: string;
  gappers: MoverQuote[];
}) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-2">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-[11px] font-mono uppercase tracking-widest font-bold" style={{ color }}>{title}</span>
        <span className="text-[10px] font-mono text-muted-foreground/50 ml-auto">{gappers.length}</span>
      </div>

      {gappers.length === 0 ? (
        <div className="text-[10px] font-mono text-muted-foreground/40 px-2 py-3 text-center">
          No {title.toLowerCase()}
        </div>
      ) : (
        <div className="space-y-0.5">
          {gappers.map(g => (
            <Link
              key={g.symbol}
              href={`/r/${g.symbol}`}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-foreground/[0.04] transition-colors border border-transparent hover:border-border/20"
            >
              <TickerLogo symbol={g.symbol} size="sm" />
              <div className="font-mono font-bold text-[12px] text-foreground min-w-[56px]">
                {g.symbol}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground/70 min-w-[64px] tabular-nums">
                ${g.price.toFixed(2)}
              </div>
              <div className="text-[11px] font-mono font-bold min-w-[64px] text-right tabular-nums" style={{ color }}>
                {g.changePct >= 0 ? '+' : ''}{g.changePct.toFixed(2)}%
              </div>
              <div className="text-[9px] font-mono text-muted-foreground/50 flex-1 truncate ml-1">
                {g.sector ?? ''}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
