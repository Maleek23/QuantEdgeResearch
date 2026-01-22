import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Target, 
  Clock, 
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Zap,
  Shield
} from "lucide-react";

interface SmartAdvisory {
  symbol: string;
  currentPrice: number;
  entryPrice: number;
  currentPnL: number;
  currentPnLPercent: number;
  exitSignal: {
    action: string;
    urgency: string;
    reason: string;
    confidence: number;
  };
  targetFills: {
    conservative: number;
    moderate: number;
    aggressive: number;
  };
  rebuySignal: {
    shouldRebuy: boolean;
    rebuyZone: { low: number; high: number };
    optimalEntry: number;
    suggestedContract?: {
      strike: number;
      expiry: string;
      estimatedPremium: number;
      reasoning: string;
    };
    confidence: number;
    waitForSignals: string[];
  };
  technicalSnapshot: {
    rsi2: number;
    rsi14: number;
    trend: string;
    support: number;
    resistance: number;
    isOverbought: boolean;
    isOversold: boolean;
  };
  optionMetrics?: {
    dte: number;
    thetaDecay: string;
    intrinsicValue: number;
    timeValue: number;
    breakeven: number;
  };
  actionPlan: string[];
  timestamp: string;
}

interface RebuyAdvice {
  currentPrice: number;
  isGoodEntry: boolean;
  rebuyZone: { low: number; high: number };
  suggestedAction: string;
  confidence: number;
}

