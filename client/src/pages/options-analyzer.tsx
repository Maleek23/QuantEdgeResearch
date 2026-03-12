import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn, safeToFixed } from "@/lib/utils";
import { useStockContext } from "@/contexts/stock-context";
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertTriangle,
  Activity,
  BarChart3,
  Clock,
  DollarSign,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  RefreshCw,
  ChevronRight,
  Flame,
  Star,
  CircleDollarSign,
  Layers,
  Calculator,
  Gauge,
  TrendingUpIcon,
  Settings2,
  Plus,
  Minus,
  Info,
  Crosshair,
  Grid3x3,
  Shield,
  Brain
} from "lucide-react";

interface OptionContract {
  symbol: string;
  strike: number;
  optionType: 'call' | 'put';
  expiration: string;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  openInterest: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  inTheMoney: boolean;
}

interface Expiration {
  date: string;
  dte: number;
}

interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  vanna: number;
  volga: number;
  charm: number;
  color: number;
  speed: number;
  zomma: number;
}

interface BlackScholesResult {
  theoreticalPrice: number;
  intrinsicValue: number;
  timeValue: number;
  greeks: Greeks;
  inputs: {
    spotPrice: number;
    strikePrice: number;
    timeToExpiry: number;
    volatility: number;
    optionType: string;
    riskFreeRate: number;
  };
}

interface VolatilitySurface {
  spotPrice: number;
  strikes: number[];
  expiries: number[];
  ivMatrix: number[][];
  timestamp: string;
}

interface SkewMetrics {
  putCallSkew: number;
  atmVolatility: number;
  skewSlope: number;
  termStructureSlope: number;
  butterflySpread: number;
}

interface IVAnalysis {
  currentIV: number;
  ivRank: number;
  ivPercentile: number;
  ivHigh52Week: number;
  ivLow52Week: number;
  ivMean: number;
  ivStdDev: number;
  ivTrend: 'rising' | 'falling' | 'neutral';
  expectedMove: number;
  expectedMovePercent: number;
}

interface StrategyLeg {
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  quantity: number;
  premium: number;
}

interface StrategyPayoff {
  name: string;
  legs: StrategyLeg[];
  maxProfit: number | string;
  maxLoss: number | string;
  breakEvenPoints: number[];
  probabilityOfProfit: number;
  expectedValue: number;
  payoffCurve: Array<{ price: number; pnl: number }>;
  greeksAggregate: Greeks;
}

interface MonteCarloResult {
  theoreticalPrice: number;
  confidence95: [number, number];
  confidence99: [number, number];
  paths: number;
  executionTimeMs: number;
}

interface DeepAnalysis {
  symbol: string;
  optionSymbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  bid: number;
  ask: number;
  midPrice: number;
  lastPrice: number;
  greeks: {
    delta: number;
    deltaInterpretation: string;
    gamma: number;
    gammaRisk: string;
    theta: number;
    thetaImpact: string;
    vega: number;
    vegaExposure: string;
  };
  iv: {
    currentIV: number;
    ivRank: number;
    ivPercentile: number;
    ivTrend: string;
    ivInterpretation: string;
    premiumAssessment: string;
    expectedMove: number;
    expectedMovePercent: number;
  };
  technical: {
    currentPrice: number;
    trend: string;
    trendStrength: number;
    support: number[];
    resistance: number[];
    atr: number;
    atrPercent: number;
    distanceToStrike: number;
    distanceToStrikePercent: number;
    breakEvenPrice: number;
    breakEvenMove: number;
  };
  volume: {
    optionVolume: number;
    openInterest: number;
    volumeOIRatio: number;
    unusualActivity: boolean;
    bidAskSpread: number;
    spreadPercent: number;
    liquidityScore: number;
    liquidityGrade: string;
  };
  probability: {
    probabilityOfProfit: number;
    probabilityITM: number;
    probabilityOTM: number;
    maxProfit: number;
    maxLoss: number;
    riskRewardRatio: number;
    breakEvenPrice: number;
    expectedValue: number;
  };
  scenarios: {
    bullCase: { price: number; pnl: number; pnlPercent: number };
    baseCase: { price: number; pnl: number; pnlPercent: number };
    bearCase: { price: number; pnl: number; pnlPercent: number };
    targetPrices: {
      doubler: number;
      tripler: number;
      fiveBagger: number;
      tenBagger: number;
    };
    priceLadder: Array<{
      price: number;
      priceChange: number;
      priceChangePercent: number;
      optionValue: number;
      pnl: number;
      pnlPercent: number;
      probability: number;
      label: string;
    }>;
    riskMetrics: {
      daysToBurn50Percent: number;
      priceFor50PercentLoss: number;
      safeExitPrice: number;
    };
  };
  overallScore: number;
  overallGrade: string;
  verdict: string;
  keyRisks: string[];
  keyEdges: string[];
  recommendation: string;
}

