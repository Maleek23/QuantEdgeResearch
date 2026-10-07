/**
 * Public updates feed (/api/updates — shipped + in-progress roadmap items) and
 * the "What's new" badge: shipped items dated after the last time this device
 * opened /updates. First visit baselines silently (no "11 new" on day one).
 * localStorage['qe-updates-seen'] = YYYY-MM-DD, every access in try/catch.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { latestShippedDate, unseenShipped, type RoadmapItem } from '@shared/roadmap';

export type PublicUpdate = Pick<RoadmapItem, 'id' | 'title' | 'description' | 'area' | 'status' | 'targetDate' | 'audience'>;
export const UPDATES_KEY = ['/api/updates'] as const;
const SEEN_KEY = 'qe-updates-seen';

const listeners = new Set<() => void>();
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
let seen: string | null = readSeen();
function setSeen(v: string) {
  seen = v;
  try { localStorage.setItem(SEEN_KEY, v); } catch { /* blocked */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function useUpdates() {
  return useQuery<{ items: PublicUpdate[] }>({
    queryKey: UPDATES_KEY,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await fetch('/api/updates');
      if (!r.ok) throw new Error(`Updates didn’t load (${r.status})`);
      return r.json();
    },
  });
}

/** Unseen shipped count for the rail / menu badge. */
export function useUpdatesBadge(): number {
  const q = useUpdates();
  const s = useSyncExternalStore(subscribe, () => seen, () => seen);
  const items = q.data?.items ?? [];
  useEffect(() => {
    if (s == null && items.length) { const d = latestShippedDate(items); if (d) setSeen(d); }
  }, [s, items]);
  return unseenShipped(items, s);
}

/** Call on /updates: everything shipped so far counts as seen. */
export function useMarkUpdatesSeen(items: PublicUpdate[] | undefined) {
  useEffect(() => {
    const d = items ? latestShippedDate(items) : null;
    if (d && d !== seen) setSeen(d);
  }, [items]);
}
