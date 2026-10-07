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

/** CSRF-protected write for the admin hub; throws an Error carrying the server's own message. */
export async function adminWrite<T = unknown>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<T> {
  const m = document.cookie.match(/csrf_token=([^;]+)/);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (m) headers['x-csrf-token'] = m[1];
  const r = await fetch(url, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
  return data as T;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export type AdminTier = 'free' | 'advanced' | 'pro' | 'admin';

export interface AdminUserRow {
  id: string; email: string; name: string | null; tier: AdminTier; hasBetaAccess: boolean; disabled: boolean; isAdmin: boolean;
  createdAt: string | null; lastLoginAt: string | null; authMethod: 'password' | 'google' | 'other';
}

export interface AdminInviteRow {
  id: string; code: string; link: string; email: string | null; status: 'unused' | 'used' | 'expired' | 'revoked'; rawStatus: string | null;
  tierOverride: string | null; note: string | null; createdAt: string | null; expiresAt: string | null; sentAt: string | null; redeemedAt: string | null;
  redeemedBy: { id: string; email: string } | null;
}

export interface AdminAuditRow { at: string; action: string; actor: string; target: string | null; detail: Record<string, unknown>; ip: string | null }

export const AUDIT_LABEL: Record<string, string> = {
  'invite.generate': 'Generated invite codes', 'invite.revoke': 'Revoked invite', 'invite.create': 'Created invite (email)', 'invite.send': 'Sent invite email',
  'waitlist.approve': 'Approved waitlist', 'waitlist.reject': 'Rejected waitlist', 'waitlist.invite': 'Invited from waitlist',
  'user.tier': 'Changed tier', 'user.beta': 'Changed beta access', 'user.disable': 'Disabled account', 'user.enable': 'Enabled account',
  'user.delete': 'Deleted account', 'user.password_reset': 'Sent password reset', 'trader.passcode_set': 'Set book passcode', 'trader.passcode_clear': 'Cleared book passcode',
  'desk.assign': 'Made desk admin', 'desk.unassign': 'Removed desk admin', 'desk.bot_config': 'Changed desk bot settings',
  'desk.bot_enable': 'Turned desk bot on', 'desk.bot_disable': 'Turned desk bot off', 'desk.bot_run': 'Ran a desk bot cycle',
  'desk.passcode_set': 'Desk set book passcode', 'desk.passcode_clear': 'Desk cleared book passcode', 'desk.privacy': 'Desk changed book sharing',
};
