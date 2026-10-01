/**
 * Auth/sign-up hardening helpers (homepage audit 2026-09-30,
 * docs/HOME_AUDIT_2026-09-30.md §Server findings). Kept free of DB imports so
 * scripts/test-auth-hardening.ts can exercise them directly.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constant-time secret comparison
// ---------------------------------------------------------------------------

/**
 * Compare a caller-supplied value with a configured secret in constant time.
 * Both sides are SHA-256 hashed first, so timingSafeEqual always gets two
 * 32-byte buffers: no throw on a length mismatch and no length leak.
 * Returns false when either side is missing or not a string.
 */
export function safeSecretEqual(supplied: unknown, configured: string | undefined | null): boolean {
  if (typeof supplied !== 'string' || typeof configured !== 'string') return false;
  if (supplied.length === 0 || configured.length === 0) return false;
  const a = createHash('sha256').update(supplied, 'utf8').digest();
  const b = createHash('sha256').update(configured, 'utf8').digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Session establishment (session-fixation defence)
// ---------------------------------------------------------------------------

type SessionLike = {
  regenerate?: (cb: (err?: unknown) => void) => void;
  save?: (cb: (err?: unknown) => void) => void;
  cookie?: { maxAge?: number | null };
  [key: string]: unknown;
};

export interface EstablishSessionOptions {
  /** Cookie lifetime override (e.g. "remember me"). */
  maxAgeMs?: number;
  /** Fields from the pre-login session to carry into the new one. */
  carry?: string[];
}

/**
 * Sign a user in on a fresh session id: regenerate (drops any id an attacker
 * planted before login), copy over only the named fields, set userId, and
 * persist before the caller responds so the client's immediate /api/auth/me
 * sees it. Rejects when the session store is unavailable (setupAuth's
 * anonymous fallback session has no regenerate), so the caller returns an
 * error instead of a half-signed-in response.
 */
export async function establishSession(
  req: { session?: unknown },
  userId: string,
  opts: EstablishSessionOptions = {},
): Promise<void> {
  const before = req.session as SessionLike | undefined;
  if (!before || typeof before.regenerate !== 'function') {
    throw new Error('Session store unavailable');
  }
  const carried: Record<string, unknown> = {};
  for (const key of opts.carry ?? []) {
    if (key in before) carried[key] = before[key];
  }
  await new Promise<void>((resolve, reject) => {
    before.regenerate!((err) => (err ? reject(err) : resolve()));
  });
  const fresh = req.session as SessionLike; // express-session swaps req.session on regenerate
  Object.assign(fresh, carried);
  fresh.userId = userId;
  if (opts.maxAgeMs && fresh.cookie) fresh.cookie.maxAge = opts.maxAgeMs;
  await saveSession(req);
}

export async function saveSession(req: { session?: unknown }): Promise<void> {
  const s = req.session as SessionLike | undefined;
  if (!s || typeof s.save !== 'function') throw new Error('Session store unavailable');
  await new Promise<void>((resolve, reject) => {
    s.save!((err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Invite codes
// ---------------------------------------------------------------------------

/**
 * The one answer for every invite-code failure (unknown, used, revoked,
 * expired, locked). Distinct messages told a guesser which codes exist.
 */
export const GENERIC_INVITE_ERROR =
  "That invite code isn't valid. Check the code in your invite email, or join the waitlist.";

/** Normalise an invite code; null when it cannot be a real token. */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase();
  if (code.length < 4 || code.length > 64) return null;
  if (!/^[a-z0-9-]+$/.test(code)) return null;
  return code;
}

/**
 * Per-invite-code attempt counter (in-memory, per process). Complements the
 * per-IP signup limiter: a single code tried from many IPs is locked for the
 * rest of the window. Keys are hashed so raw codes are never held.
 */
export class InviteAttemptTracker {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxAttempts = 10,
    private readonly windowMs = 60 * 60 * 1000,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private key(code: string): string {
    return createHash('sha256').update(code).digest('hex').slice(0, 32);
  }

  /** Records one attempt; returns false when the code is over its budget. */
  attempt(code: string): boolean {
    const k = this.key(code);
    const t = this.now();
    let rec = this.hits.get(k);
    if (!rec || t - rec.windowStart >= this.windowMs) {
      if (!rec && this.hits.size >= this.maxKeys) this.prune(t);
      rec = { count: 0, windowStart: t };
      this.hits.set(k, rec);
    }
    rec.count += 1;
    return rec.count <= this.maxAttempts;
  }

  private prune(t: number) {
    this.hits.forEach((rec, k) => {
      if (t - rec.windowStart >= this.windowMs) this.hits.delete(k);
    });
    // Still full (a flood of distinct codes): drop the oldest entries. The per-IP
    // limiter is what bounds a distributed flood; this only bounds memory.
    if (this.hits.size >= this.maxKeys) {
      const drop = this.hits.size - this.maxKeys + 1;
      let i = 0;
      for (const k of Array.from(this.hits.keys())) {
        if (i++ >= drop) break;
        this.hits.delete(k);
      }
    }
  }

  size(): number {
    return this.hits.size;
  }
}

export const signupInviteAttempts = new InviteAttemptTracker();

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 254;

/** Lower-cased, trimmed email, or null when it is not a plausible address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return null;
  return EMAIL_RE.test(email) ? email : null;
}

/** Optional short name field: undefined when absent, null when invalid. */
export function optionalName(raw: unknown, max = 100): string | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v.length > max) return null;
  return v || undefined;
}

export interface WaitlistInput {
  email: string;
  source: string;
  referralCode: string | null;
}

/** Validates the public waitlist body; returns an error string or the clean input. */
export function parseWaitlistInput(body: unknown): { ok: true; value: WaitlistInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.email === undefined || b.email === null || b.email === '') return { ok: false, error: 'Email is required' };
  const email = normalizeEmail(b.email);
  if (!email) return { ok: false, error: 'Invalid email format' };

  let source = 'landing';
  if (b.source !== undefined && b.source !== null && b.source !== '') {
    if (typeof b.source !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(b.source.trim())) {
      return { ok: false, error: 'Invalid source' };
    }
    source = b.source.trim().toLowerCase();
  }

  let referralCode: string | null = null;
  if (b.referralCode !== undefined && b.referralCode !== null && b.referralCode !== '') {
    if (typeof b.referralCode !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(b.referralCode.trim())) {
      return { ok: false, error: 'Invalid referral code' };
    }
    referralCode = b.referralCode.trim();
  }
  return { ok: true, value: { email, source, referralCode } };
}

// ---------------------------------------------------------------------------
// Google sign-in tier policy
// ---------------------------------------------------------------------------

/**
 * Tier for a Google account at FIRST creation only (the existing beta policy:
 * whitelisted emails and just-redeemed invites start on pro, everyone else on
 * free). Returning users keep whatever tier they have — sign-in never changes
 * a tier (it used to upgrade every free beta user to pro on every login).
 */
/**
 * Operator 2026-09-30: every NEW account starts on Free — email, Google and
 * beta-redeem alike. Beta access is a flag (hasBetaAccess), not a paid tier;
 * an invite may still carry an explicit tierOverride.
 */
export function googleNewUserTier(_shouldGrantBetaAccess: boolean): 'pro' | 'free' {
  return 'free';
}
