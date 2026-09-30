/**
 * Shared bits for the admin hub pages (Overview, System health): one fetcher
 * that treats the admin cookie like every admin page does, and small formatters.
 */
import { useQuery } from '@tanstack/react-query';

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function useAdminJson<T>(url: string, refetchMs?: number) {
  return useQuery<T>({ queryKey: [url], queryFn: () => getJson<T>(url), refetchInterval: refetchMs, retry: 1 });
}

export function fmtUptime(sec?: number | null): string {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function fmtAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export interface HealthResponse {
  release: string; status: 'ok' | 'degraded'; timestamp: string; uptimeSec: number; memMb: number; version: string; env: string;
  checks: Record<string, { ok: boolean; latencyMs?: number; message?: string; required?: boolean }>;
  dataPartial: boolean; dataPartialProviders: string[];
  dataProviders: { id: string; label: string; role: string; configured: boolean; state: 'not_configured' | 'idle' | 'ok' | 'degraded' | 'down'; lastSuccessAt: string | null; lastFailureAt: string | null; detail: string | null }[];
}

// Green and vermilion mean gain and loss only (DESIGN_SYSTEM §02) — health is accent / caution, with the word printed.
export const STATE_TONE = { ok: 'accent', degraded: 'caution', down: 'caution', idle: 'mute', not_configured: 'mute' } as const;
export const STATE_LABEL = { ok: 'OK', degraded: 'DEGRADED', down: 'DOWN', idle: 'IDLE', not_configured: 'NOT CONFIGURED' } as const;
