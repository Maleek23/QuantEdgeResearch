import { useState, Suspense, lazy } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Footer } from "@/components/footer";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { 
  Shield, 
  Users, 
  TrendingUp, 
  Database, 
  Download,
  Activity,
  DollarSign,
  Target,
  AlertCircle,
  CheckCircle2,
  Lock,
  LockOpen,
  Sparkles,
  Cpu,
  Clock,
  BarChart3,
  Zap,
  ArrowRight,
  Settings,
  Trash2,
  Edit,
  RefreshCw,
  Archive,
  Gauge,
  TrendingDown
} from "lucide-react";

const LossPatternsDashboard = lazy(() => import("@/components/loss-patterns-dashboard").then(m => ({ default: m.LossPatternsDashboard })));
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type AuthStep = "pin" | "password" | "authenticated";

export default function AdminPanel() {
  const [, setLocation] = useLocation();
  const [authStep, setAuthStep] = useState<AuthStep>("pin");
  const [pinCode, setPinCode] = useState("");
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const { toast } = useToast();

  const { data: stats } = useQuery({
    queryKey: ['/api/admin/stats'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    queryFn: async () => {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    }
  });

  const { data: users } = useQuery({
    queryKey: ['/api/admin/users'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    queryFn: async () => {
      const res = await fetch('/api/admin/users', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
  });

  const { data: allIdeas } = useQuery({
    queryKey: ['/api/admin/ideas'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    queryFn: async () => {
      const res = await fetch('/api/admin/ideas', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch ideas');
      return res.json();
    }
  });

  const { data: systemHealth } = useQuery({
    queryKey: ['/api/admin/system-health'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    refetchInterval: 30000, // 30s for system health
    staleTime: 15000,
    queryFn: async () => {
      const res = await fetch('/api/admin/system-health', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch health');
      return res.json();
    }
  });

  const { data: activities } = useQuery({
    queryKey: ['/api/admin/activity'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    queryFn: async () => {
      const res = await fetch('/api/admin/activity', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch activity');
      return res.json();
    }
  });

  const { data: alerts } = useQuery({
    queryKey: ['/api/admin/alerts'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    refetchInterval: 15000, // 15s for alerts (critical)
    staleTime: 10000,
    queryFn: async () => {
      const res = await fetch('/api/admin/alerts', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    }
  });

  const { data: alertSummary } = useQuery({
    queryKey: ['/api/admin/alerts/summary'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    refetchInterval: 15000, // 15s for alerts
    staleTime: 10000,
    queryFn: async () => {
      const res = await fetch('/api/admin/alerts/summary', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch summary');
      return res.json();
    }
  });

  const { data: apiMetrics } = useQuery({
    queryKey: ['/api/admin/api-metrics'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    refetchInterval: 30000, // 30s for metrics
    staleTime: 15000,
    queryFn: async () => {
      const res = await fetch('/api/admin/api-metrics', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    }
  });

  const { data: dbHealth } = useQuery({
    queryKey: ['/api/admin/database-health'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    refetchInterval: 60000, // Refresh every minute
    queryFn: async () => {
      const res = await fetch('/api/admin/database-health', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch db health');
      return res.json();
    }
  });

  // AI Provider Status - Real-time health check with billing/quota info
  const { data: aiProviderStatus, isLoading: aiStatusLoading, refetch: refetchAIStatus } = useQuery({
    queryKey: ['/api/admin/ai-provider-status'],
    enabled: authStep === 'authenticated' && !!adminPassword,
    refetchInterval: 120000, // 2 min for AI status (expensive check)
    staleTime: 60000,
    queryFn: async () => {
      const res = await fetch('/api/admin/ai-provider-status', {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch AI status');
      return res.json();
    }
  });

  const [testAIProvider, setTestAIProvider] = useState<'openai' | 'anthropic' | 'gemini'>('openai');
  const [testPrompt, setTestPrompt] = useState("Generate a bullish research brief for NVDA.");

  // User management mutations
  const updateUserTierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/tier`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword 
        },
        body: JSON.stringify({ tier })
      });
      if (!res.ok) throw new Error('Failed to update tier');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User tier updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update user tier", variant: "destructive" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete user", variant: "destructive" });
    }
  });

  // Database maintenance mutations
  const cleanupDatabaseMutation = useMutation({
    mutationFn: async (daysOld: number) => {
      const res = await fetch('/api/admin/database/cleanup', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword 
        },
        body: JSON.stringify({ daysOld })
      });
      if (!res.ok) throw new Error('Cleanup failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/database-health'] });
      toast({ title: "Database cleaned up", description: `Removed ${data.deletedIdeas} old research briefs` });
    },
    onError: () => {
      toast({ title: "Database cleanup failed", variant: "destructive" });
    }
  });

  const archiveDatabaseMutation = useMutation({
    mutationFn: async (daysOld: number) => {
      const res = await fetch('/api/admin/database/archive', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword 
        },
        body: JSON.stringify({ daysOld })
      });
      if (!res.ok) throw new Error('Archive failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/database-health'] });
      toast({ title: "Database archived", description: `Archived ${data.archivedIdeas} closed research briefs` });
    },
    onError: () => {
      toast({ title: "Database archive failed", variant: "destructive" });
    }
  });

  const optimizeDatabaseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/database/optimize', {
        method: 'POST',
        headers: { 'x-admin-password': adminPassword }
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

  const testAIMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await fetch('/api/admin/test-ai', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword 
        },
        body: JSON.stringify({ provider, prompt: testPrompt })
      });
      if (!res.ok) throw new Error('AI test failed');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: `${data.provider} test successful!`, description: "AI model is responding" });
      } else {
        toast({ title: `${data.provider} test failed`, description: data.error, variant: "destructive" });
      }
    }
  });

  const handlePinSubmit = async () => {
    if (pinCode.length !== 4) {
      toast({ title: "Please enter 4 digits", variant: "destructive" });
      return;
    }

    try {
      await apiRequest('POST', '/api/admin/verify-code', { code: pinCode });
      // If we reach here, auth succeeded (apiRequest throws on error)
      setAuthStep('password');
      toast({ title: "Access code verified", description: "Enter admin password" });
    } catch (error) {
      toast({ title: "Invalid access code", variant: "destructive" });
      setPinCode("");
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const res = await apiRequest('POST', '/api/admin/login', { password });
      const response = await res.json() as { success: boolean; expiresIn: string };
      // JWT token is now stored in HTTP-only cookie automatically (not accessible via JS)
      // Keep password in state for backward compatibility with legacy endpoints
      setAdminPassword(password);
      setAuthStep('authenticated');
      toast({ 
        title: "Admin access granted", 
        description: `Session expires in ${response.expiresIn}` 
      });
    } catch (error) {
      toast({ title: "Invalid password", variant: "destructive" });
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/admin/export-csv', {
        headers: { 'x-admin-password': adminPassword }
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quantedge-export-${new Date().toISOString()}.csv`;
      a.click();
      toast({ title: "Data exported successfully" });
    } catch (error) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  // PIN Entry Screen
  if (authStep === "pin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
        {/* Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(100,116,139,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 via-background to-background" />
        
        <Card className="w-full max-w-md relative glass-card border-slate-700/50">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                <Lock className="h-8 w-8 text-slate-400" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Security</p>
              <CardTitle className="text-2xl">Admin Access</CardTitle>
              <CardDescription className="text-base mt-2">
                Enter 4-digit security code
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={pinCode}
                onChange={(value) => setPinCode(value)}
                onComplete={handlePinSubmit}
                data-testid="input-pin-code"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-14 w-14 text-2xl" />
                  <InputOTPSlot index={1} className="h-14 w-14 text-2xl" />
                  <InputOTPSlot index={2} className="h-14 w-14 text-2xl" />
                  <InputOTPSlot index={3} className="h-14 w-14 text-2xl" />
                </InputOTPGroup>
              </InputOTP>
            </div>
            
            <Button 
              onClick={handlePinSubmit} 
              variant="glass"
              className="w-full"
              size="lg"
              disabled={pinCode.length !== 4}
              data-testid="button-verify-pin"
            >
              <Shield className="h-4 w-4 mr-2" />
              Verify Code
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Protected area · Authorized personnel only
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password Entry Screen
  if (authStep === "password") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(100,116,139,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 via-background to-background" />
        
        <Card className="w-full max-w-md relative glass-card border-slate-700/50">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-green-600/20 to-green-700/20 flex items-center justify-center border border-green-600/30">
                <LockOpen className="h-8 w-8 text-green-400" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Authenticated</p>
              <CardTitle className="text-2xl">Administrator Login</CardTitle>
              <CardDescription className="text-base mt-2">
                Enter admin password to continue
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              className="h-12 text-base"
              data-testid="input-admin-password"
            />
            
            <Button 
              onClick={handlePasswordSubmit} 
              variant="glass"
              className="w-full"
              size="lg"
              data-testid="button-admin-login"
            >
              <Shield className="h-4 w-4 mr-2" />
              Access Admin Panel
            </Button>

            <Button
              variant="ghost"
              onClick={() => {
                setAuthStep('pin');
                setPinCode("");
              }}
              className="w-full"
              size="sm"
            >
              ← Back to PIN entry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin Dashboard
  return (
    <div className="min-h-screen bg-background">
      {/* Header with Grid Background */}
      <div className="relative border-b border-slate-800">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(100,116,139,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(100,116,139,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 via-background to-background" />
        <div className="container relative mx-auto px-6 py-8">
          <div className="relative overflow-visible rounded-xl glass-card p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-600/10 via-transparent to-slate-500/10 rounded-xl" />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Administration</p>
                <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                    <Shield className="h-7 w-7 text-slate-400" />
                  </div>
                  Admin Control Center
                </h1>
                <p className="text-muted-foreground mt-2">
                  Platform management and analytics dashboard
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="default" className="h-8 px-4">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Administrator
                </Badge>
                <Button
                  onClick={() => setLocation('/dashboard')}
                  variant="glass-secondary"
                  data-testid="button-back-dashboard"
                >
                  <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                  Back to Dashboard
                </Button>
                <Button
                  onClick={handleExportData}
                  variant="glass"
                  data-testid="button-export-all"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Data
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Hero Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="glass-card border-slate-700/50 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total Users
                </span>
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                  <Users className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {(stats as any)?.totalUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-green-400 font-medium">
                  {(stats as any)?.premiumUsers || 0} premium
                </span>
                {' • '}
                {((stats as any)?.totalUsers || 0) - ((stats as any)?.premiumUsers || 0)} free
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-slate-700/50 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Research Briefs
                </span>
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-600/20 to-green-700/20 flex items-center justify-center border border-green-600/30">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tabular-nums">
                {(stats as any)?.totalIdeas || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-amber-400 font-medium">
                  {(stats as any)?.activeIdeas || 0} active
                </span>
                {' • '}
                {(stats as any)?.closedIdeas || 0} closed
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-slate-700/50 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Win Rate
                </span>
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-600/20 to-amber-700/20 flex items-center justify-center border border-amber-600/30">
                  <Target className="h-5 w-5 text-amber-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tabular-nums text-green-400">
                {(stats as any)?.winRate || 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                From {(stats as any)?.closedIdeas || 0} closed briefs
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-slate-700/50 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Database
                </span>
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                  <Database className="h-5 w-5 text-slate-400" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-green-400" />
                <span className="text-lg font-semibold font-mono text-green-400">Online</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                System operational
              </p>
            </CardContent>
          </Card>
        </div>

        {/* User Management & Research Briefs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Users */}
          <Card className="glass-card border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Management</p>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Users className="h-4 w-4 text-slate-400" />
                    </div>
                    Users
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="font-mono">{(users as any[])?.length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(users as any[])?.slice(0, 10).map((user: any) => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-700/50 hover-elevate"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                        <Users className="h-5 w-5 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {user.discordUsername || user.email || `User ${user.id.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.email || 'No email'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {user.subscriptionTier || 'free'}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const newTier = user.subscriptionTier === 'premium' ? 'free' : 'premium';
                          updateUserTierMutation.mutate({ userId: user.id, tier: newTier });
                        }}
                        disabled={updateUserTierMutation.isPending}
                        data-testid={`button-toggle-tier-${user.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete user ${user.discordUsername || user.email || user.id}?`)) {
                            deleteUserMutation.mutate(user.id);
                          }
                        }}
                        disabled={deleteUserMutation.isPending}
                        data-testid={`button-delete-user-${user.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No users yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Research Briefs */}
          <Card className="glass-card border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Recent</p>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-600/20 to-green-700/20 flex items-center justify-center border border-green-600/30">
                      <TrendingUp className="h-4 w-4 text-green-400" />
                    </div>
                    Research Briefs
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Recent platform briefs
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono">{(allIdeas as any[])?.length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(allIdeas as any[])?.slice(0, 10).map((idea: any) => (
                  <div 
                    key={idea.id} 
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{idea.symbol}</p>
                        <Badge variant="outline" className="text-xs">
                          {idea.assetType}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {idea.source} • {new Date(idea.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
                        <Badge 
                          variant={idea.outcomeStatus === 'hit_target' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          {idea.outcomeStatus === 'hit_target' ? 'Target Met' : 'Brief Closed'}
                        </Badge>
                      )}
                      {idea.outcomeStatus === 'open' && (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No research briefs yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Admin Tools */}
        <Card className="glass-card border-slate-700/50">
          <Tabs defaultValue="users" className="w-full">
            <CardHeader>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Admin Tools</p>
              <TabsList className="grid w-full grid-cols-8">
                <TabsTrigger value="users" data-testid="tab-users">
                  <Users className="h-4 w-4 mr-2" />
                  Users
                </TabsTrigger>
                <TabsTrigger value="system" data-testid="tab-system-health">
                  <Activity className="h-4 w-4 mr-2" />
                  System Health
                </TabsTrigger>
                <TabsTrigger value="loss-analysis" data-testid="tab-loss-analysis">
                  <TrendingDown className="h-4 w-4 mr-2" />
                  Loss Analysis
                </TabsTrigger>
                <TabsTrigger value="alerts" data-testid="tab-alerts">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Alerts
                </TabsTrigger>
                <TabsTrigger value="database" data-testid="tab-database">
                  <Database className="h-4 w-4 mr-2" />
                  Database
                </TabsTrigger>
                <TabsTrigger value="ai-test" data-testid="tab-ai-test">
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI Testing
                </TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">
                  <Clock className="h-4 w-4 mr-2" />
                  Activity Log
                </TabsTrigger>
                <TabsTrigger value="settings" data-testid="tab-settings">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* Users Management Tab */}
            <TabsContent value="users">
              <CardContent className="space-y-6">
                {/* User Stats Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Users</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">
                      {(users as any[])?.length || 0}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Free Tier</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-green-400">
                      {(users as any[])?.filter((u: any) => u.subscriptionTier === 'free').length || 0}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Advanced</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">
                      {(users as any[])?.filter((u: any) => u.subscriptionTier === 'advanced').length || 0}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Pro</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                      {(users as any[])?.filter((u: any) => u.subscriptionTier === 'pro').length || 0}
                    </p>
                  </div>
                </div>

                {/* Users Table */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">All Users</span>
                    <Badge variant="secondary" className="font-mono text-xs">{(users as any[])?.length || 0}</Badge>
                  </h3>
                  <div className="rounded-lg border border-slate-700/50 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">User</th>
                          <th className="px-4 py-3 text-left font-medium">Email</th>
                          <th className="px-4 py-3 text-left font-medium">Tier</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Joined</th>
                          <th className="px-4 py-3 text-left font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(users as any[])?.map((user: any) => (
                          <tr key={user.id} className="hover:bg-muted/30" data-testid={`row-user-${user.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {user.profileImageUrl ? (
                                  <img src={user.profileImageUrl} alt="" className="h-8 w-8 rounded-full" />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                    {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium">
                                  {user.firstName && user.lastName 
                                    ? `${user.firstName} ${user.lastName}` 
                                    : user.firstName || 'Unknown'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                            <td className="px-4 py-3">
                              <Badge 
                                variant={user.subscriptionTier === 'pro' ? 'default' : 
                                        user.subscriptionTier === 'advanced' ? 'secondary' : 'outline'}
                                className={user.subscriptionTier === 'pro' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : ''}
                              >
                                {user.subscriptionTier}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={user.subscriptionStatus === 'active' ? 'default' : 'destructive'}>
                                {user.subscriptionStatus || 'active'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <select
                                  className="text-xs px-2 py-1 rounded border bg-background"
                                  value={user.subscriptionTier}
                                  onChange={async (e) => {
                                    try {
                                      await fetch(`/api/admin/users/${user.id}`, {
                                        method: 'PATCH',
                                        headers: { 
                                          'Content-Type': 'application/json',
                                          'x-admin-password': adminPassword 
                                        },
                                        body: JSON.stringify({ subscriptionTier: e.target.value })
                                      });
                                      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
                                      toast({ title: 'User tier updated' });
                                    } catch {
                                      toast({ title: 'Failed to update user', variant: 'destructive' });
                                    }
                                  }}
                                  data-testid={`select-tier-${user.id}`}
                                >
                                  <option value="free">Free</option>
                                  <option value="advanced">Advanced</option>
                                  <option value="pro">Pro</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={async () => {
                                    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
                                    try {
                                      await fetch(`/api/admin/users/${user.id}`, {
                                        method: 'DELETE',
                                        headers: { 'x-admin-password': adminPassword }
                                      });
                                      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
                                      toast({ title: 'User deleted' });
                                    } catch {
                                      toast({ title: 'Failed to delete user', variant: 'destructive' });
                                    }
                                  }}
                                  data-testid={`button-delete-${user.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )) || (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                              <p>No users yet</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </TabsContent>

            {/* System Health Tab */}
            <TabsContent value="system">
              <CardContent className="space-y-6">
                {/* Database Status */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Database className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Database</span>
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">PostgreSQL</p>
                      <p className="text-xs text-muted-foreground">
                        {(systemHealth as any)?.database?.message || 'Connected'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* AI Providers - LIVE STATUS */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                        <Cpu className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Providers</span>
                      <Badge variant="outline" className="text-xs">Live</Badge>
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchAIStatus()}
                      disabled={aiStatusLoading}
                      data-testid="button-refresh-ai-status"
                    >
                      <RefreshCw className={`h-4 w-4 ${aiStatusLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  {aiStatusLoading && !aiProviderStatus ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Checking AI providers...</p>
                    </div>
                  ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {['anthropic', 'openai', 'gemini'].map((provider) => {
                        const providerData = (aiProviderStatus as any)?.providers?.[provider];
                        const status = providerData?.status || 'unknown';
                        const isConfigured = status === 'configured';
                        const isNotConfigured = status === 'not_configured';
                        const isOperational = status === 'operational';
                        const isBilling = status === 'billing_issue' || status === 'quota_exceeded';
                        const isRateLimited = status === 'rate_limited';
                        
                        const bgColor = isOperational || isConfigured
                          ? 'bg-green-500/10 border-green-500/30' 
                          : isNotConfigured
                            ? 'bg-gray-500/10 border-gray-500/30'
                            : isBilling 
                              ? 'bg-red-500/10 border-red-500/30'
                              : isRateLimited
                                ? 'bg-amber-500/10 border-amber-500/30'
                                : 'bg-gray-500/10 border-gray-500/30';
                        
                        const iconColor = isOperational || isConfigured
                          ? 'text-green-500' 
                          : isNotConfigured
                            ? 'text-gray-400'
                            : isBilling 
                              ? 'text-red-500'
                              : isRateLimited
                                ? 'text-amber-500'
                                : 'text-gray-500';

                        return (
                          <div 
                            key={provider}
                            className={`p-4 rounded-lg border ${bgColor}`}
                            data-testid={`status-ai-${provider}`}
                          >
                            <div className="flex items-start gap-3">
                              {isOperational || isConfigured ? (
                                <CheckCircle2 className={`h-6 w-6 ${iconColor} flex-shrink-0`} />
                              ) : (
                                <AlertCircle className={`h-6 w-6 ${iconColor} flex-shrink-0`} />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold capitalize">{provider}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {providerData?.model || 'Unknown model'}
                                  {providerData?.tier && ` (${providerData.tier})`}
                                </p>
                                <Badge 
                                  variant={isOperational || isConfigured ? "outline" : isNotConfigured ? "secondary" : "destructive"}
                                  className={`mt-2 text-xs ${isOperational || isConfigured ? 'border-green-500/50 text-green-500' : ''}`}
                                >
                                  {status === 'operational' ? 'Working' : 
                                   status === 'configured' ? 'Configured' :
                                   status === 'not_configured' ? 'Not Configured' :
                                   status === 'billing_issue' ? 'Billing Issue' :
                                   status === 'quota_exceeded' ? 'Quota Exhausted' :
                                   status === 'rate_limited' ? 'Rate Limited' : 'Error'}
                                </Badge>
                                {providerData?.keyPrefix && (
                                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                                    Key: {providerData.keyPrefix}
                                  </p>
                                )}
                                {providerData?.message && (
                                  <p className="text-xs text-muted-foreground mt-2 break-words">
                                    {providerData.message}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Generation Health Indicator */}
                    {(aiProviderStatus as any)?.providers?.generationHealth && (
                      <div className={`mt-3 p-3 rounded-lg border ${
                        (aiProviderStatus as any).providers.generationHealth.status === 'healthy' 
                          ? 'bg-green-500/10 border-green-500/30' 
                          : (aiProviderStatus as any).providers.generationHealth.status === 'stale'
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-gray-500/10 border-gray-500/30'
                      }`}>
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          <span className="text-sm font-medium">Generation Health:</span>
                          <Badge variant="outline">
                            {(aiProviderStatus as any).providers.generationHealth.status === 'healthy' 
                              ? 'Healthy' 
                              : (aiProviderStatus as any).providers.generationHealth.status === 'stale'
                                ? 'Stale (>24h)'
                                : (aiProviderStatus as any).providers.generationHealth.status === 'inactive'
                                  ? 'Inactive (>48h)'
                                  : 'No History'}
                          </Badge>
                        </div>
                        {(aiProviderStatus as any).providers.generationHealth.lastAIGeneration && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last AI generation: {new Date((aiProviderStatus as any).providers.generationHealth.lastAIGeneration).toLocaleString()}
                            {(aiProviderStatus as any).providers.generationHealth.hoursAgo !== null && (
                              <span> ({(aiProviderStatus as any).providers.generationHealth.hoursAgo}h ago)</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                    </>
                  )}
                </div>

                {/* Generation Stats */}
                {aiProviderStatus?.generationStats && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                        <Activity className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Generation Stats</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="stat-glass rounded-lg p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Ideas</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">
                          {aiProviderStatus.generationStats.total}
                        </p>
                      </div>
                      <div className="stat-glass rounded-lg p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Today</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-green-400">
                          {aiProviderStatus.generationStats.today?.total || 0}
                        </p>
                      </div>
                      <div className="stat-glass rounded-lg p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">This Week</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-purple-400">
                          {aiProviderStatus.generationStats.thisWeek?.total || 0}
                        </p>
                      </div>
                      <div className="stat-glass rounded-lg p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">AI Today</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                          {aiProviderStatus.generationStats.today?.bySource?.ai || 0}
                        </p>
                      </div>
                    </div>
                    
                    {/* Today's breakdown by source */}
                    <div className="mt-4 p-3 rounded-lg bg-muted/30 border">
                      <p className="text-xs font-semibold mb-2">Today's Generation by Source:</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(aiProviderStatus.generationStats.today?.bySource || {}).map(([source, count]) => (
                          <Badge key={source} variant="outline" className="text-xs">
                            {source}: {count as number}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Last generation timestamps */}
                    <div className="mt-3 p-3 rounded-lg bg-muted/30 border">
                      <p className="text-xs font-semibold mb-2">Last AI Generation:</p>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {aiProviderStatus.generationStats.lastGenerated?.ai && (
                          <span>AI: {new Date(aiProviderStatus.generationStats.lastGenerated.ai).toLocaleString()}</span>
                        )}
                        {aiProviderStatus.generationStats.lastGenerated?.quant && (
                          <span>Quant: {new Date(aiProviderStatus.generationStats.lastGenerated.quant).toLocaleString()}</span>
                        )}
                        {aiProviderStatus.generationStats.lastGenerated?.hybrid && (
                          <span>Hybrid: {new Date(aiProviderStatus.generationStats.lastGenerated.hybrid).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Market Data APIs */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Market Data Sources</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                      <CheckCircle2 className="h-6 w-6 text-green-400" />
                      <div>
                        <p className="text-sm font-medium">Yahoo Finance</p>
                        <p className="text-xs text-muted-foreground">Operational</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                      <CheckCircle2 className="h-6 w-6 text-green-400" />
                      <div>
                        <p className="text-sm font-medium">CoinGecko</p>
                        <p className="text-xs text-muted-foreground">Operational</p>
                      </div>
                    </div>
                    <div 
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        (systemHealth as any)?.marketData?.alphaVantage?.status === 'configured'
                          ? 'bg-green-500/5 border-green-500/20'
                          : 'bg-amber-500/5 border-amber-500/20'
                      }`}
                    >
                      {(systemHealth as any)?.marketData?.alphaVantage?.status === 'configured' ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500" />
                      ) : (
                        <AlertCircle className="h-6 w-6 text-amber-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">Alpha Vantage</p>
                        <p className="text-xs text-muted-foreground">
                          {(systemHealth as any)?.marketData?.alphaVantage?.status || 'Unknown'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </TabsContent>

            {/* AI Testing Tab */}
            <TabsContent value="ai-test">
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Zap className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Test AI Providers</span>
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Send a test prompt to verify AI models are responding correctly.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Test Prompt</label>
                      <Textarea
                        value={testPrompt}
                        onChange={(e) => setTestPrompt(e.target.value)}
                        placeholder="Enter test prompt..."
                        className="min-h-24"
                        data-testid="input-test-prompt"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Button
                        onClick={() => testAIMutation.mutate('openai')}
                        disabled={testAIMutation.isPending}
                        className="glass-card"
                        data-testid="button-test-openai"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Test OpenAI
                      </Button>
                      <Button
                        onClick={() => testAIMutation.mutate('anthropic')}
                        disabled={testAIMutation.isPending}
                        className="glass-card"
                        data-testid="button-test-anthropic"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Test Anthropic
                      </Button>
                      <Button
                        onClick={() => testAIMutation.mutate('gemini')}
                        disabled={testAIMutation.isPending}
                        className="glass-card"
                        data-testid="button-test-gemini"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Test Gemini
                      </Button>
                    </div>

                    {testAIMutation.data && (
                      <div className={`p-4 rounded-lg border ${
                        testAIMutation.data.success 
                          ? 'bg-green-500/10 border-green-500/20' 
                          : 'bg-red-500/10 border-red-500/20'
                      }`}
                        data-testid="test-result-panel"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {testAIMutation.data.success ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                          <span className="font-medium capitalize">
                            {testAIMutation.data.provider} Test {testAIMutation.data.success ? 'Successful' : 'Failed'}
                          </span>
                        </div>
                        {testAIMutation.data.error && (
                          <p className="text-sm text-muted-foreground">{testAIMutation.data.error}</p>
                        )}
                        {testAIMutation.data.success && (
                          <div className="space-y-1">
                            <p className="text-sm text-green-600 font-medium">
                              ✓ Generated {testAIMutation.data.ideaCount || 0} research brief(s)
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Provider is responding correctly
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </TabsContent>

            {/* Activity Log Tab */}
            <TabsContent value="activity">
              <CardContent>
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent Platform Activity</span>
                  </h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(activities as any[])?.map((activity: any) => (
                      <div 
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-slate-700/50 hover-elevate"
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          activity.type === 'trade_idea' 
                            ? 'bg-green-500/10' 
                            : 'bg-cyan-500/10'
                        }`}>
                          {activity.type === 'trade_idea' ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          ) : (
                            <Users className="h-4 w-4 text-cyan-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {activity.description.replace('trade idea', 'research brief').replace('Trade idea', 'Research brief')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(activity.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )) || (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No recent activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </TabsContent>

            {/* Loss Analysis Tab */}
            <TabsContent value="loss-analysis">
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-600/20 to-red-700/20 flex items-center justify-center border border-red-600/30">
                        <TrendingDown className="h-4 w-4 text-red-400" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Loss Pattern Analysis</span>
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Analyze losing trades to identify patterns and improve future performance
                    </p>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/loss-analysis/analyze-all', {
                          method: 'POST',
                          headers: { 'x-admin-password': adminPassword }
                        });
                        const data = await res.json();
                        if (data.success) {
                          toast({
                            title: "Analysis Complete",
                            description: `Analyzed ${data.analyzedCount} losing trades`,
                          });
                          queryClient.invalidateQueries({ queryKey: ['/api/loss-analysis'] });
                        } else {
                          toast({
                            title: "Analysis Failed",
                            description: data.error || "Unknown error",
                            variant: "destructive",
                          });
                        }
                      } catch (err) {
                        toast({
                          title: "Error",
                          description: "Failed to run loss analysis",
                          variant: "destructive",
                        });
                      }
                    }}
                    data-testid="button-analyze-all-losses"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Analyze All Losses
                  </Button>
                </div>
                <Suspense fallback={
                  <div className="h-64 w-full animate-pulse bg-muted/30 rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">Loading loss analysis...</span>
                  </div>
                }>
                  <LossPatternsDashboard />
                </Suspense>
              </CardContent>
            </TabsContent>

            {/* Alerts & Monitoring Tab */}
            <TabsContent value="alerts">
              <CardContent className="space-y-6">
                {/* Alert Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Critical</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-red-400">{(alertSummary as any)?.criticalAlerts || 0}</p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Errors</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-amber-400">{(alertSummary as any)?.errorAlerts || 0}</p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Warnings</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-yellow-400">{(alertSummary as any)?.warningAlerts || 0}</p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Failing APIs</p>
                    <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">{(alertSummary as any)?.failingAPIs || 0}</p>
                  </div>
                </div>

                {/* Recent Alerts */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent Alerts & Issues</span>
                  </h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {(alerts as any[])?.length > 0 ? (
                      (alerts as any[]).map((alert: any) => (
                        <div 
                          key={alert.id}
                          className={`p-3 rounded-lg border ${
                            alert.type === 'critical' ? 'border-red-500/30 bg-red-500/5' :
                            alert.type === 'error' ? 'border-amber-500/30 bg-amber-500/5' :
                            alert.type === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                            'border-cyan-500/30 bg-cyan-500/5'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge 
                                  variant={alert.resolved ? 'outline' : 'default'}
                                  className={`text-xs ${
                                    alert.type === 'critical' ? 'bg-red-500/20 text-red-500' :
                                    alert.type === 'error' ? 'bg-amber-500/20 text-amber-500' :
                                    alert.type === 'warning' ? 'bg-yellow-500/20 text-yellow-500' :
                                    'bg-cyan-500/20 text-cyan-400'
                                  }`}
                                >
                                  {alert.type.toUpperCase()}
                                </Badge>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {alert.category}
                                </Badge>
                                {alert.resolved && (
                                  <Badge variant="outline" className="text-xs text-green-500">
                                    Resolved
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm font-medium">{alert.message}</p>
                              {alert.details && (
                                <p className="text-xs text-muted-foreground mt-1">{alert.details}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(alert.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500 opacity-50" />
                        <p>No alerts - All systems operational</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* API Metrics */}
                {(apiMetrics as any[])?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                        <Zap className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">API Performance Metrics</span>
                    </h3>
                    <div className="space-y-2">
                      {(apiMetrics as any[]).map((metric: any, idx: number) => (
                        <div 
                          key={idx}
                          className="p-3 rounded-lg border border-slate-700/50 hover-elevate"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{metric.provider}</span>
                                <Badge variant="outline" className="text-xs">{metric.endpoint}</Badge>
                              </div>
                              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                <span>✓ {metric.successCount} success</span>
                                <span>✗ {metric.failureCount} failed</span>
                                {metric.avgResponseTime && (
                                  <span>⚡ {metric.avgResponseTime.toFixed(0)}ms avg</span>
                                )}
                              </div>
                            </div>
                            {metric.rateLimitWarning && (
                              <Badge variant="destructive" className="text-xs">
                                Rate Limit Warning
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </TabsContent>

            {/* Database Health Tab */}
            <TabsContent value="database">
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                    <p className="text-2xl font-bold font-mono text-green-400">
                      {(dbHealth as any)?.status === 'operational' ? 'Healthy' : 'Error'}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Database Size</p>
                    <p className="text-2xl font-bold font-mono tabular-nums">
                      {(dbHealth as any)?.databaseSize || 'Unknown'}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Last Checked</p>
                    <p className="text-lg font-mono">
                      {(dbHealth as any)?.lastChecked ? new Date((dbHealth as any).lastChecked).toLocaleTimeString() : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Table Statistics */}
                {(dbHealth as any)?.tables && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                        <Database className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Table Statistics</span>
                    </h3>
                    <div className="space-y-2">
                      {(dbHealth as any).tables.map((table: any, idx: number) => (
                        <div 
                          key={idx}
                          className="p-3 rounded-lg border border-slate-700/50 hover-elevate"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <span className="font-mono text-sm font-medium">{table.name}</span>
                              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                                <span>📊 {table.rowCount.toLocaleString()} rows</span>
                                <span>💾 {table.size}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Database Maintenance Tools */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Database Maintenance</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="glass-card border-slate-700/50 hover-elevate">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Trash2 className="h-4 w-4 text-amber-500" />
                          Cleanup Old Briefs
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Remove research briefs older than 30 days
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => {
                            if (confirm('Delete briefs older than 30 days? This cannot be undone.')) {
                              cleanupDatabaseMutation.mutate(30);
                            }
                          }}
                          disabled={cleanupDatabaseMutation.isPending}
                          variant="outline"
                          className="w-full"
                          data-testid="button-cleanup-database"
                        >
                          {cleanupDatabaseMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Clean Up
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="glass-card border-slate-700/50 hover-elevate">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Archive className="h-4 w-4 text-cyan-400" />
                          Archive Closed Trades
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Archive completed research briefs older than 7 days
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => {
                            if (confirm('Archive closed trades older than 7 days?')) {
                              archiveDatabaseMutation.mutate(7);
                            }
                          }}
                          disabled={archiveDatabaseMutation.isPending}
                          variant="outline"
                          className="w-full"
                          data-testid="button-archive-database"
                        >
                          {archiveDatabaseMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Archive className="h-4 w-4 mr-2" />
                          )}
                          Archive
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="glass-card border-slate-700/50 hover-elevate">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-green-400" />
                          Optimize Database
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Vacuum and analyze database tables
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => {
                            if (confirm('Optimize database tables? This may take a moment.')) {
                              optimizeDatabaseMutation.mutate();
                            }
                          }}
                          disabled={optimizeDatabaseMutation.isPending}
                          variant="outline"
                          className="w-full"
                          data-testid="button-optimize-database"
                        >
                          {optimizeDatabaseMutation.isPending ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Gauge className="h-4 w-4 mr-2" />
                          )}
                          Optimize
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {(dbHealth as any)?.error && (
                  <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
                    <div className="flex items-center gap-2 mb-2 text-red-500">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Database Error</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{(dbHealth as any).message}</p>
                  </div>
                )}
              </CardContent>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <div className="h-6 w-6 rounded bg-gradient-to-br from-slate-600/20 to-slate-700/20 flex items-center justify-center border border-slate-600/30">
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">System Configuration</span>
                  </h3>
                  
                  <div className="grid gap-6">
                    {/* API Keys Status */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">API Keys Status</p>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                          <span className="text-sm">Alpha Vantage API</span>
                          <Badge variant={apiMetrics?.alphaVantage?.configured ? "default" : "destructive"} data-testid="badge-alpha-vantage-status">
                            {apiMetrics?.alphaVantage?.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                          <span className="text-sm">Tradier API</span>
                          <Badge variant={apiMetrics?.tradier?.configured ? "default" : "destructive"} data-testid="badge-tradier-status">
                            {apiMetrics?.tradier?.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                          <span className="text-sm">OpenAI API</span>
                          <Badge variant={apiMetrics?.openai?.configured ? "default" : "destructive"} data-testid="badge-openai-status">
                            {apiMetrics?.openai?.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                          <span className="text-sm">Anthropic API</span>
                          <Badge variant={apiMetrics?.anthropic?.configured ? "default" : "destructive"} data-testid="badge-anthropic-status">
                            {apiMetrics?.anthropic?.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                          <span className="text-sm">Google Gemini API</span>
                          <Badge variant={apiMetrics?.gemini?.configured ? "default" : "destructive"} data-testid="badge-gemini-status">
                            {apiMetrics?.gemini?.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                          <span className="text-sm">Discord Webhook</span>
                          <Badge variant={apiMetrics?.discord?.configured ? "default" : "destructive"} data-testid="badge-discord-status">
                            {apiMetrics?.discord?.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* System Preferences */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">System Preferences</p>
                      <div className="p-4 rounded-lg border border-slate-700/50 bg-muted/20">
                        <p className="text-sm text-muted-foreground">
                          System-wide settings and preferences are managed through environment variables and database configuration. 
                          User-specific preferences can be configured through the Settings page.
                        </p>
                      </div>
                    </div>

                    {/* Session Management */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Session Management</p>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50 hover-elevate">
                        <div>
                          <span className="text-sm font-medium block">Admin Session</span>
                          <span className="text-xs text-muted-foreground">Currently logged in</span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setAuthStep("pin");
                            setPinCode("");
                            setPassword("");
                            setAdminPassword("");
                            toast({ 
                              title: "Logged out", 
                              description: "Admin session ended" 
                            });
                          }}
                          data-testid="button-admin-logout"
                        >
                          <LockOpen className="h-4 w-4 mr-2" />
                          Logout
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
