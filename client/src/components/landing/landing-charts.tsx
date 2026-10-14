/**
 * Two real-data charts for the landing (2026-10-14), drawn as inline SVG in the
 * landing tokens. Data: fixtures/landing-chart-data.ts — captured read-only, every
 * point real, each chart labelled with its date and source.
 *
 *   GexProfile   SPY call vs put gamma by strike from one delayed CBOE chain —
 *                the walls the GEX engine marks, on a labelled sample snapshot.
 *   PlayTimeline how one 0DTE play was tracked on the contract's own 1-min bars
 *                (TSLA $380 put, Oct 7 2026): entry → T1 → peak → T2 not reached.
 *
 * Hover / tap / arrow keys move a readout; a screen-reader table carries the values.
 * Palette (dataviz validator, both modes PASS): calls = accent blue, puts = amber.
 */
import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SPY_GEX, TSLA_380P_BARS, TSLA_380P_PLAY } from './fixtures/landing-chart-data';

const fmt$ = (n: number) => `$${n.toFixed(2)}`;
const fmtM = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(2)}B` : `$${Math.round(n)}M`);

// ── GEX strike profile ──────────────────────────────────────────────────
export function GexProfile() {
  const rows = useMemo(() => [...SPY_GEX.rows].sort((a, b) => b[0] - a[0]), []);
  const [hi, setHi] = useState<number | null>(null);
  const W = 560, ROW = 13, TOP = 28, H = TOP + rows.length * ROW + 30, MID = 300, HALF = 220;
  const max = Math.max(...rows.map((r) => Math.max(r[1], r[2])));
  const x = (v: number) => (v / max) * HALF;
  const y = (i: number) => TOP + i * ROW;
  const spotI = rows.findIndex((r) => r[0] < SPY_GEX.spot); // first strike below spot
  const spotY = y(spotI) - ROW * ((SPY_GEX.spot - rows[spotI][0]) / 1) + ROW / 2;
  const cur = hi != null ? rows[hi] : null;
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const py = ((e.clientY - r.top) / r.height) * H;
    const i = Math.floor((py - TOP) / ROW);
    setHi(i >= 0 && i < rows.length ? i : null);
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    setHi((h) => Math.max(0, Math.min(rows.length - 1, (h ?? spotI) + (e.key === 'ArrowDown' ? 1 : -1))));
  };
  return (
    <figure className="lv2-chart" aria-labelledby="gex-cap">
      <div className="lv2-chart-head">
        <p className="lv2-label">Sample snapshot · {SPY_GEX.symbol} · {SPY_GEX.asOf}</p>
        <ul className="lv2-legend"><li><i className="k-call" />Call gamma</li><li><i className="k-put" />Put gamma</li></ul>
      </div>
      <p className="lv2-chart-read" aria-live="polite">
        {cur ? <><b>${cur[0]}</b> · calls {fmtM(cur[1])} · puts {fmtM(cur[2])} · net {cur[1] - cur[2] >= 0 ? '+' : '−'}{fmtM(Math.abs(cur[1] - cur[2]))} per 1% move</>
          : <>Spot <b>${SPY_GEX.spot.toFixed(2)}</b> sits between the put wall <b>${SPY_GEX.putWall}</b> and the call wall <b>${SPY_GEX.callWall}</b>. Hover a strike.</>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="lv2-chart-svg gex" role="img" tabIndex={0}
        aria-label={`SPY gamma by strike, ${SPY_GEX.asOf}: put wall ${SPY_GEX.putWall}, call wall ${SPY_GEX.callWall}, spot ${SPY_GEX.spot}.`}
        onPointerMove={move} onPointerLeave={() => setHi(null)} onKeyDown={key} onBlur={() => setHi(null)}>
        <text x={MID - 8} y={16} textAnchor="end" className="ax">← puts</text>
        <text x={MID + 8} y={16} className="ax">calls →</text>
        {rows.map((r, i) => {
          const wall = r[0] === SPY_GEX.callWall ? 'call' : r[0] === SPY_GEX.putWall ? 'put' : null;
          return (
            <g key={r[0]} className={hi === i ? 'hot' : hi != null ? 'dim' : ''}>
              {hi === i && <rect x={0} y={y(i)} width={W} height={ROW} className="row-hi" />}
              <rect className="b-put" x={MID - 1 - x(r[2])} y={y(i) + 2} width={Math.max(x(r[2]), r[2] > 0 ? 1 : 0)} height={ROW - 4} rx={2} />
              <rect className="b-call" x={MID + 1} y={y(i) + 2} width={Math.max(x(r[1]), r[1] > 0 ? 1 : 0)} height={ROW - 4} rx={2} />
              {(r[0] % 5 === 0 || wall) && <text x={8} y={y(i) + ROW - 3} className={`tick${wall ? ' strong' : ''}`}>{r[0]}</text>}
              {wall === 'put' && <text x={MID + 6 + x(r[1])} y={y(i) + ROW - 3} className="lab">← put wall</text>}
              {wall === 'call' && <text x={MID + 6 + x(r[1])} y={y(i) + ROW - 3} className="lab">call wall</text>}
            </g>
          );
        })}
        <line x1={MID} x2={MID} y1={TOP - 4} y2={TOP + rows.length * ROW} className="axis" />
        <line x1={40} x2={W - 8} y1={spotY} y2={spotY} className="spot" />
        <text x={W - 8} y={spotY - 4} textAnchor="end" className="lab spot-t">spot {SPY_GEX.spot.toFixed(2)}</text>
        <text x={MID} y={H - 8} textAnchor="middle" className="ax">$ of dealer hedging per 1% move · expiries ≤ 7 days</text>
      </svg>
      <table className="sr-only">
        <caption>SPY gamma by strike, {SPY_GEX.asOf}, $M per 1% move</caption>
        <thead><tr><th>Strike</th><th>Call gamma</th><th>Put gamma</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
      </table>
      <figcaption id="gex-cap" className="lv2-fine">
        One real snapshot from CBOE’s delayed SPY chain (~15 min delay), computed the way the GEX engine reads it: gamma × open interest, dealers assumed long calls and short puts.
        The biggest bars are the walls price tends to stall at. It’s a map of likely hedging pressure, not a forecast.
      </figcaption>
    </figure>
  );
}

// ── How a play is tracked ───────────────────────────────────────────────
export function PlayTimeline() {
  const P = TSLA_380P_PLAY;
  const bars = TSLA_380P_BARS;
  const [hi, setHi] = useState<number | null>(null);
  const W = 640, H = 300, L = 44, R = 112, T = 18, B = 34;
  const lo = 2.6, top = 6.7;
  const x = (i: number) => L + (i / (bars.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (top - lo)) * (H - T - B);
  const idx = (t: string) => bars.findIndex((b) => b[0] === t);
  const iE = idx(P.entryAt), i1 = idx(P.t1At), iP = idx(P.peakAt);
  const line = bars.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[3]).toFixed(1)}`).join(' ');
  const band = `${bars.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[1]).toFixed(1)}`).join(' ')} ${[...bars].reverse().map((b, j) => `L${x(bars.length - 1 - j).toFixed(1)} ${y(b[2]).toFixed(1)}`).join(' ')} Z`;
  const cur = hi != null ? bars[hi] : null;
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (bars.length - 1));
    setHi(i >= 0 && i < bars.length ? i : null);
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHi((h) => Math.max(0, Math.min(bars.length - 1, (h ?? iE) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const levels: Array<[string, number, string]> = [['T2 · not hit', P.t2, 't2'], ['T1', P.t1, 't1'], ['entry', P.entry, 'entry']];
  return (
    <figure className="lv2-chart" aria-labelledby="play-cap">
      <div className="lv2-chart-head">
        <p className="lv2-label">{P.contract} · {P.date} · 1-min bars, ET</p>
        <ul className="lv2-legend"><li><i className="k-call" />Close</li><li><i className="k-band" />High–low</li></ul>
      </div>
      <p className="lv2-chart-read" aria-live="polite">
        {cur ? <><b>{cur[0]} ET</b> · close {fmt$(cur[3])} · high {fmt$(cur[1])} · low {fmt$(cur[2])} · {cur[3] >= P.entry ? '+' : '−'}{Math.abs(((cur[3] - P.entry) / P.entry) * 100).toFixed(0)}% vs entry</>
          : <>Entry <b>{fmt$(P.entry)}</b> at {P.entryAt} → T1 <b>{fmt$(P.t1)}</b> hit {P.t1At} → peak <b>{fmt$(P.peak)}</b> at {P.peakAt} → T2 {fmt$(P.t2)} never traded.</>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="lv2-chart-svg play" role="img" tabIndex={0}
        aria-label={`TSLA 380 put premium on ${P.date}: entry ${P.entry} at ${P.entryAt} ET, first target ${P.t1} reached ${P.t1At}, peak ${P.peak} at ${P.peakAt}, second target ${P.t2} not reached.`}
        onPointerMove={move} onPointerLeave={() => setHi(null)} onKeyDown={key} onBlur={() => setHi(null)}>
        {[3, 4, 5, 6].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="ax">${v}</text></g>
        ))}
        {['10:00', '10:15', '10:30', '10:45'].map((t) => <text key={t} x={x(idx(t))} y={H - 12} textAnchor="middle" className="ax">{t}</text>)}
        {levels.map(([name, v, c]) => (
          <g key={c} className={`lvl ${c}`}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
            <text x={W - R + 6} y={y(v) + 4}>{name} {fmt$(v)}</text>
          </g>
        ))}
        <path d={band} className="band" />
        <path d={line} className="close" />
        <g className="mk"><circle cx={x(iE)} cy={y(P.entry)} r={5} /><text x={x(iE)} y={y(P.entry) + 20} textAnchor="middle">entry {P.entryAt}</text></g>
        <g className="mk"><circle cx={x(i1)} cy={y(P.t1)} r={5} /><text x={x(i1) - 8} y={y(P.t1) - 10} textAnchor="end">T1 hit {P.t1At}</text></g>
        <g className="mk"><circle cx={x(iP)} cy={y(P.peak)} r={5} /><text x={x(iP)} y={y(P.peak) - 10} textAnchor="middle">peak {fmt$(P.peak)} · {P.peakAt}</text></g>
        {cur && hi != null && (
          <g className="xhair"><line x1={x(hi)} x2={x(hi)} y1={T} y2={H - B} /><circle cx={x(hi)} cy={y(cur[3])} r={4} /></g>
        )}
      </svg>
      <table className="sr-only">
        <caption>{P.contract}, {P.date}, 1-minute bars</caption>
        <thead><tr><th>Time ET</th><th>High</th><th>Low</th><th>Close</th></tr></thead>
        <tbody>{bars.map((b) => <tr key={b[0]}><td>{b[0]}</td><td>{b[1]}</td><td>{b[2]}</td><td>{b[3]}</td></tr>)}</tbody>
      </table>
      <figcaption id="play-cap" className="lv2-fine">
        One real play from the 0DTE desk, graded on the option’s own minute bars (Massive/Polygon), not the stock’s. T1 counted because the contract traded through it; T2 didn’t, so it isn’t claimed.
        A single example, chosen to show the tracking — not a typical result. Past performance does not guarantee future results.
      </figcaption>
    </figure>
  );
}
