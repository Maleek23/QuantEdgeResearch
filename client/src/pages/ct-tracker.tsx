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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Plus,
  RefreshCw,
  Trash2,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  User,
  Heart,
  Repeat2,
  Clock,
  Target,
  BarChart3,
  AtSign,
  Hash,
  Send,
  Zap,
  Settings,
} from "lucide-react";
import { format } from "date-fns";

type Platform = "twitter" | "bluesky" | "reddit" | "discord" | "telegram";
type Sentiment = "bullish" | "bearish" | "neutral";

interface CTSource {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  followerCount?: number;
  mentionCount: number;
  successRate?: number;
  createdAt: string;
  autoFollowTrades?: boolean;
  maxAutoTradeSize?: number;
}

interface CTMention {
  id: string;
  sourceId: string;
  sourceName: string;
  sourcePlatform: Platform;
  content: string;
  tickers: string[];
  sentiment: Sentiment;
  likes?: number;
  retweets?: number;
  timestamp: string;
}

interface TopTicker {
  ticker: string;
  mentionCount: number;
  bullishPercent: number;
  bearishPercent: number;
}

interface CTPerformance {
  id: string;
  ticker: string;
  callType: "buy" | "sell";
  entryPrice: number;
  currentPrice?: number;
  exitPrice?: number;
  pnlPercent: number;
  status: "open" | "won" | "lost" | "breakeven";
  timestamp: string;
}

interface CTStats {
  totalMentions24h: number;
  bullishCount: number;
  bearishCount: number;
  topTrendingTicker: string;
  avgSuccessRate: number;
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const iconClass = cn("h-4 w-4", className);
  switch (platform) {
    case "twitter":
      return <AtSign className={iconClass} />;
    case "reddit":
      return <Hash className={iconClass} />;
    case "discord":
      return <Hash className={iconClass} />;
    case "telegram":
      return <Send className={iconClass} />;
    case "bluesky":
      return <MessageSquare className={iconClass} />;
    default:
      return <MessageSquare className={iconClass} />;
  }
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const colors: Record<Platform, string> = {
    twitter: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    bluesky: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    reddit: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    discord: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    telegram: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  };
  const labels: Record<Platform, string> = {
    twitter: "Twitter/X",
    bluesky: "Bluesky",
    reddit: "Reddit",
    discord: "Discord",
    telegram: "Telegram",
  };
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", colors[platform])}>
      <PlatformIcon platform={platform} className="h-3 w-3" />
      {labels[platform]}
    </Badge>
  );
}

function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const config = {
    bullish: { color: "bg-green-500/20 text-green-400 border-green-500/30", icon: TrendingUp },
    bearish: { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: TrendingDown },
    neutral: { color: "bg-white/10 text-muted-foreground border-white/10", icon: BarChart3 },
  };
  const { color, icon: Icon } = config[sentiment];
  return (
    <Badge variant="outline" className={cn("text-xs gap-1 capitalize", color)}>
      <Icon className="h-3 w-3" />
      {sentiment}
    </Badge>
  );
}

function TickerBadge({ ticker }: { ticker: string }) {
  return (
    <Badge variant="secondary" className="text-xs font-mono bg-primary/20 text-primary">
      ${ticker}
    </Badge>
  );
}

