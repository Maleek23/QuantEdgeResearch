import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Settings, DollarSign, Bell, Eye, Zap, AlertTriangle } from "lucide-react";
import type { UserPreferences } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  
  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ['/api/preferences'],
  });

  const [formData, setFormData] = useState<Partial<UserPreferences>>({});

  useEffect(() => {
    if (preferences) {
      setFormData(preferences);
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
    const { id, userId, updatedAt, ...updateData } = formData;
    saveMutation.mutate(updateData);
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header - Glassmorphism */}
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10" />
        <div className="relative z-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-page-title">
            <div className="h-10 w-10 rounded-lg glass flex items-center justify-center">
              <Settings className="h-5 w-5 text-cyan-400" />
            </div>
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Customize your QuantEdge experience
          </p>
        </div>
      </div>

      <Tabs defaultValue="trading" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 glass" data-testid="tabs-settings">
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
          <div className="glass-card rounded-xl border-l-2 border-l-cyan-500">
            <div className="p-5 pb-3">
              <h3 className="text-lg font-semibold text-cyan-400">Trading Account Settings</h3>
              <p className="text-sm text-muted-foreground mt-1">Configure your trading parameters and risk management</p>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-size">Account Size ($)</Label>
                  <Input
                    id="account-size"
                    type="number"
                    value={formData.accountSize || 10000}
                    onChange={(e) => updateField('accountSize', parseFloat(e.target.value))}
                    className="glass"
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
                    className="glass"
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
                    className="glass"
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
                    className="glass"
                    data-testid="input-options-budget"
                  />
                  <p className="text-xs text-muted-foreground">Maximum spend on options contracts</p>
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-2">
                <Label htmlFor="holding-horizon">Holding Horizon</Label>
                <Select
                  value={formData.holdingHorizon || 'intraday'}
                  onValueChange={(value) => updateField('holdingHorizon', value)}
                >
                  <SelectTrigger id="holding-horizon" className="glass" data-testid="select-holding-horizon">
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
            </div>
          </div>
        </TabsContent>

        {/* Display Preferences */}
        <TabsContent value="display" className="space-y-4">
          <div className="glass-card rounded-xl border-l-2 border-l-blue-500">
            <div className="p-5 pb-3">
              <h3 className="text-lg font-semibold text-blue-400">Display Preferences</h3>
              <p className="text-sm text-muted-foreground mt-1">Customize how information is presented</p>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <p className="text-xs text-muted-foreground">Display timestamps in your timezone</p>
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
                      <SelectItem value="card">Card View</SelectItem>
                      <SelectItem value="table">Table View</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How trade ideas are displayed</p>
                </div>
              </div>

              <Separator className="bg-white/10" />

              <div className="flex items-center justify-between p-3 rounded-lg glass">
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

              <div className="flex items-center justify-between p-3 rounded-lg glass">
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
            </div>
          </div>
        </TabsContent>

        {/* Notification Preferences */}
        <TabsContent value="notifications" className="space-y-4">
          <div className="glass-card rounded-xl border-l-2 border-l-green-500">
            <div className="p-5 pb-3">
              <h3 className="text-lg font-semibold text-green-400">Alert Preferences</h3>
              <p className="text-sm text-muted-foreground mt-1">Configure Discord notifications and alerts</p>
            </div>
            <div className="px-5 pb-5 space-y-4">
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
                  Personal webhook for notifications (separate from platform alerts)
                </p>
              </div>

              <Separator className="bg-white/10" />

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg glass">
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

                <div className="flex items-center justify-between p-3 rounded-lg glass">
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

                <div className="flex items-center justify-between p-3 rounded-lg glass">
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

                <div className="flex items-center justify-between p-3 rounded-lg glass">
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
            </div>
          </div>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-4">
          <div className="glass-card rounded-xl border-l-2 border-l-purple-500">
            <div className="p-5 pb-3">
              <h3 className="text-lg font-semibold text-purple-400">Advanced Settings</h3>
              <p className="text-sm text-muted-foreground mt-1">Default filters and preferences</p>
            </div>
            <div className="px-5 pb-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-asset-filter">Default Asset Filter</Label>
                  <Select
                    value={formData.defaultAssetFilter || 'all'}
                    onValueChange={(value) => updateField('defaultAssetFilter', value)}
                  >
                    <SelectTrigger id="default-asset-filter" className="glass" data-testid="select-default-asset-filter">
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
                    <SelectTrigger id="default-confidence-filter" className="glass" data-testid="select-default-confidence-filter">
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
            </div>
          </div>

          <div className="glass-card rounded-xl p-5 border-l-2 border-l-amber-500">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-amber-400">Disclaimer</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  QuantEdge Research is for <strong className="text-foreground">educational and research purposes only</strong>. 
                  This platform provides quantitative analysis and AI-generated trade ideas, but does NOT constitute 
                  financial advice. All trading involves risk. Past performance does not guarantee future results.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button
          variant="glass-secondary"
          onClick={() => setFormData(preferences || {})}
          disabled={saveMutation.isPending}
          data-testid="button-reset-settings"
        >
          Reset
        </Button>
        <Button
          variant="glass"
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
