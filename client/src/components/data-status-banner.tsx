import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DegradedProvider {
  name: string;
  status: 'rate_limited' | 'degraded' | 'down';
  reason?: string;
  resetsAt?: string;
}

interface DataStatus {
  healthy: boolean;
  degradedProviders: DegradedProvider[];
  cacheEntries: number;
  queuedRequests: number;
}

export function DataStatusBanner() {
  const [dismissed, setDismissed] = useState(() => {
    const stored = sessionStorage.getItem('data-status-dismissed');
    if (stored) {
      const expiry = parseInt(stored, 10);
      if (Date.now() < expiry) return true;
      sessionStorage.removeItem('data-status-dismissed');
    }
    return false;
  });

  const { data: status } = useQuery<DataStatus>({
    queryKey: ['/api/data-status'],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  if (!status || status.healthy || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('data-status-dismissed', String(Date.now() + 5 * 60 * 1000));
  };

  const totalIssues = status.degradedProviders.length;
  const hasDown = status.degradedProviders.some(p => p.status === 'down');
  const providerNames = status.degradedProviders.map(p => p.name).join(', ');

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50 text-xs">
      <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", hasDown ? "bg-red-500" : "bg-amber-500")} />
      <span className="text-slate-400 flex-1 truncate">
        {providerNames} {totalIssues === 1 ? 'is' : 'are'} experiencing issues
        {status.cacheEntries > 0 && <span className="text-slate-500"> · Using cached data</span>}
      </span>
      <button onClick={handleDismiss} className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300 flex-shrink-0">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface CachedDataIndicatorProps {
  isStale: boolean;
  cacheAge?: number;
  provider?: string;
  onRetry?: () => void;
}

export function CachedDataIndicator({ isStale, cacheAge, provider, onRetry }: CachedDataIndicatorProps) {
  if (!isStale) return null;

  const ageText = cacheAge
    ? cacheAge < 60000
      ? `${Math.round(cacheAge / 1000)}s ago`
      : `${Math.round(cacheAge / 60000)}m ago`
    : "recently";

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
      <Database className="h-3 w-3" />
      <span>Cached data from {ageText}</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-slate-400 hover:text-slate-300"
          onClick={onRetry}
          data-testid="button-retry-fetch"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
