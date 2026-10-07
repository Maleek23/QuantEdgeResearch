/**
 * DISCORD LIFECYCLE — one idea = one Discord card, in the QuantEdge Labs server.
 * ==============================================================================
 *
 * Channels (env, set on prod):
 *   nexus     DISCORD_WEBHOOK_NEXUS_IDEAS     #nexus-trade-ideas
 *   0dte      DISCORD_WEBHOOK_0DTE_IDEAS      #0dte-ideas
 *   swing     DISCORD_WEBHOOK_SWING_IDEAS     #swing-ideas
 *   rotation  DISCORD_WEBHOOK_ROTATION_IDEAS  #sector-rotation
 *   bot       QUANT_BOT_DISCORD_WEBHOOK       #quantinum-bot (server/bot-discord-notifier.ts builds the payloads)
 *
 * Lifecycle of an idea (no new polling — every event arrives from code that
 * already detects it):
 *   PUBLISH   storage.createTradeIdea (every published row) and the board alert
 *             (signal-alerts.ts) → onIdeaPublished. 0DTE ideas: every one. Others:
 *             NEXUS grade A/B at publish. POST ?wait=true; the returned message id
 *             is persisted with the idea id.
 *   TRIGGER   oracle-lifecycle-reconciler observeTriggeredIdeas → onIdeaTriggered.
 *             PATCH the card (status + timeline) and post ONE short entry reply.
 *   RESOLVE   performance-validation-service (target / stop / time / expiry) and
 *             the reconciler (invalidated before trigger, horizon expiry) →
 *             onIdeaResolved. PATCH the card and post ONE short exit reply (no
 *             reply for an idea that never triggered and simply lapsed — the card
 *             edit and the recap carry it).
 *   RECAP     16:20 ET weekdays, one message per channel with activity today.
 *
 * Dedupe: strictly per (ideaId, event) — publish / trigger / resolve each happen
 * once per card, persisted (survives restarts). A publish is also deduped per
 * (ET day, thesis key) so a re-published row for the same contract never gets a
 * second card. Bot posts dedupe per (positionId, entry|exit) in the same store.
 *
 * Delivery: an outbox in the same persisted state. Every POST goes through
 * postDiscordWebhook (shared per-channel rate gate + disclaimer) with lane
 * 'labs' — the only lane allowed to reach these five webhooks. A gated send
 * (204) stays queued and is retried; when more than 5 replies would land in a
 * channel inside a minute they go out as ONE batched message. Edits (PATCH) do
 * not create a new message and are exempt from the rate gate.
 *
 * Honesty: every event line carries the ET time of the event itself (the bar
 * that hit, not the time the job ran) and a quote/data label; nothing here is
 * ever labelled live — the tracker reads delayed quotes and bar paths.
 *
 * Switches: DISCORD_LIFECYCLE=off disables all of it (default on). Per-channel
 * on/off lives in the persisted state and is set from /admin → System.
 * State file: <SHARED_STATE_DIR>/discord-lifecycle.json (server/lib/shared-state.ts).
 */
import { logger } from './logger';
import { readNexusRiskDollars, riskSizedFromPct } from '@shared/position-sizing';
import { readShared, writeSharedSync } from './lib/shared-state';

// ─── Channels & routing ─────────────────────────────────────────────────

export type LabsChannel = 'nexus' | '0dte' | 'swing' | 'rotation' | 'bot';
export const LABS_CHANNELS: Record<LabsChannel, { env: string; label: string }> = {
  nexus: { env: 'DISCORD_WEBHOOK_NEXUS_IDEAS', label: '#nexus-trade-ideas' },
  '0dte': { env: 'DISCORD_WEBHOOK_0DTE_IDEAS', label: '#0dte-ideas' },
  swing: { env: 'DISCORD_WEBHOOK_SWING_IDEAS', label: '#swing-ideas' },
  rotation: { env: 'DISCORD_WEBHOOK_ROTATION_IDEAS', label: '#sector-rotation' },
  bot: { env: 'QUANT_BOT_DISCORD_WEBHOOK', label: '#quantinum-bot' },
};
export const LABS_CHANNEL_KEYS = Object.keys(LABS_CHANNELS) as LabsChannel[];

type Env = Record<string, string | undefined>;

export function lifecycleEnabled(env: Env = process.env): boolean {
  const v = String(env.DISCORD_LIFECYCLE ?? 'on').trim().toLowerCase();
  return !['off', 'false', '0', 'no'].includes(v);
}

