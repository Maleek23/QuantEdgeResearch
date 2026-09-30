/**
 * PUBLIC CONFIG — values the public pages (landing, sign-up) read from the build env.
 *
 * Discord community invite: ONE value — `VITE_DISCORD_INVITE_URL` (build-time, Vite)
 * when set, else DEFAULT_DISCORD_INVITE_URL below. Accepted only when it is a real
 * server invite link — https://discord.gg/<code> or https://discord.com/invite/<code>.
 * Anything else (a bot OAuth / authorize URL, a channel link) is rejected; if nothing
 * valid remains, every "Join the community" button hides itself. The bot's OAuth URL
 * adds the bot to a server — it is not an invite.
 */
export const DISCORD_SERVER_NAME = 'Quant-Edge Traders';

export function parseDiscordInvite(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const ok =
    (host === 'discord.gg' && parts.length === 1) ||
    ((host === 'discord.com' || host === 'discordapp.com') && parts.length === 2 && parts[0] === 'invite');
  return ok ? `https://${host}/${parts.join('/')}` : null;
}

/** The operator's public invite to Quant-Edge Traders (2026-09-30). Public link — safe to commit. */
export const DEFAULT_DISCORD_INVITE_URL = 'https://discord.gg/ppjjxVfsc';

/** VITE_DISCORD_INVITE_URL overrides the default; an invalid override (e.g. a bot OAuth URL) is ignored. */
export const DISCORD_INVITE_URL: string | null =
  parseDiscordInvite((import.meta.env as Record<string, string | undefined>).VITE_DISCORD_INVITE_URL)
  ?? parseDiscordInvite(DEFAULT_DISCORD_INVITE_URL);
