/**
 * Market Pulse Widget — embeddable mini version of /pulse
 * For dashboard/home page integration.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

interface PulseData {
  marketColor: 'GREEN' | 'RED' | 'MIXED';
  narrative: string;
  indices: { symbol: string; name: string; price: number; change: number }[];
  sectors: { symbol: string; name: string; change: number }[];
  macro: {
    vix: number; vixState: string;
    yield10Y: number;
    btc: { price: number; change: number };
    riskTone: string;
  };
  regime: { label: string; confidence: number };
  topMovers: {
    gainers: { symbol: string; price: number; change: number }[];
    decliners: { symbol: string; price: number; change: number }[];
  };
  fearGreed?: { value: number; label: string };
  breadth?: { advanceDeclineRatio: number; pctAbove50DMA: number; spyTrend: string };
  optionsContext?: { putCallRatio: number; pcrLabel: string };
  gexLevels?: {
    spy: { spot: number; flip: number; callWall: number; putWall: number };
    qqq: { spot: number; flip: number; callWall: number; putWall: number };
  };
  preMarketMovers?: {
    gainers: { symbol: string; change: number; price: number }[];
  };
}

interface GexTopPlay {
  symbol: string;
  spotPrice: number;
  gammaFlip: number | null;
  flipDistancePct: number;
  callWall: number | null;
  putWall: number | null;
  score?: number;
  bias?: string;
}

export function MarketPulseWidget() {
  const { data, isLoading } = useQuery<PulseData>({
    queryKey: ['market-pulse-widget'],
    queryFn: async () => {
      const res = await fetch('/api/market-pulse');
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // GEX Hub top plays (the missing wire)
  const { data: gexHub } = useQuery<{ hub: { topPlays: GexTopPlay[] } }>({
    queryKey: ['gex-hub-widget'],
    queryFn: async () => {
      const res = await fetch('/api/gex-vex/hub', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
        <div className="text-sm text-zinc-500">Loading market pulse...</div>
      </div>
    );
  }

  const colorClass = {
    GREEN: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    RED: 'bg-red-500/10 border-red-500/30 text-red-400',
    MIXED: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  }[data.marketColor];

  const topSectors = data.sectors.slice(0, 3);
  const bottomSectors = data.sectors.slice(-3).reverse();

  return (
    <Link href="/pulse">
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 hover:border-cyan-500/30 transition-colors cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Market Pulse</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-bold ${colorClass}`}>
              {data.marketColor === 'GREEN' ? '🟢' : data.marketColor === 'RED' ? '🔴' : '🟡'} {data.marketColor}
            </span>
          </div>
          <span className="text-xs text-zinc-600">view full →</span>
        </div>

        {/* Indices row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {data.indices.slice(0, 4).map((idx) => (
            <div key={idx.symbol} className="text-center">
              <div className="text-[10px] text-zinc-500">{idx.symbol}</div>
              <div className="text-sm font-bold">${idx.price.toFixed(0)}</div>
              <div className={`text-xs font-mono ${idx.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {idx.change >= 0 ? '+' : ''}{idx.change}%
              </div>
            </div>
          ))}
        </div>

        {/* Macro stripe */}
        <div className="flex items-center justify-between text-xs mb-3 pb-3 border-b border-zinc-800">
          <span className="text-zinc-400">VIX <span className="text-zinc-200 font-mono">{data.macro.vix.toFixed(1)}</span></span>
          <span className="text-zinc-400">10Y <span className="text-zinc-200 font-mono">{data.macro.yield10Y.toFixed(2)}%</span></span>
          <span className="text-zinc-400">BTC <span className={`font-mono ${data.macro.btc.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${(data.macro.btc.price/1000).toFixed(1)}k</span></span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            data.macro.riskTone === 'RISK-ON' ? 'bg-emerald-500/10 text-emerald-400' :
            data.macro.riskTone === 'RISK-OFF' ? 'bg-red-500/10 text-red-400' :
            'bg-zinc-700/40 text-zinc-400'
          }`}>{data.macro.riskTone}</span>
        </div>

        {/* Sectors */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[10px] uppercase text-emerald-400 mb-1">Leading</div>
            {topSectors.map((s) => (
              <div key={s.symbol} className="flex justify-between text-xs py-0.5">
                <span className="text-zinc-300 truncate">{s.name}</span>
                <span className="text-emerald-400 font-mono">+{s.change}%</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase text-red-400 mb-1">Lagging</div>
            {bottomSectors.map((s) => (
              <div key={s.symbol} className="flex justify-between text-xs py-0.5">
                <span className="text-zinc-300 truncate">{s.name}</span>
                <span className={`font-mono ${s.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {s.change >= 0 ? '+' : ''}{s.change}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Fear/Greed + Breadth + P/C row (deep context) */}
        {(data.fearGreed || data.breadth || data.optionsContext) && (
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800 mb-3">
            {data.fearGreed && (
              <div className="text-center">
                <div className="text-[9px] uppercase text-zinc-500">Fear/Greed</div>
                <div className={`text-base font-bold ${
                  data.fearGreed.value >= 75 ? 'text-emerald-400' :
                  data.fearGreed.value >= 55 ? 'text-cyan-400' :
                  data.fearGreed.value >= 45 ? 'text-amber-400' :
                  data.fearGreed.value >= 25 ? 'text-orange-400' :
                  'text-red-400'
                }`}>{data.fearGreed.value}</div>
                <div className="text-[9px] text-zinc-400">{data.fearGreed.label.replace('_', ' ')}</div>
              </div>
            )}
            {data.breadth && (
              <div className="text-center">
                <div className="text-[9px] uppercase text-zinc-500">Above 50DMA</div>
                <div className={`text-base font-bold ${data.breadth.pctAbove50DMA >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {data.breadth.pctAbove50DMA}%
                </div>
                <div className="text-[9px] text-zinc-400">A/D {data.breadth.advanceDeclineRatio.toFixed(1)}</div>
              </div>
            )}
            {data.optionsContext && (
              <div className="text-center">
                <div className="text-[9px] uppercase text-zinc-500">Put/Call</div>
                <div className={`text-base font-bold ${
                  data.optionsContext.pcrLabel === 'BULLISH' ? 'text-emerald-400' :
                  data.optionsContext.pcrLabel === 'BEARISH' ? 'text-red-400' :
                  'text-amber-400'
                }`}>{data.optionsContext.putCallRatio}</div>
                <div className="text-[9px] text-zinc-400">{data.optionsContext.pcrLabel}</div>
              </div>
            )}
          </div>
        )}

        {/* GEX levels for SPY/QQQ (compact) */}
        {data.gexLevels && (
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-800 mb-3 text-[10px]">
            {(['spy', 'qqq'] as const).map(idx => {
              const g = data.gexLevels![idx];
              return (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-zinc-300">{idx.toUpperCase()} GEX</div>
                  <div className="flex justify-between"><span className="text-zinc-500">Flip</span><span className="text-amber-400 font-mono">${g.flip.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Call Wall</span><span className="text-emerald-400 font-mono">${g.callWall.toFixed(0)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Put Wall</span><span className="text-red-400 font-mono">${g.putWall.toFixed(0)}</span></div>
                </div>
              );
            })}
          </div>
        )}

        {/* Top movers */}
        {data.topMovers.gainers.length > 0 && (
          <div className="pt-3 border-t border-zinc-800">
            <div className="text-[10px] uppercase text-zinc-500 mb-1">Watchlist Top Gainers</div>
            <div className="flex flex-wrap gap-1.5">
              {data.topMovers.gainers.slice(0, 5).map((m) => (
                <span key={m.symbol} className="text-xs px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">
                  {m.symbol} +{m.change}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Pre-market gainers (when available) */}
        {data.preMarketMovers?.gainers && data.preMarketMovers.gainers.length > 0 && (
          <div className="pt-2 mt-2 border-t border-zinc-800">
            <div className="text-[10px] uppercase text-cyan-400 mb-1">🌅 Pre-Market Gainers</div>
            <div className="flex flex-wrap gap-1.5">
              {data.preMarketMovers.gainers.slice(0, 5).map((m) => (
                <span key={m.symbol} className="text-xs px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400">
                  {m.symbol} +{m.change}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* GEX Hub Top Plays (the missing bridge) */}
        {gexHub?.hub?.topPlays && gexHub.hub.topPlays.length > 0 && (
          <div className="pt-2 mt-2 border-t border-zinc-800">
            <div className="text-[10px] uppercase text-purple-400 mb-1">🎯 GEX Top Plays</div>
            <div className="flex flex-wrap gap-1.5">
              {gexHub.hub.topPlays.slice(0, 6).map((p) => (
                <span
                  key={p.symbol}
                  className={`text-xs px-2 py-0.5 rounded border ${
                    p.bias === 'long' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                    p.bias === 'short' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                    'bg-purple-500/10 border-purple-500/30 text-purple-400'
                  }`}
                  title={p.gammaFlip != null ? `Flip $${p.gammaFlip.toFixed(0)} (${p.flipDistancePct >= 0 ? '+' : ''}${p.flipDistancePct.toFixed(1)}%)` : 'No flip'}
                >
                  {p.symbol}{p.score ? ` ${p.score}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
