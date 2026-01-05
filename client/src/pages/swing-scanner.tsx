import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  AlertTriangle,
  Send,
  RefreshCw,
  BarChart3,
  Activity
} from "lucide-react";

interface SwingOpportunity {
  symbol: string;
  currentPrice: number;
  rsi14: number;
  targetPrice: number;
  targetPercent: number;
  stopLoss: number;
  stopLossPercent: number;
  holdDays: number;
  pattern: string;
  grade: string;
  score: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  sma50: number;
  sma200: number;
  trendBias: 'bullish' | 'bearish' | 'neutral';
  reason: string;
  createdAt: string;
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'S': return 'bg-yellow-500 text-black';
    case 'A': return 'bg-green-500 text-white';
    case 'B': return 'bg-blue-500 text-white';
    case 'C': return 'bg-orange-500 text-white';
    default: return 'bg-gray-500 text-white';
  }
}

function getTrendIcon(trend: string) {
  if (trend === 'bullish') return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === 'bearish') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Activity className="w-4 h-4 text-gray-500" />;
}

export default function SwingScanner() {
  const { toast } = useToast();

  const { data: opportunities, isLoading, refetch, isFetching } = useQuery<SwingOpportunity[]>({
    queryKey: ['/api/swing-scanner'],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const sendToDiscord = useMutation({
    mutationFn: async (opp: SwingOpportunity) => {
      const response = await fetch('/api/swing-scanner/send-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opp),
      });
      if (!response.ok) throw new Error('Failed to send');
      return response.json();
    },
    onSuccess: (_, opp) => {
      toast({
        title: "Sent to Discord",
        description: `${opp.symbol} swing opportunity shared`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to send",
        description: "Check Discord webhook configuration",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="title-swing-scanner">
            <BarChart3 className="w-6 h-6 text-primary" />
            Swing Trade Scanner
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Daily chart patterns • RSI(14) oversold • 5-10% targets • 3-10 day holds
          </p>
        </div>
        <Button 
          onClick={() => refetch()} 
          variant="outline" 
          disabled={isFetching}
          data-testid="button-refresh-swing"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="bg-amber-950/20 border-amber-600/30">
        <CardContent className="py-3">
          <p className="text-amber-200 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>
              <strong>Research Only:</strong> These swing trade ideas are for educational purposes. 
              Always conduct your own analysis and manage risk appropriately.
            </span>
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : opportunities && opportunities.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opportunities.map((opp) => (
            <Card 
              key={opp.symbol} 
              className="hover-elevate transition-all"
              data-testid={`card-swing-${opp.symbol}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">{opp.symbol}</CardTitle>
                  <Badge className={getGradeColor(opp.grade)}>
                    {opp.grade} ({opp.score})
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {getTrendIcon(opp.trendBias)}
                  <span className="capitalize">{opp.trendBias} trend</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Entry:</span>
                    <span className="ml-2 font-mono">${opp.currentPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RSI(14):</span>
                    <span className={`ml-2 font-mono ${opp.rsi14 < 30 ? 'text-red-400' : opp.rsi14 < 40 ? 'text-orange-400' : ''}`}>
                      {opp.rsi14.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-green-500" />
                    <span className="text-green-400">
                      ${opp.targetPrice.toFixed(2)} (+{opp.targetPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    <span className="text-red-400">
                      ${opp.stopLoss.toFixed(2)} (-{opp.stopLossPercent.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{opp.holdDays} day hold</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {opp.pattern.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground">
                  Volume: {opp.volumeRatio.toFixed(1)}x avg • 
                  SMA50: ${opp.sma50.toFixed(2)}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => sendToDiscord.mutate(opp)}
                  disabled={sendToDiscord.isPending}
                  data-testid={`button-discord-${opp.symbol}`}
                >
                  <Send className="w-3 h-3 mr-2" />
                  Send to Discord
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Swing Opportunities</h3>
            <p className="text-muted-foreground text-sm mt-2">
              No stocks currently meet the RSI(14) oversold criteria with sufficient pattern quality.
              Check back later as market conditions change.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scanner Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <div className="font-medium text-primary">Timeframe</div>
              <div className="text-muted-foreground">Daily charts (not intraday)</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-primary">RSI Filter</div>
              <div className="text-muted-foreground">RSI(14) below 50, best under 40</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-primary">Target Range</div>
              <div className="text-muted-foreground">5-10% profit targets</div>
            </div>
            <div className="space-y-1">
              <div className="font-medium text-primary">Hold Time</div>
              <div className="text-muted-foreground">3-10 trading days</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
