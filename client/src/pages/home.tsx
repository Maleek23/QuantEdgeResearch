import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Clock,
  BarChart3,
  BookOpen,
  Zap,
  ChevronRight
} from "lucide-react";
import { format, parseISO, isSameDay, subHours } from "date-fns";
import { getPerformanceGrade } from "@/lib/performance-grade";

export default function HomePage() {
  const { toast } = useToast();

  const { data: tradeIdeas = [], isLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000,
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

  const todaysTopIdeas = tradeIdeas
    .filter(idea => {
      const ideaDate = parseISO(idea.timestamp);
      const isToday = isSameDay(ideaDate, new Date());
      const isOpen = (idea.outcomeStatus || '').trim().toLowerCase() === 'open';
      const isFresh = ideaDate >= subHours(new Date(), 12);
      return (isToday || isFresh) && isOpen;
    })
    .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
    .slice(0, 3);

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

  const weeklyGoal = 200;
  const weeklyPnL = thisWeekIdeas.reduce((sum, i) => sum + (i.realizedPnL || 0), 0);
  const goalProgress = Math.min((weeklyPnL / weeklyGoal) * 100, 100);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header Section */}
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground font-mono tracking-wide uppercase">
          {format(new Date(), 'EEEE, MMM d')}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-home-title">
          Good {greeting}
        </h1>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="relative overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Weekly P&L</p>
                <p className={`text-2xl font-semibold font-mono ${weeklyPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {weeklyPnL >= 0 ? '+' : ''}{weeklyPnL.toFixed(0)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                <Target className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground mb-1">
                <span>Goal: ${weeklyGoal}</span>
                <span>{Math.max(0, goalProgress).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(0, goalProgress)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Win Rate</p>
                <p className="text-2xl font-semibold font-mono">
                  {winRate.toFixed(0)}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {closedThisWeek.length} trades closed this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Active Ideas</p>
                <p className="text-2xl font-semibold font-mono">
                  {tradeIdeas.filter(i => (i.outcomeStatus || '').toLowerCase() === 'open').length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                <Zap className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {todaysTopIdeas.length} fresh today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Top Picks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Today's Top Picks</h2>
            <p className="text-sm text-muted-foreground">Highest confidence opportunities</p>
          </div>
          {todaysTopIdeas.length === 0 && (
            <Button 
              variant="secondary"
              size="sm"
              onClick={() => generateHybridIdeas.mutate()}
              disabled={generateHybridIdeas.isPending}
              data-testid="button-generate-ideas"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {generateHybridIdeas.isPending ? 'Generating...' : 'Generate'}
            </Button>
          )}
        </div>

        {todaysTopIdeas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Clock className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium mb-1">No fresh ideas yet</p>
              <p className="text-sm text-muted-foreground">
                Generate new ideas or check back after market open
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {todaysTopIdeas.map((idea, index) => {
              const grade = getPerformanceGrade(idea.confidenceScore);
              const isLong = idea.direction === 'long';
              
              return (
                <Link key={idea.id} href="/trade-desk">
                  <Card 
                    className="hover-elevate cursor-pointer group"
                    data-testid={`card-top-idea-${index}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Direction indicator */}
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${
                          isLong ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}>
                          {isLong ? (
                            <TrendingUp className="h-6 w-6 text-green-500" />
                          ) : (
                            <TrendingDown className="h-6 w-6 text-red-500" />
                          )}
                        </div>
                        
                        {/* Symbol and info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-lg">{idea.symbol}</span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {idea.assetType}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs shrink-0 ${
                                grade.grade === 'A+' || grade.grade === 'A' 
                                  ? 'border-green-500/30 text-green-500' 
                                  : ''
                              }`}
                            >
                              {grade.grade}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {idea.catalyst || 'Technical setup'}
                          </p>
                        </div>

                        {/* Price info */}
                        <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Entry</p>
                            <p className="font-mono font-medium">${idea.entryPrice?.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Target</p>
                            <p className="font-mono font-medium text-green-500">${idea.targetPrice?.toFixed(2)}</p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            
            <Link href="/trade-desk">
              <Button variant="ghost" className="w-full" data-testid="button-view-all-ideas">
                View All Ideas
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Watch Suggestions */}
      <WatchSuggestions />

      {/* Risk Reminder */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium">Risk Reminder:</span>{' '}
            <span className="text-muted-foreground">
              Max 10% capital per trade. Set stops at 50% for options, 3.5% for stocks. 
              Check your{' '}
              <Link href="/trading-rules" className="text-primary hover:underline">
                trading rules
              </Link>{' '}
              before entering.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Nav */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/trade-desk">
          <Card className="hover-elevate cursor-pointer group" data-testid="card-action-trade-desk">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Trade Desk</p>
                  <p className="text-xs text-muted-foreground">Browse all opportunities</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/trading-rules">
          <Card className="hover-elevate cursor-pointer group" data-testid="card-action-rules">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium">Trading Rules</p>
                  <p className="text-xs text-muted-foreground">Position sizing & checklist</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
