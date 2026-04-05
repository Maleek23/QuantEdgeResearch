/**
 * Trade Idea Detail Modal v2
 * ==========================
 * Shows TV vs QE scoring breakdown, trade levels,
 * scale-out plan, and strategy context.
 */

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import {
  ArrowUpRight, ArrowDownRight, X, ExternalLink,
  CheckCircle2, AlertTriangle, MinusCircle, Zap, Clock, Target,
  TrendingUp, Shield, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeIdea } from "@shared/schema";

interface Props {
  idea: TradeIdea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function safeFixed(n: number | null | undefined, d: number): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '--';
  return Number(n).toFixed(d);
}

function relativeTime(iso: string): string {
  if (!iso) return '--';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Parse QE checks from the catalyst/analysis text
function parseQEChecks(text: string): { label: string; passed: boolean }[] {
  const checks: { label: string; passed: boolean }[] = [];
  if (!text) return checks;

  // Look for QE check patterns in the text
  const patterns = [
    { match: /Sector\s+(\w+)\s+aligned/i, label: (m: RegExpMatchArray) => `Sector ${m[1]} aligned`, passed: true },
    { match: /Sector\s+(\w+)\s+opposing/i, label: (m: RegExpMatchArray) => `Sector ${m[1]} opposing`, passed: false },
    { match: /High volume\s+([\d.]+)x/i, label: (m: RegExpMatchArray) => `High volume ${m[1]}x avg`, passed: true },
    { match: /Moderate volume\s+([\d.]+)x/i, label: (m: RegExpMatchArray) => `Moderate volume ${m[1]}x`, passed: true },
    { match: /Low volume\s+([\d.]+)x/i, label: (m: RegExpMatchArray) => `Low volume ${m[1]}x`, passed: false },
    { match: /Reversal setup\s*\(prev\s*([-\d.]+)%/i, label: (m: RegExpMatchArray) => `Reversal setup (prev ${m[1]}% red)`, passed: true },
    { match: /Breakdown setup/i, label: () => 'Breakdown setup confirmed', passed: true },
    { match: /Flow\s+(\w+)\s*\((\d+)%/i, label: (m: RegExpMatchArray) => `Flow ${m[1]} (${m[2]}% strength)`, passed: true },
  ];

  for (const p of patterns) {
    const m = text.match(p.match);
    if (m) checks.push({ label: p.label(m), passed: p.passed });
  }

  return checks;
}

// Extract TV and QE scores from analysis text
function parseScores(idea: TradeIdea): { tvScore: number | null; qeScore: number | null; qeVerdict: string | null } {
  const text = (idea as any).analysis || '';
  const tvMatch = text.match(/TV:(\d+)/);
  const qeMatch = text.match(/QE:(\d+)\((\w+)\)/);

  return {
    tvScore: tvMatch ? parseInt(tvMatch[1]) : null,
    qeScore: qeMatch ? parseInt(qeMatch[1]) : null,
    qeVerdict: qeMatch ? qeMatch[2] : null,
  };
}

export function TradeIdeaDetailV2({ idea, open, onOpenChange }: Props) {
  if (!idea) return null;

  const isLong = idea.direction === 'long' || idea.direction === 'LONG';
  const isTV = (idea as any).source === 'tradingview';
  const isOption = idea.assetType === 'option' || (idea as any).optionType;
  const optType = ((idea as any).optionType || '').toUpperCase();
  const strike = (idea as any).strikePrice;
  const expiry = (idea as any).expiryDate;
  const confidence = (idea as any).confidenceScore || 50;
  const grade = (idea as any).probabilityBand || (confidence >= 90 ? 'A+' : confidence >= 85 ? 'A' : confidence >= 80 ? 'B+' : confidence >= 70 ? 'B' : 'C');
  const rr = (idea as any).riskRewardRatio || 0;
  const contractCost = isOption && idea.entryPrice ? idea.entryPrice * 100 : null;
  const catalyst = idea.catalyst || '';
  const analysis = (idea as any).analysis || '';
  const session = (idea as any).sessionContext || '';
  const strategyName = isTV ? (session.includes('v15B') ? 'v15B (Swing 1H)' : session.includes('v15') ? 'v15 (Intraday 15min)' : 'TradingView') : 'AI Engine';

  // Parse dual scores
  const { tvScore, qeScore, qeVerdict } = parseScores(idea);
  const qeChecks = parseQEChecks(catalyst + ' ' + analysis);

  // Scale-out plan based on strategy rules
  const entryPrice = idea.entryPrice || 0;
  const scaleOut = isOption ? [
    { level: '+30%', price: +(entryPrice * 1.3).toFixed(2), action: 'Sell 1/3 — lock profit', cost: contractCost ? `$${(entryPrice * 1.3 * 100).toFixed(0)}` : null },
    { level: '+80%', price: +(entryPrice * 1.8).toFixed(2), action: 'Sell 1/3 — let rest run', cost: contractCost ? `$${(entryPrice * 1.8 * 100).toFixed(0)}` : null },
    { level: 'Trail', price: null, action: 'Trail final 1/3 at 25% from peak', cost: null },
  ] : [];

  const expiryFormatted = expiry
    ? new Date(expiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 bg-slate-900 border-slate-800 overflow-hidden">
        {/* Header */}
        <div className={cn(
          "px-5 pt-5 pb-4",
          isTV ? "bg-purple-500/5 border-b border-purple-500/20" : "border-b border-slate-800"
        )}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
                isLong
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              )}>
                {idea.symbol.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">{idea.symbol}</span>
                  <Badge className={cn(
                    "text-[10px] border",
                    isLong ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"
                  )}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </Badge>
                  {isTV && (
                    <Badge className="text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/30">
                      📺 {strategyName}
                    </Badge>
                  )}
                </div>
                {isOption && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
                    <span className="text-white font-mono">{optType} ${strike}</span>
                    {expiryFormatted && <span>exp {expiryFormatted}</span>}
                    {contractCost && <span className="text-slate-500">• ${contractCost.toFixed(0)}/ct</span>}
                  </div>
                )}
              </div>
            </div>
            <Badge className={cn(
              "text-lg font-bold px-3 py-1",
              grade.startsWith('A') ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" :
              grade.startsWith('B') ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
              "bg-slate-500/15 text-slate-400 border border-slate-500/30"
            )}>
              {grade}
            </Badge>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* SCORES — TV vs QE */}
          {(tvScore || qeScore) && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Scores</h3>
              <div className="grid grid-cols-3 gap-2">
                {tvScore && (
                  <div className="text-center py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="text-[9px] text-purple-400/70 uppercase">TV Score</div>
                    <div className="text-xl font-bold font-mono text-purple-400">{tvScore}</div>
                  </div>
                )}
                {qeScore && (
                  <div className={cn(
                    "text-center py-2 rounded-lg border",
                    qeVerdict === 'CONFIRMED' ? "bg-emerald-500/10 border-emerald-500/20" :
                    qeVerdict === 'NEUTRAL' ? "bg-amber-500/10 border-amber-500/20" :
                    "bg-red-500/10 border-red-500/20"
                  )}>
                    <div className="text-[9px] text-slate-400 uppercase">QE Score</div>
                    <div className={cn(
                      "text-xl font-bold font-mono",
                      qeVerdict === 'CONFIRMED' ? "text-emerald-400" :
                      qeVerdict === 'NEUTRAL' ? "text-amber-400" : "text-red-400"
                    )}>{qeScore}</div>
                    <div className={cn(
                      "text-[9px] font-medium",
                      qeVerdict === 'CONFIRMED' ? "text-emerald-400/70" :
                      qeVerdict === 'NEUTRAL' ? "text-amber-400/70" : "text-red-400/70"
                    )}>{qeVerdict}</div>
                  </div>
                )}
                <div className="text-center py-2 rounded-lg bg-white/5 border border-slate-700/50">
                  <div className="text-[9px] text-slate-500 uppercase">Combined</div>
                  <div className={cn(
                    "text-xl font-bold font-mono",
                    confidence >= 80 ? "text-emerald-400" : confidence >= 65 ? "text-amber-400" : "text-red-400"
                  )}>{Math.round(confidence)}</div>
                </div>
              </div>
            </div>
          )}

          {/* QE CHECKS */}
          {qeChecks.length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">QE Validation</h3>
              <div className="space-y-1.5">
                {qeChecks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {check.passed
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    }
                    <span className={check.passed ? "text-slate-300" : "text-amber-400/80"}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No scores for non-TV ideas — show confidence only */}
          {!tvScore && !qeScore && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Confidence</h3>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "text-2xl font-bold font-mono",
                  confidence >= 80 ? "text-emerald-400" : confidence >= 65 ? "text-amber-400" : "text-slate-400"
                )}>
                  {Math.round(confidence)}%
                </div>
                <span className="text-xs text-slate-500">from calibration engine (historical WR + R:R + signals)</span>
              </div>
            </div>
          )}

          <Separator className="bg-slate-800" />

          {/* TRADE LEVELS */}
          <div>
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Trade Levels</h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center py-2 rounded bg-slate-800/50">
                <div className="text-[9px] text-slate-500">Entry</div>
                <div className="text-sm font-bold font-mono text-white">${safeFixed(idea.entryPrice, 2)}</div>
              </div>
              <div className="text-center py-2 rounded bg-emerald-500/10">
                <div className="text-[9px] text-emerald-400/70">Target</div>
                <div className="text-sm font-bold font-mono text-emerald-400">${safeFixed(idea.targetPrice, 2)}</div>
              </div>
              <div className="text-center py-2 rounded bg-red-500/10">
                <div className="text-[9px] text-red-400/70">Stop</div>
                <div className="text-sm font-bold font-mono text-red-400">${safeFixed(idea.stopLoss, 2)}</div>
              </div>
              <div className="text-center py-2 rounded bg-cyan-500/10">
                <div className="text-[9px] text-cyan-400/70">R:R</div>
                <div className="text-sm font-bold font-mono text-cyan-400">{Number(rr).toFixed(1)}:1</div>
              </div>
            </div>
          </div>

          {/* SCALE-OUT PLAN (options only) */}
          {scaleOut.length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Scale-Out Plan</h3>
              <div className="space-y-1.5">
                {scaleOut.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-800/30">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-mono font-medium w-12">{s.level}</span>
                      <span className="text-slate-400">{s.action}</span>
                    </div>
                    {s.price && <span className="text-white font-mono">${s.price}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CATALYST */}
          {catalyst && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Catalyst</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                <Zap className="w-3 h-3 text-amber-400 inline mr-1" />
                {catalyst.split('|')[0].trim()}
              </p>
            </div>
          )}

          {/* STRATEGY CONTEXT */}
          <div>
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Strategy</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{strategyName}</span>
              <span className="text-slate-700">|</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {relativeTime(idea.timestamp || '')}
              </span>
              <span className="text-slate-700">|</span>
              <span>{(idea as any).source || 'scanner'}</span>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex items-center gap-2 pt-2">
            <Link href={`/stock/${idea.symbol}`}>
              <Button variant="outline" size="sm" className="text-xs border-slate-700 hover:border-slate-600">
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Full Analysis
              </Button>
            </Link>
            <Link href={`/gex?symbol=${idea.symbol}`}>
              <Button variant="outline" size="sm" className="text-xs border-slate-700 hover:border-slate-600">
                <BarChart3 className="w-3 h-3 mr-1.5" />
                GEX Profile
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