export default function OptionsAnalyzer() {
  const { toast } = useToast();
  const searchParams = useSearch();
  const { currentStock, setCurrentStock } = useStockContext();

  // Initialize from stock context or URL params
  const initialSymbol = new URLSearchParams(searchParams).get('symbol') || currentStock?.symbol || "";

  const [symbol, setSymbol] = useState(initialSymbol);
  const [searchedSymbol, setSearchedSymbol] = useState(initialSymbol);
  const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'call' | 'put'>('all');
  const [selectedOption, setSelectedOption] = useState<OptionContract | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DeepAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'chain' | 'surface' | 'pricing' | 'strategy' | 'gex'>('chain');

  // Update when stock context changes
  useEffect(() => {
    if (currentStock?.symbol && currentStock.symbol !== searchedSymbol) {
      setSymbol(currentStock.symbol);
      setSearchedSymbol(currentStock.symbol);
    }
  }, [currentStock]);
  
  const [pricingInputs, setPricingInputs] = useState({
    spotPrice: 100,
    strikePrice: 100,
    timeToExpiry: 30,
    volatility: 30,
    optionType: 'call' as 'call' | 'put',
    riskFreeRate: 5
  });
  
  const [strategyLegs, setStrategyLegs] = useState<StrategyLeg[]>([]);

  const handleSearch = () => {
    if (!symbol.trim()) {
      toast({ title: "Enter a ticker symbol", variant: "destructive" });
      return;
    }
    const upperSymbol = symbol.toUpperCase();
    setSearchedSymbol(upperSymbol);
    setSelectedExpiration(null);
    setSelectedOption(null);
    setAnalysisResult(null);

    // Update stock context
    setCurrentStock({ symbol: upperSymbol });
  };

  const { data: expirationsData, isLoading: loadingExpirations, isError: expirationsError } = useQuery<{ symbol: string; expirations: Expiration[] }>({
    queryKey: ['/api/options-analyzer/expirations', searchedSymbol],
    enabled: !!searchedSymbol,
  });

  interface ChainResponse {
    symbol: string;
    stockPrice: number;
    stockChange: number;
    stockChangePercent: number;
    chain: OptionContract[];
  }
  
  const { data: chainData, isLoading: loadingChain, isError: chainError } = useQuery<ChainResponse>({
    queryKey: ['/api/options-analyzer/chain', searchedSymbol, selectedExpiration],
    queryFn: async () => {
      const url = selectedExpiration 
        ? `/api/options-analyzer/chain/${searchedSymbol}?expiration=${selectedExpiration}`
        : `/api/options-analyzer/chain/${searchedSymbol}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    enabled: !!searchedSymbol,
    retry: 1,
  });

  const deepAnalysisMutation = useMutation({
    mutationFn: async (option: OptionContract) => {
      const res = await apiRequest('POST', '/api/options-analyzer/deep-analysis', {
        symbol: searchedSymbol,
        strike: option.strike,
        expiration: option.expiration,
        optionType: option.optionType
      });
      return res.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data.analysis);
      toast({ title: "Analysis Complete", description: `Deep analysis for ${data.analysis.optionSymbol}` });
    },
    onError: () => {
      toast({ title: "Analysis Failed", variant: "destructive" });
    }
  });

  const { data: volSurfaceData, isLoading: loadingVolSurface, isError: volSurfaceError, refetch: refetchVolSurface } = useQuery<{
    symbol: string;
    spotPrice: number;
    surface: VolatilitySurface;
    skew: SkewMetrics;
  }>({
    queryKey: ['/api/options-quant/surface', searchedSymbol],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/options-quant/surface', { symbol: searchedSymbol });
      return res.json();
    },
    enabled: !!searchedSymbol && activeTab === 'surface',
    retry: 1,
  });

  const blackScholesMutation = useMutation({
    mutationFn: async (inputs: typeof pricingInputs) => {
      const res = await apiRequest('POST', '/api/options-quant/price', {
        spotPrice: inputs.spotPrice,
        strikePrice: inputs.strikePrice,
        timeToExpiry: inputs.timeToExpiry / 365,
        volatility: inputs.volatility / 100,
        optionType: inputs.optionType,
        riskFreeRate: inputs.riskFreeRate / 100
      });
      return res.json() as Promise<BlackScholesResult>;
    }
  });

  const monteCarloMutation = useMutation({
    mutationFn: async (inputs: typeof pricingInputs) => {
      const res = await apiRequest('POST', '/api/options-quant/monte-carlo', {
        spotPrice: inputs.spotPrice,
        strikePrice: inputs.strikePrice,
        timeToExpiry: inputs.timeToExpiry / 365,
        volatility: inputs.volatility / 100,
        optionType: inputs.optionType,
        riskFreeRate: inputs.riskFreeRate / 100,
        numPaths: 10000
      });
      return res.json();
    }
  });

  const strategyMutation = useMutation({
    mutationFn: async (params: { legs: StrategyLeg[], spotPrice: number }) => {
      const res = await apiRequest('POST', '/api/options-quant/strategy', {
        legs: params.legs,
        spotPrice: params.spotPrice,
        volatility: 0.3
      });
      return res.json() as Promise<StrategyPayoff>;
    }
  });

  const runPricing = () => {
    blackScholesMutation.mutate(pricingInputs);
    monteCarloMutation.mutate(pricingInputs);
  };

  const addStrategyLeg = (optionType: 'call' | 'put', quantity: number) => {
    if (!chainData?.stockPrice) return;
    const newLeg: StrategyLeg = {
      optionType,
      strike: chainData.stockPrice,
      expiry: selectedExpiration || new Date().toISOString().split('T')[0],
      quantity,
      premium: 1.00
    };
    setStrategyLegs([...strategyLegs, newLeg]);
  };

  const removeStrategyLeg = (index: number) => {
    setStrategyLegs(strategyLegs.filter((_, i) => i !== index));
  };

  const analyzeStrategy = () => {
    if (!chainData?.stockPrice || strategyLegs.length === 0) return;
    strategyMutation.mutate({ legs: strategyLegs, spotPrice: chainData.stockPrice });
  };

  const handleAnalyzeOption = (option: OptionContract) => {
    setSelectedOption(option);
    deepAnalysisMutation.mutate(option);
  };

  const filteredChain = chainData?.chain?.filter((opt: OptionContract) => {
    if (optionTypeFilter === 'all') return true;
    return opt.optionType === optionTypeFilter;
  }) || [];

  const calls = filteredChain.filter((opt: OptionContract) => opt.optionType === 'call');
  const puts = filteredChain.filter((opt: OptionContract) => opt.optionType === 'put');

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'STRONG_BUY': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'BUY': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'HOLD': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'AVOID': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'STRONG_AVOID': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-muted/10 text-muted-foreground';
    }
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-400';
    if (grade.startsWith('B')) return 'text-emerald-400';
    if (grade.startsWith('C')) return 'text-amber-400';
    if (grade.startsWith('D')) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Activity className="h-6 w-6 text-emerald-500" />
              Options Analyzer
            </h1>
            <p className="text-sm text-muted-foreground">Analyze options chains, greeks, and volatility metrics</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="chain" className="flex items-center gap-1" data-testid="tab-chain">
              <Layers className="h-4 w-4" />
              Options Chain
            </TabsTrigger>
            <TabsTrigger value="gex" className="flex items-center gap-1" data-testid="tab-gex">
              <Crosshair className="h-4 w-4" />
              GEX Profile
            </TabsTrigger>
            <TabsTrigger value="surface" className="flex items-center gap-1" data-testid="tab-surface">
              <BarChart3 className="h-4 w-4" />
              Vol Surface
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-1" data-testid="tab-pricing">
              <Calculator className="h-4 w-4" />
              Pricing Lab
            </TabsTrigger>
            <TabsTrigger value="strategy" className="flex items-center gap-1" data-testid="tab-strategy">
              <Settings2 className="h-4 w-4" />
              Strategy Lab
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chain" className="mt-0">

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter ticker symbol (e.g., SPY, AAPL, NVDA)"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                  data-testid="input-symbol"
                />
              </div>
              <Button onClick={handleSearch} disabled={loadingExpirations} data-testid="button-search">
                {loadingExpirations ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
              </Button>
            </div>

            {expirationsData?.expirations && (
              <div className="mt-4 flex flex-wrap gap-2 items-center">
                <span className="text-sm text-muted-foreground">Expirations:</span>
                <ScrollArea className="flex-1">
                  <div className="flex gap-2 pb-2">
                    {(expirationsData.expirations as Expiration[]).slice(0, 12).map((exp) => (
                      <Button
                        key={exp.date}
                        variant={selectedExpiration === exp.date ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedExpiration(exp.date)}
                        className="shrink-0"
                        data-testid={`button-expiration-${exp.date}`}
                      >
                        {exp.date} ({exp.dte}d)
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>

        {searchedSymbol && loadingChain && !chainData && !chainError && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto text-emerald-500 animate-spin mb-4" />
              <p className="text-muted-foreground">Loading options chain for {searchedSymbol}...</p>
            </CardContent>
          </Card>
        )}

        {searchedSymbol && (expirationsError || chainError) && !loadingChain && (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Data Temporarily Unavailable</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Options data for {searchedSymbol} couldn't be loaded. This is usually due to market data provider rate limits.
              </p>
              <Button variant="outline" onClick={() => setSearchedSymbol(searchedSymbol)} data-testid="button-retry">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {searchedSymbol && chainData && chainData.stockPrice && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{searchedSymbol}</CardTitle>
                      <span className="text-2xl font-bold font-mono" data-testid="text-stock-price">
                        ${safeToFixed(chainData.stockPrice, 2)}
                      </span>
                      <Badge variant={chainData.stockChange >= 0 ? "default" : "destructive"} className={cn(
                        "text-xs",
                        chainData.stockChange >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {chainData.stockChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {safeToFixed(chainData.stockChangePercent, 2)}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={optionTypeFilter} onValueChange={(v) => setOptionTypeFilter(v as any)}>
                        <SelectTrigger className="w-[100px]" data-testid="select-option-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="call">Calls</SelectItem>
                          <SelectItem value="put">Puts</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => setSearchedSymbol(searchedSymbol)}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {loadingChain ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Tabs defaultValue="calls" className="w-full">
                      <TabsList className="w-full justify-start px-4 bg-transparent border-b rounded-none">
                        <TabsTrigger value="calls" className="data-[state=active]:bg-green-500/10">
                          <TrendingUp className="h-4 w-4 mr-1 text-green-500" />
                          Calls ({calls.length})
                        </TabsTrigger>
                        <TabsTrigger value="puts" className="data-[state=active]:bg-red-500/10">
                          <TrendingDown className="h-4 w-4 mr-1 text-red-500" />
                          Puts ({puts.length})
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="calls" className="m-0">
                        <OptionsChainTable 
                          options={calls} 
                          stockPrice={chainData.stockPrice}
                          onAnalyze={handleAnalyzeOption}
                          selectedOption={selectedOption}
                          isAnalyzing={deepAnalysisMutation.isPending}
                        />
                      </TabsContent>
                      <TabsContent value="puts" className="m-0">
                        <OptionsChainTable 
                          options={puts} 
                          stockPrice={chainData.stockPrice}
                          onAnalyze={handleAnalyzeOption}
                          selectedOption={selectedOption}
                          isAnalyzing={deepAnalysisMutation.isPending}
                        />
                      </TabsContent>
                    </Tabs>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {analysisResult ? (
                <DeepAnalysisPanel analysis={analysisResult} />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Select an Option</h3>
                    <p className="text-sm text-muted-foreground">
                      Click "Analyze" on any option to see deep analysis including Greeks, IV metrics, price scenarios, and risk/reward scoring.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {!searchedSymbol && (
          <Card>
            <CardContent className="p-12 text-center">
              <Activity className="h-16 w-16 mx-auto text-emerald-500/50 mb-6" />
              <h2 className="text-xl font-semibold mb-3">Enter a Symbol to Start</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Search for any optionable stock to view the options chain, run deep analysis on specific strikes, 
                and see price ladder scenarios with 2x, 3x, 5x, and 10x target prices.
              </p>
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="surface" className="mt-0">
            {volSurfaceError ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Volatility Surface Unavailable</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                    Unable to calculate volatility surface. Try searching for a symbol with active options chains.
                  </p>
                  <Button variant="outline" onClick={() => refetchVolSurface()} data-testid="button-retry-vol">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <VolatilitySurfacePanel
                symbol={searchedSymbol}
                data={volSurfaceData}
                isLoading={loadingVolSurface}
                onRefresh={() => refetchVolSurface()}
              />
            )}
          </TabsContent>

          <TabsContent value="pricing" className="mt-0">
            <PricingLabPanel
              inputs={pricingInputs}
              setInputs={setPricingInputs}
              bsResult={blackScholesMutation.data}
              mcResult={monteCarloMutation.data}
              isLoading={blackScholesMutation.isPending || monteCarloMutation.isPending}
              onCalculate={runPricing}
              stockPrice={chainData?.stockPrice}
            />
          </TabsContent>

          <TabsContent value="gex" className="mt-0">
            <GEXProfilePanel symbol={searchedSymbol} />
          </TabsContent>

          <TabsContent value="strategy" className="mt-0">
            <StrategyLabPanel
              legs={strategyLegs}
              stockPrice={chainData?.stockPrice || 100}
              onAddLeg={addStrategyLeg}
              onRemoveLeg={removeStrategyLeg}
              onUpdateLeg={(idx, leg) => {
                const newLegs = [...strategyLegs];
                newLegs[idx] = leg;
                setStrategyLegs(newLegs);
              }}
              strategyResult={strategyMutation.data}
              isLoading={strategyMutation.isPending}
              onAnalyze={analyzeStrategy}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OptionsChainTable({ 
  options, 
  stockPrice, 
  onAnalyze, 
  selectedOption,
  isAnalyzing
}: { 
  options: OptionContract[];
  stockPrice: number;
  onAnalyze: (opt: OptionContract) => void;
  selectedOption: OptionContract | null;
  isAnalyzing: boolean;
}) {
  if (options.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No options available for this expiration
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b">
          <tr className="text-left text-muted-foreground">
            <th className="p-2">Strike</th>
            <th className="p-2 text-right">Bid</th>
            <th className="p-2 text-right">Ask</th>
            <th className="p-2 text-right">Last</th>
            <th className="p-2 text-right">Vol</th>
            <th className="p-2 text-right">OI</th>
            <th className="p-2 text-right">Delta</th>
            <th className="p-2 text-right">IV</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {options.map((opt, idx) => {
            const isSelected = selectedOption?.symbol === opt.symbol;
            const isITM = opt.inTheMoney;
            const isATM = Math.abs(opt.strike - stockPrice) / stockPrice < 0.02;
            
            return (
              <tr 
                key={opt.symbol || idx}
                className={cn(
                  "border-b border-border/50 hover-elevate cursor-pointer",
                  isSelected && "bg-emerald-500/10",
                  isITM && "bg-muted/30",
                  isATM && "bg-amber-500/5 border-l-2 border-l-amber-500"
                )}
                onClick={() => onAnalyze(opt)}
                data-testid={`row-option-${opt.strike}-${opt.optionType}`}
              >
                <td className="p-2 font-mono font-medium">
                  <div className="flex items-center gap-2">
                    ${safeToFixed(opt.strike, 2)}
                    {isATM && <Badge variant="secondary" className="text-[9px] py-0">ATM</Badge>}
                    {isITM && <Badge variant="secondary" className="text-[9px] py-0 bg-green-500/10 text-green-500">ITM</Badge>}
                  </div>
                </td>
                <td className="p-2 text-right font-mono">${safeToFixed(opt.bid, 2)}</td>
                <td className="p-2 text-right font-mono">${safeToFixed(opt.ask, 2)}</td>
                <td className="p-2 text-right font-mono">${safeToFixed(opt.last, 2)}</td>
                <td className="p-2 text-right font-mono">{opt.volume.toLocaleString()}</td>
                <td className="p-2 text-right font-mono">{opt.openInterest.toLocaleString()}</td>
                <td className="p-2 text-right font-mono">
                  <span className={opt.delta > 0 ? "text-green-500" : "text-red-500"}>
                    {safeToFixed(opt.delta, 2)}
                  </span>
                </td>
                <td className="p-2 text-right font-mono">{safeToFixed(opt.iv, 1)}%</td>
                <td className="p-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    disabled={isAnalyzing && isSelected}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyze(opt);
                    }}
                    data-testid={`button-analyze-${opt.strike}`}
                  >
                    {isAnalyzing && isSelected ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Analyze <ChevronRight className="h-4 w-4 ml-1" /></>
                    )}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}

function DeepAnalysisPanel({ analysis }: { analysis: DeepAnalysis }) {
  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-cyan-500">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-mono">{analysis.optionSymbol}</CardTitle>
              <p className="text-sm text-muted-foreground">
                ${analysis.strike} {analysis.optionType.toUpperCase()} • {analysis.daysToExpiry} DTE
              </p>
            </div>
            <Badge className={cn("text-sm", getVerdictBadgeColor(analysis.verdict))}>
              {analysis.verdict.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className={cn("text-3xl font-bold", getGradeTextColor(analysis.overallGrade))} data-testid="text-overall-grade">
                {analysis.overallGrade}
              </div>
              <p className="text-xs text-muted-foreground">Grade</p>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span>Score</span>
                <span className="font-mono">{analysis.overallScore}/100</span>
              </div>
              <Progress value={analysis.overallScore} className="h-2" />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Mid Price</p>
              <p className="text-lg font-bold font-mono">${safeToFixed(analysis.midPrice, 2)}</p>
              <p className="text-xs text-muted-foreground">${safeToFixed(analysis.midPrice * 100, 0)} / contract</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Break Even</p>
              <p className="text-lg font-bold font-mono">${safeToFixed(analysis.probability.breakEvenPrice, 2)}</p>
              <p className="text-xs text-muted-foreground">
                {analysis.technical.breakEvenMove > 0 ? '+' : ''}{safeToFixed(analysis.technical.breakEvenMove, 1)}% move
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            Greeks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta</span>
                <span className="font-mono">{safeToFixed(analysis.greeks.delta, 3)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.deltaInterpretation}</p>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gamma</span>
                <span className="font-mono">{safeToFixed(analysis.greeks.gamma, 4)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.gammaRisk}</p>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theta</span>
                <span className="font-mono text-red-400">{safeToFixed(analysis.greeks.theta, 3)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.thetaImpact}</p>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vega</span>
                <span className="font-mono">{safeToFixed(analysis.greeks.vega, 3)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.vegaExposure}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-500" />
            IV Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Current IV</span>
            <span className="font-mono font-medium">{safeToFixed(analysis.iv.currentIV, 1)}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">IV Rank</span>
            <div className="flex items-center gap-2">
              <Progress value={analysis.iv.ivRank} className="w-20 h-2" />
              <span className="font-mono">{safeToFixed(analysis.iv.ivRank, 0)}%</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Premium</span>
            <Badge variant="secondary" className={cn(
              "text-xs",
              analysis.iv.premiumAssessment === 'cheap' && "bg-green-500/10 text-green-500",
              analysis.iv.premiumAssessment === 'fair' && "bg-amber-500/10 text-amber-500",
              analysis.iv.premiumAssessment === 'expensive' && "bg-orange-500/10 text-orange-500",
              analysis.iv.premiumAssessment === 'extreme' && "bg-red-500/10 text-red-500",
            )}>
              {analysis.iv.premiumAssessment.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{analysis.iv.ivInterpretation}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-green-500" />
            Price Ladder (Bagger Targets)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">2x (Doubler)</span>
              </div>
              <span className="font-mono font-bold text-green-500" data-testid="text-target-2x">
                ${safeToFixed(analysis.scenarios.targetPrices.doubler, 2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">3x (Tripler)</span>
              </div>
              <span className="font-mono font-bold text-emerald-500" data-testid="text-target-3x">
                ${safeToFixed(analysis.scenarios.targetPrices.tripler, 2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-purple-500/10">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">5x (Five Bagger)</span>
              </div>
              <span className="font-mono font-bold text-purple-500" data-testid="text-target-5x">
                ${safeToFixed(analysis.scenarios.targetPrices.fiveBagger, 2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">10x (Ten Bagger)</span>
              </div>
              <span className="font-mono font-bold text-amber-500" data-testid="text-target-10x">
                ${safeToFixed(analysis.scenarios.targetPrices.tenBagger, 2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-500" />
            Risk Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded bg-green-500/10">
              <p className="text-xs text-muted-foreground">Max Profit</p>
              <p className="font-mono text-green-500">${safeToFixed(analysis.probability.maxProfit, 0)}</p>
            </div>
            <div className="p-2 rounded bg-red-500/10">
              <p className="text-xs text-muted-foreground">Max Loss</p>
              <p className="font-mono text-red-500">${safeToFixed(analysis.probability.maxLoss, 0)}</p>
            </div>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Prob. of Profit</span>
            <span className="font-mono">{safeToFixed(analysis.probability.probabilityOfProfit, 1)}%</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">R:R Ratio</span>
            <span className="font-mono">{safeToFixed(analysis.probability.riskRewardRatio, 2)}:1</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Days to 50% Decay</span>
            <span className="font-mono">{analysis.scenarios.riskMetrics.daysToBurn50Percent}d</span>
          </div>
        </CardContent>
      </Card>

      {(analysis.keyEdges.length > 0 || analysis.keyRisks.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {analysis.keyEdges.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-green-500 mb-2 flex items-center gap-1">
                  <ArrowUpRight className="h-4 w-4" />
                  Edges
                </h4>
                <ul className="text-xs space-y-1">
                  {analysis.keyEdges.map((edge, i) => (
                    <li key={i} className="text-muted-foreground">• {edge}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.keyRisks.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-red-500 mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Risks
                </h4>
                <ul className="text-xs space-y-1">
                  {analysis.keyRisks.map((risk, i) => (
                    <li key={i} className="text-muted-foreground">• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-sm">{analysis.recommendation}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function getVerdictBadgeColor(verdict: string): string {
  switch (verdict) {
    case 'STRONG_BUY': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'BUY': return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'HOLD': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'AVOID': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'STRONG_AVOID': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-muted/10 text-muted-foreground';
  }
}

function getGradeTextColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-green-400';
  if (grade.startsWith('B')) return 'text-emerald-400';
  if (grade.startsWith('C')) return 'text-amber-400';
  if (grade.startsWith('D')) return 'text-orange-400';
  return 'text-red-400';
}

function VolatilitySurfacePanel({
  symbol,
  data,
  isLoading,
  onRefresh
}: {
  symbol: string;
  data?: { symbol: string; spotPrice: number; surface: VolatilitySurface; skew: SkewMetrics };
  isLoading: boolean;
  onRefresh: () => void;
}) {
  if (!symbol) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <BarChart3 className="h-16 w-16 mx-auto text-muted-foreground/50 mb-6" />
          <h2 className="text-xl font-semibold mb-3">Enter a Symbol First</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Search for a symbol in the Options Chain tab to view its volatility surface.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="h-12 w-12 mx-auto text-emerald-500 animate-spin mb-4" />
          <p className="text-muted-foreground">Loading volatility surface for {symbol}...</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <p className="text-muted-foreground">Failed to load volatility surface. Please try again.</p>
          <Button onClick={onRefresh} className="mt-4" data-testid="button-retry-surface">
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { surface, skew, spotPrice } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
                Volatility Surface - {symbol}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={onRefresh} data-testid="button-refresh-surface">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <h4 className="text-sm font-medium mb-3 text-muted-foreground">IV by Strike (Near-Term Expiry)</h4>
                  <div className="h-40 flex items-end justify-around gap-1">
                    {surface.strikes.slice(0, 20).map((strike, idx) => {
                      const iv = surface.ivMatrix[0]?.[idx] || 0;
                      const normalizedIv = Math.min(100, iv * 100);
                      const isAtm = Math.abs(strike - spotPrice) < spotPrice * 0.02;
                      return (
                        <Tooltip key={strike}>
                          <TooltipTrigger asChild>
                            <div 
                              className={cn(
                                "w-full rounded-t transition-all hover:opacity-80",
                                isAtm ? "bg-amber-500" : strike < spotPrice ? "bg-red-500/70" : "bg-green-500/70"
                              )}
                              style={{ height: `${normalizedIv}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-mono text-xs">
                              ${safeToFixed(strike, 0)} | IV: {safeToFixed(iv * 100, 1)}%
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>OTM Puts</span>
                    <span>ATM</span>
                    <span>OTM Calls</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-purple-500" />
              Term Structure
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {surface.expiries.slice(0, 6).map((exp, idx) => {
                const atmIdx = Math.floor(surface.strikes.length / 2);
                const iv = surface.ivMatrix[idx]?.[atmIdx] || 0;
                return (
                  <div key={exp} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">{exp}d</span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-purple-500 rounded-full"
                        style={{ width: `${Math.min(100, iv * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-12 text-right">{safeToFixed(iv * 100, 1)}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Skew Metrics</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ATM Volatility</span>
              <span className="font-mono font-medium">{safeToFixed(skew.atmVolatility * 100, 1)}%</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Put/Call Skew</span>
              <Badge variant={skew.putCallSkew > 0 ? "destructive" : "default"} className="font-mono">
                {skew.putCallSkew > 0 ? '+' : ''}{safeToFixed(skew.putCallSkew, 2)} pts
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Skew Slope</span>
              <span className="font-mono text-sm">{safeToFixed(skew.skewSlope, 3)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Term Slope</span>
              <Badge variant={skew.termStructureSlope > 0 ? "default" : "secondary"} className="font-mono">
                {skew.termStructureSlope > 0 ? '+' : ''}{safeToFixed(skew.termStructureSlope, 2)} pts
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Butterfly</span>
              <span className="font-mono text-sm">{safeToFixed(skew.butterflySpread, 2)} pts</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Interpreting Skew</p>
                <p>Positive put/call skew indicates demand for downside protection (bearish sentiment). Steep term structure suggests near-term uncertainty.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PricingLabPanel({
  inputs,
  setInputs,
  bsResult,
  mcResult,
  isLoading,
  onCalculate,
  stockPrice
}: {
  inputs: { spotPrice: number; strikePrice: number; timeToExpiry: number; volatility: number; optionType: 'call' | 'put'; riskFreeRate: number };
  setInputs: (inputs: any) => void;
  bsResult?: BlackScholesResult;
  mcResult?: { monteCarlo: MonteCarloResult; blackScholes: number; difference: number; differencePercent: number };
  isLoading: boolean;
  onCalculate: () => void;
  stockPrice?: number;
}) {
  const updateInput = (field: string, value: number | string) => {
    setInputs({ ...inputs, [field]: value });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-500" />
            Black-Scholes Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Spot Price ($)</label>
              <Input
                type="number"
                value={inputs.spotPrice}
                onChange={(e) => updateInput('spotPrice', parseFloat(e.target.value) || 0)}
                className="mt-1"
                data-testid="input-spot-price"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Strike Price ($)</label>
              <Input
                type="number"
                value={inputs.strikePrice}
                onChange={(e) => updateInput('strikePrice', parseFloat(e.target.value) || 0)}
                className="mt-1"
                data-testid="input-strike-price"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Days to Expiry</label>
              <Input
                type="number"
                value={inputs.timeToExpiry}
                onChange={(e) => updateInput('timeToExpiry', parseFloat(e.target.value) || 1)}
                className="mt-1"
                data-testid="input-dte"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Volatility (%)</label>
              <Input
                type="number"
                value={inputs.volatility}
                onChange={(e) => updateInput('volatility', parseFloat(e.target.value) || 1)}
                className="mt-1"
                data-testid="input-volatility"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Option Type</label>
              <Select value={inputs.optionType} onValueChange={(v) => updateInput('optionType', v)}>
                <SelectTrigger className="mt-1" data-testid="select-option-type-pricing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="put">Put</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Risk-Free Rate (%)</label>
              <Input
                type="number"
                value={inputs.riskFreeRate}
                onChange={(e) => updateInput('riskFreeRate', parseFloat(e.target.value) || 0)}
                className="mt-1"
                data-testid="input-risk-free"
              />
            </div>
          </div>

          {stockPrice && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setInputs({ ...inputs, spotPrice: stockPrice, strikePrice: stockPrice })}
              data-testid="button-use-current-price"
            >
              Use Current Price (${safeToFixed(stockPrice, 2)})
            </Button>
          )}

          <Button onClick={onCalculate} disabled={isLoading} className="w-full" data-testid="button-calculate-price">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
            Calculate Prices
          </Button>
        </CardContent>
      </Card>

      {bsResult && (
        <div className="space-y-4">
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Theoretical Price</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold font-mono text-emerald-400" data-testid="text-bs-price">
                ${safeToFixed(bsResult.theoreticalPrice, 4)}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Intrinsic</span>
                  <span className="font-mono ml-2">${safeToFixed(bsResult.intrinsicValue, 2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Time Value</span>
                  <span className="font-mono ml-2">${safeToFixed(bsResult.timeValue, 2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                Full Greeks (1st & 2nd Order)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Delta (Δ)</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.delta, 4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Gamma (Γ)</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.gamma, 6)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Theta (Θ)/day</span>
                  <span className="font-mono font-medium text-red-400">{safeToFixed(bsResult.greeks.theta, 4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Vega (ν)/1%</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.vega, 4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Rho (ρ)/1%</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.rho, 4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Vanna</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.vanna, 6)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Volga (Vomma)</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.volga, 6)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Charm</span>
                  <span className="font-mono font-medium">{safeToFixed(bsResult.greeks.charm, 6)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {mcResult && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-amber-500" />
                  Monte Carlo Comparison ({mcResult.monteCarlo.paths.toLocaleString()} paths)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">MC Price</span>
                  <span className="font-mono font-medium">${safeToFixed(mcResult.monteCarlo.theoreticalPrice, 4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">95% CI</span>
                  <span className="font-mono text-xs">
                    [${safeToFixed(mcResult.monteCarlo.confidence95[0], 2)}, ${safeToFixed(mcResult.monteCarlo.confidence95[1], 2)}]
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">BS vs MC Diff</span>
                  <Badge variant="secondary" className="font-mono">
                    {safeToFixed(mcResult.differencePercent, 2)}%
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Execution</span>
                  <span className="font-mono text-xs">{mcResult.monteCarlo.executionTimeMs}ms</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function StrategyLabPanel({
  legs,
  stockPrice,
  onAddLeg,
  onRemoveLeg,
  onUpdateLeg,
  strategyResult,
  isLoading,
  onAnalyze
}: {
  legs: StrategyLeg[];
  stockPrice: number;
  onAddLeg: (optionType: 'call' | 'put', quantity: number) => void;
  onRemoveLeg: (index: number) => void;
  onUpdateLeg: (index: number, leg: StrategyLeg) => void;
  strategyResult?: StrategyPayoff;
  isLoading: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-purple-500" />
            Strategy Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onAddLeg('call', 1)} data-testid="button-add-long-call">
              <Plus className="h-3 w-3 mr-1" /> Long Call
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAddLeg('put', 1)} data-testid="button-add-long-put">
              <Plus className="h-3 w-3 mr-1" /> Long Put
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAddLeg('call', -1)} data-testid="button-add-short-call">
              <Minus className="h-3 w-3 mr-1" /> Short Call
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAddLeg('put', -1)} data-testid="button-add-short-put">
              <Minus className="h-3 w-3 mr-1" /> Short Put
            </Button>
          </div>

          {legs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Settings2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Add option legs to build your strategy</p>
              <p className="text-xs mt-1">Support for spreads, straddles, condors, and more</p>
            </div>
          ) : (
            <div className="space-y-2">
              {legs.map((leg, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Badge variant={leg.quantity > 0 ? "default" : "destructive"} className="shrink-0">
                    {leg.quantity > 0 ? 'LONG' : 'SHORT'}
                  </Badge>
                  <span className="text-sm font-medium capitalize">{leg.optionType}</span>
                  <Input
                    type="number"
                    value={leg.strike}
                    onChange={(e) => onUpdateLeg(idx, { ...leg, strike: parseFloat(e.target.value) || stockPrice })}
                    className="w-20 h-8 text-xs"
                    data-testid={`input-leg-strike-${idx}`}
                  />
                  <span className="text-xs text-muted-foreground">strike</span>
                  <Input
                    type="number"
                    value={leg.premium}
                    onChange={(e) => onUpdateLeg(idx, { ...leg, premium: parseFloat(e.target.value) || 0 })}
                    className="w-16 h-8 text-xs"
                    data-testid={`input-leg-premium-${idx}`}
                  />
                  <span className="text-xs text-muted-foreground">prem</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 w-6 p-0" onClick={() => onRemoveLeg(idx)} data-testid={`button-remove-leg-${idx}`}>
                    <Minus className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {legs.length > 0 && (
            <Button onClick={onAnalyze} disabled={isLoading} className="w-full" data-testid="button-analyze-strategy">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              Analyze Strategy
            </Button>
          )}
        </CardContent>
      </Card>

      {strategyResult && (
        <div className="space-y-4">
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{strategyResult.name}</CardTitle>
                <Badge variant="secondary">{strategyResult.legs.length} legs</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 rounded bg-green-500/10">
                  <p className="text-xs text-muted-foreground">Max Profit</p>
                  <p className="font-mono font-bold text-green-500" data-testid="text-strategy-max-profit">
                    {typeof strategyResult.maxProfit === 'number' ? `$${safeToFixed(strategyResult.maxProfit, 0)}` : strategyResult.maxProfit}
                  </p>
                </div>
                <div className="p-3 rounded bg-red-500/10">
                  <p className="text-xs text-muted-foreground">Max Loss</p>
                  <p className="font-mono font-bold text-red-500" data-testid="text-strategy-max-loss">
                    {typeof strategyResult.maxLoss === 'number' ? `$${safeToFixed(strategyResult.maxLoss, 0)}` : strategyResult.maxLoss}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prob. of Profit</span>
                  <span className="font-mono">{safeToFixed(strategyResult.probabilityOfProfit, 1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected Value</span>
                  <span className="font-mono">${safeToFixed(strategyResult.expectedValue, 2)}</span>
                </div>
                {strategyResult.breakEvenPoints.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Breakeven</span>
                    <span className="font-mono text-xs">
                      {strategyResult.breakEvenPoints.map(b => `$${safeToFixed(b, 2)}`).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Payoff Diagram</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="h-40 flex items-center justify-around gap-0.5">
                {strategyResult.payoffCurve.slice(0, 40).map((point, idx) => {
                  const maxPnl = Math.max(...strategyResult.payoffCurve.map(p => Math.abs(p.pnl)));
                  const normalizedHeight = Math.abs(point.pnl) / (maxPnl || 1) * 70;
                  const isPositive = point.pnl >= 0;
                  return (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <div 
                          className={cn(
                            "w-full transition-all",
                            isPositive ? "bg-green-500" : "bg-red-500",
                            isPositive ? "self-end" : "self-start"
                          )}
                          style={{ 
                            height: `${normalizedHeight}%`,
                            marginTop: isPositive ? 'auto' : 0,
                            marginBottom: isPositive ? 0 : 'auto',
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono text-xs">
                          ${safeToFixed(point.price, 0)} → {point.pnl >= 0 ? '+' : ''}${safeToFixed(point.pnl, 0)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>${safeToFixed(stockPrice * 0.8, 0)}</span>
                <span>${safeToFixed(stockPrice, 0)} (current)</span>
                <span>${safeToFixed(stockPrice * 1.2, 0)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Aggregate Greeks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-center p-2 rounded bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Delta</span>
                  <span className="font-mono">{safeToFixed(strategyResult.greeksAggregate.delta, 3)}</span>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Gamma</span>
                  <span className="font-mono">{safeToFixed(strategyResult.greeksAggregate.gamma, 4)}</span>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Theta</span>
                  <span className="font-mono text-red-400">{safeToFixed(strategyResult.greeksAggregate.theta, 3)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GEX PROFILE PANEL — gexsniper.com-style per-stock gamma analysis
// ═══════════════════════════════════════════════════════════════════════════

interface GEXProfileData {
  symbol: string;
  spotPrice: number;
  expirations: string[];
  strikes: number[];
  heatmap: Record<string, Record<string, number>>;
  flipPoint: number | null;
  maxGammaStrike: number;
  timestamp: string;
}

interface GEXKeyLevels {
  anchor: number;        // Strike with highest absolute GEX (magnetic)
  flip: number | null;   // Where GEX switches sign
  defenseLines: number[]; // Top 3 support/resistance walls
  gexRating: number;     // 1-5 based on GEX concentration
  bias: 'Long Gamma' | 'Short Gamma' | 'Neutral';
  regime: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

function computeKeyLevels(data: GEXProfileData): GEXKeyLevels {
  const { spotPrice, strikes, heatmap, expirations, flipPoint, maxGammaStrike } = data;

  // Aggregate GEX per strike
  const agg = new Map<number, number>();
  for (const strike of strikes) {
    const row = heatmap[String(strike)] || {};
    let total = 0;
    for (const exp of expirations) total += row[exp] || 0;
    agg.set(strike, total);
  }

  // Find max absolute
  let maxAbs = 0;
  for (const v of agg.values()) { if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v); }

  // Anchor = max gamma strike (most magnetic)
  const anchor = maxGammaStrike;

  // Defense lines = top 3 walls by absolute magnitude (excluding anchor)
  const ranked = [...agg.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .filter(([s]) => s !== anchor)
    .slice(0, 3)
    .map(([s]) => s)
    .sort((a, b) => b - a);

  // GEX Rating: 1-5 based on concentration around spot
  const nearSpotGex = strikes
    .filter(s => Math.abs(s - spotPrice) / spotPrice < 0.02)
    .reduce((sum, s) => sum + Math.abs(agg.get(s) || 0), 0);
  const totalGex = [...agg.values()].reduce((sum, v) => sum + Math.abs(v), 0);
  const concentration = totalGex > 0 ? nearSpotGex / totalGex : 0;
  const gexRating = Math.min(5, Math.max(1, Math.round(concentration * 10 + 1)));

  // Bias: Long gamma = above flip, Short gamma = below flip
  const bias: GEXKeyLevels['bias'] = !flipPoint ? 'Neutral'
    : spotPrice > flipPoint ? 'Long Gamma' : 'Short Gamma';

  const regime: GEXKeyLevels['regime'] = !flipPoint ? 'NEUTRAL'
    : spotPrice > flipPoint ? 'POSITIVE' : 'NEGATIVE';

  return { anchor, flip: flipPoint, defenseLines: ranked, gexRating, bias, regime };
}

function formatGexVal(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(val / 1000).toFixed(1)}K`;
  if (abs === 0) return '';
  return String(Math.round(val));
}

function gexColor(val: number, maxAbs: number): string {
  if (val === 0 || maxAbs === 0) return '';
  const intensity = Math.min(1, Math.abs(val) / (maxAbs * 0.6));
  if (val > 0) {
    if (intensity > 0.7) return 'bg-emerald-600/70 text-white';
    if (intensity > 0.4) return 'bg-emerald-500/50 text-emerald-100';
    if (intensity > 0.15) return 'bg-emerald-500/25 text-emerald-200';
    return 'bg-emerald-500/10 text-emerald-300';
  } else {
    if (intensity > 0.7) return 'bg-red-600/70 text-white';
    if (intensity > 0.4) return 'bg-red-500/50 text-red-100';
    if (intensity > 0.15) return 'bg-red-500/25 text-red-200';
    return 'bg-red-500/10 text-red-300';
  }
}

function GEXProfilePanel({ symbol }: { symbol: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<GEXProfileData>({
    queryKey: ['/api/gex-heatmap', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/gex-heatmap/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch GEX profile');
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchInterval: 60_000,
  });

  if (!symbol) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Crosshair className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Search a symbol above to view its GEX profile</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3 h-[500px] bg-muted/30 rounded-lg animate-pulse" />
          <div className="h-[500px] bg-muted/30 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-red-400 mb-2">Failed to load GEX data for {symbol}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  const levels = computeKeyLevels(data);
  const { spotPrice, expirations, strikes, heatmap } = data;

  // Compute max absolute for color scaling
  let maxAbs = 0;
  for (const strike of strikes) {
    const row = heatmap[String(strike)];
    if (!row) continue;
    for (const exp of expirations) {
      const v = Math.abs(row[exp] || 0);
      if (v > maxAbs) maxAbs = v;
    }
  }

  const closestStrike = strikes.reduce((prev, curr) =>
    Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
  , strikes[0]);

  // Aggregate for AI analysis
  const agg = new Map<number, number>();
  for (const strike of strikes) {
    const row = heatmap[String(strike)] || {};
    let total = 0;
    for (const exp of expirations) total += row[exp] || 0;
    agg.set(strike, total);
  }

  // Top support/resistance
  const supportWalls = [...agg.entries()]
    .filter(([s, v]) => v > 0 && s <= spotPrice)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)
    .map(([s]) => s);

  const resistWalls = [...agg.entries()]
    .filter(([s, v]) => v < 0 && s >= spotPrice)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)
    .map(([s]) => s);

  // Generate AI-style outlook
  const outlook = levels.bias === 'Long Gamma'
    ? `Bullish due to strong call gamma at key support levels, indicating potential upward momentum as the price approaches $${levels.anchor}. Currently trading $${safeToFixed(spotPrice, 2)}, holding above the flip which keeps dealers in supportive positioning.`
    : levels.bias === 'Short Gamma'
    ? `Caution — price below gamma flip at $${levels.flip || 'N/A'}. Dealers in negative gamma amplify moves. Expect increased volatility. Key support at ${supportWalls.length > 0 ? '$' + supportWalls[0] : 'N/A'}.`
    : `Neutral gamma regime. Dealers are balanced. Price action likely range-bound between ${supportWalls.length > 0 ? '$' + supportWalls[0] : 'support'} and ${resistWalls.length > 0 ? '$' + resistWalls[0] : 'resistance'}.`;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">{symbol} GEX Profile</h2>
          <Badge variant="outline" className={cn(
            "text-xs font-bold",
            levels.bias === 'Long Gamma' ? "border-emerald-500/30 text-emerald-500" :
            levels.bias === 'Short Gamma' ? "border-red-500/30 text-red-500" :
            "border-yellow-500/30 text-yellow-500"
          )}>
            {levels.bias}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── LEFT: Heatmap Table ── */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Grid3x3 className="h-4 w-4 text-violet-400" /> Heatmap
                </CardTitle>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-emerald-500/60" />
                    <span>Positive (Call γ)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-500/60" />
                    <span>Negative (Put γ)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400" />
                    <span>Spot</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-background">
                      <th className="sticky left-0 z-20 bg-background px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-r border-border w-20">
                        Strike
                      </th>
                      {expirations.map(exp => (
                        <th key={exp} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground min-w-[90px]">
                          {new Date(exp + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strikes.map(strike => {
                      const row = heatmap[String(strike)] || {};
                      const isSpot = strike === closestStrike;
                      const isAnchor = strike === levels.anchor;
                      const isFlip = levels.flip !== null && strike === levels.flip;
                      const isDefense = levels.defenseLines.includes(strike);

                      return (
                        <tr
                          key={strike}
                          className={cn(
                            "border-t border-border/30 transition-colors",
                            isSpot && "ring-1 ring-amber-500/40 bg-amber-500/[0.04]",
                            isAnchor && !isSpot && "ring-1 ring-emerald-500/30",
                            isFlip && !isSpot && !isAnchor && "ring-1 ring-violet-500/30",
                          )}
                        >
                          <td className={cn(
                            "sticky left-0 z-10 px-3 py-1.5 font-mono font-bold text-right border-r border-border/50 whitespace-nowrap",
                            isSpot ? "bg-background text-amber-400" :
                            isAnchor ? "bg-background text-emerald-400" :
                            isFlip ? "bg-background text-violet-400" :
                            isDefense ? "bg-background text-white" :
                            "bg-background text-muted-foreground"
                          )}>
                            <div className="flex items-center justify-end gap-1">
                              {isSpot && <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                              {isAnchor && !isSpot && <Crosshair className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                              {isFlip && !isSpot && !isAnchor && <Zap className="w-3 h-3 text-violet-400 flex-shrink-0" />}
                              ${strike}
                            </div>
                          </td>
                          {expirations.map(exp => {
                            const val = row[exp] || 0;
                            const isExtreme = Math.abs(val) > maxAbs * 0.65;
                            return (
                              <td key={exp} className={cn(
                                "px-2 py-1.5 text-center font-mono tabular-nums whitespace-nowrap",
                                gexColor(val, maxAbs)
                              )}>
                                <div className="flex items-center justify-center gap-0.5">
                                  {isExtreme && val !== 0 && <Zap className="w-3 h-3 flex-shrink-0 opacity-70" />}
                                  {formatGexVal(val)}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Key Levels Sidebar ── */}
        <div className="space-y-4">
          {/* Key Levels Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Key Levels
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Anchor</div>
                  <div className="text-2xl font-mono font-black text-emerald-400">${levels.anchor}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Flip</div>
                  <div className="text-2xl font-mono font-black text-violet-400">
                    {levels.flip ? `$${levels.flip}` : 'N/A'}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-mono font-bold">${safeToFixed(spotPrice, 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GEX Rating</span>
                  <span className="font-mono font-bold text-amber-400">{levels.gexRating}/5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bias</span>
                  <span className={cn(
                    "font-bold",
                    levels.bias === 'Long Gamma' ? "text-emerald-400" :
                    levels.bias === 'Short Gamma' ? "text-red-400" : "text-yellow-400"
                  )}>
                    {levels.bias}
                  </span>
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Defense Lines</div>
                <div className="space-y-1.5">
                  {levels.defenseLines.map((strike, i) => (
                    <div key={strike} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Level {i + 1}</span>
                      <span className="font-mono font-bold">${strike}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5" /> AI Analysis
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">{symbol}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Outlook */}
              <div>
                <div className="text-xs font-bold mb-1">Outlook</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{outlook}</p>
              </div>

              <Separator />

              {/* Levels */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold">Levels</span>
                  <Badge variant={levels.regime === 'POSITIVE' ? 'default' : levels.regime === 'NEGATIVE' ? 'destructive' : 'secondary'} className="text-[9px]">
                    {levels.regime === 'POSITIVE' ? 'Brk ' + levels.anchor : levels.regime === 'NEGATIVE' ? 'Def ' + (levels.flip || '') : 'Range'}
                  </Badge>
                </div>
                <div className="text-xs space-y-1">
                  <div className="text-muted-foreground">
                    Sup: {supportWalls.length > 0 ? supportWalls.join(' / ') : 'N/A'}
                  </div>
                  <div className="text-muted-foreground">
                    Res: {resistWalls.length > 0 ? resistWalls.join(' / ') : 'N/A'}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Strategy */}
              <div>
                <div className="text-xs font-bold mb-1">Strategy</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {levels.bias === 'Long Gamma'
                    ? `Dealers long gamma — sell vol, buy dips toward $${supportWalls[0] || levels.anchor}. Target: $${levels.anchor}. Mean reversion plays favored.`
                    : levels.bias === 'Short Gamma'
                    ? `Dealers short gamma — momentum plays. Ride the trend. Risk defined via defense lines. Key pivot: $${levels.flip || 'N/A'}.`
                    : `Neutral regime. Range plays between support and resistance. Sell premium strategies favored.`
                  }
                </p>
              </div>

              <Separator />

              {/* Risk */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold">Risk</span>
                  <Badge variant={levels.gexRating >= 4 ? 'default' : levels.gexRating >= 2 ? 'secondary' : 'destructive'} className="text-[9px]">
                    {levels.gexRating}/5
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {levels.gexRating >= 4
                    ? 'High GEX concentration near spot. Dealer activity provides strong support/resistance. Lower risk for directional plays.'
                    : levels.gexRating >= 2
                    ? 'Moderate GEX. Some dealer influence but price can break through levels. Use wider stops.'
                    : 'Low GEX concentration. Dealers have minimal influence. Higher volatility and unpredictable price action.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Timestamp */}
      <div className="text-[10px] text-muted-foreground text-right">
        Updated: {new Date(data.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
