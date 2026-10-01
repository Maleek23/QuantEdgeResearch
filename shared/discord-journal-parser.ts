/**
 * Discord → journal parser.
 *
 * Turns a trader's Discord channel (a DiscordChatExporter JSON/CSV export, or
 * messages read through the Discord REST API) into journal trades and notes.
 * Pure: no I/O, no clock, no randomness — the same messages always parse the
 * same way, which is what makes re-imports idempotent (keys are message ids).
 *
 * GRAMMAR (case-insensitive; markdown, emoji and mentions are stripped first)
 *
 *   instrument  := TICKER [MM/DD[/YY]] STRIKE(c|p|call|put)[s] [MM/DD[/YY] | 0dte]
 *                | $TICKER                                    (stock)
 *                | TICKER after an action verb                (stock)
 *   price       := "@" N | ("at" | "filled" | "avg" | "entry") N
 *   percent     := [+-]N"%"            (on exits/trims: the trade's result)
 *   quantity    := "x"N | N ("contracts"|"cons"|"cts"|"shares") | "qty" N
 *
 *   TRIM   trim | trimmed | trimming | scaled out | sold half | took some | partials | paid myself
 *   EXIT   out | all out | sold | sell | closed | close | exit(ed) | stopped (out) | cut | took profit(s) | tp
 *   ENTRY  in | entry | entered | bought | buy | bto | long | opened | grabbed | took | starter | added | adding | loaded
 *   SHORT  short | shorted | sto | sold to open        (entry on the short side)
 *
 *   Precedence: TRIM > EXIT > ENTRY. A message with an option contract and a
 *   price but no verb ("BE 300c 10/2 @1.00") is an entry. "in"/"out"/"long" only
 *   count as verbs at the start of a message or right before an instrument, so
 *   "in the money" or "out of town" stay prose.
 *
 * PAIRING (per author, in time order)
 *   entry  → opens a position keyed SYMBOL|type|strike|expiry (a second entry on
 *            the same key is an add; prices average by stated size, equally if unstated)
 *   exit   → closes the position it replies to; else the open position with the
 *            same contract; else the most recent open one on the same symbol; else,
 *            with no symbol, the only open position. Anything else is kept as a note.
 *   trim   → attached to its position as a note line; sized trims (qty stated on
 *            both sides) are realised in the P&L, unsized ones are listed but not counted.
 *   Exit price is the stated price, else entry × (1 + percent), flagged as derived.
 *   An exit with neither is kept as a note — the journal never books a P&L it
 *   cannot compute. Unstated size is journaled as 1 contract/share and said so.
 *
 * Everything that isn't a trade leg (analysis, charts, commentary) becomes a
 * note linked to the tickers it mentions and the New York day it was posted.
 */
import { ENGLISH_CAPS, isTickerJargon } from './ticker-stoplist';


// ─── Input normalisation ─────────────────────────────────────

export interface DiscordAttachment { url: string; name: string; isImage: boolean }

export interface DiscordMsg {
  id: string;
  /** ISO timestamp. */
  timestamp: string;
  authorId: string;
  authorName: string;
  content: string;
  attachments: DiscordAttachment[];
  /** Id of the message this one replies to. */
  replyTo: string | null;
}

export interface NormalizeResult {
  format: 'dce-json' | 'api-json' | 'dce-csv';
  channel: string | null;
  messages: DiscordMsg[];
  skipped: { reason: string; count: number }[];
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp)(\?|$)/i;

function att(url: unknown, name: unknown, contentType?: unknown): DiscordAttachment | null {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  const n = typeof name === 'string' && name ? name : url.split('?')[0].split('/').pop() || 'attachment';
  const isImage = (typeof contentType === 'string' && contentType.startsWith('image/')) || IMAGE_RE.test(n) || IMAGE_RE.test(url);
  return { url, name: n, isImage };
}

