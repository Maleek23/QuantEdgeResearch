import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Settings, 
  TrendingUp, 
  Wallet,
  BarChart3,
  Star,
  ChevronRight,
  Sparkles,
  Target,
  Activity,
  Calendar,
  Clock,
  Shield,
  Zap,
  Bot,
  BookOpen,
  Eye
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  subscriptionTier: string;
  createdAt: string;
}

interface PerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  openPositions: number;
}

interface Position {
  id: number;
  symbol: string;
  status: 'open' | 'closed';
  realizedPnL?: number;
  unrealizedPnL?: number;
  entryPrice: number;
  quantity: number;
  direction: 'long' | 'short';
  createdAt: string;
}

interface Portfolio {
  id: number;
  name: string;
  balance: number;
}

interface PortfolioData {
  positions: Position[];
  portfolios: Portfolio[];
}

interface TierLimits {
  aiQueries: number;
  paperPositions: number;
  scannerSymbols: number;
}

interface TierUsage {
  aiQueries: number;
  paperPositions: number;
  scannerSymbols: number;
}

interface TierData {
  tier: 'free' | 'pro' | 'premium';
  limits: TierLimits;
  usage: TierUsage;
}

export default function MyAccountPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: user, isLoading: userLoading } = useQuery<UserData>({
    queryKey: ['/api/auth/me'],
  });

  const { data: preferences } = useQuery({
    queryKey: ['/api/preferences'],
  });

  const { data: portfolioData } = useQuery<PortfolioData>({
    queryKey: ['/api/bot/positions'],
  });

  const { data: tierData } = useQuery<TierData>({
    queryKey: ['/api/user/tier'],
  });

  if (userLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-muted/20 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <Card className="glass-card border-amber-500/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <User className="h-12 w-12 text-amber-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Login Required</h2>
            <p className="text-muted-foreground mb-4">
              Please log in to access your account dashboard
            </p>
            <Link href="/login">
              <Button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950">
                Login to Continue
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = user.firstName && user.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user.email[0].toUpperCase();
  
  const displayName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user.email.split('@')[0];

  const memberSince = user.createdAt 
    ? formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })
    : 'Recently';

  const positions = portfolioData?.positions || [];
  const openPositions = positions.filter((p) => p.status === 'open');
  const closedPositions = positions.filter((p) => p.status === 'closed');
  const wins = closedPositions.filter((p) => (p.realizedPnL || 0) > 0).length;
  const losses = closedPositions.filter((p) => (p.realizedPnL || 0) <= 0).length;
  const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
  const totalPnL = positions.reduce((sum, p) => sum + (p.realizedPnL || p.unrealizedPnL || 0), 0);

  const getTierBadge = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'pro':
        return <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">Pro</Badge>;
      case 'premium':
        return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Premium</Badge>;
      default:
        return <Badge variant="secondary">Free</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="relative overflow-hidden rounded-xl glass-card">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
        <div className="relative z-10 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <Avatar className="h-20 w-20 border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20">
              <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold" data-testid="text-user-name">{displayName}</h1>
                {getTierBadge(tierData?.tier || user.subscriptionTier)}
              </div>
              <p className="text-muted-foreground mt-1" data-testid="text-user-email">{user.email}</p>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Member {memberSince}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Link href="/settings">
                <Button variant="outline" size="sm" className="gap-2" data-testid="button-settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="glass-card border-l-2 border-l-cyan-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Open Positions</p>
                <p className="text-2xl font-semibold font-mono tabular-nums mt-1" data-testid="text-open-positions">{openPositions.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-l-2 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Win Rate</p>
                <p className="text-2xl font-semibold font-mono tabular-nums mt-1" data-testid="text-win-rate">
                  {closedPositions.length > 0 ? `${winRate.toFixed(1)}%` : 'N/A'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-l-2 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total P&L</p>
                <p className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-total-pnl">
                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-l-2 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Record</p>
                <p className="text-2xl font-semibold font-mono tabular-nums mt-1" data-testid="text-record">
                  {wins}W / {losses}L
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="glass-card grid w-full grid-cols-3" data-testid="tabs-account">
          <TabsTrigger value="overview" className="data-[state=active]:bg-cyan-500/10" data-testid="tab-overview">
            <Eye className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-cyan-500/10" data-testid="tab-preferences">
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-cyan-500/10" data-testid="tab-subscription">
            <Star className="h-4 w-4 mr-2" />
            Subscription
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Quick Actions */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-400" />
                  Quick Actions
                </CardTitle>
                <CardDescription>Access your favorite features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/trade-desk">
                  <Button variant="ghost" className="w-full justify-between hover-elevate" data-testid="link-trade-desk">
                    <span className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-green-400" />
                      </div>
                      Trade Desk
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
                <Link href="/watchlist-bot">
                  <Button variant="ghost" className="w-full justify-between hover-elevate" data-testid="link-watchlist-bot">
                    <span className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-purple-400" />
                      </div>
                      Auto-Lotto Bot
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
                <Link href="/market-scanner">
                  <Button variant="ghost" className="w-full justify-between hover-elevate" data-testid="link-market-scanner">
                    <span className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-cyan-400" />
                      </div>
                      Market Scanner
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
                <Link href="/academy">
                  <Button variant="ghost" className="w-full justify-between hover-elevate" data-testid="link-academy">
                    <span className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                        <BookOpen className="h-4 w-4 text-amber-400" />
                      </div>
                      Trading Academy
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Account Settings Summary */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5 text-cyan-400" />
                  Your Settings
                </CardTitle>
                <CardDescription>Current configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10">
                  <span className="text-sm text-muted-foreground">Account Size</span>
                  <span className="font-medium font-mono tabular-nums">${(preferences as any)?.accountSize?.toLocaleString() || '10,000'}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10">
                  <span className="text-sm text-muted-foreground">Max Risk Per Trade</span>
                  <span className="font-medium font-mono tabular-nums">{(preferences as any)?.maxRiskPerTrade || 1}%</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10">
                  <span className="text-sm text-muted-foreground">Holding Horizon</span>
                  <span className="font-medium capitalize">{(preferences as any)?.holdingHorizon || 'Intraday'}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/10">
                  <span className="text-sm text-muted-foreground">Timezone</span>
                  <span className="font-medium">{(preferences as any)?.timezone?.replace('America/', '') || 'Chicago'}</span>
                </div>
                <Separator className="my-2" />
                <Link href="/settings">
                  <Button variant="outline" size="sm" className="w-full" data-testid="button-manage-settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Manage All Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-cyan-400" />
                Recent Positions
              </CardTitle>
              <CardDescription>Your latest trading activity</CardDescription>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No positions yet. Start trading with the Auto-Lotto Bot!</p>
                  <Link href="/watchlist-bot">
                    <Button variant="outline" size="sm" className="mt-4">
                      Go to Bot
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {positions.slice(0, 5).map((position: any, index: number) => (
                    <div key={position.id || index} className="flex items-center justify-between p-3 rounded-lg bg-muted/10 hover-elevate">
                      <div className="flex items-center gap-3">
                        <Badge variant={position.status === 'open' ? 'default' : 'secondary'}>
                          {position.status}
                        </Badge>
                        <div>
                          <p className="font-medium">{position.symbol}</p>
                          <p className="text-xs text-muted-foreground">
                            {position.assetType} • {position.direction}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium font-mono tabular-nums ${(position.unrealizedPnL || position.realizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(position.unrealizedPnL || position.realizedPnL || 0) >= 0 ? '+' : ''}
                          ${(position.unrealizedPnL || position.realizedPnL || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono tabular-nums">
                          {position.quantity}x @ ${Number(position.entryPrice).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg">Trading Preferences</CardTitle>
              <CardDescription>Customize your trading experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg bg-muted/10 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wallet className="h-4 w-4" />
                    Account Size
                  </div>
                  <p className="text-xl font-semibold font-mono tabular-nums">${(preferences as any)?.accountSize?.toLocaleString() || '10,000'}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/10 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    Risk Per Trade
                  </div>
                  <p className="text-xl font-semibold font-mono tabular-nums">{(preferences as any)?.maxRiskPerTrade || 1}%</p>
                </div>
              </div>
              <Separator />
              <Link href="/settings">
                <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950" data-testid="button-edit-preferences">
                  <Settings className="h-4 w-4 mr-2" />
                  Edit All Preferences
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Your Subscription
              </CardTitle>
              <CardDescription>Manage your plan and features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20">
                <div>
                  <p className="text-sm text-muted-foreground">Current Plan</p>
                  <p className="text-xl font-semibold mt-1 capitalize">{tierData?.tier || user.subscriptionTier || 'Free'}</p>
                </div>
                {getTierBadge(tierData?.tier || user.subscriptionTier)}
              </div>

              {tierData?.limits && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Usage This Month</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Trade Ideas</span>
                      <span className="font-mono tabular-nums">{tierData.usage?.tradeIdeas || 0} / {tierData.limits?.tradeIdeas === -1 ? '∞' : tierData.limits?.tradeIdeas}</span>
                    </div>
                    {tierData.limits?.tradeIdeas !== -1 && (
                      <Progress 
                        value={((tierData.usage?.tradeIdeas || 0) / tierData.limits?.tradeIdeas) * 100} 
                        className="h-2"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Chart Analysis</span>
                      <span className="font-mono tabular-nums">{tierData.usage?.chartAnalysis || 0} / {tierData.limits?.chartAnalysis === -1 ? '∞' : tierData.limits?.chartAnalysis}</span>
                    </div>
                    {tierData.limits?.chartAnalysis !== -1 && (
                      <Progress 
                        value={((tierData.usage?.chartAnalysis || 0) / tierData.limits?.chartAnalysis) * 100} 
                        className="h-2"
                      />
                    )}
                  </div>
                </div>
              )}

              {(tierData?.tier || user.subscriptionTier) === 'free' && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                  <h4 className="font-medium flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-400" />
                    Upgrade to Pro
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Unlock unlimited research briefs, advanced AI analysis, and priority access to new features.
                  </p>
                  <Button className="mt-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white" size="sm">
                    View Plans
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
