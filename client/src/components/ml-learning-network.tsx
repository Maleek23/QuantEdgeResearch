import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { safeToFixed } from "@/lib/utils";

interface SignalAnalysis {
  signal: string;
  winRate: number;
  totalTrades: number;
  reliabilityScore: number;
}

interface MLLearningNetworkProps {
  signals: SignalAnalysis[];
  totalTrades: number;
}

export function MLLearningNetwork({ signals, totalTrades }: MLLearningNetworkProps) {
  // Sort signals by reliability score
  const sortedSignals = [...signals].sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  
  // Calculate node sizes based on reliability (10-40px)
  const getNodeSize = (reliability: number) => {
    return Math.max(20, Math.min(48, reliability * 0.5));
  };

  // Calculate connection strength (opacity) between signals
  const getConnectionStrength = (sig1: SignalAnalysis, sig2: SignalAnalysis) => {
    const avgReliability = (sig1.reliabilityScore + sig2.reliabilityScore) / 2;
    return Math.min(1, avgReliability / 100);
  };

  // Get color based on win rate
  const getNodeColor = (winRate: number) => {
    if (winRate >= 0.6) return 'from-green-500 to-emerald-500';
    if (winRate >= 0.5) return 'from-blue-500 to-cyan-500';
    return 'from-amber-500 to-orange-500';
  };

  return (
    <Card className="gradient-border-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Brain className="h-5 w-5 text-purple-500" />
          </div>
          ML Learning Network
        </CardTitle>
        <CardDescription>
          Visual representation of signal relationships and performance. Node size = reliability, connections = combined strength.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="relative min-h-[400px] bg-secondary/5 rounded-xl p-8 overflow-hidden">
          {/* SVG for connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            {sortedSignals.map((sig1, i) => {
              const x1 = (i % 3) * 33 + 16.5; // Position in grid (percentage)
              const y1 = Math.floor(i / 3) * 50 + 25;
              
              return sortedSignals.slice(i + 1).map((sig2, j) => {
                const actualJ = i + j + 1;
                const x2 = (actualJ % 3) * 33 + 16.5;
                const y2 = Math.floor(actualJ / 3) * 50 + 25;
                
                const opacity = getConnectionStrength(sig1, sig2);
                
                return (
                  <line
                    key={`${i}-${actualJ}`}
                    x1={`${x1}%`}
                    y1={`${y1}%`}
                    x2={`${x2}%`}
                    y2={`${y2}%`}
                    stroke="rgba(6, 182, 212, 0.3)"
                    strokeWidth="2"
                    opacity={opacity}
                    className="transition-opacity duration-300"
                  />
                );
              });
            })}
          </svg>

          {/* Signal Nodes */}
          <div className="relative grid grid-cols-3 gap-8" style={{ zIndex: 2 }}>
            {sortedSignals.map((signal, idx) => {
              const size = getNodeSize(signal.reliabilityScore);
              const winRatePercent = signal.winRate * 100;
              
              return (
                <div 
                  key={signal.signal}
                  className="flex flex-col items-center group"
                  data-testid={`ml-node-${idx}`}
                >
                  {/* Node Circle */}
                  <div 
                    className={`rounded-full bg-gradient-to-br ${getNodeColor(signal.winRate)} shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-110 relative`}
                    style={{ 
                      width: `${size}px`, 
                      height: `${size}px`,
                      minWidth: `${size}px`,
                      minHeight: `${size}px`
                    }}
                  >
                    <div className="absolute inset-0 rounded-full animate-pulse opacity-50 bg-gradient-to-br from-white/20 to-transparent"></div>
                    <span className="text-xs font-bold text-white z-10">
                      {signal.signal.split(' ')[0].slice(0, 3).toUpperCase()}
                    </span>
                  </div>
                  
                  {/* Signal Label */}
                  <div className="mt-3 text-center">
                    <p className="text-xs font-semibold mb-1 leading-tight">{signal.signal}</p>
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {safeToFixed(winRatePercent, 0)}% WR
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {signal.totalTrades}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Hover Tooltip */}
                  <div className="absolute top-full mt-2 hidden group-hover:block z-20">
                    <div className="glass-intense rounded-lg p-3 shadow-xl border border-primary/20 min-w-[180px]">
                      <p className="text-xs font-semibold mb-2">{signal.signal}</p>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Win Rate: <span className="text-white font-mono">{safeToFixed(winRatePercent, 1)}%</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Reliability: <span className="text-white font-mono">{safeToFixed(signal.reliabilityScore, 1)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Trades: <span className="text-white font-mono">{signal.totalTrades}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Learning Status Panel */}
          <div className="mt-8 glass-card rounded-lg p-4 border border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Learning Status
              </h4>
              <Badge variant="secondary" className="text-xs">
                {totalTrades >= 30 ? '✓ Active' : '⏸ Pending Data'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-1">Historical Trades</p>
                <p className="text-lg font-bold font-mono">{totalTrades}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Signals Analyzed</p>
                <p className="text-lg font-bold font-mono">{signals.length}</p>
              </div>
            </div>

            {sortedSignals.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Recent Learning Insights:</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">
                      <span className="font-semibold text-green-500">{sortedSignals[0].signal}</span> is top performer
                      ({safeToFixed(sortedSignals[0].winRate * 100, 0)}% WR)
                    </p>
                  </div>
                  {sortedSignals.length > 1 && sortedSignals[sortedSignals.length - 1].winRate < 0.5 && (
                    <div className="flex items-start gap-2">
                      <TrendingDown className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs">
                        <span className="font-semibold text-amber-500">{sortedSignals[sortedSignals.length - 1].signal}</span> needs tuning
                        ({safeToFixed(sortedSignals[sortedSignals.length - 1].winRate * 100, 0)}% WR)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
