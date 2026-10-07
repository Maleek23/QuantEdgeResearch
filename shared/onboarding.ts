/**
 * Per-user onboarding progress — tours finished, Start-here checklist, tips toggle.
 * Server copy: user_preferences.onboarding (migration 0007) or .cache/shared
 * fallback (server/intake-store.ts); client mirrors it in localStorage.
 */
export const TOUR_IDS = ['today', 'nexus', '0dte', 'gex', 'flow', 'journal'] as const;
export type TourId = typeof TOUR_IDS[number];
export const CHECKLIST_IDS = ['tutorial', 'setup', 'gex', 'discord', 'risk'] as const;
export type ChecklistId = typeof CHECKLIST_IDS[number];

export interface OnboardingProgress {
  /** tour id → ISO time finished or skipped */
  tours: Partial<Record<TourId, string>>;
  checklist: Partial<Record<ChecklistId, string>>;
  /** null = follow the tier default (on for beginner/intermediate, off for pro). */
  showTips: boolean | null;
  checklistHidden: boolean;
  /** "Complete your profile" sheet dismissed without finishing. */
  profileSheetDismissedAt: string | null;
  updatedAt: string | null;
}

export const EMPTY_PROGRESS: OnboardingProgress = {
  tours: {}, checklist: {}, showTips: null, checklistHidden: false, profileSheetDismissedAt: null, updatedAt: null,
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
const isoOrNull = (v: unknown) => (typeof v === 'string' && ISO_RE.test(v) ? v : null);

function pickMap<K extends string>(ids: readonly K[], v: unknown): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (!v || typeof v !== 'object') return out;
  for (const k of ids) {
    const val = (v as Record<string, unknown>)[k];
    const iso = isoOrNull(val);
    if (iso) out[k] = iso;
  }
  return out;
}

/** Normalises anything (stored JSON, a request body) into a progress object. */
export function normalizeProgress(v: unknown): OnboardingProgress {
  const b = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    tours: pickMap(TOUR_IDS, b.tours),
    checklist: pickMap(CHECKLIST_IDS, b.checklist),
    showTips: typeof b.showTips === 'boolean' ? b.showTips : null,
    checklistHidden: b.checklistHidden === true,
    profileSheetDismissedAt: isoOrNull(b.profileSheetDismissedAt),
    updatedAt: isoOrNull(b.updatedAt),
  };
}

/**
 * Merge a patch into progress. Map entries are additive (a finished tour stays
 * finished) unless the patch sets `tours: {}` with `resetTours: true`.
 */
export function mergeProgress(base: OnboardingProgress, patch: unknown, now = new Date().toISOString()): OnboardingProgress {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const n = normalizeProgress(p);
  return {
    tours: p.resetTours === true ? {} : { ...base.tours, ...n.tours },
    checklist: { ...base.checklist, ...n.checklist },
    showTips: 'showTips' in p ? n.showTips : base.showTips,
    checklistHidden: 'checklistHidden' in p ? n.checklistHidden : base.checklistHidden,
    profileSheetDismissedAt: 'profileSheetDismissedAt' in p ? n.profileSheetDismissedAt : base.profileSheetDismissedAt,
    updatedAt: now,
  };
}

/** Newer updatedAt wins — used to reconcile the server copy with the localStorage copy. */
export function newerProgress(a: OnboardingProgress | null, b: OnboardingProgress | null): OnboardingProgress {
  if (!a) return b ?? EMPTY_PROGRESS;
  if (!b) return a;
  return (a.updatedAt ?? '') >= (b.updatedAt ?? '') ? a : b;
}
