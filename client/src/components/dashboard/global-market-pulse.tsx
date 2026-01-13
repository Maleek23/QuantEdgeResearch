import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  ChevronRight,
  Globe,
  Bitcoin,
  BarChart3
} from "lucide-react";
import { useRealtimePrices } from "@/context/realtime-prices-context";
import { Link } from "wouter";

interface AssetData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  type: "equity" | "crypto";
}

function MarketGauge({ value, label, size = "default" }: { value: number; label: string; size?: "default" | "small" }) {
  const rotation = (value / 100) * 180 - 90;
  const gradientId = `gaugeGrad-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const getColor = () => {
    if (value < 30) return "#ef4444";
    if (value < 50) return "#f59e0b";
    if (value < 70) return "#22c55e";
    return "#10b981";
  };
  
  const isSmall = size === "small";
  
  return (
    <div className="flex flex-col items-center">
      <div className={cn("relative overflow-hidden", isSmall ? "w-20 h-10" : "w-28 h-14")}>
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path
            d="M 10 45 A 40 40 0 0 1 90 45"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.3"
          />
          <path
            d="M 10 45 A 40 40 0 0 1 90 45"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 126} 126`}
          />
          <circle
            cx={50 + 35 * Math.cos((rotation * Math.PI) / 180)}
            cy={45 + 35 * Math.sin((rotation * Math.PI) / 180)}
            r="4"
            fill={getColor()}
            className="drop-shadow-lg"
          />
        </svg>
      </div>
      <span className={cn("font-bold font-mono text-white", isSmall ? "text-xl mt-1" : "text-2xl mt-2")}>{Math.round(value)}</span>
      <span className={cn("text-slate-400", isSmall ? "text-[10px]" : "text-xs")}>{label}</span>
    </div>
  );
}

