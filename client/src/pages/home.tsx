import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlobalMarketPulse } from "@/components/dashboard";
import { useQuery } from "@tanstack/react-query";
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
  Calendar,
  Loader2,
} from "lucide-react";

interface StrategyCard {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
}

interface StrategyCardExtended extends StrategyCard {
  metric?: string;
  metricLabel?: string;
}

const strategies: StrategyCardExtended[] = [
  { 
    title: "Trade Desk", 
    description: "AI-powered stock picks & earnings predictions", 
    href: "/trade-desk", 
    icon: Brain,
    color: "text-purple-400",
    bgGradient: "from-purple-900/50 via-purple-900/30 to-slate-900/50",
    metric: "95%",
    metricLabel: "AI Accuracy"
  },
  { 
    title: "Trading Engine", 
    description: "Quantitative momentum strategies", 
    href: "/trading-engine", 
    icon: Zap,
    color: "text-cyan-400",
    bgGradient: "from-cyan-900/50 via-cyan-900/30 to-slate-900/50",
    metric: "78%",
    metricLabel: "Win Rate"
  },
  { 
    title: "Market Scanner", 
    description: "Real-time intraday trading signals", 
    href: "/market-scanner", 
    icon: Activity,
    color: "text-emerald-400",
    bgGradient: "from-emerald-900/50 via-emerald-900/30 to-slate-900/50",
    metric: "12",
    metricLabel: "Live Signals"
  },
  { 
    title: "Chart Analysis", 
    description: "AI pattern recognition & technical analysis", 
    href: "/chart-analysis", 
    icon: BarChart3,
    color: "text-blue-400",
    bgGradient: "from-blue-900/50 via-blue-900/30 to-slate-900/50",
    metric: "15+",
    metricLabel: "Patterns"
  },
  { 
    title: "Bullish Trends", 
    description: "Momentum stocks with strong uptrends", 
    href: "/bullish-trends", 
    icon: TrendingUp,
    color: "text-pink-400",
    bgGradient: "from-pink-900/50 via-pink-900/30 to-slate-900/50",
    metric: "24",
    metricLabel: "Hot Stocks"
  },
  { 
    title: "CT Tracker", 
    description: "Crypto trading signals & analysis", 
    href: "/ct-tracker", 
    icon: Wallet,
    color: "text-amber-400",
    bgGradient: "from-amber-900/50 via-amber-900/30 to-slate-900/50",
    metric: "8",
    metricLabel: "Top Coins"
  },
];

const fallbackEarnings = [
  { symbol: "BK", name: "Bank of New York Mellon Corp", prediction: "Beat", probability: 75, timing: "Pre-Market", date: "Today ET" },
  { symbol: "DAL", name: "Delta Air Lines Inc", prediction: "Neutral", probability: 35, timing: "Pre-Market", date: "Today ET" },
  { symbol: "JPM", name: "JPMorgan Chase & Co", prediction: "Beat", probability: 70, timing: "Pre-Market", date: "Today ET" },
];

const fallbackWinners = [
  { symbol: "ASTS", name: "AST SpaceMobile Inc", return: 78.91, dateAdded: "2025-09-22" },
  { symbol: "PL", name: "Planet Labs PBC", return: 78.40, dateAdded: "2025-12-05" },
  { symbol: "SLV", name: "iShares Silver Trust", return: 64.31, dateAdded: "2025-11-21" },
];