export default function SmartAdvisor() {
  const [symbol, setSymbol] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [assetType, setAssetType] = useState<"stock" | "option" | "crypto">("option");
  const [optionType, setOptionType] = useState<"call" | "put">("call");
  const [strikePrice, setStrikePrice] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  
  const [rebuySymbol, setRebuySymbol] = useState("");
  const [previousEntry, setPreviousEntry] = useState("");

  const analyzePosition = useMutation({
    mutationFn: async (): Promise<SmartAdvisory> => {
      const payload: any = {
        symbol: symbol.toUpperCase(),
        entryPrice: parseFloat(entryPrice),
        quantity: parseFloat(quantity),
        assetType
      };
      
      if (assetType === "option") {
        payload.optionType = optionType;
        if (strikePrice) payload.strikePrice = parseFloat(strikePrice);
        if (expiryDate) payload.expiryDate = expiryDate;
      }
      
      const response = await apiRequest("POST", "/api/smart-advisor/analyze", payload);
      return response.json();
    }
  });

  const { data: rebuyAdvice, refetch: checkRebuy, isLoading: rebuyLoading } = useQuery<RebuyAdvice>({
    queryKey: ["/api/smart-advisor/rebuy", rebuySymbol, previousEntry],
    enabled: false
  });

  const handleAnalyze = () => {
    if (symbol && entryPrice) {
      analyzePosition.mutate();
    }
  };

  const handleRebuyCheck = () => {
    if (rebuySymbol && previousEntry) {
      checkRebuy();
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'moderate': return 'bg-yellow-500';
      default: return 'bg-green-500';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'SELL_NOW': return <ArrowDownCircle className="h-5 w-5 text-red-500" />;
      case 'SELL_PARTIAL': return <TrendingDown className="h-5 w-5 text-orange-500" />;
      case 'TRAIL_STOP': return <Shield className="h-5 w-5 text-blue-500" />;
      default: return <TrendingUp className="h-5 w-5 text-green-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Zap className="h-8 w-8 text-cyan-500" />
          Smart Position Advisor
        </h1>
        <p className="text-muted-foreground mt-1">
          Get real-time exit signals, target fills, and rebuy recommendations
        </p>
      </div>

      <Tabs defaultValue="analyze" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analyze" data-testid="tab-analyze">Analyze Position</TabsTrigger>
          <TabsTrigger value="rebuy" data-testid="tab-rebuy">Rebuy Scanner</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enter Your Position</CardTitle>
              <CardDescription>
                Tell us what you're holding and we'll analyze exit timing and target fills
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Symbol</Label>
                  <Input
                    data-testid="input-symbol"
                    placeholder="ARM"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Entry Price</Label>
                  <Input
                    data-testid="input-entry-price"
                    type="number"
                    step="0.01"
                    placeholder="0.87"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    data-testid="input-quantity"
                    type="number"
                    placeholder="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Asset Type</Label>
                  <Select value={assetType} onValueChange={(v) => setAssetType(v as any)}>
                    <SelectTrigger data-testid="select-asset-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="option">Option</SelectItem>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {assetType === "option" && (
                  <>
                    <div className="space-y-2">
                      <Label>Option Type</Label>
                      <Select value={optionType} onValueChange={(v) => setOptionType(v as any)}>
                        <SelectTrigger data-testid="select-option-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="put">Put</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Strike Price</Label>
                      <Input
                        data-testid="input-strike"
                        type="number"
                        placeholder="120"
                        value={strikePrice}
                        onChange={(e) => setStrikePrice(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Expiry Date</Label>
                      <Input
                        data-testid="input-expiry"
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              
              <Button 
                className="mt-4 w-full" 
                onClick={handleAnalyze}
                disabled={!symbol || !entryPrice || analyzePosition.isPending}
                data-testid="button-analyze"
              >
                {analyzePosition.isPending ? (
                  <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</>
                ) : (
                  <><Zap className="mr-2 h-4 w-4" /> Analyze Position</>
                )}
              </Button>
            </CardContent>
          </Card>

          {analyzePosition.data && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {getActionIcon(analyzePosition.data.exitSignal.action)}
                      Exit Signal
                    </span>
                    <Badge className={getUrgencyColor(analyzePosition.data.exitSignal.urgency)}>
                      {analyzePosition.data.exitSignal.urgency.toUpperCase()}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-2xl font-bold">
                      <span>{analyzePosition.data.exitSignal.action.replace(/_/g, ' ')}</span>
                      <span className="text-sm text-muted-foreground">
                        {analyzePosition.data.exitSignal.confidence}% confidence
                      </span>
                    </div>
                    
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {analyzePosition.data.exitSignal.reason}
                      </AlertDescription>
                    </Alert>
                    
                    <div className="space-y-2">
                      <h4 className="font-semibold flex items-center gap-1">
                        <Target className="h-4 w-4" /> Target Fills
                      </h4>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="bg-green-500/10 p-2 rounded text-center">
                          <div className="text-muted-foreground">Conservative</div>
                          <div className="font-mono font-bold text-green-500">
                            ${analyzePosition.data.targetFills.conservative.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-yellow-500/10 p-2 rounded text-center">
                          <div className="text-muted-foreground">Moderate</div>
                          <div className="font-mono font-bold text-yellow-500">
                            ${analyzePosition.data.targetFills.moderate.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-orange-500/10 p-2 rounded text-center">
                          <div className="text-muted-foreground">Aggressive</div>
                          <div className="font-mono font-bold text-orange-500">
                            ${analyzePosition.data.targetFills.aggressive.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-cyan-500" />
                    Position P/L
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Current Price</div>
                        <div className="text-2xl font-mono font-bold">
                          ${analyzePosition.data.currentPrice.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Your Entry</div>
                        <div className="text-2xl font-mono">
                          ${analyzePosition.data.entryPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    
                    <div className={`text-center p-4 rounded-lg ${analyzePosition.data.currentPnLPercent >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      <div className="text-sm text-muted-foreground">Unrealized P/L</div>
                      <div className={`text-3xl font-bold ${analyzePosition.data.currentPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {analyzePosition.data.currentPnLPercent >= 0 ? '+' : ''}{analyzePosition.data.currentPnLPercent.toFixed(1)}%
                      </div>
                    </div>
                    
                    {analyzePosition.data.optionMetrics && (
                      <div className="space-y-2">
                        <h4 className="font-semibold flex items-center gap-1">
                          <Clock className="h-4 w-4" /> Option Metrics
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">DTE:</span>
                            <span className={`font-bold ${analyzePosition.data.optionMetrics.dte <= 5 ? 'text-red-500' : ''}`}>
                              {analyzePosition.data.optionMetrics.dte} days
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Theta Risk:</span>
                            <Badge variant={analyzePosition.data.optionMetrics.thetaDecay === 'critical' ? 'destructive' : 'secondary'}>
                              {analyzePosition.data.optionMetrics.thetaDecay}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Breakeven:</span>
                            <span className="font-mono">${analyzePosition.data.optionMetrics.breakeven.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <ArrowUpCircle className="h-5 w-5 text-blue-500" />
                    Rebuy Signal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">
                        {analyzePosition.data.rebuySignal.shouldRebuy ? 'Rebuy Active' : 'Wait for Dip'}
                      </span>
                      <Badge variant={analyzePosition.data.rebuySignal.shouldRebuy ? 'default' : 'secondary'}>
                        {analyzePosition.data.rebuySignal.confidence}% conf
                      </Badge>
                    </div>
                    
                    <div className="bg-blue-500/10 p-3 rounded-lg">
                      <div className="text-sm text-muted-foreground">Optimal Rebuy Zone</div>
                      <div className="text-xl font-mono font-bold text-blue-500">
                        ${analyzePosition.data.rebuySignal.rebuyZone.low.toFixed(2)} - ${analyzePosition.data.rebuySignal.rebuyZone.high.toFixed(2)}
                      </div>
                    </div>
                    
                    {analyzePosition.data.rebuySignal.suggestedContract && (
                      <div className="text-sm space-y-1">
                        <div className="font-semibold">Suggested Contract:</div>
                        <div className="font-mono">
                          ${analyzePosition.data.rebuySignal.suggestedContract.strike} {optionType.toUpperCase()} exp {analyzePosition.data.rebuySignal.suggestedContract.expiry}
                        </div>
                        <div className="text-muted-foreground">
                          Est. premium: ${analyzePosition.data.rebuySignal.suggestedContract.estimatedPremium.toFixed(2)}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-sm">
                      <div className="font-semibold mb-1">Wait for:</div>
                      <ul className="list-disc list-inside text-muted-foreground">
                        {analyzePosition.data.rebuySignal.waitForSignals.map((signal, i) => (
                          <li key={i}>{signal}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle>Technical Snapshot</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">RSI(2):</span>
                        <span className={`font-bold ${
                          analyzePosition.data.technicalSnapshot.rsi2 > 80 ? 'text-red-500' : 
                          analyzePosition.data.technicalSnapshot.rsi2 < 20 ? 'text-green-500' : ''
                        }`}>
                          {analyzePosition.data.technicalSnapshot.rsi2.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">RSI(14):</span>
                        <span>{analyzePosition.data.technicalSnapshot.rsi14.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trend:</span>
                        <Badge variant={
                          analyzePosition.data.technicalSnapshot.trend === 'bullish' ? 'default' : 
                          analyzePosition.data.technicalSnapshot.trend === 'bearish' ? 'destructive' : 'secondary'
                        }>
                          {analyzePosition.data.technicalSnapshot.trend}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={
                          analyzePosition.data.technicalSnapshot.isOverbought ? 'destructive' : 
                          analyzePosition.data.technicalSnapshot.isOversold ? 'default' : 'secondary'
                        }>
                          {analyzePosition.data.technicalSnapshot.isOverbought ? 'OVERBOUGHT' : 
                           analyzePosition.data.technicalSnapshot.isOversold ? 'OVERSOLD' : 'NEUTRAL'}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                      <div className="bg-green-500/10 p-2 rounded text-center">
                        <div className="text-xs text-muted-foreground">Support</div>
                        <div className="font-mono font-bold text-green-500">
                          ${analyzePosition.data.technicalSnapshot.support.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-red-500/10 p-2 rounded text-center">
                        <div className="text-xs text-muted-foreground">Resistance</div>
                        <div className="font-mono font-bold text-red-500">
                          ${analyzePosition.data.technicalSnapshot.resistance.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Action Plan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyzePosition.data.actionPlan.map((action, i) => (
                      <div 
                        key={i} 
                        className="p-3 bg-muted/50 rounded-lg text-lg"
                        data-testid={`action-plan-${i}`}
                      >
                        {action}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rebuy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Rebuy Scanner</CardTitle>
              <CardDescription>
                Check if a symbol has pulled back enough for a good re-entry
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Symbol</Label>
                  <Input
                    data-testid="input-rebuy-symbol"
                    placeholder="ARM"
                    value={rebuySymbol}
                    onChange={(e) => setRebuySymbol(e.target.value.toUpperCase())}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Your Previous Entry</Label>
                  <Input
                    data-testid="input-previous-entry"
                    type="number"
                    step="0.01"
                    placeholder="0.87"
                    value={previousEntry}
                    onChange={(e) => setPreviousEntry(e.target.value)}
                  />
                </div>
                
                <div className="flex items-end">
                  <Button 
                    className="w-full" 
                    onClick={handleRebuyCheck}
                    disabled={!rebuySymbol || !previousEntry || rebuyLoading}
                    data-testid="button-check-rebuy"
                  >
                    {rebuyLoading ? (
                      <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Checking...</>
                    ) : (
                      <><Target className="mr-2 h-4 w-4" /> Check Rebuy</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {rebuyAdvice && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{rebuySymbol} Rebuy Analysis</span>
                  <Badge variant={rebuyAdvice.isGoodEntry ? 'default' : 'secondary'}>
                    {rebuyAdvice.isGoodEntry ? 'GOOD ENTRY' : 'WAIT'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Current Price</div>
                      <div className="text-3xl font-mono font-bold">
                        ${rebuyAdvice.currentPrice.toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="bg-blue-500/10 p-4 rounded-lg">
                      <div className="text-sm text-muted-foreground">Optimal Rebuy Zone</div>
                      <div className="text-xl font-mono font-bold text-blue-500">
                        ${rebuyAdvice.rebuyZone.low.toFixed(2)} - ${rebuyAdvice.rebuyZone.high.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <Alert variant={rebuyAdvice.isGoodEntry ? 'default' : 'destructive'}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Recommendation</AlertTitle>
                      <AlertDescription>
                        {rebuyAdvice.suggestedAction}
                      </AlertDescription>
                    </Alert>
                    
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">Signal Confidence</div>
                      <div className="text-2xl font-bold">{rebuyAdvice.confidence}%</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
