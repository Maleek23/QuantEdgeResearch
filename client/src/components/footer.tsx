import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Activity, 
  Bot, 
  Eye, 
  Shield,
  Zap,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

function useMarketStatus() {
  const getStatus = () => {
    const now = new Date();
    const etHour = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
    const day = now.getDay();
    
    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = etHour >= 9 && etHour < 16;
    const isPreMarket = etHour >= 4 && etHour < 9;
    const isAfterHours = etHour >= 16 && etHour < 20;
    
    let status = "CLOSED";
    let statusColor = "text-slate-500";
    let pulseColor = "bg-slate-500";
    
    if (isWeekday) {
      if (isMarketHours) {
        status = "MARKET OPEN";
        statusColor = "text-green-400";
        pulseColor = "bg-green-400";
      } else if (isPreMarket) {
        status = "PRE-MARKET";
        statusColor = "text-amber-400";
        pulseColor = "bg-amber-400";
      } else if (isAfterHours) {
        status = "AFTER HOURS";
        statusColor = "text-blue-400";
        pulseColor = "bg-blue-400";
      }
    }
    
    return { status, statusColor, pulseColor };
  };

  const [marketStatus, setMarketStatus] = useState(getStatus);

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketStatus(getStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return marketStatus;
}

function MarketStatusIndicator() {
  const { status, statusColor, pulseColor } = useMarketStatus();

  return (
    <div className="flex items-center gap-2" data-testid="market-status">
      <div className="relative">
        <div className={cn("h-2 w-2 rounded-full", pulseColor)} />
        {status !== "CLOSED" && (
          <div className={cn("absolute inset-0 h-2 w-2 rounded-full animate-ping", pulseColor, "opacity-75")} />
        )}
      </div>
      <span className={cn("text-xs font-mono font-medium tracking-wider", statusColor)}>
        {status}
      </span>
    </div>
  );
}

function LiveStatsBar() {
  const { data: botStatus } = useQuery<{ bots: { name: string; status: string }[] }>({
    queryKey: ["/api/automations/status"],
    refetchInterval: 60000,
  });

  const { data: watchlistData } = useQuery<{ symbol: string }[]>({
    queryKey: ["/api/watchlist"],
    refetchInterval: 120000,
  });

  const { data: regimeData } = useQuery<{ regime: string; vix: number }>({
    queryKey: ["/api/market-regime"],
    refetchInterval: 60000,
  });

  const activeBots = botStatus?.bots?.filter(b => b.status === "active")?.length || 0;
  const watchlistCount = watchlistData?.length || 0;
  const regime = regimeData?.regime || "Unknown";
  const vix = regimeData?.vix || 0;

  const getRegimeColor = (r: string) => {
    const lower = r.toLowerCase();
    if (lower.includes("greed") || lower.includes("low")) return "text-green-400";
    if (lower.includes("fear") || lower.includes("high")) return "text-red-400";
    if (lower.includes("neutral")) return "text-amber-400";
    return "text-slate-400";
  };

  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5" data-testid="stat-bots">
        <Bot className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-muted-foreground">Bots:</span>
        <span className="text-cyan-400 font-medium">{activeBots}</span>
      </div>
      
      <div className="h-3 w-px bg-slate-700" />
      
      <div className="flex items-center gap-1.5" data-testid="stat-watchlist">
        <Eye className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-muted-foreground">Watchlist:</span>
        <span className="text-purple-400 font-medium">{watchlistCount}</span>
      </div>
      
      <div className="h-3 w-px bg-slate-700" />
      
      <div className="flex items-center gap-1.5" data-testid="stat-regime">
        <Activity className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-muted-foreground">VIX:</span>
        <span className={cn("font-medium", getRegimeColor(regime))}>
          {vix.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function DataFeedIndicator() {
  const barHeights = [6, 10, 4, 8];
  
  return (
    <div className="flex items-center gap-2" data-testid="data-feed">
      <div className="flex items-center gap-1">
        <Radio className="h-3 w-3 text-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400 font-mono">LIVE</span>
      </div>
      <div className="flex gap-0.5 items-end">
        {barHeights.map((height, i) => (
          <div
            key={i}
            className="w-0.5 bg-green-400/80 rounded-full animate-pulse"
            style={{
              height: `${height}px`,
              animationDelay: `${i * 150}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-slate-800/50 bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-slate-900/80 backdrop-blur-sm py-2.5 px-4 mt-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 pr-3 border-r border-slate-700/50">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-foreground tracking-tight">QEL</span>
            </div>
            <MarketStatusIndicator />
          </div>
          
          <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-cyan-400 transition-colors" data-testid="footer-link-privacy">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-cyan-400 transition-colors" data-testid="footer-link-terms">
              Terms
            </Link>
          </div>
        </div>

        <div className="hidden lg:block">
          <LiveStatsBar />
        </div>

        <div className="flex items-center gap-4">
          <DataFeedIndicator />
          
          <div className="flex items-center gap-2 pl-3 border-l border-slate-700/50">
            <Shield className="h-3 w-3 text-red-400" />
            <span className="text-[10px] font-mono text-red-400/90 uppercase tracking-wider">
              Educational Only
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
