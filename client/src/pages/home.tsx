import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Activity,
  BarChart3
} from "lucide-react";
import { format, parseISO, isSameDay, subHours } from "date-fns";
import { cn } from "@/lib/utils";
import { getPerformanceGrade } from "@/lib/performance-grade";
import { isRealLoss } from "@shared/constants";
import { RiskDisclosure } from "@/components/risk-disclosure";

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
    .slice(0, 4);

  const thisWeekIdeas = tradeIdeas.filter(idea => {
    const ideaDate = parseISO(idea.timestamp);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return ideaDate >= weekStart;
  });

  const winsThisWeek = thisWeekIdeas.filter(i => 
    (i.outcomeStatus || '').trim().toLowerCase() === 'hit_target'
  ).length;
  const lossesThisWeek = thisWeekIdeas.filter(i => isRealLoss(i)).length;
  const decidedThisWeek = winsThisWeek + lossesThisWeek;
  const winRate = decidedThisWeek > 0 ? (winsThisWeek / decidedThisWeek) * 100 : 0;
  const activeCount = tradeIdeas.filter(i => (i.outcomeStatus || '').toLowerCase() === 'open').length;

  const getEngineColor = (source: string) => {
    const s = source?.toLowerCase();
    if (s?.includes('flow')) return 'text-cyan-500';
    if (s?.includes('ai')) return 'text-purple-500';
    if (s?.includes('quant')) return 'text-blue-500';
    if (s?.includes('hybrid')) return 'text-orange-500';
    return 'text-muted-foreground';
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <RiskDisclosure variant="banner" />
      <div className="p-4 sm:p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-home-title">
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => generateHybridIdeas.mutate()}
            disabled={generateHybridIdeas.isPending}
            className="bg-cyan-500 text-slate-950"
            data-testid="button-generate-ideas"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {generateHybridIdeas.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Active Positions */}
        <Card className="p-5 border-border/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold font-mono tabular-nums" data-testid="text-active-count">
            {activeCount}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {todaysTopIdeas.length} fresh today
          </p>
        </Card>

        {/* Win Rate */}
        <Card className="p-5 border-border/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</p>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className={cn(
            "text-3xl font-bold font-mono tabular-nums",
            winRate >= 60 ? "text-green-500" : winRate >= 50 ? "text-amber-500" : "text-red-500"
          )} data-testid="text-win-rate">
            {decidedThisWeek > 0 ? `${winRate.toFixed(0)}%` : '—'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {decidedThisWeek} decided this week
          </p>
        </Card>

        {/* Record */}
        <Card className="p-5 border-border/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Record</p>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums text-green-500">{winsThisWeek}W</span>
            <span className="text-xl font-mono text-muted-foreground">/</span>
            <span className="text-3xl font-bold font-mono tabular-nums text-red-500">{lossesThisWeek}L</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">This week</p>
        </Card>
      </div>

      {/* Today's Top Signals */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Top Signals</h2>
          <Link href="/trade-desk">
            <Button variant="ghost" size="sm" data-testid="button-view-all-signals">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        {todaysTopIdeas.length === 0 ? (
          <Card className="border-dashed border-2 border-border/50">
            <div className="py-12 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">No fresh signals</p>
              <p className="text-sm text-muted-foreground mb-4">
                Generate new research or wait for market open
              </p>
              <Button 
                onClick={() => generateHybridIdeas.mutate()}
                disabled={generateHybridIdeas.isPending}
                variant="outline"
                data-testid="button-generate-ideas-empty"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {todaysTopIdeas.map((idea, index) => {
              const grade = getPerformanceGrade(idea.confidenceScore);
              const isLong = idea.direction === 'long';
              
              return (
                <Link key={idea.id} href="/trade-desk">
                  <Card 
                    className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-border/50"
                    data-testid={`card-top-idea-${index}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold font-mono">{idea.symbol}</span>
                        <span className={cn(
                          "text-xs font-semibold uppercase",
                          getEngineColor(idea.source || '')
                        )}>
                          {idea.source || 'hybrid'}
                        </span>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1 text-sm font-medium",
                        isLong ? "text-green-500" : "text-red-500"
                      )}>
                        {isLong ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {isLong ? 'Long' : 'Short'}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-muted-foreground">Entry </span>
                        <span className="font-mono font-medium">${idea.entryPrice?.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target </span>
                        <span className="font-mono font-medium text-green-500">${idea.targetPrice?.toFixed(2)}</span>
                      </div>
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded font-medium",
                        (grade.grade === 'A+' || grade.grade === 'A')
                          ? 'bg-green-500/10 text-green-500' 
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {grade.grade}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <WatchSuggestions />

        <div className="space-y-4">
          {/* Quick Actions */}
          <Card className="p-4 border-border/50">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link href="/trade-desk" className="block">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid="card-action-trade-desk">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">Research Desk</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
              <Link href="/performance" className="block">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid="card-action-performance">
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">Performance</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
              <Link href="/chart-analysis" className="block">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors" data-testid="card-action-chart">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">Chart Analysis</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </div>
          </Card>

          {/* Risk Notice */}
          <Card className="p-4 border-l-2 border-l-amber-500 border-border/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm mb-1">Risk Reminder</p>
                <p className="text-sm text-muted-foreground">
                  Max 10% capital per trade. Stops: 50% for options, 3.5% for stocks.{' '}
                  <Link href="/trading-rules" className="text-cyan-500 hover:underline">
                    View rules
                  </Link>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
}