/** Webhook identity: no query, no /messages/… suffix, one host spelling. */
export function normalizeWebhookUrl(url: string): string {
  return String(url ?? '').trim()
    .replace(/[?#].*$/, '')
    .replace(/\/messages\/[^/]+$/, '')
    .replace(/\/+$/, '')
    .replace('discordapp.com', 'discord.com')
    .replace(/^https:\/\/(ptb|canary)\./, 'https://');
}

/** The five Labs webhooks (normalized). Only lane 'labs' may post to them. */
export function labsWebhookSet(env: Env = process.env): Set<string> {
  const out = new Set<string>();
  for (const k of LABS_CHANNEL_KEYS) {
    const v = env[LABS_CHANNELS[k].env];
    if (v && v.trim()) out.add(normalizeWebhookUrl(v));
  }
  return out;
}
export function isLabsWebhook(url: string, env: Env = process.env): boolean {
  return labsWebhookSet(env).has(normalizeWebhookUrl(url));
}

export function channelWebhook(ch: LabsChannel, env: Env = process.env): string | null {
  const v = String(env[LABS_CHANNELS[ch].env] ?? '').trim();
  return v || null;
}

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
export const etDayOf = (ms: number) => ET_DAY.format(new Date(ms));
export const etHm = (ms: number) => `${ET_HM.format(new Date(ms)).replace(/^24:/, '00:')} ET`;

export interface IdeaLike {
  id?: string | null;
  symbol: string;
  direction?: string | null;
  assetType?: string | null;
  source?: string | null;
  holdingPeriod?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPrice?: number | null;
  targetPrice?: number | null;
  stopLoss?: number | null;
  entryPremium?: number | null;
  analysis?: string | null;
  catalyst?: string | null;
  timestamp?: string | null;
  status?: string | null;
  outcomeStatus?: string | null;
  dataSourceUsed?: string | null;
  [k: string]: unknown;
}

const ZERO_DTE_SOURCES = ['orb_scanner', 'spx_session', 'index_scalp', 'index-scalp', 'zero_dte_desk', 'zero_dte_flow'];

/** 0–1 DTE option, a 0DTE engine, or SPX itself. */
export function isZeroDteIdea(idea: IdeaLike, nowMs: number = Date.now()): boolean {
  const src = String(idea.source || '');
  if (ZERO_DTE_SOURCES.includes(src)) return true;
  if (String(idea.dataSourceUsed || '').startsWith('GEX_index_scalp')) return true;
  const exp = idea.expiryDate;
  if (String(idea.assetType || '') === 'option' && exp) {
    const days = (Date.parse(String(exp).slice(0, 10)) - Date.parse(etDayOf(nowMs))) / 86_400_000;
    if (Number.isFinite(days) && days <= 1) return true;
  }
  return ['SPX', 'SPXW'].includes(String(idea.symbol));
}

/** Which Labs idea channel an idea belongs to (env-independent). */
export function ideaChannel(idea: IdeaLike, nowMs: number = Date.now()): Exclude<LabsChannel, 'bot'> {
  if (isZeroDteIdea(idea, nowMs)) return '0dte';
  const src = String(idea.source || '');
  if (['sector_rotation', 'sector_ignition', 'leaders'].includes(src)) return 'rotation';
  const hold = String(idea.holdingPeriod || '').toLowerCase();
  if (hold === 'swing' || hold === 'position') return 'swing';
  return 'nexus';
}

/** The configured Labs webhook for an idea, or undefined (falls through to the specific → NEXUS channel). */
export function labsIdeaWebhook(idea: IdeaLike, env: Env = process.env): string | undefined {
  const ch = ideaChannel(idea);
  return channelWebhook(ch, env) ?? (ch === '0dte' ? undefined : channelWebhook('nexus', env)) ?? undefined;
}

// ─── Persisted state ────────────────────────────────────────────────────

export type CardStatus = 'published' | 'triggered' | 'win' | 'loss' | 'time' | 'expired' | 'invalidated';
export interface CardEvent { kind: 'publish' | 'trigger' | 'resolve'; at: number; line: string }
export interface Card {
  ideaId: string;
  channel: Exclude<LabsChannel, 'bot'>;
  day: string;
  thesisKey: string;
  symbol: string;
  label: string;
  direction: string;
  isOption: boolean;
  isPut: boolean;
  plan: { entry: number | null; target: number | null; stop: number | null; premium: number | null; expiry: string | null };
  grade: string | null;
  thesis: string;
  source: string;
  publishedAt: number;
  status: CardStatus;
  statusLine: string;
  verified: boolean | null;
  events: CardEvent[];
  messageId: string | null;
  channelId: string | null;
  guildId: string | null;
  postFailed?: boolean;
  /** Exit $ at the NEXUS risk size (shared/position-sizing.ts riskSizedFromPct; NEXUS_RISK_DOLLARS, default $500). */
  riskPnl?: number | null;
  riskDollars?: number;
}
export interface BotRecord { positionId: string; day: string; entryAt?: number; exitAt?: number; label: string; pnl?: number | null; pct?: number | null; reason?: string | null }
export type OutboxKind = 'card' | 'edit' | 'reply' | 'recap' | 'bot' | 'digest';
export interface OutboxItem {
  id: string;
  channel: LabsChannel;
  kind: OutboxKind;
  ideaId?: string;
  /** reply / recap / bot: the message body. card / edit: built from the card at send time. */
  body?: Record<string, unknown>;
  /** One-line form of a reply, used when replies are batched. */
  line?: string;
  createdAt: number;
  nextAt: number;
  attempts: number;
}
export interface LifecycleState {
  version: 1;
  cards: Record<string, Card>;
  thesis: Record<string, string>;
  bot: Record<string, BotRecord>;
  outbox: OutboxItem[];
  toggles: Partial<Record<LabsChannel, boolean>>;
  recaps: Record<string, number>;
  /** Cap overflow waiting for its channel's one digest post. */
  overflow: Partial<Record<LabsChannel, Array<{ ideaId: string; label: string; direction: string; grade: string | null; at: number }>>>;
  /** When each card was queued (cap accounting). */
  carded: Partial<Record<LabsChannel, number[]>>;
  meta: Partial<Record<LabsChannel, { guildId: string | null; channelId: string | null; url: string }>>;
  sends: Partial<Record<LabsChannel, number[]>>;
  lastError: { at: number; channel: string; message: string } | null;
}

const STATE_NAME = 'discord-lifecycle';
const freshState = (): LifecycleState => ({ version: 1, cards: {}, thesis: {}, bot: {}, outbox: [], toggles: {}, recaps: {}, overflow: {}, carded: {}, meta: {}, sends: {}, lastError: null });

export type Poster = (url: string, init: RequestInit, opts?: { lane?: 'labs' }) => Promise<Response>;
type Http = (url: string, init?: RequestInit) => Promise<Response>;

let memoryState: LifecycleState | null = null; // test mode: never touches disk
let testPoster: Poster | null = null;
let testHttp: Http | null = null;
let testNow: (() => number) | null = null;
let testMode = false;

const now = () => (testNow ? testNow() : Date.now());

function load(): LifecycleState {
  if (testMode) return (memoryState ??= freshState());
  const r = readShared<LifecycleState>(STATE_NAME);
  const s = r?.data && (r.data as any).version === 1 ? r.data : freshState();
  for (const k of Object.keys(freshState()) as (keyof LifecycleState)[]) if ((s as any)[k] == null) (s as any)[k] = (freshState() as any)[k];
  return s;
}
function save(s: LifecycleState): void {
  prune(s);
  if (testMode) { memoryState = s; return; }
  if (!writeSharedSync(STATE_NAME, s)) logger.warn('[DISCORD-LIFECYCLE] state write failed');
}

const DAY_MS = 86_400_000;
function prune(s: LifecycleState): void {
  const t = now();
  for (const [id, c] of Object.entries(s.cards)) {
    const resolved = !['published', 'triggered'].includes(c.status);
    const age = t - c.publishedAt;
    if ((resolved && age > 4 * DAY_MS) || age > 60 * DAY_MS) delete s.cards[id];
  }
  const ids = Object.keys(s.cards);
  if (ids.length > 2500) ids.sort((a, b) => s.cards[a].publishedAt - s.cards[b].publishedAt).slice(0, ids.length - 2500).forEach((id) => delete s.cards[id]);
  for (const k of Object.keys(s.thesis)) if (k.slice(0, 10) < etDayOf(t - 2 * DAY_MS)) delete s.thesis[k];
  for (const [k, b] of Object.entries(s.bot)) if (b.day < etDayOf(t - 8 * DAY_MS)) delete s.bot[k];
  for (const k of Object.keys(s.recaps)) if (k.slice(0, 10) < etDayOf(t - 10 * DAY_MS)) delete s.recaps[k];
  for (const k of Object.keys(s.sends) as LabsChannel[]) s.sends[k] = (s.sends[k] ?? []).filter((x) => t - x < 120_000);
  s.outbox = s.outbox.filter((o) => t - o.createdAt < 2 * DAY_MS);
  for (const k of Object.keys(s.carded) as LabsChannel[]) s.carded[k] = (s.carded[k] ?? []).filter((x) => t - x < DAY_MS);
  for (const k of Object.keys(s.overflow) as LabsChannel[]) s.overflow[k] = (s.overflow[k] ?? []).filter((x) => t - x.at < DAY_MS);
}

export function channelEnabled(ch: LabsChannel, s: LifecycleState = load()): boolean {
  return s.toggles[ch] !== false;
}
export function setChannelEnabled(ch: LabsChannel, on: boolean): void {
  const s = load();
  s.toggles[ch] = on;
  if (!on) s.outbox = s.outbox.filter((o) => o.channel !== ch); // nothing stale bursts out when it is turned back on
  save(s);
}

let seq = 0;
const newId = () => `${now().toString(36)}-${(seq++).toString(36)}`;

function enqueue(s: LifecycleState, item: Omit<OutboxItem, 'id' | 'createdAt' | 'nextAt' | 'attempts'>): void {
  if (item.kind === 'edit') {
    // Edits coalesce: the card is rebuilt from state at send time, so one pending edit is enough.
    if (s.outbox.some((o) => o.kind === 'edit' && o.ideaId === item.ideaId)) return;
    // A card not yet posted will be posted with the current state — no edit needed.
    if (s.outbox.some((o) => o.kind === 'card' && o.ideaId === item.ideaId)) return;
  }
  const t = now();
  s.outbox.push({ ...item, id: newId(), createdAt: t, nextAt: t, attempts: 0 });
}

// ─── Formatting ─────────────────────────────────────────────────────────

const fmtStrike = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const money = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : `$${x >= 1000 ? x.toFixed(0) : x.toFixed(2)}`);
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(Math.abs(x) >= 10 ? 0 : 1)}%`;

export function ideaLabel(i: IdeaLike, nowMs: number = Date.now()): string {
  if (String(i.assetType) !== 'option' || !i.optionType || i.strikePrice == null) return String(i.symbol).toUpperCase();
  const cp = String(i.optionType).toLowerCase().startsWith('p') ? 'P' : 'C';
  let dte = '';
  if (i.expiryDate) {
    const d = Math.round((Date.parse(`${String(i.expiryDate).slice(0, 10)}T12:00:00Z`) - Date.parse(`${etDayOf(nowMs)}T12:00:00Z`)) / DAY_MS);
    if (Number.isFinite(d)) dte = d <= 0 ? ' 0DTE' : d <= 7 ? ` ${d}DTE` : ` ${String(i.expiryDate).slice(5, 10)}`;
  }
  return `${String(i.symbol).toUpperCase()} ${fmtStrike(Number(i.strikePrice))}${cp}${dte}`;
}

const CHANNEL_TAG: Record<Exclude<LabsChannel, 'bot'>, string> = { nexus: 'NEXUS', '0dte': '0DTE', swing: 'SWING', rotation: 'ROTATION' };
const STATUS_COLOR: Record<CardStatus, number> = {
  published: 0x2f80ed, triggered: 0xf2a33a, win: 0x22c55e, loss: 0xef4444, time: 0x94a3b8, expired: 0x64748b, invalidated: 0x64748b,
};
const STATUS_ICON: Record<CardStatus, string> = { published: '⏳', triggered: '▶️', win: '✅', loss: '🛑', time: '⏱️', expired: '⌛', invalidated: '⛔' };
const DATA_LABEL = 'Delayed quotes & bar paths — never live. Times are when the level traded (bar start), not when the tracker ran.';

export function messageLink(c: Pick<Card, 'guildId' | 'channelId' | 'messageId'>): string | null {
  return c.guildId && c.channelId && c.messageId ? `https://discord.com/channels/${c.guildId}/${c.channelId}/${c.messageId}` : null;
}

