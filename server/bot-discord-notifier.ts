/**
 * QUANTINUM BOT · DISCORD NOTIFIER — one entry post and one exit post per paper position.
 * =====================================================================================
 *   BOT ENTRY · SPY 660P 0DTE @ $4.20 · 09:41 ET   (SPXW mirror strike as a field for SPY)
 *   BOT EXIT · +85% · 10:12 ET
 *
 * Isolated on purpose (the bot itself is being rewritten on another branch): the bot
 * calls notifyBotEntry / notifyBotExit at ONE entry site and ONE exit site, fire-and-forget.
 *
 * Channel: env QUANT_BOT_DISCORD_WEBHOOK only.
 *   • unset / blank            → no posting (never falls back to any other webhook)
 *   • not a discord webhook URL → refused
 *   • equal to any other DISCORD_WEBHOOK_* (or *DISCORD*WEBHOOK*) value → refused, so the
 *     bot can never be pointed at the research / SPX / lotto channels by a copy-paste.
 * Delivery goes through postDiscordWebhook (shared per-channel rate gate + duplicate gate +
 * compliance disclaimer). Deduped per position id and event kind in-process.
 * Footer: "Paper trading · educational, not advice".
 */
import { logger } from './logger';

export const BOT_NOTIFIER_ENV = 'QUANT_BOT_DISCORD_WEBHOOK';
export const BOT_NOTIFIER_FOOTER = 'Paper trading · educational, not advice';

type Env = Record<string, string | undefined>;

export function resolveBotWebhook(env: Env = process.env): { url: string | null; reason: string | null } {
  const url = String(env[BOT_NOTIFIER_ENV] ?? '').trim();
  if (!url) return { url: null, reason: `${BOT_NOTIFIER_ENV} unset — bot Discord posting off` };
  if (!/^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/.test(url)) {
    return { url: null, reason: `${BOT_NOTIFIER_ENV} is not a Discord webhook URL — refused` };
  }
  const norm = (u: string) => u.trim().replace(/\/+$/, '').replace('discordapp.com', 'discord.com').replace(/^https:\/\/(ptb|canary)\./, 'https://');
  for (const [k, v] of Object.entries(env)) {
    if (k === BOT_NOTIFIER_ENV || !v) continue;
    if (!/DISCORD.*WEBHOOK|WEBHOOK.*DISCORD/i.test(k)) continue;
    if (norm(v) === norm(url)) return { url: null, reason: `${BOT_NOTIFIER_ENV} equals ${k} — refused (the bot posts only to its own channel)` };
  }
  return { url, reason: null };
}

// ─── Formatting ─────────────────────────────────────────────────────────

