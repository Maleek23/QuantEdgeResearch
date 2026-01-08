/**
 * 🎯 Trading Engine Widget
 * 
 * Displays integrated fundamental + technical analysis with:
 * - Confluence validation scores
 * - Trade structure recommendations
 * - Actionable setups
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Target, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle2, XCircle, ArrowRight, Activity, Minus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface TradingEngineResult {
  symbol: string;
  assetClass: string;
  actionable: boolean;
  summary: string;
  confluence: {
    score: number;
    alignment: 'strong' | 'moderate' | 'weak' | 'conflict';
    fundamentalBias: string;
    technicalBias: string;
    isValid: boolean;
  };
  fundamental: {
    bias: string;
    conviction: number;
  };
  tradeStructure: {
    direction: string;
    entry: { price: number };
    stop: { price: number };
    targets: { price: number; probability: number }[];
    riskReward: number;
  } | null;
}

interface ScanResult {
  assetClass: string;
  scanned: number;
  actionable: number;
  results: TradingEngineResult[];
}

const SCAN_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'NVDA'];

function ConfluenceScore({ score, alignment }: { score: number; alignment: string }) {
  const getColor = () => {
    if (alignment === 'strong') return 'text-green-400 bg-green-500/20';
    if (alignment === 'moderate') return 'text-amber-400 bg-amber-500/20';
    if (alignment === 'conflict') return 'text-red-400 bg-red-500/20';
    return 'text-muted-foreground bg-muted';
  };

  const getIcon = () => {
    if (alignment === 'strong') return <CheckCircle2 className="h-3 w-3" />;
    if (alignment === 'conflict') return <XCircle className="h-3 w-3" />;
    return <AlertTriangle className="h-3 w-3" />;
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium", getColor())}>
      {getIcon()}
      <span>{score}%</span>
    </div>
  );
}

function SymbolCard({ result }: { result: TradingEngineResult }) {
  const getBiasIcon = (bias: string) => {
    if (bias === 'bullish') return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (bias === 'bearish') return <TrendingDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const getBiasColor = (bias: string) => {
    if (bias === 'bullish') return 'text-green-400';
    if (bias === 'bearish') return 'text-red-400';
    return 'text-muted-foreground';
  };

  return (
    <div 
      className={cn(
        "p-3 rounded-lg border",
        result.actionable 
          ? "bg-green-500/5 border-green-500/20" 
          : "bg-muted/30 border-border/50"
      )}
      data-testid={`trading-engine-card-${result.symbol}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{result.symbol}</span>
          {result.actionable && (
            <Badge variant="outline" className="text-xs text-green-400 border-green-400/50">
              ACTIONABLE
            </Badge>
          )}
        </div>
        <ConfluenceScore 
          score={result.confluence.score} 
          alignment={result.confluence.alignment} 
        />
      </div>

      <div className="flex items-center gap-4 text-xs mb-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Fund:</span>
          {getBiasIcon(result.fundamental.bias)}
          <span className={getBiasColor(result.fundamental.bias)}>
            {result.fundamental.bias}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Tech:</span>
          {getBiasIcon(result.confluence.technicalBias)}
          <span className={getBiasColor(result.confluence.technicalBias)}>
            {result.confluence.technicalBias}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Conv: </span>
          <span className="font-mono">{result.fundamental.conviction}%</span>
        </div>
      </div>

      {result.tradeStructure && (
        <div className="flex items-center gap-2 text-xs bg-muted/50 rounded p-2 mt-2">
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs",
              result.tradeStructure.direction === 'long' 
                ? "text-green-400 border-green-400/50" 
                : "text-red-400 border-red-400/50"
            )}
          >
            {result.tradeStructure.direction.toUpperCase()}
          </Badge>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Entry:</span>
            <span className="font-mono">${result.tradeStructure.entry.price.toFixed(2)}</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Target:</span>
            <span className="font-mono text-green-400">
              ${result.tradeStructure.targets[0]?.price.toFixed(2)}
            </span>
          </div>
          <Badge variant="secondary" className="text-xs">
            {result.tradeStructure.riskReward.toFixed(1)}:1
          </Badge>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map(i => (
        <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-12" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TradingEngineWidget() {
  const { data, isLoading, error } = useQuery<ScanResult>({
    queryKey: ['/api/trading-engine/scan/stock', { symbols: SCAN_SYMBOLS.join(',') }],
    queryFn: async () => {
      const res = await fetch(`/api/trading-engine/scan/stock?symbols=${SCAN_SYMBOLS.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="widget-trading-engine">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan-400" />
            Trading Engine
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && (
              <Badge 
                variant={data.actionable > 0 ? "default" : "secondary"} 
                className="text-xs"
              >
                {data.actionable} Setups
              </Badge>
            )}
            <Link href="/trading-engine">
              <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid="link-trading-engine">
                <Activity className="h-3 w-3 mr-1" />
                Full Analysis
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Fundamental + Technical confluence analysis
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mx-auto mb-2" />
            Unable to load analysis
          </div>
        ) : data?.results.length ? (
          <div className="space-y-2">
            {data.results.slice(0, 4).map(result => (
              <SymbolCard key={result.symbol} result={result} />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No symbols analyzed
          </div>
        )}

        <div className="border-t border-border/50 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-green-400" />
            <span>
              <strong>Strong confluence</strong> = Fundamental & Technical aligned
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TradingEngineWidget;
