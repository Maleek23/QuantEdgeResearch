/**
 * Twitter / X Publisher
 *
 * Dual-account posting with hard anti-spam guardrails. By design:
 *   - The PERSONAL account is manual-only by default — every post must be
 *     human-approved. The publisher generates and queues; it does not send
 *     unless the request is flagged `approved: true`.
 *   - The BRAND account is auto-eligible but capped (default 3/day, min 3h
 *     between posts, dedup against last 50 posts, conviction floor).
 *
 * Configure with env vars; everything has a sensible default.
 *
 * Two safety nets are always on:
 *   1. Dry-run mode auto-engages when the account's API creds aren't set.
 *      The tweet is logged + queued, never sent. This is what you'll get
 *      until X API access is wired up.
 *   2. The in-process state map enforces caps even if the API is mis-wired.
 *      A restart drops state — accept that for now; persisted state is the
 *      next iteration.
 */
import { logger } from './logger';
import { createHash } from 'crypto';

export type AccountKey = 'leekandtrades' | 'quantedge';

interface AccountConfig {
  key: AccountKey;
  label: string;
  /** When true, only posts when caller passes approved=true. */
  manualOnly: boolean;
  /** Max tweets per UTC day. Threads count as 1 toward this cap. */
  maxPostsPerDay: number;
  /** Minimum hours between posts. Threads use the timestamp of the root tweet. */
  minHoursBetweenPosts: number;
  /** Optional conviction floor (used by callers; not enforced here). */
  minConviction?: 'low' | 'medium' | 'high' | 'very-high';
  /** Required env keys; if any missing, publisher runs in dry-run for this account. */
  envKeys: {
    appKey: string;
    appSecret: string;
    accessToken: string;
    accessSecret: string;
  };
}

const ACCOUNTS: Record<AccountKey, AccountConfig> = {
  leekandtrades: {
    key: 'leekandtrades',
    label: '@Leekandtrades (personal)',
    manualOnly: true,
    maxPostsPerDay: Number(process.env.LEEK_MAX_POSTS_PER_DAY ?? 2),
    minHoursBetweenPosts: Number(process.env.LEEK_MIN_HOURS_BETWEEN ?? 4),
    envKeys: {
      appKey: 'LEEK_X_APP_KEY',
      appSecret: 'LEEK_X_APP_SECRET',
      accessToken: 'LEEK_X_ACCESS_TOKEN',
      accessSecret: 'LEEK_X_ACCESS_SECRET',
    },
  },
  quantedge: {
    key: 'quantedge',
    label: '@QuantEdge (brand)',
    manualOnly: false,
    maxPostsPerDay: Number(process.env.QE_MAX_POSTS_PER_DAY ?? 3),
    minHoursBetweenPosts: Number(process.env.QE_MIN_HOURS_BETWEEN ?? 3),
    minConviction: (process.env.QE_MIN_CONVICTION as any) ?? 'high',
    envKeys: {
      appKey: 'QE_X_APP_KEY',
      appSecret: 'QE_X_APP_SECRET',
      accessToken: 'QE_X_ACCESS_TOKEN',
      accessSecret: 'QE_X_ACCESS_SECRET',
    },
  },
};

interface PostRecord {
  account: AccountKey;
  /** Hash of normalized content; used for dedup. */
  hash: string;
  postedAt: number;
  ids: string[];        // tweet ids if real-posted; empty if dry-run
  dryRun: boolean;
  preview: string;      // first ~120 chars
}

const HISTORY: PostRecord[] = [];
const DEDUP_WINDOW = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeForDedup(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w$#@. ]/g, '').trim();
}

function hashContent(parts: string[]): string {
  const norm = parts.map(normalizeForDedup).join('||');
  return createHash('sha1').update(norm).digest('hex').slice(0, 16);
}

function hasEnvCreds(cfg: AccountConfig): boolean {
  return Object.values(cfg.envKeys).every(k => !!process.env[k]);
}

function recentForAccount(account: AccountKey): PostRecord[] {
  return HISTORY.filter(r => r.account === account);
}

