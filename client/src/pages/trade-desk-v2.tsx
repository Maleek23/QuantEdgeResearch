/**
 * Trade Desk v2
 * =============
 * Clean, focused trading dashboard.
 * Watchlist sidebar + Signal feed + Performance.
 * Replaces the 3,908-line monolith.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Activity, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradeDeskData } from "@/components/trade-desk/useTradeDeskData";
import WatchlistSidebar from "@/components/trade-desk/WatchlistSidebar";
import TimeframeTabs from "@/components/trade-desk/TimeframeTabs";
import ActiveSignalsList from "@/components/trade-desk/ActiveSignalsList";
import PerformanceStrip from "@/components/trade-desk/PerformanceStrip";
import type { Timeframe } from "@/components/trade-desk/constants";

export default function TradeDesk() {
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [maxContractCost] = useState<number>(10000); // TODO: make configurable

  const {
    ideas,
    watchlist,
    performance,
    closedTrades,
    ideaCounts,
    isLoading,
    refetch,
    isWeekend,
  } = useTradeDeskData({ timeframe, selectedSymbol, maxContractCost });

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <div className="border-b border-slate-800/40 px-4 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">Trade Desk</h1>
              <p className="text-[10px] text-slate-600">
                {isWeekend ? 'Weekend — showing last week' : 'Live signals from your watchlist'}
              </p>
            </div>
          </div>

          <TimeframeTabs active={timeframe} onChange={setTimeframe} counts={ideaCounts} />
        </div>
      </div>

      {/* Main layout */}
      <div className="max-w-[1400px] mx-auto flex">
        {/* Sidebar — hidden on mobile, shown on lg+ */}
        <div className="hidden lg:block">
          <WatchlistSidebar
            watchlist={watchlist}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Selected symbol indicator */}
          {selectedSymbol && (
            <div className="px-3 py-1.5 bg-slate-800/30 border-b border-slate-800/40 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Showing signals for <span className="text-white font-mono font-bold">{selectedSymbol}</span>
              </span>
              <button
                onClick={() => setSelectedSymbol(null)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300"
              >
                Show all
              </button>
            </div>
          )}

          {/* Signal feed */}
          <ActiveSignalsList
            ideas={ideas}
            isLoading={isLoading}
            isWeekend={isWeekend}
            onRefresh={refetch}
          />

          {/* Performance */}
          <PerformanceStrip
            performance={performance}
            closedTrades={closedTrades}
          />
        </div>
      </div>
    </div>
  );
}
