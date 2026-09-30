/**
 * Screenshot → structured trade data for the Discord forum import (pure; no I/O).
 *
 * Most journal posts are a short line plus a screenshot — a broker fill, an
 * order confirmation, a position, a P&L summary, or an annotated chart. The
 * importer (server/forum-vision.ts) sends each image to a vision model and
 * gets back STRICT JSON; this file owns everything about that JSON that must
 * be testable without a model:
 *
 *   VISION_SYSTEM_PROMPT / visionUserPrompt   what the model is asked
 *   parseVisionText                           raw model text → validated VisionResult (zod)
 *   visionLegs                                VisionResult → trade legs (open / close / trim)
 *   textLeg                                   the post text's parsed leg (shared/discord-journal-parser)
 *   mergeMessageLegs                          text + screenshot legs of ONE post; text wins, conflicts flagged
 *   estimateVisionCost                        the preview's cost line
 *   attachmentIdOf / cache types              re-imports never re-bill an image
 *
 * NEVER INVENT NUMBERS: every number in a leg is either in the post text or
 * visible in the image (as the model read it). Nothing is inferred from the
 * posting date except a missing year on an expiry (same rule as the text
 * parser) and the leg time when the screenshot shows none.
 */
import { z } from 'zod';
import { discordDayKey, resolveExpiry, type ParsedMessage } from './discord-journal-parser';

// ─── Model, price, budget ────────────────────────────────────

/** Anthropic model used for screenshots (ANTHROPIC_API_KEY). */
export const VISION_MODEL = 'claude-sonnet-5';
/** Fallback when ANTHROPIC_API_KEY is missing (GEMINI_API_KEY / GOOGLE_API_KEY). */
export const VISION_FALLBACK_MODEL = 'gemini-2.5-flash';
/** claude-sonnet-5 list price, USD per million tokens (Anthropic pricing, 2026). */
export const VISION_PRICE = { inputPerMTok: 2, outputPerMTok: 10 } as const;
/**
 * Estimated tokens per screenshot: a phone screenshot is resized by the API to
 * ≤1568px on the long edge (~1,500 image tokens) + ~800 prompt tokens in;
 * ~450 JSON tokens out. Thinking is disabled for this call.
 */
export const VISION_EST_TOKENS = { input: 2_400, output: 450 } as const;
export const FORUM_VISION_MAX_IMAGES_DEFAULT = 1500;
/** Raw bytes; base64 of this stays under the API's 5MB image limit. */
export const VISION_MAX_IMAGE_BYTES = 3_750_000;
/** Below this the model's own confidence sends the image to the review list and its trades are not booked. */
export const VISION_MIN_CONFIDENCE = 0.6;
/** Bump when the prompt/schema changes in a way that makes cached readings stale. */
export const VISION_PROMPT_VERSION = 1;

export function visionMaxImages(env: Record<string, string | undefined> = {}): number {
  const v = Number(env.FORUM_VISION_MAX_IMAGES);
  return env.FORUM_VISION_MAX_IMAGES?.trim() && Number.isFinite(v) && v >= 0 ? Math.floor(v) : FORUM_VISION_MAX_IMAGES_DEFAULT;
}

export interface VisionCostEstimate {
  images: number;
  /** Images that would actually be sent (after the per-import cap). */
  billable: number;
  cap: number;
  cached: number;
  perImageUsd: number;
  usd: number;
  model: string;
  basis: string;
}

export function estimateVisionCost(images: number, opts: { cached?: number; cap?: number } = {}): VisionCostEstimate {
  const cached = Math.max(0, Math.min(images, opts.cached ?? 0));
  const cap = opts.cap ?? FORUM_VISION_MAX_IMAGES_DEFAULT;
  const billable = Math.min(Math.max(0, images - cached), cap);
  const perImageUsd = (VISION_EST_TOKENS.input * VISION_PRICE.inputPerMTok + VISION_EST_TOKENS.output * VISION_PRICE.outputPerMTok) / 1_000_000;
  return {
    images, billable, cap, cached,
    perImageUsd: Math.round(perImageUsd * 10_000) / 10_000,
    usd: Math.round(billable * perImageUsd * 100) / 100,
    model: VISION_MODEL,
    basis: `~${VISION_EST_TOKENS.input.toLocaleString()} input + ~${VISION_EST_TOKENS.output} output tokens per image at $${VISION_PRICE.inputPerMTok}/$${VISION_PRICE.outputPerMTok} per M tokens (${VISION_MODEL})`,
  };
}

