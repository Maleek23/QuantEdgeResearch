import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Info, 
  TrendingDown, 
  BarChart3, 
  AlertCircle,
  Lightbulb,
  Clock,
  Target,
  ArrowRight
} from 'lucide-react';
import { cn, safeToFixed } from '@/lib/utils';

interface BestSetupsExplainerProps {
  marketRegime?: 'trending' | 'ranging' | 'volatile' | 'unknown';
  avgAdx?: number;
  vixLevel?: number;
  breakoutWinRate?: number;
  meanReversionWinRate?: number;
  lastGoodSetup?: {
    symbol: string;
    date: string;
    grade: string;
    return: string;
    signals: string[];
  };
  suggestions?: string[];
  onScannerSwitch?: (scanner: string) => void;
}

function getRegimeColor(regime: string): string {
  switch (regime) {
    case 'trending': return 'text-[var(--trade-bullish)] border-green-500/50';
    case 'ranging': return 'text-[var(--trade-neutral)] border-amber-500/50';
    case 'volatile': return 'text-[var(--trade-bearish)] border-red-500/50';
    default: return 'text-muted-foreground border-muted-foreground/50';
  }
}

function getRegimeIcon(regime: string) {
  switch (regime) {
    case 'trending': return <TrendingDown className="h-4 w-4 rotate-180" />;
    case 'ranging': return <BarChart3 className="h-4 w-4" />;
    case 'volatile': return <AlertCircle className="h-4 w-4" />;
    default: return <Info className="h-4 w-4" />;
  }
}

export default function BestSetupsExplainer({
  marketRegime = 'unknown',
  avgAdx = 18.2,
  vixLevel,
  breakoutWinRate = 34,
  meanReversionWinRate = 58,
  lastGoodSetup,
  suggestions = [],
  onScannerSwitch,
}: BestSetupsExplainerProps) {
  const defaultSuggestions = [
    'Review RSI(2) oversold plays in scanner',
    'Enable "Prop Firm Mode" for stricter filters',
    'Check "Missed Opportunities" tab for recent downgrades'
  ];
  
  const activeSuggestions = suggestions.length > 0 ? suggestions : defaultSuggestions;
  
  return (
    <Card className="p-4 bg-muted/50 backdrop-blur-sm border-border/50" data-testid="best-setups-explainer">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-cyan-400" />
        <h3 className="font-semibold text-lg">No A/A+ Setups Found</h3>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md border border-border/30">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn("gap-1", getRegimeColor(marketRegime))}>
              {getRegimeIcon(marketRegime)}
              <span className="capitalize">{marketRegime}</span>
            </Badge>
            <span className="text-sm text-muted-foreground">Market Regime</span>
          </div>
          {avgAdx && (
            <span className="font-mono text-sm text-muted-foreground">ADX: {safeToFixed(avgAdx, 1)}</span>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-md border border-border/30 bg-muted/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Breakout Win Rate</span>
              {breakoutWinRate < 50 ? (
                <Badge variant="outline" className="text-xs border-red-500/50 text-[var(--trade-bearish)]">Low</Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-green-500/50 text-[var(--trade-bullish)]">OK</Badge>
              )}
            </div>
            <span className={cn(
              "font-mono text-xl",
              breakoutWinRate < 50 ? 'text-[var(--trade-bearish)]' : 'text-[var(--trade-bullish)]'
            )}>{breakoutWinRate}%</span>
          </div>
          
          <div className="p-3 rounded-md border border-border/30 bg-muted/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Mean Reversion Win Rate</span>
              {meanReversionWinRate >= 50 ? (
                <Badge variant="outline" className="text-xs border-green-500/50 text-[var(--trade-bullish)]">High</Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-amber-500/50 text-[var(--trade-neutral)]">OK</Badge>
              )}
            </div>
            <span className={cn(
              "font-mono text-xl",
              meanReversionWinRate >= 50 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-neutral)]'
            )}>{meanReversionWinRate}%</span>
          </div>
        </div>
        
        <div className="p-3 bg-amber-500/10 rounded-md border border-amber-500/30">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-[var(--trade-neutral)] mt-0.5 shrink-0" />
            <div>
              <span className="text-sm font-medium text-[var(--trade-neutral)] block mb-2">Suggestions</span>
              <ul className="space-y-1">
                {activeSuggestions.map((suggestion, i) => (
                  <li key={i} className="text-sm text-foreground/80 flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        {onScannerSwitch && (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => onScannerSwitch('rsi2')}
            data-testid="btn-switch-rsi2"
          >
            <Target className="h-4 w-4 mr-2" />
            Switch to RSI(2) Scanner
          </Button>
        )}
        
        {lastGoodSetup && (
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last Good Setup
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold tabular-nums">{lastGoodSetup.symbol}</span>
                <Badge variant="outline" className="text-xs border-amber-500/50 text-[var(--trade-neutral)]">
                  {lastGoodSetup.grade}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--trade-bullish)] font-mono">{lastGoodSetup.return}</span>
                <span className="text-xs text-muted-foreground">{lastGoodSetup.date}</span>
              </div>
            </div>
            {lastGoodSetup.signals.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {lastGoodSetup.signals.map((signal, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {signal.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
