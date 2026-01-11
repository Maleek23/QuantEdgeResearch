import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Database, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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

function formatTimeUntil(isoDate: string): string {
  const target = new Date(isoDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  
  if (diffMs <= 0) return "shortly";
  
  const minutes = Math.ceil(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  
  const hours = Math.ceil(diffMs / 3600000);
  return `${hours}h`;
}

export function DataStatusBanner() {
  const { data: status } = useQuery<DataStatus>({
    queryKey: ['/api/data-status'],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  if (!status || status.healthy) {
    return null;
  }

  const rateLimited = status.degradedProviders.filter(p => p.status === 'rate_limited');
  const degraded = status.degradedProviders.filter(p => p.status === 'degraded');
  const down = status.degradedProviders.filter(p => p.status === 'down');

  return (
    <div className="space-y-2">
      {rateLimited.length > 0 && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <Clock className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-200">
              {rateLimited.map(p => p.name).join(', ')} rate limited
              {rateLimited[0]?.resetsAt && (
                <span className="text-amber-400 ml-1">
                  - resumes in {formatTimeUntil(rateLimited[0].resetsAt)}
                </span>
              )}
            </span>
            {status.cacheEntries > 0 && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <Database className="h-3 w-3" />
                Using cached data
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {degraded.length > 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-yellow-200">
            {degraded.map(p => p.name).join(', ')} experiencing issues - data may be delayed
          </AlertDescription>
        </Alert>
      )}

      {down.length > 0 && (
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-200">
            {down.map(p => p.name).join(', ')} unavailable - showing cached data where available
          </AlertDescription>
        </Alert>
      )}
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
    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
      <Database className="h-3 w-3" />
      <span>Cached data from {ageText}</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1 text-amber-400 hover:text-amber-300"
          onClick={onRetry}
          data-testid="button-retry-fetch"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