// ─── Attachment identity (cache key) ─────────────────────────

/** Discord attachment id from a CDN url (…/attachments/<channel>/<attachment id>/<name>), else null. */
export function attachmentIdOf(url: string): string | null {
  const m = /\/attachments\/\d{5,22}\/(\d{5,22})\//.exec(url);
  return m ? m[1] : null;
}

/** Image type from the first bytes (the API needs the real type, not the file name's). */
export function sniffImageType(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// ─── Prompt ──────────────────────────────────────────────────

export const VISION_SYSTEM_PROMPT = `You read ONE screenshot posted in a trader's Discord trading journal and return STRICT JSON — no prose, no code fences.

Classify the image ("kind"):
  broker_fill          a fill / execution notification or order history showing FILLED trades
  order_confirmation   an order ticket or confirmation screen
  position             open positions / holdings (quantity and average cost)
  pnl_summary          realized P&L / closed trades summary
  chart                a price chart (annotated or not)
  other                anything else (memes, text, news, scanners)

Return exactly this shape:
{"kind":"broker_fill","confidence":0.9,
 "trades":[{"ticker":"NVDA","assetType":"option","side":"buy","optionType":"call","strike":190,"expiry":"10/17","qty":2,"price":2.15,"date":null,"time":"10:42 AM","action":"open","realizedPnl":null}],
 "statedPnl":{"amount":null,"percent":null},
 "chart":null,
 "notes":null}

Rules:
- ONLY values you can read in the image. If a value is not visible, use null. Never compute, estimate or guess a number.
- ticker: the underlying symbol (e.g. "SPY" for an SPY option; "ES" for an ES futures contract).
- assetType: "stock" | "option" | "future" | "crypto".
- side: "buy" | "sell" as shown (Buy to Open / Bought / B → "buy"; Sell to Close / Sold / S → "sell"); null if not shown.
- action: "open" | "close" | "trim" only when the image says it (to open / to close / partial); else null.
- expiry: exactly as shown ("10/17", "Oct 17", "2026-10-17"); do not add a year that is not visible.
- qty: contracts or shares filled; price: the fill price per share or per contract premium (not the total).
- date / time: the fill's own date/time only if visible; else null.
- realizedPnl: the realized dollar P&L of that trade only if shown (negative for a loss).
- Exclude cancelled, rejected, expired-unfilled or working (unfilled) orders from "trades" (mention them in notes).
- position screenshots: one trade per position, price = average cost, qty = position size, action "open".
- statedPnl: a total P&L the image states (dollar amount and/or percent), else nulls.
- chart: for charts only — {"ticker":…,"timeframe":…,"levels":[numbers written or drawn as levels],"bias":"long"|"short"|"neutral"|null,"thesis":"one or two sentences describing what the annotations show"}. Describe, do not predict.
- confidence: 0 to 1 — how legible the image is and how sure you are of every value you returned.`;

export function visionUserPrompt(postedAtIso: string): string {
  return `Posted ${discordDayKey(postedAtIso)} (New York). Extract this screenshot per the schema. JSON only.`;
}

// ─── Validation (zod) ────────────────────────────────────────

const toNum = (v: unknown) => {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const neg = /^\s*\(.*\)\s*$/.test(v); // (123.45) = negative in broker P&L
    const c = v.replace(/[$,\s()+]/g, '').replace(/^−/, '-');
    if (!c || c === '-') return null;
    const n = Number(c);
    return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : v;
  }
  return v;
};
const num = z.preprocess(toNum, z.number().finite().nullable());
const posNum = z.preprocess(toNum, z.number().finite().positive().nullable());
const nonNegNum = z.preprocess(toNum, z.number().finite().nonnegative().nullable());
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);
const optStr = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max).nullable());
const nullish = <T extends z.ZodTypeAny>(s: T) => s.nullish().transform((v) => (v ?? null) as z.output<T> | null);

