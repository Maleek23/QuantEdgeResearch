/**
 * Market Pulse — fully migrated to QE primitives.
 *
 * Demonstrates the canonical composition pattern:
 *   <QECard>     containers
 *   <QEStat>     metric tiles
 *   <QEPill>     status badges
 *   <QEBar>      progress / score
 *   <QESection>  collapsible panel + header
 *   <QEDrawer>   sector drill-in slide-out
 *
 * Result: ~250 lines, zero raw Tailwind colors, zero hand-rolled cards.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  QECard,
  QEStat,
  QEPill,
  QEBar,
  QESection,
  QEDrawer,
} from '@/components/ui/qe';

interface IndexQuote { symbol: string; name: string; price: number; change: number; preMarketChange: number | null; }
interface SectorRotation { symbol: string; name: string; change: number; rank: number; }
interface TickerMove { symbol: string; price: number; change: number; }

interface MarketPulse {
  asOf: string;
  marketState: 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED';
  marketColor: 'GREEN' | 'RED' | 'MIXED';
  narrative: string;
  indices: IndexQuote[];
  sectors: SectorRotation[];
  macro: { vix: number; vixState: string; yield10Y: number; yieldDirection: string; dxy: number; btc: { price: number; change: number }; riskTone: string };
  regime: { label: string; confidence: number; description: string };
  topMovers: { gainers: TickerMove[]; decliners: TickerMove[] };
  breadth?: { advanceDeclineRatio: number; pctAbove50DMA: number; newHighsLowsRatio: number; spyTrend: string };
  optionsContext?: { putCallRatio: number; pcrLabel: string; smartMoneyDirection: string };
  gexLevels?: { spy: { spot: number; flip: number; callWall: number; putWall: number; regime: string }; qqq: { spot: number; flip: number; callWall: number; putWall: number; regime: string } };
  fearGreed?: { value: number; label: string; components: { vix: number; breadth: number; pcr: number; momentum: number } };
  futures?: { symbol: string; name: string; price: number; change: number }[];
  preMarketMovers?: { gainers: { symbol: string; change: number; price: number }[]; decliners: { symbol: string; change: number; price: number }[] };
}

interface SectorDeepDive {
  symbol: string; name: string; etfChange: number;
  topGainers: TickerMove[]; topDecliners: TickerMove[]; allComponents: TickerMove[];
}

const MARKET_COLOR_PILL = {
  GREEN: 'bull',
  RED: 'bear',
  MIXED: 'warn',
} as const;

export default function MarketPulsePage() {
  const [drawerSector, setDrawerSector] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<MarketPulse>({
    queryKey: ['market-pulse'],
    queryFn: async () => (await fetch('/api/market-pulse')).json(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: sectorData } = useQuery<SectorDeepDive>({
    queryKey: ['sector-dive', drawerSector],
    queryFn: async () => (await fetch(`/api/market-pulse/sector/${drawerSector}`)).json(),
    enabled: !!drawerSector,
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-4 text-xs font-mono text-muted-foreground">Loading market pulse…</div>
    );
  }

  const isPreMarket = data.marketState === 'PRE';

  return (
    <div className="space-y-3 max-w-7xl mx-auto">
      {/* HERO STRIP */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-base font-mono font-bold uppercase tracking-widest text-foreground">
            Market Pulse
          </h2>
          <QEPill variant={MARKET_COLOR_PILL[data.marketColor]}>
            {data.marketColor}
          </QEPill>
          <QEPill variant="default" className="hidden md:inline-flex">
            {data.regime.label.replace(/_/g, ' ')} · {data.regime.confidence}%
          </QEPill>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-[var(--brand-cyan)]' : ''}`} />
        </button>
      </div>

      {/* INDICES — 4 tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {data.indices.map(idx => (
          <QECard key={idx.symbol} variant="default" padding="sm">
            <QEStat
              label={idx.symbol}
              value={`$${idx.price.toFixed(2)}`}
              delta={idx.change}
              size="md"
            />
          </QECard>
        ))}
      </div>

      {/* MACRO STRIP — 5 mini-cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <QECard variant="inset" padding="sm">
          <QEStat label="VIX" value={data.macro.vix.toFixed(1)} caption={data.macro.vixState} size="sm" />
        </QECard>
        <QECard variant="inset" padding="sm">
          <QEStat label="10Y" value={`${data.macro.yield10Y.toFixed(2)}%`} caption={data.macro.yieldDirection} size="sm" />
        </QECard>
        <QECard variant="inset" padding="sm">
          <QEStat label="DXY" value={data.macro.dxy.toFixed(2)} size="sm" />
        </QECard>
        <QECard variant="inset" padding="sm">
          <QEStat
            label="BTC"
            value={`$${(data.macro.btc.price / 1000).toFixed(1)}k`}
            delta={data.macro.btc.change}
            size="sm"
          />
        </QECard>
        <QECard variant="inset" padding="sm">
          <QEStat
            label="Risk"
            value={data.macro.riskTone.replace('-', ' ')}
            tone={data.macro.riskTone.includes('ON') ? 'bull' : data.macro.riskTone.includes('OFF') ? 'bear' : 'warn'}
            size="sm"
          />
        </QECard>
      </div>

      {/* PRE-MARKET — only when state is PRE */}
      {isPreMarket && (
        <QESection
          title="🌅 Pre-Market"
          subtitle="Futures + overnight gappers"
          action={<QEPill variant="cyan">live</QEPill>}
          defaultOpen
        >
          <PreMarketBlock data={data} />
        </QESection>
      )}

      {/* SECTOR ROTATION — default open, click row → drawer */}
      <QESection
        title="Sector Rotation"
        subtitle={`Top: ${data.sectors[0]?.name} +${data.sectors[0]?.change}% · Bottom: ${data.sectors.slice(-1)[0]?.name} ${data.sectors.slice(-1)[0]?.change}%`}
        collapsible
        defaultOpen
      >
        <div className="space-y-1">
          {data.sectors.map(s => (
            <button
              key={s.symbol}
              onClick={() => setDrawerSector(s.symbol)}
              className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/40 transition-colors text-left"
            >
              <span className={`text-xs font-mono w-14 tabular-nums ${s.change >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
                {s.change >= 0 ? '+' : ''}{s.change}%
              </span>
              <span className="text-xs w-32 text-foreground/80 truncate">{s.name}</span>
              <div className="flex-1">
                <QEBar
                  value={Math.abs(s.change)}
                  max={Math.max(2, ...data.sectors.map(x => Math.abs(x.change)))}
                  tone={s.change >= 0 ? 'bull' : 'bear'}
                  size="xs"
                />
              </div>
              <span className="text-[10px] text-muted-foreground/60">→</span>
            </button>
          ))}
        </div>
      </QESection>

      {/* SIGNALS — collapsed by default */}
      <QESection
        title="Fear & Greed · Breadth · Options"
        subtitle={data.fearGreed ? `F&G ${data.fearGreed.value} · ${data.fearGreed.label.replace('_', ' ')}` : 'Sentiment + breadth + flow'}
        action={data.fearGreed && (
          <QEPill variant={
            data.fearGreed.value >= 75 ? 'bull' :
            data.fearGreed.value >= 55 ? 'cyan' :
            data.fearGreed.value >= 45 ? 'warn' : 'bear'
          }>{data.fearGreed.value}</QEPill>
        )}
        collapsible
        defaultOpen={false}
      >
        <SignalsBlock data={data} />
      </QESection>

      {/* GEX LEVELS — collapsed */}
      {data.gexLevels && (
        <QESection
          title="GEX Levels"
          subtitle={`SPY flip $${data.gexLevels.spy.flip.toFixed(0)} · QQQ flip $${data.gexLevels.qqq.flip.toFixed(0)}`}
          action={
            <QEPill variant={data.gexLevels.spy.regime === 'POSITIVE' ? 'cyan' : 'warn'}>
              {data.gexLevels.spy.regime}
            </QEPill>
          }
          collapsible
          defaultOpen={false}
        >
          <GexLevelsBlock levels={data.gexLevels} />
        </QESection>
      )}

      {/* WATCHLIST MOVERS — collapsed */}
      <QESection
        title="Watchlist Movers"
        subtitle={`${data.topMovers.gainers.length} up · ${data.topMovers.decliners.length} down`}
        collapsible
        defaultOpen={false}
      >
        <MoversBlock movers={data.topMovers} />
      </QESection>

      <div className="text-center text-[10px] font-mono text-muted-foreground/60 pt-1">
        Updated {new Date(data.asOf).toLocaleTimeString()} · Auto-refresh 60s
      </div>

      {/* DRAWER — sector drill-down */}
      <QEDrawer
        open={!!drawerSector}
        onClose={() => setDrawerSector(null)}
        title={sectorData?.name ?? drawerSector ?? ''}
        subtitle={drawerSector ?? ''}
        size="md"
      >
        {sectorData ? (
          <div className="p-4 space-y-3">
            <QEStat
              label="ETF Change"
              value={`${sectorData.etfChange >= 0 ? '+' : ''}${sectorData.etfChange}%`}
              tone={sectorData.etfChange >= 0 ? 'bull' : 'bear'}
              size="xl"
            />
            <div className="grid grid-cols-2 gap-3">
              <QECard variant="accent-bull">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--trade-bullish)] mb-1.5">
                  Top Gainers
                </div>
                <MoversList movers={sectorData.topGainers.slice(0, 8)} tone="bull" />
              </QECard>
              <QECard variant="accent-bear">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--trade-bearish)] mb-1.5">
                  Top Decliners
                </div>
                <MoversList movers={sectorData.topDecliners.slice(0, 8)} tone="bear" />
              </QECard>
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs font-mono text-muted-foreground">Loading sector…</div>
        )}
      </QEDrawer>
    </div>
  );
}

// ─── Sub-blocks (each composed from primitives) ──────────────────────

function PreMarketBlock({ data }: { data: MarketPulse }) {
  return (
    <div className="space-y-3">
      {data.futures && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {data.futures.map(f => (
            <QECard key={f.symbol} variant="inset" padding="sm">
              <QEStat
                label={f.name}
                value={`$${f.price.toFixed(2)}`}
                delta={f.change}
                size="sm"
              />
            </QECard>
          ))}
        </div>
      )}
      {data.preMarketMovers && (
        <div className="grid grid-cols-2 gap-3">
          <QECard variant="accent-bull" padding="sm">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--trade-bullish)] mb-1.5">
              📈 Gainers
            </div>
            <MoversList movers={data.preMarketMovers.gainers.slice(0, 5).map(m => ({ ...m }))} tone="bull" />
          </QECard>
          <QECard variant="accent-bear" padding="sm">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--trade-bearish)] mb-1.5">
              📉 Decliners
            </div>
            <MoversList movers={data.preMarketMovers.decliners.slice(0, 5).map(m => ({ ...m }))} tone="bear" />
          </QECard>
        </div>
      )}
    </div>
  );
}

function SignalsBlock({ data }: { data: MarketPulse }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {data.fearGreed && (
        <QECard variant="inset" padding="sm">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Fear & Greed
          </div>
          <div className="space-y-1.5">
            {([
              ['VIX',      data.fearGreed.components.vix],
              ['Breadth',  data.fearGreed.components.breadth],
              ['P/C',      data.fearGreed.components.pcr],
              ['Momentum', data.fearGreed.components.momentum],
            ] as const).map(([label, v]) => (
              <QEBar key={label} label={label} value={v} max={100} tone="cyan" size="xs" valueRight />
            ))}
          </div>
        </QECard>
      )}
      {data.breadth && (
        <QECard variant="inset" padding="sm">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Breadth
          </div>
          <div className="space-y-1.5">
            <RowStat label="A/D Ratio" value={data.breadth.advanceDeclineRatio.toFixed(2)} tone={data.breadth.advanceDeclineRatio >= 1 ? 'bull' : 'bear'} />
            <RowStat label="% > 50DMA" value={`${data.breadth.pctAbove50DMA}%`} tone={data.breadth.pctAbove50DMA >= 50 ? 'bull' : 'bear'} />
            <RowStat label="New H/L"  value={data.breadth.newHighsLowsRatio.toFixed(2)} tone={data.breadth.newHighsLowsRatio >= 1 ? 'bull' : 'bear'} />
            <RowStat label="Trend"    value={data.breadth.spyTrend.replace('_', ' ')} tone={data.breadth.spyTrend.includes('UP') ? 'bull' : data.breadth.spyTrend.includes('DOWN') ? 'bear' : 'warn'} />
          </div>
        </QECard>
      )}
      {data.optionsContext && (
        <QECard variant="inset" padding="sm">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Options Flow
          </div>
          <div className="space-y-1.5">
            <RowStat label="P/C Ratio" value={data.optionsContext.putCallRatio.toString()} tone={data.optionsContext.pcrLabel === 'BULLISH' ? 'bull' : data.optionsContext.pcrLabel === 'BEARISH' ? 'bear' : 'warn'} />
            <RowStat label="Signal"    value={data.optionsContext.pcrLabel} tone={data.optionsContext.pcrLabel === 'BULLISH' ? 'bull' : data.optionsContext.pcrLabel === 'BEARISH' ? 'bear' : 'warn'} />
            <RowStat label="Smart $"   value={data.optionsContext.smartMoneyDirection} tone={data.optionsContext.smartMoneyDirection === 'BULL' ? 'bull' : data.optionsContext.smartMoneyDirection === 'BEAR' ? 'bear' : 'warn'} />
          </div>
        </QECard>
      )}
    </div>
  );
}

function GexLevelsBlock({ levels }: { levels: NonNullable<MarketPulse['gexLevels']> }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {(['spy', 'qqq'] as const).map(idx => {
        const g = levels[idx];
        return (
          <QECard key={idx} variant="inset" padding="sm">
            <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground mb-2">
              {idx.toUpperCase()}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <QEStat label="Spot" value={`$${g.spot.toFixed(0)}`} size="sm" />
              <QEStat label="Flip" value={`$${g.flip.toFixed(0)}`} tone="warn" size="sm" />
              <QEStat label="Call" value={`$${g.callWall.toFixed(0)}`} tone="bull" size="sm" />
              <QEStat label="Put"  value={`$${g.putWall.toFixed(0)}`}  tone="bear" size="sm" />
            </div>
          </QECard>
        );
      })}
    </div>
  );
}

function MoversBlock({ movers }: { movers: { gainers: TickerMove[]; decliners: TickerMove[] } }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <QECard variant="accent-bull" padding="sm">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--trade-bullish)] mb-1.5">
          📈 Gainers
        </div>
        <MoversList movers={movers.gainers.slice(0, 6)} tone="bull" />
      </QECard>
      <QECard variant="accent-bear" padding="sm">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--trade-bearish)] mb-1.5">
          📉 Decliners
        </div>
        <MoversList movers={movers.decliners.slice(0, 6)} tone="bear" />
      </QECard>
    </div>
  );
}

// ─── Tiny shared bits ────────────────────────────────────────────────

function MoversList({ movers, tone }: { movers: { symbol: string; change: number; price?: number }[]; tone: 'bull' | 'bear' }) {
  const colorCls = tone === 'bull' ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';
  return (
    <div className="space-y-0.5">
      {movers.map(m => (
        <div key={m.symbol} className="flex items-center justify-between text-xs font-mono py-0.5">
          <span className="font-bold">{m.symbol}</span>
          {m.price != null && <span className="text-muted-foreground tabular-nums">${m.price.toFixed(2)}</span>}
          <span className={`${colorCls} font-bold tabular-nums`}>
            {m.change >= 0 ? '+' : ''}{m.change}%
          </span>
        </div>
      ))}
    </div>
  );
}

function RowStat({ label, value, tone }: { label: string; value: string; tone: 'bull' | 'bear' | 'warn' | 'cyan' | 'default' }) {
  const colorCls =
    tone === 'bull' ? 'text-[var(--trade-bullish)]' :
    tone === 'bear' ? 'text-[var(--trade-bearish)]' :
    tone === 'warn' ? 'text-[var(--trade-neutral)]' :
    tone === 'cyan' ? 'text-[var(--brand-cyan)]' :
    'text-foreground';
  return (
    <div className="flex items-center justify-between text-[11px] font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold tabular-nums ${colorCls}`}>{value}</span>
    </div>
  );
}
