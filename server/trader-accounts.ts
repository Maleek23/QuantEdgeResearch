/**
 * Trader accounts — server-side pure helpers (no DB imports) so
 * scripts/test-trader-accounts.ts can exercise them directly.
 * docs/DESK_ADMINS.md §Trader accounts.
 *
 * Secrets and how they are stored (no migration — existing columns only):
 *
 *   setup link token   32 random bytes, base64url (43 chars). Stored ONLY as
 *                      'setup:' + sha256(token) in password_reset_tokens.token
 *                      (unique, used flag, expires_at = +48h). The plaintext is
 *                      returned once to the admin and never stored or logged.
 *                      /api/auth/reset-password refuses 'setup:' values, so a
 *                      stored hash can never be replayed as a reset token.
 *   temp password      ~115 bits from crypto.randomBytes, stored only as
 *                      'mustchange$' + bcrypt(temp) in users.password_hash.
 *                      Login verifies the bcrypt part but answers
 *                      { mustChangePassword } with NO session; the trader must
 *                      set their own password first (POST /api/auth/first-login).
 *   no password yet    'pending$' + random hex in users.password_hash: not a
 *                      bcrypt hash, so nothing verifies against it, and it is
 *                      non-null, so no invite/onboarding path can "add a
 *                      password" to the account (routes.ts beta/onboard only
 *                      fills a NULL hash).
 */
import { createHash, randomBytes } from 'node:crypto';
import { DESK_SLUG_RE } from '@shared/desk-admin';
import {
  SETUP_LINK_TTL_MS, isReservedLoginEmail, normalizeUsername, usernameFromDisplayName, usernameLoginEmail,
  type CredentialMethod, type TraderAccountStatus,
} from '@shared/trader-accounts';
import { normalizeEmail } from './auth-hardening';
import { parseAssignableTier, type AssignableTier } from './admin-ops';

// ---------------------------------------------------------------------------
// Setup-link tokens
// ---------------------------------------------------------------------------

export const SETUP_TOKEN_BYTES = 32;
export const SETUP_TOKEN_PREFIX = 'setup:';
const SETUP_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateSetupToken(rand: (n: number) => Buffer = randomBytes): string {
  const buf = rand(SETUP_TOKEN_BYTES);
  if (buf.length !== SETUP_TOKEN_BYTES) throw new Error('short random read');
  return buf.toString('base64url');
}

/** What the database holds: never the token itself. */
export function hashSetupToken(token: string): string {
  return SETUP_TOKEN_PREFIX + createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isSetupTokenHash(stored: unknown): boolean {
  return typeof stored === 'string' && stored.startsWith(SETUP_TOKEN_PREFIX);
}

/** Shape check before any lookup (bounds work; rejects hashes, reset tokens, junk). */
export function looksLikeSetupToken(raw: unknown): raw is string {
  return typeof raw === 'string' && SETUP_TOKEN_RE.test(raw);
}

export function setupLinkExpiry(now: number = Date.now()): Date {
  return new Date(now + SETUP_LINK_TTL_MS);
}

/** `/setup#token=…` — the fragment never reaches the server or a Referer header. */
export function setupLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/setup#token=${encodeURIComponent(token)}`;
}