export const VisionTradeSchema = z.object({
  ticker: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/^[$/]/, '') : v),
    z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/, 'ticker'),
  ),
  assetType: nullish(z.preprocess(lower, z.enum(['stock', 'option', 'future', 'crypto']))),
  side: nullish(z.preprocess(lower, z.enum(['buy', 'sell']))),
  optionType: nullish(z.preprocess(lower, z.enum(['call', 'put']))),
  strike: nullish(posNum),
  expiry: nullish(optStr(24)),
  qty: nullish(posNum),
  price: nullish(nonNegNum),
  date: nullish(optStr(24)),
  time: nullish(optStr(24)),
  action: nullish(z.preprocess(lower, z.enum(['open', 'close', 'trim']))),
  realizedPnl: nullish(num),
});
export type VisionTrade = z.output<typeof VisionTradeSchema>;

export const VISION_KINDS = ['broker_fill', 'order_confirmation', 'position', 'pnl_summary', 'chart', 'other'] as const;
export type VisionKind = (typeof VISION_KINDS)[number];

const ChartSchema = z.object({
  ticker: nullish(optStr(12)),
  timeframe: nullish(optStr(20)),
  levels: z.preprocess((v) => (Array.isArray(v) ? v.map(toNum).filter((x) => typeof x === 'number' && Number.isFinite(x)) : []), z.array(z.number()).max(24)).default([]),
  bias: nullish(z.preprocess(lower, z.enum(['long', 'short', 'neutral']))),
  thesis: nullish(z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 600) : null), z.string().nullable())),
});

const VisionEnvelope = z.object({
  kind: z.preprocess(lower, z.enum(VISION_KINDS)),
  confidence: z.preprocess(toNum, z.number().min(0).max(1)),
  trades: z.array(z.unknown()).max(60).nullish(),
  statedPnl: nullish(z.object({ amount: nullish(num), percent: nullish(num) })),
  chart: nullish(ChartSchema),
  notes: nullish(z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 400) : null), z.string().nullable())),
});

export interface VisionResult {
  kind: VisionKind;
  confidence: number;
  trades: VisionTrade[];
  statedPnl: { amount: number | null; percent: number | null } | null;
  chart: z.output<typeof ChartSchema> | null;
  notes: string | null;
  /** Trades the model returned that failed validation (not used). */
  dropped: number;
}

export type ParseVisionOutcome = { ok: true; result: VisionResult } | { ok: false; error: string };

/** Raw model text → validated result. Tolerates code fences / prose around the JSON object; nothing else. */
export function parseVisionText(text: string): ParseVisionOutcome {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return { ok: false, error: 'no JSON object in the model reply' };
  let data: unknown;
  try { data = JSON.parse(t.slice(a, b + 1)); } catch { return { ok: false, error: 'model reply is not valid JSON' }; }
  const env = VisionEnvelope.safeParse(data);
  if (!env.success) return { ok: false, error: `schema: ${env.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}` };
  const trades: VisionTrade[] = [];
  let dropped = 0;
  for (const raw of env.data.trades ?? []) {
    const r = VisionTradeSchema.safeParse(raw);
    if (!r.success) { dropped++; continue; }
    const tr = r.data;
    // A trade with neither a quantity, a price nor a realized P&L carries nothing to book.
    if (tr.qty == null && tr.price == null && tr.realizedPnl == null) { dropped++; continue; }
    trades.push(tr);
  }
  const sp = env.data.statedPnl;
  return {
    ok: true,
    result: {
      kind: env.data.kind,
      confidence: Math.round(env.data.confidence * 100) / 100,
      trades: env.data.kind === 'chart' || env.data.kind === 'other' ? [] : trades,
      statedPnl: sp && (sp.amount != null || sp.percent != null) ? { amount: sp.amount, percent: sp.percent } : null,
      chart: env.data.chart ?? null,
      notes: env.data.notes,
      dropped: env.data.kind === 'chart' || env.data.kind === 'other' ? dropped + trades.length : dropped,
    },
  };
}

// ─── Cache (journal_notes.meta.vision) ───────────────────────

export type VisionStatus = 'ok' | 'invalid' | 'low_confidence' | 'too_large' | 'unsupported' | 'fetch_failed' | 'skipped_budget' | 'error';

/** One image's reading, stored on its post (journal_notes.meta.vision[]). The image itself is never stored. */
export interface VisionImageRecord {
  attachmentId: string | null;
  /** sha256 of the image bytes (hex), when fetched. */
  sha256: string | null;
  name: string;
  status: VisionStatus;
  provider: 'anthropic' | 'gemini' | null;
  model: string | null;
  v: number;
  at: string;
  result: VisionResult | null;
  error: string | null;
  usage: { input: number; output: number } | null;
}

