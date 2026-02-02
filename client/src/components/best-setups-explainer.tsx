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
    case 'trending': return 'text-green-400 border-green-500/50';
    case 'ranging': return 'text-amber-400 border-amber-500/50';
    case 'volatile': return 'text-red-400 border-red-500/50';
    default: return 'text-slate-400 border-slate-500/50';
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
    <Card className="p-4 bg-slate-800/50 backdrop-blur-sm border-slate-700/50" data-testid="best-setups-explainer">
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-cyan-400" />
        <h3 className="font-semibold text-lg">No A/A+ Setups Found</h3>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-md border border-slate-700/30">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={cn("gap-1", getRegimeColor(marketRegime))}>
              {getRegimeIcon(marketRegime)}
              <span className="capitalize">{marketRegime}</span>
            </Badge>
            <span className="text-sm text-slate-400">Market Regime</span>
          </div>
          {avgAdx && (
            <span className="font-mono text-sm text-slate-400">ADX: {safeToFixed(avgAdx, 1)}</span>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-md border border-slate-700/30 bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Breakout Win Rate</span>
              {breakoutWinRate < 50 ? (
                <Badge variant="outline" className="text-xs border-red-500/50 text-red-400">Low</Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">OK</Badge>
              )}
            </div>
            <span className={cn(
              "font-mono text-xl",
              breakoutWinRate < 50 ? 'text-red-400' : 'text-green-400'
            )}>{breakoutWinRate}%</span>
          </div>
          
          <div className="p-3 rounded-md border border-slate-700/30 bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Mean Reversion Win Rate</span>
              {meanReversionWinRate >= 50 ? (
                <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">High</Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">OK</Badge>
              )}
            </div>
            <span className={cn(
              "font-mono text-xl",
              meanReversionWinRate >= 50 ? 'text-green-400' : 'text-amber-400'
            )}>{meanReversionWinRate}%</span>
          </div>
        </div>
        
        <div className="p-3 bg-amber-500/10 rounded-md border border-amber-500/30">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-sm font-medium text-amber-400 block mb-2">Suggestions</span>
              <ul className="space-y-1">
                {activeSuggestions.map((suggestion, i) => (
                  <li key={i} className="text-sm text-slate-300 flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-slate-500" />
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
          <div className="pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              Last Good Setup
            </div>
            <div className="flex items-center justify-between p-2 bg-slate-800/30 rounded-md">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">{lastGoodSetup.symbol}</span>
                <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">
                  {lastGoodSetup.grade}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400 font-mono">{lastGoodSetup.return}</span>
                <span className="text-xs text-slate-500">{lastGoodSetup.date}</span>
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
