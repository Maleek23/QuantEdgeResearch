/**
 * RotationMatrix — the 18-layer × 6-stage cycle visualization.
 *
 *   Each row = a layer (Compute, Memory, Power, CPO, SaaS, etc.)
 *   Each col = a cycle stage (pre / early / mid / late / topped / rolling)
 *   Cell is rendered in the column matching the layer's current stage,
 *   with metrics (breadth, 20d return, broadening spread).
 *
 *   Click a layer name → drill-in drawer with top movers + full ticker list.
 *
 * This is the answer to "where in the rotation is each AI-cycle layer?"
 */
import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  QECard,
  QEStat,
  QEStatStrip,
  QEPill,
  QEBar,
  QEDrawer,
  type QEPillVariant,
} from '@/components/ui/qe';
import type { LayerCycle, LayerCycleResponse, CycleStage } from '../../../../shared/layer-types';

const STAGE_ORDER: CycleStage[] = ['pre', 'early', 'mid', 'late', 'topped', 'rolling'];

const STAGE_VARIANT: Record<CycleStage, QEPillVariant> = {
  pre:     'default',
  early:   'cyan',
  mid:     'bull',
  late:    'gold',
  topped:  'warn',
  rolling: 'bear',
  unknown: 'default',
};

const STAGE_LABEL: Record<CycleStage, string> = {
  pre:     'Pre',
  early:   'Early',
  mid:     'Mid',
  late:    'Late',
  topped:  'Topped',
  rolling: 'Rolling',
  unknown: '—',
};

const DERIV_LABEL: Record<1 | 2 | 3, string> = {
  1: 'D1 · The AI itself',
  2: 'D2 · What AI consumes',
  3: 'D3 · Apps using AI',
};

