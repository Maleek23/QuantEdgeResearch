import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { calculatePositionSize, calculateRiskReward, formatCurrency, formatPercent, cn, safeToFixed } from "@/lib/utils";
import { Calculator, TrendingUp, Shield, DollarSign, Zap, Clock, Activity, AlertTriangle, Info } from "lucide-react";

interface ExecutionQualityMetrics {
  fillProbability: number; // 0-100%
  estimatedSlippage: number; // basis points
  liquidityScore: number; // 0-100
  timingQuality: 'optimal' | 'good' | 'fair' | 'poor';
  spreadEstimate: number; // percentage
  recommendation: string;
}

export function RiskCalculator({ symbol = '' }: { symbol?: string }) {
  const [entryPrice, setEntryPrice] = useState<number>(100);
  const [stopLoss, setStopLoss] = useState<number>(95);
  const [targetPrice, setTargetPrice] = useState<number>(110);
  const [capitalAllocated, setCapitalAllocated] = useState<number>(1000);
  const [maxRiskPercent, setMaxRiskPercent] = useState<number>(5);
  const [tickerSymbol, setTickerSymbol] = useState<string>(symbol || 'SPY');

  const [result, setResult] = useState<any>(null);

  // Debounced symbol for API calls (prevent request thrash on every keystroke)
  const [debouncedSymbol, setDebouncedSymbol] = useState<string>(tickerSymbol);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSymbol(tickerSymbol);
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [tickerSymbol]);

  // Fetch execution quality metrics for the symbol
  interface FlowData {
    flowScore: number;
    recentTrades: { size: number; price: number }[];
    sweepOrders: { direction: string }[];
    imbalance?: { bias: string };
  }
  const { data: flowData, isLoading: flowLoading, error: flowError } = useQuery<FlowData>({
    queryKey: ['/api/flow/institutional', debouncedSymbol],
    enabled: debouncedSymbol.length >= 1 && result !== null, // Only fetch when sizing is calculated
    staleTime: 300000,
    refetchInterval: 600000, // Refresh every 10 minutes
    retry: 1,
  });

  // Calculate execution quality metrics from flow data
  const executionMetrics: ExecutionQualityMetrics | null = (() => {
    if (!flowData) return null;
    
    const flowScore = flowData.flowScore || 50;
    const tradeCount = flowData.recentTrades?.length || 0;
    const sweepCount = flowData.sweepOrders?.length || 0;
    
    // Higher flow score = more institutional activity = better fills
    const liquidityScore = Math.min(100, flowScore + (tradeCount * 2) + (sweepCount * 5));
    
    // Estimate slippage based on liquidity (lower liquidity = higher slippage)
    const estimatedSlippage = liquidityScore > 80 ? 2 : liquidityScore > 60 ? 5 : liquidityScore > 40 ? 10 : 20;
    
    // Fill probability based on order size relative to liquidity
    const positionValue = result?.shares ? result.shares * entryPrice : 0;
    const fillProbability = positionValue < 5000 ? 98 : positionValue < 25000 ? 92 : positionValue < 100000 ? 85 : 75;
    
    // Spread estimate based on price level
    const spreadEstimate = entryPrice < 5 ? 0.5 : entryPrice < 50 ? 0.1 : 0.03;
    
    // Timing quality based on market context
    const now = new Date();
    const hour = now.getHours();
    const timingQuality: ExecutionQualityMetrics['timingQuality'] = 
      (hour >= 9 && hour < 11) || (hour >= 14 && hour < 16) ? 'optimal' :
      (hour >= 11 && hour < 14) ? 'good' :
      (hour >= 8 && hour < 9) || (hour >= 16 && hour < 17) ? 'fair' : 'poor';
    
    // Generate recommendation
    const recommendation = liquidityScore > 70 
      ? 'Good liquidity - use market orders for quick fills'
      : liquidityScore > 40 
      ? 'Moderate liquidity - use limit orders within spread'
      : 'Low liquidity - use aggressive limit orders, expect slippage';
    
    return {
      fillProbability,
      estimatedSlippage,
      liquidityScore,
      timingQuality,
      spreadEstimate,
      recommendation,
    };
  })();

  useEffect(() => {
    if (entryPrice > 0 && stopLoss > 0 && targetPrice > 0 && capitalAllocated > 0 && maxRiskPercent > 0) {
      const positionSize = calculatePositionSize(entryPrice, stopLoss, capitalAllocated, maxRiskPercent);
      const riskReward = calculateRiskReward(entryPrice, stopLoss, targetPrice);
      const potentialProfit = positionSize.shares * (targetPrice - entryPrice);
      // Safe percentage calculations to prevent division by zero
      const stopLossPercent = entryPrice > 0 ? ((stopLoss - entryPrice) / entryPrice) * 100 : 0;
      const targetPercent = entryPrice > 0 ? ((targetPrice - entryPrice) / entryPrice) * 100 : 0;

      setResult({
        ...positionSize,
        riskReward,
        potentialProfit,
        stopLossPercent,
        targetPercent,
      });
    }
  }, [entryPrice, stopLoss, targetPrice, capitalAllocated, maxRiskPercent]);

  return (
    <Card data-testid="card-risk-calculator">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          <CardTitle>Position Size Calculator</CardTitle>
        </div>
        <CardDescription>
          Calculate optimal position sizing based on risk parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              type="text"
              value={tickerSymbol}
              onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
              placeholder="SPY, AAPL, TSLA..."
              className="font-mono uppercase"
              data-testid="input-symbol"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="entry-price">Entry Price</Label>
            <Input
              id="entry-price"
              type="number"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-entry-price"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stop-loss">Stop Loss</Label>
            <Input
              id="stop-loss"
              type="number"
              step="0.01"
              value={stopLoss}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-stop-loss"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-price">Target Price</Label>
            <Input
              id="target-price"
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-target-price"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capital">Capital Allocated</Label>
            <Input
              id="capital"
              type="number"
              step="100"
              value={capitalAllocated}
              onChange={(e) => setCapitalAllocated(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-capital"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="max-risk">Max Risk Per Trade (%)</Label>
            <Input
              id="max-risk"
              type="number"
              step="0.1"
              value={maxRiskPercent}
              onChange={(e) => setMaxRiskPercent(parseFloat(e.target.value) || 0)}
              className="font-mono"
              data-testid="input-max-risk"
            />
          </div>
        </div>

        {result && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-card-border">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">Position Size</div>
                    <div className="text-2xl font-bold font-mono" data-testid="text-position-size">
                      {result.shares} shares
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total Cost</div>
                  <div className="text-lg font-semibold font-mono">
                    {formatCurrency(result.shares * entryPrice)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-bearish/10 rounded-lg border border-bearish/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-bearish" />
                    <span className="text-xs text-muted-foreground">Risk Amount</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-bearish" data-testid="text-risk-amount">
                    {formatCurrency(result.riskAmount)}
                  </div>
                  <div className="text-xs font-mono text-bearish mt-0.5">
                    {formatPercent(result.riskPercent)} of capital
                  </div>
                </div>

                <div className="p-3 bg-bullish/10 rounded-lg border border-bullish/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-bullish" />
                    <span className="text-xs text-muted-foreground">Potential Profit</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-bullish" data-testid="text-potential-profit">
                    {formatCurrency(result.potentialProfit)}
                  </div>
                  <div className="text-xs font-mono text-bullish mt-0.5">
                    {formatPercent(result.targetPercent)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Risk/Reward Ratio</span>
                <Badge variant="default" className="text-base font-bold px-3" data-testid="badge-risk-reward">
                  1:{safeToFixed(result.riskReward, 2)}
                </Badge>
              </div>

              {/* Execution Quality Metrics */}
              {executionMetrics && (
                <div className="mt-4 p-4 rounded-lg border bg-card/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-semibold text-cyan-400 uppercase tracking-wide">Execution Quality</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">Execution Quality Analysis</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estimates based on institutional flow, order book depth, and market timing. Higher scores indicate better fill probability.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Fill Probability */}
                    <div className="p-2 rounded bg-muted/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Fill Probability</span>
                        <Badge variant="outline" className={cn(
                          "text-[10px] h-4",
                          executionMetrics.fillProbability >= 90 ? "bg-green-500/10 text-green-400 border-green-500/30" :
                          executionMetrics.fillProbability >= 75 ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                          "bg-red-500/10 text-red-400 border-red-500/30"
                        )}>
                          {executionMetrics.fillProbability}%
                        </Badge>
                      </div>
                      <Progress 
                        value={executionMetrics.fillProbability} 
                        className="h-1.5" 
                        data-testid="progress-fill-probability"
                      />
                    </div>

                    {/* Liquidity Score */}
                    <div className="p-2 rounded bg-muted/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Liquidity</span>
                        <Badge variant="outline" className={cn(
                          "text-[10px] h-4",
                          executionMetrics.liquidityScore >= 70 ? "bg-green-500/10 text-green-400 border-green-500/30" :
                          executionMetrics.liquidityScore >= 40 ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                          "bg-red-500/10 text-red-400 border-red-500/30"
                        )}>
                          {executionMetrics.liquidityScore}
                        </Badge>
                      </div>
                      <Progress 
                        value={executionMetrics.liquidityScore} 
                        className="h-1.5"
                        data-testid="progress-liquidity"
                      />
                    </div>

                    {/* Estimated Slippage */}
                    <div className="p-2 rounded bg-muted/30">
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Est. Slippage</span>
                      </div>
                      <div className={cn(
                        "text-sm font-mono font-semibold mt-1",
                        executionMetrics.estimatedSlippage <= 5 ? "text-green-400" :
                        executionMetrics.estimatedSlippage <= 10 ? "text-amber-400" :
                        "text-red-400"
                      )} data-testid="text-slippage">
                        {executionMetrics.estimatedSlippage} bps
                      </div>
                    </div>

                    {/* Timing Quality */}
                    <div className="p-2 rounded bg-muted/30">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Timing</span>
                      </div>
                      <Badge variant="outline" className={cn(
                        "text-[10px] mt-1",
                        executionMetrics.timingQuality === 'optimal' ? "bg-green-500/10 text-green-400 border-green-500/30" :
                        executionMetrics.timingQuality === 'good' ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                        executionMetrics.timingQuality === 'fair' ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                        "bg-red-500/10 text-red-400 border-red-500/30"
                      )} data-testid="badge-timing">
                        {executionMetrics.timingQuality.charAt(0).toUpperCase() + executionMetrics.timingQuality.slice(1)}
                      </Badge>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="mt-3 p-2 rounded bg-cyan-500/5 border border-cyan-500/20">
                    <div className="flex items-start gap-2">
                      {executionMetrics.liquidityScore < 40 && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      )}
                      <p className="text-xs text-muted-foreground" data-testid="text-execution-recommendation">
                        {executionMetrics.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading state for execution metrics */}
              {flowLoading && (
                <div className="mt-4 p-4 rounded-lg border bg-card/50 animate-pulse">
                  <div className="h-4 bg-muted/50 rounded w-1/3 mb-3" />
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-16 bg-muted/30 rounded" />
                    ))}
                  </div>
                </div>
              )}

              {/* Error state for execution metrics */}
              {flowError && !flowLoading && (
                <div className="mt-4 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-amber-400">Execution metrics unavailable</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Unable to fetch liquidity data for {tickerSymbol}. Default execution parameters will apply.
                  </p>
                </div>
              )}

              {/* Hint when no metrics available and no error */}
              {!executionMetrics && !flowLoading && !flowError && (
                <div className="mt-4 p-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Execution quality metrics will appear after calculating position size
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}