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
  Calendar,
  Shield,
  Zap,
  Bot,
  BookOpen,
  Eye,
  MessageCircle
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  subscriptionTier: string;
  createdAt: string;
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

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  creditsAllocated: number;
  cycleEnd: string;
  tier: string;
}

export default function MyAccountPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: user, isLoading: userLoading } = useQuery<UserData>({
    queryKey: ['/api/auth/me'],
  });

  const { data: preferences } = useQuery({
    queryKey: ['/api/preferences'],
  });

  const { data: tierData } = useQuery<TierData>({
    queryKey: ['/api/user/tier'],
  });

  const { data: creditBalance } = useQuery<CreditBalance>({
    queryKey: ['/api/ai/credits'],
    enabled: !!user,
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

      {/* Analytics Link */}
      <Card className="glass-card border-l-2 border-l-cyan-500">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Trading Analytics</h3>
                <p className="text-sm text-muted-foreground">Analyze your win rate, P&L history, and performance metrics</p>
              </div>
            </div>
            <Link href="/performance">
              <Button variant="outline" className="gap-2" data-testid="button-view-analytics">
                View Analytics
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

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

          {/* AI Credits Card */}
          {creditBalance && (
            <Card className="glass-card border-l-2 border-l-purple-500">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-purple-400" />
                  AI Assistant Credits
                </CardTitle>
                <CardDescription>Your monthly AI chat allowance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-3xl font-bold font-mono tabular-nums" data-testid="text-credits-remaining">
                      {creditBalance.creditsRemaining}
                      <span className="text-lg text-muted-foreground font-normal">
                        {" "}/ {creditBalance.creditsAllocated}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Credits remaining this month
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge 
                      className={
                        creditBalance.creditsRemaining <= 5 
                          ? "bg-red-500/20 text-red-400 border-red-500/30" 
                          : creditBalance.creditsRemaining <= 15 
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-green-500/20 text-green-400 border-green-500/30"
                      }
                    >
                      {creditBalance.creditsRemaining <= 5 ? "Low" : creditBalance.creditsRemaining <= 15 ? "Moderate" : "Good"}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      Resets {format(new Date(creditBalance.cycleEnd), 'MMM d')}
                    </p>
                  </div>
                </div>
                <Progress 
                  value={(creditBalance.creditsUsed / creditBalance.creditsAllocated) * 100} 
                  className="h-2"
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{creditBalance.creditsUsed} used</span>
                  <span>{creditBalance.creditsRemaining} left</span>
                </div>
                {creditBalance.creditsRemaining <= 10 && creditBalance.tier === 'free' && (
                  <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                    <p className="text-sm">
                      <span className="font-medium">Need more AI chats?</span>{" "}
                      <span className="text-muted-foreground">Upgrade to Advanced for 300 credits/month.</span>
                    </p>
                    <Link href="/pricing">
                      <Button size="sm" variant="outline" className="mt-2 gap-1">
                        <Zap className="h-3 w-3" />
                        View Plans
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
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

              {/* AI Credits Usage */}
              {creditBalance && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-purple-400" />
                    AI Chat Credits
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Credits Used</span>
                      <span className="font-mono tabular-nums" data-testid="text-credits-usage">
                        {creditBalance.creditsUsed} / {creditBalance.creditsAllocated}
                      </span>
                    </div>
                    <Progress 
                      value={(creditBalance.creditsUsed / creditBalance.creditsAllocated) * 100} 
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Resets on {format(new Date(creditBalance.cycleEnd), 'MMMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              {tierData?.limits && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Other Usage This Month</h4>
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
