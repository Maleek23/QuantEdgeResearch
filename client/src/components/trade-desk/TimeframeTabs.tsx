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
    <div className="flex items-center gap-1">
      {TABS.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            active === tf
              ? "bg-white/10 text-white ring-1 ring-white/20"
              : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
          )}
        >
          {TIMEFRAME_LABELS[tf]}
          <span className={cn(
            "ml-1.5 text-[10px]",
            active === tf ? "text-slate-300" : "text-slate-600"
          )}>
            {counts[tf]}
          </span>
        </button>
      ))}
    </div>
  );
}
