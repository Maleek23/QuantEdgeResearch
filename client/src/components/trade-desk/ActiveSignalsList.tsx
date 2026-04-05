/**
 * Active Signals List
 * ===================
 * Main signal feed, sorted newest first.
 * TV signals get visual prominence (purple left border).
 */

import { useState } from "react";
import { RefreshCw, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeIdea } from "@shared/schema";
import SignalCard from "./SignalCard";

interface Props {
  ideas: TradeIdea[];
  isLoading: boolean;
  isWeekend: boolean;
  onRefresh: () => void;
}

type SortMode = 'time' | 'confidence';

export default function ActiveSignalsList({ ideas, isLoading, isWeekend, onRefresh }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('time');
  const [showAll, setShowAll] = useState(false);

  const sorted = [...ideas].sort((a, b) => {
    if (sortMode === 'confidence') {
      return ((b as any).confidenceScore || 0) - ((a as any).confidenceScore || 0);
    }
    return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
  });

  const visible = showAll ? sorted : sorted.slice(0, 20);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-600">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading signals...
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-600">
        <Clock className="w-5 h-5 mb-2 opacity-40" />
        {isWeekend ? (
          <>
            <p className="text-sm text-slate-500">Market closed — showing last week</p>
            <p className="text-xs text-slate-600 mt-1">New signals generate Monday 9:30 AM CT</p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-500">No signals yet today</p>
            <p className="text-xs text-slate-600 mt-1">Next generation window coming up</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Sort toggle + count */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/40">
        <span className="text-xs text-slate-500">{ideas.length} signals</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSortMode('time')}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded transition-colors",
              sortMode === 'time' ? "text-white bg-slate-700" : "text-slate-600 hover:text-slate-400"
            )}
          >
            <Clock className="w-3 h-3 inline mr-0.5" />
            Recent
          </button>
          <button
            onClick={() => setSortMode('confidence')}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded transition-colors",
              sortMode === 'confidence' ? "text-white bg-slate-700" : "text-slate-600 hover:text-slate-400"
            )}
          >
            <TrendingUp className="w-3 h-3 inline mr-0.5" />
            Best
          </button>
          <button
            onClick={() => onRefresh()}
            className="text-slate-600 hover:text-slate-400 ml-2 p-1"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Signal cards */}
      <div className="divide-y divide-slate-800/30">
        {visible.map((idea) => (
          <SignalCard key={idea.id || `${idea.symbol}-${idea.timestamp}`} idea={idea} />
        ))}
      </div>

      {/* Show more */}
      {!showAll && sorted.length > 20 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Show {sorted.length - 20} more
        </button>
      )}
    </div>
  );
}
