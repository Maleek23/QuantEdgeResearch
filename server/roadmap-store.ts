/**
 * Roadmap / update planner store — one JSON file in .cache/shared (no migration).
 * First read with no file seeds it from shared/roadmap.ts SEED (real git-log items).
 * Never throws; a failed write returns null so the route can 500.
 */
import crypto from 'node:crypto';
import { seedRoadmap, validateRoadmapInput, type RoadmapInput, type RoadmapItem } from '@shared/roadmap';
import type { KvStore } from './intake-store';

export const ROADMAP_FILE = 'roadmap';

export function listRoadmap(kv: KvStore): RoadmapItem[] {
  const stored = kv.read<RoadmapItem[]>(ROADMAP_FILE);
  if (Array.isArray(stored)) return stored;
  const seeded = seedRoadmap();
  kv.write(ROADMAP_FILE, seeded);
  return seeded;
}

export function createRoadmapItem(kv: KvStore, body: unknown): { ok: true; item: RoadmapItem } | { ok: false; error: string } {
  const v = validateRoadmapInput(body, false);
  if (!v.ok) return v;
  const now = new Date().toISOString();
  const item: RoadmapItem = {
    ...(v.value as RoadmapInput),
    id: `rm-${crypto.randomUUID().slice(0, 8)}`, createdAt: now, updatedAt: now,
  };
  const items = [item, ...listRoadmap(kv)];
  return kv.write(ROADMAP_FILE, items) ? { ok: true, item } : { ok: false, error: 'Could not save the roadmap.' };
}

export function updateRoadmapItem(kv: KvStore, id: string, body: unknown): { ok: true; item: RoadmapItem } | { ok: false; error: string; notFound?: boolean } {
  const v = validateRoadmapInput(body, true);
  if (!v.ok) return v;
  const items = listRoadmap(kv);
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: 'No such item.', notFound: true };
  const item = { ...items[i], ...v.value, updatedAt: new Date().toISOString() };
  // Shipping without a date stamps today — /updates is dated.
  if (item.status === 'shipped' && !item.targetDate) item.targetDate = item.updatedAt.slice(0, 10);
  items[i] = item;
  return kv.write(ROADMAP_FILE, items) ? { ok: true, item } : { ok: false, error: 'Could not save the roadmap.' };
}

export function deleteRoadmapItem(kv: KvStore, id: string): boolean {
  const items = listRoadmap(kv);
  const next = items.filter((x) => x.id !== id);
  return next.length !== items.length && kv.write(ROADMAP_FILE, next);
}
