import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Wallet,
  Plus,
  RefreshCw,
  Trash2,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  X,
  Bell,
} from "lucide-react";
import { format } from "date-fns";

interface TrackedWallet {
  id: string;
  address: string;
  chain: "ethereum" | "solana";
  alias?: string;
  totalValue: number;
  lastSynced: string;
}

interface WalletHolding {
  tokenSymbol: string;
  tokenName: string;
  balance: number;
  usdValue: number;
}

interface WhaleActivity {
  id: string;
  from: string;
  to: string;
  amount: number;
  token: string;
  timestamp: string;
  direction: "in" | "out";
}

interface WalletAlert {
  id: string;
  walletId: string;
  walletAlias?: string;
  alertType: "large_transfer" | "token_accumulation" | "token_distribution";
  threshold: number;
}

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function ChainBadge({ chain }: { chain: "ethereum" | "solana" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs",
        chain === "ethereum"
          ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
          : "bg-amber-500/20 text-amber-400 border-amber-500/30"
      )}
    >
      {chain === "ethereum" ? "ETH" : "SOL"}
    </Badge>
  );
}

function AlertTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    large_transfer: "Large Transfer",
    token_accumulation: "Accumulation",
    token_distribution: "Distribution",
  };
  return (
    <Badge variant="secondary" className="text-xs">
      {labels[type] || type}
    </Badge>
  );
}

function AddWalletDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState<"ethereum" | "solana">("ethereum");
  const [alias, setAlias] = useState("");
  const { toast } = useToast();

  const addWalletMutation = useMutation({
    mutationFn: async (data: { address: string; chain: string; alias?: string }) => {
      return apiRequest("POST", "/api/wallets", data);
    },
    onSuccess: () => {
      toast({ title: "Wallet added successfully" });
      setOpen(false);
      setAddress("");
      setChain("ethereum");
      setAlias("");
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to add wallet", variant: "destructive" });
    },
  });

  const validateAddress = (addr: string, selectedChain: string): boolean => {
    if (selectedChain === "ethereum") {
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
    } else {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    }
  };

  const handleSubmit = () => {
    if (!validateAddress(address, chain)) {
      toast({
        title: "Invalid address format",
        description: chain === "ethereum" ? "Must be a valid ETH address (0x...)" : "Must be a valid Solana address",
        variant: "destructive",
      });
      return;
    }
    addWalletMutation.mutate({ address, chain, alias: alias || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="glass" data-testid="button-add-wallet">
          <Plus className="h-4 w-4 mr-2" />
          Add Wallet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Wallet to Track</DialogTitle>
          <DialogDescription>
            Enter a wallet address to monitor for whale activity
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="chain">Chain</Label>
            <Select value={chain} onValueChange={(v) => setChain(v as "ethereum" | "solana")}>
              <SelectTrigger data-testid="select-chain">
                <SelectValue placeholder="Select chain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ethereum">Ethereum</SelectItem>
                <SelectItem value="solana">Solana</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Wallet Address</Label>
            <Input
              id="address"
              placeholder={chain === "ethereum" ? "0x..." : "Solana address..."}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              data-testid="input-wallet-address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alias">Alias (optional)</Label>
            <Input
              id="alias"
              placeholder="e.g., Whale Wallet 1"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              data-testid="input-wallet-alias"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="glass"
            onClick={handleSubmit}
            disabled={addWalletMutation.isPending}
            data-testid="button-submit-wallet"
          >
            {addWalletMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Add Wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAlertDialog({ wallets, onSuccess }: { wallets: TrackedWallet[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState("");
  const [alertType, setAlertType] = useState<"large_transfer" | "token_accumulation" | "token_distribution">("large_transfer");
  const [threshold, setThreshold] = useState("100000");
  const { toast } = useToast();

  const createAlertMutation = useMutation({
    mutationFn: async (data: { walletId: string; alertType: string; threshold: number }) => {
      return apiRequest("POST", "/api/wallet-alerts", data);
    },
    onSuccess: () => {
      toast({ title: "Alert created successfully" });
      setOpen(false);
      setWalletId("");
      setAlertType("large_transfer");
      setThreshold("100000");
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to create alert", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const thresholdValue = parseFloat(threshold);
    if (isNaN(thresholdValue) || thresholdValue <= 0) {
      toast({ title: "Invalid threshold value", variant: "destructive" });
      return;
    }
    createAlertMutation.mutate({ walletId, alertType, threshold: thresholdValue });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-create-alert">
          <Bell className="h-4 w-4 mr-2" />
          Create Alert
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Wallet Alert</DialogTitle>
          <DialogDescription>
            Get notified when specific activity occurs
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger data-testid="select-alert-wallet">
                <SelectValue placeholder="Select wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.alias || shortenAddress(w.address)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Alert Type</Label>
            <Select value={alertType} onValueChange={(v) => setAlertType(v as typeof alertType)}>
              <SelectTrigger data-testid="select-alert-type">
                <SelectValue placeholder="Select alert type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="large_transfer">Large Transfer</SelectItem>
                <SelectItem value="token_accumulation">Token Accumulation</SelectItem>
                <SelectItem value="token_distribution">Token Distribution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Threshold ($)</Label>
            <Input
              type="number"
              placeholder="100000"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              data-testid="input-alert-threshold"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="glass"
            onClick={handleSubmit}
            disabled={createAlertMutation.isPending || !walletId}
            data-testid="button-submit-alert"
          >
            Create Alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HoldingsModal({
  wallet,
  open,
  onClose,
}: {
  wallet: TrackedWallet | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: holdings, isLoading } = useQuery<WalletHolding[]>({
    queryKey: ["/api/wallets", wallet?.id, "holdings"],
    enabled: open && !!wallet?.id,
  });

  if (!wallet) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Holdings: {wallet.alias || shortenAddress(wallet.address)}
          </DialogTitle>
          <DialogDescription>
            <ChainBadge chain={wallet.chain} />
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : holdings && holdings.length > 0 ? (
            <div className="space-y-2">
              {holdings.map((holding, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  data-testid={`holding-row-${idx}`}
                >
                  <div>
                    <p className="font-medium">{holding.tokenSymbol}</p>
                    <p className="text-sm text-muted-foreground">{holding.tokenName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono">{formatNumber(holding.balance)}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(holding.usdValue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No holdings found</p>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-holdings">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalletCard({
  wallet,
  onViewHoldings,
  onSync,
  onDelete,
  isSyncing,
}: {
  wallet: TrackedWallet;
  onViewHoldings: () => void;
  onSync: () => void;
  onDelete: () => void;
  isSyncing: boolean;
}) {
  return (
    <Card data-testid={`card-wallet-${wallet.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg truncate">
              {wallet.alias || shortenAddress(wallet.address)}
            </CardTitle>
            <ChainBadge chain={wallet.chain} />
          </div>
          {wallet.alias && (
            <CardDescription className="truncate font-mono text-xs">
              {shortenAddress(wallet.address)}
            </CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold font-mono" data-testid={`text-value-${wallet.id}`}>
              {formatCurrency(wallet.totalValue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Last synced: {format(new Date(wallet.lastSynced), "MMM d, yyyy HH:mm")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onViewHoldings} data-testid={`button-view-holdings-${wallet.id}`}>
              <Eye className="h-4 w-4 mr-1" />
              Holdings
            </Button>
            <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing} data-testid={`button-sync-${wallet.id}`}>
              <RefreshCw className={cn("h-4 w-4 mr-1", isSyncing && "animate-spin")} />
              Sync
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} data-testid={`button-delete-wallet-${wallet.id}`}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WalletTracker() {
  const { toast } = useToast();
  const [selectedWallet, setSelectedWallet] = useState<TrackedWallet | null>(null);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [syncingWalletId, setSyncingWalletId] = useState<string | null>(null);

  const { data: wallets, isLoading: walletsLoading } = useQuery<TrackedWallet[]>({
    queryKey: ["/api/wallets"],
  });

  const { data: whaleActivity, isLoading: activityLoading } = useQuery<WhaleActivity[]>({
    queryKey: ["/api/whale-activity"],
    refetchInterval: 30000,
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<WalletAlert[]>({
    queryKey: ["/api/wallet-alerts"],
  });

  const syncMutation = useMutation({
    mutationFn: async (walletId: string) => {
      setSyncingWalletId(walletId);
      return apiRequest("POST", `/api/wallets/${walletId}/sync`);
    },
    onSuccess: () => {
      toast({ title: "Wallet synced successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    },
    onError: () => {
      toast({ title: "Failed to sync wallet", variant: "destructive" });
    },
    onSettled: () => {
      setSyncingWalletId(null);
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: string) => {
      return apiRequest("DELETE", `/api/wallets/${walletId}`);
    },
    onSuccess: () => {
      toast({ title: "Wallet removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/wallets"] });
    },
    onError: () => {
      toast({ title: "Failed to delete wallet", variant: "destructive" });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return apiRequest("DELETE", `/api/wallet-alerts/${alertId}`);
    },
    onSuccess: () => {
      toast({ title: "Alert removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-alerts"] });
    },
    onError: () => {
      toast({ title: "Failed to delete alert", variant: "destructive" });
    },
  });

  const handleViewHoldings = (wallet: TrackedWallet) => {
    setSelectedWallet(wallet);
    setHoldingsOpen(true);
  };

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Whale Wallet Tracker</h1>
          <p className="text-muted-foreground">Monitor smart money movements on ETH & Solana</p>
        </div>
        <AddWalletDialog onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/wallets"] })} />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-4">Tracked Wallets</h2>
            {walletsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : wallets && wallets.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {wallets.map((wallet) => (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    onViewHoldings={() => handleViewHoldings(wallet)}
                    onSync={() => syncMutation.mutate(wallet.id)}
                    onDelete={() => deleteWalletMutation.mutate(wallet.id)}
                    isSyncing={syncingWalletId === wallet.id}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center" data-testid="empty-wallets">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No wallets tracked yet</p>
                <p className="text-sm text-muted-foreground">Add a wallet to start monitoring</p>
              </Card>
            )}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Whale Activity Feed</h2>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Large transactions (&gt;$100K) • Auto-refreshes every 30s</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {activityLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : whaleActivity && whaleActivity.length > 0 ? (
                    <div className="space-y-2">
                      {whaleActivity.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                          data-testid={`activity-row-${activity.id}`}
                        >
                          <div
                            className={cn(
                              "p-2 rounded-full",
                              activity.direction === "in"
                                ? "bg-green-500/20 text-green-500"
                                : "bg-red-500/20 text-red-500"
                            )}
                          >
                            {activity.direction === "in" ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-mono">{shortenAddress(activity.from)}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-mono">{shortenAddress(activity.to)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(activity.timestamp), "MMM d, HH:mm")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-medium">{formatCurrency(activity.amount)}</p>
                            <p className="text-xs text-muted-foreground">{activity.token}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                      <p>No whale activity detected</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Alerts</h2>
              {wallets && wallets.length > 0 && (
                <CreateAlertDialog
                  wallets={wallets}
                  onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/wallet-alerts"] })}
                />
              )}
            </div>
            <Card>
              <CardContent className="pt-4">
                <ScrollArea className="h-[400px]">
                  {alertsLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : alerts && alerts.length > 0 ? (
                    <div className="space-y-2">
                      {alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          data-testid={`alert-row-${alert.id}`}
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-sm">{alert.walletAlias || "Wallet"}</p>
                            <div className="flex items-center gap-2">
                              <AlertTypeBadge type={alert.alertType} />
                              <span className="text-xs text-muted-foreground">
                                &gt;{formatCurrency(alert.threshold)}
                              </span>
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteAlertMutation.mutate(alert.id)}
                            data-testid={`button-delete-alert-${alert.id}`}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2" />
                      <p>No active alerts</p>
                      {wallets && wallets.length > 0 && (
                        <p className="text-sm">Create an alert to get notified</p>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      <HoldingsModal
        wallet={selectedWallet}
        open={holdingsOpen}
        onClose={() => setHoldingsOpen(false)}
      />
    </div>
  );
}
