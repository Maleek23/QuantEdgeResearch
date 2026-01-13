import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketMonitorSection } from "@/components/dashboard";
import {
  Brain,
  TrendingUp,
  BarChart3,
  Zap,
  Wallet,
  Target,
  LineChart,
  ArrowRight,
  ChevronRight,
  Activity,
} from "lucide-react";

interface StrategyCard {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
}

const strategies: StrategyCard[] = [
  { 
    title: "AI Stock Picker", 
    description: "AI-selected daily top stocks", 
    href: "/trade-desk", 
    icon: Brain,
    color: "text-purple-400",
    bgGradient: "from-purple-900/40 to-purple-950/20"
  },
  { 
    title: "Swing Trading", 
    description: "Real-time swing trade signal", 
    href: "/swing-scanner", 
    icon: TrendingUp,
    color: "text-emerald-400",
    bgGradient: "from-emerald-900/40 to-emerald-950/20"
  },
  { 
    title: "Pattern Detection", 
    description: "Price pattern for technical analysis", 
    href: "/chart-analysis", 
    icon: BarChart3,
    color: "text-cyan-400",
    bgGradient: "from-cyan-900/40 to-cyan-950/20"
  },
  { 
    title: "Crypto Radar", 
    description: "Daytrading signal for crypto", 
    href: "/ct-tracker", 
    icon: Wallet,
    color: "text-amber-400",
    bgGradient: "from-amber-900/40 to-amber-950/20"
  },
  { 
    title: "Daytrading", 
    description: "Daytrading signal for stock", 
    href: "/market-scanner", 
    icon: Activity,
    color: "text-pink-400",
    bgGradient: "from-pink-900/40 to-pink-950/20"
  },
  { 
    title: "Quant Alpha", 
    description: "AI-powered stock selection", 
    href: "/trading-engine", 
    icon: Zap,
    color: "text-blue-400",
    bgGradient: "from-blue-900/40 to-blue-950/20"
  },
];

const mockEarnings = [
  { symbol: "BK", name: "Bank of New York Mellon Corp", prediction: "Beat", probability: 75, timing: "Pre-Market", date: "Jan 13 ET" },
  { symbol: "DAL", name: "Delta Air Lines Inc", prediction: "Neutral", probability: 35, timing: "Pre-Market", date: "Jan 13 ET" },
  { symbol: "JPM", name: "JPMorgan Chase & Co", prediction: "Beat", probability: 70, timing: "Pre-Market", date: "Jan 13 ET" },
];

const mockWinners = [
  { symbol: "ASTS", name: "AST SpaceMobile Inc", return: 78.91, dateAdded: "2025-09-22", dateRemoved: "2025-10-17" },
  { symbol: "PL", name: "Planet Labs PBC", return: 78.40, dateAdded: "2025-12-05", dateRemoved: "2026-01-09" },
  { symbol: "SLV", name: "iShares Silver Trust", return: 64.31, dateAdded: "2025-11-21", dateRemoved: "2026-01-06" },
];

const mockScreeners = [
  { title: "Stocks Bullish Tomorrow", count: 10, type: "Bullish" },
  { title: "Stocks Bullish for a Week", count: 76, type: "Bullish" },
  { title: "Stocks Bullish for a Month", count: 219, type: "Bullish" },
  { title: "Cryptos Bullish Tomorrow", count: 212, type: "Bullish" },
  { title: "Cryptos Bullish for a Week", count: 104, type: "Bullish" },
  { title: "Cryptos Bullish for a Month", count: 74, type: "Bullish" },
];

function StrategyCardComponent({ strategy }: { strategy: StrategyCard }) {
  const Icon = strategy.icon;
  return (
    <Link href={strategy.href}>
      <Card className={cn(
        "group relative overflow-hidden border-slate-800/50 hover:border-slate-700/50 transition-all duration-300 cursor-pointer h-full",
        "bg-gradient-to-br",
        strategy.bgGradient
      )} data-testid={`card-strategy-${strategy.title.toLowerCase().replace(/\s+/g, '-')}`}>
        <CardContent className="p-6 flex flex-col h-full">
          <div className={cn("p-3 rounded-xl bg-slate-800/50 w-fit mb-4", strategy.color)}>
            <Icon className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-white mb-1">{strategy.title}</h3>
          <p className="text-sm text-slate-400 flex-1">{strategy.description}</p>
          <div className="flex items-center gap-1 text-cyan-400 text-sm mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
            See More <ArrowRight className="w-4 h-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MarketStrengthGauge({ value, label }: { value: number; label: string }) {
  const rotation = (value / 100) * 180 - 90;
  const getColor = () => {
    if (value < 30) return "#ef4444";
    if (value < 50) return "#f59e0b";
    if (value < 70) return "#22c55e";
    return "#10b981";
  };
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path
            d="M 10 45 A 40 40 0 0 1 90 45"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="6"
            strokeLinecap="round"
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
      <span className="text-3xl font-bold font-mono text-white mt-2">{value}</span>
      <span className="text-sm text-slate-400">{label}</span>
    </div>
  );
}

