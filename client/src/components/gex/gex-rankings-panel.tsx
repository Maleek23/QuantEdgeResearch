/**
 * GEX / VEX CROSS-TICKER RANKINGS — reads /api/gex-vex/rankings, which a
 * server job fills from CBOE delayed chains on a cadence. Four views:
 *
 *   MAGNET SQUEEZE  near-expiry call gamma 0–5% above spot with volume > OI
 *   −VEX            most negative VEX (dealers sell as IV rises)
 *   LOWEST GEX+     option-originated liquidity being taken
 *   PINS            highest |GEX| concentration within 2.5% of spot
 *
 * Every row shows its own age; stale rows are dimmed and say so. Clicking a
 * row hands the ticker back to the hub's existing single-ticker view.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { exposureBg, exposureText, fmtAge, fmtSignedUsd } from './gex-colors';

type View = 'magnet' | 'negVex' | 'lowGexPlus' | 'pins';

interface Magnet { strike: number; distPct: number; callGEX: number; share: number; callVolume: number; callOI: number; volOI: number; score: number }
interface RankRow {
  symbol: string; spot: number; changePct: number | null; iv30: number | null;
  netGEX: number; netVEX: number; gexPlus: number; grossGEX: number;
  regime: 'positive' | 'negative' | 'neutral';
  nearExpiries: string[];
  topStrike: number | null; topStrikeGEX: number | null; topStrikeShare: number | null; topStrikeDistPct: number | null;
  topStrikeVolume: number | null; topStrikeOI: number | null; topStrikeVolOI: number | null;
  callWall: number | null; putWall: number | null;
  magnet: Magnet | null; pinScore: number | null;
  quoteTime: string | null; fetchedAt: string; ageSec: number; stale: boolean;
}
interface Payload {
  generatedAt: string;
  rows: RankRow[];
  views: Record<View, string[]>;
  units: { gex: string; vex: string; gexPlus: string };
  signConvention: 'naive-oi';
  signConventionNote: string;
  dataSource: string;
  cycle: { inProgress: boolean; startedAt: string | null; finishedAt: string | null; attempted: number; succeeded: number; failed: number; rateLimited: number; aborted: string | null; nextRunAt: string | null };
  universe: { total: number; sources: Record<string, number> };
  persisted: { loadedFromDisk: boolean; savedAt: string | null };
}

const VIEWS: Array<{ id: View; label: string; blurb: string }> = [
  { id: 'magnet', label: 'Magnet squeeze', blurb: 'Near-expiry call gamma 0–5% above spot where today\'s volume exceeds open interest — fresh positioning pulling price into the strike (the BE 300C pattern).' },
  { id: 'negVex', label: '−VEX', blurb: 'Most negative VEX: dealers must SELL as implied vol rises. Vol-up selloffs feed on themselves — crash fuel.' },
  { id: 'lowGexPlus', label: 'Lowest GEX+', blurb: 'GEX + VEX most negative: option hedging is taking liquidity on both the price and the vol axis.' },
  { id: 'pins', label: 'Pins', blurb: 'Largest share of near-expiry |GEX| sitting on one strike within 2.5% of spot — where price tends to stick into expiry.' },
];

type SortKey = 'rank' | 'symbol' | 'spot' | 'netGEX' | 'netVEX' | 'gexPlus' | 'strike' | 'volOI' | 'age';

const mono = "'JetBrains Mono',monospace";

export function GexRankingsPanel({ onPick }: { onPick: (symbol: string) => void }) {
  const [view, setView] = useState<View>('magnet');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 });

  const { data, isLoading, isError, refetch } = useQuery<Payload>({
    queryKey: ['/api/gex-vex/rankings'],
    queryFn: async () => {
      const r = await fetch('/api/gex-vex/rankings?limit=40', { credentials: 'include' });
      if (!r.ok) throw new Error('rankings failed');
      return r.json();
    },
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });

  const bySym = useMemo(() => new Map((data?.rows ?? []).map((r) => [r.symbol, r])), [data]);

  /** The view's strike read: magnet strike for MAGNET, the top |GEX| strike otherwise. */
  const strikeOf = (r: RankRow) => view === 'magnet' && r.magnet
    ? { strike: r.magnet.strike, dist: r.magnet.distPct, share: r.magnet.share, volOI: r.magnet.volOI, vol: r.magnet.callVolume, oi: r.magnet.callOI, calls: true }
    : { strike: r.topStrike, dist: r.topStrikeDistPct, share: r.topStrikeShare, volOI: r.topStrikeVolOI, vol: r.topStrikeVolume, oi: r.topStrikeOI, calls: false };

  const rows = useMemo(() => {
    const ordered = (data?.views?.[view] ?? []).map((s) => bySym.get(s)).filter((r): r is RankRow => !!r);
    const withRank = ordered.map((r, i) => ({ r, rank: i + 1 }));
    if (sort.key === 'rank') return sort.dir === 1 ? withRank : [...withRank].reverse();
    const val = ({ r }: { r: RankRow }): number | string => {
      switch (sort.key) {
        case 'symbol': return r.symbol;
        case 'spot': return r.changePct ?? 0;
        case 'netGEX': return r.netGEX;
        case 'netVEX': return r.netVEX;
        case 'gexPlus': return r.gexPlus;
        case 'strike': return strikeOf(r).share ?? 0;
        case 'volOI': return strikeOf(r).volOI ?? 0;
        case 'age': return r.ageSec;
        default: return 0;
      }
    };
    return [...withRank].sort((a, b) => {
      const va = val(a); const vb = val(b);
      return (typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, sort, bySym]);

  const maxOf = (f: (r: RankRow) => number) => Math.max(1, ...rows.map(({ r }) => Math.abs(f(r))));
  const maxG = maxOf((r) => r.netGEX); const maxV = maxOf((r) => r.netVEX); const maxP = maxOf((r) => r.gexPlus);

  const th = (key: SortKey, label: string, title?: string, align: 'left' | 'right' = 'right') => (
    <th
      key={key} title={title} style={{ textAlign: align }}
      aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : (key === 'symbol' || key === 'rank' || key === 'age' ? 1 : -1) }))}
    >
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const cyc = data?.cycle;
  const activeView = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="gexrank">
      <div className="gexrank-explain">
        <b>How to read it ·</b> Options are the market's implied order book. When dealers are long gamma (<span style={{ color: 'var(--cyan-bright)' }}>+GEX</span>) their hedging buys dips and sells rips — liquidity is <i>provided</i>; short gamma (<span style={{ color: 'var(--red)' }}>−GEX</span>) makes them chase the move — liquidity is <i>taken</i>.
        VEX is the same idea on the vol axis: <span style={{ color: 'var(--red)' }}>−VEX</span> means dealers sell as IV rises, the fuel behind sustained vol events; <span style={{ color: 'var(--green)' }}>+VEX</span> means they buy.
        GEX+ = GEX + VEX is total option-originated liquidity — below zero, hedging takes more than it gives. High IV pushes GEX toward zero, letting other flows dominate.
        <span className="src"> After SqueezeMetrics, “GEX Ed.” (2020).</span>
      </div>

      <div className="gexrank-legend" aria-label="Colour legend">
        <span><i style={{ background: 'var(--cyan)' }} />+GEX provides liquidity</span>
        <span><i style={{ background: 'var(--red)' }} />−GEX takes liquidity</span>
        <span><i style={{ background: 'var(--green)' }} />+VEX provides liquidity</span>
        <span><i style={{ background: 'var(--red)' }} />⚠ −VEX takes liquidity (vol-up selling)</span>
        <span>tint strength = magnitude in this view</span>
      </div>

      <div className="gexrank-tabs" role="tablist" aria-label="Rank view">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={`filter-chip${view === v.id ? ' active' : ''}`} onClick={() => { setView(v.id); setSort({ key: 'rank', dir: 1 }); }} title={v.blurb}>
            {v.label} <span className="n">·{data?.views?.[v.id]?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="gexrank-blurb">{activeView.blurb}</div>

      {isLoading ? (
        <div className="gexrank-empty">reading the rankings…</div>
      ) : isError ? (
        <div className="gexrank-empty">rankings unavailable · <button onClick={() => refetch()}>retry</button></div>
      ) : !rows.length ? (
        <div className="gexrank-empty">
          {cyc?.inProgress
            ? `First sweep running — ${cyc.succeeded}/${cyc.attempted} chains read so far.`
            : (data?.rows?.length ?? 0) === 0
              ? `No ranking yet${cyc?.nextRunAt ? ` · first sweep at ${new Date(cyc.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}${cyc?.aborted ? ` · last cycle: ${cyc.aborted}` : ''}`
              : 'No ticker qualifies for this view right now — that is a measurement, not missing data.'}
        </div>
      ) : (
        <div className="gexrank-scroll">
          <table className="gexrank-table">
            <thead>
              <tr>
                {th('rank', '#', 'Rank in this view', 'left')}
                {th('symbol', 'Ticker', undefined, 'left')}
                {th('spot', 'Spot', 'Spot (CBOE delayed) · day change')}
                {th('netGEX', 'GEX', data?.units.gex)}
                {th('netVEX', 'VEX', data?.units.vex)}
                {th('gexPlus', 'GEX+', data?.units.gexPlus)}
                {th('strike', view === 'magnet' ? 'Magnet strike' : 'Top strike', view === 'magnet' ? 'Call strike 0–5% above spot with the most call gamma being opened today · distance · share of near-expiry gross |GEX|' : 'Largest |net GEX| strike across the two nearest expiries · distance · share of near-expiry |GEX| (concentration)')}
                {th('volOI', 'Vol/OI', 'Today\'s volume ÷ open interest at that strike (calls only for the magnet view). > 1× = positions being opened today.')}
                <th style={{ textAlign: 'left' }} title="Net GEX sign across all listed expiries; neutral when |net| < 5% of gross">Regime</th>
                {th('age', 'Age', 'Time since this chain was fetched. The job refreshes every 10 min in cash hours; rows keep their own age.')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, rank }) => {
                const k = strikeOf(r);
                return (
                  <tr key={r.symbol} className={r.stale ? 'stale' : undefined} onClick={() => onPick(r.symbol)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') onPick(r.symbol); }}
                    title={`Open ${r.symbol} in the dealer map${r.stale ? ' · STALE row' : ''}`}>
                    <td className="num" style={{ textAlign: 'left', color: 'var(--text-mute)' }}>{rank}</td>
                    <td className="sym">{r.symbol}</td>
                    <td className="num">
                      ${r.spot >= 100 ? r.spot.toFixed(1) : r.spot.toFixed(2)}
                      {r.changePct != null && <span className="sub" style={{ color: r.changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>{r.changePct >= 0 ? '+' : '−'}{Math.abs(r.changePct).toFixed(1)}%</span>}
                    </td>
                    <td className="num" style={{ color: exposureText('gex', r.netGEX), background: exposureBg('gex', r.netGEX, maxG) }}>{fmtSignedUsd(r.netGEX)}</td>
                    <td className="num" style={{ color: exposureText('vex', r.netVEX), background: exposureBg('vex', r.netVEX, maxV) }}>{r.netVEX < 0 ? '⚠ ' : ''}{fmtSignedUsd(r.netVEX)}</td>
                    <td className="num" style={{ color: exposureText('gexPlus', r.gexPlus), background: exposureBg('gexPlus', r.gexPlus, maxP) }}>{fmtSignedUsd(r.gexPlus)}</td>
                    <td className="num">
                      {k.strike != null ? `$${k.strike}` : '—'}
                      {k.dist != null && <span className="sub">{k.dist >= 0 ? '+' : '−'}{Math.abs(k.dist).toFixed(1)}%</span>}
                      {k.share != null && <span className="sub">{(k.share * 100).toFixed(0)}% of γ</span>}
                    </td>
                    <td className="num" style={{ color: (k.volOI ?? 0) > 1 ? 'var(--amber)' : undefined }} title={k.vol != null ? `${k.vol.toLocaleString()} vol / ${k.oi?.toLocaleString() ?? '—'} OI${k.calls ? ' (calls)' : ''}` : undefined}>
                      {k.volOI != null ? `${k.volOI.toFixed(1)}×` : '—'}
                    </td>
                    <td style={{ fontFamily: mono, fontSize: 'var(--fs-10, 10px)', color: exposureText('gex', r.regime === 'positive' ? 1 : r.regime === 'negative' ? -1 : 0) }}>
                      {r.regime === 'positive' ? '+γ provides' : r.regime === 'negative' ? '−γ takes' : '±γ neutral'}
                    </td>
                    <td className="num" style={{ color: r.stale ? 'var(--amber)' : 'var(--text-mute)' }} title={`fetched ${new Date(r.fetchedAt).toLocaleString()}${r.quoteTime ? ` · CBOE quote ${new Date(r.quoteTime).toLocaleTimeString()}` : ''}`}>
                      {fmtAge(r.ageSec)}{r.stale ? ' stale' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="gexrank-foot">
        <div>
          <b>Sign is an assumption ·</b> {data?.signConventionNote ?? 'naive-oi: calls +, puts −; dealer-directional OI is not available.'}
        </div>
        <div>
          <b>Units ·</b> GEX {data?.units.gex ?? '$ per 1% move'} · VEX {data?.units.vex ?? '$ per 1 IV point'} · GEX+ {data?.units.gexPlus ?? 'GEX + VEX'}.
        </div>
        <div>
          <b>Source ·</b> {data?.dataSource ?? 'CBOE delayed'}
          {data && <> · universe {data.universe.total} ({Object.entries(data.universe.sources).map(([k, v]) => `${k} ${v}`).join(', ')})</>}
          {cyc && <> · last sweep {cyc.finishedAt ? `${cyc.succeeded}/${cyc.attempted} ok, finished ${new Date(cyc.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : cyc.inProgress ? `running ${cyc.succeeded}/${cyc.attempted}` : 'not yet run'}</>}
          {cyc?.rateLimited ? <span style={{ color: 'var(--amber)' }}> · {cyc.rateLimited} rate-limited</span> : null}
          {cyc?.aborted && <span style={{ color: 'var(--amber)' }}> · {cyc.aborted}</span>}
          {data?.persisted.loadedFromDisk && <span> · restored from disk (rows keep their own age)</span>}
          {cyc?.nextRunAt && !cyc.inProgress && <> · next {new Date(cyc.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
        </div>
        <div>Educational only · levels, not entries.</div>
      </div>
    </div>
  );
}

export default GexRankingsPanel;
