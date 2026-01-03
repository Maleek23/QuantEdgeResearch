import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, Zap, Shield, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SignalWeight {
  signalName: string;
  baseWeight: number;
  dynamicWeight: number;
  winRate: number;
  totalTrades: number;
  confidence: 'high' | 'medium' | 'low' | 'untested';
  isOverridden: boolean;
  overrideWeight?: number;
}

interface WeightsSummary {
  enabled: boolean;
  totalSignals: number;
  boostedCount: number;
  reducedCount: number;
  neutralCount: number;
  overriddenCount: number;
  topBoosted: SignalWeight[];
  topReduced: SignalWeight[];
  allWeights: SignalWeight[];
}

export function SignalWeightsPanel() {
  const { data, isLoading } = useQuery<WeightsSummary>({
    queryKey: ['/api/signal-weights'],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="border-purple-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-purple-400" />
            Dynamic Signal Weights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const getConfidenceBadge = (conf: string) => {
    switch (conf) {
      case 'high': return <Badge variant="default" className="bg-green-600 text-xs">A</Badge>;
      case 'medium': return <Badge variant="default" className="bg-blue-600 text-xs">B</Badge>;
      case 'low': return <Badge variant="default" className="bg-amber-600 text-xs">C</Badge>;
      default: return <Badge variant="outline" className="text-xs">?</Badge>;
    }
  };

  const getWeightColor = (weight: number) => {
    if (weight >= 1.5) return 'text-green-400';
    if (weight >= 1.2) return 'text-green-300';
    if (weight <= 0.5) return 'text-red-400';
    if (weight <= 0.8) return 'text-red-300';
    return 'text-muted-foreground';
  };

  const getWeightIcon = (weight: number) => {
    if (weight >= 1.2) return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (weight <= 0.8) return <TrendingDown className="h-3 w-3 text-red-400" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <Card className="border-purple-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-400" />
            Dynamic Signal Weights
          </div>
          <Badge variant={data.enabled ? "default" : "outline"} className="text-xs">
            {data.enabled ? "Active" : "Disabled"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded bg-muted/50">
            <div className="text-xl font-bold" data-testid="text-total-signals">{data.totalSignals}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="p-2 rounded bg-green-500/10">
            <div className="text-xl font-bold text-green-400" data-testid="text-boosted-count">{data.boostedCount}</div>
            <div className="text-xs text-muted-foreground">Boosted</div>
          </div>
          <div className="p-2 rounded bg-red-500/10">
            <div className="text-xl font-bold text-red-400" data-testid="text-reduced-count">{data.reducedCount}</div>
            <div className="text-xs text-muted-foreground">Reduced</div>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <div className="text-xl font-bold text-muted-foreground" data-testid="text-neutral-count">{data.neutralCount}</div>
            <div className="text-xs text-muted-foreground">Neutral</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Signal Distribution</span>
            <span>{Math.round((data.boostedCount / data.totalSignals) * 100)}% boosted</span>
          </div>
          <div className="flex h-2 rounded overflow-hidden">
            <div 
              className="bg-green-500" 
              style={{ width: `${(data.boostedCount / data.totalSignals) * 100}%` }}
            />
            <div 
              className="bg-muted" 
              style={{ width: `${(data.neutralCount / data.totalSignals) * 100}%` }}
            />
            <div 
              className="bg-red-500" 
              style={{ width: `${(data.reducedCount / data.totalSignals) * 100}%` }}
            />
          </div>
        </div>

        <Tabs defaultValue="boosted" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-8">
            <TabsTrigger value="boosted" className="text-xs" data-testid="tab-boosted-signals">
              <TrendingUp className="h-3 w-3 mr-1" /> Boosted
            </TabsTrigger>
            <TabsTrigger value="reduced" className="text-xs" data-testid="tab-reduced-signals">
              <TrendingDown className="h-3 w-3 mr-1" /> Reduced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="boosted" className="mt-2">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.topBoosted.slice(0, 8).map((signal, i) => (
                <div 
                  key={signal.signalName} 
                  className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                  data-testid={`row-boosted-signal-${i}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getConfidenceBadge(signal.confidence)}
                    <span className="truncate text-xs">{signal.signalName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {signal.winRate.toFixed(0)}% / {signal.totalTrades}
                    </span>
                    <span className={`font-mono font-bold ${getWeightColor(signal.dynamicWeight)}`}>
                      {signal.dynamicWeight.toFixed(2)}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="reduced" className="mt-2">
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.topReduced.slice(0, 8).map((signal, i) => (
                <div 
                  key={signal.signalName} 
                  className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
                  data-testid={`row-reduced-signal-${i}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getConfidenceBadge(signal.confidence)}
                    <span className="truncate text-xs">{signal.signalName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {signal.winRate.toFixed(0)}% / {signal.totalTrades}
                    </span>
                    <span className={`font-mono font-bold ${getWeightColor(signal.dynamicWeight)}`}>
                      {signal.dynamicWeight.toFixed(2)}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="pt-2 border-t border-border/50">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4 shrink-0 mt-0.5 text-purple-400" />
            <div>
              <span className="font-medium text-foreground">Freedom + Optimization:</span>{' '}
              Weights adjust influence, never reject signals. Override any signal manually to catch new patterns.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
