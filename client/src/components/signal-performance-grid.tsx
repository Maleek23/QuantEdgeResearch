import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

interface SignalAnalysis {
  signal: string;
  totalTrades: number;
  winRate: number;
  avgPercentGain: number;
  reliabilityScore: number;
  expectancy: number;
  grade: string;
}

interface SignalPerformanceGridProps {
  signals: SignalAnalysis[];
}

export function SignalPerformanceGrid({ signals }: SignalPerformanceGridProps) {
  const getSignalIcon = (signal: string) => {
    // Map signals to their appropriate icons/descriptions
    const signalMap: Record<string, { label: string; color: string }> = {
      'RSI Divergence': { label: 'RSI', color: 'from-blue-500/20 to-cyan-500/20' },
      'MACD Crossover': { label: 'MACD', color: 'from-green-500/20 to-emerald-500/20' },
      'Momentum': { label: 'MOM', color: 'from-purple-500/20 to-violet-500/20' },
      'Volume Spike': { label: 'VOL', color: 'from-amber-500/20 to-orange-500/20' },
      'Multi-Timeframe': { label: 'MTF', color: 'from-pink-500/20 to-rose-500/20' },
      'Volatility': { label: 'VIX', color: 'from-red-500/20 to-rose-500/20' },
      'Support/Resistance': { label: 'S/R', color: 'from-cyan-500/20 to-teal-500/20' },
    };
    
    return signalMap[signal] || { label: signal.slice(0, 3).toUpperCase(), color: 'from-primary/20 to-accent/20' };
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'text-green-500';
    if (grade.startsWith('B')) return 'text-blue-500';
    if (grade.startsWith('C')) return 'text-amber-500';
    return 'text-muted-foreground';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {signals.map((signal, idx) => {
        const iconData = getSignalIcon(signal.signal);
        const winRatePercent = signal.winRate; // Already a percentage from backend
        const isPositive = signal.avgPercentGain > 0;

        return (
          <div 
            key={signal.signal}
            className="gradient-border-card card-tilt animate-fade-up"
            style={{ animationDelay: `${idx * 50}ms` }}
            data-testid={`signal-card-${idx}`}
          >
            <Card className="border-0 bg-transparent h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${iconData.color} flex items-center justify-center spotlight`}>
                    <span className="text-xs font-bold">{iconData.label}</span>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className={`${getGradeColor(signal.grade)} font-mono`}
                  >
                    {signal.grade}
                  </Badge>
                </div>
                <CardTitle className="text-base font-semibold leading-tight">
                  {signal.signal}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Win Rate Bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Win Rate</span>
                    <span className="text-sm font-bold font-mono">{winRatePercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        winRatePercent >= 60 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                        winRatePercent >= 50 ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                        'bg-gradient-to-r from-amber-500 to-orange-500'
                      }`}
                      style={{ width: `${Math.min(winRatePercent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="glass-card rounded-lg p-2">
                    <p className="text-muted-foreground mb-1">Avg Gain</p>
                    <div className={`flex items-center gap-1 font-mono font-semibold ${
                      isPositive ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {signal.avgPercentGain >= 0 ? '+' : ''}{signal.avgPercentGain.toFixed(1)}%
                    </div>
                  </div>

                  <div className="glass-card rounded-lg p-2">
                    <p className="text-muted-foreground mb-1">Trades</p>
                    <div className="flex items-center gap-1 font-mono font-semibold">
                      <Activity className="h-3 w-3 text-primary" />
                      {signal.totalTrades}
                    </div>
                  </div>
                </div>

                {/* Reliability Score */}
                <div className="glass-card rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Reliability</span>
                    <span className="text-sm font-bold font-mono text-primary">
                      {signal.reliabilityScore.toFixed(1)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
