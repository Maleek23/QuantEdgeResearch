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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TradeIdea, ScreenerFilters as Filters, IdeaSource } from "@shared/schema";
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus, BarChart3, LayoutGrid, List } from "lucide-react";
import { format, startOfDay, isSameDay, parseISO } from "date-fns";

export default function TradeIdeasPage() {
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [activeAssetType, setActiveAssetType] = useState<"all" | "stock" | "option" | "crypto">("all");
  const [activeGrade, setActiveGrade] = useState<"all" | "A" | "B" | "C">("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const { toast } = useToast();

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000,
  });

  // Generate Quant Ideas mutation
  const generateQuantIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quant/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
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

  // Group by date
  const groupedIdeas = filteredIdeas.reduce((acc, idea) => {
    const date = format(parseISO(idea.timestamp), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(idea);
    return acc;
  }, {} as Record<string, TradeIdea[]>);

  // Get dates with ideas for calendar highlighting
  const datesWithIdeas = tradeIdeas.map(idea => startOfDay(parseISO(idea.timestamp)));

  const newIdeasCount = filteredIdeas.filter(idea => {
    const ideaDate = parseISO(idea.timestamp);
    const now = new Date();
    return (now.getTime() - ideaDate.getTime()) < 3600000;
  }).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Trade Ideas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Research-grade opportunities across stocks, options, and crypto
          </p>
        </div>
        <div className="flex items-center gap-2">
          {newIdeasCount > 0 && (
            <Badge variant="default" className="animate-pulse" data-testid="badge-new-ideas">
              {newIdeasCount} NEW
            </Badge>
          )}
          <Button 
            onClick={() => generateQuantIdeas.mutate()}
            disabled={generateQuantIdeas.isPending}
            size="sm"
            className="gap-2"
            data-testid="button-generate-quant-ideas"
          >
            <BarChart3 className="h-4 w-4" />
            {generateQuantIdeas.isPending ? "Generating..." : "Generate Quant"}
          </Button>
          <Button 
            onClick={() => generateAIIdeas.mutate()}
            disabled={generateAIIdeas.isPending}
            size="sm"
            variant="outline"
            className="gap-2"
            data-testid="button-generate-ai-ideas"
          >
            <Sparkles className="h-4 w-4" />
            {generateAIIdeas.isPending ? "Generating..." : "Generate AI"}
          </Button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
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

            <div className="flex items-center gap-2">
              {/* Asset Type Dropdown */}
              <Select value={activeAssetType} onValueChange={(value: any) => setActiveAssetType(value)}>
                <SelectTrigger className="w-[130px] h-9" data-testid="select-asset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assets</SelectItem>
                  <SelectItem value="stock">Shares</SelectItem>
                  <SelectItem value="option">Options</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                </SelectContent>
              </Select>

              {/* Source Dropdown */}
              <Select value={activeSource} onValueChange={(value: any) => setActiveSource(value)}>
                <SelectTrigger className="w-[130px] h-9" data-testid="select-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="quant">Quant</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>

              {/* Grade Dropdown */}
              <Select value={activeGrade} onValueChange={(value: any) => setActiveGrade(value)}>
                <SelectTrigger className="w-[120px] h-9" data-testid="select-grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  <SelectItem value="A">Grade A</SelectItem>
                  <SelectItem value="B">Grade B</SelectItem>
                  <SelectItem value="C">Grade C</SelectItem>
                </SelectContent>
              </Select>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 ml-1">
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  data-testid="button-view-grid"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Advanced Filters Collapsible */}
        <CardContent className="pt-0">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full" data-testid="button-advanced-filters">
                <TrendingUp className="h-4 w-4 mr-2" />
                Advanced Filters
                <ChevronDown className="h-4 w-4 ml-auto" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Direction Filters */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Direction:</span>
                  <Button
                    variant={activeDirection === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("all")}
                    data-testid="filter-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={activeDirection === "long" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("long")}
                    data-testid="filter-long"
                  >
                    Long
                  </Button>
                  <Button
                    variant={activeDirection === "short" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("short")}
                    data-testid="filter-short"
                  >
                    Short
                  </Button>
                  <Button
                    variant={activeDirection === "day_trade" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("day_trade")}
                    data-testid="filter-daytrade"
                  >
                    Day Trade
                  </Button>
                </div>

                {/* Date Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Date:</span>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-calendar">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {selectedDate ? format(selectedDate, "MMM d") : "All Dates"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
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
                            Clear Date Filter
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Trade Ideas Feed */}
      <Tabs defaultValue="new" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new" data-testid="tab-new-ideas">
            NEW IDEAS {filteredIdeas.filter(i => i.outcomeStatus === 'open').length > 0 && `(${filteredIdeas.filter(i => i.outcomeStatus === 'open').length})`}
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-archived-ideas">
            ARCHIVED {filteredIdeas.filter(i => i.outcomeStatus !== 'open').length > 0 && `(${filteredIdeas.filter(i => i.outcomeStatus !== 'open').length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
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
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([date, ideas]) => (
                  <AccordionItem key={date} value={date} className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-date-${date}`}>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{format(parseISO(date), "EEEE, MMMM d, yyyy")}</span>
                        <Badge variant="outline" data-testid={`badge-count-${date}`}>
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
                            isExpanded={expandedIdeaId === idea.id}
                            onToggleExpand={() => handleToggleExpand(idea.id)}
                            data-testid={`idea-card-${idea.id}`}
                          />
                        ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
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
