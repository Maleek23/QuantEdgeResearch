/**
 * GEX PHONE MATRIX (operator 2026-09-30: "see how clean and fits the screen
 * this looks" — ITMatrix's 393-wide phone grid is the structural reference;
 * colours stay ours, the CVD-safe diverging ramp from gex-colors.ts).
 *
 * Phone only (< 768px). The matrix IS the page:
 *   - full-bleed, fills the height between the page header and the dock
 *     (measured: the dock's top edge, the bottom bar, the grid's own top);
 *   - FIT, not scroll (operator 2026-10-01): as many expiry columns as the
 *     measured width holds at ≥ 50px each (6 at 375–390px, so the whole 0–7d
 *     week shows without paging), a sticky strike column, one-line "SEP 29"
 *     headers, 12–15px bold tabular values (sized to the column), 1px separators;
 *   - the nearest 13 strikes around spot by default (25 / all from the settings
 *     sheet), rows stretched to fill the height — no vertical scroll at 13;
 *   - king node per expiry = solid yellow with dark ink; #2–#3 per expiry
 *     get an outline; every other cell is shaded by |value| (√ scale, per
 *     expiry, as on desktop). The value is always printed — colour is never alone;
 *   - the spot row carries a filled price tag in the strike column (nothing
 *     floats over the cells);
 *   - a sticky NET $ row per expiry (every listed strike of that expiry);
 *   - bottom bar: ticker quick-switch chips (watchlist) and an expiry pager,
 *     shown only when the horizon has more expiries than fit; a horizontal
 *     swipe on the grid also pages. Width and height come from a
 *     ResizeObserver, so rotation / split view / a resized window re-fit.
 *
 * Nothing is invented: an absent cell is blank ("not listed"); a tap on a
 * cell opens the same drill as desktop (GexCellDrill, owned by the caller).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StrikeExpiryCell } from '@shared/gex-types';
import { robustMax } from '@/components/viz';
import { exposureStrength, rampColor, rampInk } from './gex-colors';
import { fmtCompact, type Metric } from './gex-strike-grid';

/** min expiry-column width (px) — "−1.2B" at 12px bold mono plus padding */
const MIN_COL = 50;
/** sticky strike column width (px) — "◎ 6695" fits */
const KEY_COL = 54;
/** strikes on screen: nearest N to spot (odd → spot row in the middle); 'all' = ±40 */
export type PhoneStrikeRows = 13 | 25 | 'all';
export const PHONE_STRIKE_ROWS: PhoneStrikeRows[] = [13, 25, 'all'];
const ALL_SIDE = 40;
/** expiry columns that fit a grid `w` px wide */
export const phoneColsFor = (w: number) => Math.max(3, Math.min(7, Math.floor((w - KEY_COL) / MIN_COL)));

const val = (c: StrikeExpiryCell, m: Metric) => (m === 'vex' ? (c.netVEX ?? 0) : m === 'gexAdj' ? (c.netGEXAdj ?? 0) : c.netGEX);
const expLabel = (label: string) => label.toUpperCase().replace(/\s0(\d)$/, ' $1');
const strikeTxt = (s: number) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

