import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TrendingUp, TrendingDown, Zap, Target, DollarSign, Plus, RefreshCw, Eye, AlertTriangle, LineChart, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface OptionsFlow {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strikePrice: number;
  expiryDate: string;
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  premium: number;
  impliedVolatility: number;
  delta: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  flowType: 'block' | 'sweep' | 'unusual_volume' | 'dark_pool' | 'normal';
  unusualScore: number;
  detectedAt: string;
  isMegaWhale?: boolean; // For whale flow tracking
}

interface FlowStatus {
  isActive: boolean;
  lastScan: string | null;
  flowsDetected: number;
  todayFlows: OptionsFlow[];
  settings: {
    minPremium: number;
    minVolumeOIRatio: number;
    watchlist: string[];
    alertThreshold: number;
  };
}

interface ManualFlowEntry {
  symbol: string;
  optionType: 'call' | 'put';
  strikePrice: string;
  expiryDate: string;
  premiumAmount: string;
  notes: string;
}

export function SmartMoneyFlowTracker() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState<ManualFlowEntry>({
    symbol: '',
    optionType: 'call',
    strikePrice: '',
    expiryDate: '',
    premiumAmount: '',
    notes: ''
  });

  // UPDATED: Fetch whale flows from our dedicated API
  const { data: whaleFlowsRaw, isLoading } = useQuery({
    queryKey: ['/api/whale-flows/recent'],
    queryFn: async () => {
      const res = await fetch('/api/whale-flows/recent?limit=20');
      if (!res.ok) throw new Error('Failed to fetch whale flows');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Transform whale flows to match OptionsFlow format
  const todayFlows: OptionsFlow[] = (whaleFlowsRaw || []).map((flow: any) => ({
    id: flow.id,
    symbol: flow.symbol,
    optionType: flow.optionType,
    strikePrice: flow.strikePrice,
    expiryDate: flow.expiryDate,
    volume: 0, // Not tracked in whale flows
    openInterest: 0,
    volumeOIRatio: 0,
    premium: flow.premiumPerContract,
    impliedVolatility: 0,
    delta: 0,
    sentiment: flow.optionType === 'call' ? 'bullish' : 'bearish',
    flowType: 'block', // All whale flows shown as blocks
    unusualScore: flow.confidenceScore || 70,
    detectedAt: flow.detectedAt,
    isMegaWhale: flow.isMegaWhale, // Track mega whale status
  }));

  const flowStatus: FlowStatus = {
    isActive: true,
    lastScan: todayFlows[0]?.detectedAt || null,
    flowsDetected: todayFlows.length,
    todayFlows,
    settings: {
      minPremium: 10000, // $10k minimum for whale flows
      minVolumeOIRatio: 0,
      watchlist: [],
      alertThreshold: 70,
    },
  };

  const scanMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/automations/options-flow/scan'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whale-flows/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automations/options-flow/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/automations/options-flow/status'] });
      toast({ title: 'Flow scan complete', description: 'Whale flows updated' });
    },
    onError: () => {
      toast({ title: 'Scan failed', description: 'Check console for details', variant: 'destructive' });
    }
  });

  const createIdeaMutation = useMutation({
    mutationFn: async (entry: ManualFlowEntry) => {
      return apiRequest('POST', '/api/trade-ideas', {
        symbol: entry.symbol.toUpperCase(),
        assetType: 'option',
        direction: entry.optionType === 'call' ? 'LONG' : 'SHORT',
        holdingPeriod: 'swing',
        entryPrice: 0,
        targetPrice: 0,
        stopLoss: 0,
        riskRewardRatio: 2.0,
        catalyst: `INSIDER FLOW ALERT: ${entry.premiumAmount} in ${entry.optionType} contracts for ${entry.expiryDate}. ${entry.notes}`,
        analysis: `Manual flow intel entry. ${entry.notes}`,
        sessionContext: 'Smart money flow signal - manual entry',
        source: 'flow',
        confidenceScore: 80,
        probabilityBand: 'B',
        expiryDate: entry.expiryDate,
        strikePrice: parseFloat(entry.strikePrice) || 0,
        optionType: entry.optionType,
        qualitySignals: ['insider_flow', 'manual_intel', 'smart_money']
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      setIsAddDialogOpen(false);
      setManualEntry({ symbol: '', optionType: 'call', strikePrice: '', expiryDate: '', premiumAmount: '', notes: '' });
      toast({ title: 'Flow intel added', description: 'Trade idea created from your intel' });
    },
    onError: () => {
      toast({ title: 'Failed to add', description: 'Could not create trade idea', variant: 'destructive' });
    }
  });

  const getFlowTypeIcon = (type: string, isMegaWhale?: boolean) => {
    if (type === 'block') return isMegaWhale ? '🐋🐋' : '🐋'; // Double whale for mega whales
    switch (type) {
      case 'sweep': return '🧹';
      case 'dark_pool': return '🌑';
      case 'unusual_volume': return '📈';
      default: return '📊';
    }
  };

  const getFlowTypeBadge = (type: string, isMegaWhale?: boolean) => {
    const variants: Record<string, string> = {
      block: isMegaWhale ? 'bg-purple-600/30 text-purple-300 border-purple-500/50' : 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      sweep: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      dark_pool: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      unusual_volume: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    };
    return variants[type] || 'bg-muted text-muted-foreground';
  };

  const getFlowTypeLabel = (type: string, isMegaWhale?: boolean) => {
    if (type === 'block') return isMegaWhale ? 'MEGA WHALE' : 'WHALE';
    return type.replace('_', ' ').toUpperCase();
  };

  const formatPremium = (premium: number) => {
    if (premium >= 1000000) return `$${(premium / 1000000).toFixed(1)}M`;
    if (premium >= 1000) return `$${(premium / 1000).toFixed(0)}K`;
    return `$${premium.toFixed(0)}`;
  };

  const highConvictionFlows = todayFlows.filter(f => f.unusualScore >= 70).sort((a, b) => b.unusualScore - a.unusualScore);

  return (
    <Card data-testid="smart-money-flow-tracker">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-cyan-400" />
            <CardTitle className="text-lg">Smart Money Flow</CardTitle>
            {flowStatus?.isActive && (
              <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                LIVE
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" data-testid="button-add-flow-intel">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Intel
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Flow Intel</DialogTitle>
                  <DialogDescription>
                    Log insider or unusual flow activity you've observed
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Symbol</label>
                      <Input
                        placeholder="ZETA"
                        value={manualEntry.symbol}
                        onChange={(e) => setManualEntry(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                        data-testid="input-flow-symbol"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Type</label>
                      <Select 
                        value={manualEntry.optionType} 
                        onValueChange={(v) => setManualEntry(prev => ({ ...prev, optionType: v as 'call' | 'put' }))}
                      >
                        <SelectTrigger data-testid="select-flow-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">CALL (Bullish)</SelectItem>
                          <SelectItem value="put">PUT (Bearish)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Strike Price</label>
                      <Input
                        placeholder="25"
                        value={manualEntry.strikePrice}
                        onChange={(e) => setManualEntry(prev => ({ ...prev, strikePrice: e.target.value }))}
                        data-testid="input-flow-strike"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Expiry Date</label>
                      <Input
                        type="date"
                        value={manualEntry.expiryDate}
                        onChange={(e) => setManualEntry(prev => ({ ...prev, expiryDate: e.target.value }))}
                        data-testid="input-flow-expiry"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Premium Amount</label>
                    <Input
                      placeholder="$1.7M"
                      value={manualEntry.premiumAmount}
                      onChange={(e) => setManualEntry(prev => ({ ...prev, premiumAmount: e.target.value }))}
                      data-testid="input-flow-premium"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Notes / Source</label>
                    <Textarea
                      placeholder="Insider intel from flow data. Similar pattern seen on SERV before it ran..."
                      value={manualEntry.notes}
                      onChange={(e) => setManualEntry(prev => ({ ...prev, notes: e.target.value }))}
                      data-testid="input-flow-notes"
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => createIdeaMutation.mutate(manualEntry)}
                    disabled={!manualEntry.symbol || createIdeaMutation.isPending}
                    data-testid="button-submit-flow-intel"
                  >
                    {createIdeaMutation.isPending ? 'Creating...' : 'Create Trade Idea from Intel'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              data-testid="button-refresh-flow"
            >
              <RefreshCw className={`h-4 w-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <CardDescription>
          Track unusual options activity and smart money positioning
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading flow data...</div>
        ) : highConvictionFlows.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No high-conviction flows detected today</p>
            <p className="text-xs text-muted-foreground mt-1">Use "Add Intel" to log manual observations</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {highConvictionFlows.slice(0, 10).map((flow) => (
                <div
                  key={flow.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50 hover-elevate"
                  data-testid={`flow-item-${flow.symbol}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-xl">{getFlowTypeIcon(flow.flowType, flow.isMegaWhale)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link 
                          href={`/chart-analysis?symbol=${flow.symbol}`}
                          className="font-semibold hover:text-cyan-400 transition-colors"
                          data-testid={`link-flow-chart-${flow.symbol}`}
                        >
                          {flow.symbol}
                        </Link>
                        <Badge
                          variant="outline"
                          className={flow.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}
                        >
                          {flow.optionType.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className={getFlowTypeBadge(flow.flowType, flow.isMegaWhale)}>
                          {getFlowTypeLabel(flow.flowType, flow.isMegaWhale)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ${flow.strikePrice} • {flow.expiryDate.split('T')[0]} • Premium: {formatPremium(flow.premium)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge 
                            variant="outline" 
                            className={flow.unusualScore >= 80 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            {flow.unusualScore}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Unusual Score (0-100)</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="text-sm font-medium text-green-400 mt-1">
                      <DollarSign className="h-3 w-3 inline" />
                      {formatPremium(flow.premium)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(flow.detectedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        
        {flowStatus && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t text-xs text-muted-foreground">
            <span>{flowStatus.flowsDetected} flows detected today</span>
            {flowStatus.lastScan && (
              <span>Last scan: {formatDistanceToNow(new Date(flowStatus.lastScan), { addSuffix: true })}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
