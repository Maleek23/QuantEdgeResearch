import { cn } from "@/lib/utils";
import { Calendar, AlertTriangle, Clock } from "lucide-react";

type ImpactLevel = "high" | "medium" | "low";

interface EconomicEvent {
  id: string;
  name: string;
  time: string;
  impact: ImpactLevel;
  actual?: string;
  forecast?: string;
  previous?: string;
  isUpcoming: boolean;
}

interface EconomicCalendarWidgetProps {
  events: EconomicEvent[];
  className?: string;
}

export function EconomicCalendarWidget({ events, className }: EconomicCalendarWidgetProps) {
  const getImpactConfig = (impact: ImpactLevel) => {
    switch (impact) {
      case "high":
        return {
          color: "text-[var(--trade-bearish)]",
          bg: "bg-[var(--trade-bearish)]/20",
          border: "border-[var(--trade-bearish)]/40",
          dots: 3,
        };
      case "medium":
        return {
          color: "text-[var(--trade-neutral)]",
          bg: "bg-[var(--trade-neutral)]/20",
          border: "border-[var(--trade-neutral)]/40",
          dots: 2,
        };
      default:
        return {
          color: "text-muted-foreground",
          bg: "bg-muted-foreground/20",
          border: "border-muted-foreground/40",
          dots: 1,
        };
    }
  };

  const upcomingEvents = events.filter((e) => e.isUpcoming).slice(0, 5);
  const recentEvents = events.filter((e) => !e.isUpcoming).slice(0, 3);

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Economic Calendar
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Today</span>
      </div>

      {upcomingEvents.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-2">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span className="text-xs text-cyan-400 font-medium">Upcoming</span>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const config = getImpactConfig(event.impact);
              return (
                <div
                  key={event.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded border",
                    config.bg,
                    config.border
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[...Array(config.dots)].map((_, i) => (
                        <div
                          key={i}
                          className={cn("w-1.5 h-1.5 rounded-full", config.color.replace("text-", "bg-"))}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-foreground/90 truncate max-w-[140px]">
                      {event.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {event.time}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recentEvents.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground mb-2 block">Recent</span>
          <div className="space-y-2">
            {recentEvents.map((event) => {
              const config = getImpactConfig(event.impact);
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[...Array(config.dots)].map((_, i) => (
                        <div
                          key={i}
                          className={cn("w-1.5 h-1.5 rounded-full opacity-50", config.color.replace("text-", "bg-"))}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground truncate max-w-[100px]">
                      {event.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-mono",
                      event.actual && event.forecast &&
                        parseFloat(event.actual) > parseFloat(event.forecast)
                        ? "text-[var(--trade-bullish)]"
                        : event.actual && event.forecast &&
                            parseFloat(event.actual) < parseFloat(event.forecast)
                          ? "text-[var(--trade-bearish)]"
                          : "text-foreground/80"
                    )}>
                      {event.actual ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      vs {event.forecast ?? "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Calendar className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No events today</span>
        </div>
      )}
    </div>
  );
}