export function buildCardPayload(c: Card): Record<string, unknown> {
  const sideWord = c.isOption ? (c.isPut ? 'BUY PUT' : 'BUY CALL') : c.direction.toUpperCase();
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Status', value: `${STATUS_ICON[c.status]} ${c.statusLine}`.slice(0, 1024), inline: false },
    { name: 'Plan (underlying)', value: `Entry ${money(c.plan.entry)} · Target ${money(c.plan.target)} · Stop ${money(c.plan.stop)}`, inline: false },
  ];
  if (c.isOption) {
    fields.push({ name: 'Contract', value: `${c.label}${c.plan.expiry ? ` · exp ${c.plan.expiry}` : ''}${c.plan.premium != null ? ` · ${money(c.plan.premium)} premium at publish ${etHm(c.publishedAt)} (publish-time quote, not live)` : ''}`.slice(0, 1024), inline: false });
  }
  if (c.grade) fields.push({ name: 'NEXUS grade', value: `${c.grade} at publish · actionability score, not a win probability`, inline: true });
  fields.push({ name: 'Timeline', value: c.events.map((e) => e.line).join('\n').slice(0, 1024) || '—', inline: false });
  fields.push({ name: 'Data', value: DATA_LABEL, inline: false });
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${CHANNEL_TAG[c.channel]} · ${c.label} · ${sideWord}`.slice(0, 256),
      description: c.thesis ? c.thesis.slice(0, 600) : undefined,
      color: STATUS_COLOR[c.status],
      fields,
      footer: { text: `idea ${c.ideaId.slice(0, 8)} · ${c.source || 'nexus'}` },
      timestamp: new Date(c.publishedAt).toISOString(),
    }],
  };
}

function replyBody(line: string): Record<string, unknown> {
  return { content: line.slice(0, 1900), allowed_mentions: { parse: [] } };
}
function refTo(c: Card): string {
  const link = messageLink(c);
  return link ? ` · [card](${link})` : ` · re: card ${etHm(c.publishedAt)}`;
}

// ─── Publish ────────────────────────────────────────────────────────────

export interface PublishOpts {
  /** Grade already computed by the caller (board pick); else graded from the row at publish. */
  grade?: { letter: string; score: number } | null;
  nowMs?: number;
}
export type PublishResult = 'queued' | 'capped' | 'off' | 'channel_off' | 'no_webhook' | 'duplicate' | 'below_grade' | 'not_published' | 'no_id';

/**
 * Per-channel card caps for the graded channels (nexus / swing / rotation). A burst
 * (e.g. 20 market_scanner rows at 10:14) becomes at most CAP_PER_HOUR cards; the
 * rest are listed in ONE digest post per channel. #0dte-ideas is uncapped: every
 * 0DTE idea gets its card (the outbox + batching pace the delivery).
 * Env: DISCORD_LABS_CAP_PER_HOUR (default 8), DISCORD_LABS_CAP_PER_DAY (default 25).
 */
export function cardCaps(env: Env = process.env): { perHour: number; perDay: number } {
  const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.floor(x) : d; };
  return { perHour: n(env.DISCORD_LABS_CAP_PER_HOUR, 8), perDay: n(env.DISCORD_LABS_CAP_PER_DAY, 25) };
}
const DIGEST_DELAY_MS = 10 * 60_000;

function logPublish(i: IdeaLike, ch: string, result: PublishResult, why = ''): PublishResult {
  const line = `[DISCORD-LIFECYCLE] publish ${i?.symbol ?? '?'} ${i?.source ?? ''} ${String(i?.id ?? '').slice(0, 8)} → ${ch}: ${result}${why ? ` (${why})` : ''}`;
  logger.info(line);
  return result;
}

export function thesisKeyOf(i: IdeaLike): string {
  const parts = [String(i.symbol).toUpperCase(), String(i.direction ?? 'long')];
  if (i.optionType) { parts.push(String(i.optionType).toLowerCase()); if (i.strikePrice != null) parts.push(String(Math.round(Number(i.strikePrice) * 100))); if (i.expiryDate) parts.push(String(i.expiryDate).slice(0, 10)); }
  else parts.push('stock');
  return parts.join('|');
}

async function gradeAtPublish(i: IdeaLike): Promise<{ letter: string; score: number } | null> {
  try {
    const nexus = (i as any).nexusGrade;
    if (nexus?.letter) return { letter: String(nexus.letter), score: Number(nexus.score) };
    const { gradeIdeaRowAtPublish } = await import('@shared/nexus-grade');
    const g = gradeIdeaRowAtPublish(i as any);
    return g ? { letter: g.letter, score: g.score } : null;
  } catch { return null; }
}

/** Decide + queue the card for a just-published idea. Never throws. */
export async function onIdeaPublished(i: IdeaLike, opts: PublishOpts = {}): Promise<PublishResult> {
  let ch = '?';
  try {
    if (!lifecycleEnabled()) return logPublish(i, ch, 'off', 'DISCORD_LIFECYCLE=off');
    if (!i?.id) return logPublish(i, ch, 'no_id');
    if (i.status === 'draft' || i.status === 'archived') return logPublish(i, ch, 'not_published', String(i.status));
    if (i.outcomeStatus && i.outcomeStatus !== 'open') return logPublish(i, ch, 'not_published', String(i.outcomeStatus));
    const t = opts.nowMs ?? now();
    const channel = ideaChannel(i, t);
    ch = channel;
    const s0 = load();
    if (!channelWebhook(channel)) return logPublish(i, ch, 'no_webhook', `${LABS_CHANNELS[channel].env} unset`);
    if (!channelEnabled(channel, s0)) return logPublish(i, ch, 'channel_off', 'admin toggle');
    if (s0.cards[String(i.id)]) return logPublish(i, ch, 'duplicate', 'card exists for this idea');
    const key = `${etDayOf(t)}|${thesisKeyOf(i)}`;
    if (s0.thesis[key]) return logPublish(i, ch, 'duplicate', `same thesis already carded today (${s0.thesis[key].slice(0, 8)})`);
    const grade = opts.grade ?? (await gradeAtPublish(i));
    if (channel !== '0dte' && !(grade && ['A', 'B'].includes(grade.letter))) return logPublish(i, ch, 'below_grade', grade ? `${grade.letter} ${Math.round(grade.score)}` : 'ungraded');

    const s = load(); // re-read after the await
    if (s.cards[String(i.id)] || s.thesis[key]) return logPublish(i, ch, 'duplicate', 'raced');
    const label = ideaLabel(i, t);
    s.thesis[key] = String(i.id);

    if (channel !== '0dte') {
      const caps = cardCaps();
      const carded = (s.carded[channel] ?? []).filter((x) => t - x < DAY_MS);
      const lastHour = carded.filter((x) => t - x < 3_600_000).length;
      const today = carded.filter((x) => etDayOf(x) === etDayOf(t)).length;
      if (lastHour >= caps.perHour || today >= caps.perDay) {
        const list = (s.overflow[channel] ??= []);
        list.push({ ideaId: String(i.id), label, direction: String(i.direction ?? 'long'), grade: grade ? `${grade.letter} ${Math.round(grade.score)}` : null, at: t });
        if (!s.outbox.some((o) => o.kind === 'digest' && o.channel === channel)) {
          enqueue(s, { channel, kind: 'digest' });
          s.outbox[s.outbox.length - 1].nextAt = t + DIGEST_DELAY_MS;
        }
        save(s);
        return logPublish(i, ch, 'capped', `${lastHour}/${caps.perHour} this hour, ${today}/${caps.perDay} today → digest`);
      }
      s.carded[channel] = [...carded, t];
    }

    const publishedAt = Number.isFinite(Date.parse(String(i.timestamp ?? ''))) ? Math.min(Date.parse(String(i.timestamp)), t) : t;
    const card: Card = {
      ideaId: String(i.id), channel, day: etDayOf(t), thesisKey: thesisKeyOf(i), symbol: String(i.symbol).toUpperCase(), label,
      direction: String(i.direction ?? 'long'), isOption: String(i.assetType) === 'option' && !!i.optionType,
      isPut: String(i.optionType ?? '').toLowerCase().startsWith('p'),
      plan: { entry: num(i.entryPrice), target: num(i.targetPrice), stop: num(i.stopLoss), premium: num(i.entryPremium), expiry: i.expiryDate ? String(i.expiryDate).slice(0, 10) : null },
      grade: grade ? `${grade.letter} ${Math.round(grade.score)}` : null,
      thesis: String(i.analysis ?? i.catalyst ?? '').replace(/\s+/g, ' ').trim(),
      source: String(i.source ?? ''),
      publishedAt, status: 'published', statusLine: 'Published — waiting for the entry trigger', verified: null,
      events: [{ kind: 'publish', at: publishedAt, line: `${etHm(publishedAt)} published` }],
      messageId: null, channelId: null, guildId: null,
    };
    s.cards[card.ideaId] = card;
    enqueue(s, { channel, kind: 'card', ideaId: card.ideaId });
    save(s);
    kick();
    return logPublish(i, ch, 'queued', card.grade ?? '0DTE');
  } catch (e: any) {
    logger.warn(`[DISCORD-LIFECYCLE] publish ${i?.symbol}: ${e?.message ?? e}`);
    return 'off';
  }
}

/** The one digest post for a channel's capped overflow (built at send time, then cleared). */
export function buildDigest(s: LifecycleState, ch: LabsChannel, nowMs: number): Record<string, unknown> | null {
  const list = s.overflow[ch] ?? [];
  if (!list.length) return null;
  const lines = list.slice(0, 25).map((o) => `• ${o.label} ${o.direction.toUpperCase()}${o.grade ? ` · ${o.grade}` : ''} · published ${etHm(o.at)}`);
  const more = list.length > 25 ? `\n…and ${list.length - 25} more on the NEXUS board` : '';
  const caps = cardCaps();
  return replyBody(`🗂️ **Also published (${list.length})** — over this channel's card cap (${caps.perHour}/hour, ${caps.perDay}/day); no individual cards or updates for these:\n${lines.join('\n')}${more}`);
}
const num = (x: unknown) => { const n = Number(x); return x == null || !Number.isFinite(n) ? null : n; };

