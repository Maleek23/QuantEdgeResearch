/**
 * Signal Card (Trade Idea Card)
 * =============================
 * Visual trade idea card with grade, entry/target/stop, option details,
 * catalyst, confidence, and source badge. Click navigates to full analysis.
 */

import { Link } from "wouter";
import { ArrowUpRight, ArrowDownRight, Zap, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSourceConfig, getTier } from "./constants";
import type { TradeIdea } from "@shared/schema";

function safeFixed(n: number | null | undefined, d: number): string {
  if (n === null || n === undefined || isNaN(n)) return '--';
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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function gradeStyle(grade: string) {
  if (['A+', 'A'].includes(grade)) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' };
  if (['A-', 'B+'].includes(grade)) return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  if (['B', 'B-'].includes(grade)) return { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' };
  return { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' };
}

export default function SignalCard({ idea }: { idea: TradeIdea }) {
  const source = (idea as any).source || 'quant';
  const sc = getSourceConfig(source);
  const isTV = source === 'tradingview';
  const isLong = idea.direction === 'long' || idea.direction === 'LONG';
  const isOption = idea.assetType === 'option' || (idea as any).optionType;
  const optType = ((idea as any).optionType || '').toUpperCase();
  const strike = (idea as any).strikePrice;
  const expiry = (idea as any).expiryDate;
  const confidence = (idea as any).confidenceScore || 50;
  const grade = (idea as any).probabilityBand || (confidence >= 90 ? 'A' : confidence >= 80 ? 'B+' : confidence >= 70 ? 'B' : 'C');
  const gs = gradeStyle(grade);
  const contractCost = isOption && idea.entryPrice ? (idea.entryPrice * 100) : null;
  const tier = getTier(idea.symbol);

  const entryPrice = idea.entryPrice || 0;
  const targetPrice = idea.targetPrice || 0;
  const stopLoss = idea.stopLoss || 0;
  const potentialProfit = entryPrice > 0 ? ((targetPrice - entryPrice) / entryPrice * 100) : 0;
  const rr = (idea as any).riskRewardRatio || (entryPrice > stopLoss ? (targetPrice - entryPrice) / (entryPrice - stopLoss) : 0);

  const catalyst = idea.catalyst || '';
  const session = (idea as any).sessionContext || '';
  const strategyName = isTV ? (session.includes('v15B') ? 'v15B' : session.includes('v15') ? 'v15' : 'TV') : '';

  const expiryFormatted = expiry
    ? new Date(expiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <Link href={`/stock/${idea.symbol}`}>
      <Card className={cn(
        "relative overflow-hidden cursor-pointer transition-all duration-200",
        "bg-slate-900/60 hover:bg-slate-800/60",
        "hover:shadow-lg hover:-translate-y-0.5",
        isTV
          ? "border-purple-500/30 hover:border-purple-400/50"
          : "border-slate-800 hover:border-slate-700"
      )}>
        <div className="p-4">
          {/* Row 1: Symbol + Direction + Grade */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {/* Symbol avatar */}
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs",
                isLong
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              )}>
                {idea.symbol.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-white">{idea.symbol}</span>
                  {tier === 'S' && (
                    <span className="text-[9px] px-1 py-0 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">S</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={cn(
                    "text-[10px] px-1.5 py-0 rounded font-medium",
                    isLong ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                  )}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                  {isOption && (
                    <span className="text-[10px] px-1.5 py-0 rounded bg-purple-500/15 text-purple-400">
                      {optType} ${strike}
                    </span>
                  )}
                  {expiryFormatted && (
                    <span className="text-[10px] text-slate-500">{expiryFormatted}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Grade + Source */}
            <div className="flex items-center gap-2">
              <Badge className={cn("text-[10px] border px-1.5 py-0", sc.bg, sc.color, sc.border)}>
                {isTV ? `📺 ${strategyName}` : sc.label}
              </Badge>
              <Badge className={cn("text-sm font-bold px-2 py-0.5 border", gs.bg, gs.text, gs.border)}>
                {grade}
              </Badge>
            </div>
          </div>

          {/* Row 2: Confidence + Target % */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="text-center py-1.5 rounded bg-slate-800/50">
              <div className="text-[9px] text-slate-500 uppercase">Confidence</div>
              <div className={cn(
                "text-lg font-bold font-mono",
                confidence >= 80 ? "text-emerald-400" : confidence >= 65 ? "text-cyan-400" : "text-amber-400"
              )}>
                {Math.round(confidence)}%
              </div>
            </div>
            <div className="text-center py-1.5 rounded bg-slate-800/50">
              <div className="text-[9px] text-slate-500 uppercase">Target</div>
              <div className="text-lg font-bold font-mono text-emerald-400">
                +{potentialProfit.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Row 3: Entry / Target / Stop */}
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="text-center">
              <div className="text-slate-500 text-[10px]">Entry</div>
              <div className="font-mono text-white">${safeFixed(entryPrice, 2)}</div>
              {contractCost && (
                <div className="text-[9px] text-slate-600 font-mono">${contractCost.toFixed(0)}/ct</div>
              )}
            </div>
            {isLong
              ? <ArrowUpRight className="w-4 h-4 text-emerald-500/50" />
              : <ArrowDownRight className="w-4 h-4 text-red-500/50" />
            }
            <div className="text-center">
              <div className="text-emerald-400 text-[10px]">Target</div>
              <div className="font-mono text-emerald-400">${safeFixed(targetPrice, 2)}</div>
            </div>
            <div className="text-center">
              <div className="text-red-400 text-[10px]">Stop</div>
              <div className="font-mono text-red-400">${safeFixed(stopLoss, 2)}</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500 text-[10px]">R:R</div>
              <div className="font-mono text-cyan-400">{Number(rr).toFixed(1)}:1</div>
            </div>
          </div>

          {/* Row 4: Catalyst */}
          {catalyst && (
            <div className="pt-2 border-t border-slate-800/50">
              <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400/60 shrink-0" />
                {catalyst.slice(0, 80)}{catalyst.length > 80 ? '...' : ''}
              </p>
            </div>
          )}

          {/* Row 5: Timestamp + Source */}
          <div className="flex items-center justify-between mt-2 text-[9px] text-slate-600">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(idea.timestamp || '')}
            </span>
            <span>{(idea as any).source === 'tradingview' ? 'TradingView Signal' : ((idea as any).source || 'scanner')}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
