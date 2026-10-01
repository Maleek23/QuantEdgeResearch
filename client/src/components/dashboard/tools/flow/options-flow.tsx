/**
 * OPTIONS FLOW tool — modelled on Bullflow's Options Flow screen, built only
 * from fields our feeds actually carry.
 *
 *   header   premium tide (cumulative call $ vs put $), trade count, sweep %,
 *            puts vs calls counts + $ with a ratio bar
 *   chips    only the ones our data supports; Bid/Ask/AA/BB/Mid, Rising Vol,
 *            AM Spike and Earnings Soon are HIDDEN (listed in the ⓘ) because
 *            neither feed measures them
 *   table    virtualised, sortable; SigScore defined in ./tape.ts (tooltip
 *            carries the formula); rows tinted by print class
 *   click    focuses the dashboard ticker → the Stock Chart tool re-points
 *            with its flow markers; double-click opens the workup
 */
import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { openWorkup } from '@/lib/workup-bus';
import { cn } from '@/lib/utils';
import { QEEmpty, QEError, QELoading, QEStale } from '@/components/ui/qe-states';
import { QEDrawer } from '@/components/ui/qe-drawer';
import { InfoSheet, usePhone } from '@/components/ui/qe-phone';
import { CALL, CALL_FILL, PUT } from './flow-colors';
import { useDashboard, useFocusSymbol, useNow, useToolReport, useToolSetting } from '../../frame';
import { idSet, intIn, oneOf, sortCodec, text, useUrlParam } from '@/lib/url-state';
import {
  useFlowTape, sigScore, contractKey, dte, money, etTime, ageLabel,
  ETF_SET, SIG_FORMULA_TEXT, type TapeRow, type SigParts,
} from './tape';

type ChipId =
  | 'etfs' | 'stocks' | 'calls' | 'puts' | 'sweeps' | 'unusual' | 'urgent' | 'builders' | 'sizable'
  | 'grenade' | 'p100k' | 'whales' | 'leaps' | 'zeroDte' | 'highSig' | 'repeat' | 'largeSize';

const CHIPS: { id: ChipId; label: string; why: string }[] = [
  { id: 'etfs', label: 'ETFs', why: `Index/sector/leveraged ETFs from a fixed ${ETF_SET.size}-ticker list (not exhaustive).` },
  { id: 'stocks', label: 'Stocks', why: 'Everything not on the ETF list.' },
  { id: 'sweeps', label: 'Sweeps', why: 'Bullflow alert names containing "Sweep", or chain-scan sweep-like pattern (inferred).' },
  { id: 'calls', label: 'Calls', why: 'Call contracts.' },
  { id: 'puts', label: 'Puts', why: 'Put contracts.' },
  { id: 'unusual', label: 'Unusual', why: 'Chain-scan "unusual volume" pattern, or volume ≥ 2× open interest where OI is known.' },
  { id: 'urgent', label: 'Urgent', why: 'Bullflow "Urgent Repeater" alerts.' },
  { id: 'builders', label: 'Position Builders', why: 'Bullflow "Position Building Repeater" alerts.' },
  { id: 'sizable', label: 'Sizable', why: 'Bullflow "Sizable Sweep" alerts.' },
  { id: 'grenade', label: 'Grenade', why: 'Bullflow "Grenade Trade" alerts.' },
  { id: 'p100k', label: '100k+', why: 'Premium ≥ $100K.' },
  { id: 'whales', label: 'Whales', why: 'Premium ≥ $1M.' },
  { id: 'leaps', label: 'LEAPS', why: '≥ 365 days to expiry.' },
  { id: 'zeroDte', label: '0DTE', why: 'Expires today.' },
  { id: 'highSig', label: 'High Sig', why: 'SigScore ≥ 0.60.' },
  { id: 'repeat', label: 'Repeat Flow', why: 'Same contract printed ≥ 2× in this window, or a Bullflow "Repeater" alert.' },
  { id: 'largeSize', label: 'Large Size', why: '≥ 1,000 contracts (where size is known).' },
];
/** Visible in the one control row; every other chip lives in the Filters sheet (audit 2026-10-01 #18). */
const PRIMARY_CHIPS: ChipId[] = ['calls', 'puts', 'sweeps', 'whales'];
const HIDDEN_CHIPS = 'Not offered — the feeds do not measure them: Bid · Ask · AA · BB · Mid (aggressor side), Rising Vol (needs intraday volume series), AM Spike, Earnings Soon, Bullflow (their own proprietary flag).';

