/**
 * GEX / VEX SCREENER — reads /api/gex-vex/rankings, which a server job fills
 * from Alpaca's indicative chain (CBOE delayed as fallback) on a cadence.
 * Four views:
 *
 *   SETUPS          magnet-detector hits (server/gex-magnet.ts) with why-lines:
 *                   near-expiry call (put) gamma 0.5–5% above (below) spot,
 *                   volume ≥ 1.5× OI, price moving toward the strike
 *   −VEX            most negative VEX (dealers sell as IV rises)
 *   LOWEST GEX+     option-originated liquidity being taken
 *   PINS            highest |GEX| concentration within 2.5% of spot
 *
 * Every row shows its own age and source; stale rows are dimmed and say so.
 * Regime words and colours come from the shared definition
 * (shared/gex-regime.ts + gex-colors.ts). Clicking a row hands the ticker back
 * to the hub's single-ticker map.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REGIME_COPY, type GammaRegime } from '@shared/gex-regime';
import { exposureBg, exposureText, fmtAge, fmtSignedUsd, regimeColor } from './gex-colors';

type View = 'setups' | 'negVex' | 'lowGexPlus' | 'pins';

interface Setup {
  symbol: string; side: 'call' | 'put'; strike: number; expiry: string | null; dte: number | null;
  distPct: number; share: number; sideRank: number; volume: number; openInterest: number; volOI: number;
  changePct: number; atmIvNear: number | null; atmIv30: number | null; ivTerm: number | null;
  premium: { bid: number | null; ask: number | null; last: number | null; mid: number | null } | null;
  score: number; why: string[];
  ageSec: number; stale: boolean; dataSource: string; spot: number;
}
interface RankRow {
  symbol: string; spot: number; changePct: number | null; iv30: number | null;
  netGEX: number; netVEX: number; gexPlus: number; grossGEX: number;
  regime: GammaRegime; nearFlip?: boolean; zeroGamma?: number | null; zeroGammaDistPct?: number | null;
  nearExpiries: string[];
  topStrike: number | null; topStrikeGEX: number | null; topStrikeShare: number | null; topStrikeDistPct: number | null;
  topStrikeVolume: number | null; topStrikeOI: number | null; topStrikeVolOI: number | null;
  callWall: number | null; putWall: number | null;
  pinScore: number | null;
  dataSource?: string; openInterestDate?: string | null;
  quoteTime: string | null; fetchedAt: string; ageSec: number; stale: boolean;
}
interface Payload {
  generatedAt: string;
  rows: RankRow[];
  views: Record<string, string[]>;
  setups?: Setup[];
  magnetRules?: { minDistPct: number; maxDistPct: number; minShare: number; maxSideRank: number; minVolOI: number; minVolume: number; minOI: number; nearMinDays: number; nearMaxDays: number };
  units: { gex: string; vex: string; gexPlus: string };
  signConvention: 'naive-oi';
  signConventionNote: string;
  dataSource: string;
  cycle: { inProgress: boolean; startedAt: string | null; finishedAt: string | null; attempted: number; succeeded: number; failed: number; rateLimited: number; aborted: string | null; nextRunAt: string | null; bySource?: Record<string, number> };
  universe: { total: number; sources: Record<string, number> };
  persisted: { loadedFromDisk: boolean; savedAt: string | null };
  alerts?: { discordConfigured: boolean; sentToday: number; ideasToday: number };
}

const VIEWS: Array<{ id: View; label: string; blurb: string }> = [
  { id: 'setups', label: 'Magnet setups', blurb: 'Near-expiry gamma concentrated just above (calls) or below (puts) spot, opened today (volume ≥ 1.5× OI), with price moving toward the strike — the BE 300C shape. Score orders them; it is not a probability.' },
  { id: 'negVex', label: '−VEX · vol-up selling', blurb: 'Most negative VEX: dealers must SELL as implied vol rises. Vol-up selloffs feed on themselves — crash fuel.' },
  { id: 'lowGexPlus', label: 'Lowest GEX+', blurb: 'GEX + VEX most negative: option hedging is taking liquidity on both the price and the vol axis.' },
  { id: 'pins', label: 'Pins', blurb: 'Largest share of near-expiry |GEX| sitting on one strike within 2.5% of spot — where price tends to stick into expiry.' },
];

type SortKey = 'rank' | 'symbol' | 'spot' | 'netGEX' | 'netVEX' | 'gexPlus' | 'zg' | 'strike' | 'volOI' | 'age';

const mono = "'JetBrains Mono',monospace";
const srcLabel = (s?: string) => (s === 'alpaca-indicative' ? 'Alpaca ind.' : s === 'cboe-delayed' ? 'CBOE delayed' : s ?? '—');

export function GexRankingsPanel({ onPick }: { onPick: (symbol: string) => void }) {
  const [view, setView] = useState<View>('setups');
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

  const rows = useMemo(() => {
    if (view === 'setups') return [];
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
        case 'zg': return r.zeroGammaDistPct ?? 0;
        case 'strike': return r.topStrikeShare ?? 0;
        case 'volOI': return r.topStrikeVolOI ?? 0;
        case 'age': return r.ageSec;
        default: return 0;
      }
    };
    return [...withRank].sort((a, b) => {
      const va = val(a); const vb = val(b);
      return (typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number)) * sort.dir;
    });
  }, [data, view, sort, bySym]);

  const setups = data?.setups ?? [];
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
  const count = (v: View) => (v === 'setups' ? setups.length : data?.views?.[v]?.length ?? 0);
  const rules = data?.magnetRules;

  const emptyNote = cyc?.inProgress
    ? `First sweep running — ${cyc.succeeded}/${cyc.attempted} chains read so far.`
    : (data?.rows?.length ?? 0) === 0
      ? `No ranking yet${cyc?.nextRunAt ? ` · next sweep at ${new Date(cyc.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}${cyc?.aborted ? ` · last cycle: ${cyc.aborted}` : ''}`
      : view === 'setups'
        ? 'No ticker meets every setup criterion right now — that is a measurement, not missing data.'
        : 'No ticker qualifies for this view right now — that is a measurement, not missing data.';

  return (
    <div className="gexrank">
      <div className="gexrank-head">
        <h3>Screener · dealer liquidity across tickers</h3>
        <p>What this shows: one options chain per ticker, read on a 10-minute cadence in cash hours, ranked on gamma (GEX, $ per 1% move) and vanna (VEX, $ per 1 IV point) — plus the magnet setups the detector finds. Every row carries its own age and source.</p>
      </div>

      <div className="gexrank-explain">
        <b>How to read it ·</b> Options are the market's implied order book. When dealers are long gamma (<span style={{ color: regimeColor('positive') }}>+GEX</span>) their hedging buys dips and sells rips — liquidity is <i>provided</i>; short gamma (<span style={{ color: regimeColor('negative') }}>−GEX</span>) makes them chase the move — liquidity is <i>taken</i>.
        VEX is the same idea on the vol axis: <span style={{ color: 'var(--red)' }}>−VEX</span> means dealers sell as IV rises, the fuel behind sustained vol events; <span style={{ color: 'var(--green)' }}>+VEX</span> means they buy.
        GEX+ = GEX + VEX is total option-originated liquidity — below zero, hedging takes more than it gives.
        <span className="src"> After SqueezeMetrics, “The Implied Order Book” (2020).</span>
      </div>

      <div className="gexrank-legend" aria-label="Colour legend">
        <span><i style={{ background: 'var(--cyan)' }} />+GEX provides liquidity</span>
        <span><i style={{ background: 'var(--red)' }} />−GEX takes liquidity</span>
        <span><i style={{ background: 'var(--green)' }} />+VEX provides liquidity</span>
        <span><i style={{ background: 'var(--red)' }} />⚠ −VEX takes liquidity (vol-up selling)</span>
        <span><i style={{ background: 'var(--amber)' }} />regime neutral / near the flip</span>
        <span>tint strength = magnitude in this view</span>
      </div>

      <div className="gexrank-tabs" role="tablist" aria-label="Screener view">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={`filter-chip${view === v.id ? ' active' : ''}`} onClick={() => { setView(v.id); setSort({ key: 'rank', dir: 1 }); }} title={v.blurb}>
            {v.label} <span className="n">·{count(v.id)}</span>
          </button>
        ))}
      </div>
      <div className="gexrank-blurb">{activeView.blurb}</div>

      {isLoading ? (
        <div className="gexrank-empty">reading the rankings…</div>
      ) : isError ? (
        <div className="gexrank-empty">rankings unavailable · <button onClick={() => refetch()}>retry</button></div>
      ) : view === 'setups' ? (
        !setups.length ? <div className="gexrank-empty">{emptyNote}</div> : (
          <div className="gexsetups">
            {setups.map((s) => {
              const c = s.side === 'call' ? 'var(--cyan)' : 'var(--red)';
              const prem = s.premium?.mid ?? s.premium?.last ?? null;
              return (
                <div key={`${s.symbol}-${s.side}-${s.strike}`} className={`gexsetup${s.stale ? ' stale' : ''}`} style={{ ['--setup-c' as string]: c }}
                  onClick={() => onPick(s.symbol)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onPick(s.symbol); }}
                  title={`Open ${s.symbol} in the near-term map${s.stale ? ' · STALE' : ''}`}>
                  <div className="gexsetup-top">
                    <span className="sym">{s.symbol}</span>
                    <span className="k">{s.strike}{s.side === 'call' ? 'C' : 'P'}{s.expiry ? ` · ${s.expiry.slice(5)}` : ''}{s.dte != null ? ` · ${s.dte.toFixed(1)}d` : ''}</span>
                    <span className="score" title="Detector score 0–100: concentration 30 + vol/OI 25 + proximity 15 + momentum 15 + IV term 10 + top strike 5. An ordering, not a probability — no validated edge yet.">{s.score}<span style={{ color: 'var(--text-mute)', fontWeight: 500 }}>/100</span></span>
                  </div>
                  <div className="gexsetup-bar" aria-hidden><b style={{ width: `${Math.max(3, Math.min(100, s.score))}%` }} /></div>
                  <ul>{s.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  <div className="gexsetup-meta">
                    <span>spot ${s.spot.toFixed(2)}</span>
                    <span>strike {s.distPct >= 0 ? '+' : '−'}{Math.abs(s.distPct).toFixed(1)}%</span>
                    <span>{(s.share * 100).toFixed(1)}% of near γ</span>
                    <span style={{ color: 'var(--amber)' }}>{s.volOI.toFixed(1)}× vol/OI</span>
                    {prem != null && <span title="Contract premium from the same chain read (mid, else last)">premium ${prem.toFixed(2)}</span>}
                    <span style={{ color: s.stale ? 'var(--amber)' : undefined }}>{srcLabel(s.dataSource)} · {fmtAge(s.ageSec)}{s.stale ? ' stale' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : !rows.length ? (
        <div className="gexrank-empty">{emptyNote}</div>
      ) : (
        <div className="gexrank-scroll">
          <table className="gexrank-table">
            <thead>
              <tr>
                {th('rank', '#', 'Rank in this view', 'left')}
                {th('symbol', 'Ticker', undefined, 'left')}
                {th('spot', 'Spot', 'Spot · day change')}
                {th('netGEX', 'GEX $/1%', `Net GEX, all listed expiries — ${data?.units.gex}`)}
                {th('netVEX', 'VEX $/IV pt', `Net VEX, all listed expiries — ${data?.units.vex}`)}
                {th('gexPlus', 'GEX+', data?.units.gexPlus)}
                {th('zg', 'Zero-γ', 'Zero-gamma level (spot-grid re-priced) and spot\'s distance from it')}
                {th('strike', 'Top strike', 'Largest |net GEX| strike across the two nearest expiries · distance · share of near-expiry |GEX| (concentration)')}
                {th('volOI', 'Vol/OI', 'Today\'s volume ÷ open interest at that strike. > 1× = positions being opened today.')}
                <th style={{ textAlign: 'left' }} title="Shared regime definition: sign of net GEX, neutral when |net| < 5% of gross; ‘near flip’ when spot is within 1% of zero-gamma">Regime</th>
                {th('age', 'Age · src', 'Time since this chain was fetched, and its source. Refreshes every 10 min in cash hours; rows keep their own age.')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, rank }) => {
                const words = REGIME_COPY[r.regime] ?? REGIME_COPY.neutral;
                return (
                  <tr key={r.symbol} className={r.stale ? 'stale' : undefined} onClick={() => onPick(r.symbol)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') onPick(r.symbol); }}
                    title={`Open ${r.symbol} in the near-term map${r.stale ? ' · STALE row' : ''}`}>
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
                      {r.zeroGamma != null ? `$${r.zeroGamma.toFixed(r.zeroGamma >= 100 ? 1 : 2)}` : '—'}
                      {r.zeroGammaDistPct != null && <span className="sub">spot {r.zeroGammaDistPct >= 0 ? '+' : '−'}{Math.abs(r.zeroGammaDistPct).toFixed(1)}%</span>}
                    </td>
                    <td className="num">
                      {r.topStrike != null ? `$${r.topStrike}` : '—'}
                      {r.topStrikeDistPct != null && <span className="sub">{r.topStrikeDistPct >= 0 ? '+' : '−'}{Math.abs(r.topStrikeDistPct).toFixed(1)}%</span>}
                      {r.topStrikeShare != null && <span className="sub">{(r.topStrikeShare * 100).toFixed(0)}% of γ</span>}
                    </td>
                    <td className="num" style={{ color: (r.topStrikeVolOI ?? 0) > 1 ? 'var(--amber)' : undefined }} title={r.topStrikeVolume != null ? `${r.topStrikeVolume.toLocaleString()} vol / ${r.topStrikeOI?.toLocaleString() ?? '—'} OI` : undefined}>
                      {r.topStrikeVolOI != null ? `${r.topStrikeVolOI.toFixed(1)}×` : '—'}
                    </td>
                    <td style={{ fontFamily: mono, fontSize: 'var(--fs-10, 10px)', color: regimeColor(r.regime, r.nearFlip) }} title={words.posture}>
                      {words.glyph} {words.title.replace(' gamma', '')}{r.nearFlip ? ' · near flip' : ''}
                    </td>
                    <td className="num" style={{ color: r.stale ? 'var(--amber)' : 'var(--text-mute)' }} title={`fetched ${new Date(r.fetchedAt).toLocaleString()}${r.quoteTime ? ` · provider stamp ${new Date(r.quoteTime).toLocaleTimeString()}` : ''}${r.openInterestDate ? ` · OI as of ${r.openInterestDate}` : ''}`}>
                      {fmtAge(r.ageSec)}{r.stale ? ' stale' : ''}
                      <span className="sub">{srcLabel(r.dataSource)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="gexrank-foot">
        {rules && (
          <div>
            <b>Setup criteria (all required) ·</b> expiry {rules.nearMinDays}–{rules.nearMaxDays} days out · strike {rules.minDistPct}–{rules.maxDistPct}% beyond spot · ≥ {(rules.minShare * 100).toFixed(0)}% of near-expiry gamma and a top-{rules.maxSideRank} strike · volume ≥ {rules.minVolOI}× OI (≥ {rules.minVolume} contracts, OI ≥ {rules.minOI}) · price moving toward the strike today. IV term is scored, not required.
          </div>
        )}
        <div>
          <b>Sign is an assumption ·</b> {data?.signConventionNote ?? 'naive-oi: calls +, puts −; dealer-directional OI is not available.'}
        </div>
        <div>
          <b>Units ·</b> GEX {data?.units.gex ?? '$ per 1% move'} · VEX {data?.units.vex ?? '$ per 1 IV point'} · GEX+ {data?.units.gexPlus ?? 'GEX + VEX'}. Scope: all listed expiries.
        </div>
        <div>
          <b>Source ·</b> {data?.dataSource ?? '—'}
          {data && <> · universe {data.universe.total} ({Object.entries(data.universe.sources).map(([k, v]) => `${k} ${v}`).join(', ')})</>}
          {cyc?.bySource && Object.keys(cyc.bySource).length > 0 && <> · last sweep by source {Object.entries(cyc.bySource).map(([k, v]) => `${srcLabel(k)} ${v}`).join(', ')}</>}
          {cyc && <> · {cyc.finishedAt ? `${cyc.succeeded}/${cyc.attempted} ok, finished ${new Date(cyc.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : cyc.inProgress ? `running ${cyc.succeeded}/${cyc.attempted}` : 'not yet run'}</>}
          {cyc?.rateLimited ? <span style={{ color: 'var(--amber)' }}> · {cyc.rateLimited} rate-limited</span> : null}
          {cyc?.aborted && <span style={{ color: 'var(--amber)' }}> · {cyc.aborted}</span>}
          {data?.persisted.loadedFromDisk && <span> · restored from disk (rows keep their own age)</span>}
          {cyc?.nextRunAt && !cyc.inProgress && <> · next {new Date(cyc.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
          {data?.alerts && <> · alerts {data.alerts.discordConfigured ? `on (${data.alerts.sentToday} today)` : 'off'} · ideas today {data.alerts.ideasToday}</>}
        </div>
        <div>Educational only · levels, not entries · the setup score has no validated edge yet.</div>
      </div>
    </div>
  );
}

export default GexRankingsPanel;
