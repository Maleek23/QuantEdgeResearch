import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, safeToFixed } from "@/lib/utils";
import { Link } from "wouter";
import { 
  BarChart3, Brain, Calculator, TrendingUp, Target, LineChart,
  Activity, Layers, Zap, ChevronRight, ExternalLink, 
  Shield, Clock, FileText, Beaker, DollarSign, History,
  Cpu, Network, PieChart, Gauge, AlertTriangle
} from "lucide-react";
import { MultiDimensionalAnalysis } from "./multi-dimensional-analysis";

interface AnalysisHubProps {
  symbol: string;
  assetClass?: 'stock' | 'options' | 'futures' | 'crypto';
  currentPrice?: number;
  confidenceScore?: number;
  direction?: 'long' | 'short';
  quantScore?: number;
  aiScore?: number;
  mlScore?: number;
  historicalWinRate?: number;
}

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
      description: 'Advanced chart analysis with pattern recognition',
      icon: BarChart3,
      href: `/chart-analysis?symbol=${symbol}`,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      features: ['Chart patterns', 'Support/Resistance', 'Trend lines', 'Formations'],
      available: true,
      category: 'technical'
    },
    {
      id: 'trading-engine',
      title: 'Confluence Command Center',
      description: 'Unified multi-layer analysis with Technical, Fundamental, Catalyst, Quant, Flow & Sentiment',
      icon: Brain,
      href: `/trading-engine`,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      features: ['Confluence scoring', 'Regime detection', 'Catalyst analysis', 'Quant signals', 'Flow analysis'],
      available: true,
      category: 'ml'
    },
    {
      id: 'options-analyzer',
      title: 'Options Risk Lab',
      description: 'Options probability and risk analysis',
      icon: Shield,
      href: `/options-analyzer?symbol=${symbol}`,
      color: 'text-[var(--trade-bullish)]',
      bgColor: 'bg-[var(--trade-bullish)]/10',
      borderColor: 'border-green-500/30',
      features: ['Greeks analysis', 'Probability calculator', 'IV analysis', 'Risk/reward'],
      available: assetClass === 'stock' || assetClass === 'options',
      category: 'risk'
    },
    {
      id: 'historical-intelligence',
      title: 'Historical Intelligence',
      description: 'Learn from past trades and patterns',
      icon: History,
      href: `/historical-intelligence?symbol=${symbol}`,
      color: 'text-[var(--trade-neutral)]',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      features: ['Past performance', 'Win rate history', 'Pattern success', 'Behavioral analysis'],
      available: true,
      category: 'historical'
    },
    {
      id: 'market-scanner',
      title: 'Market Scanner',
      description: 'Real-time market scanning and signals',
      icon: Calculator,
      href: `/market-scanner?symbol=${symbol}`,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      features: ['Day trade mode', 'Swing mode', 'Volume spikes', 'Momentum signals'],
      available: true,
      category: 'technical'
    },
    {
      id: 'backtest',
      title: 'Pattern Scanner',
      description: 'Analyze technical patterns, candlestick formations, and indicator signals',
      icon: FileText,
      href: `/backtest?symbol=${symbol}`,
      color: 'text-[var(--trade-bullish)]',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      features: ['RSI strategies', 'MACD strategies', 'Performance metrics', 'Win rate analysis'],
      available: true,
      category: 'historical'
    },
  ];
}

