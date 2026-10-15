/** Client side of shared/feature-flags.ts: build env (VITE_FLAG_*) + per-device localStorage override. */
import { flagOn, type FeatureFlag } from '@shared/feature-flags';

export function clientFlag(name: FeatureFlag): boolean {
  let storage: Storage | null = null;
  try { storage = typeof window !== 'undefined' ? window.localStorage : null; } catch { storage = null; }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return flagOn(name, { env, storage });
}