/** 32-bit FNV-1a → base36; used to key CSV rows, which carry no message id. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function embedText(embeds: unknown): string {
  if (!Array.isArray(embeds)) return '';
  return embeds
    .map((e: any) => [e?.title, e?.description, ...(Array.isArray(e?.fields) ? e.fields.map((f: any) => `${f?.name ?? ''} ${f?.value ?? ''}`) : [])]
      .filter((x) => typeof x === 'string' && x.trim()).join('\n'))
    .filter(Boolean)
    .join('\n');
}

function embedImages(embeds: unknown): DiscordAttachment[] {
  if (!Array.isArray(embeds)) return [];
  const out: DiscordAttachment[] = [];
  for (const e of embeds as any[]) {
    for (const u of [e?.image?.url, e?.thumbnail?.url, ...(Array.isArray(e?.images) ? e.images.map((i: any) => i?.url) : [])]) {
      const a = att(u, null, 'image/');
      if (a) out.push(a);
    }
  }
  return out;
}

function fromJsonMessage(m: any): DiscordMsg | null {
  if (!m || typeof m !== 'object' || m.id == null || !m.timestamp) return null;
  if (Number.isNaN(Date.parse(m.timestamp))) return null;
  const author = m.author ?? {};
  const attachments = [
    ...(Array.isArray(m.attachments) ? m.attachments.map((a: any) => att(a?.url, a?.fileName ?? a?.filename, a?.content_type)) : []),
    ...embedImages(m.embeds),
  ].filter((a): a is DiscordAttachment => !!a);
  const text = [typeof m.content === 'string' ? m.content : '', embedText(m.embeds)].filter(Boolean).join('\n');
  return {
    id: String(m.id),
    timestamp: new Date(m.timestamp).toISOString(),
    authorId: String(author.id ?? author.name ?? 'unknown'),
    authorName: String(author.nickname || author.global_name || author.name || author.username || 'unknown'),
    content: text,
    attachments,
    replyTo: m.reference?.messageId ? String(m.reference.messageId) : m.message_reference?.message_id ? String(m.message_reference.message_id) : null,
  };
}

/** RFC-4180-ish CSV reader (quoted fields, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export function normalizeDiscordExport(raw: string): NormalizeResult {
  const text = raw.replace(/^\uFEFF/, '');
  const trimmed = text.trimStart();
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => { skipped[reason] = (skipped[reason] ?? 0) + 1; };
  const done = (format: NormalizeResult['format'], channel: string | null, messages: DiscordMsg[]): NormalizeResult => {
    const seen = new Set<string>();
    const uniq = messages.filter((m) => (seen.has(m.id) ? (skip('duplicate message id'), false) : (seen.add(m.id), true)));
    uniq.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
    return { format, channel, messages: uniq, skipped: Object.entries(skipped).map(([reason, count]) => ({ reason, count })) };
  };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: any;
    try { data = JSON.parse(trimmed); } catch { throw new Error('File looks like JSON but does not parse — export again with DiscordChatExporter (format: JSON).'); }
    const list: any[] | null = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : null;
    if (!list) throw new Error('JSON has no "messages" array — expected a DiscordChatExporter JSON export.');
    const msgs: DiscordMsg[] = [];
    for (const m of list) {
      const n = fromJsonMessage(m);
      if (n) msgs.push(n); else skip('missing id or timestamp');
    }
    const channel = data?.channel?.name ? `${data?.guild?.name ? `${data.guild.name} / ` : ''}#${data.channel.name}` : null;
    return done(Array.isArray(data) ? 'api-json' : 'dce-json', channel, msgs);
  }

  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The file is empty.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iAuthorId = col('authorid'), iAuthor = col('author'), iDate = col('date'), iContent = col('content'), iAtt = col('attachments');
  if (iDate < 0 || iContent < 0) {
    throw new Error('Unrecognised file. Upload a DiscordChatExporter export: JSON, or CSV with AuthorID, Author, Date, Content, Attachments columns.');
  }
  const msgs: DiscordMsg[] = [];
  for (const r of rows.slice(1)) {
    const date = r[iDate]?.trim();
    const t = date ? Date.parse(date) : NaN;
    if (Number.isNaN(t)) { skip('unreadable date'); continue; }
    const authorId = (iAuthorId >= 0 ? r[iAuthorId] : '')?.trim() || (iAuthor >= 0 ? r[iAuthor] : '')?.trim() || 'unknown';
    const content = r[iContent] ?? '';
    const ts = new Date(t).toISOString();
    msgs.push({
      // CSV exports carry no message id; the key is a hash of author + time + text, so
      // re-importing the same export is still idempotent.
      id: `csv-${fnv1a(`${authorId}|${ts}|${content}`)}`,
      timestamp: ts,
      authorId,
      authorName: (iAuthor >= 0 ? r[iAuthor] : '')?.trim() || authorId,
      content,
      attachments: (iAtt >= 0 ? (r[iAtt] ?? '') : '').split(/[,\s]+/).map((u) => att(u, null)).filter((a): a is DiscordAttachment => !!a),
      replyTo: null,
    });
  }
  return done('dce-csv', null, msgs);
}

// ─── Message grammar ─────────────────────────────────────────

export type MsgKind = 'entry' | 'exit' | 'trim' | 'note';

export interface ParsedMessage {
  msg: DiscordMsg;
  kind: MsgKind;
  /** Primary instrument, when one is named. */
  symbol: string | null;
  assetType: 'stock' | 'option' | 'future' | null;
  optionType: 'call' | 'put' | null;
  strike: number | null;
  /** YYYY-MM-DD */
  expiry: string | null;
  price: number | null;
  /** Signed percent result stated on an exit/trim. */
  pct: number | null;
  qty: number | null;
  /** Instrument side for an entry (short = shorted stock / sold-to-open). */
  side: 'long' | 'short';
  /** Every ticker the message mentions (notes are linked to these). Chart jargon and English caps are dropped. */
  tickers: string[];
  /** The subset of `tickers` the writer marked as an instrument ($X, a contract, "X calls", a leading "X:"). */
  explicitTickers: string[];
  setup: string | null;
  /** Cleaned text (markdown/emoji/mentions stripped). */
  text: string;
  /** Stated stop ("stop 2.5", "sl 440") — same units as the entry (premium for options). */
  stop: number | null;
  /** Stated target ("pt 3", "target 460", "tgt 1.5"). */
  target: number | null;
  /**
   * How sure the grammar is that this reading is right, 0–1. Notes are 0.
   * Built from what was stated: instrument, full contract, price, explicit verb, size.
   */
  confidence: number;
  /** A note that still reads like a trade (contract, or ticker + trade words) — goes to the review list. */
  tradeLooking: boolean;
}

