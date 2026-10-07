import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

/**
 * A non-secret "this browser was signed in last time" hint (localStorage `qe-auth-hint`).
 * index.html reads it before first paint: on `/` without it, the boot splash is skipped
 * and the landing paints at once (App.tsx SmartLanding renders it while auth loads).
 * It never grants anything — the server session decides; a stale hint only costs a splash.
 */
export function setAuthHint(on: boolean) {
  try { if (on) localStorage.setItem('qe-auth-hint', '1'); else localStorage.removeItem('qe-auth-hint'); } catch { /* storage off */ }
}
export function hasAuthHint(): boolean {
  try { return localStorage.getItem('qe-auth-hint') === '1'; } catch { return false; }
}

export function useAuth() {
  const { data: user, isLoading, isError } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
          setAuthHint(false);
          return null;
        }
        if (!res.ok) {
          return null; // Silently fail on error
        }
        const u = await res.json();
        setAuthHint(!!u);
        return u;
      } catch (error) {
        console.error("Auth check failed:", error);
        return null; // Default to not authenticated if error
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      setAuthHint(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return {
    user,
    isLoading,
    isError,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
  };
}