function postsLastDay(account: AccountKey): number {
  const cutoff = Date.now() - DAY_MS;
  return recentForAccount(account).filter(r => r.postedAt >= cutoff).length;
}

function lastPostAt(account: AccountKey): number | null {
  const arr = recentForAccount(account);
  return arr.length ? arr[arr.length - 1].postedAt : null;
}

export interface CanPostResult {
  ok: boolean;
  reason?: string;
  dryRunReason?: string;
}

/** Pre-flight check: cap, throttle, dedup, manual-only gate. */
export function canPost(
  account: AccountKey,
  contentParts: string[],
  opts: { approved?: boolean; bypassDedup?: boolean } = {}
): CanPostResult {
  const cfg = ACCOUNTS[account];
  if (!cfg) return { ok: false, reason: `unknown account ${account}` };

  if (cfg.manualOnly && !opts.approved) {
    return { ok: false, reason: 'personal account requires explicit approval (manualOnly)' };
  }

  if (postsLastDay(account) >= cfg.maxPostsPerDay) {
    return { ok: false, reason: `daily cap reached (${cfg.maxPostsPerDay}/24h)` };
  }

  const last = lastPostAt(account);
  if (last !== null) {
    const hoursSince = (Date.now() - last) / (60 * 60 * 1000);
    if (hoursSince < cfg.minHoursBetweenPosts) {
      const wait = (cfg.minHoursBetweenPosts - hoursSince).toFixed(1);
      return { ok: false, reason: `throttled — ${wait}h until next allowed post` };
    }
  }

  if (!opts.bypassDedup) {
    const h = hashContent(contentParts);
    const dup = recentForAccount(account)
      .slice(-DEDUP_WINDOW)
      .some(r => r.hash === h);
    if (dup) return { ok: false, reason: 'duplicate of a recent post (last 50)' };
  }

  const dryRunReason = hasEnvCreds(cfg) ? undefined : `missing env creds (${Object.values(cfg.envKeys).join(', ')})`;
  return { ok: true, dryRunReason };
}

export interface PublishResult {
  account: AccountKey;
  dryRun: boolean;
  ids: string[];
  preview: string;
  reason?: string;
}

async function postSingleTweet(
  cfg: AccountConfig,
  text: string,
  replyToId?: string
): Promise<{ id: string }> {
  // Lazy import twitter-api-v2 only if creds exist, so the package is optional.
  const { TwitterApi } = await import('twitter-api-v2').catch(() => {
    throw new Error('twitter-api-v2 not installed; run `npm i twitter-api-v2` and set the X env keys');
  }) as any;

  const client = new TwitterApi({
    appKey: process.env[cfg.envKeys.appKey]!,
    appSecret: process.env[cfg.envKeys.appSecret]!,
    accessToken: process.env[cfg.envKeys.accessToken]!,
    accessSecret: process.env[cfg.envKeys.accessSecret]!,
  });

  const payload: any = { text };
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
  const res = await client.v2.tweet(payload);
  return { id: res.data.id };
}

/**
 * Publish a single tweet. Honors all guardrails. Dry-run if creds missing.
 */
export async function publishTweet(
  account: AccountKey,
  text: string,
  opts: { approved?: boolean; bypassDedup?: boolean } = {}
): Promise<PublishResult> {
  const cfg = ACCOUNTS[account];
  const check = canPost(account, [text], opts);
  if (!check.ok) {
    return { account, dryRun: true, ids: [], preview: text.slice(0, 120), reason: check.reason };
  }

  const dryRun = !!check.dryRunReason;
  let ids: string[] = [];
  if (dryRun) {
    logger.info(`[X-PUBLISH][${cfg.label}] DRY-RUN (${check.dryRunReason}) — ${text.slice(0, 80)}…`);
  } else {
    const r = await postSingleTweet(cfg, text);
    ids = [r.id];
    logger.info(`[X-PUBLISH][${cfg.label}] posted id=${r.id}`);
  }

  HISTORY.push({
    account,
    hash: hashContent([text]),
    postedAt: Date.now(),
    ids,
    dryRun,
    preview: text.slice(0, 120),
  });
  return { account, dryRun, ids, preview: text.slice(0, 120) };
}