// ─── Trigger ────────────────────────────────────────────────────────────

export interface TriggerEvent {
  ideaId: string;
  /** When the trigger level traded: bar start (interval precision) or the poll time. */
  observedAt: string | number;
  observedPrice?: number | null;
  triggerPrice?: number | null;
  /** '5m' / '1d' bar path, or 'poll' when no bar path was available. */
  basis?: string | null;
}
export type EventResult = 'queued' | 'off' | 'no_card' | 'duplicate' | 'already_resolved';

export async function onIdeaTriggered(ev: TriggerEvent): Promise<EventResult> {
  try {
    if (!lifecycleEnabled()) return 'off';
    const s = load();
    const c = s.cards[String(ev.ideaId)];
    if (!c) return 'no_card';
    if (c.events.some((e) => e.kind === 'trigger')) return 'duplicate';
    if (c.events.some((e) => e.kind === 'resolve')) return 'already_resolved';
    const at = typeof ev.observedAt === 'number' ? ev.observedAt : Date.parse(String(ev.observedAt));
    const atMs = Number.isFinite(at) ? at : now();
    const px = num(ev.observedPrice) ?? num(ev.triggerPrice) ?? c.plan.entry;
    const basis = ev.basis === 'poll' || !ev.basis ? 'observed by poll, no bar path' : `${ev.basis} bar start`;
    const line = `${etHm(atMs)} triggered · ${money(px)} traded (${basis}, delayed data)`;
    c.events.push({ kind: 'trigger', at: atMs, line });
    c.status = 'triggered';
    c.statusLine = `Triggered ${etHm(atMs)} · entry ${money(px)} traded — now tracking target ${money(c.plan.target)} / stop ${money(c.plan.stop)}`;
    enqueue(s, { channel: c.channel, kind: 'edit', ideaId: c.ideaId });
    const reply = `▶️ **ENTRY** · ${c.label} ${c.isOption ? '' : c.direction.toUpperCase() + ' '}· trigger ${money(px)} traded ${etHm(atMs)} (${basis}, delayed data)`.replace(/\s+·/g, ' ·');
    enqueue(s, { channel: c.channel, kind: 'reply', ideaId: c.ideaId, line: reply });
    save(s);
    kick();
    return 'queued';
  } catch (e: any) {
    logger.warn(`[DISCORD-LIFECYCLE] trigger ${ev?.ideaId}: ${e?.message ?? e}`);
    return 'off';
  }
}

