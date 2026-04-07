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
    if (direction === "bullish") return <TrendingUp className="w-3 h-3 text-[var(--trade-bullish)]" />;
    if (direction === "bearish") return <TrendingDown className="w-3 h-3 text-[var(--trade-bearish)]" />;
    return null;
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return { label: "A+", color: "text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/20" };
    if (confidence >= 70) return { label: "A", color: "text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/20" };
    if (confidence >= 60) return { label: "B", color: "text-[var(--trade-neutral)] bg-amber-500/20" };
    return { label: "C", color: "text-muted-foreground bg-muted-foreground/20" };
  };

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Live Research Feed
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[var(--trade-bullish)] animate-pulse" />
          <span className="text-xs text-muted-foreground">{briefs.length} briefs</span>
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
                  : "bg-muted/30 border-border/20 hover:bg-muted/50 hover:border-border/30"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {brief.isPinned && <Star className="w-3 h-3 text-[var(--trade-neutral)] fill-amber-400" />}
                  <span className="font-mono text-sm font-semibold text-foreground/90">
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

              <p className="text-sm text-foreground/80 line-clamp-2 mb-2">
                {brief.title}
              </p>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
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
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Newspaper className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No research briefs</span>
        </div>
      )}
    </div>
  );
}
