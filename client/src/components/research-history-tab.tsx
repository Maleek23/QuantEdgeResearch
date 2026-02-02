import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search,
  Filter,
  Calendar,
  Target,
  Eye,
  Ban,
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn, safeToFixed, safeNumber } from '@/lib/utils';
import { format } from 'date-fns';

interface ResearchHistoryRecord {
  id: string;
  symbol: string;
  signalId: string | null;
  actionTaken: 'traded' | 'watched' | 'ignored' | 'saved';
  signalGrade: string | null;
  signalConfidence: number | null;
  signalDirection: string | null;
  signalEngine: string | null;
  signalPrice: number | null;
  outcome: string | null;
  outcomeReturn: number | null;
  lessonLearned: string | null;
  viewedAt: string;
  decidedAt: string | null;
}

interface ResearchHistoryTabProps {
  year?: number;
}

function getActionIcon(action: string) {
  switch (action) {
    case 'traded': return <Target className="h-4 w-4 text-green-400" />;
    case 'watched': return <Eye className="h-4 w-4 text-cyan-400" />;
    case 'ignored': return <Ban className="h-4 w-4 text-slate-400" />;
    default: return <FileText className="h-4 w-4 text-purple-400" />;
  }
}

function getOutcomeColor(outcome: string | null): string {
  switch (outcome) {
    case 'hit_target': return 'text-green-400';
    case 'hit_stop': return 'text-red-400';
    case 'breakeven': return 'text-amber-400';
    case 'pending': return 'text-cyan-400';
    default: return 'text-slate-400';
  }
}

