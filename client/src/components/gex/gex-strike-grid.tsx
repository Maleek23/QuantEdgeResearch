/**
 * STRIKE GRIDS — the full strike range, scrolled, never "expanded".
 *
 * Two views share one scroll model:
 *   GexStrikeMatrix  strike × expiry cells (+ a Σ column per strike)
 *   GexStrikeLadder  one diverging bar per strike (a scope's net GEX)
 *
 * Operator feedback: "I should be able to scroll up and down on the GEX terminal
 * other than expanding strikes". So:
 *   - every listed strike is in the list; the container scrolls (wheel,
 *     trackpad, keyboard: ↑↓ row, PgUp/PgDn, Home/End, S = jump to spot);
 *   - sticky header row + sticky strike column (+ sticky Σ column);
 *   - spot is centred on load and on symbol change — never yanked afterwards,
 *     a refetch keeps the reader's scroll;
 *   - a "jump to spot" pill says which way spot is when it is off-screen;
 *   - rows are virtualised (fixed row height, spacer rows), so a 600-strike
 *     SPY book × 30 expiries renders ~40 rows, not 18,000 cells.
 *
 * And "improve the 800 node since call wall is there": structural levels are
 * rows you cannot miss — a labelled chip, a coloured band through the row, a
 * heavier strike label, and the Σ bar shows why that strike is the wall even
 * when each single expiry's cell is small. Zero-gamma and spot fall BETWEEN
 * strikes, so they are drawn as lines at their true position.
 *
 * Units (docs/GEX_VEX_METHODOLOGY.md): matrix GEX is $B per 1% move, VEX $M per
 * 1 IV point; formatted through gex-colors. Nothing here invents a value: an
 * absent cell is "not listed" (blank), dust is hidden only behind a visible
 * toggle and still answers on hover.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StrikeExpiryCell } from '@shared/gex-types';
import { robustMax } from '@/components/viz';
import {
  exposureStrength, fmtGexB, fmtVexM, LEVEL_COLORS, rampColor, rampGradient, rampInk,
} from './gex-colors';
import { GxPop } from './gex-pop';
import { snapshotDayNote } from '@shared/snapshot-day';

/** 'gexAdj' = Δ-adjusted GEX (docs/GAMMA_RAW_VS_ADJUSTED.md) — same unit as 'gex'. */
export type Metric = 'gex' | 'gexAdj' | 'vex';
const metricLabel = (m: Metric) => (m === 'vex' ? 'VEX' : m === 'gexAdj' ? 'Δ-ADJ GEX' : 'GEX');
const cellVal = (c: StrikeExpiryCell, m: Metric) => (m === 'vex' ? (c.netVEX ?? 0) : m === 'gexAdj' ? (c.netGEXAdj ?? 0) : c.netGEX);
/**
 * Colour scale of the matrix:
 *   column   — each expiry column 0 → its OWN max (default). Near-term gamma
 *              is 10–100× the monthly book; one shared scale washed every later
 *              column out (operator 2026-09-29). Compare cells DOWN a column.
 *   absolute — one max for every cell. Compare ACROSS expiries.
 */
export type MatrixScale = 'column' | 'absolute';

/** Signed text colour from the grid ramp (light end on dark panels, dark end in the light theme). */
const signInk = (v: number) => (v === 0 || !Number.isFinite(v) ? 'var(--text-mute, #8a93a6)' : rampColor(v, 0.9));

export interface GridLevels {
  spot: number;
  callWall?: number | null;
  putWall?: number | null;
  /** max |γ| strike — the magnet */
  maxGamma?: number | null;
  /** zero-gamma level (a price, usually between strikes) */
  zeroGamma?: number | null;
}

type Role = 'call' | 'put' | 'magnet';
const ROLE_LABEL: Record<Role, string> = { call: 'CALL WALL', put: 'PUT WALL', magnet: 'MAX γ' };
const ROLE_COLOR: Record<Role, string> = { call: LEVEL_COLORS.callWall, put: LEVEL_COLORS.putWall, magnet: LEVEL_COLORS.magnet };
const ROLE_HINT: Record<Role, string> = {
  call: 'Call wall — strike above spot with the largest call gamma $, all listed expiries. Typical resistance.',
  put: 'Put wall — strike below spot with the largest put gamma $, all listed expiries. Typical support.',
  magnet: 'Max gamma — strike with the largest |net GEX|, all listed expiries. Price is often pulled toward it (pin).',
};

const fmtVal = (v: number, metric: Metric) => (metric === 'vex' ? fmtVexM(v) : fmtGexB(v));
/**
 * Phone-portrait cell text: the same value in ≤ 6 characters (sign, 3
 * significant digits, K/M/B; no "$" — the toolbar states the unit), so a
 * ~55px column never clips a number. Hover / the drill still show the full
 * formatted value.
 */
export function fmtCompact(v: number, metric: Metric): string {
  if (!Number.isFinite(v) || v === 0) return '0';
  const usd = Math.abs(v) * (metric === 'vex' ? 1e6 : 1e9);
  const sign = v < 0 ? '−' : '+';
  // pick the unit AFTER rounding, so 999.7M prints as 1B, never 1000M
  const units: Array<[number, string]> = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K'], [1, '']];
  const [div, u] = units.find(([d], i) => usd >= d * 0.9995 || i === units.length - 1)!;
  const n = usd / div;
  // ≤ 5 characters with the sign: −93M, +1.1B, −470K
  const txt = n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '');
  return `${sign}${txt}${u}`;
}
const unitOf = (metric: Metric) => (metric === 'vex' ? '/IV pt' : '/1%');
const fmtStrike = (s: number) => `$${Number.isInteger(s) ? s : s.toFixed(1)}`;
const sameStrike = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 1e-6;

function rolesFor(strike: number, lv: GridLevels): Role[] {
  const r: Role[] = [];
  if (sameStrike(lv.callWall, strike)) r.push('call');
  if (sameStrike(lv.putWall, strike)) r.push('put');
  if (sameStrike(lv.maxGamma, strike)) r.push('magnet');
  return r;
}

const ROLE_SHORT: Record<Role, string> = { call: 'CW', put: 'PW', magnet: 'Mγ' };

