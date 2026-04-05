/**
 * Watchlist Sidebar
 * =================
 * Always-visible sidebar showing user's tiered watchlist with live prices.
 * Click a symbol to filter signals. Click header to clear filter.
 */

import { Star, BarChart3, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTier, type Timeframe } from "./constants";
import type { WatchlistItem } from "./useTradeDeskData";

interface Props {
  watchlist: WatchlistItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string | null) => void;
}

function TierSection({
  label,
  icon: Icon,
  items,
  selectedSymbol,
  onSelect,
}: {
  label: string;
  icon: any;
  items: WatchlistItem[];
  selectedSymbol: string | null;
  onSelect: (symbol: string | null) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => onSelect(null)}
        className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors w-full"
      >
        <Icon className="w-3 h-3" />
        {label}
      </button>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isSelected = selectedSymbol === item.symbol;
          const change = item.priceChangePercent || 0;
          const isUp = change >= 0;

          return (
            <button
              key={item.symbol}
              onClick={() => onSelect(isSelected ? null : item.symbol)}
              className={cn(
                "flex items-center justify-between w-full px-2 py-1.5 rounded text-xs transition-all",
                isSelected
                  ? "bg-slate-700/60 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              )}
            >
              <span className="font-mono font-medium">{item.symbol}</span>
              <span className={cn(
                "font-mono text-[11px]",
                isUp ? "text-emerald-400" : "text-red-400"
              )}>
                {isUp ? '+' : ''}{change.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WatchlistSidebar({ watchlist, selectedSymbol, onSelect }: Props) {
  // Group by tier
  const sTier = watchlist.filter(w => getTier(w.symbol) === 'S');
  const aTier = watchlist.filter(w => getTier(w.symbol) === 'A');
  const indexTier = watchlist.filter(w => getTier(w.symbol) === 'INDEX');
  const newTier = watchlist.filter(w => getTier(w.symbol) === 'NEW');
  const other = watchlist.filter(w => !getTier(w.symbol));

  return (
    <div className="w-56 shrink-0 border-r border-slate-800/60 overflow-y-auto h-[calc(100vh-4rem)] pr-1">
      <div className="px-2 py-3">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
          My Watchlist
          <span className="ml-1.5 text-slate-600 font-normal">{watchlist.length}</span>
        </h3>

        {selectedSymbol && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 mb-2 block"
          >
            Clear filter
          </button>
        )}

        <TierSection label="S-Tier" icon={Star} items={sTier} selectedSymbol={selectedSymbol} onSelect={onSelect} />
        <TierSection label="A-Tier" icon={BarChart3} items={aTier} selectedSymbol={selectedSymbol} onSelect={onSelect} />
        <TierSection label="Index" icon={Target} items={indexTier} selectedSymbol={selectedSymbol} onSelect={onSelect} />
        {newTier.length > 0 && (
          <TierSection label="New Finds" icon={Sparkles} items={newTier} selectedSymbol={selectedSymbol} onSelect={onSelect} />
        )}
        {other.length > 0 && (
          <TierSection label="Other" icon={BarChart3} items={other} selectedSymbol={selectedSymbol} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}