function AssetTicker({ asset }: { asset: AssetData }) {
  const isPositive = asset.change >= 0;
  
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          asset.type === "crypto" ? "bg-amber-500/20" : "bg-cyan-500/20"
        )}>
          {asset.type === "crypto" ? (
            <Bitcoin className="w-4 h-4 text-amber-400" />
          ) : (
            <BarChart3 className="w-4 h-4 text-cyan-400" />
          )}
        </div>
        <div>
          <span className="block text-sm font-medium text-white">{asset.symbol}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">{asset.name}</span>
        </div>
      </div>
      <div className="text-right">
        <span className="block text-sm font-bold font-mono text-white">
          ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className={cn(
          "text-xs font-mono flex items-center justify-end gap-1",
          isPositive ? "text-emerald-400" : "text-red-400"
        )}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? "+" : ""}{asset.change.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

export function GlobalMarketPulse() {
  const { getPrice, isConnected } = useRealtimePrices();
  const [activeView, setActiveView] = useState<"all" | "equity" | "crypto">("all");
  
  const spyPrice = getPrice("SPY");
  const qqqPrice = getPrice("QQQ");
  const diaPrice = getPrice("DIA");
  const btcPrice = getPrice("BTC");
  const ethPrice = getPrice("ETH");
  
  const assets: AssetData[] = useMemo(() => {
    const list: AssetData[] = [];
    
    if (spyPrice?.price) {
      const change = spyPrice.previousPrice 
        ? ((spyPrice.price - spyPrice.previousPrice) / spyPrice.previousPrice) * 100 
        : 0;
      list.push({ symbol: "SPY", name: "S&P 500", price: spyPrice.price, change, type: "equity" });
    }
    
    if (qqqPrice?.price) {
      const change = qqqPrice.previousPrice 
        ? ((qqqPrice.price - qqqPrice.previousPrice) / qqqPrice.previousPrice) * 100 
        : 0;
      list.push({ symbol: "QQQ", name: "Nasdaq 100", price: qqqPrice.price, change, type: "equity" });
    }
    
    if (diaPrice?.price) {
      const change = diaPrice.previousPrice 
        ? ((diaPrice.price - diaPrice.previousPrice) / diaPrice.previousPrice) * 100 
        : 0;
      list.push({ symbol: "DIA", name: "Dow Jones", price: diaPrice.price, change, type: "equity" });
    }
    
    if (btcPrice?.price) {
      const change = btcPrice.previousPrice 
        ? ((btcPrice.price - btcPrice.previousPrice) / btcPrice.previousPrice) * 100 
        : 0;
      list.push({ symbol: "BTC", name: "Bitcoin", price: btcPrice.price, change, type: "crypto" });
    }
    
    if (ethPrice?.price) {
      const change = ethPrice.previousPrice 
        ? ((ethPrice.price - ethPrice.previousPrice) / ethPrice.previousPrice) * 100 
        : 0;
      list.push({ symbol: "ETH", name: "Ethereum", price: ethPrice.price, change, type: "crypto" });
    }
    
    return list;
  }, [spyPrice, qqqPrice, diaPrice, btcPrice, ethPrice]);
  
  const filteredAssets = useMemo(() => {
    if (activeView === "all") return assets;
    return assets.filter(a => a.type === activeView);
  }, [assets, activeView]);
  
  const equityStrength = useMemo(() => {
    const equities = assets.filter(a => a.type === "equity");
    if (equities.length === 0) return 50;
    const avgChange = equities.reduce((sum, a) => sum + a.change, 0) / equities.length;
    return Math.min(100, Math.max(0, 50 + avgChange * 10));
  }, [assets]);
  
  const cryptoStrength = useMemo(() => {
    const cryptos = assets.filter(a => a.type === "crypto");
    if (cryptos.length === 0) return 50;
    const avgChange = cryptos.reduce((sum, a) => sum + a.change, 0) / cryptos.length;
    return Math.min(100, Math.max(0, 50 + avgChange * 5));
  }, [assets]);
  
  const overallStrength = useMemo(() => {
    return (equityStrength * 0.6 + cryptoStrength * 0.4);
  }, [equityStrength, cryptoStrength]);
  
  return (
    <Card className="bg-slate-900/50 border-slate-800/50 overflow-hidden" data-testid="card-global-market-pulse">
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe className="w-5 h-5 text-cyan-400" />
          Global Market Pulse
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs ml-2",
              isConnected ? "border-emerald-500/50 text-emerald-400" : "border-slate-600 text-slate-400"
            )}
          >
            <Activity className={cn("w-3 h-3 mr-1", isConnected && "animate-pulse")} />
            {isConnected ? "Live" : "Cached"}
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          <Button
            size="sm"
            variant={activeView === 'all' ? 'default' : 'ghost'}
            onClick={() => setActiveView('all')}
            data-testid="btn-view-all"
          >
            All
          </Button>
          <Button
            size="sm"
            variant={activeView === 'equity' ? 'default' : 'ghost'}
            onClick={() => setActiveView('equity')}
            data-testid="btn-view-equity"
          >
            Equities
          </Button>
          <Button
            size="sm"
            variant={activeView === 'crypto' ? 'default' : 'ghost'}
            onClick={() => setActiveView('crypto')}
            data-testid="btn-view-crypto"
          >
            Crypto
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-2">
            {filteredAssets.length > 0 ? (
              filteredAssets.map(asset => (
                <AssetTicker key={asset.symbol} asset={asset} />
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" />
                Loading market data...
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-center justify-center gap-4 p-4 rounded-xl bg-slate-800/30">
            <MarketGauge value={overallStrength} label="Global Strength" />
            <div className="grid grid-cols-2 gap-4 w-full pt-4 border-t border-slate-700/50">
              <MarketGauge value={equityStrength} label="Equities" size="small" />
              <MarketGauge value={cryptoStrength} label="Crypto" size="small" />
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-4 pt-4 mt-4 border-t border-slate-800">
          <Link href="/market">
            <Button variant="ghost" size="sm" className="text-cyan-400" data-testid="link-market-overview">
              Market Overview <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
          <Link href="/ct-tracker">
            <Button variant="ghost" size="sm" className="text-amber-400" data-testid="link-crypto-tracker">
              Crypto Tracker <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