type SortKey = 'at' | 'premium' | 'symbol' | 'spot' | 'strike' | 'type' | 'expiry' | 'label' | 'price' | 'size' | 'volOI' | 'sig' | 'source';
interface Col { key: SortKey; label: string; w: number; r?: boolean; title?: string }
const COLS: Col[] = [
  { key: 'at', label: 'Time ET', w: 74 },
  { key: 'premium', label: 'Value', w: 82, r: true, title: 'Total premium of the print, $' },
  { key: 'symbol', label: 'Ticker', w: 70 },
  { key: 'spot', label: 'Spot', w: 70, r: true, title: 'Underlying at observation — chain scan only; Bullflow alerts do not carry it' },
  { key: 'strike', label: 'Strike', w: 64, r: true },
  { key: 'type', label: 'P/C', w: 44 },
  { key: 'expiry', label: 'Exp', w: 76 },
  { key: 'label', label: 'Type', w: 148, title: 'Bullflow alert name verbatim, or the chain scanner\'s inferred pattern ("-like")' },
  { key: 'price', label: 'Price', w: 62, r: true, title: 'Per-contract fill (Bullflow) / snapshot premium (chain scan)' },
  { key: 'size', label: 'Size', w: 64, r: true, title: 'Contracts. Bullflow: premium ÷ (fill × 100), derived. Chain scan: volume.' },
  { key: 'volOI', label: 'Vol/OI', w: 56, r: true, title: 'Chain scan only' },
  { key: 'sig', label: 'SigScore', w: 92, title: SIG_FORMULA_TEXT },
  { key: 'source', label: 'Src', w: 46, title: 'BF = Bullflow alert · CS = our chain scan' },
];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0);

type SrcId = 'all' | 'bullflow' | 'chain-scan';
const SORT_DEFAULT: { key: SortKey; dir: 1 | -1 } = { key: 'at', dir: -1 };
const DAYS_CODEC = intIn(1, 5, 1);
const SRC_CODEC = oneOf<SrcId>(['all', 'bullflow', 'chain-scan'], 'all');
const Q_CODEC = text(12);
const CHIPS_CODEC = idSet<ChipId>(CHIPS.map((c) => c.id));
const SORT_CODEC = sortCodec<SortKey>(COLS.map((c) => c.key), SORT_DEFAULT);
/** Phone (< 768px): four essential columns — the rest is one tap away in the row sheet. */
/* Three columns; the contract prints in full on the row's second line
   ("SPY 479C 10/17"), never truncated (audit 2026-10-01 #19). */
const PHONE_KEYS: SortKey[] = ['at', 'symbol', 'premium'];
const PHONE_COLS: Col[] = PHONE_KEYS.map((k) => {
  const c = COLS.find((x) => x.key === k)!;
  return k === 'symbol' ? { ...c, label: 'Contract', w: 0 } : k === 'at' ? { ...c, w: 64 } : { ...c, w: 84 };
});
const ROW = 28;
/** Phone rows are two-line touch cards: 52px. */
const PHONE_ROW = 52;
/** "10/17" from "2026-10-17". */
const mmdd = (iso: string) => (iso.length >= 10 ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : iso);

interface Scored { r: TapeRow; sig: SigParts; n: number }

