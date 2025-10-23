import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, BarChart2, Activity, Volume2, Target } from "lucide-react";
import type { TradeIdea } from "@shared/schema";
import { formatPercent } from "@/lib/utils";

interface ExplainabilityPanelProps {
  idea: TradeIdea;
}

export function ExplainabilityPanel({ idea }: ExplainabilityPanelProps) {
  // Treat both null and undefined as missing (use loose equality check)
  // Check ALL possible explainability fields - show panel if ANY are present
  const hasIndicators = 
    idea.rsiValue != null || 
    idea.macdLine != null || 
    idea.macdSignal != null || 
    idea.macdHistogram != null || 
    idea.volumeRatio != null ||
    idea.priceVs52WeekHigh != null ||
    idea.priceVs52WeekLow != null;

  if (!hasIndicators) {
    return null; // Don't show panel if no indicator data available
  }

  // RSI interpretation - CONTEXT-AWARE of trade direction
  const getRSIInterpretation = (rsi: number | null | undefined, isShort: boolean): { label: string; color: string; signal: string; isSupporting: boolean } => {
    if (rsi == null) return { label: 'N/A', color: 'text-muted-foreground', signal: 'No data', isSupporting: false };
    
    // For SHORT trades
    if (isShort) {
      if (rsi >= 80) return { label: 'Extremely Overbought', color: 'text-green-400', signal: 'Strong sell signal', isSupporting: true };
      if (rsi >= 70) return { label: 'Overbought', color: 'text-green-300', signal: 'Sell signal', isSupporting: true };
      if (rsi <= 20) return { label: 'Extremely Oversold', color: 'text-red-400', signal: 'Already oversold (risky)', isSupporting: false };
      if (rsi <= 30) return { label: 'Oversold', color: 'text-amber-400', signal: 'Approaching oversold', isSupporting: false };
    }
    // For LONG trades
    else {
      if (rsi <= 20) return { label: 'Extremely Oversold', color: 'text-green-400', signal: 'Strong buy signal', isSupporting: true };
      if (rsi <= 30) return { label: 'Oversold', color: 'text-green-300', signal: 'Buy signal', isSupporting: true };
      if (rsi >= 80) return { label: 'Extremely Overbought', color: 'text-red-400', signal: 'Already overbought (risky)', isSupporting: false };
      if (rsi >= 70) return { label: 'Overbought', color: 'text-amber-400', signal: 'Approaching overbought', isSupporting: false };
    }
    
    return { label: 'Neutral', color: 'text-muted-foreground', signal: 'No clear signal', isSupporting: false };
  };

  // MACD interpretation - CONTEXT-AWARE of trade direction
  const getMACDInterpretation = (histogram: number | null | undefined, isShort: boolean): { label: string; color: string; signal: string; isSupporting: boolean } => {
    if (histogram == null) return { label: 'N/A', color: 'text-muted-foreground', signal: 'No data', isSupporting: false };
    
    if (Math.abs(histogram) < 0.05) return { label: 'Crossover Imminent', color: 'text-amber-400', signal: 'Watch closely', isSupporting: false };
    
    // For SHORT trades
    if (isShort) {
      if (histogram > 0.5) return { label: 'Against Position', color: 'text-red-400', signal: 'Strong upward momentum', isSupporting: false };
      if (histogram > 0) return { label: 'Against Position', color: 'text-amber-400', signal: 'Upward momentum', isSupporting: false };
      if (histogram < -0.5) return { label: 'Supports Short', color: 'text-green-400', signal: 'Strong downward momentum', isSupporting: true };
      if (histogram < 0) return { label: 'Supports Short', color: 'text-green-300', signal: 'Downward momentum', isSupporting: true };
    }
    // For LONG trades
    else {
      if (histogram > 0.5) return { label: 'Supports Long', color: 'text-green-400', signal: 'Strong upward momentum', isSupporting: true };
      if (histogram > 0) return { label: 'Supports Long', color: 'text-green-300', signal: 'Upward momentum', isSupporting: true };
      if (histogram < -0.5) return { label: 'Against Position', color: 'text-red-400', signal: 'Strong downward momentum', isSupporting: false };
      if (histogram < 0) return { label: 'Against Position', color: 'text-amber-400', signal: 'Downward momentum', isSupporting: false };
    }
    
    return { label: 'Neutral', color: 'text-muted-foreground', signal: 'No trend', isSupporting: false };
  };

  // Volume interpretation (handle both null and undefined)
  const getVolumeInterpretation = (ratio: number | null | undefined): { label: string; color: string; signal: string } => {
    if (ratio == null) return { label: 'N/A', color: 'text-muted-foreground', signal: 'No data' };
    
    if (ratio >= 5) return { label: 'Institutional Flow', color: 'text-green-400', signal: 'Major interest' };
    if (ratio >= 3) return { label: 'Exceptional (3x+)', color: 'text-green-300', signal: 'High conviction' };
    if (ratio >= 2) return { label: 'Strong (2x+)', color: 'text-blue-400', signal: 'Above average' };
    if (ratio >= 1.5) return { label: 'Above Average', color: 'text-blue-300', signal: 'Confirmed' };
    if (ratio >= 1.2) return { label: 'Confirmed', color: 'text-muted-foreground', signal: 'Normal' };
    return { label: 'Below Average', color: 'text-amber-400', signal: 'Weak confirmation' };
  };

  const isShort = idea.direction === 'SHORT';
  const rsiInfo = getRSIInterpretation(idea.rsiValue, isShort);
  const macdInfo = getMACDInterpretation(idea.macdHistogram, isShort);
  const volumeInfo = getVolumeInterpretation(idea.volumeRatio);

  return (
    <Card className="bg-card/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Signal Breakdown - Why This Idea?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* RSI Indicator */}
        {idea.rsiValue != null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">RSI (14-period Wilder's)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono">{idea.rsiValue.toFixed(1)}</span>
                <Badge variant="outline" className={rsiInfo.color}>
                  {rsiInfo.label}
                </Badge>
              </div>
            </div>
            <Progress value={idea.rsiValue} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {rsiInfo.signal} - {
                isShort
                  ? (idea.rsiValue >= 70 
                      ? 'Price overbought, good short entry signal' 
                      : idea.rsiValue <= 30 
                        ? 'Price already oversold - shorting here is risky' 
                        : 'RSI in neutral zone')
                  : (idea.rsiValue <= 30 
                      ? 'Price oversold, good long entry signal' 
                      : idea.rsiValue >= 70 
                        ? 'Price already overbought - buying here is risky' 
                        : 'RSI in neutral zone')
              }
            </p>
          </div>
        )}

        {/* MACD Indicator - Show if ANY MACD component is present */}
        {(idea.macdHistogram != null || idea.macdLine != null || idea.macdSignal != null) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">MACD (12/26/9 EMA)</span>
              </div>
              {idea.macdHistogram != null && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold font-mono">
                    {idea.macdHistogram > 0 ? '+' : ''}{idea.macdHistogram.toFixed(3)}
                  </span>
                  <Badge variant="outline" className={macdInfo.color}>
                    {macdInfo.label}
                  </Badge>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">MACD Line:</span>
                <span className="ml-1 font-mono">{idea.macdLine != null ? idea.macdLine.toFixed(3) : 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Signal:</span>
                <span className="ml-1 font-mono">{idea.macdSignal != null ? idea.macdSignal.toFixed(3) : 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Histogram:</span>
                <span className="ml-1 font-mono">{idea.macdHistogram != null ? idea.macdHistogram.toFixed(3) : 'N/A'}</span>
              </div>
            </div>
            {idea.macdHistogram != null && (
              <p className="text-xs text-muted-foreground">
                {macdInfo.signal} - {
                  Math.abs(idea.macdHistogram) < 0.05 
                    ? 'MACD lines near crossover, potential trend change' 
                    : isShort
                      ? (idea.macdHistogram > 0 
                          ? 'MACD above signal line (upward momentum contradicts short position)' 
                          : 'MACD below signal line, confirming bearish setup')
                      : (idea.macdHistogram > 0 
                          ? 'MACD above signal line, confirming bullish setup' 
                          : 'MACD below signal line (downward momentum contradicts long position)')
                }
              </p>
            )}
          </div>
        )}

        {/* Volume Analysis */}
        {idea.volumeRatio != null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Volume vs Average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono">{idea.volumeRatio.toFixed(1)}x</span>
                <Badge variant="outline" className={volumeInfo.color}>
                  {volumeInfo.label}
                </Badge>
              </div>
            </div>
            <Progress value={Math.min(idea.volumeRatio * 20, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {volumeInfo.signal} - {idea.volumeRatio >= 3 ? 'Unusually high volume suggests institutional activity' : idea.volumeRatio >= 1.5 ? 'Above average volume confirms price move' : 'Volume confirms trade validity'}
            </p>
          </div>
        )}

        {/* 52-Week High/Low Distance */}
        {(idea.priceVs52WeekHigh != null || idea.priceVs52WeekLow != null) && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">52-Week Range Position</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {idea.priceVs52WeekHigh != null && (
                <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                  <span className="text-muted-foreground">From High:</span>
                  <span className="font-mono text-red-400">{idea.priceVs52WeekHigh.toFixed(1)}%</span>
                </div>
              )}
              {idea.priceVs52WeekLow != null && (
                <div className="flex items-center justify-between p-2 bg-background/50 rounded">
                  <span className="text-muted-foreground">From Low:</span>
                  <span className="font-mono text-green-400">{formatPercent(idea.priceVs52WeekLow, 1)}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {idea.priceVs52WeekHigh && Math.abs(idea.priceVs52WeekHigh) < 5 
                ? 'Near 52-week high - breakout potential or resistance zone' 
                : idea.priceVs52WeekLow && idea.priceVs52WeekLow < 5 
                  ? 'Near 52-week low - reversal opportunity or support test'
                  : 'Trading within historical range'}
            </p>
          </div>
        )}

        {/* Confidence Score Breakdown */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Confidence Breakdown</span>
            <span className="text-sm font-bold">{idea.confidenceScore}/100</span>
          </div>
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {idea.qualitySignals.map((signal, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-xs"
                  data-testid={`quality-signal-${idx}`}
                >
                  {signal}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Data Source Attribution */}
        {idea.dataSourceUsed && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              📊 Data Source: <span className="font-medium capitalize">{idea.dataSourceUsed}</span>
              {idea.dataSourceUsed === 'estimated' && ' (Tradier API needed for real options data)'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
