import { useQuery } from "@tanstack/react-query";
import { Brain, Calculator, Activity, Target, CandlestickChart, Zap, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    winRate: number;
    avgPercentGain: number;
  };
}

export function HeroProductPanel({ className = "" }: { className?: string }) {
  const { data: perfStats } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  const engines = [
    { name: "AI", icon: Brain, gradient: "from-purple-500 to-purple-600", glow: "shadow-purple-500/20" },
    { name: "Quant", icon: Calculator, gradient: "from-blue-500 to-blue-600", glow: "shadow-blue-500/20" },
    { name: "Flow", icon: Activity, gradient: "from-cyan-500 to-cyan-600", glow: "shadow-cyan-500/20" },
    { name: "Chart", icon: Target, gradient: "from-amber-500 to-amber-600", glow: "shadow-amber-500/20" },
    { name: "Futures", icon: CandlestickChart, gradient: "from-green-500 to-green-600", glow: "shadow-green-500/20" },
  ];

  return (
    <div className={`relative ${className}`} data-testid="hero-product-panel">
      {/* Glow effect behind */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-transparent blur-3xl" />
      
      <div className="relative z-10">
        {/* Main Analysis Card */}
        <div 
          className="bg-slate-900/90 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-md max-w-md mx-auto shadow-2xl shadow-cyan-500/5"
          data-testid="research-preview-card"
        >
          {/* Header with live indicator */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Zap className="h-6 w-6 text-cyan-400" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Multi-Engine Analysis</h3>
                <p className="text-[10px] text-muted-foreground">5 engines converging</p>
              </div>
            </div>
            <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px]">
              LIVE
            </Badge>
          </div>

          {/* Engine Grid - Visual flow */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            {engines.map((engine, i) => (
              <div 
                key={engine.name}
                className={`relative group cursor-default`}
                data-testid={`engine-icon-${engine.name.toLowerCase()}`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`
                  aspect-square rounded-xl bg-gradient-to-br ${engine.gradient} 
                  flex items-center justify-center shadow-lg ${engine.glow}
                  transform transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl
                `}>
                  <engine.icon className="h-5 w-5 text-white" />
                </div>
                <p className="text-[9px] text-center text-muted-foreground mt-1.5 font-medium">{engine.name}</p>
              </div>
            ))}
          </div>

          {/* Convergence Animation */}
          <div className="relative py-3">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
            <div className="flex justify-center">
              <div className="relative px-4 py-1.5 bg-slate-900 rounded-full border border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-1">
                    {engines.map((e, i) => (
                      <div 
                        key={i} 
                        className={`w-1.5 h-1.5 rounded-full bg-gradient-to-br ${e.gradient}`}
                        style={{ animationDelay: `${i * 200}ms` }}
                      />
                    ))}
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-mono text-cyan-400">SIGNAL</span>
                </div>
              </div>
            </div>
          </div>

          {/* Output - Research Brief Preview */}
          <div className="bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent rounded-xl p-4 border border-cyan-500/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-foreground mb-1">Research Brief Generated</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  AI consensus + technical signals + flow data = higher conviction
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-lg font-bold font-mono text-cyan-400">
                  {perfStats?.overall?.winRate ? `${perfStats.overall.winRate.toFixed(0)}%` : '--'}
                </p>
                <p className="text-[9px] text-muted-foreground">tracked win rate</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center justify-center gap-6 mt-4 text-center">
          <div>
            <p className="text-lg font-bold font-mono text-foreground">{perfStats?.overall?.totalIdeas || '--'}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ideas</p>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div>
            <p className="text-lg font-bold font-mono text-foreground">{perfStats?.overall?.openIdeas || '--'}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div>
            <p className="text-lg font-bold font-mono text-foreground">5</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Engines</p>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div>
            <p className="text-lg font-bold font-mono text-foreground">4</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Markets</p>
          </div>
        </div>
      </div>
    </div>
  );
}
