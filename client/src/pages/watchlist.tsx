import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatCTTime } from "@/lib/utils";
import type { WatchlistItem } from "@shared/schema";
import { 
  Star, RefreshCw, TrendingUp, TrendingDown, Activity, 
  BarChart3, Target, Shield, Clock, Bell, ChevronRight,
  Zap, AlertTriangle, CheckCircle, XCircle, Info,
  ArrowUpRight, ArrowDownRight, Minus, Trash2, Plus, Search
} from "lucide-react";

// Enhanced tier configuration with psychology-driven colors and descriptions
const TIER_CONFIG: Record<string, {
  bg: string;
  text: string;
  border: string;
  glow: string;
  label: string;
  description: string;
  action: string;
  icon: typeof Zap;
}> = {
  S: {
    bg: "bg-purple-500/15 dark:bg-purple-500/20",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/30",
    glow: "shadow-purple-500/20",
    label: "Elite",
    description: "Exceptional convergence of bullish signals",
    action: "Priority Watch - Multiple edge factors aligned",
    icon: Zap
  },
  A: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
    glow: "shadow-emerald-500/20",
    label: "Strong",
    description: "Several positive indicators with momentum",
    action: "Active Setup - Building conviction",
    icon: TrendingUp
  },
  B: {
    bg: "bg-cyan-500/15 dark:bg-cyan-500/20",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/30",
    glow: "shadow-cyan-500/20",
    label: "Solid",
    description: "Favorable conditions with room to improve",
    action: "Developing - Monitor for breakout",
    icon: Activity
  },
  C: {
    bg: "bg-amber-500/15 dark:bg-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    glow: "shadow-amber-500/20",
    label: "Neutral",
    description: "Mixed signals requiring patience",
    action: "Wait - No clear edge currently",
    icon: Minus
  },
  D: {
    bg: "bg-orange-500/15 dark:bg-orange-500/20",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    glow: "shadow-orange-500/20",
    label: "Weak",
    description: "Bearish bias with limited upside",
    action: "Caution - Counter-trend risk",
    icon: TrendingDown
  },
  F: {
    bg: "bg-red-500/15 dark:bg-red-500/20",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-500/30",
    glow: "shadow-red-500/20",
    label: "Avoid",
    description: "Poor technical structure",
    action: "Stay Away - High risk, low reward",
    icon: AlertTriangle
  }
};

// Factor explanations for user understanding
const FACTOR_EXPLANATIONS: Record<string, { label: string; description: string; goodRange: string }> = {
  rsi14: {
    label: "RSI(14)",
    description: "Relative Strength Index measures momentum. Below 30 = oversold (bullish), above 70 = overbought (bearish).",
    goodRange: "30-70 is neutral, <30 is bullish, >70 is bearish"
  },
  rsi2: {
    label: "RSI(2)",
    description: "Ultra-short-term momentum for mean reversion. Extreme readings signal potential reversals.",
    goodRange: "<10 is extremely oversold (bullish), >90 is extremely overbought (bearish)"
  },
  momentum5d: {
    label: "5-Day Momentum",
    description: "Price change over 5 trading days. Positive momentum indicates bullish trend.",
    goodRange: ">5% is strong bullish, <-5% is strong bearish"
  },
  adx: {
    label: "ADX",
    description: "Average Directional Index measures trend strength (not direction). Higher = stronger trend.",
    goodRange: ">25 indicates a strong trend"
  },
  volumeRatio: {
    label: "Volume Ratio",
    description: "Current volume vs 20-day average. High volume confirms price moves.",
    goodRange: ">1.5x indicates unusual activity"
  }
};

