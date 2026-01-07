import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle,
  Gauge,
  Clock,
  BarChart3,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketContextData {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
  riskSentiment: 'risk_on' | 'risk_off' | 'neutral';
  score: number;
  shouldTrade: boolean;
  reasons: string[];
  spyData: { price: number; change: number; relativeVolume: number } | null;
  vixLevel: number | null;
  tradingSession: 'pre_market' | 'opening_drive' | 'mid_morning' | 'lunch_lull' | 'afternoon' | 'power_hour' | 'after_hours';
  timestamp: string;
}

const regimeConfig = {
  trending_up: { label: 'TRENDING UP', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/20', border: 'border-green-500/40' },
  trending_down: { label: 'TRENDING DOWN', icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/40' },
  ranging: { label: 'RANGING', icon: Activity, color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40' },
  volatile: { label: 'VOLATILE', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/40' },
};

const sentimentConfig = {
  risk_on: { label: 'RISK-ON', color: 'text-green-400', bg: 'bg-green-500/10' },
  risk_off: { label: 'RISK-OFF', color: 'text-red-400', bg: 'bg-red-500/10' },
  neutral: { label: 'NEUTRAL', color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

const sessionLabels: Record<string, { label: string; emoji: string }> = {
  pre_market: { label: 'Pre-Market', emoji: '🌅' },
  opening_drive: { label: 'Opening Drive', emoji: '🚀' },
  mid_morning: { label: 'Mid-Morning', emoji: '📈' },
  lunch_lull: { label: 'Lunch Lull', emoji: '😴' },
  afternoon: { label: 'Afternoon', emoji: '⏰' },
  power_hour: { label: 'Power Hour', emoji: '⚡' },
  after_hours: { label: 'After Hours', emoji: '🌙' },
};

export function MarketOverviewWidget() {
  const { data: context, isLoading, error } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Market Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error || !context) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Market Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to load market data</p>
        </CardContent>
      </Card>
    );
  }

  const regime = regimeConfig[context.regime];
  const sentiment = sentimentConfig[context.riskSentiment];
  const session = sessionLabels[context.tradingSession] || { label: context.tradingSession, emoji: '📊' };
  const RegimeIcon = regime.icon;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getVixColor = (vix: number | null) => {
    if (!vix) return 'text-muted-foreground';
    if (vix < 15) return 'text-green-400';
    if (vix < 20) return 'text-amber-400';
    if (vix < 25) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="widget-market-overview">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Market Overview
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {session.emoji} {session.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center gap-2 px-3 py-2 rounded-md", regime.bg, regime.border, "border")}>
            <RegimeIcon className={cn("h-5 w-5", regime.color)} />
            <span className={cn("font-bold text-sm", regime.color)}>{regime.label}</span>
          </div>
          <div className={cn("px-2 py-1 rounded text-xs font-medium", sentiment.bg, sentiment.color)}>
            {sentiment.label}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Trade Score</div>
            <div className={cn("text-2xl font-bold tabular-nums", getScoreColor(context.score))}>
              {context.score}
            </div>
            <Badge 
              variant={context.shouldTrade ? "default" : "secondary"} 
              className={cn("text-xs mt-1", !context.shouldTrade && "opacity-60")}
              data-testid="badge-trade-status"
            >
              {context.shouldTrade ? 'TRADEABLE' : 
               (session.label.includes('Hours') || session.label === 'Weekend' ? 'CLOSED' : 'CAUTION')}
            </Badge>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">VIX</div>
            <div className={cn("text-2xl font-bold tabular-nums", getVixColor(context.vixLevel))}>
              {context.vixLevel?.toFixed(1) || '--'}
            </div>
            <div className="text-xs text-muted-foreground">Fear Index</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">SPY</div>
            {context.spyData ? (
              <>
                <div className="text-lg font-bold tabular-nums">
                  ${context.spyData.price.toFixed(2)}
                </div>
                <div className={cn(
                  "text-xs font-medium",
                  context.spyData.change >= 0 ? 'text-green-400' : 'text-red-400'
                )}>
                  {context.spyData.change >= 0 ? '+' : ''}{context.spyData.change.toFixed(2)}%
                </div>
              </>
            ) : (
              <div className="text-lg font-bold tabular-nums text-muted-foreground">--</div>
            )}
          </div>
        </div>

        {context.spyData && (
          <div className="flex items-center gap-2 text-xs">
            <Zap className="h-3 w-3 text-cyan-400" />
            <span className="text-muted-foreground">Volume:</span>
            <span className={cn(
              "font-medium",
              context.spyData.relativeVolume > 1.3 ? 'text-green-400' : 
              context.spyData.relativeVolume < 0.7 ? 'text-red-400' : 'text-foreground'
            )}>
              {context.spyData.relativeVolume.toFixed(2)}x avg
            </span>
          </div>
        )}

        {context.reasons.length > 0 && (
          <div className="border-t border-border/50 pt-2">
            <div className="text-xs text-muted-foreground space-y-1">
              {context.reasons.slice(0, 3).map((reason, i) => (
                <div key={i} className="flex items-start gap-1">
                  <span className="text-cyan-400">•</span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
