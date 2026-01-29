/**
 * Should I Buy? Analysis Component
 *
 * Provides a comprehensive buy/hold/sell recommendation with:
 * - AI confidence score
 * - Bull case summary
 * - Bear case summary
 * - Entry/exit suggestions
 * - Risk assessment
 *
 * Uses the existing 6-engine analysis system.
 *
 * Used in: Stock Detail page, Trade Desk
 */

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Minus,
  ChevronRight,
  Zap,
  ArrowRight,
  DollarSign,
  Scale,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EngineResult {
  engine: string;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  signals: string[];
  weight: number;
}

interface ShouldBuyAnalysis {
  symbol: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  engines: {
    ml: EngineResult;
    technical: EngineResult;
    quant: EngineResult;
    flow: EngineResult;
    sentiment: EngineResult;
    pattern: EngineResult;
  };
  overallDirection: "bullish" | "bearish" | "neutral";
  overallConfidence: number;
  overallGrade: string;
  tradeIdea: {
    direction: string;
    entry: number;
    target: number;
    stopLoss: number;
    riskReward: string;
    conviction: string;
  };
  analysisTimestamp: string;
}

function useShouldBuyAnalysis(symbol: string) {
  return useQuery<ShouldBuyAnalysis>({
    queryKey: ["/api/analyze-symbol", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/analyze-symbol/${symbol}`);
      if (!res.ok) throw new Error("Failed to analyze symbol");
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 60 * 1000, // Fresh for 1 minute
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
}

interface ShouldIBuyProps {
  symbol: string;
  compact?: boolean;
  className?: string;
  onViewFullAnalysis?: () => void;
}

export function ShouldIBuy({
  symbol,
  compact = false,
  className,
  onViewFullAnalysis,
}: ShouldIBuyProps) {
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useShouldBuyAnalysis(symbol);

  const handleViewFullAnalysis = () => {
    if (onViewFullAnalysis) {
      onViewFullAnalysis();
    } else {
      setLocation(`/stock/${symbol}`);
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Should I Buy {symbol}?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Should I Buy {symbol}?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Unable to analyze {symbol} at this time
          </p>
        </CardContent>
      </Card>
    );
  }

  // Determine verdict
  const getVerdict = () => {
    if (data.overallConfidence >= 70) {
      return data.overallDirection === "bullish"
        ? "BUY"
        : data.overallDirection === "bearish"
        ? "SELL"
        : "HOLD";
    }
    if (data.overallConfidence >= 55) {
      return data.overallDirection === "bullish"
        ? "LEAN BUY"
        : data.overallDirection === "bearish"
        ? "LEAN SELL"
        : "HOLD";
    }
    return "HOLD";
  };

  const verdict = getVerdict();
  const verdictColor =
    verdict.includes("BUY")
      ? "text-emerald-400"
      : verdict.includes("SELL")
      ? "text-red-400"
      : "text-amber-400";
  const verdictBg =
    verdict.includes("BUY")
      ? "bg-emerald-500/10 border-emerald-500/20"
      : verdict.includes("SELL")
      ? "bg-red-500/10 border-red-500/20"
      : "bg-amber-500/10 border-amber-500/20";

  // Build bull and bear cases from engine signals
  const bullCase = Object.values(data.engines)
    .filter((e) => e.signal === "bullish")
    .flatMap((e) => e.signals.slice(0, 2))
    .slice(0, 4);

  const bearCase = Object.values(data.engines)
    .filter((e) => e.signal === "bearish")
    .flatMap((e) => e.signals.slice(0, 2))
    .slice(0, 4);

  // Count bullish/bearish engines
  const bullishEngines = Object.values(data.engines).filter(
    (e) => e.signal === "bullish"
  ).length;
  const bearishEngines = Object.values(data.engines).filter(
    (e) => e.signal === "bearish"
  ).length;

  if (compact) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  verdictBg
                )}
              >
                {verdict.includes("BUY") ? (
                  <TrendingUp className={cn("h-6 w-6", verdictColor)} />
                ) : verdict.includes("SELL") ? (
                  <TrendingDown className={cn("h-6 w-6", verdictColor)} />
                ) : (
                  <Minus className={cn("h-6 w-6", verdictColor)} />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Should I Buy?</p>
                <p className={cn("text-xl font-bold", verdictColor)}>{verdict}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">AI Confidence</p>
              <p className="text-lg font-bold text-white">
                {data.overallConfidence.toFixed(0)}%
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-3 text-cyan-400"
            onClick={handleViewFullAnalysis}
          >
            View Full Analysis
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("glass-card", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Should I Buy {symbol}?
          </CardTitle>
          <Badge variant="outline" className={cn("text-sm font-bold", verdictBg, verdictColor)}>
            {verdict}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confidence Score */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">AI Confidence</span>
            <span className="text-lg font-bold text-white">
              {data.overallConfidence.toFixed(0)}%
            </span>
          </div>
          <Progress
            value={data.overallConfidence}
            className="h-2"
          />
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>Grade: {data.overallGrade}</span>
            <span>
              {bullishEngines} bullish / {bearishEngines} bearish engines
            </span>
          </div>
        </div>

        {/* Bull vs Bear Cases */}
        <div className="grid grid-cols-2 gap-3">
          {/* Bull Case */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">Bull Case</span>
            </div>
            {bullCase.length > 0 ? (
              <ul className="space-y-1">
                {bullCase.map((signal, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No strong bullish signals</p>
            )}
          </div>

          {/* Bear Case */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">Bear Case</span>
            </div>
            {bearCase.length > 0 ? (
              <ul className="space-y-1">
                {bearCase.map((signal, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <XCircle className="h-3 w-3 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No strong bearish signals</p>
            )}
          </div>
        </div>

        {/* Trade Idea */}
        {data.tradeIdea && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-medium text-white">Trade Setup</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Entry</p>
                <p className="text-sm font-bold text-white">
                  ${data.tradeIdea.entry.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Target</p>
                <p className="text-sm font-bold text-emerald-400">
                  ${data.tradeIdea.target.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Stop Loss</p>
                <p className="text-sm font-bold text-red-400">
                  ${data.tradeIdea.stopLoss.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">R:R Ratio</span>
              </div>
              <span className="text-sm font-medium text-amber-400">
                {data.tradeIdea.riskReward}
              </span>
            </div>
          </div>
        )}

        {/* Risk Warning */}
        <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-200">
            This is AI-generated analysis, not financial advice. Always do your own research
            and consider your risk tolerance before trading.
          </p>
        </div>

        {/* Action Button */}
        <Button
          className="w-full bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600"
          onClick={handleViewFullAnalysis}
        >
          <Zap className="h-4 w-4 mr-2" />
          View Full 6-Engine Analysis
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Quick verdict badge for use in lists/tables
 */
export function QuickVerdict({ symbol, className }: { symbol: string; className?: string }) {
  const { data, isLoading } = useShouldBuyAnalysis(symbol);

  if (isLoading || !data) return null;

  const verdict =
    data.overallDirection === "bullish" && data.overallConfidence >= 60
      ? "BUY"
      : data.overallDirection === "bearish" && data.overallConfidence >= 60
      ? "SELL"
      : "HOLD";

  const verdictColor =
    verdict === "BUY"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : verdict === "SELL"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : "bg-amber-500/10 text-amber-400 border-amber-500/20";

  return (
    <Badge variant="outline" className={cn("text-xs font-medium", verdictColor, className)}>
      {verdict}
    </Badge>
  );
}

export { useShouldBuyAnalysis };