// Signal Command Bar Component
function SignalCommandBar({ items }: { items: WatchlistItem[] }) {
  const tierCounts = items.reduce((acc, item) => {
    const tier = item.tier || 'C';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const eliteCount = (tierCounts['S'] || 0) + (tierCounts['A'] || 0);
  const neutralCount = (tierCounts['B'] || 0) + (tierCounts['C'] || 0);
  const weakCount = (tierCounts['D'] || 0) + (tierCounts['F'] || 0);
  const avgScore = items.length > 0 
    ? Math.round(items.reduce((sum, i) => sum + (i.gradeScore ?? 50), 0) / items.length)
    : 0;

  const lastGraded = items
    .filter(i => i.lastEvaluatedAt)
    .sort((a, b) => new Date(b.lastEvaluatedAt!).getTime() - new Date(a.lastEvaluatedAt!).getTime())[0];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <Card className="bg-gradient-to-br from-purple-500/10 to-emerald-500/10 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Elite Setups</span>
            <Zap className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400" data-testid="stat-elite-count">
            {eliteCount}
          </p>
          <p className="text-xs text-muted-foreground">S + A tier symbols</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Average Score</span>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold font-mono" data-testid="stat-avg-score">
            {avgScore}<span className="text-sm text-muted-foreground">/100</span>
          </p>
          <Progress value={avgScore} className="h-1 mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Distribution</span>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 text-sm font-mono">
            <span className="text-emerald-600 dark:text-emerald-400">{eliteCount}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-amber-600 dark:text-amber-400">{neutralCount}</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-red-600 dark:text-red-400">{weakCount}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Strong / Neutral / Weak</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Last Update</span>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-mono" data-testid="stat-last-update">
            {lastGraded?.lastEvaluatedAt 
              ? formatCTTime(lastGraded.lastEvaluatedAt).split(' ').slice(1).join(' ')
              : 'Not graded'}
          </p>
          <p className="text-xs text-muted-foreground">Auto-refresh: 15m</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Grade Explanation Panel
function GradeExplanation({ item }: { item: WatchlistItem }) {
  const tier = item.tier || 'C';
  const config = TIER_CONFIG[tier] || TIER_CONFIG.C;
  const score = item.gradeScore ?? 50;
  const gradeInputs = item.gradeInputs as Record<string, number | string[]> | null;
  const Icon = config.icon;

  // Parse signals
  const signals = gradeInputs && Array.isArray(gradeInputs.signals) ? gradeInputs.signals : [];
  const bullishSignals = signals.filter(s => 
    s.toLowerCase().includes('bullish') || 
    s.toLowerCase().includes('oversold') || 
    s.toLowerCase().includes('positive') ||
    s.toLowerCase().includes('strong')
  );
  const bearishSignals = signals.filter(s => 
    s.toLowerCase().includes('bearish') || 
    s.toLowerCase().includes('overbought') || 
    s.toLowerCase().includes('negative') ||
    s.toLowerCase().includes('weak')
  );

  return (
    <div className="space-y-4">
      {/* Grade Hero */}
      <div className={`flex items-center gap-4 p-4 rounded-lg ${config.bg} border ${config.border}`}>
        <div className={`flex items-center justify-center w-16 h-16 rounded-full ${config.bg} border-2 ${config.border}`}>
          <span className={`text-3xl font-bold font-mono ${config.text}`}>{tier}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-lg font-semibold ${config.text}`}>{config.label} Setup</span>
            <Badge variant="outline" className={`${config.text} ${config.border}`}>
              {score}/100
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{config.description}</p>
          <div className="flex items-center gap-1 mt-2 text-xs">
            <Icon className={`h-3 w-3 ${config.text}`} />
            <span className={config.text}>{config.action}</span>
          </div>
        </div>
      </div>

      {/* Factor Breakdown */}
      {gradeInputs && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Quantitative Factors
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {typeof gradeInputs.rsi14 === 'number' && (
              <FactorCard 
                factor="rsi14" 
                value={gradeInputs.rsi14} 
                format={(v) => v.toFixed(1)}
                getStatus={(v) => v < 30 ? 'bullish' : v > 70 ? 'bearish' : 'neutral'}
              />
            )}
            {typeof gradeInputs.rsi2 === 'number' && (
              <FactorCard 
                factor="rsi2" 
                value={gradeInputs.rsi2} 
                format={(v) => v.toFixed(1)}
                getStatus={(v) => v < 10 ? 'bullish' : v > 90 ? 'bearish' : 'neutral'}
              />
            )}
            {typeof gradeInputs.momentum5d === 'number' && (
              <FactorCard 
                factor="momentum5d" 
                value={gradeInputs.momentum5d} 
                format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
                getStatus={(v) => v > 5 ? 'bullish' : v < -5 ? 'bearish' : 'neutral'}
              />
            )}
            {typeof gradeInputs.adx === 'number' && (
              <FactorCard 
                factor="adx" 
                value={gradeInputs.adx} 
                format={(v) => v.toFixed(1)}
                getStatus={(v) => v > 25 ? 'bullish' : 'neutral'}
              />
            )}
            {typeof gradeInputs.volumeRatio === 'number' && (
              <FactorCard 
                factor="volumeRatio" 
                value={gradeInputs.volumeRatio} 
                format={(v) => `${v.toFixed(2)}x`}
                getStatus={(v) => v > 1.5 ? 'bullish' : v < 0.5 ? 'bearish' : 'neutral'}
              />
            )}
          </div>
        </div>
      )}

      {/* Signal Summary */}
      {signals.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4" />
            Key Signals Detected
          </h4>
          <div className="flex flex-wrap gap-2">
            {bullishSignals.map((signal, i) => (
              <Badge key={i} className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                <ArrowUpRight className="h-3 w-3 mr-1" />
                {signal}
              </Badge>
            ))}
            {bearishSignals.map((signal, i) => (
              <Badge key={i} className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30">
                <ArrowDownRight className="h-3 w-3 mr-1" />
                {signal}
              </Badge>
            ))}
            {signals.filter(s => !bullishSignals.includes(s) && !bearishSignals.includes(s)).map((signal, i) => (
              <Badge key={i} variant="outline">
                {signal}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Psychology Panel */}
      <div className="p-3 rounded-lg bg-muted/50 border">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
          <Shield className="h-3 w-3" />
          Trade Psychology
        </h4>
        <p className="text-sm text-muted-foreground">
          {tier === 'S' || tier === 'A' 
            ? "Multiple factors are aligning. This is when patience pays off - wait for your entry, don't chase."
            : tier === 'B' || tier === 'C'
            ? "Setup is developing but not yet optimal. Track closely and be ready to act when conditions improve."
            : "Current conditions don't favor this trade. Protecting capital is more important than forcing trades."
          }
        </p>
      </div>
    </div>
  );
}

// Factor Card Component
function FactorCard({ 
  factor, 
  value, 
  format, 
  getStatus 
}: { 
  factor: string; 
  value: number; 
  format: (v: number) => string;
  getStatus: (v: number) => 'bullish' | 'bearish' | 'neutral';
}) {
  const info = FACTOR_EXPLANATIONS[factor];
  const status = getStatus(value);
  const statusColors = {
    bullish: 'text-green-600 dark:text-green-400 bg-green-500/10',
    bearish: 'text-red-600 dark:text-red-400 bg-red-500/10',
    neutral: 'text-muted-foreground bg-muted/50'
  };
  const StatusIcon = status === 'bullish' ? CheckCircle : status === 'bearish' ? XCircle : Minus;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`p-3 rounded-lg border ${statusColors[status]} cursor-help`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">{info?.label || factor}</span>
            <StatusIcon className="h-3 w-3" />
          </div>
          <span className="text-lg font-bold font-mono">{format(value)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-semibold">{info?.label}</p>
          <p className="text-xs text-muted-foreground">{info?.description}</p>
          <p className="text-xs"><strong>Optimal:</strong> {info?.goodRange}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Alert Dialog Component
function AlertDialog({ item }: { item: WatchlistItem }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [entryAlert, setEntryAlert] = useState(item.entryAlertPrice?.toString() || '');
  const [stopAlert, setStopAlert] = useState(item.stopAlertPrice?.toString() || '');
  const [targetAlert, setTargetAlert] = useState(item.targetAlertPrice?.toString() || '');
  const [alertsEnabled, setAlertsEnabled] = useState(item.alertsEnabled ?? false);

  const updateAlertsMutation = useMutation({
    mutationFn: async (data: Partial<WatchlistItem>) => {
      const response = await apiRequest('PATCH', `/api/watchlist/${item.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Alerts Updated", description: `Price alerts for ${item.symbol} saved` });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" data-testid={`button-alerts-${item.symbol}`}>
          <Bell className={`h-3 w-3 ${item.alertsEnabled ? 'text-cyan-500' : ''}`} />
          Alerts
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Price Alerts: {item.symbol}</DialogTitle>
          <DialogDescription>Get notified when price levels are reached</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <Label>Enable Alerts</Label>
            <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
          </div>
          <div className="space-y-2">
            <Label>Entry Price</Label>
            <Input type="number" step="0.01" value={entryAlert} onChange={(e) => setEntryAlert(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Target Price</Label>
            <Input type="number" step="0.01" value={targetAlert} onChange={(e) => setTargetAlert(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Stop Loss</Label>
            <Input type="number" step="0.01" value={stopAlert} onChange={(e) => setStopAlert(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => updateAlertsMutation.mutate({
                entryAlertPrice: entryAlert ? parseFloat(entryAlert) : null,
                stopAlertPrice: stopAlert ? parseFloat(stopAlert) : null,
                targetAlertPrice: targetAlert ? parseFloat(targetAlert) : null,
                alertsEnabled
              })}
              disabled={updateAlertsMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Watchlist Item Card
function WatchlistItemCard({ item }: { item: WatchlistItem }) {
  const tier = item.tier || 'C';
  const config = TIER_CONFIG[tier] || TIER_CONFIG.C;
  const Icon = config.icon;
  const { toast } = useToast();

  const reGradeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/watchlist/${item.id}/grade`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Grade Updated", description: `${item.symbol} re-graded successfully` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/watchlist/${item.id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Removed", description: `${item.symbol} removed from watchlist` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <AccordionItem value={item.id} className="border rounded-lg mb-2 overflow-hidden">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 [&[data-state=open]]:bg-muted/30">
        <div className="flex items-center gap-3 flex-1">
          {/* Tier Badge */}
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${config.bg} border ${config.border}`}>
            <span className={`text-lg font-bold font-mono ${config.text}`}>{tier}</span>
          </div>

          {/* Symbol Info */}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold font-mono text-lg" data-testid={`text-symbol-${item.symbol}`}>
                {item.symbol}
              </span>
              <Badge variant="outline" className="text-xs">
                {item.assetType.toUpperCase()}
              </Badge>
              <Badge className={`${config.bg} ${config.text} border-0 text-xs`}>
                {item.gradeScore ?? 50}/100
              </Badge>
            </div>
            {item.notes && (
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">{item.notes}</p>
            )}
          </div>

          {/* Action hint */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className={`h-3 w-3 ${config.text}`} />
            <span className={config.text}>{config.label}</span>
          </div>
        </div>
      </AccordionTrigger>
      
      <AccordionContent className="px-4 pb-4">
        {/* Grade Explanation */}
        <GradeExplanation item={item} />

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => reGradeMutation.mutate()}
            disabled={reGradeMutation.isPending}
            data-testid={`button-regrade-${item.symbol}`}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${reGradeMutation.isPending ? 'animate-spin' : ''}`} />
            Re-grade
          </Button>
          <AlertDialog item={item} />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            data-testid={`button-delete-${item.symbol}`}
          >
            <Trash2 className={`h-3 w-3 mr-1 ${deleteMutation.isPending ? 'animate-spin' : ''}`} />
            Remove
          </Button>
          {item.targetPrice && (
            <div className="ml-auto text-sm">
              Target: <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">{formatCurrency(item.targetPrice)}</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>Added {formatCTTime(item.addedAt)}</span>
          {item.lastEvaluatedAt && <span>Graded {formatCTTime(item.lastEvaluatedAt)}</span>}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// Tier Group Component
function TierGroup({ 
  title, 
  description, 
  items, 
  accentColor 
}: { 
  title: string; 
  description: string; 
  items: WatchlistItem[]; 
  accentColor: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-1 h-6 rounded-full ${accentColor}`} />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline" className="ml-auto">{items.length}</Badge>
      </div>
      <Accordion type="multiple" className="space-y-0">
        {items.map(item => (
          <WatchlistItemCard key={item.id} item={item} />
        ))}
      </Accordion>
    </div>
  );
}

// Add Symbol Dialog
function AddSymbolDialog() {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState<'stock' | 'crypto' | 'future'>('stock');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/watchlist', {
        symbol: symbol.toUpperCase(),
        assetType,
        notes: notes || `Added from symbol search`,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Added", description: `${symbol.toUpperCase()} added to watchlist` });
      setSymbol('');
      setNotes('');
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-symbol">
          <Plus className="h-4 w-4 mr-2" />
          Add Symbol
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Symbol to Watchlist</DialogTitle>
          <DialogDescription>Enter a stock ticker, crypto symbol, or futures contract</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Symbol</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="AAPL, BTC, NQ..." 
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="pl-9"
                data-testid="input-symbol"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Asset Type</Label>
            <div className="flex gap-2">
              {(['stock', 'crypto', 'future'] as const).map((type) => (
                <Button
                  key={type}
                  variant={assetType === type ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setAssetType(type)}
                  data-testid={`button-type-${type}`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input 
              placeholder="Why are you tracking this?" 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-notes"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => addMutation.mutate()}
              disabled={!symbol || addMutation.isPending}
              data-testid="button-confirm-add"
            >
              {addMutation.isPending ? 'Adding...' : 'Add to Watchlist'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main Page Component
export default function WatchlistPage() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'conviction' | 'all'>('conviction');

  const { data: watchlistItems = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  const reGradeAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/watchlist/grade-all');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ 
        title: "Grades Refreshed", 
        description: `${data.graded} symbols re-graded successfully` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Sort by tier then score
  const sortedItems = [...watchlistItems].sort((a, b) => {
    const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
    const tierA = tierOrder[a.tier || 'C'] ?? 3;
    const tierB = tierOrder[b.tier || 'C'] ?? 3;
    if (tierA !== tierB) return tierA - tierB;
    return (b.gradeScore ?? 50) - (a.gradeScore ?? 50);
  });

  // Group by conviction level
  const eliteItems = sortedItems.filter(i => i.tier === 'S' || i.tier === 'A');
  const solidItems = sortedItems.filter(i => i.tier === 'B' || i.tier === 'C');
  const weakItems = sortedItems.filter(i => i.tier === 'D' || i.tier === 'F');

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-watchlist">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Star className="h-6 w-6 text-cyan-500" />
            Watchlist Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            {watchlistItems.length} symbols analyzed with quantitative grading
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'conviction' | 'all')}>
            <TabsList>
              <TabsTrigger value="conviction" data-testid="tab-conviction">By Conviction</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-all">All Symbols</TabsTrigger>
            </TabsList>
          </Tabs>
          <AddSymbolDialog />
          <Button 
            variant="outline"
            onClick={() => reGradeAllMutation.mutate()}
            disabled={reGradeAllMutation.isPending}
            data-testid="button-regrade-all"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${reGradeAllMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
        </div>
      </div>

      {/* Signal Command Bar */}
      <SignalCommandBar items={watchlistItems} />

      {/* Methodology Info */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-cyan-500 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">How Grading Works</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Each symbol is scored 0-100 using quantitative factors: RSI momentum, trend strength (ADX), 
                volume activity, and moving average signals. Grades auto-refresh every 15 minutes during market hours.
                Click any symbol to see the full breakdown and understand why it received its grade.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {viewMode === 'conviction' ? (
        <div className="space-y-8">
          <TierGroup 
            title="Elite Setups (S & A Tier)" 
            description="High-conviction opportunities with multiple bullish factors aligned"
            items={eliteItems}
            accentColor="bg-gradient-to-b from-purple-500 to-emerald-500"
          />
          <TierGroup 
            title="Developing Setups (B & C Tier)" 
            description="Neutral to positive conditions - monitor for improvement"
            items={solidItems}
            accentColor="bg-gradient-to-b from-cyan-500 to-amber-500"
          />
          <TierGroup 
            title="Weak Setups (D & F Tier)" 
            description="Poor conditions - avoid or consider as contrarian plays only"
            items={weakItems}
            accentColor="bg-gradient-to-b from-orange-500 to-red-500"
          />
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-0">
          {sortedItems.map(item => (
            <WatchlistItemCard key={item.id} item={item} />
          ))}
        </Accordion>
      )}

      {/* Empty State */}
      {watchlistItems.length === 0 && (
        <Card className="p-12 text-center">
          <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold mb-2">No Symbols in Watchlist</h3>
          <p className="text-muted-foreground mb-4">
            Add symbols from the Market Overview to start tracking and grading them
          </p>
          <Button variant="outline">
            Go to Market Overview
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Card>
      )}
    </div>
  );
}
