/**
 * CHART DRAWINGS — the data model shared by the chart (client), the drawing
 * store (server, per user × symbol) and the drawing alerts (server sweep).
 *
 * Pure: no DOM, no fs. Everything a drawing IS lives here — its type, the
 * defensive sanitiser both sides run on every read and write, the versioned
 * serialisation, the local-vs-server merge rule, and the line maths alerts
 * use to price a trend line "now".
 *
 * A drawing is stored in DATA space: anchors are { t: epoch ms, p: price }.
 * Time, not bar index, so a line drawn on 5m sits on the same moment on 1h or
 * 1D, survives new bars, and follows the user across devices.
 */

export type DrawTool =
  | 'trend' | 'ray' | 'extended' | 'hline' | 'hray' | 'vline' | 'rect' | 'channel'
  | 'fib' | 'fibext' | 'text' | 'arrow' | 'measure' | 'brush' | 'long' | 'short' | 'pricelabel';
export type ToolId = 'cursor' | DrawTool;

/** Palette ROLES, resolved per visual mode at draw time — never a hex. */
export type ColorRole = 'accent' | 'gain' | 'loss' | 'caution' | 'marker' | 'info' | 'text' | 'dim';
export const COLOR_ROLES: ColorRole[] = ['accent', 'info', 'gain', 'loss', 'caution', 'marker', 'text', 'dim'];
export const LINE_WIDTHS = [1, 2, 3, 4] as const;
export type LineWidth = (typeof LINE_WIDTHS)[number];
export type DashStyle = 'solid' | 'dashed' | 'dotted';
export const DASH_STYLES: DashStyle[] = ['solid', 'dashed', 'dotted'];
/** Fill opacity steps offered by the mini-toolbar (rect, channel, fib, position). */
export const FILL_STEPS = [0, 0.08, 0.16, 0.28] as const;

export interface Anchor { t: number; p: number }

/** A server-side alert armed on this drawing (price-alerts.ts id). */
export interface DrawingAlert { id: string | null; armedAt: number }

export interface Drawing {
  id: string;
  tool: DrawTool;
  pts: Anchor[];
  color: ColorRole;
  width: LineWidth;
  dash?: DashStyle;
  /** 0..1 fill opacity for area tools; absent = the tool's default. */
  fill?: number;
  /** text / note: the label. */
  text?: string;
  /** arrow: which way the marker points. */
  dir?: 'up' | 'down';
  /** long / short position: the $ risk the size is computed at. */
  risk?: number;
  /** long / short position: the option contract it is sized on (never shares — shared/position-contract.ts). */
  contract?: PositionContract;
  locked?: boolean;
  hidden?: boolean;
  alert?: DrawingAlert;
}

/** Anchors each tool takes when placed. 0 = freehand (brush: press, drag, release).
 *  Position tools are placed with ONE click and grow to 3 anchors (entry, target, stop). */
export const TOOL_POINTS: Record<DrawTool, number> = {
  trend: 2, ray: 2, extended: 2, hline: 1, hray: 1, vline: 1, rect: 2, channel: 3,
  fib: 2, fibext: 3, text: 1, arrow: 1, measure: 2, brush: 0, long: 1, short: 1, pricelabel: 1,
};

/** Tools that can carry a cross alert (a price that moves with time or not). */
export const ALERTABLE: ReadonlySet<DrawTool> = new Set<DrawTool>(['hline', 'hray', 'trend', 'ray', 'extended', 'pricelabel']);

/* ───────────────────────── sanitiser ───────────────────────── */
// (type-only import kept here so the file header stays first)
import type { PositionContract } from './position-contract';

/** A stored position contract, or null when malformed. */
export function sanitizePositionContract(raw: unknown): PositionContract | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  if (c.optionType !== 'call' && c.optionType !== 'put') return null;
  const strike = n(c.strike); const mid = n(c.mid); const spot = n(c.spot); const delta = n(c.delta); const dte = n(c.dte);
  if (!(strike! > 0) || !(mid! > 0) || !(spot! > 0) || delta == null || dte == null || dte < 0) return null;
  if (typeof c.expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(c.expiry)) return null;
  const out: PositionContract = { optionType: c.optionType, strike: strike!, expiry: c.expiry.slice(0, 10), dte: dte!, mid: mid!, spot: spot!, delta };
  if (n(c.gamma) != null) out.gamma = n(c.gamma);
  if (n(c.iv) != null) out.iv = n(c.iv);
  if (typeof c.occ === 'string') out.occ = c.occ.slice(0, 40);
  if (typeof c.source === 'string') out.source = c.source.slice(0, 40);
  if (typeof c.asOf === 'string') out.asOf = c.asOf.slice(0, 40);
  return out;
}

