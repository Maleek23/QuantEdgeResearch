/**
 * GEX & Flow
 * ==========
 * Unified gamma + flow intelligence hub with 3 tabs:
 *   - GEX Hub: market-wide gamma command + collapsible heatmap analysis
 *   - Options Flow: institutional flow scanner
 *   - Smart Money: insider/institutional tracking
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, Suspense, lazy } from "react";
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
  Users,
  Loader2,
} from "lucide-react";
import { cn, safeToFixed, formatVolumeCompact } from "@/lib/utils";

// Lazy sub-tabs
const SmartMoneyPage = lazy(() => import("@/pages/smart-money"));
const GEXScanner = lazy(() => import("@/pages/gex-scanner"));

type FlowTab = 'flow' | 'hub' | 'smart-money';

const FLOW_TABS: { key: FlowTab; label: string; icon: any }[] = [
  { key: 'hub', label: 'GEX Hub', icon: Crosshair },
  { key: 'flow', label: 'Options Flow', icon: Activity },
  { key: 'smart-money', label: 'Smart Money', icon: Users },
];

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
  return formatVolumeCompact(val).replace(/^/, '$');
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
  if (c === 'HIGH') return 'text-[var(--trade-neutral)] bg-amber-500/20 border-amber-500/40';
  if (c === 'MEDIUM') return 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40';
  return 'text-muted-foreground bg-muted-foreground/20 border-muted-foreground/40';
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
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Activity className="w-5 h-5 mr-2 opacity-50" />
        Flow scanner idle — waiting for market activity
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table-compact">
        <thead>
          <tr>
            <th>TICKER</th>
            <th>STRIKE</th>
            <th>C/P</th>
            <th>EXP</th>
            <th className="text-right">PRICE</th>
            <th className="text-right">SIZE</th>
            <th className="text-right">VALUE</th>
            <th>TYPE</th>
            <th>TIME</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="py-2 px-2">
                <button
                  onClick={() => onSymbolClick(t.symbol)}
                  className="font-mono font-semibold text-foreground hover:text-cyan-400 transition-colors"
                >
                  {t.symbol}
                </button>
              </td>
              <td className="py-2 px-2 font-mono text-foreground/80">{t.strikePrice}</td>
              <td className="py-2 px-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    t.optionType === 'call'
                      ? 'text-[var(--trade-bullish)] border-emerald-500/40 bg-[var(--trade-bullish)]/10'
                      : 'text-[var(--trade-bearish)] border-red-500/40 bg-[var(--trade-bearish)]/10'
                  )}
                >
                  {t.optionType.toUpperCase()}
                </Badge>
              </td>
              <td className="py-2 px-2 font-mono text-muted-foreground">{formatDate(t.expirationDate)}</td>
              <td className="py-2 px-2 font-mono text-right text-foreground/80">
                ${safeToFixed(t.premium, 2, '--')}
              </td>
              <td className="py-2 px-2 font-mono text-right text-foreground/80">
                {t.volume.toLocaleString()}
              </td>
              <td className="py-2 px-2 font-mono text-right font-semibold">
                <span className={t.totalPremium >= 100000 ? 'text-[var(--trade-neutral)]' : t.totalPremium >= 50000 ? 'text-cyan-400' : 'text-foreground/80'}>
                  {formatPremium(t.totalPremium)}
                </span>
              </td>
              <td className="py-2 px-2">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border">
                  {t.flowType === 'unusual_volume' ? 'unusual' : t.flowType}
                </Badge>
              </td>
              <td className="py-2 px-2 text-muted-foreground font-mono">{formatTime(t.detectedAt)}</td>
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
        <div className="bg-muted/50 rounded-lg p-3 text-center border border-border/50">
          <div className="text-lg font-bold text-foreground">{stats.totalTrades.toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider">Total Trades</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center border border-border/50">
          <div className="text-lg font-bold text-cyan-400">{formatPremium(stats.totalValue)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider">Total Value</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center border border-border/50">
          <div className="text-lg font-bold text-[var(--trade-neutral)]">{stats.peakHour}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider">Peak Hour</div>
        </div>
      </div>

      {/* Call/Put Ratio */}
      <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-2">CALL / PUT RATIO</div>
        <div className="flex items-center gap-1 text-[10px] mb-1">
          <span className="text-[var(--trade-bullish)]">{safeToFixed(callPct, 1)}% Calls</span>
          <span className="flex-1" />
          <span className="text-[var(--trade-bearish)]">{safeToFixed(putPct, 1)}% Puts</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex bg-muted">
          <div className="bg-[var(--trade-bullish)] transition-all" style={{ width: `${callPct}%` }} />
          <div className="bg-[var(--trade-bearish)] transition-all" style={{ width: `${putPct}%` }} />
        </div>
      </div>

      {/* Most Active */}
      {stats.mostActiveTickers.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-2">MOST ACTIVE TICKERS</div>
          <div className="space-y-1.5">
            {stats.mostActiveTickers.slice(0, 5).map((t, i) => (
              <div key={t.symbol} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/70 font-mono w-4">{i + 1}</span>
                  <span className="font-semibold text-foreground">{t.symbol}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{t.count}</span>
                  <span className="text-muted-foreground font-mono w-16 text-right">{formatPremium(t.totalPremium)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Trades by Value */}
      {stats.topTradesByValue.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-2">TOP TRADES BY VALUE</div>
          <div className="space-y-1.5">
            {stats.topTradesByValue.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">{t.symbol}</span>
                <span className="text-[var(--trade-neutral)] font-mono">{formatPremium(t.totalPremium)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Repeat Tickers */}
      {stats.repeatTickers.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-2">REPEAT TICKERS</div>
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
        <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider mb-2">UNUSUAL ACTIVITY</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.unusualActivity.slice(0, 8).map((t) => (
              <Badge key={t.symbol} variant="outline" className="text-[10px] text-[var(--trade-neutral)] border-amber-500/30 bg-amber-500/10">
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
      "bg-muted/30 border-border/30"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide tracking-wider">CONVERGENCE</div>
        <Badge className={cn("text-[10px] border", convictionColor(signal.conviction))}>
          {isHigh && <Flame className="w-3 h-3 mr-1" />}
          {signal.conviction}
        </Badge>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">GEX Regime</span>
          <span className={cn("font-semibold",
            signal.gexRegime === 'NEGATIVE' ? 'text-[var(--trade-bearish)]' :
            signal.gexRegime === 'POSITIVE' ? 'text-[var(--trade-bullish)]' : 'text-foreground/80'
          )}>
            {signal.gexBias}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Flow Bias</span>
          <span className={cn("font-semibold",
            signal.flowBias === 'BULLISH' ? 'text-[var(--trade-bullish)]' :
            signal.flowBias === 'BEARISH' ? 'text-[var(--trade-bearish)]' : 'text-foreground/80'
          )}>
            {signal.flowBias}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Anchor</span>
          <span className="text-foreground font-mono">${signal.gexAnchor}</span>
        </div>
        {signal.gexFlipPoint && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Flip</span>
            <span className="text-foreground font-mono">${signal.gexFlipPoint}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">GEX Rating</span>
          <span className="text-[var(--trade-neutral)] font-mono">{signal.gexRating}/5</span>
        </div>

        <Separator className="bg-muted/50" />

        <p className="text-[11px] text-muted-foreground leading-relaxed">{signal.reasoning}</p>

        <div className="bg-card/50 rounded p-2 border border-border/30">
          <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-1">Strategy</div>
          <p className="text-[11px] text-foreground/80 leading-relaxed">{signal.strategy}</p>
        </div>

        <Link href={`/gex?symbol=${signal.symbol}`}>
          <Button variant="outline" size="sm" className="w-full text-xs border-border hover:border-cyan-500/50 hover:text-cyan-400">
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
  const rawTab = params.get('tab') || 'hub';
  // Map legacy 'gex' tab param to 'hub' (GEX Dashboard merged into Hub)
  const resolvedTab = rawTab === 'gex' ? 'hub' : rawTab;
  const [activeTab, setActiveTab] = useState<FlowTab>(
    FLOW_TABS.some(t => t.key === resolvedTab) ? resolvedTab as FlowTab : 'hub'
  );
  const [symbol, setSymbol] = useState(initialSymbol);
  const [searchInput, setSearchInput] = useState(initialSymbol);
  const [activeFilter, setActiveFilter] = useState<FilterPreset>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  function switchTab(tab: FlowTab) {
    setActiveTab(tab);
    const url = tab === 'hub' ? '/flow' : `/flow?tab=${tab}`;
    window.history.replaceState(null, '', symbol ? `${url}${url.includes('?') ? '&' : '?'}symbol=${symbol}` : url);
  }

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
    <div className="min-h-screen bg-background page-atmosphere text-foreground">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 py-3 space-y-3">

        {/* Header + Tab Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight flex items-center gap-1.5">
                GEX & Flow
              </h1>
              <p className="text-[10px] text-muted-foreground">Gamma exposure · options flow · smart money</p>
            </div>
          </div>

          {/* Search (visible on flow tab) */}
          {activeTab === 'flow' && (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Symbol..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-7 h-7 w-28 text-[10px] font-mono bg-muted/50 border-border focus:border-cyan-500/50"
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleSearch} className="h-7 text-[10px] font-mono border-border hover:border-cyan-500/50 px-2">
                Go
              </Button>
              {symbol && (
                <Button size="sm" variant="ghost" onClick={clearSymbol} className="h-7 text-[10px] text-muted-foreground px-1.5">
                  Clear
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 w-7 text-muted-foreground p-0">
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Main Tab Bar */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          {FLOW_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                size="sm"
                variant="ghost"
                onClick={() => switchTab(tab.key)}
                className={cn(
                  "h-7 text-xs px-3 gap-1.5 rounded-md",
                  isActive
                    ? "bg-cyan-500/15 text-cyan-400 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {/* GEX Hub Tab — confluence scanner + sector pulse + collapsible heatmap */}
        {activeTab === 'hub' && (
          <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>}>
            <GEXScanner />
          </Suspense>
        )}

        {/* Smart Money Tab */}
        {activeTab === 'smart-money' && (
          <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-cyan-400" /></div>}>
            <SmartMoneyPage />
          </Suspense>
        )}

        {/* Options Flow Tab (original content) */}
        {activeTab === 'flow' && <>

        {/* Filter Tabs — tighter */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {FILTER_PRESETS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={activeFilter === f.key ? 'default' : 'outline'}
              onClick={() => { setActiveFilter(f.key); setPage(0); }}
              className={cn(
                "h-6 text-[10px] font-mono whitespace-nowrap px-2",
                activeFilter === f.key
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-foreground border-transparent'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {f.label}
            </Button>
          ))}
          {symbol && (
            <Badge className="ml-1 text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono px-1.5">
              {symbol}
            </Badge>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {/* Left: Trades Table */}
          <div className="lg:col-span-3">
            <Card className="bg-card/50 border-border">
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {pagination.offset + 1}–{Math.min(pagination.offset + pageSize, pagination.total)} of {pagination.total}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                        className="h-7 w-7 p-0 text-muted-foreground"
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
                            className={cn("h-7 w-7 p-0 text-xs", p === page ? 'bg-cyan-600' : 'text-muted-foreground')}
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
                        className="h-7 w-7 p-0 text-muted-foreground"
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
              <div className="bg-muted/30 rounded-lg p-3 border border-border/30 text-center">
                <Target className="w-5 h-5 text-muted-foreground/70 mx-auto mb-2" />
                <p className="text-[11px] text-muted-foreground">Select a ticker to see GEX convergence signal</p>
              </div>
            )}
          </div>
        </div>

        </>}
      </div>
    </div>
  );
}
