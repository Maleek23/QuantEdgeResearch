/**
 * Client side of onboarding: the signed-in user's intake profile, their
 * progress (tours / Start-here checklist / Show tips) and the tier that drives
 * how hands-on the product is (shared/intake.ts experienceTier).
 *
 * Server: GET /api/onboarding/me, PATCH /api/onboarding/progress (server/onboarding-routes.ts).
 * localStorage mirror per user (every access in try/catch) so a failed request
 * or a missing migration never re-runs a tour the user already finished.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { experienceTier, type IntakeProfile, type OnboardingTier } from '@shared/intake';
import { EMPTY_PROGRESS, mergeProgress, newerProgress, normalizeProgress, type OnboardingProgress, type TourId } from '@shared/onboarding';

export const ONBOARDING_KEY = ['/api/onboarding/me'] as const;
export const DISCORD_INVITE = 'https://discord.gg/uBNgRqqgmS';

interface MeResponse { profile: IntakeProfile | null; progress: OnboardingProgress }

const lsKey = (uid: string) => `qe-onboarding:${uid}`;
function readLocal(uid: string): { progress: OnboardingProgress | null; profile: IntakeProfile | null } {
  try {
    const raw = localStorage.getItem(lsKey(uid));
    if (!raw) return { progress: null, profile: null };
    const j = JSON.parse(raw);
    return { progress: j?.progress ? normalizeProgress(j.progress) : null, profile: j?.profile ?? null };
  } catch { return { progress: null, profile: null }; }
}
function writeLocal(uid: string, v: { progress: OnboardingProgress; profile: IntakeProfile | null }) {
  try { localStorage.setItem(lsKey(uid), JSON.stringify(v)); } catch { /* storage blocked */ }
}

export interface OnboardingState {
  signedIn: boolean;
  loading: boolean;
  userId: string | null;
  profile: IntakeProfile | null;
  progress: OnboardingProgress;
  tier: OnboardingTier | null;
  /** Explainer chips / Start-here card on. Settings › Tips & tours overrides the tier default. */
  tipsOn: boolean;
  patch(p: Partial<OnboardingProgress> & { resetTours?: boolean }): void;
  finishTour(id: TourId): void;
  setProfile(p: IntakeProfile): void;
}

export function useOnboarding(): OnboardingState {
  const { user, isLoading: authLoading } = useAuth() as { user: { id?: string | number } | null | undefined; isLoading: boolean };
  const uid = user?.id != null ? String(user.id) : null;
  const qc = useQueryClient();

  const q = useQuery<MeResponse>({
    queryKey: [...ONBOARDING_KEY, uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const local = readLocal(uid!);
      try {
        const res = await fetch('/api/onboarding/me', { credentials: 'include' });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as MeResponse;
        const progress = newerProgress(normalizeProgress(j.progress), local.progress);
        const profile = j.profile ?? local.profile;
        writeLocal(uid!, { progress, profile });
        return { profile, progress };
      } catch {
        return { profile: local.profile, progress: local.progress ?? EMPTY_PROGRESS };
      }
    },
  });

  const profile = q.data?.profile ?? null;
  const progress = q.data?.progress ?? EMPTY_PROGRESS;
  const tier = experienceTier(profile?.experience);
  const tipsOn = progress.showTips ?? (tier !== 'pro');

  const patch = useCallback((p: Partial<OnboardingProgress> & { resetTours?: boolean }) => {
    if (!uid) return;
    const key = [...ONBOARDING_KEY, uid];
    const cur = qc.getQueryData<MeResponse>(key) ?? { profile: null, progress: EMPTY_PROGRESS };
    const next = mergeProgress(cur.progress, p);
    qc.setQueryData<MeResponse>(key, { ...cur, progress: next });
    writeLocal(uid, { progress: next, profile: cur.profile });
    void fetch('/api/onboarding/progress', {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
    }).catch(() => { /* localStorage keeps it */ });
  }, [uid, qc]);

  const finishTour = useCallback((id: TourId) => patch({ tours: { [id]: new Date().toISOString() } }), [patch]);

  const setProfile = useCallback((p: IntakeProfile) => {
    if (!uid) return;
    const key = [...ONBOARDING_KEY, uid];
    const cur = qc.getQueryData<MeResponse>(key) ?? { profile: null, progress: EMPTY_PROGRESS };
    qc.setQueryData<MeResponse>(key, { ...cur, profile: p });
    writeLocal(uid, { progress: cur.progress, profile: p });
  }, [uid, qc]);

  return useMemo(() => ({
    signedIn: !!uid, loading: authLoading || (!!uid && q.isLoading), userId: uid,
    profile, progress, tier, tipsOn, patch, finishTour, setProfile,
  }), [uid, authLoading, q.isLoading, profile, progress, tier, tipsOn, patch, finishTour, setProfile]);
}

/** Help menu → re-launch a tour on the current page. */
export const START_TOUR_EVENT = 'qe:start-tour';
export function startTour(id?: TourId) {
  window.dispatchEvent(new CustomEvent(START_TOUR_EVENT, { detail: { id } }));
}
export const OPEN_PROFILE_EVENT = 'qe:open-profile-sheet';
export function openProfileSheet() { window.dispatchEvent(new Event(OPEN_PROFILE_EVENT)); }

/**
 * Tutorial videos: /videos/tutorials/manifest.json → { "<page>": { src, title, poster? } }.
 * No manifest (or the SPA's HTML fallback) → no video slots render. Never a placeholder.
 */
export interface TutorialVideo { src: string; title: string; poster?: string }
export function useTutorialVideos() {
  return useQuery<Record<string, TutorialVideo>>({
    queryKey: ['/videos/tutorials/manifest.json'],
    staleTime: 60 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await fetch('/videos/tutorials/manifest.json');
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return {};
        const j = await res.json();
        const out: Record<string, TutorialVideo> = {};
        for (const [k, v] of Object.entries(j ?? {})) {
          const src = (v as TutorialVideo)?.src;
          if (typeof src === 'string' && src.startsWith('/videos/tutorials/')) out[k] = { src, title: String((v as TutorialVideo).title ?? k), poster: (v as TutorialVideo).poster };
        }
        return out;
      } catch { return {}; }
    },
  });
}
