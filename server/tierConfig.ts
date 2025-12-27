import { SubscriptionTier } from "@shared/schema";

export interface TierLimits {
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

export const TIER_CONFIG: Record<SubscriptionTier, TierLimits> = {
  free: {
    ideasPerDay: 5,
    aiChatMessagesPerDay: 3,
    chartAnalysisPerDay: 0,
    watchlistItems: 3,
    canAccessPerformance: false,
    canAccessAdvancedAnalytics: false,
    canAccessRealTimeAlerts: false,
    canExportData: false,
    prioritySupport: false,
  },
  advanced: {
    ideasPerDay: Infinity,
    aiChatMessagesPerDay: 25,
    chartAnalysisPerDay: 10,
    watchlistItems: 50,
    canAccessPerformance: true,
    canAccessAdvancedAnalytics: true,
    canAccessRealTimeAlerts: true,
    canExportData: true,
    prioritySupport: false,
  },
  pro: {
    ideasPerDay: Infinity,
    aiChatMessagesPerDay: Infinity,
    chartAnalysisPerDay: Infinity,
    watchlistItems: Infinity,
    canAccessPerformance: true,
    canAccessAdvancedAnalytics: true,
    canAccessRealTimeAlerts: true,
    canExportData: true,
    prioritySupport: true,
  },
  admin: {
    ideasPerDay: Infinity,
    aiChatMessagesPerDay: Infinity,
    chartAnalysisPerDay: Infinity,
    watchlistItems: Infinity,
    canAccessPerformance: true,
    canAccessAdvancedAnalytics: true,
    canAccessRealTimeAlerts: true,
    canExportData: true,
    prioritySupport: true,
  },
};

export const PRICING = {
  free: { monthly: 0, yearly: 0 },
  advanced: { monthly: 39, yearly: 349 },
  pro: { monthly: 79, yearly: 699 },
} as const;

export function getTierLimits(tier: SubscriptionTier): TierLimits {
  return TIER_CONFIG[tier] || TIER_CONFIG.free;
}

export function canAccessFeature(tier: SubscriptionTier, feature: keyof TierLimits): boolean {
  const limits = getTierLimits(tier);
  const value = limits[feature];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  return false;
}
