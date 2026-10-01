/**
 * One password rule for every account path (auth hardening 2026-09-30).
 *
 * Before this, /api/auth/signup and /api/auth/reset-password accepted 6
 * characters while /api/beta/onboard (the /join-beta form) required 8. The
 * server enforces this rule in every path that sets a password
 * (server/routes.ts: signup, reset-password, beta/onboard). The client shows
 * the same constants, so the form and the server cannot drift apart.
 */

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only reads the first 72 bytes; a hard cap also bounds hashing cost. */
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_RULE_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters.`;
export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
export const PASSWORD_TOO_LONG_MESSAGE = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;

/** Returns null when the password is acceptable, otherwise a user-facing reason. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  if (password.length > PASSWORD_MAX_LENGTH) return PASSWORD_TOO_LONG_MESSAGE;
  return null;
}
