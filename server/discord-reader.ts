/**
 * Discord REST reader for the forum import — GET only, nothing here can post.
 *
 *   listForumThreads(forumId)   GET /channels/{forum}                         (guild id, type check)
 *                               GET /guilds/{guild}/threads/active            (filtered by parent_id)
 *                               GET /channels/{forum}/threads/archived/public (before=<archive_timestamp>, has_more)
 *   threadMessages(threadId)    GET /channels/{thread}/messages?limit=100&before=<id>  (newest → oldest)
 *
 * Every request honours 429 retry_after (body, then Retry-After header) and
 * sleeps out X-RateLimit-Reset-After when X-RateLimit-Remaining hits 0.
 * `fetchImpl` / `sleep` are injectable so pagination and rate-limit handling
 * are tested against fixtures (scripts/test-discord-forum.ts) without Discord.
 * No database imports: this file must load in a test process.
 */
import { THREAD_PARENT_TYPES, type ForumThreadInfo } from '@shared/discord-forum';

const API = 'https://discord.com/api/v10';
export const DISCORD_THREAD_MAX_MESSAGES = 5000;
const MAX_ARCHIVE_PAGES = 50;

export class DiscordReadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface DiscordReaderOptions {
  token: string;
  fetchImpl?: (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<{
    status: number; ok: boolean; headers: { get(name: string): string | null }; json(): Promise<any>;
  }>;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export interface ForumListing {
  forum: { id: string; name: string | null; guildId: string; type: number };
  threads: ForumThreadInfo[];
}

function threadInfo(t: any, archivedDefault: boolean): ForumThreadInfo {
  return {
    id: String(t.id),
    name: String(t.name ?? `thread ${t.id}`),
    parentId: t.parent_id != null ? String(t.parent_id) : null,
    guildId: t.guild_id != null ? String(t.guild_id) : null,
    ownerId: t.owner_id != null ? String(t.owner_id) : null,
    archived: t.thread_metadata?.archived ?? archivedDefault,
    messageCount: Number.isFinite(Number(t.message_count)) ? Number(t.message_count) : null,
  };
}

export function discordReader(opts: DiscordReaderOptions) {
  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init) as any);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 5;
  let requests = 0;
  let waitedMs = 0;

  async function get(path: string): Promise<any> {
    let retries = 0;
    for (;;) {
      const res = await fetchImpl(`${API}${path}`, {
        method: 'GET',
        headers: { Authorization: `Bot ${opts.token}`, 'User-Agent': 'QuantEdgeJournalImport (https://quantedgelabs.net, 1.0)' },
      });
      requests++;
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        const wait = Math.ceil((Number(body?.retry_after) || Number(res.headers.get('retry-after')) || 1) * 1000);
        if (++retries > maxRetries) throw new DiscordReadError(429, 'Discord kept rate-limiting the read — try again in a minute');
        const ms = Math.min(wait, 30_000);
        waitedMs += ms;
        await sleep(ms);
        continue;
      }
      if (res.status === 401) throw new DiscordReadError(401, 'Discord rejected DISCORD_BOT_TOKEN (401)');
      if (res.status === 403) throw new DiscordReadError(403, 'The bot cannot read that channel (403) — give it View Channel + Read Message History on the forum');
      if (res.status === 404) throw new DiscordReadError(404, 'Not found (404) — check the forum channel id and that the bot is in that server');
      if (!res.ok) throw new DiscordReadError(res.status, `Discord answered ${res.status}`);
      const body = await res.json();
      const remaining = Number(res.headers.get('x-ratelimit-remaining'));
      const resetAfter = Number(res.headers.get('x-ratelimit-reset-after'));
      if (res.headers.get('x-ratelimit-remaining') != null && Number.isFinite(remaining) && remaining <= 0 && Number.isFinite(resetAfter)) {
        const ms = Math.ceil(resetAfter * 1000);
        waitedMs += ms;
        await sleep(ms);
      }
      return body;
    }
  }

  async function listForumThreads(forumId: string): Promise<ForumListing> {
    if (!/^\d{15,22}$/.test(forumId)) throw new DiscordReadError(400, 'Forum id must be the numeric Discord channel id');
    const ch = await get(`/channels/${forumId}`);
    const type = Number(ch?.type);
    if (!THREAD_PARENT_TYPES.has(type)) throw new DiscordReadError(422, `Channel ${forumId} is not a forum or text channel (type ${ch?.type})`);
    const guildId = String(ch.guild_id ?? '');
    if (!guildId) throw new DiscordReadError(422, 'That channel is not in a server');
    const out = new Map<string, ForumThreadInfo>();

    const active = await get(`/guilds/${guildId}/threads/active`);
    for (const t of Array.isArray(active?.threads) ? active.threads : []) {
      if (String(t.parent_id) === forumId) out.set(String(t.id), threadInfo({ guild_id: guildId, ...t }, false));
    }

    let before: string | null = null;
    for (let page = 0; page < MAX_ARCHIVE_PAGES; page++) {
      const qs = new URLSearchParams({ limit: '100' });
      if (before) qs.set('before', before);
      const r = await get(`/channels/${forumId}/threads/archived/public?${qs}`);
      const list: any[] = Array.isArray(r?.threads) ? r.threads : [];
      for (const t of list) if (!out.has(String(t.id))) out.set(String(t.id), threadInfo({ guild_id: guildId, ...t }, true));
      if (!r?.has_more || !list.length) break;
      const next = list[list.length - 1]?.thread_metadata?.archive_timestamp;
      if (!next || next === before) break;
      before = String(next);
    }
    return { forum: { id: forumId, name: ch.name ?? null, guildId, type }, threads: [...out.values()] };
  }

  /** Raw API messages, newest → oldest, up to `max`. */
  async function threadMessages(threadId: string, max = DISCORD_THREAD_MAX_MESSAGES): Promise<any[]> {
    if (!/^\d{15,22}$/.test(threadId)) throw new DiscordReadError(400, 'Thread id must be numeric');
    const out: any[] = [];
    let before: string | null = null;
    while (out.length < max) {
      const qs = new URLSearchParams({ limit: '100' });
      if (before) qs.set('before', before);
      const page = await get(`/channels/${threadId}/messages?${qs}`);
      if (!Array.isArray(page) || page.length === 0) break;
      out.push(...page);
      before = String(page[page.length - 1].id);
      if (page.length < 100) break;
    }
    return out.slice(0, max);
  }

  return { get, listForumThreads, threadMessages, stats: () => ({ requests, waitedMs }) };
}