function RoleChips({ roles, short = false }: { roles: Role[]; short?: boolean }) {
  if (!roles.length) return null;
  return (
    <span className="gx-chips">
      {roles.map((r) => (
        <span key={r} className="gx-chip" aria-label={ROLE_LABEL[r]} style={{ color: ROLE_COLOR[r], borderColor: `color-mix(in srgb, ${ROLE_COLOR[r]} 55%, transparent)`, background: `color-mix(in srgb, ${ROLE_COLOR[r]} 14%, transparent)` }} title={ROLE_HINT[r]}>
          {short ? ROLE_SHORT[r] : ROLE_LABEL[r]}
        </span>
      ))}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────
   Shared scroll model
   ──────────────────────────────────────────────────────────────── */

function useVirtualRows(count: number, rowH: number, overscan = 12) {
  const ref = useRef<HTMLDivElement | null>(null);
  // The scroller is measured whenever IT mounts (callback ref), not once per
  // component: a first render without the scroller (an empty book, a DTE
  // bucket with no cells) used to leave the width at 0 for good — the fitted
  // columns never applied and the grid sat in a third of its tile.
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const setRef = useCallback((el: HTMLDivElement | null) => { ref.current = el; setNode(el); }, []);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const [viewW, setViewW] = useState(0);
  const raf = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = node;
    if (!el) return;
    const measure = () => { setViewH(el.clientHeight || 600); setViewW(el.clientWidth || 0); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [node]);
  const onScroll = useCallback(() => {
    if (raf.current != null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      if (ref.current) setScrollTop(ref.current.scrollTop);
    });
  }, []);
  useEffect(() => () => { if (raf.current != null) cancelAnimationFrame(raf.current); }, []);
  const first = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const last = Math.min(count, Math.ceil((scrollTop + viewH) / rowH) + overscan);
  return { ref, setRef, onScroll, first, last, scrollTop, viewH, viewW };
}

/** Index of the row nearest spot in a descending strike list. */
function spotIndex(strikes: number[], spot: number) {
  if (!strikes.length || !(spot > 0)) return -1;
  let best = 0;
  for (let i = 1; i < strikes.length; i++) if (Math.abs(strikes[i] - spot) < Math.abs(strikes[best] - spot)) best = i;
  return best;
}

/** y (px, from list top) of a price between rows of a descending strike list. */
function priceY(strikes: number[], price: number | null | undefined, rowH: number, headerH: number): number | null {
  if (price == null || !Number.isFinite(price) || strikes.length < 2) return null;
  if (price > strikes[0] || price < strikes[strikes.length - 1]) return null;
  for (let i = 0; i < strikes.length - 1; i++) {
    const hi = strikes[i]; const lo = strikes[i + 1];
    if (price <= hi && price >= lo) {
      const f = hi === lo ? 0 : (hi - price) / (hi - lo);
      return headerH + (i + 0.5 + f) * rowH;
    }
  }
  return null;
}

function useCenterOnSpot(
  ref: React.RefObject<HTMLDivElement>, idx: number, rowH: number, headerH: number, centerKey: string, ready: boolean,
) {
  const done = useRef<string | null>(null);
  const center = useCallback((smooth = false) => {
    const el = ref.current;
    if (!el || idx < 0) return;
    const top = headerH + idx * rowH + rowH / 2 - el.clientHeight / 2;
    el.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }, [ref, idx, rowH, headerH]);
  useLayoutEffect(() => {
    if (!ready || idx < 0 || done.current === centerKey) return;
    done.current = centerKey;
    center(false);
  }, [ready, idx, centerKey, center]);
  return center;
}

function JumpToSpot({ spot, direction, onClick }: { spot: number; direction: 'up' | 'down' | null; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`gx-jump${direction ? ' off' : ''}`}
      onClick={onClick}
      title="Scroll spot to the centre (keyboard: S)"
    >
      {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '◎'} SPOT ${spot.toFixed(2)}
    </button>
  );
}

function onGridKey(e: React.KeyboardEvent<HTMLDivElement>, rowH: number, jump: () => void, colW = 120) {
  const el = e.currentTarget;
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); jump(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); el.scrollTop += rowH; }
  if (e.key === 'ArrowUp') { e.preventDefault(); el.scrollTop -= rowH; }
  if (e.key === 'ArrowRight') { e.preventDefault(); el.scrollLeft += colW; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); el.scrollLeft -= colW; }
}

/* ────────────────────────────────────────────────────────────────
   MATRIX — strike × expiry
   ──────────────────────────────────────────────────────────────── */

/**
 * FIT TO THE TILE (operator 2026-10-01: "this is GEX, it needs to fit to
 * screen"). The matrix is a CSS grid — strike column and Σ column fixed,
 * every expiry column minmax(min, 1fr) — so the columns always stretch to
 * the tile's full width: never a blank right side, never a horizontal scroll.
 * When more expiries are selected than fit at a readable minimum width they
 * are PAGED (‹ ›, ←/→), the page size derived from the measured width:
 * ≈ 4 on a phone-width tile, ≈ 7 on a tablet, every one that fits on a desktop.
 *
 * Rows fill the height too: the shown strikes share the scroller's height
 * (between MIN and MAX row heights). With a strike band (strikeBand prop) the
 * band is widened, a strike at a time either side of spot, until the rows
 * reach the screen's bottom; only when the band holds more strikes than fit
 * does the body scroll — inside the matrix, with the sticky header and the
 * sticky strike column. Spot is centred on load.
 *
 * Cell text and padding scale with the column width and row height (CSS
 * vars below, plus container queries in nexus.css for the toolbar), never
 * under 11px; narrow columns switch to the ≤ 5-character compact format.
 */
export const MIN_COL = 66;
/** Narrow tiles (< 560px — tablet portrait, a 4-column tile): compact values at ≥ 11px. */
export const MIN_COL_NARROW = 46;
export interface MatrixGeometry {
  size: 'narrow' | 'mid' | 'wide';
  strikeW: number;
  sumW: number;
  /** width of one expiry (sub-)column at the current page size, px */
  colW: number;
  /** expiry sub-columns that fit at the readable minimum */
  perView: number;
  minCol: number;
}
export function matrixGeometry(width: number, cols: number): MatrixGeometry {
  const w = Math.max(0, width);
  const size = w < 560 ? 'narrow' : w < 900 ? 'mid' : 'wide';
  const strikeW = size === 'narrow' ? 60 : size === 'mid' ? 110 : 142;
  const sumW = size === 'narrow' ? 52 : size === 'mid' ? 78 : 104;
  const minCol = size === 'narrow' ? MIN_COL_NARROW : MIN_COL;
  const avail = Math.max(0, w - strikeW - sumW);
  const perView = Math.max(1, Math.floor(avail / minCol));
  const shown = Math.max(1, Math.min(perView, cols));
  return { size, strikeW, sumW, colW: cols > 0 ? avail / shown : 0, perView, minCol };
}

/** Row heights: rows stretch between these to fill the scroller. */
const ROW_MIN = { narrow: 30, mid: 24, wide: 24 } as const;
const ROW_MAX = { narrow: 42, mid: 36, wide: 36 } as const;
const HEAD_H = { narrow: 50, mid: 46, wide: 48 } as const;
/** "OCT 02" → "Oct 2" (short, never ellipsised on a narrow tile). */
const shortExpiry = (label: string) => label.replace(/^([A-Z])([A-Z]+)\s+0?(\d+)$/, (_m, a: string, b: string, d: string) => `${a}${b.toLowerCase()} ${d}`);