const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export const etHm = (ms: number) => `${ET_HM.format(new Date(ms)).replace(/^24:/, '00:')} ET`;
const money = (x: number) => `$${x.toFixed(2)}`;
const signedMoney = (x: number) => `${x >= 0 ? '+' : '−'}$${Math.abs(x).toFixed(2)}`;
const signedPct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(0)}%`;
const fmtStrike = (s: number) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

export function dteLabel(expiry: string | null | undefined, nowMs: number): string {
  if (!expiry) return '';
  const d = Math.round((Date.parse(`${String(expiry).slice(0, 10)}T12:00:00Z`) - Date.parse(`${ET_DAY.format(new Date(nowMs))}T12:00:00Z`)) / 864e5);
  return Number.isFinite(d) ? `${Math.max(0, d)}DTE` : '';
}

export function contractLabel(c: { symbol: string; optionType?: string | null; strike?: number | null; expiry?: string | null }, nowMs: number): string {
  if (!c.optionType || c.strike == null) return c.symbol;
  const cp = String(c.optionType).toLowerCase().startsWith('p') ? 'P' : 'C';
  return [`${c.symbol} ${fmtStrike(Number(c.strike))}${cp}`, dteLabel(c.expiry, nowMs)].filter(Boolean).join(' ');
}

/** 'target' | 'stop' | 'time' | 'flatten' | 'other' from the bot's raw exit reason. */
export function classifyExitReason(raw: string | null | undefined): 'target' | 'stop' | 'time' | 'flatten' | 'other' {
  const r = String(raw ?? '').toLowerCase();
  if (/flatten|eod|before close|time exit/.test(r)) return /flatten/.test(r) ? 'flatten' : 'time';
  if (/time[_ ]?stop|expired|expiry/.test(r)) return 'time';
  if (/stop/.test(r)) return 'stop';
  if (/target|t1|t2|gap magnet|banked/.test(r)) return 'target';
  return 'other';
}

function quoteLine(source?: string | null, delayed?: boolean | null, ageSec?: number | null): string {
  if (!source) return 'quote source unknown — treat as delayed';
  const age = ageSec != null && Number.isFinite(ageSec) ? ` · fetched ${Math.round(ageSec)}s before fill` : '';
  if (delayed === false) return `${source} · real-time${age}`;
  const lag = source === 'cboe' ? ' (~15 min)' : source === 'alpaca' ? ' (indicative feed)' : '';
  return `${source} · DELAYED${lag}${age}`;
}

/** Pulls "[INDEX 0DTE · cboe · delayed]" / "mark: tradier" tags the bot writes on the fill's catalyst. */
export function quoteFromCatalyst(catalyst: string | null | undefined): { source: string | null; delayed: boolean | null } {
  const c = String(catalyst ?? '');
  const m = /\[INDEX 0DTE · (\w+)( · delayed)?\]/.exec(c) ?? /mark: (\w+)( · delayed)?/.exec(c);
  if (!m) return { source: null, delayed: null };
  return { source: m[1], delayed: !!m[2] };
}

export interface BotEntryEvent {
  positionId: string;
  symbol: string;
  optionType?: string | null;
  strike?: number | null;
  expiry?: string | null;
  direction?: 'long' | 'short' | null;
  entryPremium: number;
  quantity: number;
  quoteSource?: string | null;
  quoteDelayed?: boolean | null;
  quoteAgeSec?: number | null;
  premiumStop?: number | null;
  premiumTarget?: number | null;
  underlyingStop?: number | null;
  underlyingTarget?: number | null;
  grade?: string | null;
  sourceEngine?: string | null;
  policy?: string | null;
  /** SPXW mirror for an SPY index idea (display only — the record stays on SPY). */
  spxMirror?: { strike: number; ratioLabel: string } | null;
  at?: number;
}

export interface BotExitEvent {
  positionId: string;
  symbol: string;
  optionType?: string | null;
  strike?: number | null;
  expiry?: string | null;
  entryPremium: number;
  exitPremium: number;
  quantity: number;
  reason: string;
  entryTime?: string | null;
  at?: number;
}

export function buildEntryPayload(e: BotEntryEvent): Record<string, unknown> {
  const at = e.at ?? Date.now();
  const contract = contractLabel(e, at);
  const isPut = String(e.optionType ?? '').toLowerCase().startsWith('p');
  const side = e.optionType ? `BUY ${isPut ? 'PUT' : 'CALL'} (${isPut ? 'bearish' : 'bullish'})` : (e.direction === 'short' ? 'SHORT' : 'LONG');
  const mult = e.optionType ? 100 : 1;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Contract', value: contract, inline: true },
    { name: 'Side', value: side, inline: true },
    { name: 'Entry', value: `${money(e.entryPremium)} × ${e.quantity} (${money(e.entryPremium * e.quantity * mult)} debit)`, inline: true },
    { name: 'Quote', value: quoteLine(e.quoteSource, e.quoteDelayed, e.quoteAgeSec), inline: false },
  ];
  if (e.spxMirror) fields.push({ name: 'SPXW mirror', value: `≈ SPXW ${fmtStrike(e.spxMirror.strike)}${isPut ? 'P' : 'C'} · ${e.spxMirror.ratioLabel} · display only, tracked on SPY`, inline: false });
  const stops = [e.premiumStop != null ? `premium ${money(e.premiumStop)}` : '', e.underlyingStop != null ? `underlying ${money(e.underlyingStop)}` : ''].filter(Boolean).join(' · ');
  const tgts = [e.premiumTarget != null ? `premium ${money(e.premiumTarget)}` : '', e.underlyingTarget != null ? `underlying ${money(e.underlyingTarget)}` : ''].filter(Boolean).join(' · ');
  fields.push({ name: 'Stop', value: stops || '—', inline: true }, { name: 'Target', value: tgts || '—', inline: true });
  fields.push({ name: 'Grade', value: e.grade || '—', inline: true });
  fields.push({ name: 'Source', value: [e.sourceEngine, e.policy ? `policy:${e.policy}` : ''].filter(Boolean).join(' · ') || '—', inline: true });
  return {
    username: 'Quantinum Bot',
    embeds: [{
      title: `BOT ENTRY · ${contract} @ ${money(e.entryPremium)} · ${etHm(at)}`,
      color: isPut ? 0xd04a4a : 0x2f80ed,
      fields,
      footer: { text: BOT_NOTIFIER_FOOTER },
      timestamp: new Date(at).toISOString(),
    }],
  };
}

export function buildExitPayload(e: BotExitEvent): Record<string, unknown> {
  const at = e.at ?? Date.now();
  const contract = contractLabel(e, at);
  const mult = e.optionType ? 100 : 1;
  const pct = e.entryPremium > 0 ? ((e.exitPremium - e.entryPremium) / e.entryPremium) * 100 : 0;
  const pnl = (e.exitPremium - e.entryPremium) * e.quantity * mult;
  const kind = classifyExitReason(e.reason);
  const entryMs = e.entryTime ? Date.parse(e.entryTime) : NaN;
  const holdMin = Number.isFinite(entryMs) ? Math.max(0, Math.round((at - entryMs) / 60_000)) : null;
  const hold = holdMin == null ? 'unknown' : holdMin >= 60 ? `${Math.floor(holdMin / 60)}h ${holdMin % 60}m` : `${holdMin}m`;
  return {
    username: 'Quantinum Bot',
    embeds: [{
      title: `BOT EXIT · ${signedPct(pct)} · ${etHm(at)}`,
      color: pnl >= 0 ? 0x2f80ed : 0xd04a4a,
      fields: [
        { name: 'Contract', value: contract, inline: true },
        { name: 'Exit', value: `${money(e.entryPremium)} → ${money(e.exitPremium)} × ${e.quantity}`, inline: true },
        { name: 'P&L', value: `${signedPct(pct)} · ${signedMoney(pnl)}`, inline: true },
        { name: 'Reason', value: `${kind}${e.reason ? ` — ${e.reason}` : ''}`.slice(0, 1000), inline: false },
        { name: 'Hold', value: hold, inline: true },
      ],
      footer: { text: BOT_NOTIFIER_FOOTER },
      timestamp: new Date(at).toISOString(),
    }],
  };
}

// ─── Delivery ───────────────────────────────────────────────────────────

export type NotifyResult = 'sent' | 'off' | 'refused' | 'duplicate' | 'gated' | 'failed';
const seen = new Set<string>();
type Poster = (url: string, init: RequestInit) => Promise<Response>;
let poster: Poster | null = null;
/** Test seam: replace the HTTP boundary (postDiscordWebhook). */
export function __setBotNotifierPosterForTest(p: Poster | null): void { poster = p; seen.clear(); }

async function deliver(key: string, payload: Record<string, unknown>): Promise<NotifyResult> {
  const { url, reason } = resolveBotWebhook();
  if (!url) {
    if (reason && !/unset/.test(reason)) logger.warn(`[BOT-DISCORD] ${reason}`);
    return reason && /refused/.test(reason) ? 'refused' : 'off';
  }
  if (seen.has(key)) return 'duplicate';
  seen.add(key);
  if (seen.size > 2_000) seen.delete(seen.values().next().value as string);
  try {
    const post: Poster = poster ?? (await import('./discord-service')).postDiscordWebhook;
    const res = await post(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.status === 204) return 'gated'; // suppressed by the shared rate / duplicate gate
    if (!res.ok) { logger.warn(`[BOT-DISCORD] ${key}: HTTP ${res.status}`); return 'failed'; }
    return 'sent';
  } catch (e: any) {
    logger.warn(`[BOT-DISCORD] ${key}: ${e?.message ?? e}`);
    return 'failed';
  }
}

export async function notifyBotEntry(e: BotEntryEvent): Promise<NotifyResult> {
  if (!e?.positionId) return 'failed';
  return deliver(`entry:${e.positionId}`, buildEntryPayload(e));
}

export async function notifyBotExit(e: BotExitEvent): Promise<NotifyResult> {
  if (!e?.positionId) return 'failed';
  return deliver(`exit:${e.positionId}`, buildExitPayload(e));
}

// ─── Adapters from the bot's own objects (keep the call sites one line) ─────

/** Entry event from a filled paper position + the tradeable idea + the board pick. Never throws. */
export async function entryFromFill(position: any, tradeable: any, pick: any): Promise<BotEntryEvent | null> {
  if (!position?.id) return null;
  const q = quoteFromCatalyst(tradeable?.catalyst);
  const signals: string[] = Array.isArray(tradeable?.qualitySignals) ? tradeable.qualitySignals : [];
  const policy = signals.find((s) => s.startsWith('policy:'))?.slice(7) ?? null;
  const optionType = position.optionType ?? tradeable?.optionType ?? null;
  const strike = position.strikePrice ?? tradeable?.strikePrice ?? null;
  let spxMirror: BotEntryEvent['spxMirror'] = null;
  if (String(position.symbol).toUpperCase() === 'SPY' && optionType && strike != null) {
    try {
      const { peekSpxPerSpy } = await import('./spx-ratio');
      const r = peekSpxPerSpy();
      if (r) spxMirror = { strike: Math.round((Number(strike) * r.ratio) / 5) * 5, ratioLabel: r.label };
    } catch { /* no ratio → no mirror line */ }
  }
  return {
    positionId: String(position.id),
    symbol: String(position.symbol ?? tradeable?.symbol ?? pick?.symbol),
    optionType, strike,
    expiry: position.expiryDate ?? tradeable?.expiryDate ?? null,
    direction: tradeable?.direction ?? pick?.direction ?? null,
    entryPremium: Number(position.entryPrice ?? tradeable?.entryPrice ?? 0),
    quantity: Number(position.quantity ?? 1),
    quoteSource: q.source, quoteDelayed: q.delayed, quoteAgeSec: null,
    premiumStop: Number(position.stopLoss ?? tradeable?.stopLoss) || null,
    premiumTarget: Number(position.targetPrice ?? tradeable?.targetPrice) || null,
    underlyingStop: Number(pick?.stopLoss) || null,
    underlyingTarget: Number(pick?.targetPrice) || null,
    grade: pick?.grade ?? pick?.convictionBand ?? null,
    sourceEngine: [tradeable?.source, tradeable?.dataSourceUsed].filter(Boolean).join(' / ') || null,
    policy,
    spxMirror,
    at: Date.now(),
  };
}

/** Exit event from a closed paper position. */
export function exitFromPosition(pos: any, exitPrice: number, reason: string): BotExitEvent | null {
  if (!pos?.id) return null;
  return {
    positionId: String(pos.id), symbol: String(pos.symbol),
    optionType: pos.optionType ?? null, strike: pos.strikePrice ?? null, expiry: pos.expiryDate ?? null,
    entryPremium: Number(pos.entryPrice), exitPremium: Number(exitPrice), quantity: Number(pos.quantity),
    reason, entryTime: pos.entryTime ?? null, at: Date.now(),
  };
}

/** Fire-and-forget wrappers for the bot's call sites — a notification never blocks or fails a fill/close. */
export function postBotEntry(position: any, tradeable: any, pick: any): void {
  entryFromFill(position, tradeable, pick)
    .then((e) => (e ? notifyBotEntry(e) : null))
    .catch((err) => logger.warn(`[BOT-DISCORD] entry: ${err?.message ?? err}`));
}
export function postBotExit(pos: any, exitPrice: number, reason: string): void {
  const e = exitFromPosition(pos, exitPrice, reason);
  if (e) notifyBotExit(e).catch((err) => logger.warn(`[BOT-DISCORD] exit: ${err?.message ?? err}`));
}
