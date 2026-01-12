import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { 
  Calendar, ChevronLeft, ChevronRight, 
  TrendingUp, TrendingDown, AlertTriangle, 
  DollarSign, FileText, Beaker, Pill,
  Building2, Rocket, Zap, Clock
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, isSameDay, isToday, addWeeks, subWeeks } from "date-fns";

interface CatalystEvent {
  id: string;
  symbol: string;
  date: Date;
  type: 'earnings' | 'pdufa' | 'phase3' | 'phase2' | 'fda_decision' | 'economic' | 'ipo' | 'dividend' | 'split' | 'other';
  title: string;
  description?: string;
  impact: 'high' | 'medium' | 'low';
  prediction?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
}

const CATALYST_TYPES = {
  earnings: { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  pdufa: { icon: Pill, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  phase3: { icon: Beaker, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  phase2: { icon: Beaker, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  fda_decision: { icon: FileText, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  economic: { icon: Building2, color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
  ipo: { icon: Rocket, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30' },
  dividend: { icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  split: { icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  other: { icon: Calendar, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border' }
};

function getMockCatalysts(): CatalystEvent[] {
  const today = new Date();
  return [
    { id: '1', symbol: 'AAPL', date: today, type: 'earnings', title: 'Q1 Earnings Report', impact: 'high', prediction: { direction: 'bullish', confidence: 72 } },
    { id: '2', symbol: 'NVDA', date: addDays(today, 1), type: 'earnings', title: 'Q4 Earnings Call', impact: 'high', prediction: { direction: 'bullish', confidence: 85 } },
    { id: '3', symbol: 'AQST', date: addDays(today, 2), type: 'pdufa', title: 'FDA PDUFA Date', description: 'Anaphylm - epinephrine film', impact: 'high', prediction: { direction: 'bullish', confidence: 65 } },
    { id: '4', symbol: 'PVLA', date: addDays(today, 3), type: 'phase3', title: 'Phase 3 Results', description: 'QTORIN for lymphatic malformation', impact: 'high', prediction: { direction: 'neutral', confidence: 50 } },
    { id: '5', symbol: 'MRK', date: addDays(today, 4), type: 'phase3', title: 'Phase 3 Readout', description: 'pembrolizumab NSCLC', impact: 'medium' },
    { id: '6', symbol: 'FOMC', date: addDays(today, 5), type: 'economic', title: 'FOMC Meeting', description: 'Interest rate decision', impact: 'high' },
    { id: '7', symbol: 'TSLA', date: addDays(today, 7), type: 'earnings', title: 'Q1 Earnings', impact: 'high', prediction: { direction: 'bearish', confidence: 55 } },
    { id: '8', symbol: 'FBIOP', date: addDays(today, 10), type: 'pdufa', title: 'FDA Decision', description: 'CUTX-101 Wilson\'s disease', impact: 'high', prediction: { direction: 'bullish', confidence: 70 } },
  ];
}

function CatalystEventCard({ event }: { event: CatalystEvent }) {
  const typeConfig = CATALYST_TYPES[event.type];
  const Icon = typeConfig.icon;
  
  return (
    <div className={cn(
      "p-3 rounded-lg border transition-all hover-elevate",
      typeConfig.bg, typeConfig.border
    )} data-testid={`event-${event.id}`}>
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg", typeConfig.bg)}>
          <Icon className={cn("h-4 w-4", typeConfig.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold font-mono text-sm">{event.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-semibold uppercase",
              event.impact === 'high' && "bg-red-500/10 text-red-400 border-red-500/30",
              event.impact === 'medium' && "bg-amber-500/10 text-amber-400 border-amber-500/30",
              event.impact === 'low' && "bg-muted/20 text-muted-foreground"
            )}>
              {event.impact}
            </Badge>
          </div>
          <div className="text-sm font-medium mt-1">{event.title}</div>
          {event.description && (
            <div className="text-xs text-muted-foreground mt-0.5">{event.description}</div>
          )}
          {event.prediction && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className={cn(
                "text-[10px] font-semibold gap-1",
                event.prediction.direction === 'bullish' && "bg-green-500/10 text-green-400 border-green-500/30",
                event.prediction.direction === 'bearish' && "bg-red-500/10 text-red-400 border-red-500/30",
                event.prediction.direction === 'neutral' && "bg-amber-500/10 text-amber-400 border-amber-500/30"
              )}>
                {event.prediction.direction === 'bullish' && <TrendingUp className="h-2.5 w-2.5" />}
                {event.prediction.direction === 'bearish' && <TrendingDown className="h-2.5 w-2.5" />}
                ML: {event.prediction.confidence}%
              </Badge>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">
            {format(event.date, 'MMM d')}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {format(event.date, 'EEE')}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekView({ currentDate, events }: { currentDate: Date; events: CatalystEvent[] }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const dayEvents = events.filter(e => isSameDay(e.date, day));
        const today = isToday(day);
        
        return (
          <div 
            key={day.toISOString()} 
            className={cn(
              "min-h-[120px] p-2 rounded-lg border",
              today && "bg-primary/5 border-primary/30",
              !today && "bg-muted/10 border-border/30"
            )}
          >
            <div className={cn(
              "text-xs font-semibold mb-2",
              today && "text-primary"
            )}>
              <div className="uppercase tracking-wide">{format(day, 'EEE')}</div>
              <div className="text-lg font-bold">{format(day, 'd')}</div>
            </div>
            <div className="space-y-1">
              {dayEvents.slice(0, 3).map((event) => {
                const typeConfig = CATALYST_TYPES[event.type];
                const Icon = typeConfig.icon;
                return (
                  <Tooltip key={event.id}>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "flex items-center gap-1 p-1 rounded text-[10px] cursor-pointer hover-elevate",
                        typeConfig.bg
                      )}>
                        <Icon className={cn("h-3 w-3", typeConfig.color)} />
                        <span className="font-mono font-bold truncate">{event.symbol}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div className="space-y-1">
                        <div className="font-semibold">{event.symbol} - {event.title}</div>
                        {event.description && <div className="text-xs">{event.description}</div>}
                        {event.prediction && (
                          <div className="text-xs">
                            ML Prediction: {event.prediction.direction} ({event.prediction.confidence}%)
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-muted-foreground">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CatalystCalendar({ compact = false }: { compact?: boolean }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'week' | 'list'>('list');
  
  const events = getMockCatalysts();
  const upcomingEvents = events.filter(e => e.date >= new Date()).sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const thisWeekEvents = events.filter(e => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    return e.date >= weekStart && e.date <= weekEnd;
  });

  if (compact) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="widget-catalyst-calendar">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Upcoming Catalysts
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {upcomingEvents.length} events
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcomingEvents.slice(0, 5).map((event) => (
            <CatalystEventCard key={event.id} event={event} />
          ))}
          {upcomingEvents.length > 5 && (
            <Button variant="ghost" size="sm" className="w-full text-xs">
              View All {upcomingEvents.length} Events
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="catalyst-calendar-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Catalyst Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
              data-testid="button-prev-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d')} - {format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={view} onValueChange={(v) => setView(v as 'week' | 'list')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" data-testid="tab-list-view">
              <Clock className="h-4 w-4 mr-2" />
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="week" data-testid="tab-week-view">
              <Calendar className="h-4 w-4 mr-2" />
              Week View
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {upcomingEvents.map((event) => (
                  <CatalystEventCard key={event.id} event={event} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="week" className="mt-4">
            <WeekView currentDate={currentDate} events={events} />
          </TabsContent>
        </Tabs>
        
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
          {Object.entries(CATALYST_TYPES).slice(0, 6).map(([type, config]) => {
            const Icon = config.icon;
            return (
              <Badge key={type} variant="outline" className={cn("text-[10px] gap-1", config.bg, config.border)}>
                <Icon className={cn("h-2.5 w-2.5", config.color)} />
                {type.replace('_', ' ')}
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
