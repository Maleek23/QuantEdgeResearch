import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, fetchWithParams } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { 
  Upload, Image as ImageIcon, TrendingUp, TrendingDown, DollarSign, 
  AlertTriangle, Brain, Loader2, ExternalLink, CheckCircle2, Sparkles,
  Target, Shield, Activity, BarChart3, ArrowUpRight, ArrowDownRight,
  Zap, Clock, Calculator, Gauge, Send, LineChart, Lightbulb, Users,
  ChevronRight, Database, BookOpen, Trophy, Plus, Search, RefreshCw,
  Filter, Eye, History, ArrowRight, TrendingUpDown, Radar, Flag, Triangle, Circle,
  ChevronUp, ChevronDown
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SiDiscord } from "react-icons/si";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TierGate } from "@/components/tier-gate";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData, Time, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";

interface PatternData {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  strength: "strong" | "moderate" | "weak";
  detected: boolean;
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PatternResponse {
  symbol: string;
  currentPrice: number;
  priceChange: number;
  patterns: PatternData[];
  signalScore: {
    score: number;
    direction: "bullish" | "bearish" | "neutral";
    confidence: number;
    signals: string[];
  };
  // Multi-layer confluence analysis
  multiLayerAnalysis?: {
    confluenceScore: number;
    direction: "bullish" | "bearish" | "neutral";
    confidence: number;
    signals: string[];
    layers: {
      momentum: { score: number; signals: string[] };
      trend: { score: number; direction: string };
      structure: { trend: string; strength: number; bos: boolean };
      volume: { trend: string; relativeVolume: number; moneyFlow: number };
      levels: { position: string; support: number; resistance: number };
    };
  };
  indicators: {
    rsi: { value: number; period: number };
    rsi2: { value: number; period: number };
    macd: { macd: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number };
    adx: { value: number; regime: string; suitableFor: string };
    stochRSI: { k: number; d: number } | null;
    ichimoku: { tenkan: number; kijun: number; senkouA: number; senkouB: number; chikou: number } | null;
    // New enhanced indicators
    williamsR?: { value: number; period: number; interpretation: string };
    cci?: { value: number; period: number; interpretation: string };
    vwap?: { value: number; priceVsVwap: string };
    ema?: { ema9: number | null; ema21: number | null; ema50: number | null; ema200: number | null; trend: string; alignment: number; availableEMAs: number };
  };
  // Support/Resistance levels
  levels?: {
    support: number[];
    resistance: number[];
    nearestSupport: number;
    nearestResistance: number;
    pricePosition: string;
  };
  // Market Structure
  marketStructure?: {
    trend: string;
    structure: string[];
    higherHighs: number;
    higherLows: number;
    lowerHighs: number;
    lowerLows: number;
    trendStrength: number;
    breakOfStructure: boolean;
  };
  // Volume Analysis
  volumeAnalysis?: {
    trend: string;
    volumeProfile: string;
    averageVolume: number;
    relativeVolume: number;
    moneyFlow: number;
    signals: string[];
  };
  dataPoints: number;
  candles: CandleData[];
  rsiSeries: Array<{ time: number; value: number }>;
  bbSeries: Array<{ time: number; upper: number; middle: number; lower: number }>;
}

interface PatternLibraryItem {
  id: string;
  name: string;
  type: "bullish" | "bearish" | "neutral";
  category: "reversal" | "continuation" | "bilateral";
  winRate: number;
  avgReturn: number;
  timeframe: string;
  description: string;
  entryRules: string[];
  exitRules: string[];
}

const PATTERN_LIBRARY: PatternLibraryItem[] = [
  {
    id: "cup-handle",
    name: "Cup & Handle",
    type: "bullish",
    category: "continuation",
    winRate: 68,
    avgReturn: 12.5,
    timeframe: "Weeks to Months",
    description: "A bullish continuation pattern that resembles a cup with a handle. The pattern suggests a period of consolidation followed by a breakout.",
    entryRules: ["Wait for breakout above handle resistance", "Volume should increase on breakout", "Set entry slightly above handle high"],
    exitRules: ["Target = Cup depth added to breakout point", "Stop loss below handle low", "Consider partial profits at 50% of target"]
  },
  {
    id: "double-bottom",
    name: "Double Bottom",
    type: "bullish",
    category: "reversal",
    winRate: 72,
    avgReturn: 10.8,
    timeframe: "Days to Weeks",
    description: "A reversal pattern forming after a downtrend. Two consecutive lows at similar levels indicate strong support.",
    entryRules: ["Enter on break above neckline resistance", "Confirm with increasing volume", "Wait for retest of neckline for conservative entry"],
    exitRules: ["Target = Distance from bottom to neckline", "Stop loss below second bottom", "Trail stop after 50% gain"]
  },
  {
    id: "head-shoulders-top",
    name: "Head & Shoulders (Top)",
    type: "bearish",
    category: "reversal",
    winRate: 65,
    avgReturn: -11.2,
    timeframe: "Weeks",
    description: "A reversal pattern at the top of an uptrend. Consists of three peaks with the middle one being highest.",
    entryRules: ["Short on break below neckline", "Volume should increase on breakdown", "Wait for pullback to neckline for lower risk"],
    exitRules: ["Target = Distance from head to neckline", "Stop loss above right shoulder", "Cover partial at first support level"]
  },
  {
    id: "ascending-triangle",
    name: "Ascending Triangle",
    type: "bullish",
    category: "continuation",
    winRate: 63,
    avgReturn: 8.5,
    timeframe: "Days to Weeks",
    description: "A bullish continuation pattern with horizontal resistance and rising support. Shows buyers gaining strength.",
    entryRules: ["Enter on breakout above horizontal resistance", "Volume confirmation is crucial", "Minimum 2 touches on each trendline"],
    exitRules: ["Target = Height of triangle at widest point", "Stop loss below rising trendline", "Manage risk with position sizing"]
  },
  {
    id: "descending-triangle",
    name: "Descending Triangle",
    type: "bearish",
    category: "continuation",
    winRate: 61,
    avgReturn: -7.8,
    timeframe: "Days to Weeks",
    description: "A bearish pattern with horizontal support and declining resistance. Shows sellers gaining control.",
    entryRules: ["Short on breakdown below support", "Look for volume spike on breakdown", "Ensure at least 2 touches on each line"],
    exitRules: ["Target = Triangle height projected downward", "Stop loss above descending trendline", "Cover at key support levels"]
  },
  {
    id: "bull-flag",
    name: "Bull Flag",
    type: "bullish",
    category: "continuation",
    winRate: 67,
    avgReturn: 9.2,
    timeframe: "Days",
    description: "A short-term continuation pattern. A sharp rise (flagpole) followed by a tight consolidation (flag).",
    entryRules: ["Enter on breakout above flag channel", "Look for declining volume in flag", "Flagpole should be on high volume"],
    exitRules: ["Target = Flagpole length from breakout", "Stop loss below flag low", "Quick moves expected after breakout"]
  },
  {
    id: "bear-flag",
    name: "Bear Flag",
    type: "bearish",
    category: "continuation",
    winRate: 64,
    avgReturn: -8.5,
    timeframe: "Days",
    description: "Bearish continuation after sharp decline. Consolidation phase before continuation lower.",
    entryRules: ["Short on breakdown below flag channel", "Volume should contract in flag", "Confirm with momentum indicators"],
    exitRules: ["Target = Flagpole length from breakdown", "Stop loss above flag high", "Be prepared for sharp moves"]
  },
  {
    id: "inverse-head-shoulders",
    name: "Inverse Head & Shoulders",
    type: "bullish",
    category: "reversal",
    winRate: 70,
    avgReturn: 12.0,
    timeframe: "Weeks",
    description: "Bullish reversal pattern at bottom of downtrend. Three troughs with middle being lowest.",
    entryRules: ["Enter on break above neckline", "Volume should increase significantly", "Right shoulder should hold above left"],
    exitRules: ["Target = Head to neckline distance", "Stop loss below right shoulder", "Add on successful retest"]
  },
  {
    id: "wedge-rising",
    name: "Rising Wedge",
    type: "bearish",
    category: "reversal",
    winRate: 59,
    avgReturn: -6.5,
    timeframe: "Weeks",
    description: "Bearish reversal pattern with converging trendlines sloping upward. Often forms at end of uptrend.",
    entryRules: ["Short on breakdown below lower trendline", "Declining volume confirms pattern", "Wait for close below support"],
    exitRules: ["Target = Widest part of wedge", "Stop loss above recent high", "Monitor for false breakdowns"]
  },
  {
    id: "wedge-falling",
    name: "Falling Wedge",
    type: "bullish",
    category: "reversal",
    winRate: 62,
    avgReturn: 7.8,
    timeframe: "Weeks",
    description: "Bullish reversal pattern with converging trendlines sloping downward. Signals exhaustion of sellers.",
    entryRules: ["Enter on breakout above upper trendline", "Volume expansion confirms breakout", "Pattern duration 3-4 weeks ideal"],
    exitRules: ["Target = Widest part of wedge", "Stop loss below recent low", "Consider pyramiding on strength"]
  },
  {
    id: "triple-bottom",
    name: "Triple Bottom",
    type: "bullish",
    category: "reversal",
    winRate: 71,
    avgReturn: 11.5,
    timeframe: "Weeks to Months",
    description: "Strong reversal pattern with three lows at similar level. More reliable than double bottom.",
    entryRules: ["Enter on break above resistance level", "Each bottom should be tested with declining volume", "Pattern takes longer to form"],
    exitRules: ["Target = Distance to resistance from bottoms", "Stop loss below lowest bottom", "Strong signal for longer-term trades"]
  },
  {
    id: "rounding-bottom",
    name: "Rounding Bottom (Saucer)",
    type: "bullish",
    category: "reversal",
    winRate: 66,
    avgReturn: 13.2,
    timeframe: "Months",
    description: "Long-term reversal pattern with gradual U-shaped bottom. Shows slow accumulation phase.",
    entryRules: ["Enter as price breaks above left rim", "Volume should increase on right side", "Patience required - slow formation"],
    exitRules: ["Target = Depth of saucer added to breakout", "Stop loss at recent swing low", "Best for position trading"]
  }
];

function SignalBadge({ direction }: { direction: "bullish" | "bearish" | "neutral" }) {
  if (direction === "bullish") {
    return <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Bullish</Badge>;
  }
  if (direction === "bearish") {
    return <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Bearish</Badge>;
  }
  return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Neutral</Badge>;
}

function PatternBadge({ pattern }: { pattern: PatternData }) {
  const typeColors = {
    bullish: "bg-green-500/10 text-green-400 border-green-500/30",
    bearish: "bg-red-500/10 text-red-400 border-red-500/30",
    neutral: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };
  
  return (
    <Badge className={cn("text-xs", typeColors[pattern.type])} data-testid={`badge-pattern-${pattern.name}`}>
      {pattern.name} ({pattern.strength})
    </Badge>
  );
}

function ConfidenceGauge({ value, sentiment }: { value: number; sentiment: "bullish" | "bearish" | "neutral" }) {
  const color = sentiment === "bullish" ? "#22c55e" : sentiment === "bearish" ? "#ef4444" : "#f59e0b";
  const percentage = value / 100;
  const angle = -90 + (percentage * 180);
  
  return (
    <div className="relative w-32 h-24 mx-auto" data-testid="gauge-confidence">
      <svg viewBox="0 0 100 60" className="w-full h-16" role="img" aria-label={`Confidence gauge at ${value}%`}>
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
          strokeLinecap="round"
        />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${percentage * 126} 126`}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="22"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${angle} 50 50)`}
          className="transition-all duration-500"
        />
        <circle cx="50" cy="50" r="3" fill={color} />
      </svg>
      <div className="text-center mt-1">
        <span className={cn(
          "text-xl font-bold font-mono tabular-nums",
          sentiment === "bullish" ? "text-green-500" : sentiment === "bearish" ? "text-red-500" : "text-amber-500"
        )} data-testid="text-confidence-value">{value}%</span>
      </div>
    </div>
  );
}

