/**
 * Waitlist capture — every place a visitor leaves an email lands in
 * beta_waitlist, deduped by lower-cased email (2026-10-07 capture audit).
 *
 *   /api/waitlist/join          sign-up page "Join the waitlist", login-page popup
 *   Google sign-in, no invite   source 'google'      (was: redirect, email dropped)
 *   /api/auth/signup, bad code  source 'signup_code' (was: 403, email dropped)
 *   /api/beta/verify-code fail  source 'join_beta'   (was: 400, email dropped)
 *
 * Attribution (referrer, landing path, utm_*) goes in columns added by
 * migrations/0006_waitlist_attribution.sql. Until that is applied the UPDATE
 * fails with 42703 and is switched off — the signup row itself is never lost.
 *
 * Never throws: a capture failure must not break the flow it rides on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeEmail } from './auth-hardening';

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export type UtmKey = typeof UTM_KEYS[number];

export interface Attribution {
  referrer: string | null;
  landingPath: string | null;
  utm: Partial<Record<UtmKey, string>> | null;
}

const UTM_VALUE_RE = /^[\p{L}\p{N} ._+\-%:/|]{1,100}$/u;
const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * Referrer → origin + path only (query strings can carry tokens), ≤ 512 chars,
 * http(s) only. Landing path → path only, ≤ 256. utm_* → whitelisted keys,
 * short plain values. Anything else is dropped, never an error.
 */
export function parseAttribution(body: unknown): Attribution {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  let referrer: string | null = null;
  if (typeof b.referrer === 'string' && b.referrer.length <= 2048) {
    try {
      const u = new URL(b.referrer);
      if (u.protocol === 'http:' || u.protocol === 'https:') referrer = `${u.origin}${u.pathname}`.slice(0, 512);
    } catch { /* not a URL */ }
  }
  let landingPath: string | null = null;
  if (typeof b.landingPath === 'string' && b.landingPath.startsWith('/') && !b.landingPath.startsWith('//')) {
    landingPath = b.landingPath.split(/[?#]/)[0].slice(0, 256) || null;
  }
  let utm: Partial<Record<UtmKey, string>> | null = null;
  const rawUtm = (b.utm && typeof b.utm === 'object' ? b.utm : {}) as Record<string, unknown>;
  for (const k of UTM_KEYS) {
    const v = rawUtm[k];
    if (typeof v === 'string' && UTM_VALUE_RE.test(v.trim())) {
      (utm ??= {})[k] = v.trim();
    }
  }
  return { referrer, landingPath, utm };
}

export function hasAttribution(a: Attribution | null | undefined): boolean {
  return !!a && !!(a.referrer || a.landingPath || (a.utm && Object.keys(a.utm).length));
}

export interface CaptureInput {
  email: unknown;
  source: string;
  referralCode?: string | null;
  attribution?: Attribution | null;
}

export type CaptureResult =
  | { status: 'created'; id: string; email: string }
  | { status: 'exists'; id: string | null; email: string }
  | { status: 'invalid' }
  | { status: 'error'; error: string; savedToFallback?: boolean };

export interface CaptureDeps {
  getWaitlistEntry(email: string): Promise<{ id: string } | null>;
  createWaitlistEntry(entry: { email: string; source: string; referralCode: string | null }): Promise<{ id: string }>;
  /** Raw parameterised SQL for the attribution columns; resolves rows affected or throws. */
  execAttribution?(id: string, a: Attribution): Promise<void>;
  log?(level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void;
  /** Last resort when the DB write fails: keep the email on local disk (read by research/waitlist-recovery.ts). */
  fallback?(row: { email: string; source: string; at: string; error: string; attribution: Attribution | null }): boolean;
}

export function waitlistFallbackFile(): string {
  return process.env.WAITLIST_FALLBACK_FILE || path.join(process.cwd(), '.cache', 'waitlist-fallback.jsonl');
}

let attributionColumnsMissing = false;
/** Test hook. */
export function _resetAttributionState(): void { attributionColumnsMissing = false; }

export async function captureWaitlistEmail(deps: CaptureDeps, input: CaptureInput): Promise<CaptureResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { status: 'invalid' };
  const source = SOURCE_RE.test(input.source) ? input.source : 'other';
  try {
    const existing = await deps.getWaitlistEntry(email);
    if (existing) return { status: 'exists', id: existing.id, email };
    let created: { id: string };
    try {
      created = await deps.createWaitlistEntry({ email, source, referralCode: input.referralCode ?? null });
    } catch (e) {
      // UNIQUE(email): a concurrent duplicate is a duplicate, not a failure.
      if ((e as { code?: string })?.code === '23505') return { status: 'exists', id: null, email };
      throw e;
    }
    if (deps.execAttribution && hasAttribution(input.attribution) && !attributionColumnsMissing) {
      try {
        await deps.execAttribution(created.id, input.attribution!);
      } catch (e) {
        if ((e as { code?: string })?.code === '42703' || (e as { code?: string })?.code === '42P01') {
          attributionColumnsMissing = true;
          deps.log?.('warn', '[WAITLIST] attribution columns missing — apply migrations/0006_waitlist_attribution.sql');
        } else {
          deps.log?.('warn', '[WAITLIST] attribution write failed', { error: (e as Error)?.message });
        }
      }
    }
    return { status: 'created', id: created.id, email };
  } catch (e) {
    const error = (e as Error)?.message ?? 'unknown';
    const savedToFallback = !!deps.fallback?.({ email, source, at: new Date().toISOString(), error, attribution: input.attribution ?? null });
    deps.log?.('error', '[WAITLIST] capture failed', { source, error, savedToFallback });
    return { status: 'error', error, savedToFallback };
  }
}

/** Production deps: storage + db (lazy imports keep this module DB-free for tests). */
export async function defaultCaptureDeps(): Promise<CaptureDeps> {
  const { storage } = await import('./storage');
  const { db } = await import('./db');
  const { sql } = await import('drizzle-orm');
  const { logger } = await import('./logger');
  return {
    getWaitlistEntry: (email) => storage.getWaitlistEntry(email),
    createWaitlistEntry: (entry) => storage.createWaitlistEntry(entry),
    execAttribution: async (id, a) => {
      await db.execute(sql`UPDATE beta_waitlist
        SET referrer = COALESCE(referrer, ${a.referrer}),
            landing_path = COALESCE(landing_path, ${a.landingPath}),
            utm = COALESCE(utm, ${a.utm ? JSON.stringify(a.utm) : null}::jsonb)
        WHERE id = ${id}`);
    },
    log: (level, msg, meta) => logger[level](msg, meta ?? {}),
    fallback: (row) => {
      try {
        const file = waitlistFallbackFile();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, JSON.stringify(row) + '\n', { mode: 0o600 });
        return true;
      } catch { return false; }
    },
  };
}

/** One-call helper for routes: capture with production deps, swallow everything. */
export async function captureLostSignup(email: unknown, source: string, attribution?: Attribution | null): Promise<CaptureResult> {
  try {
    return await captureWaitlistEmail(await defaultCaptureDeps(), { email, source, attribution });
  } catch (e) {
    return { status: 'error', error: (e as Error)?.message ?? 'unknown' };
  }
}