export function RotationMatrix() {
  const [, setLocation] = useLocation();
  const [drilledLayer, setDrilledLayer] = useState<LayerCycle | null>(null);
  const [filterDeriv, setFilterDeriv] = useState<1 | 2 | 3 | 'all'>('all');

  const { data, isLoading, isFetching, error, refetch } = useQuery<LayerCycleResponse>({
    queryKey: ['/api/layers'],
    queryFn: async () => {
      const res = await fetch('/api/layers', { credentials: 'include' });
      if (!res.ok) throw new Error(`layers fetch failed (${res.status})`);
      return res.json();
    },
    staleTime: 30 * 60_000,
    refetchInterval: false, // expensive — manual refresh
  });

  const layers = useMemo(() => {
    const all = data?.layers ?? [];
    return filterDeriv === 'all' ? all : all.filter(l => l.derivativeOrder === filterDeriv);
  }, [data, filterDeriv]);

  // Group by derivative-order for visual sectioning
  const groups = useMemo(() => {
    const g = new Map<1 | 2 | 3, LayerCycle[]>();
    for (const l of layers) {
      const arr = g.get(l.derivativeOrder as 1|2|3) ?? [];
      arr.push(l);
      g.set(l.derivativeOrder as 1|2|3, arr);
    }
    // Sort each group by rank
    Array.from(g.values()).forEach(arr => arr.sort((a, b) => a.rank - b.rank));
    return Array.from(g.entries()).sort(([a]: [number, LayerCycle[]], [b]: [number, LayerCycle[]]) => a - b);
  }, [layers]);

  // Top-line stats
  const stageCounts = useMemo(() => {
    const c: Record<CycleStage, number> = {
      pre: 0, early: 0, mid: 0, late: 0, topped: 0, rolling: 0, unknown: 0,
    };
    for (const l of layers) c[l.stage]++;
    return c;
  }, [layers]);

  return (
    <div className="space-y-3">
      {/* Header strip */}
      <QECard variant="default" padding="md">
        <QEStatStrip stats={[
          { label: 'EARLY',   value: stageCounts.early,   tone: 'cyan' },
          { label: 'MID',     value: stageCounts.mid,     tone: 'bull' },
          { label: 'LATE',    value: stageCounts.late,    tone: 'gold' },
          { label: 'TOPPED',  value: stageCounts.topped,  tone: 'warn' },
          { label: 'ROLLING', value: stageCounts.rolling, tone: 'bear' },
          { label: 'PRE',     value: stageCounts.pre,     tone: 'muted' },
          { label: 'TICKERS', value: data?.tickersScanned ?? '—' },
        ]} />
      </QECard>

      {/* Filters + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">
          DERIVATIVE
        </span>
        {([
          { id: 'all', label: 'All' },
          { id: 1, label: 'D1 · AI itself' },
          { id: 2, label: 'D2 · Consumes' },
          { id: 3, label: 'D3 · Uses' },
        ] as const).map(o => (
          <button
            key={String(o.id)}
            type="button"
            onClick={() => setFilterDeriv(o.id as any)}
            className={cn(
              'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded border transition-colors',
              filterDeriv === o.id
                ? 'border-[var(--brand-cyan)]/50 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10'
                : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {o.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] font-mono text-muted-foreground/60">
          {data?.asOf ? `as of ${data.asOf}` : ''}
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border hover:border-[var(--brand-cyan)]/50 text-foreground transition-colors"
          title="Re-scan (~30s for full universe)"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin text-[var(--brand-cyan)]')} />
          <span className="text-[10px] font-mono uppercase tracking-widest">
            {isFetching ? 'Scanning…' : 'Re-scan'}
          </span>
        </button>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
        </div>
      )}
      {error && (
        <QECard variant="accent-bear" padding="md" className="text-center text-[10px] font-mono text-[var(--trade-bearish)]">
          LAYER SCAN FAILED — {(error as Error).message}
        </QECard>
      )}

      {/* Matrix — by derivative-order group */}
      {!isLoading && !error && groups.map(([deriv, layersInGroup]) => (
        <div key={deriv}>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-1.5 px-1">
            {DERIV_LABEL[deriv]} · {layersInGroup.length} layers
          </div>
          <QECard variant="default" padding="none" className="overflow-hidden">
            <table className="w-full text-[10px] font-mono border-collapse">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
                  <th className="text-left px-3 py-1.5 font-medium">Layer</th>
                  {STAGE_ORDER.map(s => (
                    <th key={s} className="text-center px-2 py-1.5 font-medium" style={{ width: '90px' }}>
                      {STAGE_LABEL[s]}
                    </th>
                  ))}
                  <th className="text-right px-3 py-1.5 font-medium">Breadth</th>
                  <th className="text-right px-3 py-1.5 font-medium">20d</th>
                  <th className="text-right px-3 py-1.5 font-medium">Spread</th>
                  <th className="text-right px-3 py-1.5 font-medium">RS</th>
                </tr>
              </thead>
              <tbody>
                {layersInGroup.map(layer => (
                  <RotationRow
                    key={layer.id}
                    layer={layer}
                    onDrillIn={() => setDrilledLayer(layer)}
                  />
                ))}
              </tbody>
            </table>
          </QECard>
        </div>
      ))}

      {/* Drill-in drawer */}
      <QEDrawer
        open={!!drilledLayer}
        onClose={() => setDrilledLayer(null)}
        title={drilledLayer?.label ?? ''}
        subtitle={drilledLayer ? `D${drilledLayer.derivativeOrder} · ${drilledLayer.description}` : ''}
        size="md"
      >
        {drilledLayer && (
          <LayerDrillIn layer={drilledLayer} onJumpToTicker={(s) => { setDrilledLayer(null); setLocation(`/r/${s}`); }} />
        )}
      </QEDrawer>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

function RotationRow({ layer, onDrillIn }: { layer: LayerCycle; onDrillIn: () => void }) {
  const stageColIdx = STAGE_ORDER.indexOf(layer.stage);
  const breadthPct = layer.metrics.breadth50 * 100;
  const ret20 = layer.metrics.avgRet20d;
  const spread = layer.metrics.smallVsMegaSpread20d;
  const rs = layer.metrics.rsVsSpy60d;

  return (
    <tr
      onClick={onDrillIn}
      className="border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors"
    >
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="font-bold text-foreground">{layer.label}</div>
        <div className="text-[9px] text-muted-foreground/60 font-normal">{layer.stageReason}</div>
      </td>
      {STAGE_ORDER.map((s, i) => (
        <td key={s} className="text-center px-1 py-2">
          {i === stageColIdx ? (
            <QEPill variant={STAGE_VARIANT[s]}>●</QEPill>
          ) : (
            <span className="text-muted-foreground/60">·</span>
          )}
        </td>
      ))}
      <td className="text-right px-3 py-2 tabular-nums">
        <span className={cn(
          breadthPct >= 65 ? 'text-[var(--trade-bullish)] font-bold' :
          breadthPct >= 40 ? 'text-foreground' :
          'text-muted-foreground',
        )}>
          {breadthPct.toFixed(0)}%
        </span>
      </td>
      <td className={cn(
        'text-right px-3 py-2 tabular-nums font-bold',
        ret20 > 0 ? 'text-[var(--trade-bullish)]' : ret20 < 0 ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground',
      )}>
        {ret20 >= 0 ? '+' : ''}{ret20.toFixed(1)}%
      </td>
      <td className={cn(
        'text-right px-3 py-2 tabular-nums',
        spread > 1 ? 'text-[var(--brand-gold)] font-bold' :
        spread < -1 ? 'text-muted-foreground' :
        'text-foreground',
      )} title="Small-cap 20d return MINUS mega-cap 20d return. Positive = small-caps leading = broadening (late-cycle / rotation signal).">
        {spread >= 0 ? '+' : ''}{spread.toFixed(1)}%
      </td>
      <td className={cn(
        'text-right px-3 py-2 tabular-nums',
        rs > 0 ? 'text-[var(--brand-cyan)]' : 'text-muted-foreground',
      )}>
        {rs >= 0 ? '+' : ''}{rs.toFixed(1)}
      </td>
    </tr>
  );
}

// ─── Drill-in ────────────────────────────────────────────────────────

function LayerDrillIn({ layer, onJumpToTicker }: { layer: LayerCycle; onJumpToTicker: (s: string) => void }) {
  const m = layer.metrics;
  return (
    <div className="p-3 space-y-3">
      {/* Stage + reason */}
      <QECard variant="default" padding="md">
        <div className="flex items-center gap-2 mb-2">
          <QEPill variant={STAGE_VARIANT[layer.stage]}>{STAGE_LABEL[layer.stage].toUpperCase()}</QEPill>
          <span className="text-[10px] font-mono text-muted-foreground">{layer.stageReason}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <QEStat label="5d return"  value={`${m.avgRet5d >= 0 ? '+' : ''}${m.avgRet5d.toFixed(1)}%`} tone={m.avgRet5d >= 0 ? 'bull' : 'bear'} size="md" />
          <QEStat label="20d return" value={`${m.avgRet20d >= 0 ? '+' : ''}${m.avgRet20d.toFixed(1)}%`} tone={m.avgRet20d >= 0 ? 'bull' : 'bear'} size="md" />
          <QEStat label="60d return" value={`${m.avgRet60d >= 0 ? '+' : ''}${m.avgRet60d.toFixed(1)}%`} tone={m.avgRet60d >= 0 ? 'bull' : 'bear'} size="md" />
          <QEStat label="RS vs SPY" value={`${m.rsVsSpy60d >= 0 ? '+' : ''}${m.rsVsSpy60d.toFixed(1)}`} tone={m.rsVsSpy60d >= 0 ? 'cyan' : 'muted'} size="md" />
        </div>
      </QECard>

      {/* Breadth + spread bars */}
      <QECard variant="default" padding="md">
        <div className="space-y-2">
          <QEBar label="Breadth > 50DMA" value={m.breadth50 * 100} max={100} tone="cyan" valueRight valueUnit="%" />
          <QEBar label="Breadth > 200DMA" value={m.breadth200 * 100} max={100} tone="bull" valueRight valueUnit="%" />
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/70 mt-2 pt-2 border-t border-border/30">
          <strong className={m.smallVsMegaSpread20d > 1 ? 'text-[var(--brand-gold)]' : 'text-foreground'}>
            Small vs Mega 20d spread: {m.smallVsMegaSpread20d >= 0 ? '+' : ''}{m.smallVsMegaSpread20d.toFixed(1)}%
          </strong>
          <br />
          {m.smallVsMegaSpread20d > 1.5
            ? 'Broadening — small-caps leading mega-caps. Late-cycle / rotation signal.'
            : m.smallVsMegaSpread20d > 0
              ? 'Slight broadening — small-caps starting to participate.'
              : 'Mega-led — small-caps lagging. Early or compressed regime.'}
        </div>
      </QECard>

      {/* Top movers */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-1.5">
          Top movers ({m.tickerCount} tickers)
        </div>
        <QECard variant="default" padding="none">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-muted/20">
              <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
                <th className="text-left px-3 py-1.5">Symbol</th>
                <th className="text-left px-2 py-1.5">Cap</th>
                <th className="text-right px-2 py-1.5">Spot</th>
                <th className="text-right px-2 py-1.5">5d</th>
                <th className="text-right px-2 py-1.5">20d</th>
                <th className="text-right px-2 py-1.5">RS</th>
                <th className="text-right px-3 py-1.5">→</th>
              </tr>
            </thead>
            <tbody>
              {m.topMovers.map(t => (
                <tr
                  key={t.symbol}
                  onClick={() => onJumpToTicker(t.symbol)}
                  className="border-t border-border/20 hover:bg-muted/20 cursor-pointer"
                >
                  <td className="px-3 py-1.5 font-bold text-foreground">{t.symbol}</td>
                  <td className="px-2 py-1.5 text-muted-foreground uppercase text-[8px]">{t.cap}</td>
                  <td className="text-right px-2 py-1.5 tabular-nums text-foreground">${t.spot.toFixed(2)}</td>
                  <td className={cn('text-right px-2 py-1.5 tabular-nums', t.ret5d >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
                    {t.ret5d >= 0 ? '+' : ''}{t.ret5d.toFixed(1)}%
                  </td>
                  <td className={cn('text-right px-2 py-1.5 tabular-nums font-bold', t.ret20d >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
                    {t.ret20d >= 0 ? '+' : ''}{t.ret20d.toFixed(1)}%
                  </td>
                  <td className={cn('text-right px-2 py-1.5 tabular-nums', t.rs60d >= 0 ? 'text-[var(--brand-cyan)]' : 'text-muted-foreground')}>
                    {t.rs60d >= 0 ? '+' : ''}{t.rs60d.toFixed(1)}
                  </td>
                  <td className="text-right px-3 py-1.5 text-muted-foreground"><ArrowRight className="w-3 h-3 inline" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </QECard>
      </div>
    </div>
  );
}