// ─── Resolution ─────────────────────────────────────────────────────────

export interface ResolveEvent {
  ideaId: string;
  outcomeStatus: 'hit_target' | 'hit_stop' | 'expired' | string;
  resolutionReason?: string | null;
  exitDate?: string | null;
  /** 'bar_hit' = verified from the bar path; 'live' / 'deadline' / unknown = unverified time. */
  exitTimeSource?: string | null;
  exitPrice?: number | null;
  percentGain?: number | null;
  optionPercentGain?: number | null;
  /** touch_bar | intrinsic | pass | withheld */
  optionPremiumBasis?: string | null;
}

export function classifyResolution(ev: Pick<ResolveEvent, 'outcomeStatus' | 'resolutionReason'>): { status: CardStatus; word: string; icon: string } {
  const r = String(ev.resolutionReason ?? '');
  if (ev.outcomeStatus === 'hit_target') return { status: 'win', word: 'TARGET HIT', icon: '✅' };
  if (ev.outcomeStatus === 'hit_stop') return { status: 'loss', word: 'STOP HIT', icon: '🛑' };
  if (r === 'auto_time_stop') return { status: 'time', word: 'TIME EXIT', icon: '⏱️' };
  if (r.startsWith('missed_entry_invalidated')) return { status: 'invalidated', word: 'INVALIDATED BEFORE TRIGGER', icon: '⛔' };
  if (r.startsWith('missed_entry')) return { status: 'expired', word: 'EXPIRED UNTRIGGERED', icon: '⌛' };
  if (r.startsWith('option_expiry')) return { status: 'time', word: 'HELD TO EXPIRY', icon: '⌛' };
  if (r === 'horizon_expiry') return { status: 'expired', word: 'HORIZON EXPIRED', icon: '⌛' };
  return { status: 'expired', word: 'EXPIRED', icon: '⌛' };
}

/** Only a triggered idea (or a decided one) has a position to put $ on. */
function triggeredOrDecided(c: Card, status: CardStatus): boolean {
  return c.events.some((e) => e.kind === 'trigger') || status === 'win' || status === 'loss';
}

export async function onIdeaResolved(ev: ResolveEvent): Promise<EventResult> {
  try {
    if (!lifecycleEnabled()) return 'off';
    if (!ev?.ideaId || !ev.outcomeStatus || ev.outcomeStatus === 'open') return 'no_card';
    const s = load();
    const c = s.cards[String(ev.ideaId)];
    if (!c) return 'no_card';
    if (c.events.some((e) => e.kind === 'resolve')) return 'duplicate';
    const cls = classifyResolution(ev);
    const parsed = Date.parse(String(ev.exitDate ?? ''));
    const atMs = Number.isFinite(parsed) ? parsed : now();
    const verified = ev.exitTimeSource === 'bar_hit';
    const timeTag = ev.exitTimeSource === 'bar_hit' ? 'bar hit' : ev.exitTimeSource === 'deadline' ? 'at deadline' : 'observed — hit time unverified';
    const optPct = num(ev.optionPercentGain);
    const undPct = num(ev.percentGain);
    const pctParts: string[] = [];
    if (c.isOption && optPct != null) pctParts.push(`${signedPct(optPct)} option (${ev.optionPremiumBasis === 'intrinsic' ? 'expiry intrinsic' : 'modeled from the contract bar'}, delayed quote)`);
    if (undPct != null) pctParts.push(`${signedPct(undPct)} underlying`);
    // $ at the NEXUS risk size (default $500/trade): no exit post shows a loss larger than the budget.
    const riskDollars = readNexusRiskDollars(process.env);
    const sized = triggeredOrDecided(c, cls.status) ? riskSizedFromPct({
      isOption: c.isOption, entry: c.plan.entry, stop: c.plan.stop, premium: c.plan.premium,
      zeroDte: !!c.plan.expiry && String(c.plan.expiry).slice(0, 10) === etDayOf(c.publishedAt),
      underlyingPct: undPct, optionPct: optPct,
    }, riskDollars) : null;
    c.riskPnl = sized?.pnl ?? null;
    c.riskDollars = riskDollars;
    if (sized) pctParts.unshift(`${sized.pnl >= 0 ? '+' : '−'}$${Math.abs(sized.pnl).toFixed(0)} at $${riskDollars} risk${sized.scaled ? ' (scaled)' : ''}${sized.capped ? ' (capped at stop)' : ''}`);
    const pct = pctParts.length ? pctParts.join(' / ') : 'P&L not measured';
    const triggered = c.events.some((e) => e.kind === 'trigger');
    const line = `${etHm(atMs)} ${cls.word.toLowerCase()}${ev.exitPrice != null ? ` @ ${money(num(ev.exitPrice))}` : ''} · ${pct} (${timeTag})`;
    c.events.push({ kind: 'resolve', at: atMs, line });
    c.status = cls.status;
    c.verified = verified;
    c.statusLine = `${cls.word} ${etHm(atMs)} · ${pct} · ${verified ? 'verified on the bar path' : 'unverified hit time'}`;
    enqueue(s, { channel: c.channel, kind: 'edit', ideaId: c.ideaId });
    // An idea that never triggered and simply lapsed gets the card edit (and the recap), not a reply.
    const wantsReply = triggered || cls.status === 'win' || cls.status === 'loss' || cls.status === 'time';
    if (wantsReply) {
      const reply = `${cls.icon} **${cls.word}** · ${c.label} · ${etHm(atMs)} · ${pct} (${timeTag})`;
      enqueue(s, { channel: c.channel, kind: 'reply', ideaId: c.ideaId, line: reply });
    }
    save(s);
    kick();
    return 'queued';
  } catch (e: any) {
    logger.warn(`[DISCORD-LIFECYCLE] resolve ${ev?.ideaId}: ${e?.message ?? e}`);
    return 'off';
  }
}

