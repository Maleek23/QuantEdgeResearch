import { useQuery } from "@tanstack/react-query";

interface DataIntelligence {
  summary: {
    totalIdeas: number;
    resolvedTrades: number;
    totalWins: number;
    totalLosses: number;
    overallWinRate: number;
  };
  enginePerformance: Array<{
    engine: string;
    wins: number;
    losses: number;
    total: number;
    winRate: number;
  }>;
  symbolPerformance: Array<{
    symbol: string;
    wins: number;
    losses: number;
    total: number;
    winRate: number;
  }>;
  confidenceCalibration: Array<{
    band: string;
    wins: number;
    losses: number;
    total: number;
    winRate: number;
  }>;
  lookup: {
    engine: Record<string, number>;
    symbol: Record<string, { winRate: number; trades: number }>;
    band: Record<string, number>;
  };
}

export function useDataIntelligence() {
  return useQuery<DataIntelligence>({
    queryKey: ['/api/data-intelligence'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  });
}

// CALIBRATED THRESHOLDS based on historical 411 trade outcomes
// Matches server/routes.ts getProbabilityBand function
// A+ tier: 95+, A: 90+, B+: 85+, B: 78+, C+: 72+, C: 65+, D: 55+, F: <55
export function getConfidenceBand(confidenceScore: number): string {
  if (confidenceScore >= 95) return 'A+';
  if (confidenceScore >= 90) return 'A';
  if (confidenceScore >= 85) return 'B+';
  if (confidenceScore >= 78) return 'B';
  if (confidenceScore >= 72) return 'C+';
  if (confidenceScore >= 65) return 'C';
  if (confidenceScore >= 55) return 'D';
  return 'F';
}

// Simplified band lookup (collapses A+/A- into A, etc.) for historical comparison
export function getSimplifiedBand(confidenceScore: number): string {
  if (confidenceScore >= 90) return 'A';
  if (confidenceScore >= 85) return 'B+';
  if (confidenceScore >= 78) return 'B';
  if (confidenceScore >= 72) return 'C+';
  if (confidenceScore >= 65) return 'C';
  return 'D';
}
