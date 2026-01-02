import { Calendar, Clock } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";

interface TimingDisplayProps {
  timestamp: string;
  label: "Enter When" | "Exit By";
  showCountdown?: boolean;
  className?: string;
}

export function TimingDisplay({ timestamp, label, showCountdown = false, className }: TimingDisplayProps) {
  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const formatted = formatInTimeZone(date, 'America/Chicago', 'MMM d, h:mm a');
      return `${formatted} CST`;
    } catch {
      return "Invalid date";
    }
  };

  const getTimeRemaining = () => {
    try {
      const now = new Date();
      const target = new Date(timestamp);
      const diffMs = target.getTime() - now.getTime();
      
      if (diffMs <= 0) return null;
      
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours}h left`;
      }
      
      return `${hours}h ${minutes}m left`;
    } catch {
      return null;
    }
  };

  const timeRemaining = showCountdown ? getTimeRemaining() : null;
  const isEnterWhen = label === "Enter When";
  const isPast = new Date(timestamp) < new Date();

  return (
    <div 
      className={cn(
        "flex items-start gap-2 px-3 py-2 rounded-md border",
        isEnterWhen 
          ? "bg-cyan-500/5 border-cyan-500/30" 
          : "bg-green-500/5 border-green-500/30",
        isPast && isEnterWhen && "opacity-60",
        className
      )}
      data-testid={`timing-${label.toLowerCase().replace(' ', '-')}`}
    >
      <Calendar className={cn(
        "h-4 w-4 mt-0.5 flex-shrink-0",
        isEnterWhen ? "text-cyan-500" : "text-green-500"
      )} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          isEnterWhen ? "text-cyan-400" : "text-green-400"
        )}>
          {label}:
        </div>
        <div className="text-sm font-medium text-foreground">
          {formatTimestamp(timestamp)}
        </div>
        {showCountdown && timeRemaining && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="tabular-nums">{timeRemaining}</span>
          </div>
        )}
      </div>
    </div>
  );
}
