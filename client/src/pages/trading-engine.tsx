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
  Target, TrendingUp, TrendingDown, Search, RefreshCw,
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
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-bot-monitor">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" />
          Auto-Lotto Bot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full", status.color)} />
            <span className={cn("font-medium text-sm", status.textColor)}>{status.label}</span>
          </div>
          <Link href="/automations">
            <Button size="sm" variant="outline" className="text-xs h-7">
              Open <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Open</div>
            <div className="text-lg font-mono font-bold">{openPositions}</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Today</div>
            <div className="text-lg font-mono font-bold">{todayTrades}</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">P&L</div>
            <div className={cn("text-lg font-mono font-bold",
              todayPnL >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {todayPnL >= 0 ? '+' : ''}{todayPnL.toFixed(0)}
            </div>
          </div>
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

  const symbols = hotSymbols?.slice(0, 8) || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-hot-symbols">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-orange-400" />
          Hot Symbols (Convergence)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {symbols.map((s) => (
            <button
              key={s.symbol}
              onClick={() => onSelectSymbol(s.symbol)}
              className={cn(
                "flex items-center justify-between p-2 rounded bg-muted/30 hover-elevate text-left",
                s.convergenceLevel >= 2 && "border border-amber-500/30 bg-amber-500/5"
              )}
              data-testid={`hot-symbol-${s.symbol}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm">{s.symbol}</span>
                {s.convergenceLevel >= 2 && (
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/50 px-1">
                    {s.distinctSources}x
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{s.heatScore.toFixed(1)}</span>
            </button>
          ))}
        </div>
        {symbols.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4">
            No hot symbols detected
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-8">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-8">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
          <p className="text-muted-foreground">Failed to analyze {symbol}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getAlignmentColor = (alignment: string) => {
    if (alignment === 'strong') return 'bg-green-500/20 text-green-400 border-green-400/50';
    if (alignment === 'moderate') return 'bg-amber-500/20 text-amber-400 border-amber-400/50';
    if (alignment === 'conflict') return 'bg-red-500/20 text-red-400 border-red-400/50';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      <Card className={data.actionable ? "border-green-500/30" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl font-mono">{data.symbol}</span>
                <Badge variant="outline" className="text-xs">{data.assetClass}</Badge>
                {data.actionable && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    ACTIONABLE
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">{data.summary}</CardDescription>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">Confluence Score</div>
              <Badge className={cn("text-lg px-3 py-1", getAlignmentColor(data.confluence.alignment))}>
                {data.confluence.score}%
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Confluence Checks</h4>
            <ConfluenceChecks checks={data.confluence.checks} />
          </div>
          
          {data.confluence.warnings.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Warnings
              </h4>
              <ul className="text-sm text-amber-300 space-y-1">
                {data.confluence.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FundamentalPanel data={data.fundamental} />
        <TechnicalPanel data={data.technical} />
      </div>

      <TradeStructurePanel data={data.tradeStructure} />
    </div>
  );
}

export default function TradingEnginePage() {
  const [symbol, setSymbol] = useState('SPY');
  const [searchInput, setSearchInput] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('stock');

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
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-cyan-400" />
              Trading Engine
            </h1>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} - Integrated Analysis + Dashboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/trade-desk">
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs" data-testid="link-trade-desk">
                Trade Desk
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-muted-foreground mb-1 block">Symbol</label>
                    <div className="flex gap-2">
                      <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Enter symbol (e.g., AAPL)"
                        className="font-mono"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        data-testid="input-symbol"
                      />
                      <Button onClick={handleSearch} data-testid="button-analyze">
                        <Search className="h-4 w-4 mr-2" />
                        Analyze
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Asset Class</label>
                    <Tabs value={assetClass} onValueChange={(v) => setAssetClass(v as AssetClass)}>
                      <TabsList>
                        <TabsTrigger value="stock" data-testid="tab-stock">Stocks</TabsTrigger>
                        <TabsTrigger value="options" data-testid="tab-options">Options</TabsTrigger>
                        <TabsTrigger value="futures" data-testid="tab-futures">Futures</TabsTrigger>
                        <TabsTrigger value="crypto" data-testid="tab-crypto">Crypto</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </CardContent>
            </Card>

            <AnalysisResults symbol={symbol} assetClass={assetClass} />
          </div>

          <div className="space-y-4">
            <HotSymbolsWidget onSelectSymbol={handleSelectHotSymbol} />
            <BotActivityMonitor />
            <PaperPortfolios />
            <MarketOverviewWidget />
            <WinRateWidget />
            <IVRankWidget />
          </div>
        </div>

        <Card className="bg-muted/30 mt-4">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>
                <strong>Educational purposes only.</strong> This analysis combines fundamental and technical signals 
                to identify confluence. Always validate with your own research and risk management.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
