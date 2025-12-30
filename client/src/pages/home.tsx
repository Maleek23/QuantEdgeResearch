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
import { isRealLoss } from "@shared/constants";

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
      toast({ title: "Fresh research briefs generated!", description: "Check out today's new analysis" });
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

  // 🔧 DATA INTEGRITY: Use consistent "decided" logic (wins + real losses only, no breakeven/expired)
  const winsThisWeek = thisWeekIdeas.filter(i => 
    (i.outcomeStatus || '').trim().toLowerCase() === 'hit_target'
  ).length;
  const lossesThisWeek = thisWeekIdeas.filter(i => isRealLoss(i)).length;
  const decidedThisWeek = winsThisWeek + lossesThisWeek;
  const winRate = decidedThisWeek > 0 ? (winsThisWeek / decidedThisWeek) * 100 : 0;

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
      {/* Hero Header - Glassmorphism */}
      <div className="relative overflow-hidden rounded-xl glass-card p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-cyan-400/10" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase mb-1">
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mb-3" data-testid="text-home-title">
              Good {greeting}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 glass-success rounded-lg px-3 py-1.5" data-testid="badge-active-count">
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium" data-testid="text-active-count">{activeCount} Active</span>
              </div>
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5" data-testid="badge-fresh-today">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium" data-testid="text-fresh-today">{todaysTopIdeas.length} Fresh Today</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="glass" 
              onClick={() => generateHybridIdeas.mutate()}
              disabled={generateHybridIdeas.isPending}
              data-testid="button-generate-ideas"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {generateHybridIdeas.isPending ? 'Generating...' : 'Generate Briefs'}
            </Button>
            <Link href="/trading-rules">
              <Button variant="glass-secondary" data-testid="button-review-rules">
                <BookOpen className="h-4 w-4 mr-2" />
                Rules
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid - Glassmorphism */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Weekly P&L */}
        <div className={`glass-card rounded-xl p-5 ${weeklyPnL >= 0 ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-red-500'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Weekly P&L</p>
              <p className={`text-3xl font-bold font-mono tracking-tight ${weeklyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-weekly-pnl">
                {weeklyPnL >= 0 ? '+' : ''}${Math.abs(weeklyPnL).toFixed(0)}
              </p>
            </div>
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${weeklyPnL >= 0 ? 'glass-success' : 'glass-danger'}`}>
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between gap-2 text-xs font-medium text-muted-foreground mb-2">
              <span>Goal: ${weeklyGoal}</span>
              <span>{Math.max(0, goalProgress).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${weeklyPnL >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, goalProgress)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="glass-card rounded-xl p-5 border-l-2 border-l-cyan-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Win Rate</p>
              <p className="text-3xl font-bold font-mono tracking-tight text-cyan-400" data-testid="text-win-rate">
                {winRate.toFixed(0)}%
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg glass flex items-center justify-center">
              <Percent className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <span className="font-semibold text-foreground">{decidedThisWeek}</span> decided this week
          </p>
        </div>

        {/* Active Ideas */}
        <div className="glass-card rounded-xl p-5 border-l-2 border-l-amber-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Active Ideas</p>
              <p className="text-3xl font-bold font-mono tracking-tight text-amber-400" data-testid="text-active-ideas">
                {activeCount}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            <span className="font-semibold text-foreground">{todaysTopIdeas.length}</span> fresh opportunities today
          </p>
        </div>
      </div>

      {/* Today's Top Picks - Glassmorphism */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Top Signals Today</h2>
            <p className="text-sm text-muted-foreground">Highest confidence opportunities</p>
          </div>
          <Link href="/trade-desk">
            <Button variant="ghost" size="sm" data-testid="button-view-all-signals">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        {todaysTopIdeas.length === 0 ? (
          <div className="glass-card rounded-xl border-dashed border-2 border-white/10">
            <div className="py-12 text-center">
              <div className="h-14 w-14 rounded-xl glass mx-auto mb-4 flex items-center justify-center">
                <Clock className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-semibold text-lg mb-1">No fresh signals yet</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                Generate new research briefs or check back after market opens
              </p>
              <Button 
                variant="glass"
                onClick={() => generateHybridIdeas.mutate()}
                disabled={generateHybridIdeas.isPending}
                data-testid="button-generate-ideas-empty"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {generateHybridIdeas.isPending ? 'Generating...' : 'Generate Briefs'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="glass-card rounded-xl divide-y divide-white/10">
              {todaysTopIdeas.map((idea, index) => {
                const grade = getPerformanceGrade(idea.confidenceScore);
                const isLong = idea.direction === 'long';
                
                return (
                  <Link key={idea.id} href="/trade-desk">
                    <div 
                      className="group cursor-pointer p-4 hover:bg-white/5 transition-all first:rounded-t-xl last:rounded-b-xl"
                      data-testid={`card-top-idea-${index}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${
                          isLong 
                            ? 'glass-success' 
                            : 'glass-danger'
                        }`}>
                          {isLong ? (
                            <TrendingUp className="h-6 w-6" />
                          ) : (
                            <TrendingDown className="h-6 w-6" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-lg tracking-tight">{idea.symbol}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-muted-foreground">
                              {idea.assetType}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              grade.grade === 'A+' || grade.grade === 'A' 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-white/10 text-muted-foreground'
                            }`}>
                              {grade.grade}
                            </span>
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
                            <p className="font-mono font-bold text-lg text-green-400">${idea.targetPrice?.toFixed(2)}</p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <Link href="/trade-desk" className="block mt-3">
              <Button variant="glass-secondary" className="w-full" data-testid="button-view-all-ideas">
                View All Ideas
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </>
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
              <div className="group cursor-pointer glass-card rounded-xl p-4 flex items-center justify-between gap-4 hover:translate-y-[-2px] transition-all" data-testid="card-action-trade-desk">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl glass flex items-center justify-center">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold">Research Desk</p>
                    <p className="text-sm text-muted-foreground">Browse all research briefs</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-cyan-400 group-hover:translate-x-1 transition-all shrink-0" />
              </div>
            </Link>
            
            <Link href="/trading-rules">
              <div className="group cursor-pointer glass-card rounded-xl p-4 flex items-center justify-between gap-4 hover:translate-y-[-2px] transition-all" data-testid="card-action-rules">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <BookOpen className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-bold">Trading Rules</p>
                    <p className="text-sm text-muted-foreground">Position sizing & checklist</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-1 transition-all shrink-0" />
              </div>
            </Link>
          </div>

          {/* Risk Reminder - Glass Warning */}
          <div className="glass-card rounded-xl p-4 flex items-start gap-4 border-l-2 border-l-amber-500">
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-amber-400 mb-1">Risk Reminder</p>
              <p className="text-sm text-muted-foreground">
                Max 10% capital per trade. Stops: 50% for options, 3.5% for stocks.{' '}
                <Link href="/trading-rules" className="font-medium text-cyan-400 hover:underline">
                  Review rules
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
