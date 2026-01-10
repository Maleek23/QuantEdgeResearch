import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
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
  MessageCircle,
  Bell,
  DollarSign,
  Palette,
  Layout,
  Save,
  RotateCcw,
  Target,
  Clock,
  Globe,
  Monitor,
  Smartphone,
  SlidersHorizontal,
  Heart,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Crown
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import type { UserPreferences } from "@shared/schema";

interface UserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  subscriptionTier: string;
  createdAt: string;
  isAdmin?: boolean;
}

interface TierData {
  tier: 'free' | 'advanced' | 'pro';
  limits: Record<string, number>;
  usage: Record<string, number>;
  isAdmin?: boolean;
}

interface CreditBalance {
  creditsRemaining: number;
  creditsUsed: number;
  creditsAllocated: number;
  cycleEnd: string;
  tier: string;
}

export default function AccountPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const { toast } = useToast();
  
  const { data: user, isLoading: userLoading } = useQuery<UserData>({
    queryKey: ['/api/auth/me'],
  });

  const { data: preferences, isLoading: prefsLoading } = useQuery<UserPreferences>({
    queryKey: ['/api/preferences'],
  });

  const { data: tierData } = useQuery<TierData>({
    queryKey: ['/api/user/tier'],
  });

  const { data: creditBalance } = useQuery<CreditBalance>({
    queryKey: ['/api/ai/credits'],
    enabled: !!user,
  });

  const [formData, setFormData] = useState<Partial<UserPreferences>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (preferences) {
      setFormData(preferences);
      setHasChanges(false);
    }
  }, [preferences]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<UserPreferences>) => {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to save preferences');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preferences'] });
      setHasChanges(false);
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: error.message || "Failed to save preferences",
      });
    },
  });

  const handleSave = () => {
    const { id, userId, updatedAt, ...updateData } = formData;
    saveMutation.mutate(updateData);
  };

  const updateField = (field: keyof UserPreferences, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const resetForm = () => {
    if (preferences) {
      setFormData(preferences);
      setHasChanges(false);
    }
  };

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
              Please log in to access your account
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

  const getTierBadge = (tier: string, isAdmin?: boolean) => {
    if (isAdmin || tier === 'admin') {
      return <Badge className="bg-gradient-to-r from-amber-500 to-red-500 text-white border-0"><Crown className="h-3 w-3 mr-1" />Admin</Badge>;
    }
    switch (tier?.toLowerCase()) {
      case 'pro':
        return <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">Pro</Badge>;
      case 'advanced':
        return <Badge className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0">Advanced</Badge>;
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
                {getTierBadge(tierData?.tier || user.subscriptionTier, tierData?.isAdmin || user.isAdmin)}
              </div>
              <p className="text-muted-foreground mt-1" data-testid="text-user-email">{user.email}</p>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Member {memberSince}
              </p>
            </div>

            {hasChanges && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetForm} disabled={saveMutation.isPending} data-testid="button-reset">
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950" data-testid="button-save">
                  <Save className="h-4 w-4 mr-1" />
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="glass-card grid w-full grid-cols-5 gap-1" data-testid="tabs-account">
          <TabsTrigger value="profile" className="data-[state=active]:bg-cyan-500/10 text-xs sm:text-sm" data-testid="tab-profile">
            <User className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="trading" className="data-[state=active]:bg-cyan-500/10 text-xs sm:text-sm" data-testid="tab-trading">
            <DollarSign className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Trading</span>
          </TabsTrigger>
          <TabsTrigger value="personalization" className="data-[state=active]:bg-cyan-500/10 text-xs sm:text-sm" data-testid="tab-personalization">
            <Palette className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Personalize</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-cyan-500/10 text-xs sm:text-sm" data-testid="tab-notifications">
            <Bell className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="data-[state=active]:bg-cyan-500/10 text-xs sm:text-sm" data-testid="tab-subscription">
            <Star className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Plan</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Quick Actions */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-cyan-400" />
                  Quick Actions
                </CardTitle>
                <CardDescription>Jump to your favorite features</CardDescription>
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
                <Link href="/performance">
                  <Button variant="ghost" className="w-full justify-between hover-elevate" data-testid="link-performance">
                    <span className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-cyan-400" />
                      </div>
                      Performance Analytics
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

            {/* AI Credits Card */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-purple-400" />
                  AI Assistant Credits
                </CardTitle>
                <CardDescription>Your monthly AI chat allowance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {creditBalance ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-3xl font-bold font-mono tabular-nums" data-testid="text-credits-remaining">
                          {creditBalance.creditsRemaining}
                          <span className="text-lg text-muted-foreground font-normal">
                            {" "}/ {creditBalance.creditsAllocated}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Credits remaining
                        </p>
                      </div>
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
                    </div>
                    <Progress 
                      value={(creditBalance.creditsUsed / creditBalance.creditsAllocated) * 100} 
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Resets {format(new Date(creditBalance.cycleEnd), 'MMMM d, yyyy')}
                    </p>
                  </>
                ) : (
                  <div className="h-20 flex items-center justify-center text-muted-foreground">
                    Loading credits...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Current Settings Summary */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-cyan-400" />
                Current Configuration
              </CardTitle>
              <CardDescription>Your active trading preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className="p-3 rounded-lg bg-muted/10 space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> Account Size
                  </p>
                  <p className="font-semibold font-mono tabular-nums">${(formData.accountSize || 10000).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10 space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Max Risk
                  </p>
                  <p className="font-semibold font-mono tabular-nums">{formData.maxRiskPerTrade || 1}%</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10 space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Holding Horizon
                  </p>
                  <p className="font-semibold capitalize">{formData.holdingHorizon || 'Intraday'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/10 space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Timezone
                  </p>
                  <p className="font-semibold">{(formData.timezone || 'America/Chicago').replace('America/', '')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trading Preferences Tab */}
        <TabsContent value="trading" className="space-y-4">
          <Card className="glass-card border-l-2 border-l-green-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-400" />
                Account & Risk Management
              </CardTitle>
              <CardDescription>Configure your trading parameters for accurate position sizing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3">
                  <Label htmlFor="account-size" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    Account Size
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="account-size"
                      type="number"
                      value={formData.accountSize || 10000}
                      onChange={(e) => updateField('accountSize', parseFloat(e.target.value))}
                      className="glass pl-7"
                      data-testid="input-account-size"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Total trading capital for position sizing</p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="max-risk" className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Max Risk Per Trade: <span className="text-cyan-400 font-mono">{formData.maxRiskPerTrade || 1}%</span>
                  </Label>
                  <Slider
                    id="max-risk"
                    min={0.5}
                    max={5}
                    step={0.5}
                    value={[formData.maxRiskPerTrade || 1]}
                    onValueChange={(value) => updateField('maxRiskPerTrade', value[0])}
                    className="py-2"
                    data-testid="slider-max-risk"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Conservative (0.5%)</span>
                    <span>Aggressive (5%)</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="default-capital" className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    Default Capital Per Trade
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="default-capital"
                      type="number"
                      value={formData.defaultCapitalPerIdea || 1000}
                      onChange={(e) => updateField('defaultCapitalPerIdea', parseFloat(e.target.value))}
                      className="glass pl-7"
                      data-testid="input-default-capital"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Suggested allocation for stock trades</p>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="options-budget" className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Options Budget
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="options-budget"
                      type="number"
                      value={formData.defaultOptionsBudget || 250}
                      onChange={(e) => updateField('defaultOptionsBudget', parseFloat(e.target.value))}
                      className="glass pl-7"
                      data-testid="input-options-budget"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Maximum spend per options contract</p>
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3">
                <Label htmlFor="holding-horizon" className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Trading Style / Holding Horizon
                </Label>
                <Select
                  value={formData.holdingHorizon || 'intraday'}
                  onValueChange={(value) => updateField('holdingHorizon', value)}
                >
                  <SelectTrigger id="holding-horizon" className="glass" data-testid="select-holding-horizon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scalp">Scalp (Minutes) - Quick in-and-out trades</SelectItem>
                    <SelectItem value="intraday">Intraday (Same Day) - Close before market close</SelectItem>
                    <SelectItem value="swing">Swing (2-5 Days) - Multi-day momentum plays</SelectItem>
                    <SelectItem value="position">Position (Weeks+) - Longer-term investments</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">This affects timing intelligence and exit recommendations</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-l-2 border-l-purple-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-purple-400" />
                Default Filters
              </CardTitle>
              <CardDescription>Set your preferred default view for research briefs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-asset-filter">Default Asset Type</Label>
                  <Select
                    value={formData.defaultAssetFilter || 'all'}
                    onValueChange={(value) => updateField('defaultAssetFilter', value)}
                  >
                    <SelectTrigger id="default-asset-filter" className="glass" data-testid="select-asset-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assets</SelectItem>
                      <SelectItem value="stock">Stocks Only</SelectItem>
                      <SelectItem value="option">Options Only</SelectItem>
                      <SelectItem value="crypto">Crypto Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-confidence-filter">Minimum Grade</Label>
                  <Select
                    value={formData.defaultConfidenceFilter || 'all'}
                    onValueChange={(value) => updateField('defaultConfidenceFilter', value)}
                  >
                    <SelectTrigger id="default-confidence-filter" className="glass" data-testid="select-confidence-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      <SelectItem value="A">A Grade Only (90%+)</SelectItem>
                      <SelectItem value="B">B Grade or Better (80%+)</SelectItem>
                      <SelectItem value="C">C Grade or Better (70%+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Personalization Tab */}
        <TabsContent value="personalization" className="space-y-4">
          <Card className="glass-card border-l-2 border-l-cyan-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layout className="h-5 w-5 text-cyan-400" />
                Interface Layout
              </CardTitle>
              <CardDescription>Customize how information is displayed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="layout-density">Layout Density</Label>
                  <Select
                    value={formData.layoutDensity || 'comfortable'}
                    onValueChange={(value) => updateField('layoutDensity', value)}
                  >
                    <SelectTrigger id="layout-density" className="glass" data-testid="select-layout-density">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact - Maximum information density</SelectItem>
                      <SelectItem value="comfortable">Comfortable - Balanced spacing</SelectItem>
                      <SelectItem value="spacious">Spacious - More breathing room</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="view-mode">Default View Mode</Label>
                  <Select
                    value={formData.defaultViewMode || 'card'}
                    onValueChange={(value) => updateField('defaultViewMode', value)}
                  >
                    <SelectTrigger id="view-mode" className="glass" data-testid="select-view-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">Card View - Visual cards with details</SelectItem>
                      <SelectItem value="table">Table View - Compact data grid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dashboard-preset">Dashboard Preset</Label>
                  <Select
                    value={formData.dashboardPreset || 'default'}
                    onValueChange={(value) => updateField('dashboardPreset', value)}
                  >
                    <SelectTrigger id="dashboard-preset" className="glass" data-testid="select-dashboard-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default - Balanced overview</SelectItem>
                      <SelectItem value="trading">Trading Focus - Charts & ideas first</SelectItem>
                      <SelectItem value="analytics">Analytics Focus - Performance metrics</SelectItem>
                      <SelectItem value="minimal">Minimal - Clean, essential info only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={formData.timezone || 'America/Chicago'}
                    onValueChange={(value) => updateField('timezone', value)}
                  >
                    <SelectTrigger id="timezone" className="glass" data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Display Options</h4>
                
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="compact-mode">Compact Mode</Label>
                    <p className="text-xs text-muted-foreground">Reduce spacing for more information density</p>
                  </div>
                  <Switch
                    id="compact-mode"
                    checked={formData.compactMode || false}
                    onCheckedChange={(checked) => updateField('compactMode', checked)}
                    data-testid="switch-compact-mode"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="animations">Animations</Label>
                    <p className="text-xs text-muted-foreground">Enable smooth transitions and effects</p>
                  </div>
                  <Switch
                    id="animations"
                    checked={formData.animationsEnabled !== false}
                    onCheckedChange={(checked) => updateField('animationsEnabled', checked)}
                    data-testid="switch-animations"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="sidebar-collapsed">Collapsed Sidebar</Label>
                    <p className="text-xs text-muted-foreground">Start with sidebar minimized</p>
                  </div>
                  <Switch
                    id="sidebar-collapsed"
                    checked={formData.sidebarCollapsed || false}
                    onCheckedChange={(checked) => updateField('sidebarCollapsed', checked)}
                    data-testid="switch-sidebar-collapsed"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-refresh">Auto Refresh Data</Label>
                    <p className="text-xs text-muted-foreground">Automatically refresh prices and market data</p>
                  </div>
                  <Switch
                    id="auto-refresh"
                    checked={formData.autoRefreshEnabled !== false}
                    onCheckedChange={(checked) => updateField('autoRefreshEnabled', checked)}
                    data-testid="switch-auto-refresh"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card className="glass-card border-l-2 border-l-green-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-green-400" />
                Alert Preferences
              </CardTitle>
              <CardDescription>Configure notifications and alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discord-webhook">Discord Webhook URL (Optional)</Label>
                <Input
                  id="discord-webhook"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={formData.discordWebhookUrl || ''}
                  onChange={(e) => updateField('discordWebhookUrl', e.target.value)}
                  className="glass"
                  data-testid="input-discord-webhook"
                />
                <p className="text-xs text-muted-foreground">
                  Personal webhook for trade alerts delivered to your Discord
                </p>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3">
                <h4 className="text-sm font-medium">Alert Types</h4>
                
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="trade-alerts" className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                      New Research Brief Alerts
                    </Label>
                    <p className="text-xs text-muted-foreground">Get notified when high-quality ideas are generated</p>
                  </div>
                  <Switch
                    id="trade-alerts"
                    checked={formData.enableTradeAlerts !== false}
                    onCheckedChange={(checked) => updateField('enableTradeAlerts', checked)}
                    data-testid="switch-trade-alerts"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="price-alerts" className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-cyan-400" />
                      Watchlist Price Alerts
                    </Label>
                    <p className="text-xs text-muted-foreground">Alert when watchlist prices hit your targets</p>
                  </div>
                  <Switch
                    id="price-alerts"
                    checked={formData.enablePriceAlerts !== false}
                    onCheckedChange={(checked) => updateField('enablePriceAlerts', checked)}
                    data-testid="switch-price-alerts"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="performance-alerts" className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-400" />
                      Performance Updates
                    </Label>
                    <p className="text-xs text-muted-foreground">Alert when ideas hit profit targets or stop losses</p>
                  </div>
                  <Switch
                    id="performance-alerts"
                    checked={formData.enablePerformanceAlerts || false}
                    onCheckedChange={(checked) => updateField('enablePerformanceAlerts', checked)}
                    data-testid="switch-performance-alerts"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-3 rounded-lg glass-card hover-elevate">
                  <div className="space-y-0.5">
                    <Label htmlFor="weekly-report" className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-amber-400" />
                      Weekly Performance Report
                    </Label>
                    <p className="text-xs text-muted-foreground">Sunday recap of your week's trading performance</p>
                  </div>
                  <Switch
                    id="weekly-report"
                    checked={formData.enableWeeklyReport || false}
                    onCheckedChange={(checked) => updateField('enableWeeklyReport', checked)}
                    data-testid="switch-weekly-report"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-4">
          <Card className="glass-card border-l-2 border-l-amber-500">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Your Subscription
              </CardTitle>
              <CardDescription>Manage your plan and view usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20">
                <div>
                  <p className="text-sm text-muted-foreground">Current Plan</p>
                  <p className="text-xl font-semibold mt-1 capitalize">
                    {(tierData?.isAdmin || user.isAdmin) ? 'Admin' : (tierData?.tier || user.subscriptionTier || 'Free')}
                  </p>
                </div>
                {getTierBadge(tierData?.tier || user.subscriptionTier, tierData?.isAdmin || user.isAdmin)}
              </div>

              {creditBalance && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-purple-400" />
                    AI Chat Credits
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Credits Used</span>
                      <span className="font-mono tabular-nums">
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

              {(!tierData?.isAdmin && !user.isAdmin && tierData?.tier !== 'pro') && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                  <h4 className="font-medium mb-2">Upgrade Your Experience</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Unlock unlimited AI chats, advanced scanners, and real-time alerts with Pro.
                  </p>
                  <Link href="/pricing">
                    <Button className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white border-0">
                      <Zap className="h-4 w-4" />
                      View Plans
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card p-5 border-l-2 border-l-amber-500">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-400">Educational Disclaimer</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Quant Edge Labs is for <strong className="text-foreground">educational and research purposes only</strong>. 
                  This platform provides quantitative analysis and AI-generated research briefs, but does NOT constitute 
                  financial advice. All trading involves risk.
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating Save Button */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-2 p-3 rounded-xl glass-card border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
          <Button variant="outline" size="sm" onClick={resetForm} disabled={saveMutation.isPending}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950">
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