function StrategyCardComponent({ strategy }: { strategy: StrategyCardExtended }) {
  const Icon = strategy.icon;
  return (
    <Link href={strategy.href}>
      <Card className={cn(
        "group relative overflow-hidden border-slate-700/50 hover:border-slate-600/50 transition-all duration-300 cursor-pointer h-full",
        "bg-gradient-to-br backdrop-blur-sm",
        strategy.bgGradient
      )} data-testid={`card-strategy-${strategy.title.toLowerCase().replace(/\s+/g, '-')}`}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-white/5 to-transparent rounded-bl-full" />
        <CardContent className="p-5 flex flex-col h-full relative z-10">
          <div className="flex items-start justify-between mb-3">
            <div className={cn("p-2.5 rounded-xl bg-slate-800/70 backdrop-blur-sm border border-slate-700/50", strategy.color)}>
              <Icon className="w-5 h-5" />
            </div>
            {strategy.metric && (
              <div className="text-right">
                <span className={cn("text-lg font-bold font-mono", strategy.color)}>{strategy.metric}</span>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">{strategy.metricLabel}</span>
              </div>
            )}
          </div>
          <h3 className="font-semibold text-white mb-1 text-sm">{strategy.title}</h3>
          <p className="text-xs text-slate-400 flex-1 line-clamp-2">{strategy.description}</p>
          <div className="flex items-center gap-1 text-cyan-400 text-xs mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
            Explore <ArrowRight className="w-3 h-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  const { data: bestSetups, isLoading: loadingSetups } = useQuery<any>({
    queryKey: ['/api/trade-ideas/best-setups'],
    staleTime: 60000,
    select: (data) => {
      if (Array.isArray(data)) return data;
      if (data?.ideas && Array.isArray(data.ideas)) return data.ideas;
      return [];
    },
  });

  const displayWinners = bestSetups?.slice(0, 3).map((idea: any) => ({
    symbol: idea.symbol,
    name: idea.companyName || idea.symbol,
    return: idea.targetPercentage || idea.confidenceScore / 2 || 0,
    dateAdded: idea.createdAt ? new Date(idea.createdAt).toLocaleDateString() : 'Recent'
  })) || fallbackWinners;

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
            Price Direction
          </Badge>
          <Badge variant="outline" className="px-4 py-2 text-sm border-slate-700 bg-slate-800/50">
            <Target className="w-4 h-4 mr-2 text-purple-400" />
            Entry Signals
          </Badge>
          <Badge variant="outline" className="px-4 py-2 text-sm border-slate-700 bg-slate-800/50">
            <BarChart3 className="w-4 h-4 mr-2 text-amber-400" />
            Options Flow
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
        <GlobalMarketPulse />
      </section>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            High-Conviction Setups
          </h2>
          <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400">
            6-Engine Analysis
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loadingSetups ? (
            <div className="col-span-3 flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
              <span className="ml-2 text-slate-400">Scanning for opportunities...</span>
            </div>
          ) : (
            displayWinners.map((winner: any, idx: number) => (
              <Link key={winner.symbol} href={`/chart-analysis?s=${winner.symbol}`}>
                <Card className="group bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-800/40 border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300 cursor-pointer" data-testid={`card-winner-${winner.symbol}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-slate-700/50">
                          <span className="text-sm font-bold text-white">{winner.symbol}</span>
                        </div>
                        <div>
                          <span className="block text-sm font-medium text-white group-hover:text-cyan-400 transition-colors">{winner.name}</span>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400">ML</Badge>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-cyan-500/30 text-cyan-400">TA</Badge>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-400">Quant</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Conviction</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className={cn(
                              "w-2 h-2 rounded-full",
                              i < Math.ceil(winner.return / 20) ? "bg-cyan-400" : "bg-slate-700"
                            )} />
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase">Target</span>
                        <span className="block text-lg font-bold font-mono text-emerald-400">+{typeof winner.return === 'number' ? winner.return.toFixed(1) : winner.return}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
        <div className="text-center mt-4">
          <Link href="/trading-engine">
            <Button variant="ghost" className="text-cyan-400 hover:text-cyan-300" data-testid="link-see-all-winners">
              View All Trade Ideas <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>

      <section>
        <Card className="bg-slate-900/50 border-slate-800/50">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5 text-purple-400" />
              AI Earnings Prediction
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </CardTitle>
            <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">Today</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fallbackEarnings.map((earning) => (
                <div key={earning.symbol} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30" data-testid={`card-earnings-${earning.symbol}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                      <span className="text-xs font-bold">{earning.symbol}</span>
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-white">{earning.name}</span>
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
                    <span className="text-xs text-slate-500">{earning.probability}% confidence</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <Link href="/trade-desk">
                <Button variant="ghost" className="text-cyan-400 hover:text-cyan-300" data-testid="link-see-all-earnings">
                  See all AI Earnings Prediction <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}
