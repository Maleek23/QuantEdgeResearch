/**
 * Journal · Insights (feat/jnav) — the first-class answer to "what should I
 * stop doing?", computed on the same filtered rows as every other page
 * (lib/journal/insights.ts, New York time). Plain sections at natural height;
 * the journal body is the only scroller; long lists cap with "show more".
 *
 *   01 What to stop doing — every bucket that lost money (n ≥ 5), ranked by $,
 *      with win %, PF, both-halves check and the book without it
 *   02 Behaviour — the headline findings as sentences (BehaviorInsight)
 *   03 When — weekday × hour (ET), time of day, weekday
 *   04 Tilt & streaks — after a loss vs after a win, quick re-entries, trade # of the day, trades per day, streaks
 *   05 What you trade — DTE, position cost (premium), holding time, contract side
 *   06 Ticker concentration
 * Loss analysis (why each loss happened, from price bars) is one link away.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type React from 'react';
import { ArrowRight } from 'lucide-react';
import { useJournal, useJournalDrill } from '@/components/journal/journal-context';
import { LowSample, N, Pnl } from '@/components/journal/parts';
import { TimeHeatmap } from '@/components/journal/lux-charts';
import { dayStreaks, fmtMoney, fmtPct, fmtRatio } from '@/lib/journal/metrics';
import { timeGrid } from '@/lib/journal/metrics-extra';
import {
  behaviorInsights, buildInsights, concentration, INSIGHT_DIM_LABEL, keepDoing, MIN_N, stopDoing, type Finding, type InsightBucket,
} from '@/lib/journal/insights';

export default function InsightsView() {
  const { data, goTo, bookLabel } = useJournal();
  const { trades, metrics: m, days, rows } = data;
  const model = useMemo(() => buildInsights(trades), [trades]);
  const expired = useMemo(() => {
    const xs = rows.filter((r) => r.expiredAssumed);
    return { n: xs.length, pnl: xs.reduce((s, r) => s + Number(r.realizedPnL ?? 0), 0) };
  }, [rows]);
  const stops = useMemo(() => stopDoing(model), [model]);
  const keeps = useMemo(() => keepDoing(model), [model]);
  const cards = useMemo(() => behaviorInsights(model, expired), [model, expired]);
  const conc = useMemo(() => concentration(model), [model]);
  const grid = useMemo(() => timeGrid(trades), [trades]);
  const ds = useMemo(() => dayStreaks(days), [days]);
  const [allStops, setAllStops] = useState(false);
  const drill = useJournalDrill();

  if (!model.closed) return <p className="jr-note">No closed trades in view for the {bookLabel} journal — nothing to find yet.</p>;
  const b = model.buckets;
  const shownStops = allStops ? stops : stops.slice(0, 8);

  return (
    <div className="jr-page">
      <p className="jr-lede">
        <b>{model.closed}</b> closed trades · net <Pnl value={model.net} /> · {fmtPct(m.winRate)} win · PF {fmtRatio(m.profitFactor, m.profitFactorIsInfinite)}.
        {' '}Entry times are New York. Buckets need {MIN_N}+ closed trades to count; under 20 they carry LOW N.
        {expired.n > 0 && <> Includes <b>{expired.n}</b> option{expired.n === 1 ? '' : 's'} held to expiry with no exit, settled at $0 (<Pnl value={expired.pnl} />).</>}
      </p>

      <Sec id="jr-ins-stop" num="01" title="What to stop doing" meta={<N n={stops.length} unit="losing buckets" />}>
        {stops.length ? (
          <>
            <div className="jr-table-wrap">
              <table className="jr-table jr-table-wrapcells">
                <thead>
                  <tr>
                    <th>Pattern</th><th className="num">n</th><th className="num">Win %</th><th className="num">PF</th><th className="num">Net</th>
                    <th className="num" title="Net in the first / second half of the period (by entry)">1st · 2nd half</th>
                    <th className="num" title="The book's net without these trades (in-sample)">Book without</th>
                  </tr>
                </thead>
                <tbody>
                  {shownStops.map((f) => <FindingRow key={`${f.dim}|${f.key}`} f={f} />)}
                </tbody>
              </table>
            </div>
            {stops.length > 8 && (
              <button type="button" className="jr-btn jr-btn-sm jr-more-rows" onClick={() => setAllStops((v) => !v)}>
                {allStops ? 'Show the top 8' : `Show all ${stops.length}`}
              </button>
            )}
            <p className="jr-note">
              Found on this same data, so each leak looks a little worse than it will going forward; one that lost in only one half is most likely a regime, not a habit.
              Patterns overlap (a SPXW trade is also a 0 DTE trade) — do not add their dollars up.
            </p>
          </>
        ) : <p className="jr-note">No pattern with {MIN_N}+ closed trades lost money in this view.</p>}
      </Sec>

      <Sec id="jr-ins-behaviour" num="02" title="Behaviour" meta={<span className="jr-n">same rows · New York time</span>}>
        <ul className="jr-ins-list">
          {cards.map((c) => (
            <li key={c.id} className={`jr-ins ${c.severity}`}>
              <span className="jr-ins-sev">{c.severity === 'positive' ? 'KEEP' : c.severity === 'critical' ? 'STOP' : c.severity === 'warning' ? 'WATCH' : 'NOTE'}</span>
              <div>
                <b>{c.title}</b>{c.metric && <span className="jr-n"> · {c.metric}</span>}
                <p>{c.description}{c.suggestion ? <> <span className="jr-ins-try">{c.suggestion}</span></> : null}</p>
              </div>
            </li>
          ))}
          {!cards.length && <li className="jr-note">Nothing stands out yet.</li>}
        </ul>
        {keeps.length > 0 && (
          <p className="jr-note">Best buckets: {keeps.slice(0, 4).map((k, i) => <span key={k.dim + k.key}>{i ? ' · ' : ''}{k.key} <Pnl value={k.net} compact /> (n={k.n})</span>)}.</p>
        )}
      </Sec>

      <Sec id="jr-ins-time" num="03" title="When you trade" meta={<span className="jr-n">entry time, New York</span>}>
        <TimeHeatmap grid={grid} onPick={(w, h) => {
          const cell = grid.cells.get(`${w}|${h}`);
          if (cell) drill(cell.ids, `${w} ${String(h).padStart(2, '0')}:00 ET entries`)?.();
        }} />
        <div className="jr-cols">
          <div><h3 className="jr-sub-h">Time of day</h3><Bars rows={b.session} /></div>
          <div><h3 className="jr-sub-h">Weekday</h3><Bars rows={b.weekday} /></div>
        </div>
      </Sec>

      <Sec id="jr-ins-tilt" num="04" title="Tilt & streaks" meta={<N n={model.closed} />}>
        <div className="jr-stats">
          <Stat k="Longest loss streak" v={`${m.maxLossStreak}`} s="closed trades in a row" />
          <Stat k="Longest win streak" v={`${m.maxWinStreak}`} s="closed trades in a row" />
          <Stat k="Now" v={m.currentStreak === 0 ? '—' : `${Math.abs(m.currentStreak)} ${m.currentStreak > 0 ? 'W' : 'L'}`} s="current run" />
          <Stat k="Red days in a row" v={`${ds.maxRed}`} s={`max · green max ${ds.maxGreen}`} />
        </div>
        <div className="jr-cols">
          <div><h3 className="jr-sub-h">After a loss vs a win</h3><Bars rows={b.tilt} /></div>
          <div><h3 className="jr-sub-h">Trade # of the day</h3><Bars rows={b.tradeOfDay} /></div>
          <div><h3 className="jr-sub-h">Trades that day</h3><Bars rows={b.dayLoad} /></div>
        </div>
      </Sec>

      <Sec id="jr-ins-what" num="05" title="What you trade" meta={<span className="jr-n">closed trades</span>}>
        <div className="jr-cols">
          <div><h3 className="jr-sub-h">{INSIGHT_DIM_LABEL.dte}</h3><Bars rows={b.dte} empty="No option trades in view." /></div>
          <div><h3 className="jr-sub-h">{INSIGHT_DIM_LABEL.cost}</h3><Bars rows={b.cost} /></div>
          <div><h3 className="jr-sub-h">{INSIGHT_DIM_LABEL.hold}</h3><Bars rows={b.hold} /></div>
          <div><h3 className="jr-sub-h">{INSIGHT_DIM_LABEL.side}</h3><Bars rows={b.side} /></div>
        </div>
        <p className="jr-note">Position cost = premium × 100 × contracts for options, price × shares for stock. DTE = calendar days from the New York entry day to expiry.</p>
      </Sec>

      <Sec id="jr-ins-tickers" num="06" title="Ticker concentration" meta={<N n={conc.symbols} unit="tickers" />}>
        <p className="jr-note" style={{ marginTop: 0 }}>
          Top 5 tickers = <b>{fmtPct(conc.top5Share)}</b> of closed trades.
          {' '}{conc.losingNames.symbols} ticker{conc.losingNames.symbols === 1 ? '' : 's'} with {MIN_N}+ trades lost money: <Pnl value={conc.losingNames.net} /> over n={conc.losingNames.n}.
          {' '}One-offs (&lt;3 trades): {conc.oneOffs.symbols} tickers, <Pnl value={conc.oneOffs.net} /> over n={conc.oneOffs.n}.
        </p>
        <Bars rows={[...b.symbol].sort((x, y) => y.n - x.n).slice(0, 10)} />
      </Sec>

      <div className="jr-ins-next">
        <button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('loss')}>Why each loss happened — Loss analysis <ArrowRight className="h-4 w-4" /></button>
        <button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('reports')}>Any breakdown — Reports <ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Sec({ id, num, title, meta, children }: { id: string; num: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="jr-card jr-anchor" id={id} aria-labelledby={`${id}-h`}>
      <div className="jr-card-h">
        <span className="jr-sec-num">{num}</span>
        <h2 className="jr-card-t" id={`${id}-h`}>{title}</h2>
        {meta && <div className="jr-card-meta">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

function Stat({ k, v, s }: { k: string; v: string; s: string }) {
  return <div className="jr-stat"><span>{k}</span><b>{v}</b><small>{s}</small></div>;
}

function FindingRow({ f }: { f: Finding }) {
  const open = useJournalDrill()(f.ids, `${INSIGHT_DIM_LABEL[f.dim]}: ${f.key}`);
  const label = <><span className="jr-n">{INSIGHT_DIM_LABEL[f.dim]}</span><br /><b>{f.key}</b></>;
  return (
    // The whole row opens the trades (mouse); the button in the first cell is the keyboard / screen-reader handle.
    <tr className={open ? 'jr-drill-row' : undefined} style={{ cursor: open ? 'pointer' : 'default' }} onClick={open ?? undefined}
      title={open ? `Open these ${f.n} trades on the Trades page` : `${f.n} trades — too many to open as one list; filter on Reports`}>
      <td>
        {open
          ? <button type="button" className="jr-drill-btn" onClick={(e) => { e.stopPropagation(); open(); }} aria-label={`${INSIGHT_DIM_LABEL[f.dim]} ${f.key}: open these ${f.n} trades`}>{label}</button>
          : label}
        {' '}<LowSample n={f.n} />
      </td>
      <td className="num">{f.n}</td>
      <td className="num">{fmtPct(f.winRate)}</td>
      <td className="num">{fmtRatio(f.pf, f.pf == null && f.won > 0)}</td>
      <td className="num"><Pnl value={f.net} /></td>
      <td className="num" title={f.bothHalves ? 'Lost in both halves' : 'Lost in one half only'}>
        <Pnl value={f.firstHalf} compact /> · <Pnl value={f.secondHalf} compact />{f.bothHalves ? <span className="jr-chip loss" style={{ marginLeft: 6 }}>BOTH</span> : null}
      </td>
      <td className="num">{fmtMoney(f.netWithout)}</td>
    </tr>
  );
}

/** Diverging bars (zero baseline), n and win % on every row. */
function Bars({ rows, empty = 'No trades in view.' }: { rows: InsightBucket[]; empty?: string }) {
  const drill = useJournalDrill();
  if (!rows.length) return <p className="jr-note">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <div className="jr-bars">
      {rows.map((r) => {
        const open = drill(r.ids, `${INSIGHT_DIM_LABEL[r.dim]}: ${r.key}`);
        return (
        <div className={`jr-bar-row${open ? ' jr-drill-row' : ''}`} key={r.key}
          {...(open ? {
            role: 'link', tabIndex: 0, onClick: open,
            title: `Open these ${r.n} trades on the Trades page`,
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
          } : {})}>
          <span className="jr-bar-k" title={r.key}>{r.key}</span>
          <span className="jr-bar-track" aria-hidden>
            <span className={`jr-bar-fill ${r.net >= 0 ? 'pos' : 'neg'}`} style={{ width: `${(Math.abs(r.net) / max) * 50}%` }} />
          </span>
          <span className="jr-bar-v"><Pnl value={r.net} compact /> <span className="jr-n">· {fmtPct(r.winRate)} · n={r.n}</span>{r.n < 20 ? <> <LowSample n={r.n} /></> : null}</span>
        </div>
        );
      })}
    </div>
  );
}
