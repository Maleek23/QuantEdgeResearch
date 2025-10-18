import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, TrendingUp, Database, Trash2, RefreshCw, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function AdminPanel() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { toast } = useToast();

  const { data: stats } = useQuery({
    queryKey: ['/api/admin/stats'],
    enabled: isAuthenticated
  });

  const { data: users } = useQuery({
    queryKey: ['/api/admin/users'],
    enabled: isAuthenticated
  });

  const { data: allIdeas } = useQuery({
    queryKey: ['/api/admin/ideas'],
    enabled: isAuthenticated
  });

  const handleLogin = async () => {
    try {
      const response = await apiRequest('/api/admin/verify', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      
      if (response.ok) {
        setIsAuthenticated(true);
        toast({ title: "Admin access granted" });
      } else {
        toast({ title: "Invalid password", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Authentication failed", variant: "destructive" });
    }
  };

  const handleClearTestData = async () => {
    if (!confirm("Clear all test trade ideas? This cannot be undone.")) return;
    
    try {
      await apiRequest('/api/admin/clear-test-data', { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ideas'] });
      toast({ title: "Test data cleared" });
    } catch (error) {
      toast({ title: "Failed to clear data", variant: "destructive" });
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/admin/export-csv');
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle>Admin Panel</CardTitle>
            </div>
            <CardDescription>Enter admin password to access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              data-testid="input-admin-password"
            />
            <Button 
              onClick={handleLogin} 
              className="w-full"
              data-testid="button-admin-login"
            >
              Access Admin Panel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">System management and analytics</p>
        </div>
        <Badge variant="default">Administrator</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.premiumUsers || 0} premium
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trade Ideas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalIdeas || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeIdeas || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.winRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {stats?.closedIdeas || 0} closed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.dbSize || "N/A"}</div>
            <p className="text-xs text-muted-foreground">Storage used</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="ideas">Trade Ideas</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>View and manage registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users?.map((user: any) => (
                  <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{user.discordUsername || user.email || `User ${user.id}`}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.subscriptionTier} • Joined {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'}>
                      {user.subscriptionTier}
                    </Badge>
                  </div>
                )) || <p className="text-muted-foreground">No users yet</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ideas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Trade Ideas</CardTitle>
              <CardDescription>View ideas from all users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {allIdeas?.map((idea: any) => (
                  <div key={idea.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{idea.symbol}</p>
                      <p className="text-sm text-muted-foreground">
                        {idea.source} • {new Date(idea.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Badge>{idea.assetType}</Badge>
                      {idea.outcome && (
                        <Badge variant={idea.outcome === 'won' ? 'default' : 'destructive'}>
                          {idea.outcome}
                        </Badge>
                      )}
                    </div>
                  </div>
                )) || <p className="text-muted-foreground">No trade ideas yet</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Admin Tools</CardTitle>
              <CardDescription>Database management and exports</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Button 
                  variant="outline" 
                  onClick={handleExportData}
                  data-testid="button-export-data"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => queryClient.invalidateQueries()}
                  data-testid="button-refresh-cache"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Cache
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleClearTestData}
                  data-testid="button-clear-test-data"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Test Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
