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

export type Metric = 'gex' | 'vex';
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
function fmtCompact(v: number, metric: Metric): string {
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
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  const [viewW, setViewW] = useState(0);
  const raf = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { setViewH(el.clientHeight || 600); setViewW(el.clientWidth || 0); };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
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
  return { ref, onScroll, first, last, scrollTop, viewH, viewW };
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

const M_ROW = 30;
const M_HEAD = 50;
/** Phone rows / header: ≥ 36px rows (thumb-sized), a 3-line 12px header (date · dte · net). */
const M_ROW_NARROW = 38;
const M_HEAD_NARROW = 62;
/** "OCT 02" → "Oct 2" (short, never ellipsised on a phone). */
const shortExpiry = (label: string) => label.replace(/^([A-Z])([A-Z]+)\s+0?(\d+)$/, (_m, a: string, b: string, d: string) => `${a}${b.toLowerCase()} ${d}`);

/**
 * Column geometry — FITS the matrix to its measured box (operator 2026-09-29:
 * "4–5 days per one scroll"). The strike and Σ columns are pinned; the width
 * between them holds exactly `perView` expiry columns — 5, or 4 when five
 * would be narrower than MIN_COL (a phone in portrait) — and the rest of the
 * expiries are one horizontal swipe / scroll away, snapping by expiry. When
 * fewer expiries are shown than fit, they share the width. Strikes never
 * expand: they scroll vertically inside the tile.
 */
export const MIN_COL = 58;
/** Phone portrait: the narrowest column that still fits a ≤ 5-char value at 13px (tabular). */
export const MIN_COL_NARROW = 48;
export interface MatrixGeometry {
  size: 'narrow' | 'mid' | 'wide';
  strikeW: number;
  sumW: number;
  colW: number;
  perView: number;
  tableW: number;
}
export function matrixGeometry(width: number, cols: number): MatrixGeometry {
  const w = Math.max(0, width);
  const size = w < 560 ? 'narrow' : w < 900 ? 'mid' : 'wide';
  const strikeW = size === 'narrow' ? 60 : size === 'mid' ? 128 : 176;
  const sumW = size === 'narrow' ? 54 : size === 'mid' ? 96 : 132;
  const avail = Math.max(0, w - strikeW - sumW);
  // phones: bigger, fewer — at most 4 per view, 3 when 4 would not fit a 13px value
  const perView = size === 'narrow' ? (avail / 4 >= MIN_COL_NARROW ? 4 : 3) : avail / 5 >= MIN_COL ? 5 : 4;
  const colW = cols <= 0 ? 0 : Math.floor(avail / Math.min(perView, cols));
  return { size, strikeW, sumW, colW, perView, tableW: strikeW + sumW + colW * cols };
}

/** Legend: the diverging ramp with its value → colour ticks for the active scale. */
function RampLegend({ scale, max, metric }: { scale: MatrixScale; max: number; metric: Metric }) {
  const lab = (f: number) => (scale === 'column' ? (f === 0 ? '0' : `${f < 0 ? '−' : '+'}${Math.abs(f) === 1 ? 'max' : '¼'}`) : f === 0 ? '0' : fmtVal(f * max, metric));
  return (
    <span className="gx-ramp" title={scale === 'column'
      ? 'Colour = √(|value| ÷ that expiry column\'s own max). The middle stop (¼ of max) is half-way along the ramp. Blue = + (dealers long gamma, provides liquidity); orange = − (dealers short gamma, takes liquidity).'
      : 'Colour = √(|value| ÷ the largest cell in the grid, robust 98.5th pct). Blue = +, orange = −.'}>
      <span className="gx-ramp-bar" style={{ background: rampGradient() }} />
      <span className="gx-ramp-ticks">
        {[-1, -0.25, 0, 0.25, 1].map((f) => <span key={f}>{lab(f)}</span>)}
      </span>
    </span>
  );
}

export function GexStrikeMatrix({
  cells,
  expiries,
  levels,
  metric,
  centerKey,
  onCellClick,
  emptyText,
  scale: scaleProp,
  onScaleChange,
}: {
  /** every listed cell for the symbol (all expiries) — shares are of this book */
  cells: StrikeExpiryCell[];
  /** columns to show: [dte, label], ascending */
  expiries: Array<[number, string]>;
  levels: GridLevels;
  metric: Metric;
  /** change to re-centre on spot (symbol, metric) */
  centerKey: string;
  onCellClick?: (cell: StrikeExpiryCell) => void;
  emptyText?: ReactNode;
  /** controlled colour scale (defaults to per-expiry, owned here when omitted) */
  scale?: MatrixScale;
  onScaleChange?: (s: MatrixScale) => void;
}) {
  const [ownScale, setOwnScale] = useState<MatrixScale>('column');
  const scale = scaleProp ?? ownScale;
  const setScale = onScaleChange ?? setOwnScale;
  const [showDust, setShowDust] = useState(false);
  const [dustPct, setDustPct] = useState(0.5);
  const val = useCallback((c: StrikeExpiryCell) => (metric === 'vex' ? (c.netVEX ?? 0) : c.netGEX), [metric]);

  const model = useMemo(() => {
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
    const col = new Map<number, { rMax: number; trueMax: number; net: number; gross: number; top: Map<number, number> }>();
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
    return { strikes, byKey, rowTotal, rowMax, gross, rMax, trueMax, col };
  }, [cells, expiries, val]);

  // Row height follows the measured size class (phones get taller rows); the
  // class is known after the first measure, so it lives in state.
  const [narrowRows, setNarrowRows] = useState(false);
  const ROW = narrowRows ? M_ROW_NARROW : M_ROW;
  const HEAD = narrowRows ? M_HEAD_NARROW : M_HEAD;
  const { ref, onScroll, first, last, scrollTop, viewH, viewW } = useVirtualRows(model.strikes.length, ROW);
  const geo = matrixGeometry(viewW, expiries.length);
  useEffect(() => { setNarrowRows(geo.size === 'narrow'); }, [geo.size]);
  const sIdx = spotIndex(model.strikes, levels.spot);
  const jump = useCenterOnSpot(ref, sIdx, ROW, HEAD, centerKey, model.strikes.length > 0);
  const spotRowY = sIdx >= 0 ? HEAD + sIdx * ROW : null;
  const spotDir = spotRowY == null ? null : spotRowY < scrollTop + HEAD ? 'up' : spotRowY > scrollTop + viewH - ROW ? 'down' : null;
  const zgY = priceY(model.strikes, levels.zeroGamma, ROW, HEAD);
  const spotY = priceY(model.strikes, levels.spot, ROW, HEAD);
  const scaleMaxOf = (dte: number) => (scale === 'column' ? model.col.get(dte)?.rMax ?? model.rMax : model.rMax);
  const dustCutOf = (dte: number) => (scale === 'column' ? model.col.get(dte)?.trueMax ?? model.trueMax : model.trueMax) * (dustPct / 100);

  /* hover card — one floating element, event-delegated */
  // The card's CONTENT changes only when the hovered cell changes (React state);
  // its POSITION follows the mouse through the DOM directly, so moving across a
  // cell does not re-render the grid on every mousemove.
  const [hover, setHover] = useState<{ x: number; y: number; strike: number; dte: number | null } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const place = (x: number, y: number) => {
    const w = wrapRef.current?.clientWidth ?? 800;
    return { left: Math.max(4, Math.min(x + 14, w - 250)), top: y + 16 };
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

  if (!model.strikes.length) {
    return <div className="gx-empty">{emptyText ?? 'no listed cells'}</div>;
  }

  const cols = expiries.length;
  const visible = model.strikes.slice(first, last);

  return (
    <div
      className={`gx-wrap gx-${geo.size}`}
      ref={wrapRef}
      onMouseLeave={() => setHover(null)}
      data-per-view={geo.perView}
      data-col-w={geo.colW}
      style={{ ['--gx-strike-w' as string]: `${geo.strikeW}px`, ['--gx-sum-w' as string]: `${geo.sumW}px` }}
    >
      <div className="gx-toolbar">
        <span className="gx-scale-seg" role="group" aria-label="Colour scale">
          <b>Scale</b>
          {(['column', 'absolute'] as const).map((k) => (
            <button key={k} type="button" className={scale === k ? 'on' : ''} aria-pressed={scale === k} onClick={() => setScale(k)}
              title={k === 'column' ? 'Each expiry column is coloured 0 → its own max. Later expiries stay readable; compare cells DOWN a column.' : 'One max for every cell. Compare ACROSS expiries; later expiries will look faint because near-term gamma dominates.'}>
              {k === 'column' ? 'Per expiry' : 'Absolute'}
            </button>
          ))}
        </span>
        <span className="gx-scale-now" role="status">
          {scale === 'column' ? 'each column 0 → its own max' : `one max for all cells · ${fmtVal(model.rMax, metric)}`}
        </span>
        <RampLegend scale={scale} max={model.rMax} metric={metric} />
        <span className="gx-sign" title="Blue = + (dealers long gamma, hedging provides liquidity). Orange = − (dealers short gamma, hedging takes liquidity). ①② = the two largest |cells| of each expiry, never hidden. Blank = the chain never listed that strike × expiry."><b style={{ color: signInk(1) }}>+ provides</b> · <b style={{ color: signInk(-1) }}>− takes</b> · {unitOf(metric).replace('/', '$ per ')} · ①② top-2/expiry · blank = not listed</span>
        <label className="gx-toggle" title={`Cells smaller than ${dustPct}% of the largest cell in their scale are dust. Hidden, they print a faint dot (listed, but immaterial); hover still answers. The top-2 cells of every expiry are never hidden. Blank = the chain never listed that strike × expiry.`}>
          <input type="checkbox" checked={showDust} onChange={(e) => setShowDust(e.target.checked)} />
          show dust
          <select value={dustPct} onChange={(e) => setDustPct(Number(e.target.value))} aria-label="Dust threshold">
            {[0.1, 0.5, 1, 2].map((p) => <option key={p} value={p}>&lt; {p}% of max</option>)}
          </select>
        </label>
        <span className="gx-legend">
          <i style={{ background: LEVEL_COLORS.callWall }} />call wall
          <i style={{ background: LEVEL_COLORS.putWall }} />put wall
          <i style={{ background: LEVEL_COLORS.magnet }} />max γ
          <i className="dash" style={{ borderColor: LEVEL_COLORS.zeroGamma }} />zero-γ
          <i style={{ background: LEVEL_COLORS.spot }} />spot
        </span>
        {geo.size === 'narrow' && levels.spot > 0 && sIdx >= 0 && (
          <button type="button" className={`gx-spot-btn${spotDir ? ' off' : ''}`} onClick={() => jump(true)} title="Scroll spot to the centre">
            {spotDir === 'up' ? '↑' : spotDir === 'down' ? '↓' : '◎'} Spot ${levels.spot.toFixed(2)}
          </button>
        )}
        {cols > geo.perView && (
          <span className="gx-pager" role="group" aria-label="Scroll expiries">
            <button type="button" onClick={() => ref.current?.scrollBy({ left: -(geo.colW || 120) * geo.perView, behavior: 'smooth' })} aria-label="Earlier expiries" title="Earlier expiries (or Shift+wheel / swipe)">‹</button>
            <button type="button" onClick={() => ref.current?.scrollBy({ left: (geo.colW || 120) * geo.perView, behavior: 'smooth' })} aria-label="Later expiries" title="Later expiries (or Shift+wheel / swipe)">›</button>
          </span>
        )}
        <span className="gx-count">{model.strikes.length} strikes · {Math.min(cols, geo.perView)} of {cols} exp in view{cols > geo.perView ? ' · ↔ swipe' : ''} · ↕ scroll{geo.size === 'narrow' ? ` · ${metric === 'vex' ? '$ per IV pt' : '$ per 1%'}` : ' · S = spot'}</span>
      </div>

      <div
        ref={ref}
        className="gx-scroll gx-snap"
        tabIndex={0}
        role="region"
        aria-label={`Strike by expiry ${metric.toUpperCase()} grid, ${model.strikes.length} strikes, ${Math.min(cols, geo.perView)} of ${cols} expiries in view. Arrow keys scroll, S jumps to spot.`}
        style={{ scrollPaddingLeft: geo.strikeW, scrollPaddingRight: geo.sumW }}
        onScroll={onScroll}
        onKeyDown={(e) => onGridKey(e, ROW, () => jump(true), geo.colW || 120)}
        onMouseMove={onMove}
      >
        <div className="gx-lines" style={{ height: HEAD + model.strikes.length * ROW }} aria-hidden>
          {zgY != null && <div className="gx-line zg" style={{ top: zgY }}><span>ZERO-γ ${levels.zeroGamma!.toFixed(2)}</span></div>}
          {spotY != null && <div className="gx-line spot" style={{ top: spotY }}><span>SPOT ${levels.spot.toFixed(2)}</span></div>}
        </div>
        <table className="gx-table gx-fit" style={geo.colW ? { width: geo.tableW } : undefined}>
          {geo.colW > 0 && (
            <colgroup>
              <col style={{ width: geo.strikeW }} />
              {expiries.map(([dte]) => <col key={dte} style={{ width: geo.colW }} />)}
              <col style={{ width: geo.sumW }} />
            </colgroup>
          )}
          <thead>
            <tr style={{ height: HEAD }}>
              <th className="gx-sticky-l">STRIKE</th>
              {expiries.map(([dte, label]) => {
                const cs = model.col.get(dte);
                return (
                  <th key={dte} className="gx-exp" title={`${label} · ${dte} days to expiry\nNet ${metric.toUpperCase()} this expiry (all listed strikes): ${cs ? fmtVal(cs.net, metric) : '—'}${unitOf(metric)}\nGross |${metric.toUpperCase()}|: ${cs ? fmtVal(cs.gross, metric).replace(/^[+−]/, '') : '—'} · ${model.gross > 0 && cs ? ((cs.gross / model.gross) * 100).toFixed(1) : '0'}% of the book\n${scale === 'column' ? `Colour max for this column: ${cs ? fmtVal(cs.rMax, metric).replace(/^[+−]/, '') : '—'}` : 'Colour: one max for all columns'}`}>
                    {geo.size === 'narrow' ? shortExpiry(label) : label}<small>{dte}d</small>
                    <em className="gx-colnet" style={{ color: cs ? signInk(cs.net) : undefined }}>{cs ? (geo.size === 'narrow' ? fmtCompact(cs.net, metric) : `Σ ${fmtVal(cs.net, metric)}`) : '—'}</em>
                  </th>
                );
              })}
              <th className="gx-sticky-r" title="Net of the shown expiries at this strike — why a wall is a wall even when each single expiry is small">{geo.size === 'narrow' ? 'Σ' : 'Σ SHOWN'}</th>
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr style={{ height: first * ROW }} aria-hidden><td colSpan={cols + 2} /></tr>}
            {visible.map((strike) => {
              const roles = rolesFor(strike, levels);
              const lead = roles[0];
              const isSpotRow = model.strikes[sIdx] === strike;
              const dist = levels.spot > 0 ? ((strike - levels.spot) / levels.spot) * 100 : 0;
              const total = model.rowTotal.get(strike) ?? 0;
              const tw = Math.max(0, Math.min(100, (Math.abs(total) / model.rowMax) * 100));
              const band = lead ? ROLE_COLOR[lead] : null;
              return (
                <tr
                  key={strike}
                  className={`gx-row${lead ? ' marked' : ''}${isSpotRow ? ' spot' : ''}`}
                  style={{ height: ROW, ...(band ? { ['--band' as string]: band } : {}) }}
                >
                  <td className="gx-sticky-l gx-strike" data-k={`${strike}|sum`}>
                    <b>{fmtStrike(strike)}</b>
                    <span className="gx-pct">{dist >= 0 ? '+' : ''}{dist.toFixed(1)}%</span>
                    {geo.size === 'narrow' && isSpotRow && !roles.length ? <span className="gx-chips"><span className="gx-chip gx-chip-spot" title={`Nearest strike to spot $${levels.spot.toFixed(2)}`}>◎</span></span> : <RoleChips roles={geo.size === 'narrow' ? roles.slice(0, 1) : roles} short={geo.size !== 'wide'} />}
                  </td>
                  {expiries.map(([dte]) => {
                    const c = model.byKey.get(`${strike}|${dte}`);
                    if (!c) return <td key={dte} />;
                    const v = val(c);
                    if (v === 0) return <td key={dte} data-k={`${strike}|${dte}`}><span className="gx-dot" /></td>;
                    const rank = model.col.get(dte)?.top.get(strike);
                    const dust = !rank && Math.abs(v) < dustCutOf(dte);
                    if (dust && !showDust) return <td key={dte} data-k={`${strike}|${dte}`}><span className="gx-dot" /></td>;
                    const t = exposureStrength(v, scaleMaxOf(dte));
                    return (
                      <td key={dte} data-k={`${strike}|${dte}`}>
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`gx-cell${dust ? ' dust' : ''}${rank ? ' top' : ''}`}
                          data-rank={rank ? (rank === 1 ? '①' : '②') : undefined}
                          style={{ background: rampColor(v, t), color: rampInk(t) }}
                          onClick={onCellClick ? () => onCellClick(c) : undefined}
                          aria-label={rank ? `${fmtVal(v, metric)}, #${rank} in this expiry` : geo.size === 'narrow' ? fmtVal(v, metric) : undefined}
                        >
                          {geo.size === 'narrow' ? fmtCompact(v, metric) : fmtVal(v, metric)}
                        </button>
                      </td>
                    );
                  })}
                  <td className="gx-sticky-r gx-sum" data-k={`${strike}|sum`}>
                    <span className="gx-sum-bar"><i style={{ width: `${tw}%`, background: rampColor(total, 0.55), opacity: total === 0 ? 0 : 1 }} /></span>
                    <span style={{ color: signInk(total) }}>{total === 0 ? '—' : geo.size === 'narrow' ? fmtCompact(total, metric) : fmtVal(total, metric)}</span>
                  </td>
                </tr>
              );
            })}
            {last < model.strikes.length && <tr style={{ height: (model.strikes.length - last) * ROW }} aria-hidden><td colSpan={cols + 2} /></tr>}
          </tbody>
        </table>
      </div>

      {geo.size !== 'narrow' && levels.spot > 0 && sIdx >= 0 && <JumpToSpot spot={levels.spot} direction={spotDir} onClick={() => jump(true)} />}

      {hover && (() => {
        const rowTotal = model.rowTotal.get(hover.strike) ?? 0;
        const roles = rolesFor(hover.strike, levels);
        const c = hover.dte != null ? model.byKey.get(`${hover.strike}|${hover.dte}`) : undefined;
        const v = c ? val(c) : rowTotal;
        const p = place(hover.x, hover.y);
        return (
          <div ref={cardRef} className="gx-hover" style={{ left: p.left, top: p.top }} role="tooltip">
            <div className="gx-hover-h">{fmtStrike(hover.strike)} · {c ? `${c.expiryLabel} (${c.dte}d)` : 'Σ shown expiries'}</div>
            <div><span>{metric.toUpperCase()}</span><b style={{ color: signInk(v) }}>{fmtVal(v, metric)}{unitOf(metric)}</b></div>
            {c && model.col.get(c.dte)?.top.get(hover.strike) && <div><span>rank in {c.expiryLabel}</span><b>#{model.col.get(c.dte)!.top.get(hover.strike)}</b></div>}
            {c && <div><span>colour scale</span><b>{scale === 'column' ? `per expiry · max ${fmtVal(scaleMaxOf(c.dte), metric).replace(/^[+−]/, '')}` : 'absolute'}</b></div>}
            <div><span>share of gross book</span><b>{model.gross > 0 ? `${((Math.abs(v) / model.gross) * 100).toFixed(2)}%` : '—'}</b></div>
            {c && <div><span>share of {fmtStrike(hover.strike)} row</span><b>{rowTotal !== 0 ? `${((v / rowTotal) * 100).toFixed(0)}%` : '—'}</b></div>}
            <div><span>vs spot</span><b>{levels.spot > 0 ? `${(((hover.strike - levels.spot) / levels.spot) * 100).toFixed(2)}%` : '—'}</b></div>
            {c && Math.abs(v) < dustCutOf(c.dte) && <div className="gx-hover-note">dust — under {dustPct}% of the largest cell in its scale</div>}
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
}: {
  /** strike → net GEX ($B per 1%) for the ladder's scope */
  levelsByStrike: Array<{ strike: number; gex: number }>;
  levels: GridLevels;
  centerKey: string;
  scopeLabel: string;
  height?: string;
  emptyText?: ReactNode;
}) {
  const rows = useMemo(() => [...levelsByStrike].filter((r) => Number.isFinite(r.strike)).sort((a, b) => b.strike - a.strike), [levelsByStrike]);
  const strikes = useMemo(() => rows.map((r) => r.strike), [rows]);
  const max = useMemo(() => rows.reduce((m, r) => Math.max(m, Math.abs(r.gex)), 0) || 1e-12, [rows]);
  const gross = useMemo(() => rows.reduce((s, r) => s + Math.abs(r.gex), 0), [rows]);
  // The two largest |net GEX| strikes in scope — labelled so the dominant nodes read at a glance.
  const top = useMemo(() => new Map([...rows].filter((r) => r.gex !== 0).sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 2).map((r, i) => [r.strike, i + 1])), [rows]);
  const { ref, onScroll, first, last, scrollTop, viewH } = useVirtualRows(rows.length, L_ROW);
  const sIdx = spotIndex(strikes, levels.spot);
  const jump = useCenterOnSpot(ref, sIdx, L_ROW, L_HEAD, centerKey, rows.length > 0);
  const spotRowY = sIdx >= 0 ? L_HEAD + sIdx * L_ROW : null;
  const spotDir = spotRowY == null ? null : spotRowY < scrollTop + L_HEAD ? 'up' : spotRowY > scrollTop + viewH - L_ROW ? 'down' : null;
  const zgY = priceY(strikes, levels.zeroGamma, L_ROW, L_HEAD);
  const spotY = priceY(strikes, levels.spot, L_ROW, L_HEAD);

  if (!rows.length) return <div className="gx-empty">{emptyText ?? 'No material gamma levels returned.'}</div>;

  return (
    <div className="gx-wrap ladder" style={{ height }}>
      <div
        ref={ref}
        className="gx-scroll"
        tabIndex={0}
        role="region"
        aria-label={`Gamma by strike, ${scopeLabel}, ${rows.length} strikes. Arrow keys scroll, S jumps to spot.`}
        onScroll={onScroll}
        onKeyDown={(e) => onGridKey(e, L_ROW, () => jump(true))}
      >
        <div className="gx-lines" style={{ height: L_HEAD + rows.length * L_ROW }} aria-hidden>
          {zgY != null && <div className="gx-line zg" style={{ top: zgY }}><span>ZERO-γ ${levels.zeroGamma!.toFixed(2)}</span></div>}
          {spotY != null && <div className="gx-line spot" style={{ top: spotY }}><span>SPOT ${levels.spot.toFixed(2)}</span></div>}
        </div>
        <div className="gx-ladder-head" style={{ height: L_HEAD }}>
          <span>STRIKE</span>
          <span className="gx-axis-labels" title="Left of centre: negative net GEX — dealers short gamma, hedging takes liquidity. Right: positive — dealers long gamma, hedging provides liquidity."><em style={{ color: signInk(-1) }}>← − takes</em><em style={{ color: signInk(1) }}>+ provides →</em></span>
          <span style={{ textAlign: 'right' }}>$ /1%</span>
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
          return (
            <div
              key={r.strike}
              className={`gx-lrow${lead ? ' marked' : ''}${isSpotRow ? ' spot' : ''}${rank ? ' top' : ''}`}
              style={{ height: L_ROW, ...(lead ? { ['--band' as string]: ROLE_COLOR[lead] } : {}) }}
              title={`${fmtStrike(r.strike)} · ${scopeLabel} · net GEX ${fmtGexB(r.gex)}/1% · ${gross > 0 ? ((Math.abs(r.gex) / gross) * 100).toFixed(1) : '0'}% of gross · ${dist >= 0 ? '+' : ''}${dist.toFixed(2)}% vs spot`}
            >
              <span className="gx-lstrike"><b>{fmtStrike(r.strike)}</b><small>{dist >= 0 ? '+' : ''}{dist.toFixed(1)}%</small></span>
              <span className="gx-laxis">
                {r.gex !== 0 && (
                  <i
                    className={r.gex > 0 ? 'pos' : 'neg'}
                    // length AND ramp lightness carry magnitude; hue carries sign
                    style={{ ...(r.gex > 0 ? { left: '50%' } : { right: '50%' }), width: `${Math.max(0.4, w)}%`, background: rampColor(r.gex, 0.3 + 0.7 * t) }}
                  />
                )}
              </span>
              <span className="gx-lval" style={{ color: signInk(r.gex) }} data-rank={rank ? (rank === 1 ? '①' : '②') : undefined}>{r.gex === 0 ? '—' : fmtGexB(r.gex)}</span>
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
