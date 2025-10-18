import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  LockOpen
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type AuthStep = "pin" | "password" | "authenticated";

export default function AdminPanel() {
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

  const handlePinSubmit = async () => {
    if (pinCode.length !== 4) {
      toast({ title: "Please enter 4 digits", variant: "destructive" });
      return;
    }

    try {
      const response = await apiRequest('POST', '/api/admin/verify-code', { code: pinCode });
      
      if (response.ok) {
        setAuthStep('password');
        toast({ title: "Access code verified", description: "Enter admin password" });
      } else {
        toast({ title: "Invalid access code", variant: "destructive" });
        setPinCode("");
      }
    } catch (error) {
      toast({ title: "Authentication failed", variant: "destructive" });
      setPinCode("");
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const response = await apiRequest('POST', '/api/admin/verify', { password });
      
      if (response.ok) {
        setAdminPassword(password);
        setAuthStep('authenticated');
        toast({ title: "Admin access granted", description: "Welcome back" });
      } else {
        toast({ title: "Invalid password", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Authentication failed", variant: "destructive" });
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
        {/* Aurora Background */}
        <div className="absolute inset-0 aurora-hero opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        
        <Card className="w-full max-w-md relative glass-card border-primary/20">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <Lock className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div>
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
        <div className="absolute inset-0 aurora-hero opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        
        <Card className="w-full max-w-md relative glass-card border-primary/20">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/20">
                <LockOpen className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <div>
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
      {/* Header with Aurora */}
      <div className="relative border-b aurora-hero">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background opacity-50" />
        <div className="container relative mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold flex items-center gap-3 text-display">
                <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                  <Shield className="h-7 w-7 text-primary" />
                </div>
                Admin Control Center
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">
                Platform management and analytics dashboard
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="default" className="h-8 px-4">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Administrator
              </Badge>
              <Button
                onClick={handleExportData}
                variant="outline"
                className="glass-card"
                data-testid="button-export-all"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Hero Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="glass-card border-blue-500/20 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Users
                </CardTitle>
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gradient">
                {(stats as any)?.totalUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-green-500 font-medium">
                  {(stats as any)?.premiumUsers || 0} premium
                </span>
                {' • '}
                {((stats as any)?.totalUsers || 0) - ((stats as any)?.premiumUsers || 0)} free
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-green-500/20 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Trade Ideas
                </CardTitle>
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gradient">
                {(stats as any)?.totalIdeas || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-amber-500 font-medium">
                  {(stats as any)?.activeIdeas || 0} active
                </span>
                {' • '}
                {(stats as any)?.closedIdeas || 0} closed
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-purple-500/20 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Win Rate
                </CardTitle>
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gradient">
                {(stats as any)?.winRate || 0}%
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                From {(stats as any)?.closedIdeas || 0} closed trades
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-cyan-500/20 hover-elevate">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Database
                </CardTitle>
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Database className="h-5 w-5 text-cyan-500" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gradient">
                <Activity className="h-8 w-8 text-green-500 inline" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                System operational
              </p>
            </CardContent>
          </Card>
        </div>

        {/* User Management & Trade Ideas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Users */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    User Management
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Platform user overview
                  </CardDescription>
                </div>
                <Badge variant="secondary">{(users as any[])?.length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(users as any[])?.slice(0, 10).map((user: any) => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover-elevate"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Users className="h-5 w-5 text-primary" />
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
                    <Badge 
                      variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {user.subscriptionTier || 'free'}
                    </Badge>
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

          {/* Recent Trade Ideas */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Trade Ideas
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Recent platform ideas
                  </CardDescription>
                </div>
                <Badge variant="secondary">{(allIdeas as any[])?.length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(allIdeas as any[])?.slice(0, 10).map((idea: any) => (
                  <div 
                    key={idea.id} 
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover-elevate"
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
                          {idea.outcomeStatus}
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
                    <p>No trade ideas yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Status */}
        <Card className="glass-card border-green-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-500" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium">API Services</p>
                  <p className="text-xs text-muted-foreground">Operational</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <p className="text-xs text-muted-foreground">Connected</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Market Data</p>
                  <p className="text-xs text-muted-foreground">Live</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