/**
 * Publish a thread (array of tweets). Counts as one post toward the daily cap.
 * Each tweet must be ≤280 chars; we enforce here so a typo'd 600-char tweet
 * doesn't get rejected mid-thread leaving a half-posted artifact.
 */
export async function publishThread(
  account: AccountKey,
  tweets: string[],
  opts: { approved?: boolean; bypassDedup?: boolean } = {}
): Promise<PublishResult> {
  const cfg = ACCOUNTS[account];
  if (!Array.isArray(tweets) || tweets.length === 0) {
    return { account, dryRun: true, ids: [], preview: '', reason: 'empty thread' };
  }
  const tooLong = tweets.findIndex(t => t.length > 280);
  if (tooLong >= 0) {
    return {
      account,
      dryRun: true,
      ids: [],
      preview: tweets[tooLong].slice(0, 120),
      reason: `tweet ${tooLong + 1}/${tweets.length} is ${tweets[tooLong].length} chars (>280)`,
    };
  }

  const check = canPost(account, tweets, opts);
  if (!check.ok) {
    return { account, dryRun: true, ids: [], preview: tweets[0].slice(0, 120), reason: check.reason };
  }

  const dryRun = !!check.dryRunReason;
  const ids: string[] = [];

  if (dryRun) {
    logger.info(`[X-PUBLISH][${cfg.label}] DRY-RUN thread (${check.dryRunReason}) — ${tweets.length} tweets`);
    tweets.forEach((t, i) => logger.info(`  ${i + 1}/${tweets.length} ${t.slice(0, 80)}…`));
  } else {
    let replyTo: string | undefined;
    for (const t of tweets) {
      const r = await postSingleTweet(cfg, t, replyTo);
      ids.push(r.id);
      replyTo = r.id;
    }
    logger.info(`[X-PUBLISH][${cfg.label}] posted thread root=${ids[0]} (${ids.length} tweets)`);
  }

  HISTORY.push({
    account,
    hash: hashContent(tweets),
    postedAt: Date.now(),
    ids,
    dryRun,
    preview: tweets[0].slice(0, 120),
  });
  return { account, dryRun, ids, preview: tweets[0].slice(0, 120) };
}

export interface AccountStatus {
  account: AccountKey;
  label: string;
  manualOnly: boolean;
  maxPostsPerDay: number;
  minHoursBetweenPosts: number;
  postsLast24h: number;
  lastPostAt: string | null;
  hoursUntilNextAllowed: number;
  dryRun: boolean;        // true = no creds wired up
  envKeysMissing: string[];
  recent: { postedAt: string; preview: string; ids: string[]; dryRun: boolean }[];
}

export function getPublisherStatus(): AccountStatus[] {
  return (Object.keys(ACCOUNTS) as AccountKey[]).map(key => {
    const cfg = ACCOUNTS[key];
    const last = lastPostAt(key);
    const missing = Object.values(cfg.envKeys).filter(k => !process.env[k]);
    const hoursSince = last ? (Date.now() - last) / (60 * 60 * 1000) : Infinity;
    const hoursUntilNext = Math.max(0, cfg.minHoursBetweenPosts - hoursSince);
    return {
      account: key,
      label: cfg.label,
      manualOnly: cfg.manualOnly,
      maxPostsPerDay: cfg.maxPostsPerDay,
      minHoursBetweenPosts: cfg.minHoursBetweenPosts,
      postsLast24h: postsLastDay(key),
      lastPostAt: last ? new Date(last).toISOString() : null,
      hoursUntilNextAllowed: Math.round(hoursUntilNext * 10) / 10,
      dryRun: missing.length > 0,
      envKeysMissing: missing,
      recent: recentForAccount(key)
        .slice(-10)
        .map(r => ({
          postedAt: new Date(r.postedAt).toISOString(),
          preview: r.preview,
          ids: r.ids,
          dryRun: r.dryRun,
        })),
    };
  });
}
