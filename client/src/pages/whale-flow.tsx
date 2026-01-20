/**
 * WHALE FLOW PAGE
 *
 * Dedicated page for tracking institutional options flow
 * Shows big money moves in real-time
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, RefreshCw, Settings, Bell, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import WhaleFlowMonitor from '@/components/dashboard/whale-flow-monitor';
import { cn } from '@/lib/utils';

export default function WhaleFlowPage() {
  const { toast } = useToast();
  const [isScanning, setIsScanning] = useState(false);

  const triggerScan = async () => {
    setIsScanning(true);
    try {
      const response = await fetch('/api/automations/options-flow/scan', {
        method: 'POST',
      });
      if (response.ok) {
        toast({
          title: 'Scan Complete',
          description: 'Options flow scan completed successfully',
        });
      }
    } catch (error) {
      toast({
        title: 'Scan Failed',
        description: 'Failed to trigger flow scan',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl blur-lg opacity-50" />
              <div className="relative p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
                <Target className="w-8 h-8 text-purple-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Whale Flow Monitor</h1>
              <p className="text-gray-400">Track institutional options activity in real-time</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={triggerScan}
              disabled={isScanning}
              className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isScanning && "animate-spin")} />
              {isScanning ? 'Scanning...' : 'Scan Now'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-400 hover:text-white"
            >
              <Bell className="w-4 h-4 mr-2" />
              Alerts
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-400 hover:text-white"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-purple-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-white mb-1">What is Whale Flow?</h3>
              <p className="text-sm text-gray-400">
                Large institutional trades (sweeps, blocks, unusual volume) often signal directional moves before they happen.
                When someone buys $3M+ in calls on a stock, that's a strong directional bet worth watching.
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1 text-purple-400">
                  <Target className="w-3 h-3" />
                  $5M+ = Mega Whale
                </span>
                <span className="flex items-center gap-1 text-blue-400">
                  <Target className="w-3 h-3" />
                  $1M+ = Whale
                </span>
                <span className="flex items-center gap-1 text-orange-400">
                  <Activity className="w-3 h-3" />
                  5x Vol/OI = Sweep
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main whale flow monitor */}
        <div className="lg:col-span-2">
          <WhaleFlowMonitor />
        </div>

        {/* Side panel */}
        <div className="space-y-6">
          {/* Quick stats */}
          <Card className="bg-gray-950/50 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Market Sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Overall Flow</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Bullish
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-400">Bullish Flow</span>
                    <span className="text-gray-400">68%</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full w-[68%] bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-red-400">Bearish Flow</span>
                    <span className="text-gray-400">32%</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full w-[32%] bg-gradient-to-r from-red-500 to-red-400 rounded-full" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top sectors */}
          <Card className="bg-gray-950/50 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Top Sectors by Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Technology', flow: '$45.2M', change: '+12%', bullish: true },
                  { name: 'Financials', flow: '$28.1M', change: '+8%', bullish: true },
                  { name: 'Healthcare', flow: '$15.7M', change: '-3%', bullish: false },
                  { name: 'Consumer', flow: '$12.3M', change: '+5%', bullish: true },
                  { name: 'Energy', flow: '$8.9M', change: '-7%', bullish: false },
                ].map((sector, i) => (
                  <div key={sector.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                      <span className="text-sm text-white">{sector.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-cyan-400">{sector.flow}</span>
                      <span className={cn(
                        "text-xs",
                        sector.bullish ? "text-emerald-400" : "text-red-400"
                      )}>
                        {sector.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Alert settings */}
          <Card className="bg-gray-950/50 border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">Alert Thresholds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Mega Whale Alert</span>
                  <span className="text-purple-400">$5M+</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Whale Alert</span>
                  <span className="text-blue-400">$1M+</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Sweep Alert</span>
                  <span className="text-orange-400">5x Vol/OI</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Unusual Activity</span>
                  <span className="text-yellow-400">Score 70+</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