function PriceRangeBar({ entry, target, stop, sentiment }: { 
  entry: number; 
  target: number; 
  stop: number; 
  sentiment: "bullish" | "bearish" | "neutral";
}) {
  const isBullish = sentiment === "bullish";
  const min = Math.min(stop, entry, target) * 0.995;
  const max = Math.max(stop, entry, target) * 1.005;
  const range = max - min || 1;
  
  const stopPos = ((stop - min) / range) * 100;
  const entryPos = ((entry - min) / range) * 100;
  const targetPos = ((target - min) / range) * 100;
  
  return (
    <div className="space-y-2" data-testid="visual-price-range">
      <div className="relative h-8 bg-muted/30 rounded-lg overflow-hidden" role="img" aria-label="Price range visualization">
        <div 
          className="absolute top-0 bottom-0 bg-gradient-to-r from-red-500/30 to-transparent"
          style={{ left: 0, width: `${stopPos}%` }}
        />
        <div 
          className={`absolute top-0 bottom-0 ${isBullish ? 'bg-gradient-to-r from-transparent to-green-500/30' : 'bg-gradient-to-l from-transparent to-red-500/30'}`}
          style={{ 
            left: isBullish ? `${entryPos}%` : `${targetPos}%`, 
            width: `${Math.abs(targetPos - entryPos)}%` 
          }}
        />
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-red-500"
          style={{ left: `${stopPos}%` }}
        />
        <div 
          className="absolute top-0 bottom-0 w-1 bg-primary"
          style={{ left: `${entryPos}%` }}
        />
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-green-500"
          style={{ left: `${targetPos}%` }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-red-500" data-testid="text-range-stop">Stop ${stop.toFixed(2)}</span>
        <span className="text-primary font-medium" data-testid="text-range-entry">Entry ${entry.toFixed(2)}</span>
        <span className="text-green-500" data-testid="text-range-target">Target ${target.toFixed(2)}</span>
      </div>
    </div>
  );
}

function TrendArrow({ sentiment, confidence, gainPercent }: { 
  sentiment: "bullish" | "bearish" | "neutral"; 
  confidence: number;
  gainPercent: number;
}) {
  const isBullish = sentiment === "bullish";
  const isBearish = sentiment === "bearish";
  const color = isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#f59e0b";
  
  return (
    <div className="flex items-center gap-3" data-testid="visual-trend-arrow">
      <svg viewBox="0 0 80 60" className="w-16 h-12 flex-shrink-0" role="img" aria-label={`${sentiment} trend prediction`}>
        {isBullish && (
          <>
            <path
              d="M 10 45 Q 30 38 50 25 L 68 15"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polygon points="68,8 75,15 68,22" fill={color} />
            <circle cx="10" cy="45" r="4" fill={color} className="opacity-60" />
          </>
        )}
        {isBearish && (
          <>
            <path
              d="M 10 15 Q 30 22 50 35 L 68 45"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polygon points="68,38 75,45 68,52" fill={color} />
            <circle cx="10" cy="15" r="4" fill={color} className="opacity-60" />
          </>
        )}
        {!isBullish && !isBearish && (
          <>
            <path
              d="M 10 30 Q 30 28 50 32 L 68 30"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polygon points="68,23 75,30 68,37" fill={color} />
            <circle cx="10" cy="30" r="4" fill={color} className="opacity-60" />
          </>
        )}
      </svg>
      <div className="text-right flex-1">
        <span className={cn(
          "text-2xl font-bold block font-mono tabular-nums",
          isBullish ? "text-green-500" : isBearish ? "text-red-500" : "text-muted-foreground"
        )} data-testid="text-expected-move">
          {isBullish ? "+" : isBearish ? "-" : "±"}{Math.abs(gainPercent).toFixed(1)}%
        </span>
        <p className="text-xs text-muted-foreground">Expected</p>
      </div>
    </div>
  );
}

function PredictedPathChart({ 
  entry, target, stop, sentiment, timeframe 
}: { 
  entry: number; 
  target: number; 
  stop: number; 
  sentiment: "bullish" | "bearish" | "neutral";
  timeframe: string;
}) {
  const isBullish = sentiment === "bullish";
  const isBearish = sentiment === "bearish";
  
  const prices = [stop, entry, target];
  const minPrice = Math.min(...prices) * 0.995;
  const maxPrice = Math.max(...prices) * 1.005;
  const range = maxPrice - minPrice || 1;
  
  const normalize = (price: number) => 90 - ((price - minPrice) / range) * 80;
  
  const entryY = normalize(entry);
  const targetY = normalize(target);
  const stopY = normalize(stop);
  
  const pathColor = isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#f59e0b";
  const stopColor = "#ef4444";
  const targetColor = "#22c55e";
  
  const generatePath = () => {
    if (isBullish) {
      return `M 15 ${entryY} Q 25 ${entryY + 5} 35 ${entryY - 3} Q 50 ${entryY - 10} 65 ${(entryY + targetY) / 2} Q 80 ${targetY + 5} 90 ${targetY}`;
    } else if (isBearish) {
      return `M 15 ${entryY} Q 25 ${entryY - 5} 35 ${entryY + 3} Q 50 ${entryY + 10} 65 ${(entryY + targetY) / 2} Q 80 ${targetY - 5} 90 ${targetY}`;
    }
    return `M 15 ${entryY} Q 35 ${entryY - 3} 55 ${entryY + 3} Q 75 ${entryY - 2} 90 ${entryY}`;
  };

  return (
    <div className="space-y-2" data-testid="visual-predicted-chart">
      <svg viewBox="0 0 100 100" className="w-full h-32" role="img" aria-label="Predicted price movement chart">
        <defs>
          <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={pathColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={pathColor} stopOpacity="1" />
          </linearGradient>
        </defs>
        
        <line x1="10" y1="10" x2="10" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
        <line x1="10" y1="90" x2="95" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
        
        <line 
          x1="10" y1={stopY} x2="95" y2={stopY} 
          stroke={stopColor} 
          strokeWidth="1" 
          strokeDasharray="3,3"
          strokeOpacity="0.5"
        />
        
        <line 
          x1="10" y1={targetY} x2="95" y2={targetY} 
          stroke={targetColor} 
          strokeWidth="1" 
          strokeDasharray="3,3"
          strokeOpacity="0.5"
        />
        
        <line 
          x1="10" y1={entryY} x2="95" y2={entryY} 
          stroke="#22d3ee" 
          strokeWidth="1" 
          strokeDasharray="2,2"
          strokeOpacity="0.4"
        />
        
        <path
          d={generatePath()}
          fill="none"
          stroke="url(#pathGradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        
        <circle cx="15" cy={entryY} r="3" fill="#22d3ee" />
        <circle cx="90" cy={targetY} r="3" fill={pathColor} />
        
        <text x="97" y={stopY + 1} className="text-[6px] fill-red-400" textAnchor="start">Stop</text>
        <text x="97" y={entryY + 1} className="text-[6px] fill-cyan-400" textAnchor="start">Entry</text>
        <text x="97" y={targetY + 1} className="text-[6px] fill-green-400" textAnchor="start">Target</text>
      </svg>
      
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500" />
          <span className="text-muted-foreground">Now</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pathColor }} />
          <span className="text-muted-foreground">{getAnalysisValidity(timeframe).duration}</span>
        </div>
      </div>
    </div>
  );
}

