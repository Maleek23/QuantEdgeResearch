import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
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
  Shield,
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
  GraduationCap
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
  const [symbol, setSymbol] = useState("");
  const [searchedSymbol, setSearchedSymbol] = useState("");
  const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
  const [optionTypeFilter, setOptionTypeFilter] = useState<'all' | 'call' | 'put'>('all');
  const [selectedOption, setSelectedOption] = useState<OptionContract | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DeepAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'chain' | 'surface' | 'pricing' | 'strategy'>('chain');
  
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
    setSearchedSymbol(symbol.toUpperCase());
    setSelectedExpiration(null);
    setSelectedOption(null);
    setAnalysisResult(null);
  };

  const { data: expirationsData, isLoading: loadingExpirations } = useQuery<{ symbol: string; expirations: Expiration[] }>({
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
  
  const { data: chainData, isLoading: loadingChain } = useQuery<ChainResponse>({
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

  const { data: volSurfaceData, isLoading: loadingVolSurface, refetch: refetchVolSurface } = useQuery<{
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
    if (grade.startsWith('B')) return 'text-cyan-400';
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
              <Activity className="h-6 w-6 text-cyan-500" />
              Options Analyzer
              <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-400">
                <GraduationCap className="h-3 w-3 mr-1" />
                PhD Quant
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">Institutional-grade options analytics with Greeks, IV surfaces, and strategy simulation</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Shield className="h-3 w-3 mr-1" />
            Research Tool
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="chain" className="flex items-center gap-1" data-testid="tab-chain">
              <Layers className="h-4 w-4" />
              Options Chain
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

        {searchedSymbol && loadingChain && !chainData && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto text-cyan-500 animate-spin mb-4" />
              <p className="text-muted-foreground">Loading options chain for {searchedSymbol}...</p>
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
                        ${chainData.stockPrice?.toFixed(2)}
                      </span>
                      <Badge variant={chainData.stockChange >= 0 ? "default" : "destructive"} className={cn(
                        "text-xs",
                        chainData.stockChange >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {chainData.stockChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {chainData.stockChangePercent?.toFixed(2)}%
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
              <Activity className="h-16 w-16 mx-auto text-cyan-500/50 mb-6" />
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
            <VolatilitySurfacePanel
              symbol={searchedSymbol}
              data={volSurfaceData}
              isLoading={loadingVolSurface}
              onRefresh={() => refetchVolSurface()}
            />
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
                  isSelected && "bg-cyan-500/10",
                  isITM && "bg-muted/30",
                  isATM && "bg-amber-500/5 border-l-2 border-l-amber-500"
                )}
                onClick={() => onAnalyze(opt)}
                data-testid={`row-option-${opt.strike}-${opt.optionType}`}
              >
                <td className="p-2 font-mono font-medium">
                  <div className="flex items-center gap-2">
                    ${opt.strike.toFixed(2)}
                    {isATM && <Badge variant="secondary" className="text-[9px] py-0">ATM</Badge>}
                    {isITM && <Badge variant="secondary" className="text-[9px] py-0 bg-green-500/10 text-green-500">ITM</Badge>}
                  </div>
                </td>
                <td className="p-2 text-right font-mono">${opt.bid.toFixed(2)}</td>
                <td className="p-2 text-right font-mono">${opt.ask.toFixed(2)}</td>
                <td className="p-2 text-right font-mono">${opt.last.toFixed(2)}</td>
                <td className="p-2 text-right font-mono">{opt.volume.toLocaleString()}</td>
                <td className="p-2 text-right font-mono">{opt.openInterest.toLocaleString()}</td>
                <td className="p-2 text-right font-mono">
                  <span className={opt.delta > 0 ? "text-green-500" : "text-red-500"}>
                    {opt.delta.toFixed(2)}
                  </span>
                </td>
                <td className="p-2 text-right font-mono">{opt.iv.toFixed(1)}%</td>
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
              <p className="text-lg font-bold font-mono">${analysis.midPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">${(analysis.midPrice * 100).toFixed(0)} / contract</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Break Even</p>
              <p className="text-lg font-bold font-mono">${analysis.probability.breakEvenPrice.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                {analysis.technical.breakEvenMove > 0 ? '+' : ''}{analysis.technical.breakEvenMove.toFixed(1)}% move
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-500" />
            Greeks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delta</span>
                <span className="font-mono">{analysis.greeks.delta.toFixed(3)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.deltaInterpretation}</p>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gamma</span>
                <span className="font-mono">{analysis.greeks.gamma.toFixed(4)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.gammaRisk}</p>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Theta</span>
                <span className="font-mono text-red-400">{analysis.greeks.theta.toFixed(3)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{analysis.greeks.thetaImpact}</p>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vega</span>
                <span className="font-mono">{analysis.greeks.vega.toFixed(3)}</span>
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
            <span className="font-mono font-medium">{analysis.iv.currentIV.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">IV Rank</span>
            <div className="flex items-center gap-2">
              <Progress value={analysis.iv.ivRank} className="w-20 h-2" />
              <span className="font-mono">{analysis.iv.ivRank.toFixed(0)}%</span>
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
                ${analysis.scenarios.targetPrices.doubler.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-cyan-500/10">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-cyan-500" />
                <span className="text-sm font-medium">3x (Tripler)</span>
              </div>
              <span className="font-mono font-bold text-cyan-500" data-testid="text-target-3x">
                ${analysis.scenarios.targetPrices.tripler.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-purple-500/10">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">5x (Five Bagger)</span>
              </div>
              <span className="font-mono font-bold text-purple-500" data-testid="text-target-5x">
                ${analysis.scenarios.targetPrices.fiveBagger.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">10x (Ten Bagger)</span>
              </div>
              <span className="font-mono font-bold text-amber-500" data-testid="text-target-10x">
                ${analysis.scenarios.targetPrices.tenBagger.toFixed(2)}
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
              <p className="font-mono text-green-500">${analysis.probability.maxProfit.toFixed(0)}</p>
            </div>
            <div className="p-2 rounded bg-red-500/10">
              <p className="text-xs text-muted-foreground">Max Loss</p>
              <p className="font-mono text-red-500">${analysis.probability.maxLoss.toFixed(0)}</p>
            </div>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Prob. of Profit</span>
            <span className="font-mono">{analysis.probability.probabilityOfProfit.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">R:R Ratio</span>
            <span className="font-mono">{analysis.probability.riskRewardRatio.toFixed(2)}:1</span>
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
  if (grade.startsWith('B')) return 'text-cyan-400';
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
          <Loader2 className="h-12 w-12 mx-auto text-cyan-500 animate-spin mb-4" />
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
                <BarChart3 className="h-5 w-5 text-cyan-500" />
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
                              ${strike.toFixed(0)} | IV: {(iv * 100).toFixed(1)}%
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
                        className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full"
                        style={{ width: `${Math.min(100, iv * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-12 text-right">{(iv * 100).toFixed(1)}%</span>
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
              <span className="font-mono font-medium">{(skew.atmVolatility * 100).toFixed(1)}%</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Put/Call Skew</span>
              <Badge variant={skew.putCallSkew > 0 ? "destructive" : "default"} className="font-mono">
                {skew.putCallSkew > 0 ? '+' : ''}{skew.putCallSkew.toFixed(2)} pts
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Skew Slope</span>
              <span className="font-mono text-sm">{skew.skewSlope.toFixed(3)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Term Slope</span>
              <Badge variant={skew.termStructureSlope > 0 ? "default" : "secondary"} className="font-mono">
                {skew.termStructureSlope > 0 ? '+' : ''}{skew.termStructureSlope.toFixed(2)} pts
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Butterfly</span>
              <span className="font-mono text-sm">{skew.butterflySpread.toFixed(2)} pts</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
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
            <Calculator className="h-5 w-5 text-cyan-500" />
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
              Use Current Price (${stockPrice.toFixed(2)})
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
              <div className="text-3xl font-bold font-mono text-cyan-400" data-testid="text-bs-price">
                ${bsResult.theoreticalPrice.toFixed(4)}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Intrinsic</span>
                  <span className="font-mono ml-2">${bsResult.intrinsicValue.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Time Value</span>
                  <span className="font-mono ml-2">${bsResult.timeValue.toFixed(2)}</span>
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
                  <span className="font-mono font-medium">{bsResult.greeks.delta.toFixed(4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Gamma (Γ)</span>
                  <span className="font-mono font-medium">{bsResult.greeks.gamma.toFixed(6)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Theta (Θ)/day</span>
                  <span className="font-mono font-medium text-red-400">{bsResult.greeks.theta.toFixed(4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Vega (ν)/1%</span>
                  <span className="font-mono font-medium">{bsResult.greeks.vega.toFixed(4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Rho (ρ)/1%</span>
                  <span className="font-mono font-medium">{bsResult.greeks.rho.toFixed(4)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Vanna</span>
                  <span className="font-mono font-medium">{bsResult.greeks.vanna.toFixed(6)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Volga (Vomma)</span>
                  <span className="font-mono font-medium">{bsResult.greeks.volga.toFixed(6)}</span>
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <span className="text-muted-foreground block text-xs">Charm</span>
                  <span className="font-mono font-medium">{bsResult.greeks.charm.toFixed(6)}</span>
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
                  <span className="font-mono font-medium">${mcResult.monteCarlo.theoreticalPrice.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">95% CI</span>
                  <span className="font-mono text-xs">
                    [${mcResult.monteCarlo.confidence95[0].toFixed(2)}, ${mcResult.monteCarlo.confidence95[1].toFixed(2)}]
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">BS vs MC Diff</span>
                  <Badge variant="secondary" className="font-mono">
                    {mcResult.differencePercent.toFixed(2)}%
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
                    {typeof strategyResult.maxProfit === 'number' ? `$${strategyResult.maxProfit.toFixed(0)}` : strategyResult.maxProfit}
                  </p>
                </div>
                <div className="p-3 rounded bg-red-500/10">
                  <p className="text-xs text-muted-foreground">Max Loss</p>
                  <p className="font-mono font-bold text-red-500" data-testid="text-strategy-max-loss">
                    {typeof strategyResult.maxLoss === 'number' ? `$${strategyResult.maxLoss.toFixed(0)}` : strategyResult.maxLoss}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prob. of Profit</span>
                  <span className="font-mono">{strategyResult.probabilityOfProfit.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected Value</span>
                  <span className="font-mono">${strategyResult.expectedValue.toFixed(2)}</span>
                </div>
                {strategyResult.breakEvenPoints.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Breakeven</span>
                    <span className="font-mono text-xs">
                      {strategyResult.breakEvenPoints.map(b => `$${b.toFixed(2)}`).join(', ')}
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
                          ${point.price.toFixed(0)} → {point.pnl >= 0 ? '+' : ''}${point.pnl.toFixed(0)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>${(stockPrice * 0.8).toFixed(0)}</span>
                <span>${stockPrice.toFixed(0)} (current)</span>
                <span>${(stockPrice * 1.2).toFixed(0)}</span>
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
                  <span className="font-mono">{strategyResult.greeksAggregate.delta.toFixed(3)}</span>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Gamma</span>
                  <span className="font-mono">{strategyResult.greeksAggregate.gamma.toFixed(4)}</span>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Theta</span>
                  <span className="font-mono text-red-400">{strategyResult.greeksAggregate.theta.toFixed(3)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
