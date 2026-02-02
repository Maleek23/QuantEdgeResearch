import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  AlertTriangle,
  Target,
  Shield,
  Newspaper,
  Building2,
  Gauge,
  ArrowUp,
  ArrowDown,
  Minus,
  Zap,
  LineChart,
} from "lucide-react";
import { cn, formatCurrency, formatPercent, safeToFixed } from "@/lib/utils";

interface TechnicalAnalysis {
  rsi: { value: number; signal: string };
  macd: { value: number; signal: string; histogram: number };
  movingAverages: {
    sma20: number;
    sma50: number;
    sma200: number;
    priceVsSMA20: string;
    priceVsSMA50: string;
    priceVsSMA200: string;
    goldenCross: boolean;
    deathCross: boolean;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
    squeeze: boolean;
  };
  adx: { value: number; trending: boolean };
  volume: { current: number; average: number; ratio: number; unusual: boolean };
  support: number;
  resistance: number;
  priceAction: { trend: string; strength: string };
}

interface MultiFactorScore {
  total: number;
  fundamentals: number;
  technicals: number;
  momentum: number;
  sentiment: number;
  marketContext: number;
  grade: string;
  tier: string;
}

interface MarketRegime {
  overall: string;
  volatility: string;
  sectorStrength: string;
  trend: string;
  description: string;
}

interface NewsItem {
  title: string;
  url: string;
  summary: string;
  time_published: string;
  source: string;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
}

interface CompanyContext {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  description: string;
  recentNews: NewsItem[];
  catalysts: string[];
}

interface MultiFactorAnalysisData {
  symbol: string;
  timestamp: string;
  company: CompanyContext;
  regime: MarketRegime;
  technicals: TechnicalAnalysis | null;
  score: MultiFactorScore;
  thesis: {
    direction: string;
    headline: string;
    summary: string;
    entryZone: { low: number; high: number };
    targetPrice: number;
    stopLoss: number;
    riskReward: number;
    holdingPeriod: string;
    keyRisks: string[];
    catalysts: string[];
    signals: string[];
  };
}

interface MultiFactorAnalysisProps {
  symbol: string;
  onClose?: () => void;
}

function getTierColor(tier: string) {
  switch (tier) {
    case "INSIDER":
      return "text-green-400 bg-green-400/10 border-green-400/30";
    case "PRIORITY":
      return "text-cyan-400 bg-cyan-400/10 border-cyan-400/30";
    case "WATCH":
      return "text-amber-400 bg-amber-400/10 border-amber-400/30";
    case "AVOID":
      return "text-red-400 bg-red-400/10 border-red-400/30";
    default:
      return "text-muted-foreground bg-muted/10 border-muted/30";
  }
}

function getGradeColor(grade: string) {
  if (grade.startsWith("A")) return "text-green-400";
  if (grade.startsWith("B")) return "text-cyan-400";
  if (grade.startsWith("C")) return "text-amber-400";
  if (grade.startsWith("D")) return "text-orange-400";
  return "text-red-400";
}

function SignalBadge({ signal, value }: { signal: string; value?: number }) {
  const isBullish = signal === "bullish" || signal === "oversold";
  const isBearish = signal === "bearish" || signal === "overbought";
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        isBullish && "text-green-400 border-green-400/30",
        isBearish && "text-red-400 border-red-400/30",
        !isBullish && !isBearish && "text-muted-foreground border-muted/30"
      )}
    >
      {isBullish && <ArrowUp className="w-3 h-3 mr-1" />}
      {isBearish && <ArrowDown className="w-3 h-3 mr-1" />}
      {!isBullish && !isBearish && <Minus className="w-3 h-3 mr-1" />}
      {signal.charAt(0).toUpperCase() + signal.slice(1)}
      {value !== undefined && ` (${safeToFixed(value, 1)})`}
    </Badge>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-mono tabular-nums", color)}>{value}%</span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

