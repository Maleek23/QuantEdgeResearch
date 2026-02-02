import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, safeToFixed } from "@/lib/utils";
import { useStockContext } from "@/contexts/stock-context";
import { useToast } from "@/hooks/use-toast";
import {
  Search, TrendingUp, TrendingDown, Loader2,
  BarChart3, Bitcoin, DollarSign, Rocket,
  ArrowRight, Star, Clock, Sparkles, MessageSquare,
  BookOpen, ChartLine, HelpCircle, Zap, Brain
} from "lucide-react";

interface SearchResult {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto' | 'option' | 'future' | 'penny_stock';
  price?: number;
  change?: number;
  hasIdeas?: boolean;
}

// AI Search response types
interface AISearchResponse {
  type: 'stock_analysis' | 'trading_strategy' | 'market_question' | 'education' | 'general' | 'price_check';
  query: string;
  response: string;
  sources?: { title: string; url?: string; type: string }[];
  relatedTickers?: string[];
  suggestedFollowUps?: string[];
  confidence: number;
  processingTime: number;
  quickAction?: {
    type: 'navigate_stock';
    tickers: string[];
    message: string;
  };
}

interface IntentCheckResult {
  query: string;
  intent: string;
  tickers: string[];
  keywords: string[];
  isQuestion: boolean;
  suggestedRoute: 'stock' | 'search' | 'chat';
}

