/**
 * Active Signals List
 * ===================
 * Grid of trade idea cards, sorted by time or confidence.
 * TV signals get purple border prominence.
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

  const visible = showAll ? sorted : sorted.slice(0, 12);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground/70">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Loading signals...
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/70">
        <Clock className="w-5 h-5 mb-2 opacity-40" />
        {isWeekend ? (
          <>
            <p className="text-sm text-muted-foreground">Market closed — showing last week</p>
            <p className="text-xs text-muted-foreground/70 mt-1">New signals generate Monday 9:30 AM CT</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No signals yet today</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Next generation window coming up</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Sort toggle + count — compact toolbar */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-medium text-foreground/70 font-mono">
          <span className="tabular-nums">{ideas.length}</span> Signals
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSortMode('time')}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-md transition-colors font-mono",
              sortMode === 'time' ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
            Recent
          </button>
          <button
            onClick={() => setSortMode('confidence')}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-md transition-colors font-mono",
              sortMode === 'confidence' ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" />
            Best
          </button>
          <button
            onClick={() => onRefresh()}
            className="text-muted-foreground/60 hover:text-muted-foreground p-1 rounded-md hover:bg-muted/40"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Cards grid — tighter gaps */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {visible.map((idea) => (
          <SignalCard key={idea.id || `${idea.symbol}-${idea.timestamp}`} idea={idea} />
        ))}
      </div>

      {/* Show more */}
      {!showAll && sorted.length > 12 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 mt-3 text-[10px] text-muted-foreground hover:text-foreground/80 transition-colors rounded-md hover:bg-muted/20 font-mono"
        >
          +{sorted.length - 12} more
        </button>
      )}
    </div>
  );
}
