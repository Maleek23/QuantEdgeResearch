/**
 * GEX TRINITY — the GEX workspace's Strike × Expiry heatmap (GexStrikeMatrix,
 * gex-strike-grid.tsx — the SAME component the matrix tool renders, not a
 * fork) drawn for SPY | QQQ | IWM side by side (optional SPX 4th pane), under
 * one shared control row and an AGREEMENT strip (shared/gex-trinity.ts — the
 * same function the /trinity Ask Quantinum command uses).
 *
 * Shared controls: GEX/VEX · Raw/Δ-adj · expiry window (DTE bucket) · level
 * horizon (Today / week / OPEX / All — walls, flip, Apex re-read over that
 * book by the terminal endpoint) · strike range ±% around each spot. Every
 * pane gets the same ±% band auto-centred on its own spot, and the panes'
 * vertical scrollers are synced by scroll fraction, so rows line up by
 * % from spot. Tapping a pane header focuses every GEX tool on that index.
 *
 * Phone: agreement strip pinned on top, one heatmap at a time with a
 * SPY/QQQ/IWM segmented switch (swipe left/right also switches).
 * Data: GET /api/gex-vex/terminal/:symbol?horizon= (one query per index).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useQueries } from '@tanstack/react-query';
import { GEX_HORIZONS, type GexHorizon } from '@shared/gex-horizon';
import { TRINITY_SYMBOLS, trinityAgreement, type TrinityInput, type TrinityRead } from '@shared/gex-trinity';
import type { GammaRegime } from '@shared/gex-regime';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { Term } from '@/components/onboarding/term';
import { GexStrikeMatrix } from '@/components/gex/gex-strike-grid';
import { GammaViewSeg } from '@/components/gex/gex-parts';
import { LEVEL_COLORS, fmtAge, regimeColor } from '@/components/gex/gex-colors';
import {
  DTE_BUCKETS, type BucketId, type GammaView, terminalAsOf, TERMINAL_TIMEOUT_MS, type TerminalData,
  shapeMatrix, gridLevelsOf, gexMetricOf, hasAdjusted,
} from '@/components/gex/gex-model';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFocusSymbol, useNow, useToolReport, useToolSetting } from '../../frame';
import './trinity-tool.css';

type Metric = 'gex' | 'vex';
type HorizonTerminal = TerminalData & {
  horizon?: GexHorizon;
  horizonView?: { callWall: number | null; putWall: number | null; zeroGamma: number | null; maxGammaStrike: number | null; totalGEX: number | null; source: string; note: string; lastExpiry: string | null };
};

const HZ_SHORT: Record<GexHorizon, string> = { today: 'Today', week: 'This week', opex: 'To OPEX', all: 'All' };
export const TRINITY_RANGES = [1, 2, 3, 5, 8] as const;
type RangePct = typeof TRINITY_RANGES[number];

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

/**
 * Sync the panes' heatmap scrollers by scroll FRACTION: every pane shows the
 * same ±% band around its own spot, so equal fractions ≈ equal % from spot.
 */
function useSyncedScroll(root: RefObject<HTMLElement>, key: string) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let lock = false;
    const onScroll = (e: Event) => {
      const src = e.target as HTMLElement;
      if (lock || !src.classList?.contains('gx-scroll')) return;
      const range = src.scrollHeight - src.clientHeight;
      if (range <= 0) return;
      const f = src.scrollTop / range;
      lock = true;
      el.querySelectorAll<HTMLElement>('.gx-scroll').forEach((o) => {
        if (o !== src) { const r = o.scrollHeight - o.clientHeight; if (r > 0) o.scrollTop = f * r; }
      });
      requestAnimationFrame(() => { lock = false; });
    };
    el.addEventListener('scroll', onScroll, true);
    return () => el.removeEventListener('scroll', onScroll, true);
  }, [root, key]);
}