export function GexPhoneMatrix({ cells, expiries, spot, metric, symbol, onCellClick, chips, onSymbol, strikeRows = 13 }: {
  cells: StrikeExpiryCell[];
  /** every listed expiry, ascending: [dte, label] */
  expiries: Array<[number, string]>;
  spot: number;
  metric: Metric;
  symbol: string;
  onCellClick?: (c: StrikeExpiryCell) => void;
  /** quick-switch tickers (watchlist first) */
  chips: string[];
  onSymbol: (s: string) => void;
  /** nearest N strikes around spot (default 13), or every listed strike within ±40 */
  strikeRows?: PhoneStrikeRows;
}) {
  /* measured box: width → columns per page, height → row height (ResizeObserver) */
  const rootRef = useRef<HTMLDivElement>(null);
  const scRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number | null }>({ w: 375, h: null });
  const perPage = phoneColsFor(box.w);
  const pages = Math.max(1, Math.ceil(expiries.length / perPage));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [symbol]);
  const pg = Math.min(page, pages - 1);
  const shown = useMemo(() => expiries.slice(pg * perPage, pg * perPage + perPage), [expiries, pg, perPage]);

  const model = useMemo(() => {
    const listed = cells.filter((c) => Number.isFinite(c.strike) && Number.isFinite(c.dte) && c.dte >= 0);
    const shownDte = new Set(shown.map(([d]) => d));
    const byKey = new Map<string, StrikeExpiryCell>();
    const col = new Map<number, { rMax: number; net: number; rank: Map<number, number> }>();
    const perCol = new Map<number, StrikeExpiryCell[]>();
    const all = new Set<number>();
    for (const c of listed) {
      if (!shownDte.has(c.dte)) continue;
      all.add(c.strike);
      byKey.set(`${c.strike}|${c.dte}`, c);
      const a = perCol.get(c.dte); if (a) a.push(c); else perCol.set(c.dte, [c]);
    }
    for (const [dte, list] of perCol) {
      const ranked = list.filter((c) => val(c, metric) !== 0).sort((a, b) => Math.abs(val(b, metric)) - Math.abs(val(a, metric)));
      col.set(dte, {
        rMax: robustMax(list.map((c) => Math.abs(val(c, metric))), 1e-12, 0.985),
        // NET $ = every listed strike of this expiry (not only the rows on screen)
        net: list.reduce((s, c) => s + val(c, metric), 0),
        rank: new Map(ranked.slice(0, 3).map((c, i) => [c.strike, i + 1])),
      });
    }
    const desc = [...all].sort((a, b) => b - a);
    // nearest strike to spot, then SIDE strikes each way
    let si = 0;
    for (let i = 0; i < desc.length; i++) if (Math.abs(desc[i] - spot) < Math.abs(desc[si] - spot)) si = i;
    // nearest strike's window: N rows centred on spot (clamped at the book's edges)
    const side = strikeRows === 'all' ? ALL_SIDE : (strikeRows - 1) / 2;
    let lo = Math.max(0, si - side); let hi = Math.min(desc.length, si + side + 1);
    if (strikeRows !== 'all') { const want = strikeRows; if (hi - lo < want) { if (lo === 0) hi = Math.min(desc.length, want); else lo = Math.max(0, hi - want); } }
    const strikes = desc.slice(lo, hi);
    return { byKey, col, strikes, spotStrike: desc.length ? desc[si] : null };
  }, [cells, shown, metric, spot, strikeRows]);

  /* fill the screen: the grid ends at the bottom bar, which ends at the dock */
  useLayoutEffect(() => {
    const measure = () => {
      const el = scRef.current; const root = rootRef.current; if (!el || !root) return;
      const main = document.getElementById('main-content');
      const top = el.getBoundingClientRect().top + (main?.scrollTop ?? window.scrollY);
      const dock = document.querySelector('.qe-dock');
      const dockTop = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect().top : window.innerHeight;
      const bar = barRef.current?.getBoundingClientRect().height ?? 56;
      const w = Math.round(root.getBoundingClientRect().width);
      const h = Math.max(300, Math.round(dockTop - top - bar - 6));
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && rootRef.current) ro.observe(rootRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, []);
  const h = box.h;
  /* rows stretch to fill the measured height (30–46px); past that the strikes scroll inside */
  const HEAD = 32; const FOOT = 32;
  const rowH = h ? Math.max(30, Math.min(46, Math.floor((h - HEAD - FOOT) / Math.max(1, model.strikes.length)))) : 37;
  const colW = (box.w - KEY_COL) / Math.max(1, shown.length);
  const cellFont = colW >= 72 ? 15 : colW >= 60 ? 14 : colW >= 54 ? 13 : 12;
  const fits = h != null && HEAD + FOOT + rowH * model.strikes.length <= h;

  /* centre spot on load, symbol, metric or page change — never on a refetch */
  const centred = useRef('');
  useEffect(() => {
    const el = scRef.current;
    const key = `${symbol}|${metric}|${pg}|${h}|${strikeRows}`;
    if (!el || !model.strikes.length || centred.current === key || h == null) return;
    centred.current = key;
    const row = el.querySelector<HTMLElement>('tr.spot');
    if (row) el.scrollTop = Math.max(0, row.offsetTop - (el.clientHeight - row.offsetHeight) / 2);
  }, [symbol, metric, pg, h, model, strikeRows]);

  /* horizontal swipe pages the expiries */
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null; if (!s) return;
    const t = e.changedTouches[0]; const dx = t.clientX - s.x; const dy = t.clientY - s.y;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) setPage((p) => Math.max(0, Math.min(pages - 1, Math.min(p, pages - 1) + (dx < 0 ? 1 : -1))));
  };

  const unit = metric === 'vex' ? '$ per IV point' : '$ per 1% move';
  return (
    <div ref={rootRef} className="gxp">
      <div ref={scRef} className={`gxp-scroll${fits ? ' fits' : ''}`} style={h ? { height: fits ? HEAD + FOOT + rowH * model.strikes.length + 2 : h } : undefined} tabIndex={0} role="region"
        aria-label={`${symbol} strike by expiry ${metric === 'gexAdj' ? 'Δ-adjusted GEX' : metric.toUpperCase()}, ${unit}, ${model.strikes.length} strikes around spot, expiries ${pg * perPage + 1}–${pg * perPage + shown.length} of ${expiries.length}.${pages > 1 ? ' Swipe sideways for more expiries.' : ''}`}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <table className="gxp-table" style={{ ['--gxp-row' as string]: `${rowH}px`, ['--gxp-font' as string]: `${cellFont}px`, ['--gxp-kcol' as string]: `${KEY_COL}px` }}>
          <colgroup><col className="gxp-col-k" />{shown.map(([d]) => <col key={d} />)}</colgroup>
          <thead>
            <tr>
              <th className="gxp-k" aria-label="Strike" />
              {shown.map(([d, label]) => <th key={d} title={`${label} · ${d} days to expiry`}>{expLabel(label)}</th>)}
            </tr>
          </thead>
          <tbody>
            {model.strikes.map((k) => {
              const isSpot = k === model.spotStrike && spot > 0;
              return (
                <tr key={k} className={isSpot ? 'spot' : undefined}>
                  <th scope="row" className="gxp-k" title={isSpot ? `Strike ${strikeTxt(k)} — nearest to spot $${spot.toFixed(2)}` : `Strike ${strikeTxt(k)}`}>
                    {isSpot ? <span className="gxp-spot" aria-label={`strike ${strikeTxt(k)}, nearest to the chain-snapshot spot ${spot.toFixed(2)}`}>◎ {strikeTxt(k)}</span> : strikeTxt(k)}
                  </th>
                  {shown.map(([d]) => {
                    const c = model.byKey.get(`${k}|${d}`);
                    if (!c) return <td key={d} aria-label="not listed" />;
                    const v = val(c, metric);
                    const cs = model.col.get(d);
                    const rank = cs?.rank.get(k);
                    const t = exposureStrength(v, cs?.rMax ?? 0);
                    const king = rank === 1;
                    return (
                      <td key={d}>
                        <button type="button" className={`gx-cell gxp-cell${king ? ' gxp-king' : rank ? ' gxp-top' : ''}`}
                          style={king ? undefined : { background: v === 0 ? undefined : rampColor(v, t), color: v === 0 ? undefined : rampInk(t), ['--gxp-ring' as string]: rank ? rampInk(t) : undefined }}
                          onClick={onCellClick ? () => onCellClick(c) : undefined}
                          aria-label={`${strikeTxt(k)} ${c.expiryLabel}: ${fmtCompact(v, metric)}${king ? ', king node of this expiry' : rank ? `, #${rank} in this expiry` : ''}`}>
                          {fmtCompact(v, metric)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="gxp-k">NET $</th>
              {shown.map(([d]) => { const n = model.col.get(d)?.net ?? 0; return <td key={d} style={{ color: n ? rampColor(n, 0.95) : undefined }}>{fmtCompact(n, metric)}</td>; })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div ref={barRef} className="gxp-bar">
        <div className="gxp-chips" role="group" aria-label="Switch ticker">
          {chips.map((s) => (
            <button key={s} type="button" className={s === symbol ? 'on' : ''} aria-pressed={s === symbol} onClick={() => onSymbol(s)}>{s}</button>
          ))}
        </div>
        {pages > 1 && (
          <div className="gxp-pager" role="group" aria-label="Expiry pages">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" className={i === pg ? 'on' : ''} aria-pressed={i === pg} aria-label={`Expiries ${i * perPage + 1}–${Math.min(expiries.length, (i + 1) * perPage)}`} onClick={() => setPage(i)}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
