/**
 * Admin hub › operator actions — pure helpers (no DB imports) so
 * scripts/test-admin-ops.ts can exercise them directly. docs/ADMIN_TAB.md.
 *
 *   invite codes     generateInviteCode (crypto.randomBytes), parseGenerateInvitesInput,
 *                    inviteDisplayStatus, invite email lock, safeInviteTier
 *   users            parseAssignableTier (admin is never assignable from the UI),
 *                    isProtectedAdmin, isAccountDisabled, toAdminUserRow
 *   overview         summarizeUsers
 *
 * Codes are stored in beta_invites.token in plaintext — that is what the
 * existing schema and every redemption path expect (signup, /api/beta/redeem,
 * Google sign-in look the token up by equality). Each code carries ~99 bits of
 * entropy and the signup path rate-limits per IP and per code.
 */
import { randomBytes } from 'node:crypto';
import type { SubscriptionTier } from '@shared/schema';
import { normalizeEmail, normalizeInviteCode } from './auth-hardening';

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

/** Tiers an operator can set from the admin hub. `admin` is env-only (ADMIN_EMAIL). */
export const ADMIN_ASSIGNABLE_TIERS = ['free', 'advanced', 'pro'] as const;
export type AssignableTier = (typeof ADMIN_ASSIGNABLE_TIERS)[number];

export function parseAssignableTier(raw: unknown): AssignableTier | null {
  return typeof raw === 'string' && (ADMIN_ASSIGNABLE_TIERS as readonly string[]).includes(raw) ? (raw as AssignableTier) : null;
}

/**
 * The tier an invite may grant at redemption. Anything other than
 * free/advanced/pro (including a legacy 'admin' override) grants nothing.
 */
export function safeInviteTier(raw: unknown): AssignableTier | null {
  return parseAssignableTier(raw);
}

/** The owner account (ADMIN_EMAIL) or an admin-tier account: never changed or deleted from the UI. */
export function isProtectedAdmin(
  user: { email?: string | null; subscriptionTier?: string | null } | null | undefined,
  adminEmail: string | undefined = process.env.ADMIN_EMAIL,
): boolean {
  if (!user) return false;
  if (user.subscriptionTier === 'admin') return true;
  return !!adminEmail && !!user.email && user.email.toLowerCase() === adminEmail.toLowerCase();
}

// ---------------------------------------------------------------------------
// Disabled accounts
// ---------------------------------------------------------------------------

/**
 * A disabled account is `users.subscription_status = 'disabled'` — an existing
 * varchar column, so disabling needs no migration. Paid checkout is off
 * (shared/pricing.ts CHECKOUT_LIVE=false), so Stripe never rewrites it.
 */
export const DISABLED_STATUS = 'disabled';
export const ACCOUNT_DISABLED_ERROR = 'This account is disabled. Contact support if you think this is a mistake.';

export function isAccountDisabled(user: { subscriptionStatus?: string | null } | null | undefined): boolean {
  return !!user && user.subscriptionStatus === DISABLED_STATUS;
}

// ---------------------------------------------------------------------------
// Invite codes
// ---------------------------------------------------------------------------

/** No 0/o/1/l/i — read aloud or typed from a screenshot without ambiguity. */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // 31 symbols
const CODE_GROUPS = 4;
const CODE_GROUP_LEN = 5;

/**
 * `qe-xxxxx-xxxxx-xxxxx-xxxxx` from crypto.randomBytes with rejection sampling
 * (no modulo bias): 20 symbols × log2(31) ≈ 99 bits. Always passes
 * normalizeInviteCode (lower-case [a-z0-9-], ≤ 64 chars).
 */
