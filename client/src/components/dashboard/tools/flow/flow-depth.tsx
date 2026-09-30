/**
 * FLOW depth tools — the FLOW page as the one owner of options flow, with the
 * same depth the GEX page has, built only from feeds we actually hold:
 *
 *   flow tape      GET /api/flow/tape (server/flow-tape.ts): Bullflow's alert
 *                  ring (in-process, zero provider calls) + our chain-scan
 *                  observations (options_flow_history). 15 s server cache.
 *                  ?symbol= narrows it to one underlying for the ticker tools.
 *   Bullflow       only through the cached helpers behind existing routes
 *                  (/api/bullflow/leaders 6-min, /api/bullflow/context 6-min,
 *                  /api/chart/overlays dark-pool levels 30-min + disk) — the
 *                  process-wide 8 req/min budget is never spent per render.
 *   OI history     /api/flow/repeats · /api/flow/exits (options_flow_history).
 *   ideas          /api/convictions (shared NEXUS key) for flow-evidenced setups.
 *   GEX            the GEX page's shared terminal query (gex-model.ts) — read,
 *                  never recomputed — for the Flow × GEX convergence tool.
 *
 * Honesty rules every tool keeps:
 *   - neither feed measures the aggressor side, so premium is ACTIVITY, never
 *     "bullish/bearish"; calls and puts are shown side by side, not netted
 *   - the two sources are never silently summed: ticker tools default to
 *     "Auto" (chain scan when it has rows for the ticker, else Bullflow)
 *   - chain-scan rows sit at the time our scanner first saw the contract (its
 *     day volume to then), not at trade time — the timeline says so
 *   - colours: calls blue / puts vermilion (flow-colors.ts), never green/red
 *
 * The ticker tools (ladder, heatmap, timeline) share one window / source /
 * DTE setting per page (useDashState 'flow:*'), so they always describe the
 * same slice, and one /api/flow/tape?symbol= request per refresh.
 */
import { WatchStar } from '@/components/watch/watch-star';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { openWorkup } from '@/lib/workup-bus';
import { QEEmpty, QEError, QELoading, QEStale } from '@/components/ui/qe-states';
import { useTickFlash } from '@/lib/use-tick-flash';
import { useGexTerminal, regimeView, zeroGammaOf, terminalAsOf } from '@/components/gex/gex-model';
import { fmtGexB, regimeColor, LEVEL_COLORS } from '@/components/gex/gex-colors';
import { useDashState, useDashboard, useFocusSymbol, useNow, useToolInstance, useToolReport, useToolSetting } from '../../frame';
import { useFlowTape, money, etTime, ageLabel, dte, contractKey, ETF_SET, type TapeRow, type TapePayload } from './tape';
import type { KeyboardEvent } from 'react';
import { CALL, CALL_FILL, PUT, DARK_POOL, MUTE, AMBER, typeColor, typeFill, signColor, sideColor, cellTint } from './flow-colors';
import './flow-depth.css';

const getJson = (url: string) => async () => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
};

/* ════════════════════ shared pieces ════════════════════ */

type SrcMode = 'auto' | 'chain-scan' | 'bullflow' | 'all';
type Src = Exclude<SrcMode, 'auto'>;
type DteB = 'all' | '0-7' | '8-45' | '46+';

const SRC_LABEL: Record<Src, string> = { 'chain-scan': 'chain scan', bullflow: 'Bullflow alerts', all: 'Bullflow + chain scan' };
const SRC_OPTS: ReadonlyArray<readonly [SrcMode, string, string]> = [
  ['auto', 'Auto', 'Chain scan when it has rows here, otherwise Bullflow alerts — never both, so one trade is not counted twice'],
  ['chain-scan', 'Scan', 'Our chain scanner: one row per contract per day, day volume × price at first detection; carries spot, OI and vol/OI'],
  ['bullflow', 'BF', 'Bullflow algo/custom alert prints: individual large trades, alert name verbatim; no spot / OI'],
  ['all', 'Both', 'Both summed — a Bullflow alert and our chain-scan row for the same contract can describe the same trade'],
];
const DTE_OPTS: ReadonlyArray<readonly [DteB, string, string]> = [
  ['all', 'All', 'Every expiry'], ['0-7', '≤7d', '0–7 days to expiry'], ['8-45', '8–45d', '8–45 days'], ['46+', '>45d', 'more than 45 days'],
];
const DAY_OPTS: ReadonlyArray<readonly [number, string, string]> = [[1, '1D', 'Today'], [2, '2D', 'Today + previous session'], [5, '5D', 'Five sessions']];

function resolveSrc(mode: SrcMode, rows: TapeRow[]): Src {
  if (mode !== 'auto') return mode;
  return rows.some((r) => r.source === 'chain-scan') ? 'chain-scan' : 'bullflow';
}
function inDte(r: TapeRow, b: DteB, now: number): boolean {
  if (b === 'all') return true;
  const d = dte(r.expiry, now);
  if (d == null) return false;
  return b === '0-7' ? d <= 7 : b === '8-45' ? d >= 8 && d <= 45 : d >= 46;
}
const newestAt = (rows: TapeRow[]) => rows.reduce<string | null>((m, r) => (r.at && (!m || r.at > m) ? r.at : m), null);
const fmtStrike = (k: number) => (Number.isInteger(k) ? String(k) : k.toFixed(k * 10 === Math.round(k * 10) ? 1 : 2));
const cShort = (r: Pick<TapeRow, 'strike' | 'optionType' | 'expiry'>) => `$${fmtStrike(r.strike)}${r.optionType === 'call' ? 'C' : 'P'} ${r.expiry.slice(5)}`;
/** $1.2M → "1.2M" for dense cells */
const tiny = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${Math.round(a / 1e3)}K`;
  return a ? String(Math.round(a)) : '';
};
const isSweep = (r: TapeRow) => r.kind === 'sweep';
const isBlock = (r: TapeRow) => r.kind === 'block' || r.kind === 'grenade';

function Seg<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: ReadonlyArray<readonly [T, string, string?]>; onChange: (v: T) => void;
}) {
  return (
    <div className="of-seg" role="group" aria-label={label}>
      {options.map(([v, l, why]) => (
        <button key={String(v)} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} title={why} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/** Enter / Space on a focusable row = click (rows are buttons where possible; this covers table rows). */
const rowKeys = (fn: () => void) => ({
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } },
});

/** The page shows a scope seg on list tools; the "Ticker flow" dashboard's copies start focused. */
function useScope(): ['all' | 'focus', (v: 'all' | 'focus') => void] {
  const inst = useToolInstance();
  return useToolSetting<'all' | 'focus'>('scope', inst.startsWith('ticker-') ? 'focus' : 'all');
}

function tapeGate(q: { isLoading: boolean; isError: boolean; data?: TapePayload; refetch: () => unknown; isFetching: boolean }, what: string): ReactNode | null {
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" label={`reading ${what}…`} />;
  if (q.isError && !q.data) return <QEError className="fd-m" title={`${what} didn't load`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data) return <QELoading rows={3} className="fd-pad" />;
  return null;
}
function sourceStateLine(d: TapePayload | undefined, now: number) {
  if (!d) return '';
  const bf = d.sources.bullflow; const cs = d.sources.chainScan;
  return `Bullflow stream ${bf.enabled ? bf.streamState : 'not configured'} · chain scan ${cs.ok ? `newest ${ageLabel(cs.newestAt, now)}` : 'read failed'}`;
}

/* ── the focused ticker's slice of the tape, shared by ladder / heatmap / timeline ── */
function useTickerFlow() {
  const [symbol, setFocus] = useFocusSymbol();
  const [days, setDays] = useDashState<number>('flow:days', 1);
  const [mode, setMode] = useDashState<SrcMode>('flow:src', 'auto');
  const [bucket, setBucket] = useDashState<DteB>('flow:dte', 'all');
  const q = useFlowTape(days, symbol);
  const now = useNow(60_000);
  const data = q.data;
  const all = useMemo(() => data?.rows ?? [], [data]);
  const src = resolveSrc(mode, all);
  const rows = useMemo(() => all.filter((r) => (src === 'all' || r.source === src) && inDte(r, bucket, now)), [all, src, bucket, now]);
  return { symbol, setFocus, days, setDays, mode, setMode, bucket, setBucket, q, all, src, rows, newest: newestAt(rows) };
}
type TickerFlow = ReturnType<typeof useTickerFlow>;

function useTickerReport(t: TickerFlow) {
  useToolReport({
    asOf: t.q.isError && !t.q.data ? null : t.q.data ? t.newest : undefined,
    source: `flow tape · ${SRC_LABEL[t.src]}`,
    note: t.q.isError ? 'refresh failed' : t.q.data ? `${t.rows.length} prints · ${t.days}D${t.bucket !== 'all' ? ` · ${t.bucket}d` : ''}` : undefined,
    tone: t.q.isError || (t.q.data && !t.q.data.sources.chainScan.ok) ? 'warn' : 'ok',
  });
}

function TickerControls({ t, dteSeg = true }: { t: TickerFlow; dteSeg?: boolean }) {
  return (
    <div className="fx-ctl" title="Window, source and expiry filter are shared by every FLOW ticker tool on this page">
      <Seg label="Window" value={t.days} options={DAY_OPTS} onChange={t.setDays} />
      <Seg label="Source" value={t.mode} options={SRC_OPTS} onChange={t.setMode} />
      {dteSeg && <Seg label="Days to expiry" value={t.bucket} options={DTE_OPTS} onChange={t.setBucket} />}
    </div>
  );
}

