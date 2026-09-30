/**
 * GEX PHONE MATRIX (operator 2026-09-30: "see how clean and fits the screen
 * this looks" — ITMatrix's 393-wide phone grid is the structural reference;
 * colours stay ours, the CVD-safe diverging ramp from gex-colors.ts).
 *
 * Phone only (< 768px). The matrix IS the page:
 *   - full-bleed, fills the height between the page header and the dock
 *     (measured: the dock's top edge, the bottom bar, the grid's own top);
 *   - a narrow strike column, EXACTLY 4 expiry columns per page, one-line
 *     "SEP 29" headers, ~15px bold tabular values, ~38px rows, 1px separators;
 *   - king node per expiry = solid yellow with dark ink; #2–#3 per expiry
 *     get an outline; every other cell is shaded by |value| (√ scale, per
 *     expiry, as on desktop). The value is always printed — colour is never alone;
 *   - the spot row carries a filled price tag in the strike column (nothing
 *     floats over the cells);
 *   - a sticky NET $ row per expiry (every listed strike of that expiry);
 *   - bottom bar: ticker quick-switch chips (watchlist) and an expiry pager
 *     (pages of 4); a horizontal swipe on the grid also pages.
 *
 * Nothing is invented: an absent cell is blank ("not listed"); a tap on a
 * cell opens the same drill as desktop (GexCellDrill, owned by the caller).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StrikeExpiryCell } from '@shared/gex-types';
import { robustMax } from '@/components/viz';
import { exposureStrength, rampColor, rampInk } from './gex-colors';
import { fmtCompact, type Metric } from './gex-strike-grid';

export const PHONE_PER_PAGE = 4;
/** strikes kept each side of spot — a phone reads the near book, not 600 strikes */
const SIDE = 40;

const val = (c: StrikeExpiryCell, m: Metric) => (m === 'vex' ? (c.netVEX ?? 0) : c.netGEX);
const expLabel = (label: string) => label.toUpperCase().replace(/\s0(\d)$/, ' $1');
const strikeTxt = (s: number) => (Number.isInteger(s) ? String(s) : s.toFixed(1));

export function GexPhoneMatrix({ cells, expiries, spot, metric, symbol, onCellClick, chips, onSymbol }: {
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
}) {
  const pages = Math.max(1, Math.ceil(expiries.length / PHONE_PER_PAGE));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [symbol]);
  const pg = Math.min(page, pages - 1);
  const shown = expiries.slice(pg * PHONE_PER_PAGE, pg * PHONE_PER_PAGE + PHONE_PER_PAGE);

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
    const lo = Math.max(0, si - SIDE); const hi = Math.min(desc.length, si + SIDE + 1);
    const strikes = desc.slice(lo, hi);
    return { byKey, col, strikes, spotStrike: desc.length ? desc[si] : null };
  }, [cells, shown, metric, spot]);

  /* fill the screen: the grid ends at the bottom bar, which ends at the dock */
  const scRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = scRef.current; if (!el) return;
      const main = document.getElementById('main-content');
      const top = el.getBoundingClientRect().top + (main?.scrollTop ?? window.scrollY);
      const dock = document.querySelector('.qe-dock');
      const dockTop = dock && getComputedStyle(dock).display !== 'none' ? dock.getBoundingClientRect().top : window.innerHeight;
      const bar = barRef.current?.getBoundingClientRect().height ?? 56;
      setH(Math.max(260, Math.round(dockTop - top - bar - 6)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* centre spot on load, symbol, metric or page change — never on a refetch */
  const centred = useRef('');
  useEffect(() => {
    const el = scRef.current;
    const key = `${symbol}|${metric}|${pg}|${h}`;
    if (!el || !model.strikes.length || centred.current === key || h == null) return;
    centred.current = key;
    const row = el.querySelector<HTMLElement>('tr.spot');
    if (row) el.scrollTop = Math.max(0, row.offsetTop - (el.clientHeight - row.offsetHeight) / 2);
  }, [symbol, metric, pg, h, model]);

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
    <div className="gxp">
      <div ref={scRef} className="gxp-scroll" style={h ? { height: h } : undefined} tabIndex={0} role="region"
        aria-label={`${symbol} strike by expiry ${metric.toUpperCase()}, ${unit}, expiries ${pg * PHONE_PER_PAGE + 1}–${pg * PHONE_PER_PAGE + shown.length} of ${expiries.length}. Swipe sideways for more expiries.`}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <table className="gxp-table">
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
                    {isSpot ? <span className="gxp-spot" aria-label={`spot ${spot.toFixed(2)}, strike ${strikeTxt(k)}`}>{spot.toFixed(2)}</span> : strikeTxt(k)}
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
              <button key={i} type="button" className={i === pg ? 'on' : ''} aria-pressed={i === pg} aria-label={`Expiries ${i * PHONE_PER_PAGE + 1}–${Math.min(expiries.length, (i + 1) * PHONE_PER_PAGE)}`} onClick={() => setPage(i)}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
