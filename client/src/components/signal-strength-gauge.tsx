import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

export function SignalStrengthGauge() {
  const { data: perfStats, isLoading } = useQuery<any>({
    queryKey: ['/api/performance/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds for "live" feel
  });

  // Calculate current market opportunity score (0-100)
  // Based on: win rate, open ideas, and recent performance
  const calculateSignalStrength = (): number => {
    if (!perfStats) return 0;
    
    const winRate = perfStats.overall.winRate || 0;
    const openIdeas = perfStats.overall.openIdeas || 0;
    const totalIdeas = perfStats.overall.totalIdeas || 1;
    
    // Weighted score: 60% win rate + 30% activity level + 10% historical performance
    const winRateScore = winRate * 0.6;
    const activityScore = Math.min(openIdeas / 10, 1) * 30; // Max at 10 open ideas
    const historyScore = Math.min(totalIdeas / 100, 1) * 10; // Max at 100 total ideas
    
    return Math.round(winRateScore + activityScore + historyScore);
  };

  const score = calculateSignalStrength();
  
  // Determine color zone
  const getZoneColor = (score: number) => {
    if (score >= 70) return {
      from: 'from-green-500',
      to: 'to-emerald-600',
      text: 'text-green-500',
      label: 'High Probability',
      bg: 'bg-green-500/10'
    };
    if (score >= 40) return {
      from: 'from-yellow-500',
      to: 'to-amber-600',
      text: 'text-yellow-500',
      label: 'Moderate',
      bg: 'bg-yellow-500/10'
    };
    return {
      from: 'from-red-500',
      to: 'to-rose-600',
      text: 'text-red-500',
      label: 'Caution',
      bg: 'bg-red-500/10'
    };
  };

  const zone = getZoneColor(score);
  const circumference = 2 * Math.PI * 45; // radius = 45
  const dashoffset = circumference - (score / 100) * circumference;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center" data-testid="signal-strength-gauge">
      {/* Circular Gauge */}
      <div className="relative w-32 h-32">
        <svg className="transform -rotate-90 w-32 h-32">
          {/* Background circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-muted opacity-20"
          />
          
          {/* Progress circle */}
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            className={`${zone.text} transition-all duration-1000 ease-out`}
            strokeLinecap="round"
          />
        </svg>
        
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${zone.text}`} data-testid="gauge-score">
            {score}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>

      {/* Status label */}
      <div className={`mt-3 px-3 py-1 rounded-full ${zone.bg} flex items-center gap-1.5`}>
        <Activity className={`h-3 w-3 ${zone.text}`} />
        <span className={`text-xs font-medium ${zone.text}`} data-testid="gauge-label">
          {zone.label}
        </span>
      </div>

      {/* Live indicator */}
      <div className="mt-2 flex items-center gap-1.5">
        <div className={`h-2 w-2 rounded-full ${zone.bg} ${zone.text} animate-pulse`} />
        <span className="text-xs text-muted-foreground">Live Signal</span>
      </div>
    </div>
  );
}