export default function ResearchHistoryTab({ year = new Date().getFullYear() }: ResearchHistoryTabProps) {
  const [filters, setFilters] = useState({
    symbol: '',
    action: 'all',
    outcome: 'all',
    grade: 'all',
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: history, isLoading } = useQuery<ResearchHistoryRecord[]>({
    queryKey: ['/api/research-history', { year, ...filters, limit: 100 }],
    staleTime: 30 * 1000,
  });

  const filteredHistory = history?.filter(h => {
    if (filters.symbol && !h.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) return false;
    if (filters.action !== 'all' && h.actionTaken !== filters.action) return false;
    if (filters.outcome !== 'all' && h.outcome !== filters.outcome) return false;
    if (filters.grade !== 'all' && !h.signalGrade?.startsWith(filters.grade)) return false;
    return true;
  }) || [];

  const paginatedHistory = filteredHistory.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredHistory.length / pageSize);

  const stats = {
    total: filteredHistory.length,
    traded: filteredHistory.filter(h => h.actionTaken === 'traded').length,
    watched: filteredHistory.filter(h => h.actionTaken === 'watched').length,
    ignored: filteredHistory.filter(h => h.actionTaken === 'ignored').length,
    wins: filteredHistory.filter(h => h.outcome === 'hit_target').length,
    losses: filteredHistory.filter(h => h.outcome === 'hit_stop').length,
  };

  return (
    <div className="space-y-4" data-testid="research-history-tab">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-cyan-400" />
          {year} Research History
        </h2>
        <Button variant="outline" size="sm" data-testid="btn-export-history">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>
      
      <Card className="p-4 bg-slate-800/50 backdrop-blur-sm border-slate-700/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search symbol..."
              value={filters.symbol}
              onChange={(e) => setFilters({ ...filters, symbol: e.target.value })}
              className="pl-9 bg-slate-900/50 border-slate-700"
              data-testid="input-search-symbol"
            />
          </div>
          
          <Select value={filters.action} onValueChange={(v) => setFilters({ ...filters, action: v })}>
            <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700" data-testid="select-action">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="traded">Traded</SelectItem>
              <SelectItem value="watched">Watched</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filters.outcome} onValueChange={(v) => setFilters({ ...filters, outcome: v })}>
            <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-700" data-testid="select-outcome">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outcomes</SelectItem>
              <SelectItem value="hit_target">Wins</SelectItem>
              <SelectItem value="hit_stop">Losses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filters.grade} onValueChange={(v) => setFilters({ ...filters, grade: v })}>
            <SelectTrigger className="w-[120px] bg-slate-900/50 border-slate-700" data-testid="select-grade">
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              <SelectItem value="A+">A+</SelectItem>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
              <SelectItem value="C">C</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-700/50 text-sm">
          <span className="text-slate-400">
            Showing <span className="font-mono text-white">{filteredHistory.length}</span> records
          </span>
          <span className="flex items-center gap-1 text-green-400">
            <Target className="h-3 w-3" /> {stats.traded}
          </span>
          <span className="flex items-center gap-1 text-cyan-400">
            <Eye className="h-3 w-3" /> {stats.watched}
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Ban className="h-3 w-3" /> {stats.ignored}
          </span>
          <span className="ml-auto text-green-400">Wins: {stats.wins}</span>
          <span className="text-red-400">Losses: {stats.losses}</span>
          {(stats.wins + stats.losses) > 0 && (
            <span className="font-mono">
              WR: {safeToFixed((stats.wins / (stats.wins + stats.losses)) * 100, 0)}%
            </span>
          )}
        </div>
      </Card>
      
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : paginatedHistory.length === 0 ? (
        <Card className="p-8 bg-slate-800/50 backdrop-blur-sm border-slate-700/50 text-center">
          <FileText className="h-12 w-12 mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400">No research history found</p>
          <p className="text-sm text-slate-500 mt-1">Start tracking your signal decisions to build your research database</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {paginatedHistory.map((record) => (
            <Card 
              key={record.id}
              className="p-3 bg-slate-800/50 backdrop-blur-sm border-slate-700/50 hover-elevate"
              data-testid={`history-record-${record.id}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {getActionIcon(record.actionTaken)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{record.symbol}</span>
                      {record.signalGrade && (
                        <Badge variant="outline" className="text-xs">
                          {record.signalGrade}
                        </Badge>
                      )}
                      {record.signalEngine && (
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          record.signalEngine === 'AI' ? 'border-purple-500/50 text-purple-400' :
                          record.signalEngine === 'QUANT' ? 'border-cyan-500/50 text-cyan-400' :
                          'border-amber-500/50 text-amber-400'
                        )}>
                          {record.signalEngine}
                        </Badge>
                      )}
                      {record.signalDirection && (
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          record.signalDirection.toLowerCase() === 'long' 
                            ? 'border-green-500/50 text-green-400' 
                            : 'border-red-500/50 text-red-400'
                        )}>
                          {record.signalDirection.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {record.viewedAt && format(new Date(record.viewedAt), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {record.signalConfidence && (
                    <span className="font-mono text-sm text-slate-400">
                      {record.signalConfidence}%
                    </span>
                  )}
                  {record.signalPrice && (
                    <span className="font-mono text-sm text-slate-400">
                      ${safeToFixed(record.signalPrice, 2)}
                    </span>
                  )}
                  <Badge variant="outline" className={cn(
                    "capitalize",
                    record.actionTaken === 'traded' ? 'border-green-500/50 text-green-400' :
                    record.actionTaken === 'watched' ? 'border-cyan-500/50 text-cyan-400' :
                    'border-slate-500/50 text-slate-400'
                  )}>
                    {record.actionTaken}
                  </Badge>
                  {record.outcome && (
                    <div className="flex items-center gap-1">
                      {record.outcome === 'hit_target' ? (
                        <TrendingUp className="h-4 w-4 text-green-400" />
                      ) : record.outcome === 'hit_stop' ? (
                        <TrendingDown className="h-4 w-4 text-red-400" />
                      ) : null}
                      <span className={cn("capitalize text-sm", getOutcomeColor(record.outcome))}>
                        {record.outcome.replace('_', ' ')}
                      </span>
                      {record.outcomeReturn != null && (
                        <span className={cn(
                          "font-mono text-sm ml-1",
                          record.outcomeReturn >= 0 ? 'text-green-400' : 'text-red-400'
                        )}>
                          {record.outcomeReturn >= 0 ? '+' : ''}{safeToFixed(record.outcomeReturn, 1)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {record.lessonLearned && (
                <div className="mt-2 pt-2 border-t border-slate-700/30">
                  <span className="text-xs text-slate-500">Lesson: </span>
                  <span className="text-sm text-amber-400 italic">{record.lessonLearned}</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            data-testid="btn-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            data-testid="btn-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
