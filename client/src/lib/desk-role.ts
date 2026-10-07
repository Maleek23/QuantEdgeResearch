/**
 * useDeskRole() — who the signed-in user is, for the nav and the palette
 * (docs/DESK_ADMINS.md). Reads GET /api/desk/me, which answers for everyone
 * (signed out = role 'none') and keeps working with DESK_ADMINS off (then only
 * isSuperAdmin can be true and deskSlug is null).
 *
 *   isSuperAdmin  the platform admin (ADMIN_EMAIL / admin tier) → show "Admin" (/admin)
 *   deskSlug      the one trader book this user runs → show "My desk" (/desk)
 *
 * This is a display hint only: every /api/admin/* and /api/desk/* route checks
 * the role on the server.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

export interface DeskMe {
  enabled: boolean;
  role: 'super' | 'desk' | 'none';
  isSuperAdmin: boolean;
  deskSlug: string | null;
  deskName?: string;
  desks?: { slug: string; name: string }[];
}

export const DESK_ME_KEY = ['/api/desk/me'] as const;

export function useDeskRole(): { isSuperAdmin: boolean; deskSlug: string | null; deskName: string | null; enabled: boolean; desks: { slug: string; name: string }[]; isLoading: boolean } {
  const { user } = useAuth();
  const q = useQuery<DeskMe | null>({
    queryKey: [...DESK_ME_KEY, (user as { id?: string } | null | undefined)?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch('/api/desk/me', { credentials: 'include' });
      if (!r.ok) return null;
      return (await r.json()) as DeskMe;
    },
  });
  const d = user ? q.data : null;
  return {
    isSuperAdmin: !!d?.isSuperAdmin,
    deskSlug: d?.deskSlug ?? null,
    deskName: d?.deskName ?? null,
    enabled: !!d?.enabled,
    desks: d?.desks ?? [],
    isLoading: !!user && q.isLoading,
  };
}
