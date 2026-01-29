/**
 * Earnings Prediction Card
 *
 * Displays AI-powered earnings predictions with:
 * - Scenario analysis with probability chart
 * - Revenue/EPS forecasts
 * - Tactical strategies
 * - Historical surprise analysis
 *
 * Inspired by Intellectia.ai earnings prediction feature.
 *
 * Used in: Stock Detail page (Earnings tab or section)
 */

import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Calendar,
  AlertTriangle,
  Info,
  Zap,
  DollarSign,
  Percent,
  ChevronRight,
  History,
  Lightbulb,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ===================
// TYPE DEFINITIONS
// ===================

interface EarningsScenario {
  probability: number;
  priceTarget: number;
  priceChange: number;
}

interface ForecastMetric {
  estimate: number;
  consensus: number;
  variance: number;
  justification: string;
}

interface TacticalStrategy {
  strategy: string;
  optionPlay?: string;
  reasoning: string;
}

interface EarningsSurprise {
  date: string;
  expectedEPS: number;
  actualEPS: number;
  surprise: number;
  priceReaction: number;
}

interface EarningsPrediction {
  symbol: string;
  currentPrice: number;
  earningsDate: string | null;
  daysToEarnings: number | null;
  prediction: "strong_beat" | "beat" | "neutral" | "miss" | "strong_miss";
  confidence: number;
  aiSummary: string;
  scenarios: {
    strongBeat: EarningsScenario;
    beat: EarningsScenario;
    neutral: EarningsScenario;
    miss: EarningsScenario;
    strongMiss: EarningsScenario;
  };
  revenueForecast: ForecastMetric;
  epsForecast: ForecastMetric;
  tacticalStrategies: {
    bullish: TacticalStrategy;
    neutral: TacticalStrategy;
    bearish: TacticalStrategy;
  };
  surpriseHistory: EarningsSurprise[];
  averageSurprise: number;
  beatRate: number;
  riskLevel: "low" | "medium" | "high";
  impliedMove: number;
  analysisTimestamp: string;
  dataQuality: "high" | "medium" | "low";
}

// ===================
// HOOKS
// ===================

