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
  AlertTriangle,
  Sparkles
} from "lucide-react";

interface WatchReason {
  type: 'earnings' | 'news' | 'flow' | 'technical' | 'ai_pick' | 'quant_signal' | 'momentum' | 'volatility' | 'hybrid' | 'lotto';
  label: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  timestamp?: string;
  count?: number;
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
  hybrid: Sparkles,
  lotto: Flame,
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
    <div 
      className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/5"
      data-testid={`card-suggestion-${suggestion.symbol}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span 
            className={`px-2 py-1 rounded text-xs font-mono font-bold ${priorityColors[suggestion.priority]}`}
            data-testid={`badge-priority-${suggestion.symbol}`}
          >
            <PriorityIcon className="h-3 w-3 mr-1 inline" />
            {suggestion.symbol}
          </span>
          {DirectionIcon && (
            <DirectionIcon 
              className={`h-4 w-4 ${
                suggestion.direction === 'bullish' ? 'text-green-400' : 'text-red-400'
              }`}
            />
          )}
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-muted-foreground">
          {suggestion.reasonCount} signals
        </span>
      </div>
      
      <div className="mt-2 flex flex-wrap gap-1">
        {suggestion.reasons.slice(0, 3).map((reason, i) => (
          <ReasonBadge key={i} reason={reason} />
        ))}
        {suggestion.reasons.length > 3 && (
          <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-muted-foreground">
            +{suggestion.reasons.length - 3}
          </span>
        )}
      </div>
      
      {suggestion.currentPrice && (
        <div className="mt-2 text-xs text-muted-foreground font-mono">
          ${suggestion.currentPrice.toFixed(2)}
        </div>
      )}
    </div>
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
      <div className="glass-card rounded-xl" data-testid="card-watch-suggestions-loading">
        <div className="p-4 pb-2 flex items-center gap-2">
          <Eye className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold">Watch Out For</span>
        </div>
        <div className="p-3 space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !suggestions || suggestions.length === 0) {
    return (
      <div className="glass-card rounded-xl" data-testid="card-watch-suggestions-empty">
        <div className="p-4 pb-2 flex items-center gap-2">
          <Eye className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-semibold">Watch Out For</span>
        </div>
        <div className="p-4 pt-2">
          <p className="text-sm text-muted-foreground text-center py-4">
            No multi-signal stocks detected yet. Check back during market hours.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl" data-testid="card-watch-suggestions">
      <div className="p-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4 text-cyan-400" />
          Watch Out For
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-muted-foreground">
          {suggestions.length} stocks
        </span>
      </div>
      <ScrollArea className="h-[280px]">
        <div className="space-y-2 p-3 pt-1">
          {suggestions.map(suggestion => (
            <SuggestionCard key={suggestion.symbol} suggestion={suggestion} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
