/**
 * GEX EXPIRY HORIZON — which contracts feed the walls, the zero-γ and the
 * chart's nodes ("orbs"). Pure; used by the exposure engine
 * (server/options-exposures.ts byHorizon), the terminal endpoint's `horizon`
 * param, the intraday snapshot writer and the chart overlay builder.
 *
 *   today   the next 0DTE session: contracts expiring at that session's 16:00 ET
 *           (before the close on a weekday = today; after it, or on a weekend,
 *           the next weekday — the label says which)
 *   week    every contract expiring on or before that session week's Friday
 *   opex    every contract expiring on or before the monthly OPEX (3rd Friday);
 *           once the month's OPEX has passed, next month's
 *   all     every expiry in the chain read (the pre-2026-10-13 behaviour)
 *
 * The cut-off is an INSTANT (16:00 ET of the last included expiry date), so a
 * Thursday expiry in a holiday week still lands inside "week". Exchange
 * holidays are not modelled; nothing is invented — a horizon with no
 * contracts simply has no nodes.
 */
import { expiryInstantMs } from './gex-math';
import { marketDateET } from './market-day';

export const GEX_HORIZONS = ['today', 'week', 'opex', 'all'] as const;
export type GexHorizon = typeof GEX_HORIZONS[number];

export const HORIZON_LABEL: Record<GexHorizon, string> = {
  today: 'Today (0DTE)',
  week: 'This week',
  opex: 'To monthly OPEX',
  all: 'All expiries',
};

export function parseHorizon(v: unknown): GexHorizon {
  const s = String(v ?? '').toLowerCase();
  return (GEX_HORIZONS as readonly string[]).includes(s) ? (s as GexHorizon) : 'all';
}

const DAY = 86_400_000;
const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const dow = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The ET date of the next 0DTE session at `nowMs` (today before 16:00 ET on a weekday). */
export function nextSessionDate(nowMs: number): string {
  let d = marketDateET(new Date(nowMs));
  for (let i = 0; i < 8; i++) {
    const wd = dow(d);
    if (wd >= 1 && wd <= 5 && expiryInstantMs(d) > nowMs) return d;
    d = addDays(d, 1);
  }
  return d;
}

/** Third Friday of the month containing `iso`. */
export function thirdFriday(iso: string): string {
  const first = `${iso.slice(0, 7)}-01`;
  const offset = (5 - dow(first) + 7) % 7;
  return addDays(first, offset + 14);
}

/** Last expiry DATE a horizon includes (ET, YYYY-MM-DD), or null for 'all'. */
export function horizonLastExpiry(h: GexHorizon, nowMs: number): string | null {
  if (h === 'all') return null;
  const s = nextSessionDate(nowMs);
  if (h === 'today') return s;
  if (h === 'week') return addDays(s, 5 - dow(s));
  const opex = thirdFriday(s);
  if (opex >= s) return opex;
  const [y, m] = s.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return thirdFriday(next);
}

/** Fractional days-to-expiry cut-off (contract dte ≤ this is inside). Infinity for 'all'. */
export function horizonMaxDte(h: GexHorizon, nowMs: number): number {
  const last = horizonLastExpiry(h, nowMs);
  if (!last) return Infinity;
  return (expiryInstantMs(last) - nowMs) / DAY + 1e-6;
}

/**
 * Cut-off for the engine's strike × expiry matrix, whose `dte` is
 * Math.round(fractional dte). Every listed expiry is 16:00 ET, so all
 * contracts share the same fractional offset and rounding is consistent.
 */
export function horizonMatrixDte(h: GexHorizon, nowMs: number): number {
  const m = horizonMaxDte(h, nowMs);
  return Number.isFinite(m) ? Math.round(m - 1e-6) : Infinity;
}

export interface MatrixCellLike { strike: number; dte: number; netGEX: number; netVEX: number }
/** One strike's net exposure inside a horizon. gex in $B per 1%, vex in $M per IV point (engine units). */
export interface HorizonNode { strike: number; gex: number; vex: number }

/** Sum the matrix per strike for cells inside the horizon (dte ≤ cut-off). */
export function nodesForHorizon(cells: MatrixCellLike[], h: GexHorizon, nowMs: number): HorizonNode[] {
  const cut = horizonMatrixDte(h, nowMs);
  const by = new Map<number, HorizonNode>();
  for (const c of cells) {
    if (!Number.isFinite(c.strike) || !(c.dte <= cut)) continue;
    const n = by.get(c.strike) ?? { strike: c.strike, gex: 0, vex: 0 };
    n.gex += Number(c.netGEX) || 0;
    n.vex += Number(c.netVEX) || 0;
    by.set(c.strike, n);
  }
  return [...by.values()];
}

/**
 * The strongest nodes to keep: top `nGex` by |gex| ∪ top `nVex` by |vex|.
 * Values are rounded to 4 significant figures (storage size, not precision theatre).
 */
export function topNodes(nodes: HorizonNode[], nGex = 14, nVex = 8): Array<[number, number, number]> {
  const keep = new Set<number>();
  [...nodes].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, nGex).forEach((n) => keep.add(n.strike));
  [...nodes].sort((a, b) => Math.abs(b.vex) - Math.abs(a.vex)).slice(0, nVex).forEach((n) => keep.add(n.strike));
  const sig = (v: number) => (v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(4)));
  return nodes.filter((n) => keep.has(n.strike) && (n.gex !== 0 || n.vex !== 0))
    .sort((a, b) => a.strike - b.strike)
    .map((n) => [n.strike, sig(n.gex), sig(n.vex)]);
}

/**
 * Per-bar node cap and the Apex node: of the nodes present on one bar, keep
 * the `cap` largest by |value|; the Apex node is the largest of all.
 * Returns indexes into `vals` (NaN entries are absent nodes).
 */
export function capNodes(vals: ArrayLike<number>, cap: number): { keep: number[]; apex: number } {
  const idx: number[] = [];
  for (let i = 0; i < vals.length; i++) if (Number.isFinite(vals[i]) && vals[i] !== 0) idx.push(i);
  idx.sort((a, b) => Math.abs(vals[b]) - Math.abs(vals[a]));
  const keep = idx.slice(0, Math.max(0, cap));
  return { keep, apex: keep.length ? keep[0] : -1 };
}

/* ── intraday snapshot payload (gex_snapshots.heatmap_data for 5-min rows) ── */

export const INTRADAY_KIND = 'intraday-5m' as const;
export interface HorizonBlock {
  /** Last expiry date included (null = all). */
  exp: string | null;
  /** [strike, gex $B per 1%, vex $M per IV pt] */
  n: Array<[number, number, number]>;
  /** Levels of this horizon's book (headline definitions). */
  lv?: { cw: number | null; pw: number | null; flip: number | null; maxG: number | null; net: number | null } | null;
}
export interface IntradayHeatmap {
  kind: typeof INTRADAY_KIND;
  v: 1;
  horizons: Partial<Record<GexHorizon, HorizonBlock>>;
}
export function isIntradayHeatmap(x: unknown): x is IntradayHeatmap {
  return !!x && typeof x === 'object' && !Array.isArray(x) && (x as { kind?: unknown }).kind === INTRADAY_KIND;
}
