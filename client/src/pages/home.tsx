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
  Activity,
  DollarSign,
  Percent
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
  const activeCount = tradeIdeas.filter(i => (i.outcomeStatus || '').toLowerCase() === 'open').length;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 via-primary to-blue-700 dark:from-blue-600 dark:via-blue-700 dark:to-indigo-900 p-6 sm:p-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30" />
        <div className="relative z-10">
          <p className="text-blue-100 text-sm font-medium tracking-wide uppercase mb-1">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4" data-testid="text-home-title">
            Good {greeting}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2" data-testid="badge-active-count">
              <Activity className="h-4 w-4 text-green-300" />
              <span className="text-white text-sm font-medium" data-testid="text-active-count">{activeCount} Active</span>
            </div>
            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2" data-testid="badge-fresh-today">
              <Zap className="h-4 w-4 text-yellow-300" />
              <span className="text-white text-sm font-medium" data-testid="text-fresh-today">{todaysTopIdeas.length} Fresh Today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Weekly P&L */}
        <Card className="relative overflow-hidden border-0 shadow-lg dark:shadow-none dark:border">
          <div className={`absolute top-0 left-0 w-1 h-full ${weeklyPnL >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Weekly P&L</p>
                <p className={`text-3xl font-bold font-mono tracking-tight ${weeklyPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-weekly-pnl">
                  {weeklyPnL >= 0 ? '+' : ''}${Math.abs(weeklyPnL).toFixed(0)}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${weeklyPnL >= 0 ? 'bg-green-100 dark:bg-green-500/20' : 'bg-red-100 dark:bg-red-500/20'}`}>
                <DollarSign className={`h-6 w-6 ${weeklyPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between gap-2 text-xs font-medium text-muted-foreground mb-2">
                <span>Goal: ${weeklyGoal}</span>
                <span>{Math.max(0, goalProgress).toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ${weeklyPnL >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.max(0, goalProgress)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card className="relative overflow-hidden border-0 shadow-lg dark:shadow-none dark:border">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Win Rate</p>
                <p className="text-3xl font-bold font-mono tracking-tight" data-testid="text-win-rate">
                  {winRate.toFixed(0)}%
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                <Percent className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              <span className="font-semibold text-foreground">{closedThisWeek.length}</span> trades closed this week
            </p>
          </CardContent>
        </Card>

        {/* Active Ideas */}
        <Card className="relative overflow-hidden border-0 shadow-lg dark:shadow-none dark:border">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Active Ideas</p>
                <p className="text-3xl font-bold font-mono tracking-tight" data-testid="text-active-ideas">
                  {activeCount}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              <span className="font-semibold text-foreground">{todaysTopIdeas.length}</span> fresh opportunities today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Top Picks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Today's Top Picks</h2>
            <p className="text-sm text-muted-foreground">Highest confidence opportunities</p>
          </div>
          {todaysTopIdeas.length === 0 && (
            <Button 
              onClick={() => generateHybridIdeas.mutate()}
              disabled={generateHybridIdeas.isPending}
              data-testid="button-generate-ideas"
            >
              <Sparkles className="h-4 w-4" />
              {generateHybridIdeas.isPending ? 'Generating...' : 'Generate Ideas'}
            </Button>
          )}
        </div>

        {todaysTopIdeas.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-semibold text-lg mb-1">No fresh ideas yet</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Generate new trade ideas or check back after market opens for the latest opportunities
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {todaysTopIdeas.map((idea, index) => {
              const grade = getPerformanceGrade(idea.confidenceScore);
              const isLong = idea.direction === 'long';
              
              return (
                <Link key={idea.id} href="/trade-desk">
                  <Card 
                    className="group cursor-pointer transition-all duration-200 hover:shadow-lg dark:hover:shadow-none hover:-translate-y-0.5 border-0 shadow-md dark:shadow-none dark:border"
                    data-testid={`card-top-idea-${index}`}
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-center gap-4">
                        <div className={`h-14 w-14 rounded-xl flex items-center justify-center shrink-0 ${
                          isLong 
                            ? 'bg-gradient-to-br from-green-400 to-green-600' 
                            : 'bg-gradient-to-br from-red-400 to-red-600'
                        }`}>
                          {isLong ? (
                            <TrendingUp className="h-7 w-7 text-white" />
                          ) : (
                            <TrendingDown className="h-7 w-7 text-white" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-xl tracking-tight">{idea.symbol}</span>
                            <Badge variant="secondary" className="text-xs font-medium">
                              {idea.assetType}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs font-bold ${
                                grade.grade === 'A+' || grade.grade === 'A' 
                                  ? 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400' 
                                  : ''
                              }`}
                            >
                              {grade.grade}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {idea.catalyst || 'Technical setup identified'}
                          </p>
                        </div>

                        <div className="hidden sm:flex items-center gap-6 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Entry</p>
                            <p className="font-mono font-bold text-lg">${idea.entryPrice?.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Target</p>
                            <p className="font-mono font-bold text-lg text-green-600 dark:text-green-400">${idea.targetPrice?.toFixed(2)}</p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            
            <Link href="/trade-desk">
              <Button variant="ghost" className="w-full mt-1" data-testid="button-view-all-ideas">
                View All Ideas
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Watch Suggestions */}
        <WatchSuggestions />

        {/* Quick Actions + Risk */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Link href="/trade-desk">
              <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg dark:hover:shadow-none hover:-translate-y-0.5 border-0 shadow-md dark:shadow-none dark:border h-full" data-testid="card-action-trade-desk">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-bold">Trade Desk</p>
                      <p className="text-sm text-muted-foreground">Browse all opportunities</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/trading-rules">
              <Card className="group cursor-pointer transition-all duration-200 hover:shadow-lg dark:hover:shadow-none hover:-translate-y-0.5 border-0 shadow-md dark:shadow-none dark:border h-full" data-testid="card-action-rules">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-bold">Trading Rules</p>
                      <p className="text-sm text-muted-foreground">Position sizing & checklist</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Risk Reminder */}
          <Card className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800/50">
            <CardContent className="p-4 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">Risk Reminder</p>
                <p className="text-sm text-amber-800 dark:text-amber-300/80">
                  Max 10% capital per trade. Stops: 50% for options, 3.5% for stocks.{' '}
                  <Link href="/trading-rules" className="font-medium underline hover:no-underline">
                    Review rules
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
