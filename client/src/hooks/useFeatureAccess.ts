/**
 * Feature Access Hook
 *
 * 2-Tier Access Control:
 * 1. FREE (visitors + logged-in non-beta) - Basic data free, AI features have 1 free trial each
 * 2. BETA (hasBetaAccess=true) - Full unlimited access
 *
 * Free trial features: AI summary, sentiment, technical snapshot
 * Beta-only features: Full 6-engine analysis, trade ideas, dark pool, options flow, smart money
 */

import { useAuth } from "./useAuth";
import { useState, useEffect, useCallback } from "react";

// Access tier types - only 2 tiers: free users and beta members
export type AccessTier = "free" | "beta";

// Feature access type
export type FeatureAccessType = "free" | "free_trial" | "beta_only";

// Feature configuration
export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  requiresAuth: boolean; // True = only logged-in users can see
  accessType: FeatureAccessType;
  category: "data" | "ai" | "user" | "trading";
}

// Feature definitions
export const FEATURES: Record<string, FeatureConfig> = {
  // === FREE FEATURES (available to everyone) ===
  "market-ticker": {
    id: "market-ticker",
    name: "Market Ticker",
    description: "Real-time market indices and prices",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "stock-quote": {
    id: "stock-quote",
    name: "Stock Quote",
    description: "Current price and basic stock information",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "stock-search": {
    id: "stock-search",
    name: "Stock Search",
    description: "Search for any stock, crypto, or ETF",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "company-overview": {
    id: "company-overview",
    name: "Company Overview",
    description: "Company profile, sector, and basic info",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "news-headlines": {
    id: "news-headlines",
    name: "News Headlines",
    description: "Latest market news and headlines",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "earnings-calendar": {
    id: "earnings-calendar",
    name: "Earnings Calendar",
    description: "Upcoming earnings dates and reports",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "basic-chart": {
    id: "basic-chart",
    name: "Basic Chart",
    description: "Price chart with candlesticks",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "market-movers": {
    id: "market-movers",
    name: "Market Movers",
    description: "Top gainers, losers, and most active",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },
  "sector-heatmap": {
    id: "sector-heatmap",
    name: "Sector Heatmap",
    description: "Visual sector performance overview",
    requiresAuth: false,
    accessType: "free",
    category: "data",
  },

  // === USER FEATURES (require login, free for all logged-in users) ===
  watchlist: {
    id: "watchlist",
    name: "Watchlist",
    description: "Save and track your favorite stocks",
    requiresAuth: true,
    accessType: "free",
    category: "user",
  },
  "price-alerts": {
    id: "price-alerts",
    name: "Price Alerts",
    description: "Get notified when prices hit your targets",
    requiresAuth: true,
    accessType: "free",
    category: "user",
  },
  settings: {
    id: "settings",
    name: "Settings",
    description: "Customize your preferences",
    requiresAuth: true,
    accessType: "free",
    category: "user",
  },

  // === FREE TRIAL FEATURES (1 free use for non-beta) ===
  "ai-summary": {
    id: "ai-summary",
    name: "AI Summary",
    description: "AI-generated stock analysis and insights",
    requiresAuth: false,
    accessType: "free_trial",
    category: "ai",
  },
  "sentiment-analysis": {
    id: "sentiment-analysis",
    name: "Sentiment Analysis",
    description: "AI-powered market sentiment scoring",
    requiresAuth: false,
    accessType: "free_trial",
    category: "ai",
  },
  "technical-snapshot": {
    id: "technical-snapshot",
    name: "Technical Snapshot",
    description: "Key technical indicators and signals",
    requiresAuth: false,
    accessType: "free_trial",
    category: "ai",
  },
  "earnings-prediction": {
    id: "earnings-prediction",
    name: "Earnings Prediction",
    description: "AI predictions for earnings beats/misses",
    requiresAuth: false,
    accessType: "free_trial",
    category: "ai",
  },

  // === BETA-ONLY FEATURES (locked for non-beta) ===
  "ai-chat": {
    id: "ai-chat",
    name: "AI Research Assistant",
    description: "Ask questions about any stock and get AI-powered analysis",
    requiresAuth: true,
    accessType: "beta_only",
    category: "ai",
  },
  "trade-ideas": {
    id: "trade-ideas",
    name: "Trade Ideas",
    description: "AI-generated trade setups with entry, target, and stop",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
  "six-engine-analysis": {
    id: "six-engine-analysis",
    name: "6-Engine Analysis",
    description: "Full convergence analysis from all engines",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
  "options-flow": {
    id: "options-flow",
    name: "Options Flow",
    description: "Unusual options activity and smart money tracking",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
  "dark-pool": {
    id: "dark-pool",
    name: "Dark Pool Data",
    description: "Hidden institutional order flow",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
  "smart-money": {
    id: "smart-money",
    name: "Smart Money Tracking",
    description: "Track institutional and insider activity",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
  "paper-trading": {
    id: "paper-trading",
    name: "Paper Trading",
    description: "Practice trading with virtual money",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
  "advanced-charts": {
    id: "advanced-charts",
    name: "Advanced Charts",
    description: "Charts with technical indicators and drawing tools",
    requiresAuth: true,
    accessType: "beta_only",
    category: "trading",
  },
};

// Local storage keys
const FREE_TRIAL_KEY = "qe_free_trials_used";
const SEARCH_COUNT_KEY = "qe_search_count";
const SEARCH_DATE_KEY = "qe_search_date";

// Limits for free users
export const FREE_LIMITS = {
  searchesPerDay: 5,
  watchlistItems: 5,
  priceAlerts: 3,
};

// Feature check result
export interface FeatureCheckResult {
  canAccess: boolean;
  reason: "ok" | "requires_auth" | "requires_beta" | "trial_used";
  feature: FeatureConfig | null;
  showLocked: boolean;
  showBlurred: boolean;
  lockMessage: string;
  hasFreeTrial: boolean;
  freeTrialUsed: boolean;
}

export function useFeatureAccess() {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Track which free trials have been used (localStorage for persistence)
  const [usedTrials, setUsedTrials] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(FREE_TRIAL_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Track search count for free users (resets daily)
  const [searchCount, setSearchCount] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const today = new Date().toDateString();
      const storedDate = localStorage.getItem(SEARCH_DATE_KEY);
      if (storedDate !== today) {
        // New day, reset count
        localStorage.setItem(SEARCH_DATE_KEY, today);
        localStorage.setItem(SEARCH_COUNT_KEY, "0");
        return 0;
      }
      const count = localStorage.getItem(SEARCH_COUNT_KEY);
      return count ? parseInt(count, 10) : 0;
    } catch {
      return 0;
    }
  });

  // Sync trials to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FREE_TRIAL_KEY, JSON.stringify(Array.from(usedTrials)));
    }
  }, [usedTrials]);

  // Sync search count to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SEARCH_COUNT_KEY, searchCount.toString());
    }
  }, [searchCount]);

  // Determine user's access tier - only 2 tiers
  const getAccessTier = (): AccessTier => {
    // Beta users and admins have full access
    if (
      isAuthenticated &&
      user &&
      (user.hasBetaAccess ||
        user.isAdmin ||
        user.subscriptionTier === "pro" ||
        user.subscriptionTier === "admin")
    ) {
      return "beta";
    }
    // Everyone else (visitors, logged-in non-beta) = free tier
    return "free";
  };

  const accessTier = getAccessTier();
  const isBeta = accessTier === "beta";
  const isFree = accessTier === "free";

  // Mark a free trial as used
  const useFreeTrial = useCallback((featureId: string) => {
    setUsedTrials((prev) => {
      const newSet = new Set(prev);
      newSet.add(featureId);
      return newSet;
    });
  }, []);

  // Check if a free trial has been used
  const hasUsedFreeTrial = useCallback(
    (featureId: string): boolean => {
      return usedTrials.has(featureId);
    },
    [usedTrials]
  );

  // Track a search (for free users)
  const trackSearch = useCallback(() => {
    if (isBeta) return; // Beta users unlimited
    setSearchCount((prev) => prev + 1);
  }, [isBeta]);

  // Check if can search
  const canSearch = useCallback((): boolean => {
    if (isBeta) return true;
    return searchCount < FREE_LIMITS.searchesPerDay;
  }, [isBeta, searchCount]);

  // Get remaining searches
  const remainingSearches = isBeta ? Infinity : Math.max(0, FREE_LIMITS.searchesPerDay - searchCount);

  // Check if user can access a feature
  const checkFeature = useCallback(
    (featureId: string): FeatureCheckResult => {
      const feature = FEATURES[featureId];

      // Unknown feature
      if (!feature) {
        return {
          canAccess: false,
          reason: "requires_beta",
          feature: null,
          showLocked: true,
          showBlurred: true,
          lockMessage: "This feature is not available",
          hasFreeTrial: false,
          freeTrialUsed: false,
        };
      }

      // Beta users always have access
      if (isBeta) {
        return {
          canAccess: true,
          reason: "ok",
          feature,
          showLocked: false,
          showBlurred: false,
          lockMessage: "",
          hasFreeTrial: false,
          freeTrialUsed: false,
        };
      }

      // FREE features - everyone can access
      if (feature.accessType === "free") {
        // But check if it requires auth
        if (feature.requiresAuth && !isAuthenticated) {
          return {
            canAccess: false,
            reason: "requires_auth",
            feature,
            showLocked: true,
            showBlurred: false,
            lockMessage: "Sign up to access this feature",
            hasFreeTrial: false,
            freeTrialUsed: false,
          };
        }
        return {
          canAccess: true,
          reason: "ok",
          feature,
          showLocked: false,
          showBlurred: false,
          lockMessage: "",
          hasFreeTrial: false,
          freeTrialUsed: false,
        };
      }

      // FREE TRIAL features - check if trial used
      if (feature.accessType === "free_trial") {
        const trialUsed = hasUsedFreeTrial(featureId);
        if (!trialUsed) {
          // Free trial available!
          return {
            canAccess: true,
            reason: "ok",
            feature,
            showLocked: false,
            showBlurred: false,
            lockMessage: "",
            hasFreeTrial: true,
            freeTrialUsed: false,
          };
        }
        // Trial used - show blurred preview
        return {
          canAccess: false,
          reason: "trial_used",
          feature,
          showLocked: true,
          showBlurred: true,
          lockMessage: "Free trial used. Apply for beta access to unlock.",
          hasFreeTrial: true,
          freeTrialUsed: true,
        };
      }

      // BETA-ONLY features - locked for non-beta, show blurred
      return {
        canAccess: false,
        reason: "requires_beta",
        feature,
        showLocked: true,
        showBlurred: true,
        lockMessage: "This feature requires beta access",
        hasFreeTrial: false,
        freeTrialUsed: false,
      };
    },
    [isBeta, isAuthenticated, hasUsedFreeTrial]
  );

  // Quick check methods
  const canAccess = useCallback(
    (featureId: string): boolean => {
      return checkFeature(featureId).canAccess;
    },
    [checkFeature]
  );

  const isLocked = useCallback(
    (featureId: string): boolean => {
      return checkFeature(featureId).showLocked;
    },
    [checkFeature]
  );

  const getLockReason = useCallback(
    (featureId: string): string => {
      return checkFeature(featureId).lockMessage;
    },
    [checkFeature]
  );

  const shouldShowBlurred = useCallback(
    (featureId: string): boolean => {
      return checkFeature(featureId).showBlurred;
    },
    [checkFeature]
  );

  return {
    // Tier info
    accessTier,
    isFree,
    isBeta,
    isAuthenticated,
    isLoading,

    // Check methods
    checkFeature,
    canAccess,
    isLocked,
    getLockReason,
    shouldShowBlurred,

    // Free trial methods
    useFreeTrial,
    hasUsedFreeTrial,
    usedTrials: Array.from(usedTrials),

    // Search limit methods (for free users)
    trackSearch,
    canSearch,
    remainingSearches,
    searchCount,

    // Limits config
    limits: FREE_LIMITS,

    // Feature definitions
    features: FEATURES,
  };
}

// Helper hook for a specific feature
export function useRequireFeature(featureId: string) {
  const { checkFeature, isAuthenticated, isBeta, useFreeTrial } =
    useFeatureAccess();
  const result = checkFeature(featureId);

  return {
    ...result,
    isAuthenticated,
    isBeta,
    useFreeTrial: () => useFreeTrial(featureId),
  };
}
