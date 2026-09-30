/**
 * Journal · Loss analysis — WHY each loss happened, not just that it did.
 *
 * Works on every book (Mine · Bot · Trade desk · traders) and honours the
 * filter bar. For every closed trade it measures, from real OHLC bars of the
 * underlying (lib/journal/use-loss-bars.ts → /api/historical-prices):
 * MFE / MAE in % and R, time to MAE, whether it was ever in profit, the
 * underlying's move vs the option's result, what happened after the exit, and
 * the entry's timing. Each loss gets one class by explicit rules
 * (lib/journal/loss-analysis.ts LOSS_CLASSES — the rule text is shown next to
 * every count), then: loss drivers by dimension, and clearly-labelled
 * hypothetical counterfactuals with a chronological-halves check.
 *
 * Honesty: no bars → 'unknown' (counted, never guessed); option premiums are
 * never simulated (no option bars exist) — replays are on the underlying in R.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useJournal, useJournalDrill } from '@/components/journal/journal-context';
import { Card, Kpi, N, Pnl } from '@/components/journal/parts';
import { fmtDuration, fmtMoney, fmtPct, fmtRatio } from '@/lib/journal/metrics';
import {
  analyseTrade, counterfactuals, DRIVER_DIM_LABEL, LOSS_FLAG_LABEL, lossDrivers, summariseLosses,
  type DriverDim, type TradeAnalysis,
} from '@/lib/journal/loss-analysis';
import { useLossBars } from '@/lib/journal/use-loss-bars';

const SMALL = 30;
const Small = ({ n }: { n: number }) => (n > 0 && n < SMALL
  ? <span className="jr-lowsample" title={`Fewer than ${SMALL} trades — treat as anecdote, not a finding`}>SMALL n</span>
  : null);

const fmtR = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}R`);
const fmtSPct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)}%`);
const shortDate = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

const DIMS: DriverDim[] = ['source', 'exit', 'dte', 'session', 'hour', 'weekday', 'hold', 'instrument', 'direction', 'conviction', 'symbol'];

export default function LossView() {
  const { data, bookLabel, openTradePage } = useJournal();
  const [nowMs] = useState(() => Date.now());
  const closedRows = useMemo(
    () => data.rows.filter((r) => r.status !== 'open' && r.realizedPnL != null && Number.isFinite(Number(r.realizedPnL)) && r.exitTime),
    [data.rows],
  );
  const needs = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of closedRows) {
      const t = Date.parse(r.entryTime);
      if (!Number.isFinite(t)) continue;
      m.set(r.symbol, Math.min(m.get(r.symbol) ?? Infinity, t));
    }
    return m;
  }, [closedRows]);
  const barsState = useLossBars(needs, nowMs);
  const loading = barsState.done < barsState.total;

  const analyses = useMemo(
    () => closedRows.filter((r) => barsState.bars.has(r.symbol)).map((r) => analyseTrade(r, barsState.bars.get(r.symbol), nowMs)),
    [closedRows, barsState.bars, nowMs],
  );
  const pendingLosses = closedRows.filter((r) => !barsState.bars.has(r.symbol) && Number(r.realizedPnL) < 0).length;
  const summary = useMemo(() => summariseLosses(analyses), [analyses]);
  const allCtx = useMemo(() => analyses.map((a) => a.ctx), [analyses]);
  const cfs = useMemo(() => (loading ? [] : counterfactuals(analyses, barsState.bars)), [analyses, barsState.bars, loading]);

  const [dim, setDim] = useState<DriverDim>('source');
  const drivers = useMemo(() => lossDrivers(allCtx, dim), [allCtx, dim]);
  const [showAll, setShowAll] = useState(false);
  const [allDrivers, setAllDrivers] = useState(false);

  if (!closedRows.length) {
    return <p className="jr-note">No closed trades in view for the {bookLabel} journal — nothing to analyse.</p>;
  }

  const lossesN = closedRows.filter((r) => Number(r.realizedPnL) < 0).length;
  const noExit = data.rows.filter((r) => r.status !== 'open' && r.realizedPnL != null && !r.exitTime).length;
  const lostAll = closedRows.reduce((s, r) => s + Math.min(0, Number(r.realizedPnL)), 0);
  const withBars = summary.losses.filter((a) => a.cls !== 'unknown' && a.cls !== 'unresolved').length;
  const tooShort = summary.losses.filter((a) => a.cls === 'unresolved').length;
  const withR = summary.losses.filter((a) => a.risk != null).length;
  const ranked = summary.classes.filter((c) => c.n > 0 && c.id !== 'unknown' && c.id !== 'unresolved').sort((a, b) => a.lost - b.lost);
  const lossesSorted = [...summary.losses].sort((a, b) => (a.ctx.pnl ?? 0) - (b.ctx.pnl ?? 0));
  const shown = showAll ? lossesSorted : lossesSorted.slice(0, 40);
  const order = lossesSorted.map((a) => a.ctx.id);
  const maxLost = Math.max(1, ...summary.classes.map((c) => -c.lost));

  // Headline drivers: the worst bucket of a few dimensions (n shown, small-sample flagged).
  const headline = (['source', 'dte', 'session', 'exit'] as DriverDim[]).map((d) => ({ d, r: lossDrivers(allCtx, d)[0] })).filter((x) => x.r && x.r.lost < 0);

  return (
    <div className="jr-grid">
      <div className="jr-span-12 jr-kpis" aria-live="polite">
        <Kpi label="Losing trades" value={`${lossesN}`} sub={`of ${closedRows.length} closed · ${fmtPct(closedRows.length ? lossesN / closedRows.length : null)}${noExit ? ` · ${noExit} closed without an exit time not analysed` : ''}`} />
        <Kpi label="$ lost (losers)" value={<Pnl value={lostAll} compact />} sub={`n=${lossesN} losses`} tone="loss" />
        <Kpi label="Explained by bars" value={`${withBars} / ${summary.losses.length}`} sub={loading ? `loading bars ${barsState.done}/${barsState.total} symbols` : `${summary.losses.length - withBars - tooShort} no bars · ${tooShort} shorter than a bar`} />
        <Kpi label="With a usable stop (R)" value={`${withR}`} sub={`of ${summary.losses.length} losses — rest use % thresholds`} />
        <Kpi label="Largest class" value={ranked[0] ? <span className="jr-kpi-wrap">{ranked[0].label}</span> : '—'} sub={ranked[0] ? `${fmtMoney(ranked[0].lost, { compact: true })} · n=${ranked[0].n}` : loading ? 'measuring…' : 'no classified losses'} />
        <Kpi label="Bars" value={loading ? `${barsState.done}/${barsState.total}` : 'ready'} sub={barsState.failed.length ? `${barsState.failed.length} symbol(s) failed to load` : 'hourly (ext. hours) ≤6 mo, else daily'} />
      </div>

      <Card className="jr-span-12" num="01" title="Fix These First" meta={<><N n={summary.losses.length} unit="losses classified" />{pendingLosses ? <span className="jr-n">· {pendingLosses} waiting for bars</span> : null}</>}>
        {!ranked.length ? (
          <p className="jr-note">{loading ? 'Measuring each loss against its bars…' : 'No loss could be classified — the feed had no bars for these trades.'}</p>
        ) : (
          <ol className="jr-fix">
            {ranked.slice(0, 3).map((c) => (
              <li key={c.id}>
                <b>{c.label}</b> — {fmtMoney(c.lost)} across n={c.n} losses ({fmtPct(summary.lost ? c.lost / summary.lost : null)} of $ lost). <span className="jr-dim">{c.lesson}</span> <Small n={c.n} />
              </li>
            ))}
            {headline.map(({ d, r }) => (
              <li key={d} className="jr-dim">
                Worst by {DRIVER_DIM_LABEL[d]}: <b>{r!.key}</b> — {fmtMoney(r!.lost)} lost, net {fmtMoney(r!.net)}, PF {r!.pf == null ? '—' : fmtRatio(r!.pf)} (n={r!.n}) <Small n={r!.n} />
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="jr-span-12" num="02" title="Why the Losses Happened" meta={<><N n={summary.losses.length} unit="losses" /><span className="jr-n">one class per loss, first rule that fires</span></>}>
        <div className="jr-table-wrap">
          <table className="jr-table jr-table-wrapcells jr-loss-classes">
            <thead>
              <tr>
                <th>Class</th>
                <th className="num">n</th>
                <th className="num">$ lost</th>
                <th style={{ minWidth: 120 }}>share of $ lost</th>
                <th className="num" title="Losses where this rule fired at all, including ones a higher rule claimed">rule fired</th>
                <th>Rule</th>
                <th>Worst examples</th>
              </tr>
            </thead>
            <tbody>
              {summary.classes.map((c) => (
                <tr key={c.id} style={{ cursor: 'default', opacity: c.n ? 1 : 0.55 }}>
                  <td><b>{c.label}</b> <Small n={c.n} /></td>
                  <td className="num">{c.n}</td>
                  <td className="num"><Pnl value={c.n ? c.lost : null} /></td>
                  <td>
                    <div className="jr-bar-track" style={{ height: 12 }} aria-hidden>
                      <div className="jr-bar-fill neg" style={{ right: 'auto', left: 0, width: `${(-c.lost / maxLost) * 100}%` }} />
                    </div>
                    <span className="jr-n">{fmtPct(summary.lost ? c.lost / summary.lost : null)}</span>
                  </td>
                  <td className="num">{c.fired}</td>
                  <td style={{ maxWidth: 380 }}><span className="jr-note" style={{ margin: 0, display: 'block' }}>{c.rule}</span></td>
                  <td>
                    {c.examples.length ? c.examples.map((a) => (
                      <button key={a.ctx.id} type="button" className="jr-cell-btn jr-ex" onClick={() => openTradePage(a.ctx.id, order)}>
                        {a.ctx.symbol} {fmtMoney(a.ctx.pnl, { compact: true })}
                      </button>
                    )) : <span className="jr-dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="jr-note">
          Measured on the underlying (options too — the feed has no option-premium bars; the premium result is the ledger's). R = |plan entry − plan stop| on the
          underlying; a plan level more than 40% from the entry (e.g. a bot option's premium stop) is not treated as an underlying price, and those trades use the % thresholds.
          Hourly bars include extended hours; daily bars (older trades) can overstate the entry bar's range.
        </p>
      </Card>

      <Card className="jr-span-12" num="03" title="Loss Drivers" meta={<><N n={allCtx.length} unit="closed trades" /><span className="jr-n">sorted by $ lost</span></>}>
        <div className="jr-seg" role="group" aria-label="Break down by" style={{ marginBottom: 10 }}>
          {DIMS.map((d) => <button key={d} type="button" aria-pressed={dim === d} onClick={() => setDim(d)}>{DRIVER_DIM_LABEL[d]}</button>)}
        </div>
        <div className="jr-table-wrap">
          <table className="jr-table">
            <thead>
              <tr><th>{DRIVER_DIM_LABEL[dim]}</th><th className="num">n</th><th className="num">W / L</th><th className="num">win %</th><th className="num">$ lost</th><th className="num">net</th><th className="num">PF</th></tr>
            </thead>
            <tbody>
              {(allDrivers ? drivers : drivers.slice(0, 12)).map((r) => (
                <DriverTr key={r.key} ids={r.ids} n={r.n} label={`Loss driver · ${DRIVER_DIM_LABEL[dim]}: ${r.key}`}>
                  <td>{r.key} <Small n={r.n} /></td>
                  <td className="num">{r.n}</td>
                  <td className="num">{r.wins} / {r.losses}</td>
                  <td className="num">{fmtPct(r.winRate)}</td>
                  <td className="num"><Pnl value={r.lost} /></td>
                  <td className="num"><Pnl value={r.net} /></td>
                  <td className="num">{r.pf == null ? (r.won > 0 ? '∞' : '—') : fmtRatio(r.pf)}</td>
                </DriverTr>
              ))}
            </tbody>
          </table>
        </div>
        {drivers.length > 12 && (
          <button type="button" className="jr-btn jr-btn-sm jr-more-rows" onClick={() => setAllDrivers((v) => !v)}>{allDrivers ? 'Show the top 12' : `Show all ${drivers.length}`}</button>
        )}
        <p className="jr-note">
          Entry hour, weekday and session are New York time of the entry stamp. DTE = expiry − entry day. Exit reason is the recorded one (desk outcome / bot exit); "not recorded" means the book doesn't store it.
          Source / setup is the publishing engine on the Quantinum Bot and NEXUS ideas books.
        </p>
      </Card>

      <Card className="jr-span-12" num="04" title={<>What would have helped <span className="jr-tag" style={{ marginLeft: 6 }}>HYPOTHETICAL</span></>}
        meta={<span className="jr-n">{loading ? 'waiting for all bars…' : `n=${allCtx.length} closed`}</span>}>
        {loading ? <p className="jr-note">Computed once every symbol's bars are in ({barsState.done}/{barsState.total}).</p> : (
          <div className="jr-table-wrap">
            <table className="jr-table jr-table-wrapcells">
              <thead>
                <tr>
                  <th>Scenario</th><th className="num">n</th><th className="num">result</th><th className="num">PF</th><th className="num">same trades, as-is</th>
                  <th className="num" title="Improvement vs as-is on the older half of the trades">Δ older half</th>
                  <th className="num" title="Improvement vs as-is on the newer half of the trades">Δ newer half</th>
                  <th>How</th>
                </tr>
              </thead>
              <tbody>
                {cfs.map((c) => {
                  const f = (v: number) => (c.basis === 'R' ? fmtR(v, 1) : fmtMoney(v, { compact: true }));
                  const both = c.id !== 'plan' && c.firstHalfDelta > 0 && c.secondHalfDelta > 0;
                  if (c.n === 0) {
                    return (
                      <tr key={c.id} style={{ cursor: 'default', opacity: 0.6 }}>
                        <td><b>{c.label}</b><div className="jr-n">{c.basis === 'R' ? 'underlying replay, R' : 'ledger $'}</div></td>
                        <td className="num">0</td>
                        <td colSpan={5} className="jr-dim" style={{ whiteSpace: 'normal' }}>
                          {c.basis === 'R' ? `Not computable: none of the ${c.skipped} closed trades has a plan stop on the underlying (and bars) to replay.` : 'No trade meets this rule.'}
                        </td>
                        <td style={{ maxWidth: 360 }}><span className="jr-note" style={{ margin: 0, display: 'block' }}>{c.how}</span></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={c.id} style={{ cursor: 'default' }}>
                      <td><b>{c.label}</b> <Small n={c.n} /><div className="jr-n">{c.basis === 'R' ? 'underlying replay, R' : 'ledger $'}{c.skipped ? ` · ${c.skipped} ${c.basis === 'R' ? 'not computable (no plan stop / bars / ATR)' : 'not taken'}` : ''}</div></td>
                      <td className="num">{c.n}</td>
                      <td className={`num ${c.net > 0 ? 'jr-gain' : c.net < 0 ? 'jr-loss' : ''}`}>{f(c.net)}</td>
                      <td className="num">{fmtRatio(c.pf)}</td>
                      <td className="num jr-dim">{f(c.baseNet)} · PF {fmtRatio(c.basePf)}</td>
                      <td className="num">{c.id === 'plan' ? '—' : f(c.firstHalfDelta)}</td>
                      <td className="num">{c.id === 'plan' ? '—' : <>{f(c.secondHalfDelta)}{both ? <span className="jr-n"> · both halves</span> : null}</>}</td>
                      <td style={{ maxWidth: 360 }}><span className="jr-note" style={{ margin: 0, display: 'block' }}>{c.how}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="jr-note">
          Hypothetical, not a result. Replays re-run the plan on the underlying bars in R (stop first if a bar prints both; option premiums are not modelled, so an option
          trade's replay is its thesis, not its P&amp;L). Filters keep the ledger's real $ on the trades kept. Every scenario here was chosen after seeing this data — a gain
          that shows in only one chronological half is most likely a regime artifact; walk it forward on new trades before changing a rule.
        </p>
      </Card>

      <Card className="jr-span-12" num="05" title="Every Loss, Measured" meta={<><N n={lossesSorted.length} unit="losses" /><span className="jr-n">worst first · a row opens the trade</span></>}>
        <div className="jr-table-wrap">
          <table className="jr-table">
            <thead>
              <tr>
                <th>Entry (ET)</th><th>Symbol</th><th>Class</th><th className="num">P&amp;L</th><th className="num" title="The ledger's % result — the premium's for options">result %</th>
                <th className="num" title="Best excursion our way while held">MFE</th><th className="num" title="Worst excursion against while held">MAE</th>
                <th className="num">to MAE</th><th className="num" title="Underlying, thesis direction, entry → exit">under. @exit</th>
                <th className="num" title="Best move our way after the exit, to the horizon">after exit</th><th>Source</th><th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => <LossRowView key={a.ctx.id} a={a} onOpen={() => openTradePage(a.ctx.id, order)} />)}
            </tbody>
          </table>
        </div>
        {lossesSorted.length > shown.length && (
          <button type="button" className="jr-btn jr-btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>Show all {lossesSorted.length}</button>
        )}
      </Card>
    </div>
  );
}

function LossRowView({ a, onOpen }: { a: TradeAnalysis; onOpen: () => void }) {
  const r = a.risk != null;
  const ex = (pct: number | null, R: number | null) => (a.barKind == null ? '—' : r ? fmtR(R) : fmtSPct(pct));
  const row = a.ctx;
  return (
    <tr tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <td>{Number.isFinite(row.entryMs) ? shortDate(row.entryMs) : '—'}</td>
      <td><span className="jr-sym">{row.symbol}</span>{row.isOption ? <span className="jr-n"> {row.instrument.replace(' option', '')}{row.dte != null ? ` ${row.dte}d` : ''}</span> : null}</td>
      <td>{a.cls ? <span className={`jr-chip jr-cls-${a.cls}`}>{a.cls === 'unknown' ? 'unknown' : a.cls === 'unresolved' ? 'too short' : a.cls.replace('_', ' ')}</span> : '—'}</td>
      <td className="num"><Pnl value={row.pnl} /></td>
      <td className="num">{fmtSPct(row.resultPct)}</td>
      <td className="num">{ex(a.mfePct, a.mfeR)}</td>
      <td className="num">{ex(a.maePct, a.maeR)}</td>
      <td className="num">{a.tMaeMs == null ? '—' : fmtDuration(a.tMaeMs)}</td>
      <td className="num">{fmtSPct(a.moveAtExitPct)}</td>
      <td className="num">{a.postFavPct == null ? '—' : r ? fmtR(a.postFavR) : fmtSPct(a.postFavPct)}{a.targetAfterExit ? <span className="jr-n"> · target</span> : null}</td>
      <td>{row.source}</td>
      <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{a.flags.map((f) => <span key={f} className="jr-tag" style={{ marginRight: 3, fontSize: 10.5 }}>{LOSS_FLAG_LABEL[f]}</span>)}</td>
    </tr>
  );
}

/** A loss-driver row that opens exactly its trades on the Trades page (row click; Enter/Space when focused). */
function DriverTr({ ids, n, label, children }: { ids: string[]; n: number; label: string; children: ReactNode }) {
  const open = useJournalDrill()(ids, label);
  if (!open) return <tr style={{ cursor: 'default' }} title={`${n} trades — too many to open as one list; filter on Reports`}>{children}</tr>;
  return (
    <tr className="jr-drill-row" style={{ cursor: 'pointer' }} tabIndex={0} onClick={open}
      aria-label={`${label}: open these ${n} trades`} title={`Open these ${n} trades on the Trades page`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
      {children}
    </tr>
  );
}
