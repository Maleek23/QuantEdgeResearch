import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AdminLayout } from "@/components/admin/admin-layout";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Activity,
  Database,
  Cpu,
  Server,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HardDrive,
  Wifi,
  Brain,
  TrendingUp,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

function getCSRFToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency?: number;
  message?: string;
}

interface AIProviderStatus {
  name: string;
  status: 'available' | 'unavailable' | 'rate_limited';
  latency?: number;
  model?: string;
}

interface MarketAPIStatus {
  name: string;
  displayName: string;
  status: 'healthy' | 'degraded' | 'rate_limited' | 'down' | 'unknown';
  statusReason?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  quota?: {
    period: string;
    limit: number;
    used: number;
    remaining: number;
    resetsAt?: string;
  };
  rollingCounts: {
    success24h: number;
    error24h: number;
    rateLimitHits24h: number;
  };
}

function StatusIndicator({ status }: { status: string }) {
  return (
    <div className={cn(
      "h-2.5 w-2.5 rounded-full",
      status === 'healthy' && "bg-green-400",
      status === 'available' && "bg-green-400",
      status === 'degraded' && "bg-amber-400",
      status === 'rate_limited' && "bg-amber-400",
      status === 'down' && "bg-red-400",
      status === 'unavailable' && "bg-red-400",
      status === 'unknown' && "bg-slate-400"
    )} />
  );
}