export function generateInviteCode(rand: (n: number) => Buffer = randomBytes): string {
  const need = CODE_GROUPS * CODE_GROUP_LEN;
  const limit = 256 - (256 % CODE_ALPHABET.length); // 248: bytes ≥ this are rejected
  const out: string[] = [];
  while (out.length < need) {
    const buf = rand(need * 2);
    for (let i = 0; i < buf.length && out.length < need; i++) {
      if (buf[i] < limit) out.push(CODE_ALPHABET[buf[i] % CODE_ALPHABET.length]);
    }
  }
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) groups.push(out.slice(g * CODE_GROUP_LEN, (g + 1) * CODE_GROUP_LEN).join(''));
  return `qe-${groups.join('-')}`;
}

/**
 * beta_invites.email is NOT NULL. An invite that is not locked to an address
 * stores '' — it can never equal a real (normalised) email, so the
 * email-keyed lookups (Google sign-in, duplicate checks) never match it.
 */
export const UNLOCKED_INVITE_EMAIL = '';

export function isInviteEmailLocked(invite: { email?: string | null }): boolean {
  return typeof invite.email === 'string' && invite.email.trim() !== '';
}

/** True when the invite may be used by `email` (unlocked, or locked to that address). */
export function inviteEmailMatches(invite: { email?: string | null }, email: string | null | undefined): boolean {
  if (!isInviteEmailLocked(invite)) return true;
  return !!email && invite.email!.trim().toLowerCase() === email.trim().toLowerCase();
}

export type InviteDisplayStatus = 'unused' | 'used' | 'expired' | 'revoked';

/** One status the operator can act on (pending/sent past their expiry read as expired). */
export function inviteDisplayStatus(
  invite: { status?: string | null; expiresAt?: Date | string | null },
  now: number = Date.now(),
): InviteDisplayStatus {
  if (invite.status === 'redeemed') return 'used';
  if (invite.status === 'revoked') return 'revoked';
  if (invite.status === 'expired') return 'expired';
  const exp = invite.expiresAt ? new Date(invite.expiresAt).getTime() : NaN;
  if (Number.isFinite(exp) && exp < now) return 'expired';
  return 'unused';
}

export const INVITE_TIER_CHOICES = ['none', 'free', 'advanced', 'pro'] as const;
export const MAX_INVITES_PER_BATCH = 100;
export const DEFAULT_INVITE_EXPIRY_DAYS = 14;

export interface GenerateInvitesInput {
  count: number;
  email: string | null;
  tierOverride: AssignableTier | null;
  expiryDays: number;
  note: string | null;
}

/** Validates POST /api/admin/ops/invites/generate. An email lock implies count = 1. */
export function parseGenerateInvitesInput(body: unknown): { ok: true; value: GenerateInvitesInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const count = b.count === undefined || b.count === null || b.count === '' ? 1 : Number(b.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_INVITES_PER_BATCH) {
    return { ok: false, error: `Count must be a whole number from 1 to ${MAX_INVITES_PER_BATCH}` };
  }

  let email: string | null = null;
  if (b.email !== undefined && b.email !== null && b.email !== '') {
    email = normalizeEmail(b.email);
    if (!email) return { ok: false, error: 'Enter a valid email address, or leave it blank for an unlocked code' };
    if (count !== 1) return { ok: false, error: 'An email-locked invite is one code — set count to 1' };
  }

  let tierOverride: AssignableTier | null = null;
  if (b.tierOverride !== undefined && b.tierOverride !== null && b.tierOverride !== '' && b.tierOverride !== 'none') {
    tierOverride = parseAssignableTier(b.tierOverride);
    if (!tierOverride) return { ok: false, error: 'Tier override must be none, free, advanced or pro' };
  }

  const expiryDays = b.expiryDays === undefined || b.expiryDays === null || b.expiryDays === '' ? DEFAULT_INVITE_EXPIRY_DAYS : Number(b.expiryDays);
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365) {
    return { ok: false, error: 'Expiry must be 1 to 365 days' };
  }

  let note: string | null = null;
  if (b.note !== undefined && b.note !== null && b.note !== '') {
    if (typeof b.note !== 'string' || b.note.length > 500) return { ok: false, error: 'Note must be text of at most 500 characters' };
    note = b.note.trim() || null;
  }
  return { ok: true, value: { count, email, tierOverride, expiryDays, note } };
}

