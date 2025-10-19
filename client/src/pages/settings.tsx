import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings, DollarSign, Bell, Eye, Zap } from "lucide-react";
import type { UserPreferences } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  
  // Fetch current preferences
  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ['/api/preferences'],
  });

  // Local state for form
  const [formData, setFormData] = useState<Partial<UserPreferences>>(preferences || {});

  // Update form data when preferences load
  useState(() => {
    if (preferences) {
      setFormData(preferences);
    }
  });

  // Save preferences mutation
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
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated successfully.",
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
    saveMutation.mutate(formData);
  };

  const updateField = (field: keyof UserPreferences, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-64 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-page-title">
          <Settings className="h-8 w-8" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customize your QuantEdge experience
        </p>
      </div>

      <Tabs defaultValue="trading" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4" data-testid="tabs-settings">
          <TabsTrigger value="trading" data-testid="tab-trading">
            <DollarSign className="h-4 w-4 mr-2" />
            Trading
          </TabsTrigger>
          <TabsTrigger value="display" data-testid="tab-display">
            <Eye className="h-4 w-4 mr-2" />
            Display
          </TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">
            <Bell className="h-4 w-4 mr-2" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="advanced" data-testid="tab-advanced">
            <Zap className="h-4 w-4 mr-2" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Trading Preferences */}
        <TabsContent value="trading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trading Account Settings</CardTitle>
              <CardDescription>Configure your trading parameters and risk management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-size">Account Size ($)</Label>
                  <Input
                    id="account-size"
                    type="number"
                    value={formData.accountSize || 10000}
                    onChange={(e) => updateField('accountSize', parseFloat(e.target.value))}
                    data-testid="input-account-size"
                  />
                  <p className="text-xs text-muted-foreground">Total capital for position sizing calculations</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-risk">Max Risk Per Trade (%)</Label>
                  <Input
                    id="max-risk"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={formData.maxRiskPerTrade || 1}
                    onChange={(e) => updateField('maxRiskPerTrade', parseFloat(e.target.value))}
                    data-testid="input-max-risk"
                  />
                  <p className="text-xs text-muted-foreground">Maximum account risk per trade</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-capital">Default Capital Per Idea ($)</Label>
                  <Input
                    id="default-capital"
                    type="number"
                    value={formData.defaultCapitalPerIdea || 1000}
                    onChange={(e) => updateField('defaultCapitalPerIdea', parseFloat(e.target.value))}
                    data-testid="input-default-capital"
                  />
                  <p className="text-xs text-muted-foreground">Suggested allocation for stock trades</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="options-budget">Options Budget ($)</Label>
                  <Input
                    id="options-budget"
                    type="number"
                    value={formData.defaultOptionsBudget || 250}
                    onChange={(e) => updateField('defaultOptionsBudget', parseFloat(e.target.value))}
                    data-testid="input-options-budget"
                  />
                  <p className="text-xs text-muted-foreground">Maximum spend on options contracts</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="holding-horizon">Holding Horizon</Label>
                <Select
                  value={formData.holdingHorizon || 'intraday'}
                  onValueChange={(value) => updateField('holdingHorizon', value)}
                >
                  <SelectTrigger id="holding-horizon" data-testid="select-holding-horizon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scalp">Scalp (Minutes)</SelectItem>
                    <SelectItem value="intraday">Intraday (Same Day)</SelectItem>
                    <SelectItem value="swing">Swing (2-5 Days)</SelectItem>
                    <SelectItem value="position">Position (Weeks)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Preferred trade duration for timing analysis</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Display Preferences */}
        <TabsContent value="display" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Customize how information is presented</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={formData.timezone || 'America/Chicago'}
                    onValueChange={(value) => updateField('timezone', value)}
                  >
                    <SelectTrigger id="timezone" data-testid="select-timezone">
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
                  <p className="text-xs text-muted-foreground">Display timestamps in your timezone</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="view-mode">Default View Mode</Label>
                  <Select
                    value={formData.defaultViewMode || 'card'}
                    onValueChange={(value) => updateField('defaultViewMode', value)}
                  >
                    <SelectTrigger id="view-mode" data-testid="select-view-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">Card View</SelectItem>
                      <SelectItem value="table">Table View</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How trade ideas are displayed</p>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
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

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-refresh">Auto Refresh</Label>
                  <p className="text-xs text-muted-foreground">Automatically refresh prices and data</p>
                </div>
                <Switch
                  id="auto-refresh"
                  checked={formData.autoRefreshEnabled !== false}
                  onCheckedChange={(checked) => updateField('autoRefreshEnabled', checked)}
                  data-testid="switch-auto-refresh"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Preferences */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alert Preferences</CardTitle>
              <CardDescription>Configure Discord notifications and alerts</CardDescription>
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
                  data-testid="input-discord-webhook"
                />
                <p className="text-xs text-muted-foreground">
                  Personal webhook for notifications (separate from platform alerts)
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="trade-alerts">New Trade Idea Alerts</Label>
                    <p className="text-xs text-muted-foreground">Get notified when new ideas are generated</p>
                  </div>
                  <Switch
                    id="trade-alerts"
                    checked={formData.enableTradeAlerts !== false}
                    onCheckedChange={(checked) => updateField('enableTradeAlerts', checked)}
                    data-testid="switch-trade-alerts"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="price-alerts">Watchlist Price Alerts</Label>
                    <p className="text-xs text-muted-foreground">Alert when watchlist prices hit targets</p>
                  </div>
                  <Switch
                    id="price-alerts"
                    checked={formData.enablePriceAlerts !== false}
                    onCheckedChange={(checked) => updateField('enablePriceAlerts', checked)}
                    data-testid="switch-price-alerts"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="performance-alerts">Performance Updates</Label>
                    <p className="text-xs text-muted-foreground">Alert when ideas hit targets or stops</p>
                  </div>
                  <Switch
                    id="performance-alerts"
                    checked={formData.enablePerformanceAlerts || false}
                    onCheckedChange={(checked) => updateField('enablePerformanceAlerts', checked)}
                    data-testid="switch-performance-alerts"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="weekly-report">Weekly Performance Report</Label>
                    <p className="text-xs text-muted-foreground">Sunday recap of week's performance</p>
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

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>Default filters and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-asset-filter">Default Asset Filter</Label>
                  <Select
                    value={formData.defaultAssetFilter || 'all'}
                    onValueChange={(value) => updateField('defaultAssetFilter', value)}
                  >
                    <SelectTrigger id="default-asset-filter" data-testid="select-default-asset-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assets</SelectItem>
                      <SelectItem value="stock">Stock Shares Only</SelectItem>
                      <SelectItem value="option">Options Only</SelectItem>
                      <SelectItem value="crypto">Crypto Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Initial filter on Trade Ideas page</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-confidence-filter">Default Confidence Filter</Label>
                  <Select
                    value={formData.defaultConfidenceFilter || 'all'}
                    onValueChange={(value) => updateField('defaultConfidenceFilter', value)}
                  >
                    <SelectTrigger id="default-confidence-filter" data-testid="select-default-confidence-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      <SelectItem value="A">A Grade Only</SelectItem>
                      <SelectItem value="B">B Grade or Better</SelectItem>
                      <SelectItem value="C">C Grade or Better</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Quality threshold for ideas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-amber-500">Disclaimer</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                QuantEdge Research is for <strong>educational and research purposes only</strong>. 
                This platform provides quantitative analysis and AI-generated trade ideas, but does NOT constitute 
                financial advice. All trading involves risk. Past performance does not guarantee future results.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-3 mt-6">
        <Button
          variant="outline"
          onClick={() => setFormData(preferences || {})}
          disabled={saveMutation.isPending}
          data-testid="button-reset-settings"
        >
          Reset
        </Button>
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          data-testid="button-save-settings"
        >
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
