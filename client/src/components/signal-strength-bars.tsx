import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  Activity, 
  BarChart3, 
  TrendingDown,
  Volume2,
  Target,
  Layers
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SignalStrengthBarsProps {
  signals: string[];
  className?: string;
}

const SIGNAL_ICONS: Record<string, { icon: typeof TrendingUp; label: string; description: string }> = {
  'RSI Divergence': { 
    icon: Activity, 
    label: 'RSI',
    description: 'Relative Strength Index - Oversold/Overbought conditions' 
  },
  'MACD Crossover': { 
    icon: TrendingUp, 
    label: 'MACD',
    description: 'Moving Average Convergence Divergence - Trend momentum' 
  },
  'Momentum': { 
    icon: BarChart3, 
    label: 'MOM',
    description: 'Price momentum - Strong directional movement' 
  },
  'Volume Spike': { 
    icon: Volume2, 
    label: 'VOL',
    description: 'Unusual volume activity - Institutional interest' 
  },
  'Breakout Setup': { 
    icon: Target, 
    label: 'BRK',
    description: 'Breaking through key resistance/support levels' 
  },
  'Mean Reversion': { 
    icon: TrendingDown, 
    label: 'REV',
    description: 'Price likely to revert to statistical mean' 
  },
  'Multi-Timeframe': { 
    icon: Layers, 
    label: 'MTF',
    description: 'Multiple timeframes aligned - High conviction' 
  },
};

const ALL_SIGNALS = [
  'RSI Divergence',
  'MACD Crossover', 
  'Momentum',
  'Volume Spike',
  'Breakout Setup',
  'Mean Reversion',
  'Multi-Timeframe'
];

export function SignalStrengthBars({ signals, className }: SignalStrengthBarsProps) {
  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1", className)}>
        {ALL_SIGNALS.map((signalName) => {
          const isActive = signals.includes(signalName);
          const signalConfig = SIGNAL_ICONS[signalName];
          
          if (!signalConfig) return null;
          
          const Icon = signalConfig.icon;
          
          return (
            <Tooltip key={signalName}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded transition-all",
                    isActive 
                      ? "bg-primary/20 text-primary border-2 border-primary/50 shadow-sm shadow-primary/20" 
                      : "bg-muted/30 text-muted-foreground/30 border border-muted"
                  )}
                  data-testid={`signal-${signalConfig.label.toLowerCase()}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{signalName}</p>
                  <p className="text-xs text-muted-foreground">{signalConfig.description}</p>
                  <p className={cn(
                    "text-xs font-medium",
                    isActive ? "text-green-500" : "text-muted-foreground"
                  )}>
                    {isActive ? '✓ Active' : '○ Not triggered'}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
        
        <div className="ml-2 text-xs font-medium text-muted-foreground">
          {signals.length}/{ALL_SIGNALS.length}
        </div>
      </div>
    </TooltipProvider>
  );
}
