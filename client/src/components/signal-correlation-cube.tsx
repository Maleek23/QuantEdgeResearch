import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SignalCombination {
  combination: string;
  occurrences: number;
  winRate: number;
  avgGain: number;
}

interface SignalCorrelationCubeProps {
  combinations: SignalCombination[];
}

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

const getShortCode = (fullName: string): string => {
  return signalNameMap[fullName] || fullName.split(' ')[0].toUpperCase().slice(0, 3);
};

const signals = ['RSI', 'MACD', 'MOM', 'VOL', 'MTF', 'VIX', 'S/R'];

function getHeatColor(winRate: number): string {
  if (winRate >= 0.75) return 'bg-green-500';
  if (winRate >= 0.65) return 'bg-green-400';
  if (winRate >= 0.55) return 'bg-blue-500';
  if (winRate >= 0.45) return 'bg-blue-400';
  if (winRate >= 0.35) return 'bg-amber-500';
  return 'bg-red-500';
}

function getHeatColorHex(winRate: number): string {
  if (winRate >= 0.75) return '#22c55e';
  if (winRate >= 0.65) return '#4ade80';
  if (winRate >= 0.55) return '#3b82f6';
  if (winRate >= 0.45) return '#60a5fa';
  if (winRate >= 0.35) return '#f59e0b';
  return '#ef4444';
}

export function SignalCorrelationCube({ combinations }: SignalCorrelationCubeProps) {
  const [hoveredCell, setHoveredCell] = useState<{ signal1: string; signal2: string } | null>(null);

  // Create matrix data
  const matrix = useMemo(() => {
    const matrixData: { signal1: string; signal2: string; winRate: number; occurrences: number; avgGain: number }[] = [];
    
    combinations.forEach(combo => {
      const parts = combo.combination.split(' + ');
      if (parts.length === 2) {
        const signal1 = getShortCode(parts[0].trim());
        const signal2 = getShortCode(parts[1].trim());
        
        matrixData.push({
          signal1,
          signal2,
          winRate: combo.winRate,
          occurrences: combo.occurrences,
          avgGain: combo.avgGain
        });
      }
    });
    
    return matrixData;
  }, [combinations]);

  const getCell = (s1: string, s2: string) => {
    if (s1 === s2) return null;
    return matrix.find(m => 
      (m.signal1 === s1 && m.signal2 === s2) || 
      (m.signal1 === s2 && m.signal2 === s1)
    );
  };

  return (
    <Card className="bg-gradient-to-br from-background via-purple-500/5 to-background border-purple-500/20" data-testid="card-correlation-heatmap">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-500" data-testid="icon-target" />
            </div>
            <div>
              <CardTitle className="text-2xl" data-testid="text-correlation-title">Signal Correlation Heatmap</CardTitle>
              <CardDescription>
                Win rates for signal combinations
              </CardDescription>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" data-testid="icon-info" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">Hover over cells to see detailed statistics for each signal combination</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {combinations.length === 0 ? (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            <p data-testid="text-no-data">No combination data available yet. Generate more trade ideas to see correlations.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Heatmap Table */}
            <div className="inline-block min-w-full">
              <div className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-card/90 backdrop-blur-sm border-r border-b border-border/50 p-3 text-left text-xs font-semibold text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Target className="h-3 w-3" />
                          <span>Signal</span>
                        </div>
                      </th>
                      {signals.map((signal) => (
                        <th 
                          key={signal} 
                          className="bg-card/90 backdrop-blur-sm border-b border-border/50 p-3 text-center text-xs font-semibold text-muted-foreground min-w-[80px]"
                          data-testid={`header-col-${signal}`}
                        >
                          {signal}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((rowSignal, rowIndex) => (
                      <tr key={rowSignal} data-testid={`row-${rowSignal}`}>
                        <td className="sticky left-0 z-10 bg-card/90 backdrop-blur-sm border-r border-border/50 p-3 text-left text-xs font-semibold text-muted-foreground">
                          {rowSignal}
                        </td>
                        {signals.map((colSignal, colIndex) => {
                          const cell = getCell(rowSignal, colSignal);
                          const isDiagonal = rowSignal === colSignal;
                          const isHovered = hoveredCell?.signal1 === rowSignal && hoveredCell?.signal2 === colSignal;
                          
                          return (
                            <TooltipProvider key={`${rowSignal}-${colSignal}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <td
                                    className={`p-0 border border-border/30 transition-all duration-200 cursor-pointer ${
                                      isHovered ? 'scale-105 z-30' : ''
                                    }`}
                                    onMouseEnter={() => !isDiagonal && cell && setHoveredCell({ signal1: rowSignal, signal2: colSignal })}
                                    onMouseLeave={() => setHoveredCell(null)}
                                    data-testid={`cell-${rowSignal}-${colSignal}`}
                                  >
                                    <div 
                                      className={`w-full h-16 flex items-center justify-center text-xs font-medium transition-all duration-200 ${
                                        isDiagonal 
                                          ? 'bg-gray-700/30' 
                                          : cell 
                                            ? `${getHeatColor(cell.winRate)} ${isHovered ? 'opacity-90' : 'opacity-70'} hover:opacity-90`
                                            : 'bg-gray-800/30'
                                      }`}
                                      style={{
                                        backgroundColor: !isDiagonal && cell ? getHeatColorHex(cell.winRate) : undefined,
                                        opacity: !isDiagonal && cell ? (isHovered ? 0.9 : 0.7) : undefined,
                                      }}
                                    >
                                      {!isDiagonal && cell && (
                                        <span className="text-white font-bold drop-shadow-lg">
                                          {(cell.winRate * 100).toFixed(0)}%
                                        </span>
                                      )}
                                      {isDiagonal && (
                                        <span className="text-muted-foreground text-xs">N/A</span>
                                      )}
                                    </div>
                                  </td>
                                </TooltipTrigger>
                                {!isDiagonal && cell && (
                                  <TooltipContent className="max-w-xs">
                                    <div className="space-y-2">
                                      <div className="font-semibold text-sm border-b border-border pb-1">
                                        {rowSignal} + {colSignal}
                                      </div>
                                      <div className="space-y-1 text-xs">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-muted-foreground">Win Rate:</span>
                                          <span className="text-green-400 font-medium">{(cell.winRate * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-muted-foreground">Avg Gain:</span>
                                          <span className="text-blue-400 font-medium">
                                            {cell.avgGain > 0 ? '+' : ''}{cell.avgGain.toFixed(2)}%
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-muted-foreground">Occurrences:</span>
                                          <span className="text-purple-400 font-medium">{cell.occurrences}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-border/50 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-muted-foreground">Win Rate Legend:</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-xs text-muted-foreground">&lt;35%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
                <span className="text-xs text-muted-foreground">35-45%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#60a5fa' }} />
                <span className="text-xs text-muted-foreground">45-55%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }} />
                <span className="text-xs text-muted-foreground">55-65%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4ade80' }} />
                <span className="text-xs text-muted-foreground">65-75%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
                <span className="text-xs text-muted-foreground">75%+</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