const TOOLS = new Set(Object.keys(TOOL_POINTS));
export const MAX_DRAWINGS_PER_SYMBOL = 300;
const MAX_POINTS = 2000; // a long brush stroke

/** Defensive parse: drop anything malformed rather than crash the chart. */
export function sanitizeDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (out.length >= MAX_DRAWINGS_PER_SYMBOL) break;
    if (!r || typeof r !== 'object') continue;
    const d = r as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id || d.id.length > 64 || seen.has(d.id)) continue;
    if (!TOOLS.has(d.tool as string) || !Array.isArray(d.pts)) continue;
    const pts = (d.pts as unknown[]).slice(0, MAX_POINTS).filter((a): a is Anchor =>
      !!a && typeof a === 'object' && Number.isFinite((a as Anchor).t) && Number.isFinite((a as Anchor).p));
    if (!pts.length) continue;
    const clean: Drawing = {
      id: d.id,
      tool: d.tool as DrawTool,
      pts: pts.map((a) => ({ t: a.t, p: a.p })),
      color: COLOR_ROLES.includes(d.color as ColorRole) ? (d.color as ColorRole) : 'accent',
      width: LINE_WIDTHS.includes(d.width as LineWidth) ? (d.width as LineWidth) : 2,
    };
    if (DASH_STYLES.includes(d.dash as DashStyle) && d.dash !== 'solid') clean.dash = d.dash as DashStyle;
    if (typeof d.fill === 'number' && Number.isFinite(d.fill)) clean.fill = Math.max(0, Math.min(1, d.fill));
    if (typeof d.text === 'string') clean.text = d.text.slice(0, 200);
    if (d.dir === 'up' || d.dir === 'down') clean.dir = d.dir;
    if (typeof d.risk === 'number' && Number.isFinite(d.risk) && d.risk > 0) clean.risk = Math.min(1_000_000, d.risk);
    const pc = sanitizePositionContract(d.contract);
    if (pc && (clean.tool === 'long' || clean.tool === 'short')) clean.contract = pc;
    if (d.locked === true) clean.locked = true;
    if (d.hidden === true) clean.hidden = true;
    const al = d.alert as Record<string, unknown> | undefined;
    if (al && typeof al === 'object' && Number.isFinite(al.armedAt)) {
      clean.alert = { id: typeof al.id === 'string' ? al.id.slice(0, 80) : null, armedAt: al.armedAt as number };
    }
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/* ───────────────────────── serialisation ───────────────────────── */

export const DRAWINGS_FORMAT = 'qe-drawings';
export const DRAWINGS_VERSION = 2;

export interface DrawingsDoc { format: typeof DRAWINGS_FORMAT; v: number; symbol: string; updatedAt: number; drawings: Drawing[] }

export function serializeDrawings(symbol: string, drawings: Drawing[], updatedAt = Date.now()): string {
  const doc: DrawingsDoc = { format: DRAWINGS_FORMAT, v: DRAWINGS_VERSION, symbol: symbol.toUpperCase(), updatedAt, drawings: sanitizeDrawings(drawings) };
  return JSON.stringify(doc);
}

/** Parse a serialised doc — or a bare v1 array (the old device store). */
export function parseDrawingsDoc(raw: string | unknown): { symbol: string | null; updatedAt: number; drawings: Drawing[] } {
  let v: unknown = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return { symbol: null, updatedAt: 0, drawings: [] }; } }
  if (Array.isArray(v)) return { symbol: null, updatedAt: 0, drawings: sanitizeDrawings(v) };
  if (!v || typeof v !== 'object') return { symbol: null, updatedAt: 0, drawings: [] };
  const o = v as Record<string, unknown>;
  return {
    symbol: typeof o.symbol === 'string' ? o.symbol.toUpperCase() : null,
    updatedAt: Number.isFinite(o.updatedAt) ? (o.updatedAt as number) : 0,
    drawings: sanitizeDrawings(o.drawings),
  };
}

/**
 * Local vs server copy of one symbol: the newer edit wins whole (a symbol's
 * drawings are edited as a set — merging per drawing would resurrect
 * deletions). Ties keep the server copy (it is what other devices see).
 */
export function pickNewer<T extends { updatedAt: number }>(local: T | null, server: T | null): { winner: 'local' | 'server' | 'none'; doc: T | null } {
  if (!local && !server) return { winner: 'none', doc: null };
  if (!server) return { winner: 'local', doc: local };
  if (!local) return { winner: 'server', doc: server };
  return local.updatedAt > server.updatedAt ? { winner: 'local', doc: local } : { winner: 'server', doc: server };
}

/* ───────────────────────── trading clock ───────────────────────── */

