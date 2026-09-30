/**
 * Privacy helpers (docs/PRIVACY_IMPACT_ASSESSMENT.md, 2026-09-30).
 *
 * Pure functions only — no I/O — so they can be unit-checked without a DB.
 *
 *   emailDomain(e)            "jane@gmail.com" → "gmail.com"
 *   maskEmail(e)              "jane@gmail.com" → "j***@gmail.com"
 *   waitlistDiscordConfig()   where / how much of a waitlist signup goes to Discord
 */

export function emailDomain(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return 'unknown';
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return 'unknown';
  return email.slice(at + 1).toLowerCase().trim();
}

export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return 'unknown';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***@${emailDomain(email)}`;
}

export type WaitlistDiscordDetail = 'off' | 'domain' | 'full';

/**
 * Waitlist signup → Discord notification.
 *
 * Before 2026-09-30 every signup's full email was posted to DISCORD_WEBHOOK_URL —
 * the general fallback webhook several scanners and the weekly report also post
 * to — so a signup email could land in a community channel. Now:
 *
 *   DISCORD_WAITLIST_WEBHOOK_URL   dedicated, operator-only channel. NO fallback to
 *                                  DISCORD_WEBHOOK_URL: unset = no notification.
 *   WAITLIST_DISCORD_DETAIL        'domain' (default) — posts "…@gmail.com" only
 *                                  'full'  — posts the full address (only if that
 *                                            channel is private to the operator)
 *                                  'off'   — never notify
 */
export function waitlistDiscordConfig(env: NodeJS.ProcessEnv = process.env): { webhookUrl: string | null; detail: WaitlistDiscordDetail } {
  const raw = (env.WAITLIST_DISCORD_DETAIL || 'domain').trim().toLowerCase();
  const detail: WaitlistDiscordDetail = raw === 'off' || raw === 'full' ? raw : 'domain';
  const url = env.DISCORD_WAITLIST_WEBHOOK_URL?.trim() || null;
  return { webhookUrl: detail === 'off' ? null : url, detail };
}

/** The value shown in the Discord embed's "Email" field for a given detail level. */
export function waitlistEmailForDiscord(email: string, detail: WaitlistDiscordDetail): string {
  return detail === 'full' ? email : `…@${emailDomain(email)}`;
}
