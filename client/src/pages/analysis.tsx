import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { 
  Search, ArrowLeft, BarChart3, Brain, Calculator, TrendingUp, 
  Target, LineChart, Activity, Layers, Zap, ChevronRight, ExternalLink, 
  Shield, Clock, FileText, History, Cpu, RefreshCw, Loader2
} from "lucide-react";
import { MultiDimensionalAnalysis } from "@/components/multi-dimensional-analysis";

interface AnalysisLink {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  bgColor: string;
  borderColor: string;
  features: string[];
  available: boolean;
  category: 'technical' | 'fundamental' | 'ml' | 'risk' | 'historical';
}

function getAnalysisLinks(symbol: string, assetClass: string): AnalysisLink[] {
  return [
    {
      id: 'chart-analysis',
      title: 'Chart Pattern Studio',
      description: 'Advanced chart analysis with pattern recognition, support/resistance levels, and trend analysis',
      icon: BarChart3,
      href: `/chart-analysis?symbol=${symbol}`,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      features: ['Chart patterns', 'Support/Resistance', 'Trend lines', 'Formations', 'Volume analysis'],
      available: true,
      category: 'technical'
    },
    {
      id: 'trading-engine',
      title: '6-Engine Command Center',
      description: 'Unified multi-engine analysis with ML, AI, Quant, Flow, Sentiment & Technical',
      icon: Brain,
      href: `/trading-engine`,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      features: ['6-engine consensus', 'ML predictions', 'AI insights', 'Quant signals', 'Flow analysis'],
      available: true,
      category: 'ml'
    },
    {
      id: 'options-analyzer',
      title: 'Options Risk Lab',
      description: 'Options probability calculator, Greeks analysis, and risk/reward optimization',
      icon: Shield,
      href: `/options-analyzer?symbol=${symbol}`,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      features: ['Greeks analysis', 'Probability calculator', 'IV analysis', 'Risk/reward', 'Strategy builder'],
      available: assetClass === 'stock' || assetClass === 'options',
      category: 'risk'
    },
    {
      id: 'historical-intelligence',
      title: 'Historical Intelligence',
      description: 'Learn from past trades, patterns, and historical win rates for this symbol',
      icon: History,
      href: `/historical-intelligence?symbol=${symbol}`,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      features: ['Past performance', 'Win rate history', 'Pattern success', 'Behavioral analysis', 'Similar setups'],
      available: true,
      category: 'historical'
    },
    {
      id: 'market-scanner',
      title: 'Market Scanner',
      description: 'Real-time market scanning for day trade and swing trade opportunities',
      icon: Calculator,
      href: `/market-scanner?symbol=${symbol}`,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      features: ['Day trade mode', 'Swing mode', 'Volume spikes', 'Momentum signals', 'Real-time alerts'],
      available: true,
      category: 'technical'
    },
    {
      id: 'backtest',
      title: 'Strategy Backtest',
      description: 'Test trading strategies with historical data and performance metrics',
      icon: FileText,
      href: `/backtest?symbol=${symbol}`,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      features: ['RSI strategies', 'MACD strategies', 'Performance metrics', 'Win rate analysis', 'Drawdown analysis'],
      available: true,
      category: 'historical'
    },
  ];
}

