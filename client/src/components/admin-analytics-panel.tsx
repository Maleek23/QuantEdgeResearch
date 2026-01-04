import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Eye, 
  MousePointer, 
  Clock, 
  Monitor, 
  Smartphone,
  Globe,
  TrendingUp,
  Activity
} from "lucide-react";

interface AnalyticsDashboard {
  totalUsers: number;
  activeUsers24h: number;
  totalPageViews24h: number;
  topPages: { path: string; count: number }[];
  topActivities: { activityType: string; count: number }[];
  recentLogins: {
    id: string;
    userId: string;
    loginAt: string;
    browser: string;
    device: string;
    ipAddress?: string;
    authMethod?: string;
  }[];
}

const activityLabels: Record<string, string> = {
  view_trade_idea: "Viewed Trade Ideas",
  generate_idea: "Generated Ideas",
  view_chart: "Viewed Charts",
  export_pdf: "Exported PDFs",
  add_to_watchlist: "Added to Watchlist",
  journal_entry: "Journal Entries",
  run_scanner: "Ran Scanners",
  view_performance: "Viewed Performance",
  settings_change: "Settings Changed",
  subscription_action: "Subscription Actions",
};

export function AdminAnalyticsPanel() {
  const { data: analytics, isLoading } = useQuery<AnalyticsDashboard>({
    queryKey: ['/api/admin/analytics'],
    queryFn: async () => {
      const res = await fetch('/api/admin/analytics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Activity className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Unable to load analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-glass rounded-lg p-4" data-testid="stat-total-users">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-cyan-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Users</p>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">
            {analytics.totalUsers}
          </p>
        </div>
        
        <div className="stat-glass rounded-lg p-4" data-testid="stat-active-users">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-green-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active (24h)</p>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-green-400">
            {analytics.activeUsers24h}
          </p>
        </div>
        
        <div className="stat-glass rounded-lg p-4" data-testid="stat-pageviews">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-purple-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Page Views (24h)</p>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-purple-400">
            {analytics.totalPageViews24h}
          </p>
        </div>
        
        <div className="stat-glass rounded-lg p-4" data-testid="stat-logins">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Logins (24h)</p>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">
            {analytics.recentLogins?.length || 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-400" />
              Top Pages (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.topPages?.slice(0, 8).map((page, idx) => (
                <div 
                  key={page.path} 
                  className="flex items-center justify-between py-1.5 border-b border-slate-700/30 last:border-0"
                  data-testid={`page-stat-${idx}`}
                >
                  <span className="text-sm font-mono truncate max-w-[200px]" title={page.path}>
                    {page.path}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {page.count}
                  </Badge>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground">No page views recorded</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-purple-400" />
              Top Activities (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.topActivities?.slice(0, 8).map((activity, idx) => (
                <div 
                  key={activity.activityType} 
                  className="flex items-center justify-between py-1.5 border-b border-slate-700/30 last:border-0"
                  data-testid={`activity-stat-${idx}`}
                >
                  <span className="text-sm truncate max-w-[200px]">
                    {activityLabels[activity.activityType] || activity.activityType}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {activity.count}
                  </Badge>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground">No activities recorded</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            Recent Logins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">User ID</th>
                  <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Time</th>
                  <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Device</th>
                  <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Browser</th>
                  <th className="text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground">Method</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentLogins?.slice(0, 10).map((login, idx) => (
                  <tr key={login.id} className="border-t border-slate-700/30" data-testid={`login-row-${idx}`}>
                    <td className="p-3 font-mono text-xs truncate max-w-[150px]" title={login.userId}>
                      {login.userId.slice(0, 12)}...
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {login.loginAt ? new Date(login.loginAt).toLocaleString() : 'N/A'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {login.device === 'mobile' ? (
                          <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                        ) : (
                          <Monitor className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span className="text-xs capitalize">{login.device || 'unknown'}</span>
                      </div>
                    </td>
                    <td className="p-3 text-xs">{login.browser || 'unknown'}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {login.authMethod || 'session'}
                      </Badge>
                    </td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      No login history recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