function AnalysisLinkCard({ link, compact }: { link: AnalysisLink; compact?: boolean }) {
  const Icon = link.icon;
  
  if (compact) {
    return (
      <Link href={link.href}>
        <div
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200",
            "bg-muted/40 border border-border/30 hover:border-cyan-500/40",
            "hover:bg-muted/60 hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]",
            !link.available && "opacity-40 pointer-events-none"
          )}
          data-testid={`link-${link.id}`}
        >
          <Icon className={cn("h-4 w-4", link.color)} />
          <span className="text-xs font-medium text-foreground/80">{link.title}</span>
          <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
        </div>
      </Link>
    );
  }
  
  return (
    <Link href={link.href}>
      <div 
        className={cn(
          "group p-4 rounded-lg transition-all duration-200 cursor-pointer",
          "bg-muted/30 border border-border/20",
          "hover:bg-muted/50 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]",
          !link.available && "opacity-40 pointer-events-none"
        )} 
        data-testid={`card-${link.id}`}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-lg border transition-all",
            link.bgColor, link.borderColor,
            "group-hover:shadow-[0_0_12px_rgba(34,211,238,0.15)]"
          )}>
            <Icon className={cn("h-4 w-4", link.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm text-foreground/90">{link.title}</h4>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{link.description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function QuickActionBar({ symbol, assetClass }: { symbol: string; assetClass: string }) {
  const links = getAnalysisLinks(symbol, assetClass).filter(l => l.available);
  
  return (
    <div className="flex flex-wrap gap-2">
      {links.slice(0, 4).map((link) => (
        <AnalysisLinkCard key={link.id} link={link} compact />
      ))}
      <Link href={`/analysis/${symbol}`}>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
          View All
          <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

function SignalConvergenceBar({ signals }: { signals: { source: string; direction: 'bullish' | 'bearish' | 'neutral'; confidence: number }[] }) {
  const bullish = signals.filter(s => s.direction === 'bullish').length;
  const bearish = signals.filter(s => s.direction === 'bearish').length;
  const total = signals.length;
  const convergence = Math.max(bullish, bearish) / total * 100;
  const direction = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';
  
  return (
    <div className="p-4 rounded-lg bg-muted/30 border border-border/20 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Signal Convergence</span>
        <div className={cn(
          "text-xs font-mono px-2 py-0.5 rounded",
          convergence >= 80 && "bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]",
          convergence >= 60 && convergence < 80 && "bg-amber-500/15 text-[var(--trade-neutral)]",
          convergence < 60 && "bg-muted/50 text-muted-foreground"
        )}>
          {safeToFixed(convergence, 0)}% {direction}
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
        <div 
          className="bg-[var(--trade-bullish)] transition-all duration-500" 
          style={{ width: `${(bullish / total) * 100}%` }}
        />
        <div 
          className="bg-muted transition-all duration-500" 
          style={{ width: `${((total - bullish - bearish) / total) * 100}%` }}
        />
        <div 
          className="bg-red-400 transition-all duration-500" 
          style={{ width: `${(bearish / total) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
        <span className="text-[var(--trade-bullish)]/80">{bullish} bullish</span>
        <span>{total - bullish - bearish} neutral</span>
        <span className="text-[var(--trade-bearish)]/80">{bearish} bearish</span>
      </div>
    </div>
  );
}

export function AnalysisHub({ 
  symbol, 
  assetClass = 'stock', 
  currentPrice, 
  confidenceScore,
  direction = 'long',
  quantScore = 65,
  aiScore = 60,
  mlScore = 55,
  historicalWinRate = 58
}: AnalysisHubProps) {
  const [expanded, setExpanded] = useState(false);
  
  const links = getAnalysisLinks(symbol, assetClass);
  const availableLinks = links.filter(l => l.available);
  
  const effectiveQuantScore = quantScore || 0;
  const effectiveAiScore = aiScore || 0;
  const effectiveMlScore = mlScore || 0;
  const effectiveHistoricalWinRate = historicalWinRate || 0;
  
  const signals = [
    { source: 'Quantitative', direction: effectiveQuantScore >= 60 ? 'bullish' as const : effectiveQuantScore <= 40 ? 'bearish' as const : 'neutral' as const, confidence: effectiveQuantScore },
    { source: 'AI Analysis', direction: effectiveAiScore >= 60 ? 'bullish' as const : effectiveAiScore <= 40 ? 'bearish' as const : 'neutral' as const, confidence: effectiveAiScore },
    { source: 'Technical', direction: effectiveMlScore >= 60 ? 'bullish' as const : effectiveMlScore <= 40 ? 'bearish' as const : 'neutral' as const, confidence: effectiveMlScore },
    { source: 'Historical', direction: effectiveHistoricalWinRate > 60 ? 'bullish' as const : 'neutral' as const, confidence: effectiveHistoricalWinRate },
    { source: 'Market Context', direction: 'neutral' as const, confidence: 55 },
  ];
  
  return (
    <Card className="bg-card/60 backdrop-blur-2xl border-border/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden" data-testid="analysis-hub">
      <CardHeader className="pb-4 border-b border-border/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
              <Layers className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base font-bold tracking-tight flex items-center gap-3">
                <span className="text-foreground/95">Analysis Hub</span>
                <Badge className="text-[10px] font-mono bg-muted/80 text-cyan-400 border-cyan-500/30">
                  {symbol}
                </Badge>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground tracking-wide mt-1">
                {availableLinks.length} analysis tools available
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setExpanded(!expanded)}
            className="text-xs"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        <SignalConvergenceBar signals={signals} />
        
        <QuickActionBar symbol={symbol} assetClass={assetClass} />
        
        {expanded && (
          <div className="space-y-4 pt-2 border-t border-border/50">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Deep Analysis Tools
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {availableLinks.map((link) => (
                  <AnalysisLinkCard key={link.id} link={link} />
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Multi-Dimensional Breakdown
              </h4>
              <MultiDimensionalAnalysis 
                symbol={symbol}
                assetType={assetClass}
                direction={direction}
                quantScore={effectiveQuantScore}
                aiScore={effectiveAiScore}
                mlScore={effectiveMlScore}
                historicalWinRate={effectiveHistoricalWinRate}
                compact={false}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalysisHubCompact({ symbol, assetClass = 'stock' }: { symbol: string; assetClass?: string }) {
  const links = getAnalysisLinks(symbol, assetClass).filter(l => l.available);
  
  return (
    <div className="space-y-2" data-testid="analysis-hub-compact">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Analysis Tools
          </span>
        </div>
        <Link href={`/analysis/${symbol}`}>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground">
            View All <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links.slice(0, 5).map((link) => {
          const Icon = link.icon;
          return (
            <Tooltip key={link.id}>
              <TooltipTrigger asChild>
                <Link href={link.href}>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn("h-8 w-8", link.borderColor)}
                  >
                    <Icon className={cn("h-4 w-4", link.color)} />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-semibold">{link.title}</p>
                <p className="text-muted-foreground">{link.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export default AnalysisHub;
