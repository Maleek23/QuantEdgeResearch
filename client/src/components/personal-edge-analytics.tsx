import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Sparkles,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  Target
} from 'lucide-react';
import { cn, safeToFixed } from '@/lib/utils';

interface ResearchStats {
  total: number;
  traded: number;
  watched: number;
  ignored: number;
  winRate: number;
  avgReturn: number;
  topPatterns: { pattern: string; winRate: number; count: number }[];
}

interface PersonalEdgeAnalyticsProps {
  year?: number;
}

const GRADE_PERFORMANCE = [
  { grade: 'A+', avgWinRate: 85, avgReturn: 18 },
  { grade: 'A', avgWinRate: 72, avgReturn: 12 },
  { grade: 'A-', avgWinRate: 65, avgReturn: 9 },
  { grade: 'B+', avgWinRate: 58, avgReturn: 5 },
  { grade: 'B', avgWinRate: 52, avgReturn: 3 },
  { grade: 'C', avgWinRate: 41, avgReturn: -2 },
];

export default function PersonalEdgeAnalytics({ year = new Date().getFullYear() }: PersonalEdgeAnalyticsProps) {
  const { data: stats, isLoading } = useQuery<ResearchStats>({
    queryKey: ['/api/research-history/stats', { year }],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50" data-testid="personal-edge-analytics">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          Your Personal Edge ({year})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats && stats.topPatterns.length > 0 ? (
          <div>
            <span className="text-xs text-slate-500 mb-2 block">Your Highest Edge Signals</span>
            <div className="space-y-2">
              {stats.topPatterns.map((pattern, i) => (
                <div 
                  key={i}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md border",
                    pattern.winRate >= 60 ? 'bg-green-500/10 border-green-500/30' :
                    pattern.winRate >= 50 ? 'bg-amber-500/10 border-amber-500/30' :
                    'bg-red-500/10 border-red-500/30'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {pattern.winRate >= 60 ? (
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    ) : pattern.winRate >= 50 ? (
                      <BarChart3 className="h-4 w-4 text-amber-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium uppercase">
                      {pattern.pattern.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{pattern.count} trades</span>
                    <span className={cn(
                      "font-mono font-bold",
                      pattern.winRate >= 60 ? 'text-green-400' :
                      pattern.winRate >= 50 ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {safeToFixed(pattern.winRate, 0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            {stats.topPatterns.some(p => p.winRate < 50) && (
              <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-md">
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Consider avoiding patterns with &lt;50% win rate</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-slate-400 text-sm">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Trade more signals to discover your personal edge patterns</p>
          </div>
        )}
        
        <div className="pt-3 border-t border-slate-700/50">
          <span className="text-xs text-slate-500 mb-2 block">Grade-Based Performance Guide</span>
          <div className="space-y-1.5">
            {GRADE_PERFORMANCE.map((g) => (
              <div key={g.grade} className="flex items-center gap-2">
                <span className={cn(
                  "font-mono text-sm w-6",
                  g.avgWinRate >= 70 ? 'text-green-400' :
                  g.avgWinRate >= 50 ? 'text-amber-400' : 'text-red-400'
                )}>{g.grade}</span>
                <div className="flex-1">
                  <Progress 
                    value={g.avgWinRate} 
                    className={cn(
                      "h-2",
                      g.avgWinRate >= 70 ? '[&>div]:bg-green-500' :
                      g.avgWinRate >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
                    )}
                  />
                </div>
                <span className="font-mono text-xs text-slate-400 w-10 text-right">{g.avgWinRate}%</span>
                <span className={cn(
                  "font-mono text-xs w-12 text-right",
                  g.avgReturn >= 0 ? 'text-green-400' : 'text-red-400'
                )}>
                  {g.avgReturn >= 0 ? '+' : ''}{g.avgReturn}%
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2 italic">
            Tip: Focus on A+/A setups for highest win rates
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