/** A cached record worth reusing (a successful reading of the current prompt version). */
export const reusableRecord = (r: VisionImageRecord | null | undefined): r is VisionImageRecord =>
  !!r && r.v === VISION_PROMPT_VERSION && (r.status === 'ok' || r.status === 'low_confidence' || r.status === 'invalid') && !!r.result === (r.status !== 'invalid');

// ─── Legs ────────────────────────────────────────────────────

export type LegAction = 'open' | 'close' | 'trim';
export type LegOrigin = 'text' | 'fill' | 'position' | 'pnl';

export interface ForumLeg {
  id: string;
  messageId: string;
  /** When it happened: the fill time on the screenshot when visible, else the post time. */
  time: string;
  postedAt: string;
  symbol: string | null;
  assetType: 'stock' | 'option' | 'future' | 'crypto';
  optionType: 'call' | 'put' | null;
  strike: number | null;
  expiry: string | null;
  /** Instrument side. For a close: the side being closed (sell closes a long), null when unknown. */
  direction: 'long' | 'short' | null;
  action: LegAction;
  qty: number | null;
  price: number | null;
  /** Signed % result stated in the text of an exit/trim. */
  pct: number | null;
  /** Realized $ P&L the screenshot states for this trade. */
  realizedPnl: number | null;
  stop: number | null;
  target: number | null;
  setup: string | null;
  source: 'text' | 'vision' | 'text+vision';
  origin: LegOrigin;
  confidence: number;
  replyTo: string | null;
  /** Human-readable conflicts / disclosures for this leg. */
  flags: string[];
  /** Text line for the trade's timeline. */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Expiry as the screenshot shows it → YYYY-MM-DD (year from the post only when none is visible, as in text). */
export function resolveVisionExpiry(raw: string | null, postedIso: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s);
  if (m) return resolveExpiry(s, postedIso);
  m = /^([A-Za-z]{3,4})[a-z]*\.?\s+(\d{1,2})(?:,?\s+'?(\d{2,4}))?$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return resolveExpiry(`${MONTHS[m[1].toLowerCase()]}/${m[2]}${m[3] ? `/${m[3]}` : ''}`, postedIso);
  m = /^(\d{1,2})\s+([A-Za-z]{3,4})[a-z]*\.?(?:\s+'?(\d{2,4}))?$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return resolveExpiry(`${MONTHS[m[2].toLowerCase()]}/${m[1]}${m[3] ? `/${m[3]}` : ''}`, postedIso);
  return null;
}

/** New York wall clock → ISO (DST-correct via Intl). */
export function nyWallToIso(day: string, h: number, mi: number, s = 0): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m || h > 23 || mi > 59 || s > 59) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi, s);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(guess)).reduce<Record<string, string>>((o, p) => (o[p.type] = p.value, o), {});
  const asNy = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(guess + (guess - asNy)).toISOString();
}

/**
 * The fill's time from the screenshot's date/time (New York), else the post
 * time. A visible time that would be AFTER the post, or more than 10 days
 * before it, is not trusted (the post time is used and the leg says so).
 */
export function resolveVisionTime(date: string | null, time: string | null, postedIso: string): { iso: string; fromImage: boolean } {
  const posted = Date.parse(postedIso);
  if (!time) return { iso: postedIso, fromImage: false };
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i.exec(time.trim());
  if (!tm) return { iso: postedIso, fromImage: false };
  let h = Number(tm[1]);
  const ap = tm[4]?.toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  let day = discordDayKey(postedIso);
  if (date) {
    const d = resolveVisionExpiry(date, postedIso); // same date grammar
    if (d) day = d;
    else return { iso: postedIso, fromImage: false };
  }
  const iso = nyWallToIso(day, h, Number(tm[2]), Number(tm[3] ?? 0));
  if (!iso) return { iso: postedIso, fromImage: false };
  const t = Date.parse(iso);
  if (t > posted + 60_000 || t < posted - 10 * 86_400_000) return { iso: postedIso, fromImage: false };
  return { iso, fromImage: true };
}

const fmt = (n: number | null) => (n == null ? '?' : String(Math.round(n * 10_000) / 10_000));

