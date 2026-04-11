/**
 * TradePresets — one-tap loadout buttons for Trade Desk
 * ======================================================
 * Each preset is a complete TradeFilters override.
 * Tapping a preset replaces all filters with the preset's values.
 */

import { Sparkles, Zap, Calendar, DollarSign, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { TradeFilters, DEFAULT_FILTERS } from "./trade-filters-bar";

export interface TradePreset {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  filters: TradeFilters;
}

export const TRADE_PRESETS: TradePreset[] = [
  {
    id: "todays-best",
    label: "Today's Best",
    icon: Sparkles,
    description: "S+A bands, R:R 2.5+, watchlist",
    filters: {
      ...DEFAULT_FILTERS,
      band: "A+",
      rr: "2+",
      hold: "all",
    },
  },
  {
    id: "squeezes",
    label: "Squeezes",
    icon: Zap,
    description: "Bollinger coils ready to break",
    filters: {
      ...DEFAULT_FILTERS,
      band: "all",
      rr: "2+",
      sources: ["squeeze"],
    },
  },
  {
    id: "earnings",
    label: "Earnings",
    icon: Calendar,
    description: "Earnings catalyst plays",
    filters: {
      ...DEFAULT_FILTERS,
      band: "B+",
      sources: ["earnings"],
      rr: "2+",
    },
  },
  {
    id: "income",
    label: "Income",
    icon: DollarSign,
    description: "Options only, theta plays",
    filters: {
      ...DEFAULT_FILTERS,
      asset: "option",
      band: "B+",
      hold: "swing",
    },
  },
  {
    id: "day-trades",
    label: "Day Trades",
    icon: Sun,
    description: "Intraday setups, R:R 1.5+",
    filters: {
      ...DEFAULT_FILTERS,
      hold: "day",
      rr: "1.5+",
      band: "B+",
    },
  },
];

interface Props {
  activePresetId: string | null;
  onSelect: (preset: TradePreset) => void;
  className?: string;
}

export function TradePresets({ activePresetId, onSelect, className }: Props) {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-1", className)}>
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap">
        Presets
      </span>
      {TRADE_PRESETS.map((preset) => {
        const Icon = preset.icon;
        const isActive = activePresetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset)}
            data-testid={`preset-${preset.id}`}
            title={preset.description}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider whitespace-nowrap border transition-all",
              isActive
                ? "bg-gradient-to-r from-cyan-500/20 to-violet-500/15 text-cyan-200 border-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.15)]"
                : "bg-foreground/[0.02] text-muted-foreground border-foreground/10 hover:text-foreground hover:border-foreground/20",
            )}
          >
            <Icon className="w-3 h-3" />
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
