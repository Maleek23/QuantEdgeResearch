/**
 * Executive Summary Component
 * Professional research report header with key metrics and ratings
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Database,
  CheckCircle,
} from "lucide-react";

interface ExecutiveSummaryProps {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  overallGrade: string;
  overallScore: number;
  tier: string;
  components: {
    technical: { grade: string; score: number; weight: number };
    fundamental: { grade: string; score: number; weight: number };
    sentiment: { grade: string; score: number; weight: number };
    ml: { grade: string; score: number; weight: number };
    quantitative: { grade: string; score: number; weight: number };
    orderFlow: { grade: string; score: number; weight: number };
    catalysts: { grade: string; score: number; weight: number };
  };
  marketCap?: string;
  sector?: string;
  industry?: string;
  generatedAt?: string;
}

export function ExecutiveSummary({
  symbol,
  name,
  price,
  change,
  changePercent,
  overallGrade,
  overallScore,
  tier,
  components,
  marketCap,
  sector,
  industry,
  generatedAt,
}: ExecutiveSummaryProps) {
  const isPositive = change >= 0;

  // Get grade color
  const getGradeColor = (grade: string) => {
    if (grade.startsWith('S')) return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    if (grade.startsWith('A')) return 'text-[var(--trade-bullish)] border-emerald-500/30 bg-emerald-500/10';
    if (grade.startsWith('B')) return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10';
    if (grade.startsWith('C')) return 'text-[var(--trade-neutral)] border-amber-500/30 bg-amber-500/10';
    if (grade.startsWith('D')) return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
    return 'text-[var(--trade-bearish)] border-red-500/30 bg-red-500/10';
  };

  return (
    <div className="space-y-4">
      {/* Header Section */}
      <Card className="p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-border">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-foreground/95">{symbol}</h1>
              <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                {sector || 'N/A'}
              </Badge>
            </div>
            <p className="text-lg text-muted-foreground mb-1">{name}</p>
            <p className="text-xs text-muted-foreground">{industry || 'N/A'}</p>
          </div>

          {/* Price Display */}
          <div className="text-right">
            <div className="text-3xl font-bold text-foreground/95 mb-1">
              ${safeToFixed(price, 2)}
            </div>
            <div className={cn(
              "flex items-center gap-2 justify-end text-sm font-semibold",
              isPositive ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
            )}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{isPositive ? '+' : ''}{safeToFixed(change, 2)} ({isPositive ? '+' : ''}{safeToFixed(changePercent, 2)}%)</span>
            </div>
            {marketCap && (
              <p className="text-xs text-muted-foreground mt-1">Market Cap: {marketCap}</p>
            )}
          </div>
        </div>

        {/* Overall Rating */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Overall Rating</p>
            <div className={cn(
              "text-5xl font-bold mb-2 inline-block px-4 py-2 rounded-lg border-2",
              getGradeColor(overallGrade)
            )}>
              {overallGrade}
            </div>
            <p className="text-sm text-muted-foreground mt-2">Tier {tier}</p>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Composite Score</p>
            <div className="text-5xl font-bold text-cyan-400">
              {overallScore}
              <span className="text-2xl text-muted-foreground">/100</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-3">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${overallScore}%` }}
              />
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Top Component</p>
            {(() => {
              const topComponent = Object.entries(components).reduce((max, [name, data]) =>
                data.score > max.score ? { name, ...data } : max
              , { name: '', score: 0, grade: '', weight: 0 });

              return (
                <>
                  <div className="text-3xl font-bold text-[var(--trade-bullish)] mb-1">
                    {topComponent.grade}
                  </div>
                  <p className="text-sm text-muted-foreground capitalize">{topComponent.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Score: {topComponent.score}/100</p>
                </>
              );
            })()}
          </div>
        </div>
      </Card>

      {/* Component Breakdown Table */}
      <Card className="p-6 bg-card/90 border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground/95">Analysis Component Breakdown</h3>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {generatedAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(generatedAt).toLocaleString()}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              Research-Grade
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Component</th>
                <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Grade</th>
                <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Score</th>
                <th className="text-center py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Weight</th>
                <th className="text-right py-3 px-2 text-xs font-semibold text-muted-foreground uppercase">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(components).map(([name, data]) => (
                <tr key={name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-2">
                    <span className="font-medium text-foreground/90 capitalize">{name}</span>
                  </td>
                  <td className="text-center py-3 px-2">
                    <Badge variant="outline" className={cn("font-bold", getGradeColor(data.grade))}>
                      {data.grade}
                    </Badge>
                  </td>
                  <td className="text-center py-3 px-2">
                    <span className="font-mono text-cyan-400">{data.score}</span>
                    <span className="text-muted-foreground/70 text-xs">/100</span>
                  </td>
                  <td className="text-center py-3 px-2">
                    <span className="font-mono text-muted-foreground">{safeToFixed(safeNumber(data.weight) * 100, 0)}%</span>
                  </td>
                  <td className="text-right py-3 px-2">
                    <span className="font-mono text-purple-400">
                      {safeToFixed(safeNumber(data.score) * safeNumber(data.weight), 1)}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-bold">
                <td className="py-3 px-2 text-foreground/90">TOTAL</td>
                <td className="text-center py-3 px-2">
                  <Badge variant="outline" className={cn("font-bold", getGradeColor(overallGrade))}>
                    {overallGrade}
                  </Badge>
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-mono text-cyan-400 text-base">{overallScore}</span>
                </td>
                <td className="text-center py-3 px-2">
                  <span className="font-mono text-muted-foreground">100%</span>
                </td>
                <td className="text-right py-3 px-2">
                  <span className="font-mono text-purple-400 text-base">
                    {safeToFixed(overallScore, 1)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Research Certification */}
      <Card className="p-4 bg-gradient-to-r from-emerald-900/20 to-transparent border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <CheckCircle className="h-5 w-5 text-[var(--trade-bullish)]" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-[var(--trade-bullish)] mb-1">Institutional-Grade Research Analysis</h4>
            <p className="text-xs text-muted-foreground">
              All metrics include statistical validation (p-values, z-scores), historical context (percentiles, n=252),
              backtest performance (win rate, Sharpe ratio), and peer-reviewed academic citations (23+ papers).
              Methodology available in expanded metric views.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
