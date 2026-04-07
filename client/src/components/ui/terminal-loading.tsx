import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalLoadingProps {
  message?: string;
  progress?: { current: number; total: number };
  className?: string;
}

export function TerminalLoading({ 
  message = "Loading data...", 
  progress,
  className 
}: TerminalLoadingProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center font-mono text-sm">
        <span className="text-[var(--trade-bullish)] mr-2">{">"}</span>
        <span className="text-muted-foreground">{message}</span>
        <Loader2 className="ml-2 h-4 w-4 animate-spin text-cyan-400" />
      </div>
      {progress && (
        <div className="flex items-center">
          <span className="text-muted-foreground/70 mr-2 font-mono text-xs">
            [{progress.current}/{progress.total}]
          </span>
          <div className="flex-1 bg-muted rounded h-1 max-w-xs">
            <div 
              className="bg-cyan-500 h-1 rounded transition-all duration-300" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface TerminalStepsProps {
  steps: Array<{ label: string; status: 'pending' | 'loading' | 'complete' | 'error' }>;
  className?: string;
}

export function TerminalSteps({ steps, className }: TerminalStepsProps) {
  return (
    <div className={cn("space-y-1 font-mono text-sm", className)}>
      {steps.map((step, index) => (
        <div key={index} className="flex items-center">
          <span className="text-[var(--trade-bullish)] mr-2">{">"}</span>
          <span className={cn(
            step.status === 'complete' && "text-foreground/80",
            step.status === 'loading' && "text-muted-foreground",
            step.status === 'pending' && "text-muted-foreground/70",
            step.status === 'error' && "text-[var(--trade-bearish)]"
          )}>
            {step.label}
          </span>
          {step.status === 'loading' && (
            <Loader2 className="ml-2 h-3 w-3 animate-spin text-cyan-400" />
          )}
          {step.status === 'complete' && (
            <span className="ml-2 text-[var(--trade-bullish)]">{"✓"}</span>
          )}
          {step.status === 'error' && (
            <span className="ml-2 text-[var(--trade-bearish)]">{"✗"}</span>
          )}
        </div>
      ))}
    </div>
  );
}