export function inviteExpiryDate(days: number, now: number = Date.now()): Date {
  return new Date(now + days * 86_400_000);
}

/** `/signup?code=…` — the signup page prefills the code from ?code=. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/signup?code=${encodeURIComponent(code)}`;
}

/** Sanity check used by tests and the generator route. */
export function isWellFormedCode(code: string): boolean {
  return normalizeInviteCode(code) === code;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  tier: SubscriptionTier;
  hasBetaAccess: boolean;
  disabled: boolean;
  isAdmin: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  authMethod: 'password' | 'google' | 'other';
}

type UserLike = {
  id: string; email: string; firstName?: string | null; lastName?: string | null;
  subscriptionTier?: string | null; subscriptionStatus?: string | null; hasBetaAccess?: boolean | null;
  createdAt?: Date | string | null; lastLoginDate?: string | null; passwordHash?: string | null;
};

const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isFinite(t.getTime()) ? t.toISOString() : null;
};

/** The admin list row — never the password hash, Stripe ids or onboarding answers. */
export function toAdminUserRow(u: UserLike, lastLoginAt: Date | string | null | undefined, adminEmail?: string): AdminUserRow {
  const name = [u.firstName, u.lastName].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || null;
  // users.last_login_date is a YYYY-MM-DD streak date; the login history is the exact time.
  const last = iso(lastLoginAt) ?? (u.lastLoginDate && /^\d{4}-\d{2}-\d{2}$/.test(u.lastLoginDate) ? `${u.lastLoginDate}T00:00:00.000Z` : null);
  return {
    id: u.id,
    email: u.email,
    name,
    tier: ((u.subscriptionTier as SubscriptionTier) || 'free'),
    hasBetaAccess: !!u.hasBetaAccess,
    disabled: isAccountDisabled(u),
    isAdmin: isProtectedAdmin(u, adminEmail ?? process.env.ADMIN_EMAIL),
    createdAt: iso(u.createdAt),
    lastLoginAt: last,
    authMethod: u.passwordHash ? 'password' : u.id.startsWith('google_') ? 'google' : 'other',
  };
}

export interface UserSummary {
  total: number;
  byTier: Record<string, number>;
  betaAccess: number;
  disabled: number;
  signups7d: number;
  signups30d: number;
  seen24h: number;
  seen7d: number;
}

export function summarizeUsers(rows: AdminUserRow[], now: number = Date.now()): UserSummary {
  const byTier: Record<string, number> = { free: 0, advanced: 0, pro: 0, admin: 0 };
  let betaAccess = 0, disabled = 0, signups7d = 0, signups30d = 0, seen24h = 0, seen7d = 0;
  for (const r of rows) {
    byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
    if (r.hasBetaAccess) betaAccess++;
    if (r.disabled) disabled++;
    const c = r.createdAt ? Date.parse(r.createdAt) : NaN;
    if (Number.isFinite(c)) {
      if (now - c <= 7 * 86_400_000) signups7d++;
      if (now - c <= 30 * 86_400_000) signups30d++;
    }
    const l = r.lastLoginAt ? Date.parse(r.lastLoginAt) : NaN;
    if (Number.isFinite(l)) {
      if (now - l <= 86_400_000) seen24h++;
      if (now - l <= 7 * 86_400_000) seen7d++;
    }
  }
  return { total: rows.length, byTier, betaAccess, disabled, signups7d, signups30d, seen24h, seen7d };
}

/** Delete confirmation: the operator retypes the account's email. */
export function deleteConfirmed(user: { email: string }, typed: unknown): boolean {
  return typeof typed === 'string' && typed.trim().toLowerCase() === user.email.trim().toLowerCase();
}
