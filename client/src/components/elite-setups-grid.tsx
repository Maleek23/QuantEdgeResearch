import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Zap, TrendingUp, Eye, Target, BarChart3, ArrowUpDown, 
  ChevronDown, Calendar, DollarSign
} from 'lucide-react';
import { cn, safeToFixed } from '@/lib/utils';
import SymbolJourneyModal from './symbol-journey-modal';
import type { WatchlistItem } from '@shared/schema';

type SortMode = 'score' | 'edge' | 'performance' | 'days';
type FilterTier = 'all' | 'S' | 'A' | 'B';

interface SymbolPerformance {
  stats: {
    symbol: string;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgReturn: number;
    totalPnL: number;
  } | null;
}

interface EliteSetupsGridProps {
  compact?: boolean;
  maxItems?: number;
  showFilters?: boolean;
  onTrade?: (symbol: string) => void;
}

const ITEMS_PER_PAGE = 24;

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/40' },
  A: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  B: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40' },
};

function calculateSortScore(item: WatchlistItem, mode: SortMode, perfMap: Map<string, SymbolPerformance>): number {
  const baseScore = item.gradeScore || 50;
  const storedEdgeBoost = item.personalEdgeBoost || 0;
  
  const perf = perfMap.get(item.symbol);
  const totalTrades = perf?.stats?.totalTrades || item.timesTraded || 0;
  const wins = perf?.stats?.wins || item.timesWon || 0;
  const actualWinRate = totalTrades > 0 ? wins / totalTrades : 0.5;
  
  const dynamicEdgeBoost = actualWinRate >= 0.8 ? 15 : 
                           actualWinRate >= 0.65 ? 10 :
                           actualWinRate >= 0.5 ? 5 :
                           actualWinRate >= 0.4 ? 0 : -10;
  const edgeBoost = storedEdgeBoost || dynamicEdgeBoost;
  
  switch (mode) {
    case 'score':
      return baseScore;
    case 'edge':
      return baseScore * (1 + (actualWinRate - 0.5)) + edgeBoost;
    case 'performance':
      return (item.priceSinceAdded || 0) + (item.ytdPerformance || 0);
    case 'days':
      const daysWatched = Math.ceil((Date.now() - new Date(item.addedAt).getTime()) / (1000 * 60 * 60 * 24));
      return daysWatched;
    default:
      return baseScore;
  }
}

function CompactSetupRow({ 
  item, 
  perf,
  onViewJourney,
  onTrade
}: { 
  item: WatchlistItem;
  perf?: SymbolPerformance;
  onViewJourney: (symbol: string) => void;
  onTrade?: (symbol: string) => void;
}) {
  const tier = item.tier || 'C';
  const colors = TIER_COLORS[tier] || { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/40' };
  const daysWatched = Math.ceil((Date.now() - new Date(item.addedAt).getTime()) / (1000 * 60 * 60 * 24));
  
  const totalTrades = perf?.stats?.totalTrades || item.timesTraded || 0;
  const wins = perf?.stats?.wins || item.timesWon || 0;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const pnl = perf?.stats?.totalPnL || item.totalPnl || 0;
  
  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-lg bg-card/50 border border-border/50 hover-elevate cursor-pointer"
      onClick={() => onViewJourney(item.symbol)}
      data-testid={`elite-setup-${item.symbol}`}
    >
      <div className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center font-bold font-mono text-sm border",
        colors.bg, colors.text, colors.border
      )}>
        {tier}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-sm">{item.symbol}</span>
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {item.gradeScore || 50}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {daysWatched}d
          </span>
          {totalTrades > 0 && (
            <span className={cn(
              "flex items-center gap-1",
              winRate >= 60 ? "text-green-400" : winRate >= 40 ? "text-amber-400" : "text-red-400"
            )}>
              {safeToFixed(winRate, 0)}% WR
            </span>
          )}
          {pnl !== 0 && (
            <span className={cn(
              "flex items-center gap-1 font-mono",
              pnl >= 0 ? "text-green-400" : "text-red-400"
            )}>
              <DollarSign className="h-3 w-3" />
              {pnl >= 0 ? '+' : ''}{safeToFixed(pnl, 0)}
            </span>
          )}
        </div>
      </div>
      
      {onTrade && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onTrade(item.symbol);
          }}
          data-testid={`trade-${item.symbol}`}
        >
          Trade
        </Button>
      )}
    </div>
  );
}

