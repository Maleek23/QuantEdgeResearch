import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  Activity, 
  Volume2
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
  'RSI(2) Mean Reversion': { 
    icon: Activity, 
    label: 'RSI',
    description: 'RSI(2) extreme oversold/overbought - 75-91% win rate (Larry Connors research)' 
  },
  'VWAP Cross': { 
    icon: TrendingUp, 
    label: 'VWAP',
    description: 'Price crossing VWAP with volume - 80%+ win rate (professional standard)' 
  },
  'Volume Spike': { 
    icon: Volume2, 
    label: 'VOL',
    description: 'Unusual volume (3x+) with small price move - early institutional accumulation' 
  },
};

const ALL_SIGNALS = [
  'RSI(2) Mean Reversion',
  'VWAP Cross',
  'Volume Spike'
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
