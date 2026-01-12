import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
      id: 'ml-intelligence',
      title: 'ML Intelligence Lab',
      description: 'Machine learning predictions and analysis',
      icon: Brain,
      href: `/ml-intelligence?symbol=${symbol}`,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      features: ['Direction prediction', 'Entry/exit timing', 'Pattern recognition', 'Confidence scoring'],
      available: true,
      category: 'ml'
    },
    {
      id: 'options-analyzer',
      title: 'Options Risk Lab',
      description: 'Options probability and risk analysis',
      icon: Shield,
      href: `/options-analyzer?symbol=${symbol}`,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
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
      color: 'text-amber-400',
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
      title: 'Strategy Backtest',
      description: 'Test trading strategies with historical data',
      icon: FileText,
      href: `/backtest?symbol=${symbol}`,
      color: 'text-emerald-400',
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
        <Button
          variant="outline"
          size="sm"
          disabled={!link.available}
          className={cn(
            "h-auto py-2 px-3 flex items-center gap-2 transition-all",
            link.available && link.borderColor,
            !link.available && "opacity-50 cursor-not-allowed"
          )}
          data-testid={`link-${link.id}`}
        >
          <Icon className={cn("h-4 w-4", link.color)} />
          <span className="text-xs font-medium">{link.title}</span>
          <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
        </Button>
      </Link>
    );
  }
  
  return (
    <Link href={link.href}>
      <Card 
        className={cn(
          "group hover-elevate transition-all cursor-pointer",
          link.bgColor, link.borderColor,
          !link.available && "opacity-50 pointer-events-none"
        )} 
        data-testid={`card-${link.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn("p-2 rounded-lg", link.bgColor, "border", link.borderColor)}>
              <Icon className={cn("h-5 w-5", link.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-sm">{link.title}</h4>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {link.features.slice(0, 3).map((f) => (
                  <Badge key={f} variant="outline" className="text-[9px] h-4 px-1.5">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Signal Convergence</span>
        <Badge variant="outline" className={cn(
          "text-[10px]",
          convergence >= 80 && "bg-green-500/10 text-green-400 border-green-500/30",
          convergence >= 60 && convergence < 80 && "bg-amber-500/10 text-amber-400 border-amber-500/30",
          convergence < 60 && "bg-muted/30 text-muted-foreground"
        )}>
          {convergence.toFixed(0)}% {direction}
        </Badge>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden flex">
        <div 
          className="bg-green-500 transition-all" 
          style={{ width: `${(bullish / total) * 100}%` }}
        />
        <div 
          className="bg-muted-foreground/30 transition-all" 
          style={{ width: `${((total - bullish - bearish) / total) * 100}%` }}
        />
        <div 
          className="bg-red-500 transition-all" 
          style={{ width: `${(bearish / total) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{bullish} bullish</span>
        <span>{total - bullish - bearish} neutral</span>
        <span>{bearish} bearish</span>
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
  
  const effectiveQuantScore = quantScore || 65;
  const effectiveAiScore = aiScore || 60;
  const effectiveMlScore = mlScore || 55;
  const effectiveHistoricalWinRate = historicalWinRate || 58;
  
  const signals = [
    { source: 'Quantitative', direction: effectiveQuantScore >= 60 ? 'bullish' as const : effectiveQuantScore <= 40 ? 'bearish' as const : 'neutral' as const, confidence: effectiveQuantScore },
    { source: 'AI Analysis', direction: effectiveAiScore >= 60 ? 'bullish' as const : effectiveAiScore <= 40 ? 'bearish' as const : 'neutral' as const, confidence: effectiveAiScore },
    { source: 'Technical', direction: effectiveMlScore >= 60 ? 'bullish' as const : effectiveMlScore <= 40 ? 'bearish' as const : 'neutral' as const, confidence: effectiveMlScore },
    { source: 'Historical', direction: effectiveHistoricalWinRate > 60 ? 'bullish' as const : 'neutral' as const, confidence: effectiveHistoricalWinRate },
    { source: 'Market Context', direction: 'neutral' as const, confidence: 55 },
  ];
  
  return (
    <Card className="bg-card/70 backdrop-blur-xl border-border/60 shadow-xl overflow-hidden" data-testid="analysis-hub">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
                Analysis Hub
                <Badge variant="outline" className="text-[9px] font-mono">
                  {symbol}
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                Multi-dimensional analysis • {availableLinks.length} tools available
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
