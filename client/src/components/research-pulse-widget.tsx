import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3,
  Target,
  Eye,
  Ban,
  TrendingUp,
  TrendingDown,
  FileText,
  Download
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

interface ResearchPulseWidgetProps {
  year?: number;
  compact?: boolean;
  onViewReport?: () => void;
  onExport?: () => void;
}

function StatItem({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  color = 'text-slate-400'
}: { 
  icon: any; 
  label: string; 
  value: string | number; 
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", color)} />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-slate-500 block truncate">{label}</span>
        <span className="font-mono text-sm">{value}</span>
        {subValue && <span className="text-xs text-slate-500 ml-1">{subValue}</span>}
      </div>
    </div>
  );
}

export default function ResearchPulseWidget({
  year = new Date().getFullYear(),
  compact = false,
  onViewReport,
  onExport,
}: ResearchPulseWidgetProps) {
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

  if (!stats || stats.total === 0) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50" data-testid="research-pulse-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            {year} Research Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400 text-center py-4">
            No research activity yet. Start tracking your signal decisions to build your personal edge analytics.
          </p>
        </CardContent>
      </Card>
    );
  }

  const tradedPercent = stats.total > 0 ? (stats.traded / stats.total) * 100 : 0;
  const watchedPercent = stats.total > 0 ? (stats.watched / stats.total) * 100 : 0;
  const ignoredPercent = stats.total > 0 ? (stats.ignored / stats.total) * 100 : 0;

  const qualityScore = Math.min(100, Math.round(
    (stats.winRate * 0.5) + 
    (tradedPercent < 10 ? (10 - tradedPercent) * 2 : 0) + 
    (stats.avgReturn > 0 ? Math.min(30, stats.avgReturn * 2) : 0) +
    20
  ));

  if (compact) {
    return (
      <Card className="p-3 bg-slate-800/50 backdrop-blur-sm border-slate-700/50" data-testid="research-pulse-compact">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400">{year} Research</span>
          <Badge variant="outline" className={cn(
            "text-xs",
            qualityScore >= 70 ? 'border-green-500/50 text-green-400' :
            qualityScore >= 50 ? 'border-amber-500/50 text-amber-400' :
            'border-red-500/50 text-red-400'
          )}>
            {qualityScore}/100
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3 text-green-400" />
            {stats.traded}
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-cyan-400" />
            {stats.watched}
          </span>
          <span className="font-mono text-green-400">{safeToFixed(stats.winRate, 0)}% WR</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700/50" data-testid="research-pulse-widget">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            {year} Research Dashboard
          </span>
          <Badge variant="outline" className={cn(
            qualityScore >= 70 ? 'border-green-500/50 text-green-400' :
            qualityScore >= 50 ? 'border-amber-500/50 text-amber-400' :
            'border-red-500/50 text-red-400'
          )}>
            Quality: {qualityScore}/100
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center mb-4">
          <span className="text-3xl font-mono font-bold">{stats.total.toLocaleString()}</span>
          <span className="text-sm text-slate-400 block">Signals Reviewed</span>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-green-500/10 rounded-md border border-green-500/30">
            <Target className="h-4 w-4 text-green-400 mx-auto mb-1" />
            <span className="font-mono text-lg block">{stats.traded}</span>
            <span className="text-xs text-slate-400">Traded</span>
            <span className="text-xs text-green-400 block">({safeToFixed(tradedPercent, 1)}%)</span>
          </div>
          <div className="text-center p-2 bg-cyan-500/10 rounded-md border border-cyan-500/30">
            <Eye className="h-4 w-4 text-cyan-400 mx-auto mb-1" />
            <span className="font-mono text-lg block">{stats.watched}</span>
            <span className="text-xs text-slate-400">Watched</span>
            <span className="text-xs text-cyan-400 block">({safeToFixed(watchedPercent, 1)}%)</span>
          </div>
          <div className="text-center p-2 bg-slate-500/10 rounded-md border border-slate-500/30">
            <Ban className="h-4 w-4 text-slate-400 mx-auto mb-1" />
            <span className="font-mono text-lg block">{stats.ignored}</span>
            <span className="text-xs text-slate-400">Ignored</span>
            <span className="text-xs text-slate-400 block">({safeToFixed(ignoredPercent, 1)}%)</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              stats.winRate >= 50 ? 'bg-green-500/20' : 'bg-red-500/20'
            )}>
              {stats.winRate >= 50 ? (
                <TrendingUp className="h-4 w-4 text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Win Rate</span>
              <span className={cn(
                "font-mono text-lg",
                stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'
              )}>{safeToFixed(stats.winRate, 0)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              stats.avgReturn >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
            )}>
              {stats.avgReturn >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Avg Return</span>
              <span className={cn(
                "font-mono text-lg",
                stats.avgReturn >= 0 ? 'text-green-400' : 'text-red-400'
              )}>{stats.avgReturn >= 0 ? '+' : ''}{safeToFixed(stats.avgReturn, 1)}%</span>
            </div>
          </div>
        </div>
        
        {stats.topPatterns.length > 0 && (
          <div className="pt-2 border-t border-slate-700/50">
            <span className="text-xs text-slate-500 mb-2 block">Top Winning Patterns</span>
            <div className="space-y-2">
              {stats.topPatterns.slice(0, 3).map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {p.pattern.replace(/_/g, ' ')}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{p.count} trades</span>
                    <span className={cn(
                      "font-mono text-sm",
                      p.winRate >= 60 ? 'text-green-400' : 
                      p.winRate >= 50 ? 'text-amber-400' : 'text-red-400'
                    )}>{safeToFixed(p.winRate, 0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {(onViewReport || onExport) && (
          <div className="flex gap-2 pt-2">
            {onViewReport && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onViewReport} data-testid="btn-view-report">
                <FileText className="h-3 w-3 mr-1" />
                View Report
              </Button>
            )}
            {onExport && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onExport} data-testid="btn-export">
                <Download className="h-3 w-3 mr-1" />
                Export CSV
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