const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function OptionsFlowTool() {
  // Settings live in the per-placement store (frame.tsx useToolSetting), so they
  // survive the tile unmounting off-screen and a reload; on the FLOW page they
  // are also mirrored into the URL (f.*) so a copied link reproduces the view.
  const [days, setDays] = useToolSetting<number>('days', 1);
  const [src, setSrc] = useToolSetting<SrcId>('src', 'all');
  const [q, setQ] = useToolSetting<string>('q', '');
  const [chipList, setChipList] = useToolSetting<ChipId[]>('chips', []);
  const chips = useMemo(() => new Set(chipList), [chipList]);
  const setChips = (next: Set<ChipId> | ((s: Set<ChipId>) => Set<ChipId>)) =>
    setChipList((prev) => [...(typeof next === 'function' ? next(new Set(prev)) : next)]);
  const [sort, setSort] = useToolSetting<{ key: SortKey; dir: 1 | -1 }>('sort', SORT_DEFAULT);
  const [focus, setFocus] = useFocusSymbol();
  const { hasTool, addTool, editable, page } = useDashboard();
  const urlOn = page === 'flow';
  useUrlParam('f.days', days, setDays, DAYS_CODEC, urlOn);
  useUrlParam('f.src', src, setSrc, SRC_CODEC, urlOn);
  useUrlParam('f.q', q, setQ, Q_CODEC, urlOn);
  useUrlParam('f.chips', chipList, setChipList, CHIPS_CODEC, urlOn);
  useUrlParam('f.sort', sort, setSort, SORT_CODEC, urlOn);
  const tape = useFlowTape(days);
  const now = useNow();
  const phone = usePhone();
  const cols = phone ? PHONE_COLS : COLS;
  const rowH = phone ? PHONE_ROW : ROW;
  const [detail, setDetail] = useState<Scored | null>(null);

  const scored: Scored[] = useMemo(() => {
    const rows = tape.data?.rows ?? [];
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(contractKey(r), (counts.get(contractKey(r)) ?? 0) + 1);
    return rows.map((r) => { const n = counts.get(contractKey(r)) ?? 1; return { r, n, sig: sigScore(r, n) }; });
  }, [tape.data]);

  const filtered = useMemo(() => {
    const has = (c: ChipId) => chips.has(c);
    const qq = q.trim().toUpperCase();
    const today = todayET();
    return scored.filter(({ r, sig, n }) => {
      if (src !== 'all' && r.source !== src) return false;
      if (qq && !r.symbol.includes(qq)) return false;
      const etf = ETF_SET.has(r.symbol);
      if ((has('etfs') || has('stocks')) && !((has('etfs') && etf) || (has('stocks') && !etf))) return false;
      if ((has('calls') || has('puts')) && !((has('calls') && r.optionType === 'call') || (has('puts') && r.optionType === 'put'))) return false;
      const name = r.label.toLowerCase();
      if (has('sweeps') && r.kind !== 'sweep') return false;
      if (has('unusual') && !(r.kind === 'unusual' || (r.volOI != null && r.volOI >= 2))) return false;
      if (has('urgent') && !name.includes('urgent')) return false;
      if (has('builders') && !name.includes('position build')) return false;
      if (has('sizable') && !name.includes('sizable')) return false;
      if (has('grenade') && !name.includes('grenade')) return false;
      if (has('p100k') && r.premium < 100_000) return false;
      if (has('whales') && r.premium < 1_000_000) return false;
      const d = dte(r.expiry);
      if (has('leaps') && !(d != null && d >= 365)) return false;
      if (has('zeroDte') && r.expiry.slice(0, 10) !== today) return false;
      if (has('highSig') && sig.total < 0.6) return false;
      if (has('repeat') && !(n >= 2 || name.includes('repeater'))) return false;
      if (has('largeSize') && !(r.size != null && r.size >= 1000)) return false;
      return true;
    });
  }, [scored, chips, src, q]);

  const sorted = useMemo(() => {
    const val = (s: Scored): string | number | null => {
      const r = s.r;
      switch (sort.key) {
        case 'at': return r.at ?? '';
        case 'premium': return r.premium;
        case 'symbol': return r.symbol;
        case 'spot': return r.spot;
        case 'strike': return r.strike;
        case 'type': return r.optionType;
        case 'expiry': return r.expiry;
        case 'label': return r.label;
        case 'price': return r.price;
        case 'size': return r.size;
        case 'volOI': return r.volOI;
        case 'sig': return s.sig.total;
        case 'source': return r.source;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;          // unknowns sink, whatever the direction
      if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [filtered, sort]);

  /* ── header stats (over the filtered set) ── */
  const stats = useMemo(() => {
    let calls = 0, puts = 0, callN = 0, putN = 0, sweeps = 0;
    for (const { r } of filtered) {
      if (r.optionType === 'call') { calls += r.premium; callN++; } else { puts += r.premium; putN++; }
      if (r.kind === 'sweep') sweeps++;
    }
    // tide: cumulative call vs put premium through time, today only
    const today = todayET();
    const tideRows = filtered
      .filter(({ r }) => r.at && new Date(r.at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === today)
      .map(({ r }) => r)
      .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
    let c = 0, p = 0;
    const tide = tideRows.map((r) => { if (r.optionType === 'call') c += r.premium; else p += r.premium; return { t: Date.parse(r.at!), c, p }; });
    return { calls, puts, callN, putN, sweeps, n: filtered.length, tide };
  }, [filtered]);

  const bf = tape.data?.sources.bullflow;
  const cs = tape.data?.sources.chainScan;
  const newestAll = [bf?.newestAt, cs?.newestAt].filter(Boolean).sort().at(-1) ?? null;
  useToolReport({
    asOf: tape.isError ? null : tape.data ? newestAll : undefined,
    note: tape.isError ? 'request failed' : bf ? `BF stream ${bf.enabled ? bf.streamState : 'not configured'}` : undefined,
    tone: tape.isError || (bf && bf.enabled && bf.streamState !== 'live') || (cs && !cs.ok) ? 'warn' : 'ok',
  });

  /* ── virtualisation ── */
  // Callback ref: the scroller mounts only once rows exist.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => setViewH(scroller.clientHeight));
    ro.observe(scroller);
    setViewH(scroller.clientHeight);
    return () => ro.disconnect();
  }, [scroller]);
  // New filter / sort → back to the top (a stale scrollTop past the end of a
  // shorter list would render only the spacer). Keyed on the inputs, not on
  // the rows, so the 15s refresh doesn't yank the operator's scroll position.
  const chipKey = [...chips].sort().join(',');
  useEffect(() => {
    if (scroller) scroller.scrollTop = 0;
    setScrollTop(0);
  }, [scroller, chipKey, src, q, days, sort.key, sort.dir]);
  const start = Math.max(0, Math.floor(scrollTop / rowH) - 20);
  const end = Math.min(sorted.length, start + Math.ceil(viewH / rowH) + 40);
  const slice = sorted.slice(start, end);

  const toggleChip = (c: ChipId) => setChips((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: k === 'symbol' || k === 'label' || k === 'type' || k === 'source' ? 1 : -1 }));

  const ratioPut = stats.calls + stats.puts > 0 ? stats.puts / (stats.calls + stats.puts) : null;
  const pcRatio = stats.calls > 0 ? stats.puts / stats.calls : null;

  return (
    <div className="of-root">
      {/* ── header stats ── */}
      <div className="of-stats">
        <div className="of-stat of-tide" title="Cumulative call vs put premium through today, from the rows below. Premium traded — NOT bull/bear: neither feed measures whether the print was bought or sold.">
          <div className="of-lbl">Premium tide <span className="of-sub qp-desk-only">today · calls vs puts</span></div>
          <Tide pts={stats.tide} />
          {/* The tide's end values equal the Puts / Calls premium beside it on a 1-day
              window — print them only when they differ (a multi-day window). */}
          {(Math.round(stats.tide.at(-1)?.c ?? 0) !== Math.round(stats.calls) || Math.round(stats.tide.at(-1)?.p ?? 0) !== Math.round(stats.puts)) && (
            <div className="of-sub"><span style={{ color: CALL }}>C {money(stats.tide.at(-1)?.c ?? 0)}</span> / <span style={{ color: PUT }}>P {money(stats.tide.at(-1)?.p ?? 0)}</span> today</div>
          )}
        </div>
        <div className="of-stat">
          <div className="of-lbl">Flow trades</div>
          <div className="of-val">{stats.n.toLocaleString()}</div>
          <div className="of-sub qp-desk-only">{tape.data?.truncated ? 'chain scan capped at 1,500' : `of ${scored.length.toLocaleString()} in window`}</div>
        </div>
        <div className="of-stat">
          <div className="of-lbl" title="Sweeps ÷ trades in the filtered set. Chain-scan sweeps are inferred ('sweep-like').">Sweep %</div>
          <div className="of-val">{stats.n ? `${((stats.sweeps / stats.n) * 100).toFixed(1)}%` : '—'}</div>
          <div className="of-sub qp-desk-only">{stats.sweeps.toLocaleString()} sweeps</div>
        </div>
        <div className="of-stat of-pc">
          <div className="of-pc-row">
            <div><div className="of-lbl">Puts</div><div className="of-val" style={{ color: PUT }}>{stats.putN.toLocaleString()}</div><div className="of-sub">{money(stats.puts)}</div></div>
            <div className="of-mid"><div className="of-lbl" title="Put premium ÷ call premium">P/C $</div><div className="of-val">{pcRatio != null ? pcRatio.toFixed(2) : '—'}</div></div>
            <div className="r"><div className="of-lbl">Calls</div><div className="of-val" style={{ color: CALL }}>{stats.callN.toLocaleString()}</div><div className="of-sub">{money(stats.calls)}</div></div>
          </div>
          <div className="of-ratio" role="img" aria-label={ratioPut != null ? `Puts ${(ratioPut * 100).toFixed(0)}% of premium` : 'no premium'}>
            {ratioPut != null && <>
              <span style={{ width: `${ratioPut * 100}%`, background: PUT }} />
              <span style={{ width: `${(1 - ratioPut) * 100}%`, background: CALL_FILL }} />
            </>}
          </div>
        </div>
      </div>

      {/* ── controls: ONE row — window, source, ticker, the primary chips, a Filters
            sheet (with an active-count badge) for the rest, and an ⓘ for the hints ── */}
      <div className="of-controls qp-row">
        <div className="of-seg" role="group" aria-label="Window">
          {[1, 2, 5].map((d) => <button key={d} type="button" className={cn(days === d && 'on')} onClick={() => setDays(d)}>{d}D</button>)}
        </div>
        <div className="of-seg" role="group" aria-label="Source">
          {([['all', 'All'], ['bullflow', `Bullflow ${bf?.rows ?? 0}`], ['chain-scan', `Chain scan ${cs?.rows ?? 0}`]] as const).map(([k, l]) =>
            <button key={k} type="button" className={cn(src === k && 'on')} onClick={() => setSrc(k)}>{l}</button>)}
        </div>
        <input className="of-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker" aria-label="Filter by ticker" />
        <div className="of-chips">
          {CHIPS.filter((c) => PRIMARY_CHIPS.includes(c.id)).map((c) => (
            <button key={c.id} type="button" className={cn('of-chip', chips.has(c.id) && 'on')} aria-pressed={chips.has(c.id)} title={c.why} onClick={() => toggleChip(c.id)}>{c.label}</button>
          ))}
        </div>
        <FilterSheet phone={phone} chips={chips} toggle={toggleChip} clear={() => setChips(new Set())} />
        <InfoSheet title="Options Flow — filters" className="of-qinfo"
          what={<>Rows are prints from the Bullflow alert stream (BF) and our own chain scan (CS). {editable && !hasTool('stock-chart') ? <>Row clicks re-point the terminal's ticker (now <b>{focus}</b>).</> : 'Row clicks re-point the terminal\'s ticker.'} Double-click opens the workup.</>}
          note={`Chips in the same family (ETFs/Stocks, Calls/Puts) combine with OR; everything else with AND. ${HIDDEN_CHIPS}`}
          source={`Bullflow ${bf?.enabled ? bf.streamState : 'not configured'} · newest ${ageLabel(bf?.newestAt, now)} · chain scan newest ${cs?.ok ? ageLabel(cs?.newestAt, now) : 'read failed'}`}
          extra={editable && !hasTool('stock-chart') ? (
            <div className="qp-sheet-actions"><button type="button" className="fd-btn" onClick={() => addTool('stock-chart')}>Add stock chart</button><span className="qp-sheet-mute">to see {focus} with flow markers</span></div>
          ) : undefined} />
      </div>

      {/* ── table ── */}
      {tape.isLoading ? (
        <QELoading rows={6} className="fd-pad" label="reading the tape…" />
      ) : tape.isError && !tape.data ? (
        <QEError className="fd-m" title="The flow tape didn't load" onRetry={() => tape.refetch()} retrying={tape.isFetching} />
      ) : (
        <>
          {/* A failed BACKGROUND refresh keeps the last good tape on screen, stamped with its age. */}
          {tape.isError && <div className="of-stale"><QEStale what="refresh the flow tape" updatedAt={tape.dataUpdatedAt} onRetry={() => tape.refetch()} retrying={tape.isFetching} /></div>}
          {cs && !cs.ok && (
            <div className="of-warn" role="alert">Chain-scan read failed — only Bullflow alerts are shown. This is a missing source, not a quiet tape.</div>
          )}
          {sorted.length === 0 ? (
            <QEEmpty className="fd-m" message={scored.length === 0
              ? `No prints in the ${days}D window yet. Bullflow stream: ${bf?.enabled ? bf.streamState : 'not configured'}; chain scan newest ${ageLabel(cs?.newestAt, now)}.`
              : 'Nothing matches these filters.'}
              action={scored.length === 0
                ? (days < 5 ? <button type="button" className="fd-btn" onClick={() => setDays(5)}>Widen to 5D</button> : undefined)
                : (chips.size > 0 || q || src !== 'all')
                  ? <button type="button" className="fd-btn" onClick={() => { setChips(new Set()); setQ(''); setSrc('all'); }}>Clear filters</button>
                  : days < 5 ? <button type="button" className="fd-btn" onClick={() => setDays(5)}>Widen to 5D</button> : undefined} />
          ) : (
            <div className="of-scroll" ref={setScroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
              <table className="of-table" style={{ width: phone ? '100%' : TABLE_W }}>
                <colgroup>{cols.map((c) => <col key={c.key} style={c.w ? { width: c.w } : undefined} />)}</colgroup>
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key} className={cn(c.r && 'r', sort.key === c.key && 'on')} title={c.title} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" onClick={() => onSort(c.key)}>{c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {start > 0 && <tr style={{ height: start * rowH }} aria-hidden><td colSpan={cols.length} /></tr>}
                  {slice.map((row) => { const { r, sig, n } = row; return phone ? (
                    <tr key={r.id} className={cn(`k-${r.kind}`, 'qp-row-tap', r.symbol === focus && 'sel')} style={{ height: rowH }}
                      onClick={() => setDetail(row)} tabIndex={0} aria-haspopup="dialog"
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(row); } }}>
                      <td className="mono dim">{etTime(r.at).slice(0, 5)}</td>
                      <td className="of-ct" title={`${r.symbol} ${r.strike} ${r.optionType === 'call' ? 'Call' : 'Put'} · exp ${r.expiry}`}>
                        <span className="of-ct-top"><span className="of-tk">{r.symbol}</span><span className="of-ct-kind dim">{r.label}</span></span>
                        <span className="of-ct-line" style={{ color: r.optionType === 'call' ? CALL : PUT }}>{r.strike}{r.optionType === 'call' ? 'C' : 'P'} {mmdd(r.expiry)}</span>
                      </td>
                      <td className="r val">{money(r.premium)}</td>
                    </tr>
                  ) : (
                    <tr key={r.id} className={cn(`k-${r.kind}`, r.symbol === focus && 'sel')} style={{ height: rowH }}
                      onClick={() => setFocus(r.symbol)} onDoubleClick={() => openWorkup(r.symbol)}
                      // keyboard: Tab reaches each row, Enter/Space focuses its ticker (same as click)
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(r.symbol); } }}
                      title="Click / Enter: focus chart · double-click: workup">
                      <td className="mono dim">{etTime(r.at)}{days > 1 && r.at ? <span className="of-d"> {r.at.slice(5, 10)}</span> : null}</td>
                      <td className="r val">{money(r.premium)}</td>
                      <td><span className="of-tk">{r.symbol}</span></td>
                      <td className="r">{r.spot != null ? r.spot.toFixed(2) : <span className="dim">—</span>}</td>
                      <td className="r">{r.strike}</td>
                      <td style={{ color: r.optionType === 'call' ? CALL : PUT }}>{r.optionType === 'call' ? 'Call' : 'Put'}</td>
                      <td>{r.expiry.slice(2)}</td>
                      <td className="lbl" title={r.label}>{r.label}</td>
                      <td className="r">{r.price != null ? r.price.toFixed(2) : <span className="dim">—</span>}</td>
                      <td className="r">{r.size != null ? r.size.toLocaleString() : <span className="dim">—</span>}</td>
                      <td className="r">{r.volOI != null ? `${r.volOI.toFixed(1)}×` : <span className="dim">—</span>}</td>
                      <td title={`${sig.total.toFixed(2)} = 0.40×size ${sig.size.toFixed(2)} + 0.20×aggr ${sig.aggression.toFixed(2)} + 0.20×repeat ${sig.repeat.toFixed(2)} (n=${n}) + 0.20×vol/OI ${sig.volOI == null ? 'n/a→0' : sig.volOI.toFixed(2)}\n\n${SIG_FORMULA_TEXT}`}>
                        <div className="of-sig"><span style={{ width: `${sig.total * 100}%` }} /></div>
                        <span className="of-sig-n">{sig.total.toFixed(2)}</span>
                      </td>
                      <td className="dim">{r.source === 'bullflow' ? 'BF' : 'CS'}</td>
                    </tr>
                  ); })}
                  {end < sorted.length && <tr style={{ height: (sorted.length - end) * rowH }} aria-hidden><td colSpan={cols.length} /></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="of-legend">
            <span><i className="k-sweep" />Sweep</span><span><i className="k-block" />Block / Grenade</span><span><i className="k-repeater" />Repeater</span><span><i className="k-unusual" />Unusual</span>
            <span className="dim qp-desk-only">· BF newest {ageLabel(bf?.newestAt, now)} · CS newest {cs?.ok ? ageLabel(cs?.newestAt, now) : 'read failed'} · side (bid/ask) not measured</span>
          </div>
        </>
      )}
      {detail && <PrintSheet row={detail} now={now} onClose={() => setDetail(null)} onFocus={() => { setFocus(detail.r.symbol); setDetail(null); }} />}
    </div>
  );
}

