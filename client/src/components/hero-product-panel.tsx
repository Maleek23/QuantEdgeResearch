import { useQuery } from "@tanstack/react-query";
import { Brain, Calculator, Activity, FileText, BarChart3, AlertTriangle } from "lucide-react";
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

  const engines = [
    { name: "AI Engine", icon: Brain, color: "purple", desc: "Fundamental Analysis" },
    { name: "Quant Engine", icon: Calculator, color: "blue", desc: "Technical Signals" },
    { name: "Flow Scanner", icon: Activity, color: "cyan", desc: "Institutional Activity" },
  ];

  return (
    <div className={`relative ${className}`} data-testid="hero-product-panel">
      <div className="relative z-10 space-y-4">
        
        {/* Research Platform Preview */}
        <div 
          className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 backdrop-blur-sm max-w-sm mx-auto"
          data-testid="research-preview-card"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-400" />
              <span className="text-sm font-semibold text-foreground">Research Brief</span>
            </div>
            <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px]">
              SAMPLE
            </Badge>
          </div>

          {/* Engine Sources */}
          <div className="space-y-3 mb-4">
            {engines.map((engine) => (
              <div 
                key={engine.name}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50"
                data-testid={`engine-row-${engine.name.toLowerCase().replace(' ', '-')}`}
              >
                <engine.icon className={`h-4 w-4 ${
                  engine.color === 'purple' ? 'text-purple-400' :
                  engine.color === 'blue' ? 'text-blue-400' : 'text-cyan-400'
                }`} />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{engine.name}</p>
                  <p className="text-[10px] text-muted-foreground">{engine.desc}</p>
                </div>
                <div className={`w-2 h-2 rounded-full ${
                  engine.color === 'purple' ? 'bg-purple-400' :
                  engine.color === 'blue' ? 'bg-blue-400' : 'bg-cyan-400'
                } animate-pulse`} />
              </div>
            ))}
          </div>

          {/* Output Preview */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-cyan-400">Multi-Engine Analysis</span>
            </div>
            <Badge className="bg-slate-800 text-foreground text-[10px]">
              → Research Output
            </Badge>
          </div>
        </div>

        {/* Historical Data Stats (with context) */}
        <div className="flex items-center justify-center gap-6 text-center" data-testid="historical-stats">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Research Briefs</p>
            {isLoading ? (
              <Skeleton className="h-5 w-12 mx-auto mt-1" />
            ) : (
              <p className="font-mono font-bold text-foreground">{perfStats?.overall?.totalIdeas || '—'}</p>
            )}
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Engines</p>
            <p className="font-mono font-bold text-foreground">3</p>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Markets</p>
            <p className="font-mono font-bold text-foreground">4</p>
          </div>
        </div>

        {/* Educational Disclaimer */}
        <div 
          className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 max-w-sm mx-auto"
          data-testid="educational-disclaimer"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-200/80 leading-relaxed">
            Educational research only. Not financial advice. Past performance does not guarantee future results.
          </p>
        </div>
      </div>
    </div>
  );
}