/** Legend: the diverging ramp with its value → colour ticks for the active scale. */
function RampLegend({ scale, max, metric }: { scale: MatrixScale; max: number; metric: Metric }) {
  const lab = (f: number) => (scale === 'column' ? (f === 0 ? '0' : `${f < 0 ? '−' : '+'}${Math.abs(f) === 1 ? 'max' : '¼'}`) : f === 0 ? '0' : fmtVal(f * max, metric));
  return (
    <span className="gx-ramp">
      <span className="gx-ramp-bar" style={{ background: rampGradient() }} />
      <span className="gx-ramp-ticks">
        {[-1, -0.25, 0, 0.25, 1].map((f) => <span key={f}>{lab(f)}</span>)}
      </span>
    </span>
  );
}

interface ColStat { rMax: number; trueMax: number; net: number; gross: number; top: Map<number, number> }
interface MatrixModel {
  strikes: number[];
  byKey: Map<string, StrikeExpiryCell>;
  rowTotal: Map<number, number>;
  rowMax: number;
  gross: number;
  rMax: number;
  trueMax: number;
  col: Map<number, ColStat>;
  king: StrikeExpiryCell | null;
}

/** One metric's view of the shown book: robust scales, per-expiry stats, row totals, king node. */
function buildMatrixModel(cells: StrikeExpiryCell[], expiries: Array<[number, string]>, val: (c: StrikeExpiryCell) => number): MatrixModel {
  const listed = cells.filter((c) => Number.isFinite(c.strike) && Number.isFinite(c.dte) && c.dte >= 0);
  const shownDte = new Set(expiries.map(([d]) => d));
  const byKey = new Map<string, StrikeExpiryCell>();
  const rowTotal = new Map<number, number>();
  let gross = 0;
  const strikeSet = new Set<number>();
  for (const c of listed) {
    strikeSet.add(c.strike);
    const v = val(c);
    gross += Math.abs(v);
    if (!shownDte.has(c.dte)) continue;
    byKey.set(`${c.strike}|${c.dte}`, c);
    rowTotal.set(c.strike, (rowTotal.get(c.strike) ?? 0) + v);
  }
  const strikes = [...strikeSet].sort((a, b) => b - a);
  const shownVals = [...byKey.values()].map((c) => Math.abs(val(c)));
  // Robust max (98.5th pct) so one outlier node does not wash out the book;
  // the book's true max still paints at full strength (t clamps at 1).
  const rMax = robustMax(shownVals, 1e-12, 0.985);
  const trueMax = shownVals.reduce((m, v) => Math.max(m, v), 0);
  const rowMax = [...rowTotal.values()].reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1e-12;
  // Per-expiry column stats: its own robust max (the per-expiry scale), its
  // true max (dust threshold), its net (header summary) and its top-2 cells.
  const byCol = new Map<number, StrikeExpiryCell[]>();
  for (const c of byKey.values()) { const a = byCol.get(c.dte); if (a) a.push(c); else byCol.set(c.dte, [c]); }
  const col = new Map<number, ColStat>();
  for (const [dte, list] of byCol) {
    const abs = list.map((c) => Math.abs(val(c)));
    const ranked = [...list].filter((c) => val(c) !== 0).sort((a, b) => Math.abs(val(b)) - Math.abs(val(a)));
    col.set(dte, {
      rMax: robustMax(abs, 1e-12, 0.985),
      trueMax: abs.reduce((m, v) => Math.max(m, v), 0),
      net: list.reduce((s2, c) => s2 + val(c), 0),
      gross: abs.reduce((s2, v) => s2 + v, 0),
      top: new Map(ranked.slice(0, 2).map((c, i) => [c.strike, i + 1])),
    });
  }
  // KING NODE — the single largest |cell| in the shown book (its strike label gets ★ too)
  let king: StrikeExpiryCell | null = null;
  for (const c of byKey.values()) if (!king || Math.abs(val(c)) > Math.abs(val(king))) king = c;
  return { strikes, byKey, rowTotal, rowMax, gross, rMax, trueMax, col, king };
}

/**
 * Rows to show: the band's strikes (descending), widened one strike at a time
 * either side of spot until `need` rows, so a band narrower than the screen
 * never leaves the bottom of the tile empty. Without a band: every strike.
 */
function bandRows(strikes: number[], band: { lo: number; hi: number } | null | undefined, spot: number, need: number): number[] {
  if (!band || !strikes.length) return strikes;
  let i0 = strikes.findIndex((k) => k <= band.hi);
  let i1 = strikes.length - 1 - [...strikes].reverse().findIndex((k) => k >= band.lo);
  if (i0 < 0 || i1 < i0) { const si = Math.max(0, spotIndex(strikes, spot)); i0 = si; i1 = si; }
  let up = true;
  while (i1 - i0 + 1 < need && (i0 > 0 || i1 < strikes.length - 1)) {
    if ((up && i0 > 0) || i1 >= strikes.length - 1) i0--; else i1++;
    up = !up;
  }
  return strikes.slice(i0, i1 + 1);
}