function describe(l: Pick<ForumLeg, 'symbol' | 'assetType' | 'optionType' | 'strike' | 'expiry' | 'qty' | 'price' | 'action' | 'realizedPnl'>): string {
  const inst = l.assetType === 'option' ? `${l.symbol} ${l.strike ?? '?'}${l.optionType === 'put' ? 'p' : 'c'}${l.expiry ? ` ${l.expiry}` : ''}` : `${l.symbol}`;
  return `${l.action} ${inst}${l.qty != null ? ` x${fmt(l.qty)}` : ''}${l.price != null ? ` @ ${fmt(l.price)}` : ''}${l.realizedPnl != null ? ` (realized ${l.realizedPnl >= 0 ? '+' : ''}$${fmt(l.realizedPnl)})` : ''}`;
}

/** The post text's parsed leg (entry → open, exit → close, trim → trim), or null for a note. */
export function textLeg(p: ParsedMessage): ForumLeg | null {
  if (p.kind === 'note') return null;
  const action: LegAction = p.kind === 'entry' ? 'open' : p.kind === 'exit' ? 'close' : 'trim';
  return {
    id: p.msg.id, messageId: p.msg.id, time: p.msg.timestamp, postedAt: p.msg.timestamp,
    symbol: p.symbol, assetType: p.assetType ?? 'stock', optionType: p.optionType, strike: p.strike, expiry: p.expiry,
    direction: action === 'open' ? p.side : null, action, qty: p.qty, price: p.price, pct: action === 'open' ? null : p.pct,
    realizedPnl: null, stop: p.stop, target: p.target, setup: p.setup, source: 'text', origin: 'text',
    confidence: p.confidence, replyTo: p.msg.replyTo, flags: [], label: p.text || '(attachment)',
  };
}

const ORIGIN_OF: Record<VisionKind, LegOrigin> = {
  broker_fill: 'fill', order_confirmation: 'fill', position: 'position', pnl_summary: 'pnl', chart: 'fill', other: 'fill',
};
const ORIGIN_FACTOR: Record<LegOrigin, number> = { text: 1, fill: 1, position: 0.9, pnl: 0.9 };

/** One screenshot's trades → legs. Only images at/above VISION_MIN_CONFIDENCE should be passed. */
export function visionLegs(r: VisionResult, msg: { id: string; timestamp: string; replyTo: string | null }, imageIndex: number): ForumLeg[] {
  const origin = ORIGIN_OF[r.kind];
  return r.trades.map((t, i) => {
    let action: LegAction;
    let direction: 'long' | 'short' | null;
    if (origin === 'position') { action = 'open'; direction = t.side === 'sell' ? 'short' : 'long'; }
    else if (t.action) {
      action = t.action;
      direction = action === 'open' ? (t.side === 'sell' ? 'short' : 'long') : t.side === 'buy' ? 'short' : t.side === 'sell' ? 'long' : null;
    } else if (origin === 'pnl' || t.realizedPnl != null) { action = 'close'; direction = t.side === 'buy' ? 'short' : t.side === 'sell' ? 'long' : null; }
    else if (t.side === 'sell') { action = 'close'; direction = 'long'; }
    else { action = 'open'; direction = 'long'; }
    const flags: string[] = [];
    if (!t.action && origin === 'fill') flags.push(t.side ? `"${t.side}" read as ${action === 'open' ? 'an opening buy' : 'a closing sell'} (the screenshot does not say to open / to close)` : 'no side on the screenshot — read as an opening buy');
    if (r.kind === 'order_confirmation') flags.push('from an order confirmation (the fill itself was not shown)');
    const tm = resolveVisionTime(t.date, t.time, msg.timestamp);
    if ((t.time || t.date) && !tm.fromImage) flags.push(`screenshot time "${[t.date, t.time].filter(Boolean).join(' ')}" not usable — post time used`);
    const assetType = t.assetType ?? (t.optionType || t.strike != null ? 'option' : 'stock');
    const expiry = resolveVisionExpiry(t.expiry, msg.timestamp);
    if (t.expiry && !expiry) flags.push(`expiry "${t.expiry}" not understood`);
    const leg: ForumLeg = {
      id: `${msg.id}:v${imageIndex}.${i}`, messageId: msg.id, time: tm.iso, postedAt: msg.timestamp,
      symbol: t.ticker, assetType, optionType: assetType === 'option' ? t.optionType : null, strike: assetType === 'option' ? t.strike : null,
      expiry: assetType === 'option' ? expiry : null, direction, action, qty: t.qty, price: t.price, pct: null,
      realizedPnl: t.realizedPnl, stop: null, target: null, setup: null, source: 'vision', origin,
      confidence: Math.round(r.confidence * ORIGIN_FACTOR[origin] * 100) / 100, replyTo: msg.replyTo, flags, label: '',
    };
    leg.label = `screenshot (${r.kind.replace('_', ' ')}): ${describe(leg)}`;
    return leg;
  });
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * tol);

