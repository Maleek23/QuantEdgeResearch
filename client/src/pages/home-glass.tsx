/**
 * GLASS REFERENCE — kept deliberately unrouted. Read this before deleting it.
 *
 * This is NOT the home page. Home is the Terminal (/t → ORACLE): regime, rotation
 * map, session brief, early rotation, the live signal board and the signal card.
 * Three separate files each described themselves as the dashboard — this one,
 * pages/home.tsx ("Command Center"), and the Terminal — which is how the router
 * drifted in the first place. The owner settled it: the Terminal is home.
 *
 * This file survives as the canonical reference implementation of the glass design
 * language — every primitive in @/components/ui/qe, exercised against live
 * endpoints (market-pulse, convictions, sector-rotation) rather than mock data.
 * That makes it the thing to read when restyling any other surface, which is worth
 * more than the page ever was. It is unrouted, so it costs nothing in the bundle.
 *
 * Delete it only if the glass language is abandoned — not because it looks orphaned.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { GlassCard, GlassKpi, GlassSignal, FlowChip, GlassMicroLabel, glassMesh } from '@/components/ui/qe';
import { convictionPercent, directionTone, tierLabel, type ConvictionPick } from '@/lib/convictions';

const cyan = '#22d3ee';
const bull = 'var(--trade-bullish)';
const bear = 'var(--trade-bearish)';
const gold = 'var(--trade-neutral)';

interface Pulse { marketColor?: string; macro?: { vix?: number; yield10Y?: number; btc?: { price?: number } }; regime?: { label?: string }; breadth?: { pctAbove50DMA?: number }; }
interface Rotation { spyChange?: number; sessionLabel?: string; isStale?: boolean; leaders?: { name: string; change: number }[]; laggards?: { name: string; change: number }[]; }

export default function HomeGlass() {
  const [, navigate] = useLocation();
  const { data: pulse } = useQuery<Pulse>({ queryKey: ['market-pulse'], queryFn: async () => (await fetch('/api/market-pulse')).json(), refetchInterval: 60_000, staleTime: 30_000 });
  const { data: conv } = useQuery<{ picks: ConvictionPick[] }>({ queryKey: ['/api/convictions', 'glass'], queryFn: async () => (await fetch('/api/convictions?limit=12&minScore=10', { credentials: 'include' })).json(), refetchInterval: 60_000, staleTime: 30_000 });
  const { data: rot } = useQuery<Rotation>({ queryKey: ['/api/sector-rotation'], queryFn: async () => (await fetch('/api/sector-rotation', { credentials: 'include' })).json(), refetchInterval: 120_000, staleTime: 60_000 });

  const picks = conv?.picks ?? [];
  const longs = picks.filter((p) => p.direction === 'long').length;
  const avg = picks.length ? Math.round(picks.reduce((s, p) => s + convictionPercent(p.convictionScore), 0) / picks.length) : 0;
  const top = picks.length ? Math.max(...picks.map((p) => convictionPercent(p.convictionScore))) : 0;
  const topLeader = rot?.leaders?.[0]?.name;
  const spyUp = (rot?.spyChange ?? 0) >= 0;

  return (
    <div className="min-h-screen text-foreground" style={glassMesh}>
      <div className="max-w-[1500px] mx-auto px-5 py-5">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: bull, boxShadow: `0 0 8px ${bull}` }} />
              <GlassMicroLabel>Live · {rot?.sessionLabel ?? 'Market'}{rot?.isStale ? ' · stale' : ''}</GlassMicroLabel>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {topLeader
                ? <><span style={{ color: cyan }}>Money</span> is rotating into {topLeader}</>
                : <><span style={{ color: cyan }}>Market</span> pulse</>}
            </h1>
          </div>
          <div className="flex gap-2">
            {[['VIX', pulse?.macro?.vix?.toFixed(1)], ['10Y', pulse?.macro?.yield10Y ? `${pulse.macro.yield10Y.toFixed(2)}%` : '—'], ['BTC', pulse?.macro?.btc?.price ? `$${(pulse.macro.btc.price / 1000).toFixed(1)}k` : '—']].map(([l, v]) => (
              <GlassCard key={l} className="px-2.5 py-1.5">
                <GlassMicroLabel>{l}</GlassMicroLabel>
                <div className="text-xs font-mono tabular-nums">{v ?? '—'}</div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* KPI strip — dense */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
          <GlassKpi label="Active" value={String(picks.length)} sub={`${longs}L · ${picks.length - longs}S`} />
          <GlassKpi label="Avg Conf" value={avg ? `${avg}%` : '—'} color={bull} />
          <GlassKpi label="Top Conf" value={top ? `${top}%` : '—'} color={bull} />
          <GlassKpi label="Regime" value={pulse?.regime?.label?.replace('_', ' ') ?? '—'} color={gold} />
          <GlassKpi label="Breadth" value={pulse?.breadth?.pctAbove50DMA != null ? `${pulse.breadth.pctAbove50DMA}%` : '—'} sub="above 50DMA" color={cyan} />
          <GlassKpi label="Mkt" value={pulse?.marketColor ?? '—'} color={pulse?.marketColor === 'GREEN' ? bull : pulse?.marketColor === 'RED' ? bear : gold} />
        </div>

        {/* Money flow */}
        <GlassCard className="px-3 py-2 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <GlassMicroLabel>Money Flow</GlassMicroLabel>
            {rot?.laggards?.length ? <span className="text-[9px] font-mono" style={{ color: bear }}>OUT</span> : null}
            {(rot?.laggards ?? []).slice(0, 3).map((s) => <FlowChip key={s.name} name={s.name} pct={s.change} />)}
            {rot?.leaders?.length ? <span className="text-muted-foreground">→</span> : null}
            {rot?.leaders?.length ? <span className="text-[9px] font-mono" style={{ color: bull }}>INTO</span> : null}
            {(rot?.leaders ?? []).slice(0, 3).map((s) => <FlowChip key={s.name} name={s.name} pct={s.change} />)}
            <span className="ml-auto text-[11px] font-mono tabular-nums" style={{ color: spyUp ? bull : bear }}>SPY {spyUp ? '+' : ''}{(rot?.spyChange ?? 0).toFixed(2)}%</span>
          </div>
        </GlassCard>

        {/* Signal board */}
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold tracking-tight"><span style={{ color: cyan }}>Active</span> Signals</h2>
          <GlassMicroLabel>Ranked · best setups</GlassMicroLabel>
        </div>
        {picks.length === 0 ? (
          <GlassCard className="px-4 py-8 text-center text-xs font-mono text-muted-foreground/60">No active signals clear the floor right now.</GlassCard>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {picks.map((p) => {
              const isBull = directionTone(p.direction) === 'bull';
              return (
                <GlassSignal
                  key={p.ideaId}
                  symbol={p.symbol}
                  isBull={isBull}
                  conf={convictionPercent(p.convictionScore)}
                  tag={`${tierLabel(p)} · ${p.riskRewardRatio?.toFixed(1) ?? '—'}R`}
                  onClick={() => navigate(`/r/${p.symbol}`)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
