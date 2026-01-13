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
          color: "text-red-400",
          bg: "bg-red-500/20",
          border: "border-red-500/40",
          dots: 3,
        };
      case "medium":
        return {
          color: "text-amber-400",
          bg: "bg-amber-500/20",
          border: "border-amber-500/40",
          dots: 2,
        };
      default:
        return {
          color: "text-slate-400",
          bg: "bg-slate-500/20",
          border: "border-slate-500/40",
          dots: 1,
        };
    }
  };

  const upcomingEvents = events.filter((e) => e.isUpcoming).slice(0, 5);
  const recentEvents = events.filter((e) => !e.isUpcoming).slice(0, 3);

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-slate-400">
            Economic Calendar
          </span>
        </div>
        <span className="text-xs text-slate-500">Today</span>
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
                    <span className="text-sm text-slate-200 truncate max-w-[140px]">
                      {event.name}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
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
          <span className="text-xs text-slate-500 mb-2 block">Recent</span>
          <div className="space-y-2">
            {recentEvents.map((event) => {
              const config = getImpactConfig(event.impact);
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-2 rounded bg-slate-800/30"
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
                    <span className="text-sm text-slate-400 truncate max-w-[100px]">
                      {event.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-mono",
                      event.actual && event.forecast &&
                        parseFloat(event.actual) > parseFloat(event.forecast)
                        ? "text-green-400"
                        : event.actual && event.forecast &&
                            parseFloat(event.actual) < parseFloat(event.forecast)
                          ? "text-red-400"
                          : "text-slate-300"
                    )}>
                      {event.actual ?? "—"}
                    </span>
                    <span className="text-xs text-slate-500">
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
        <div className="flex flex-col items-center justify-center py-6 text-slate-500">
          <Calendar className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No events today</span>
        </div>
      )}
    </div>
  );
}
