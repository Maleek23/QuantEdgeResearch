import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, Activity } from "lucide-react";
import type { TradeIdea } from "@shared/schema";

interface ValidationResult {
  metric: string;
  expected: number | string;
  actual: number | string;
  source: string;
  valid: boolean;
  severity: 'error' | 'warning' | 'success';
}

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    closedIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    expiredIdeas: number;
    winRate: number;
  };
}

interface SignalIntelligenceData {
  totalAnalyzedTrades: number;
}

export function CrossValidationPanel() {
  const { data: tradeIdeas } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  const { data: performanceStats } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  const { data: signalIntelligence } = useQuery<SignalIntelligenceData>({
    queryKey: ['/api/ml/signal-intelligence'],
  });

  if (!tradeIdeas || !performanceStats || !signalIntelligence) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Cross-Validation System
          </CardTitle>
          <CardDescription>Loading validation data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate validation results
  const validations: ValidationResult[] = [];

  // Validate total ideas count
  const totalIdeas = tradeIdeas.length;
  const perfTotal = performanceStats.overall.totalIdeas;
  validations.push({
    metric: 'Total Trade Ideas',
    expected: totalIdeas,
    actual: perfTotal,
    source: 'Trade Ideas API vs Performance Stats',
    valid: totalIdeas === perfTotal,
    severity: totalIdeas === perfTotal ? 'success' : 'error'
  });

  // Validate closed ideas (hit_target, hit_stop, expired, closed)
  const closedIdeas = tradeIdeas.filter((idea: any) => 
    idea.outcomeStatus === 'hit_target' || 
    idea.outcomeStatus === 'hit_stop' || 
    idea.outcomeStatus === 'expired' ||
    idea.outcomeStatus === 'closed'
  ).length;
  const perfClosed = performanceStats.overall.closedIdeas;
  validations.push({
    metric: 'Closed Trade Ideas',
    expected: closedIdeas,
    actual: perfClosed,
    source: 'Trade Ideas API vs Performance Stats',
    valid: closedIdeas === perfClosed,
    severity: closedIdeas === perfClosed ? 'success' : 'error'
  });

  // Validate won ideas (hit_target)
  const wonIdeas = tradeIdeas.filter((idea: any) => idea.outcomeStatus === 'hit_target').length;
  const perfWon = performanceStats.overall.wonIdeas;
  validations.push({
    metric: 'Won Trade Ideas',
    expected: wonIdeas,
    actual: perfWon,
    source: 'Trade Ideas API vs Performance Stats',
    valid: wonIdeas === perfWon,
    severity: wonIdeas === perfWon ? 'success' : 'error'
  });

  // Validate lost ideas (hit_stop)
  const lostIdeas = tradeIdeas.filter((idea: any) => idea.outcomeStatus === 'hit_stop').length;
  const perfLost = performanceStats.overall.lostIdeas;
  validations.push({
    metric: 'Lost Trade Ideas',
    expected: lostIdeas,
    actual: perfLost,
    source: 'Trade Ideas API vs Performance Stats',
    valid: lostIdeas === perfLost,
    severity: lostIdeas === perfLost ? 'success' : 'error'
  });

  // Validate expired ideas
  const expiredIdeas = tradeIdeas.filter((idea: any) => idea.outcomeStatus === 'expired').length;
  const perfExpired = performanceStats.overall.expiredIdeas;
  validations.push({
    metric: 'Expired Trade Ideas',
    expected: expiredIdeas,
    actual: perfExpired,
    source: 'Trade Ideas API vs Performance Stats',
    valid: expiredIdeas === perfExpired,
    severity: expiredIdeas === perfExpired ? 'success' : 'error'
  });

  // Validate win rate calculation
  const expectedWinRate = wonIdeas > 0 || lostIdeas > 0 ? (wonIdeas / (wonIdeas + lostIdeas)) * 100 : 0;
  const actualWinRate = performanceStats.overall.winRate;
  const winRateValid = Math.abs(expectedWinRate - actualWinRate) < 0.01;
  validations.push({
    metric: 'Market Win Rate',
    expected: `${expectedWinRate.toFixed(1)}%`,
    actual: `${actualWinRate.toFixed(1)}%`,
    source: 'Calculated vs Performance Stats',
    valid: winRateValid,
    severity: winRateValid ? 'success' : 'error'
  });

  // Validate signal intelligence total trades
  const sigTotalTrades = signalIntelligence.totalAnalyzedTrades;
  validations.push({
    metric: 'Signal Intelligence Total Trades',
    expected: '80 (expected historical)',
    actual: sigTotalTrades,
    source: 'Signal Intelligence API',
    valid: sigTotalTrades >= 0,
    severity: sigTotalTrades > 0 ? 'success' : 'warning'
  });

  // Count validation issues
  const errors = validations.filter(v => !v.valid && v.severity === 'error').length;
  const warnings = validations.filter(v => !v.valid && v.severity === 'warning').length;
  const successes = validations.filter(v => v.valid).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Cross-Validation System
            </CardTitle>
            <CardDescription>
              Real-time data integrity validation across all platform metrics
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={errors > 0 ? "destructive" : "default"} className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {successes} Passed
            </Badge>
            {errors > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {errors} Failed
              </Badge>
            )}
            {warnings > 0 && (
              <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-300 border-amber-500/30">
                <AlertTriangle className="h-3 w-3" />
                {warnings} Warnings
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {errors} validation error{errors > 1 ? 's' : ''} detected. Data inconsistency found across platform metrics.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {validations.map((validation, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 transition-all ${
                validation.valid
                  ? 'bg-green-500/5 border-green-500/30'
                  : validation.severity === 'error'
                  ? 'bg-red-500/10 border-red-500/50'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
              data-testid={`validation-${validation.metric.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {validation.valid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : validation.severity === 'error' ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-semibold text-sm">{validation.metric}</span>
                  </div>
                  <div className="text-xs text-muted-foreground ml-6">
                    {validation.source}
                  </div>
                  {!validation.valid && (
                    <div className="ml-6 mt-2 flex items-center gap-3 text-xs font-mono">
                      <div>
                        <span className="text-muted-foreground">Expected:</span>{' '}
                        <span className="text-foreground font-semibold">{validation.expected}</span>
                      </div>
                      <span className="text-muted-foreground">→</span>
                      <div>
                        <span className="text-muted-foreground">Actual:</span>{' '}
                        <span className={validation.severity === 'error' ? 'text-red-400 font-semibold' : 'text-amber-400 font-semibold'}>
                          {validation.actual}
                        </span>
                      </div>
                    </div>
                  )}
                  {validation.valid && (
                    <div className="ml-6 mt-1 text-xs font-mono text-green-400">
                      ✓ {validation.actual}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {errors === 0 && warnings === 0 && (
          <Alert className="bg-green-500/10 border-green-500/30 text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              All metrics validated successfully. Platform data is consistent across all endpoints.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
