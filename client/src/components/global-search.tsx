import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { 
  Search, TrendingUp, TrendingDown, Loader2,
  BarChart3, Bitcoin, DollarSign, Rocket,
  ArrowRight, Star, Clock
} from "lucide-react";

interface SearchResult {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto' | 'option' | 'future' | 'penny_stock';
  price?: number;
  change?: number;
  hasIdeas?: boolean;
}

const POPULAR_SEARCHES: SearchResult[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'stock' },
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', type: 'stock' },
  { symbol: 'SPY', name: 'S&P 500 ETF', type: 'stock' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'RKLB', name: 'Rocket Lab USA', type: 'stock' },
  { symbol: 'SMCI', name: 'Super Micro Computer', type: 'stock' },
];

const RECENT_SEARCHES_KEY = 'quant_edge_recent_searches';

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(symbol: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSearches().filter(s => s !== symbol);
    recent.unshift(symbol);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {
    // Ignore localStorage errors
  }
}

function getAssetIcon(type: string) {
  switch (type) {
    case 'crypto': return <Bitcoin className="h-4 w-4 text-amber-400" />;
    case 'future': return <Rocket className="h-4 w-4 text-cyan-400" />;
    case 'penny_stock': return <DollarSign className="h-4 w-4 text-pink-400" />;
    default: return <BarChart3 className="h-4 w-4 text-primary" />;
  }
}

export function GlobalSearch({ 
  variant = 'default',
  placeholder = 'Search stocks, crypto, options...',
  onSearch
}: { 
  variant?: 'default' | 'large' | 'hero';
  placeholder?: string;
  onSearch?: (symbol: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount (client-side only)
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const { data: searchResults, isLoading } = useQuery<SearchResult[]>({
    queryKey: ['/api/search/symbols', query],
    queryFn: async () => {
      const response = await fetch(`/api/search/symbols?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: query.length >= 1,
    staleTime: 30000,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (symbol: string) => {
    addRecentSearch(symbol);
    setRecentSearches(getRecentSearches()); // Update state after adding
    setQuery('');
    setIsFocused(false);
    if (onSearch) {
      onSearch(symbol);
    } else {
      setLocation(`/chart-analysis?s=${symbol}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      handleSelect(query.trim().toUpperCase());
    }
  };

  const showDropdown = isFocused && (query.length >= 1 || recentSearches.length > 0 || POPULAR_SEARCHES.length > 0);

  const filteredPopular = query.length === 0 
    ? POPULAR_SEARCHES 
    : POPULAR_SEARCHES.filter(p => 
        p.symbol.toLowerCase().includes(query.toLowerCase()) ||
        p.name.toLowerCase().includes(query.toLowerCase())
      );

  const results = searchResults || filteredPopular;

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className={cn(
          "relative group",
          variant === 'hero' && "max-w-2xl mx-auto"
        )}>
          <Search className={cn(
            "absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary",
            variant === 'large' && "h-5 w-5",
            variant === 'hero' && "h-6 w-6 left-6"
          )} />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onFocus={() => setIsFocused(true)}
            placeholder={placeholder}
            className={cn(
              "pl-12 pr-12 font-mono tracking-wide transition-all",
              variant === 'default' && "h-10",
              variant === 'large' && "h-12 text-lg pl-14",
              variant === 'hero' && "h-16 text-xl pl-16 pr-16 rounded-2xl border-2 border-border/50 focus:border-primary/50 shadow-xl bg-card/80 backdrop-blur-xl"
            )}
            data-testid="input-global-search"
          />
          {isLoading ? (
            <Loader2 className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground",
              variant === 'hero' && "right-6 h-5 w-5"
            )} />
          ) : query && (
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2",
                variant === 'hero' && "right-4 h-10 w-10"
              )}
              data-testid="button-search-submit"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {showDropdown && (
        <Card className={cn(
          "absolute z-50 w-full mt-2 p-2 shadow-xl border-border/50 bg-card/95 backdrop-blur-xl",
          variant === 'hero' && "max-w-2xl left-1/2 -translate-x-1/2 rounded-xl"
        )} data-testid="dropdown-search-results">
          <ScrollArea className="max-h-[400px]">
            {recentSearches.length > 0 && query.length === 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 px-2 mb-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Recent
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 px-2">
                  {recentSearches.map((symbol) => (
                    <Button
                      key={symbol}
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSelect(symbol)}
                      className="h-7 text-xs font-mono font-bold"
                      data-testid={`recent-${symbol}`}
                    >
                      {symbol}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 px-2 mb-2">
                <Star className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {query.length > 0 ? 'Results' : 'Popular'}
                </span>
              </div>
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    key={result.symbol}
                    onClick={() => handleSelect(result.symbol)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover-elevate transition-all text-left"
                    data-testid={`result-${result.symbol}`}
                  >
                    <div className="p-2 rounded-lg bg-muted/30">
                      {getAssetIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono">{result.symbol}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {result.type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {result.name}
                      </div>
                    </div>
                    {result.price && (
                      <div className="text-right">
                        <div className="font-mono font-bold">
                          ${result.price.toFixed(2)}
                        </div>
                        {result.change !== undefined && (
                          <div className={cn(
                            "text-xs font-mono flex items-center justify-end gap-1",
                            result.change >= 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {result.change >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {result.change >= 0 ? '+' : ''}{result.change.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

export function HeroSearch() {
  return (
    <div className="space-y-4" data-testid="hero-search-container">
      <GlobalSearch variant="hero" placeholder="Search any stock, crypto, or futures symbol..." />
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>Popular:</span>
        {['NVDA', 'SPY', 'BTC', 'TSLA', 'RKLB'].map((symbol) => (
          <Badge 
            key={symbol} 
            variant="secondary" 
            className="text-[10px] font-mono font-bold cursor-pointer hover-elevate"
          >
            {symbol}
          </Badge>
        ))}
      </div>
    </div>
  );
}