/**
 * The chart spaces bars evenly: an intraday RTH chart has no nights or
 * weekends on its x-axis, a daily chart no weekends. A trend line that looks
 * straight on screen is straight in BAR time, not clock time. To price such a
 * line "now" (alerts) the server maps clock time onto the same trading clock:
 *   rth   — minutes inside 09:30–16:00 ET, weekdays
 *   eth   — minutes inside 04:00–20:00 ET, weekdays
 *   days  — weekdays (one unit per session; time of day ignored)
 *   clock — plain minutes
 * Exchange holidays are not removed (a line crossing one is off by one day).
 */
export type ClockBasis = 'rth' | 'eth' | 'days' | 'clock';

const ET_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const offCache = new Map<number, number>();
function etOffset(ms: number): number {
  const key = Math.floor(ms / 3_600_000);
  const hit = offCache.get(key);
  if (hit != null) return hit;
  const p: Record<string, string> = {};
  for (const part of ET_PARTS.formatToParts(key * 3_600_000)) p[part.type] = part.value;
  const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - key * 3_600_000;
  if (offCache.size > 20_000) offCache.clear();
  offCache.set(key, off);
  return off;
}

/** Whole weekdays before ET-calendar day `day` (days since 1970-01-01, a Thursday). */
function weekdaysBefore(day: number): number {
  const weeks = Math.floor(day / 7);
  const rem = day - weeks * 7; // 0 = Thu
  let n = weeks * 5;
  for (let i = 0; i < rem; i++) { const dow = (4 + i) % 7; if (dow >= 1 && dow <= 5) n++; }
  return n;
}

export function tradingUnits(ms: number, basis: ClockBasis): number {
  if (basis === 'clock') return ms / 60_000;
  const local = ms + etOffset(ms);
  const day = Math.floor(local / 86_400_000);
  const dow = (4 + (day % 7) + 7) % 7;
  const weekday = dow >= 1 && dow <= 5;
  const before = weekdaysBefore(day);
  const mins = (local - day * 86_400_000) / 60_000;
  const [open, close] = basis === 'eth' ? [240, 1200] : [570, 960];
  const len = close - open;
  // 'days': one unit per session, so a daily bar stamped 00:00 UTC (the prior
  // evening in New York) lands on its own session's start.
  const scale = basis === 'days' ? 1 / len : 1;
  if (!weekday) return before * len * scale;
  return (before * len + Math.max(0, Math.min(len, mins - open))) * scale;
}

export type LineExtend = 'none' | 'right' | 'both';
export interface AlertLine { t1: number; p1: number; t2: number; p2: number; extend: LineExtend; basis: ClockBasis }

/**
 * Price of a line at time `t` on its trading clock. Null when `t` is outside
 * the line (a segment that has ended, or before a ray starts) or degenerate.
 */
export function linePriceAt(line: AlertLine, t: number): number | null {
  const u1 = tradingUnits(line.t1, line.basis);
  const u2 = tradingUnits(line.t2, line.basis);
  const u = tradingUnits(t, line.basis);
  if (u1 === u2) return line.p1 === line.p2 ? line.p1 : null;
  const lo = Math.min(u1, u2); const hi = Math.max(u1, u2);
  const startsAt = u1 <= u2 ? lo : hi; // the first anchor is where a ray starts
  if (line.extend === 'none' && (u < lo || u > hi)) return null;
  if (line.extend === 'right' && (u1 <= u2 ? u < startsAt : u > startsAt)) return null;
  return line.p1 + ((u - u1) * (line.p2 - line.p1)) / (u2 - u1);
}

/** The cross an alert waits for, from where price is when it is armed. */
export function crossDirection(level: number, price: number | null): 'above' | 'below' {
  return price != null && Number.isFinite(price) && price >= level ? 'below' : 'above';
}

/** Did a move from `prev` to `price` cross `level` (touching counts)? */
export function crossed(prev: number, price: number, level: number): 'up' | 'down' | null {
  if (prev < level && price >= level) return 'up';
  if (prev > level && price <= level) return 'down';
  return null;
}

/** Alert line for a drawing, or a flat level; null when the tool has no price line. */
export function alertLineFor(d: Drawing, basis: ClockBasis): { price: number; line: AlertLine | null } | null {
  const [a, b] = d.pts;
  if (!a) return null;
  if (d.tool === 'hline' || d.tool === 'hray' || d.tool === 'pricelabel') return { price: a.p, line: null };
  if ((d.tool === 'trend' || d.tool === 'ray' || d.tool === 'extended') && b) {
    if (a.p === b.p) return { price: a.p, line: null };
    const extend: LineExtend = d.tool === 'trend' ? 'none' : d.tool === 'ray' ? 'right' : 'both';
    return { price: a.p, line: { t1: a.t, p1: a.p, t2: b.t, p2: b.p, extend, basis } };
  }
  return null;
}
