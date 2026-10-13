/**
 * Quantinum Analyst — the deterministic half of Ask Quantinum.
 *
 *   PAGE CONTEXT   what the member is looking at (route, tab, focused ticker,
 *                  selected NEXUS setup, open tool) — strict parse, ids only.
 *   SLASH COMMANDS /levels /flow /setup /indices /sector /news /record — each
 *                  maps to ONE server tool that reads our existing services and
 *                  returns a structured card. No model in the loop, no invented
 *                  numbers: every fact on a card names its source + timestamp.
 *   RECORD         historical outcomes only from verified data (post-baseline
 *                  canonical model record, minus bar-ledger MISMATCH rows);
 *                  n < 20 → "too few to judge".
 *   HISTORY        one conversation per member shared across pages.
 */
import { normalizeSymbol } from './quantinum-ai';
import { parseHorizon, type Horizon } from './quantinum-horizon';

export const ANALYST_DISCLAIMER = 'Educational, can be wrong — decisions are yours.';
/** Below this many decided outcomes a record line says "too few to judge". */
export const RECORD_MIN_N = 20;

// ─── page context ───────────────────────────────────────────

export interface PageContext {
  route: string | null;
  tab: string | null;
  symbol: string | null;
  setupId: string | null;
  tool: string | null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const WORD_RE = /^[a-z0-9_-]{1,32}$/i;

export function parsePageContext(x: unknown): PageContext {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const route = typeof o.route === 'string' && /^\/[A-Za-z0-9\/_.-]{0,80}$/.test(o.route) ? o.route : null;
  const word = (v: unknown) => (typeof v === 'string' && WORD_RE.test(v) ? v.toLowerCase() : null);
  return {
    route,
    tab: word(o.tab),
    symbol: normalizeSymbol(o.symbol),
    setupId: typeof o.setupId === 'string' && ID_RE.test(o.setupId) ? o.setupId : null,
    tool: word(o.tool),
  };
}

/** One line for the model: what the member is looking at. */
export function pageContextLine(c: PageContext): string {
  const parts = [
    c.route ? `route ${c.route}` : null,
    c.tab ? `tab ${c.tab}` : null,
    c.tool ? `open tool ${c.tool}` : null,
    c.symbol ? `focused ticker ${c.symbol}` : null,
    c.setupId ? `selected NEXUS setup ${c.setupId}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'no page context';
}

// ─── slash commands ─────────────────────────────────────────

export const ANALYST_COMMANDS = ['levels', 'flow', 'setup', 'indices', 'sector', 'news', 'record'] as const;
export type AnalystCommand = (typeof ANALYST_COMMANDS)[number];

export interface CommandSpec { name: AnalystCommand; usage: string; hint: string; arg: 'symbol' | 'symbol-or-id' | 'name' | 'none' | 'symbol-or-pattern'; required: boolean }
export const COMMAND_SPECS: readonly CommandSpec[] = [
  { name: 'levels', usage: '/levels [sym]', hint: 'GEX walls for your timeframe + nearest price levels', arg: 'symbol', required: false },
  { name: 'flow', usage: '/flow [sym]', hint: 'Options tape today, filtered to your timeframe', arg: 'symbol', required: false },
  { name: 'setup', usage: '/setup [sym|id]', hint: 'The NEXUS setup: plan, grade, lifecycle + its verified record', arg: 'symbol-or-id', required: false },
  { name: 'indices', usage: '/indices', hint: 'SPX · SPY · QQQ — do they agree?', arg: 'none', required: false },
  { name: 'sector', usage: '/sector <name>', hint: 'One sector from the sector board', arg: 'name', required: true },
  { name: 'news', usage: '/news [sym]', hint: 'Last 24h headlines', arg: 'symbol', required: false },
  { name: 'record', usage: '/record [sym|pattern]', hint: 'Verified outcomes, e.g. "/record A long breakout"', arg: 'symbol-or-pattern', required: false },
];

/** Autocomplete: specs whose name starts with what follows the slash. */
export function suggestCommands(draft: string): CommandSpec[] {
  const m = /^\/([a-z]*)$/i.exec(draft.trim());
  if (!m) return [];
  const p = m[1].toLowerCase();
  return COMMAND_SPECS.filter((s) => s.name.startsWith(p));
}

export interface ParsedCommand { command: AnalystCommand; arg: string | null }
export type SlashParse = { ok: true; cmd: ParsedCommand } | { ok: false; error: string } | null;

/** null = not a slash command (ask the model). */
export function parseSlash(text: string): SlashParse {
  const t = String(text ?? '').trim();
  if (!t.startsWith('/')) return null;
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(t);
  if (!m) return { ok: false, error: 'Unknown command. Try /levels, /flow, /setup, /indices, /sector, /news or /record.' };
  const name = m[1].toLowerCase();
  if (!(ANALYST_COMMANDS as readonly string[]).includes(name)) return { ok: false, error: `Unknown command /${name}. Try /levels, /flow, /setup, /indices, /sector, /news or /record.` };
  const spec = COMMAND_SPECS.find((s) => s.name === name)!;
  const raw = (m[2] ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (spec.required && !raw) return { ok: false, error: `${spec.usage} needs an argument.` };
  return { ok: true, cmd: { command: name as AnalystCommand, arg: raw || null } };
}

/** Server-side argument validation; also resolves the default symbol from page context. */
export function resolveCommandArg(cmd: ParsedCommand, ctx: PageContext): { ok: true; symbol: string | null; id: string | null; text: string | null } | { ok: false; error: string } {
  const spec = COMMAND_SPECS.find((s) => s.name === cmd.command)!;
  const arg = cmd.arg ? cmd.arg.slice(0, 60) : null;
  switch (spec.arg) {
    case 'none': return { ok: true, symbol: null, id: null, text: null };
    case 'symbol': {
      if (!arg) return ctx.symbol ? { ok: true, symbol: ctx.symbol, id: null, text: null } : { ok: false, error: `${spec.usage}: no ticker given and none is focused on this page.` };
      const s = normalizeSymbol(arg.replace(/^\$/, ''));
      return s ? { ok: true, symbol: s, id: null, text: null } : { ok: false, error: `"${arg}" is not a ticker.` };
    }
    case 'symbol-or-id': {
      if (!arg) {
        if (ctx.setupId) return { ok: true, symbol: null, id: ctx.setupId, text: null };
        if (ctx.symbol) return { ok: true, symbol: ctx.symbol, id: null, text: null };
        return { ok: false, error: '/setup: no setup selected and no ticker focused — try /setup NVDA.' };
      }
      const s = normalizeSymbol(arg.replace(/^\$/, ''));
      if (s && arg.length <= 6) return { ok: true, symbol: s, id: null, text: null };
      return ID_RE.test(arg) ? { ok: true, symbol: null, id: arg, text: null } : { ok: false, error: `"${arg}" is not a ticker or setup id.` };
    }
    case 'name': {
      const n = (arg ?? '').toLowerCase().replace(/[^a-z0-9 &_-]/g, '').trim();
      return n ? { ok: true, symbol: null, id: null, text: n } : { ok: false, error: '/sector needs a sector name, e.g. /sector semis.' };
    }
    case 'symbol-or-pattern': {
      if (!arg) return { ok: true, symbol: ctx.symbol, id: null, text: null };
      return { ok: true, symbol: null, id: null, text: arg.toLowerCase().replace(/[^a-z0-9 .$-]/g, '').trim() };
    }
  }
}

// ─── record pattern ─────────────────────────────────────────

export interface RecordPattern { symbol: string | null; grade: string | null; direction: 'long' | 'short' | null; kind: string | null }
const KIND_WORDS = ['breakout', 'breakdown', 'pullback', 'reversal', 'momentum', 'squeeze', 'gap', 'bounce', 'swing', 'day', 'scalp', 'lotto', 'flow', 'gex', 'earnings', 'leaps'];

/** "A-grade long breakouts" → {grade:'A', direction:'long', kind:'breakout'}; "nvda" → {symbol:'NVDA'}. */
export function parseRecordPattern(text: string | null, fallbackSymbol: string | null = null): RecordPattern {
  const out: RecordPattern = { symbol: null, grade: null, direction: null, kind: null };
  if (!text) { out.symbol = fallbackSymbol; return out; }
  for (const raw of text.split(/[\s,]+/)) {
    const w = raw.toLowerCase().replace(/^\$/, '');
    if (!w) continue;
    const g = /^([a-f])(?:-?grade[sd]?)?$/.exec(w);
    if (g && !out.grade) { out.grade = g[1].toUpperCase(); continue; }
    if (/^(long|longs|bull|bullish|calls?)$/.test(w)) { out.direction = 'long'; continue; }
    if (/^(short|shorts|bear|bearish|puts?)$/.test(w)) { out.direction = 'short'; continue; }
    const k = KIND_WORDS.find((kw) => w === kw || w === `${kw}s` || w === `${kw}es`);
    if (k && !out.kind) { out.kind = k; continue; }
    if (/^grades?$/.test(w)) continue;
    const s = normalizeSymbol(w);
    if (s && !out.symbol && w.length <= 5) out.symbol = s;
  }
  return out;
}

export function patternLabel(p: RecordPattern): string {
  const bits = [p.symbol, p.grade ? `${p.grade}-grade` : null, p.direction, p.kind ? `${p.kind}s` : null].filter(Boolean);
  return bits.length ? bits.join(' ') : 'All setups';
}

// ─── cards ──────────────────────────────────────────────────

export interface CardSource { key: string; label: string; source: string; asOf: string | null }
export interface CardFact { key: string; label: string; value: number | string | null; unit?: '$' | '%' | 'R' | 'x' | 'B' | ''; src: string }
export interface CardTable { columns: string[]; rows: Array<{ key: string; cells: Array<string | number | null>; src: string }> }
export interface RecordLine {
  label: string; n: number; wins: number; losses: number; t1HitPct: number | null; since: string;
  verdict: 'ok' | 'too_few'; text: string; src: string; ledger: { asOf: string | null; mismatchesExcluded: number } | null;
}
export interface AnalystCard {
  command: AnalystCommand;
  title: string;
  subject: string | null;
  horizon: Horizon;
  /** ok = facts below; empty = nothing qualifies (a valid answer); unavailable = the source failed. */
  status: 'ok' | 'empty' | 'unavailable';
  message: string | null;
  facts: CardFact[];
  table: CardTable | null;
  record: RecordLine | null;
  notes: string[];
  sources: CardSource[];
  generatedAt: string;
  /** What re-running it needs. */
  request: { command: AnalystCommand; arg: string | null; horizon: Horizon; page: PageContext };
  disclaimer: string;
}

export function recordLine(label: string, r: { decided: number; wins: number; losses: number; since: string }, src: string, ledger: RecordLine['ledger']): RecordLine {
  const n = r.decided;
  const tooFew = n < RECORD_MIN_N;
  const pct = !tooFew && n > 0 ? Math.round((r.wins / n) * 1000) / 10 : null;
  const text = tooFew
    ? `${label}: too few to judge (n=${n}, since ${r.since})`
    : `${label}: T1 hit ${pct}% (n=${n}, since ${r.since})`;
  return { label, n, wins: r.wins, losses: r.losses, t1HitPct: pct, since: r.since, verdict: tooFew ? 'too_few' : 'ok', text, src, ledger };
}

export interface FactDiff { key: string; label: string; before: CardFact['value']; after: CardFact['value'] }
/** Re-check: which facts changed between two runs of the same card. */
export function diffCards(a: AnalystCard, b: AnalystCard): { changed: FactDiff[]; added: string[]; removed: string[]; statusChanged: boolean } {
  const am = new Map(a.facts.map((f) => [f.key, f]));
  const bm = new Map(b.facts.map((f) => [f.key, f]));
  const changed: FactDiff[] = [];
  for (const [k, f] of am) { const g = bm.get(k); if (g && g.value !== f.value) changed.push({ key: k, label: f.label, before: f.value, after: g.value }); }
  return {
    changed,
    added: [...bm.keys()].filter((k) => !am.has(k)).map((k) => bm.get(k)!.label),
    removed: [...am.keys()].filter((k) => !bm.has(k)).map((k) => am.get(k)!.label),
    statusChanged: a.status !== b.status,
  };
}

// ─── conversation ───────────────────────────────────────────

export interface ConvChip { key: string; label: string; source: string; asOf: string | null }
export interface ConvMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  chips?: ConvChip[];
  card?: AnalystCard;
  /** Page the message was sent from (route + symbol), for the "asked on" line. */
  page?: { route: string | null; symbol: string | null } | null;
  error?: string;
}
export const MAX_CONV_MESSAGES = 120;

/** Strict-ish parse of a stored / client-sent conversation (drops anything odd, caps sizes). */
export function sanitizeConversation(x: unknown): ConvMessage[] {
  if (!Array.isArray(x)) return [];
  const out: ConvMessage[] = [];
  for (const m of x.slice(-MAX_CONV_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : null;
    if (!id) continue;
    const role = o.role === 'assistant' ? 'assistant' : 'user';
    const content = String(o.content ?? '').slice(0, 8000);
    const at = typeof o.at === 'string' && Number.isFinite(Date.parse(o.at)) ? o.at : new Date(0).toISOString();
    const msg: ConvMessage = { id, role, content, at };
    if (Array.isArray(o.chips)) msg.chips = (o.chips as any[]).slice(0, 30).filter((c) => c && typeof c.key === 'string').map((c) => ({ key: String(c.key).slice(0, 80), label: String(c.label ?? '').slice(0, 80), source: String(c.source ?? '').slice(0, 160), asOf: typeof c.asOf === 'string' ? c.asOf : null }));
    if (o.card && typeof o.card === 'object' && JSON.stringify(o.card).length < 40_000) msg.card = o.card as AnalystCard;
    if (o.page && typeof o.page === 'object') { const p = o.page as any; msg.page = { route: typeof p.route === 'string' ? p.route.slice(0, 80) : null, symbol: normalizeSymbol(p.symbol) }; }
    if (typeof o.error === 'string') msg.error = o.error.slice(0, 300);
    out.push(msg);
  }
  return out;
}

export function parseHorizonPref(x: unknown): Horizon { return parseHorizon(x); }

/** ⌘\ on macOS, Ctrl+\ elsewhere — toggles the panel on every page. */
export function isToggleShortcut(e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return (e.key === '\\' || e.code === 'Backslash') && (e.metaKey || e.ctrlKey) && !e.altKey;
}