/** Same instrument (for merging): symbol, and option type/strike/expiry when both sides state them. */
export function sameInstrument(a: Pick<ForumLeg, 'symbol' | 'assetType' | 'optionType' | 'strike' | 'expiry'>, b: Pick<ForumLeg, 'symbol' | 'assetType' | 'optionType' | 'strike' | 'expiry'>): boolean {
  if (!a.symbol || !b.symbol || a.symbol !== b.symbol) return false;
  const optA = a.assetType === 'option', optB = b.assetType === 'option';
  if (optA !== optB) return false;
  if (!optA) return true;
  if (a.optionType && b.optionType && a.optionType !== b.optionType) return false;
  if (a.strike != null && b.strike != null && !near(a.strike, b.strike, 0.001)) return false;
  if (a.expiry && b.expiry && a.expiry !== b.expiry) return false;
  return true;
}

/**
 * One post: its text leg + its screenshots' legs → the post's legs. The text
 * leg absorbs the screenshot leg for the same instrument: TEXT WINS where both
 * state a value (a disagreement is flagged on the leg), the screenshot fills in
 * what the text left out (size, price, strike, expiry, realized P&L). An exit
 * that names no ticker takes the ticker of the post's only screenshot trade.
 */
export function mergeMessageLegs(text: ForumLeg | null, vis: ForumLeg[]): { legs: ForumLeg[]; conflicts: string[] } {
  if (!text) return { legs: vis, conflicts: [] };
  if (!vis.length) return { legs: [text], conflicts: [] };
  const conflicts: string[] = [];
  let idx = vis.findIndex((v) => sameInstrument(text, v) && (text.action === v.action || (text.action !== 'open') === (v.action !== 'open')));
  if (idx < 0) idx = vis.findIndex((v) => sameInstrument(text, v));
  if (idx < 0 && !text.symbol && vis.length === 1) idx = 0;
  if (idx < 0) return { legs: [text, ...vis], conflicts };
  const v = vis[idx];
  const m: ForumLeg = { ...text, flags: [...text.flags], source: 'text+vision', confidence: Math.min(0.99, Math.max(text.confidence, v.confidence)) };
  const take = <K extends 'symbol' | 'optionType' | 'strike' | 'expiry' | 'qty' | 'price'>(k: K, label: string) => {
    const tv = text[k], vv = v[k];
    if (tv == null) { (m as any)[k] = vv; return; }
    if (vv == null) return;
    const differ = typeof tv === 'number' && typeof vv === 'number' ? !near(tv, vv) : tv !== vv;
    if (differ) conflicts.push(`${label}: text ${tv} vs screenshot ${vv} — text kept`);
  };
  take('symbol', 'ticker');
  if (m.assetType !== 'option' && v.assetType === 'option' && text.strike == null) { m.assetType = 'option'; }
  take('optionType', 'call/put');
  take('strike', 'strike');
  take('expiry', 'expiry');
  take('qty', 'size');
  take('price', 'price');
  if (m.realizedPnl == null) m.realizedPnl = v.realizedPnl;
  if (text.action !== v.action) conflicts.push(`action: text says ${text.action}, screenshot says ${v.action} — text kept`);
  if (m.direction == null && v.direction) m.direction = v.direction;
  if (v.time !== v.postedAt && text.action === v.action) m.time = v.time; // the screenshot's own fill time is more precise
  m.flags.push(...v.flags, ...conflicts.map((c) => `conflict — ${c}`));
  m.label = `${text.label} [+ ${v.label}]`;
  const legs = [m, ...vis.filter((_, i) => i !== idx)];
  return { legs, conflicts };
}