/** Every non-primary chip, grouped; a popover on desktop, a bottom sheet on phones. */
function FilterSheet({ phone, chips, toggle, clear }: { phone: boolean; chips: Set<ChipId>; toggle: (c: ChipId) => void; clear: () => void }) {
  const [open, setOpen] = useState(false);
  const more = CHIPS.filter((c) => !PRIMARY_CHIPS.includes(c.id));
  const activeMore = more.filter((c) => chips.has(c.id)).length;
  const body = (
    <div className="of-fsheet">
      <div className="of-fsheet-chips">
        {more.map((c) => (
          <button key={c.id} type="button" className={cn('of-chip', chips.has(c.id) && 'on')} aria-pressed={chips.has(c.id)} title={c.why} onClick={() => toggle(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="of-fsheet-foot">
        <span className="qp-sheet-mute">{chips.size ? `${chips.size} filter${chips.size === 1 ? '' : 's'} on` : 'No filters on'}</span>
        {chips.size > 0 && <button type="button" className="of-chip clear" onClick={clear}>Clear all</button>}
      </div>
    </div>
  );
  const btn = (
    <button type="button" className={cn('of-chip of-fbtn', activeMore > 0 && 'on')} aria-haspopup="dialog" onClick={() => setOpen(true)}
      title={activeMore ? `${activeMore} more filter${activeMore === 1 ? '' : 's'} on` : 'More filters'}
      aria-label={activeMore ? `Filters, ${activeMore} more on` : 'Filters'}>
      <SlidersHorizontal size={12} aria-hidden /> Filters{activeMore > 0 && <span className="of-fbadge">{activeMore}</span>}
    </button>
  );
  if (!phone) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>{btn}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="qp-pop of-fpop" side="bottom" align="start" sideOffset={6} collisionPadding={12} aria-label="Flow filters">
            <div className="qp-pop-title">Filters</div>
            {body}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return (
    <>
      {btn}
      <QEDrawer open={open} onClose={() => setOpen(false)} title="Flow filters" side="bottom" className="qp-sheet">{body}</QEDrawer>
    </>
  );
}

/** Phone row sheet: every column the phone table leaves out, plus the row's actions. */
function PrintSheet({ row, now, onClose, onFocus }: { row: Scored; now: number; onClose: () => void; onFocus: () => void }) {
  const { r, sig, n } = row;
  const kv: Array<[string, string]> = [
    ['Time ET', `${etTime(r.at)}${r.at ? ` · ${r.at.slice(5, 10)} · ${ageLabel(r.at, now)}` : ''}`],
    ['Value', money(r.premium)],
    ['Contract', `${r.symbol} ${r.strike} ${r.optionType === 'call' ? 'Call' : 'Put'} · exp ${r.expiry}`],
    ['Spot', r.spot != null ? r.spot.toFixed(2) : '— (Bullflow alerts do not carry it)'],
    ['Type', r.label],
    ['Price', r.price != null ? r.price.toFixed(2) : '—'],
    ['Size', r.size != null ? r.size.toLocaleString() : '—'],
    ['Vol/OI', r.volOI != null ? `${r.volOI.toFixed(1)}×` : '— (chain scan only)'],
    ['SigScore', `${sig.total.toFixed(2)} = 0.40×size ${sig.size.toFixed(2)} + 0.20×aggr ${sig.aggression.toFixed(2)} + 0.20×repeat ${sig.repeat.toFixed(2)} (n=${n}) + 0.20×vol/OI ${sig.volOI == null ? 'n/a→0' : sig.volOI.toFixed(2)}`],
    ['Source', r.source === 'bullflow' ? 'Bullflow alert' : 'our chain scan'],
  ];
  return (
    <QEDrawer open onClose={onClose} title={`${r.symbol} ${r.strike}${r.optionType === 'call' ? 'C' : 'P'} · ${money(r.premium)}`} side="bottom" className="qp-sheet">
      <dl className="qp-sheet-dl">{kv.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
      <div className="qp-sheet-actions">
        <button type="button" className="fd-btn primary" onClick={onFocus}>Focus {r.symbol}</button>
        <button type="button" className="fd-btn" onClick={() => { onClose(); openWorkup(r.symbol); }}>Open workup</button>
      </div>
      <p className="qp-sheet-mute">Side (bid/ask) is not measured by either feed — premium traded, not bull/bear.</p>
    </QEDrawer>
  );
}

function Tide({ pts }: { pts: { t: number; c: number; p: number }[] }) {
  const W = 160, H = 34;
  if (pts.length < 2) return <svg className="of-tide-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden><line x1="0" x2={W} y1={H - 1} y2={H - 1} stroke="var(--text-mute)" strokeDasharray="2 3" /></svg>;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const hi = Math.max(...pts.map((p) => Math.max(p.c, p.p)), 1);
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (v: number) => H - 1 - (v / hi) * (H - 3);
  const d = (k: 'c' | 'p') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  return (
    <svg className="of-tide-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative call and put premium today">
      <path d={d('c')} fill="none" stroke={CALL_FILL} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={d('p')} fill="none" stroke={PUT} strokeWidth="1.5" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