export function GexStrikeMatrix({
  cells,
  expiries,
  levels,
  metric,
  compare = false,
  centerKey,
  onCellClick,
  emptyText,
  scale: scaleProp,
  onScaleChange,
  strikeBand,
  leading,
  spotInToolbar = true,
  snapshotAt,
}: {
  /** chain snapshot time — when not today (ET) the grid says DTE is counted from that day */
  snapshotAt?: string | number | null;
  /** every listed cell for the symbol (all expiries) — shares are of this book */
  cells: StrikeExpiryCell[];
  /** columns to show: [dte, label], ascending */
  expiries: Array<[number, string]>;
  levels: GridLevels;
  metric: Metric;
  /**
   * Side by side: two narrow columns per expiry — raw GEX | Δ-adjusted GEX
   * (docs/GAMMA_RAW_VS_ADJUSTED.md). Ignored for VEX. Each half keeps its own
   * colour scale and its own ★/② ranks, so a node that moves is visible.
   */
  compare?: boolean;
  /** change to re-centre on spot (symbol, metric) */
  centerKey: string;
  onCellClick?: (cell: StrikeExpiryCell) => void;
  emptyText?: ReactNode;
  /** controlled colour scale (defaults to per-expiry, owned here when omitted) */
  scale?: MatrixScale;
  onScaleChange?: (s: MatrixScale) => void;
  /**
   * Default strike band (gex-model strikeBandOf: ±1.5 × the 1-week move,
   * widened to the structural levels). The ⋯ menu switches to every listed
   * strike. Omitted: every strike.
   */
  strikeBand?: { lo: number; hi: number; pct: number; basis: string } | null;
  /** the owning tool's controls (metric, gamma view, horizon) — same ONE toolbar row */
  leading?: ReactNode;
  /** print the spot price on the jump-to-spot button (off when another tile on the
   *  page — Key Levels — already prints the spot, labelled) */
  spotInToolbar?: boolean;
}) {
  const [ownScale, setOwnScale] = useState<MatrixScale>('column');
  const scale = scaleProp ?? ownScale;
  const setScale = onScaleChange ?? setOwnScale;
  const [showDust, setShowDust] = useState(false);
  const [dustPct, setDustPct] = useState(0.5);
  const [allStrikes, setAllStrikes] = useState(false);
  const both = compare && metric !== 'vex';
  const primary: Metric = both ? 'gex' : metric;
  const val = useCallback((c: StrikeExpiryCell) => cellVal(c, primary), [primary]);
  const model = useMemo(() => buildMatrixModel(cells, expiries, val), [cells, expiries, val]);
  const model2 = useMemo(() => (both ? buildMatrixModel(cells, expiries, (c) => cellVal(c, 'gexAdj')) : null), [both, cells, expiries]);
  const sub = both ? 2 : 1;

  // Geometry comes from the scroller's measured size (callback-ref measure).
  const [rowsFit, setRowsFit] = useState({ row: ROW_MIN.wide as number, n: 0 });
  const ROW = rowsFit.row;
  const band = allStrikes ? null : strikeBand;
  const { ref, setRef, onScroll, first, last, scrollTop, viewH, viewW } = useVirtualRows(rowsFit.n || model.strikes.length, ROW);
  const geo = matrixGeometry(viewW, expiries.length * sub);
  const sizeCls = geo.size;

  /* expiry paging — the page size is what fits the width */
  const perPage = Math.max(1, Math.floor(geo.perView / sub));
  const pages = Math.max(1, Math.ceil(expiries.length / perPage));
  const expKey = expiries.map(([d]) => d).join(',');
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [expKey, centerKey]);
  const pg = Math.min(page, pages - 1);
  const shownExp = expiries.slice(pg * perPage, pg * perPage + perPage);
  const cols = shownExp.length;
  const colW = cols ? Math.max(0, viewW - geo.strikeW - geo.sumW) / (cols * sub) : 0;
  const compact = colW < 86 || both;
  // compact headers stack date / days / net on three short lines
  const HEAD = compact ? Math.max(52, HEAD_H[sizeCls]) : HEAD_H[sizeCls];

  /* rows: the band (widened to fill), then a row height that fills the height */
  const bodyH = Math.max(0, viewH - HEAD);
  const need = Math.ceil(bodyH / ROW_MAX[sizeCls]);
  const strikes = useMemo(() => bandRows(model.strikes, band, levels.spot, need), [model.strikes, band, levels.spot, need]);
  const fitRow = strikes.length && bodyH > 0
    ? Math.min(ROW_MAX[sizeCls], Math.max(ROW_MIN[sizeCls], bodyH / strikes.length))
    : ROW_MIN[sizeCls];
  useEffect(() => {
    if (Math.abs(fitRow - rowsFit.row) > 0.25 || strikes.length !== rowsFit.n) setRowsFit({ row: fitRow, n: strikes.length });
  }, [fitRow, strikes.length, rowsFit]);

  const sIdx = spotIndex(strikes, levels.spot);
  const jump = useCenterOnSpot(ref, sIdx, ROW, HEAD, `${centerKey}|${allStrikes}|${rowsFit.n}`, strikes.length > 0 && rowsFit.n === strikes.length);
  const spotRowY = sIdx >= 0 ? HEAD + sIdx * ROW : null;
  const spotDir = spotRowY == null ? null : spotRowY < scrollTop + HEAD ? 'up' : spotRowY > scrollTop + viewH - ROW ? 'down' : null;
  const zgY = priceY(strikes, levels.zeroGamma, ROW, HEAD);
  const spotY = priceY(strikes, levels.spot, ROW, HEAD);
  const scaleMaxOf = (m: MatrixModel, dte: number) => (scale === 'column' ? m.col.get(dte)?.rMax ?? m.rMax : m.rMax);
  const dustCutOf = (m: MatrixModel, dte: number) => (scale === 'column' ? m.col.get(dte)?.trueMax ?? m.trueMax : m.trueMax) * (dustPct / 100);

  /* hover card — one floating element, event-delegated */
  // The card's CONTENT changes only when the hovered cell changes (React state);
  // its POSITION follows the mouse through the DOM directly, so moving across a
  // cell does not re-render the grid on every mousemove.
  const [hover, setHover] = useState<{ x: number; y: number; strike: number; dte: number | null } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const place = (x: number, y: number) => {
    const w = wrapRef.current?.clientWidth ?? 800;
    const h = wrapRef.current?.clientHeight ?? 600;
    return { left: Math.max(4, Math.min(x + 14, w - 250)), top: y + 16 + 230 > h ? Math.max(4, y - 236) : y + 16 };
  };
  const onMove = (e: React.MouseEvent) => {
    const td = (e.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
    if (!td || !wrapRef.current) { if (hover) setHover(null); return; }
    const [s, d] = (td.dataset.k ?? '').split('|');
    const r = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    const strike = Number(s); const dte = d === 'sum' ? null : Number(d);
    if (hover && hover.strike === strike && hover.dte === dte) {
      const p = place(x, y);
      if (cardRef.current) { cardRef.current.style.left = `${p.left}px`; cardRef.current.style.top = `${p.top}px`; }
      return;
    }
    setHover({ x, y, strike, dte });
  };

  const pageBy = (d: number) => setPage((p) => Math.max(0, Math.min(pages - 1, Math.min(p, pages - 1) + d)));
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' && pages > 1) { e.preventDefault(); pageBy(1); return; }
    if (e.key === 'ArrowLeft' && pages > 1) { e.preventDefault(); pageBy(-1); return; }
    onGridKey(e, ROW, () => jump(true));
  };

  const title = both ? 'RAW | Δ-ADJ GEX' : metricLabel(metric);
  const pagerLabel = cols
    ? `${shortExpiry(shownExp[0][1])}${cols > 1 ? `–${shortExpiry(shownExp[cols - 1][1])}` : ''}`
    : '';

  /* ONE toolbar row: the tool's own controls · spot · expiry pager · (i) · ⋯ */
  const toolbar = (
    <div className="gx-toolbar">
      {leading}
      {levels.spot > 0 && sIdx >= 0 && (
        <button type="button" className={`gx-spot-btn${spotDir ? ' off' : ''}`} onClick={() => jump(true)} title={`Scroll the chain-snapshot spot ($${levels.spot.toFixed(2)}) to the centre (keyboard: S)`}>
          {spotDir === 'up' ? '↑' : spotDir === 'down' ? '↓' : '◎'} {spotInToolbar ? <><span className="gx-spot-word">Spot </span>${levels.spot.toFixed(2)}</> : 'Spot'}
        </button>
      )}
      {pages > 1 && (
        <span className="gx-pager" role="group" aria-label="Expiry pages">
          <button type="button" onClick={() => pageBy(-1)} disabled={pg === 0} aria-label="Earlier expiries" title="Earlier expiries (←)">‹</button>
          <span className="gx-pager-label" aria-live="polite" title={`Expiries ${pg * perPage + 1}–${pg * perPage + cols} of ${expiries.length} — ${perPage} fit this width`}>
            {pagerLabel}<small> {pg + 1}/{pages}</small>
          </span>
          <button type="button" onClick={() => pageBy(1)} disabled={pg >= pages - 1} aria-label="Later expiries" title="Later expiries (→)">›</button>
        </span>
      )}
      <span className="gx-tb-end">
        <GxPop kind="menu" label={`Matrix settings and legend — colour scale, strikes, dust, how to read the ${title} matrix`} width={340}>
          <div className="gx-pop-h">Colour scale</div>
          <div className="gx-scale-seg" role="group" aria-label="Colour scale">
            {(['column', 'absolute'] as const).map((k) => (
              <button key={k} type="button" className={scale === k ? 'on' : ''} aria-pressed={scale === k} onClick={() => setScale(k)}
                title={k === 'column' ? 'Each expiry column is coloured 0 → its own max. Later expiries stay readable; compare cells DOWN a column.' : 'One max for every cell. Compare ACROSS expiries; later expiries will look faint because near-term gamma dominates.'}>
                {k === 'column' ? 'Per expiry' : 'Absolute'}
              </button>
            ))}
          </div>
          {strikeBand && (
            <>
              <div className="gx-pop-h">Strikes</div>
              <div className="gx-scale-seg" role="group" aria-label="Strike range">
                <button type="button" className={!allStrikes ? 'on' : ''} aria-pressed={!allStrikes} onClick={() => setAllStrikes(false)} title={strikeBand.basis}>±{strikeBand.pct.toFixed(1)}% band</button>
                <button type="button" className={allStrikes ? 'on' : ''} aria-pressed={allStrikes} onClick={() => setAllStrikes(true)} title="Every listed strike (the body scrolls)">All {model.strikes.length}</button>
              </div>
            </>
          )}
          <div className="gx-pop-h">Dust</div>
          <label className="gx-toggle" title={`Cells smaller than ${dustPct}% of the largest cell in their scale are dust. Hidden, they print a faint dot (listed, but immaterial); hover still answers. The top-2 cells of every expiry are never hidden.`}>
            <input type="checkbox" checked={showDust} onChange={(e) => setShowDust(e.target.checked)} />
            show dust
            <select value={dustPct} onChange={(e) => setDustPct(Number(e.target.value))} aria-label="Dust threshold">
              {[0.1, 0.5, 1, 2].map((p) => <option key={p} value={p}>&lt; {p}% of max</option>)}
            </select>
          </label>
          <div className="gx-pop-h">How to read · {title}</div>
          <p><b>Units</b> · {primary === 'vex' ? '$ dealers trade per 1 IV point (VEX)' : '$ of underlying dealers trade per 1% move (GEX)'}. Header = net per expiry (every listed strike); Σ = net of the shown expiries at that strike.</p>
          <p><b style={{ color: signInk(1) }}>Blue +</b> dealers long gamma — hedging provides liquidity. <b style={{ color: signInk(-1) }}>Orange −</b> dealers short gamma — hedging takes liquidity.</p>
          <RampLegend scale={scale} max={model.rMax} metric={primary} />
          <p>{scale === 'column' ? `Colour: each expiry 0 → its own max${both ? ' (raw and Δ-adj halves separately)' : ''} — compare DOWN a column.` : `Colour: one max for every cell (${fmtVal(model.rMax, primary).replace(/^[+−]/, '')}) — compare ACROSS expiries.`} ★ = king node (largest |cell|) of an expiry, ② = #2; blank = the chain never listed that strike × expiry; a dot = listed but dust.</p>
          {both && <p><b>R</b> = raw GEX (Γ·OI·100·S²·1%), <b className="gx-adj-tag">Δ</b> = Δ-adjusted (delta re-priced at spot ±1%), same unit.</p>}
          <p className="gx-legend">
            <i style={{ background: LEVEL_COLORS.callWall }} />call wall
            <i style={{ background: LEVEL_COLORS.putWall }} />put wall
            <i style={{ background: LEVEL_COLORS.magnet }} />max γ
            <i className="dash" style={{ borderColor: LEVEL_COLORS.zeroGamma }} />zero-γ
            <i style={{ background: LEVEL_COLORS.spot }} />spot
          </p>
          <p className="gx-pop-mute">
            {strikes.length} of {model.strikes.length} strikes shown{band ? ` · band ±${band.pct.toFixed(1)}% of spot — ${band.basis}` : ' · every listed strike'}.
            {' '}{cols} of {expiries.length} expiries per page ({perPage} fit this width). Keys: ↑↓ rows · ←→ expiry pages · S spot. Click a cell to drill.
          </p>
        </GxPop>
      </span>
    </div>
  );

  const snapNote = snapshotDayNote(snapshotAt ?? null);
  if (!model.strikes.length) {
    return (
      <div className="gx-wrap">
        {toolbar}
        <div className="gx-empty">{emptyText ?? 'no listed cells'}</div>
      </div>
    );
  }

  const visible = strikes.slice(first, last);
  const fmtCell2 = (v: number, mt: Metric) => (compact ? fmtCompact(v, mt) : fmtVal(v, mt));
  const span = cols * sub + 2;
  // cell text: scales with the column width (chars that must fit) and the row height; ≥ 11px
  const chars = compact ? 5.6 : 8.6;
  const cellFs = Math.max(11, Math.min(14, (colW - 8) / (chars * 0.62), ROW * 0.52));

  /** One cell of one metric (both halves in side-by-side share this). */
  const renderCell = (strike: number, dte: number, m: MatrixModel, mt: Metric, half: '' | 'raw' | 'adj') => {
    const key = `${dte}${half}`;
    const cls = half ? `gx-half gx-half-${half}` : undefined;
    const c = m.byKey.get(`${strike}|${dte}`);
    if (!c) return <td key={key} role="cell" className={cls} />;
    const v = cellVal(c, mt);
    if (v === 0) return <td key={key} role="cell" className={cls} data-k={`${strike}|${dte}`}><span className="gx-dot" /></td>;
    const rank = m.col.get(dte)?.top.get(strike);
    const dust = !rank && Math.abs(v) < dustCutOf(m, dte);
    if (dust && !showDust) return <td key={key} role="cell" className={cls} data-k={`${strike}|${dte}`}><span className="gx-dot" /></td>;
    const t = exposureStrength(v, scaleMaxOf(m, dte));
    // King node of this expiry (rank 1): ★ + solid amber highlight. Near-zero
    // cells (under 12% intensity) are neutral grey so the 3–5 dominant nodes pop;
    // sign stays the CVD-safe blue (+) / orange (−) pair everywhere else.
    const king = rank === 1;
    const faint = !king && t < 0.12;
    return (
      <td key={key} role="cell" className={cls} data-k={`${strike}|${dte}`}>
        <button
          type="button"
          // the two top nodes of each expiry are keyboard stops (Enter = drill); the rest are reached by hover/tap
          tabIndex={rank ? 0 : -1}
          className={`gx-cell${dust ? ' dust' : ''}${rank ? ' top' : ''}${king ? ' king' : ''}${faint ? ' faint' : ''}`}
          data-rank={rank ? (rank === 1 ? '★' : '②') : undefined}
          style={king || faint ? undefined : { background: rampColor(v, t), color: rampInk(t) }}
          onClick={onCellClick ? () => onCellClick(c) : undefined}
          aria-label={`${half ? `${half === 'raw' ? 'raw' : 'Δ-adjusted'} ` : ''}${fmtVal(v, mt)}${rank ? `, ${rank === 1 ? 'king node (largest)' : '#2'} in this expiry` : ''}`}
        >
          {king && !compact ? '★ ' : ''}{fmtCell2(v, mt)}
        </button>
      </td>
    );
  };

  const kingStrikes = new Set([model.king?.strike, model2?.king?.strike].filter((k): k is number => k != null));
  const narrow = geo.size === 'narrow';

  return (
    <div
      className={`gx-wrap gx-${geo.size}${both ? ' gx-compare' : ''}${compact ? ' gx-compact' : ''}`}
      ref={wrapRef}
      onMouseLeave={() => setHover(null)}
      data-per-view={perPage}
      data-col-w={Math.round(colW)}
      style={{
        ['--gx-strike-w' as string]: `${geo.strikeW}px`,
        ['--gx-sum-w' as string]: `${geo.sumW}px`,
        ['--gx-min-col' as string]: `${Math.min(geo.minCol, Math.floor(colW) || geo.minCol)}px`,
        ['--gx-row-h' as string]: `${ROW}px`,
        ['--gx-head-h' as string]: `${HEAD}px`,
        ['--gx-cell-fs' as string]: `${cellFs.toFixed(1)}px`,
        ['--gx-cell-h' as string]: `${Math.max(18, Math.round(ROW - 5))}px`,
      }}
    >
      {toolbar}
      {snapNote && <div className="gx-snap-note" role="note" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--amber)' }}>{snapNote}</div>}
      <div
        ref={setRef}
        className="gx-scroll"
        tabIndex={0}
        role="region"
        aria-label={`Strike by expiry ${title} grid, ${strikes.length} strikes, expiries ${pg * perPage + 1}–${pg * perPage + cols} of ${expiries.length}. Up/down arrows scroll, left/right page expiries, S jumps to spot.`}
        onScroll={onScroll}
        onKeyDown={onKey}
        onMouseMove={onMove}
      >
        <div className="gx-lines" style={{ height: HEAD + strikes.length * ROW }} aria-hidden>
          {zgY != null && <div className="gx-line zg" style={{ top: zgY }}><span>ZERO-γ ${levels.zeroGamma!.toFixed(2)}</span></div>}
          {spotY != null && <div className="gx-line spot gx-line-gutter" style={{ top: spotY }}><span>SPOT</span></div>}
        </div>
        <table
          className="gx-table gx-grid"
          role="table"
          style={{ gridTemplateColumns: `var(--gx-strike-w) repeat(${cols * sub}, minmax(var(--gx-min-col), 1fr)) var(--gx-sum-w)` }}
        >
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" className="gx-sticky-l">STRIKE</th>
              {shownExp.map(([dte, label]) => {
                const cs = model.col.get(dte);
                const cs2 = model2?.col.get(dte);
                return (
                  <th key={dte} role="columnheader" style={sub > 1 ? { gridColumn: 'span 2' } : undefined} className="gx-exp" title={`${label} · ${dte} days to expiry\nNet ${metricLabel(primary)} this expiry (all listed strikes): ${cs ? fmtVal(cs.net, primary) : '—'}${unitOf(primary)}${cs2 ? `\nNet Δ-ADJ GEX this expiry: ${fmtVal(cs2.net, 'gexAdj')}/1%` : ''}\nGross |${metricLabel(primary)}|: ${cs ? fmtVal(cs.gross, primary).replace(/^[+−]/, '') : '—'} · ${model.gross > 0 && cs ? ((cs.gross / model.gross) * 100).toFixed(1) : '0'}% of the book\n${scale === 'column' ? `Colour max for this column: ${cs ? fmtVal(cs.rMax, primary).replace(/^[+−]/, '') : '—'}` : 'Colour: one max for all columns'}`}>
                    <span className="gx-exp-d">{narrow || compact ? shortExpiry(label) : label}<small>{dte}d</small></span>
                    {both ? (
                      <em className="gx-colnet gx-colnet-pair">
                        <span style={{ color: cs ? signInk(cs.net) : undefined }}>R {cs ? fmtCompact(cs.net, 'gex') : '—'}</span>
                        <span className="gx-adj-tag" style={{ color: cs2 ? signInk(cs2.net) : undefined }}>Δ {cs2 ? fmtCompact(cs2.net, 'gexAdj') : '—'}</span>
                      </em>
                    ) : (
                      <em className="gx-colnet" style={{ color: cs ? signInk(cs.net) : undefined }}>{cs ? (compact ? fmtCompact(cs.net, metric) : `Σ ${fmtVal(cs.net, metric)}`) : '—'}</em>
                    )}
                  </th>
                );
              })}
              <th role="columnheader" className="gx-sticky-r" title="Net of the shown expiries at this strike — why a wall is a wall even when each single expiry is small">{narrow ? 'Σ' : both ? 'Σ RAW · Δ' : 'Σ SHOWN'}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {first > 0 && <tr aria-hidden className="gx-spacer"><td style={{ height: first * ROW, gridColumn: `1 / span ${span}` }} /></tr>}
            {visible.map((strike) => {
              const roles = rolesFor(strike, levels);
              const lead = roles[0];
              const isSpotRow = strikes[sIdx] === strike;
              const dist = levels.spot > 0 ? ((strike - levels.spot) / levels.spot) * 100 : 0;
              const total = model.rowTotal.get(strike) ?? 0;
              const total2 = model2?.rowTotal.get(strike) ?? 0;
              const tw = Math.max(0, Math.min(100, (Math.abs(total) / model.rowMax) * 100));
              const band2 = lead ? ROLE_COLOR[lead] : null;
              const kingHere = kingStrikes.has(strike);
              return (
                <tr
                  key={strike}
                  role="row"
                  className={`gx-row${lead ? ' marked' : ''}${isSpotRow ? ' spot' : ''}`}
                  style={band2 ? { ['--band' as string]: band2 } : undefined}
                >
                  <td role="rowheader" className="gx-sticky-l gx-strike" data-k={`${strike}|sum`}>
                    <b>{kingHere ? <span className="gx-king-star" title={both
                      ? `King node — ${model.king?.strike === strike ? 'raw' : ''}${model.king?.strike === strike && model2?.king?.strike === strike ? ' and ' : ''}${model2?.king?.strike === strike ? 'Δ-adjusted' : ''}: the largest |cell| in the book`
                      : 'King node — the largest |exposure| cell in the book'}>★</span> : null}{fmtStrike(strike)}</b>
                    <span className="gx-pct">{dist >= 0 ? '+' : ''}{dist.toFixed(1)}%</span>
                    {narrow && isSpotRow && !roles.length ? <span className="gx-chips"><span className="gx-chip gx-chip-spot" title={`Nearest strike to spot $${levels.spot.toFixed(2)}`}>◎</span></span> : <RoleChips roles={narrow ? roles.slice(0, 1) : roles} short />}
                  </td>
                  {shownExp.flatMap(([dte]) => (both && model2
                    ? [renderCell(strike, dte, model, 'gex', 'raw'), renderCell(strike, dte, model2, 'gexAdj', 'adj')]
                    : [renderCell(strike, dte, model, metric, '')]))}
                  <td role="cell" className="gx-sticky-r gx-sum" data-k={`${strike}|sum`}>
                    {!both && <span className="gx-sum-bar"><i style={{ width: `${tw}%`, background: rampColor(total, 0.55), opacity: total === 0 ? 0 : 1 }} /></span>}
                    <span style={{ color: signInk(total) }}>{total === 0 ? '—' : compact || narrow ? fmtCompact(total, primary) : fmtVal(total, primary)}</span>
                    {both && <span className="gx-adj-tag gx-sum2" style={{ color: signInk(total2) }}> · Δ {total2 === 0 ? '—' : fmtCompact(total2, 'gexAdj')}</span>}
                  </td>
                </tr>
              );
            })}
            {last < strikes.length && <tr aria-hidden className="gx-spacer"><td style={{ height: (strikes.length - last) * ROW, gridColumn: `1 / span ${span}` }} /></tr>}
          </tbody>
        </table>
      </div>

      {hover && (() => {
        const rowTotal = model.rowTotal.get(hover.strike) ?? 0;
        const roles = rolesFor(hover.strike, levels);
        const c = hover.dte != null ? model.byKey.get(`${hover.strike}|${hover.dte}`) : undefined;
        const v = c ? val(c) : rowTotal;
        const v2 = model2 ? (c ? cellVal(c, 'gexAdj') : model2.rowTotal.get(hover.strike) ?? 0) : null;
        const p = place(hover.x, hover.y);
        return (
          <div ref={cardRef} className="gx-hover" style={{ left: p.left, top: p.top }} role="tooltip">
            <div className="gx-hover-h">{fmtStrike(hover.strike)} · {c ? `${c.expiryLabel} (${c.dte}d)` : 'Σ shown expiries'}</div>
            <div><span>{both ? 'RAW GEX' : metricLabel(metric)}</span><b style={{ color: signInk(v) }}>{fmtVal(v, primary)}{unitOf(primary)}</b></div>
            {v2 != null && <div><span>Δ-ADJ GEX</span><b style={{ color: signInk(v2) }}>{fmtVal(v2, 'gexAdj')}/1%{v !== 0 ? ` (×${(v2 / v).toFixed(2)})` : ''}</b></div>}
            {c && model.col.get(c.dte)?.top.get(hover.strike) && <div><span>rank in {c.expiryLabel}{both ? ' · raw' : ''}</span><b>#{model.col.get(c.dte)!.top.get(hover.strike)}</b></div>}
            {c && model2?.col.get(c.dte)?.top.get(hover.strike) && <div><span>rank in {c.expiryLabel} · Δ-adj</span><b>#{model2.col.get(c.dte)!.top.get(hover.strike)}</b></div>}
            {c && <div><span>colour scale</span><b>{scale === 'column' ? `per expiry · max ${fmtVal(scaleMaxOf(model, c.dte), primary).replace(/^[+−]/, '')}` : 'absolute'}</b></div>}
            <div><span>share of gross book</span><b>{model.gross > 0 ? `${((Math.abs(v) / model.gross) * 100).toFixed(2)}%` : '—'}</b></div>
            {c && <div><span>share of {fmtStrike(hover.strike)} row</span><b>{rowTotal !== 0 ? `${((v / rowTotal) * 100).toFixed(0)}%` : '—'}</b></div>}
            <div><span>vs spot</span><b>{levels.spot > 0 ? `${(((hover.strike - levels.spot) / levels.spot) * 100).toFixed(2)}%` : '—'}</b></div>
            {c && Math.abs(v) < dustCutOf(model, c.dte) && <div className="gx-hover-note">dust — under {dustPct}% of the largest cell in its scale</div>}
            {roles.map((r) => <div key={r} className="gx-hover-note" style={{ color: ROLE_COLOR[r] }}>{ROLE_LABEL[r]} · all listed expiries</div>)}
            <div className="gx-hover-note">{v > 0 ? 'dealers long gamma here — hedging provides liquidity' : v < 0 ? 'dealers short gamma here — hedging takes liquidity' : ''}</div>
          </div>
        );
      })()}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   LADDER — one diverging bar per strike
   ──────────────────────────────────────────────────────────────── */

const L_ROW = 26;
const L_HEAD = 30;

export function GexStrikeLadder({
  levelsByStrike,
  levels,
  centerKey,
  scopeLabel,
  height = 'clamp(360px, 58vh, 760px)',
  emptyText,
  compareByStrike,
  valueLabel = 'GEX',
}: {
  /** strike → net GEX ($B per 1%) for the ladder's scope */
  levelsByStrike: Array<{ strike: number; gex: number }>;
  /**
   * Side by side: a second series drawn under each bar (Δ-adjusted GEX,
   * docs/GAMMA_RAW_VS_ADJUSTED.md) on the SAME scale, so the two read against
   * each other strike by strike. Its own top-2 are ranked separately.
   */
  compareByStrike?: Array<{ strike: number; gex: number }>;
  /** name of the primary series in tooltips ('GEX', 'Δ-adj GEX') */
  valueLabel?: string;
  levels: GridLevels;
  centerKey: string;
  scopeLabel: string;
  height?: string;
  emptyText?: ReactNode;
}) {
  const rows = useMemo(() => [...levelsByStrike].filter((r) => Number.isFinite(r.strike)).sort((a, b) => b.strike - a.strike), [levelsByStrike]);
  const strikes = useMemo(() => rows.map((r) => r.strike), [rows]);
  const cmp = useMemo(() => (compareByStrike ? new Map(compareByStrike.map((r) => [r.strike, r.gex])) : null), [compareByStrike]);
  const max = useMemo(() => Math.max(
    rows.reduce((m, r) => Math.max(m, Math.abs(r.gex)), 0),
    cmp ? [...cmp.values()].reduce((m, v) => Math.max(m, Math.abs(v)), 0) : 0,
  ) || 1e-12, [rows, cmp]);
  const top2 = useMemo(() => (cmp ? new Map([...cmp.entries()].filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([k], i) => [k, i + 1])) : null), [cmp]);
  const gross = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.gex), 0), [rows]);
  // The two largest |net GEX| strikes in scope — labelled so the dominant nodes read at a glance.
  const top = useMemo(() => new Map([...rows].filter((r) => r.gex !== 0).sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 2).map((r, i) => [r.strike, i + 1])), [rows]);
  const { ref, setRef, onScroll, first, last, scrollTop, viewH } = useVirtualRows(rows.length, L_ROW);
  const sIdx = spotIndex(strikes, levels.spot);
  const jump = useCenterOnSpot(ref, sIdx, L_ROW, L_HEAD, centerKey, rows.length > 0);
  const spotRowY = sIdx >= 0 ? L_HEAD + sIdx * L_ROW : null;
  const spotDir = spotRowY == null ? null : spotRowY < scrollTop + L_HEAD ? 'up' : spotRowY > scrollTop + viewH - L_ROW ? 'down' : null;
  const zgY = priceY(strikes, levels.zeroGamma, L_ROW, L_HEAD);
  const spotY = priceY(strikes, levels.spot, L_ROW, L_HEAD);

  if (!rows.length) return <div className="gx-empty">{emptyText ?? 'No material gamma levels returned.'}</div>;

  return (
    <div className={`gx-wrap ladder${cmp ? ' pair' : ''}`} style={{ height }}>
      <div
        ref={setRef}
        className="gx-scroll"
        tabIndex={0}
        role="region"
        aria-label={`Gamma by strike, ${scopeLabel}, ${rows.length} strikes. Arrow keys scroll, S jumps to spot.`}
        onScroll={onScroll}
        onKeyDown={(e) => onGridKey(e, L_ROW, () => jump(true))}
      >
        <div className="gx-lines" style={{ height: L_HEAD + rows.length * L_ROW }} aria-hidden>
          {zgY != null && <div className="gx-line zg" style={{ top: zgY }}><span>ZERO-γ ${levels.zeroGamma!.toFixed(2)}</span></div>}
          {spotY != null && <div className="gx-line spot gx-line-gutter" style={{ top: spotY }}><span>SPOT</span></div>}
        </div>
        <div className="gx-ladder-head" style={{ height: L_HEAD }}>
          <span>STRIKE</span>
          <span className="gx-axis-labels" title="Left of centre: negative net GEX — dealers short gamma, hedging takes liquidity. Right: positive — dealers long gamma, hedging provides liquidity."><em style={{ color: signInk(-1) }}>← − takes</em><em style={{ color: signInk(1) }}>+ provides →</em></span>
          <span style={{ textAlign: 'right' }}>{cmp ? <>raw · <b className="gx-adj-tag">Δ</b> $/1%</> : '$ /1%'}</span>
          <span />
        </div>
        <div style={{ height: first * L_ROW }} aria-hidden />
        {rows.slice(first, last).map((r) => {
          const roles = rolesFor(r.strike, levels);
          const lead = roles[0];
          const isSpotRow = strikes[sIdx] === r.strike;
          const w = (Math.abs(r.gex) / max) * 50;
          const t = Math.sqrt(Math.abs(r.gex) / max);
          const rank = top.get(r.strike);
          const dist = levels.spot > 0 ? ((r.strike - levels.spot) / levels.spot) * 100 : 0;
          const g2 = cmp?.get(r.strike) ?? 0;
          const w2 = (Math.abs(g2) / max) * 50;
          const t2 = Math.sqrt(Math.abs(g2) / max);
          const rank2 = top2?.get(r.strike);
          return (
            <div
              key={r.strike}
              className={`gx-lrow${lead ? ' marked' : ''}${isSpotRow ? ' spot' : ''}${rank ? ' top' : ''}`}
              style={{ height: L_ROW, ...(lead ? { ['--band' as string]: ROLE_COLOR[lead] } : {}) }}
              title={`${fmtStrike(r.strike)} · ${scopeLabel} · ${cmp ? 'raw' : 'net'} ${valueLabel} ${fmtGexB(r.gex)}/1%${cmp ? ` · Δ-adjusted ${fmtGexB(g2)}/1%${r.gex !== 0 ? ` (×${(g2 / r.gex).toFixed(2)})` : ''}${rank2 ? ` · Δ-adj #${rank2}` : ''}` : ''} · ${gross > 0 ? ((Math.abs(r.gex) / gross) * 100).toFixed(1) : '0'}% of gross · ${dist >= 0 ? '+' : ''}${dist.toFixed(2)}% vs spot`}
            >
              <span className="gx-lstrike"><b>{fmtStrike(r.strike)}</b><small>{dist >= 0 ? '+' : ''}{dist.toFixed(1)}%</small></span>
              <span className={`gx-laxis${cmp ? ' pair' : ''}`}>
                {r.gex !== 0 && (
                  <i
                    className={`${r.gex > 0 ? 'pos' : 'neg'}${cmp ? ' a' : ''}`}
                    // length AND ramp lightness carry magnitude; hue carries sign
                    style={{ ...(r.gex > 0 ? { left: '50%' } : { right: '50%' }), width: `${Math.max(0.4, w)}%`, background: rampColor(r.gex, 0.3 + 0.7 * t) }}
                  />
                )}
                {cmp && g2 !== 0 && (
                  <i
                    className={`${g2 > 0 ? 'pos' : 'neg'} b`}
                    style={{ ...(g2 > 0 ? { left: '50%' } : { right: '50%' }), width: `${Math.max(0.4, w2)}%`, background: rampColor(g2, 0.3 + 0.7 * t2) }}
                  />
                )}
              </span>
              <span className="gx-lval" style={{ color: signInk(r.gex) }} data-rank={rank ? (rank === 1 ? '①' : '②') : undefined}>
                {r.gex === 0 ? '—' : cmp ? fmtCompact(r.gex, 'gex') : fmtGexB(r.gex)}
                {cmp && <span className="gx-adj-tag gx-lval2" style={{ color: signInk(g2) }} data-rank={rank2 ? (rank2 === 1 ? '①' : '②') : undefined}>{g2 === 0 ? '—' : fmtCompact(g2, 'gexAdj')}</span>}
              </span>
              <span className="gx-lrole">{roles.length ? <RoleChips roles={roles} /> : null}</span>
            </div>
          );
        })}
        <div style={{ height: Math.max(0, rows.length - last) * L_ROW }} aria-hidden />
      </div>
      {levels.spot > 0 && sIdx >= 0 && <JumpToSpot spot={levels.spot} direction={spotDir} onClick={() => jump(true)} />}
    </div>
  );
}
