import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, safeToFixed } from "@/lib/utils";
import { 
  TrendingUp, TrendingDown, AlertTriangle, Shield, 
  Zap, Activity, Clock, Target, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, Timer, Gauge
} from "lucide-react";

interface MarketContextData {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
  riskSentiment: 'risk_on' | 'risk_off' | 'neutral';
  score: number;
  shouldTrade: boolean;
  reasons: string[];
  spyData: { price: number; change: number; relativeVolume: number } | null;
  vixLevel: number | null;
  tradingSession: string;
}

function SentimentGauge({ score, sentiment }: { score: number; sentiment: string }) {
  const getGaugeColor = () => {
    if (score >= 70) return "from-green-500 to-emerald-400";
    if (score >= 50) return "from-yellow-500 to-amber-400";
    if (score >= 30) return "from-orange-500 to-amber-500";
    return "from-red-500 to-rose-400";
  };

  const getLabel = () => {
    if (score >= 70) return "BULLISH";
    if (score >= 55) return "LEAN BULLISH";
    if (score >= 45) return "NEUTRAL";
    if (score >= 30) return "LEAN BEARISH";
    return "BEARISH";
  };

  const getIcon = () => {
    if (score >= 55) return <TrendingUp className="w-6 h-6" />;
    if (score >= 45) return <Activity className="w-6 h-6" />;
    return <TrendingDown className="w-6 h-6" />;
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <div className="relative w-48 h-24 overflow-hidden">
        <div className="absolute inset-0 bg-slate-800/50 rounded-t-full border border-slate-700/50" />
        <div 
          className={cn(
            "absolute bottom-0 left-1/2 w-2 h-20 -translate-x-1/2 origin-bottom transition-transform duration-700",
            "bg-gradient-to-t", getGaugeColor()
          )}
          style={{ transform: `translateX(-50%) rotate(${(score - 50) * 1.8}deg)` }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-700 border-2 border-slate-500" />
      </div>
      <div className="text-center">
        <div className={cn(
          "text-3xl font-bold font-mono flex items-center gap-2 justify-center",
          score >= 55 ? "text-green-400" : score >= 45 ? "text-yellow-400" : "text-red-400"
        )}>
          {getIcon()}
          {safeToFixed(score, 0)}
        </div>
        <div className="text-lg font-semibold text-slate-300 mt-1">{getLabel()}</div>
        <div className="text-xs text-slate-500 uppercase tracking-wide mt-1">
          {sentiment.replace(/_/g, ' ')}
        </div>
      </div>
    </div>
  );
}

function MarketConditionCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  status 
}: { 
  title: string; 
  value: string; 
  subtitle?: string;
  icon: any;
  status: 'positive' | 'negative' | 'neutral' | 'warning';
}) {
  const statusColors = {
    positive: "border-green-500/30 bg-green-500/10",
    negative: "border-red-500/30 bg-red-500/10",
    neutral: "border-slate-500/30 bg-slate-500/10",
    warning: "border-amber-500/30 bg-amber-500/10",
  };
  
  const iconColors = {
    positive: "text-green-400",
    negative: "text-red-400",
    neutral: "text-slate-400",
    warning: "text-amber-400",
  };

  return (
    <div className={cn(
      "p-4 rounded-xl border backdrop-blur-sm transition-all",
      statusColors[status]
    )}>
      <div className="flex items-center gap-3 mb-2">
        <Icon className={cn("w-5 h-5", iconColors[status])} />
        <span className="text-xs text-slate-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className={cn("text-2xl font-bold font-mono", iconColors[status])}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}

function TimingGuidance({ context }: { context: MarketContextData }) {
  const getEntryTiming = () => {
    if (!context.shouldTrade) {
      return { 
        recommendation: "WAIT", 
        reason: "Market closed or unfavorable conditions",
        icon: XCircle,
        color: "text-red-400"
      };
    }
    
    if (context.regime === 'volatile') {
      return { 
        recommendation: "CAUTION", 
        reason: "High volatility - reduce position sizes, wider stops",
        icon: AlertTriangle,
        color: "text-amber-400"
      };
    }
    
    if (context.regime === 'trending_up' && context.score >= 60) {
      return { 
        recommendation: "BUY CALLS", 
        reason: "Strong uptrend with momentum - look for pullback entries",
        icon: ArrowUp,
        color: "text-green-400"
      };
    }
    
    if (context.regime === 'trending_down' && context.score >= 40) {
      return { 
        recommendation: "BUY PUTS", 
        reason: "Downtrend confirmed - look for bounce rejections",
        icon: ArrowDown,
        color: "text-red-400"
      };
    }
    
    if (context.regime === 'ranging') {
      return { 
        recommendation: "RANGE TRADE", 
        reason: "Low movement - trade reversals at extremes",
        icon: Activity,
        color: "text-cyan-400"
      };
    }
    
    return { 
      recommendation: "NEUTRAL", 
      reason: "Mixed signals - wait for clearer direction",
      icon: Timer,
      color: "text-slate-400"
    };
  };

  const getExitTiming = () => {
    if (context.vixLevel && context.vixLevel > 25) {
      return "Take profits quickly - elevated VIX means fast reversals";
    }
    if (context.regime === 'volatile') {
      return "Use trailing stops - volatility can extend moves but reverses fast";
    }
    if (context.regime === 'trending_up') {
      return "Let winners run with trailing stops - trend is your friend";
    }
    if (context.regime === 'trending_down') {
      return "Take profits on bounces - don't fight the trend";
    }
    return "Target 1:2 risk/reward - take partials at resistance/support";
  };

  const timing = getEntryTiming();
  const TimingIcon = timing.icon;

  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" />
          Entry & Exit Timing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              "p-2 rounded-lg",
              timing.color === "text-green-400" ? "bg-green-500/15 border border-green-500/30" :
              timing.color === "text-red-400" ? "bg-red-500/15 border border-red-500/30" :
              timing.color === "text-amber-400" ? "bg-amber-500/15 border border-amber-500/30" :
              "bg-slate-500/15 border border-slate-500/30"
            )}>
              <TimingIcon className={cn("w-5 h-5", timing.color)} />
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Entry Signal</div>
              <div className={cn("text-lg font-bold", timing.color)}>{timing.recommendation}</div>
            </div>
          </div>
          <p className="text-sm text-slate-400">{timing.reason}</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wide">Exit Strategy</span>
          </div>
          <p className="text-sm text-slate-300">{getExitTiming()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WarningsPanel({ context }: { context: MarketContextData }) {
  const warnings: { text: string; severity: 'high' | 'medium' | 'low' }[] = [];
  
  if (!context.shouldTrade) {
    warnings.push({ text: "Market closed - no active trading", severity: 'high' });
  }
  
  if (context.vixLevel && context.vixLevel > 30) {
    warnings.push({ text: `Extreme fear (VIX ${safeToFixed(context.vixLevel, 1)}) - expect violent swings`, severity: 'high' });
  } else if (context.vixLevel && context.vixLevel > 25) {
    warnings.push({ text: `Elevated VIX (${safeToFixed(context.vixLevel, 1)}) - reduce size, widen stops`, severity: 'medium' });
  } else if (context.vixLevel && context.vixLevel > 20) {
    warnings.push({ text: `Above-average VIX (${safeToFixed(context.vixLevel, 1)}) - be selective`, severity: 'low' });
  }
  
  if (context.regime === 'volatile') {
    warnings.push({ text: "High intraday range - fast moves in both directions", severity: 'medium' });
  }
  
  if (context.spyData && context.spyData.relativeVolume < 0.7) {
    warnings.push({ text: "Low volume day - less conviction in moves", severity: 'low' });
  }
  
  if (context.score < 30) {
    warnings.push({ text: "Poor market conditions - bot trading paused", severity: 'high' });
  }

  const hasReasons = context.reasons.some(r => r.includes('diverging') || r.includes('Skip'));
  if (hasReasons) {
    warnings.push({ text: "Mixed signals between SPY/QQQ - unclear direction", severity: 'medium' });
  }

  if (warnings.length === 0) {
    warnings.push({ text: "No significant warnings - conditions are favorable", severity: 'low' });
  }

  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Market Warnings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {warnings.map((warning, i) => (
            <div 
              key={i}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                warning.severity === 'high' ? "bg-red-500/10 border-red-500/30" :
                warning.severity === 'medium' ? "bg-amber-500/10 border-amber-500/30" :
                "bg-slate-500/10 border-slate-500/30"
              )}
            >
              {warning.severity === 'high' ? (
                <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              ) : warning.severity === 'medium' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              )}
              <span className={cn(
                "text-sm",
                warning.severity === 'high' ? "text-red-300" :
                warning.severity === 'medium' ? "text-amber-300" :
                "text-slate-300"
              )}>
                {warning.text}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReasonsPanel({ reasons }: { reasons: string[] }) {
  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          Market Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {reasons.map((reason, i) => (
            <div 
              key={i}
              className="flex items-start gap-2 p-2 rounded bg-slate-800/30 border border-slate-700/20"
            >
              <Zap className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-1" />
              <span className="text-sm text-slate-300">{reason}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function MarketSentimentDashboard() {
  const { data: marketContext, isLoading } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-500">Loading market data...</div>
      </div>
    );
  }

  const context = marketContext || {
    regime: 'ranging' as const,
    riskSentiment: 'neutral' as const,
    score: 50,
    shouldTrade: false,
    reasons: ['Market data unavailable'],
    spyData: null,
    vixLevel: null,
    tradingSession: 'unknown',
  };

  const getRegimeLabel = () => {
    switch (context.regime) {
      case 'trending_up': return 'UPTREND';
      case 'trending_down': return 'DOWNTREND';
      case 'volatile': return 'VOLATILE';
      default: return 'RANGING';
    }
  };

  const getVixStatus = (): 'positive' | 'negative' | 'neutral' | 'warning' => {
    if (!context.vixLevel) return 'neutral';
    if (context.vixLevel < 15) return 'positive';
    if (context.vixLevel > 25) return 'negative';
    if (context.vixLevel > 20) return 'warning';
    return 'neutral';
  };

  const getSpyStatus = (): 'positive' | 'negative' | 'neutral' | 'warning' => {
    if (!context.spyData) return 'neutral';
    if (context.spyData.change > 0.5) return 'positive';
    if (context.spyData.change < -0.5) return 'negative';
    return 'neutral';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30 lg:row-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              Market Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SentimentGauge score={context.score} sentiment={context.riskSentiment} />
            
            <div className="mt-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase">Trading Status</span>
                <Badge className={cn(
                  "text-[10px]",
                  context.shouldTrade 
                    ? "bg-green-500/20 text-green-400 border-green-500/40" 
                    : "bg-red-500/20 text-red-400 border-red-500/40"
                )}>
                  {context.shouldTrade ? "ACTIVE" : "PAUSED"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 uppercase">Regime</span>
                <span className={cn(
                  "text-sm font-bold",
                  context.regime === 'trending_up' ? "text-green-400" :
                  context.regime === 'trending_down' ? "text-red-400" :
                  context.regime === 'volatile' ? "text-amber-400" : "text-slate-400"
                )}>
                  {getRegimeLabel()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <MarketConditionCard
            title="SPY"
            value={context.spyData ? `${context.spyData.change >= 0 ? '+' : ''}${safeToFixed(context.spyData.change, 2)}%` : 'N/A'}
            subtitle={context.spyData ? `$${safeToFixed(context.spyData.price, 2)}` : undefined}
            icon={context.spyData && context.spyData.change >= 0 ? TrendingUp : TrendingDown}
            status={getSpyStatus()}
          />
          <MarketConditionCard
            title="VIX (Fear)"
            value={context.vixLevel ? safeToFixed(context.vixLevel, 1) : 'N/A'}
            subtitle={
              context.vixLevel 
                ? context.vixLevel < 15 ? "Low - Complacent" 
                  : context.vixLevel > 25 ? "High - Fearful"
                  : context.vixLevel > 20 ? "Elevated"
                  : "Normal"
                : undefined
            }
            icon={AlertTriangle}
            status={getVixStatus()}
          />
          <MarketConditionCard
            title="Volume"
            value={context.spyData ? `${safeToFixed(context.spyData.relativeVolume, 1)}x` : 'N/A'}
            subtitle="Relative to Avg"
            icon={Activity}
            status={
              context.spyData 
                ? context.spyData.relativeVolume > 1.2 ? 'positive' 
                  : context.spyData.relativeVolume < 0.7 ? 'warning' 
                  : 'neutral'
                : 'neutral'
            }
          />
          <MarketConditionCard
            title="Session"
            value={context.tradingSession?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}
            subtitle={context.shouldTrade ? "Market Open" : "Market Closed"}
            icon={Clock}
            status={context.shouldTrade ? 'positive' : 'neutral'}
          />
        </div>

        <div className="lg:col-span-2">
          <TimingGuidance context={context} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WarningsPanel context={context} />
        <ReasonsPanel reasons={context.reasons} />
      </div>
    </div>
  );
}
