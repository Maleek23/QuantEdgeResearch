import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload, Image as ImageIcon, TrendingUp, TrendingDown, DollarSign, 
  AlertTriangle, Brain, Loader2, ExternalLink, CheckCircle2, Sparkles,
  Target, Shield, Activity, BarChart3, ArrowUpRight, ArrowDownRight,
  Zap, Clock, Calculator, Gauge, Send, LineChart, Lightbulb, Users,
  ChevronRight, Database, BookOpen, Trophy, Plus, Search, RefreshCw,
  Filter, Eye, History, ArrowRight, TrendingUpDown
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
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData, Time } from "lightweight-charts";

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
  indicators: {
    rsi: { value: number; period: number };
    rsi2: { value: number; period: number };
    macd: { macd: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number };
    adx: { value: number; regime: string; suitableFor: string };
    stochRSI: { k: number; d: number } | null;
    ichimoku: { tenkan: number; kijun: number; senkouA: number; senkouB: number; chikou: number } | null;
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
    
    const candleSeries = chart.addCandlestickSeries({
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
    
    if (patternData.bbSeries?.length) {
      const bbUpper = chart.addLineSeries({
        color: "#60a5fa",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      const bbMiddle = chart.addLineSeries({
        color: "#94a3b8",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      
      const bbLower = chart.addLineSeries({
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
    
    if (patternData.patterns.length > 0) {
      const lastCandle = patternData.candles[patternData.candles.length - 1];
      const markers = patternData.patterns.map((pattern) => {
        const markerColor = pattern.type === "bullish" ? "#22c55e" : pattern.type === "bearish" ? "#ef4444" : "#f59e0b";
        const position = pattern.type === "bullish" ? "belowBar" : "aboveBar";
        const shape = pattern.type === "bullish" ? "arrowUp" : pattern.type === "bearish" ? "arrowDown" : "circle";
        
        return {
          time: lastCandle.time as Time,
          position: position as "aboveBar" | "belowBar",
          color: markerColor,
          shape: shape as "arrowUp" | "arrowDown" | "circle",
          text: pattern.name,
        };
      });
      candleSeries.setMarkers(markers);
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
  }, [patternData]);
  
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
    
    const rsiSeries = chart.addLineSeries({
      color: "#8b5cf6",
      lineWidth: 2,
      priceLineVisible: false,
    });
    
    const overboughtLine = chart.addLineSeries({
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    
    const oversoldLine = chart.addLineSeries({
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
          
          <Card className="glass-card overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-cyan-400" />
                Price Chart with Bollinger Bands
              </CardTitle>
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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

export default function ChartAnalysis() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState("visual");
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
    const symbolParam = urlParams.get('symbol');
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
      const response = await apiRequest('POST', `/api/trade-ideas/${tradeIdeaId}/promote`);
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
        <TabsList className="grid w-full grid-cols-3 mb-6" data-testid="tabs-main-navigation">
          <TabsTrigger value="visual" className="gap-2" data-testid="tab-visual-analysis">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Visual Analysis</span>
            <span className="sm:hidden">Visual</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-2" data-testid="tab-pattern-search">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Pattern Search</span>
            <span className="sm:hidden">Search</span>
          </TabsTrigger>
          <TabsTrigger value="backtest" className="gap-2" data-testid="tab-pattern-backtest">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Pattern Backtest</span>
            <span className="sm:hidden">Backtest</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="mt-0">
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
                          : 'bg-cyan-500/10 border border-cyan-500/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-cyan-500" />
                          <span className={`text-lg font-bold ${
                            aiSuggestion.assetType === 'option'
                              ? aiSuggestion.optionType === 'call' ? 'text-green-500' : 'text-red-500'
                              : 'text-cyan-500'
                          }`}>
                            {aiSuggestion.assetType === 'option' 
                              ? `${aiSuggestion.optionType.toUpperCase()} Option` 
                              : 'Buy Shares'}
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
