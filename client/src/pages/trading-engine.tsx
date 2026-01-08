/**
 * 🎯 Trading Engine Page
 * 
 * Full integrated Fundamental + Technical analysis with:
 * - Symbol analysis with confluence validation
 * - Trade structure generation
 * - Asset class switching (stocks, options, futures, crypto)
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
  BarChart3, Activity, Zap, DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";

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
          <BarChart3 className="h-4 w-4 text-blue-400" />
          Fundamental Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-muted-foreground">Bias</span>
            <div className={cn("text-lg font-bold capitalize", getBiasColor(data.bias))}>
              {data.bias}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Conviction</span>
            <div className="text-lg font-bold">{data.conviction}%</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Horizon</span>
            <div className="text-sm font-medium capitalize">{data.timeHorizon}</div>
          </div>
        </div>

        <div>
          <span className="text-xs text-muted-foreground mb-1 block">Key Drivers</span>
          <div className="flex flex-wrap gap-1">
            {data.drivers.map((d, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{d}</Badge>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-muted-foreground mb-1 block">Catalysts</span>
          <div className="flex flex-wrap gap-1">
            {data.catalysts.map((c, i) => (
              <Badge key={i} variant="outline" className="text-xs text-cyan-400 border-cyan-400/50">{c}</Badge>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-muted-foreground mb-1 block">Risks</span>
          <div className="flex flex-wrap gap-1">
            {data.risks.map((r, i) => (
              <Badge key={i} variant="outline" className="text-xs text-amber-400 border-amber-400/50">{r}</Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TechnicalPanel({ data }: { data: TradingEngineResult['technical'] }) {
  const getTrendIcon = () => {
    if (data.trend.direction === 'up') return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (data.trend.direction === 'down') return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getRsiColor = () => {
    if (data.momentum.condition === 'overbought') return 'text-red-400';
    if (data.momentum.condition === 'oversold') return 'text-green-400';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-400" />
          Technical Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Trend</span>
            <div className="flex items-center gap-1">
              {getTrendIcon()}
              <span className="font-medium capitalize">{data.trend.direction}</span>
            </div>
            <span className="text-xs text-muted-foreground capitalize">({data.trend.strength})</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">RSI (14)</span>
            <div className={cn("text-lg font-bold font-mono", getRsiColor())}>
              {data.momentum.rsi14.toFixed(0)}
            </div>
            <span className="text-xs text-muted-foreground capitalize">{data.momentum.condition}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Volatility</span>
            <div className="text-lg font-bold font-mono">{data.volatility.atrPercent.toFixed(1)}%</div>
            <span className="text-xs text-muted-foreground capitalize">{data.volatility.regime}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">SMA 20</span>
            <div className="font-mono">${data.trend.movingAverages.sma20.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">SMA 50</span>
            <div className="font-mono">${data.trend.movingAverages.sma50.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Current</span>
            <div className="font-mono font-bold">${data.levels.currentPrice.toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-muted-foreground mb-1 block">Support Levels</span>
            <div className="flex flex-wrap gap-1">
              {data.levels.support.slice(0, 3).map((s, i) => (
                <Badge key={i} variant="outline" className="text-xs text-green-400 border-green-400/50 font-mono">
                  ${s.toFixed(2)}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mb-1 block">Resistance Levels</span>
            <div className="flex flex-wrap gap-1">
              {data.levels.resistance.slice(0, 3).map((r, i) => (
                <Badge key={i} variant="outline" className="text-xs text-red-400 border-red-400/50 font-mono">
                  ${r.toFixed(2)}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {data.volatility.compression && (
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-400/50">
            <Zap className="h-3 w-3 mr-1" />
            Volatility Compression Detected
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function TradeStructurePanel({ data }: { data: TradingEngineResult['tradeStructure'] }) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-amber-400" />
            Trade Structure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No actionable trade structure</p>
            <p className="text-xs">Confluence too weak or signals conflicting</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-400" />
          Trade Structure
          <Badge className={cn(
            "ml-auto",
            data.direction === 'long' ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          )}>
            {data.direction.toUpperCase()}
          </Badge>
        </CardTitle>
        <CardDescription>{data.structure}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <span className="text-xs text-muted-foreground block">Entry</span>
            <div className="text-lg font-bold font-mono">${data.entry.price.toFixed(2)}</div>
            <span className="text-xs text-muted-foreground capitalize">{data.entry.type}</span>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10">
            <span className="text-xs text-muted-foreground block">Stop Loss</span>
            <div className="text-lg font-bold font-mono text-red-400">${data.stop.price.toFixed(2)}</div>
            <span className="text-xs text-muted-foreground capitalize">{data.stop.type}</span>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10">
            <span className="text-xs text-muted-foreground block">Target 1</span>
            <div className="text-lg font-bold font-mono text-green-400">${data.targets[0]?.price.toFixed(2)}</div>
            <span className="text-xs text-muted-foreground">{data.targets[0]?.probability}% prob</span>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div>
            <span className="text-xs text-muted-foreground">Risk/Reward</span>
            <div className="text-xl font-bold text-cyan-400">{data.riskReward.toFixed(1)}:1</div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Position Size</span>
            <div className="font-bold">{data.positionSize.shares} shares</div>
            <span className="text-xs text-muted-foreground">${data.positionSize.dollarRisk.toFixed(0)} risk</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>Timeframe:</strong> {data.timeframe}
        </div>
        <div className="text-xs text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <strong>Invalidation:</strong> {data.invalidation}
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisResults({ symbol, assetClass }: { symbol: string; assetClass: AssetClass }) {
  const { data, isLoading, error, refetch } = useQuery<TradingEngineResult>({
    queryKey: ['/api/trading-engine', symbol, assetClass],
    queryFn: async () => {
      const res = await fetch(`/api/trading-engine/${symbol}?asset=${assetClass}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 60 * 1000,
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Target className="h-5 w-5 text-cyan-400" />
              Trading Engine
            </h1>
            <p className="text-xs text-muted-foreground">
              Integrated Fundamental + Technical Analysis
            </p>
          </div>
        </div>

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

        <Card className="bg-muted/30">
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
