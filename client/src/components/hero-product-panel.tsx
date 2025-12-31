import { useQuery } from "@tanstack/react-query";
import { Brain, Calculator, Activity, TrendingUp, TrendingDown, Target, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    winRate: number;
    avgPercentGain: number;
  };
}

export function HeroProductPanel({ className = "" }: { className?: string }) {
  const { data: perfStats, isLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  const sampleTrade = {
    symbol: "NVDA",
    direction: "long",
    entryPrice: 142.50,
    targetPrice: 156.75,
    stopLoss: 138.20,
    confidenceScore: 78,
    source: "flow",
    riskReward: "3.3:1",
    catalyst: "Unusual call volume detected at $145 strike",
  };

  const engines = [
    { name: "AI", icon: Brain, color: "purple", winRate: 57 },
    { name: "Quant", icon: Calculator, color: "blue", winRate: 34 },
    { name: "Flow", icon: Activity, color: "cyan", winRate: 82 },
  ];

  return (
    <div className={`relative ${className}`} data-testid="hero-product-panel">
      <div className="relative z-10 space-y-4">
        {/* Engine Performance Strip */}
        <div className="flex items-center gap-3 justify-center" data-testid="engine-strip">
          {engines.map((engine) => (
            <div 
              key={engine.name}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50`}
              data-testid={`engine-badge-${engine.name.toLowerCase()}`}
            >
              <engine.icon className={`h-4 w-4 ${
                engine.color === 'purple' ? 'text-purple-400' :
                engine.color === 'blue' ? 'text-blue-400' : 'text-cyan-400'
              }`} />
              <span className="text-xs font-medium text-slate-300">{engine.name}</span>
              <span className={`text-xs font-mono font-bold ${
                engine.winRate >= 60 ? 'text-green-400' : 
                engine.winRate >= 40 ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {engine.winRate}%
              </span>
            </div>
          ))}
        </div>

        {/* Sample Trade Signal Card */}
        <div 
          className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 backdrop-blur-sm max-w-sm mx-auto"
          data-testid="sample-trade-card"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold font-mono text-foreground">{sampleTrade.symbol}</span>
              <Badge 
                variant="outline" 
                className={`${sampleTrade.direction === 'long' 
                  ? 'border-green-500/50 text-green-400 bg-green-500/10' 
                  : 'border-red-500/50 text-red-400 bg-red-500/10'
                }`}
              >
                {sampleTrade.direction === 'long' ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {sampleTrade.direction.toUpperCase()}
              </Badge>
            </div>
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
              <Activity className="h-3 w-3 mr-1" />
              FLOW
            </Badge>
          </div>

          {/* Price Levels */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Entry</p>
              <p className="font-mono font-bold text-foreground">${sampleTrade.entryPrice}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Target className="h-3 w-3 text-green-400" /> Target
              </p>
              <p className="font-mono font-bold text-green-400">${sampleTrade.targetPrice}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <Shield className="h-3 w-3 text-red-400" /> Stop
              </p>
              <p className="font-mono font-bold text-red-400">${sampleTrade.stopLoss}</p>
            </div>
          </div>

          {/* Confidence & R:R */}
          <div className="flex items-center justify-between mb-3 px-2 py-2 rounded-lg bg-slate-800/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Signal Strength</span>
              <span className="font-mono font-bold text-cyan-400">{sampleTrade.confidenceScore}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">R:R</span>
              <span className="font-mono font-bold text-green-400">{sampleTrade.riskReward}</span>
            </div>
          </div>

          {/* Catalyst */}
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            "{sampleTrade.catalyst}"
          </p>
        </div>

        {/* Live Stats Footer */}
        <div className="flex items-center justify-center gap-6 text-center" data-testid="live-stats">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Ideas</p>
            {isLoading ? (
              <Skeleton className="h-5 w-12 mx-auto mt-1" />
            ) : (
              <p className="font-mono font-bold text-foreground">{perfStats?.overall?.totalIdeas || '—'}</p>
            )}
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Win Rate</p>
            {isLoading ? (
              <Skeleton className="h-5 w-12 mx-auto mt-1" />
            ) : (
              <p className="font-mono font-bold text-green-400">
                {perfStats?.overall?.winRate ? `${perfStats.overall.winRate.toFixed(0)}%` : '—'}
              </p>
            )}
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Gain</p>
            {isLoading ? (
              <Skeleton className="h-5 w-12 mx-auto mt-1" />
            ) : (
              <p className={`font-mono font-bold ${
                (perfStats?.overall?.avgPercentGain || 0) >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {perfStats?.overall?.avgPercentGain 
                  ? `${perfStats.overall.avgPercentGain >= 0 ? '+' : ''}${perfStats.overall.avgPercentGain.toFixed(1)}%`
                  : '—'
                }
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
