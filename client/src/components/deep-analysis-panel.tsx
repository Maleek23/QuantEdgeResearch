/**
 * Deep Analysis Panel - Shows full signal breakdown for trade ideas
 * Displays WHY a stock is recommended with all contributing signals
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Newspaper,
  Users,
  BarChart3,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  Brain,
  Layers,
  DollarSign,
} from "lucide-react";
import type { ConvergenceAnalysis, ConvergenceSignal } from "@shared/schema";

interface DeepAnalysisPanelProps {
  analysis: ConvergenceAnalysis | null | undefined;
  symbol: string;
  direction: 'long' | 'short';
  className?: string;
  defaultExpanded?: boolean;
}

// Signal source icons
const SOURCE_ICONS: Record<string, React.ElementType> = {
  options_sweep: DollarSign,
  breaking_news: Newspaper,
  insider_buying: Users,
  social_momentum: Users,
  sector_leader: Layers,
  premarket_surge: TrendingUp,
  volume_spike: BarChart3,
  iv_expansion: Activity,
  analyst_upgrade: Brain,
  defense_contract: Target,
  earnings_whisper: Zap,
  technical: BarChart3,
  sentiment: Users,
};

// Signal source colors
const SOURCE_COLORS: Record<string, string> = {
  options_sweep: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  breaking_news: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  insider_buying: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  social_momentum: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  sector_leader: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  premarket_surge: "bg-green-500/20 text-green-400 border-green-500/30",
  volume_spike: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  iv_expansion: "bg-red-500/20 text-red-400 border-red-500/30",
  analyst_upgrade: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  defense_contract: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  earnings_whisper: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

function SignalCard({ signal }: { signal: ConvergenceSignal }) {
  const Icon = SOURCE_ICONS[signal.source] || Activity;
  const colorClass = SOURCE_COLORS[signal.source] || "bg-slate-500/20 text-slate-400 border-slate-500/30";
  const isBullish = signal.direction === 'bullish';

  return (
    <div className={cn(
      "p-3 rounded-lg border",
      colorClass
    )}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium capitalize">
            {signal.source.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isBullish ? (
            <TrendingUp className="w-3 h-3 text-emerald-400" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-400" />
          )}
          <span className={cn(
            "text-[10px] font-bold",
            isBullish ? "text-emerald-400" : "text-red-400"
          )}>
            {signal.confidence}%
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">
        {signal.description}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          Weight: {signal.weight}
        </Badge>
        {signal.timestamp && (
          <span className="text-[9px] text-slate-500">
            {new Date(signal.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

function SummarySection({
  title,
  content,
  icon: Icon
}: {
  title: string;
  content: string | undefined;
  icon: React.ElementType;
}) {
  if (!content) return null;

  return (
    <div className="p-3 bg-slate-800/30 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold text-slate-300">{title}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{content}</p>
    </div>
  );
}

export function DeepAnalysisPanel({
  analysis,
  symbol,
  direction,
  className,
  defaultExpanded = false
}: DeepAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!analysis) {
    return (
      <Card className={cn(
        "p-4 bg-slate-900/50 border-slate-700/50",
        className
      )}>
        <div className="flex items-center justify-center gap-2 text-slate-500">
          <Brain className="w-4 h-4" />
          <span className="text-sm">No deep analysis available for this trade idea</span>
        </div>
      </Card>
    );
  }

  const isLong = direction === 'long';

  return (
    <Card className={cn(
      "overflow-hidden border",
      isLong ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5",
      className
    )}>
      {/* Header - Always Visible */}
      <div
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            isLong ? "bg-emerald-500/20" : "bg-red-500/20"
          )}>
            <Brain className={cn(
              "w-5 h-5",
              isLong ? "text-emerald-400" : "text-red-400"
            )} />
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              Deep Analysis: {symbol}
              <Badge className={cn(
                "text-[10px]",
                isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                {isLong ? 'BULLISH' : 'BEARISH'}
              </Badge>
            </h3>
            <p className="text-xs text-slate-400">
              {analysis.signalCount} signals converged • Score: {analysis.convergenceScore}%
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 pt-0 space-y-4 border-t border-slate-700/50">
          {/* Primary Thesis */}
          <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 rounded-lg border border-cyan-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-cyan-400">Primary Thesis</span>
            </div>
            <p className="text-sm text-white leading-relaxed">{analysis.primaryThesis}</p>
          </div>

          {/* Signal Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Layers className="w-3 h-3" /> Signal Breakdown ({analysis.signals.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {analysis.signals.map((signal, idx) => (
                <SignalCard key={idx} signal={signal} />
              ))}
            </div>
          </div>

          {/* Summary Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <SummarySection
              title="Technical Summary"
              content={analysis.technicalSummary}
              icon={BarChart3}
            />
            <SummarySection
              title="Options Flow"
              content={analysis.flowSummary}
              icon={DollarSign}
            />
            <SummarySection
              title="News Catalysts"
              content={analysis.newsSummary}
              icon={Newspaper}
            />
            <SummarySection
              title="Sentiment"
              content={analysis.sentimentSummary}
              icon={Users}
            />
          </div>

          {/* Key Levels */}
          {analysis.keyLevels && analysis.keyLevels.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Key Price Levels
              </h4>
              <div className="flex flex-wrap gap-2">
                {analysis.keyLevels.map((level, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className={cn(
                      "text-xs",
                      level.type === 'target' && "border-emerald-500/50 text-emerald-400",
                      level.type === 'stop' && "border-red-500/50 text-red-400",
                      level.type === 'entry' && "border-cyan-500/50 text-cyan-400"
                    )}
                  >
                    {level.label}: ${level.price.toFixed(2)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Risk Factors */}
          {analysis.riskFactors && analysis.riskFactors.length > 0 && (
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Risk Factors</span>
              </div>
              <ul className="space-y-1">
                {analysis.riskFactors.map((risk, idx) => (
                  <li key={idx} className="text-xs text-amber-300/80">• {risk}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 text-[10px] text-slate-500">
            <span>Generated: {new Date(analysis.generatedAt).toLocaleString()}</span>
            <span>Convergence Score: {analysis.convergenceScore}%</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default DeepAnalysisPanel;
