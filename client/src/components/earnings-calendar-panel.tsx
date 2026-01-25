import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";
import { format, parseISO, isToday, isTomorrow, addDays, isWithinInterval } from "date-fns";
import { Link } from "wouter";

interface EarningsEvent {
  symbol: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: string | null;
}

export function EarningsCalendarPanel() {
  const { data: earningsData, isLoading } = useQuery<{ earnings: EarningsEvent[] }>({
    queryKey: ["/api/earnings/upcoming"],
    refetchInterval: 3600000,
  });

  const earnings = earningsData?.earnings?.slice(0, 6) || [];

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return { label: "Today", color: "text-red-500 bg-red-500/10" };
    if (isTomorrow(date)) return { label: "Tomorrow", color: "text-amber-500 bg-amber-500/10" };
    const inThisWeek = isWithinInterval(date, { start: new Date(), end: addDays(new Date(), 7) });
    if (inThisWeek) return { label: format(date, "EEE"), color: "text-blue-500 bg-blue-500/10" };
    return { label: format(date, "MMM d"), color: "text-muted-foreground bg-muted" };
  };

  return (
    <Card className="h-full" data-testid="earnings-calendar">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Earnings Calendar
        </CardTitle>
        <Link href="/discover">
          <span className="text-xs text-primary hover:underline cursor-pointer">View All</span>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex justify-between">
                <div className="h-4 bg-muted rounded w-12" />
                <div className="h-4 bg-muted rounded w-16" />
              </div>
            ))}
          </div>
        ) : earnings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No upcoming earnings this week
          </p>
        ) : (
          <div className="space-y-2">
            {earnings.map((event) => {
              const dateInfo = getDateLabel(event.reportDate);
              return (
                <Link key={`${event.symbol}-${event.reportDate}`} href={`/chart-analysis?symbol=${event.symbol}`}>
                  <div 
                    className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    data-testid={`earnings-${event.symbol}`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={dateInfo.color}>
                        {dateInfo.label}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">{event.symbol}</span>
                    </div>
                    {event.estimate && (
                      <span className="text-xs text-muted-foreground">
                        Est: ${event.estimate}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
