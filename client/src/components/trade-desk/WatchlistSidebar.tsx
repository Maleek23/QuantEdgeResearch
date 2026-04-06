/**
 * Watchlist Sidebar
 * =================
 * Always-visible sidebar showing user's tiered watchlist with live prices.
 * Click a symbol to filter signals. Click header to clear filter.
 */

import { Star, BarChart3, Target, Sparkles } from "lucide-react";
import { cn, safePercent } from "@/lib/utils";
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
    <div className="mb-3">
      <button
        onClick={() => onSelect(null)}
        className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground/80 transition-colors w-full font-mono font-semibold"
      >
        <Icon className="w-2.5 h-2.5" />
        {label}
      </button>
      <div className="space-y-px">
        {items.map((item) => {
          const isSelected = selectedSymbol === item.symbol;
          const change = item.priceChangePercent || 0;
          const isUp = change >= 0;

          return (
            <button
              key={item.symbol}
              onClick={() => onSelect(isSelected ? null : item.symbol)}
              className={cn(
                "flex items-center justify-between w-full px-1.5 py-1 rounded-sm text-data-xs transition-all",
                isSelected
                  ? "bg-[var(--brand-teal)]/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <span className="font-mono font-semibold tracking-wider text-[11px]">{item.symbol}</span>
              <span className={cn(
                "font-mono tabular-nums text-[10px]",
                isUp ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
              )}>
                {safePercent(change, 1)}
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
    <div className="w-48 shrink-0 border-r border-border/50 overflow-y-auto h-[calc(100vh-3.5rem)] pr-0.5">
      <div className="px-1.5 py-2">
        <h3 className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-2 font-mono px-1.5">
          Watchlist
          <span className="ml-1 text-muted-foreground/50 font-normal tabular-nums">{watchlist.length}</span>
        </h3>

        {selectedSymbol && (
          <button
            onClick={() => onSelect(null)}
            className="text-[9px] text-cyan-400 hover:text-cyan-300 mb-1.5 block font-mono px-1.5"
          >
            Clear
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