function AltcoinSeasonIndex({ value }: { value: number }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-4xl font-bold font-mono text-white text-center">{value}</span>
      <div className="relative h-3 rounded-full overflow-hidden bg-slate-800">
        <div 
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-500 to-blue-500"
          style={{ width: "100%" }}
        />
        <div 
          className="absolute top-0 w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-white"
          style={{ left: `${value}%`, transform: "translateX(-50%) translateY(-2px)" }}
        />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-amber-400">Bitcoin</span>
        <span className="text-blue-400">Altcoin</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-12 pb-12">
      <section className="text-center py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Top Stock & Crypto AI Trading Signals
        </h1>
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <Badge variant="outline" className="px-4 py-2 text-sm border-slate-700 bg-slate-800/50">
            <TrendingUp className="w-4 h-4 mr-2 text-cyan-400" />
            Technical Analysis
          </Badge>
          <Badge variant="outline" className="px-4 py-2 text-sm border-slate-700 bg-slate-800/50">
            <LineChart className="w-4 h-4 mr-2 text-emerald-400" />
            Price Prediction
          </Badge>
          <Badge variant="outline" className="px-4 py-2 text-sm border-slate-700 bg-slate-800/50">
            <Target className="w-4 h-4 mr-2 text-purple-400" />
            Should I Buy
          </Badge>
          <Badge variant="outline" className="px-4 py-2 text-sm border-slate-700 bg-slate-800/50">
            <BarChart3 className="w-4 h-4 mr-2 text-amber-400" />
            Option Strategy
          </Badge>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">AI Trading Strategies</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {strategies.map((strategy) => (
            <StrategyCardComponent key={strategy.title} strategy={strategy} />
          ))}
        </div>
      </section>

      <section>
        <MarketMonitorSection />
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            QuantAI Alpha Pick
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </h2>
          <span className="text-sm text-slate-400">AI-powered stock selection with proven track record</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mockWinners.map((winner) => (
            <Card key={winner.symbol} className="bg-slate-900/50 border-slate-800/50" data-testid={`card-winner-${winner.symbol}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                      <span className="text-xs font-bold text-slate-300">{winner.symbol}</span>
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-white">{winner.name}</span>
                      <span className="text-xs text-slate-500">Added: {winner.dateAdded}</span>
                    </div>
                  </div>
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                    <Zap className="w-3 h-3 mr-1" />
                    Quant AI
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Total Return</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">+{winner.return.toFixed(2)}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-4">
          <Link href="/trading-engine">
            <Button variant="link" className="text-cyan-400" data-testid="link-see-all-winners">
              See all most recent winners <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              Crypto Market
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6">
            <div>
              <span className="text-sm text-slate-400 mb-4 block">Market Strength</span>
              <MarketStrengthGauge value={60} label="Strong" />
            </div>
            <div>
              <span className="text-sm text-slate-400 mb-4 block">Altcoin Season Index</span>
              <AltcoinSeasonIndex value={55} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              AI Earnings Prediction
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">All</Badge>
              <Badge variant="outline" className="text-xs text-slate-500">Past</Badge>
              <Badge variant="outline" className="text-xs text-slate-500">Today</Badge>
              <Badge variant="outline" className="text-xs text-slate-500">Future</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockEarnings.map((earning) => (
                <div key={earning.symbol} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30" data-testid={`card-earnings-${earning.symbol}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                      <span className="text-xs font-bold">{earning.symbol}</span>
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-white">{earning.symbol}</span>
                      <span className="text-xs text-slate-500">{earning.timing} · {earning.date}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={cn(
                      "block text-sm font-medium",
                      earning.prediction === "Beat" ? "text-emerald-400" : "text-slate-400"
                    )}>
                      {earning.prediction}
                    </span>
                    <span className="text-xs text-slate-500">{earning.probability}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <Link href="/trade-desk">
                <Button variant="link" className="text-cyan-400" data-testid="link-see-all-earnings">
                  See all AI Earnings Prediction <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              Featured Screener
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </h2>
            <p className="text-sm text-slate-400 mt-1">Explore a variety of template screeners to uncover winning trades with ease</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockScreeners.map((screener, idx) => (
            <Link key={screener.title} href="/market-scanner">
              <Card 
                className="group relative overflow-hidden border-slate-800/50 hover:border-slate-700/50 transition-all duration-300 cursor-pointer h-32"
                style={{
                  background: `linear-gradient(to bottom, rgba(15, 23, 42, 0.3), rgba(15, 23, 42, 0.9))`,
                }}
                data-testid={`card-screener-${idx}`}
              >
                <CardContent className="p-4 flex flex-col justify-end h-full">
                  <Badge className="w-fit mb-2 bg-emerald-500/80 text-white border-0 text-xs">
                    {screener.type}
                  </Badge>
                  <h3 className="font-medium text-white">{screener.title}</h3>
                  <span className="text-sm text-slate-400">{screener.count} symbols</span>
                </CardContent>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-6 h-6 text-white" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <div className="text-center mt-4">
          <Link href="/market-scanner">
            <Button variant="link" className="text-cyan-400" data-testid="link-see-all-screeners">
              See all Featured Screener <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