export function MultiFactorAnalysis({ symbol, onClose }: MultiFactorAnalysisProps) {
  const { data, isLoading, error } = useQuery<MultiFactorAnalysisData>({
    queryKey: ['/api/multi-factor-analysis', symbol],
    enabled: !!symbol,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 animate-pulse" />
            Analyzing {symbol}...
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
      <Card className="glass-card border-red-400/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            <span>Unable to analyze {symbol}. Data unavailable.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { company, regime, technicals, score, thesis } = data;

  return (
    <Card className="glass-card overflow-hidden" data-testid={`analysis-panel-${symbol}`}>
      <CardHeader className="pb-2 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Multi-Factor Analysis
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {company.name} ({symbol})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-lg font-bold px-3 py-1", getTierColor(score.tier))}>
              {score.tier}
            </Badge>
            <span className={cn("text-2xl font-bold font-mono tabular-nums", getGradeColor(score.grade))}>
              {score.grade}
            </span>
          </div>
        </div>
      </CardHeader>

      <ScrollArea className="h-[500px]">
        <CardContent className="pt-4 space-y-6">
          {/* Overall Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                Conviction Score
              </span>
              <span className="text-3xl font-bold font-mono tabular-nums text-foreground">
                {score.total}%
              </span>
            </div>
            <Progress value={score.total} className="h-3" />
          </div>

          {/* Score Breakdown */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Score Breakdown</h4>
            <div className="grid gap-2">
              <ScoreBar label="Technicals (30%)" value={score.technicals} color={score.technicals >= 60 ? "text-green-400" : score.technicals >= 40 ? "text-amber-400" : "text-red-400"} />
              <ScoreBar label="Momentum (25%)" value={score.momentum} color={score.momentum >= 60 ? "text-green-400" : score.momentum >= 40 ? "text-amber-400" : "text-red-400"} />
              <ScoreBar label="Sentiment (15%)" value={score.sentiment} color={score.sentiment >= 60 ? "text-green-400" : score.sentiment >= 40 ? "text-amber-400" : "text-red-400"} />
              <ScoreBar label="Fundamentals (15%)" value={score.fundamentals} color={score.fundamentals >= 60 ? "text-green-400" : score.fundamentals >= 40 ? "text-amber-400" : "text-red-400"} />
              <ScoreBar label="Market Context (15%)" value={score.marketContext} color={score.marketContext >= 60 ? "text-green-400" : score.marketContext >= 40 ? "text-amber-400" : "text-red-400"} />
            </div>
          </div>

          <Separator />

          {/* Company Context */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-400" />
              Company Profile
            </h4>
            <div className="text-xs space-y-1">
              <div className="flex gap-2">
                <Badge variant="outline" className="text-purple-400 border-purple-400/30">{company.sector}</Badge>
                <Badge variant="outline" className="text-muted-foreground">{company.industry}</Badge>
              </div>
              <p className="text-muted-foreground leading-relaxed">{company.description}</p>
            </div>
          </div>

          <Separator />

          {/* Market Regime */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Market Regime
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overall:</span>
                <Badge variant="outline" className={cn(
                  regime.overall === "bullish" && "text-green-400 border-green-400/30",
                  regime.overall === "bearish" && "text-red-400 border-red-400/30",
                  regime.overall === "neutral" && "text-amber-400 border-amber-400/30"
                )}>
                  {regime.overall.charAt(0).toUpperCase() + regime.overall.slice(1)}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Volatility:</span>
                <Badge variant="outline" className={cn(
                  regime.volatility === "low" && "text-green-400 border-green-400/30",
                  regime.volatility === "normal" && "text-cyan-400 border-cyan-400/30",
                  regime.volatility === "high" && "text-amber-400 border-amber-400/30",
                  regime.volatility === "extreme" && "text-red-400 border-red-400/30"
                )}>
                  {regime.volatility.charAt(0).toUpperCase() + regime.volatility.slice(1)}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trend:</span>
                <span className="font-medium">{regime.trend}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sectors:</span>
                <span className="font-medium">{regime.sectorStrength}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">{regime.description}</p>
          </div>

          <Separator />

          {/* Technical Indicators */}
          {technicals && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <LineChart className="w-4 h-4 text-amber-400" />
                Technical Indicators
              </h4>
              
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* RSI */}
                <div className="space-y-1">
                  <span className="text-muted-foreground">RSI(14)</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-medium">{safeToFixed(technicals.rsi.value, 1)}</span>
                    <SignalBadge signal={technicals.rsi.signal} />
                  </div>
                </div>

                {/* MACD */}
                <div className="space-y-1">
                  <span className="text-muted-foreground">MACD</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-medium">{safeToFixed(technicals.macd.value, 2)}</span>
                    <SignalBadge signal={technicals.macd.signal} />
                  </div>
                </div>

                {/* ADX */}
                <div className="space-y-1">
                  <span className="text-muted-foreground">ADX</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-medium">{safeToFixed(technicals.adx.value, 1)}</span>
                    <Badge variant="outline" className={technicals.adx.trending ? "text-green-400 border-green-400/30" : "text-muted-foreground"}>
                      {technicals.adx.trending ? "Trending" : "Ranging"}
                    </Badge>
                  </div>
                </div>

                {/* Volume */}
                <div className="space-y-1">
                  <span className="text-muted-foreground">Volume</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-medium">{safeToFixed(technicals.volume.ratio, 1)}x</span>
                    {technicals.volume.unusual && (
                      <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                        <Zap className="w-3 h-3 mr-1" />
                        Unusual
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Moving Averages */}
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs">Moving Averages</span>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("text-xs",
                    technicals.movingAverages.priceVsSMA20 === "above" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"
                  )}>
                    SMA20: {technicals.movingAverages.priceVsSMA20 === "above" ? "Above" : "Below"}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs",
                    technicals.movingAverages.priceVsSMA50 === "above" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"
                  )}>
                    SMA50: {technicals.movingAverages.priceVsSMA50 === "above" ? "Above" : "Below"}
                  </Badge>
                  <Badge variant="outline" className={cn("text-xs",
                    technicals.movingAverages.priceVsSMA200 === "above" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"
                  )}>
                    SMA200: {technicals.movingAverages.priceVsSMA200 === "above" ? "Above" : "Below"}
                  </Badge>
                  {technicals.movingAverages.goldenCross && (
                    <Badge className="bg-green-400/20 text-green-400 border-green-400/30">Golden Cross</Badge>
                  )}
                  {technicals.movingAverages.deathCross && (
                    <Badge className="bg-red-400/20 text-red-400 border-red-400/30">Death Cross</Badge>
                  )}
                </div>
              </div>

              {/* Support/Resistance */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Shield className="w-3 h-3 text-green-400" />
                  <span className="text-muted-foreground">Support:</span>
                  <span className="font-mono tabular-nums font-medium text-green-400">
                    {formatCurrency(technicals.support)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-3 h-3 text-red-400" />
                  <span className="text-muted-foreground">Resistance:</span>
                  <span className="font-mono tabular-nums font-medium text-red-400">
                    {formatCurrency(technicals.resistance)}
                  </span>
                </div>
              </div>

              {/* Bollinger Bands Squeeze */}
              {technicals.bollingerBands.squeeze && (
                <Badge className="bg-purple-400/20 text-purple-400 border-purple-400/30">
                  <Zap className="w-3 h-3 mr-1" />
                  Bollinger Squeeze - Breakout Imminent
                </Badge>
              )}
            </div>
          )}

          <Separator />

          {/* Risk/Reward */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-green-400" />
              Risk/Reward Setup
            </h4>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground">Entry Zone</span>
                <div className="font-mono tabular-nums text-cyan-400">
                  {formatCurrency(thesis.entryZone.low)} - {formatCurrency(thesis.entryZone.high)}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">Stop Loss</span>
                <div className="font-mono tabular-nums text-red-400">
                  {formatCurrency(thesis.stopLoss)}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">R:R Ratio</span>
                <div className="font-mono tabular-nums text-green-400 font-bold">
                  {safeToFixed(thesis.riskReward, 1)}:1
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground text-xs">Price Target</span>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-green-400 border-green-400/30 font-mono tabular-nums">
                  {formatCurrency(thesis.targetPrice)}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Thesis */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-purple-400" />
              Trade Thesis
            </h4>
            <p className="text-sm font-medium">{thesis.headline}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {thesis.summary}
            </p>
            {thesis.signals.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {thesis.signals.slice(0, 5).map((signal, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-cyan-400 border-cyan-400/30">
                    {signal}
                  </Badge>
                ))}
              </div>
            )}
            {thesis.keyRisks.length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-muted-foreground">Key Risks:</span>
                <ul className="text-xs text-red-400/80 list-disc list-inside mt-1">
                  {thesis.keyRisks.slice(0, 3).map((risk, i) => (
                    <li key={i}>{risk}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recent News */}
          {company.recentNews.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-cyan-400" />
                  Recent News ({company.recentNews.length})
                </h4>
                <div className="space-y-2">
                  {company.recentNews.slice(0, 3).map((news, i) => (
                    <div key={i} className="text-xs p-2 rounded-md bg-muted/20 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <a href={news.url} target="_blank" rel="noopener noreferrer" 
                           className="font-medium hover:text-cyan-400 transition-colors line-clamp-2">
                          {news.title}
                        </a>
                        <Badge variant="outline" className={cn("shrink-0 text-xs",
                          news.overall_sentiment_label?.includes("Bullish") && "text-green-400 border-green-400/30",
                          news.overall_sentiment_label?.includes("Bearish") && "text-red-400 border-red-400/30",
                          !news.overall_sentiment_label?.includes("Bullish") && !news.overall_sentiment_label?.includes("Bearish") && "text-muted-foreground"
                        )}>
                          {news.overall_sentiment_label || "Neutral"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground line-clamp-2">{news.summary}</p>
                      <span className="text-muted-foreground/60">{news.source}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

export default MultiFactorAnalysis;