function useEarningsPrediction(symbol: string) {
  return useQuery<EarningsPrediction>({
    queryKey: ["/api/earnings/prediction", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/earnings/prediction/${symbol}`);
      if (!res.ok) throw new Error("Failed to fetch earnings prediction");
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000, // Fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Cache for 30 minutes
    retry: 1,
  });
}

// ===================
// SUB-COMPONENTS
// ===================

function ScenarioBar({
  label,
  probability,
  priceChange,
  color,
}: {
  label: string;
  probability: number;
  priceChange: number;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("font-medium", color)}>
            {priceChange >= 0 ? "+" : ""}
            {priceChange}%
          </span>
          <span className="text-white font-bold">{probability}%</span>
        </div>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color.replace("text-", "bg-"))}
          style={{ width: `${probability}%` }}
        />
      </div>
    </div>
  );
}

function ForecastCard({
  title,
  icon: Icon,
  forecast,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  forecast: ForecastMetric;
}) {
  const isPositive = forecast.variance >= 0;

  return (
    <div className="bg-slate-800/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Our Estimate</p>
          <p
            className={cn(
              "text-lg font-bold",
              isPositive ? "text-emerald-400" : "text-red-400"
            )}
          >
            {title === "EPS" ? `$${forecast.estimate.toFixed(2)}` : `$${(forecast.estimate / 1e9).toFixed(2)}B`}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Consensus</p>
          <p className="text-lg font-bold text-slate-300">
            {title === "EPS" ? `$${forecast.consensus.toFixed(2)}` : `$${(forecast.consensus / 1e9).toFixed(2)}B`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Badge
          variant="outline"
          className={cn(
            isPositive
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-400"
          )}
        >
          {isPositive ? "+" : ""}
          {forecast.variance}% vs consensus
        </Badge>
      </div>
      <p className="text-xs text-slate-400 mt-2">{forecast.justification}</p>
    </div>
  );
}

function StrategyCard({ strategy, type }: { strategy: TacticalStrategy; type: string }) {
  const colors = {
    bullish: "border-emerald-500/20 bg-emerald-500/5",
    neutral: "border-amber-500/20 bg-amber-500/5",
    bearish: "border-red-500/20 bg-red-500/5",
  };

  const icons = {
    bullish: TrendingUp,
    neutral: Scale,
    bearish: TrendingDown,
  };

  const Icon = icons[type as keyof typeof icons];

  return (
    <div className={cn("rounded-lg p-4 border", colors[type as keyof typeof colors])}>
      <div className="flex items-center gap-2 mb-2">
        <Icon
          className={cn(
            "h-4 w-4",
            type === "bullish"
              ? "text-emerald-400"
              : type === "bearish"
              ? "text-red-400"
              : "text-amber-400"
          )}
        />
        <span className="text-sm font-medium text-white capitalize">{type} Strategy</span>
      </div>
      <p className="text-sm font-semibold text-white mb-1">{strategy.strategy}</p>
      {strategy.optionPlay && (
        <p className="text-xs text-cyan-400 mb-2 font-mono">{strategy.optionPlay}</p>
      )}
      <p className="text-xs text-slate-400">{strategy.reasoning}</p>
    </div>
  );
}

function SurpriseHistoryChart({ history }: { history: EarningsSurprise[] }) {
  return (
    <div className="space-y-2">
      {history.slice(0, 4).map((item, i) => (
        <div
          key={item.date}
          className="flex items-center justify-between p-2 bg-slate-800/30 rounded"
        >
          <div>
            <p className="text-sm font-medium text-white">{item.date}</p>
            <p className="text-xs text-muted-foreground">
              Est: ${item.expectedEPS.toFixed(2)} | Act: ${item.actualEPS.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <Badge
              variant="outline"
              className={cn(
                item.surprise >= 0
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              )}
            >
              {item.surprise >= 0 ? "+" : ""}
              {item.surprise}%
            </Badge>
            <p
              className={cn(
                "text-xs mt-1",
                item.priceReaction >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              Stock: {item.priceReaction >= 0 ? "+" : ""}
              {item.priceReaction}%
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===================
// MAIN COMPONENT
// ===================

interface EarningsPredictionCardProps {
  symbol: string;
  className?: string;
  compact?: boolean;
}

export function EarningsPredictionCard({
  symbol,
  className,
  compact = false,
}: EarningsPredictionCardProps) {
  const { data, isLoading, error } = useEarningsPrediction(symbol);

  if (isLoading) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            Earnings Prediction
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
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
            Earnings Prediction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Unable to generate earnings prediction for {symbol}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Prediction styling
  const predictionColors = {
    strong_beat: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    beat: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
    neutral: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    miss: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    strong_miss: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  };

  const predictionLabels = {
    strong_beat: "Strong Beat",
    beat: "Beat",
    neutral: "Meet",
    miss: "Miss",
    strong_miss: "Strong Miss",
  };

  const colors = predictionColors[data.prediction];
  const label = predictionLabels[data.prediction];

  if (compact) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colors.bg)}>
                <Brain className={cn("h-6 w-6", colors.text)} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Earnings Prediction</p>
                <p className={cn("text-lg font-bold", colors.text)}>{label}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className="text-lg font-bold text-white">{data.confidence}%</p>
            </div>
          </div>
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
            Earnings Prediction for {symbol}
          </CardTitle>
          <Badge variant="outline" className={cn(colors.bg, colors.border, colors.text)}>
            {label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
            <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-4">
            {/* Confidence & Prediction */}
            <div className={cn("rounded-lg p-4 border", colors.bg, colors.border)}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">AI Prediction</p>
                  <p className={cn("text-2xl font-bold", colors.text)}>{label}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="text-2xl font-bold text-white">{data.confidence}%</p>
                </div>
              </div>
              <Progress value={data.confidence} className="h-2 mb-3" />
              <p className="text-sm text-slate-300">{data.aiSummary}</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Beat Rate</p>
                <p className="text-lg font-bold text-white">{data.beatRate}%</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Avg Surprise</p>
                <p
                  className={cn(
                    "text-lg font-bold",
                    data.averageSurprise >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {data.averageSurprise >= 0 ? "+" : ""}
                  {data.averageSurprise}%
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Implied Move</p>
                <p className="text-lg font-bold text-amber-400">±{data.impliedMove}%</p>
              </div>
            </div>

            {/* Risk Badge */}
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={cn(
                    "h-4 w-4",
                    data.riskLevel === "high"
                      ? "text-red-400"
                      : data.riskLevel === "medium"
                      ? "text-amber-400"
                      : "text-emerald-400"
                  )}
                />
                <span className="text-sm text-slate-300">Risk Level</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "capitalize",
                  data.riskLevel === "high"
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : data.riskLevel === "medium"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                )}
              >
                {data.riskLevel}
              </Badge>
            </div>
          </TabsContent>

          {/* Scenarios Tab */}
          <TabsContent value="scenarios" className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Probability distribution of possible earnings outcomes
            </p>
            <ScenarioBar
              label="Strong Beat"
              probability={data.scenarios.strongBeat.probability}
              priceChange={data.scenarios.strongBeat.priceChange}
              color="text-emerald-400"
            />
            <ScenarioBar
              label="Beat"
              probability={data.scenarios.beat.probability}
              priceChange={data.scenarios.beat.priceChange}
              color="text-green-400"
            />
            <ScenarioBar
              label="Meet Expectations"
              probability={data.scenarios.neutral.probability}
              priceChange={data.scenarios.neutral.priceChange}
              color="text-amber-400"
            />
            <ScenarioBar
              label="Miss"
              probability={data.scenarios.miss.probability}
              priceChange={data.scenarios.miss.priceChange}
              color="text-orange-400"
            />
            <ScenarioBar
              label="Strong Miss"
              probability={data.scenarios.strongMiss.probability}
              priceChange={data.scenarios.strongMiss.priceChange}
              color="text-red-400"
            />
          </TabsContent>

          {/* Forecasts Tab */}
          <TabsContent value="forecasts" className="space-y-4">
            <ForecastCard
              title="Revenue"
              icon={DollarSign}
              forecast={data.revenueForecast}
            />
            <ForecastCard title="EPS" icon={Percent} forecast={data.epsForecast} />

            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <History className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium text-white">Historical Surprises</span>
              </div>
              <SurpriseHistoryChart history={data.surpriseHistory} />
            </div>
          </TabsContent>

          {/* Strategy Tab */}
          <TabsContent value="strategy" className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Tactical options strategies based on our prediction
            </p>
            <StrategyCard strategy={data.tacticalStrategies.bullish} type="bullish" />
            <StrategyCard strategy={data.tacticalStrategies.neutral} type="neutral" />
            <StrategyCard strategy={data.tacticalStrategies.bearish} type="bearish" />
          </TabsContent>
        </Tabs>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <Info className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-200">
            This is AI-generated analysis for educational purposes only. Past performance does not
            guarantee future results. Always conduct your own research before making investment
            decisions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export { useEarningsPrediction };
