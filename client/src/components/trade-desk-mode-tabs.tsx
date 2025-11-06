import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LayoutGrid, Activity, TrendingUp, Newspaper, UserPlus, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IdeaSource, AssetType } from "@shared/schema";
import { cn } from "@/lib/utils";

export type TradeDeskMode = 'ai-picks' | 'flow' | 'lotto' | 'news' | 'manual';

export interface ModeMeta {
  id: TradeDeskMode;
  label: string;
  icon: LucideIcon;
  description: string;
  tooltip: string;
  badge?: string;
  isHighRisk?: boolean;
  groupEnd?: boolean;
  filters: {
    source?: IdeaSource[];
    assetType?: AssetType[];
    priceRange?: { min: number; max: number };
    rrMin?: number;
    grades?: string[];
  };
}

export const MODES: ModeMeta[] = [
  {
    id: 'ai-picks',
    label: 'AI Picks',
    icon: LayoutGrid,
    description: 'Conservative plays from AI, Quant, and Hybrid engines (R:R ≥2.0, grades A-B)',
    tooltip: 'Conservative plays from AI, Quant, and Hybrid engines with strong risk/reward ratios',
    groupEnd: true,
    filters: {
      source: ['quant', 'ai', 'hybrid'],
      rrMin: 2.0,
      grades: ['A', 'B'],
    }
  },
  {
    id: 'flow',
    label: 'Flow Scanner',
    icon: Activity,
    description: 'Institutional option flow (99.4% WR)',
    tooltip: 'Institutional options flow detection with 99.4% accuracy rate',
    badge: '99.4% WR',
    isHighRisk: true,
    filters: {
      source: ['flow'],
    }
  },
  {
    id: 'lotto',
    label: 'Lotto',
    icon: Zap,
    description: 'High-risk $20-70 options with 20x potential',
    tooltip: 'High-risk weekly options for small accounts ($20-70 entry, 20x potential)',
    badge: 'HIGH RISK',
    isHighRisk: true,
    groupEnd: true,
    filters: {
      assetType: ['option'],
      priceRange: { min: 0.20, max: 0.70 },
      rrMin: 10.0,
      grades: ['B', 'C'],
    }
  },
  {
    id: 'news',
    label: 'News Catalyst',
    icon: Newspaper,
    description: 'Breaking news-driven trades',
    tooltip: 'Breaking news-driven trades with relaxed risk/reward requirements',
    filters: {
      source: ['news'],
    }
  },
  {
    id: 'manual',
    label: 'Manual',
    icon: UserPlus,
    description: 'User-created trades',
    tooltip: 'Your custom trade ideas and manual entries',
    filters: {
      source: ['manual'],
    }
  },
];

interface TradeDeskModeTabsProps {
  mode: TradeDeskMode;
  onModeChange: (mode: TradeDeskMode) => void;
}

export function TradeDeskModeTabs({ mode, onModeChange }: TradeDeskModeTabsProps) {
  return (
    <Tabs value={mode} onValueChange={(v) => onModeChange(v as TradeDeskMode)}>
      <TabsList className="w-full h-auto p-1.5 gap-2">
        <div className="flex items-center gap-2 w-full flex-wrap">
          {MODES.map((m, index) => (
            <div key={m.id} className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger 
                    value={m.id} 
                    className={cn(
                      "gap-2 px-4 py-2.5 flex-1 min-w-[140px] relative",
                      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                      "data-[state=active]:shadow-md",
                      m.isHighRisk && "data-[state=inactive]:border-amber-500/30",
                      m.isHighRisk && "data-[state=inactive]:text-amber-500/90"
                    )}
                    data-testid={`mode-tab-${m.id}`}
                  >
                    <m.icon className={cn(
                      "h-4 w-4",
                      m.isHighRisk && "text-amber-500"
                    )} />
                    <span className="font-semibold hidden sm:inline">{m.label}</span>
                    <span className="font-semibold sm:hidden">{m.label.split(' ')[0]}</span>
                    {m.badge && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "ml-auto text-[10px] px-1.5 py-0.5",
                          m.isHighRisk && "border-amber-500/50 bg-amber-500/10 text-amber-500"
                        )}
                      >
                        {m.badge}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[250px]">
                  <p className="text-sm">{m.tooltip}</p>
                </TooltipContent>
              </Tooltip>
              
              {m.groupEnd && index < MODES.length - 1 && (
                <div 
                  className="h-10 w-px bg-border/50 hidden lg:block"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </TabsList>
    </Tabs>
  );
}
