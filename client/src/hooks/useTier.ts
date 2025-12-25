import { useQuery } from "@tanstack/react-query";

interface BackendTierLimits {
  ideasPerDay: number;
  aiChatMessagesPerDay: number;
  chartAnalysisPerDay: number;
  watchlistItems: number;
  canAccessPerformance: boolean;
  canAccessAdvancedAnalytics: boolean;
  canAccessRealTimeAlerts: boolean;
  canExportData: boolean;
  prioritySupport: boolean;
}

interface BackendTierInfo {
  tier: 'free' | 'advanced' | 'pro';
  limits: BackendTierLimits;
  usage: {
    tradeIdeas: number;
    chartAnalysis: number;
  };
  isAdmin?: boolean;
}

export interface TierLimits {
  tradeIdeasPerDay: number;
  chartAnalysisPerDay: number;
  canAccessAIEngine: boolean;
  canAccessQuantEngine: boolean;
  canAccessFlowScanner: boolean;
  canAccessPerformance: boolean;
  canAccessAdvancedAnalytics: boolean;
  canExportData: boolean;
}

export interface TierInfo {
  tier: 'free' | 'advanced' | 'pro';
  limits: TierLimits;
  usage: {
    tradeIdeas: number;
    chartAnalysis: number;
  };
  isAdmin?: boolean;
}

function transformLimits(backendLimits: BackendTierLimits, tier: string): TierLimits {
  return {
    tradeIdeasPerDay: backendLimits.ideasPerDay,
    chartAnalysisPerDay: backendLimits.chartAnalysisPerDay,
    canAccessAIEngine: tier === 'advanced' || tier === 'pro',
    canAccessQuantEngine: true,
    canAccessFlowScanner: tier === 'pro',
    canAccessPerformance: backendLimits.canAccessPerformance,
    canAccessAdvancedAnalytics: backendLimits.canAccessAdvancedAnalytics,
    canExportData: backendLimits.canExportData,
  };
}

export function useTier() {
  const { data, isLoading, error } = useQuery<BackendTierInfo>({
    queryKey: ['/api/user/tier'],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const defaultTier: TierInfo = {
    tier: 'free',
    limits: {
      tradeIdeasPerDay: 3,
      chartAnalysisPerDay: 1,
      canAccessAIEngine: false,
      canAccessQuantEngine: true,
      canAccessFlowScanner: false,
      canAccessPerformance: false,
      canAccessAdvancedAnalytics: false,
      canExportData: false,
    },
    usage: { tradeIdeas: 0, chartAnalysis: 0 },
  };

  const tierInfo: TierInfo = data ? {
    tier: data.tier,
    limits: transformLimits(data.limits, data.tier),
    usage: data.usage,
    isAdmin: data.isAdmin,
  } : defaultTier;

  const canGenerateTradeIdea = (): boolean => {
    if (tierInfo.isAdmin) return true;
    if (tierInfo.limits.tradeIdeasPerDay === -1) return true;
    return tierInfo.usage.tradeIdeas < tierInfo.limits.tradeIdeasPerDay;
  };

  const canUseChartAnalysis = (): boolean => {
    if (tierInfo.isAdmin) return true;
    if (tierInfo.limits.chartAnalysisPerDay === -1) return true;
    return tierInfo.usage.chartAnalysis < tierInfo.limits.chartAnalysisPerDay;
  };

  const getRemainingIdeas = (): number | 'unlimited' => {
    if (tierInfo.isAdmin) return 'unlimited';
    if (tierInfo.limits.tradeIdeasPerDay === -1) return 'unlimited';
    return Math.max(0, tierInfo.limits.tradeIdeasPerDay - tierInfo.usage.tradeIdeas);
  };

  const getRemainingChartAnalysis = (): number | 'unlimited' => {
    if (tierInfo.isAdmin) return 'unlimited';
    if (tierInfo.limits.chartAnalysisPerDay === -1) return 'unlimited';
    return Math.max(0, tierInfo.limits.chartAnalysisPerDay - tierInfo.usage.chartAnalysis);
  };

  return {
    ...tierInfo,
    isLoading,
    error,
    canGenerateTradeIdea,
    canUseChartAnalysis,
    getRemainingIdeas,
    getRemainingChartAnalysis,
    isPro: tierInfo.tier === 'pro' || tierInfo.isAdmin,
    isAdvanced: tierInfo.tier === 'advanced' || tierInfo.tier === 'pro' || tierInfo.isAdmin,
  };
}
