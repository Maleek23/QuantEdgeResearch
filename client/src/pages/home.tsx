import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WatchSuggestions } from "@/components/watch-suggestions";
import type { TradeIdea } from "@shared/schema";
import { Link } from "wouter";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  AlertTriangle, 
  Sparkles, 
  ArrowRight,
  DollarSign,
  Clock,
  CheckCircle2,
  Zap
} from "lucide-react";
import { format, parseISO, isSameDay, subHours } from "date-fns";
import { getPerformanceGrade } from "@/lib/performance-grade";

export default function HomePage() {
  const { toast } = useToast();

  const { data: tradeIdeas = [], isLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000, // 60s for home page (shares cache with Trade Desk)
    staleTime: 30000,
  });

  const generateHybridIdeas = useMutation({
    mutationFn: () => apiRequest('POST', '/api/generate-hybrid-ideas'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({ title: "Fresh ideas generated!", description: "Check out today's new opportunities" });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Try again in a moment", variant: "destructive" });
    }
  });

  // Get today's fresh, open ideas sorted by confidence
  const todaysTopIdeas = tradeIdeas
    .filter(idea => {
      const ideaDate = parseISO(idea.timestamp);
      const isToday = isSameDay(ideaDate, new Date());
      const isOpen = (idea.outcomeStatus || '').trim().toLowerCase() === 'open';
      const isFresh = ideaDate >= subHours(new Date(), 12); // Last 12 hours
      return (isToday || isFresh) && isOpen;
    })
    .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
    .slice(0, 3);

  // Calculate weekly stats
  const thisWeekIdeas = tradeIdeas.filter(idea => {
    const ideaDate = parseISO(idea.timestamp);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return ideaDate >= weekStart;
  });

  const closedThisWeek = thisWeekIdeas.filter(i => 
    ['hit_target', 'hit_stop'].includes((i.outcomeStatus || '').trim().toLowerCase())
  );
  const winsThisWeek = thisWeekIdeas.filter(i => 
    (i.outcomeStatus || '').trim().toLowerCase() === 'hit_target'
  ).length;
  const winRate = closedThisWeek.length > 0 ? (winsThisWeek / closedThisWeek.length) * 100 : 0;

  // Weekly goal tracking (user's goal: $100-500/week)
  const weeklyGoal = 200; // Target $200/week as middle ground
  const weeklyPnL = thisWeekIdeas.reduce((sum, i) => sum + (i.realizedPnL || 0), 0);
  const goalProgress = Math.min((weeklyPnL / weeklyGoal) * 100, 100);

  const getDirectionIcon = (direction: string) => {
    return direction === 'long' ? 
      <TrendingUp className="h-4 w-4 text-green-500" /> : 
      <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  const getAssetBadge = (assetType: string) => {
    const colors: Record<string, string> = {
      'option': 'bg-purple-500/20 text-purple-400',
      'stock': 'bg-blue-500/20 text-blue-400',
      'crypto': 'bg-amber-500/20 text-amber-400',
    };
    return colors[assetType] || 'bg-muted text-muted-foreground';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="text-home-title">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}
        </h1>
        <p className="text-muted-foreground">
          {format(new Date(), 'EEEE, MMMM d')} — Here's your trading game plan
        </p>
      </div>

      {/* Weekly Goal Progress */}
      <Card data-testid="card-weekly-goal">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Weekly Goal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress toward ${weeklyGoal}</span>
            <span className={weeklyPnL >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
              {weeklyPnL >= 0 ? '+' : ''}{weeklyPnL.toFixed(0)} / ${weeklyGoal}
            </span>
          </div>
          <Progress value={Math.max(goalProgress, 0)} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{closedThisWeek.length} trades closed</span>
            <span>{winRate.toFixed(0)}% win rate</span>
          </div>
        </CardContent>
      </Card>

      {/* Today's Top Picks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Today's Top Picks
          </h2>
          {todaysTopIdeas.length === 0 && (
            <Button 
              size="sm" 
              onClick={() => generateHybridIdeas.mutate()}
              disabled={generateHybridIdeas.isPending}
              data-testid="button-generate-ideas"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {generateHybridIdeas.isPending ? 'Generating...' : 'Smart Picks'}
            </Button>
          )}
        </div>

        {todaysTopIdeas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Clock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">No fresh ideas yet today</p>
              <p className="text-xs text-muted-foreground">
                Click "Smart Picks" or check back after market open
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {todaysTopIdeas.map((idea, index) => {
              const grade = getPerformanceGrade(idea.confidenceScore);
              return (
                <Link key={idea.id} href="/trade-desk">
                  <Card 
                    className="hover-elevate cursor-pointer transition-all"
                    data-testid={`card-top-idea-${index}`}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getDirectionIcon(idea.direction)}
                            <span className="font-semibold text-lg">{idea.symbol}</span>
                          </div>
                          <Badge className={getAssetBadge(idea.assetType)}>
                            {idea.assetType}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {grade.grade}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-right">
                            <div className="text-muted-foreground text-xs">Entry</div>
                            <div className="font-medium">${idea.entryPrice?.toFixed(2)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-muted-foreground text-xs">Target</div>
                            <div className="font-medium text-green-500">${idea.targetPrice?.toFixed(2)}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {todaysTopIdeas.length > 0 && (
          <Link href="/trade-desk">
            <Button variant="outline" className="w-full" data-testid="button-view-all-ideas">
              View All Ideas
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        )}
      </div>

      {/* Watch Out For - Stocks with multiple catalyst reasons */}
      <WatchSuggestions />

      {/* Quick Risk Reminder */}
      <Alert data-testid="alert-risk-reminder">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <span className="font-medium">Quick Reminder:</span> Max 10% of capital per trade. 
          Set stops at 50%. Scale out at 50% profit. Check your{' '}
          <Link href="/trading-rules" className="underline hover:text-primary">
            Trading Rules
          </Link>{' '}
          before entering.
        </AlertDescription>
      </Alert>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/trade-desk">
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-action-trade-desk">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-medium">Trade Desk</div>
                <div className="text-xs text-muted-foreground">Browse all trade ideas</div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/trading-rules">
          <Card className="hover-elevate cursor-pointer h-full" data-testid="card-action-rules">
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <CheckCircle2 className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="font-medium">Trading Rules</div>
                <div className="text-xs text-muted-foreground">Position sizing & checklist</div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
