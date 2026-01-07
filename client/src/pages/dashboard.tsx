import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, TrendingDown, Activity, Target, DollarSign, 
  BarChart3, Zap, Clock, AlertTriangle, RefreshCw, Brain,
  Gauge, Shield, Cpu, LineChart, Eye, Layers, Radio,
  CheckCircle2, XCircle, MinusCircle, ArrowUpRight, ArrowDownRight,
  Flame, TriangleAlert, Timer, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Link } from "wouter";
import { MarketOverviewWidget } from "@/components/market-overview-widget";
import { WinRateWidget } from "@/components/win-rate-widget";
import { ExpiryPatternInsights } from "@/components/expiry-pattern-insights";

interface MarketContextData {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
  riskSentiment: 'risk_on' | 'risk_off' | 'neutral';
  score: number;
  shouldTrade: boolean;
  reasons: string[];
  spyData: { price: number; change: number; relativeVolume: number } | null;
  vixLevel: number | null;
  tradingSession: string;
  timestamp: string;
}

interface QuantSignals {
  rsi2: number;
  rsi14: number;
  vwapDistance: number;
  zScore: number;
  adxStrength: number;
  volumeRatio: number;
}

interface EngineStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  lastSignal?: string;
  accuracy?: number;
}

interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

const regimeConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  trending_up: { label: 'BULLISH', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/20' },
  trending_down: { label: 'BEARISH', icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/20' },
  ranging: { label: 'NEUTRAL', icon: Activity, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  volatile: { label: 'VOLATILE', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
};

const sentimentConfig: Record<string, { label: string; color: string; bg: string }> = {
  risk_on: { label: 'RISK-ON', color: 'text-green-400', bg: 'bg-green-500/10' },
  risk_off: { label: 'RISK-OFF', color: 'text-red-400', bg: 'bg-red-500/10' },
  neutral: { label: 'NEUTRAL', color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

function MarketRegimeCard() {
  const { data: context, isLoading } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const regime = context?.regime || 'ranging';
  const config = regimeConfig[regime] || regimeConfig.ranging;
  const sentiment = context?.riskSentiment || 'neutral';
  const sentConf = sentimentConfig[sentiment] || sentimentConfig.neutral;
  const score = context?.score || 50;
  const RegimeIcon = config.icon;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-market-regime">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5" />
          Market Regime
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn("flex items-center justify-between p-3 rounded-lg border", config.bg, "border-transparent")}>
          <div className="flex items-center gap-2">
            <RegimeIcon className={cn("h-5 w-5", config.color)} />
            <span className={cn("font-bold text-sm", config.color)}>{config.label}</span>
          </div>
          <Badge variant="outline" className={cn("text-xs", sentConf.bg, sentConf.color)}>
            {sentConf.label}
          </Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Trade Score</span>
            <span className={cn("font-mono font-bold",
              score >= 60 ? "text-green-400" : score >= 40 ? "text-amber-400" : "text-red-400"
            )}>{score}/100</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all",
                score >= 60 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"
              )}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        {context?.shouldTrade ? (
          <Badge className="w-full justify-center bg-green-500/20 text-green-400 border-green-500/40">
            <CheckCircle2 className="h-3 w-3 mr-1" /> TRADEABLE CONDITIONS
          </Badge>
        ) : (
          <Badge className="w-full justify-center bg-red-500/20 text-red-400 border-red-500/40">
            <XCircle className="h-3 w-3 mr-1" /> CAUTION ADVISED
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function VolatilityCard() {
  const { data: context, isLoading } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const vix = context?.vixLevel || null;
  const spy = context?.spyData;

  const getVixStatus = (level: number) => {
    if (level < 15) return { label: 'LOW', color: 'text-green-400', bg: 'bg-green-500/20' };
    if (level < 20) return { label: 'NORMAL', color: 'text-amber-400', bg: 'bg-amber-500/20' };
    if (level < 30) return { label: 'ELEVATED', color: 'text-orange-400', bg: 'bg-orange-500/20' };
    return { label: 'EXTREME', color: 'text-red-400', bg: 'bg-red-500/20' };
  };

  const vixStatus = vix ? getVixStatus(vix) : null;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-volatility">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Volatility Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">VIX</span>
            {vix ? (
              <div className="flex items-center gap-2">
                <span className="text-xl font-mono font-bold">{vix.toFixed(1)}</span>
                {vixStatus && (
                  <Badge variant="outline" className={cn("text-[10px]", vixStatus.bg, vixStatus.color)}>
                    {vixStatus.label}
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-lg font-mono text-muted-foreground">--</span>
            )}
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">SPY</span>
            {spy ? (
              <div>
                <span className="text-xl font-mono font-bold">${spy.price.toFixed(2)}</span>
                <div className={cn("text-xs font-mono flex items-center gap-1",
                  spy.change >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {spy.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {spy.change >= 0 ? '+' : ''}{spy.change.toFixed(2)}%
                </div>
              </div>
            ) : (
              <span className="text-lg font-mono text-muted-foreground">--</span>
            )}
          </div>
        </div>
        {spy && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Relative Volume</span>
              <span className={cn("font-mono",
                spy.relativeVolume > 1.2 ? "text-green-400" : 
                spy.relativeVolume < 0.8 ? "text-red-400" : "text-muted-foreground"
              )}>
                {spy.relativeVolume.toFixed(2)}x
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IndexHeatmap() {
  const indices: IndexData[] = [
    { symbol: 'SPY', name: 'S&P 500', price: 0, change: 0, changePercent: 0 },
    { symbol: 'QQQ', name: 'Nasdaq 100', price: 0, change: 0, changePercent: 0 },
    { symbol: 'IWM', name: 'Russell 2000', price: 0, change: 0, changePercent: 0 },
    { symbol: 'BTC', name: 'Bitcoin', price: 0, change: 0, changePercent: 0 },
    { symbol: 'ETH', name: 'Ethereum', price: 0, change: 0, changePercent: 0 },
  ];

  const { data: context } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  if (context?.spyData) {
    indices[0].price = context.spyData.price;
    indices[0].changePercent = context.spyData.change;
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-index-heatmap">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Layers className="h-3.5 w-3.5" />
          Index Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-1.5">
          {indices.map((idx) => {
            const isUp = idx.changePercent >= 0;
            const intensity = Math.min(Math.abs(idx.changePercent) / 3, 1);
            return (
              <div 
                key={idx.symbol}
                className={cn(
                  "p-2 rounded text-center transition-colors",
                  isUp ? `bg-green-500/${Math.max(10, Math.round(intensity * 30))}` : 
                         `bg-red-500/${Math.max(10, Math.round(intensity * 30))}`
                )}
              >
                <div className="text-xs font-bold">{idx.symbol}</div>
                <div className={cn("text-xs font-mono",
                  isUp ? "text-green-400" : "text-red-400"
                )}>
                  {idx.changePercent !== 0 ? (
                    <>{isUp ? '+' : ''}{idx.changePercent.toFixed(2)}%</>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function FuturesBiasPanel() {
  const futuresData = [
    { symbol: 'ES', name: 'S&P 500', bias: 'bullish', level: 5875, target: 5920 },
    { symbol: 'NQ', name: 'Nasdaq', bias: 'bullish', level: 20850, target: 21000 },
    { symbol: 'GC', name: 'Gold', bias: 'neutral', level: 2645, target: 2660 },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-futures-bias">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <LineChart className="h-3.5 w-3.5" />
          Futures Bias
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {futuresData.map((f) => (
          <div key={f.symbol} className="flex items-center justify-between p-2 rounded bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm">{f.symbol}</span>
              <Badge variant="outline" className={cn("text-[10px]",
                f.bias === 'bullish' ? "text-green-400 bg-green-500/10" :
                f.bias === 'bearish' ? "text-red-400 bg-red-500/10" :
                "text-amber-400 bg-amber-500/10"
              )}>
                {f.bias.toUpperCase()}
              </Badge>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono">{f.level.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Target: {f.target.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SignalConfidenceGauge() {
  const { data: context } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const score = context?.score || 50;
  const getScoreLabel = (s: number) => {
    if (s >= 80) return { label: 'STRONG', color: 'text-green-400' };
    if (s >= 60) return { label: 'MODERATE', color: 'text-cyan-400' };
    if (s >= 40) return { label: 'WEAK', color: 'text-amber-400' };
    return { label: 'AVOID', color: 'text-red-400' };
  };
  const scoreInfo = getScoreLabel(score);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-signal-confidence">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Target className="h-3.5 w-3.5" />
          Signal Confidence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center py-2">
          <div className="relative w-24 h-24">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={score >= 60 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444"}
                strokeWidth="3"
                strokeDasharray={`${score}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-mono font-bold">{score}</span>
              <span className="text-[10px] text-muted-foreground">/100</span>
            </div>
          </div>
          <Badge className={cn("mt-2", scoreInfo.color)} variant="outline">
            {scoreInfo.label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function MultiEngineConvergence() {
  const engines = [
    { name: 'AI Claude', signal: 'bullish', confidence: 78 },
    { name: 'Quant RSI', signal: 'bullish', confidence: 72 },
    { name: 'VWAP Flow', signal: 'neutral', confidence: 55 },
    { name: 'Volume', signal: 'bullish', confidence: 81 },
  ];

  const consensus = engines.filter(e => e.signal === 'bullish').length;
  const convergenceScore = Math.round((consensus / engines.length) * 100);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-engine-convergence">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Radio className="h-3.5 w-3.5" />
          Engine Convergence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-mono font-bold">{convergenceScore}%</span>
          <Badge className={cn(
            convergenceScore >= 75 ? "bg-green-500/20 text-green-400" :
            convergenceScore >= 50 ? "bg-amber-500/20 text-amber-400" :
            "bg-red-500/20 text-red-400"
          )}>
            {consensus}/{engines.length} ALIGNED
          </Badge>
        </div>
        <div className="space-y-1.5">
          {engines.map((eng) => (
            <div key={eng.name} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{eng.name}</span>
              <div className="flex items-center gap-2">
                <span className={cn("font-mono",
                  eng.signal === 'bullish' ? "text-green-400" :
                  eng.signal === 'bearish' ? "text-red-400" : "text-amber-400"
                )}>
                  {eng.confidence}%
                </span>
                {eng.signal === 'bullish' && <TrendingUp className="h-3 w-3 text-green-400" />}
                {eng.signal === 'bearish' && <TrendingDown className="h-3 w-3 text-red-400" />}
                {eng.signal === 'neutral' && <MinusCircle className="h-3 w-3 text-amber-400" />}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QuantEnginePanel() {
  const signals: QuantSignals = {
    rsi2: 28,
    rsi14: 45,
    vwapDistance: -0.35,
    zScore: -1.2,
    adxStrength: 32,
    volumeRatio: 1.15,
  };

  const getSignalStatus = (value: number, type: string) => {
    switch (type) {
      case 'rsi2':
        if (value < 10) return { label: 'EXTREME OS', color: 'text-green-400' };
        if (value < 30) return { label: 'OVERSOLD', color: 'text-green-400' };
        if (value > 90) return { label: 'EXTREME OB', color: 'text-red-400' };
        if (value > 70) return { label: 'OVERBOUGHT', color: 'text-red-400' };
        return { label: 'NEUTRAL', color: 'text-muted-foreground' };
      case 'vwap':
        if (value < -0.5) return { label: 'BELOW', color: 'text-red-400' };
        if (value > 0.5) return { label: 'ABOVE', color: 'text-green-400' };
        return { label: 'AT VWAP', color: 'text-amber-400' };
      case 'zscore':
        if (value < -2) return { label: 'MEAN REV BUY', color: 'text-green-400' };
        if (value > 2) return { label: 'MEAN REV SELL', color: 'text-red-400' };
        return { label: 'NORMAL', color: 'text-muted-foreground' };
      case 'adx':
        if (value > 40) return { label: 'STRONG TREND', color: 'text-cyan-400' };
        if (value > 25) return { label: 'TRENDING', color: 'text-amber-400' };
        return { label: 'RANGING', color: 'text-muted-foreground' };
      default:
        return { label: '--', color: 'text-muted-foreground' };
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-quant-engine">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5" />
          Quant Engine Signals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">RSI(2)</div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-mono font-bold">{signals.rsi2}</span>
              <Badge variant="outline" className={cn("text-[10px]", getSignalStatus(signals.rsi2, 'rsi2').color)}>
                {getSignalStatus(signals.rsi2, 'rsi2').label}
              </Badge>
            </div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">VWAP Dist</div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-mono font-bold">{signals.vwapDistance.toFixed(2)}%</span>
              <Badge variant="outline" className={cn("text-[10px]", getSignalStatus(signals.vwapDistance, 'vwap').color)}>
                {getSignalStatus(signals.vwapDistance, 'vwap').label}
              </Badge>
            </div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Z-Score</div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-mono font-bold">{signals.zScore.toFixed(2)}</span>
              <Badge variant="outline" className={cn("text-[10px]", getSignalStatus(signals.zScore, 'zscore').color)}>
                {getSignalStatus(signals.zScore, 'zscore').label}
              </Badge>
            </div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">ADX</div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-mono font-bold">{signals.adxStrength}</span>
              <Badge variant="outline" className={cn("text-[10px]", getSignalStatus(signals.adxStrength, 'adx').color)}>
                {getSignalStatus(signals.adxStrength, 'adx').label}
              </Badge>
            </div>
          </div>
        </div>
        <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Volume Ratio</span>
          <span className={cn("font-mono font-bold",
            signals.volumeRatio > 1.5 ? "text-green-400" :
            signals.volumeRatio > 1 ? "text-cyan-400" : "text-muted-foreground"
          )}>
            {signals.volumeRatio.toFixed(2)}x
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AIEngineStatus() {
  const engines: EngineStatus[] = [
    { name: 'Claude Sonnet', status: 'online', accuracy: 72 },
    { name: 'GPT-4', status: 'online', accuracy: 68 },
    { name: 'Gemini', status: 'online', accuracy: 65 },
    { name: 'Quant Engine', status: 'online', accuracy: 71 },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-ai-engine-status">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Brain className="h-3.5 w-3.5" />
          AI Engine Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {engines.map((eng) => (
          <div key={eng.name} className="flex items-center justify-between p-2 rounded bg-muted/30">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full",
                eng.status === 'online' ? "bg-green-500" :
                eng.status === 'degraded' ? "bg-amber-500" : "bg-red-500"
              )} />
              <span className="text-sm">{eng.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {eng.accuracy && (
                <span className="text-xs font-mono text-muted-foreground">{eng.accuracy}% acc</span>
              )}
              <Badge variant="outline" className={cn("text-[10px]",
                eng.status === 'online' ? "text-green-400" :
                eng.status === 'degraded' ? "text-amber-400" : "text-red-400"
              )}>
                {eng.status.toUpperCase()}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function BotActivityMonitor() {
  const { data: botStatus, isLoading } = useQuery<{
    isRunning: boolean;
    openPositions: number;
    todayTrades: number;
    todayPnL: number;
    lastAction?: string;
  }>({
    queryKey: ['/api/auto-lotto/bot-status'],
    refetchInterval: 10000,
  });

  const isRunning = botStatus?.isRunning ?? false;
  const openPositions = botStatus?.openPositions ?? 0;
  const todayTrades = botStatus?.todayTrades ?? 0;
  const todayPnL = botStatus?.todayPnL ?? 0;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-bot-monitor">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" />
          Auto-Lotto Bot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full",
              isRunning ? "bg-green-500 animate-pulse" : "bg-red-500"
            )} />
            <span className="font-medium">{isRunning ? 'ACTIVE' : 'PAUSED'}</span>
          </div>
          <Link href="/automations">
            <Button size="sm" variant="outline" className="text-xs h-7">
              Open <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Open</div>
            <div className="text-lg font-mono font-bold">{openPositions}</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Today</div>
            <div className="text-lg font-mono font-bold">{todayTrades}</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">P&L</div>
            <div className={cn("text-lg font-mono font-bold",
              todayPnL >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {todayPnL >= 0 ? '+' : ''}{todayPnL.toFixed(0)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLinks() {
  const links = [
    { label: 'Trade Desk', href: '/trade-desk', icon: Target },
    { label: 'Automations', href: '/automations', icon: Zap },
    { label: 'Journal', href: '/journal', icon: BarChart3 },
    { label: 'Analytics', href: '/analytics', icon: LineChart },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-quick-links">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Flame className="h-3.5 w-3.5" />
          Quick Access
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8 hover-elevate">
                <link.icon className="h-3.5 w-3.5 mr-2" />
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TradingSessionCard() {
  const { data: context } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const sessionLabels: Record<string, { label: string; color: string }> = {
    pre_market: { label: 'Pre-Market', color: 'text-purple-400' },
    opening_drive: { label: 'Opening Drive', color: 'text-cyan-400' },
    mid_morning: { label: 'Mid-Morning', color: 'text-green-400' },
    lunch_lull: { label: 'Lunch Lull', color: 'text-amber-400' },
    afternoon: { label: 'Afternoon', color: 'text-cyan-400' },
    power_hour: { label: 'Power Hour', color: 'text-orange-400' },
    after_hours: { label: 'After Hours', color: 'text-slate-400' },
  };

  const session = context?.tradingSession || 'after_hours';
  const sessionInfo = sessionLabels[session] || sessionLabels.after_hours;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-trading-session">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Trading Session
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <span className={cn("text-lg font-bold", sessionInfo.color)}>{sessionInfo.label}</span>
            <div className="text-xs text-muted-foreground mt-1">
              {format(new Date(), 'h:mm a')} CT
            </div>
          </div>
          <Timer className={cn("h-8 w-8 opacity-50", sessionInfo.color)} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { refetch } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1800px] mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Command Center
            </h1>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} • Institutional Research Dashboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              data-testid="button-refresh-dashboard"
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
            <Link href="/trade-desk">
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs" data-testid="link-trade-desk">
                Trade Desk
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">
              <Eye className="h-3 w-3 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="signals" className="text-xs" data-testid="tab-signals">
              <Radio className="h-3 w-3 mr-1" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="engines" className="text-xs" data-testid="tab-engines">
              <Cpu className="h-3 w-3 mr-1" />
              Engines
            </TabsTrigger>
            <TabsTrigger value="performance" className="text-xs" data-testid="tab-performance">
              <Target className="h-3 w-3 mr-1" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="trading" className="text-xs" data-testid="tab-trading">
              <Zap className="h-3 w-3 mr-1" />
              Trading
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <MarketRegimeCard />
              <VolatilityCard />
              <SignalConfidenceGauge />
              <TradingSessionCard />
              <QuickLinks />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <IndexHeatmap />
              <FuturesBiasPanel />
              <BotActivityMonitor />
            </div>
          </TabsContent>

          <TabsContent value="signals" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <SignalConfidenceGauge />
              <MultiEngineConvergence />
              <MarketRegimeCard />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 col-span-1 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    AI Consensus Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-6">
                    <div className="text-center">
                      <Badge className="bg-green-500/20 text-green-400 text-lg px-4 py-1 mb-2">
                        BULLISH BIAS
                      </Badge>
                      <p className="text-sm text-muted-foreground max-w-md">
                        3/4 engines showing bullish signals. Strong convergence on momentum plays. 
                        RSI(2) indicates mean reversion opportunity. Volume supporting upside continuation.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="engines" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <QuantEnginePanel />
              <AIEngineStatus />
              <FuturesBiasPanel />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <MultiEngineConvergence />
              <VolatilityCard />
            </div>
          </TabsContent>

          <TabsContent value="performance" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <WinRateWidget />
              <ExpiryPatternInsights />
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    Risk Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Max Drawdown</span>
                    <span className="font-mono text-red-400">-$45</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Win</span>
                    <span className="font-mono text-green-400">+$28</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Loss</span>
                    <span className="font-mono text-red-400">-$12</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Risk/Reward</span>
                    <span className="font-mono text-cyan-400">2.3:1</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trading" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <BotActivityMonitor />
              <TradingSessionCard />
              <QuickLinks />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Paper Portfolios
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { name: 'Options Portfolio', balance: 300, pnl: 0 },
                      { name: 'Futures Portfolio', balance: 300, pnl: 0 },
                      { name: 'Crypto Portfolio', balance: 300, pnl: 0 },
                      { name: 'Small Account', balance: 150, pnl: 0 },
                    ].map((p) => (
                      <div key={p.name} className="flex items-center justify-between p-2 rounded bg-muted/30">
                        <span className="text-sm">{p.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono">${p.balance}</span>
                          <span className={cn("text-xs font-mono",
                            p.pnl >= 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {p.pnl >= 0 ? '+' : ''}{p.pnl.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    Alerts Center
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                      <span className="text-xs text-amber-400">VIX elevated - reduce position size</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                      <span className="text-xs text-green-400">All engines operational</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                      <Zap className="h-4 w-4 text-cyan-400" />
                      <span className="text-xs text-cyan-400">3 new trade ideas generated</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
