import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Eye, 
  TrendingUp, 
  TrendingDown, 
  Flame,
  Zap,
  Brain,
  BarChart3,
  Newspaper,
  Calendar,
  Activity,
  AlertTriangle
} from "lucide-react";

interface WatchReason {
  type: 'earnings' | 'news' | 'flow' | 'technical' | 'ai_pick' | 'quant_signal' | 'momentum' | 'volatility';
  label: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  timestamp?: string;
}

interface WatchSuggestion {
  symbol: string;
  assetType: 'stock' | 'crypto' | 'option';
  currentPrice?: number;
  priceChange?: number;
  reasons: WatchReason[];
  reasonCount: number;
  priority: 'hot' | 'warm' | 'watch';
  direction?: 'bullish' | 'bearish' | 'neutral';
  generatedAt: string;
}

const reasonIcons: Record<WatchReason['type'], typeof Eye> = {
  earnings: Calendar,
  news: Newspaper,
  flow: Activity,
  technical: BarChart3,
  ai_pick: Brain,
  quant_signal: Zap,
  momentum: TrendingUp,
  volatility: AlertTriangle,
};

const priorityColors: Record<WatchSuggestion['priority'], string> = {
  hot: 'bg-red-500/20 text-red-400 border-red-500/30',
  warm: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  watch: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const impactColors: Record<WatchReason['impact'], string> = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-slate-500/20 text-slate-400',
};

function ReasonBadge({ reason }: { reason: WatchReason }) {
  const Icon = reasonIcons[reason.type];
  return (
    <Badge 
      variant="outline" 
      className={`gap-1 text-xs ${impactColors[reason.impact]}`}
      data-testid={`badge-reason-${reason.type}`}
    >
      <Icon className="h-3 w-3" />
      {reason.label}
    </Badge>
  );
}

function SuggestionCard({ suggestion }: { suggestion: WatchSuggestion }) {
  const PriorityIcon = suggestion.priority === 'hot' ? Flame : 
                       suggestion.priority === 'warm' ? Zap : Eye;
  
  const DirectionIcon = suggestion.direction === 'bullish' ? TrendingUp : 
                        suggestion.direction === 'bearish' ? TrendingDown : null;
  
  return (
    <Card 
      className="hover-elevate transition-all"
      data-testid={`card-suggestion-${suggestion.symbol}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`${priorityColors[suggestion.priority]} font-mono font-bold`}
              data-testid={`badge-priority-${suggestion.symbol}`}
            >
              <PriorityIcon className="h-3 w-3 mr-1" />
              {suggestion.symbol}
            </Badge>
            {DirectionIcon && (
              <DirectionIcon 
                className={`h-4 w-4 ${
                  suggestion.direction === 'bullish' ? 'text-green-500' : 'text-red-500'
                }`}
              />
            )}
          </div>
          <Badge variant="secondary" className="text-xs">
            {suggestion.reasonCount} signals
          </Badge>
        </div>
        
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestion.reasons.slice(0, 4).map((reason, i) => (
            <ReasonBadge key={i} reason={reason} />
          ))}
          {suggestion.reasons.length > 4 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              +{suggestion.reasons.length - 4} more
            </Badge>
          )}
        </div>
        
        {suggestion.currentPrice && (
          <div className="mt-2 text-xs text-muted-foreground">
            Current: ${suggestion.currentPrice.toFixed(2)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WatchSuggestions() {
  const { data: suggestions, isLoading, error } = useQuery<WatchSuggestion[]>({
    queryKey: ['/api/watch-suggestions'],
    staleTime: 60000,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-watch-suggestions-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Watch Out For
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !suggestions || suggestions.length === 0) {
    return (
      <Card data-testid="card-watch-suggestions-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Watch Out For
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No multi-signal stocks detected yet. Check back during market hours.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-watch-suggestions">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Watch Out For
          <Badge variant="secondary" className="ml-auto text-xs">
            {suggestions.length} stocks
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 p-3 pt-0">
            {suggestions.map(suggestion => (
              <SuggestionCard key={suggestion.symbol} suggestion={suggestion} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