/** Spot for the focused ticker: the platform quote, else the newest chain-scan spot (labelled). */
function useSpot(symbol: string, rows: TapeRow[]) {
  const q = useQuery<{ quotes?: Record<string, { price: number; asOf?: string }> }>({
    queryKey: [`/api/quotes/batch/${symbol}`], queryFn: getJson(`/api/quotes/batch/${encodeURIComponent(symbol)}`),
    staleTime: 30_000, refetchInterval: 60_000, retry: 1,
  });
  const qt = q.data?.quotes?.[symbol];
  if (qt && Number.isFinite(qt.price) && qt.price > 0) return { price: qt.price, asOf: qt.asOf ?? null, how: 'quote' };
  let best: TapeRow | null = null;
  for (const r of rows) if (r.spot != null && r.at && (!best || r.at > (best.at ?? ''))) best = r;
  return best ? { price: best.spot as number, asOf: best.at, how: 'chain-scan spot at observation' } : null;
}

/** Keeps the spot row centred in a scroller when the symbol (or first data) changes. */
function useCenterOn(key: string) {
  const scroller = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const sc = scroller.current; const el = target.current;
    if (!sc || !el) return;
    sc.scrollTop = Math.max(0, el.offsetTop - sc.clientHeight / 2);
  }, [key]);
  return { scroller, target };
}

interface StrikeAgg { call: number; put: number; callN: number; putN: number; sweeps: number }
function aggByStrike(rows: TapeRow[]) {
  const m = new Map<number, StrikeAgg>();
  for (const r of rows) {
    if (!Number.isFinite(r.strike)) continue;
    const e = m.get(r.strike) ?? { call: 0, put: 0, callN: 0, putN: 0, sweeps: 0 };
    if (r.optionType === 'call') { e.call += r.premium; e.callN++; } else { e.put += r.premium; e.putN++; }
    if (isSweep(r)) e.sweeps++;
    m.set(r.strike, e);
  }
  return m;
}
function totals(rows: TapeRow[]) {
  let call = 0, put = 0, callN = 0, putN = 0, sweeps = 0, blocks = 0;
  for (const r of rows) {
    if (r.optionType === 'call') { call += r.premium; callN++; } else { put += r.premium; putN++; }
    if (isSweep(r)) sweeps++;
    if (isBlock(r)) blocks++;
  }
  return { call, put, callN, putN, sweeps, blocks, n: rows.length };
}

function CallPutSummary({ tot }: { tot: ReturnType<typeof totals> }) {
  const pc = tot.call > 0 ? tot.put / tot.call : null;
  const share = tot.call + tot.put > 0 ? tot.call / (tot.call + tot.put) : null;
  return (
    <div className="fx-sum">
      <span>Calls <b style={{ color: CALL }}>{money(tot.call)}</b> <span className="dim">{tot.callN}</span></span>
      <span>Puts <b style={{ color: PUT }}>{money(tot.put)}</b> <span className="dim">{tot.putN}</span></span>
      <span title="Put premium ÷ call premium">P/C $ <b>{pc != null ? pc.toFixed(2) : '—'}</b></span>
      {share != null && (
        <span className="fx-split" role="img" aria-label={`Calls ${(share * 100).toFixed(0)}% of premium`}>
          <i style={{ width: `${share * 100}%`, background: CALL_FILL }} /><i style={{ width: `${(1 - share) * 100}%`, background: PUT }} />
        </span>
      )}
    </div>
  );
}

/* ════════════════════ Flow by strike — call vs put premium ladder ════════════════════ */

export function FlowStrikeLadderTool() {
  const t = useTickerFlow();
  useTickerReport(t);
  const now = useNow();
  const spot = useSpot(t.symbol, t.all);
  const [sel, setSel] = useDashState<number | null>('flow:strike', null);
  const agg = useMemo(() => aggByStrike(t.rows), [t.rows]);
  const strikes = useMemo(() => [...agg.keys()].sort((a, b) => b - a), [agg]);
  const tot = useMemo(() => totals(t.rows), [t.rows]);
  const { scroller, target } = useCenterOn(`${t.symbol}|${strikes.length > 0}|${spot ? 1 : 0}|${t.days}|${t.src}`);
  const gate = tapeGate(t.q, `${t.symbol} flow`);
  if (gate) return <div className="fx-root"><TickerControls t={t} />{gate}</div>;
  if (!strikes.length) {
    return (
      <div className="fx-root"><TickerControls t={t} />
        <QEEmpty className="fd-m" message={`No ${t.symbol} prints from ${SRC_LABEL[t.src]} in the ${t.days}D window${t.bucket !== 'all' ? ` at ${t.bucket} days to expiry` : ''}. ${sourceStateLine(t.q.data, now)}. Pick another ticker in the bar, or click a row in any flow tool.`} />
      </div>
    );
  }
  const max = Math.max(...strikes.map((k) => Math.max(agg.get(k)!.call, agg.get(k)!.put)), 1);
  const top = strikes.reduce((b, k) => (agg.get(k)!.call + agg.get(k)!.put > agg.get(b)!.call + agg.get(b)!.put ? k : b), strikes[0]);
  const spotIdx = spot ? strikes.findIndex((k) => k < spot.price) : -1;
  const detail = sel != null ? t.rows.filter((r) => r.strike === sel) : [];
  const byExp = new Map<string, { call: number; put: number }>();
  for (const r of detail) { const e = byExp.get(r.expiry) ?? { call: 0, put: 0 }; e[r.optionType] += r.premium; byExp.set(r.expiry, e); }
  const spotLine = spot ? (
    <div className="fx-spot" ref={(el) => { target.current = el; }} role="separator" aria-label={`spot ${spot.price.toFixed(2)}`}>
      <span>spot ${spot.price.toFixed(2)}</span>
    </div>
  ) : null;
  return (
    <div className="fx-root">
      <TickerControls t={t} />
      <CallPutSummary tot={tot} />
      <div className="fx-lhead"><span>Put $</span><span>Strike</span><span>Call $</span></div>
      <div className="fx-scroll" ref={scroller}>
        {strikes.map((k, i) => {
          const v = agg.get(k)!;
          return (
            <div key={k}>
              {i === spotIdx && spotLine}
              <button type="button" className={`fx-lrow${sel === k ? ' sel' : ''}${k === top ? ' top' : ''}`} aria-pressed={sel === k}
                onClick={() => setSel(sel === k ? null : k)}
                title={`$${fmtStrike(k)} — calls ${money(v.call)} (${v.callN} prints) · puts ${money(v.put)} (${v.putN}) · ${v.sweeps} sweeps\nPremium traded, not direction. Click to break it down by expiry (also highlights the heatmap row).`}>
                <span className="l"><i style={{ width: `${(v.put / max) * 100}%`, background: PUT }} /><em>{v.put ? money(v.put) : ''}</em></span>
                <span className="k">{fmtStrike(k)}{v.sweeps ? <sup title={`${v.sweeps} sweeps`}>•</sup> : null}</span>
                <span className="r"><i style={{ width: `${(v.call / max) * 100}%`, background: CALL_FILL }} /><em>{v.call ? money(v.call) : ''}</em></span>
              </button>
            </div>
          );
        })}
        {spotIdx === -1 && spotLine}
      </div>
      {sel != null && byExp.size > 0 && (
        <div className="fx-drill">
          <b>${fmtStrike(sel)}</b> by expiry:{' '}
          {[...byExp.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([e, v]) => (
            <span key={e}>{e.slice(5)} <span style={{ color: CALL }}>C {money(v.call)}</span> <span style={{ color: PUT }}>P {money(v.put)}</span></span>
          ))}
          <button type="button" className="fx-x" onClick={() => setSel(null)} aria-label="Clear strike">×</button>
        </div>
      )}
      <div className="fd-foot">
        Premium traded per strike from {SRC_LABEL[t.src]} · • = sweeps at the strike · bought vs sold is not measured, so this is activity, not direction.
        {spot ? ` Spot $${spot.price.toFixed(2)} (${spot.how}${spot.asOf ? `, ${ageLabel(spot.asOf, now)}` : ''}).` : ' No spot available — ladder shown without the spot line.'}
      </div>
    </div>
  );
}

/* ════════════════════ Flow by expiry — strike × expiry premium heatmap ════════════════════ */

