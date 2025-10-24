import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Activity, BarChart3, AlertTriangle, Zap, Cpu, Bot, Sparkles } from 'lucide-react';

// Fetch performance stats
function usePerformanceStats() {
  return useQuery({
    queryKey: ['/api/performance/stats'],
  });
}

// Fetch trade ideas
function useTradeIdeas() {
  return useQuery({
    queryKey: ['/api/trade-ideas'],
  });
}

// Animated Metric Card
function AnimatedMetricCard({ 
  label, 
  value, 
  color, 
  delay 
}: { 
  label: string; 
  value: string; 
  color: string;
  delay: number;
}) {
  return (
    <div 
      className="relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-background/80 to-background/40 backdrop-blur-sm p-6 transform transition-all duration-500 hover:scale-105 hover:border-primary/40"
      style={{ animationDelay: `${delay}ms` }}
      data-testid={`metric-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* Animated background glow */}
      <div 
        className="absolute inset-0 opacity-20 blur-2xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${color}, transparent 70%)`,
          animation: 'pulse 3s ease-in-out infinite',
        }}
      />
      
      <div className="relative z-10">
        <div className="text-sm text-muted-foreground mb-2 font-medium">{label}</div>
        <div 
          className="text-4xl font-bold tracking-tight"
          style={{ color }}
        >
          {value}
        </div>
      </div>
      
      {/* Corner accent */}
      <div 
        className="absolute top-0 right-0 w-20 h-20 opacity-10"
        style={{
          background: `linear-gradient(135deg, ${color}, transparent)`,
        }}
      />
    </div>
  );
}

// Data Stream Visualization
function DataStream({ tradeIdeas }: { tradeIdeas: any[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  
  useEffect(() => {
    if (tradeIdeas.length === 0) return;
    
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % Math.min(tradeIdeas.length, 10));
    }, 2000);
    
    return () => clearInterval(interval);
  }, [tradeIdeas]);
  
  const displayIdeas = tradeIdeas.slice(0, 10);
  
  if (displayIdeas.length === 0) return null;
  
  return (
    <div className="space-y-2" data-testid="data-stream">
      {displayIdeas.map((idea, idx) => (
        <div
          key={idea.id}
          className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-500 ${
            idx === activeIdx
              ? 'border-primary/50 bg-primary/10 scale-105'
              : 'border-border/30 bg-background/40'
          }`}
          style={{
            opacity: idx === activeIdx ? 1 : 0.6,
          }}
        >
          <div className="flex items-center gap-3">
            {idea.direction === 'long' ? (
              <TrendingUp className="h-5 w-5 text-green-400" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-400" />
            )}
            <div>
              <div className="font-bold text-lg">{idea.symbol}</div>
              <div className="text-xs text-muted-foreground">{idea.assetType}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm">${idea.entryPrice?.toFixed(2) || 'N/A'}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
              {idea.source === 'quant' ? (
                <>
                  <Cpu className="h-3 w-3" />
                  <span>Quant</span>
                </>
              ) : idea.source === 'ai' ? (
                <>
                  <Bot className="h-3 w-3" />
                  <span>AI</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  <span>Hybrid</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Main Component
export default function HolographicView() {
  const { data: statsData, isLoading: statsLoading } = usePerformanceStats();
  const { data: tradeIdeasData, isLoading: ideasLoading } = useTradeIdeas();

  const stats = statsData as any;
  const overall = stats?.overall ?? {};
  const tradeIdeas = Array.isArray(tradeIdeasData) ? tradeIdeasData : [];

  // Show loading state
  if (statsLoading || ideasLoading) {
    return (
      <div className="h-screen w-full bg-gradient-to-b from-black via-blue-950/20 to-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-primary">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  const winRate = overall.winRate ?? 0;
  const totalTrades = overall.totalIdeas ?? 0;
  const profitFactor = overall.profitFactor ?? 0;
  const sharpeRatio = overall.sharpeRatio ?? 0;
  const maxDrawdown = overall.maxDrawdown ?? 0;
  const evScore = overall.evScore ?? 0;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-black via-blue-950/10 to-black p-6 overflow-auto">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Card className="bg-background/80 backdrop-blur-sm border-primary/30">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary animate-pulse" />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                  Performance Analytics Dashboard
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Real-time visualization of trading performance metrics
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Key Metrics */}
        <div className="lg:col-span-2 space-y-6">
          {/* Performance Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <AnimatedMetricCard
              label="Win Rate"
              value={`${winRate.toFixed(1)}%`}
              color={winRate >= 50 ? '#10b981' : '#ef4444'}
              delay={0}
            />
            <AnimatedMetricCard
              label="Total Trades"
              value={totalTrades.toString()}
              color="#3b82f6"
              delay={100}
            />
            <AnimatedMetricCard
              label="Profit Factor"
              value={profitFactor.toFixed(2)}
              color={profitFactor >= 1 ? '#10b981' : '#f59e0b'}
              delay={200}
            />
            <AnimatedMetricCard
              label="Sharpe Ratio"
              value={sharpeRatio.toFixed(2)}
              color={sharpeRatio >= 1 ? '#8b5cf6' : '#f59e0b'}
              delay={300}
            />
            <AnimatedMetricCard
              label="Max Drawdown"
              value={`${Math.abs(maxDrawdown).toFixed(1)}%`}
              color="#ef4444"
              delay={400}
            />
            <AnimatedMetricCard
              label="EV Score"
              value={evScore.toFixed(2)}
              color={evScore >= 1 ? '#06b6d4' : '#f59e0b'}
              delay={500}
            />
          </div>

          {/* System Status */}
          <Card className="bg-background/60 backdrop-blur-sm border-primary/20">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-amber-400" />
                <h2 className="text-xl font-bold">System Status</h2>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="text-2xl font-bold text-green-400">
                    {stats?.bySource?.find((s: any) => s.source === 'quant')?.winRate?.toFixed(1) ?? '0.0'}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Quant Engine</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="text-2xl font-bold text-blue-400">
                    {stats?.bySource?.find((s: any) => s.source === 'ai')?.winRate?.toFixed(1) ?? '0.0'}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">AI Engine</div>
                </div>
                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30">
                  <div className="text-2xl font-bold text-purple-400">
                    {stats?.bySource?.find((s: any) => s.source === 'hybrid')?.winRate?.toFixed(1) ?? '0.0'}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Hybrid</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Live Data Stream */}
        <div className="space-y-6">
          <Card className="bg-background/60 backdrop-blur-sm border-primary/20">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-5 w-5 text-cyan-400" />
                <h2 className="text-xl font-bold">Live Trade Ideas</h2>
              </div>
              <DataStream tradeIdeas={tradeIdeas} />
              {tradeIdeas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active trade ideas</p>
                </div>
              )}
            </div>
          </Card>

          {/* Instructions */}
          <Card className="bg-background/40 backdrop-blur-sm border-primary/10">
            <div className="p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Analytics Dashboard
              </p>
              <p>Real-time performance metrics updated automatically</p>
              <p>Metrics refresh every 5 minutes</p>
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
