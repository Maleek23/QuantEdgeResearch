// Reference: blueprint:javascript_log_in_with_replit
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isPremium: user?.subscriptionTier === 'premium' || user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'admin',
    isAdmin: user?.subscriptionTier === 'admin',
  };
}
