/**
 * Timeframe Tabs
 * ==============
 * 4 buttons: 0DTE / Weekly / Swing / All with count badges.
 */

import { cn } from "@/lib/utils";
import { TIMEFRAME_LABELS, type Timeframe } from "./constants";

interface Props {
  active: Timeframe;
  onChange: (tf: Timeframe) => void;
  counts: Record<Timeframe, number>;
}

const TABS: Timeframe[] = ['0dte', 'weekly', 'swing', 'all'];

export default function TimeframeTabs({ active, onChange, counts }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {TABS.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={cn(
            "px-2 py-1 rounded-md text-[10px] font-medium transition-all font-mono",
            active === tf
              ? "bg-foreground/10 text-foreground ring-1 ring-foreground/15"
              : "text-muted-foreground hover:text-foreground/80 hover:bg-foreground/[0.04]"
          )}
        >
          {TIMEFRAME_LABELS[tf]}
          <span className={cn(
            "ml-1 text-[9px] tabular-nums",
            active === tf ? "text-foreground/70" : "text-muted-foreground/60"
          )}>
            {counts[tf]}
          </span>
        </button>
      ))}
    </div>
  );
}
