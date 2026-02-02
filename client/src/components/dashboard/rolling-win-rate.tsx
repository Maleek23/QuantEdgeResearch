import { cn, safeToFixed } from "@/lib/utils";
import { TrendingUp, Trophy } from "lucide-react";

interface WinRateData {
  period: string;
  winRate: number;
  trades: number;
  wins: number;
  losses: number;
}

interface RollingWinRateProps {
  data: WinRateData[];
  overallWinRate: number;
  className?: string;
}

export function RollingWinRate({ data, overallWinRate, className }: RollingWinRateProps) {
  const getWinRateColor = (rate: number) => {
    if (rate >= 60) return "text-green-400";
    if (rate >= 50) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-amber-400" />
        <span className="text-xs uppercase tracking-widest text-slate-400">
          Rolling Win Rate
        </span>
      </div>

      <div className="flex items-center justify-center mb-4">
        <div className="relative w-24 h-24">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-800"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - overallWinRate / 100)}
              className={cn("transition-all duration-500", getWinRateColor(overallWinRate))}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-2xl font-bold font-mono tabular-nums", getWinRateColor(overallWinRate))}>
              {safeToFixed(overallWinRate, 0)}%
            </span>
            <span className="text-[10px] text-slate-400">All Time</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {data.map((item) => (
          <div
            key={item.period}
            className="bg-slate-800/40 rounded-lg p-2 text-center"
          >
            <span className="text-[10px] text-slate-400 block mb-1">
              {item.period}
            </span>
            <span
              className={cn(
                "text-lg font-mono tabular-nums font-bold block",
                getWinRateColor(item.winRate)
              )}
            >
              {safeToFixed(item.winRate, 0)}%
            </span>
            <span className="text-[10px] text-slate-500">
              {item.wins}W / {item.losses}L
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