// ─── Bot (Quantinum Bot channel) ────────────────────────────────────────

export type BotSendResult = 'sent' | 'off' | 'refused' | 'duplicate' | 'gated' | 'failed';

/**
 * One entry and one exit per position, deduped in the persisted store. The URL
 * is resolved by the bot notifier (it refuses a webhook shared with any other
 * channel). Tries once immediately; a gated or failed send stays in the outbox.
 */
export async function sendBotEvent(
  url: string, positionId: string, kind: 'entry' | 'exit', payload: Record<string, unknown>,
  summary: { label: string; pnl?: number | null; pct?: number | null; reason?: string | null; at?: number },
): Promise<BotSendResult> {
  if (!lifecycleEnabled()) return 'off';
  const s = load();
  if (!channelEnabled('bot', s)) return 'off';
  const t = summary.at ?? now();
  const rec = s.bot[positionId] ?? { positionId, day: etDayOf(t), label: summary.label };
  if (kind === 'entry' ? rec.entryAt != null : rec.exitAt != null) return 'duplicate';
  if (kind === 'entry') rec.entryAt = t; else { rec.exitAt = t; rec.pnl = summary.pnl ?? null; rec.pct = summary.pct ?? null; rec.reason = summary.reason ?? null; }
  s.bot[positionId] = rec;
  save(s);
  const r = await deliver(url, 'bot', 'POST', payload);
  if (r.ok) return 'sent';
  // Keep it for the outbox: a gated / failed bot post is retried, never re-announced.
  const s2 = load();
  enqueue(s2, { channel: 'bot', kind: 'bot', body: payload });
  const last = s2.outbox[s2.outbox.length - 1];
  last.attempts = 1; last.nextAt = now() + (r.retryAfterMs ?? 60_000);
  save(s2);
  return r.gated ? 'gated' : 'failed';
}

// ─── Delivery / outbox ──────────────────────────────────────────────────

interface DeliverResult { ok: boolean; gated: boolean; status: number; json: any; retryAfterMs: number | null }

