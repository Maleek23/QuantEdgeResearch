import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TradeIdea, ScreenerFilters as Filters, IdeaSource, MarketData } from "@shared/schema";
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus, BarChart3, LayoutGrid, List, Filter, SlidersHorizontal, CalendarClock } from "lucide-react";
import { format, startOfDay, isSameDay, parseISO, subHours } from "date-fns";
import { isWeekend, getNextTradingWeekStart } from "@/lib/utils";

export default function TradeIdeasPage() {
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [activeAssetType, setActiveAssetType] = useState<"stock" | "option" | "crypto" | "all">("all");
  const [activeGrade, setActiveGrade] = useState<"all" | "A" | "B" | "C">("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const { toast } = useToast();

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 30000, // Faster refresh: 30s instead of 60s
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch market data for real-time prices
  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 30000, // Refresh every 30 seconds for live prices
  });

  // Create a map of symbol to current price
  const priceMap = marketData.reduce((acc, data) => {
    acc[data.symbol] = data.currentPrice;
    return acc;
  }, {} as Record<string, number>);

  // Generate Quant Ideas mutation
  const generateQuantIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quant/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Quant Ideas Generated",
        description: `Generated ${data.count || data.newIdeas || 0} new quantitative trade ideas`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate quant ideas",
        variant: "destructive"
      });
    }
  });

  // Generate AI Ideas mutation
  const generateAIIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "AI Ideas Generated",
        description: `Generated ${data.count || 0} new AI-powered trade ideas`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI ideas",
        variant: "destructive"
      });
    }
  });

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setCalendarOpen(false);
  };

  const handleToggleExpand = (ideaId: string) => {
    setExpandedIdeaId(expandedIdeaId === ideaId ? null : ideaId);
  };

  const handleCollapseAll = () => {
    setExpandedIdeaId(null);
  };

  // Filter ideas by search, direction, source, asset type, grade, date, and screener filters
  const filteredIdeas = tradeIdeas.filter(idea => {
    const matchesSearch = !tradeIdeaSearch || 
      idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
      idea.catalyst.toLowerCase().includes(tradeIdeaSearch.toLowerCase());
    
    // Check if it's a day trade based on sessionContext containing "day"
    const isDayTrade = idea.sessionContext?.toLowerCase().includes('day') || false;
    const matchesDirection = activeDirection === "all" || 
      (activeDirection === "day_trade" && isDayTrade) ||
      (activeDirection !== "day_trade" && idea.direction === activeDirection);
    
    const matchesSource = activeSource === "all" || idea.source === activeSource;
    
    const matchesAssetType = activeAssetType === "all" || idea.assetType === activeAssetType;
    
    const matchesGrade = activeGrade === "all" || idea.probabilityBand?.startsWith(activeGrade) || false;
    
    const matchesDate = !selectedDate || isSameDay(parseISO(idea.timestamp), selectedDate);
    
    const matchesFilters = (!activeFilters.assetType || activeFilters.assetType.includes(idea.assetType));
    
    return matchesSearch && matchesDirection && matchesSource && matchesAssetType && matchesGrade && matchesDate && matchesFilters;
  });

  // Group by asset type
  const groupedIdeas = filteredIdeas.reduce((acc, idea) => {
    const assetType = idea.assetType;
    if (!acc[assetType]) acc[assetType] = [];
    acc[assetType].push(idea);
    return acc;
  }, {} as Record<string, TradeIdea[]>);

  // Get dates with ideas for calendar highlighting
  const datesWithIdeas = tradeIdeas.map(idea => startOfDay(parseISO(idea.timestamp)));

  // Helper function to check if an idea is fresh (created within last 2 hours)
  // Day trading requires very fresh data - timing windows expire quickly
  const isFreshIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const cutoffTime = subHours(new Date(), 2); // 2 hours ago - prevents stale timing data
    return ideaDate >= cutoffTime && idea.outcomeStatus === 'open';
  };

  // Count fresh ideas (last 2h) - day trading window
  const newIdeasCount = filteredIdeas.filter(isFreshIdea).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Aurora Hero */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative flex items-center justify-between gap-4 pt-6">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-gradient-premium" data-testid="text-page-title">Trade Ideas</h1>
              <span className="text-sm font-medium text-muted-foreground hidden md:inline" data-testid="text-current-date">
                {format(new Date(), 'EEEE, MMM d')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Stocks, options, crypto opportunities
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {newIdeasCount > 0 && (
              <Badge variant="default" className="animate-pulse neon-accent badge-shimmer" data-testid="badge-new-ideas">
                {newIdeasCount} NEW
              </Badge>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Weekend Notice Banner - Smart helper instead of duplicate feed */}
      {isWeekend() && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5" data-testid="weekend-preview-section">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Markets open {format(getNextTradingWeekStart(), 'EEEE, MMM d')} at 9:30 AM CT</p>
                  <p className="text-xs text-muted-foreground">
                    {tradeIdeas.filter(i => i.outcomeStatus === 'open').length > 0 
                      ? `${tradeIdeas.filter(i => i.outcomeStatus === 'open').length} ideas ready for next week`
                      : "Generate crypto ideas (24/7 trading) for immediate opportunities"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={activeAssetType} onValueChange={(value: any) => setActiveAssetType(value)}>
                  <SelectTrigger className="w-[160px] h-9" data-testid="select-weekend-asset-filter">
                    <SelectValue placeholder="Filter by asset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assets</SelectItem>
                    <SelectItem value="stock">Stock Shares</SelectItem>
                    <SelectItem value="option">Stock Options</SelectItem>
                    <SelectItem value="crypto">Crypto (24/7)</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => generateQuantIdeas.mutate()}
                  disabled={generateQuantIdeas.isPending}
                  size="sm"
                  className="gap-1.5"
                  data-testid="button-generate-quant-ideas"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">{generateQuantIdeas.isPending ? "Generating..." : "Quant"}</span>
                  <span className="sm:hidden">{generateQuantIdeas.isPending ? "..." : "Q"}</span>
                </Button>
                <Button 
                  onClick={() => generateAIIdeas.mutate()}
                  disabled={generateAIIdeas.isPending}
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  data-testid="button-generate-ai-ideas"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="hidden sm:inline">{generateAIIdeas.isPending ? "Generating..." : "AI"}</span>
                  <span className="sm:hidden">{generateAIIdeas.isPending ? "..." : "A"}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simplified Filter Bar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search symbols or catalysts..."
            value={tradeIdeaSearch}
            onChange={(e) => setTradeIdeaSearch(e.target.value)}
            className="pl-10 pr-10"
            data-testid="input-search-ideas"
          />
          {tradeIdeaSearch && (
            <button
              type="button"
              onClick={() => setTradeIdeaSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Generate Ideas Buttons - Always Available */}
        <Button 
          onClick={() => generateQuantIdeas.mutate()}
          disabled={generateQuantIdeas.isPending}
          size="sm"
          className="gap-1.5"
          data-testid="button-generate-quant-permanent"
        >
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">{generateQuantIdeas.isPending ? "Generating..." : "Quant"}</span>
          <span className="sm:hidden">{generateQuantIdeas.isPending ? "..." : "Q"}</span>
        </Button>
        <Button 
          onClick={() => generateAIIdeas.mutate()}
          disabled={generateAIIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5"
          data-testid="button-generate-ai-permanent"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">{generateAIIdeas.isPending ? "Generating..." : "AI"}</span>
          <span className="sm:hidden">{generateAIIdeas.isPending ? "..." : "A"}</span>
        </Button>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-8 px-3"
            data-testid="button-view-list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className="h-8 px-3"
            data-testid="button-view-grid"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default" className="gap-2" data-testid="button-filters">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {(activeAssetType !== "all" || activeSource !== "all" || activeGrade !== "all" || activeDirection !== "all" || selectedDate) && (
                <Badge variant="secondary" className="ml-1">
                  {[activeAssetType !== "all", activeSource !== "all", activeGrade !== "all", activeDirection !== "all", selectedDate].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-3">Filter Trade Ideas</h4>
              </div>

              {/* Asset Type */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Asset Type</Label>
                <Select value={activeAssetType} onValueChange={(value: any) => setActiveAssetType(value)}>
                  <SelectTrigger data-testid="select-asset-type-popover">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Asset Types</SelectItem>
                    <SelectItem value="stock">Stock Shares</SelectItem>
                    <SelectItem value="option">Stock Options</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Source */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Source</Label>
                <Select value={activeSource} onValueChange={(value: any) => setActiveSource(value)}>
                  <SelectTrigger data-testid="select-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="ai">AI Generated</SelectItem>
                    <SelectItem value="quant">Quantitative</SelectItem>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Grade */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Quality Grade</Label>
                <Select value={activeGrade} onValueChange={(value: any) => setActiveGrade(value)}>
                  <SelectTrigger data-testid="select-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    <SelectItem value="A">Grade A (High Confidence)</SelectItem>
                    <SelectItem value="B">Grade B (Medium Confidence)</SelectItem>
                    <SelectItem value="C">Grade C (Lower Confidence)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Direction */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Direction</Label>
                <div className="flex gap-2">
                  <Button
                    variant={activeDirection === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("all")}
                    className="flex-1"
                    data-testid="filter-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={activeDirection === "long" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("long")}
                    className="flex-1"
                    data-testid="filter-long"
                  >
                    Long
                  </Button>
                  <Button
                    variant={activeDirection === "short" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("short")}
                    className="flex-1"
                    data-testid="filter-short"
                  >
                    Short
                  </Button>
                  <Button
                    variant={activeDirection === "day_trade" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("day_trade")}
                    className="flex-1"
                    data-testid="filter-daytrade"
                  >
                    Day
                  </Button>
                </div>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Date</Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start" data-testid="button-calendar">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {selectedDate ? format(selectedDate, "MMM d, yyyy") : "All Dates"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      modifiers={{ hasIdeas: datesWithIdeas }}
                      modifiersClassNames={{ hasIdeas: "bg-primary/10 font-bold" }}
                      data-testid="calendar-filter"
                    />
                    {selectedDate && (
                      <div className="p-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setSelectedDate(undefined);
                            setCalendarOpen(false);
                          }}
                          data-testid="button-clear-date"
                        >
                          Clear Date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Trade Ideas Feed */}
      <Tabs defaultValue="fresh" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fresh" data-testid="tab-fresh-ideas" className="gap-1.5">
            <span className="hidden sm:inline">FRESH</span>
            <span className="sm:hidden">NEW</span>
            {filteredIdeas.filter(isFreshIdea).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {filteredIdeas.filter(isFreshIdea).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active-ideas" className="gap-1.5">
            <span className="hidden sm:inline">ACTIVE</span>
            <span className="sm:hidden">ALL</span>
            {filteredIdeas.filter(i => i.outcomeStatus === 'open').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {filteredIdeas.filter(i => i.outcomeStatus === 'open').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-archived-ideas" className="gap-1.5">
            <span className="hidden sm:inline">ARCHIVED</span>
            <span className="sm:hidden">OLD</span>
            {filteredIdeas.filter(i => i.outcomeStatus !== 'open').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {filteredIdeas.filter(i => i.outcomeStatus !== 'open').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fresh" className="space-y-4">
          {ideasLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
              ))}
            </div>
          ) : filteredIdeas.filter(isFreshIdea).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No fresh trade ideas</p>
                <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                  {tradeIdeas.length === 0 
                    ? "Generate new ideas to get started" 
                    : "Fresh ideas appear here within 2 hours of generation"}
                </p>
                {!isWeekend() && (
                  <div className="flex items-center gap-2 mt-2">
                    <Button 
                      onClick={() => generateQuantIdeas.mutate()}
                      disabled={generateQuantIdeas.isPending}
                      size="sm"
                      className="gap-1.5"
                      data-testid="button-generate-quant-ideas"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="hidden sm:inline">{generateQuantIdeas.isPending ? "Generating..." : "Quant"}</span>
                      <span className="sm:hidden">{generateQuantIdeas.isPending ? "..." : "Q"}</span>
                    </Button>
                    <Button 
                      onClick={() => generateAIIdeas.mutate()}
                      disabled={generateAIIdeas.isPending}
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      data-testid="button-generate-ai-ideas"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span className="hidden sm:inline">{generateAIIdeas.isPending ? "Generating..." : "AI"}</span>
                      <span className="sm:hidden">{generateAIIdeas.isPending ? "..." : "A"}</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {Object.entries(groupedIdeas)
                .filter(([, ideas]) => ideas.some(isFreshIdea))
                .sort(([a], [b]) => {
                  const order = { 'stock': 0, 'option': 1, 'crypto': 2 };
                  return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
                })
                .map(([assetType, ideas]) => {
                  const assetTypeLabels = {
                    'stock': 'Stock Shares',
                    'option': 'Stock Options', 
                    'crypto': 'Crypto'
                  };
                  const label = assetTypeLabels[assetType as keyof typeof assetTypeLabels] || assetType;
                  
                  return (
                    <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                      <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{label}</span>
                          <Badge variant="outline" className="animate-pulse badge-shimmer" data-testid={`badge-count-${assetType}`}>
                            {ideas.filter(isFreshIdea).length} fresh
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className={`px-4 pb-4 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' : 'space-y-3'}`}>
                        {ideas
                          .filter(isFreshIdea)
                          .map(idea => (
                            <TradeIdeaBlock
                              key={idea.id}
                              idea={idea}
                              currentPrice={priceMap[idea.symbol]}
                              isExpanded={expandedIdeaId === idea.id}
                              onToggleExpand={() => handleToggleExpand(idea.id)}
                              data-testid={`idea-card-${idea.id}`}
                            />
                          ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {ideasLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
              ))}
            </div>
          ) : filteredIdeas.filter(i => i.outcomeStatus === 'open').length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No active trade ideas</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {tradeIdeas.length === 0 
                    ? "Generate quantitative ideas to get started" 
                    : "Try adjusting your filters"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {Object.entries(groupedIdeas)
                .filter(([, ideas]) => ideas.some(i => i.outcomeStatus === 'open'))
                .sort(([a], [b]) => {
                  const order = { 'stock': 0, 'option': 1, 'crypto': 2 };
                  return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
                })
                .map(([assetType, ideas]) => {
                  const assetTypeLabels = {
                    'stock': 'Stock Shares',
                    'option': 'Stock Options', 
                    'crypto': 'Crypto'
                  };
                  const label = assetTypeLabels[assetType as keyof typeof assetTypeLabels] || assetType;
                  
                  return (
                    <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                      <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{label}</span>
                          <Badge variant="outline" data-testid={`badge-count-${assetType}`}>
                            {ideas.filter(i => i.outcomeStatus === 'open').length} ideas
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className={`px-4 pb-4 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' : 'space-y-3'}`}>
                        {ideas
                          .filter(i => i.outcomeStatus === 'open')
                          .map(idea => (
                            <TradeIdeaBlock
                              key={idea.id}
                              idea={idea}
                              currentPrice={priceMap[idea.symbol]}
                              isExpanded={expandedIdeaId === idea.id}
                              onToggleExpand={() => handleToggleExpand(idea.id)}
                              data-testid={`idea-card-${idea.id}`}
                            />
                          ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="archived" className="space-y-4">
          {filteredIdeas.filter(i => i.outcomeStatus !== 'open').length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No archived ideas</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Completed trades will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3' : 'space-y-3'}>
              {filteredIdeas
                .filter(i => i.outcomeStatus !== 'open')
                .map(idea => (
                  <TradeIdeaBlock
                    key={idea.id}
                    idea={idea}
                    currentPrice={priceMap[idea.symbol]}
                    isExpanded={expandedIdeaId === idea.id}
                    onToggleExpand={() => handleToggleExpand(idea.id)}
                    data-testid={`archived-idea-card-${idea.id}`}
                  />
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
