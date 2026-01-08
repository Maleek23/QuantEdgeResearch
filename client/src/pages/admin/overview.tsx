import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin/admin-layout";
import {
  Users,
  Mail,
  UserPlus,
  TrendingUp,
  Activity,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Database,
  Cpu,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  color?: 'cyan' | 'green' | 'amber' | 'purple' | 'red';
  isLoading?: boolean;
}

function MetricCard({ title, value, description, icon, trend, color = 'cyan', isLoading }: MetricCardProps) {
  const colorClasses = {
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    green: "text-green-400 bg-green-500/10 border-green-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
        <div className={cn("p-2 rounded-lg border", colorClasses[color])}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24 bg-slate-800" />
        ) : (
          <>
            <div className="text-2xl font-bold text-white" data-testid={`metric-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </div>
            {description && (
              <p className="text-xs text-slate-500 mt-1">{description}</p>
            )}
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-xs mt-2",
                trend.value >= 0 ? "text-green-400" : "text-red-400"
              )}>
                <TrendingUp className={cn("h-3 w-3", trend.value < 0 && "rotate-180")} />
                <span>{trend.value >= 0 ? '+' : ''}{trend.value}%</span>
                <span className="text-slate-500">{trend.label}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  user?: string;
}

function RecentActivity({ activities, isLoading }: { activities: ActivityItem[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-12 bg-slate-800" />
        ))}
      </div>
    );
  }

  if (!activities?.length) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activities.slice(0, 8).map((activity) => (
        <div 
          key={activity.id} 
          className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
        >
          <div className="p-2 rounded-full bg-slate-700">
            {activity.type === 'user_signup' && <UserPlus className="h-3 w-3 text-green-400" />}
            {activity.type === 'invite_sent' && <Mail className="h-3 w-3 text-cyan-400" />}
            {activity.type === 'invite_redeemed' && <CheckCircle2 className="h-3 w-3 text-green-400" />}
            {activity.type === 'waitlist_join' && <Clock className="h-3 w-3 text-amber-400" />}
            {!['user_signup', 'invite_sent', 'invite_redeemed', 'waitlist_join'].includes(activity.type) && 
              <Activity className="h-3 w-3 text-slate-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{activity.description}</p>
            <p className="text-xs text-slate-500">{activity.timestamp}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface SystemStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
}

function SystemHealth({ systems, isLoading }: { systems: SystemStatus[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-10 bg-slate-800" />
        ))}
      </div>
    );
  }

  const defaultSystems: SystemStatus[] = [
    { name: 'Database', status: 'healthy' },
    { name: 'API Server', status: 'healthy' },
    { name: 'AI Providers', status: 'healthy' },
    { name: 'Market Data', status: 'healthy' },
  ];

  const displaySystems = systems?.length ? systems : defaultSystems;

  return (
    <div className="space-y-2">
      {displaySystems.map((system) => (
        <div 
          key={system.name}
          className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-2 w-2 rounded-full",
              system.status === 'healthy' && "bg-green-400",
              system.status === 'degraded' && "bg-amber-400",
              system.status === 'down' && "bg-red-400"
            )} />
            <span className="text-sm text-white">{system.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {system.latency && (
              <span className="text-xs text-slate-500">{system.latency}ms</span>
            )}
            <Badge 
              variant="outline"
              className={cn(
                "text-xs",
                system.status === 'healthy' && "text-green-400 border-green-500/20",
                system.status === 'degraded' && "text-amber-400 border-amber-500/20",
                system.status === 'down' && "text-red-400 border-red-500/20"
              )}
            >
              {system.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminOverviewContent() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    }
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
  });

  const { data: waitlistData, isLoading: waitlistLoading } = useQuery({
    queryKey: ['/api/admin/waitlist'],
    queryFn: async () => {
      const res = await fetch('/api/admin/waitlist', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch waitlist');
      return res.json();
    }
  });

  const { data: invitesData, isLoading: invitesLoading } = useQuery({
    queryKey: ['/api/admin/invites'],
    queryFn: async () => {
      const res = await fetch('/api/admin/invites', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch invites');
      return res.json();
    }
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['/api/admin/activity'],
    queryFn: async () => {
      const res = await fetch('/api/admin/activity', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    }
  });

  const { data: systemHealth, isLoading: healthLoading } = useQuery({
    queryKey: ['/api/admin/system-health'],
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await fetch('/api/admin/system-health', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch health');
      return res.json();
    }
  });

  const totalUsers = users?.length || 0;
  const proUsers = users?.filter((u: any) => u.subscriptionTier === 'pro')?.length || 0;
  const waitlistCount = waitlistData?.waitlist?.length || waitlistData?.length || 0;
  const pendingWaitlist = waitlistData?.waitlist?.filter((w: any) => w.status === 'pending')?.length || 
    waitlistData?.filter?.((w: any) => w.status === 'pending')?.length || 0;
  const totalInvites = invitesData?.invites?.length || invitesData?.length || 0;
  const redeemedInvites = invitesData?.invites?.filter((i: any) => i.status === 'redeemed')?.length ||
    invitesData?.filter?.((i: any) => i.status === 'redeemed')?.length || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Users"
          value={totalUsers}
          description={`${proUsers} Pro subscribers`}
          icon={<Users className="h-4 w-4" />}
          color="cyan"
          isLoading={usersLoading}
        />
        <MetricCard
          title="Waitlist"
          value={waitlistCount}
          description={`${pendingWaitlist} pending review`}
          icon={<UserPlus className="h-4 w-4" />}
          color="amber"
          isLoading={waitlistLoading}
        />
        <MetricCard
          title="Invites Sent"
          value={totalInvites}
          description={`${redeemedInvites} redeemed`}
          icon={<Mail className="h-4 w-4" />}
          color="green"
          isLoading={invitesLoading}
        />
        <MetricCard
          title="Ideas Today"
          value={stats?.ideasToday || 0}
          description="Research briefs generated"
          icon={<Zap className="h-4 w-4" />}
          color="purple"
          isLoading={statsLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-400" />
              Recent Activity
            </CardTitle>
            <CardDescription className="text-slate-500">
              Latest platform events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentActivity activities={activities || []} isLoading={activitiesLoading} />
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="h-5 w-5 text-green-400" />
              System Status
            </CardTitle>
            <CardDescription className="text-slate-500">
              Service health overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SystemHealth 
              systems={systemHealth?.services || []} 
              isLoading={healthLoading} 
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Database</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-cyan-400" />
              <div>
                <p className="text-lg font-semibold text-white">
                  {stats?.dbStats?.tableCount || 0} tables
                </p>
                <p className="text-xs text-slate-500">PostgreSQL (Neon)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-green-400" />
              <div>
                <p className="text-lg font-semibold text-white">
                  ${stats?.revenue?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-slate-500">This month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-400" />
              <div>
                <p className="text-lg font-semibold text-white">
                  {totalInvites > 0 ? ((redeemedInvites / totalInvites) * 100).toFixed(1) : 0}%
                </p>
                <p className="text-xs text-slate-500">Invite → User</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminOverview() {
  return (
    <AdminLayout>
      <AdminOverviewContent />
    </AdminLayout>
  );
}
