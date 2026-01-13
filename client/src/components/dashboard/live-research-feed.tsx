import { cn } from "@/lib/utils";
import { Newspaper, TrendingUp, TrendingDown, Clock, Star } from "lucide-react";

interface ResearchBrief {
  id: string;
  symbol: string;
  title: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  source: string;
  timestamp: string;
  isNew?: boolean;
  isPinned?: boolean;
}

interface LiveResearchFeedProps {
  briefs: ResearchBrief[];
  onBriefClick?: (brief: ResearchBrief) => void;
  className?: string;
}

export function LiveResearchFeed({ briefs, onBriefClick, className }: LiveResearchFeedProps) {
  const getDirectionIcon = (direction: ResearchBrief["direction"]) => {
    if (direction === "bullish") return <TrendingUp className="w-3 h-3 text-green-400" />;
    if (direction === "bearish") return <TrendingDown className="w-3 h-3 text-red-400" />;
    return null;
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return { label: "A+", color: "text-green-400 bg-green-500/20" };
    if (confidence >= 70) return { label: "A", color: "text-green-400 bg-green-500/20" };
    if (confidence >= 60) return { label: "B", color: "text-amber-400 bg-amber-500/20" };
    return { label: "C", color: "text-slate-400 bg-slate-500/20" };
  };

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-slate-400">
            Live Research Feed
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-slate-400">{briefs.length} briefs</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {briefs.map((brief) => {
          const badge = getConfidenceBadge(brief.confidence);
          return (
            <div
              key={brief.id}
              onClick={() => onBriefClick?.(brief)}
              className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all duration-200",
                brief.isNew
                  ? "bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                  : "bg-slate-800/30 border-slate-700/20 hover:bg-slate-800/50 hover:border-slate-600/30"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {brief.isPinned && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {brief.symbol}
                  </span>
                  {getDirectionIcon(brief.direction)}
                  {brief.isNew && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-medium">
                      NEW
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-mono font-medium",
                    badge.color
                  )}
                >
                  {badge.label}
                </span>
              </div>

              <p className="text-sm text-slate-300 line-clamp-2 mb-2">
                {brief.title}
              </p>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{brief.source}</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{brief.timestamp}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {briefs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <Newspaper className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No research briefs</span>
        </div>
      )}
    </div>
  );
}
