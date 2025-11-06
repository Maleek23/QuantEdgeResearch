import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, Activity, TrendingUp, Newspaper, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IdeaSource, AssetType } from "@shared/schema";

export type TradeDeskMode = 'standard' | 'flow' | 'lotto' | 'news' | 'manual';

export interface ModeMeta {
  id: TradeDeskMode;
  label: string;
  icon: LucideIcon;
  description: string;
  badge?: string;
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
    id: 'standard',
    label: 'Standard',
    icon: LayoutGrid,
    description: 'All engines, conservative plays',
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
    badge: '99.4% WR',
    filters: {
      source: ['flow'],
    }
  },
  {
    id: 'lotto',
    label: '🎰 Lotto Plays',
    icon: TrendingUp,
    description: 'High-risk $20-70 options with 20x potential',
    badge: 'HIGH RISK',
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
    filters: {
      source: ['news'],
    }
  },
  {
    id: 'manual',
    label: 'Manual',
    icon: UserPlus,
    description: 'User-created trades',
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
      <TabsList className="grid w-full grid-cols-5 mb-4">
        {MODES.map((m) => (
          <TabsTrigger 
            key={m.id} 
            value={m.id} 
            className="gap-1.5"
            data-testid={`mode-tab-${m.id}`}
          >
            <m.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{m.label}</span>
            {m.badge && (
              <Badge variant="outline" className="ml-1 text-[10px]">
                {m.badge}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