function highlightTickers(content: string, tickers: string[]): JSX.Element {
  if (!tickers.length) return <span>{content}</span>;
  const regex = new RegExp(`(\\$(?:${tickers.join("|")}))`, "gi");
  const parts = content.split(regex);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\$(\w+)$/i);
        if (match && tickers.map(t => t.toLowerCase()).includes(match[1].toLowerCase())) {
          return <TickerBadge key={i} ticker={match[1]} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function AddSourceDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("twitter");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [followerCount, setFollowerCount] = useState("");
  const { toast } = useToast();

  const addSourceMutation = useMutation({
    mutationFn: async (data: { platform: Platform; handle: string; displayName: string; followerCount?: number }) => {
      return apiRequest("POST", "/api/ct/sources", data);
    },
    onSuccess: () => {
      toast({ title: "Source added successfully" });
      setOpen(false);
      setPlatform("twitter");
      setHandle("");
      setDisplayName("");
      setFollowerCount("");
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to add source", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!handle.trim() || !displayName.trim()) {
      toast({ title: "Handle and display name are required", variant: "destructive" });
      return;
    }
    const followers = followerCount ? parseInt(followerCount, 10) : undefined;
    addSourceMutation.mutate({ platform, handle: handle.trim(), displayName: displayName.trim(), followerCount: followers });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-source">
          <Plus className="h-4 w-4 mr-2" />
          Add Source
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Influencer Source</DialogTitle>
          <DialogDescription>
            Track a crypto influencer across social platforms
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="platform">Platform</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger data-testid="select-platform">
                <SelectValue placeholder="Select platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="twitter">Twitter/X</SelectItem>
                <SelectItem value="bluesky">Bluesky</SelectItem>
                <SelectItem value="reddit">Reddit</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="handle">Handle/Username</Label>
            <Input
              id="handle"
              placeholder="@username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              data-testid="input-handle"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              placeholder="Crypto Trader"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-testid="input-display-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="followerCount">Follower Count (optional)</Label>
            <Input
              id="followerCount"
              type="number"
              placeholder="100000"
              value={followerCount}
              onChange={(e) => setFollowerCount(e.target.value)}
              data-testid="input-follower-count"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={addSourceMutation.isPending}
            data-testid="button-submit-source"
          >
            {addSourceMutation.isPending && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
            Add Source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatsCard({ title, value, subtitle, icon: Icon }: { title: string; value: string | number; subtitle?: string; icon: React.ElementType }) {
  return (
    <div className="stat-glass rounded-lg p-4" data-testid={`stats-card-${title.toLowerCase().replace(/ /g, '-')}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-cyan-400" />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono tabular-nums" data-testid={`text-stats-${title.toLowerCase().replace(/ /g, '-')}`}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function SourceCard({ source, onDelete, onRefresh }: { source: CTSource; onDelete: () => void; onRefresh: () => void }) {
  const { toast } = useToast();
  
  const toggleAutoFollow = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", `/api/ct/sources/${source.id}`, {
        autoFollowTrades: enabled,
        maxAutoTradeSize: enabled ? 100 : null
      });
    },
    onSuccess: (_data, variables) => {
      const wasEnabled = variables;
      toast({ 
        title: wasEnabled ? "Auto-follow enabled" : "Auto-follow disabled",
        description: wasEnabled 
          ? "New calls from this source will be auto-copied with $100 max position size"
          : "You will no longer automatically copy trades from this source"
      });
      onRefresh();
    },
    onError: () => {
      toast({ title: "Failed to update auto-follow settings", variant: "destructive" });
    }
  });

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg glass-card hover-elevate" data-testid={`source-row-${source.id}`}>
      <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
        <User className="h-5 w-5 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{source.displayName}</p>
          <PlatformBadge platform={source.platform} />
          {source.autoFollowTrades && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Auto-follow
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">@{source.handle}</p>
      </div>
      <div className="text-right hidden sm:block">
        {source.followerCount && (
          <p className="text-sm font-mono">{formatNumber(source.followerCount)} followers</p>
        )}
        <p className="text-xs text-muted-foreground">{source.mentionCount} mentions</p>
      </div>
      {source.successRate !== undefined && (
        <Badge variant="outline" className="hidden md:flex text-xs">
          {source.successRate.toFixed(0)}% success
        </Badge>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Switch
              checked={source.autoFollowTrades ?? false}
              onCheckedChange={(checked) => toggleAutoFollow.mutate(checked)}
              disabled={toggleAutoFollow.isPending}
              data-testid={`switch-auto-follow-${source.id}`}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{source.autoFollowTrades ? "Disable auto-follow trades" : "Enable auto-follow trades ($100 max)"}</p>
        </TooltipContent>
      </Tooltip>
      <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`button-delete-source-${source.id}`}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function TopTickerRow({ ticker, onClick, isSelected }: { ticker: TopTicker; onClick: () => void; isSelected: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg cursor-pointer hover-elevate transition-colors",
        isSelected ? "bg-cyan-500/10 border border-cyan-500/30" : "glass-subtle"
      )}
      onClick={onClick}
      data-testid={`ticker-row-${ticker.ticker}`}
    >
      <Badge variant="secondary" className="font-mono text-sm bg-blue-500/10 text-blue-400 border-blue-500/30">
        ${ticker.ticker}
      </Badge>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{ width: `${ticker.bullishPercent}%` }}
            />
          </div>
        </div>
      </div>
      <div className="text-right text-sm">
        <p className="font-mono">{ticker.mentionCount} mentions</p>
        <p className="text-xs text-muted-foreground">
          <span className="text-green-400">{ticker.bullishPercent}%</span>
          {" / "}
          <span className="text-red-400">{ticker.bearishPercent}%</span>
        </p>
      </div>
    </div>
  );
}

function MentionCard({ mention }: { mention: CTMention }) {
  return (
    <div className="p-4 rounded-lg glass-card space-y-3 hover-elevate" data-testid={`mention-card-${mention.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium">{mention.sourceName}</span>
        <PlatformBadge platform={mention.sourcePlatform} />
        <SentimentBadge sentiment={mention.sentiment} />
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {format(new Date(mention.timestamp), "MMM d, HH:mm")}
        </span>
      </div>
      <p className="text-sm leading-relaxed">
        {highlightTickers(mention.content, mention.tickers)}
      </p>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {mention.likes !== undefined && (
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {formatNumber(mention.likes)}
          </span>
        )}
        {mention.retweets !== undefined && (
          <span className="flex items-center gap-1">
            <Repeat2 className="h-3 w-3" />
            {formatNumber(mention.retweets)}
          </span>
        )}
      </div>
    </div>
  );
}

function PerformanceTable({ performance }: { performance: CTPerformance[] }) {
  const getStatusBadge = (status: CTPerformance["status"]) => {
    const config = {
      open: { color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "Open" },
      won: { color: "bg-green-500/20 text-green-400 border-green-500/30", label: "Won" },
      lost: { color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Lost" },
      breakeven: { color: "bg-white/10 text-muted-foreground border-white/10", label: "Breakeven" },
    };
    const { color, label } = config[status];
    return <Badge variant="outline" className={cn("text-xs", color)}>{label}</Badge>;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ticker</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">Current/Exit</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {performance.map((p) => (
          <TableRow key={p.id} data-testid={`performance-row-${p.id}`}>
            <TableCell className="font-mono">${p.ticker}</TableCell>
            <TableCell>
              <Badge variant={p.callType === "buy" ? "default" : "destructive"} className="text-xs">
                {p.callType.toUpperCase()}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono">${p.entryPrice.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono">
              ${(p.exitPrice || p.currentPrice || 0).toFixed(2)}
            </TableCell>
            <TableCell className={cn("text-right font-mono", p.pnlPercent >= 0 ? "text-green-400" : "text-red-400")}>
              {formatPercent(p.pnlPercent)}
            </TableCell>
            <TableCell>{getStatusBadge(p.status)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CTTracker() {
  const { toast } = useToast();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<Sentiment | "all">("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState<string>("24");
  const [performanceOpen, setPerformanceOpen] = useState(true);

  const { data: sources, isLoading: sourcesLoading } = useQuery<CTSource[]>({
    queryKey: ["/api/ct/sources"],
  });

  const { data: mentions, isLoading: mentionsLoading } = useQuery<CTMention[]>({
    queryKey: ["/api/ct/mentions", { hours: timeRangeFilter }],
  });

  const { data: topTickers, isLoading: tickersLoading } = useQuery<TopTicker[]>({
    queryKey: ["/api/ct/top-tickers", { limit: 10 }],
  });

  const { data: performance, isLoading: performanceLoading } = useQuery<CTPerformance[]>({
    queryKey: ["/api/ct/performance"],
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return apiRequest("DELETE", `/api/ct/sources/${sourceId}`);
    },
    onSuccess: () => {
      toast({ title: "Source removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/ct/sources"] });
    },
    onError: () => {
      toast({ title: "Failed to delete source", variant: "destructive" });
    },
  });

  const stats: CTStats = {
    totalMentions24h: mentions?.length || 0,
    bullishCount: mentions?.filter((m) => m.sentiment === "bullish").length || 0,
    bearishCount: mentions?.filter((m) => m.sentiment === "bearish").length || 0,
    topTrendingTicker: topTickers?.[0]?.ticker || "N/A",
    avgSuccessRate: sources?.length
      ? sources.filter((s) => s.successRate !== undefined).reduce((sum, s) => sum + (s.successRate || 0), 0) / sources.filter((s) => s.successRate !== undefined).length || 0
      : 0,
  };

  const bullishBearishRatio = stats.bearishCount > 0
    ? `${(stats.bullishCount / stats.bearishCount).toFixed(2)}:1`
    : stats.bullishCount > 0 ? `${stats.bullishCount}:0` : "N/A";

  const filteredMentions = mentions?.filter((m) => {
    if (sentimentFilter !== "all" && m.sentiment !== sentimentFilter) return false;
    if (selectedTicker && !m.tickers.map(t => t.toLowerCase()).includes(selectedTicker.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="container max-w-7xl mx-auto p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Social Intelligence</p>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-3" data-testid="text-page-title">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-cyan-400" />
            </div>
            CT Tracker
          </h1>
          <p className="text-muted-foreground mt-1">Crypto influencer intelligence & social signals</p>
        </div>
        <AddSourceDialog onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/ct/sources"] })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mentionsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatsCard
              title="Total Mentions (24h)"
              value={stats.totalMentions24h}
              icon={MessageSquare}
            />
            <StatsCard
              title="Bullish / Bearish"
              value={bullishBearishRatio}
              subtitle={`${stats.bullishCount} bullish, ${stats.bearishCount} bearish`}
              icon={TrendingUp}
            />
            <StatsCard
              title="Top Trending"
              value={`$${stats.topTrendingTicker}`}
              icon={BarChart3}
            />
            <StatsCard
              title="Avg Success Rate"
              value={`${stats.avgSuccessRate.toFixed(1)}%`}
              icon={Target}
            />
          </>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <User className="h-4 w-4 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold">Tracked Sources</h2>
            </div>
            {sourcesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : sources && sources.length > 0 ? (
              <div className="space-y-2">
                {sources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    onDelete={() => deleteSourceMutation.mutate(source.id)}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/ct/sources"] })}
                  />
                ))}
              </div>
            ) : (
              <div className="glass-card rounded-lg p-8 text-center" data-testid="empty-sources">
                <div className="h-12 w-12 mx-auto rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
                  <User className="h-6 w-6 text-purple-400" />
                </div>
                <p className="text-muted-foreground">No sources tracked yet</p>
                <p className="text-sm text-muted-foreground">Add a crypto influencer to start tracking</p>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-cyan-400" />
                </div>
                <h2 className="text-xl font-semibold">Recent Mentions</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={sentimentFilter} onValueChange={(v) => setSentimentFilter(v as Sentiment | "all")}>
                  <SelectTrigger className="w-32" data-testid="select-sentiment-filter">
                    <SelectValue placeholder="Sentiment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="bullish">Bullish</SelectItem>
                    <SelectItem value="bearish">Bearish</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={timeRangeFilter} onValueChange={setTimeRangeFilter}>
                  <SelectTrigger className="w-32" data-testid="select-time-filter">
                    <SelectValue placeholder="Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Last 6h</SelectItem>
                    <SelectItem value="24">Last 24h</SelectItem>
                    <SelectItem value="72">Last 3 days</SelectItem>
                    <SelectItem value="168">Last week</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTicker && (
                  <Button variant="outline" size="sm" onClick={() => setSelectedTicker(null)}>
                    Clear filter: ${selectedTicker}
                  </Button>
                )}
              </div>
            </div>
            <div className="glass-card rounded-lg">
              <ScrollArea className="h-[400px] p-4">
                {mentionsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
                  </div>
                ) : filteredMentions && filteredMentions.length > 0 ? (
                  <div className="space-y-4">
                    {filteredMentions.map((mention) => (
                      <MentionCard key={mention.id} mention={mention} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="h-12 w-12 mx-auto rounded-lg bg-cyan-500/10 flex items-center justify-center mb-2">
                      <MessageSquare className="h-6 w-6 text-cyan-400" />
                    </div>
                    <p>No mentions found</p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold">Top Tickers</h2>
            </div>
            <div className="glass-card rounded-lg p-4">
              {tickersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : topTickers && topTickers.length > 0 ? (
                <div className="space-y-2">
                  {topTickers.map((ticker) => (
                    <TopTickerRow
                      key={ticker.ticker}
                      ticker={ticker}
                      onClick={() => setSelectedTicker(selectedTicker === ticker.ticker ? null : ticker.ticker)}
                      isSelected={selectedTicker === ticker.ticker}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">No ticker data available</p>
              )}
            </div>
          </section>

          <section>
            <Collapsible open={performanceOpen} onOpenChange={setPerformanceOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto mb-4 hover-elevate">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Target className="h-4 w-4 text-green-400" />
                    </div>
                    <span className="text-xl font-semibold">Call Performance</span>
                  </div>
                  <ChevronDown className={cn("h-5 w-5 transition-transform", performanceOpen && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="glass-card rounded-lg">
                  <ScrollArea className="max-h-[300px]">
                    {performanceLoading ? (
                      <div className="p-4 space-y-2">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
                      </div>
                    ) : performance && performance.length > 0 ? (
                      <PerformanceTable performance={performance} />
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        <div className="h-12 w-12 mx-auto rounded-lg bg-green-500/10 flex items-center justify-center mb-2">
                          <Target className="h-6 w-6 text-green-400" />
                        </div>
                        <p>No tracked calls yet</p>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>
        </div>
      </div>
    </div>
  );
}
