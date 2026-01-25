/**
 * Universal Search Hero Component
 *
 * Search-first interface for the homepage
 * Searches across stocks, crypto, trade ideas, news, actions, and help
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useStockContext } from '@/contexts/stock-context';
import {
  Search,
  TrendingUp,
  Loader2,
  BarChart3,
  Bitcoin,
  Newspaper,
  Lightbulb,
  HelpCircle,
  Zap,
  ArrowRight,
  Clock,
  TrendingDown,
  Activity,
} from 'lucide-react';
import type { SearchResponse, AnySearchResult, SearchSuggestion, TrendingSearch } from '@shared/search-types';

const RECENT_SEARCHES_KEY = 'quant_edge_recent_searches_v2';

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(query: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentSearches().filter(s => s !== query);
    recent.unshift(query);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {
    // Ignore localStorage errors
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'stocks':
      return <BarChart3 className="h-4 w-4 text-primary" />;
    case 'crypto':
      return <Bitcoin className="h-4 w-4 text-amber-400" />;
    case 'news':
      return <Newspaper className="h-4 w-4 text-blue-400" />;
    case 'ideas':
      return <Lightbulb className="h-4 w-4 text-purple-400" />;
    case 'actions':
      return <Zap className="h-4 w-4 text-cyan-400" />;
    case 'help':
      return <HelpCircle className="h-4 w-4 text-slate-400" />;
    default:
      return <Search className="h-4 w-4 text-slate-400" />;
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'stocks':
      return 'Stocks';
    case 'crypto':
      return 'Crypto';
    case 'news':
      return 'News';
    case 'ideas':
      return 'Trade Ideas';
    case 'actions':
      return 'Actions';
    case 'help':
      return 'Help';
    default:
      return category;
  }
}

export function UniversalSearchHero({
  variant = 'hero',
  placeholder = 'Search stocks, trade ideas, news, or type a command...',
  onSelect,
}: {
  variant?: 'default' | 'hero';
  placeholder?: string;
  onSelect?: (result: AnySearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [, setLocation] = useLocation();
  const { setCurrentStock } = useStockContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search results
  const { data: searchResults, isLoading } = useQuery<SearchResponse>({
    queryKey: ['/api/search', query],
    queryFn: async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        return {
          query,
          results: [],
          categories: [],
          totalResults: 0,
          searchTime: 0,
        };
      }
      return response.json();
    },
    enabled: query.length >= 2,
    staleTime: 30000,
  });

  // Search suggestions for autocomplete
  const { data: suggestions } = useQuery<SearchSuggestion[]>({
    queryKey: ['/api/search/suggestions', query],
    queryFn: async () => {
      const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: query.length >= 1 && query.length < 3,
    staleTime: 30000,
  });

  // Trending searches
  const { data: trending } = useQuery<TrendingSearch[]>({
    queryKey: ['/api/search/trending'],
    queryFn: async () => {
      const response = await fetch('/api/search/trending');
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 60000, // Cache for 1 minute
  });

  const handleResultClick = (result: AnySearchResult) => {
    addRecentSearch(query);
    setRecentSearches(getRecentSearches());
    setIsFocused(false);
    setQuery('');

    if (onSelect) {
      onSelect(result);
      return;
    }

    // Default navigation based on result type
    if (result.category === 'stocks') {
      const stockResult = result as any;
      setCurrentStock(stockResult.symbol);
      setLocation(`/stock/${stockResult.symbol}`);
    } else {
      setLocation(result.url);
    }
  };

  const handleRecentSearchClick = (recentQuery: string) => {
    setQuery(recentQuery);
    inputRef.current?.focus();
  };

  const handleTrendingClick = (trendingQuery: string) => {
    setQuery(trendingQuery);
    inputRef.current?.focus();
  };

  const showDropdown = isFocused && (query.length >= 1 || recentSearches.length > 0 || trending);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search Input */}
      <div
        className={cn(
          'relative flex items-center gap-2',
          variant === 'hero' ? 'w-full max-w-3xl mx-auto' : 'w-full'
        )}
      >
        <div className="relative flex-1">
          <Search
            className={cn(
              'absolute left-4 text-muted-foreground pointer-events-none',
              variant === 'hero' ? 'top-5 h-5 w-5' : 'top-3 h-4 w-4'
            )}
          />
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            className={cn(
              'w-full bg-background/80 backdrop-blur-sm border-2 transition-all',
              'focus:border-primary focus:ring-2 focus:ring-primary/20',
              variant === 'hero'
                ? 'h-16 pl-14 pr-4 text-lg rounded-2xl'
                : 'h-10 pl-10 pr-4 rounded-lg'
            )}
          />
          {isLoading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {variant === 'hero' && (
          <Button size="lg" className="h-16 px-8 rounded-xl shadow-lg">
            Search
          </Button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showDropdown && (
        <Card
          className={cn(
            'absolute z-50 w-full mt-2 shadow-2xl border-2',
            variant === 'hero' ? 'max-w-3xl mx-auto left-0 right-0' : ''
          )}
        >
          <ScrollArea className="max-h-[600px]">
            <div className="p-2">
              {/* Recent Searches (when no query) */}
              {query.length === 0 && recentSearches.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Recent Searches</span>
                  </div>
                  <div className="space-y-1">
                    {recentSearches.map((recent, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRecentSearchClick(recent)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span>{recent}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Searches (when no query) */}
              {query.length === 0 && trending && trending.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                    <TrendingUp className="h-4 w-4" />
                    <span>Trending</span>
                  </div>
                  <div className="space-y-1">
                    {trending.map((trend, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleTrendingClick(trend.query)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        {getCategoryIcon(trend.category)}
                        <span className="flex-1">{trend.query}</span>
                        <Badge variant="secondary" className="text-xs">
                          {trend.count}
                        </Badge>
                        {trend.trendDirection === 'up' && (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        )}
                        {trend.trendDirection === 'down' && (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions (short query) */}
              {query.length > 0 && query.length < 3 && suggestions && suggestions.length > 0 && (
                <div className="space-y-1">
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => setQuery(suggestion.text)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      {suggestion.icon ? (
                        <span className="text-lg">{suggestion.icon}</span>
                      ) : (
                        getCategoryIcon(suggestion.category)
                      )}
                      <div className="flex-1">
                        <div className="font-medium">{suggestion.text}</div>
                        {suggestion.metadata?.companyName && (
                          <div className="text-xs text-muted-foreground">
                            {suggestion.metadata.companyName}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(suggestion.category)}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}

              {/* Search Results (longer query) */}
              {query.length >= 2 && searchResults && searchResults.results.length > 0 && (
                <div className="space-y-4">
                  {searchResults.categories.map(categoryGroup => (
                    <div key={categoryGroup.category}>
                      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
                        {getCategoryIcon(categoryGroup.category)}
                        <span>{getCategoryLabel(categoryGroup.category)}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {categoryGroup.count}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {categoryGroup.results.slice(0, 5).map(result => (
                          <button
                            key={result.id}
                            onClick={() => handleResultClick(result)}
                            className="w-full flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left group"
                          >
                            <div className="mt-0.5">
                              {result.icon ? (
                                <span className="text-lg">{result.icon}</span>
                              ) : (
                                getCategoryIcon(result.category)
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium flex items-center gap-2">
                                {result.title}
                                {result.category === 'stocks' && (result as any).grade && (
                                  <Badge variant="outline" className="text-xs">
                                    Grade: {(result as any).grade}
                                  </Badge>
                                )}
                                {result.category === 'ideas' && (
                                  <Badge variant="outline" className="text-xs">
                                    {(result as any).confidence}% confidence
                                  </Badge>
                                )}
                              </div>
                              {result.subtitle && (
                                <div className="text-sm text-muted-foreground">
                                  {result.subtitle}
                                </div>
                              )}
                              {result.description && (
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {result.description}
                                </div>
                              )}
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No Results */}
              {query.length >= 2 &&
                searchResults &&
                searchResults.results.length === 0 &&
                !isLoading && (
                  <div className="px-3 py-8 text-center text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No results found for "{query}"</p>
                    <p className="text-sm mt-1">Try a different search term</p>
                  </div>
                )}

              {/* Loading State */}
              {isLoading && query.length >= 2 && (
                <div className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Searching...</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
