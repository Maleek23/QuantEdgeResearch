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
import { cn, safeToFixed, formatRelativeTime } from "@/lib/utils";
import { getSourceConfig, getTier } from "./constants";
import type { TradeIdea } from "@shared/schema";

// Use shared utilities — no local redefinitions
const safeFixed = (n: number | null | undefined, d: number) => safeToFixed(n, d, '--');
const relativeTime = (iso: string) => formatRelativeTime(iso);

function gradeStyle(grade: string) {
  if (['A+', 'A'].includes(grade)) return { bg: 'bg-amber-500/20', text: 'text-[var(--trade-neutral)]', border: 'border-amber-500/40' };
  if (['A-', 'B+'].includes(grade)) return { bg: 'bg-emerald-500/15', text: 'text-[var(--trade-bullish)]', border: 'border-emerald-500/30' };
  if (['B', 'B-'].includes(grade)) return { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' };
  return { bg: 'bg-muted-foreground/15', text: 'text-muted-foreground', border: 'border-muted-foreground/30' };
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
        "relative overflow-hidden cursor-pointer transition-all duration-150",
        "bg-card/60 hover:bg-muted/50",
        "hover:shadow-md hover:-translate-y-px",
        isLong ? "border-l-2 border-l-[var(--trade-bullish)]" : "border-l-2 border-l-[var(--trade-bearish)]",
        isTV
          ? "border-purple-500/30 hover:border-purple-400/50"
          : "border-border hover:border-border"
      )}>
        <div className="p-3">
          {/* Row 1: Symbol + Direction + Grade */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* Symbol avatar */}
              <div className={cn(
                "w-7 h-7 rounded-md flex items-center justify-center font-bold text-[10px]",
                isLong
                  ? "bg-emerald-500/20 text-[var(--trade-bullish)] border border-emerald-500/30"
                  : "bg-red-500/20 text-[var(--trade-bearish)] border border-red-500/30"
              )}>
                {idea.symbol.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-foreground text-sm tracking-wide font-mono">{idea.symbol}</span>
                  {tier === 'S' && (
                    <span className="text-[8px] px-1 py-0 rounded bg-amber-500/20 text-[var(--trade-neutral)] border border-amber-500/30 font-mono">S</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "text-[9px] px-1 py-0 rounded font-mono font-medium",
                    isLong ? "bg-emerald-500/15 text-[var(--trade-bullish)]" : "bg-red-500/15 text-[var(--trade-bearish)]"
                  )}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                  {isOption && (
                    <span className="text-[9px] px-1 py-0 rounded bg-purple-500/15 text-purple-400 font-mono">
                      {optType} ${strike}
                    </span>
                  )}
                  {expiryFormatted && (
                    <span className="text-[9px] text-muted-foreground font-mono">{expiryFormatted}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Grade + Source */}
            <div className="flex items-center gap-1.5">
              <Badge className={cn("text-[9px] border px-1 py-0 font-mono", sc.bg, sc.color, sc.border)}>
                {isTV ? `TV ${strategyName}` : sc.label}
              </Badge>
              <Badge className={cn("text-xs font-bold px-1.5 py-0.5 border font-mono", gs.bg, gs.text, gs.border)}>
                {grade}
              </Badge>
            </div>
          </div>

          {/* Row 2: Confidence + Target % — compact inline */}
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <div className="text-center py-1 rounded-md bg-muted/40">
              <div className="text-[8px] text-muted-foreground uppercase font-mono tracking-wider">Conf</div>
              <div className={cn(
                "text-base font-bold font-mono tabular-nums",
                confidence >= 80 ? "text-[var(--trade-bullish)]" : confidence >= 65 ? "text-cyan-400" : "text-[var(--trade-neutral)]"
              )}>
                {Math.round(confidence)}%
              </div>
            </div>
            <div className="text-center py-1 rounded-md bg-muted/40">
              <div className="text-[8px] text-muted-foreground uppercase font-mono tracking-wider">Target</div>
              <div className="text-base font-bold font-mono tabular-nums text-[var(--trade-bullish)]">
                +{potentialProfit.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Row 3: Entry / Target / Stop — data-cell density */}
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="text-center">
              <div className="text-muted-foreground text-[8px] font-mono uppercase">Entry</div>
              <div className="font-mono tabular-nums text-foreground font-medium text-data-sm">${safeFixed(entryPrice, 2)}</div>
              {contractCost && (
                <div className="text-[8px] text-muted-foreground/60 font-mono tabular-nums">${contractCost.toFixed(0)}/ct</div>
              )}
            </div>
            {isLong
              ? <ArrowUpRight className="w-3.5 h-3.5 text-[var(--trade-bullish)]/40" />
              : <ArrowDownRight className="w-3.5 h-3.5 text-[var(--trade-bearish)]/40" />
            }
            <div className="text-center">
              <div className="text-[var(--trade-bullish)]/70 text-[8px] font-mono uppercase">Target</div>
              <div className="font-mono tabular-nums text-[var(--trade-bullish)] font-medium text-data-sm">${safeFixed(targetPrice, 2)}</div>
            </div>
            <div className="text-center">
              <div className="text-[var(--trade-bearish)]/70 text-[8px] font-mono uppercase">Stop</div>
              <div className="font-mono tabular-nums text-[var(--trade-bearish)] font-medium text-data-sm">${safeFixed(stopLoss, 2)}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground text-[8px] font-mono uppercase">R:R</div>
              <div className="font-mono tabular-nums text-cyan-400 font-medium text-data-sm">{Number(rr).toFixed(1)}:1</div>
            </div>
          </div>

          {/* Row 4: Catalyst */}
          {catalyst && (
            <div className="pt-1.5 border-t border-border/40">
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-[var(--trade-neutral)]/50 shrink-0" />
                {catalyst.slice(0, 80)}{catalyst.length > 80 ? '...' : ''}
              </p>
            </div>
          )}

          {/* Row 5: Timestamp + Source */}
          <div className="flex items-center justify-between mt-1.5 text-[8px] text-muted-foreground/60 font-mono">
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {relativeTime(idea.timestamp || '')}
            </span>
            <span className="uppercase tracking-wider">{(idea as any).source === 'tradingview' ? 'TV' : ((idea as any).source || 'scan')}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
