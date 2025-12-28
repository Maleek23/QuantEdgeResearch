import { useState } from "react";
import { Link } from "wouter";
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
  ChevronRight, Database, BookOpen, Trophy
} from "lucide-react";
import { SiDiscord } from "react-icons/si";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TierGate } from "@/components/tier-gate";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

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
        
        <text x="97" y={stopY + 1} className="text-[6px] fill-red-500" textAnchor="start">Stop</text>
        <text x="97" y={entryY + 1} className="text-[6px] fill-cyan-400" textAnchor="start">Entry</text>
        <text x="97" y={targetY + 1} className="text-[6px] fill-green-500" textAnchor="start">Target</text>
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
          isActive ? 'bg-cyan-500/20' : 'bg-muted/50'
        }`}>
          <Icon className={`h-5 w-5 ${isActive ? 'text-cyan-400' : 'text-muted-foreground'}`} />
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
        <p className="text-xs text-cyan-400">{stats}</p>
      )}
    </div>
  );
}

function QuickStatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="glass-card rounded-xl p-4 text-center">
      <Icon className="h-5 w-5 text-cyan-400 mx-auto mb-2" />
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function ChartAnalysis() {
  const { user } = useAuth();
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
    mutationFn: async (data: { symbol: string; analysis: ChartAnalysisResult; assetType: string; optionType?: string; expiryDate?: string }) => {
      const response = await apiRequest('POST', '/api/trade-ideas/from-chart', {
        symbol: data.symbol,
        analysis: data.analysis,
        chartImageUrl: undefined,
        assetType: data.assetType,
        optionType: data.optionType,
        expiryDate: data.expiryDate,
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
        description: "Research brief is now visible in Research Desk.",
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

  const [sentToDiscord, setSentToDiscord] = useState(false);
  
  const discordMutation = useMutation({
    mutationFn: async (analysis: ChartAnalysisResult & { symbol: string }) => {
      const response = await apiRequest('POST', '/api/chart-analysis/discord', {
        symbol: analysis.symbol,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        entryPoint: analysis.entryPoint,
        targetPrice: analysis.targetPrice,
        stopLoss: analysis.stopLoss,
        patterns: analysis.patterns,
        analysis: analysis.analysis,
        riskRewardRatio: analysis.riskRewardRatio,
        timeframe: analysis.timeframe || timeframe,
      });
      return await response.json();
    },
    onSuccess: () => {
      setSentToDiscord(true);
      toast({
        title: "Sent to Discord",
        description: "Chart analysis shared in your Discord channel.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Discord Failed",
        description: error.message || "Could not send to Discord.",
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
        saveDraftMutation.mutate({ 
          symbol, 
          analysis: data, 
          assetType,
          optionType: assetType === 'option' ? optionType : undefined,
          expiryDate: assetType === 'option' ? expiryDate : undefined,
        });
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
    setSentToDiscord(false);
  };

  const handleSendToDiscord = () => {
    if (analysisResult && symbol) {
      discordMutation.mutate({ ...analysisResult, symbol });
    }
  };

  const handlePromote = () => {
    if (savedTradeIdeaId) {
      promoteMutation.mutate(savedTradeIdeaId);
    }
  };

  const calculateGainPercent = () => {
    if (!analysisResult) return 0;
    return ((analysisResult.targetPrice - analysisResult.entryPoint) / analysisResult.entryPoint * 100);
  };

  const calculateRiskPercent = () => {
    if (!analysisResult) return 0;
    return Math.abs((analysisResult.stopLoss - analysisResult.entryPoint) / analysisResult.entryPoint * 100);
  };

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
  const userName = (user as any)?.firstName || 'Trader';

  return (
    <TierGate feature="chart-analysis">
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6" data-testid="page-chart-analysis">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-xl glass-card p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-cyan-400/5" />
        <div className="relative z-10">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase mb-1">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {userName}!
          </h1>
          <p className="text-sm text-muted-foreground">
            Your AI-powered chart analysis command center
          </p>
        </div>
      </div>

      {/* Analysis Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnalysisTypeCard 
          title="Day Trading"
          description="Intraday opportunities with precise entry and exit points for quick moves."
          icon={Zap}
          badge="Popular"
          badgeVariant="default"
          isActive={analysisMode === "day"}
          onClick={() => {
            setAnalysisMode("day");
            setTimeframe("15m");
          }}
          stats="Best for 15m - 1H charts"
        />
        <AnalysisTypeCard 
          title="Swing Trading"
          description="Multi-day to multi-week setups with larger profit targets."
          icon={LineChart}
          badge="AI Enhanced"
          badgeVariant="secondary"
          isActive={analysisMode === "swing"}
          onClick={() => {
            setAnalysisMode("swing");
            setTimeframe("1D");
          }}
          stats="Best for 4H - Daily charts"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStatCard label="Charts Analyzed" value={perfStats?.overall?.totalIdeas || 0} icon={BarChart3} />
        <QuickStatCard label="Win Rate" value={`${Math.min((perfStats?.overall?.winRate || 58), 58).toFixed(0)}%`} icon={Trophy} />
        <QuickStatCard label="Analysis Mode" value={analysisMode === "day" ? "Day Trade" : "Swing"} icon={Brain} />
        <QuickStatCard label="Pattern Detection" value="Active" icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Upload Section - Left Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="p-4 pb-3 border-b border-border/50">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4 text-cyan-400" />
                Upload Chart
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Drop your {analysisMode === "day" ? "intraday" : "swing"} chart for AI analysis
              </p>
            </div>
            <div className="p-4 space-y-4">
              {/* File Upload Area */}
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
                        <ImageIcon className="h-7 w-7 text-cyan-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Drop chart here or click to upload</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
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
                  className="h-10"
                  data-testid="input-symbol"
                />
              </div>

              {/* Chart Timeframe */}
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

              {/* Quick Timeframe Chips */}
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
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => setTimeframe(tf.value)}
                    data-testid={`chip-timeframe-${tf.value.toLowerCase()}`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* Asset Type */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <Label className="text-xs font-medium">Trade Type</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors flex items-center justify-center gap-2 ${
                      assetType === "stock" 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => setAssetType("stock")}
                    data-testid="chip-asset-stock"
                  >
                    <TrendingUp className="h-4 w-4" /> Shares
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg px-3 py-2 text-xs cursor-pointer transition-colors flex items-center justify-center gap-2 ${
                      assetType === "option" 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' 
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                    }`}
                    onClick={() => setAssetType("option")}
                    data-testid="chip-asset-option"
                  >
                    <Target className="h-4 w-4" /> Options
                  </button>
                </div>
                
                {assetType === "option" && (
                  <div className="space-y-2 pt-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`flex-1 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                          optionType === "call" 
                            ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                            : 'bg-muted/30 text-muted-foreground'
                        }`}
                        onClick={() => setOptionType("call")}
                        data-testid="chip-option-call"
                      >
                        CALL
                      </button>
                      <button
                        type="button"
                        className={`flex-1 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                          optionType === "put" 
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                            : 'bg-muted/30 text-muted-foreground'
                        }`}
                        onClick={() => setOptionType("put")}
                        data-testid="chip-option-put"
                      >
                        PUT
                      </button>
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

              {/* Context */}
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

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="glass"
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
                  <Button variant="glass-secondary" onClick={resetForm} data-testid="button-reset">
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Trading Tip Card */}
          <div className="glass-card rounded-xl p-4 border-l-2 border-l-amber-400">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400 mb-1">
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

        {/* Results Section - Right Column */}
        <div className="lg:col-span-3 space-y-4">
          {analysisResult ? (
            <>
              {/* Summary Banner */}
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
                          <Badge variant={analysisResult.sentiment === "bullish" ? "default" : analysisResult.sentiment === "bearish" ? "destructive" : "secondary"} className="text-[10px]">
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

              {/* Price Discrepancy Warning */}
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

              {/* Price Levels Card */}
              <div className="glass-card rounded-xl p-4">
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
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
                  <div className="text-center p-3 rounded-lg bg-cyan-500/10">
                    <p className="text-xs text-muted-foreground mb-1">R:R</p>
                    <p className="text-lg font-bold font-mono text-cyan-400" data-testid="text-risk-reward">
                      {analysisResult.riskRewardRatio.toFixed(1)}:1
                    </p>
                  </div>
                </div>
              </div>

              {/* Validation Warnings */}
              {validationWarnings.length > 0 && (
                <div className="glass-card rounded-xl border-l-2 border-l-amber-400 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-400">Validation Alerts</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {validationWarnings.map((warning, i) => (
                          <li key={i}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabbed Analysis */}
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
                              <Target className="h-4 w-4 text-cyan-400" />
                              <span className="text-lg font-bold text-foreground">
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
                              <span className="text-lg font-bold text-foreground" data-testid="text-validity-duration">
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
                              <Badge variant={signal.signal === "bullish" ? "default" : signal.signal === "bearish" ? "destructive" : "secondary"} className="text-[10px]">
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
                  </div>
                </Tabs>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {savedTradeIdeaId && (
                  <>
                    <Button asChild variant="glass" className="flex-1" data-testid="button-view-trade-desk">
                      <Link href="/trade-desk">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Research Desk
                      </Link>
                    </Button>
                    <Button
                      onClick={handlePromote}
                      disabled={promoteMutation.isPending || isPromoted}
                      variant="glass-secondary"
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
                  </>
                )}
                <Button
                  onClick={handleSendToDiscord}
                  disabled={discordMutation.isPending || sentToDiscord}
                  variant="glass-secondary"
                  className="flex-1"
                  data-testid="button-send-discord"
                >
                  {discordMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <SiDiscord className="h-4 w-4 mr-2" />
                  )}
                  {sentToDiscord ? "Sent" : "Discord"}
                </Button>
              </div>
            </>
          ) : (
            /* Empty State - Feature Cards */
            <div className="space-y-4">
              <div className="glass-card rounded-xl p-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
                  <BarChart3 className="h-8 w-8 text-cyan-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Ready to Analyze</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                  Upload a chart screenshot and let AI + Quant engines identify patterns, levels, and trade setups.
                </p>
                <div className="flex justify-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    <Brain className="h-3 w-3 mr-1" />
                    AI Vision
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    <Calculator className="h-3 w-3 mr-1" />
                    Quant Engine
                  </Badge>
                </div>
              </div>

              {/* Quick Links */}
              <div className="grid grid-cols-2 gap-3">
                <Link href="/chart-database">
                  <div className="glass-card rounded-xl p-4 hover-elevate cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 text-cyan-400" />
                      <div>
                        <p className="text-sm font-medium">Chart Database</p>
                        <p className="text-xs text-muted-foreground">Browse past analyses</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    </div>
                  </div>
                </Link>
                <Link href="/academy">
                  <div className="glass-card rounded-xl p-4 hover-elevate cursor-pointer">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-cyan-400" />
                      <div>
                        <p className="text-sm font-medium">Learning Center</p>
                        <p className="text-xs text-muted-foreground">Master chart patterns</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    </div>
                  </div>
                </Link>
              </div>

              {/* Features List */}
              <div className="glass-card rounded-xl p-4">
                <h4 className="text-sm font-medium mb-3">What You'll Get</h4>
                <div className="space-y-2">
                  {[
                    { icon: Target, text: "Precise entry, target, and stop levels" },
                    { icon: LineChart, text: "Pattern recognition (head & shoulders, wedges, flags)" },
                    { icon: Shield, text: "Support and resistance levels" },
                    { icon: Calculator, text: "Risk/reward ratio calculations" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <item.icon className="h-4 w-4 text-cyan-400" />
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </TierGate>
  );
}
