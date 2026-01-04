import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Bell, Clock, Palette, TrendingUp, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultSettings = {
  timezone: 'America/Chicago',
  autoRefresh: true,
  refreshInterval: '60',
  notifications: true,
  soundAlerts: false,
  minConfidenceScore: '70',
  showLowLiquidity: false,
  defaultView: 'new',
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { toast } = useToast();
  
  const [settings, setSettings] = useState(defaultSettings);

  // Load settings from localStorage when dialog opens
  useEffect(() => {
    if (open) {
      const saved = localStorage.getItem('quantedge-settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSettings({ ...defaultSettings, ...parsed });
        } catch (e) {
          console.error('Failed to parse saved settings:', e);
        }
      }
    }
  }, [open]);

  const handleSave = () => {
    localStorage.setItem('quantedge-settings', JSON.stringify(settings));
    toast({
      title: "Settings saved",
      description: "Your preferences have been updated successfully.",
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    localStorage.setItem('quantedge-settings', JSON.stringify(defaultSettings));
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-settings">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Customize your Quant Edge Labs experience
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Display Preferences */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Display Preferences</h3>
            </div>
            
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="timezone" className="text-sm">Timezone</Label>
                  <p className="text-xs text-muted-foreground">
                    Display times in your preferred timezone
                  </p>
                </div>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                >
                  <SelectTrigger className="w-[200px]" id="timezone" data-testid="select-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                    <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (LA)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="default-view" className="text-sm">Default Research Briefs View</Label>
                  <p className="text-xs text-muted-foreground">
                    Which tab to show when opening Research Briefs
                  </p>
                </div>
                <Select
                  value={settings.defaultView}
                  onValueChange={(value) => setSettings({ ...settings, defaultView: value })}
                >
                  <SelectTrigger className="w-[200px]" id="default-view" data-testid="select-default-view">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New Ideas</SelectItem>
                    <SelectItem value="options">Stock Options</SelectItem>
                    <SelectItem value="shares">Stock Shares</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Data & Refresh Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Data & Refresh</h3>
            </div>
            
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-refresh" className="text-sm">Auto-refresh prices</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically update market prices
                  </p>
                </div>
                <Switch
                  id="auto-refresh"
                  checked={settings.autoRefresh}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoRefresh: checked })}
                  data-testid="switch-auto-refresh"
                />
              </div>

              {settings.autoRefresh && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="refresh-interval" className="text-sm">Refresh interval</Label>
                    <p className="text-xs text-muted-foreground">
                      How often to refresh prices (seconds)
                    </p>
                  </div>
                  <Select
                    value={settings.refreshInterval}
                    onValueChange={(value) => setSettings({ ...settings, refreshInterval: value })}
                  >
                    <SelectTrigger className="w-[200px]" id="refresh-interval" data-testid="select-refresh-interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">60 seconds</SelectItem>
                      <SelectItem value="120">2 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Notifications */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Notifications</h3>
            </div>
            
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications" className="text-sm">Enable notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Get alerts for new research briefs and updates
                  </p>
                </div>
                <Switch
                  id="notifications"
                  checked={settings.notifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, notifications: checked })}
                  data-testid="switch-notifications"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sound-alerts" className="text-sm">Sound alerts</Label>
                  <p className="text-xs text-muted-foreground">
                    Play sound when new ideas are generated
                  </p>
                </div>
                <Switch
                  id="sound-alerts"
                  checked={settings.soundAlerts}
                  onCheckedChange={(checked) => setSettings({ ...settings, soundAlerts: checked })}
                  data-testid="switch-sound-alerts"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Research Brief Filters */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Research Brief Preferences</h3>
            </div>
            
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="min-confidence" className="text-sm">Minimum confidence score</Label>
                  <p className="text-xs text-muted-foreground">
                    Only show ideas above this confidence level
                  </p>
                </div>
                <Select
                  value={settings.minConfidenceScore}
                  onValueChange={(value) => setSettings({ ...settings, minConfidenceScore: value })}
                >
                  <SelectTrigger className="w-[200px]" id="min-confidence" data-testid="select-min-confidence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">60 (Grade C)</SelectItem>
                    <SelectItem value="70">70 (Grade B)</SelectItem>
                    <SelectItem value="80">80 (Grade A)</SelectItem>
                    <SelectItem value="90">90 (Grade A+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="low-liquidity" className="text-sm">Show low liquidity warnings</Label>
                  <p className="text-xs text-muted-foreground">
                    Display alerts for penny stocks and low-float securities
                  </p>
                </div>
                <Switch
                  id="low-liquidity"
                  checked={settings.showLowLiquidity}
                  onCheckedChange={(checked) => setSettings({ ...settings, showLowLiquidity: checked })}
                  data-testid="switch-low-liquidity"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Risk & Disclaimers */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Risk & Disclaimers</h3>
            </div>
            
            <div className="space-y-2 pl-6">
              <Badge variant="outline" className="text-xs">
                Educational Use Only
              </Badge>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Quant Edge Labs provides educational content for research purposes only. 
                This platform does not provide personalized financial advice. All trading involves 
                substantial risk of loss. Always conduct your own research and consider consulting 
                a qualified financial advisor.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleReset}
            data-testid="button-reset-settings"
          >
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-settings"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              data-testid="button-save-settings"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
