/**
 * Trader accounts (docs/DESK_ADMINS.md §Trader accounts) — browser-safe rules
 * shared by the admin hub form, the /setup page and the server.
 *
 * An operator-created account may have no email. It then signs in with a
 * USERNAME (lowercase, e.g. "femi"). users.email is NOT NULL UNIQUE, so a
 * username account is stored under a synthetic address in the reserved
 * `.invalid` TLD (RFC 2606 — can never be delivered or registered):
 *
 *     femi  ⇄  femi@login.quantedge.invalid
 *
 * No migration: the username IS the email column. Public sign-up / Google /
 * beta onboarding refuse that domain, so nobody can squat a username.
 */

export const USERNAME_LOGIN_DOMAIN = 'login.quantedge.invalid';

/** 2–32 chars, starts with a letter, then a-z 0-9 . _ - */
export const USERNAME_RE = /^[a-z][a-z0-9._-]{1,31}$/;

/** Names that would read as staff / system accounts. */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'quantedge', 'quantinum', 'nexus', 'operator', 'owner', 'staff', 'security', 'null', 'undefined',
]);

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(u) || RESERVED_USERNAMES.has(u)) return null;
  return u;
}

/** "Femi Ade" → "femi"; null when nothing usable is left. */
export function usernameFromDisplayName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const first = name.trim().toLowerCase().split(/\s+/)[0] ?? '';
  const cleaned = first.replace(/[^a-z0-9._-]/g, '').replace(/^[^a-z]+/, '').slice(0, 32);
  return normalizeUsername(cleaned);
}

export function usernameLoginEmail(username: string): string {
  return `${username}@${USERNAME_LOGIN_DOMAIN}`;
}

/** True for the synthetic username addresses — never a real inbox. */
export function isReservedLoginEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${USERNAME_LOGIN_DOMAIN}`);
}

/** The username behind a synthetic address, or null for a real email. */
export function usernameOfLoginEmail(email: unknown): string | null {
  if (!isReservedLoginEmail(email)) return null;
  return normalizeUsername((email as string).trim().toLowerCase().slice(0, -(USERNAME_LOGIN_DOMAIN.length + 1)));
}

/**
 * The login form's single field: an email (anything with "@", lower-cased and
 * trimmed — the old behaviour) or a username (mapped to its synthetic address).
 * Null when it can be neither, so the caller answers with the generic 401.
 */
export function resolveLoginIdentifier(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (!v || v.length > 254) return null;
  if (v.includes('@')) return v;
  const u = normalizeUsername(v);
  return u ? usernameLoginEmail(u) : null;
}

/** What the trader types to sign in. */
export function loginNameOf(email: string): string {
  return usernameOfLoginEmail(email) ?? email;
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/** The tier a trader account gets unless the admin picks another (admin form default; self-setup always). Beta access is on either way. */
export const TRADER_ACCOUNT_DEFAULT_TIER = 'free' as const;

export const SETUP_LINK_TTL_HOURS = 48;
export const SETUP_LINK_TTL_MS = SETUP_LINK_TTL_HOURS * 3_600_000;

export type CredentialMethod = 'link' | 'temp';

export type TraderAccountStatus =
  | 'setup_pending'   // setup link issued, unused, not expired
  | 'setup_expired'   // link expired before use — regenerate
  | 'temp_password'   // temporary password issued; forced change on first sign-in
  | 'no_credentials'  // link / temp password revoked — regenerate
  | 'active'          // the trader set their own password
  | 'disabled';

export const TRADER_ACCOUNT_STATUS_LABEL: Record<TraderAccountStatus, string> = {
  setup_pending: 'Setup pending',
  setup_expired: 'Link expired',
  temp_password: 'Temp password — change pending',
  no_credentials: 'Revoked — no way in',
  active: 'Active',
  disabled: 'Disabled',
};

/** The setup link carries the token in the URL fragment (never sent to the server, never in a Referer). */
export function readSetupTokenFromLocation(loc: { hash?: string; search?: string }): string | null {
  const fromHash = new URLSearchParams((loc.hash ?? '').replace(/^#/, '')).get('token');
  const fromQuery = new URLSearchParams(loc.search ?? '').get('token');
  const t = (fromHash || fromQuery || '').trim();
  return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
}
