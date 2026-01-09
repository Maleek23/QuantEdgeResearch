/**
 * Trading Engine + Dashboard Hybrid
 * 
 * Combined view with:
 * - Symbol analysis with confluence validation
 * - Dashboard widgets (bot status, portfolios, market overview)
 * - Heat map integration
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Target, TrendingUp, TrendingDown, Search, RefreshCw, Loader2,
  CheckCircle2, XCircle, AlertTriangle, ArrowRight, Minus,
  BarChart3, Activity, Zap, DollarSign, ChevronRight, Flame
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { format } from "date-fns";
import { MarketOverviewWidget } from "@/components/market-overview-widget";
import { WinRateWidget } from "@/components/win-rate-widget";
import { IVRankWidget } from "@/components/iv-rank-widget";

interface TradingEngineResult {
  symbol: string;
  assetClass: string;
  timestamp: string;
  actionable: boolean;
  summary: string;
  confluence: {
    score: number;
    alignment: 'strong' | 'moderate' | 'weak' | 'conflict';
    fundamentalBias: string;
    technicalBias: string;
    isValid: boolean;
    recommendation: string;
    warnings: string[];
    checks: { name: string; passed: boolean; detail: string }[];
  };
  fundamental: {
    asset: string;
    symbol: string;
    bias: string;
    conviction: number;
    drivers: string[];
    catalysts: string[];
    risks: string[];
    timeHorizon: string;
  };
  technical: {
    trend: {
      direction: string;
      strength: string;
      movingAverages: {
        sma20: number;
        sma50: number;
        sma200: number;
      };
    };
    momentum: {
      rsi14: number;
      condition: string;
    };
    volatility: {
      atr14: number;
      atrPercent: number;
      regime: string;
      compression: boolean;
    };
    levels: {
      currentPrice: number;
      support: number[];
      resistance: number[];
      pivotPoint: number;
    };
  };
  tradeStructure: {
    direction: string;
    entry: { price: number; type: string; rationale: string };
    stop: { price: number; type: string; rationale: string };
    targets: { price: number; probability: number; rationale: string }[];
    riskReward: number;
    positionSize: { riskPercent: number; shares: number; dollarRisk: number };
    structure: string;
    timeframe: string;
    invalidation: string;
  } | null;
  volatilityContext: {
    ivRank: number;
    currentIV: number;
    realizedVol20: number;
    recommendation: string;
  } | null;
  marketContext: {
    regime: string;
    riskSentiment: string;
    shouldTrade: boolean;
  };
}

type AssetClass = 'stock' | 'options' | 'futures' | 'crypto';

function BotActivityMonitor() {
  const { data: botStatus } = useQuery<{
    isRunning: boolean;
    openPositions: number;
    todayTrades: number;
    todayPnL: number;
    marketStatus: string;
  }>({
    queryKey: ['/api/auto-lotto/bot-status'],
    refetchInterval: 10000,
  });

  const isMarketOpen = botStatus?.isRunning ?? false;
  const openPositions = botStatus?.openPositions ?? 0;
  const todayTrades = botStatus?.todayTrades ?? 0;
  const todayPnL = botStatus?.todayPnL ?? 0;
  
  const getStatusDisplay = () => {
    if (isMarketOpen) {
      return { label: 'SCANNING', color: 'bg-green-500 animate-pulse', textColor: 'text-green-400' };
    }
    return { label: 'MARKET CLOSED', color: 'bg-amber-500', textColor: 'text-amber-400' };
  };
  
  const status = getStatusDisplay();

  return (
    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-700/60 shadow-2xl overflow-hidden" data-testid="card-bot-monitor">
      <div className="h-1 bg-slate-800">
        <div 
          className={cn("h-full transition-all duration-1000", isMarketOpen ? "bg-cyan-500 w-full animate-pulse" : "bg-slate-700 w-0")} 
        />
      </div>
      <CardHeader className="pb-2 border-b border-slate-800/50 mb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-tighter flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            Autonomous Execution Engine
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px] font-mono", status.textColor, "border-slate-700/60")}>
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-md bg-slate-800/40 border border-slate-700/30">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Active</div>
            <div className="text-2xl font-mono font-bold text-slate-50">{openPositions}</div>
          </div>
          <div className="p-3 rounded-md bg-slate-800/40 border border-slate-700/30">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Volume</div>
            <div className="text-2xl font-mono font-bold text-slate-50">{todayTrades}</div>
          </div>
          <div className="p-3 rounded-md bg-slate-800/40 border border-slate-700/30">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Net P&L</div>
            <div className={cn("text-2xl font-mono font-bold",
              todayPnL >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {todayPnL >= 0 ? '+' : ''}{todayPnL.toFixed(0)}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Link href="/automations" className="flex-1">
            <Button size="sm" variant="outline" className="w-full text-xs h-9 bg-slate-800/50 border-slate-700 hover:bg-slate-700/50 hover:border-cyan-500/40 transition-all">
              Execution Logs <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
          <Button 
            size="sm" 
            variant="outline" 
            className="w-10 h-9 bg-slate-800/50 border-slate-700 hover:border-cyan-500/40"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PaperPortfolios() {
  const { data: portfolios } = useQuery<Array<{
    id: string;
    name: string;
    cashBalance: number;
    startingCapital: number;
    totalValue: number;
    totalPnL: number;
    totalPnLPercent: number;
  }>>({
    queryKey: ['/api/paper-portfolios'],
    refetchInterval: 30000,
  });

  const portfolioList = portfolios || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-paper-portfolios">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Paper Portfolios
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {portfolioList.length > 0 ? portfolioList.map((p) => {
            const totalValue = typeof p.totalValue === 'number' ? p.totalValue : parseFloat(String(p.totalValue)) || 0;
            const starting = typeof p.startingCapital === 'number' ? p.startingCapital : parseFloat(String(p.startingCapital)) || 0;
            const pnlPct = typeof p.totalPnLPercent === 'number' ? p.totalPnLPercent : (starting > 0 ? ((totalValue - starting) / starting) * 100 : 0);
            return (
              <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">${totalValue.toFixed(0)}</span>
                  <Badge variant="outline" className={cn("text-xs",
                    pnlPct >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            );
          }) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No portfolios found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface HotSymbol {
  symbol: string;
  heatScore: number;
  distinctSources: number;
  recentTouches1h: number;
  recentTouches24h: number;
  convergenceLevel: number;
  sources: string[];
}

function HotSymbolsWidget({ onSelectSymbol }: { onSelectSymbol: (symbol: string) => void }) {
  const { data: hotSymbols } = useQuery<HotSymbol[]>({
    queryKey: ['/api/attention/hot-symbols'],
    refetchInterval: 30000,
  });

  const symbols = hotSymbols?.slice(0, 10) || [];

  return (
    <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-700/60 shadow-2xl" data-testid="card-hot-symbols">
      <CardHeader className="pb-2 border-b border-slate-800/50 mb-4">
        <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-tighter flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400 animate-pulse" />
          Attention Convergence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {symbols.map((s) => (
            <button
              key={s.symbol}
              onClick={() => onSelectSymbol(s.symbol)}
              className={cn(
                "flex flex-col gap-1 p-3 rounded-md transition-all duration-200 text-left border border-slate-700/30 bg-slate-800/30 hover:bg-slate-700/40 hover:border-cyan-500/40",
                s.convergenceLevel >= 2 && "border-amber-500/40 bg-amber-500/5"
              )}
              data-testid={`hot-symbol-${s.symbol}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-base text-slate-50 tracking-tight">{s.symbol}</span>
                {s.convergenceLevel >= 2 && (
                  <Badge variant="outline" className="text-[10px] h-4 text-amber-400 border-amber-400/50 px-1 font-mono uppercase">
                    HIGH
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex gap-1">
                  {s.sources.slice(0, 3).map((source, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" title={source} />
                  ))}
                </div>
                <span className="text-[10px] font-mono text-slate-400">{s.heatScore.toFixed(0)}pts</span>
              </div>
            </button>
          ))}
        </div>
        {symbols.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-6 font-mono">
            Scanning for convergence...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfluenceChecks({ checks }: { checks: { name: string; passed: boolean; detail: string }[] }) {
  return (
    <div className="space-y-2">
      {checks.map((check, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          {check.passed ? (
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <div>
            <span className="font-medium">{check.name}:</span>{" "}
            <span className="text-muted-foreground">{check.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function FundamentalPanel({ data }: { data: TradingEngineResult['fundamental'] }) {
  const getBiasColor = (bias: string) => {
    if (bias === 'bullish') return 'text-green-400';
    if (bias === 'bearish') return 'text-red-400';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Fundamental Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Bias</span>
          <Badge variant="outline" className={cn("text-xs", getBiasColor(data.bias))}>
            {data.bias.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Conviction</span>
          <span className="text-sm font-mono">{data.conviction}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Time Horizon</span>
          <span className="text-sm">{data.timeHorizon}</span>
        </div>
        
        {data.drivers.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground">Key Drivers</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {data.drivers.slice(0, 3).map((d, i) => (
                <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TechnicalPanel({ data }: { data: TradingEngineResult['technical'] }) {
  const getTrendIcon = (direction: string) => {
    if (direction === 'up' || direction === 'bullish') return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (direction === 'down' || direction === 'bearish') return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getRSIColor = (rsi: number) => {
    if (rsi >= 70) return 'text-red-400';
    if (rsi <= 30) return 'text-green-400';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          Technical Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Trend</span>
          <div className="flex items-center gap-2">
            {getTrendIcon(data.trend.direction)}
            <span className="text-sm">{data.trend.direction} ({data.trend.strength})</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">RSI(14)</span>
          <span className={cn("text-sm font-mono", getRSIColor(data.momentum.rsi14))}>
            {data.momentum.rsi14.toFixed(1)} ({data.momentum.condition})
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Volatility</span>
          <span className="text-sm">{data.volatility.regime}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Current Price</span>
          <span className="text-sm font-mono">${data.levels.currentPrice.toFixed(2)}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-green-500/10">
            <div className="text-muted-foreground">Support</div>
            <div className="font-mono">${data.levels.support[0]?.toFixed(2) || 'N/A'}</div>
          </div>
          <div className="p-2 rounded bg-red-500/10">
            <div className="text-muted-foreground">Resistance</div>
            <div className="font-mono">${data.levels.resistance[0]?.toFixed(2) || 'N/A'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TradeStructurePanel({ data }: { data: TradingEngineResult['tradeStructure'] }) {
  if (!data) return null;

  return (
    <Card className="border-cyan-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-cyan-400" />
          Trade Structure
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-3 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">Direction</div>
            <div className={cn("font-bold text-lg",
              data.direction === 'long' ? 'text-green-400' : 'text-red-400'
            )}>
              {data.direction.toUpperCase()}
            </div>
          </div>
          <div className="p-3 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">Entry</div>
            <div className="font-mono font-bold text-lg">${data.entry.price.toFixed(2)}</div>
          </div>
          <div className="p-3 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">Stop</div>
            <div className="font-mono font-bold text-lg text-red-400">${data.stop.price.toFixed(2)}</div>
          </div>
          <div className="p-3 rounded bg-muted/30">
            <div className="text-xs text-muted-foreground">R:R</div>
            <div className="font-mono font-bold text-lg text-cyan-400">{data.riskReward.toFixed(1)}:1</div>
          </div>
        </div>
        
        <div className="mt-4">
          <div className="text-xs text-muted-foreground mb-2">Targets</div>
          <div className="flex flex-wrap gap-2">
            {data.targets.map((t, i) => (
              <Badge key={i} variant="outline" className="text-green-400 border-green-400/50">
                T{i + 1}: ${t.price.toFixed(2)} ({t.probability}%)
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisResults({ symbol, assetClass }: { symbol: string; assetClass: AssetClass }) {
  const { data, isLoading, error, refetch } = useQuery<TradingEngineResult>({
    queryKey: ['/api/trading-engine/analyze', symbol, assetClass],
    enabled: !!symbol,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-md h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500/50" />
        </Card>
        <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-md h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-500/50" />
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-slate-900/80 border-red-500/30 backdrop-blur-xl">
        <CardContent className="py-16 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400 animate-pulse" />
          <h3 className="text-xl font-bold text-slate-50 mb-2">Engine Execution Fault</h3>
          <p className="text-slate-400 font-mono text-sm max-w-md mx-auto">
            The quantitative engine failed to synthesize data for {symbol}. 
            Check API connectivity and market data availability.
          </p>
          <Button variant="outline" size="sm" className="mt-8 border-slate-700 hover:border-cyan-500/50 bg-slate-800/50" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            RESET ENGINE
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getAlignmentColor = (alignment: string) => {
    if (alignment === 'strong') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (alignment === 'moderate') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (alignment === 'conflict') return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-slate-800 text-slate-400';
  };

  return (
    <div className="space-y-6">
      <Card className={cn(
        "bg-slate-900/80 backdrop-blur-2xl border-slate-700/60 shadow-2xl overflow-hidden transition-all duration-500",
        data.actionable ? "ring-1 ring-green-500/20 shadow-green-500/5" : ""
      )}>
        <div className={cn("h-1", data.actionable ? "bg-green-500" : "bg-slate-700")}></div>
        <CardHeader className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-4xl font-bold font-mono tracking-tighter text-slate-50">{data.symbol}</h2>
                <Badge variant="outline" className="text-[10px] font-mono border-slate-700 text-slate-400 uppercase">{data.assetClass}</Badge>
                {data.actionable && (
                  <Badge className="bg-green-500 text-slate-950 font-bold px-2 py-0.5 animate-pulse">
                    READY
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-400 max-w-2xl leading-relaxed mt-2">{data.summary}</p>
            </div>
            <div className="flex items-center gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/30 backdrop-blur-md">
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Confluence Score</div>
                <div className={cn("text-3xl font-bold font-mono tabular-nums", 
                  data.confluence.score >= 80 ? "text-green-400" : 
                  data.confluence.score >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {data.confluence.score}%
                </div>
              </div>
              <div className={cn("w-12 h-12 rounded-full border-2 flex items-center justify-center", 
                getAlignmentColor(data.confluence.alignment).split(' ')[2]
              )}>
                <Zap className={cn("h-6 w-6", getAlignmentColor(data.confluence.alignment).split(' ')[1])} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-cyan-500" />
                Execution Checkmarks
              </h4>
              <div className="space-y-3 bg-slate-800/30 p-4 rounded-lg border border-slate-700/20">
                {data.confluence.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className={cn(
                      "mt-1 p-0.5 rounded-full transition-colors",
                      check.passed ? "bg-green-500/20" : "bg-red-500/20"
                    )}>
                      {check.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] font-bold text-slate-300 uppercase tracking-tight">{check.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {data.confluence.warnings.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  Risk Mitigation Advisories
                </h4>
                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg space-y-2">
                  {data.confluence.warnings.map((w, i) => (
                    <div key={i} className="flex gap-2 text-xs text-amber-200/70 leading-snug">
                      <span className="text-amber-500">•</span>
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FundamentalPanel data={data.fundamental} />
        <TechnicalPanel data={data.technical} />
      </div>

      {data.tradeStructure && <TradeStructurePanel data={data.tradeStructure} />}
    </div>
  );
}

export default function TradingEnginePage() {
  const [symbol, setSymbol] = useState('SPY');
  const [searchInput, setSearchInput] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('stock');

  const { data: marketContext } = useQuery<{ marketStatus: string; regime: string; vixLevel: number }>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const handleSearch = () => {
    if (searchInput.trim()) {
      setSymbol(searchInput.trim().toUpperCase());
    }
  };

  const handleSelectHotSymbol = (sym: string) => {
    setSymbol(sym);
    setSearchInput(sym);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-[1600px] mx-auto p-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 p-6 bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-xl shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <Target className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-50 flex items-center gap-2">
                Command Center
                <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/30 text-cyan-400 px-1.5 h-4">HYBRID ENGINE</Badge>
              </h1>
              <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mt-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')} • {marketContext?.marketStatus === 'open' ? '🟢 SESSION ACTIVE' : '🔴 SESSION CLOSED'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end px-4 border-r border-slate-800">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Engine Latency</span>
              <span className="text-sm font-mono text-green-400">14ms</span>
            </div>
            <Link href="/trade-desk">
              <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 h-10 shadow-lg shadow-cyan-500/10" data-testid="link-trade-desk">
                Trade Desk
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <Card className="bg-slate-900/70 backdrop-blur-xl border-slate-700/60 shadow-2xl overflow-hidden">
              <div className="bg-slate-800/40 border-b border-slate-700/40 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 rounded border border-slate-700/50">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Symbol Analysis</h3>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-slate-700 text-[10px]">NQ1!</Badge>
                  <Badge variant="secondary" className="bg-slate-800 text-slate-400 border-slate-700 text-[10px]">ES1!</Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex flex-wrap gap-4 items-end mb-6">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex justify-between mb-1.5 px-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ticker Entry</label>
                      <span className="text-[10px] text-cyan-500 font-mono">Real-time data enabled</span>
                    </div>
                    <div className="relative group">
                      <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="ENTER SYMBOL (E.G. NVDA, QQQ, BTC)"
                        className="h-12 bg-slate-800/50 border-slate-700 text-slate-50 font-mono tracking-widest placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-cyan-500/10 transition-all pl-10"
                        data-testid="input-symbol"
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                    </div>
                  </div>
                  <div className="w-[180px]">
                    <div className="mb-1.5 px-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Asset Class</label>
                    </div>
                    <Tabs value={assetClass} onValueChange={(v) => setAssetClass(v as AssetClass)} className="w-full">
                      <TabsList className="grid grid-cols-2 h-12 bg-slate-800/50 border border-slate-700 p-1">
                        <TabsTrigger value="stock" className="text-[10px] font-bold uppercase data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400" data-testid="tab-stock">Stock</TabsTrigger>
                        <TabsTrigger value="options" className="text-[10px] font-bold uppercase data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400" data-testid="tab-options">Opt</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <Button 
                    onClick={handleSearch}
                    disabled={!searchInput.trim()}
                    className="h-12 px-8 bg-slate-800 border border-slate-700 text-cyan-400 hover:bg-slate-700 hover:text-cyan-300 font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    data-testid="button-analyze"
                  >
                    Run Scan
                  </Button>
                </div>

                <div className="space-y-6">
                  <AnalysisResults symbol={symbol} assetClass={assetClass} />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MarketOverviewWidget />
              <WinRateWidget />
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <BotActivityMonitor />
            <HotSymbolsWidget onSelectSymbol={handleSelectHotSymbol} />
            <PaperPortfolios />
            <IVRankWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
