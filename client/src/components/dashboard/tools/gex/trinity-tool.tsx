/**
 * GEX TRINITY — SPY · QQQ · IWM dealer maps side by side (optional SPX), one
 * shared expiry horizon, and an AGREEMENT strip that says in one line whether
 * the three agree on regime / flip side / walls (shared/gex-trinity.ts — the
 * same function the /trinity Ask Quantinum command uses).
 *
 * Data: GET /api/gex-vex/terminal/:symbol?horizon= (the engine's per-horizon
 * walls / zero-γ / max-γ; the ladder is the strike × expiry matrix summed per
 * strike inside the horizon, shared/gex-horizon.ts nodesForHorizon). Every
 * card stamps its own chain age. Tapping an index re-points the dashboard
 * focus symbol, so every other GEX tool / the chart follows it.
 *
 * Desktop: three columns. Phone: a compact agreement header, then the cards
 * as a horizontal swipe strip (scroll-snap) — nothing hidden.
 * Colours: LEVEL_COLORS / exposure law (gex-colors.ts), never gain/loss.
 */
import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { useQueries } from '@tanstack/react-query';
import { GEX_HORIZONS, nodesForHorizon, type GexHorizon } from '@shared/gex-horizon';
import { TRINITY_SYMBOLS, ladderWindow, trinityAgreement, type TrinityInput, type TrinityRead, type LadderNode } from '@shared/gex-trinity';
import type { GammaRegime } from '@shared/gex-regime';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { Term } from '@/components/onboarding/term';
import { LEVEL_COLORS, exposureVar, exposureText, fmtAge, fmtGexB, fmtVexM, regimeColor } from '@/components/gex/gex-colors';
import { terminalAsOf, TERMINAL_TIMEOUT_MS, type TerminalData } from '@/components/gex/gex-model';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFocusSymbol, useNow, useToolReport, useToolSetting } from '../../frame';
import './trinity-tool.css';

type Metric = 'gex' | 'vex';
type HorizonTerminal = TerminalData & {
  horizon?: GexHorizon;
  horizonView?: { callWall: number | null; putWall: number | null; zeroGamma: number | null; maxGammaStrike: number | null; totalGEX: number | null; source: string; note: string; lastExpiry: string | null };
};

const HZ_SHORT: Record<GexHorizon, string> = { today: 'Today', week: 'This week', opex: 'To OPEX', all: 'All' };
const LADDER_ROWS = 15;

