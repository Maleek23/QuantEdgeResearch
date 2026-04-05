/**
 * Signal Card
 * ===========
 * Compact single-row trade signal. Shows source, symbol, direction,
 * option details, contract cost, and confidence. Always same height.
 * Click navigates to /stock/SYMBOL.
 */

import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { getSourceConfig, getTier } from "./constants";
import type { TradeIdea } from "@shared/schema";

function formatTime(iso: string): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

function formatConfidence(score: number | null | undefined, band: string | null | undefined): string {
  if (band && ['A+', 'A', 'A-'].includes(band)) return band;
  if (band && ['B+', 'B'].includes(band)) return band;
  if (score && score >= 80) return `${Math.round(score)}%`;
  if (score) return `${Math.round(score)}%`;
  return '--';
}

function confidenceColor(score: number | null | undefined): string {
  const s = score || 0;
  if (s >= 85) return 'text-emerald-400';
  if (s >= 70) return 'text-cyan-400';
  if (s >= 55) return 'text-amber-400';
  return 'text-slate-500';
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
  const confidence = (idea as any).confidenceScore;
  const band = (idea as any).probabilityBand;
  const contractCost = isOption && idea.entryPrice ? `$${(idea.entryPrice * 100).toFixed(0)}` : null;
  const tier = getTier(idea.symbol);
  const catalyst = idea.catalyst || (idea as any).analysis || '';
  const shortCatalyst = catalyst.length > 60 ? catalyst.slice(0, 57) + '...' : catalyst;

  // Strategy info for TV signals
  const session = (idea as any).sessionContext || '';
  const strategyName = isTV ? (session.includes('v15B') ? 'v15B' : session.includes('v15') ? 'v15' : 'TV') : '';
  const signalType = isTV && catalyst ? catalyst.split(' ')[0] : '';

  return (
    <Link href={`/stock/${idea.symbol}`}>
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer group",
        "hover:bg-slate-800/50",
        isTV ? "border-l-2 border-purple-500/60" : "border-l-2 border-transparent"
      )}>
        {/* Source badge */}
        <span className={cn(
          "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
          sc.bg, sc.color, sc.border, "border"
        )}>
          {sc.label}
        </span>

        {/* Symbol + direction */}
        <div className="flex items-center gap-1.5 min-w-[140px]">
          <span className="font-mono font-bold text-white text-sm">{idea.symbol}</span>
          <span className={cn(
            "text-[10px] font-medium px-1 py-0 rounded",
            isLong ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          )}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          {tier === 'S' && <span className="text-[9px] text-amber-500">S</span>}
        </div>

        {/* Option details OR catalyst */}
        <div className="flex-1 min-w-0">
          {isOption ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-300 font-mono">
                {optType} ${strike}
              </span>
              {expiry && (
                <span className="text-slate-500 font-mono">
                  {new Date(expiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                </span>
              )}
              <span className="text-slate-500">|</span>
              <span className="text-slate-300 font-mono">
                ${idea.entryPrice?.toFixed(2)}
              </span>
              <span className="text-slate-600">→</span>
              <span className="text-emerald-400 font-mono">
                ${idea.targetPrice?.toFixed(2)}
              </span>
              {contractCost && (
                <span className="text-slate-600 text-[10px]">
                  ({contractCost}/ct)
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-500 truncate block">
              {shortCatalyst}
            </span>
          )}
        </div>

        {/* Strategy name for TV signals */}
        {isTV && strategyName && (
          <span className="text-[10px] text-purple-400/70 font-mono shrink-0">
            {strategyName}
          </span>
        )}

        {/* Confidence */}
        <span className={cn(
          "text-xs font-semibold shrink-0 min-w-[32px] text-right font-mono",
          confidenceColor(confidence)
        )}>
          {formatConfidence(confidence, band)}
        </span>

        {/* Time */}
        <span className="text-[10px] text-slate-600 font-mono shrink-0 min-w-[64px] text-right">
          {formatTime(idea.timestamp || '')}
        </span>
      </div>
    </Link>
  );
}
