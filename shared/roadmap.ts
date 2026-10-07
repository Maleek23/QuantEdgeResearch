/**
 * Update planner / roadmap — admin /admin/roadmap edits it, public /updates
 * shows Shipped + In progress items (the user-facing changelog), the rail's
 * "What's new" badge counts shipped items newer than the viewer last saw.
 *
 * Storage: server/roadmap-store.ts (.cache/shared/roadmap.json — no migration).
 * SEED: real items only, taken from `git log` 2026-09-23 → 2026-10-07.
 */

export const ROADMAP_AREAS = ['NEXUS', '0DTE', 'GEX', 'FLOW', 'Bot', 'Journal', 'Discord', 'Onboarding', 'Infra'] as const;
export const ROADMAP_STATUSES = ['idea', 'planned', 'in_progress', 'shipped'] as const;
export const ROADMAP_AUDIENCES = ['beginner', 'all', 'pro'] as const;
export const ROADMAP_PRIORITIES = ['low', 'medium', 'high'] as const;

export type RoadmapArea = typeof ROADMAP_AREAS[number];
export type RoadmapStatus = typeof ROADMAP_STATUSES[number];
export type RoadmapAudience = typeof ROADMAP_AUDIENCES[number];
export type RoadmapPriority = typeof ROADMAP_PRIORITIES[number];

export const STATUS_LABEL: Record<RoadmapStatus, string> = { idea: 'Idea', planned: 'Planned', in_progress: 'In progress', shipped: 'Shipped' };

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  area: RoadmapArea;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  /** YYYY-MM-DD — target date, or ship date once shipped. */
  targetDate: string | null;
  audience: RoadmapAudience;
  announce: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RoadmapInput = Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');

/** Full validation (create) or partial (update: only present keys are checked). */
export function validateRoadmapInput(body: unknown, partial = false):
  { ok: true; value: Partial<RoadmapInput> } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const out: Partial<RoadmapInput> = {};
  const has = (k: string) => !partial || k in b;
  if (has('title')) { const t = clean(b.title, 120); if (!t) return { ok: false, error: 'Title is required.' }; out.title = t; }
  if (has('description')) out.description = clean(b.description, 600);
  if (has('area')) { if (!ROADMAP_AREAS.includes(b.area as RoadmapArea)) return { ok: false, error: 'Unknown area.' }; out.area = b.area as RoadmapArea; }
  if (has('status')) { if (!ROADMAP_STATUSES.includes(b.status as RoadmapStatus)) return { ok: false, error: 'Unknown status.' }; out.status = b.status as RoadmapStatus; }
  if (has('priority')) { const p = (b.priority ?? 'medium') as RoadmapPriority; if (!ROADMAP_PRIORITIES.includes(p)) return { ok: false, error: 'Unknown priority.' }; out.priority = p; }
  if (has('audience')) { const a = (b.audience ?? 'all') as RoadmapAudience; if (!ROADMAP_AUDIENCES.includes(a)) return { ok: false, error: 'Unknown audience.' }; out.audience = a; }
  if (has('targetDate')) {
    const d = b.targetDate;
    if (d == null || d === '') out.targetDate = null;
    else if (typeof d === 'string' && DATE_RE.test(d) && Number.isFinite(Date.parse(d))) out.targetDate = d;
    else return { ok: false, error: 'Target date must be YYYY-MM-DD.' };
  }
  if (has('announce')) out.announce = b.announce === true;
  return { ok: true, value: out };
}

/** What /updates shows: shipped + in progress, newest first (in progress on top). */
export function publicRoadmap(items: RoadmapItem[]): RoadmapItem[] {
  const rank = (s: RoadmapStatus) => (s === 'in_progress' ? 0 : 1);
  return items
    .filter((i) => i.status === 'shipped' || i.status === 'in_progress')
    .sort((a, b) => rank(a.status) - rank(b.status) || (b.targetDate ?? '').localeCompare(a.targetDate ?? '') || b.updatedAt.localeCompare(a.updatedAt));
}

