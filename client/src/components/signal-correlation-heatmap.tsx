import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";

interface SignalCombination {
  combination: string;
  occurrences: number;
  winRate: number;
  avgGain: number;
}

interface SignalCorrelationHeatmapProps {
  combinations: SignalCombination[];
}

export function SignalCorrelationHeatmap({ combinations }: SignalCorrelationHeatmapProps) {
  // Map full signal names to short codes
  const signalNameMap: Record<string, string> = {
    'RSI Divergence': 'RSI',
    'MACD Crossover': 'MACD',
    'Momentum': 'MOM',
    'Volume Spike': 'VOL',
    'Multi-Timeframe': 'MTF',
    'Volatility': 'VIX',
    'Support/Resistance': 'S/R',
  };
  
  // Reverse map for display
  const getShortCode = (fullName: string): string => {
    return signalNameMap[fullName] || fullName.split(' ')[0].toUpperCase().slice(0, 3);
  };
  
  const signals = ['RSI', 'MACD', 'MOM', 'VOL', 'MTF', 'VIX', 'S/R'];
  
  // Create a matrix of signal combinations
  const matrix: { signal1: string; signal2: string; winRate: number; occurrences: number; avgGain: number }[] = [];
  
  combinations.forEach(combo => {
    const parts = combo.combination.split(' + ');
    if (parts.length === 2) {
      const signal1 = getShortCode(parts[0].trim());
      const signal2 = getShortCode(parts[1].trim());
      
      matrix.push({
        signal1: signal1,
        signal2: signal2,
        winRate: combo.winRate,
        occurrences: combo.occurrences,
        avgGain: combo.avgGain
      });
    }
  });

  const getHeatColor = (winRate: number) => {
    if (winRate >= 0.75) return 'bg-green-500/80 border-green-500';
    if (winRate >= 0.65) return 'bg-green-500/60 border-green-500/80';
    if (winRate >= 0.55) return 'bg-blue-500/60 border-blue-500/80';
    if (winRate >= 0.45) return 'bg-amber-500/60 border-amber-500/80';
    return 'bg-red-500/60 border-red-500/80';
  };

  const getCell = (sig1: string, sig2: string) => {
    const combo = matrix.find(m => 
      (m.signal1 === sig1 && m.signal2 === sig2) ||
      (m.signal1 === sig2 && m.signal2 === sig1)
    );
    return combo;
  };

  return (
    <Card className="gradient-border-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Target className="h-5 w-5 text-purple-500" />
          </div>
          Signal Correlation Heatmap
        </CardTitle>
        <CardDescription>
          Which signal combinations work best together? Darker = higher win rate
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-xs font-semibold text-muted-foreground border-b border-border"></th>
                  {signals.map(sig => (
                    <th 
                      key={sig} 
                      className="p-2 text-xs font-semibold text-muted-foreground border-b border-border"
                    >
                      {sig}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.map((sig1, i) => (
                  <tr key={sig1}>
                    <td className="p-2 text-xs font-semibold text-muted-foreground border-r border-border">
                      {sig1}
                    </td>
                    {signals.map((sig2, j) => {
                      if (i === j) {
                        // Diagonal - same signal
                        return (
                          <td key={`${sig1}-${sig2}`} className="p-1">
                            <div className="h-12 w-12 flex items-center justify-center bg-secondary/20 rounded-md border border-border">
                              <span className="text-xs text-muted-foreground">-</span>
                            </div>
                          </td>
                        );
                      }
                      
                      const cell = getCell(sig1, sig2);
                      
                      if (!cell) {
                        // No data for this combination
                        return (
                          <td key={`${sig1}-${sig2}`} className="p-1">
                            <div className="h-12 w-12 flex items-center justify-center bg-secondary/10 rounded-md border border-border/50">
                              <span className="text-xs text-muted-foreground opacity-50">N/A</span>
                            </div>
                          </td>
                        );
                      }
                      
                      return (
                        <td key={`${sig1}-${sig2}`} className="p-1 group relative">
                          <div 
                            className={`h-12 w-12 flex flex-col items-center justify-center rounded-md border-2 transition-transform hover:scale-110 cursor-pointer ${getHeatColor(cell.winRate)}`}
                          >
                            <span className="text-xs font-bold text-white">
                              {(cell.winRate * 100).toFixed(0)}%
                            </span>
                            <span className="text-[10px] text-white/80">
                              ({cell.occurrences})
                            </span>
                          </div>
                          
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                            <div className="glass-intense rounded-lg p-3 shadow-xl border border-primary/20 min-w-[200px]">
                              <p className="text-xs font-semibold mb-1">{sig1} + {sig2}</p>
                              <p className="text-xs text-muted-foreground mb-1">
                                Win Rate: <span className="text-white font-mono">{(cell.winRate * 100).toFixed(1)}%</span>
                              </p>
                              <p className="text-xs text-muted-foreground mb-1">
                                Trades: <span className="text-white font-mono">{cell.occurrences}</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Avg Gain: <span className="text-white font-mono">
                                  {cell.avgGain >= 0 ? '+' : ''}{cell.avgGain.toFixed(1)}%
                                </span>
                              </p>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-green-500/80 border-2 border-green-500"></div>
            <span className="text-xs text-muted-foreground">75%+ WR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-green-500/60 border-2 border-green-500/80"></div>
            <span className="text-xs text-muted-foreground">65-74% WR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-blue-500/60 border-2 border-blue-500/80"></div>
            <span className="text-xs text-muted-foreground">55-64% WR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-amber-500/60 border-2 border-amber-500/80"></div>
            <span className="text-xs text-muted-foreground">45-54% WR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-red-500/60 border-2 border-red-500/80"></div>
            <span className="text-xs text-muted-foreground">&lt;45% WR</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
