/**
 * Command Center - Unified Trading Hub
 * 
 * Consolidated view with:
 * - Symbol analysis with confluence validation
 * - Trading bots management (Options, Futures, Crypto, Small Account)
 * - Positions dashboard
 * - Market scanner quick access
 * - Risk settings
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Target, TrendingUp, TrendingDown, Search, RefreshCw, Loader2,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight, Flame,
  BarChart3, Activity, Zap, DollarSign, LineChart, Bitcoin,
  Settings, Rocket, Bot, Shield, Save, RotateCcw,
  Crosshair, Layers, Timer, Gauge
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { format } from "date-fns";
import { MarketOverviewWidget } from "@/components/market-overview-widget";
import { WinRateWidget } from "@/components/win-rate-widget";
import { IVRankWidget } from "@/components/iv-rank-widget";
import { AutoLottoDashboard } from "@/components/auto-lotto-dashboard";
import { ExpiryPatternInsights } from "@/components/expiry-pattern-insights";
import { 
  ConfluenceInsights, 
  TechnicalInsights, 
  PositionSizeCalculator,
  MarketContextInsights,
  NewsInsights
} from "@/components/contextual-insights";
import { DataStatusBanner } from "@/components/data-status-banner";
import { BullishPatternWidget, SectorHeatWidget } from "@/components/bullish-pattern-widget";
import { AnalysisHub } from "@/components/analysis-hub";
import { SixEnginePanel } from "@/components/six-engine-panel";
import { MarketSentimentDashboard } from "@/components/market-sentiment-dashboard";

interface TradingEngineResult {
  symbol: string;
  assetClass: string;
  timestamp: string;
  actionable: boolean;
  summary: string;
  confluence: {
    score: number;
    alignment: 'strong' | 'moderate' | 'weak' | 'conflict';
    fundamentalBias: string;
    technicalBias: string;
    isValid: boolean;
    recommendation: string;
    warnings: string[];
    checks: { name: string; passed: boolean; detail: string }[];
  };
  fundamental: {
    asset: string;
    symbol: string;
    bias: string;
    conviction: number;
    drivers: string[];
    catalysts: string[];
    risks: string[];
    timeHorizon: string;
  };
  technical: {
    trend: {
      direction: string;
      strength: string;
      movingAverages: {
        sma20: number;
        sma50: number;
        sma200: number;
      };
    };
    momentum: {
      rsi14: number;
      condition: string;
    };
    volatility: {
      atr14: number;
      atrPercent: number;
      regime: string;
      compression: boolean;
    };
    levels: {
      currentPrice: number;
      support: number[];
      resistance: number[];
      pivotPoint: number;
    };
  };
  tradeStructure: {
    direction: string;
    entry: { price: number; type: string; rationale: string };
    stop: { price: number; type: string; rationale: string };
    targets: { price: number; probability: number; rationale: string }[];
    riskReward: number;
    positionSize: { riskPercent: number; shares: number; dollarRisk: number };
    structure: string;
    timeframe: string;
    invalidation: string;
  } | null;
  volatilityContext: {
    ivRank: number;
    currentIV: number;
    realizedVol20: number;
    recommendation: string;
  } | null;
  marketContext: {
    regime: string;
    riskSentiment: string;
    shouldTrade: boolean;
  };
  newsContext?: {
    hasRecentNews: boolean;
    sentimentScore: number;
    sentimentLabel: string;
    newsBias: 'bullish' | 'bearish' | 'neutral';
    topHeadlines: string[];
    keyTopics: string[];
    catalysts: string[];
    convictionAdjustment: number;
    earningsDetected: boolean;
    earningsBeat: boolean | null;
    warnings: string[];
  } | null;
}

type AssetClass = 'stock' | 'options' | 'futures' | 'crypto';

// Bot Status Display Component - Aurora Grid Style
function BotCard({ 
  title, 
  subtitle, 
  icon: Icon, 
  iconColor, 
  borderColor, 
  capital, 
  pnl, 
  openPositions, 
  winRate 
}: {
  title: string;
  subtitle: string;
  icon: any;
  iconColor: string;
  borderColor: string;
  capital: number;
  pnl: number;
  openPositions: number;
  winRate: string;
}) {
  return (
    <Card className={cn(
      "bg-slate-900/50 backdrop-blur-xl border-slate-700/30 hover:border-slate-600/50 transition-all duration-300",
      "shadow-[0_0_30px_-10px_rgba(34,211,238,0.06)] hover:shadow-[0_0_40px_-10px_rgba(34,211,238,0.12)]"
    )} data-testid={`card-${title.toLowerCase().replace(' ', '-')}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2.5 rounded-lg border backdrop-blur-sm",
              iconColor.replace('text-', 'bg-').replace('400', '500/15'),
              iconColor.replace('text-', 'border-').replace('400', '500/25'),
              "shadow-[0_0_15px_-5px_currentColor]"
            )}>
              <Icon className={cn("w-5 h-5", iconColor)} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">{title}</h3>
              <p className="text-[10px] text-slate-400 font-mono tracking-wide">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/15 border border-green-500/25">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
            <span className="text-[10px] font-bold text-green-400 tracking-wide">LIVE</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Capital</p>
            <p className={cn("text-xl font-bold font-mono", iconColor)}>${capital}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">P&L</p>
            <p className={cn("text-xl font-bold font-mono", pnl >= 0 ? "text-green-400" : "text-red-400")}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
          <span>Open: <span className="text-slate-200">{openPositions}</span></span>
          <span>Win: <span className="text-slate-200">{winRate}%</span></span>
        </div>
      </CardContent>
    </Card>
  );
}

// Compact Bot Activity Monitor for sidebar
function BotActivityMonitor() {
  const { data: botStatus } = useQuery<{
    isRunning: boolean;
    openPositions: number;
    todayTrades: number;
    todayPnL: number;
    marketStatus: string;
  }>({
    queryKey: ['/api/auto-lotto/bot-status'],
    refetchInterval: 30000, // Fixed: was 10s, now 30s to prevent flickering
  });

  const isMarketOpen = botStatus?.isRunning ?? false;
  const openPositions = botStatus?.openPositions ?? 0;
  const todayTrades = botStatus?.todayTrades ?? 0;
  const todayPnL = botStatus?.todayPnL ?? 0;
  
  const getStatusDisplay = () => {
    if (isMarketOpen) {
      return { label: 'SCANNING', textColor: 'text-green-400' };
    }
    return { label: 'MARKET CLOSED', textColor: 'text-amber-400' };
  };
  
  const status = getStatusDisplay();

  return (
    <Card className="bg-card/70 backdrop-blur-xl border-border/60 shadow-2xl overflow-hidden" data-testid="card-bot-monitor">
      <div className="h-1 bg-muted">
        <div 
          className={cn("h-full transition-all duration-1000", isMarketOpen ? "bg-primary w-full animate-pulse" : "bg-muted-foreground/30 w-0")} 
        />
      </div>
      <CardHeader className="pb-2 border-b border-border/50 mb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-tighter flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Auto-Execution Engine
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px] font-mono", status.textColor)}>
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-md bg-muted/40 border border-border/30">
            <div className="text-[10px] text-muted-foreground uppercase font-semibold">Active</div>
            <div className="text-2xl font-mono font-bold">{openPositions}</div>
          </div>
          <div className="p-3 rounded-md bg-muted/40 border border-border/30">
            <div className="text-[10px] text-muted-foreground uppercase font-semibold">Volume</div>
            <div className="text-2xl font-mono font-bold">{todayTrades}</div>
          </div>
          <div className="p-3 rounded-md bg-muted/40 border border-border/30">
            <div className="text-[10px] text-muted-foreground uppercase font-semibold">P&L</div>
            <div className={cn("text-2xl font-mono font-bold",
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

// ML Intelligence Widget - Consolidated from ml-intelligence.tsx
function MLIntelligenceWidget() {
  const { data: status } = useQuery<{
    isActive: boolean;
    modelsLoaded: {
      pricePredictor: boolean;
      sentimentAnalyzer: boolean;
      patternRecognizer: boolean;
      positionSizer: boolean;
      regimeDetector: boolean;
    };
    cacheStats: {
      predictions: number;
      sentiments: number;
      regimes: number;
    };
    version: string;
  }>({
    queryKey: ['/api/ml/status'],
    refetchInterval: 30000,
  });

  const { data: regime } = useQuery<{
    regime: string;
    confidence: number;
    riskLevel: string;
    recommendedStrategies: string[];
  }>({
    queryKey: ['/api/ml/regime'],
    refetchInterval: 60000,
  });

  const { data: scan } = useQuery<{ scanned: number; signals: Array<{
    symbol: string;
    recommendation: string;
    compositeScore: number;
    direction: string;
    confidence: number;
  }> }>({
    queryKey: ['/api/ml/scan'],
    refetchInterval: 300000,
  });

  const modelsLoaded = status?.modelsLoaded ? Object.values(status.modelsLoaded).filter(Boolean).length : 0;
  const topSignals = scan?.signals?.slice(0, 5) || [];

  const getRegimeColor = (r: string) => {
    if (r?.includes('bull')) return 'text-green-400';
    if (r?.includes('bear')) return 'text-red-400';
    if (r?.includes('high_volatility')) return 'text-amber-400';
    return 'text-slate-400';
  };

  const getRiskColor = (level: string) => {
    if (level === 'low') return 'bg-green-500/15 text-green-400 border-green-500/30';
    if (level === 'medium') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    if (level === 'high') return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    if (level === 'extreme') return 'bg-red-500/15 text-red-400 border-red-500/30';
    return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  };

  return (
    <Card className="bg-gradient-to-br from-purple-500/5 to-slate-900/50 backdrop-blur-xl border-purple-500/20 shadow-[0_0_30px_-10px_rgba(168,85,247,0.2)]" data-testid="card-ml-intelligence">
      <CardHeader className="pb-2 border-b border-purple-500/20 mb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-purple-400 uppercase tracking-tighter flex items-center gap-2">
            <Layers className="h-4 w-4" />
            ML Intelligence
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px] font-mono", status?.isActive ? "text-green-400" : "text-amber-400")}>
            {status?.isActive ? 'ACTIVE' : 'LOADING'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* System Status Row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Models</div>
            <div className="text-lg font-mono font-bold text-purple-400">{modelsLoaded}/5</div>
          </div>
          <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Cache</div>
            <div className="text-lg font-mono font-bold text-slate-300">{status?.cacheStats?.predictions || 0}</div>
          </div>
        </div>

        {/* Market Regime */}
        {regime && (
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wide">Regime</span>
              <Badge className={cn("text-[10px]", getRiskColor(regime.riskLevel))}>
                {regime.riskLevel?.toUpperCase() || 'UNKNOWN'}
              </Badge>
            </div>
            <div className={cn("text-sm font-semibold capitalize", getRegimeColor(regime.regime))}>
              {regime.regime?.replace(/_/g, ' ') || 'Analyzing...'}
            </div>
          </div>
        )}

        {/* Top ML Signals */}
        {topSignals.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Top Signals</div>
            {topSignals.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-800/30 border border-slate-700/20">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm">{s.symbol}</span>
                  {s.direction === 'bullish' && <TrendingUp className="w-3 h-3 text-green-400" />}
                  {s.direction === 'bearish' && <TrendingDown className="w-3 h-3 text-red-400" />}
                </div>
                <Badge variant="outline" className={cn("text-[10px]",
                  s.recommendation === 'strong_buy' ? "text-green-400" :
                  s.recommendation === 'buy' ? "text-green-300" :
                  s.recommendation === 'sell' ? "text-red-300" :
                  s.recommendation === 'strong_sell' ? "text-red-400" : "text-slate-400"
                )}>
                  {s.confidence?.toFixed(0)}%
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Scanned Count */}
        {scan?.scanned && (
          <div className="text-[10px] text-center text-slate-500 font-mono">
            {scan.scanned} symbols scanned
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaperPortfolios() {
  const { data: portfolios } = useQuery<Array<{
    id: string;
    name: string;
    cashBalance: number;
    startingCapital: number;
    totalValue: number;
    totalPnL: number;
    totalPnLPercent: number;
  }>>({
    queryKey: ['/api/paper-portfolios'],
    refetchInterval: 30000,
  });

  const portfolioList = portfolios || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-paper-portfolios">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Paper Portfolios
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {portfolioList.length > 0 ? portfolioList.map((p) => {
            const totalValue = typeof p.totalValue === 'number' ? p.totalValue : parseFloat(String(p.totalValue)) || 0;
            const starting = typeof p.startingCapital === 'number' ? p.startingCapital : parseFloat(String(p.startingCapital)) || 0;
            const pnlPct = typeof p.totalPnLPercent === 'number' ? p.totalPnLPercent : (starting > 0 ? ((totalValue - starting) / starting) * 100 : 0);
            return (
              <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">${totalValue.toFixed(0)}</span>
                  <Badge variant="outline" className={cn("text-xs",
                    pnlPct >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            );
          }) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No portfolios found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface HotSymbol {
  symbol: string;
  heatScore: number;
  distinctSources: number;
  recentTouches1h: number;
  recentTouches24h: number;
  convergenceLevel: number;
  sources: string[];
}

function HotSymbolsWidget({ onSelectSymbol }: { onSelectSymbol: (symbol: string) => void }) {
  const { data: hotSymbols } = useQuery<HotSymbol[]>({
    queryKey: ['/api/attention/hot-symbols'],
    refetchInterval: 30000,
  });

  const symbols = hotSymbols?.slice(0, 10) || [];

  return (
    <Card className="bg-card/70 backdrop-blur-xl border-border/60 shadow-2xl" data-testid="card-hot-symbols">
      <CardHeader className="pb-2 border-b border-border/50 mb-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-tighter flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400 animate-pulse" />
          Attention Convergence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {symbols.map((s) => (
            <button
              key={s.symbol}
              onClick={() => onSelectSymbol(s.symbol)}
              className={cn(
                "flex flex-col gap-1 p-3 rounded-md transition-all duration-200 text-left border border-border/30 bg-muted/30 hover:bg-muted/50 hover:border-primary/40",
                s.convergenceLevel >= 2 && "border-amber-500/40 bg-amber-500/5"
              )}
              data-testid={`hot-symbol-${s.symbol}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-base tracking-tight">{s.symbol}</span>
                {s.convergenceLevel >= 2 && (
                  <Badge variant="outline" className="text-[10px] h-4 text-amber-400 border-amber-400/50 px-1 font-mono uppercase">
                    HIGH
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="flex gap-1">
                  {s.sources.slice(0, 3).map((source, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/50" title={source} />
                  ))}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">{s.heatScore.toFixed(0)}pts</span>
              </div>
            </button>
          ))}
        </div>
        {symbols.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6 font-mono">
            Scanning for convergence...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FundamentalPanel({ data }: { data: TradingEngineResult['fundamental'] }) {
  const getBiasColor = (bias: string) => {
    if (bias === 'bullish') return 'text-green-400';
    if (bias === 'bearish') return 'text-red-400';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-400" />
          Fundamental Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Bias</span>
          <Badge variant="outline" className={cn("text-xs", getBiasColor(data.bias))}>
            {data.bias.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Conviction</span>
          <span className="text-sm font-mono">{data.conviction}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Time Horizon</span>
          <span className="text-sm">{data.timeHorizon}</span>
        </div>
        {data.drivers.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2">Key Drivers</div>
            <div className="flex flex-wrap gap-1">
              {data.drivers.slice(0, 3).map((d, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{d}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TechnicalPanel({ data, symbol }: { data: TradingEngineResult['technical']; symbol: string }) {
  const getTrendColor = (direction: string) => {
    if (direction === 'bullish' || direction === 'up') return 'text-green-400';
    if (direction === 'bearish' || direction === 'down') return 'text-red-400';
    return 'text-muted-foreground';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-400" />
          Technical Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Trend</span>
          <Badge variant="outline" className={cn("text-xs", getTrendColor(data.trend.direction))}>
            {data.trend.direction.toUpperCase()} ({data.trend.strength})
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">RSI(14)</span>
          <span className={cn("text-sm font-mono", 
            data.momentum.rsi14 > 70 ? "text-red-400" : 
            data.momentum.rsi14 < 30 ? "text-green-400" : "text-foreground"
          )}>
            {data.momentum.rsi14.toFixed(1)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">ATR%</span>
          <span className="text-sm font-mono">{data.volatility.atrPercent.toFixed(2)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Regime</span>
          <Badge variant="secondary" className="text-[10px]">
            {data.volatility.regime}
          </Badge>
        </div>
        <div className="pt-2 border-t border-border/50">
          <div className="text-xs text-muted-foreground mb-2">Key Levels</div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-mono">${data.levels.currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pivot:</span>
              <span className="font-mono">${data.levels.pivotPoint.toFixed(2)}</span>
            </div>
            {data.levels.support[0] && (
              <div className="flex justify-between">
                <span className="text-green-400">S1:</span>
                <span className="font-mono">${data.levels.support[0].toFixed(2)}</span>
              </div>
            )}
            {data.levels.resistance[0] && (
              <div className="flex justify-between">
                <span className="text-red-400">R1:</span>
                <span className="font-mono">${data.levels.resistance[0].toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
        
        <TechnicalInsights
          currentPrice={data.levels.currentPrice}
          resistance={data.levels.resistance[0] || data.levels.currentPrice * 1.05}
          support={data.levels.support[0] || data.levels.currentPrice * 0.95}
          atrPercent={data.volatility.atrPercent}
          trend={data.trend.direction}
          trendStrength={data.trend.strength}
          rsi={data.momentum.rsi14}
          symbol={symbol}
        />
      </CardContent>
    </Card>
  );
}

function TradeStructurePanel({ data, symbol }: { data: NonNullable<TradingEngineResult['tradeStructure']>; symbol: string }) {
  return (
    <Card className="bg-gradient-to-br from-green-500/5 to-transparent border-green-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-green-400" />
          Trade Structure
          <Badge className="bg-green-500 text-green-950 text-[10px]">ACTIONABLE</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-[10px] text-muted-foreground uppercase">Entry</div>
            <div className="text-lg font-mono font-bold text-green-400">${data.entry.price.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">{data.entry.type}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-[10px] text-muted-foreground uppercase">Stop</div>
            <div className="text-lg font-mono font-bold text-red-400">${data.stop.price.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">{data.stop.type}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-[10px] text-muted-foreground uppercase">Target</div>
            <div className="text-lg font-mono font-bold text-cyan-400">
              ${data.targets[0]?.price.toFixed(2) || '--'}
            </div>
            <div className="text-[10px] text-muted-foreground">{data.targets[0]?.probability || 0}% prob</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">R:R Ratio</div>
              <div className="text-xl font-mono font-bold">{data.riskReward.toFixed(2)}:1</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-[10px] text-muted-foreground uppercase">Direction</div>
              <Badge variant="outline" className={cn("text-xs",
                data.direction === 'long' ? "text-green-400" : "text-red-400"
              )}>
                {data.direction.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase">Timeframe</div>
            <div className="text-sm font-medium">{data.timeframe}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewsPanelWithInsights({ data, symbol, currentPrice }: { 
  data: NonNullable<TradingEngineResult['newsContext']>; 
  symbol: string;
  currentPrice: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          News & Sentiment
          <Badge variant="outline" className={cn("text-xs",
            data.newsBias === 'bullish' ? "text-green-400" : 
            data.newsBias === 'bearish' ? "text-red-400" : "text-muted-foreground"
          )}>
            {data.sentimentLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.topHeadlines.length > 0 && (
          <div className="space-y-2">
            {data.topHeadlines.slice(0, 3).map((h, i) => (
              <div key={i} className="text-sm text-muted-foreground line-clamp-2">• {h}</div>
            ))}
          </div>
        )}
        
        <NewsInsights
          sentimentScore={data.sentimentScore}
          sentimentLabel={data.sentimentLabel}
          newsBias={data.newsBias}
          symbol={symbol}
          topHeadlines={data.topHeadlines}
          catalysts={data.catalysts || []}
          currentPrice={currentPrice}
        />
      </CardContent>
    </Card>
  );
}

function AnalysisResults({ symbol, assetClass }: { symbol: string; assetClass: AssetClass }) {
  const { data, isLoading, error, refetch } = useQuery<TradingEngineResult>({
    queryKey: ['/api/trading-engine', symbol],
    enabled: !!symbol,
    staleTime: 60000,
  });

  const { data: lossData } = useQuery<{
    shouldAvoid: boolean;
    lossStreak: number;
    confidenceBoost: number;
    recentLosses: any[];
  }>({
    queryKey: ['/api/loss-analyzer/symbol-status', symbol],
    enabled: !!symbol,
  });

  const { data: marketCtx } = useQuery<{
    tradingSession: string;
    regime: string;
    shouldTrade: boolean;
    vixLevel: number | null;
    riskSentiment: string;
  }>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-border/50 backdrop-blur-md h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </Card>
        <Card className="bg-card/50 border-border/50 backdrop-blur-md h-64 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        </Card>
      </div>
    );
  }

  if (!symbol) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30">
        <CardContent className="py-16 text-center">
          <div className="p-5 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 rounded-2xl border border-cyan-500/20 w-fit mx-auto mb-6">
            <Search className="h-10 w-10 text-cyan-400/60" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-slate-300">Enter a Symbol to Begin</h3>
          <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto">
            The 6-engine analysis will provide ML, AI, Quant, Flow, Sentiment & Technical insights for any ticker.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-card/80 border-red-500/30 backdrop-blur-xl">
        <CardContent className="py-16 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400 animate-pulse" />
          <h3 className="text-xl font-bold mb-2">Engine Execution Fault</h3>
          <p className="text-muted-foreground font-mono text-sm max-w-md mx-auto">
            The quantitative engine failed to synthesize data for {symbol}. 
            Check API connectivity and market data availability.
          </p>
          <Button variant="outline" size="sm" className="mt-8" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            RESET ENGINE
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getAlignmentColor = (alignment: string) => {
    if (alignment === 'strong') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (alignment === 'moderate') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (alignment === 'conflict') return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-muted text-muted-foreground';
  };

  const hasLossHistory = lossData && (lossData.shouldAvoid || lossData.lossStreak > 0 || lossData.confidenceBoost < 0);
  
  return (
    <div className="space-y-6">
      {hasLossHistory && (
        <Card className={cn(
          "border-2",
          lossData?.shouldAvoid 
            ? "bg-red-500/10 border-red-500/50" 
            : "bg-amber-500/10 border-amber-500/50"
        )}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className={cn(
                "h-5 w-5 mt-0.5",
                lossData?.shouldAvoid ? "text-red-400" : "text-amber-400"
              )} />
              <div className="flex-1">
                <h4 className={cn(
                  "font-bold text-sm",
                  lossData?.shouldAvoid ? "text-red-400" : "text-amber-400"
                )}>
                  {lossData?.shouldAvoid ? "SYMBOL BLOCKED - Loss Cooldown Active" : "Loss History Detected"}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {lossData?.shouldAvoid 
                    ? `This symbol has ${lossData.lossStreak} consecutive losses and is on cooldown.`
                    : `${symbol} has ${lossData?.lossStreak || 0} recent losses. Confidence penalty applied.`
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <SixEnginePanel
        symbol={symbol}
        assetClass={assetClass}
        currentPrice={data.technical?.levels?.currentPrice}
        quantScore={typeof data.confluence?.score === 'number' ? data.confluence.score : undefined}
        aiScore={typeof data.confluence?.score === 'number' ? Math.round((data.confluence.score + (typeof data.fundamental?.conviction === 'number' ? data.fundamental.conviction : 50)) / 2) : undefined}
        sentimentScore={typeof data.newsContext?.sentimentScore === 'number' ? Math.round(data.newsContext.sentimentScore * 100) : undefined}
        technicalScore={typeof data.technical?.momentum?.rsi14 === 'number' ? (data.technical.momentum.rsi14 > 50 ? Math.round(60 + (data.technical.momentum.rsi14 - 50) * 0.5) : Math.round(40 + (data.technical.momentum.rsi14) * 0.3)) : undefined}
      />
      
      <Card className={cn(
        "bg-card/80 backdrop-blur-2xl border-border/60 shadow-2xl overflow-hidden transition-all duration-500",
        data.actionable ? "ring-1 ring-green-500/20 shadow-green-500/5" : ""
      )}>
        <div className={cn("h-1", data.actionable ? "bg-green-500" : "bg-muted")}></div>
        <CardHeader className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-4xl font-bold font-mono tracking-tighter">{data.symbol}</h2>
                <Badge variant="outline" className="text-[10px] font-mono uppercase">{data.assetClass}</Badge>
                {data.actionable && (
                  <Badge className="bg-green-500 text-green-950 font-bold px-2 py-0.5 animate-pulse">
                    READY
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed mt-2">{data.summary}</p>
            </div>
            <div className="flex items-center gap-4 bg-muted/40 p-4 rounded-xl border border-border/30 backdrop-blur-md">
              <div className="text-right">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Confluence</div>
                <div className={cn("text-3xl font-bold font-mono tabular-nums", 
                  data.confluence.score >= 80 ? "text-green-400" : 
                  data.confluence.score >= 60 ? "text-amber-400" : "text-red-400"
                )}>
                  {data.confluence.score}%
                </div>
              </div>
              <div className={cn("w-12 h-12 rounded-full border-2 flex items-center justify-center", 
                getAlignmentColor(data.confluence.alignment).split(' ')[2]
              )}>
                <Zap className={cn("h-6 w-6", getAlignmentColor(data.confluence.alignment).split(' ')[1])} />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-primary" />
                Execution Checkmarks
              </h4>
              <div className="space-y-3 bg-muted/30 p-4 rounded-lg border border-border/20">
                {data.confluence.checks.map((check, i) => (
                  <div key={i} className="flex items-start gap-3 group">
                    <div className={cn(
                      "mt-1 p-0.5 rounded-full transition-colors",
                      check.passed ? "bg-green-500/20" : "bg-red-500/20"
                    )}>
                      {check.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] font-bold uppercase tracking-tight">{check.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {data.confluence.warnings.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  Risk Advisories
                </h4>
                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg space-y-2">
                  {data.confluence.warnings.map((w, i) => (
                    <div key={i} className="flex gap-2 text-xs text-amber-200/70 leading-snug">
                      <span className="text-amber-500">•</span>
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <ConfluenceInsights
            score={data.confluence.score}
            fundamentalBias={data.confluence.fundamentalBias}
            technicalBias={data.confluence.technicalBias}
            rsi={data.technical.momentum.rsi14}
            atrPercent={data.technical.volatility.atrPercent}
            resistance={data.technical.levels.resistance[0] || data.technical.levels.currentPrice * 1.05}
            support={data.technical.levels.support[0] || data.technical.levels.currentPrice * 0.95}
            currentPrice={data.technical.levels.currentPrice}
            trend={data.technical.trend.direction}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FundamentalPanel data={data.fundamental} />
        <TechnicalPanel data={data.technical} symbol={symbol} />
      </div>

      {data.newsContext && (
        <NewsPanelWithInsights 
          data={data.newsContext} 
          symbol={symbol}
          currentPrice={data.technical.levels.currentPrice}
        />
      )}

      {data.tradeStructure && <TradeStructurePanel data={data.tradeStructure} symbol={symbol} />}
      
      {marketCtx && (
        <MarketContextInsights
          tradingSession={marketCtx.tradingSession || 'unknown'}
          regime={marketCtx.regime}
          shouldTrade={marketCtx.shouldTrade}
          vixLevel={marketCtx.vixLevel}
          riskSentiment={(marketCtx.riskSentiment as 'risk_on' | 'risk_off' | 'neutral') || 'neutral'}
        />
      )}
      
      <AnalysisHub 
        symbol={symbol}
        assetClass={assetClass as 'stock' | 'options' | 'futures' | 'crypto'}
        currentPrice={data.technical.levels.currentPrice}
        confidenceScore={data.confluence.score}
        direction={data.tradeStructure?.direction === 'short' ? 'short' : 'long'}
        quantScore={data.confluence.score}
        aiScore={data.newsContext?.sentimentScore ? data.newsContext.sentimentScore * 100 : 60}
        historicalWinRate={55}
      />
    </div>
  );
}

// Trading Bots Overview Tab Content
function BotsOverviewTab() {
  const { data: botData } = useQuery<{
    portfolio: { startingCapital: number; totalPnL: number };
    futuresPortfolio: { startingCapital: number; totalPnL: number; openPositions: number; winRate: string };
    cryptoPortfolio: { startingCapital: number; totalPnL: number; openPositions: number; winRate: string };
    stats: { openPositions: number; winRate: string };
  }>({
    queryKey: ['/api/auto-lotto/dashboard-data'],
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6">
      {/* Quick Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <MarketOverviewWidget />
        <ExpiryPatternInsights />
        <WinRateWidget />
      </div>
      
      {/* 4 Main Portfolio Bots */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <BotCard
          title="Options Bot"
          subtitle="US Market Hours"
          icon={TrendingUp}
          iconColor="text-cyan-400"
          borderColor="border-cyan-500/30"
          capital={botData?.portfolio?.startingCapital || 300}
          pnl={botData?.portfolio?.totalPnL || 0}
          openPositions={botData?.stats?.openPositions || 0}
          winRate={botData?.stats?.winRate || '0'}
        />
        <BotCard
          title="Futures Bot"
          subtitle="CME Hours (NQ/GC)"
          icon={LineChart}
          iconColor="text-purple-400"
          borderColor="border-purple-500/30"
          capital={botData?.futuresPortfolio?.startingCapital || 300}
          pnl={botData?.futuresPortfolio?.totalPnL || 0}
          openPositions={botData?.futuresPortfolio?.openPositions || 0}
          winRate={botData?.futuresPortfolio?.winRate || '0'}
        />
        <BotCard
          title="Crypto Bot"
          subtitle="24/7 (13 coins)"
          icon={Bitcoin}
          iconColor="text-amber-400"
          borderColor="border-amber-500/30"
          capital={botData?.cryptoPortfolio?.startingCapital || 300}
          pnl={botData?.cryptoPortfolio?.totalPnL || 0}
          openPositions={botData?.cryptoPortfolio?.openPositions || 0}
          winRate={botData?.cryptoPortfolio?.winRate || '0'}
        />
        <BotCard
          title="Small Account"
          subtitle="<$500 Strategies"
          icon={Rocket}
          iconColor="text-green-400"
          borderColor="border-green-500/30"
          capital={300}
          pnl={0}
          openPositions={0}
          winRate="0"
        />
      </div>
      
      {/* Market Intelligence Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <BullishPatternWidget />
        <SectorHeatWidget />
      </div>
      
      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Search className="w-5 h-5 text-cyan-400" />
              <div>
                <h4 className="font-semibold text-sm">Market Scanner</h4>
                <p className="text-xs text-muted-foreground">Find opportunities</p>
              </div>
            </div>
            <Link href="/market-scanner">
              <Button size="sm" variant="outline" className="border-cyan-500/30 text-cyan-400">
                Open
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-purple-400" />
              <div>
                <h4 className="font-semibold text-sm">Trade Ideas</h4>
                <p className="text-xs text-muted-foreground">AI-generated research</p>
              </div>
            </div>
            <Link href="/trade-desk">
              <Button size="sm" variant="outline" className="border-purple-500/30 text-purple-400">
                Open
              </Button>
            </Link>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-slate-700/50">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-amber-400" />
              <div>
                <h4 className="font-semibold text-sm">Performance</h4>
                <p className="text-xs text-muted-foreground">Track your results</p>
              </div>
            </div>
            <Link href="/performance">
              <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400">
                Open
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function TradingEnginePage() {
  const [symbol, setSymbol] = useState('SPY');
  const [searchInput, setSearchInput] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('stock');
  const [mainTab, setMainTab] = useState('analysis');

  const { data: marketContext } = useQuery<{ 
    shouldTrade: boolean; 
    regime: string; 
    vixLevel: number | null;
    tradingSession: string;
  }>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const handleSearch = () => {
    if (searchInput.trim()) {
      setSymbol(searchInput.trim().toUpperCase());
    }
  };

  const handleSelectHotSymbol = (sym: string) => {
    setSymbol(sym);
    setSearchInput(sym);
    setMainTab('analysis');
  };

  return (
    <div className="min-h-screen text-foreground">
      <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-8">
        {/* Aurora Grid Header */}
        <div className="flex flex-wrap items-center justify-between gap-6 p-8 bg-slate-900/40 backdrop-blur-2xl border border-slate-700/30 rounded-2xl shadow-[0_0_60px_-15px_rgba(34,211,238,0.1)]">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <Target className="h-7 w-7 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                Command Center
                <Badge className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2 h-5">UNIFIED</Badge>
              </h1>
              <p className="text-sm font-mono text-slate-400 uppercase tracking-[0.2em] mt-2">
                {format(new Date(), 'EEEE, MMMM d, yyyy')} • {marketContext?.shouldTrade ? 'SESSION ACTIVE' : 'SESSION CLOSED'} • {marketContext?.tradingSession?.replace(/_/g, ' ').toUpperCase() || ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end px-5 border-r border-slate-700/50">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Status</span>
              <span className={cn("text-base font-mono font-bold", marketContext?.shouldTrade ? "text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.4)]" : "text-amber-400")}>
                {marketContext?.shouldTrade ? "LIVE" : "CLOSED"}
              </span>
            </div>
            <Link href="/trade-desk">
              <Button className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white font-bold px-6 h-11 shadow-lg shadow-cyan-500/20" data-testid="link-trade-desk">
                Trade Desk
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Data Status Banner - Shows when APIs are rate limited or degraded */}
        <DataStatusBanner />

        {/* Main Tabs - Aurora Grid Style */}
        <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-8">
          <TabsList className="inline-flex h-14 bg-slate-900/60 backdrop-blur-xl border border-slate-700/40 rounded-xl p-1.5 gap-2">
            <TabsTrigger 
              value="analysis" 
              data-testid="tab-analysis"
              className="rounded-lg px-6 py-3 font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_15px_rgba(34,211,238,0.2)] data-[state=active]:border data-[state=active]:border-cyan-500/30"
            >
              <Search className="w-4 h-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger 
              value="bots" 
              data-testid="tab-bots"
              className="rounded-lg px-6 py-3 font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_15px_rgba(34,211,238,0.2)] data-[state=active]:border data-[state=active]:border-cyan-500/30"
            >
              <Bot className="w-4 h-4 mr-2" />
              Bots
              <Badge className="ml-2 h-5 px-1.5 text-[9px] bg-green-500/20 text-green-400 border border-green-500/40 animate-pulse">LIVE</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="positions" 
              data-testid="tab-positions"
              className="rounded-lg px-6 py-3 font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_15px_rgba(34,211,238,0.2)] data-[state=active]:border data-[state=active]:border-cyan-500/30"
            >
              <Rocket className="w-4 h-4 mr-2" />
              Positions
            </TabsTrigger>
            <TabsTrigger 
              value="market" 
              data-testid="tab-market"
              className="rounded-lg px-6 py-3 font-medium transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500/20 data-[state=active]:to-purple-500/20 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_15px_rgba(34,211,238,0.2)] data-[state=active]:border data-[state=active]:border-cyan-500/30"
            >
              <Gauge className="w-4 h-4 mr-2" />
              Market
            </TabsTrigger>
          </TabsList>

          {/* Analysis Tab - Simplified Layout */}
          <TabsContent value="analysis" className="mt-0 space-y-6">
            {/* Symbol Search Bar - Clean and Prominent */}
            <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/40">
              <CardContent className="p-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[250px]">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">Symbol</label>
                    <div className="relative">
                      <Input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="NVDA, QQQ, BTC..."
                        className="h-12 bg-slate-800/60 border-slate-600/50 font-mono tracking-wide pl-10"
                        data-testid="input-symbol"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    </div>
                  </div>
                  <div className="w-[160px]">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 block">Type</label>
                    <Tabs value={assetClass} onValueChange={(v) => setAssetClass(v as AssetClass)} className="w-full">
                      <TabsList className="grid grid-cols-2 h-12 bg-slate-800/60 border border-slate-600/50 p-1 rounded-lg">
                        <TabsTrigger value="stock" className="text-xs font-medium rounded data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400" data-testid="tab-stock">Stock</TabsTrigger>
                        <TabsTrigger value="options" className="text-xs font-medium rounded data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400" data-testid="tab-options">Options</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <Button 
                    onClick={handleSearch}
                    disabled={!searchInput.trim()}
                    className="h-12 px-8 font-semibold bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white shadow-lg shadow-cyan-500/20"
                    data-testid="button-analyze"
                  >
                    Analyze
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              {/* Left Column - Analysis Results */}
              <div className="xl:col-span-3 space-y-6">
                <AnalysisResults symbol={symbol} assetClass={assetClass} />
              </div>

              {/* Right Column - Quick Info */}
              <div className="space-y-4">
                <HotSymbolsWidget onSelectSymbol={handleSelectHotSymbol} />
                <MarketOverviewWidget />
                <BotActivityMonitor />
              </div>
            </div>
          </TabsContent>

          {/* Bots Tab */}
          <TabsContent value="bots" className="space-y-6">
            <BotsOverviewTab />
          </TabsContent>

          {/* Positions Tab */}
          <TabsContent value="positions" className="space-y-6">
            <AutoLottoDashboard />
          </TabsContent>

          {/* Market Tab - Sentiment Dashboard */}
          <TabsContent value="market" className="space-y-6">
            <MarketSentimentDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