async function fetchTerminal(symbol: string, horizon: GexHorizon, signal?: AbortSignal): Promise<HorizonTerminal> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctl.abort(), TERMINAL_TIMEOUT_MS);
  try {
    const r = await fetch(`/api/gex-vex/terminal/${encodeURIComponent(symbol)}?interval=15m&lookback=1&horizon=${horizon}`, { credentials: 'include', signal: ctl.signal });
    if (!r.ok) throw new Error(`${symbol} dealer map: HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (ctl.signal.aborted && !signal?.aborted) throw new Error(`${symbol} chain read timed out after ${TERMINAL_TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Engine levels for the horizon → the agreement input. */
export function trinityInputOf(symbol: string, t: HorizonTerminal | undefined, horizon: GexHorizon): TrinityInput {
  const s = t?.snapshot;
  const hv = horizon !== 'all' ? t?.horizonView : undefined;
  return {
    symbol,
    spot: s?.spotPrice ?? null,
    flip: hv ? hv.zeroGamma : s ? (s.zeroGammaLevel ?? s.gammaFlipPrice ?? null) : null,
    callWall: hv ? hv.callWall : s?.callWall ?? null,
    putWall: hv ? hv.putWall : s?.putWall ?? null,
    maxGamma: hv ? hv.maxGammaStrike : s?.maxGammaStrike ?? null,
    netGex: hv ? hv.totalGEX : s?.totalGEX ?? null,
    // The engine's regime word describes the ALL-expiry book; a horizon's regime is its own net sign.
    regime: hv ? null : (s?.regimeRead?.regime ?? s?.regime ?? null),
  };
}

const toGammaRegime = (r: TrinityRead['regime']): GammaRegime | null => (r === 'long' ? 'positive' : r === 'short' ? 'negative' : r === 'neutral' ? 'neutral' : null);
const REGIME_LABEL: Record<TrinityRead['regime'], string> = { long: 'Long γ', short: 'Short γ', neutral: 'Neutral γ', unknown: 'γ —' };
const sgnPct = (v: number | null, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`);
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v >= 1000 ? v.toFixed(0) : v.toFixed(2).replace(/\.00$/, ''));

export function GexTrinityTool() {
  const narrow = useIsMobile();
  const [focus, setFocus] = useFocusSymbol();
  const [horizon, setHorizon] = useToolSetting<GexHorizon>('horizon', 'today');
  const [metric, setMetric] = useToolSetting<Metric>('metric', 'gex');
  const [withSpx, setWithSpx] = useToolSetting<boolean>('spx', false);
  const now = useNow(15_000);
  const symbols = useMemo(() => (withSpx ? [...TRINITY_SYMBOLS, 'SPX'] : [...TRINITY_SYMBOLS]), [withSpx]);

  const qs = useQueries({
    queries: symbols.map((sym) => ({
      queryKey: ['/api/gex-vex/terminal', sym, 'trinity', horizon],
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchTerminal(sym, horizon, signal),
      staleTime: 60_000, refetchInterval: 120_000, retry: 1, retryDelay: 3_000,
    })),
  });

  const inputs = symbols.map((s, i) => trinityInputOf(s, qs[i].data, horizon));
  const trio = inputs.slice(0, TRINITY_SYMBOLS.length).filter((_, i) => qs[i].data);
  const agree = trinityAgreement(trio);
  const readOf = (sym: string) => agree.reads.find((r) => r.symbol === sym) ?? trinityAgreement([inputs[symbols.indexOf(sym)]]).reads[0];

  const ages = qs.map((q) => terminalAsOf(q.data)).filter((x): x is string => !!x);
  const oldest = ages.length ? ages.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b)) : null;
  const failed = qs.filter((q) => q.isError && !q.data).length;
  useToolReport({
    asOf: oldest,
    source: `GEX engine · ${HZ_SHORT[horizon]} horizon · ${symbols.join(' ')}`,
    note: failed ? `${failed} index read${failed > 1 ? 's' : ''} failed` : 'oldest of the reads',
    tone: failed ? 'warn' : 'ok',
  });

  const loadingAll = qs.every((q) => q.isLoading);

  return (
    <div className={`gx-tool gx-col trin${narrow ? ' trin-phone' : ''}`}>
      <div className="gx-controls trin-controls">
        <div className="of-seg" role="group" aria-label="Expiry horizon">
          {GEX_HORIZONS.map((h) => (
            <button key={h} type="button" className={h === horizon ? 'on' : ''} aria-pressed={h === horizon} onClick={() => setHorizon(h)}>{HZ_SHORT[h]}</button>
          ))}
        </div>
        <div className="of-seg" role="group" aria-label="Exposure">
          <button type="button" className={metric === 'gex' ? 'on' : ''} aria-pressed={metric === 'gex'} onClick={() => setMetric('gex')}>GEX</button>
          <button type="button" className={metric === 'vex' ? 'on' : ''} aria-pressed={metric === 'vex'} onClick={() => setMetric('vex')}>VEX</button>
        </div>
        <div className="of-seg" role="group" aria-label="SPX row">
          <button type="button" className={withSpx ? 'on' : ''} aria-pressed={withSpx} onClick={() => setWithSpx(!withSpx)} title="Add SPX (reference only — not part of the agreement read)">+SPX</button>
        </div>
      </div>

      <AgreementStrip agree={agree} loading={loadingAll} narrow={narrow} onPick={setFocus} />

      <div className={`trin-grid trin-n${symbols.length}`} data-testid="trinity-grid">
        {symbols.map((sym, i) => {
          const q = qs[i];
          return (
            <IndexCard
              key={sym} symbol={sym} q={q} horizon={horizon} metric={metric} now={now}
              read={q.data ? readOf(sym) : null} input={inputs[i]} focused={focus === sym}
              reference={sym === 'SPX'} onFocus={() => setFocus(sym)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AgreementStrip({ agree, loading, narrow, onPick }: { agree: ReturnType<typeof trinityAgreement>; loading: boolean; narrow: boolean; onPick: (s: string) => void }) {
  if (loading) return <div className="trin-agree"><span className="trin-verdict">Reading SPY · QQQ · IWM…</span></div>;
  const tone = agree.regime === 'all-long' && agree.flips === 'all-above' ? 'long' : agree.regime === 'all-short' && agree.flips === 'all-below' ? 'short' : 'mixed';
  const toneColor = tone === 'long' ? regimeColor('positive') : tone === 'short' ? regimeColor('negative') : LEVEL_COLORS.zeroGamma;
  return (
    <div className="trin-agree" data-testid="trinity-agreement" aria-live="polite">
      <span className="trin-verdict" style={{ color: toneColor, borderColor: toneColor }}>{agree.verdict}</span>
      {narrow && (
        <span className="trin-pills">
          {agree.reads.map((r) => (
            <button key={r.symbol} type="button" className="trin-pill" onClick={() => onPick(r.symbol)} style={{ color: regimeColor(toGammaRegime(r.regime), r.side === 'on') }}>
              {r.symbol} {r.side === 'above' ? '▲' : r.side === 'below' ? '▼' : r.side === 'on' ? '◆' : '·'}
            </button>
          ))}
        </span>
      )}
      <span className="trin-sentence">{agree.sentence}</span>
      <span className="trin-terms">
        {agree.terms.map((k) => <Term key={k} k={k} force="chip" />)}
      </span>
    </div>
  );
}

interface CardProps {
  symbol: string; q: { data?: HorizonTerminal; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; isFetching: boolean };
  horizon: GexHorizon; metric: Metric; now: number; read: TrinityRead | null; input: TrinityInput; focused: boolean; reference: boolean; onFocus: () => void;
}

function IndexCard({ symbol, q, horizon, metric, now, read, input, focused, reference, onFocus }: CardProps) {
  const t = q.data;
  const nodes = useMemo<LadderNode[]>(() => (t?.strikeExpiryMatrix ? nodesForHorizon(t.strikeExpiryMatrix, horizon, now) : []), [t, horizon, now]);
  const win = useMemo(() => ladderWindow(nodes, input.spot, LADDER_ROWS), [nodes, input.spot]);

  if (q.isLoading) return <section className="trin-card"><header className="trin-head"><b>{symbol}</b></header><QELoading rows={5} className="fd-pad" label={`reading ${symbol} chain…`} /></section>;
  if (q.isError && !t) return <section className="trin-card"><header className="trin-head"><b>{symbol}</b></header><QEError className="fd-m" title={`${symbol} didn't load`} message={q.error instanceof Error ? q.error.message : String(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} /></section>;
  if (!t || !read) return null;

  const asOf = terminalAsOf(t);
  const ageSec = asOf ? (now - Date.parse(asOf)) / 1000 : null;
  const regimeC = regimeColor(toGammaRegime(read.regime), read.side === 'on');
  // A payload without a horizon view (older server / cached) is the all-expiry book — labelled as such.
  const hvTotal = horizon !== 'all' && t.horizonView ? t.horizonView.totalGEX : undefined;
  const total = hvTotal !== undefined ? hvTotal : t.snapshot.totalGEX;
  const totalScope = hvTotal !== undefined || horizon === 'all' ? '' : ' (all exp.)';
  const hvNote = horizon !== 'all' && t.horizonView && t.horizonView.source !== 'engine-byHorizon' ? t.horizonView.note : null;

  return (
    <section
      className={`trin-card${focused ? ' on' : ''}${reference ? ' ref' : ''}`} role="button" tabIndex={0}
      aria-label={`${symbol}: focus every GEX tool on ${symbol}`} aria-pressed={focused}
      onClick={onFocus} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus(); } }}
      data-testid={`trinity-card-${symbol}`}
    >
      <header className="trin-head">
        <b className="trin-sym">{symbol}</b>
        <span className="trin-spot">{px(input.spot)}</span>
        <span className="trin-chip" style={{ color: regimeC, borderColor: regimeC }}>{REGIME_LABEL[read.regime]}{read.side === 'on' ? ' · at flip' : ''}</span>
        <span className="trin-age" title={asOf ? `chain read ${asOf}${t.cached ? ' (cached)' : ''}` : 'no timestamp'}>{t.cached ? 'cached · ' : ''}{fmtAge(ageSec)} ago</span>
      </header>
      <div className="trin-stats">
        <span><i style={{ background: LEVEL_COLORS.zeroGamma }} />flip {px(input.flip)} <b>{read.flipDistPct == null ? '—' : `${sgnPct(read.flipDistPct)} ${read.side === 'below' ? 'under' : read.side === 'on' ? 'on' : 'over'}`}</b></span>
        <span><i style={{ background: LEVEL_COLORS.callWall }} />CW {px(input.callWall)} <em>{sgnPct(read.callWallDistPct)}</em></span>
        <span><i style={{ background: LEVEL_COLORS.putWall }} />PW {px(input.putWall)} <em>{sgnPct(read.putWallDistPct)}</em></span>
        <span><i style={{ background: LEVEL_COLORS.magnet }} />Apex {px(input.maxGamma)}</span>
        <span>net <b style={{ color: exposureText('gex', total ?? 0) }}>{fmtGexB(total)}/1%</b>{totalScope}</span>
      </div>
      {hvNote && <div className="trin-note">{hvNote}</div>}
      <Ladder rows={win} metric={metric} input={input} />
      {reference && <div className="trin-note">Reference only — not in the agreement read.</div>}
    </section>
  );
}

