/**
 * /movers — Pre-market, After-hours, Overnight gappers
 *
 * Three tabs that scan the curated universe and surface the top % movers
 * in each time window. Click any ticker to jump to /r/[ticker] for analysis.
 *
 * Auto-refresh: every 60s while the window is active.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Clock, Moon, Sunrise, Sunset } from 'lucide-react';

type Window = 'premarket' | 'afterhours' | 'overnight';

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

const TABS: { id: Window; label: string; icon: any; hint: string }[] = [
  { id: 'premarket',  label: 'Pre-Market',  icon: Sunrise, hint: '4:00 AM - 9:30 AM ET — yesterday close → PM price' },
  { id: 'afterhours', label: 'After-Hours', icon: Sunset,  hint: '4:00 PM - 8:00 PM ET — today close → AH price' },
  { id: 'overnight',  label: 'Overnight',   icon: Moon,    hint: 'Futures (ES/NQ/RTY) + crypto (BTC/ETH/SOL)' },
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
    <div className="max-w-5xl mx-auto px-4 py-5 space-y-3">
      <header className="space-y-1">
        <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground">
          Movers <span className="text-[var(--brand-cyan)]">·</span>{' '}
          <span className="text-muted-foreground/70 text-sm normal-case tracking-normal font-normal">
            PM / AH / Overnight gappers
          </span>
        </h1>
        <p className="text-[11px] font-mono text-muted-foreground/70">
          Top movers when the regular market is closed. Click any ticker to research.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider border-b-2 transition ${
                active
                  ? 'border-[var(--brand-cyan)] text-[var(--brand-cyan)]'
                  : 'border-transparent text-muted-foreground/70 hover:text-foreground'
              }`}
              title={t.hint}
            >
              <Icon className="h-3 w-3" />
              {t.label}
            </button>
          );
        })}
      </div>

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
      <div className="flex items-center justify-between px-3 py-2 rounded border border-border/40 bg-muted/10">
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-muted-foreground/60 uppercase tracking-wider">Last scan:</span>
          <span className="text-foreground">
            {data?.asOf ? new Date(data.asOf).toLocaleTimeString() : '—'}
          </span>
          {data?.summary && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <span className="text-emerald-500">▲ {data.summary.upGappers}</span>
              <span className="text-rose-500">▼ {data.summary.downGappers}</span>
              <span className="text-muted-foreground/40">of {data.summary.totalScanned}</span>
            </>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="text-[10px] font-mono text-[var(--brand-cyan)] hover:underline flex items-center gap-1"
        >
          {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-[11px] font-mono text-muted-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          Scanning universe…
        </div>
      )}

      {error && (
        <div className="text-[11px] font-mono text-rose-500 px-3 py-2 rounded bg-rose-500/10 border border-rose-500/30">
          ✗ {(error as Error).message}
        </div>
      )}

      {!isLoading && gappers.length === 0 && (
        <div className="text-center py-8 text-[11px] font-mono text-muted-foreground/60">
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
          <MoverList title="GAINERS" icon={TrendingUp} color="emerald" gappers={ups.slice(0, 20)} />
          <MoverList title="LOSERS"  icon={TrendingDown} color="rose"    gappers={downs.slice(0, 20)} />
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
  color: 'emerald' | 'rose';
  gappers: MoverQuote[];
}) {
  const colorClass = color === 'emerald' ? 'text-emerald-500' : 'text-rose-500';
  return (
    <div className="qe-card border border-border/40 rounded p-2">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        <span className={`text-[11px] font-mono uppercase tracking-wider font-bold ${colorClass}`}>{title}</span>
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
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/20 transition border border-transparent hover:border-border/20"
            >
              <div className="font-mono font-bold text-[12px] text-foreground min-w-[60px]">
                {g.symbol}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground/70 min-w-[70px]">
                ${g.price.toFixed(2)}
              </div>
              <div className={`text-[11px] font-mono font-bold ${colorClass} min-w-[64px] text-right`}>
                {g.changePct >= 0 ? '+' : ''}{g.changePct.toFixed(2)}%
              </div>
              <div className="text-[9px] font-mono text-muted-foreground/50 flex-1 truncate ml-2">
                {g.sector ?? ''}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