export function FlowExpiryHeatmapTool() {
  const t = useTickerFlow();
  useTickerReport(t);
  const now = useNow();
  const spot = useSpot(t.symbol, t.all);
  const [metric, setMetric] = useToolSetting<'both' | 'call' | 'put'>('metric', 'both');
  const [sel, setSel] = useDashState<number | null>('flow:strike', null);
  const [cell, setCell] = useState<{ k: number; e: string } | null>(null);
  const m = useMemo(() => {
    const cells = new Map<string, { call: number; put: number; n: number; sweeps: number; big: TapeRow | null }>();
    const ks = new Set<number>(); const es = new Set<string>();
    for (const r of t.rows) {
      if (!Number.isFinite(r.strike) || !r.expiry) continue;
      ks.add(r.strike); es.add(r.expiry);
      const key = `${r.strike}|${r.expiry}`;
      const c = cells.get(key) ?? { call: 0, put: 0, n: 0, sweeps: 0, big: null };
      c[r.optionType] += r.premium; c.n++;
      if (isSweep(r)) c.sweeps++;
      if (!c.big || r.premium > c.big.premium) c.big = r;
      cells.set(key, c);
    }
    return { cells, strikes: [...ks].sort((a, b) => b - a), exps: [...es].sort() };
  }, [t.rows]);
  const val = (c: { call: number; put: number }) => (metric === 'call' ? c.call : metric === 'put' ? c.put : c.call + c.put);
  const max = useMemo(() => Math.max(1, ...[...m.cells.values()].map(val)), [m, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const { scroller, target } = useCenterOn(`${t.symbol}|${m.strikes.length > 0}|${spot ? 1 : 0}|${t.days}|${t.src}`);
  const gate = tapeGate(t.q, `${t.symbol} flow`);
  const controls = (
    <div className="fx-ctl">
      <Seg label="Window" value={t.days} options={DAY_OPTS} onChange={t.setDays} />
      <Seg label="Source" value={t.mode} options={SRC_OPTS} onChange={t.setMode} />
      <Seg label="Metric" value={metric} options={[['both', 'C+P', 'Total premium; hue = the larger side'], ['call', 'Calls', 'Call premium only'], ['put', 'Puts', 'Put premium only']] as const} onChange={setMetric} />
    </div>
  );
  if (gate) return <div className="fx-root">{controls}{gate}</div>;
  if (!m.strikes.length) {
    return <div className="fx-root">{controls}<QEEmpty className="fd-m" message={`No ${t.symbol} prints from ${SRC_LABEL[t.src]} in the ${t.days}D window. ${sourceStateLine(t.q.data, now)}.`} /></div>;
  }
  const spotIdx = spot ? m.strikes.findIndex((k) => k < spot.price) : -1;
  const drill = cell ? m.cells.get(`${cell.k}|${cell.e}`) : null;
  const spotRow = spot ? (
    <tr className="fx-spotrow" ref={(el) => { target.current = el; }}>
      <th scope="row">spot</th><td colSpan={m.exps.length}><span>${spot.price.toFixed(2)}</span></td>
    </tr>
  ) : null;
  return (
    <div className="fx-root">
      {controls}
      <div className="fx-scroll" ref={scroller}>
        <table className="fx-heat" aria-label={`${t.symbol} premium by strike and expiry`}>
          <thead>
            <tr>
              <th scope="col">Strike</th>
              {m.exps.map((e) => { const d = dte(e, now); return <th key={e} scope="col" title={e}>{e.slice(5)}<span className="dim">{d != null ? ` ${d}d` : ''}</span></th>; })}
            </tr>
          </thead>
          <tbody>
            {m.strikes.map((k, i) => (
              <FragmentRow key={k}>
                {i === spotIdx && spotRow}
                <tr className={sel === k ? 'sel' : ''}>
                  <th scope="row"><button type="button" className="fx-kbtn" onClick={() => setSel(sel === k ? null : k)} aria-pressed={sel === k}>{fmtStrike(k)}</button></th>
                  {m.exps.map((e) => {
                    const c = m.cells.get(`${k}|${e}`);
                    if (!c) return <td key={e} />;
                    const v = val(c);
                    const hue = metric === 'call' ? CALL_FILL : metric === 'put' ? PUT : c.call >= c.put ? CALL_FILL : PUT;
                    const on = cell?.k === k && cell?.e === e;
                    return (
                      <td key={e} style={{ background: cellTint(hue, v, max) }} className={on ? 'on' : ''}>
                        {v > 0 && (
                          <button type="button" className="fx-cell" onClick={() => setCell(on ? null : { k, e })} aria-pressed={on}
                            aria-label={`$${fmtStrike(k)} ${e}: calls ${money(c.call)}, puts ${money(c.put)}`}
                            title={`$${fmtStrike(k)} · ${e}\ncalls ${money(c.call)} · puts ${money(c.put)} · ${c.n} prints · ${c.sweeps} sweeps`}>
                            {tiny(v)}{metric === 'both' ? <span style={{ color: c.call >= c.put ? CALL : PUT }}>{c.call >= c.put ? 'c' : 'p'}</span> : null}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </FragmentRow>
            ))}
            {spotIdx === -1 && spotRow}
          </tbody>
        </table>
      </div>
      {drill && cell && (
        <div className="fx-drill">
          <b>${fmtStrike(cell.k)} · {cell.e}</b>
          <span style={{ color: CALL }}>C {money(drill.call)}</span><span style={{ color: PUT }}>P {money(drill.put)}</span>
          <span>{drill.n} prints · {drill.sweeps} sweeps</span>
          {drill.big && <span className="dim">largest {cShort(drill.big)} {money(drill.big.premium)} · {drill.big.label}</span>}
          <button type="button" className="fx-x" onClick={() => setCell(null)} aria-label="Close cell detail">×</button>
        </div>
      )}
      <div className="fd-foot">
        Premium traded per strike × expiry from {SRC_LABEL[t.src]} — the flow counterpart of the GEX matrix. √-scaled tint (calls blue, puts vermilion; C+P uses the larger side, marked c / p). Activity, not direction.
      </div>
    </div>
  );
}
function FragmentRow({ children }: { children: ReactNode }) { return <>{children}</>; }

/* ════════════════════ Premium timeline — calls vs puts through the session ════════════════════ */

export function FlowTimelineTool() {
  const t = useTickerFlow();
  const [scope, setScope] = useToolSetting<'focus' | 'market'>('scope', 'focus');
  const [view, setView] = useToolSetting<'bars' | 'cum'>('view', 'bars');
  const mq = useFlowTape(t.days, null, scope === 'market');
  const now = useNow();
  const q = scope === 'market' ? mq : t.q;
  const rowsAll = useMemo(() => (scope === 'market' ? mq.data?.rows ?? [] : t.all), [scope, mq.data, t.all]);
  const src = resolveSrc(t.mode, rowsAll);
  const rows = useMemo(() => rowsAll.filter((r) => r.at && (src === 'all' || r.source === src) && inDte(r, t.bucket, now)), [rowsAll, src, t.bucket, now]);
  const who = scope === 'market' ? 'all tickers' : t.symbol;
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? newestAt(rows) : undefined,
    source: `flow tape · ${SRC_LABEL[src]}`,
    note: q.isError ? 'refresh failed' : q.data ? `${who} · ${rows.length} prints${scope === 'market' && q.data.truncated ? ' · capped' : ''}` : undefined,
    tone: q.isError || (q.data && !q.data.sources.chainScan.ok) ? 'warn' : 'ok',
  });
  const bins = useMemo(() => {
    const binMs = t.days === 1 ? 5 * 60_000 : 60 * 60_000;
    const m = new Map<number, { call: number; put: number; n: number }>();
    for (const r of rows) {
      const ts = Date.parse(r.at!);
      if (!Number.isFinite(ts)) continue;
      const b = Math.floor(ts / binMs) * binMs;
      const e = m.get(b) ?? { call: 0, put: 0, n: 0 };
      e[r.optionType] += r.premium; e.n++;
      m.set(b, e);
    }
    const keys = [...m.keys()].sort((a, b) => a - b);
    if (!keys.length) return { binMs, list: [] as Array<{ t: number; call: number; put: number; n: number }> };
    // 1D: continuous 5-min axis (empty bins included); multi-day: only bins with prints (nights collapse).
    const list: Array<{ t: number; call: number; put: number; n: number }> = [];
    if (t.days === 1) for (let b = keys[0]; b <= keys[keys.length - 1]; b += binMs) list.push({ t: b, ...(m.get(b) ?? { call: 0, put: 0, n: 0 }) });
    else for (const k of keys) list.push({ t: k, ...m.get(k)! });
    return { binMs, list };
  }, [rows, t.days]);
  const controls = (
    <div className="fx-ctl">
      <Seg label="Scope" value={scope} options={[['focus', t.symbol, `Only ${t.symbol}`], ['market', 'Market', 'Every ticker in the tape (market-wide read is capped at the newest 1,500 chain-scan rows)']] as const} onChange={setScope} />
      <Seg label="View" value={view} options={[['bars', 'Bars', 'Premium per bin, calls up / puts down'], ['cum', 'Cumulative', 'Running total of call and put premium']] as const} onChange={setView} />
      <Seg label="Window" value={t.days} options={DAY_OPTS} onChange={t.setDays} />
      <Seg label="Source" value={t.mode} options={SRC_OPTS} onChange={t.setMode} />
    </div>
  );
  const gate = tapeGate(q, scope === 'market' ? 'market tape' : `${t.symbol} flow`);
  if (gate) return <div className="fx-root">{controls}{gate}</div>;
  if (bins.list.length < 1) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message={`No timed prints for ${who} from ${SRC_LABEL[src]} in the ${t.days}D window. ${sourceStateLine(q.data, now)}.`} /></div>;
  const W = 600, H = 170, P = 4, mid = H / 2;
  const n = bins.list.length;
  const bw = (W - 2 * P) / n;
  const x = (i: number) => P + i * bw;
  let svg: ReactNode;
  let cumC = 0, cumP = 0;
  const cum = bins.list.map((b) => { cumC += b.call; cumP += b.put; return { c: cumC, p: cumP }; });
  if (view === 'bars') {
    const hi = Math.max(1, ...bins.list.map((b) => Math.max(b.call, b.put)));
    const h = (v: number) => (v / hi) * (mid - P);
    svg = (
      <>
        <line x1={P} x2={W - P} y1={mid} y2={mid} stroke={MUTE} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {bins.list.map((b, i) => (
          <g key={b.t}>
            <title>{`${etTime(new Date(b.t).toISOString())} ET${t.days > 1 ? ` ${new Date(b.t).toISOString().slice(5, 10)}` : ''} · calls ${money(b.call)} · puts ${money(b.put)} · ${b.n} prints`}</title>
            {b.call > 0 && <rect x={x(i) + bw * 0.1} width={Math.max(0.6, bw * 0.8)} y={mid - h(b.call)} height={h(b.call)} fill={CALL_FILL} />}
            {b.put > 0 && <rect x={x(i) + bw * 0.1} width={Math.max(0.6, bw * 0.8)} y={mid} height={h(b.put)} fill={PUT} />}
          </g>
        ))}
      </>
    );
  } else {
    const hi = Math.max(1, cumC, cumP);
    const y = (v: number) => H - P - (v / hi) * (H - 2 * P);
    const path = (k: 'c' | 'p') => cum.map((v, i) => `${i ? 'L' : 'M'}${(x(i) + bw / 2).toFixed(1)},${y(v[k]).toFixed(1)}`).join('');
    svg = (
      <>
        <path d={path('c')} fill="none" stroke={CALL_FILL} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        <path d={path('p')} fill="none" stroke={PUT} strokeWidth="1.8" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      </>
    );
  }
  const first = bins.list[0].t, last = bins.list[n - 1].t;
  const fmtT = (ms: number) => `${t.days > 1 ? `${new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit' })} ` : ''}${etTime(new Date(ms).toISOString()).slice(0, 5)}`;
  return (
    <div className="fx-root">
      {controls}
      <div className="fx-sum">
        <span>Calls <b style={{ color: CALL }}>{money(cumC)}</b></span>
        <span>Puts <b style={{ color: PUT }}>{money(cumP)}</b> <span className="dim">{view === 'cum' ? '(dashed)' : '(below the line)'}</span></span>
        <span className="dim">{who} · {t.days === 1 ? '5-min' : 'hourly'} bins</span>
      </div>
      <div className="fx-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${who} call and put premium over time`}>{svg}</svg>
      </div>
      <div className="fx-axis"><span>{fmtT(first)} ET</span><span>{fmtT(last)} ET</span></div>
      <div className="fd-foot">
        Bullflow rows sit at the alert time; chain-scan rows at the time our scanner first saw the contract (its day volume to then), so a scan row is not a trade time. Premium traded — not bought vs sold.
      </div>
    </div>
  );
}

/* ════════════════════ Sweeps & blocks ════════════════════ */

export function SweepsBlocksTool() {
  const [focus, setFocus] = useFocusSymbol();
  const [scope, setScope] = useScope();
  const [kind, setKind] = useToolSetting<'both' | 'sweep' | 'block'>('kind', 'both');
  const [minP, setMinP] = useToolSetting<number>('min', 0);
  const now = useNow();
  const mq = useFlowTape(1, null, scope === 'all');
  const fq = useFlowTape(1, focus, scope === 'focus');
  const q = scope === 'all' ? mq : fq;
  const rows = useMemo(() => (q.data?.rows ?? [])
    .filter((r) => (kind === 'both' ? isSweep(r) || isBlock(r) : kind === 'sweep' ? isSweep(r) : isBlock(r)) && r.premium >= minP), [q.data, kind, minP]);
  const sw = useMemo(() => rows.filter(isSweep), [rows]); const bl = useMemo(() => rows.filter(isBlock), [rows]);
  const list = useMemo(() => rows.slice(0, 300), [rows]);
  // Up to 300 print rows: build them only when the rows or the focus change,
  // not on every 15 s useNow() tick (perf 2026-09-30).
  const printRows = useMemo(() => list.map((r) => (
    <button key={r.id} type="button" className={`fx-print${r.symbol === focus ? ' sel' : ''}`} onClick={() => setFocus(r.symbol)} onDoubleClick={() => openWorkup(r.symbol)} title="Click: focus every FLOW ticker tool · double-click: workup">
      <span className="t">{etTime(r.at).slice(0, 5)}</span>
      <span className="tk">{r.symbol}</span>
      <span className="c" style={{ color: typeColor(r.optionType) }}>{cShort(r)}</span>
      <span className="p">{money(r.premium)}</span>
      <span className="n">{r.label}{r.size != null ? ` · ${r.size.toLocaleString()} ct` : ''}</span>
      <span className="s">{r.source === 'bullflow' ? 'BF' : 'CS'}</span>
    </button>
  )), [list, focus, setFocus]);
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? newestAt(rows) : undefined,
    note: q.isError ? 'refresh failed' : q.data ? `${scope === 'focus' ? focus : 'all tickers'} · today` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  const controls = (
    <div className="fx-ctl">
      <Seg label="Scope" value={scope} options={[['all', 'All', 'Every ticker'], ['focus', focus, `Only ${focus}`]] as const} onChange={setScope} />
      <Seg label="Kind" value={kind} options={[['both', 'Both'], ['sweep', 'Sweeps', 'Bullflow "Sweep" alerts + chain-scan sweep-like (inferred)'], ['block', 'Blocks', 'Bullflow block / grenade alerts + chain-scan block-like (inferred)']] as const} onChange={setKind} />
      <Seg label="Minimum premium" value={minP} options={[[0, 'Any'], [100_000, '100K+'], [1_000_000, '1M+']] as const} onChange={setMinP} />
    </div>
  );
  const gate = tapeGate(q, 'flow tape');
  if (gate) return <div className="fx-root">{controls}{gate}</div>;
  return (
    <div className="fx-root">
      {controls}
      <div className="fx-sum">
        <span>Sweeps <b>{sw.length}</b> <span className="dim">{money(sw.reduce((s, r) => s + r.premium, 0))}</span></span>
        <span>Blocks <b>{bl.length}</b> <span className="dim">{money(bl.reduce((s, r) => s + r.premium, 0))}</span></span>
        {rows.length > list.length && <span className="dim">newest {list.length} of {rows.length}</span>}
      </div>
      {!list.length ? (
        <QEEmpty className="fd-m" message={`No ${kind === 'both' ? 'sweeps or blocks' : `${kind}s`}${minP ? ` ≥ ${money(minP)}` : ''} ${scope === 'focus' ? `for ${focus} ` : ''}today. ${sourceStateLine(q.data, now)}.`} />
      ) : (
        <div className="fx-scroll">
          {printRows}
        </div>
      )}
      <div className="fd-foot">BF = Bullflow alert (named by the provider) · CS = our chain scan (pattern inferred, "-like"). Execution style, not direction.</div>
    </div>
  );
}

/* ════════════════════ Unusual activity — volume vs open interest ════════════════════ */

export function UnusualActivityTool() {
  const [focus, setFocus] = useFocusSymbol();
  const [scope, setScope] = useScope();
  const [days, setDays] = useToolSetting<number>('days', 1);
  const [th, setTh] = useToolSetting<number>('th', 2);
  const now = useNow();
  const mq = useFlowTape(days, null, scope === 'all');
  const fq = useFlowTape(days, focus, scope === 'focus');
  const q = scope === 'all' ? mq : fq;
  const rows = useMemo(() => (q.data?.rows ?? [])
    .filter((r) => r.source === 'chain-scan' && ((r.volOI != null && r.volOI >= th) || (r.volOI == null && r.kind === 'unusual')))
    .sort((a, b) => (b.volOI ?? -1) - (a.volOI ?? -1) || b.premium - a.premium), [q.data, th]);
  // ≤250 rows, rebuilt only when the rows / focus / window change — not per useNow() tick.
  const unusualRows = useMemo(() => rows.slice(0, 250).map((r) => (
                <tr key={r.id} className={r.symbol === focus ? 'sel' : ''} onClick={() => setFocus(r.symbol)} onDoubleClick={() => openWorkup(r.symbol)} {...rowKeys(() => setFocus(r.symbol))} title="Click / Enter: focus · double-click: workup">
                  <td className="tk">{r.symbol}</td>
                  <td style={{ color: typeColor(r.optionType) }}>{cShort(r)}</td>
                  <td className="r">{r.size != null ? r.size.toLocaleString() : '—'}</td>
                  <td className="r">{r.openInterest != null ? r.openInterest.toLocaleString() : '—'}</td>
                  <td className="r"><b>{r.volOI != null ? `${r.volOI.toFixed(1)}×` : 'flagged'}</b></td>
                  <td className="r">{money(r.premium)}</td>
                  <td className="r">{r.spot != null ? r.spot.toFixed(2) : '—'}</td>
                  <td className="r dim">{days > 1 && r.at ? `${r.at.slice(5, 10)} ` : ''}{etTime(r.at).slice(0, 5)}</td>
                </tr>
  )), [rows, focus, setFocus, days]);
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? newestAt(rows) : undefined,
    source: 'chain scan (OI-bearing rows)',
    note: q.isError ? 'refresh failed' : q.data ? `${rows.length} contracts ≥ ${th}× OI` : undefined,
    tone: q.isError || (q.data && !q.data.sources.chainScan.ok) ? 'warn' : 'ok',
  });
  const controls = (
    <div className="fx-ctl">
      <Seg label="Scope" value={scope} options={[['all', 'All', 'Every ticker'], ['focus', focus, `Only ${focus}`]] as const} onChange={setScope} />
      <Seg label="Vol/OI at least" value={th} options={[[2, '≥2×'], [5, '≥5×'], [10, '≥10×']] as const} onChange={setTh} />
      <Seg label="Window" value={days} options={DAY_OPTS} onChange={setDays} />
    </div>
  );
  const gate = tapeGate(q, 'flow tape');
  if (gate) return <div className="fx-root">{controls}{gate}</div>;
  if (q.data && !q.data.sources.chainScan.ok) return <div className="fx-root">{controls}<QEError className="fd-m" title="The chain scan didn't load" message="Open interest only comes from our chain scan, so unusual activity can't be measured right now. This is a missing source, not a quiet tape." onRetry={() => q.refetch()} retrying={q.isFetching} /></div>;
  return (
    <div className="fx-root">
      {controls}
      {!rows.length ? (
        <QEEmpty className="fd-m" message={`No contract ${scope === 'focus' ? `on ${focus} ` : ''}traded ≥ ${th}× its open interest in the ${days}D chain scan. ${sourceStateLine(q.data, now)}.`} />
      ) : (
        <div className="fx-scroll">
          <table className="fd-mini">
            <thead><tr><th>Ticker</th><th>Contract</th><th className="r">Vol</th><th className="r">OI</th><th className="r" title="Day volume ÷ open interest at detection">Vol/OI</th><th className="r">Premium</th><th className="r" title="Underlying at observation">Spot</th><th className="r">Seen</th></tr></thead>
            <tbody>
              {unusualRows}
            </tbody>
          </table>
        </div>
      )}
      <div className="fd-foot">Only our chain scan carries open interest (Bullflow alerts do not), so this reads chain-scan rows only. Vol/OI ≥ 1 means more contracts traded today than were open — new positioning or churn; OI tomorrow tells which (see Repeat &amp; position builders).</div>
    </div>
  );
}

/* ════════════════════ Repeat & position builders ════════════════════ */

interface RepeatDay { date: string; volume: number; openInterest: number; totalPremium: number }
interface RepeatContract {
  symbol: string; optionType: 'call' | 'put'; strike: number; expiry: string;
  daysSeen: number; consecutive: boolean; firstSeen: string; lastSeen: string;
  days: RepeatDay[]; oiChange: number; oiChangePct: number | null;
  totalPremium: number; read: 'accumulating' | 'churning' | 'unwinding'; why: string;
}
interface RepeatReport { contracts: RepeatContract[]; coverage?: { daysCaptured: number; dates: string[]; sufficient: boolean; current: boolean; latest: string | null; note: string } }
const READ_COLOR = { accumulating: CALL, churning: MUTE, unwinding: AMBER } as const;

export function PositionBuildersTool() {
  const [focus, setFocus] = useFocusSymbol();
  const [scope, setScope] = useScope();
  const [mode, setMode] = useToolSetting<'buyers' | 'exits' | 'repeats'>('mode', 'buyers');
  const now = useNow();
  // Same key + fetch as components/flow/repeat-buyers.tsx → one request for both.
  const oi = useQuery<RepeatReport>({
    queryKey: ['/api/flow', mode],
    queryFn: async () => {
      const url = mode === 'buyers' ? '/api/flow/repeats?minDays=2&limit=24' : '/api/flow/exits?limit=24';
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error('flow read failed');
      const j = await r.json();
      return mode === 'buyers' ? j : { ...j, contracts: j.exits ?? [] };
    },
    staleTime: 300_000, refetchInterval: 600_000, retry: 1, enabled: mode !== 'repeats',
  });
  const mq = useFlowTape(1, null, mode === 'repeats' && scope === 'all');
  const fq = useFlowTape(5, focus, mode === 'repeats' && scope === 'focus');
  const tq = scope === 'all' ? mq : fq;
  const repeats = useMemo(() => {
    const m = new Map<string, { r: TapeRow; n: number; prem: number; last: string | null; named: boolean }>();
    for (const r of tq.data?.rows ?? []) {
      const k = contractKey(r);
      const e = m.get(k) ?? { r, n: 0, prem: 0, last: null, named: false };
      e.n++; e.prem += r.premium;
      if (r.at && (!e.last || r.at > e.last)) e.last = r.at;
      if (/repeater|position build/i.test(r.label)) e.named = true;
      m.set(k, e);
    }
    return [...m.values()].filter((e) => e.n >= 3 || e.named).sort((a, b) => b.n - a.n || b.prem - a.prem);
  }, [tq.data]);
  const oiRows = useMemo(() => (oi.data?.contracts ?? []).filter((c) => scope === 'all' || c.symbol === focus), [oi.data, scope, focus]);
  const cov = oi.data?.coverage;
  useToolReport(mode === 'repeats'
    ? { asOf: tq.isError && !tq.data ? null : tq.data ? newestAt(tq.data.rows) : undefined, source: 'flow tape (same contract printed repeatedly)', note: tq.data ? `${scope === 'focus' ? `${focus} · 5D` : 'all · today'}` : undefined, tone: tq.isError ? 'warn' : 'ok' }
    : {
      asOf: oi.isError && !oi.data ? null : oi.data ? (cov?.latest ? new Date(`${cov.latest}T16:00:00-04:00`).toISOString() : null) : undefined,
      source: 'OI history (options_flow_history)',
      note: oi.isError ? 'request failed' : cov ? `session-level · latest ${cov.latest ?? '—'}` : undefined,
      tone: oi.isError || (cov && (!cov.current || !cov.sufficient)) ? 'warn' : 'ok',
    });
  const controls = (
    <div className="fx-ctl">
      <Seg label="Read" value={mode} options={[['buyers', 'OI building', 'Contracts whose open interest grew across sessions — positions opened and held'], ['exits', 'Unwinding', 'Open interest falling away from expiry — positions coming off'], ['repeats', 'Repeat prints', 'Same contract printed ≥3× in the tape, or a Bullflow repeater / position-building alert']] as const} onChange={setMode} />
      <Seg label="Scope" value={scope} options={[['all', 'All', 'Every ticker'], ['focus', focus, `Only ${focus}`]] as const} onChange={setScope} />
    </div>
  );
  if (mode === 'repeats') {
    const gate = tapeGate(tq, 'flow tape');
    if (gate) return <div className="fx-root">{controls}{gate}</div>;
    return (
      <div className="fx-root">
        {controls}
        {!repeats.length ? <QEEmpty className="fd-m" message={`No contract printed 3+ times ${scope === 'focus' ? `on ${focus} in 5 sessions` : 'today'}, and no repeater alerts. ${sourceStateLine(tq.data, now)}.`} /> : (
          <div className="fx-scroll">
            <table className="fd-mini">
              <thead><tr><th>Ticker</th><th>Contract</th><th className="r">Prints</th><th className="r">Premium</th><th className="r">Last</th></tr></thead>
              <tbody>
                {repeats.slice(0, 150).map((e) => (
                  <tr key={contractKey(e.r)} className={e.r.symbol === focus ? 'sel' : ''} onClick={() => setFocus(e.r.symbol)} onDoubleClick={() => openWorkup(e.r.symbol)} {...rowKeys(() => setFocus(e.r.symbol))}>
                    <td className="tk">{e.r.symbol}</td>
                    <td style={{ color: typeColor(e.r.optionType) }}>{cShort(e.r)}{e.named ? <span className="dim"> · alert</span> : null}</td>
                    <td className="r"><b>{e.n}</b></td>
                    <td className="r">{money(e.prem)}</td>
                    <td className="r dim">{ageLabel(e.last, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="fd-foot">Repeated prints show persistence of interest, not whether it was opened or closed — the OI reads answer that at the next session.</div>
      </div>
    );
  }
  if (oi.isLoading) return <div className="fx-root">{controls}<QELoading rows={4} className="fd-pad" label="reading open-interest history…" /></div>;
  if (oi.isError && !oi.data) return <div className="fx-root">{controls}<QEError className="fd-m" title="Open-interest history didn't load" onRetry={() => oi.refetch()} retrying={oi.isFetching} /></div>;
  return (
    <div className="fx-root">
      {controls}
      {cov && (!cov.current || !cov.sufficient) && <div className="of-warn" role="status">{cov.note}</div>}
      {!oiRows.length ? <QEEmpty className="fd-m" message={`No ${mode === 'buyers' ? 'building' : 'unwinding'} contracts${scope === 'focus' ? ` on ${focus}` : ''} in the captured sessions${cov ? ` (${cov.daysCaptured} captured)` : ''}.`} /> : (
        <div className="fx-scroll">
          <table className="fd-mini">
            <thead><tr><th>Ticker</th><th>Contract</th><th className="r">Sessions</th><th className="r" title="Open interest first seen → latest">OI</th><th className="r">ΔOI</th><th>Read</th></tr></thead>
            <tbody>
              {oiRows.map((c) => {
                const first = c.days[0]?.openInterest ?? null; const last = c.days[c.days.length - 1]?.openInterest ?? null;
                return (
                  <tr key={`${c.symbol}|${c.optionType}|${c.strike}|${c.expiry}`} className={c.symbol === focus ? 'sel' : ''} onClick={() => setFocus(c.symbol)} onDoubleClick={() => openWorkup(c.symbol)} {...rowKeys(() => setFocus(c.symbol))} title={c.why}>
                    <td className="tk">{c.symbol}</td>
                    <td style={{ color: typeColor(c.optionType) }}>{cShort(c)}</td>
                    <td className="r">{c.daysSeen}{c.consecutive ? '' : '*'}</td>
                    <td className="r">{first != null && last != null ? `${first.toLocaleString()}→${last.toLocaleString()}` : '—'}</td>
                    <td className="r">{c.oiChange >= 0 ? '+' : '−'}{Math.abs(c.oiChange).toLocaleString()}{c.oiChangePct != null ? <span className="dim"> {c.oiChangePct >= 0 ? '+' : '−'}{Math.abs(c.oiChangePct).toFixed(0)}%</span> : null}</td>
                    <td style={{ color: READ_COLOR[c.read] }}>{c.read}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="fd-foot">Ranked by open-interest change, never by premium — OI is what survives the close. Blue = building, amber = unwinding (not direction; C/P says which side). * = sessions not consecutive.</div>
    </div>
  );
}

/* ════════════════════ Top tickers — provider net premium or our tape ════════════════════ */

interface Leader { ticker: string; totalNetPremium?: number; totalPremium?: number; callPremium?: number; putPremium?: number }

/** One provider leader row; the net cell flashes when a refresh changes it (lib/use-tick-flash.ts). */
function LeaderRow({ r, max, selected, onFocus }: { r: Leader; max: number; selected: boolean; onFocus: () => void }) {
  const net = r.totalNetPremium ?? null;
  const flash = useTickFlash(net);
  return (
    <tr className={selected ? 'sel' : ''} onClick={onFocus} onDoubleClick={() => openWorkup(r.ticker)} {...rowKeys(onFocus)} title="Click / Enter: focus · double-click: workup">
      <td className="tk"><WatchStar sym={r.ticker} size={11} /> {r.ticker}</td>
      <td className="r" style={{ position: 'relative' }}>
        <span className="fd-nbar" style={{ width: `${(Math.abs(net ?? 0) / max) * 100}%`, background: signColor(net) }} />
        <span className={flash} style={{ position: 'relative', color: signColor(net) }}>{net == null ? '—' : `${net >= 0 ? '+' : ''}${money(net)}`}</span>
      </td>
      <td className="r" style={{ color: CALL }}>{money(r.callPremium)}</td>
      <td className="r" style={{ color: PUT }}>{money(r.putPremium)}</td>
    </tr>
  );
}

/** One tape-ranked row; premium flashes as new prints land. */
function TapeLeaderRow({ r, max, selected, onFocus }: { r: { t: string; call: number; put: number; n: number; sweeps: number }; max: number; selected: boolean; onFocus: () => void }) {
  const flash = useTickFlash(r.call + r.put);
  return (
    <tr className={selected ? 'sel' : ''} onClick={onFocus} onDoubleClick={() => openWorkup(r.t)} {...rowKeys(onFocus)}>
      <td className="tk"><WatchStar sym={r.t} size={11} /> {r.t}</td>
      <td className="r" style={{ position: 'relative' }}>
        <span className="fx-cpbar" style={{ width: `${((r.call + r.put) / max) * 100}%` }}>
          <i style={{ flex: r.call, background: CALL_FILL }} /><i style={{ flex: r.put, background: PUT }} />
        </span>
        <span className={flash} style={{ position: 'relative' }}>{money(r.call + r.put)}</span>
      </td>
      <td className="r" style={{ color: CALL }}>{money(r.call)}</td>
      <td className="r" style={{ color: PUT }}>{money(r.put)}</td>
      <td className="r">{r.n}{r.sweeps ? <span className="dim"> · {r.sweeps}sw</span> : null}</td>
    </tr>
  );
}

export function TopTickersTool() {
  const [focus, setFocus] = useFocusSymbol();
  const [mode, setMode] = useToolSetting<'provider' | 'tape'>('mode', 'provider');
  const [etfs, setEtfs] = useToolSetting<boolean>('etfs', false);
  const now = useNow();
  const pq = useQuery<{ enabled: boolean; generatedAt?: string | null; rows: Leader[] }>({
    queryKey: ['/api/bullflow/leaders'], queryFn: getJson('/api/bullflow/leaders'),
    staleTime: 5 * 60_000, refetchInterval: 6 * 60_000, retry: 1, enabled: mode === 'provider',
  });
  const tq = useFlowTape(1, null, mode === 'tape');
  const tapeSrc = resolveSrc('auto', tq.data?.rows ?? []);
  const tapeRows = useMemo(() => {
    const m = new Map<string, { t: string; call: number; put: number; n: number; sweeps: number }>();
    for (const r of tq.data?.rows ?? []) {
      if (r.source !== tapeSrc) continue;
      if (!etfs && ETF_SET.has(r.symbol)) continue;
      const e = m.get(r.symbol) ?? { t: r.symbol, call: 0, put: 0, n: 0, sweeps: 0 };
      e[r.optionType] += r.premium; e.n++; if (isSweep(r)) e.sweeps++;
      m.set(r.symbol, e);
    }
    return [...m.values()].sort((a, b) => b.call + b.put - (a.call + a.put)).slice(0, 30);
  }, [tq.data, tapeSrc, etfs]);
  useToolReport(mode === 'provider'
    ? {
      asOf: pq.isError ? null : pq.data?.generatedAt ?? (pq.data ? null : undefined),
      source: 'Bullflow optionsTopTickers',
      note: pq.isError ? 'request failed' : pq.data && !pq.data.generatedAt ? 'provider sent no timestamp · refreshed ≤6m' : undefined,
      tone: pq.isError ? 'warn' : 'ok',
    }
    : {
      asOf: tq.isError && !tq.data ? null : tq.data ? newestAt(tq.data.rows) : undefined,
      source: `flow tape · ${SRC_LABEL[tapeSrc]}`,
      note: tq.data?.truncated ? 'newest 1,500 scan rows' : undefined,
      tone: tq.isError ? 'warn' : 'ok',
    });
  const controls = (
    <div className="fx-ctl">
      <Seg label="Ranking" value={mode} options={[['provider', 'Net (BF)', 'Bullflow: ask-side minus bid-side premium, measured by the provider, ETFs excluded'], ['tape', 'Our tape', 'Total premium per ticker in our tape today (calls + puts, activity)']] as const} onChange={setMode} />
      {mode === 'tape' && <Seg label="ETFs" value={etfs ? 'y' : 'n'} options={[['n', 'Stocks'], ['y', '+ETFs']] as const} onChange={(v) => setEtfs(v === 'y')} />}
    </div>
  );
  if (mode === 'provider') {
    if (pq.isLoading) return <div className="fx-root">{controls}<QELoading rows={5} className="fd-pad" /></div>;
    if (pq.isError && !pq.data) return <div className="fx-root">{controls}<QEError className="fd-m" title="Top tickers didn't load" onRetry={() => pq.refetch()} retrying={pq.isFetching} /></div>;
    if (!pq.data?.enabled) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message="Bullflow is not configured on this server, so provider net-premium leaders are not available." action={<button type="button" className="fd-btn" onClick={() => setMode('tape')}>Rank from our tape</button>} /></div>;
    const rows = pq.data.rows ?? [];
    if (!rows.length) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message="No net-premium leaders yet today — they appear after the first prints." action={<button type="button" className="fd-btn" onClick={() => setMode('tape')}>Rank from our tape</button>} /></div>;
    const max = Math.max(...rows.map((r) => Math.abs(r.totalNetPremium ?? 0)), 1);
    return (
      <div className="fx-root">
        {controls}
        {pq.isError && <div className="fd-stale"><QEStale what="refresh leaders" updatedAt={pq.dataUpdatedAt} onRetry={() => pq.refetch()} retrying={pq.isFetching} /></div>}
        <div className="fx-scroll">
          <table className="fd-mini">
            <thead><tr><th>Ticker</th><th className="r" title="Ask-side minus bid-side premium (provider)">Net</th><th className="r">Call $</th><th className="r">Put $</th></tr></thead>
            <tbody>
              {rows.map((r) => <LeaderRow key={r.ticker} r={r} max={max} selected={r.ticker === focus} onFocus={() => setFocus(r.ticker)} />)}
            </tbody>
          </table>
        </div>
        <div className="fd-foot">Net = ask-side minus bid-side premium as inferred by Bullflow (+ blue, − vermilion). Cached 6 min server-side.</div>
      </div>
    );
  }
  const gate = tapeGate(tq, 'flow tape');
  if (gate) return <div className="fx-root">{controls}{gate}</div>;
  if (!tapeRows.length) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message={`No prints in today's tape yet. ${sourceStateLine(tq.data, now)}.`}
    action={!etfs ? <button type="button" className="fd-btn" onClick={() => setEtfs(true)}>Include ETFs</button> : <button type="button" className="fd-btn" onClick={() => setMode('provider')}>Use provider ranking</button>} /></div>;
  const max = Math.max(...tapeRows.map((r) => r.call + r.put), 1);
  return (
    <div className="fx-root">
      {controls}
      <div className="fx-scroll">
        <table className="fd-mini">
          <thead><tr><th>Ticker</th><th className="r">Premium</th><th className="r">Call $</th><th className="r">Put $</th><th className="r">Prints</th></tr></thead>
          <tbody>
            {tapeRows.map((r) => <TapeLeaderRow key={r.t} r={r} max={max} selected={r.t === focus} onFocus={() => setFocus(r.t)} />)}
          </tbody>
        </table>
      </div>
      <div className="fd-foot">Premium traded today per ticker from {SRC_LABEL[tapeSrc]} — activity, not net direction (side is not measured on our feeds).{tq.data?.truncated ? ' The market-wide read holds the newest 1,500 chain-scan rows.' : ''}</div>
    </div>
  );
}

/* ════════════════════ Dark pool — multi-day levels & today's prints ════════════════════ */

interface DpLevel { price: number; notional: number; size: number; pctDayVolume: number; percent30DayVolume: number; at: number | string | null }
interface OverlayDp { source: string; asOf: string | null; stale: boolean; windowFrom: string | null; windowTo: string | null; printsScanned: number; truncated: boolean; levels: { price: number; notional: number; prints: number; date: string | null; firstDate: string | null }[]; note: string }

export function DarkPoolTool() {
  const [focus] = useFocusSymbol();
  const [mode, setMode] = useToolSetting<'levels' | 'prints'>('mode', 'levels');
  const now = useNow();
  const lq = useQuery<{ darkPool?: OverlayDp }>({
    queryKey: ['/api/chart/overlays', focus, '1D'], queryFn: getJson(`/api/chart/overlays/${encodeURIComponent(focus)}?range=1D`),
    staleTime: 5 * 60_000, refetchInterval: 10 * 60_000, retry: 1, enabled: mode === 'levels',
  });
  const pq = useQuery<{ enabled: boolean; darkPoolLevels?: DpLevel[]; disclosure?: string }>({
    queryKey: ['/api/bullflow/context', focus], queryFn: getJson(`/api/bullflow/context/${encodeURIComponent(focus)}`),
    staleTime: 5 * 60_000, refetchInterval: 6 * 60_000, retry: 1, enabled: mode === 'prints',
  });
  const spot = useSpot(focus, []);
  const dp = lq.data?.darkPool;
  const prints = pq.data?.darkPoolLevels ?? [];
  const toIso = (a: DpLevel['at']) => (a == null ? null : typeof a === 'number' ? new Date(a).toISOString() : a);
  const newestPrint = prints.reduce<string | null>((m, l) => { const t = toIso(l.at); return t && (!m || t > m) ? t : m; }, null);
  useToolReport(mode === 'levels'
    ? { asOf: lq.isError ? null : lq.data ? dp?.asOf ?? null : undefined, source: dp?.source, note: lq.isError ? 'request failed' : dp?.stale ? 'stale cache' : dp?.truncated ? 'window truncated' : undefined, tone: lq.isError || dp?.stale ? 'warn' : 'ok' }
    : { asOf: pq.isError ? null : pq.data ? newestPrint : undefined, source: 'Bullflow darkPoolTrades · today', note: pq.isError ? 'request failed' : undefined, tone: pq.isError ? 'warn' : 'ok' });
  const controls = (
    <div className="fx-ctl">
      <Seg label="View" value={mode} options={[['levels', 'Levels · 28d', 'High-notional prints summed by price over ~28 days, within ±8% of spot'], ['prints', 'Prints · today', 'Today\'s largest prints ≥ $1M notional']] as const} onChange={setMode} />
    </div>
  );
  if (mode === 'levels') {
    if (lq.isLoading) return <div className="fx-root">{controls}<QELoading rows={4} className="fd-pad" /></div>;
    if (lq.isError && !lq.data) return <div className="fx-root">{controls}<QEError className="fd-m" title={`${focus} dark-pool levels didn't load`} onRetry={() => lq.refetch()} retrying={lq.isFetching} /></div>;
    const levels = [...(dp?.levels ?? [])].sort((a, b) => b.price - a.price);
    if (!levels.length) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message={`No ${focus} dark-pool levels near spot. ${dp?.note ?? ''}`} /></div>;
    const max = Math.max(...levels.map((l) => l.notional), 1);
    const spotIdx = spot ? levels.findIndex((l) => l.price < spot.price) : -1;
    const spotRow = spot ? <div className="fx-spot"><span>spot ${spot.price.toFixed(2)}</span></div> : null;
    return (
      <div className="fx-root">
        {controls}
        <div className="fx-scroll">
          {levels.map((l, i) => (
            <div key={l.price}>
              {i === spotIdx && spotRow}
              <div className="fx-dprow" title={`$${l.price.toFixed(2)} · ${money(l.notional)} over ${l.prints} prints · ${l.firstDate?.slice(0, 10) ?? '?'} → ${l.date?.slice(0, 10) ?? '?'}`}>
                <span className="k">${l.price.toFixed(2)}</span>
                <span className="b"><i style={{ width: `${(l.notional / max) * 100}%`, background: DARK_POOL }} /><em>{money(l.notional)}</em></span>
                <span className="n">{l.prints}×</span>
                <span className="d">{l.date ? l.date.slice(5, 10) : '—'}</span>
              </div>
            </div>
          ))}
          {spotIdx === -1 && spotRow}
        </div>
        <div className="fd-foot">{dp?.note} {dp?.windowFrom ? `Window ${dp.windowFrom} → ${dp.windowTo}, ${dp.printsScanned} prints scanned${dp.truncated ? ' (provider page limit — older prints not read)' : ''}.` : ''} Levels, not direction.</div>
      </div>
    );
  }
  if (pq.isLoading) return <div className="fx-root">{controls}<QELoading rows={4} className="fd-pad" /></div>;
  if (pq.isError && !pq.data) return <div className="fx-root">{controls}<QEError className="fd-m" title={`${focus} dark-pool prints didn't load`} onRetry={() => pq.refetch()} retrying={pq.isFetching} /></div>;
  if (!pq.data?.enabled) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message="Bullflow is not configured on this server — no dark-pool prints." /></div>;
  if (!prints.length) return <div className="fx-root">{controls}<QEEmpty className="fd-m" message={`No ${focus} dark-pool prints ≥ $1M notional today.`} /></div>;
  return (
    <div className="fx-root">
      {controls}
      {pq.isError && <div className="fd-stale"><QEStale what="refresh dark pool" updatedAt={pq.dataUpdatedAt} onRetry={() => pq.refetch()} retrying={pq.isFetching} /></div>}
      <div className="fx-scroll">
        <table className="fd-mini">
          <thead><tr><th>Time ET</th><th className="r">Price</th><th className="r">Notional</th><th className="r">Shares</th><th className="r" title="Share of today's volume">% day vol</th></tr></thead>
          <tbody>
            {prints.map((l, i) => (
              <tr key={i}>
                <td>{etTime(toIso(l.at))}</td>
                <td className="r">${l.price.toFixed(2)}</td>
                <td className="r" style={{ color: DARK_POOL }}>{money(l.notional)}</td>
                <td className="r">{Number.isFinite(l.size) ? l.size.toLocaleString() : '—'}</td>
                <td className="r">{Number.isFinite(l.pctDayVolume) ? `${l.pctDayVolume.toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fd-foot">{pq.data.disclosure ?? 'Dark-pool prints mark price levels; they are not directional.'} Top 5 by notional. Newest {ageLabel(newestPrint, now)}.</div>
    </div>
  );
}

/* ════════════════════ Flow-driven setups — ideas whose evidence is flow ════════════════════ */

interface PickLayer { kind: string; label: string; points: number; why: string }
interface IdeaPick {
  ideaId: string; symbol: string; direction: 'long' | 'short'; convictionScore: number; convictionBand?: string;
  catalyst?: string; source?: string; layers?: PickLayer[]; generatedAt?: string;
  optionType?: 'call' | 'put' | null; strikePrice?: number | null; expiryDate?: string | null;
}
const FLOW_WORDS = /\b(options? flow|aggressor|sweep|net premium|call premium|put premium|bullflow|unusual (options|volume)|dark[- ]pool)\b/i;

export function FlowSetupsTool() {
  const [focus, setFocus] = useFocusSymbol();
  const now = useNow();
  // Same key + URL as the NEXUS board → one request for both pages' tools.
  const q = useQuery<{ generatedAt?: string; picks?: IdeaPick[] }>({
    queryKey: ['/api/convictions', 'nexus-prototype'], queryFn: getJson('/api/convictions'),
    staleTime: 30_000, refetchInterval: 60_000,
  });
  const rows = useMemo(() => (q.data?.picks ?? []).flatMap((p) => {
    const origin = String(p.source ?? '').toLowerCase() === 'flow' || String(p.catalyst ?? '').startsWith('Aggressor tape:');
    const layer = (p.layers ?? []).find((l) => l.points > 0 && (FLOW_WORDS.test(l.why) || FLOW_WORDS.test(l.label)));
    if (!origin && !layer) return [];
    return [{ p, origin, evidence: origin ? (p.catalyst || layer?.why || 'flow-originated') : layer!.why, layer }];
  }).sort((a, b) => Number(b.origin) - Number(a.origin) || b.p.convictionScore - a.p.convictionScore), [q.data]);
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? q.data.generatedAt ?? null : undefined,
    note: q.isError ? 'refresh failed' : q.data ? `${rows.length} of ${q.data.picks?.length ?? 0} published setups` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" label="reading the idea book…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="The idea book didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!rows.length) return <QEEmpty className="fd-m" message={`None of the ${q.data?.picks?.length ?? 0} published setups cite options flow as evidence right now. Flow-originated ideas come from the flow scanner / aggressor tape; flow-confirmed ones have a scoring layer that names flow.`} />;
  return (
    <div className="fx-root">
      <div className="fx-scroll">
        {rows.map(({ p, origin, evidence }) => (
          <button key={p.ideaId ?? `${p.symbol}-${p.direction}`} type="button" className={`fx-setup${p.symbol === focus ? ' sel' : ''}`} onClick={() => setFocus(p.symbol)} onDoubleClick={() => openWorkup(p.symbol)} title="Click: focus every FLOW ticker tool · double-click: workup">
            <span className="tk">{p.symbol}</span>
            <span className="dir" style={{ color: sideColor(p.direction) }}>{p.direction === 'short' ? 'Short' : 'Long'}</span>
            <span className="sc">{p.convictionBand ? `${p.convictionBand} · ` : ''}{Math.round(p.convictionScore)}</span>
            <span className={`tag${origin ? ' o' : ''}`}>{origin ? 'flow-originated' : 'flow-confirmed'}</span>
            <span className="ev">{p.optionType && p.strikePrice ? <b style={{ color: typeColor(p.optionType) }}>${fmtStrike(p.strikePrice)}{p.optionType === 'call' ? 'C' : 'P'}{p.expiryDate ? ` ${p.expiryDate.slice(5, 10)}` : ''} · </b> : null}{evidence}</span>
          </button>
        ))}
      </div>
      <div className="fd-foot">From the published idea book (convictions engine). Flow-originated = the flow scanner / aggressor tape published it; flow-confirmed = another engine published it and a scoring layer cites flow. Book generated {ageLabel(q.data?.generatedAt, now)}.</div>
    </div>
  );
}

/* ════════════════════ Flow × GEX convergence — focused ticker ════════════════════ */

export function FlowGexConvergenceTool() {
  const t = useTickerFlow();
  const g = useGexTerminal(t.symbol);
  const now = useNow();
  const snap = g.data?.snapshot;
  const spot = snap?.spotPrice ?? 0;
  const newestGex = terminalAsOf(g.data);
  useToolReport({
    asOf: (t.q.isError && !t.q.data) || (g.isError && !g.data) ? null : t.q.data && g.data ? [t.newest, newestGex ?? null].filter(Boolean).sort()[0] ?? null : undefined,
    source: `flow tape · ${SRC_LABEL[t.src]} + GEX engine`,
    note: g.isError ? 'GEX refresh failed' : t.q.isError ? 'flow refresh failed' : g.data?.cached ? 'GEX cached' : 'age = older of the two',
    tone: g.isError || t.q.isError || g.data?.cached ? 'warn' : 'ok',
  });
  const agg = useMemo(() => aggByStrike(t.rows), [t.rows]);
  const gexByStrike = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of g.data?.strikeExpiryMatrix ?? []) m.set(c.strike, (m.get(c.strike) ?? 0) + (c.netGEX ?? 0));
    return m;
  }, [g.data]);
  const openGex = <Link href="/t?tab=gex" className="fx-link">Open GEX →</Link>;
  if (t.q.isLoading || g.isLoading) return <QELoading rows={4} className="fd-pad" label={g.isLoading ? `reading ${t.symbol} dealer map…` : `reading ${t.symbol} flow…`} />;
  if (g.isError && !g.data) return <QEError className="fd-m" title={`${t.symbol} dealer map didn't load`} message="Convergence needs both the flow tape and the GEX engine's levels." onRetry={() => g.refetch()} retrying={g.isFetching} />;
  if (t.q.isError && !t.q.data) return <QEError className="fd-m" title={`${t.symbol} flow didn't load`} onRetry={() => t.q.refetch()} retrying={t.q.isFetching} />;
  if (!snap || !(spot > 0)) return <QEEmpty className="fd-m" message={`No dealer positioning returned for ${t.symbol}, so there is nothing to converge flow with.`} />;
  const reg = regimeView(snap);
  const zg = zeroGammaOf(snap);
  const band = Math.max(spot * 0.005, 0.5);
  const near = (lvl: number) => {
    let call = 0, put = 0;
    for (const [k, v] of agg) if (Math.abs(k - lvl) <= band) { call += v.call; put += v.put; }
    return { call, put };
  };
  const levels = ([
    ['Call wall', snap.callWall, LEVEL_COLORS.callWall],
    ['Put wall', snap.putWall, LEVEL_COLORS.putWall],
    ['King node · max γ', snap.maxGammaStrike, LEVEL_COLORS.magnet],
    ['Zero-γ', zg, LEVEL_COLORS.zeroGamma],
  ] as Array<[string, number | null | undefined, string]>).filter(([, v]) => v != null && Number.isFinite(v)) as Array<[string, number, string]>;
  const tot = t.rows.reduce((s, r) => s + r.premium, 0);
  const topStrikes = [...agg.entries()].sort((a, b) => b[1].call + b[1].put - (a[1].call + a[1].put)).slice(0, 6);
  const nearestLevel = (k: number) => levels.reduce<[string, number] | null>((b, [n, v]) => (!b || Math.abs(v - k) < Math.abs(b[1] - k) ? [n, v] : b), null);
  const pct = (v: number) => `${v >= spot ? '+' : '−'}${Math.abs((v / spot - 1) * 100).toFixed(1)}%`;
  return (
    <div className="fx-root">
      <div className="fx-ctl">
        <Seg label="Window" value={t.days} options={DAY_OPTS} onChange={t.setDays} />
        <Seg label="Source" value={t.mode} options={SRC_OPTS} onChange={t.setMode} />
        {openGex}
      </div>
      <div className="fx-sum">
        <span>{t.symbol} <b>${spot.toFixed(2)}</b></span>
        {reg && <span style={{ color: regimeColor(reg.regime, reg.nearFlip) }} title={reg.posture}>{reg.glyph} {reg.title}</span>}
        <span className="dim">net GEX {fmtGexB(snap.totalGEX)}/1%</span>
      </div>
      <div className="fx-scroll">
        <table className="fd-mini">
          <thead><tr><th>GEX level</th><th className="r">Price</th><th className="r">vs spot</th><th className="r" title={`Call premium at strikes within ±$${band.toFixed(2)} of the level`}>Call $ near</th><th className="r" title="Put premium at strikes near the level">Put $ near</th></tr></thead>
          <tbody>
            {levels.map(([n, v, c]) => { const f = near(v); return (
              <tr key={n}><td style={{ color: c }}>{n}</td><td className="r">${fmtStrike(v)}</td><td className="r dim">{pct(v)}</td>
                <td className="r" style={{ color: f.call ? CALL : MUTE }}>{f.call ? money(f.call) : '—'}</td><td className="r" style={{ color: f.put ? PUT : MUTE }}>{f.put ? money(f.put) : '—'}</td></tr>
            ); })}
          </tbody>
        </table>
        <div className="fx-subhead">Heaviest flow strikes vs dealer gamma</div>
        {!topStrikes.length ? <div className="fd-foot">No {t.symbol} prints from {SRC_LABEL[t.src]} in the {t.days}D window — levels above are GEX-only. {sourceStateLine(t.q.data, now)}.</div> : (
          <table className="fd-mini">
            <thead><tr><th className="r">Strike</th><th className="r">Call $</th><th className="r">Put $</th><th className="r" title="Share of this ticker's premium in the window">Share</th><th className="r" title="Net dealer GEX at this strike, all listed expiries (GEX engine)">Dealer γ</th><th>Nearest level</th></tr></thead>
            <tbody>
              {topStrikes.map(([k, v]) => {
                const gx = gexByStrike.get(k); const nl = nearestLevel(k);
                return (
                  <tr key={k}>
                    <td className="r tk">${fmtStrike(k)}</td>
                    <td className="r" style={{ color: CALL }}>{v.call ? money(v.call) : '—'}</td>
                    <td className="r" style={{ color: PUT }}>{v.put ? money(v.put) : '—'}</td>
                    <td className="r">{tot ? `${(((v.call + v.put) / tot) * 100).toFixed(0)}%` : '—'}</td>
                    <td className="r" style={{ color: gx == null ? MUTE : gx >= 0 ? CALL : PUT }} title={gx == null ? 'strike not in the GEX matrix' : gx >= 0 ? 'dealers long gamma here — tends to dampen' : 'dealers short gamma here — tends to amplify'}>{gx == null ? '—' : `${fmtGexB(gx)}`}</td>
                    <td className="dim">{nl ? `${nl[0]} $${fmtStrike(nl[1])} (${k >= nl[1] ? '+' : '−'}$${fmtStrike(Math.abs(k - nl[1]))})` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="fd-foot">Where traded premium sits relative to the GEX engine's walls, king node and zero-γ (read from the GEX page's own query, not recomputed). Co-location, not a direction call: neither flow feed measures bought vs sold. Dealer γ: + blue dampens, − vermilion amplifies.</div>
    </div>
  );
}

/* ════════════════════ Flow context — compact, for other pages ════════════════════ */

export function FlowContextTool() {
  const [symbol, setFocus] = useFocusSymbol();
  const { page } = useDashboard();
  const q = useFlowTape(1, symbol);
  const now = useNow();
  const all = q.data?.rows ?? [];
  const src = resolveSrc('auto', all);
  const rows = all.filter((r) => r.source === src);
  const tot = totals(rows);
  const agg = aggByStrike(rows);
  const top = [...agg.entries()].sort((a, b) => b[1].call + b[1].put - (a[1].call + a[1].put))[0];
  const lastAlert = all.filter((r) => r.source === 'bullflow').sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? newestAt(rows) : undefined,
    source: `flow tape · ${SRC_LABEL[src]}`,
    note: q.isError ? 'refresh failed' : 'today',
    tone: q.isError ? 'warn' : 'ok',
  });
  const link = page !== 'flow' ? <Link href="/t?tab=flow" className="fx-link" onClick={() => setFocus(symbol)}>Open FLOW →</Link> : null;
  if (q.isLoading) return <QELoading rows={3} className="fd-pad" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title={`${symbol} flow didn't load`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  return (
    <div className="fx-root fx-ctx">
      {!rows.length ? (
        <div className="fx-ctx-empty">No {symbol} options prints today yet. <span className="dim">{sourceStateLine(q.data, now)}.</span></div>
      ) : (
        <>
          <CallPutSummary tot={tot} />
          <div className="fx-ctx-grid">
            <div><span className="dim">Prints</span><b>{tot.n}</b></div>
            <div><span className="dim">Sweeps</span><b>{tot.sweeps}</b></div>
            <div><span className="dim">Blocks</span><b>{tot.blocks}</b></div>
            <div title="Strike with the most premium today"><span className="dim">Top strike</span><b>{top ? `$${fmtStrike(top[0])}` : '—'}</b>{top ? <span style={{ color: top[1].call >= top[1].put ? CALL : PUT }}>{top[1].call >= top[1].put ? 'calls' : 'puts'} {money(top[1].call + top[1].put)}</span> : null}</div>
          </div>
          {lastAlert && (
            <div className="fx-ctx-last" title="Newest Bullflow alert for this ticker">
              <span className="dim">Last alert {etTime(lastAlert.at).slice(0, 5)}</span> <span style={{ color: typeFill(lastAlert.optionType) }}>{cShort(lastAlert)}</span> {money(lastAlert.premium)} · {lastAlert.label}
            </div>
          )}
        </>
      )}
      <div className="fx-ctx-foot"><span className="dim">Activity, not direction · {SRC_LABEL[src]}</span>{link}</div>
    </div>
  );
}