function Ladder({ rows, metric, input }: { rows: LadderNode[]; metric: Metric; input: TrinityInput }) {
  if (!rows.length) return <div className="trin-note trin-empty">No contracts in this horizon near spot.</div>;
  const desc = [...rows].reverse();
  const val = (n: LadderNode) => (metric === 'gex' ? n.gex : n.vex);
  const max = Math.max(...rows.map((n) => Math.abs(val(n))), 1e-12);
  const apex = rows.reduce((m, n) => (Math.abs(val(n)) > Math.abs(val(m)) ? n : m), rows[0]);
  const near = (a: number | null | undefined, k: number, step: number) => a != null && Number.isFinite(a) && Math.abs(a - k) < step / 2;
  const step = rows.length > 1 ? Math.max(1e-9, Math.min(...rows.slice(1).map((n, i) => n.strike - rows[i].strike))) : 1;
  const spot = input.spot ?? NaN;
  const out: ReactElement[] = [];
  let spotDrawn = false;
  desc.forEach((n, i) => {
    if (!spotDrawn && n.strike < spot) {
      spotDrawn = true;
      out.push(<div key="spot" className="trin-spotline" style={{ borderColor: LEVEL_COLORS.spot }}><span>spot {px(spot)}</span></div>);
    }
    const v = val(n);
    const w = Math.min(50, (Math.abs(v) / max) * 50);
    const tags: Array<[string, string]> = [];
    if (near(input.callWall, n.strike, step)) tags.push(['CW', LEVEL_COLORS.callWall]);
    if (near(input.putWall, n.strike, step)) tags.push(['PW', LEVEL_COLORS.putWall]);
    if (near(input.flip, n.strike, step)) tags.push(['flip', LEVEL_COLORS.zeroGamma]);
    if (near(input.maxGamma, n.strike, step) || (metric === 'gex' && n === apex && input.maxGamma == null)) tags.push(['apex', LEVEL_COLORS.magnet]);
    out.push(
      <div key={n.strike} className="trin-row" title={`${n.strike}: GEX ${fmtGexB(n.gex)}/1% · VEX ${fmtVexM(n.vex)}/IV pt`}>
        <span className="trin-k">{px(n.strike)}</span>
        <span className="trin-bar">
          <span className="trin-mid" />
          <span className="trin-fill" style={{ background: exposureVar(metric, v), width: `${w}%`, [v >= 0 ? 'left' : 'right']: '50%' } as CSSProperties} />
        </span>
        <span className="trin-tags">{tags.map(([l, c]) => <em key={l} style={{ color: c, borderColor: c }}>{l}</em>)}</span>
      </div>,
    );
    if (i === desc.length - 1 && !spotDrawn) out.push(<div key="spot" className="trin-spotline" style={{ borderColor: LEVEL_COLORS.spot }}><span>spot {px(spot)}</span></div>);
  });
  return (
    <div className="trin-ladder" aria-label={`${metric.toUpperCase()} by strike around spot`}>
      {out}
      <div className="trin-legend">{metric === 'gex' ? '+ provides liquidity · − takes liquidity' : '+VEX dealers buy as IV rises · −VEX sell'}</div>
    </div>
  );
}