/** A row that marks "credentials were issued here" without being usable (temp-password issue, revocation). */
export function inertSetupRowHash(rand: (n: number) => Buffer = randomBytes): string {
  return `${SETUP_TOKEN_PREFIX}inert:${rand(16).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Temporary passwords
// ---------------------------------------------------------------------------

/** No 0/O/o/1/l/I — readable when the operator reads it out. 55 symbols. */
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TEMP_GROUPS = 4;
const TEMP_GROUP_LEN = 5;

/** `xxxxx-xxxxx-xxxxx-xxxxx`, rejection-sampled (no modulo bias): 20 × log2(55) ≈ 115 bits. */
export function generateTempPassword(rand: (n: number) => Buffer = randomBytes): string {
  const need = TEMP_GROUPS * TEMP_GROUP_LEN;
  const limit = 256 - (256 % TEMP_ALPHABET.length);
  const out: string[] = [];
  while (out.length < need) {
    const buf = rand(need * 2);
    for (let i = 0; i < buf.length && out.length < need; i++) {
      if (buf[i] < limit) out.push(TEMP_ALPHABET[buf[i] % TEMP_ALPHABET.length]);
    }
  }
  const groups: string[] = [];
  for (let g = 0; g < TEMP_GROUPS; g++) groups.push(out.slice(g * TEMP_GROUP_LEN, (g + 1) * TEMP_GROUP_LEN).join(''));
  return groups.join('-');
}

// ---------------------------------------------------------------------------
// users.password_hash states
// ---------------------------------------------------------------------------

export const MUST_CHANGE_PREFIX = 'mustchange$';
export const PENDING_PREFIX = 'pending$';

export type PasswordState = 'none' | 'pending' | 'must_change' | 'set';

export function pendingPasswordHash(rand: (n: number) => Buffer = randomBytes): string {
  return PENDING_PREFIX + rand(16).toString('hex');
}

export function markMustChange(bcryptHash: string): string {
  if (!bcryptHash.startsWith('$2')) throw new Error('not a bcrypt hash');
  return MUST_CHANGE_PREFIX + bcryptHash;
}

export function passwordState(hash: string | null | undefined): PasswordState {
  if (!hash) return 'none';
  if (hash.startsWith(MUST_CHANGE_PREFIX)) return 'must_change';
  if (hash.startsWith('$2')) return 'set';
  return 'pending';
}

/** The bcrypt hash a password is checked against, or null when nothing may verify. */
export function verifiableHashOf(hash: string | null | undefined): string | null {
  const s = passwordState(hash);
  if (s === 'set') return hash!;
  if (s === 'must_change') return hash!.slice(MUST_CHANGE_PREFIX.length);
  return null;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface SetupRowLike { token: string; used: boolean | null; expiresAt: Date | string; createdAt?: Date | string | null }

/** The newest usable link, if any (the admin list's "link expires"). */
export function liveSetupLink(rows: SetupRowLike[], now: number = Date.now()): SetupRowLike | null {
  const live = rows.filter((r) => isSetupTokenHash(r.token) && !r.token.includes(':inert:') && !r.used && new Date(r.expiresAt).getTime() > now);
  live.sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());
  return live[0] ?? null;
}

export function traderAccountStatus(
  user: { passwordHash?: string | null; subscriptionStatus?: string | null },
  rows: SetupRowLike[],
  now: number = Date.now(),
): TraderAccountStatus {
  if (user.subscriptionStatus === 'disabled') return 'disabled';
  const s = passwordState(user.passwordHash);
  if (s === 'set') return 'active';
  if (s === 'must_change') return 'temp_password';
  if (liveSetupLink(rows, now)) return 'setup_pending';
  const links = rows.filter((r) => isSetupTokenHash(r.token) && !r.token.includes(':inert:'));
  const newest = links.sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];
  // Expired while still unused = "expired"; anything else (revoked / consumed elsewhere) = no way in.
  if (newest && !newest.used && new Date(newest.expiresAt).getTime() <= now) return 'setup_expired';
  return 'no_credentials';
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

export interface CreateTraderAccountInput {
  displayName: string;
  email: string | null;
  username: string | null;
  /** The address stored in users.email: the real email, or the username's synthetic one. */
  loginEmail: string;
  traderSlug: string;
  tier: AssignableTier;
  deskAdmin: boolean;
  method: CredentialMethod;
}

export function parseCredentialMethod(raw: unknown): CredentialMethod | null {
  if (raw === undefined || raw === null || raw === '') return 'link';
  return raw === 'link' || raw === 'temp' ? raw : null;
}

/** Validates POST /api/admin/ops/trader-accounts. */
export function parseCreateTraderAccountInput(body: unknown): { ok: true; value: CreateTraderAccountInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  if (typeof b.displayName !== 'string') return { ok: false, error: 'Display name is required' };
  const displayName = b.displayName.trim().replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if (!displayName || displayName.length > 60 || /[\u0000-\u001f\u007f<>]/.test(displayName)) {
    return { ok: false, error: 'Display name: 1–60 characters, no < or >' };
  }

  const traderSlug = typeof b.traderSlug === 'string' ? b.traderSlug.trim().toLowerCase() : '';
  if (!DESK_SLUG_RE.test(traderSlug)) return { ok: false, error: 'Choose a trader book' };

  let email: string | null = null;
  if (b.email !== undefined && b.email !== null && b.email !== '') {
    email = normalizeEmail(b.email);
    if (!email) return { ok: false, error: 'Enter a valid email, or leave it blank for a username login' };
    if (isReservedLoginEmail(email)) return { ok: false, error: 'That address is reserved — leave email blank to use a username' };
  }

  let username: string | null = null;
  if (!email) {
    const typed = b.username !== undefined && b.username !== null && b.username !== '';
    username = typed ? normalizeUsername(b.username) : usernameFromDisplayName(displayName);
    if (!username) {
      return { ok: false, error: typed
        ? 'Username: 2–32 characters, lowercase letters, digits, . _ -, starting with a letter (not a reserved name)'
        : 'No usable username in that name — type one, or give an email' };
    }
  }

  const tierRaw = b.tier === undefined || b.tier === null || b.tier === '' ? 'free' : b.tier;
  const tier = parseAssignableTier(tierRaw);
  if (!tier) return { ok: false, error: 'Tier must be free, advanced or pro' };

  if (b.deskAdmin !== undefined && typeof b.deskAdmin !== 'boolean') return { ok: false, error: 'deskAdmin must be true or false' };
  const deskAdmin = b.deskAdmin === undefined ? true : b.deskAdmin;

  const method = parseCredentialMethod(b.method);
  if (!method) return { ok: false, error: "method must be 'link' or 'temp'" };

  return { ok: true, value: { displayName, email, username, loginEmail: email ?? usernameLoginEmail(username!), traderSlug, tier, deskAdmin, method } };
}