const VERB_WORDS = new Set([
  'in', 'out', 'entry', 'entered', 'entering', 'bought', 'buy', 'buying', 'bto', 'sto', 'long', 'short', 'shorted', 'shorting',
  'opened', 'opening', 'open', 'grabbed', 'grab', 'took', 'taking', 'starter', 'added', 'adding', 'add', 'loaded', 'load',
  'sold', 'sell', 'selling', 'closed', 'close', 'closing', 'exit', 'exited', 'exiting', 'stopped', 'stop', 'cut', 'cutting',
  'tp', 'trim', 'trimmed', 'trimming', 'scaled', 'scaling', 'partial', 'partials', 'all', 'fully', 'at', 'for', 'and', 'the',
  'my', 'some', 'half', 'more', 'still', 'holding', 'hold', 'here', 'this', 'that', 'on', 'of', 'to', 'a', 'an',
]);

/** Upper-case words that are not tickers when they float free in prose. */
const STOPWORDS = new Set([
  'I', 'A', 'AM', 'PM', 'ET', 'EST', 'EDT', 'PST', 'CST', 'IN', 'OUT', 'TP', 'SL', 'ATH', 'ATL', 'EOD', 'EOW', 'DTE', 'ITM', 'OTM', 'ATM',
  'IV', 'CALL', 'CALLS', 'PUT', 'PUTS', 'LOL', 'LMAO', 'IMO', 'IMHO', 'FOMC', 'CPI', 'PPI', 'GDP', 'PCE', 'NFP', 'FED', 'USA', 'US', 'OK',
  'OMG', 'WTF', 'GG', 'GM', 'GN', 'NFA', 'DD', 'TA', 'PT', 'PTS', 'RSI', 'MACD', 'EMA', 'SMA', 'VWAP', 'HOD', 'LOD', 'PDH', 'PDL', 'ORB',
  'AH', 'PM', 'RTH', 'BTO', 'STO', 'BTC', 'STC', 'LONG', 'SHORT', 'BUY', 'SELL', 'SOLD', 'ALL', 'THE', 'AND', 'FOR', 'NOT', 'YES', 'NO',
  'NEW', 'NOW', 'UP', 'DOWN', 'IT', 'IS', 'MY', 'ON', 'AT', 'TO', 'OF', 'OR', 'IF', 'SO', 'BE', 'WE', 'ME', 'HE', 'DO', 'GO', 'AS', 'BY',
  'AN', 'ARE', 'WAS', 'BUT', 'YOU', 'CAN', 'GET', 'GOT', 'HAS', 'HAD', 'OFF', 'OUR', 'OWN', 'TOO', 'WHY', 'HOW', 'WHO', 'ANY', 'ONE',
  'TWO', 'Q1', 'Q2', 'Q3', 'Q4', 'YTD', 'EPS', 'ER', 'CEO', 'CFO', 'AI', 'EV', 'IPO', 'ETF', 'SEC', 'FDA', 'WSB', 'RIP', 'TBH', 'IDK',
  'LFG', 'HUGE', 'NICE', 'WOW', 'EZ', 'GAP', 'RED', 'GREEN', 'WEEK', 'DAY', 'TODAY', 'MAX', 'MIN', 'AVG', 'QTY', 'EXP', 'STOP', 'TRIM',
]);

/** Crypto majors traders write without a $ (BTC is otherwise a "buy to close" stopword). */
const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']);

/**
 * Index/commodity futures roots (optionally written "/ES"). Their prices are
 * often posted without decimals ("long ES 5850") — read as the price, not a size.
 */
export const FUTURES = new Set(['ES', 'MES', 'NQ', 'MNQ', 'YM', 'MYM', 'RTY', 'M2K', 'CL', 'MCL', 'GC', 'MGC', 'SI', 'NG', 'ZB', 'ZN', 'HG']);

const SETUP_WORDS: [RegExp, string][] = [
  [/\b0\s?dte\b/i, '0DTE'],
  [/\blotto(?:s)?\b/i, 'lotto'],
  [/\bscalp(?:s|ing)?\b/i, 'scalp'],
  [/\bswing(?:s|ing)?\b/i, 'swing'],
  [/\bleaps?\b/i, 'LEAPS'],
  [/\bearnings? play\b/i, 'earnings'],
];