export default function EliteSetupsGrid({
  compact = false,
  maxItems = ITEMS_PER_PAGE,
  showFilters = true,
  onTrade
}: EliteSetupsGridProps) {
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [filterTier, setFilterTier] = useState<FilterTier>('all');
  const [visibleCount, setVisibleCount] = useState(maxItems);
  const [journeySymbol, setJourneySymbol] = useState<string | null>(null);
  const [journeyItem, setJourneyItem] = useState<WatchlistItem | null>(null);
  const [performanceMap, setPerformanceMap] = useState<Map<string, SymbolPerformance>>(new Map());

  const { data: watchlist, isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    staleTime: 5 * 60 * 1000,
  });

  const eliteSymbols = useMemo(() => {
    if (!watchlist) return [];
    return watchlist
      .filter(item => ['S', 'A', 'B'].includes(item.tier || 'C'))
      .map(item => item.symbol);
  }, [watchlist]);

  useEffect(() => {
    if (eliteSymbols.length === 0) return;
    
    const fetchPerformance = async () => {
      const newMap = new Map<string, SymbolPerformance>();
      const fetchPromises = eliteSymbols.slice(0, 30).map(async (symbol) => {
        try {
          const res = await fetch(`/api/watchlist/performance-summary/${symbol}`);
          if (res.ok) {
            const data = await res.json();
            newMap.set(symbol, data);
          }
        } catch (e) {}
      });
      await Promise.all(fetchPromises);
      setPerformanceMap(newMap);
    };
    
    fetchPerformance();
  }, [eliteSymbols.join(',')]);

  const allEliteSetups = useMemo(() => {
    if (!watchlist) return [];
    
    let filtered = watchlist.filter(item => {
      const tier = item.tier || 'C';
      if (filterTier === 'all') {
        return tier === 'S' || tier === 'A' || tier === 'B';
      }
      return tier === filterTier;
    });
    
    return [...filtered].sort((a, b) => {
      const scoreA = calculateSortScore(a, sortMode, performanceMap);
      const scoreB = calculateSortScore(b, sortMode, performanceMap);
      return scoreB - scoreA;
    });
  }, [watchlist, sortMode, filterTier, performanceMap]);

  const visibleSetups = useMemo(() => {
    return allEliteSetups.slice(0, visibleCount);
  }, [allEliteSetups, visibleCount]);

  const tierCounts = useMemo(() => {
    if (!watchlist) return { S: 0, A: 0, B: 0 };
    return {
      S: watchlist.filter(i => i.tier === 'S').length,
      A: watchlist.filter(i => i.tier === 'A').length,
      B: watchlist.filter(i => i.tier === 'B').length,
    };
  }, [watchlist]);

  const openJourney = (symbol: string) => {
    const item = watchlist?.find(w => w.symbol === symbol);
    setJourneyItem(item || null);
    setJourneySymbol(symbol);
  };

  const loadMore = () => {
    setVisibleCount(prev => prev + ITEMS_PER_PAGE);
  };

  useEffect(() => {
    setVisibleCount(maxItems);
  }, [filterTier, sortMode, maxItems]);

  if (isLoading) {
    return (
      <Card className="border-border/50" data-testid="elite-setups-loading">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            Elite Setups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasMore = visibleCount < allEliteSetups.length;

  return (
    <>
      <Card className="border-border/50" data-testid="elite-setups-grid">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                Elite Setups
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {allEliteSetups.length} total
              </span>
            </div>
            
            {showFilters && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 p-1 rounded-md bg-muted/30">
                  {(['all', 'S', 'A', 'B'] as const).map((tier) => (
                    <Button
                      key={tier}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 text-xs",
                        filterTier === tier && "bg-background shadow-sm"
                      )}
                      onClick={() => setFilterTier(tier)}
                      data-testid={`filter-${tier.toLowerCase()}`}
                    >
                      {tier === 'all' ? 'All' : tier}
                      <span className="ml-1 text-muted-foreground">
                        {tier === 'all' 
                          ? tierCounts.S + tierCounts.A + tierCounts.B
                          : tierCounts[tier as 'S' | 'A' | 'B']}
                      </span>
                    </Button>
                  ))}
                </div>
                
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="select-sort">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">Score</SelectItem>
                    <SelectItem value="edge">Personal Edge</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="days">Days Watched</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {visibleSetups.length > 0 ? (
            <div className="space-y-2">
              {visibleSetups.map((item) => (
                <CompactSetupRow
                  key={item.id}
                  item={item}
                  perf={performanceMap.get(item.symbol)}
                  onViewJourney={openJourney}
                  onTrade={onTrade}
                />
              ))}
              
              {hasMore && (
                <div className="pt-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    className="gap-2"
                    data-testid="button-load-more"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Load More ({allEliteSetups.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground" data-testid="elite-setups-empty">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {filterTier !== 'all' 
                  ? `No ${filterTier}-tier symbols in watchlist` 
                  : 'No elite setups found'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {journeySymbol && (
        <SymbolJourneyModal
          symbol={journeySymbol}
          watchlistItem={journeyItem || undefined}
          isOpen={!!journeySymbol}
          onClose={() => {
            setJourneySymbol(null);
            setJourneyItem(null);
          }}
        />
      )}
    </>
  );
}
