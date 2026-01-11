import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GlassInput } from "@/components/ui/glass-input";
import { Label } from "@/components/ui/label";
import { GlassToggle } from "@/components/ui/glass-toggle";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { 
  Save, 
  RotateCcw,
  Shield,
  BarChart3,
  Wallet,
  Bell,
  Palette,
  Target,
  TrendingDown,
  Clock,
  AlertTriangle,
  PanelLeft
} from "lucide-react";
import { NavigationCustomizer } from "@/components/navigation-customizer";
import type { 
  UserPreferences, 
  RiskProfileConfig, 
  TechnicalThresholdConfig,
  RiskTier 
} from "@shared/schema";
import {
  DEFAULT_RISK_PROFILE,
  DEFAULT_TECHNICAL_THRESHOLDS
} from "@shared/schema";

const RISK_TIER_PRESETS: Record<RiskTier, Partial<RiskProfileConfig>> = {
  conservative: { maxPositionSizePercent: 1, maxDailyLossPercent: 2, maxCorrelatedPositions: 2 },
  moderate: { maxPositionSizePercent: 2, maxDailyLossPercent: 5, maxCorrelatedPositions: 3 },
  aggressive: { maxPositionSizePercent: 5, maxDailyLossPercent: 10, maxCorrelatedPositions: 5 },
  custom: {},
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("trading");
  
  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ['/api/preferences'],
  });

  const [formData, setFormData] = useState<Partial<UserPreferences>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (preferences) {
      setFormData({
        ...preferences,
        riskProfile: preferences.riskProfile || DEFAULT_RISK_PROFILE,
        technicalThresholds: preferences.technicalThresholds || DEFAULT_TECHNICAL_THRESHOLDS,
      });
      setHasChanges(false);
    }
  }, [preferences]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<UserPreferences>) => {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to save');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preferences'] });
      setHasChanges(false);
      toast({ title: "Settings saved", description: "Your preferences have been updated." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Save failed", description: error.message });
    },
  });

  const updateField = <K extends keyof UserPreferences>(field: K, value: UserPreferences[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const updateRiskProfile = (updates: Partial<RiskProfileConfig>) => {
    const current = (formData.riskProfile as RiskProfileConfig) || DEFAULT_RISK_PROFILE;
    updateField('riskProfile', { ...current, ...updates } as any);
  };

  const updateTechnicalThreshold = (indicator: keyof TechnicalThresholdConfig, updates: Partial<any>) => {
    const current = (formData.technicalThresholds as TechnicalThresholdConfig) || DEFAULT_TECHNICAL_THRESHOLDS;
    updateField('technicalThresholds', {
      ...current,
      [indicator]: { ...current[indicator], ...updates }
    } as any);
  };

  const handleTierChange = (tier: RiskTier) => {
    if (tier === 'custom') {
      updateRiskProfile({ tier });
    } else {
      updateRiskProfile({ tier, ...RISK_TIER_PRESETS[tier] });
    }
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleReset = () => {
    if (preferences) {
      setFormData({
        ...preferences,
        riskProfile: preferences.riskProfile || DEFAULT_RISK_PROFILE,
        technicalThresholds: preferences.technicalThresholds || DEFAULT_TECHNICAL_THRESHOLDS,
      });
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  const riskProfile = (formData.riskProfile as RiskProfileConfig) || DEFAULT_RISK_PROFILE;
  const technicals = (formData.technicalThresholds as TechnicalThresholdConfig) || DEFAULT_TECHNICAL_THRESHOLDS;

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground text-sm">Customize your trading preferences</p>
        </div>
        {hasChanges && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saveMutation.isPending} data-testid="button-reset">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 mb-6" data-testid="tabs-settings">
          <TabsTrigger value="trading" data-testid="tab-trading">
            <Wallet className="h-4 w-4 mr-2" />
            Trading
          </TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">
            <Shield className="h-4 w-4 mr-2" />
            Risk
          </TabsTrigger>
          <TabsTrigger value="technicals" data-testid="tab-technicals">
            <BarChart3 className="h-4 w-4 mr-2" />
            Technicals
          </TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-preferences">
            <Palette className="h-4 w-4 mr-2" />
            Display
          </TabsTrigger>
          <TabsTrigger value="navigation" data-testid="tab-navigation">
            <PanelLeft className="h-4 w-4 mr-2" />
            Navigation
          </TabsTrigger>
        </TabsList>

        {/* Trading Tab */}
        <TabsContent value="trading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Account & Position Sizing
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account-size">Account Size</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">$</span>
                  <GlassInput
                    id="account-size"
                    type="number"
                    value={formData.accountSize || 10000}
                    onChange={(e) => updateField('accountSize', parseFloat(e.target.value) || 10000)}
                    className="pl-7"
                    font="mono"
                    data-testid="input-account-size"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Max Risk Per Trade: {formData.maxRiskPerTrade || 1}%</Label>
                <Slider
                  min={0.5}
                  max={5}
                  step={0.5}
                  value={[formData.maxRiskPerTrade || 1]}
                  onValueChange={(v) => updateField('maxRiskPerTrade', v[0])}
                  data-testid="slider-max-risk"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-capital">Default Capital Per Trade</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">$</span>
                  <GlassInput
                    id="default-capital"
                    type="number"
                    value={formData.defaultCapitalPerIdea || 1000}
                    onChange={(e) => updateField('defaultCapitalPerIdea', parseFloat(e.target.value) || 1000)}
                    className="pl-7"
                    font="mono"
                    data-testid="input-default-capital"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="options-budget">Options Budget</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">$</span>
                  <GlassInput
                    id="options-budget"
                    type="number"
                    value={formData.defaultOptionsBudget || 250}
                    onChange={(e) => updateField('defaultOptionsBudget', parseFloat(e.target.value) || 250)}
                    className="pl-7"
                    font="mono"
                    data-testid="input-options-budget"
                  />
                </div>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Trading Style</Label>
                <Select
                  value={formData.holdingHorizon || 'intraday'}
                  onValueChange={(v) => updateField('holdingHorizon', v)}
                >
                  <SelectTrigger data-testid="select-holding-horizon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scalp">Scalp (Minutes)</SelectItem>
                    <SelectItem value="intraday">Intraday (Same Day)</SelectItem>
                    <SelectItem value="swing">Swing (2-5 Days)</SelectItem>
                    <SelectItem value="position">Position (Weeks+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Tab */}
        <TabsContent value="risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Risk Profile
              </CardTitle>
              <CardDescription>Choose a preset or customize your risk parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-4 gap-2">
                {(['conservative', 'moderate', 'aggressive', 'custom'] as RiskTier[]).map((tier) => (
                  <Button
                    key={tier}
                    variant={riskProfile.tier === tier ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleTierChange(tier)}
                    className="capitalize"
                    data-testid={`button-tier-${tier}`}
                  >
                    {tier}
                  </Button>
                ))}
              </div>

              <Separator />

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Target className="h-3 w-3" />
                    Max Position Size: {riskProfile.maxPositionSizePercent}%
                  </Label>
                  <Slider
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={[riskProfile.maxPositionSizePercent]}
                    onValueChange={(v) => updateRiskProfile({ maxPositionSizePercent: v[0], tier: 'custom' })}
                    data-testid="slider-max-position"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <TrendingDown className="h-3 w-3" />
                    Max Daily Loss: {riskProfile.maxDailyLossPercent}%
                  </Label>
                  <Slider
                    min={1}
                    max={20}
                    step={1}
                    value={[riskProfile.maxDailyLossPercent]}
                    onValueChange={(v) => updateRiskProfile({ maxDailyLossPercent: v[0], tier: 'custom' })}
                    data-testid="slider-max-daily-loss"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Max Correlated Positions</Label>
                  <Select
                    value={String(riskProfile.maxCorrelatedPositions)}
                    onValueChange={(v) => updateRiskProfile({ maxCorrelatedPositions: parseInt(v), tier: 'custom' })}
                  >
                    <SelectTrigger data-testid="select-correlated-positions">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 5, 10].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} positions</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Trade Confirmation</Label>
                  <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                    <GlassToggle
                      checked={riskProfile.requireConfirmation}
                      onCheckedChange={(c) => updateRiskProfile({ requireConfirmation: c })}
                      variant="cyan"
                      data-testid="switch-require-confirmation"
                    />
                    <span className="text-sm">Require manual approval</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technicals Tab */}
        <TabsContent value="technicals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Technical Indicators
              </CardTitle>
              <CardDescription>Customize thresholds and signal weights (±10 points)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'rsi' as const, name: 'RSI', settings: ['oversold', 'overbought'] },
                { key: 'adx' as const, name: 'ADX', settings: ['trendingMinimum', 'strongTrend'] },
                { key: 'volume' as const, name: 'Volume Surge', settings: ['surgeRatio'] },
                { key: 'macd' as const, name: 'MACD', settings: ['crossoverThreshold'] },
                { key: 'vwap' as const, name: 'VWAP', settings: ['deviationPercent'] },
                { key: 'bollinger' as const, name: 'Bollinger', settings: ['period', 'stdDev'] },
              ].map((indicator) => {
                const data = technicals[indicator.key];
                return (
                  <div key={indicator.key} className="p-4 rounded-lg border bg-card/50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <GlassToggle
                          checked={data.enabled}
                          onCheckedChange={(c) => updateTechnicalThreshold(indicator.key, { enabled: c })}
                          variant="green"
                          data-testid={`switch-${indicator.key}-enabled`}
                        />
                        <span className="font-medium">{indicator.name}</span>
                      </div>
                      {data.enabled && (
                        <div className="text-xs">
                          Weight: <span className={data.weightAdjustment > 0 ? 'text-green-500' : data.weightAdjustment < 0 ? 'text-red-500' : 'text-muted-foreground'}>
                            {data.weightAdjustment > 0 ? '+' : ''}{data.weightAdjustment}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {data.enabled && (
                      <div className="grid gap-4 sm:grid-cols-3 mt-3">
                        {indicator.settings.map((setting) => (
                          <div key={setting} className="space-y-1">
                            <Label className="text-xs capitalize">{setting.replace(/([A-Z])/g, ' $1')}: {(data as any)[setting]}</Label>
                            <Slider
                              min={setting === 'surgeRatio' ? 1 : setting === 'stdDev' ? 1 : setting === 'deviationPercent' ? 0.5 : 10}
                              max={setting === 'surgeRatio' ? 5 : setting === 'stdDev' ? 3 : setting === 'deviationPercent' ? 3 : 100}
                              step={setting === 'surgeRatio' || setting === 'stdDev' || setting === 'deviationPercent' ? 0.5 : 5}
                              value={[(data as any)[setting]]}
                              onValueChange={(v) => updateTechnicalThreshold(indicator.key, { [setting]: v[0] })}
                              data-testid={`slider-${indicator.key}-${setting}`}
                            />
                          </div>
                        ))}
                        <div className="space-y-1">
                          <Label className="text-xs">Weight Adjustment</Label>
                          <Slider
                            min={-10}
                            max={10}
                            step={1}
                            value={[data.weightAdjustment]}
                            onValueChange={(v) => updateTechnicalThreshold(indicator.key, { weightAdjustment: v[0] })}
                            data-testid={`slider-${indicator.key}-weight`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Display Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Layout Density</Label>
                <Select
                  value={formData.layoutDensity || 'comfortable'}
                  onValueChange={(v) => updateField('layoutDensity', v as 'compact' | 'comfortable' | 'spacious')}
                >
                  <SelectTrigger data-testid="select-layout-density">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="spacious">Spacious</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default View Mode</Label>
                <Select
                  value={formData.defaultViewMode || 'card'}
                  onValueChange={(v) => updateField('defaultViewMode', v)}
                >
                  <SelectTrigger data-testid="select-view-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Card View</SelectItem>
                    <SelectItem value="table">Table View</SelectItem>
                    <SelectItem value="compact">Compact View</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={formData.timezone || 'America/Chicago'}
                  onValueChange={(v) => updateField('timezone', v)}
                >
                  <SelectTrigger data-testid="select-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                    <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Asset Filter</Label>
                <Select
                  value={formData.defaultAssetFilter || 'all'}
                  onValueChange={(v) => updateField('defaultAssetFilter', v)}
                >
                  <SelectTrigger data-testid="select-asset-filter">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { field: 'enableTradeAlerts' as const, label: 'Trade Alerts' },
                  { field: 'enablePriceAlerts' as const, label: 'Price Alerts' },
                  { field: 'enablePerformanceAlerts' as const, label: 'Performance Alerts' },
                  { field: 'enableWeeklyReport' as const, label: 'Weekly Report' },
                ].map(({ field, label }) => (
                  <div key={field} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <span className="text-sm">{label}</span>
                    <GlassToggle
                      checked={formData[field] ?? true}
                      onCheckedChange={(c) => updateField(field, c)}
                      variant="cyan"
                      data-testid={`switch-${field}`}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="discord-webhook">Discord Webhook URL</Label>
                <GlassInput
                  id="discord-webhook"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={formData.discordWebhookUrl || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('discordWebhookUrl', e.target.value)}
                  data-testid="input-discord-webhook"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Navigation Tab */}
        <TabsContent value="navigation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PanelLeft className="h-4 w-4" />
                Sidebar Navigation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NavigationCustomizer />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating Save Button */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-50 flex gap-2 p-3 rounded-xl bg-background/95 border shadow-lg backdrop-blur">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saveMutation.isPending}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950">
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Quant Edge Labs is for <strong className="text-foreground">educational and research purposes only</strong>. 
            This platform does not constitute financial advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