export function cleanDiscordText(s: string): string {
  return s
    .replace(/<a?:\w+:\d+>/g, ' ')          // custom emoji
    .replace(/<[@#][!&]?\d+>/g, ' ')         // user / channel / role mentions
    .replace(/https?:\/\/\S+/g, ' ')        // links (attachments are kept separately)
    .replace(/(\*\*|__|~~|\|\||`{1,3})/g, '') // markdown
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ') // emoji
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** YYYY-MM-DD for "10/2", "10/2/26", "10/02/2026", resolved against the post date. */
export function resolveExpiry(mmdd: string, postedIso: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(mmdd);
  if (!m) return null;
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const posted = new Date(postedIso);
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : posted.getUTCFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (!m[3]) {
    // No year: an expiry more than a week before the post is next year's (Dec → Jan).
    const candidate = Date.UTC(y, mo - 1, d);
    if (candidate < posted.getTime() - 7 * 86_400_000) y += 1;
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export const discordDayKey = (iso: string) => nyDay.format(new Date(iso));

const NUM = String.raw`(\d{1,6}(?:\.\d{1,4})?|\.\d{1,4})`;
const OPT_RE = new RegExp(
  String.raw`(?:^|[\s(,;])\$?([A-Za-z]{1,6}(?:\.[A-Za-z])?)\s+(?:(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|0\s?dte)\s+)?(\d{1,5}(?:\.\d{1,2})?)\s?(c|p|calls?|puts?)\b(?:\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|0\s?dte))?`,
  'i',
);
const DOLLAR_TICKER_RE = /\$([A-Za-z]{1,6}(?:\.[A-Za-z])?)\b/g;
const PRICE_RE = new RegExp(String.raw`(?:@\s*\$?|\b(?:at|filled(?:\s+at)?|avg|average|entry(?:\s+at)?|in\s+at|for)\s+\$?)${NUM}(?![\d.])(?!\s?%)(?!\s?(?:c|p|calls?|puts?|days?|weeks?|months?|mins?|minutes?|hours?|hrs?|dte|x)\b)`, 'i');
const PCT_RE = /([+-]?\s?\d{1,5}(?:\.\d{1,2})?)\s?%/;
const QTY_RE = /(?:\bx\s?(\d{1,5})\b|\b(\d{1,5})\s?(?:contracts?|cons|cts|shares|shrs)\b|\bqty:?\s?(\d{1,5})\b)/i;

const TRIM_RE = /\b(trim(?:med|ming)?|scal(?:ed|ing) out|sold (?:half|some|a few|\d+)|took some|partials?|paid myself)\b/i;
const EXIT_RE = /\b(all out|fully out|sold|selling|sell|closed|closing|exit(?:ed|ing)?|stopped(?: out)?|stop(?:ped)? hit|cut(?:ting)?|took profits?|tp'?d)\b/i;
const EXIT_LEAD_RE = /^(?:out|close|tp)\b/i;
const OUT_BEFORE_RE = /\bout\s+(?:of\s+)?(?:\$?[A-Za-z]{1,6}\b\s+\d|\$[A-Za-z]|[+-]?\d)/i;
const ENTRY_RE = /\b(entry|entered|entering|bought|buying|bto|opened|opening|grabbed|starter|added|adding|loaded|took a|taking a)\b/i;
const ENTRY_LEAD_RE = /^(?:in|long|buy|add|grabbing|taking)\b/i;
const IN_BEFORE_RE = /\b(?:in|long|buy|add)\s+(?:on\s+|some\s+)?\$?[A-Za-z]{1,6}\b(?:\s+\d|\s*@|\s+at\b|\s*$)/i;
const SHORT_RE = /\b(short(?:ed|ing)?|sto|sold to open)\b/i;
const LOSS_WORDS_RE = /\b(loss|stopped|stop(?:ped)? hit|down|red|cut)\b/i;
/** "stop 2.5", "stop @ 1.2", "stop loss at 440", "sl 140" — never "stopped". */
const STOP_CLAUSE_RE = new RegExp(String.raw`\b(?:stop(?!ped)(?:[\s-]?loss)?|sl)\s*(?::|@|at|=)?\s*\$?${NUM}(?!\s?%)`, 'i');
/**
 * "pt 3", "target 460", "tgt: 1.5", "targets 3/4" (first one), "take profit at 5",
 * and "TP 5.00" when TP is NOT the first word ("…| SL 2.00 | TP 5.00"); a
 * message that STARTS with "tp" is an exit ("tp META 600c @ 9.4").
 */
const TARGET_CLAUSE_RE = new RegExp(String.raw`(?:\b(?:targets?|tgt|pt|take[\s-]profit)|(?<=[^\s].*?[\s|,;/(])tp)\s*(?::|@|at|=)?\s*\$?${NUM}(?!\s?%)`, 'i');
/** "100 shares of F", "5 calls on T" — the ticker after a size + instrument word (case-sensitive ticker). */
const CONTEXT_TICKER_RE = /\b\d{1,6}\s+(?:shares?|shrs|calls?|puts?|contracts?)\s+(?:of\s+|on\s+|in\s+)?\$?([A-Z]{1,5})\b/;
/** "F calls", "T puts", "X shares" — a capital ticker right before the instrument word. */
const CONTEXT_TICKER_AFTER_RE = /(?:^|[\s(])\/?([A-Z]{1,5})\s+(?:calls|puts|shares)\b/;
const TRADE_WORDS_RE = /\b(calls?|puts?|entry|entered|bought|sold|long|short|stop|target|pt|trim(?:med)?|scal(?:ed|ing)|filled|contracts?|strike|exp(?:iry)?|leaps?|0\s?dte|lotto)\b/i;

function numberOf(s: string | undefined): number | null {
  if (s == null) return null;
  const v = Number(s.replace(/\s+/g, ''));
  return Number.isFinite(v) ? v : null;
}

export function parseDiscordMessage(msg: DiscordMsg): ParsedMessage {
  const text = cleanDiscordText(msg.content);
  const lead = text.replace(/^[^A-Za-z0-9$]+/, '');
  const base: ParsedMessage = {
    msg, kind: 'note', symbol: null, assetType: null, optionType: null, strike: null, expiry: null,
    price: null, pct: null, qty: null, side: 'long', tickers: [], explicitTickers: [], setup: null, text,
    stop: null, target: null, confidence: 0, tradeLooking: false,
  };

  // Instrument ─────────────────────────────
  const opt = OPT_RE.exec(text);
  if (opt && !VERB_WORDS.has(opt[1].toLowerCase())) {
    base.symbol = opt[1].toUpperCase();
    base.assetType = 'option';
    base.strike = Number(opt[3]);
    base.optionType = opt[4].toLowerCase().startsWith('c') ? 'call' : 'put';
    const exp = opt[2] ?? opt[5];
    if (exp) base.expiry = /dte/i.test(exp) ? discordDayKey(msg.timestamp) : resolveExpiry(exp, msg.timestamp);
    if (!base.expiry) {
      const later = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/.exec(text.slice(opt.index + opt[0].length));
      if (later) base.expiry = resolveExpiry(later[1], msg.timestamp);
      else if (/\b0\s?dte\b/i.test(text)) base.expiry = discordDayKey(msg.timestamp);
    }
  }

  const tickers = new Set<string>();
  const explicit = new Set<string>();
  const mark = (t: string) => { tickers.add(t); explicit.add(t); };
  if (base.symbol) mark(base.symbol);
  for (const m of text.matchAll(DOLLAR_TICKER_RE)) mark(m[1].toUpperCase());
  // "CRWD: golden pocket…" — a ticker leading a line with a colon. Explicit for
  // jargon purposes (BB, BE, MA are real names), never for English words.
  for (const m of text.matchAll(/(?:^|\n)\s*([A-Z]{1,5})\s*:(?!\d)/g)) {
    if (!ENGLISH_CAPS.has(m[1]) && !STOPWORDS.has(m[1])) mark(m[1]);
  }
  // Bare capitals in prose: never chart jargon (HH, HTF, RR, OI…) or English caps (HOLY…).
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const w = m[1];
    if (CRYPTO.has(w)) { tickers.add(w); continue; }
    if (!STOPWORDS.has(w) && !isTickerJargon(w)) tickers.add(w);
  }
  // A single capital letter is a ticker with a $ (F, T, X…), or when the words
  // around it say it is an instrument: "100 shares of F", "F calls", "T puts".
  const ctx = CONTEXT_TICKER_RE.exec(text) ?? CONTEXT_TICKER_AFTER_RE.exec(text);
  const ctxTicker = ctx && !STOPWORDS.has(ctx[1]) && !VERB_WORDS.has(ctx[1].toLowerCase()) ? ctx[1] : null;
  if (ctxTicker) mark(ctxTicker);
  base.tickers = [...tickers];
  base.explicitTickers = [...explicit];

  // Stock instrument: $TICKER, or TICKER right after a verb.
  if (!base.symbol) {
    const dollar = /\$([A-Za-z]{1,6}(?:\.[A-Za-z])?)\b/.exec(text);
    const afterVerb = /\b(?:in|long|short(?:ed)?|bought|buy|added|adding|sold|out(?: of)?|closed|trimmed|trim|exited|cut|stopped out(?: of)?)\s+(?:(?:on|some|more|half|all|of|my|the|rest|a|few|\d+)\s+)*\$?([A-Za-z]{1,6}(?:\.[A-Za-z])?)\b/i.exec(text);
    const cand = dollar?.[1] ?? (afterVerb && !VERB_WORDS.has(afterVerb[1].toLowerCase())
      && (afterVerb[1] === afterVerb[1].toUpperCase() || tickers.has(afterVerb[1].toUpperCase()))
      ? afterVerb[1] : null) ?? ctxTicker;
    if (cand) {
      base.symbol = cand.toUpperCase().replace(/^\//, '');
      base.assetType = CRYPTO.has(base.symbol) ? null : FUTURES.has(base.symbol) ? 'future' : 'stock';
    }
  }

  // Numbers ────────────────────────────────
  // Stop / target clauses are read first and removed, so "stop at 440" is never the entry price.
  const stopM = STOP_CLAUSE_RE.exec(text);
  const targetM = TARGET_CLAUSE_RE.exec(text);
  base.stop = numberOf(stopM?.[1]);
  base.target = numberOf(targetM?.[1]);
  const priceText = text.replace(STOP_CLAUSE_RE, ' ').replace(TARGET_CLAUSE_RE, ' ');
  const priceM = PRICE_RE.exec(priceText);
  base.price = numberOf(priceM?.[1]);
  if (base.price == null && base.assetType === 'stock' && base.symbol) {
    // "long AMD 145.20" — a decimal right after the ticker.
    const m = new RegExp(String.raw`\$?${base.symbol.replace('.', '\\.')}\s+\$?(\d{1,6}\.\d{1,4})\b(?!\s?%)`, 'i').exec(priceText);
    base.price = numberOf(m?.[1]);
  }
  if (base.price == null && base.assetType === 'future' && base.symbol) {
    // "long ES 5850" — futures prices are posted without decimals; 3+ digits right after the root.
    const m = new RegExp(String.raw`\/?\b${base.symbol}\s+(\d{3,6}(?:\.\d{1,2})?)\b(?!\s?%)`, 'i').exec(priceText);
    base.price = numberOf(m?.[1]);
  }
  const pctM = PCT_RE.exec(priceText);
  if (pctM) {
    let v = numberOf(pctM[1]);
    if (v != null && !/[+-]/.test(pctM[1]) && LOSS_WORDS_RE.test(text)) v = -Math.abs(v);
    base.pct = v;
  }
  const qtyM = QTY_RE.exec(text);
  base.qty = numberOf(qtyM?.[1] ?? qtyM?.[2] ?? qtyM?.[3]);
  if (base.qty != null && base.qty <= 0) base.qty = null;

  for (const [re, name] of SETUP_WORDS) if (re.test(text)) { base.setup = name; break; }
  const hashtag = /#([a-z][\w-]{1,24})/i.exec(text);
  if (!base.setup && hashtag) base.setup = hashtag[1].toLowerCase();

  // Classification ─────────────────────────
  const isTrim = TRIM_RE.test(text);
  const isExit = !isTrim && (EXIT_RE.test(text) || EXIT_LEAD_RE.test(lead) || OUT_BEFORE_RE.test(text));
  const isShort = SHORT_RE.test(text);
  const isEntry = !isTrim && !isExit && (ENTRY_RE.test(text) || ENTRY_LEAD_RE.test(lead) || IN_BEFORE_RE.test(text) || isShort);

  // "Stop hit on RIVN": an exit/trim naming exactly one ticker is about that ticker.
  if ((isTrim || isExit) && !base.symbol && base.tickers.length === 1 && !CRYPTO.has(base.tickers[0])) {
    base.symbol = base.tickers[0];
    base.assetType = FUTURES.has(base.symbol) ? 'future' : 'stock';
  }

  if (isTrim) base.kind = 'trim';
  else if (isExit) base.kind = 'exit';
  else if (isEntry && base.symbol) base.kind = 'entry';
  else if (base.assetType === 'option' && base.price != null) base.kind = 'entry'; // "BE 300c 10/2 @1.00"
  else base.kind = 'note';

  if (base.kind === 'entry') {
    base.side = isShort ? 'short' : 'long';
    base.pct = null; // a % on an entry is commentary ("up 5% premarket"), not a result
    if (base.symbol && CRYPTO.has(base.symbol)) base.assetType = 'stock';
    if (base.symbol && FUTURES.has(base.symbol) && base.assetType === 'stock') base.assetType = 'future';
    if (!base.assetType) base.assetType = 'stock';
  }

  // Confidence ─────────────────────────────
  const explicitVerb = ENTRY_RE.test(text) || ENTRY_LEAD_RE.test(lead) || IN_BEFORE_RE.test(text) || isShort;
  if (base.kind === 'entry') {
    let c = 0.4;
    if (base.symbol) c += 0.1;
    if (base.price != null) c += 0.2;
    if (base.assetType === 'option') c += base.strike != null && base.expiry ? 0.15 : 0.05;
    else if (/\$[A-Za-z]/.test(text)) c += 0.1;
    if (explicitVerb) c += 0.1;
    if (base.qty != null) c += 0.05;
    base.confidence = Math.min(0.99, Math.round(c * 100) / 100);
  } else if (base.kind === 'exit' || base.kind === 'trim') {
    let c = 0.5;
    if (base.price != null) c += 0.25; else if (base.pct != null) c += 0.15;
    if (base.symbol) c += 0.1;
    base.confidence = Math.min(0.99, Math.round(c * 100) / 100);
  } else {
    base.tradeLooking = base.assetType === 'option' || (base.tickers.length > 0 && TRADE_WORDS_RE.test(text) && (base.stop != null || base.target != null || base.price != null || /\b(calls?|puts?|entry|entered|bought|sold|filled|contracts?)\b/i.test(text)));
  }
  return base;
}

// ─── Pairing ─────────────────────────────────────────────────

export interface DiscordTrade {
  /** Entry message id — the idempotency key (journal broker_order_id = discord:<key>). */
  key: string;
  authorId: string;
  symbol: string;
  assetType: 'stock' | 'option' | 'future';
  optionType: 'call' | 'put' | null;
  strikePrice: number | null;
  expiryDate: string | null;
  direction: 'long' | 'short';
  quantity: number;
  qtyStated: boolean;
  entryPrice: number;
  entryTime: string;
  exitPrice: number | null;
  exitTime: string | null;
  exitDerivedFromPct: number | null;
  status: 'open' | 'closed';
  setupType: string | null;
  screenshot: string | null;
  messageIds: string[];
  /** Timeline of the trade's messages, then the parser's disclosures. */
  notes: string;
  flags: string[];
  /** Stated stop / target (entry message, adds, or replies to the trade), same units as the entry. */
  stop: number | null;
  target: number | null;
  /** How the exit found this trade — a reply is certain, "the only open position" is a guess. */
  exitVia: ExitVia | null;
  /** Parse confidence 0–1: min(entry, exit) readings × how the exit was matched. */
  confidence: number;
}

export type ExitVia = 'reply' | 'contract' | 'ticker' | 'only-open';
const VIA_FACTOR: Record<ExitVia, number> = { reply: 1, contract: 0.95, ticker: 0.85, 'only-open': 0.7 };

export type DiscordNoteReason = 'analysis' | 'unmatched_exit' | 'unpriced_exit' | 'entry_without_price';

export interface DiscordNote {
  messageId: string;
  authorId: string;
  postedAt: string;
  /** New York trading day. */
  day: string;
  symbols: string[];
  body: string;
  attachments: DiscordAttachment[];
  reason: DiscordNoteReason;
}

export interface PairResult {
  trades: DiscordTrade[];
  notes: DiscordNote[];
  /** Counts for the preview. */
  stats: { messages: number; entries: number; exits: number; trims: number; notes: number; ignored: number; closedTrades: number; openTrades: number };
}

interface Leg { price: number | null; qty: number | null; time: string; id: string; pct?: number | null; conf?: number; via?: ExitVia }

interface Position {
  key: string;
  instrument: string;
  authorId: string;
  first: ParsedMessage;
  side: 'long' | 'short';
  entries: Leg[];
  trims: Leg[];
  exit: Leg | null;
  lines: string[];
  ids: Set<string>;
  shots: string[];
  setup: string | null;
  stop: number | null;
  target: number | null;
}

const instrumentKey = (p: Pick<ParsedMessage, 'symbol' | 'optionType' | 'strike' | 'expiry'>) =>
  `${p.symbol}|${p.optionType ?? ''}|${p.strike ?? ''}|${p.expiry ?? ''}`;

const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const MIN_NOTE_CHARS = 12;

export function pairDiscordMessages(input: DiscordMsg[]): PairResult {
  const parsed = [...input]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id))
    .map(parseDiscordMessage);

  const open: Position[] = [];
  const done: Position[] = [];
  const byMsg = new Map<string, Position>();
  const notes: DiscordNote[] = [];
  const stats = { messages: parsed.length, entries: 0, exits: 0, trims: 0, notes: 0, ignored: 0, closedTrades: 0, openTrades: 0 };

  const note = (p: ParsedMessage, reason: DiscordNoteReason) => {
    const body = p.text || p.msg.content.trim();
    if (reason === 'analysis' && body.length < MIN_NOTE_CHARS && !p.msg.attachments.length && !p.tickers.length) {
      stats.ignored++;
      return;
    }
    stats.notes++;
    notes.push({
      messageId: p.msg.id, authorId: p.msg.authorId, postedAt: p.msg.timestamp, day: discordDayKey(p.msg.timestamp),
      symbols: p.tickers, body, attachments: p.msg.attachments, reason,
    });
  };
  const line = (pos: Position, p: ParsedMessage, label: string) => {
    pos.lines.push(`[${stamp(p.msg.timestamp)} ET] ${label}: ${p.text || '(attachment)'}`);
    pos.ids.add(p.msg.id);
    byMsg.set(p.msg.id, pos);
    for (const a of p.msg.attachments) if (a.isImage) pos.shots.push(a.url);
    if (!pos.setup && p.setup) pos.setup = p.setup;
    if (pos.stop == null && p.stop != null) pos.stop = p.stop;
    if (pos.target == null && p.target != null) pos.target = p.target;
  };

  const findOpen = (p: ParsedMessage): [Position, ExitVia] | null => {
    const mine = open.filter((o) => o.authorId === p.msg.authorId);
    if (p.msg.replyTo) {
      const hit = byMsg.get(p.msg.replyTo);
      if (hit && open.includes(hit)) return [hit, 'reply'];
    }
    if (p.symbol && p.assetType === 'option') {
      const k = instrumentKey(p);
      const exact = [...mine].reverse().find((o) => o.instrument === k);
      if (exact) return [exact, 'contract'];
      // Same contract without the expiry restated ("out BE 300c +300%").
      const loose = [...mine].reverse().find((o) => o.first.symbol === p.symbol && o.first.strike === p.strike && o.first.optionType === p.optionType);
      if (loose) return [loose, 'contract'];
    }
    if (p.symbol) {
      const t = [...mine].reverse().find((o) => o.first.symbol === p.symbol);
      return t ? [t, 'ticker'] : null;
    }
    return mine.length === 1 ? [mine[0], 'only-open'] : null;
  };

  for (const p of parsed) {
    if (p.kind === 'entry') {
      if (p.price == null) { note(p, 'entry_without_price'); continue; }
      stats.entries++;
      const k = instrumentKey(p);
      const existing = [...open].reverse().find((o) => o.authorId === p.msg.authorId && o.instrument === k && o.side === p.side);
      if (existing) {
        existing.entries.push({ price: p.price, qty: p.qty, time: p.msg.timestamp, id: p.msg.id });
        line(existing, p, 'add');
        continue;
      }
      const pos: Position = {
        key: p.msg.id, instrument: k, authorId: p.msg.authorId, first: p, side: p.side,
        entries: [{ price: p.price, qty: p.qty, time: p.msg.timestamp, id: p.msg.id, conf: p.confidence }],
        trims: [], exit: null, lines: [], ids: new Set(), shots: [], setup: null, stop: null, target: null,
      };
      line(pos, p, 'entry');
      open.push(pos);
      continue;
    }

    if (p.kind === 'exit' || p.kind === 'trim') {
      const found = findOpen(p);
      if (!found) { note(p, 'unmatched_exit'); continue; }
      const [pos, via] = found;
      if (p.kind === 'trim') {
        stats.trims++;
        pos.trims.push({ price: p.price, qty: p.qty, time: p.msg.timestamp, id: p.msg.id, pct: p.pct });
        line(pos, p, 'trim');
        continue;
      }
      stats.exits++;
      pos.exit = { price: p.price, qty: p.qty, time: p.msg.timestamp, id: p.msg.id, pct: p.pct, conf: p.confidence, via };
      line(pos, p, 'exit');
      open.splice(open.indexOf(pos), 1);
      done.push(pos);
      continue;
    }

    // A note that replies to an open trade (chart update, thesis) joins its timeline.
    const parent = p.msg.replyTo ? byMsg.get(p.msg.replyTo) : undefined;
    if (parent && open.includes(parent)) { line(parent, p, 'update'); continue; }
    note(p, 'analysis');
  }

  const trades: DiscordTrade[] = [];
  for (const pos of [...done, ...open]) {
    const flags: string[] = [];
    const f = pos.first;
    const sized = pos.entries.every((e) => e.qty != null);
    const qty = sized ? pos.entries.reduce((s, e) => s + (e.qty ?? 0), 0) : pos.entries.length === 1 ? 1 : pos.entries.length;
    const entryPrice = sized
      ? pos.entries.reduce((s, e) => s + (e.price ?? 0) * (e.qty ?? 0), 0) / qty
      : pos.entries.reduce((s, e) => s + (e.price ?? 0), 0) / pos.entries.length;
    if (!sized) {
      flags.push(pos.entries.length > 1
        ? `Size not stated — ${pos.entries.length} entries journaled as 1 ${f.assetType === 'option' ? 'contract' : 'share'} each, averaged equally.`
        : `Size not stated — journaled as 1 ${f.assetType === 'option' ? 'contract' : 'share'}.`);
    }

    let exitPrice: number | null = null;
    let derived: number | null = null;
    let exitTime: string | null = null;
    let status: 'open' | 'closed' = 'open';
    if (pos.exit) {
      if (pos.exit.price != null) exitPrice = pos.exit.price;
      else if (pos.exit.pct != null) {
        const sign = pos.side === 'short' ? -1 : 1;
        exitPrice = Math.max(0, entryPrice * (1 + sign * (pos.exit.pct / 100)));
        derived = pos.exit.pct;
        flags.push(`Exit price derived from the stated ${pos.exit.pct > 0 ? '+' : ''}${pos.exit.pct}% (no price posted).`);
      }
      if (exitPrice == null) {
        // Closed, but nothing to price it with: the journal won't invent a P&L.
        for (const id of pos.ids) byMsg.delete(id);
        notes.push({
          messageId: pos.exit.id, authorId: pos.authorId, postedAt: pos.exit.time, day: discordDayKey(pos.exit.time),
          symbols: [f.symbol!], attachments: [],
          body: `${pos.lines.join('\n')}\n— exit had no price or % so it is kept as a note, not a scored trade.`,
          reason: 'unpriced_exit',
        });
        stats.notes++;
        continue;
      }
      exitTime = pos.exit.time;
      status = 'closed';

      // Sized trims (both sides sized) are realised pro-rata; unsized trims are listed only.
      const sizedTrims = sized ? pos.trims.filter((t) => t.qty != null && (t.price != null || t.pct != null)) : [];
      if (sizedTrims.length) {
        let soldQty = 0, proceeds = 0;
        for (const t of sizedTrims) {
          const px = t.price ?? entryPrice * (1 + (pos.side === 'short' ? -1 : 1) * ((t.pct ?? 0) / 100));
          soldQty += t.qty!;
          proceeds += px * t.qty!;
        }
        const rest = Math.max(0, qty - soldQty);
        exitPrice = (proceeds + rest * exitPrice) / Math.max(qty, soldQty);
        flags.push(`${sizedTrims.length} sized trim${sizedTrims.length === 1 ? '' : 's'} averaged into the exit price.`);
      }
    }
    const unsizedTrims = pos.trims.length - (status === 'closed' && sized ? pos.trims.filter((t) => t.qty != null).length : 0);
    if (unsizedTrims > 0) flags.push(`${unsizedTrims} trim${unsizedTrims === 1 ? '' : 's'} without a size listed above — not included in the P&L.`);
    if (f.assetType === 'option' && !f.expiry) flags.push('Expiry not stated.');

    if (status === 'closed') stats.closedTrades++; else stats.openTrades++;
    const entryConf = pos.entries[0].conf ?? 0.5;
    let confidence = entryConf;
    if (pos.exit && status === 'closed') {
      confidence = Math.min(entryConf, pos.exit.conf ?? 0.5) * VIA_FACTOR[pos.exit.via ?? 'only-open'];
      if (derived != null) confidence -= 0.05;
    }
    confidence = Math.max(0.05, Math.round(confidence * 100) / 100);
    trades.push({
      key: pos.key,
      authorId: pos.authorId,
      symbol: f.symbol!,
      assetType: f.assetType === 'option' ? 'option' : f.assetType === 'future' ? 'future' : 'stock',
      optionType: f.optionType,
      strikePrice: f.strike,
      expiryDate: f.expiry,
      direction: pos.side,
      quantity: qty,
      qtyStated: sized,
      entryPrice: Math.round(entryPrice * 10_000) / 10_000,
      entryTime: pos.entries[0].time,
      exitPrice: exitPrice == null ? null : Math.round(exitPrice * 10_000) / 10_000,
      exitTime,
      exitDerivedFromPct: derived,
      status,
      setupType: pos.setup,
      screenshot: pos.shots[0] ?? null,
      messageIds: [...pos.ids],
      notes: [...pos.lines, ...(pos.shots.length > 1 ? [`Charts: ${pos.shots.slice(1).join(' ')}`] : []), ...(flags.length ? ['', ...flags.map((x) => `· ${x}`)] : [])].join('\n'),
      flags,
      stop: pos.stop,
      target: pos.target,
      exitVia: status === 'closed' ? pos.exit?.via ?? null : null,
      confidence,
    });
  }

  trades.sort((a, b) => Date.parse(a.entryTime) - Date.parse(b.entryTime));
  notes.sort((a, b) => Date.parse(a.postedAt) - Date.parse(b.postedAt));
  return { trades, notes, stats };
}

/** Distinct authors in an export, most active first — the preview lets you pick whose calls to import. */
export function discordAuthors(msgs: DiscordMsg[]): { authorId: string; authorName: string; messages: number }[] {
  const m = new Map<string, { authorId: string; authorName: string; messages: number }>();
  for (const x of msgs) {
    const e = m.get(x.authorId) ?? { authorId: x.authorId, authorName: x.authorName, messages: 0 };
    e.messages++;
    m.set(x.authorId, e);
  }
  return [...m.values()].sort((a, b) => b.messages - a.messages);
}
