import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { TradeIdea, ScreenerFilters as Filters, IdeaSource } from "@shared/schema";
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus } from "lucide-react";
import { format, startOfDay, isSameDay, parseISO } from "date-fns";

export default function TradeIdeasPage() {
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000,
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

  // Filter ideas by search, direction, source, date, and screener filters
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
    
    const matchesDate = !selectedDate || isSameDay(parseISO(idea.timestamp), selectedDate);
    
    const matchesFilters = (!activeFilters.assetType || activeFilters.assetType.includes(idea.assetType));
    
    return matchesSearch && matchesDirection && matchesSource && matchesDate && matchesFilters;
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

            <div className="flex items-center gap-2 flex-wrap">
              {/* Direction Filters */}
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

              {/* Source Filters */}
              <div className="h-6 w-px bg-border mx-1" />
              <Button
                variant={activeSource === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSource("all")}
                data-testid="filter-source-all"
              >
                All Sources
              </Button>
              <Button
                variant={activeSource === "ai" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSource("ai")}
                data-testid="filter-ai"
                className="gap-1"
              >
                <Sparkles className="h-3 w-3" />
                AI
              </Button>
              <Button
                variant={activeSource === "quant" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSource("quant")}
                data-testid="filter-quant"
                className="gap-1"
              >
                <TrendingUpIcon className="h-3 w-3" />
                Quant
              </Button>
              <Button
                variant={activeSource === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveSource("manual")}
                data-testid="filter-manual"
                className="gap-1"
              >
                <UserPlus className="h-3 w-3" />
                Manual
              </Button>

              {/* Calendar */}
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
              <div className="text-sm text-muted-foreground text-center py-4">
                Additional filters coming soon
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
                    <AccordionContent className="px-4 pb-4 space-y-3">
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
            <div className="space-y-3">
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