function AnalysisCard({ link }: { link: AnalysisLink }) {
  const Icon = link.icon;
  
  return (
    <Link href={link.href}>
      <Card 
        className={cn(
          "group hover-elevate transition-all cursor-pointer h-full",
          link.bgColor, link.borderColor,
          !link.available && "opacity-50 pointer-events-none"
        )} 
        data-testid={`card-${link.id}`}
      >
        <CardContent className="p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className={cn("p-3 rounded-xl", link.bgColor, "border", link.borderColor)}>
                <Icon className={cn("h-6 w-6", link.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-base">{link.title}</h4>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{link.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {link.features.map((f) => (
                <Badge key={f} variant="outline" className="text-[10px] h-5 px-2">
                  {f}
                </Badge>
              ))}
            </div>
            {!link.available && (
              <Badge variant="secondary" className="text-[10px] w-fit">
                Not available for this asset type
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AnalysisPage() {
  const params = useParams<{ symbol?: string }>();
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState(params.symbol || '');
  const [symbol, setSymbol] = useState(params.symbol?.toUpperCase() || 'SPY');
  const [assetClass, setAssetClass] = useState<'stock' | 'options' | 'futures' | 'crypto'>('stock');

  useEffect(() => {
    if (params.symbol) {
      setSymbol(params.symbol.toUpperCase());
      setSearchInput(params.symbol.toUpperCase());
      
      const upperSym = params.symbol.toUpperCase();
      if (['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT'].includes(upperSym)) {
        setAssetClass('crypto');
      } else if (upperSym.startsWith('NQ') || upperSym.startsWith('ES') || upperSym.startsWith('GC') || upperSym.startsWith('CL')) {
        setAssetClass('futures');
      } else {
        setAssetClass('stock');
      }
    }
  }, [params.symbol]);

  const handleSearch = () => {
    if (searchInput.trim()) {
      const newSymbol = searchInput.trim().toUpperCase();
      setSymbol(newSymbol);
      setLocation(`/analysis/${newSymbol}`);
    }
  };

  const { data: quoteData, isLoading: quoteLoading } = useQuery<{
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
  }>({
    queryKey: ['/api/quote', symbol],
    enabled: !!symbol,
    staleTime: 30000,
  });

  const links = getAnalysisLinks(symbol, assetClass);
  const technicalLinks = links.filter(l => l.category === 'technical');
  const mlLinks = links.filter(l => l.category === 'ml');
  const riskLinks = links.filter(l => l.category === 'risk');
  const fundamentalLinks = links.filter(l => l.category === 'fundamental');
  const historicalLinks = links.filter(l => l.category === 'historical');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/trading-engine">
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                  Analysis Engine
                  <Badge variant="outline" className="text-sm font-mono">
                    {symbol}
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                  Comprehensive multi-dimensional analysis
                </p>
              </div>
            </div>
          </div>
          <Link href="/trading-engine">
            <Button variant="outline">
              Back to Command Center
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        <Card className="bg-card/70 backdrop-blur-xl border-border/60">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[280px]">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                  Search Symbol
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Enter symbol (e.g., NVDA, BTC, NQH25)"
                    className="pl-10 h-11 font-mono uppercase"
                    data-testid="input-analysis-symbol"
                  />
                </div>
              </div>
              <Button onClick={handleSearch} className="h-11 px-6" data-testid="button-search-analysis">
                <Search className="h-4 w-4 mr-2" />
                Analyze
              </Button>
            </div>
          </CardContent>
        </Card>

        {quoteLoading ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </CardContent>
          </Card>
        ) : quoteData && (
          <Card className="bg-card/70 backdrop-blur-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-3xl font-bold font-mono">{symbol}</h2>
                    <Badge variant="outline" className="text-[10px] mt-1">{assetClass.toUpperCase()}</Badge>
                  </div>
                  <div className="h-10 w-px bg-border" />
                  <div>
                    <div className="text-2xl font-bold font-mono">${quoteData.price?.toFixed(2) || '--'}</div>
                    <div className={cn(
                      "text-sm font-mono",
                      (quoteData.changePercent || 0) >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {(quoteData.changePercent || 0) >= 0 ? '+' : ''}{quoteData.changePercent?.toFixed(2) || 0}%
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/chart-analysis?symbol=${symbol}`}>
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Quick Chart
                    </Button>
                  </Link>
                  <Link href="/trading-engine">
                    <Button size="sm">
                      <Target className="h-4 w-4 mr-2" />
                      Full Analysis
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              Technical Analysis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {technicalLinks.map((link) => (
                <AnalysisCard key={link.id} link={link} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-400" />
              Machine Learning & AI
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mlLinks.map((link) => (
                <AnalysisCard key={link.id} link={link} />
              ))}
              {historicalLinks.map((link) => (
                <AnalysisCard key={link.id} link={link} />
              ))}
            </div>
          </div>

          {riskLinks.filter(l => l.available).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-400" />
                Risk & Probability
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {riskLinks.filter(l => l.available).map((link) => (
                  <AnalysisCard key={link.id} link={link} />
                ))}
              </div>
            </div>
          )}

          {fundamentalLinks.filter(l => l.available).length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                Fundamental Research
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fundamentalLinks.filter(l => l.available).map((link) => (
                  <AnalysisCard key={link.id} link={link} />
                ))}
              </div>
            </div>
          )}
        </div>

        <Card className="bg-card/70 backdrop-blur-xl border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Multi-Dimensional Signal Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MultiDimensionalAnalysis 
              symbol={symbol}
              assetType={assetClass}
              direction="long"
              quantScore={65}
              aiScore={60}
              mlScore={55}
              historicalWinRate={58}
              compact={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