/** Shipped items dated after `seenDate` (YYYY-MM-DD) — the rail badge. No seen date → 0 (first visit is baselined). */
export function unseenShipped(items: Pick<RoadmapItem, 'status' | 'targetDate'>[], seenDate: string | null): number {
  if (!seenDate) return 0;
  return items.filter((i) => i.status === 'shipped' && (i.targetDate ?? '') > seenDate).length;
}

export function latestShippedDate(items: Pick<RoadmapItem, 'status' | 'targetDate'>[]): string | null {
  return items.filter((i) => i.status === 'shipped' && i.targetDate).map((i) => i.targetDate!).sort().pop() ?? null;
}

type Seed = Omit<RoadmapItem, 'createdAt' | 'updatedAt' | 'priority' | 'audience' | 'announce'> & Partial<Pick<RoadmapItem, 'priority' | 'audience' | 'announce'>>;
/** Every row traces to a commit subject in `git log` (2026-09-23 → 2026-10-07). */
const SEED: Seed[] = [
  { id: 'seed-budget-contract', area: 'NEXUS', status: 'shipped', targetDate: '2026-10-07', title: 'Budget contract beside the primary',
    description: 'Every NEXUS idea now shows a cheaper “budget” contract next to the primary one. Cheap weeklies qualify down to a 0.08 delta.' },
  { id: 'seed-whole-contracts', area: 'NEXUS', status: 'shipped', targetDate: '2026-10-07', title: 'Whole-contract sizing',
    description: 'Position sizes are always whole contracts — never fractional contracts you could not actually buy.' },
  { id: 'seed-risk-sizing', area: 'Journal', status: 'shipped', targetDate: '2026-10-07', title: 'Equal-risk sizing: risk $500 per idea',
    description: 'NEXUS ideas default to equal-risk sizing — risk $500 per trade ($1,000 or a custom amount up to $1,000).' },
  { id: 'seed-0dte-peaks', area: '0DTE', status: 'shipped', targetDate: '2026-10-07', title: '0DTE option peaks recorded',
    description: 'Each 0DTE idea now records how far the option ran (its peak) so exits can be measured against what was available.' },
  { id: 'seed-0dte-runners', area: '0DTE', status: 'in_progress', targetDate: null, title: '0DTE runner exits',
    description: 'A runner exit policy (hold part past T1) is built and replayed against all-out-at-T1. It ships switched off until the replay earns it.' },
  { id: 'seed-call-accuracy', area: 'NEXUS', status: 'in_progress', targetDate: null, title: 'Call accuracy and managed replay',
    description: 'Recorded vs managed view of every call, so the record shows what a disciplined exit would have returned.' },
  { id: 'seed-discord-lifecycle', area: 'Discord', status: 'shipped', targetDate: '2026-10-07', title: 'Discord lifecycle cards',
    description: 'Ideas post to the QuantEdge Labs Discord when published, then the same card updates on trigger and exit, with a 16:20 recap.' },
  { id: 'seed-trader-self-setup', area: 'Onboarding', status: 'shipped', targetDate: '2026-10-07', title: 'Trader self-setup',
    description: 'Desk traders set up their own login from the sign-in page: name, book passcode, then their own password.' },
  { id: 'seed-admin-session', area: 'Infra', status: 'shipped', targetDate: '2026-10-07', title: 'Waitlist invites emailed on approve',
    description: 'Every waitlist path now keeps your email, and approving a spot emails the invite directly.', audience: 'all' },
  { id: 'seed-sector-rotation-ideas', area: 'NEXUS', status: 'shipped', targetDate: '2026-10-01', title: 'Sector rotation → trade ideas',
    description: 'The sector rotation board turns rotation into stated trade plans you can send to NEXUS, with its own record.' },
  { id: 'seed-spx-mirror', area: '0DTE', status: 'shipped', targetDate: '2026-10-01', title: 'SPX mirror for SPY 0DTE ideas',
    description: 'SPY 0DTE and 1DTE ideas show the matching SPX levels on the board and the 0DTE desk.' },
];

export function seedRoadmap(now = new Date().toISOString()): RoadmapItem[] {
  return SEED.map((s) => ({ priority: 'medium', audience: 'all', announce: s.status === 'shipped', ...s, createdAt: now, updatedAt: now }));
}