export function GexTrinityTool() {
  const narrow = useIsMobile();
  const [focus, setFocus] = useFocusSymbol();
  const [horizon, setHorizon] = useToolSetting<GexHorizon>('horizon', 'today');
  const [metric, setMetric] = useToolSetting<Metric>('metric', 'gex');
  const [gview, setGview] = useToolSetting<GammaView>('gammaView', 'raw');
  const [bucket, setBucket] = useToolSetting<BucketId>('bucket', narrow ? '0-7' : '0-14');
  const [range, setRange] = useToolSetting<RangePct>('range', 3);
  const [withSpx, setWithSpx] = useToolSetting<boolean>('spx', false);
  const [phonePick, setPhonePick] = useState<string>('SPY');
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
  const agree = trinityAgreement(inputs.slice(0, TRINITY_SYMBOLS.length).filter((_, i) => qs[i].data));
  const readOf = (sym: string) => agree.reads.find((r) => r.symbol === sym) ?? trinityAgreement([inputs[symbols.indexOf(sym)]]).reads[0];
  const adjOk = qs.some((q) => q.data && hasAdjusted(q.data.strikeExpiryMatrix ?? []));
  const view: GammaView = !adjOk || gview === 'both' ? 'raw' : gview;

  const ages = qs.map((q) => terminalAsOf(q.data)).filter((x): x is string => !!x);
  const oldest = ages.length ? ages.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b)) : null;
  const failed = qs.filter((q) => q.isError && !q.data).length;
  useToolReport({
    asOf: oldest,
    source: `GEX engine · ${HZ_SHORT[horizon]} levels · ${symbols.join(' ')}`,
    note: failed ? `${failed} index read${failed > 1 ? 's' : ''} failed` : 'oldest of the reads',
    tone: failed ? 'warn' : 'ok',
  });

  const gridRef = useRef<HTMLDivElement>(null);
  useSyncedScroll(gridRef, `${symbols.join()}|${metric}|${bucket}|${range}|${horizon}|${narrow}`);

  // phone: one pane at a time; swipe switches
  const pick = symbols.includes(phonePick) ? phonePick : symbols[0];
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const step = useCallback((d: number) => {
    const i = symbols.indexOf(pick);
    setPhonePick(symbols[(i + d + symbols.length) % symbols.length]);
  }, [symbols, pick]);
  const shown = narrow ? [pick] : symbols;

  return (
    <div className={`gx-tool gx-col trin${narrow ? ' trin-phone' : ''}`}>
      <div className="trin-pin">
        <AgreementStrip agree={agree} loading={qs.every((q) => q.isLoading)} />
        <div className="gx-controls trin-controls">
          {narrow && (
            <div className="of-seg trin-switch" role="tablist" aria-label="Index">
              {symbols.map((s) => <button key={s} type="button" role="tab" aria-selected={s === pick} className={s === pick ? 'on' : ''} onClick={() => setPhonePick(s)}>{s}</button>)}
            </div>
          )}
          <div className="of-seg" role="group" aria-label="Metric">
            {(['gex', 'vex'] as const).map((m) => (
              <button key={m} type="button" className={metric === m ? 'on' : ''} aria-pressed={metric === m} onClick={() => setMetric(m)}>{m.toUpperCase()}</button>
            ))}
          </div>
          {metric === 'gex' && <GammaViewSeg view={view} onChange={setGview} allowBoth={false} available={adjOk} />}
          <div className="of-seg" role="group" aria-label="Days to expiry">
            {DTE_BUCKETS.map((b) => (
              <button key={b.id} type="button" className={bucket === b.id ? 'on' : ''} aria-pressed={bucket === b.id} onClick={() => setBucket(b.id)}>{b.label}</button>
            ))}
          </div>
          <div className="of-seg" role="group" aria-label="Level horizon" title="Which expiries the walls, flip and Apex are read over">
            {GEX_HORIZONS.map((h) => (
              <button key={h} type="button" className={h === horizon ? 'on' : ''} aria-pressed={h === horizon} onClick={() => setHorizon(h)}>{HZ_SHORT[h]}</button>
            ))}
          </div>
          <div className="of-seg" role="group" aria-label="Strike range around spot">
            {TRINITY_RANGES.map((r) => (
              <button key={r} type="button" className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>±{r}%</button>
            ))}
          </div>
          <div className="of-seg" role="group" aria-label="SPX pane">
            <button type="button" className={withSpx ? 'on' : ''} aria-pressed={withSpx} onClick={() => setWithSpx(!withSpx)} title="Add SPX (reference only — not part of the agreement read)">+SPX</button>
          </div>
        </div>
      </div>

      <div
        ref={gridRef} className={`trin-grid trin-n${shown.length}`} data-testid="trinity-grid"
        onTouchStart={narrow ? (e) => { swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } : undefined}
        onTouchEnd={narrow ? (e) => {
          const s = swipe.current; swipe.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        } : undefined}
      >
        {shown.map((sym) => {
          const i = symbols.indexOf(sym);
          const q = qs[i];
          return (
            <TrinityPane
              key={sym} symbol={sym} q={q} now={now} metric={metric} view={view} bucket={bucket} range={range}
              read={q.data ? readOf(sym) : null} input={inputs[i]} focused={focus === sym}
              reference={sym === 'SPX'} onFocus={() => setFocus(sym)}
            />
          );
        })}
      </div>
    </div>
  );
}