const lastPostAt = new Map<LabsChannel, number>();
async function deliver(url: string, ch: LabsChannel, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<DeliverResult> {
  const post: Poster = testPoster ?? (async (u, init, o) => (await import('./discord-service')).postDiscordWebhook(u, init, o));
  // Every POST asks Discord to answer with the message (?wait=true → 200 + JSON), so a 204
  // can only mean the shared gate in postDiscordWebhook suppressed it: not sent, retry later.
  const target = method === 'POST' ? `${url}${url.includes('?') ? '&' : '?'}wait=true` : url;
  if (method === 'POST' && !testPoster) {
    // Pace POSTs ≥ 1.1 s apart per channel so the shared gate's 1 s spacing never bounces a burst.
    const wait = 1_100 - (Date.now() - (lastPostAt.get(ch) ?? 0));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastPostAt.set(ch, Date.now());
  }
  try {
    const res = await post(target, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { lane: 'labs' });
    if (res.status === 204 && method === 'POST') return { ok: false, gated: true, status: 204, json: null, retryAfterMs: 20_000 };
    let json: any = null;
    try { json = res.status !== 204 ? await res.json() : null; } catch { json = null; }
    if (res.ok) {
      if (method === 'POST') { const s = load(); (s.sends[ch] ??= []).push(now()); save(s); }
      return { ok: true, gated: false, status: res.status, json, retryAfterMs: null };
    }
    const retryAfterMs = res.status === 429 ? Math.max(1_000, Math.round(Number(json?.retry_after ?? 5) * 1000)) : null;
    noteError(ch, `HTTP ${res.status}${json?.message ? ` ${json.message}` : ''}`);
    return { ok: false, gated: false, status: res.status, json, retryAfterMs };
  } catch (e: any) {
    noteError(ch, e?.message ?? String(e));
    return { ok: false, gated: false, status: 0, json: null, retryAfterMs: null };
  }
}
function noteError(ch: string, message: string): void {
  logger.warn(`[DISCORD-LIFECYCLE] ${ch}: ${message}`);
  try { const s = load(); s.lastError = { at: now(), channel: ch, message: message.slice(0, 300) }; save(s); } catch { /* ignore */ }
}

/** guild/channel for message links: from the ?wait reply, else one GET of the webhook object. */
async function channelMeta(ch: LabsChannel, url: string, fromMessage: any): Promise<{ guildId: string | null; channelId: string | null }> {
  const s = load();
  const cached = s.meta[ch];
  if (cached && cached.url === normalizeWebhookUrl(url) && cached.guildId) return cached;
  let guildId: string | null = fromMessage?.guild_id ?? null;
  let channelId: string | null = fromMessage?.channel_id ?? null;
  if (!guildId) {
    try {
      const http: Http = testHttp ?? ((u, i) => fetch(u, i));
      const r = await http(normalizeWebhookUrl(url), { method: 'GET' });
      if (r.ok) { const j: any = await r.json(); guildId = j?.guild_id ?? null; channelId = channelId ?? j?.channel_id ?? null; }
    } catch { /* links fall back to "re: card HH:MM" */ }
  }
  const s2 = load();
  s2.meta[ch] = { guildId, channelId, url: normalizeWebhookUrl(url) };
  save(s2);
  return { guildId, channelId };
}

const MAX_ATTEMPTS = 6;
const BATCH_PER_MIN = 5;
let flushing: Promise<{ sent: number; deferred: number; dropped: number }> | null = null;
let kickTimer: ReturnType<typeof setTimeout> | null = null;

/** Flush soon (coalesces bursts: a publish wave becomes one pass). */
function kick(): void {
  if (testMode || testPoster || kickTimer) return;
  kickTimer = setTimeout(() => { kickTimer = null; void flushOutbox().catch(() => {}); }, 1_500);
  kickTimer.unref?.();
}

export function flushOutbox(): Promise<{ sent: number; deferred: number; dropped: number }> {
  if (flushing) return flushing;
  flushing = flushOnce().finally(() => { flushing = null; });
  return flushing;
}

async function flushOnce(): Promise<{ sent: number; deferred: number; dropped: number }> {
  let sent = 0, deferred = 0, dropped = 0;
  const on = lifecycleEnabled();
  const s0 = load();
  if (!on) { if (s0.outbox.length) { dropped = s0.outbox.length; s0.outbox = []; save(s0); } return { sent, deferred, dropped }; }
  const t = now();
  const byChannel = new Map<LabsChannel, OutboxItem[]>();
  for (const o of s0.outbox) { if (!byChannel.has(o.channel)) byChannel.set(o.channel, []); byChannel.get(o.channel)!.push(o); }

  for (const [ch, items] of byChannel) {
    const url = channelWebhook(ch);
    const st = load();
    if (!url || !channelEnabled(ch, st)) {
      st.outbox = st.outbox.filter((o) => o.channel !== ch);
      save(st); dropped += items.length; continue;
    }
    let postsBlocked = false;
    const due = items.filter((o) => o.nextAt <= t).sort((a, b) => a.createdAt - b.createdAt);

    // Batch: more than 5 replies inside a minute → one message.
    const replies = due.filter((o) => o.kind === 'reply' && replyReady(st, o));
    const recent = (st.sends[ch] ?? []).filter((x) => t - x < 60_000).length;
    if (replies.length > 1 && replies.length + recent > BATCH_PER_MIN) {
      const lines = replies.map((o) => `${o.line}${o.ideaId && st.cards[o.ideaId] ? refTo(st.cards[o.ideaId]) : ''}`);
      const chunks: string[] = [];
      let cur = '';
      for (const l of lines) { if ((cur + '\n' + l).length > 1800) { chunks.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l; }
      if (cur) chunks.push(cur);
      let i = 0;
      for (const chunk of chunks) {
        const r = await deliver(url, ch, 'POST', replyBody(`**Updates (${etHm(t)})**\n${chunk}`));
        if (!r.ok) { postsBlocked = true; break; }
        i++; sent++;
      }
      const doneIds = new Set(i === chunks.length ? replies.map((o) => o.id) : []);
      const s2 = load(); s2.outbox = s2.outbox.filter((o) => !doneIds.has(o.id)); save(s2);
    }

    for (const o of due) {
      const cur = load();
      const live = cur.outbox.find((x) => x.id === o.id);
      if (!live) continue;
      const card = o.ideaId ? cur.cards[o.ideaId] : undefined;
      let r: DeliverResult | null = null;
      if (o.kind === 'edit') {
        if (!card) { drop(cur, o.id); dropped++; continue; }
        if (!card.messageId) {
          if (card.postFailed || !cur.outbox.some((x) => x.kind === 'card' && x.ideaId === card.ideaId)) { drop(cur, o.id); dropped++; continue; }
          deferred++; continue; // card still queued — it will go out with the current state
        }
        r = await deliver(`${url.replace(/[?#].*$/, '').replace(/\/+$/, '')}/messages/${card.messageId}`, ch, 'PATCH', buildCardPayload(card));
      } else {
        if (postsBlocked) { deferred++; continue; }
        if (o.kind === 'card') {
          if (!card) { drop(cur, o.id); dropped++; continue; }
          r = await deliver(url, ch, 'POST', buildCardPayload(card));
          if (r.ok) {
            const meta = await channelMeta(ch, url, r.json);
            const s3 = load();
            const c3 = s3.cards[card.ideaId];
            if (c3) { c3.messageId = r.json?.id ? String(r.json.id) : null; c3.channelId = r.json?.channel_id ?? meta.channelId; c3.guildId = r.json?.guild_id ?? meta.guildId; }
            s3.outbox = s3.outbox.filter((x) => x.id !== o.id);
            save(s3); sent++;
            logger.info(`[DISCORD-LIFECYCLE] ${ch}: card posted ${card.label} (${card.ideaId.slice(0, 8)}) msg ${c3?.messageId ?? '?'}`);
            continue;
          }
        } else if (o.kind === 'reply') {
          if (!replyReady(cur, o)) { deferred++; continue; }
          r = await deliver(url, ch, 'POST', replyBody(`${o.line}${card ? refTo(card) : ''}`));
        } else if (o.kind === 'digest') {
          const body = buildDigest(cur, ch, now());
          if (!body) { drop(cur, o.id); continue; }
          const n = (cur.overflow[ch] ?? []).length;
          r = await deliver(url, ch, 'POST', body);
          if (r.ok) { const s5 = load(); s5.overflow[ch] = (s5.overflow[ch] ?? []).slice(n); s5.outbox = s5.outbox.filter((x) => x.id !== o.id); save(s5); sent++; logger.info(`[DISCORD-LIFECYCLE] ${ch}: digest of ${n} capped idea(s) posted`); continue; }
        } else {
          r = await deliver(url, ch, 'POST', o.body ?? {});
        }
      }
      const s4 = load();
      const item = s4.outbox.find((x) => x.id === o.id);
      if (!item) continue;
      if (r.ok) { s4.outbox = s4.outbox.filter((x) => x.id !== o.id); save(s4); sent++; logger.info(`[DISCORD-LIFECYCLE] ${ch}: ${o.kind} sent${o.ideaId ? ` (${o.ideaId.slice(0, 8)})` : ''}`); continue; }
      if (r.gated) { logger.info(`[DISCORD-LIFECYCLE] ${ch}: ${o.kind} held by the rate gate — queued, retry ${Math.round((r.retryAfterMs ?? 60_000) / 1000)}s`); item.nextAt = now() + (r.retryAfterMs ?? 60_000); postsBlocked = true; save(s4); deferred++; continue; }
      item.attempts++;
      if (item.attempts >= MAX_ATTEMPTS || r.status === 404 || r.status === 401) {
        s4.outbox = s4.outbox.filter((x) => x.id !== o.id);
        if (o.kind === 'card' && card && s4.cards[card.ideaId]) s4.cards[card.ideaId].postFailed = true;
        logger.warn(`[DISCORD-LIFECYCLE] ${ch} ${o.kind} ${o.ideaId ?? ''} dropped after ${item.attempts} attempt(s) (HTTP ${r.status})`);
        dropped++;
      } else {
        item.nextAt = now() + (r.retryAfterMs ?? Math.min(15 * 60_000, 30_000 * 2 ** item.attempts));
        deferred++;
      }
      if (r.status === 429 && o.kind !== 'edit') postsBlocked = true;
      save(s4);
    }
  }
  return { sent, deferred, dropped };
}
function drop(s: LifecycleState, id: string): void { s.outbox = s.outbox.filter((x) => x.id !== id); save(s); }
/** A reply waits for its card to be posted (so it can link to it), unless the card failed. */
function replyReady(s: LifecycleState, o: OutboxItem): boolean {
  if (!o.ideaId) return true;
  const c = s.cards[o.ideaId];
  if (!c || c.messageId || c.postFailed) return true;
  return !s.outbox.some((x) => x.kind === 'card' && x.ideaId === o.ideaId);
}

// ─── Daily recap (16:20 ET) ─────────────────────────────────────────────

export function buildRecap(s: LifecycleState, ch: LabsChannel, day: string): Record<string, unknown> | null {
  if (ch === 'bot') {
    const rows = Object.values(s.bot).filter((b) => b.day === day || (b.exitAt != null && etDayOf(b.exitAt) === day));
    if (!rows.length) return null;
    const exits = rows.filter((b) => b.exitAt != null && etDayOf(b.exitAt) === day);
    const wins = exits.filter((b) => (b.pnl ?? 0) > 0).length, losses = exits.filter((b) => (b.pnl ?? 0) <= 0).length;
    const pnl = exits.reduce((a, b) => a + (b.pnl ?? 0), 0);
    const lines = exits.slice(0, 15).map((b) => `• ${b.label} · ${b.pct != null ? signedPct(b.pct) : '—'}${b.reason ? ` · ${String(b.reason).replace(/\s*\[[^\]]*\]/g, '').slice(0, 60)}` : ''}`);
    return replyBody([
      `📋 **Quantinum Bot · daily recap ${day}**`,
      `Entries ${rows.filter((b) => b.entryAt != null && etDayOf(b.entryAt) === day).length} · Exits ${exits.length} · Wins ${wins} · Losses ${losses} · Net ${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(2)} (paper fills — verified against the bot's own fills, quotes may be delayed)`,
      ...lines,
    ].join('\n'));
  }
  const cards = Object.values(s.cards).filter((c) => c.channel === ch);
  const published = cards.filter((c) => c.day === day);
  const touched = cards.filter((c) => c.events.some((e) => e.kind !== 'publish' && etDayOf(e.at) === day));
  if (!published.length && !touched.length) return null;
  const resolvedToday = cards.filter((c) => c.events.some((e) => e.kind === 'resolve' && etDayOf(e.at) === day));
  const triggeredToday = cards.filter((c) => c.events.some((e) => e.kind === 'trigger' && etDayOf(e.at) === day));
  const wins = resolvedToday.filter((c) => c.status === 'win'), losses = resolvedToday.filter((c) => c.status === 'loss');
  const v = (xs: Card[]) => `${xs.filter((c) => c.verified).length} verified / ${xs.filter((c) => !c.verified).length} unverified`;
  const other = resolvedToday.filter((c) => !['win', 'loss'].includes(c.status));
  const open = published.filter((c) => c.status === 'published' || c.status === 'triggered');
  const lines = [...new Set([...published, ...touched])].slice(0, 15).map((c) => {
    const link = messageLink(c);
    return `• ${link ? `[${c.label}](${link})` : c.label} · ${STATUS_ICON[c.status]} ${c.statusLine.split(' · ').slice(0, 2).join(' · ')}`;
  });
  return replyBody([
    `📋 **${CHANNEL_TAG[ch as Exclude<LabsChannel, 'bot'>]} · daily recap ${day}**`,
    `Published ${published.length} · Triggered ${triggeredToday.length} · Wins ${wins.length} (${v(wins)}) · Losses ${losses.length} (${v(losses)}) · Time/expired ${other.length} · Still open ${open.length}`,
    ...(() => {
      const sized = resolvedToday.filter((c) => typeof c.riskPnl === 'number');
      if (!sized.length) return [];
      const net = sized.reduce((a, c) => a + (c.riskPnl as number), 0);
      const rd = sized[0].riskDollars ?? readNexusRiskDollars(process.env);
      return [`Net ${net >= 0 ? '+' : '−'}$${Math.abs(net).toFixed(0)} at $${rd}/trade risk (${sized.length} closed, risk-sized; losses capped at the stop)`];
    })(),
    `-# verified = hit time confirmed on the bar path; unverified = observed by a delayed poll. Model/paper record, not live fills.`,
    ...lines,
  ].join('\n'));
}

export async function runDailyRecap(nowMs: number = now()): Promise<Record<LabsChannel, string>> {
  const out = {} as Record<LabsChannel, string>;
  if (!lifecycleEnabled()) { for (const ch of LABS_CHANNEL_KEYS) out[ch] = 'off'; return out; }
  const day = etDayOf(nowMs);
  for (const ch of LABS_CHANNEL_KEYS) {
    const s = load();
    const key = `${day}|${ch}`;
    if (!channelWebhook(ch)) { out[ch] = 'no_webhook'; continue; }
    if (!channelEnabled(ch, s)) { out[ch] = 'channel_off'; continue; }
    if (s.recaps[key]) { out[ch] = 'duplicate'; continue; }
    const body = buildRecap(s, ch, day);
    if (!body) { out[ch] = 'nothing'; continue; }
    s.recaps[key] = nowMs;
    enqueue(s, { channel: ch, kind: 'recap', body });
    save(s);
    out[ch] = 'queued';
  }
  await flushOutbox();
  return out;
}

// ─── Status / admin ─────────────────────────────────────────────────────

export function lifecycleStatus() {
  const s = load();
  const t = now();
  const today = etDayOf(t);
  return {
    enabled: lifecycleEnabled(),
    env: 'DISCORD_LIFECYCLE',
    channels: LABS_CHANNEL_KEYS.map((ch) => {
      const cards = Object.values(s.cards).filter((c) => c.channel === ch);
      return {
        key: ch, label: LABS_CHANNELS[ch].label, env: LABS_CHANNELS[ch].env,
        configured: !!channelWebhook(ch), on: channelEnabled(ch, s),
        cardsToday: ch === 'bot' ? Object.values(s.bot).filter((b) => b.day === today).length : cards.filter((c) => c.day === today).length,
        openCards: cards.filter((c) => c.status === 'published' || c.status === 'triggered').length,
        pending: s.outbox.filter((o) => o.channel === ch).length,
        capped: (s.overflow[ch] ?? []).length,
        recapToday: !!s.recaps[`${today}|${ch}`],
      };
    }),
    outbox: s.outbox.length,
    caps: cardCaps(),
    lastError: s.lastError,
  };
}

// ─── Schedule (worker job 'discord-lifecycle') ──────────────────────────

let scheduled = false;
export async function scheduleDiscordLifecycle(log: (m: string) => void): Promise<void> {
  if (scheduled) return;
  scheduled = true;
  const cron = (await import('./guarded-cron')).default;
  cron.schedule('20 16 * * 1-5', async () => {
    try { const r = await runDailyRecap(); logger.info(`[DISCORD-LIFECYCLE] recap ${JSON.stringify(r)}`); }
    catch (err) { logger.error('[DISCORD-LIFECYCLE] recap failed:', err); }
  }, { timezone: 'America/New_York' });
  // Outbox retry (gated / rate-limited sends). Not a market-data poll: it reads the local state file.
  const t = setInterval(() => { void flushOutbox().catch(() => {}); }, 30_000);
  t.unref?.();
  log(`📣 Discord lifecycle ${lifecycleEnabled() ? 'ON' : 'OFF (DISCORD_LIFECYCLE)'} — publish/trigger/exit cards in the Labs channels, recap weekdays 16:20 ET`);
}

// ─── Test seams ─────────────────────────────────────────────────────────

/**
 * In-memory state, injected poster / http / clock — never the network. `persist: true`
 * keeps the real state file (point SHARED_STATE_DIR at a temp dir) to test restarts.
 */
export function __setLifecycleTestMode(o: { post?: Poster | null; http?: Http | null; now?: (() => number) | null; persist?: boolean } | null): void {
  if (o == null) { testMode = false; memoryState = null; testPoster = null; testHttp = null; testNow = null; return; }
  testMode = !o.persist;
  memoryState = freshState();
  if ('post' in o) testPoster = o.post ?? null;
  if ('http' in o) testHttp = o.http ?? null;
  if ('now' in o) testNow = o.now ?? null;
}
export function __lifecycleStateForTest(): LifecycleState { return load(); }
