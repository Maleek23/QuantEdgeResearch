import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, Activity } from "lucide-react";

interface SignalPerformance {
  signalName: string;
  grade: string;
  winRate: number;
  avgGain: number;
  tradeCount: number;
  reliability: number;
}

interface BrainNeuralNetworkProps {
  signals: SignalPerformance[];
}

function getWinRateColor(winRate: number): string {
  if (winRate >= 60) return 'text-green-400';
  if (winRate >= 50) return 'text-blue-400';
  if (winRate >= 40) return 'text-amber-400';
  return 'text-red-400';
}

function getWinRateBgColor(winRate: number): string {
  if (winRate >= 60) return 'bg-green-500/10 border-green-500/20';
  if (winRate >= 50) return 'bg-blue-500/10 border-blue-500/20';
  if (winRate >= 40) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

export function BrainNeuralNetwork({ signals }: BrainNeuralNetworkProps) {
  const avgWinRate = signals.reduce((sum, s) => sum + s.winRate, 0) / signals.length;
  const topPerformer = [...signals].sort((a, b) => b.winRate - a.winRate)[0];
  const bottomPerformer = [...signals].sort((a, b) => a.winRate - b.winRate)[0];

  return (
    <Card className="bg-gradient-to-br from-background via-primary/5 to-background border-primary/20" data-testid="card-ml-network">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="w-6 h-6 text-primary" data-testid="icon-brain" />
          </div>
          <div>
            <CardTitle className="text-2xl" data-testid="text-ml-network-title">ML Learning Network</CardTitle>
            <CardDescription className="mt-1">
              Signal performance metrics and learning patterns visualized
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg bg-card/50 border border-border/50 p-4 hover-elevate transition-all duration-300" data-testid="card-avg-win-rate">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-green-400" />
              <div className="text-xs text-muted-foreground">Avg Win Rate</div>
            </div>
            <div className="text-2xl font-bold text-green-400" data-testid="text-avg-win-rate">{avgWinRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Across {signals.length} signals</div>
          </div>
          <div className="rounded-lg bg-card/50 border border-border/50 p-4 hover-elevate transition-all duration-300" data-testid="card-top-signal">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <div className="text-xs text-muted-foreground">Top Signal</div>
            </div>
            <div className="text-sm font-semibold text-cyan-400 truncate" data-testid="text-top-signal">{topPerformer?.signalName}</div>
            <div className="text-xs text-muted-foreground mt-1">{topPerformer?.winRate.toFixed(1)}% win rate</div>
          </div>
          <div className="rounded-lg bg-card/50 border border-border/50 p-4 hover-elevate transition-all duration-300" data-testid="card-improving-signal">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-amber-400" />
              <div className="text-xs text-muted-foreground">Learning</div>
            </div>
            <div className="text-sm font-semibold text-amber-400 truncate" data-testid="text-learning-signal">{bottomPerformer?.signalName}</div>
            <div className="text-xs text-muted-foreground mt-1">{bottomPerformer?.winRate.toFixed(1)}% win rate</div>
          </div>
        </div>

        {/* 2D Grid of Signal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((signal, i) => {
            const winRateBgColor = getWinRateBgColor(signal.winRate);
            const winRateTextColor = getWinRateColor(signal.winRate);
            
            return (
              <Card 
                key={i} 
                className={`${winRateBgColor} border hover-elevate active-elevate-2 transition-all duration-300 cursor-pointer group`}
                data-testid={`card-signal-${i}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold truncate" data-testid={`text-signal-name-${i}`}>
                      {signal.signalName}
                    </CardTitle>
                    <Badge variant="outline" className="shrink-0" data-testid={`badge-grade-${i}`}>
                      {signal.grade}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Win Rate - Prominent Display */}
                  <div className="flex items-center justify-between p-2 rounded-md bg-background/50">
                    <span className="text-xs text-muted-foreground">Win Rate:</span>
                    <span className={`text-lg font-bold ${winRateTextColor}`} data-testid={`text-win-rate-${i}`}>
                      {signal.winRate.toFixed(1)}%
                    </span>
                  </div>
                  
                  {/* Other Metrics */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Avg Gain:</span>
                      <span className="text-blue-400 font-medium" data-testid={`text-avg-gain-${i}`}>
                        {signal.avgGain > 0 ? '+' : ''}{signal.avgGain.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Trade Count:</span>
                      <span className="text-purple-400 font-medium" data-testid={`text-trade-count-${i}`}>
                        {signal.tradeCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Reliability:</span>
                      <span className="text-cyan-400 font-medium" data-testid={`text-reliability-${i}`}>
                        {(signal.reliability * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Reliability Progress Bar */}
                  <div className="pt-2">
                    <div className="w-full h-1.5 bg-background/50 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${winRateTextColor.replace('text-', 'bg-')} transition-all duration-500 group-hover:opacity-80`}
                        style={{ width: `${signal.reliability * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-border/50 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">Performance Tiers:</span>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="text-xs text-muted-foreground">Excellent (60%+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-400" />
            <span className="text-xs text-muted-foreground">Good (50-60%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-xs text-muted-foreground">Learning (40-50%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-xs text-muted-foreground">Improving (&lt;40%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