// Detect if query looks like a general question vs stock symbol
function isGeneralQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  // Check if it's a question (starts with question words or contains ?)
  if (/^(what|why|how|when|where|who|which|is|are|can|could|should|would|do|does|did|explain|tell)/i.test(trimmed)) {
    return true;
  }
  if (trimmed.includes('?')) return true;
  // Check if it contains multiple words (likely a sentence)
  if (trimmed.split(/\s+/).length > 3) return true;
  // Check for common strategy phrases
  if (/swing|trade|strategy|play|setup|breakout|earnings|momentum|analysis|indicator|pattern/i.test(trimmed)) {
    return true;
  }
  return false;
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
  placeholder = 'Search stocks, ask questions, get AI insights...',
  onSearch,
  enableAI = true
}: {
  variant?: 'default' | 'large' | 'hero';
  placeholder?: string;
  onSearch?: (symbol: string) => void;
  enableAI?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [displayQuery, setDisplayQuery] = useState(''); // For display without auto-uppercase
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showAIResponse, setShowAIResponse] = useState(false);
  const [analyzingSymbol, setAnalyzingSymbol] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { setCurrentStock } = useStockContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches on mount (client-side only)
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Determine search mode based on query
  const isAIMode = enableAI && isGeneralQuery(displayQuery);

  // Standard symbol search
  const { data: searchResults, isLoading: isSymbolLoading } = useQuery<SearchResult[]>({
    queryKey: ['/api/search/symbols', query],
    queryFn: async () => {
      const response = await fetch(`/api/search/symbols?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: query.length >= 1 && !isAIMode,
    staleTime: 30000,
  });

  // AI search mutation
  const aiSearchMutation = useMutation<AISearchResponse, Error, string>({
    mutationFn: async (searchQuery: string) => {
      const response = await fetch('/api/search/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, includeWebSearch: true }),
      });
      if (!response.ok) throw new Error('AI search failed');
      return response.json();
    },
    onSuccess: () => {
      setShowAIResponse(true);
    },
  });

  // Convergence analysis mutation
  const analysisMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await fetch(`/api/convergence/analyze/${symbol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }
      return response.json();
    },
    onSuccess: (data, symbol) => {
      setAnalyzingSymbol(null);
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Analysis Complete",
        description: `Trade idea generated for ${symbol} with ${data.convergenceAnalysis?.convergenceScore || 0}% convergence score`,
      });
      // Navigate to trade desk to see the new idea
      setLocation('/trade-desk');
      setIsFocused(false);
      setQuery('');
      setDisplayQuery('');
    },
    onError: (error) => {
      setAnalyzingSymbol(null);
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerateAnalysis = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzingSymbol(symbol);
    analysisMutation.mutate(symbol);
  };

  const isLoading = isSymbolLoading || aiSearchMutation.isPending;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (symbol: string, result?: SearchResult) => {
    addRecentSearch(symbol);
    setRecentSearches(getRecentSearches()); // Update state after adding

    // Set stock context
    setCurrentStock({
      symbol: symbol.toUpperCase(),
      name: result?.name,
      price: result?.price,
      change: result?.change,
    });

    setQuery('');
    setIsFocused(false);
    if (onSearch) {
      onSearch(symbol);
    } else {
      // Route to Stock Detail page for comprehensive analysis
      setLocation(`/stock/${symbol}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuery = displayQuery.trim();
    if (!trimmedQuery) return;

    if (isAIMode) {
      // Trigger AI search
      aiSearchMutation.mutate(trimmedQuery);
    } else {
      // Standard symbol navigation
      handleSelect(trimmedQuery.toUpperCase());
    }
  };

  // Handle clicking on a related ticker from AI response
  const handleTickerClick = (ticker: string) => {
    addRecentSearch(ticker);
    setRecentSearches(getRecentSearches());
    setLocation(`/stock/${ticker}`);
    setIsFocused(false);
    setShowAIResponse(false);
    setQuery('');
    setDisplayQuery('');
  };

  // Handle asking a follow-up question
  const handleFollowUp = (followUpQuery: string) => {
    setDisplayQuery(followUpQuery);
    setQuery(followUpQuery.toUpperCase());
    aiSearchMutation.mutate(followUpQuery);
  };

  // Get intent icon based on query type
  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'stock_analysis': return <ChartLine className="h-4 w-4 text-cyan-400" />;
      case 'trading_strategy': return <Sparkles className="h-4 w-4 text-amber-400" />;
      case 'market_question': return <BarChart3 className="h-4 w-4 text-emerald-400" />;
      case 'education': return <BookOpen className="h-4 w-4 text-purple-400" />;
      default: return <MessageSquare className="h-4 w-4 text-slate-400" />;
    }
  };

  const showDropdown = isFocused && (displayQuery.length >= 1 || recentSearches.length > 0 || POPULAR_SEARCHES.length > 0 || showAIResponse);

  const filteredPopular = displayQuery.length === 0
    ? POPULAR_SEARCHES
    : POPULAR_SEARCHES.filter(p =>
        p.symbol.toLowerCase().includes(displayQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(displayQuery.toLowerCase())
      );

  const results = searchResults || filteredPopular;
  const aiResponse = aiSearchMutation.data;

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
            value={displayQuery}
            onChange={(e) => {
              const value = e.target.value;
              setDisplayQuery(value);
              // Only uppercase for symbol mode (non-questions)
              setQuery(isGeneralQuery(value) ? value : value.toUpperCase());
              setShowAIResponse(false); // Reset AI response when typing
            }}
            onFocus={() => setIsFocused(true)}
            placeholder={placeholder}
            className={cn(
              "pl-12 pr-12 transition-all",
              !isAIMode && "font-mono tracking-wide",
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
          variant === 'hero' && "max-w-2xl left-1/2 -translate-x-1/2 rounded-xl",
          showAIResponse && aiResponse && "max-h-[500px]"
        )} data-testid="dropdown-search-results">
          <ScrollArea className={cn("max-h-[400px]", showAIResponse && aiResponse && "max-h-[480px]")}>
            {/* AI Response Section */}
            {showAIResponse && aiResponse && (
              <div className="mb-4">
                <div className="flex items-center gap-2 px-2 mb-3">
                  {getIntentIcon(aiResponse.type)}
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {aiResponse.type.replace('_', ' ')}
                  </span>
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {aiResponse.confidence}% confidence
                  </Badge>
                </div>

                {/* AI Response Content */}
                <div className="px-3 py-3 rounded-lg bg-gray-100 dark:bg-muted/20 mb-3">
                  <div className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {aiResponse.response}
                  </div>
                </div>

                {/* Quick Action - Navigate to Stock */}
                {aiResponse.quickAction && (
                  <div className="px-2 mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTickerClick(aiResponse.quickAction!.tickers[0])}
                      className="w-full justify-between text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                    >
                      <span>{aiResponse.quickAction.message}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Related Tickers */}
                {aiResponse.relatedTickers && aiResponse.relatedTickers.length > 0 && (
                  <div className="px-2 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Related</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {aiResponse.relatedTickers.map((ticker) => (
                        <Button
                          key={ticker}
                          variant="secondary"
                          size="sm"
                          onClick={() => handleTickerClick(ticker)}
                          className="h-7 text-xs font-mono font-bold"
                        >
                          {ticker}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up Questions */}
                {aiResponse.suggestedFollowUps && aiResponse.suggestedFollowUps.length > 0 && (
                  <div className="px-2">
                    <div className="flex items-center gap-2 mb-2">
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Ask follow-up</span>
                    </div>
                    <div className="space-y-1">
                      {aiResponse.suggestedFollowUps.map((followUp, i) => (
                        <button
                          key={i}
                          onClick={() => handleFollowUp(followUp)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-muted/30 rounded-lg transition-all"
                        >
                          {followUp}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Processing time */}
                <div className="px-2 mt-3 text-[10px] text-muted-foreground">
                  Processed in {aiResponse.processingTime}ms
                </div>
              </div>
            )}

            {/* AI Mode Hint */}
            {isAIMode && !showAIResponse && !aiSearchMutation.isPending && displayQuery.length > 3 && (
              <div className="mb-4 px-3 py-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 text-sm text-purple-300">
                  <Sparkles className="h-4 w-4" />
                  <span>Press Enter to ask AI about "{displayQuery}"</span>
                </div>
              </div>
            )}

            {/* Loading state for AI */}
            {aiSearchMutation.isPending && (
              <div className="mb-4 px-3 py-6 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                <span className="text-sm text-muted-foreground">AI is analyzing your question...</span>
              </div>
            )}

            {/* Standard Search Results - Show when not in AI response mode */}
            {!showAIResponse && !aiSearchMutation.isPending && (
              <>
                {recentSearches.length > 0 && displayQuery.length === 0 && (
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

                {!isAIMode && (
                  <div>
                    <div className="flex items-center gap-2 px-2 mb-2">
                      <Star className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {displayQuery.length > 0 ? 'Results' : 'Popular'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {results.map((result) => (
                        <div
                          key={result.symbol}
                          className="flex items-center gap-2"
                        >
                          <button
                            onClick={() => handleSelect(result.symbol, result)}
                            className="flex-1 flex items-center gap-3 p-3 rounded-lg hover-elevate transition-all text-left"
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
                                {result.hasIdeas && (
                                  <Badge className="text-[9px] bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                                    <Zap className="h-2 w-2 mr-0.5" /> Trade Idea
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground truncate">
                                {result.name}
                              </div>
                            </div>
                            {result.price != null && (
                              <div className="text-right">
                                <div className="font-mono font-bold">
                                  ${safeToFixed(result.price, 2)}
                                </div>
                                {result.change != null && (
                                  <div className={cn(
                                    "text-xs font-mono flex items-center justify-end gap-1",
                                    result.change >= 0 ? "text-green-400" : "text-red-400"
                                  )}>
                                    {result.change >= 0 ? (
                                      <TrendingUp className="h-3 w-3" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3" />
                                    )}
                                    {result.change >= 0 ? '+' : ''}{safeToFixed(result.change, 2)}%
                                  </div>
                                )}
                              </div>
                            )}
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                          {/* Generate Analysis Button */}
                          {result.type === 'stock' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-10 px-3 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20"
                              onClick={(e) => handleGenerateAnalysis(result.symbol, e)}
                              disabled={analyzingSymbol === result.symbol}
                              title="Generate Trade Thesis"
                            >
                              {analyzingSymbol === result.symbol ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Brain className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

export function HeroSearch() {
  return (
    <div className="space-y-4" data-testid="hero-search-container">
      <GlobalSearch
        variant="hero"
        placeholder="Search stocks or ask anything... 'AAPL analysis', 'what is RSI?'"
        enableAI={true}
      />
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground flex-wrap">
        <span>Try:</span>
        {['NVDA', 'SPY', 'BTC', 'what is RSI?', 'swing trade strategies'].map((item) => (
          <Badge
            key={item}
            variant="secondary"
            className={cn(
              "text-[10px] cursor-pointer hover-elevate",
              item.includes(' ') ? "text-purple-300" : "font-mono font-bold"
            )}
          >
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
