/**
 * Flow Edge
 * =========
 * Institutional options flow scanner — the Algo Edge equivalent.
 * Shows large trades, sweeps, blocks, unusual activity for any stock.
 * Integrates with GEX convergence for high-conviction signals.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useSearch, Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Search,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  BarChart3,
  Filter,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Flame,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface FlowTrade {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
  volume: number;
  openInterest: number | null;
  premium: number;
  totalPremium: number;
  impliedVolatility: number | null;
  delta: number | null;
  underlyingPrice: number | null;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  flowType: string;
  unusualScore: number;
  strategyCategory: string | null;
  dteCategory: string | null;
  isLotto: boolean;
  detectedAt: string;
}

interface FlowStats {
  totalTrades: number;
  totalValue: number;
  callCount: number;
  putCount: number;
  callPutRatio: number;
  peakHour: string;
  mostActiveTickers: { symbol: string; count: number; totalPremium: number }[];
  repeatTickers: { symbol: string; count: number }[];
  unusualActivity: { symbol: string; unusualScore: number; flowType: string }[];
  topTradesByValue: FlowTrade[];
}

interface FlowResponse {
  trades: FlowTrade[];
  stats: FlowStats;
  pagination: { limit: number; offset: number; total: number };
}

interface ConvergenceSignal {
  symbol: string;
  conviction: 'HIGH' | 'MEDIUM' | 'LOW';
  gexBias: string;
  gexRegime: string;
  flowBias: string;
  flowStrength: number;
  convergenceType: string;
  flowCount: number;
  totalPremium: number;
  callCount: number;
  putCount: number;
  gexAnchor: number;
  gexFlipPoint: number | null;
  spotPrice: number;
  defenseLines: number[];
  gexRating: number;
  reasoning: string;
  strategy: string;
}

// ═══════════════════════════════════════════════════════════════
// FILTER PRESETS
// ═══════════════════════════════════════════════════════════════

type FilterPreset = 'all' | 'large' | '0dte' | 'sweeps' | 'lotto' | 'institutional';

const FILTER_PRESETS: { key: FilterPreset; label: string; params: Record<string, any> }[] = [
  { key: 'all', label: 'All Flow', params: {} },
  { key: 'large', label: 'Large Trades', params: { minPremium: 50000 } },
  { key: '0dte', label: 'SPX/0DTE', params: { dteCategory: '0DTE' } },
  { key: 'sweeps', label: 'Sweeps', params: { flowType: 'sweep' } },
  { key: 'lotto', label: 'Lotto', params: { strategyCategory: 'lotto' } },
  { key: 'institutional', label: 'Institutional', params: { flowType: 'block', minPremium: 100000 } },
];

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function formatPremium(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatTime(iso: string): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function convictionColor(c: string) {
  if (c === 'HIGH') return 'text-amber-400 bg-amber-500/20 border-amber-500/40';
  if (c === 'MEDIUM') return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40';
  return 'text-slate-400 bg-slate-500/20 border-slate-500/40';
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

function useOptionsFlow(params: Record<string, any>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
  }
  return useQuery<FlowResponse>({
    queryKey: ['/api/options-flow', params],
    queryFn: async () => {
      const res = await fetch(`/api/options-flow?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch flow');
      return res.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useConvergence(symbol: string | undefined) {
  return useQuery<{ signal: ConvergenceSignal | null }>({
    queryKey: ['/api/flow-gex-convergence', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/flow-gex-convergence/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function FlowTradesTable({ trades, onSymbolClick }: { trades: FlowTrade[]; onSymbolClick: (s: string) => void }) {
  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500">
        <Activity className="w-5 h-5 mr-2 opacity-50" />
        No flow data. Scanner may be idle or market is closed.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700/50 text-slate-400">
            <th className="py-2 px-2 text-left font-medium">TICKER</th>
            <th className="py-2 px-2 text-left font-medium">STRIKE</th>
            <th className="py-2 px-2 text-left font-medium">C/P</th>
            <th className="py-2 px-2 text-left font-medium">EXP</th>
            <th className="py-2 px-2 text-right font-medium">PRICE</th>
            <th className="py-2 px-2 text-right font-medium">SIZE</th>
            <th className="py-2 px-2 text-right font-medium">VALUE</th>
            <th className="py-2 px-2 text-left font-medium">TYPE</th>
            <th className="py-2 px-2 text-left font-medium">TIME</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
              <td className="py-2 px-2">
                <button
                  onClick={() => onSymbolClick(t.symbol)}
                  className="font-mono font-semibold text-white hover:text-cyan-400 transition-colors"
                >
                  {t.symbol}
                </button>
              </td>
              <td className="py-2 px-2 font-mono text-slate-300">{t.strikePrice}</td>
              <td className="py-2 px-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    t.optionType === 'call'
                      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                      : 'text-red-400 border-red-500/40 bg-red-500/10'
                  )}
                >
                  {t.optionType.toUpperCase()}
                </Badge>
              </td>
              <td className="py-2 px-2 font-mono text-slate-400">{formatDate(t.expirationDate)}</td>
              <td className="py-2 px-2 font-mono text-right text-slate-300">
                ${t.premium?.toFixed(2) || '--'}
              </td>
              <td className="py-2 px-2 font-mono text-right text-slate-300">
                {t.volume.toLocaleString()}
              </td>
              <td className="py-2 px-2 font-mono text-right font-semibold">
                <span className={t.totalPremium >= 100000 ? 'text-amber-400' : t.totalPremium >= 50000 ? 'text-cyan-400' : 'text-slate-300'}>
                  {formatPremium(t.totalPremium)}
                </span>
              </td>
              <td className="py-2 px-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-slate-400 border-slate-600">
                  {t.flowType === 'unusual_volume' ? 'unusual' : t.flowType}
                </Badge>
              </td>
              <td className="py-2 px-2 text-slate-500 font-mono">{formatTime(t.detectedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsPanel({ stats }: { stats: FlowStats }) {
  const callPct = stats.totalTrades > 0 ? (stats.callCount / stats.totalTrades * 100) : 50;
  const putPct = 100 - callPct;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-white">{stats.totalTrades.toLocaleString()}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total Trades</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-cyan-400">{formatPremium(stats.totalValue)}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total Value</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center border border-slate-700/50">
          <div className="text-lg font-bold text-amber-400">{stats.peakHour}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Peak Hour</div>
        </div>
      </div>

      {/* Call/Put Ratio */}
      <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">CALL / PUT RATIO</div>
        <div className="flex items-center gap-1 text-[10px] mb-1">
          <span className="text-emerald-400">{callPct.toFixed(1)}% Calls</span>
          <span className="flex-1" />
          <span className="text-red-400">{putPct.toFixed(1)}% Puts</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex bg-slate-700">
          <div className="bg-emerald-500 transition-all" style={{ width: `${callPct}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${putPct}%` }} />
        </div>
      </div>

      {/* Most Active */}
      {stats.mostActiveTickers.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">MOST ACTIVE TICKERS</div>
          <div className="space-y-1.5">
            {stats.mostActiveTickers.slice(0, 5).map((t, i) => (
              <div key={t.symbol} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-mono w-4">{i + 1}</span>
                  <span className="font-semibold text-white">{t.symbol}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">{t.count}</span>
                  <span className="text-slate-500 font-mono w-16 text-right">{formatPremium(t.totalPremium)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Trades by Value */}
      {stats.topTradesByValue.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">TOP TRADES BY VALUE</div>
          <div className="space-y-1.5">
            {stats.topTradesByValue.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">{t.symbol}</span>
                <span className="text-amber-400 font-mono">{formatPremium(t.totalPremium)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Repeat Tickers */}
      {stats.repeatTickers.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">REPEAT TICKERS</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.repeatTickers.map((t) => (
              <Badge key={t.symbol} variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-cyan-500/10">
                {t.symbol} ({t.count})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Unusual Activity */}
      {stats.unusualActivity.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">UNUSUAL ACTIVITY</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.unusualActivity.slice(0, 8).map((t) => (
              <Badge key={t.symbol} variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                {t.symbol}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConvergencePanel({ signal }: { signal: ConvergenceSignal | null }) {
  if (!signal) return null;

  const isHigh = signal.conviction === 'HIGH';
  const isMedium = signal.conviction === 'MEDIUM';

  return (
    <div className={cn(
      "rounded-lg p-3 border",
      isHigh ? "bg-amber-500/10 border-amber-500/40" :
      isMedium ? "bg-cyan-500/10 border-cyan-500/40" :
      "bg-slate-800/30 border-slate-700/30"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">CONVERGENCE</div>
        <Badge className={cn("text-[10px] border", convictionColor(signal.conviction))}>
          {isHigh && <Flame className="w-3 h-3 mr-1" />}
          {signal.conviction}
        </Badge>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">GEX Regime</span>
          <span className={cn("font-semibold",
            signal.gexRegime === 'NEGATIVE' ? 'text-red-400' :
            signal.gexRegime === 'POSITIVE' ? 'text-emerald-400' : 'text-slate-300'
          )}>
            {signal.gexBias}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Flow Bias</span>
          <span className={cn("font-semibold",
            signal.flowBias === 'BULLISH' ? 'text-emerald-400' :
            signal.flowBias === 'BEARISH' ? 'text-red-400' : 'text-slate-300'
          )}>
            {signal.flowBias}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Anchor</span>
          <span className="text-white font-mono">${signal.gexAnchor}</span>
        </div>
        {signal.gexFlipPoint && (
          <div className="flex justify-between">
            <span className="text-slate-400">Flip</span>
            <span className="text-white font-mono">${signal.gexFlipPoint}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-400">GEX Rating</span>
          <span className="text-amber-400 font-mono">{signal.gexRating}/5</span>
        </div>

        <Separator className="bg-slate-700/50" />

        <p className="text-[11px] text-slate-400 leading-relaxed">{signal.reasoning}</p>

        <div className="bg-slate-900/50 rounded p-2 border border-slate-700/30">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-1">Strategy</div>
          <p className="text-[11px] text-slate-300 leading-relaxed">{signal.strategy}</p>
        </div>

        <Link href={`/gex?symbol=${signal.symbol}`}>
          <Button variant="outline" size="sm" className="w-full text-xs border-slate-700 hover:border-cyan-500/50 hover:text-cyan-400">
            <Crosshair className="w-3 h-3 mr-1.5" />
            View GEX Profile
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function FlowEdge() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialSymbol = params.get('symbol') || '';

  const [symbol, setSymbol] = useState(initialSymbol);
  const [searchInput, setSearchInput] = useState(initialSymbol);
  const [activeFilter, setActiveFilter] = useState<FilterPreset>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Build query params
  const filterParams = FILTER_PRESETS.find(f => f.key === activeFilter)?.params || {};
  const queryParams = {
    ...filterParams,
    ...(symbol ? { symbol: symbol.toUpperCase() } : {}),
    limit: pageSize,
    offset: page * pageSize,
    days: 7,
  };

  const { data, isLoading, refetch } = useOptionsFlow(queryParams);
  const { data: convergenceData } = useConvergence(symbol || undefined);

  const trades = data?.trades || [];
  const stats = data?.stats || null;
  const pagination = data?.pagination || { limit: pageSize, offset: 0, total: 0 };
  const totalPages = Math.ceil(pagination.total / pageSize);

  function handleSearch() {
    const s = searchInput.trim().toUpperCase();
    setSymbol(s);
    setPage(0);
    if (s) {
      window.history.replaceState(null, '', `/flow?symbol=${s}`);
    } else {
      window.history.replaceState(null, '', '/flow');
    }
  }

  function handleSymbolClick(s: string) {
    setSymbol(s);
    setSearchInput(s);
    setPage(0);
    window.history.replaceState(null, '', `/flow?symbol=${s}`);
  }

  function clearSymbol() {
    setSymbol('');
    setSearchInput('');
    setPage(0);
    window.history.replaceState(null, '', '/flow');
  }

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
                Flow Edge
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 animate-pulse">
                  LIVE
                </Badge>
              </h1>
              <p className="text-xs text-slate-500">Institutional options flow • GEX convergence signals</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <Input
                placeholder="Symbol..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-8 h-8 w-32 text-xs bg-slate-800/50 border-slate-700 focus:border-cyan-500/50"
              />
            </div>
            <Button size="sm" variant="outline" onClick={handleSearch} className="h-8 text-xs border-slate-700 hover:border-cyan-500/50">
              Go
            </Button>
            {symbol && (
              <Button size="sm" variant="ghost" onClick={clearSymbol} className="h-8 text-xs text-slate-400">
                Clear
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-8 text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {FILTER_PRESETS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={activeFilter === f.key ? 'default' : 'outline'}
              onClick={() => { setActiveFilter(f.key); setPage(0); }}
              className={cn(
                "h-7 text-xs whitespace-nowrap",
                activeFilter === f.key
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white border-transparent'
                  : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
              )}
            >
              {f.label}
            </Button>
          ))}
          {symbol && (
            <Badge className="ml-2 text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              {symbol}
            </Badge>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left: Trades Table */}
          <div className="lg:col-span-3">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  </div>
                ) : (
                  <FlowTradesTable trades={trades} onSymbolClick={handleSymbolClick} />
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                    <span className="text-xs text-slate-500">
                      {pagination.offset + 1}–{Math.min(pagination.offset + pageSize, pagination.total)} of {pagination.total}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                        className="h-7 w-7 p-0 text-slate-400"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p = page < 3 ? i : page - 2 + i;
                        if (p >= totalPages) return null;
                        return (
                          <Button
                            key={p}
                            size="sm"
                            variant={p === page ? 'default' : 'ghost'}
                            onClick={() => setPage(p)}
                            className={cn("h-7 w-7 p-0 text-xs", p === page ? 'bg-cyan-600' : 'text-slate-400')}
                          >
                            {p + 1}
                          </Button>
                        );
                      })}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage(p => p + 1)}
                        className="h-7 w-7 p-0 text-slate-400"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            {stats && <StatsPanel stats={stats} />}

            {/* Convergence Signal */}
            {symbol && convergenceData?.signal && (
              <ConvergencePanel signal={convergenceData.signal} />
            )}

            {/* No convergence when no symbol */}
            {!symbol && (
              <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30 text-center">
                <Target className="w-5 h-5 text-slate-600 mx-auto mb-2" />
                <p className="text-[11px] text-slate-500">Select a ticker to see GEX convergence signal</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
