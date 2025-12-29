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

export function getConfidenceBand(confidenceScore: number): string {
  if (confidenceScore >= 80) return 'A';
  if (confidenceScore >= 70) return 'B+';
  if (confidenceScore >= 60) return 'B';
  if (confidenceScore >= 50) return 'C+';
  if (confidenceScore >= 40) return 'C';
  return 'D';
}
