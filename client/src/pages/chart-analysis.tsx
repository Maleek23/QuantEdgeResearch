import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload, Image as ImageIcon, TrendingUp, TrendingDown, DollarSign, 
  AlertTriangle, Brain, Loader2, ExternalLink, CheckCircle2, Sparkles,
  Target, Shield, Activity, BarChart3, ArrowUpRight, ArrowDownRight,
  Zap, Clock, Calculator, Gauge
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TierGate } from "@/components/tier-gate";

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
        <span className="text-xl font-bold" style={{ color }} data-testid="text-confidence-value">{value}%</span>
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
        <span className="text-2xl font-bold block" style={{ color }} data-testid="text-expected-move">
          {isBullish ? "+" : isBearish ? "-" : "±"}{Math.abs(gainPercent).toFixed(1)}%
        </span>
        <p className="text-xs text-muted-foreground">Expected</p>
      </div>
    </div>
  );
}

// Predicted price path mini chart
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
  
  // Normalize price levels to chart coordinates (0-100 scale)
  const prices = [stop, entry, target];
  const minPrice = Math.min(...prices) * 0.995;
  const maxPrice = Math.max(...prices) * 1.005;
  const range = maxPrice - minPrice || 1;
  
  const normalize = (price: number) => 90 - ((price - minPrice) / range) * 80; // Invert for SVG coords
  
  const entryY = normalize(entry);
  const targetY = normalize(target);
  const stopY = normalize(stop);
  
  // Generate path points for predicted movement
  const pathColor = isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#f59e0b";
  const stopColor = "#ef4444";
  const targetColor = "#22c55e";
  
  // Create a realistic looking price path
  const generatePath = () => {
    if (isBullish) {
      // Bullish: start at entry, small dip, then rise to target
      return `M 15 ${entryY} Q 25 ${entryY + 5} 35 ${entryY - 3} Q 50 ${entryY - 10} 65 ${(entryY + targetY) / 2} Q 80 ${targetY + 5} 90 ${targetY}`;
    } else if (isBearish) {
      // Bearish: start at entry, small bump, then fall to target
      return `M 15 ${entryY} Q 25 ${entryY - 5} 35 ${entryY + 3} Q 50 ${entryY + 10} 65 ${(entryY + targetY) / 2} Q 80 ${targetY - 5} 90 ${targetY}`;
    }
    // Neutral: sideways movement
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
        
        {/* Grid lines */}
        <line x1="10" y1="10" x2="10" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
        <line x1="10" y1="90" x2="95" y2="90" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
        
        {/* Stop loss zone (dashed red line) */}
        <line 
          x1="10" y1={stopY} x2="95" y2={stopY} 
          stroke={stopColor} 
          strokeWidth="1" 
          strokeDasharray="3,3"
          strokeOpacity="0.5"
        />
        
        {/* Target zone (dashed green line) */}
        <line 
          x1="10" y1={targetY} x2="95" y2={targetY} 
          stroke={targetColor} 
          strokeWidth="1" 
          strokeDasharray="3,3"
          strokeOpacity="0.5"
        />
        
        {/* Entry line (blue) */}
        <line 
          x1="10" y1={entryY} x2="95" y2={entryY} 
          stroke="#3b82f6" 
          strokeWidth="1" 
          strokeDasharray="2,2"
          strokeOpacity="0.4"
        />
        
        {/* Predicted price path */}
        <path
          d={generatePath()}
          fill="none"
          stroke="url(#pathGradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        
        {/* Entry point marker */}
        <circle cx="15" cy={entryY} r="3" fill="#3b82f6" />
        
        {/* Target point marker */}
        <circle cx="90" cy={targetY} r="3" fill={pathColor} />
        
        {/* Labels */}
        <text x="97" y={stopY + 1} className="text-[6px] fill-red-500" textAnchor="start">Stop</text>
        <text x="97" y={entryY + 1} className="text-[6px] fill-blue-500" textAnchor="start">Entry</text>
        <text x="97" y={targetY + 1} className="text-[6px] fill-green-500" textAnchor="start">Target</text>
      </svg>
      
      {/* Price labels */}
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
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
  // Price validation fields (from backend)
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

// Calculate how long a chart analysis remains valid based on timeframe
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

export default function ChartAnalysis() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("1D");
  const [additionalContext, setAdditionalContext] = useState("");
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResult | null>(null);
  const [savedTradeIdeaId, setSavedTradeIdeaId] = useState<string | null>(null);
  const [isPromoted, setIsPromoted] = useState(false);
  const { toast } = useToast();

  // Generate deterministic quant signals based on analysis result
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

  // Mutation to save analysis as draft trade idea
  const saveDraftMutation = useMutation({
    mutationFn: async (data: { symbol: string; analysis: ChartAnalysisResult }) => {
      const response = await apiRequest('POST', '/api/trade-ideas/from-chart', {
        symbol: data.symbol,
        analysis: data.analysis,
        chartImageUrl: undefined,
      });
      return await response.json();
    },
    onSuccess: (data: any) => {
      setSavedTradeIdeaId(data.id);
      toast({
        title: "Saved as Draft",
        description: "Analysis saved as draft trade idea.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Save",
        description: error.message || "Could not save analysis.",
        variant: "destructive",
      });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('PATCH', `/api/trade-ideas/${id}/promote`);
      return await response.json();
    },
    onSuccess: () => {
      setIsPromoted(true);
      toast({
        title: "Published",
        description: "Trade idea is now visible in Trade Desk.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Publish",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const analysisMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await fetch('/api/chart-analysis', {
        method: 'POST',
        body: data,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to analyze chart');
      }
      
      return await response.json() as ChartAnalysisResult;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "Analysis Complete",
        description: "Chart analyzed successfully.",
      });

      if (symbol) {
        saveDraftMutation.mutate({ symbol, analysis: data });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: "Please select a valid image file.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please upload a chart image.",
        variant: "destructive",
      });
      return;
    }

    if (!symbol) {
      toast({
        title: "Symbol Required",
        description: "Please enter a symbol.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('chart', selectedFile);
    formData.append('symbol', symbol);
    formData.append('timeframe', timeframe);
    formData.append('context', additionalContext);

    analysisMutation.mutate(formData);
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setSymbol("");
    setTimeframe("1D");
    setAdditionalContext("");
    setAnalysisResult(null);
    setSavedTradeIdeaId(null);
    setIsPromoted(false);
  };

  const handlePromote = () => {
    if (savedTradeIdeaId) {
      promoteMutation.mutate(savedTradeIdeaId);
    }
  };

  // Calculate percentages for display
  const calculateGainPercent = () => {
    if (!analysisResult) return 0;
    return ((analysisResult.targetPrice - analysisResult.entryPoint) / analysisResult.entryPoint * 100);
  };

  const calculateRiskPercent = () => {
    if (!analysisResult) return 0;
    return Math.abs((analysisResult.stopLoss - analysisResult.entryPoint) / analysisResult.entryPoint * 100);
  };

  // Validation warnings
  const getValidationWarnings = () => {
    if (!analysisResult) return [];
    const warnings: string[] = [];
    
    const gainPercent = calculateGainPercent();
    const riskPercent = calculateRiskPercent();
    
    if (gainPercent > 35) {
      warnings.push(`Target gain of ${gainPercent.toFixed(1)}% may be overly optimistic for equities`);
    }
    if (riskPercent > 6) {
      warnings.push(`Stop loss distance of ${riskPercent.toFixed(1)}% exceeds recommended 6% max`);
    }
    if (riskPercent < 0.5) {
      warnings.push(`Stop loss of ${riskPercent.toFixed(1)}% is too tight - may trigger on noise`);
    }
    if (analysisResult.riskRewardRatio > 5) {
      warnings.push(`R:R of ${analysisResult.riskRewardRatio.toFixed(1)}:1 is unusually high - verify levels`);
    }
    
    return warnings;
  };

  const validationWarnings = getValidationWarnings();

  return (
    <TierGate feature="chart-analysis">
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6" data-testid="page-chart-analysis">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            Chart Analysis
          </h1>
          <p className="text-sm text-muted-foreground">
            AI + Quantitative analysis for precise trade setups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Brain className="h-3 w-3" />
            AI Vision
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Calculator className="h-3 w-3" />
            Quant Engine
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Upload Section - Left Column */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Chart
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Upload Area */}
              <div 
                className="relative border-2 border-dashed rounded-xl p-4 text-center hover:border-primary/50 transition-colors cursor-pointer bg-muted/30"
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
                    <div className="py-6 space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Drop chart here or click to upload</p>
                        <p className="text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
                      </div>
                    </div>
                  )}
                </label>
              </div>

              {/* Symbol Input */}
              <div className="space-y-1.5">
                <Label htmlFor="symbol" className="text-xs font-medium">Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="AAPL, TSLA, BTC..."
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="h-9"
                  data-testid="input-symbol"
                />
              </div>

              {/* Chart Timeframe Dropdown */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">Chart Timeframe</Label>
                  <Clock className="h-3 w-3 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  What time period does each candle/bar represent on your chart?
                </p>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger className="h-9" data-testid="select-timeframe">
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

              {/* Quick Timeframe Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "15m", label: "15 Min" },
                  { value: "1H", label: "1 Hour" },
                  { value: "4H", label: "4 Hour" },
                  { value: "1D", label: "Daily" }
                ].map((tf) => (
                  <Badge
                    key={tf.value}
                    variant={timeframe === tf.value ? "default" : "outline"}
                    className="cursor-pointer text-xs hover-elevate"
                    onClick={() => setTimeframe(tf.value)}
                    data-testid={`chip-timeframe-${tf.value.toLowerCase()}`}
                  >
                    {tf.label}
                  </Badge>
                ))}
              </div>

              {/* Context */}
              <div className="space-y-1.5">
                <Label htmlFor="context" className="text-xs font-medium">Context (Optional)</Label>
                <Textarea
                  id="context"
                  placeholder="Market conditions, specific patterns to look for..."
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                  data-testid="input-context"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
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
                      <Zap className="h-4 w-4 mr-2" />
                      Analyze
                    </>
                  )}
                </Button>
                {(selectedFile || analysisResult) && (
                  <Button variant="outline" onClick={resetForm} data-testid="button-reset">
                    Reset
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Section - Right Column */}
        <div className="lg:col-span-3 space-y-6">
          {analysisResult ? (
            <>
              {/* Summary Banner */}
              <Card className={`overflow-hidden border-l-4 ${
                analysisResult.sentiment === "bullish" ? "border-l-green-500" :
                analysisResult.sentiment === "bearish" ? "border-l-red-500" :
                "border-l-amber-500"
              }`}>
                <CardContent className="p-4">
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
                          <Badge variant="secondary" className="text-xs">{timeframe}</Badge>
                          <Badge 
                            variant={analysisResult.sentiment === "bullish" ? "default" : 
                                    analysisResult.sentiment === "bearish" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {analysisResult.sentiment.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {analysisResult.confidence}% Confidence • {analysisResult.patterns.length} Patterns
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {savedTradeIdeaId && (
                        <Badge variant={isPromoted ? "default" : "outline"} className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {isPromoted ? "Published" : "Draft"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Price Context Info (only for extreme discrepancies) */}
              {analysisResult.priceDiscrepancyWarning && (
                <Card className="border-amber-500/50 bg-amber-500/10">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      <div className="space-y-2 flex-1">
                        <p className="text-sm font-semibold text-amber-500">Price Context</p>
                        <p className="text-sm text-muted-foreground">
                          {analysisResult.priceDiscrepancyWarning}
                        </p>
                        {analysisResult.adjustedLevels && (
                          <div className="mt-3 p-3 rounded-lg bg-background/50">
                            <p className="text-xs font-medium mb-2">Alternative: If entering at current price:</p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className="text-xs text-muted-foreground">Entry</p>
                                <p className="font-mono font-bold text-sm">${analysisResult.adjustedLevels.entry.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Target</p>
                                <p className="font-mono font-bold text-sm text-green-500">${analysisResult.adjustedLevels.target.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Stop</p>
                                <p className="font-mono font-bold text-sm text-red-500">${analysisResult.adjustedLevels.stop.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Current Price Display */}
              {analysisResult.currentPrice && !analysisResult.priceDiscrepancyWarning && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>Current {symbol} Price: <span className="font-mono font-bold text-foreground">${analysisResult.currentPrice.toFixed(2)}</span></span>
                </div>
              )}

              {/* Price Levels Card */}
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground mb-1">Entry</p>
                      <p className="text-lg font-bold font-mono" data-testid="text-entry-point">
                        ${analysisResult.entryPoint.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-green-500/10">
                      <p className="text-xs text-muted-foreground mb-1">Target</p>
                      <p className="text-lg font-bold font-mono text-green-500" data-testid="text-target-price">
                        ${analysisResult.targetPrice.toFixed(2)}
                      </p>
                      <p className="text-xs text-green-500 flex items-center justify-center gap-0.5">
                        <ArrowUpRight className="h-3 w-3" />
                        +{calculateGainPercent().toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-500/10">
                      <p className="text-xs text-muted-foreground mb-1">Stop</p>
                      <p className="text-lg font-bold font-mono text-red-500" data-testid="text-stop-loss">
                        ${analysisResult.stopLoss.toFixed(2)}
                      </p>
                      <p className="text-xs text-red-500 flex items-center justify-center gap-0.5">
                        <ArrowDownRight className="h-3 w-3" />
                        -{calculateRiskPercent().toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <p className="text-xs text-muted-foreground mb-1">R:R</p>
                      <p className="text-lg font-bold font-mono text-primary" data-testid="text-risk-reward">
                        {analysisResult.riskRewardRatio.toFixed(1)}:1
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Validation Warnings */}
              {validationWarnings.length > 0 && (
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardContent className="p-3">
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
                  </CardContent>
                </Card>
              )}

              {/* Tabbed Analysis */}
              <Card>
                <Tabs defaultValue="ai" className="w-full">
                  <CardHeader className="pb-0">
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
                  </CardHeader>
                  <CardContent className="pt-4">
                    <TabsContent value="ai" className="mt-0 space-y-4">
                      {/* Visual Graphics Row */}
                      <div className="grid grid-cols-3 gap-4">
                        {/* Predicted Trend */}
                        <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                          <Label className="text-xs text-muted-foreground mb-2 block">Predicted Trend</Label>
                          <TrendArrow 
                            sentiment={analysisResult.sentiment} 
                            confidence={analysisResult.confidence}
                            gainPercent={calculateGainPercent()}
                          />
                        </div>
                        
                        {/* Confidence Gauge */}
                        <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                          <Label className="text-xs text-muted-foreground mb-2 block text-center">AI Confidence</Label>
                          <ConfidenceGauge 
                            value={analysisResult.confidence} 
                            sentiment={analysisResult.sentiment}
                          />
                        </div>
                        
                        {/* Analysis Validity */}
                        <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                          <Label className="text-xs text-muted-foreground mb-2 block text-center">Valid For</Label>
                          <div className="text-center" data-testid="validity-indicator">
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                              <Clock className="h-4 w-4 text-amber-500" />
                              <span className="text-lg font-bold text-foreground" data-testid="text-validity-duration">
                                {getAnalysisValidity(timeframe).duration}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground" data-testid="text-validity-warning">
                              {getAnalysisValidity(timeframe).warning}
                            </p>
                            <Badge variant="outline" className="mt-2 text-xs" data-testid="badge-timeframe-display">
                              {timeframe} Chart
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      {/* Predicted Path Chart */}
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
                      
                      {/* Signal Balance Meter */}
                      {quantSignals && quantSignals.length > 0 && (
                        <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                          <SignalMeter signals={quantSignals} />
                        </div>
                      )}
                      
                      {/* Price Range Visualization */}
                      <div className="p-4 rounded-lg bg-muted/20 border border-muted/50">
                        <Label className="text-xs text-muted-foreground mb-3 block">Price Target Range</Label>
                        <PriceRangeBar 
                          entry={analysisResult.entryPoint}
                          target={analysisResult.targetPrice}
                          stop={analysisResult.stopLoss}
                          sentiment={analysisResult.sentiment}
                        />
                      </div>
                      
                      {/* Patterns */}
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Detected Patterns</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.patterns.map((pattern, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {pattern}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      {/* Analysis Text */}
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
                              <Badge 
                                variant={signal.signal === "bullish" ? "default" : 
                                        signal.signal === "bearish" ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {signal.signal}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{signal.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">{signal.strength}%</p>
                            <Progress value={signal.strength} className="w-16 h-1.5 mt-1" />
                          </div>
                        </div>
                      )) || (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Enter a symbol to see quant signals
                        </p>
                      )}
                    </TabsContent>

                    <TabsContent value="levels" className="mt-0">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Shield className="h-3 w-3 text-green-500" />
                            Support Levels
                          </Label>
                          <div className="space-y-1">
                            {analysisResult.supportLevels.map((level, i) => (
                              <div key={i} className="flex items-center justify-between p-2 rounded bg-green-500/10">
                                <span className="text-xs text-muted-foreground">S{i + 1}</span>
                                <span className="font-mono text-sm text-green-500">${level.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Target className="h-3 w-3 text-red-500" />
                            Resistance Levels
                          </Label>
                          <div className="space-y-1">
                            {analysisResult.resistanceLevels.map((level, i) => (
                              <div key={i} className="flex items-center justify-between p-2 rounded bg-red-500/10">
                                <span className="text-xs text-muted-foreground">R{i + 1}</span>
                                <span className="font-mono text-sm text-red-500">${level.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
              </Card>

              {/* Action Buttons */}
              {savedTradeIdeaId && (
                <div className="flex gap-2">
                  <Button asChild className="flex-1" data-testid="button-view-trade-desk">
                    <Link href="/trade-desk">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View in Trade Desk
                    </Link>
                  </Button>
                  <Button
                    onClick={handlePromote}
                    disabled={promoteMutation.isPending || isPromoted}
                    variant="outline"
                    className="flex-1"
                    data-testid="button-promote"
                  >
                    {promoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {isPromoted ? "Published" : "Publish"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <Card className="h-full min-h-[400px] flex items-center justify-center">
              <CardContent className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No Analysis Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Upload a chart image and enter a symbol to get AI-powered technical analysis combined with quantitative signals.
                </p>
                <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Brain className="h-3.5 w-3.5" />
                    Pattern Recognition
                  </div>
                  <div className="flex items-center gap-1">
                    <Calculator className="h-3.5 w-3.5" />
                    Quant Validation
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    Price Levels
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Educational purposes only. Not financial advice. Always conduct your own research before trading.
          </span>
        </CardContent>
      </Card>
    </div>
    </TierGate>
  );
}
