import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Zap, TrendingUp, Filter, SortDesc, Eye, Target, 
  BarChart3, ArrowUpDown, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import EliteSetupCard from './elite-setup-card';
import SymbolJourneyModal from './symbol-journey-modal';
import type { WatchlistItem } from '@shared/schema';

type SortMode = 'score' | 'edge' | 'performance' | 'days';
type FilterTier = 'all' | 'S' | 'A' | 'B';

interface EliteSetupsGridProps {
  compact?: boolean;
  maxItems?: number;
  showFilters?: boolean;
  onTrade?: (symbol: string) => void;
}

function calculateSortScore(item: WatchlistItem, mode: SortMode): number {
  const baseScore = item.gradeScore || 50;
  const edgeBoost = item.personalEdgeBoost || 0;
  const winRate = item.timesTraded && item.timesTraded > 0 
    ? (item.timesWon || 0) / item.timesTraded 
    : 0.5;
  
  switch (mode) {
    case 'score':
      return baseScore;
    case 'edge':
      return baseScore * (1 + (winRate - 0.5)) + edgeBoost;
    case 'performance':
      return (item.priceSinceAdded || 0) + (item.ytdPerformance || 0);
    case 'days':
      const daysWatched = Math.ceil((Date.now() - new Date(item.addedAt).getTime()) / (1000 * 60 * 60 * 24));
      return daysWatched;
    default:
      return baseScore;
  }
}

export default function EliteSetupsGrid({
  compact = false,
  maxItems = 12,
  showFilters = true,
  onTrade
}: EliteSetupsGridProps) {
  const [sortMode, setSortMode] = useState<SortMode>('edge');
  const [filterTier, setFilterTier] = useState<FilterTier>('all');
  const [journeySymbol, setJourneySymbol] = useState<string | null>(null);
  const [journeyItem, setJourneyItem] = useState<WatchlistItem | null>(null);

  const { data: watchlist, isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    staleTime: 5 * 60 * 1000,
  });

  const eliteSetups = useMemo(() => {
    if (!watchlist) return [];
    
    let filtered = watchlist.filter(item => {
      const tier = item.tier || 'C';
      if (filterTier === 'all') {
        return tier === 'S' || tier === 'A' || tier === 'B';
      }
      return tier === filterTier;
    });
    
    const sorted = [...filtered].sort((a, b) => {
      const scoreA = calculateSortScore(a, sortMode);
      const scoreB = calculateSortScore(b, sortMode);
      return sortMode === 'days' ? scoreB - scoreA : scoreB - scoreA;
    });
    
    return sorted.slice(0, maxItems);
  }, [watchlist, sortMode, filterTier, maxItems]);

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

  if (isLoading) {
    return (
      <Card className="border-purple-500/20" data-testid="elite-setups-loading">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            Elite Setups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent" data-testid="elite-setups-grid">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-400" />
              Elite Setups
              <Badge variant="outline" className="border-purple-500/40 text-purple-400">
                {eliteSetups.length} setups
              </Badge>
            </CardTitle>
            
            {showFilters && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={filterTier} onValueChange={(v) => setFilterTier(v as FilterTier)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs h-7 px-2" data-testid="filter-all">
                      All ({tierCounts.S + tierCounts.A + tierCounts.B})
                    </TabsTrigger>
                    <TabsTrigger value="S" className="text-xs h-7 px-2" data-testid="filter-s">
                      <Sparkles className="h-3 w-3 mr-1 text-purple-400" />
                      S ({tierCounts.S})
                    </TabsTrigger>
                    <TabsTrigger value="A" className="text-xs h-7 px-2" data-testid="filter-a">
                      A ({tierCounts.A})
                    </TabsTrigger>
                    <TabsTrigger value="B" className="text-xs h-7 px-2" data-testid="filter-b">
                      B ({tierCounts.B})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="select-sort">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edge">
                      <div className="flex items-center gap-2">
                        <Target className="h-3 w-3" />
                        Personal Edge
                      </div>
                    </SelectItem>
                    <SelectItem value="score">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-3 w-3" />
                        Raw Score
                      </div>
                    </SelectItem>
                    <SelectItem value="performance">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3" />
                        Performance
                      </div>
                    </SelectItem>
                    <SelectItem value="days">
                      <div className="flex items-center gap-2">
                        <Eye className="h-3 w-3" />
                        Days Watched
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          {sortMode === 'edge' && (
            <p className="text-xs text-muted-foreground mt-2">
              Sorted by score × your win rate + personal edge boost
            </p>
          )}
        </CardHeader>
        
        <CardContent>
          {eliteSetups.length > 0 ? (
            <div className={cn(
              "grid gap-4",
              compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {eliteSetups.map((item) => (
                <EliteSetupCard
                  key={item.id}
                  item={item}
                  compact={compact}
                  onViewJourney={openJourney}
                  onAddNote={() => openJourney(item.symbol)}
                  onTrade={onTrade}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground" data-testid="elite-setups-empty">
              <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No Elite Setups Found</p>
              <p className="text-xs">
                {filterTier !== 'all' 
                  ? `No ${filterTier}-tier symbols in your watchlist` 
                  : 'Add symbols to your watchlist to track elite setups'}
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