function AdminSystemContent() {
  const { toast } = useToast();

  const { data: systemHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['/api/admin/system-health'],
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch('/api/admin/system-health', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch health');
      return res.json();
    }
  });

  const { data: dbHealth, isLoading: dbLoading, refetch: refetchDb } = useQuery({
    queryKey: ['/api/admin/database-health'],
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await fetch('/api/admin/database-health', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch db health');
      return res.json();
    }
  });

  const { data: aiProviders, isLoading: aiLoading, refetch: refetchAI } = useQuery({
    queryKey: ['/api/admin/ai-provider-status'],
    refetchInterval: 120000,
    queryFn: async () => {
      const res = await fetch('/api/admin/ai-provider-status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch AI status');
      return res.json();
    }
  });

  const { data: apiMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['/api/admin/api-metrics'],
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch('/api/admin/api-metrics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    }
  });

  const { data: marketApis, isLoading: marketApisLoading, refetch: refetchMarketApis } = useQuery<{
    providers: MarketAPIStatus[];
    timestamp: string;
  }>({
    queryKey: ['/api/admin/market-apis'],
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch('/api/admin/market-apis', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch market APIs');
      return res.json();
    }
  });

  const optimizeDbMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = getCSRFToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const res = await fetch('/api/admin/database/optimize', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Optimization failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/database-health'] });
      toast({ title: "Database optimized successfully" });
    },
    onError: () => {
      toast({ title: "Database optimization failed", variant: "destructive" });
    }
  });

  const refreshAll = () => {
    refetchHealth();
    refetchDb();
    refetchAI();
    refetchMarketApis();
  };

  const services: ServiceStatus[] = systemHealth?.services || [
    { name: 'API Server', status: 'healthy' },
    { name: 'Database', status: 'healthy' },
    { name: 'Market Data', status: 'healthy' },
    { name: 'WebSocket', status: 'healthy' },
  ];

  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const overallHealth = healthyCount === services.length ? 'All Systems Operational' :
    healthyCount > 0 ? 'Partial Outage' : 'Major Outage';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            healthyCount === services.length ? "bg-green-500/10" : "bg-amber-500/10"
          )}>
            {healthyCount === services.length ? (
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{overallHealth}</h2>
            <p className="text-sm text-slate-500">{healthyCount}/{services.length} services healthy</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={refreshAll}
          className="border-slate-700 text-slate-300"
          data-testid="button-refresh-all"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh All
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-cyan-400" />
              Services
            </CardTitle>
            <CardDescription className="text-slate-500">
              Core platform services status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 bg-slate-800" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {services.map((service) => (
                  <div 
                    key={service.name}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIndicator status={service.status} />
                      <span className="text-white font-medium">{service.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {service.latency && (
                        <span className="text-sm text-slate-500">{service.latency}ms</span>
                      )}
                      <Badge 
                        variant="outline"
                        className={cn(
                          service.status === 'healthy' && "text-green-400 border-green-500/20",
                          service.status === 'degraded' && "text-amber-400 border-amber-500/20",
                          service.status === 'down' && "text-red-400 border-red-500/20"
                        )}
                      >
                        {service.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-400" />
              AI Providers
            </CardTitle>
            <CardDescription className="text-slate-500">
              LLM service availability
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 bg-slate-800" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {(aiProviders?.providers || [
                  { name: 'OpenAI', status: 'available', model: 'GPT-4' },
                  { name: 'Anthropic', status: 'available', model: 'Claude Sonnet' },
                  { name: 'Google', status: 'available', model: 'Gemini' },
                ]).map((provider: AIProviderStatus) => (
                  <div 
                    key={provider.name}
                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <StatusIndicator status={provider.status} />
                      <div>
                        <span className="text-white font-medium">{provider.name}</span>
                        {provider.model && (
                          <p className="text-xs text-slate-500">{provider.model}</p>
                        )}
                      </div>
                    </div>
                    <Badge 
                      variant="outline"
                      className={cn(
                        provider.status === 'available' && "text-green-400 border-green-500/20",
                        provider.status === 'rate_limited' && "text-amber-400 border-amber-500/20",
                        provider.status === 'unavailable' && "text-red-400 border-red-500/20"
                      )}
                    >
                      {provider.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Database className="h-5 w-5 text-cyan-400" />
                  Database
                </CardTitle>
                <CardDescription className="text-slate-500">
                  PostgreSQL (Neon) health
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => optimizeDbMutation.mutate()}
                disabled={optimizeDbMutation.isPending}
                className="border-slate-700 text-slate-300"
                data-testid="button-optimize-db"
              >
                {optimizeDbMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-1" />
                )}
                Optimize
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {dbLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-slate-800" />)}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-sm text-slate-400">Tables</p>
                    <p className="text-2xl font-bold text-white">{dbHealth?.tableCount || 0}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-sm text-slate-400">Total Rows</p>
                    <p className="text-2xl font-bold text-white">
                      {safeToFixed((dbHealth?.totalRows || 0) / 1000, 1)}k
                    </p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-slate-400">Connection Pool</p>
                    <p className="text-sm text-white">
                      {dbHealth?.activeConnections || 0}/{dbHealth?.maxConnections || 10}
                    </p>
                  </div>
                  <Progress 
                    value={(dbHealth?.activeConnections || 0) / (dbHealth?.maxConnections || 10) * 100}
                    className="h-2 bg-slate-700"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <span className="text-slate-400">
                    Avg query time: {dbHealth?.avgQueryTime || '< 1'}ms
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              API Metrics
            </CardTitle>
            <CardDescription className="text-slate-500">
              Request volume and performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-slate-800" />)}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-sm text-slate-400">Requests Today</p>
                    <p className="text-2xl font-bold text-white">
                      {apiMetrics?.requestsToday?.toLocaleString() || 0}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <p className="text-sm text-slate-400">Avg Response</p>
                    <p className="text-2xl font-bold text-white">
                      {apiMetrics?.avgResponseTime || 0}ms
                    </p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-slate-400">Success Rate</p>
                    <p className="text-sm text-green-400">
                      {apiMetrics?.successRate || 99.9}%
                    </p>
                  </div>
                  <Progress 
                    value={apiMetrics?.successRate || 99.9}
                    className="h-2 bg-slate-700"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                    <p className="text-lg font-bold text-green-400">{apiMetrics?.status2xx || 0}</p>
                    <p className="text-xs text-slate-500">2xx</p>
                  </div>
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                    <p className="text-lg font-bold text-amber-400">{apiMetrics?.status4xx || 0}</p>
                    <p className="text-xs text-slate-500">4xx</p>
                  </div>
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                    <p className="text-lg font-bold text-red-400">{apiMetrics?.status5xx || 0}</p>
                    <p className="text-xs text-slate-500">5xx</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Wifi className="h-5 w-5 text-cyan-400" />
                Market Data APIs
              </CardTitle>
              <CardDescription className="text-slate-500">
                External data provider status and rate limits
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchMarketApis()}
              className="border-slate-700 text-slate-300"
              data-testid="button-refresh-market-apis"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {marketApisLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 bg-slate-800" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {(marketApis?.providers || []).map((api: MarketAPIStatus) => (
                <div 
                  key={api.name}
                  className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50"
                  data-testid={`api-status-${api.name}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <StatusIndicator status={api.status} />
                      <div>
                        <span className="text-white font-medium">{api.displayName}</span>
                        {api.statusReason && (
                          <p className="text-xs text-slate-500">{api.statusReason}</p>
                        )}
                      </div>
                    </div>
                    <Badge 
                      variant="outline"
                      className={cn(
                        api.status === 'healthy' && "text-green-400 border-green-500/20",
                        api.status === 'degraded' && "text-amber-400 border-amber-500/20",
                        api.status === 'rate_limited' && "text-amber-400 border-amber-500/20",
                        api.status === 'down' && "text-red-400 border-red-500/20",
                        api.status === 'unknown' && "text-slate-400 border-slate-500/20"
                      )}
                    >
                      {api.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    {api.quota && (
                      <>
                        <div className="text-center p-2 rounded bg-slate-700/30">
                          <p className="text-lg font-mono font-bold text-white">
                            {api.quota.remaining}/{api.quota.limit}
                          </p>
                          <p className="text-xs text-slate-500">Remaining</p>
                        </div>
                        <div className="text-center p-2 rounded bg-slate-700/30">
                          <p className="text-xs font-medium text-slate-400">{api.quota.period}</p>
                          <p className="text-xs text-slate-500">Rate Limit</p>
                        </div>
                      </>
                    )}
                    <div className="text-center p-2 rounded bg-green-500/10">
                      <p className="text-sm font-bold text-green-400">{api.rollingCounts.success24h}</p>
                      <p className="text-xs text-slate-500">Success</p>
                    </div>
                    <div className="text-center p-2 rounded bg-red-500/10">
                      <p className="text-sm font-bold text-red-400">{api.rollingCounts.error24h + api.rollingCounts.rateLimitHits24h}</p>
                      <p className="text-xs text-slate-500">Errors</p>
                    </div>
                  </div>
                  {api.lastSuccessAt && (
                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Last success: {new Date(api.lastSuccessAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              ))}
              {(!marketApis?.providers || marketApis.providers.length === 0) && (
                <div className="text-center py-8 text-slate-500">
                  <Wifi className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No API activity recorded yet</p>
                  <p className="text-xs">Stats will appear as APIs are called</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSystem() {
  return (
    <AdminLayout>
      <AdminSystemContent />
    </AdminLayout>
  );
}