function AgreementStrip({ agree, loading }: { agree: ReturnType<typeof trinityAgreement>; loading: boolean }) {
  if (loading) return <div className="trin-agree"><span className="trin-verdict">Reading SPY · QQQ · IWM…</span></div>;
  const tone = agree.regime === 'all-long' && agree.flips === 'all-above' ? 'long' : agree.regime === 'all-short' && agree.flips === 'all-below' ? 'short' : 'mixed';
  const toneColor = tone === 'long' ? regimeColor('positive') : tone === 'short' ? regimeColor('negative') : LEVEL_COLORS.zeroGamma;
  return (
    <div className="trin-agree" data-testid="trinity-agreement" aria-live="polite">
      <span className="trin-verdict" style={{ color: toneColor, borderColor: toneColor }}>{agree.verdict}</span>
      <span className="trin-sentence">{agree.sentence}</span>
      <span className="trin-terms">{agree.terms.map((k) => <Term key={k} k={k} force="chip" />)}</span>
    </div>
  );
}

interface PaneProps {
  symbol: string; q: { data?: HorizonTerminal; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; isFetching: boolean };
  now: number; metric: Metric; view: GammaView; bucket: BucketId; range: RangePct;
  read: TrinityRead | null; input: TrinityInput; focused: boolean; reference: boolean; onFocus: () => void;
}

function TrinityPane({ symbol, q, now, metric, view, bucket, range, read, input, focused, reference, onFocus }: PaneProps) {
  const t = q.data;
  const matrix = t?.strikeExpiryMatrix ?? [];
  const spot = t?.snapshot?.spotPrice ?? 0;
  const cellMetric = gexMetricOf(metric, view, hasAdjusted(matrix));
  const shaped = useMemo(() => shapeMatrix(matrix, bucket, spot, cellMetric), [matrix, bucket, spot, cellMetric]);
  const band = useMemo(() => (spot > 0 ? { lo: spot * (1 - range / 100), hi: spot * (1 + range / 100), pct: range, basis: `±${range}% of spot (Trinity, shared)` } : null), [spot, range]);
  const levels = useMemo(() => ({
    ...gridLevelsOf(t?.snapshot, spot, metric === 'gex' ? view : 'raw'),
    // the horizon's levels (the endpoint re-reads walls / flip / Apex over that book)
    callWall: input.callWall, putWall: input.putWall, maxGamma: input.maxGamma ?? null, zeroGamma: input.flip,
  }), [t, spot, metric, view, input.callWall, input.putWall, input.maxGamma, input.flip]);

  const head = (
    <header className="trin-head" role="button" tabIndex={0} aria-pressed={focused}
      aria-label={`${symbol}: focus every GEX tool on ${symbol}`}
      onClick={onFocus} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus(); } }}>
      <b className="trin-sym">{symbol}</b>
      <span className="trin-spot">{px(input.spot)}</span>
      {read && (() => {
        const c = regimeColor(toGammaRegime(read.regime), read.side === 'on');
        return <span className="trin-chip" style={{ color: c, borderColor: c }}>{REGIME_LABEL[read.regime]}{read.side === 'on' ? ' · at flip' : ''}</span>;
      })()}
      {read && <span className="trin-flipd" title="Distance from spot to the gamma flip">flip {px(input.flip)} <b>{sgnPct(read.flipDistPct)}</b></span>}
      <span className="trin-age" title={t ? `chain read ${terminalAsOf(t) ?? '—'}${t.cached ? ' (cached)' : ''}` : ''}>
        {t ? `${t.cached ? 'cached · ' : ''}${fmtAge((now - Date.parse(terminalAsOf(t) ?? '')) / 1000)} ago` : ''}
      </span>
    </header>
  );

  let body;
  if (q.isLoading) body = <QELoading rows={6} className="fd-pad" label={`reading ${symbol} chain…`} />;
  else if (q.isError && !t) body = <QEError className="fd-m" title={`${symbol} didn't load`} message={q.error instanceof Error ? q.error.message : String(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  else body = (
    <div className="gx-grow matrix-wrap">
      <GexStrikeMatrix
        cells={matrix}
        expiries={shaped.expiries}
        levels={levels}
        metric={cellMetric}
        centerKey={`${symbol}|trinity|${metric}|${bucket}|${range}`}
        strikeBand={band}
        spotInToolbar
        emptyText={matrix.length === 0 ? `no strike × expiry rows for ${symbol}` : `no listed cells for ${symbol} in this expiry window — pick a wider one`}
      />
    </div>
  );

  return (
    <section className={`trin-pane${focused ? ' on' : ''}${reference ? ' ref' : ''}`} data-testid={`trinity-pane-${symbol}`}>
      {head}
      {body}
      {reference && <div className="trin-note">Reference only — not in the agreement read.</div>}
    </section>
  );
}