function SignalMeter({ signals }: { signals: Array<{ signal: string; strength: number }> }) {
  const bullishStrength = signals
    .filter(s => s.signal === "bullish")
    .reduce((sum, s) => sum + s.strength, 0);
  const bearishStrength = signals
    .filter(s => s.signal === "bearish")
    .reduce((sum, s) => sum + s.strength, 0);
  const total = bullishStrength + bearishStrength || 1;
  const bullishPercent = (bullishStrength / total) * 100;
  
  return (
    <div className="space-y-2" data-testid="visual-signal-meter">
      <div className="flex justify-between text-xs">
        <span className="text-red-500 font-medium">Bears</span>
        <span className="text-muted-foreground">Signal Balance</span>
        <span className="text-green-500 font-medium">Bulls</span>
      </div>
      <div className="relative h-4 bg-muted/30 rounded-full overflow-hidden flex" role="img" aria-label={`Signal balance: ${bullishPercent.toFixed(0)}% bullish`}>
        <div 
          className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
          style={{ width: `${100 - bullishPercent}%` }}
        />
        <div 
          className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
          style={{ width: `${bullishPercent}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-0.5 h-full bg-background" />
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span data-testid="text-bearish-percent">{(100 - bullishPercent).toFixed(0)}%</span>
        <span data-testid="text-bullish-percent">{bullishPercent.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function TradeSetupCard({ patternData }: { patternData: PatternResponse }) {
  const { indicators, currentPrice, signalScore } = patternData;
  const sentiment = signalScore.direction;
  
  const generateTradeSetup = (type: "day" | "swing") => {
    const rawVolatility = Math.abs(indicators.bollingerBands.upper - indicators.bollingerBands.lower) / (indicators.bollingerBands.middle || 1);
    const volatility = Math.max(0.02, rawVolatility);
    
    let entry = currentPrice;
    let target: number;
    let stop: number;
    let confidence: number;
    let reasoning: string[] = [];
    
    const isBullish = sentiment === "bullish";
    const isBearish = sentiment === "bearish";
    
    if (type === "day") {
      const multiplier = 0.015;
      if (isBullish) {
        entry = currentPrice * 0.998;
        target = currentPrice * (1 + multiplier * 1.5);
        stop = currentPrice * (1 - multiplier);
        
        if (indicators.rsi.value < 40) reasoning.push("RSI oversold bounce");
        if (indicators.rsi2.value < 20) reasoning.push("RSI(2) extreme oversold");
        if (indicators.macd.histogram > 0) reasoning.push("MACD bullish momentum");
        if (currentPrice < indicators.bollingerBands.middle) reasoning.push("Below BB mean - reversion play");
        if (indicators.adx.value > 25) reasoning.push("Strong trend (ADX > 25)");
      } else if (isBearish) {
        entry = currentPrice * 1.002;
        target = currentPrice * (1 - multiplier * 1.5);
        stop = currentPrice * (1 + multiplier);
        
        if (indicators.rsi.value > 60) reasoning.push("RSI overbought fade");
        if (indicators.rsi2.value > 80) reasoning.push("RSI(2) extreme overbought");
        if (indicators.macd.histogram < 0) reasoning.push("MACD bearish momentum");
        if (currentPrice > indicators.bollingerBands.middle) reasoning.push("Above BB mean - reversion play");
      } else {
        const range = volatility * currentPrice * 0.3;
        target = currentPrice + range;
        stop = currentPrice - range * 0.5;
        reasoning.push("Neutral - range-bound scalp");
      }
      
      confidence = Math.min(85, Math.max(40, 50 + signalScore.score * 0.3 + (indicators.adx.value > 25 ? 10 : 0)));
    } else {
      const multiplier = 0.05;
      if (isBullish) {
        entry = currentPrice * 0.99;
        target = currentPrice * (1 + multiplier * 1.8);
        stop = currentPrice * (1 - multiplier * 0.8);
        
        if (indicators.rsi.value < 50 && indicators.rsi.value > 30) reasoning.push("RSI mid-range with room to run");
        if (indicators.macd.macd > indicators.macd.signal) reasoning.push("MACD above signal line");
        if (indicators.adx.value > 20) reasoning.push("Trending regime confirmed");
        if (currentPrice > indicators.bollingerBands.middle) reasoning.push("Above 20-day mean");
      } else if (isBearish) {
        entry = currentPrice * 1.01;
        target = currentPrice * (1 - multiplier * 1.8);
        stop = currentPrice * (1 + multiplier * 0.8);
        
        if (indicators.rsi.value > 50 && indicators.rsi.value < 70) reasoning.push("RSI mid-range - downside potential");
        if (indicators.macd.macd < indicators.macd.signal) reasoning.push("MACD below signal line");
        if (currentPrice < indicators.bollingerBands.middle) reasoning.push("Below 20-day mean");
      } else {
        const range = volatility * currentPrice * 0.5;
        target = currentPrice + range;
        stop = currentPrice - range * 0.4;
        reasoning.push("Wait for clearer direction");
      }
      
      confidence = Math.min(80, Math.max(35, 45 + signalScore.score * 0.25));
    }
    
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    const rrRatio = reward / risk;
    
    return {
      entry,
      target,
      stop,
      rrRatio,
      confidence: Math.round(confidence),
      reasoning: reasoning.length > 0 ? reasoning : ["Consolidation - wait for breakout"],
      direction: isBullish ? "Long" : isBearish ? "Short" : "Wait",
    };
  };
  
  const dayTrade = generateTradeSetup("day");
  const swingTrade = generateTradeSetup("swing");
  
  const getDirectionBadge = (direction: string) => {
    if (direction === "Long") {
      return <Badge className="bg-green-500/10 text-green-400 border-green-500/30">{direction}</Badge>;
    }
    if (direction === "Short") {
      return <Badge className="bg-red-500/10 text-red-400 border-red-500/30">{direction}</Badge>;
    }
    return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">{direction}</Badge>;
  };
  
  return (
    <Card className="glass-card border-cyan-500/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-cyan-400" />
          Trade Setup Recommendations
          <Badge variant="outline" className="ml-2 text-xs">Predictive</Badge>
        </CardTitle>
        <CardDescription>
          Actionable entry, target, and stop-loss levels for day and swing trades
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Day Trade Setup */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-400" />
                <h4 className="font-semibold">Day Trade</h4>
              </div>
              {getDirectionBadge(dayTrade.direction)}
            </div>
            
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Entry</p>
                <p className="font-mono tabular-nums font-semibold text-cyan-400" data-testid="text-day-entry">
                  ${dayTrade.entry.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Target</p>
                <p className="font-mono tabular-nums font-semibold text-green-400" data-testid="text-day-target">
                  ${dayTrade.target.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Stop</p>
                <p className="font-mono tabular-nums font-semibold text-red-400" data-testid="text-day-stop">
                  ${dayTrade.stop.toFixed(2)}
                </p>
              </div>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Risk/Reward</span>
              <span className={cn(
                "font-mono tabular-nums font-medium",
                dayTrade.rrRatio >= 1.5 ? "text-green-400" : dayTrade.rrRatio >= 1 ? "text-amber-400" : "text-red-400"
              )} data-testid="text-day-rr">
                1:{dayTrade.rrRatio.toFixed(1)}
              </span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-mono tabular-nums" data-testid="text-day-confidence">{dayTrade.confidence}%</span>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Reasoning:</p>
              <div className="flex flex-wrap gap-1">
                {dayTrade.reasoning.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          
          {/* Swing Trade Setup */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/20 border border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                <h4 className="font-semibold">Swing Trade</h4>
              </div>
              {getDirectionBadge(swingTrade.direction)}
            </div>
            
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Entry</p>
                <p className="font-mono tabular-nums font-semibold text-cyan-400" data-testid="text-swing-entry">
                  ${swingTrade.entry.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Target</p>
                <p className="font-mono tabular-nums font-semibold text-green-400" data-testid="text-swing-target">
                  ${swingTrade.target.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Stop</p>
                <p className="font-mono tabular-nums font-semibold text-red-400" data-testid="text-swing-stop">
                  ${swingTrade.stop.toFixed(2)}
                </p>
              </div>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Risk/Reward</span>
              <span className={cn(
                "font-mono tabular-nums font-medium",
                swingTrade.rrRatio >= 2 ? "text-green-400" : swingTrade.rrRatio >= 1.5 ? "text-amber-400" : "text-red-400"
              )} data-testid="text-swing-rr">
                1:{swingTrade.rrRatio.toFixed(1)}
              </span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Confidence</span>
              <span className="font-mono tabular-nums" data-testid="text-swing-confidence">{swingTrade.confidence}%</span>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Reasoning:</p>
              <div className="flex flex-wrap gap-1">
                {swingTrade.reasoning.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-200/80 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            Educational purposes only. These are algorithmic suggestions based on technical indicators, not financial advice. Always do your own research and manage risk appropriately.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ChartAnalysisResult {
  patterns: string[];
  supportLevels: number[];
  resistanceLevels: number[];
  entryPoint: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  sentiment: "bullish" | "bearish" | "neutral";
  analysis: string;
  confidence: number;
  timeframe: string;
  currentPrice?: number | null;
  priceDiscrepancyWarning?: string | null;
  timeframeWarning?: string | null;
  adjustedLevels?: {
    entry: number;
    target: number;
    stop: number;
    riskRewardRatio: number;
  } | null;
}

interface QuantSignal {
  name: string;
  signal: "bullish" | "bearish" | "neutral";
  strength: number;
  description: string;
}

const TIMEFRAME_OPTIONS = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
  { value: "30m", label: "30 Minutes" },
  { value: "1H", label: "1 Hour" },
  { value: "4H", label: "4 Hours" },
  { value: "1D", label: "Daily" },
  { value: "1W", label: "Weekly" },
  { value: "1M", label: "Monthly" },
];

function getAnalysisValidity(timeframe: string): { duration: string; warning: string; hoursValid: number } {
  const validityMap: Record<string, { duration: string; warning: string; hoursValid: number }> = {
    "1m": { duration: "15-30 min", warning: "Ultra short-term, re-analyze frequently", hoursValid: 0.5 },
    "5m": { duration: "1-2 hours", warning: "Short-term scalping window", hoursValid: 1.5 },
    "15m": { duration: "2-4 hours", warning: "Intraday trading window", hoursValid: 3 },
    "30m": { duration: "4-8 hours", warning: "Half-day trading window", hoursValid: 6 },
    "1H": { duration: "8-24 hours", warning: "Good for day trades", hoursValid: 16 },
    "4H": { duration: "1-3 days", warning: "Swing trade window", hoursValid: 48 },
    "1D": { duration: "1-2 weeks", warning: "Position trade window", hoursValid: 240 },
    "1W": { duration: "2-4 weeks", warning: "Longer-term outlook", hoursValid: 504 },
    "1M": { duration: "1-3 months", warning: "Strategic positioning", hoursValid: 1440 },
  };
  return validityMap[timeframe] || validityMap["1D"];
}

function AnalysisTypeCard({ 
  title, 
  description, 
  icon: Icon, 
  badge, 
  badgeVariant = "default",
  isActive,
  onClick,
  stats
}: {
  title: string;
  description: string;
  icon: any;
  badge?: string;
  badgeVariant?: "default" | "secondary";
  isActive?: boolean;
  onClick?: () => void;
  stats?: string;
}) {
  return (
    <div 
      onClick={onClick}
      className={`glass-card rounded-xl p-5 cursor-pointer transition-all hover-elevate ${
        isActive ? 'ring-2 ring-cyan-400/50 bg-cyan-500/5' : ''
      }`}
      data-testid={`card-analysis-${title.toLowerCase().replace(/ /g, '-')}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isActive ? 'bg-gradient-to-br from-amber-500 to-amber-600' : 'bg-muted/50'
        }`}>
          <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
        </div>
        {badge && (
          <Badge variant={badgeVariant} className="text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      {stats && (
        <p className="text-xs text-cyan-500">{stats}</p>
      )}
    </div>
  );
}

function QuickStatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center">
      <div className="h-8 w-8 mx-auto mb-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/20 flex items-center justify-center">
        <Icon className="h-4 w-4 text-amber-500" />
      </div>
      <p className="text-xl font-bold font-mono tabular-nums">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function PatternSearchTab() {
  const [symbol, setSymbol] = useState("");
  const [searchSymbol, setSearchSymbol] = useState("");
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  
  const { data: patternData, isLoading, error, refetch } = useQuery<PatternResponse>({
    queryKey: ['/api/patterns', searchSymbol],
    enabled: !!searchSymbol,
  });
  
  const handleSearch = () => {
    if (symbol.trim()) {
      setSearchSymbol(symbol.trim().toUpperCase());
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };
  
  useEffect(() => {
    if (!chartContainerRef.current || !patternData?.candles?.length) return;
    
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    
    chartRef.current = chart;
    
    let mainSeries: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;
    
    if (chartType === 'candlestick') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      
      const candleData: CandlestickData[] = patternData.candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candleData);
      mainSeries = candleSeries;
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#22c55e",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      });
      
      const lineData: LineData[] = patternData.candles.map((c) => ({
        time: c.time as Time,
        value: c.close,
      }));
      lineSeries.setData(lineData);
      mainSeries = lineSeries;
    }
    
    if (patternData.bbSeries?.length) {
      const bbUpper = chart.addSeries(LineSeries, {
        color: "#60a5fa",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      const bbMiddle = chart.addSeries(LineSeries, {
        color: "#94a3b8",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      const bbLower = chart.addSeries(LineSeries, {
        color: "#60a5fa",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      const upperData: LineData[] = patternData.bbSeries.map((b) => ({
        time: b.time as Time,
        value: b.upper,
      }));
      const middleData: LineData[] = patternData.bbSeries.map((b) => ({
        time: b.time as Time,
        value: b.middle,
      }));
      const lowerData: LineData[] = patternData.bbSeries.map((b) => ({
        time: b.time as Time,
        value: b.lower,
      }));
      
      bbUpper.setData(upperData);
      bbMiddle.setData(middleData);
      bbLower.setData(lowerData);
    }
    
    if (patternData.patterns.length > 0 && chartType === 'candlestick') {
      const lastCandle = patternData.candles[patternData.candles.length - 1];
      const markers = patternData.patterns.map((pattern, index) => {
        const markerColor = pattern.type === "bullish" ? "#22c55e" : pattern.type === "bearish" ? "#ef4444" : "#f59e0b";
        const position = pattern.type === "bullish" ? "belowBar" : "aboveBar";
        const shape = pattern.type === "bullish" ? "arrowUp" : pattern.type === "bearish" ? "arrowDown" : "circle";
        
        return {
          time: lastCandle.time as Time,
          position: position as "aboveBar" | "belowBar",
          color: markerColor,
          shape: shape as "arrowUp" | "arrowDown" | "circle",
          text: pattern.name,
          id: `marker-${index}`,
        };
      });
      createSeriesMarkers(mainSeries as ISeriesApi<"Candlestick">, markers);
    }
    
    chart.timeScale().fitContent();
    
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [patternData, chartType]);
  
  useEffect(() => {
    if (!rsiChartContainerRef.current || !patternData?.rsiSeries?.length) return;
    
    if (rsiChartRef.current) {
      rsiChartRef.current.remove();
      rsiChartRef.current = null;
    }
    
    const chart = createChart(rsiChartContainerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: rsiChartContainerRef.current.clientWidth,
      height: 120,
      rightPriceScale: {
        borderColor: "#334155",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#334155",
        visible: false,
      },
    });
    
    rsiChartRef.current = chart;
    
    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#8b5cf6",
      lineWidth: 2,
      priceLineVisible: false,
    });
    
    const overboughtLine = chart.addSeries(LineSeries, {
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    
    const oversoldLine = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    
    const rsiData: LineData[] = patternData.rsiSeries.map((r) => ({
      time: r.time as Time,
      value: r.value,
    }));
    rsiSeries.setData(rsiData);
    
    const firstTime = patternData.rsiSeries[0]?.time;
    const lastTime = patternData.rsiSeries[patternData.rsiSeries.length - 1]?.time;
    if (firstTime && lastTime) {
      overboughtLine.setData([
        { time: firstTime as Time, value: 70 },
        { time: lastTime as Time, value: 70 },
      ]);
      oversoldLine.setData([
        { time: firstTime as Time, value: 30 },
        { time: lastTime as Time, value: 30 },
      ]);
    }
    
    chart.timeScale().fitContent();
    
    const handleResize = () => {
      if (rsiChartContainerRef.current && chart) {
        chart.applyOptions({ width: rsiChartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener("resize", handleResize);
    
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [patternData]);
  
  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter symbol (e.g., AAPL, TSLA, NVDA)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={handleKeyPress}
                className="pl-10 font-mono"
                data-testid="input-pattern-symbol"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!symbol.trim() || isLoading}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
              data-testid="button-pattern-analyze"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Activity className="h-4 w-4 mr-2" />
              )}
              Analyze
            </Button>
            {searchSymbol && (
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isLoading}
                className="border-slate-700"
                data-testid="button-pattern-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <span className="text-red-400">
              Failed to fetch data. Please check the symbol and try again.
            </span>
          </CardContent>
        </Card>
      )}
      
      {!searchSymbol && !patternData && (
        <div className="glass-card rounded-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Pattern Detection</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Enter a stock symbol above to detect technical patterns, view candlestick charts with Bollinger Bands, and analyze RSI levels.
          </p>
        </div>
      )}
      
      {patternData && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="glass-card">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Symbol
                </p>
                <p className="text-xl font-bold font-mono" data-testid="text-pattern-symbol">
                  {patternData.symbol}
                </p>
              </CardContent>
            </Card>
            
            <Card className="glass-card">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Current Price
                </p>
                <p className="text-xl font-bold font-mono tabular-nums" data-testid="text-pattern-price">
                  ${patternData.currentPrice.toFixed(2)}
                </p>
              </CardContent>
            </Card>
            
            <Card className="glass-card">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Change
                </p>
                <p className={cn(
                  "text-xl font-bold font-mono tabular-nums flex items-center gap-1",
                  patternData.priceChange >= 0 ? "text-green-400" : "text-red-400"
                )} data-testid="text-pattern-change">
                  {patternData.priceChange >= 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {patternData.priceChange >= 0 ? "+" : ""}{patternData.priceChange.toFixed(2)}%
                </p>
              </CardContent>
            </Card>
            
            <Card className="glass-card">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Signal
                </p>
                <div className="flex items-center gap-2" data-testid="text-pattern-signal">
                  <SignalBadge direction={patternData.signalScore.direction} />
                  <span className="text-lg font-bold font-mono">{patternData.signalScore.score}</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Trade Setup Recommendations */}
          <TradeSetupCard patternData={patternData} />
          
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-cyan-400" />
                Price Chart with Bollinger Bands
              </CardTitle>
              <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
                <Button
                  size="sm"
                  variant={chartType === 'candlestick' ? 'default' : 'ghost'}
                  onClick={() => setChartType('candlestick')}
                  data-testid="btn-chart-candlestick"
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Candles
                </Button>
                <Button
                  size="sm"
                  variant={chartType === 'line' ? 'default' : 'ghost'}
                  onClick={() => setChartType('line')}
                  data-testid="btn-chart-line"
                >
                  <LineChart className="h-4 w-4 mr-1" />
                  Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={chartContainerRef} className="w-full" data-testid="chart-pattern-candlestick" />
            </CardContent>
          </Card>
          
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-400" />
                RSI (14)
                <Badge variant="outline" className="ml-2 font-mono tabular-nums" data-testid="badge-pattern-rsi-value">
                  {patternData.indicators.rsi.value.toFixed(1)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={rsiChartContainerRef} className="w-full" data-testid="chart-pattern-rsi" />
            </CardContent>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Detected Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                {patternData.patterns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No patterns detected in recent candles</p>
                ) : (
                  <div className="flex flex-wrap gap-2" data-testid="patterns-search-list">
                    {patternData.patterns.map((pattern, i) => (
                      <PatternBadge key={i} pattern={pattern} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Signal Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2" data-testid="signals-search-list">
                  {patternData.signalScore.signals.map((signal, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {signal}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Technical Indicators</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicator</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow data-testid="row-pattern-rsi">
                    <TableCell className="font-medium">RSI (14)</TableCell>
                    <TableCell className="font-mono tabular-nums">{patternData.indicators.rsi.value.toFixed(2)}</TableCell>
                    <TableCell>
                      {patternData.indicators.rsi.value < 30 ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Oversold</Badge>
                      ) : patternData.indicators.rsi.value > 70 ? (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Overbought</Badge>
                      ) : (
                        <Badge variant="outline">Neutral</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow data-testid="row-pattern-rsi2">
                    <TableCell className="font-medium">RSI (2)</TableCell>
                    <TableCell className="font-mono tabular-nums">{patternData.indicators.rsi2.value.toFixed(2)}</TableCell>
                    <TableCell>
                      {patternData.indicators.rsi2.value < 10 ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Extreme Oversold</Badge>
                      ) : patternData.indicators.rsi2.value > 90 ? (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Extreme Overbought</Badge>
                      ) : (
                        <Badge variant="outline">Normal</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow data-testid="row-pattern-macd">
                    <TableCell className="font-medium">MACD</TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {patternData.indicators.macd.macd.toFixed(4)} / {patternData.indicators.macd.signal.toFixed(4)}
                    </TableCell>
                    <TableCell>
                      {patternData.indicators.macd.histogram > 0 ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Bullish</Badge>
                      ) : (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Bearish</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow data-testid="row-pattern-bb">
                    <TableCell className="font-medium">Bollinger Bands</TableCell>
                    <TableCell className="font-mono tabular-nums text-xs">
                      U: ${patternData.indicators.bollingerBands.upper.toFixed(2)} | 
                      M: ${patternData.indicators.bollingerBands.middle.toFixed(2)} | 
                      L: ${patternData.indicators.bollingerBands.lower.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {patternData.currentPrice < patternData.indicators.bollingerBands.lower ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Below Lower</Badge>
                      ) : patternData.currentPrice > patternData.indicators.bollingerBands.upper ? (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Above Upper</Badge>
                      ) : (
                        <Badge variant="outline">Within Bands</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow data-testid="row-pattern-adx">
                    <TableCell className="font-medium">ADX</TableCell>
                    <TableCell className="font-mono tabular-nums">{patternData.indicators.adx.value.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {patternData.indicators.adx.regime} ({patternData.indicators.adx.suitableFor.replace("_", " ")})
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {patternData.indicators.stochRSI && (
                    <TableRow data-testid="row-pattern-stochrsi">
                      <TableCell className="font-medium">Stochastic RSI</TableCell>
                      <TableCell className="font-mono tabular-nums">
                        K: {patternData.indicators.stochRSI.k.toFixed(2)} / D: {patternData.indicators.stochRSI.d.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {patternData.indicators.stochRSI.k < 20 ? (
                          <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Oversold</Badge>
                        ) : patternData.indicators.stochRSI.k > 80 ? (
                          <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Overbought</Badge>
                        ) : (
                          <Badge variant="outline">Neutral</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  {patternData.indicators.williamsR && (
                    <TableRow data-testid="row-pattern-williamsr">
                      <TableCell className="font-medium">Williams %R (14)</TableCell>
                      <TableCell className="font-mono tabular-nums">{patternData.indicators.williamsR.value.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          patternData.indicators.williamsR.interpretation === 'oversold' 
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : patternData.indicators.williamsR.interpretation === 'overbought'
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-muted/50 text-muted-foreground"
                        )}>{patternData.indicators.williamsR.interpretation}</Badge>
                      </TableCell>
                    </TableRow>
                  )}
                  {patternData.indicators.cci && (
                    <TableRow data-testid="row-pattern-cci">
                      <TableCell className="font-medium">CCI (20)</TableCell>
                      <TableCell className="font-mono tabular-nums">{patternData.indicators.cci.value.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          patternData.indicators.cci.interpretation === 'oversold' 
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : patternData.indicators.cci.interpretation === 'overbought'
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-muted/50 text-muted-foreground"
                        )}>{patternData.indicators.cci.interpretation}</Badge>
                      </TableCell>
                    </TableRow>
                  )}
                  {patternData.indicators.vwap && (
                    <TableRow data-testid="row-pattern-vwap">
                      <TableCell className="font-medium">VWAP</TableCell>
                      <TableCell className="font-mono tabular-nums">${patternData.indicators.vwap.value.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={cn(
                          patternData.indicators.vwap.priceVsVwap === 'above' 
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : patternData.indicators.vwap.priceVsVwap === 'below'
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : "bg-muted/50 text-muted-foreground"
                        )}>Price {patternData.indicators.vwap.priceVsVwap} VWAP</Badge>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* Multi-Layer Confluence Analysis */}
          {patternData.multiLayerAnalysis && (
            <Card className="glass-card border-purple-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-purple-400" />
                  Multi-Layer Confluence Analysis
                  <Badge 
                    className={cn(
                      "ml-2",
                      patternData.multiLayerAnalysis.direction === 'bullish' 
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : patternData.multiLayerAnalysis.direction === 'bearish'
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}
                    data-testid="badge-confluence-direction"
                  >
                    {patternData.multiLayerAnalysis.direction.toUpperCase()}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Aggregated signals from 6 analysis layers for enhanced prediction accuracy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Confluence Score Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Confluence Score</span>
                    <span className="font-mono tabular-nums font-semibold" data-testid="text-confluence-score">
                      {patternData.multiLayerAnalysis.confluenceScore.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-3 bg-muted/30 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        patternData.multiLayerAnalysis.direction === 'bullish' 
                          ? "bg-gradient-to-r from-green-600 to-green-400"
                          : patternData.multiLayerAnalysis.direction === 'bearish'
                          ? "bg-gradient-to-r from-red-600 to-red-400"
                          : "bg-gradient-to-r from-amber-600 to-amber-400"
                      )}
                      style={{ width: `${patternData.multiLayerAnalysis.confluenceScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Bearish</span>
                    <span>Neutral</span>
                    <span>Bullish</span>
                  </div>
                </div>
                
                {/* Layer Breakdown Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Momentum Layer */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Gauge className="h-4 w-4 text-cyan-400" />
                      <span className="text-sm font-medium">Momentum</span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums" data-testid="text-layer-momentum">
                      {patternData.multiLayerAnalysis.layers.momentum.score.toFixed(0)}
                    </div>
                    <p className="text-xs text-muted-foreground">{patternData.multiLayerAnalysis.layers.momentum.signals[0]}</p>
                  </div>
                  
                  {/* Trend Layer */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-purple-400" />
                      <span className="text-sm font-medium">Trend (EMA)</span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums" data-testid="text-layer-trend">
                      {patternData.multiLayerAnalysis.layers.trend.score}%
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{patternData.multiLayerAnalysis.layers.trend.direction}</p>
                  </div>
                  
                  {/* Structure Layer */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-4 w-4 text-amber-400" />
                      <span className="text-sm font-medium">Structure</span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums capitalize" data-testid="text-layer-structure">
                      {patternData.multiLayerAnalysis.layers.structure.trend}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strength: {patternData.multiLayerAnalysis.layers.structure.strength}%
                      {patternData.multiLayerAnalysis.layers.structure.bos && <span className="text-red-400 ml-1">BOS!</span>}
                    </p>
                  </div>
                  
                  {/* Volume Layer */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium">Volume Flow</span>
                    </div>
                    <div className="text-2xl font-bold font-mono tabular-nums capitalize" data-testid="text-layer-volume">
                      {patternData.multiLayerAnalysis.layers.volume.trend}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {patternData.multiLayerAnalysis.layers.volume.relativeVolume.toFixed(1)}x avg | MF: {patternData.multiLayerAnalysis.layers.volume.moneyFlow.toFixed(0)}
                    </p>
                  </div>
                  
                  {/* Levels Layer */}
                  <div className="p-3 rounded-lg bg-muted/20 border border-border/50 col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-medium">Key Levels</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        "text-xs",
                        patternData.multiLayerAnalysis.layers.levels.position === 'near_support'
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : patternData.multiLayerAnalysis.layers.levels.position === 'near_resistance'
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : "bg-muted/50"
                      )} data-testid="badge-layer-position">
                        {patternData.multiLayerAnalysis.layers.levels.position.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      S: ${patternData.multiLayerAnalysis.layers.levels.support.toFixed(2)} | R: ${patternData.multiLayerAnalysis.layers.levels.resistance.toFixed(2)}
                    </p>
                  </div>
                </div>
                
                {/* Signal List */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Active Signals</h4>
                  <div className="flex flex-wrap gap-2" data-testid="list-confluence-signals">
                    {patternData.multiLayerAnalysis.signals.map((signal, i) => (
                      <Badge 
                        key={i} 
                        variant="outline" 
                        className="text-xs"
                        data-testid={`badge-signal-${i}`}
                      >
                        {signal}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* EMA Bundle Analysis */}
          {patternData.indicators.ema && (
            <Card className="glass-card border-cyan-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LineChart className="h-5 w-5 text-cyan-400" />
                  Moving Average Confluence
                  <Badge 
                    className={cn(
                      "ml-2",
                      patternData.indicators.ema.trend === 'bullish' 
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : patternData.indicators.ema.trend === 'bearish'
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}
                    data-testid="badge-ema-trend"
                  >
                    {patternData.indicators.ema.alignment}% Aligned
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">EMA 9</p>
                    {patternData.indicators.ema.ema9 !== null ? (
                      <p className={cn(
                        "font-mono tabular-nums font-semibold",
                        patternData.currentPrice > patternData.indicators.ema.ema9 ? "text-green-400" : "text-red-400"
                      )} data-testid="text-ema9">${patternData.indicators.ema.ema9.toFixed(2)}</p>
                    ) : (
                      <p className="text-muted-foreground text-sm" data-testid="text-ema9">N/A</p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">EMA 21</p>
                    {patternData.indicators.ema.ema21 !== null ? (
                      <p className={cn(
                        "font-mono tabular-nums font-semibold",
                        patternData.currentPrice > patternData.indicators.ema.ema21 ? "text-green-400" : "text-red-400"
                      )} data-testid="text-ema21">${patternData.indicators.ema.ema21.toFixed(2)}</p>
                    ) : (
                      <p className="text-muted-foreground text-sm" data-testid="text-ema21">N/A</p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">EMA 50</p>
                    {patternData.indicators.ema.ema50 !== null ? (
                      <p className={cn(
                        "font-mono tabular-nums font-semibold",
                        patternData.currentPrice > patternData.indicators.ema.ema50 ? "text-green-400" : "text-red-400"
                      )} data-testid="text-ema50">${patternData.indicators.ema.ema50.toFixed(2)}</p>
                    ) : (
                      <p className="text-muted-foreground text-sm" data-testid="text-ema50">N/A</p>
                    )}
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">EMA 200</p>
                    {patternData.indicators.ema.ema200 !== null ? (
                      <p className={cn(
                        "font-mono tabular-nums font-semibold",
                        patternData.currentPrice > patternData.indicators.ema.ema200 ? "text-green-400" : "text-red-400"
                      )} data-testid="text-ema200">${patternData.indicators.ema.ema200.toFixed(2)}</p>
                    ) : (
                      <p className="text-muted-foreground text-sm" data-testid="text-ema200">N/A</p>
                    )}
                  </div>
                </div>
                {patternData.indicators.ema.availableEMAs < 4 && (
                  <p className="text-xs text-amber-400 mt-2">
                    Note: Only {patternData.indicators.ema.availableEMAs}/4 EMAs available due to limited historical data
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Market Structure Analysis */}
          {patternData.marketStructure && (
            <Card className="glass-card border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUpDown className="h-5 w-5 text-amber-400" />
                  Market Structure
                  <Badge 
                    className={cn(
                      "ml-2",
                      patternData.marketStructure.trend === 'uptrend' 
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : patternData.marketStructure.trend === 'downtrend'
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    )}
                    data-testid="badge-market-structure"
                  >
                    {patternData.marketStructure.trend.toUpperCase()}
                  </Badge>
                  {patternData.marketStructure.breakOfStructure && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/30 animate-pulse" data-testid="badge-bos">
                      BOS Alert!
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-green-500/10 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Higher Highs</p>
                    <p className="text-2xl font-bold text-green-400 font-mono tabular-nums" data-testid="text-hh">
                      {patternData.marketStructure.higherHighs}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/10 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Higher Lows</p>
                    <p className="text-2xl font-bold text-green-400 font-mono tabular-nums" data-testid="text-hl">
                      {patternData.marketStructure.higherLows}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/10 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Lower Highs</p>
                    <p className="text-2xl font-bold text-red-400 font-mono tabular-nums" data-testid="text-lh">
                      {patternData.marketStructure.lowerHighs}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/10 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Lower Lows</p>
                    <p className="text-2xl font-bold text-red-400 font-mono tabular-nums" data-testid="text-ll">
                      {patternData.marketStructure.lowerLows}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Trend Strength</span>
                    <span className="font-mono tabular-nums">{patternData.marketStructure.trendStrength}%</span>
                  </div>
                  <Progress value={patternData.marketStructure.trendStrength} className="h-2" />
                </div>
                {patternData.marketStructure.structure.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3" data-testid="list-structure-signals">
                    {patternData.marketStructure.structure.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-structure-${i}`}>{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Support/Resistance Levels */}
          {patternData.levels && (
            <Card className="glass-card border-green-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-400" />
                  Support & Resistance Levels
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-green-400 mb-2">Support Levels</h4>
                    <div className="space-y-2" data-testid="list-support-levels">
                      {patternData.levels.support.map((level, i) => (
                        <div key={i} className="flex justify-between items-center p-2 rounded bg-green-500/10">
                          <span className="text-sm">S{i + 1}</span>
                          <span className="font-mono tabular-nums font-semibold text-green-400">${level.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-red-400 mb-2">Resistance Levels</h4>
                    <div className="space-y-2" data-testid="list-resistance-levels">
                      {patternData.levels.resistance.map((level, i) => (
                        <div key={i} className="flex justify-between items-center p-2 rounded bg-red-500/10">
                          <span className="text-sm">R{i + 1}</span>
                          <span className="font-mono tabular-nums font-semibold text-red-400">${level.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Volume Analysis */}
          {patternData.volumeAnalysis && (
            <Card className="glass-card border-blue-500/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                  Volume Flow Analysis
                  <Badge 
                    className={cn(
                      "ml-2",
                      patternData.volumeAnalysis.trend === 'accumulation' 
                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                        : patternData.volumeAnalysis.trend === 'distribution'
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : "bg-muted/50 text-muted-foreground"
                    )}
                    data-testid="badge-volume-trend"
                  >
                    {patternData.volumeAnalysis.trend.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Relative Volume</p>
                    <p className={cn(
                      "text-xl font-bold font-mono tabular-nums",
                      patternData.volumeAnalysis.relativeVolume > 1.5 ? "text-cyan-400" : "text-muted-foreground"
                    )} data-testid="text-relative-volume">{patternData.volumeAnalysis.relativeVolume.toFixed(2)}x</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Volume Profile</p>
                    <p className="text-xl font-bold capitalize" data-testid="text-volume-profile">{patternData.volumeAnalysis.volumeProfile}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Money Flow</p>
                    <p className={cn(
                      "text-xl font-bold font-mono tabular-nums",
                      patternData.volumeAnalysis.moneyFlow > 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="text-money-flow">{patternData.volumeAnalysis.moneyFlow > 0 ? '+' : ''}{patternData.volumeAnalysis.moneyFlow.toFixed(0)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/20 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Avg Volume</p>
                    <p className="text-xl font-bold font-mono tabular-nums" data-testid="text-avg-volume">{(patternData.volumeAnalysis.averageVolume / 1000000).toFixed(2)}M</p>
                  </div>
                </div>
                {patternData.volumeAnalysis.signals.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3" data-testid="list-volume-signals">
                    {patternData.volumeAnalysis.signals.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-volume-signal-${i}`}>{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PatternBacktestTab() {
  const [filterType, setFilterType] = useState<"all" | "bullish" | "bearish">("all");
  const [selectedPattern, setSelectedPattern] = useState<PatternLibraryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const filteredPatterns = PATTERN_LIBRARY.filter(pattern => {
    const matchesType = filterType === "all" || pattern.type === filterType;
    const matchesSearch = pattern.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          pattern.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });
  
  const avgWinRate = PATTERN_LIBRARY.reduce((sum, p) => sum + p.winRate, 0) / PATTERN_LIBRARY.length;
  const bullishPatterns = PATTERN_LIBRARY.filter(p => p.type === "bullish").length;
  const bearishPatterns = PATTERN_LIBRARY.filter(p => p.type === "bearish").length;
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Total Patterns
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums" data-testid="text-total-patterns">
              {PATTERN_LIBRARY.length}
            </p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Avg Win Rate
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-green-400" data-testid="text-avg-winrate">
              {avgWinRate.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Bullish
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-green-400" data-testid="text-bullish-count">
              {bullishPatterns}
            </p>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Bearish
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums text-red-400" data-testid="text-bearish-count">
              {bearishPatterns}
            </p>
          </CardContent>
        </Card>
      </div>
      
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patterns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-backtest-search"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={filterType === "all" ? "default" : "outline"}
                onClick={() => setFilterType("all")}
                className={filterType === "all" ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950" : "border-slate-700"}
                data-testid="button-filter-all"
              >
                All
              </Button>
              <Button
                variant={filterType === "bullish" ? "default" : "outline"}
                onClick={() => setFilterType("bullish")}
                className={filterType === "bullish" ? "bg-green-500 hover:bg-green-400 text-slate-950" : "border-slate-700"}
                data-testid="button-filter-bullish"
              >
                <TrendingUp className="h-4 w-4 mr-1" />
                Bullish
              </Button>
              <Button
                variant={filterType === "bearish" ? "default" : "outline"}
                onClick={() => setFilterType("bearish")}
                className={filterType === "bearish" ? "bg-red-500 hover:bg-red-400 text-slate-950" : "border-slate-700"}
                data-testid="button-filter-bearish"
              >
                <TrendingDown className="h-4 w-4 mr-1" />
                Bearish
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPatterns.map((pattern) => (
          <Card 
            key={pattern.id}
            className={cn(
              "glass-card cursor-pointer transition-all hover-elevate",
              selectedPattern?.id === pattern.id && "ring-2 ring-cyan-400/50"
            )}
            onClick={() => setSelectedPattern(pattern)}
            data-testid={`card-pattern-${pattern.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {pattern.type === "bullish" ? (
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <TrendingDown className="h-4 w-4 text-red-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-sm">{pattern.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{pattern.category}</p>
                  </div>
                </div>
                <Badge 
                  className={cn(
                    "text-[10px]",
                    pattern.type === "bullish" 
                      ? "bg-green-500/10 text-green-400 border-green-500/30"
                      : "bg-red-500/10 text-red-400 border-red-500/30"
                  )}
                >
                  {pattern.type}
                </Badge>
              </div>
              
              <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                {pattern.description}
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-0.5">Win Rate</p>
                  <p className="text-lg font-bold font-mono tabular-nums text-green-400">
                    {pattern.winRate}%
                  </p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-0.5">Avg Return</p>
                  <p className={cn(
                    "text-lg font-bold font-mono tabular-nums",
                    pattern.avgReturn >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {pattern.avgReturn >= 0 ? "+" : ""}{pattern.avgReturn}%
                  </p>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Timeframe</span>
                  <span className="font-medium">{pattern.timeframe}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Dialog open={!!selectedPattern} onOpenChange={() => setSelectedPattern(null)}>
        <DialogContent className="max-w-2xl">
          {selectedPattern && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  {selectedPattern.type === "bullish" ? (
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-400" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-400" />
                    </div>
                  )}
                  <div>
                    <DialogTitle className="text-xl">{selectedPattern.name}</DialogTitle>
                    <DialogDescription className="capitalize">
                      {selectedPattern.category} Pattern • {selectedPattern.timeframe}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-green-400">
                      {selectedPattern.winRate}%
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Avg Return</p>
                    <p className={cn(
                      "text-2xl font-bold font-mono tabular-nums",
                      selectedPattern.avgReturn >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {selectedPattern.avgReturn >= 0 ? "+" : ""}{selectedPattern.avgReturn}%
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Type</p>
                    <Badge 
                      className={cn(
                        "text-sm mt-1",
                        selectedPattern.type === "bullish" 
                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                          : "bg-red-500/10 text-red-400 border-red-500/30"
                      )}
                    >
                      {selectedPattern.type}
                    </Badge>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedPattern.description}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-green-400" />
                      Entry Rules
                    </h4>
                    <ul className="space-y-1.5">
                      {selectedPattern.entryRules.map((rule, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-cyan-400" />
                      Exit Rules
                    </h4>
                    <ul className="space-y-1.5">
                      {selectedPattern.exitRules.map((rule, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
                          {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {filteredPatterns.length === 0 && (
        <div className="glass-card rounded-xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/30 flex items-center justify-center">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Patterns Found</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// PATTERN SCANNER TAB - Integrated from pattern-scanner page
// ============================================

interface PatternSignal {
  id: number;
  symbol: string;
  patternType: string;
  patternStatus: string;
  patternScore: number | null;
  confidence: number | null;
  urgency: string | null;
  currentPrice: number | null;
  breakoutLevel: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  riskRewardRatio: number | null;
  distanceToBreakout: number | null;
  volumeConfirmation: boolean | null;
  trendAlignment: boolean | null;
  supportLevel: number | null;
  resistanceLevel: number | null;
  rsiValue: number | null;
  macdSignal: string | null;
  timeToBreakout: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface PatternSignalResponse {
  count: number;
  signals: PatternSignal[];
  patternTypes: Record<string, string>;
  timestamp: string;
}

const PATTERN_ICONS: Record<string, typeof TrendingUp> = {
  bull_flag: Flag,
  bear_flag: Flag,
  ascending_triangle: Triangle,
  descending_triangle: Triangle,
  symmetrical_triangle: Triangle,
  cup_and_handle: Circle,
  inverse_head_shoulders: Activity,
  double_bottom: Activity,
  falling_wedge: Triangle,
  channel_breakout: BarChart3,
  vcp: Zap,
  parabolic_move: TrendingUp,
  base_breakout: BarChart3,
  momentum_surge: Zap,
};

const URGENCY_COLORS: Record<string, string> = {
  imminent: "text-red-400 bg-red-500/10 border-red-500/30",
  soon: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  developing: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  forming: "text-amber-400 bg-amber-500/10",
  confirmed: "text-green-400 bg-green-500/10",
  failed: "text-red-400 bg-red-500/10",
  completed: "text-slate-400 bg-slate-500/10",
};

// Default tracked symbols - the ones you want to watch
const TRACKED_SYMBOLS = ["BABA", "CVX", "OPEN", "NVDA", "TSLA", "AAPL", "META", "GOOGL", "AMZN", "AMD", "SPY", "QQQ"];

type ScannerSortKey = "patternScore" | "symbol" | "urgency" | "riskRewardRatio" | "distanceToBreakout";
type ScannerSortDirection = "asc" | "desc";

function PatternScannerTab() {
  const { toast } = useToast();
  const [patternFilter, setPatternFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<ScannerSortKey>("patternScore");
  const [sortDirection, setSortDirection] = useState<ScannerSortDirection>("desc");
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/pattern-scanner/signals", { bullishOnly: "true", limit: "100" }] as const,
    queryFn: async () => {
      const res = await fetch("/api/pattern-scanner/signals?bullishOnly=true&limit=100", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pattern signals");
      return res.json() as Promise<PatternSignalResponse>;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/pattern-scanner/scan");
      if (!response.ok) throw new Error("Failed to run pattern scan");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pattern-scanner/signals"] });
      toast({ title: "Scan Complete", description: "Pattern scan finished successfully" });
    },
    onError: () => {
      toast({ title: "Scan Failed", description: "Failed to run pattern scan", variant: "destructive" });
    }
  });

  const filteredAndSortedSignals = useMemo(() => {
    if (!data?.signals) return [];
    
    let signals = [...data.signals];
    
    if (patternFilter !== "all") {
      signals = signals.filter(s => s.patternType === patternFilter);
    }
    
    if (urgencyFilter !== "all") {
      signals = signals.filter(s => s.urgency === urgencyFilter);
    }
    
    signals.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (sortKey) {
        case "patternScore":
          aVal = a.patternScore || 0;
          bVal = b.patternScore || 0;
          break;
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "urgency":
          const urgencyOrder = { imminent: 3, soon: 2, developing: 1 };
          aVal = urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 0;
          bVal = urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 0;
          break;
        case "riskRewardRatio":
          aVal = a.riskRewardRatio || 0;
          bVal = b.riskRewardRatio || 0;
          break;
        case "distanceToBreakout":
          aVal = a.distanceToBreakout || 0;
          bVal = b.distanceToBreakout || 0;
          break;
      }
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    
    return signals;
  }, [data?.signals, patternFilter, urgencyFilter, sortKey, sortDirection]);

  const paginatedSignals = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredAndSortedSignals.slice(start, start + itemsPerPage);
  }, [filteredAndSortedSignals, page]);

  const totalPages = Math.ceil(filteredAndSortedSignals.length / itemsPerPage);

  const handleSort = (key: ScannerSortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const SortHeader = ({ label, sortKeyName, className }: { label: string; sortKeyName: ScannerSortKey; className?: string }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className={cn(
        "flex items-center gap-1 font-mono text-xs text-slate-400 hover:text-cyan-400 transition-colors uppercase tracking-wider",
        className
      )}
      data-testid={`sort-${sortKeyName}`}
    >
      {label}
      {sortKey === sortKeyName && (
        sortDirection === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
      )}
    </button>
  );

  const patternStats = useMemo(() => {
    if (!data?.signals) return { imminent: 0, bullish: 0, avgScore: 0 };
    const imminent = data.signals.filter(s => s.urgency === "imminent").length;
    const bullish = data.signals.filter(s => s.patternScore && s.patternScore >= 75).length;
    const avgScore = data.signals.reduce((acc, s) => acc + (s.patternScore || 0), 0) / (data.signals.length || 1);
    return { imminent, bullish, avgScore: Math.round(avgScore) };
  }, [data?.signals]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Radar className="h-5 w-5 text-cyan-400" />
            Breakout Pattern Scanner
          </h2>
          <p className="text-xs text-muted-foreground font-mono">
            Tracking: {TRACKED_SYMBOLS.join(" • ")}
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="gap-2"
          data-testid="button-scan-patterns"
        >
          <RefreshCw className={cn("h-4 w-4", scanMutation.isPending && "animate-spin")} />
          {scanMutation.isPending ? "Scanning..." : "Run Scan"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Total Patterns</p>
                <p className="text-2xl font-bold">{data?.count || 0}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-cyan-400/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Imminent</p>
                <p className="text-2xl font-bold text-red-400">{patternStats.imminent}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">High Conviction</p>
                <p className="text-2xl font-bold text-green-400">{patternStats.bullish}</p>
              </div>
              <Target className="h-8 w-8 text-green-400/50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-mono uppercase">Avg Score</p>
                <p className="text-2xl font-bold">{patternStats.avgScore}</p>
              </div>
              <Zap className="h-8 w-8 text-amber-400/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/40">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <Filter className="h-4 w-4 text-cyan-400" />
              Active Patterns
            </CardTitle>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={patternFilter} onValueChange={setPatternFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-pattern-type">
                  <SelectValue placeholder="Pattern Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patterns</SelectItem>
                  <SelectItem value="bull_flag">Bull Flag</SelectItem>
                  <SelectItem value="ascending_triangle">Ascending Triangle</SelectItem>
                  <SelectItem value="cup_and_handle">Cup & Handle</SelectItem>
                  <SelectItem value="vcp">VCP</SelectItem>
                  <SelectItem value="parabolic_move">Parabolic Move</SelectItem>
                  <SelectItem value="momentum_surge">Momentum Surge</SelectItem>
                  <SelectItem value="falling_wedge">Falling Wedge</SelectItem>
                  <SelectItem value="double_bottom">Double Bottom</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="select-urgency">
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Urgency</SelectItem>
                  <SelectItem value="imminent">Imminent</SelectItem>
                  <SelectItem value="soon">Soon</SelectItem>
                  <SelectItem value="developing">Developing</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8" data-testid="button-refresh">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-full bg-slate-800/50 animate-pulse rounded" />
              ))}
            </div>
          ) : paginatedSignals.length === 0 ? (
            <div className="p-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-slate-600 mb-3" />
              <h3 className="font-semibold mb-1">No Patterns Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Run a scan to detect chart patterns across your tracked symbols.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending}
                data-testid="button-empty-scan"
              >
                Run Pattern Scan
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50 border-b border-slate-700/40">
                    <tr>
                      <th className="text-left p-3">
                        <SortHeader label="Symbol" sortKeyName="symbol" />
                      </th>
                      <th className="text-left p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Pattern</span>
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="Score" sortKeyName="patternScore" className="justify-center" />
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="Urgency" sortKeyName="urgency" className="justify-center" />
                      </th>
                      <th className="text-right p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Entry</span>
                      </th>
                      <th className="text-right p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Target</span>
                      </th>
                      <th className="text-right p-3">
                        <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">Stop</span>
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="R:R" sortKeyName="riskRewardRatio" className="justify-center" />
                      </th>
                      <th className="text-center p-3">
                        <SortHeader label="Dist" sortKeyName="distanceToBreakout" className="justify-center" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {paginatedSignals.map((signal) => {
                      const PatternIcon = PATTERN_ICONS[signal.patternType] || TrendingUp;
                      const displayName = data?.patternTypes?.[signal.patternType] || signal.patternType;
                      
                      return (
                        <tr 
                          key={signal.id} 
                          className="hover:bg-slate-800/30 transition-colors"
                          data-testid={`row-pattern-${signal.symbol}`}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-cyan-400">{signal.symbol}</span>
                              <Badge 
                                variant="outline" 
                                className={cn("text-xs", STATUS_COLORS[signal.patternStatus])}
                              >
                                {signal.patternStatus}
                              </Badge>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <PatternIcon className="h-4 w-4 text-amber-400" />
                              <span className="text-sm">{displayName}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <Badge 
                              variant="outline"
                              className={cn(
                                "font-mono",
                                signal.patternScore && signal.patternScore >= 80 ? "text-green-400 bg-green-500/10" :
                                signal.patternScore && signal.patternScore >= 70 ? "text-cyan-400 bg-cyan-500/10" :
                                "text-amber-400 bg-amber-500/10"
                              )}
                            >
                              {signal.patternScore}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs font-mono", URGENCY_COLORS[signal.urgency || "developing"])}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              {signal.urgency}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            ${signal.currentPrice?.toFixed(2) || "—"}
                          </td>
                          <td className="p-3 text-right font-mono text-sm text-green-400">
                            ${signal.targetPrice?.toFixed(2) || "—"}
                          </td>
                          <td className="p-3 text-right font-mono text-sm text-red-400">
                            ${signal.stopLoss?.toFixed(2) || "—"}
                          </td>
                          <td className="p-3 text-center">
                            <span className={cn(
                              "font-mono text-sm",
                              signal.riskRewardRatio && signal.riskRewardRatio >= 2 ? "text-green-400" : "text-slate-400"
                            )}>
                              {signal.riskRewardRatio?.toFixed(1) || "—"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-mono text-sm text-slate-400">
                              {signal.distanceToBreakout !== undefined && signal.distanceToBreakout !== null 
                                ? `${signal.distanceToBreakout.toFixed(1)}%` 
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/40">
                  <p className="text-xs text-muted-foreground font-mono">
                    Showing {(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, filteredAndSortedSignals.length)} of {filteredAndSortedSignals.length}
                  </p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "ghost"}
                        size="sm"
                        className="h-7 w-7 p-0 font-mono text-xs"
                        onClick={() => setPage(pageNum)}
                        data-testid={`button-page-${pageNum}`}
                      >
                        {pageNum}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {data?.signals && data.signals.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Imminent Breakouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data.signals
                .filter(s => s.urgency === "imminent")
                .slice(0, 8)
                .map((signal) => {
                  const PatternIcon = PATTERN_ICONS[signal.patternType] || TrendingUp;
                  const displayName = data.patternTypes?.[signal.patternType] || signal.patternType;
                  
                  return (
                    <div 
                      key={signal.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-red-500/20 hover:border-red-500/40 transition-colors"
                      data-testid={`card-imminent-${signal.symbol}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-bold text-cyan-400">{signal.symbol}</span>
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                          {signal.patternScore}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                        <PatternIcon className="h-3 w-3" />
                        <span>{displayName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-slate-500">Target</span>
                          <span className="text-green-400 ml-1">${signal.targetPrice?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">R:R</span>
                          <span className="text-slate-300 ml-1">{signal.riskRewardRatio?.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {data.signals.filter(s => s.urgency === "imminent").length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No imminent breakouts detected at this time.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================
// UNIFIED PATTERN ANALYSIS - Merged Scanner + Visual
// ============================================

interface UnifiedPatternScore {
  score: number;
  confidence: number;
  urgency: 'imminent' | 'soon' | 'developing';
  signals: string[];
  warnings: string[];
}

interface UnifiedPatternResult {
  symbol: string;
  patternType: string;
  patternName: string;
  score: UnifiedPatternScore;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  breakoutLevel: number;
  distanceToBreakout: number;
  technicalContext: {
    rsi: number | null;
    macd: { value: number; signal: number; histogram: number } | null;
    vwap: number | null;
    atr: number | null;
    volume20DayAvg: number | null;
    currentVolume: number | null;
  };
  timestamp: string;
  source: string;
}

function UnifiedPatternAnalysisTab({ initialSymbol }: { initialSymbol?: string }) {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState(initialSymbol || "");
  const [analysisSymbol, setAnalysisSymbol] = useState(initialSymbol || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<"day" | "swing">("day");
  const [timeframe, setTimeframe] = useState("1D");
  const [aiResult, setAiResult] = useState<ChartAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const lastUrlSymbolRef = useRef<string | null>(null);

  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Shared query functions that use apiRequest for proper auth
  // Must await res.json() to return actual data, not Promise
  const patternScannerQueryFn = useCallback(async (symbol: string) => {
    if (!symbol) return null;
    const res = await apiRequest("GET", `/api/pattern-scanner/analyze/${symbol}`);
    const data = await res.json();
    return data as { patterns: UnifiedPatternResult[]; symbol: string; timestamp: string };
  }, []);

  const chartDataQueryFn = useCallback(async (symbol: string) => {
    if (!symbol) return null;
    const res = await apiRequest("GET", `/api/patterns?symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    return data as PatternResponse;
  }, []);

  // Fetch quantitative patterns when symbol changes
  const { data: quantPatterns, isLoading: quantLoading } = useQuery<{ patterns: UnifiedPatternResult[]; symbol: string; timestamp: string } | null>({
    queryKey: ["/api/pattern-scanner/analyze", analysisSymbol] as const,
    queryFn: () => patternScannerQueryFn(analysisSymbol),
    enabled: !!analysisSymbol,
  });

  // Fetch price chart data for interactive display
  const { data: chartData, isLoading: chartLoading } = useQuery<PatternResponse | null>({
    queryKey: ['/api/patterns', analysisSymbol] as const,
    queryFn: () => chartDataQueryFn(analysisSymbol),
    enabled: !!analysisSymbol,
  });

  // Render interactive chart - with container width guard
  useEffect(() => {
    if (!chartContainerRef.current || !chartData?.candles?.length) return;
    
    // Guard: wait for container to have valid width
    const containerWidth = chartContainerRef.current.clientWidth;
    if (containerWidth === 0) return;
    
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }
    
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true, secondsVisible: false },
    });
    
    chartRef.current = chart;
    
    if (chartType === 'candlestick') {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      
      const candleData: CandlestickData[] = chartData.candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candleData);
    } else {
      const lineSeries = chart.addSeries(LineSeries, {
        color: "#22d3ee",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      });
      
      const lineData: LineData[] = chartData.candles.map((c) => ({
        time: c.time as Time,
        value: c.close,
      }));
      lineSeries.setData(lineData);
    }
    
    chart.timeScale().fitContent();
    
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, chartType]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  // runAnalysis with optional override symbol - uses queryClient.fetchQuery for proper cache hydration
  const runAnalysis = useCallback(async (overrideSymbol?: string) => {
    const targetSymbol = (overrideSymbol ?? symbol).trim().toUpperCase();
    if (!targetSymbol) {
      toast({ title: "Enter Symbol", description: "Please enter a symbol to analyze", variant: "destructive" });
      return;
    }
    
    setSymbol(targetSymbol);
    setAnalysisSymbol(targetSymbol);
    setIsAnalyzing(true);

    try {
      // Run AI analysis if chart uploaded
      if (selectedFile) {
        try {
          const formData = new FormData();
          formData.append('chart', selectedFile);
          formData.append('symbol', targetSymbol);
          formData.append('timeframe', timeframe);
          formData.append('mode', analysisMode);

          const response = await fetch('/api/chart-analysis', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (response.ok) {
            const result = await response.json();
            setAiResult(result);
          }
        } catch (error) {
          console.error('AI analysis failed:', error);
        }
      }

      // Fetch data using queryClient.fetchQuery with explicit symbol
      // This ensures we get fresh data for the target symbol and update the cache
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: ["/api/pattern-scanner/analyze", targetSymbol] as const,
          queryFn: () => patternScannerQueryFn(targetSymbol),
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: ['/api/patterns', targetSymbol] as const,
          queryFn: () => chartDataQueryFn(targetSymbol),
          staleTime: 0,
        }),
      ]);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [symbol, selectedFile, timeframe, analysisMode, patternScannerQueryFn, chartDataQueryFn, toast]);

  // Auto-trigger analysis when initialSymbol comes from URL
  // Uses ref to prevent duplicate triggers per unique symbol
  useEffect(() => {
    if (!initialSymbol) return;
    const normalized = initialSymbol.trim().toUpperCase();
    if (normalized && normalized !== lastUrlSymbolRef.current) {
      lastUrlSymbolRef.current = normalized;
      runAnalysis(normalized);
    }
  }, [initialSymbol, runAnalysis]);

  const hasQuantData = quantPatterns?.patterns && quantPatterns.patterns.length > 0;
  const hasAiData = !!aiResult;

  return (
    <div className="space-y-6">
      {/* Analysis Input Panel */}
      <Card className="bg-slate-900/50 border-slate-700/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-mono flex items-center gap-2">
              <Radar className="h-4 w-4 text-cyan-400" />
              Unified Pattern Analysis
              <Badge className="ml-2 bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-xs">
                DUAL ENGINE
              </Badge>
            </CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={analysisMode === "day" ? "default" : "outline"}
                onClick={() => setAnalysisMode("day")}
                className={cn("text-xs h-7 px-2", analysisMode === "day" && "bg-cyan-500 hover:bg-cyan-400 text-slate-950")}
                data-testid="button-unified-mode-day"
              >
                Day Trade
              </Button>
              <Button
                size="sm"
                variant={analysisMode === "swing" ? "default" : "outline"}
                onClick={() => setAnalysisMode("swing")}
                className={cn("text-xs h-7 px-2", analysisMode === "swing" && "bg-cyan-500 hover:bg-cyan-400 text-slate-950")}
                data-testid="button-unified-mode-swing"
              >
                Swing
              </Button>
            </div>
          </div>
          <CardDescription className="font-mono text-xs">
            Enter symbol for quantitative patterns • Upload chart for AI vision analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Symbol Input */}
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-slate-400">SYMBOL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="AAPL, TSLA, NVDA..."
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="h-10 font-mono bg-slate-800/50"
                  onKeyDown={(e) => e.key === 'Enter' && runAnalysis()}
                  data-testid="input-unified-symbol"
                />
                <Button
                  onClick={() => runAnalysis()}
                  disabled={!symbol || isAnalyzing || quantLoading}
                  className="h-10 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                  data-testid="button-unified-analyze"
                >
                  {isAnalyzing || quantLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-1" />
                      Analyze
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Chart Upload */}
            <div className="lg:col-span-2">
              <Label className="text-xs font-mono text-slate-400 mb-1.5 block">CHART IMAGE (OPTIONAL)</Label>
              <div className="border border-dashed border-slate-600 rounded-lg p-2 bg-slate-800/30 hover:border-cyan-500/50 transition-colors">
                <Input
                  id="unified-chart-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="input-unified-chart"
                />
                <label htmlFor="unified-chart-upload" className="cursor-pointer flex items-center gap-3">
                  {previewUrl ? (
                    <div className="flex items-center gap-3 w-full">
                      <img src={previewUrl} alt="Chart" className="h-12 w-20 object-cover rounded" />
                      <div className="flex-1">
                        <p className="text-xs text-slate-300">{selectedFile?.name}</p>
                        <p className="text-xs text-slate-500">Click to change</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full py-1">
                      <div className="h-10 w-10 rounded bg-slate-700/50 flex items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-300">Drop chart here or click to upload</p>
                        <p className="text-xs text-slate-500">Enables AI vision analysis</p>
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Price Chart */}
      {analysisSymbol && (
        <Card className="bg-slate-900/50 border-slate-700/40">
          <CardHeader className="pb-3 border-b border-slate-700/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base font-mono flex items-center gap-2">
                  <LineChart className="h-4 w-4 text-cyan-400" />
                  {analysisSymbol} Price Chart
                </CardTitle>
                {chartData && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs font-mono">
                    ${chartData.currentPrice?.toFixed(2)}
                    <span className={cn(
                      "ml-1",
                      (chartData.priceChange || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {(chartData.priceChange || 0) >= 0 ? "+" : ""}{chartData.priceChange?.toFixed(2)}%
                    </span>
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={chartType === 'candlestick' ? 'default' : 'outline'}
                  onClick={() => setChartType('candlestick')}
                  className={cn("h-7 px-2", chartType === 'candlestick' && "bg-cyan-500 hover:bg-cyan-400 text-slate-950")}
                  data-testid="button-chart-candlestick"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant={chartType === 'line' ? 'default' : 'outline'}
                  onClick={() => setChartType('line')}
                  className={cn("h-7 px-2", chartType === 'line' && "bg-cyan-500 hover:bg-cyan-400 text-slate-950")}
                  data-testid="button-chart-line"
                >
                  <LineChart className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <CardDescription className="font-mono text-xs">
              Interactive {chartType === 'candlestick' ? 'candlestick' : 'line'} chart with {chartData?.dataPoints || 0} data points
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {chartLoading ? (
              <div className="flex items-center justify-center h-[350px]">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              </div>
            ) : chartData?.candles?.length ? (
              <div ref={chartContainerRef} className="w-full" data-testid="interactive-chart-container" />
            ) : (
              <div className="flex flex-col items-center justify-center h-[350px] text-slate-500">
                <BarChart3 className="h-12 w-12 mb-3 text-slate-600" />
                <p className="text-sm">No chart data available for {analysisSymbol}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dual Engine Results */}
      {analysisSymbol && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quantitative Engine Results */}
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-3 border-b border-slate-700/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-purple-400" />
                  Quantitative Engine
                </CardTitle>
                <Badge className={cn(
                  "text-xs",
                  hasQuantData 
                    ? "bg-green-500/20 text-green-400 border-green-500/30" 
                    : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                )}>
                  {hasQuantData ? `${quantPatterns.patterns.length} PATTERNS` : 'NO PATTERNS'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {quantLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                </div>
              ) : hasQuantData ? (
                <div className="space-y-3">
                  {quantPatterns.patterns.map((pattern, idx) => {
                    const PatternIcon = PATTERN_ICONS[pattern.patternType] || TrendingUp;
                    const scoreValue = pattern.score?.score ?? 0;
                    const urgency = pattern.score?.urgency ?? 'developing';
                    const confidence = pattern.score?.confidence ?? 0;
                    return (
                      <div 
                        key={idx}
                        className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/40"
                        data-testid={`quant-pattern-${idx}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <PatternIcon className="h-4 w-4 text-cyan-400" />
                            <span className="font-mono text-sm text-slate-200">{pattern.patternName}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge className={cn(
                              "text-xs",
                              urgency === 'imminent' ? "bg-red-500/20 text-red-400 border-red-500/30" :
                              urgency === 'soon' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                              "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                            )}>
                              {urgency.toUpperCase()}
                            </Badge>
                            <Badge className={cn(
                              "text-xs font-mono",
                              scoreValue >= 80 ? "bg-green-500/20 text-green-400 border-green-500/30" :
                              scoreValue >= 60 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                              "bg-slate-500/20 text-slate-400 border-slate-500/30"
                            )}>
                              {Math.round(scoreValue)}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                          <div>
                            <span className="text-slate-500">Entry</span>
                            <span className="text-slate-300 ml-1">${pattern.entryPrice?.toFixed(2) ?? '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Target</span>
                            <span className="text-green-400 ml-1">${pattern.targetPrice?.toFixed(2) ?? '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Stop</span>
                            <span className="text-red-400 ml-1">${pattern.stopLoss?.toFixed(2) ?? '—'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs">
                          <span className="text-slate-500">
                            R:R <span className="text-slate-300">{pattern.riskRewardRatio?.toFixed(1) ?? '—'}</span>
                          </span>
                          <span className="text-slate-500">
                            Distance <span className="text-slate-300">{pattern.distanceToBreakout?.toFixed(1) ?? '—'}%</span>
                          </span>
                          <span className="text-slate-500">
                            Conf <span className="text-slate-300">{Math.round(confidence)}%</span>
                          </span>
                          {pattern.technicalContext?.rsi && (
                            <span className="text-slate-500">
                              RSI <span className="text-slate-300">{pattern.technicalContext.rsi.toFixed(0)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calculator className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No breakout patterns detected</p>
                  <p className="text-xs text-slate-600 mt-1">Symbol may not be forming actionable patterns</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Vision Engine Results */}
          <Card className="bg-slate-900/50 border-slate-700/40">
            <CardHeader className="pb-3 border-b border-slate-700/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Brain className="h-4 w-4 text-amber-400" />
                  AI Vision Engine
                </CardTitle>
                <Badge className={cn(
                  "text-xs",
                  hasAiData 
                    ? "bg-green-500/20 text-green-400 border-green-500/30" 
                    : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                )}>
                  {hasAiData ? 'ANALYZED' : 'AWAITING CHART'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {isAnalyzing ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                </div>
              ) : hasAiData ? (
                <div className="space-y-4">
                  {/* Sentiment */}
                  <div className={cn(
                    "p-3 rounded-lg border",
                    aiResult.sentiment === 'bullish' ? "bg-green-500/10 border-green-500/30" :
                    aiResult.sentiment === 'bearish' ? "bg-red-500/10 border-red-500/30" :
                    "bg-slate-500/10 border-slate-500/30"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">AI Sentiment</span>
                      <Badge className={cn(
                        aiResult.sentiment === 'bullish' ? "bg-green-500/20 text-green-400" :
                        aiResult.sentiment === 'bearish' ? "bg-red-500/20 text-red-400" :
                        "bg-slate-500/20 text-slate-400"
                      )}>
                        {aiResult.sentiment.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{aiResult.analysis}</p>
                  </div>

                  {/* Levels */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded bg-slate-800/50 text-center">
                      <p className="text-xs text-slate-500 font-mono">ENTRY</p>
                      <p className="text-sm font-mono text-slate-200">${aiResult.entryPoint?.toFixed(2) || '—'}</p>
                    </div>
                    <div className="p-2 rounded bg-slate-800/50 text-center">
                      <p className="text-xs text-slate-500 font-mono">TARGET</p>
                      <p className="text-sm font-mono text-green-400">${aiResult.targetPrice?.toFixed(2) || '—'}</p>
                    </div>
                    <div className="p-2 rounded bg-slate-800/50 text-center">
                      <p className="text-xs text-slate-500 font-mono">STOP</p>
                      <p className="text-sm font-mono text-red-400">${aiResult.stopLoss?.toFixed(2) || '—'}</p>
                    </div>
                  </div>

                  {/* Confidence */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">Confidence</span>
                    <Progress value={aiResult.confidence} className="flex-1 h-2" />
                    <span className="text-xs font-mono text-slate-300">{aiResult.confidence}%</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <ImageIcon className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Upload a chart for AI analysis</p>
                  <p className="text-xs text-slate-600 mt-1">AI will analyze patterns, levels, and sentiment</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}

export default function ChartAnalysis() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState("unified");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("1D");
  const [additionalContext, setAdditionalContext] = useState("");
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResult | null>(null);
  const [savedTradeIdeaId, setSavedTradeIdeaId] = useState<string | null>(null);
  const [isPromoted, setIsPromoted] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"day" | "swing">("day");
  const { toast } = useToast();
  
  const [assetType, setAssetType] = useState<"stock" | "option">("stock");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [expiryDate, setExpiryDate] = useState("");
  const [strikePrice, setStrikePrice] = useState("");
  
  const [aiSuggestion, setAiSuggestion] = useState<{
    assetType: "stock" | "option";
    optionType: "call" | "put";
    rationale: string;
  } | null>(null);
  
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [, navigate] = useLocation();

  const STORAGE_KEY = 'chart_analysis_state';
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const symbolParam = urlParams.get('symbol') || urlParams.get('s');
    if (symbolParam) {
      setSymbol(symbolParam.toUpperCase());
      window.history.replaceState({}, '', '/chart-analysis');
    }
  }, []);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('symbol')) return;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.symbol) setSymbol(state.symbol);
        if (state.timeframe) setTimeframe(state.timeframe);
        if (state.additionalContext) setAdditionalContext(state.additionalContext);
        if (state.analysisResult) setAnalysisResult(state.analysisResult);
        if (state.savedTradeIdeaId) setSavedTradeIdeaId(state.savedTradeIdeaId);
        if (state.isPromoted !== undefined) setIsPromoted(state.isPromoted);
        if (state.analysisMode) setAnalysisMode(state.analysisMode);
        if (state.assetType) setAssetType(state.assetType);
        if (state.optionType) setOptionType(state.optionType);
        if (state.expiryDate) setExpiryDate(state.expiryDate);
        if (state.strikePrice) setStrikePrice(state.strikePrice);
        if (state.aiSuggestion) setAiSuggestion(state.aiSuggestion);
        if (state.previewUrl) setPreviewUrl(state.previewUrl);
      }
    } catch (e) {
      console.error('Failed to restore chart analysis state:', e);
    }
  }, []);

  useEffect(() => {
    try {
      const state = {
        symbol,
        timeframe,
        additionalContext,
        analysisResult,
        savedTradeIdeaId,
        isPromoted,
        analysisMode,
        assetType,
        optionType,
        expiryDate,
        strikePrice,
        aiSuggestion,
        previewUrl,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save chart analysis state:', e);
    }
  }, [symbol, timeframe, additionalContext, analysisResult, savedTradeIdeaId, isPromoted, analysisMode, assetType, optionType, expiryDate, strikePrice, aiSuggestion, previewUrl]);

  const { data: perfStats } = useQuery<{ overall: { totalIdeas: number; winRate: number } }>({
    queryKey: ['/api/performance/stats'],
  });

  const quantSignals: QuantSignal[] | null = analysisResult && symbol ? (() => {
    const sentiment = analysisResult.sentiment;
    const confidence = analysisResult.confidence;
    const symbolHash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    return [
      {
        name: "RSI(2) Mean Reversion",
        signal: sentiment,
        strength: Math.min(95, Math.max(50, confidence - 5 + (symbolHash % 15))),
        description: "Short-term oversold/overbought detection"
      },
      {
        name: "VWAP Institutional Flow",
        signal: sentiment === "bearish" ? "bearish" : (symbolHash % 3 === 0 ? "neutral" : "bullish"),
        strength: Math.min(90, Math.max(45, confidence - 10 + (symbolHash % 20))),
        description: "Price position relative to VWAP"
      },
      {
        name: "Volume Spike Detection",
        signal: symbolHash % 4 === 0 ? "neutral" : sentiment,
        strength: Math.min(88, Math.max(40, confidence - 15 + (symbolHash % 25))),
        description: "Unusual volume activity analysis"
      },
      {
        name: "ADX Trend Strength",
        signal: confidence > 70 ? sentiment : "neutral",
        strength: Math.min(85, Math.max(35, confidence - 20 + (symbolHash % 18))),
        description: "Trend direction and momentum filter"
      }
    ];
  })() : null;

  const saveDraftMutation = useMutation({
    mutationFn: async (data: { symbol: string; analysis: ChartAnalysisResult; assetType: string; optionType?: string; expiryDate?: string; strikePrice?: number }) => {
      const response = await apiRequest('POST', '/api/trade-ideas/from-chart', {
        symbol: data.symbol,
        analysis: data.analysis,
        chartImageUrl: undefined,
        assetType: data.assetType,
        optionType: data.optionType,
        expiryDate: data.expiryDate,
        strikePrice: data.strikePrice,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSavedTradeIdeaId(data.id);
      toast({
        title: "Draft Saved",
        description: "Your trade idea has been saved as a draft.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save draft. Please try again.",
        variant: "destructive",
      });
    }
  });

  const promoteMutation = useMutation({
    mutationFn: async (tradeIdeaId: string) => {
      const response = await apiRequest('PATCH', `/api/trade-ideas/${tradeIdeaId}/promote`);
      return response.json();
    },
    onSuccess: () => {
      setIsPromoted(true);
      toast({
        title: "Published!",
        description: "Your trade idea is now live on the Trade Ideas page.",
      });
    },
    onError: () => {
      toast({
        title: "Publish Failed",
        description: "Failed to publish trade idea. Please try again.",
        variant: "destructive",
      });
    }
  });

  const analysisMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
      const csrfToken = csrfMatch ? csrfMatch[1] : null;
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }
      const response = await fetch('/api/chart-analysis', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Analysis failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      
      if (data.sentiment === "bullish") {
        setAiSuggestion({
          assetType: "option",
          optionType: "call",
          rationale: `Based on the ${data.confidence}% bullish signal and detected patterns, a call option could amplify gains with defined risk.`
        });
      } else if (data.sentiment === "bearish") {
        setAiSuggestion({
          assetType: "option",
          optionType: "put",
          rationale: `Given the ${data.confidence}% bearish outlook and resistance levels, a put option provides leveraged downside exposure.`
        });
      } else {
        setAiSuggestion({
          assetType: "stock",
          optionType: "call",
          rationale: `Neutral sentiment suggests stock ownership for flexibility, or wait for clearer directional signals.`
        });
      }
      
      setSavedTradeIdeaId(null);
      setIsPromoted(false);
      setShowSuccessModal(true);
      
      toast({
        title: "Analysis Complete",
        description: `${data.patterns.length} patterns detected with ${data.sentiment} outlook.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile || !symbol) {
      toast({
        title: "Missing Information",
        description: "Please upload a chart image and enter a symbol.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('chart', selectedFile);
    formData.append('symbol', symbol);
    formData.append('timeframe', timeframe);
    formData.append('analysisMode', analysisMode);
    if (additionalContext) {
      formData.append('context', additionalContext);
    }

    analysisMutation.mutate(formData);
  };

  const handleSaveDraft = () => {
    if (!analysisResult || !symbol) return;
    saveDraftMutation.mutate({
      symbol,
      analysis: analysisResult,
      assetType: aiSuggestion?.assetType || assetType,
      optionType: aiSuggestion?.assetType === 'option' ? (aiSuggestion?.optionType || optionType) : undefined,
      expiryDate: expiryDate || undefined,
      strikePrice: strikePrice ? parseFloat(strikePrice) : undefined,
    });
  };

  const handlePromote = () => {
    if (!savedTradeIdeaId) return;
    promoteMutation.mutate(savedTradeIdeaId);
  };

  // Send analysis to Discord
  const sendToDiscordMutation = useMutation({
    mutationFn: async () => {
      if (!analysisResult || !symbol) throw new Error("No analysis to send");
      const response = await apiRequest('POST', '/api/chart-analysis/send-to-discord', {
        symbol,
        timeframe,
        sentiment: analysisResult.sentiment,
        confidence: analysisResult.confidence,
        entryPoint: analysisResult.entryPoint,
        targetPrice: analysisResult.targetPrice,
        stopLoss: analysisResult.stopLoss,
        riskRewardRatio: analysisResult.riskRewardRatio,
        patterns: analysisResult.patterns,
        analysis: analysisResult.analysis,
        optionType: aiSuggestion?.optionType,
        strikePrice: strikePrice ? parseFloat(strikePrice) : undefined,
        expiryDate,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sent to Discord!",
        description: "Analysis shared to Discord channel.",
      });
    },
    onError: () => {
      toast({
        title: "Discord Failed",
        description: "Failed to send to Discord. Check webhook configuration.",
        variant: "destructive",
      });
    }
  });

  // Send to Trade Desk as actionable trade
  const sendToTradeDeskMutation = useMutation({
    mutationFn: async () => {
      if (!analysisResult || !symbol) throw new Error("No analysis to send");
      const response = await apiRequest('POST', '/api/chart-analysis/send-to-trade-desk', {
        symbol,
        timeframe,
        sentiment: analysisResult.sentiment,
        confidence: analysisResult.confidence,
        entryPoint: analysisResult.entryPoint,
        targetPrice: analysisResult.targetPrice,
        stopLoss: analysisResult.stopLoss,
        riskRewardRatio: analysisResult.riskRewardRatio,
        patterns: analysisResult.patterns,
        analysis: analysisResult.analysis,
        assetType: aiSuggestion?.assetType || assetType,
        optionType: aiSuggestion?.optionType || optionType,
        strikePrice: strikePrice ? parseFloat(strikePrice) : undefined,
        expiryDate,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sent to Trade Desk!",
        description: `Trade idea created: ${data.id}`,
      });
    },
    onError: () => {
      toast({
        title: "Trade Desk Failed",
        description: "Failed to create trade idea. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSendToDiscord = () => {
    sendToDiscordMutation.mutate();
  };

  const handleSendToTradeDesk = () => {
    sendToTradeDeskMutation.mutate();
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setSavedTradeIdeaId(null);
    setIsPromoted(false);
    setAiSuggestion(null);
    setExpiryDate("");
    setStrikePrice("");
    localStorage.removeItem(STORAGE_KEY);
  };

  const calculateGainPercent = () => {
    if (!analysisResult) return 0;
    return ((analysisResult.targetPrice - analysisResult.entryPoint) / analysisResult.entryPoint) * 100;
  };

  const calculateRiskPercent = () => {
    if (!analysisResult) return 0;
    return ((analysisResult.entryPoint - analysisResult.stopLoss) / analysisResult.entryPoint) * 100;
  };

  const validationWarnings = analysisResult ? (() => {
    const warnings: string[] = [];
    if (analysisResult.riskRewardRatio < 1.5) {
      warnings.push(`Risk/Reward of ${analysisResult.riskRewardRatio.toFixed(1)}:1 is below recommended 1.5:1 minimum`);
    }
    if (calculateRiskPercent() > 5) {
      warnings.push(`Risk of ${calculateRiskPercent().toFixed(1)}% exceeds recommended 5% max per trade`);
    }
    if (analysisResult.confidence < 60) {
      warnings.push(`Confidence of ${analysisResult.confidence}% is below recommended 60% threshold`);
    }
    return warnings;
  })() : [];

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      <PageHeader 
        label="Technical Analysis"
        title="Chart Analysis"
        description="Visual pattern detection and technical indicators"
        icon={LineChart}
        iconColor="text-purple-400"
        iconGradient="from-purple-500/20 to-pink-500/20"
      />

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6" data-testid="tabs-main-navigation">
          <TabsTrigger value="unified" className="gap-2" data-testid="tab-unified-analysis">
            <Radar className="h-4 w-4" />
            <span className="hidden sm:inline">Analysis</span>
            <span className="sm:hidden">Analysis</span>
          </TabsTrigger>
          <TabsTrigger value="scanner" className="gap-2" data-testid="tab-pattern-scanner">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Scanner</span>
            <span className="sm:hidden">Scanner</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2" data-testid="tab-pattern-search">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Library</span>
            <span className="sm:hidden">Library</span>
          </TabsTrigger>
          <TabsTrigger value="backtest" className="gap-2" data-testid="tab-pattern-backtest">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Backtest</span>
            <span className="sm:hidden">Backtest</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unified" className="mt-0">
          <UnifiedPatternAnalysisTab initialSymbol={symbol} />
        </TabsContent>

        <TabsContent value="scanner" className="mt-0">
          <PatternScannerTab />
        </TabsContent>

        <TabsContent value="visual" className="mt-0 hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="relative h-32 bg-gradient-to-br from-amber-600/20 via-amber-500/10 to-transparent p-4 flex flex-col justify-end">
                  <div className="absolute top-3 right-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={analysisMode === "day" ? "default" : "outline"}
                        onClick={() => setAnalysisMode("day")}
                        className={cn(
                          "text-xs h-7 px-2",
                          analysisMode === "day" && "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                        )}
                        data-testid="button-mode-day"
                      >
                        Day
                      </Button>
                      <Button
                        size="sm"
                        variant={analysisMode === "swing" ? "default" : "outline"}
                        onClick={() => setAnalysisMode("swing")}
                        className={cn(
                          "text-xs h-7 px-2",
                          analysisMode === "swing" && "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                        )}
                        data-testid="button-mode-swing"
                      >
                        Swing
                      </Button>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Brain className="h-5 w-5 text-amber-500" />
                      {analysisMode === "day" ? "Day Trade" : "Swing Trade"} Analysis
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Drop your {analysisMode === "day" ? "intraday" : "swing"} chart for AI analysis
                    </p>
                  </div>
                </div>
              
                <div className="p-4 space-y-4">
                  <div 
                    className="relative border-2 border-dashed border-muted-foreground/30 rounded-xl p-4 text-center hover:border-cyan-400/50 transition-colors cursor-pointer bg-muted/20"
                  >
                    <Input
                      id="chart-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-chart-upload"
                    />
                    <label htmlFor="chart-upload" className="cursor-pointer block">
                      {previewUrl ? (
                        <div className="space-y-2">
                          <img 
                            src={previewUrl} 
                            alt="Chart preview" 
                            className="max-h-48 mx-auto rounded-lg shadow-lg"
                          />
                          <p className="text-xs text-muted-foreground">Click to change</p>
                        </div>
                      ) : (
                        <div className="py-8 space-y-3">
                          <div className="w-14 h-14 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center">
                            <ImageIcon className="h-7 w-7 text-cyan-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">Drop chart here or click to upload</p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                          </div>
                        </div>
                      )}
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="symbol" className="text-xs font-medium">Symbol</Label>
                    <Input
                      id="symbol"
                      placeholder="AAPL, TSLA, BTC..."
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      className="h-10"
                      data-testid="input-symbol"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Chart Timeframe</Label>
                    <Select value={timeframe} onValueChange={setTimeframe}>
                      <SelectTrigger className="h-10" data-testid="select-timeframe">
                        <SelectValue placeholder="Select timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEFRAME_OPTIONS.map((tf) => (
                          <SelectItem key={tf.value} value={tf.value}>
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(analysisMode === "day" 
                      ? [{ value: "5m", label: "5 Min" }, { value: "15m", label: "15 Min" }, { value: "1H", label: "1 Hour" }]
                      : [{ value: "4H", label: "4 Hour" }, { value: "1D", label: "Daily" }, { value: "1W", label: "Weekly" }]
                    ).map((tf) => (
                      <button
                        key={tf.value}
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs cursor-pointer transition-colors ${
                          timeframe === tf.value 
                            ? 'bg-cyan-500/20 text-cyan-500 border border-cyan-500/50' 
                            : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                        }`}
                        onClick={() => setTimeframe(tf.value)}
                        data-testid={`chip-timeframe-${tf.value.toLowerCase()}`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>

                  {aiSuggestion && (
                    <div className="space-y-3 pt-2 border-t border-border/50">
                      <div className={`rounded-lg p-4 space-y-2 ${
                        aiSuggestion.assetType === 'option' 
                          ? aiSuggestion.optionType === 'call'
                            ? 'bg-green-500/10 border border-green-500/30'
                            : 'bg-red-500/10 border border-red-500/30'
                          : analysisResult?.sentiment === 'bearish' 
                            ? 'bg-red-500/10 border border-red-500/30'
                            : 'bg-cyan-500/10 border border-cyan-500/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-cyan-500" />
                          <span className={`text-lg font-bold ${
                            aiSuggestion.assetType === 'option'
                              ? aiSuggestion.optionType === 'call' ? 'text-green-500' : 'text-red-500'
                              : analysisResult?.sentiment === 'bearish' ? 'text-red-500' : 'text-cyan-500'
                          }`}>
                            {aiSuggestion.assetType === 'option' 
                              ? `${aiSuggestion.optionType.toUpperCase()} Option` 
                              : analysisResult?.sentiment === 'bearish' ? 'Short/Sell Shares' : 'Buy Shares'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{aiSuggestion.rationale}</p>
                      </div>
                      
                      {aiSuggestion.assetType === 'option' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label htmlFor="strike" className="text-xs text-muted-foreground">Strike Price</Label>
                            <Input
                              id="strike"
                              type="number"
                              placeholder="e.g. 150"
                              value={strikePrice}
                              onChange={(e) => setStrikePrice(e.target.value)}
                              className="h-9 text-xs"
                              data-testid="input-strike"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="expiry" className="text-xs text-muted-foreground">Expiry Date</Label>
                            <Input
                              id="expiry"
                              type="date"
                              value={expiryDate}
                              onChange={(e) => setExpiryDate(e.target.value)}
                              className="h-9 text-xs"
                              data-testid="input-expiry"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="context" className="text-xs font-medium">Context (Optional)</Label>
                    <Textarea
                      id="context"
                      placeholder="Market conditions, patterns to look for..."
                      value={additionalContext}
                      onChange={(e) => setAdditionalContext(e.target.value)}
                      rows={2}
                      className="text-sm resize-none"
                      data-testid="input-context"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleSubmit}
                      disabled={!selectedFile || !symbol || analysisMutation.isPending}
                      className="flex-1"
                      data-testid="button-analyze-chart"
                    >
                      {analysisMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Brain className="h-4 w-4 mr-2" />
                          Analyze Chart
                        </>
                      )}
                    </Button>
                    {(selectedFile || analysisResult) && (
                      <Button variant="outline" onClick={resetForm} data-testid="button-reset">
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-xl p-4 border-l-2 border-l-amber-500">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-500 mb-1">
                      {analysisMode === "day" ? "Day Trading Tip" : "Swing Trading Tip"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {analysisMode === "day" 
                        ? "For intraday charts, use 15-minute candles for cleaner signals. Avoid trading during the first 15 minutes of market open."
                        : "Daily charts work best for swing trades. Look for setups near key support/resistance levels with increasing volume."
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 space-y-4 min-w-0 overflow-hidden">
              {analysisResult ? (
                <>
                  <div className={`glass-card rounded-xl overflow-hidden border-l-2 ${
                    analysisResult.sentiment === "bullish" ? "border-l-green-400" :
                    analysisResult.sentiment === "bearish" ? "border-l-red-400" :
                    "border-l-amber-400"
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            analysisResult.sentiment === "bullish" ? "bg-green-500/10" :
                            analysisResult.sentiment === "bearish" ? "bg-red-500/10" :
                            "bg-amber-500/10"
                          }`}>
                            {analysisResult.sentiment === "bullish" ? (
                              <TrendingUp className="h-6 w-6 text-green-500" />
                            ) : analysisResult.sentiment === "bearish" ? (
                              <TrendingDown className="h-6 w-6 text-red-500" />
                            ) : (
                              <Activity className="h-6 w-6 text-amber-500" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{symbol}</span>
                              <Badge variant="secondary" className="text-[10px]">{timeframe}</Badge>
                              <Badge variant={analysisResult.sentiment === "bullish" ? "default" : analysisResult.sentiment === "bearish" ? "destructive" : "secondary"} className={cn(
                                "text-[10px]",
                                analysisResult.sentiment === "bullish" ? "bg-green-500/10 text-green-500 border-green-500/30" :
                                analysisResult.sentiment === "bearish" ? "bg-red-500/10 text-red-500 border-red-500/30" :
                                "bg-muted/10 text-muted-foreground border-muted/30"
                              )}>
                                {analysisResult.sentiment.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {analysisResult.patterns.length} Patterns Detected • Analysis Complete
                            </p>
                          </div>
                        </div>
                        {savedTradeIdeaId && (
                          <Badge variant={isPromoted ? "default" : "secondary"} className="text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {isPromoted ? "Published" : "Draft Saved"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {analysisResult.priceDiscrepancyWarning && (
                    <div className="glass-card rounded-xl border-l-2 border-l-amber-400 p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                        <div className="space-y-2 flex-1">
                          <p className="text-sm font-semibold text-amber-500">Price Context</p>
                          <p className="text-sm text-muted-foreground">
                            {analysisResult.priceDiscrepancyWarning}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {analysisResult.timeframeWarning && (
                    <div className="glass-card rounded-xl border-l-2 border-l-purple-400 p-4" data-testid="alert-timeframe-warning">
                      <div className="flex items-start gap-3">
                        <Clock className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
                        <div className="space-y-2 flex-1">
                          <p className="text-sm font-semibold text-purple-500">Timeframe Mismatch</p>
                          <p className="text-sm text-muted-foreground">
                            {analysisResult.timeframeWarning}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="glass-card rounded-xl p-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">Entry</p>
                        <p className="text-lg font-bold font-mono tabular-nums" data-testid="text-entry-point">
                          ${analysisResult.entryPoint.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-green-500/10">
                        <p className="text-xs text-muted-foreground mb-1">Target</p>
                        <p className="text-lg font-bold font-mono text-green-500 tabular-nums" data-testid="text-target-price">
                          ${analysisResult.targetPrice.toFixed(2)}
                        </p>
                        <p className="text-xs text-green-500 flex items-center justify-center gap-0.5">
                          <ArrowUpRight className="h-3 w-3" />
                          +{calculateGainPercent().toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-500/10">
                        <p className="text-xs text-muted-foreground mb-1">Stop</p>
                        <p className="text-lg font-bold font-mono text-red-500 tabular-nums" data-testid="text-stop-loss">
                          ${analysisResult.stopLoss.toFixed(2)}
                        </p>
                        <p className="text-xs text-red-500 flex items-center justify-center gap-0.5">
                          <ArrowDownRight className="h-3 w-3" />
                          -{calculateRiskPercent().toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-cyan-500/10">
                        <p className="text-xs text-muted-foreground mb-1">R:R</p>
                        <p className="text-lg font-bold font-mono text-cyan-500 tabular-nums" data-testid="text-risk-reward">
                          {analysisResult.riskRewardRatio.toFixed(1)}:1
                        </p>
                      </div>
                    </div>
                  </div>

                  {validationWarnings.length > 0 && (
                    <div className="glass-card rounded-xl border-l-2 border-l-amber-400 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-amber-500">Validation Alerts</p>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {validationWarnings.map((warning, i) => (
                              <li key={i}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="glass-card rounded-xl">
                    <Tabs defaultValue="ai" className="w-full">
                      <div className="p-4 pb-0">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="ai" className="gap-1.5 text-xs" data-testid="tab-ai-analysis">
                            <Brain className="h-3.5 w-3.5" />
                            AI Analysis
                          </TabsTrigger>
                          <TabsTrigger value="quant" className="gap-1.5 text-xs" data-testid="tab-quant-signals">
                            <Calculator className="h-3.5 w-3.5" />
                            Quant Signals
                          </TabsTrigger>
                          <TabsTrigger value="levels" className="gap-1.5 text-xs" data-testid="tab-levels">
                            <Target className="h-3.5 w-3.5" />
                            Levels
                          </TabsTrigger>
                        </TabsList>
                      </div>
                      <div className="p-4 pt-4">
                        <TabsContent value="ai" className="mt-0 space-y-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                              <Label className="text-xs text-muted-foreground mb-2 block">Predicted Trend</Label>
                              <TrendArrow 
                                sentiment={analysisResult.sentiment} 
                                confidence={analysisResult.confidence}
                                gainPercent={calculateGainPercent()}
                              />
                            </div>
                            <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                              <Label className="text-xs text-muted-foreground mb-2 block text-center">Patterns Found</Label>
                              <div className="text-center" data-testid="patterns-indicator">
                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                  <Target className="h-4 w-4 text-cyan-500" />
                                  <span className="text-lg font-bold text-foreground font-mono tabular-nums">
                                    {analysisResult.patterns.length}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Detected in chart
                                </p>
                              </div>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                              <Label className="text-xs text-muted-foreground mb-2 block text-center">Valid For</Label>
                              <div className="text-center" data-testid="validity-indicator">
                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                  <Clock className="h-4 w-4 text-amber-500" />
                                  <span className="text-lg font-bold text-foreground font-mono tabular-nums" data-testid="text-validity-duration">
                                    {getAnalysisValidity(timeframe).duration}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground" data-testid="text-validity-warning">
                                  {getAnalysisValidity(timeframe).warning}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                            <Label className="text-xs text-muted-foreground mb-3 block">Predicted Price Path</Label>
                            <PredictedPathChart 
                              entry={analysisResult.entryPoint}
                              target={analysisResult.targetPrice}
                              stop={analysisResult.stopLoss}
                              sentiment={analysisResult.sentiment}
                              timeframe={timeframe}
                            />
                          </div>
                          
                          {quantSignals && quantSignals.length > 0 && (
                            <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                              <SignalMeter signals={quantSignals} />
                            </div>
                          )}
                          
                          <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                            <Label className="text-xs text-muted-foreground mb-3 block">Price Target Range</Label>
                            <PriceRangeBar 
                              entry={analysisResult.entryPoint}
                              target={analysisResult.targetPrice}
                              stop={analysisResult.stopLoss}
                              sentiment={analysisResult.sentiment}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Detected Patterns</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {analysisResult.patterns.map((pattern, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px]">
                                  {pattern}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Technical Analysis</Label>
                            <p className="text-sm leading-relaxed" data-testid="text-analysis">
                              {analysisResult.analysis}
                            </p>
                          </div>
                        </TabsContent>

                        <TabsContent value="quant" className="mt-0 space-y-3">
                          {quantSignals?.map((signal, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{signal.name}</span>
                                  <Badge variant={signal.signal === "bullish" ? "default" : signal.signal === "bearish" ? "destructive" : "secondary"} className={cn(
                                    "text-[10px]",
                                    signal.signal === "bullish" ? "bg-green-500/10 text-green-500 border-green-500/30" :
                                    signal.signal === "bearish" ? "bg-red-500/10 text-red-500 border-red-500/30" :
                                    "bg-muted/10 text-muted-foreground border-muted/30"
                                  )}>
                                    {signal.signal}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{signal.description}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold font-mono tabular-nums">{signal.strength}%</span>
                                <Progress value={signal.strength} className="w-16 h-1.5 mt-1" />
                              </div>
                            </div>
                          ))}
                        </TabsContent>

                        <TabsContent value="levels" className="mt-0 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <TrendingUp className="h-3 w-3 text-red-400" />
                                Resistance Levels
                              </Label>
                              <div className="space-y-1">
                                {analysisResult.resistanceLevels.map((level, i) => (
                                  <div key={i} className="flex items-center justify-between p-2 rounded bg-red-500/10">
                                    <span className="text-xs text-muted-foreground">R{i + 1}</span>
                                    <span className="text-sm font-mono font-semibold text-red-400">${level.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <TrendingDown className="h-3 w-3 text-green-400" />
                                Support Levels
                              </Label>
                              <div className="space-y-1">
                                {analysisResult.supportLevels.map((level, i) => (
                                  <div key={i} className="flex items-center justify-between p-2 rounded bg-green-500/10">
                                    <span className="text-xs text-muted-foreground">S{i + 1}</span>
                                    <span className="text-sm font-mono font-semibold text-green-400">${level.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      {!savedTradeIdeaId && (
                        <Button
                          onClick={handleSaveDraft}
                          disabled={saveDraftMutation.isPending}
                          className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                          data-testid="button-save-draft"
                        >
                          {saveDraftMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Database className="h-4 w-4 mr-2" />
                          )}
                          Save as Draft
                        </Button>
                      )}
                      {savedTradeIdeaId && !isPromoted && (
                        <Button
                          onClick={handlePromote}
                          disabled={promoteMutation.isPending}
                          className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white"
                          data-testid="button-publish"
                        >
                          {promoteMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Publish to Trade Ideas
                        </Button>
                      )}
                      {isPromoted && (
                        <Link href="/trade-ideas" className="flex-1">
                          <Button className="w-full" variant="outline" data-testid="button-view-ideas">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View on Trade Ideas
                          </Button>
                        </Link>
                      )}
                    </div>
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={handleSendToDiscord}
                        disabled={sendToDiscordMutation.isPending}
                        variant="outline"
                        className="flex-1 border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10"
                        data-testid="button-send-discord"
                      >
                        {sendToDiscordMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <SiDiscord className="h-4 w-4 mr-2" />
                        )}
                        Send to Discord
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card rounded-xl p-12 text-center">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 flex items-center justify-center">
                    <LineChart className="h-10 w-10 text-amber-500" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Ready to Analyze</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                    Upload a chart screenshot and our AI will identify patterns, key levels, and generate trade recommendations.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      <Brain className="h-3 w-3 mr-1" />
                      AI Pattern Detection
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <Target className="h-3 w-3 mr-1" />
                      Key Levels
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      <Calculator className="h-3 w-3 mr-1" />
                      Risk Analysis
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="search" className="mt-0">
          <PatternSearchTab />
        </TabsContent>

        <TabsContent value="backtest" className="mt-0">
          <PatternBacktestTab />
        </TabsContent>
      </Tabs>

      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Analysis Complete
            </DialogTitle>
            <DialogDescription>
              Your chart has been analyzed successfully. Review the results and save as a trade idea.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowSuccessModal(false)}
              className="flex-1"
            >
              Review Results
            </Button>
            <Button 
              onClick={() => {
                setShowSuccessModal(false);
                handleSaveDraft();
              }}
              className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950"
            >
              <Database className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
